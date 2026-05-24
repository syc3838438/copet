"use strict";

const defaultPath = require("path");

const MENU_WIDTH = 392;
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
  const openSettingsWindow = options.openSettingsWindow || noop;
  const getAnchorBounds = options.getAnchorBounds || null;
  const onSelectScene = options.onSelectScene || noop;
  const onCycleDuration = options.onCycleDuration || noop;
  const onStopScene = options.onStopScene || noop;
  const getState = options.getState || (() => ({}));

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
    if (menuWin.webContents && typeof menuWin.webContents.on === "function") {
      menuWin.webContents.on("did-finish-load", () => sendState());
    }
    menuWin.on("blur", () => {
      setTimeout(() => hide(), 80);
    });
    menuWin.on("closed", () => {
      menuWin = null;
    });
    guardAlwaysOnTop(menuWin);
    return menuWin;
  }

  function normalizeBounds(bounds) {
    if (!bounds || typeof bounds !== "object") return null;
    const x = Number(bounds.x);
    const y = Number(bounds.y);
    const width = Number(bounds.width);
    const height = Number(bounds.height);
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return {
      x,
      y,
      width: Math.max(1, width),
      height: Math.max(1, height),
    };
  }

  function getSenderBounds(event, payload) {
    const provided = normalizeBounds(payload && payload.anchorBounds);
    if (provided) return provided;
    if (typeof getAnchorBounds === "function") {
      const bounds = normalizeBounds(getAnchorBounds());
      if (bounds) return bounds;
    }
    const senderWin = event && event.sender && typeof BrowserWindow.fromWebContents === "function"
      ? BrowserWindow.fromWebContents(event.sender)
      : null;
    const bounds = senderWin && typeof senderWin.getBounds === "function"
      ? senderWin.getBounds()
      : null;
    const senderBounds = normalizeBounds(bounds);
    if (senderBounds) return senderBounds;
    const clientX = Number(payload && payload.clientX);
    const clientY = Number(payload && payload.clientY);
    if (Number.isFinite(clientX) && Number.isFinite(clientY)) {
      return { x: clientX, y: clientY, width: 1, height: 1 };
    }
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  function getWorkArea(anchor) {
    const point = {
      x: anchor.x + anchor.width / 2,
      y: anchor.y + anchor.height / 2,
    };
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

  function intersects(a, b) {
    return a.x < b.x + b.width
      && a.x + a.width > b.x
      && a.y < b.y + b.height
      && a.y + a.height > b.y;
  }

  function computeBounds(anchor) {
    const workArea = getWorkArea(anchor);
    const minY = workArea.y;
    const maxY = workArea.y + workArea.height - MENU_HEIGHT;
    const belowY = anchor.y + anchor.height + MENU_GAP;
    const aboveY = anchor.y - MENU_GAP - MENU_HEIGHT;
    const belowFits = belowY <= maxY;
    const aboveFits = aboveY >= minY;
    let y;

    if (belowFits) {
      y = belowY;
    } else if (aboveFits) {
      y = aboveY;
    } else {
      const belowSpace = workArea.y + workArea.height - (anchor.y + anchor.height);
      const aboveSpace = anchor.y - workArea.y;
      y = belowSpace >= aboveSpace ? maxY : minY;
    }

    let bounds = {
      x: Math.round(clamp(anchor.x + anchor.width / 2 - MENU_WIDTH / 2, workArea.x, workArea.x + workArea.width - MENU_WIDTH)),
      y: Math.round(clamp(y, minY, maxY)),
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
    };
    if (intersects(bounds, anchor)) {
      if (aboveFits) bounds = { ...bounds, y: Math.round(aboveY) };
      else if (belowFits) bounds = { ...bounds, y: Math.round(belowY) };
    }
    return {
      ...bounds,
      y: Math.round(clamp(bounds.y, minY, maxY)),
    };
  }

  function hide() {
    if (isLiveWindow(menuWin) && typeof menuWin.hide === "function") menuWin.hide();
  }

  function sendState() {
    if (isLiveWindow(menuWin) && menuWin.webContents && typeof menuWin.webContents.send === "function") {
      menuWin.webContents.send("pet-quick-menu-state", getState() || {});
    }
  }

  function show(event, payload = {}) {
    const win = ensureWindow();
    if (!win) return;
    if (typeof win.isVisible === "function" && win.isVisible()) {
      hide();
      return;
    }
    win.setBounds(computeBounds(getSenderBounds(event, payload)));
    sendState();
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
    if (id === "stop") {
      hide();
      onStopScene();
      return;
    }
    if (id === "scene" && typeof payload.scene === "string" && payload.scene) {
      hide();
      onSelectScene(payload.scene);
      return;
    }
    if (id === "duration" && typeof payload.scene === "string" && payload.scene) {
      onCycleDuration(payload.scene);
      sendState();
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
    sendState,
    __test: {
      computeBounds,
    },
  };
}

module.exports = createPetQuickMenuRuntime;
