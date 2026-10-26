const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tonariumShell', Object.freeze({
  updateState: () => ipcRenderer.invoke('shell:update-state'),
  updateConfigure: value => ipcRenderer.invoke('shell:update-configure', value),
  updateCheck: () => ipcRenderer.invoke('shell:update-check'),
  updateCancel: () => ipcRenderer.invoke('shell:update-cancel'),
  updateInstall: () => ipcRenderer.invoke('shell:update-install'),
  updateRelease: () => ipcRenderer.invoke('shell:update-release'),
  onUpdateState: callback => {
    const handler = (_event, state) => callback(state);
    ipcRenderer.on('shell:update-state', handler);
    return () => ipcRenderer.removeListener('shell:update-state', handler);
  },
  audioList: () => ipcRenderer.invoke('shell:audio-list'),
  audioApply: value => ipcRenderer.invoke('shell:audio-apply', value),
  audioPermit: () => ipcRenderer.invoke('shell:audio-permit'),
  state: () => ipcRenderer.invoke('shell:state'),
  connect: value => ipcRenderer.invoke('shell:connect', value),
  retry: () => ipcRenderer.invoke('shell:retry'),
  selectSource: id => ipcRenderer.invoke('shell:source', id),
}));
