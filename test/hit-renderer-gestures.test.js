"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");

const gestureRouter = require("../src/pet-gesture-router");

const HIT_RENDERER_SOURCE = fs.readFileSync("src/hit-renderer.js", "utf8");

class EventTargetForTest {
  constructor() {
    this.listeners = new Map();
    this.style = {};
    this.offsetWidth = 100;
    this.classList = {
      values: new Set(),
      add: (name) => this.classList.values.add(name),
      remove: (name) => this.classList.values.delete(name),
      contains: (name) => this.classList.values.has(name),
    };
  }

  addEventListener(type, cb) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(cb);
  }

  setPointerCapture() {}

  dispatch(type, event = {}) {
    const payload = {
      button: 0,
      pointerId: 1,
      clientX: 50,
      clientY: 20,
      ctrlKey: false,
      metaKey: false,
      preventDefault() {},
      ...event,
    };
    for (const cb of this.listeners.get(type) || []) cb(payload);
  }
}

function createHarness(behavior, options = {}) {
  const logs = [];
  const timers = new Map();
  let nextTimerId = 1;
  let rafId = 0;
  let stateSyncCb = null;
  let quickActionCb = null;
  const area = new EventTargetForTest();
  const document = new EventTargetForTest();
  const win = new EventTargetForTest();

  document.getElementById = (id) => (id === "hit-area" ? area : null);
  win.CoPetsGestureRouter = gestureRouter;
  win.hitThemeConfig = {
    behavior,
    standalonePet: !!options.standalonePet,
    reactions: {
      drag: { file: "drag.svg" },
      hover: { file: "hover.svg" },
      click: { file: "click.svg" },
      dragLeft: { file: "drag-left.svg" },
      dragRight: { file: "drag-right.svg" },
      liftUp: { file: "lift-up.svg" },
      clickLeft: { file: "left.svg", durationMs: 25 },
      clickRight: { file: "right.svg", durationMs: 25 },
      double: { file: "double.svg", durationMs: 25 },
    },
  };
  win.hitAPI = {
    onThemeConfig() {},
    onStateSync(cb) { stateSyncCb = cb; },
    onCancelReaction() {},
    dragLock(value) { logs.push(["dragLock", value]); },
    dragMove() { logs.push(["dragMove"]); },
    dragEnd() { logs.push(["dragEnd"]); },
    showContextMenu() { logs.push(["showContextMenu"]); },
    showPetQuickMenu(payload) { logs.push(["showPetQuickMenu", payload]); },
    focusTerminal() { logs.push(["focusTerminal"]); },
    exitMiniMode() { logs.push(["exitMiniMode"]); },
    showDashboard() { logs.push(["showDashboard"]); },
    startDragReaction() { logs.push(["startDragReaction"]); },
    endDragReaction() { logs.push(["endDragReaction"]); },
    playClickReaction(svg, duration) { logs.push(["playClickReaction", svg, duration]); },
    onQuickAction(cb) { quickActionCb = cb; },
  };

  const context = {
    window: win,
    document,
    console,
    Math,
    setTimeout(cb) {
      const id = nextTimerId++;
      timers.set(id, cb);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    requestAnimationFrame(cb) {
      cb();
      return ++rafId;
    },
    cancelAnimationFrame() {},
  };
  vm.createContext(context);
  vm.runInContext(HIT_RENDERER_SOURCE, context, { filename: "src/hit-renderer.js" });
  assert.strictEqual(typeof stateSyncCb, "function");
  stateSyncCb({
    currentState: options.currentState || "idle",
    miniMode: false,
    dndEnabled: !!options.dndEnabled,
  });

  return {
    area,
    document,
    logs,
    quickAction(payload) {
      assert.strictEqual(typeof quickActionCb, "function");
      quickActionCb(payload);
    },
    flushTimers() {
      const callbacks = [...timers.values()];
      timers.clear();
      for (const cb of callbacks) cb();
    },
  };
}

function pointerClick(harness, x) {
  harness.area.dispatch("pointerdown", { button: 0, clientX: x, clientY: 20 });
  harness.document.dispatch("pointerup", { button: 0, clientX: x, clientY: 20 });
  harness.flushTimers();
}

function pointerDrag(harness, fromX, toX) {
  harness.area.dispatch("pointerdown", { button: 0, clientX: fromX, clientY: 20 });
  harness.document.dispatch("pointermove", { button: 0, clientX: toX, clientY: 20 });
  harness.document.dispatch("pointerup", { button: 0, clientX: toX, clientY: 20 });
}

function reactionLogs(harness) {
  return harness.logs.filter((entry) => entry[0] === "playClickReaction");
}

test("hit renderer routes left and right single-click triggers independently", () => {
  let harness = createHarness({
    triggers: {
      singleClick: "focusTerminal",
      singleClickLeft: "clickLeft",
      singleClickRight: "clickRight",
    },
  });
  pointerClick(harness, 20);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "left.svg", 25]]);

  harness = createHarness({
    triggers: {
      singleClick: "focusTerminal",
      singleClickLeft: "clickLeft",
      singleClickRight: "clickRight",
    },
  });
  pointerClick(harness, 80);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "right.svg", 25]]);
});

test("hit renderer preserves legacy sideClick behavior for left and right clicks", () => {
  let harness = createHarness({ triggers: { singleClick: "sideClick" } });
  pointerClick(harness, 20);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "left.svg", 25]]);

  harness = createHarness({ triggers: { singleClick: "sideClick" } });
  pointerClick(harness, 80);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "right.svg", 25]]);
});

test("hit renderer routes left and right drag triggers independently", () => {
  let harness = createHarness({
    triggers: {
      dragStart: "drag",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
    },
  });
  pointerDrag(harness, 80, 40);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "left.svg", 25]]);

  harness = createHarness({
    triggers: {
      dragStart: "drag",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
    },
  });
  pointerDrag(harness, 20, 60);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "right.svg", 25]]);
});

test("hit renderer lets dragStart sideClick use drag direction instead of always left", () => {
  let harness = createHarness({ triggers: { dragStart: "sideClick" } });
  pointerDrag(harness, 80, 40);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "left.svg", 25]]);

  harness = createHarness({ triggers: { dragStart: "sideClick" } });
  pointerDrag(harness, 20, 60);
  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "right.svg", 25]]);
});

test("hit renderer falls back to legacy dragStart when directional triggers are absent", () => {
  const harness = createHarness({ triggers: { dragStart: "drag" } });
  pointerDrag(harness, 20, 60);
  assert.ok(harness.logs.some((entry) => entry[0] === "startDragReaction"));
  assert.ok(harness.logs.some((entry) => entry[0] === "endDragReaction"));
});

test("hit renderer keeps standalone non-idle clicks as pet interactions", () => {
  const harness = createHarness(
    { triggers: { singleClick: "sideClick" } },
    { standalonePet: true, currentState: "thinking" }
  );

  pointerClick(harness, 20);

  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "click.svg", 840]]);
  assert.ok(!harness.logs.some((entry) => entry[0] === "focusTerminal"));
});

test("hit renderer sends right-clicks to the standalone quick menu", () => {
  const harness = createHarness({ triggers: { rightClick: "quickMenu" } }, { standalonePet: true });

  harness.document.dispatch("contextmenu", { clientX: 64, clientY: 22 });

  assert.strictEqual(harness.logs.length, 1);
  assert.strictEqual(harness.logs[0][0], "showPetQuickMenu");
  assert.strictEqual(harness.logs[0][1].clientX, 64);
  assert.strictEqual(harness.logs[0][1].clientY, 22);
});

test("hit renderer quick-menu actions immediately play reactions", () => {
  const harness = createHarness({ triggers: { singleClick: "sideClick" } }, { standalonePet: true });

  harness.quickAction({ action: "dragRight", side: "right" });

  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "drag-right.svg", 1200]]);
});

test("hit renderer plays fixed standalone hover reactions when the pointer enters the pet", () => {
  const harness = createHarness({ triggers: { hover: "sideClick" } }, { standalonePet: true });

  harness.area.dispatch("pointerenter", { clientX: 80, clientY: 20 });
  harness.flushTimers();
  harness.area.dispatch("pointerenter", { clientX: 20, clientY: 20 });

  assert.deepStrictEqual(reactionLogs(harness), [["playClickReaction", "hover.svg", 3000]]);
});

test("hit renderer suppresses hover reactions while sleeping", () => {
  const harness = createHarness(
    { triggers: { hover: "sideClick" } },
    { standalonePet: true, dndEnabled: true }
  );

  harness.area.dispatch("pointerenter", { clientX: 80, clientY: 20 });
  harness.flushTimers();

  assert.deepStrictEqual(reactionLogs(harness), []);
});

test("hit renderer reapplies drag reactions when horizontal direction reverses", () => {
  const harness = createHarness({
    triggers: {
      dragStart: "drag",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
    },
  });

  harness.area.dispatch("pointerdown", { button: 0, clientX: 80, clientY: 20 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 40, clientY: 20 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 95, clientY: 20 });
  harness.document.dispatch("pointerup", { button: 0, clientX: 95, clientY: 20 });

  assert.deepStrictEqual(reactionLogs(harness), [
    ["playClickReaction", "left.svg", 25],
    ["playClickReaction", "right.svg", 25],
  ]);
});

test("standalone drag switches left to right without waiting for the old reaction", () => {
  const harness = createHarness({}, { standalonePet: true });

  harness.area.dispatch("pointerdown", { button: 0, clientX: 80, clientY: 30 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 40, clientY: 30 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 50, clientY: 30 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 62, clientY: 30 });
  harness.document.dispatch("pointerup", { button: 0, clientX: 62, clientY: 30 });

  assert.deepStrictEqual(reactionLogs(harness), [
    ["playClickReaction", "drag-left.svg", 1200],
    ["playClickReaction", "drag-right.svg", 1200],
    ["playClickReaction", "drag-right.svg", 1200],
  ]);
});

test("standalone drag switches from horizontal dragging to lift-up", () => {
  const harness = createHarness({}, { standalonePet: true });

  harness.area.dispatch("pointerdown", { button: 0, clientX: 80, clientY: 60 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 40, clientY: 60 });
  harness.document.dispatch("pointermove", { button: 0, clientX: 40, clientY: 48 });
  harness.document.dispatch("pointerup", { button: 0, clientX: 40, clientY: 48 });

  assert.deepStrictEqual(reactionLogs(harness), [
    ["playClickReaction", "drag-left.svg", 1200],
    ["playClickReaction", "lift-up.svg", 900],
    ["playClickReaction", "lift-up.svg", 900],
  ]);
});
