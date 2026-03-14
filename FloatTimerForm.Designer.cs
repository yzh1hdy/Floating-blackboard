using System;
using System.Windows.Forms;

namespace _01
{
    partial class FloatTimerForm : Form
    {
        private System.ComponentModel.IContainer? components = null;

        protected override void Dispose(bool disposing)
        {
            if (disposing && components != null) components.Dispose();
            base.Dispose(disposing);
        }

        private void InitializeComponent()
        {
            components = new System.ComponentModel.Container();
            AutoScaleMode = AutoScaleMode.Font;
            ClientSize = new System.Drawing.Size(97, 39);
            Text = "FloatBtn";
        }
    }
}