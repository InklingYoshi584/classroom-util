const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('save-screenshot', dataUrl),
  openWhiteboard: () => ipcRenderer.invoke('launch-whiteboard-overlay'),
  closeWhiteboard: () => ipcRenderer.invoke('close-whiteboard-overlay'),
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('whiteboard-set-ignore-mouse', ignore),
  showButton: () => ipcRenderer.send('show-whiteboard-button'),
  hideButton: () => ipcRenderer.send('hide-whiteboard-button'),
  setButtonPosition: (side) => ipcRenderer.send('whiteboard-btn-position', side),
  closeButton: () => ipcRenderer.invoke('close-whiteboard-button'),
  moveWindow: (dx, dy) => ipcRenderer.send('whiteboard-move-window', dx, dy),
  onExitSelectMode: (callback) => ipcRenderer.on('exit-select-mode', () => callback()),
});
