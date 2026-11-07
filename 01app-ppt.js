// PowerPoint 外部放映批注模块：
// C# 通过 COM（SlideShowView.Slide.SlideIndex）轮询真实放映窗口的页码，
// 经 pptSlide 消息通知 HTML；每一张幻灯片对应独立批注页（state.pptPages），
// 翻页时自动保存当前页笔迹并载入对应页笔迹，实现逐页单独批注。
// 翻页/退出统一上报 C#，由 COM View.Next() / Previous() / Exit() 控制放映窗口。
(function () {
    var active = false;

    function hasState() { return typeof state !== 'undefined' && !!state; }

    function postToHostSafe(msg) {
        if (typeof postToHost === 'function') postToHost(msg);
    }

    // —— 逐页批注：保存/载入当前幻灯片对应的独立笔迹 ——
    function saveCurrent() {
        if (!active || !hasState() || !state.pptPages) return;
        state.pptPages[state.pptCurrent] = state.strokes.slice();
    }

    function loadPage(index) {
        if (!hasState()) return;
        state.pptCurrent = index;
        state.strokes = (state.pptPages[index] || []).slice();
        state.undoStack = [];
        state.erasingNow = new Set();
        state.eraseFrags = null;
        if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
        if (typeof renderAll === 'function') renderAll();
    }

    // “更多”按钮在 PPT 批注模式下替换为“收起工具栏”图标与行为，退出时还原
    var moreBtn = null, moreImg = null, moreOnClick = null, moreTouch = null, moreTitle = null;
    // 收起按钮的 pointerdown 兜底监听（触屏/手写笔），退出批注态时移除
    var morePointerDown = null;
    function swapMoreButtonToCollapse() {
        moreBtn = document.getElementById('btn-more');
        if (!moreBtn) return;
        moreImg = document.getElementById('img-more');
        if (moreOnClick === null) {
            moreOnClick = moreBtn.onclick;
            moreTouch = moreBtn.ontouchstart;
            moreTitle = moreBtn.title;
        }
        if (moreImg) moreImg.src = 'icon/收起工具栏.png';
        // 鼠标 / 合成 click（含穿透覆盖窗转发的点击）走 onclick
        moreBtn.onclick = function (e) {
            if (e) { e.preventDefault(); e.stopPropagation(); }
            if (typeof collapseToolbar === 'function') collapseToolbar();
        };
        // 触屏 / 手写笔走 pointerdown 兜底：部分输入通道只合成 pointer 事件、不派发 touchstart，
        // 原先只绑 ontouchstart 导致触屏点了没反应；这里对 touch/pen 直接执行收起
        if (!morePointerDown) {
            morePointerDown = function (e) {
                if (!e || (e.pointerType !== 'touch' && e.pointerType !== 'pen')) return;
                if (e.cancelable) { e.preventDefault(); e.stopPropagation(); }
                if (typeof collapseToolbar === 'function') collapseToolbar();
            };
            moreBtn.addEventListener('pointerdown', morePointerDown);
        }
        moreBtn.title = '收起工具栏';
        // 反色图标层按按钮重建克隆，否则旧“更多”克隆图会盖在新图标上，表现为换图标无效
        if (typeof syncIconInvertLayer === 'function') syncIconInvertLayer();
    }
    function restoreMoreButton() {
        if (!moreBtn) return;
        if (morePointerDown) {
            moreBtn.removeEventListener('pointerdown', morePointerDown);
            morePointerDown = null;
        }
        if (moreImg) moreImg.src = 'icon/更多.png';
        moreBtn.onclick = moreOnClick;
        moreBtn.ontouchstart = moreTouch;
        moreBtn.title = moreTitle || '更多功能';
        if (typeof syncIconInvertLayer === 'function') syncIconInvertLayer();
    }

    function enterExtPpt(total) {
        if (active) return;
        // 进入前先保存当前白板普通页，退出时原样恢复
        if (typeof saveCurrentPage === 'function') { try { saveCurrentPage(); } catch (e) { } }

        active = true;
        if (hasState()) {
            state.pptActive = true;
            state.pptPages = {};
            state.pptCurrent = 1;
            state.pptTotal = total || 0;
            state.strokes = [];
            state.undoStack = [];
            state.erasingNow = new Set();
            state.eraseFrags = null;
            if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
            if (typeof renderAll === 'function') renderAll();
        }
        document.body.classList.add('ppt-active');
        swapMoreButtonToCollapse();
        // 页面元素若尚未渲染完成，下一帧再次确保按钮已切换为收起工具栏
        if (window.requestAnimationFrame) {
            window.requestAnimationFrame(swapMoreButtonToCollapse);
        }
        // 批注笔色自动切红，便于在浅色幻灯片上书写
        if (typeof setPenColor === 'function') {
            try { setPenColor('#ff1000', (typeof findColorBtn === 'function') ? findColorBtn('#ff1000') : null); } catch (e) { }
        }
        if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
        if (typeof updateUI === 'function') updateUI();
        if (typeof syncFunctionWidgets === 'function') syncFunctionWidgets();
    }

    function exitExtPpt() {
        if (!active) return;
        saveCurrent();
        active = false;
        if (hasState()) {
            state.pptActive = false;
            state.pptPages = null;
            state.pptCurrent = 0;
            state.pptTotal = 0;
            // 恢复普通白板当前页笔迹
            state.strokes = (state.pages && state.pages[state.currentPage])
                ? state.pages[state.currentPage].slice() : [];
            state.undoStack = [];
            state.erasingNow = new Set();
            state.eraseFrags = null;
            if (typeof resetNormalScrollY === 'function') resetNormalScrollY();
            if (typeof renderAll === 'function') renderAll();
            // 退出放映但仍处于透明叠加模式时：保留批注红色笔色，不切回白色；
            // 若由“关闭透明模式”流程退出，白色由 toggleTransparentMode 统一设置。
            if (typeof updateUI === 'function') updateUI();
        }
        document.body.classList.remove('ppt-active');
        restoreMoreButton();
        // 退出放映时若工具栏处于收起状态则恢复显示
        if (typeof expandToolbar === 'function') expandToolbar();
        // 退出批注态后自动切到鼠标工具（透明模式下随之恢复点击穿透）
        if (typeof setTool === 'function') {
            try { setTool('mouse'); } catch (e) { }
        }
        if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
        if (typeof updateUI === 'function') updateUI();
        if (typeof syncFunctionWidgets === 'function') syncFunctionWidgets();
    }

    // 仅透明叠加模式允许进入 PPT 批注态；非透明普通白板下即使收到进入信号也忽略并退出（双保险）
    function pptAllowed() {
        return typeof state !== 'undefined' && state && state.transparentMode;
    }

    // 接收 C# COM 轮询结果：active 表示放映进行中；index 为当前幻灯片页码（1 起），total 为总页数
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            var msg = event.data;
            if (typeof msg === 'string') {
                try { msg = JSON.parse(msg); } catch (_) { return; }
            }
            if (!msg) return;

            // C# 检测到 PowerPoint 目标（不依赖 COM 页码是否可取）：直接进入/退出批注模式
            if (msg.type === 'pptMode') {
                if (msg.seewo) { exitExtPpt(); return; }
                if (msg.enabled) {
                    if (pptAllowed()) enterExtPpt(msg.total || 0);
                    else exitExtPpt();
                    return;
                }
                exitExtPpt();
                return;
            }

            if (msg.type !== 'pptSlide') return;
            if (!msg.active) { exitExtPpt(); return; }
            if (!pptAllowed()) { exitExtPpt(); return; }
            enterExtPpt(msg.total || 0);
            if (hasState()) state.pptTotal = msg.total || state.pptTotal || 0;
            var rawIdx = msg.index != null ? msg.index
                : (msg.slideIndex != null ? msg.slideIndex : msg.position);
            var idx = Math.max(1, Number(rawIdx) || 1);
            if (idx !== state.pptCurrent) {
                saveCurrent();
                loadPage(idx);
            }
            if (typeof updateUI === 'function') updateUI();
        });
    }

    // 翻页/退出动作上报 C#，由 COM View.Next()/Previous()/Exit() 执行（pageturn.js 路由调用）
    window.pptPrev = function () { postToHostSafe({ type: 'pageTurnAction', action: 'left' }); };
    window.pptNext = function () { postToHostSafe({ type: 'pageTurnAction', action: 'right' }); };
    window.pptExit = function () { postToHostSafe({ type: 'pageTurnAction', action: 'exit' }); };

    // 暴露给翻页模块：C# 检测到 PowerPoint 放映（pageTurnMode 启用且非希沃）时直接进入批注模式，
    // 不依赖 COM 页码消息；COM 页码到位后再逐页加载对应笔迹。
    window.enterExtPpt = enterExtPpt;
    window.exitExtPpt = exitExtPpt;

    window.__pptReady = true;
})();
