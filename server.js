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
  res.send(`(function(){window.showAdsPublisher=function(){return fetch('/api/publisher/ads?pcode='+encodeURIComponent(document.currentScript?.dataset?.pcode||'' )).then(r=>r.json()).then(j=>{ if(j && j.length) { window.dispatchEvent(new CustomEvent('adsPublisherAd',{detail:j[0]})); return {request_id:'req_'+Date.now(), ad:j[0]}; } throw {code:'NO_ADS', message:'No ads available'}; });}; window.showAdsGalaxy=window.showAdsPublisher; })();`);
});

app.post('/api/deposit',auth,upload.single('proof'), async(req,res)=>{
  try{
    const {network,amount,tx_hash}=req.body;
    if(!['TRC20','ERC20'].includes(network)) return res.status(400).json({error:'Select TRC20 or ERC20'});
    const amt=parseFloat(amount); if(!amt||amt<=0) return res.status(400).json({error:'Enter valid amount'});
    const cleanTx = (tx_hash||'').trim() || ('PENDING-'+Date.now());
    if(!cleanTx.startsWith('PENDING-')){
      const dup = await Deposit.findOne({tx_hash:cleanTx}); if(dup) return res.status(400).json({error:'Duplicate TX hash - already used'});
    }
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

// Publisher routes + Admin routes go for Part 2 - paste this file first and test
app.get('/api/publisher/ads', async(req,res)=>{
  const pcode=req.query.pcode; const api_key=req.query.api_key;
  if(!pcode) return res.status(400).json({error:'Missing pcode'});
  const pub=await Publisher.findOne({pcode}); if(!pub) return res.status(404).json({error:'Invalid pass code'});
  if(api_key && pub.api_key!==api_key) return res.status(401).json({error:'Invalid API key'});
  if(pub.status!=='Approved') return res.status(403).json({error:'Publisher not approved yet'});
  const ads=await Advertisement.find({status:'Published'}).sort({created_at:-1}).limit(5);
  res.json(ads.map(ad=>({id:ad.id, title:ad.title, description:ad.description, media_path: ad.media_path ? '/'+ad.media_path : '', media_url: ad.media_path ? '/'+ad.media_path : '', media_type:ad.media_type, destination_url:ad.destination_url, category:ad.category})));
});

app.use((err,req,res,next)=>{ console.log('API ERROR',err.message); if(req.path.startsWith('/api')) return res.status(500).json({error:err.message}); next(err); });
try{ const {bot}=require('./bot'); if(process.env.BOT_TOKEN && process.env.BOT_TOKEN!=='PLACEHOLDER') bot.launch().then(()=> console.log('Bot running')); }catch(e){ console.log('Bot fail',e.message); }
const PORT=process.env.PORT||3000;
app.listen(PORT,()=> console.log(`ADS PUBLISHER (Mongo) running on ${PORT}`));
