"use strict";

const defaultPath = require("path");

const MENU_WIDTH = 492;
const MENU_HEIGHT = 52;
const MENU_GAP = 8;

function noop() {}

function isLiveWindow(win) {
  return !!win && (typeof win.isDestroyed !== "function" || !win.isDestroyed());
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function createPetQuickMenuRuntime(options = {}) {
  const BrowserWindow = options.BrowserWindow;
  const ipcMain = options.ipcMain;
  const screen = options.screen;
  const path = options.path || defaultPath;
  const preloadPath = options.preloadPath || path.join(__dirname, "preload-pet-quick-menu.js");
  const htmlPath = options.htmlPath || path.join(__dirname, "pet-quick-menu.html");
  const guardAlwaysOnTop = options.guardAlwaysOnTop || noop;
  const keepOutOfTaskbar = options.keepOutOfTaskbar || noop;
  const sendToHitWin = options.sendToHitWin || noop;
  const openSettingsWindow = options.openSettingsWindow || noop;
  const enableDoNotDisturb = options.enableDoNotDisturb || noop;
  const disableDoNotDisturb = options.disableDoNotDisturb || noop;
  const getDoNotDisturb = options.getDoNotDisturb || (() => false);

  let menuWin = null;
  const disposers = [];

  function ensureWindow() {
    if (isLiveWindow(menuWin)) return menuWin;
    if (!BrowserWindow) return null;
    menuWin = new BrowserWindow({
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      minimizable: false,
      maximizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: true,
      hasShadow: false,
      webPreferences: {
        preload: preloadPath,
        nodeIntegration: false,
        contextIsolation: true,
      },
    });
    menuWin.setMenuBarVisibility(false);
    menuWin.loadFile(htmlPath);
    menuWin.on("blur", () => {
      setTimeout(() => hide(), 80);
    });
    menuWin.on("closed", () => {
      menuWin = null;
    });
    guardAlwaysOnTop(menuWin);
    return menuWin;
  }

  function getSenderPoint(event, payload) {
    const senderWin = event && event.sender && typeof BrowserWindow.fromWebContents === "function"
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    const bounds = senderWin && typeof senderWin.getBounds === "function"
      ? senderWin.getBounds()
      : null;
    const fallback = bounds
      ? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
      : { x: 0, y: 0 };
    const clientX = Number(payload && payload.clientX);
    const clientY = Number(payload && payload.clientY);
    if (!bounds || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return fallback;
    return {
      x: bounds.x + clientX,
      y: bounds.y + clientY,
    };
  }

  function getWorkArea(point) {
    try {
      if (screen && typeof screen.getDisplayNearestPoint === "function") {
        const display = screen.getDisplayNearestPoint({ x: Math.round(point.x), y: Math.round(point.y) });
        if (display && display.workArea) return display.workArea;
      }
    } catch {}
    try {
      if (screen && typeof screen.getPrimaryDisplay === "function") {
        const display = screen.getPrimaryDisplay();
        if (display && display.workArea) return display.workArea;
      }
    } catch {}
    return { x: 0, y: 0, width: 1280, height: 800 };
  }

  function computeBounds(point) {
    const workArea = getWorkArea(point);
    const below = point.y + MENU_GAP + MENU_HEIGHT <= workArea.y + workArea.height;
    const y = below ? point.y + MENU_GAP : point.y - MENU_GAP - MENU_HEIGHT;
    return {
      x: Math.round(clamp(point.x - MENU_WIDTH / 2, workArea.x, workArea.x + workArea.width - MENU_WIDTH)),
      y: Math.round(clamp(y, workArea.y, workArea.y + workArea.height - MENU_HEIGHT)),
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    };
  }

  function hide() {
    if (isLiveWindow(menuWin) && typeof menuWin.hide === "function") menuWin.hide();
  }

  function show(event, payload = {}) {
    const win = ensureWindow();
    if (!win) return;
    if (typeof win.isVisible === "function" && win.isVisible()) {
      hide();
      return;
    }
    win.setBounds(computeBounds(getSenderPoint(event, payload)));
    if (win.webContents && typeof win.webContents.send === "function") {
      win.webContents.send("pet-quick-menu-state", { sleeping: !!getDoNotDisturb() });
    }
    win.show();
    if (typeof win.focus === "function") win.focus();
    keepOutOfTaskbar(win);
  }

  function handleAction(_event, payload = {}) {
    const id = payload && payload.id;
    if (id === "settings") {
      hide();
      openSettingsWindow();
      return;
    }
    if (id === "sleepToggle") {
      hide();
      if (getDoNotDisturb()) disableDoNotDisturb();
      else enableDoNotDisturb();
      return;
    }
    if (typeof payload.action === "string" && payload.action) {
      hide();
      sendToHitWin("pet-quick-action", {
        action: payload.action,
        side: payload.side || null,
      });
    }
  }

  if (ipcMain && typeof ipcMain.on === "function") {
    ipcMain.on("pet-quick-menu-action", handleAction);
    disposers.push(() => ipcMain.removeListener("pet-quick-menu-action", handleAction));
  }

  function cleanup() {
    while (disposers.length) disposers.pop()();
    if (isLiveWindow(menuWin)) menuWin.destroy();
    menuWin = null;
  }

  return {
    show,
    hide,
    cleanup,
    getWindow: () => menuWin,
    __test: {
      computeBounds,
    },
  };
}

module.exports = createPetQuickMenuRuntime;
