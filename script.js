// ====== Country list ======
const COUNTRIES = ["Japan","United States","Korea","China","United Kingdom","France","Germany","Brazil","India","Russia","Canada","Australia"];
const sel = document.getElementById('countrySelect');
COUNTRIES.forEach(c => { const o=document.createElement('option'); o.value=c; o.textContent=c; sel.append(o); });
sel.value = 'Japan';
let currentCountry = sel.value;
sel.addEventListener('change', ()=> currentCountry = sel.value);

// ====== Leaflet init ======
const map = L.map('map', { worldCopyJump:true }).setView([35.6762,139.6503], 6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution:'© OpenStreetMap contributors', maxZoom:19, detectRetina:true, subdomains:'abc'
})
.on('tileerror', e => console.warn('OSM tile error:', e))
.addTo(map);

const layerTiles = L.layerGroup().addTo(map);

// ====== Tile size (1×1 only) ======
let TILE = parseFloat(localStorage.getItem('tile') || '0.0005');
document.getElementById('tileCustom').value = TILE;

document.querySelectorAll('.seg-btn[data-tile]').forEach(b=>{
  b.addEventListener('click', ()=>{
    document.querySelectorAll('.seg-btn[data-tile]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    setTile(parseFloat(b.dataset.tile));
  });
});
document.getElementById('tileApply').addEventListener('click', ()=>{
  const v = parseFloat(document.getElementById('tileCustom').value);
  if(!isFinite(v)||v<=0){ alert('Invalid value'); return; }
  setTile(v);
});
function setTile(v){
  TILE=v; localStorage.setItem('tile', String(v));
  reloadLocal(); invalidateSoon(80);
}
const snap = v => Math.floor(v / TILE) * TILE;
const keyFrom = (lat,lng)=>`${snap(lat).toFixed(6)},${snap(lng).toFixed(6)}`;
const rectFor = (lat,lng,color)=>{
  const lat0=snap(lat), lng0=snap(lng);
  return L.rectangle([[lat0,lng0],[lat0+TILE,lng0+TILE]], {color, fillColor:color, fillOpacity:.5, weight:1});
};

// ====== Color ======
const colorPicker = document.getElementById('colorPicker');
const colorHex = document.getElementById('colorHex');
colorPicker.addEventListener('input', e=> colorHex.value = e.target.value);
colorHex.addEventListener('input', e=>{
  if(/^#?[0-9a-fA-F]{6}$/.test(e.target.value)){
    const v = e.target.value.startsWith('#')? e.target.value : '#'+e.target.value;
    colorPicker.value = v;
  }
});

// ====== Cooldown 10s ======
const COOLDOWN = 10;
let last = 0;
const cdWrap = document.getElementById('cooldown');
const cdFill = document.getElementById('cooldownFill');
const cdText = document.getElementById('cooldownText');
const inCd = () => Date.now() - last < COOLDOWN*1000;
function showCd(sec){
  const end = Date.now() + sec*1000;
  cdWrap.classList.remove('hidden');
  const t = setInterval(()=>{
    const left = end - Date.now();
    if(left <= 0){
      clearInterval(t);
      cdWrap.classList.add('hidden');
      cdFill.style.width = '0%';
      cdText.textContent = '0s';
      return;
    }
    cdText.textContent = Math.ceil(left/1000)+'s';
    cdFill.style.width = ((COOLDOWN*1000-left)/(COOLDOWN*1000)*100)+'%';
  }, 100);
}

// ====== Local persistence (browser only) ======
const LS_KEY = 'teplace-local-tiles-v1';
const loadLocal = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; } };
const saveLocal = (d) => localStorage.setItem(LS_KEY, JSON.stringify(d));

function reloadLocal(){
  layerTiles.clearLayers();
  const data = loadLocal();
  Object.values(data).forEach(t => rectFor(t.lat, t.lng, t.color).addTo(layerTiles));
  document.getElementById('statTotal').textContent = Object.keys(data).length;
}
reloadLocal();

// ====== Paint (tap) ======
map.on('click', (e)=>{
  // デバッグ：タップが届いているか確認（必要なら残す）
  // console.log('map click', e.latlng);

  if (inCd()){
    const left=Math.ceil((COOLDOWN*1000 - (Date.now()-last))/1000);
    showCd(left); return;
  }
  const lat = snap(e.latlng.lat);
  const lng = snap(e.latlng.lng);
  const color = colorPicker.value;
  const key = keyFrom(lat,lng);

  const data = loadLocal();
  data[key] = { key, lat, lng, color, country: currentCountry, ts: Date.now() };
  saveLocal(data);

  rectFor(lat,lng,color).addTo(layerTiles);
  document.getElementById('statTotal').textContent = Object.keys(data).length;
  document.getElementById('statMine').textContent = (parseInt(document.getElementById('statMine').textContent||'0',10) + 1);

  last = Date.now();
  showCd(COOLDOWN);
});

// ====== Dummy ranking & online ======
function refreshDummy(){
  document.getElementById('statOnline').textContent = Math.floor(200+Math.random()*600);
  const cnt = {};
  Object.values(loadLocal()).forEach(t => cnt[t.country] = (cnt[t.country]||0)+1);
  const ul = document.getElementById('rankingList'); ul.innerHTML='';
  const arr = Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,10);
  if(arr.length===0){ ul.innerHTML='<li>No data yet</li>'; return; }
  arr.forEach(([name,c])=>{
    const li=document.createElement('li');
    li.innerHTML = `<span>${name}</span><strong>${c}</strong>`;
    ul.append(li);
  });
}
refreshDummy();
setInterval(refreshDummy, 8000);

// ====== Touch fixes ======
// ダブルタップズーム抑止は“地図の箱だけ”に限定（UIは妨げない）
(function limitDoubleTap(){
  const el = map.getContainer();
  let lastTouch = 0;
  el.addEventListener('touchend', (e)=>{
    const now = Date.now();
    if (now - lastTouch <= 300) e.preventDefault();
    lastTouch = now;
  }, { passive:false });
})();

// タッチ端末でのパン/タップを明示的に有効化
if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
  map.dragging.enable();
  if (map.tap && typeof map.tap.enable === 'function') map.tap.enable();
}

// ====== Resize / Panel toggle で地図サイズを再計測 ======
const invalidateSoon = (ms=120)=> setTimeout(()=> map.invalidateSize({animate:false}), ms);
window.addEventListener('resize', ()=> invalidateSoon(120), {passive:true});
window.addEventListener('orientationchange', ()=> invalidateSoon(200), {passive:true});
document.querySelectorAll('.info-panels details')
  .forEach(d => d.addEventListener('toggle', ()=> invalidateSoon(150)));

// ====== Country select / Sign ボタン（ダミー） ======
document.getElementById('signBtn').addEventListener('click', function(){
  this.textContent = this.textContent === 'Sign in' ? 'Sign out' : 'Sign in';
});