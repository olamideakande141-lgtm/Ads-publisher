// ADS PUBLISHER SDK - ads.js - FULL FILE - TIMER + MANUAL CLOSE - public/ads.js
(function(){
  var script = document.currentScript;
  if(!script) script = document.querySelector('script[src*="ads.js"]');
  var PCODE = script ? script.getAttribute("data-pcode") : null;
  var API_KEY = script ? script.getAttribute("data-api-key") : null;
  var BASE = "https://ads-publisher.onrender.com";
  var AD_SECONDS = 15;

  window._adsPublisherPcode = PCODE;
  window._adsPublisherKey = API_KEY;

  window.showAdsPublisher = function(){
    return new Promise(async function(resolve, reject){
      try{
        var pcode = window._adsPublisherPcode || PCODE || 'p1';
        var api_key = window._adsPublisherKey || API_KEY || '';
        if(!pcode || !api_key){
          return reject({ code: "NO_KEY", message: "Missing pcode or api_key" });
        }
        const res = await fetch(`${BASE}/api/publisher/ads?pcode=${encodeURIComponent(pcode)}&api_key=${encodeURIComponent(api_key)}`);
        const data = await res.json();
        if(data && data.error){
          return reject({ code: "API_ERROR", message: data.error });
        }
        const ads = Array.isArray(data) ? data : (data.ads || data.items || []);
        if(!ads.length){
          return reject({ code: "NO_ADS", message: "No ads available" });
        }
        const ad = ads[0];
        var old = document.getElementById('adsPublisherOverlay');
        if(old) old.remove();

        // ===== PROFESSIONAL AD - NO AUTO CLOSE, NO EARN TEXT =====
        const overlay = document.createElement("div");
        overlay.id = "adsPublisherOverlay";
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px";

        let mediaHtml = "";
        if(ad.media_url || ad.media_path){
          const raw = ad.media_url || ad.media_path;
          const url = raw.startsWith("http") ? raw : BASE + raw;
          mediaHtml = (ad.media_type && ad.media_type.includes("video"))
            ? `<video src="${url}" autoplay muted playsinline loop style="width:100%;border-radius:12px;max-height:220px;object-fit:cover"></video>`
            : `<img src="${url}" onerror="this.style.display='none'" style="width:100%;border-radius:12px;max-height:220px;object-fit:cover">`;
        }

        overlay.innerHTML = `
          <div style="background:#fff;border-radius:16px;padding:16px;max-width:420px;width:100%;text-align:center;color:#111;font-family:Arial;position:relative">
            <button id="adsCloseX" disabled style="position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;border:0;background:#eee;color:#999;font-size:16px;font-weight:900;cursor:not-allowed;display:flex;align-items:center;justify-content:center">✕</button>
            <div style="display:flex;justify-content:space-between;align-items:center;padding-right:36px">
              <span style="background:#111;color:#fff;font-size:11px;padding:5px 10px;border-radius:20px;font-weight:700">Sponsored</span>
              <span id="adsTimerPill" style="background:#FFD700;color:#000;font-size:12px;padding:5px 12px;border-radius:20px;font-weight:900">Ad ends in ${AD_SECONDS}s</span>
            </div>
            <div style="background:#eee;height:6px;border-radius:10px;margin:12px 0;overflow:hidden">
              <div id="adsProgressBar" style="background:#FFD700;height:100%;width:0%;transition:width 1s linear"></div>
            </div>
            ${mediaHtml}
            <h3 style="margin:12px 0 6px;font-size:18px;font-weight:900">${ad.title || "Sponsored"}</h3>
            <p style="color:#475569;font-size:14px">${ad.description || ""}</p>
            <a href="${ad.destination_url || "#"}" target="_blank" style="display:block;text-align:center;background:#FFD700;color:#000;padding:14px;border-radius:10px;text-decoration:none;font-weight:900;margin:12px 0">👉 VISIT AD</a>
            <p style="font-size:11px;color:#999;margin-top:6px">Ads by Ads Publisher</p>
          </div>
        `;
        document.body.appendChild(overlay);

        var remaining = AD_SECONDS;
        var closeX = document.getElementById("adsCloseX");
        var timerPill = document.getElementById("adsTimerPill");
        var progressBar = document.getElementById("adsProgressBar");
        var canClose = false;

        async function closeAd(){
          if(!canClose) return; // block early close
          clearInterval(timer);
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
          // Reward still fires for bot owner for backend - viewer NO see amount
          if(window.onAdsPublisherReward) window.onAdsPublisherReward({ ad_id: ad.id, reward: 0.005 });
          window.dispatchEvent(new CustomEvent('adsPublisherAd', { detail: ad }));
          resolve({ ok: true, ad: ad, request_id: "req_" + Date.now() });
        }

        closeX.onclick = closeAd;

        // ===== TIMER - NO AUTO CLOSE =====
        var timer = setInterval(function(){
          remaining--;
          var elapsed = AD_SECONDS - remaining;
          var pct = Math.floor((elapsed / AD_SECONDS) * 100);
          if(progressBar) progressBar.style.width = pct + "%";
          if(remaining > 0){
            if(timerPill) timerPill.innerText = "Ad ends in " + remaining + "s";
          } else {
            clearInterval(timer);
            if(progressBar) progressBar.style.width = "100%";
            if(timerPill) timerPill.innerText = "You can close now";
            if(timerPill) timerPill.style.background = "#22c55e";
            if(timerPill) timerPill.style.color = "#fff";
            // Enable Close X - user go close by himself, ad NO go close alone
            canClose = true;
            if(closeX){
              closeX.disabled = false;
              closeX.style.background = "#111";
              closeX.style.color = "#fff";
              closeX.style.cursor = "pointer";
            }
          }
        }, 1000);

      }catch(e){
        reject({ code: "FETCH_FAIL", message: e.message });
      }
    });
  };
  window.showAdsGalaxy = window.showAdsPublisher;
  console.log("Ads Publisher SDK loaded for", PCODE);
})();
