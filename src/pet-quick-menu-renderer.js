"use strict";

const api = window.petQuickMenuAPI;

function renderState(state = {}) {
  const durations = state.durations && typeof state.durations === "object" ? state.durations : {};
  const activeScene = typeof state.activeScene === "string" ? state.activeScene : "";
  const stopButton = document.querySelector(".stop");
  document.querySelectorAll(".scene-group").forEach((group) => {
    const scene = group.dataset.group || "";
    group.classList.toggle("active", !!scene && scene === activeScene);
  });
  document.querySelectorAll(".duration-btn").forEach((button) => {
    const scene = button.dataset.scene || "";
    const minutes = Number(durations[scene]);
    if (Number.isFinite(minutes)) button.textContent = `${minutes}m`;
  });
  if (stopButton) stopButton.disabled = !activeScene;
}

document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    if (!api || typeof api.action !== "function") return;
    api.action({
      id: button.dataset.id || "",
      action: button.dataset.action || "",
      scene: button.dataset.scene || "",
      side: button.dataset.side || "",
    });
  });
});

if (api && typeof api.onState === "function") {
  api.onState(renderState);
}
