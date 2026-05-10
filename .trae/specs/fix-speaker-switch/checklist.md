# Checklist

- [x] `handleSpeak` 入口处会将 `window.isAwaitingResponse` 设为 true
- [x] `handleSpeak` 在成功路径与异常路径（catch）都会把 `window.isAwaitingResponse` 复位
- [x] 自动轮播守卫在 `window.isAwaitingResponse` 为 true 时挂起，不会切换 `activeIndex`
- [x] 现有守卫（说话中 / loading / 输入框聚焦）行为保持不变
- [x] 用户向某模型发消息，回复始终由该模型说出（不再"换人"）
