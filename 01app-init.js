function init() {
    createCanvas();
    createGridCanvas();
    createMegaEraserPreview();
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    state.pages.push(null);
    updateUI();
    updateToolIcons();
    initPenMenu();
    updateAutoCorrectionSwitch();
    updateToolHighlight();
    if (typeof updateWatermark === 'function') updateWatermark();
    window.addEventListener('resize', handleResize);
    document.addEventListener('contextmenu', e => e.preventDefault());

    // 抽奖结果界面：pointerdown 委托，点遮罩/点视频均可跳过视频
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
            // 跳过视频后从展示图片开始才计时 1 秒自动关闭
            if (typeof armLotteryAutoClose === 'function') armLotteryAutoClose();
        } else {
            closeLottery();
        }
    });

    const aboutImage = document.querySelector('.about-image');
    if (aboutImage) {
        aboutImage.style.cursor = 'pointer';
        aboutImage.addEventListener('click', openAboutVideo);
    }

    videoBackground.addEventListener('loadedmetadata', function () {
        if (videoBackground.videoWidth && videoBackground.videoHeight) {
            state.videoAspect = videoBackground.videoWidth / videoBackground.videoHeight;
            if (state.videoBackgroundEnabled && typeof syncVideoLayout === 'function') {
                syncVideoLayout();
            }
        }
    });

    // 视频模式：鼠标工具下画布缩放/拖动（支持触屏）
    let videoPan = null;
    function isVideoPanMode() {
        return !!(state.videoBackgroundEnabled && state.tool === 'mouse');
    }
    container.addEventListener('pointerdown', function (e) {
        if (!isVideoPanMode()) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        try { container.setPointerCapture(e.pointerId); } catch (_) { }
        if (!videoPan) videoPan = { pointers: new Map(), mode: 'none', pinchBase: null, pinchScale: 1, lastMidX: 0, lastMidY: 0 };
        videoPan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (videoPan.pointers.size >= 2) {
            videoPan.mode = 'pinch';
            videoPan.pinchBase = null;
            videoPan.pinchScale = state.videoView.scale;
            const a = Array.from(videoPan.pointers.values());
            videoPan.lastMidX = (a[0].x + a[1].x) / 2;
            videoPan.lastMidY = (a[0].y + a[1].y) / 2;
        } else {
            videoPan.mode = 'pan';
        }
    });
    container.addEventListener('pointermove', function (e) {
        if (!videoPan || !videoPan.pointers.has(e.pointerId)) return;
        e.preventDefault();
        const prev = videoPan.pointers.get(e.pointerId);
        videoPan.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (videoPan.mode === 'pan') {
            state.videoView.tx += (e.clientX - prev.x);
            state.videoView.ty += (e.clientY - prev.y);
            applyViewTransform();
            if (typeof applyViewToContexts === 'function') applyViewToContexts();
            if (state.gridEnabled && typeof drawGrid === 'function') drawGrid();
            renderAll();
        } else if (videoPan.mode === 'pinch') {
            const arr = Array.from(videoPan.pointers.values());
            if (arr.length >= 2) {
                const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
                const midX = (arr[0].x + arr[1].x) / 2, midY = (arr[0].y + arr[1].y) / 2;
                if (videoPan.pinchBase == null) {
                    videoPan.pinchBase = d;
                    videoPan.pinchScale = state.videoView.scale;
                } else {
                    state.videoView.tx += (midX - videoPan.lastMidX);
                    state.videoView.ty += (midY - videoPan.lastMidY);
                    const ns = clampVideoZoom(videoPan.pinchScale * (d / videoPan.pinchBase));
                    if (ns !== state.videoView.scale) zoomAt(midX, midY, ns / state.videoView.scale);
                }
                videoPan.lastMidX = midX;
                videoPan.lastMidY = midY;
            }
        }
    });
    function videoPointerEnd(e) {
        if (!videoPan) return;
        videoPan.pointers.delete(e.pointerId);
        try { container.releasePointerCapture(e.pointerId); } catch (_) { }
        if (videoPan.pointers.size < 2) videoPan.pinchBase = null;
        if (videoPan.pointers.size === 1) videoPan.mode = 'pan';
        if (videoPan.pointers.size === 0) {
            // 手势结束后按最终倍率重排，保证放大后线条清晰
            if (typeof syncZoomResolution === 'function') syncZoomResolution();
            videoPan = null;
        }
    }
    container.addEventListener('pointerup', videoPointerEnd);
    container.addEventListener('pointercancel', videoPointerEnd);
    container.addEventListener('wheel', function (e) {
        if (!isVideoPanMode()) return;
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.12 : 1 / 1.12);
        if (typeof syncZoomResolution === 'function') syncZoomResolution();
    }, { passive: false });

    // 普通模式：鼠标工具下按住拖动 / 滚轮向下翻页
    let normalPan = null;
    function isNormalPanMode() {
        return typeof isNormalMode === 'function' && isNormalMode() && state.tool === 'mouse';
    }
    container.addEventListener('pointerdown', function (e) {
        if (!isNormalPanMode()) return;
        if (normalPan) return; // 仅支持单指纵向拖动
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        try { container.setPointerCapture(e.pointerId); } catch (_) { }
        normalPan = { id: e.pointerId, startY: e.clientY, baseY: state.normalScrollY || 0 };
        container.classList.add('cursor-grabbing-pan');
    });
    container.addEventListener('pointermove', function (e) {
        if (!normalPan || e.pointerId !== normalPan.id) return;
        e.preventDefault();
        const target = normalPan.baseY - (e.clientY - normalPan.startY);
        setNormalScrollY(target);
    });
    function normalPointerEnd(e) {
        if (!normalPan || e.pointerId !== normalPan.id) return;
        try { container.releasePointerCapture(e.pointerId); } catch (_) { }
        normalPan = null;
        container.classList.remove('cursor-grabbing-pan');
    }
    container.addEventListener('pointerup', normalPointerEnd);
    container.addEventListener('pointercancel', normalPointerEnd);
    container.addEventListener('wheel', function (e) {
        if (!isNormalPanMode()) return;
        e.preventDefault();
        setNormalScrollY((state.normalScrollY || 0) + e.deltaY);
    }, { passive: false });

    if (typeof syncVideoLayout === 'function') syncVideoLayout();

    document.getElementById('prevPageBtn').addEventListener('click', () => {
        if (state.doublePageMode) { if (typeof doublePagePrev === 'function') doublePagePrev(); return; }
        goToPage(state.currentPage - 1);
    });
    document.getElementById('nextPageBtn').addEventListener('click', () => {
        if (state.doublePageMode) { if (typeof doublePageNext === 'function') doublePageNext(); return; }
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
    document.getElementById('pageIndicator').addEventListener('click', () => {
        if (typeof toggleDoublePageMenu === 'function') toggleDoublePageMenu();
    });
}

init();

