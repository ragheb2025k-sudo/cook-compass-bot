// tgcloud/lib/bank.js — query layer over lib/recipeBank.js (the book-built
// recipe corpus: «سرآشپز پاپیون» + کتاب‌های آشپزی آپلودشده).
//
// Everything the bot proposes is anchored to this bank:
//   • pickCandidates   — ranked recipes for the pantry/rescue flows
//   • bankCatalog      — compact categorized menu for the weekly-plan prompt
//   • buildBankPlan    — deterministic 7-day plan (AI-failure fallback)
//   • bankRecipeByName — fuzzy lookup for plan-day recipes fallback
//   • bankRecipe       — bank record → card-shaped recipe (fallback rendering)
//
// All matching is done on normalized Persian text (ZWNJ/spaces collapsed) so
// user words like «تخم مرغ» match ingredient «تخم‌مرغ».

import { RECIPE_BANK, BANK_META } from './recipeBank.js';

/** Re-exported for stable-index consumers (saved.js manual-save callbacks). */
export { RECIPE_BANK };

/* ------------------------------------------------------------------ */
/* Stable per-record index                                              */
/*                                                                      */
/* Every bank record gets a load-time index `_i`. Inline keyboards carry */
/* this index in callback data (sv:save:<idx>) so a «💾 ذخیره» button on  */
/* an OLD chat message still resolves to the exact same dish even after  */
/* later spins replaced the session state. The bank array is static      */
/* per deployment, so the index is stable.                              */
/* ------------------------------------------------------------------ */
for (let i = 0; i < RECIPE_BANK.length; i++) {
  if (RECIPE_BANK[i]._i === undefined) RECIPE_BANK[i]._i = i;
}

/* ------------------------------------------------------------------ */
/* Corpus protein-tag safety pass                                       */
/* ------------------------------------------------------------------ */

// Names that explicitly declare themselves vegetarian must never carry a
// meat/fish/chicken protein tag (the book corpus mis-tags a few, e.g.
// «کباب گیاهی» tagged meat) — otherwise vegetarians lose those dishes and
// worst-case get them filtered into «veg» pools of the weekly plan.
const VEG_NAME_RE = /گیاهی|وگان|بدون ?گوشت/;
for (const r of RECIPE_BANK) {
  if (VEG_NAME_RE.test(r.n) && Array.isArray(r.p) && r.p.length) {
    r.p = r.p.filter((t) => t !== 'meat' && t !== 'fish' && t !== 'chicken');
    if (!r.p.includes('veg')) r.p.push('veg');
  }
}

/* ------------------------------------------------------------------ */
/* Normalization                                                        */
/* ------------------------------------------------------------------ */

const ZWNJ = /\u200c/g;

export function normFa(s) {
  return String(s ?? '').replace(ZWNJ, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Spaceless key — «تخم مرغ» and «تخم‌مرغ» become the same string. */
function tight(s) {
  return String(s ?? '').replace(ZWNJ, '').replace(/\s+/g, '').toLowerCase();
}

function includesTight(haystack, needle) {
  const h = tight(haystack);
  const n = tight(needle);
  return n.length > 1 && h.includes(n);
}

/* ------------------------------------------------------------------ */
/* Diet & avoid filtering                                               */
/* ------------------------------------------------------------------ */

const DIET_BLOCKERS = {
  vegetarian: ['fish', 'chicken', 'meat'],
  no_red_meat: ['meat'],
  no_dairy: ['dairy'],
};

// Name-based protein detection (tested against the tight form: no spaces/ZWNJ).
// Deliberately conservative: کباب/فیله are ambiguous (کباب گیاهی، فیله ماهی)
// and stay out of the meat net — the corpus p-tags carry those cases.
const MEAT_NAME_RE = /گوشت|قورمه|قیمه|بره|گوسفند|گوساله|استیک|جگر|جگروز|سوسیس|کالباس|ژامبون|دنبی/;
const CHICKEN_NAME_RE = /مرغ|جوجه|بوقلمون|اردک|کبک|بلدرچین|بال/;
const FISH_NAME_RE = /ماهی|میگو|قزل|سالمون|تن‌ماهی|تنماهی/;

/** Diet + free-text avoid-foods check against a bank record. */
export function bankAllows(r, { diet = 'none', avoidFoods = [] } = {}) {
  const blocked = DIET_BLOCKERS[diet] ?? [];
  // Name-level safety net: a handful of corpus records carry a protein tag
  // that contradicts the dish name («بال با طعم پنیر بلوچیز» tagged veg).
  // The diet check consults BOTH the tag and the name, so a mis-tag can
  // never serve meat/chicken/fish to a restricted user.
  const nameHay = tight(r.n);
  for (const t of blocked) {
    if ((r.p ?? []).includes(t)) return false;
    if (t === 'meat' && MEAT_NAME_RE.test(nameHay)) return false;
    if (t === 'chicken' && CHICKEN_NAME_RE.test(nameHay)) return false;
    if (t === 'fish' && FISH_NAME_RE.test(nameHay)) return false;
  }
  if (avoidFoods?.length) {
    const hay = [r.n, ...(r.i ?? []).map((i) => i[0])].join(' | ');
    for (const a of avoidFoods) {
      if (includesTight(hay, a)) return false;
      // dairy-generics: «لبنیات» matches dairy-tagged recipes
      if (/لبنیات|محصولات لبنی/.test(tight(a)) && (r.p ?? []).includes('dairy')) return false;
    }
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* Scoring — pantry coverage, rescue priority, situational filters      */
/* ------------------------------------------------------------------ */

const MEAL_CATS = new Set([
  'آش و سوپ', 'خورشت', 'پلو و چلو', 'کباب', 'کوکو و املت', 'کتلت و شامی',
  'دلمه و کوفته', 'خوراک مرغ', 'خوراک گوشت', 'ماهی و میگو', 'غذای گیاهی',
  'ماکارونی و پاستا', 'غذای سریع', 'سالاد', 'پیش‌غذا و بورانی', 'غذای ملل',
  'غذای محلی', 'غذای رژیمی', 'غذای کودک', 'غذای گیاهی',
]);

export function isMeal(r) {
  return MEAL_CATS.has(r.c);
}

const ONEPOT_CATS = new Set(['آش و سوپ', 'خورشت', 'ماکارونی و پاستا', 'دلمه و کوفته', 'غذای گیاهی', 'پلو و چلو']);
const LIGHT_CATS = new Set(['آش و سوپ', 'سالاد', 'کوکو و املت', 'پیش‌غذا و بورانی', 'غذای رژیمی']);
const WORLD_CATS = new Set(['غذای ملل', 'ماکارونی و پاستا', 'غذای سریع']);

/** Coverage score of a recipe against pantry/rescue items (0..3+). */
function coverage(r, items) {
  if (!items?.length) return 0;
  const hay = [tight(r.n), ...(r.i ?? []).map((i) => tight(i[0]))].join(' | ');
  let score = 0;
  for (const it of items) {
    const t = tight(it);
    if (t.length < 2) continue;
    if (hay.includes(t)) score += 2;
  }
  return score;
}

function filterScore(r, filters) {
  let s = 0;
  for (const f of filters) {
    if (f === 'fast' && (r.t ?? 60) <= 30) s += 3;
    if (f === 'onepot' && ONEPOT_CATS.has(r.c)) s += 3;
    if (f === 'budget' && !(r.p ?? []).includes('meat') && !(r.p ?? []).includes('fish')) s += 3;
    if (f === 'world' && WORLD_CATS.has(r.c)) s += 4;
  }
  return s;
}

/**
 * Rank + pick bank recipes for a round of suggestions.
 * Deterministic ordering with light random tie-breaking so repeated taps
 * do not return the identical trio forever.
 */
export function pickCandidates({
  diet = 'none', avoidFoods = [], items = [], rescue = [], filters = [],
  exclude = [], avoid = [], count = 3, mealOnly = true, minScore = 0,
} = {}) {
  const excluded = new Set([...(exclude ?? []), ...(avoid ?? [])].map(tight).filter(Boolean));
  const pool = RECIPE_BANK.filter(
    (r) =>
      (!mealOnly || isMeal(r)) &&
      bankAllows(r, { diet, avoidFoods }) &&
      !excluded.has(tight(r.n)),
  );
  const scored = [];
  const hasSignal = Boolean((items ?? []).length || (rescue ?? []).length || (filters ?? []).length);
  for (const r of pool) {
    const cov = coverage(r, [...(rescue ?? []), ...(items ?? [])]);
    const fs = filterScore(r, filters ?? []);
    let score = cov * 3 + fs;
    // With pantry/filter signals, require at least a faint match; without any,
    // the whole pool is fair game (pure discovery rounds).
    if (hasSignal && cov === 0 && fs === 0) continue;
    score += Math.random() * 1.2; // tie-break noise
    scored.push([score, r]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  const picked = [];
  const catsUsed = new Set();
  for (const [, r] of scored) {
    if (picked.length >= count) break;
    // keep the round diverse: at most 2 recipes from the same category
    const same = picked.filter((p) => p.c === r.c).length;
    if (same >= 2) continue;
    picked.push(r);
  }
  return picked;
}

/** One random bank recipe for the wheel — respects diet/avoids/exclusions. */
export function bankRandom({ diet = 'none', avoidFoods = [], exclude = [], avoid = [] } = {}) {
  const excluded = new Set([...(exclude ?? []), ...(avoid ?? [])].map(tight).filter(Boolean));
  const pool = RECIPE_BANK.filter(
    (r) => bankAllows(r, { diet, avoidFoods }) && !excluded.has(tight(r.n)),
  );
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/* ------------------------------------------------------------------ */
/* Category browse — «🍽 دسته‌بندی غذاها»                                 */
/* ------------------------------------------------------------------ */

/** Canonical display order of the bank's food-type categories: mains first,
 *  then light/appetizer, then sweet/bakery/drinks. The array index is the
 *  stable callback id (`cat:<idx>`), so never reorder without a migration. */
export const BANK_CATS = [
  'خورشت', 'پلو و چلو', 'کباب', 'آش و سوپ',
  'خوراک مرغ', 'خوراک گوشت', 'ماهی و میگو',
  'کوکو و املت', 'کتلت و شامی', 'دلمه و کوفته',
  'ماکارونی و پاستا', 'غذای گیاهی', 'غذای سریع',
  'غذای ملل', 'غذای محلی', 'غذای رژیمی', 'غذای کودک',
  'سالاد', 'پیش‌غذا و بورانی',
  'دسر و شیرینی', 'نان و خمیر', 'مربا و ترشی', 'نوشیدنی',
];

const CAT_EMOJI = {
  'خورشت': '🍲', 'پلو و چلو': '🍚', 'کباب': '🍢', 'آش و سوپ': '🥣',
  'خوراک مرغ': '🍗', 'خوراک گوشت': '🥩', 'ماهی و میگو': '🐟',
  'کوکو و املت': '🍳', 'کتلت و شامی': '🥙', 'دلمه و کوفته': '🧆',
  'ماکارونی و پاستا': '🍝', 'غذای گیاهی': '🥦', 'غذای سریع': '⚡',
  'غذای ملل': '🌍', 'غذای محلی': '🗺', 'غذای رژیمی': '🥬', 'غذای کودک': '🍼',
  'سالاد': '🥗', 'پیش‌غذا و بورانی': '🥒',
  'دسر و شیرینی': '🍰', 'نان و خمیر': '🍞', 'مربا و ترشی': '🍯', 'نوشیدنی': '🥤',
};

export function catEmoji(cat) {
  return CAT_EMOJI[cat] ?? '🍽';
}

/** [{ cat, emoji, count }] in BANK_CATS order (unknown categories from the
 *  corpus are appended so nothing is ever hidden from the picker). */
export function bankCatCounts() {
  const counts = new Map();
  for (const r of RECIPE_BANK) if (r.c) counts.set(r.c, (counts.get(r.c) ?? 0) + 1);
  const cats = [...BANK_CATS];
  for (const c of counts.keys()) if (!cats.includes(c)) cats.push(c);
  return cats.map((cat) => ({ cat, emoji: catEmoji(cat), count: counts.get(cat) ?? 0 }));
}

/** Random recipe from one category — diet/avoid-aware, excluding recent
 *  dishes and names already shown in this browse round. When every recipe
 *  of a small category has been seen, the full category becomes fair game
 *  again so the flow never dead-ends. */
export function bankRandomByCategory(cat, { diet = 'none', avoidFoods = [], exclude = [], avoid = [] } = {}) {
  const excluded = new Set([...(exclude ?? []), ...(avoid ?? [])].map(tight).filter(Boolean));
  const base = RECIPE_BANK.filter((r) => r.c === cat && bankAllows(r, { diet, avoidFoods }));
  if (!base.length) return null;
  const fresh = base.filter((r) => !excluded.has(tight(r.n)));
  const pool = fresh.length ? fresh : base;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Fuzzy lookup — exact tight match first, then contains-either-way. */
export function bankRecipeByName(name) {
  const k = tight(name);
  if (!k) return null;
  let hit = RECIPE_BANK.find((r) => tight(r.n) === k);
  if (hit) return hit;
  hit = RECIPE_BANK.find((r) => tight(r.n).includes(k) || k.includes(tight(r.n)));
  return hit ?? null;
}

/* ------------------------------------------------------------------ */
/* Catalog for prompts                                                  */
/* ------------------------------------------------------------------ */

const PROTEIN_LETTER = { meat: '🥩', chicken: '🍗', fish: '🐟', veg: '🥦' };

/** Compact categorized dish catalog (names + protein glyph + time) for the
 *  plan prompt. Meal categories only; desserts/drinks never enter the week. */
export function bankCatalog({ diet = 'none', avoidFoods = [], maxPerCat = 14, maxDishes = 320 } = {}) {
  const cats = new Map();
  let total = 0;
  for (const r of RECIPE_BANK) {
    if (!isMeal(r) || !bankAllows(r, { diet, avoidFoods })) continue;
    const arr = cats.get(r.c) ?? [];
    if (arr.length < maxPerCat) {
      arr.push(r);
      cats.set(r.c, arr);
      total++;
      if (total >= maxDishes) break;
    }
  }
  const lines = [];
  for (const [cat, arr] of cats) {
    const items = arr
      .map((r) => `${r.n}${(r.p ?? []).some((t) => t !== 'veg' && t !== 'dairy' && t !== 'egg') ? PROTEIN_LETTER[(r.p ?? []).find((t) => t === 'meat' || t === 'chicken' || t === 'fish')] ?? '' : ''}`)
      .join('، ');
    lines.push(`• ${cat}: ${items}`);
  }
  return lines;
}

/* ------------------------------------------------------------------ */
/* Bank record → card recipe (fallback rendering, no AI needed)         */
/* ------------------------------------------------------------------ */

const CAT_WHYS = {
  'آش و سوپ': 'ساده و گرم، مخصوص روزهایی که دل یه غذای راحت می‌خواد',
  'خورشت': 'کلاسیکِ میز ایرانی — با برنج عالی جفت می‌شه',
  'پلو و چلو': 'برنجیِ کامل و سیرکننده برای ناهار خانوادگی',
  'کباب': 'طعم آتش و جعفری — انتخاب قطعی برای مهمانی یا شام خوش‌نام',
  'کوکو و املت': 'سریع، اقتصادی و همیشه مورد علاقه‌ی همه',
  'کتلت و شامی': 'دلچسب و راحت؛ با نان یا برنج جور است',
  'دلمه و کوفته': 'پرجمعیت و سیرکننده؛ مناسب شام خانوادگی',
  'خوراک مرغ': 'پروتئین محبوب و سریع‌الپخت برای شام',
  'خوراک گوشت': 'مُعَطّر و جدی؛ برای وعده‌ای که باید درست جا بیفتد',
  'ماهی و میگو': 'سبک و مفید؛ به‌ویژه روزهای ماهی‌خوری',
  'غذای گیاهی': 'بدون گوشت ولی کامل و سیرکننده',
  'ماکارونی و پاستا': 'محبوبِ همه‌سنی، سریع و کم‌دردسر',
  'غذای سریع': 'برای وقتی گرسنه‌ای و وقت کم است',
  'سالاد': 'تازه و سبک؛ خوب برای شام‌های نیم‌شب یا کنار غذای اصلی',
  'پیش‌غذا و بورانی': 'شروع دلچسب یا همراهِ غذای اصلی',
  'دسر و شیرینی': 'پایان‌بخش شیرینِ میز',
  'نان و خمیر': 'تازه از فر — خوش‌عطر و دعوت‌کننده',
  'مربا و ترشی': 'همراهِ همیشگی صبحانه و غذاهای ایرانی',
  'نوشیدنی': 'خنک یا گرم، جورِ حال و هوای الان',
  'غذای ملل': 'سفرِ کم‌هزینه بدون خروج از آشپزخانه',
  'غذای محلی': 'طعم‌های اصیل شهرهای ایران',
  'غذای رژیمی': 'سبک و کم‌چرب، بدون قربانی کردن سلیقه',
  'غذای کودک': 'ملایم و ساده برای کوچولوها',
};

/** Bank record → the exact shape lib/format.js renders (normalizeRecipe shape). */
export function bankRecipe(r, { household = 2 } = {}) {
  if (!r) return null;
  return {
    name: r.n,
    bankIdx: r._i ?? null,
    category: r.c ?? '',
    timeMin: r.t ?? 40,
    difficulty: r.d ?? 'متوسط',
    why: CAT_WHYS[r.c] ?? 'انتخاب‌شده از کتاب‌های آشپزی با توجه به مواد تو',
    ingredients: (r.i ?? []).map(([name, qty]) => ({ name, qty })),
    steps: r.s ?? [],
    chefTip: r.tip ?? '',
    household,
  };
}

/* ------------------------------------------------------------------ */
/* Deterministic weekly plan (AI-failure fallback)                      */
/* ------------------------------------------------------------------ */

const RICE_RE = /پلو|چلو|کته|ته ?چین|بریانی|برنج/;
const MEAL_PROTEINS = ['meat', 'fish', 'chicken'];

function poolFor(bank, diet, avoidFoods, pred) {
  return bank.filter((r) => isMeal(r) && bankAllows(r, { diet, avoidFoods }) && pred(r));
}

const NAME_PROTEIN = [
  [/ماهی|میگو|قزل|سالمون|تن ماهی|تن ماهی/, 'fish'],
  [/مرغ|جوجه|بوقلمون|اردک|کبک/, 'chicken'],
  [/گوشت|قیمه|قورمه|کباب|استیک|فیله|بره|گوسفند|گوساله|کوفته/, 'meat'],
];

function nameProtein(name) {
  for (const [rx, p] of NAME_PROTEIN) if (rx.test(name)) return p;
  return null;
}

function shuffleSeeded(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Build a 7-day plan from the bank, honoring the same hard rules as the AI
 *  path: protein quotas (0 = none), exact light-dinner count, max one rice
 *  meal per day, no repeated dishes, an alternative for every meal. */
export function buildBankPlan({ diet = 'none', avoidFoods = [], exclude = [], targets = null, mode = 'simple' } = {}) {
  const t = targets ?? { meat: 2, fish: 1, chicken: 2, light: 2 };
  const excluded = new Set((exclude ?? []).map(tight).filter(Boolean));
  const all = () => poolFor(RECIPE_BANK, diet, avoidFoods, () => true).filter((r) => !excluded.has(tight(r.n)));
  const base = all();
  if (base.length < 20) return null;
  const used = new Set();

  const pools = {
    any: shuffleSeeded(base.filter((r) => !LIGHT_CATS.has(r.c) || t.light > 0)),
    light: shuffleSeeded(base.filter((r) => LIGHT_CATS.has(r.c))),
    // veg pool also rejects name-visible proteins — mis-tagged corpus
    // entries (tag says veg, name says مرغ) must never reach a vegetarian.
    veg: shuffleSeeded(base.filter((r) => !(r.p ?? []).some((p) => MEAL_PROTEINS.includes(p)) && !nameProtein(r.n))),
    meat: shuffleSeeded(base.filter((r) => (r.p ?? []).includes('meat'))),
    fish: shuffleSeeded(base.filter((r) => (r.p ?? []).includes('fish'))),
    chicken: shuffleSeeded(base.filter((r) => (r.p ?? []).includes('chicken'))),
  };
  // Prefer name-visible protein dishes inside each protein pool so users and
  // validators see «مرغ/ماهی/گوشت» right in the dish name.
  for (const p of MEAL_PROTEINS) {
    const byName = pools[p].filter((r) => nameProtein(r.n) === p);
    const rest = pools[p].filter((r) => nameProtein(r.n) !== p);
    pools[p] = [...shuffleSeeded(byName), ...rest];
  }

  function take(poolKey, { rice = null, light = false } = {}) {
    const pool = pools[poolKey] ?? pools.any;
    let idx = pool.findIndex((r) => {
      if (used.has(tight(r.n))) return false;
      if (rice === false && RICE_RE.test(r.n)) return false;
      if (rice === true && !RICE_RE.test(r.n)) return false;
      if (light && !LIGHT_CATS.has(r.c)) return false;
      return true;
    });
    if (idx === -1) {
      idx = pool.findIndex((r) => !used.has(tight(r.n)) && rice !== true);
      if (idx === -1) return null;
    }
    const r = pool[idx];
    used.add(tight(r.n));
    return r;
  }

  function altFor(r) {
    const protein = MEAL_PROTEINS.find((p) => (r.p ?? []).includes(p));
    const pool = protein ? pools[protein] : pools.veg.length ? pools.veg : pools.any;
    return pool.find((x) => !used.has(tight(x.n)) && tight(x.n) !== tight(r.n)) ?? null;
  }

  const quotas = { meat: t.meat ?? 0, fish: t.fish ?? 0, chicken: t.chicken ?? 0 };
  const days = [];
  let lightLeft = t.light ?? 0;

  for (let n = 1; n <= 7; n++) {
    // ---- lunch: consume a protein quota when available, else veg
    let lunch = null;
    for (const p of MEAL_PROTEINS) {
      if (quotas[p] > 0 && pools[p].length) {
        lunch = take(p);
        if (lunch) { quotas[p]--; break; }
      }
    }
    if (!lunch) lunch = take('veg');
    if (!lunch) lunch = take('any');
    if (!lunch) return null;

    // ---- dinner: light when quota remains, else non-light, never 2 rice meals
    let dinner = null;
    let dinnerLight = false;
    if (lightLeft > 0) {
      dinner = take('light', { rice: RICE_RE.test(lunch.n) ? false : null, light: true });
      if (dinner) { dinnerLight = true; lightLeft--; }
    }
    if (!dinner) {
      dinner = take('any', { rice: RICE_RE.test(lunch.n) ? false : null });
    }
    if (!dinner) dinner = take('veg');
    if (!dinner) return null;

    const lunchAlt = altFor(lunch) ?? pools.any.find((x) => !used.has(tight(x.n)));
    if (lunchAlt) used.add(tight(lunchAlt.n));
    const dinnerAlt = altFor(dinner) ?? pools.any.find((x) => !used.has(tight(x.n)));
    if (dinnerAlt) used.add(tight(dinnerAlt.n));

    days.push({
      n,
      lunch: lunch.n,
      lunchAlt: lunchAlt?.n ?? 'ماکارونی با سس ساده',
      dinner: dinner.n,
      dinnerAlt: dinnerAlt?.n ?? 'املت گوجه‌فرنگی',
      dinnerLight,
    });
  }

  const batchNotes = mode === 'batch'
    ? [
        'روز ۱: مرغ را دو برابر بپز و نصفش را ریش‌ریش فریز کن؛ روز ۴ در خوراک مرغ استفاده کن.',
        'روز ۲: سس ماکارونی را دو برابر بپز؛ نصفش را فریز کن و روز ۵ با ماکارونی تازه استفاده کن.',
        'پیازداغ و سبزی سرخ‌شده را یک‌جا برای کل هفته آماده کن تا پخت‌ها سریع‌تر شود.',
      ]
    : [];

  return { mode, days, recipes: {}, shoppingList: [], batchNotes };
}

/* ------------------------------------------------------------------ */
/* Deterministic shopping list (AI-failure fallback)                    */
/* ------------------------------------------------------------------ */

const ING_CATS = [
  // Vegetables FIRST — compound names must not leak into protein/spice
  // buckets: «فلفل دلمه» contains فلفل (spice) and «سبزی دلمه»/«نودل»
  // contain دل (organ meat); first match wins.
  [/فلفل(?: |\u200c)?دلمه|سبزی(?: |\u200c)?دلمه|فلفل سبز|فلفل داغ|فلفل کبابی|توت ?فرنگی|برگ ?گشنیز|گشنیز تازه/, 'سبزیجات و میوه'],
  [/مرغ|جوجه|گوشت|قیمه|بره|گوسفند|گوساله|استیک|بوقلمون|سوسیس|کالباس|ژامبون|(?:^|\s)دل(?:\s|$)|قلوه|جگر|سویا/, 'پروتئین'],
  [/ماهی|میگو|تن ماهی|قزل|سالمون/, 'پروتئین'],
  [/تخم ?مرغ/, 'پروتئین'],
  [/برنج|ماکارونی|پاستا|رشته|آرد|نان|جوی|جو |بلغور|گندم|نودل|ورمه|لازانیا|بیسکویت|سمولینا/, 'حبوبات و غلات'],
  [/عدس|لوبیا|نخود|باقلا|ماش|لپه|حبوبات/, 'حبوبات و غلات'],
  // Dairy gets its own bucket (شیر with negative lookahead so شیرینی /
  // شیراز / plant milks don't land here — those are covered in «سایر»).
  [/شیر(?!ینی|از| ?(?:نارگیل|بادام))|ماست|پنیر|خامه|کشک|کره(?! ?بادام)/, 'لبنیات'],
  [/روغن|مایونز|سرکه|آب لیمو|آبلیمو|رب|سس|زعفران|زردچوبه|دارچین|ادویه|نمک|فلفل سیاه|فلفل قرمز|فلفل سفید|پودر فلفل|زیره|گلاب|شکر|قند|هل|زنجبیل|پودر گشنیز|تخم گشنیز|برگ بو|آویشن|شیرینی|شیر نارگیل|شیر بادام|کره بادام|کاری|گردو|بادام|پسته|فندق|کشمش|توت(?! ?فرنگی)|آجیل/, 'سایر'],
];

/** Junk pseudo-ingredients from loosely parsed book recipes (section
 *  headers like «مواد سس :») and staples everyone has — never listed.
 *  Matched against the tight form (no spaces/ZWNJ, lowercased). */
const SKIP_ING = /^(آب|آبجوش|آبسرد|آبجوشیده|آبیخ|موادسس|موادلازم|دستورپخت|طرزتهیه|مواددستور)($|:|‌)/;

function ingCategory(name) {
  for (const [rx, cat] of ING_CATS) if (rx.test(name)) return cat;
  return 'سبزیجات و میوه';
}

export { ingCategory };

/** Deterministic weekly shopping list from the bank ingredients of the
 *  planned dishes (skips dishes that are not in the corpus). */
export function buildBankShoppingList(plan, { household = 2, items = [] } = {}) {
  const have = new Set((items ?? []).map(tight));
  const byCat = new Map();
  const seen = new Set();
  for (const d of plan?.days ?? []) {
    for (const name of [d.lunch, d.dinner]) {
      const r = bankRecipeByName(name);
      if (!r) continue;
      for (const [ingName, qty] of r.i ?? []) {
        const key = tight(ingName);
        if (seen.has(key) || have.has(key) || SKIP_ING.test(key)) continue;
        seen.add(key);
        const cat = ingCategory(ingName);
        if (!byCat.has(cat)) byCat.set(cat, []);
        byCat.get(cat).push({ name: ingName, qty });
      }
    }
  }
  const order = ['پروتئین', 'سبزیجات و میوه', 'حبوبات و غلات', 'لبنیات', 'سایر'];
  const cats = [...byCat.keys()].sort((a, b) => {
    const ia = order.indexOf(a); const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return cats.map((c) => ({ category: c, items: byCat.get(c).slice(0, 16) }));
}

/* ------------------------------------------------------------------ */
/* Debug                                                                */
/* ------------------------------------------------------------------ */

export function bankStats() {
  return { ...BANK_META };
}
