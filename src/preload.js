const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zenith', {
  refine: (text) => ipcRenderer.invoke('llm:refine', text),
  applyReplacement: (text) => ipcRenderer.invoke('apply:replace', text),
  expand: () => ipcRenderer.invoke('overlay:expand'),
  resizePopover: (height) => ipcRenderer.invoke('overlay:resize', height),
  hide: () => ipcRenderer.send('overlay:hide'),
  onReset: (handler) => {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('overlay:reset', listener);
    return () => ipcRenderer.removeListener('overlay:reset', listener);
  },
});
