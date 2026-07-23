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
  openSeatingChart: (layout) => ipcRenderer.invoke('open-seating-chart', layout),
  closeSeatingChart: () => ipcRenderer.invoke('close-seating-chart'),
  onSeatingUpdate: (callback) => {
    ipcRenderer.on('seating-update', (_event, layout) => callback(layout));
  },
  openSchedule: (pc, sc) => ipcRenderer.invoke('open-schedule', pc, sc),
  closeSchedule: () => ipcRenderer.invoke('close-schedule'),
  onScheduleData: (callback) => {
    ipcRenderer.on('schedule-data', (_event, pc, sc) => callback(pc, sc));
  },
});
