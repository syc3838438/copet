"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("petQuickMenuAPI", {
  action: (payload) => ipcRenderer.send("pet-quick-menu-action", payload || {}),
  onState: (cb) => ipcRenderer.on("pet-quick-menu-state", (_event, payload) => cb(payload || {})),
});
