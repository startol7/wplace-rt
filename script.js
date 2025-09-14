/* ---------- Global safety toast ---------- */
window.addEventListener('error', e => {
  const el = document.getElementById('notification'); if(!el) return;
  el.textContent = `Error: ${e.message || e}`; el.className = 'notification show';
  setTimeout(()=> el.classList.remove('show'), 5000);
});

/* ---------- Game constants ---------- */
const GRID_SIZE = 0.0001;     // ~11m per square
const COOLDOWN_TIME = 10000;  // 10s
const INITIAL_TERRITORIES = 50;
const GRID_MIN_ZOOM = 17;
const GRID_MAX_CELLS = 800;

/* ---------- State ---------- */
let map, canPlace = true;
let showGrid = false, showHeatmap = false;
let currentCountry = 'JP';
let territoryMarkers, gridLayer, heatmapLayer;
// territories: Map<coordKey, { owner: string, color: string }>
let territories = new Map();
let occupationStats = {};   // attacker -> victim -> count

/* ---------- Countries ---------- */
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
  DK:{name:'Denmark', flag:'🇩🇰', center:[56.2639,9.5018]},
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

/* ---------- Local color overrides ---------- */
let colorOverrides = {};
const loadColorOverrides = () => { try{ colorOverrides = JSON.parse(localStorage.getItem('teplace_colors')) || {}; } catch{ colorOverrides = {}; } };
const saveColorOverrides = () => { try{ localStorage.setItem('teplace_colors', JSON.stringify(colorOverrides)); } catch{} };

/* ---------- Colors / Brushes ---------- */
const autoColor = code => { const h = ([...code].reduce((a,c)=>a+c.charCodeAt(0),0)*137.5)%360; return `hsl(${h},70%,55%)`; };
const getCountryColor = code => colorOverrides[code] || autoColor(code);

let brush = { mode:'solid', color:'#ff4b4b', palette:['#ff4b4b','#ffd166','#06d6a0','#118ab2','#8338ec'], paletteIndex:0 };
const nextFromPalette = () => { const c=brush.palette[brush.paletteIndex%brush.palette.length]; brush.paletteIndex=(brush.paletteIndex+1)%brush.palette.length; return c; };
const hueFromPosition = (lat,lng)=>{ const h=((lat*137.5)+(lng*97.3))%360; return `hsl(${(h+360)%360},80%,55%)`; };
const getBrushColor = (lat,lng)=> brush.mode==='solid'?brush.color : brush.mode==='palette'?nextFromPalette() : hueFromPosition(lat,lng);

/* ---------- Helpers ---------- */
const getGridCoord=(lat,lng)=>({lat:Math.floor(lat/GRID_SIZE)*GRID_SIZE,lng:Math.floor(lng/GRID_SIZE)*GRID_SIZE});
const getCoordKey=(lat,lng)=>{const g=getGridCoord(lat,lng);return `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`};
const getOwner=v=> typeof v==='string'?v:v?.owner;
const getCellColor=(v,fallback)=> typeof v==='string'?getCountryColor(v):(v?.color||getCountryColor(v?.owner||fallback));

const notify=(msg,type='info')=>{
  const el=document.getElementById('notification'); if(!el) return;
  const colors={success:'linear-gradient(135deg,rgba(74,222,128,.9),rgba(34,197,94,.9))',
                error:'linear-gradient(135deg,rgba(239,68,68,.9),rgba(185,28,28,.9))',
                warning:'linear-gradient(135deg,rgba(251,191,36,.9),rgba(217,119,6,.9))',
                info:'linear-gradient(135deg,rgba(59,130,246,.9),rgba(29,78,216,.9))'};
  el.style.background = colors[type]||colors.info; el.textContent=msg; el.className='notification show';
  setTimeout(()=> el.classList.remove('show'), 2200);
};

/* ---------- UI ---------- */
function populateCountrySelect(){
  const sel=document.getElementById('countrySelect'); if(!sel) return;
  sel.innerHTML=''; const codes=Object.keys(countryData).sort((a,b)=>countryData[a].name.localeCompare(countryData[b].name));
  for(const code of codes){ const o=document.createElement('option'); const c=countryData[code]; o.value=code; o.textContent=`${c.flag} ${c.name}`; if(code===currentCountry) o.selected=true; sel.appendChild(o); }
}

/* ---------- Map with tile fallback ---------- */
function initMap(){
  const isSmall=window.matchMedia('(max-width:980px)').matches;
  const center=countryData[currentCountry]?.center||[35.6762,139.6503];

  try{
    map=L.map('map',{center,zoom:isSmall?4:5,minZoom:2,maxZoom:19,worldCopyJump:true});

    const candidates=[
      {url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', attr:'&copy; OpenStreetMap contributors'},
      {url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr:'&copy; OpenStreetMap contributors'},
      {url:'https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', attr:'&copy; OpenStreetMap contributors, HOT'}
    ];
    let layer, i=0;
    const use = idx => {
      if(layer){ try{ map.removeLayer(layer);}catch{} }
      const c=candidates[idx];
      layer=L.tileLayer(c.url,{maxZoom:19,attribution:c.attr,crossOrigin:true});
      layer.on('tileerror',()=>{ i++; if(i<candidates.length){ notify('Tile server error. Switching…','warning'); use(i); } else notify('All tile servers failed','error'); });
      layer.addTo(map);
    };
    use(0);

    territoryMarkers=L.layerGroup().addTo(map);
    gridLayer=L.layerGroup(); heatmapLayer=L.layerGroup();

    map.on('click',e=>{ if(canPlace) placeTerritory(e.latlng.lat,e.latlng.lng); });
    map.on('moveend',()=>{ if(showGrid) updateGrid(); });

    setTimeout(()=> map.invalidateSize(),0);
    return true;
  }catch(err){ console.error(err); notify('Map initialization failed','error'); return false; }
}

/* ---------- Painting ---------- */
function createTerritoryMarker(lat,lng,val){
  const g=getGridCoord(lat,lng), col=getCellColor(val,getOwner(val));
  return L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{color:col,fillColor:col,fillOpacity:.48,weight:1})
    .on('click',e=>{ L.DomEvent.stopPropagation(e); if(canPlace) placeTerritory(g.lat+GRID_SIZE/2,g.lng+GRID_SIZE/2); })
    .on('mouseover',function(){ this.setStyle({fillOpacity:.65}); })
    .on('mouseout',function(){ this.setStyle({fillOpacity:.48}); });
}
function redrawTerritories(){ territoryMarkers.clearLayers(); territories.forEach((v,k)=>{ const [lat,lng]=k.split(',').map(Number); createTerritoryMarker(lat,lng,v).addTo(territoryMarkers); }); }

function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key=getCoordKey(lat,lng), prev=territories.get(key), prevOwner=prev?getOwner(prev):null;
  const color=getBrushColor(lat,lng);
  territories.set(key,{owner:currentCountry,color});
  redrawTerritories();
  if(prevOwner && prevOwner!==currentCountry){
    occupationStats[currentCountry]??={}; occupationStats[currentCountry][prevOwner]=(occupationStats[currentCountry][prevOwner]||0)+1;
    updateOccupationStats();
  }
  startCooldown(); updateStats(); addActivity(currentCountry,key,prevOwner); updateLeaderboard();
}

/* ---------- Stats / Panels ---------- */
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
  const mine=Array.from(territories.values()).filter(v=>getOwner(v)===currentCountry).length;
  const max=200000; // virtual cap
  const set=(id,val)=>{ const n=document.getElementById(id); if(n) n.textContent=val; };
  set('totalTerritories',total); set('myTerritories',mine); set('occupancyRate',Math.round(total/max*100)+'%');
}

function updateLeaderboard(){
  const counts={}; territories.forEach(v=>{ const o=getOwner(v); counts[o]=(counts[o]||0)+1; });
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const box=document.getElementById('leaderboardList'); if(!box) return;
  box.innerHTML=top.map(([code,count],i)=>{ const d=countryData[code]||{name:code,flag:''}, rk=i<3?`rank-${i+1}`:''; return `
    <div class="leaderboard-item">
      <span class="rank ${rk}">${i+1}</span>
      <span class="country-info"><span>${d.flag}</span><span>${d.name}</span></span>
      <span class="territory-count">${count}</span>
    </div>`; }).join('');
}

function addActivity(country,key,oldOwner){
  const box=document.getElementById('activityList'); if(!box) return;
  const d=countryData[country]||{name:country,flag:''};
  const msg=oldOwner && oldOwner!==country ? `${d.flag} captured from ${countryData[oldOwner]?.flag||oldOwner}` : `${d.flag} ${d.name} captured a tile`;
  const el=document.createElement('div'); el.className='activity-item'; el.style.borderLeftColor=getCountryColor(country);
  el.innerHTML=`<div style="font-weight:700">${msg}</div><div style="opacity:.6;font-size:12px">📍 ${key} | ${new Date().toLocaleTimeString()}</div>`;
  box.prepend
