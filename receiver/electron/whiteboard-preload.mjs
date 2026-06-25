import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('whiteboardAPI', {
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  saveScreenshot: (dataUrl) => ipcRenderer.invoke('save-screenshot', dataUrl),
  showButton: () => ipcRenderer.send('show-whiteboard-button'),
  hideButton: () => ipcRenderer.send('hide-whiteboard-button'),
  openOverlay: () => ipcRenderer.invoke('open-whiteboard-overlay'),
  closeOverlay: () => ipcRenderer.invoke('close-whiteboard-overlay'),
});
