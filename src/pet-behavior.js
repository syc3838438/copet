"use strict";

const ACTIONS = new Set([
  "none",
  "contextMenu",
  "quickMenu",
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
  "singleClickLeft",
  "singleClickRight",
  "doubleClick",
  "doubleClickLeft",
  "doubleClickRight",
  "multiClick",
  "dragStart",
  "dragLeft",
  "dragRight",
  "rightClick",
]);

const DEFAULT_BEHAVIOR = Object.freeze({
  triggers: Object.freeze({
    singleClick: "sideClick",
    doubleClick: "annoyedOrSideClick",
    multiClick: "double",
    dragStart: "drag",
    rightClick: "quickMenu",
  }),
});

const LEGACY_ACTION_MIGRATIONS = Object.freeze({
  focusTerminal: "sideClick",
  dashboard: "quickMenu",
});

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneDefaultBehavior() {
  return {
    triggers: { ...DEFAULT_BEHAVIOR.triggers },
  };
}

function normalizeAction(action) {
  if (typeof action !== "string" || !action) return null;
  return LEGACY_ACTION_MIGRATIONS[action] || action;
}

function normalizePetBehavior(value) {
  const out = cloneDefaultBehavior();
  if (!isPlainObject(value)) return out;
  const triggers = isPlainObject(value.triggers) ? value.triggers : value;
  for (const [trigger, action] of Object.entries(triggers)) {
    const normalizedAction = normalizeAction(action);
    if (!TRIGGERS.has(trigger)) continue;
    if (!ACTIONS.has(normalizedAction)) continue;
    out.triggers[trigger] = normalizedAction;
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
    if (!ACTIONS.has(action) && !LEGACY_ACTION_MIGRATIONS[action]) {
      return { status: "error", message: `unknown pet behavior action: ${action}` };
    }
  }
  return { status: "ok" };
}

module.exports = {
  ACTIONS,
  TRIGGERS,
  DEFAULT_BEHAVIOR,
  LEGACY_ACTION_MIGRATIONS,
  cloneDefaultBehavior,
  normalizePetBehavior,
  validatePetBehavior,
};
