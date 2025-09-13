:root { color-scheme: light dark; }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Roboto, Arial; }

/* ヘッダー */
.header {
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 16px;
  background: linear-gradient(180deg, #3b4fa7, #3b3f9a);
  color: #fff;
}
.logo { display:flex; align-items:center; gap:10px; font-weight:700; font-size:18px; }
.pulse { animation: pulse 2s infinite; }
@keyframes pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.1) } }
.country-selector { display:flex; align-items:center; gap:8px; }
.country-selector select { padding:6px 10px; border-radius:10px; border:none; }
.stats { display:flex; gap:12px; align-items:center; }
.stat-item { text-align:center; min-width:80px; }
.stat-value { font-size:18px; font-weight:800; }
.stat-label { opacity:.85; font-size:12px; }

/* レイアウト */
.main-container {
  display: flex;
  gap: 16px;
  height: calc(100vh - 64px); /* 画面高からヘッダーを引いた高さ */
  padding: 16px;
  background: linear-gradient(135deg, #7280ff 0%, #6b6bcb 100%);
}
#map {
  flex: 1;
  height: 100%;         /* Leaflet表示に必須 */
  min-height: 320px;    /* 念のための下限 */
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
}
.sidebar {
  width: 340px;
  min-width: 280px;
  max-width: 420px;
  height: 100%;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.panel {
  background: rgba(15, 15, 30, .75);
  color: #fff;
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 24px rgba(0,0,0,.2);
}
.panel h3 { margin: 0 0 12px; }

/* ランキング・ログ */
.leaderboard-item {
  display:flex; align-items:center; justify-content:space-between;
  gap:12px; padding:10px 12px; border-radius:10px; background:rgba(255,255,255,.05); margin-bottom:8px;
}
.rank { display:inline-grid; place-items:center; width:28px; height:28px; border-radius:50%; background:#222; color:#fff; font-weight:700; }
.rank-1 { background:#ffc107; color:#111; }
.rank-2 { background:#c0c7d1; color:#111; }
.rank-3 { background:#cd7f32; color:#111; }
.country-info { display:flex; align-items:center; gap:8px; }
.activity-item {
  padding:10px 12px; margin-bottom:10px; border-left:4px solid #888;
  background:rgba(255,255,255,.05); border-radius:10px;
}

/* 右下の操作ボタン */
.control-buttons {
  position: fixed; right: 20px; bottom: 20px; display: grid; gap: 10px;
}
.control-btn {
  width: 44px; height: 44px; border-radius: 14px; border: none; cursor: pointer;
  background: rgba(255,255,255,.9);
  box-shadow: 0 8px 24px rgba(0,0,0,.18);
  font-size: 20px;
}
.control-btn:hover { transform: translateY(-2px); }

/* クールダウン */
.cooldown-overlay {
  position: fixed; left: 50%; transform: translateX(-50%);
  bottom: 20px; display: none; gap: 12px; align-items: center;
  background: rgba(0,0,0,.65); color: #fff; padding: 10px 14px; border-radius: 12px;
}
.cooldown-overlay.active { display: flex; }
.cooldown-progress { width: 180px; height: 8px; border-radius: 999px; background: rgba(255,255,255,.25); overflow: hidden; }
.cooldown-fill { width: 0%; height: 100%; background: linear-gradient(90deg,#60a5fa,#34d399); }

/* トースト通知 */
.notification {
  position: fixed; left: 50%; transform: translateX(-50%) translateY(20px);
  top: 16px; color:#fff; padding: 10px 16px; border-radius: 10px;
  background: linear-gradient(135deg, rgba(59,130,246,.9) 0%, rgba(29,78,216,.9) 100%);
  opacity: 0; pointer-events: none; transition: .25s;
}
.notification.show { opacity: 1; transform: translateX(-50%) translateY(0); }

/* スクロール見た目 */
.sidebar::-webkit-scrollbar { width: 10px; }
.sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.25); border-radius: 999px; }
