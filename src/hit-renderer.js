// --- Input window: pointer capture, drag, click detection ---
// This is the "controller" — all input decisions happen here.
// Render window is pure "view" — receives reaction commands via IPC relay.

const area = document.getElementById("hit-area");

const DEFAULT_BEHAVIOR = {
  triggers: {
    singleClick: "focusTerminal",
    doubleClick: "annoyedOrSideClick",
    multiClick: "double",
    dragStart: "drag",
    rightClick: "contextMenu",
  },
};

// ── Theme config (injected via preload-hit.js additionalArguments) ──
let tc = window.hitThemeConfig || {};
let _reactions = (tc && tc.reactions) || {};
let _behavior = normalizeBehavior(tc && tc.behavior);

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
let dragMoveRAF = null;
const DRAG_THRESHOLD = 3;

// --- Reaction state (tracked here to gate input) ---
let isReacting = false;
let isDragReacting = false;

// Cancel signal from main (e.g. state change)
window.hitAPI.onCancelReaction(() => {
  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; clickCount = 0; firstClickDir = null; }
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
    mouseDownX = e.clientX;
    mouseDownY = e.clientY;
    window.hitAPI.dragLock(true);
    area.classList.add("dragging");
  }
});

document.addEventListener("pointermove", (e) => {
  if (isDragging) {
    if (!didDrag) {
      const totalDx = e.clientX - mouseDownX;
      const totalDy = e.clientY - mouseDownY;
      if (Math.abs(totalDx) > DRAG_THRESHOLD || Math.abs(totalDy) > DRAG_THRESHOLD) {
        didDrag = true;
        startDragReaction();
      }
    }
    queueDragMove();
  }
});

function stopDrag() {
  if (!isDragging) return;
  clearQueuedDragMove();
  isDragging = false;
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
      const key = meta.firstClickDir === "right" ? "clickRight" : "clickLeft";
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

  // Non-idle: focus terminal, no reaction
  if (currentState !== "idle") {
    window.hitAPI.focusTerminal();
    return;
  }

  clickCount++;
  if (clickCount === 1) {
    firstClickDir = clientX < area.offsetWidth / 2 ? "left" : "right";
  }

  if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }

  if (clickCount >= 4) {
    clickCount = 0;
    const dir = firstClickDir;
    firstClickDir = null;
    performAction(_getTriggerAction("multiClick", "double"), { firstClickDir: dir });
  } else {
    clickTimer = setTimeout(() => {
      clickTimer = null;
      const count = clickCount;
      const dir = firstClickDir;
      clickCount = 0;
      firstClickDir = null;
      const trigger = count >= 2 ? "doubleClick" : "singleClick";
      const fallback = count >= 2 ? "annoyedOrSideClick" : "focusTerminal";
      performAction(_getTriggerAction(trigger, fallback), { firstClickDir: dir });
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
function startDragReaction() {
  if (isDragReacting) return;
  if (dndEnabled) return;

  if (isReacting) {
    isReacting = false;
  }

  performAction(_getTriggerAction("dragStart", "drag"), { fromDragStart: true });
}

function endDragReaction() {
  if (!isDragReacting) return;
  isDragReacting = false;
  window.hitAPI.endDragReaction();
}

// --- Right-click context menu ---
document.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  performAction(_getTriggerAction("rightClick", "contextMenu"));
});
