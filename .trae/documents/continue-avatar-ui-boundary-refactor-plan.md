# 继续架构边界重构计划：Phase 8 Avatar 与 Phase 9 AI 面板

## Summary

本计划承接已完成的 `full-architecture-boundary-refactor-plan.md` 前半部分，在当前代码真实状态上继续推进剩余两块重构：

- Phase 8：将 `avatar-world-runtime.js` 拆为 Avatar 配置适配、可视层、引擎控制、世界对象工厂四个边界。
- Phase 9：将 `talkinghead.js` 中右侧 AI 操作面板拆为订阅式 UI controller，面板只订阅系统状态，不直接承载 picking、selection、world lifecycle 规则。

执行原则：

- 先做 Avatar runtime 分层，再做 AI 面板订阅化。
- 每一步保留当前行为，不引入新的交互语义。
- 不恢复 `screen fallback`，不新增基于屏幕距离的猜测选择。
- 选中视觉继续使用 `THREE.Box3Helper`，不引入 glow/outline。
- `talkinghead.js` 可临时保留少量 `window.*` 兼容桥，但新增模块不能依赖屏幕兜底或相机 Z 过滤。

## Current State Analysis

### 已完成基础

- `infrastructure/picking-system.js`
  - 已承接真实 3D raycast / collider picking。
  - `query()` 只返回 `precise`、`collider` 或 `null`。
  - 不应在后续重构中新增 `screen` 模式。

- `infrastructure/selection-store.js`
  - 已承接全局选中态。
  - 当前 `talkinghead.js` 仍保留 `activeBackgroundSelectable` 作为兼容镜像。

- `infrastructure/selection-overlay.js`
  - 已订阅 `selectionStore` 并绘制 `Box3Helper`。

- `domain/asset-schema.js`、`domain/capability-schema.js`、`domain/world-object-schema.js`
  - 已提供统一 assetInfo、capability、WorldObject record 入口。

- `usecases/create-asset-from-upload.js`、`usecases/create-world-object-from-asset.js`、`usecases/replace-world-object-asset.js`
  - 已把上传资产、创建 WorldObject、替换 WorldObject 从 `talkinghead.js` 中部分抽出。

- `ai/ai-orchestrator.js`、`ai/action-protocol.js`、`ai/world-context-serializer.js`
  - 已提供 AI action 协议雏形。

- `infrastructure/camera-controller.js`、`infrastructure/focus-policy.js`
  - 已把相机目标状态和 focus policy 从主文件中抽离。

- `infrastructure/scene-object-lifecycle.js`
  - 已承接 managed world object 的创建、替换、销毁。

### 当前剩余耦合

- `avatar-world-runtime.js`
  - 同时负责：
    - 从 `AVATAR_MODELS` 读取资源、布局、人格、能力、hitTest。
    - 创建隐藏 DOM host。
    - 初始化 `TalkingHead`、Robot、Decals 三类引擎。
    - 加载 TalkingHead 可见 GLB 模型。
    - 处理 TalkingHead 骨骼 idle / wave / point / handup 动作。
    - 计算模型落地、缩放和 pick-volume。
    - 构造 selectable root 的 `userData.assetInfo`、`avatarController`、`avatarConfig`。
  - 这违反“资产表达、系统实例、AI 表达控制分离”的边界。

- `avatar-assets.js`
  - `AVATAR_MODELS` 混合了 asset、template、world object、AI persona、voice、capability、picking 参数。
  - 本轮不一次性重写数据源，但需要通过 adapter 输出更清晰的 runtime profile。

- `talkinghead.js`
  - 顶部仍直接维护：
    - `selectedAvatarEntry`
    - `avatarConversationHistoryMap`
    - `updateSelectedAvatarEntry()`
    - `getAvatarEntryByKey()`
    - `getAvatarEntryByMesh()`
  - `DOMContentLoaded` 后半段仍直接维护右侧 AI 面板 DOM、上传事件、删除事件、视频控制、prompt 同步。
  - `window.handleSpeak` 同时做 UI 校验、AI action 解析、WorldObject 创建/替换、selection 更新、focus 更新。

- `infrastructure/ai-action-context.js`
  - 已有订阅机制，可直接服务面板 controller。
  - 仍与 `selectionStore` 有部分状态重叠，但本轮只做 controller 化，不强行删除它。

## Proposed Changes

### Phase 8.1：创建 Avatar 目录与配置适配器

新增文件：

- `avatar/avatar-config-adapter.js`

职责：

- 从 `avatar-assets.js` 的 legacy config 生成稳定的 runtime profile。
- 把当前 `avatar-world-runtime.js` 中散落的 ID、assetInfo、capability、world transform 默认值集中收口。
- 保持原有 `AVATAR_MODELS` 数据不改大结构，降低 diff 风险。

接口：

```js
export const createAvatarRuntimeProfile = ({ config, focusOffsetZ }) => ({
    key,
    worldObjectId,
    assetId,
    engineType,
    engineConfig,
    worldTransform,
    worldSize,
    label,
    interaction,
    assetInfo,
    capabilities,
    persona
});
```

实现要求：

- `worldObjectId` 保持当前格式：`avatar-${config.key}`。
- `assetId` 保持当前格式：`asset-avatar-${config.key}`。
- `assetInfo` 字段保持当前面板显示兼容：`id/name/kind/source/type/status/desc/engineType/url`。
- `interaction.hitTest` 原样承接 `config.hitTest`。
- `interaction.pickVolumeScale` 原样承接 `config.pickVolumeScale`。
- `persona.voice/personality` 保留给当前 TTS/对话逻辑使用。

迁移点：

- `avatar-world-runtime.js` 的循环中不再直接拼 `assetInfo`、`worldObjectId`、label offset、dialogue offset、focus Z。
- 改用 profile 字段装配 `userData`。

### Phase 8.2：抽离 Avatar host 与可视几何工具

新增文件：

- `avatar/avatar-host-layer.js`
- `avatar/avatar-visual-layer.js`

`avatar/avatar-host-layer.js` 职责：

- 承接 `createHostRoot()` 与 `createHost()`。
- 继续创建离屏 DOM host，保持 TalkingHead/Robot/Decals 引擎现有渲染机制不变。

接口：

```js
export const createAvatarHostRoot = () => HTMLElement;
export const createAvatarHost = (hostRoot, profile) => HTMLElement;
```

`avatar/avatar-visual-layer.js` 职责：

- 承接：
  - `AVATAR_FLOOR_Y`
  - `FOOT_BONE_NAMES`
  - `getGroundReferenceY()`
  - `fitWorldObjectToTargetHeight()`
  - `createAvatarPickVolume()`
- 这些属于系统实例与可视几何适配，不属于 AI 或面板。

接口：

```js
export const AVATAR_FLOOR_Y = -5;
export const fitAvatarWorldObjectToTargetHeight = ({ THREE, worldObject, profile }) => ({ width, height, depth });
export const createAvatarPickVolume = ({ THREE, profile, fittedSize }) => THREE.Mesh;
```

实现要求：

- pick-volume 保持真实 3D collider，不使用屏幕距离兜底。
- pick-volume 的 material 继续透明、`opacity: 0`、`depthWrite: false`。
- 落地逻辑保持当前脚骨优先、fallback box minY。

### Phase 8.3：抽离 TalkingHead 可见层引擎

新增文件：

- `avatar/talkinghead-avatar-engine.js`

职责：

- 从 `avatar-world-runtime.js` 迁出 `DEFAULT_HEAD_OPTIONS` 与 `createTalkingHeadEngine()`。
- 继续保留当前双层机制：
  - `TalkingHead` 负责说话、表情、gesture API。
  - `GLTFLoader` 加载同一 avatar GLB 作为世界中的真实可见 3D 模型。
- 继续保留当前骨骼 gesture 逻辑，避免行为回归。

接口：

```js
export const createTalkingHeadAvatarEngine = async ({
    THREE,
    TalkingHead,
    GLTFLoader,
    host,
    profile,
    onLoaded,
    onProgress
}) => AvatarEngineController;
```

返回 controller 必须兼容当前调用：

```js
{
    type,
    host,
    canvas,
    head,
    worldObject,
    ready,
    isLoaded,
    setSelected,
    playGreeting,
    handleActionTag,
    onSpeechStart,
    onSpeechEnd,
    triggerSecondaryAction,
    update,
    speakAudio,
    start,
    stop,
    destroy
}
```

实现要求：

- 不改 `head.showAvatar()` 参数语义。
- 不改 `preserve`、`cameraYOffset`、`avatarScale` 的效果。
- 不改 `wave/point/handup` 时长和骨骼算法。
- `destroy()` 继续清空 host。

### Phase 8.4：抽离 Avatar 世界工厂

新增文件：

- `avatar/avatar-world-factory.js`

职责：

- 负责把 profile、host、label、loader、controller 组装成 scene selectable root。
- 设置 `mesh.userData` 和 `pickVolume.userData`。
- 返回 entry，而不是在 `talkinghead.js` 中散落装配。

接口：

```js
export const createAvatarWorldEntry = ({
    THREE,
    profile,
    controller,
    label,
    loader,
    fittedSize,
    pickVolume
}) => ({
    key,
    profile,
    config,
    mesh,
    pickVolume,
    controller,
    planeSize,
    label,
    loader,
    isLoaded,
    getProgress
});
```

实现要求：

- `entry.config` 暂时保留为 legacy config 兼容字段，避免一次性修改 `talkinghead.js` 的 TTS/对话逻辑。
- `mesh.userData.avatarConfig` 暂时保留兼容。
- 新增 `mesh.userData.capabilities = profile.capabilities`，但不删除旧的 `avatarCapabilities`。
- `mesh.userData.assetInfo` 来自 profile，不在 factory 内重新拼接。

### Phase 8.5：收缩 `avatar-world-runtime.js`

修改文件：

- `avatar-world-runtime.js`

目标结构：

- 导入：
  - `AVATAR_MODELS`
  - `createAvatarRuntimeProfile`
  - `createAvatarHostRoot`
  - `createAvatarHost`
  - `fitAvatarWorldObjectToTargetHeight`
  - `createAvatarPickVolume`
  - `createTalkingHeadAvatarEngine`
  - 现有 `createRobotAvatarEngine`
  - 现有 `createDecalsAvatarEngine`
  - `createAvatarWorldEntry`
- 保留 `createAvatarWorldRuntime()` 作为 composition function。
- 循环内流程变为：
  - legacy config -> profile
  - profile -> host / label / loader
  - profile.engineType -> controller
  - controller.worldObject -> fit
  - profile + fittedSize -> pickVolume
  - factory -> entry
  - add to group/maps

验收：

- `createAvatarWorldRuntime()` 对外返回 API 不变：
  - `avatarGroup`
  - `avatarSelectables`
  - `avatarEntries`
  - `getEntries()`
  - `getEntryByKey()`
  - `getEntryByMesh()`
  - `update()`
  - `destroy()`
- `talkinghead.js` 的 `createAvatarWorldRuntime()` 调用无需大改。
- 所有 avatar 仍注册为 `type: 'avatar'` hit target。
- `X`、Bot1、Bot2、大黄仍能选中、显示右侧信息、触发 greeting / secondary action。

### Phase 9.1：抽离 AI 面板 Controller

新增文件：

- `ui/ai-panel-controller.js`

职责：

- 承接 `talkinghead.js` 中右侧 AI 操作面板 DOM 查询、渲染和事件绑定。
- 面板只通过注入的 stores/usecases/controllers 读写状态，不直接知道 picking 内部。

接口：

```js
export const createAiPanelController = ({
    document,
    window,
    worldState,
    aiActionContext,
    selectionStore,
    sceneObjectRegistry,
    aiOrchestrator,
    createAssetFromUpload,
    uploadRuntime,
    createWorldObjectFromAsset,
    replaceWorldObjectAsset,
    createManagedWorldObject,
    replaceManagedSceneObject,
    deleteWorldObject,
    selectSceneRoot,
    clearSelection,
    focusWorldObject,
    updateSelectedAvatarEntry,
    debugLogger
}) => ({
    render(),
    setBusy(busy, message),
    dispose()
});
```

迁移内容：

- 从 `talkinghead.js` 迁出：
  - `formatWorldPoint()`
  - `formatVideoTime()`
  - `getSelectedSceneRoot()`
  - `getSelectedVideo()`
  - `getSelectedAssetInfo()`
  - `renderAssetInfo()`
  - `renderVideoControls()`
  - `setDialogueBusy()`
  - `buildWorldObjectPayload()`
  - `renderAiPanel()`
  - `window.handleSpeak` 的主体逻辑
  - `nodePrompt/nodeUpload/nodeSubmit/nodeDelete/nodeReset/nodeVideoToggle/nodeVideoProgress` listeners
  - `aiActionContext.subscribe(...)`
  - 视频控制 `setInterval`

保留在 `talkinghead.js`：

- 键盘移动监听，因为它属于相机/世界导航，不属于 AI 面板。
- TTS / HeadTTS 初始化逻辑，暂不并入面板 controller。
- avatar 说话 action 处理，暂不并入面板 controller。

### Phase 9.2：面板状态与 Selection 同步

修改文件：

- `ui/ai-panel-controller.js`
- `talkinghead.js`

目标：

- 面板渲染订阅：
  - `aiActionContext.subscribe(render)`
  - `selectionStore.subscribe(render)`
- `getSelectedSceneRoot()` 优先使用 `aiActionContext.selectedObjectId`，其次使用 `selectionStore.getState().selectedWorldObjectId`。
- 删除对象后：
  - 调用注入的 `deleteWorldObject(id)`。
  - 调用 `clearSelection('deleted')`。
  - 将 `aiActionContext` 回到 create mode，并保留 fallback point。

实现要求：

- 不在 controller 内直接调用 `selectionStore.select()`；创建/替换成功后通过注入的 `selectSceneRoot(nextRoot, meta)` 完成选择。
- 不在 controller 内直接访问 `window.activeBackgroundSelectable`，除非作为短期 fallback，且应集中封装在 `getSelectedSceneRoot()` 中。
- `nodeDelete` 继续禁止删除 avatar。
- 替换 avatar 仍提示“不支持直接替换角色模板”。

### Phase 9.3：视频控制 Controller 可选小拆分

新增文件：

- `ui/video-controls-controller.js`

是否执行：

- 若 `ai-panel-controller.js` 初始迁移后超过约 250 行，则抽出。
- 若初始 controller 仍清晰，则本轮可暂缓，不强制拆分。

职责：

- 承接 `formatVideoTime()`、`renderVideoControls()`、播放/暂停、进度条 input、定时刷新。

接口：

```js
export const createVideoControlsController = ({
    nodes,
    getSelectedVideo,
    getState
}) => ({
    render(),
    dispose()
});
```

### Phase 9.4：Loading 状态保持现状，只轻量封装

不新增文件，除非迁移中发现重复明显。

当前 `talkinghead.js` 前半段有 `startSceneLoadingItem()`、`finishSceneLoadingItem()`、`renderSceneLoadingNotice()`，这属于场景加载状态，不强行并入 AI 面板。

AI 面板 controller 只调用现有 `window.renderSceneLoadingNotice?.()` 作为兼容展示，不拥有全局 loading store。

## Assumptions & Decisions

- 本轮以行为不变为第一优先级，目标是边界拆分，不做新功能。
- `avatar-assets.js` 暂不大规模改 schema；先通过 adapter 生成 profile。
- `avatar-engine-robot.js` 与 `avatar-engine-decals.js` 暂不拆，先作为已存在的 engine controller 接入新 world factory。
- `TalkingHead` 可见 GLB 双加载架构暂时保留，因为当前 3D 形态和落地效果依赖它。
- `talkinghead.js` 仍作为 composition root 存在，目标是减少职责，不追求本轮归零。
- `window.selectionStore`、`window.aiOrchestrator`、`window.sceneObjectRegistry` 等调试/兼容 bridge 暂时保留。
- 右侧面板背景 `pointer-events: none` 的 CSS 约束不得破坏，仅控件可点击。
- picking 相关代码不得新增 camera Z filter、proximity auto interaction、screen fallback、selection aperture。

## Verification Steps

### 静态检查

执行：

```bash
node --check avatar-world-runtime.js
node --check avatar/avatar-config-adapter.js
node --check avatar/avatar-host-layer.js
node --check avatar/avatar-visual-layer.js
node --check avatar/talkinghead-avatar-engine.js
node --check avatar/avatar-world-factory.js
node --check ui/ai-panel-controller.js
node --check talkinghead.js
```

若创建了 `ui/video-controls-controller.js`，额外执行：

```bash
node --check ui/video-controls-controller.js
```

### 浏览器 smoke test

在本地页面 `http://localhost:3000/` 验证：

- 页面可加载到 `场景加载完成，可以点击对象`。
- `window.queryBestHitTarget` 存在。
- `window.selectionStore` 存在。
- `window.aiOrchestrator` 存在。
- `window.sceneObjectRegistry` 存在。
- 抽样点击或脚本采样结果不包含 `mode: "screen"`。
- Avatar `X`、Bot1、Bot2、大黄可选中。
- 选中 avatar 后：
  - 右侧面板显示目标名称和资产信息。
  - 选中框为 `Box3Helper`。
  - 不出现 glow/outline。
- 点击空白处：
  - 锁定世界坐标。
  - 面板进入创建模式。
- 上传图片/视频/GLB：
  - 面板显示上传资产。
  - 确认创建后新对象出现并被选中。
- 选中非 avatar 对象：
  - 面板进入替换模式。
  - 可删除对象，删除后选中框消失，面板回到 create mode。
- 选中视频对象：
  - 视频控制区域显示。
  - 播放/暂停和进度条可用。

### 回归风险重点

- TalkingHead avatar 可能因 host/profile 字段迁移导致模型比例或落地偏移改变，需要优先验证脚底贴地和高度。
- `entry.config` 兼容字段如果遗漏，会影响 `canAvatarSpeak()`、voice setup、persona prompt。
- `entry.controller.worldObject` 如果迁移路径错误，会影响 avatar precise picking。
- 面板 controller 如果重复绑定事件，会导致一次点击触发多次创建/删除，因此 `dispose()` 必须清理 listener 与 interval。
- 创建/替换后若 selection 与 aiActionContext 不同步，会表现为选中框正确但面板目标错误，需要用 selectionStore 和 aiActionContext 同时验证。

## Execution Order

1. 新建 `avatar/` 模块并迁移 adapter / host / visual layer。
2. 迁移 `createTalkingHeadEngine()` 到 `avatar/talkinghead-avatar-engine.js`。
3. 新建 `avatar/avatar-world-factory.js` 并收缩 `avatar-world-runtime.js`。
4. 运行 Phase 8 静态检查和浏览器 smoke test。
5. 新建 `ui/ai-panel-controller.js`，从 `talkinghead.js` 迁移面板渲染和事件。
6. 必要时新建 `ui/video-controls-controller.js`。
7. 运行 Phase 9 静态检查和浏览器 smoke test。
8. 使用 `GetDiagnostics` 检查最近编辑文件，只修复本轮引入的问题，不清理无关历史 hint。
