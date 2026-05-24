"use strict";

function firstFileFromEntry(entry) {
  if (Array.isArray(entry)) return entry.find((file) => typeof file === "string" && file) || null;
  if (entry && Array.isArray(entry.files)) return entry.files.find((file) => typeof file === "string" && file) || null;
  return null;
}

function firstStateFile(theme, state) {
  if (!theme || typeof theme !== "object" || typeof state !== "string" || !state) return null;
  const bindingFile = firstFileFromEntry(theme._stateBindings && theme._stateBindings[state]);
  if (bindingFile) return bindingFile;
  return firstFileFromEntry(theme.states && theme.states[state]);
}

function safeSvgOverride(getSvgOverride, state) {
  if (typeof getSvgOverride !== "function") return null;
  try {
    const svg = getSvgOverride(state);
    return typeof svg === "string" && svg ? svg : null;
  } catch {
    return null;
  }
}

function isIdleStaticPlaceholder(file) {
  if (typeof file !== "string") return false;
  const name = file.split(/[\\/]/).pop().toLowerCase();
  return name.includes("idle-static");
}

function pickSceneSvg({ candidates, theme, getSvgOverride }) {
  for (const state of candidates) {
    const override = safeSvgOverride(getSvgOverride, state);
    if (override) return { svg: override, sourceState: state };
    const file = firstStateFile(theme, state);
    if (file) return { svg: file, sourceState: state };
  }
  return { svg: null, sourceState: null };
}

function getRestCandidates(theme) {
  const sleeping = firstStateFile(theme, "sleeping");
  if (isIdleStaticPlaceholder(sleeping)) return ["notification", "sleeping", "idle"];
  return ["sleeping", "notification", "idle"];
}

function getSceneCandidates(scene, theme) {
  if (scene === "work") return ["working", "thinking", "idle"];
  if (scene === "play") return ["attention", "juggling", "working", "idle"];
  if (scene === "rest") return getRestCandidates(theme);
  return ["idle"];
}

function getSceneLogicalState(scene) {
  if (scene === "work") return "working";
  return "idle";
}

function resolveStandaloneSceneVisual({ scene, theme, getSvgOverride } = {}) {
  const normalizedScene = scene === "work" || scene === "play" || scene === "rest" ? scene : "normal";
  const picked = pickSceneSvg({
    candidates: getSceneCandidates(normalizedScene, theme),
    theme,
    getSvgOverride,
  });
  return {
    state: getSceneLogicalState(normalizedScene),
    svg: picked.svg,
    svgState: picked.sourceState,
  };
}

module.exports = {
  resolveStandaloneSceneVisual,
  __test: {
    firstStateFile,
    isIdleStaticPlaceholder,
  },
};
