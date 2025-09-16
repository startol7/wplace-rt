// ===================================
// TePlace - Final Production Version
// ===================================

// ----------------------------
// Configuration & Constants
// ----------------------------
const CONFIG = {
  TILE_SIZE: 0.0005,
  COOLDOWN: 5,
  DEFAULT_COLOR: '#ff4b4b',
  DEFAULT_COUNTRY: 'Japan',
  MAP_CENTER: [35.6762, 139.6503],
  MAP_ZOOM: { mobile: 5, desktop: 6 },
  COUNTRIES: [
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
  ],
  FIREBASE: {
    apiKey: "AIzaSyA2IxeqJxFZzlmuqu0n4W3wXa2VpzZISBE",
    authDomain: "wwplace-b6a86.firebaseapp.com",
    projectId: "wwplace-b6a86",
    storageBucket: "wwplace-b6a86.firebasestorage.app",
    messagingSenderId: "1005360971581",
    appId: "1:1005360971581:web:3f23bdb25cdac844050f54",
    measurementId: "G-4F90EG7W7N"
  }
};

// ----------------------------
// State Management
// ----------------------------
const state = {
  currentCountry: localStorage.getItem('selectedCountry') || CONFIG.DEFAULT_COUNTRY,
  currentColor: localStorage.getItem('selectedColor') || CONFIG.DEFAULT_COLOR,
  lastPaintAt: 0,
  cooldownTimer: null,
  auth: null,
  db: null,
  user: null,
  firebaseReady: false,
  unsubscriptions: [],
  isMobile: window.innerWidth <= 768,
  paintedTiles: new Map() // Local cache
};

// ----------------------------
// Utility Functions
// ----------------------------
const utils = {
  snap: (value) => Math.floor(value / CONFIG.TILE_SIZE) * CONFIG.TILE_SIZE,
  
  getTileKey: (lat, lng) => {
    const snapLat = utils.snap(lat);
    const snapLng = utils.snap(lng);
    return `${snapLat.toFixed(6)},${snapLng.toFixed(6)}`;
  },
  
  debounce: (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  },
  
  formatNumber: (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }
};

// ----------------------------
// Map Initialization
// ----------------------------
class MapManager {
  constructor() {
    this.map = null;
    this.tileLayer = null;
    this.paintLayer = null;
    this.init();
  }
  
  init() {
    console.log('Initializing map...');
    
    // Create map
    this.map = L.map('map', {
      center: CONFIG.MAP_CENTER,
      zoom: state.isMobile ? CONFIG.MAP_ZOOM.mobile : CONFIG.MAP_ZOOM.desktop,
      worldCopyJump: true,
      zoomControl: !state.isMobile,
      tap: true,
      touchZoom: true,
      dragging: true,
      scrollWheelZoom: !state.isMobile,
      doubleClickZoom: true
    });
    
    // Add mobile zoom control
    if (state.isMobile) {
      L.control.zoom({ position: 'topleft' }).addTo(this.map);
    }
    
    // Add tile layer
    this.addTileLayer();
    
    // Create paint layer
    this.paintLayer = L.layerGroup().addTo(this.map);
    
    // Handle click events
    this.map.on('click', this.handleMapClick.bind(this));
    
    // Ensure proper sizing
    setTimeout(() => this.map.invalidateSize(), 300);
  }
  
  addTileLayer() {
    const providers = [
      {
        url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        options: {
          attribution: '© OpenStreetMap',
          maxZoom: 19,
          subdomains: 'abc'
        }
      },
      {
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        options: {
          attribution: '© CARTO',
          maxZoom: 19,
          subdomains: 'abcd'
        }
      }
    ];
    
    let currentProvider = 0;
    
    const addProvider = () => {
      const provider = providers[currentProvider];
      this.tileLayer = L.tileLayer(provider.url, provider.options);
      
      this.tileLayer.on('tileerror', () => {
        if (currentProvider < providers.length - 1) {
          currentProvider++;
          this.map.removeLayer(this.tileLayer);
          addProvider();
        }
      });
      
      this.tileLayer.addTo(this.map);
    };
    
    addProvider();
  }
  
  handleMapClick(e) {
    gameLogic.paintTile(e.latlng.lat, e.latlng.lng);
  }
  
  drawTile(lat, lng, color) {
    const snapLat = utils.snap(lat);
    const snapLng = utils.snap(lng);
    const key = utils.getTileKey(lat, lng);
    
    // Remove existing tile if present
    const existing = state.paintedTiles.get(key);
    if (existing) {
      this.paintLayer.removeLayer(existing);
    }
    
    // Create new tile
    const rect = L.rectangle(
      [[snapLat, snapLng], [snapLat + CONFIG.TILE_SIZE, snapLng + CONFIG.TILE_SIZE]],
      {
        color: color,
        fillColor: color,
        fillOpacity: 0.6,
        weight: 1,
        interactive: false
      }
    );
    
    rect.addTo(this.paintLayer);
    state.paintedTiles.set(key, rect);
    
    return rect;
  }
  
  clearTiles() {
    this.paintLayer.clearLayers();
    state.paintedTiles.clear();
  }
}

// ----------------------------
// Game Logic
// ----------------------------
const gameLogic = {
  paintTile(lat, lng) {
    // Check cooldown
    if (this.isInCooldown()) {
      const remaining = Math.ceil((CONFIG.COOLDOWN * 1000 - (Date.now() - state.lastPaintAt)) / 1000);
      ui.showToast(`Wait ${remaining}s`, 'warning');
      return;
    }
    
    // Get current color
    const color = ui.getCurrentColor();
    
    // Draw tile locally
    mapManager.drawTile(lat, lng, color);
    
    // Haptic feedback
    if (state.isMobile && navigator.vibrate) {
      navigator.vibrate(20);
    }
    
    // Save to Firebase
    if (state.firebaseReady && state.user) {
      firebase.saveTile(lat, lng, color);
    }
    
    // Start cooldown
    state.lastPaintAt = Date.now();
    ui.startCooldown(CONFIG.COOLDOWN);
  },
  
  isInCooldown() {
    return Date.now() - state.lastPaintAt < CONFIG.COOLDOWN * 1000;
  }
};

// ----------------------------
// UI Management
// ----------------------------
const ui = {
  init() {
    this.setupCountrySelector();
    this.setupColorControls();
    this.setupEventListeners();
    this.startOnlineCounter();
  },
  
  setupCountrySelector() {
    const selector = document.getElementById('countrySelect');
    if (!selector) return;
    
    CONFIG.COUNTRIES.forEach(country => {
      const option = document.createElement('option');
      option.value = country.name;
      option.textContent = country.name;
      selector.appendChild(option);
    });
    
    selector.value = state.currentCountry;
    
    selector.addEventListener('change', (e) => {
      state.currentCountry = e.target.value;
      localStorage.setItem('selectedCountry', state.currentCountry);
    });
  },
  
  setupColorControls() {
    const elements = {
      desktop: document.getElementById('colorPicker'),
      desktopHex: document.getElementById('colorHex'),
      mobile: document.getElementById('mobileColorPicker')
    };
    
    // Set initial colors
    Object.values(elements).forEach(el => {
      if (el && el.type === 'color') el.value = state.currentColor;
      if (el && el.type === 'text') el.value = state.currentColor;
    });
    
    // Sync color changes
    const syncColors = (color) => {
      const validColor = /^#[0-9a-fA-F]{6}$/.test(color) ? color : CONFIG.DEFAULT_COLOR;
      state.currentColor = validColor;
      localStorage.setItem('selectedColor', validColor);
      
      Object.values(elements).forEach(el => {
        if (el && el.type === 'color') el.value = validColor;
        if (el && el.type === 'text') el.value = validColor;
      });
    };
    
    Object.values(elements).forEach(el => {
      if (el) {
        el.addEventListener('input', (e) => syncColors(e.target.value));
      }
    });
  },
  
  setupEventListeners() {
    // Mobile tabs
    document.querySelectorAll('.mobile-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.mobile-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        document.querySelectorAll('.mobile-section').forEach(s => s.classList.remove('active'));
        const section = document.getElementById(`section-${tab.dataset.tab}`);
        if (section) section.classList.add('active');
      });
    });
    
    // Period selectors
    document.querySelectorAll('[data-period], [data-period-mobile]').forEach(btn => {
      btn.addEventListener('click', () => {
        const selector = btn.dataset.period ? '[data-period]' : '[data-period-mobile]';
        document.querySelectorAll(selector).forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        firebase.subscribeToRanking();
      });
    });
    
    // Sign in/out buttons
    const signInBtn = document.getElementById('signInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    
    if (signInBtn) {
      signInBtn.addEventListener('click', () => firebase.signIn());
    }
    
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => firebase.signOut());
    }
    
    // Window resize
    window.addEventListener('resize', utils.debounce(() => {
      mapManager.map.invalidateSize();
      state.isMobile = window.innerWidth <= 768;
    }, 250));
  },
  
  getCurrentColor() {
    return state.currentColor;
  },
  
  startCooldown(seconds) {
    if (state.cooldownTimer) clearInterval(state.cooldownTimer);
    
    const endTime = Date.now() + seconds * 1000;
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
    
    // Show cooldown
    Object.values(elements).forEach(group => {
      if (group.wrap) group.wrap.classList.remove('hidden');
    });
    
    state.cooldownTimer = setInterval(() => {
      const remaining = endTime - Date.now();
      
      if (remaining <= 0) {
        Object.values(elements).forEach(group => {
          if (group.fill) group.fill.style.width = '0%';
          if (group.text) group.text.textContent = 'Ready';
          if (group.wrap) group.wrap.classList.add('hidden');
        });
        clearInterval(state.cooldownTimer);
        state.cooldownTimer = null;
        return;
      }
      
      const secondsLeft = Math.ceil(remaining / 1000);
      const progress = ((seconds * 1000 - remaining) / (seconds * 1000) * 100) + '%';
      
      Object.values(elements).forEach(group => {
        if (group.fill) group.fill.style.width = progress;
        if (group.text) group.text.textContent = `${secondsLeft}s`;
      });
    }, 100);
  },
  
  showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 2500);
  },
  
  updateStats(total, mine, online) {
    ['statTotal', 'statTotalMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = utils.formatNumber(total);
    });
    
    ['statMine', 'statMineMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = utils.formatNumber(mine);
    });
    
    ['statOnline', 'statOnlineMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = utils.formatNumber(online);
    });
  },
  
  updateRanking(data) {
    const html = data.length === 0 ? 
      '<li>No data yet</li>' :
      data.map((item, index) => 
        `<li>
          <span>${index + 1}. ${item.country}</span>
          <strong>${utils.formatNumber(item.count)}</strong>
        </li>`
      ).join('');
    
    ['rankingList', 'rankingListMobile'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = html;
    });
  },
  
  startOnlineCounter() {
    const updateCount = () => {
      const base = 200;
      const variance = 400;
      const time = Date.now() / 10000;
      const count = Math.floor(base + variance * (0.5 + 0.5 * Math.sin(time)));
      ui.updateStats(state.paintedTiles.size, 0, count);
    };
    
    setInterval(updateCount, 5000);
    updateCount();
  }
};

// ----------------------------
// Firebase Integration
// ----------------------------
const firebase = {
  async init() {
    if (state.firebaseReady) return true;
    
    try {
      const [appModule, authModule, firestoreModule] = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js')
      ]);
      
      const app = appModule.initializeApp(CONFIG.FIREBASE);
      state.auth = authModule.getAuth(app);
      state.db = firestoreModule.getFirestore(app);
      
      await authModule.setPersistence(state.auth, authModule.browserLocalPersistence);
      
      // Auth state listener
      authModule.onAuthStateChanged(state.auth, (user) => {
        state.user = user;
        this.updateAuthUI();
        if (user) {
          ui.showToast('Connected', 'success');
          this.subscribeToData();
        }
      });
      
      // Auto sign in
      await this.signIn(true);
      
      // Subscribe to tiles
      this.subscribeToTiles();
      
      state.firebaseReady = true;
      return true;
    } catch (error) {
      console.warn('Firebase init failed:', error);
      ui.showToast('Offline mode', 'info');
      return false;
    }
  },
  
  async signIn(silent = false) {
    try {
      if (!state.firebaseReady) await this.init();
      const { signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signInAnonymously(state.auth);
    } catch (error) {
      if (!silent) ui.showToast('Sign in failed', 'error');
    }
  },
  
  async signOut() {
    try {
      if (!state.firebaseReady) return;
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
      await signOut(state.auth);
      ui.showToast('Signed out', 'info');
    } catch (error) {
      ui.showToast('Sign out failed', 'error');
    }
  },
  
  updateAuthUI() {
    const signInBtn = document.getElementById('signInBtn');
    const signOutBtn = document.getElementById('signOutBtn');
    
    if (signInBtn) signInBtn.classList.toggle('hidden', !!state.user);
    if (signOutBtn) signOutBtn.classList.toggle('hidden', !state.user);
  },
  
  async saveTile(lat, lng, color) {
    if (!state.firebaseReady || !state.user) return;
    
    try {
      const { doc, setDoc, serverTimestamp, increment } = 
        await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      
      const key = utils.getTileKey(lat, lng);
      
      // Save tile
      await setDoc(doc(state.db, 'tiles', key), {
        key,
        lat: utils.snap(lat),
        lng: utils.snap(lng),
        color,
        country: state.currentCountry,
        uid: state.user.uid,
        ts: serverTimestamp()
      }, { merge: true });
      
      // Update scores
      this.updateScores(1);
    } catch (error) {
      console.warn('Save failed:', error);
    }
  },
  
  async updateScores(count) {
    if (!state.firebaseReady || !state.user) return;
    
    try {
      const { doc, setDoc, increment } = 
        await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      
      const periods = this.getPeriodKeys();
      const updates = [];
      
      // Update all periods
      Object.values(periods).forEach(period => {
        const ref = doc(state.db, 'scores', period, 'countries', state.currentCountry);
        updates.push(setDoc(ref, { 
          count: increment(count),
          country: state.currentCountry
        }, { merge: true }));
      });
      
      // Update user stats
      const userRef = doc(state.db, 'stats', `user-${state.user.uid}`);
      updates.push(setDoc(userRef, { 
        mine: increment(count),
        lastCountry: state.currentCountry
      }, { merge: true }));
      
      await Promise.all(updates);
    } catch (error) {
      console.warn('Score update failed:', error);
    }
  },
  
  getPeriodKeys() {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const day = String(now.getUTCDate()).padStart(2, '0');
    
    // Calculate ISO week
    const onejan = new Date(now.getUTCFullYear(), 0, 1);
    const weekNum = Math.ceil((((now - onejan) / 86400000) + onejan.getUTCDay() + 1) / 7);
    const week = String(weekNum).padStart(2, '0');
    
    return {
      today: `day-${year}-${month}-${day}`,
      week: `week-${year}-W${week}`,
      month: `month-${year}-${month}`,
      alltime: 'alltime'
    };
  },
  
  subscribeToData() {
    this.subscribeToRanking();
    this.subscribeToUserStats();
  },
  
  async subscribeToTiles() {
    if (!state.firebaseReady) return;
    
    const { collection, query, orderBy, limit, onSnapshot } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const q = query(collection(state.db, 'tiles'), orderBy('ts', 'desc'), limit(5000));
    
    const unsub = onSnapshot(q, (snapshot) => {
      mapManager.clearTiles();
      snapshot.forEach(doc => {
        const data = doc.data();
        mapManager.drawTile(data.lat, data.lng, data.color);
      });
      ui.updateStats(snapshot.size, 0, 0);
    });
    
    state.unsubscriptions.push(unsub);
  },
  
  async subscribeToRanking() {
    if (!state.firebaseReady) return;
    
    const period = document.querySelector('[data-period].active')?.dataset.period ||
                   document.querySelector('[data-period-mobile].active')?.dataset.periodMobile ||
                   'today';
    
    const periodKey = this.getPeriodKeys()[period];
    
    const { collection, query, orderBy, limit, onSnapshot } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const q = query(
      collection(state.db, 'scores', periodKey, 'countries'),
      orderBy('count', 'desc'),
      limit(10)
    );
    
    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        country: doc.id,
        count: doc.data().count || 0
      }));
      ui.updateRanking(data);
    });
    
    // Cancel previous subscription
    if (state.unsubscriptions.ranking) {
      state.unsubscriptions.ranking();
    }
    state.unsubscriptions.ranking = unsub;
  },
  
  async subscribeToUserStats() {
    if (!state.firebaseReady || !state.user) return;
    
    const { doc, onSnapshot } = 
      await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    
    const unsub = onSnapshot(doc(state.db, 'stats', `user-${state.user.uid}`), (snapshot) => {
      const mine = snapshot.exists() ? (snapshot.data().mine || 0) : 0;
      ['statMine', 'statMineMobile'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = utils.formatNumber(mine);
      });
    });
    
    state.unsubscriptions.push(unsub);
  }
};

// ----------------------------
// Initialize Application
// ----------------------------
let mapManager;

window.addEventListener('DOMContentLoaded', () => {
  console.log('Initializing TePlace...');
  
  // Initialize components
  mapManager = new MapManager();
  ui.init();
  firebase.init();
  
  // Performance optimization for mobile
  if (state.isMobile) {
    document.addEventListener('touchstart', () => {}, { passive: true });
  }
  
  console.log('TePlace ready!');
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  state.unsubscriptions.forEach(unsub => unsub && unsub());
});