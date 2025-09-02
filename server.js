// server.js
const path = require("path");
const fs = require("fs");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// ====== ワールド設定（広大）======
const WORLD_W = 16384;   // 横
const WORLD_H = 16384;   // 縦
const COOLDOWN_MS = 1500;
const SAVE_FILE = "pixels.json";

// ====== データ保持（疎なマップ）======
const pixels = new Map(); // key: "x,y" -> "#rrggbb"

// 保存から復帰
if (fs.existsSync(SAVE_FILE)) {
  try {
    const obj = JSON.parse(fs.readFileSync(SAVE_FILE, "utf8"));
    for (const [k, v] of Object.entries(obj)) pixels.set(k, v);
    console.log("loaded pixels:", pixels.size);
  } catch (e) { console.error("load error", e); }
}
// 定期保存
setInterval(() => {
  const obj = Object.fromEntries(pixels.entries());
  fs.writeFileSync(SAVE_FILE, JSON.stringify(obj));
  console.log("saved:", pixels.size);
}, 15000);

// ====== 簡易ユーザー識別 & クールダウン ======
const nextAt = new Map(); // id -> time
const uid = (req) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "";
  const ua = req.headers["user-agent"] || "";
  return ip + "|" + ua;
};

// ====== API: 可視範囲だけ返す ======
app.get("/api/region", (req, res) => {
  let { x0, y0, x1, y1 } = req.query;
  x0 = Math.max(0, Math.min(WORLD_W, parseInt(x0 || 0)));
  y0 = Math.max(0, Math.min(WORLD_H, parseInt(y0 || 0)));
  x1 = Math.max(0, Math.min(WORLD_W, parseInt(x1 || WORLD_W)));
  y1 = Math.max(0, Math.min(WORLD_H, parseInt(y1 || WORLD_H)));
  if (x0 > x1) [x0, x1] = [x1, x0];
  if (y0 > y1) [y0, y1] = [y1, y0];

  const arr = [];
  for (const [k, color] of pixels.entries()) {
    const [x, y] = k.split(",").map(Number);
    if (x >= x0 && x < x1 && y >= y0 && y < y1) arr.push({ x, y, color });
  }
  res.json({ w: WORLD_W, h: WORLD_H, pixels: arr });
});

// ====== API: 1ドット設置（世界座標）======
app.post("/api/place", (req, res) => {
  const { x, y, color } = req.body || {};
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) {
    return res.status(400).json({ ok: false, reason: "bad coords" });
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(color || "")) {
    return res.status(400).json({ ok: false, reason: "bad color" });
  }
  const id = uid(req);
  const now = Date.now();
  if (now < (nextAt.get(id) || 0)) {
    return res.status(429).json({ ok: false, reason: "cooldown", nextAt: nextAt.get(id) });
  }

  pixels.set(`${x},${y}`, color);
  nextAt.set(id, now + COOLDOWN_MS);

  // WSブロードキャスト
  const msg = JSON.stringify({ type: "draw", x, y, color });
  wss.clients.forEach(c => { if (c.readyState === WebSocket.OPEN) c.send(msg); });

  res.json({ ok: true, nextAt: now + COOLDOWN_MS });
});

// ====== WebSocket ======
wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", w: WORLD_W, h: WORLD_H, cooldownMs: COOLDOWN_MS }));
});

// ====== 起動 ======
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server on ${PORT}`));
