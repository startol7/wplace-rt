/* ====== Config ====== */
const GRID_SIZE = 0.0001;      // きめ細かさ（~11m）
const COOLDOWN_TIME = 10000;   // 10s
const INITIAL_TERRITORIES = 50;

/* ====== State ====== */
let map, canPlace = true;
let showGrid = false, showHeatmap = false;
let territoryMarkers, gridLayer, heatmapLayer;
let territories = new Map();               // key -> { owner, color }
let occupationStats = {};                  // attacker -> victim -> count
let currentCountry = 'JP';

/* ====== Countries ====== */
const countryData = {
  JP:{name:'Japan', flag:'🇯🇵', center:[35.6762,139.6503]},
  US:{name:'USA', flag:'🇺🇸', center:[39.8283,-98.5795]},
  CN:{name:'China', flag:'🇨🇳', center:[35.8617,104.1954]},
  KR:{name:'Korea', flag:'🇰🇷', center:[36.5,127.8]},
  TW:{name:'Taiwan', flag:'🇹🇼', center:[23.6978,120.9605]},
  SG:{name:'Singapore', flag:'🇸🇬', center:[1.3521,103.8198]},
  IN:{name:'India', flag:'🇮🇳', center:[20.59,78.96]},
  TH:{name:'Thailand', flag:'🇹🇭', center:[15.87,100.99]},
  VN:{name:'Vietnam', flag:'🇻🇳', center:[14.0583,108.2772]},
  PH:{name:'Philippines', flag:'🇵🇭', center:[12.8797,121.774]},
  ID:{name:'Indonesia', flag:'🇮🇩', center:[-0.7893,113.9213]},
  RU:{name:'Russia', flag:'🇷🇺', center:[61.52,105.31]},
  AU:{name:'Australia', flag:'🇦🇺', center:[-25.27,133.77]},
  NZ:{name:'New Zealand', flag:'🇳🇿', center:[-40.9006,174.886]},
  GB:{name:'UK', flag:'🇬🇧', center:[54,-2]},
  FR:{name:'France', flag:'🇫🇷', center:[46.22,2.21]},
  DE:{name:'Germany', flag:'🇩🇪', center:[51.16,10.45]},
  ES:{name:'Spain', flag:'🇪🇸', center:[40.4637,-3.7492]},
  IT:{name:'Italy', flag:'🇮🇹', center:[41.8719,12.5674]},
  PT:{name:'Portugal', flag:'🇵🇹', center:[39.3999,-8.2245]},
  NL:{name:'Netherlands', flag:'🇳🇱', center:[52.1326,5.2913]},
  BE:{name:'Belgium', flag:'🇧🇪', center:[50.5039,4.4699]},
  SE:{name:'Sweden', flag:'🇸🇪', center:[60.1282,18.6435]},
  NO:{name:'Norway', flag:'🇳🇴', center:[60.472,8.4689]},
  FI:{name:'Finland', flag:'🇫🇮', center:[61.9241,25.7482]},
  IE:{name:'Ireland', flag:'🇮🇪', center:[53.1424,-7.6921]},
  CA:{name:'Canada', flag:'🇨🇦', center:[56.1304,-106.3468]},
  BR:{name:'Brazil', flag:'🇧🇷', center:[-14.235,-51.9253]},
  AR:{name:'Argentina', flag:'🇦🇷', center:[-38.4161,-63.6167]},
  MX:{name:'Mexico', flag:'🇲🇽', center:[23.6345,-102.5528]},
  CL:{name:'Chile', flag:'🇨🇱', center:[-35.6751,-71.543]},
  CO:{name:'Colombia', flag:'🇨🇴', center:[4.5709,-74.2973]},
  PE:{name:'Peru', flag:'🇵🇪', center:[-9.19,-75.0152]}
};

/* ====== Brush & Colors ====== */
let brush = {
  mode: 'solid',          // 'solid' | 'palette' | 'rainbow'
  color: '#ff4b4b',
  palette: ['#ff4b4b','#ffd166','#06d6a0','#118ab2','#8338ec'],
  paletteIndex: 0
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
const getBrushColor = (lat,lng) => {
  if (brush.mode === 'solid') return brush.color;
  if (brush.mode === 'palette') return nextFromPalette();
  return hueFromPosition(lat,lng);
};
const autoCountryColor = code => {
  const h = ([...code].reduce((a,c)=>a+c.charCodeAt(0),0)*137.5)%360;
  return `hsl(${h},70%,55%)`;
};

/* ====== Helpers ====== */
const getGridCoord = (lat,lng)=>({lat:Math.floor(lat/GRID_SIZE)*GRID_SIZE,lng:Math.floor(lng/GRID_SIZE)*GRID_SIZE});
const getCoordKey  = (lat,lng)=>{ const g=getGridCoord(lat,lng); return `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`; };
const ownerOf      = v => v?.owner;
const colorOfCell  = v => v?.color || autoCountryColor(ownerOf(v)||'??');

const notify = (msg,type='info')=>{
  const el=document.getElementById('notification'); if(!el) return;
  const colors={success:'linear-gradient(135deg,rgba(74,222,128,.9),rgba(34,197,94,.9))',
                error:'linear-gradient(135deg,rgba(239,68,68,.9),rgba(185,28,28,.9))',
                warning:'linear-gradient(135deg,rgba(251,191,36,.9),rgba(217,119,6,.9))',
                info:'linear-gradient(135deg,rgba(59,130,246,.9),rgba(29,78,216,.9))'};
  el.style.background = colors[type] || colors.info;
  el.textContent = msg; el.className='notification show';
  setTimeout(()=> el.classList.remove('show'), 2200);
};

/* ====== UI ====== */
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

/* ====== Map (with tile fallback) ====== */
function initMap(){
  const isSmall = matchMedia('(max-width:980px)').matches;
  const center  = countryData[currentCountry]?.center || [35.6762,139.6503];

  try{
    map = L.map('map',{center,zoom:isSmall?4:5,minZoom:2,maxZoom:19,worldCopyJump:true});

    // ★ OSM 制限対策：Carto → Carto Dark → Stamen へフォールバック
    const candidates = [
      { url:'https://cartodb-basemaps-a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attr:'&copy; <a href="https://openstreetmap.org">OSM</a> contributors &copy; <a href="https://carto.com/">CARTO</a>' },
      { url:'https://cartodb-basemaps-a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attr:'&copy; OSM &copy; CARTO' },
      { url:'https://stamen-tiles.a.ssl.fastly.net/toner-lite/{z}/{x}/{y}.png',
        attr:'Map tiles by <a href="https://stamen.com/">Stamen</a>, Data &copy; <a href="https://openstreetmap.org">OSM</a>' }
    ];

    let layer, idx=0;
    const use = i=>{
      if(layer){ try{ map.removeLayer(layer);}catch{} }
      const c=candidates[i];
      layer=L.tileLayer(c.url,{maxZoom:19,attribution:c.attr,crossOrigin:true});
      layer.on('tileerror',()=>{ idx++; if(idx<candidates.length){ notify('Tile server error. Switching…','warning'); use(idx);} else { notify('All tile servers failed','error'); }});
      layer.addTo(map);
    };
    use(0);

    territoryMarkers=L.layerGroup().addTo(map);
    gridLayer=L.layerGroup(); heatmapLayer=L.layerGroup();

    map.on('click',e=>{ if(canPlace) placeTerritory(e.latlng.lat,e.latlng.lng); });
    map.on('moveend',()=>{ if(showGrid) updateGrid(); });

    setTimeout(()=> map.invalidateSize(),0);  // サイズ確定
    return true;
  }catch(err){
    console.error(err); notify('Map initialization failed','error'); return false;
  }
}

/* ====== Painting ====== */
function createRect(lat,lng,val){
  const g=getGridCoord(lat,lng), col=colorOfCell(val);
  return L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{color:col,fillColor:col,fillOpacity:.48,weight:1})
    .on('click',e=>{ L.DomEvent.stopPropagation(e); if(canPlace) placeTerritory(g.lat+GRID_SIZE/2,g.lng+GRID_SIZE/2); })
    .on('mouseover',function(){ this.setStyle({fillOpacity:.65}); })
    .on('mouseout',function(){ this.setStyle({fillOpacity:.48}); });
}
function redraw(){ territoryMarkers.clearLayers(); territories.forEach((v,k)=>{ const [la,ln]=k.split(',').map(Number); createRect(la,ln,v).addTo(territoryMarkers); }); }

function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key=getCoordKey(lat,lng); const prev=territories.get(key); const prevOwner=ownerOf(prev);
  const color=getBrushColor(lat,lng);
  territories.set(key,{owner:currentCountry,color});
  redraw();

  if(prevOwner && prevOwner!==currentCountry){
    occupationStats[currentCountry]??={};
    occupationStats[currentCountry][prevOwner]=(occupationStats[currentCountry][prevOwner]||0)+1;
  }

  startCooldown(); updateStats(); addActivity(currentCountry,key,prevOwner); updateLeaderboard();
}

/* ====== Stats & Panels ====== */
function startCooldown(){
  canPlace=false;
  const bar=document.getElementById('cooldownBar'), fill=document.getElementById('cooldownFill'), tt=document.getElementById('cooldownTime');
  bar.classList.add('active'); let left=COOLDOWN_TIME;
  const id=setInterval(()=>{ left-=100; fill.style.width=((COOLDOWN_TIME-left)/COOLDOWN_TIME*100)+'%'; tt.textContent=Math.max(0,Math.ceil(left/1000))+'s';
    if(left<=0){ clearInterval(id); bar.classList.remove('active'); canPlace=true; tt.textContent=(COOLDOWN_TIME/1000)+'s'; }
  },100);
}
function updateStats(){
  const total=territories.size;
  const mine=[...territories.values()].filter(v=>ownerOf(v)===currentCountry).length;
  const max=200000;
  document.getElementById('totalTerritories').textContent=total;
  document.getElementById('myTerritories').textContent=mine;
  document.getElementById('onlineUsers').textContent=Math.floor(Math.random()*500)+200; // ダミー
  document.getElementById('occupancyRate').textContent=Math.round(total/max*100)+'%';
}
function updateLeaderboard(){
  const counts={}; territories.forEach(v=>{ const o=ownerOf(v); counts[o]=(counts[o]||0)+1; });
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const box=document.getElementById('leaderboardList');
  box.innerHTML=top.map(([code,count],i)=>{ const d=countryData[code]||{name:code,flag:''};
    return `<div class="leaderboard-item">
      <span class="rank">${i+1}</span>
      <span class="country-info"><span>${d.flag}</span><span>${d.name}</span></span>
      <span class="territory-count">${count}</span></div>`; }).join('');
}
function addActivity(country,key,oldOwner){
  const box=document.getElementById('activityList'); const d=countryData[country]||{name:country,flag:''};
  const msg=oldOwner&&oldOwner!==country?`${d.flag} captured from ${countryData[oldOwner]?.flag||oldOwner}`:`${d.flag} ${d.name} captured a tile`;
  const el=document.createElement('div'); el.className='activity-item'; el.style.borderLeftColor=autoCountryColor(country);
  el.innerHTML=`<div style="font-weight:700">${msg}</div><div style="opacity:.6;font-size:12px">📍 ${key} | ${new Date().toLocaleTimeString()}</div>`;
  box.prepend(el); while(box.children.length>8) box.removeChild(box.lastChild);
}

/* ====== Grid / Heatmap (簡易) ====== */
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

/* ====== Map Controls ====== */
function centerOnMyCountry(){ const c=countryData[currentCountry].center; map.flyTo(c,6,{animate:true,duration:1.2}); }
function resetView(){ map.setView(countryData[currentCountry].center,5); notify('View reset','info'); }

/* ====== Init sample data ====== */
function updateHotspot(){
  const list=['Tokyo','Seoul','London','Paris','New York','Beijing','Sydney','São Paulo'];
  document.getElementById('hotspot').textContent=list[Math.floor(Math.random()*list.length)];
}
function initializeGame(){
  // 初期タイルを各国中心付近へ
  for(let i=0;i<INITIAL_TERRITORIES;i++){
    const codes=Object.keys(countryData); const code=codes[Math.floor(Math.random()*codes.length)];
    const c=countryData[code].center;
    const lat=c[0]+(Math.random()-0.5)*20, lng=c[1]+(Math.random()-0.5)*20;
    const key=getCoordKey(lat,lng);
    territories.set(key,{owner:code,color:autoCountryColor(code)});
  }
  redraw(); updateStats(); updateLeaderboard(); updateHotspot();
}

/* ====== DOM Ready ====== */
document.addEventListener('DOMContentLoaded',()=>{
  populateCountrySelect();
  if(initMap()){ initializeGame(); }

  // Country change
  document.getElementById('countrySelect').addEventListener('change',e=>{
    currentCountry=e.target.value; updateStats(); centerOnMyCountry();
  });

  // Brush UI
  document.getElementById('modeSolid').onclick = ()=>{ brush.mode='solid'; notify('Solid brush','info'); };
  document.getElementById('modePalette').onclick = ()=>{ brush.mode='palette'; notify('Palette brush','info'); };
  document.getElementById('modeRainbow').onclick= ()=>{ brush.mode='rainbow'; notify('Rainbow brush','info'); };
  document.getElementById('applySolid').onclick  = ()=>{ brush.color=document.getElementById('solidColor').value; notify('Color set','success'); };
  document.getElementById('applyPalette').onclick= ()=>{
    const raw=document.getElementById('paletteInput').value.trim();
    if(raw){ brush.palette=raw.split(',').map(s=>s.trim()).filter(Boolean); brush.paletteIndex=0; notify('Palette updated','success'); }
  };
  document.getElementById('toggleSidebar').onclick= ()=>{ document.querySelector('.sidebar').classList.toggle('collapsed'); setTimeout(()=>map.invalidateSize(),150); };

  // ダミーのオンライン人数更新・ホットスポット更新
  setInterval(()=> document.getElementById('onlineUsers').textContent=Math.floor(Math.random()*500)+200, 10000);
  setInterval(updateHotspot, 15000);
});
