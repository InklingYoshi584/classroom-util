const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: (classId) => ipcRenderer.invoke('load-homework-data', classId),
  saveData: (classId, data) => ipcRenderer.invoke('save-homework-data', classId, data),
  exportBackup: (classId, data) => ipcRenderer.invoke('export-homework-backup', classId, data),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('set-always-on-top', on),
  loadConfig: () => ipcRenderer.invoke('load-receiver-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-receiver-config', config),
  openTimerWindow: () => ipcRenderer.invoke('open-timer-window'),
  closeTimerWindow: () => ipcRenderer.invoke('close-timer-window'),
  openHomeworkWindow: (classId, serverHost) => ipcRenderer.invoke('open-homework-window', classId, serverHost),
  closeHomeworkWindow: () => ipcRenderer.invoke('close-homework-window'),
  onTimerWindowClosed: (callback) => {
    ipcRenderer.on('timer-window-closed', () => callback());
  },
  onHomeworkWindowClosed: (callback) => {
    ipcRenderer.on('homework-window-closed', () => callback());
  },
  capturePage: () => ipcRenderer.invoke('capture-page'),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('save-screenshot', dataUrl),
  openWhiteboard: () => ipcRenderer.send('show-whiteboard-button'),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  closeWhiteboard: () => ipcRenderer.invoke('close-whiteboard-overlay'),
});
