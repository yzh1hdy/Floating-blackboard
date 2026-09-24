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

// --- 图形绘制功能 ---
function startShapeDraw(shapeType) {
    closeMoreMenu();
    state.shapeMode = shapeType;
    state.shapeStartPoint = null;

    // 创建预览canvas
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
    const rect = getCanvasTargetRect(); // 预览层同样占满整个屏幕
    state.shapePreviewCanvas.width = Math.round(rect.width * dpr);
    state.shapePreviewCanvas.height = Math.round(rect.height * dpr);
    state.shapePreviewCanvas.style.width = rect.width + 'px';
    state.shapePreviewCanvas.style.height = rect.height + 'px';
    state.shapePreviewCtx.setTransform(a, 0, 0, a, dpr * (v.tx + (r.x || 0)), dpr * (v.ty + (r.y || 0)));
    state.shapePreviewCtx.save();
    state.shapePreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
    state.shapePreviewCtx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
    state.shapePreviewCtx.restore();

    // 更改光标提示用户
    container.style.cursor = 'crosshair';
}

function drawShapePreview(startX, startY, endX, endY) {
    if (!state.shapePreviewCtx) return;

    const ctx = state.shapePreviewCtx;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
    ctx.restore();

    // 对起点和终点进行吸附（预览时）
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

        // 预览时显示圆心十字标记
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
        // 吸附逻辑：接近水平或垂直时自动吸附
        const dx = endX - startX;
        const dy = endY - startY;
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = Math.abs(angleRad * 180 / Math.PI);
        const adjustedAngle = angleDeg > 90 ? 180 - angleDeg : angleDeg;

        let finalEndX = endX;
        let finalEndY = endY;

        // 如果接近水平（偏差<3度），吸附到水平
        if (adjustedAngle < 3) {
            finalEndY = startY;
        }
        // 如果接近垂直（偏差<3度），吸附到垂直
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
}

// --- 吸附功能：将点吸附到圆心、圆上或直线端点 ---
function snapToCircle(x, y) {
    const snapThreshold = 15; // 吸附阈值（像素）
    let snappedX = x;
    let snappedY = y;
    let didSnap = false;

    // 首先检查直线端点吸附（优先级最高）
    for (const line of state.lines) {
        // 检查起点
        const distToStart = Math.sqrt((x - line.x1) ** 2 + (y - line.y1) ** 2);
        if (distToStart < snapThreshold) {
            snappedX = line.x1;
            snappedY = line.y1;
            didSnap = true;
            return { x: snappedX, y: snappedY, didSnap };
        }

        // 检查终点
        const distToEnd = Math.sqrt((x - line.x2) ** 2 + (y - line.y2) ** 2);
        if (distToEnd < snapThreshold) {
            snappedX = line.x2;
            snappedY = line.y2;
            didSnap = true;
            return { x: snappedX, y: snappedY, didSnap };
        }
    }

    for (const circle of state.circles) {
        // 计算到圆心的距离
        const dx = x - circle.x;
        const dy = y - circle.y;
        const distToCenter = Math.sqrt(dx * dx + dy * dy);

        // 检查是否接近圆心
        if (distToCenter < snapThreshold) {
            snappedX = circle.x;
            snappedY = circle.y;
            didSnap = true;
            break;
        }

        // 检查是否接近圆周（圆上）
        const distToCircle = Math.abs(distToCenter - circle.radius);
        if (distToCircle < snapThreshold) {
            // 计算圆上的点（沿相同方向）
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

    // 对起点进行吸附
    const startSnap = snapToCircle(startX, startY);
    if (startSnap.didSnap) {
        startX = startSnap.x;
        startY = startSnap.y;
    }

    // 对终点进行吸附
    const endSnap = snapToCircle(endX, endY);
    if (endSnap.didSnap) {
        endX = endSnap.x;
        endY = endSnap.y;
    }

    // 用于存储最终的端点坐标（经过吸附后的坐标）
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
        // 吸附逻辑：接近水平或垂直时自动吸附
        const dx = endX - startX;
        const dy = endY - startY;
        const angleRad = Math.atan2(dy, dx);
        const angleDeg = Math.abs(angleRad * 180 / Math.PI);
        const adjustedAngle = angleDeg > 90 ? 180 - angleDeg : angleDeg;

        // 如果接近水平（偏差<3度），吸附到水平
        if (adjustedAngle < 3) {
            finalEndY = startY;
        }
        // 如果接近垂直（偏差<3度），吸附到垂直
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
        state.strokes.push(stroke);
        pushUndo({ type: 'add', stroke: stroke });
        renderAll();
    }

    // 清除预览
    if (state.shapePreviewCanvas && state.shapePreviewCtx) {
        state.shapePreviewCtx.save();
        state.shapePreviewCtx.setTransform(1, 0, 0, 1, 0, 0);
        state.shapePreviewCtx.clearRect(0, 0, state.shapePreviewCanvas.width, state.shapePreviewCanvas.height);
        state.shapePreviewCtx.restore();
    }

    // 重置状态
    state.shapeMode = null;
    state.shapeStartPoint = null;
    container.style.cursor = state.tool === 'pen' ? 'crosshair' : 'auto';
}

// --- 笔画几何分析工具 ---
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

// 分析一笔手绘点列：若符合直线/圆，则返回对应的矢量笔画描述；否则返回 null。
// 该函数不再直接绘制画布，由调用方提交矢量笔画并 renderAll()。
function analyzeAndConvertStroke(points) {
    if (!state.autoCorrectionEnabled) return null;
    if (points.length < 3) return null;

    const start = points[0];
    const end = points[points.length - 1];
    const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

    // 仅在笔画足够长时考虑直线替换
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
    // 圆半径必须大于阈值才替换
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

