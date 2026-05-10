import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SESSION_ID = 'product-rotation-bug';
const LOG_FILE = path.join(__dirname, `trae-debug-log-${SESSION_ID}.ndjson`);
const ENV_FILE = path.join(__dirname, `${SESSION_ID}.env`);

const PORT = 4321; // Hardcoded for simplicity or dynamic if needed
let server;
let lastActive = Date.now();
const IDLE_TIMEOUT = 1200 * 1000;

const startServer = () => {
    server = http.createServer((req, res) => {
        lastActive = Date.now();
        
        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        if (req.method === 'POST' && req.url === '/logs') {
            let body = '';
            req.on('data', chunk => { body += chunk.toString(); });
            req.on('end', () => {
                try {
                    const logEntry = JSON.parse(body);
                    logEntry.serverTimestamp = new Date().toISOString();
                    fs.appendFileSync(LOG_FILE, JSON.stringify(logEntry) + '\n');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'ok' }));
                } catch (e) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Invalid JSON' }));
                }
            });
        } else if (req.method === 'GET' && req.url === '/logs') {
            try {
                const logs = fs.readFileSync(LOG_FILE, 'utf-8')
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => JSON.parse(line));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(logs));
            } catch (e) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify([]));
            }
        } else if (req.method === 'DELETE' && req.url === '/logs') {
            fs.writeFileSync(LOG_FILE, '');
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'cleared' }));
        } else if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'healthy', sessionId: SESSION_ID }));
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    server.listen(PORT, () => {
        console.log(`[Debug Server] Running on http://localhost:${PORT}`);
        fs.writeFileSync(ENV_FILE, `DEBUG_SERVER_URL=http://localhost:${PORT}\nDEBUG_SESSION_ID=${SESSION_ID}\n`);
    });

    setInterval(() => {
        if (Date.now() - lastActive > IDLE_TIMEOUT) {
            console.log('[Debug Server] Idle timeout reached. Shutting down.');
            process.exit(0);
        }
    }, 10000);
};

startServer();