
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
            currentPage: 0,
            pages: [],
            perfWarningThreshold: 15,
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
        const msToStudentMap = {
            0: '21', 1: '01', 2: '01', 3: '02', 4: '02', 5: '03', 6: '03', 7: '05', 8: '05', 9: '06',
            10: '06', 11: '07', 12: '07', 13: '08', 14: '08', 15: '09', 16: '09', 17: '10', 18: '10', 19: '12',
            20: '12', 21: '16', 22: '16', 23: '17', 24: '17', 25: '18', 26: '18', 27: '19', 28: '19', 29: '20',
            30: '20', 31: '21', 32: '21', 33: '22', 34: '22', 35: '23', 36: '23', 37: '24', 38: '24', 39: '25',
            40: '25', 41: '26', 42: '26', 43: '27', 44: '27', 45: '28', 46: '28', 47: '29', 48: '29', 49: '31',
            50: '31', 51: '33', 52: '33', 53: '34', 54: '34', 55: '35', 56: '35', 57: '37', 58: '37', 59: '39',
            60: '39', 61: '01', 62: '33', 63: '02', 64: '37', 65: '03', 66: '21', 67: '05', 68: '25', 69: '06',
            70: '23', 71: '07', 72: '23', 73: '08', 74: '09', 75: '10', 76: '12', 77: '16', 78: '17', 79: '18',
            80: '19', 81: '20', 82: '21', 83: '22', 84: '23', 85: '24', 86: '25', 87: '26', 88: '27', 89: '28',
            90: '29', 91: '31', 92: '33', 93: '34', 94: '35', 95: '37', 96: '39', 97: '21', 98: '24', 99: '25'
        };

        // --- DOM Elements ---
        const container = document.getElementById('canvas-container');
        const pageIndicator = document.getElementById('pageIndicator');
        const clearConfirmBar = document.getElementById('clearConfirmBar');
        const perfWarningBar = document.getElementById('perfWarningBar');
        const penMenu = document.getElementById('penMenu');
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


        