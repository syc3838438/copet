"use strict";

const api = window.petQuickMenuAPI;
const sleepToggle = document.getElementById("sleepToggle");

document.querySelectorAll("button").forEach((button) => {
  button.addEventListener("click", () => {
    if (!api || typeof api.action !== "function") return;
    api.action({
      id: button.dataset.id || "",
      action: button.dataset.action || "",
      side: button.dataset.side || "",
    });
  });
});

if (api && typeof api.onState === "function") {
  api.onState((state) => {
    if (sleepToggle) sleepToggle.textContent = state && state.sleeping ? "唤醒" : "休眠";
  });
}
