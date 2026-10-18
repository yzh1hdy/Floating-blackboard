# Interactive‑Blackboard
Floating‑blackboard 交互式浮动白板

> 仅Windows平台，依赖Microsoft WebView2 Runtime

## 功能
- 矢量画笔、橡皮、手掌大面积擦除、几何绘图（直线/圆形）、框选移动缩放
- 摄像头展台模式，画布批注实物，拍照+本地相册
- 多页白板、双页书写、撤销
- 透明穿透模式，在PPT、软件上面批注
- 抽学号、计时器、Desmos函数绘图器

## 使用
安装[WebView2 Runtime](https://developer.microsoft.com/zh‑cn/microsoft‑edge/webview2)

## 开发
VS2022 + .NET Framework4.8 + Microsoft.Web.WebView2 NuGet包
网页前端：html+css+canvas JavaScript

## 参数
`01.exe --video` 通知已运行程序直接打开摄像头展台模式

## 注意
程序路径随意，相册图片存放在`album`相对目录，注意备份。

仓库：https://github.com/yzh1hdy/Floating‑blackboard
