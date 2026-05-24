"use strict";

const test = require("node:test");
const assert = require("node:assert");

const { resolveStandaloneSceneVisual } = require("../src/standalone-scene-visuals");

function makeTheme(states) {
  return { states };
}

test("standalone play scene resolves the real attention visual", () => {
  const visual = resolveStandaloneSceneVisual({
    scene: "play",
    theme: makeTheme({
      idle: ["idle.svg"],
      attention: ["happy.svg"],
      working: ["typing.svg"],
    }),
  });

  assert.deepStrictEqual(visual, {
    state: "idle",
    svg: "happy.svg",
    svgState: "attention",
  });
});

test("standalone rest scene resolves the real sleeping visual for normal themes", () => {
  const visual = resolveStandaloneSceneVisual({
    scene: "rest",
    theme: makeTheme({
      idle: ["idle.svg"],
      notification: ["waiting.svg"],
      sleeping: ["sleeping.svg"],
    }),
  });

  assert.deepStrictEqual(visual, {
    state: "idle",
    svg: "sleeping.svg",
    svgState: "sleeping",
  });
});

test("standalone rest scene uses CodexPets waiting visual when sleeping is idle-static", () => {
  const visual = resolveStandaloneSceneVisual({
    scene: "rest",
    theme: makeTheme({
      idle: ["codex-pet-idle-loop.svg"],
      notification: ["codex-pet-waiting-loop.svg"],
      sleeping: ["codex-pet-idle-static.svg"],
    }),
  });

  assert.deepStrictEqual(visual, {
    state: "idle",
    svg: "codex-pet-waiting-loop.svg",
    svgState: "notification",
  });
});

test("standalone scene visuals safely fall back to idle when scene assets are missing", () => {
  const visual = resolveStandaloneSceneVisual({
    scene: "play",
    theme: makeTheme({
      idle: ["idle.svg"],
    }),
  });

  assert.deepStrictEqual(visual, {
    state: "idle",
    svg: "idle.svg",
    svgState: "idle",
  });
});

test("standalone work scene keeps the dynamic working override first", () => {
  const visual = resolveStandaloneSceneVisual({
    scene: "work",
    theme: makeTheme({
      idle: ["idle.svg"],
      working: ["typing.svg"],
    }),
    getSvgOverride: (state) => (state === "working" ? "working-tier.svg" : null),
  });

  assert.deepStrictEqual(visual, {
    state: "working",
    svg: "working-tier.svg",
    svgState: "working",
  });
});
