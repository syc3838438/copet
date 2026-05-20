"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  cloneDefaultBehavior,
  normalizePetBehavior,
  validatePetBehavior,
} = require("../src/pet-behavior");

test("default pet behavior keeps legacy generic triggers only", () => {
  assert.deepStrictEqual(cloneDefaultBehavior(), {
    triggers: {
      singleClick: "focusTerminal",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "contextMenu",
    },
  });
});

test("pet behavior accepts directional click and drag triggers", () => {
  const behavior = {
    triggers: {
      singleClickLeft: "clickLeft",
      singleClickRight: "clickRight",
      doubleClickLeft: "clickLeft",
      doubleClickRight: "clickRight",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
    },
  };

  assert.deepStrictEqual(validatePetBehavior(behavior), { status: "ok" });
  assert.deepStrictEqual(normalizePetBehavior(behavior), {
    triggers: {
      singleClick: "focusTerminal",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "contextMenu",
      singleClickLeft: "clickLeft",
      singleClickRight: "clickRight",
      doubleClickLeft: "clickLeft",
      doubleClickRight: "clickRight",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
    },
  });
});

test("pet behavior still rejects unknown triggers and actions", () => {
  assert.deepStrictEqual(validatePetBehavior({
    triggers: { clickLeft: "double" },
  }), {
    status: "error",
    message: "unknown pet behavior trigger: clickLeft",
  });

  assert.deepStrictEqual(validatePetBehavior({
    triggers: { dragLeft: "not-real" },
  }), {
    status: "error",
    message: "unknown pet behavior action: not-real",
  });
});
