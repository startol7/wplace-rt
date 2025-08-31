// server.js
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// ===== キャンバス設定 =====
const W = 256, H = 256;        // 横×縦を大きく
const COOLDOWN_MS = 3000;      // 3秒クールダウン
const SAVE_FILE = 'pixels.json';

// ===== データ保持用 =====
const pixels = new Map();      // "x,y" -> "#rrggbb"
const nextAtByUser = new Map();

// ===== 起動時に保存データを読み込み =====
if (fs.existsSync(SAVE_FILE)) {
  console.log('loading saved pixels...');
  const data = JSON.parse(fs.readFileSync(SAVE_FILE, 'utf8'));
  for (const [k,v] of Object.entries(data)) {
    pixels.set(k, v);
  }
}

// ===== 定期的に保存 =====
setInterval(() => {
  const obj = Object.fromEntries(pixels.entries());
  fs.writeFileSync(SAVE_FILE, JSON.stringify(obj));
  console.log('saved', pixels.size, 'pixels');
}, 10000); // 10秒ごと

// ===== 簡易ユーザー識別 =====
function uid(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const ua = req.headers['user-agent'] || '';
  return ip + '|' + ua;
}

// ===== API: キャンバス取得 =====
app.get('/api/canvas', (req, res) => {
  const arr = [];
  for (const [k, color] of pixels.entries()) {
    const [x, y] = k.split(',').map(Number);
    arr.push({ x, y, color });
  }
  res.json({ w: W, h: H, pixels: arr });
});

// ===== API: ドット設置 =====
app.post('/api/place', (req, res) => {
  const { x, y, color } = req.body || {};
  if (!Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>=W || y>=H) {
    return res.status(400).json({ ok:false, reason:'bad coords' });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
    return res.status(400).json({ ok:false, reason:'bad color' });
  }

  const id = uid(req);
  const now = Date.now();
  const nextAt = nextAtByUser.get(id) || 0;
  if (now < nextAt) {
    return res.status(429).json({ ok:false, reason:'cooldown', nextAt });
  }

  pixels.set(`${x},${y}`, color);
  nextAtByUser.set(id, now + COOLDOWN_MS);

  // 全員に配信
  const msg = JSON.stringify({ type:'pixel', x, y, color });
  wss.clients.forEach(c => { if (c.readyState === 1) c.send(msg); });

  res.json({ ok:true, nextAt: now + COOLDOWN_MS });
});

// ===== HTTP + WebSocket起動 =====
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type:'hello', cooldownMs: COOLDOWN_MS }));
});

const PORT = 3000;
server.listen(PORT, () => console.log(`open http://localhost:${PORT}`));
