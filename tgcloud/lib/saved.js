// tgcloud/lib/saved.js — «📚 دستورهای من» permanent recipe archive.
//
// Every recipe card the bot serves (picked suggestions, wheel spins, plan-day
// recipes) is auto-saved here by name. The user's request: sent recipes must
// never disappear — they stay browsable forever. Cards are re-rendered fresh
// from the book bank (lib/recipeBank.js) at open time, so household scaling
// and corpus fixes always apply, and re-opened cards land as NEW messages —
// the archive list itself is never overwritten.
//
// Callback vocabulary (all ≤ 64 bytes):
//   sv                 — open the archive (page 0)
//   sv:pg:<n>          — jump to page n
//   sv:go:<page>:<slot>— open the full recipe card (NEW message)
//   sv:clear           — ask for confirmation
//   sv:clear:yes       — wipe the archive (manual only; no auto-cleanup)

import { sendMessage, sendMessageSmart, editMessageText, answerCb } from './telegram.js';
import { kb, MENU_ROW } from './keyboards.js';
import {
  addSavedRecipes,
  getSavedRecipes,
  countSavedRecipes,
  clearSavedRecipes,
  getProfile,
} from './store.js';
import { bankRecipeByName, bankRecipe } from './bank.js';
import { recipeCard } from './format.js';
import { savedHeader, SAVED_EMPTY, SAVED_GONE, SAVED_CLEARED } from './texts.js';
import { SAVED_PAGE_SIZE, SAVED_RECIPES_CAP } from './config.js';

const MENU_ROW_LOCAL = [[{ text: '🏠 منوی اصلی', callback_data: 'menu' }]];

function fa(n) {
  const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/\d/g, (d) => digits[Number(d)]);
}

/** Auto-save served recipes. Accepts card-shaped objects (with .name) or
 *  plain names. Dedup + cap-pruning live in store.addSavedRecipes. */
export async function saveServedRecipes(chatId, recipes, source = 'decide') {
  try {
    const names = (recipes ?? [])
      .map((r) => (typeof r === 'string' ? r : r?.name))
      .filter(Boolean);
    if (names.length) await addSavedRecipes(chatId, names, source);
  } catch (e) {
    // Archiving must never break the flow that served the recipe.
    console.error('saveServedRecipes failed:', e?.message ?? e);
  }
}

/** Open the archive — page-based list. */
export async function cmdSaved(chatId, { edit = false, messageId = null, page = 0 } = {}) {
  const total = await countSavedRecipes(chatId);
  if (total === 0) {
    const text = SAVED_EMPTY;
    if (edit && messageId) await editMessageText(chatId, messageId, text, MENU_ROW_LOCAL);
    else await sendMessage(chatId, text, MENU_ROW_LOCAL);
    return;
  }
  const totalPages = Math.max(1, Math.ceil(total / SAVED_PAGE_SIZE));
  const p = Math.min(Math.max(0, page), totalPages - 1);
  const rows = await getSavedRecipes(chatId, {
    offset: p * SAVED_PAGE_SIZE,
    limit: SAVED_PAGE_SIZE,
  });
  const text = savedHeader(total, p, totalPages);
  const kbRows = rows.map((r, slot) => [
    { text: truncate(r.dish, 32), callback_data: `sv:go:${p}:${slot}` },
  ]);
  if (totalPages > 1) {
    const nav = [];
    if (p > 0) nav.push({ text: '➡️ قبلی', callback_data: `sv:pg:${p - 1}` });
    if (p < totalPages - 1) nav.push({ text: 'بعدی ⬅️', callback_data: `sv:pg:${p + 1}` });
    kbRows.push(nav);
  }
  kbRows.push([{ text: '🗑 خالی کردن لیست', callback_data: 'sv:clear' }]);
  kbRows.push([{ text: '🏠 منوی اصلی', callback_data: 'menu' }]);
  const markup = kb(kbRows);
  if (edit && messageId) await editMessageText(chatId, messageId, text, markup);
  else await sendMessage(chatId, text, markup);
}

/** Entry point for the whole `sv:*` callback family. */
export async function handleSavedCallback(chatId, messageId, data, cqId) {
  const [, sub, sub2, sub3] = data.split(':');
  if (sub === 'clear') {
    if (sub2 === 'yes') {
      await clearSavedRecipes(chatId);
      await answerCb(cqId, 'خالی شد ✅');
      await editMessageText(chatId, messageId, SAVED_CLEARED, MENU_ROW_LOCAL);
      return;
    }
    await answerCb(cqId);
    await editMessageText(
      chatId,
      messageId,
      '🗑 <b>کل لیست دستورهای ذخیره‌شده خالی شود؟</b>\n\n(دستورهای جدید باز هم خودکار ذخیره می‌شوند)',
      kb([
        [{ text: '🗑 بله، خالی کن', callback_data: 'sv:clear:yes' }],
        [{ text: '✖️ بی‌خیال', callback_data: 'sv' }],
      ]),
    );
    return;
  }
  if (sub === 'pg') {
    await answerCb(cqId);
    return await cmdSaved(chatId, { edit: true, messageId, page: Number(sub2) || 0 });
  }
  if (sub === 'go') {
    return await openSavedRecipe(chatId, Number(sub2) || 0, Number(sub3) || 0, cqId);
  }
  // plain "sv" (menu button / command)
  await answerCb(cqId);
  return await cmdSaved(chatId, { edit: Boolean(messageId), messageId, page: 0 });
}

/** `sv:go:<page>:<slot>` — re-serve the full card as a NEW message so the
 *  archive list stays put (nothing the bot sends is ever overwritten). */
async function openSavedRecipe(chatId, page, slot, cqId) {
  const rows = await getSavedRecipes(chatId, { offset: 0, limit: SAVED_RECIPES_CAP });
  const entry = rows[page * SAVED_PAGE_SIZE + slot] ?? rows[0];
  if (!entry) {
    await answerCb(cqId, 'لیست خالی است', true);
    return await cmdSaved(chatId, { edit: true, messageId: null, page: 0 });
  }
  const record = bankRecipeByName(entry.dish);
  if (!record) {
    await answerCb(cqId, 'این دستور دیگر در بانک نیست', true);
    return;
  }
  const profile = await getProfile(chatId);
  const card = recipeCard(bankRecipe(record, { household: profile?.household }), {
    household: profile?.household,
  });
  await answerCb(cqId);
  await sendMessageSmart(chatId, card, MENU_ROW);
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}
