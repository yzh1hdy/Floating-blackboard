function toggleBoxSelect() {
    state.boxSelectEnabled = !state.boxSelectEnabled;
    if (!state.boxSelectEnabled && typeof clearSelection === 'function') {
        clearSelection();
    }
    updateBoxSelectSwitch();
}

function updateBoxSelectSwitch() {
    const switchEl = document.getElementById('boxSelectSwitch');
    if (!switchEl) return;
    if (state.boxSelectEnabled) {
        switchEl.classList.add('active');
    } else {
        switchEl.classList.remove('active');
    }
}

function toggleMultiFingerWrite() {
    state.multiFingerWrite = !state.multiFingerWrite;
    updateMultiFingerSwitch();
}

function updateMultiFingerSwitch() {
    const switchEl = document.getElementById('multiFingerSwitch');
    if (!switchEl) return;
    if (state.multiFingerWrite) {
        switchEl.classList.add('active');
    } else {
        switchEl.classList.remove('active');
    }
}

function startShapeDraw(shapeType) {
    closeMoreMenu();
    state.shapeMode = shapeType;
    state.shapeStartPoint = null;

    if (!state.shapePreviewCanvas) {
        const canvas = document.createElement('canvas');
        canvas.id = 'shape-preview-canvas';
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.pointerEvents = 'none';
        canvas.style.zIndex = '15';
        container.appendChild(canvas);
        state.shapePreviewCanvas = canvas;
        state.shapePreviewCtx = canvas.getContext('2d');
    }

    // 预览层位图固定原生分辨率，视口变换烤进上下文（与主画布一致）
    const dpr = window.devicePixelRatio || 1;
    const v = state.videoView || { scale: 1, tx: 0, ty: 0 };
    const r = state.videoRect || { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
    const a = dpr * (v.scale || 1);
    const rect = getCanvasTargetRect();
    state.shapePreviewCanvas.width = Math.round(rect.width * dpr);
    state.shapePreviewCanvas.height = Math.round(rect.height * dpr);
    state.shapePreviewCanvas.style.width = rect.width + 'px';
    state.shapePreviewCanvas.style.height = rect.height + 'px';
    state.shapePreviewCtx.setTransform(a, 0, 0, a, dpr * (v.tx + (r.x || 0)), dpr * (v.ty + (r.y || 0)));
    state.shapePreviewCtx.save();
    state.shapePreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.shapePreviewCtx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
    state.shapePreviewCtx.restore();

    container.style.cursor = 'crosshair';
}

function drawShapePreview(startX, startY, endX, endY, pgOverride) {
    if (!state.shapePreviewCtx) return;

    const ctx = state.shapePreviewCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
    ctx.restore();

    ctx.save();
    if (state.doublePageMode) {
        const pg = (pgOverride !== undefined && pgOverride !== null) ? pgOverride : state.activeDoublePage;
        ctx.translate(doublePageOffsetX(pg), 0);
    }

    const startSnap = snapToCircle(startX, startY);
    if (startSnap.didSnap) {
        startX = startSnap.x;
        startY = startSnap.y;
    }
    const endSnap = snapToCircle(endX, endY);
    if (endSnap.didSnap) {
        endX = endSnap.x;
        endY = endSnap.y;
    }

    ctx.lineWidth = penConfig.currentSize;
    ctx.strokeStyle = penConfig.currentColor;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (state.shapeMode === 'circle') {
        const radius = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        ctx.beginPath();
        ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.save();
        ctx.strokeStyle = penConfig.currentColor;
        ctx.lineWidth = Math.max(1.5, penConfig.currentSize * 0.5);
        const markSize = Math.max(8, penConfig.currentSize * 3);
        ctx.beginPath();
        ctx.moveTo(startX - markSize, startY);
        ctx.lineTo(startX + markSize, startY);
        ctx.moveTo(startX, startY - markSize);
        ctx.lineTo(startX, startY + markSize);
        ctx.stroke();
        ctx.restore();
    } else if (state.shapeMode === 'line' || state.shapeMode === 'dashed') {
        const dx = endX - startX;
        const dy = endY - startY;
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = Math.abs(angleRad * 180 / Math.PI);
        const adjustedAngle = angleDeg > 90 ? 180 - angleDeg : angleDeg;

        let finalEndX = endX;
        let finalEndY = endY;

        // 偏差 <3 度时吸附到水平/垂直
        if (adjustedAngle < 3) {
            finalEndY = startY;
        }
        else if (adjustedAngle > 87) {
            finalEndX = startX;
        }

        if (state.shapeMode === 'line') {
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(finalEndX, finalEndY);
            ctx.stroke();
        } else if (state.shapeMode === 'dashed') {
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            ctx.lineTo(finalEndX, finalEndY);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    ctx.restore();
}

// 吸附到直线端点（优先级最高）、圆心或圆周
function snapToCircle(x, y) {
    const snapThreshold = 15;
    let snappedX = x;
    let snappedY = y;
    let didSnap = false;

    for (const line of state.lines) {
        const distToStart = Math.sqrt((x - line.x1) ** 2 + (y - line.y1) ** 2);
        if (distToStart < snapThreshold) {
            snappedX = line.x1;
            snappedY = line.y1;
            didSnap = true;
            return { x: snappedX, y: snappedY, didSnap };
        }

        const distToEnd = Math.sqrt((x - line.x2) ** 2 + (y - line.y2) ** 2);
        if (distToEnd < snapThreshold) {
            snappedX = line.x2;
            snappedY = line.y2;
            didSnap = true;
            return { x: snappedX, y: snappedY, didSnap };
        }
    }

    for (const circle of state.circles) {
        const dx = x - circle.x;
        const dy = y - circle.y;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        if (distToCenter < snapThreshold) {
            snappedX = circle.x;
            snappedY = circle.y;
            didSnap = true;
            break;
        }

        const distToCircle = Math.abs(distToCenter - circle.radius);
        if (distToCircle < snapThreshold) {
            const angle = Math.atan2(dy, dx);
            snappedX = circle.x + Math.cos(angle) * circle.radius;
            snappedY = circle.y + Math.sin(angle) * circle.radius;
            didSnap = true;
            break;
        }
    }

    return { x: snappedX, y: snappedY, didSnap };
}

function finishShapeDraw(endX, endY, pgOverride) {
    if (!state.shapeStartPoint) return;

    let startX = state.shapeStartPoint.x;
    let startY = state.shapeStartPoint.y;

    const startSnap = snapToCircle(startX, startY);
    if (startSnap.didSnap) {
        startX = startSnap.x;
        startY = startSnap.y;
    }

    const endSnap = snapToCircle(endX, endY);
    if (endSnap.didSnap) {
        endX = endSnap.x;
        endY = endSnap.y;
    }

    let finalStartX = startX;
    let finalStartY = startY;
    let finalEndX = endX;
    let finalEndY = endY;

    let stroke = null;

    if (state.shapeMode === 'circle') {
        const radius = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
        stroke = {
            tool: 'circle',
            cx: startX,
            cy: startY,
            r: radius,
            color: penConfig.currentColor,
            width: penConfig.currentSize
        };
    } else if (state.shapeMode === 'line' || state.shapeMode === 'dashed') {
        const dx = endX - startX;
        const dy = endY - startY;
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = Math.abs(angleRad * 180 / Math.PI);
        const adjustedAngle = angleDeg > 90 ? 180 - angleDeg : angleDeg;

        if (adjustedAngle < 3) {
            finalEndY = startY;
        }
        else if (adjustedAngle > 87) {
            finalEndX = startX;
        }

        stroke = {
            tool: state.shapeMode,
            x1: finalStartX,
            y1: finalStartY,
            x2: finalEndX,
            y2: finalEndY,
            color: penConfig.currentColor,
            width: penConfig.currentSize
        };
    }

    if (stroke) {
        if (typeof attachDoublePagePg === 'function') attachDoublePagePg(stroke, pgOverride);
        state.strokes.push(stroke);
        pushUndo({ type: 'add', stroke: stroke });
        if (typeof renderAllPreservingTouches === 'function') {
            renderAllPreservingTouches();
        } else {
            renderAll();
        }
    }

    if (state.shapePreviewCanvas && state.shapePreviewCtx) {
        state.shapePreviewCtx.save();
        state.shapePreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
        state.shapePreviewCtx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
        state.shapePreviewCtx.restore();
    }

    state.shapeMode = null;
    state.shapeStartPoint = null;
    container.style.cursor = state.tool === 'pen' ? 'crosshair' : 'auto';
}

function insertCoordinateShape(shapeType) {
    if (!state.ctx || !state.strokes) return;
    const w = window.innerWidth, h = window.innerHeight, size = h * 0.5;
    const stroke = shapeType === 'coordinateSystem'
        ? { tool: 'coordinateSystem', x: (w - size) / 2, y: (h - size) / 2, size, color: penConfig.currentColor, width: penConfig.currentSize }
        : { tool: 'nonNegativeQuadrant', x: w / 2 - 300, y: h / 2 + 200, widthPx: 600, heightPx: 400, color: penConfig.currentColor, width: penConfig.currentSize };
    state.strokes.push(stroke);
    pushUndo({ type: 'add', stroke });
    if (typeof renderAllPreservingTouches === 'function') renderAllPreservingTouches(); else renderAll();
}

function drawArrow(ctx, x1, y1, x2, y2, scale) {
    const a = Math.atan2(y2 - y1, x2 - x1), n = Math.max(8, 10 / scale);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - n * Math.cos(a - Math.PI / 6), y2 - n * Math.sin(a - Math.PI / 6));
    ctx.moveTo(x2, y2); ctx.lineTo(x2 - n * Math.cos(a + Math.PI / 6), y2 - n * Math.sin(a + Math.PI / 6)); ctx.stroke();
}

function drawLine(x1, y1, x2, y2, isDashed = false) {
    state.ctx.globalCompositeOperation = 'source-over';
    state.ctx.lineWidth = penConfig.currentSize;
    state.ctx.strokeStyle = penConfig.currentColor;
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';

    if (isDashed) {
        state.ctx.setLineDash([5, 5]);
    }

    state.ctx.beginPath();
    state.ctx.moveTo(x1, y1);
    state.ctx.lineTo(x2, y2);
    state.ctx.stroke();

    if (isDashed) {
        state.ctx.setLineDash([]);
    }
}

function drawCircle(centerX, centerY, radius) {
    state.ctx.globalCompositeOperation = 'source-over';
    state.ctx.lineWidth = penConfig.currentSize;
    state.ctx.strokeStyle = penConfig.currentColor;
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';

    state.ctx.beginPath();
    state.ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    state.ctx.stroke();
}

