// Preload runs in a privileged but isolated context, before the renderer.
// We expose a minimal, typed API to the renderer via contextBridge.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  /** Subscribe to new text arriving from the main process (suggestion window) */
  onTextSelected: (cb) => {
    const handler = (_event, text) => cb(text);
    ipcRenderer.on("text-selected", handler);
    return () => ipcRenderer.removeListener("text-selected", handler);
  },

  /** Subscribe to the text payload attached to the floating icon */
  onIconText: (cb) => {
    const handler = (_event, text) => cb(text);
    ipcRenderer.on("icon-text", handler);
    return () => ipcRenderer.removeListener("icon-text", handler);
  },

  /** User clicked the floating icon → open the suggestion popup */
  iconClicked: (text) => ipcRenderer.send("icon-clicked", text),

  /** Ask main to run the grammar checker on a string */
  checkText: (text) => ipcRenderer.invoke("check-text", text),

  /** Write a string to the system clipboard */
  writeClipboard: (text) => ipcRenderer.send("write-clipboard", text),

  /** Hide the floating window */
  hideWindow: () => ipcRenderer.send("hide-window"),

  /** Host platform, useful for rendering the right keyboard symbols */
  platform: process.platform,
});
