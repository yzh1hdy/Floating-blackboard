using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace _01
{
    // 触摸反馈类型枚举
    internal enum FEEDBACK_TYPE
    {
        FEEDBACK_TOUCH_CONTACTVISUALIZATION = 1,
        FEEDBACK_TOUCH_TAP = 2,
        FEEDBACK_TOUCH_DOUBLETAP = 3,
        FEEDBACK_TOUCH_PRESSANDHOLD = 4,
        FEEDBACK_TOUCH_RIGHTTAP = 5,
        FEEDBACK_PEN_BARRELVISUALIZATION = 6,
        FEEDBACK_PEN_TAP = 7,
        FEEDBACK_PEN_DOUBLETAP = 8,
        FEEDBACK_PEN_PRESSANDHOLD = 9,
        FEEDBACK_PEN_RIGHTTAP = 10,
        FEEDBACK_TOUCH_DRAG = 11,
        FEEDBACK_PEN_DRAG = 12,
    }

    public partial class FloatTimerForm : Form
    {
        private readonly string imgExpand;
        private readonly string imgTrayIcon;
        private readonly string configPath;

        private WebView2 webView;
        private Form webLayer;
        private WebView2 animationWebView;
        private Form animationLayer;
        private bool animationReady;
        private TaskCompletionSource<bool>? animationInitializedSignal;
        private TaskCompletionSource<bool>? screenshotReadySignal;
        private bool transitionInProgress;
        private bool hasWhiteboardScreenshot;
        private string? lastWhiteboardScreenshotPath;
        private NotifyIcon trayIcon;
        private PictureBox btnToggle;
        private Form btnForm;
        private bool expanded = false;
        private readonly Point btnPos;
        private readonly Size btnSize;

        private readonly System.Windows.Forms.Timer topMostTimer;
        private readonly System.Windows.Forms.Timer focusCheckTimer;
        private CoreWebView2Environment _webViewEnvironment;

        private static bool _isRestarting = false;
        public static bool IsRestarting => _isRestarting;

        private bool _isSettingZOrder = false;
        private DateTime _lastTopMostTime = DateTime.MinValue;
        private readonly object _zOrderLock = new object();

        // 鼠标穿透（透明模式）状态：开启时跳过抢焦点逻辑，避免破坏穿透点击
        private bool _passthroughActive;

        // 鼠标穿透相关：工具栏豁免区（屏幕坐标）、命中测试常量与子类化回调
        private const int WM_NCHITTEST = 0x0084;
        private const int HTTRANSPARENT = -1;
        private Rectangle _toolbarScreenRect;
        private Form? _toolbarInputOverlay;
        private static FloatTimerForm? _passthroughOwner;
        // 鼠标穿透开启前记录的下层前台窗口，穿透开启后把焦点交还给它
        private IntPtr _previousForegroundWindow = IntPtr.Zero;
        private readonly List<IntPtr> _subclassedWindows = new List<IntPtr>();
        private readonly WndSubclassProc _passthroughSubclassProc = PassthroughSubclassProc;

        #region 性能模式相关字段
        // 性能模式状态
        private bool _performanceMode = true;
        private ToolStripMenuItem _performanceModeMenuItem;

        // 内存保活相关
        private readonly List<byte[]> _memoryHolders = new List<byte[]>();
        private readonly object _memoryLock = new object();
        private System.Windows.Forms.Timer _memoryKeepAliveTimer;
        private System.Windows.Forms.Timer _memoryMonitorTimer;
        private PerformanceCounter _availableMemoryCounter;

        // 原始优先级备份
        private ProcessPriorityClass _originalPriorityClass;
        #endregion

        public FloatTimerForm()
        {
            #region 1. 主窗口：0x0 + 透明 + 穿透 + ToolWindow
            AutoScaleMode = AutoScaleMode.None;
            InitializeComponent();
            Text = "FloatBtn";
            FormBorderStyle = FormBorderStyle.None;
            ShowInTaskbar = false;
            TopMost = true;
            BackColor = Color.Magenta;
            TransparencyKey = Color.Magenta;
            StartPosition = FormStartPosition.Manual;
            ClientSize = new Size(0, 0);
            SetWindowLong(this.Handle, GWL_EXSTYLE,
                GetWindowLong(this.Handle, GWL_EXSTYLE) | WS_EX_LAYERED | WS_EX_TRANSPARENT);
            SetToolWindow(this.Handle);
            #endregion

            #region 2. 图片路径和配置路径
            bool isFullHd = Screen.PrimaryScreen.Bounds.Width == 1920 &&
                            Screen.PrimaryScreen.Bounds.Height == 1080;
            btnSize = isFullHd ? new Size(100, 40) : new Size(400, 160);
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            imgExpand = Path.Combine(baseDir, isFullHd ? "expand-small.png" : "expand.png");
            imgTrayIcon = Path.Combine(baseDir, "tray-icon.ico");
            configPath = Path.Combine(baseDir, "config.json");
            #endregion

            var scr = Screen.PrimaryScreen.WorkingArea;
            btnPos = new Point(scr.Left, scr.Bottom - btnSize.Height - 30);

            #region 3. 按钮窗口：普通 TopMost + Region 镂空，可点击穿透
            btnForm = new Form
            {
                Size = btnSize,
                Location = btnPos,
                FormBorderStyle = FormBorderStyle.None,
                TopMost = true,
                ShowInTaskbar = false,
                Text = "",
                BackColor = Color.Black,
                StartPosition = FormStartPosition.Manual
            };
            SetToolWindow(btnForm.Handle);

            btnToggle = new PictureBox
            {
                Image = Image.FromFile(imgExpand),
                SizeMode = PictureBoxSizeMode.AutoSize,
                BackColor = Color.Transparent,
                Cursor = Cursors.Hand,
                Location = Point.Empty
            };
            btnToggle.Click += (_, _) => Toggle();

            btnForm.Controls.Add(btnToggle);
            SetButtonRegion(btnForm, (Bitmap)btnToggle.Image);
            btnForm.Show();
            #endregion

            #region 4. 预初始化WebView2环境
            _ = InitializeWebViewEnvironmentAsync();
            #endregion

            #region 5. 置顶定时器（加强版）
            topMostTimer = new System.Windows.Forms.Timer { Interval = 50 };
            topMostTimer.Tick += (_, _) =>
            {
                lock (_zOrderLock)
                {
                    if (_isSettingZOrder) return;

                    if (webLayer != null && !webLayer.IsDisposed && webLayer.Visible)
                    {
                        if ((DateTime.Now - _lastTopMostTime).TotalMilliseconds > 500)
                        {
                            _lastTopMostTime = DateTime.Now;
                            ForceWebLayerTopMost();
                        }
                    }

                    // 只有当btnForm可见时才保持置顶
                    if (btnForm != null && !btnForm.IsDisposed && btnForm.Visible)
                    {
                        SetWindowPos(btnForm.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
                    }
                }
            };
            topMostTimer.Start();
            #endregion

            #region 6. 焦点检查定时器
            focusCheckTimer = new System.Windows.Forms.Timer { Interval = 100 };
            focusCheckTimer.Tick += (_, _) =>
            {
                // 鼠标穿透模式下不抢焦点，保证点击能穿透到下层窗��
                if (_passthroughActive) return;

                if (webLayer != null && !webLayer.IsDisposed && webLayer.Visible)
                {
                    IntPtr fgWindow = GetForegroundWindow();
                    if (fgWindow != webLayer.Handle && fgWindow != btnForm.Handle && fgWindow != this.Handle)
                    {
                        GetCursorPos(out POINT cursorPos);
                        Rectangle webLayerRect = new Rectangle(webLayer.Location, webLayer.Size);
                        if (webLayerRect.Contains(cursorPos.X, cursorPos.Y))
                        {
                            ForceWindowToFront(webLayer.Handle);
                        }
                    }
                }
            };
            focusCheckTimer.Start();
            #endregion

            #region 7. 设置程序基础优先级（非性能模式时也会设置）
            try
            {
                using (Process p = Process.GetCurrentProcess())
                {
                    _originalPriorityClass = p.PriorityClass;
                    p.PriorityClass = ProcessPriorityClass.High;
                    p.ProcessorAffinity = (IntPtr)((1 << Environment.ProcessorCount) - 1);
                }
            }
            catch { }
            #endregion

            #region 8. 加载配置并初���化托盘菜单
            LoadConfig();
            InitializeTrayIcon();
            #endregion

            #region 9. 窗口激活事件
            this.Activated += FloatTimerForm_Activated;
            #endregion

            #region 10. 性能模式初始化
            InitializePerformanceMode();
            #endregion

            // 移除启动完成通知
            // ShowBalloonTip("Interactive Blackboard", "白板启动成功，可在托盘中操作");

            _ = AutoToggleWebViewAsync();
        }

        private async Task AutoToggleWebViewAsync()//自动开关白板
        {
            await Task.Delay(3500);

            if (IsDisposed || expanded)
            {
                return;
            }

            Toggle();

            await Task.Delay(800);

            if (!IsDisposed && expanded)
            {
                Toggle();
            }
        }

        #region 配置管理
        private void LoadConfig()
        {
            try
            {
                if (File.Exists(configPath))
                {
                    string json = File.ReadAllText(configPath);
                    var config = JsonSerializer.Deserialize<AppConfig>(json);
                    if (config != null)
                    {
                        _performanceMode = config.PerformanceMode;
                    }
                }
                else
                {
                    // 默认开启性能模式
                    _performanceMode = true;
                    SaveConfig();
                }
            }
            catch
            {
                _performanceMode = true;
            }
        }

        private void SaveConfig()
        {
            try
            {
                var config = new AppConfig { PerformanceMode = _performanceMode };
                string json = JsonSerializer.Serialize(config, new JsonSerializerOptions { WriteIndented = true });
                File.WriteAllText(configPath, json);
            }
            catch { }
        }

        private class AppConfig
        {
            public bool PerformanceMode { get; set; } = true;
        }
        #endregion

        #region 托盘菜单初始化
        private void InitializeTrayIcon()
        {
            trayIcon = new NotifyIcon
            {
                Text = $"F.T.F-白板 {(_performanceMode ? "[性能模式]" : "[标准模式]")}",
                Visible = true
            };

            try
            {
                if (File.Exists(imgTrayIcon))
                {
                    using (var icon = new Icon(imgTrayIcon))
                    {
                        trayIcon.Icon = new Icon(icon, 16, 16);
                    }
                }
                else if (File.Exists(imgExpand))
                {
                    using (var bmp = new Bitmap(imgExpand))
                    {
                        trayIcon.Icon = Icon.FromHandle(bmp.GetHicon());
                    }
                }
                else
                {
                    trayIcon.Icon = SystemIcons.Application;
                }
            }
            catch
            {
                trayIcon.Icon = SystemIcons.Application;
            }

            var menu = new ContextMenuStrip();

            // 性能模式开关（带勾选标记）
            _performanceModeMenuItem = new ToolStripMenuItem("性能模式", null, TogglePerformanceMode)
            {
                Checked = _performanceMode,
                ToolTipText = "开启后程序将预留内存并设置高优先级，防止卡顿"
            };
            menu.Items.Add(_performanceModeMenuItem);
            menu.Items.Add("-");

            // 立即优化按钮（仅在性能模式下可用）
            var optimizeItem = new ToolStripMenuItem("立即内存优化", null, (_, _) => EmergencyReleaseMemory())
            {
                Enabled = _performanceMode,
                ToolTipText = "释放预留的内存给系统"
            };
            menu.Items.Add(optimizeItem);
            menu.Items.Add("-");

            menu.Items.Add("重启程序", null, (_, _) => RestartApplication());
            menu.Items.Add("-");
            menu.Items.Add("退出程序", null, (_, _) => { trayIcon.Visible = false; Application.Exit(); });

            trayIcon.ContextMenuStrip = menu;

            // 双击托盘图标切换性能模式
            trayIcon.DoubleClick += (_, _) => TogglePerformanceMode(null, EventArgs.Empty);
        }
        #endregion

        #region 性能模式开关
        private void TogglePerformanceMode(object sender, EventArgs e)
        {
            _performanceMode = !_performanceMode;
            _performanceModeMenuItem.Checked = _performanceMode;
            trayIcon.Text = $"F.T.F-白板 {(_performanceMode ? "[性能模式]" : "[标准模式]")}";

            SaveConfig();

            if (_performanceMode)
            {
                EnablePerformanceMode();
                ShowBalloonTip("性能模式已开启", "程序将预留内存并设置高优先级以防止卡顿");
            }
            else
            {
                DisablePerformanceMode();
                ShowBalloonTip("性能模式已关闭", "程序已恢复标准资源占用");
            }

            // 更新菜单状态
            if (trayIcon.ContextMenuStrip?.Items[1] is ToolStripMenuItem optimizeItem)
            {
                optimizeItem.Enabled = _performanceMode;
            }
        }

        private void InitializePerformanceMode()
        {
            if (_performanceMode)
            {
                EnablePerformanceMode();
            }
        }

        private void EnablePerformanceMode()
        {
            try
            {
                // 1. 设置实时优先级
                using (Process p = Process.GetCurrentProcess())
                {
                    p.PriorityClass = ProcessPriorityClass.RealTime;
                }
                SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_TIME_CRITICAL);

                // 2. ��用电源节流
                DisablePowerThrottling();

                // 3. 预分配内存
                PreallocateMemory();

                // 4. 启动内存保活
                InitializeMemoryKeepAlive();

                // 5. 启动内存监控
                InitializeMemoryMonitor();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"启用性能模式失败: {ex.Message}");
            }
        }

        private void DisablePerformanceMode()
        {
            try
            {
                // 1. 恢复优先级
                using (Process p = Process.GetCurrentProcess())
                {
                    p.PriorityClass = ProcessPriorityClass.High; // 保持High而不是Normal，确保基本流畅
                }
                SetThreadPriority(GetCurrentThread(), THREAD_PRIORITY_HIGHEST);

                // 2. 释放预留内存
                EmergencyReleaseMemory();

                // 3. 停止定时器
                _memoryKeepAliveTimer?.Stop();
                _memoryKeepAliveTimer?.Dispose();
                _memoryKeepAliveTimer = null;

                _memoryMonitorTimer?.Stop();
                _memoryMonitorTimer?.Dispose();
                _memoryMonitorTimer = null;

                _availableMemoryCounter?.Dispose();
                _availableMemoryCounter = null;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"关闭性能模式失败: {ex.Message}");
            }
        }

        private void ShowBalloonTip(string title, string text)
        {
            trayIcon?.ShowBalloonTip(3000, title, text, ToolTipIcon.Info);
        }
        #endregion

        #region 内存预分配与保活
        private void PreallocateMemory()
        {
            try
            {
                lock (_memoryLock)
                {
                    // 清理旧内存
                    _memoryHolders.Clear();

                    // 根据系统总内存动态调整预留大小
                    var pc = new Microsoft.VisualBasic.Devices.ComputerInfo();
                    ulong totalMemory = pc.TotalPhysicalMemory;
                    ulong reserveSize = totalMemory < 4UL * 1024 * 1024 * 1024  // 小于4GB
                        ? 128UL * 1024 * 1024   // 预留 128MB
                        : 256UL * 1024 * 1024;  // 否则预留 256MB

                    // 分块分配，避免大对象堆碎片
                    const int blockSize = 64 * 1024 * 1024; // 64MB 每块
                    int blocks = (int)(reserveSize / (ulong)blockSize);

                    for (int i = 0; i < blocks; i++)
                    {
                        try
                        {
                            var block = new byte[blockSize];
                            // 写入数据确保物理内存分配（不只是虚拟地址）
                            new Random().NextBytes(block);
                            _memoryHolders.Add(block);
                        }
                        catch (OutOfMemoryException)
                        {
                            break; // 系统确实紧张，停止预分配
                        }
                    }

                    Debug.WriteLine($"内存预分配完成: {_memoryHolders.Count * blockSize / 1024 / 1024}MB");
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"内存预分配失败: {ex.Message}");
            }
        }

        private void InitializeMemoryKeepAlive()
        {
            _memoryKeepAliveTimer?.Dispose();
            _memoryKeepAliveTimer = new System.Windows.Forms.Timer { Interval = 30000 }; // 30秒

            long accessCounter = 0;
            _memoryKeepAliveTimer.Tick += (_, _) =>
            {
                lock (_memoryLock)
                {
                    if (_memoryHolders.Count == 0) return;

                    // 顺序访问每个内存块，保持物理内存驻留
                    long sum = 0;
                    foreach (var block in _memoryHolders)
                    {
                        // 采样访问，避免全量遍历的开销
                        for (int i = 0; i < block.Length; i += 4096) // 按页采样
                        {
                            sum += block[i];
                        }
                    }
                    accessCounter++;
                    Debug.WriteLine($"Memory keep-alive #{accessCounter}: sum={sum}");
                }
            };
            _memoryKeepAliveTimer.Start();
        }

        public void EmergencyReleaseMemory()
        {
            lock (_memoryLock)
            {
                int releasedMB = _memoryHolders.Count * 64;
                _memoryHolders.Clear();
                GC.Collect(GC.MaxGeneration, GCCollectionMode.Aggressive, true, true);
                Debug.WriteLine($"紧急释放内存: {releasedMB}MB");
            }
        }
        #endregion

        #region 内存监控
        private void InitializeMemoryMonitor()
        {
            try
            {
                _availableMemoryCounter?.Dispose();
                _availableMemoryCounter = new PerformanceCounter("Memory", "Available MBytes");

                _memoryMonitorTimer?.Dispose();
                _memoryMonitorTimer = new System.Windows.Forms.Timer { Interval = 5000 }; // 5秒检查

                _memoryMonitorTimer.Tick += (_, _) =>
                {
                    try
                    {
                        float availableMB = _availableMemoryCounter.NextValue();

                        // 可用内存低于阈值时触发清理或警告
                        if (availableMB < 300) // 小于300MB
                        {
                            Debug.WriteLine($"内存紧张！可用: {availableMB}MB");

                            // 策略1：清理WebView2缓存
                            try
                            {
                                webView?.CoreWebView2?.Profile?.ClearBrowsingDataAsync();
                            }
                            catch { }

                            // 策略2：释放我们的预留内存给系统（牺牲保活换流畅）
                            if (availableMB < 150 && _memoryHolders.Count > 0)
                            {
                                this.Invoke(new Action(() =>
                                {
                                    EmergencyReleaseMemory();
                                    ShowBalloonTip("内存不足", "已自动释放预留内存以保证系统流畅");
                                }));
                            }
                        }
                    }
                    catch { }
                };

                _memoryMonitorTimer.Start();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"内存监控初始化失败: {ex.Message}");
            }
        }
        #endregion

        #region 电源管理
        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool SetProcessInformation(IntPtr hProcess, int ProcessInformationClass,
            ref PROCESS_POWER_THROTTLING_STATE ProcessInformation, int ProcessInformationSize);

        private const int ProcessPowerThrottling = 4;
        private const uint POWER_THROTTLING_IGNORE_TIMER_RESOLUTION = 0x1;

        [StructLayout(LayoutKind.Sequential)]
        private struct PROCESS_POWER_THROTTLING_STATE
        {
            public uint Version;
            public uint ControlMask;
            public uint StateMask;
        }

        private void DisablePowerThrottling()
        {
            try
            {
                var powerState = new PROCESS_POWER_THROTTLING_STATE
                {
                    Version = 1,
                    ControlMask = POWER_THROTTLING_IGNORE_TIMER_RESOLUTION,
                    StateMask = 0 // 0表示禁用节流
                };
                SetProcessInformation(GetCurrentProcess(), ProcessPowerThrottling,
                    ref powerState, Marshal.SizeOf(powerState));
            }
            catch { }
        }
        #endregion

        #region 窗口激活事件处理
        private void FloatTimerForm_Activated(object sender, EventArgs e)
        {
            if (webLayer != null && !webLayer.IsDisposed && webLayer.Visible)
            {
                ForceWebLayerTopMost();
            }
        }

        private void ForceWebLayerTopMost()
        {
            if (webLayer == null || webLayer.IsDisposed || !webLayer.Visible) return;

            lock (_zOrderLock)
            {
                _isSettingZOrder = true;
                try
                {
                    SetWindowPos(webLayer.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);

                    SetWindowPos(webLayer.Handle, HWND_TOP, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                }
                finally
                {
                    _isSettingZOrder = false;
                }
            }
        }
        #endregion

        #region WebView2环境预初始化
        private async Task InitializeWebViewEnvironmentAsync()
        {
            try
            {
                var options = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments = GetHighPerformanceArguments(),
                    AllowSingleSignOnUsingOSPrimaryAccount = false,
                    Language = "zh-CN",
                };

                string userDataFolder = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FloatTimerWebView2"
                );

                _webViewEnvironment = await CoreWebView2Environment.CreateAsync(
                    browserExecutableFolder: null,
                    userDataFolder: userDataFolder,
                    options: options
                );
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"WebView2环境初始化失败: {ex.Message}");
            }
        }

        private string GetHighPerformanceArguments()
        {
            return
                "--no-sandbox " +
                "--disable-web-security " +
                "--allow-file-access-from-files " +
                "--allow-insecure-localhost " +
                "--unsafely-treat-insecure-origin-as-secure=http://*,https://* " +
                "--enable-gpu-rasterization " +
                "--force-gpu-rasterization " +
                "--enable-zero-copy " +
                "--enable-native-gpu-memory-buffers " +
                "--disable-gpu-driver-bug-workarounds " +
                "--ignore-gpu-blocklist " +
                "--enable-accelerated-2d-canvas " +
                "--enable-accelerated-video-decode " +
                "--enable-accelerated-mjpeg-decode " +
                "--disable-gpu-vsync " +
                "--disable-gpu-sandbox " +
                "--renderer-process-limit=1 " +
                "--disable-renderer-backgrounding " +
                "--disable-background-timer-throttling " +
                "--disable-backgrounding-occluded-windows " +
                "--disable-features=CalculateWindowOcclusion,site-per-process,TranslateUI,InterestFeedContentSuggestions,MediaRouter,OptimizationHints,NetworkPrediction,OfflinePagesPrefetching,AutofillServerCommunication,PasswordManager,SafeBrowsingEnhanced,IsolateOrigins " +
                "--enable-features=CanvasOopRasterization,SkiaGraphite,ParallelDownloading,EnableHighResolutionTimer,HighPriorityCoreDispatcher " +
                "--max_old_space_size=16384 " +
                "--initial_old_space_size=4096 " +
                "--memory-model=high " +
                "--force-color-profile=srgb " +
                "--disable-extensions " +
                "--disable-plugins " +
                "--disable-sync " +
                "--no-first-run " +
                "--enable-smooth-scrolling " +
                "--enable-tcp-fast-open " +
                "--enable-quic " +
                "--enable-brotli " +
                "--enable-fast-unload " +
                "--enable-aggressive-domstorage-flushing ";
        }
        #endregion

        #region 重启程序
        private void RestartApplication()
        {
            try
            {
                Program.SetRestartFlag();
                trayIcon.Visible = false;
                DisposeWebLayer();
                CleanupResources();
                Application.Exit();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"重启失败: {ex.Message}", "错误",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        private void CleanupResources()
        {
            topMostTimer?.Stop();
            topMostTimer?.Dispose();
            focusCheckTimer?.Stop();
            focusCheckTimer?.Dispose();

            _memoryKeepAliveTimer?.Stop();
            _memoryKeepAliveTimer?.Dispose();

            _memoryMonitorTimer?.Stop();
            _memoryMonitorTimer?.Dispose();

            _availableMemoryCounter?.Dispose();

            EmergencyReleaseMemory();

            btnForm?.Close();
            btnForm?.Dispose();
        }
        #endregion

        #region 触摸反馈禁用
        /// <summary>
        /// 禁用窗口的触摸视觉反馈
        /// </summary>
        private void DisableTouchFeedback(IntPtr hWnd)
        {
            try
            {
                bool enabled = false;

                // 禁用触摸接触可视化（小白圈）
                SetWindowFeedbackSetting(hWnd, FEEDBACK_TYPE.FEEDBACK_TOUCH_CONTACTVISUALIZATION, 0, (uint)Marshal.SizeOf(enabled), ref enabled);

                // 禁用触摸点击反馈
                SetWindowFeedbackSetting(hWnd, FEEDBACK_TYPE.FEEDBACK_TOUCH_TAP, 0, (uint)Marshal.SizeOf(enabled), ref enabled);

                // 禁用触摸双击反馈
                SetWindowFeedbackSetting(hWnd, FEEDBACK_TYPE.FEEDBACK_TOUCH_DOUBLETAP, 0, (uint)Marshal.SizeOf(enabled), ref enabled);

                // 禁用触摸长按反馈
                SetWindowFeedbackSetting(hWnd, FEEDBACK_TYPE.FEEDBACK_TOUCH_PRESSANDHOLD, 0, (uint)Marshal.SizeOf(enabled), ref enabled);

                // 禁用触摸右键反馈
                SetWindowFeedbackSetting(hWnd, FEEDBACK_TYPE.FEEDBACK_TOUCH_RIGHTTAP, 0, (uint)Marshal.SizeOf(enabled), ref enabled);

                // 禁用触摸拖动反馈
                SetWindowFeedbackSetting(hWnd, FEEDBACK_TYPE.FEEDBACK_TOUCH_DRAG, 0, (uint)Marshal.SizeOf(enabled), ref enabled);

                Debug.WriteLine("已禁用窗口触摸反馈");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"禁用触摸反馈失败: {ex.Message}");
            }
        }
        #endregion

        #region 创建/销毁WebLayer（优化版）
        private void CreateWebLayer()
        {
            if (webLayer != null && !webLayer.IsDisposed) return;

            webLayer = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                TopMost = true,
                ShowInTaskbar = false,
                Text = "",
                BackColor = Color.Black,
                Visible = false,
                StartPosition = FormStartPosition.Manual
            };

            // 使用屏幕边界而非 Maximized，确保底部可点击
            Rectangle screenBounds = Screen.PrimaryScreen.Bounds;
            webLayer.Bounds = screenBounds;

            // 移除SetToolWindow，让webLayer可以被激活为前台窗口
            // SetToolWindow(webLayer.Handle);

            SetWindowLong(webLayer.Handle, GWL_EXSTYLE,
                GetWindowLong(webLayer.Handle, GWL_EXSTYLE) | WS_EX_LAYERED);

            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = true,
                TabStop = false,
                DefaultBackgroundColor = Color.Transparent
            };

            webLayer.Controls.Add(webView);

            // 修正：在EnsureCoreWebView2Async之前订阅WebMessageReceived
            webView.WebMessageReceived += WebView_WebMessageReceived;
            webView.CoreWebView2InitializationCompleted += OnCoreReady;

            if (_webViewEnvironment != null)
            {
                _ = webView.EnsureCoreWebView2Async(_webViewEnvironment);
            }
            else
            {
                _ = webView.EnsureCoreWebView2Async();
            }
        }

        // 处理来自HTML的消息
        private void WebView_WebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string message = e.TryGetWebMessageAsString();
                if (message == "hideWebLayer")
                {
                    this.Invoke(new Action(() =>
                    {
                        // 隐藏白板时同步关闭鼠标穿透
                        SetMousePassthrough(false, Rectangle.Empty);
                        if (expanded)
                        {
                            expanded = false;
                            // 不要立即隐藏白板：先让动画层覆盖白板并播放关闭动画，
                            // PlayTransitionAsync 会在动画开始后再隐藏 webLayer。
                            _ = PlayTransitionAsync("hide");
                        }
                    }));
                }
                else if (!string.IsNullOrEmpty(message) && message[0] == '{')
                {
                    // JSON消息：鼠标穿透等
                    HandleHostMessage(message);
                }
            }
            catch { }
        }

        // 处理来自HTML的JSON消息（支持：setMousePassthrough 鼠标穿透；savePhoto/listPhotos/clearAlbum 相册）
        private void HandleHostMessage(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var typeProp)) return;
                string messageType = typeProp.GetString() ?? "";
                // 相册相关消息交由专门处理，鼠标穿透逻辑保持原样
                if (messageType != "setMousePassthrough")
                {
                    HandleAlbumMessage(messageType, root);
                    return;
                }
                if (messageType != "setMousePassthrough") return;

                bool enabled = root.TryGetProperty("enabled", out var enabledProp) && enabledProp.GetBoolean();

                // 工具栏豁免区（CSS像素 → 物理像素）：JS端同时上报 devicePixelRatio
                Rectangle toolbarRect = Rectangle.Empty;
                if (enabled && root.TryGetProperty("toolbar", out var toolbarProp))
                {
                    double scale = 1.0;
                    if (root.TryGetProperty("dpr", out var dprProp)) scale = dprProp.GetDouble();
                    int x = (int)Math.Round(toolbarProp.GetProperty("x").GetDouble() * scale);
                    int y = (int)Math.Round(toolbarProp.GetProperty("y").GetDouble() * scale);
                    int w = (int)Math.Round(toolbarProp.GetProperty("width").GetDouble() * scale);
                    int h = (int)Math.Round(toolbarProp.GetProperty("height").GetDouble() * scale);
                    toolbarRect = new Rectangle(x, y, w, h);
                }

                this.Invoke(new Action(() => SetMousePassthrough(enabled, toolbarRect)));
            }
            catch { }
        }

        // 设置鼠标穿透：开启后拦截 WebView 窗口的命中测试，除工具栏豁免区外全部点击穿透
        private void SetMousePassthrough(bool enabled, Rectangle toolbarRect)
        {
            _passthroughActive = enabled;
            _passthroughOwner = enabled ? this : null;

            if (enabled && webLayer != null && !webLayer.IsDisposed)
            {
                // HTML 上报的是 WebView 视口坐标，转换成屏幕坐标后创建独立的点击接收窗。
                toolbarRect.Offset(webLayer.Left, webLayer.Top);
                _toolbarScreenRect = toolbarRect;
                SetClickThroughStyle(webLayer.Handle, true);
                CreateToolbarInputOverlay();
                // 穿透开启后，让白板/WebView 让出焦点，焦点交给下层的程序
                ReleaseWebLayerFocus();
            }
            else
            {
                _toolbarScreenRect = Rectangle.Empty;
                RemoveToolbarInputOverlay();
                if (webLayer != null && !webLayer.IsDisposed)
                {
                    SetClickThroughStyle(webLayer.Handle, false);
                }
                _passthroughOwner = null;
            }

            Debug.WriteLine(enabled
                ? $"鼠标穿透已开启，工具栏由独立覆盖窗接收: {_toolbarScreenRect}"
                : "鼠标穿透已关闭");
        }

        #region 焦点交接（鼠标穿透时把焦点交给下层程序）
        // 记录被本程序抢走焦点前的下层前台窗口，穿透开启时用其交还焦点
        private void CapturePreviousForeground()
        {
            IntPtr fg = GetForegroundWindow();
            if (fg == IntPtr.Zero || IsOwnWindow(fg)) return;
            _previousForegroundWindow = fg;
        }

        // 鼠标穿透开启时调用：让白板/WebView 让出焦点，焦点交给下层的程序
        private void ReleaseWebLayerFocus()
        {
            if (webLayer == null || webLayer.IsDisposed || !webLayer.Visible) return;

            IntPtr target = IntPtr.Zero;
            if (_previousForegroundWindow != IntPtr.Zero &&
                IsWindow(_previousForegroundWindow) &&
                IsWindowVisible(_previousForegroundWindow))
            {
                target = _previousForegroundWindow;
            }

            if (target == IntPtr.Zero)
            {
                target = FindWindowBelowWebLayer();
            }

            if (target != IntPtr.Zero)
            {
                GiveFocusToWindow(target);
            }
        }

        // 在 Z 序中查找白板窗口正下方的第一个可见、非本程序窗口
        private IntPtr FindWindowBelowWebLayer()
        {
            if (webLayer == null || webLayer.IsDisposed) return IntPtr.Zero;

            IntPtr h = webLayer.Handle;
            while (true)
            {
                h = GetWindow(h, GW_HWNDNEXT);
                if (h == IntPtr.Zero) return IntPtr.Zero;

                if (IsOwnWindow(h)) continue;
                if (!IsWindowVisible(h)) continue;

                return h;
            }
        }

        // 只转移焦点，不改变目标窗口的置顶属性
        private void GiveFocusToWindow(IntPtr hWnd)
        {
            if (hWnd == IntPtr.Zero || !IsWindow(hWnd) || IsOwnWindow(hWnd)) return;

            IntPtr fg = GetForegroundWindow();
            uint fgThread = GetWindowThreadProcessId(fg, out _);
            uint appThread = GetWindowThreadProcessId(hWnd, out _);

            if (fgThread != appThread)
            {
                AttachThreadInput(fgThread, appThread, true);
            }

            try
            {
                BringWindowToTop(hWnd);
                SetForegroundWindow(hWnd);
                SetActiveWindow(hWnd);
            }
            finally
            {
                if (fgThread != appThread)
                {
                    AttachThreadInput(fgThread, appThread, false);
                }
            }
        }

        // 判断句柄是否属于本程序自己的窗口
        private bool IsOwnWindow(IntPtr h)
        {
            if (h == IntPtr.Zero) return false;
            if (h == this.Handle) return true;
            if (btnForm != null && h == btnForm.Handle) return true;
            if (webLayer != null && h == webLayer.Handle) return true;
            if (animationLayer != null && h == animationLayer.Handle) return true;
            if (_toolbarInputOverlay != null && h == _toolbarInputOverlay.Handle) return true;
            return false;
        }
        #endregion

        private void CreateToolbarInputOverlay()
        {
            RemoveToolbarInputOverlay();
            if (_toolbarScreenRect.Width <= 0 || _toolbarScreenRect.Height <= 0) return;

            _toolbarInputOverlay = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                ShowInTaskbar = false,
                ShowIcon = false,
                TopMost = true,
                StartPosition = FormStartPosition.Manual,
                Bounds = _toolbarScreenRect,
                // 不能使用 TransparencyKey：被抠掉的区域会连同鼠标命中一起透明。
                // 使用极低不透明度保留真实窗口命中，同时视觉上不可见。
                BackColor = Color.Black,
                Opacity = 0.01,
                Text = ""
            };
            SetToolWindow(_toolbarInputOverlay.Handle);
            SetWindowLong(_toolbarInputOverlay.Handle, GWL_EXSTYLE,
                GetWindowLong(_toolbarInputOverlay.Handle, GWL_EXSTYLE) | 0x08000000);

            _toolbarInputOverlay.MouseDown += (_, e) => ForwardPassthroughPointer("down", e);
            _toolbarInputOverlay.MouseMove += (_, e) => ForwardPassthroughPointer("move", e);
            _toolbarInputOverlay.MouseUp += (_, e) => ForwardPassthroughPointer("up", e);
            // 不设置 owner，避免 owner 的层级/激活状态把覆盖窗压到 WebView 后面。
            _toolbarInputOverlay.Show();
            SetWindowPos(_toolbarInputOverlay.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
        }

        private void RemoveToolbarInputOverlay()
        {
            if (_toolbarInputOverlay == null) return;
            var overlay = _toolbarInputOverlay;
            _toolbarInputOverlay = null;
            if (!overlay.IsDisposed) overlay.Close();
            overlay.Dispose();
        }

        private void ForwardPassthroughPointer(string action, MouseEventArgs e)
        {
            if (!_passthroughActive || webView?.CoreWebView2 == null || webLayer == null) return;

            // 【修复】快速点击时 MouseUp 可能在覆盖窗外释放而丢失，
            // 导致 JS 端永远收不到 up，工具栏点击状态卡死。
            // 在 down 时捕获鼠标到覆盖窗，确保 up 一定被转发。
            if (action == "down" && _toolbarInputOverlay != null && !_toolbarInputOverlay.IsDisposed)
            {
                _toolbarInputOverlay.Capture = true;
            }
            else if (action == "up" && _toolbarInputOverlay != null && !_toolbarInputOverlay.IsDisposed)
            {
                _toolbarInputOverlay.Capture = false;
            }

            Point screenPoint = _toolbarInputOverlay?.PointToScreen(e.Location) ?? Cursor.Position;
            var payload = new
            {
                type = "passthroughPointer",
                action,
                button = e.Button.ToString().ToLowerInvariant(),
                x = screenPoint.X - webLayer.Left,
                y = screenPoint.Y - webLayer.Top,
                screenX = screenPoint.X,
                screenY = screenPoint.Y
            };
            webView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
        }

        #region 鼠标穿透（透明模式）- WebView 窗口子类化
        private delegate IntPtr WndSubclassProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam, UIntPtr uIdSubclass, UIntPtr dwRefData);

        private static readonly UIntPtr PassthroughSubclassId = (UIntPtr)0xA110;

        private static IntPtr PassthroughSubclassProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam, UIntPtr uIdSubclass, UIntPtr dwRefData)
        {
            var owner = _passthroughOwner;
            if (owner != null && owner._passthroughActive && uMsg == WM_NCHITTEST)
            {
                // lParam 低位字 = 屏幕X，高位字 = 屏幕Y
                int x = (short)(lParam.ToInt64() & 0xFFFF);
                int y = (short)((lParam.ToInt64() >> 16) & 0xFFFF);
                if (!owner._toolbarScreenRect.Contains(x, y))
                {
                    return new IntPtr(HTTRANSPARENT);
                }

                // 工具栏区域必须继续走 WebView 的正常命中测试，不能返回 HTTRANSPARENT。
                return DefSubclassProc(hWnd, uMsg, wParam, lParam);
            }
            return DefSubclassProc(hWnd, uMsg, wParam, lParam);
        }

        // 设置窗口扩展样式。WebView2 会创建多个原生子窗口，必须全部设置，
        // 否则顶层窗口虽然透明，实际输入仍会被子窗口截获。
        private static void SetClickThroughStyle(IntPtr root, bool enabled)
        {
            if (root == IntPtr.Zero) return;

            var queue = new Queue<IntPtr>();
            queue.Enqueue(root);
            while (queue.Count > 0)
            {
                IntPtr hWnd = queue.Dequeue();
                int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
                // 不给 WebView 子窗口设置 WS_EX_TRANSPARENT：该样式会无条件跳过整个窗口，
                // 即使 WM_NCHITTEST 返回正常命中，也会导致工具栏无法点击。
                // 由子类化后的 WM_NCHITTEST 在工具栏外返回 HTTRANSPARENT，实现按区域穿透。
                // 仅依靠 WM_NCHITTEST 做按区域穿透。
                // 不能给 WebView 或其子窗口设置 WS_EX_NOACTIVATE：
                // WebView2 会把该样式传播到实际承载页面的窗口，导致命中测试
                // 在进入我们的回调前就被系统跳过，最终表现为整个窗口都无法穿透。
                int newStyle = exStyle;
                if (enabled)
                {
                    // 主 WebView 及其子窗口全部穿透；工具栏点击由独立覆盖窗接收。
                    newStyle |= WS_EX_TRANSPARENT;
                }
                else
                {
                    newStyle &= ~WS_EX_TRANSPARENT;
                    newStyle &= ~0x08000000;
                }

                if (newStyle != exStyle)
                {
                    SetWindowLong(hWnd, GWL_EXSTYLE, newStyle);
                    SetWindowPos(hWnd, IntPtr.Zero, 0, 0, 0, 0,
                        SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
                }

                IntPtr child = GetWindow(hWnd, GW_CHILD);
                while (child != IntPtr.Zero)
                {
                    queue.Enqueue(child);
                    child = GetWindow(child, GW_HWNDNEXT);
                }
            }
        }

        // 对 webView 窗口及其全部子窗口统一子类化，确保命中测试被拦截
        private void SubclassWindowTree(IntPtr root)
        {
            RemoveSubclass();
            if (root == IntPtr.Zero) return;

            var queue = new Queue<IntPtr>();
            queue.Enqueue(root);
            while (queue.Count > 0)
            {
                IntPtr h = queue.Dequeue();
                if (SetWindowSubclass(h, _passthroughSubclassProc, PassthroughSubclassId, UIntPtr.Zero))
                {
                    _subclassedWindows.Add(h);
                }
                IntPtr child = GetWindow(h, GW_CHILD);
                while (child != IntPtr.Zero)
                {
                    queue.Enqueue(child);
                    child = GetWindow(child, GW_HWNDNEXT);
                }
            }
        }

        private void RemoveSubclass()
        {
            foreach (var h in _subclassedWindows)
            {
                RemoveWindowSubclass(h, _passthroughSubclassProc, PassthroughSubclassId);
            }
            _subclassedWindows.Clear();
        }
        #endregion

        private string ResolveHtmlPath(string fileName)
        {
            string basePath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, fileName);
            if (File.Exists(basePath)) return basePath;

            string publicPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "public", fileName);
            if (File.Exists(publicPath)) return publicPath;

            return basePath;
        }

        private async Task CreateAnimationLayerAsync()
        {
            if (animationLayer != null && !animationLayer.IsDisposed && animationWebView?.CoreWebView2 != null)
                return;

            animationLayer = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                TopMost = true,
                ShowInTaskbar = false,
                BackColor = Color.Magenta,
                TransparencyKey = Color.Magenta,
                StartPosition = FormStartPosition.Manual,
                Bounds = Screen.PrimaryScreen.Bounds
            };
            animationWebView = new WebView2
            {
                Dock = DockStyle.Fill,
                DefaultBackgroundColor = Color.Transparent
            };
            animationLayer.Controls.Add(animationWebView);
            animationReady = false;
            animationInitializedSignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

            await animationWebView.EnsureCoreWebView2Async(_webViewEnvironment);
            animationWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            animationWebView.CoreWebView2.WebMessageReceived += AnimationWebMessageReceived;
            animationWebView.CoreWebView2.NavigationCompleted += (sender, args) =>
            {
                if (args.IsSuccess) animationReady = true;
            };
            animationWebView.CoreWebView2.Navigate(new Uri(ResolveHtmlPath("1.html")).AbsoluteUri);

            for (int i = 0; i < 100 && !animationReady; i++)
                await Task.Delay(50);

            // NavigationCompleted 只代表文档导航完成，不代表首帧已经绘制。
            // 等待 1.html 在 DOM/CSS 初始化并完成至少两帧合成后再允许切换窗口。
            if (animationReady && animationInitializedSignal != null)
            {
                await Task.WhenAny(animationInitializedSignal.Task, Task.Delay(600));
                animationInitializedSignal = null;
            }
        }

        private async Task<string?> CaptureWhiteboardAsync()
        {
            if (webView?.CoreWebView2 == null) return null;

            string screenshotDirectory = Path.Combine(Path.GetTempPath(), "FloatTimerScreenshots");
            Directory.CreateDirectory(screenshotDirectory);
            string screenshotPath = Path.Combine(screenshotDirectory, $"whiteboard-{Guid.NewGuid():N}.png");

            try
            {
                await using var stream = new FileStream(
                    screenshotPath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.Read,
                    bufferSize: 64 * 1024,
                    useAsync: true);
                await webView.CoreWebView2.CapturePreviewAsync(
                    CoreWebView2CapturePreviewImageFormat.Png,
                    stream);
                await stream.FlushAsync();
                return screenshotPath;
            }
            catch
            {
                try { if (File.Exists(screenshotPath)) File.Delete(screenshotPath); } catch { }
                return null;
            }
        }

        private void DeleteWhiteboardScreenshot(string? screenshotPath)
        {
            if (string.IsNullOrEmpty(screenshotPath)) return;
            try
            {
                if (File.Exists(screenshotPath)) File.Delete(screenshotPath);
            }
            catch (IOException)
            {
                // WebView2 仍在读取时由下一次截图或退出清理。
            }
        }

        private void ClearWhiteboardScreenshot()
        {
            DeleteWhiteboardScreenshot(lastWhiteboardScreenshotPath);
            lastWhiteboardScreenshotPath = null;
            hasWhiteboardScreenshot = false;
        }

        private void AnimationWebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string message = e.TryGetWebMessageAsString();
                if (message == "animationReady")
                    animationInitializedSignal?.TrySetResult(true);
                else if (message == "screenshotReady")
                    screenshotReadySignal?.TrySetResult(true);
            }
            catch { }
        }

        private async Task PlayTransitionAsync(string direction)
        {
            if (transitionInProgress || webLayer == null || webView == null) return;
            transitionInProgress = true;
            try
            {
                await CreateAnimationLayerAsync();
                if (animationWebView?.CoreWebView2 == null || !animationReady) return;

                // 只在关闭白板时截取一次，并缓存这张截图。
                // 后续展开直接复用上次关闭时的画面，不再先显�� 01.html 进行截图。
                if (direction == "hide")
                {
                    var screenshot = await CaptureWhiteboardAsync();
                    if (screenshot != null)
                    {
                        string? previousScreenshotPath = lastWhiteboardScreenshotPath;
                        lastWhiteboardScreenshotPath = screenshot;
                        hasWhiteboardScreenshot = true;

                        // 新截图完成后再删除旧文件，避免动画层仍在读取旧截图。
                        DeleteWhiteboardScreenshot(previousScreenshotPath);
                    }
                }

                if (!string.IsNullOrEmpty(lastWhiteboardScreenshotPath))
                {
                    screenshotReadySignal = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
                    animationWebView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
                    {
                        type = "setScreenshot",
                        url = new Uri(lastWhiteboardScreenshotPath).AbsoluteUri
                    }));
                    await Task.WhenAny(screenshotReadySignal.Task, Task.Delay(500));
                    screenshotReadySignal = null;
                }

                animationLayer.Bounds = Screen.PrimaryScreen.Bounds;
                animationLayer.Show();
                animationLayer.BringToFront();
                SetWindowPos(animationLayer.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

                // Show/SetWindowPos 是异步提交给桌面合成器的；低性能设备上如果立即
                // 隐藏 01.html，可能出现一个合成空帧而透出桌面。留出至少两帧让动画 WebView
                // 真正进入可见合成状态，再切换窗口归属。
                await Task.Delay(50);

                // 动画开始前切换窗口可见性：
                // 打开时必须先隐藏白板，避免 01.html 盖住 1.html；
                // 关闭时也先隐藏白板，让动画层完整接管画面。
                webLayer.Hide();

                animationWebView.CoreWebView2.PostWebMessageAsJson(JsonSerializer.Serialize(new
                {
                    type = "animate",
                    direction = direction
                }));

                await Task.Delay(650);

                // 先显示动画结束后的白板，再关闭动画层，避免两次窗口切换之间出现一帧桌面空白。
                if (direction == "show")
                {
                    webLayer.Show();
                    ForceWebLayerTopMost();
                }
                animationLayer.Hide();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"白板过渡动画失败: {ex.Message}");
                if (direction == "hide") webLayer?.Hide();
            }
            finally
            {
                transitionInProgress = false;
                if (direction == "hide")
                {
                    btnForm.Show();
                    btnToggle.Image = Image.FromFile(imgExpand);
                    SetButtonRegion(btnForm, (Bitmap)btnToggle.Image);
                }
            }
        }

        private void DisposeWebLayer()
        {
            // 移除鼠标穿透子类化
            RemoveSubclass();
            ClearWhiteboardScreenshot();

            if (webView != null)
            {
                try
                {
                    webView.WebMessageReceived -= WebView_WebMessageReceived;
                    webView.Dispose();
                }
                catch { }
                webView = null;
            }

            if (webLayer != null)
            {
                try { webLayer.Hide(); webLayer.Dispose(); } catch { }
                webLayer = null;
            }
            if (animationWebView != null)
            {
                try { animationWebView.Dispose(); } catch { }
                animationWebView = null;
            }
            if (animationLayer != null)
            {
                try { animationLayer.Hide(); animationLayer.Dispose(); } catch { }
                animationLayer = null;
            }
            animationReady = false;
        }
        #endregion

        #region 相册（拍照保存 / 列表读取 / 清空）
        // 相册目录：程序（HTML）同目录下的 album 文件夹
        private readonly object _albumLock = new object();
        private string AlbumDirectory => Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "album");

        // 相册消息分发：savePhoto 保存照片；listPhotos 返回照片列表；clearAlbum 清空相册
        private void HandleAlbumMessage(string type, JsonElement root)
        {
            try
            {
                if (type == "savePhoto")
                {
                    string dataUrl = root.TryGetProperty("data", out var dataProp)
                        ? (dataProp.GetString() ?? "") : "";
                    if (!string.IsNullOrEmpty(dataUrl)) SavePhoto(dataUrl);
                }
                else if (type == "listPhotos")
                {
                    SendPhotoList();
                }
                else if (type == "clearAlbum")
                {
                    ClearAlbum();
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"相册消息处理失败: {ex.Message}");
            }
        }

        // 保存照片：dataURL(base64 JPEG，方向已由 HTML 按当前视频旋转烤入) 写入 album 文件夹
        private void SavePhoto(string dataUrl)
        {
            try
            {
                int comma = dataUrl.IndexOf(',');
                string base64 = comma >= 0 ? dataUrl.Substring(comma + 1) : dataUrl;
                byte[] bytes = Convert.FromBase64String(base64);

                lock (_albumLock)
                {
                    Directory.CreateDirectory(AlbumDirectory);
                    // 实际文件名（Windows 不允许 / 和 :）：yyyy-MM-dd_HH-mm-ss_fff.jpg
                    string baseName = DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss_fff");
                    string path = Path.Combine(AlbumDirectory, baseName + ".jpg");
                    int n = 1;
                    while (File.Exists(path))
                    {
                        path = Path.Combine(AlbumDirectory, baseName + "_" + (n++) + ".jpg");
                    }
                    File.WriteAllBytes(path, bytes);
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"保存照片失败: {ex.Message}");
            }
            // 保存后回传最新列表（相册面板打开时自动刷新）
            SendPhotoList();
        }

        // 读取相册并把照片列表（时间升序，最新在最后）回传 HTML
        private void SendPhotoList()
        {
            var photos = new List<object>();
            try
            {
                if (Directory.Exists(AlbumDirectory))
                {
                    var allowedExt = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
                    { ".jpg", ".jpeg", ".png" };
                    var paths = Directory.GetFiles(AlbumDirectory)
                        .Where(p => allowedExt.Contains(Path.GetExtension(p)))
                        .OrderBy(p => Path.GetFileName(p), StringComparer.Ordinal)
                        .ToList();
                    foreach (var p in paths)
                    {
                        string fileName = Path.GetFileName(p);
                        string rawName = Path.GetFileNameWithoutExtension(p);
                        string label = FormatPhotoLabel(rawName);
                        string url;
                        try { url = new Uri(p).AbsoluteUri; }
                        catch { url = fileName; }
                        photos.Add(new { name = fileName, label = label, url = url });
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"读取相册失败: {ex.Message}");
            }

            string json = JsonSerializer.Serialize(new { type = "photoList", photos = photos });
            try
            {
                webView?.CoreWebView2?.PostWebMessageAsJson(json);
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"回传相册列表失败: {ex.Message}");
            }
        }

        // 文件名 → 列表显示标签：yyyy/MM/dd-HH:mm:ss（解析失败则原样返回）
        private static string FormatPhotoLabel(string rawName)
        {
            // 去掉同秒重名时追加的 "_1" 等后缀
            string name = System.Text.RegularExpressions.Regex.Replace(rawName, @"_\d+$", "");
            if (DateTime.TryParseExact(name, "yyyy-MM-dd_HH-mm-ss_fff",
                CultureInfo.InvariantCulture, DateTimeStyles.None, out var dt))
            {
                return dt.ToString("yyyy/MM/dd-HH:mm:ss", CultureInfo.InvariantCulture);
            }
            return rawName;
        }

        // 清空相册：删除 album 文件夹内全部照片文件
        private void ClearAlbum()
        {
            try
            {
                lock (_albumLock)
                {
                    if (Directory.Exists(AlbumDirectory))
                    {
                        foreach (var file in Directory.GetFiles(AlbumDirectory))
                        {
                            try { File.Delete(file); } catch { }
                        }
                    }
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"清空相册失败: {ex.Message}");
            }
            // 清空后回传空列表（HTML 会自动返回相机）
            SendPhotoList();
        }
        #endregion

        private void OnCoreReady(object? sender, CoreWebView2InitializationCompletedEventArgs e)
        {
            if (!e.IsSuccess) return;

            var s = webView.CoreWebView2.Settings;

            s.IsZoomControlEnabled = false;
            s.IsPinchZoomEnabled = false;
            s.AreBrowserAcceleratorKeysEnabled = false;
            s.AreDefaultScriptDialogsEnabled = false;
            s.IsSwipeNavigationEnabled = false;
            s.IsReputationCheckingRequired = false;

            s.IsBuiltInErrorPageEnabled = false;
            s.AreDefaultContextMenusEnabled = false;
            s.IsStatusBarEnabled = false;
            s.IsGeneralAutofillEnabled = false;
            s.IsPasswordAutosaveEnabled = false;

            webView.CoreWebView2.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;

            // 自动允许摄像头/麦克风等设备权限，无需用户确认
            webView.CoreWebView2.PermissionRequested += (s, args) =>
            {
                args.State = CoreWebView2PermissionState.Allow;
            };

            string htmlPath = ResolveHtmlPath("01.html");
            webView.CoreWebView2.Navigate(htmlPath);
        }

        private void Toggle()
        {
            expanded = !expanded;

            if (expanded)
            {
                CreateWebLayer();

                // 有缓存截图时，必须先保持 01.html 隐藏，避免在动画层出现前闪出一帧白板。
                // 首次展开没有截图，才直接显示 01.html。
                bool playShowTransition = hasWhiteboardScreenshot && !string.IsNullOrEmpty(lastWhiteboardScreenshotPath);
                if (!playShowTransition)
                {
                    lock (_zOrderLock)
                    {
                        _isSettingZOrder = true;
                        try
                        {
                            if (webLayer != null && !webLayer.IsDisposed)
                            {
                                webLayer.Bounds = Screen.PrimaryScreen.Bounds;
                                webLayer.Show();
                                DisableTouchFeedback(webLayer.Handle);
                                if (webView?.Handle != IntPtr.Zero)
                                {
                                    DisableTouchFeedback(webView.Handle);
                                }
                            }

                            this.BeginInvoke(new Action(() =>
                            {
                                if (webLayer != null && !webLayer.IsDisposed && webLayer.Visible)
                                {
                                    ForceWebLayerTopMost();
                                    ForceWindowToFront(webLayer.Handle);
                                }
                                _isSettingZOrder = false;
                            }));
                        }
                        catch
                        {
                            _isSettingZOrder = false;
                        }
                    }
                }

                btnForm.Hide();

                // 第一次展开还没有白板截图，直接显示 01.html，避免播放没有内容的动画。
                if (!playShowTransition)
                {
                    return;
                }

                _ = PlayTransitionAsync("show");
            }
            else
            {
                // 由 PlayTransitionAsync 在关闭动画完成后显示展开按钮。
                // 这里不能提前 Show，否则动画层尚未覆盖白板时就会改变窗口层级。
                _ = PlayTransitionAsync("hide");
            }
        }

        #region 窗口激活与置顶优化
        private void ForceWindowToFront(IntPtr hWnd)
        {
            // 抢焦点前记录下层前台窗口，鼠标穿透开启时用其交还焦点
            CapturePreviousForeground();

            IntPtr fgWindow = GetForegroundWindow();
            uint fgThread = GetWindowThreadProcessId(fgWindow, out _);
            uint appThread = GetWindowThreadProcessId(hWnd, out _);

            if (fgThread != appThread)
            {
                AttachThreadInput(fgThread, appThread, true);
            }

            BringWindowToTop(hWnd);
            SetWindowPos(hWnd, HWND_TOPMOST, 0, 0, 0, 0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

            SetForegroundWindow(hWnd);
            SetActiveWindow(hWnd);

            if (fgThread != appThread)
            {
                AttachThreadInput(fgThread, appThread, false);
            }
        }

        #endregion


        #region PNG转Region 镂空
        private static void SetButtonRegion(Form form, Bitmap bmp)
        {
            if (bmp == null) return;
            int w = bmp.Width;
            int h = bmp.Height;
            var rgn = new Region(new Rectangle(0, 0, 0, 0));

            for (int y = 0; y < h; y++)
            {
                for (int x = 0; x < w;)
                {
                    while (x < w && bmp.GetPixel(x, y).A < 10) x++;
                    int x0 = x;
                    while (x < w && bmp.GetPixel(x, y).A >= 10) x++;
                    if (x > x0) rgn.Union(new Rectangle(x0, y, x - x0, 1));
                }
            }
            form.Region = rgn;
        }
        #endregion

        #region Win32 API
        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr SetActiveWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool IsWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool IsWindowVisible(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

        [DllImport("comctl32.dll", SetLastError = true)]
        private static extern bool SetWindowSubclass(IntPtr hWnd, WndSubclassProc pfnSubclass, UIntPtr uIdSubclass, UIntPtr dwRefData);

        [DllImport("comctl32.dll")]
        private static extern IntPtr DefSubclassProc(IntPtr hWnd, uint uMsg, IntPtr wParam, IntPtr lParam);

        [DllImport("comctl32.dll")]
        private static extern bool RemoveWindowSubclass(IntPtr hWnd, WndSubclassProc pfnSubclass, UIntPtr uIdSubclass);

        private const uint GW_CHILD = 5;
        private const uint GW_HWNDNEXT = 2;

        // 触摸反馈设置API
        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowFeedbackSetting(IntPtr hwnd, FEEDBACK_TYPE feedback, uint dwFlags, uint size, [In] ref bool configuration);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        private const int WS_EX_NOACTIVATE = 0x08000000;

        [DllImport("kernel32.dll")]
        private static extern bool SetPriorityClass(IntPtr hProcess, uint dwPriorityClass);

        private const uint REALTIME_PRIORITY_CLASS = 0x00000100;
        private const uint HIGH_PRIORITY_CLASS = 0x00000080;
        private const uint ABOVE_NORMAL_PRIORITY_CLASS = 0x00008000;

        [DllImport("kernel32.dll")]
        private static extern bool SetThreadPriority(IntPtr hThread, int nPriority);

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentThread();

        [DllImport("kernel32.dll")]
        private static extern IntPtr GetCurrentProcess();

        private const int THREAD_PRIORITY_TIME_CRITICAL = 15;
        private const int THREAD_PRIORITY_HIGHEST = 2;

        private static readonly IntPtr HWND_TOPMOST = new IntPtr(-1);
        private static readonly IntPtr HWND_NOTOPMOST = new IntPtr(-2);
        private static readonly IntPtr HWND_TOP = new IntPtr(0);
        private static readonly IntPtr HWND_BOTTOM = new IntPtr(1);

        private const uint SWP_NOMOVE = 0x0002;
        private const uint SWP_NOSIZE = 0x0001;
        private const uint SWP_NOACTIVATE = 0x0010;
        private const uint SWP_SHOWWINDOW = 0x0040;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter,
                                                int X, int Y, int cx, int cy, uint uFlags);

        private const int GWL_EXSTYLE = -20;
        private const int WS_EX_TOOLWINDOW = 0x00000080;
        private const int WS_EX_LAYERED = 0x80000;
        private const int WS_EX_TRANSPARENT = 0x20;

        [DllImport("user32.dll")]
        private static extern int GetWindowLong(IntPtr hWnd, int nIndex);

        [DllImport("user32.dll")]
        private static extern int SetWindowLong(IntPtr hWnd, int nIndex, int dwNewLong);

        private static void SetToolWindow(IntPtr hWnd)
        {
            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            SetWindowLong(hWnd, GWL_EXSTYLE, exStyle | WS_EX_TOOLWINDOW);
        }
        #endregion

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData) => true;
    }
}
//（注：内容由AI生成）
