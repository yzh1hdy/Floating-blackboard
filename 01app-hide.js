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
        // 全屏打开 desmos.com 计算器（仿计时器：全屏 iframe 覆盖层）
        function openDesmosFullscreen() {
            var overlay = document.getElementById('desmosFullscreenOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'desmosFullscreenOverlay';
                overlay.className = 'timer-overlay';
                var frame = document.createElement('iframe');
                frame.id = 'desmosFullscreenFrame';
                frame.title = 'Desmos 函数绘图器';
                frame.setAttribute('allow', 'autoplay');
                overlay.appendChild(frame);
                var closeBtn = document.createElement('button');
                closeBtn.id = 'desmosFullscreenCloseBtn';
                closeBtn.className = 'timer-close-btn';
                closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>|  关闭Desmos';
                closeBtn.onclick = closeDesmosFullscreen;
                overlay.appendChild(closeBtn);
                document.body.appendChild(overlay);
            }
            if (overlay.style.display === 'block') {
                closeDesmosFullscreen();
                return;
            }
            if (typeof closeAbout === 'function') closeAbout();
            var timerOverlay = document.getElementById('timerOverlay');
            if (timerOverlay && timerOverlay.style.display === 'block') {
                closeTimer();
            }
            var desmosOverlay = document.getElementById('desmosOverlay');
            if (desmosOverlay && desmosOverlay.style.display === 'block') {
                closeDesmos();
            }
            if (typeof closeMoreMenu === 'function') closeMoreMenu(false);
            var frame = document.getElementById('desmosFullscreenFrame');
            if (frame) frame.src = 'https://www.desmos.com/calculator?lang=zh-CN';
            overlay.style.display = 'block';
            document.body.classList.add('desmos-fullscreen-active');
            if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
        }
        function closeDesmosFullscreen() {
            var overlay = document.getElementById('desmosFullscreenOverlay');
            if (!overlay || overlay.style.display !== 'block') return;
            overlay.style.display = 'none';
            var frame = document.getElementById('desmosFullscreenFrame');
            if (frame) frame.src = 'about:blank';
            document.body.classList.remove('desmos-fullscreen-active');
            if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        }
        function closeTimer() {
            var overlay = document.getElementById('timerOverlay');
            if (!overlay || overlay.style.display !== 'block') return;
            overlay.style.display = 'none';
            document.body.classList.remove('timer-active');
            if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        }
        // 白板内部左侧打开科学计算器：600px 宽、占满屏幕高度、背景透明，画布等保持可见
        var calculatorOpen = false;
        var calculatorHideTimer = null;
        function openCalculator() {
            var overlay = document.getElementById('calculatorOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'calculatorOverlay';
                overlay.className = 'calculator-panel';
                var newFrame = document.createElement('iframe');
                newFrame.id = 'calculatorFrame';
                newFrame.title = '科学计算器';
                newFrame.setAttribute('allow', 'autoplay');
                overlay.appendChild(newFrame);
                document.body.appendChild(overlay);
            }
            if (calculatorOpen) {
                closeCalculator();
                return;
            }
            if (typeof closeAbout === 'function') closeAbout();
            var timerOverlay = document.getElementById('timerOverlay');
            if (timerOverlay && timerOverlay.style.display === 'block') {
                closeTimer();
            }
            var desmosOverlay = document.getElementById('desmosOverlay');
            if (desmosOverlay && desmosOverlay.style.display === 'block') {
                closeDesmos();
            }
            if (typeof closeMoreMenu === 'function') closeMoreMenu(false);
            if (calculatorHideTimer) { clearTimeout(calculatorHideTimer); calculatorHideTimer = null; }
            var frame = document.getElementById('calculatorFrame');
            if (frame) frame.src = 'scientific_calculator.html';
            overlay.style.display = 'block';
            // 先完成布局，再触发从左侧淡入的过渡
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    overlay.classList.add('show');
                });
            });
            calculatorOpen = true;
            if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
        }
        function closeCalculator() {
            var overlay = document.getElementById('calculatorOverlay');
            if (!overlay || !calculatorOpen) return;
            calculatorOpen = false;
            overlay.classList.remove('show');
            if (calculatorHideTimer) clearTimeout(calculatorHideTimer);
            // 等待面板淡出动画结束后再移除页面
            calculatorHideTimer = setTimeout(function () {
                calculatorHideTimer = null;
                var frame = document.getElementById('calculatorFrame');
                if (frame) frame.src = 'about:blank';
                overlay.style.display = 'none';
            }, 300);
            if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        }
        // 打开函数绘图器前，先把透明/视频模式切回普通绘图模式
        function exitToNormalModeForDesmos() {
            if (typeof state === 'undefined') return;
            if (state.transparentMode) {
                disableTransparentMode();
                disableMousePassthrough();
                state.transparentMode = false;
                notifyTransparentMode();
                // 退出透明模式同样复位翻页工具栏并退出 PPT 批注态
                if (typeof window.resetPageTurnMode === 'function') window.resetPageTurnMode();
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
        // 底部输入条不屏蔽画布：保持普通绘图模式，画布始终可交互
        function updateDesmosOverlayPointer() {
            var c = document.getElementById('canvas-container');
            if (c) c.style.pointerEvents = '';
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
            // 底部输入条：不切换任何特殊模式，保持在普通绘图界面
            var frame = document.getElementById('desmosFrame');
            if (frame && !frame.dataset.loaded) {
                frame.src = 'desmos.html';
                frame.dataset.loaded = '1';
            }
            if (overlay) overlay.style.display = 'block';
            // 打开函数绘图器时自动隐藏底部工具栏，避免遮挡 desmos 键盘
            var tb = document.getElementById('toolbar');
            if (tb) tb.style.display = 'none';
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
            if (frame) {
                frame.src = 'about:blank';
                delete frame.dataset.loaded;
            }
            // 关闭函数绘图器后恢复底部工具栏
            var tb = document.getElementById('toolbar');
            if (tb) tb.style.display = '';
        }
        // 请求 iframe 内的本地 desmos 渲染函数图并回传（透明背景、无网格、白色曲线）
        function insertFunctionImageRequest() {
            var frame = document.getElementById('desmosFrame');
            if (!frame || !frame.contentWindow) return;
            try { frame.contentWindow.postMessage({ type: 'dcg-insert' }, '*'); } catch (e) { }
        }
        // 接收本地 desmos 渲染结果：插入到普通白板画布
        window.addEventListener('message', function (e) {
            var d = e.data;
            if (!d || !d.type) return;
            if (d.type === 'dcg-screenshot' && d.dataUrl) {
                // 优先创建可交互活图（白板上的 desmos widget）；缺表达式时回退为静态截图
                if (d.latexList && d.latexList.length && typeof insertFunctionGraph === 'function') {
                    insertFunctionGraph(d.latexList);
                } else if (typeof insertFunctionImage === 'function') {
                    insertFunctionImage(d.dataUrl);
                }
                if (typeof closeDesmos === 'function') closeDesmos();
            } else if (d.type === 'calculator-exit') {
                // 计算器内部的退出动画已经播放完毕，白板关闭计算器页面
                if (typeof closeCalculator === 'function') closeCalculator();
            } else if (d.type === 'dcg-error' && d.msg) {
                if (typeof showToast === 'function') { try { showToast(d.msg); } catch (_) { alert(d.msg); } }
                else alert(d.msg);
            }
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                var calculatorOverlay = document.getElementById('calculatorOverlay');
                if (calculatorOpen) {
                    closeCalculator();
                    return;
                }
                var desmosFsOverlay = document.getElementById('desmosFullscreenOverlay');
                if (desmosFsOverlay && desmosFsOverlay.style.display === 'block') {
                    closeDesmosFullscreen();
                    return;
                }
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
                var seewoExitOverlay = document.getElementById('seewoExitConfirmOverlay');
                if (clearOverlay && clearOverlay.classList.contains('active')) {
                    closeClearModal();
                } else if (perfOverlay && perfOverlay.classList.contains('active')) {
                    closePerfModal();
                } else if (exitVideoOverlay && exitVideoOverlay.classList.contains('active')) {
                    closeExitVideoModal();
                } else if (doublePageOverlay && doublePageOverlay.classList.contains('active')) {
                    closeDoublePageConfirm();
                } else if (seewoExitOverlay && seewoExitOverlay.classList.contains('active')) {
                    closeSeewoExitConfirm();
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


