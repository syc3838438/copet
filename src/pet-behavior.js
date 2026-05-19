"use strict";

const ACTIONS = new Set([
  "none",
  "focusTerminal",
  "contextMenu",
  "dashboard",
  "drag",
  "clickLeft",
  "clickRight",
  "sideClick",
  "annoyed",
  "annoyedOrSideClick",
  "double",
]);

const TRIGGERS = new Set([
  "singleClick",
  "doubleClick",
  "multiClick",
  "dragStart",
  "rightClick",
]);

const DEFAULT_BEHAVIOR = Object.freeze({
  triggers: Object.freeze({
    singleClick: "focusTerminal",
    doubleClick: "annoyedOrSideClick",
    multiClick: "double",
    dragStart: "drag",
    rightClick: "contextMenu",
  }),
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneDefaultBehavior() {
  return {
    triggers: { ...DEFAULT_BEHAVIOR.triggers },
  };
}

function normalizePetBehavior(value) {
  const out = cloneDefaultBehavior();
  if (!isPlainObject(value)) return out;
  const triggers = isPlainObject(value.triggers) ? value.triggers : value;
  for (const [trigger, action] of Object.entries(triggers)) {
    if (!TRIGGERS.has(trigger)) continue;
    if (!ACTIONS.has(action)) continue;
    out.triggers[trigger] = action;
  }
  return out;
}

function validatePetBehavior(value) {
  if (!isPlainObject(value)) {
    return { status: "error", message: "petBehavior must be an object" };
  }
  const triggers = isPlainObject(value.triggers) ? value.triggers : value;
  for (const [trigger, action] of Object.entries(triggers)) {
    if (!TRIGGERS.has(trigger)) {
      return { status: "error", message: `unknown pet behavior trigger: ${trigger}` };
    }
    if (!ACTIONS.has(action)) {
      return { status: "error", message: `unknown pet behavior action: ${action}` };
    }
  }
  return { status: "ok" };
}

module.exports = {
  ACTIONS,
  TRIGGERS,
  DEFAULT_BEHAVIOR,
  cloneDefaultBehavior,
  normalizePetBehavior,
  validatePetBehavior,
};
