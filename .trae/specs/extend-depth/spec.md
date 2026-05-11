# Extend Spatial Depth Spec

## Why
用户希望将 3D 空间的纵深感进一步加强，将空间深度向后延伸当前深度的一半。这样可以让画作（Paintings）悬浮在空中，从而产生更有层次感和奇幻感的视觉体验。

## What Changes
- 将墙面（Wall 和 WallPanels）的 Z 轴位置向后推移约 150 个单位（从 `-295` 移动到 `-445`）。
- 将相机的视线目标（lookAt）和滚动下限（BG_Z_MIN）同步向后推移 150 个单位，确保滚动体验顺畅。
- 延长全局雾效（Fog）的 `far` 距离，防止后推的墙面被黑雾完全吞噬。
- **保持画作阵列（Paintings）的位置不变**（维持在 `z = -294.6`），使其在视觉上呈现为悬浮在空中的画廊。

## Impact
- Affected specs: 空间深度、滚动交互边界、雾效渲染
- Affected code: `talkinghead.js`

## MODIFIED Requirements
### Requirement: 空间深度延伸
系统需要支持更深远的 Z 轴漫游范围。
- **WHEN** 用户向后滚动滚轮（拉近相机）
- **THEN** 相机可以继续穿过画作层，向新墙面（`z=-445`）推进，最远到达 `z=-420`，并且画作会自然地漂浮在场景中间。