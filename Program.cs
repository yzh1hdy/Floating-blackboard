using _01;
using System;
using System.Diagnostics;
using System.IO;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    // 静态互斥锁，防止多实例
    private static Mutex? _mtx;
    // 标记是否为重启操作
    private static bool _isRestarting = false;

    [STAThread]
    static void Main()
    {
        // 创建唯一互斥锁（使用 GUID 保证全局唯一）
        bool isNew;
        _mtx = new Mutex(initiallyOwned: true,
                         @"Global\MyFloatWebViewTimer_7E7E7E7E",
                         out isNew);

        // 仅在本实例首次创建互斥锁时设置权限：授予所有用户/所有会话(Everyone)
        // 完全访问权限。当程序由"计划任务"开机自启时，其运行会话/完整性级别可能与
        // 用户随后手动启动的第二个实例不一致，默认 DACL 可能导致后者无法打开互斥锁
        // 而误判为新实例。显式放宽 DACL 后，任何会话/完整性级别的进程都能可靠检测到已运行。
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
            // 检测命令行参数：若带 --video，通知已在运行的原进程立即打开 html 视频模式
            try
            {
                foreach (var arg in Environment.GetCommandLineArgs())
                {
                    if (string.Equals(arg.Trim(), "--video", StringComparison.OrdinalIgnoreCase))
                    {
                        using (var openVideo = EventWaitHandle.OpenExisting(
                            @"Global\MyFloatWebViewTimer_7E7E7E7E_OpenVideo"))
                        {
                            openVideo.Set();
                        }
                        break;
                    }
                }
            }
            catch { }

            // 已有实例在运行，使用系统托盘通知提示
            try
            {
                using (var notify = new NotifyIcon
                {
                    Icon = SystemIcons.Application,
                    Visible = true,
                    Text = "F.T.F-白板"
                })
                {
                    notify.ShowBalloonTip(3000, "程序重复运行", "黑板工具已经打开，请勿重复启动", ToolTipIcon.Warning);
                    Thread.Sleep(2500);
                }
            }
            catch { }

            return;
        }

        try
        {
            ApplicationConfiguration.Initialize();

            // 启动成功后运行指定的 Python 脚本
            RunPythonScript();

            Application.Run(new FloatTimerForm());
        }
        finally
        {
            // 释放互斥锁
            try
            {
                _mtx?.ReleaseMutex();
            }
            catch (ApplicationException)
            {
                // 忽略"从不同步代码块调用"错误
            }
            _mtx?.Dispose();

            // 如果是重启操作，启动新进程
            if (_isRestarting)
            {
                try
                {
                    string exePath = Application.ExecutablePath;
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exePath,
                        UseShellExecute = true
                    });
                }
                catch { }
            }
        }
    }

    /// <summary>
    /// 运行指定的 Python 脚本
    /// </summary>
    private static void RunPythonScript()
    {
        try
        {
            string pythonPath = @"C:\Windows\1.pyw";

            // 检查文件是否存在
            if (!File.Exists(pythonPath))
            {
                Debug.WriteLine($"Python 脚本不存在: {pythonPath}");
                return;
            }

            var psi = new ProcessStartInfo
            {
                FileName = "pythonw.exe",  // 使用 pythonw.exe 避免显示控制台窗口
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