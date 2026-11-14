// tgcloud/lib/ai.js — the AI service layer.
//
// Async, timeout-guarded calls to any OpenAI-compatible chat-completions
// endpoint (the config in lib/config.js decides which provider). The contract
// is strict JSON output: every domain function builds a Persian prompt, parses
// defensively (fences, stray prose), validates and normalizes the shape, and
// retries once on malformed output — so a flaky model never crashes a flow.

import { fetch } from 'sdk';
import { AI } from './config.js';
import { clampInt } from './util.js';
import { mockChatReply } from './mock.js';

export class AiError extends Error {}

/* ------------------------------------------------------------------ */
/* Low-level chat call                                                 */
/* ------------------------------------------------------------------ */

const HAS_ABORT_TIMEOUT =
  typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';

async function callChat({ system, user, maxTokens, temperature = AI.temperature }) {
  // Mock provider — deterministic offline double (see lib/mock.js).
  if (AI.provider === 'mock') {
    return mockChatReply(user);
  }
  const messages = [
    { role: AI.systemRole === 'assistant' ? 'assistant' : 'system', content: system },
    { role: 'user', content: user },
  ];
  const body = {
    model: AI.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    ...AI.extraBody,
  };
  const headers = {
    'Content-Type': 'application/json',
    ...AI.headers,
  };
  if (AI.apiKey) headers.Authorization = `Bearer ${AI.apiKey}`;
  const res = await fetch(`${AI.baseUrl}${AI.chatPath ?? '/chat/completions'}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    ...(HAS_ABORT_TIMEOUT ? { signal: AbortSignal.timeout(AI.timeoutMs) } : {}),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new AiError(`AI HTTP ${res.status}: ${detail.slice(0, 300)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content || !String(content).trim()) throw new AiError('AI empty response');
  return String(content);
}

/** Pull the first JSON object out of arbitrary model prose. */
function extractJson(text) {
  let t = String(text ?? '').trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new AiError('AI_NO_JSON');
  return JSON.parse(t.slice(start, end + 1));
}

/** chat → JSON with one corrective retry on malformed output. */
async function chatJson(system, user, { maxTokens, temperature } = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const prompt =
        attempt === 1
          ? user
          : `${user}\n\n⚠️ خروجی قبلی JSON معتبر نبود. این بار فقط و فقط یک شیء JSON معتبر برگردان؛ بدون توضیح، بدون بک‌تیک، بدون متن اضافه.`;
      const raw = await callChat({ system, user: prompt, maxTokens, temperature });
      return extractJson(raw);
    } catch (e) {
      lastError = e;
      console.warn(`ai attempt ${attempt} failed:`, e?.message ?? e);
    }
  }
  throw new AiError(lastError?.message ?? 'AI_FAILED');
}

/* ------------------------------------------------------------------ */
/* Normalization & validation                                          */
/* ------------------------------------------------------------------ */

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeRecipe(raw) {
  const r = raw ?? {};
  const ingredients = asArray(r.ingredients)
    .slice(0, 18)
    .map((i) => ({
      name: String(i?.name ?? i ?? '').trim().slice(0, 80),
      qty: String(i?.qty ?? '').trim().slice(0, 60),
    }))
    .filter((i) => i.name);
  const steps = asArray(r.steps)
    .slice(0, 14)
    .map((s) => String(s ?? '').trim().slice(0, 350))
    .filter(Boolean);
  if (!String(r.name ?? '').trim()) throw new AiError('recipe without name');
  if (ingredients.length === 0 || steps.length === 0) throw new AiError('recipe missing ingredients/steps');
  return {
    name: String(r.name).trim().slice(0, 120),
    timeMin: clampInt(r.time_min ?? r.timeMin, 5, 300, 30),
    difficulty: String(r.difficulty ?? 'متوسط').trim().slice(0, 40) || 'متوسط',
    why: String(r.why ?? '').trim().slice(0, 180),
    ingredients,
    steps,
    chefTip: String(r.chef_tip ?? r.chefTip ?? '').trim().slice(0, 220),
  };
}

const RECIPES_SPEC = JSON.stringify({
  recipes: [
    {
      name: 'نام غذا',
      time_min: 25,
      difficulty: 'آسان',
      why: 'یک جمله کوتاه چرا این غذا الان مناسب است',
      ingredients: [{ name: 'مرغ', qty: '۴۰۰ گرم' }],
      steps: ['مرحله کوتاه و کاربردی'],
      chef_tip: 'یک نکته کلیدی',
    },
  ],
});

/* ------------------------------------------------------------------ */
/* Prompt builders                                                     */
/* ------------------------------------------------------------------ */

const CHEF_SYSTEM = [
  'تو «سرآشپزِ قطب‌نمای آشپزی» هستی؛ یک سرآشپز و مشاور غذای ایرانی، خلاق، عمل‌گرا و خوش‌ذوق.',
  'همیشه غذاهای واقع‌بینانه و در دسترسِ آشپزخانه ایرانی پیشنهاد می‌دهی؛ مواد را دقیق و بر حسب گرم/لیوان/قاشق برای تعداد نفراتِ کاربر حساب می‌کنی.',
  'مراحل پخت کوتاه، شماره‌گذاری‌شده، بدون حاشیه و کاملاً کاربردی هستند.',
  'قوانین قطعی خروجی:',
  '- فقط و فقط یک شیء JSON معتبر برگردان؛ بدون هیچ متن اضافه، بدون markdown و بدون بک‌تیک.',
  '- نام غذاها و همه متن‌ها فارسیِ روان است.',
  '- هرگز از غذاهای فهرست «ممنوعه» استفاده نمی‌کنی.',
  '- اگر کاربر پرهیز غذایی (حساسیت یا عدم مصرف) ثبت کرده است، حتی مقدار جزئی از آن ماده یا مشتقات آن هم در مواد لازمِ هیچ دستوری نمی‌آید — حساسیت جدی است.',
  '- مقادیر مواد لازم را دقیقاً برای تعداد نفراتِ ذکرشده حساب می‌کنی.',
].join('\n');

function baseContextLines(ctx) {
  const lines = [];
  lines.push(`- تعداد نفرات: ${ctx.household} نفر (مقادیر مواد دقیقاً برای همین تعداد)`);
  lines.push(`- محدودیت غذایی: ${ctx.dietPrompt}`);
  if (ctx.avoidFoods?.length) {
    lines.push(`- 🚫 پرهیزهای غذایی کاربر (حساسیت/عدم مصرف) — مطلقاً هیچ ماده‌ای از این‌ها و هیچ غذایی حاوی آن‌ها در هیچ دستوری نباشد: ${ctx.avoidFoods.join('، ')}`);
  }
  lines.push(`- سطح آشپزی: ${ctx.skillPrompt}`);
  if (ctx.items?.length) lines.push(`- مواد موجود در آشپزخانه (اولویت با همین‌ها): ${ctx.items.join('، ')}`);
  if (ctx.rescue?.length) {
    lines.push(`- ⚠️ حالت نجات اضطراری: اولویت مطلق با این موادِ در حال فساد است و هر دستور باید حول همین‌ها باشد: ${ctx.rescue.join('، ')}`);
    lines.push('- در حالت نجات دستورها باید حداکثر ۳۰ دقیقه باشند');
  }
  if (ctx.filters?.length) {
    lines.push('- فیلترهای الزامی کاربر:');
    for (const f of ctx.filters) lines.push(`  * ${f}`);
  }
  if (ctx.exclude?.length) lines.push(`- غذاهای ممنوعه (هرگز پیشنهاد نده، اخیراً پخته شده‌اند): ${ctx.exclude.join('، ')}`);
  if (ctx.avoid?.length) lines.push(`- این‌ها را هم در این دور تکرار نکن (همین جلسه دیده شده‌اند): ${ctx.avoid.join('، ')}`);
  return lines;
}

function recipesUserPrompt(ctx, count) {
  const lines = ['یک درخواست پیشنهاد غذا با مشخصات زیر:'];
  lines.push(...baseContextLines(ctx));
  if (!ctx.items?.length && !ctx.rescue?.length) {
    lines.push('- مواد موجود مشخص نشده؛ با مواد معمول و همیشگی آشپزخانه ایرانی پیشنهاد بده');
  }
  lines.push('');
  lines.push(`دستور پخت‌ها باید کاملاً متفاوت و از ${count} دسته یا سبک مختلف باشند.`);
  lines.push('خروجی: دقیقاً یک شیء JSON با دقیقاً همین ساختار و همین کلیدها:');
  lines.push(RECIPES_SPEC);
  lines.push(`تعداد recipes دقیقاً ${count} تا باشد.`);
  return lines.join('\n');
}

function randomUserPrompt(ctx) {
  const lines = ['یک درخواست «گردونه شانس» با مشخصات زیر:'];
  lines.push(...baseContextLines(ctx));
  lines.push('- یک غذا فقط؛ قطعی و متفاوت از همیشه، کمی خلاقانه ولی کاملاً عمل‌پذیر');
  lines.push('');
  lines.push('خروجی: دقیقاً یک شیء JSON با همین ساختار:');
  lines.push(JSON.stringify({
    recipe: {
      name: 'نام غذا',
      time_min: 30,
      difficulty: 'آسان',
      ingredients: [{ name: 'مرغ', qty: '۴۰۰ گرم' }],
      steps: ['مرحله کوتاه'],
      chef_tip: 'یک نکته',
    },
    fun_line: 'یک جمله کوتاه و بامزه درباره این انتخاب',
  }));
  return lines.join('\n');
}

function planUserPrompt(ctx, mode) {
  const lines = ['یک درخواست «برنامه غذایی هفتگی» با مشخصات زیر:'];
  lines.push(...baseContextLines(ctx));
  const t = ctx.weeklyTargets;
  if (t) {
    lines.push(`- 🎯 سهمیه پروتئین این هفته (الزام دقیق کاربر): گوشت قرمز دقیقاً ${t.meat} وعده، ماهی دقیقاً ${t.fish} وعده، مرغ دقیقاً ${t.chicken} وعده — عدد صفر یعنی مطلقاً هیچ وعده‌ای شامل آن ماده نباشد؛ بیش از سهمیه هم مطلقاً نباشد. بقیه وعده‌ها با حبوبات، تخم‌مرغ، لبنیات و سبزیجات چیده شود.`);
    lines.push(`- 🥗 دقیقاً ${t.light} وعده شام «سبک» باشد (سوپ، سالاد کامل، املت یا کوکوی سبک، نان و پنیر و سبزی، ماست‌ورزه و…) و همان روزها dinner_light=true باشد.`);
  }
  lines.push('- ⚠️ قاعده برنج: در یک روز هرگز دو وعده برنجی نباشد — اگر ناهار برنجی است (پلو، چلو، کته، ته‌چین یا هر غذایی که با برنج سرو می‌شود)، شامِ همان روز حتماً غیربرنجی باشد (ماکارونی، غذای نانی، خوراک با نان و…)');
  lines.push('- 🔁 برای «هر» وعده یک جایگزین واقع‌بینانه و کاملاً متفاوت پیشنهاد بده (lunch_alt و dinner_alt): غذایی که با همان مواد درست می‌شود ولی ماهیتش فرق دارد (مثلاً به‌جای برنجی، نانی؛ به‌جای خورش، کوکو)');
  lines.push('- 🌈 تنوع بالا: هیچ اسم غذایی در هفته تکرار نشود؛ سبک‌ها متنوع باشند (خورش، پلو، ماکارونی، کوکو/املت، خوراک ساده، سوپ، غذای بین‌المللی ساده و…)');
  lines.push('- 💰 اقتصادی بودن: گوشت قرمز و ماهی فقط تا سقف سهمیه کاربر؛ بقیه هفته با پروتئین‌های ارزان و گیاهی');
  lines.push('- برنامه: ۷ روز، هر روز ناهار و شام (فقط نام غذاها + جایگزین‌ها، نه دستور کامل)');
  lines.push('- تنوع داشته باشد؛ خوراک‌های تکراری یا شبیه هم نباشد');
  if (mode === 'batch') {
    lines.push('- حالت «پخت و فریز»: حداقل ۲ پایه مشترک تعریف کن؛ پایه را با پورت دوبرابر در یک روز بپز و ۲ روز بعد در غذای کاملاً متفاوتی از آن استفاده کن (مثلاً مایه ماکارونی یا مرغ ریش‌ریش). اینها را در batch_notes به فارسی توضیح بده');
  } else {
    lines.push('- حالت ساده: بدون پایه مشترک؛ batch_notes آرایه خالی باشد');
  }
  lines.push('');
  lines.push('خروجی: دقیقاً یک شیء JSON با همین ساختار و همین کلیدها:');
  lines.push(JSON.stringify({
    days: [{ n: 1, lunch: 'نام ناهار', lunch_alt: 'جایگزین ناهار', dinner: 'نام شام', dinner_alt: 'جایگزین شام', dinner_light: false }],
    shopping_list: [{ category: 'پروتئین', items: [{ name: 'مرغ', qty: '۱ کیلوگرم' }] }],
    batch_notes: ['روز ۱ مرغ را دو برابر بپز و نصفش را فریز کن'],
  }));
  lines.push('قواعد: day عدد ۱ تا ۷ است (۱ = شنبه)؛ دقیقاً ۷ روز؛ برای هر روز lunch، lunch_alt، dinner و dinner_alt بنویس؛ dinner_light فقط برای شام‌های سبک true باشد؛ دسته‌های shopping_list فقط از این‌ها باشند: پروتئین، سبزیجات و میوه، حبوبات و غلات، لبنیات، سایر؛ خروجی فشرده باشد.');
  return lines.join('\n');
}

/* ------------------------------------------------------------------ */
/* Domain functions                                                    */
/* ------------------------------------------------------------------ */

function buildCtx(ctx) {
  return {
    household: ctx.household ?? 2,
    dietPrompt: ctx.dietPrompt ?? 'بدون محدودیت',
    skillPrompt: ctx.skillPrompt ?? 'ساده',
    avoidFoods: (ctx.avoidFoods ?? []).map(String),
    items: (ctx.items ?? []).map(String),
    rescue: (ctx.rescue ?? []).map(String),
    filters: (ctx.filters ?? []).map(String),
    exclude: (ctx.exclude ?? []).map(String),
    avoid: (ctx.avoid ?? []).map(String),
    weeklyTargets: ctx.weeklyTargets ?? null,
  };
}

/** 3 tailored recipes for the pantry / rescue flows. */
export async function generateRecipes(ctx, count = 3) {
  const c = buildCtx(ctx);
  const data = await chatJson(CHEF_SYSTEM, recipesUserPrompt(c, count), { maxTokens: AI.maxTokensRecipes });
  const recipes = asArray(data.recipes)
    .slice(0, count)
    .map(normalizeRecipe);
  if (recipes.length === 0) throw new AiError('no recipes parsed');
  return recipes;
}

/** One definitive recipe for the randomizer (گردونه شانس). */
export async function generateRandom(ctx) {
  const c = buildCtx(ctx);
  const data = await chatJson(CHEF_SYSTEM, randomUserPrompt(c), { maxTokens: AI.maxTokensRandom });
  const recipe = normalizeRecipe(data.recipe ?? data);
  const funLine = String(data.fun_line ?? '').trim().slice(0, 140);
  return { recipe, funLine };
}

/** 7-day plan skeleton: day names + alternatives + aggregated categorized
 *  shopping list. Recipes are generated on demand per day (generateDayRecipes)
 *  so every serverless invocation stays short.
 *  Hard rules are validated here and one corrective retry is issued when the
 *  model violates them (rice-per-day rule, dish repetition). */
export async function generatePlan(ctx, mode) {
  const c = buildCtx(ctx);
  const basePrompt = planUserPrompt(c, mode);

  let data = null;
  let lastIssues = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const prompt = attempt === 1
      ? basePrompt
      : `${basePrompt}\n\n⚠️ خروجی قبلی این قواعد را نقض کرد: ${lastIssues.join('؛ ')}. این بار با رعایت دقیق همه قواعد دوباره برنامه را بچین.`;
    data = await chatJson(CHEF_SYSTEM, prompt, {
      maxTokens: AI.maxTokensPlan,
      temperature: 0.75,
    });
    lastIssues = validatePlanDays(data);
    if (lastIssues.length === 0) break;
    console.warn('plan rule violations:', lastIssues.join(' | '));
  }

  const days = asArray(data.days)
    .map((d, i) => ({
      n: clampInt(d?.n, 1, 7, i + 1),
      lunch: String(d?.lunch ?? '').trim(),
      lunchAlt: String(d?.lunch_alt ?? d?.lunchAlt ?? '').trim().slice(0, 120),
      dinner: String(d?.dinner ?? '').trim(),
      dinnerAlt: String(d?.dinner_alt ?? d?.dinnerAlt ?? '').trim().slice(0, 120),
      dinnerLight: Boolean(d?.dinner_light ?? d?.dinnerLight ?? false),
    }))
    .sort((a, b) => a.n - b.n);
  const shoppingList = asArray(data.shopping_list)
    .slice(0, 8)
    .map((cat) => ({
      category: String(cat?.category ?? 'سایر').trim().slice(0, 60),
      items: asArray(cat?.items)
        .slice(0, 20)
        .map((i) => ({
          name: String(i?.name ?? i ?? '').trim().slice(0, 80),
          qty: String(i?.qty ?? '').trim().slice(0, 60),
        }))
        .filter((i) => i.name),
    }))
    .filter((cat) => cat.items.length > 0);
  const batchNotes = asArray(data.batch_notes)
    .slice(0, 6)
    .map((n) => String(n ?? '').trim().slice(0, 220))
    .filter(Boolean);
  if (days.length < 5 || shoppingList.length === 0) {
    throw new AiError('plan incomplete');
  }
  return { mode, days, recipes: {}, shoppingList, batchNotes };
}

const RICE_DISH_RE = /پلو|چلو|کته|ته\u200cچین|ته چین|برنج|بریانی/;

/** Deterministic check of the user's non-negotiable plan rules. */
function validatePlanDays(data) {
  const issues = [];
  const days = asArray(data.days);
  const names = [];
  for (const d of days) {
    const lunch = String(d?.lunch ?? '').trim();
    const dinner = String(d?.dinner ?? '').trim();
    if (lunch && dinner) {
      // Rule: never two rice-based meals in the same day.
      if (RICE_DISH_RE.test(lunch) && RICE_DISH_RE.test(dinner)) {
        issues.push(`روز ${d?.n}: ناهار («${lunch}») و شام («${dinner}») هر دو برنجی‌اند — شام آن روز باید غیربرنجی شود`);
      }
    }
    if (lunch) names.push(lunch);
    if (dinner) names.push(dinner);
  }
  // Rule: no dish repeated within the week (variety).
  const seen = new Set();
  const dupes = [];
  for (const name of names) {
    if (seen.has(name)) dupes.push(name);
    seen.add(name);
  }
  if (dupes.length) issues.push(`این غذاها تکرار شده‌اند: ${dupes.join('، ')}`);
  return issues;
}

/** The 2 recipes (lunch + dinner) for one plan day, generated on demand. */
export async function generateDayRecipes(ctx, plan, dayN) {
  const c = buildCtx(ctx);
  const day = plan.days.find((d) => d.n === dayN) ?? plan.days[0];
  const lines = [`دستور پخت دو وعده‌ی روز ${dayN} برنامه هفتگی را کامل بنویس:`];
  lines.push(...baseContextLines(c));
  lines.push(`- ☀️ ناهار: دقیقاً با نام «${day.lunch}»`);
  lines.push(`- 🌙 شام: دقیقاً با نام «${day.dinner}»`);
  if (day.dinnerLight) lines.push('- 🥗 شام این روز «سبک» است: دستور را سبک، کم‌چرب و کم‌حجم بچین (بدون برنج و غذای سنگین)');
  if (RICE_DISH_RE.test(day.lunch)) lines.push('- ناهار این روز برنجی است؛ در مواد لازم همین غذا بمان و برای شام برنج نپز');
  lines.push('');
  lines.push('خروجی: دقیقاً یک شیء JSON با همین ساختار و همین کلیدها:');
  lines.push(JSON.stringify({
    recipes: [
      { slot: 'lunch', name: day.lunch, time_min: 30, difficulty: 'آسان', ingredients: [{ name: 'مرغ', qty: '۴۰۰ گرم' }], steps: ['مرحله کوتاه'], chef_tip: 'یک نکته' },
      { slot: 'dinner', name: day.dinner, time_min: 30, difficulty: 'آسان', ingredients: [{ name: 'مرغ', qty: '۴۰۰ گرم' }], steps: ['مرحله کوتاه'], chef_tip: 'یک نکته' },
    ],
  }));
  lines.push('دقیقاً ۲ دستور؛ اول lunch بعد dinner؛ نام‌ها عیناً همین باشد.');
  const data = await chatJson(CHEF_SYSTEM, lines.join('\n'), {
    maxTokens: AI.maxTokensDay ?? 1800,
    temperature: 0.7,
  });
  const recipes = asArray(data.recipes).slice(0, 2).map(normalizeRecipe);
  if (recipes.length === 0) throw new AiError('no day recipes');
  const out = {};
  let i = 0;
  for (const slot of ['lunch', 'dinner']) {
    out[slot] = recipes[i] ?? recipes[0];
    i++;
  }
  return out;
}
