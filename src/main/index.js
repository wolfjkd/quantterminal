const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let backendProcess;

// 后端端口（与 backend/config.py APP_PORT 保持一致）
const BACKEND_PORT = 8001;

function isDev() {
    // 打包后 process.resourcesPath 指向 app/resources，源码模式无此目录
    return !app.isPackaged;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1024,
        minHeight: 768,
        title: 'QuantTerminal - 量化研究平台',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        },
        icon: path.join(__dirname, '../assets/icon.ico')
    });

    if (isDev()) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/dist/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

function startBackend() {
    if (isDev()) {
        // 开发模式：直接跑 Python 源码
        const pythonPath = process.env.PYTHON_PATH || 'python';
        const backendDir = path.join(__dirname, '../backend');
        const projectRoot = path.join(__dirname, '../..');
        backendProcess = spawn(pythonPath, ['-m', 'backend.main'], {
            cwd: projectRoot,
            env: { ...process.env, PYTHONPATH: projectRoot }
        });
    } else {
        // 打包模式：启动 PyInstaller 封装的 backend exe
        // exe 位于 resources/backend/quantterminal-backend.exe
        const backendExe = path.join(process.resourcesPath, 'backend', 'quantterminal-backend.exe');
        if (!fs.existsSync(backendExe)) {
            console.error(`[Backend] 后端 exe 不存在: ${backendExe}`);
            return;
        }
        // 数据目录：用户 AppData，避免写安装目录（权限问题）
        const userDataDir = app.getPath('userData');
        backendProcess = spawn(backendExe, [], {
            cwd: userDataDir,
            env: {
                ...process.env,
                QT_BACKEND_PORT: String(BACKEND_PORT),
                QT_DATA_DIR: userDataDir,
            }
        });
    }

    backendProcess.stdout.on('data', (data) => {
        console.log(`[Backend] ${data.toString().trim()}`);
    });

    backendProcess.stderr.on('data', (data) => {
        console.error(`[Backend Error] ${data.toString().trim()}`);
    });

    backendProcess.on('close', (code) => {
        console.log(`Backend process exited with code ${code}`);
    });
}

function stopBackend() {
    if (backendProcess) {
        backendProcess.kill();
        backendProcess = null;
    }
}

app.whenReady().then(() => {
    startBackend();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    stopBackend();
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('before-quit', () => {
    stopBackend();
});

ipcMain.handle('get-backend-url', () => {
    return `http://127.0.0.1:${BACKEND_PORT}`;
});