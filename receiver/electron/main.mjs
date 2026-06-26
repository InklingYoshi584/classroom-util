import { app, BrowserWindow, desktopCapturer, ipcMain, powerSaveBlocker, screen } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = 'D:\\HWManagement';
const CONFIG_FILE = path.join(DATA_DIR, 'receiver-config.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(DATA_DIR);

function getFilePath(classId) {
  return path.join(DATA_DIR, `homework-${classId}.json`);
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (e) {
    console.error('[Config] load error:', e.message);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    console.error('[Config] save error:', e.message);
    return { ok: false, error: e.message };
  }
}

// ── Timer window state ──
let timerWindow = null;
// ── Homework window state ──
let homeworkWindow = null;

// ── Whiteboard window state ──
let whiteboardBtnWin = null;
let whiteboardWin = null;

let powerSaveBlockerId = null;

// ── IPC handlers ──
ipcMain.handle('load-homework-data', (_event, classId) => {
  try {
    const fp = getFilePath(classId);
    if (fs.existsSync(fp)) {
      return JSON.parse(fs.readFileSync(fp, 'utf8'));
    }
  } catch (e) {
    console.error('[Homework] load error:', e.message);
  }
  return {};
});

ipcMain.handle('close-whiteboard-button', () => {
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) { whiteboardBtnWin.close(); whiteboardBtnWin = null; }
  return { ok: true };
});

ipcMain.handle('save-homework-data', (_event, classId, data) => {
  try {
    ensureDir(DATA_DIR);
    fs.writeFileSync(getFilePath(classId), JSON.stringify(data, null, 2), 'utf8');
    return { ok: true };
  } catch (e) {
    console.error('[Homework] save error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('export-homework-backup', (_event, classId, data) => {
  try {
    ensureDir(DATA_DIR);
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const fp = path.join(DATA_DIR, `homework-${classId}-backup-${stamp}.json`);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
    return { ok: true, path: fp };
  } catch (e) {
    console.error('[Homework] backup error:', e.message);
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('set-always-on-top', (_event, on) => {
  const wins = BrowserWindow.getAllWindows();
  for (const win of wins) {
    if (win === timerWindow) continue;
    win.setAlwaysOnTop(on);
    if (on) win.setVisibleOnAllWorkspaces(true);
    else win.setVisibleOnAllWorkspaces(false);
  }
});

function createTimerWindow() {
  if (timerWindow && !timerWindow.isDestroyed()) {
    timerWindow.focus();
    return;
  }
  timerWindow = new BrowserWindow({
    width: 420,
    height: 520,
    minWidth: 320,
    minHeight: 400,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    title: '计时器',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  timerWindow.loadFile(path.join(__dirname, '..', 'dist', 'timer.html'));
  timerWindow.center();

  // Start sleep prevention
  if (powerSaveBlockerId === null) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-display-sleep');
  }

  timerWindow.on('closed', () => {
    timerWindow = null;
    if (powerSaveBlockerId !== null) {
      powerSaveBlocker.stop(powerSaveBlockerId);
      powerSaveBlockerId = null;
    }
    // Notify main renderer so UI can reflect state
    const mainWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w !== timerWindow);
    if (mainWin) mainWin.webContents.send('timer-window-closed');
  });
}

ipcMain.handle('open-timer-window', () => {
  createTimerWindow();
  return { ok: true };
});

ipcMain.handle('close-timer-window', () => {
  if (timerWindow && !timerWindow.isDestroyed()) {
    timerWindow.close();
  }
  return { ok: true };
});

function createHomeworkWindow(classId, serverHost) {
  if (homeworkWindow && !homeworkWindow.isDestroyed()) {
    homeworkWindow.focus();
    return;
  }
  homeworkWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 500,
    autoHideMenuBar: true,
    title: '作业追踪',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  homeworkWindow.loadFile(path.join(__dirname, '..', 'dist', 'homework.html'), {
    query: { classId, serverHost },
  });
  homeworkWindow.center();

  homeworkWindow.on('closed', () => {
    homeworkWindow = null;
    const mainWin = BrowserWindow.getAllWindows().find(w => !w.isDestroyed() && w !== homeworkWindow);
    if (mainWin) mainWin.webContents.send('homework-window-closed');
  });
}

ipcMain.handle('open-homework-window', (_event, classId, serverHost) => {
  createHomeworkWindow(classId, serverHost);
  return { ok: true };
});

ipcMain.handle('close-homework-window', () => {
  if (homeworkWindow && !homeworkWindow.isDestroyed()) {
    homeworkWindow.close();
  }
  return { ok: true };
});

ipcMain.handle('load-receiver-config', () => loadConfig());

ipcMain.handle('save-receiver-config', (_event, config) => saveConfig(config));


// ── Whiteboard window management ──
function createWhiteboardBtnWindow() {
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) {
    whiteboardBtnWin.setOpacity(1);
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  const btnW = 130, btnH = 44;
  whiteboardBtnWin = new BrowserWindow({
    x: workArea.x + workArea.width - btnW - 16,
    y: workArea.y + workArea.height - btnH - 16,
    width: btnW,
    height: btnH,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'whiteboard-preload.cjs'),
    },
  });
  whiteboardBtnWin.loadFile(path.join(__dirname, '..', 'dist', 'whiteboard.html'), {
    query: { role: 'button' },
  });
  whiteboardBtnWin.on('closed', () => { whiteboardBtnWin = null; });
  whiteboardBtnWin.on('will-move', (_e, bounds) => clampToScreen(bounds));
  whiteboardBtnWin.on('will-resize', (_e, bounds) => clampToScreen(bounds));
}

function clampToScreen(bounds) {
  var wa = screen.getPrimaryDisplay().workArea;
  if (bounds.x < wa.x) bounds.x = wa.x;
  if (bounds.y < wa.y) bounds.y = wa.y;
  if (bounds.x + bounds.width > wa.x + wa.width) bounds.x = wa.x + wa.width - bounds.width;
  if (bounds.y + bounds.height > wa.y + wa.height) bounds.y = wa.y + wa.height - bounds.height;
}

function createWhiteboardOverlayWindow() {
  if (whiteboardWin && !whiteboardWin.isDestroyed()) {
    whiteboardWin.setOpacity(1);
    return;
  }
  const { workArea } = screen.getPrimaryDisplay();
  whiteboardWin = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'whiteboard-preload.cjs'),
    },
  });
  whiteboardWin.loadFile(path.join(__dirname, '..', 'dist', 'whiteboard.html'), {
    query: { role: 'overlay' },
  });
  whiteboardWin.on('closed', () => { whiteboardWin = null; });
  whiteboardWin.on('will-move', (_e, bounds) => clampToScreen(bounds));
  whiteboardWin.webContents.session.setPermissionRequestHandler((_wc, permission, cb) => {
    cb(permission === 'media');
  });
}
// ── Whiteboard IPC ──
function formatTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

ipcMain.handle('capture-screen', async () => {
  try {
    const primaryDisplay = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: primaryDisplay.size,
    });
    if (sources.length === 0) return { ok: false, error: 'No screen sources' };
    return { ok: true, dataUrl: sources[0].thumbnail.toDataURL() };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.on('whiteboard-set-ignore-mouse', (_event, ignore) => {
  if (whiteboardWin && !whiteboardWin.isDestroyed()) {
    whiteboardWin.setIgnoreMouseEvents(ignore, { forward: true });
  }
});

ipcMain.on('show-whiteboard-button', () => {
  createWhiteboardBtnWindow();
});

ipcMain.on('hide-whiteboard-button', () => {
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) whiteboardBtnWin.setOpacity(0);
});
ipcMain.on('whiteboard-btn-position', (_event, side) => {
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) {
    var wa = screen.getPrimaryDisplay().workArea;
    if (side === 'left') {
      whiteboardBtnWin.setPosition(16, wa.y + wa.height - 44 - 16);
    } else {
      whiteboardBtnWin.setPosition(wa.x + wa.width - 130 - 16, wa.y + wa.height - 44 - 16);
    }
  }
});
ipcMain.handle('open-whiteboard-overlay', async () => {
  createWhiteboardBtnWindow();
  return { ok: true };
});

ipcMain.handle('launch-whiteboard-overlay', async () => {
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) whiteboardBtnWin.setOpacity(0);
  createWhiteboardOverlayWindow();
  if (whiteboardWin && !whiteboardWin.isDestroyed()) {
    whiteboardWin.setIgnoreMouseEvents(false);
    whiteboardWin.webContents.send('exit-select-mode');
  }
  return { ok: true };
});


ipcMain.handle('close-whiteboard-overlay', () => {
  if (whiteboardWin && !whiteboardWin.isDestroyed()) whiteboardWin.setOpacity(0);
  createWhiteboardBtnWindow();
  return { ok: true };
});
ipcMain.handle('save-screenshot', async (_event, dataUrl) => {
  try {
    const desktopPath = app.getPath('desktop');
    const filename = `白板批注_${formatTimestamp()}.png`;
    const fullPath = path.join(desktopPath, filename);
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '');
    fs.writeFileSync(fullPath, Buffer.from(base64, 'base64'));
    return { ok: true, path: fullPath };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 400,
    minHeight: 600,
    autoHideMenuBar: true,
    title: 'Classroom Receiver',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.on('closed', () => {
    mainWindow = null;
    if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) whiteboardBtnWin.destroy();
    if (whiteboardWin && !whiteboardWin.isDestroyed()) whiteboardWin.destroy();
  });
  mainWindow = win;
}

app.whenReady().then(() => {
  createWindow();
  createWhiteboardBtnWindow();
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) whiteboardBtnWin.setOpacity(0);
});

app.on('window-all-closed', () => {
  if (whiteboardBtnWin && !whiteboardBtnWin.isDestroyed()) whiteboardBtnWin.destroy();
  if (whiteboardWin && !whiteboardWin.isDestroyed()) whiteboardWin.destroy();
  app.quit();
});
