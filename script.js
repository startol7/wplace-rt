// ----------------------------
// 0. Country list
// ----------------------------
const COUNTRY_LIST = [
  {code:'JP',name:'Japan'},{code:'US',name:'United States'},{code:'KR',name:'Korea'},
  {code:'CN',name:'China'},{code:'GB',name:'United Kingdom'},{code:'FR',name:'France'},
  {code:'DE',name:'Germany'},{code:'BR',name:'Brazil'},{code:'IN',name:'India'},
  {code:'RU',name:'Russia'},{code:'CA',name:'Canada'},{code:'AU',name:'Australia'}
];
const countrySel = document.getElementById('countrySelect');
COUNTRY_LIST.forEach(c => {
  const o=document.createElement('option');
  o.value=c.name; o.textContent=c.name; countrySel.append(o);
});
countrySel.value='Japan';
let currentCountry = countrySel.value;
countrySel.addEventListener('change', ()=> currentCountry = countrySel.value);

// ----------------------------
// 1. Leaflet first
// ----------------------------
const map = L.map('map',{worldCopyJump:true}).setView([35.6762,139.6503],6);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap contributors', maxZoom:19, detectRetina:true, subdomains:'abc'
});
osm.on('tileerror', e=>console.error('OSM tile error:', e));
osm.addTo(map);
setTimeout(()=>map.invalidateSize(),150);

const layerTiles = L.layerGroup().addTo(map);

// ----------------------------
// 2. Tile size (pixel feel)
// ----------------------------
let TILE = parseFloat(localStorage.getItem('tile') || '0.0005');
const tileInput = document.getElementById('tileCustom');
tileInput.value = TILE;

document.querySelectorAll('.seg-btn[data-tile]').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn[data-tile]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    setTile(parseFloat(b.dataset.tile));
  });
});
document.getElementById('tileApply').addEventListener('click', ()=>{
  const v=parseFloat(tileInput.value);
  if(!isFinite(v)||v<=0){ toast('Invalid tile size'); return; }
  setTile(v);
});
function setTile(v){
  TILE=v; localStorage.setItem('tile',String(v));
  console.log('TILE set ->', TILE);
}
const snap = v => Math.floor(v/TILE)*TILE;
const keyFromLatLng = (lat,lng)=>`${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;
const rectFor = (lat,lng,color)=>{
  const lat0=snap(lat), lng0=snap(lng);
  return L.rectangle([[lat0,lng0],[lat0+TILE,lng0+TILE]], {color,fillColor:color,fillOpacity:.5,weight:1});
};

// ----------------------------
// 3. Color
// ----------------------------
const colorPicker=document.getElementById('colorPicker');
const colorHex=document.getElementById('colorHex');
colorPicker.addEventListener('input', e=> colorHex.value=e.target.value);
colorHex.addEventListener('input', e=>{
  if(/^#?[0-9a-fA-F]{6}$/.test(e.target.value)){
    const v=e.target.value.startsWith('#')?e.target.value:'#'+e.target.value;
    colorPicker.value=v;
  }
});

// ----------------------------
// 4. Cooldown (always 10s)
// ----------------------------
const COOLDOWN = 10; // seconds
let lastPaintAt=0;
const cooldownWrap=document.getElementById('cooldown');
const cooldownFill=document.getElementById('cooldownFill');
const cooldownText=document.getElementById('cooldownText');

function showCooldown(sec){
  const end=Date.now()+sec*1000;
  cooldownWrap.classList.remove('hidden');
  const t=setInterval(()=>{
    const left=end-Date.now();
    if(left<=0){
      cooldownFill.style.width='0%';
      cooldownText.textContent='0s';
      cooldownWrap.classList.add('hidden');
      clearInterval(t); return;
    }
    cooldownText.textContent=Math.ceil(left/1000)+'s';
    cooldownFill.style.width=((sec*1000-left)/(sec*1000)*100)+'%';
  },120);
}
const inCd = ()=> Date.now()-lastPaintAt < COOLDOWN*1000;

// ----------------------------
// 5. Firebase (lazy init; guest works even if it fails)
// ----------------------------
let auth=null, db=null, user=null, firebaseReady=false;
const signInBtn=document.getElementById('signInBtn');
const signOutBtn=document.getElementById('signOutBtn');

// Buttons always responsive
signInBtn.addEventListener('click', async ()=>{
  try{
    if(!firebaseReady) await ensureFirebaseInitialized();
    const { signInAnonymously } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await signInAnonymously(auth);
  }catch(e){
    console.warn('Sign-in error (guest can still draw):', e);
    toast('Could not sign in. You can still draw as guest.');
  }
});
signOutBtn.addEventListener('click', async ()=>{
  try{
    if(!firebaseReady) return;
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await signOut(auth);
  }catch(e){ console.warn('Sign-out error:', e); }
});

async function ensureFirebaseInitialized(){
  if(firebaseReady) return true;
  try{
    const [{ initializeApp },
           { getAuth, onAuthStateChanged, setPersistence, browserLocalPersistence, signInAnonymously },
           { getFirestore, collection, doc, onSnapshot, query, orderBy, limit }]
      = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      ]);

    // ==== REPLACE WITH YOUR FIREBASE CONFIG ====
    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT.appspot.com",
      messagingSenderId: "YOUR_SENDER_ID",
      appId: "YOUR_APP_ID",
      measurementId: "G-XXXX"
    };
    // ==========================================

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);

    await setPersistence(auth, browserLocalPersistence);

    onAuthStateChanged(auth, (u)=>{
      user = u || null;
      signInBtn.classList.toggle('hidden', !!u);
      signOutBtn.classList.toggle('hidden', !u);
      subscribeMine();
      subscribeRanking();
      if(u) toast('Signed in');
    });

    // try anonymous sign-in initially (ignore failure)
    try{ await signInAnonymously(auth); }catch(_){}

    // stream recent tiles
    onSnapshot(query(collection(db,'tiles'), orderBy('ts','desc'), limit(5000)), snap=>{
      layerTiles.clearLayers();
      snap.forEach(s=>{
        const d=s.data();
        rectFor(d.lat,d.lng,d.color).addTo(layerTiles);
      });
    });

    // global stats
    onSnapshot(doc(db,'stats','global'), s=>{
      document.getElementById('statTotal').textContent = s.exists() ? (s.data().total||0) : 0;
    });

    firebaseReady = true;
    return true;
  }catch(err){
    console.warn('[Firebase init failed] Guest-only mode:', err);
    firebaseReady = false;
    return false;
  }
}
// try once on load (failure is fine)
ensureFirebaseInitialized();

// mine
function subscribeMine(){
  if(!firebaseReady || !user){
    document.getElementById('statMine').textContent = 0;
    return;
  }
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({doc,onSnapshot})=>{
    onSnapshot(doc(db,'stats',`user-${user.uid}`), s=>{
      document.getElementById('statMine').textContent = s.exists()? (s.data().mine||0) : 0;
    });
  });
}

// period keys
function getPeriodKeys(){
  const now=new Date();
  const y=now.getUTCFullYear();
  const m=String(now.getUTCMonth()+1).padStart(2,'0');
  const d=String(now.getUTCDate()).padStart(2,'0');
  const week=getWeekNumber(now);
  return { today:`today-${y}${m}${d}`, week:`week-${y}-${week}`, month:`month-${y}${m}` };
}
function getWeekNumber(date){
  const d=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate()));
  const day=d.getUTCDay()||7; d.setUTCDate(d.getUTCDate()+4-day);
  const yearStart=new Date(Date.UTC(d.getUTCFullYear(),0,1));
  return String(Math.ceil(((d-yearStart)/86400000+1)/7)).padStart(2,'0');
}

// update scores (only when signed-in)
async function updateScores(n){
  if(!firebaseReady || !user) return;
  const {doc,setDoc,increment} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const p=getPeriodKeys();
  await Promise.all([
    setDoc(doc(db,'scores',p.today,'countries',currentCountry), {count:increment(n)}, {merge:true}),
    setDoc(doc(db,'scores',p.week ,'countries',currentCountry), {count:increment(n)}, {merge:true}),
    setDoc(doc(db,'scores',p.month,'countries',currentCountry), {count:increment(n)}, {merge:true}),
    setDoc(doc(db,'stats','global'), {total:increment(n)}, {merge:true}),
    setDoc(doc(db,'stats',`user-${user.uid}`), {mine:increment(n)}, {merge:true}),
  ]);
}

// ranking
let unsubRanking=null;
function subscribeRanking(){
  if(!firebaseReady) return;
  if(unsubRanking) unsubRanking();
  const period = document.querySelector('.seg-btn.active[data-period]')?.dataset.period || 'today';
  const key = getPeriodKeys()[period];

  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({collection,query,orderBy,limit,onSnapshot})=>{
    unsubRanking = onSnapshot(query(collection(db,'scores',key,'countries'), orderBy('count','desc'), limit(10)), snap=>{
      const ul=document.getElementById('rankingList'); ul.innerHTML='';
      if(snap.empty){ ul.innerHTML='<li>No data yet</li>'; return; }
      snap.forEach(d=>{
        const li=document.createElement('li');
        li.innerHTML = `<span>${d.id}</span><strong>${d.data().count||0}</strong>`;
        ul.append(li);
      });
    });
  });
}
document.querySelectorAll('.seg-btn[data-period]').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn[data-period]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    subscribeRanking();
  });
});

// online (dummy)
setInterval(()=>{ document.getElementById('statOnline').textContent = Math.floor(200+Math.random()*600); }, 8000);

// ----------------------------
// 6. Click to paint (1×1 only; guest OK)
// ----------------------------
map.on('click', async (e)=>{
  if(inCd()){
    const left=Math.ceil((COOLDOWN*1000-(Date.now()-lastPaintAt))/1000);
    showCooldown(left); return;
  }

  const color = colorPicker.value;
  const lat = snap(e.latlng.lat);
  const lng = snap(e.latlng.lng);

  // local draw
  rectFor(lat,lng,color).addTo(layerTiles);

  // save if signed-in
  if(firebaseReady && user){
    try{
      const {doc,setDoc,serverTimestamp} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      await setDoc(doc(db,'tiles',keyFromLatLng(lat,lng)), {
        key:keyFromLatLng(lat,lng), lat, lng, color, country:currentCountry, uid:user.uid, ts:serverTimestamp()
      }, {merge:true});
      await updateScores(1);
    }catch(err){ console.warn('Save skipped:', err); }
  }

  lastPaintAt = Date.now();
  showCooldown(COOLDOWN);
});

// ----------------------------
// 7. Tiny toast
// ----------------------------
function toast(msg){
  let el = document.getElementById('___toast');
  if(!el){
    el = document.createElement('div');
    el.id='___toast';
    el.style.cssText='position:fixed;left:50%;top:10px;transform:translateX(-50%);background:#1f2a44;color:#e7ecf3;padding:8px 12px;border:1px solid #22314f;border-radius:10px;z-index:9999;box-shadow:0 4px 12px #0005;font-size:14px';
    document.body.append(el);
  }
  el.textContent = msg;
  el.style.opacity='1';
  clearTimeout(el.__t);
  el.__t=setTimeout(()=>{ el.style.opacity='0'; }, 2200);
}
