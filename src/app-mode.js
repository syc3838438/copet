"use strict";

const STANDALONE_PET_ARG = "--standalone-pet";

function resolveAppMode(options = {}) {
  const argv = Array.isArray(options.argv) ? options.argv : process.argv;
  const env = options.env || process.env;
  const standalonePet = env.CLAWD_STANDALONE_PET === "1" || argv.includes(STANDALONE_PET_ARG);

  return {
    id: standalonePet ? "standalone-pet" : "full",
    standalonePet,
    productName: standalonePet ? "CoPets Runner" : "Clawd on Desk",
    features: {
      agents: !standalonePet,
      dashboard: !standalonePet,
      hookServer: !standalonePet,
      remoteSsh: !standalonePet,
      telegramApproval: !standalonePet,
      doctor: !standalonePet,
      updater: !standalonePet,
      terminalFocusInstall: !standalonePet,
    },
  };
}

module.exports = {
  STANDALONE_PET_ARG,
  resolveAppMode,
};
