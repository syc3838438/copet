const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("standaloneSceneProgressAPI", {
  onState: (cb) => ipcRenderer.on("standalone-scene-progress-state", (_event, payload) => cb(payload || {})),
  stop: () => ipcRenderer.send("standalone-scene-progress-stop"),
});
