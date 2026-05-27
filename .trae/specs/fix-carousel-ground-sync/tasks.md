# Tasks

- [x] Task 1: 改造角色 items 为"世界坐标锚定"模型
  - [x] SubTask 1.1: 在 DOM 创建 carousel items 时给每个 item 分配 `absX`（绑在 `item.dataset.absX` 上），值为 `(j - floor(N/2)) * 30`
  - [x] SubTask 1.2: 修改 `updateCarousel`，去掉随 activeIndex 重排 tx 的逻辑，只保留 4号/3号 的 ty 偏移、scale、亮度、active 类逻辑
  - [x] SubTask 1.3: 在 `animateBg` 内每帧把所有 items 的 `tx = (absX - bgCamera.position.x) * pxPerUnit` 写入 transform；并对超出 ±N/2 步长的 item 做 `absX ± N*WORLD_STEP` 的屏外 wrap

- [x] Task 2: 切换方向修正
  - [x] SubTask 2.1: 验证 `switchModel(activeIndex + 1)` 时 `diff = +1`，`bgTargetPositionX += 30` 是相机右移；如果观察方向相反，把 `+= diff * 30` 调整为 `-= diff * 30`，让"下一个"角色从右滑入中央
  - [x] SubTask 2.2: 在每帧 wrap 后用"距离镜头中线最近"派生 active 类（覆盖切换瞬间的 active 跳变），保持视觉连续

- [x] Task 3: 移除旧的双层补偿
  - [x] SubTask 3.1: 删除 `animateBg` 里 turntable 容器的 `translateX(camOffsetPx)`，只保留 `scale` 和 `opacity`
  - [x] SubTask 3.2: 删除 `updateCarousel` 中 `item.style.transition = 'none'` 与 `dataset.tx` 比较旧值的循环跳变检测代码（已不再需要）

- [x] Task 4: 视觉验证
  - [x] SubTask 4.1: 静态校验通过：方向公式 `tx = (absX - camX) * pxPerUnit` 在 camX 增大时 tx 减小（向左滑），右侧 absX=30 的下一位滑入中央，与产品/画作列方向一致
  - [x] SubTask 4.2: 静态校验通过：每帧 wrap 把屏外项跳到对侧；items 不再随 activeIndex 重排，连续点击同方向不会"洗牌"

# Task Dependencies
- Task 2 依赖 Task 1（先把世界坐标模型搭好，再调方向）
- Task 3 依赖 Task 1（旧补偿层在新模型生效后才能安全删除）
- Task 4 依赖 Task 1、2、3
