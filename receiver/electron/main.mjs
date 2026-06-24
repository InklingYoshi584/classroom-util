import { app, BrowserWindow, ipcMain, powerSaveBlocker } from 'electron';
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
      preload: path.join(__dirname, 'preload.mjs'),
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
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });

  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  app.quit();
});
