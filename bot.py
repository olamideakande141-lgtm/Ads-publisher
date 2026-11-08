import requests
import asyncio
from aiogram import Bot, Dispatcher, types
from aiogram.filters import Command
from aiogram.types import WebAppInfo, InlineKeyboardMarkup, InlineKeyboardButton

BOT_TOKEN = "YOUR_BOT_TOKEN_HERE"
PCODE = "p1"
API_KEY = "AP-2118E216F03D"
BASE = "https://ads-publisher.onrender.com"
YOUR_MINI_APP_URL = "https://ads-publisher.onrender.com/publisher-miniapp.html"

bot = Bot(token=BOT_TOKEN)
dp = Dispatcher()

def get_ads():
    try:
        r = requests.get(f"{BASE}/api/publisher/ads", params={"pcode": PCODE, "api_key": API_KEY}, timeout=10)
        data = r.json()
        if isinstance(data, dict):
            return data.get("ads", []) or data.get("items", []) or []
        return data if isinstance(data, list) else []
    except Exception as e:
        print("Fetch ads fail:", e)
        return []

@dp.message(Command("start"))
async def start(msg: types.Message):
    kb = InlineKeyboardMarkup(inline_keyboard=[
        [InlineKeyboardButton(text="🎁 Watch Ad & Earn", web_app=WebAppInfo(url=YOUR_MINI_APP_URL))],
        [InlineKeyboardButton(text="📢 Show Ad Here", callback_data="show_ad")],
        [InlineKeyboardButton(text="💰 My Earnings", callback_data="earnings")]
    ])
    await msg.answer(
        "👋 Welcome to Publisher Bot!\n\n"
        "Watch ads and earn.\n"
        "Ads come from ADS PUBLISHER pool - when Admin publishes an ad, e go appear here automatically.",
        reply_markup=kb
    )

@dp.callback_query(lambda c: c.data == "show_ad")
async def show_ad(call: types.CallbackQuery):
    ads = get_ads()
    if not ads:
        await call.message.answer("😔 No ads available now. Admin never publish ad yet. Try later.")
        await call.answer()
        return
    ad = ads[0]
    viewer_id = str(call.from_user.id)
    caption = f"📢 {ad.get('title','Sponsored')}\n\n{ad.get('description','')}\n\n👉 {ad.get('destination_url','')}"
    media_url = ad.get('media_url') or ad.get('media_path') or ad.get('image_url')
    if media_url:
        full_media = media_url if media_url.startswith("http") else BASE + media_url
        try:
            if "video" in str(ad.get('media_type','')):
                await call.message.answer_video(video=full_media, caption=caption)
            else:
                await call.message.answer_photo(photo=full_media, caption=caption)
        except Exception as e:
            print("Media fail:", e)
            await call.message.answer(caption)
    else:
        await call.message.answer(caption)
    try:
        res = requests.post(f"{BASE}/api/publisher/view", json={
            "pcode": PCODE,
            "api_key": API_KEY,
            "ad_id": ad.get('id'),
            "viewer_id": viewer_id,
            "request_id": f"req_{call.from_user.id}_{ad.get('id')}"
        }, timeout=10)
        data = res.json()
        print("Reward:", data)
        if data.get("ok"):
            await call.message.answer(f"✅ You earned ${data.get('rewarded', 0.005)} for watching this ad!")
        else:
            await call.message.answer(f"Ad shown, but reward: {data.get('error','')}")
    except Exception as e:
        print("Reward fail:", e)
    await call.answer()

@dp.callback_query(lambda c: c.data == "earnings")
async def earnings(call: types.CallbackQuery):
    await call.message.answer("💰 Check your earnings inside ADS PUBLISHER Mini App -> Publisher -> My Statistics\n\nYou earn $0.005 per view. Min withdraw 10 USDT.")
    await call.answer()

async def main():
    print("Publisher Bot running with p1...")
    await dp.start_polling(bot)

if __name__ == "__main__":
    asyncio.run(main())
