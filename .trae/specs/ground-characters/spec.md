# Ground Characters Spec

## Why
当前轮播中的 5 个角色是 DOM 层 (canvas / 头部模型) 漂浮在固定定位的 3D 背景之上，与 Three.js 场景里的"地板瓷砖"没有任何空间关系；视觉上像贴片/纸片人浮在空中，缺少落地感与体积感。本次目标是用最小代价在视觉上把"角色"和"地面"绑在一起，而不需要把每个角色重写进背景场景。

## What Changes
- 在每个 `.carousel-item` 角色脚下渲染一个**椭圆软阴影**（CSS 径向渐变伪元素），跟随角色的水平位置和当前激活状态变化（active 阴影更浓更大，非 active 更淡更小）。
- 角色 DOM 容器底部对齐到一个统一的"基线 Y"（例如 `bottom: 30%`），保证 5 个角色脚跟在屏幕上处于同一水平线，从透视上"踩在地板瓷砖的同一行"上。
- 把 3D 场景的相机俯仰角微调（`bgCamera.lookAt` 略微降低/升高），让远处地板第一行瓷砖的屏幕 y 坐标与角色基线尽量贴合，强化"地板-角色"对齐错觉。
- 主题切换时阴影颜色自适应：白天深灰半透明，夜间黑色半透明 + 略带蓝色冷调。

## Impact
- 影响范围：纯前端视觉层，仅 CSS + 少量 JS（位置/相机微调）。
- 受影响代码：
  - [style.css](file:///Users/bytedance/Desktop/our-website/style.css)：新增 `.carousel-item::after` 阴影伪元素及主题色规则
  - [talkinghead.js](file:///Users/bytedance/Desktop/our-website/talkinghead.js)：可选微调 `bgCamera.position.y / lookAt`
- 不影响：模型加载、TalkingHead 库、AI 对话、轮播切换逻辑、自动轮播守卫、灯阵列与瓷砖阵列。

## ADDED Requirements

### Requirement: 角色脚下软阴影
系统应为每个轮播角色在其底部渲染一个椭圆软阴影，模拟落地接触感。

#### Scenario: 默认非激活状态
- **WHEN** 用户没有选中某角色
- **THEN** 该角色脚下显示一个**淡灰色径向渐变椭圆**（约 60% 角色宽度，10-15px 高，opacity ≈ 0.25），位置紧贴角色底边

#### Scenario: 激活状态
- **WHEN** 用户切换到该角色（`.active` 类生效）
- **THEN** 阴影**变浓变大**（约 80% 角色宽度，20px 高，opacity ≈ 0.4），并伴随 `transition` 平滑过渡

#### Scenario: 主题切换
- **WHEN** `data-theme` 切换为 `light` 或 `dark`
- **THEN** 阴影颜色对应切换：白天 `rgba(0,0,0,0.25)`，夜间 `rgba(0,0,0,0.5)`，过渡 0.4s

### Requirement: 角色基线对齐
系统应保证所有角色（无论模型实际高度差异）的脚跟落在同一屏幕基线上。

#### Scenario: 渲染初始化
- **WHEN** 页面加载完成 5 个角色
- **THEN** 每个 `.carousel-item` 的内部模型容器使用 `align-items: flex-end` 或固定 `bottom` 值对齐，使得 5 个角色脚部 Y 坐标相同（容差 < 5px）

### Requirement: 相机俯仰对齐基线（可选轻量调整）
系统应让 3D 背景的地板第一行瓷砖在屏幕上的位置与角色脚部基线大致对齐。

#### Scenario: 视觉对齐
- **WHEN** 用户首次打开页面或调整窗口大小
- **THEN** 远处地板瓷砖最近的几行处于角色脚下区域，营造"角色站在瓷砖上"的视错觉

## MODIFIED Requirements

### Requirement: 轮播角色容器样式
原 `.carousel-item` 主要负责水平排布；现追加：
- 添加 `position: relative` 以承载阴影伪元素
- 通过 `align-items: flex-end` 确保模型贴底
- 新增 `::after` 伪元素作为脚下阴影

## REMOVED Requirements
无。

## Out of Scope
- 不引入真实 Three.js 阴影渲染（性能成本高、需要 PCFSoftShadowMap、还要把角色搬进背景场景，复杂度过大）
- 不做角色与瓷砖之间的反射、AO、SSAO 等
- 不修改 GLB 模型本体或 TalkingHead 头部位置算法
