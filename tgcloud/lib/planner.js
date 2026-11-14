// tgcloud/lib/planner.js — weekly meal planner (two-phase for short serverless
// invocations): phase 1 generates the 7-day skeleton (day names + categorized
// shopping list), phase 2 generates each day's lunch+dinner recipes on demand
// via the day buttons. «پخت و فریز» batch mode plans double-portion bases.

import { editMessageText, sendMessage, answerCb } from './telegram.js';
import { planModeKb, planKb, MENU_ROW } from './keyboards.js';
import {
  PLAN_MODE_QUESTION,
  PLAN_LOADING,
  planIntro,
  SHOPPING_LIST_HEADER,
  RECIPE_PARSE_ERROR,
  dayLoading,
  dayRecipesHeader,
} from './texts.js';
import { getProfile, savePlan, addHistoryMany, getPlan } from './store.js';
import { generatePlan, generateDayRecipes } from './ai.js';
import { planOverview, shoppingListText, recipeCard } from './format.js';
import { ensureProfile, buildAiContext } from './flows.js';
import { WEEKDAYS_FA } from './config.js';

/** Open the planner question — data "menu:plan" or /plan. */
export async function openPlanner(chatId, { edit = false, messageId = null } = {}) {
  const profile = await ensureProfile(chatId, edit ? messageId : null);
  if (!profile) return;
  const text = PLAN_MODE_QUESTION;
  if (edit && messageId) await editMessageText(chatId, messageId, text, planModeKb());
  else await sendMessage(chatId, text, planModeKb());
}

/** Phase 1 — generate the 7-day skeleton + shopping list ("pl:simple" | "pl:batch"). */
export async function startPlan(chatId, messageId, mode, cqId = null) {
  const profile = await ensureProfile(chatId);
  if (!profile) return;
  if (cqId) await answerCb(cqId);
  await editMessageText(chatId, messageId, PLAN_LOADING, null);
  try {
    const ctx = await buildAiContext(chatId, profile, null, {});
    const plan = await generatePlan(ctx, mode);
    console.info('[ai plan]', plan.days.map((d) => `${d.n}☀️${d.lunch}/🌙${d.dinner}`).join(' | '));
    await savePlan(chatId, plan);
    const intro = `${planIntro(mode, profile.household)}\n\n${planOverview(plan, profile.household)}`;
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

/** Phase 2 — generate (or re-send) one day's lunch+dinner recipes ("pl:cook:<n>"). */
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
    await sendDayCards(chatId, n, existing);
    return;
  }

  if (cqId) await answerCb(cqId, 'دارم دستورهای این روز رو می‌نویسم...');
  const sent = await sendMessage(chatId, dayLoading(n), null);
  try {
    const profile = await getProfile(chatId);
    const ctx = await buildAiContext(chatId, profile, null, {});
    const dayRecipes = await generateDayRecipes(ctx, plan, n);
    recipesMap[String(n)] = dayRecipes;
    await savePlan(chatId, { ...plan, recipes: recipesMap });
    // Register the day's dishes so the 14-day no-repeat window covers them.
    await addHistoryMany(chatId, [dayRecipes.lunch.name, dayRecipes.dinner.name], 'plan');
    await sendDayCards(chatId, n, dayRecipes, sent?.message_id ?? null);
  } catch (e) {
    console.error(`sendDayRecipes day ${n} failed:`, e?.message ?? e);
    const errorKb = [[{ text: '🔄 تلاش دوباره', callback_data: `retry:day:${n}` }], [{ text: '🏠 منوی اصلی', callback_data: 'menu' }]];
    if (sent?.message_id) await editMessageText(chatId, sent.message_id, RECIPE_PARSE_ERROR, errorKb);
    else await sendMessage(chatId, RECIPE_PARSE_ERROR, errorKb);
  }
}

async function sendDayCards(chatId, n, dayRecipes, loadingMessageId = null) {
  const profile = await getProfile(chatId);
  const label = WEEKDAYS_FA[n - 1] ?? `روز ${n}`;
  const lunchCard = recipeCard(dayRecipes.lunch, {
    household: profile?.household,
    headerNote: `📍 ☀️ ناهار روز ${n} — ${label}`,
  });
  const dinnerCard = recipeCard(dayRecipes.dinner, {
    household: profile?.household,
    headerNote: `📍 🌙 شام روز ${n} — ${label}`,
  });
  const text = `${dayRecipesHeader(n)}\n\n${lunchCard}\n\n${dinnerCard}`;
  if (loadingMessageId) {
    await editMessageText(chatId, loadingMessageId, text, MENU_ROW);
  } else {
    await sendMessage(chatId, text, MENU_ROW);
  }
}

/** Re-send the categorized shopping list — data "pl:shop". */
export async function sendShoppingList(chatId, cqId) {
  const plan = await getPlan(chatId);
  if (!plan) {
    await answerCb(cqId, 'هنوز برنامه‌ای نساختی؛ اول برنامه هفتگی بساز 📅', true);
    return;
  }
  if (cqId) await answerCb(cqId);
  const text = `${SHOPPING_LIST_HEADER}\n${shoppingListText(plan.shoppingList)}`;
  await sendMessage(chatId, text, planKb(plan));
}
