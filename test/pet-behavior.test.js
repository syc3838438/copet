"use strict";

const test = require("node:test");
const assert = require("node:assert");

const {
  cloneDefaultBehavior,
  normalizePetBehavior,
  validatePetBehavior,
} = require("../src/pet-behavior");

test("default pet behavior uses visible standalone desktop-pet actions", () => {
  assert.deepStrictEqual(cloneDefaultBehavior(), {
    triggers: {
      singleClick: "sideClick",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "quickMenu",
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
      singleClick: "sideClick",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "quickMenu",
      singleClickLeft: "clickLeft",
      singleClickRight: "clickRight",
      doubleClickLeft: "clickLeft",
      doubleClickRight: "clickRight",
      dragLeft: "clickLeft",
      dragRight: "clickRight",
    },
  });
});

test("pet behavior migrates legacy agent actions to desktop-pet actions", () => {
  assert.deepStrictEqual(normalizePetBehavior({
    triggers: {
      singleClick: "focusTerminal",
      rightClick: "dashboard",
    },
  }), {
    triggers: {
      singleClick: "sideClick",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "quickMenu",
    },
  });
  assert.deepStrictEqual(validatePetBehavior({
    triggers: {
      singleClick: "focusTerminal",
      rightClick: "dashboard",
    },
  }), { status: "ok" });
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
