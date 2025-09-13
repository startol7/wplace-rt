/***** Settings *****/
const GRID_SIZE = 0.0001;
const COOLDOWN_TIME = 5000;
const INITIAL_TERRITORIES = 50;

let map;
let territories = new Map();
let currentCountry = 'JP';
let canPlace = true;
let territoryMarkers, gridLayer, heatmapLayer;
let showGrid = false, showHeatmap = false;

/***** Country data (sample, add more as needed) *****/
const countryData = {
  JP:{name:'Japan', flag:'🇯🇵', center:[35.6762,139.6503]},
  US:{name:'USA', flag:'🇺🇸', center:[39.8283,-98.5795]},
  CN:{name:'China', flag:'🇨🇳', center:[35.8617,104.1954]},
  IN:{name:'India', flag:'🇮🇳', center:[20.59,78.96]},
  BR:{name:'Brazil', flag:'🇧🇷', center:[-14.23,-51.92]},
  RU:{name:'Russia', flag:'🇷🇺', center:[61.52,105.31]},
  FR:{name:'France', flag:'🇫🇷', center:[46.22,2.21]},
  DE:{name:'Germany', flag:'🇩🇪', center:[51.16,10.45]},
  GB:{name:'UK', flag:'🇬🇧', center:[55,-3]},
  AU:{name:'Australia', flag:'🇦🇺', center:[-25.27,133.77]},
  CA:{name:'Canada', flag:'🇨🇦', center:[56,-106]},
  // …必要なら追加
};

/***** Color overrides (local) *****/
let colorOverrides = {};
function loadColorOverrides(){ try{ colorOverrides=JSON.parse(localStorage.getItem('wwplace_colors'))||{}; }catch{ colorOverrides={}; } }
function saveColorOverrides(){ localStorage.setItem('wwplace_colors', JSON.stringify(colorOverrides)); }
function getColorForCountry(code){
  if(colorOverrides[code]) return colorOverrides[code];
  const hash=[...code].reduce((a,c)=>a+c.charCodeAt(0),0);
  const hue=(hash*137.5)%360;
  return `hsl(${hue},70%,55%)`;
}

/***** Map init *****/
function initMap(){
  const isSmall=window.matchMedia('(max-width:980px)').matches;
  const center=countryData[currentCountry]?.center||[35.6762,139.65];
  map=L.map('map',{center,zoom:isSmall?4:5,minZoom:2,maxZoom:19,worldCopyJump:true});
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
    attribution:'&copy; OpenStreetMap'
  }).addTo(map);
  territoryMarkers=L.layerGroup().addTo(map);
  gridLayer=L.layerGroup(); heatmapLayer=L.layerGroup();
  map.on('click',e=>{ if(canPlace) placeTerritory(e.latlng.lat,e.latlng.lng); });
}

/***** Core functions *****/
function getGridCoord(lat,lng){ return { lat:Math.floor(lat/GRID_SIZE)*GRID_SIZE, lng:Math.floor(lng/GRID_SIZE)*GRID_SIZE }; }
function getCoordKey(lat,lng){ const g=getGridCoord(lat,lng); return `${g.lat.toFixed(4)},${g.lng.toFixed(4)}`; }

function createTerritoryMarker(lat,lng,country){
  const g=getGridCoord(lat,lng), col=getColorForCountry(country);
  return L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{
    color:col, fillColor:col, fillOpacity:.45, weight:1
  });
}

function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key=getCoordKey(lat,lng);
  territories.set(key,currentCountry);
  redrawTerritories();
  startCooldown(); updateStats();
}

function redrawTerritories(){
  territoryMarkers.clearLayers();
  territories.forEach((c,k)=>{ const [lat,lng]=k.split(',').map(Number); createTerritoryMarker(lat,lng,c).addTo(territoryMarkers); });
}

function startCooldown(){
  canPlace=false;
  const bar=document.getElementById('cooldownBar'); const fill=document.getElementById('cooldownFill'); const time=document.getElementById('cooldownTime');
  bar.classList.add('active');
  let left=COOLDOWN_TIME;
  const id=setInterval(()=>{ left-=100; fill.style.width=((COOLDOWN_TIME-left)/COOLDOWN_TIME*100)+'%'; time.textContent=Math.ceil(left/1000)+'s';
    if(left<=0){ clearInterval(id); bar.classList.remove('active'); canPlace=true; }},100);
}

function updateStats(){
  document.getElementById('totalTerritories').textContent=territories.size;
  document.getElementById('myTerritories').textContent=Array.from(territories.values()).filter(c=>c===currentCountry).length;
  document.getElementById('onlineUsers').textContent="—"; // 本物は Firebase presence 等で上書き
}

/***** UI events *****/
function setupUI(){
  // Country select
  const sel=document.getElementById('countrySelect');
  Object.keys(countryData).forEach(code=>{
    const opt=document.createElement('option');
    opt.value=code; opt.textContent=`${countryData[code].flag} ${countryData[code].name}`;
    sel.appendChild(opt);
  });
  sel.value=currentCountry;
  sel.addEventListener('change',()=>{ currentCountry=sel.value; updateStats(); syncPicker(); });

  // Sidebar toggle
  document.getElementById('toggleSidebar').addEventListener('click',()=>{
    document.querySelector('.sidebar').classList.toggle('collapsed');
  });

  // Color picker
  const picker=document.getElementById('colorPicker');
  const apply=document.getElementById('applyColor');
  const resetMine=document.getElementById('resetMyColor');
  const resetAll=document.getElementById('resetAllColors');
  const randomize=document.getElementById('randomizePalette');

  function syncPicker(){ picker.value=colorOverrides[currentCountry]||"#ff4b4b"; }
  apply.addEventListener('click',()=>{ colorOverrides[currentCountry]=picker.value; saveColorOverrides(); redrawTerritories(); syncPicker(); });
  resetMine.addEventListener('click',()=>{ delete colorOverrides[currentCountry]; saveColorOverrides(); redrawTerritories(); syncPicker(); });
  resetAll.addEventListener('click',()=>{ colorOverrides={}; saveColorOverrides(); redrawTerritories(); syncPicker(); });
  randomize.addEventListener('click',()=>{ Object.keys(countryData).forEach(c=>{ colorOverrides[c]=`hsl(${(Math.random()*360)|0},70%,55%)`; }); saveColorOverrides(); redrawTerritories(); syncPicker(); });
  syncPicker();
}

/***** Startup *****/
document.addEventListener('DOMContentLoaded',()=>{
  loadColorOverrides();
  setupUI();
  if(initMap()){ updateStats(); }
});
