# 全局 AI 上传与坐标操作交互计划

## Summary

本次实现的目标，是在现有 3D 世界中引入一套“模拟 AI 交互”的全局操作入口，但暂不接入真实 AI 推理服务。

用户交互闭环如下：

1. 用户点击场景中的一个坐标点，或点击一个现有对象。
2. 系统自动识别当前上下文：
   - 空白点击：只有坐标
   - 对象点击：有坐标 + 目标对象
3. 页面右侧显示一个全局 AI 对话窗口。
4. 该窗口展示当前上下文信息，并允许用户：
   - 上传资产
   - 输入提示词
   - 选择执行操作
5. 用户点击明确按钮提交：
   - 如果当前是空白点：在该坐标创建新对象
   - 如果当前是对象：替换当前对象，且允许跨类型替换
6. 系统使用代码规则模拟 AI 决策：
   - 根据资产类型决定对象类型与渲染模板
   - 根据提示词决定名称、描述、展示风格或默认模板参数
7. 创建或替换后的对象写入 `worldState`，并在场景中显示。

本期明确决策如下：

- 只保留一个全局 AI 面板，不再保留当前角色专属面板
- 本期支持“创建 + 替换”
- 上传类型支持：图片、视频、GLB
- 提交方式采用“先填再确认”
- 替换允许跨类型
- 提示词参与规则模拟，而不是只做展示

## Current State Analysis

### 已有交互与 UI

- `index.html`
  - 现有右侧交互面板是 `#avatar-dialogue-panel`
  - 当前页面已有世界坐标 HUD 与点击坐标 HUD
- `style.css`
  - 已有 `#avatar-dialogue-panel` 对应样式
  - 没有面向“全局 AI 上传面板”的字段区、文件上传区或上下文区样式
- `talkinghead.js`
  - 已有 `queryBestHitTarget()` 与统一对象点击逻辑
  - 已有 `updateClickedWorldCoordinate()`，会把点击点写到 HUD
  - 已有 `activeBackgroundSelectable`，可区分当前选中对象
  - 当前 `pointerup` 中已经能区分空白点击和对象点击
  - 当前右侧面板逻辑仍绑定角色对话与 `handleSpeak()`

### 已有基础设施与资产管理

- `content/assets/system-assets.js`
  - 已经有系统资产表
- `content/templates/object-templates.js`
  - 已经有对象模板定义
- `content/worlds/default-world.js`
  - 已经能生成默认世界对象定义
- `infrastructure/world-state.js`
  - 已有世界、资产、模板、对象的基础状态管理
- `infrastructure/object-factory.js`
  - 当前只提供运行时集合解析，还没有真正负责“创建 / 替换对象实例”

### 已有对象运行形态

- 产品与画作仍主要在 `talkinghead.js` 中直接实例化
- 角色仍通过 `avatar-world-runtime.js` 走独立运行时
- 当前场景还没有“根据上传文件创建一个新 WorldObject，再即时挂入场景”的链路
- 当前也没有“对象跨类型替换”的实例化重建流程

## Proposed Changes

### 1. 统一交互上下文模型

#### 文件

- `infrastructure/ai-action-context.js`（新增）
- `infrastructure/world-state.js`
- `talkinghead.js`

#### What

新增一个统一的“全局 AI 操作上下文”模块，用于管理当前用户输入所依赖的上下文信息。

上下文结构至少包含：

```json
{
  "mode": "create|replace",
  "worldPoint": { "x": 0, "y": 0, "z": 0 },
  "selectedObjectId": "obj_xxx|null",
  "selectedObjectType": "image|video|model|avatar-template|null",
  "selectedObjectName": "string|null",
  "prompt": "",
  "uploadedAssetId": null
}
```

#### Why

后续无论是真 AI 还是规则模拟，执行动作都必须依赖同一种输入模型，不能把“坐标、选中对象、提示词、上传文件”散落在多个 DOM 状态里。

#### How

- 在 `pointerup` 时统一生成或更新当前上下文：
  - 点空白：`mode=create`
  - 点对象：`mode=replace`
- 把当前点击坐标、对象信息同步到右侧 AI 面板
- 在 `worldState` 外单独维护一个当前会话上下文对象，避免污染世界数据

### 2. 将右侧角色面板重构为全局 AI 面板

#### 文件

- `index.html`
- `style.css`
- `talkinghead.js`

#### What

把现有 `#avatar-dialogue-panel` 改造成一个面向全局操作的 AI 面板。

面板应包含：

- 上下文摘要区
  - 当前坐标
  - 当前目标对象
  - 当前操作模式（创建 / 替换）
- 提示词输入区
- 文件上传区
- 上传文件预览区
- 操作按钮区
  - `创建对象` 或 `替换对象`
  - 清空上下文

#### Why

用户已经明确选择“只保留全局面板”，所以当前角色专属对话 UI 不能继续保留为主入口。

#### How

- 复用 `#avatar-dialogue-panel` 的基础 DOM 位置和浮层逻辑
- 删除当前“角色说话输入框 + 发送按钮”的语义绑定
- 新增字段：
  - `#ai-action-mode`
  - `#ai-context-coordinate`
  - `#ai-context-target`
  - `#ai-prompt-text`
  - `#ai-upload-input`
  - `#ai-upload-preview`
  - `#ai-submit`
  - `#ai-reset`
- `style.css` 中将当前角色面板样式升级为更通用的表单面板样式

### 3. 增加上传资产运行时

#### 文件

- `infrastructure/upload-runtime.js`（新增）
- `infrastructure/world-state.js`
- `content/assets/system-assets.js`
- `talkinghead.js`

#### What

新增一个上传运行时，负责把用户上传的文件转成可写入 `worldState` 的临时资产。

支持类型：

- 图片：`png/jpg/jpeg/webp`
- 视频：`mp4`
- 模型：`glb`

#### Why

当前只有系统资产，没有用户上传资产。没有上传资产层，就无法完成“上传 -> 创建 / 替换”的闭环。

#### How

- 使用浏览器原生 `input[type=file]`
- 在前端用 `URL.createObjectURL(file)` 生成本地可预览 URL
- 新建资产记录并写入 `worldState.addAsset()`
- 资产记录建议包含：

```json
{
  "id": "asset-upload-xxx",
  "kind": "image|video|glb",
  "source": "user-upload",
  "name": "file name",
  "url": "blob:...",
  "metadata": {
    "mimeType": "...",
    "size": 123,
    "createdAt": 0
  }
}
```

### 4. 增加规则模拟层

#### 文件

- `infrastructure/ai-rule-engine.js`（新增）
- `content/templates/object-templates.js`
- `talkinghead.js`

#### What

新增一个规则模拟层，用代码规则模拟 AI 如何解释“坐标 + 选中对象 + 提示词 + 上传资产”。

#### Why

用户明确要求本阶段先不接入真实 AI，但交互形式和输入结构要提前具备 AI 形态。因此需要一个“伪 AI 决策层”。

#### How

规则至少包括：

- 根据上传资产类型决定目标对象类型：
  - 图片 -> `image`
  - 视频 -> `video`
  - GLB -> `model`
- 根据提示词生成默认对象名称：
  - 优先取提示词中的前若干字符
  - 无提示词时回退到文件名
- 根据提示词推导附加配置：
  - 如 `frame / board / screen / sculpture / floating`
- 选择对应模板：
  - 图片 -> `template-painting-image`
  - 视频 -> `template-product-video`
  - GLB -> `template-product-model`

### 5. 实现创建对象流程

#### 文件

- `infrastructure/object-factory.js`
- `infrastructure/world-state.js`
- `talkinghead.js`

#### What

补齐“在坐标上创建新对象”的完整链路。

#### Why

这是本期最核心的 create 流程，没有它上传交互无法闭环。

#### How

- 用户点击空白区域，锁定坐标
- 用户上传资产并填写提示词
- 规则引擎决定：
  - `type`
  - `templateId`
  - `metadata`
- 新建 `WorldObject`
- 写入 `worldState.upsertWorldObject()`
- 通过对象工厂实例化并加入场景

新对象创建后必须：

- 可被点击选中
- 有标签与加载态基础能力
- 有统一 hit test 配置
- 可继续被替换

### 6. 实现替换对象流程

#### 文件

- `infrastructure/object-factory.js`
- `infrastructure/world-state.js`
- `talkinghead.js`
- `avatar-world-runtime.js`（如需绕开 avatar 替换限制则只做防御，不主动支持 avatar 替换）

#### What

支持对现有对象执行“上传资产并替换”的动作，且允许跨类型替换。

#### Why

用户已明确要求“创建 + 替换”，且替换允许跨类型，所以不能只做 asset url 覆盖，必须支持对象类型变化带来的重建。

#### How

- 选中现有对象后，AI 面板进入 `replace` 模式
- 用户上传新资产
- 规则引擎根据新资产决定新类型与模板
- 替换流程：
  1. 读取旧对象的 `position / rotation / scale`
  2. 删除旧对象的场景实例
  3. 更新或重建对应 `WorldObject`
  4. 保留其世界坐标与基础变换
  5. 重新实例化新对象

#### 兼容性决策

- 一期优先支持 `product / painting / 用户新建对象` 的替换
- 对 `avatar` 的替换先做限制：
  - 可在 UI 中提示“当前版本暂不支持直接替换角色模板”
  - 避免破坏现有角色专属运行时

### 7. 将对象工厂升级为真正的实例化入口

#### 文件

- `infrastructure/object-factory.js`
- `renderers/model-renderer.js`（新增）
- `renderers/image-renderer.js`（新增）
- `renderers/video-renderer.js`（新增）
- `talkinghead.js`

#### What

把当前 `talkinghead.js` 里产品、画作的实例化逻辑逐步迁入 renderer / factory。

#### Why

如果上传创建和系统对象不是同一套实例化链路，后面会形成双系统。

#### How

对象工厂应统一支持：

- `createSceneObjectFromWorldObject()`
- `replaceSceneObjectFromWorldObject()`
- `destroySceneObject()`

首轮迁移范围：

- 图片对象
- 视频对象
- 模型对象

当前 `avatar-world-runtime.js` 暂保留独立体系，不强行并入上传链路。

### 8. 场景对象注册与映射

#### 文件

- `infrastructure/scene-object-registry.js`（新增）
- `talkinghead.js`

#### What

新增一个运行时注册表，用于维护 `WorldObject.id -> Scene Object` 的映射关系。

#### Why

替换和删除要求能够准确找到旧对象并销毁；点击对象时，也需要能从 Three.js root 反查对应的 `WorldObject`。

#### How

注册表至少负责：

- 注册
- 反注册
- 按 `worldObjectId` 取对象
- 按 `mesh/root` 取 `worldObjectId`

### 9. 面板与点击逻辑联动

#### 文件

- `talkinghead.js`
- `index.html`
- `style.css`

#### What

把当前点击逻辑和新 AI 面板打通。

#### How

- 点击空白时：
  - 更新坐标 HUD
  - 打开全局 AI 面板
  - 模式设为 `create`
- 点击对象时：
  - 更新坐标 HUD
  - 打开全局 AI 面板
  - 模式设为 `replace`
  - 显示对象名称、类型、ID
- 切换目标时：
  - 上传预览不自动丢失
  - 但需要提示上下文已变化

### 10. 文档同步

#### 文件

- `README.md`
- `docs/product/phase1-demo-manual-upload-plan.md`
- `docs/architecture/infrastructure-and-content-split-plan.md`

#### What

同步更新实现状态与新交互入口说明。

## Assumptions & Decisions

### 已确认决策

- 右侧只保留一个全局 AI 面板
- 一期支持创建 + 替换
- 替换允许跨类型
- 上传类型支持图片、视频、GLB
- 用户需要“先填再确认”
- 提示词参与规则模拟

### 实现边界

- 本期不接真实 AI API
- 本期不做云端上传，只做本地文件对象 URL
- 本期不做多人协作
- 本期不做完整资产持久化后端
- 本期不把 avatar 全量纳入跨类型替换

### 风险与处理

- 当前 `talkinghead.js` 仍然承担大量场景职责
  - 处理：本次以“接线 + 新增模块”为主，避免一次性重构炸裂
- 角色运行时较独立
  - 处理：一期先不把角色替换纳入核心链路
- 本地 `blob:` 上传资产刷新后失效
  - 处理：一期接受该限制，后续引入真实上传存储

## Verification Steps

### 交互验证

1. 点击空白区域
   - HUD 更新点击坐标
   - 右侧 AI 面板打开
   - 模式显示为 `create`
2. 上传图片并填写提示词后提交
   - 该坐标出现新的图片对象
   - 新对象可被选中
3. 点击现有图片对象
   - 面板切换为 `replace`
   - 显示对象信息
4. 上传视频替换该图片对象
   - 原对象被移除
   - 原坐标出现视频对象
5. 点击现有视频对象并上传 GLB
   - 视频对象被替换为模型对象
6. 点击新建与替换后的对象
   - 仍能命中、聚焦和显示标签

### 状态验证

1. `window.worldState` 中资产数量会随上传增加
2. `window.worldState.getWorldObjects()` 会反映新增与替换结果
3. `worldObjectId -> sceneObject` 映射保持正确

### 回归验证

1. 原有产品列和画作列继续正常显示
2. 原有点击高亮不退化
3. 世界坐标 HUD 与点击坐标 HUD 继续正常工作
4. 原有相机移动、Pointer Lock、不受 AI 面板遮挡逻辑影响
