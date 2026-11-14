# قطب‌نمای آشپزی 🧭 — @CookCompassBot

دستیار هوشمند «امشب چی بپزم؟» برای کاربران فارسی‌زبان — **۱۰۰٪ Serverless روی زیرساخت رسمی [Telegram Serverless](https://core.telegram.org/bots/serverless)**. بدون VPS، بدون webhook دستی، بدون Polling.

> **مشخصات فنی:** کد JavaScript خالص داخل V8 Isolate کنار Bot API · دیتابیس SQLite داخلی پلتفرم · مدیریت وضعیت FSM روی دیتابیس (بدون state در حافظه) · خروجی AI فقط JSON ساختاریافته.

🔗 **بات در تلگرام:** [@CookCompassBot](https://t.me/CookCompassBot) · 🌐 **صفحه معرفی (GitHub Pages):** پس از اولین اجرای موفق workflow در تب Actions صفحه‌ی معرفی منتشر می‌شود: `https://<username>.github.io/cook-compass-bot/`

---

## امکانات

| ماژول | توضیح |
|---|---|
| 🧊 **یخچالم چی داره؟** | گرید لمسی مواد اولیه (مرغ، گوشت چرخ‌کرده، تخم‌مرغ، سیب‌زمینی، گوجه، بادمجان، برنج، ماکارونی، عدس، لوبیا و…) با toggle ✅/⬜ + ورود آزاد متنی |
| 🚑 **نجات مواد در حال فساد** | ورود ۱–۲ ماده در حال خراب شدن؛ AI موظف به پیشنهاد دستور حول همان مواد |
| ⚡ **فیلترهای هوشمند** | زیر ۲۰ دقیقه · کم‌ظرف · اقتصادی/آخر ماه · تنوع‌طلبی بین‌المللی |
| 📅 **برنامه غذایی هفتگی** | ناهار و شام ۷ روز + **پخت و فریز** (پایه مشترک دوبرابر که ۲ روز بعد به غذای متفاوت تبدیل می‌شود) + **لیست خرید تجمیعی دسته‌بندی‌شده** |
| 🎰 **گردونه شانس** | یک انتخاب قطعی با مقادیر دقیق مواد، مقیاس‌شده بر تعداد نفرات خانواده |
| 🧠 **سابقه پخت ۱۴ روزه** | هیچ غذای پخته‌شده در ۱۴ روز اخیر دوباره پیشنهاد نمی‌شود |
| ⚙️ **پروفایل** | محدودیت غذایی، تعداد نفرات (۱ تا ۶+)، سطح آشپزی (ساده/متوسط) |

هر دستور پخت دقیقاً با این قالب می‌آید: **نام غذا + زمان + سختی → مواد لازم (مقیاس‌شده به نفرات) → مراحل شماره‌گذاری‌شده → ترفند سرآشپز → فوتر** `🧭 قطب‌نمای آشپزی | @CookCompassBot`

---

## ساختار مخزن

```
cook-compass-bot/
├─ tgcloud/                  # کد بات — فقط همین پوشه به پلتفرم deploy می‌شود
│  ├─ handlers/
│  │  ├─ message.js          # هر پیام ورودی
│  │  └─ callback_query.js   # هر لمس دکمه inline
│  ├─ lib/
│  │  ├─ router.js           # نقطه توزیع واحد همه updateها
│  │  ├─ onboarding.js       # راه‌اندازی پروفایل (۳ مرحله)
│  │  ├─ pantry.js           # جریان یخچال + فیلترها
│  │  ├─ flows.js            # تصمیم‌گیری ترتیبی، نجات، گردونه
│  │  ├─ planner.js          # برنامه هفتگی دومرحله‌ای + لیست خرید
│  │  ├─ ai.js               # لایه AI (OpenAI-compatible، فقط JSON)
│  │  ├─ mock.js             # provider آفلاین قطعی برای تست
│  │  ├─ store.js            # لایه دیتابیس (پروفایل/سشن/سابقه/برنامه)
│  │  ├─ telegram.js         # wrapperهای مقاوم Bot API (429-retry)
│  │  ├─ keyboards.js        # سازنده‌های inline keyboard
│  │  ├─ format.js           # رندر کارت دستور/برنامه/لیست خرید
│  │  ├─ texts.js            # همه متن‌های فارسی
│  │  ├─ config.js           # ⚙️ تنظیمات AI و ثابت‌ها
│  │  └─ util.js             # ارقام فارسی، escape، sleep، ...
│  └─ schema.js              # جداول دیتابیس (DSL شبیه Drizzle)
├─ landing/                  # صفحه معرفی ایستا (GitHub Pages)
│  ├─ index.html             # RTL فارسی — آینه طراحی داشبورد
│  ├─ styles.css
│  └─ app.js                 # کارت «وضعیت زنده» از status.json می‌خواند
├─ scripts/
│  └─ build-status.mjs       # ساخت landing/status.json از Telegram Bot API
├─ .github/workflows/
│  ├─ deploy-bot.yml         # CI/CD: tgcloud push بعد از هر تغییر کد بات
│  └─ deploy-pages.yml       # انتشار Pages + بازسازی وضعیت زنده هر ۱۰ دقیقه
├─ bot-meta.json             # متادیتای بات (امکانات/معماری/AI)
├─ AGENTS.md                 # راهنمای کدنویسی با دستیار AI
├─ docs/tgcloud-sdk.md       # مرجع کامل SDK پلتفرم
└─ package.json              # فقط devDependency: @tgcloud/cli
```

## قوانین اجرا (Runtime Contract)

پلتفرم Telegram Serverless چند محدودیت قطعی دارد که کد این پروژه به آن‌ها پایبند است:

- **فقط `sdk` و ماژول‌های خود پروژه** — بدون npm package در runtime.
- Import نسبی با پسوند `.js` — و **بدون `import()` داینامیک** (پشتیبانی نمی‌شود).
- در **where-clause** مقایسه‌ها مقدار خام بدهید (epoch seconds)، نه `Date`.
- ستون‌های `json()` و `timestamp{mode}` در insert و `onConflictDoUpdate.set` مقدار JS طبیعی می‌گیرند.
- هر update تایپِ هندلرِ هم‌نام دارد؛ فایل نبود = update نادیده گرفته می‌شود.

---

## دیپلوی

### راه ۱ — اتومات با GitHub Actions (همین مخزن)

هر push به `main` که `tgcloud/**` را تغییر دهد، به‌طور خودکار بات را روی Telegram Serverless منتشر می‌کند (`deploy-bot.yml`): `push` → `migrate --safe` → بررسی سلامت `webhook`.

صفحه معرفی هم (`deploy-pages.yml`) با هر تغییر `landing/**` منتشر و هر ۱۰ دقیقه برای تازه‌سازی کارت «وضعیت زنده» بازسازی می‌شود.

**تنظیمات یک‌باره در GitHub:** `Settings → Secrets and variables → Actions`:

| Secret | مقدار | مصرف |
|---|---|---|
| `TGCLOUD_TOKEN` | توکن CLI از BotFather → بات → Serverless → CLI Access (قالب `app<id>:<secret>`) | دیپلوی بات |
| `TELEGRAM_BOT_TOKEN` | توکن Bot API از BotFather | ساخت status.json صفحه معرفی (فقط داخل CI؛ هرگز منتشر نمی‌شود) |

### راه ۲ — دستی از لوکال

```bash
# 1) اتصال به بات
npx tgcloud login          # یا: export TGCLOUD_TOKEN=app<id>:<secret>

# 2) دیپلوی کد + مایگریشن دیتابیس
npx tgcloud push
npx tgcloud migrate --safe   # یا --dry-run اول

# 3) بررسی سلامت webhook (مدیریت‌شده توسط پلتفرم)
npx tgcloud webhook          # وضعیت: in sync / out of sync
npx tgcloud webhook sync [--drop-pending]   # در صورت نیاز
```

> Webhook روی `https://cloud.telegram.org/app9080578708/webhook` است و پلتفرم آن را با هندلرهای دیپلوی‌شده sync نگه می‌دارد — **نیازی به setWebhook دستی نیست.** Secret-token و TLS هم توسط خود پلتفرم مدیریت می‌شود.

### تست سریع بدون دیپلوی (کد لوکال، اجرای روی پلتفرم)

```bash
npx tgcloud run handlers/message '{ chat: { id: 123, type: "private" }, from: { id: 123 }, text: "/start" }'
npx tgcloud run handlers/callback_query '{ id: "t1", from: { id: 123 }, message: { message_id: 1, chat: { id: 123, type: "private" } }, data: "ob:diet:none" }'
```

خروجی `console.*` هندلر + زمان اجرا چاپ می‌شود. برای تست قطعیِ بدون شبکه، در `tgcloud/lib/config.js` مقدار `AI.provider` را به `'mock'` بگذارید (`tgcloud/lib/mock.js`).

---

## تنظیم AI (یک قدم تا پایداری کامل)

`tgcloud/lib/config.js` را باز کنید:

```js
export const AI = {
  provider: 'pollinations',            // رایگان بدون کلید (محدودیت rate روی IP اشتراکی)
  baseUrl: 'https://text.pollinations.ai',
  chatPath: '/openai',
  apiKey: '',
  model: 'openai',
  // ...
};
```

برای استفاده پایدار و سریع، یکی از گزینه‌های رایگان را جایگزین کنید — فقط همین چند فیلد عوض می‌شود:

**Groq (پیشنهادی — رایگان و بسیار سریع):**
```js
provider: 'openai-compatible',
baseUrl: 'https://api.groq.com/openai/v1',
chatPath: '/chat/completions',
apiKey: 'gsk_...',                    // از console.groq.com
model: 'llama-3.3-70b-versatile',
extraBody: {},
```

**OpenRouter:**
```js
baseUrl: 'https://openrouter.ai/api/v1',
apiKey: 'sk-or-...',
model: 'google/gemini-2.0-flash-001',
```

**Gemini (endpoint سازگار با OpenAI):**
```js
baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
apiKey: 'AIza...',
model: 'gemini-2.0-flash',
```

هر تغییر = `npx tgcloud push lib/config.js` (یا push به main و اجرای خودکار CI).

لایه AI شامل: timeout با `AbortSignal`، retry اصلاحی روی خروجی غیر-JSON، extraction مقاوم (حذف بک‌تیک/prose)، اعتبارسنجی و normalize کامل ساختار، و پیام خطای فارسی + دکمه «تلاش دوباره» به کاربر.

---

## صفحه معرفی (GitHub Pages)

پوشه `landing/` یک صفحه ایستای فارسی RTL است — آینه‌ی همان طراحی داشبورد (Hero، کارت وضعیت زنده، امکانات، معماری، سه قدم شروع). نکته فنی مهم:

- کارت «وضعیت زنده» داده را از **`landing/status.json`** می‌خواند که در CI توسط `scripts/build-status.mjs` ساخته می‌شود: اسکریپت با توکن بات `getMe` + `getWebhookInfo` را از Bot API صدا می‌زند و فقط فیلدهای عمومی (نام کاربری، آدرس webhook، تعداد صف، آخرین خطا) را در JSON نهایی می‌نویسد.
- نتیجه: **هیچ توکنی به مرورگر بازدیدکننده نمی‌رسد** و صفحه ایستا هم همچنان وضعیت واقعی بات را نشان می‌دهد.
- اگر `status.json` در دسترس نباشد، کارت با حالت هشدار شیک نمایش داده می‌شود و صفحه نمی‌شکند.
- ارسال هر ۱۰ دقیقه (cron در `deploy-pages.yml`) باعث می‌شود داده وضعیت همیشه تقریباً تازه باشد.

---

## مدل داده

| جدول | نقش |
|---|---|
| `profiles` | پروفایل هر کاربر: رژیم، نفرات (۱–۷؛ ۷=۶+)، سطح آشپزی |
| `cooking_history` | غذاهای پخته‌شده + منبع (decide/rescue/random/plan) — پنجره ۱۴ روز بدون تکرار |
| `sessions` | وضعیت FSM هر چت با TTL (۲ ساعت) — جایگزین statelessِ Redis |
| `meal_plans` | آخرین برنامه ۷ روزه هر کاربر (اسکلت روزها + دستورهای تولیدشده per-day + لیست خرید) |

**Stateless execution:** هیچ state ای در حافظه نگه داشته نمی‌شود؛ هر invocation از دیتابیس «از کجا بودیم» را می‌خواند. پاک‌سازی سشن‌های منقضی به‌صورت lazy در `setSession` انجام می‌شود.

**برنامه هفتگی دومرحله‌ای است** (برای کوتاه ماندن هر invocation): فاز ۱ اسکلت ۷ روز + لیست خرید؛ فاز ۲ دستور پخت هر روز با دکمه `pl:cook:<n>` روی تقاضا تولید و در `meal_plans.recipes` کش می‌شود.

---

## دستورهای بات

`/start` · `/help` · `/fridge` · `/rescue` · `/plan` · `/random` · `/profile` · `/cancel`

## عملیات روزمره

```bash
npx tgcloud status      # تفاوت لوکال با کلاود
npx tgcloud diff        # خط به خط
npx tgcloud push        # دیپلوی اتمیک
npx tgcloud pull        # آوردن تغییرات از کلاود
npx tgcloud reset       # دور ریختن تغییرات لوکال
```

---

## پیوست: setWebhook دستی (فقط برای هاست‌های غیر از Telegram Serverless)

اگر روزی همین کد را روی یک هاست دیگر (Vercel/Cloudflare/VPS) اجرا کردید، ثبت webhook با secret-token:

```bash
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://YOUR-DOMAIN/webhook",
    "secret_token": "<YOUR_RANDOM_SECRET>",
    "allowed_updates": ["message", "callback_query"],
    "drop_pending_updates": true,
    "max_connections": 40
  }'
```

و در endpoint خود، هدر `X-Telegram-Bot-Api-Secret-Token` را با `secret_token` مقایسه (constant-time) و درخواست‌های نامعتبر را با 401 رد کنید. روی Telegram Serverless هر دو کار به‌صورت خودکار توسط پلتفرم انجام می‌شود.

## امنیت

- توکن CLI (`app<id>:<secret>`) فقط در `.tgcloud/credentials` (git-ignored) یا متغیر `TGCLOUD_TOKEN` — هرگز در کد و هرگز در مخزن.
- توکن Bot API فقط به‌عنوان GitHub Secret (`TELEGRAM_BOT_TOKEN`) داخل CI مصرف می‌شود؛ خروجی آن (`status.json`) فقط شامل فیلدهای عمومی است.
- چرخش توکن‌ها از BotFather → Serverless → CLI Access.
- توکن Bot API در runtime کد بات استفاده نمی‌شود؛ SDK پلتفرم خودش احراز می‌کند.
