// ADS PUBLISHER SDK - ads.js
(function(){
  var script = document.currentScript;
  if(!script) script = document.querySelector('script[src*="ads.js"]');
  var PCODE = script ? script.getAttribute("data-pcode") : null;
  var API_KEY = script ? script.getAttribute("data-api-key") : null;
  var BASE = "https://ads-publisher.onrender.com";

  window.showAdsPublisher = function(){
    return new Promise(async function(resolve, reject){
      try{
        if(!PCODE || !API_KEY){
          return reject({ code: "NO_KEY", message: "Missing pcode or api_key in header script" });
        }
        const res = await fetch(`${BASE}/api/publisher/ads?pcode=${encodeURIComponent(PCODE)}&api_key=${encodeURIComponent(API_KEY)}`);
        const data = await res.json();
        const ads = Array.isArray(data) ? data : (data.ads || data.items || []);
        if(!ads.length) return reject({ code: "NO_ADS", message: "No ads available" });
        const ad = ads[0];
        // Build overlay
        const overlay = document.createElement("div");
        overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px";
        let mediaHtml = "";
        if(ad.media_url || ad.media_path){
          const raw = ad.media_url || ad.media_path;
          const url = raw.startsWith("http") ? raw : BASE + raw;
          mediaHtml = (ad.media_type && ad.media_type.includes("video")) ? `<video src="${url}" controls autoplay style="width:100%;border-radius:12px"></video>` : `<img src="${url}" style="width:100%;border-radius:12px">`;
        }
        overlay.innerHTML = `<div style="background:#fff;border-radius:16px;padding:16px;max-width:420px;width:100%">${mediaHtml}<h3 style="margin:12px 0 6px;font-family:Arial">${ad.title || "Sponsored"}</h3><p style="color:#475569;font-family:Arial;font-size:14px">${ad.description || ""}</p><a href="${ad.destination_url || "#"}" target="_blank" style="display:block;text-align:center;background:#2563eb;color:#fff;padding:12px;border-radius:10px;text-decoration:none;font-family:Arial;font-weight:700;margin:12px 0">Visit Advertiser</a><button id="adsCloseBtn" style="width:100%;padding:12px;border:0;border-radius:10px;background:#f1f5f9;font-weight:700;cursor:pointer">Close & Earn $0.005</button></div>`;
        document.body.appendChild(overlay);
        const request_id = "req_" + Date.now() + "_" + Math.floor(Math.random()*10000);
        document.getElementById("adsCloseBtn").onclick = function(){
          overlay.remove();
          resolve({ ok: true, ad: ad, request_id: request_id });
        };
      }catch(e){
        reject({ code: "FETCH_FAIL", message: e.message });
      }
    });
  };
  console.log("Ads Publisher SDK loaded for", PCODE);
})();
