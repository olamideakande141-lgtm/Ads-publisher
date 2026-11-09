/**
 * Ads Publisher - ads.js / sdk.js - UNIFIED PROFESSIONAL SDK
 * Works with BOTH embeds:
 *  1) <script src="https://ads-publisher.onrender.com/ads.js" data-pcode="p1" data-api-key="AP-XXXX"></script>
 *  2) <script src="https://ads-publisher.onrender.com/sdk.js?id=p421"></script>
 *  3) <script src="https://ads-publisher.onrender.com/sdk.js?id=p1&api_key=AP-XXXX"></script>
 * Then call: window.showAdsPublisher() OR window.showPublisherAd()
 * Mini Card: window.renderMiniAd('my-ad-slot')
 * Rules: Only approved + active + not expired. No demo. No fake views. View after 15s only, once per viewer per ad. No reward for just opening.
 */
(function(){
  'use strict';
  var scriptEl = document.currentScript || document.querySelector('script[src*="ads.js"], script[src*="sdk.js"]');
  var src = (scriptEl && scriptEl.src) || '';
  var qs = '';
  try{ qs = src.split('?')[1] || ''; }catch(e){}
  var params = new URLSearchParams(qs);
  var PCODE = (scriptEl && scriptEl.getAttribute('data-pcode')) || params.get('id') || params.get('pcode') || window.ADS_PUBLISHER_PCODE || 'p1';
  var API_KEY = (scriptEl && scriptEl.getAttribute('data-api-key')) || params.get('api_key') || params.get('apiKey') || '';
  var BASE = 'https://ads-publisher.onrender.com';
  try{
    if(src){
      var u = new URL(src);
      BASE = u.origin;
      // If served as /ads.js or /sdk.js, base is origin
      // If served as /something/ads.js, keep origin only
    }
  }catch(e){}
  window.ADS_PUBLISHER_PCODE = PCODE;

  var VIEW_SECONDS = 15;
  var _overlay = null, _timer = null, _canClose = false, _currentAd = null, _viewSent = false, _isShowing = false;

  function escapeHtml(s){ return String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }
  function resolveMedia(ad){
    var raw = ad.media_path || ad.media_url || ad.image || ad.image_url || ad.video || ad.video_url || ad.thumbnail || '';
    if(!raw) return '';
    if(raw.indexOf('http')===0) return raw;
    return BASE + (raw.charAt(0)==='/' ? raw : '/' + raw);
  }
  function isVideoUrl(url, ad){
    if(ad && ad.media_type==='video') return true;
    return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url||'') || (url||'').indexOf('video')!==-1;
  }
  function getViewerId(){
    try{
      var tg = window.Telegram && window.Telegram.WebApp;
      var tgUser = tg && tg.initDataUnsafe && tg.initDataUnsafe.user;
      if(tgUser && tgUser.id) return String(tgUser.id);
      var v = localStorage.getItem('ads_publisher_viewer');
      if(!v){ v='viewer_'+Math.random().toString(36).slice(2,10); localStorage.setItem('ads_publisher_viewer', v); }
      return v;
    }catch(e){ return 'viewer_anon'; }
  }
  function hasViewed(adId){ try{ return localStorage.getItem('ap_viewed_'+adId)==='1'; }catch(e){ return false; } }
  function markViewed(adId){ try{ localStorage.setItem('ap_viewed_'+adId,'1'); }catch(e){} }
  function genRequestId(){ return 'req_'+Date.now()+'_'+Math.random().toString(36).slice(2,8); }
  var _currentRequestId = null;

  function injectCSS(){
    if(document.getElementById('ap-ads-css')) return;
    var css = [
      '#ap-overlay{position:fixed;inset:0;background:rgba(0,0,0,.88);z-index:2147483647;display:none;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(2px)}',
      '#ap-overlay-inner{background:#fff;border-radius:20px;width:100%;max-width:420px;color:#0B0E1A;position:relative;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.45);max-height:92vh;overflow-y:auto;animation:apPop .25s ease}',
      '@keyframes apPop{0%{transform:scale(.92) translateY(12px);opacity:0}100%{transform:scale(1) translateY(0);opacity:1}}',
      '.ap-head{display:flex;justify-content:space-between;align-items:center;padding:14px 14px 0}',
      '.ap-pill-sponsored{background:#0B0E1A;color:#fff;font-size:11px;font-weight:800;padding:6px 12px;border-radius:20px;letter-spacing:.3px}',
      '.ap-pill-timer{background:#FFD700;color:#000;font-size:12px;font-weight:900;padding:6px 12px;border-radius:20px}',
      '.ap-pill-timer.done{background:#16A34A;color:#fff}',
      '.ap-close{width:32px;height:32px;border-radius:50%;border:0;background:#EDEDEF;color:#9CA3AF;font-size:16px;font-weight:900;cursor:not-allowed;line-height:1;margin-left:8px}',
      '.ap-close.enabled{background:#0B0E1A;color:#fff;cursor:pointer}',
      '.ap-progress{background:#EEE;height:6px;border-radius:10px;margin:12px 14px 0;overflow:hidden}',
      '.ap-progress-bar{background:linear-gradient(90deg,#FFD700,#FFB800);height:100%;width:0%;transition:width 1s linear}',
      '.ap-media{margin:14px 14px 0;border-radius:14px;overflow:hidden;background:#F3F4F6}',
      '.ap-media img,.ap-media video{width:100%;display:block;max-height:260px;object-fit:cover}',
      '.ap-body{padding:14px}',
      '.ap-brand{font-size:11px;font-weight:800;letter-spacing:1px;color:#6B7280;text-transform:uppercase}',
      '.ap-title{font-size:19px;font-weight:900;line-height:1.25;color:#0B0E1A;margin-top:4px}',
      '.ap-desc{font-size:13.5px;line-height:1.6;color:#4B5563;margin-top:8px}',
      '.ap-complete{background:#ECFDF5;border:1px solid #A7F3D0;color:#065F46;font-size:12px;font-weight:700;padding:10px 12px;border-radius:12px;margin:0 14px 12px;text-align:center;display:none}',
      '.ap-cta{display:block;background:linear-gradient(90deg,#FFD700,#FFB800);color:#000;padding:15px;border-radius:14px;font-weight:900;font-size:15px;text-align:center;text-decoration:none;margin:14px 14px 4px;box-shadow:0 6px 18px rgba(255,184,0,.35)}',
      '.ap-footer{text-align:center;font-size:11px;color:#9CA3AF;padding:0 14px 14px}',
      '.ap-mini{border:1px solid #E5E7EB;border-radius:16px;overflow:hidden;background:#fff;color:#0B0E1A;font-family:Inter,system-ui,sans-serif;max-width:100%}',
      '.ap-mini img,.ap-mini video{width:100%;display:block;max-height:180px;object-fit:cover}',
      '.ap-mini-body{padding:12px}',
      '.ap-mini-brand{font-size:10px;font-weight:800;letter-spacing:1px;color:#6B7280;text-transform:uppercase}',
      '.ap-mini-title{font-size:15px;font-weight:900;margin-top:4px;line-height:1.3}',
      '.ap-mini-desc{font-size:12.5px;color:#4B5563;margin-top:6px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
      '.ap-mini-cta{display:block;background:#FFD700;color:#000;text-align:center;padding:11px;border-radius:12px;font-weight:900;font-size:13px;text-decoration:none;margin-top:10px}',
      '.ap-mini-foot{font-size:10px;color:#9CA3AF;text-align:center;padding:0 12px 10px}'
    ].join('\n');
    var s=document.createElement('style'); s.id='ap-ads-css'; s.textContent=css; document.head.appendChild(s);
  }

  async function fetchAds(){
    // Try list endpoint first
    try{
      var url = BASE + '/api/publisher/ads?pcode=' + encodeURIComponent(PCODE) + (API_KEY ? '&api_key='+encodeURIComponent(API_KEY) : '');
      var res = await fetch(url);
      var txt = await res.text();
      var j; try{ j=JSON.parse(txt); }catch(e){}
      if(j && !j.error){
        var list = Array.isArray(j) ? j : (j.ads || j.data || []);
        if(list.length){
          return filterAds(list);
        }
      }
    }catch(e){}
    // Fallback: old single-ad endpoint /api/publisher/ad?pcode=
    try{
      var res2 = await fetch(BASE + '/api/publisher/ad?pcode=' + encodeURIComponent(PCODE));
      var data = await res2.json();
      if(data && data.ok && data.ad) return filterAds([data.ad]);
      if(data && data.error) throw new Error(data.error);
    }catch(e){ if(e.message && e.message!=='No ads available') throw e; }
    return [];
  }
  function filterAds(list){
    return (list||[]).filter(function(a){
      if(!a) return false;
      if(a.status && ['approved','active','Approved','Active','Published'].indexOf(a.status)===-1) return false;
      if(a.active===false) return false;
      if(a.is_active===false) return false;
      if(a.paused===true) return false;
      if(a.expires_at && new Date(a.expires_at) < new Date()) return false;
      if(a.expiresAt && new Date(a.expiresAt) < new Date()) return false;
      return true;
    });
  }
  async function trackEvent(endpoint, ad){
    try{
      await fetch(BASE + endpoint, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({pcode:PCODE, api_key:API_KEY, ad_id: ad.id, viewer_id: getViewerId(), user_id: getViewerId(), request_id: _currentRequestId || genRequestId(), event_id: _currentRequestId || genRequestId()})
      });
    }catch(e){}
  }

  function buildOverlay(){
    injectCSS();
    if(_overlay) return _overlay;
    _overlay=document.createElement('div');
    _overlay.id='ap-overlay';
    // Keep old id too for backward compat
    _overlay.innerHTML='<div id="ap-overlay-inner"></div>';
    document.body.appendChild(_overlay);
    _overlay.addEventListener('click', function(e){ if(e.target===_overlay && _canClose) closeAd(); });
    return _overlay;
  }
  // Alias overlay id for old code that looks for #ads-publisher-overlay
  function getInner(){
    var inner=document.getElementById('ap-overlay-inner');
    return inner;
  }

  function closeAd(){
    if(!_canClose) return;
    if(_timer) clearInterval(_timer);
    if(_overlay) _overlay.style.display='none';
    _isShowing=false;
    if(_currentAd && !_viewSent){
      _viewSent=true;
      trackEvent('/api/publisher/view', _currentAd);
    }
    if(window.onAdsPublisherComplete) window.onAdsPublisherComplete({ad:_currentAd, viewed:true, request_id:_currentRequestId, event_id:_currentRequestId});
    _currentAd=null;
  }
  window.closePublisherAd=closeAd;
  window.closeAdsPublisherAd=closeAd;

  async function showPublisherAd(){
    if(_isShowing) return {ok:false, msg:'Already showing'};
    injectCSS(); buildOverlay();
    var inner=getInner();
    _currentRequestId = genRequestId();
    try{
      var list = await fetchAds();
      if(!list.length){
        inner.innerHTML='<div style="padding:24px;text-align:center"><div class="ap-pill-sponsored" style="display:inline-block">Sponsored</div><h3 style="margin:14px 0 6px;font-size:18px">No sponsored ads available</h3><p style="color:#6B7280;font-size:13px;line-height:1.6">No approved advertiser ad is available right now.<br>Please try again later.</p><button onclick="window.closeAdsPublisherAd()" style="margin-top:16px;background:#0B0E1A;color:#fff;border:0;padding:12px 20px;border-radius:20px;font-weight:800">Close</button><p style="font-size:11px;color:#9CA3AF;margin-top:12px">Ads by Ads Publisher</p></div>';
        _overlay.style.display='flex'; _canClose=true; _isShowing=true;
        return {ok:false, msg:'No ads', request_id:_currentRequestId};
      }
      var ad = list[Math.floor(Date.now()/86400000) % list.length] || list[0];
      _currentAd=ad; _canClose=false; _viewSent=false; _isShowing=true;
      if(_timer) clearInterval(_timer);
      var mediaUrl=resolveMedia(ad);
      var mediaHtml='';
      if(mediaUrl){
        if(isVideoUrl(mediaUrl, ad)) mediaHtml='<div class="ap-media"><video src="'+escapeHtml(mediaUrl)+'" controls autoplay muted playsinline loop preload="metadata"></video></div>';
        else mediaHtml='<div class="ap-media"><img src="'+escapeHtml(mediaUrl)+'" alt="'+escapeHtml(ad.title||'Sponsored')+'" onerror="this.parentElement.style.display=\'none\'"/></div>';
      }
      var brand=ad.brand||ad.brand_name||ad.advertiser_name||ad.business_name||ad.advertiser||ad.company||'Sponsored';
      var title=ad.title||ad.headline||'Sponsored Ad';
      var desc=ad.description||ad.desc||ad.text||'';
      var dest=ad.destination_url||ad.destination||ad.link||ad.url||'#';
      inner.innerHTML=
        '<div class="ap-head"><span class="ap-pill-sponsored">Sponsored</span><span style="display:flex;align-items:center"><span id="apTimerPill" class="ap-pill-timer">Ad ends in '+VIEW_SECONDS+'s</span><button id="apCloseX" disabled class="ap-close">✕</button></span></div>'
        + '<div class="ap-progress"><div id="apProgressBar" class="ap-progress-bar"></div></div>'
        + mediaHtml
        + '<div class="ap-body"><div class="ap-brand">'+escapeHtml(brand)+'</div><div class="ap-title">'+escapeHtml(title)+'</div><div class="ap-desc">'+escapeHtml(desc)+'</div></div>'
        + '<div id="apCompleteBox" class="ap-complete">✅ Thanks for viewing this sponsored ad. You can close now.</div>'
        + '<a id="apVisitBtn" href="'+escapeHtml(dest)+'" target="_blank" rel="noopener">👉 VISIT AD</a>'
        + '<div class="ap-footer">Ads by Ads Publisher • '+escapeHtml(PCODE)+'</div>';
      _overlay.style.display='flex';
      var closeX=document.getElementById('apCloseX');
      if(closeX) closeX.onclick=function(){ closeAd(); };
      var visitBtn=document.getElementById('apVisitBtn');
      if(visitBtn) visitBtn.addEventListener('click', function(){ trackEvent('/api/publisher/click', ad); });
      var remaining=VIEW_SECONDS;
      var timerPill=document.getElementById('apTimerPill');
      var progressBar=document.getElementById('apProgressBar');
      var completeBox=document.getElementById('apCompleteBox');
      _timer=setInterval(function(){
        remaining--;
        var pct=Math.floor(((VIEW_SECONDS-remaining)/VIEW_SECONDS)*100);
        if(progressBar) progressBar.style.width=pct+'%';
        if(remaining>0){ if(timerPill) timerPill.textContent='Ad ends in '+remaining+'s'; }
        else {
          clearInterval(_timer);
          if(progressBar) progressBar.style.width='100%';
          if(timerPill){ timerPill.textContent='You can close now'; timerPill.classList.add('done'); }
          if(completeBox) completeBox.style.display='block';
          _canClose=true;
          if(closeX){ closeX.disabled=false; closeX.classList.add('enabled'); }
          if(!_viewSent && !hasViewed(ad.id)){
            _viewSent=true; markViewed(ad.id);
            trackEvent('/api/publisher/view', ad);
          }
        }
      },1000);
      return {ok:true, ad:ad, request_id:_currentRequestId, event_id:_currentRequestId};
    }catch(e){
      try{
        inner.innerHTML='<div style="padding:24px;text-align:center"><div class="ap-pill-sponsored" style="display:inline-block">Sponsored</div><h3 style="margin:14px 0 6px">No sponsored ads available</h3><p style="color:#6B7280;font-size:13px">'+escapeHtml(e.message||'No ads')+'</p><button onclick="window.closeAdsPublisherAd()" style="margin-top:16px;background:#0B0E1A;color:#fff;border:0;padding:12px 20px;border-radius:20px;font-weight:800">Close</button><p style="font-size:11px;color:#9CA3AF;margin-top:12px">Ads by Ads Publisher</p></div>';
        _overlay.style.display='flex'; _canClose=true; _isShowing=true;
      }catch(_){}
      return {ok:false, msg:e.message, request_id:_currentRequestId};
    }
  }

  async function renderMiniAd(containerId){
    injectCSS();
    var container=document.getElementById(containerId);
    if(!container) return {ok:false, msg:'Container not found: '+containerId};
    container.innerHTML='<div style="padding:16px;text-align:center;color:#6B7280;font-size:13px">Loading sponsored ad...</div>';
    try{
      var list=await fetchAds();
      if(!list.length){ container.innerHTML='<div style="padding:16px;text-align:center;color:#9CA3AF;font-size:12px">No sponsored ads available<br><span>Ads by Ads Publisher</span></div>'; return {ok:false, msg:'No ads'}; }
      var ad=list[0];
      var mediaUrl=resolveMedia(ad);
      var mediaHtml='';
      if(mediaUrl){
        if(isVideoUrl(mediaUrl, ad)) mediaHtml='<video src="'+escapeHtml(mediaUrl)+'" controls muted playsinline preload="metadata"></video>';
        else mediaHtml='<img src="'+escapeHtml(mediaUrl)+'" alt="'+escapeHtml(ad.title||'Sponsored')+'" onerror="this.style.display=\'none\'"/>';
      }
      var brand=ad.brand||ad.brand_name||ad.advertiser_name||ad.business_name||ad.advertiser||'Sponsored';
      var title=ad.title||ad.headline||'Sponsored Ad';
      var desc=ad.description||ad.desc||ad.text||'';
      var dest=ad.destination_url||ad.destination||ad.link||ad.url||'#';
      container.innerHTML='<div class="ap-mini"><div style="display:flex;justify-content:space-between;padding:10px 12px 0"><span style="background:#0B0E1A;color:#fff;font-size:10px;padding:4px 10px;border-radius:20px;font-weight:800">Sponsored</span><span style="font-size:10px;color:#9CA3AF">Ad</span></div>'+mediaHtml+'<div class="ap-mini-body"><div class="ap-mini-brand">'+escapeHtml(brand)+'</div><div class="ap-mini-title">'+escapeHtml(title)+'</div><div class="ap-mini-desc">'+escapeHtml(desc)+'</div><a class="ap-mini-cta" href="'+escapeHtml(dest)+'" target="_blank" rel="noopener">👉 VISIT AD</a></div><div class="ap-mini-foot">Ads by Ads Publisher</div></div>';
      var cta=container.querySelector('.ap-mini-cta');
      if(cta) cta.addEventListener('click', function(){ trackEvent('/api/publisher/click', ad); });
      return {ok:true, ad:ad};
    }catch(e){ container.innerHTML='<div style="padding:16px;text-align:center;color:#9CA3AF;font-size:12px">Failed to load ad</div>'; return {ok:false, msg:e.message}; }
  }

  window.showAdsPublisher=showPublisherAd;
  window.showPublisherAd=showPublisherAd;
  window.showAdsPublisherAd=showPublisherAd;
  window.onAdsPublisherReward=function(){ /* Disabled: no viewer reward */ };
  window.renderMiniAd=renderMiniAd;
  window.renderAdsPublisherMiniAd=renderMiniAd;
  console.log('ADS PUBLISHER SDK loaded for', PCODE, 'via', src);
})();
