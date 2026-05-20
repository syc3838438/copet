"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const vm = require("node:vm");

const SOURCE = fs.readFileSync("src/settings-tab-behavior.js", "utf8");

class ElementForTest {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.listeners = new Map();
    this.className = "";
    this.textContent = "";
    this.value = "";
    this.disabled = false;
    this.type = "";
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener(type, cb) {
    this.listeners.set(type, cb);
  }

  dispatchEvent(event) {
    const cb = this.listeners.get(event.type);
    if (cb) cb(event);
  }
}

function collect(node, predicate, out = []) {
  if (predicate(node)) out.push(node);
  for (const child of node.children || []) collect(child, predicate, out);
  return out;
}

function createHarness(snapshot) {
  const updateCalls = [];
  const toasts = [];
  const context = {
    globalThis: null,
    window: {
      settingsAPI: {
        update(key, value) {
          updateCalls.push({ key, value });
          return Promise.resolve({ status: "ok" });
        },
      },
    },
    document: {
      createElement: (tagName) => new ElementForTest(tagName),
    },
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(SOURCE, context, { filename: "src/settings-tab-behavior.js" });

  const core = {
    state: { snapshot },
    helpers: {
      buildSection(title, rows) {
        const section = new ElementForTest("section");
        section.title = title;
        for (const row of rows) section.appendChild(row);
        return section;
      },
    },
    ops: {
      showToast: (message) => toasts.push(message),
    },
    tabs: {},
  };
  context.ClawdSettingsTabBehavior.init(core);
  const parent = new ElementForTest("main");
  core.tabs.behavior.render(parent, core);

  return { parent, updateCalls, toasts };
}

test("behavior settings tab renders Chinese directional rows with inherit defaults", () => {
  const { parent } = createHarness({
    petBehavior: {
      triggers: {
        singleClick: "focusTerminal",
        dragStart: "drag",
      },
    },
  });

  const labels = collect(parent, (node) => node.className === "row-label")
    .map((node) => node.textContent);
  assert.ok(labels.includes("左侧单击动作"));
  assert.ok(labels.includes("右侧双击动作"));
  assert.ok(labels.includes("向左拖动动作"));
  assert.ok(labels.includes("向右拖动动作"));

  const selects = collect(parent, (node) => node.tagName === "select");
  assert.strictEqual(selects.length, 11);
  assert.strictEqual(selects[1].value, "__inherit__");
  assert.strictEqual(selects[8].value, "__inherit__");
});

test("behavior settings tab saves and clears explicit directional triggers", async () => {
  const { parent, updateCalls, toasts } = createHarness({
    petBehavior: {
      triggers: {
        singleClick: "focusTerminal",
        dragStart: "drag",
      },
    },
  });
  const selects = collect(parent, (node) => node.tagName === "select");
  const dragLeft = selects[8];

  dragLeft.value = "clickLeft";
  dragLeft.dispatchEvent({ type: "change" });
  await Promise.resolve();
  await Promise.resolve();

  assert.strictEqual(updateCalls[0].key, "petBehavior");
  assert.strictEqual(updateCalls[0].value.triggers.dragLeft, "clickLeft");
  assert.ok(toasts.includes("行为设置已保存"));

  dragLeft.value = "__inherit__";
  dragLeft.dispatchEvent({ type: "change" });
  await Promise.resolve();
  await Promise.resolve();

  assert.strictEqual(updateCalls[1].key, "petBehavior");
  assert.strictEqual(Object.prototype.hasOwnProperty.call(updateCalls[1].value.triggers, "dragLeft"), false);
});
