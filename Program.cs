using _01;
using System;
using System.Threading;
using System.Windows.Forms;

static class Program
{
    // 1. ��̬���У������������ڲ��ͷ�
    private static Mutex? _mtx;

    [STAThread]
    static void Main()
    {
        // 2. ����Ψһ���������� GUID ���������
        bool isNew;
        _mtx = new Mutex(initiallyOwned: true,
                         name: @"Global\MyFloatWebViewTimer_7E7E7E7E",
                         createdNew: out isNew);

        if (!isNew)
        {
            // ����ʵ������
            MessageBox.Show("�������Ѿ��򿪣������ظ�������", "����������",
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
            // 3. �����˳�ʱ���ͷ�
            _mtx?.ReleaseMutex();
            _mtx?.Dispose();
        }
    }
}