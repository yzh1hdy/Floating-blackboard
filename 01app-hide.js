        function hideWebLayer() {
            if (window.chrome && window.chrome.webview) {
                window.chrome.webview.postMessage("hideWebLayer");
            } else {
                console.log("Hide command sent (webview not available)");
            }
        }
        function openTimer() {
            var overlay = document.getElementById('timerOverlay');
            if (overlay && overlay.style.display === 'block') {
                closeTimer();
                return;
            }
            // 计时器与函数绘图器互斥
            var desmosOverlay = document.getElementById('desmosOverlay');
            if (desmosOverlay && desmosOverlay.style.display === 'block') {
                closeDesmos();
            }
            if (typeof closeMoreMenu === 'function') closeMoreMenu(false);
            var frame = document.getElementById('timerFrame');
            if (frame) frame.src = 'timer.html';
            if (overlay) overlay.style.display = 'block';
            document.body.classList.add('timer-active');
            if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
        }
        function closeTimer() {
            var overlay = document.getElementById('timerOverlay');
            if (!overlay || overlay.style.display !== 'block') return;
            overlay.style.display = 'none';
            document.body.classList.remove('timer-active');
            if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        }
        // 打开函数绘图器前，先把透明/视频模式切回普通绘图模式
        function exitToNormalModeForDesmos() {
            if (typeof state === 'undefined') return;
            if (state.transparentMode) {
                disableTransparentMode();
                disableMousePassthrough();
                state.transparentMode = false;
                if (typeof setPenColor === 'function') setPenColor('#ffffff', findColorBtn('#ffffff'));
                var textEl = document.getElementById('transparentModeText');
                if (textEl) textEl.textContent = '透明模式';
            }
            if (state.videoBackgroundEnabled) {
                stopCamera();
                clearCanvasImmediate();
                if (typeof syncVideoLayout === 'function') syncVideoLayout();
            }
            if (typeof updateWatermark === 'function') updateWatermark();
        }
        // 绘图器打开时：鼠标工具 -> 透过画布直接操作网页；其他工具 -> 在网页上方绘制
        function updateDesmosOverlayPointer() {
            if (typeof state === 'undefined') return;
            var overlay = document.getElementById('desmosOverlay');
            var open = overlay && overlay.style.display === 'block';
            var pass = open && state.tool === 'mouse';
            var c = document.getElementById('canvas-container');
            if (c) c.style.pointerEvents = pass ? 'none' : '';
        }
        function openDesmos() {
            var overlay = document.getElementById('desmosOverlay');
            if (overlay && overlay.style.display === 'block') {
                closeDesmos();
                return;
            }
            if (typeof closeAbout === 'function') closeAbout();
            var timerOverlay = document.getElementById('timerOverlay');
            if (timerOverlay && timerOverlay.style.display === 'block') {
                closeTimer();
            }
            if (typeof closeMoreMenu === 'function') closeMoreMenu(false);
            if (typeof exitToNormalModeForDesmos === 'function') exitToNormalModeForDesmos();
            // 开启函数绘图器时自动退出双页书写，回到单页模式
            if (typeof exitDoublePageMode === 'function') exitDoublePageMode();
            var frame = document.getElementById('desmosFrame');
            if (frame) frame.src = 'https://www.desmos.com/calculator?lang=zh-CN';
            // 先按水平布局量好工具栏尺寸，竖直时宽高互换；同时计算按钮槽位高度，保证滑块形状一致
            var tb = document.getElementById('toolbar');
            if (tb) {
                var tbRect = tb.getBoundingClientRect();
                tb.style.setProperty('--desmos-w', tbRect.height + 'px');
                tb.style.setProperty('--desmos-h', tbRect.width + 'px');
                var cs = getComputedStyle(tb);
                var padV = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
                var gapV = parseFloat(cs.gap) || 6;
                var slotCount = (typeof glassBtnList !== 'undefined' && glassBtnList.length) ? glassBtnList.length : 6;
                var slotH = (tbRect.width - padV - gapV * (slotCount - 1)) / slotCount;
                tb.style.setProperty('--desmos-btn-h', Math.max(44, slotH) + 'px');
            }
            if (overlay) overlay.style.display = 'block';
            document.body.classList.add('desmos-active');
            if (typeof setTool === 'function') setTool('pen');
            // 批注模式自动切红笔
            if (typeof setPenColor === 'function') setPenColor('#ff1000', findColorBtn('#ff1000'));
            if (typeof updateDesmosOverlayPointer === 'function') updateDesmosOverlayPointer();
            if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
        }
        // 函数绘图器是否打开
        function isDesmosOpen() {
            var overlay = document.getElementById('desmosOverlay');
            return !!(overlay && overlay.style.display === 'block');
        }
        function closeDesmos() {
            var overlay = document.getElementById('desmosOverlay');
            if (!overlay || overlay.style.display !== 'block') return;
            overlay.style.display = 'none';
            var frame = document.getElementById('desmosFrame');
            if (frame) frame.src = 'about:blank';
            document.body.classList.remove('desmos-active');
            var tb = document.getElementById('toolbar');
            if (tb) {
                tb.style.removeProperty('--desmos-w');
                tb.style.removeProperty('--desmos-h');
                tb.style.removeProperty('--desmos-btn-h');
            }
            // 工具栏恢复水平布局后，滑块需重新定位到当前工具（否则停留在竖直拉长形态）
            if (typeof updateToolHighlight === 'function') {
                try { updateToolHighlight(); } catch (_) { }
            }
            // 关闭绘图器笔色切回白色
            if (typeof setPenColor === 'function') setPenColor('#ffffff', findColorBtn('#ffffff'));
            if (typeof updateDesmosOverlayPointer === 'function') updateDesmosOverlayPointer();
            if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var timerOverlay = document.getElementById('timerOverlay');
                if (timerOverlay && timerOverlay.style.display === 'block') {
                    closeTimer();
                    return;
                }
                var desmosOverlay = document.getElementById('desmosOverlay');
                if (desmosOverlay && desmosOverlay.style.display === 'block') {
                    closeDesmos();
                    return;
                }
                var clearOverlay = document.getElementById('clearConfirmOverlay');
                var perfOverlay = document.getElementById('perfWarningOverlay');
                var exitVideoOverlay = document.getElementById('exitVideoConfirmOverlay');
                var doublePageOverlay = document.getElementById('doublePageConfirmOverlay');
                if (clearOverlay && clearOverlay.classList.contains('active')) {
                    closeClearModal();
                } else if (perfOverlay && perfOverlay.classList.contains('active')) {
                    closePerfModal();
                } else if (exitVideoOverlay && exitVideoOverlay.classList.contains('active')) {
                    closeExitVideoModal();
                } else if (doublePageOverlay && doublePageOverlay.classList.contains('active')) {
                    closeDoublePageConfirm();
                } else {
                    hideWebLayer();
                }
            }
        });
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
//（注：内容由AI生成）

