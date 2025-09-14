// ---------- Firebase ----------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously, signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, onSnapshot, serverTimestamp,
  query, orderBy, limit, increment, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- PUT YOUR CONFIG HERE ---
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER",
  appId: "YOUR_APP_ID",
  measurementId: "G-XXXX"
};
// ----------------------------

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ---------- UI refs ----------
const countrySel  = document.getElementById('countrySelect');
const signInBtn   = document.getElementById('signInBtn');
const signOutBtn  = document.getElementById('signOutBtn');

const totalEl     = document.getElementById('statTotal');
const mineEl      = document.getElementById('statMine');
const onlineEl    = document.getElementById('statOnline');

const rankingList = document.getElementById('rankingList');
const segBtns     = [...document.querySelectorAll('.seg-btn[data-period]')];

const colorPicker = document.getElementById('colorPicker');
const colorHex    = document.getElementById('colorHex');

const cooldownWrap = document.getElementById('cooldown');
const cooldownFill = document.getElementById('cooldownFill');
const cooldownText = document.getElementById('cooldownText');

let user = null;
let currentCountry = 'Japan';
let brushSize = 1;

// countries (ISO + names)
const COUNTRIES = [
  {code:'JP', name:'Japan'}, {code:'US', name:'United States'},
  {code:'KR', name:'Korea'}, {code:'CN', name:'China'},
  {code:'GB', name:'United Kingdom'}, {code:'FR', name:'France'},
  {code:'DE', name:'Germany'}, {code:'BR', name:'Brazil'},
  {code:'IN', name:'India'}, {code:'RU', name:'Russia'},
  {code:'CA', name:'Canada'}, {code:'AU', name:'Australia'}
];
COUNTRIES.forEach(c=>{
  const opt=document.createElement('option');
  opt.value=c.name; opt.textContent=c.name;
  countrySel.append(opt);
});
countrySel.value=currentCountry;
countrySel.addEventListener('change',()=>{
  currentCountry = countrySel.value;
});

// sign-in/out
signInBtn.addEventListener('click', ()=> signInAnonymously(auth));
signOutBtn.addEventListener('click', ()=> signOut(auth));

onAuthStateChanged(auth, (u)=>{
  user = u;
  signInBtn.classList.toggle('hidden', !!u);
  signOutBtn.classList.toggle('hidden', !u);
  if(!u){ signInAnonymously(auth).catch(()=>{}); }
});

// ---------- Leaflet map ----------
const TILE = 0.001; // 1x1 pixel size (lat/lng grid)
const map = L.map('map', { worldCopyJump:true })
  .setView([35.6762, 139.6503], 6);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  maxZoom: 19, attribution: '© OpenStreetMap contributors'
}).addTo(map);

// layer to draw rectangles
const tileLayer = L.layerGroup().addTo(map);

// snap lat/lng to grid
function snap(lat){ return Math.floor(lat / TILE) * TILE; }
function keyFromLatLng(lat,lng){ 
  return `${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;
}

// draw one tile rect
function rectFor(lat,lng,color){
  const lat0 = snap(lat), lng0 = snap(lng);
  return L.rectangle([[lat0,lng0],[lat0+TILE,lng0+TILE]],{
    color, fillColor:color, fillOpacity:.5, weight:1
  });
}

// ---------- Paint (with cooldown & brush) ----------
const BRUSH_COOLDOWN = {1:10, 2:40, 3:90}; // seconds
let lastPaintAt = 0;

function showCooldown(sec) {
  const end = Date.now() + sec*1000;
  cooldownWrap.classList.remove('hidden');

  const timer = setInterval(()=>{
    const leftMs = end - Date.now();
    if (leftMs <= 0) {
      cooldownFill.style.width = '0%';
      cooldownText.textContent = '0s';
      cooldownWrap.classList.add('hidden');
      clearInterval(timer);
      return;
    }
    const left = Math.ceil(leftMs/1000);
    cooldownText.textContent = `${left}s`;
    const total = sec*1000;
    const progress = (total-leftMs)/total*100;
    cooldownFill.style.width = `${Math.max(0, Math.min(100, progress))}%`;
  }, 100);
}

function inCooldown(){
  const need = BRUSH_COOLDOWN[brushSize]*1000;
  return Date.now() - lastPaintAt < need;
}

// brush buttons
document.querySelectorAll('.seg-btn[data-brush]').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn[data-brush]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    brushSize = Number(btn.dataset.brush);
  });
});

// color sync
colorPicker.addEventListener('input', e=> colorHex.value = e.target.value);
colorHex.addEventListener('input', e=>{
  if(/^#?[0-9a-fA-F]{6}$/.test(e.target.value)){
    const v = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`;
    colorPicker.value = v;
  }
});

// click to paint
map.on('click', async (e)=>{
  if(!user){ alert('Sign-in failed. Reload the page.'); return; }
  if(inCooldown()){
    const left = Math.ceil((BRUSH_COOLDOWN[brushSize]*1000 - (Date.now()-lastPaintAt))/1000);
    showCooldown(left); return;
  }

  const color = colorPicker.value;
  const baseLat = snap(e.latlng.lat);
  const baseLng = snap(e.latlng.lng);

  // n×n brush
  const ops = [];
  for(let dy=0; dy<brushSize; dy++){
    for(let dx=0; dx<brushSize; dx++){
      const lat = baseLat + dy*TILE;
      const lng = baseLng + dx*TILE;
      const key = keyFromLatLng(lat, lng);
      const ref = doc(db, 'tiles', key);
      ops.push(setDoc(ref, {
        key, lat, lng, color,
        country: currentCountry,
        uid: user.uid || null,
        ts: serverTimestamp()
      }, { merge:true }));
      // draw immediately
      rectFor(lat, lng, color).addTo(tileLayer);
    }
  }
  await Promise.all(ops);

  // update scoreboard (today/week/month)
  const {periodToday, periodWeek, periodMonth} = getPeriodKeys();
  await Promise.all([
    setDoc(doc(db, 'scores', periodToday, 'countries', currentCountry),
          {count: increment(brushSize*brushSize)}, {merge:true}),
    setDoc(doc(db, 'scores', periodWeek, 'countries', currentCountry),
          {count: increment(brushSize*brushSize)}, {merge:true}),
    setDoc(doc(db, 'scores', periodMonth, 'countries', currentCountry),
          {count: increment(brushSize*brushSize)}, {merge:true}),
    setDoc(doc(db, 'stats', 'global'), {total: increment(brushSize*brushSize)}, {merge:true}),
    setDoc(doc(db, 'stats', `user-${user.uid}`), {mine: increment(brushSize*brushSize)}, {merge:true})
  ]);

  lastPaintAt = Date.now();
  showCooldown(BRUSH_COOLDOWN[brushSize]);
});

// ---------- Load existing tiles (simple stream) ----------
onSnapshot(query(collection(db,'tiles'), orderBy('ts','desc'), limit(5000)), snap=>{
  tileLayer.clearLayers();
  snap.forEach(docSnap=>{
    const d = docSnap.data();
    rectFor(d.lat, d.lng, d.color).addTo(tileLayer);
  });
});

// ---------- Stats / Ranking ----------
onSnapshot(doc(db,'stats','global'), snap=>{
  const val = snap.exists() ? (snap.data().total||0) : 0;
  totalEl.textContent = val;
});

function loadMine(){
  if(!user){ mineEl.textContent = 0; return; }
  onSnapshot(doc(db,'stats',`user-${user.uid}`), s=>{
    mineEl.textContent = s.exists() ? (s.data().mine||0) : 0;
  });
}
onAuthStateChanged(auth, loadMine);

// dummy online approx (randomized)
setInterval(()=> onlineEl.textContent = Math.floor(200 + Math.random()*600), 8000);

// period keys
function getPeriodKeys(){
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth()+1).padStart(2,'0');
  const d = String(now.getUTCDate()).padStart(2,'0');
  const week = getWeekNumber(now); // ISO week number
  return {
    periodToday : `today-${y}${m}${d}`,
    periodWeek  : `week-${y}-${week}`,
    periodMonth : `month-${y}${m}`
  };
}
function getWeekNumber(date){
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return String(weekNo).padStart(2,'0');
}

// ranking UI
let currentPeriod = 'today';
segBtns.forEach(btn=>{
  btn.addEventListener('click', ()=>{
    segBtns.forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    subscribeRanking();
  });
});

let unsubRanking = null;
function subscribeRanking(){
  if(unsubRanking) unsubRanking();
  const {periodToday, periodWeek, periodMonth} = getPeriodKeys();
  const keyMap = { today:periodToday, week:periodWeek, month:periodMonth };
  const path = ['scores', keyMap[currentPeriod], 'countries'];
  const ref = collection(db, ...path);
  unsubRanking = onSnapshot(query(ref, orderBy('count','desc'), limit(10)), snap=>{
    rankingList.innerHTML = '';
    if(snap.empty){
      rankingList.innerHTML = '<li>No data yet</li>';
      return;
    }
    snap.forEach(docSnap=>{
      const li = document.createElement('li');
      li.innerHTML = `<span>${docSnap.id}</span><strong>${docSnap.data().count||0}</strong>`;
      rankingList.append(li);
    });
  });
}
subscribeRanking();
