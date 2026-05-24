"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  classifyClickSide,
  classifyDragDirection,
  classifyDrag,
  resolveTriggerAction,
} = require("../src/pet-gesture-router");

test("classifies click side from the hit area midpoint", () => {
  assert.strictEqual(classifyClickSide(0, 100), "left");
  assert.strictEqual(classifyClickSide(49, 100), "left");
  assert.strictEqual(classifyClickSide(50, 100), "right");
  assert.strictEqual(classifyClickSide(99, 100), "right");
  assert.strictEqual(classifyClickSide(10, 0), null);
});

test("classifies horizontal drag direction only after a stable threshold", () => {
  assert.strictEqual(classifyDragDirection(-7, 0), null);
  assert.strictEqual(classifyDragDirection(-8, 0), "left");
  assert.strictEqual(classifyDragDirection(8, 0), "right");
  assert.strictEqual(classifyDragDirection(-12, 11), null);
  assert.strictEqual(classifyDragDirection(20, 10), "right");
  assert.strictEqual(classifyDragDirection(3, 20), null);
});

test("classifyDrag preserves delta and primary axis while reserving vertical support", () => {
  assert.deepStrictEqual(classifyDrag(-20, 3), {
    dx: -20,
    dy: 3,
    direction: "left",
    primaryAxis: "x",
  });
  assert.deepStrictEqual(classifyDrag(2, 20), {
    dx: 2,
    dy: 20,
    direction: null,
    primaryAxis: "y",
  });
  assert.strictEqual(classifyDragDirection(0, -12, { includeVertical: true }), "up");
});

test("resolves directional click triggers before generic click triggers", () => {
  const behavior = {
    triggers: {
      singleClick: "focusTerminal",
      singleClickLeft: "clickLeft",
      singleClickRight: "clickRight",
      doubleClick: "annoyedOrSideClick",
      doubleClickRight: "double",
    },
  };

  assert.deepStrictEqual(
    resolveTriggerAction(behavior, { kind: "click", clickCount: 1, side: "left" }),
    {
      action: "clickLeft",
      trigger: "singleClickLeft",
      baseTrigger: "singleClick",
      direction: "left",
      inherited: false,
    }
  );

  assert.deepStrictEqual(
    resolveTriggerAction(behavior, { kind: "click", clickCount: 2, side: "left" }),
    {
      action: "annoyedOrSideClick",
      trigger: "doubleClick",
      baseTrigger: "doubleClick",
      direction: "left",
      inherited: true,
    }
  );

  assert.deepStrictEqual(
    resolveTriggerAction(behavior, { kind: "click", clickCount: 2, side: "right" }),
    {
      action: "double",
      trigger: "doubleClickRight",
      baseTrigger: "doubleClick",
      direction: "right",
      inherited: false,
    }
  );
});

test("resolves directional drag triggers before generic dragStart", () => {
  const behavior = {
    triggers: {
      dragStart: "drag",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
      dragUp: "liftUp",
    },
  };

  assert.strictEqual(
    resolveTriggerAction(behavior, {
      kind: "drag",
      drag: classifyDrag(-20, 0),
    }).action,
    "clickLeft"
  );
  assert.strictEqual(
    resolveTriggerAction(behavior, {
      kind: "drag",
      drag: classifyDrag(20, 0),
    }).action,
    "clickRight"
  );
  assert.strictEqual(
    resolveTriggerAction(behavior, {
      kind: "drag",
      drag: classifyDrag(2, 20),
    }).action,
    "drag"
  );
  assert.strictEqual(
    resolveTriggerAction(behavior, {
      kind: "drag",
      drag: classifyDrag(0, -20, { includeVertical: true }),
    }).action,
    "liftUp"
  );
});

test("resolves hover trigger as a desktop-pet interaction", () => {
  const behavior = {
    triggers: {
      hover: "sideClick",
    },
  };

  assert.deepStrictEqual(
    resolveTriggerAction(behavior, { kind: "hover", side: "right" }),
    {
      action: "sideClick",
      trigger: "hover",
      baseTrigger: "hover",
      direction: "right",
      inherited: false,
    }
  );

  assert.deepStrictEqual(
    resolveTriggerAction({}, { kind: "hover", side: "left" }),
    {
      action: "annoyedOrSideClick",
      trigger: "hover",
      baseTrigger: "hover",
      direction: "left",
      inherited: false,
    }
  );
});

test("keeps legacy behavior when directional triggers are absent", () => {
  const behavior = {
    triggers: {
      singleClick: "focusTerminal",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "contextMenu",
    },
  };

  assert.strictEqual(
    resolveTriggerAction(behavior, { kind: "click", clickCount: 1, side: "left" }).action,
    "focusTerminal"
  );
  assert.strictEqual(
    resolveTriggerAction(behavior, { kind: "drag", drag: classifyDrag(20, 0) }).action,
    "drag"
  );
  assert.strictEqual(
    resolveTriggerAction(behavior, { kind: "contextMenu" }).action,
    "contextMenu"
  );
});
