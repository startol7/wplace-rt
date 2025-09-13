/***** (既存) ここまでにあなたのゲームロジックがある想定 *****/
/* 例：国データ、initMap(), initializeGame(), updateStats() など
   - updateStats() 内で onlineUsers をランダムに更新していたら、その行は削除してください
   - setInterval で onlineUsers を変えていた処理も削除してください
*/

/***** Firebase Presence の追加 *****/
// Firebase グローバル（CDN）の利用を想定
// window.firebase が存在する前提（index.html でSDKとconfig読込済み）
const db = firebase.database();
const auth = firebase.auth();

/**
 * Presence を開始：
 * - 匿名ログイン
 * - /status/{uid} にオンライン/オフラインを書き分け
 * - /status を購読してオンライン人数を集計
 */
function startPresence() {
  // 匿名ログイン
  auth.signInAnonymously().catch(console.error);

  auth.onAuthStateChanged((user) => {
    if (!user) return;
    const uid = user.uid;

    // 接続状態の監視
    const connectedRef = db.ref('.info/connected');
    connectedRef.on('value', (snap) => {
      if (snap.val() === true) {
        const userStatusRef = db.ref(`/status/${uid}`);

        // オンライン時の情報
        const onlineData = {
          state: 'online',
          last_changed: firebase.database.ServerValue.TIMESTAMP
        };

        // 切断時に自動で offline を書き込む
        userStatusRef.onDisconnect().set({
          state: 'offline',
          last_changed: firebase.database.ServerValue.TIMESTAMP
        }).then(() => {
          userStatusRef.set(onlineData);
        });
      }
    });

    // 全ユーザーの status を購読し、"online" の数をカウント
    const statusRef = db.ref('/status');
    statusRef.on('value', (snapshot) => {
      let onlineCount = 0;
      snapshot.forEach((child) => {
        const v = child.val();
        if (v && v.state === 'online') onlineCount++;
      });
      const el = document.getElementById('onlineUsers');
      if (el) el.textContent = onlineCount;
    });
  });
}

/***** 起動順のポイント *****/
/* 必ず：
   1) DOM 構築（select, #onlineUsers 等が存在）
   2) Firebase init（index.html側ですでに完了）
   3) presence開始
   4) 地図とゲームの初期化
*/
document.addEventListener('DOMContentLoaded', () => {
  try {
    // 1) 国セレクト生成やUI初期化（あなたの関数）
    if (typeof populateCountrySelect === 'function') {
      populateCountrySelect();
    }

    // 2) Presence を開始（最初にオンライン人数が0でもOK。接続後に更新されます）
    startPresence();

    // 3) 地図初期化とゲーム開始（あなたの関数）
    if (typeof initMap === 'function' && initMap()) {
      if (typeof initializeGame === 'function') initializeGame();

      // 以降は必要に応じて…
      if (typeof updateStats === 'function') updateStats();
      // setInterval(() => updateHotspot(), 15000); などあなたの既存処理
    }
  } catch (err) {
    console.error(err);
    // 画面にトーストがあるなら：
    const el = document.getElementById('notification');
    if (el) {
      el.textContent = 'Startup error: ' + (err.message || err);
      el.className = 'notification show';
      setTimeout(() => el.classList.remove('show'), 3000);
    }
  }
});
