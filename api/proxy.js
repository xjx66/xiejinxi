// Vercel Serverless Function: /api/proxy
// 通过 vercel.json rewrite 把 /api/proxy/<...> 全部映射到这里，由本函数转发到火山方舟
// API key 仅在服务端读取（Vercel 环境变量 VOLCENGINE_API_KEY），前端永远不接触

const TARGET_BASE = 'https://ark.cn-beijing.volces.com';

module.exports = async (req, res) => {
    const apiKey = process.env.VOLCENGINE_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'VOLCENGINE_API_KEY is not configured on the server' });
        return;
    }

    // 还原原始路径：去掉 /api/proxy 前缀，剩下的就是要转发的真实路径
    // 例如 /api/proxy/api/coding/v3/chat/completions -> /api/coding/v3/chat/completions
    const incomingUrl = req.url || '';
    const stripped = incomingUrl.replace(/^\/api\/proxy/, '') || '/';
    const targetUrl = `${TARGET_BASE}${stripped}`;

    try {
        const init = {
            method: req.method,
            headers: {
                'Content-Type': req.headers['content-type'] || 'application/json',
                'Authorization': `Bearer ${apiKey}`
            }
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const upstream = await fetch(targetUrl, init);
        const text = await upstream.text();

        res.status(upstream.status);
        const ct = upstream.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        res.send(text);
    } catch (err) {
        console.error('Proxy Error:', err);
        res.status(502).json({ error: 'Upstream proxy error', message: err.message });
    }
};
