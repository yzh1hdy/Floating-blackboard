// --- 触摸处理函数（防止高DPI触屏上的滑动误触）---
function handlePenTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handlePenClick();
}
function handleEraserTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handleEraserClick();
}
// --- 橡皮擦点击逻辑：未选中则选中；已选中再次点击则打开/关闭滑动清空菜单 ---
function handleEraserClick() {
    if (state.tool === 'eraser') {
        if (state.eraserMenuOpen) {
            closeEraserMenu();
        } else {
            openEraserMenu();
        }
    } else {
        setTool('eraser');
    }
}
// --- 打开橡皮擦菜单 ---
function openEraserMenu() {
    closePenMenu();
    closeMoreMenu();
    closeVideoMenu();
    state.eraserMenuOpen = true;
    eraserMenu.classList.add('show');
    resetSliderClear();
}
// --- 关闭橡皮擦菜单 ---
function closeEraserMenu() {
    state.eraserMenuOpen = false;
    eraserMenu.classList.remove('show');
    resetSliderClear();
}
// --- 重置滑动条 ---
function resetSliderClear() {
    const knob = document.getElementById('sliderClearKnob');
    if (knob) knob.style.transform = 'translateX(0)';
}
// --- 初始化滑动清空组件（Pointer Events，兼容希沃触屏与鼠标） ---
(function initSliderClear() {
    const track = document.getElementById('sliderClearTrack');
    const knob = document.getElementById('sliderClearKnob');
    if (!track || !knob) return;
    let dragging = false;
    let triggered = false;
    function getProgress(clientX) {
        const rect = track.getBoundingClientRect();
        const p = (clientX - rect.left) / rect.width;
        return Math.max(0, Math.min(1, p));
    }
    function setProgress(p) {
        const trackRect = track.getBoundingClientRect();
        const maxX = trackRect.width - knob.offsetWidth - 6;
        knob.style.transform = 'translateX(' + (p * maxX) + 'px)';
    }
    function springBack() {
        knob.style.transition = 'transform 0.2s ease';
        knob.style.transform = 'translateX(0)';
        setTimeout(function() {
            knob.style.transition = '';
        }, 220);
    }
    track.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        dragging = true;
        triggered = false;
        try { track.setPointerCapture(e.pointerId); } catch (err) {}
        setProgress(getProgress(e.clientX));
    });
    track.addEventListener('pointermove', function(e) {
        if (!dragging || triggered) return;
        const p = getProgress(e.clientX);
        setProgress(p);
        if (p >= 1.0) {
            triggered = true;
            dragging = false;
            // 滑动到底：清空当前页
            if (typeof executeClear === 'function') {
                executeClear();
            }
            // 淡出动画后关闭菜单
            eraserMenu.classList.add('fade-out');
            setTimeout(function() {
                closeEraserMenu();
                eraserMenu.classList.remove('fade-out');
            }, 300);
            // 清空后自动切换至笔工具
            if (typeof setTool === 'function') {
                setTool('pen');
            }
            setTimeout(function() {
                knob.style.transform = 'translateX(0)';
                triggered = false;
            }, 300);
        }
    });
    function onPointerEnd() {
        if (!dragging) return;
        dragging = false;
        if (!triggered) {
            springBack();
        }
    }
    track.addEventListener('pointerup', onPointerEnd);
    track.addEventListener('pointercancel', onPointerEnd);
})();
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

// ====================== 抽奖全局辅助函数 新增开始 ======================
/**
 * 图片加载失败回退文本
 * @param {HTMLElement} numberResult
 * @param {string} randomNumber
 */
function appendLotteryTextFallback(numberResult, randomNumber) {
  const existingTextElement = document.getElementById('lotteryTextFallback');
  if (existingTextElement) existingTextElement.remove();

  const textElement = document.createElement('div');
    textElement.id = 'lotteryTextFallback';
    textElement.style.cssText = `
        position: relative;
        z-index: 2;
        color: #ffffff;
        font-size: 120px;
        font-weight: bold;
        text-shadow: 0 4px 12px rgba(0,0,0,0.9);
        user-select: none;
        pointer-events: none;
        margin-top: 15%;
        margin-bottom: auto;
        font-family: 'HarmonyOS Sans SC Medium', 'HarmonyOSSansSCMedium', 'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif;
    `;
    textElement.textContent = randomNumber;
    numberResult.appendChild(textElement);
}

/**
 * 特殊动画：视频结束后，图片从大到小渐入
 * @param {string} imagePath
 * @param {string} randomNumber
 */
function showImageWithSpecialAnim(imagePath, randomNumber) {
  const numberResult = document.getElementById('numberResult');
  const resultImage = document.getElementById('resultImage');
  const renderId = state.lotteryRenderId;
  
  resultImage.src = imagePath;
  resultImage.onload = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'block';
  resultImage.classList.add('special-pop-anim');
  };
  resultImage.onerror = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'none';
  appendLotteryTextFallback(numberResult, randomNumber);
  };
  }

/**
 * 普通模式：直接显示图片，无缩放动画
 * @param {string} imagePath
 * @param {string} randomNumber
 */
function showNormalImage(imagePath, randomNumber) {
  const numberResult = document.getElementById('numberResult');
  const resultImage = document.getElementById('resultImage');
  const renderId = state.lotteryRenderId;
  
  resultImage.src = imagePath;
  resultImage.onload = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'block';
  };
  resultImage.onerror = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'none';
  appendLotteryTextFallback(numberResult, randomNumber);
  };
  }
// ====================== 抽奖全局辅助函数 新增结束 ======================

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

    // ======【修复版】抽奖弹窗：pointerdown事件委托，支持鼠标+希沃触屏；点遮罩/点视频画面均可跳过视频 =====
    document.getElementById('numberResult').addEventListener('pointerdown', function (e) {
        const specialVideo = document.getElementById('lotterySpecialVideo');
        if (state.isPlayingSpecialVideo) {
            e.preventDefault();
            e.stopPropagation();
            specialVideo.pause();
            if (!isNaN(specialVideo.duration)) {
                specialVideo.currentTime = specialVideo.duration;
            }
            specialVideo.style.display = 'none';
            document.getElementById('numberResult').classList.remove('video-playing');
            state.isPlayingSpecialVideo = false;
            showImageWithSpecialAnim(state.lotteryImagePath, state.lotteryStudentNum);
        } else {
            closeLottery();
        }
    });

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
            playPromise.catch(() => { });
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
    return {
        student: msToStudentMap[lookupKey],
        lookupKey: lookupKey
    };
}
// 将数字转换为7位二进制字符串（不足补前导零）
function to7BitBinary(num) {
    return num.toString(2).padStart(7, '0');
}
// 更新顶部栏显示
function updateTopBar(lookupKey) {
    const topBarText = document.getElementById('topBarText');
    if (topBarText) {
        topBarText.textContent = 'Time:' + to7BitBinary(lookupKey);
    }
}

// ========== 重写抽奖 showLottery ==========
function showLottery() {
  state.lotteryRenderId = (state.lotteryRenderId || 0) + 1;
  const result = getStudentByTime();
    const randomNumber = result.student;
    const lookupKey = result.lookupKey;
    updateTopBar(lookupKey);

    const resultImage = document.getElementById('resultImage');
    const numberResult = document.getElementById('numberResult');
    const specialVideo = document.getElementById('lotterySpecialVideo');

    const paddedNumber = randomNumber.padStart(2, '0');
    const imagePath = 'num/' + paddedNumber + '.png';
    const specialStudentList = ['37','19'];

    // 移除旧回退文本
    const oldTextElement = document.getElementById('lotteryTextFallback');
    if (oldTextElement) {
        oldTextElement.remove();
    }

    // 重置图片：清空src、移除动画、隐藏
    resultImage.classList.remove('special-pop-anim');
    resultImage.style.display = 'none';
    resultImage.style.opacity = '';
    resultImage.style.transform = '';
    resultImage.src = '';

    // 重置视频状态
    specialVideo.style.display = 'none';
    specialVideo.pause();
    specialVideo.currentTime = 0;
    specialVideo.src = '';

    // 缓存本次抽奖信息，供【点击跳过视频】使用
    state.lotteryImagePath = imagePath;
    state.lotteryStudentNum = randomNumber;
    state.isPlayingSpecialVideo = false;

    if (specialStudentList.includes(paddedNumber)) {
        // ====== 放ba1.mp4，结束后才加载图片动画 ======
        specialVideo.src = "ba1.mp4";
        specialVideo.style.display = "block";
        numberResult.classList.add('video-playing');
        numberResult.style.display = 'flex';
        state.isPlayingSpecialVideo = true;

        // 事件清理包装，防止多次绑定
        let boundEndHandler;
        let boundErrorHandler;

        function cleanVideoEvents() {
            specialVideo.removeEventListener('ended', boundEndHandler);
            specialVideo.removeEventListener('error', boundErrorHandler);
        }

        boundEndHandler = function onVideoEnd() {
            cleanVideoEvents();
            specialVideo.style.display = "none";
            numberResult.classList.remove('video-playing');
            state.isPlayingSpecialVideo = false;
            showImageWithSpecialAnim(imagePath, randomNumber);
        };

        boundErrorHandler = function onVideoError(err) {
            console.warn("ba1.mp4 播放失败，降级直接展示图片", err);
            cleanVideoEvents();
            specialVideo.style.display = "none";
            state.isPlayingSpecialVideo = false;
            showNormalImage(imagePath, randomNumber);
        };

        specialVideo.addEventListener('ended', boundEndHandler);
        specialVideo.addEventListener('error', boundErrorHandler);

        specialVideo.play().catch(err => {
            console.warn("ba1.mp4 play()捕获异常，降级", err);
            cleanVideoEvents();
            specialVideo.style.display = "none";
            state.isPlayingSpecialVideo = false;
            showNormalImage(imagePath, randomNumber);
        });

    } else {
        // 普通学号，原有逻辑
        numberResult.style.display = 'flex';
        showNormalImage(imagePath, randomNumber);
    }
}

// ========== 重写 closeLottery ==========
function closeLottery() {
  state.lotteryRenderId = (state.lotteryRenderId || 0) + 1;
  const numberResult = document.getElementById('numberResult');
    numberResult.style.display = 'none';

    const resultImage = document.getElementById('resultImage');
    resultImage.src = '';
    resultImage.classList.remove('special-pop-anim');
    resultImage.style.display = 'none';

    const specialVideo = document.getElementById('lotterySpecialVideo');
    specialVideo.pause();
    specialVideo.currentTime = 0;
    specialVideo.src = "";
    specialVideo.style.display = "none";
    numberResult.classList.remove('video-playing');

    // 重置抽奖状态标记
    state.isPlayingSpecialVideo = false;
    state.lotteryImagePath = "";
    state.lotteryStudentNum = "";

    const textElement = document.getElementById('lotteryTextFallback');
    if (textElement) {
        textElement.remove();
    }
}

// 启动应用初始化
init();
