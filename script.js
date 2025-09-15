// ----------------------------
// 0. 国リスト & 初期設定
// ----------------------------
const COUNTRY_LIST = [
  {code:'JP',name:'Japan'},{code:'US',name:'United States'},{code:'KR',name:'Korea'},
  {code:'CN',name:'China'},{code:'GB',name:'United Kingdom'},{code:'FR',name:'France'},
  {code:'DE',name:'Germany'},{code:'BR',name:'Brazil'},{code:'IN',name:'India'},
  {code:'RU',name:'Russia'},{code:'CA',name:'Canada'},{code:'AU',name:'Australia'}
];

// 国選択のセットアップ
const countrySel = document.getElementById('countrySelect');
if (countrySel) {
  COUNTRY_LIST.forEach(c => {
    const option = document.createElement('option');
    option.value = c.name;
    option.textContent = c.name;
    countrySel.appendChild(option);
  });
  
  // 保存された国を読み込み
  let currentCountry = localStorage.getItem('selectedCountry') || 'Japan';
  countrySel.value = currentCountry;
  
  countrySel.addEventListener('change', () => {
    currentCountry = countrySel.value;
    localStorage.setItem('selectedCountry', currentCountry);
  });
}

// グローバル変数
let currentCountry = localStorage.getItem('selectedCountry') || 'Japan';
let brushSize = 1;
let lastPaintAt = 0;
let cooldownTimer = null;
let auth = null, db = null, user = null, firebaseReady = false;
let unsubRanking = null;

// ----------------------------
// 1. Leaflet Map Setup - 重要: 地図を確実に表示
// ----------------------------
console.log('Initializing map...');

const isMobile = window.innerWidth <= 768;

// マップ初期化
const map = L.map('map', {
  center: [35.6762, 139.6503],
  zoom: isMobile ? 5 : 6,
  worldCopyJump: true,
  zoomControl: !isMobile,
  tap: true,
  touchZoom: true,
  dragging: true,
  scrollWheelZoom: true,
  doubleClickZoom: true
});

console.log('Map created:', map);

// モバイルのズームコントロール
if (isMobile) {
  L.control.zoom({ position: 'topleft' }).addTo(map);
}

// タイルレイヤーの追加（複数のプロバイダーで冗長性確保）
let tileLayer = null;

function addMapTiles() {
  // OpenStreetMapタイル
  tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    minZoom: 2,
    detectRetina: true,
    subdomains: ['a', 'b', 'c']
  });
  
  // エラーハンドリング
  tileLayer.on('tileerror', function(error) {
    console.warn('Tile error, trying fallback:', error.tile);
    // CARTOにフォールバック
    const fallbackUrl = `https://${['a','b','c','d'][Math.floor(Math.random()*4)]}.basemaps.cartocdn.com/light_all/${error.coords.z}/${error.coords.x}/${error.coords.y}.png`;
    error.tile.src = fallbackUrl;
  });
  
  tileLayer.addTo(map);
  console.log('Tile layer added');
}

// タイルレイヤー追加
addMapTiles();

// 描画用レイヤーグループ
const layerTiles = L.layerGroup().addTo(map);
console.log('Tile layer group added');

// マップのリサイズを確実に実行
setTimeout(() => {
  map.invalidateSize();
  console.log('Map resized');
}, 500);

// ----------------------------
// 2. タイルサイズ（固定）
// ----------------------------
const TILE_SIZE = 0.0005; // 固定サイズ

// タイル位置のスナップ
const snap = (value) => Math.floor(value / TILE_SIZE) * TILE_SIZE;
const keyFromLatLng = (lat, lng) => `${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;

// タイル作成関数
function createTileRectangle(lat, lng, color) {
  const lat0 = snap(lat);
  const lng0 = snap(lng);
  
  return L.rectangle(
    [[lat0, lng0], [lat0 + TILE_SIZE, lng0 + TILE_SIZE]],
    {
      color: color,
      fillColor: color,
      fillOpacity: 0.6,
      weight: 1,
      interactive: false // クリックを透過
    }
  );
}

// ----------------------------
// 3. ブラシ & カラー設定
// ----------------------------

// デスクトップブラシサイズ
document.querySelectorAll('.seg-btn[data-brush]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-brush]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    brushSize = Number(btn.dataset.brush);
    updateBrushIndicator();
  });
});

// モバイルブラシサイズ
document.querySelectorAll('.seg-btn[data-brush-mobile]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-brush-mobile]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    brushSize = Number(btn.dataset.brushMobile);
    updateBrushIndicator();
  });
});

function updateBrushIndicator() {
  const indicator = document.querySelector('.brush-indicator');
  if (indicator) {
    indicator.textContent = `${brushSize}×${brushSize}`;
  }
}

// カラーピッカー要素
const colorElements = {
  picker: document.getElementById('colorPicker'),
  hex: document.getElementById('colorHex'),
  mobilePicker: document.getElementById('mobileColorPicker'),
  mobilePickerAlt: document.getElementById('colorPickerMobile'),
  mobileHex: document.getElementById('colorHexMobile')
};

// カラー同期関数
function syncAllColors(color) {
  const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : 
                     /^[0-9a-fA-F]{6}$/.test(color) ? '#' + color : '#ff4b4b';
  
  Object.values(colorElements).forEach(el => {
    if (el && el.type === 'color') el.value = validColor;
    if (el && el.type === 'text') el.value = validColor;
  });
  
  // プリセットカラーのアクティブ状態更新
  document.querySelectorAll('.color-preset').forEach(preset => {
    preset.classList.toggle('active', preset.dataset.color === validColor);
  });
}

// カラー入力イベント
Object.values(colorElements).forEach(el => {
  if (el) {
    el.addEventListener('input', (e) => syncAllColors(e.target.value));
  }
});

// カラープリセット
document.querySelectorAll('.color-preset').forEach(preset => {
  preset.addEventListener('click', () => {
    syncAllColors(preset.dataset.color);
  });
});

// ----------------------------
// 4. クールダウンシステム
// ----------------------------
const COOLDOWN_TIMES = { 1: 10, 2: 40, 3: 90 };

function startCooldown(seconds) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  
  const endTime = Date.now() + seconds * 1000;
  
  // UI要素取得
  const elements = {
    desktop: {
      wrap: document.getElementById('cooldown'),
      fill: document.getElementById('cooldownFill'),
      text: document.getElementById('cooldownText')
    },
    mobile: {
      wrap: document.getElementById('cooldownMobile'),
      fill: document.getElementById('cooldownFillMobile'),
      text: document.getElementById('cooldownTextMobile')
    }
  };
  
  // クールダウン表示
  if (elements.desktop.wrap) elements.desktop.wrap.classList.remove('hidden');
  if (elements.mobile.wrap) elements.mobile.wrap.classList.remove('hidden');
  
  cooldownTimer = setInterval(() => {
    const remaining = endTime - Date.now();
    
    if (remaining <= 0) {
      // クールダウン終了
      Object.values(elements).forEach(group => {
        if (group.fill) group.fill.style.width = '0%';
        if (group.text) group.text.textContent = 'Ready';
        if (group.wrap) group.wrap.classList.add('hidden');
      });
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      return;
    }
    
    const secondsLeft = Math.ceil(remaining / 1000);
    const progress = ((seconds * 1000 - remaining) / (seconds * 1000) * 100) + '%';
    
    Object.values(elements).forEach(group => {
      if (group.fill) group.fill.style.width = progress;
      if (group.text) group.text.textContent = secondsLeft + 's';
    });
  }, 100);
}

function isInCooldown() {
  return Date.now() - lastPaintAt < COOLDOWN_TIMES[brushSize] * 1000;
}

// ----------------------------
// 5. 地図クリックで描画
// ----------------------------
map.on('click', async (e) => {
  // クールダウンチェック
  if (isInCooldown()) {
    const remaining = Math.ceil((COOLDOWN_TIMES[brushSize] * 1000 - (Date.now() - lastPaintAt)) / 1000);
    showToast(`Please wait ${remaining} seconds`);
    return;
  }
  
  // 現在の色を取得
  const currentColor = colorElements.picker?.value || 
                       colorElements.mobilePicker?.value || 
                       '#ff4b4b';
  
  // 基準位置
  const baseLat = snap(e.latlng.lat);
  const baseLng = snap(e.latlng.lng);
  
  // タイルを描画
  const paintedTiles = [];
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const lat = baseLat + dy * TILE_SIZE;
      const lng = baseLng + dx * TILE_SIZE;
      
      const rect = createTileRectangle(lat, lng, currentColor);
      rect.addTo(layerTiles);
      
      paintedTiles.push({ lat, lng });
    }
  }
  
  // ビジュアルフィードバック
  if (isMobile && navigator.vibrate) {
    navigator.vibrate(30);
  }
  
  // Firebaseに保存（ログイン時のみ）
  if (firebaseReady && user) {
    saveTilesToFirebase(paintedTiles, currentColor);
  }
  
  // クールダウン開始
  lastPaintAt = Date.now();
  startCooldown(COOLDOWN_TIMES[brushSize]);
});

// ----------------------------
// 6. Firebase設定
// ----------------------------
async function initializeFirebase() {
  if (firebaseReady) return true;
  
  try {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
    ]);
    
    const { initializeApp } = appModule;
    const { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, signInAnonymously } = authModule;
    const { getFirestore, collection, doc, onSnapshot, query, orderBy, limit } = firestoreModule;
    
    // Firebase設定
    const firebaseConfig = {
      apiKey: "AIzaSyA2IxeqJxFZzlmuqu0n4W3wXa2VpzZISBE",
      authDomain: "wwplace-b6a86.firebaseapp.com",
      projectId: "wwplace-b6a86",
      storageBucket: "wwplace-b6a86.firebasestorage.app",
      messagingSenderId: "1005360971581",
      appId: "1:1005360971581:web:3f23bdb25cdac844050f54",
      measurementId: "G-4F90EG7W7N"
    };
    
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    
    await setPersistence(auth, browserLocalPersistence);
    
    // 認証状態の監視
    onAuthStateChanged(auth, (u) => {
      user = u;
      updateAuthUI();
      subscribeToData();
      if (u) showToast('Signed in');
    });
    
    // 自動匿名ログイン
    try {
      await signInAnonymously(auth);
    } catch (e) {
      console.log('Auto sign-in skipped');
    }
    
    // タイルデータの購読
    onSnapshot(
      query(collection(db, 'tiles'), orderBy('ts', 'desc'), limit(5000)),
      (snapshot) => {
        layerTiles.clearLayers();
        snapshot.forEach(doc => {
          const data = doc.data();
          const rect = createTileRectangle(data.lat, data.lng, data.color);
          rect.addTo(layerTiles);
        });
        updateStats(snapshot.size);
      }
    );
    
    firebaseReady = true;
    return true;
  } catch (error) {
    console.warn('Firebase init failed:', error);
    showToast('Offline mode - drawings won\'t be saved');
    return false;
  }
}

// Firebase保存関数
async function saveTilesToFirebase(tiles, color) {
  if (!firebaseReady || !user) return;
  
  try {
    const { doc, setDoc, serverTimestamp, increment } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const operations = tiles.map(tile => {
      const key = keyFromLatLng(tile.lat, tile.lng);
      return setDoc(doc(db, 'tiles', key), {
        key,
        lat: tile.lat,
        lng: tile.lng,
        color,
        country: currentCountry,
        uid: user.uid,
        ts: serverTimestamp()
      }, { merge: true });
    });
    
    await Promise.all(operations);
    
    // スコア更新
    const period = getPeriodKeys();
    await Promise.all([
      setDoc(doc(db, 'scores', period.today, 'countries', currentCountry), 
        { count: increment(tiles.length) }, { merge: true }),
      setDoc(doc(db, 'scores', period.week, 'countries', currentCountry), 
        { count: increment(tiles.length) }, { merge: true }),
      setDoc(doc(db, 'scores', period.month, 'countries', currentCountry), 
        { count: increment(tiles.length) }, { merge: true })
    ]);
  } catch (error) {
    console.warn('Save error:', error);
  }
}

// ----------------------------
// 7. UI更新関数
// ----------------------------
function updateAuthUI() {
  const signInBtn = document.getElementById('signInBtn');
  const signOutBtn = document.getElementById('signOutBtn');
  
  if (signInBtn) signInBtn.classList.toggle('hidden', !!user);
  if (signOutBtn) signOutBtn.classList.toggle('hidden', !user);
}

function updateStats(totalCount) {
  ['statTotal', 'statTotalMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = totalCount;
  });
}

function subscribeToData() {
  subscribeToRanking();
  subscribeToUserStats();
}

function subscribeToUserStats() {
  if (!firebaseReady || !user) {
    ['statMine', 'statMineMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '0';
    });
    return;
  }
  
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({ doc, onSnapshot }) => {
    onSnapshot(doc(db, 'stats', `user-${user.uid}`), snapshot => {
      const count = snapshot.exists() ? (snapshot.data().mine || 0) : 0;
      ['statMine', 'statMineMobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = count;
      });
    });
  });
}

function subscribeToRanking() {
  if (!firebaseReady) return;
  if (unsubRanking) unsubRanking();
  
  const period = document.querySelector('.seg-btn.active[data-period]')?.dataset.period || 
                 document.querySelector('.seg-btn.active[data-period-mobile]')?.dataset.periodMobile || 
                 'today';
  
  const key = getPeriodKeys()[period];
  
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({ collection, query, orderBy, limit, onSnapshot }) => {
    unsubRanking = onSnapshot(
      query(collection(db, 'scores', key, 'countries'), orderBy('count', 'desc'), limit(10)),
      snapshot => {
        const html = snapshot.empty ? '<li>No data yet</li>' :
          snapshot.docs.map((doc, i) => 
            `<li><span>${i + 1}. ${doc.id}</span><strong>${doc.data().count || 0}</strong></li>`
          ).join('');
        
        ['rankingList', 'rankingListMobile'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = html;
        });
      }
    );
  });
}

// ----------------------------
// 8. ユーティリティ関数
// ----------------------------
function getPeriodKeys() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const week = getWeekNumber(now);
  
  return {
    today: `today-${y}${m}${d}`,
    week: `week-${y}-${week}`,
    month: `month-${y}${m}`
  };
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil(((d - yearStart) / 86400000 + 1) / 7)).padStart(2, '0');
}

function showToast(message) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// ----------------------------
// 9. イベントリスナー設定
// ----------------------------

// サインインボタン
const signInBtn = document.getElementById('signInBtn');
if (signInBtn) {
  signInBtn.addEventListener('click', async () => {
    try {
      if (!firebaseReady) await initializeFirebase();
      const { signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signInAnonymously(auth);
    } catch (error) {
      showToast('Sign in failed');
    }
  });
}

// サインアウトボタン
const signOutBtn = document.getElementById('signOutBtn');
if (signOutBtn) {
  signOutBtn.addEventListener('click', async () => {
    try {
      if (!firebaseReady) return;
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signOut(auth);
      showToast('Signed out');
    } catch (error) {
      showToast('Sign out failed');
    }
  });
}

// ランキング期間ボタン
document.querySelectorAll('.seg-btn[data-period], .seg-btn[data-period-mobile]').forEach(btn => {
  btn.addEventListener('click', () => {
    const isPeriod = btn.dataset.period;
    const selector = isPeriod ? '[data-period]' : '[data-period-mobile]';
    
    document.querySelectorAll(`.seg-btn${selector}`).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    subscribeToRanking();
  });
});

// モバイルタブ切り替え
document.querySelectorAll('.mobile-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    document.querySelectorAll('.mobile-section').forEach(s => s.classList.remove('active'));
    const section = document.getElementById(`section-${tab.dataset.tab}`);
    if (section) section.classList.add('active');
  });
});

// モバイル期間ボタン
document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    subscribeToRanking();
  });
});.classList.add('expanded');
      bottomSheet.style.height = '60vh';
    } else {
      bottomSheet.classList.remove('expanded');
      bottomSheet.style.height = '180px';
    }
  });
}

// オンライン人数（ダミー）
function updateOnlineCount() {
  const count = Math.floor(200 + Math.random() * 600);
  ['statOnline', 'statOnlineMobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = count;
  });
}
setInterval(updateOnlineCount, 8000);
updateOnlineCount();

// ウィンドウリサイズ
window.addEventListener('resize', () => {
  clearTimeout(window.resizeTimer);
  window.resizeTimer = setTimeout(() => {
    map.invalidateSize();
  }, 250);
});

// ----------------------------
// 10. 初期化
// ----------------------------
console.log('Starting initialization...');

// Firebaseを初期化
initializeFirebase();

// 地図が確実に表示されるように再度リサイズ
window.addEventListener('load', () => {
  setTimeout(() => {
    map.invalidateSize();
    console.log('Final map resize on load');
  }, 1000);
});

console.log('TePlace initialized successfully');