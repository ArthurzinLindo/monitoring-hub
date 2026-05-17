const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximizeRestore: () => ipcRenderer.send("window:maximize-restore"),
  close: () => ipcRenderer.send("window:close"),
  getPreferences: () => ipcRenderer.invoke("preferences:get"),
  setPreferences: (patch) => ipcRenderer.invoke("preferences:set", patch),
  exportClockImage: (payload) => ipcRenderer.invoke("clock-image:export", payload),
});
