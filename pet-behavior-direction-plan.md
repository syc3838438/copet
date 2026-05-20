# CoPets Runner 动作模组方向触发改造计划

生成时间：2026-05-19 22:19 +08:00

## 目标

把当前“点击/拖动 -> 动作”的粗粒度映射升级为可区分方向的行为系统，让用户可以分别配置：

- 左半边点击、右半边点击触发不同动作。
- 左戳、右戳可以作为独立触发条件，而不只是固定播放某个动作。
- 向左拖动、向右拖动触发不同动作。
- 旧版配置继续可用，不丢用户已有 `petBehavior`。

## 执行进展

2026-05-20 已完成第一轮实现：

- 新增 `src/pet-gesture-router.js`，集中处理点击侧、拖动方向和方向触发回退。
- `petBehavior` 已支持 `singleClickLeft`、`singleClickRight`、`doubleClickLeft`、`doubleClickRight`、`dragLeft`、`dragRight`。
- `hit-renderer.js` 已接入方向路由，左/右点击和左/右拖动可以触发不同动作。
- `dragStart -> sideClick` 已修正，不再无论左右拖动都走左戳。
- 行为设置页已汉化并加入方向项，方向项默认“沿用默认动作”。
- 已新增并通过相关测试：`pet-gesture-router`、`pet-behavior`、`hit-renderer-gestures`、`settings-tab-behavior`。

## 本轮测试结论

### 已运行测试

1. 现有相关回归测试：

```powershell
node --test test/pet-interaction-ipc.test.js test/settings-actions.test.js test/settings-controller.test.js test/prefs.test.js
```

结果：255 个测试全部通过。

2. 行为 schema 快速检查：

```powershell
node -e "const { normalizePetBehavior, validatePetBehavior } = require('./src/pet-behavior'); ..."
```

结果：

- `dragLeft` / `dragRight` 作为触发条件会被 `validatePetBehavior` 判定为 `unknown pet behavior trigger`。
- `clickLeft` 作为触发条件也会被判定为 `unknown pet behavior trigger`。
- 当前合法触发条件只有 `singleClick`、`doubleClick`、`multiClick`、`dragStart`、`rightClick`。

3. `hit-renderer.js` DOM mock 方向测试：

- `singleClick -> sideClick` 时，点击左半区会播放 `clickLeft`，点击右半区会播放 `clickRight`。
- `singleClick -> clickLeft` 时，无论点击左半区还是右半区，都会播放 `clickLeft`。这说明 `clickLeft` 是固定动作，不是“左侧点击触发条件”。
- `dragStart -> drag` 时，向左拖动和向右拖动的 IPC 调用序列完全一致。
- `dragStart -> sideClick` 时，向左拖动和向右拖动都会播放 `clickLeft`，因为拖动路径没有传入方向 meta。

## 当前根因

### 1. 触发条件模型太粗

文件：`src/pet-behavior.js`

当前 `TRIGGERS` 只有：

- `singleClick`
- `doubleClick`
- `multiClick`
- `dragStart`
- `rightClick`

没有 `dragLeft`、`dragRight`、`singleClickLeft`、`singleClickRight` 这类方向触发条件。

### 2. `clickLeft` / `clickRight` 是动作，不是条件

文件：`src/pet-behavior.js`、`src/hit-renderer.js`

当前 `ACTIONS` 里有 `clickLeft` / `clickRight`，它们表示“播放左戳/右戳反应”。设置页文案应汉化为“播放左戳动画 / 播放右戳动画”，并明确这是要执行的动作，不是“点击左边/右边”的触发条件。

### 3. 点击方向只在 `sideClick` 里临时使用

文件：`src/hit-renderer.js`

当前逻辑只记录第一次点击的 `firstClickDir`：

```js
firstClickDir = clientX < area.offsetWidth / 2 ? "left" : "right";
```

然后只有 `sideClick` / `annoyedOrSideClick` 会读取这个 meta。通用行为映射本身并不知道“左侧点击”和“右侧点击”是两个不同 trigger。

### 4. 拖动方向没有进入动作路由

文件：`src/hit-renderer.js`

拖动达到阈值后只调用：

```js
performAction(_getTriggerAction("dragStart", "drag"), { fromDragStart: true });
```

没有传入 `dx`、`dy`、`direction`，所以向左拖和向右拖只能走同一个 `dragStart`。

## 建议的新行为模型

### 触发条件

保留旧触发条件，新增方向触发条件：

```js
triggers: {
  singleClick: "focusTerminal",
  singleClickLeft: "focusTerminal",
  singleClickRight: "focusTerminal",

  doubleClick: "annoyedOrSideClick",
  doubleClickLeft: "clickLeft",
  doubleClickRight: "clickRight",

  multiClick: "double",

  dragStart: "drag",
  dragLeft: "drag",
  dragRight: "drag",

  rightClick: "contextMenu"
}
```

解析优先级：

1. 有方向时，优先读方向触发，例如 `doubleClickLeft`、`doubleClickRight`、`dragLeft`、`dragRight`。
2. 方向触发没有配置时，回退到旧通用触发，例如 `doubleClick`、`dragStart`。
3. 旧通用触发也没有配置时，回退到默认行为。

### 手势 meta

把 `hit-renderer.js` 内部传递给 `performAction` 的 meta 统一成：

```js
{
  kind: "click" | "drag" | "contextMenu",
  clickCount: 1 | 2 | 4,
  side: "left" | "right" | null,
  drag: {
    dx: number,
    dy: number,
    direction: "left" | "right" | "up" | "down" | null,
    primaryAxis: "x" | "y" | null
  }
}
```

第一阶段只开放左右方向，但内部结构预留上下方向，避免下一轮再重拆。

### 拖动方向判定

建议默认规则：

- `abs(dx) >= 8px` 才算方向拖动。
- `abs(dx) >= abs(dy) * 1.2` 时才判定为左右拖动。
- `dx < 0` 为 `left`，`dx > 0` 为 `right`。
- 未满足方向条件时只走 `dragStart`。

阈值可以先写成常量，后续再做成高级设置。

## 执行计划

### Phase 1：抽出纯逻辑，先补测试

新增文件建议：

- `src/pet-gesture-router.js`
- `test/pet-gesture-router.test.js`

内容：

- `classifyClickSide(clientX, width)`：返回 `left` / `right`。
- `classifyDragDirection(dx, dy, options)`：返回 `left` / `right` / `up` / `down` / `null`。
- `resolveTriggerAction(behavior, gesture)`：根据方向优先级返回 action。

验收：

- 左半区点击解析为 `singleClickLeft` / `doubleClickLeft`。
- 右半区点击解析为 `singleClickRight` / `doubleClickRight`。
- 左拖解析为 `dragLeft`。
- 右拖解析为 `dragRight`。
- 未配置方向 trigger 时回退到旧 trigger。

### Phase 2：升级行为 schema

修改文件：

- `src/pet-behavior.js`
- `src/prefs.js` 相关默认值验证链路
- `src/settings-actions.js` 相关验证覆盖测试

工作：

- 在 `TRIGGERS` 中加入方向 trigger。
- `normalizePetBehavior` 支持旧配置自动补齐新字段。
- `validatePetBehavior` 对新字段放行。
- 保持旧配置 `{ triggers: { dragStart: "drag" } }` 不报错。

验收：

- 旧配置正常加载。
- 新配置可保存。
- 未知 trigger 仍会报错。

### Phase 3：改造 `hit-renderer.js` 路由

修改文件：

- `src/hit-renderer.js`

工作：

- 点击结束时生成 `gesture`，不再只传 `firstClickDir`。
- 拖动达到阈值时计算首段方向，并传给动作路由。
- `sideClick` 动作优先读取 `gesture.side`；如果是拖动触发，可读取 `gesture.drag.direction` 映射到 left/right。
- `drag` 动作仍保持按住时循环播放、松开后停止。

验收：

- 左侧单击和右侧单击可配置为不同动作。
- 左侧双击和右侧双击可配置为不同动作。
- 左拖和右拖可配置为不同动作。
- `dragStart -> sideClick` 不再总是左戳。
- `dndEnabled` 时仍不启动拖动反应。

### Phase 4：设置页 UI 改造与汉化

修改文件：

- `src/settings-tab-behavior.js`
- `src/settings.css`
- `src/settings-renderer.js`
- `src/settings-i18n.js`

汉化要求：

- 侧边栏 `Behavior` 改为“行为设置”。
- 页面标题 `Behavior` 改为“行为设置”。
- 页面说明改为“设置点击、拖动、右键等操作触发的桌宠动作。”
- Toast 与按钮统一中文，例如“行为设置已保存”“保存失败”“重置”。
- 动作名称必须用“播放……”表述，避免把动作误读成触发条件。

建议 UI 分组：

- 点击
  - 单击默认动作
  - 左侧单击动作
  - 右侧单击动作
  - 双击默认动作
  - 左侧双击动作
  - 右侧双击动作
  - 连续点击动作
- 拖动
  - 拖动默认动作
  - 向左拖动动作
  - 向右拖动动作
- 鼠标
  - 右键动作

交互建议：

- 方向项默认显示为“沿用默认动作”，避免用户一打开就看到十几项必须配置。
- 选择具体动作后覆盖默认项。
- 动作名称改清楚：
  - `clickLeft` 显示为“播放左戳动画”
  - `clickRight` 显示为“播放右戳动画”
  - `sideClick` 显示为“按点击侧播放戳戳”
  - `drag` 显示为“播放拖动动画”
  - 避免把动作误写成触发条件。

验收：

- 设置页能保存所有新 trigger。
- 重新打开设置页后配置回显正确。
- “重置”会恢复兼容默认行为。
- 中文界面不再出现裸露的 `Behavior`、`Left poke`、`Right poke` 这类英文展示文本。

### Phase 5：端到端验证与打包

建议命令：

```powershell
node --test test/pet-gesture-router.test.js test/prefs.test.js test/settings-actions.test.js test/settings-controller.test.js
node --test test/settings-renderer-browser-env.test.js
npm.cmd run build:pet
```

手工验证：

1. 启动独立桌宠：

```powershell
npm.cmd run start:pet
```

2. 打开“行为设置”页。
3. 配置：
   - 左侧双击动作 -> 播放左戳动画
   - 右侧双击动作 -> 播放右戳动画
   - 向左拖动动作 -> 播放左戳动画
   - 向右拖动动作 -> 播放右戳动画
4. 在桌宠左半区双击，确认播放左戳。
5. 在桌宠右半区双击，确认播放右戳。
6. 按住向左拖动，确认触发左拖动作。
7. 按住向右拖动，确认触发右拖动作。
8. 导入一个 CodexPets 压缩包后重复 4-7，确认反应资源从导入主题读取。

## 风险点

- `clickLeft` / `clickRight` 名称历史上已作为 reaction action 使用，不能直接改语义，否则会破坏旧配置。方向 trigger 应使用 `singleClickLeft`、`doubleClickRight`、`dragLeft` 这种新 key。
- 拖动方向只应在首次超过阈值时锁定，拖动途中来回晃动不应反复切换动作。
- `drag` 动作是循环到 pointer-up 的特殊动作，其他点击反应是固定时长动画，执行层要保留这个差异。
- 设置页文案必须把“触发条件”和“播放的动作”区分清楚，否则用户仍会误解。

## 推荐下一步

优先做 Phase 1 和 Phase 2。只要纯逻辑和 schema 稳住，后续改 `hit-renderer.js` 与设置页会更可控，也能避免继续把方向判断散落在 UI 或事件处理里。
