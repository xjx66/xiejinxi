// Vercel Serverless Function: /api/deepseek
// 通过 vercel.json rewrite 把 /api/deepseek/<...> 映射到这里，转发到 DeepSeek（OpenAI 兼容）。
// API key 仅在服务端读取（Vercel 环境变量 DEEPSEEK_API_KEY），前端永远不接触。

const TARGET_BASE = 'https://api.deepseek.com';

module.exports = async (req, res) => {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'DEEPSEEK_API_KEY is not configured on the server' });
        return;
    }

    const incomingUrl = req.url || '';
    const stripped = incomingUrl.replace(/^\/api\/deepseek/, '') || '/';
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
        console.error('DeepSeek Proxy Error:', err);
        res.status(502).json({ error: 'Upstream proxy error', message: err.message });
    }
};
