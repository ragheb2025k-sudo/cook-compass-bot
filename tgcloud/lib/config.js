// tgcloud/lib/config.js — central configuration for «قطب‌نمای آشپزی».
//
// The Telegram Serverless runtime has no environment variables and no secrets
// manager: everything the bot needs lives in this module. That is by design —
// the project is version-controlled and the cloud copy mirrors this folder.
//
// ⚠️  AI PROVIDER — to switch providers, edit the AI block below:
//     1) Pollinations (current, free, no key needed — OpenAI-compatible)
//     2) OpenRouter  : baseUrl 'https://openrouter.ai/api/v1', apiKey 'sk-or-...',
//                     model e.g. 'google/gemini-2.0-flash-001', headers: {}
//     3) Groq        : baseUrl 'https://api.groq.com/openai/v1', apiKey 'gsk_...',
//                     model e.g. 'llama-3.3-70b-versatile', headers: {}
//     4) Gemini      : baseUrl 'https://generativelanguage.googleapis.com/v1beta/openai',
//                     apiKey 'AIza...', model e.g. 'gemini-2.0-flash', headers: {}
//     Any OpenAI-compatible endpoint works — only these fields change.

export const BOT = {
  name: 'قطب‌نمای آشپزی',
  username: '@CookCompassBot',
  url: 'https://t.me/CookCompassBot',
  footer: '🧭 قطب‌نمای آشپزی | @CookCompassBot',
};

//    5) mock        : provider 'mock' — deterministic offline double for
//                     `npx tgcloud run` testing without any network (lib/mock.js)

export const AI = {
  provider: 'pollinations',
  baseUrl: 'https://text.pollinations.ai',
  chatPath: '/openai',
  apiKey: '', // empty for pollinations; set 'sk-or-...' / 'gsk_...' / 'AIza...' for the others
  model: 'openai',
  systemRole: 'system',
  timeoutMs: 60000,
  temperature: 0.85,
  maxTokensRecipes: 3500,
  maxTokensPlan: 7000,
  maxTokensRandom: 1600,
  headers: {}, // extra auth headers (none needed for pollinations / OpenRouter / Groq / Gemini)
  extraBody: { reasoning_effort: 'low' }, // pollinations latency control — remove when switching to Groq/OpenRouter
};

// ---------------------------------------------------------------------------
// LEGAL & OWNER IDENTITY — injected into /privacy, /terms, /support,
// /paysupport and every legal notice (compliance requirement; single source).
// ---------------------------------------------------------------------------
export const LEGAL = {
  BRAND_NAME: 'Botmaker Telegram',
  CREATOR_CHANNEL_URL: 'https://t.me/Botmaker_Telegram',
  SUPPORT_CHANNEL_HANDLE: '@Botmaker_Telegram',
  CONTACT_EMAIL: 'ragheb2025k@gmail.com',
  LAST_UPDATED: '۲۳ آبان ۱۴۰۳',
};

// ---------------------------------------------------------------------------
// Abuse guards (serverless resilience & cost protection):
//   - MAX_ACTIONS_PER_MIN : per-user throttle on every message/button press
//   - AI_DAILY_LIMIT      : per-user daily cap on AI provider calls
//   - SEEN_TTL_SEC        : update-idempotency window (duplicate webhooks)
//   - MAX_INPUT_CHARS     : hard cap on accepted free-text length
// ---------------------------------------------------------------------------
export const GUARDS = {
  MAX_ACTIONS_PER_MIN: 25,
  AI_DAILY_LIMIT: 40,
  SEEN_TTL_SEC: 3600,
  MAX_INPUT_CHARS: 800,
};

// ---------------------------------------------------------------------------
// Weekly planner questionnaire — سهمیه پروتئین و شام سبک هر هفته.
// The user answers 0..4 per protein before the plan is generated; questions
// forbidden by the profile diet are skipped and forced to 0.
// ---------------------------------------------------------------------------
export const WEEKLY_PLAN = {
  COUNT_OPTIONS: [0, 1, 2, 3, 4],
  ECONOMY_HINT: '💰 گوشت قرمز و ماهی به‌خاطر قیمت بالا معمولاً هر دو هفته یک بار به‌صرفه است — سهمیه این هفته را خودت تعیین می‌کنی.',
  QUESTIONS: {
    meat:    { key: 'meat',    emoji: '🥩', question: 'تو این هفته چند وعده گوشت قرمز داریم؟' },
    fish:    { key: 'fish',    emoji: '🐟', question: 'تو این هفته چند وعده ماهی داریم؟' },
    chicken: { key: 'chicken', emoji: '🍗', question: 'تو این هفته چند وعده مرغ داریم؟' },
    light:   { key: 'light',   emoji: '🥗', question: 'این هفته چند شام سبک بخوریم؟ (سوپ، سالاد، املت و…)' },
  },
  ORDER: ['meat', 'fish', 'chicken', 'light'],
};

// FSM state lifetime — a half-started flow quietly dies after this.
export const SESSION_TTL_MS = 2 * 60 * 60 * 1000;

// "Never repeat a dish cooked in the past 14 days."
export const HISTORY_DAYS = 14;

export const RECIPES_PER_ROUND = 3;

// ---------------------------------------------------------------------------
// "What do I have at home?" — the low-friction pantry grid (3 items per row).
// Deliberately GENERIC: everyday Iranian household staples only — the stuff a
// normal kitchen actually has (fridge + cupboard + freezer). No exotic,
// niche or seasonal items that most homes wouldn't stock. Labels stay short
// so three-per-row buttons never truncate on narrow phones.
// ---------------------------------------------------------------------------
export const PANTRY_ITEMS = [
  // پروتئین
  'مرغ',
  'گوشت قرمز',
  'ماهی و تن‌ماهی',
  'سوسیس و کالباس',
  'تخم‌مرغ',
  // لبنیات
  'شیر',
  'ماست',
  'پنیر',
  'کره',
  // کابینت — خوراکی‌های خشک
  'برنج',
  'ماکارونی',
  'آرد',
  'نان',
  'عدس',
  'لوبیا',
  'نخود',
  'روغن',
  'شکر',
  // سبزیجات
  'سیب‌زمینی',
  'پیاز و سیر',
  'گوجه',
  'خیار',
  'کاهو و سبزی',
  'بادمجان',
  'کدو و هویج',
  'فلفل دلمه',
  'قارچ',
  // چاشنی و مکمل‌ها
  'رب گوجه',
  'کچاپ و سس',
  'لیمو و آب‌لیمو',
  'زیتون و ترشی',
  'عسل و مربا',
  'مغز و کشمش',
];

// ---------------------------------------------------------------------------
// "/" command menu — registered via setMyCommands so users get one-tap quick
// access from the chat's menu button. registerCommands() (telegram.js) runs on
// every /start; keep this list in sync with the command switch in router.js.
// ---------------------------------------------------------------------------
export const BOT_COMMANDS = [
  { command: 'start',          description: '🚀 شروع و بازگشت به منوی اصلی' },
  { command: 'fridge',         description: '🧺 خونه‌م چی دارم؟ پیشنهاد غذا با مواد موجود' },
  { command: 'rescue',         description: '🚑 نجات مواد در حال فساد' },
  { command: 'plan',           description: '📅 برنامه غذایی هفتگی' },
  { command: 'random',         description: '🎰 گردونه شانس' },
  { command: 'profile',        description: '⚙️ تنظیمات و پروفایل من' },
  { command: 'help',           description: '📖 راهنمای کامل ربات' },
  { command: 'cancel',         description: '✖️ لغو عملیات جاری' },
  { command: 'privacy',        description: '🔒 حریم خصوصی' },
  { command: 'terms',          description: '📜 قوانین استفاده' },
  { command: 'support',        description: '💬 پشتیبانی و تماس با سازنده' },
  { command: 'paysupport',     description: '💳 پشتیبانی پرداخت' },
  { command: 'delete_my_data', description: '🗑 حذف همه داده‌های من' },
];

// Smart situational filters — instant inline toggles.
export const FILTERS = [
  { key: 'fast',   label: '⚡ زیر ۲۰ دقیقه',  prompt: 'سرعت مطلق: آماده‌سازی کل غذا زیر ۲۰ دقیقه' },
  { key: 'onepot', label: '🍳 کم‌ظرف',        prompt: 'کم‌ظرف: کل غذا در یک قابلمه یا یک تابه پخته می‌شود (شست‌وشوی حداقلی)' },
  { key: 'budget', label: '💸 اقتصادی',       prompt: 'اقتصادی (آخر ماه): بدون گوشت گران‌قیمت؛ حبوبات، تخم‌مرغ و مواد ساده' },
  { key: 'world',  label: '🌍 تنوع‌طلبی',     prompt: 'تنوع‌طلبی: غذای بین‌المللی ساده که با مواد در دسترس آشپزخانه ایرانی درست می‌شود' },
];

export const DIET_OPTIONS = [
  { key: 'none',         label: '🍽 همه‌چیز می‌خورم',     prompt: 'بدون محدودیت' },
  { key: 'vegetarian',   label: '🥦 گیاهخوار',           prompt: 'گیاهخوار: هیچ گوشت و مرغ و ماهی — لبنیات و تخم‌مرغ اشکالی ندارد' },
  { key: 'no_red_meat',  label: '🚫 بدون گوشت قرمز',     prompt: 'بدون گوشت قرمز: مرغ و ماهی و گوشت چرخ‌کرده مرغ آزاد است، گوشت قرمز ممنوع' },
  { key: 'no_dairy',     label: '🥛 بدون لبنیات',        prompt: 'بدون لبنیات: شیر، ماست، پنیر و خامه ممنوع' },
];

export const SKILL_OPTIONS = [
  { key: 'simple', label: '🥄 ساده — سریع و بی‌دردسر',  prompt: 'ساده: مراحل کوتاه، تکنیک‌های ابتدایی، بدون کار پیچیده' },
  { key: 'medium', label: '🍲 متوسط — راحت آشپزی می‌کنم', prompt: 'متوسط: دستورهای جدی‌تر با چند مرحله و تکنیک معمول آشپزخانه' },
];

// ۶+ option maps to this numeric household so AI scales amounts generously.
export const HOUSEHOLD_MAX = 7;

export const WEEKDAYS_FA = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
