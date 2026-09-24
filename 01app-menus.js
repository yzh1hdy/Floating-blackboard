// --- 初始化笔设置菜单 ---
function initPenMenu() {
    const palette = document.getElementById('colorPalette');
    penConfig.colors.forEach((color, index) => {
        const btn = document.createElement('div');
        btn.className = 'color-btn' + (color.default ? ' active' : '');
        btn.style.backgroundColor = color.value;
        btn.setAttribute('data-color', color.value);
        btn.title = color.name;
        btn.onclick = () => setPenColor(color.value, btn);
        btn.ontouchstart = (e) => { handleTouchStartBtn(e); };
        btn.ontouchmove = (e) => { handleTouchMoveBtn(e); };
        btn.ontouchend = (e) => { handleTouchEndBtn(e); };
        palette.appendChild(btn);
    });
}

function setPenColor(color, btnElement) {
    penConfig.currentColor = color;
    document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('active'));
    if (btnElement) btnElement.classList.add('active');
}

function findColorBtn(color) {
    const buttons = document.querySelectorAll('.color-btn');
    for (let btn of buttons) {
        if (btn.getAttribute('data-color') === color) {
            return btn;
        }
    }
    return null;
}

function setPenSize(size) {
    penConfig.currentSize = size;
    document.querySelectorAll('.size-preset-btn').forEach((btn, index) => {
        const presetSize = penConfig.sizes[index];
        if (Math.abs(presetSize - size) < 0.1) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function handlePenClick() {
    if (state.tool === 'pen' && state.penMenuOpen) {
        closePenMenu();
    } else if (state.tool === 'pen' && !state.penMenuOpen) {
        openPenMenu();
    } else {
        setTool('pen');
    }
}

function openPenMenu() {
    closeMoreMenu(false); // 切换菜单时立即隐藏，避免其他菜单闪现
    closeVideoMenu(false); // 关闭视频菜单
    if (penMenu._closeTimer) window.clearTimeout(penMenu._closeTimer);
    state.penMenuOpen = true;
    penMenu.classList.remove('fade-out');
    penMenu.classList.add('show');
}

function closePenMenu(animate = true) {
    state.penMenuOpen = false;
    if (penMenu._closeTimer) window.clearTimeout(penMenu._closeTimer);
    penMenu.classList.remove('show', 'fade-out');  // 先移除所有动画类
    if (!animate) return;  // 立即关闭时直接返回，不添加动画
    penMenu.classList.add('fade-out');
    penMenu._closeTimer = window.setTimeout(() => {
        penMenu.classList.remove('fade-out');
        penMenu._closeTimer = null;
    }, 420);
}


// --- 更多菜单功能 ---
function handleMoreClick(e) {
    // 获取事件对象（兼容不同浏览器）
    var event = e || window.event;
    if (event) {
        event.stopPropagation();
        if (event.preventDefault) event.preventDefault();
    }

    if (state.moreMenuOpen) {
        closeMoreMenu();
    } else {
        openMoreMenu();
    }
}

function openMoreMenu() {
    closePenMenu(false); // 切换菜单时立即隐藏，避免其他菜单闪现
    closeVideoMenu(false); // 关闭视频菜单
    if (moreMenu._closeTimer) window.clearTimeout(moreMenu._closeTimer);
    state.moreMenuOpen = true;
    moreMenu.classList.remove('fade-out');
    moreMenu.classList.add('show');
    // 【透明模式】打开更多菜单时临时取消鼠标穿透，避免菜单交互穿透到桌面
    if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
    // 已移除菜单打开时的图标高亮（图片高亮）
    // 更新透明模式按钮文本
    const textEl = document.getElementById('transparentModeText');
    if (textEl) {
        textEl.textContent = state.transparentMode ? '退出透明' : '透明模式';
    }
}

function closeMoreMenu(animate = true) {
    const wasOpen = state.moreMenuOpen;
    state.moreMenuOpen = false;
    if (moreMenu._closeTimer) window.clearTimeout(moreMenu._closeTimer);
    moreMenu.classList.remove('show', 'fade-out');
    // 【透明模式】更多菜单从打开态关闭时恢复鼠标穿透（仅确实打开过才恢复，避免穿透计数失衡）
    if (wasOpen && typeof resumeMousePassthrough === 'function') {
        resumeMousePassthrough();
    }
    if (!animate) return;
    moreMenu.classList.add('fade-out');
    moreMenu._closeTimer = window.setTimeout(() => {
        moreMenu.classList.remove('fade-out');
        moreMenu._closeTimer = null;
    }, 420);
}

function closeAllMenus(animate = true) {
    closePenMenu(animate);
    closeMoreMenu(animate);
    closeVideoMenu(animate);
    if (typeof closeEraserMenu === 'function' && state.eraserMenuOpen) {
        closeEraserMenu(animate);
    }
}

// 点击外部关闭菜单
document.addEventListener('click', (e) => {
    // 关闭笔设置菜单
    if (state.penMenuOpen && !e.target.closest('#tool-pen') && !e.target.closest('#penMenu')) {
        closePenMenu();
    }
    // 关闭更多菜单
    if (state.moreMenuOpen && !e.target.closest('#btn-more') && !e.target.closest('#moreMenu')) {
        closeMoreMenu();
    }
    // 关闭视频菜单
    if (state.videoMenuOpen && !e.target.closest('#btn-video') && !e.target.closest('#videoMenu')) {
        closeVideoMenu();
    }
    // 关闭橡皮擦菜单
    if (state.eraserMenuOpen && !e.target.closest('#tool-eraser') && !e.target.closest('#eraserMenu')) {
        closeEraserMenu();
    }
});

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
    closePenMenu(false);
    closeMoreMenu(false);
    closeVideoMenu(false);
    state.eraserMenuOpen = true;
    eraserMenu.classList.remove('fade-out');
    eraserMenu.classList.add('show');
    resetSliderClear();
}
// --- 关闭橡皮擦菜单 ---
function closeEraserMenu(animate = true) {
    state.eraserMenuOpen = false;
    eraserMenu.classList.remove('show');
    if (!animate) {
        eraserMenu.classList.remove('fade-out');
        resetSliderClear();
        return;
    }
    eraserMenu.classList.add('fade-out');
    window.setTimeout(() => eraserMenu.classList.remove('fade-out'), 420);
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
        if (p >= 0.7) {
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
            // 清空后自动切回工具：透明模式下始终切回鼠标工具；
            // 非透明模式下切回进入橡皮前使用的工具（原为鼠标则切回鼠标，否则仍为笔）
            var restoreTool = state.transparentMode ? 'mouse' : ((state.preEraserTool === 'mouse') ? 'mouse' : 'pen');
            if (typeof setTool === 'function') {
                setTool(restoreTool);
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

// --- 透明模式切换功能 ---
function toggleTransparentMode() {
    // 透明模式与视频背景互斥：开启透明前先关闭视频背景
    if (!state.transparentMode && state.videoBackgroundEnabled) {
        stopCamera();
        clearCanvasImmediate();
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
    }
    state.transparentMode = !state.transparentMode;
    if (state.transparentMode) {
        enableTransparentMode();
        setPenColor('#ff1000', findColorBtn('#ff1000'));
    } else {
        disableTransparentMode();
        setPenColor('#ffffff', findColorBtn('#ffffff'));
        // 退出透明模式：非透明模式下鼠标按钮不生效，同步关闭鼠标穿透
        disableMousePassthrough();
    }
    // 更新菜单按钮文本
    const textEl = document.getElementById('transparentModeText');
    if (textEl) {
        textEl.textContent = state.transparentMode ? '退出透明' : '透明模式';
    }
    // 透明模式切换后刷新水印显隐（透明模式下不显示水印）
    if (typeof updateWatermark === 'function') updateWatermark();
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
    // 打开菜单时枚举摄像头列表（权限已授予后会显示设备标签）
    enumerateCameras();
}
function closeVideoMenu() {
    state.videoMenuOpen = false;
    videoMenu.classList.remove('show');
}

// --- 立即清空当前画布（无动画）：进入/退出视频模式、旋转画面时调用 ---
function clearCanvasImmediate() {
    if (state.canvas && state.ctx) {
        state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
    }
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    if (state.pages && typeof state.currentPage === 'number') {
        state.pages[state.currentPage] = null;
    }
}

// --- 停止摄像头并复位 UI ---
function stopCamera() {
    if (state.videoStream) {
        state.videoStream.getTracks().forEach(track => track.stop());
        state.videoStream = null;
    }
    videoBackground.srcObject = null;
    videoWrap.classList.remove('active');
    videoBackground.style.transform = '';
    state.videoRotation = 0; // 退出视频模式复位旋转
    document.body.classList.remove('video-active');
    state.videoBackgroundEnabled = false;
    // 从视频模式切回普通模式：笔粗细自动切回默认的第二档（2.5）
    if (typeof setPenSize === 'function') setPenSize(penConfig.sizes[1]);
    const switchEl = document.getElementById('videoToggleSwitch');
    if (switchEl) switchEl.classList.remove('active');
    const statusEl = document.getElementById('videoStatus');
    if (statusEl) statusEl.textContent = '摄像头已关闭';
    // 真正退出视频模式（非切换摄像头）：通知相册模块收起短工具栏/面板与照片
    if (!state.switchingCamera && typeof window.onVideoModeExited === 'function') {
        try { window.onVideoModeExited(); } catch (_) { }
    }
}

// --- 启动摄像头（优先使用用户选择的设备）---
async function startCamera(statusEl, switchEl) {
    try {
        statusEl.textContent = '正在请求摄像头权限...';
        const constraints = {
            video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
            audio: false
        };
        if (state.selectedCameraId) {
            constraints.video.deviceId = { exact: state.selectedCameraId };
        } else {
            constraints.video.facingMode = 'environment';
        }
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        state.videoStream = stream;
        videoBackground.srcObject = stream;
        videoWrap.classList.add('active');
        document.body.classList.add('video-active');
        state.videoBackgroundEnabled = true;
        switchEl.classList.add('active');
        const track = stream.getVideoTracks()[0];
        statusEl.textContent = '摄像头已开启' + (track && track.label ? '：' + track.label : '');
        // 权限获取后重新枚举，以拿到设备标签
        await enumerateCameras();
        // 视频模式：画布绑定到视频可见矩形
        if (state.videoBackgroundEnabled && typeof syncVideoLayout === 'function') {
            syncVideoLayout();
        }
        // 视频模式已进入：显示拍照/相册短工具栏并刷新相册列表
        if (typeof window.onVideoModeEntered === 'function') {
            try { window.onVideoModeEntered(); } catch (_) { }
        }
    } catch (err) {
        console.error('摄像头访问失败:', err);
        statusEl.textContent = '无法访问摄像头: ' + err.message;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            statusEl.textContent = '请在系统设置中允许摄像头访问';
        }
    }
}

// --- 应用视频旋转：不裁切、保持原始比例，画面顺时针旋转90°的整数倍 ---
function applyVideoRotation() {
    // 相册查看态：画面为已烤入方向的照片，由相册模块按自身宽高比布局，不走旋转
    if (typeof window.applyAlbumPhotoLayout === 'function' && applyAlbumPhotoLayout()) return;
    if (!videoBackground || !videoWrap) return;
    const r = computeVideoVisibleRect();
    // 包裹层定位到视频可见矩形（与画布容器同矩形、同变换原点，从而跟随画布缩放/平移）
    videoWrap.style.left = r.x + 'px';
    videoWrap.style.top = r.y + 'px';
    videoWrap.style.width = r.width + 'px';
    videoWrap.style.height = r.height + 'px';
    const rot = ((state.videoRotation || 0) % 4 + 4) % 4;
    let w, h;
    if (rot === 1 || rot === 3) { w = r.height; h = r.width; } // 旋转±90°时宽高互换
    else { w = r.width; h = r.height; }
    videoBackground.style.width = w + 'px';
    videoBackground.style.height = h + 'px';
    // 视频元素在包裹层内居中，再旋转
    videoBackground.style.transform = 'translate(-50%, -50%) rotate(' + (rot * 90) + 'deg)';
    videoBackground.style.objectFit = 'cover';
    videoBackground.style.objectPosition = 'center center';
}

// --- 视频背景设置菜单：旋转画面，点一下顺时针旋转90° ---
function rotateVideoCW() {
    if (!state.videoBackgroundEnabled) return;
    // 正在查看相册照片时先返回相机，避免照片方向（已烤入旧旋转）与新旋转不一致
    if (state.albumViewing && typeof window.returnToCamera === 'function') {
        returnToCamera();
    }
    state.videoRotation = ((state.videoRotation || 0) + 1) % 4;
    clearCanvasImmediate();
    if (typeof syncVideoLayout === 'function') syncVideoLayout();
}

// --- 枚举摄像头并填充下拉框；多于一个摄像头时才显示选择器 ---
async function enumerateCameras() {
    const select = document.getElementById('cameraSelect');
    const container = document.getElementById('cameraSelector');
    if (!select || !container) return;
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cams = devices.filter(d => d.kind === 'videoinput');
        select.innerHTML = '';
        cams.forEach((cam, idx) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            opt.textContent = cam.label || ('摄像头 ' + (idx + 1));
            select.appendChild(opt);
        });
        container.style.display = cams.length > 1 ? 'block' : 'none';
        if (state.selectedCameraId) {
            select.value = state.selectedCameraId;
        }
    } catch (err) {
        console.warn('枚举摄像头失败:', err);
    }
}

// --- 用户在下拉框中切换摄像头 ---
async function onCameraChanged(deviceId) {
    state.selectedCameraId = deviceId || null;
    if (state.videoBackgroundEnabled) {
        const statusEl = document.getElementById('videoStatus');
        const switchEl = document.getElementById('videoToggleSwitch');
        // 标记为切换摄像头：stopCamera 不触发相册 UI 收起，避免工具栏/面板闪动
        state.switchingCamera = true;
        try {
            stopCamera();
            await startCamera(statusEl, switchEl);
        } finally {
            state.switchingCamera = false;
        }
    }
}

async function toggleVideoBackground() {
    const switchEl = document.getElementById('videoToggleSwitch');
    const statusEl = document.getElementById('videoStatus');
    if (!state.videoBackgroundEnabled) {
        // 互斥：开启视频背景前先关闭透明模式
        if (state.transparentMode) {
            disableTransparentMode();
            disableMousePassthrough();
            state.transparentMode = false;
            const textEl = document.getElementById('transparentModeText');
            if (textEl) textEl.textContent = '透明模式';
        }
        await startCamera(statusEl, switchEl);
        // 进入视频模式：自动清空画布
        if (state.videoBackgroundEnabled) {
            clearCanvasImmediate();
            if (typeof syncVideoLayout === 'function') syncVideoLayout();
        }
    } else {
        stopCamera();
        // 退出视频模式：自动清空画布并恢复全屏布局
        clearCanvasImmediate();
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
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
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    // 清空当前画布
    if (state.ctx && state.canvas) {
        state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
    }
    // 更新UI
    updateUI();
    closeResetAllModal();
}
//（注：内容由AI生成）

