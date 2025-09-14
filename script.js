/* ===== Config ===== */
const GRID_SIZE = 0.0001;
const COOLDOWN_TIME = 10000;
const INITIAL_TERRITORIES = 50;

/* ===== State ===== */
let map, canPlace = true;
let showGrid = false, showHeatmap = false;
let territoryMarkers, gridLayer, heatmapLayer;
let territories = new Map();          // key -> { owner, color }
let currentCountry = 'JP';
let currentPeriod = 'today';          // 'today' | 'week' | 'month' | 'all'

/* ===== Countries (sample) ===== */
const countryData = {
  JP:{name:'Japan', flag:'🇯🇵', center:[35.6762,139.6503]},
  US:{name:'USA', flag:'🇺🇸', center:[39.8283,-98.5795]},
  GB:{name:'UK', flag:'🇬🇧', center:[54,-2]},
  FR:{name:'France', flag:'🇫🇷', center:[46.22,2.21]},
  DE:{name:'Germany', flag:'🇩🇪', center:[51.16,10.45]},
  CN:{name:'China', flag:'🇨🇳', center:[35.8617,104.1954]},
  KR:{name:'Korea', flag:'🇰🇷', center:[36.5,127.8]},
  IN:{name:'India', flag:'🇮🇳', center:[20.59,78.96]},
  BR:{name:'Brazil', flag:'🇧🇷', center:[-14.235,-51.9253]},
  AU:{name:'Australia', flag:'🇦🇺', center:[-25.27,133.77]},
  CA:{name:'Canada', flag:'🇨🇦', center:[56.1304,-106.3468]}
};

/* ===== Brush (fix: always read current color at click time) ===== */
const brush = {
  mode: 'solid',                                         // 'solid' | 'palette' | 'rainbow'
  getSolid: () => document.getElementById('solidColor')?.value || '#ff4b4b',
  palette: ['#ff4b4b','#ffd166','#06d6a0','#118ab2','#8338ec'],
  paletteIndex: 0
};
const setActive = id => {
  ['modeSolid','modePalette','modeRainbow'].forEach(x=>{
    const el=document.getElementById(x); if(!el) return;
    if(x===id) el.classList.add('active'); else el.classList.remove('active');
  });
};
const nextFromPalette = () => {
  const c = brush.palette[brush.paletteIndex % brush.palette.length];
  brush.paletteIndex = (brush.paletteIndex + 1) % brush.palette.length;
  return c;
};
const hueFromPosition = (lat,lng) => {
  const h = ((lat*137.5)+(lng*97.3))%360;
  return `hsl(${(h+360)%360},80%,55%)`;
};
const pickBrushColor = (lat,lng) => {                    // ★クリック時に“今の色”を確定
  if (brush.mode === 'solid') return brush.getSolid();   // DOMから直読みで取りこぼし防止
  if (brush.mode === 'palette') return nextFromPalette();
  return hueFromPosition(lat,lng);
};

/* ===== Utils ===== */
const getGridCoord = (lat,lng)=>({lat:Math.floor(lat/GRID_SIZE)*GRID_SIZE,lng:Math.floor(lng/GRID_SIZE)*GRID_SIZE});
const getCoordKey = (lat,lng)=>{ const g=getGridCoord(lat,lng); return `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`; };
const autoCountryColor = code => {
  const h = ([...code].reduce((a,c)=>a+c.charCodeAt(0),0)*137.5)%360;
  return `hsl(${h},70%,55%)`;
};
const notify = (msg,type='info')=>{
  const el=document.getElementById('notification'); if(!el) return;
  const colors={success:'linear-gradient(135deg,rgba(74,222,128,.9),rgba(34,197,94,.9))',
                error:'linear-gradient(135deg,rgba(239,68,68,.9),rgba(185,28,28,.9))',
                warning:'linear-gradient(135deg,rgba(251,191,36,.9),rgba(217,119,6,.9))',
                info:'linear-gradient(135deg,rgba(59,130,246,.9),rgba(29,78,216,.9))'};
  el.style.background = colors[type]||colors.info; el.textContent=msg; el.className='notification show';
  setTimeout(()=> el.classList.remove('show'), 2000);
};

/* ===== Rankings (persistent with period rollovers) ===== */
const STORAGE_KEY = 'teplace_leaderboards_v1';

function isoWeekId(d=new Date()){
  const date=new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = (date.getUTCDay()+6)%7;
  date.setUTCDate(date.getUTCDate()-day+3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(),0,4));
  const week = 1 + Math.round(((date-firstThursday)/86400000 - 3 + ((firstThursday.getUTCDay()+6)%7))/7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2,'0')}`;
}
function dayId(d=new Date()){ return d.toISOString().slice(0,10); }          // YYYY-MM-DD (UTC)
function monthId(d=new Date()){ return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`; }

function loadBoards(){
  let obj;
  try{ obj = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }catch{ obj = {}; }
  const now=new Date();
  const ids={day:dayId(now), week:isoWeekId(now), month:monthId(now)};
  const def = { last: ids, boards:{ today:{}, week:{}, month:{}, all:{} } };

  obj = Object.assign(def, obj);               // fill missing
  // rollover
  if(obj.last.day !== ids.day) obj.boards.today = {};
  if(obj.last.week !== ids.week) obj.boards.week = {};
  if(obj.last.month !== ids.month) obj.boards.month = {};
  obj.last = ids;
  return obj;
}
function saveBoards(obj){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(obj)); }catch{}
}
let LB = loadBoards();

function recordPlacement(countryCode){          // human placements only
  const b=LB.boards;
  b.today[countryCode]=(b.today[countryCode]||0)+1;
  b.week[countryCode]=(b.week[countryCode]||0)+1;
  b.month[countryCode]=(b.month[countryCode]||0)+1;
  b.all[countryCode]=(b.all[countryCode]||0)+1;
  saveBoards(LB);
}

function setActiveTab(period){
  currentPeriod = period;
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.period===period);
  });
  renderLeaderboard();
}
function renderLeaderboard(){
  const data = LB.boards[currentPeriod] || {};
  const top = Object.entries(data).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const box = document.getElementById('leaderboardList');
  if(!top.length){ box.innerHTML = `<div class="muted" style="padding:8px 12px;">No data yet in ${currentPeriod.toUpperCase()}.</div>`; return; }
  box.innerHTML = top.map(([code,count],i)=>{
    const d=countryData[code]||{name:code,flag:''};
    return `<div class="leaderboard-item"><span class="rank">${i+1}</span>
      <span class="country-info"><span>${d.flag}</span><span>${d.name}</span></span>
      <span class="territory-count">${count}</span></div>`;
  }).join('');
}

/* ===== Map (tile fallback) ===== */
function initMap(){
  const isSmall = matchMedia('(max-width:980px)').matches;
  const center  = countryData[currentCountry]?.center || [35.6762,139.6503];

  try{
    map = L.map('map',{center,zoom:isSmall?4:5,minZoom:2,maxZoom:19,worldCopyJump:true});

    const candidates = [
      { url:'https://cartodb-basemaps-a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attr:'&copy; OSM &copy; CARTO' },
      { url:'https://cartodb-basemaps-a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attr:'&copy; OSM &copy; CARTO' },
      { url:'https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png',
        attr:'Tiles by Stamen, Data &copy; OSM' }
    ];

    let layer, idx=0;
    const use = i=>{
      if(layer){ try{ map.removeLayer(layer);}catch{} }
      const c=candidates[i];
      layer=L.tileLayer(c.url,{maxZoom:19,attribution:c.attr,crossOrigin:true});
      layer.on('tileerror',()=>{ idx++; if(idx<candidates.length){ notify('Tile error. Switching…','warning'); use(idx);} else { notify('All tile servers failed','error'); }});
      layer.addTo(map);
    };
    use(0);

    territoryMarkers=L.layerGroup().addTo(map);
    gridLayer=L.layerGroup(); heatmapLayer=L.layerGroup();

    map.on('click',e=>{ if(canPlace) placeTerritory(e.latlng.lat,e.latlng.lng); });
    map.on('moveend',()=>{ if(showGrid) updateGrid(); });

    setTimeout(()=> map.invalidateSize(),0);
    return true;
  }catch(err){ console.error(err); notify('Map init failed','error'); return false; }
}

/* ===== Painting ===== */
function createRect(lat,lng,val){
  const g=getGridCoord(lat,lng), col=val.color || autoCountryColor(val.owner);
  return L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{color:col,fillColor:col,fillOpacity:.48,weight:1})
    .on('click',e=>{ L.DomEvent.stopPropagation(e); if(canPlace) placeTerritory(g.lat+GRID_SIZE/2,g.lng+GRID_SIZE/2); })
    .on('mouseover',function(){ this.setStyle({fillOpacity:.65}); })
    .on('mouseout',function(){ this.setStyle({fillOpacity:.48}); });
}
function redraw(){ territoryMarkers.clearLayers(); territories.forEach((v,k)=>{ const [la,ln]=k.split(',').map(Number); createRect(la,ln,v).addTo(territoryMarkers); }); }

function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key=getCoordKey(lat,lng);
  const chosenColor = pickBrushColor(lat,lng);   // ★クリック時点の色
  territories.set(key,{owner:currentCountry,color:chosenColor});
  redraw();

  // record to persistent leaderboards (human placements only)
  recordPlacement(currentCountry);
  renderLeaderboard();

  startCooldown(); updateStats(); addActivity(currentCountry,key); 
}

/* ===== Stats ===== */
function startCooldown(){
  canPlace=false;
  const bar=document.getElementById('cooldownBar'),fill=document.getElementById('cooldownFill'),tt=document.getElementById('cooldownTime');
  bar.classList.add('active'); let left=COOLDOWN_TIME;
  const id=setInterval(()=>{ left-=100; fill.style.width=((COOLDOWN_TIME-left)/COOLDOWN_TIME*100)+'%'; tt.textContent=Math.max(0,Math.ceil(left/1000))+'s';
    if(left<=0){ clearInterval(id); bar.classList.remove('active'); canPlace=true; tt.textContent=(COOLDOWN_TIME/1000)+'s'; }
  },100);
}
function updateStats(){
  const total=territories.size;
  const mine=[...territories.values()].filter(v=>v.owner===currentCountry).length;
  const max=200000;
  document.getElementById('totalTerritories').textContent=total;
  document.getElementById('myTerritories').textContent=mine;
  document.getElementById('onlineUsers').textContent=Math.floor(Math.random()*500)+200; // demo
  document.getElementById('occupancyRate').textContent=Math.round(total/max*100)+'%';
}
function addActivity(country,key){
  const box=document.getElementById('activityList'); const d=countryData[country]||{name:country,flag:''};
  const el=document.createElement('div'); el.className='activity-item'; el.style.borderLeftColor=autoCountryColor(country);
  el.innerHTML=`<div style="font-weight:700">${d.flag} ${d.name} captured a tile</div>
    <div style="opacity:.6;font-size:12px">📍 ${key} | ${new Date().toLocaleTimeString()}</div>`;
  box.prepend(el); while(box.children.length>8) box.removeChild(box.lastChild);
}

/* ===== Grid / Heatmap ===== */
function toggleGrid(){ showGrid=!showGrid; if(showGrid){ updateGrid(); gridLayer.addTo(map);} else gridLayer.remove(); }
function updateGrid(){
  gridLayer.clearLayers();
  const b=map.getBounds(), step=GRID_SIZE*Math.pow(2,Math.max(0,12-map.getZoom()));
  for(let la=Math.floor(b.getSouth()/step)*step; la<=Math.ceil(b.getNorth()/step)*step; la+=step){
    for(let ln=Math.floor(b.getWest()/step)*step; ln<=Math.ceil(b.getEast()/step)*step; ln+=step){
      L.rectangle([[la,ln],[la+step,ln+step]],{color:'rgba(255,255,255,.2)',weight:1,fill:false,interactive:false}).addTo(gridLayer);
    }
  }
}
function toggleHeatmap(){ showHeatmap=!showHeatmap; notify(showHeatmap?'Heatmap ON':'Heatmap OFF','info'); if(showHeatmap){ updateHeatmap(); heatmapLayer.addTo(map);} else heatmapLayer.remove(); }
function updateHeatmap(){
  heatmapLayer.clearLayers();
  const density=new Map();
  territories.forEach((v,k)=>{ const [la,ln]=k.split(',').map(Number); const key=`${Math.floor(la/0.05)*0.05},${Math.floor(ln/0.05)*0.05}`; density.set(key,(density.get(key)||0)+1); });
  density.forEach((cnt,key)=>{ const [la,ln]=key.split(',').map(Number); const op=Math.min(cnt*0.08,0.8);
    L.rectangle([[la,ln],[la+0.05,ln+0.05]],{color:'#ff0000',fillColor:'#ff0000',fillOpacity:op,weight:0,interactive:false}).addTo(heatmapLayer);
  });
}

/* ===== Controls ===== */
function centerOnMyCountry(){ const c=countryData[currentCountry].center; map.flyTo(c,6,{animate:true,duration:1.2}); }
function resetView(){ map.setView(countryData[currentCountry].center,5); notify('View reset','info'); }

/* ===== Init helpers ===== */
function populateCountrySelect(){
  const sel=document.getElementById('countrySelect');
  const codes=Object.keys(countryData).sort((a,b)=>countryData[a].name.localeCompare(countryData[b].name));
  sel.innerHTML='';
  for(const code of codes){
    const o=document.createElement('option'); const c=countryData[code];
    o.value=code; o.textContent=`${c.flag} ${c.name}`; if(code===currentCountry) o.selected=true;
    sel.appendChild(o);
  }
}
function updateHotspot(){
  const list=['Tokyo','Seoul','London','Paris','New York','Beijing','Sydney','São Paulo'];
  document.getElementById('hotspot').textContent=list[Math.floor(Math.random()*list.length)];
}
function initializeGame(){
  // minimal initial paints (display only; not counted into ranking)
  for(let i=0;i<INITIAL_TERRITORIES;i++){
    const codes=Object.keys(countryData); const code=codes[Math.floor(Math.random()*codes.length)];
    const c=countryData[code].center;
    const lat=c[0]+(Math.random()-0.5)*20, lng=c[1]+(Math.random()-0.5)*20;
    territories.set(getCoordKey(lat,lng),{owner:code,color:autoCountryColor(code)});
  }
  redraw(); updateStats(); updateHotspot();
  renderLeaderboard();             // render from persisted data
}

/* ===== DOM Ready ===== */
document.addEventListener('DOMContentLoaded',()=>{
  // Tabs
  document.querySelectorAll('.tab').forEach(btn=>{
    btn.addEventListener('click',()=> setActiveTab(btn.dataset.period));
  });

  // Countries
  populateCountrySelect();

  // Map
  if(initMap()) initializeGame();

  // Country change
  document.getElementById('countrySelect').addEventListener('change',e=>{
    currentCountry=e.target.value; updateStats(); centerOnMyCountry();
  });

  // Brush mode buttons
  const btnSolid=document.getElementById('modeSolid');
  const btnPalette=document.getElementById('modePalette');
  const btnRainbow=document.getElementById('modeRainbow');
  btnSolid.onclick=()=>{ brush.mode='solid'; setActive('modeSolid'); };
  btnPalette.onclick=()=>{ brush.mode='palette'; setActive('modePalette'); };
  btnRainbow.onclick=()=>{ brush.mode='rainbow'; setActive('modeRainbow'); };

  // Live color binding + preview
  const solidInput=document.getElementById('solidColor');
  const swatchDot=document.getElementById('swatchDot');
  const swatchText=document.getElementById('swatchText');
  const updateSwatch=()=>{ const v=solidInput.value; if(swatchDot) swatchDot.style.background=v; if(swatchText) swatchText.textContent=v.toLowerCase(); };
  solidInput.addEventListener('input', updateSwatch);   // ← 選んだ瞬間に反映（“前の色”対策）
  updateSwatch();

  // Dummy online / hotspot
  setInterval(()=>{ document.getElementById('onlineUsers').textContent=Math.floor(Math.random()*500)+200; }, 10000);
  setInterval(updateHotspot, 15000);
});
