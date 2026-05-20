// --- Input window: pointer capture, drag, click detection ---
// This is the "controller" — all input decisions happen here.
// Render window is pure "view" — receives reaction commands via IPC relay.

const area = document.getElementById("hit-area");
const gestureRouter = window.CoPetsGestureRouter;

const DEFAULT_BEHAVIOR = {
  triggers: {
    singleClick: "sideClick",
    doubleClick: "annoyedOrSideClick",
    multiClick: "double",
    dragStart: "drag",
    rightClick: "quickMenu",
  },
};

// ── Theme config (injected via preload-hit.js additionalArguments) ──
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
let activeDragAction = null;
let dragMoveRAF = null;
const DRAG_THRESHOLD = gestureRouter && gestureRouter.DEFAULT_DRAG_THRESHOLD_PX
  ? gestureRouter.DEFAULT_DRAG_THRESHOLD_PX
  : 8;

// --- Reaction state (tracked here to gate input) ---
let isReacting = false;
let isDragReacting = false;

// Cancel signal from main (e.g. state change)
window.hitAPI.onCancelReaction(() => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
  dragGesture = null;
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
    if (miniMode) { didDrag = false; return; }
    area.setPointerCapture(e.pointerId);
    isDragging = true;
    didDrag = false;
    dragGesture = null;
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
        dragGesture = createDragGesture(totalDx, totalDy);
        applyDragGesture(dragGesture);
      }
    } else {
      const nextGesture = createDragGestureForMove(totalDx, totalDy, stepDx, stepDy);
      if (shouldApplyDragGesture(nextGesture, dragGesture)) {
        dragGesture = nextGesture;
        applyDragGesture(dragGesture);
      } else {
        dragGesture = nextGesture;
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
  isDragging = false;
  dragGesture = null;
  activeDragAction = null;
  window.hitAPI.dragLock(false);
  area.classList.remove("dragging");
  if (didDrag) {
    window.hitAPI.dragEnd();
  }
  endDragReaction();
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
    : (gesture && gesture.kind === "contextMenu" ? "rightClick" : "singleClick");
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

function classifyDragDirection(dx, dy) {
  return gestureRouter && typeof gestureRouter.classifyDragDirection === "function"
    ? gestureRouter.classifyDragDirection(dx, dy)
    : (Math.abs(dx) >= DRAG_THRESHOLD && Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? "left" : "right") : null);
}

function createDragGesture(dx, dy, directionOverride) {
  const drag = gestureRouter && typeof gestureRouter.classifyDrag === "function"
    ? gestureRouter.classifyDrag(dx, dy)
    : { dx, dy, direction: null, primaryAxis: Math.abs(dx) >= Math.abs(dy) ? "x" : "y" };
  if (directionOverride === "left" || directionOverride === "right") {
    drag.direction = directionOverride;
    drag.primaryAxis = "x";
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

function getDragDirection(gesture) {
  return gesture && gesture.drag && (gesture.drag.direction === "left" || gesture.drag.direction === "right")
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

function _playReactionByKey(reactionKey, fallbackDuration) {
  const reaction = _getReaction(reactionKey);
  const file = _pickReactionFile(reaction);
  if (!file) return false;
  playReaction(file, reaction.duration || reaction.durationMs || fallbackDuration || 2500);
  return true;
}

function performAction(action, meta = {}) {
  switch (action) {
    case "none":
      return true;
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

function playReaction(svg, duration) {
  if (!svg) return;
  isReacting = true;
  window.hitAPI.playClickReaction(svg, duration);
  // Local timer to ungate input after duration
  setTimeout(() => { isReacting = false; }, duration);
}

// --- Drag reaction ---
function applyDragGesture(gesture) {
  if (dndEnabled) return;

  const dragStartGesture = gesture || dragGesture || createDragGesture(0, 0);
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
    performAction(action, {
      quickAction: true,
      side: payload.side,
      gesture: payload.side === "left" || payload.side === "right"
        ? createClickGesture(1, payload.side)
        : null,
    });
  });
}
