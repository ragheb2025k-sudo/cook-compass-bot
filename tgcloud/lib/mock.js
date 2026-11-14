// tgcloud/lib/mock.js — deterministic offline AI double.
//
// lib/config.js → AI.provider = 'mock' routes every AI call here instead of a
// real provider. It produces the exact same JSON shapes the real prompts ask
// for, so the whole flow stack (state machine, keyboards, formatting, DB) can
// be tested on the platform with `npx tgcloud run` — no key, no rate limits.
// It is an explicit provider option for development, never a hidden fallback.

import { WEEKDAYS_FA } from './config.js';

const RECIPE = (name, timeMin, difficulty, why, ingredients, steps, tip) => ({
  name, time_min: timeMin, difficulty, why,
  ingredients, steps, chef_tip: tip,
});

const MOCK_RECIPES = [
  RECIPE('کوکو مرغ با سس گوجه', 18, 'آسان', 'با مرغ موجودت در کمترین وقت یک شام کامل می‌سازی', [
    { name: 'مرغ پخته ریش‌ریش‌شده', qty: '۳۰۰ گرم' },
    { name: 'تخم‌مرغ', qty: '۳ عدد' },
    { name: 'پیاز رنده‌شده', qty: '۱ عدد متوسط' },
    { name: 'گوجه', qty: '۲ عدد' },
    { name: 'آرد سفید', qty: '۲ قاشق غذاخوری' },
    { name: 'نمک، فلفل، زردچوبه', qty: 'به میزان لازم' },
  ], [
    'مرغ ریش‌ریش‌شده، پیاز و ادویه‌ها را با تخم‌مرغ و آرد خوب مخلوط کن.',
    'تابه را با روغن داغ کن و مایه را با پشت قاشق پهن کن.',
    'یک طرف را ۴ دقیقه سرخ کن، سپس با بشقاب برگردان و طرف دیگر را ۴ دقیقه دیگر بپز.',
    'گوجه‌های حلقه‌شده را در همان تابه با کمی کره تفت بده تا نرم شوند.',
    'کوکو را با سس گوجه سرو کن.',
  ], 'برای پف کردن کوکو، مایه را ۵ دقیقه استراحت بده تا آردش خیس بخورد.'),
  RECIPE('خوراک مرغ و سیب‌زمینی یک‌تابه‌ای', 25, 'آسان', 'کل غذا در یک تابه؛ شست‌وشو حداقلی!', [
    { name: 'ران مرغ', qty: '۴ عدد' },
    { name: 'سیب‌زمینی', qty: '۳ عدد متوسط' },
    { name: 'گوجه', qty: '۲ عدد' },
    { name: 'پیاز', qty: '۱ عدد' },
    { name: 'پودر سیر و زردچوبه', qty: '۱ قاشق چای‌خوری' },
  ], [
    'پیاز خلالی را در تابه طلایی کن.',
    'ران مرغ را اضافه کن تا هر طرف ۳ دقیقه بگیرد.',
    'سیب‌زمینی‌های حلقه‌شده و گوجه را همراه ادویه اضافه کن.',
    'نصف لیوان آب بریز، درِ تابه را ببند و روی شعله متوسط ۱۵ دقیقه بپز.',
    'بگذار آبش کشیده شود و تابه‌ای برشته شود.',
  ], 'کف در تابه را فویل بکش؛ چربی نمی‌گیرد و شست‌وشو راحت‌تر می‌شود.'),
  RECIPE('ماکارونی مخصوص با سس گوشت', 35, 'متوسط', 'کلاسیک همیشه‌پسند با طعم خونگی', [
    { name: 'ماکارونی', qty: '۴۰۰ گرم' },
    { name: 'گوشت چرخ‌کرده', qty: '۳۰۰ گرم' },
    { name: 'پیاز', qty: '۱ عدد' },
    { name: 'رب گوجه', qty: '۲ قاشق غذاخوری' },
    { name: 'زردچوبه، فلفل سیاه، دارچین', qty: 'به میزان لازم' },
  ], [
    'پیاز را سرخ کن، گوشت را اضافه کن تا رنگش بپرد.',
    'رب، ادویه و نصف لیوان آب را اضافه کن و ۱۰ دقیقه بگذار جا بیفتد.',
    'ماکارونی را در آب نمک جوش تا نیم‌پز بکش و آبکش کن.',
    'لایه‌لایه ماکارونی و سس را در قابلمه بچین و کمی روغن رویش بده.',
    'با شعله کم و درب دم‌کنی ۲۰ دقیقه دم بگذار.',
  ], 'برای دم بهتر، کف قابلمه یک لایه نازک سیب‌زمینی ورقه‌ای بچین تا ته‌دیگ خوشمزه هم بگیری.'),
];

const MOCK_PLAN = {
  lunches: ['خوراک مرغ و قارچ با برنج', 'عدس‌پلو با کشمش و پیاز داغ', 'ماکارونی مخصوص', 'خوراک بادمجان و تخم‌مرغ', 'تاغ‌پلو با مرغ ریش‌ریش', 'کوکو سیب‌زمینی با نان و سبزی', 'لوبیاپلو با گوشت چرخ‌کرده'],
  dinners: ['مرغ ریش‌ریش مخصوص (پایه مشترک)', 'سوپ جو با مرغ', 'خوراک مرغ و قارچ (از پایه فریزری)', 'قیمه سیب‌زمینی', 'پیتزا خونگی با خمیر نان', 'ماست‌ورزه و املت گوجه', 'کوکو سبزی با ماست و خیار'],
  shopping_list: [
    { category: 'پروتئین', items: [{ name: 'مرغ', qty: '۱.۵ کیلوگرم' }, { name: 'گوشت چرخ‌کرده', qty: '۵۰۰ گرم' }, { name: 'تخم‌مرغ', qty: '۸ عدد' }] },
    { category: 'سبزیجات و میوه', items: [{ name: 'پیاز', qty: '۲ کیلوگرم' }, { name: 'گوجه', qty: '۱ کیلوگرم' }, { name: 'بادمجان', qty: '۵۰۰ گرم' }, { name: 'قارچ', qty: '۳۰۰ گرم' }, { name: 'خیار', qty: '۵۰۰ گرم' }] },
    { category: 'حبوبات و غلات', items: [{ name: 'برنج', qty: '۲ کیلوگرم' }, { name: 'ماکارونی', qty: '۵۰۰ گرم' }, { name: 'عدس', qty: '۵۰۰ گرم' }, { name: 'لوبیا', qty: '۳۰۰ گرم' }, { name: 'جو پرک', qty: '۲۰۰ گرم' }] },
    { category: 'لبنیات', items: [{ name: 'ماست', qty: '۱ کیلوگرم' }, { name: 'پنیر', qty: '۳۰۰ گرم' }, { name: 'پنیر پیتزا', qty: '۲۰۰ گرم' }] },
    { category: 'سایر', items: [{ name: 'رب گوجه', qty: '۱ قوطی' }, { name: 'روغن', qty: '۱ بطری' }, { name: 'خمیر نان پیتزا', qty: '۱ بسته' }] },
  ],
  batch_notes: [
    'روز ۱: مرغ را دو برابر ریش‌ریش بپز؛ نصفش را با سس پایه فریز کن.',
    'روز ۳: پایه فریزری را با قارچ و پیاز به خوراک مرغ و قارچ تبدیل کن.',
    'روز ۵: تاغ‌پلو را با همان مرغ ریش‌ریش باقی‌مانده درست کن.',
  ],
};

function planFor() {
  const days = [];
  for (let i = 1; i <= 7; i++) {
    days.push({ n: i, lunch: MOCK_PLAN.lunches[i - 1], dinner: MOCK_PLAN.dinners[i - 1] });
  }
  return days;
}

function recipeFor(name) {
  const base = MOCK_RECIPES[0];
  return {
    ...base,
    name,
    why: 'از برنامه هفتگی‌ات؛ با مواد در دسترس و سریع',
    steps: base.steps.map((s, i) => `${s} (مرحله ${i + 1} از ${base.steps.length})`),
  };
}

/**
 * Route a mocked reply by markers in the prompt — same shapes the real
 * provider must return for each domain function in lib/ai.js.
 */
export function mockChatReply(user) {
  const u = String(user ?? '');

  if (u.includes('برنامه غذایی هفتگی')) {
    return JSON.stringify({
      days: planFor(),
      shopping_list: MOCK_PLAN.shopping_list,
      batch_notes: u.includes('حالت ساده') ? [] : MOCK_PLAN.batch_notes,
    });
  }

  const dayMatch = u.match(/روز\s*(\d)\s*برنامه هفتگی/);
  if (dayMatch) {
    const n = Number(dayMatch[1]);
    return JSON.stringify({
      recipes: [
        { slot: 'lunch', ...recipeFor(MOCK_PLAN.lunches[n - 1] ?? 'خوراک ناهار') },
        { slot: 'dinner', ...recipeFor(MOCK_PLAN.dinners[n - 1] ?? 'خوراک شام') },
      ],
    });
  }

  if (u.includes('گردونه شانس')) {
    return JSON.stringify({
      recipe: MOCK_RECIPES[1],
      fun_line: 'گردونه گفت امروز روزِ یک‌تابه‌ای‌هاست! 🍳',
    });
  }

  return JSON.stringify({ recipes: MOCK_RECIPES });
}
