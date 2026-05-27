# 全量架构边界重构计划

## Summary

本计划根据 `docs/architecture/rulese.md` 与用户最新确认的产品原则，将当前代码重构为清晰的三层边界：

- 系统层：世界状态、场景对象实例、点击选择、pick-volume、相机/聚焦、上传资产进入世界、对象生命周期。
- 资产层：Asset / ObjectTemplate / WorldObject / Capability schema、资产自身配置、Avatar 可视表达、渲染器。
- AI 编排层：AI 上下文、规则引擎/LLM 编排、动作指令、资产编辑指令、对话/TTS 调度。

用户已确认本次范围为“全量架构”，并允许“顺便修正”历史遗留行为。因此本计划不只搬迁代码，也会清理已确认不符合新边界的旧逻辑：

- 不恢复 `screen fallback`，选择只基于真实 `precise` 或 `collider` 3D 命中。
- 相机聚焦不参与可选性判断。
- 右侧 AI 面板只订阅系统状态，不直接驱动 picking。
- Debug 插桩从业务代码中抽离为可开关 logger。
- 上传流程拆为“创建 Asset -> 创建 WorldObject -> 实例化 SceneObject”。

## Current State Analysis

### 现有基础

- `infrastructure/world-state.js`
  - 已有 `Asset`、`Template`、`WorldObject` 的基本内存 store。
  - 支持 `addAsset`、`upsertWorldObject`、`removeWorldObject`、`snapshot`。
  - 目前缺少 capability schema、订阅机制、实例状态与编辑状态区分。

- `infrastructure/object-factory.js`
  - 已有 `createSceneObjectFactory()`，能根据上传类 `image/video/model` 调用 renderer。
  - 已有 `createRuntimeCollectionResolver()`，用于从 `worldState` 转换 product/painting/avatar 配置。
  - 当前只覆盖上传/内容驱动对象，未统一承接系统内置 `avatar/tree/product/painting` 全部实例逻辑。

- `infrastructure/scene-object-registry.js`
  - 已有按 `worldObjectId` 注册 scene root 的 registry。
  - 当前 registry 只负责查找/销毁，不负责 selection、picking、生命周期事件。

- `infrastructure/upload-runtime.js`
  - 已能从文件创建 Asset。
  - 当前会直接写 `worldState.addAsset()`，上传模块与世界状态耦合。

- `infrastructure/ai-action-context.js`
  - 已有 AI 面板上下文 store。
  - 当前同时承载“选择目标”“上传资产”“prompt”，与 selection store 职责重叠。

- `infrastructure/ai-rule-engine.js`
  - 已有本地规则引擎，将上传资产 + prompt 解析成创建/替换对象所需 metadata。
  - 当前还不是统一 action 指令，不覆盖移动、说话、编辑、删除等动作。

### 核心问题

- `talkinghead.js`
  - 现在是上帝模块，承担渲染、相机、picking、selection、UI、上传、创建/替换/删除、AI、TTS、debug 插桩。
  - 关键耦合点包括：
    - hit target 注册与空间索引：`registerHitTestTarget()`、`unregisterHitTestTargets()`。
    - 命中查询：`queryBestHitTarget()`。
    - 选中态：`activeBackgroundSelectable`、`clearActiveBackgroundSelectable()`、`setActiveBackgroundSelectable()`。
    - 选中框：`THREE.Box3Helper` 直接挂在 scene root 上。
    - AI 面板：DOM 与 `aiActionContext` 直接在主文件中更新。
    - 上传创建/替换/删除：面板事件直接操作 `worldState`、`sceneObjectRegistry`、`scene`。
    - 相机聚焦：`focusBackgroundSlot()` 与 selection 流耦合。
    - Debug：多个 `fetch("http://127.0.0.1:7777/event"...` 插桩散落在业务逻辑里。

- `avatar-world-runtime.js`
  - 同时处理 avatar 配置读取、宿主 DOM、TalkingHead 引擎、GLB 加载、可视骨骼层、pick-volume、assetInfo 注入、hit target 注册。
  - 资产表达能力、系统实例能力、AI 表达控制混在一个 runtime。

- `avatar-assets.js`
  - `AVATAR_MODELS` 混合资源路径、世界布局、能力声明、hitTest、pickVolumeScale、人格、声音、引擎类型。
  - 需要拆成资源层、模板层、实例层、capability 层。

- `renderers/image-renderer.js`、`renderers/video-renderer.js`、`renderers/model-renderer.js`
  - 已经接近 SceneObject renderer，但仍直接依赖 `window.bgLabels`、DOM label/loader、`registerHitTestTarget`。
  - 需要改为返回声明式 scene object record，由系统层统一注册 label、loader、picking。

- `content/templates/object-templates.js`
  - 已有模板雏形，但 capability、pickVolume、selection policy、editable properties 未统一。

## Proposed Changes

### Phase 0：安全基线与调试收口

目标：先建立重构保护网，避免边拆边破坏当前 3D 交互。

文件：

- `infrastructure/debug-logger.js` 新增。
- `talkinghead.js` 修改。
- `debug-avatar-focus-hit-test.md` 仅在用户确认后清理，不在本阶段删除。

改动：

- 新增 `createDebugLogger({ enabled, endpoint, sessionId })`。
- 将 `talkinghead.js` 中现有 debug `fetch(...)` 改为 `debugLogger.emit(event)`。
- 默认 `enabled` 从 `window.__DEBUG_HIT_TEST__` 或显式配置读取。
- 保留调试能力，但业务代码不再硬编码 debug server URL。

验收：

- `node --check talkinghead.js` 通过。
- 本地页面仍可加载。
- Debug 开关关闭时，不发送 debug 请求。

### Phase 1：抽离 Picking System

目标：将点击命中系统从 `talkinghead.js` 中抽成系统层模块。

新增文件：

- `infrastructure/picking-system.js`

接口：

```js
export const createPickingSystem = ({
  THREE,
  camera,
  getViewportSize,
  debugLogger
}) => ({
  registerTarget(root, options),
  unregisterTargets(predicate),
  markSpatialDirty(),
  setCollisionDebugVisible(visible, scene),
  query(clientX, clientY, options),
  updateTargetBounds(target, force)
});
```

核心规则：

- 只返回真实 3D 命中：
  - `mode: "precise"`：射线命中真实可见 mesh。
  - `mode: "collider"`：射线命中 pick-volume。
  - 无命中返回 `null`。
- 不实现、不保留 `screen fallback`。
- `worldBox/worldSphere/spatial grid` 只做 broad phase，不做最终选择。
- `precise` 与 `collider` 合并为 exact hit list，按最近 `distance` 排序。
- 不读取 `window.bgTargetPositionX/Z`。
- 不根据相机 Z 层过滤 avatar/product/tree。

迁移范围：

- 从 `talkinghead.js` 迁出：
  - `hitTestTargets`
  - `hitTestTargetByRoot`
  - `hitTestSpatialGrid`
  - `registerHitTestTarget`
  - `unregisterHitTestTargets`
  - `getRaySpatialCandidates`
  - `evaluateHitTestTarget`
  - `queryBestHitTarget`
  - collision debug helpers

`talkinghead.js` 改为：

```js
const pickingSystem = createPickingSystem({
  THREE,
  camera: bgCamera,
  getViewportSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
  debugLogger
});

window.queryBestHitTarget = (...args) => pickingSystem.query(...args);
```

验收：

- 点击前景对象不会选中后景对象。
- 点击空白返回空白，不吸附附近对象。
- `X`、Bot1、Bot2、product、painting、tree 均能通过真实 pick-volume/mesh 命中。
- `screen` 模式不再出现在任何 query result。

### Phase 2：抽离 Selection Store 与 Selection Overlay

目标：选中态成为系统状态，UI/AI 面板/Box3Helper 都只订阅它。

新增文件：

- `infrastructure/selection-store.js`
- `infrastructure/selection-overlay.js`

接口：

```js
export const createSelectionStore = () => ({
  getState(),
  select({ worldObjectId, root, hitPoint, hitResult }),
  clear(reason),
  subscribe(listener)
});
```

```js
export const createSelectionOverlay = ({ THREE, scene, selectionStore, getSelectionBoxColor }) => ({
  dispose()
});
```

迁移范围：

- 从 `talkinghead.js` 迁出：
  - `activeBackgroundSelectable`
  - `clearActiveBackgroundSelectable`
  - `setActiveBackgroundSelectable`
  - selection `Box3Helper` 创建/销毁
  - 通过 `window.activeBackgroundSelectable` 做状态共享的逻辑

行为修正：

- 选中视觉统一为 `THREE.Box3Helper`，不引入 glow/outline。
- AI 面板通过 `selectionStore.subscribe()` 更新目标对象信息。
- 删除对象时只调用 `selectionStore.clear("deleted")`。

验收：

- 选中/取消选中后右侧面板状态一致。
- 删除对象后选中框消失，面板回到空白模式。
- 无 `window.activeBackgroundSelectable` 作为业务依赖；可临时保留只读兼容桥，计划后续删除。

### Phase 3：建立 Asset / WorldObject / Capability Schema

目标：用统一 schema 收敛 `userData.assetInfo` 和 capability。

新增文件：

- `domain/asset-schema.js`
- `domain/world-object-schema.js`
- `domain/capability-schema.js`

接口：

```js
export const normalizeAssetInfo = ({ asset, worldObject, template }) => ({ ... });
export const normalizeCapabilities = ({ asset, template, worldObject }) => ({ ... });
export const createWorldObjectRecord = ({ id, worldId, assetId, templateId, type, position, rotation, scale, metadata }) => ({ ... });
```

Schema 决策：

- `Asset`：资产本体，包括文件、url、kind、source、metadata、capabilities。
- `ObjectTemplate`：资产进入世界的默认实例规则，包括 renderMode、pickVolume、interaction、defaultScale、editableProperties。
- `WorldObject`：资产在世界中的实例，包括位置、旋转、缩放、状态、metadata、runtime policy。
- `Capability`：对象支持的能力，例如 `speak`、`move`、`lookAt`、`gesture`、`playAnimation`、`editMaterial`。

迁移范围：

- `content/templates/object-templates.js`
  - 增加 `capabilities`、`pickVolumeConfig`、`editableProperties`。
- `content/assets/system-assets.js`
  - avatar、product、painting 的 capability 统一写到 asset/template metadata。
- `avatar-assets.js`
  - 保留原配置，但拆出可转换结构，先通过 adapter 生成 schema，避免一次重写所有配置。

验收：

- 所有右侧面板显示的 `assetInfo` 通过 `normalizeAssetInfo()` 生成。
- renderer 和 avatar runtime 不再手写不同形状的 `assetInfo`。
- AI 编排层读取 capability，而不是通过 `selectableType` 猜能力。

### Phase 4：统一 SceneObject Factory 与 Renderer Contract

目标：所有进入 3D 世界的对象都通过统一工厂实例化。

修改文件：

- `infrastructure/object-factory.js`
- `renderers/image-renderer.js`
- `renderers/video-renderer.js`
- `renderers/model-renderer.js`
- `avatar-world-runtime.js`
- `talkinghead.js`

新增/拆分：

- `renderers/avatar-renderer.js` 或 `avatar/avatar-world-factory.js`
- `renderers/tree-renderer.js`
- `infrastructure/scene-object-lifecycle.js`

统一返回结构：

```js
{
  root,
  worldObjectId,
  label: { element, offset },
  loader: { element, text, getIsLoaded },
  pickTarget: {
    root,
    type,
    getColliderObject,
    getPreciseRoots,
    dynamic,
    nearDistance,
    midDistance,
    selectionBias
  },
  assetInfo,
  capabilities,
  destroy()
}
```

行为边界：

- Renderer 只负责创建可视对象和 pick-volume。
- Renderer 不直接 `scene.add()`，由 lifecycle 添加。
- Renderer 不直接 `window.bgLabels.push()`，由 label system 注册。
- Renderer 不直接调用 `registerHitTestTarget()`，而是返回 `pickTarget`。

验收：

- product、painting、uploaded image/video/model、avatar、tree 的 scene record 都进入 `sceneObjectRegistry`。
- `talkinghead.js` 不再为不同对象类型手写注册逻辑。
- 创建/替换/删除对象路径统一。

### Phase 5：Upload Use Case 拆分

目标：上传不直接写世界，AI/系统动作决定如何实例化。

修改文件：

- `infrastructure/upload-runtime.js`
- `infrastructure/ai-rule-engine.js`
- `talkinghead.js`

新增文件：

- `usecases/create-asset-from-upload.js`
- `usecases/create-world-object-from-asset.js`
- `usecases/replace-world-object-asset.js`

新流程：

1. `createAssetFromUpload(file)` 返回 Asset，不直接写 `worldState`。
2. `worldState.addAsset(asset)` 由 use-case 调用。
3. `aiRuleEngine.resolveAction({ prompt, asset, context })` 返回 action：

```js
{
  type: "createWorldObject" | "replaceWorldObject",
  assetId,
  templateId,
  worldObjectType,
  position,
  metadata
}
```

4. use-case 创建/更新 `WorldObject`。
5. lifecycle 实例化 scene object。
6. `selectionStore.select()` 选中新对象。

验收：

- 上传图片、视频、GLB 后可以创建对象。
- 替换选中对象后保持选中新对象。
- 删除对象后 registry、worldState、picking target、selection overlay 均清理。

### Phase 6：AI Orchestrator 与 Action Protocol

目标：AI 只输出可验证动作，不直接操作 Three.js 或 DOM。

新增文件：

- `ai/ai-orchestrator.js`
- `ai/action-protocol.js`
- `ai/world-context-serializer.js`

接口：

```js
export const createAiOrchestrator = ({
  worldState,
  sceneObjectRegistry,
  selectionStore,
  actionExecutor,
  ruleEngine
}) => ({
  getWorldContext(),
  resolveUserIntent({ prompt, uploadedAssetId }),
  executeActions(actions)
});
```

Action Protocol：

- `createWorldObject`
- `replaceWorldObject`
- `deleteWorldObject`
- `moveObject`
- `rotateObject`
- `scaleObject`
- `speak`
- `playAnimation`
- `editAsset`
- `setVideoPlayback`

迁移范围：

- `talkinghead.js` 中面板确认按钮只调用 `aiOrchestrator.resolveUserIntent()`。
- `callVolcengineAI` 若未实际使用，移入 orchestrator 或删除。
- 视频控制、说话、对象创建/替换/删除均走 action executor。

验收：

- AI 面板不直接操作 Three.js object。
- 面板只发送 prompt / uploadedAssetId / selectedObjectId。
- 所有动作先过 capability / existence / permission 校验。

### Phase 7：Camera Controller 与 Focus Policy

目标：相机移动是系统能力，但不影响 picking 可选性。

新增文件：

- `infrastructure/camera-controller.js`
- `infrastructure/focus-policy.js`

接口：

```js
export const createCameraController = ({ camera, controls, bounds }) => ({
  getState(),
  setTarget({ x, z, reason }),
  update(delta),
  focusObject({ worldObjectId, point, focusZ })
});
```

规则：

- `pickingSystem.query()` 不读取 focus policy。
- `selectionStore.select()` 后可触发 `focusPolicy.onSelect(selection)`。
- 是否自动聚焦可由 policy 控制，后续可以关闭或按对象类型配置。
- 删除旧的相机 Z 可选性过滤逻辑。

验收：

- 自动聚焦后仍能选中任何真实命中的对象。
- 相机移动不改变对象可选范围，只改变视图。

### Phase 8：Avatar Runtime 分层

目标：拆开 avatar 资产表达、系统实例、AI 行为。

新增/拆分文件：

- `avatar/avatar-config-adapter.js`
- `avatar/avatar-visual-layer.js`
- `avatar/avatar-engine-controller.js`
- `avatar/avatar-world-factory.js`

职责：

- `avatar-config-adapter.js`
  - 将 `AVATAR_MODELS` 转成 Asset / Template / Capability。
- `avatar-visual-layer.js`
  - 负责 GLB 可视层、骨骼姿态、尺寸拟合、地面对齐。
- `avatar-engine-controller.js`
  - 统一 TalkingHead / robot / decals engine 接口。
- `avatar-world-factory.js`
  - 创建 avatar 的 scene object record，返回 pick-volume、label、assetInfo、capabilities。

接口：

```js
engineController = {
  load(),
  update(delta),
  speak({ text, audioUrl }),
  playGesture(name),
  setSpeaking(isSpeaking),
  destroy()
}
```

验收：

- `X`、Bot1、Bot2、大黄、离职 avatar 均可加载、选中、显示信息。
- Bot1/Bot2 对话与动作不退化。
- avatar pick-volume 仍使用真实 collider 命中。

### Phase 9：UI Panel 订阅化

目标：右侧 AI 面板从命令式 DOM 操作迁移到订阅系统状态。

新增文件：

- `ui/ai-panel-controller.js`
- `ui/video-controls-controller.js`
- `ui/loading-status-controller.js`

输入：

- `selectionStore`
- `aiActionContext`
- `worldState`
- `sceneObjectRegistry`
- `aiOrchestrator`

规则：

- 面板背景继续保持 `pointer-events: none`。
- 仅控件保留点击事件。
- 所有 assetInfo 只在右侧面板显示，不恢复场景内悬浮 tag。
- 视频播放/进度控制只在面板中进行，不恢复距离自动播放。

验收：

- 面板状态与选中态一致。
- 3D 场景点击不被面板背景遮挡。
- 视频控制可用，无距离触发逻辑。

### Phase 10：清理 talkinghead.js

目标：`talkinghead.js` 只作为 composition root。

最终职责：

- 初始化 Three.js scene/camera/renderer。
- 创建 worldState / registry / systems / stores / controllers。
- 连接主循环 update。
- 绑定少量顶层 DOM 事件。

应移除：

- picking 内部实现。
- selection 内部实现。
- object factory 类型分支。
- AI action 执行细节。
- upload 业务流程。
- avatar 细节。
- debug fetch 插桩。
- 长期 `window.*` 业务依赖。

验收：

- `talkinghead.js` 行数显著下降。
- 新模块边界清晰，系统层、资产层、AI 层可独立测试。

## Assumptions & Decisions

- 本次范围为全量架构重构，用户已确认。
- 允许顺手修正历史遗留行为，尤其是 picking、相机聚焦、debug 插桩、面板阻挡、距离触发。
- 不使用 `screen fallback`。
- 选择视觉只用 `THREE.Box3Helper`，不引入 glow/outline。
- 场景内不恢复悬浮 tag，资产信息只显示在右侧 AI 面板。
- 自动聚焦可以保留为 focus policy，但不能影响 picking 可选性。
- 上传支持范围保持当前一期 demo：图片、视频、GLB。
- 不在第一轮重构引入后端持久化，worldState 仍以内存为主。
- 不在第一轮实现 Rhino 式重叠对象选择菜单，但 action/picking 结构要为后续预留。
- Debug artifacts 在用户确认对应 bug 已修复后再清理；本重构会先把 debug 调用抽象化，不直接删除调试记录。

## Verification Steps

### 静态验证

- 对所有修改的 JS 文件运行：

```bash
node --check talkinghead.js
node --check infrastructure/picking-system.js
node --check infrastructure/selection-store.js
node --check infrastructure/selection-overlay.js
node --check infrastructure/object-factory.js
node --check infrastructure/upload-runtime.js
node --check infrastructure/ai-rule-engine.js
node --check avatar-world-runtime.js
```

- 使用 VS Code diagnostics 检查最近编辑文件。
- 搜索确认：
  - 无 `mode = 'screen'`。
  - 无 `screenResults` / `screenWinner` / `allowScreenFallback`。
  - 无业务逻辑直接硬编码 debug server URL。
  - 无新增 glow/outline 选中特效。

### 浏览器验证

- 加载 `http://localhost:3000/`。
- 等待 `window.getSceneLoadingState().pendingCount === 0`。
- 验证点击：
  - `X` 可选中。
  - Bot1/Bot2 可选中。
  - product 可选中。
  - painting 可选中。
  - tree 可选中。
  - 空白点击返回空白，不吸附对象。
  - 前景对象挡住后景对象时，点击前景选前景。

- 验证面板：
  - 未选中时显示空白点位/未选择。
  - 选中对象后显示 assetInfo。
  - 删除按钮只在选中对象时可用。
  - 面板背景不阻挡 3D 场景点击。

- 验证上传：
  - 上传图片并创建 painting。
  - 上传视频并创建 product video。
  - 上传 GLB 并创建 product model。
  - 替换选中对象。
  - 删除用户创建对象。

- 验证视频：
  - 不自动按距离播放。
  - 面板按钮可播放/暂停。
  - 进度条控制仍可用。

- 验证 avatar：
  - X、Bot1、Bot2、大黄加载完成。
  - 可选中并显示 Box3Helper。
  - Bot1/Bot2 说话/动作不退化。

### 回归重点

- `picking` 与 `camera focus` 解耦：自动聚焦后仍能选任何真实命中对象。
- `selectionStore` 与 `aiActionContext` 解耦：选择对象不会污染上传上下文；清空上下文不会残留 selection overlay。
- `sceneObjectRegistry` 与 `worldState` 一致：创建、替换、删除后两边都同步。
- `renderer` 生命周期完整：销毁时 dispose geometry/material/texture/video，picking target 同步注销。

## Rollout Plan

1. 先实现 Phase 0-2，保证点击选择稳定。
2. 再实现 Phase 3-5，统一资产/对象/上传路径。
3. 再实现 Phase 6-7，收口 AI action 与相机策略。
4. 最后实现 Phase 8-10，拆 avatar runtime 与清理 `talkinghead.js`。

每完成一个 phase 都进行浏览器 smoke test，避免全量重构到最后才发现交互断裂。

