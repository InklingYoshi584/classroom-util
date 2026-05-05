import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = 'D:\\HWManagement';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

ensureDir(DATA_DIR);

function getFilePath(classId) {
  return path.join(DATA_DIR, `homework-${classId}.json`);
}

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
