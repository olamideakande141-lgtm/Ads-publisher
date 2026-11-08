require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const DB = require('./database');
const { User, Wallet, Deposit, Transaction, Advertisement, Campaign, Publication, Package, Setting, Publisher, PublisherView, PublisherClick, PublisherWithdrawal, nextId } = DB;
const { sendTelegram } = require('./bot');
const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({dest:'uploads/', limits:{fileSize:25*1024*1024}, fileFilter:(req,file,cb)=>{ cb(null, ['image/jpeg','image/png','image/jpg','image/webp','video/mp4'].includes(file.mimetype)); }});
async function safeSend(to,msg,media){ try{ if(!to) return null; return await sendTelegram(to,msg,media); }catch(e){ console.log('telegram fail',e.message); return null; } }
async function getSettings(){ const rows = await Setting.find(); const o={}; rows.forEach(r=> o[r.key]=r.value); return o; }
async function getSetting(key, def=''){ const s = await Setting.findOne({key}); return s ? s.value : def; }
async function addTx(user_id,type,amount,balance_after,ref_type,ref_id,note){ const id=await nextId('transactions'); return Transaction.create({id,user_id,type,amount,balance_after,ref_type,ref_id,note}); }

function verifyInitData(initData){
  if(!initData) return null;
  try{
    const p = new URLSearchParams(initData); const hash = p.get('hash'); p.delete('hash');
    const check = [...p.entries()].sort().map(([k,v])=>`${k}=${v}`).join('\n');
    const secret = crypto.createHmac('sha256','WebAppData').update(process.env.BOT_TOKEN||'').digest();
    const calc = crypto.createHmac('sha256',secret).update(check).digest('hex');
    if(calc!==hash) return null; return JSON.parse(p.get('user'));
  }catch{ return null; }
}
async function auth(req,res,next){
  let u=null;
  if(req.headers['x-telegram-initdata']) u=verifyInitData(req.headers['x-telegram-initdata']);
  if(!u && req.headers['x-telegram-user']){ try{ let raw=req.headers['x-telegram-user']; try{ raw=decodeURIComponent(raw); }catch{} u=JSON.parse(raw); }catch{} }
  if(!u) return res.status(401).json({error:'Open via Telegram Mini App'});
  let user = await User.findOne({telegram_id:String(u.id)});
  if(!user){ const id=await nextId('users'); user=await User.create({id, telegram_id:String(u.id), username:u.username||'', first_name:u.first_name||'', photo_url:u.photo_url||''}); await Wallet.create({user_id:id, available:0}); }
  req.user=user; next();
}
function adminAuth(req,res,next){ try{ req.admin=jwt.verify(req.headers.authorization?.split(' ')[1], process.env.JWT_SECRET||'secret'); next(); }catch{ return res.status(401).json({error:'Admin only'}); } }
function genApiKey(){ return 'AP-'+crypto.randomBytes(6).toString('hex').toUpperCase(); }

app.get('/api/health', (req,res)=> res.json({ok:true, db:'mongo', time:new Date().toISOString()}));
app.post('/api/admin/login',(req,res)=>{
  if(req.body.username===process.env.ADMIN_USERNAME && req.body.password===process.env.ADMIN_PASSWORD){
    return res.json({ok:true, token: jwt.sign({user:req.body.username,role:'admin'}, process.env.JWT_SECRET||'secret',{expiresIn:'12h'})});
  }
  res.status(401).json({error:'Wrong admin login'});
});

app.get('/api/me',auth, async(req,res)=>{
  try{
    const w = await Wallet.findOne({user_id:req.user.id});
    const ads = await Advertisement.find({user_id:req.user.id}).sort({id:-1}).limit(20);
    const txs = await Transaction.find({user_id:req.user.id}).sort({id:-1}).limit(30);
    const deps = await Deposit.find({user_id:req.user.id}).sort({id:-1}).limit(20);
    const pubs = await Publisher.find({user_id:req.user.id}).sort({id:-1});
    const withdrawals = await PublisherWithdrawal.find({user_id:req.user.id}).sort({id:-1}).limit(20);
    const active = await Advertisement.countDocuments({user_id:req.user.id, status:{$in:['Approved','Published','Scheduled']}});
    const pending = await Advertisement.countDocuments({user_id:req.user.id, status:'Awaiting Moderation'});
    let publisher_stats=[];
    if(pubs.length){
      const ids = pubs.map(p=>p.id);
      const views = await PublisherView.aggregate([{$match:{publisher_id:{$in:ids}}},{$group:{_id:'$ad_id', c:{$sum:1}}}]);
      const clicks = await PublisherClick.aggregate([{$match:{publisher_id:{$in:ids}}},{$group:{_id:'$ad_id', c:{$sum:1}}}]);
      const adMap={}; ads.forEach(a=> adMap[a.id]=a);
      const allIds = [...new Set([...views.map(v=>v._id), ...clicks.map(c=>c._id)])];
      for(const ad_id of allIds){
        const v = views.find(x=>x._id==ad_id)?.c||0; const cl = clicks.find(x=>x._id==ad_id)?.c||0;
        let ad = adMap[ad_id] || await Advertisement.findOne({id:ad_id}) || {};
        publisher_stats.push({ad_id, title: ad.title||('Ad #'+ad_id), views:v, impressions:v, clicks:cl, earned: Number((v*0.005).toFixed(3))});
      }
    }
    res.json({user:req.user,wallet:w,ads,txs,deposits:deps,publishers:pubs,withdrawals,publisher_stats,active,pending});
  }catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/packages', async(req,res)=>{ res.json(await Package.find({active:1}).sort({price:1})); });
app.get('/api/settings-public', async(req,res)=>{
  try{
    const o = await getSettings();
    res.json({USDT_TRC20:o.USDT_TRC20||process.env.USDT_TRC20_ADDRESS||'TH9wG8jmmwuwnpZ85MAtJgCRj64kbhKCzd',USDT_ERC20:o.USDT_ERC20||process.env.USDT_ERC20_ADDRESS||'0x2A57a12d46D4A7DE699473556bDc55caa99F0f0d',TRC20_ENABLED:o.TRC20_ENABLED,ERC20_ENABLED:o.ERC20_ENABLED,SUPPORT_USERNAME:o.SUPPORT_USERNAME,PUBLISHER_REWARD_PER_VIEW:o.PUBLISHER_REWARD_PER_VIEW||'0.005'});
  }catch(e){ res.json({USDT_TRC20:'TH9wG8jmmwuwnpZ85MAtJgCRj64kbhKCzd',USDT_ERC20:'0x2A57a12d46D4A7DE699473556bDc55caa99F0f0d',PUBLISHER_REWARD_PER_VIEW:'0.005'}); }
});
app.get('/ads.js',(req,res)=>{
  res.setHeader('Content-Type','application/javascript');
  res.send(`
(function(){
  var PCODE = document.currentScript ? document.currentScript.dataset.pcode : 'p1';
  var APIKEY = document.currentScript ? document.currentScript.dataset.apiKey : '';
  window._adsPublisherPcode = PCODE;
  window._adsPublisherKey = APIKEY;
  window.showAdsPublisher = function(){
    var pcode = window._adsPublisherPcode || 'p1';
    var api_key = window._adsPublisherKey || '';
    return fetch('https://ads-publisher.onrender.com/api/publisher/ads?pcode='+encodeURIComponent(pcode)+'&api_key='+encodeURIComponent(api_key))
      .then(r=>r.json()).then(function(j){
        if(!j || !j.length) { alert('No ads available now, try later'); throw {code:'NO_ADS'}; }
        var ad = j[0];
        var old = document.getElementById('adsPublisherOverlay');
        if(old) old.remove();
        var ov = document.createElement('div');
        ov.id = 'adsPublisherOverlay';
        ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px';
        ov.innerHTML = '<div style="background:white;border-radius:16px;padding:20px;width:100%;max-width:400px;text-align:center;color:#111">'
          + '<h3 style="font-weight:900;font-size:18px">'+(ad.title||'Sponsored Ad')+'</h3>'
          + '<p style="font-size:13px;color:#555;margin:10px 0">'+(ad.description||'')+'</p>'
          + (ad.media_path ? '<img src="https://ads-publisher.onrender.com'+ad.media_path+'" style="width:100%;border-radius:12px;max-height:220px;object-fit:cover"/>' : '')
          + '<a href="'+ad.destination_url+'" target="_blank" style="display:block;background:#FFD700;color:#000;padding:14px;border-radius:12px;font-weight:900;margin-top:14px;text-decoration:none">👉 VISIT AD</a>'
          + '<button id="adsPubClose" style="margin-top:10px;background:#eee;border:0;padding:10px 20px;border-radius:20px;font-weight:800">Close & Claim +$0.005</button>'
          + '<p style="font-size:11px;color:#999;margin-top:10px">Ads by Ads Publisher</p></div>';
        document.body.appendChild(ov);
        document.getElementById('adsPubClose').onclick = function(){
          ov.remove();
          fetch('https://ads-publisher.onrender.com/api/publisher/view',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pcode:pcode,api_key:api_key,ad_id:ad.id,viewer_id: window.Telegram?.WebApp?.initDataUnsafe?.user?.id || localStorage.getItem('uid') || 'anon'})}).catch(()=>{});
          if(window.onAdsPublisherReward) window.onAdsPublisherReward({ad_id:ad.id, reward:0.005});
          window.dispatchEvent(new CustomEvent('adsPublisherAd',{detail:ad}));
        };
        return {request_id:'req_'+Date.now(), ad:ad};
      });
  };
  window.showAdsGalaxy = window.showAdsPublisher;
})();
  `);
});

app.post('/api/deposit',auth,upload.single('proof'), async(req,res)=>{
  try{
    const {network,amount,tx_hash}=req.body;
    if(!['TRC20','ERC20'].includes(network)) return res.status(400).json({error:'Select TRC20 or ERC20'});
    const amt=parseFloat(amount); if(!amt||amt<=0) return res.status(400).json({error:'Enter valid amount'});
    const cleanTx = (tx_hash||'').trim() || ('PENDING-'+Date.now());
    if(!cleanTx.startsWith('PENDING-')){ const dup = await Deposit.findOne({tx_hash:cleanTx}); if(dup) return res.status(400).json({error:'Duplicate TX hash - already used'}); }
    const settings=await getSettings();
    const walletAddr= network==='TRC20' ? (settings.USDT_TRC20||process.env.USDT_TRC20_ADDRESS||'TH9wG8jmmwuwnpZ85MAtJgCRj64kbhKCzd') : (settings.USDT_ERC20||process.env.USDT_ERC20_ADDRESS||'0x2A57a12d46D4A7DE699473556bDc55caa99F0f0d');
    const id=await nextId('deposits');
    await Deposit.create({id,user_id:req.user.id,network,amount:amt,wallet_address:walletAddr,tx_hash:cleanTx,proof_path:req.file?.path||'',status:'Pending'});
    safeSend(process.env.ADMIN_TELEGRAM_ID, `🔔 NEW DEPOSIT #${id}\nUser @${req.user.username||''} (${req.user.telegram_id})\n${amt} USDT ${network}\nTX: ${cleanTx}`);
    res.json({ok:true,id,status:'Pending'});
  }catch(e){ console.log('DEPOSIT ERROR',e); res.status(500).json({error:'Deposit failed: '+e.message}); }
});

app.post('/api/advertisement',auth,upload.single('media'), async(req,res)=>{
  try{
    const {title,description,destination_url,category,placement,package_id,scheduled_at}=req.body;
    if(!title||!destination_url||!package_id) return res.status(400).json({error:'Fill title, URL, package'});
    try{ const u=new URL(destination_url); if(!['http:','https:'].includes(u.protocol)) throw new Error(); }catch{ return res.status(400).json({error:'Invalid URL'}); }
    const pkg=await Package.findOne({id:Number(package_id), active:1});
    if(!pkg) return res.status(400).json({error:'Invalid package'});
    const w=await Wallet.findOne({user_id:req.user.id});
    if(!w||w.available<pkg.price) return res.status(400).json({error:'Insufficient balance - deposit first. Need '+pkg.price});
    await Wallet.updateOne({user_id:req.user.id}, {$inc:{available:-pkg.price, total_spent:pkg.price}});
    const adId=await nextId('advertisements');
    await Advertisement.create({id:adId,user_id:req.user.id,title,description:description||'',media_path:req.file?.path||'',media_type:req.file?.mimetype||'',destination_url,category:category||'',placement:placement||pkg.placement,duration_days:pkg.duration_days,package_id:Number(package_id),price:pkg.price,status:'Awaiting Moderation',scheduled_at:scheduled_at||null});
    const w2=await Wallet.findOne({user_id:req.user.id});
    await addTx(req.user.id,'ad_payment',-pkg.price,w2.available,'advertisement',adId,`Paid ${pkg.name}`);
    safeSend(process.env.ADMIN_TELEGRAM_ID,`📢 NEW AD #${adId} FOR MODERATION\n${title} - ${placement} - $${pkg.price}`); safeSend(req.user.telegram_id,`📢 Ad Submitted #${adId}\nStatus: Awaiting Moderation`); res.json({ok:true,id:adId,status:'Awaiting Moderation'});
  }catch(e){ res.status(400).json({error:e.message}); }
});

app.get('/api/ads/published', async(req,res)=>{
  const ads = await Advertisement.find({status:'Published'}).sort({published_at:-1}).limit(30).lean();
  for(const a of ads){ const u=await User.findOne({id:a.user_id}); a.username=u?.username; }
  res.json(ads);
});
app.post('/api/ads/:id/click', async(req,res)=>{ try{ await Campaign.updateOne({ad_id:Number(req.params.id)}, {$inc:{clicks:1}}); }catch(e){} res.json({ok:true}); });

// === PUBLISHER ===
app.post('/api/publisher/register',auth, async(req,res)=>{
  try{
    const {bot_username, mini_app_url, bot_name}=req.body;
    if(!bot_username) return res.status(400).json({error:'Enter bot username e.g. @mybot'});
    const exists=await Publisher.findOne({bot_username}); if(exists) return res.status(400).json({error:'This bot already registered'});
    const id=await nextId('publishers');
    const api_key=genApiKey();
    await Publisher.create({id,user_id:req.user.id,bot_username,mini_app_url:mini_app_url||'',bot_name:bot_name||'',pcode:'TEMP',api_key,status:'Pending'});
    const pcode='p'+id;
    await Publisher.updateOne({id}, {pcode});
    safeSend(process.env.ADMIN_TELEGRAM_ID,`📢 NEW PUBLISHER #${id}\nBot: ${bot_username}\nPass Code: ${pcode}\nApprove in Admin Dashboard.`);
    res.json({ok:true, id, pcode, api_key, status:'Pending'});
  }catch(e){ res.status(500).json({error:e.message}); }
});
async function getPublisherAds(){
  const ads=await Advertisement.find({status:{$in:['Approved','Published']}}).sort({created_at:-1}).limit(5);
  return ads.map(ad=>({id:ad.id, title:ad.title, description:ad.description, media_path: ad.media_path ? '/'+ad.media_path : '', media_url: ad.media_path ? '/'+ad.media_path : '', media_type:ad.media_type, destination_url:ad.destination_url, category:ad.category}));
}
app.get('/api/publisher/ad', async(req,res)=>{
  const pcode=req.query.pcode; if(!pcode) return res.status(400).json({error:'Missing pcode e.g. ?pcode=p421'});
  const pub=await Publisher.findOne({pcode}); if(!pub) return res.status(404).json({error:'Invalid pass code'});
  if(pub.status!=='Approved') return res.status(403).json({error:'Publisher not approved yet - wait for admin approval'});
  const list=await getPublisherAds(); if(!list.length) return res.json({ok:false, error:'No ads available now'});
  res.json({ok:true, pcode, ad:list[0], ads:list});
});
app.get('/api/publisher/ads', async(req,res)=>{
  const pcode=req.query.pcode; const api_key=req.query.api_key;
  if(!pcode) return res.status(400).json({error:'Missing pcode'});
  const pub=await Publisher.findOne({pcode}); if(!pub) return res.status(404).json({error:'Invalid pass code'});
  if(api_key && pub.api_key!==api_key) return res.status(401).json({error:'Invalid API key'});
  if(pub.status!=='Approved') return res.status(403).json({error:'Publisher not approved yet'});
  res.json(await getPublisherAds());
});
async function doReward(req,res){
  try{
    const {pcode, ad_id, viewer_id, api_key}=req.body;
    if(!pcode||!ad_id) return res.status(400).json({error:'Missing pcode/ad_id'});
    const pub=await Publisher.findOne({pcode}); if(!pub||pub.status!=='Approved') return res.status(403).json({error:'Publisher not approved'});
    if(api_key && pub.api_key!==api_key) return res.status(401).json({error:'Invalid API key'});
    const reward=parseFloat(await getSetting('PUBLISHER_REWARD_PER_VIEW','0.005') || '0.005');
    const oneHourAgo = new Date(Date.now()-3600*1000);
    const recent=await PublisherView.findOne({pcode, ad_id:Number(ad_id), viewer_id:viewer_id||'anon', created_at:{$gt:oneHourAgo}});
    if(recent) return res.json({ok:true, rewarded:0, note:'Already rewarded recently'});
    const vid=await nextId('publisher_views');
    await PublisherView.create({id:vid,pcode,publisher_id:pub.id,ad_id:Number(ad_id),viewer_id:viewer_id||'anon',rewarded:reward});
    await Publisher.updateOne({id:pub.id}, {$inc:{total_views:1, total_impressions:1, total_earned:reward}});
    await Wallet.updateOne({user_id:pub.user_id}, {$inc:{available:reward, total_earned:reward}});
    const w=await Wallet.findOne({user_id:pub.user_id});
    await addTx(pub.user_id,'publisher_earn',reward,w.available,'publisher_view',pub.id,`Earned from ${pcode} ad ${ad_id}`);
    try{ await Campaign.updateOne({ad_id:Number(ad_id)}, {$inc:{views:1}}); }catch(e){}
    res.json({ok:true, rewarded:reward, pcode});
  }catch(e){ res.status(500).json({error:e.message}); }
}
app.post('/api/publisher/reward', doReward);
app.post('/api/publisher/view', (req,res)=>{ req.body.viewer_id = req.body.viewer_id || req.body.user_id || 'anon'; return doReward(req,res); });
app.post('/api/publisher/view2', doReward);
app.post('/api/publisher/click', async(req,res)=>{
  try{
    const {pcode, ad_id, viewer_id, api_key}=req.body;
    if(!pcode||!ad_id) return res.status(400).json({error:'Missing pcode/ad_id'});
    const pub=await Publisher.findOne({pcode}); if(!pub) return res.status(404).json({error:'Invalid pcode'});
    if(api_key && pub.api_key!==api_key) return res.status(401).json({error:'Invalid API key'});
    const cid=await nextId('publisher_clicks');
    await PublisherClick.create({id:cid,pcode,publisher_id:pub.id,ad_id:Number(ad_id),viewer_id:viewer_id||'anon'});
    await Publisher.updateOne({id:pub.id}, {$inc:{total_clicks:1}});
    try{ await Campaign.updateOne({ad_id:Number(ad_id)}, {$inc:{clicks:1}}); }catch(e){}
    const p2=await Publisher.findOne({id:pub.id});
    res.json({ok:true, clicks: p2.total_clicks});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/publisher/withdraw',auth, async(req,res)=>{
  try{
    const {publisher_id, amount, wallet_address, network}=req.body;
    const pub=await Publisher.findOne({id:Number(publisher_id), user_id:req.user.id});
    if(!pub) return res.status(404).json({error:'Publisher not found - register publisher first'});
    const amt=parseFloat(amount); if(!amt||amt<10) return res.status(400).json({error:'Min withdrawal is 10 USDT'});
    if(!wallet_address||wallet_address.length<10) return res.status(400).json({error:'Enter valid USDT wallet address'});
    const w=await Wallet.findOne({user_id:req.user.id}); if(!w||w.available<amt) return res.status(400).json({error:'Insufficient balance'});
    const fee = Number((amt*0.10).toFixed(2)); const net = Number((amt-fee).toFixed(2));
    await Wallet.updateOne({user_id:req.user.id}, {$inc:{available:-amt}});
    const wid=await nextId('publisher_withdrawals');
    await PublisherWithdrawal.create({id:wid,publisher_id:Number(publisher_id),user_id:req.user.id,amount:amt,fee,net_amount:net,wallet_address,network:network||'TRC20',status:'Pending'});
    const w2=await Wallet.findOne({user_id:req.user.id});
    await addTx(req.user.id,'publisher_withdraw',-amt,w2.available,'publisher_withdraw',Number(publisher_id),`Withdraw ${amt} USDT ${network||'TRC20'} Fee $${fee} Receive $${net} -> ${wallet_address}`);
    safeSend(process.env.ADMIN_TELEGRAM_ID, `🏧 NEW WITHDRAW\nUser @${req.user.username} Amount $${amt} Fee $${fee} Receive $${net} Network ${network} Wallet ${wallet_address}`);
    res.json({ok:true, fee, net_amount: net});
  }catch(e){ res.status(500).json({error:e.message}); }
});

// === ADMIN ===
app.get('/api/admin/stats',adminAuth, async(req,res)=>{
  try{
    const totalUsers=await User.countDocuments();
    const totalAdvertisers=(await Advertisement.distinct('user_id')).length;
    const totalPublishers=await Publisher.countDocuments();
    const pendingPublishers=await Publisher.countDocuments({status:'Pending'});
    const totalDeposits=await Deposit.countDocuments();
    const pendingDeposits=await Deposit.countDocuments({status:'Pending'});
    const confirmedDeposits=await Deposit.countDocuments({status:'Confirmed'});
    const revAgg=await Deposit.aggregate([{$match:{status:'Confirmed'}},{$group:{_id:null, s:{$sum:'$amount'}}}]);
    const totalRevenue=revAgg[0]?.s||0;
    const totalAds=await Advertisement.countDocuments();
    const pendingModeration=await Advertisement.countDocuments({status:'Awaiting Moderation'});
    const approved=await Advertisement.countDocuments({status:'Approved'});
    const published=await Advertisement.countDocuments({status:'Published'});
    const activeCampaigns=await Campaign.countDocuments({status:'Active'});
    const completed=await Advertisement.countDocuments({status:'Completed'});
    const pendingWithdrawals=await PublisherWithdrawal.countDocuments({status:'Pending'});
    res.json({totalUsers,totalAdvertisers,totalPublishers,pendingPublishers,totalDeposits,pendingDeposits,confirmedDeposits,totalRevenue,totalAds,pendingModeration,approved,published,activeCampaigns,completed,pendingWithdrawals});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.get('/api/admin/users',adminAuth, async(req,res)=>{
  const users=await User.find().sort({id:-1}).limit(100).lean();
  for(const u of users){ const w=await Wallet.findOne({user_id:u.id}); u.available=w?.available; u.total_deposited=w?.total_deposited; }
  res.json(users);
});
app.post('/api/admin/user/:id/suspend',adminAuth, async(req,res)=>{ await User.updateOne({id:Number(req.params.id)}, {status:'suspended'}); res.json({ok:true}); });
app.get('/api/admin/deposits',adminAuth, async(req,res)=>{
  const deps=await Deposit.find().sort({id:-1}).limit(100).lean();
  for(const d of deps){ const u=await User.findOne({id:d.user_id}); d.username=u?.username; d.telegram_id=u?.telegram_id; }
  res.json(deps);
});
app.post('/api/admin/deposit/:id/confirm',adminAuth, async(req,res)=>{
  try{
    const dep=await Deposit.findOne({id:Number(req.params.id)}); if(!dep||dep.status!=='Pending') return res.status(400).json({error:'Not pending'});
    await Deposit.updateOne({id:dep.id}, {status:'Confirmed', confirmed_at:new Date()});
    await Wallet.updateOne({user_id:dep.user_id}, {$inc:{available:dep.amount, total_deposited:dep.amount}});
    const w=await Wallet.findOne({user_id:dep.user_id});
    await addTx(dep.user_id,'deposit',dep.amount,w.available,'deposit',dep.id,`Confirmed ${dep.network} ${dep.tx_hash}`);
    const user=await User.findOne({id:dep.user_id});
    safeSend(user?.telegram_id,`✅ Deposit Confirmed\n+${dep.amount} USDT added to Advertising Wallet.`);
    res.json({ok:true});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/admin/deposit/:id/reject',adminAuth, async(req,res)=>{ await Deposit.updateOne({id:Number(req.params.id), status:'Pending'}, {status:'Rejected', admin_note:req.body.note||''}); res.json({ok:true}); });
app.get('/api/admin/ads',adminAuth, async(req,res)=>{
  const ads=await Advertisement.find().sort({id:-1}).limit(100).lean();
  for(const a of ads){ const u=await User.findOne({id:a.user_id}); a.username=u?.username; a.telegram_id=u?.telegram_id; }
  res.json(ads);
});
app.post('/api/admin/ad/:id/approve',adminAuth, async(req,res)=>{ await Advertisement.updateOne({id:Number(req.params.id)}, {status:'Approved', moderation_note:req.body.note||''}); const ad=await Advertisement.findOne({id:Number(req.params.id)}); const user=await User.findOne({id:ad.user_id}); safeSend(user?.telegram_id,`✅ Ad Approved #${ad.id}\n${ad.title}`); res.json({ok:true}); });
app.post('/api/admin/ad/:id/reject',adminAuth, async(req,res)=>{
  const ad=await Advertisement.findOne({id:Number(req.params.id)}); if(!ad) return res.status(404).json({error:'Not found'});
  await Advertisement.updateOne({id:ad.id}, {status:'Rejected', moderation_note:req.body.note||''});
  await Wallet.updateOne({user_id:ad.user_id}, {$inc:{available:ad.price, total_refunded:ad.price}});
  const w=await Wallet.findOne({user_id:ad.user_id});
  await addTx(ad.user_id,'refund',ad.price,w.available,'advertisement',ad.id,'Rejected - refunded');
  const user=await User.findOne({id:ad.user_id}); safeSend(user?.telegram_id,`❌ Ad Rejected #${ad.id}\nRefund ${ad.price} USDT returned.`); res.json({ok:true});
});
app.post('/api/admin/ad/:id/publish',adminAuth, async(req,res)=>{
  try{
    const ad=await Advertisement.findOne({id:Number(req.params.id)}); if(!ad||ad.status!=='Approved') return res.status(400).json({error:'Must be Approved first'});
    const channel=process.env.TELEGRAM_CHANNEL_USERNAME||'@yourchannel';
    const exists=await Publication.findOne({ad_id:ad.id, channel}); if(exists) return res.status(400).json({error:'Already published'});
    const msgId=await safeSend(channel,`📢 ${ad.title}\n\n${ad.description||''}\n\n👉 ${ad.destination_url}`,ad.media_path);
    const pid=await nextId('publications');
    await Publication.create({id:pid,ad_id:ad.id,channel,message_id:String(msgId||'')});
    await Advertisement.updateOne({id:ad.id}, {status:'Published', published_at:new Date()});
    try{ const cid=await nextId('campaigns'); await Campaign.updateOne({ad_id:ad.id}, {$setOnInsert:{id:cid, ad_id:ad.id, status:'Active'}}, {upsert:true}); }catch(e){}
    const user=await User.findOne({id:ad.user_id});
    safeSend(user?.telegram_id,`🚀 Ad Published #${ad.id}\nLive for channel + Mini App + Publisher Bots.`);
    res.json({ok:true,message_id:msgId});
  }catch(e){ res.status(500).json({error:e.message}); }
});
app.post('/api/admin/ad/:id/pause',adminAuth, async(req,res)=>{ try{ await Campaign.updateOne({ad_id:Number(req.params.id)}, {paused:1}); }catch(e){} res.json({ok:true}); });
app.post('/api/admin/ad/:id/resume',adminAuth, async(req,res)=>{ try{ await Campaign.updateOne({ad_id:Number(req.params.id)}, {paused:0}); }catch(e){} res.json({ok:true}); });
app.post('/api/admin/ad/:id/cancel',adminAuth, async(req,res)=>{ await Advertisement.updateOne({id:Number(req.params.id)}, {status:'Completed'}); try{ await Campaign.updateOne({ad_id:Number(req.params.id)}, {status:'Completed'}); }catch(e){} res.json({ok:true}); });
app.get('/api/admin/packages',adminAuth, async(req,res)=>{ res.json(await Package.find().sort({id:-1})); });
app.post('/api/admin/packages',adminAuth, async(req,res)=>{ const id=await nextId('packages'); await Package.create({id,name:req.body.name,placement:req.body.placement,price:req.body.price,duration_days:req.body.duration_days}); res.json({ok:true,id}); });
app.put('/api/admin/packages/:id',adminAuth, async(req,res)=>{ await Package.updateOne({id:Number(req.params.id)}, {name:req.body.name,placement:req.body.placement,price:req.body.price,duration_days:req.body.duration_days,active:req.body.active??1}); res.json({ok:true}); });
app.delete('/api/admin/packages/:id',adminAuth, async(req,res)=>{ await Package.deleteOne({id:Number(req.params.id)}); res.json({ok:true}); });
app.get('/api/admin/settings',adminAuth, async(req,res)=>{ res.json(await Setting.find()); });
app.post('/api/admin/settings',adminAuth, async(req,res)=>{ for(const [k,v] of Object.entries(req.body)) await Setting.updateOne({key:k}, {key:k, value:String(v)}, {upsert:true}); res.json({ok:true}); });
app.get('/api/admin/publications',adminAuth, async(req,res)=>{
  const pubs=await Publication.find().sort({id:-1}).limit(100).lean();
  for(const p of pubs){ const a=await Advertisement.findOne({id:p.ad_id}); p.title=a?.title; }
  res.json(pubs);
});
app.get('/api/admin/transactions',adminAuth, async(req,res)=>{
  const txs=await Transaction.find().sort({id:-1}).limit(100).lean();
  for(const t of txs){ const u=await User.findOne({id:t.user_id}); t.username=u?.username; }
  res.json(txs);
});
app.get('/api/admin/publishers',adminAuth, async(req,res)=>{
  const pubs=await Publisher.find().sort({id:-1}).lean();
  for(const p of pubs){ const u=await User.findOne({id:p.user_id}); p.username=u?.username; }
  res.json(pubs);
});
app.post('/api/admin/publisher/:id/approve',adminAuth, async(req,res)=>{
  await Publisher.updateOne({id:Number(req.params.id)}, {status:'Approved'});
  const pub=await Publisher.findOne({id:Number(req.params.id)}); const user=await User.findOne({id:pub.user_id});
  safeSend(user?.telegram_id,`✅ Publisher Approved\nBot: ${pub.bot_username}\nPass Code: ${pub.pcode}\nAPI Key: ${pub.api_key}\nOpen Publisher page to copy bot code.`);
  res.json({ok:true});
});
app.post('/api/admin/publisher/:id/reject',adminAuth, async(req,res)=>{ await Publisher.updateOne({id:Number(req.params.id)}, {status:'Rejected'}); res.json({ok:true}); });
app.post('/api/admin/publisher/:id/suspend',adminAuth, async(req,res)=>{ await Publisher.updateOne({id:Number(req.params.id)}, {status:'Suspended'}); res.json({ok:true}); });
app.get('/api/admin/withdrawals',adminAuth, async(req,res)=>{
  const ws=await PublisherWithdrawal.find().sort({id:-1}).limit(100).lean();
  for(const w of ws){ const u=await User.findOne({id:w.user_id}); w.username=u?.username; w.telegram_id=u?.telegram_id; const p=await Publisher.findOne({id:w.publisher_id}); w.bot_username=p?.bot_username; }
  res.json(ws);
});
app.post('/api/admin/withdrawal/:id/approve',adminAuth, async(req,res)=>{ const w=await PublisherWithdrawal.findOne({id:Number(req.params.id)}); if(!w||w.status!=='Pending') return res.status(400).json({error:'Not pending'}); await PublisherWithdrawal.updateOne({id:w.id}, {status:'Approved'}); const user=await User.findOne({id:w.user_id}); safeSend(user?.telegram_id,`✅ Withdrawal Approved #${w.id}\n$${w.amount} (Fee $${w.fee} Receive $${w.net_amount}) - Admin go send soon.`); res.json({ok:true}); });
app.post('/api/admin/withdrawal/:id/paid',adminAuth, async(req,res)=>{ await PublisherWithdrawal.updateOne({id:Number(req.params.id)}, {status:'Paid'}); const w=await PublisherWithdrawal.findOne({id:Number(req.params.id)}); const user=await User.findOne({id:w.user_id}); safeSend(user?.telegram_id,`💰 Withdrawal Paid #${w.id}\n$${w.net_amount} sent to ${w.wallet_address}`); res.json({ok:true}); });
app.post('/api/admin/withdrawal/:id/reject',adminAuth, async(req,res)=>{
  const w=await PublisherWithdrawal.findOne({id:Number(req.params.id)}); if(!w||w.status!=='Pending') return res.status(400).json({error:'Not pending'});
  await PublisherWithdrawal.updateOne({id:w.id}, {status:'Rejected'});
  await Wallet.updateOne({user_id:w.user_id}, {$inc:{available:w.amount}});
  const wal=await Wallet.findOne({user_id:w.user_id});
  await addTx(w.user_id,'withdraw_refund',w.amount,wal.available,'publisher_withdraw',w.id,'Withdrawal rejected - refunded');
  res.json({ok:true});
});
app.use((err,req,res,next)=>{ console.log('API ERROR',err.message); if(req.path.startsWith('/api')) return res.status(500).json({error:err.message}); next(err); });

// Bot - MUST NEVER crash server
try{
  const {bot}=require('./bot');
  if(process.env.BOT_TOKEN && process.env.BOT_TOKEN!=='PLACEHOLDER'){
    bot.launch().then(()=> console.log('Bot running')).catch(e=> console.log('Bot launch fail (server still running):', e.message));
  }
}catch(e){ console.log('Bot fail',e.message); }
process.on('unhandledRejection', (e)=> console.log('Unhandled (ignored):', e?.message||e));
process.on('uncaughtException', (e)=> console.log('Uncaught (ignored):', e?.message||e));

const PORT=process.env.PORT||3000;
app.listen(PORT,()=> console.log(`ADS PUBLISHER (Mongo FULL) running on ${PORT}`));
