# Add Video Progress Bar Spec

## Why
目前 3D 展台中的视频是自动循环静音播放的，用户无法控制视频的播放进度或暂停播放。为了提升交互体验，需要为视频对象添加一个 3D 进度条，并支持播放控制，且该组件需作为视频对象的一部分，随之一同旋转和移动。

## What Changes
- 在 `talkinghead.js` 中，当加载类型为 `video` 的产品时，在视频 `PlaneGeometry` 下方添加一个由 3D 几何体构成的进度条组合（包含背景槽、进度高亮条、播放/暂停按钮）。
- 在渲染循环中，根据 `video.currentTime` 实时更新进度高亮条的宽度/缩放。
- 在现有的 `Raycaster` 点击和拖拽逻辑中，加入对进度条及控制按钮的相交检测：
  - 点击播放/暂停按钮可切换 `video.play()` 和 `video.pause()`。
  - 点击进度条区域可改变 `video.currentTime` 以实现跳转。
  - 拖拽进度条时可平滑调整进度（需区分产品旋转和进度拖拽）。

## Impact
- Affected specs: 3D Product Showcase Interactions
- Affected code: `/Users/bytedance/Desktop/our-website/talkinghead.js`

## ADDED Requirements
### Requirement: 3D Video Player Controls
The system SHALL provide a 3D UI for controlling video playback within the showcase.

#### Scenario: Toggle Playback
- **WHEN** user clicks the play/pause button on the video's 3D UI
- **THEN** the video pauses if it was playing, or plays if it was paused.

#### Scenario: Seek Video
- **WHEN** user clicks or drags along the 3D progress bar track
- **THEN** the video's current time updates proportionally to the clicked position.

#### Scenario: Visual Synchronization
- **WHEN** the video plays
- **THEN** the 3D progress bar fills up proportionally to the elapsed time.
