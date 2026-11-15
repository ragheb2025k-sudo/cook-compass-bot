// tgcloud/lib/flows.js — the decision engine flows: sequential recipe cards
// (✅ همینه! / ❌ بعدی), Rescue Mode ("نجات مواد در حال فساد"), the
// "گردونه شانس" randomizer and the «🍽 دسته‌بندی غذاها» category browser.
// All state round-trips through the sessions table.

import { editMessageText, editMessageTextSmart, sendMessageSmart, sendMessage, answerCb } from './telegram.js';
import { decideKb, decideExhaustedKb, randomKb, catsKb, catKb, MENU_ROW } from './keyboards.js';
import {
  decideHeader,
  rescueDeckHeader,
  dishPicked,
  DECIDE_EXHAUSTED,
  PANTRY_LOADING,
  randomResultHeader,
  RECIPE_PARSE_ERROR,
  CATS_HEADER,
  catPickHeader,
  CAT_EMPTY,
} from './texts.js';
import { getProfile, setSession, getSession, addHistory, getRecentDishes, aiQuota } from './store.js';
import { recipeCard } from './format.js';
import { DIET_OPTIONS, SKILL_OPTIONS, FILTERS, RECIPES_PER_ROUND } from './config.js';
import { startOnboarding } from './onboarding.js';
import { AI_QUOTA_ALERT } from './texts.js';
import { pickCandidates, bankRandom, bankRecipe, bankCatCounts, bankRandomByCategory } from './bank.js';
import { rescueRecipesFor } from './rescue.js';
import { saveCallbackFor } from './saved.js';

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
 * Present a round of book-recipe cards (plus rescue ideas in rescue mode)
 * with [✅ همینه!] / [❌ بعدی] buttons.
 * `messageId` is the message being edited (card 1 replaces the loading
 * placeholder); later cards are NEW messages so every served recipe STAYS
 * in the chat (user request: nothing the bot sends ever disappears).
 *
 * 🚑 Rescue mode: ideas come first from the leftover-rescue KB (lib/rescue.js)
 * — cooked leftovers like «برنج پخته دیشب» never match book ingredients, so
 * the KB is the primary source; bank recipes scored on the canonical base
 * terms («برنج») fill the rest of the deck.
 *
 * 📚 The book bank (lib/recipeBank.js — 2,400+ recipes) is the PRIMARY source
 * for pantry rounds: instant, never rate-limited, always a real recipe.
 */
export async function presentSuggestions(chatId, messageId, session, { source = 'pantry', rescueItems = [] } = {}) {
  const profile = await ensureProfile(chatId);
  if (!profile) return;
  try {
    const ctx = await buildAiContext(chatId, profile, session, { rescueItems, avoid: session.avoid ?? [] });
    let recipes = [];
    if (source === 'rescue') {
      const { ideas, bases } = rescueRecipesFor(rescueItems, { household: profile.household });
      recipes.push(...ideas);
      // Bank fill: matched on base terms; needs at least one idea OR bank hit.
      const bankCount = ideas.length ? Math.max(1, RECIPES_PER_ROUND - ideas.length + 2) : RECIPES_PER_ROUND;
      const candidates = pickCandidates({
        diet: ctx.dietKey,
        avoidFoods: ctx.avoidFoods,
        items: ctx.items,
        rescue: bases,
        filters: ctx.filterKeys,
        exclude: ctx.exclude,
        avoid: ctx.avoid,
        count: bankCount,
        mealOnly: true,
      });
      recipes.push(...candidates.map((r) => bankRecipe(r, { household: profile.household })));
    } else {
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
      recipes = candidates.map((r) => bankRecipe(r, { household: profile.household }));
    }
    if (!recipes.length) throw new Error('empty deck');
    const names = recipes.map((r) => r.name);
    console.info('[deck recipes]', names.join('، '));
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
    const header = source === 'rescue'
      ? rescueDeckHeader(1, recipes.length)
      : decideHeader(1, recipes.length);
    await editMessageTextSmart(chatId, messageId, `${header}\n\n${card}`, decideKb(recipes.length <= 1, saveCallbackFor(recipes[0])));
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

/** [❌ بعدی] — advance the decision queue. Every next card is a NEW message
 *  so the previously shown recipes stay in the chat as their own messages. */
export async function decideNext(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'decide' || !session.recipes?.length) {
    await answerCb(cqId, 'این ردیف منقضی شده؛ از منوی اصلی شروع کن', true);
    return;
  }
  const profile = await getProfile(chatId);
  const idx = Math.min(session.idx + 1, session.recipes.length - 1);
  if (session.idx >= session.recipes.length - 1) {
    // Last card already shown → exhausted view (in place; earlier cards stay).
    await setSession(chatId, { ...session, flow: 'decide', exhausted: true });
    await editMessageText(chatId, messageId, DECIDE_EXHAUSTED, decideExhaustedKb());
    await answerCb(cqId);
    return;
  }
  await setSession(chatId, { ...session, idx, exhausted: false });
  const card = recipeCard(session.recipes[idx], { household: profile?.household });
  const header = session.source === 'rescue'
    ? rescueDeckHeader(idx + 1, session.recipes.length)
    : decideHeader(idx + 1, session.recipes.length);
  await sendMessageSmart(
    chatId,
    `${header}\n\n${card}`,
    decideKb(idx >= session.recipes.length - 1, saveCallbackFor(session.recipes[idx])),
  );
  await answerCb(cqId);
}

/** [✅ همینه!] — commit the dish to the 14-day history. NO auto-save: the
 *  user bookmark recipes manually with 💾. The card stays as its message. */
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

/**
 * Wheel spin — the result lands as a NEW message EVERY time: the previous
 * card stays in the chat untouched, and the pressed message (menu or old
 * card) is never overwritten (user request: spinning again must not erase
 * the earlier recipe). Nothing is auto-saved — 💾 does that manually.
 */
export async function startRandom(chatId, messageId, cqId = null) {
  const profile = await ensureProfile(chatId, messageId);
  if (!profile) return;
  if (cqId) await answerCb(cqId);
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
    const card = recipeCard(recipe, { household: profile.household });
    await sendMessageSmart(chatId, `${randomResultHeader(funLine)}\n\n${card}`, randomKb(saveCallbackFor(recipe)));
  } catch (e) {
    console.error('startRandom failed:', e?.message ?? e);
    await setSession(chatId, { flow: null, pantry: session.pantry ?? {}, retryCb: 'random' });
    if (messageId) await editMessageText(chatId, messageId, RECIPE_PARSE_ERROR, retryKb('random'));
    else await sendMessage(chatId, RECIPE_PARSE_ERROR, retryKb('random'));
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

/** One random recipe card from category `catIdx` — lands as a NEW message
 *  every time: the category picker (and previous cards) stay untouched so
 *  the user keeps browsing without losing anything. */
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
    const card = recipeCard(recipe, { household: profile.household });
    await sendMessageSmart(chatId, `${catPickHeader(meta.emoji, meta.cat, seen)}\n\n${card}`, catKb(saveCallbackFor(recipe)));
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

/** [✅ ثبت در سابقه پخت] — commit the shown card to the 14-day history.
 *  No auto-save — the 💾 button on the card is the deliberate bookmark. */
export async function catAdd(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'cat' || !session.cat?.recipe) {
    await answerCb(cqId, 'این کارت منقضی شده', true);
    return;
  }
  const profile = await getProfile(chatId);
  const recipe = session.cat.recipe;
  await addHistory(chatId, recipe.name, 'cat', { timeMin: recipe.timeMin, difficulty: recipe.difficulty });
  await setSession(chatId, { flow: null, pantry: session.pantry ?? {} });
  const card = recipeCard(recipe, { household: profile?.household, pickedNote: dishPicked(recipe.name) });
  await editMessageTextSmart(chatId, messageId, card, MENU_ROW);
  await answerCb(cqId, 'ثبت شد ✅ نوش جان!');
}
