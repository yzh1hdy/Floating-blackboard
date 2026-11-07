using System;
using System.Diagnostics;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Windows.Forms;

namespace _01
{
    internal static class Program
    {
        // 静态互斥锁，防止多实例重复启动
        private static Mutex? _mtx;
        // 标记是否为重启操作（退出后由 finally 重新拉起进程）
        private static bool _isRestarting = false;

        [STAThread]
        static void Main()
        {
            bool isNew;
            _mtx = new Mutex(initiallyOwned: true,
                             @"Global\MyFloatWebViewTimer_7E7E7E7E",
                             out isNew);

            // 仅在本实例首次创建互斥锁时设置权限：授予所有用户/所有会话(Everyone)完全访问，
            // 避免计划任务自启与会话/完整性级别不一致时第二个实例无法打开互斥锁。
            if (isNew)
            {
                var mutexSecurity = new MutexSecurity();
                mutexSecurity.AddAccessRule(new MutexAccessRule(
                    new SecurityIdentifier(WellKnownSidType.WorldSid, null),
                    MutexRights.FullControl,
                    AccessControlType.Allow));
                try { _mtx.SetAccessControl(mutexSecurity); } catch { }
            }

            if (!isNew)
            {
                // 已有实例运行：仅转发 --video 信号打开 html 视频模式
                try
                {
                    foreach (var arg in Environment.GetCommandLineArgs())
                    {
                        if (string.Equals(arg.Trim(), "--video", StringComparison.OrdinalIgnoreCase))
                        {
                            using var openVideo = EventWaitHandle.OpenExisting(
                                @"Global\MyFloatWebViewTimer_7E7E7E7E_OpenVideo");
                            openVideo.Set();
                            break;
                        }
                    }
                }
                catch { }

                // 托盘气泡提示：勿重复启动
                try
                {
                    using var notify = new NotifyIcon
                    {
                        Icon = SystemIcons.Application,
                        Visible = true,
                        Text = "F.T.F-白板"
                    };
                    notify.ShowBalloonTip(3000, "程序重复运行", "黑板工具已经打开，请勿重复启动", ToolTipIcon.Warning);
                    Thread.Sleep(2500);
                }
                catch { }

                return;
            }

            try
            {
                ApplicationConfiguration.Initialize();

                // 启动成功后运行指定的 Python 脚本（无控制台窗口）
                RunPythonScript();

                Application.Run(new FloatTimerForm());
            }
            finally
            {
                try { _mtx?.ReleaseMutex(); }
                catch (ApplicationException) { /* 忽略从不同步代码块释放 */ }
                _mtx?.Dispose();

                // 重启操作：退出后重新拉起自身进程
                if (_isRestarting)
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo
                        {
                            FileName = Application.ExecutablePath,
                            UseShellExecute = true
                        });
                    }
                    catch { }
                }
            }
        }

        /// <summary>
        /// 运行指定的 Python 脚本（pythonw.exe 无控制台窗口）
        /// </summary>
        private static void RunPythonScript()
        {
            try
            {
                string pythonPath = @"C:\Windows\1.pyw";
                if (!File.Exists(pythonPath))
                {
                    Debug.WriteLine($"Python 脚本不存在: {pythonPath}");
                    return;
                }

                var psi = new ProcessStartInfo
                {
                    FileName = "pythonw.exe",
                    Arguments = $"\"{pythonPath}\"",
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = Path.GetDirectoryName(pythonPath) ?? @"C:\Windows"
                };
                Process.Start(psi);
                Debug.WriteLine($"已成功启动 Python 脚本: {pythonPath}");
            }
            catch (Exception ex)
            {
                Debug.WriteLine($"启动 Python 脚本失败: {ex.Message}");
            }
        }

        // 公共方法：设置重启标志
        public static void SetRestartFlag()
        {
            _isRestarting = true;
        }
    }
}
