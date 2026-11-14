// tgcloud/lib/planner.js — weekly meal planner.
//
// Before any plan is generated the bot asks a short questionnaire (سهمیه
// گوشت قرمز / ماهی / مرغ ۰..۴ + تعداد شام سبک) — questions forbidden by the
// profile diet (vegetarian / no_red_meat) are skipped and forced to 0.
// Generation is two-phase for short serverless invocations: phase 1 generates
// the 7-day skeleton (with per-meal alternatives + light-dinner flags +
// categorized shopping list), phase 2 generates each day's lunch+dinner
// recipes on demand via the day buttons. «پخت و فریز» batch mode plans
// double-portion bases. Hard rules (max one rice meal per day, no dish
// repeated, protein quotas) are enforced in lib/ai.js.

import { editMessageText, sendMessage, answerCb } from './telegram.js';
import { planModeKb, planQKb, planKb, MENU_ROW } from './keyboards.js';
import {
  PLAN_Q_INTRO,
  PLAN_MODE_QUESTION,
  PLAN_LOADING,
  planIntro,
  planQQuestion,
  AI_QUOTA_ALERT,
  SHOPPING_LIST_HEADER,
  RECIPE_PARSE_ERROR,
  dayLoading,
  dayRecipesHeader,
} from './texts.js';
import { getProfile, savePlan, addHistoryMany, getPlan, getSession, setSession, aiQuota } from './store.js';
import { generatePlan, generateDayRecipes, generateShoppingList } from './ai.js';
import { planOverview, shoppingListText, recipeCard } from './format.js';
import { ensureProfile, buildAiContext } from './flows.js';
import { WEEKDAYS_FA, WEEKLY_PLAN } from './config.js';
import { esc } from './util.js';

/* ------------------------------------------------------------------ */
/* Questionnaire plumbing                                              */
/* ------------------------------------------------------------------ */

/** Fresh questionnaire draft — ALL four questions start unanswered (null) so
 *  nextQuestion asks meat/fish/chicken AND light. Diet-forbidden proteins are
 *  pre-answered 0 and never asked; the remaining questions form `order`. */
function freshPlanq(profile) {
  const veg = profile?.diet === 'vegetarian';
  const noRed = profile?.diet === 'no_red_meat';
  const skipped = [];
  if (veg) skipped.push('meat', 'fish', 'chicken');
  else if (noRed) skipped.push('meat');
  // ⚠️ Unanswered must be null (not 0) — 0 is a legit answer, null means "asked next".
  const planq = { meat: null, fish: null, chicken: null, light: null, mode: null, done: false, order: [] };
  for (const f of WEEKLY_PLAN.ORDER) {
    if (skipped.includes(f)) planq[f] = 0;
    else planq.order.push(f);
  }
  return planq;
}

/** Next unanswered question: { field, idx, total } or null when finished. */
function nextQuestion(planq) {
  const order = Array.isArray(planq?.order) && planq.order.length ? planq.order : [...WEEKLY_PLAN.ORDER];
  const remaining = order.filter((f) => planq[f] === null || planq[f] === undefined);
  if (remaining.length === 0) return null;
  return { field: remaining[0], idx: order.indexOf(remaining[0]) + 1, total: order.length };
}

/** Entry point of the planner — starts the questionnaire ("menu:plan" | /plan). */
export async function openPlanner(chatId, { edit = false, messageId = null } = {}) {
  const profile = await ensureProfile(chatId, edit ? messageId : null);
  if (!profile) return;
  await startPlanQ(chatId, { edit, messageId });
}

export async function startPlanQ(chatId, { edit = false, messageId = null } = {}) {
  const profile = await ensureProfile(chatId, edit ? messageId : null);
  if (!profile) return;
  const session = (await getSession(chatId)) ?? {};
  const planq = freshPlanq(profile);
  await setSession(chatId, { ...session, flow: 'planq', planq, pantry: session.pantry ?? {} });
  const q = nextQuestion(planq);
  const text = `${PLAN_Q_INTRO}\n\n${planQQuestion(q.field, q.idx, q.total)}`;
  if (edit && messageId) await editMessageText(chatId, messageId, text, planQKb(q.field));
  else await sendMessage(chatId, text, planQKb(q.field));
}

/** Handle "pq:<field>:<n>" — store the answer and advance. */
export async function handlePqCallback(chatId, messageId, data, cqId) {
  const [, field, rawVal] = data.split(':');
  if (!WEEKLY_PLAN.QUESTIONS[field]) {
    await answerCb(cqId, 'سؤال نامعتبر بود', false);
    return;
  }
  const session = (await getSession(chatId)) ?? {};
  if (session.flow !== 'planq' || !session.planq) {
    // Stale keyboard (e.g. from an old message) — restart the questionnaire here.
    await answerCb(cqId);
    await startPlanQ(chatId, { edit: true, messageId });
    return;
  }
  const value = Math.min(4, Math.max(0, Number(rawVal) || 0));
  const planq = { ...session.planq, [field]: value };
  const next = nextQuestion(planq);
  if (next) {
    await setSession(chatId, { ...session, flow: 'planq', planq });
    await editMessageText(chatId, messageId, planQQuestion(next.field, next.idx, next.total), planQKb(next.field));
    await answerCb(cqId, 'ثبت شد ✅');
    return;
  }
  planq.done = true;
  await setSession(chatId, { ...session, flow: 'planq', planq });
  await editMessageText(chatId, messageId, PLAN_MODE_QUESTION, planModeKb());
  await answerCb(cqId, 'حالا حالت برنامه رو انتخاب کن 📅');
}

/* ------------------------------------------------------------------ */
/* Phase 1 — generate the 7-day skeleton + shopping list               */
/* ------------------------------------------------------------------ */

export async function startPlan(chatId, messageId, mode, cqId = null) {
  const profile = await ensureProfile(chatId);
  if (!profile) return;
  const session = (await getSession(chatId)) ?? {};
  if (!session.planq?.done) {
    // Direct entry on a stale keyboard (or retry after session expiry) —
    // route into the questionnaire instead of generating blind.
    if (cqId) await answerCb(cqId);
    await startPlanQ(chatId, { edit: true, messageId });
    return;
  }
  if (cqId) await answerCb(cqId);
  // AI wallet guard (Gate 4.1.3) — per-user daily quota.
  const quota = await aiQuota(chatId);
  if (!quota.allowed) {
    await editMessageText(chatId, messageId, AI_QUOTA_ALERT, MENU_ROW);
    return;
  }
  await editMessageText(chatId, messageId, PLAN_LOADING, null);
  try {
    const ctx = await buildAiContext(chatId, profile, session, {});
    const plan = await generatePlan(ctx, mode);
    console.info('[ai plan]', plan.days.map((d) => `${d.n}☀️${d.lunch}/🌙${d.dinner}${d.dinnerLight ? '(سبک)' : ''}`).join(' | '));
    await savePlan(chatId, plan);
    const targets = session.planq;
    const intro = `${planIntro(mode, profile.household, targets)}\n\n${planOverview(plan, profile.household)}`;
    await editMessageText(chatId, messageId, intro, planKb(plan));
  } catch (e) {
    console.error('startPlan failed:', e?.message ?? e);
    await editMessageText(
      chatId,
      messageId,
      RECIPE_PARSE_ERROR,
      [[{ text: '🔄 تلاش دوباره', callback_data: `retry:plan:${mode}` }], [{ text: '🏠 منوی اصلی', callback_data: 'menu' }]],
    );
  }
}

/* ------------------------------------------------------------------ */
/* Phase 2 — one day's lunch+dinner recipes on demand                  */
/* ------------------------------------------------------------------ */

export async function sendDayRecipes(chatId, dayN, cqId = null) {
  const plan = await getPlan(chatId);
  if (!plan) {
    await answerCb(cqId, 'هنوز برنامه‌ای نساختی؛ اول برنامه هفتگی بساز 📅', true);
    return;
  }
  const n = Math.min(7, Math.max(1, Number(dayN) || 1));
  const recipesMap = (plan.recipes && typeof plan.recipes === 'object') ? plan.recipes : {};
  const existing = recipesMap[String(n)];

  // Already generated — resend instantly without an AI call.
  if (existing?.lunch && existing?.dinner) {
    if (cqId) await answerCb(cqId);
    await sendDayCards(chatId, n, existing, null, plan.days?.find((d) => d.n === n) ?? null);
    return;
  }

  if (cqId) await answerCb(cqId, 'دارم دستورهای این روز رو می‌نویسم...');
  // AI wallet guard (Gate 4.1.3) — per-user daily quota.
  const quota = await aiQuota(chatId);
  if (!quota.allowed) {
    await sendMessage(chatId, AI_QUOTA_ALERT, MENU_ROW);
    return;
  }
  const sent = await sendMessage(chatId, dayLoading(n), null);
  try {
    const profile = await getProfile(chatId);
    const session = (await getSession(chatId)) ?? {};
    const ctx = await buildAiContext(chatId, profile, session, {});
    const dayRecipes = await generateDayRecipes(ctx, plan, n);
    recipesMap[String(n)] = dayRecipes;
    await savePlan(chatId, { ...plan, recipes: recipesMap });
    // Register the day's dishes so the 14-day no-repeat window covers them.
    await addHistoryMany(chatId, [dayRecipes.lunch.name, dayRecipes.dinner.name], 'plan');
    await sendDayCards(chatId, n, dayRecipes, sent?.message_id ?? null, plan.days?.find((d) => d.n === n) ?? null);
  } catch (e) {
    console.error(`sendDayRecipes day ${n} failed:`, e?.message ?? e);
    const errorKb = [[{ text: '🔄 تلاش دوباره', callback_data: `retry:day:${n}` }], [{ text: '🏠 منوی اصلی', callback_data: 'menu' }]];
    if (sent?.message_id) await editMessageText(chatId, sent.message_id, RECIPE_PARSE_ERROR, errorKb);
    else await sendMessage(chatId, RECIPE_PARSE_ERROR, errorKb);
  }
}

async function sendDayCards(chatId, n, dayRecipes, loadingMessageId = null, planDay = null) {
  const profile = await getProfile(chatId);
  const label = WEEKDAYS_FA[n - 1] ?? `روز ${n}`;
  const lunchNote = `📍 ☀️ ناهار روز ${n} — ${label}${planDay?.lunchAlt ? `\n🔁 جایگزین پیشنهادی: ${esc(planDay.lunchAlt)}` : ''}`;
  const dinnerNote = `📍 🌙 شام روز ${n} — ${label}${planDay?.dinnerLight ? ' 🥗 (سبک)' : ''}${planDay?.dinnerAlt ? `\n🔁 جایگزین پیشنهادی: ${esc(planDay.dinnerAlt)}` : ''}`;
  const lunchCard = recipeCard(dayRecipes.lunch, {
    household: profile?.household,
    headerNote: lunchNote,
  });
  const dinnerCard = recipeCard(dayRecipes.dinner, {
    household: profile?.household,
    headerNote: dinnerNote,
  });
  const text = `${dayRecipesHeader(n)}\n\n${lunchCard}\n\n${dinnerCard}`;
  if (loadingMessageId) {
    await editMessageText(chatId, loadingMessageId, text, MENU_ROW);
  } else {
    await sendMessage(chatId, text, MENU_ROW);
  }
}

/** Re-send the categorized shopping list — data "pl:shop".
 *  Plans ship with an EMPTY list (phase 1 stays inside the ~30s invocation
 *  budget); the list is generated on demand here in its own invocation. */
export async function sendShoppingList(chatId, cqId) {
  const plan = await getPlan(chatId);
  if (!plan) {
    await answerCb(cqId, 'هنوز برنامه‌ای نساختی؛ اول برنامه هفتگی بساز 📅', true);
    return;
  }
  const needsGen = !Array.isArray(plan.shoppingList) || plan.shoppingList.length === 0;
  if (cqId) await answerCb(cqId, needsGen ? 'دارم لیست خرید رو می‌چینم... 🛒' : undefined);
  if (needsGen) {
    try {
      const profile = await getProfile(chatId);
      const session = (await getSession(chatId)) ?? {};
      const ctx = await buildAiContext(chatId, profile, session, {});
      const shoppingList = await generateShoppingList(ctx, plan);
      plan.shoppingList = shoppingList;
      await savePlan(chatId, plan); // cached — next press sends instantly
    } catch (e) {
      console.error('shopping list generation failed:', e?.message ?? e);
      return await sendMessage(chatId, RECIPE_PARSE_ERROR, [
        [{ text: '🔄 تلاش دوباره', callback_data: 'retry:shop' }],
        [{ text: '🏠 منوی اصلی', callback_data: 'menu' }],
      ]);
    }
  }
  const text = `${SHOPPING_LIST_HEADER}\n${shoppingListText(plan.shoppingList)}`;
  await sendMessage(chatId, text, planKb(plan));
}
