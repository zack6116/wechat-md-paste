import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '.last-live-import.txt');
const PORT = 9765;

const server = http.createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/import-log') {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks).toString('utf8');
    await fs.writeFile(OUT, body, 'utf8');
    process.stdout.write(`[wmp] live import log → ${OUT}\n`);
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '127.0.0.1', () => {
  process.stdout.write(`[wmp] import log server http://127.0.0.1:${PORT}\n`);
});
