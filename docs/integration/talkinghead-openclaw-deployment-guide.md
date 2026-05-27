# OpenClaw (虾) + Talking Head 全流程集成指南 (Trae 0代码版)

本文档旨在理清如何通过 Trae，将 GitHub 开源项目 **Talking Head** 与本地运行的 **OpenClaw (虾)** 串联起来，实现“飞书聊天 -> 网页虚拟人实时播报”的闭环。

---

## 🔗 核心流程架构

**数据流向：** `飞书/客户端` ➡️ `OpenClaw (虾)` ➡️ `本地日志文件` ➡️ `Trae 生成的中转服务` ➡️ `WebSocket` ➡️ `Talking Head 网页`

1.  **OpenClaw (源头)**: 负责思考和回复，将对话内容写入本地 `.jsonl` 日志。
2.  **Proxy Server (中转)**: Trae 编写的 Node.js 服务，实时**监听**日志文件变化，提取最新回复，通过 **WebSocket** 广播。
3.  **Talking Head (终端)**: Trae 集成的 GitHub 开源前端项目，接收 WebSocket 消息，通过 **TTS (语音合成)** 朗读，并根据内容关键词**自动触发动作**。

---

## 🛠️ 关键步骤串联

### 1. 准备 OpenClaw (数据源)
*   **动作**: 确保 OpenClaw 在本地运行正常，并找到其生成会话日志的文件夹路径（如 `~/.openclaw/sessions`）。
*   **目的**: 产生可供监听的实时对话数据。

### 2. Trae 生成前端 (集成 GitHub 开源项目)
*   **指令**: 告诉 Trae “基于 GitHub 上的 Talking Head 开源项目生成一个网页，包含 3D 虚拟人”。
*   **结果**: Trae 自动下载 `talkinghead` 依赖，生成 `index.html`，配置好 Three.js 场景和虚拟人模型。

### 3. Trae 生成中转服务 (数据桥梁)
*   **指令**: 告诉 Trae “写一个 Node.js 服务，监听 OpenClaw 的日志文件，有新消息就通过 WebSocket 推送给前端”。
*   **结果**: Trae 生成 `proxy-server.js`，实现了文件监听 (`chokidar`) 和 WebSocket 服务，自动对接日志文件。

### 4. 赋予交互逻辑 (注入灵魂)
*   **指令**: 告诉 Trae “让虚拟人根据说话内容自动做动作（如开心、挥手）”。
*   **结果**: Trae 修改前端代码，添加关键词匹配逻辑（如检测到 "Hello" 触发挥手），让虚拟人动起来。

---

## ✅ 最终效果验证

1.  **启动服务**: 运行 `node proxy-server.js`，打开网页 `http://localhost:3000`。
2.  **触发交互**: 在 **飞书** 给虾发一句 “Hello”。
3.  **闭环完成**:
    *   虾回复 -> 写入日志。
    *   服务监测到日志更新 -> 推送 WebSocket。
    *   网页收到消息 -> 虚拟人开口说话 + 挥手动作。
