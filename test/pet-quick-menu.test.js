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
  let sleeping = !!overrides.sleeping;
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
    sendToHitWin: (...args) => calls.push(["sendToHitWin", ...args]),
    openSettingsWindow: () => calls.push(["openSettingsWindow"]),
    getDoNotDisturb: () => sleeping,
    enableDoNotDisturb: () => {
      sleeping = true;
      calls.push(["enableDoNotDisturb"]);
    },
    disableDoNotDisturb: () => {
      sleeping = false;
      calls.push(["disableDoNotDisturb"]);
    },
  });
  return { calls, ipcMain, runtime };
}

test("quick menu positions near the pet and clamps inside the work area", () => {
  const { runtime } = createHarness({ workArea: { x: 0, y: 0, width: 300, height: 200 } });

  assert.deepStrictEqual(runtime.__test.computeBounds({ x: 10, y: 190 }), {
    x: 0,
    y: 130,
    width: 492,
    height: 52,
  });
});

test("quick menu show sends current sleep state and toggles when already visible", () => {
  const { calls, runtime } = createHarness({ sleeping: true });

  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });
  const win = FakeWindow.instances[0];

  assert.strictEqual(win.visible, true);
  assert.deepStrictEqual(win.webContents.sent, [["pet-quick-menu-state", { sleeping: true }]]);
  assert.deepStrictEqual(calls, [
    ["guardAlwaysOnTop", true],
    ["keepOutOfTaskbar", true],
  ]);

  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });
  assert.strictEqual(win.visible, false);
});

test("quick menu action buttons send immediate pet actions", () => {
  const { calls, ipcMain, runtime } = createHarness();
  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });

  ipcMain.send("pet-quick-menu-action", {
    id: "clickLeft",
    action: "clickLeft",
    side: "left",
  });

  assert.deepStrictEqual(calls.slice(-1), [
    ["sendToHitWin", "pet-quick-action", { action: "clickLeft", side: "left" }],
  ]);
  assert.strictEqual(FakeWindow.instances[0].visible, false);
});

test("quick menu sleep and settings buttons stay local to the menu runtime", () => {
  const { calls, ipcMain, runtime } = createHarness();
  runtime.show({ sender: "hit-web-contents" }, { clientX: 10, clientY: 12 });

  ipcMain.send("pet-quick-menu-action", { id: "sleepToggle" });
  ipcMain.send("pet-quick-menu-action", { id: "settings" });

  assert.ok(calls.some((call) => call[0] === "enableDoNotDisturb"));
  assert.ok(calls.some((call) => call[0] === "openSettingsWindow"));
});

