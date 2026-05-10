# Product Showcase Display Spec

## Why
用户希望在当前的 3D 空间中展示自己的互联网产品和实体作品，提升个人网站的作品集展示能力。

## What Changes
- 在 3D 场景的中景或背景区域（例如墙面与相机之间）添加一系列 3D 展台（Pedestals）。
- 为虚拟（互联网）产品创建全息投影效果（半透明、发光的悬浮平面或几何体）。
- 为实体产品创建悬浮的 3D 实体模型效果。
- 为这些悬浮的展品添加平滑的上下浮动（Bobbing）和缓慢旋转动画。
- 展台阵列与相机的移动逻辑保持一致，确保在轮播时能自然过渡。

## Impact
- Affected specs: 场景渲染、物体动画、材质管理。
- Affected code: `/Users/bytedance/Desktop/our-website/talkinghead.js`

## ADDED Requirements
### Requirement: 3D 展台与展品
系统应提供 3D 展台来承载展品。

#### Scenario: 展品分类展示
- **WHEN** 渲染场景时
- **THEN** 实体产品应以悬浮在展台上的 3D 物体形式出现，虚拟产品应以全息投影（悬浮发光平面）的形式出现在展台上空，且都伴随缓慢的悬浮动画。