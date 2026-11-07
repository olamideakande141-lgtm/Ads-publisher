// ADS PUBLISHER SDK - Paste in any bot Mini App
// <script src="https://YOUR-DOMAIN.com/sdk.js?id=p421"></script>
(function(){
  const script = document.currentScript;
  const params = new URLSearchParams(script?.src.split('?')[1]||'');
  const pcode = params.get('id') || window.ADS_PUBLISHER_PCODE || 'p1';
  const BASE = script.src.split('/sdk.js')[0] || '';
  window.ADS_PUBLISHER_PCODE = pcode;
  window.showAdsPublisher = async function(){
    try{
      const res = await fetch(`${BASE}/api/publisher/ad?pcode=${pcode}`);
      const data = await res.json();
      if(!data.ok) return alert(data.error || 'No ads available');
      const ad = data.ad;
      // Show overlay
      let ov = document.getElementById('ads-publisher-overlay');
      if(!ov){
        ov = document.createElement('div'); ov.id='ads-publisher-overlay';
        ov.style.cssText='position:fixed;inset:0;background:#D6E9A8;z-index:9999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
        document.body.appendChild(ov);
      }
      ov.style.display='flex';
      ov.innerHTML = `
        <div style="background:white;border-radius:16px;padding:20px;max-width:420px;width:100%;text-align:center;color:#111">
          <p style="font-weight:900;font-size:18px">${ad.title}</p>
          <p style="font-size:14px;margin-top:8px">${ad.description||''}</p>
          ${ad.media_path ? `<img src="${BASE}${ad.media_path}" style="width:100%;border-radius:12px;margin-top:12px">` : ''}
          <div id="ap-timer" style="margin-top:12px;font-weight:900">Watching... 15s</div>
          <a id="ap-visit" href="${ad.destination_url}" target="_blank" style="display:inline-block;margin-top:12px;background:#0088CC;color:white;padding:12px 24px;border-radius:20px;font-weight:800;text-decoration:none">Visit Advertiser</a>
          <div style="margin-top:10px;font-size:12px;color:#888">ads by ADS PUBLISHER - ${pcode}</div>
        </div>`;
      let sec=15;
      const timer=setInterval(()=>{
        sec--; const el=document.getElementById('ap-timer'); if(el) el.innerText='Watching... '+sec+'s';
        if(sec<=0){
          clearInterval(timer); ov.style.display='none';
          // Claim reward for publisher
          fetch(`${BASE}/api/publisher/reward`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pcode, ad_id: ad.id, viewer_id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || 'anon'})})
          .then(r=>r.json()).then(d=>{ if(d.ok) alert('✅ Ad watched - Publisher earned $'+d.rewarded); });
        }
      },1000);
    }catch(e){ alert('Ads Publisher error: '+e.message); }
  };
  console.log('ADS PUBLISHER SDK loaded for', pcode);
})();
