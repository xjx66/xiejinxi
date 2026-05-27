# 角色世界对象化重构计划

## Summary

本次重构目标是彻底移除当前“第一列角色 = DOM carousel + activeIndex + heads”的历史实现，把全部角色统一重建为与 `products` / `paintings` / `tree` 一致的背景世界对象：

- 角色固定在 3D 世界坐标中，不再通过 `.carousel-item` 做前景投影排布。
- 角色继续保留现有能力：`idle`、动作标签、被点击选中、选中高亮、加载态、对话。
- `X` 与 `大黄` 保持统一外层对象体系，但底层继续复用已有适配引擎：`decals` / `robot`。
- 对话入口改为“角色旁浮层”，仅绑定当前选中角色。
- `已离职` / `待入职` 角色保持现状：仍可被点击、被选中、展示 idle；默认不开放对话。

## Current State Analysis

基于当前仓库只读检查，现状如下：

- `avatar-world-runtime.js` 已存在，并且已经能把 `AVATAR_MODELS` 渲染成 `CanvasTexture + Plane` 放入 `bgScene`，但尚未被 `talkinghead.js` 正式接入。
- `avatar-assets.js` 已被部分改造成世界对象配置，包含 `engineType`、`worldPosition`、`worldSize`、`labelOffset`、`dialogueAnchorOffset`、`selectionProjectOffset` 等字段，可作为新体系的配置基础。
- `avatar-engine-robot.js` 与 `avatar-engine-decals.js` 已存在，已经把旧特殊角色逻辑包装为统一 controller，但当前页面入口仍然通过 `index.html` 直接加载旧 `robot.js` / `decals.js`。
- `talkinghead.js` 里仍保留一整套旧角色主链路：
  - `DOMContentLoaded` 中通过 `#carousel-turntable` 创建 `.carousel-item`
  - 维护 `heads`、`activeIndex`、`syncActiveAvatarModel()`
  - 通过旧 DOM 标签、旧 loader、旧输入框控制角色
  - `window.handleSpeak()` 仍依赖 `models[activeIndex]` 和全局 `head`
- `animateBg()` 仍然每帧读取 `.carousel-item` 做前景投影同步，这条链路必须整体删除，否则新旧系统会并存。
- 现有背景统一选中链路只对 `products` / `paintings` / `tree` 完整生效；虽然 `avatar-world-runtime` 给 avatar mesh 写了 `selectableType: 'avatar'`，但当前高亮覆盖逻辑默认从 `object.children` 生成 overlay，而 avatar 本体是单个 plane mesh，没有子节点，直接接入后不会出现选中高亮。
- `index.html` 仍保留 `#carousel-turntable`、`#decals-container`、`#robot-container` 三套历史容器，并继续加载 `robot.js` / `decals.js`，这与“抛弃历史角色逻辑”的目标冲突。
- `style.css` 中 `.carousel-item`、`.carousel-item.selected`、`.carousel-item .avatar-tag` 等旧样式仍然是角色的主视觉来源，新方案下应被下线或降级为无效。

## Assumptions & Decisions

- 保留当前资产文件，不替换 GLB / 贴花 / 机器人资源。
- 统一外层架构以 `avatar-world-runtime.js` 为角色世界对象入口。
- `TalkingHead` 继续作为大部分角色的底层驱动，不重写嘴型/骨骼/动作系统。
- `X` 继续走 `avatar-engine-decals.js`，`大黄` 继续走 `avatar-engine-robot.js`，但它们的选中、标签、对话入口、加载态全部走统一 avatar world-object 流程。
- 对话 UI 采用“角色旁浮层”，不再把底部全局输入框作为主入口。
- 维持当前状态语义：
  - `在职` 角色：可选中、可对话、可动作、可 idle
  - `待入职` / `已离职` 角色：可选中、可 idle、可显示标签与加载态，但默认不可发起对话
- 本次重构不更改产品列、画作列、树列的核心数据结构，只扩展统一交互链路以容纳 `avatar`

## Proposed Changes

### 1. `avatar-assets.js`

把当前“世界坐标配置”升级为完整的 avatar 世界对象 schema，作为唯一角色数据源。

要做的事：

- 补齐统一交互字段，明确哪些角色可对话、可发声、可执行二级动作。
- 用显式字段替代旧链路还在读但新配置里并不存在的历史字段，避免 `talkinghead.js` 再回退到 `worldAnchor` / `anchorBottomPx` / `screenOffsetY` / `canvasPlacement` / `tagTop`。
- 为角色浮层对话 UI 提供足够锚点信息，例如：
  - `dialogueAnchorOffset`
  - `selectionProjectOffset`
  - `labelOffset`
  - `focusOffsetZ` 或复用全局默认值
- 新增能力声明字段，建议最少包含：
  - `canChat`
  - `canSpeak`
  - `canSecondaryAction`
  - `voice`
  - `personality`

为什么这样做：

- `talkinghead.js` 当前旧逻辑同时读新旧两套字段，容易在删除 carousel 后留下隐性空值回退。
- 能力声明前置到配置层后，`window.handleSpeak()`、标签显示、浮层显隐都可以只依赖选中角色配置，不再散落在业务逻辑里写 if/else。

### 2. `avatar-world-runtime.js`

把现有 runtime 从“只负责生成 plane”补强为完整的角色世界对象运行时。

要做的事：

- 保留现有 `hostRoot -> host -> controller -> canvas -> CanvasTexture -> Plane` 结构。
- 返回结构从简单 `avatarSelectables/avatarEntries` 升级为可直接驱动业务的 entry 列表，每个 entry 至少应包含：
  - `key`
  - `config`
  - `mesh`
  - `controller`
  - `texture`
  - `loader`
  - `label`
  - `isLoaded()`
- 给 mesh 的 `userData` 明确挂载统一世界对象能力：
  - `selectableType: 'avatar'`
  - `labelType: 'avatar'`
  - `labelElement`
  - `loaderElement`
  - `dialogueAnchorOffset`
  - `selectableFocusZ`
  - `selectableProjectOffset`
  - `avatarController`
  - `avatarConfig`
  - `avatarEntryKey`
- 补一个 runtime 级查询接口，例如：
  - `getEntryByMesh(mesh)`
  - `getEntryByKey(key)`
  - `getEntries()`
- 给 talkinghead controller 增加统一方法封装，保证三种引擎对上层接口一致：
  - `setSelected(value)`
  - `playGreeting()`
  - `handleActionTag(tag)`
  - `onSpeechStart()`
  - `onSpeechEnd()`
  - `triggerSecondaryAction(payload)`
  - `speakAudio(data, text)` 或 `playSpeechBuffer(buffer, text)`
  - `destroy()`
- 保留每帧 `texture.needsUpdate = true` 的刷新入口，最终由背景动画循环统一调用。

为什么这样做：

- 当前 runtime 已经是正确方向，但还只是“可渲染”，不是“可驱动业务”。
- 选中、对话、动作、标签、加载态要统一落到 entry/controller 级别，否则主文件会再次退化成读全局变量。

### 3. `avatar-engine-robot.js`

将其确认成“大黄的底层适配器”，而不是页面级入口。

要做的事：

- 保持当前自管理 scene/camera/renderer 的方式不变。
- 以 controller 接口为唯一对外能力来源，不再依赖页面中任何固定 DOM 容器状态。
- 明确 `setSelected()` 的作用：决定是否允许 `triggerSecondaryAction()` 或额外互动。
- 保持 Idle/Wave/Dance/Speech 状态机现状，但统一由上层通过 controller 调用，不允许直接依赖 `window.playRobotEmote` 这类旧全局通道。

为什么这样做：

- 这个文件已经基本符合方向，不需要重写，只需要在实施时把旧业务入口彻底切掉。

### 4. `avatar-engine-decals.js`

将其确认成“X 的底层适配器”。

要做的事：

- 保持当前 decal 逻辑与 raycast/UV 二级互动。
- 不再依赖旧 `#decals-container` 页面容器。
- 继续通过 `triggerSecondaryAction(uv)` 暴露特殊互动，供统一 avatar click/secondary click 链路调用。
- 不给它额外补 mouth animation，本次只保留当前“可被选中、可触发特殊动作、可参与统一对话入口”的外层一致性。

为什么这样做：

- 用户明确接受 “统一外层体系，但底层可暂时继续走 decals/robot”。

### 5. `talkinghead.js`

这是本次重构的主战场，需要把角色业务主链路从 carousel 彻底迁移到 avatar world objects。

#### 5.1 接入新 runtime

在 `initGlobalBackground()` 中正式初始化 avatar runtime：

- 调用 `createAvatarWorldRuntime({ scene: bgScene, createLabel: createBgLabel, createLoader: createBgLoader, focusOffsetZ: BG_FOCUS_CAMERA_OFFSET_Z })`
- 挂到模块级变量 `avatarWorldRuntime`
- 建立 `selectedAvatarEntry` 的唯一来源，不再依赖 `activeIndex`

#### 5.2 改造统一选中链路

把 avatar 正式并入背景对象点击体系。

要做的事：

- 在现有背景点击检测里，把 avatar 纳入 `raycaster` 与 fallback nearest-pick 候选池。
- 复用 `toggleActiveBackgroundSelectable()`，但修补 overlay 构建逻辑：
  - 当前 overlay 默认从 `object.children` 克隆，avatar plane 没有 children，会导致没有选中高亮。
  - 方案：让 overlay builder 支持“对象本身为 mesh 时直接克隆自身 geometry/material”，或对 `selectableType === 'avatar'` 单独走 plane overlay。
- 当选中 avatar 时：
  - 设置 `selectedAvatarEntry`
  - 调用 `entry.controller.setSelected(true)`
  - 聚焦相机到 `mesh.position.x + selectableFocusZ`
  - 显示 avatar label
  - 显示角色旁对话浮层（若 `canChat`）
- 当取消选中 avatar 时：
  - 清理高亮
  - `selectedAvatarEntry = null`
  - 隐藏 avatar 对话浮层
  - `entry.controller.setSelected(false)`

#### 5.3 删除旧 carousel 主链路

这一部分要整体移除，不做保留兼容。

要删的内容：

- `DOMContentLoaded` 中通过 `#carousel-turntable` 生成 `.carousel-item` 的整段逻辑
- `heads`
- `activeIndex`
- `syncActiveAvatarModel()`
- `switchModel()`
- `updateCarousel()`
- 旧 loader/tag/selected DOM 状态逻辑
- `animateBg()` 中针对 `.carousel-item` 的每帧投影逻辑
- 依赖 `worldAnchor` / `anchorBottomPx` / `screenOffsetY` / `canvasPlacement` 的过渡代码

为什么必须整段删除：

- 用户要求“完全重做这部分代码，抛弃历史角色逻辑”。
- 如果保留 `activeIndex` 和 `.carousel-item` 作为隐藏后门，后续选中、对话、动作仍会出现串角色或 UI 双状态。

#### 5.4 重写对话链路

把当前 `window.handleSpeak()` 从“基于 `activeIndex/head` 的全局角色说话”改成“基于 `selectedAvatarEntry` 的当前选中角色说话”。

要做的事：

- `callVolcengineAI()` 的 personality 来源改为 `selectedAvatarEntry.config.personality`
- 对话历史改为 `avatarConversationHistoryMap.get(entry.key)` 维度存储，而不是多个角色共享一条历史
- 在发送前检查：
  - 必须有 `selectedAvatarEntry`
  - 必须 `selectedAvatarEntry.config.canChat === true`
- `window.handleSpeak()` 改为：
  - 读取浮层输入框内容
  - 用选中角色的 personality 请求 AI
  - 解析动作标签
  - 语音路由到对应 controller
- `processActions()` 改为接收当前目标 entry 或从 `selectedAvatarEntry` 读取目标 controller，不再使用全局 `head`
- 对不同引擎的语音/动作路由：
  - `talkinghead`：动作仍调用 `controller.handleActionTag()`，语音走 controller 内 `speakAudio()` 或 TalkingHead 对接音频
  - `robot`：动作走 `handleActionTag()`，语音沿用当前 HeadTTS 音频队列方案，但目标身份来自 `selectedAvatarEntry`
  - `decals`：动作支持二级交互；语音只播放音频，不强求嘴型

#### 5.5 角色旁对话浮层

新增一个真正的“就地对话 UI”，锚定当前选中角色。

要做的事：

- 在页面上新增一个独立的 avatar dialogue layer 根节点，或由 JS 创建后挂到 body。
- 浮层内容至少包含：
  - 输入框
  - 发送按钮
  - loading 状态
  - 当前角色名或状态文案
- 在背景动画循环中，把浮层根据 `selectedAvatarEntry.mesh + dialogueAnchorOffset` 投影到屏幕位置。
- 仅当：
  - 有选中角色
  - 角色可对话
  - 角色在视野内
  时显示浮层。
- 当选中不可对话角色时，不显示输入框，只保留选中态与标签。

#### 5.6 保留并统一 idle / 动作 / 加载态

- idle 继续由各 controller 自己维护。
- greeting、动作标签、speech start/end 统一由上层在同一条消息流里调度。
- loader 与 label 继续使用背景对象现有体系，而不是再造一套 avatar 专属 DOM 样式。

### 6. `index.html`

把页面入口从“旧三套角色容器”切换到“统一背景角色 + 对话浮层”。

要做的事：

- 删除或清空以下历史容器：
  - `#carousel-turntable`
  - `#decals-container`
  - `#robot-container`
- 删除底部旧 `#talkinghead-input-container` 作为主入口的职责。
- 新增一个更轻量的对话浮层挂载点，例如：
  - `#avatar-dialogue-layer`
- 移除直接加载旧入口脚本：
  - `<script type="module" src="decals.js?v=3"></script>`
  - `<script type="module" src="robot.js?v=3"></script>`
- 保留 `talkinghead.js` 作为唯一业务入口。

为什么这样做：

- 旧容器存在会持续诱导主文件保留兼容代码。
- 既然角色被当成世界对象，页面就不应该再暴露“角色专区容器”。

### 7. `style.css`

清理旧 carousel 样式，新增 avatar 浮层样式。

要做的事：

- 删除或停用以下样式块：
  - `.carousel-item`
  - `.carousel-item.active`
  - `.carousel-item.selected canvas`
  - `.carousel-item .avatar-tag`
  - `.carousel-item.selected .avatar-tag`
  - `.carousel-item.active .active-indicator`
- 保留通用字体/标签样式中可复用的部分，迁移到新的背景 label / dialogue bubble 样式。
- 新增：
  - `#avatar-dialogue-layer`
  - `#avatar-dialogue-panel`
  - 浮层输入框/按钮/loading 文案
  - 不可对话状态样式

为什么这样做：

- 如果不清理旧样式，后续很容易残留“看不见的 DOM 角色”与新浮层样式冲突。

### 8. `robot.js` / `decals.js`

本次不要求删除文件本身，但要退出业务主流程。

要做的事：

- 通过 `index.html` 停止加载这两个旧入口。
- 后续只有 `avatar-engine-robot.js` / `avatar-engine-decals.js` 被 `avatar-world-runtime.js` 调用。

为什么这样做：

- 这是“抛弃历史角色逻辑”的最小且安全做法。
- 物理删除文件可以后续再做，不影响本次架构目标。

## Implementation Order

建议执行顺序如下：

1. 先收敛 `avatar-assets.js` schema，去掉所有旧字段回退依赖。
2. 补强 `avatar-world-runtime.js` 返回结构和 controller 统一接口。
3. 在 `talkinghead.js` 中先接入 runtime 与 avatar selection，再修 overlay 支持 avatar plane。
4. 完成 `selectedAvatarEntry` 驱动的对话、动作、TTS 链路。
5. 新增角色旁浮层 UI 并接入投影更新。
6. 删除 `DOMContentLoaded` 里的旧 carousel 初始化与 `animateBg()` 旧 DOM 投影逻辑。
7. 最后清理 `index.html` 与 `style.css` 的旧容器/旧样式，并移除 `robot.js` / `decals.js` 页面入口。

## Verification Steps

实施完成后，按以下步骤验收：

1. 打开页面，确认不再生成 `.carousel-item`，DOM 中不存在旧 turntable 角色节点。
2. 检查 `index.html` 页面不再加载 `robot.js` / `decals.js`，且旧容器不再承担角色渲染职责。
3. 进入场景后，全部 avatar 与 `products` / `paintings` / `tree` 一样固定在世界坐标中；前进/后退/左右移动时不再发生角色挤压、聚拢或消失。
4. 左键点击任一 avatar，可获得统一选中态与高亮；再次点击同一角色可取消选中。
5. 选中 `在职` 角色时，角色旁出现浮层输入框；选中 `已离职` / `待入职` 角色时不出现可输入浮层。
6. 发送对话后：
  - AI personality 使用当前选中角色配置
  - 动作标签触发到当前选中角色
  - 语音不会串到其他角色
  - `idle -> speaking/action -> idle` 能正常回切
7. `X` 与 `大黄` 仍可被点击、选中、显示标签，并且：
  - `X` 的二级互动仍可触发 decal 逻辑
  - `大黄` 的 wave/dance/idle/speech 状态仍可运行
8. 角色 loader、label、selection overlay 在主题切换和场景漫游下仍然工作。
9. 对修改过的文件运行诊断，确保没有新增明显语法或 linter 错误。

## Out of Scope

- 不更换角色模型资产。
- 不重构产品列、画作列、树列的数据结构。
- 不把 `X` 的 decal 交互升级成完整 TalkingHead 能力。
- 不在本次顺手做角色资源懒加载、流式分片加载或更复杂的性能优化。
