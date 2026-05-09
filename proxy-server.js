// 加载 .env 文件中的环境变量（如果存在）
try { require('dotenv').config(); } catch (_) { /* dotenv 未安装时静默忽略，避免线上环境报错 */ }

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

const app = express();
const PORT = process.env.PORT || 3000;

// 从环境变量读取密钥（绝不硬编码）
const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY;

if (!VOLCENGINE_API_KEY) {
    console.warn('⚠️  VOLCENGINE_API_KEY 未设置，/api/proxy 将无法注入 Authorization 头');
}

// Create HTTP server
const server = http.createServer(app);

// 配置 CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// 代理配置
const apiProxy = createProxyMiddleware({
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    pathRewrite: {
        '^/api/proxy': '' // 去掉 /api/proxy 前缀
    },
    onProxyReq: (proxyReq, req, res) => {
        // 服务端注入 Authorization，前端不再需要携带任何 key
        if (VOLCENGINE_API_KEY) {
            proxyReq.setHeader('Authorization', `Bearer ${VOLCENGINE_API_KEY}`);
        }
        console.log(`Proxying ${req.method} request to: ${proxyReq.host}${proxyReq.path}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy Error', message: err.message });
    }
});

// 注册代理路由 (必须在 express.json() 之前，否则会因为 stream 被消费而卡住)
app.use('/api/proxy', apiProxy);

// Body parser for Tencent Cloud API
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// 请求日志
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// 健康检查
app.get('/ping', (req, res) => {
    res.send('pong');
});

// 托管静态文件 (当前目录)
app.use(express.static(path.join(__dirname, '.')));

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`- Static files served from: ${__dirname}`);
    console.log(`- Proxy endpoint: http://localhost:${PORT}/api/proxy/api/coding/v3/chat/completions`);
    console.log(`- Open http://localhost:${PORT} in your browser`);
});
