# Tasks
- [ ] Task 1: 扩展空间深度并调整相机边界
  - [ ] SubTask 1.1: 在 `talkinghead.js` 中将全局 `Fog` 的远距离从 500 延长到 700。
  - [ ] SubTask 1.2: 将背景相机 `bgCamera` 的初始 `lookAt` 目标 Z 坐标从 `-300` 修改为 `-450`。
  - [ ] SubTask 1.3: 将滚动过程中的 `bgCamera.lookAt` 目标 Z 坐标从 `-300` 修改为 `-450`。
  - [ ] SubTask 1.4: 将 `BG_Z_MIN` 从 `-270` 修改为 `-420`，允许相机推得更深。

- [ ] Task 2: 后推墙体几何位置
  - [ ] SubTask 2.1: 将基础背景墙 `wall` 的 Z 坐标从 `-295` 修改为 `-445`。
  - [ ] SubTask 2.2: 将 `wallPanels`（阵列面板）的 Z 坐标从 `-295 + wallPanelThickness / 2` 修改为 `-445 + wallPanelThickness / 2`。
  - [ ] SubTask 2.3: 更新相关注释，说明新的墙面位置。