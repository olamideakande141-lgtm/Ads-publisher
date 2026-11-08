const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
if(!MONGO_URI) console.log('WARNING: MONGO_URI missing!');

mongoose.connect(MONGO_URI).then(()=> console.log('MongoDB connected ✅'))
.catch(e=> console.log('Mongo fail', e.message));

const Counter = mongoose.model('Counter', new mongoose.Schema({ name: String, seq: {type:Number, default:0} }));
async function nextId(name){
  const c = await Counter.findOneAndUpdate({name}, {$inc:{seq:1}}, {upsert:true, new:true});
  return c.seq;
}

const User = mongoose.model('User', new mongoose.Schema({
  id:{type:Number, unique:true},
  telegram_id:{type:String, unique:true, required:true},
  username:String, first_name:String, photo_url:String,
  status:{type:String, default:'active'},
  created_at:{type:Date, default:Date.now}
}));

const Wallet = mongoose.model('Wallet', new mongoose.Schema({
  user_id:Number, available:{type:Number, default:0},
  total_deposited:{type:Number, default:0}, total_spent:{type:Number, default:0},
  total_refunded:{type:Number, default:0}, total_earned:{type:Number, default:0}
}));

const Deposit = mongoose.model('Deposit', new mongoose.Schema({
  id:{type:Number, unique:true}, user_id:Number, network:String, amount:Number,
  wallet_address:String, tx_hash:{type:String, unique:true, sparse:true},
  proof_path:String, status:{type:String, default:'Pending'}, admin_note:String,
  created_at:{type:Date, default:Date.now}, confirmed_at:Date
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  id:{type:Number, unique:true}, user_id:Number, type:String, amount:Number,
  balance_after:Number, ref_type:String, ref_id:Number, note:String,
  created_at:{type:Date, default:Date.now}
}));

const Advertisement = mongoose.model('Advertisement', new mongoose.Schema({
  id:{type:Number, unique:true}, user_id:Number, title:String, description:String,
  media_path:String, media_type:String, destination_url:String, category:String,
  placement:String, duration_days:Number, package_id:Number, price:Number,
  status:{type:String, default:'Awaiting Moderation'}, moderation_note:String,
  scheduled_at:Date, published_at:Date, created_at:{type:Date, default:Date.now}
}));

const Campaign = mongoose.model('Campaign', new mongoose.Schema({
  id:{type:Number, unique:true}, ad_id:{type:Number, unique:true},
  status:{type:String, default:'Scheduled'}, published_message_id:String,
  views:{type:Number, default:0}, clicks:{type:Number, default:0},
  paused:{type:Number, default:0}, created_at:{type:Date, default:Date.now}
}));

const Publication = mongoose.model('Publication', new mongoose.Schema({
  id:{type:Number, unique:true}, ad_id:Number, channel:String, message_id:String,
  published_at:{type:Date, default:Date.now}
}));

const Package = mongoose.model('Package', new mongoose.Schema({
  id:{type:Number, unique:true}, name:String, placement:String, price:Number,
  duration_days:Number, active:{type:Number, default:1}
}));

const Setting = mongoose.model('Setting', new mongoose.Schema({
  key:{type:String, unique:true}, value:String
}));

const Publisher = mongoose.model('Publisher', new mongoose.Schema({
  id:{type:Number, unique:true}, user_id:Number, bot_username:String,
  mini_app_url:String, bot_name:String, pcode:{type:String, unique:true, sparse:true},
  api_key:{type:String, unique:true, sparse:true}, status:{type:String, default:'Pending'},
  total_views:{type:Number, default:0}, total_clicks:{type:Number, default:0},
  total_impressions:{type:Number, default:0}, total_earned:{type:Number, default:0},
  created_at:{type:Date, default:Date.now}
}));

const PublisherView = mongoose.model('PublisherView', new mongoose.Schema({
  id:{type:Number, unique:true}, pcode:String, publisher_id:Number, ad_id:Number,
  viewer_id:String, rewarded:{type:Number, default:0}, created_at:{type:Date, default:Date.now}
}));

const PublisherClick = mongoose.model('PublisherClick', new mongoose.Schema({
  id:{type:Number, unique:true}, pcode:String, publisher_id:Number, ad_id:Number,
  viewer_id:String, created_at:{type:Date, default:Date.now}
}));

const PublisherWithdrawal = mongoose.model('PublisherWithdrawal', new mongoose.Schema({
  id:{type:Number, unique:true}, publisher_id:Number, user_id:Number, amount:Number,
  fee:{type:Number, default:0}, net_amount:{type:Number, default:0},
  wallet_address:String, network:{type:String, default:'TRC20'}, tx_hash:String,
  status:{type:String, default:'Pending'}, created_at:{type:Date, default:Date.now}
}));

// Seed packages + settings - FIXED: wait for Mongo, retry if fail
async function seed(){
  try{
    // Wait for Mongo to connect - up to 30 seconds
    for(let i=0;i<15;i++){
      if(mongoose.connection.readyState===1) break;
      console.log('Waiting for Mongo... try '+(i+1));
      await new Promise(r=> setTimeout(r, 2000));
    }
    if(mongoose.connection.readyState!==1){
      console.log('Seed skipped - Mongo not connected yet, will retry in 10s');
      setTimeout(seed, 10000);
      return;
    }
    const count = await Package.countDocuments();
    console.log('Package count:', count);
    if(count===0){
      const pkgs = [
        {name:'Channel Post 1 Day', placement:'Channel', price:10, duration_days:1},
        {name:'Bot Promo 3 Days', placement:'Bot', price:25, duration_days:3},
        {name:'Mini App Promo 7 Days', placement:'Mini App', price:50, duration_days:7},
        {name:'Video Ad 7 Days', placement:'Mini App', price:80, duration_days:7},
        {name:'Website Promo 7 Days', placement:'Mini App', price:40, duration_days:7},
        {name:'Business Promo 7 Days', placement:'Channel', price:60, duration_days:7},
      ];
      for(const p of pkgs){ p.id = await nextId('packages'); await Package.create(p); }
      console.log('Seeded packages ✅ 6 packages');
    }
    const defaults = {USDT_TRC20:'', USDT_ERC20:'', TRC20_ENABLED:'1', ERC20_ENABLED:'1', SUPPORT_USERNAME:'@support', PUBLISHER_REWARD_PER_VIEW:'0.005', REFUND_POLICY:'Full refund on rejection'};
    for(const [k,v] of Object.entries(defaults)){
      await Setting.updateOne({key:k}, {$setOnInsert:{key:k, value:v}}, {upsert:true});
    }
    console.log('Seed done ✅');
  }catch(e){ 
    console.log('seed fail', e.message); 
    // Retry once after 10s if it failed
    setTimeout(seed, 10000);
  }
}
seed();

module.exports = { mongoose, nextId, User, Wallet, Deposit, Transaction, Advertisement, Campaign, Publication, Package, Setting, Publisher, PublisherView, PublisherClick, PublisherWithdrawal };
