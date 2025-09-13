// ===== Global state =====
let map;
let territories = new Map();
let currentCountry = 'JP';
let canPlace = true;
let territoryMarkers;
let gridLayer;
let heatmapLayer;
let showGrid = false;
let showHeatmap = false;

// ===== Settings =====
const GRID_SIZE = 0.001;         // ~100m grid
const COOLDOWN_TIME = 5000;      // ms
const INITIAL_TERRITORIES = 50;  // initial random tiles
// Grid rendering safety (avoid millions of rectangles)
const GRID_MIN_ZOOM = 13;
const GRID_MAX_CELLS = 1200;

// ===== Country data =====
const countryData = {
  JP:{name:'Japan',color:'#ff4b4b',flag:'🇯🇵',center:[35.6762,139.6503]},
  US:{name:'USA',color:'#4b8bff',flag:'🇺🇸',center:[39.8283,-98.5795]},
  CN:{name:'China',color:'#ffeb3b',flag:'🇨🇳',center:[35.8617,104.1954]},
  KR:{name:'Korea',color:'#4bff4b',flag:'🇰🇷',center:[36.5,127.8]},
  GB:{name:'UK',color:'#ff4bff',flag:'🇬🇧',center:[55.3781,-3.4360]},
  FR:{name:'France',color:'#4bffff',flag:'🇫🇷',center:[46.2276,2.2137]},
  DE:{name:'Germany',color:'#ff8b4b',flag:'🇩🇪',center:[51.1657,10.4515]},
  BR:{name:'Brazil',color:'#8bff4b',flag:'🇧🇷',center:[-14.2350,-51.9253]},
  IN:{name:'India',color:'#ff4b8b',flag:'🇮🇳',center:[20.5937,78.9629]},
  RU:{name:'Russia',color:'#8b4bff',flag:'🇷🇺',center:[61.5240,105.3188]},
  AU:{name:'Australia',color:'#ffaa00',flag:'🇦🇺',center:[-25.2744,133.7751]},
  CA:{name:'Canada',color:'#00ffaa',flag:'🇨🇦',center:[56.1304,-106.3468]}
};

// ===== Map init =====
function initMap(){
  try{
    const [lat,lng] = countryData[currentCountry].center;
    map = L.map('map', { center:[lat,lng], zoom:5, minZoom:2, maxZoom:19, worldCopyJump:true });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    territoryMarkers = L.layerGroup().addTo(map);
    gridLayer = L.layerGroup();
    heatmapLayer = L.layerGroup();

    map.on('click', e => { if (canPlace) placeTerritory(e.latlng.lat, e.latlng.lng); });
    map.on('moveend', () => { if (showGrid) updateGrid(); });

    // Ensure correct size after layout
    setTimeout(() => map.invalidateSize(), 0);
    window.addEventListener('resize', () => map.invalidateSize());

    console.log('Leaflet loaded:', typeof L !== 'undefined');
    return true;
  }catch(err){
    console.error('Error initializing map:', err);
    showNotification('Failed to initialize the map','error');
    return false;
  }
}

// ===== Grid helpers =====
const getGridCoord = (lat,lng)=>({ lat: Math.floor(lat/GRID_SIZE)*GRID_SIZE, lng: Math.floor(lng/GRID_SIZE)*GRID_SIZE });
const getCoordKey  = (lat,lng)=>{ const g=getGridCoord(lat,lng); return `${g.lat.toFixed(3)},${g.lng.toFixed(3)}`; };

// ===== Tiles =====
function createTerritoryMarker(lat,lng,country){
  const g = getGridCoord(lat,lng);
  const rect = L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{
    color: countryData[country].color,
    fillColor: countryData[country].color,
    fillOpacity:.45, weight:1
  });
  rect.on('click', (e)=>{ L.DomEvent.stopPropagation(e); if (canPlace) placeTerritory(g.lat+GRID_SIZE/2, g.lng+GRID_SIZE/2); });
  rect.on('mouseover', function(){ this.setStyle({fillOpacity:.65}); });
  rect.on('mouseout',  function(){ this.setStyle({fillOpacity:.45}); });
  return rect;
}

function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key = getCoordKey(lat,lng);
  const prev = territories.get(key);
  if(prev === currentCountry){ showNotification('Already your territory','warning'); return; }

  territories.set(key,currentCountry);
  redrawTerritories();

  const g = getGridCoord(lat,lng);
  const popup = L.popup()
    .setLatLng([g.lat+GRID_SIZE/2, g.lng+GRID_SIZE/2])
    .setContent(`<b>${countryData[currentCountry].flag} ${countryData[currentCountry].name}</b> captured a tile!`)
    .openOn(map);
  setTimeout(()=>map.closePopup(popup), 2200);

  startCooldown();
  updateStats();
  addActivity(currentCountry, key, prev);
  updateLeaderboard();

  if(prev && prev!==currentCountry) showNotification(`Captured from ${countryData[prev].name}`,'success');

  setTimeout(()=>simulateAIPlayers(), Math.random()*3000+1000);
}

function redrawTerritories(){
  territoryMarkers.clearLayers();
  territories.forEach((country,key)=>{
    const [lat,lng] = key.split(',').map(Number);
    createTerritoryMarker(lat,lng,country).addTo(territoryMarkers);
  });
}

// ===== Cooldown & stats =====
function startCooldown(){
  canPlace = false;
  const bar=document.getElementById('cooldownBar'), fill=document.getElementById('cooldownFill'), time=document.getElementById('cooldownTime');
  bar.classList.add('active');
  let left=COOLDOWN_TIME;
  const id=setInterval(()=>{
    left-=100;
    fill.style.width = ((COOLDOWN_TIME-left)/COOLDOWN_TIME*100)+'%';
    time.textContent = Math.max(0,Math.ceil(left/1000))+'s';
    if(left<=0){ clearInterval(id); bar.classList.remove('active'); canPlace=true; }
  },100);
}

function updateStats(){
  const total = territories.size;
  const mine  = Array.from(territories.values()).filter(c=>c===currentCountry).length;
  document.getElementById('totalTerritories').textContent = total;
  document.getElementById('myTerritories').textContent    = mine;
  document.getElementById('onlineUsers').textContent      = Math.floor(Math.random()*500)+200;
  const max=100000; // virtual cap (small grid!)
  document.getElementById('occupancyRate').textContent = Math.round(total/max*100)+'%';
}

// ===== Leaderboard & log =====
function updateLeaderboard(){
  const counts={}; territories.forEach(c=>counts[c]=(counts[c]||0)+1);
  const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const box = document.getElementById('leaderboardList');
  box.innerHTML = top.map(([cc,count],i)=>{
    const d = countryData[cc]; const rk=i<3?`rank-${i+1}`:'';
    return `<div class="leaderboard-item">
      <span class="rank ${rk}">${i+1}</span>
      <span class="country-info"><span>${d.flag}</span><span>${d.name}</span></span>
      <span class="territory-count">${count}</span>
    </div>`;
  }).join('');
}

function addActivity(country,key,old){
  const list=document.getElementById('activityList'), d=countryData[country], tm=new Date().toLocaleTimeString();
  const msg = old&&old!==country ? `${d.flag} captured from ${countryData[old].flag}` : `${d.flag} ${d.name} captured a tile`;
  const el=document.createElement('div'); el.className='activity-item'; el.style.borderLeftColor=d.color;
  el.innerHTML = `<div style="font-weight:700">${msg}</div><div style="opacity:.6;font-size:12px">📍 ${key} | ${tm}</div>`;
  list.prepend(el); while(list.children.length>6) list.removeChild(list.lastChild);
}

// ===== AI =====
function simulateAIPlayers(){
  const others = Object.keys(countryData).filter(c=>c!==currentCountry);
  const cc = others[Math.floor(Math.random()*others.length)];
  let lat,lng;
  if(Math.random()<0.7 && territories.size>0){
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

// ===== Grid / Heatmap (safe for tiny GRID_SIZE) =====
function toggleGrid(){
  showGrid = !showGrid;
  if(showGrid){ updateGrid(); gridLayer.addTo(map); }
  else { gridLayer.remove(); }
}
function updateGrid(){
  gridLayer.clearLayers();
  if(map.getZoom() < GRID_MIN_ZOOM){ showNotification(`Zoom in (≥${GRID_MIN_ZOOM}) to show grid`,'info'); return; }
  const b=map.getBounds();
  const latSteps = Math.ceil((b.getNorth()-b.getSouth())/GRID_SIZE);
  const lngSteps = Math.ceil((b.getEast() -b.getWest() )/GRID_SIZE);
  if(latSteps*lngSteps > GRID_MAX_CELLS){ showNotification('Grid too dense; zoom in more','warning'); return; }

  for(let lat=Math.floor(b.getSouth()/GRID_SIZE)*GRID_SIZE; lat<=b.getNorth(); lat+=GRID_SIZE){
    for(let lng=Math.floor(b.getWest() /GRID_SIZE)*GRID_SIZE; lng<=b.getEast();  lng+=GRID_SIZE){
      L.rectangle([[lat,lng],[lat+GRID_SIZE,lng+GRID_SIZE]],{
        color:'rgba(255,255,255,.25)', weight:1, fill:false, interactive:false
      }).addTo(gridLayer);
    }
  }
}

function toggleHeatmap(){
  showHeatmap = !showHeatmap;
  showNotification(showHeatmap?'Heatmap ON':'Heatmap OFF','info');
  if(showHeatmap){ updateHeatmap(); heatmapLayer.addTo(map); }
  else { heatmapLayer.remove(); }
}
function updateHeatmap(){
  heatmapLayer.clearLayers();
  const AGG = 0.05; // aggregate in 0.05° buckets for performance
  const density=new Map();
  territories.forEach((_,key)=>{
    const [lat,lng] = key.split(',').map(Number);
    const rkey = `${Math.floor(lat/AGG)*AGG},${Math.floor(lng/AGG)*AGG}`;
    density.set(rkey,(density.get(rkey)||0)+1);
  });
  density.forEach((cnt,key)=>{
    const [lat,lng]=key.split(',').map(Number);
    const op = Math.min(0.1*cnt, .8);
    L.rectangle([[lat,lng],[lat+AGG,lng+AGG]],{ color:'#ff0000', fillColor:'#ff0000', fillOpacity:op, weight:0, interactive:false }).addTo(heatmapLayer);
  });
}

// ===== Camera =====
function centerOnMyCountry(){ map.flyTo(countryData[currentCountry].center, 14, {animate:true, duration:1}); }
function resetView(){ map.setView(countryData[currentCountry].center, 5); showNotification('View reset','info'); }

// ===== Toast =====
function showNotification(msg,type='info'){
  const el=document.getElementById('notification'); el.textContent=msg; el.className='notification show';
  const colors={ success:'linear-gradient(135deg, rgba(74,222,128,.9) 0%, rgba(34,197,94,.9) 100%)',
                 error:'linear-gradient(135deg, rgba(239,68,68,.9) 0%, rgba(185,28,28,.9) 100%)',
                 warning:'linear-gradient(135deg, rgba(251,191,36,.9) 0%, rgba(217,119,6,.9) 100%)',
                 info:'linear-gradient(135deg, rgba(59,130,246,.9) 0%, rgba(29,78,216,.9) 100%)' };
  el.style.background = colors[type] || colors.info;
  setTimeout(()=>el.classList.remove('show'), 2600);
}

// ===== Seed data & misc =====
function initializeGame(){
  for(let i=0;i<INITIAL_TERRITORIES;i++){
    const codes=Object.keys(countryData), cc=codes[Math.floor(Math.random()*codes.length)];
    const ctr=countryData[cc].center;
    const lat=ctr[0]+(Math.random()-.5)*0.3, lng=ctr[1]+(Math.random()-.5)*0.3;
    territories.set(getCoordKey(lat,lng), cc);
  }
  redrawTerritories(); updateStats(); updateLeaderboard(); updateHotspot();
}
function updateHotspot(){
  const hs=['Tokyo','New York','London','Paris','Beijing','Moscow','Sydney','São Paulo'];
  document.getElementById('hotspot').textContent = hs[Math.floor(Math.random()*hs.length)];
}

// ===== DOM ready =====
document.addEventListener('DOMContentLoaded', ()=>{
  if(initMap()){
    initializeGame();
    document.getElementById('countrySelect').addEventListener('change', e=>{
      currentCountry = e.target.value; updateStats(); showNotification(`Changed to ${countryData[currentCountry].name}`,'info');
    });
    setInterval(()=>{ if(Math.random()>0.3) simulateAIPlayers(); }, 5000);
    setInterval(()=>{ document.getElementById('onlineUsers').textContent = Math.floor(Math.random()*500)+200; }, 10000);
    setInterval(updateHotspot, 15000);
    showNotification('Game started! Click the map to capture tiles','success');
  }
});

// Expose to HTML
window.toggleGrid = toggleGrid;
window.toggleHeatmap = toggleHeatmap;
window.centerOnMyCountry = centerOnMyCountry;
window.resetView = resetView;
