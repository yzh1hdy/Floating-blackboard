function saveCurrentPage() {
    if (!state.canvas) return;
    // 矢量模型：保存当前页的矢量笔画列表（拷贝，避免后续编辑改动已存页）
    state.pages[state.currentPage] = state.strokes.slice();
}

function loadPageVectors(pageIndex) {
    if (!state.ctx || !state.canvas) return;

    // 载入目标页的矢量笔画（拷贝，避免与已存页共享引用）
    state.strokes = (state.pages[pageIndex] || []).slice();
    state.undoStack = [];
    state.erasingNow = new Set();
    state.eraseFrags = null;
    renderAll();
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
    state.strokes = [];
    state.undoStack = [];
    state.erasingNow = new Set();
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
    pageIndicator.innerText = `${state.currentPage + 1}/${state.pages.length}`;
    document.getElementById('prevPageBtn').disabled = state.currentPage === 0;
}

// 矢量模型下不再使用位图快照历史；保留空函数以兼容潜在调用。
function pushHistory() {
    // no-op：历史由 state.undoStack 维护
}

// 压入撤销栈并施加撤回上限：超出上限时丢弃最旧记录，防止撤销栈无限增长
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
        // 移除刚添加的矢量笔画
        state.strokes = state.strokes.filter(s => s !== op.stroke);
    } else if (op.type === 'erase') {
        if (op.entries) {
            // 分段擦除：先移除本次生成的碎片，再按原始位置插回原笔画
            const fragSet = new Set();
            for (const e of op.entries) for (const f of e.frags) fragSet.add(f);
            state.strokes = state.strokes.filter(s => !fragSet.has(s));
            const sorted = op.entries.slice().sort((a, b) => a.origIndex - b.origIndex);
            for (const e of sorted) {
                state.strokes.splice(e.origIndex, 0, e.stroke);
            }
        } else if (op.removed) {
            // 兼容旧记录（整段擦除）
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

    // 动画结束后再清空像素，确保模糊渐隐过程可见。
    const finishClear = function() {
        canvas.classList.remove('canvas-clear-animating');
        state.strokes = [];
        state.undoStack = [];
        state.erasingNow = new Set();
        renderAll();
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

