"use strict";

(function initPetGestureRouter(root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.CoPetsGestureRouter = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createPetGestureRouter() {
  const DEFAULT_DRAG_THRESHOLD_PX = 8;
  const DEFAULT_DRAG_AXIS_RATIO = 1.2;

  const DEFAULT_TRIGGER_ACTIONS = Object.freeze({
    hover: "annoyedOrSideClick",
    singleClick: "sideClick",
    doubleClick: "annoyedOrSideClick",
    multiClick: "double",
    dragStart: "drag",
    dragUp: "liftUp",
    rightClick: "quickMenu",
  });

  const DIRECTIONAL_TRIGGER_BY_BASE = Object.freeze({
    singleClick: Object.freeze({
      left: "singleClickLeft",
      right: "singleClickRight",
    }),
    doubleClick: Object.freeze({
      left: "doubleClickLeft",
      right: "doubleClickRight",
    }),
    dragStart: Object.freeze({
      left: "dragLeft",
      right: "dragRight",
      up: "dragUp",
    }),
  });

  function isPlainObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function classifyClickSide(clientX, width) {
    if (!isFiniteNumber(clientX) || !isFiniteNumber(width) || width <= 0) return null;
    return clientX < width / 2 ? "left" : "right";
  }

  function classifyDragDirection(dx, dy, options = {}) {
    if (!isFiniteNumber(dx) || !isFiniteNumber(dy)) return null;
    const threshold = isFiniteNumber(options.thresholdPx)
      ? Math.max(0, options.thresholdPx)
      : DEFAULT_DRAG_THRESHOLD_PX;
    const axisRatio = isFiniteNumber(options.axisRatio) && options.axisRatio > 0
      ? options.axisRatio
      : DEFAULT_DRAG_AXIS_RATIO;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (absX >= threshold && absX >= absY * axisRatio) {
      return dx < 0 ? "left" : "right";
    }
    if (options.includeVertical && absY >= threshold && absY >= absX * axisRatio) {
      return dy < 0 ? "up" : "down";
    }
    return null;
  }

  function classifyDrag(dx, dy, options = {}) {
    const direction = classifyDragDirection(dx, dy, options);
    const absX = Math.abs(isFiniteNumber(dx) ? dx : 0);
    const absY = Math.abs(isFiniteNumber(dy) ? dy : 0);
    let primaryAxis = null;
    if (direction === "left" || direction === "right") {
      primaryAxis = "x";
    } else if (direction === "up" || direction === "down") {
      primaryAxis = "y";
    } else if (absX || absY) {
      primaryAxis = absX >= absY ? "x" : "y";
    }
    return {
      dx: isFiniteNumber(dx) ? dx : 0,
      dy: isFiniteNumber(dy) ? dy : 0,
      direction,
      primaryAxis,
    };
  }

  function getTriggers(behavior) {
    if (!isPlainObject(behavior)) return {};
    return isPlainObject(behavior.triggers) ? behavior.triggers : behavior;
  }

  function hasAction(triggers, triggerName) {
    return Object.prototype.hasOwnProperty.call(triggers, triggerName)
      && typeof triggers[triggerName] === "string"
      && triggers[triggerName].length > 0;
  }

  function getBaseTriggerForGesture(gesture) {
    if (!isPlainObject(gesture)) return null;
    if (gesture.kind === "hover") return "hover";
    if (gesture.kind === "contextMenu") return "rightClick";
    if (gesture.kind === "drag") return "dragStart";
    if (gesture.kind === "click") {
      const clickCount = Number.isFinite(gesture.clickCount) ? gesture.clickCount : 1;
      if (clickCount >= 4) return "multiClick";
      if (clickCount >= 2) return "doubleClick";
      return "singleClick";
    }
    return null;
  }

  function getGestureDirection(gesture) {
    if (!isPlainObject(gesture)) return null;
    if (gesture.kind === "click" || gesture.kind === "hover") {
      return gesture.side === "left" || gesture.side === "right" ? gesture.side : null;
    }
    if (gesture.kind === "drag" && isPlainObject(gesture.drag)) {
      const direction = gesture.drag.direction;
      return direction === "left" || direction === "right" || direction === "up" ? direction : null;
    }
    return null;
  }

  function getDirectionalTrigger(baseTrigger, direction) {
    const map = DIRECTIONAL_TRIGGER_BY_BASE[baseTrigger];
    if (!map) return null;
    return map[direction] || null;
  }

  function resolveTriggerAction(behavior, gesture, fallbackAction) {
    const triggers = getTriggers(behavior);
    const baseTrigger = getBaseTriggerForGesture(gesture);
    const direction = getGestureDirection(gesture);
    const directionalTrigger = direction ? getDirectionalTrigger(baseTrigger, direction) : null;

    if (directionalTrigger && hasAction(triggers, directionalTrigger)) {
      return {
        action: triggers[directionalTrigger],
        trigger: directionalTrigger,
        baseTrigger,
        direction,
        inherited: false,
      };
    }

    if (baseTrigger && hasAction(triggers, baseTrigger)) {
      return {
        action: triggers[baseTrigger],
        trigger: baseTrigger,
        baseTrigger,
        direction,
        inherited: !!directionalTrigger,
      };
    }

    return {
      action: fallbackAction || DEFAULT_TRIGGER_ACTIONS[baseTrigger] || "none",
      trigger: baseTrigger,
      baseTrigger,
      direction,
      inherited: !!directionalTrigger,
    };
  }

  return {
    DEFAULT_DRAG_THRESHOLD_PX,
    DEFAULT_DRAG_AXIS_RATIO,
    DEFAULT_TRIGGER_ACTIONS,
    DIRECTIONAL_TRIGGER_BY_BASE,
    classifyClickSide,
    classifyDragDirection,
    classifyDrag,
    getBaseTriggerForGesture,
    getDirectionalTrigger,
    resolveTriggerAction,
  };
});
