using _01;
using System;
using System.Diagnostics;
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
                         name: @"Global\MyFloatWebViewTimer_7E7E7E7E",
                         createdNew: out isNew);

        if (!isNew)
        {
            // 已有实例在运行
            MessageBox.Show("程序已经打开，请勿重复运行", "程序已运行",
                            MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        try
        {
            ApplicationConfiguration.Initialize();
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

    // 公共方法：设置重启标志
    public static void SetRestartFlag()
    {
        _isRestarting = true;
    }
}