require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const db = require('./database');
const bot = new Telegraf(process.env.BOT_TOKEN || 'PLACEHOLDER');
async function sendTelegram(chatId, text, mediaPath){
  try{
    if(!chatId) return null;
    if(mediaPath && /\.(jpg|jpeg|png)$/i.test(mediaPath)){
      const m = await bot.telegram.sendPhoto(chatId, {source: mediaPath}, {caption: text}); return String(m.message_id);
    }
    if(mediaPath && /\.mp4$/i.test(mediaPath)){
      const m = await bot.telegram.sendVideo(chatId, {source: mediaPath}, {caption: text}); return String(m.message_id);
    }
    const m = await bot.telegram.sendMessage(chatId, text); return String(m.message_id);
  }catch(e){ console.log('Telegram send fail', e.message); return null; }
}
const webAppBtn = ()=> Markup.inlineKeyboard([[Markup.button.webApp('🚀 Open ADS PUBLISHER', process.env.MINI_APP_URL || 'https://ads-publisher.onrender.com')]]);
function ensureUser(from){
  let u = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(from.id));
  if(!u){
    const info = db.prepare('INSERT INTO users(telegram_id,username,first_name,photo_url) VALUES(?,?,?,?)').run(String(from.id), from.username||'', from.first_name||'', '');
    db.prepare('INSERT INTO wallets(user_id) VALUES(?)').run(info.lastInsertRowid);
    u = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
  }
  return u;
}
bot.start(async (ctx)=>{
  ensureUser(ctx.from);
  await ctx.reply(`👋 Welcome to ADS PUBLISHER\n\n💰 ADVERTISER: Deposit USDT, create ads, we publish after approval.\n📢 PUBLISHER: Register your bot, get Pass Code pXXX, show our ads in your bot and earn.\n\nNo channel join required.`, webAppBtn());
});
bot.command('home', (ctx)=> ctx.reply('🏠 Main Menu', webAppBtn()));
bot.command('advertise', (ctx)=> ctx.reply('📢 Create ad in Mini App:', webAppBtn()));
bot.command('deposit', (ctx)=> ctx.reply('💰 Deposit USDT TRC20 / ERC20 in Mini App > DEPOSIT', webAppBtn()));
bot.command('balance', (ctx)=>{
  const u = db.prepare('SELECT * FROM users WHERE telegram_id=?').get(String(ctx.from.id));
  const w = u ? db.prepare('SELECT * FROM wallets WHERE user_id=?').get(u.id) : null;
  ctx.reply(`💰 Advertising Wallet\nAvailable: ${(w?.available||0).toFixed(4)} USDT\nEarned as Publisher: ${(w?.total_earned||0).toFixed(4)} USDT\nTotal Deposited: ${(w?.total_deposited||0).toFixed(4)}`);
});
bot.command('campaigns', (ctx)=> ctx.reply('📊 See campaigns in Mini App > CAMPAIGNS', webAppBtn()));
bot.command('withdraw', (ctx)=> ctx.reply('Publisher withdrawal: Go to Mini App > PUBLISHER > Withdraw. Advertiser withdrawal: Contact /support'));
bot.command('support', (ctx)=> ctx.reply(`🆘 Support: ${process.env.SUPPORT_USERNAME||'@support'}`));
bot.command('admin', (ctx)=> ctx.reply('🛡️ Admin Panel', Markup.inlineKeyboard([[Markup.button.webApp('🛡️ Open ADMIN PANEL', 'https://ads-publisher.onrender.com/admin.html')]])));
bot.command('help', (ctx)=> ctx.reply('Commands:\n/start\n/home\n/advertise\n/deposit\n/balance\n/campaigns\n/withdraw\n/support\n/admin\n/help'));
if(require.main===module){ bot.launch().then(()=> console.log('Bot running')); }
module.exports = { bot, sendTelegram, ensureUser };
