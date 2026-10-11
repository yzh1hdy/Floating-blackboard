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
    if (!tb) return null;
    var r = tb.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
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
    postToHost(msg);
}
function disableMousePassthrough() {
    if (typeof state !== 'undefined') {
        state.mousePassthrough = false;
        state.passthroughBlockCount = 0;
    }
    postToHost({ type: 'setMousePassthrough', enabled: false });
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

function moveGlassHighlightTo(btn) {
    if (!btn || !glassHighlight || !glassToolbar) return;
    var tb = glassToolbar.getBoundingClientRect();
    var bb = btn.getBoundingClientRect();
    var bl = glassToolbar.clientLeft || 0;
    var bt = glassToolbar.clientTop || 0;
    glassHighlight.style.left = (bb.left - tb.left - bl) + 'px';
    glassHighlight.style.top = (bb.top - tb.top - bt) + 'px';
    glassHighlight.style.width = bb.width + 'px';
    glassHighlight.style.height = bb.height + 'px';
    glassHighlight.style.opacity = '1';
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

    glassHighlight.style.left = (r1.left + (r2.left - r1.left) * t - tb.left - bl) + 'px';
    glassHighlight.style.top = (r1.top + (r2.top - r1.top) * t - tb.top - bt) + 'px';
    glassHighlight.style.width = (r1.width + (r2.width - r1.width) * t) + 'px';
    glassHighlight.style.height = (r1.height + (r2.height - r1.height) * t) + 'px';
    glassHighlight.style.transform = 'scale(' + stretch + ',' + squash + ')';
    glassHighlight.style.opacity = '1';
}

// 拖动到其他按钮松手时触发（拖动中浏览器不派发 click）。
// 拖到笔/橡皮直接用 setTool，不用 handlePenClick/handleEraserClick，
// 避免把"切换工具"误判为"再次点击"而打开设置菜单。
function glassSwitchByBtn(btn) {
    if (!btn) return;
    var id = btn.id;
    if (id === 'btn-undo' && typeof undo === 'function') undo();
    else if (id === 'btn-more' && typeof handleMoreClick === 'function') handleMoreClick();
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
//（注：内容由AI生成）

