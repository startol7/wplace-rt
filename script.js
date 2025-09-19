// ===================================
// TePlace - Working Version
// ===================================

// ----------------------------
// 設定
// ----------------------------
const TILE_SIZE = 0.0005;
const COOLDOWN = 5; // 5秒
const DEFAULT_COLOR = '#ff4b4b';
const COUNTRIES = [
  {code:'JP',name:'Japan'},
  {code:'US',name:'United States'},
  {code:'KR',name:'Korea'},
  {code:'CN',name:'China'},
  {code:'GB',name:'United Kingdom'},
  {code:'FR',name:'France'},
  {code:'DE',name:'Germany'},
  {code:'BR',name:'Brazil'},
  {code:'IN',name:'India'},
  {code:'RU',name:'Russia'},
  {code:'CA',name:'Canada'},
  {code:'AU',name:'Australia'}
];

// ----------------------------
// グローバル変数
// ----------------------------
let map = null;
let layerTiles = null;
let currentCountry = localStorage.getItem('selectedCountry') || 'Japan';
let currentColor = localStorage.getItem('selectedColor') || DEFAULT_COLOR;
let lastPaintAt = 0;
let cooldownTimer = null;
let db = null;
let firebaseReady = false;
let unsubRanking = null;
const isMobile = window.innerWidth <= 768;

// ----------------------------
// ユーティリティ関数
// ----------------------------
const snap = (value) => Math.floor(value / TILE_SIZE) * TILE_SIZE;
const getTileKey = (lat, lng) => `${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;

function isInCooldown() {
  return Date.now() - lastPaintAt < COOLDOWN * 1000;
}

// ----------------------------
// 地図の初期化（重要）
// ----------------------------
function initMap() {
  console.log('Initializing map...');
  
  // 地図を作成
  map = L.map('map', {
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
  
  // モバイル用ズームコントロール
  if (isMobile) {
    L.control.zoom({ position: 'topleft' }).addTo(map);
  }
  
  // OpenStreetMapタイルを追加
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19,
    minZoom: 2,
    detectRetina: true,
    subdomains: ['a', 'b', 'c']
  });
  
  // エラー時のフォールバック
  tileLayer.on('tileerror', function(error) {
    console.warn('Tile error, using fallback');
    const fallbackUrl = `https://a.basemaps.cartocdn.com/light_all/${error.coords.z}/${error.coords.x}/${error.coords.y}.png`;
    error.tile.src = fallbackUrl;
  });
  
  tileLayer.addTo(map);
  console.log('Tile layer added');
  
  // 描画用レイヤー
  layerTiles = L.layerGroup().addTo(map);
  console.log('Paint layer added');
  
  // マップサイズを調整
  setTimeout(() => {
    map.invalidateSize();
    console.log('Map resized');
  }, 500);
  
  // マップクリックイベント
  map.on('click', handleMapClick);
}

// ----------------------------
// タイル描画
// ----------------------------
function drawTile(lat, lng, color) {
  const lat0 = snap(lat);
  const lng0 = snap(lng);
  
  const rect = L.rectangle(
    [[lat0, lng0], [lat0 + TILE_SIZE, lng0 + TILE_SIZE]],
    {
      color: color,
      fillColor: color,
      fillOpacity: 0.6,
      weight: 1,
      interactive: false
    }
  );
  
  rect.addTo(layerTiles);
  return rect;
}

// ----------------------------
// マップクリック処理
// ----------------------------
function handleMapClick(e) {
  // クールダウンチェック
  if (isInCooldown()) {
    const remaining = Math.ceil((COOLDOWN * 1000 - (Date.now() - lastPaintAt)) / 1000);
    showToast(`Wait ${remaining} seconds`);
    return;
  }
  
  const lat = e.latlng.lat;
  const lng = e.latlng.lng;
  const color = getCurrentColor();
  
  // ローカルで描画
  drawTile(lat, lng, color);
  
  // 振動フィードバック
  if (isMobile && navigator.vibrate) {
    navigator.vibrate(20);
  }
  
  // Firebaseに保存
  if (firebaseReady) {
    saveTileToFirebase(lat, lng, color);
  }
  
  // セッションカウンター更新
  const sessionTiles = parseInt(sessionStorage.getItem('sessionTiles') || '0');
  sessionStorage.setItem('sessionTiles', String(sessionTiles + 1));
  updateMyTilesDisplay(sessionTiles + 1);
  
  // クールダウン開始
  lastPaintAt = Date.now();
  startCooldown(COOLDOWN);
}

// ----------------------------
// Firebase
// ----------------------------
async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js');
    const { getFirestore, collection, doc, setDoc, onSnapshot, query, orderBy, limit, serverTimestamp, increment } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
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
    db = getFirestore(app);
    firebaseReady = true;
    
    console.log('Firebase initialized');
    
    // タイルを購読
    subscribeToTiles();
    
    // ランキングを購読
    subscribeToRanking();
    
    showToast('Connected');
  } catch (error) {
    console.warn('Firebase init failed:', error);
    showToast('Offline mode');
  }
}

async function saveTileToFirebase(lat, lng, color) {
  if (!firebaseReady) return;
  
  try {
    const { doc, setDoc, serverTimestamp, increment } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const key = getTileKey(lat, lng);
    const sessionId = getSessionId();
    
    // タイルを保存
    await setDoc(doc(db, 'tiles', key), {
      key,
      lat: snap(lat),
      lng: snap(lng),
      color,
      country: currentCountry,
      sessionId,
      ts: serverTimestamp()
    }, { merge: true });
    
    // スコア更新
    updateScores();
  } catch (error) {
    console.warn('Save failed:', error);
  }
}

async function updateScores() {
  if (!firebaseReady) return;
  
  try {
    const { doc, setDoc, increment } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const periods = getPeriodKeys();
    
    // 各期間のスコアを更新
    await Promise.all([
      setDoc(doc(db, 'scores', periods.today, 'countries', currentCountry), 
        { count: increment(1) }, { merge: true }),
      setDoc(doc(db, 'scores', periods.week, 'countries', currentCountry), 
        { count: increment(1) }, { merge: true }),
      setDoc(doc(db, 'scores', periods.month, 'countries', currentCountry), 
        { count: increment(1) }, { merge: true }),
      setDoc(doc(db, 'scores', 'alltime', 'countries', currentCountry), 
        { count: increment(1) }, { merge: true })
    ]);
  } catch (error) {
    console.warn('Score update failed:', error);
  }
}

async function subscribeToTiles() {
  if (!firebaseReady) return;
  
  try {
    const { collection, query, orderBy, limit, onSnapshot } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const q = query(collection(db, 'tiles'), orderBy('ts', 'desc'), limit(5000));
    
    onSnapshot(q, (snapshot) => {
      layerTiles.clearLayers();
      snapshot.forEach(doc => {
        const data = doc.data();
        drawTile(data.lat, data.lng, data.color);
      });
      updateTotalDisplay(snapshot.size);
    });
  } catch (error) {
    console.warn('Tiles subscription failed:', error);
  }
}

async function subscribeToRanking() {
  if (!firebaseReady) return;
  
  try {
    const { collection, query, orderBy, limit, onSnapshot } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const period = getSelectedPeriod();
    const periodKey = getPeriodKeys()[period];
    
    if (unsubRanking) unsubRanking();
    
    const q = query(
      collection(db, 'scores', periodKey, 'countries'),
      orderBy('count', 'desc'),
      limit(10)
    );
    
    unsubRanking = onSnapshot(q, (snapshot) => {
      const rankings = [];
      snapshot.forEach(doc => {
        rankings.push({
          country: doc.id,
          count: doc.data().count || 0
        });
      });
      updateRankingDisplay(rankings);
    });
  } catch (error) {
    console.warn('Ranking subscription failed:', error);
  }
}

// ----------------------------
// UI更新
// ----------------------------
function setupUI() {
  // 国選択
  const countrySelect = document.getElementById('countrySelect');
  if (countrySelect) {
    COUNTRIES.forEach(c => {
      const option = document.createElement('option');
      option.value = c.name;
      option.textContent = c.name;
      countrySelect.appendChild(option);
    });
    countrySelect.value = currentCountry;
    
    countrySelect.addEventListener('change', (e) => {
      currentCountry = e.target.value;
      localStorage.setItem('selectedCountry', currentCountry);
    });
  }
  
  // カラー同期
  setupColorControls();
  
  // イベントリスナー
  setupEventListeners();
  
  // オンラインカウンター
  startOnlineCounter();
  
  // 初期値表示
  updateMyTilesDisplay(parseInt(sessionStorage.getItem('sessionTiles') || '0'));
}

function setupColorControls() {
  const colorPicker = document.getElementById('colorPicker');
  const colorHex = document.getElementById('colorHex');
  const mobileColorPicker = document.getElementById('mobileColorPicker');
  
  const syncColors = (color) => {
    const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : DEFAULT_COLOR;
    currentColor = validColor;
    localStorage.setItem('selectedColor', validColor);
    
    if (colorPicker) colorPicker.value = validColor;
    if (colorHex) colorHex.value = validColor;
    if (mobileColorPicker) mobileColorPicker.value = validColor;
  };
  
  if (colorPicker) {
    colorPicker.value = currentColor;
    colorPicker.addEventListener('input', e => syncColors(e.target.value));
  }
  if (colorHex) {
    colorHex.value = currentColor;
    colorHex.addEventListener('input', e => syncColors(e.target.value));
  }
  if (mobileColorPicker) {
    mobileColorPicker.value = currentColor;
    mobileColorPicker.addEventListener('input', e => syncColors(e.target.value));
  }
}

function setupEventListeners() {
  // モバイルタブ
  document.querySelectorAll('.mobile-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      
      document.querySelectorAll('.mobile-section').forEach(s => s.classList.remove('active'));
      const section = document.getElementById(`section-${tab.dataset.tab}`);
      if (section) section.classList.add('active');
    });
  });
  
  // 期間選択（デスクトップ）
  document.querySelectorAll('.seg-btn[data-period]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.seg-btn[data-period]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      subscribeToRanking();
    });
  });
  
  // 期間選択（モバイル）
  document.querySelectorAll('.period-btn[data-period-mobile]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn[data-period-mobile]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      subscribeToRanking();
    });
  });
}

function getCurrentColor() {
  return currentColor;
}

function getSelectedPeriod() {
  const desktop = document.querySelector('.seg-btn.active[data-period]');
  const mobile = document.querySelector('.period-btn.active[data-period-mobile]');
  return (desktop?.dataset.period) || (mobile?.dataset.periodMobile) || 'today';
}

function startCooldown(seconds) {
  if (cooldownTimer) clearInterval(cooldownTimer);
  
  const endTime = Date.now() + seconds * 1000;
  const cooldownEl = document.getElementById('cooldown');
  const cooldownFillEl = document.getElementById('cooldownFill');
  const cooldownTextEl = document.getElementById('cooldownText');
  const cooldownMobileEl = document.getElementById('cooldownMobile');
  const cooldownFillMobileEl = document.getElementById('cooldownFillMobile');
  const cooldownTextMobileEl = document.getElementById('cooldownTextMobile');
  
  if (cooldownEl) cooldownEl.classList.remove('hidden');
  if (cooldownMobileEl) cooldownMobileEl.classList.remove('hidden');
  
  cooldownTimer = setInterval(() => {
    const remaining = endTime - Date.now();
    
    if (remaining <= 0) {
      if (cooldownFillEl) cooldownFillEl.style.width = '0%';
      if (cooldownFillMobileEl) cooldownFillMobileEl.style.width = '0%';
      if (cooldownTextEl) cooldownTextEl.textContent = 'Ready';
      if (cooldownTextMobileEl) cooldownTextMobileEl.textContent = 'Ready!';
      if (cooldownEl) cooldownEl.classList.add('hidden');
      if (cooldownMobileEl) cooldownMobileEl.classList.add('hidden');
      clearInterval(cooldownTimer);
      cooldownTimer = null;
      return;
    }
    
    const secondsLeft = Math.ceil(remaining / 1000);
    const progress = ((seconds * 1000 - remaining) / (seconds * 1000) * 100) + '%';
    
    if (cooldownFillEl) cooldownFillEl.style.width = progress;
    if (cooldownFillMobileEl) cooldownFillMobileEl.style.width = progress;
    if (cooldownTextEl) cooldownTextEl.textContent = secondsLeft + 's';
    if (cooldownTextMobileEl) cooldownTextMobileEl.textContent = secondsLeft + 's';
  }, 100);
}

function updateRankingDisplay(data) {
  const html = data.length === 0 ? 
    '<li>No data yet</li>' :
    data.map((item, i) => 
      `<li><span>${i + 1}. ${item.country}</span><strong>${item.count}</strong></li>`
    ).join('');
  
  const rankingList = document.getElementById('rankingList');
  const rankingListMobile = document.getElementById('rankingListMobile');
  
  if (rankingList) rankingList.innerHTML = html;
  if (rankingListMobile) rankingListMobile.innerHTML = html;
}

function updateTotalDisplay(count) {
  const statTotal = document.getElementById('statTotal');
  const statTotalMobile = document.getElementById('statTotalMobile');
  
  if (statTotal) statTotal.textContent = count;
  if (statTotalMobile) statTotalMobile.textContent = count;
}

function updateMyTilesDisplay(count) {
  const statMine = document.getElementById('statMine');
  const statMineMobile = document.getElementById('statMineMobile');
  
  if (statMine) statMine.textContent = count;
  if (statMineMobile) statMineMobile.textContent = count;
}

function startOnlineCounter() {
  const updateOnline = () => {
    const count = Math.floor(200 + Math.random() * 600);
    const statOnline = document.getElementById('statOnline');
    const statOnlineMobile = document.getElementById('statOnlineMobile');
    
    if (statOnline) statOnline.textContent = count;
    if (statOnlineMobile) statOnlineMobile.textContent = count;
  };
  
  setInterval(updateOnline, 8000);
  updateOnline();
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
// ヘルパー関数
// ----------------------------
function getPeriodKeys() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  const week = getWeekNumber(now);
  
  return {
    today: `day-${year}-${month}-${day}`,
    week: `week-${year}-W${week}`,
    month: `month-${year}-${month}`
  };
}

function getWeekNumber(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return String(weekNum).padStart(2, '0');
}

function getSessionId() {
  let sessionId = sessionStorage.getItem('sessionId');
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('sessionId', sessionId);
  }
  return sessionId;
}

// ----------------------------
// 初期化（重要：DOMContentLoadedを使用）
// ----------------------------
window.addEventListener('DOMContentLoaded', () => {
  console.log('Starting TePlace...');
  
  // 1. 地図を初期化
  initMap();
  
  // 2. UIを設定
  setupUI();
  
  // 3. Firebaseを初期化
  initFirebase();
  
  console.log('TePlace ready!');
});

// ウィンドウリサイズ対応
window.addEventListener('resize', () => {
  if (map) {
    setTimeout(() => map.invalidateSize(), 200);
  }
});