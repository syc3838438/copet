// --- Input window: pointer capture, drag, click detection ---
// This is the "controller" — all input decisions happen here.
// Render window is pure "view" — receives reaction commands via IPC relay.

const area = document.getElementById("hit-area");
const gestureRouter = window.CoPetsGestureRouter;

const DEFAULT_BEHAVIOR = {
  triggers: {
    hover: "annoyedOrSideClick",
    singleClick: "sideClick",
    doubleClick: "annoyedOrSideClick",
    multiClick: "double",
    dragStart: "drag",
    rightClick: "quickMenu",
  },
};

// ── Theme config (injected via preload-hit.js additionalArguments) ──
const STANDALONE_DRAG_TAIL_MS = 1200;
const STANDALONE_LIFT_TAIL_MS = 900;
const STANDALONE_DRAG_THRESHOLD_PX = 8;
const STANDALONE_HOVER_DURATION_MS = 3000;
const STANDALONE_ACTION_DURATIONS = {
  hover: STANDALONE_HOVER_DURATION_MS,
  click: 840,
  dragLeft: STANDALONE_DRAG_TAIL_MS,
  dragRight: STANDALONE_DRAG_TAIL_MS,
  liftUp: STANDALONE_LIFT_TAIL_MS,
};
const STANDALONE_QUICK_ACTIONS = new Set(["hover", "click", "dragLeft", "dragRight", "liftUp"]);

let tc = window.hitThemeConfig || {};
let _reactions = (tc && tc.reactions) || {};
let _behavior = normalizeBehavior(tc && tc.behavior);

function isStandalonePet() {
  return !!(tc && tc.standalonePet);
}

// Theme switch: IPC push overrides additionalArguments
if (window.hitAPI && window.hitAPI.onThemeConfig) {
  window.hitAPI.onThemeConfig((cfg) => {
    tc = cfg || {};
    _reactions = (tc && tc.reactions) || {};
    _behavior = normalizeBehavior(tc && tc.behavior);
  });
}

function normalizeBehavior(value) {
  const out = {
    triggers: { ...DEFAULT_BEHAVIOR.triggers },
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  const triggers = value.triggers && typeof value.triggers === "object" && !Array.isArray(value.triggers)
    ? value.triggers
    : value;
  for (const [trigger, action] of Object.entries(triggers)) {
    if (typeof action === "string" && action) out.triggers[trigger] = action;
  }
  return out;
}

// --- State synced from main ---
let currentSvg = null;
let currentState = null;
let miniMode = false;
let dndEnabled = false;

window.hitAPI.onStateSync((data) => {
  if (data.currentSvg !== undefined) currentSvg = data.currentSvg;
  if (data.currentState !== undefined) currentState = data.currentState;
  if (data.miniMode !== undefined) {
    miniMode = data.miniMode;
    area.style.cursor = miniMode ? "default" : "";
  }
  if (data.dndEnabled !== undefined) dndEnabled = data.dndEnabled;
});

// --- Drag state ---
let isDragging = false;
let didDrag = false;
let mouseDownX, mouseDownY;
let lastPointerX, lastPointerY;
let dragGesture = null;
let dragAccumX = 0;
let dragAccumY = 0;
let activeDragAction = null;
let dragMoveRAF = null;
const DRAG_THRESHOLD = gestureRouter && gestureRouter.DEFAULT_DRAG_THRESHOLD_PX
  ? gestureRouter.DEFAULT_DRAG_THRESHOLD_PX
  : 8;

// --- Reaction state (tracked here to gate input) ---
let isReacting = false;
let isDragReacting = false;
let reactionTimer = null;
let lastHoverReactionAt = 0;
const HOVER_REACTION_COOLDOWN_MS = 2500;

// Cancel signal from main (e.g. state change)
window.hitAPI.onCancelReaction(() => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
  if (reactionTimer) { clearTimeout(reactionTimer); reactionTimer = null; }
  dragGesture = null;
  dragAccumX = 0;
  dragAccumY = 0;
  isReacting = false;
  isDragReacting = false;
});

function queueDragMove() {
  if (dragMoveRAF !== null) return;
  dragMoveRAF = requestAnimationFrame(() => {
    dragMoveRAF = null;
    if (!isDragging) return;
    window.hitAPI.dragMove();
  });
}

function clearQueuedDragMove() {
  if (dragMoveRAF === null) return;
  cancelAnimationFrame(dragMoveRAF);
  dragMoveRAF = null;
}

// --- Pointer handlers ---
area.addEventListener("pointerdown", (e) => {
  if (e.button === 0) {
    if (miniMode && !isStandalonePet()) { didDrag = false; return; }
    area.setPointerCapture(e.pointerId);
    isDragging = true;
    didDrag = false;
    dragGesture = null;
    dragAccumX = 0;
    dragAccumY = 0;
    activeDragAction = null;
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    window.hitAPI.dragLock(true);
    area.classList.add("dragging");
  }
});

document.addEventListener("pointermove", (e) => {
  if (isDragging) {
    const totalDx = e.clientX - mouseDownX;
    const totalDy = e.clientY - mouseDownY;
    const stepDx = e.clientX - lastPointerX;
    const stepDy = e.clientY - lastPointerY;
    if (!didDrag) {
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag = true;
        dragGesture = isStandalonePet()
          ? createStandaloneDragGesture(totalDx, totalDy)
          : createDragGesture(totalDx, totalDy);
        if (getDragDirection(dragGesture)) applyDragGesture(dragGesture);
      }
    } else {
      const nextGesture = isStandalonePet()
        ? createStandaloneDragGestureForMove(totalDx, totalDy, stepDx, stepDy)
        : createDragGestureForMove(totalDx, totalDy, stepDx, stepDy);
      if (nextGesture && shouldApplyDragGesture(nextGesture, dragGesture)) {
        dragGesture = nextGesture;
        applyDragGesture(dragGesture);
      } else if (nextGesture) {
        dragGesture = nextGesture;
      } else {
        dragGesture = createDragGesture(totalDx, totalDy, getDragDirection(dragGesture));
      }
    }
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    queueDragMove();
  }
});

function stopDrag() {
  if (!isDragging) return;
  clearQueuedDragMove();
  const tailAction = isStandalonePet() ? activeDragAction : null;
  const tailGesture = dragGesture;
  isDragging = false;
  dragGesture = null;
  dragAccumX = 0;
  dragAccumY = 0;
  activeDragAction = null;
  window.hitAPI.dragLock(false);
  area.classList.remove("dragging");
  if (didDrag) {
    window.hitAPI.dragEnd();
  }
  if (tailAction) {
    performAction(tailAction, { gesture: tailGesture, dragTail: true });
  } else {
    endDragReaction();
  }
}

document.addEventListener("pointerup", (e) => {
  if (e.button === 0) {
    const wasDrag = didDrag;
    stopDrag();
    if (!wasDrag) {
      if (e.ctrlKey || e.metaKey) {
        window.hitAPI.showDashboard();
      } else {
        handleClick(e.clientX);
      }
    }
  }
});

area.addEventListener("pointercancel", () => stopDrag());
area.addEventListener("lostpointercapture", () => { if (isDragging) stopDrag(); });
window.addEventListener("blur", stopDrag);
area.addEventListener("pointerenter", (e) => {
  handleHover(e.clientX);
});

// --- Click reaction logic (2-click = poke, 4-click = flail) ---
const CLICK_WINDOW_MS = 400;

let clickCount = 0;
let clickTimer = null;
let firstClickDir = null;

function _getReaction(name) {
  return _reactions[name] || null;
}

function _getTriggerAction(triggerName, fallback) {
  const triggers = _behavior && _behavior.triggers;
  return (triggers && triggers[triggerName]) || fallback || "none";
}

function _resolveGestureAction(gesture, fallback) {
  if (gestureRouter && typeof gestureRouter.resolveTriggerAction === "function") {
    return gestureRouter.resolveTriggerAction(_behavior, gesture, fallback).action;
  }
  const trigger = gesture && gesture.kind === "drag"
    ? "dragStart"
    : (gesture && gesture.kind === "contextMenu"
      ? "rightClick"
      : (gesture && gesture.kind === "hover" ? "hover" : "singleClick"));
  return _getTriggerAction(trigger, fallback);
}

function _resolveGesture(gesture, fallback) {
  if (gestureRouter && typeof gestureRouter.resolveTriggerAction === "function") {
    return gestureRouter.resolveTriggerAction(_behavior, gesture, fallback);
  }
  const action = _resolveGestureAction(gesture, fallback);
  return { action, trigger: null };
}

function createClickGesture(clickCount, side) {
  return {
    kind: "click",
    clickCount,
    side,
  };
}

function createHoverGesture(side) {
  return {
    kind: "hover",
    side,
  };
}

function classifyDragDirection(dx, dy) {
  return gestureRouter && typeof gestureRouter.classifyDragDirection === "function"
    ? gestureRouter.classifyDragDirection(dx, dy)
    : (Math.abs(dx) >= DRAG_THRESHOLD && Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : null);
}

function createDragGesture(dx, dy, directionOverride) {
  const drag = gestureRouter && typeof gestureRouter.classifyDrag === "function"
    ? gestureRouter.classifyDrag(dx, dy)
    : { dx, dy, direction: null, primaryAxis: Math.abs(dx) >= Math.abs(dy) ? "x" : "y" };
  if (directionOverride === "left" || directionOverride === "right" || directionOverride === "up") {
    drag.direction = directionOverride;
    drag.primaryAxis = directionOverride === "up" ? "y" : "x";
  }
  return {
    kind: "drag",
    drag,
  };
}

function createDragGestureForMove(totalDx, totalDy, stepDx, stepDy) {
  const stepDirection = classifyDragDirection(stepDx, stepDy);
  return createDragGesture(totalDx, totalDy, stepDirection);
}

function classifyStandaloneDragDirection(dx, dy) {
  if (gestureRouter && typeof gestureRouter.classifyDragDirection === "function") {
    const direction = gestureRouter.classifyDragDirection(dx, dy, {
      includeVertical: true,
      thresholdPx: STANDALONE_DRAG_THRESHOLD_PX,
    });
    return direction === "down" ? null : direction;
  }
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absY >= STANDALONE_DRAG_THRESHOLD_PX && absY >= absX * 1.2 && dy < 0) return "up";
  if (absX >= STANDALONE_DRAG_THRESHOLD_PX && absX >= absY * 1.2) return dx < 0 ? "left" : "right";
  return null;
}

function createStandaloneDragGesture(totalDx, totalDy) {
  return createDragGesture(totalDx, totalDy, classifyStandaloneDragDirection(totalDx, totalDy));
}

function createStandaloneDragGestureForMove(totalDx, totalDy, stepDx, stepDy) {
  dragAccumX += stepDx;
  dragAccumY += stepDy;
  const direction = classifyStandaloneDragDirection(dragAccumX, dragAccumY);
  if (!direction) return null;
  dragAccumX = 0;
  dragAccumY = 0;
  return createDragGesture(totalDx, totalDy, direction);
}

function getDragDirection(gesture) {
  return gesture
    && gesture.drag
    && (
      gesture.drag.direction === "left"
      || gesture.drag.direction === "right"
      || gesture.drag.direction === "up"
    )
    ? gesture.drag.direction
    : null;
}

function shouldApplyDragGesture(nextGesture, previousGesture) {
  const nextDirection = getDragDirection(nextGesture);
  if (!nextDirection) return false;
  return nextDirection !== getDragDirection(previousGesture);
}

function getGestureSide(meta) {
  if (meta && meta.quickAction && meta.side === "random") {
    return Math.random() < 0.5 ? "left" : "right";
  }
  if (meta && (meta.side === "left" || meta.side === "right")) {
    return meta.side;
  }
  const gesture = meta && meta.gesture;
  if (gesture && (gesture.side === "left" || gesture.side === "right")) {
    return gesture.side;
  }
  if (
    gesture
    && gesture.drag
    && (gesture.drag.direction === "left" || gesture.drag.direction === "right")
  ) {
    return gesture.drag.direction;
  }
  return meta && meta.firstClickDir === "right" ? "right" : "left";
}

function _pickReactionFile(reaction) {
  if (!reaction) return null;
  const files = Array.isArray(reaction.files) && reaction.files.length
    ? reaction.files
    : (reaction.file ? [reaction.file] : []);
  if (!files.length) return null;
  return files[Math.floor(Math.random() * files.length)];
}

function _playReactionByKey(reactionKey, fallbackDuration, minDuration) {
  const reaction = _getReaction(reactionKey);
  const file = _pickReactionFile(reaction);
  if (!file) return false;
  const rawDuration = reaction.duration || reaction.durationMs || fallbackDuration || 2500;
  const duration = Number.isFinite(minDuration) ? Math.max(rawDuration, minDuration) : rawDuration;
  playReaction(file, duration);
  return true;
}

function _playReactionByCandidates(reactionKeys, fallbackDuration, minDuration) {
  for (const key of reactionKeys) {
    if (_playReactionByKey(key, fallbackDuration, minDuration)) return true;
  }
  return false;
}

function getStandaloneReactionCandidates(action, meta = {}) {
  switch (action) {
    case "hover":
      return ["hover", "double", "annoyed", "click", "clickLeft", "clickRight", "drag"];
    case "click": {
      const side = getGestureSide(meta);
      return side === "right"
        ? ["click", "clickRight", "clickLeft", "double"]
        : ["click", "clickLeft", "clickRight", "double"];
    }
    case "dragLeft":
      return ["dragLeft", "clickLeft", "drag"];
    case "dragRight":
      return ["dragRight", "clickRight", "drag"];
    case "liftUp":
      return ["liftUp", "click", "double", "clickLeft", "clickRight", "drag"];
    default:
      return [];
  }
}

function performStandaloneAction(action, meta = {}) {
  const duration = STANDALONE_ACTION_DURATIONS[action] || 1000;
  const minDuration = action === "hover" ? STANDALONE_HOVER_DURATION_MS : null;
  return _playReactionByCandidates(getStandaloneReactionCandidates(action, meta), duration, minDuration);
}

function performAction(action, meta = {}) {
  if (isStandalonePet() && STANDALONE_QUICK_ACTIONS.has(action)) {
    return performStandaloneAction(action, meta);
  }
  switch (action) {
    case "none":
      return true;
    case "hover":
    case "click":
    case "dragLeft":
    case "dragRight":
    case "liftUp":
      return performStandaloneAction(action, meta);
    case "focusTerminal":
      window.hitAPI.focusTerminal();
      return true;
    case "contextMenu":
      window.hitAPI.showContextMenu();
      return true;
    case "quickMenu":
      if (window.hitAPI && typeof window.hitAPI.showPetQuickMenu === "function") {
        window.hitAPI.showPetQuickMenu({
          clientX: Number.isFinite(meta.clientX) ? meta.clientX : null,
          clientY: Number.isFinite(meta.clientY) ? meta.clientY : null,
        });
      } else {
        window.hitAPI.showContextMenu();
      }
      return true;
    case "dashboard":
      window.hitAPI.showDashboard();
      return true;
    case "drag":
      if (meta.fromDragStart) {
        isDragReacting = true;
        window.hitAPI.startDragReaction();
        return true;
      }
      return _playReactionByKey("drag", 2500);
    case "sideClick": {
      const key = getGestureSide(meta) === "right" ? "clickRight" : "clickLeft";
      return _playReactionByKey(key, 2500);
    }
    case "annoyedOrSideClick":
      if (_getReaction("annoyed") && Math.random() < 0.5) {
        return _playReactionByKey("annoyed", 3500);
      }
      return performAction("sideClick", meta);
    case "clickLeft":
    case "clickRight":
      return _playReactionByKey(action, 2500);
    case "annoyed":
    case "double":
      return _playReactionByKey(action, 3500);
    default:
      return false;
  }
}

function handleClick(clientX) {
  if (isStandalonePet()) {
    const side = gestureRouter && typeof gestureRouter.classifyClickSide === "function"
      ? gestureRouter.classifyClickSide(clientX, area.offsetWidth)
      : (clientX < area.offsetWidth / 2 ? "left" : "right");
    performAction("click", { gesture: createClickGesture(1, side), firstClickDir: side });
    return;
  }
  if (miniMode) {
    window.hitAPI.exitMiniMode();
    return;
  }
  if (isReacting || isDragReacting) return;

  // In full Clawd mode, non-idle clicks still jump back to the active session.
  // Standalone CoPets is a pure desktop pet: clicks always remain interactions.
  if (!isStandalonePet() && currentState !== "idle") {
    window.hitAPI.focusTerminal();
    return;
  }

  clickCount++;
  if (clickCount === 1) {
    firstClickDir = gestureRouter && typeof gestureRouter.classifyClickSide === "function"
      ? gestureRouter.classifyClickSide(clientX, area.offsetWidth)
      : (clientX < area.offsetWidth / 2 ? "left" : "right");
  }

  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

  if (clickCount >= 4) {
    clickCount = 0;
    const dir = firstClickDir;
    firstClickDir = null;
    const gesture = createClickGesture(4, dir);
    performAction(_resolveGestureAction(gesture, "double"), { firstClickDir: dir, gesture });
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      const count = clickCount;
      const dir = firstClickDir;
      clickCount = 0;
      firstClickDir = null;
      const fallback = count >= 2 ? "annoyedOrSideClick" : "focusTerminal";
      const gesture = createClickGesture(count >= 2 ? 2 : 1, dir);
      performAction(_resolveGestureAction(gesture, fallback), { firstClickDir: dir, gesture });
    }, CLICK_WINDOW_MS);
  }
}

function handleHover(clientX) {
  if ((!isStandalonePet() && miniMode) || dndEnabled || isDragging || isReacting || isDragReacting) return;
  const now = Date.now();
  if (now - lastHoverReactionAt < HOVER_REACTION_COOLDOWN_MS) return;
  const side = gestureRouter && typeof gestureRouter.classifyClickSide === "function"
    ? gestureRouter.classifyClickSide(clientX, area.offsetWidth)
    : (clientX < area.offsetWidth / 2 ? "left" : "right");
  const gesture = createHoverGesture(side);
  lastHoverReactionAt = now;
  performAction(isStandalonePet() ? "hover" : _resolveGestureAction(gesture, "annoyedOrSideClick"), {
    gesture,
    firstClickDir: side,
  });
}

function playReaction(svg, duration) {
  if (!svg) return;
  if (reactionTimer) {
    clearTimeout(reactionTimer);
    reactionTimer = null;
  }
  isReacting = true;
  window.hitAPI.playClickReaction(svg, duration);
  // Local timer to ungate input after duration
  reactionTimer = setTimeout(() => { isReacting = false; reactionTimer = null; }, duration);
}

// --- Drag reaction ---
function applyDragGesture(gesture) {
  if (dndEnabled) return;

  const dragStartGesture = gesture || dragGesture || createDragGesture(0, 0);
  if (isStandalonePet()) {
    const direction = getDragDirection(dragStartGesture);
    const action = direction === "left"
      ? "dragLeft"
      : (direction === "right" ? "dragRight" : (direction === "up" ? "liftUp" : null));
    if (!action) return;
    activeDragAction = action;
    performAction(action, {
      fromDragStart: true,
      gesture: dragStartGesture,
    });
    return;
  }
  const resolved = _resolveGesture(dragStartGesture, "drag");
  const action = resolved.action || "drag";
  if (action === activeDragAction && action === "drag" && isDragReacting) return;

  if (isDragReacting && action !== "drag") {
    endDragReaction();
  }

  if (isReacting && action !== activeDragAction) {
    isReacting = false;
  }

  activeDragAction = action;
  performAction(action, {
    fromDragStart: true,
    gesture: dragStartGesture,
  });
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  if (!isDragging) activeDragAction = null;
  window.hitAPI.endDragReaction();
}

// --- Right-click context menu ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const gesture = { kind: "contextMenu", clientX: e.clientX, clientY: e.clientY };
  performAction(_resolveGestureAction(gesture, isStandalonePet() ? "quickMenu" : "contextMenu"), {
    gesture,
    clientX: e.clientX,
    clientY: e.clientY,
  });
});

if (window.hitAPI && typeof window.hitAPI.onQuickAction === "function") {
  window.hitAPI.onQuickAction((payload = {}) => {
    const action = typeof payload.action === "string" ? payload.action : "none";
    if (action === "none") return;
    if (isStandalonePet() && !STANDALONE_QUICK_ACTIONS.has(action)) return;
    performAction(action, {
      quickAction: true,
      side: payload.side,
      gesture: payload.side === "left" || payload.side === "right"
        ? createClickGesture(1, payload.side)
        : null,
    });
  });
}
