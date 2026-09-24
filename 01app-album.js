// ============================================================
// 视频模式：拍照 / 相册
// - 拍照：抓取当前视频帧（按当前视频旋转方向烤入照片），交由 C# 存入 album 文件夹
// - 相册：右侧弹出照片列表（时间顺序，最新在最下），点击照片替换视频画面，
//   保留缩放/拖动；底部“清空相册”“返回相机”按钮
// 照片文件读写全部由 C# 完成，本文件只负责界面与消息通信。
// ============================================================
(function () {
    const cameraToolbar = document.getElementById('cameraToolbar');
    const albumPanel = document.getElementById('albumPanel');
    const albumListEl = document.getElementById('albumList');
    const photoView = document.getElementById('album-photo-view');
    const captureFlashEl = document.getElementById('captureFlash');

    // 相册照片缓存：[{name, label, url}]，C# 返回，已按时间升序，最新在最后
    let photos = [];
    let panelOpen = false;
    // 已发起拍照、等待 C# 回传结果（用于判断“第一次拍摄后自动打开相册”）
    let waitingForSaveResult = false;

    // 相册查看状态（动态挂到全局 state 上，供其他模块判断）
    state.albumViewing = false;

    // ---------- 与 C# 宿主通信 ----------
    function postToHost(obj) {
        if (window.chrome && window.chrome.webview) {
            window.chrome.webview.postMessage(JSON.stringify(obj));
        } else {
            console.log('Album host message (webview not available)', obj);
        }
    }
    function requestPhotoList() {
        postToHost({ type: 'listPhotos' });
    }

    // ---------- 拍照 ----------
    // 抓取视频当前帧，并按 state.videoRotation 顺时针旋转烤入，返回 JPEG dataURL
    function captureVideoFrame() {
        const vw = videoBackground.videoWidth;
        const vh = videoBackground.videoHeight;
        if (!vw || !vh) return null;

        const rot = ((state.videoRotation || 0) % 4 + 4) % 4;
        const canvas = document.createElement('canvas');
        if (rot === 1 || rot === 3) { canvas.width = vh; canvas.height = vw; }
        else { canvas.width = vw; canvas.height = vh; }

        const ctx = canvas.getContext('2d');
        if (rot === 1) { ctx.translate(vh, 0); ctx.rotate(Math.PI / 2); }
        else if (rot === 2) { ctx.translate(vw, vh); ctx.rotate(Math.PI); }
        else if (rot === 3) { ctx.translate(0, vw); ctx.rotate(-Math.PI / 2); }
        ctx.drawImage(videoBackground, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    // 相册查看态：把当前显示的照片（已是正确方向）原样导出
    function captureDisplayedPhoto() {
        if (!photoView.naturalWidth || !photoView.naturalHeight) return null;
        const canvas = document.createElement('canvas');
        canvas.width = photoView.naturalWidth;
        canvas.height = photoView.naturalHeight;
        canvas.getContext('2d').drawImage(photoView, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.92);
    }

    // 快门动画：页面变暗一下再恢复
    function playShutterFlash() {
        if (!captureFlashEl || !captureFlashEl.animate) return;
        captureFlashEl.animate([
            { opacity: 0 },
            { opacity: 0.45 },
            { opacity: 0 }
        ], { duration: 300, easing: 'ease-out' });
    }

    function capturePhoto() {
        let dataUrl = null;
        try {
            if (state.albumViewing) {
                dataUrl = captureDisplayedPhoto() || captureVideoFrame();
            } else {
                dataUrl = captureVideoFrame();
            }
        } catch (err) {
            console.warn('拍照失败:', err);
            return;
        }
        if (!dataUrl) {
            console.warn('拍照失败：视频画面尚未就绪');
            return;
        }
        playShutterFlash(); // 按下快门即变暗一下
        waitingForSaveResult = true;
        postToHost({ type: 'savePhoto', data: dataUrl });
    }

    // ---------- 相册照片布局 ----------
    // 照片显示容器（包裹层）固定为 16:9，按 contain 方式居中于屏幕；
    // photoView 填满该容器并以 object-fit: contain 显示照片——竖照/横照都在
    // 16:9 容器内完整显示（竖照两侧留空），不再做 CSS 旋转。
    function applyAlbumPhotoLayout() {
        if (!state.albumViewing || !photoView.classList.contains('show')) return false;

        const vw = window.innerWidth, vh = window.innerHeight;
        const aspect = 16 / 9;

        let w, h;
        if (vw / vh > aspect) { h = vh; w = vh * aspect; }
        else { w = vw; h = vw / aspect; }
        const rect = { x: (vw - w) / 2, y: (vh - h) / 2, width: w, height: h };

        // 包裹层定位到 16:9 可见矩形（与画布同矩形、同变换原点，跟随缩放/平移）
        videoWrap.style.left = rect.x + 'px';
        videoWrap.style.top = rect.y + 'px';
        videoWrap.style.width = rect.width + 'px';
        videoWrap.style.height = rect.height + 'px';

        // 照片元素填满容器，object-fit: contain 由 CSS 控制
        photoView.style.width = rect.width + 'px';
        photoView.style.height = rect.height + 'px';
        photoView.style.transform = 'translate(-50%, -50%)';
        photoView.style.objectFit = 'contain';
        photoView.style.objectPosition = 'center center';

        // 画布逻辑坐标原点对齐 16:9 容器矩形，保证标注与容器对齐
        state.videoRect = rect;
        return true;
    }

    // ---------- 列表项创建 ----------
    function createAlbumItem(p) {
        const item = document.createElement('button');
        item.className = 'album-item';
        item.dataset.name = p.name;
        const thumb = document.createElement('img');
        thumb.className = 'album-thumb';
        thumb.src = p.url;
        thumb.alt = '';
        thumb.draggable = false;
        thumb.onerror = function () { thumb.alt = '图片加载失败'; };
        const time = document.createElement('span');
        time.className = 'album-time';
        time.textContent = p.label || p.name;
        item.appendChild(thumb);
        item.appendChild(time);
        item.onclick = function () { showAlbumPhoto(p); };
        return item;
    }

    // ---------- 列表渲染（增量更新；animate=true 时播放“原项上移、新项出现”动画） ----------
    function renderAlbumList(animate) {
        // 1. 记录现有列表项的视口纵向位置（FLIP 的 First）
        const previousTops = new Map();
        albumListEl.querySelectorAll('.album-item').forEach(function (el) {
            previousTops.set(el.dataset.name, el.getBoundingClientRect().top);
        });

        //空列表
        if (!photos.length) {
            albumListEl.innerHTML = '';
            const empty = document.createElement('div');
            empty.className = 'album-empty';
            empty.textContent = '暂时没有照片喵~';
            albumListEl.appendChild(empty);
            return;
        }
        const oldEmpty = albumListEl.querySelector('.album-empty');
        if (oldEmpty) oldEmpty.remove();

        // 3. 删除已不存在的列表项
        const wantedNames = new Set(photos.map(function (p) { return p.name; }));
        Array.from(albumListEl.querySelectorAll('.album-item')).forEach(function (el) {
            if (!wantedNames.has(el.dataset.name)) el.remove();
        });

        // 4. 追加新增项、更新选中态
        photos.forEach(function (p) {
            let item = albumListEl.querySelector('.album-item[data-name="' + CSS.escape(p.name) + '"]');
            if (!item) {
                item = createAlbumItem(p);
                albumListEl.appendChild(item);
            }
            item.classList.toggle('selected',
                state.albumViewing && photoView.getAttribute('src') === p.url);
        });

        // 5. 先滚到底部（最新照片在最下），再做 FLIP（FLIP 的 Last）
        scrollListToBottom();

        if (!animate) return;
        albumListEl.querySelectorAll('.album-item').forEach(function (el) {
            const oldTop = previousTops.get(el.dataset.name);
            if (oldTop == null) {
                // 新增项：只做从下往上移动的动画（不缩放、不淡入）
                el.animate([
                    { transform: 'translateY(26px)' },
                    { transform: 'translateY(0)' }
                ], { duration: 340, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
            } else {
                // 原有项：从旧位置滑到新位置（整体上移）
                const delta = oldTop - el.getBoundingClientRect().top;
                if (Math.abs(delta) > 1) {
                    el.animate([
                        { transform: 'translateY(' + delta + 'px)' },
                        { transform: 'translateY(0)' }
                    ], { duration: 340, easing: 'cubic-bezier(0.2,0.8,0.2,1)' });
                }
            }
        });
    }

    // 列表滚动到底部（最新照片在最下）
    function scrollListToBottom() {
        albumListEl.scrollTop = albumListEl.scrollHeight;
    }

    // ---------- 面板开关 ----------
    function openAlbumPanel() {
        panelOpen = true;
        albumPanel.classList.add('show');
        requestPhotoList(); // 打开时拉取最新列表
        renderAlbumList(false); // 打开面板不播放新增动画
    }
    function closeAlbumPanel() {
        panelOpen = false;
        albumPanel.classList.remove('show');
    }
    function toggleAlbumPanel() {
        if (panelOpen) closeAlbumPanel();
        else openAlbumPanel();
    }

    // 立即清空画布（含标注）：按单位变换清空整块位图，再复位笔画数据。
    // 不依赖画布当前的缩放/平移变换，保证放大平移后也能清干净。
    function resetCanvasNow() {
        if (state.ctx && state.canvas) {
            state.ctx.save();
            state.ctx.setTransform(1, 0, 0, 1, 0, 0);
            state.ctx.clearRect(0, 0, state.canvas.width, state.canvas.height);
            state.ctx.restore();
        }
        state.strokes = [];
        state.undoStack = [];
        state.erasingNow = new Set();
        if (state.pages && typeof state.currentPage === 'number') {
            state.pages[state.currentPage] = null;
        }
    }

    // ---------- 查看照片 / 返回相机 ----------
    // 视频切到图片：重置画布，走完整布局管线（照片矩形/画布/视图全部重算并归位），
    // 视图归位保证照片方向与当前视频旋转不同时，画布上下文也按照片矩形刷新，笔迹不错位。
    function showAlbumPhoto(p) {
        if (!p || !p.url) return;

        state.albumViewing = true;
        photoView.classList.add('show');
        const onLoad = function () {
            photoView.removeEventListener('load', onLoad);
            // 照片加载完成：按真实宽高比重算布局（数据已清空，无需再清）
            if (typeof syncVideoLayout === 'function') syncVideoLayout();
        };
        photoView.addEventListener('load', onLoad);
        photoView.src = p.url;
        // 隐藏视频元素（摄像头流保持运行），由照片替换画面
        videoBackground.style.visibility = 'hidden';
        resetCanvasNow(); // 视频切到图片：重置画布
        // 兜底布局（照片未加载时用视频宽高比），同时把视图归位、变换烤进上下文
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
        renderAlbumList(false);
    }

    // 图片切到视频：重置画布，恢复视频完整布局并归位视图
    function returnToCamera() {
        if (!state.albumViewing && !photoView.classList.contains('show')) return;
        state.albumViewing = false;
        photoView.classList.remove('show');
        photoView.removeAttribute('src');
        videoBackground.style.visibility = '';
        // 完整视频布局：videoRect/画布/视频元素/视图全部按视频状态重算并归位
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
        resetCanvasNow(); // 图片切到视频：重置画布
        renderAlbumList(false);
    }

    function clearAlbum() {
        postToHost({ type: 'clearAlbum' });
    }

    // ---------- 短工具栏定位：紧贴主工具栏左侧 ----------
    function positionCameraToolbar() {
        if (!cameraToolbar.classList.contains('show')) return;
        const mainTb = document.getElementById('toolbar');
        const tr = mainTb.getBoundingClientRect();
        const w = cameraToolbar.offsetWidth;
        let left = tr.left - 10 - w;
        if (left < 10) left = 10; // 窄屏兜底，避免移出屏幕
        cameraToolbar.style.left = left + 'px';
        cameraToolbar.style.bottom = (window.innerHeight - tr.bottom) + 'px';
    }

    // ---------- 接收 C# 消息 ----------
    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            let msg = event.data;
            if (typeof msg === 'string') {
                try { msg = JSON.parse(msg); } catch (_) { return; }
            }
            if (!msg || msg.type !== 'photoList') return;

            // 仅当面板已开、DOM 中已有照片项时（即拍照新增场景）播放列表动画，
            // 避免首次打开面板时所有项一起播放“出现”动画
            const existingItemCount = albumListEl.querySelectorAll('.album-item').length;
            const animateAddition = panelOpen && existingItemCount > 0;

            // 是否为“第一次拍摄”：由本次拍照触发、且拍照前相册为空
            const isFirstCapture = waitingForSaveResult && photos.length === 0;
            photos = Array.isArray(msg.photos) ? msg.photos : [];
            waitingForSaveResult = false;
            renderAlbumList(animateAddition);

            // 完成第一次拍摄（相册由空变有图）后自动打开相册窗口
            if (isFirstCapture && photos.length > 0 && !panelOpen) {
                openAlbumPanel();
            }

            // 相册已被清空且正在查看照片：自动返回相机
            if (photos.length === 0 && state.albumViewing) {
                returnToCamera();
            }
        });
    }

    // ---------- 视频模式进出钩子（由 01app-menus.js 调用） ----------
    window.onVideoModeEntered = function () {
        cameraToolbar.classList.add('show');
        positionCameraToolbar();
        requestPhotoList();
    };
    window.onVideoModeExited = function () {
        if (state.switchingCamera) return; // 切换摄像头时不收起
        closeAlbumPanel();
        state.albumViewing = false;
        photoView.classList.remove('show');
        photoView.removeAttribute('src');
        videoBackground.style.visibility = '';
        cameraToolbar.classList.remove('show');
    };

    // ---------- 暴露给内联事件的全局函数 ----------
    window.capturePhoto = capturePhoto;
    window.toggleAlbumPanel = toggleAlbumPanel;
    window.returnToCamera = returnToCamera;
    window.clearAlbum = clearAlbum;
    window.applyAlbumPhotoLayout = applyAlbumPhotoLayout;

    // ---------- 窗口变化时重新定位短工具栏 ----------
    window.addEventListener('resize', function () {
        positionCameraToolbar();
    });
    window.addEventListener('load', function () {
        positionCameraToolbar();
    });
})();
//（注：内容由AI生成）
