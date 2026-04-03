using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Threading.Tasks;
using System.Windows.Forms;

namespace _01
{
    public partial class FloatTimerForm : Form
    {
        private readonly string imgExpand;
        private readonly string imgTrayIcon;
        private readonly string configPath;

        private WebView2 webView;
        private Form webLayer;
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

            #region 8. 加载配置并初始化托盘菜单
            LoadConfig();
            InitializeTrayIcon();
            #endregion

            #region 9. 窗口激活事件
            this.Activated += FloatTimerForm_Activated;
            #endregion

            #region 10. 性能模式初始化
            InitializePerformanceMode();
            #endregion
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

                // 2. 禁用电源节流
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
                                SWP_NOMOVE | SWP_NOSIZE | SWP_SHOWWINDOW);

                    SetWindowPos(webLayer.Handle, HWND_TOP, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE);
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

        #region 创建/销毁WebLayer（优化版）
        private void CreateWebLayer()
        {
            if (webLayer != null && !webLayer.IsDisposed) return;

            webLayer = new Form
            {
                FormBorderStyle = FormBorderStyle.None,
                WindowState = FormWindowState.Maximized,
                TopMost = true,
                ShowInTaskbar = false,
                Text = "",
                BackColor = Color.Black,
                Visible = false,
                StartPosition = FormStartPosition.Manual
            };
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
                        if (expanded)
                        {
                            expanded = false;
                            webLayer?.Hide();
                            // 显示btnForm并恢复展开按钮图片
                            btnForm.Show();
                            btnToggle.Image = Image.FromFile(imgExpand);
                            SetButtonRegion(btnForm, (Bitmap)btnToggle.Image);
                        }
                    }));
                }
            }
            catch { }
        }

        private void DisposeWebLayer()
        {
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
                try
                {
                    webLayer.Hide();
                    webLayer.Dispose();
                }
                catch { }
                webLayer = null;
            }
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

            string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "01.html");
            webView.CoreWebView2.Navigate(htmlPath);
        }

        private void Toggle()
        {
            expanded = !expanded;

            if (expanded)
            {
                CreateWebLayer();

                // 关键修改：展开后隐藏btnForm，不显示任何按钮
                btnForm.Hide();

                lock (_zOrderLock)
                {
                    _isSettingZOrder = true;
                    try
                    {
                        webLayer.Show();

                        this.BeginInvoke(new Action(() =>
                        {
                            if (webLayer != null && !webLayer.IsDisposed && webLayer.Visible)
                            {
                                ForceWebLayerTopMost();
                                ForceWindowToFront(webLayer.Handle);
                            }

                            this.BeginInvoke(new Action(() =>
                            {
                                _isSettingZOrder = false;
                            }));
                        }));
                    }
                    catch
                    {
                        _isSettingZOrder = false;
                    }
                }
            }
            else
            {
                webLayer?.Hide();
                // 收起时显示btnForm并恢复展开按钮
                btnForm.Show();
                btnToggle.Image = Image.FromFile(imgExpand);
                SetButtonRegion(btnForm, (Bitmap)btnToggle.Image);
            }
        }

        #region 窗口激活与置顶优化
        private void ForceWindowToFront(IntPtr hWnd)
        {
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
        private static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll")]
        private static extern IntPtr SetActiveWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern IntPtr SetFocus(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool BringWindowToTop(IntPtr hWnd);

        [DllImport("user32.dll", SetLastError = true)]
        private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("user32.dll")]
        private static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);

        [StructLayout(LayoutKind.Sequential)]
        private struct POINT
        {
            public int X;
            public int Y;
        }

        private const int SW_SHOW = 5;
        private const int SW_SHOWNOACTIVATE = 4;
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