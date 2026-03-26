using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace _01
{
    public partial class FloatTimerForm : Form
    {
        private readonly string imgExpand;
        private readonly string imgCollapse;

        private WebView2 webView;
        private Form webLayer;
        private NotifyIcon trayIcon;
        private PictureBox btnToggle;
        private PictureBox btnHide;
        private Form btnForm;
        private bool expanded = false;
        private readonly Point btnPos;
        private readonly Size btnSize;

        private readonly System.Windows.Forms.Timer topMostTimer;
        private CoreWebView2Environment _webViewEnvironment;

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

            #region 2. 图片路径
            bool isFullHd = Screen.PrimaryScreen.Bounds.Width == 1920 &&
                            Screen.PrimaryScreen.Bounds.Height == 1080;
            btnSize = isFullHd ? new Size(100, 40) : new Size(400, 160);
            string baseDir = AppDomain.CurrentDomain.BaseDirectory;
            imgExpand = Path.Combine(baseDir, isFullHd ? "expand-small.png" : "expand.png");
            imgCollapse = Path.Combine(baseDir, isFullHd ? "collapse-small.png" : "collapse.png");
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

            int mini = 24;
            btnHide = new PictureBox
            {
                Image = new Bitmap(Image.FromFile(imgCollapse), mini, mini),
                SizeMode = PictureBoxSizeMode.AutoSize,
                BackColor = Color.Transparent,
                Cursor = Cursors.Hand,
                Location = new Point(btnSize.Width - mini - 4, 4)
            };
            btnHide.Click += (_, _) => { if (expanded) { expanded = false; webLayer.Hide(); btnToggle.Image = Image.FromFile(imgExpand); } };

            btnForm.Controls.Add(btnToggle);
            btnForm.Controls.Add(btnHide);
            SetButtonRegion(btnForm, (Bitmap)btnToggle.Image);
            btnForm.Show();
            #endregion

            #region 4. 预初始化WebView2环境
            _ = InitializeWebViewEnvironmentAsync();
            #endregion

            #region 5. 置顶定时器
            topMostTimer = new System.Windows.Forms.Timer { Interval = 50 };
            topMostTimer.Tick += (_, _) =>
            {
                if (btnForm != null && !btnForm.IsDisposed)
                    SetWindowPos(btnForm.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            };
            topMostTimer.Start();
            #endregion

            #region 托盘菜单
            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "F.T.F-白板",
                Visible = true
            };
            var menu = new ContextMenuStrip();
            menu.Items.Add("-");

            // 重启程序按钮
            menu.Items.Add("重启程序", null, (_, _) => RestartApplication());
            menu.Items.Add("-");

            menu.Items.Add("退出程序", null, (_, _) => { trayIcon.Visible = false; Application.Exit(); });
            menu.Items.Add("-");
            trayIcon.ContextMenuStrip = menu;
            #endregion
        }

        #region WebView2环境预初始化
        private async Task InitializeWebViewEnvironmentAsync()
        {
            try
            {
                var options = new CoreWebView2EnvironmentOptions
                {
                    AdditionalBrowserArguments =
                        "--enable-gpu-rasterization " +
                        "--enable-zero-copy " +
                        "--enable-features=VaapiVideoDecoder,VaapiVideoEncoder,CanvasOopRasterization,EnableDrDc " +
                        "--disable-features=site-per-process,TranslateUI " +
                        "--max_old_space_size=4096 " +
                        "--enable-webgl " +
                        "--ignore-gpu-blocklist " +
                        "--enable-hardware-overlays " +
                        "--enable-oop-rasterization " +
                        "--num-raster-threads=4 " +
                        "--enable-features=RawDraw " +
                        "--disable-background-timer-throttling " +
                        "--disable-backgrounding-occluded-windows " +
                        "--disable-renderer-backgrounding " +
                        "--enable-features=HighEfficiencyModeAvailable " +
                        "--force-color-profile=srgb",
                    AllowSingleSignOnUsingOSPrimaryAccount = false,
                    Language = "zh-CN"
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
        #endregion

        #region 重启程序
        private void RestartApplication()
        {
            try
            {
                string exePath = Application.ExecutablePath;
                ProcessStartInfo startInfo = new ProcessStartInfo
                {
                    FileName = exePath,
                    UseShellExecute = true
                };
                Process.Start(startInfo);
                trayIcon.Visible = false;
                Application.Exit();
            }
            catch (Exception ex)
            {
                MessageBox.Show($"重启失败: {ex.Message}", "错误",
                    MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }
        #endregion

        #region 创建/销毁WebLayer
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
            SetToolWindow(webLayer.Handle);

            // 设置窗口分层样式以支持透明
            SetWindowLong(webLayer.Handle, GWL_EXSTYLE,
                GetWindowLong(webLayer.Handle, GWL_EXSTYLE) | WS_EX_LAYERED);

            // 创建 WebView2 控件
            webView = new WebView2
            {
                Dock = DockStyle.Fill,
                Visible = true,
                TabStop = false,
                // 设置默认背景色为透明
                DefaultBackgroundColor = Color.Transparent
            };

            webLayer.Controls.Add(webView);
            webView.CoreWebView2InitializationCompleted += OnCoreReady;

            // 初始化 WebView2
            if (_webViewEnvironment != null)
            {
                _ = webView.EnsureCoreWebView2Async(_webViewEnvironment);
            }
            else
            {
                _ = webView.EnsureCoreWebView2Async();
            }
        }

        private void DisposeWebLayer()
        {
            if (webLayer != null)
            {
                webLayer.Hide();
                webLayer.Dispose();
                webLayer = null;
                webView = null;
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

            webView.CoreWebView2.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;

            string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "01.html");
            webView.CoreWebView2.Navigate(htmlPath);
        }

        private void Toggle()
        {
            expanded = !expanded;
            btnToggle.Image = expanded ? Image.FromFile(imgCollapse) : Image.FromFile(imgExpand);
            SetButtonRegion(btnForm, (Bitmap)btnToggle.Image);

            if (expanded)
            {
                CreateWebLayer();
                webLayer.Show();
            }
            else
            {
                webLayer?.Hide();
            }
        }

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

        #region Win32
        private const int HWND_TOPMOST = -1;
        private const int SWP_NOMOVE = 0x0002;
        private const int SWP_NOSIZE = 0x0001;
        private const int SWP_NOACTIVATE = 0x0010;

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