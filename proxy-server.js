const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const http = require('http');
const WebSocket = require('ws');
const chokidar = require('chokidar');
const crypto = require('crypto');
const https = require('https');

const app = express();
const PORT = 3000;

const LOG_DIR = '/Users/bytedance/.openclaw/agents/main/sessions';
let LOG_FILE_PATH = '';
let logWatcher = null;

// Find the latest .jsonl file (excluding .json)
const findLatestLogFile = () => {
    try {
        if (!fs.existsSync(LOG_DIR)) {
            console.error(`Log directory not found: ${LOG_DIR}`);
            return null;
        }

        const files = fs.readdirSync(LOG_DIR)
            .filter(file => file.endsWith('.jsonl'))
            .map(file => {
                const filePath = path.join(LOG_DIR, file);
                return {
                    path: filePath,
                    mtime: fs.statSync(filePath).mtime
                };
            })
            .sort((a, b) => b.mtime - a.mtime); // Sort by modified time descending

        if (files.length > 0) {
            console.log(`Found latest log file: ${files[0].path}`);
            return files[0].path;
        } else {
            console.log('No .jsonl files found in log directory');
        }
    } catch (err) {
        console.error(`Error finding latest log file: ${err.message}`);
    }
    return null;
};

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocket.Server({ server });

// WebSocket connection handling
wss.on('connection', (ws) => {
    console.log('Client connected');
    ws.on('close', () => console.log('Client disconnected'));
});

// Broadcast function
const broadcast = (data) => {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// File watching logic
let lastSize = 0;

const startWatching = (filePath) => {
    if (logWatcher) {
        logWatcher.close();
        console.log('Stopped watching previous log file');
    }

    if (!filePath) {
        console.log('No log file to watch');
        return;
    }

    LOG_FILE_PATH = filePath;
    console.log(`Starting to watch: ${LOG_FILE_PATH}`);

    // Initialize lastSize
    try {
        const stats = fs.statSync(LOG_FILE_PATH);
        lastSize = stats.size;
        console.log(`Initial log file size: ${lastSize}`);
    } catch (err) {
        console.error(`Error reading log file: ${err.message}`);
        return;
    }

    // Watch for file changes
    logWatcher = chokidar.watch(LOG_FILE_PATH, {
        persistent: true,
        usePolling: true, // Force polling to detect changes on some file systems
        interval: 1000,
        binaryInterval: 1000
    });
    
    logWatcher.on('change', (path) => {
        console.log(`Log file changed detected: ${path}`); // Debug log
        fs.stat(path, (err, stats) => {
            if (err) {
                console.error(`Error reading file stats: ${err}`);
                return;
            }

            console.log(`File size check - Old: ${lastSize}, New: ${stats.size}`);

            if (stats.size > lastSize) {
                const stream = fs.createReadStream(path, {
                    start: lastSize,
                    end: stats.size
                });

                let newData = '';
                stream.on('data', (chunk) => {
                    newData += chunk;
                });

                stream.on('end', () => {
                    console.log(`Read ${newData.length} bytes of new data`);
                    lastSize = stats.size;
                    // Process new lines
                    const lines = newData.split('\n').filter(line => line.trim() !== '');
                    
                    lines.forEach(line => {
                        try {
                            const json = JSON.parse(line);
                            // Debug log for JSON content
                            // console.log('Parsed JSON:', JSON.stringify(json).substring(0, 100) + '...');
                            
                            // Check if it's a message from assistant
                            if (json.type === 'message' && json.message && json.message.role === 'assistant') {
                                const content = json.message.content;
                                let textToSpeak = "";

                                if (Array.isArray(content)) {
                                    // Extract text parts, ignoring thinking parts
                                    const textParts = content.filter(c => c.type === 'text');
                                    textToSpeak = textParts.map(c => c.text).join(' ');
                                } else if (typeof content === 'string') {
                                    textToSpeak = content;
                                }

                                if (textToSpeak) {
                                    console.log(`Broadcasting new assistant message: ${textToSpeak.substring(0, 50)}...`);
                                    broadcast({
                                        type: 'assistant_message',
                                        text: textToSpeak
                                    });
                                } else {
                                    console.log('Assistant message found but no text content extracted');
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing JSON line:', e);
                        }
                    });
                });
            } else if (stats.size < lastSize) {
                // File truncated (e.g., log rotation or overwrite), reset lastSize
                console.log('File truncated, resetting lastSize to 0');
                lastSize = 0;
            }
        });
    });
};

// Initial setup
startWatching(findLatestLogFile());

// Watch directory for new files to switch automatically
chokidar.watch(LOG_DIR, { ignoreInitial: true }).on('add', (filePath) => {
    if (filePath.endsWith('.jsonl')) {
        console.log(`New session file detected: ${filePath}`);
        // Wait a bit to ensure file is ready, then switch
        setTimeout(() => startWatching(filePath), 1000);
    }
});

// 配置 CORS
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

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

// 代理配置
const apiProxy = createProxyMiddleware({
    target: 'https://ark.cn-beijing.volces.com',
    changeOrigin: true,
    pathRewrite: {
        '^/api/proxy': '' // 去掉 /api/proxy 前缀
    },
    onProxyReq: (proxyReq, req, res) => {
        if (req.method === 'POST') {
            proxyReq.setHeader('Content-Type', 'application/json');
        }
        console.log(`Proxying ${req.method} request to: ${proxyReq.host}${proxyReq.path}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy Error:', err);
        res.status(500).json({ error: 'Proxy Error', message: err.message });
    }
});

// 注册代理路由
app.use('/api/proxy', apiProxy);

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
    console.log(`- Watching log file: ${LOG_FILE_PATH}`);
    console.log(`- WebSocket server ready`);
    console.log(`- Open http://localhost:${PORT} in your browser`);
});
