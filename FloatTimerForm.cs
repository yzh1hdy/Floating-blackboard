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
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using System.Threading;
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

    public partial class FloatTimerForm : Form, IMessageFilter
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
        private Form btnForm;
        private bool expanded = false;
        private readonly Point btnPos;
        private readonly Size btnSize;

        // 外部信号监听：重复启动带 --video 参数时打开 html 视频模式
        private EventWaitHandle? _openVideoSignal;
        private volatile bool _signalThreadRunning;
        // 澶栭儴淇″彿鐩戝惉锛氶噸澶嶅惎鍔ㄥ甫 .pptx 鍙傛暟鏃堕€氱煡鍘熻繘绋嬫墦寮€ PPT 鎾斁

        // 退出验证（托盘退出时的 0721 手写验证）相关
        private Form verifyLayer;
        private WebView2 verifyWebView;
        private bool verifyActive;

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
        // 翻页模式起，透明模式下可能同时有主工具栏 + 左下/右下翻页工具栏共三个可点击区，
        // 因此把单窗口/单矩形扩展为列表：_toolbarScreenRects 记录各工具栏屏幕坐标，
        // _toolbarInputOverlays 为对应每个工具栏独立创建的点击接收覆盖窗（互不抢置顶）。
        private readonly List<Rectangle> _toolbarScreenRects = new List<Rectangle>();
        private readonly List<Form> _toolbarInputOverlays = new List<Form>();
        private static FloatTimerForm? _passthroughOwner;

        // 翻页模式（透明模式下检测 powerpnt/easinote 运行后启用）：
        // _transparentMode 由 HTML 上报；_pageTurnActive 为当前是否已向 HTML 下发启用
        private bool _transparentMode;
        private bool _pageTurnActive;
        // 是否希沃白板(easinote)窗口打开：决定翻页工具栏是否向中间主工具栏靠拢
        private bool _pageTurnSeewo;
        private System.Windows.Forms.Timer? _pageTurnCheckTimer;
        private PageTurnApp _lastDetectedApp = PageTurnApp.None;

        // PowerPoint COM 自动化（晚期绑定，不引用 PIA）：读取放映页码并调用 View.Next/Previous/Exit
        private object? _pptComApp;
        private bool _pptShowActive;
        private int _lastPptSlideIndex;
        private int _lastPptSlideTotal;
        // 上一次下发给 HTML 的 PPT 批注模式状态（enabled/seewo），仅变化时推送
        private bool _lastPptModeEnabled;
        private bool _lastPptModeSeewo;
        // 白板收起（隐藏）状态下检测到 PowerPoint 放映时自动展开批注功能，只触发一次
        private bool _autoOpenedForPpt;
        // PPT 左/右翻页按钮按下后的一次性页码补查定时器：COM Next/Previous 后索引可能滞后于定时轮询
        private System.Windows.Forms.Timer? _pptSlideRefreshTimer;
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

            #region 3. 按钮窗口：逐像素 Alpha 分层窗口，半透明边缘直接与桌面混合
            btnForm = new Form
            {
                Size = btnSize,
                Location = btnPos,
                FormBorderStyle = FormBorderStyle.None,
                TopMost = true,
                ShowInTaskbar = false,
                Text = "",
                BackColor = Color.Black,
                StartPosition = FormStartPosition.Manual,
                Cursor = Cursors.Hand
            };
            SetToolWindow(btnForm.Handle);
            EnableLayeredWindow(btnForm);
            btnForm.Click += (_, _) => Toggle();
            SetLayeredButtonImage(btnForm, imgExpand);
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
            // Focus state machine: AssertFocusState keeps focus aligned with the passthrough state:
            //   1) Not passthrough (normal non-transparent mode / transparent + non-mouse tool): focus on webview whiteboard;
            //   2) Passthrough (transparent + mouse tool): focus always stays on the underlying window.
            focusCheckTimer.Tick += (_, _) => AssertFocusState();
            focusCheckTimer.Start();

            Application.AddMessageFilter(this);

            #region 翻页模式进程检测定时器（透明模式下检测 powerpnt/easinote 运行）
            _pageTurnCheckTimer = new System.Windows.Forms.Timer { Interval = 1000 };
            _pageTurnCheckTimer.Tick += (_, _) => UpdatePageTurnMode();
            _pageTurnCheckTimer.Start();

            // PPT 翻页按钮动作后的一次性页码补查：先立即探测一次，再延时 160ms 复探一次，
            // 覆盖 COM 翻页动画期间 SlideIndex 尚未刷新的窗口
            _pptSlideRefreshTimer = new System.Windows.Forms.Timer { Interval = 160 };
            _pptSlideRefreshTimer.Tick += (_, _) =>
            {
                try { PollPowerPointShow(); } catch { }
            };
            _pptSlideRefreshTimer.Stop();
            #endregion
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

            #region 11. 外部信号监听：重复启动带 --video 参数时打开 html 视频模式
            StartOpenVideoSignalListener();
            #endregion

            _ = AutoToggleWebViewAsync();
        }

        private async Task AutoToggleWebViewAsync()//自动开关白板
        {
            await Task.Delay(3500);

            if (IsDisposed || expanded || _autoOpenedForPpt)
            {
                return;
            }

            Toggle();

            await Task.Delay(800);

            // 若这 800ms 内检测到 PowerPoint 放映并已自动展开批注，则不再自动收起白板
            if (!IsDisposed && expanded && !_autoOpenedForPpt &&
                _lastDetectedApp != PageTurnApp.PowerPoint && !_pptShowActive)
            {
                Toggle();
            }
        }

        #region 外部信号监听（重复启动带 --video 参数时打开 html 视频模式）
        /// <summary>
        /// 启动后台线程监听命名事件：第二个实例带 --video 参数重复启动时，
        /// 由 Program.Main 向该事件发信号，本方法收到后切换到 UI 线程打开 html 视频模式。
        /// </summary>
        private void StartOpenVideoSignalListener()
        {
            try
            {
                _openVideoSignal = new EventWaitHandle(false, EventResetMode.AutoReset,
                    @"Global\MyFloatWebViewTimer_7E7E7E7E_OpenVideo",
                    out bool createdNew);

                // 仅在本实例首次创建事件时设置权限：授予所有用户/所有会话(Everyone)
                // 完全访问权限。当程序由"计划任务"开机自启时，运行会话/完整性级别可能
                // 与用户随后手动启动的第二个实例不一致，导致后者 OpenExisting/Set 时被
                // 拒绝，从而只触发防重复提示而无法通知打开视频模式。显式放宽 DACL 后，
                // 任意会话/完整性级别的进程都能打开并发送该信号。
                if (createdNew)
                {
                    var eventSecurity = new EventWaitHandleSecurity();
                    eventSecurity.AddAccessRule(new EventWaitHandleAccessRule(
                        new SecurityIdentifier(WellKnownSidType.WorldSid, null),
                        EventWaitHandleRights.FullControl,
                        AccessControlType.Allow));
                    try { _openVideoSignal.SetAccessControl(eventSecurity); } catch { }
                }
                _signalThreadRunning = true;

                var t = new Thread(() =>
                {
                    while (_signalThreadRunning)
                    {
                        try
                        {
                            _openVideoSignal?.WaitOne();
                        }
                        catch
                        {
                            break;
                        }
                        if (!_signalThreadRunning) break;
                        try
                        {
                            this.BeginInvoke(new Action(async () =>
                            {
                                await OpenVideoModeFromExternalAsync();
                            }));
                        }
                        catch { }
                    }
                })
                { IsBackground = true };
                t.Start();
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"启动外部信号监听失败: {ex.Message}");
            }
        }

        /// <summary>
        /// 在 UI 线程上打开 html 视频背景（展台/视频模式）
        /// </summary>
        private async Task OpenVideoModeFromExternalAsync()
        {
            if (IsDisposed) return;
            try
            {
                // 1. 若白板未展开，先展开
                if (!expanded)
                {
                    Toggle();
                }

                // 2. 等待 webLayer 可见且 webView 核心就绪（最多约 3 秒）
                for (int i = 0; i < 30; i++)
                {
                    if (IsDisposed) return;
                    if (webLayer != null && !webLayer.IsDisposed && webLayer.Visible &&
                        webView?.CoreWebView2 != null)
                        break;
                    await Task.Delay(100);
                }

                if (IsDisposed) return;
                if (webLayer == null || webLayer.IsDisposed || webView?.CoreWebView2 == null)
                    return;

                // 3. 置顶显示白板
                webLayer.Show();
                ForceWebLayerTopMost();
                ForceWindowToFront(webLayer.Handle);
                btnForm.Hide();

                // 4. 若视频背景未开启，调用 HTML 的 toggleVideoBackground() 打开展台/视频模式
                await webView.CoreWebView2.ExecuteScriptAsync(
                    "if(typeof state!=='undefined' && state && !state.videoBackgroundEnabled){ toggleVideoBackground(); }");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"外部触发打开视频模式失败: {ex.Message}");
            }
        }

        /// <summary>
        /// 停止信号监听并释放命名事件（在 CleanupResources 中调用）
        /// </summary>
        private void StopOpenVideoSignalListener()
        {
            _signalThreadRunning = false;
            try { _openVideoSignal?.Dispose(); } catch { }
            _openVideoSignal = null;
        }
        #endregion


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
            menu.Items.Add("退出程序", null, (_, _) => ShowExitVerification());

            trayIcon.ContextMenuStrip = menu;

            // 双击托盘图标切换性能模式
            trayIcon.DoubleClick += (_, _) => TogglePerformanceMode(null, EventArgs.Empty);
        }
        #endregion


        #region 退出验证（托盘退出时的手写验证窗口）
        private void ShowExitVerification()
        {
            if (verifyActive) return;
            if (verifyLayer != null && !verifyLayer.IsDisposed) return;

            try
            {
                Rectangle wa = Screen.PrimaryScreen.WorkingArea;
                const int vw = 400, vh = 160;

                verifyLayer = new Form
                {
                    FormBorderStyle = FormBorderStyle.None,
                    TopMost = true,
                    ShowInTaskbar = false,
                    Text = "退出验证",
                    BackColor = Color.Black,
                    StartPosition = FormStartPosition.Manual,
                    Bounds = new Rectangle(wa.Right - vw, wa.Bottom - vh, vw, vh)
                };

                verifyWebView = new WebView2
                {
                    Dock = DockStyle.Fill,
                    Visible = true,
                    DefaultBackgroundColor = Color.Transparent
                };
                verifyLayer.Controls.Add(verifyWebView);
                verifyActive = true;

                verifyWebView.CoreWebView2InitializationCompleted += (s, e) =>
                {
                    if (e.IsSuccess)
                    {
                        verifyWebView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
                        verifyWebView.CoreWebView2.Navigate(
                            new Uri(ResolveHtmlPath("0721手写检测.html")).AbsoluteUri);
                    }
                };
                verifyWebView.WebMessageReceived += HandleVerifyMessage;

                if (_webViewEnvironment != null)
                    _ = verifyWebView.EnsureCoreWebView2Async(_webViewEnvironment);
                else
                    _ = verifyWebView.EnsureCoreWebView2Async();

                verifyLayer.Show();
                verifyLayer.Activate();
            }
            catch (Exception ex)
            {
                CloseVerifyLayer();
                ShowBalloonTip("退出验证", "无法打开验证窗口: " + ex.Message);
            }
        }

        // 处理验证窗口 HTML 上报的消息（verifyResult / verifyCancel）
        private void HandleVerifyMessage(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            try
            {
                string message = e.TryGetWebMessageAsString();
                if (string.IsNullOrEmpty(message)) return;
                using var doc = JsonDocument.Parse(message);
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var typeProp)) return;
                string type = typeProp.GetString() ?? "";
                bool ok = root.TryGetProperty("ok", out var okProp) && okProp.GetBoolean();

                this.Invoke(new Action(() =>
                {
                    if (type == "verifyResult")
                    {
                        if (ok)
                        {
                            // 手写正确：关闭验证窗口并退出程序
                            CloseVerifyLayer();
                            trayIcon.Visible = false;
                            Application.Exit();
                        }
                        else
                        {
                            // 手写错误：关闭验证窗口，程序不退出，走系统通知
                            CloseVerifyLayer();
                            ShowBalloonTip("退出验证失败", "手写内容不正确，程序未退出");
                        }
                    }
                    else if (type == "verifyCancel")
                    {
                        // 用户点击右上角关闭：取消退出
                        CloseVerifyLayer();
                        ShowBalloonTip("退出已取消", "程序将继续运行");
                    }
                }));
            }
            catch { }
        }

        private void CloseVerifyLayer()
        {
            verifyActive = false;
            if (verifyWebView != null)
            {
                try { verifyWebView.WebMessageReceived -= HandleVerifyMessage; verifyWebView.Dispose(); } catch { }
                verifyWebView = null;
            }
            if (verifyLayer != null)
            {
                try { verifyLayer.Hide(); verifyLayer.Dispose(); } catch { }
                verifyLayer = null;
            }
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
            StopOpenVideoSignalListener();
            ReleasePptComObject();

            Application.RemoveMessageFilter(this);

            topMostTimer?.Stop();
            topMostTimer?.Dispose();
            focusCheckTimer?.Stop();
            focusCheckTimer?.Dispose();

            _pageTurnCheckTimer?.Stop();
            _pageTurnCheckTimer?.Dispose();
            _pptSlideRefreshTimer?.Stop();
            _pptSlideRefreshTimer?.Dispose();

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
                        SetMousePassthrough(false, new List<Rectangle>());
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

        // 处理来自HTML的JSON消息（支持：setMousePassthrough 鼠标穿透；setTransparentMode 透明模式；
        // pageTurnAction 翻页按键；savePhoto/listPhotos/clearAlbum 相册）
        private void HandleHostMessage(string json)
        {
            try
            {
                using var doc = JsonDocument.Parse(json);
                var root = doc.RootElement;
                if (!root.TryGetProperty("type", out var typeProp)) return;
                string messageType = typeProp.GetString() ?? "";

                if (messageType == "setMousePassthrough")
                {
                    HandleMousePassthroughMessage(root);
                }
                else if (messageType == "setTransparentMode")
                {
                    bool enabled = root.TryGetProperty("enabled", out var tProp) && tProp.GetBoolean();
                    this.Invoke(new Action(() =>
                    {
                        _transparentMode = enabled;
                        if (enabled)
                        {
                            // 进入透明模式时强制重发批注/翻页状态：此前非透明（含收起态前端守卫）
                            // 可能已置位去重标记，导致进入信号被跳过、前端不进批注态
                            _lastPptModeEnabled = false;
                            _lastPptModeSeewo = false;
                            _pageTurnActive = false;
                            _pageTurnSeewo = false;
                        }
                        UpdatePageTurnMode();
                    }));
                }
                else if (messageType == "pageTurnAction")
                {
                    string action = root.TryGetProperty("action", out var aProp)
                        ? (aProp.GetString() ?? "") : "";
                    this.Invoke(new Action(() => HandlePageTurnAction(action)));
                }
                else
                {
                    // 相册相关消息交由专门处理
                    HandleAlbumMessage(messageType, root);
                }
            }
            catch { }
        }

        // 解析 setMousePassthrough：读取 dpr、toolbar（兼容旧版）、toolbars（多个工具栏）并设置穿透
        private void HandleMousePassthroughMessage(JsonElement root)
        {
            bool enabled = root.TryGetProperty("enabled", out var enabledProp) && enabledProp.GetBoolean();
            var rects = new List<Rectangle>();
            if (enabled)
            {
                // 工具栏豁免区（CSS像素 → 物理像素）：JS端同时上报 devicePixelRatio
                double scale = 1.0;
                if (root.TryGetProperty("dpr", out var dprProp)) scale = dprProp.GetDouble();

                if (root.TryGetProperty("toolbars", out var toolbarsProp) &&
                    toolbarsProp.ValueKind == JsonValueKind.Array)
                {
                    foreach (var t in toolbarsProp.EnumerateArray())
                    {
                        Rectangle r = ParseToolbarRect(t, scale);
                        if (r.Width > 0 && r.Height > 0) rects.Add(r);
                    }
                }
                // 兼容旧版只上报单工具栏的情况
                if (rects.Count == 0 && root.TryGetProperty("toolbar", out var toolbarProp))
                {
                    Rectangle r = ParseToolbarRect(toolbarProp, scale);
                    if (r.Width > 0 && r.Height > 0) rects.Add(r);
                }
            }
            var list = rects;
            this.Invoke(new Action(() => SetMousePassthrough(enabled, list)));
        }

        private static Rectangle ParseToolbarRect(JsonElement t, double scale)
        {
            try
            {
                int x = (int)Math.Round(t.GetProperty("x").GetDouble() * scale);
                int y = (int)Math.Round(t.GetProperty("y").GetDouble() * scale);
                int w = (int)Math.Round(t.GetProperty("width").GetDouble() * scale);
                int h = (int)Math.Round(t.GetProperty("height").GetDouble() * scale);
                return new Rectangle(x, y, w, h);
            }
            catch { return Rectangle.Empty; }
        }

        // 设置鼠标穿透：开启后拦截 WebView 窗口的命中测试，除各工具栏豁免区外全部点击穿透。
        // toolbarRects 为各工具栏屏幕坐标列表（主工具栏 + 左下/右下翻页工具栏）。
        private void SetMousePassthrough(bool enabled, List<Rectangle> toolbarRects)
        {
            _passthroughActive = enabled;
            _passthroughOwner = enabled ? this : null;

            if (enabled && webLayer != null && !webLayer.IsDisposed)
            {
                // HTML 上报的是 WebView 视口坐标，转换成屏幕坐标后为每个工具栏创建独立的点击接收窗。
                _toolbarScreenRects.Clear();
                foreach (var r in toolbarRects)
                {
                    var sr = r;
                    sr.Offset(webLayer.Left, webLayer.Top);
                    if (sr.Width > 0 && sr.Height > 0) _toolbarScreenRects.Add(sr);
                }
                SetClickThroughStyle(webLayer.Handle, true);
                CreateToolbarInputOverlays();
                // 穿透开启后，让白板/WebView 让出焦点，焦点交给下层的程序
                ReleaseWebLayerFocus();
            }
            else
            {
                _toolbarScreenRects.Clear();
                RemoveToolbarInputOverlays();
                if (webLayer != null && !webLayer.IsDisposed)
                {
                    SetClickThroughStyle(webLayer.Handle, false);
                }
                _passthroughOwner = null;
            }

            Debug.WriteLine(enabled
                ? $"鼠标穿透已开启，工具栏由独立覆盖窗接收({_toolbarScreenRects.Count}个): {string.Join(";", _toolbarScreenRects)}"
                : "鼠标穿透已关闭");
        }

        #region 焦点交接（鼠标穿透时把焦点交给下层程序）
        // 记录被本程序抢走焦点前的下层前台窗口，穿透开启时用其交还焦点
        // Focus state machine: invoked by focusCheckTimer every 100ms to keep focus aligned with:
        //   1) Not passthrough (normal mode / transparent + non-mouse tool): focus stays on webview;
        //   2) Passthrough (transparent + mouse tool): focus always goes to the underlying window.
        private void AssertFocusState()
        {
            if (webLayer == null || webLayer.IsDisposed || !webLayer.Visible) return;
            if (webView == null || webView.IsDisposed) return;

            IntPtr fgWindow = GetForegroundWindow();

            // 透明 + 鼠标工具（穿透开启）：无论前台窗口是谁（包括白板自身），
            // 焦点都必须交给下层窗口，保证"任何时候选中鼠标工具，焦点都在下层窗口"。
            if (_passthroughActive)
            {
                if (fgWindow == IntPtr.Zero) return;
                if (IsOwnWindow(fgWindow))
                {
                    ReleaseWebLayerFocus();
                }
                else
                {
                    // 记住最近一个持有焦点的外部窗口，作为交还焦点的目标
                    _previousForegroundWindow = fgWindow;
                }
                return;
            }

            // 非穿透（普通模式 / 透明 + 非鼠标工具）：焦点必须保持在白板 WebView 上。
            if (fgWindow == webLayer.Handle)
            {
                // 窗口已在前台，但还需确保键盘焦点真正落在 WebView 控件上（而非白板空窗体）
                EnsureWebViewFocused();
                return;
            }

            // 前台是其他窗口：仅当鼠标位于白板区域内（用户正在使用白板），
            // 或焦点被本程序自己的窗口（按钮/动画层等）占用时，才把焦点收回白板，
            // 避免在多显示器等场景下打扰用户操作其他程序。
            GetCursorPos(out POINT cursorPos);
            Rectangle webLayerRect = new Rectangle(webLayer.Location, webLayer.Size);
            bool cursorOverWhiteboard = webLayerRect.Contains(cursorPos.X, cursorPos.Y);
            bool focusOnOwnWindow = fgWindow != IntPtr.Zero && IsOwnWindow(fgWindow);
            if (!cursorOverWhiteboard && !focusOnOwnWindow) return;

            ForceFocusToWebLayer();
        }

        // 把前台切到白板，并确保 WebView 控件拿到键盘焦点
        private void ForceFocusToWebLayer()
        {
            if (webLayer == null || webLayer.IsDisposed || !webLayer.Visible) return;
            ForceWindowToFront(webLayer.Handle);
            EnsureWebViewFocused();
        }

        // 确保键盘焦点落在 WebView 控件上（仅非穿透模式调用，避免破坏穿透点击）
        private void EnsureWebViewFocused()
        {
            if (_passthroughActive) return;
            if (webView == null || webView.IsDisposed) return;
            try
            {
                if (!webView.Focused)
                {
                    webView.Focus();
                }
            }
            catch { }
        }

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
                IsWindowVisible(_previousForegroundWindow) &&
                !IsOwnWindow(_previousForegroundWindow))
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
            if (_toolbarInputOverlays.Any(o => !o.IsDisposed && h == o.Handle)) return true;
            return false;
        }
        #endregion

        // 为每个工具栏（主工具栏 + 左下/右下翻页工具栏）创建独立的点击接收覆盖窗。
        // 各覆盖窗在创建时一次性置顶并按固定顺序叠放，不在定时器里重复抢置顶，
        // 因此三个窗口之间互不抢占 Z 序；覆盖窗之间互不重叠，层级顺序不影响使用。
        private void CreateToolbarInputOverlays()
        {
            RemoveToolbarInputOverlays();
            if (_toolbarScreenRects.Count == 0) return;

            foreach (var rect in _toolbarScreenRects)
            {
                var overlay = new Form
                {
                    FormBorderStyle = FormBorderStyle.None,
                    ShowInTaskbar = false,
                    ShowIcon = false,
                    TopMost = true,
                    StartPosition = FormStartPosition.Manual,
                    Bounds = rect,
                    BackColor = Color.Black,
                    Opacity = 0.005,
                    Text = ""
                };
                SetToolWindow(overlay.Handle);
                SetWindowLong(overlay.Handle, GWL_EXSTYLE,
                    GetWindowLong(overlay.Handle, GWL_EXSTYLE) | 0x08000000);

                overlay.MouseDown += (_, e) => ForwardPassthroughPointer("down", overlay, e);
                overlay.MouseMove += (_, e) => ForwardPassthroughPointer("move", overlay, e);
                overlay.MouseUp += (_, e) => ForwardPassthroughPointer("up", overlay, e);
                // 不设置 owner，避免 owner 的层级/激活状态把覆盖窗压到 WebView 后面。
                overlay.Show();
                SetWindowPos(overlay.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE | SWP_SHOWWINDOW);
                _toolbarInputOverlays.Add(overlay);
            }
        }

        private void RemoveToolbarInputOverlays()
        {
            foreach (var overlay in _toolbarInputOverlays)
            {
                try
                {
                    if (!overlay.IsDisposed) overlay.Close();
                    overlay.Dispose();
                }
                catch { }
            }
            _toolbarInputOverlays.Clear();
        }

        private void ForwardPassthroughPointer(string action, Form overlay, MouseEventArgs e)
        {
            if (!_passthroughActive || webView?.CoreWebView2 == null || webLayer == null) return;
            if (overlay == null || overlay.IsDisposed) return;

            // 【修复】快速点击时 MouseUp 可能在覆盖窗外释放而丢失，
            // 导致 JS 端永远收不到 up，工具栏点击状态卡死。
            // 在 down 时捕获鼠标到覆盖窗，确保 up 一定被转发。
            if (action == "down")
            {
                overlay.Capture = true;
            }
            else if (action == "up")
            {
                overlay.Capture = false;
            }

            Point screenPoint = overlay.PointToScreen(e.Location);
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
                if (!IsInsideAnyToolbarRect(owner, x, y))
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

        #region 翻页模式（透明模式下检测 powerpnt/easinote 运行）
        // 判断屏幕坐标是否落在任一工具栏豁免区（主工具栏 + 左下/右下翻页工具栏）
        private static bool IsInsideAnyToolbarRect(FloatTimerForm owner, int x, int y)
        {
            foreach (var r in owner._toolbarScreenRects)
            {
                if (r.Contains(x, y)) return true;
            }
            return false;
        }

        // 翻页目标程序类型：None=无；PowerPoint=仅 PPT 运行；EasiNote=希沃白板窗口已打开
        private enum PageTurnApp { None, PowerPoint, EasiNote }

        // 检测 powerpnt.exe / easinote.exe 是否在运行（翻页模式）
        // 1) 进程名用忽略大小写比较：Process.ProcessName 返回的是磁盘上 exe 的原样大小写
        //    （如 PowerPoint 为 POWERPNT，希沃可能为 EasiNote 等），原 == 比较会漏判导致检测无效。
        // 2) 希沃白板（easinote）要求存在实际窗口（MainWindowHandle != 0）才视为正在使用，
        //    避免其仅以后台进程运行（无窗口）时也误触发 HTML 翻页模式。
        // 3) 希沃白板窗口打开时优先返回 EasiNote（即使 PPT 同时运行），供 HTML 据此把
        //    左下/右下翻页工具栏向屏幕中间主工具栏靠拢，避开希沃自身的边角工具。
        private static PageTurnApp DetectPageTurnApp()
        {
            bool ppt = false;

            // 一次性采集当前所有进程，避免循环内反复枚举
            List<Process> procs = new List<Process>();
            foreach (var p in Process.GetProcesses())
            {
                try { procs.Add(p); } catch { }
            }

            // 采集一次 父进程ID -> 子进程PID 映射，供 PPT 检测其子进程的全屏窗口
            var children = BuildChildProcessMap();

            foreach (var p in procs)
            {
                try
                {
                    string name = p.ProcessName;
                    if (string.Equals(name, "easinote", StringComparison.OrdinalIgnoreCase))
                    {
                        p.Refresh(); // 刷新缓存，确保拿到当前的主窗口句柄
                        if (p.MainWindowHandle != IntPtr.Zero)
                        {
                            return PageTurnApp.EasiNote; // 希沃白板：存在实际窗口，优先返回
                        }
                    }
                    else if (string.Equals(name, "powerpnt", StringComparison.OrdinalIgnoreCase))
                    {
                        // PowerPoint：仅当自身或其子进程存在全屏窗口才视为运行
                        if (ProcessOrChildrenHasFullscreenWindow(p, children))
                        {
                            ppt = true;
                        }
                    }
                }
                catch { }
            }
            return ppt ? PageTurnApp.PowerPoint : PageTurnApp.None;
        }

        // 采集所有进程的 父进程ID -> 子进程PID 列表（用进程快照实现，无需额外引用 System.Management）
        private static Dictionary<int, List<int>> BuildChildProcessMap()
        {
            var map = new Dictionary<int, List<int>>();
            IntPtr snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
            if (snap == IntPtr.Zero) return map;
            try
            {
                PROCESSENTRY32 entry = new PROCESSENTRY32 { dwSize = (uint)Marshal.SizeOf(typeof(PROCESSENTRY32)) };
                if (Process32First(snap, ref entry))
                {
                    do
                    {
                        int ppid = (int)entry.th32ParentProcessID;
                        int pid = (int)entry.th32ProcessID;
                        if (!map.TryGetValue(ppid, out var list))
                        {
                            list = new List<int>();
                            map[ppid] = list;
                        }
                        list.Add(pid);
                    } while (Process32Next(snap, ref entry));
                }
            }
            catch { }
            finally
            {
                CloseHandle(snap);
            }
            return map;
        }

        // 判断进程自身或其任一直接子进程是否拥有一个全屏可见窗口
        private static bool ProcessOrChildrenHasFullscreenWindow(Process p, Dictionary<int, List<int>> children)
        {
            if (ProcessHasFullscreenWindow(p)) return true;

            if (children != null && children.TryGetValue(p.Id, out var childPids))
            {
                foreach (int cpid in childPids)
                {
                    try
                    {
                        using (var child = Process.GetProcessById(cpid))
                        {
                            if (ProcessHasFullscreenWindow(child)) return true;
                        }
                    }
                    catch { } // 子进程可能已在采集后退出
                }
            }
            return false;
        }

        // 枚举指定进程拥有的全部顶层窗口，只要其中任一可见窗口为全屏即视为命中
        private static bool ProcessHasFullscreenWindow(Process p)
        {
            bool hasFullscreen = false;
            uint targetPid = (uint)p.Id;
            EnumWindows((hWnd, lParam) =>
            {
                uint wndPid;
                GetWindowThreadProcessId(hWnd, out wndPid);
                if (wndPid == targetPid && IsWindowVisible(hWnd) && IsWindowFullscreen(hWnd))
                {
                    hasFullscreen = true;
                    return false; // 找到即停止枚举
                }
                return true;
            }, IntPtr.Zero);
            return hasFullscreen;
        }

        // 判断窗口是否真正"全屏"：铺满其所在屏幕，且无标题栏（排除最大化带标题栏的编辑窗口）
        private static bool IsWindowFullscreen(IntPtr hWnd)
        {
            RECT r;
            if (!GetWindowRect(hWnd, out r)) return false;
            int w = r.Right - r.Left;
            int h = r.Bottom - r.Top;
            Screen scr = Screen.FromHandle(hWnd);
            Rectangle sb = scr.Bounds;
            if (Math.Abs(w - sb.Width) > 2 || Math.Abs(h - sb.Height) > 2) return false;
            if (r.Left > sb.Left || r.Top > sb.Top) return false;
            // 真正的全屏（如 PPT 放映窗口）通常是无标题栏的弹出窗口；最大化窗口带标题栏，应排除
            int style = GetWindowLong(hWnd, GWL_STYLE);
            return (style & (int)WS_CAPTION) == 0;
        }

        // 依据 透明模式 && 目标程序运行 计算应启用翻页，状态变化时通知 HTML（pageTurnMode）
        // 同时把希沃白板是否打开（seewo）一并下发，HTML 据此调整翻页工具栏的位置。
        private void UpdatePageTurnMode()
        {
            // 白板已展开但处于非透明普通白板时，不检测 PowerPoint/希沃：进程扫描与 COM 轮询
            // 全部跳过，并复位可能残留的翻页/批注状态，通知前端退出批注态。
            // 白板收起（仅显示展开按钮）时不跳过：保留检测，以便发现 PPT 放映后自动展开并进入透明批注。
            if (expanded && !_transparentMode)
            {
                ResetPageTurnAndPptState();
                return;
            }

            var app = DetectPageTurnApp();
            _lastDetectedApp = app;

            // COM 轮询 PowerPoint 放映状态与页码
            PollPowerPointShow();

            // PPT 批注目标：进程检测到 PowerPoint，或 COM 确认放映窗口存在
            bool pptTarget = app == PageTurnApp.PowerPoint || _pptShowActive;
            bool seewo = app == PageTurnApp.EasiNote;

            // 白板收起（隐藏）状态下检测到 PowerPoint 放映：自动展开白板并启动叠加批注
            if (pptTarget && !expanded && !_autoOpenedForPpt)
            {
                _autoOpenedForPpt = true;
                try { Toggle(); } catch { }
            }
            if (!pptTarget) _autoOpenedForPpt = false;

            // 已展开且处于 PPT 目标：自动调用 HTML toggleTransparentMode() 开启透明叠加批注；
            // 收起态检测到目标并自动展开后，靠这里把 HTML 切到透明模式
            if (pptTarget && expanded) EnsureTransparentForPpt();

            // 独立下发 PPT 批注模式状态，前端据此进入/退出批注态、替换按钮图标
            if (pptTarget != _lastPptModeEnabled || seewo != _lastPptModeSeewo)
            {
                _lastPptModeEnabled = pptTarget;
                _lastPptModeSeewo = seewo;
                PostPptModeMessage(pptTarget && !seewo, seewo, _lastPptSlideTotal);
            }

            // 翻页工具栏：透明模式且有目标程序，或 COM 已确认放映窗口时显示
            bool desired = (app != PageTurnApp.None) || _pptShowActive;
            if (desired == _pageTurnActive && seewo == _pageTurnSeewo) return;
            _pageTurnActive = desired;
            _pageTurnSeewo = seewo;

            if (webView?.CoreWebView2 == null) return;
            var json = JsonSerializer.Serialize(new { type = "pageTurnMode", enabled = desired, seewo = seewo });
            try { webView.CoreWebView2.PostWebMessageAsJson(json); }
            catch { }
        }

        // 复位翻页/PPT 批注全部状态并通知前端退出；用于非透明模式（不再检测）或目标消失。
        private void ResetPageTurnAndPptState()
        {
            _lastDetectedApp = PageTurnApp.None;

            if (_pptShowActive)
            {
                _pptShowActive = false;
                _lastPptSlideIndex = 0;
                _lastPptSlideTotal = 0;
                PostPptSlideMessage(false, 0, 0);
            }

            if (_lastPptModeEnabled || _lastPptModeSeewo)
            {
                _lastPptModeEnabled = false;
                _lastPptModeSeewo = false;
                PostPptModeMessage(false, false, 0);
            }

            if (_pageTurnActive || _pageTurnSeewo)
            {
                _pageTurnActive = false;
                _pageTurnSeewo = false;
                if (webView?.CoreWebView2 != null)
                {
                    var json = JsonSerializer.Serialize(new { type = "pageTurnMode", enabled = false, seewo = false });
                    try { webView.CoreWebView2.PostWebMessageAsJson(json); } catch { }
                }
            }
            _autoOpenedForPpt = false;
        }

        // PPT 批注态下执行翻页动作后调用：立即探测一次页码，再由定时器延时复探一次
        private void RequestPptSlideRefresh()
        {
            try { PollPowerPointShow(); } catch { }
            if (_pptSlideRefreshTimer == null) return;
            try
            {
                _pptSlideRefreshTimer.Stop();
                _pptSlideRefreshTimer.Start();
            }
            catch { }
        }

        private static bool IsPagingAction(string action)
        {
            switch (action)
            {
                case "left": case "right": case "up": case "down":
                case "pageup": case "pagedown":
                    return true;
                default:
                    return false;
            }
        }

        private void PostPptModeMessage(bool enabled, bool seewo, int total)
        {
            if (webView?.CoreWebView2 == null) return;
            try
            {
                var json = JsonSerializer.Serialize(new
                {
                    type = "pptMode",
                    enabled = enabled,
                    seewo = seewo,
                    total = total
                });
                webView.CoreWebView2.PostWebMessageAsJson(json);
            }
            catch { }
        }

        // ===== PowerPoint COM 自动化（晚期绑定，不引用 PIA；仅接入已运行实例，不主动新建窗口）=====
        // .NET (Core) 未提供 Marshal.GetActiveObject，这里直接 P/Invoke ole32；
        // 快速路径按 ProgID 取 ROT 实例，失败时枚举 ROT 全部运行对象并探测 SlideShowWindows。
        [DllImport("ole32.dll")]
        private static extern int CLSIDFromProgID([MarshalAs(UnmanagedType.LPWStr)] string lpszProgID, out Guid pclsid);

        [DllImport("ole32.dll")]
        private static extern int GetActiveObject(ref Guid rclsid, IntPtr pvReserved, out IntPtr ppunk);

        [DllImport("ole32.dll")]
        private static extern int GetRunningObjectTable(int reserved, out IRunningObjectTable prot);

        [ComImport, Guid("0000000F-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMoniker { }

        [ComImport, Guid("00000102-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IEnumMoniker
        {
            [PreserveSig] int Next(int celt, [MarshalAs(UnmanagedType.IUnknown)] out object? rgelt, out int pceltFetched);
            [PreserveSig] int Skip(int celt);
            void Reset();
            void Clone(out IEnumMoniker ppenum);
        }

        [ComImport, Guid("00000010-0000-0000-C000-000000000046"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IRunningObjectTable
        {
            void Register(int grfFlags, [MarshalAs(UnmanagedType.IUnknown)] object punkObject, IMoniker pmkObjectName, out int dwRegister);
            void Revoke(int dwRegister);
            [PreserveSig] int IsRunning(IMoniker pmkObjectName);
            [PreserveSig] int GetObject(IMoniker pmkObjectName, [MarshalAs(UnmanagedType.IUnknown)] out object? ppunkObject);
            void NoteChangeTime(int dwRegister, IntPtr pfiletime);
            void GetTimeOfLastChange(IMoniker pmkObjectName, IntPtr pfiletime);
            [PreserveSig] int EnumRunning(out IEnumMoniker ppenumMoniker);
        }

        private object? TryGetPptComApp()
        {
            if (_pptComApp != null)
            {
                try { _ = ((dynamic)_pptComApp).SlideShowWindows.Count; return _pptComApp; }
                catch { ReleasePptComObject(); }
            }

            // 快速路径：按 ProgID 从 ROT 取运行实例
            IntPtr punk = IntPtr.Zero;
            try
            {
                Guid clsid;
                if (CLSIDFromProgID("PowerPoint.Application", out clsid) == 0 &&
                    GetActiveObject(ref clsid, IntPtr.Zero, out punk) == 0 && punk != IntPtr.Zero)
                {
                    _pptComApp = System.Runtime.InteropServices.Marshal.GetObjectForIUnknown(punk);
                    return _pptComApp;
                }
            }
            catch { _pptComApp = null; }
            finally
            {
                if (punk != IntPtr.Zero)
                {
                    try { System.Runtime.InteropServices.Marshal.Release(punk); } catch { }
                }
            }

            // 兜底：枚举 ROT 全部运行对象，探测出带 SlideShowWindows 集合的 PowerPoint 实例
            _pptComApp = FindPptAppFromRot();
            return _pptComApp;
        }

        private object? FindPptAppFromRot()
        {
            try
            {
                if (GetRunningObjectTable(0, out var rot) != 0 || rot == null) return null;
                if (rot.EnumRunning(out var en) != 0 || en == null) return null;
                while (true)
                {
                    if (en.Next(1, out var mk, out int fetched) != 0 || fetched < 1 || mk == null) break;
                    try
                    {
                        if (rot.GetObject((IMoniker)mk, out var obj) == 0 && obj != null)
                        {
                            dynamic d = obj;
                            _ = d.SlideShowWindows.Count;
                            return obj;
                        }
                    }
                    catch { }
                }
            }
            catch { }
            return null;
        }

        private void ReleasePptComObject()
        {
            if (_pptComApp != null)
            {
                try { System.Runtime.InteropServices.Marshal.ReleaseComObject(_pptComApp); } catch { }
                _pptComApp = null;
            }
        }

        // 取当前放映窗口的 View；无放映窗口时返回 null
        private dynamic? GetShowView()
        {
            object? app = TryGetPptComApp();
            if (app == null)
            {
                Debug.WriteLine("[PPT] COM 未取得 PowerPoint 实例（ROT/GetActiveObject 均失败）");
                return null;
            }
            try
            {
                dynamic d = app;
                int count = Convert.ToInt32(d.SlideShowWindows.Count);
                if (count >= 1)
                {
                    // 显式调用 Item(1) 优先，避免晚期绑定把集合索引器 [1] 误解析为不存在的默认属性；
                    // Item 取不到时回退到 [1] 索引器，兼容不同 Office 版本的 IDispatch 暴露方式。
                    dynamic win;
                    try { win = d.SlideShowWindows.Item(1); }
                    catch { win = d.SlideShowWindows[1]; }
                    return win.View;
                }
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"[PPT] GetShowView 取放映窗口失败: {ex.Message}");
            }
            return null;
        }

        // 轮询放映状态：有放映窗口时读取页码并在变化时通知 HTML；放映结束时通知退出批注模式
        private void PollPowerPointShow()
        {
            try
            {
                dynamic? view = GetShowView();
                if (view == null)
                {
                    if (_pptShowActive)
                    {
                        Debug.WriteLine("[PPT] 放映窗口已关闭，退出批注态");
                        _pptShowActive = false;
                        _lastPptSlideIndex = 0;
                        _lastPptSlideTotal = 0;
                        PostPptSlideMessage(false, 0, 0);
                    }
                    return;
                }

                int index = 0, total = 0;
                try
                {
                    // 优先用放映位置 CurrentShowPosition（直接反映当前放映到第几张）；
                    // 不可用时回退到 view.Slide.SlideIndex。
                    try { index = Convert.ToInt32(view.CurrentShowPosition); }
                    catch
                    {
                        dynamic slide = view.Slide;
                        index = Convert.ToInt32(slide.SlideIndex);
                    }
                    try { dynamic pres = view.Presentation; total = Convert.ToInt32(pres.Slides.Count); }
                    catch { total = 0; }
                    Debug.WriteLine($"[PPT] 读取页码: index={index}, total={total}");
                }
                catch (Exception ex)
                {
                    Debug.WriteLine($"[PPT] 读取页码失败: {ex.Message}");
                    return;
                }

                if (!_pptShowActive)
                {
                    _pptShowActive = true;
                    _lastPptSlideIndex = index;
                    _lastPptSlideTotal = total;
                    PostPptSlideMessage(true, index, total);
                    EnsureTransparentForPpt();
                    return;
                }

                if (index != _lastPptSlideIndex || total != _lastPptSlideTotal)
                {
                    _lastPptSlideIndex = index;
                    _lastPptSlideTotal = total;
                    PostPptSlideMessage(true, index, total);
                }
            }
            catch { }
        }

        private void PostPptSlideMessage(bool active, int index, int total)
        {
            if (webView?.CoreWebView2 == null) return;
            try
            {
                var json = JsonSerializer.Serialize(new
                {
                    type = "pptSlide",
                    active = active,
                    index = index,
                    total = total
                });
                webView.CoreWebView2.PostWebMessageAsJson(json);
            }
            catch { }
        }

        // 白板已展开但未进入透明模式时，自动调用 HTML toggleTransparentMode() 开启叠加批注；
        // 每轮轮询重试，直到 HTML 回调 setTransparentMode 把 _transparentMode 置为 true
        private void EnsureTransparentForPpt()
        {
            if (!expanded || _transparentMode) return;
            if (webView?.CoreWebView2 == null) return;
            try
            {
                _ = webView.CoreWebView2.ExecuteScriptAsync(
                    "if(typeof state!=='undefined'&&state&&!state.transparentMode&&typeof toggleTransparentMode==='function'){toggleTransparentMode();}");
            }
            catch { }
        }

        // 通过 COM 执行放映动作；COM 不可用或调用失败时返回 false，由调用方回退到按键模拟
        private bool TryPptComAction(string action)
        {
            dynamic? view = GetShowView();
            if (view == null) return false;
            try
            {
                switch (action)
                {
                    case "next": view.Next(); return true;
                    case "prev": view.Previous(); return true;
                    case "exit": view.Exit(); return true;
                }
            }
            catch { }
            return false;
        }


        // 处理 HTML 翻页按钮动作：
        // PowerPoint 放映优先使用 COM View.Next()/Previous()/Exit()；希沃白板等其余目标保留按键模拟。
        private void HandlePageTurnAction(string action)
        {
            try
            {
                bool pptActive = _pptShowActive || _lastDetectedApp == PageTurnApp.PowerPoint;
                bool comDone = false;
                if (pptActive)
                {
                    string comAction;
                    switch (action)
                    {
                        case "right": case "down": case "pagedown": comAction = "next"; break;
                        case "left": case "up": case "pageup": comAction = "prev"; break;
                        case "exit": comAction = "exit"; break;
                        default: comAction = null; break;
                    }
                    // 退出优先 COM View.Exit()（仅结束放映，不关闭 PowerPoint 窗口）；
                    // COM 不可用时回退 Esc 结束放映，绝不 Alt+F4 关掉程序窗口。
                    if (comAction == "exit")
                    {
                        if (!TryPptComAction("exit"))
                        {
                            IntPtr t = FindPageTurnTargetWindow();
                            if (t != IntPtr.Zero) { GiveFocusToWindow(t); SimulateKey(0, Keys.Escape); }
                        }
                        return;
                    }
                    if (comAction != null) comDone = TryPptComAction(comAction);
                }

                if (!comDone)
                {
                    IntPtr target = FindPageTurnTargetWindow();
                    if (target != IntPtr.Zero)
                    {
                        GiveFocusToWindow(target);

                        switch (action)
                        {
                            case "exit":
                                SimulateKey((byte)Keys.LMenu, Keys.F4); // Alt+F4 退出放映
                                break;
                            case "left":
                                SimulateKey(0, Keys.Left); // 上一页
                                break;
                            case "right":
                                SimulateKey(0, Keys.Right); // 下一页
                                break;
                            case "up":
                                SimulateKey(0, Keys.Up);
                                break;
                            case "down":
                                SimulateKey(0, Keys.Down);
                                break;
                            case "pageup":
                                SimulateKey(0, Keys.PageUp);
                                break;
                            case "pagedown":
                                SimulateKey(0, Keys.PageDown);
                                break;
                        }
                    }
                }

                // PPT 放映批注态下，每按一次左/右（含上下翻页/PageUp/PageDown）触发一次页码检测：
                // 立即探测一次，定时器再延时复探一次，避免依赖 1s 定时轮询造成页码/笔迹切换滞后
                if (pptActive && IsPagingAction(action)) RequestPptSlideRefresh();
            }
            catch { }
        }


        // 确定翻页按键应发送的目标窗口：优先当前前台的外部窗口；
        // 若前台是本程序自身窗口（含白板 webview），则退回最近记录的下层窗口或白板正下方窗口。
        private IntPtr FindPageTurnTargetWindow()
        {
            IntPtr fg = GetForegroundWindow();
            if (fg != IntPtr.Zero && !IsOwnWindow(fg)) return fg;

            if (_previousForegroundWindow != IntPtr.Zero &&
                IsWindow(_previousForegroundWindow) &&
                IsWindowVisible(_previousForegroundWindow) &&
                !IsOwnWindow(_previousForegroundWindow))
            {
                return _previousForegroundWindow;
            }

            return FindWindowBelowWebLayer();
        }

        // 模拟一次按键（可按需携带 Alt 修饰键），发送到当前前台窗口
        private static void SimulateKey(byte modifier, Keys key)
        {
            byte vk = (byte)key;
            if (modifier != 0) keybd_event(modifier, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, 0, UIntPtr.Zero);
            keybd_event(vk, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
            if (modifier != 0) keybd_event(modifier, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        }
        #endregion

        #region PageTurnKeyboardForward (forward arrow/page keys from WebView to lower window)
        private const int WM_KEYDOWN = 0x0100;
        private const int WM_KEYUP = 0x0101;
        private const int WM_SYSKEYDOWN = 0x0104;
        private const int WM_SYSKEYUP = 0x0105;

        // IMessageFilter: intercept keys before dispatch so HTML never receives them; forward via C#
        public bool PreFilterMessage(ref Message m)
        {
            // only while page-turn mode active (transparent mode && powerpnt/easinote running)
            if (!_pageTurnActive) return false;

            bool isDown = m.Msg == WM_KEYDOWN || m.Msg == WM_SYSKEYDOWN;
            bool isUp = m.Msg == WM_KEYUP || m.Msg == WM_SYSKEYUP;
            if (!isDown && !isUp) return false;

            // only intercept keys targeted at the main WebView (or its child windows)
            if (!IsWebViewWindow(m.HWnd)) return false;

            // keys to forward to the lower window: arrows + page/locate keys
            Keys key = (Keys)(int)m.WParam;
            switch (key)
            {
                case Keys.Left:
                case Keys.Right:
                case Keys.Up:
                case Keys.Down:
                case Keys.PageUp:
                case Keys.PageDown:
                case Keys.Home:
                case Keys.End:
                case Keys.Space:
                case Keys.Return:
                    break;
                default:
                    return false;
            }

            // forward on key-down; on key-up just swallow to avoid a stray keyup in HTML
            if (isDown)
            {
                ForwardKeyToLowerWindow(key);
            }

            return true; // handled: HTML does not receive this key
        }

        // check whether an hWnd belongs to the main WebView or any of its descendants
        private bool IsWebViewWindow(IntPtr hWnd)
        {
            if (hWnd == IntPtr.Zero) return false;
            if (webView == null || webView.IsDisposed) return false;
            IntPtr root = webView.Handle;
            if (root == IntPtr.Zero) return false;

            IntPtr h = hWnd;
            while (h != IntPtr.Zero)
            {
                if (h == root) return true;
                h = GetParent(h);
            }
            return false;
        }

        // 键盘转发：PowerPoint 放映用 COM 翻页；其余目标（希沃白板等）模拟按键到下层窗口
        private void ForwardKeyToLowerWindow(Keys key)
        {
            try
            {
                bool pptActive = _pptShowActive || _lastDetectedApp == PageTurnApp.PowerPoint;
                bool comDone = false;
                if (pptActive)
                {
                    string comAction = null;
                    switch (key)
                    {
                        case Keys.Right: case Keys.Down: case Keys.PageDown:
                        case Keys.Space: case Keys.Return: comAction = "next"; break;
                        case Keys.Left: case Keys.Up: case Keys.PageUp: comAction = "prev"; break;
                    }
                    // COM 成功即结束；否则回退到按键模拟（方向键 / 空格 / 回车）
                    if (comAction != null) comDone = TryPptComAction(comAction);
                }

                if (!comDone)
                {
                    IntPtr target = FindPageTurnTargetWindow();
                    if (target != IntPtr.Zero)
                    {
                        GiveFocusToWindow(target);
                        SimulateKey(0, key);
                    }
                }

                // PPT 放映批注态下，键盘翻页后同样触发一次页码检测
                if (pptActive && IsPagingKey(key)) RequestPptSlideRefresh();
            }
            catch { }
        }

        private static bool IsPagingKey(Keys key)
        {
            switch (key)
            {
                case Keys.Left: case Keys.Right: case Keys.Up: case Keys.Down:
                case Keys.PageUp: case Keys.PageDown: case Keys.Space: case Keys.Return:
                    return true;
                default:
                    return false;
            }
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
                    SetLayeredButtonImage(btnForm, imgExpand);
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
            if (verifyWebView != null)
            {
                try { verifyWebView.Dispose(); } catch { }
                verifyWebView = null;
            }
            if (verifyLayer != null)
            {
                try { verifyLayer.Hide(); verifyLayer.Dispose(); } catch { }
                verifyLayer = null;
            }
            verifyActive = false;
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


        #region PNG逐像素透明与Region命中
        private static void EnableLayeredWindow(Form form)
        {
            IntPtr hWnd = form.Handle;
            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            SetWindowLong(hWnd, GWL_EXSTYLE, exStyle | WS_EX_LAYERED);
        }

        private static void SetLayeredButtonImage(Form form, string imagePath)
        {
            using Bitmap source = new Bitmap(imagePath);
            SetLayeredButtonImage(form, source);
        }

        private static void SetLayeredButtonImage(Form form, Bitmap source)
        {
            if (source == null) return;

            EnableLayeredWindow(form);
            SetButtonRegion(form, source);

            int width = source.Width;
            int height = source.Height;
            form.Size = new Size(width, height);

            using Bitmap render = new Bitmap(width, height, PixelFormat.Format32bppPArgb);
            using (Graphics graphics = Graphics.FromImage(render))
            {
                graphics.Clear(Color.Transparent);
                graphics.DrawImage(source, 0, 0, width, height);
            }

            IntPtr screenDc = GetDC(IntPtr.Zero);
            IntPtr memoryDc = CreateCompatibleDC(screenDc);
            IntPtr bitmap = render.GetHbitmap(Color.FromArgb(0));
            IntPtr oldBitmap = SelectObject(memoryDc, bitmap);

            try
            {
                POINT windowPosition = new POINT { X = form.Left, Y = form.Top };
                SIZE windowSize = new SIZE { cx = width, cy = height };
                POINT sourcePosition = new POINT { X = 0, Y = 0 };
                BLENDFUNCTION blend = new BLENDFUNCTION
                {
                    BlendOp = AC_SRC_OVER,
                    BlendFlags = 0,
                    SourceConstantAlpha = 255,
                    AlphaFormat = AC_SRC_ALPHA
                };

                if (!UpdateLayeredWindow(
                    form.Handle,
                    IntPtr.Zero,
                    ref windowPosition,
                    ref windowSize,
                    memoryDc,
                    ref sourcePosition,
                    0,
                    ref blend,
                    ULW_ALPHA))
                {
                    throw new Win32Exception(Marshal.GetLastWin32Error());
                }
            }
            finally
            {
                SelectObject(memoryDc, oldBitmap);
                DeleteObject(bitmap);
                DeleteDC(memoryDc);
                ReleaseDC(IntPtr.Zero, screenDc);
            }
        }

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

        private const int KEYEVENTF_KEYUP = 0x0002;

        [DllImport("user32.dll")]
        private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

        [DllImport("user32.dll")]
        private static extern bool GetCursorPos(out POINT lpPoint);
        [DllImport("user32.dll")]
        private static extern IntPtr GetWindow(IntPtr hWnd, uint uCmd);

        [DllImport("user32.dll")]
        private static extern IntPtr GetParent(IntPtr hWnd);

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

        [StructLayout(LayoutKind.Sequential)]
        private struct SIZE
        {
            public int cx;
            public int cy;
        }

        [StructLayout(LayoutKind.Sequential, Pack = 1)]
        private struct BLENDFUNCTION
        {
            public byte BlendOp;
            public byte BlendFlags;
            public byte SourceConstantAlpha;
            public byte AlphaFormat;
        }

        private const byte AC_SRC_OVER = 0;
        private const byte AC_SRC_ALPHA = 1;
        private const uint ULW_ALPHA = 0x00000002;

        [DllImport("user32.dll", SetLastError = true)]
        private static extern bool UpdateLayeredWindow(IntPtr hWnd, IntPtr hdcDst,
            ref POINT pptDst, ref SIZE psize, IntPtr hdcSrc,
            ref POINT pptSrc, uint crKey, ref BLENDFUNCTION pblend, uint dwFlags);

        [DllImport("user32.dll")]
        private static extern IntPtr GetDC(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern int ReleaseDC(IntPtr hWnd, IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr CreateCompatibleDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteDC(IntPtr hDC);

        [DllImport("gdi32.dll")]
        private static extern IntPtr SelectObject(IntPtr hDC, IntPtr hObject);

        [DllImport("gdi32.dll")]
        private static extern bool DeleteObject(IntPtr hObject);

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

        private const int GWL_STYLE = -16;
        private const uint WS_CAPTION = 0x00C00000;

        [DllImport("user32.dll")]
        private static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

        [DllImport("user32.dll")]
        private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

        private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

        [StructLayout(LayoutKind.Sequential)]
        private struct RECT
        {
            public int Left;
            public int Top;
            public int Right;
            public int Bottom;
        }

        // 进程快照：用于采集 父进程ID -> 子进程PID 映射（判断 PPT 子进程是否存在全屏窗口）
        private const uint TH32CS_SNAPPROCESS = 0x00000002;

        [DllImport("kernel32.dll")]
        private static extern IntPtr CreateToolhelp32Snapshot(uint dwFlags, uint th32ProcessID);

        [DllImport("kernel32.dll")]
        private static extern bool Process32First(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll")]
        private static extern bool Process32Next(IntPtr hSnapshot, ref PROCESSENTRY32 lppe);

        [DllImport("kernel32.dll")]
        private static extern bool CloseHandle(IntPtr hObject);

        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
        private struct PROCESSENTRY32
        {
            public uint dwSize;
            public uint cntUsage;
            public uint th32ProcessID;
            public IntPtr th32DefaultHeapID;
            public uint th32ModuleID;
            public uint cntThreads;
            public uint th32ParentProcessID;
            public int pcPriClassBase;
            public uint dwFlags;
            [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
            public string szExeFile;
        }

        private static void SetToolWindow(IntPtr hWnd)
        {
            int exStyle = GetWindowLong(hWnd, GWL_EXSTYLE);
            SetWindowLong(hWnd, GWL_EXSTYLE, exStyle | WS_EX_TOOLWINDOW);
        }
        #endregion

        protected override bool ProcessCmdKey(ref Message msg, Keys keyData) => true;
    }
}

