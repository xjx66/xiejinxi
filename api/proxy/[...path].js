// Vercel Serverless Function: 把 /api/proxy/<...> 转发到火山方舟，并在服务端注入 Authorization
// 这样前端永远不需要持有 API key
// 在 Vercel 控制台的 Environment Variables 里配置 VOLCENGINE_API_KEY

const TARGET_BASE = 'https://ark.cn-beijing.volces.com';

module.exports = async (req, res) => {
    const apiKey = process.env.VOLCENGINE_API_KEY;
    if (!apiKey) {
        res.status(500).json({ error: 'VOLCENGINE_API_KEY is not configured on the server' });
        return;
    }

    // 还原原始路径：/api/proxy/api/coding/v3/chat/completions -> /api/coding/v3/chat/completions
    const segments = Array.isArray(req.query.path) ? req.query.path : [req.query.path].filter(Boolean);
    const targetPath = '/' + segments.join('/');

    // 转发查询字符串（去掉 path 这个内部字段）
    const queryEntries = Object.entries(req.query).filter(([k]) => k !== 'path');
    const queryString = queryEntries.length
        ? '?' + queryEntries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
        : '';

    const targetUrl = `${TARGET_BASE}${targetPath}${queryString}`;

    // 透传请求头中安全的字段
    const forwardHeaders = {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'Authorization': `Bearer ${apiKey}`
    };

    try {
        const init = {
            method: req.method,
            headers: forwardHeaders
        };
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            init.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }

        const upstream = await fetch(targetUrl, init);
        const text = await upstream.text();

        // 透传 content-type 和状态码
        res.status(upstream.status);
        const ct = upstream.headers.get('content-type');
        if (ct) res.setHeader('Content-Type', ct);
        res.send(text);
    } catch (err) {
        console.error('Proxy Error:', err);
        res.status(502).json({ error: 'Upstream proxy error', message: err.message });
    }
};
