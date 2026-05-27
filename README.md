# Our Website

当前项目已经从早期展示型站点，演进为一个面向 3D 世界编辑器方向的实验性原型。

目前仓库同时包含两部分内容：

- 运行中的 3D 场景与交互代码
- 面向产品化改造的方案、架构和调试文档

## 快速开始

本地启动：

```bash
npm start
```

默认访问：

```text
http://localhost:3000
```

## 代码入口

当前主要文件：

- `index.html`
- `style.css`
- `talkinghead.js`
- `avatar-assets.js`
- `avatar-world-runtime.js`

首轮基础设施与资产管理模块已经开始拆出：

- `content/assets/system-assets.js`
- `content/templates/object-templates.js`
- `content/worlds/default-world.js`
- `infrastructure/world-state.js`
- `infrastructure/object-factory.js`
- `infrastructure/ai-action-context.js`
- `infrastructure/upload-runtime.js`
- `infrastructure/ai-rule-engine.js`
- `infrastructure/scene-object-registry.js`
- `renderers/image-renderer.js`
- `renderers/video-renderer.js`
- `renderers/model-renderer.js`

当前状态是：

- 现有场景继续由 `talkinghead.js` 驱动
- 系统资产、对象模板、默认世界和世界状态已经独立成模块
- 产品列与画作列已改为从 `worldState` / `worldCollections` 取配置
- 右侧已改为全局 AI 操作面板，支持“点击坐标/对象 -> 上传资产 -> 确认创建或替换”
- 当前通过代码规则模拟 AI 决策，提示词会参与名称、展示类型和模板选择
- 新建与替换已支持图片、视频、GLB，且允许跨类型替换
- 后续将继续把更多对象实例化和编辑逻辑逐步迁出入口脚本

## 文档结构

项目文档已集中到 `docs/` 目录：

- [docs/README.md](file:///Users/bytedance/Desktop/our-website/docs/README.md)：文档总入口
- [product](file:///Users/bytedance/Desktop/our-website/docs/product)：产品方向与一期 Demo 方案
- [architecture](file:///Users/bytedance/Desktop/our-website/docs/architecture)：架构与拆分方案
- [debug](file:///Users/bytedance/Desktop/our-website/docs/debug)：历史调试记录
- [integration](file:///Users/bytedance/Desktop/our-website/docs/integration)：外部集成说明

## 说明

- `.trae/` 下保留的是内部规格、计划和调试产物，不作为对外文档主结构。
- `TalkingHead/`、`HeadTTS/`、`mediapipe/` 下的 `README` 属于第三方或子模块文档，保持原位。
