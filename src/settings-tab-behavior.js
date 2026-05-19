"use strict";

(function initSettingsTabBehavior(root) {
  const DEFAULT_BEHAVIOR = {
    triggers: {
      singleClick: "focusTerminal",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "contextMenu",
    },
  };

  const TRIGGER_ROWS = [
    { key: "singleClick", label: "单击默认动作", desc: "singleClick" },
    { key: "doubleClick", label: "双击默认动作", desc: "doubleClick" },
    { key: "multiClick", label: "连续点击动作", desc: "multiClick" },
    { key: "dragStart", label: "拖动默认动作", desc: "dragStart" },
    { key: "rightClick", label: "右键动作", desc: "rightClick" },
  ];

  const ACTION_OPTIONS = [
    { value: "none", label: "不执行动作" },
    { value: "focusTerminal", label: "聚焦会话" },
    { value: "contextMenu", label: "打开菜单" },
    { value: "dashboard", label: "打开仪表盘" },
    { value: "drag", label: "播放拖动动画" },
    { value: "sideClick", label: "按点击侧播放戳戳" },
    { value: "clickLeft", label: "播放左戳动画" },
    { value: "clickRight", label: "播放右戳动画" },
    { value: "annoyed", label: "播放恼火动画" },
    { value: "annoyedOrSideClick", label: "随机戳戳/恼火" },
    { value: "double", label: "播放连续点击动画" },
  ];

  let state = null;
  let helpers = null;
  let ops = null;

  function readBehavior() {
    const current = state && state.snapshot && state.snapshot.petBehavior;
    const triggers = current && current.triggers && typeof current.triggers === "object"
      ? current.triggers
      : current;
    return {
      triggers: {
        ...DEFAULT_BEHAVIOR.triggers,
        ...(triggers && typeof triggers === "object" && !Array.isArray(triggers) ? triggers : {}),
      },
    };
  }

  function showToast(message) {
    if (ops && typeof ops.showToast === "function") ops.showToast(message);
  }

  function buildRow(spec) {
    const behavior = readBehavior();
    const row = document.createElement("div");
    row.className = "row behavior-row";

    const text = document.createElement("div");
    text.className = "row-text";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = spec.label;
    const desc = document.createElement("span");
    desc.className = "row-desc";
    desc.textContent = spec.desc || spec.key;
    text.appendChild(label);
    text.appendChild(desc);

    const control = document.createElement("div");
    control.className = "row-control behavior-row-control";
    const select = document.createElement("select");
    select.className = "behavior-select";
    for (const option of ACTION_OPTIONS) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    }
    select.value = behavior.triggers[spec.key] || DEFAULT_BEHAVIOR.triggers[spec.key] || "none";
    select.addEventListener("change", () => {
      const next = readBehavior();
      next.triggers[spec.key] = select.value;
      select.disabled = true;
      window.settingsAPI.update("petBehavior", next)
        .then((result) => {
          if (result && result.status === "ok") {
            showToast("行为设置已保存");
          } else {
            showToast(`保存失败：${(result && result.message) || "未知错误"}`);
          }
        })
        .catch((err) => {
          showToast(`保存失败：${err && err.message ? err.message : err}`);
        })
        .finally(() => {
          select.disabled = false;
        });
    });
    control.appendChild(select);

    row.appendChild(text);
    row.appendChild(control);
    return row;
  }

  function render(parent) {
    const h1 = document.createElement("h1");
    h1.textContent = "行为设置";
    parent.appendChild(h1);

    const subtitle = document.createElement("p");
    subtitle.className = "subtitle";
    subtitle.textContent = "设置点击、拖动、右键等操作触发的桌宠动作。";
    parent.appendChild(subtitle);

    parent.appendChild(helpers.buildSection("", TRIGGER_ROWS.map(buildRow)));

    const resetWrap = document.createElement("div");
    resetWrap.className = "anim-map-reset";
    const resetBtn = document.createElement("button");
    resetBtn.type = "button";
    resetBtn.className = "theme-delete-btn anim-map-reset-btn";
    resetBtn.textContent = "重置";
    resetBtn.addEventListener("click", () => {
      window.settingsAPI.update("petBehavior", DEFAULT_BEHAVIOR).then((result) => {
        if (result && result.status === "ok") showToast("行为设置已重置");
      });
    });
    resetWrap.appendChild(resetBtn);
    parent.appendChild(resetWrap);
  }

  function patchInPlace(changes) {
    return !(changes && Object.prototype.hasOwnProperty.call(changes, "petBehavior"));
  }

  function init(core) {
    state = core.state;
    helpers = core.helpers;
    ops = core.ops;
    core.tabs.behavior = {
      render,
      patchInPlace,
    };
  }

  root.ClawdSettingsTabBehavior = { init };
})(globalThis);
