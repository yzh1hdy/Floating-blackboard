// 鼠标按钮：作为状态型工具可选；选中后画板不落笔（防止误画），画笔菜单一并关闭
function handleMouseClick() {
    if (typeof setTool === 'function') {
        setTool('mouse');
        // setTool 已统一关闭所有菜单（含画笔菜单）；这里仅兜底处理仍开着的画笔菜单，
        // 且用无动画关闭，避免从其他工具切到鼠标时菜单闪一下关闭动画。
        if (typeof closePenMenu === 'function' && state.penMenuOpen) closePenMenu(false);
        // 【透明模式】开启鼠标穿透已统一收敛到 setTool（01app-canvas.js），这里不再重复通知
    }
}
function handleMouseTouch(e) {
    e.preventDefault();
    e.stopPropagation();
    handleMouseClick();
}

// --- 鼠标穿透（仅透明模式）：通知C#宿主开启/关闭点击穿透，工具栏位置一并上报以便豁免 ---
function getToolbarRect() {
    var tb = document.getElementById('toolbar');
    if (!tb) return null;
    var r = tb.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
}
function postToHost(msg) {
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.postMessage(JSON.stringify(msg));
    } else {
        console.log('Host message sent (webview not available)', msg);
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

// --- 穿透临时挂起/恢复：透明模式下打开“更多”菜单、抽奖结果、计时器等覆盖层时，
//     需临时取消点击穿透，避免点击落到桌面；覆盖层全部关闭后自动恢复穿透 ---
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
        enableMousePassthrough(); // 重新上报工具栏位置并恢复穿透
    }
}

// 独立工具栏覆盖窗把鼠标位置转回 HTML；在 WebView 内合成真实的指针/鼠标事件。
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
        // 【关键修复】穿透模式下覆盖窗只转发 down/move/up，不转发 click。
        // 内联 onclick 依赖 click 事件触发工具切换，这里在 up 时补发。
        if (msg.action === 'up' && button === 0) {
            target.dispatchEvent(new MouseEvent('click', init));
        }
    });
}

// --- 触摸处理函数（防止高DPI触屏上的滑动误触）---
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
    if (state.currentPage > 0) {
        goToPage(state.currentPage - 1);
    }
}
function handleNextPageTouch(e) {
    e.preventDefault();
    e.stopPropagation();
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

// --- 通用触摸按钮处理函数 ---
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
        // 阻止默认行为，防止click事件触发
        e.preventDefault();
        e.stopPropagation();
        // 触发点击
        const btn = e.currentTarget;
        if (btn && btn.onclick) {
            btn.onclick.call(btn, e);
        }
    }
}

// ====================== 液态玻璃工具栏：高亮跟随（指针事件版） ======================
// 参考 液态玻璃工具栏.html：高亮胶囊平滑滑动到当前工具/按下按钮上
// 用统一指针事件（鼠标/触屏/触控笔共用一套），修复触屏上 mouseenter/mouseleave 不生效的问题。
// 注意：此处【不 preventDefault】——按钮动作仍由 01.html 的内联 onclick/ontouchstart 驱动，
//       指针系统只负责滑块跟随，避免因拦截兼容鼠标事件导致按钮点击失效。
var glassToolbar = document.getElementById('toolbar');
var glassHighlight = document.getElementById('toolHighlight');
var glassToolBtnMap = { mouse: 'tool-mouse', pen: 'tool-pen', eraser: 'tool-eraser' };

// 状态型按钮（按下/松手后滑块停留）→ 瞬态按钮（撤回/更多/抽学号，按下时滑块划过来、松手弹回当前工具）
var glassStateBtnIds = { 'tool-mouse': 1, 'tool-pen': 1, 'tool-eraser': 1 };

var glassBtnList = glassToolbar ? Array.prototype.slice.call(glassToolbar.querySelectorAll('.tool-btn')) : [];
var glassCurIdx = 0, glassTargetIdx = 0, glassPrevIdx = 0, glassRaf = 0;
var glassPointerId = null, glassPressBtn = null;

function getGlassActiveToolBtn() {
    // state 是全局 const（不在 window 上），直接用 state.tool；兼容旧式 window.state
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
    // 同步动画状态，避免切换工具后 rAF 与直接定位打架
    var activeIdx = glassIndexOf(activeBtn);
    if (glassRaf) { cancelAnimationFrame(glassRaf); glassRaf = 0; }
    glassCurIdx = glassTargetIdx = activeIdx;
    glassPrevIdx = activeIdx;
    // 同步当前选中工具的图标状态
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

// 由 clientX 反查所在按钮序号。clamp=true 时钳制到最近按钮（供拖动跟随）；
// 否则精确命中（不在任何按钮上时返回 -1，供松手判定）。
// 修复：按钮间有间隙时，拖到间隙也应跟随到最近的按钮，而不是跳到首/尾。
function glassIdxFromX(clientX, clamp) {
    if (glassBtnList.length === 0) return -1;
    // 精确命中：在按钮矩形内
    for (var i = 0; i < glassBtnList.length; i++) {
        var r = glassBtnList[i].getBoundingClientRect();
        if (clientX >= r.left && clientX < r.right) return i;
    }
    if (clamp) {
        // 不在任何按钮内（间隙或边缘）：取最近的按钮中心
        var best = 0, bestDist = Infinity;
        for (var i = 0; i < glassBtnList.length; i++) {
            var rr = glassBtnList[i].getBoundingClientRect();
            var c = rr.left + rr.width / 2;
            var d = Math.abs(clientX - c);
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

// 逐帧动画：无过冲平滑趋近目标按钮，按帧速度做拉长/压扁形变；到位精确吸附
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

// 拖动滑块到其他按钮上松手时触发（拖动时浏览器不会派发 click，需在此处理）。
// 状态型按钮（鼠标/笔/橡皮）切换工具；瞬态按钮（撤回/更多/抽学号）触发对应功能。
// 注意：拖动到笔/橡皮时直接用 setTool 切换，不调用 handlePenClick/handleEraserClick，
//       避免把“切换工具”误判为“再次点击”而打开笔/橡皮设置菜单。
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

    // 工具切换后滑块跟随（保留 app-canvas.js 中 setTool 的原有逻辑）
    if (typeof window.setTool === 'function' && !window.__glassHighlightBound) {
        window.__glassHighlightBound = true;
        var origSetTool = window.setTool;
        window.setTool = function() {
            var result = origSetTool.apply(this, arguments);
            // 动画滑到新工具（不要用 updateToolHighlight 直接定位，否则切换会瞬移）
            glassSetTarget(glassIndexOf(getGlassActiveToolBtn()));
            return result;
        };
    }

    // 指针监听状态：按下后临时挂到 document，松手即解绑。
    // 【重要】不用 setPointerCapture——它会劫持兼容鼠标事件(click)到工具栏，
    //         导致按钮 onclick 失效。这里改为 document 级监听拖动/松手，
    //         真实点击的 click 仍正常派发到按钮，触发内联 onclick。
    var glassDocMove = null, glassDocUp = null;

    function onDown(e) {
        var btn = e.target && e.target.closest ? e.target.closest('.tool-btn') : null;
        if (!btn) return;
        if (e.pointerType === 'mouse' && e.button !== 0) return;   // 仅鼠标左键
        if (e.pointerType === 'touch' && e.isPrimary === false) return; // 仅主触点
        // 【修复】穿透模式下合成事件的 pointerId 固定为 1，且 C# 覆盖窗可能
        // 因快速点击丢失 up 转发，导致旧的 doc 监听器残留。
        // 每次新的 pointerdown 先强制清理，避免旧监听器干扰本次点击。
        if (glassDocMove) { document.removeEventListener('pointermove', glassDocMove); glassDocMove = null; }
        if (glassDocUp) {
            document.removeEventListener('pointerup', glassDocUp);
            document.removeEventListener('pointercancel', glassDocUp);
            glassDocUp = null;
        }
        glassPointerId = e.pointerId;
        glassPressBtn = btn;
        glassSetTarget(glassIndexOf(btn)); // 手/鼠标按到哪个按钮，滑块就划过来

        glassDocMove = function(ev) {
            if (ev.pointerId !== glassPointerId) return;
            glassSetTarget(glassIdxFromX(ev.clientX, true)); // 按住拖动：滑块跟随（钳制首尾）
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
        // 拖动跟随统一在 glassDocMove 里处理（需要 document 范围，确保手指移出按钮仍可跟随）
    }

    function onUp(e) {
        glassPointerId = null;
        var hit = glassIdxFromX(e.clientX, false);
        var releaseBtn = (hit >= 0 && hit < glassBtnList.length) ? glassBtnList[hit] : null;

        // 拖动到不同按钮上松手 → 状态型按钮切换工具，瞬态按钮（撤回/更多/抽学号）触发对应功能
        if (glassPressBtn && releaseBtn && releaseBtn !== glassPressBtn) {
            glassSwitchByBtn(releaseBtn);
        }

        // 滑块归位：状态型停在所选工具，瞬态按钮弹回当前工具。
        // 普通点击时 onclick 在 pointerup 之后才派发（setTool→updateToolHighlight），
        // 故状态型用 rAF 延迟归位，避免闪回旧工具。
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

    // 窗口尺寸变化时重新定位
    window.addEventListener('resize', function() {
        updateToolHighlight();
    });

    // 初始定位
    updateToolHighlight();
})();
//（注：内容由AI生成）

