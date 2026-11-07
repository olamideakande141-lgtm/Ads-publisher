const Database = require('better-sqlite3');
const db = new Database('ads-publisher.db');
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id TEXT UNIQUE NOT NULL,
  username TEXT, first_name TEXT, photo_url TEXT,
  status TEXT DEFAULT 'active', created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS wallets(
  user_id INTEGER UNIQUE, available REAL DEFAULT 0,
  total_deposited REAL DEFAULT 0, total_spent REAL DEFAULT 0, total_refunded REAL DEFAULT 0,
  total_earned REAL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS deposits(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  network TEXT CHECK(network IN ('TRC20','ERC20')),
  amount REAL, wallet_address TEXT, tx_hash TEXT UNIQUE,
  proof_path TEXT, status TEXT DEFAULT 'Pending', admin_note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP, confirmed_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, type TEXT,
  amount REAL, balance_after REAL, ref_type TEXT, ref_id INTEGER, note TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS advertisements(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT, description TEXT,
  media_path TEXT, media_type TEXT, destination_url TEXT, category TEXT, placement TEXT,
  duration_days INTEGER, package_id INTEGER, price REAL,
  status TEXT DEFAULT 'Awaiting Moderation', moderation_note TEXT,
  scheduled_at DATETIME, published_at DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaigns(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER UNIQUE, status TEXT DEFAULT 'Scheduled',
  published_message_id TEXT, views INTEGER DEFAULT 0, clicks INTEGER DEFAULT 0,
  paused INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS publications(
  id INTEGER PRIMARY KEY AUTOINCREMENT, ad_id INTEGER, channel TEXT, message_id TEXT,
  published_at DATETIME DEFAULT CURRENT_TIMESTAMP, UNIQUE(ad_id, channel)
);
CREATE TABLE IF NOT EXISTS packages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, placement TEXT, price REAL, duration_days INTEGER, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS audit_logs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT, details TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS publishers(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  bot_username TEXT, mini_app_url TEXT, bot_name TEXT,
  pcode TEXT UNIQUE, api_key TEXT UNIQUE,
  status TEXT DEFAULT 'Pending',
  total_views INTEGER DEFAULT 0, total_earned REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS publisher_views(
  id INTEGER PRIMARY KEY AUTOINCREMENT, pcode TEXT, publisher_id INTEGER,
  ad_id INTEGER, viewer_id TEXT, rewarded REAL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS publisher_withdrawals(
  id INTEGER PRIMARY KEY AUTOINCREMENT, publisher_id INTEGER, user_id INTEGER,
  amount REAL, wallet_address TEXT, network TEXT, tx_hash TEXT, status TEXT DEFAULT 'Pending',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`);
const pkg = db.prepare('SELECT COUNT(*) c FROM packages').get().c;
if(pkg===0){
  const ins = db.prepare('INSERT INTO packages(name,placement,price,duration_days) VALUES(?,?,?,?)');
  ins.run('Channel Post 1 Day','Channel',10,1);
  ins.run('Bot Promo 3 Days','Bot',25,3);
  ins.run('Mini App Promo 7 Days','Mini App',50,7);
  ins.run('Video Ad 7 Days','Mini App',80,7);
  ins.run('Website Promo 7 Days','Mini App',40,7);
  ins.run('Business Promo 7 Days','Channel',60,7);
}
const s = db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)');
s.run('USDT_TRC20',''); s.run('USDT_ERC20',''); s.run('TRC20_ENABLED','1'); s.run('ERC20_ENABLED','1');
s.run('SUPPORT_USERNAME','@support'); s.run('PUBLISHER_REWARD_PER_VIEW','0.005'); s.run('REFUND_POLICY','Full refund on rejection');
module.exports = db;
