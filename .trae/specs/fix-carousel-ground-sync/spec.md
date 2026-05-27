# Fix Carousel Ground Sync Spec

## Why

当前第一列角色在轮播切换时存在两个肉眼可见的视觉 Bug：

1. **方向反了**：切换"下一个"时，主角是先向左跳一步再缓慢向右滑回中间，与第二列产品/第三列画作（直接从右滑入中间）相反。
2. **顺序混乱 / 突变**：切换瞬间所有 items 内部 `tx` 同时重排（每个 item 的 `tx -= itemSpacing`），叠加 turntable 容器后续的反向像素补偿，造成"先瞬移再回滑"的双重位移叠加，看起来像角色被"洗牌"，而非顺畅地从一侧滑入。

根因：

* `updateCarousel` 在 `activeIndex` 变化时把每个 item 的 `tx` 立即跳到新槽位（`tx = offset * itemSpacing`，offset 基于 activeIndex）。

* 同时 `animateBg` 用 `(bgCamera.x - bgTargetPositionX) × pxPerUnit` 给 turntable 容器做反向补偿。

* 两套位移叠加 → 切换瞬间 DOM 整体跳 −2×itemSpacing，再缓动回 −1×itemSpacing → 视觉错位。

## What Changes

* **BREAKING**：DOM items 不再随 `activeIndex` 重排 `tx`。每个 item 在初始化时按"出生顺序"获得一个**绝对世界坐标** **`absX = (initialIndex - midIndex) × WORLD_STEP`**（单位为 3D 世界单位）。

* 每帧根据 `bgCamera.position.x` 把每个 item 的世界坐标转换成屏幕 `tx = (absX − bgCamera.x) × pxPerUnit`。这样：

  * 角色完全"钉"在地面世界坐标上，与产品/画作完全同步。

  * 切换"下一个" → 相机向右走 → items 整体看起来向左滑 → 右边的下一个角色滑入中央，方向与产品列、画作列一致。

* **循环 wrap**：当某 item 的 `tx` 超出舞台两侧（> N/2 个 step 之外）时，把该 item 的 `absX` 加/减 `N × WORLD_STEP` 跳到对侧。这一跳发生在屏幕外，肉眼不可见。

* `activeIndex` 改为派生量：根据当前相机 X 与 item 的 `absX` 求最近邻 → 决定 active 类、亮度、zIndex。

* 移除原 turntable 容器的 `translateX` 反向补偿（已由每个 item 自身的世界→屏幕换算替代），保留 `scale / opacity` 等淡出特效。

* 移除原"槽位切换瞬时完成"逻辑（不再切槽位）。

## Impact

* 受影响代码：

  * [talkinghead.js](file:///Users/bytedance/Desktop/our-website/talkinghead.js)：`updateCarousel`、`switchModel`、`animateBg` 中 turntable 相关补偿

* 不影响：

  * 模型加载、TalkingHead 库、AI 对话、第二列产品阵列、第三列画作阵列、灯/地板/墙/树阵列

  * 自动轮播守卫的"切到下一个"语义保持不变（仍是 `activeIndex + 1`）

## ADDED Requirements

### Requirement: 角色绝对世界坐标锁定

系统应为每个角色 item 分配一个固定的世界坐标，不随 `activeIndex` 变化而重排。

#### Scenario: 初始化

* **WHEN** DOM 创建 N 个 carousel items

* **THEN** 第 j 个 item 的 `absX = (j − floor(N/2)) × 30`（30 = WORLD\_STEP）

### Requirement: 角色随相机同步移动

系统应每帧根据相机 X 把 item 的世界坐标投影成屏幕像素，让角色与地板/产品/画作完全同步。

#### Scenario: 相机平移

* **WHEN** `bgCamera.position.x` 变化

* **THEN** 每个 item 的屏幕 `tx = (absX − bgCamera.x) × pxPerUnit`，`pxPerUnit = innerHeight / (2 × |cam.z| × tan(fov/2))`

### Requirement: 屏外环形 wrap

系统应在 item 滑出舞台时把它的 `absX` 跳到对侧，实现无限循环。

#### Scenario: 右侧滑出

* **WHEN** `absX − bgCamera.x > N/2 × WORLD_STEP`

* **THEN** `absX -= N × WORLD_STEP`

#### Scenario: 左侧滑出

* **WHEN** `absX − bgCamera.x < −N/2 × WORLD_STEP`

* **THEN** `absX += N × WORLD_STEP`

### Requirement: 切换方向与产品/画作一致

系统切换"下一个"时，新角色应**从右侧滑入中央**，与产品/画作行为一致。

#### Scenario: 点击下一个

* **WHEN** `switchModel(activeIndex + 1)` 被调用

* **THEN** `bgTargetPositionX += 30`（相机右移），右侧 item 滑入中央

## MODIFIED Requirements

### Requirement: 轮播容器视觉特效

turntable 容器只负责整体的 `scale` 和 `opacity`（用于鼠标滚轮聚焦淡出），**不再做** X 轴反向补偿。

### Requirement: activeIndex 与 active 样式

`activeIndex` 仍由 `switchModel` 主动写入，但 active 类的赋予改为按"最接近镜头中线的 item"派生：每帧检查哪个 item 的 `tx` 最接近 0 → 给它加 `.active` 类。

## REMOVED Requirements

### Requirement: items 的 transition: none 槽位瞬时切换

**Reason**：不再切槽位。
**Migration**：直接删除该逻辑。

### Requirement: turntable.translateX 反向补偿

**Reason**：被每个 item 自身的世界→屏幕换算替代。
**Migration**：从 `animateBg` 中移除 `translateX(camOffsetPx)`。

## Out of Scope

* 不改第二列产品/第三列画作的轮播逻辑。

* 不改 itemSpacing 公式之外的相机参数。

* 不引入真实 Three.js 角色渲染。

