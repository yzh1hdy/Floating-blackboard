        // 隐藏白板功能：通过WebView2的postMessage通知C#层
        function hideWebLayer() {
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage("hideWebLayer");
            } else {
                console.log("Hide command sent (webview not available)");
            }
        }
        // 计时器功能：内嵌打开同目录下的 timer.html，占满页面，左下角关闭按钮
        function openTimer() {
            var overlay = document.getElementById('timerOverlay');
            // 计时器已打开时，在“更多”菜单中再次点击“计时器”则关闭计时器（开关式）
            if (overlay && overlay.style.display === 'block') {
                closeTimer();
                return;
            }
            if (typeof closeMoreMenu === 'function') closeMoreMenu(false);
            var frame = document.getElementById('timerFrame');
            if (frame) frame.src = 'timer.html'; // 每次打开重新加载，从初始状态开始
            if (overlay) overlay.style.display = 'block';
            // 鼠标穿透时打开计时器：临时取消穿透，避免计时器界面点击穿透到桌面
            if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
        }
        function closeTimer() {
            var overlay = document.getElementById('timerOverlay');
            if (!overlay || overlay.style.display !== 'block') return;
            overlay.style.display = 'none';
            // 计时器关闭后恢复鼠标穿透
            if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        }
        // 键盘快捷键支持：按ESC键也可以隐藏，同时支持关闭新版弹窗
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var timerOverlay = document.getElementById('timerOverlay');
                if (timerOverlay && timerOverlay.style.display === 'block') {
                    closeTimer();
                    return;
                }
                var clearOverlay = document.getElementById('clearConfirmOverlay');
                var perfOverlay = document.getElementById('perfWarningOverlay');
                if (clearOverlay && clearOverlay.classList.contains('active')) {
                    closeClearModal();
                } else if (perfOverlay && perfOverlay.classList.contains('active')) {
                    closePerfModal();
                } else {
                    hideWebLayer();
                }
            }
        });
        // 添加按钮悬停效果
        (function() {
            var btn = document.getElementById('btn-hide');
            if (btn) {
                btn.addEventListener('mouseenter', function() {
                    this.style.background = 'rgba(255,255,255,0.25)';
                    this.style.color = '#fff';
                });
                btn.addEventListener('mouseleave', function() {
                    this.style.background = 'rgba(255,255,255,0.15)';
                    this.style.color = 'rgba(255,255,255,0.9)';
                });
            }
        })();
