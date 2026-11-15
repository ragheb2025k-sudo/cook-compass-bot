// tgcloud/lib/saved.js — «📚 دستورهای من» — the user's MANUAL recipe archive.
//
// Core policy (user request):
//   1. NOTHING is auto-saved anymore. A recipe lands in the archive only
//      when the user taps «💾 ذخیره» on the card the bot served.
//   2. Every archive entry can be deleted individually (🗑 next to each
//      row, with a confirmation step) — in addition to the wipe-all button.
//   3. Recipes the bot SENDS stay in the chat as permanent messages — the
//      archive is a separate, deliberate bookmark list, not a dump.
//
// The 💾 save buttons are stable by construction: callback data carries a
// bank record index (sv:save:<i>), a rescue-idea id (sv:save:ri:<key>) or a
// plan-day meal (sv:save:day:<n>:<meal>) — so pressing the button on an OLD
// message, long after later spins replaced the session, still saves the
// exact dish shown on that message.
//
// Callback vocabulary (all ≤ 64 bytes):
//   sv                     — open the archive (page 0)
//   sv:pg:<n>              — jump to page n
//   sv:go:<page>:<slot>    — open the full recipe card (NEW message)
//   sv:save:<bankIdx>      — save a bank recipe by stable index
//   sv:save:ri:<ideaId>    — save a rescue-idea recipe («ri:rice1»)
//   sv:save:day:<n>:<meal> — save a plan-day meal («lunch»|«dinner»)
//   sv:del:<p>:<s>         — ask per-item delete confirmation
//   sv:delok:<p>:<s>       — delete the entry, re-render the list
//   sv:clear | sv:clear:yes— wipe the whole archive (manual only)

import { sendMessage, sendMessageSmart, editMessageText, answerCb } from './telegram.js';
import { kb, MENU_ROW } from './keyboards.js';
import {
  addSavedRecipes,
  getSavedRecipes,
  countSavedRecipes,
  clearSavedRecipes,
  removeSavedRecipe,
  hasSavedRecipe,
  getProfile,
  getPlan,
} from './store.js';
import { RECIPE_BANK, bankRecipeByName, bankRecipe } from './bank.js';
import { rescueRecipeById, rescueRecipeByName } from './rescue.js';
import { recipeCard } from './format.js';
import { savedHeader, SAVED_EMPTY, SAVED_CLEARED, SAVED_DELETED } from './texts.js';
import { SAVED_PAGE_SIZE, SAVED_RECIPES_CAP } from './config.js';

const MENU_ROW_LOCAL = [[{ text: '🏠 منوی اصلی', callback_data: 'menu' }]];

function fa(n) {
  const digits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(n).replace(/\d/g, (d) => digits[Number(d)]);
}

/** Build the 💾 callback for a card-shaped recipe (bank record or rescue idea). */
export function saveCallbackFor(recipe) {
  if (recipe?.rescueId) return `sv:save:ri:${recipe.rescueId}`;
  if (recipe?.bankIdx != null) return `sv:save:${recipe.bankIdx}`;
  return null;
}

/** Handle any «sv:save:…» press — resolve the dish, insert into the archive. */
export async function handleSaveCallback(chatId, data, cqId) {
  const parts = data.split(':'); // sv | save | <kind…>
  const kind = parts[2];
  try {
    let name = null;
    let source = 'manual';
    if (kind === 'ri') {
      const idea = rescueRecipeById(parts.slice(3).join(':'));
      name = idea?.name ?? null;
      source = 'rescue';
    } else if (kind === 'day') {
      const dayN = Math.min(7, Math.max(1, Number(parts[3]) || 1));
      const meal = parts[4] === 'dinner' ? 'dinner' : 'lunch';
      const plan = await getPlan(chatId);
      const rec = plan?.recipes?.[String(dayN)]?.[meal];
      name = rec?.name ?? null;
      source = 'plan';
    } else {
      const idx = Number(kind);
      const record = Number.isInteger(idx) && idx >= 0 && idx < RECIPE_BANK.length
        ? bankRecipeByName(RECIPE_BANK[idx].n)
        : null;
      name = record?.n ?? null;
      source = 'manual';
    }
    if (!name) {
      await answerCb(cqId, 'این دستور الان پیدا نشد 😕', true);
      return;
    }
    if (await hasSavedRecipe(chatId, name)) {
      await answerCb(cqId, 'قبلاً ذخیره شده بود 📚');
      return;
    }
    await addSavedRecipes(chatId, [name], source);
    await answerCb(cqId, `💾 «${truncate(name, 24)}» ذخیره شد — توی «دستورهای من» کام`);
  } catch (e) {
    console.error('handleSaveCallback failed:', e?.message ?? e);
    await answerCb(cqId, 'ذخیره نشد؛ دوباره امتحان کن', true);
  }
}

/** Open the archive — page-based list with per-item 🗑 delete. */
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
    { text: `📖 ${truncate(r.dish, 30)}`, callback_data: `sv:go:${p}:${slot}` },
    { text: '🗑', callback_data: `sv:del:${p}:${slot}` },
  ]);
  if (totalPages > 1) {
    const nav = [];
    if (p > 0) nav.push({ text: '➡️ قبلی', callback_data: `sv:pg:${p - 1}` });
    if (p < totalPages - 1) nav.push({ text: 'بعدی ⬅️', callback_data: `sv:pg:${p + 1}` });
    kbRows.push(nav);
  }
  kbRows.push([{ text: '🗑 خالی کردن کل لیست', callback_data: 'sv:clear' }]);
  kbRows.push([{ text: '🏠 منوی اصلی', callback_data: 'menu' }]);
  const markup = kb(kbRows);
  if (edit && messageId) await editMessageText(chatId, messageId, text, markup);
  else await sendMessage(chatId, text, markup);
}

/** Entry point for the whole `sv:*` callback family. */
export async function handleSavedCallback(chatId, messageId, data, cqId) {
  const [, sub, sub2, sub3] = data.split(':');
  if (sub === 'save') {
    return await handleSaveCallback(chatId, data, cqId);
  }
  if (sub === 'del') {
    return await askDeleteEntry(chatId, messageId, Number(sub2) || 0, Number(sub3) || 0, cqId);
  }
  if (sub === 'delok') {
    return await deleteEntry(chatId, messageId, Number(sub2) || 0, Number(sub3) || 0, cqId);
  }
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
      '🗑 <b>کل لیست دستورهای ذخیره‌شده خالی شود؟</b>',
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

/** `sv:del:<p>:<s>` — confirmation step for a single-entry delete. */
async function askDeleteEntry(chatId, messageId, page, slot, cqId) {
  const rows = await getSavedRecipes(chatId, { offset: 0, limit: SAVED_RECIPES_CAP });
  const entry = rows[page * SAVED_PAGE_SIZE + slot];
  if (!entry) {
    await answerCb(cqId, 'این مورد دیگر در لیست نیست', true);
    return;
  }
  await answerCb(cqId);
  await editMessageText(
    chatId,
    messageId,
    [
      '🗑 <b>این دستور از «دستورهای من» حذف شود؟</b>',
      '',
      `📖 ${escapeHtml(entry.dish)}`,
    ].join('\n'),
    kb([
      [{ text: '🗑 بله، حذفش کن', callback_data: `sv:delok:${page}:${slot}` }],
      [{ text: '✖️ بی‌خیال', callback_data: `sv:pg:${page}` }],
    ]),
  );
}

/** `sv:delok:<p>:<s>` — perform the delete and re-render the list. */
async function deleteEntry(chatId, messageId, page, slot, cqId) {
  const rows = await getSavedRecipes(chatId, { offset: 0, limit: SAVED_RECIPES_CAP });
  const entry = rows[page * SAVED_PAGE_SIZE + slot];
  if (!entry) {
    await answerCb(cqId, 'این مورد دیگر در لیست نیست', true);
    return await cmdSaved(chatId, { edit: true, messageId, page: 0 });
  }
  await removeSavedRecipe(chatId, entry.id);
  await answerCb(cqId, 'حذف شد ✅');
  const total = await countSavedRecipes(chatId);
  if (total === 0) {
    return await editMessageText(chatId, messageId, SAVED_DELETED, MENU_ROW_LOCAL);
  }
  return await cmdSaved(chatId, { edit: true, messageId, page });
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
  const profile = await getProfile(chatId);
  const household = profile?.household;
  // Bank recipe first; rescue ideas are not bank rows — try the rescue KB too.
  const record = bankRecipeByName(entry.dish);
  const card = record
    ? recipeCard(bankRecipe(record, { household }), { household })
    : (() => {
        const idea = rescueRecipeByName(entry.dish, { household });
        return idea ? recipeCard(idea, { household }) : null;
      })();
  if (!card) {
    await answerCb(cqId, 'این دستور دیگر در بانک نیست', true);
    return;
  }
  await answerCb(cqId);
  await sendMessageSmart(chatId, card, MENU_ROW);
}

function truncate(s, n) {
  const str = String(s ?? '');
  return str.length > n ? `${str.slice(0, n - 1)}…` : str;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
