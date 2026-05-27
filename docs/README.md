# 文档总览

`docs/` 用于存放当前项目的自有文档，按“产品、架构、调试、集成”四类组织。

## 目录结构

```text
docs/
  product/
  architecture/
  debug/
  integration/
```

## Product

- [ai-world-interaction-system-notes.md](file:///Users/bytedance/Desktop/our-website/docs/product/ai-world-interaction-system-notes.md)
  - 最终产品方向与 AI 世界编辑器设想
- [phase1-demo-manual-upload-plan.md](file:///Users/bytedance/Desktop/our-website/docs/product/phase1-demo-manual-upload-plan.md)
  - 一期 Demo 方案，聚焦手动上传与对象编辑闭环

## Architecture

- [infrastructure-and-content-split-plan.md](file:///Users/bytedance/Desktop/our-website/docs/architecture/infrastructure-and-content-split-plan.md)
  - 当前项目拆为“基础设施层 + 资产内容层”的总方案
- [spatial-depth-architecture.md](file:///Users/bytedance/Desktop/our-website/docs/architecture/spatial-depth-architecture.md)
  - 当前 3D 场景沿 Z 轴的层级与空间分布说明

## Debug

- [carousel-ground-desync.md](file:///Users/bytedance/Desktop/our-website/docs/debug/carousel-ground-desync.md)
- [product-rotation-bug.md](file:///Users/bytedance/Desktop/our-website/docs/debug/product-rotation-bug.md)
- [texture-corruption-bug.md](file:///Users/bytedance/Desktop/our-website/docs/debug/texture-corruption-bug.md)

这组文档主要记录历史问题、验证过程和修复结论，方便后续回溯。

## Integration

- [talkinghead-openclaw-deployment-guide.md](file:///Users/bytedance/Desktop/our-website/docs/integration/talkinghead-openclaw-deployment-guide.md)
  - Talking Head 与 OpenClaw 的集成说明

## 不纳入本目录的内容

- `.trae/`
  - 内部计划、spec、checklist、调试产物
- `TalkingHead/`、`HeadTTS/`、`mediapipe/`
  - 第三方项目或子模块自带文档

## 维护规则

- 新的产品方案优先放到 `docs/product/`
- 新的架构与拆分文档优先放到 `docs/architecture/`
- 一次性问题排查记录放到 `docs/debug/`
- 外部系统接入说明放到 `docs/integration/`
- 根目录原则上不再直接新增新的业务文档
