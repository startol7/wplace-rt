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
  o.value = c.name; o.textContent = c.name;
  countrySel.append(o);
});
countrySel.value = 'Japan';
let currentCountry = countrySel.value;
countrySel.addEventListener('change', ()=> currentCountry = countrySel.value);

// ----------------------------
// 1. Leaflet (先に確実に表示)
// ----------------------------
const map = L.map('map',{ worldCopyJump:true }).setView([35.6762,139.6503], 6);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:'© OpenStreetMap contributors',
  maxZoom:19, detectRetina:true, subdomains:'abc'
});
osm.on('tileerror', e => console.error('OSM tile error:', e));
osm.addTo(map);
setTimeout(()=>map.invalidateSize(), 150);

const layerTiles = L.layerGroup().addTo(map);

// ----------------------------
// 2. タイルサイズ（ピクセル感）
// ----------------------------
let TILE = parseFloat(localStorage.getItem('tile') || '0.0005'); // 小さめ
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
  const v = parseFloat(tileInput.value);
  if(!isFinite(v) || v<=0){ toast('Invalid tile size'); return; }
  setTile(v);
});
function setTile(v){
  TILE = v; localStorage.setItem('tile', String(v));
  console.log('TILE set ->', TILE);
}
const snap = v => Math.floor(v/TILE)*TILE;
const keyFromLatLng = (lat,lng)=> `${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;
const rectFor = (lat,lng,color) => {
  const lat0 = snap(lat), lng0 = snap(lng);
  return L.rectangle([[lat0,lng0],[lat0+TILE,lng0+TILE]], {
    color, fillColor:color, fillOpacity:.5, weight:1
  });
};

// ----------------------------
// 3. ブラシ & 色
// ----------------------------
let brushSize = 1;
document.querySelectorAll('.seg-btn[data-brush]').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn[data-brush]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    brushSize = Number(b.dataset.brush);
  });
});
const colorPicker = document.getElementById('colorPicker');
const colorHex = document.getElementById('colorHex');
colorPicker.addEventListener('input', e => colorHex.value = e.target.value);
colorHex.addEventListener('input', e=>{
  if(/^#?[0-9a-fA-F]{6}$/.test(e.target.value)){
    const v = e.target.value.startsWith('#') ? e.target.value : '#'+e.target.value;
    colorPicker.value = v;
  }
});

// ----------------------------
// 4. クールダウン
// ----------------------------
const BRUSH_COOLDOWN = {1:10,2:40,3:90};
let lastPaintAt = 0;
const cooldownWrap = document.getElementById('cooldown');
const cooldownFill = document.getElementById('cooldownFill');
const cooldownText = document.getElementById('cooldownText');

function showCooldown(sec){
  const end = Date.now()+sec*1000;
  cooldownWrap.classList.remove('hidden');
  const t = setInterval(()=>{
    const left = end - Date.now();
    if(left<=0){
      cooldownFill.style.width='0%';
      cooldownText.textContent='0s';
      cooldownWrap.classList.add('hidden');
      clearInterval(t); return;
    }
    cooldownText.textContent = Math.ceil(left/1000)+'s';
    cooldownFill.style.width = ((sec*1000-left)/(sec*1000)*100)+'%';
  }, 120);
}
const inCd = ()=> Date.now()-lastPaintAt < BRUSH_COOLDOWN[brushSize]*1000;

// ----------------------------
// 5. Firebase（遅延初期化。失敗しても描画はOK）
// ----------------------------
let auth=null, db=null, user=null, firebaseReady=false;
const signInBtn  = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');

// どの状態でもボタンは反応させる
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
  }catch(e){
    console.warn('Sign-out error:', e);
  }
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

    // For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyA2IxeqJxFZzlmuqu0n4W3wXa2VpzZISBE",
  authDomain: "wwplace-b6a86.firebaseapp.com",
  projectId: "wwplace-b6a86",
  storageBucket: "wwplace-b6a86.firebasestorage.app",
  messagingSenderId: "1005360971581",
  appId: "1:1005360971581:web:3f23bdb25cdac844050f54",
  measurementId: "G-4F90EG7W7N"
};
    // =============================

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);

    // ローカル永続化
    await setPersistence(auth, browserLocalPersistence);

    onAuthStateChanged(auth, (u)=>{
      user = u || null;
      signInBtn.classList.toggle('hidden', !!u);
      signOutBtn.classList.toggle('hidden', !u);
      subscribeMine();      // 自分の枚数
      subscribeRanking();   // ランキング
      if(u){ toast('Signed in'); }
    });

    // 初回は自動で匿名サインインを試みる（失敗しても描画OK）
    try{ await signInAnonymously(auth); }catch(_){}

    // 既存タイル購読
    onSnapshot(query(collection(db,'tiles'), orderBy('ts','desc'), limit(5000)), snap=>{
      layerTiles.clearLayers();
      snap.forEach(s=>{
        const d = s.data();
        rectFor(d.lat, d.lng, d.color).addTo(layerTiles);
      });
    });

    firebaseReady = true;
    return true;
  }catch(err){
    console.warn('[Firebase init failed] Guest-only mode:', err);
    firebaseReady = false;
    return false;
  }
}
// 起動時に一度だけ初期化を試す（失敗してもOK）
ensureFirebaseInitialized();

// 自分の枚数
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

// 期間キー
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

// スコア加算（ログイン時のみ）
async function updateScores(n){
  if(!firebaseReady || !user) return;
  const {doc,setDoc,increment} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const p = getPeriodKeys();
  await Promise.all([
    setDoc(doc(db,'scores',p.today,'countries',currentCountry), {count:increment(n)},{merge:true}),
    setDoc(doc(db,'scores',p.week ,'countries',currentCountry), {count:increment(n)},{merge:true}),
    setDoc(doc(db,'scores',p.month,'countries',currentCountry), {count:increment(n)},{merge:true}),
    setDoc(doc(db,'stats','global'), {total:increment(n)}, {merge:true}),
    setDoc(doc(db,'stats',`user-${user.uid}`), {mine:increment(n)}, {merge:true}),
  ]);
}

// ランキング購読
let unsubRanking=null;
function subscribeRanking(){
  if(!firebaseReady) return;
  if(unsubRanking) unsubRanking();
  const period = document.querySelector('.seg-btn.active[data-period]')?.dataset.period || 'today';
  const key = getPeriodKeys()[period];

  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({collection,query,orderBy,limit,onSnapshot})=>{
    unsubRanking = onSnapshot(query(collection(db,'scores',key,'countries'), orderBy('count','desc'), limit(10)), snap=>{
      const ul = document.getElementById('rankingList'); ul.innerHTML='';
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

// ダミーのオンライン人数
setInterval(()=>{
  document.getElementById('statOnline').textContent = Math.floor(200+Math.random()*600);
}, 8000);

// ----------------------------
// 6. クリックで描画（ゲストでも常にOK）
// ----------------------------
map.on('click', async (e)=>{
  if(inCd()){
    const left=Math.ceil((BRUSH_COOLDOWN[brushSize]*1000-(Date.now()-lastPaintAt))/1000);
    showCooldown(left); return;
  }

  const color = colorPicker.value;
  const baseLat = snap(e.latlng.lat);
  const baseLng = snap(e.latlng.lng);

  // 1) ローカル即時描画（ログイン不要）
  for(let dy=0; dy<brushSize; dy++){
    for(let dx=0; dx<brushSize; dx++){
      const lat = baseLat + dy*TILE;
      const lng = baseLng + dx*TILE;
      rectFor(lat,lng,color).addTo(layerTiles);
    }
  }

  // 2) Firebase 保存（サインイン済みのときだけ）
  if(firebaseReady && user){
    try{
      const {doc,setDoc,serverTimestamp} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
      const ops=[];
      for(let dy=0; dy<brushSize; dy++){
        for(let dx=0; dx<brushSize; dx++){
          const lat = baseLat + dy*TILE;
          const lng = baseLng + dx*TILE;
          const key = keyFromLatLng(lat,lng);
          ops.push(setDoc(doc(db,'tiles',key), {
            key, lat, lng, color, country:currentCountry, uid:user.uid, ts:serverTimestamp()
          }, {merge:true}));
        }
      }
      await Promise.all(ops);
      await updateScores(brushSize*brushSize);
    }catch(err){
      console.warn('Save skipped:', err);
    }
  }

  // 3) クールダウン
  lastPaintAt = Date.now();
  showCooldown(BRUSH_COOLDOWN[brushSize]);
});

// ----------------------------
// 7. 簡易トースト
// ----------------------------
function toast(msg){
  let el = document.getElementById('___toast');
  if(!el){
    el = document.createElement('div');
    el.id='___toast';
    el.style.cssText='position:fixed;left:50%;top:18px;transform:translateX(-50%);background:#1f2a44;color:#e7ecf3;padding:8px 12px;border:1px solid #22314f;border-radius:10px;z-index:9999;box-shadow:0 4px 12px #0005;font-size:14px';
    document.body.append(el);
  }
  el.textContent = msg;
  el.style.opacity='1';
  clearTimeout(el.__t);
  el.__t=setTimeout(()=>{ el.style.opacity='0'; }, 2400);
}
