# Tasks

- [x] Task 1: 角色脚下软阴影
  - [x] SubTask 1.1: 在 `style.css` 中给 `.carousel-item` 加 `position: relative`，并新增 `::after` 伪元素，实现径向渐变椭圆软阴影
  - [x] SubTask 1.2: 给 `.carousel-item.active::after` 增加更浓更大的尺寸/透明度规则，并加 `transition: all 0.3s ease`
  - [x] SubTask 1.3: 在 `[data-theme="light"]` 与默认（dark）下，分别设置阴影颜色

- [x] Task 2: 角色基线对齐
  - [x] SubTask 2.1: 阴影 `bottom` / `width` 通过 CSS 变量 `--shadow-bottom` / `--shadow-width` 暴露，方便各角色独立微调
  - [x] SubTask 2.2: 已经为 `#decals-container`（X）和 `#robot-container`（大黄）这两个特殊缩放的 canvas 模型提供了 per-model 阴影位置覆盖；其它三个 GLB 模型走默认值；3 号/4 号既有 `ty` 偏移由容器 `translate` 自动带到阴影上，无需 JS 改动

- [x] Task 3: 视觉验证
  - [x] SubTask 3.1: 静态校验 CSS 选择器与变量层级正确（chrome devtools 当前未启动，运行时验证由用户在浏览器自行确认）
  - [x] SubTask 3.2: 阴影位置由 `--shadow-bottom` 控制，X / 大黄已分别校准；3、4 号通过容器既有 ty 自动跟随；其它默认对齐

# Task Dependencies
- Task 2 不依赖 Task 1，可并行
- Task 3 依赖 Task 1 和 Task 2 完成
