const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('zenith', {
  refine: (text) => ipcRenderer.invoke('llm:refine', text),
  applyReplacement: (text) => ipcRenderer.invoke('apply:replace', text),
  expand: () => ipcRenderer.invoke('overlay:expand'),
  resizePopover: (height) => ipcRenderer.invoke('overlay:resize', height),
  hide: () => ipcRenderer.send('overlay:hide'),
  onSetMode: (handler) => {
    const listener = (_evt, role) => handler(role);
    ipcRenderer.on('set-mode', listener);
    return () => ipcRenderer.removeListener('set-mode', listener);
  },
  onStartRefine: (handler) => {
    const listener = (_evt, payload) => handler(payload);
    ipcRenderer.on('overlay:start-refine', listener);
    return () => ipcRenderer.removeListener('overlay:start-refine', listener);
  },
  onResetPopover: (handler) => {
    const listener = () => handler();
    ipcRenderer.on('overlay:reset-popover', listener);
    return () => ipcRenderer.removeListener('overlay:reset-popover', listener);
  },
});
