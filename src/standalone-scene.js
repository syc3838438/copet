"use strict";

const SCENE_IDS = Object.freeze(["work", "play", "rest"]);
const DURATION_PRESETS_MINUTES = Object.freeze([5, 10, 15, 25, 30, 45, 60, 90, 120]);
const DEFAULT_DURATIONS = Object.freeze({
  work: 25,
  play: 15,
  rest: 5,
});
const SCENE_LABELS = Object.freeze({
  work: "工作",
  play: "娱乐",
  rest: "休息",
});

function isSceneId(scene) {
  return SCENE_IDS.includes(scene);
}

function normalizeStandaloneSceneDurations(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const out = {};
  for (const scene of SCENE_IDS) {
    const raw = Number(source[scene]);
    out[scene] = DURATION_PRESETS_MINUTES.includes(raw) ? raw : DEFAULT_DURATIONS[scene];
  }
  return out;
}

function isValidStandaloneSceneDurations(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return SCENE_IDS.every((scene) => DURATION_PRESETS_MINUTES.includes(value[scene]));
}

function getNextDurationMinutes(currentMinutes) {
  const current = Number(currentMinutes);
  const index = DURATION_PRESETS_MINUTES.indexOf(current);
  return DURATION_PRESETS_MINUTES[(index + 1) % DURATION_PRESETS_MINUTES.length];
}

function getSceneLabel(scene) {
  return SCENE_LABELS[scene] || "";
}

module.exports = {
  SCENE_IDS,
  DURATION_PRESETS_MINUTES,
  DEFAULT_DURATIONS,
  SCENE_LABELS,
  isSceneId,
  normalizeStandaloneSceneDurations,
  isValidStandaloneSceneDurations,
  getNextDurationMinutes,
  getSceneLabel,
};
