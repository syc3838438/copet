"use strict";

const DEFAULT_THEME_ID = "clawd";
const HIDDEN_BUILTIN_THEME_IDS = Object.freeze(["template"]);

function isHiddenBuiltinThemeId(themeId) {
  return HIDDEN_BUILTIN_THEME_IDS.includes(themeId);
}

function normalizeDefaultThemeId(themeId) {
  return typeof themeId === "string" && themeId && !isHiddenBuiltinThemeId(themeId)
    ? themeId
    : DEFAULT_THEME_ID;
}

module.exports = {
  DEFAULT_THEME_ID,
  HIDDEN_BUILTIN_THEME_IDS,
  isHiddenBuiltinThemeId,
  normalizeDefaultThemeId,
};
