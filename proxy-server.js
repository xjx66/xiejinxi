const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');

const app = express();
const PORT = 3000;

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
        if (req.method === 'POST' && req.body) {
            // 如果必须放在 body parser 后面，可以在这里重新写入 body，但最好是把 proxy 放在前面
            // 此处我们将 proxy 放在 body parser 前面，所以不会有 body 被消费的问题
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

// -----------------------------------------------------------------------
// Tencent Cloud Hunyuan 3D API Proxy (New Version)
// -----------------------------------------------------------------------
const HUNYUAN_API_KEY = 'sk-arJEHmoXhjoidCOR6J7CAzgK7QCaQdGkFH7hYKg3Wiyaaobf';
const HUNYUAN_BASE_URL = 'https://api.ai3d.cloud.tencent.com';

async function callHunyuanAPI(endpoint, payload) {
    console.log(`Calling Hunyuan API: ${endpoint}`);
    console.log(`Payload:`, payload);
    console.log(`Headers:`, {
        'Authorization': HUNYUAN_API_KEY,
        'Content-Type': 'application/json'
    });
    
    try {
        const { default: fetch } = await import('node-fetch');
        const response = await fetch(`${HUNYUAN_BASE_URL}${endpoint}`, {
            method: 'POST',
            headers: {
                'Authorization': HUNYUAN_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        console.log(`Response status: ${response.status}`);
        const data = await response.json();
        console.log(`Response data:`, data);
        
        if (!response.ok) {
            throw new Error(data.message || `API Error: ${response.status}`);
        }
        return data;
    } catch (error) {
        console.error('API Call Error:', error);
        throw error;
    }
}

// Text-to-3D Endpoint
app.post('/api/hunyuan/text-to-3d', async (req, res) => {
    try {
        const { prompt } = req.body;
        if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

        const result = await callHunyuanAPI('/v1/ai3d/submit', {
            "Prompt": prompt
        });
        
        // Map JobId if needed (based on actual API response structure)
        const jobId = result.JobId || result.job_id || result.id || (result.Response && result.Response.JobId);
        res.json({ JobId: jobId });
    } catch (error) {
        console.error('Text-to-3D Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Image-to-3D Endpoint
app.post('/api/hunyuan/image-to-3d', async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        if (!imageBase64) return res.status(400).json({ error: 'ImageBase64 is required' });

        const result = await callHunyuanAPI('/v1/ai3d/submit', {
            "ImageBase64": imageBase64 
        });
        
        // Map JobId if needed (based on actual API response structure)
        const jobId = result.JobId || result.job_id || result.id || (result.Response && result.Response.JobId);
        res.json({ JobId: jobId });
    } catch (error) {
        console.error('Image-to-3D Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Query Status Endpoint
app.get('/api/hunyuan/query', async (req, res) => {
    try {
        const { jobId } = req.query;
        if (!jobId) return res.status(400).json({ error: 'JobId is required' });

        const result = await callHunyuanAPI('/v1/ai3d/query', {
            "JobId": jobId
        });
        
        // Ensure result structure matches what talkinghead.js expects
        // talkinghead.js expects: { JobStatus: 'SUCCESS', ResultUrl: '...' }
        // We might need to map the result based on actual API response
        const responseData = result.Response || result;
        res.json({
            JobStatus: responseData.Status || responseData.status || (responseData.ResultUrl ? 'SUCCESS' : 'PROCESSING'),
            ResultUrl: responseData.ResultUrl || responseData.result_url || (responseData.ResultList && responseData.ResultList[0] && responseData.ResultList[0].ModelUrl)
        });
    } catch (error) {
        console.error('Query Status Error:', error);
        res.status(500).json({ error: error.message });
    }
});



// 托管静态文件 (当前目录)
app.use(express.static(path.join(__dirname, '.')));

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
    console.log(`- Static files served from: ${__dirname}`);
    console.log(`- Proxy endpoint: http://localhost:${PORT}/api/proxy/api/coding/v3/chat/completions`);
    console.log(`- Open http://localhost:${PORT} in your browser`);
});
