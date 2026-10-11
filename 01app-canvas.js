function createGridCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    gridCanvas.width = rect.width * dpr;
    gridCanvas.height = rect.height * dpr;
    gridCanvas.style.width = rect.width + 'px';
    gridCanvas.style.height = rect.height + 'px';

    state.gridCtx = gridCanvas.getContext('2d');
    state.gridCtx.scale(dpr, dpr);

    drawGrid();
}

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
        radius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
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

function drawGrid() {
    if (!state.gridCtx || !state.gridEnabled) return;

    const ctx = state.gridCtx;
    const r = state.videoRect || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const v = state.videoView || { scale: 1, tx: 0, ty: 0 };
    const s = v.scale || 1;
    const gridSize = state.gridSize;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, gridCanvas.width, gridCanvas.height);
    ctx.restore();

    // 可见窗口在逻辑坐标中的范围：逻辑原点对齐视频可见矩形左上角；
    // 普通模式向下翻页后逻辑 y 需再加滚动偏移
    const gridScrollY = isNormalMode() ? (state.normalScrollY || 0) : 0;
    const x0 = (0 - (r.x || 0) - v.tx) / s;
    const x1 = (window.innerWidth - (r.x || 0) - v.tx) / s;
    const y0 = (0 - (r.y || 0) - v.ty) / s + gridScrollY;
    const y1 = (window.innerHeight - (r.y || 0) - v.ty) / s + gridScrollY;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;

    for (let x = Math.floor(x0 / gridSize) * gridSize; x <= x1; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.stroke();
    }
    for (let y = Math.floor(y0 / gridSize) * gridSize; y <= y1; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.stroke();
    }
}

function toggleGrid() {
    state.gridEnabled = !state.gridEnabled;
    const switchEl = document.getElementById('gridToggleSwitch');

    if (state.gridEnabled) {
        switchEl.classList.add('active');
        gridCanvas.style.display = 'block';
        drawGrid();
    } else {
        switchEl.classList.remove('active');
        gridCanvas.style.display = 'none';
    }
}

function updateGridCanvas() {
    if (state.gridEnabled) {
        drawGrid();
    }
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
    ctx.lineWidth = penConfig.currentSize;
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
    if (!state.isDrawing && state.pendingPoints.length === 0) {
        state.isDrawingFrame = false;
        return;
    }

    if (state.pendingPoints.length > 0 && state.isDrawing) {
        const points = state.pendingPoints.splice(0);

        if (state.tool === 'pen' && !state.isMegaEraser && state.currentStroke) {
            state.ctx.save();
            if (state.doublePageMode) state.ctx.translate(doublePageOffsetX(state.currentStroke.pg), 0);
            state.ctx.globalCompositeOperation = 'source-over';
            state.ctx.lineWidth = penConfig.currentSize;
            state.ctx.strokeStyle = penConfig.currentColor;
            state.ctx.lineCap = 'round';
            state.ctx.lineJoin = 'round';

            state.ctx.beginPath();
            state.ctx.moveTo(state.lastX, state.lastY);

            for (let i = 0; i < points.length; i++) {
                const point = points[i];
                state.currentStroke.points.push(point);

                // 二次贝塞尔仅作实时预览，松手后由 renderAll 重放矢量
                if (i > 0) {
                    const prev = points[i - 1];
                    const midX = (prev.x + point.x) / 2;
                    const midY = (prev.y + point.y) / 2;
                    state.ctx.quadraticCurveTo(prev.x, prev.y, midX, midY);
                }
            }

            const lastPoint = points[points.length - 1];
            state.ctx.lineTo(lastPoint.x, lastPoint.y);
            state.ctx.stroke();
            state.ctx.restore();

            state.lastX = lastPoint.x;
            state.lastY = lastPoint.y;
        } else if (state.tool === 'eraser' || state.isMegaEraser) {
            const eraserRadius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;

            if (state.lastX !== null && state.lastY !== null && points.length > 0) {
                points.unshift({ x: state.lastX, y: state.lastY });
            }
            appendErasePathPoints(points, eraserRadius);

            const lastPoint = points[points.length - 1];
            state.lastX = lastPoint.x;
            state.lastY = lastPoint.y;

            applyEraseHits(eraserRadius);
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
    ctx.lineWidth = s.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.tool === 'circle') {
        ctx.beginPath();
        ctx.arc(s.cx, s.cy, s.r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.save();
        ctx.lineWidth = Math.max(1.5, s.width * 0.5);
        const markSize = Math.max(8, s.width * 3);
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

function updateWatermark() {
    const wm = document.getElementById('watermark');
    if (!wm) return;
    const show = !state.doublePageMode && !state.transparentMode && !state.videoBackgroundEnabled &&
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
    const reach = radius + (stroke.width || 1) / 2;

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
function appendErasePathPoints(points, radius) {
    if (!points || points.length === 0) return;
    if (!state.erasePath) state.erasePath = [];
    const step = Math.max(2, (radius || state.eraserRadius) * 0.4);
    for (const p of points) {
        const last = state.erasePath[state.erasePath.length - 1];
        if (!last) {
            state.erasePath.push({ x: p.x, y: p.y });
            continue;
        }
        const dx = p.x - last.x, dy = p.y - last.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= step) {
            state.erasePath.push({ x: p.x, y: p.y });
        } else {
            const n = Math.ceil(dist / step);
            for (let i = 1; i <= n; i++) {
                state.erasePath.push({ x: last.x + dx * i / n, y: last.y + dy * i / n });
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
    const reach = radius + (stroke.width || 1) / 2;

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

function commitErase() {
    if (!state.erasingNow) return;
    if (state.erasingNow.size > 0) {
        const radius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
        // 记录命中笔画原始位置与碎片，供撤销还原
        const entries = [];
        state.strokes.forEach((s, idx) => {
            if (state.erasingNow.has(s)) {
                entries.push({ stroke: s, frags: splitStrokeByEraser(s, state.erasePath, radius), origIndex: idx });
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
    state.erasePath = null;
    state.eraseFrags = null;
    renderAll();
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
function clientToLogical(cx, cy) {
    const r = state.videoRect || { x: 0, y: 0 };
    const v = state.videoView || { scale: 1, tx: 0, ty: 0 };
    const s = v.scale || 1;
    // 逻辑坐标原点始终对齐视频可见矩形左上角；普通模式翻页后逻辑 y 加滚动偏移
    const scrollY = isNormalMode() ? (state.normalScrollY || 0) : 0;
    let x = (cx - (r.x || 0) - v.tx) / s;
    // 双页书写：减去当前激活页的显示平移，得到该页的“页面局部坐标”
    if (state.doublePageMode) {
        x -= doublePageOffsetX(state.activeDoublePage);
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
    const rect = state.canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const touchId = touch.identifier;
        const touchState = state.activeTouches.get(touchId);

        // 只处理第一根合法手指，防止笔迹跳变
        if (!touchState || !touchState.isDrawing) continue;

        const p = clientToLogical(touch.clientX, touch.clientY);
        const x = p.x;
        const y = p.y;

        if (touchState.isShapeMode && state.shapeMode && state.shapeStartPoint) {
            drawShapePreview(state.shapeStartPoint.x, state.shapeStartPoint.y, x, y);
            touchState.lastX = x;
            touchState.lastY = y;
            continue;
        }

        // 超大橡皮擦优先级高于当前工具：笔工具下也执行擦除
        if (state.isMegaEraser) {
            const eraserRadius = state.megaEraserRadius;
            appendErasePathPoints([{ x: touchState.lastX, y: touchState.lastY }, { x, y }], eraserRadius);
            touchState.lastX = x;
            touchState.lastY = y;
            applyEraseHits(eraserRadius);
            drawMegaEraserPreview(x, y, eraserRadius);
        } else if (state.tool === 'pen' && !state.isMegaEraser) {
            state.ctx.save();
            if (state.doublePageMode) state.ctx.translate(doublePageOffsetX(state.activeDoublePage), 0);
            state.ctx.globalCompositeOperation = 'source-over';
            state.ctx.lineWidth = penConfig.currentSize;
            state.ctx.strokeStyle = penConfig.currentColor;
            state.ctx.lineCap = 'round';
            state.ctx.lineJoin = 'round';

            touchState.points.push({ x, y });
            state.ctx.beginPath();
            state.ctx.moveTo(touchState.lastX, touchState.lastY);
            state.ctx.lineTo(x, y);
            state.ctx.stroke();
            state.ctx.restore();

            touchState.lastX = x;
            touchState.lastY = y;

        } else if (state.tool === 'eraser') {
            const eraserRadius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
            appendErasePathPoints([{ x: touchState.lastX, y: touchState.lastY }, { x, y }], eraserRadius);
            touchState.lastX = x;
            touchState.lastY = y;
            applyEraseHits(eraserRadius);
            drawMegaEraserPreview(x, y, eraserRadius);
        }
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

    if (toolName !== 'mouse' && typeof disableMousePassthrough === 'function') {
        disableMousePassthrough();
    }
    if (toolName === 'mouse' && state.transparentMode && typeof enableMousePassthrough === 'function') {
        enableMousePassthrough();
    }

    if (toolName !== 'eraser' && typeof closeEraserMenu === 'function' && state.eraserMenuOpen) {
        closeEraserMenu();
    }

    container.className = toolName === 'pen' ?
        'cursor-pen w-full h-full fixed inset-0' :
        (toolName === 'eraser' ? 'cursor-eraser-active w-full h-full fixed inset-0' :
        (isNormalMode() ? 'cursor-grab-pan w-full h-full fixed inset-0' :
        'cursor-default w-full h-full fixed inset-0'));

    // 函数绘图器批注模式：鼠标工具时画布穿透，直接操作网页
    if (typeof updateDesmosOverlayPointer === 'function') {
        updateDesmosOverlayPointer();
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

    gridCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    gridCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    gridCanvas.style.width = rect.width + 'px';
    gridCanvas.style.height = rect.height + 'px';
    gridCanvas.style.left = rect.x + 'px';
    gridCanvas.style.top = rect.y + 'px';
    if (state.gridCtx) {
        state.gridCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (state.gridEnabled) drawGrid();
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
    return !state.videoBackgroundEnabled && !state.transparentMode;
}

function setNormalScrollY(y) {
    const limit = state.normalScrollLimit || 0;
    state.normalScrollY = Math.max(0, Math.min(limit, y));
    applyViewToContexts();
    if (state.gridEnabled && typeof drawGrid === 'function') drawGrid();
    updateScrollIndicator();
    renderAll();
}

function resetNormalScrollY() {
    if ((state.normalScrollY || 0) === 0) return;
    state.normalScrollY = 0;
    applyViewToContexts();
    if (state.gridEnabled && typeof drawGrid === 'function') drawGrid();
    updateScrollIndicator();
}

function updateScrollIndicator() {
    const ind = document.getElementById('scrollIndicator');
    if (!ind) return;
    const thumb = document.getElementById('scrollIndicatorThumb');
    const y = state.normalScrollY || 0;
    const show = isNormalMode() && y > 0;
    ind.classList.toggle('show', show);
    if (!show || !thumb) return;
    const limit = state.normalScrollLimit || 1;
    const total = window.innerHeight + limit;
    const trackH = ind.clientHeight;
    const thumbH = Math.max(28, trackH * window.innerHeight / total);
    const maxTop = trackH - thumbH;
    const top = maxTop * (y / limit);
    thumb.style.height = thumbH + 'px';
    thumb.style.top = top + 'px';
}

// 位图分辨率恒为 rect*dpr，缩放/平移由上下文变换完成，放大不膨胀位图，矢量笔迹保持清晰
function applyViewToContexts() {
    if (!state.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const v = state.videoView || { scale: 1, tx: 0, ty: 0 };
    const r = state.videoRect || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const s = v.scale || 1;
    const a = dpr * s;
    const scrollY = isNormalMode() ? (state.normalScrollY || 0) : 0;
    // 平移量需叠加视频可见矩形偏移，保证笔迹与视频画面严格对齐
    const e = dpr * (v.tx + (r.x || 0));
    const f = dpr * (v.ty + (r.y || 0) - s * scrollY);
    if (state.ctx) state.ctx.setTransform(a, 0, 0, a, e, f);
    if (state.gridCtx) state.gridCtx.setTransform(a, 0, 0, a, e, f);
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
    state.ctx.lineWidth = penConfig.currentSize;
    state.ctx.strokeStyle = penConfig.currentColor;
    state.ctx.imageSmoothingEnabled = true;
    state.ctx.imageSmoothingQuality = 'high';

    if (state.gridCtx) {
        gridCanvas.width = bw;
        gridCanvas.height = bh;
        gridCanvas.style.width = rect.width + 'px';
        gridCanvas.style.height = rect.height + 'px';
        applyViewToContexts();
        if (state.gridEnabled) drawGrid();
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
        gridCanvas.style.transform = '';
        gridCanvas.style.transformOrigin = '';
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
    applyAutoPenSizeByZoom(ns);
}

// 放大到默认大小 150% 以上时画笔自动切到最细档
function applyAutoPenSizeByZoom(scale) {
    if (!state.videoBackgroundEnabled) return;
    const thinnest = penConfig.sizes[0];
    if (scale >= 1.5 && penConfig.currentSize !== thinnest) {
        setPenSize(thinnest);
    }
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
    if (typeof updateScrollIndicator === 'function') updateScrollIndicator();
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
        state.erasingNow = new Set();
        state.eraseFrags = new Map();
        state.erasePath = [{ x, y }];
        const eraserRadius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
        applyEraseHits(eraserRadius);
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

    if (state.tool === 'pen' && !state.isMegaEraser && state.currentStroke) {
        const pts = state.currentStroke.points;
        let stroke;
        if (pts.length > 2) {
            const converted = analyzeAndConvertStroke(pts);
            stroke = converted || state.currentStroke;
        } else {
            stroke = state.currentStroke;
        }
        if (typeof attachDoublePagePg === 'function') attachDoublePagePg(stroke);
        state.strokes.push(stroke);
        pushUndo({ type: 'add', stroke: stroke });
        renderAll();
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

    // 希沃红外触屏手掌/多指接触面积远大于指尖，据此触发超大橡皮擦，笔/橡皮工具均可触发
    if (isFirstFingerOverall && (state.tool === 'pen' || state.tool === 'eraser') && !state.isMegaEraser) {
        let totalTouchArea = 0;
        for (let i = 0; i < e.touches.length; i++) {
            const t = e.touches[i];
            const rx = t.radiusX || 0;
            const ry = t.radiusY || 0;
            if (rx > 0 && ry > 0) {
                totalTouchArea += Math.PI * rx * ry;
            } else {
                totalTouchArea += Math.PI * 10 * 10;
            }
        }
        // 手掌一定是多指：要求 ≥3 指或面积超限才触发。
        // 单指即使半径较大（红外触屏常见）也不得误判，否则 pen 笔迹会被当成擦除、跳过自动平滑。
        if (e.touches.length >= 3 || totalTouchArea > state.megaEraserThreshold) {
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
        const tp = clientToLogical(touch.clientX, touch.clientY);
        const x = tp.x;
        const y = tp.y;

        // 只有第一根手指被赋予绘图权，后加入的手指 isDrawing 均为 false
        const canStartDrawing = isFirstFingerOverall && i === 0;

        state.activeTouches.set(touchId, {
            lastX: x,
            lastY: y,
            isDrawing: canStartDrawing,
            points: [{x, y}],
            pendingPoints: [{x, y}],
            historyPushed: false,
            isShapeMode: canStartDrawing && !!state.shapeMode,
            erasePath: null
        });

        if (canStartDrawing && (state.tool === 'pen' || state.tool === 'eraser')) {
            state.isDrawing = true;
            if (state.shapeMode) {
                state.shapeStartPoint = { x, y };
            } else if (state.isMegaEraser) {
                state.erasingNow = new Set();
                state.eraseFrags = new Map();
                state.erasePath = [{ x, y }];
                state.activeTouches.get(touchId).erasePath = state.erasePath;
                applyEraseHits(state.megaEraserRadius);
                drawMegaEraserPreview(x, y, state.megaEraserRadius);
            } else if (state.tool === 'eraser') {
                state.erasingNow = new Set();
                state.eraseFrags = new Map();
                state.erasePath = [{ x, y }];
                state.activeTouches.get(touchId).erasePath = state.erasePath;
            } else {
                state.ctx.save();
                if (state.doublePageMode) state.ctx.translate(doublePageOffsetX(state.activeDoublePage), 0);
                state.ctx.beginPath();
                state.ctx.moveTo(x, y);
                state.ctx.lineTo(x, y);
                state.ctx.stroke();
                state.ctx.restore();
            }
        }
    }
}



function handleTouchEnd(e) {
    e.preventDefault();
    const rect = state.canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const touchId = touch.identifier;
        const touchState = state.activeTouches.get(touchId);

        if (!touchState) continue;

        if (touchState.isDrawing) {
            if (touchState.isShapeMode && state.shapeMode && state.shapeStartPoint) {
                finishShapeDraw(touchState.lastX, touchState.lastY);
            } else if (state.tool === 'pen' && !state.isMegaEraser) {
                const pts = touchState.points;
                let stroke;
                if (pts.length > 2) {
                    const converted = analyzeAndConvertStroke(pts);
                    stroke = converted || {
                        tool: 'pen',
                        points: pts,
                        color: penConfig.currentColor,
                        width: penConfig.currentSize
                    };
                } else {
                    stroke = {
                        tool: 'pen',
                        points: pts,
                        color: penConfig.currentColor,
                        width: penConfig.currentSize
                    };
                }
                if (typeof attachDoublePagePg === 'function') attachDoublePagePg(stroke);
                state.strokes.push(stroke);
                pushUndo({ type: 'add', stroke: stroke });
                renderAll();
            } else if (state.tool === 'eraser' || state.isMegaEraser) {
                commitErase();
            }

            state.isDrawing = false;
        }

        state.activeTouches.delete(touchId);
    }

    if (e.touches.length === 0) {
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
//（注：内容由AI生成）

