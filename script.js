/***** 画面に即エラーを出すガード（原因特定用） *****/
window.addEventListener('error', (e) => {
  console.error(e.error || e);
  const el = document.getElementById('notification');
  if (!el) return;
  el.textContent = `Error: ${e.message || e}`;
  el.className = 'notification show';
  el.style.background = 'linear-gradient(135deg, rgba(239,68,68,.95), rgba(185,28,28,.95))';
  setTimeout(()=>el.classList.remove('show'), 5000);
});

/***** 設定（超細かいマス） *****/
const GRID_SIZE = 0.0001;      // 約11m
const COOLDOWN_TIME = 5000;
const INITIAL_TERRITORIES = 50;
const GRID_MIN_ZOOM = 17;      // グリッド表示はズーム17+
const GRID_MAX_CELLS = 800;    // 1画面の最大セル数

/***** 状態 *****/
let map;
let territories = new Map();           // key -> owner country code
let occupationStats = {};              // attacker -> victim -> count
let currentCountry = 'JP';
let canPlace = true;
let territoryMarkers, gridLayer, heatmapLayer;
let showGrid = false, showHeatmap = false;

/***** 国データ（必要に応じて追加OK） *****/
const countryData = {
  JP:{name:'Japan', flag:'🇯🇵', center:[35.6762,139.6503]},
  US:{name:'USA',   flag:'🇺🇸', center:[39.8283,-98.5795]},
  CN:{name:'China', flag:'🇨🇳', center:[35.8617,104.1954]},
  KR:{name:'Korea', flag:'🇰🇷', center:[36.5,127.8]},
  TW:{name:'Taiwan',flag:'🇹🇼', center:[23.6978,120.9605]},
  HK:{name:'Hong Kong', flag:'🇭🇰', center:[22.3193,114.1694]},
  SG:{name:'Singapore', flag:'🇸🇬', center:[1.3521,103.8198]},
  MY:{name:'Malaysia',  flag:'🇲🇾', center:[4.2105,101.9758]},
  TH:{name:'Thailand',  flag:'🇹🇭', center:[15.87,100.99]},
  VN:{name:'Vietnam',   flag:'🇻🇳', center:[14.0583,108.2772]},
  PH:{name:'Philippines',flag:'🇵🇭', center:[12.8797,121.774]},
  ID:{name:'Indonesia', flag:'🇮🇩', center:[-0.7893,113.9213]},
  IN:{name:'India',     flag:'🇮🇳', center:[20.5937,78.9629]},
  PK:{name:'Pakistan',  flag:'🇵🇰', center:[30.3753,69.3451]},
  BD:{name:'Bangladesh',flag:'🇧🇩', center:[23.685,90.3563]},
  RU:{name:'Russia',    flag:'🇷🇺', center:[61.524,105.319]},
  AU:{name:'Australia', flag:'🇦🇺', center:[-25.2744,133.7751]},
  NZ:{name:'New Zealand',flag:'🇳🇿', center:[-40.9006,174.8860]},
  GB:{name:'UK',        flag:'🇬🇧', center:[54,-2]},
  FR:{name:'France',    flag:'🇫🇷', center:[46.2276,2.2137]},
  DE:{name:'Germany',   flag:'🇩🇪', center:[51.1657,10.4515]},
  ES:{name:'Spain',     flag:'🇪🇸', center:[40.4637,-3.7492]},
  IT:{name:'Italy',     flag:'🇮🇹', center:[41.8719,12.5674]},
  PT:{name:'Portugal',  flag:'🇵🇹', center:[39.3999,-8.2245]},
  NL:{name:'Netherlands',flag:'🇳🇱', center:[52.1326,5.2913]},
  BE:{name:'Belgium',   flag:'🇧🇪', center:[50.5039,4.4699]},
  SE:{name:'Sweden',    flag:'🇸🇪', center:[60.1282,18.6435]},
  NO:{name:'Norway',    flag:'🇳🇴', center:[60.472,8.4689]},
  DK:{name:'Denmark',   flag:'🇩🇰', center:[56.2639,9.5018]},
  FI:{name:'Finland',   flag:'🇫🇮', center:[61.9241,25.7482]},
  IE:{name:'Ireland',   flag:'🇮🇪', center:[53.1424,-7.6921]},
  CA:{name:'Canada',    flag:'🇨🇦', center:[56.1304,-106.3468]},
  BR:{name:'Brazil',    flag:'🇧🇷', center:[-14.235,-51.9253]},
  AR:{name:'Argentina', flag:'🇦🇷', center:[-38.4161,-63.6167]},
  MX:{name:'Mexico',    flag:'🇲🇽', center:[23.6345,-102.5528]},
  CL:{name:'Chile',     flag:'🇨🇱', center:[-35.6751,-71.543]},
  CO:{name:'Colombia',  flag:'🇨🇴', center:[4.5709,-74.2973]},
  PE:{name:'Peru',      flag:'🇵🇪', center:[-9.19,-75.0152]},
};

/***** 国ごとの色（自動割り当て） *****/
function getColorForCountry(code){
  const hash = [...code].reduce((a,c)=>a+c.charCodeAt(0),0);
  const hue = (hash*137.5)%360;
  return `hsl(${hue},70%,55%)`;
}

/***** ユーティリティ *****/
const getGridCoord = (lat,lng)=>({ lat: Math.floor(lat/GRID_SIZE)*GRID_SIZE, lng: Math.floor(lng/GRID_SIZE)*GRID_SIZE });
const getCoordKey  = (lat,lng)=>{ const g=getGridCoord(lat,lng); return `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`; };

function showNotification(msg,type='info'){
  const el=document.getElementById('notification'); if(!el) return;
  el.textContent=msg; el.className='notification show';
  const colors={ success:'linear-gradient(135deg, rgba(74,222,128,.9), rgba(34,197,94,.9))',
                 error:'linear-gradient(135deg, rgba(239,68,68,.9), rgba(185,28,28,.9))',
                 warning:'linear-gradient(135deg, rgba(251,191,36,.9), rgba(217,119,6,.9))',
                 info:'linear-gradient(135deg, rgba(59,130,246,.9), rgba(29,78,216,.9))' };
  el.style.background = colors[type] || colors.info;
  setTimeout(()=>el.classList.remove('show'), 2600);
}

/***** セレクト生成 → マップ初期化の順 *****/
function populateCountrySelect(){
  const sel = document.getElementById('countrySelect');
  if(!sel) return;
  sel.innerHTML='';
  const codes = Object.keys(countryData).sort((a,b)=>countryData[a].name.localeCompare(countryData[b].name));
  for(const code of codes){
    const o=document.createElement('option');
    const c=countryData[code];
    o.value=code; o.textContent=`${c.flag} ${c.name}`;
    if(code===currentCountry) o.selected=true;
    sel.appendChild(o);
  }
}

/***** 地図 *****/
function initMap(){
  try{
    const center = (countryData[currentCountry] && countryData[currentCountry].center) || [35.6762,139.6503];
    map = L.map('map', { center, zoom:5, minZoom:2, maxZoom:19, worldCopyJump:true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,
      attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);

    territoryMarkers = L.layerGroup().addTo(map);
    gridLayer = L.layerGroup();
    heatmapLayer = L.layerGroup();

    map.on('click', e => { if(canPlace) placeTerritory(e.latlng.lat, e.latlng.lng); });
    map.on('moveend', ()=>{ if(showGrid) updateGrid(); });

    setTimeout(()=>map.invalidateSize(),0);
    window.addEventListener('resize', ()=>map.invalidateSize());
    return true;
  }catch(err){
    console.error(err);
    showNotification('Failed to initialize the map','error');
    return false;
  }
}

/***** ゲームコア *****/
function createTerritoryMarker(lat,lng,country){
  const g = getGridCoord(lat,lng);
  return L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{
    color:getColorForCountry(country),
    fillColor:getColorForCountry(country),
    fillOpacity:.45,
    weight:1
  }).on('click', (e)=>{ L.DomEvent.stopPropagation(e); if(canPlace) placeTerritory(g.lat+GRID_SIZE/2,g.lng+GRID_SIZE/2); })
    .on('mouseover', function(){ this.setStyle({fillOpacity:.65}); })
    .on('mouseout',  function(){ this.setStyle({fillOpacity:.45}); });
}

function redrawTerritories(){
  territoryMarkers.clearLayers();
  territories.forEach((owner,key)=>{
    const [lat,lng]=key.split(',').map(Number);
    createTerritoryMarker(lat,lng,owner).addTo(territoryMarkers);
  });
}

function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key = getCoordKey(lat,lng);
  const prev = territories.get(key);
  if(prev === currentCountry){ showNotification('Already your territory','warning'); return; }

  territories.set(key,currentCountry);
  redrawTerritories();

  if(prev && prev!==currentCountry){
    occupationStats[currentCountry] ??= {};
    occupationStats[currentCountry][prev] = (occupationStats[currentCountry][prev]||0)+1;
    updateOccupationStats();
  }

  startCooldown();
  updateStats();
  addActivity(currentCountry, key, prev);
  updateLeaderboard();
}

function startCooldown(){
  canPlace=false;
  const bar=document.getElementById('cooldownBar'), fill=document.getElementById('cooldownFill'), time=document.getElementById('cooldownTime');
  bar.classList.add('active');
  let left=COOLDOWN_TIME;
  const id=setInterval(()=>{
    left-=100;
    fill.style.width=((COOLDOWN_TIME-left)/COOLDOWN_TIME*100)+'%';
    time.textContent=Math.max(0,Math.ceil(left/1000))+'s';
    if(left<=0){ clearInterval(id); bar.classList.remove('active'); canPlace=true; }
  },100);
}

function updateStats(){
  const total = territories.size;
  const mine  = Array.from(territories.values()).filter(c=>c===currentCountry).length;
  const elT = document.getElementById('totalTerritories');
  const elM = document.getElementById('myTerritories');
  if (elT) elT.textContent = total;
  if (elM) elM.textContent = mine;

  // Online は presence が上書きする（ここでは何もしない）
  const max=200000;
  const occ = document.getElementById('occupancyRate');
  if (occ) occ.textContent = Math.round(total/max*100)+'%';
}

function updateLeaderboard(){
  const counts={}; territories.forEach(c=>counts[c]=(counts[c]||0)+1);
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const box=document.getElementById('leaderboardList');
  if (!box) return;
  box.innerHTML = top.map(([code,count],i)=>{
    const d=countryData[code]||{name:code,flag:''}; const rk=i<3?`rank-${i+1}`:'';
    return `<div class="leaderboard-item">
      <span class="rank ${rk}">${i+1}</span>
      <span class="country-info"><span>${d.flag}</span><span>${d.name}</span></span>
      <span class="territory-count">${count}</span>
    </div>`;
  }).join('');
}

function addActivity(country,key,old){
  const box=document.getElementById('activityList'); if(!box) return;
  const d=countryData[country]||{name:country,flag:''};
  const msg = old && old!==country ? `${d.flag} captured from ${countryData[old]?.flag||old}` : `${d.flag} ${d.name} captured a tile`;
  const el=document.createElement('div'); el.className='activity-item'; el.style.borderLeftColor=getColorForCountry(country);
  el.innerHTML=`<div style="font-weight:700">${msg}</div><div style="opacity:.6;font-size:12px">📍 ${key} | ${new Date().toLocaleTimeString()}</div>`;
  box.prepend(el); while(box.children.length>6) box.removeChild(box.lastChild);
}

function updateOccupationStats(){
  const box=document.getElementById('occupationStats'); if(!box) return;
  let html='';
  for(const atk in occupationStats){
    for(const vic in occupationStats[atk]){
      html += `<div>${countryData[atk]?.flag||''} ${countryData[atk]?.name||atk} → ${countryData[vic]?.flag||''} ${countryData[vic]?.name||vic}: <strong>${occupationStats[atk][vic]}</strong></div>`;
    }
  }
  box.innerHTML = html || '<i>No occupations yet</i>';
}

/***** Grid / Heatmap（超細かいマス向けに制限） *****/
function toggleGrid(){ showGrid=!showGrid; if(showGrid){ updateGrid(); gridLayer.addTo(map); } else gridLayer.remove(); }
function updateGrid(){
  gridLayer.clearLayers();
  if(map.getZoom()<GRID_MIN_ZOOM){ showNotification(`Zoom in (≥${GRID_MIN_ZOOM}) to show grid`,'info'); return; }
  const b=map.getBounds();
  const latSteps=Math.ceil((b.getNorth()-b.getSouth())/GRID_SIZE);
  const lngSteps=Math.ceil((b.getEast()-b.getWest())/GRID_SIZE);
  if(latSteps*lngSteps>GRID_MAX_CELLS){ showNotification('Grid too dense; zoom in more','warning'); return; }
  for(let lat=Math.floor(b.getSouth()/GRID_SIZE)*GRID_SIZE; lat<=b.getNorth(); lat+=GRID_SIZE){
    for(let lng=Math.floor(b.getWest()/GRID_SIZE)*GRID_SIZE;  lng<=b.getEast();  lng+=GRID_SIZE){
      L.rectangle([[lat,lng],[lat+GRID_SIZE,lng+GRID_SIZE]],{color:'rgba(255,255,255,.25)',weight:1,fill:false,interactive:false}).addTo(gridLayer);
    }
  }
}

function toggleHeatmap(){ showHeatmap=!showHeatmap; showNotification(showHeatmap?'Heatmap ON':'Heatmap OFF','info'); if(showHeatmap){ updateHeatmap(); heatmapLayer.addTo(map); } else heatmapLayer.remove(); }
function updateHeatmap(){
  heatmapLayer.clearLayers();
  const AGG=0.02; // 集計粗さ（負荷軽減）
  const density=new Map();
  territories.forEach((_,key)=>{ const [lat,lng]=key.split(',').map(Number); const rkey=`${Math.floor(lat/AGG)*AGG},${Math.floor(lng/AGG)*AGG}`; density.set(rkey,(density.get(rkey)||0)+1); });
  density.forEach((cnt,key)=>{ const [lat,lng]=key.split(',').map(Number); const op=Math.min(.1*cnt,.8);
    L.rectangle([[lat,lng],[lat+AGG,lng+AGG]],{color:'#ff0000',fillColor:'#ff0000',fillOpacity:op,weight:0,interactive:false}).addTo(heatmapLayer);
  });
}

/***** カメラ *****/
function centerOnMyCountry(){ const c=countryData[currentCountry]?.center||[35.6762,139.6503]; map.flyTo(c, 17, {animate:true,duration:1}); }
function resetView(){ const c=countryData[currentCountry]?.center||[35.6762,139.6503]; map.setView(c, 5); showNotification('View reset','info'); }

/***** 初期データ *****/
function initializeGame(){
  for(let i=0;i<INITIAL_TERRITORIES;i++){
    const codes=Object.keys(countryData); const cc=codes[Math.floor(Math.random()*codes.length)];
    const ctr=countryData[cc].center;
    const lat=ctr[0]+(Math.random()-.5)*0.3, lng=ctr[1]+(Math.random()-.5)*0.3;
    territories.set(getCoordKey(lat,lng), cc);
  }
  redrawTerritories(); updateStats(); updateLeaderboard(); updateHotspot();
}
function updateHotspot(){
  const hs=['Tokyo','New York','London','Paris','Beijing','Moscow','Sydney','São Paulo'];
  const el = document.getElementById('hotspot'); if (el) el.textContent = hs[Math.floor(Math.random()*hs.length)];
}

/***** Firebase Presence（未設定でも安全に無視） *****/
function startPresenceSafe(){
  try{
    // Firebase SDK/初期化が無い場合はスキップ
    if (!window.firebase || !firebase.apps || !firebase.apps.length) {
      console.warn('Firebase not initialized. Skipping presence.');
      return;
    }
    const db  = firebase.database?.();
    const auth= firebase.auth?.();
    if (!db || !auth) { console.warn('Firebase DB/Auth not available'); return; }

    auth.signInAnonymously().catch(console.error);
    auth.onAuthStateChanged((user)=>{
      if(!user) return;
      const uid = user.uid;
      const connectedRef = db.ref('.info/connected');
      connectedRef.on('value', (snap)=>{
        if (snap.val() === true) {
          const userStatusRef = db.ref(`/status/${uid}`);
          userStatusRef.onDisconnect().set({ state:'offline', last_changed: firebase.database.ServerValue.TIMESTAMP })
            .then(()=> userStatusRef.set({ state:'online', last_changed: firebase.database.ServerValue.TIMESTAMP }));
        }
      });

      const statusRef = db.ref('/status');
      statusRef.on('value', (snapshot)=>{
        let onlineCount=0;
        snapshot.forEach(child => { const v=child.val(); if(v && v.state==='online') onlineCount++; });
        const el = document.getElementById('onlineUsers'); if (el) el.textContent = onlineCount;
      });
    });
  }catch(err){
    console.error('Presence error', err);
  }
}

/***** 起動 *****/
document.addEventListener('DOMContentLoaded', ()=>{
  try{
    populateCountrySelect();
    const sel = document.getElementById('countrySelect');
    if (sel) sel.addEventListener('change', (e)=>{ currentCountry = e.target.value; updateStats(); showNotification(`Changed to ${countryData[currentCountry]?.name||currentCountry}`,'info'); });

    startPresenceSafe();                             // Firebase があれば実人数、無ければスキップ
    if (initMap()) {
      initializeGame();
      setInterval(()=>{ if(Math.random()>.3) simulateAIPlayers(); }, 5000);
      setInterval(updateHotspot, 15000);
      showNotification('Game started! Click the map to capture tiles','success');
    }
  }catch(err){
    console.error(err);
    showNotification('Startup error','error');
  }
});

/***** 簡易AI *****/
function simulateAIPlayers(){
  const others = Object.keys(countryData).filter(c=>c!==currentCountry);
  const cc = others[Math.floor(Math.random()*others.length)];
  let lat,lng;
  if(Math.random()<0.7 && territories.size){
    const own = Array.from(territories.entries()).filter(([k,c])=>c===cc);
    if(own.length){
      const [base] = own[Math.floor(Math.random()*own.length)];
      const [blat,blng] = base.split(',').map(Number);
      lat = blat + (Math.random()-.5)*GRID_SIZE*20;
      lng = blng + (Math.random()-.5)*GRID_SIZE*20;
    }else{
      const ctr = countryData[cc].center; lat = ctr[0]+(Math.random()-.5)*0.2; lng = ctr[1]+(Math.random()-.5)*0.2;
    }
  }else{
    lat = (Math.random()*140)-70; lng = (Math.random()*360)-180;
  }
  const key=getCoordKey(lat,lng), old=territories.get(key);
  territories.set(key,cc); redrawTerritories(); addActivity(cc,key,old); updateLeaderboard(); updateStats();
}

/***** HTML ボタン公開 *****/
window.toggleGrid = toggleGrid;
window.toggleHeatmap = toggleHeatmap;
window.centerOnMyCountry = centerOnMyCountry;
window.resetView = resetView;
