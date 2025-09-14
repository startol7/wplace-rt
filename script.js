// Leaflet map setup（省略：前回と同じ）

// --- タイルサイズ（省略：前回と同じ） ---

// --- 色選択（省略：前回と同じ） ---

// クールダウン（常に10s）
const COOLDOWN = 10;
let lastPaintAt=0;
const cooldownWrap=document.getElementById('cooldown');
const cooldownFill=document.getElementById('cooldownFill');
const cooldownText=document.getElementById('cooldownText');
function showCooldown(sec){
  const end=Date.now()+sec*1000;
  cooldownWrap.classList.remove('hidden');
  const t=setInterval(()=>{
    const left=end-Date.now();
    if(left<=0){ cooldownFill.style.width='0%'; cooldownText.textContent='0s'; cooldownWrap.classList.add('hidden'); clearInterval(t); return; }
    cooldownText.textContent=Math.ceil(left/1000)+'s';
    cooldownFill.style.width=((sec*1000-left)/(sec*1000)*100)+'%';
  },100);
}
const inCd=()=> Date.now()-lastPaintAt < COOLDOWN*1000;

// --- Firebase 初期化（省略：前回と同じ） ---

// クリックで描画（1×1 固定）
map.on('click', async (e)=>{
  if(inCd()){ showCooldown(Math.ceil((COOLDOWN*1000-(Date.now()-lastPaintAt))/1000)); return; }

  const color=colorPicker.value;
  const lat=snap(e.latlng.lat);
  const lng=snap(e.latlng.lng);

  rectFor(lat,lng,color).addTo(layerTiles); // ローカル描画

  if(db && user){
    const {doc,setDoc,serverTimestamp} = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    try{
      await setDoc(doc(db,'tiles',keyFromLatLng(lat,lng)),{
        key:keyFromLatLng(lat,lng),lat,lng,color,country:currentCountry,uid:user.uid,ts:serverTimestamp()
      },{merge:true});
      updateScores(1);
    }catch(err){ console.warn('Save skipped',err); }
  }

  lastPaintAt=Date.now();
  showCooldown(COOLDOWN);
});
