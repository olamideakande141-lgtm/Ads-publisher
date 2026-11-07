require('dotenv').config();
const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const db = require('./database');
const { sendTelegram } = require('./bot');
const app = express();
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
if(!fs.existsSync('uploads')) fs.mkdirSync('uploads');
const upload = multer({dest:'uploads/', limits:{fileSize:25*1024*1024}, fileFilter:(req,file,cb)=>{ cb(null, ['image/jpeg','image/png','image/jpg','image/webp','video/mp4'].includes(file.mimetype)); }});

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
function auth(req,res,next){
  let u=null;
  if(req.headers['x-telegram-initdata']) u=verifyInitData(req.headers['x-telegram-initdata']);
  if(!u && req.headers['x-telegram-user']){ try{ u=JSON.parse(req.headers['x-telegram-user']); }catch{} }
  if(!u) return res.status(401).json({error:'Open via Telegram Mini App'});
  let user = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(u.id));
  if(!user){ const info=db.prepare('INSERT INTO users(telegram_id,username,first_name,photo_url) VALUES(?,?,?,?)').run(String(u.id),u.username||'',u.first_name||'',u.photo_url||''); db.prepare('INSERT INTO wallets(user_id) VALUES(?)').run(info.lastInsertRowid); user=db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid); }
  req.user=user; next();
}
function adminAuth(req,res,next){ try{ req.admin=jwt.verify(req.headers.authorization?.split(' ')[1], process.env.JWT_SECRET||'secret'); next(); }catch{ return res.status(401).json({error:'Admin only'}); } }
function genApiKey(){ return 'AP-'+crypto.randomBytes(6).toString('hex').toUpperCase(); }

// ADMIN LOGIN
app.post('/api/admin/login',(req,res)=>{
  if(req.body.username===process.env.ADMIN_USERNAME && req.body.password===process.env.ADMIN_PASSWORD){
    return res.json({ok:true, token: jwt.sign({user:req.body.username,role:'admin'}, process.env.JWT_SECRET||'secret',{expiresIn:'12h'})});
  }
  res.status(401).json({error:'Wrong admin login'});
});
// ME
app.get('/api/me',auth,(req,res)=>{
  const w=db.prepare('SELECT * FROM wallets WHERE user_id=?').get(req.user.id);
  const ads=db.prepare('SELECT * FROM advertisements WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.user.id);
  const txs=db.prepare('SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 30').all(req.user.id);
  const deps=db.prepare('SELECT * FROM deposits WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.user.id);
  const pubs=db.prepare('SELECT * FROM publishers WHERE user_id=? ORDER BY id DESC').all(req.user.id);
  const active=db.prepare("SELECT COUNT(*) c FROM advertisements WHERE user_id=? AND status IN ('Approved','Published','Scheduled')").get(req.user.id).c;
  const pending=db.prepare("SELECT COUNT(*) c FROM advertisements WHERE user_id=? AND status='Awaiting Moderation'").get(req.user.id).c;
  res.json({user:req.user,wallet:w,ads,txs,deposits:deps,publishers:pubs,active,pending});
});
app.get('/api/packages',(req,res)=>{ res.json(db.prepare('SELECT * FROM packages WHERE active=1 ORDER BY price ASC').all()); });
app.get('/api/settings-public',(req,res)=>{
  const rows=db.prepare('SELECT key,value FROM settings').all(); const o={}; rows.forEach(r=> o[r.key]=r.value);
  res.json({USDT_TRC20:o.USDT_TRC20||process.env.USDT_TRC20_ADDRESS||'',USDT_ERC20:o.USDT_ERC20||process.env.USDT_ERC20_ADDRESS||'',TRC20_ENABLED:o.TRC20_ENABLED,ERC20_ENABLED:o.ERC20_ENABLED,SUPPORT_USERNAME:o.SUPPORT_USERNAME,PUBLISHER_REWARD_PER_VIEW:o.PUBLISHER_REWARD_PER_VIEW||'0.005'});
});
// DEPOSIT
app.post('/api/deposit',auth,upload.single('proof'),(req,res)=>{
  const {network,amount,tx_hash}=req.body;
  if(!['TRC20','ERC20'].includes(network)) return res.status(400).json({error:'Select TRC20 or ERC20'});
  const amt=parseFloat(amount); if(!amt||amt<=0) return res.status(400).json({error:'Enter valid amount'});
  if(!tx_hash||tx_hash.length<10) return res.status(400).json({error:'Enter valid TX hash'});
  if(db.prepare('SELECT id FROM deposits WHERE tx_hash=?').get(tx_hash.trim())) return res.status(400).json({error:'Duplicate TX hash - already used'});
  const settings=Object.fromEntries(db.prepare('SELECT key,value FROM settings').all().map(r=>[r.key,r.value]));
  const walletAddr= network==='TRC20' ? (settings.USDT_TRC20||process.env.USDT_TRC20_ADDRESS||'') : (settings.USDT_ERC20||process.env.USDT_ERC20_ADDRESS||'');
  if(!walletAddr) return res.status(400).json({error:'Admin wallet not configured yet'});
  const info=db.prepare('INSERT INTO deposits(user_id,network,amount,wallet_address,tx_hash,proof_path,status) VALUES(?,?,?,?,?,?,?)').run(req.user.id,network,amt,walletAddr,tx_hash.trim(),req.file?.path||'','Pending');
  sendTelegram(process.env.ADMIN_TELEGRAM_ID, `🔔 NEW DEPOSIT #${info.lastInsertRowid}\nUser @${req.user.username||''} (${req.user.telegram_id})\n${amt} USDT ${network}\nTX: ${tx_hash}`);
  res.json({ok:true,id:info.lastInsertRowid});
});
// CREATE AD
app.post('/api/advertisement',auth,upload.single('media'),(req,res)=>{
  const {title,description,destination_url,category,placement,package_id,scheduled_at}=req.body;
  if(!title||!destination_url||!package_id) return res.status(400).json({error:'Fill title, URL, package'});
  try{ const u=new URL(destination_url); if(!['http:','https:'].includes(u.protocol)) throw new Error(); }catch{ return res.status(400).json({error:'Invalid URL'}); }
  const pkg=db.prepare('SELECT * FROM packages WHERE id=? AND active=1').get(package_id);
  if(!pkg) return res.status(400).json({error:'Invalid package'});
  const trx=db.transaction(()=>{
    const w=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(req.user.id);
    if(!w||w.available<pkg.price) throw new Error('Insufficient balance - deposit first. Need '+pkg.price);
    db.prepare('UPDATE wallets SET available=available-?, total_spent=total_spent+? WHERE user_id=?').run(pkg.price,pkg.price,req.user.id);
    const ad=db.prepare('INSERT INTO advertisements(user_id,title,description,media_path,media_type,destination_url,category,placement,duration_days,package_id,price,status,scheduled_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(req.user.id,title,description||'',req.file?.path||'',req.file?.mimetype||'',destination_url,category||'',placement||pkg.placement,pkg.duration_days,package_id,pkg.price,'Awaiting Moderation',scheduled_at||null);
    const w2=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(req.user.id);
    db.prepare('INSERT INTO transactions(user_id,type,amount,balance_after,ref_type,ref_id,note) VALUES(?,?,?,?,?,?,?)').run(req.user.id,'ad_payment',-pkg.price,w2.available,'advertisement',ad.lastInsertRowid,`Paid ${pkg.name}`);
    return ad.lastInsertRowid;
  });
  try{ const id=trx(); sendTelegram(process.env.ADMIN_TELEGRAM_ID,`📢 NEW AD #${id} FOR MODERATION\n${title} - ${placement} - $${pkg.price}`); sendTelegram(req.user.telegram_id,`📢 Ad Submitted #${id}\nStatus: Awaiting Moderation`); res.json({ok:true,id}); }catch(e){ res.status(400).json({error:e.message}); }
});
// PUBLIC PUBLISHED ADS
app.get('/api/ads/published',(req,res)=>{ res.json(db.prepare("SELECT a.*, u.username FROM advertisements a LEFT JOIN users u ON u.id=a.user_id WHERE a.status='Published' ORDER BY a.published_at DESC LIMIT 30").all()); });
app.post('/api/ads/:id/click',(req,res)=>{ try{ db.prepare('UPDATE campaigns SET clicks=clicks+1 WHERE ad_id=?').run(req.params.id); }catch(e){} res.json({ok:true}); });

// ========== PUBLISHER - PASS CODE SYSTEM ==========
app.post('/api/publisher/register',auth,(req,res)=>{
  const {bot_username, mini_app_url, bot_name}=req.body;
  if(!bot_username) return res.status(400).json({error:'Enter bot username e.g. @mybot'});
  const exists=db.prepare('SELECT id FROM publishers WHERE bot_username=?').get(bot_username);
  if(exists) return res.status(400).json({error:'This bot already registered'});
  const info=db.prepare('INSERT INTO publishers(user_id,bot_username,mini_app_url,bot_name,pcode,api_key,status) VALUES(?,?,?,?,?,?,?)').run(req.user.id,bot_username,mini_app_url||'',bot_name||'','TEMP',genApiKey(),'Pending');
  const pcode='p'+info.lastInsertRowid;
  db.prepare('UPDATE publishers SET pcode=? WHERE id=?').run(pcode, info.lastInsertRowid);
  sendTelegram(process.env.ADMIN_TELEGRAM_ID,`📢 NEW PUBLISHER #${info.lastInsertRowid}\nBot: ${bot_username}\nPass Code: ${pcode}\nApprove in Admin Dashboard.`);
  res.json({ok:true, id:info.lastInsertRowid, pcode, api_key: db.prepare('SELECT api_key FROM publishers WHERE id=?').get(info.lastInsertRowid).api_key, status:'Pending'});
});
app.get('/api/publisher/ad', (req,res)=>{
  const pcode=req.query.pcode;
  if(!pcode) return res.status(400).json({error:'Missing pcode e.g. ?pcode=p421'});
  const pub=db.prepare('SELECT * FROM publishers WHERE pcode=?').get(pcode);
  if(!pub) return res.status(404).json({error:'Invalid pass code'});
  if(pub.status!=='Approved') return res.status(403).json({error:'Publisher not approved yet - wait for admin approval'});
  const ad=db.prepare(`SELECT a.* FROM advertisements a WHERE a.status='Published' ORDER BY RANDOM() LIMIT 1`).get();
  if(!ad) return res.json({ok:false, error:'No ads available now'});
  res.json({ok:true, pcode, ad:{id:ad.id, title:ad.title, description:ad.description, media_path: ad.media_path ? '/'+ad.media_path : '', media_type:ad.media_type, destination_url:ad.destination_url, category:ad.category}});
});
app.post('/api/publisher/reward', (req,res)=>{
  const {pcode, ad_id, viewer_id, api_key}=req.body;
  if(!pcode||!ad_id) return res.status(400).json({error:'Missing pcode/ad_id'});
  const pub=db.prepare('SELECT * FROM publishers WHERE pcode=?').get(pcode);
  if(!pub||pub.status!=='Approved') return res.status(403).json({error:'Publisher not approved'});
  if(api_key && pub.api_key!==api_key) return res.status(401).json({error:'Invalid API key'});
  const reward=parseFloat(db.prepare("SELECT value FROM settings WHERE key='PUBLISHER_REWARD_PER_VIEW'").get()?.value || process.env.PUBLISHER_REWARD_PER_VIEW || '0.005');
  const recent=db.prepare("SELECT id FROM publisher_views WHERE pcode=? AND ad_id=? AND viewer_id=? AND created_at > datetime('now','-1 hour')").get(pcode,ad_id,viewer_id||'anon');
  if(recent) return res.status(400).json({error:'Already rewarded for this ad recently'});
  const trx=db.transaction(()=>{
    db.prepare('INSERT INTO publisher_views(pcode,publisher_id,ad_id,viewer_id,rewarded) VALUES(?,?,?,?,?)').run(pcode,pub.id,ad_id,viewer_id||'anon',reward);
    db.prepare('UPDATE publishers SET total_views=total_views+1, total_earned=total_earned+? WHERE id=?').run(reward,pub.id);
    db.prepare('UPDATE wallets SET available=available+?, total_earned=total_earned+? WHERE user_id=?').run(reward,reward,pub.user_id);
    const w=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(pub.user_id);
    db.prepare('INSERT INTO transactions(user_id,type,amount,balance_after,ref_type,ref_id,note) VALUES(?,?,?,?,?,?,?)').run(pub.user_id,'publisher_earn',reward,w.available,'publisher_view',pub.id,`Earned from ${pcode} ad ${ad_id}`);
    try{ db.prepare('UPDATE campaigns SET views=views+1 WHERE ad_id=?').run(ad_id); }catch(e){}
  });
  trx();
  res.json({ok:true, rewarded:reward, pcode});
});
app.post('/api/publisher/withdraw',auth,(req,res)=>{
  const {publisher_id, amount, wallet_address, network}=req.body;
  const pub=db.prepare('SELECT * FROM publishers WHERE id=? AND user_id=?').get(publisher_id, req.user.id);
  if(!pub) return res.status(404).json({error:'Publisher not found'});
  const amt=parseFloat(amount); if(!amt||amt<1) return res.status(400).json({error:'Min withdrawal $1'});
  const w=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(req.user.id);
  if(!w||w.available<amt) return res.status(400).json({error:'Insufficient balance'});
  const trx=db.transaction(()=>{
    db.prepare('UPDATE wallets SET available=available-? WHERE user_id=?').run(amt, req.user.id);
    db.prepare('INSERT INTO publisher_withdrawals(publisher_id,user_id,amount,wallet_address,network,status) VALUES(?,?,?,?,?,?)').run(publisher_id,req.user.id,amt,wallet_address||'',network||'TRC20','Pending');
    const w2=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(req.user.id);
    db.prepare('INSERT INTO transactions(user_id,type,amount,balance_after,ref_type,ref_id,note) VALUES(?,?,?,?,?,?,?)').run(req.user.id,'publisher_withdraw',-amt,w2.available,'publisher_withdraw',publisher_id,'Publisher withdrawal pending');
  });
  trx(); res.json({ok:true});
});

// ========== ADMIN - FIXED: NEVER CRASH, NEVER RETURN HTML ==========
app.get('/api/admin/stats',adminAuth,(req,res)=>{
  try{
    const q=(sql)=>{ try{ const r=db.prepare(sql).get(); return r ? (r.c ?? r.s ?? 0) : 0; }catch(e){ console.log('stats q fail',sql,e.message); return 0; } };
    res.json({
      totalUsers:q('SELECT COUNT(*) c FROM users'),
      totalAdvertisers:q("SELECT COUNT(DISTINCT user_id) c FROM advertisements"),
      totalPublishers:q('SELECT COUNT(*) c FROM publishers'),
      pendingPublishers:q("SELECT COUNT(*) c FROM publishers WHERE status='Pending'"),
      totalDeposits:q('SELECT COUNT(*) c FROM deposits'),
      pendingDeposits:q("SELECT COUNT(*) c FROM deposits WHERE status='Pending'"),
      confirmedDeposits:q("SELECT COUNT(*) c FROM deposits WHERE status='Confirmed'"),
      totalRevenue:q('SELECT COALESCE(SUM(amount),0) s FROM deposits WHERE status="Confirmed"'),
      totalAds:q('SELECT COUNT(*) c FROM advertisements'),
      pendingModeration:q("SELECT COUNT(*) c FROM advertisements WHERE status='Awaiting Moderation'"),
      approved:q("SELECT COUNT(*) c FROM advertisements WHERE status='Approved'"),
      published:q("SELECT COUNT(*) c FROM advertisements WHERE status='Published'"),
      activeCampaigns:q("SELECT COUNT(*) c FROM campaigns WHERE status='Active'"),
      completed:q("SELECT COUNT(*) c FROM advertisements WHERE status='Completed'")
    });
  }catch(e){ console.log('admin stats error',e.message); res.status(500).json({error:e.message}); }
});
app.get('/api/admin/users',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT u.*, w.available, w.total_deposited FROM users u LEFT JOIN wallets w ON w.user_id=u.id ORDER BY u.id DESC LIMIT 100').all()); });
app.post('/api/admin/user/:id/suspend',adminAuth,(req,res)=>{ db.prepare("UPDATE users SET status='suspended' WHERE id=?").run(req.params.id); res.json({ok:true}); });
app.get('/api/admin/deposits',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT d.*, u.username, u.telegram_id FROM deposits d LEFT JOIN users u ON u.id=d.user_id ORDER BY d.id DESC LIMIT 100').all()); });
app.post('/api/admin/deposit/:id/confirm',adminAuth,(req,res)=>{
  const dep=db.prepare('SELECT * FROM deposits WHERE id=?').get(req.params.id);
  if(!dep||dep.status!=='Pending') return res.status(400).json({error:'Not pending'});
  const trx=db.transaction(()=>{
    db.prepare("UPDATE deposits SET status='Confirmed', confirmed_at=CURRENT_TIMESTAMP WHERE id=?").run(dep.id);
    db.prepare("UPDATE wallets SET available=available+?, total_deposited=total_deposited+? WHERE user_id=?").run(dep.amount,dep.amount,dep.user_id);
    const w=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(dep.user_id);
    db.prepare('INSERT INTO transactions(user_id,type,amount,balance_after,ref_type,ref_id,note) VALUES(?,?,?,?,?,?,?)').run(dep.user_id,'deposit',dep.amount,w.available,'deposit',dep.id,`Confirmed ${dep.network} ${dep.tx_hash}`);
    try{ db.prepare('INSERT INTO audit_logs(actor,action,details) VALUES(?,?,?)').run('admin','confirm_deposit',`deposit ${dep.id} user ${dep.user_id} ${dep.amount}`); }catch(e){}
  });
  trx();
  const user=db.prepare('SELECT telegram_id FROM users WHERE id=?').get(dep.user_id);
  sendTelegram(user?.telegram_id,`✅ Deposit Confirmed\n+${dep.amount} USDT added to Advertising Wallet.`);
  res.json({ok:true});
});
app.post('/api/admin/deposit/:id/reject',adminAuth,(req,res)=>{ db.prepare("UPDATE deposits SET status='Rejected', admin_note=? WHERE id=? AND status='Pending'").run(req.body.note||'',req.params.id); res.json({ok:true}); });
app.get('/api/admin/ads',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT a.*, u.username, u.telegram_id FROM advertisements a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100').all()); });
app.post('/api/admin/ad/:id/approve',adminAuth,(req,res)=>{
  db.prepare("UPDATE advertisements SET status='Approved', moderation_note=? WHERE id=?").run(req.body.note||'',req.params.id);
  const ad=db.prepare('SELECT * FROM advertisements WHERE id=?').get(req.params.id);
  const user=db.prepare('SELECT telegram_id FROM users WHERE id=?').get(ad.user_id);
  sendTelegram(user?.telegram_id,`✅ Ad Approved #${ad.id}\n${ad.title}`);
  res.json({ok:true});
});
app.post('/api/admin/ad/:id/reject',adminAuth,(req,res)=>{
  const ad=db.prepare('SELECT * FROM advertisements WHERE id=?').get(req.params.id);
  if(!ad) return res.status(404).json({error:'Not found'});
  const trx=db.transaction(()=>{
    db.prepare("UPDATE advertisements SET status='Rejected', moderation_note=? WHERE id=?").run(req.body.note||'',ad.id);
    db.prepare("UPDATE wallets SET available=available+?, total_refunded=total_refunded+? WHERE user_id=?").run(ad.price,ad.price,ad.user_id);
    const w=db.prepare('SELECT available FROM wallets WHERE user_id=?').get(ad.user_id);
    db.prepare('INSERT INTO transactions(user_id,type,amount,balance_after,ref_type,ref_id,note) VALUES(?,?,?,?,?,?,?)').run(ad.user_id,'refund',ad.price,w.available,'advertisement',ad.id,'Rejected - refunded');
  });
  trx();
  const user=db.prepare('SELECT telegram_id FROM users WHERE id=?').get(ad.user_id);
  sendTelegram(user?.telegram_id,`❌ Ad Rejected #${ad.id}\nRefund ${ad.price} USDT returned.`);
  res.json({ok:true});
});
app.post('/api/admin/ad/:id/publish',adminAuth,async(req,res)=>{
  const ad=db.prepare('SELECT * FROM advertisements WHERE id=?').get(req.params.id);
  if(!ad||ad.status!=='Approved') return res.status(400).json({error:'Must be Approved first'});
  const channel=process.env.TELEGRAM_CHANNEL_USERNAME||'@yourchannel';
  if(db.prepare('SELECT id FROM publications WHERE ad_id=? AND channel=?').get(ad.id,channel)) return res.status(400).json({error:'Already published'});
  const msgId=await sendTelegram(channel,`📢 ${ad.title}\n\n${ad.description||''}\n\n👉 ${ad.destination_url}`,ad.media_path);
  db.prepare('INSERT INTO publications(ad_id,channel,message_id) VALUES(?,?,?)').run(ad.id,channel,msgId||'');
  db.prepare("UPDATE advertisements SET status='Published', published_at=CURRENT_TIMESTAMP WHERE id=?").run(ad.id);
  try{ db.prepare("INSERT OR IGNORE INTO campaigns(ad_id,status) VALUES(?,'Active')").run(ad.id); }catch(e){}
  const user=db.prepare('SELECT telegram_id FROM users WHERE id=?').get(ad.user_id);
  sendTelegram(user?.telegram_id,`🚀 Ad Published #${ad.id}\nLive for channel + Mini App + Publisher Bots.`);
  res.json({ok:true,message_id:msgId});
});
app.post('/api/admin/ad/:id/pause',adminAuth,(req,res)=>{ try{ db.prepare('UPDATE campaigns SET paused=1 WHERE ad_id=?').run(req.params.id); }catch(e){} res.json({ok:true}); });
app.post('/api/admin/ad/:id/resume',adminAuth,(req,res)=>{ try{ db.prepare('UPDATE campaigns SET paused=0 WHERE ad_id=?').run(req.params.id); }catch(e){} res.json({ok:true}); });
app.post('/api/admin/ad/:id/cancel',adminAuth,(req,res)=>{ db.prepare("UPDATE advertisements SET status='Completed' WHERE id=?").run(req.params.id); try{ db.prepare("UPDATE campaigns SET status='Completed' WHERE ad_id=?").run(req.params.id); }catch(e){} res.json({ok:true}); });
app.get('/api/admin/packages',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT * FROM packages ORDER BY id DESC').all()); });
app.post('/api/admin/packages',adminAuth,(req,res)=>{ const info=db.prepare('INSERT INTO packages(name,placement,price,duration_days) VALUES(?,?,?,?)').run(req.body.name,req.body.placement,req.body.price,req.body.duration_days); res.json({ok:true,id:info.lastInsertRowid}); });
app.put('/api/admin/packages/:id',adminAuth,(req,res)=>{ db.prepare('UPDATE packages SET name=?,placement=?,price=?,duration_days=?,active=? WHERE id=?').run(req.body.name,req.body.placement,req.body.price,req.body.duration_days,req.body.active??1,req.params.id); res.json({ok:true}); });
app.delete('/api/admin/packages/:id',adminAuth,(req,res)=>{ db.prepare('DELETE FROM packages WHERE id=?').run(req.params.id); res.json({ok:true}); });
app.get('/api/admin/settings',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT * FROM settings').all()); });
app.post('/api/admin/settings',adminAuth,(req,res)=>{ for(const [k,v] of Object.entries(req.body)) db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES(?,?)').run(k,String(v)); res.json({ok:true}); });
app.get('/api/admin/publications',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT p.*, a.title FROM publications p LEFT JOIN advertisements a ON a.id=p.ad_id ORDER BY p.id DESC LIMIT 100').all()); });
app.get('/api/admin/transactions',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT t.*, u.username FROM transactions t LEFT JOIN users u ON u.id=t.user_id ORDER BY t.id DESC LIMIT 100').all()); });
app.get('/api/admin/publishers',adminAuth,(req,res)=>{ res.json(db.prepare('SELECT p.*, u.username FROM publishers p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id DESC').all()); });
app.post('/api/admin/publisher/:id/approve',adminAuth,(req,res)=>{
  db.prepare("UPDATE publishers SET status='Approved' WHERE id=?").run(req.params.id);
  const pub=db.prepare('SELECT * FROM publishers WHERE id=?').get(req.params.id);
  const user=db.prepare('SELECT telegram_id FROM users WHERE id=?').get(pub.user_id);
  sendTelegram(user?.telegram_id,`✅ Publisher Approved\nBot: ${pub.bot_username}\nPass Code: ${pub.pcode}\nAPI Key: ${pub.api_key}\nSDK: ${process.env.MINI_APP_URL}/sdk.js?id=${pub.pcode}\nPaste SDK in your bot to start earning.`);
  res.json({ok:true});
});
app.post('/api/admin/publisher/:id/reject',adminAuth,(req,res)=>{ db.prepare("UPDATE publishers SET status='Rejected' WHERE id=?").run(req.params.id); res.json({ok:true}); });
app.post('/api/admin/publisher/:id/suspend',adminAuth,(req,res)=>{ db.prepare("UPDATE publishers SET status='Suspended' WHERE id=?").run(req.params.id); res.json({ok:true}); });

// JSON error handler - never return HTML for /api
app.use((err,req,res,next)=>{
  console.log('API ERROR',err.message);
  if(req.path.startsWith('/api')) return res.status(500).json({error:err.message});
  next(err);
});

try{ const {bot}=require('./bot'); if(process.env.BOT_TOKEN && process.env.BOT_TOKEN!=='PLACEHOLDER') bot.launch().then(()=> console.log('Bot running')); }catch(e){ console.log('Bot fail',e.message); }
const PORT=process.env.PORT||3000;
app.listen(PORT,()=> console.log(`ADS PUBLISHER running on ${PORT}`));
