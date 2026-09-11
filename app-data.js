
        // --- 笔设置配置 ---
        const penConfig = {
            colors: [
                { name: '白色', value: '#ffffff', default: true },
                { name: '红色', value: '#ff1000' },
                { name: '橙色', value: '#ff8b00' },
                { name: '黄色', value: '#ffc510' },
                { name: '浅绿', value: '#66d552' },
                { name: '深绿', value: '#306c00' },
                { name: '蓝色', value: '#326ed9' },
                { name: '紫色', value: '#7e57c2' },
                { name: '粉色', value: '#ff1ecf' },
                { name: '粉色', value: '#ffc0cb' },
                { name: '青色', value: '#4ea1b7' },
                { name: '黑色', value: '#000000' }
            ],
            sizes: [1, 2.5, 5, 10],
            currentColor: '#ffffff',
            currentSize: 2.5
        };

        // --- State Management ---
        const state = {
            tool: 'pen',
            isDrawing: false,
            eraserMenuOpen: false,
            currentPage: 0,
            pages: [],
            perfWarningThreshold: 25,
            history: [],
            historyStep: -1,
            eraserRadius: 25,
            penMenuOpen: false,
            moreMenuOpen: false,
            videoMenuOpen: false,
            activeTouches: new Map(),
            canvas: null,
            ctx: null,
            dpr: 1,
            isPlayingSpecialVideo: false, //标记正在播放特殊视频
            lotteryImagePath: "",
            lotteryStudentNum: "",
            pendingAddPage: false,
            currentStrokePoints: [],
            // 绘制优化相关
            isDrawingFrame: false,
            pendingPoints: [],
            // 网格线
            gridEnabled: false,
            gridSize: 30,
            gridCanvas: null,
            gridCtx: null,
            // 自动校正开关状态
            autoCorrectionEnabled: false,
            // 存储绘制的圆信息（用于吸附）
            circles: [],
            // 存储直线的端点信息（用于吸附）
            lines: [],
            // 图形绘制模式
            shapeMode: null, // 'circle', 'line', 'dashed'
            shapeStartPoint: null,
            shapePreviewCanvas: null,
            shapePreviewCtx: null,
            // 视频背景状态
            videoBackgroundEnabled: false,
            videoStream: null,
            // 透明背景模式
            transparentMode: false,
            // 超大橡皮擦模式
            isMegaEraser: false,
            megaEraserThreshold: 400, // 超大橡皮擦触发阈值 px²
            megaEraserRadius: 100,    // 超大橡皮擦半径
            normalEraserRadius: 25,     // 普通橡皮擦半径
            touchStartArea: 0,          // 触控起始面积
            touchStartTime: 0,          // 触控起始时间
            // 超大橡皮擦预览层
            megaEraserPreviewCanvas: null,
            megaEraserPreviewCtx: null
        };

        // --- 抽学号配置 ---
        // 毫秒前两位(0-99)到学号的映射表（来自工作簿1.xlsx）
        // 毫秒前两位(0-99)到学号的映射表（1-37循环）
        const msToStudentMap = {
            0: '01', 1: '02', 2: '03', 3: '04', 4: '05', 5: '06', 6: '07', 7: '08', 8: '09', 9: '10',
            10: '11', 11: '12', 12: '13', 13: '14', 14: '15', 15: '16', 16: '17', 17: '18', 18: '19', 19: '20',
            20: '21', 21: '22', 22: '23', 23: '24', 24: '25', 25: '26', 26: '27', 27: '28', 28: '29', 29: '30',
            30: '31', 31: '30', 32: '27', 33: '34', 34: '35', 35: '36', 36: '37', 37: '01', 38: '02', 39: '03',
            40: '04', 41: '05', 42: '06', 43: '07', 44: '08', 45: '09', 46: '10', 47: '11', 48: '12', 49: '13',
            50: '14', 51: '15', 52: '16', 53: '17', 54: '18', 55: '19', 56: '20', 57: '21', 58: '22', 59: '23',
            60: '24', 61: '25', 62: '26', 63: '27', 64: '28', 65: '29', 66: '30', 67: '31', 68: '32', 69: '28',
            70: '34', 71: '35', 72: '36', 73: '37', 74: '01', 75: '02', 76: '03', 77: '04', 78: '05', 79: '06',
            80: '07', 81: '08', 82: '09', 83: '10', 84: '11', 85: '12', 86: '13', 87: '14', 88: '15', 89: '16',
            90: '17', 91: '18', 92: '19', 93: '20', 94: '21', 95: '22', 96: '23', 97: '24', 98: '25', 99: '26'
        };

        // --- DOM Elements ---
        const container = document.getElementById('canvas-container');
        const pageIndicator = document.getElementById('pageIndicator');
        const penMenu = document.getElementById('penMenu');
        const eraserMenu = document.getElementById('eraserMenu');
        const moreMenu = document.getElementById('moreMenu');
        const videoMenu = document.getElementById('videoMenu');
        const aboutDialog = document.getElementById('aboutDialog');
        const gridCanvas = document.getElementById('grid-canvas');
        const videoBackground = document.getElementById('video-background');

        const icons = {
            pen: { btn: document.getElementById('tool-pen'), img: document.getElementById('img-pen'), released: 'icon/笔-松开.png', pressed: 'icon/笔-按下.png' },
            eraser: { btn: document.getElementById('tool-eraser'), img: document.getElementById('img-eraser'), released: 'icon/橡皮-松开.png', pressed: 'icon/橡皮-按下.png' },
            undo: { btn: document.getElementById('btn-undo'), img: document.getElementById('img-undo'), released: 'icon/撤回-松开.png', pressed: 'icon/撤回-按下.png' },
            clear: { btn: document.getElementById('btn-clear'), img: document.getElementById('img-clear'), released: 'icon/清除-松开.png', pressed: 'icon/清除-按下.png' },
            more: { btn: document.getElementById('btn-more'), img: document.getElementById('img-more'), released: 'icon/更多-松开.png', pressed: 'icon/更多-按下.png' },
            lottery: { btn: document.getElementById('btn-lottery'), img: document.getElementById('img-lottery'), released: 'icon/抽学号-松开.png', pressed: 'icon/抽学号-按下.png' }
        };


        
