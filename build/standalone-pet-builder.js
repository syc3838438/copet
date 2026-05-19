const pkg = require("../package.json");

const baseBuild = pkg.build || {};

module.exports = {
  ...baseBuild,
  appId: "com.copets.runner",
  productName: "CoPets Runner",
  executableName: "copets-runner",
  directories: {
    ...(baseBuild.directories || {}),
    output: "dist-standalone-pet",
  },
  extraMetadata: {
    name: "copets-runner",
    description: "Standalone desktop runner for Codex Pets themes.",
    main: "src/main-standalone-pet.js",
  },
  files: [
    "NOTICE.md",
    "src/**/*",
    "assets/icon.ico",
    "assets/icon.png",
    "assets/icons/**/*",
    "assets/svg/**/*",
    "assets/sounds/**/*",
    "assets/tray-icon*.png",
    "hooks/server-config.js",
    "themes/**/*",
  ],
  asarUnpack: [
    "assets/svg/**/*",
    "themes/**/*",
  ],
  extraResources: [
    {
      from: "assets/icon.ico",
      to: "icon.ico",
    },
  ],
  publish: null,
  win: {
    ...(baseBuild.win || {}),
    target: [
      { target: "portable", arch: ["x64"] },
      { target: "nsis", arch: ["x64"] },
    ],
  },
  nsis: {
    ...(baseBuild.nsis || {}),
    artifactName: "CoPets-Runner-Setup-${version}-${arch}.${ext}",
  },
  portable: {
    artifactName: "CoPets-Runner-Portable-${version}-${arch}.${ext}",
  },
};
