// ===== Settings =====
const GRID_SIZE = 0.0001;     // ~11m
const COOLDOWN_TIME = 5000;
const INITIAL_TERRITORIES = 50;
const GRID_MIN_ZOOM = 17;
const GRID_MAX_CELLS = 800;

// ===== Country data =====
// 主要 + 拡張 (一部例)
const countryData = {
  JP:{name:'Japan',flag:'🇯🇵',center:[35.6762,139.6503]},
  US:{name:'USA',flag:'🇺🇸',center:[39.8283,-98.5795]},
  CN:{name:'China',flag:'🇨🇳',center:[35.8617,104.1954]},
  IN:{name:'India',flag:'🇮🇳',center:[20.59,78.96]},
  BR:{name:'Brazil',flag:'🇧🇷',center:[-14.23,-51.92]},
  DE:{name:'Germany',flag:'🇩🇪',center:[51.16,10.45]},
  FR:{name:'France',flag:'🇫🇷',center:[46.22,2.21]},
  GB:{name:'UK',flag:'🇬🇧',center:[55.37,-3.43]},
  RU:{name:'Russia',flag:'🇷🇺',center:[61.52,105.31]},
  AU:{name:'Australia',flag:'🇦🇺',center:[-25.27,133.77]},
  CA:{name:'Canada',flag:'🇨🇦',center:[56.13,-106.34]},
  // …必要に応じ追加
};

// ===== Auto color function =====
function getColorForCountry(code) {
  const hash = [...code].reduce((a,c)=>a+c.charCodeAt(0),0);
  const hue = (hash * 137.5) % 360;
  return `hsl(${hue},70%,55%)`;
}

// ===== Territories and occupation stats =====
let territories = new Map();
let occupationStats = {}; // attacker -> victim -> count

// ===== Place territory =====
function placeTerritory(lat,lng){
  if(!canPlace) return;
  const key = getCoordKey(lat,lng);
  const prev = territories.get(key);

  if(prev === currentCountry){
    showNotification('Already yours','warning');
    return;
  }

  territories.set(key,currentCountry);
  redrawTerritories();

  if(prev && prev !== currentCountry){
    // update occupation stats
    if(!occupationStats[currentCountry]) occupationStats[currentCountry] = {};
    occupationStats[currentCountry][prev] = (occupationStats[currentCountry][prev]||0)+1;
    updateOccupationStats();
  }

  // popup + updates
  // ...
}

// ===== Redraw marker =====
function createTerritoryMarker(lat,lng,country){
  const g = getGridCoord(lat,lng);
  return L.rectangle([[g.lat,g.lng],[g.lat+GRID_SIZE,g.lng+GRID_SIZE]],{
    color: getColorForCountry(country),
    fillColor: getColorForCountry(country),
    fillOpacity:.45, weight:1
  });
}

// ===== Occupation Stats UI =====
function updateOccupationStats(){
  const box = document.getElementById('occupationStats');
  let html = '';
  for(const attacker in occupationStats){
    for(const victim in occupationStats[attacker]){
      const count = occupationStats[attacker][victim];
      html += `<div>${countryData[attacker].flag} ${countryData[attacker].name} → ${countryData[victim].flag} ${countryData[victim].name}: <strong>${count}</strong></div>`;
    }
  }
  box.innerHTML = html || '<i>No occupations yet</i>';
}

// ===== Populate select =====
function populateCountrySelect(){
  const sel = document.getElementById('countrySelect');
  sel.innerHTML='';
  const codes = Object.keys(countryData).sort((a,b)=>countryData[a].name.localeCompare(countryData[b].name));
  for(const code of codes){
    const opt=document.createElement('option');
    opt.value=code;
    opt.textContent=`${countryData[code].flag} ${countryData[code].name}`;
    if(code===currentCountry) opt.selected=true;
    sel.appendChild(opt);
  }
}

// ===== DOM ready =====
document.addEventListener('DOMContentLoaded', ()=>{
  populateCountrySelect();
  if(initMap()){
    initializeGame();
    // ...
    showNotification('Game started! Click the map','success');
  }
});
