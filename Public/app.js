let tg = window.Telegram?.WebApp; if(tg){ tg.expand(); tg.ready(); }
let selectedNet='TRC20', packages=[], settings={}, headers={};
function getHeaders(){
  const initData = tg?.initData || '';
  headers = {'Content-Type':'application/json'};
  if(initData) headers['x-telegram-initdata']=initData;
  const params=new URLSearchParams(location.search);
  if(params.get('tg_id') && !initData) headers['x-telegram-user']=JSON.stringify({id:params.get('tg_id'),username:params.get('tg_user')||'test',first_name:'Test'});
  return headers;
}
function showToast(m){ const t=document.getElementById('toast'); t.innerText=m; t.style.display='block'; setTimeout(()=> t.style.display='none',3000); }
function switchTab(t){ ['home','advertise','deposit','campaigns','publisher','account'].forEach(x=>{ document.getElementById('tab-'+x).classList.add('hidden'); document.getElementById('nav-'+x).classList.remove('nav-active'); document.getElementById('nav-'+x).classList.add('text-gray-500'); }); document.getElementById('tab-'+t).classList.remove('hidden'); document.getElementById('nav-'+t).classList.add('nav-active'); document.getElementById('nav-'+t).classList.remove('text-gray-500'); if(t==='campaigns') renderMyAds(); if(t==='publisher') renderPublishers(); }
function selectNet(n){ selectedNet=n; document.getElementById('depNetLabel').innerText=n; document.getElementById('btnTRC').className=n==='TRC20'?'bg-[#8B7CF8] p-3 rounded-[12px] text-sm font-bold':'bg-[#0B0E1A] border border-[#2A3452] p-3 rounded-[12px] text-sm font-bold'; document.getElementById('btnERC').className=n==='ERC20'?'bg-[#8B7CF8] p-3 rounded-[12px] text-sm font-bold':'bg-[#0B0E1A] border border-[#2A3452] p-3 rounded-[12px] text-sm font-bold'; document.getElementById('walletAddr').innerText=n==='TRC20'?(settings.USDT_TRC20||'Not set - contact admin'):(settings.USDT_ERC20||'Not set - contact admin'); }
function copyWallet(){ navigator.clipboard.writeText(document.getElementById('walletAddr').innerText); showToast('Address copied'); }
function updatePrice(){ const sel=document.getElementById('adPackage'); const p=packages.find(x=> String(x.id)===sel.value); document.getElementById('totalCost').innerText=p?'$'+p.price+' USDT':'$0'; }
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
  document.getElementById('liveAds').innerHTML=live.length?live.map(a=> `<div class="card rounded-[16px] p-3">${a.media_path?`<img src="/${a.media_path}" class="w-full rounded-lg mb-2">`:''}<p class="font-bold text-sm">${a.title}</p><p class="text-xs text-gray-400">${a.description||''}</p><a href="${a.destination_url}" target="_blank" class="bg-[#8B7CF8] inline-block mt-2 px-4 py-2 rounded-full text-xs font-bold">Visit</a><span class="text-[10px] bg-green-600 px-2 py-1 rounded-full ml-2">PUBLISHED</span></div>`).join(''):'<p class="text-gray-500 text-xs">No published ads yet</p>';
  window._me=me;
}
function renderMyAds(){ const me=window._me; if(!me) return; document.getElementById('myAds').innerHTML=me.ads.length?me.ads.map(a=> `<div class="card rounded-[16px] p-3"><div class="flex justify-between"><b class="text-sm">${a.title}</b><span class="text-[10px] bg-[#0B0E1A] border px-2 py-1 rounded-full">${a.status}</span></div><p class="text-xs text-gray-400 mt-1">${a.category} | ${a.placement} | $${a.price} | ${a.duration_days} days</p><p class="text-xs mt-1"><a href="${a.destination_url}" target="_blank" class="text-blue-400 break-all">${a.destination_url}</a></p>${a.moderation_note?`<p class="text-xs text-yellow-300 mt-1">Note: ${a.moderation_note}</p>`:''}</div>`).join(''):'<p class="text-gray-500 text-xs">No ads yet</p>'; }
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
      <div class="bg-black/30 p-2 rounded mt-2 text-[11px] font-mono break-all">&lt;script src="${base}/sdk.js?id=${p.pcode}"&gt;&lt;/script&gt;<br>&lt;button onclick="window.showAdsPublisher()"&gt;Watch Ad&lt;/button&gt;</div>
      <button onclick="copySDK('${base}/sdk.js?id=${p.pcode}')" class="bg-[#8B7CF8] mt-2 px-4 py-2 rounded-full text-xs font-bold">Copy SDK</button>
      ${p.status==='Pending' ? '<p class="text-xs text-yellow-300 mt-2">⏳ Waiting admin approval</p>' : ''}
    </div>`).join('') : '<p class="text-gray-500 text-xs">No publisher yet. Register your bot above.</p>';
}
function copySDK(t){ navigator.clipboard.writeText(`<script src="${t}"></script>`); showToast('SDK copied - paste in your bot'); }
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
  const fd=new FormData(); fd.append('title',document.getElementById('adTitle').value); fd.append('description',document.getElementById('adDesc').value); fd.append('destination_url',document.getElementById('adUrl').value); fd.append('category',document.getElementById('adCategory').value); fd.append('placement',document.getElementById('adPlacement').value); fd.append('package_id',document.getElementById('adPackage').value);
  const media=document.getElementById('adMedia').files[0]; if(media) fd.append('media',media);
  const h=getHeaders(); delete h['Content-Type'];
  const res=await fetch('/api/advertisement',{method:'POST',headers:h,body:fd}); const d=await res.json();
  if(d.ok){ showToast('✅ Ad submitted - Awaiting Moderation'); loadAll(); switchTab('campaigns'); } else showToast(d.error||'Failed');
}
loadAll();
