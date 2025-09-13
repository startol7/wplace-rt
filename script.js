// ===== グローバル状態 =====
let map;
let territories = new Map();
let currentCountry = 'JP';
let canPlace = true;
let territoryMarkers;
let gridLayer;
let heatmapLayer;
let showGrid = false;
let showHeatmap = false;

// ===== 設定 =====
const GRID_SIZE = 0.5;           // グリッド1マスの度数
const COOLDOWN_TIME = 5000;      // クリック後のクールダウン(ms)
const INITIAL_TERRITORIES = 50;  // 初期配置

// ===== 国データ =====
const countryData = {
  JP:{name:'日本',color:'#ff4b4b',flag:'🇯🇵',center:[35.6762,139.6503]},
  US:{name:'アメリカ',color:'#4b8bff',flag:'🇺🇸',center:[39.8283,-98.5795]},
  CN:{name:'中国',color:'#ffeb3b',flag:'🇨🇳',center:[35.8617,104.1954]},
  KR:{name:'韓国',color:'#4bff4b',flag:'🇰🇷',center:[36.5,127.8]},
  GB:{name:'イギリス',color:'#ff4bff',flag:'🇬🇧',center:[55.3781,-3.4360]},
  FR:{name:'フランス',color:'#4bffff',flag:'🇫🇷',center:[46.2276,2.2137]},
  DE:{name:'ドイツ',color:'#ff8b4b',flag:'🇩🇪',center:[51.1657,10.4515]},
  BR:{name:'ブラジル',color:'#8bff4b',flag:'🇧🇷',center:[-14.2350,-51.9253]},
  IN:{name:'インド',color:'#ff4b8b',flag:'🇮🇳',center:[20.5937,78.9629]},
  RU:{name:'ロシア',color:'#8b4bff',flag:'🇷🇺',center:[61.5240,105.3188]},
  AU:{name:'オーストラリア',color:'#ffaa00',flag:'🇦🇺',center:[-25.2744,133.7751]},
  CA:{name:'カナダ',color:'#00ffaa',flag:'🇨🇦',center:[56.1304,-106.3468]}
};

// ===== マップ初期化 =====
function initMap(){
  try{
    const [lat,lng] = countryData[currentCountry].center;
    map = L.map('map', {
      center:[lat,lng],
      zoom:5,
      minZoom:2,
      maxZoom:10,
      worldCopyJump:true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19,
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    territoryMarkers = L.layerGroup().addTo(map);
    gridLayer = L.layerGroup();
    heatmapLayer = L.layerGroup();

    // クリックで配置
    map.on('click', e => { if (canPlace) placeTerritory(e.latlng.lat, e.latlng.lng); });
    // 移動時にグリッド再描画
    map.on('moveend', () => { if (showGrid) updateGrid(); });

    // Leaflet のサイズ計算（重要）
    setTimeout(() => map.invalidateSize(), 0);
    window.addEventListener('resize', () => map.invalidateSize());

    console.log('Leaflet loaded:', typeof L !== 'undefined');
    return true;
  }catch(err){
    console.error('Error initializing map:', err);
    showNotification('地図の初期化に失敗しました','error');
    return false;
  }
}

// ===== 座標系ユーティリティ =====
const getGridCoord = (lat,lng)=>({
  lat: Math.floor(lat / GRID_SIZE) * GRID_SIZE,
  lng: Math.floor(lng / GRID_SIZE) * GRID_SIZE
});
const getCoordKey = (lat,lng)=>{
  const g = getGridCoord(lat,lng);
  return `${g.lat.toFixed(1)},${g.lng.toFixed(1)}`;
};

// ===== 領土マーカー =====
function createTerritoryMarker(lat,lng,country){
  const g = getGridCoord(lat,lng);
  const rect = L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{
    color: countryData[country].color,
    fillColor: countryData[country].color,
    fillOpacity:.4,
    weight:2
  });

  rect.on('click', (e)=>{
    L.DomEvent.stopPropagation(e);
    if (canPlace) placeTerritory(g.lat+GRID_SIZE/2, g.lng+GRID_SIZE/2);
  });
  rect.on('mouseover', function(){ this.setStyle({fillOpacity:.6}); });
  rect.on('mouseout',  function(){ this.setStyle({fillOpacity:.4}); });
  return rect;
}

// ===== 配置処理 =====
function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key = getCoordKey(lat,lng);
  const prev = territories.get(key);

  if(prev === currentCountry){
    showNotification('既に自国の領土です！','warning');
    return;
  }

  territories.set(key,currentCountry);
  redrawTerritories();

  // ポップアップ
  const g = getGridCoord(lat,lng);
  const popup = L.popup()
    .setLatLng([g.lat+GRID_SIZE/2, g.lng+GRID_SIZE/2])
    .setContent(`<b>${countryData[currentCountry].flag} ${countryData[currentCountry].name}</b> が領土を獲得！`)
    .openOn(map);
  setTimeout(()=>map.closePopup(popup), 2500);

  startCooldown();
  updateStats();
  addActivity(currentCountry, key, prev);
  updateLeaderboard();

  if(prev && prev !== currentCountry){
    showNotification(`${countryData[prev].name} から領土を奪取！`,'success');
  }

  // AI
  setTimeout(()=>simulateAIPlayers(), Math.random()*3000+1000);
}

// 再描画
function redrawTerritories(){
  territoryMarkers.clearLayers();
  territories.forEach((country,key)=>{
    const [lat,lng] = key.split(',').map(Number);
    createTerritoryMarker(lat,lng,country).addTo(territoryMarkers);
  });
}

// クールダウン
function startCooldown(){
  canPlace = false;
  const bar  = document.getElementById('cooldownBar');
  const fill = document.getElementById('cooldownFill');
  const time = document.getElementById('cooldownTime');
  bar.classList.add('active');

  let left = COOLDOWN_TIME;
  const id = setInterval(()=>{
    left -= 100;
    const p = (COOLDOWN_TIME-left)/COOLDOWN_TIME*100;
    fill.style.width = p+'%';
    time.textContent = Math.max(0,Math.ceil(left/1000))+'s';
    if(left<=0){ clearInterval(id); bar.classList.remove('active'); canPlace = true; }
  },100);
}

// 統計
function updateStats(){
  const total = territories.size;
  const mine  = Array.from(territories.values()).filter(c => c===currentCountry).length;
  document.getElementById('totalTerritories').textContent = total;
  document.getElementById('myTerritories').textContent    = mine;
  document.getElementById('onlineUsers').textContent      = Math.floor(Math.random()*500)+200;

  const max = 1000;
  document.getElementById('occupancyRate').textContent = Math.round(total/max*100)+'%';
}

// ランキング
function updateLeaderboard(){
  const counts = {};
  territories.forEach(c => counts[c]=(counts[c]||0)+1);
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);

  const box = document.getElementById('leaderboardList');
  box.innerHTML = top.map(([cc,count],i)=>{
    const d = countryData[cc]; const rk = i<3?`rank-${i+1}`:'';
    return `<div class="leaderboard-item">
      <span class="rank ${rk}">${i+1}</span>
      <span class="country-info"><span>${d.flag}</span><span>${d.name}</span></span>
      <span class="territory-count">${count}</span>
    </div>`;
  }).join('');
}

// ログ
function addActivity(country,key,old){
  const list = document.getElementById('activityList');
  const d = countryData[country];
  const tm = new Date().toLocaleTimeString();
  const msg = old&&old!==country ? `${d.flag} が ${countryData[old].flag} から領土を奪取！` : `${d.flag} ${d.name}が新領土を獲得`;
  const el = document.createElement('div');
  el.className = 'activity-item';
  el.style.borderLeftColor = d.color;
  el.innerHTML = `<div style="font-weight:700">${msg}</div><div style="opacity:.6;font-size:12px">📍 ${key} | ${tm}</div>`;
  list.prepend(el);
  while(list.children.length>5) list.removeChild(list.lastChild);
}

// AI
function simulateAIPlayers(){
  const others = Object.keys(countryData).filter(c=>c!==currentCountry);
  const cc = others[Math.floor(Math.random()*others.length)];

  let lat,lng;
  if(Math.random()<0.7 && territories.size>0){
    const own = Array.from(territories.entries()).filter(([k,c])=>c===cc);
    if(own.length){
      const [base] = own[Math.floor(Math.random()*own.length)];
      const [blat,blng] = base.split(',').map(Number);
      lat = blat + (Math.random()-.5)*GRID_SIZE*4;
      lng = blng + (Math.random()-.5)*GRID_SIZE*4;
    }else{
      const ctr = countryData[cc].center;
      lat = ctr[0] + (Math.random()-.5)*10;
      lng = ctr[1] + (Math.random()-.5)*10;
    }
  }else{
    lat = (Math.random()*140)-70;
    lng = (Math.random()*360)-180;
  }

  const key = getCoordKey(lat,lng);
  const old = territories.get(key);
  territories.set(key,cc);
  redrawTerritories();
  addActivity(cc,key,old);
  updateLeaderboard();
  updateStats();
}

// グリッド
function toggleGrid(){
  showGrid = !showGrid;
  if(showGrid){ updateGrid(); gridLayer.addTo(map); }
  else { gridLayer.remove(); }
}
function updateGrid(){
  gridLayer.clearLayers();
  const b = map.getBounds();
  for(let lat=Math.floor(b.getSouth()); lat<=Math.ceil(b.getNorth()); lat+=GRID_SIZE){
    for(let lng=Math.floor(b.getWest()); lng<=Math.ceil(b.getEast()); lng+=GRID_SIZE){
      L.rectangle([[lat,lng],[lat+GRID_SIZE,lng+GRID_SIZE]],{
        color:'rgba(255,255,255,.25)', weight:1, fill:false, interactive:false
      }).addTo(gridLayer);
    }
  }
}

// ヒート
function toggleHeatmap(){
  showHeatmap = !showHeatmap;
  showNotification(showHeatmap?'ヒートマップ表示ON':'ヒートマップ表示OFF','info');
  if(showHeatmap){ updateHeatmap(); heatmapLayer.addTo(map); }
  else { heatmapLayer.remove(); }
}
function updateHeatmap(){
  heatmapLayer.clearLayers();
  const density = new Map();
  territories.forEach((_,key)=>{
    const [lat,lng] = key.split(',').map(Number);
    const rkey = `${Math.floor(lat/5)*5},${Math.floor(lng/5)*5}`;
    density.set(rkey, (density.get(rkey)||0)+1);
  });
  density.forEach((count,key)=>{
    const [lat,lng] = key.split(',').map(Number);
    const op = Math.min(count*0.1, .8);
    L.rectangle([[lat,lng],[lat+5,lng+5]],{
      color:'#ff0000', fillColor:'#ff0000', fillOpacity:op, weight:0, interactive:false
    }).addTo(heatmapLayer);
  });
}

// 中心移動
function centerOnMyCountry(){
  const c = countryData[currentCountry].center;
  map.flyTo(c, 6, {animate:true, duration:1.2});
}
function resetView(){
  map.setView(countryData[currentCountry].center, 5);
  showNotification('ビューをリセットしました','info');
}

// 通知
function showNotification(msg, type='info'){
  const el = document.getElementById('notification');
  el.textContent = msg;
  el.className = 'notification show';
  const colors = {
    success:'linear-gradient(135deg, rgba(74,222,128,.9) 0%, rgba(34,197,94,.9) 100%)',
    error:'linear-gradient(135deg, rgba(239,68,68,.9) 0%, rgba(185,28,28,.9) 100%)',
    warning:'linear-gradient(135deg, rgba(251,191,36,.9) 0%, rgba(217,119,6,.9) 100%)',
    info:'linear-gradient(135deg, rgba(59,130,246,.9) 0%, rgba(29,78,216,.9) 100%)'
  };
  el.style.background = colors[type] || colors.info;
  setTimeout(()=>el.classList.remove('show'), 2600);
}

// 初期データ
function initializeGame(){
  for(let i=0;i<INITIAL_TERRITORIES;i++){
    const codes = Object.keys(countryData);
    const cc = codes[Math.floor(Math.random()*codes.length)];
    const ctr = countryData[cc].center;
    const lat = ctr[0] + (Math.random()-.5)*20;
    const lng = ctr[1] + (Math.random()-.5)*20;
    territories.set(getCoordKey(lat,lng), cc);
  }
  redrawTerritories();
  updateStats();
  updateLeaderboard();
  updateHotspot();
}

// ホットスポット（ダミー）
function updateHotspot(){
  const hs = ['東京','ニューヨーク','ロンドン','パリ','北京','モスクワ','シドニー','サンパウロ'];
  document.getElementById('hotspot').textContent = hs[Math.floor(Math.random()*hs.length)];
}

// DOM準備
document.addEventListener('DOMContentLoaded', ()=>{
  if(initMap()){
    initializeGame();

    document.getElementById('countrySelect').addEventListener('change', e=>{
      currentCountry = e.target.value;
      updateStats();
      showNotification(`${countryData[currentCountry].flag} ${countryData[currentCountry].name}に変更しました`,'info');
    });

    setInterval(()=>{ if(Math.random()>0.3) simulateAIPlayers(); }, 5000);
    setInterval(()=>{ document.getElementById('onlineUsers').textContent = Math.floor(Math.random()*500)+200; }, 10000);
    setInterval(updateHotspot, 15000);

    showNotification('ゲーム開始！ 地図をクリックして領土を配置しよう','success');
  }
});

// HTML から呼び出すために公開
window.toggleGrid = toggleGrid;
window.toggleHeatmap = toggleHeatmap;
window.centerOnMyCountry = centerOnMyCountry;
window.resetView = resetView;
