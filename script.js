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
  if(!isFinite(v) || v<=0){ alert('Invalid tile size'); return; }
  setTile(v);
});
function setTile(v){
  TILE = v; localStorage.setItem('tile', String(v));
  // 再描画（購読で引き直すのが綺麗だが、ここでは既存表示は維持）
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
// 5. Firebase (オプション / 失敗でも描ける)
// ----------------------------
let auth=null, db=null, user=null;
let guestMode = true;

const signInBtn = document.getElementById('signInBtn');
const signOutBtn = document.getElementById('signOutBtn');

(async function initFirebase(){
  try{
    const [{ initializeApp },
           { getAuth, onAuthStateChanged, signInAnonymously, signOut },
           { getFirestore, collection, doc, setDoc, onSnapshot, serverTimestamp, query, orderBy, limit, increment }]
      = await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      ]);

    // ==== ここにあなたの Firebase 設定を貼る ====
    const firebaseConfig = {
      apiKey: "AIzaSyA2IxeqJxFZzlmuqu0n4W3wXa2VpzZISBE",
  authDomain: "wwplace-b6a86.firebaseapp.com",
  projectId: "wwplace-b6a86",
  storageBucket: "wwplace-b6a86.firebasestorage.app",
  messagingSenderId: "1005360971581",
  appId: "1:1005360971581:web:3f23bdb25cdac844050f54",
  measurementId: "G-4F90EG7W7N"
};
    // ============================================

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);

    signInBtn.addEventListener('click', ()=> signInAnonymously(auth));
    signOutBtn.addEventListener('click', ()=> signOut(auth));

    onAuthStateChanged(auth, (u)=>{
      user = u;
      guestMode = !u;
      signInBtn.classList.toggle('hidden', !!u);
      signOutBtn.classList.toggle('hidden', !u);
      if(!u){ signInAnonymously(auth).catch(()=>{}); }
      subscribeMine();
    });

    // --- 既存タイル購読（最新5000件） ---
    onSnapshot(query(collection(db,'tiles'), orderBy('ts','desc'), limit(5000)), snap=>{
      layerTiles.clearLayers();
      snap.forEach(s=>{
        const d = s.data();
        rectFor(d.lat, d.lng, d.color).addTo(layerTiles);
      });
    });

    // --- 全体枚数 ---
    onSnapshot(doc(db,'stats','global'), s=>{
      document.getElementById('statTotal').textContent = s.exists()? (s.data().total||0) : 0;
    });

    subscribeRanking();

  }catch(err){
    console.warn('[Firebase disabled] Map works offline:', err);
  }
})();

// 自分の枚数サブスク（ゲストは 0）
function subscribeMine(){
  if(!db || !user){
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
async function updateScores(db, n){
  if(!db || !user) return;
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
  if(!db) return;
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
// 6. クリックで描画（ゲストでもOK）
// ----------------------------
map.on('click', async (e)=>{
  // クールダウン共通
  if(inCd()){
    const left=Math.ceil((BRUSH_COOLDOWN[brushSize]*1000-(Date.now()-lastPaintAt))/1000);
    showCooldown(left); return;
  }

  const color = colorPicker.value;
  const baseLat = snap(e.latlng.lat);
  const baseLng = snap(e.latlng.lng);

  // 1) まずローカル即時描画（サインイン不要）
  for(let dy=0; dy<brushSize; dy++){
    for(let dx=0; dx<brushSize; dx++){
      const lat = baseLat + dy*TILE;
      const lng = baseLng + dx*TILE;
      rectFor(lat,lng,color).addTo(layerTiles);
    }
  }

  // 2) サインイン済み & Firestore 利用可なら保存＆スコア
  if(db && user){
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
      updateScores(db, brushSize*brushSize);
    }catch(err){
      console.warn('Save skip:', err);
    }
  }

  // 3) クールダウン共通
  lastPaintAt = Date.now();
  showCooldown(BRUSH_COOLDOWN[brushSize]);
});
