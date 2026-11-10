const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('krordasDesktop', {
  isDesktop: true,
  exportPdf: () => ipcRenderer.invoke('krordas:export-pdf'),
  syncNow: () => ipcRenderer.invoke('krordas:sync-now'),
  chooseSyncFolder: () => ipcRenderer.invoke('krordas:choose-sync-folder'),
});
