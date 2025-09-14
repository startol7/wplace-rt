/**********************************************
 * TePlace — Real World Map Conquest
 * Brush 1x1 / 2x2 / 3x3 with variable cooldown
 * Firebase Auth + Firestore (territories/users)
 **********************************************/

/* ====== Firebase ====== */
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db   = firebase.firestore();

/* ====== Leaflet / Game State ====== */
let map;
let me = null;                 // auth user
let myTiles = 0;
let canPlace = true;

const GRID_SIZE = 0.01;        // 1 tile ≒ 約1km四方(縮尺依存)
const COOLDOWN_BASE_MS = 10000;// 1タイル=10s / 4=40s / 9=90s
let BRUSH_SIZE = 1;

const territoryLayer = L.layerGroup();

// UI refs
const avatar      = document.getElementById("avatar");
const signInBtn   = document.getElementById("signInBtn");
const signOutBtn  = document.getElementById("signOutBtn");
const rankingList = document.getElementById("rankingList");
const activityList= document.getElementById("activityList");
const totalTilesEl= document.getElementById("totalTiles");
const myTilesEl   = document.getElementById("myTiles");
const onlineEl    = document.getElementById("onlineUsers");
const brushGroup  = document.getElementById("brushGroup");
const colorPicker = document.getElementById("colorPicker");
const colorHex    = document.getElementById("colorHex");
const cooldownEl  = document.getElementById("cooldownBar");
const cooldownFill= document.getElementById("cooldownFill");
const cooldownSec = document.getElementById("cooldownSec");
let cooldownTimer = null;

let currentColor = colorPicker.value;

/* ====== Helpers ====== */
const toast = (msg) => {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:80px;background:#162131;border:1px solid #263043;border-radius:12px;padding:10px 14px;z-index:9999';
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 2200);
};

// Grid → key
function keyOf(lat,lng){
  const la = Math.floor(lat/GRID_SIZE)*GRID_SIZE;
  const ln = Math.floor(lng/GRID_SIZE)*GRID_SIZE;
  return `${la.toFixed(5)},${ln.toFixed(5)}`;
}

// Brush keys (centered)
function getBrushKeys(lat,lng,size){
  const centerLa = Math.floor(lat/GRID_SIZE)*GRID_SIZE;
  const centerLn = Math.floor(lng/GRID_SIZE)*GRID_SIZE;
  const half = (size-1)/2; // 1→0, 2→0.5, 3→1
  const startLa = centerLa - half*GRID_SIZE;
  const startLn = centerLn - half*GRID_SIZE;

  const keys = [];
  for(let r=0;r<size;r++){
    for(let c=0;c<size;c++){
      keys.push(keyOf(startLa + r*GRID_SIZE, startLn + c*GRID_SIZE));
    }
  }
  return [...new Set(keys)];
}

/* ====== Auth ====== */
signInBtn.onclick = async ()=>{
  const provider = new firebase.auth.GoogleAuthProvider();
  await auth.signInWithPopup(provider);
};
signOutBtn.onclick = ()=> auth.signOut();

auth.onAuthStateChanged(async (user)=>{
  me = user;
  if(me){
    signInBtn.style.display = 'none';
    signOutBtn.style.display = '';
    avatar.style.display = '';
    avatar.src = me.photoURL || '';
    // user doc merge
    await db.collection('users').doc(me.uid).set({
      displayName: me.displayName || 'Anonymous',
      photoURL: me.photoURL || '',
      tiles: firebase.firestore.FieldValue.increment(0) // ensure field
    }, {merge:true});
  }else{
    signInBtn.style.display = '';
    signOutBtn.style.display = 'none';
    avatar.style.display = 'none';
  }
});

/* ====== Map ====== */
function initMap(){
  map = L.map('map',{
    worldCopyJump:true,
    minZoom:2, maxZoom:19,
    center:[35.68,139.76], zoom:5
  });
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom: 19, attribution:'© OpenStreetMap contributors'
  }).addTo(map);
  territoryLayer.addTo(map);

  map.on("click", onMapClick);

  // draw existing tiles (live)
  db.collection('territories').onSnapshot(snap=>{
    territoryLayer.clearLayers();
    totalTilesEl.textContent = snap.size;
    snap.forEach(doc=>{
      const [la,ln] = doc.id.split(',').map(Number);
      const bounds = [[la, ln],[la+GRID_SIZE, ln+GRID_SIZE]];
      const col = doc.data().color || '#ff4b4b';
      const rect = L.rectangle(bounds,{
        color: col, fillColor: col, fillOpacity:.6, weight:1
      });
      rect.bindTooltip(doc.data().ownerName || 'Unknown', {sticky:true});
      territoryLayer.addLayer(rect);
    });
  });

  // ranking（top 10）
  db.collection('users').orderBy('tiles','desc').limit(10)
    .onSnapshot(snap=>{
      rankingList.innerHTML='';
      snap.forEach(doc=>{
        const li = document.createElement('li');
        const d = doc.data();
        li.textContent = `${d.displayName || 'Unknown'} — ${d.tiles || 0}`;
        rankingList.appendChild(li);
      });
    });

  // my tile count（live）
  auth.onAuthStateChanged(u=>{
    if(!u){ myTiles = 0; myTilesEl.textContent = '0'; return;}
    db.collection('users').doc(u.uid).onSnapshot(ds=>{
      myTiles = (ds.data() && ds.data().tiles) || 0;
      myTilesEl.textContent = String(myTiles);
    });
  });

  // fake online
  setInterval(()=>{
    onlineEl.textContent = String(Math.floor(Math.random()*400)+200);
  }, 8000);
}

/* ====== Click → Claim with Brush ====== */
async function onMapClick(e){
  if(!me){ toast('Please sign in first.'); return; }
  if(!canPlace){ toast('Cooling down…'); return; }

  const keys = getBrushKeys(e.latlng.lat, e.latlng.lng, BRUSH_SIZE);
  const dur = COOLDOWN_BASE_MS * keys.length;

  let changed = 0;
  for(const key of keys){
    const ok = await claimTileByKey(key);
    if(ok) changed++;
  }
  if(changed>0){
    addActivity(`${me.displayName||'You'} claimed ${changed} tile(s)`);
    startCooldown(dur);
  }
}

// 1 tile claim (transaction)
async function claimTileByKey(key){
  const tileRef = db.collection('territories').doc(key);
  try{
    await db.runTransaction(async tx=>{
      const snap = await tx.get(tileRef);
      if(snap.exists){
        const prev = snap.data();
        if(prev.owner === me.uid){ return; } // already mine
        // previous -1
        if(prev.owner){
          tx.update(db.collection('users').doc(prev.owner), {
            tiles: firebase.firestore.FieldValue.increment(-1)
          });
        }
      }
      // set mine
      tx.set(tileRef,{
        owner: me.uid,
        ownerName: me.displayName || 'Anonymous',
        color: currentColor,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // me +1
      tx.set(db.collection('users').doc(me.uid), {
        displayName: me.displayName || 'Anonymous',
        photoURL: me.photoURL || '',
        tiles: firebase.firestore.FieldValue.increment(1)
      }, {merge:true});
    });
    return true;
  }catch(err){
    console.error('claimTileByKey', err);
    return false;
  }
}

/* ====== Cooldown ====== */
function startCooldown(ms){
  canPlace = false; cooldownEl.style.display='flex';
  const total = ms; let remain = total;
  const tick = ()=>{
    remain -= 100;
    if(remain <= 0){
      cooldownFill.style.width='0%';
      cooldownSec.textContent = `${COOLDOWN_BASE_MS/1000}s`;
      cooldownEl.style.display='none';
      canPlace = true; clearInterval(cooldownTimer); return;
    }
    cooldownFill.style.width = `${(total-remain)/total*100}%`;
    cooldownSec.textContent = `${Math.ceil(remain/1000)}s`;
  };
  clearInterval(cooldownTimer);
  cooldownTimer = setInterval(tick, 100);
}

/* ====== UI bind ====== */
function bindUI(){
  // brush buttons
  if(brushGroup){
    brushGroup.querySelector('[data-brush="1"]').classList.add('active');
    brushGroup.addEventListener('click', (ev)=>{
      const btn = ev.target.closest('button[data-brush]');
      if(!btn) return;
      brushGroup.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      BRUSH_SIZE = parseInt(btn.dataset.brush,10);
    });
  }
  // color
  colorPicker.addEventListener('input', ()=>{
    currentColor = colorPicker.value;
    colorHex.value = currentColor;
  });
  colorHex.addEventListener('input', ()=>{
    let v = colorHex.value.trim();
    if(!/^#/.test(v)) v = '#'+v;
    if(/^#([0-9a-fA-F]{6})$/.test(v)){
      currentColor = v;
      colorPicker.value = v;
    }
  });
}

/* ====== Activity UI ====== */
function addActivity(text){
  const item = document.createElement('div');
  item.className = 'item';
  item.textContent = `${new Date().toLocaleTimeString()} — ${text}`;
  activityList.prepend(item);
  while(activityList.childElementCount>10){
    activityList.lastElementChild.remove();
  }
}

/* ====== Start ====== */
bindUI();
initMap();
