# Fix Speaker Switch During AI Reply Spec

## Why
当前用户向某个角色发送消息后，UI 在等待大模型返回的几秒内仍会触发"5 秒无操作自动轮播"，导致 `activeIndex` 切换到下一个模型；AI 返回后会让"下一个模型"开口说出本应属于上一个角色的回复（例如向大黄发消息却由 5 号说话）。

## What Changes
- 在 `handleSpeak` 触发到 AI 回复说完整个生命周期内，挂起自动轮播（已存在的守卫 `isSomeoneSpeaking / isLoading / isInputFocused` 不能覆盖大模型请求阶段）。
- 不改变现有自动轮播的其它行为（5 秒计时、说话期间挂起、loading 期间挂起）。

## Impact
- 受影响代码：[talkinghead.js](file:///Users/bytedance/Desktop/our-website/talkinghead.js)（`handleSpeak`、自动轮播守卫处）
- 受影响功能：用户发消息后的 AI 回复链路、自动轮播
- 不影响：模型切换、加载动画、纹理/背景、对话框聚焦

## ADDED Requirements
### Requirement: 等待 AI 回复期间禁止切换发声主体
系统在用户提交消息（无论点按钮还是回车）后，从发起大模型请求到当前角色完整说完为止，**SHALL** 不允许任何自动轮播打断当前会话主体（`activeIndex`）。

#### Scenario: 用户向大黄发消息后等待回复
- **WHEN** 用户在大黄被选中时输入消息并提交
- **AND** 大模型请求耗时超过 5 秒
- **THEN** `activeIndex` 始终指向大黄，回复内容由大黄的角色说出，不会被自动轮播切走

#### Scenario: 回复完成后恢复自动轮播
- **WHEN** 当前角色完成说话且对话框未再次激活
- **THEN** 自动轮播在再过 5 秒后正常触发

## MODIFIED Requirements
### Requirement: 自动轮播守卫
自动轮播在以下任一条件成立时挂起：
- `window.isSomeoneSpeaking` 为真
- 加载动画显示中（`#talkinghead-loading` 可见）
- 输入框聚焦中
- **新增**：`window.isAwaitingResponse` 为真（由 `handleSpeak` 在请求大模型前后置位 / 复位）

## REMOVED Requirements
（无）
