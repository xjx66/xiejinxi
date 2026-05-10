# Tasks
- [x] Task 1: 创建 3D 进度条 UI 组件
  - [x] SubTask 1.1: 在 `talkinghead.js` 视频加载逻辑中，创建表示进度条背景轨道的 `PlaneGeometry` 或 `BoxGeometry`，放置于视频正下方。
  - [x] SubTask 1.2: 创建表示当前进度的几何体，叠加在背景轨道上。
  - [x] SubTask 1.3: 创建一个表示播放/暂停状态的 3D 按钮（可以使用简单的几何体或贴图区分状态）。
  - [x] SubTask 1.4: 将这些 UI 组件附加到视频的 `itemContainer` 或 `screenMesh`，使其作为子对象跟随主视频一起旋转和缩放。

- [x] Task 2: 进度条状态同步 (UI 更新)
  - [x] SubTask 2.1: 在全局动画循环（或使用 `requestAnimationFrame` 绑定的单独更新函数）中，遍历所有视频对象。
  - [x] SubTask 2.2: 根据 `video.currentTime / video.duration` 计算进度比例。
  - [x] SubTask 2.3: 动态更新进度条几何体的 `scale.x` 或宽度，使其与实际播放进度同步。

- [x] Task 3: 交互逻辑 (键盘控制)
  - [x] SubTask 3.1: 在 `keydown` 事件中监听空格键 (`Space`)，控制视频的播放/暂停，并使用 `e.preventDefault()` 阻止页面滚动。
  - [x] SubTask 3.2: 在 `keydown` 事件中监听左右方向键 (`ArrowLeft`/`ArrowRight`)，控制视频的快退与快进（步进 5 秒）。
  - [x] SubTask 3.3: 移除原有的鼠标交互（Raycaster 点击与拖拽视频进度条）逻辑。
  - [x] SubTask 3.4: 确保在输入框中打字时（`e.target.tagName` 为 `INPUT` 或 `TEXTAREA`），不触发视频快捷键控制。

# Task Dependencies
- Task 2 depends on Task 1
- Task 3 depends on Task 1
