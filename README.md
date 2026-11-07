ADS PUBLISHER - Bolt Deployment

1. npm install
2. Copy .env.example to .env - fill BOT_TOKEN, ADMIN_TELEGRAM_ID, CHANNEL, MINI_APP_URL, USDT addresses, ADMIN login
3. npm start - backend on PORT 3000
4. Bolt / Vercel / Netlify + Node host:
   - Push to GitHub
   - Import in Bolt
   - Build: npm install
   - Start: npm start
   - Env vars from .env
   - Set Mini App URL in @BotFather -> Menu Button -> Web App -> https://your-domain.com
   - Admin: https://your-domain.com/admin.html
5. Test Flow:
   - Bot /start -> Open Mini App
   - Publisher: PUBLISHER tab -> Register bot -> Get pXXX -> Admin approve in Admin > Publishers
   - Other bot: Paste <script src="https://your-domain.com/sdk.js?id=pXXX"></script> + button showAdsPublisher()
   - Advertiser: Deposit TRC20/ERC20 -> Admin Confirm -> Create Ad -> Admin Approve -> Publish -> Appears in channel + Mini App + ALL approved publisher bots
   - Duplicate TX blocked, rejected deposit NOT credited, rejected ad refunded # Ads-publisher
