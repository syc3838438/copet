"use strict";

const core = globalThis.ClawdSettingsCore;
const APP_MODE = window.settingsAPI && window.settingsAPI.appMode
  ? window.settingsAPI.appMode
  : { features: {} };

const SIDEBAR_TABS = [
  { id: "general", icon: "\u2699", labelKey: "sidebarGeneral", feature: null, available: true },
  { id: "agents", icon: "\u26A1", labelKey: "sidebarAgents", feature: "agents", available: true },
  { id: "theme", icon: "\u{1F3A8}", labelKey: "sidebarTheme", feature: null, available: true },
  { id: "behavior", icon: "\u2691", label: "行为设置", feature: null, available: true },
  { id: "animMap", icon: "\u{1F3AC}", labelKey: "sidebarAnimMap", feature: null, available: true },
  { id: "animOverrides", icon: "\u{1F39E}", labelKey: "sidebarAnimOverrides", feature: null, available: true },
  { id: "shortcuts", icon: "\u2328", labelKey: "sidebarShortcuts", feature: null, available: true },
  { id: "telegram-approval", icon: "\u2708", labelKey: "sidebarTelegramApproval", feature: "telegramApproval", available: true },
  { id: "remote-ssh", icon: "\u{1F50C}", labelKey: "sidebarRemoteSsh", feature: "remoteSsh", available: true },
  { id: "about", icon: "\u2139", labelKey: "sidebarAbout", feature: null, available: true },
];
const STANDALONE_TAB_IDS = new Set(["general", "theme", "behavior", "animMap", "animOverrides", "shortcuts", "about"]);

function isFeatureEnabled(featureName) {
  if (!featureName) return true;
  return APP_MODE && APP_MODE.features ? APP_MODE.features[featureName] !== false : true;
}

function getSidebarTabs() {
  return SIDEBAR_TABS.filter((tab) =>
    (!APP_MODE.standalonePet || STANDALONE_TAB_IDS.has(tab.id))
    && isFeatureEnabled(tab.feature)
  );
}

function ensureVisibleActiveTab() {
  const tabs = getSidebarTabs();
  const current = tabs.find((tab) => tab.id === core.state.activeTab);
  if (current) return;
  core.state.activeTab = tabs.length ? tabs[0].id : "general";
}

function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;
  ensureVisibleActiveTab();
  sidebar.innerHTML = "";
  if (
    isFeatureEnabled("doctor")
    && 
    globalThis.ClawdSettingsDoctorModal
    && typeof globalThis.ClawdSettingsDoctorModal.renderSidebarIndicator === "function"
  ) {
    globalThis.ClawdSettingsDoctorModal.renderSidebarIndicator(sidebar, core);
  }
  for (const tab of getSidebarTabs()) {
    const item = document.createElement("div");
    item.className = "sidebar-item";
    if (!tab.available) item.classList.add("disabled");
    if (tab.id === core.state.activeTab) item.classList.add("active");
    item.innerHTML =
      `<span class="sidebar-item-icon">${tab.icon}</span>` +
      `<span class="sidebar-item-label">${core.helpers.escapeHtml(tab.label || core.helpers.t(tab.labelKey))}</span>` +
      (tab.available ? "" : `<span class="sidebar-item-soon">${core.helpers.escapeHtml(core.helpers.t("sidebarSoon"))}</span>`);
    if (tab.available) {
      item.addEventListener("click", () => {
        core.ops.selectTab(tab.id);
      });
    }
    sidebar.appendChild(item);
  }
}

function renderPlaceholder(parent) {
  const div = document.createElement("div");
  div.className = "placeholder";
  div.innerHTML =
    `<div class="placeholder-icon">\u{1F6E0}</div>` +
    `<div class="placeholder-title">${core.helpers.escapeHtml(core.helpers.t("placeholderTitle"))}</div>` +
    `<div class="placeholder-desc">${core.helpers.escapeHtml(core.helpers.t("placeholderDesc"))}</div>`;
  parent.appendChild(div);
}

function renderContent() {
  const content = document.getElementById("content");
  if (!content) return;
  ensureVisibleActiveTab();
  core.ops.clearMountedControls();
  content.innerHTML = "";
  const tab = core.tabs[core.state.activeTab];
  if (tab && typeof tab.render === "function") {
    tab.render(content, core);
  } else {
    renderPlaceholder(content);
  }
}

core.ops.installRenderHooks({
  sidebar: renderSidebar,
  content: renderContent,
});

globalThis.ClawdSettingsTabGeneral.init(core);
globalThis.ClawdSettingsTabAgents.init(core);
globalThis.ClawdSettingsTabTheme.init(core);
if (globalThis.ClawdSettingsTabBehavior) {
  globalThis.ClawdSettingsTabBehavior.init(core);
}
globalThis.ClawdSettingsTabAnimMap.init(core);
globalThis.ClawdSettingsTabAnimOverrides.init(core);
globalThis.ClawdSettingsTabShortcuts.init(core);
if (isFeatureEnabled("telegramApproval") && globalThis.ClawdSettingsTabTelegramApproval) {
  globalThis.ClawdSettingsTabTelegramApproval.init(core);
}
globalThis.ClawdSettingsTabAbout.init(core);
if (isFeatureEnabled("remoteSsh") && globalThis.ClawdSettingsTabRemoteSsh) {
  globalThis.ClawdSettingsTabRemoteSsh.init(core);
}

if (window.settingsAPI && typeof window.settingsAPI.onChanged === "function") {
  window.settingsAPI.onChanged((payload) => core.ops.applyChanges(payload));
}

if (window.settingsAPI && typeof window.settingsAPI.onAnimationPreviewPosterReady === "function") {
  window.settingsAPI.onAnimationPreviewPosterReady((payload) => core.ops.applyAnimationPreviewPoster(payload));
}

if (window.settingsAPI && typeof window.settingsAPI.onShortcutRecordKey === "function") {
  window.settingsAPI.onShortcutRecordKey((payload) => core.ops.handleShortcutRecordKey(payload));
}

if (window.settingsAPI && typeof window.settingsAPI.onShortcutFailuresChanged === "function") {
  window.settingsAPI.onShortcutFailuresChanged((failures) => core.ops.applyShortcutFailures(failures));
}

if (window.settingsAPI && typeof window.settingsAPI.getShortcutFailures === "function") {
  window.settingsAPI.getShortcutFailures().then((failures) => {
    core.ops.applyShortcutFailures(failures);
  }).catch((err) => {
    console.warn("settings: getShortcutFailures failed", err);
  });
}

if (window.settingsAPI && typeof window.settingsAPI.getSnapshot === "function") {
  window.settingsAPI.getSnapshot().then((snapshot) => {
    core.ops.applyBootstrap(snapshot);
  });
}

if (isFeatureEnabled("agents") && window.settingsAPI && typeof window.settingsAPI.listAgents === "function") {
  window.settingsAPI.listAgents().then((list) => {
    core.ops.applyAgentMetadata(list);
  }).catch((err) => {
    console.warn("settings: listAgents failed", err);
    core.ops.applyAgentMetadata([]);
  });
} else {
  core.ops.applyAgentMetadata([]);
}
