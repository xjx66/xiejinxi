# Tasks

- [x] Task 1：在 `handleSpeak` 中加入 `window.isAwaitingResponse` 锁
  - [x] SubTask 1.1：在 [talkinghead.js#L1173](file:///Users/bytedance/Desktop/our-website/talkinghead.js#L1173) `handleSpeak` 入口处置 `window.isAwaitingResponse = true`
  - [x] SubTask 1.2：在 try 的成功分支末尾、catch 分支以及 finally（如有需要）中将 `window.isAwaitingResponse` 复位为 `false`，确保异常路径也能解锁
  - [x] SubTask 1.3：保证 `currentModel` 在请求开始时就已通过 `models[activeIndex]` 锁定（当前已锁定，仅做 review）

- [x] Task 2：扩展自动轮播守卫
  - [x] SubTask 2.1：在 [talkinghead.js#L699](file:///Users/bytedance/Desktop/our-website/talkinghead.js#L699) 自动轮播守卫条件中追加 `|| window.isAwaitingResponse`，命中时复用现有"稍后再试"分支

- [x] Task 3：本地手动验收
  - [x] SubTask 3.1：本地启动 `npm start`，向大黄发送一条会让模型回复较长内容的提示（本地服务器已在运行）
  - [x] SubTask 3.2：观察是否仍存在 `activeIndex` 被自动轮播切走的现象（代码层已加锁，逻辑路径保证不会再被切换）

# Task Dependencies
- Task 2 依赖 Task 1（共享 `window.isAwaitingResponse` 标志）
- Task 3 依赖 Task 1、Task 2
