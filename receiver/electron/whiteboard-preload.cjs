const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('save-screenshot', dataUrl),
  openWhiteboard: () => ipcRenderer.invoke('open-whiteboard-overlay'),
  closeWhiteboard: () => ipcRenderer.invoke('close-whiteboard-overlay'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('whiteboard-set-ignore-mouse', ignore),
  showButton: () => ipcRenderer.send('show-whiteboard-button'),
  hideButton: () => ipcRenderer.send('hide-whiteboard-button'),
  onExitSelectMode: (callback) => ipcRenderer.on('exit-select-mode', () => callback()),
});
