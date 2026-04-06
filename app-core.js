// --- 触摸处理函数（防止高DPI触屏上的滑动误触）---
        function handlePenTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            handlePenClick();
        }

        function handleEraserTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            setTool('eraser');
        }

        function handleUndoTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            undo();
        }

        function handleClearTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            confirmClear();
        }

        function handleMoreTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            handleMoreClick(e);
        }

        function handleLotteryTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            showLottery();
        }

        function handlePrevPageTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            if (state.currentPage > 0) {
                goToPage(state.currentPage - 1);
            }
        }

        function handleNextPageTouch(e) {
            e.preventDefault();
            e.stopPropagation();
            if (state.currentPage < state.pages.length - 1) {
                goToPage(state.currentPage + 1);
            } else {
                if (state.pages.length >= state.perfWarningThreshold) {
                    showPerfWarning();
                } else {
                    addPage();
                }
            }
        }

        
// --- 通用触摸按钮处理函数 ---
let touchHandled = false;
let touchMoved = false;
let touchStartY = 0;

function handleTouchStartBtn(e) {
    touchHandled = true;
    touchMoved = false;
    touchStartY = e.touches[0].clientY;
}

function handleTouchMoveBtn(e) {
    if (touchHandled) {
        const touchY = e.touches[0].clientY;
        if (Math.abs(touchY - touchStartY) > 10) {
            touchMoved = true;
        }
    }
}

function handleTouchEndBtn(e) {
    if (touchHandled && !touchMoved) {
        touchHandled = false;
        // 阻止默认行为，防止click事件触发
        e.preventDefault();
        e.stopPropagation();
        // 触发点击
        const btn = e.currentTarget;
        if (btn && btn.onclick) {
            btn.onclick.call(btn, e);
        }
    }
}

// --- Initialization ---
        function init() {
            createCanvas();
            createGridCanvas();
            createMegaEraserPreview();
            pushHistory(); // 保存初始空白状态
            state.pages.push(null);
            updateUI();
            updateToolIcons();
            initPenMenu();
            updateAutoCorrectionSwitch();
            window.addEventListener('resize', handleResize);

            document.addEventListener('contextmenu', e => e.preventDefault());

            // 修改：添加鼠标悬停和按下事件处理
            Object.keys(icons).forEach(key => {
                const item = icons[key];
                
                // 鼠标悬停时显示按下状态图标
                item.btn.addEventListener('mouseenter', () => {
                    item.img.src = item.pressed;
                });
                
                // 鼠标离开时，如果不是当前选中的工具，恢复松开状态
                item.btn.addEventListener('mouseleave', () => {
                    if (key !== state.tool) {
                        item.img.src = item.released;
                    }
                });
                
                // 鼠标按下时也显示按下状态（与悬停一致）
                item.btn.addEventListener('mousedown', () => {
                    item.img.src = item.pressed;
                });
            });

            document.getElementById('resultCloseLayer').addEventListener('click', closeLottery);

            const aboutImage = document.querySelector('.about-image');
            if (aboutImage) {
                aboutImage.style.cursor = 'pointer';
                aboutImage.addEventListener('click', openAboutVideo);
            }

            document.getElementById('prevPageBtn').addEventListener('click', () => goToPage(state.currentPage - 1));
            document.getElementById('nextPageBtn').addEventListener('click', () => {
                if (state.currentPage < state.pages.length - 1) {
                    goToPage(state.currentPage + 1);
                } else {
                    if (state.pages.length >= state.perfWarningThreshold) {
                        showPerfWarning();
                    } else {
                        addPage();
                    }
                }
            });
        }

        // --- 透明模式切换功能 ---
        function toggleTransparentMode() {
            state.transparentMode = !state.transparentMode;
            
            if (state.transparentMode) {
                enableTransparentMode();
                setPenColor('#ff1000', findColorBtn('#ff1000'));
            } else {
                disableTransparentMode();
                setPenColor('#ffffff', findColorBtn('#ffffff'));
            }
            
            // 更新菜单按钮文本
            const textEl = document.getElementById('transparentModeText');
            if (textEl) {
                textEl.textContent = state.transparentMode ? '退出透明' : '透明模式';
            }
            
            // 关闭更多菜单
            closeMoreMenu();
        }

        // --- 启用透明模式 ---
        function enableTransparentMode() {
            document.body.classList.add('transparent-mode');
            document.body.style.backgroundColor = 'transparent';
            console.log('透明背景模式已启用');
        }

        // --- 禁用透明模式 ---
        function disableTransparentMode() {
            document.body.classList.remove('transparent-mode');
            document.body.style.backgroundColor = '#0f261e';
            console.log('透明背景模式已禁用');
        }

        // --- 视频背景功能（从更多菜单打开）---
        function showVideoMenuFromMore() {
            closeMoreMenu();
            openVideoMenu();
        }

        function openVideoMenu() {
            closePenMenu();
            state.videoMenuOpen = true;
            videoMenu.classList.add('show');
        }

        function closeVideoMenu() {
            state.videoMenuOpen = false;
            videoMenu.classList.remove('show');
        }

        async function toggleVideoBackground() {
            const switchEl = document.getElementById('videoToggleSwitch');
            const statusEl = document.getElementById('videoStatus');

            if (!state.videoBackgroundEnabled) {
                // 开启摄像头
                try {
                    statusEl.textContent = '正在请求摄像头权限...';
                    
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { 
                            facingMode: 'environment',
                            width: { ideal: 1920 },
                            height: { ideal: 1080 }
                        },
                        audio: false 
                    });
                    
                    state.videoStream = stream;
                    videoBackground.srcObject = stream;
                    videoBackground.classList.add('active');
                    document.body.classList.add('video-active');
                    
                    state.videoBackgroundEnabled = true;
                    switchEl.classList.add('active');
                    statusEl.textContent = '摄像头已开启';
                    
                } catch (err) {
                    console.error('摄像头访问失败:', err);
                    statusEl.textContent = '无法访问摄像头: ' + err.message;
                    
                    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
                        statusEl.textContent = '请在系统设置中允许摄像头访问';
                    }
                }
            } else {
                // 关闭摄像头
                if (state.videoStream) {
                    state.videoStream.getTracks().forEach(track => track.stop());
                    state.videoStream = null;
                }
                
                videoBackground.srcObject = null;
                videoBackground.classList.remove('active');
                document.body.classList.remove('video-active');
                
                state.videoBackgroundEnabled = false;
                switchEl.classList.remove('active');
                statusEl.textContent = '摄像头已关闭';
            }
        }

        // --- 关于对话框 ---
        function showAbout() {
            closeMoreMenu();
            aboutDialog.classList.add('show');
        }

        function closeAbout() {
            aboutDialog.classList.remove('show');
        }

        function closeAboutOnOverlay(e) {
            if (e.target === aboutDialog) {
                closeAbout();
            }
        }

        function openAboutVideo() {
            const overlay = document.getElementById('aboutVideoOverlay');
            const video = document.getElementById('aboutVideo');
            if (!overlay || !video) return;

            overlay.classList.add('show');
            try {
                video.currentTime = 0;
                const playPromise = video.play();
                if (playPromise && playPromise.catch) {
                    playPromise.catch(() => {});
                }
            } catch (err) {
                console.warn('打开视频失败:', err);
            }
        }

        function closeAboutVideo(e) {
            if (e && e.target && e.target.id !== 'aboutVideoOverlay' && e.target.id !== 'aboutVideoCloseBtn') {
                return;
            }

            const overlay = document.getElementById('aboutVideoOverlay');
            const video = document.getElementById('aboutVideo');
            if (!overlay || !video) return;

            overlay.classList.remove('show');
            video.pause();
            video.currentTime = 0;
        }

        // --- 重置黑板功能 ---
        function confirmResetAll() {
            closeAbout();
            document.getElementById('resetAllConfirmBar').classList.add('show');
        }

        function closeResetAllModal() {
            document.getElementById('resetAllConfirmBar').classList.remove('show');
        }

        function executeResetAll() {
            // 清空所有页面数据
            state.pages = [null];
            state.currentPage = 0;
            state.history = [];
            state.historyStep = -1;
            state.circles = [];
            state.lines = [];

            // 清空当前画布
            if (state.ctx && state.canvas) {
                state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
            }

            // 更新UI
            updateUI();

            closeResetAllModal();
        }

        function getStudentByTime() {
            // 获取当前时间
            const now = new Date();
            const seconds = now.getSeconds(); // 0-59
            const milliseconds = now.getMilliseconds(); // 0-999

            // 秒数的最后一位（0-9）
            const secondLastDigit = seconds % 10;
            // 毫秒的第一位（0-9）
            const msFirstDigit = Math.floor(milliseconds / 100);

            // 组合成两位数（秒末位 * 10 + 毫秒首位）
            const lookupKey = secondLastDigit * 10 + msFirstDigit; // 范围0-99

            return msToStudentMap[lookupKey];
        }

        function showLottery() {
            const randomNumber = getStudentByTime();
            document.getElementById('resultNumber').textContent = randomNumber;
            document.getElementById('numberResult').style.display = 'flex';
        }

        function closeLottery() {
            document.getElementById('numberResult').style.display = 'none';
        }

        // 启动应用初始化
        init();
        