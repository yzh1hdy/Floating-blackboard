function handleMouseClick() {
    if (typeof setTool === 'function') {
        setTool('mouse');
        if (typeof closePenMenu === 'function' && state.penMenuOpen) closePenMenu(false);
    }
}
function handleMouseTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handleMouseClick();
}

function getToolbarRect() {
    var tb = document.getElementById('toolbar');
    if (!tb || tb.classList.contains('toolbar-collapsed')) return null;
    var r = tb.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
}
// 收集全部可见工具栏区域（主工具栏 + 左下/右下翻页工具栏 + 收起后的展开按钮）；
// display:none 或收起隐藏时 getBoundingClientRect 宽高为 0，自动被过滤。
function getToolbarRects() {
    var list = [];
    function push(el) {
        if (!el) return;
        var r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return;
        list.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
    var tb = document.getElementById('toolbar');
    if (tb && !tb.classList.contains('toolbar-collapsed')) push(tb);
    push(document.getElementById('pageTurnLeft'));
    push(document.getElementById('pageTurnRight'));
    var expBtn = document.getElementById('expandToolbarBtn');
    if (expBtn && expBtn.style.display !== 'none') push(expBtn);
    return list;
}
function showWebViewError() {
    var el = document.getElementById('webviewErrorScreen');
    if (el) el.style.display = 'flex';
}
function postToHost(msg) {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(JSON.stringify(msg));
    } else {
        console.log('Host message sent (webview not available)', msg);
        showWebViewError();
    }
}
function enableMousePassthrough() {
    if (typeof state !== 'undefined') state.mousePassthrough = true;
    var msg = {
        type: 'setMousePassthrough',
        enabled: true,
        dpr: window.devicePixelRatio || 1
    };
    var rect = getToolbarRect();
    if (rect) msg.toolbar = rect;
    var rects = getToolbarRects();
    if (rects.length) msg.toolbars = rects;
    postToHost(msg);
}
function disableMousePassthrough() {
    if (typeof state !== 'undefined') {
        state.mousePassthrough = false;
        state.passthroughBlockCount = 0;
    }
    postToHost({ type: 'setMousePassthrough', enabled: false });
}

// 通知 C# HTML 当前是否为透明模式（C# 依据该状态执行相应操作，后续功能补充）
function notifyTransparentMode() {
    if (typeof state === 'undefined') return;
    postToHost({ type: 'setTransparentMode', enabled: !!state.transparentMode });
}

// 打开覆盖层时临时挂起穿透，全部关闭后恢复，避免点击落到桌面
function suspendMousePassthrough() {
    if (typeof state === 'undefined' || !state.mousePassthrough) return;
    state.passthroughBlockCount = (state.passthroughBlockCount || 0) + 1;
    if (state.passthroughBlockCount === 1) {
        postToHost({ type: 'setMousePassthrough', enabled: false });
    }
}
function resumeMousePassthrough() {
    if (typeof state === 'undefined' || !state.mousePassthrough) return;
    state.passthroughBlockCount = Math.max(0, (state.passthroughBlockCount || 0) - 1);
    if (state.passthroughBlockCount === 0) {
        enableMousePassthrough();
    }
}

// 工具栏收起/展开只更新“工具栏豁免区”几何，不改变全局穿透开关与挂起计数。
// delay 用于等待 CSS 滑动过渡结束，避免立即取到动画中间位置的错误矩形。
var toolbarPassthroughRefreshTimer = null;
// PPT 批注态收起工具栏时记录的穿透状态快照：收起期间强制穿透，展开后恢复为收起前状态
var collapsedPassthroughSnapshot = null;
function refreshPassthroughForToolbarLayout(delay) {
    if (typeof state === 'undefined') return;
    if (toolbarPassthroughRefreshTimer) {
        clearTimeout(toolbarPassthroughRefreshTimer);
        toolbarPassthroughRefreshTimer = null;
    }
    var apply = function () {
        toolbarPassthroughRefreshTimer = null;
        // 弹窗/PPT 批注书写等挂起场景要求鼠标留在白板内，收起工具栏不得误切回全局穿透
        if ((state.passthroughBlockCount || 0) > 0) {
            postToHost({ type: 'setMousePassthrough', enabled: false });
            return;
        }
        if (state.mousePassthrough && typeof enableMousePassthrough === 'function') {
            enableMousePassthrough();
        }
    };
    if (delay > 0) toolbarPassthroughRefreshTimer = setTimeout(apply, delay);
    else apply();
}

if (window.chrome && window.chrome.webview) {
    window.chrome.webview.addEventListener('message', function (event) {
        var msg = event.data;
        if (typeof msg === 'string') {
            try { msg = JSON.parse(msg); } catch (_) { return; }
        }
        if (!msg || msg.type !== 'passthroughPointer') return;
        var target = document.elementFromPoint(Number(msg.x) || 0, Number(msg.y) || 0);
        if (!target) return;
        var button = msg.button === 'right' ? 2 : msg.button === 'middle' ? 1 : 0;
        var init = { bubbles: true, cancelable: true, composed: true,
            clientX: Number(msg.x) || 0, clientY: Number(msg.y) || 0,
            button: button, buttons: msg.action === 'up' ? 0 : 1 };
        if (typeof PointerEvent === 'function') {
            target.dispatchEvent(new PointerEvent('pointer' + msg.action, Object.assign(init, {
                pointerId: 1, pointerType: 'mouse', isPrimary: true
            })));
        }
        target.dispatchEvent(new MouseEvent('mouse' + msg.action, init));
        // 覆盖窗只转发 down/move/up，不转发 click；内联 onclick 依赖 click，故在 up 时补发
        if (msg.action === 'up' && button === 0) {
            target.dispatchEvent(new MouseEvent('click', init));
        }
    });
}

function handlePenTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handlePenClick();
}
function handleEraserTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handleEraserClick();
}
function handleUndoTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    undo();
}
function handleClearTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    confirmClear();
}
function handleMoreTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handleMoreClick(e);
}
function handleLotteryTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    showLottery();
}
// 收起工具栏：主工具栏向下滑出屏幕底部，底部中间显示展开按钮（PPT 批注模式替换“更多”按钮）
function collapseToolbar() {
    var tb = document.getElementById('toolbar');
    var btn = document.getElementById('expandToolbarBtn');
    if (!tb) return;
    tb.classList.add('toolbar-collapsed');
    document.body.classList.add('toolbar-collapsed');
    if (btn) btn.style.display = 'flex';

    var inPpt = typeof state !== 'undefined' && !!state && !!state.pptActive;
    if (inPpt) {
        // PPT 批注模式：不论当前是笔/橡皮/鼠标何种工具，收起工具栏一律强制开启点击穿透；
        // 豁免区只上报“展开工具栏”按钮（主工具栏带 collapsed 类、翻页钮被 CSS 隐藏，getToolbarRects 自动过滤），
        // 即除展开按钮位置外其余区域全部穿透到下层放映窗口。收起前的穿透状态在展开时原样恢复。
        collapsedPassthroughSnapshot = {
            wasPassthrough: !!state.mousePassthrough,
            blockCount: state.passthroughBlockCount || 0
        };
        state.collapsedForcedPassthrough = true;
        state.passthroughBlockCount = 0;
        enableMousePassthrough();
    } else {
        collapsedPassthroughSnapshot = null;
        state.collapsedForcedPassthrough = false;
        // 收起后只重算豁免区（展开按钮），保持原有穿透/挂起状态
        refreshPassthroughForToolbarLayout(0);
    }
}
// 展开工具栏：工具栏滑回，隐藏展开按钮；PPT 批注态下恢复收起前的穿透状态
function expandToolbar() {
    var tb = document.getElementById('toolbar');
    var btn = document.getElementById('expandToolbarBtn');
    if (!tb) return;
    tb.classList.remove('toolbar-collapsed');
    document.body.classList.remove('toolbar-collapsed');
    if (btn) btn.style.display = 'none';

    if (collapsedPassthroughSnapshot) {
        var snap = collapsedPassthroughSnapshot;
        collapsedPassthroughSnapshot = null;
        state.collapsedForcedPassthrough = false;
        if (snap.blockCount > 0) {
            // 收起前存在打开中的覆盖层（弹窗/菜单等挂起场景）：保持非穿透并还原挂起计数
            state.passthroughBlockCount = snap.blockCount;
            postToHost({ type: 'setMousePassthrough', enabled: false });
        } else if (snap.wasPassthrough) {
            // 收起前穿透开启：保持开启，等待工具栏滑回（0.3s 过渡）后用完整工具栏矩形重新上报
            state.passthroughBlockCount = 0;
            if (toolbarPassthroughRefreshTimer) {
                clearTimeout(toolbarPassthroughRefreshTimer);
                toolbarPassthroughRefreshTimer = null;
            }
            toolbarPassthroughRefreshTimer = setTimeout(function () {
                toolbarPassthroughRefreshTimer = null;
                if (typeof state !== 'undefined' && state.mousePassthrough &&
                    typeof enableMousePassthrough === 'function') {
                    enableMousePassthrough();
                }
            }, 320);
        } else {
            // 收起前未开启穿透（笔/橡皮工具）：立即关闭穿透，移除全部豁免覆盖窗
            disableMousePassthrough();
        }
    } else {
        // 等待工具栏滑回（0.3s 过渡）后再上报真实矩形，避免覆盖窗停留在旧位置
        refreshPassthroughForToolbarLayout(320);
    }
}
function handleCollapseTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    collapseToolbar();
}
function handleExpandTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    expandToolbar();
}
function handlePrevPageTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    if (state.doublePageMode) { if (typeof doublePagePrev === 'function') doublePagePrev(); return; }
    if (state.currentPage > 0) {
        goToPage(state.currentPage - 1);
    }
}
function handleNextPageTouch(e) {
    e.preventDefault();
    e.stopPropagation();
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
}

let touchHandled = false;
let touchMoved = false;
let touchStartY = 0;
function handleTouchStartBtn(e) {
    touchHandled = true;
    touchMoved = false;
    touchStartY = e.touches[0].clientY;
}
function handleTouchMoveBtn(e) {
    if (touchHandled) {
        const touchY = e.touches[0].clientY;
        if (Math.abs(touchY - touchStartY) > 10) {
            touchMoved = true;
        }
    }
}
function handleTouchEndBtn(e) {
    if (touchHandled && !touchMoved) {
        touchHandled = false;
        e.preventDefault();
        e.stopPropagation();
        const btn = e.currentTarget;
        if (btn && btn.onclick) {
            btn.onclick.call(btn, e);
        }
    }
}

// 液态玻璃工具栏：高亮胶囊跟随。指针系统只负责滑块，不 preventDefault，
// 按钮动作仍由内联 onclick/ontouchstart 驱动，避免按钮点击失效。
var glassToolbar = document.getElementById('toolbar');
var glassHighlight = document.getElementById('toolHighlight');
// 滑块横向宽度固定为 CSS 定义值（78px）；横向压缩按钮后滑块仍保持该宽度，
// 停在按钮上时左右会探到相邻按钮。竖直布局（函数绘图器）下取按钮实际宽度。
var glassHighlightCssW = glassHighlight ? (parseFloat(getComputedStyle(glassHighlight).width) || 78) : 78;
var glassToolBtnMap = { mouse: 'tool-mouse', pen: 'tool-pen', eraser: 'tool-eraser' };

var glassStateBtnIds = { 'tool-mouse': 1, 'tool-pen': 1, 'tool-eraser': 1 };

var glassBtnList = glassToolbar ? Array.prototype.slice.call(glassToolbar.querySelectorAll('.tool-btn')) : [];
var glassCurIdx = 0, glassTargetIdx = 0, glassPrevIdx = 0, glassRaf = 0;
var glassPointerId = null, glassPressBtn = null;

function getGlassActiveToolBtn() {
    var tool = ((typeof state !== 'undefined' && state.tool) || (window.state && window.state.tool)) || 'pen';
    var id = glassToolBtnMap[tool];
    var btn = id ? document.getElementById(id) : null;
    return btn || document.getElementById('tool-pen');
}

function glassHighlightWidth() {
    if (glassIsVerticalLayout()) {
        // 竖直布局（函数绘图器）：滑块宽度固定约 52px
        return 52;
    }
    return glassHighlightCssW;
}

function moveGlassHighlightTo(btn) {
    if (!btn || !glassHighlight || !glassToolbar) return;
    var tb = glassToolbar.getBoundingClientRect();
    var bb = btn.getBoundingClientRect();
    var bl = glassToolbar.clientLeft || 0;
    var bt = glassToolbar.clientTop || 0;
    var w = glassHighlightWidth();
    var L = bb.left + (bb.width - w) / 2 - tb.left - bl;
    // 上下居中：顶对齐的基础上再上移 3px，使 +6px 高度在上、下各扩展 3px（相对上次各边再 +2px）
    var T = bb.top - tb.top - bt - 3;
    glassHighlight.style.left = L + 'px';
    glassHighlight.style.top = T + 'px';
    glassHighlight.style.width = w + 'px';
    // 高度 = 按钮高度 + 6px（上下各 +2px，与 CSS .tool-highlight 的 56px 一致）
    glassHighlight.style.height = (bb.height + 6) + 'px';
    glassHighlight.style.opacity = '1';
    setKnockoutVars(L, T, w, bb.height + 6);
}

// 把滑块位置/尺寸同步到 CSS 变量（--sel-*），供反色图标层 mask 挖孔使用
function setKnockoutVars(L, T, W, H) {
    if (!glassToolbar) return;
    glassToolbar.style.setProperty('--sel-x', L + 'px');
    glassToolbar.style.setProperty('--sel-y', T + 'px');
    glassToolbar.style.setProperty('--sel-w', W + 'px');
    glassToolbar.style.setProperty('--sel-h', H + 'px');
}

function updateToolHighlight() {
    if (!glassHighlight || !glassToolbar) return;
    var activeBtn = getGlassActiveToolBtn();
    moveGlassHighlightTo(activeBtn);
    // 取消 rAF，避免切换后动画与直接定位打架
    var activeIdx = glassIndexOf(activeBtn);
    if (glassRaf) { cancelAnimationFrame(glassRaf); glassRaf = 0; }
    glassCurIdx = glassTargetIdx = activeIdx;
    glassPrevIdx = activeIdx;
    for (var i = 0; i < glassBtnList.length; i++) {
        glassBtnList[i].classList.toggle('tool-active', glassBtnList[i] === activeBtn);
    }
}

function glassIndexOf(btn) {
    for (var i = 0; i < glassBtnList.length; i++) {
        if (glassBtnList[i] === btn) return i;
    }
    return -1;
}
function glassIsStateBtn(btn) {
    return !!btn && !!glassStateBtnIds[btn.id];
}

// 工具栏当前是否竖直排列（函数绘图器批注模式下，工具栏在右侧垂直显示）
function glassIsVerticalLayout() {
    if (!glassToolbar) return false;
    var r = glassToolbar.getBoundingClientRect();
    return r.height > r.width;
}

// 由 clientX/clientY 反查按钮序号；clamp 时钳制到最近按钮（拖到间隙也跟随，不跳首尾）。
// 竖直布局下所有按钮的 X 范围相同，必须按 Y 轴匹配，否则任何点击都会命中第一个按钮。
function glassIdxFromX(clientX, clamp, clientY) {
    var vertical = glassIsVerticalLayout();
    if (glassBtnList.length === 0) return -1;
    for (var i = 0; i < glassBtnList.length; i++) {
        var r = glassBtnList[i].getBoundingClientRect();
        if (vertical) {
            if (clientY !== undefined && clientY >= r.top && clientY < r.bottom) return i;
        } else {
            if (clientX >= r.left && clientX < r.right) return i;
        }
    }
    if (clamp) {
        var best = 0, bestDist = Infinity;
        for (var i = 0; i < glassBtnList.length; i++) {
            var rr = glassBtnList[i].getBoundingClientRect();
            var d;
            if (vertical) {
                var cy = rr.top + rr.height / 2;
                d = Math.abs(clientY - cy);
            } else {
                var c = rr.left + rr.width / 2;
                d = Math.abs(clientX - c);
            }
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return best;
    }
    return -1;
}

function glassSetTarget(idx) {
    if (idx < 0) idx = 0;
    if (idx > glassBtnList.length - 1) idx = glassBtnList.length - 1;
    glassTargetIdx = idx;
    if (!glassRaf) glassRaf = requestAnimationFrame(glassAnimate);
}

// 逐帧趋近目标，按速度做拉长/压扁，到位精确吸附
function glassAnimate() {
    var diff = glassTargetIdx - glassCurIdx;
    var speed = Math.abs(glassCurIdx - glassPrevIdx);
    glassPrevIdx = glassCurIdx;
    var stretch = Math.min(1.22, 1 + speed * 3.2 * 0.22);
    var squash = Math.max(0.86, 1 - speed * 3.2 * 0.14);

    if (Math.abs(diff) <= 0.008) {
        glassCurIdx = glassTargetIdx;
        glassRaf = 0;
        stretch = 1;
        squash = 1;
    } else {
        glassCurIdx += diff * 0.18;
        glassRaf = requestAnimationFrame(glassAnimate);
    }

    var from = Math.floor(glassCurIdx);
    var to = Math.min(from + 1, glassBtnList.length - 1);
    var t = glassCurIdx - from;
    var r1 = glassBtnList[from].getBoundingClientRect();
    var r2 = glassBtnList[to].getBoundingClientRect();
    var tb = glassToolbar.getBoundingClientRect();
    var bl = glassToolbar.clientLeft || 0;
    var bt = glassToolbar.clientTop || 0;

    var hw = glassHighlightWidth();
    var L = r1.left + (r2.left - r1.left) * t + (r1.width - hw) / 2 - tb.left - bl;
    // 上下居中：顶对齐的基础上再上移 3px，使 +6px 高度在上、下各扩展 3px（相对上次各边再 +2px）
    var T = r1.top + (r2.top - r1.top) * t - tb.top - bt - 3;
    var W = hw;
    // 高度 = 按钮高度 + 6px（上下各 +2px，与 CSS .tool-highlight 的 56px 一致）
    var H = (r1.height + (r2.height - r1.height) * t) + 6;
    glassHighlight.style.left = L + 'px';
    glassHighlight.style.top = T + 'px';
    glassHighlight.style.width = W + 'px';
    glassHighlight.style.height = H + 'px';
    glassHighlight.style.transform = 'scale(' + stretch + ',' + squash + ')';
    glassHighlight.style.opacity = '1';
    // 挖孔跟随滑块运动时的拉伸/压扁：按 stretch/squash 缩放尺寸并围绕中心对齐
    var SW = W * stretch;
    var SH = H * squash;
    setKnockoutVars(L + (W - SW) / 2, T + (H - SH) / 2, SW, SH);
}

// 拖动到其他按钮松手时触发（拖动中浏览器不派发 click）。
// 拖到笔/橡皮直接用 setTool，不用 handlePenClick/handleEraserClick，
// 避免把"切换工具"误判为"再次点击"而打开设置菜单。
function glassSwitchByBtn(btn) {
    if (!btn) return;
    var id = btn.id;
    if (id === 'btn-undo' && typeof undo === 'function') undo();
    else if (id === 'btn-more') {
        // PPT 批注模式下“更多”已替换为收起工具栏行为
        if (typeof state !== 'undefined' && state && state.pptActive && typeof collapseToolbar === 'function') collapseToolbar();
        else if (typeof handleMoreClick === 'function') handleMoreClick();
    }
    else if (id === 'btn-lottery' && typeof showLottery === 'function') showLottery();
    else {
        var action = id.replace('tool-', '');
        if (action === 'mouse' && typeof handleMouseClick === 'function') handleMouseClick();
        else if (action === 'pen' && typeof setTool === 'function') setTool('pen');
        else if (action === 'eraser' && typeof setTool === 'function') setTool('eraser');
    }
}

(function bindGlassToolbar() {
    if (!glassToolbar || !glassHighlight) return;

    if (typeof window.setTool === 'function' && !window.__glassHighlightBound) {
        window.__glassHighlightBound = true;
        var origSetTool = window.setTool;
        window.setTool = function() {
            var result = origSetTool.apply(this, arguments);
            // 用动画滑到新工具，直接定位会瞬移
            glassSetTarget(glassIndexOf(getGlassActiveToolBtn()));
            // 同步当前选中按钮的 tool-active 标记，供透明模式"选中图标恢复原图"样式使用
            var actBtn = getGlassActiveToolBtn();
            for (var i = 0; i < glassBtnList.length; i++) {
                glassBtnList[i].classList.toggle('tool-active', glassBtnList[i] === actBtn);
            }
            return result;
        };
    }

    var glassDocMove = null, glassDocUp = null;

    function onDown(e) {
        var btn = e.target && e.target.closest ? e.target.closest('.tool-btn') : null;
        if (!btn) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (e.pointerType === 'touch' && e.isPrimary === false) return;
        // 穿透合成事件 pointerId 固定为 1，且覆盖窗可能丢失 up 导致旧监听器残留，每次先强制清理
        if (glassDocMove) { document.removeEventListener('pointermove', glassDocMove); glassDocMove = null; }
        if (glassDocUp) {
            document.removeEventListener('pointerup', glassDocUp);
            document.removeEventListener('pointercancel', glassDocUp);
            glassDocUp = null;
        }
        glassPointerId = e.pointerId;
        glassPressBtn = btn;
        glassSetTarget(glassIndexOf(btn));

        glassDocMove = function(ev) {
            if (ev.pointerId !== glassPointerId) return;
            glassSetTarget(glassIdxFromX(ev.clientX, true, ev.clientY));
        };
        glassDocUp = function(ev) {
            if (ev.pointerId !== glassPointerId) return;
            document.removeEventListener('pointermove', glassDocMove);
            document.removeEventListener('pointerup', glassDocUp);
            document.removeEventListener('pointercancel', glassDocUp);
            glassDocMove = glassDocUp = null;
            onUp(ev);
        };
        document.addEventListener('pointermove', glassDocMove);
        document.addEventListener('pointerup', glassDocUp);
        document.addEventListener('pointercancel', glassDocUp);
    }

    function onMove(e) {
    }

    function onUp(e) {
        glassPointerId = null;
        var hit = glassIdxFromX(e.clientX, false, e.clientY);
        var releaseBtn = (hit >= 0 && hit < glassBtnList.length) ? glassBtnList[hit] : null;

        if (glassPressBtn && releaseBtn && releaseBtn !== glassPressBtn) {
            glassSwitchByBtn(releaseBtn);
        }

        // 普通点击的 onclick 在 pointerup 之后才派发，状态型按钮用 rAF 延迟归位，避免闪回旧工具
        if (glassIsStateBtn(releaseBtn)) {
            requestAnimationFrame(function () {
                glassSetTarget(glassIndexOf(getGlassActiveToolBtn()));
            });
        } else {
            glassSetTarget(glassIndexOf(getGlassActiveToolBtn()));
        }
        glassPressBtn = null;
    }

    function onCancel(e) {
        if (e.pointerId !== glassPointerId) return;
        if (glassDocMove) { document.removeEventListener('pointermove', glassDocMove); glassDocMove = null; }
        if (glassDocUp) { document.removeEventListener('pointerup', glassDocUp); document.removeEventListener('pointercancel', glassDocUp); glassDocUp = null; }
        glassPointerId = null;
        glassPressBtn = null;
        glassSetTarget(glassIndexOf(getGlassActiveToolBtn()));
    }

    glassToolbar.addEventListener('pointerdown', onDown);

    window.addEventListener('resize', function() {
        updateToolHighlight();
    });

    updateToolHighlight();
})();

// 反色图标层：把各工具图标克隆进 #iconInvertLayer 并按原位对齐，
// 由 CSS mask 在滑块矩形处挖孔，露出下方原色图标（像素级跟随滑块）
var iconInvertLayer = document.getElementById('iconInvertLayer');
function syncIconInvertLayer() {
    if (!iconInvertLayer || !glassToolbar) return;
    while (iconInvertLayer.firstChild) iconInvertLayer.removeChild(iconInvertLayer.firstChild);
    var tb = glassToolbar.getBoundingClientRect();
    var bl = glassToolbar.clientLeft || 0;
    var bt = glassToolbar.clientTop || 0;
    var imgs = glassToolbar.querySelectorAll('.tool-btn img');
    for (var i = 0; i < imgs.length; i++) {
        var r = imgs[i].getBoundingClientRect();
        var clone = document.createElement('img');
        clone.src = imgs[i].src;
        clone.alt = imgs[i].alt || '';
        clone.style.left = (r.left - tb.left - bl) + 'px';
        clone.style.top = (r.top - tb.top - bt) + 'px';
        iconInvertLayer.appendChild(clone);
    }
}
if (iconInvertLayer && glassToolbar) {
    if (typeof ResizeObserver === 'function') {
        var iconRo = new ResizeObserver(function () { syncIconInvertLayer(); });
        iconRo.observe(glassToolbar);
    }
    syncIconInvertLayer();
}


