"use strict";

const api = window.standaloneSceneProgressAPI;
const labelEl = document.querySelector(".scene-label");
const timeEl = document.querySelector(".time-left");
const fillEl = document.querySelector(".bar-fill");
const stopButton = document.querySelector(".stop-btn");

function formatRemaining(ms) {
  const totalSeconds = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function render(state = {}) {
  if (labelEl) labelEl.textContent = state.label || "";
  if (timeEl) timeEl.textContent = formatRemaining(state.remainingMs);
  if (fillEl) {
    const progress = Number.isFinite(state.progress) ? Math.max(0, Math.min(1, state.progress)) : 0;
    fillEl.style.width = `${Math.round(progress * 100)}%`;
  }
}

if (api && typeof api.onState === "function") {
  api.onState(render);
}

if (stopButton) {
  stopButton.addEventListener("click", () => {
    if (api && typeof api.stop === "function") api.stop();
  });
}
