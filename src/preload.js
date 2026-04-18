const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zenith', {
  refine: (text) => ipcRenderer.invoke('llm:refine', text),
  copyToClipboard: (text) => ipcRenderer.invoke('clipboard:write', text),
  expand: () => ipcRenderer.invoke('overlay:expand'),
  hide: () => ipcRenderer.send('overlay:hide'),
  onReset: (handler) => {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('overlay:reset', listener);
    return () => ipcRenderer.removeListener('overlay:reset', listener);
  },
});
