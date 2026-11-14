// tgcloud/lib/flows.js — the decision engine flows: sequential recipe cards
// (✅ همینه! / ❌ بعدی), Rescue Mode ("نجات مواد در حال فساد") and the
// "گردونه شانس" randomizer. All state round-trips through the sessions table.

import { editMessageText, answerCb } from './telegram.js';
import { decideKb, decideExhaustedKb, randomKb, MENU_ROW } from './keyboards.js';
import {
  decideHeader,
  dishPicked,
  DECIDE_EXHAUSTED,
  RANDOM_SPINNING,
  PANTRY_LOADING,
  randomResultHeader,
  RECIPE_PARSE_ERROR,
} from './texts.js';
import { getProfile, setSession, getSession, addHistory, getRecentDishes } from './store.js';
import { generateRecipes, generateRandom } from './ai.js';
import { recipeCard } from './format.js';
import { DIET_OPTIONS, SKILL_OPTIONS, FILTERS, RECIPES_PER_ROUND } from './config.js';
import { startOnboarding } from './onboarding.js';

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
  const ctx = {
    household: profile.household,
    dietPrompt: dietPromptOf(profile.diet),
    skillPrompt: skillPromptOf(profile.skill),
    avoidFoods: avoidFoodsOf(profile),
    items: pantry.items ?? [],
    filters: (pantry.filters ?? []).map(filterPromptOf).filter(Boolean),
    rescue: rescueItems ?? [],
    exclude,
    avoid,
  };
  // Debug trail for suggestion quality — visible in `npx tgcloud run` output.
  console.info('[ai ctx]', JSON.stringify({
    diet: ctx.dietPrompt,
    avoidFoods: ctx.avoidFoods,
    items: ctx.items,
    rescue: ctx.rescue,
    filters: ctx.filters.length,
    excluded: ctx.exclude.length,
  }));
  return ctx;
}

/* ------------------------------------------------------------------ */
/* Suggestion → sequential decision flow                               */
/* ------------------------------------------------------------------ */

/**
 * Generate 3 tailored recipes and present the first one with
 * [✅ همینه!] / [❌ بعدی] buttons. `messageId` is the message being edited.
 * source: 'pantry' | 'rescue'
 */
export async function presentSuggestions(chatId, messageId, session, { source = 'pantry', rescueItems = [] } = {}) {
  const profile = await ensureProfile(chatId);
  if (!profile) return;
  try {
    const ctx = await buildAiContext(chatId, profile, session, { rescueItems, avoid: session.avoid ?? [] });
    const recipes = await generateRecipes(ctx, RECIPES_PER_ROUND);
    const names = recipes.map((r) => r.name);
    console.info('[ai recipes]', names.join('، '));
    const nextSession = {
      flow: 'decide',
      source,
      rescueItems,
      recipes,
      idx: 0,
      avoid: [...(session.avoid ?? []), ...names].slice(-12),
      pantry: session.pantry ?? {},
      retryCb: 'decide',
    };
    await setSession(chatId, nextSession);
    const card = recipeCard(recipes[0], { household: profile.household });
    await editMessageText(chatId, messageId, `${decideHeader(1, recipes.length)}\n\n${card}`, decideKb(recipes.length <= 1));
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
  await editMessageText(
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
  await setSession(chatId, { flow: null, pantry: session.pantry ?? {}, retryCb: null });
  const card = recipeCard(recipe, { household: profile?.household, pickedNote: dishPicked(recipe.name) });
  await editMessageText(chatId, messageId, card, MENU_ROW);
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
    const { recipe, funLine } = await generateRandom(ctx);
    await setSession(chatId, { flow: 'random', random: { recipe, funLine }, pantry: session.pantry ?? {} });
    const card = recipeCard(recipe, { household: profile.household });
    await editMessageText(chatId, messageId, `${randomResultHeader(funLine)}\n\n${card}`, randomKb());
  } catch (e) {
    console.error('startRandom failed:', e?.message ?? e);
    await setSession(chatId, { flow: null, pantry: session.pantry ?? {}, retryCb: 'random' });
    await editMessageText(chatId, messageId, RECIPE_PARSE_ERROR, retryKb('random'));
  }
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
  await editMessageText(chatId, messageId, card, MENU_ROW);
  await answerCb(cqId, 'ثبت شد ✅ نوش جان!');
}
