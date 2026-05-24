"use strict";

const test = require("node:test");
const assert = require("node:assert");

const createPetQuickMenuRuntime = require("../src/pet-quick-menu");

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
    listener({ sender: "quick-menu" }, payload);
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
    };
    FakeWindow.instances.push(this);
  }

  setMenuBarVisibility() {}
  loadFile(file) { this.loadedFile = file; }
  on(name, cb) { this.events.set(name, cb); }
  setBounds(bounds) { this.bounds = { ...bounds }; }
  getBounds() { return { ...this.bounds }; }
  show() { this.visible = true; }
  focus() { this.focused = true; }
  hide() { this.visible = false; }
  isVisible() { return this.visible; }
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; }
}
FakeWindow.instances = [];
FakeWindow.fromWebContents = () => ({
  getBounds: () => ({ x: 100, y: 200, width: 80, height: 60 }),
});

function createHarness(overrides = {}) {
  FakeWindow.instances = [];
  const calls = [];
  const ipcMain = new FakeIpcMain();
  const runtime = createPetQuickMenuRuntime({
    BrowserWindow: FakeWindow,
    ipcMain,
    screen: {
      getDisplayNearestPoint: () => ({
        workArea: overrides.workArea || { x: 0, y: 0, width: 500, height: 400 },
      }),
    },
    guardAlwaysOnTop: (win) => calls.push(["guardAlwaysOnTop", win instanceof FakeWindow]),
    keepOutOfTaskbar: (win) => calls.push(["keepOutOfTaskbar", win instanceof FakeWindow]),
    openSettingsWindow: () => calls.push(["openSettingsWindow"]),
    getAnchorBounds: overrides.anchorBounds ? () => overrides.anchorBounds : undefined,
    getState: () => overrides.state || { durations: { work: 25, play: 15, rest: 5 }, activeScene: "" },
    onSelectScene: (scene) => calls.push(["onSelectScene", scene]),
    onCycleDuration: (scene) => calls.push(["onCycleDuration", scene]),
    onStopScene: () => calls.push(["onStopScene"]),
  });
  return { calls, ipcMain, runtime };
}

test("quick menu positions below the pet and clamps inside the work area", () => {
  const { runtime } = createHarness({ workArea: { x: 0, y: 0, width: 300, height: 200 } });

  assert.deepStrictEqual(runtime.__test.computeBounds({ x: 10, y: 40, width: 80, height: 60 }), {
    x: 0,
    y: 108,
    width: 392,
    height: 52,
  });
});

test("quick menu flips above the pet when there is no room below", () => {
  const { runtime } = createHarness({ workArea: { x: 0, y: 0, width: 500, height: 200 } });

  assert.deepStrictEqual(runtime.__test.computeBounds({ x: 120, y: 130, width: 80, height: 60 }), {
    x: 0,
    y: 70,
    width: 392,
    height: 52,
  });
});

test("quick menu show toggles when already visible", () => {
  const { calls, runtime } = createHarness();

  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });
  const win = FakeWindow.instances[0];

  assert.strictEqual(win.visible, true);
  assert.deepStrictEqual(win.webContents.sent, [[
    "pet-quick-menu-state",
    { durations: { work: 25, play: 15, rest: 5 }, activeScene: "" },
  ]]);
  assert.deepStrictEqual(calls, [
    ["guardAlwaysOnTop", true],
    ["keepOutOfTaskbar", true],
  ]);

  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });
  assert.strictEqual(win.visible, false);
});

test("quick menu scene buttons select persistent pet scenes", () => {
  const { calls, ipcMain, runtime } = createHarness();
  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });

  ipcMain.send("pet-quick-menu-action", {
    id: "scene",
    scene: "work",
  });

  assert.deepStrictEqual(calls.slice(-1), [
    ["onSelectScene", "work"],
  ]);
  assert.strictEqual(FakeWindow.instances[0].visible, false);
});

test("quick menu duration buttons cycle time without closing the menu", () => {
  const { calls, ipcMain, runtime } = createHarness();
  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });

  ipcMain.send("pet-quick-menu-action", {
    id: "duration",
    scene: "play",
  });

  assert.ok(calls.some((call) => call[0] === "onCycleDuration" && call[1] === "play"));
  assert.strictEqual(FakeWindow.instances[0].visible, true);
});

test("quick menu stop button stops active scene and closes the menu", () => {
  const { calls, ipcMain, runtime } = createHarness({
    state: { durations: { work: 25, play: 15, rest: 5 }, activeScene: "work" },
  });
  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });

  ipcMain.send("pet-quick-menu-action", { id: "stop" });

  assert.deepStrictEqual(calls.slice(-1), [["onStopScene"]]);
  assert.strictEqual(FakeWindow.instances[0].visible, false);
});

test("quick menu settings button stays local to the menu runtime", () => {
  const { calls, ipcMain, runtime } = createHarness();
  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });

  ipcMain.send("pet-quick-menu-action", { id: "settings" });

  assert.ok(calls.some((call) => call[0] === "openSettingsWindow"));
});
