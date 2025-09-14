// ============== Leaflet を最初に初期化（Firebaseに失敗しても地図は出る） ==============
const COUNTRY_LIST = [
  {code:'JP',name:'Japan'},{code:'US',name:'United States'},{code:'KR',name:'Korea'},
  {code:'CN',name:'China'},{code:'GB',name:'United Kingdom'},{code:'FR',name:'France'},
  {code:'DE',name:'Germany'},{code:'BR',name:'Brazil'},{code:'IN',name:'India'},
  {code:'RU',name:'Russia'},{code:'CA',name:'Canada'},{code:'AU',name:'Australia'}
];

const countrySel = document.getElementById('countrySelect');
COUNTRY_LIST.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;countrySel.append(o);});
countrySel.value='Japan';
let currentCountry = countrySel.value;
countrySel.addEventListener('change',()=>currentCountry=countrySel.value);

const tileStored = localStorage.getItem('tile') || '0.0005';   // 小さめに
let TILE = parseFloat(tileStored);
document.getElementById('tileCustom').value = TILE;

// Map
const map = L.map('map',{worldCopyJump:true}).setView([35.6762,139.6503],6);
const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap contributors', maxZoom:19, detectRetina:true, subdomains:'abc'
});
osm.on('tileerror', (e)=>console.error('OSM tile error:', e));
osm.addTo(map);
setTimeout(()=>map.invalidateSize(), 100);  // レイアウト後のサイズ調整

// グリッド処理
const layerTiles = L.layerGroup().addTo(map);
const snap = v => Math.floor(v / TILE) * TILE;
const keyFromLatLng = (lat,lng)=>`${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;
const rectFor = (lat,lng,color)=>{
  const lat0=snap(lat),lng0=snap(lng);
  return L.rectangle([[lat0,lng0],[lat0+TILE,lng0+TILE]],{color,fillColor:color,fillOpacity:.5,weight:1});
};

// ピクセルサイズ UI
document.querySelectorAll('.seg-btn[data-tile]').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.seg-btn[data-tile]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    setTile(parseFloat(b.dataset.tile));
  });
});
document.getElementById('tileApply').addEventListener('click',()=>{
  const v=parseFloat(document.getElementById('tileCustom').value);
  if(!isFinite(v)||v<=0){alert('Invalid value');return;}
  setTile(v);
});
function setTile(v){
  TILE=v; localStorage.setItem('tile',String(v));
  // 表示しているタイルをサイズ変更に合わせて描き直したい場合は、Firestoreの再購読で対応（後述）。
  console.log('TILE size set to', TILE);
}

// ブラシ/カラー
let brushSize=1;
document.querySelectorAll('.seg-btn[data-brush]').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.seg-btn[data-brush]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    brushSize=Number(b.dataset.brush);
  });
});
const colorPicker=document.getElementById('colorPicker');
const colorHex=document.getElementById('colorHex');
colorPicker.addEventListener('input',e=>colorHex.value=e.target.value);
colorHex.addEventListener('input',e=>{
  if(/^#?[0-9a-fA-F]{6}$/.test(e.target.value)){
    const v=e.target.value.startsWith('#')?e.target.value:'#'+e.target.value;
    colorPicker.value=v;
  }
});

// クールダウン
const BRUSH_COOLDOWN={1:10,2:40,3:90};
let lastPaintAt=0;
const cooldownWrap=document.getElementById('cooldown');
const cooldownFill=document.getElementById('cooldownFill');
const cooldownText=document.getElementById('cooldownText');
function showCooldown(sec){
  const end=Date.now()+sec*1000;
  cooldownWrap.classList.remove('hidden');
  const t=setInterval(()=>{
    const left=end-Date.now();
    if(left<=0){ cooldownFill.style.width='0%'; cooldownText.textContent='0s'; cooldownWrap.classList.add('hidden'); clearInterval(t); return; }
    cooldownText.textContent=Math.ceil(left/1000)+'s';
    cooldownFill.style.width = ((sec*1000-left)/(sec*1000)*100)+'%';
  },100);
}
const inCd=()=>Date.now()-lastPaintAt < BRUSH_COOLDOWN[brushSize]*1000;

// ============== Firebase（地図が出た後で読み込み。失敗しても描画は継続） ==============
let auth=null, db=null, user=null;
const signInBtn=document.getElementById('signInBtn');
const signOutBtn=document.getElementById('signOutBtn');

(async function bootFirebase(){
  try{
    const [{initializeApp},{getAuth,onAuthStateChanged,signInAnonymously,signOut},
           {getFirestore,collection,doc,setDoc,onSnapshot,serverTimestamp,query,orderBy,limit,increment,docSnap,getDoc}] =
      await Promise.all([
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js'),
        import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js'),
      ]);

    const firebaseConfig = {
      apiKey: "YOUR_API_KEY",
      authDomain: "YOUR_PROJECT.firebaseapp.com",
      projectId: "YOUR_PROJECT_ID",
      storageBucket: "YOUR_PROJECT.appspot.com",
      messagingSenderId: "YOUR_SENDER",
      appId: "YOUR_APP_ID",
      measurementId: "G-XXXX"
    };

    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db   = getFirestore(app);

    // サインイン UI
    signInBtn.addEventListener('click', ()=>signInAnonymously(auth));
    signOutBtn.addEventListener('click', ()=>signOut(auth));

    onAuthStateChanged(auth, (u)=>{
      user=u;
      signInBtn.classList.toggle('hidden', !!u);
      signOutBtn.classList.toggle('hidden', !u);
      if(!u){ signInAnonymously(auth).catch(()=>{}); }
      subscribeMine(); // 自分の枚数
    });

    // クリックで塗る
    map.on('click', async (e)=>{
      if(!db){ alert('Backend not ready yet.'); return; }
      if(!user){ alert('Sign-in failed. Reload.'); return; }
      if(inCd()){ const left=Math.ceil((BRUSH_COOLDOWN[brushSize]*1000-(Date.now()-lastPaintAt))/1000); showCooldown(left); return; }

      const color=colorPicker.value;
      const baseLat=snap(e.latlng.lat);
      const baseLng=snap(e.latlng.lng);

      const ops=[];
      for(let dy=0; dy<brushSize; dy++){
        for(let dx=0; dx<brushSize; dx++){
          const lat = baseLat + dy*TILE;
          const lng = baseLng + dx*TILE;
          const key = keyFromLatLng(lat,lng);
          const ref = doc(db,'tiles',key);
          ops.push(setDoc(ref,{
            key,lat,lng,color,country:currentCountry,uid:user.uid||null,ts:serverTimestamp()
          },{merge:true}));
          rectFor(lat,lng,color).addTo(layerTiles); // 即時描画
        }
      }
      await Promise.all(ops);
      updateScores(db, brushSize*brushSize);
      lastPaintAt=Date.now(); showCooldown(BRUSH_COOLDOWN[brushSize]);
    });

    // 既存タイルを購読（TILE 変更時は再購読すると綺麗に引き直せます）
    const {collection: c, query: q, orderBy: ob, limit: lm, onSnapshot: os} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const unsubTiles = os(q(c(db,'tiles'), ob('ts','desc'), lm(5000)), snap=>{
      layerTiles.clearLayers();
      snap.forEach(s=>{
        const d=s.data(); rectFor(d.lat,d.lng,d.color).addTo(layerTiles);
      });
    });

    // Ranking
    subscribeRanking();

    // Stats 全体
    const {doc: d, onSnapshot: os2} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    os2(d(db,'stats','global'), s=>{
      document.getElementById('statTotal').textContent = s.exists()? (s.data().total||0):0;
    });

  }catch(err){
    console.error('[Firebase boot error] 地図は表示されますが、バックエンドは未使用になります:', err);
  }
})();

// 自分の枚数
function subscribeMine(){
  if(!db || !user){ document.getElementById('statMine').textContent=0; return; }
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({doc,onSnapshot})=>{
    onSnapshot(doc(db,'stats',`user-${user.uid}`), s=>{
      document.getElementById('statMine').textContent = s.exists()? (s.data().mine||0):0;
    });
  });
}

// スコア加算 + 期間キー
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
async function updateScores(db, n){
  const {doc,setDoc,increment} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
  const p=getPeriodKeys();
  await Promise.all([
    setDoc(doc(db,'scores',p.today,'countries',currentCountry),{count:increment(n)},{merge:true}),
    setDoc(doc(db,'scores',p.week ,'countries',currentCountry),{count:increment(n)},{merge:true}),
    setDoc(doc(db,'scores',p.month,'countries',currentCountry),{count:increment(n)},{merge:true}),
    setDoc(doc(db,'stats','global'), {total:increment(n)}, {merge:true}),
    user ? setDoc(doc(db,'stats',`user-${user.uid}`), {mine:increment(n)}, {merge:true}) : Promise.resolve()
  ]);
}

// Ranking
let unsubRanking=null;
function subscribeRanking(){
  if(!db) return;
  if(unsubRanking) unsubRanking();
  const periodBtn = document.querySelector('.seg-btn.active[data-period]')?.dataset.period || 'today';
  const {today,week,month} = getPeriodKeys();
  const key = {today,week,month}[periodBtn];
  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({collection,query,orderBy,limit,onSnapshot})=>{
    const ref=collection(db,'scores',key,'countries');
    unsubRanking = onSnapshot(query(ref,orderBy('count','desc'),limit(10)), snap=>{
      const ul=document.getElementById('rankingList'); ul.innerHTML='';
      if(snap.empty){ ul.innerHTML='<li>No data yet</li>'; return; }
      snap.forEach(d=>{
        const li=document.createElement('li');
        li.innerHTML=`<span>${d.id}</span><strong>${d.data().count||0}</strong>`;
        ul.append(li);
      });
    });
  });
}
document.querySelectorAll('.seg-btn[data-period]').forEach(b=>b.addEventListener('click',e=>{
  document.querySelectorAll('.seg-btn[data-period]').forEach(x=>x.classList.remove('active'));
  b.classList.add('active');
  subscribeRanking();
}));

// オンライン人数（ダミー）
setInterval(()=>document.getElementById('statOnline').textContent=Math.floor(200+Math.random()*600),8000);
