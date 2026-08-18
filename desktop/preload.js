const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onUpdaterMessage: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('updater-message', handler);
    return () => ipcRenderer.removeListener('updater-message', handler);
  },
  onUpdaterProgress: (callback) => {
    const handler = (_event, percent) => callback(percent);
    ipcRenderer.on('updater-progress', handler);
    return () => ipcRenderer.removeListener('updater-progress', handler);
  },
  restartAndInstall: () => ipcRenderer.send('restart-and-install'),
});
