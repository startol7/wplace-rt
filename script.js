// ----------------------------
// 0. 国リスト & 初期設定
// ----------------------------
const COUNTRY_LIST = [
  {code:'JP',name:'Japan'},{code:'US',name:'United States'},{code:'KR',name:'Korea'},
  {code:'CN',name:'China'},{code:'GB',name:'United Kingdom'},{code:'FR',name:'France'},
  {code:'DE',name:'Germany'},{code:'BR',name:'Brazil'},{code:'IN',name:'India'},
  {code:'RU',name:'Russia'},{code:'CA',name:'Canada'},{code:'AU',name:'Australia'}
];

const countrySel = document.getElementById('countrySelect');
COUNTRY_LIST.forEach(c => {
  const o = document.createElement('option');
  o.value = c.name; 
  o.textContent = c.name;
  countrySel.append(o);
});

// Load saved country or default
let currentCountry = localStorage.getItem('selectedCountry') || 'Japan';
countrySel.value = currentCountry;
countrySel.addEventListener('change', ()=> {
  currentCountry = countrySel.value;
  localStorage.setItem('selectedCountry', currentCountry);
});

// ----------------------------
// 1. Leaflet Map Setup
// ----------------------------
const isMobile = window.innerWidth <= 768;
const map = L.map('map', { 
  worldCopyJump: true,
  zoomControl: !isMobile,
  tap: true,
  touchZoom: true,
  dragging: true
}).setView([35.6762, 139.6503], isMobile ? 5 : 6);

// Add zoom control for mobile in top-left
if (isMobile) {
  L.control.zoom({ position: 'topleft' }).addTo(map);
}

const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© OpenStreetMap',
  maxZoom: 19,
  detectRetina: true,
  subdomains: 'abc'
});
osm.on('tileerror', e => console.error('OSM tile error:', e));
osm.addTo(map);

// Ensure map renders properly
setTimeout(() => map.invalidateSize(), 150);

const layerTiles = L.layerGroup().addTo(map);

// ----------------------------
// 2. タイルサイズ
// ----------------------------
let TILE = parseFloat(localStorage.getItem('tile') || '0.0005');
const tileInput = document.getElementById('tileCustom');
if (tileInput) tileInput.value = TILE;

// Desktop tile size buttons
document.querySelectorAll('.seg-btn[data-tile]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-tile]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setTile(parseFloat(b.dataset.tile));
  });
});

// Mobile tile size buttons
document.querySelectorAll('.seg-btn[data-tile-mobile]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-tile-mobile]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    setTile(parseFloat(b.dataset.tileMobile));
  });
});

const applyBtn = document.getElementById('tileApply');
if (applyBtn) {
  applyBtn.addEventListener('click', () => {
    const v = parseFloat(tileInput.value);
    if (!isFinite(v) || v <= 0) { 
      toast('Invalid tile size'); 
      return; 
    }
    setTile(v);
  });
}

function setTile(v) {
  TILE = v;
  localStorage.setItem('tile', String(v));
  console.log('TILE set ->', TILE);
}

const snap = v => Math.floor(v / TILE) * TILE;
const keyFromLatLng = (lat, lng) => `${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;
const rectFor = (lat, lng, color) => {
  const lat0 = snap(lat), lng0 = snap(lng);
  return L.rectangle([[lat0, lng0], [lat0 + TILE, lng0 + TILE]], {
    color, 
    fillColor: color, 
    fillOpacity: 0.5, 
    weight: 1
  });
};

// ----------------------------
// 3. ブラシ & 色
// ----------------------------
let brushSize = 1;

// Desktop brush buttons
document.querySelectorAll('.seg-btn[data-brush]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-brush]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    brushSize = Number(b.dataset.brush);
    updateMobileBrushIndicator();
  });
});

// Mobile brush buttons
document.querySelectorAll('.seg-btn[data-brush-mobile]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-brush-mobile]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    brushSize = Number(b.dataset.brushMobile);
    updateMobileBrushIndicator();
  });
});

function updateMobileBrushIndicator() {
  const indicator = document.querySelector('.brush-indicator');
  if (indicator) {
    indicator.textContent = `${brushSize}×${brushSize}`;
  }
}

// Color pickers
const colorPicker = document.getElementById('colorPicker');
const colorHex = document.getElementById('colorHex');
const mobileColorPicker = document.getElementById('mobileColorPicker');
const colorPickerMobile = document.getElementById('colorPickerMobile');
const colorHexMobile = document.getElementById('colorHexMobile');

// Sync all color inputs
function syncColors(value) {
  const validHex = /^#?[0-9a-fA-F]{6}$/.test(value) ? 
    (value.startsWith('#') ? value : '#' + value) : value;
  
  if (colorPicker) colorPicker.value = validHex;
  if (colorHex) colorHex.value = validHex;
  if (mobileColorPicker) mobileColorPicker.value = validHex;
  if (colorPickerMobile) colorPickerMobile.value = validHex;
  if (colorHexMobile) colorHexMobile.value = validHex;
  
  // Update active preset
  document.querySelectorAll('.color-preset').forEach(p => {
    p.classList.toggle('active', p.dataset.color === validHex);
  });
}

// Desktop color controls
if (colorPicker) {
  colorPicker.addEventListener('input', e => syncColors(e.target.value));
}
if (colorHex) {
  colorHex.addEventListener('input', e => {
    if (/^#?[0-9a-fA-F]{6}$/.test(e.target.value)) {
      syncColors(e.target.value);
    }
  });
}

// Mobile color controls
if (mobileColorPicker) {
  mobileColorPicker.addEventListener('input', e => syncColors(e.target.value));
}
if (colorPickerMobile) {
  colorPickerMobile.addEventListener('input', e => syncColors(e.target.value));
}
if (colorHexMobile) {
  colorHexMobile.addEventListener('input', e => {
    if (/^#?[0-9a-fA-F]{6}$/.test(e.target.value)) {
      syncColors(e.target.value);
    }
  });
}

// Color presets
document.querySelectorAll('.color-preset').forEach(preset => {
  preset.addEventListener('click', () => {
    syncColors(preset.dataset.color);
  });
});

// ----------------------------
// 4. クールダウン
// ----------------------------
const BRUSH_COOLDOWN = { 1: 10, 2: 40, 3: 90 };
let lastPaintAt = 0;

const cooldownWrap = document.getElementById('cooldown');
const cooldownFill = document.getElementById('cooldownFill');
const cooldownText = document.getElementById('cooldownText');
const cooldownMobile = document.getElementById('cooldownMobile');
const cooldownFillMobile = document.getElementById('cooldownFillMobile');
const cooldownTextMobile = document.getElementById('cooldownTextMobile');

function showCooldown(sec) {
  const end = Date.now() + sec * 1000;
  
  // Show both desktop and mobile cooldowns
  if (cooldownWrap) cooldownWrap.classList.remove('hidden');
  if (cooldownMobile) cooldownMobile.classList.remove('hidden');
  
  const t = setInterval(() => {
    const left = end - Date.now();
    if (left <= 0) {
      if (cooldownFill) cooldownFill.style.width = '0%';
      if (cooldownFillMobile) cooldownFillMobile.style.width = '0%';
      if (cooldownText) cooldownText.textContent = '0s';
      if (cooldownTextMobile) cooldownTextMobile.textContent = 'Ready!';
      if (cooldownWrap) cooldownWrap.classList.add('hidden');
      if (cooldownMobile) cooldownMobile.classList.add('hidden');
      clearInterval(t);
      return;
    }
    const secLeft = Math.ceil(left / 1000);
    const progress = ((sec * 1000 - left) / (sec * 1000) * 100) + '%';
    
    if (cooldownText) cooldownText.textContent = secLeft + 's';
    if (cooldownTextMobile) cooldownTextMobile.textContent = secLeft + 's';
    if (cooldownFill) cooldownFill.style.width = progress;
    if (cooldownFillMobile) cooldownFillMobile.style.width = progress;
  }, 120);
}

const inCd = () => Date.now() - lastPaintAt < BRUSH_COOLDOWN[brushSize] * 1000;

// ----------------------------
// 5. Firebase（遅延初期化）
// ----------------------------
let auth = null, db = null, user = null, firebaseReady = false;
const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');

signInBtn.addEventListener('click', async () => {
  try {
    if (!firebaseReady) await ensureFirebaseInitialized();
    const { signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await signInAnonymously(auth);
  } catch (e) {
    console.warn('Sign-in error (guest can still draw):', e);
    toast('Could not sign in. You can still draw as guest.');
  }
});

signOutBtn.addEventListener('click', async () => {
  try {
    if (!firebaseReady) return;
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await signOut(auth);
  } catch (e) {
    console.warn('Sign-out error:', e);
  }
});

async function ensureFirebaseInitialized() {
  if (firebaseReady) return true;
  try {
    const [{ initializeApp },
           { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, signInAnonymously },
           { getFirestore, collection, doc, onSnapshot, query, orderBy, limit }]
      = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      ]);

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

    onAuthStateChanged(auth, (u) => {
      user = u || null;
      signInBtn.classList.toggle('hidden', !!u);
      signOutBtn.classList.toggle('hidden', !u);
      subscribeMine();
      subscribeRanking();
      if (u) toast('Signed in');
    });

    try { await signInAnonymously(auth); } catch (_) {}

    onSnapshot(query(collection(db, 'tiles'), orderBy('ts', 'desc'), limit(5000)), snap => {
      layerTiles.clearLayers();
      snap.forEach(s => {
        const d = s.data();
        rectFor(d.lat, d.lng, d.color).addTo(layerTiles);
      });
      updateTotalStat(snap.size);
    });

    firebaseReady = true;
    return true;
  } catch (err) {
    console.warn('[Firebase init failed] Guest-only mode:', err);
    firebaseReady = false;
    return false;
  }
}

ensureFirebaseInitialized();

// Stats subscriptions
function subscribeMine() {
  const statMine = document.getElementById('statMine');
  const statMineMobile = document.getElementById('statMineMobile');
  
  if (!firebaseReady || !user) {
    if (statMine) statMine.textContent = 0;
    if (statMineMobile) statMineMobile.textContent = 0;
    return;
  }
  
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({ doc, onSnapshot }) => {
    onSnapshot(doc(db, 'stats', `user-${user.uid}`), s => {
      const count = s.exists() ? (s.data().mine || 0) : 0;
      if (statMine) statMine.textContent = count;
      if (statMineMobile) statMineMobile.textContent = count;
    });
  });
}

function updateTotalStat(count) {
  const statTotal = document.getElementById('statTotal');
  const statTotalMobile = document.getElementById('statTotalMobile');
  if (statTotal) statTotal.textContent = count;
  if (statTotalMobile) statTotalMobile.textContent = count;
}

// Period keys
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

// Score updates
async function updateScores(n) {
  if (!firebaseReady || !user) return;
  const { doc, setDoc, increment } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const p = getPeriodKeys();
  await Promise.all([
    setDoc(doc(db, 'scores', p.today, 'countries', currentCountry), { count: increment(n) }, { merge: true }),
    setDoc(doc(db, 'scores', p.week, 'countries', currentCountry), { count: increment(n) }, { merge: true }),
    setDoc(doc(db, 'scores', p.month, 'countries', currentCountry), { count: increment(n) }, { merge: true }),
    setDoc(doc(db, 'stats', 'global'), { total: increment(n) }, { merge: true }),
    setDoc(doc(db, 'stats', `user-${user.uid}`), { mine: increment(n) }, { merge: true }),
  ]);
}

// Ranking subscriptions
let unsubRanking = null;

function subscribeRanking() {
  if (!firebaseReady) return;
  if (unsubRanking) unsubRanking();
  
  const desktopPeriod = document.querySelector('.seg-btn.active[data-period]')?.dataset.period;
  const mobilePeriod = document.querySelector('.seg-btn.active[data-period-mobile]')?.dataset.periodMobile;
  const period = desktopPeriod || mobilePeriod || 'today';
  const key = getPeriodKeys()[period];

  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({ collection, query, orderBy, limit, onSnapshot }) => {
    unsubRanking = onSnapshot(query(collection(db, 'scores', key, 'countries'), orderBy('count', 'desc'), limit(10)), snap => {
      const rankingList = document.getElementById('rankingList');
      const rankingListMobile = document.getElementById('rankingListMobile');
      
      const html = snap.empty ? '<li>No data yet</li>' : 
        Array.from(snap.docs).map((d, i) => 
          `<li><span>${i + 1}. ${d.id}</span><strong>${d.data().count || 0}</strong></li>`
        ).join('');
      
      if (rankingList) rankingList.innerHTML = html;
      if (rankingListMobile) rankingListMobile.innerHTML = html;
    });
  });
}

// Desktop period buttons
document.querySelectorAll('.seg-btn[data-period]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-period]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    subscribeRanking();
  });
});

// Mobile period buttons
document.querySelectorAll('.seg-btn[data-period-mobile]').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.seg-btn[data-period-mobile]').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    subscribeRanking();
  });
});

// Dummy online count
function updateOnlineCount() {
  const count = Math.floor(200 + Math.random() * 600);
  const statOnline = document.getElementById('statOnline');
  const statOnlineMobile = document.getElementById('statOnlineMobile');
  if (statOnline) statOnline.textContent = count;
  if (statOnlineMobile) statOnlineMobile.textContent = count;
}
setInterval(updateOnlineCount, 8000);
updateOnlineCount();

// ----------------------------
// 6. クリックで描画
// ----------------------------
map.on('click', async (e) => {
  if (inCd()) {
    const left = Math.ceil((BRUSH_COOLDOWN[brushSize] * 1000 - (Date.now() - lastPaintAt)) / 1000);
    showCooldown(left);
    return;
  }

  const color = colorPicker?.value || mobileColorPicker?.value || '#ff4b4b';
  const baseLat = snap(e.latlng.lat);
  const baseLng = snap(e.latlng.lng);

  // Local immediate paint
  for (let dy = 0; dy < brushSize; dy++) {
    for (let dx = 0; dx < brushSize; dx++) {
      const lat = baseLat + dy * TILE;
      const lng = baseLng + dx * TILE;
      rectFor(lat, lng, color).addTo(layerTiles);
    }
  }

  // Firebase save (signed in only)
  if (firebaseReady && user) {
    try {
      const { doc, setDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const ops = [];
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const lat = baseLat + dy * TILE;
          const lng = baseLng + dx * TILE;
          const key = keyFromLatLng(lat, lng);
          ops.push(setDoc(doc(db, 'tiles', key), {
            key, lat, lng, color, country: currentCountry, uid: user.uid, ts: serverTimestamp()
          }, { merge: true }));
        }
      }
      await Promise.all(ops);
      await updateScores(brushSize * brushSize);
    } catch (err) {
      console.warn('Save skipped:', err);
    }
  }

  lastPaintAt = Date.now();
  showCooldown(BRUSH_COOLDOWN[brushSize]);
});

// ----------------------------
// 7. Mobile UI Controls
// ----------------------------

// Mobile bottom sheet tabs
document.querySelectorAll('.sheet-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const targetPanel = tab.dataset.tab;
    
    // Update active tab
    document.querySelectorAll('.sheet-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    
    // Update active panel
    document.querySelectorAll('.sheet-panel').forEach(p => p.classList.remove('active'));
    const panel = document.getElementById(`panel-${targetPanel}`);
    if (panel) panel.classList.add('active');
  });
});

// Bottom sheet expand/collapse
const bottomSheet = document.querySelector('.mobile-bottom-sheet');
const sheetHandle = document.querySelector('.sheet-handle');

if (sheetHandle && bottomSheet) {
  let startY = 0;
  let startHeight = 0;
  let isDragging = false;
  
  sheetHandle.addEventListener('touchstart', (e) => {
    isDragging = true;
    startY = e.touches[0].clientY;
    startHeight = bottomSheet.offsetHeight;
    bottomSheet.style.transition = 'none';
  });
  
  document.addEventListener('touchmove', (e) => {
    if (!isDragging) return;
    const deltaY = startY - e.touches[0].clientY;
    const newHeight = Math.max(180, Math.min(window.innerHeight * 0.6, startHeight + deltaY));
    bottomSheet.style.height = newHeight + 'px';
  });
  
  document.addEventListener('touchend', () => {
    if (!isDragging) return;
    isDragging = false;
    bottomSheet.style.transition = 'height 0.3s ease';
    
    const currentHeight = bottomSheet.offsetHeight;
    if (currentHeight > 250) {
      bottomSheet.classList.add('expanded');
      bottomSheet.style.height = '60vh';
    } else {
      bottomSheet.classList.remove('expanded');
      bottomSheet.style.height = '180px';
    }
  });
}

// ----------------------------
// 8. Toast System
// ----------------------------
function toast(msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  
  const toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.textContent = msg;
  container.appendChild(toastEl);
  
  setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.remove(), 300);
  }, 2400);
}

// ----------------------------
// 9. Performance Optimizations
// ----------------------------

// Debounce map moves on mobile
let mapMoveTimeout;
map.on('movestart', () => {
  if (isMobile) {
    layerTiles.setOpacity(0.5);
  }
});

map.on('moveend', () => {
  if (isMobile) {
    clearTimeout(mapMoveTimeout);
    mapMoveTimeout = setTimeout(() => {
      layerTiles.setOpacity(1);
    }, 100);
  }
});

// Handle window resize
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    map.invalidateSize();
  }, 200);
});

// Remove double tap zoom prevention - allow normal mobile zoom
// Performance optimizations
let mapMoveTimeout;
map.on('movestart', () => {
  if (isMobile) {
    layerTiles.setOpacity(0.5);
  }
});

map.on('moveend', () => {
  if (isMobile) {
    clearTimeout(mapMoveTimeout);
    mapMoveTimeout = setTimeout(() => {
      layerTiles.setOpacity(1);
    }, 100);
  }
});

// Service Worker for PWA (optional)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => 
      console.log('Service Worker registration failed:', err)
    );
  });
}