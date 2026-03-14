using CefSharp;
using CefSharp.WinForms;
using System;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.ConstrainedExecution;
using System.Runtime.InteropServices;
using System.Windows.Forms;

namespace _01
{
    public partial class FloatTimerForm : Form
    {
        private readonly string imgExpand;
        private readonly string imgCollapse;

        private ChromiumWebBrowser browser;
        private Form webLayer;
        private NotifyIcon trayIcon;
        private PictureBox btnToggle;
        private PictureBox btnHide;
        private Form btnForm;
        private bool expanded = false;
        private readonly Point btnPos;
        private readonly Size btnSize;

        private readonly System.Windows.Forms.Timer topMostTimer;
        private bool _cefInitialized = false;

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

            #region 4. 初始化 CefSharp 环境
            InitializeCefSharp();
            #endregion

            #region 5. 定时置顶
            topMostTimer = new System.Windows.Forms.Timer { Interval = 50 };
            topMostTimer.Tick += (_, _) =>
            {
                if (btnForm != null && !btnForm.IsDisposed)
                    SetWindowPos(btnForm.Handle, HWND_TOPMOST, 0, 0, 0, 0,
                                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
            };
            topMostTimer.Start();
            #endregion

            #region 托盘
            trayIcon = new NotifyIcon
            {
                Icon = SystemIcons.Application,
                Text = "blackboard",
                Visible = true
            };
            var menu = new ContextMenuStrip();
            menu.Items.Add("-");
            menu.Items.Add("刷新网页", null, (_, _) => RefreshWebPage());
            menu.Items.Add("-");
            menu.Items.Add("退出程序", null, (_, _) => { trayIcon.Visible = false; Application.Exit(); });
            menu.Items.Add("-");
            trayIcon.ContextMenuStrip = menu;
            #endregion
        }

        #region CefSharp 初始化（CefSharp 131 版本）
        private void InitializeCefSharp()
        {
            if (Cef.IsInitialized.GetValueOrDefault())
            {
                _cefInitialized = true;
                return;
            }

            try
            {
                var settings = new CefSettings
                {
                    Locale = "zh-CN",
                    CachePath = Path.Combine(
                        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                        "FloatTimerCefCache"
                    )
                };

                // 命令行参数
                settings.CefCommandLineArgs.Add("disable-features", "site-per-process,TranslateUI");
                settings.CefCommandLineArgs.Add("enable-gpu-rasterization", "1");

                Cef.Initialize(settings);
                _cefInitialized = true;
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"CefSharp 初始化失败: {ex.Message}");
                _cefInitialized = false;
            }
        }
        #endregion

        #region 创建/显示网页层（CefSharp 131 版本）
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

            // 创建 ChromiumWebBrowser
            string htmlPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "01.html");

            browser = new ChromiumWebBrowser(htmlPath)
            {
                Dock = DockStyle.Fill
            };

            // 禁用右键菜单（CefSharp 131 方式）
            browser.MenuHandler = new CustomMenuHandler();

            webLayer.Controls.Add(browser);
        }

        // 自定义菜单处理器（CefSharp 131 兼容版本）
        private class CustomMenuHandler : IContextMenuHandler
        {
            public void OnBeforeContextMenu(IWebBrowser chromiumWebBrowser, IBrowser browser, IFrame frame, IContextMenuParams parameters, IMenuModel model)
            {
                model.Clear();
            }

            public bool OnContextMenuCommand(IWebBrowser chromiumWebBrowser, IBrowser browser, IFrame frame, IContextMenuParams parameters, CefMenuCommand commandId, CefEventFlags eventFlags)
            {
                return false;
            }

            public void OnContextMenuDismissed(IWebBrowser chromiumWebBrowser, IBrowser browser, IFrame frame)
            {
            }

            public bool RunContextMenu(IWebBrowser chromiumWebBrowser, IBrowser browser, IFrame frame, IContextMenuParams parameters, IMenuModel model, IRunContextMenuCallback callback)
            {
                return false;
            }
        }
        #endregion

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

        #region 刷新网页
        private void RefreshWebPage()
        {
            if (browser != null)
            {
                browser.Reload();
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

        #region 清理资源
        protected override void OnFormClosing(FormClosingEventArgs e)
        {
            base.OnFormClosing(e);

            topMostTimer?.Stop();
            topMostTimer?.Dispose();

            trayIcon?.Dispose();

            if (browser != null)
            {
                browser.Dispose();
                browser = null;
            }

            if (webLayer != null && !webLayer.IsDisposed)
            {
                webLayer.Dispose();
            }

            if (btnForm != null && !btnForm.IsDisposed)
            {
                btnForm.Dispose();
            }
        }
        #endregion
    }
}