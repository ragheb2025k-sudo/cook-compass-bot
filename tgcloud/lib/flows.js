// tgcloud/lib/flows.js — the decision engine flows: sequential recipe cards
// (✅ همینه! / ❌ بعدی), Rescue Mode ("نجات مواد در حال فساد"), the
// "گردونه شانس" randomizer and the «🍽 دسته‌بندی غذاها» category browser.
// All state round-trips through the sessions table.

import { editMessageText, editMessageTextSmart, sendMessage, answerCb } from './telegram.js';
import { decideKb, decideExhaustedKb, randomKb, catsKb, catKb, MENU_ROW } from './keyboards.js';
import {
  decideHeader,
  dishPicked,
  DECIDE_EXHAUSTED,
  RANDOM_SPINNING,
  PANTRY_LOADING,
  randomResultHeader,
  RECIPE_PARSE_ERROR,
  CATS_HEADER,
  catPickHeader,
  CAT_EMPTY,
} from './texts.js';
import { getProfile, setSession, getSession, addHistory, getRecentDishes, aiQuota } from './store.js';
import { saveServedRecipes } from './saved.js';
import { recipeCard } from './format.js';
import { DIET_OPTIONS, SKILL_OPTIONS, FILTERS, RECIPES_PER_ROUND } from './config.js';
import { startOnboarding } from './onboarding.js';
import { AI_QUOTA_ALERT } from './texts.js';
import { pickCandidates, bankRandom, bankRecipe, bankCatCounts, bankRandomByCategory } from './bank.js';

/* ------------------------------------------------------------------ */
/* Label helpers                                                       */
/* ------------------------------------------------------------------ */

export function dietPromptOf(key) {
  return DIET_OPTIONS.find((o) => o.key === key)?.prompt ?? 'بدون محدودیت';
}

/** Free-text restrictions from the profile (حساسیت/عدم مصرف) — always an array. */
export function avoidFoodsOf(profile) {
  return Array.isArray(profile?.avoidFoods) ? profile.avoidFoods.map(String).filter(Boolean) : [];
}

export function skillPromptOf(key) {
  return SKILL_OPTIONS.find((o) => o.key === key)?.prompt ?? 'ساده';
}

export function filterPromptOf(key) {
  return FILTERS.find((f) => f.key === key)?.prompt ?? '';
}

/** Split a free-text ingredient list — canonical impl lives in util.js. */
export { parseIngredientList } from './util.js';

/** Ensure a profile exists — otherwise route the chat into onboarding. */
export async function ensureProfile(chatId, messageId = null) {
  const profile = await getProfile(chatId);
  if (profile) return profile;
  await startOnboarding(chatId, { edit: Boolean(messageId), messageId });
  return null;
}

/** Assemble the AI context from profile + session + 14-day history. */
export async function buildAiContext(tgId, profile, session, { rescueItems = null, avoid = [] } = {}) {
  const exclude = await getRecentDishes(tgId);
  const pantry = session?.pantry ?? {};
  const planq = session?.planq ?? null;
  const ctx = {
    household: profile.household,
    dietPrompt: dietPromptOf(profile.diet),
    dietKey: profile.diet ?? 'none',
    filterKeys: (pantry.filters ?? []).map((f) => String(f)),
    skillPrompt: skillPromptOf(profile.skill),
    avoidFoods: avoidFoodsOf(profile),
    items: pantry.items ?? [],
    filters: (pantry.filters ?? []).map(filterPromptOf).filter(Boolean),
    rescue: rescueItems ?? [],
    exclude,
    avoid,
    // Weekly protein/light-dinner quotas from the planner questionnaire —
    // relevant to plan generation; harmless (unused) in other prompts.
    weeklyTargets: planq ? {
      meat: Number(planq.meat ?? 0),
      fish: Number(planq.fish ?? 0),
      chicken: Number(planq.chicken ?? 0),
      light: Number(planq.light ?? 0),
    } : null,
  };
  // Debug trail for suggestion quality — visible in `npx tgcloud run` output.
  console.info('[ai ctx]', JSON.stringify({
    diet: ctx.dietPrompt,
    avoidFoods: ctx.avoidFoods,
    items: ctx.items,
    rescue: ctx.rescue,
    filters: ctx.filters.length,
    excluded: ctx.exclude.length,
    weekly: ctx.weeklyTargets,
  }));
  return ctx;
}

/**
 * AI wallet guard (Gate 4.1.3): increment the per-user daily counter and
 * render the quota alert on `messageId` when the daily limit is exhausted.
 * Returns true when the caller may proceed with the AI call.
 */
export async function aiQuotaGuard(chatId, messageId) {
  const quota = await aiQuota(chatId);
  if (quota.allowed) return true;
  if (messageId) await editMessageText(chatId, messageId, AI_QUOTA_ALERT, MENU_ROW);
  else await sendMessage(chatId, AI_QUOTA_ALERT, MENU_ROW);
  return false;
}

/* ------------------------------------------------------------------ */
/* Suggestion → sequential decision flow                               */
/* ------------------------------------------------------------------ */

/**
 * Present a round of 3 book-recipe cards with [✅ همینه!] / [❌ بعدی] buttons.
 * `messageId` is the message being edited. source: 'pantry' | 'rescue'
 *
 * 📚 The book bank (lib/recipeBank.js — 2,400+ recipes from the uploaded
 * cooking books & app) is the PRIMARY source: selection is instant, never
 * rate-limited and always a real recipe. The AI provider is only used for the
 * weekly plan (planner.js) — its pollinations free tier enforces 1 reply /
 * 45s per IP, far too flaky for the suggestion hot path.
 */
export async function presentSuggestions(chatId, messageId, session, { source = 'pantry', rescueItems = [] } = {}) {
  const profile = await ensureProfile(chatId);
  if (!profile) return;
  try {
    const ctx = await buildAiContext(chatId, profile, session, { rescueItems, avoid: session.avoid ?? [] });
    const candidates = pickCandidates({
      diet: ctx.dietKey,
      avoidFoods: ctx.avoidFoods,
      items: ctx.items,
      rescue: ctx.rescue,
      filters: ctx.filterKeys,
      exclude: ctx.exclude,
      avoid: ctx.avoid,
      count: RECIPES_PER_ROUND,
      mealOnly: true,
    });
    if (!candidates.length) throw new Error('bank empty for filters');
    const recipes = candidates.map((r) => bankRecipe(r, { household: profile.household }));
    const names = recipes.map((r) => r.name);
    console.info('[bank recipes]', names.join('، '));
    const nextSession = {
      flow: 'decide',
      source,
      rescueItems,
      recipes,
      idx: 0,
      avoid: [...(session.avoid ?? []), ...names].slice(-12),
      pantry: session.pantry ?? {},
      retryCb: 'decide',
      fromBank: true,
    };
    await setSession(chatId, nextSession);
    const card = recipeCard(recipes[0], { household: profile.household });
    await editMessageTextSmart(chatId, messageId, `${decideHeader(1, recipes.length)}\n\n${card}`, decideKb(recipes.length <= 1));
  } catch (e) {
    console.error('presentSuggestions failed:', e?.message ?? e);
    const fallbackSession = {
      flow: source === 'rescue' ? 'rescue' : 'pantry',
      pantry: session.pantry ?? {},
      rescueItems,
      retryCb: source === 'rescue' ? 'rescue' : 'suggest',
    };
    await setSession(chatId, fallbackSession);
    await editMessageText(chatId, messageId, RECIPE_PARSE_ERROR, retryKb(fallbackSession.retryCb));
  }
}

function retryKb(action) {
  return [[{ text: '🔄 تلاش دوباره', callback_data: `retry:${action}` }], [{ text: '🏠 منوی اصلی', callback_data: 'menu' }]];
}

/** [❌ بعدی] — advance the decision queue. */
export async function decideNext(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'decide' || !session.recipes?.length) {
    await answerCb(cqId, 'این ردیف منقضی شده؛ از منوی اصلی شروع کن', true);
    return;
  }
  const profile = await getProfile(chatId);
  const idx = Math.min(session.idx + 1, session.recipes.length - 1);
  if (session.idx >= session.recipes.length - 1) {
    // Last card already shown → exhausted view.
    await setSession(chatId, { ...session, flow: 'decide', exhausted: true });
    await editMessageText(chatId, messageId, DECIDE_EXHAUSTED, decideExhaustedKb());
    await answerCb(cqId);
    return;
  }
  await setSession(chatId, { ...session, idx, exhausted: false });
  const card = recipeCard(session.recipes[idx], { household: profile?.household });
  await editMessageTextSmart(
    chatId,
    messageId,
    `${decideHeader(idx + 1, session.recipes.length)}\n\n${card}`,
    decideKb(idx >= session.recipes.length - 1),
  );
  await answerCb(cqId);
}

/** [✅ همینه!] — commit the dish to the 14-day history. */
export async function decidePick(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'decide' || !session.recipes?.length) {
    await answerCb(cqId, 'این ردیف منقضی شده؛ از منوی اصلی شروع کن', true);
    return;
  }
  const profile = await getProfile(chatId);
  const recipe = session.recipes[Math.min(session.idx, session.recipes.length - 1)];
  await addHistory(chatId, recipe.name, session.source === 'rescue' ? 'rescue' : 'decide', {
    timeMin: recipe.timeMin,
    difficulty: recipe.difficulty,
  });
  // 📚 Auto-save the picked card to the permanent archive («📚 دستورهای من»).
  await saveServedRecipes(chatId, [recipe], session.source === 'rescue' ? 'rescue' : 'decide');
  await setSession(chatId, { flow: null, pantry: session.pantry ?? {}, retryCb: null });
  const card = recipeCard(recipe, { household: profile?.household, pickedNote: dishPicked(recipe.name) });
  await editMessageTextSmart(chatId, messageId, card, MENU_ROW);
  await answerCb(cqId, 'ثبت شد ✅ نوش جان!');
}

/** [🔄 پیشنهادهای تازه] — regenerate, excluding everything shown so far. */
export async function decideAgain(chatId, messageId, cqId = null) {
  const session = (await getSession(chatId)) ?? {};
  const profile = await ensureProfile(chatId);
  if (!profile) return;
  if (cqId) await answerCb(cqId);
  await editMessageText(chatId, messageId, PANTRY_LOADING, null);
  await presentSuggestions(chatId, messageId, { ...session, flow: 'pantry' }, {
    source: session.source === 'rescue' ? 'rescue' : 'pantry',
    rescueItems: session.rescueItems ?? [],
  });
}

/* ------------------------------------------------------------------ */
/* Rescue mode — "نجات مواد در حال فساد"                               */
/* ------------------------------------------------------------------ */

/** Kick off rescue generation from stored items (used by retry too). */
export async function runRescue(chatId, messageId, items) {
  const session = (await getSession(chatId)) ?? {};
  await setSession(chatId, { flow: 'rescue', rescueItems: items, pantry: session.pantry ?? {} });
  await presentSuggestions(chatId, messageId, { pantry: session.pantry ?? {} }, { source: 'rescue', rescueItems: items });
}

/* ------------------------------------------------------------------ */
/* Randomizer — "گردونه شانس"                                          */
/* ------------------------------------------------------------------ */

export async function startRandom(chatId, messageId, cqId = null) {
  const profile = await ensureProfile(chatId, messageId);
  if (!profile) return;
  if (cqId) await answerCb(cqId);
  await editMessageText(chatId, messageId, RANDOM_SPINNING, null);
  const session = (await getSession(chatId)) ?? {};
  try {
    const avoid = [
      ...(session.random?.recipe ? [session.random.recipe.name] : []),
      ...(session.avoid ?? []),
    ];
    const ctx = await buildAiContext(chatId, profile, session, { avoid: [...new Set(avoid)] });
    // 📚 Bank-first wheel: instant, real book recipe, respects diet/avoids.
    const r = bankRandom({
      diet: ctx.dietKey,
      avoidFoods: ctx.avoidFoods,
      exclude: ctx.exclude,
      avoid: ctx.avoid,
    });
    if (!r) throw new Error('bank empty');
    const recipe = bankRecipe(r, { household: profile.household });
    const funLine = pickFunLine(recipe.name);
    await setSession(chatId, { flow: 'random', random: { recipe, funLine }, pantry: session.pantry ?? {} });
    // 📚 Each spin result lands in the permanent archive too — spinning again
    // replaces the card in chat, so the archive is its only durable copy.
    await saveServedRecipes(chatId, [recipe], 'random');
    const card = recipeCard(recipe, { household: profile.household });
    await editMessageTextSmart(chatId, messageId, `${randomResultHeader(funLine)}\n\n${card}`, randomKb());
  } catch (e) {
    console.error('startRandom failed:', e?.message ?? e);
    await setSession(chatId, { flow: null, pantry: session.pantry ?? {}, retryCb: 'random' });
    await editMessageText(chatId, messageId, RECIPE_PARSE_ERROR, retryKb('random'));
  }
}

/* Playful one-liners for the wheel — Persian, generic, dish-agnostic. */
const FUN_LINES = [
  'قرعه به نام این غذا افتاد — دست به آپرون!',
  'گردونه گفت این! نوش جان 🍽',
  'این انتخابِ ستاره‌ها بود — امشب همین می‌پزیم!',
  'قدم بعدی ساده‌ست: مواد روی میز، تابه روی شعله 🔥',
  'شانس امروزت با این غذاست — امتحانش کن!',
];
function pickFunLine() {
  return FUN_LINES[Math.floor(Math.random() * FUN_LINES.length)];
}

export async function randomAdd(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'random' || !session.random?.recipe) {
    await answerCb(cqId, 'این کارت منقضی شده', true);
    return;
  }
  const profile = await getProfile(chatId);
  const { recipe } = session.random;
  await addHistory(chatId, recipe.name, 'random', { timeMin: recipe.timeMin, difficulty: recipe.difficulty });
  // 📚 Auto-save the committed wheel pick to the permanent archive.
  await saveServedRecipes(chatId, [recipe], 'random');
  await setSession(chatId, { flow: null, pantry: session.pantry ?? {} });
  const card = recipeCard(recipe, { household: profile?.household, pickedNote: dishPicked(recipe.name) });
  await editMessageTextSmart(chatId, messageId, card, MENU_ROW);
  await answerCb(cqId, 'ثبت شد ✅ نوش جان!');
}

/* ------------------------------------------------------------------ */
/* Category browse — «🍽 دسته‌بندی غذاها»                                */
/* The bank's 23 food-type categories (خورشت، سوپ، دسر، نوشیدنی و…)
   surfaced to the user: pick a category → random book recipe from it,
   with «بعدی» for more from the same category. Same archive/history
   semantics as the wheel: every served card auto-saves, commits also
   enter the 14-day anti-repeat history. */
/* ------------------------------------------------------------------ */

/** Category picker — grid of all categories with live counts. */
export async function openCats(chatId, messageId = null, cqId = null) {
  if (cqId) await answerCb(cqId);
  const session = (await getSession(chatId)) ?? {};
  await setSession(chatId, { ...session, flow: null, retryCb: null });
  const cats = bankCatCounts();
  if (messageId) await editMessageText(chatId, messageId, CATS_HEADER, catsKb(cats));
  else await sendMessage(chatId, CATS_HEADER, catsKb(cats));
}

/** One random recipe card from category `catIdx` (bankCatCounts() order). */
export async function openCategory(chatId, messageId, catIdx, cqId = null) {
  const profile = await ensureProfile(chatId, messageId);
  if (!profile) return;
  if (cqId) await answerCb(cqId);
  const cats = bankCatCounts();
  const meta = cats[catIdx];
  if (!meta || meta.count === 0) {
    if (messageId) await editMessageText(chatId, messageId, CAT_EMPTY, catsKb(cats));
    else await sendMessage(chatId, CAT_EMPTY, catsKb(cats));
    return;
  }
  const session = (await getSession(chatId)) ?? {};
  try {
    const catAvoid = [...(session.cat?.idx === catIdx ? session.cat.avoid ?? [] : [])];
    const ctx = await buildAiContext(chatId, profile, session, { avoid: catAvoid });
    const r = bankRandomByCategory(meta.cat, {
      diet: ctx.dietKey,
      avoidFoods: ctx.avoidFoods,
      exclude: ctx.exclude,
      avoid: ctx.avoid,
    });
    if (!r) {
      // Everything diet-blocked or category empty — friendly redirect, no error.
      if (messageId) await editMessageText(chatId, messageId, CAT_EMPTY, catsKb(cats));
      else await sendMessage(chatId, CAT_EMPTY, catsKb(cats));
      return;
    }
    const recipe = bankRecipe(r, { household: profile.household });
    const seen = (session.cat?.idx === catIdx ? session.cat.seen ?? 0 : 0) + 1;
    await setSession(chatId, {
      flow: 'cat',
      cat: { idx: catIdx, seen, avoid: [...catAvoid, recipe.name].slice(-14), recipe },
      pantry: session.pantry ?? {},
      retryCb: null,
    });
    // 📚 Each served card lands in the permanent archive too.
    await saveServedRecipes(chatId, [recipe], 'cat');
    const card = recipeCard(recipe, { household: profile.household });
    await editMessageTextSmart(chatId, messageId, `${catPickHeader(meta.emoji, meta.cat, seen)}\n\n${card}`, catKb());
  } catch (e) {
    console.error('openCategory failed:', e?.message ?? e);
    await setSession(chatId, { flow: null, pantry: session.pantry ?? {}, retryCb: `cat:${catIdx}` });
    if (messageId) await editMessageText(chatId, messageId, RECIPE_PARSE_ERROR, retryKb(`cat:${catIdx}`));
    else await sendMessage(chatId, RECIPE_PARSE_ERROR, MENU_ROW);
  }
}

/** [🔄 بعدی از این دسته] — another recipe from the shown category. */
export async function catNext(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'cat' || session.cat == null) {
    await answerCb(cqId, 'این ردیف منقضی شده؛ از منوی اصلی شروع کن', true);
    return;
  }
  return await openCategory(chatId, messageId, session.cat.idx, cqId);
}

/** [✅ ثبت در سابقه پخت] — commit the shown card to the 14-day history. */
export async function catAdd(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'cat' || !session.cat?.recipe) {
    await answerCb(cqId, 'این کارت منقضی شده', true);
    return;
  }
  const profile = await getProfile(chatId);
  const recipe = session.cat.recipe;
  await addHistory(chatId, recipe.name, 'cat', { timeMin: recipe.timeMin, difficulty: recipe.difficulty });
  await saveServedRecipes(chatId, [recipe], 'cat');
  await setSession(chatId, { flow: null, pantry: session.pantry ?? {} });
  const card = recipeCard(recipe, { household: profile?.household, pickedNote: dishPicked(recipe.name) });
  await editMessageTextSmart(chatId, messageId, card, MENU_ROW);
  await answerCb(cqId, 'ثبت شد ✅ نوش جان!');
}
