// 视频模式：拍照 / 相册。照片文件读写全部由 C# 完成，本文件只负责界面与消息通信。
(function () {
    const cameraToolbar = document.getElementById('cameraToolbar');
    const albumPanel = document.getElementById('albumPanel');
    const albumListEl = document.getElementById('albumList');
    const photoView = document.getElementById('album-photo-view');

    // 相册照片缓存：[{name, label, url}]，C# 返回，已按时间升序，最新在最后
    let photos = [];
    let panelOpen = false;
    let waitingForSaveResult = false;
    let enterClipTimer = null;

    state.albumViewing = false;

    function getPhotoThumbUrl(p) {
        return (p && (p.thumbUrl || p.thumbnailUrl || p.url)) || '';
    }

    // 大图预览始终选择原图/最高分辨率版本；只有宿主未来单独提供缩略图时，
    // 列表才使用缩略图，避免预览放大时受到缩略图分辨率限制。
    function getPhotoFullUrl(p) {
        return (p && (p.fullUrl || p.originalUrl || p.url)) || '';
    }

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

    function capturePhoto() {
        // 正在查看相册图片时，拍照按钮只负责回到实时相机，避免把当前图片再拍一张。
        if (state.albumViewing) {
            returnToCamera();
            return;
        }

        let dataUrl = null;
        try {
            dataUrl = captureVideoFrame();
        } catch (err) {
            console.warn('拍照失败:', err);
            return;
        }
        if (!dataUrl) {
            console.warn('拍照失败：视频画面尚未就绪');
            return;
        }
        waitingForSaveResult = true;
        postToHost({ type: 'savePhoto', data: dataUrl });
    }

    // 照片显示容器固定为 16:9，photoView 以 object-fit: contain 填满，
    // 竖照/横照都完整显示，不再做 CSS 旋转。
    function applyAlbumPhotoLayout() {
        if (!state.albumViewing || !photoView.classList.contains('show')) return false;

        const vw = window.innerWidth, vh = window.innerHeight;
        const aspect = 16 / 9;

        let w, h;
        if (vw / vh > aspect) { h = vh; w = vh * aspect; }
        else { w = vw; h = w / aspect; }
        const rect = { x: (vw - w) / 2, y: (vh - h) / 2, width: w, height: h };

        videoWrap.style.left = rect.x + 'px';
        videoWrap.style.top = rect.y + 'px';
        videoWrap.style.width = rect.width + 'px';
        videoWrap.style.height = rect.height + 'px';

        photoView.style.width = rect.width + 'px';
        photoView.style.height = rect.height + 'px';
        photoView.style.transform = 'translate(-50%, -50%)';
        photoView.style.objectFit = 'contain';
        photoView.style.objectPosition = 'center center';

        state.videoRect = rect;
        return true;
    }

    function createAlbumItem(p) {
        const item = document.createElement('button');
        item.className = 'album-item';
        item.dataset.name = p.name;
        const thumb = document.createElement('img');
        thumb.className = 'album-thumb';
        thumb.src = getPhotoThumbUrl(p);
        thumb.alt = '';
        thumb.decoding = 'async';
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

    function renderAlbumList(animate) {
        const previousTops = new Map();
        albumListEl.querySelectorAll('.album-item').forEach(function (el) {
            previousTops.set(el.dataset.name, el.getBoundingClientRect().top);
        });

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

        const wantedNames = new Set(photos.map(function (p) { return p.name; }));
        Array.from(albumListEl.querySelectorAll('.album-item')).forEach(function (el) {
            if (!wantedNames.has(el.dataset.name)) el.remove();
        });

        photos.forEach(function (p) {
            let item = albumListEl.querySelector('.album-item[data-name="' + CSS.escape(p.name) + '"]');
            if (!item) {
                item = createAlbumItem(p);
                albumListEl.appendChild(item);
            }
            item.classList.toggle('selected',
                state.albumViewing && photoView.getAttribute('src') === getPhotoFullUrl(p));
        });

        if (!animate) {
            scrollListToBottom();
            return;
        }

        const animationOptions = {
            duration: 380,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            composite: 'replace'
        };

        // 入场动画期间，列表项的 translateY 位移会临时撑大可滚动区域，
        // 导致右侧滚动条指示错位（长列表同样受影响）。动画期间统一裁掉
        // 临时溢出，动画结束后恢复滚动并重新贴底，保证滑块位置正确。
        clearTimeout(enterClipTimer);
        albumListEl.classList.add('enter-clipping');
        scrollListToBottom();
        enterClipTimer = setTimeout(function () {
            albumListEl.classList.remove('enter-clipping');
            scrollListToBottom();
        }, animationOptions.duration + 20);

        albumListEl.querySelectorAll('.album-item').forEach(function (el) {
            const oldTop = previousTops.get(el.dataset.name);
            if (oldTop == null) {
                // 新照片从列表下方完整滑入，距离包含自身高度和列表间距。
                const enterDistance = el.offsetHeight + 12;
                el.animate([
                    { transform: 'translateY(' + enterDistance + 'px)', opacity: 0 },
                    { transform: 'translateY(0)', opacity: 1 }
                ], animationOptions);
            } else {
                const delta = oldTop - el.getBoundingClientRect().top;
                if (Math.abs(delta) > 1) {
                    el.animate([
                        { transform: 'translateY(' + delta + 'px)' },
                        { transform: 'translateY(0)' }
                    ], animationOptions);
                }
            }
        });
    }

    function scrollListToBottom() {
        albumListEl.scrollTop = albumListEl.scrollHeight;
    }

    function openAlbumPanel() {
        panelOpen = true;
        albumPanel.classList.add('show');
        requestPhotoList();
        renderAlbumList(false);
    }
    function closeAlbumPanel() {
        panelOpen = false;
        albumPanel.classList.remove('show');
    }
    function toggleAlbumPanel() {
        if (panelOpen) closeAlbumPanel();
        else openAlbumPanel();
    }

    // 按单位变换清空整块位图，再复位笔画数据；不依赖画布当前缩放/平移，放大平移后也能清干净。
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

    // 视频切到图片：重置画布并走完整布局管线，保证照片方向与视频旋转不同时笔迹不错位。
    function showAlbumPhoto(p) {
        const fullUrl = getPhotoFullUrl(p);
        if (!fullUrl) return;

        state.albumViewing = true;
        photoView.classList.add('show');
        photoView.dataset.name = p.name || '';
        photoView.loading = 'eager';
        photoView.decoding = 'sync';
        if ('fetchPriority' in photoView) photoView.fetchPriority = 'high';
        const onLoad = function () {
            photoView.removeEventListener('load', onLoad);
            console.info('相册原图已加载:', photoView.naturalWidth + '×' + photoView.naturalHeight);
            if (typeof syncVideoLayout === 'function') syncVideoLayout();
        };
        photoView.addEventListener('load', onLoad);
        photoView.src = fullUrl;
        videoBackground.style.visibility = 'hidden';
        resetCanvasNow();
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
        renderAlbumList(false);
    }

    function returnToCamera() {
        if (!state.albumViewing && !photoView.classList.contains('show')) return;
        state.albumViewing = false;
        photoView.classList.remove('show');
        photoView.removeAttribute('src');
        videoBackground.style.visibility = '';
        if (typeof syncVideoLayout === 'function') syncVideoLayout();
        resetCanvasNow();
        renderAlbumList(false);
        // 切回视频的同时自动关闭相册窗口
        closeAlbumPanel();
    }

    function clearAlbum() {
        postToHost({ type: 'clearAlbum' });
    }

    function positionCameraToolbar() {
        if (!cameraToolbar.classList.contains('show')) return;
        const mainTb = document.getElementById('toolbar');
        const tr = mainTb.getBoundingClientRect();
        const w = cameraToolbar.offsetWidth;
        let left = tr.left - 10 - w;
        if (left < 10) left = 10;
        cameraToolbar.style.left = left + 'px';
        cameraToolbar.style.bottom = (window.innerHeight - tr.bottom) + 'px';
    }

    if (window.chrome && window.chrome.webview) {
        window.chrome.webview.addEventListener('message', function (event) {
            let msg = event.data;
            if (typeof msg === 'string') {
                try { msg = JSON.parse(msg); } catch (_) { return; }
            }
            if (!msg || msg.type !== 'photoList') return;

            // 仅拍照新增场景播放列表动画，避免首次打开面板时所有项一起出现
            const existingItemCount = albumListEl.querySelectorAll('.album-item').length;
            const animateAddition = panelOpen && existingItemCount > 0;

            const savedPhoto = waitingForSaveResult;
            photos = Array.isArray(msg.photos) ? msg.photos : [];
            waitingForSaveResult = false;
            renderAlbumList(animateAddition);

            // 每次拍照保存成功后自动打开相册；已经打开时不重复操作。
            if (savedPhoto && photos.length > 0 && !panelOpen) {
                openAlbumPanel();
            }

            if (photos.length === 0 && state.albumViewing) {
                returnToCamera();
            }
        });
    }

    window.onVideoModeEntered = function () {
        cameraToolbar.classList.add('show');
        positionCameraToolbar();
        requestPhotoList();
    };
    window.onVideoModeExited = function () {
        if (state.switchingCamera) return;
        closeAlbumPanel();
        state.albumViewing = false;
        photoView.classList.remove('show');
        photoView.removeAttribute('src');
        videoBackground.style.visibility = '';
        cameraToolbar.classList.remove('show');
    };

    window.capturePhoto = capturePhoto;
    window.toggleAlbumPanel = toggleAlbumPanel;
    window.returnToCamera = returnToCamera;
    window.clearAlbum = clearAlbum;
    window.applyAlbumPhotoLayout = applyAlbumPhotoLayout;

    window.addEventListener('resize', function () {
        positionCameraToolbar();
    });
    window.addEventListener('load', function () {
        positionCameraToolbar();
    });
})();
//（注：内容由AI生成）

