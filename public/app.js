let tg = window.Telegram?.WebApp; if(tg){ tg.expand(); tg.ready(); }
let selectedNet='TRC20', packages=[], settings={}, headers={};
let previewTimer=null, previewCanClose=false;
function getHeaders(){
  const initData = tg?.initData || '';
  headers = {'Content-Type':'application/json'};
  if(initData) headers['x-telegram-initdata']=initData;
  const params=new URLSearchParams(location.search);
  if(params.get('tg_id') && !initData) headers['x-telegram-user']=JSON.stringify({id:params.get('tg_id'),username:params.get('tg_user')||'test',first_name:'Test'});
  return headers;
}
function showToast(m){ const t=document.getElementById('toast'); t.innerText=m; t.style.display='block'; setTimeout(()=> t.style.display='none',3000); }
function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function switchTab(t){ ['home','advertise','deposit','campaigns','publisher','account'].forEach(x=>{ document.getElementById('tab-'+x).classList.add('hidden'); document.getElementById('nav-'+x).classList.remove('nav-active'); document.getElementById('nav-'+x).classList.add('text-gray-500'); }); document.getElementById('tab-'+t).classList.remove('hidden'); document.getElementById('nav-'+t).classList.add('nav-active'); document.getElementById('nav-'+t).classList.remove('text-gray-500'); if(t==='campaigns') renderMyAds(); if(t==='publisher') renderPublishers(); }
function selectNet(n){ selectedNet=n; document.getElementById('depNetLabel').innerText=n; document.getElementById('btnTRC').className=n==='TRC20'?'bg-[#8B7CF8] p-3 rounded-[12px] text-sm font-bold':'bg-[#0B0E1A] border border-[#2A3452] p-3 rounded-[12px] text-sm font-bold'; document.getElementById('btnERC').className=n==='ERC20'?'bg-[#8B7CF8] p-3 rounded-[12px] text-sm font-bold':'bg-[#0B0E1A] border border-[#2A3452] p-3 rounded-[12px] text-sm font-bold'; document.getElementById('walletAddr').innerText=n==='TRC20'?(settings.USDT_TRC20||'Not set - contact admin'):(settings.USDT_ERC20||'Not set - contact admin'); }
function copyWallet(){ navigator.clipboard.writeText(document.getElementById('walletAddr').innerText); showToast('Address copied'); }
function updatePrice(){ const sel=document.getElementById('adPackage'); const p=packages.find(x=> String(x.id)===sel.value); document.getElementById('totalCost').innerText=p?'$'+p.price+' USDT':'$0'; }

// ===== PROFESSIONAL AD PREVIEW - Same layout as sdk.js =====
function showPreviewPopup(brand, title, desc, dest, mediaUrl, isVideo){
  previewCanClose=false;
  if(previewTimer) clearInterval(previewTimer);
  // Create overlay if not exists
  let overlay = document.getElementById('adPreviewOverlay');
  if(!overlay){
    overlay = document.createElement('div');
    overlay.id='adPreviewOverlay';
    overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)';
    overlay.innerHTML='<div id="adPreviewInner" style="background:#fff;border-radius:20px;width:100%;max-width:420px;color:#0B0E1A;overflow:hidden;max-height:92vh;overflow-y:auto"></div>';
    document.body.appendChild(overlay);
    // Inject preview CSS once
    if(!document.getElementById('ap-preview-css')){
      let s=document.createElement('style'); s.id='ap-preview-css';
      s.textContent='.ap-head{display:flex;justify-content:space-between;align-items:center;padding:14px 14px 0}.ap-pill-sponsored{background:#0B0E1A;color:#fff;font-size:11px;font-weight:800;padding:6px 12px;border-radius:20px}.ap-pill-timer{background:#FFD700;color:#000;font-size:12px;font-weight:900;padding:6px 12px;border-radius:20px}.ap-pill-timer.done{background:#16A34A;color:#fff}.ap-close{width:32px;height:32px;border-radius:50%;border:0;background:#EDEDEF;color:#9CA3AF;font-size:16px;font-weight:900;cursor:not-allowed;margin-left:8px}.ap-close.enabled{background:#0B0E1A;color:#fff;cursor:pointer}.ap-progress{background:#EEE;height:6px;border-radius:10px;margin:12px 14px 0;overflow:hidden}.ap-progress-bar{background:linear-gradient(90deg,#FFD700,#FFB800);height:100%;width:0%;transition:width 1s linear}.ap-media{margin:14px 14px 0;border-radius:14px;overflow:hidden;background:#F3F4F6}.ap-media img,.ap-media video{width:100%;display:block;max-height:260px;object-fit:cover}.ap-body{padding:14px}.ap-brand{font-size:11px;font-weight:800;letter-spacing:1px;color:#6B7280;text-transform:uppercase}.ap-title{font-size:19px;font-weight:900;line-height:1.25;margin-top:4px}.ap-desc{font-size:13.5px;line-height:1.6;color:#4B5563;margin-top:8px}.ap-complete{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;font-size:12px;font-weight:700;padding:10px 12px;border-radius:12px;margin:0 14px 12px;text-align:center;display:none}.ap-cta{display:block;background:linear-gradient(90deg,#FFD700,#FFB800);color:#000;padding:15px;border-radius:14px;font-weight:900;font-size:15px;text-align:center;text-decoration:none;margin:14px 14px 4px}.ap-footer{text-align:center;font-size:11px;color:#9CA3AF;padding:0 14px 14px}';
      document.head.appendChild(s);
    }
  }
  let mediaHtml='';
  if(mediaUrl){
    if(isVideo) mediaHtml='<div class="ap-media"><video src="'+mediaUrl+'" controls autoplay muted playsinline loop></video></div>';
    else mediaHtml='<div class="ap-media"><img src="'+mediaUrl+'" onerror="this.parentElement.style.display=\'none\'"/></div>';
  }
  document.getElementById('adPreviewInner').innerHTML =
    '<div class="ap-head"><span class="ap-pill-sponsored">Sponsored</span><span style="display:flex;align-items:center"><span id="previewTimer" class="ap-pill-timer">Ad ends in 15s</span><button id="previewClose" disabled class="ap-close">✕</button></span></div>'
    + '<div class="ap-progress"><div id="previewBar" class="ap-progress-bar"></div></div>'
    + mediaHtml
    + '<div class="ap-body"><div class="ap-brand">'+escapeHtml(brand||'Your Brand')+'</div><div class="ap-title">'+escapeHtml(title||'Your Ad Title')+'</div><div class="ap-desc">'+escapeHtml(desc||'Your ad description will appear here.')+'</div></div>'
    + '<div id="previewComplete" class="ap-complete">✅ Thanks for viewing this sponsored ad. You can close now.</div>'
    + '<a href="'+escapeHtml(dest||'#')+'" target="_blank" class="ap-cta">👉 VISIT AD</a>'
    + '<div class="ap-footer">Ads by Ads Publisher</div>';
  overlay.style.display='flex';
  let closeBtn=document.getElementById('previewClose');
  closeBtn.onclick=function(){ if(previewCanClose) closePreview(); };
  let remaining=15;
  previewTimer=setInterval(function(){
    remaining--;
    let bar=document.getElementById('previewBar'); if(bar) bar.style.width=Math.floor(((15-remaining)/15)*100)+'%';
    let pill=document.getElementById('previewTimer');
    if(remaining>0){ if(pill) pill.textContent='Ad ends in '+remaining+'s'; }
    else {
      clearInterval(previewTimer);
      if(bar) bar.style.width='100%';
      if(pill){ pill.textContent='You can close now'; pill.classList.add('done'); }
      let comp=document.getElementById('previewComplete'); if(comp) comp.style.display='block';
      previewCanClose=true;
      if(closeBtn){ closeBtn.disabled=false; closeBtn.classList.add('enabled'); }
    }
  },1000);
}
function closePreview(){ if(!previewCanClose) return; if(previewTimer) clearInterval(previewTimer); document.getElementById('adPreviewOverlay').style.display='none'; }
function previewAd(){
  let brand=document.getElementById('adBrand') ? document.getElementById('adBrand').value.trim() : '';
  let title=document.getElementById('adTitle').value.trim();
  let desc=document.getElementById('adDesc').value.trim();
  let dest=document.getElementById('adUrl').value.trim();
  if(!brand) return showToast('Enter Brand / Business Name first');
  if(!title) return showToast('Enter Advertisement Title first');
  let file=document.getElementById('adMedia').files[0];
  let mediaUrl='', isVideo=false;
  if(file){ mediaUrl=URL.createObjectURL(file); isVideo=file.type.startsWith('video'); }
  showPreviewPopup(brand, title, desc, dest, mediaUrl, isVideo);
}
function previewAdFromData(ad){
  let mediaUrl = ad.media_path ? (ad.media_path.startsWith('http') ? ad.media_path : '/' + ad.media_path) : (ad.media_url||'');
  let isVideo = ad.media_type==='video' || (mediaUrl && mediaUrl.includes('.mp4'));
  showPreviewPopup(ad.brand||ad.brand_name||ad.business_name||'Sponsored', ad.title, ad.description, ad.destination_url, mediaUrl, isVideo);
}
async function testPublisherAd(){
  if(typeof window.showAdsPublisher !== 'function'){ showToast('SDK no load. Check sdk.js'); return; }
  try{
    let r = await window.showAdsPublisher();
    if(r && !r.ok) showToast(r.msg || 'No ads available');
  }catch(e){ showToast('Ad error: '+e.message); }
}

async function loadAll(){
  getHeaders();
  const [meRes,pkgRes,setRes,liveRes]=await Promise.all([fetch('/api/me',{headers}),fetch('/api/packages'),fetch('/api/settings-public'),fetch('/api/ads/published')]);
  if(!meRes.ok){ showToast('Open via Telegram Bot Mini App'); return; }
  const me=await meRes.json(); packages=await pkgRes.json(); settings=await setRes.json(); const live=await liveRes.json();
  document.getElementById('balanceMain').innerText=(me.wallet?.available||0).toFixed(4);
  document.getElementById('totalDep').innerText=(me.wallet?.total_deposited||0).toFixed(2);
  document.getElementById('totalSpent').innerText=(me.wallet?.total_spent||0).toFixed(2);
  document.getElementById('activeCount').innerText=me.active||0;
  document.getElementById('balAcc').innerText=(me.wallet?.available||0).toFixed(4);
  document.getElementById('depAcc').innerText=(me.wallet?.total_deposited||0).toFixed(2);
  document.getElementById('spentAcc').innerText=(me.wallet?.total_spent||0).toFixed(2);
  document.getElementById('earnAcc').innerText=(me.wallet?.total_earned||0).toFixed(4);
  document.getElementById('refAcc').innerText=(me.wallet?.total_refunded||0).toFixed(2);
  document.getElementById('userName').innerText=me.user.first_name||me.user.username||'User';
  document.getElementById('userHandle').innerText='@'+(me.user.username||'user');
  document.getElementById('userId').innerText=me.user.telegram_id;
  document.getElementById('pubReward').innerText=settings.PUBLISHER_REWARD_PER_VIEW||'0.005';
  document.getElementById('adPackage').innerHTML=packages.map(p=> `<option value="${p.id}">${p.name} - $${p.price} - ${p.duration_days} days (${p.placement})</option>`).join('');
  updatePrice(); selectNet('TRC20');
  const txHtml=me.txs.map(t=> `<div class="flex justify-between bg-[#0B0E1A] p-2 rounded"><span>${t.type} - ${t.note||''}</span><b class="${t.amount>=0?'text-[#00D492]':'text-red-400'}">${t.amount>=0?'+':''}${t.amount}</b></div>`).join('')||'No transactions';
  document.getElementById('txList').innerHTML=txHtml; document.getElementById('txFull').innerHTML=txHtml;
  document.getElementById('myDeposits').innerHTML='<p class="font-bold text-sm">My Deposits</p>'+(me.deposits.map(d=> `<div class="bg-[#0B0E1A] p-2 rounded text-xs flex justify-between"><span>${d.amount} USDT ${d.network} - ${d.tx_hash.slice(0,12)}...</span><b>${d.status}</b></div>`).join('')||'No deposits');
  // Professional Live Ads - white card inside dark app, with brand + Sponsored
  document.getElementById('liveAds').innerHTML=live.length?live.map(a=> `
    <div class="bg-white text-black rounded-[16px] p-3">
      <div class="flex justify-between items-center"><span class="bg-black text-white text-[10px] px-2 py-1 rounded-full font-bold">Sponsored</span><span class="text-[10px] bg-green-600 text-white px-2 py-1 rounded-full">PUBLISHED</span></div>
      ${a.media_path?`<img src="/${a.media_path}" class="w-full rounded-lg my-2">`:''}
      <p class="text-[10px] font-bold tracking-widest text-gray-500 uppercase">${escapeHtml(a.brand||a.brand_name||a.business_name||'Sponsored')}</p>
      <p class="font-bold text-sm mt-1">${escapeHtml(a.title)}</p>
      <p class="text-xs text-gray-500 mt-1">${escapeHtml(a.description||'')}</p>
      <a href="${a.destination_url}" target="_blank" class="bg-[#FFD700] text-black inline-block mt-2 px-4 py-2 rounded-full text-xs font-bold">👉 VISIT AD</a>
      <p class="text-[10px] text-gray-400 text-center mt-2">Ads by Ads Publisher</p>
      <button onclick="previewAdFromData(${JSON.stringify(a).replace(/"/g,'&quot;')})" class="bg-[#0B0E1A] text-white w-full mt-2 py-2 rounded-full text-xs font-bold">👁️ Preview Professional Popup</button>
    </div>`).join(''):'<p class="text-gray-500 text-xs">No published ads yet</p>';
  window._me=me;
}
function renderMyAds(){
  const me=window._me; if(!me) return;
  document.getElementById('myAds').innerHTML=me.ads.length?me.ads.map((a,idx)=> `<div class="card rounded-[16px] p-3"><div class="flex justify-between"><b class="text-sm">${escapeHtml(a.title)}</b><span class="text-[10px] bg-[#0B0E1A] border px-2 py-1 rounded-full">${a.status}</span></div><p class="text-xs text-gray-400 mt-1">${escapeHtml(a.brand||a.brand_name||'')} • ${a.category} | ${a.placement} | $${a.price} | ${a.duration_days} days</p><p class="text-xs mt-1"><a href="${a.destination_url}" target="_blank" class="text-blue-400 break-all">${a.destination_url}</a></p>${a.moderation_note?`<p class="text-xs text-yellow-300 mt-1">Note: ${escapeHtml(a.moderation_note)}</p>`:''}<button onclick="previewAdFromData(window._me.ads[${idx}])" class="bg-white text-black w-full mt-2 py-2 rounded-full text-xs font-bold">👁️ Preview Professional Ad</button></div>`).join(''):'<p class="text-gray-500 text-xs">No ads yet</p>';
}
function renderPublishers(){
  const me=window._me; if(!me) return;
  const base = location.origin;
  document.getElementById('myPublishers').innerHTML = me.publishers.length ? me.publishers.map(p=> `
    <div class="card rounded-[16px] p-4">
      <div class="flex justify-between"><b>${p.bot_username}</b><span class="text-[10px] bg-[#0B0E1A] px-2 py-1 rounded-full">${p.status}</span></div>
      <p class="text-xs mt-2">Pass Code: <b class="text-[#FF8C00] text-base">${p.pcode}</b></p>
      <p class="text-xs break-all">API Key: <span class="font-mono">${p.api_key}</span></p>
      <p class="text-xs break-all mt-1">SDK: <span class="font-mono">${base}/sdk.js?id=${p.pcode}</span></p>
      <p class="text-xs mt-1">Views: ${p.total_views} | Earned: $${p.total_earned}</p>
      <div class="bg-black/30 p-2 rounded mt-2 text-[11px] font-mono break-all">
        &lt;script src="${base}/sdk.js?id=${p.pcode}"&gt;&lt;/script&gt;<br><br>
        // Body - Professional Popup - Backend verifies 15s + dedupe<br>
        window.showAdsPublisher()<br>
        &nbsp;&nbsp;.then(r =&gt; { /* send r.ad.id + viewer_id to YOUR backend */ })<br>
        &nbsp;&nbsp;.catch(e =&gt; console.log(e));<br><br>
        // Mini Card: window.renderMiniAd('my-ad-slot');<br><br>
        // Callback: POST ${base}/api/publisher/view {api_key, pcode, ad_id, viewer_id, request_id, event_id}
      </div>
      <div class="flex gap-2 mt-2">
        <button onclick="copySDK('${base}/sdk.js?id=${p.pcode}')" class="bg-[#8B7CF8] flex-1 px-4 py-2 rounded-full text-xs font-bold">Copy SDK</button>
        <button onclick="copyFullCode('${base}/sdk.js?id=${p.pcode}')" class="bg-[#FFD700] text-black flex-1 px-4 py-2 rounded-full text-xs font-bold">Copy Full Code</button>
      </div>
      <button onclick="testPublisherAd()" class="bg-white text-black w-full mt-2 py-2 rounded-full text-xs font-bold">▶️ Test Professional Ad</button>
      ${p.status==='Pending' ? '<p class="text-xs text-yellow-300 mt-2">⏳ Waiting admin approval</p>' : ''}
    </div>`).join('') : '<p class="text-gray-500 text-xs">No publisher yet. Register your bot above.</p>';
}
function copySDK(t){ navigator.clipboard.writeText(`<script src="${t}"></script>`); showToast('SDK copied - paste in your bot'); }
function copyFullCode(t){
  const code = `<script src="${t}"></script>\n\n<!-- Body -->\n<script>\nwindow.showAdsPublisher()\n  .then(r => { /* backend verify 15s + dedupe */ })\n  .catch(e => console.log(e));\n// Mini: window.renderMiniAd('my-ad-slot');\n</` + `script>`;
  navigator.clipboard.writeText(code); showToast('Full professional code copied');
}
async function registerPublisher(){
  const res=await fetch('/api/publisher/register',{method:'POST',headers:getHeaders(),body:JSON.stringify({bot_username:document.getElementById('pubBot').value, bot_name:document.getElementById('pubName').value, mini_app_url:document.getElementById('pubUrl').value})});
  const d=await res.json(); if(d.ok){ showToast('✅ Publisher registered - Pass Code '+d.pcode+' - Wait admin approval'); loadAll(); } else showToast(d.error||'Failed');
}
async function submitDeposit(){
  const amount=document.getElementById('depAmount').value; const tx=document.getElementById('depTx').value.trim(); const proof=document.getElementById('depProof').files[0];
  if(!amount||!tx) return showToast('Enter amount + TX hash');
  const fd=new FormData(); fd.append('network',selectedNet); fd.append('amount',amount); fd.append('tx_hash',tx); if(proof) fd.append('proof',proof);
  const h=getHeaders(); delete h['Content-Type'];
  const res=await fetch('/api/deposit',{method:'POST',headers:h,body:fd}); const d=await res.json();
  if(d.ok){ showToast('✅ Deposit submitted - Pending Confirmation'); loadAll(); } else showToast(d.error||'Failed');
}
async function submitAd(){
  const brand = document.getElementById('adBrand') ? document.getElementById('adBrand').value.trim() : '';
  const title = document.getElementById('adTitle').value.trim();
  const url = document.getElementById('adUrl').value.trim();
  if(!brand) return showToast('Enter Brand / Business Name');
  if(!title) return showToast('Enter Advertisement Title');
  if(!url) return showToast('Enter Destination URL');
  const fd=new FormData();
  fd.append('brand',brand); fd.append('brand_name',brand); fd.append('business_name',brand);
  fd.append('title',title); fd.append('description',document.getElementById('adDesc').value); fd.append('destination_url',url); fd.append('category',document.getElementById('adCategory').value); fd.append('placement',document.getElementById('adPlacement').value); fd.append('package_id',document.getElementById('adPackage').value);
  const media=document.getElementById('adMedia').files[0];
  if(media){ fd.append('media',media); fd.append('media_type', media.type.startsWith('video') ? 'video' : 'image'); }
  const h=getHeaders(); delete h['Content-Type'];
  const res=await fetch('/api/advertisement',{method:'POST',headers:h,body:fd}); const d=await res.json();
  if(d.ok){ showToast('✅ Ad submitted - Awaiting Moderation'); loadAll(); switchTab('campaigns'); } else showToast(d.error||'Failed');
}
loadAll();
