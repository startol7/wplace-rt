// server.js
const path = require("path");
const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// 静的ファイル: /public を公開（/ で index.html が出る）
app.use(express.static(path.join(__dirname, "public")));

let pixels = {}; // 簡易メモリ保持

wss.on("connection", (ws) => {
  // 初期状態を送る
  ws.send(JSON.stringify({ type: "init", pixels }));

  ws.on("message", (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === "draw") {
        pixels[`${data.x},${data.y}`] = data.color;
        // 全員へブロードキャスト
        wss.clients.forEach((client) => {
          if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
          }
        });
      }
    } catch (e) {
      console.error("WS message error:", e);
    }
  });
});

// Render が指定する PORT 環境変数で待ち受ける（必須）
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
