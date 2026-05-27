# Checklist

- [x] 每个 carousel item 在初始化时被赋予 `dataset.absX`，值为 `(j - floor(N/2)) * 30`
- [x] `updateCarousel` 不再写 `tx = offset * itemSpacing` 形式的位移（位移完全在 animateBg 里基于相机算出）
- [x] `animateBg` 中每个 item 的 transform.translateX 由 `(absX - bgCamera.x) * pxPerUnit` 计算
- [x] 当 item 滑出 ±N/2 步长时其 `absX` 被 ±N*30 wrap，肉眼看不到跳变
- [x] turntable 容器的 transform 中不再出现 `translateX(camOffsetPx)`，只剩 `scale` 等
- [x] 切换"下一个"时，新角色从屏幕右侧滑入中央，方向与产品列、画作列一致
- [x] 连续切换 5 次同方向，角色顺序连贯，无"洗牌"或瞬移
- [x] active 类由"最接近中线"派生，切换瞬间不闪烁
- [x] 4号/3号 的 ty 偏移仍生效
- [x] 鼠标滚轮聚焦淡出仍正常（scale + opacity）
