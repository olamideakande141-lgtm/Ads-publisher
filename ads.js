// ADS PUBLISHER SDK - ads.js - FULL FILE - public/ads.js
(function(){
  var script = document.currentScript;
  if(!script) script = document.querySelector('script[src*="ads.js"]');
  var PCODE = script ? script.getAttribute("data-pcode") : null;
  var API_KEY = script ? script.getAttribute("data-api-key") : null;
  var BASE = "https://ads-publisher.onrender.com";

  window._adsPublisherPcode = PCODE;
  window._adsPublisherKey = API_KEY;

  window.showAdsPublisher = function(){
    return new Promise(async function(resolve, reject){
      try{
        var pcode = window._adsPublisherPcode || PCODE || 'p1';
        var api_key = window._adsPublisherKey || API_KEY || '';
        if(!pcode || !api_key){
          alert('Missing pcode or api_key - check script tag');
          return reject({ code: "NO_KEY", message: "Missing pcode or api_key in header script" });
        }
        const res = await fetch(`${BASE}/api/publisher/ads?pcode=${encodeURIComponent(pcode)}&api_key=${encodeURIComponent(api_key)}`);
        const data = await res.json();
        if(data && data.error){
          alert(data.error);
          return reject({ code: "API_ERROR", message: data.error });
        }
        const ads = Array.isArray(data) ? data : (data.ads || data.items || []);
        if(!ads.length){
          alert('No ads available now, try later');
          return reject({ code: "NO_ADS", message: "No ads available" });
        }
        const ad = ads[0];
        var old = document.getElementById('adsPublisherOverlay');
        if(old) old.remove();
        const overlay = document.createElement("div");
        overlay.id = "adsPublisherOverlay";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px";
        let mediaHtml = "";
        if(ad.media_url || ad.media_path){
          const raw = ad.media_url || ad.media_path;
          const url = raw.startsWith("http") ? raw : BASE + raw;
          mediaHtml = (ad.media_type && ad.media_type.includes("video")) ? `<video src="${url}" controls autoplay style="width:100%;border-radius:12px"></video>` : `<img src="${url}" style="width:100%;border-radius:12px">`;
        }
        overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:16px;max-width:420px;width:100%;text-align:center;color:#111">${mediaHtml}<h3 style="margin:12px 0 6px;font-family:Arial;font-size:18px;font-weight:900">${ad.title || "Sponsored"}</h3><p style="color:#475569;font-family:Arial;font-size:14px">${ad.description || ""}</p><a href="${ad.destination_url || "#"}" target="_blank" style="display:block;text-align:center;background:#FFD700;color:#000;padding:12px;border-radius:10px;text-decoration:none;font-family:Arial;font-weight:700;margin:12px 0">👉 VISIT AD</a><button id="adsCloseBtn" style="width:100%;padding:12px;border:0;border-radius:10px;background:#eee;font-weight:700;cursor:pointer">Close & Earn $0.005</button><p style="font-size:11px;color:#999;margin-top:10px">Ads by Ads Publisher</p></div>`;
        document.body.appendChild(overlay);
        const request_id = "req_" + Date.now() + "_" + Math.floor(Math.random()*10000);
        document.getElementById("adsCloseBtn").onclick = async function(){
          overlay.remove();
          try{
            var viewer_id = 'anon';
            try{
              if(window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initDataUnsafe && window.Telegram.WebApp.initDataUnsafe.user && window.Telegram.WebApp.initDataUnsafe.user.id){
                viewer_id = String(window.Telegram.WebApp.initDataUnsafe.user.id);
              } else if(localStorage.getItem('uid')){
                viewer_id = localStorage.getItem('uid');
              }
            }catch(e){}
            await fetch(BASE + '/api/publisher/view', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pcode: pcode, api_key: api_key, ad_id: ad.id, viewer_id: viewer_id })
            });
          }catch(e){}
          if(window.onAdsPublisherReward) window.onAdsPublisherReward({ ad_id: ad.id, reward: 0.005 });
          window.dispatchEvent(new CustomEvent('adsPublisherAd', { detail: ad }));
          resolve({ ok: true, ad: ad, request_id: request_id });
        };
      }catch(e){
        alert('Network error: ' + e.message);
        reject({ code: "FETCH_FAIL", message: e.message });
      }
    });
  };
  window.showAdsGalaxy = window.showAdsPublisher;
  console.log("Ads Publisher SDK loaded for", PCODE);
})();
