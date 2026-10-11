function saveCurrentPage() {
    if (!state.canvas) return;
    if (state.doublePageMode) { saveDoublePageSpread(); return; }
    // 拷贝，避免后续编辑改动已存页
    state.pages[state.currentPage] = state.strokes.slice();
}

function loadPageVectors(pageIndex) {
    if (!state.ctx || !state.canvas) return;
    if (state.doublePageMode) { loadDoublePageSpread(); return; }

    state.strokes = (state.pages[pageIndex] || []).slice();
    state.undoStack = [];
    state.erasingNow = new Set();
    state.eraseFrags = null;
    if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
    renderAll();
}

function showPerfWarning() {
    state.pendingAddPage = true;
    openPopup('perfWarningOverlay', 'perfWarningPopup');
}

function closePerfModal() {
    closePopup('perfWarningOverlay', 'perfWarningPopup');
    state.pendingAddPage = false;
    state.pendingDoublePageAdd = false;
}

function confirmAddPage() {
    closePopup('perfWarningOverlay', 'perfWarningPopup');
    if (state.pendingDoublePageAdd) {
        state.pendingAddPage = false;
        state.pendingDoublePageAdd = false;
        // 双页模式：补建新页并前进到该组展开
        const P = state.currentPage + 1;
        if (state.pages[P + 1] === undefined) state.pages[P + 1] = null;
        doublePageGoTo(P);
    } else if (state.pendingAddPage) {
        state.pendingAddPage = false;
        addPage();
    }
}

function addPage() {
    saveCurrentPage();
    state.pages.push(null);
    state.currentPage = state.pages.length - 1;
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
    renderAll();
    updateUI();
}

function goToPage(index) {
    if (index < 0 || index >= state.pages.length) return;
    if (index === state.currentPage) return;

    saveCurrentPage();
    state.currentPage = index;
    loadPageVectors(state.currentPage);
    updateUI();
}

function updateUI() {
    if (state.doublePageMode) {
        // 双页模式：右侧为当前页(页面1)，左侧为下一页(页面2)，允许翻页
        pageIndicator.innerText = `${state.currentPage + 1}-${state.currentPage + 2}/${state.pages.length}`;
        document.getElementById('prevPageBtn').disabled = state.currentPage === 0;
        document.getElementById('nextPageBtn').disabled = false;
    } else {
        pageIndicator.innerText = `${state.currentPage + 1}/${state.pages.length}`;
        document.getElementById('prevPageBtn').disabled = state.currentPage === 0;
        document.getElementById('nextPageBtn').disabled = false;
    }
}

// 历史改由 state.undoStack 维护，保留空函数兼容潜在调用
function pushHistory() {
}

// 施加撤回上限，超出时丢弃最旧记录
function pushUndo(op) {
    state.undoStack.push(op);
    const limit = state.undoLimit || 100;
    if (state.undoStack.length > limit) {
        state.undoStack.splice(0, state.undoStack.length - limit);
    }
}


function undo() {
    const op = state.undoStack.pop();
    if (!op) return;

    if (op.type === 'add') {
        state.strokes = state.strokes.filter(s => s !== op.stroke);
    } else if (op.type === 'erase') {
        if (op.entries) {
            // 先移除本次碎片，再按原始位置插回原笔画
            const fragSet = new Set();
            for (const e of op.entries) for (const f of e.frags) fragSet.add(f);
            state.strokes = state.strokes.filter(s => !fragSet.has(s));
            const sorted = op.entries.slice().sort((a, b) => a.origIndex - b.origIndex);
            for (const e of sorted) {
                state.strokes.splice(e.origIndex, 0, e.stroke);
            }
        } else if (op.removed) {
            state.strokes.splice(op.insertAt, 0, ...op.removed);
        }
    }

    renderAll();
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

    // 动画结束后再清空像素，确保模糊渐隐可见
    const finishClear = function() {
        canvas.classList.remove('canvas-clear-animating');
        state.strokes = [];
        state.undoStack = [];
        state.erasingNow = new Set();
        if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
        renderAll();
    };

    canvas.addEventListener('animationend', finishClear, { once: true });
    closeClearModal();
}

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

// ===== 双页书写模式 =====
let doublePageMenuOpen = false;

// 点击页码部分：弹出/收起“双页书写”开关菜单
function toggleDoublePageMenu() {
    const menu = document.getElementById('doublePageMenu');
    if (!menu) return;
    if (doublePageMenuOpen) {
        closeDoublePageMenu();
    } else {
        if (typeof closeAllMenus === 'function') closeAllMenus(false);
        doublePageMenuOpen = true;
        menu.classList.add('show');
    }
}
function closeDoublePageMenu() {
    doublePageMenuOpen = false;
    const menu = document.getElementById('doublePageMenu');
    if (menu) menu.classList.remove('show');
}

// 点击开关：弹出提示，确认后切换模式
function toggleDoublePage() {
    closeDoublePageMenu();
    state.pendingDoublePage = !state.doublePageMode;
    openPopup('doublePageConfirmOverlay', 'doublePageConfirmPopup');
}
function handleDoublePageOverlayClick(e) {
    if (e.target === document.getElementById('doublePageConfirmOverlay')) closeDoublePageConfirm();
}
function closeDoublePageConfirm() {
    closePopup('doublePageConfirmOverlay', 'doublePageConfirmPopup');
    state.pendingDoublePage = false;
}
function confirmDoublePageToggle() {
    closePopup('doublePageConfirmOverlay', 'doublePageConfirmPopup');
    const enable = !!state.pendingDoublePage;
    state.pendingDoublePage = false;
    clearAllPages();
    if (enable) {
        // 双页模式初始为一组展开：右侧第1页 + 左侧第2页
        state.pages = [null, null];
        state.currentPage = 0;
    }
    setDoublePageMode(enable);
}

function setDoublePageMode(enable) {
    if (!enable && state.doublePageMode) {
        // 退出前把当前两页由“页面局部坐标”换算回屏幕坐标，作为单页保留显示
        flattenDoublePageToScreen();
    }
    state.doublePageMode = !!enable;
    const overlay = document.getElementById('doublePageOverlay');
    if (overlay) overlay.classList.toggle('active', !!enable);
    const sw = document.getElementById('doublePageSwitch');
    if (sw) sw.classList.toggle('active', !!enable);
    updateUI();
    renderAll();
}

// 开启透明/视频/函数绘图器模式时自动退出双页书写，回到现有单页模式
function exitDoublePageMode() {
    if (!state.doublePageMode) return;
    setDoublePageMode(false);
}

// 清空全部页面（切回单页/双页初始状态）
function clearAllPages() {
    state.pages = [null];
    state.currentPage = 0;
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
    if (state.ctx && state.canvas) {
        state.ctx.save();
        state.ctx.setTransform(1, 0, 0, 1, 0, 0);
        state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
        state.ctx.restore();
    }
    if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
    renderAll();
    updateUI();
}

// —— 双页翻页 / 保存 / 加载 ——
// 双页模式下每页笔画存“页面局部坐标”（x 范围 0~半屏宽），渲染时按 pg 平移到所在半屏：
//   右侧页(pg=1) 平移到右半屏，左侧页(pg=0) 落在左半屏。
// 翻页时页面内容坐标不变，只改变显示平移，因此内容始终跟随页面。
function doublePageOffsetX(pg) {
    return pg ? (window.innerWidth / 2) : 0;
}
function attachDoublePagePg(stroke) {
    if (stroke && state.doublePageMode) stroke.pg = state.activeDoublePage;
    return stroke;
}
function stripPg(s) {
    const c = Object.assign({}, s);
    delete c.pg;
    return c;
}
// 把当前展开的两页按 pg 拆回各自页面存储（页面局部坐标）
function saveDoublePageSpread() {
    const right = [];
    const left = [];
    for (const s of state.strokes) {
        if (s.pg === 1) right.push(stripPg(s));
        else left.push(stripPg(s));
    }
    state.pages[state.currentPage] = right;
    if (state.pages[state.currentPage + 1] === undefined) state.pages[state.currentPage + 1] = null;
    state.pages[state.currentPage + 1] = left;
}
// 从页面数组重建当前展开的两页（页面局部坐标）
function loadDoublePageSpread() {
    if (state.pages[state.currentPage + 1] === undefined) state.pages[state.currentPage + 1] = null;
    const right = (state.pages[state.currentPage] || []).map(s => Object.assign({}, s, { pg: 1 }));
    const left = (state.pages[state.currentPage + 1] || []).map(s => Object.assign({}, s, { pg: 0 }));
    state.strokes = right.concat(left);
    state.undoStack = [];
    state.erasingNow = new Set();
    state.eraseFrags = null;
    if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
    renderAll();
}
// 把一条笔画的 x 坐标整体平移 ox
function translateStrokeX(s, ox) {
    if (!ox) return;
    if (s.tool === 'circle') {
        s.cx += ox;
    } else if (s.tool === 'line' || s.tool === 'dashed') {
        s.x1 += ox;
        s.x2 += ox;
    } else if (s.points && s.points.length) {
        for (const p of s.points) p.x += ox;
    }
}
// 退出双页时，把当前展开两页由局部坐标换算回屏幕坐标写入页面，供单页模式继续使用
function flattenDoublePageToScreen() {
    if (!state.doublePageMode) return;
    const right = [];
    const left = [];
    for (const s of state.strokes) {
        const isRight = s.pg === 1;
        const c = stripPg(s);
        translateStrokeX(c, isRight ? doublePageOffsetX(1) : 0);
        if (isRight) right.push(c);
        else left.push(c);
    }
    state.pages[state.currentPage] = right;
    if (state.pages[state.currentPage + 1] === undefined) state.pages[state.currentPage + 1] = null;
    state.pages[state.currentPage + 1] = left;
    state.strokes = right.slice();
    state.undoStack = [];
    state.erasingNow = new Set();
    state.eraseFrags = null;
}
function doublePageGoTo(P) {
    if (P < 0 || P >= state.pages.length) return;
    if (P === state.currentPage) return;
    saveDoublePageSpread();
    state.currentPage = P;
    loadDoublePageSpread();
    updateUI();
}
// 下一页：右侧前进一页，左侧相应补建新页
function doublePageNext() {
    const P = state.currentPage + 1;
    if (P >= state.pages.length) return;
    // 双页模式翻到最后一组展开时补建新页，同样受软上限约束
    if (state.pages[P + 1] === undefined) {
        if (state.pages.length >= state.perfWarningThreshold) {
            state.pendingDoublePageAdd = true;
            showPerfWarning();
            return;
        }
        state.pages[P + 1] = null;
    }
    doublePageGoTo(P);
}
function doublePagePrev() {
    doublePageGoTo(state.currentPage - 1);
}

// 点击空白处关闭“双页书写”开关菜单
document.addEventListener('click', function (e) {
    if (!doublePageMenuOpen) return;
    if (!e.target.closest('#doublePageMenu') && !e.target.closest('#pageIndicator')) {
        closeDoublePageMenu();
    }
});

