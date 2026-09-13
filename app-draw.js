        // --- 实际上不需要但影响运行的网格线功能 ---
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

        // --- 创建超大橡皮擦预览层 ---
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

        // --- 绘制橡皮擦预览 ---
        function drawMegaEraserPreview(x, y, radius) {
            if (!state.megaEraserPreviewCtx) return;

            // 如果没有传入半径，使用当前橡皮擦半径
            if (radius === undefined) {
                radius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
            }

            const ctx = state.megaEraserPreviewCtx;
            const rect = container.getBoundingClientRect();

            // 清除之前的预览
            ctx.clearRect(0, 0, rect.width, rect.height);

            // 绘制粉色半透明填充圆
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 192, 203, 0.4)'; // 粉色半透明
            ctx.fill();

            // 绘制不透明边框
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.strokeStyle = '#ffc0cb'; // 纯粉色边框
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        // --- 清除超大橡皮擦预览 ---
        function clearMegaEraserPreview() {
            if (!state.megaEraserPreviewCtx) return;
            const rect = container.getBoundingClientRect();
            state.megaEraserPreviewCtx.clearRect(0, 0, rect.width, rect.height);
        }

        function drawGrid() {
            if (!state.gridCtx || !state.gridEnabled) return;

            const ctx = state.gridCtx;
            const width = gridCanvas.width / state.dpr;
            const height = gridCanvas.height / state.dpr;
            const gridSize = state.gridSize;

            ctx.clearRect(0, 0, width, height);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
            ctx.lineWidth = 1;

            // 绘制垂直线
            for (let x = 0; x <= width; x += gridSize) {
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }

            // 绘制水平线
            for (let y = 0; y <= height; y += gridSize) {
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
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
            closeMoreMenu(); // 先关闭更多菜单
            closeVideoMenu(); // 关闭视频菜单
            state.penMenuOpen = true;
            penMenu.classList.add('show');
        }

        function closePenMenu() {
            state.penMenuOpen = false;
            penMenu.classList.remove('show');
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
            closePenMenu(); // 先关闭笔设置菜单
            closeVideoMenu(); // 关闭视频菜单
            state.moreMenuOpen = true;
            moreMenu.classList.add('show');
            if (icons.more && icons.more.img) {
                icons.more.img.src = icons.more.pressed;
            }
            // 更新透明模式按钮文本
            const textEl = document.getElementById('transparentModeText');
            if (textEl) {
                textEl.textContent = state.transparentMode ? '退出透明' : '透明模式';
            }
        }

        function closeMoreMenu() {
            state.moreMenuOpen = false;
            moreMenu.classList.remove('show');
            if (icons.more && icons.more.img) {
                icons.more.img.src = icons.more.released;
            }
        }

        function closeAllMenus() {
            closePenMenu();
            closeMoreMenu();
            closeVideoMenu();
            if (typeof closeEraserMenu === 'function' && state.eraserMenuOpen) {
                closeEraserMenu();
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

            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();
            state.shapePreviewCanvas.width = rect.width * dpr;
            state.shapePreviewCanvas.height = rect.height * dpr;
            state.shapePreviewCanvas.style.width = rect.width + 'px';
            state.shapePreviewCanvas.style.height = rect.height + 'px';
            state.shapePreviewCtx.scale(dpr, dpr);
            state.shapePreviewCtx.clearRect(0, 0, rect.width, rect.height);

            // 更改光标提示用户
            container.style.cursor = 'crosshair';
        }

        function drawShapePreview(startX, startY, endX, endY) {
            if (!state.shapePreviewCtx) return;

            const ctx = state.shapePreviewCtx;
            const rect = container.getBoundingClientRect();
            ctx.clearRect(0, 0, rect.width, rect.height);

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

                // 检查是否接近���心
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

            state.ctx.lineWidth = penConfig.currentSize;
            state.ctx.strokeStyle = penConfig.currentColor;
            state.ctx.lineCap = 'round';
            state.ctx.lineJoin = 'round';
            state.ctx.globalCompositeOperation = 'source-over';

            // 用于存储最终的端点坐标（经过吸附后的坐标）
            let finalStartX = startX;
            let finalStartY = startY;
            let finalEndX = endX;
            let finalEndY = endY;

            if (state.shapeMode === 'circle') {
                const radius = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
                state.ctx.beginPath();
                state.ctx.arc(startX, startY, radius, 0, 2 * Math.PI);
                state.ctx.stroke();

                // 绘制圆心十字标记
                state.ctx.save();
                state.ctx.strokeStyle = penConfig.currentColor;
                state.ctx.lineWidth = Math.max(1.5, penConfig.currentSize * 0.5);
                const markSize = Math.max(8, penConfig.currentSize * 3);
                state.ctx.beginPath();
                state.ctx.moveTo(startX - markSize, startY);
                state.ctx.lineTo(startX + markSize, startY);
                state.ctx.moveTo(startX, startY - markSize);
                state.ctx.lineTo(startX, startY + markSize);
                state.ctx.stroke();
                state.ctx.restore();

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

                if (state.shapeMode === 'line') {
                    state.ctx.beginPath();
                    state.ctx.moveTo(finalStartX, finalStartY);
                    state.ctx.lineTo(finalEndX, finalEndY);
                    state.ctx.stroke();
                } else if (state.shapeMode === 'dashed') {
                    state.ctx.setLineDash([5, 5]);
                    state.ctx.beginPath();
                    state.ctx.moveTo(finalStartX, finalStartY);
                    state.ctx.lineTo(finalEndX, finalEndY);
                    state.ctx.stroke();
                    state.ctx.setLineDash([]);
                }
            }

            pushHistory();

            // 清除预览
            if (state.shapePreviewCtx) {
                const rect = container.getBoundingClientRect();
                state.shapePreviewCtx.clearRect(0, 0, rect.width, rect.height);
            }

            // 保存圆的信息用于吸附（如果是绘制圆）
            if (state.shapeMode === 'circle') {
                const radius = Math.sqrt((endX - startX) ** 2 + (endY - startY) ** 2);
                state.circles.push({
                    x: startX,
                    y: startY,
                    radius: radius
                });
            }

            // 保存直线的端点信息用于吸附（如果是绘制直线或虚线）
            if (state.shapeMode === 'line' || state.shapeMode === 'dashed') {
                state.lines.push({
                    x1: finalStartX,
                    y1: finalStartY,
                    x2: finalEndX,
                    y2: finalEndY
                });
            }

            // 重置状态
            state.shapeMode = null;
            state.shapeStartPoint = null;
            container.style.cursor = state.tool === 'pen' ? 'crosshair' : 'auto';
        }

// --- 优化的Canvas绘制 ---
        function createCanvas() {
            const canvas = document.createElement('canvas');
            canvas.id = 'main-canvas';

            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();

            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            canvas.style.width = rect.width + 'px';
            canvas.style.height = rect.height + 'px';
            // 关键：设置透明背景
            canvas.style.backgroundColor = 'transparent';

            const ctx = canvas.getContext('2d', { 
                alpha: true // 启用透明通道
            });

            ctx.scale(dpr, dpr);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.lineWidth = penConfig.currentSize;
            ctx.strokeStyle = penConfig.currentColor;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            // 优化的事件处理
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

            // 图形绘制预览模式
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

                if (state.tool === 'pen') {
                    state.ctx.globalCompositeOperation = 'source-over';
                    state.ctx.lineWidth = penConfig.currentSize;
                    state.ctx.strokeStyle = penConfig.currentColor;
                    state.ctx.lineCap = 'round';
                    state.ctx.lineJoin = 'round';

                    state.ctx.beginPath();
                    state.ctx.moveTo(state.lastX, state.lastY);

                    for (let i = 0; i < points.length; i++) {
                        const point = points[i];
                        state.currentStrokePoints.push(point);

                        // 使用二次贝塞尔曲线进行平滑
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

                    state.lastX = lastPoint.x;
                    state.lastY = lastPoint.y;
                } else if (state.tool === 'eraser') {
                    const eraserRadius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;

                    // 橡皮擦优化：确保从上一个位置到新位置形成连续擦除路径
                    if (points.length > 0) {
                        // 将上一个位置作为起点，确保连续性
                        if (state.lastX !== null && state.lastY !== null) {
                            const startPoint = { x: state.lastX, y: state.lastY };
                            // 在points前面插入起点，确保连线擦除
                            if (points[0].x !== startPoint.x || points[0].y !== startPoint.y) {
                                points.unshift(startPoint);
                            }
                        }
                        erasePoints(points, eraserRadius);
                    }

                    const lastPoint = points[points.length - 1];
                    state.lastX = lastPoint.x;
                    state.lastY = lastPoint.y;
                }
            }

            requestAnimationFrame(drawFrame);
        }

function erasePoints(points, eraserRadius) {
    if (!state.ctx || !points || points.length === 0) return;

    state.ctx.save();
    // 擦除模式
    state.ctx.globalCompositeOperation = 'destination-out';
    // 关键：原生自带圆角端点和圆角交汇
    state.ctx.lineCap = 'round';
    state.ctx.lineJoin = 'round';
    // lineWidth 就是擦除的直径
    state.ctx.lineWidth = eraserRadius * 2;

    if (points.length === 1) {
        // 单个点：如果是点击一下并没有滑动，画个圆即可
        state.ctx.beginPath();
        state.ctx.arc(points[0].x, points[0].y, eraserRadius, 0, Math.PI * 2);
        state.ctx.fill();
    } else {
        // 多个点：使用简单的直线连线方式，不再使用贝塞尔曲线
        state.ctx.beginPath();
        state.ctx.moveTo(points[0].x, points[0].y);

        for (let i = 1; i < points.length; i++) {
            // 直接连线到当前点
            state.ctx.lineTo(points[i].x, points[i].y);
        }

        state.ctx.stroke();
    }

    state.ctx.restore();
}


        function getCoordinates(e) {
            const rect = state.canvas.getBoundingClientRect();
            return { 
                x: e.clientX - rect.left, 
                y: e.clientY - rect.top 
            };
        }

function handleTouchMove(e) {
    e.preventDefault();
    if (!state.canvas) return;
    const rect = state.canvas.getBoundingClientRect();

    for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        const touchId = touch.identifier;
        const touchState = state.activeTouches.get(touchId);

        // 1. 核心过滤：只处理第一根合法的手指，防止笔迹跳变
        if (!touchState || !touchState.isDrawing) continue;

        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;

        // 2. 图形预览模式
        if (touchState.isShapeMode && state.shapeMode && state.shapeStartPoint) {
            drawShapePreview(state.shapeStartPoint.x, state.shapeStartPoint.y, x, y);
            touchState.lastX = x;
            touchState.lastY = y;
            continue;
        }

        // 3. 触屏绘制过程中只绘制原始折线，抬手后再统一平滑
        if (state.tool === 'pen') {
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

            touchState.lastX = x;
            touchState.lastY = y;

        } else if (state.tool === 'eraser') {
            // 橡皮擦逻辑
            const eraserRadius = state.isMegaEraser ? state.megaEraserRadius : state.eraserRadius;
            const pts = [{ x: touchState.lastX, y: touchState.lastY }, { x, y }];
            erasePoints(pts, eraserRadius);
            
            touchState.lastX = x;
            touchState.lastY = y;
            drawMegaEraserPreview(x, y, eraserRadius);
        }
    }
}




        function setTool(toolName) {
            // 如果正在图形绘制模式，先退出
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
                closePenMenu();
            }
            if (state.tool === 'eraser') icons.eraser.img.src = icons.eraser.released;

            state.tool = toolName;
            updateToolIcons();

            // 切到橡皮擦之外的工具时，关闭滑动清空菜单
            if (toolName !== 'eraser' && typeof closeEraserMenu === 'function' && state.eraserMenuOpen) {
                closeEraserMenu();
            }

            container.className = toolName === 'pen' ? 
                'cursor-pen w-full h-full fixed inset-0' : 
                'cursor-eraser-active w-full h-full fixed inset-0';
        }

        function updateToolIcons() {
            if (state.tool === 'pen') {
                icons.pen.img.src = icons.pen.pressed;
                icons.eraser.img.src = icons.eraser.released;
            } else {
                icons.pen.img.src = icons.pen.released;
                icons.eraser.img.src = icons.eraser.pressed;
            }
        }

        function saveCurrentPage() {
            if (!state.canvas) return;
            const dataURL = state.canvas.toDataURL('image/png');
            state.pages[state.currentPage] = dataURL;
        }

        function loadPageBitmap(pageIndex) {
            if (!state.ctx || !state.canvas) return;

            state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
            state.circles = []; // 清空圆信息
            state.lines = []; // 清空直线端点信息

            const bitmap = state.pages[pageIndex];
            if (bitmap) {
                const img = new Image();
                img.onload = function() {
                    const rect = state.canvas.getBoundingClientRect();
                    state.ctx.drawImage(img, 0, 0, rect.width, rect.height);
                };
                img.src = bitmap;
            }
        }

        function showPerfWarning() {
            state.pendingAddPage = true;
            openPopup('perfWarningOverlay', 'perfWarningPopup');
        }

        function closePerfModal() {
            closePopup('perfWarningOverlay', 'perfWarningPopup');
            state.pendingAddPage = false;
        }

        function confirmAddPage() {
            closePopup('perfWarningOverlay', 'perfWarningPopup');
            if (state.pendingAddPage) {
                state.pendingAddPage = false;
                addPage();
            }
        }

        function addPage() {
            saveCurrentPage();
            state.pages.push(null);
            state.currentPage = state.pages.length - 1;
            state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
            state.history = [];
            state.historyStep = -1;
            state.circles = []; // 清空圆信息
            state.lines = []; // 清空直线端点信息
            updateUI();
        }

        function goToPage(index) {
            if (index < 0 || index >= state.pages.length) return;
            if (index === state.currentPage) return;

            saveCurrentPage();
            state.currentPage = index;
            loadPageBitmap(state.currentPage);
            state.history = [];
            state.historyStep = -1;
            updateUI();
        }

        function updateUI() {
            pageIndicator.innerText = `${state.currentPage + 1}/${state.pages.length}`;
            document.getElementById('prevPageBtn').disabled = state.currentPage === 0;
        }

function pushHistory() {
    if (!state.canvas || !state.ctx) return;

    if (state.historyStep < state.history.length - 1) {
        state.history = state.history.slice(0, state.historyStep + 1);
    }

    // 优化：创建一个离屏 Canvas 来保存当前帧的图像，而不是保存巨大的像素数据
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = state.canvas.width;
    tempCanvas.height = state.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(state.canvas, 0, 0);

    state.history.push(tempCanvas); // 存储的是图像引用，浏览器会自动优化内存
    state.historyStep++;

    // 将撤回上限降低到 50
    if (state.history.length > 50) {
        state.history.shift();
        state.historyStep--;
    }
}


function undo() {
    if (state.historyStep > 0) {
        state.historyStep--;
        const previousCanvas = state.history[state.historyStep];
        
        // 清除当前并绘制历史
        state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
        state.ctx.drawImage(previousCanvas, 0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
    }
}

        function confirmClear() {
            openPopup('clearConfirmOverlay', 'clearConfirmPopup');
        }

        function closeClearModal() {
            closePopup('clearConfirmOverlay', 'clearConfirmPopup');
        }

        function executeClear() {
            if (!state.ctx || !state.canvas) {
                closeClearModal();
                return;
            }

            const canvas = state.canvas;
            canvas.classList.remove('canvas-clear-animating');
            void canvas.offsetWidth;
            canvas.classList.add('canvas-clear-animating');

            // 动画结束后再清空像素，确保模糊渐隐过程可见。
            const finishClear = function() {
                canvas.classList.remove('canvas-clear-animating');
                state.ctx.clearRect(0, 0, canvas.width / state.dpr, canvas.height / state.dpr);
                state.history = [];
                state.historyStep = -1;
                state.circles = []; // 清空圆信息
                state.lines = []; // 清空直线端点信息
            };

            canvas.addEventListener('animationend', finishClear, { once: true });
            closeClearModal();
        }

        // --- 新版弹窗控制函数 ---
        function openPopup(overlayId, popupId) {
            const overlay = document.getElementById(overlayId);
            const popup = document.getElementById(popupId);
            if (!overlay || !popup) return;
            overlay.classList.add('active');
            popup.classList.remove('leaving');
            popup.classList.add('entering');
        }

        function closePopup(overlayId, popupId) {
            const overlay = document.getElementById(overlayId);
            const popup = document.getElementById(popupId);
            if (!overlay || !popup) return;
            popup.classList.remove('entering');
            popup.classList.add('leaving');
            setTimeout(function() {
                overlay.classList.remove('active');
                popup.classList.remove('leaving');
            }, 500);
        }

        function handleClearOverlayClick(e) {
            if (e.target === document.getElementById('clearConfirmOverlay')) closeClearModal();
        }

        function handlePerfOverlayClick(e) {
            if (e.target === document.getElementById('perfWarningOverlay')) closePerfModal();
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

        function handleResize() {
            if (!state.canvas) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = container.getBoundingClientRect();

            const oldWidth = parseFloat(state.canvas.style.width) || state.canvas.width / state.dpr;
            const oldHeight = parseFloat(state.canvas.style.height) || state.canvas.height / state.dpr;

            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = oldWidth;
            tempCanvas.height = oldHeight;
            const tempCtx = tempCanvas.getContext('2d');
            tempCtx.drawImage(state.canvas, 0, 0, oldWidth, oldHeight);

            state.canvas.width = rect.width * dpr;
            state.canvas.height = rect.height * dpr;
            state.canvas.style.width = rect.width + 'px';
            state.canvas.style.height = rect.height + 'px';
            // 保持透明背景
            state.canvas.style.backgroundColor = 'transparent';

            state.ctx.scale(dpr, dpr);
            state.ctx.drawImage(tempCanvas, 0, 0, rect.width, rect.height);

            state.ctx.lineCap = 'round';
            state.ctx.lineJoin = 'round';
            state.ctx.imageSmoothingEnabled = true;
            state.ctx.imageSmoothingQuality = 'high';

            state.dpr = dpr;

            // 更新网格canvas大小
            gridCanvas.width = rect.width * dpr;
            gridCanvas.height = rect.height * dpr;
            gridCanvas.style.width = rect.width + 'px';
            gridCanvas.style.height = rect.height + 'px';
            if (state.gridCtx) {
                state.gridCtx.scale(dpr, dpr);
                updateGridCanvas();
            }

            // 更新超大橡皮擦预览层大小
            if (state.megaEraserPreviewCanvas) {
                state.megaEraserPreviewCanvas.width = rect.width * dpr;
                state.megaEraserPreviewCanvas.height = rect.height * dpr;
                state.megaEraserPreviewCanvas.style.width = rect.width + 'px';
                state.megaEraserPreviewCanvas.style.height = rect.height + 'px';
                if (state.megaEraserPreviewCtx) {
                    state.megaEraserPreviewCtx.scale(dpr, dpr);
                }
            }

            saveCurrentPage();
        }

        // --- 优化的绘制逻辑 ---
        function startDrawing(e) {
            const { x, y } = getCoordinates(e);

            // 图形绘制模式
            if (state.shapeMode) {
                state.shapeStartPoint = { x, y };
                state.isDrawing = true;
                return;
            }

            state.isDrawing = true;

            state.currentStrokePoints = [{x, y}];
            state.pendingPoints = [{x, y}];
            state.lastX = x;
            state.lastY = y;

            // 立即绘制起点
            state.ctx.beginPath();
            state.ctx.moveTo(x, y);
            state.ctx.lineTo(x, y);
            state.ctx.stroke();

            if (!state.isDrawingFrame) {
                state.isDrawingFrame = true;
                requestAnimationFrame(drawFrame);
            }
        }

        // --- 新增：平滑绘制笔迹的核心逻辑 ---
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

            // 循环遍历点，利用中点作为控制点进行二次贝塞尔曲线平滑
            for (let i = 1; i < points.length - 2; i++) {
                const xc = (points[i].x + points[i + 1].x) / 2;
                const yc = (points[i].y + points[i + 1].y) / 2;
                state.ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
            }

            // 连接最后两个点
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

            // 图形绘制模式 - 完成绘制
            if (state.shapeMode && state.shapeStartPoint && e) {
                const { x, y } = getCoordinates(e);
                finishShapeDraw(x, y);
                state.isDrawing = false;
                return;
            }

            state.isDrawing = false;

            // 画笔模式：分析笔画并保存历史
            if (state.tool === 'pen' && state.currentStrokePoints.length > 2) {
                // 先回退到这一笔开始前的状态，清除粗糙的手绘线
                redrawPreviousContent();

                // 先分析是否需要自动替换成直线/圆
                const converted = analyzeAndConvertStroke(state.currentStrokePoints);
                
                // 只有没有被自动替换的笔画，才执行平滑重绘并保存历史
                if (!converted) {
                    state.ctx.globalCompositeOperation = 'source-over';
                    state.ctx.lineWidth = penConfig.currentSize;
                    state.ctx.strokeStyle = penConfig.currentColor;
                    state.ctx.lineCap = 'round';
                    state.ctx.lineJoin = 'round';
                    drawSmoothPath(state.currentStrokePoints);
                    pushHistory();
                }
            } else if (state.tool === 'eraser') {
                // 橡皮擦模式：保存擦除后的状态到历史记录
                pushHistory();
            } else if (state.tool === 'pen' && state.currentStrokePoints.length <= 2) {
                // 极短的笔触（点），直接存入历史
                pushHistory();
            }

            state.pendingPoints = [];
            state.lastX = null;
            state.lastY = null;
            state.ctx.closePath();
            state.ctx.beginPath();
            state.currentStrokePoints = [];
        }

        // --- 触摸事件 ---
        function handleTouchStart(e) {
            e.preventDefault();
            const rect = state.canvas.getBoundingClientRect();

            // 只有当这是第一根手指按下时，才执行全局初始化操作
            const isFirstFingerOverall = state.activeTouches.size === 0;

            if (isFirstFingerOverall) {
                closeAllMenus(); // 仅在第一根手指按下时关闭菜单
            }

            // --- 超大橡皮擦逻辑：仅在第一根手指按下、且当前为橡皮擦或笔工具时检测 ---
            // 希沃一体机红外触屏手掌/多指接触面积远大于普通指尖，据此触发超大橡皮擦
            if (isFirstFingerOverall && (state.tool === 'eraser' || state.tool === 'pen') && !state.isMegaEraser) {
                let totalTouchArea = 0;
                for (let i = 0; i < e.touches.length; i++) {
                    const t = e.touches[i];
                    const rx = t.radiusX || 0;
                    const ry = t.radiusY || 0;
                    if (rx > 0 && ry > 0) {
                        totalTouchArea += Math.PI * rx * ry;
                    } else {
                        // 触屏不报告接触半径时按普通指尖估算（半径约10px）
                        totalTouchArea += Math.PI * 10 * 10;
                    }
                }
                // 接触面积超限，或同时落下3根及以上手指（手掌特征），均判定为超大橡皮擦
                if (totalTouchArea > state.megaEraserThreshold || e.touches.length >= 3) {
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
                const x = touch.clientX - rect.left;
                const y = touch.clientY - rect.top;

                // 核心判断：只有在没有任何手指在绘图时，这根新手指才被赋予“绘图权”
                // 这样即使后面有新手指加入，它们的 isDrawing 也会是 false
                const canStartDrawing = isFirstFingerOverall && i === 0; 

                state.activeTouches.set(touchId, {
                    lastX: x,
                    lastY: y,
                    isDrawing: canStartDrawing, 
                    points: [{x, y}],
                    pendingPoints: [{x, y}],
                    historyPushed: false,
                    isShapeMode: canStartDrawing && !!state.shapeMode
                });

                if (canStartDrawing) {
                    state.isDrawing = true; // 仅为合法绘图手指开启全局开关
                    state.ctx.beginPath();
                    state.ctx.moveTo(x, y);
                    state.ctx.lineTo(x, y);
                    state.ctx.stroke();
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

                // 只有【正在绘图的手指】抬起时，才执行保存历史、图形转换等逻辑
                if (touchState.isDrawing) {
                    if (touchState.isShapeMode && state.shapeMode && state.shapeStartPoint) {
                        // 图形绘制模式（圆/直线/虚线）：完成绘制并落笔
                        finishShapeDraw(touchState.lastX, touchState.lastY);
                    } else if (state.tool === 'pen') {
                        // 触屏抬手后才移除原始折线，并统一执行平滑与自动校正
                        redrawPreviousContent();
                        const converted = analyzeAndConvertStroke(touchState.points);
                        if (!converted) {
                            state.ctx.globalCompositeOperation = 'source-over';
                            state.ctx.lineWidth = penConfig.currentSize;
                            state.ctx.strokeStyle = penConfig.currentColor;
                            state.ctx.lineCap = 'round';
                            state.ctx.lineJoin = 'round';
                            drawSmoothPath(touchState.points);
                            pushHistory();
                        }
                    } else if (state.tool === 'eraser' || state.isMegaEraser) {
                        // 橡皮擦模式（含超大橡皮擦）：保存擦除后的状态
                        pushHistory();
                    }

                    // 重点：既然绘图手指离开了，全局绘制状态才结束
                    state.isDrawing = false;
                }

                // 移除当前结束的触控记录
                state.activeTouches.delete(touchId);
            }

            // 只有当屏幕上彻底没有手指时，才清理预览层
            if (e.touches.length === 0) {
                setTimeout(() => {
                    clearMegaEraserPreview();
                    if (state.megaEraserPreviewCanvas) {
                        state.megaEraserPreviewCanvas.classList.remove('active');
                    }
                    // 如果曾进入超大橡皮擦，此时才彻底恢复（保持橡皮擦工具不变）
                    if (state.isMegaEraser) {
                        state.eraserRadius = state.normalEraserRadius;
                        state.isMegaEraser = false;
                        container.classList.remove('mega-eraser-active');
                    }
                }, 50);
            }
        }



        // 修改 analyzeAndConvertStroke 返回是否成功替换
        function analyzeAndConvertStroke(points) {
            if (!state.autoCorrectionEnabled) return false;
            if (points.length < 3) return false;

            const start = points[0];
            const end = points[points.length - 1];
            const length = Math.sqrt((end.x - start.x) ** 2 + (end.y - start.y) ** 2);

            // 仅在笔画足够长时考虑直线替换
            if (length > 160) {
                const isLine = isCloseToLine(points, 15);
                if (isLine) {
                    // 清除刚才手绘的内容 (已经被 redrawPreviousContent() 覆盖了, 这里可以保留重绘逻辑以防万一)
                    state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
                    redrawPreviousContent();
                    // 绘制直线
                    drawLine(start.x, start.y, end.x, end.y);
                    // 保存直线端点信息用于吸附
                    state.lines.push({
                        x1: start.x,
                        y1: start.y,
                        x2: end.x,
                        y2: end.y
                    });
                    // 保存新状态到历史
                    pushHistory();
                    return true;
                }
            }

            const circle = fitCircle(points);
            // 圆半径必须大于阈值才替换
            if (circle && circle.radius > 120) {
                const isCircle = isCloseToCircle(points, circle, 80);
                if (isCircle) {
                    // 清除刚才手绘的内容
                    state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
                    redrawPreviousContent();
                    // 绘制圆形
                    drawCircle(circle.centerX, circle.centerY, circle.radius);
                    // 保存新状态到历史
                    pushHistory();
                    return true;
                }
            }

            return false;
        }

        function redrawPreviousContent() {
            // 即使没有历史记录，也必须先清除本次绘制的原始笔迹。
            state.ctx.clearRect(0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);

            if (state.historyStep >= 0 && state.history.length > 0) {
                const previousCanvas = state.history[state.historyStep];
                state.ctx.drawImage(previousCanvas, 0, 0, state.canvas.width / state.dpr, state.canvas.height / state.dpr);
            }
        }
