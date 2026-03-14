using _01;
using CefSharp;
using System;
using System.Runtime.ConstrainedExecution;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    // 1. 静态互斥，防止多实例且不释放
    private static Mutex? _mtx;

    [STAThread]
    static void Main()
    {
        // 2. 创建唯一互斥（使用 GUID 命名，全局作用域）
        bool isNew;
        _mtx = new Mutex(initiallyOwned: true,
                         name: @"Global\MyFloatWebViewTimer_7E7E7E7E",
                         createdNew: out isNew);

        if (!isNew)
        {
            // 已有实例在运行
            MessageBox.Show("程序已经打开，请勿重复启动", "单实例限制",
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
            // 3. 程序退出时释放互斥
            _mtx?.ReleaseMutex();
            _mtx?.Dispose();

            // 4. 关闭 CefSharp
            Cef.Shutdown();
        }
    }
}