"use strict";

const defaultPath = require("path");

const PROGRESS_WIDTH = 248;
const PROGRESS_HEIGHT = 42;
const PROGRESS_GAP = 8;

function noop() {}

function isLiveWindow(win) {
  return !!win && (typeof win.isDestroyed !== "function" || !win.isDestroyed());
}

function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
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

function unionBounds(a, b) {
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.width, b.x + b.width);
  const bottom = Math.max(a.y + a.height, b.y + b.height);
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function createStandaloneSceneProgressRuntime(options = {}) {
  const BrowserWindow = options.BrowserWindow;
  const ipcMain = options.ipcMain;
  const screen = options.screen;
  const path = options.path || defaultPath;
  const preloadPath = options.preloadPath || path.join(__dirname, "preload-standalone-scene-progress.js");
  const htmlPath = options.htmlPath || path.join(__dirname, "standalone-scene-progress.html");
  const guardAlwaysOnTop = options.guardAlwaysOnTop || noop;
  const keepOutOfTaskbar = options.keepOutOfTaskbar || noop;
  const getAnchorBounds = options.getAnchorBounds || (() => null);
  const onStopScene = options.onStopScene || noop;

  let progressWin = null;
  let lastState = { active: false };
  const disposers = [];

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

  function computeBounds(anchorBounds) {
    const anchor = normalizeBounds(anchorBounds) || { x: 0, y: 0, width: 1, height: 1 };
    const workArea = getWorkArea(anchor);
    const minY = workArea.y;
    const maxY = workArea.y + workArea.height - PROGRESS_HEIGHT;
    const belowY = anchor.y + anchor.height + PROGRESS_GAP;
    const aboveY = anchor.y - PROGRESS_GAP - PROGRESS_HEIGHT;
    const y = belowY <= maxY ? belowY : aboveY;
    return {
      x: Math.round(clamp(anchor.x + anchor.width / 2 - PROGRESS_WIDTH / 2, workArea.x, workArea.x + workArea.width - PROGRESS_WIDTH)),
      y: Math.round(clamp(y, minY, maxY)),
      width: PROGRESS_WIDTH,
      height: PROGRESS_HEIGHT,
    };
  }

  function sendState() {
    if (isLiveWindow(progressWin) && progressWin.webContents && typeof progressWin.webContents.send === "function") {
      progressWin.webContents.send("standalone-scene-progress-state", lastState || { active: false });
    }
  }

  function ensureWindow() {
    if (isLiveWindow(progressWin)) return progressWin;
    if (!BrowserWindow) return null;
    progressWin = new BrowserWindow({
      width: PROGRESS_WIDTH,
      height: PROGRESS_HEIGHT,
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
    progressWin.setMenuBarVisibility(false);
    progressWin.loadFile(htmlPath);
    if (progressWin.webContents && typeof progressWin.webContents.on === "function") {
      progressWin.webContents.on("did-finish-load", sendState);
    }
    progressWin.on("closed", () => {
      progressWin = null;
    });
    guardAlwaysOnTop(progressWin);
    return progressWin;
  }

  function reposition() {
    if (!isLiveWindow(progressWin) || !lastState || !lastState.active) return;
    const anchor = normalizeBounds(getAnchorBounds());
    if (!anchor) return;
    progressWin.setBounds(computeBounds(anchor));
  }

  function update(state = {}) {
    lastState = state && typeof state === "object" ? state : { active: false };
    if (!lastState.active) {
      hide();
      return;
    }
    const win = ensureWindow();
    if (!win) return;
    reposition();
    sendState();
    if (typeof win.showInactive === "function") win.showInactive();
    else if (typeof win.show === "function") win.show();
    keepOutOfTaskbar(win);
  }

  function hide() {
    if (isLiveWindow(progressWin) && typeof progressWin.hide === "function") progressWin.hide();
  }

  function isVisible() {
    return isLiveWindow(progressWin) && typeof progressWin.isVisible === "function" && progressWin.isVisible();
  }

  function getWindowBounds() {
    return isLiveWindow(progressWin) && typeof progressWin.getBounds === "function"
      ? normalizeBounds(progressWin.getBounds())
      : null;
  }

  function getMenuAnchorBounds(petBounds) {
    const pet = normalizeBounds(petBounds || getAnchorBounds());
    const progress = isVisible() ? getWindowBounds() : null;
    if (pet && progress) return unionBounds(pet, progress);
    return pet || progress;
  }

  function cleanup() {
    while (disposers.length) disposers.pop()();
    if (isLiveWindow(progressWin)) progressWin.destroy();
    progressWin = null;
    lastState = { active: false };
  }

  if (ipcMain && typeof ipcMain.on === "function") {
    const handleStop = () => onStopScene();
    ipcMain.on("standalone-scene-progress-stop", handleStop);
    disposers.push(() => ipcMain.removeListener("standalone-scene-progress-stop", handleStop));
  }

  return {
    update,
    hide,
    reposition,
    cleanup,
    isVisible,
    getWindow: () => progressWin,
    getMenuAnchorBounds,
    __test: {
      computeBounds,
    },
  };
}

module.exports = createStandaloneSceneProgressRuntime;
