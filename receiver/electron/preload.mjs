import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  loadData: (classId) => ipcRenderer.invoke('load-homework-data', classId),
  saveData: (classId, data) => ipcRenderer.invoke('save-homework-data', classId, data),
  exportBackup: (classId, data) => ipcRenderer.invoke('export-homework-backup', classId, data),
  setAlwaysOnTop: (on) => ipcRenderer.invoke('set-always-on-top', on),
  loadConfig: () => ipcRenderer.invoke('load-receiver-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-receiver-config', config),
});
