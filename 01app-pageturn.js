// 翻页模式：透明模式下由 C# 检测到 powerpnt/easinote 运行时通知启用。
// 显示屏幕左下角/右下角两个工具栏，点击按钮通知 C# 对下层窗口发送按键。
(function () {
    var pageTurnActive = false;
    var pageTurnSeewo = false;

    function postToHostSafe(msg) {
        if (typeof postToHost === 'function') postToHost(msg);
    }

    // seewo（希沃白板）批注模式退出确认窗口：仅 seewo 状态下工具栏“退出”按钮触发，
    // 确认后才向下层希沃窗口发送退出动作；取消/关闭弹窗则不发送。
    // 弹窗显示期间临时挂起鼠标穿透，否则透明模式下点击会落到下层希沃窗口、弹窗无法操作。
    window.showSeewoExitConfirm = function () {
        if (typeof openPopup === 'function') openPopup('seewoExitConfirmOverlay', 'seewoExitConfirmPopup');
        if (typeof suspendMousePassthrough === 'function') suspendMousePassthrough();
    };
    window.closeSeewoExitConfirm = function () {
        if (typeof closePopup === 'function') closePopup('seewoExitConfirmOverlay', 'seewoExitConfirmPopup');
        if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();
    };
    window.confirmSeewoExit = function () {
        window.closeSeewoExitConfirm();
        postToHostSafe({ type: 'pageTurnAction', action: 'exit' });
    };
    window.handleSeewoExitOverlayClick = function (e) {
        if (e.target === document.getElementById('seewoExitConfirmOverlay')) window.closeSeewoExitConfirm();
    };

    // 显示/隐藏翻页工具栏（仅透明模式下有效，C# 只会透传该状态）
    function applyPageTurnVisibility(show) {
        var left = document.getElementById('pageTurnLeft');
        var right = document.getElementById('pageTurnRight');
        var disp = show ? 'flex' : 'none';
        if (left) left.style.display = disp;
        if (right) right.style.display = disp;
    }

    // 收到 C# 通知：启用/关闭翻页模式
    // seewo 为 true 表示希沃白板(easinote)窗口已打开，此时隐藏右侧翻页工具栏
    // （给 body 加 seewo-adjacent，CSS 负责隐藏右侧工具栏）。
    function setPageTurnMode(enabled, seewo) {
        // 非透明普通白板不进入翻页/PPT 批注态（与 C# 侧检测开关双保险）
        if (!(typeof state !== 'undefined' && state && state.transparentMode)) {
            enabled = false;
            seewo = false;
        }
        var wasActive = pageTurnActive;
        var wasSeewo = pageTurnSeewo;
        pageTurnActive = !!enabled;
        pageTurnSeewo = !!seewo;
        applyPageTurnVisibility(pageTurnActive);
        document.body.classList.toggle('seewo-adjacent', pageTurnActive && pageTurnSeewo);

        // PowerPoint 批注模式（启用且非希沃）：进入/退出逐页批注模式，驱动“更多→收起工具栏”按钮替换。
        // 希沃白板或关闭时退出批注模式，恢复普通白板状态。
        var pptTarget = pageTurnActive && !pageTurnSeewo;
        if (pptTarget) {
            if (typeof window.enterExtPpt === 'function') window.enterExtPpt();
        } else {
            if (typeof window.exitExtPpt === 'function') window.exitExtPpt();
        }
        // 翻页工具栏是新增的可点击区域；seewo 状态变化会使右侧翻页工具栏隐藏，
        // 工具栏几何位置随之改变。若鼠标穿透已开启，需把各工具栏最新位置重新上报给 C#，
        // 否则点击接收区停留在旧位置，会穿过落到下层程序。
        // 只要翻页启用/停用、或 seewo 状态变化导致几何改变，且穿透开启，就重新上报。
        if ((pageTurnActive !== wasActive || pageTurnSeewo !== wasSeewo) &&
            typeof state !== 'undefined' && state.mousePassthrough &&
            typeof enableMousePassthrough === 'function') {
            enableMousePassthrough();
        }
    }

    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            var msg = event.data;
            if (typeof msg === 'string') {
                try { msg = JSON.parse(msg); } catch (_) { return; }
            }
            if (!msg || msg.type !== 'pageTurnMode') return;
            setPageTurnMode(!!msg.enabled, !!msg.seewo);
        });
    }

    // 按钮动作：PPT 播放时直接控制 PPT（翻页/退出），否则通知 C# 对下层窗口发送按键（exit/left/right）
    window.pageTurnAction = function (action, e) {
        if (e) { e.preventDefault(); e.stopPropagation(); }
        if (typeof state !== 'undefined' && state.pptActive) {
            // PPT 批注模式：退出直接上报 C# 执行 View.Exit()，不再弹确认窗
            if (action === 'exit') {
                if (typeof window.pptExit === 'function') window.pptExit();
                return;
            }
            if (action === 'left' && typeof window.pptPrev === 'function') { window.pptPrev(); return; }
            if (action === 'right' && typeof window.pptNext === 'function') { window.pptNext(); return; }
            return;
        }
        // seewo（希沃白板）批注模式：退出按钮先弹确认窗口，确认后才向下层窗口发送退出动作
        if (action === 'exit' && pageTurnSeewo) {
            if (typeof showSeewoExitConfirm === 'function') { showSeewoExitConfirm(); }
            return;
        }
        postToHostSafe({ type: 'pageTurnAction', action: action });
    };

    // 触屏按下即触发（preventDefault 避免再派发 click 造成重复动作）
    window.pageTurnTouch = function (e) {
        e.preventDefault();
        e.stopPropagation();
        var action = e.currentTarget && e.currentTarget.getAttribute ? e.currentTarget.getAttribute('data-action') : null;
        if (action) window.pageTurnAction(action, e);
    };

    // 翻页模式下拦截进入 HTML 的所有键盘输入：方向键 / PgUp / PgDn 转发给下层窗口。
    // 仅在翻页模式启用时生效；其余按键放行，不干扰白板自身功能（如 Esc 收起等）。
    document.addEventListener('keydown', function (e) {
        if (!pageTurnActive) return;
        var action = null;
        switch (e.key) {
            case 'ArrowUp': action = 'up'; break;
            case 'ArrowDown': action = 'down'; break;
            case 'ArrowLeft': action = 'left'; break;
            case 'ArrowRight': action = 'right'; break;
            case 'PageUp': action = 'pageup'; break;
            case 'PageDown': action = 'pagedown'; break;
            default: return;
        }
        e.preventDefault();
        e.stopPropagation();
        postToHostSafe({ type: 'pageTurnAction', action: action });
    });

    // 退出透明模式时由菜单模块调用：复位翻页工具栏并退出 PPT 批注态
    window.resetPageTurnMode = function () { setPageTurnMode(false, false); };
})();
