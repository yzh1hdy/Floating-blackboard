/**
 * 图片加载失败回退文本
 * @param {HTMLElement} numberResult
 * @param {string} randomNumber
 */
function appendLotteryTextFallback(numberResult, randomNumber) {
  const existingTextElement = document.getElementById('lotteryTextFallback');
  if (existingTextElement) existingTextElement.remove();

  const textElement = document.createElement('div');
    textElement.id = 'lotteryTextFallback';
    textElement.style.cssText = `
        position: relative;
        z-index: 2;
        color: #ffffff;
        font-size: 120px;
        font-weight: bold;
        text-shadow: 0 4px 12px rgba(0,0,0,0.9);
        user-select: none;
        pointer-events: none;
        margin-top: 15%;
        margin-bottom: auto;
        font-family: 'HarmonyOS Sans SC Medium', 'HarmonyOSSansSCMedium', 'HarmonyOS Sans SC', 'Microsoft YaHei', sans-serif;
    `;
    textElement.textContent = randomNumber;
    numberResult.appendChild(textElement);
}

/**
 * 特殊动画：视频结束后，图片从大到小渐入
 * @param {string} imagePath
 * @param {string} randomNumber
 */
function showImageWithSpecialAnim(imagePath, randomNumber) {
  const numberResult = document.getElementById('numberResult');
  const resultImage = document.getElementById('resultImage');
  const renderId = state.lotteryRenderId;

  resultImage.src = imagePath;
  resultImage.onload = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'block';
  resultImage.classList.add('special-pop-anim');
  };
  resultImage.onerror = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'none';
  appendLotteryTextFallback(numberResult, randomNumber);
  };
  }

/**
 * 普通模式：直接显示图片，无缩放动画
 * @param {string} imagePath
 * @param {string} randomNumber
 */
function showNormalImage(imagePath, randomNumber) {
  const numberResult = document.getElementById('numberResult');
  const resultImage = document.getElementById('resultImage');
  const renderId = state.lotteryRenderId;

  resultImage.src = imagePath;
  resultImage.onload = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'block';
  };
  resultImage.onerror = function () {
  if (renderId !== state.lotteryRenderId) return;
  resultImage.style.display = 'none';
  appendLotteryTextFallback(numberResult, randomNumber);
  };
  }
// ====================== 抽奖全局辅助函数 新增结束 ======================

function getStudentByTime() {
    // 获取当前时间
    const now = new Date();
    const seconds = now.getSeconds(); // 0-59
    const milliseconds = now.getMilliseconds(); // 0-999
    // 秒数的最后一位（0-9）
    const secondLastDigit = seconds % 10;
    // 毫秒的第一位（0-9）
    const msFirstDigit = Math.floor(milliseconds / 100);
    // 组合成两位数（秒末位 * 10 + 毫秒首位）
    const lookupKey = secondLastDigit * 10 + msFirstDigit; // 范围0-99
    return {
        student: msToStudentMap[lookupKey],
        lookupKey: lookupKey
    };
}
// 将数字转换为7位二进制字符串（不足补前导零）
function to7BitBinary(num) {
    return num.toString(2).padStart(7, '0');
}
// 更新顶部栏显示
function updateTopBar(lookupKey) {
    const topBarText = document.getElementById('topBarText');
    if (topBarText) {
        topBarText.textContent = 'Time:' + to7BitBinary(lookupKey);
    }
}

// ========== 重写抽奖 showLottery ==========
function showLottery() {
  state.lotteryRenderId = (state.lotteryRenderId || 0) + 1;

  // 鼠标穿透时打开抽奖结果界面：临时取消穿透，避免点击穿透到桌面。
  // 若结果界面已在显示（重复点击抽学号），不再重复挂起
  if (typeof suspendMousePassthrough === 'function') {
    const nr = document.getElementById('numberResult');
    if (!nr || nr.style.display === 'none') suspendMousePassthrough();
  }

  // 清除之前的自动关闭定时器
  if (state.lotteryAutoCloseTimer) {
    clearTimeout(state.lotteryAutoCloseTimer);
    state.lotteryAutoCloseTimer = null;
  }

  const result = getStudentByTime();
    const randomNumber = result.student;
    const lookupKey = result.lookupKey;
    updateTopBar(lookupKey);

    const resultImage = document.getElementById('resultImage');
    const numberResult = document.getElementById('numberResult');
    const specialVideo = document.getElementById('lotterySpecialVideo');

    const paddedNumber = randomNumber.padStart(2, '0');
    const imagePath = 'num/' + paddedNumber + '.png';
    const specialStudentList = ['137'];//暂时不设特殊学号，以后再加

    // 移除旧回退文本
    const oldTextElement = document.getElementById('lotteryTextFallback');
    if (oldTextElement) {
        oldTextElement.remove();
    }

    // 重置图片：清空src、移除动画、隐藏
    resultImage.classList.remove('special-pop-anim');
    resultImage.style.display = 'none';
    resultImage.style.opacity = '';
    resultImage.style.transform = '';
    resultImage.src = '';

    // 重置视频状态
    specialVideo.style.display = 'none';
    specialVideo.pause();
    specialVideo.currentTime = 0;
    specialVideo.src = '';

    // 缓存本次抽奖信息，供【点击跳过视频】使用
    state.lotteryImagePath = imagePath;
    state.lotteryStudentNum = randomNumber;
    state.isPlayingSpecialVideo = false;

    if (specialStudentList.includes(paddedNumber)) {
        // ====== 放ba1.mp4，结束后才加载图片动画 ======
        specialVideo.src = "ba1.mp4";
        specialVideo.style.display = "block";
        numberResult.classList.add('video-playing');
        numberResult.style.display = 'flex';
        state.isPlayingSpecialVideo = true;

        // 事件清理包装，防止多次绑定
        let boundEndHandler;
        let boundErrorHandler;

        function cleanVideoEvents() {
            specialVideo.removeEventListener('ended', boundEndHandler);
            specialVideo.removeEventListener('error', boundErrorHandler);
        }

        boundEndHandler = function onVideoEnd() {
            cleanVideoEvents();
            specialVideo.style.display = "none";
            numberResult.classList.remove('video-playing');
            state.isPlayingSpecialVideo = false;
            showImageWithSpecialAnim(imagePath, randomNumber);
        };

        boundErrorHandler = function onVideoError(err) {
            console.warn("ba1.mp4 播放失败，降级直接展示图片", err);
            cleanVideoEvents();
            specialVideo.style.display = "none";
            state.isPlayingSpecialVideo = false;
            showNormalImage(imagePath, randomNumber);
        };

        specialVideo.addEventListener('ended', boundEndHandler);
        specialVideo.addEventListener('error', boundErrorHandler);

        specialVideo.play().catch(err => {
            console.warn("ba1.mp4 play()捕获异常，降级", err);
            cleanVideoEvents();
            specialVideo.style.display = "none";
            state.isPlayingSpecialVideo = false;
            showNormalImage(imagePath, randomNumber);
        });

    } else {
        // 普通学号，原有逻辑
        numberResult.style.display = 'flex';
        showNormalImage(imagePath, randomNumber);
    }

    // 设置2秒自动关闭
    const currentRenderId = state.lotteryRenderId;
    state.lotteryAutoCloseTimer = setTimeout(() => {
        // 只有当抽奖界面还在显示且没有播放视频时才自动关闭
        if (state.lotteryRenderId === currentRenderId &&
            numberResult.style.display !== 'none' &&
            !state.isPlayingSpecialVideo) {
            closeLottery();
        }
    }, 1000);
}

// ========== 重写 closeLottery ==========
function closeLottery() {
  state.lotteryRenderId = (state.lotteryRenderId || 0) + 1;

  // 抽奖结果界面关闭后恢复鼠标穿透
  if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();

  // 清除自动关闭定时器
  if (state.lotteryAutoCloseTimer) {
    clearTimeout(state.lotteryAutoCloseTimer);
    state.lotteryAutoCloseTimer = null;
  }

  const numberResult = document.getElementById('numberResult');
    numberResult.style.display = 'none';

    const resultImage = document.getElementById('resultImage');
    resultImage.src = '';
    resultImage.classList.remove('special-pop-anim');
    resultImage.style.display = 'none';

    const specialVideo = document.getElementById('lotterySpecialVideo');
    specialVideo.pause();
    specialVideo.currentTime = 0;
    specialVideo.src = "";
    specialVideo.style.display = "none";
    numberResult.classList.remove('video-playing');

    // 重置抽奖状态标记
    state.isPlayingSpecialVideo = false;
    state.lotteryImagePath = "";
    state.lotteryStudentNum = "";

    const textElement = document.getElementById('lotteryTextFallback');
    if (textElement) {
        textElement.remove();
    }
}

