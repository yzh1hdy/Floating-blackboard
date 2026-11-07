function createMegaEraserPreview() {
    const previewCanvas = document.getElementById('mega-eraser-preview');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    previewCanvas.width = rect.width * dpr;
    previewCanvas.height = rect.height * dpr;
    previewCanvas.style.width = rect.width + 'px';
    previewCanvas.style.height = rect.height + 'px';

    state.megaEraserPreviewCtx = previewCanvas.getContext('2d');
    state.megaEraserPreviewCtx.scale(dpr, dpr);
    state.megaEraserPreviewCanvas = previewCanvas;
}

function drawMegaEraserPreview(x, y, radius) {
    if (!state.megaEraserPreviewCtx) return;

    if (radius === undefined) {
        radius = effEraserRadius();
    }

    const ctx = state.megaEraserPreviewCtx;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, state.megaEraserPreviewCanvas.width, state.megaEraserPreviewCanvas.height);
    ctx.restore();

    ctx.save();
    if (state.doublePageMode) ctx.translate(doublePageOffsetX(state.activeDoublePage), 0);

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 192, 203, 0.4)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffc0cb';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.restore();
}

function clearMegaEraserPreview() {
    if (!state.megaEraserPreviewCtx) return;
    state.megaEraserPreviewCtx.save();
    state.megaEraserPreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.megaEraserPreviewCtx.clearRect(0, 0, state.megaEraserPreviewCanvas.width, state.megaEraserPreviewCanvas.height);
    state.megaEraserPreviewCtx.restore();
}

// 当前视频视图缩放倍率；普通模式（视频关闭）为 1
function viewScale() {
    return (state.videoView && state.videoView.scale) || 1;
}

// 橡皮擦半径：state.eraserRadius/megaEraserRadius 视为“屏幕像素”尺寸，
// 换算到画布逻辑坐标时除以当前缩放，保证放大/缩小视频时橡皮在屏幕上大小恒定
function effEraserRadius() {
    const r = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
    return r / viewScale();
}

function createCanvas() {
    const canvas = document.createElement('canvas');
    canvas.id = 'main-canvas';

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    canvas.style.backgroundColor = 'transparent';

    const ctx = canvas.getContext('2d', {
        alpha: true
    });

    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = penConfig.currentSize / viewScale();
    ctx.strokeStyle = penConfig.currentColor;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', handleMouseMove);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseout', stopDrawing);

    canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
    canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    container.appendChild(canvas);

    state.canvas = canvas;
    state.ctx = ctx;
    state.dpr = dpr;
}

// 笔迹增量绘制：把一批新输入点画进主画布并追加到笔画点数组
function drawPenIncrement(pointsArr, pts, fromX, fromY, pageIndex) {
    state.ctx.save();
    if (state.doublePageMode) state.ctx.translate(doublePageOffsetX(pageIndex), 0);
    state.ctx.globalCompositeOperation = 'source-over';
    state.ctx.lineWidth = penConfig.currentSize / viewScale();
    state.ctx.strokeStyle = penConfig.currentColor;
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';

    state.ctx.beginPath();
    state.ctx.moveTo(fromX, fromY);

    for (let i = 0; i < pts.length; i++) {
        const point = pts[i];
        pointsArr.push(point);
        // 二次贝塞尔仅作实时预览，松手后由 renderAll 重放矢量
        if (i > 0) {
            const prev = pts[i - 1];
            const midX = (prev.x + point.x) / 2;
            const midY = (prev.y + point.y) / 2;
            state.ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
        }
    }

    const lp = pts[pts.length - 1];
    state.ctx.lineTo(lp.x, lp.y);
    state.ctx.stroke();
    state.ctx.restore();
}

// 橡皮擦拖动预览：只做光栅化擦除视觉预览 + 记录擦除路径（默认记录到全局 state.erasePath，
// 多点触控时各手指传入各自独立的 erasePath），
// 不切割矢量笔画、不修改 state.strokes、不调用 renderAll（切割统一在抬起 commitErase 时执行）
function processErasePreview(pts, erasePath) {
    if (!pts || pts.length === 0) return;
    const radius = effEraserRadius();
    if (!erasePath) {
        if (!state.erasePath) state.erasePath = [];
        erasePath = state.erasePath;
    }

    const last = erasePath.length ? erasePath[erasePath.length - 1] : null;
    let input = pts;
    if (last) {
        input = pts.slice();
        if (Math.abs(last.x - input[0].x) > 0.01 || Math.abs(last.y - input[0].y) > 0.01) {
            input.unshift({ x: last.x, y: last.y });
        }
    }

    appendErasePathPoints(input, radius, erasePath);
    // 光栅化预览：直接在主位图 destination-out，不动矢量 strokes
    erasePoints(input, radius);

    if (state.isMegaEraser) {
        const lp = pts[pts.length - 1];
        drawMegaEraserPreview(lp.x, lp.y, radius);
    }
}

function handleMouseMove(e) {
    if (!state.isDrawing) return;
    const { x, y } = getCoordinates(e);

    if (state.shapeMode && state.shapeStartPoint) {
        drawShapePreview(state.shapeStartPoint.x, state.shapeStartPoint.y, x, y);
        return;
    }

    state.pendingPoints.push({x, y});
}

function drawFrame() {
    // 1. 鼠标输入队列（touchmove/mousemove 只存坐标，重活在帧循环批量执行）
    if (state.isDrawing && state.pendingPoints.length > 0) {
        const pts = state.pendingPoints.splice(0);

        if (state.tool === 'pen' && !state.isMegaEraser && state.currentStroke) {
            drawPenIncrement(state.currentStroke.points, pts, state.lastX, state.lastY,
                state.currentStroke.pg != null ? state.currentStroke.pg : state.activeDoublePage);
            const lp = pts[pts.length - 1];
            state.lastX = lp.x;
            state.lastY = lp.y;
        } else if (state.tool === 'eraser' || state.isMegaEraser) {
            processErasePreview(pts);
        }
    }

    // 2. 各触摸输入队列：多点触控时每根手指各自成线/独立擦除路径，互不干扰
    for (const ts of state.activeTouches.values()) {
        if (!ts.isDrawing || ts.pendingPoints.length === 0) continue;
        const pts = ts.pendingPoints.splice(0);

        if (state.isMegaEraser) {
            processErasePreview(pts, ts.erasePath);
        } else if (state.tool === 'pen') {
            drawPenIncrement(ts.points, pts, ts.lastX, ts.lastY, ts.pg != null ? ts.pg : state.activeDoublePage);
            const lp = pts[pts.length - 1];
            ts.lastX = lp.x;
            ts.lastY = lp.y;
        } else if (state.tool === 'eraser') {
            processErasePreview(pts, ts.erasePath);
        }
    }

    // 空闲即停：鼠标未绘制且没有任何手指在绘制才终止 rAF，避免一根手指抬起导致其余线条中断
    if (!state.isDrawing) {
        let anyTouchDrawing = false;
        for (const ts of state.activeTouches.values()) {
            if (ts.isDrawing) {
                anyTouchDrawing = true;
                break;
            }
        }
        if (!anyTouchDrawing) {
            state.isDrawingFrame = false;
            return;
        }
    }
    requestAnimationFrame(drawFrame);
}

function drawStroke(s) {
    const ctx = state.ctx;
    ctx.save();
    if (state.doublePageMode && s.pg === 1) ctx.translate(doublePageOffsetX(1), 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = s.color;
    // 笔迹粗细按屏幕固定：宽度视为屏幕像素，渲染时除以当前缩放（逻辑宽度 = 屏幕宽度 / scale）
    ctx.lineWidth = s.width / viewScale();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.tool === 'circle') {
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.save();
        ctx.lineWidth = Math.max(1.5, s.width * 0.5) / viewScale();
        const markSize = Math.max(8, s.width * 3) / viewScale();
        ctx.beginPath();
        ctx.moveTo(s.cx - markSize, s.cy);
        ctx.lineTo(s.cx + markSize, s.cy);
        ctx.moveTo(s.cx, s.cy - markSize);
        ctx.lineTo(s.cx, s.cy + markSize);
        ctx.stroke();
        ctx.restore();
    } else if (s.tool === 'line') {
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
    } else if (s.tool === 'dashed') {
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(s.x1, s.y1);
        ctx.lineTo(s.x2, s.y2);
        ctx.stroke();
        ctx.setLineDash([]);
    } else if (s.tool === 'coordinateSystem') {
        const cx = s.x + s.size / 2, cy = s.y + s.size / 2;
        ctx.beginPath(); ctx.moveTo(s.x, cy); ctx.lineTo(s.x + s.size, cy); ctx.moveTo(cx, s.y + s.size); ctx.lineTo(cx, s.y); ctx.stroke();
        drawArrow(ctx, s.x, cy, s.x + s.size, cy, viewScale()); drawArrow(ctx, cx, s.y + s.size, cx, s.y, viewScale());
    } else if (s.tool === 'nonNegativeQuadrant') {
        ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + s.widthPx, s.y); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x, s.y - s.heightPx); ctx.stroke();
        drawArrow(ctx, s.x, s.y, s.x + s.widthPx, s.y, viewScale()); drawArrow(ctx, s.x, s.y, s.x, s.y - s.heightPx, viewScale());
    } else if (s.tool === 'image') {
        if (!s._img) {
            const im = new Image();
            im.src = s.dataUrl;
            s._img = im;
        }
        if (s._img.complete && s._img.naturalWidth > 0) {
            ctx.drawImage(s._img, s.x, s.y, s.w, s.h);
        }
    } else {
        drawSmoothPath(s.points);
    }

    ctx.restore();
}

function renderAll() {
    if (!state.ctx || !state.canvas) return;
    // 视口可能平移过：先切单位变换清空整块位图，再恢复视口变换重放
    state.ctx.save();
    state.ctx.setTransform(1, 0, 0, 1, 0, 0);
    state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
    state.ctx.restore();

    for (const s of state.strokes) {
        if (state.erasingNow && state.erasingNow.has(s)) {
            const frags = state.eraseFrags && state.eraseFrags.get(s);
            if (frags) for (const f of frags) drawStroke(f);
        } else {
            drawStroke(s);
        }
    }

    rebuildSnapFromStrokes();
    updateWatermark();
}

// 重放其他仍在绘制中的手指的实时预览，避免某指提交 renderAll 时抹掉其余手指的笔迹/擦除光栅
function replayActiveTouchPreviews() {
    for (const ts of state.activeTouches.values()) {
        if (!ts.isDrawing) continue;
        const radius = effEraserRadius();
        if (state.tool === 'pen' && !state.isMegaEraser && ts.points && ts.points.length > 1) {
            drawStroke({
                tool: 'pen',
                points: ts.points,
                color: penConfig.currentColor,
                width: penConfig.currentSize,
                pg: ts.pg
            });
        } else if ((state.tool === 'eraser' || state.isMegaEraser) && ts.erasePath && ts.erasePath.length) {
            erasePoints(ts.erasePath, radius);
            if (state.isMegaEraser) {
                const lp = ts.erasePath[ts.erasePath.length - 1];
                drawMegaEraserPreview(lp.x, lp.y, radius);
            }
        }
    }
}

// 提交场景专用渲染：重放全部已提交笔迹后，补回仍活动手指的实时预览
function renderAllPreservingTouches() {
    renderAll();
    replayActiveTouchPreviews();
}

function updateWatermark() {
    const wm = document.getElementById('watermark');
    if (!wm) return;
    const show = !state.doublePageMode && !state.transparentMode && !state.videoBackgroundEnabled &&
                 (!state.normalScrollX || state.normalScrollX === 0) &&
                 (!state.normalScrollY || state.normalScrollY === 0) &&
                 (!state.strokes || state.strokes.length === 0);
    wm.classList.toggle('show', show);
}

function rebuildSnapFromStrokes() {
    const circles = [];
    const lines = [];
    for (const s of state.strokes) {
        if (state.erasingNow && state.erasingNow.has(s)) continue;
        if (s.tool === 'circle') {
            circles.push({ x: s.cx, y: s.cy, radius: s.r });
        } else if (s.tool === 'line' || s.tool === 'dashed') {
            lines.push({ x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2 });
        }
    }
    state.circles = circles;
    state.lines = lines;
}

// 点 q 到线段 AB 的最短距离
function distPointToSegment(q, A, B) {
    const dx = B.x - A.x, dy = B.y - A.y;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) {
        const ex = q.x - A.x, ey = q.y - A.y;
        return Math.sqrt(ex * ex + ey * ey);
    }
    let t = ((q.x - A.x) * dx + (q.y - A.y) * dy) / L2;
    t = Math.max(0, Math.min(1, t));
    const cx = A.x + dx * t, cy = A.y + dy * t;
    const ex = q.x - cx, ey = q.y - cy;
    return Math.sqrt(ex * ex + ey * ey);
}

function strokeIntersectsPath(stroke, path, radius) {
    if (!path || path.length === 0) return false;
    const reach = radius + (stroke.width || 1) / viewScale() / 2;

    if (stroke.tool === 'circle') {
        const steps = 28;
        for (let i = 0; i < steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const p = { x: stroke.cx + Math.cos(a) * stroke.r, y: stroke.cy + Math.sin(a) * stroke.r };
            for (let j = 0; j < path.length; j++) {
                const dx = p.x - path[j].x, dy = p.y - path[j].y;
                if (dx * dx + dy * dy <= reach * reach) return true;
            }
        }
        return false;
    }

    if (stroke.tool === 'line' || stroke.tool === 'dashed') {
        const A = { x: stroke.x1, y: stroke.y1 }, B = { x: stroke.x2, y: stroke.y2 };
        for (let j = 0; j < path.length; j++) {
            if (distPointToSegment(path[j], A, B) <= reach) return true;
        }
        return false;
    }

    // 自由笔：把点间连线当线段判断；端点兜底
    const pts = stroke.points;
    for (let i = 0; i < pts.length - 1; i++) {
        for (let j = 0; j < path.length; j++) {
            if (distPointToSegment(path[j], pts[i], pts[i + 1]) <= reach) return true;
        }
    }
    for (let i = 0; i < pts.length; i++) {
        for (let j = 0; j < path.length; j++) {
            const dx = pts[i].x - path[j].x, dy = pts[i].y - path[j].y;
            if (dx * dx + dy * dy <= reach * reach) return true;
        }
    }
    return false;
}

// 对相邻采样点插值加密，保证快速拖动时橡皮覆盖为连续条带，而非离散圆心点
function appendErasePathPoints(points, radius, target) {
    if (!points || points.length === 0) return;
    if (!target) {
        if (!state.erasePath) state.erasePath = [];
        target = state.erasePath;
    }
    const step = Math.max(2, (radius || effEraserRadius()) * 0.4);
    for (const p of points) {
        const last = target[target.length - 1];
        if (!last) {
            target.push({ x: p.x, y: p.y });
            continue;
        }
        const dx = p.x - last.x, dy = p.y - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= step) {
            target.push({ x: p.x, y: p.y });
        } else {
            const n = Math.ceil(dist / step);
            for (let i = 1; i <= n; i++) {
                target.push({ x: last.x + dx * i / n, y: last.y + dy * i / n });
            }
        }
    }
}

function applyEraseHits(radius) {
    if (!state.erasingNow || !state.erasePath) return;
    for (const s of state.strokes) {
        if (strokeIntersectsPath(s, state.erasePath, radius)) {
            state.erasingNow.add(s);
        }
    }
    // 实时重算命中笔画的存活片段：擦的时候只缺被擦段，而非整条消失
    state.eraseFrags = new Map();
    for (const s of state.erasingNow) {
        state.eraseFrags.set(s, splitStrokeByEraser(s, state.erasePath, radius));
    }
    renderAll();
}

// 把一条笔画按橡皮路径切成若干段，返回未被擦到的碎片；整段擦净则返回空数组
function splitStrokeByEraser(stroke, erasePath, radius) {
    if (!erasePath || erasePath.length === 0) return [stroke];
    const reach = radius + (stroke.width || 1) / viewScale() / 2;

    if (stroke.tool === 'line' || stroke.tool === 'dashed') {
        return splitLineStroke(stroke, erasePath, reach);
    }
    if (stroke.tool === 'circle') {
        return splitCircleStroke(stroke, erasePath, reach);
    }

    const pts = stroke.points;
    if (!pts || pts.length === 0) return [];
    const fragPoints = splitPolylineByEraser(pts, erasePath, reach);
    return fragPoints.map(f => ({ tool: 'pen', points: f, color: stroke.color, width: stroke.width, pg: stroke.pg }));
}

// 对每段 A->B 计算橡皮圆盘覆盖的参数区间，合并后保留未覆盖部分，相邻存活段自动接起
function splitPolylineByEraser(pts, erasePath, reach) {
    const reach2 = reach * reach;
    const aliveEdges = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const A = pts[i], B = pts[i + 1];
        const dx = B.x - A.x, dy = B.y - A.y;
        const L2 = dx * dx + dy * dy;
        if (L2 === 0) continue;
        const L = Math.sqrt(L2);

        const intervals = [];
        for (let j = 0; j < erasePath.length; j++) {
            const q = erasePath[j];
            let t = ((q.x - A.x) * dx + (q.y - A.y) * dy) / L2;
            // 投影超出线段时钳制到端点：圆盘仍可能覆盖端点附近
            t = Math.max(0, Math.min(1, t));
            const cx = A.x + dx * t, cy = A.y + dy * t;
            const pdx = q.x - cx, pdy = q.y - cy;
            const d2 = pdx * pdx + pdy * pdy;
            if (d2 <= reach2) {
                const half = Math.sqrt(Math.max(0, reach2 - d2)) / L;
                intervals.push([Math.max(0, t - half), Math.min(1, t + half)]);
            }
        }
        intervals.sort((a, b) => a[0] - b[0]);
        const merged = [];
        for (const iv of intervals) {
            if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
                merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
            } else {
                merged.push(iv.slice());
            }
        }
        let cursor = 0;
        const pushEdge = (t0, t1) => {
            aliveEdges.push({
                a: { x: A.x + dx * t0, y: A.y + dy * t0 },
                b: { x: A.x + dx * t1, y: A.y + dy * t1 }
            });
        };
        for (const iv of merged) {
            if (iv[0] > cursor) pushEdge(cursor, iv[0]);
            cursor = Math.max(cursor, iv[1]);
        }
        if (cursor < 1) pushEdge(cursor, 1);
    }

    const frags = [];
    let cur = null;
    for (const e of aliveEdges) {
        if (!cur) {
            cur = [e.a, e.b];
        } else {
            const last = cur[cur.length - 1];
            if (Math.abs(last.x - e.a.x) < 0.01 && Math.abs(last.y - e.a.y) < 0.01) {
                cur.push(e.b);
            } else {
                if (cur.length >= 2) frags.push(cur);
                cur = [e.a, e.b];
            }
        }
    }
    if (cur && cur.length >= 2) frags.push(cur);
    return frags;
}

function splitLineStroke(stroke, erasePath, reach) {
    const x1 = stroke.x1, y1 = stroke.y1, x2 = stroke.x2, y2 = stroke.y2;
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy;
    if (L2 === 0) return [stroke];
    const L = Math.sqrt(L2);

    const intervals = [];
    for (let j = 0; j < erasePath.length; j++) {
        const q = erasePath[j];
        let t = ((q.x - x1) * dx + (q.y - y1) * dy) / L2;
        t = Math.max(0, Math.min(1, t));
        const projX = x1 + dx * t, projY = y1 + dy * t;
        const px = q.x - projX, py = q.y - projY;
        const d2 = px * px + py * py;
        const reach2 = reach * reach;
        if (d2 <= reach2) {
            const half = Math.sqrt(Math.max(0, reach2 - d2)) / L;
            intervals.push([Math.max(0, t - half), Math.min(1, t + half)]);
        }
    }
    intervals.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const iv of intervals) {
        if (merged.length && iv[0] <= merged[merged.length - 1][1]) {
            merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
        } else {
            merged.push(iv.slice());
        }
    }
    const frags = [];
    const seg = (a, b) => ({
        tool: stroke.tool,
        x1: x1 + dx * a, y1: y1 + dy * a,
        x2: x1 + dx * b, y2: y1 + dy * b,
        color: stroke.color, width: stroke.width, pg: stroke.pg
    });
    let cursor = 0;
    for (const iv of merged) {
        if (iv[0] > cursor) frags.push(seg(cursor, iv[0]));
        cursor = Math.max(cursor, iv[1]);
    }
    if (cursor < 1) frags.push(seg(cursor, 1));
    return frags;
}

// 圆：采样圆周，剔除被擦点，剩余连续弧段以多段线保留
function splitCircleStroke(stroke, erasePath, reach) {
    const N = 120;
    const pts = [];
    for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        pts.push({ x: stroke.cx + Math.cos(a) * stroke.r, y: stroke.cy + Math.sin(a) * stroke.r });
    }
    const reach2 = reach * reach;
    const erased = new Array(N).fill(false);
    for (let i = 0; i < N; i++) {
        const p = pts[i];
        for (let j = 0; j < erasePath.length; j++) {
            const q = erasePath[j];
            const dx = p.x - q.x, dy = p.y - q.y;
            if (dx * dx + dy * dy <= reach2) { erased[i] = true; break; }
        }
    }
    const frags = [];
    let run = [];
    const flush = () => {
        if (run.length >= 2) frags.push({ tool: 'pen', points: run, color: stroke.color, width: stroke.width, pg: stroke.pg });
        run = [];
    };
    for (let i = 0; i < N; i++) {
        if (!erased[i]) run.push(pts[i]);
        else flush();
    }
    flush();
    // 圆是闭合的：首尾都未擦到时两段在圆周上相邻，需合并
    if (frags.length >= 2 && !erased[0] && !erased[N - 1]) {
        frags[0].points = frags[frags.length - 1].points.concat(frags[0].points);
        frags.pop();
    }
    return frags;
}

// 按指定擦除路径执行切割与撤销记录（多点触控时每根手指独立路径、独立提交；鼠标擦除走全局 state.erasePath）
function commitEraseForPath(erasePath) {
    if (!erasePath || erasePath.length === 0) {
        state.erasingNow = new Set();
        state.eraseFrags = null;
        renderAllPreservingTouches();
        return;
    }
    const radius = effEraserRadius();
    // 抬起时一次性计算命中的笔画并切割（拖动阶段只做光栅预览，不做切割）
    state.erasingNow = new Set();
    for (const s of state.strokes) {
        if (strokeIntersectsPath(s, erasePath, radius)) {
            state.erasingNow.add(s);
        }
    }
    if (state.erasingNow.size > 0) {
        // 记录命中笔画原始位置与碎片，供撤销还原
        const entries = [];
        state.strokes.forEach((s, idx) => {
            if (state.erasingNow.has(s)) {
                entries.push({ stroke: s, frags: splitStrokeByEraser(s, erasePath, radius), origIndex: idx });
            }
        });
        const newStrokes = [];
        state.strokes.forEach((s) => {
            if (state.erasingNow.has(s)) {
                const e = entries.find(en => en.stroke === s);
                for (const f of e.frags) newStrokes.push(f);
            } else {
                newStrokes.push(s);
            }
        });
        state.strokes = newStrokes;
        pushUndo({ type: 'erase', entries: entries });
    }
    state.erasingNow = new Set();
    state.eraseFrags = null;
    renderAllPreservingTouches();
}

function commitErase() {
    const path = state.erasePath;
    state.erasePath = null;
    commitEraseForPath(path);
}

function erasePoints(points, eraserRadius) {
    if (!state.ctx || !points || points.length === 0) return;

    state.ctx.save();
    state.ctx.globalCompositeOperation = 'destination-out';
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    state.ctx.lineWidth = eraserRadius * 2;

    if (points.length === 1) {
        state.ctx.beginPath();
        state.ctx.arc(points[0].x, points[0].y, eraserRadius, 0, Math.PI * 2);
        state.ctx.fill();
    } else {
        state.ctx.beginPath();
        state.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            state.ctx.lineTo(points[i].x, points[i].y);
        }

        state.ctx.stroke();
    }

    state.ctx.restore();
}

// 屏幕坐标 -> 逻辑坐标：视图变换烤进 canvas 上下文，需减去平移再除以缩放
function clientToLogical(cx, cy, pgOverride) {
    const r = state.videoRect || { x: 0, y: 0 };
    const v = state.videoView || { scale: 1, tx: 0, ty: 0 };
    const s = v.scale || 1;
    // 逻辑坐标原点始终对齐视频可见矩形左上角；普通模式平移画布后逻辑坐标叠加偏移
    const scrollX = (isNormalMode() && !state.doublePageMode) ? (state.normalScrollX || 0) : 0;
    const scrollY = isNormalMode() ? (state.normalScrollY || 0) : 0;
    let x = (cx - (r.x || 0) - v.tx) / s + scrollX;
    // 双页书写：减去目标页的显示平移，得到该页的“页面局部坐标”；
    // 多点触控时每根手指按落点归属自己的页（pgOverride），互不串页；
    // 绘制中离开本页跨到另一页时直接截断到本页边界，避免笔迹越页
    if (state.doublePageMode) {
        const pg = (pgOverride !== undefined && pgOverride !== null) ? pgOverride : state.activeDoublePage;
        x -= doublePageOffsetX(pg);
        const half = window.innerWidth / 2;
        x = Math.max(0, Math.min(half, x));
    }
    return {
        x: x,
        y: (cy - (r.y || 0) - v.ty) / s + scrollY
    };
}

function getCoordinates(e) {
    return clientToLogical(e.clientX, e.clientY);
}

function handleTouchMove(e) {
    e.preventDefault();
    if (!state.canvas) return;

    // 双指平移：多指书写关闭时，双指拖动整体移动画布，按两指中点位移 1:1 跟随手指
    if (state.touchPan) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            const touch = e.changedTouches[i];
            const prev = state.touchPan.fingers.get(touch.identifier);
            if (prev) {
                prev.x = touch.clientX;
                prev.y = touch.clientY;
            }
        }
        const arr = Array.from(state.touchPan.fingers.values());
        if (arr.length >= 2) {
            let mx = 0, my = 0;
            for (const p of arr) { mx += p.x; my += p.y; }
            mx /= arr.length;
            my /= arr.length;
            const dx = mx - state.touchPan.lastMidX;
            const dy = my - state.touchPan.lastMidY;
            state.touchPan.lastMidX = mx;
            state.touchPan.lastMidY = my;
            setNormalScroll((state.normalScrollX || 0) - dx, (state.normalScrollY || 0) - dy);
        }
        return;
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const touchId = touch.identifier;
        const touchState = state.activeTouches.get(touchId);

        // 多点触控：所有手指都各自绘制，互不干扰
        if (!touchState || !touchState.isDrawing) continue;

        const p = clientToLogical(touch.clientX, touch.clientY, touchState.pg);
        const x = p.x;
        const y = p.y;

        // 形状模式：轻量预览，保持即时反馈
        if (touchState.isShapeMode && state.shapeMode && state.shapeStartPoint) {
            drawShapePreview(state.shapeStartPoint.x, state.shapeStartPoint.y, x, y, touchState.pg);
            touchState.lastX = x;
            touchState.lastY = y;
            continue;
        }

        // 只做坐标存储，重活（贝塞尔/擦除）全部交由 drawFrame 帧循环批量执行
        touchState.pendingPoints.push({ x, y });
    }
}


function setTool(toolName) {
    if (state.shapeMode) {
        state.shapeMode = null;
        state.shapeStartPoint = null;
        if (state.shapePreviewCtx) {
            const rect = container.getBoundingClientRect();
            state.shapePreviewCtx.clearRect(0, 0, rect.width, rect.height);
        }
    }

    if (state.tool === 'pen') {
        icons.pen.img.src = icons.pen.released;
        closePenMenu(false);
    }
    closeMoreMenu(false);
    closeVideoMenu(false);
    if (state.tool === 'eraser' && typeof closeEraserMenu === 'function') {
        closeEraserMenu(false);
    }
    if (state.tool === 'eraser') icons.eraser.img.src = icons.eraser.released;
    if (state.tool === 'mouse' && icons.mouse) icons.mouse.img.src = icons.mouse.released;

    if (toolName === 'eraser' && state.tool !== 'eraser') {
        state.preEraserTool = state.tool;
    }

    state.tool = toolName;
    updateToolIcons();

    // PPT 批注态收起工具栏期间由 collapseToolbar 强制开启穿透，工具切换不得改动穿透开关
    var collapsedForced = typeof state !== 'undefined' && !!state.collapsedForcedPassthrough;
    if (!collapsedForced) {
        if (toolName !== 'mouse' && typeof disableMousePassthrough === 'function') {
            disableMousePassthrough();
        }
        if (toolName === 'mouse' && state.transparentMode && typeof enableMousePassthrough === 'function') {
            enableMousePassthrough();
        }
    }

    if (toolName !== 'eraser' && typeof closeEraserMenu === 'function' && state.eraserMenuOpen) {
        closeEraserMenu();
    }

    // 离开鼠标工具场景（非鼠标工具/非普通模式/双页书写）时清空选区
    if (!(toolName === 'mouse' && isNormalMode() && !state.doublePageMode) && typeof clearSelection === 'function') {
        clearSelection();
    }

    container.className = toolName === 'pen' ?
        'cursor-pen w-full h-full fixed inset-0' :
        (toolName === 'eraser' ? 'cursor-eraser-active w-full h-full fixed inset-0' :
        (toolName === 'mouse' && isNormalMode() && !state.doublePageMode && state.boxSelectEnabled ? 'cursor-select w-full h-full fixed inset-0' :
        (isNormalMode() ? 'cursor-grab-pan w-full h-full fixed inset-0' :
        'cursor-default w-full h-full fixed inset-0')));

    // 函数绘图器批注模式：鼠标工具时画布穿透，直接操作网页
    if (typeof updateDesmosOverlayPointer === 'function') {
        updateDesmosOverlayPointer();
    }

    // 工具切换时同步函数活图层级：鼠标工具抬升至画布之上，其余工具沉到画布之下便于书写
    if (typeof syncFunctionLayerToolState === 'function') {
        syncFunctionLayerToolState();
    }
}

function updateToolIcons() {
    if (icons.mouse && icons.mouse.img) icons.mouse.img.src = icons.mouse.released;
    if (icons.pen && icons.pen.img) icons.pen.img.src = icons.pen.released;
    if (icons.eraser && icons.eraser.img) icons.eraser.img.src = icons.eraser.released;
}

// 计算视频在视口内的可见矩形（object-fit: contain，不裁切，保持比例）
function computeVideoVisibleRect() {
    const vw = window.innerWidth, vh = window.innerHeight;
    let aspect = state.videoAspect || (16 / 9);
    const rot = ((state.videoRotation || 0) % 4 + 4) % 4;
    if (rot === 1 || rot === 3) aspect = 1 / aspect;
    let w, h;
    if (vw / vh > aspect) { h = vh; w = vh * aspect; }
    else { w = vw; h = w / aspect; }
    return { x: (vw - w) / 2, y: (vh - h) / 2, width: w, height: h };
}

function applyCanvasRect(rect, preserve) {
    if (!state.canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    if (!rect) rect = { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };

    const oldW = parseFloat(container.style.width) || rect.width || window.innerWidth;
    const oldH = parseFloat(container.style.height) || rect.height || window.innerHeight;

    let snap = null;
    if (preserve && oldW > 0 && oldH > 0) {
        snap = document.createElement('canvas');
        snap.width = oldW; snap.height = oldH;
        const sc = snap.getContext('2d');
        sc.drawImage(state.canvas, 0, 0, oldW, oldH);
    }

    container.style.left = rect.x + 'px';
    container.style.top = rect.y + 'px';
    container.style.width = rect.width + 'px';
    container.style.height = rect.height + 'px';

    state.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    state.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    state.canvas.style.width = rect.width + 'px';
    state.canvas.style.height = rect.height + 'px';
    state.canvas.style.backgroundColor = 'transparent';
    state.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (snap) state.ctx.drawImage(snap, 0, 0, rect.width, rect.height);
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    state.ctx.imageSmoothingEnabled = true;
    state.ctx.imageSmoothingQuality = 'high';

    if (state.selCanvas) {
        state.selCanvas.width = Math.max(1, Math.round(rect.width * dpr));
        state.selCanvas.height = Math.max(1, Math.round(rect.height * dpr));
        state.selCanvas.style.width = rect.width + 'px';
        state.selCanvas.style.height = rect.height + 'px';
        state.selCanvas.style.left = rect.x + 'px';
        state.selCanvas.style.top = rect.y + 'px';
        if (state.selCtx) state.selCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    if (state.megaEraserPreviewCanvas) {
        state.megaEraserPreviewCanvas.width = Math.max(1, Math.round(rect.width * dpr));
        state.megaEraserPreviewCanvas.height = Math.max(1, Math.round(rect.height * dpr));
        state.megaEraserPreviewCanvas.style.width = rect.width + 'px';
        state.megaEraserPreviewCanvas.style.height = rect.height + 'px';
        state.megaEraserPreviewCanvas.style.left = rect.x + 'px';
        state.megaEraserPreviewCanvas.style.top = rect.y + 'px';
        if (state.megaEraserPreviewCtx) {
            state.megaEraserPreviewCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
    }
    state.dpr = dpr;
}

// 画布始终占满整个屏幕：信箱模式黑边、放大溢出区域都能正常绘制
function getCanvasTargetRect() {
    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
}

function isNormalMode() {
    // PPT 播放时禁用普通模式的画布平移/框选等行为，只允许绘图
    if (state.pptActive) return false;
    return !state.videoBackgroundEnabled && !state.transparentMode;
}

function setNormalScroll(x, y) {
    if (state.doublePageMode) {
        // 双页书写：x 由左右半屏平移管理，保持 0，仅允许纵向平移
        state.normalScrollX = 0;
        state.normalScrollY = y;
    } else {
        state.normalScrollX = x;
        state.normalScrollY = y;
    }
    applyViewToContexts();
    renderAll();
    if (state.selection && state.selection.length) drawSelectionOverlay();
    if (typeof syncFunctionWidgets === 'function') syncFunctionWidgets();
}

function setNormalScrollY(y) {
    setNormalScroll(state.normalScrollX || 0, y);
}

function resetNormalScrollY() {
    if ((state.normalScrollY || 0) === 0 && (state.normalScrollX || 0) === 0) return;
    state.normalScrollY = 0;
    state.normalScrollX = 0;
    applyViewToContexts();
    if (state.selection && state.selection.length) drawSelectionOverlay();
    if (typeof syncFunctionWidgets === 'function') syncFunctionWidgets();
}

// 位图分辨率恒为 rect*dpr，缩放/平移由上下文变换完成，放大不膨胀位图，矢量笔迹保持清晰
function applyViewToContexts() {
    if (!state.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const v = state.videoView || { scale: 1, tx: 0, ty: 0 };
    const r = state.videoRect || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const s = v.scale || 1;
    const a = dpr * s;
    const scrollX = (isNormalMode() && !state.doublePageMode) ? (state.normalScrollX || 0) : 0;
    const scrollY = isNormalMode() ? (state.normalScrollY || 0) : 0;
    // 平移量需叠加视频可见矩形偏移，保证笔迹与视频画面严格对齐
    const e = dpr * (v.tx + (r.x || 0) - s * scrollX);
    const f = dpr * (v.ty + (r.y || 0) - s * scrollY);
    if (state.ctx) state.ctx.setTransform(a, 0, 0, a, e, f);
    // 笔迹粗细按屏幕固定：线宽随视图缩放保持恒定（逻辑线宽 = 屏幕线宽 / scale）
    if (state.ctx) state.ctx.lineWidth = penConfig.currentSize / s;
    if (state.selCtx) state.selCtx.setTransform(a, 0, 0, a, e, f);
    if (state.megaEraserPreviewCtx) state.megaEraserPreviewCtx.setTransform(a, 0, 0, a, e, f);
}

// 光栅视频只能靠 CSS 缩放对齐；矢量画布的缩放在上下文变换中完成
function applyViewTransform() {
    const t = 'translate(' + state.videoView.tx + 'px, ' + state.videoView.ty + 'px) scale(' + state.videoView.scale + ')';
    const o = '0 0';
    if (typeof videoWrap !== 'undefined' && videoWrap) {
        videoWrap.style.transformOrigin = o;
        videoWrap.style.transform = t;
    }
}

function resetVideoView() {
    state.videoView = { scale: 1, tx: 0, ty: 0 };
    applyViewTransform();
    if (typeof syncZoomResolution === 'function') syncZoomResolution();
}

// 位图分辨率固定为原生 rect*dpr，不随 scale 膨胀，避免放大后操作超大位图卡顿
function syncZoomResolution() {
    if (!state.canvas) return;
    const rect = getCanvasTargetRect();
    const dpr = window.devicePixelRatio || 1;

    const bw = Math.max(1, Math.round(rect.width * dpr));
    const bh = Math.max(1, Math.round(rect.height * dpr));
    if (state.canvas.width !== bw) state.canvas.width = bw;
    if (state.canvas.height !== bh) state.canvas.height = bh;

    applyViewToContexts();
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    state.ctx.lineWidth = penConfig.currentSize / viewScale();
    state.ctx.strokeStyle = penConfig.currentColor;
    state.ctx.imageSmoothingEnabled = true;
    state.ctx.imageSmoothingQuality = 'high';

    if (state.selCanvas && state.selCtx) {
        state.selCanvas.width = bw;
        state.selCanvas.height = bh;
        state.selCanvas.style.width = rect.width + 'px';
        state.selCanvas.style.height = rect.height + 'px';
        applyViewToContexts();
    }

    if (state.megaEraserPreviewCanvas && state.megaEraserPreviewCtx) {
        state.megaEraserPreviewCanvas.width = bw;
        state.megaEraserPreviewCanvas.height = bh;
        state.megaEraserPreviewCanvas.style.width = rect.width + 'px';
        state.megaEraserPreviewCanvas.style.height = rect.height + 'px';
        applyViewToContexts();
    }

    state.dpr = dpr;
    renderAll();
}

function syncVideoLayout() {
    state.videoRect = state.videoBackgroundEnabled
        ? computeVideoVisibleRect()
        : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    applyCanvasRect(getCanvasTargetRect(), false);
    if (state.videoBackgroundEnabled) {
        applyVideoRotation();
        resetVideoView();
    } else {
        state.videoView = { scale: 1, tx: 0, ty: 0 };
        container.style.transform = '';
        container.style.transformOrigin = '';
        if (state.selCanvas) {
            state.selCanvas.style.transform = '';
            state.selCanvas.style.transformOrigin = '';
        }
        if (state.megaEraserPreviewCanvas) {
            state.megaEraserPreviewCanvas.style.transform = '';
            state.megaEraserPreviewCanvas.style.transformOrigin = '';
        }
        if (typeof videoWrap !== 'undefined' && videoWrap) {
            videoWrap.style.transform = '';
            videoWrap.style.transformOrigin = '';
        }
        syncZoomResolution();
    }
}

// 围绕屏幕点 (sx,sy) 按 factor 缩放
function zoomAt(sx, sy, factor) {
    const v = state.videoView;
    const r = state.videoRect || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const ns = clampVideoZoom(v.scale * factor);
    const k = ns / v.scale;
    const lx = (sx - (r.x || 0) - v.tx) / v.scale;
    const ly = (sy - (r.y || 0) - v.ty) / v.scale;
    v.scale = ns;
    v.tx = sx - (r.x || 0) - ns * lx;
    v.ty = sy - (r.y || 0) - ns * ly;
    applyViewTransform();
}

function clampVideoZoom(v) {
    return Math.max(1, Math.min(5, v));
}

function handleResize() {
    if (!state.canvas) return;
    state.videoRect = state.videoBackgroundEnabled
        ? computeVideoVisibleRect()
        : { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    applyCanvasRect(getCanvasTargetRect(), false);
    applyViewTransform();
    syncZoomResolution();
    if (state.videoBackgroundEnabled && typeof applyVideoRotation === 'function') {
        applyVideoRotation();
    }
    if (typeof saveCurrentPage === 'function') saveCurrentPage();
}

function startDrawing(e) {
    // 鼠标工具下不落笔，避免误画
    if (state.tool !== 'pen' && state.tool !== 'eraser') return;
    if (state.doublePageMode) {
        state.activeDoublePage = (e.clientX >= window.innerWidth / 2) ? 1 : 0;
    }
    const { x, y } = getCoordinates(e);

    if (state.shapeMode) {
        state.shapeStartPoint = { x, y };
        state.isDrawing = true;
        return;
    }

    state.isDrawing = true;

    state.pendingPoints = [{x, y}];
    state.lastX = x;
    state.lastY = y;

    if (state.tool === 'pen' && !state.isMegaEraser) {
        state.currentStroke = {
            tool: 'pen',
            points: [{ x, y }],
            color: penConfig.currentColor,
            width: penConfig.currentSize
        };
        if (typeof attachDoublePagePg === 'function') attachDoublePagePg(state.currentStroke);
        state.ctx.save();
        if (state.doublePageMode) state.ctx.translate(doublePageOffsetX(state.activeDoublePage), 0);
        state.ctx.beginPath();
        state.ctx.moveTo(x, y);
        state.ctx.lineTo(x, y);
        state.ctx.stroke();
        state.ctx.restore();
    } else {
        // 橡皮擦落下：只初始化擦除路径，拖动阶段仅预览，抬起后由 commitErase 一次性切割
        state.erasingNow = new Set();
        state.eraseFrags = null;
        state.erasePath = [{ x, y }];
    }

    if (!state.isDrawingFrame) {
        state.isDrawingFrame = true;
        requestAnimationFrame(drawFrame);
    }
}

function drawSmoothPath(points) {
    if (points.length < 3) {
        state.ctx.beginPath();
        state.ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
            state.ctx.lineTo(points[i].x, points[i].y);
        }
        state.ctx.stroke();
        return;
    }

    state.ctx.beginPath();
    state.ctx.moveTo(points[0].x, points[0].y);

    // 以相邻点中点为控制点做二次贝塞尔平滑
    for (let i = 1; i < points.length - 2; i++) {
        const xc = (points[i].x + points[i + 1].x) / 2;
        const yc = (points[i].y + points[i + 1].y) / 2;
        state.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
    }

    state.ctx.quadraticCurveTo(
        points[points.length - 2].x,
        points[points.length - 2].y,
        points[points.length - 1].x,
        points[points.length - 1].y
    );
    state.ctx.stroke();
}

function stopDrawing(e) {
    if (!state.isDrawing) return;

    if (state.shapeMode && state.shapeStartPoint && e) {
        const { x, y } = getCoordinates(e);
        finishShapeDraw(x, y);
        state.isDrawing = false;
        return;
    }

    state.isDrawing = false;

    // 把尚未被帧循环消费的输入点刷入，避免松手瞬间丢失最后一段
    if (state.pendingPoints.length > 0) {
        if (state.tool === 'pen' && !state.isMegaEraser && state.currentStroke) {
            for (const p of state.pendingPoints) state.currentStroke.points.push(p);
        } else if (state.tool === 'eraser' || state.isMegaEraser) {
            if (!state.erasePath) state.erasePath = [];
            for (const p of state.pendingPoints) state.erasePath.push(p);
        }
        state.pendingPoints = [];
    }

    if (state.tool === 'pen' && !state.isMegaEraser && state.currentStroke) {
        const stroke = state.currentStroke;
        if (typeof attachDoublePagePg === 'function') attachDoublePagePg(stroke);
        state.strokes.push(stroke);
        pushUndo({ type: 'add', stroke: stroke });
        renderAllPreservingTouches();
    } else if (state.tool === 'eraser' || state.isMegaEraser) {
        commitErase();
    }

    state.pendingPoints = [];
    state.lastX = null;
    state.lastY = null;
    state.currentStroke = null;
    state.ctx.closePath();
    state.ctx.beginPath();
}

function handleTouchStart(e) {
    e.preventDefault();
    if (state.videoBackgroundEnabled && state.tool === 'mouse') return;
    if (isNormalMode() && state.tool === 'mouse') return;

    if (state.doublePageMode && e.touches.length > 0) {
        state.activeDoublePage = (e.touches[0].clientX >= window.innerWidth / 2) ? 1 : 0;
    }

    const isFirstFingerOverall = state.activeTouches.size === 0;

    if (isFirstFingerOverall) {
        closeAllMenus(false);
    }

    // 多指书写关闭：双指同时按下即进入拖动画布模式（相当于鼠标工具的移动画布，可任意方向平移）
    const panGesture = !state.multiFingerWrite && isNormalMode() && !state.doublePageMode &&
                       !state.shapeMode && (state.tool === 'pen' || state.tool === 'eraser') &&
                       e.touches.length >= 2;

    if (panGesture) {
        // 若第一根手指已开始落笔/擦除，取消该笔画，双指手势优先
        if (state.activeTouches.size > 0) {
            state.activeTouches.clear();
            state.isDrawing = false;
            state.erasingNow = new Set();
            state.eraseFrags = null;
            state.currentStroke = null;
            renderAll();
        }
        if (!state.touchPan) state.touchPan = { fingers: new Map(), lastMidX: 0, lastMidY: 0 };
        for (let i = 0; i < e.touches.length; i++) {
            if (state.touchPan.fingers.size >= 2) break;
            const t = e.touches[i];
            state.touchPan.fingers.set(t.identifier, { x: t.clientX, y: t.clientY });
        }
        let midX = 0, midY = 0;
        for (const p of state.touchPan.fingers.values()) { midX += p.x; midY += p.y; }
        const n = state.touchPan.fingers.size;
        state.touchPan.lastMidX = n ? midX / n : 0;
        state.touchPan.lastMidY = n ? midY / n : 0;
        return;
    }

    // 手掌/大面积接触识别（防误触）：把整掌/手臂按压识别为超大橡皮擦。
    // 触发判定做两层兜底，保证不同设备都能触发：
    //   1) 设备上报接触半径：任一个接触半径较大（≥20px，手掌/手臂）且总面积超限即触发；
    //   2) 设备不上报半径（radiusX/Y 恒为 0）：退化为按触点数量——≥2 个触点同时落下即视为整掌/手臂。
    // 普通指尖（各自画线）接触半径小（≤15px）；多指书写关闭时双指已交给平移手势，不参与手掌识别。
    // 注意：不能在“仅首根手指”时判定——真实触屏手掌/多指通常分多次 touchstart 落下，
    // 首指事件往往只有 1 个触点，后续手指落���时 isFirstFingerOverall 已为 false，
    // 导致超大橡皮擦无法触发。故在每次 touchstart 用“当前全部活动触点”判定。
    if (state.multiFingerWrite && (state.tool === 'pen' || state.tool === 'eraser') && !state.isMegaEraser) {
        let totalTouchArea = 0;
        let bigTouchCount = 0;
        let hasRadiusInfo = false;
        const touchCount = e.touches.length;
        for (let i = 0; i < touchCount; i++) {
            const t = e.touches[i];
            const rx = t.radiusX || 0;
            const ry = t.radiusY || 0;
            if (rx > 0 && ry > 0) {
                hasRadiusInfo = true;
                totalTouchArea += Math.PI * rx * ry;
                // 指尖接触半径通常 ≤15px，手掌/手臂并排可达 20px 以上
                if (rx >= 20 && ry >= 20) bigTouchCount++;
            } else {
                totalTouchArea += Math.PI * 10 * 10;
            }
        }
        const radiusTrigger = hasRadiusInfo && bigTouchCount >= 1 && totalTouchArea > state.megaEraserThreshold;
        const countTrigger = !hasRadiusInfo && touchCount >= 2;
        if (radiusTrigger || countTrigger) {
            // 若此前已有手指开始落笔/擦除，先取消这些笔画，避免与手掌擦除混叠成残留笔迹
            if (state.activeTouches.size > 0) {
                state.activeTouches.clear();
                state.isDrawing = false;
                state.erasingNow = new Set();
                state.eraseFrags = null;
                state.currentStroke = null;
                renderAll();
            }
            state.isMegaEraser = true;
            state.eraserRadius = state.megaEraserRadius;
            container.classList.add('mega-eraser-active');
            if (state.megaEraserPreviewCanvas) {
                state.megaEraserPreviewCanvas.classList.add('active');
            }
        }
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const touchId = touch.identifier;
        const pg = state.doublePageMode ? ((touch.clientX >= window.innerWidth / 2) ? 1 : 0) : null;
        const tp = clientToLogical(touch.clientX, touch.clientY, pg);
        const x = tp.x;
        const y = tp.y;

        // 多点触控：笔/橡皮工具下每根手指都能独立绘制（各自成线、独立擦除路径）；
        // 形状模式只需第一根手指参与，其余手指不抢形状起点
        const isFirstFinger = isFirstFingerOverall && i === 0;
        const canStartDrawing = state.tool === 'pen' || state.tool === 'eraser';
        const isDrawing = canStartDrawing && (!state.shapeMode || isFirstFinger);

        state.activeTouches.set(touchId, {
            lastX: x,
            lastY: y,
            isDrawing: isDrawing,
            points: [{x, y}],
            pendingPoints: [{x, y}],
            historyPushed: false,
            isShapeMode: isDrawing && !!state.shapeMode,
            erasePath: null,
            pg: pg
        });

        if (isDrawing) {
            state.isDrawing = true;
            if (state.shapeMode) {
                state.shapeStartPoint = { x, y };
            } else if (state.isMegaEraser) {
                // 超大橡皮擦：每根手指独立擦除路径，落下仅初始化，拖动仅预览，抬起后由 commitErase 一次性切割
                state.erasingNow = new Set();
                state.eraseFrags = null;
                const ep = [{ x, y }];
                state.activeTouches.get(touchId).erasePath = ep;
                drawMegaEraserPreview(x, y, effEraserRadius());
            } else if (state.tool === 'eraser') {
                state.erasingNow = new Set();
                state.eraseFrags = null;
                const ep = [{ x, y }];
                state.activeTouches.get(touchId).erasePath = ep;
            } else {
                state.ctx.save();
                if (state.doublePageMode) state.ctx.translate(doublePageOffsetX(pg != null ? pg : state.activeDoublePage), 0);
                state.ctx.beginPath();
                state.ctx.moveTo(x, y);
                state.ctx.lineTo(x, y);
                state.ctx.stroke();
                state.ctx.restore();
            }
            // 触摸起笔：非形状模式下启动 rAF 帧循环，批量消费 touchmove 存入的输入点
            if (!state.shapeMode && !state.isDrawingFrame) {
                state.isDrawingFrame = true;
                requestAnimationFrame(drawFrame);
            }
        }
    }
}



function handleTouchEnd(e) {
    e.preventDefault();
    const rect = state.canvas.getBoundingClientRect();

    // 双指平移结束：少于两指时退出平移手势
    if (state.touchPan) {
        for (let i = 0; i < e.changedTouches.length; i++) {
            state.touchPan.fingers.delete(e.changedTouches[i].identifier);
        }
        if (state.touchPan.fingers.size < 2) {
            state.touchPan = null;
        }
    }

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const touchId = touch.identifier;
        const touchState = state.activeTouches.get(touchId);

        if (!touchState) continue;

        if (touchState.isDrawing) {
            // 把尚未被帧循环消费的输入点刷入，避免松手瞬间丢失最后一段
            if (touchState.pendingPoints && touchState.pendingPoints.length) {
                if (state.tool === 'pen' && !state.isMegaEraser) {
                    for (const p of touchState.pendingPoints) touchState.points.push(p);
                } else if (state.tool === 'eraser' || state.isMegaEraser) {
                    if (!touchState.erasePath) touchState.erasePath = [];
                    for (const p of touchState.pendingPoints) touchState.erasePath.push(p);
                }
                touchState.pendingPoints = [];
            }

            if (touchState.isShapeMode && state.shapeMode && state.shapeStartPoint) {
                finishShapeDraw(touchState.lastX, touchState.lastY, touchState.pg);
            } else if (state.tool === 'pen' && !state.isMegaEraser) {
                const stroke = {
                    tool: 'pen',
                    points: touchState.points,
                    color: penConfig.currentColor,
                    width: penConfig.currentSize
                };
                if (typeof attachDoublePagePg === 'function') attachDoublePagePg(stroke, touchState.pg);
                state.strokes.push(stroke);
                pushUndo({ type: 'add', stroke: stroke });
                renderAllPreservingTouches();
            } else if (state.tool === 'eraser' || state.isMegaEraser) {
                commitEraseForPath(touchState.erasePath);
            }
        }

        state.activeTouches.delete(touchId);
    }

    // 全部手指抬起后才复位全局绘制状态；仍有手指在画时保持 true，避免帧循环提前停止
    if (e.touches.length === 0) {
        state.isDrawing = false;
        setTimeout(() => {
            clearMegaEraserPreview();
            if (state.megaEraserPreviewCanvas) {
                state.megaEraserPreviewCanvas.classList.remove('active');
            }
            if (state.isMegaEraser) {
                state.eraserRadius = state.normalEraserRadius;
                state.isMegaEraser = false;
                container.classList.remove('mega-eraser-active');
            }
        }, 50);
    }
}

function redrawPreviousContent() {
    state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);

    if (state.historyStep >= 0 && state.history.length > 0) {
        const previousCanvas = state.history[state.historyStep];
        state.ctx.drawImage(previousCanvas, 0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
    }
}

// ===== 鼠标框选：普通模式 + 鼠标工具 + 框选开关开启 =====
// 选区叠加画布（仅绘制选区框/包围盒/手柄，不参与主画布内容）
function createSelectionCanvas() {
    if (state.selCanvas) return;
    const c = document.createElement('canvas');
    c.id = 'selection-canvas';
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    c.width = Math.max(1, Math.round(rect.width * dpr));
    c.height = Math.max(1, Math.round(rect.height * dpr));
    c.style.width = rect.width + 'px';
    c.style.height = rect.height + 'px';
    c.style.position = 'absolute';
    c.style.top = '0';
    c.style.left = '0';
    c.style.pointerEvents = 'none';
    c.style.zIndex = '14';
    container.appendChild(c);
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    state.selCanvas = c;
    state.selCtx = ctx;
}

function clearSelection() {
    state.selection = [];
    if (state.selCtx) clearSelectionOverlay();
}

// 单条笔画的包围盒（逻辑坐标）
function computeStrokeBounds(s) {
    if (!s) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const acc = (x, y) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    };
    if (s.tool === 'circle') {
        acc(s.cx - s.r, s.cy - s.r);
        acc(s.cx + s.r, s.cy + s.r);
    } else if (s.tool === 'line' || s.tool === 'dashed') {
        acc(s.x1, s.y1);
        acc(s.x2, s.y2);
    } else if (s.tool === 'image') {
        acc(s.x, s.y);
        acc(s.x + s.w, s.y + s.h);
    } else if (s.points && s.points.length) {
        for (const p of s.points) acc(p.x, p.y);
    }
    if (minX === Infinity) return null;
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// 全部选中笔画的联合包围盒
function selectionBounds() {
    let b = null;
    for (const s of state.selection) {
        const sb = computeStrokeBounds(s);
        if (!sb) continue;
        if (!b) b = { x: sb.x, y: sb.y, w: sb.w, h: sb.h };
        else {
            const x1 = Math.min(b.x, sb.x), y1 = Math.min(b.y, sb.y);
            const x2 = Math.max(b.x + b.w, sb.x + sb.w), y2 = Math.max(b.y + b.h, sb.y + sb.h);
            b = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
        }
    }
    return b;
}

function clearSelectionOverlay() {
    if (!state.selCtx || !state.selCanvas) return;
    state.selCtx.save();
    state.selCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.selCtx.clearRect(0, 0, state.selCanvas.width, state.selCanvas.height);
    state.selCtx.restore();
}

function drawSelectionOverlay() {
    if (!state.selCtx || !state.selCanvas) return;
    clearSelectionOverlay();
    const ctx = state.selCtx;

    // 正在拖拽的框选矩形
    if (state.selDrag && state.selDrag.mode === 'select' && state.selDrag.rect) {
        const r = state.selDrag.rect;
        ctx.save();
        ctx.strokeStyle = 'rgba(96,165,250,0.9)';
        ctx.fillStyle = 'rgba(96,165,250,0.12)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // 已选中笔画的包围盒 + 四角缩放手柄
    if (state.selection && state.selection.length) {
        const b = selectionBounds();
        if (b) {
            const pad = 6;
            const bx = b.x - pad, by = b.y - pad, bw = b.w + pad * 2, bh = b.h + pad * 2;
            ctx.save();
            ctx.strokeStyle = 'rgba(96,165,250,0.9)';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(bx, by, bw, bh);
            ctx.setLineDash([]);
            const hs = 9;
            for (const [hx, hy] of [[bx, by], [bx + bw, by], [bx, by + bh], [bx + bw, by + bh]]) {
                ctx.fillStyle = '#60a5fa';
                ctx.fillRect(hx - hs / 2, hy - hs / 2, hs, hs);
                ctx.strokeStyle = 'rgba(255,255,255,0.9)';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(hx - hs / 2, hy - hs / 2, hs, hs);
            }
            ctx.restore();
        }
    }
}

// 命中的缩放手柄序号（0左上 1右上 2左下 3右下），未命中返回 -1
function hitSelectionHandle(p) {
    if (!state.selection || !state.selection.length) return -1;
    const b = selectionBounds();
    if (!b) return -1;
    const pad = 6;
    const corners = [
        [b.x - pad, b.y - pad],
        [b.x - pad + b.w + pad * 2, b.y - pad],
        [b.x - pad, b.y - pad + b.h + pad * 2],
        [b.x - pad + b.w + pad * 2, b.y - pad + b.h + pad * 2]
    ];
    const tol = 14;
    for (let i = 0; i < 4; i++) {
        if (Math.hypot(p.x - corners[i][0], p.y - corners[i][1]) <= tol) return i;
    }
    return -1;
}

// 点是否落在选中区域（含包围盒外沿留白）内
function isInsideSelection(p) {
    const b = selectionBounds();
    if (!b) return false;
    const pad = 6;
    return p.x >= b.x - pad && p.x <= b.x - pad + b.w + pad * 2 &&
           p.y >= b.y - pad && p.y <= b.y - pad + b.h + pad * 2;
}

// 深拷贝一条笔画（用于撤销/移动/缩放的原位基准）
function cloneStroke(s) {
    const c = {};
    for (const k in s) c[k] = s[k];
    if (s.points) c.points = s.points.map(p => ({ x: p.x, y: p.y }));
    return c;
}

function translateStrokeBy(s, dx, dy) {
    if (s.tool === 'circle') {
        s.cx += dx;
        s.cy += dy;
    } else if (s.tool === 'line' || s.tool === 'dashed') {
        s.x1 += dx; s.y1 += dy;
        s.x2 += dx; s.y2 += dy;
    } else if (s.tool === 'image') {
        s.x += dx;
        s.y += dy;
    } else if (s.points) {
        for (const p of s.points) { p.x += dx; p.y += dy; }
    }
}

function scaleStrokeAbout(s, cx, cy, sx, sy) {
    const map = (px, py) => ({ x: cx + (px - cx) * sx, y: cy + (py - cy) * sy });
    if (s.tool === 'circle') {
        const c = map(s.cx, s.cy);
        s.cx = c.x; s.cy = c.y;
        s.r *= Math.min(sx, sy);
    } else if (s.tool === 'line' || s.tool === 'dashed') {
        const a = map(s.x1, s.y1), b2 = map(s.x2, s.y2);
        s.x1 = a.x; s.y1 = a.y; s.x2 = b2.x; s.y2 = b2.y;
    } else if (s.tool === 'image') {
        const n = map(s.x, s.y);
        s.x = n.x; s.y = n.y;
        // 图像始终等比缩放，保持宽高比
        const k = Math.min(sx, sy);
        s.w *= k;
        s.h *= k;
    } else if (s.points) {
        for (let i = 0; i < s.points.length; i++) {
            const m = map(s.points[i].x, s.points[i].y);
            s.points[i].x = m.x;
            s.points[i].y = m.y;
        }
    }
}

// 原位还原一条被移动/缩放的笔画（撤销用）
function restoreStroke(s, o) {
    s.tool = o.tool;
    s.color = o.color;
    s.width = o.width;
    if (o.pg !== undefined) s.pg = o.pg;
    if (s.points) s.points.length = 0;
    if (o.tool === 'circle') {
        s.cx = o.cx; s.cy = o.cy; s.r = o.r;
    } else if (o.tool === 'line' || o.tool === 'dashed') {
        s.x1 = o.x1; s.y1 = o.y1; s.x2 = o.x2; s.y2 = o.y2;
    }
    if (o.points) {
        if (!s.points) s.points = [];
        for (const p of o.points) s.points.push({ x: p.x, y: p.y });
    }
}

// ===== 函数图像：插入、命中 =====
// 把本地 desmos 渲染出的透明函数图（dataURL）作为图像对象插入当前页
function insertFunctionImage(dataUrl, imgW, imgH) {
    if (!state.canvas || !dataUrl) return;
    const im = new Image();
    im.onload = function () {
        const centerX = window.innerWidth / 2 + (state.normalScrollX || 0);
        const centerY = window.innerHeight / 2 + (state.normalScrollY || 0);
        const nw = im.naturalWidth || imgW || 800;
        const nh = im.naturalHeight || imgH || 600;
        const ar = nw / nh;
        let ih = Math.round(window.innerHeight * 0.4);
        let iw = Math.round(ih * ar);
        const maxW = Math.round(window.innerWidth * 0.7);
        if (iw > maxW) { iw = maxW; ih = Math.round(iw / ar); }
        const img = {
            tool: 'image',
            dataUrl: dataUrl,
            x: Math.round(centerX - iw / 2),
            y: Math.round(centerY - ih / 2),
            w: iw,
            h: ih,
            _img: im
        };
        state.strokes.push(img);
        pushUndo({ type: 'add', stroke: img });
        renderAll();
        // 鼠标工具下自动选��，便于立即等比缩放
        if (state.tool === 'mouse' && isNormalMode() && !state.doublePageMode) {
            state.selection = [img];
            drawSelectionOverlay();
        }
    };
    im.src = dataUrl;
}

// ===== 函数图像：白板上的可交互活图（desmos widget，随画布滚动同步位置） =====
var functionWidgets = [];

// 函数活图层的层级/交互开关：
// 仅普通单页模式 + 鼠标工具时，临时把图层抬到画布之上并恢复点按（操作 desmos、关闭按钮）；
// 画笔/橡皮等非鼠标工具（或透明/视频/PPT/双页模式）下，图层保持在画布之下且不拦截指针，
// 保证笔迹直接绘制在函数图上方。
function syncFunctionLayerToolState() {
    const layer = document.getElementById('functionLayer');
    if (!layer) return;
    const interactive = !!(typeof isNormalMode === 'function' && isNormalMode()
        && !state.doublePageMode && state.tool === 'mouse');
    layer.classList.toggle('mouse-active', interactive);
}

// 逻辑坐标 -> 屏幕像素（普通模式，非双页）
function widgetLogicalToScreen(x, y) {
    const scrollX = (isNormalMode() && !state.doublePageMode) ? (state.normalScrollX || 0) : 0;
    const scrollY = isNormalMode() ? (state.normalScrollY || 0) : 0;
    return { x: x - scrollX, y: y - scrollY };
}

function syncFunctionWidgets() {
    const layer = document.getElementById('functionLayer');
    if (!layer) return;
    const active = isNormalMode() && !state.doublePageMode;
    layer.style.display = active ? 'block' : 'none';
    syncFunctionLayerToolState();
    if (!active) return;
    for (let i = 0; i < functionWidgets.length; i++) {
        const w = functionWidgets[i];
        const sp = widgetLogicalToScreen(w.img.x, w.img.y);
        w.el.style.left = Math.round(sp.x) + 'px';
        w.el.style.top = Math.round(sp.y) + 'px';
        w.el.style.width = Math.round(w.img.w) + 'px';
        w.el.style.height = Math.round(w.img.h) + 'px';
    }
}

// 在白板当前页插入一张可交互的 desmos 活图（表达式列表 -> 定位一个 iframe widget）
function createFunctionWidget(latexList, x, y, w, h) {
    const layer = document.getElementById('functionLayer');
    if (!layer) return null;
    const wrap = document.createElement('div');
    wrap.className = 'function-widget';
    const iframe = document.createElement('iframe');
    iframe.title = '函数活图';
    iframe.src = 'desmos.html?widget=1&expr=' + encodeURIComponent((latexList || []).join('\u0001'));
    wrap.appendChild(iframe);
    const closeBtn = document.createElement('button');
    closeBtn.className = 'function-widget-close';
    closeBtn.textContent = '×';
    closeBtn.title = '关闭该函数图';
    const rec = { el: wrap, img: { x: x, y: y, w: w, h: h }, latex: (latexList || []).slice() };
    closeBtn.addEventListener('click', function () { removeFunctionWidget(rec); });
    wrap.appendChild(closeBtn);
    layer.appendChild(wrap);
    functionWidgets.push(rec);
    syncFunctionWidgets();
    return rec;
}

function removeFunctionWidget(w) {
    if (!w) return;
    const i = functionWidgets.indexOf(w);
    if (i >= 0) functionWidgets.splice(i, 1);
    if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el);
}

function clearAllFunctionWidgets() {
    for (let i = functionWidgets.length - 1; i >= 0; i--) removeFunctionWidget(functionWidgets[i]);
    syncFunctionLayerToolState();
}

// 插入函数：在画布中央生成一块可交互活图（替代静态截图）
function insertFunctionGraph(latexList) {
    if (!state.canvas) return;
    const centerX = window.innerWidth / 2 + (state.normalScrollX || 0);
    const centerY = window.innerHeight / 2 + (state.normalScrollY || 0);
    // 活图默认占据更大的白板区域，便于查看曲线和网格。
    let ih = Math.round(window.innerHeight * 0.58);
    let iw = Math.round(ih * 1.55);
    const maxW = Math.round(window.innerWidth * 0.86);
    const maxH = Math.round(window.innerHeight * 0.78);
    if (ih > maxH) { ih = maxH; iw = Math.round(ih * 1.55); }
    if (iw > maxW) { iw = maxW; ih = Math.round(iw / 1.55); }
    const x = Math.round(centerX - iw / 2);
    const y = Math.round(centerY - ih / 2);
    createFunctionWidget(latexList, x, y, iw, ih);
    if (typeof setTool === 'function') { try { setTool('mouse'); } catch (_) { } }
}

// 画布滚动/缩放后同步活图位置；窗口尺寸变化也重新对齐
window.addEventListener('resize', function () { syncFunctionWidgets(); });

// 图像四角（逻辑坐标）
function imageCorners(img) {
    return [
        [img.x, img.y],
        [img.x + img.w, img.y],
        [img.x, img.y + img.h],
        [img.x + img.w, img.y + img.h]
    ];
}

// 命中当前页最上层函数图像，命中返回该图像对象，否则返回 null
function imageHitTest(p) {
    const list = state.strokes;
    for (let i = list.length - 1; i >= 0; i--) {
        const s = list[i];
        if (!s || s.tool !== 'image') continue;
        if (p.x >= s.x && p.x <= s.x + s.w && p.y >= s.y && p.y <= s.y + s.h) return s;
    }
    return null;
}



