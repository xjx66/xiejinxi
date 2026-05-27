# 定义
1. 对象：指世界中除基础设施外的所有对象，例如视频、图像、模型
# 基础设施层
基础设施层是所有世界对象都共享的能力，为物体的存在提供环境：
- 无限世界空间
- 世界坐标系
- 地面：默认对象
- 世界与世界的通讯/共享
- 渲染引擎：支持多种文件格式，例如glb、png、jpg、jpeg、webp、mp4等
- 相机
- 选中、聚焦、移动、删除、放大、缩小、旋转
- 资产库：进行用户资产存储，提供系统资产的访问
- 声音、麦克风
- 物理规律：如碰撞体检测
- 对象导入
- 保存与加载
- ai接口
- 对象编辑的基础模版

# 内容层

内容层是世界中所有“可替换、可扩展、可上传、可被 AI 修改”的部分，它与世界相互独立但又互相依赖。内容层独立存储对象的各种参数等信息。
例如glb，其尺寸、文件类型、交互参数、世界坐标等。这些信息可通过AI进行调整。这些信息需要与世界互通，以让世界知道怎么呈现。

# AI层

AI层与世界实际是间接通信的，ai仅被用户用于对对象的编辑。当对某一对象进行编辑时，实际是复制一份对象，输入给ai，ai根据用户指令进行修改，修改完成后返回给世界，世界根据修改后的对象进行渲染，替换原有对象。

## 3. 正确分层原则

拆分后，系统应该满足下面这个原则：

- 开发者修改基础设施代码
- 用户修改世界对象数据
- 用户上传资产
- AI 修改资产与对象配置

而不是：

- 每增加一个对象就去改场景源码

## 4. 基础设施层定义

## 4.1 基础设施层职责

建议把下面这些能力全部归入基础设施层：

- `scene runtime`
  - Three.js 场景初始化
  - 渲染循环
  - 灯光、地面、天空、网格、坐标系
- `camera runtime`
  - 第一人称视角
  - Pointer Lock
  - `WASD / Arrow` 移动
  - 滚轮推进
- `world interaction runtime`
  - 点击命中
  - 统一选中
  - 聚焦
  - 标签显示
  - 高亮 overlay
- `object lifecycle runtime`
  - 创建对象
  - 更新对象
  - 删除对象
  - 注册命中体
  - 注册标签
- `upload runtime`
  - 文件选择
  - 文件类型校验
  - 上传流程
  - 资产记录创建
- `editor runtime`
  - 对象属性面板
  - 创建对象面板
  - 替换素材
  - 删除对象
- `world state runtime`
  - 世界对象列表
  - 保存世界
  - 加载世界
  - 世界快照

## 4.2 基础设施层不能做什么

基础设施层不应该写死下面这些内容：

- “当前树放在哪一排”
- “当前有几幅画”
- “某个视频用哪个 mp4”
- “某个产品用哪个 glb”
- “角色模板有哪些具体名字”

这些都应该挪到资产内容层。

## 5. 资产内容层定义

## 5.1 资产内容层职责

资产内容层建议负责：

- 系统预置资产清单
- 用户上传资产清单
- 每个资产的类型与元数据
- 每个对象模板的默认配置
- 每个世界实例中对象的摆放结果

可理解为三层内容：

- `Asset`
  - 纯资源
- `ObjectTemplate`
  - 如何把资源实例化成世界对象
- `WorldObject`
  - 某个世界里真正摆出来的对象实例

## 5.2 为什么要分成三层

因为“资源”和“对象”不是一回事。

例如：

- 一个 `glb` 文件是 `Asset`
- “展台产品模型模板”是 `ObjectTemplate`
- 某个世界中放在 `(120, -5, -150)` 的那一个具体产品，是 `WorldObject`

如果不分这三层，后面一旦接入用户上传和 AI 编辑，数据就会混乱。

## 6. 建议的数据模型

## 6.1 Asset

```json
{
  "id": "asset_001",
  "kind": "glb",
  "source": "system",
  "name": "studio.glb",
  "url": "/assets/products/virtual/studio.glb",
  "previewUrl": "/assets/previews/studio.png",
  "metadata": {
    "tags": ["product", "display"],
    "createdBy": "system"
  }
}
```

## 6.2 ObjectTemplate

```json
{
  "id": "template_product_screen",
  "type": "video",
  "defaultScale": { "x": 1, "y": 1, "z": 1 },
  "defaultRotation": { "x": 0, "y": 0, "z": 0 },
  "renderConfig": {
    "frameStyle": "screen",
    "selectionBias": 16
  },
  "interactionConfig": {
    "selectable": true,
    "editable": true
  }
}
```

## 6.3 WorldObject

```json
{
  "id": "obj_101",
  "worldId": "world_demo_001",
  "templateId": "template_product_screen",
  "assetId": "asset_001",
  "position": { "x": 120, "y": -5, "z": -150 },
  "rotation": { "x": 0, "y": 1.57, "z": 0 },
  "scale": { "x": 1, "y": 1, "z": 1 },
  "status": "ready",
  "metadata": {
    "title": "Main Product Screen"
  }
}
```

## 7. 当前项目的拆分方式

## 7.1 当前主要问题

当前项目的主要问题不是功能不够，而是这些东西耦合在一起：

- 场景基础设施
- 世界对象布局
- 系统预置资产
- 角色特殊逻辑
- 点击和选择逻辑

尤其是 `talkinghead.js` 同时承担了：

- 场景创建
- 相机控制
- 树、画、产品的静态生成
- 命中检测
- UI 交互
- 标签与选中

这对产品化是不成立的。

## 7.2 建议拆分后的目录方向

建议逐步往下面这个结构走：

```text
src/
  infrastructure/
    scene-runtime.js
    camera-runtime.js
    interaction-runtime.js
    selection-runtime.js
    world-state.js
    object-registry.js
    upload-runtime.js
    editor-runtime.js
  content/
    assets/
      system-assets.js
      uploaded-assets-store.js
    templates/
      object-templates.js
      avatar-templates.js
    worlds/
      default-world.js
  renderers/
    model-renderer.js
    image-renderer.js
    video-renderer.js
    avatar-renderer.js
```

当前项目不一定要一次性迁到 `src/`，但逻辑边界最好按这个方向拆。

## 8. 当前资产应该怎么独立

## 8.1 先抽离“系统资产表”

首先要把当前项目中所有静态资产统一登记成资产清单。

例如：

- 图片资产
- 视频资产
- `glb` 模型资产
- 角色模板资产

这一步的目标不是改表现，而是建立一个统一入口：

- 每个资产有唯一 `id`
- 每个资产有 `kind`
- 每个资产有 `url`
- 每个资产有 `source`
- 每个资产有基础元数据

## 8.2 再抽离“对象模板表”

第二步不是直接摆对象，而是先定义模板。

例如：

- 图片展板模板
- 视频屏模板
- 产品模型模板
- 角色模板

模板负责描述：

- 默认尺寸
- 默认展示方式
- 默认可选中参数
- 默认标签偏移
- 默认命中参数

## 8.3 最后抽离“默认世界配置”

第三步再把现在页面上已经摆好的树、产品、画、角色，改写成 `WorldObject` 配置。

也就是说，未来默认场景不再靠源码硬编码生成，而是靠：

- 默认世界配置文件
- 对象模板
- 资产清单

来驱动生成。

## 9. 用户上传和 AI 编辑在架构中的位置

## 9.1 用户上传

用户上传本质上是往 `Asset` 层新增记录。

流程应该是：

1. 用户上传文件
2. 系统生成一个新的 `Asset`
3. 用户选择一个模板
4. 系统创建一个新的 `WorldObject`

所以用户上传不应该直接操作 Three.js 对象，而应该先写入资产表。

## 9.2 AI 编辑

AI 编辑也不应该直接改场景代码。

AI 编辑至少分两种：

- 改对象实例
  - 改位置、旋转、缩放、标签、状态
- 改资产
  - 替换图片
  - 替换视频
  - 替换模型
  - 生成新版本资源

因此 AI 编辑未来也应该只改：

- `WorldObject`
- `ObjectTemplate`
- `Asset`

而不是直接改基础设施层。

## 10. 两条工作流的正确推进顺序

虽然你说有两个主要工作，但实际推进顺序不能平均拆开做。

正确顺序应该是：

## 第一阶段：先抽基础设施层边界

先把这些能力从现有场景脚本里识别出来并固定：

- 场景初始化
- 相机与移动
- 选中与点击
- 对象注册与销毁
- 世界状态管理入口

这一步的目标不是全部重写，而是先“划边界”。

## 第二阶段：建立资产表与模板表

把当前已有资产整理成配置内容：

- `system-assets`
- `object-templates`
- `default-world`

这一步完成后，静态内容就不再是散落在代码里的常量。

## 第三阶段：建立对象工厂

对象工厂负责：

- 根据 `WorldObject` + `ObjectTemplate` + `Asset` 创建 Three.js 对象
- 接入统一选中、标签、碰撞体

做到这一步，内容层和基础设施层才算真正接上。

## 第四阶段：接入上传能力

上传系统接入后：

- 用户上传成为新增 `Asset`
- 用户选择模板后生成 `WorldObject`

这时一期 Demo 就跑通了。

## 第五阶段：预埋 AI 编辑接口

当基础设施层和内容层分开后，再接 AI 才有意义。

## 11. 建议优先拆的文件

按当前代码状态，建议优先从这些边界开始拆：

## 11.1 从 `talkinghead.js` 拆出去

- `scene-runtime`
- `camera-runtime`
- `interaction-runtime`
- `selection-runtime`
- `default-world-content`

## 11.2 已有文件可继续保留并向配置化靠拢

- `avatar-assets.js`
  - 继续演进成角色模板配置
- `avatar-world-runtime.js`
  - 继续演进成角色对象 renderer / runtime

## 11.3 下一步应该新增的文件

- `system-assets.js`
- `object-templates.js`
- `default-world.js`
- `world-state.js`
- `object-factory.js`

## 12. 阶段性交付标准

当下面这些条件满足时，就说明双层拆分已经成功起步：

- 基础设施代码不再写死某个具体资产 URL
- 所有系统预置资产都有统一清单
- 当前默认场景可通过配置恢复
- 创建对象不再写专门分支，而是走对象工厂
- 上传对象与系统对象走同一套实例化流程

## 13. 最终结论

这两个工作不是平行的两个小任务，而是整个产品架构的主轴：

- 基础设施层决定这个产品是不是一个稳定的平台
- 资产内容层决定这个产品是不是一个可编辑、可上传、可被 AI 改造的世界

## 13.1 当前代码落地状态

目前仓库里已经完成第一轮落地：

- 基础设施层新增：
  - `infrastructure/world-state.js`
  - `infrastructure/object-factory.js`
  - `infrastructure/ai-action-context.js`
  - `infrastructure/upload-runtime.js`
  - `infrastructure/ai-rule-engine.js`
  - `infrastructure/scene-object-registry.js`
- 资产内容层新增：
  - `content/assets/system-assets.js`
  - `content/templates/object-templates.js`
  - `content/worlds/default-world.js`
- 渲染层新增：
  - `renderers/image-renderer.js`
  - `renderers/video-renderer.js`
  - `renderers/model-renderer.js`

当前已经接通的链路是：

- 点击坐标或对象，生成全局 AI 操作上下文
- 上传图片 / 视频 / GLB 形成用户资产
- 通过规则引擎模拟 AI，把输入转成对象类型和模板
- 写入 `worldState`
- 在场景里创建或替换对象

这说明“基础设施层 + 资产内容层”的分层已经不是纸面方案，而是开始进入运行态。

如果继续推进，我建议下一步直接做两份更具体的落地文档：

- `asset-schema-and-template-design.md`
- `infrastructure-refactor-task-list.md`

前者负责把“资产和模板如何配置”定死，后者负责把“当前代码按什么顺序拆”定死。
