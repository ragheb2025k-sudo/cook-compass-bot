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
  lunches: [
    'خوراک مرغ و قارچ با برنج', 'عدس‌پلو با کشمش و پیاز داغ', 'ماکارونی مخصوص',
    'خوراک بادمجان و تخم‌مرغ', 'تاغ‌پلو با مرغ ریش‌ریش', 'کوکو سیب‌زمینی با نان و سبزی', 'لوبیاپلو با گوشت چرخ‌کرده',
  ],
  lunchAlts: [
    'خوراک مرغ و قارچ با ماکارونی', 'عدس‌پولکی با نان و سبزی', 'ماکارونی با سس قارچ',
    'کوکو بادمجان با نان', 'خوراک مرغ و سیب‌زمینی با نان', 'کوکو سیب‌زمینی با برنج', 'لوبیاپلو با ماست‌ورزه',
  ],
  dinners: [
    'سوپ جو با مرغ', 'ماست‌ورزه و املت گوجه', 'پیتزا خونگی با خمیر نان',
    'قیمه سیب‌زمینی', 'کوکو سبزی با ماست و خیار', 'ساندویچ مرغ با نان تست', 'خوراک لوبیا و نان سنگک',
  ],
  dinnerAlts: [
    'سالاد مرغ گرم', 'املت اسفناج با نان', 'خوراک قارچ و پنیر با نان',
    'خوراک لوبیا سبز با نان', 'املت سبزی با ماست', 'توست باز با قارچ و پنیر', 'خوراک عدس سریع',
  ],
  dinnerLight: [true, true, false, false, true, false, true],
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
    days.push({
      n: i,
      lunch: MOCK_PLAN.lunches[i - 1],
      lunch_alt: MOCK_PLAN.lunchAlts[i - 1],
      dinner: MOCK_PLAN.dinners[i - 1],
      dinner_alt: MOCK_PLAN.dinnerAlts[i - 1],
      dinner_light: Boolean(MOCK_PLAN.dinnerLight[i - 1]),
    });
  }
  return days;
}

/* ------------------------------------------------------------------ */
/* پرهیزهای غذایی + محدودیت رژیم — the mock honors the profile too      */
/* ------------------------------------------------------------------ */

/** Parse the avoid-list line the real prompts inject via baseContextLines. */
function avoidFoodsFromPrompt(u) {
  const m = u.match(/پرهیزهای غذایی کاربر[^\n]*:\s*([^\n]+)/);
  if (!m) return [];
  return m[1]
    .split(/[،,؛;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const MEAT_RE = /گوشت|مرغ|ماهی|میگو|قورمه|قیمه|کباب|چلوکباب/;
const RED_MEAT_RE = /گوشت قرمز|گوشت چرخ‌کرده|گوشت چرخ کرده|قورمه|قیمه|کباب|فیله|راست‌پا|سوخاری گوشت/;
const FISH_RE = /ماهی|میگو|تن‌ماهی|تن ماهی/;
const CHICKEN_RE = /مرغ|جوجه/;

/** True when any avoided food appears in the recipe (name/ingredients/steps). */
function recipeHitsAvoid(recipe, avoid) {
  if (avoid.length === 0) return false;
  const haystack = [
    recipe.name ?? '',
    ...(recipe.ingredients ?? []).map((i) => i?.name ?? ''),
    ...(recipe.steps ?? []),
  ].join(' ');
  return avoid.some((a) => haystack.includes(a));
}

/** Swap a dish whose name violates the diet / quota rules for a safe one. */
function dietSafeName(name, diet) {
  if (diet === 'vegetarian' && MEAT_RE.test(name)) return 'خوراک عدس و سبزی با برنج';
  if (diet === 'no_red_meat' && RED_MEAT_RE.test(name)) return 'خوراک مرغ و سبزی';
  return name;
}

const SAFE_BASE_ITEMS = ['برنج', 'پیاز', 'گوجه', 'رب گوجه', 'روغن', 'نمک، زردچوبه و فلفل'];

/** Last-resort recipe built from base pantry items minus the avoided ones. */
function safeFallbackRecipe(avoid) {
  const items = SAFE_BASE_ITEMS.filter((name) => !avoid.some((a) => name.includes(a)));
  if (items.length < 2) return null;
  return RECIPE(
    'خوراک ساده برنج و گوجه',
    30,
    'آسان',
    'گزینه بی‌ریسک متناسب با پرهیزهای غذایی‌ات',
    items.map((name) => ({ name, qty: 'به میزان لازم' })),
    ['پیاز و گوجه را تفت بده.', 'برنج نیم‌پز را اضافه کن و با شعله ملایم دم بگذار.'],
    'مقادیر را با ذائقه خودت تنظیم کن — این نسخه از پرهیزهای ثبت‌شده‌ات پیروی می‌کند.',
  );
}

const VEG_SAFE_NAMES = ['خوراک عدس و سبزی با برنج', 'کوکو سبزی با نان', 'ماکارونی سبزیجات'];
const RED_SAFE_NAMES = ['خوراک مرغ و سبزی', 'خوراک مرغ و قارچ', 'جوجه‌کباب خانگی با نان'];

/**
 * Quota-aware dish replacement for the mock provider: swap dishes that
 * violate the diet or the weekly protein quotas parsed from the prompt.
 */
function quotaSafeName(name, { diet, meat, fish, chicken }) {
  if (diet === 'vegetarian' && MEAT_RE.test(name)) return VEG_SAFE_NAMES[(name.length % VEG_SAFE_NAMES.length)];
  if (diet === 'no_red_meat' && RED_MEAT_RE.test(name)) return RED_SAFE_NAMES[(name.length % RED_SAFE_NAMES.length)];
  if (meat === 0 && RED_MEAT_RE.test(name)) return 'خوراک حبوبات و سبزی';
  if (fish === 0 && FISH_RE.test(name)) return 'خوراک تخم‌مرغ و گوجه';
  if (chicken === 0 && CHICKEN_RE.test(name)) return 'کوکو سیب‌زمینی با نان';
  return name;
}

function safeRecipes(avoid, diet) {
  let kept = MOCK_RECIPES.filter((r) => !recipeHitsAvoid(r, avoid));
  if (diet === 'vegetarian') kept = kept.filter((r) => !MEAT_RE.test(r.name));
  if (diet === 'no_red_meat') kept = kept.filter((r) => !RED_MEAT_RE.test(r.name));
  if (kept.length > 0) return kept;
  const fallback = safeFallbackRecipe(avoid);
  return fallback ? [fallback] : MOCK_RECIPES;
}

function safeRecipeBase(avoid, diet) {
  let kept = MOCK_RECIPES.filter((r) => !recipeHitsAvoid(r, avoid));
  if (diet === 'vegetarian') kept = kept.filter((r) => !MEAT_RE.test(r.name));
  if (diet === 'no_red_meat') kept = kept.filter((r) => !RED_MEAT_RE.test(r.name));
  return kept[0] ?? safeFallbackRecipe(avoid) ?? MOCK_RECIPES[0];
}

const PLAN_SAFE_NAMES = ['خوراک برنج و سبزی ساده', 'خوراک سیب‌زمینی و گوجه', 'عدس‌پلو ساده'];

function safePlan(avoid, diet, quotas = null) {
  const plan = planFor();
  let s = 0;
  for (const day of plan) {
    if (avoid.some((a) => day.lunch.includes(a))) day.lunch = PLAN_SAFE_NAMES[s++ % PLAN_SAFE_NAMES.length];
    if (avoid.some((a) => day.dinner.includes(a))) day.dinner = PLAN_SAFE_NAMES[s++ % PLAN_SAFE_NAMES.length];
    day.lunch = dietSafeName(day.lunch, diet);
    day.dinner = dietSafeName(day.dinner, diet);
    if (quotas) {
      day.lunch = quotaSafeName(day.lunch, quotas);
      day.dinner = quotaSafeName(day.dinner, quotas);
      day.dinner_alt = quotaSafeName(day.dinner_alt ?? '', quotas);
      day.lunch_alt = quotaSafeName(day.lunch_alt ?? '', quotas);
      // exact `light` count is applied below, after the loop
    }
    if (diet === 'vegetarian') {
      day.dinner_light = true;
    }
  }
  if (quotas && quotas.light === 0) {
    for (const day of plan) day.dinner_light = false;
  } else if (quotas && quotas.light > 0 && diet !== 'vegetarian') {
    for (const day of plan) day.dinner_light = day.n <= quotas.light;
  }
  const shoppingList = MOCK_PLAN.shopping_list
    .map((cat) => ({
      category: cat.category,
      items: cat.items.filter((i) => !avoid.some((a) => i.name.includes(a)))
        .filter((i) => !(diet === 'vegetarian' && cat.category === 'پروتئین' && MEAT_RE.test(i.name)))
        .filter((i) => !(diet === 'no_red_meat' && RED_MEAT_RE.test(i.name))),
    }))
    .filter((cat) => cat.items.length > 0);
  if (shoppingList.length === 0) {
    shoppingList.push({ category: 'سایر', items: [{ name: 'آب', qty: 'به میزان لازم' }] });
  }
  return { days: plan, shopping_list: shoppingList };
}

function recipeFor(name, avoid, diet = null, targets = null) {
  const base = safeRecipeBase(avoid, diet);
  const finalName = targets ? quotaSafeName(name, { diet, ...targets }) : dietSafeName(name, diet);
  return {
    ...base,
    name: finalName,
    why: 'از برنامه هفتگی‌ات؛ با مواد در دسترس و سریع',
    steps: base.steps.map((s, i) => `${s} (مرحله ${i + 1} از ${base.steps.length})`),
  };
}

/**
 * Parse the weekly protein quota lines injected by planUserPrompt:
 *   "گوشت قرمز دقیقاً N وعده، ماهی دقیقاً M وعده، مرغ دقیقاً K وعده"
 *   "دقیقاً L وعده شام «سبک»"
 * plus the diet line for the current profile.
 */
function weeklyTargetsFromPrompt(u) {
  const meat = Number((u.match(/گوشت قرمز دقیقاً (\d+)/) ?? [])[1]);
  const fish = Number((u.match(/ماهی دقیقاً (\d+)/) ?? [])[1]);
  const chicken = Number((u.match(/مرغ دقیقاً (\d+)/) ?? [])[1]);
  const light = Number((u.match(/دقیقاً (\d+) وعده شام/) ?? [])[1]);
  if ([meat, fish, chicken, light].every((n) => !Number.isFinite(n))) return null;
  return {
    meat: Number.isFinite(meat) ? meat : 0,
    fish: Number.isFinite(fish) ? fish : 0,
    chicken: Number.isFinite(chicken) ? chicken : 0,
    light: Number.isFinite(light) ? light : 0,
  };
}

function dietFromPrompt(u) {
  if (u.includes('گیاهخوار')) return 'vegetarian';
  if (u.includes('بدون گوشت قرمز')) return 'no_red_meat';
  return null;
}

/**
 * Route a mocked reply by markers in the prompt — same shapes the real
 * provider must return for each domain function in lib/ai.js. The profile's
 * پرهیزهای غذایی و رژیم و سهمیه‌ها (parsed from the prompt) are honored deterministically.
 */
export function mockChatReply(user) {
  const u = String(user ?? '');
  const avoid = avoidFoodsFromPrompt(u);
  const diet = dietFromPrompt(u);
  const targets = weeklyTargetsFromPrompt(u);

  if (u.includes('برنامه غذایی هفتگی')) {
    const plan = safePlan(avoid, diet, targets);
    return JSON.stringify({
      days: plan.days,
      shopping_list: plan.shopping_list,
      batch_notes: u.includes('حالت ساده') ? [] : MOCK_PLAN.batch_notes,
    });
  }

  const dayMatch = u.match(/روز\s*(\d)\s*برنامه هفتگی/);
  if (dayMatch) {
    const n = Number(dayMatch[1]);
    return JSON.stringify({
      recipes: [
        { slot: 'lunch', ...recipeFor(MOCK_PLAN.lunches[n - 1] ?? 'خوراک ناهار', avoid, diet, targets) },
        { slot: 'dinner', ...recipeFor(MOCK_PLAN.dinners[n - 1] ?? 'خوراک شام', avoid, diet, targets) },
      ],
    });
  }

  if (u.includes('گردونه شانس')) {
    const recipes = safeRecipes(avoid, diet);
    return JSON.stringify({
      recipe: recipes[Math.floor(Math.random() * recipes.length)],
      fun_line: 'گردونه گفت امروز روزِ یک‌تابه‌ای‌هاست! 🍳',
    });
  }

  return JSON.stringify({ recipes: safeRecipes(avoid, diet).slice(0, 3) });
}
