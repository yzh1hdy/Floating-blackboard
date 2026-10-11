function toggleAutoCorrection() {
    state.autoCorrectionEnabled = !state.autoCorrectionEnabled;
    const switchEl = document.getElementById('autoCorrectionSwitch');
    if (state.autoCorrectionEnabled) {
        switchEl.classList.add('active');
    } else {
        switchEl.classList.remove('active');
    }
}

function updateAutoCorrectionSwitch() {
    const switchEl = document.getElementById('autoCorrectionSwitch');
    if (state.autoCorrectionEnabled) {
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

function drawShapePreview(startX, startY, endX, endY) {
    if (!state.shapePreviewCtx) return;

    const ctx = state.shapePreviewCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
    ctx.restore();

    ctx.save();
    if (state.doublePageMode) ctx.translate(doublePageOffsetX(state.activeDoublePage), 0);

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

function finishShapeDraw(endX, endY) {
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
        if (typeof attachDoublePagePg === 'function') attachDoublePagePg(stroke);
        state.strokes.push(stroke);
        pushUndo({ type: 'add', stroke: stroke });
        renderAll();
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

function isCloseToLine(points, threshold) {
    if (points.length < 2) return false;

    const start = points[0];
    const end = points[points.length - 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    if (length === 0) return false;

    let maxDistance = 0;
    for (let i = 1; i < points.length - 1; i++) {
        const point = points[i];
        const distance = Math.abs(dy * (point.x - start.x) - dx * (point.y - start.y)) / length;
        maxDistance = Math.max(maxDistance, distance);
    }

    return maxDistance < threshold;
}

function fitCircle(points) {
    if (points.length < 3) return null;

    let sumX = 0, sumY = 0;
    for (const p of points) {
        sumX += p.x;
        sumY += p.y;
    }
    const centerX = sumX / points.length;
    const centerY = sumY / points.length;

    let sumRadius = 0;
    for (const p of points) {
        const dx = p.x - centerX;
        const dy = p.y - centerY;
        sumRadius += Math.sqrt(dx * dx + dy * dy);
    }
    const radius = sumRadius / points.length;

    return { centerX, centerY, radius };
}

function isCloseToCircle(points, circle, threshold) {
    for (const p of points) {
        const dx = p.x - circle.centerX;
        const dy = p.y - circle.centerY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(distance - circle.radius) > threshold) {
            return false;
        }
    }
    return true;
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

// 分析手绘点列：符合直线/圆则返回对应矢量描述，否则返回 null；不直接绘制，由调用方提交
function analyzeAndConvertStroke(points) {
    if (!state.autoCorrectionEnabled) return null;
    if (points.length < 3) return null;

    const start = points[0];
    const end = points[points.length - 1];
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

    if (length > 160) {
        const isLine = isCloseToLine(points, 15);
        if (isLine) {
            return {
                tool: 'line',
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                color: penConfig.currentColor,
                width: penConfig.currentSize
            };
        }
    }

    const circle = fitCircle(points);
    if (circle && circle.radius > 120) {
        const isCircle = isCloseToCircle(points, circle, 80);
        if (isCircle) {
            return {
                tool: 'circle',
                cx: circle.centerX,
                cy: circle.centerY,
                r: circle.radius,
                color: penConfig.currentColor,
                width: penConfig.currentSize
            };
        }
    }

    return null;
}

