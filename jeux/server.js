'use strict';
// NOLIMIT GAMES : serveur HTTP (fichiers) et WebSocket (salles de jeu).
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const { Rooms } = require('./rooms');

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, 'public');
const VENDOR = {
  '/vendor/leaflet.js': require.resolve('leaflet/dist/leaflet.js'),
  '/vendor/leaflet.css': require.resolve('leaflet/dist/leaflet.css'),
};
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
};

function send(res, code, type, body, extra = {}) {
  res.writeHead(code, { 'Content-Type': type, ...extra });
  res.end(body);
}

const server = http.createServer((req, res) => {
  try {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/sante') return send(res, 200, 'text/plain', 'ok');
    if (VENDOR[p]) return send(res, 200, TYPES[path.extname(p)], fs.readFileSync(VENDOR[p]), { 'Cache-Control': 'public, max-age=86400' });
    let file = path.normalize(path.join(PUBLIC, p === '/' ? 'index.html' : p));
    if (!file.startsWith(PUBLIC)) return send(res, 403, 'text/plain', 'interdit');
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(PUBLIC, 'index.html');
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file), { 'Cache-Control': 'no-cache' });
  } catch (e) {
    console.error(e);
    send(res, 500, 'text/plain', 'erreur');
  }
});

const rooms = new Rooms();
const wss = new WebSocketServer({ server, maxPayload: 2 * 1024 * 1024 });
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    try { rooms.handle(ws, msg); } catch (e) {
      console.error(e);
      try { ws.send(JSON.stringify({ t: 'error', msg: 'Erreur du serveur' })); } catch {}
    }
  });
  ws.on('close', () => rooms.disconnect(ws));
});
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(PORT, () => console.log(`NOLIMIT GAMES sur http://localhost:${PORT}`));
module.exports = { server, rooms };
