function init() {
    createCanvas();
    createMegaEraserPreview();
    createSelectionCanvas();
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    state.pages.push(null);
    updateUI();
    updateToolIcons();
    initPenMenu();
    updateBoxSelectSwitch();
    updateMultiFingerSwitch();
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

    // 普通模式：鼠标工具下按住拖动（自由平移画布）。框选开关开启时替换为框选工具
    let normalPan = null;
    function isNormalPanMode() {
        return typeof isNormalMode === 'function' && isNormalMode() && state.tool === 'mouse' && !state.boxSelectEnabled;
    }
    function isBoxSelectMode() {
        // 双页书写模式坐标按半屏平移存储，与框选逻辑坐标不匹配，保持翻页而非框选
        return typeof isNormalMode === 'function' && isNormalMode() && !state.doublePageMode && state.tool === 'mouse' && state.boxSelectEnabled;
    }
    container.addEventListener('pointerdown', function (e) {
        if (!isNormalPanMode()) return;
        if (normalPan) return; // 仅支持单指拖动
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        // 鼠标工具点中函数图像 → 等比缩放（优先于画布平移）
        if (tryImageInteract(e, clientToLogical(e.clientX, e.clientY))) return;
        e.preventDefault();
        try { container.setPointerCapture(e.pointerId); } catch (_) { }
        normalPan = {
            id: e.pointerId,
            startX: e.clientX, startY: e.clientY,
            baseX: state.normalScrollX || 0,
            baseY: state.normalScrollY || 0
        };
        container.classList.add('cursor-grabbing-pan');
    });
    container.addEventListener('pointermove', function (e) {
        if (!normalPan || e.pointerId !== normalPan.id) return;
        e.preventDefault();
        setNormalScroll(
            normalPan.baseX - (e.clientX - normalPan.startX),
            normalPan.baseY - (e.clientY - normalPan.startY)
        );
    });
    function normalPointerEnd(e) {
        if (!normalPan || e.pointerId !== normalPan.id) return;
        try { container.releasePointerCapture(e.pointerId); } catch (_) { }
        normalPan = null;
        container.classList.remove('cursor-grabbing-pan');
    }
    container.addEventListener('pointerup', normalPointerEnd);
    container.addEventListener('pointercancel', normalPointerEnd);

    // 鼠标框选：普通模式 + 鼠标工具 + 框选开关开启时，鼠标拖拽执行框选 / 移动 / 缩放
    let selPointer = null;

    // 鼠标工具点中函数图像：选中并进入等比缩放（可拖动，或以四角手柄缩放）
    function tryImageInteract(e, p) {
        if (!(state.tool === 'mouse' && isNormalMode() && !state.doublePageMode)) return false;
        const img = imageHitTest(p);
        if (!img) return false;
        e.preventDefault();
        try { container.setPointerCapture(e.pointerId); } catch (_) { }
        const isSel = state.selection.length === 1 && state.selection[0] === img;
        state.selection = [img];
        const h = isSel ? hitSelectionHandle(p) : -1;
        if (h >= 0) {
            // 已选中且点中四角手柄 → 以对角为锚点等比缩放
            const b = selectionBounds();
            const pad = 6;
            const cs = [
                [b.x - pad, b.y - pad],
                [b.x - pad + b.w + pad * 2, b.y - pad],
                [b.x - pad, b.y - pad + b.h + pad * 2],
                [b.x - pad + b.w + pad * 2, b.y - pad + b.h + pad * 2]
            ];
            const anchor = cs[3 - h];
            selPointer = { mode: 'imgscale', id: e.pointerId, lastX: p.x, lastY: p.y, img: img, anchorX: anchor[0], anchorY: anchor[1], x0: img.x, y0: img.y, w0: img.w, h0: img.h };
        } else {
            // 首次点中：以距指针最远的角为锚点，拖动即等比缩放
            const cs = imageCorners(img);
            let anchor = cs[0], best = -1;
            for (const c of cs) { const d = Math.hypot(p.x - c[0], p.y - c[1]); if (d > best) { best = d; anchor = c; } }
            selPointer = { mode: 'imgscale', id: e.pointerId, lastX: p.x, lastY: p.y, img: img, anchorX: anchor[0], anchorY: anchor[1], x0: img.x, y0: img.y, w0: img.w, h0: img.h };
        }
        state.selDrag = selPointer;
        drawSelectionOverlay();
        return true;
    }

    function boxSelectDown(e) {
        if (!isBoxSelectMode()) return;
        // 触屏支持：鼠标只认左键；触屏只认主触点；已有框选手势进行中时忽略并发触点
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.pointerType === 'touch' && e.isPrimary === false) return;
        if (selPointer) return;
        e.preventDefault();
        try { container.setPointerCapture(e.pointerId); } catch (_) { }
        const p = clientToLogical(e.clientX, e.clientY);

        // 鼠标工具命中函数图像 → 直接等比缩放，不进入框选
        if (tryImageInteract(e, p)) return;

        // 已有选区：优先命中缩放手柄 → 缩放；命中选区内部 → 移动；否则开始新框选
        if (state.selection && state.selection.length) {
            const h = hitSelectionHandle(p);
            if (h >= 0) {
                const b = selectionBounds();
                const pad = 6;
                const corners = [
                    [b.x - pad, b.y - pad],
                    [b.x - pad + b.w + pad * 2, b.y - pad],
                    [b.x - pad, b.y - pad + b.h + pad * 2],
                    [b.x - pad + b.w + pad * 2, b.y - pad + b.h + pad * 2]
                ];
                const anchor = corners[3 - h];
                // 缩放方向符号：左侧角(h=0/2)宽度随 dx 反向，顶部角(h=0/1)高度随 dy 反向
                const signX = (h === 0 || h === 2) ? -1 : 1;
                const signY = (h === 0 || h === 1) ? -1 : 1;
                selPointer = {
                    mode: 'scale', id: e.pointerId,
                    lastX: p.x, lastY: p.y,
                    anchorX: anchor[0], anchorY: anchor[1],
                    signX: signX, signY: signY,
                    uniform: h === 3   // 右下角：等比缩放不拉伸
                };
                state.selDrag = selPointer;
                return;
            }
            if (isInsideSelection(p)) {
                selPointer = { mode: 'move', id: e.pointerId, lastX: p.x, lastY: p.y };
                state.selDrag = selPointer;
                container.classList.add('cursor-grabbing-pan');
                return;
            }
        }

        // 新框选：清空旧选区
        if (state.selection.length) state.selection = [];
        selPointer = { mode: 'select', id: e.pointerId, startX: p.x, startY: p.y, rect: { x: p.x, y: p.y, w: 0, h: 0 } };
        state.selDrag = selPointer;
    }
    function boxSelectMove(e) {
        if (!selPointer || e.pointerId !== selPointer.id) return;
        e.preventDefault();
        const p = clientToLogical(e.clientX, e.clientY);
        if (selPointer.mode === 'select') {
            selPointer.rect = {
                x: Math.min(selPointer.startX, p.x),
                y: Math.min(selPointer.startY, p.y),
                w: Math.abs(p.x - selPointer.startX),
                h: Math.abs(p.y - selPointer.startY)
            };
        } else if (selPointer.mode === 'move') {
            const dx = p.x - selPointer.lastX, dy = p.y - selPointer.lastY;
            selPointer.lastX = p.x; selPointer.lastY = p.y;
            for (const s of state.selection) translateStrokeBy(s, dx, dy);
            renderAll();
        } else if (selPointer.mode === 'scale') {
            const dx = p.x - selPointer.lastX, dy = p.y - selPointer.lastY;
            selPointer.lastX = p.x; selPointer.lastY = p.y;
            const b = selectionBounds();
            if (b) {
                let sx, sy;
                if (selPointer.uniform) {
                    // 右下角：以左上角为锚点，按指针到锚点距离比例等比缩放
                    const pad = 6;
                    const w0 = Math.max(1, b.w + pad * 2);
                    const h0 = Math.max(1, b.h + pad * 2);
                    const k = Math.max(0.05, Math.hypot(w0 + dx, h0 + dy) / Math.hypot(w0, h0));
                    sx = k; sy = k;
                } else {
                    sx = Math.max(0.05, (b.w + selPointer.signX * dx) / (b.w || 1));
                    sy = Math.max(0.05, (b.h + selPointer.signY * dy) / (b.h || 1));
                }
                for (const s of state.selection) scaleStrokeAbout(s, selPointer.anchorX, selPointer.anchorY, sx, sy);
                renderAll();
            }
        } else if (selPointer.mode === 'imgscale') {
            const dx = p.x - selPointer.lastX, dy = p.y - selPointer.lastY;
            selPointer.lastX = p.x; selPointer.lastY = p.y;
            const img = selPointer.img;
            const cx = selPointer.anchorX, cy = selPointer.anchorY;
            const diag = Math.max(1, Math.hypot(selPointer.w0, selPointer.h0));
            const newDiag = Math.hypot(p.x - cx, p.y - cy);
            let k = newDiag / diag;
            k = Math.max(0.05, Math.min(25, k));
            img.x = cx + (selPointer.x0 - cx) * k;
            img.y = cy + (selPointer.y0 - cy) * k;
            img.w = selPointer.w0 * k;
            img.h = selPointer.h0 * k;
            renderAll();
        }
        drawSelectionOverlay();
    }
    function boxSelectEnd(e) {
        if (!selPointer || e.pointerId !== selPointer.id) return;
        try { container.releasePointerCapture(e.pointerId); } catch (_) { }
        const sp = selPointer;
        selPointer = null;
        state.selDrag = null;
        container.classList.remove('cursor-grabbing-pan');
        if (sp.mode === 'select') {
            const r = sp.rect;
            const sel = [];
            for (const s of state.strokes) {
                const b = computeStrokeBounds(s);
                if (b && b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y) {
                    sel.push(s);
                }
            }
            state.selection = sel;
        }
        drawSelectionOverlay();
    }
    container.addEventListener('pointerdown', boxSelectDown);
    container.addEventListener('pointermove', boxSelectMove);
    container.addEventListener('pointerup', boxSelectEnd);
    container.addEventListener('pointercancel', boxSelectEnd);

    if (typeof syncVideoLayout === 'function') syncVideoLayout();
    if (typeof syncFunctionLayerToolState === 'function') syncFunctionLayerToolState();

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

