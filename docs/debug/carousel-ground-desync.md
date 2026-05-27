# Debug: Carousel Ground Desync

**Status**: [RESOLVED — by-design parallax]
**Session ID**: carousel-ground-desync
**Created**: 2026-05-12
**Updated**: 2026-05-12

## 实测数据

切换时 camX 从 270 → 480 → 270 → 300 → 480 反复变化。

| z 平面 | 30 世界单位 = 多少 px |
|---|---|
| z=0（前景 / 角色 DOM 锚点） | 537.42 px |
| z=-150（产品行 / 地板可见中景） | 113.14 px |
| 角色 DOM 实际 tx | ~537 px ✓（投影代码本身正确） |

`turntableRect.left + turntableRect.right ≡ innerWidth` → turntable 居中 ✓
`neighborTx ≈ pxStep_z0` → 投影计算正确 ✓

## 根因

**这是单点透视的物理视差，不是 bug。**
- 前景 z=0 的物体在相机横移 30 单位时屏幕滑动 537 px
- 远景 z=-150 的物体只滑动 113 px
- 两者比值 = 5：1，无法兼得"角色大尺寸（600 px DOM）+ 与地板像素级同步"

## 决策（用户选择）
保持 z=0 锚点：角色保持现有 600 px 视觉大小，接受"前景滑得比地板快"的视差。
这与现实摄影/电影镜头表现一致。

## 已修复的真正 Bug
1. 相机 lerp 残余 → 加入 `|diff| < 0.01` 吸附
2. CSS transition 0.6s 与 60fps JS 写入冲突 → items 强制 `transition: none`
3. matrixWorld 落后 1 帧 → 投影前显式 `updateMatrixWorld(true)`
4. activeIndex 重排 + turntable 反向补偿双层位移 → 改为绝对世界坐标 absX 方案

## Cleanup
- 调试插桩已全部移除
- Debug Server 保留运行（端口 4321），下次可复用
