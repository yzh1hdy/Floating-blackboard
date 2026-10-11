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

function getStudentByTime() {
    const now = new Date();
    const seconds = now.getSeconds();
    const milliseconds = now.getMilliseconds();
    const secondLastDigit = seconds % 10;
    const msFirstDigit = Math.floor(milliseconds / 100);
    const lookupKey = secondLastDigit * 10 + msFirstDigit;
    return {
        student: msToStudentMap[lookupKey],
        lookupKey: lookupKey
    };
}
function to7BitBinary(num) {
    return num.toString(2).padStart(7, '0');
}
function updateTopBar(lookupKey) {
    const topBarText = document.getElementById('topBarText');
    if (topBarText) {
        topBarText.textContent = 'Time:' + to7BitBinary(lookupKey);
    }
}

// 启动抽奖结果 1 秒自动关闭定时器（重复调用重置计时）。
// 特殊学号必须等视频结束（或降级/跳过）后再调用，不能把视频时间计入这 1 秒。
function armLotteryAutoClose() {
    if (state.lotteryAutoCloseTimer) {
        clearTimeout(state.lotteryAutoCloseTimer);
        state.lotteryAutoCloseTimer = null;
    }
    const currentRenderId = state.lotteryRenderId;
    const numberResult = document.getElementById('numberResult');
    state.lotteryAutoCloseTimer = setTimeout(() => {
        if (state.lotteryRenderId === currentRenderId &&
            numberResult.style.display !== 'none' &&
            !state.isPlayingSpecialVideo) {
            closeLottery();
        }
    }, 1000);
}

function showLottery() {
  state.lotteryRenderId = (state.lotteryRenderId || 0) + 1;

  if (typeof suspendMousePassthrough === 'function') {
    const nr = document.getElementById('numberResult');
    if (!nr || nr.style.display === 'none') suspendMousePassthrough();
  }

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
    const specialStudentList = ['117'];// 特殊学号设置为一个不可能的值，避免播放视频，方便测试

    const oldTextElement = document.getElementById('lotteryTextFallback');
    if (oldTextElement) {
        oldTextElement.remove();
    }

    resultImage.classList.remove('special-pop-anim');
    resultImage.style.display = 'none';
    resultImage.style.opacity = '';
    resultImage.style.transform = '';
    resultImage.src = '';

    specialVideo.style.display = 'none';
    specialVideo.pause();
    specialVideo.currentTime = 0;
    specialVideo.src = '';

    state.lotteryImagePath = imagePath;
    state.lotteryStudentNum = randomNumber;
    state.isPlayingSpecialVideo = false;

    if (specialStudentList.includes(paddedNumber)) {
        // 视频结束后才加载图片动画，并在此时才开始 1 秒自动关闭计时
        specialVideo.src = "ba1.mp4";
        specialVideo.style.display = "block";
        numberResult.classList.add('video-playing');
        numberResult.style.display = 'flex';
        state.isPlayingSpecialVideo = true;

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
            armLotteryAutoClose();
        };

        boundErrorHandler = function onVideoError(err) {
            console.warn("ba1.mp4 播放失败，降级直接展示图片", err);
            cleanVideoEvents();
            specialVideo.style.display = "none";
            state.isPlayingSpecialVideo = false;
            showNormalImage(imagePath, randomNumber);
            armLotteryAutoClose();
        };

        specialVideo.addEventListener('ended', boundEndHandler);
        specialVideo.addEventListener('error', boundErrorHandler);

        specialVideo.play().catch(err => {
            console.warn("ba1.mp4 play()捕获异常，降级", err);
            cleanVideoEvents();
            specialVideo.style.display = "none";
            numberResult.classList.remove('video-playing');
            state.isPlayingSpecialVideo = false;
            showNormalImage(imagePath, randomNumber);
            armLotteryAutoClose();
        });

    } else {
        numberResult.style.display = 'flex';
        showNormalImage(imagePath, randomNumber);
        armLotteryAutoClose();
    }
}

function closeLottery() {
  state.lotteryRenderId = (state.lotteryRenderId || 0) + 1;

  if (typeof resumeMousePassthrough === 'function') resumeMousePassthrough();

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

    state.isPlayingSpecialVideo = false;
    state.lotteryImagePath = "";
    state.lotteryStudentNum = "";

    const textElement = document.getElementById('lotteryTextFallback');
    if (textElement) {
        textElement.remove();
    }
}

