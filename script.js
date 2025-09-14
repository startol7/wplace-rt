// Country list
const countries = ["Japan","United States","Korea","China","United Kingdom","France","Germany","Brazil","India","Russia","Canada","Australia"];
const sel = document.getElementById("countrySelect");
countries.forEach(c => {
  const o=document.createElement("option");o.value=c;o.textContent=c;sel.append(o);
});
sel.value="Japan";
let currentCountry=sel.value;
sel.addEventListener("change",()=>currentCountry=sel.value);

// Leaflet map
const map = L.map('map').setView([35.6762,139.6503],6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{
  attribution:'© OpenStreetMap contributors'
}).addTo(map);

const layerTiles=L.layerGroup().addTo(map);
let TILE=0.0005;

// util
const snap=v=>Math.floor(v/TILE)*TILE;
const rectFor=(lat,lng,color)=>{
  const lat0=snap(lat),lng0=snap(lng);
  return L.rectangle([[lat0,lng0],[lat0+TILE,lng0+TILE]],{color,fillColor:color,fillOpacity:.5,weight:1});
};

// tile size change
document.querySelectorAll('.seg-btn[data-tile]').forEach(b=>{
  b.addEventListener('click',()=>{
    document.querySelectorAll('.seg-btn[data-tile]').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    TILE=parseFloat(b.dataset.tile);
  });
});
document.getElementById("tileApply").addEventListener("click",()=>{
  const v=parseFloat(document.getElementById("tileCustom").value);
  if(v>0){TILE=v;}
});

// color
const colorPicker=document.getElementById("colorPicker");
const colorHex=document.getElementById("colorHex");
colorPicker.addEventListener("input",e=>colorHex.value=e.target.value);
colorHex.addEventListener("input",e=>{
  if(/^#?[0-9a-f]{6}$/i.test(e.target.value)){
    const v=e.target.value.startsWith("#")?e.target.value:"#"+e.target.value;
    colorPicker.value=v;
  }
});

// cooldown
const COOLDOWN=10;
let last=0;
const cdWrap=document.getElementById("cooldown");
const cdFill=document.getElementById("cooldownFill");
const cdText=document.getElementById("cooldownText");
function showCd(sec){
  const end=Date.now()+sec*1000;
  cdWrap.classList.remove("hidden");
  const t=setInterval(()=>{
    const left=end-Date.now();
    if(left<=0){clearInterval(t);cdWrap.classList.add("hidden");cdFill.style.width="0%";cdText.textContent="0s";return;}
    cdText.textContent=Math.ceil(left/1000)+"s";
    cdFill.style.width=((COOLDOWN*1000-left)/(COOLDOWN*1000)*100)+"%";
  },100);
}
function inCd(){return Date.now()-last<COOLDOWN*1000;}

// click paint
map.on("click",e=>{
  if(inCd()){const left=Math.ceil((COOLDOWN*1000-(Date.now()-last))/1000);showCd(left);return;}
  const lat=snap(e.latlng.lat),lng=snap(e.latlng.lng),color=colorPicker.value;
  rectFor(lat,lng,color).addTo(layerTiles);
  last=Date.now();showCd(COOLDOWN);
  document.getElementById("statTotal").textContent=parseInt(document.getElementById("statTotal").textContent)+1;
  document.getElementById("statMine").textContent=parseInt(document.getElementById("statMine").textContent)+1;
});

// dummy online
setInterval(()=>{document.getElementById("statOnline").textContent=Math.floor(200+Math.random()*600);},8000);
