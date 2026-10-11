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
    closeMoreMenu(false);
    closeVideoMenu(false);
    if (penMenu._closeTimer) window.clearTimeout(penMenu._closeTimer);
    state.penMenuOpen = true;
    penMenu.classList.remove('fade-out');
    penMenu.classList.add('show');
}

function closePenMenu(animate = true) {
    state.penMenuOpen = false;
    if (penMenu._closeTimer) window.clearTimeout(penMenu._closeTimer);
    penMenu.classList.remove('show', 'fade-out');
    if (!animate) return;
    penMenu.classList.add('fade-out');
    penMenu._closeTimer = window.setTimeout(() => {
        penMenu.classList.remove('fade-out');
        penMenu._closeTimer = null;
    }, 420);
}


function handleMoreClick(e) {
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
    closePenMenu(false);
    closeVideoMenu(false);
    if (moreMenu._closeTimer) window.clearTimeout(moreMenu._closeTimer);
    state.moreMenuOpen = true;
    moreMenu.classList.remove('fade-out');
    moreMenu.classList.add('show');
    if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
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
    // 仅确实打开过才恢复穿透，避免计数失衡
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

document.addEventListener('click', (e) => {
    if (state.penMenuOpen && !e.target.closest('#tool-pen') && !e.target.closest('#penMenu')) {
        closePenMenu();
    }
    if (state.moreMenuOpen && !e.target.closest('#btn-more') && !e.target.closest('#moreMenu')) {
        closeMoreMenu();
    }
    if (state.videoMenuOpen && !e.target.closest('#btn-video') && !e.target.closest('#videoMenu')) {
        closeVideoMenu();
    }
    if (state.eraserMenuOpen && !e.target.closest('#tool-eraser') && !e.target.closest('#eraserMenu')) {
        closeEraserMenu();
    }
});

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
function openEraserMenu() {
    closePenMenu(false);
    closeMoreMenu(false);
    closeVideoMenu(false);
    state.eraserMenuOpen = true;
    eraserMenu.classList.remove('fade-out');
    eraserMenu.classList.add('show');
    resetSliderClear();
}
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
function resetSliderClear() {
    const knob = document.getElementById('sliderClearKnob');
    if (knob) knob.style.transform = 'translateX(0)';
}
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
            if (typeof executeClear === 'function') {
                executeClear();
            }
            eraserMenu.classList.add('fade-out');
            setTimeout(function() {
                closeEraserMenu();
                eraserMenu.classList.remove('fade-out');
            }, 300);
            // 清空后：透明模式切回鼠标；非透明模式切回进入橡皮前的工具
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

function toggleTransparentMode() {
    // 透明模式与视频背景互斥：开启透明前先关闭视频背景
    if (!state.transparentMode && state.videoBackgroundEnabled) {
        stopCamera();
        clearCanvasImmediate();
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
    }
    // 开启透明模式时关闭函数绘图器
    if (!state.transparentMode && typeof closeDesmos === 'function') {
        closeDesmos();
    }
    state.transparentMode = !state.transparentMode;
    if (state.transparentMode) {
        // 开启透明模式时自动退出双页书写，回到单页模式
        if (typeof exitDoublePageMode === 'function') exitDoublePageMode();
        enableTransparentMode();
        if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
        setPenColor('#ff1000', findColorBtn('#ff1000'));
        // 进入透明模式时若当前已是鼠标工具，setTool 不会再次触发，需主动通知 webview 开启点击穿透
        if (state.tool === 'mouse' && typeof enableMousePassthrough === 'function') {
            enableMousePassthrough();
        }
    } else {
        disableTransparentMode();
        setPenColor('#ffffff', findColorBtn('#ffffff'));
        disableMousePassthrough();
    }
    const textEl = document.getElementById('transparentModeText');
    if (textEl) {
        textEl.textContent = state.transparentMode ? '退出透明' : '透明模式';
    }
    if (typeof updateWatermark === 'function') updateWatermark();
    closeMoreMenu();
}
function enableTransparentMode() {
    document.body.classList.add('transparent-mode');
    document.body.style.backgroundColor = 'transparent';
    console.log('透明背景模式已启用');
}
function disableTransparentMode() {
    document.body.classList.remove('transparent-mode');
    document.body.style.backgroundColor = '#0f261e';
    console.log('透明背景模式已禁用');
}
function showVideoMenuFromMore() {
    closeMoreMenu();
    openVideoMenu();
}
function openVideoMenu() {
    closePenMenu();
    state.videoMenuOpen = true;
    videoMenu.classList.add('show');
    enumerateCameras();
}
function closeVideoMenu() {
    state.videoMenuOpen = false;
    videoMenu.classList.remove('show');
}

function confirmExitVideoMode() {
    openPopup('exitVideoConfirmOverlay', 'exitVideoConfirmPopup');
}
function closeExitVideoModal() {
    closePopup('exitVideoConfirmOverlay', 'exitVideoConfirmPopup');
}
function handleExitVideoOverlayClick(e) {
    if (e.target === document.getElementById('exitVideoConfirmOverlay')) closeExitVideoModal();
}
function executeExitVideo() {
    closePopup('exitVideoConfirmOverlay', 'exitVideoConfirmPopup');
    stopCamera();
    clearCanvasImmediate();
    if (typeof syncVideoLayout === 'function') syncVideoLayout();
}

function clearCanvasImmediate() {
    if (state.canvas && state.ctx) {
        state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
    }
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
    if (state.pages && typeof state.currentPage === 'number') {
        state.pages[state.currentPage] = null;
    }
}

function stopCamera() {
    if (state.videoStream) {
        state.videoStream.getTracks().forEach(track => track.stop());
        state.videoStream = null;
    }
    videoBackground.srcObject = null;
    videoWrap.classList.remove('active');
    videoBackground.style.transform = '';
    state.videoRotation = 0;
    document.body.classList.remove('video-active');
    state.videoBackgroundEnabled = false;
    // 退出视频背景回普通模式：笔颜色自动切回白色
    if (typeof setPenColor === 'function') setPenColor('#ffffff', findColorBtn('#ffffff'));
    if (typeof setPenSize === 'function') setPenSize(penConfig.sizes[1]);
    const switchEl = document.getElementById('videoToggleSwitch');
    if (switchEl) switchEl.classList.remove('active');
    const statusEl = document.getElementById('videoStatus');
    if (statusEl) statusEl.textContent = '摄像头已关闭';
    // 非切换摄像头时才通知相册模块收起
    if (!state.switchingCamera && typeof window.onVideoModeExited === 'function') {
        try { window.onVideoModeExited(); } catch (_) { }
    }
}

const CAMERA_PREFERRED_WIDTH = 3840;
const CAMERA_PREFERRED_HEIGHT = 2160;

function buildCameraConstraints() {
    const constraints = {
        video: {
            width: { ideal: CAMERA_PREFERRED_WIDTH },
            height: { ideal: CAMERA_PREFERRED_HEIGHT }
        },
        audio: false
    };
    if (state.selectedCameraId) {
        constraints.video.deviceId = { exact: state.selectedCameraId };
    } else {
        constraints.video.facingMode = 'environment';
    }
    return constraints;
}

// 4K 只是首选软限制；Chromium 支持 getCapabilities 时读取摄像头实际最大分辨率，
// 若设备支持 4K 以上（例如 5K/8K），继续用 ideal 请求设备可提供的最高分辨率。
async function maximizeCameraResolution(track) {
    if (!track || typeof track.applyConstraints !== 'function') return null;

    let targetWidth = CAMERA_PREFERRED_WIDTH;
    let targetHeight = CAMERA_PREFERRED_HEIGHT;

    try {
        if (typeof track.getCapabilities === 'function') {
            const caps = track.getCapabilities();
            if (caps.width && caps.width.max) targetWidth = caps.width.max;
            if (caps.height && caps.height.max) targetHeight = caps.height.max;
        }
        await track.applyConstraints({
            width: { ideal: targetWidth },
            height: { ideal: targetHeight }
        });
    } catch (err) {
        console.warn('提升摄像头分辨率失败，保留浏览器已分配的分辨率:', err);
    }

    return typeof track.getSettings === 'function' ? track.getSettings() : null;
}

async function startCamera(statusEl, switchEl) {
    try {
        statusEl.textContent = '正在请求摄像头权限...';
        const stream = await navigator.mediaDevices.getUserMedia(buildCameraConstraints());
        state.videoStream = stream;
        videoBackground.srcObject = stream;
        videoWrap.classList.add('active');
        document.body.classList.add('video-active');
        state.videoBackgroundEnabled = true;
        switchEl.classList.add('active');
        // 开启视频/展台模式时自动退出双页书写，回到单页模式
        if (typeof exitDoublePageMode === 'function') exitDoublePageMode();
        // 开启视频背景模式：笔颜色自动切为红色
        if (typeof setPenColor === 'function') setPenColor('#ff1000', findColorBtn('#ff1000'));
        const track = stream.getVideoTracks()[0];
        const settings = await maximizeCameraResolution(track);
        const resolution = settings && settings.width && settings.height
            ? '（' + settings.width + '×' + settings.height + '）'
            : '';
        statusEl.textContent = '摄像头已开启' + resolution + (track && track.label ? '：' + track.label : '');
        await enumerateCameras();
        if (state.videoBackgroundEnabled && typeof syncVideoLayout === 'function') {
            syncVideoLayout();
        }
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

function applyVideoRotation() {
    // 相册查看态由相册模块自身布局，不走旋转
    if (typeof window.applyAlbumPhotoLayout === 'function' && applyAlbumPhotoLayout()) return;
    if (!videoBackground || !videoWrap) return;
    const r = computeVideoVisibleRect();
    videoWrap.style.left = r.x + 'px';
    videoWrap.style.top = r.y + 'px';
    videoWrap.style.width = r.width + 'px';
    videoWrap.style.height = r.height + 'px';
    const rot = ((state.videoRotation || 0) % 4 + 4) % 4;
    let w, h;
    if (rot === 1 || rot === 3) { w = r.height; h = r.width; }
    else { w = r.width; h = r.height; }
    videoBackground.style.width = w + 'px';
    videoBackground.style.height = h + 'px';
    videoBackground.style.transform = 'translate(-50%, -50%) rotate(' + (rot * 90) + 'deg)';
    videoBackground.style.objectFit = 'cover';
    videoBackground.style.objectPosition = 'center center';
}

function rotateVideoCW() {
    if (!state.videoBackgroundEnabled) return;
    // 先返回相机，避免照片已烤入的旧旋转与新旋转不一致
    if (state.albumViewing && typeof window.returnToCamera === 'function') {
        returnToCamera();
    }
    state.videoRotation = ((state.videoRotation || 0) + 1) % 4;
    clearCanvasImmediate();
    if (typeof syncVideoLayout === 'function') syncVideoLayout();
}

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

async function onCameraChanged(deviceId) {
    state.selectedCameraId = deviceId || null;
    if (state.videoBackgroundEnabled) {
        const statusEl = document.getElementById('videoStatus');
        const switchEl = document.getElementById('videoToggleSwitch');
        // 标记切换摄像头：stopCamera 不收起相册 UI，避免闪动
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
        // 函数绘图器打开时不允许开启视频/展台模式
        if (typeof isDesmosOpen === 'function' && isDesmosOpen()) {
            if (switchEl) switchEl.classList.remove('active');
            if (statusEl) statusEl.textContent = '函数绘图器打开时不可开启展台模式';
            return;
        }
        // 互斥：开启视频前先关闭透明模式
        if (state.transparentMode) {
            disableTransparentMode();
            disableMousePassthrough();
            state.transparentMode = false;
            const textEl = document.getElementById('transparentModeText');
            if (textEl) textEl.textContent = '透明模式';
        }
        await startCamera(statusEl, switchEl);
        if (state.videoBackgroundEnabled) {
            // 首次打开视频背景时，画面默认顺时针转 90 度
            if (!state.videoAutoRotatedOnce) {
                state.videoAutoRotatedOnce = true;
                state.videoRotation = 1;
            }
            clearCanvasImmediate();
            if (typeof syncVideoLayout === 'function') syncVideoLayout();
        }
    } else {
        stopCamera();
        clearCanvasImmediate();
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
    }
}
function showAbout() {
    closeMoreMenu();
    aboutDialog.classList.add('show');
    // 关于弹窗打开期间挂起点击穿透，否则透明模式下弹窗无法点击
    if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
}
function closeAbout() {
    aboutDialog.classList.remove('show');
    if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
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
function confirmResetAll() {
    closeAbout();
    document.getElementById('resetAllConfirmBar').classList.add('show');
    // 重置确认条显示期间同样挂起点击穿透
    if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
}
function closeResetAllModal() {
    document.getElementById('resetAllConfirmBar').classList.remove('show');
    if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
}
function executeResetAll() {
    // 重置页面时同步退出双页书写，回到单页，避免翻页被双页路由卡住
    if (state.doublePageMode) {
        state.doublePageMode = false;
        state.activeDoublePage = 0;
        const overlay = document.getElementById('doublePageOverlay');
        if (overlay) overlay.classList.remove('active');
        const sw = document.getElementById('doublePageSwitch');
        if (sw) sw.classList.remove('active');
    }
    state.pages = [null];
    state.currentPage = 0;
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    if (state.ctx && state.canvas) {
        state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
    }
    updateUI();
    closeResetAllModal();
}
//（注：内容由AI生成）

