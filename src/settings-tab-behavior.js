"use strict";

(function initSettingsTabBehavior(root) {
  const INHERIT_VALUE = "__inherit__";

  const DEFAULT_BEHAVIOR = {
    triggers: {
      singleClick: "focusTerminal",
      doubleClick: "annoyedOrSideClick",
      multiClick: "double",
      dragStart: "drag",
      rightClick: "contextMenu",
    },
  };

  const TRIGGER_SECTIONS = [
    {
      title: "点击",
      rows: [
        { key: "singleClick", label: "单击默认动作", desc: "所有单击未细分时使用" },
        { key: "singleClickLeft", label: "左侧单击动作", desc: "未设置时沿用单击默认动作", inheritFrom: "singleClick" },
        { key: "singleClickRight", label: "右侧单击动作", desc: "未设置时沿用单击默认动作", inheritFrom: "singleClick" },
        { key: "doubleClick", label: "双击默认动作", desc: "所有双击未细分时使用" },
        { key: "doubleClickLeft", label: "左侧双击动作", desc: "未设置时沿用双击默认动作", inheritFrom: "doubleClick" },
        { key: "doubleClickRight", label: "右侧双击动作", desc: "未设置时沿用双击默认动作", inheritFrom: "doubleClick" },
        { key: "multiClick", label: "连续点击动作", desc: "快速连续点击四次及以上" },
      ],
    },
    {
      title: "拖动",
      rows: [
        { key: "dragStart", label: "拖动默认动作", desc: "未细分方向时使用" },
        { key: "dragLeft", label: "向左拖动动作", desc: "未设置时沿用拖动默认动作", inheritFrom: "dragStart" },
        { key: "dragRight", label: "向右拖动动作", desc: "未设置时沿用拖动默认动作", inheritFrom: "dragStart" },
      ],
    },
    {
      title: "鼠标",
      rows: [
        { key: "rightClick", label: "右键动作", desc: "鼠标右键或上下文菜单" },
      ],
    },
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

  function readRawTriggers() {
    const current = state && state.snapshot && state.snapshot.petBehavior;
    const triggers = current && current.triggers && typeof current.triggers === "object"
      ? current.triggers
      : current;
    return triggers && typeof triggers === "object" && !Array.isArray(triggers)
      ? triggers
      : {};
  }

  function readBehavior() {
    return {
      triggers: {
        ...DEFAULT_BEHAVIOR.triggers,
        ...readRawTriggers(),
      },
    };
  }

  function hasExplicitTrigger(key) {
    return Object.prototype.hasOwnProperty.call(readRawTriggers(), key);
  }

  function showToast(message) {
    if (ops && typeof ops.showToast === "function") ops.showToast(message);
  }

  function addActionOptions(select, spec) {
    if (spec.inheritFrom) {
      const inherit = document.createElement("option");
      inherit.value = INHERIT_VALUE;
      inherit.textContent = "沿用默认动作";
      select.appendChild(inherit);
    }
    for (const option of ACTION_OPTIONS) {
      const el = document.createElement("option");
      el.value = option.value;
      el.textContent = option.label;
      select.appendChild(el);
    }
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
    addActionOptions(select, spec);
    select.value = spec.inheritFrom && !hasExplicitTrigger(spec.key)
      ? INHERIT_VALUE
      : (behavior.triggers[spec.key] || DEFAULT_BEHAVIOR.triggers[spec.key] || "none");
    select.addEventListener("change", () => {
      const next = readBehavior();
      if (select.value === INHERIT_VALUE) {
        delete next.triggers[spec.key];
      } else {
        next.triggers[spec.key] = select.value;
      }
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

    for (const section of TRIGGER_SECTIONS) {
      parent.appendChild(helpers.buildSection(section.title, section.rows.map(buildRow)));
    }

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
