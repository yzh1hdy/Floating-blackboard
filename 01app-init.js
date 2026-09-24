function init() {
    createCanvas();
    createGridCanvas();
    createMegaEraserPreview();
    // 矢量笔迹：初始为空白页
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    state.pages.push(null);
    updateUI();
    updateToolIcons();
    initPenMenu();
    updateAutoCorrectionSwitch();
    updateToolHighlight(); // 液态玻璃工具栏：初始高亮定位
    if (typeof updateWatermark === 'function') updateWatermark(); // 空白页水印初始显隐
    window.addEventListener('resize', handleResize);
    document.addEventListener('contextmenu', e => e.preventDefault());
    // 已移除鼠标悬停/按下时的图标切换（图片高亮），选中状态仅由滑块指示

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

    // ===== 视频模式：进入后按视频元数据更新宽高比，并让画布绑定视频矩形 =====
    videoBackground.addEventListener('loadedmetadata', function () {
        if (videoBackground.videoWidth && videoBackground.videoHeight) {
            state.videoAspect = videoBackground.videoWidth / videoBackground.videoHeight;
            if (state.videoBackgroundEnabled && typeof syncVideoLayout === 'function') {
                syncVideoLayout();
            }
        }
    });

    // ===== 视频模式：鼠标工具下画布缩放/拖动（支持触屏）=====
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
            // 拖放时画布跟随移动
            state.videoView.tx += (e.clientX - prev.x);
            state.videoView.ty += (e.clientY - prev.y);
            applyViewTransform();
            // 矢量画布的平移烤进上下文变换，需实时更新并重放
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
            // 手势结束：视频模式下若发生过缩放（捏合或滚轮会话），
            // 按最终倍率重排矢量位图，保证放大后线条完全清晰
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
        // 滚轮缩放为离散动作，立即按新倍率重排矢量位图，保持清晰
        if (typeof syncZoomResolution === 'function') syncZoomResolution();
    }, { passive: false });

    // 初始布局同步（非视频模式：全屏）
    if (typeof syncVideoLayout === 'function') syncVideoLayout();

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

// 启动应用初始化
init();

