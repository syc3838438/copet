"use strict";

const test = require("node:test");
const assert = require("node:assert");

const createStandaloneSceneProgressRuntime = require("../src/standalone-scene-progress");

class FakeIpcMain {
  constructor() {
    this.listeners = new Map();
  }

  on(channel, listener) {
    this.listeners.set(channel, listener);
  }

  removeListener(channel, listener) {
    if (this.listeners.get(channel) === listener) this.listeners.delete(channel);
  }

  send(channel, payload) {
    const listener = this.listeners.get(channel);
    assert.strictEqual(typeof listener, "function", `missing IPC listener ${channel}`);
    listener({ sender: "progress" }, payload);
  }
}

class FakeWindow {
  constructor(options) {
    this.options = options;
    this.bounds = { x: 0, y: 0, width: options.width, height: options.height };
    this.visible = false;
    this.destroyed = false;
    this.events = new Map();
    this.webContents = {
      sent: [],
      send: (...args) => this.webContents.sent.push(args),
      on: (name, cb) => this.events.set(`webContents:${name}`, cb),
    };
    FakeWindow.instances.push(this);
  }

  setMenuBarVisibility() {}
  loadFile(file) { this.loadedFile = file; }
  on(name, cb) { this.events.set(name, cb); }
  setBounds(bounds) { this.bounds = { ...bounds }; }
  getBounds() { return { ...this.bounds }; }
  showInactive() { this.visible = true; }
  hide() { this.visible = false; }
  isVisible() { return this.visible; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; }
}
FakeWindow.instances = [];

function createHarness(overrides = {}) {
  FakeWindow.instances = [];
  const calls = [];
  const ipcMain = new FakeIpcMain();
  const runtime = createStandaloneSceneProgressRuntime({
    BrowserWindow: FakeWindow,
    ipcMain,
    screen: {
      getDisplayNearestPoint: () => ({
        workArea: overrides.workArea || { x: 0, y: 0, width: 500, height: 400 },
      }),
    },
    guardAlwaysOnTop: (win) => calls.push(["guardAlwaysOnTop", win instanceof FakeWindow]),
    keepOutOfTaskbar: (win) => calls.push(["keepOutOfTaskbar", win instanceof FakeWindow]),
    getAnchorBounds: () => overrides.anchorBounds || { x: 100, y: 100, width: 80, height: 80 },
    onStopScene: () => calls.push(["onStopScene"]),
  });
  return { calls, ipcMain, runtime };
}

test("standalone scene progress positions below the pet and flips above near bottom", () => {
  const { runtime } = createHarness({ workArea: { x: 0, y: 0, width: 300, height: 200 } });

  assert.deepStrictEqual(runtime.__test.computeBounds({ x: 50, y: 40, width: 80, height: 60 }), {
    x: 0,
    y: 108,
    width: 248,
    height: 42,
  });
  assert.deepStrictEqual(runtime.__test.computeBounds({ x: 50, y: 150, width: 80, height: 40 }), {
    x: 0,
    y: 100,
    width: 248,
    height: 42,
  });
});

test("standalone scene progress shows active state and hides inactive state", () => {
  const { calls, runtime } = createHarness();

  runtime.update({ active: true, label: "工作", remainingMs: 1500, progress: 0.5 });
  const win = FakeWindow.instances[0];

  assert.strictEqual(win.visible, true);
  assert.deepStrictEqual(win.webContents.sent.slice(-1), [[
    "standalone-scene-progress-state",
    { active: true, label: "工作", remainingMs: 1500, progress: 0.5 },
  ]]);
  assert.ok(calls.some((call) => call[0] === "keepOutOfTaskbar"));

  runtime.update({ active: false });
  assert.strictEqual(win.visible, false);
});

test("standalone scene progress expands menu anchor to include progress bar", () => {
  const { runtime } = createHarness();
  runtime.update({ active: true, label: "工作", remainingMs: 1500, progress: 0.5 });

  assert.deepStrictEqual(runtime.getMenuAnchorBounds({ x: 100, y: 100, width: 80, height: 80 }), {
    x: 16,
    y: 100,
    width: 248,
    height: 130,
  });
});

test("standalone scene progress stop button IPC stops the active scene", () => {
  const { calls, ipcMain } = createHarness();

  ipcMain.send("standalone-scene-progress-stop");

  assert.deepStrictEqual(calls.slice(-1), [["onStopScene"]]);
});
