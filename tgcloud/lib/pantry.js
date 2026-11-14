// tgcloud/lib/pantry.js — "What's in My Fridge?" — the low-friction input flow.
// Tapping a staple toggles ✅/⬜ in the sessions table and re-renders the grid
// via editMessageReplyMarkup semantics (we re-render text+markup together so
// the selection summary stays accurate).

import { editMessageText, answerCb, sendMessage } from './telegram.js';
import { pantryKb, customIngredientsKb, MENU_ROW } from './keyboards.js';
import {
  PANTRY_HEADER,
  PANTRY_EMPTY_ALERT,
  PANTRY_LOADING,
  customIngredientsSaved,
  UNKNOWN_HINT,
} from './texts.js';
import { setSession, getSession, deleteSession, getProfile } from './store.js';
import { PANTRY_ITEMS, FILTERS } from './config.js';
import { presentSuggestions } from './flows.js';
import { parseIngredientList } from './flows.js';

/** Fresh pantry selection state. */
export function emptyPantry() {
  return { items: [], custom: [], filters: [] };
}

/** Open (or reopen) the fridge grid. Keeps previous selections when present. */
export async function openFridge(chatId, { edit = false, messageId = null } = {}) {
  const current = (await getSession(chatId)) ?? {};
  const pantry = current.pantry && typeof current.pantry === 'object'
    ? { items: current.pantry.items ?? [], custom: current.pantry.custom ?? [], filters: current.pantry.filters ?? [] }
    : emptyPantry();
  const session = { flow: 'pantry', pantry };
  await setSession(chatId, session);
  const text = PANTRY_HEADER;
  if (edit && messageId) await editMessageText(chatId, messageId, text, pantryKb(session));
  else await sendMessage(chatId, text, pantryKb(session));
}

/** Toggle one staple — data = "pa:<index>". */
export async function togglePantry(chatId, messageId, index, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'pantry') {
    await answerCb(cqId, 'این منو منقضی شده؛ دوباره یخچال رو باز کن', true);
    return;
  }
  const item = PANTRY_ITEMS[index];
  if (!item) {
    await answerCb(cqId, 'ماده ناشناس', false);
    return;
  }
  const items = session.pantry.items ?? [];
  const on = !items.includes(item);
  session.pantry.items = on ? [...items, item] : items.filter((i) => i !== item);
  session.flow = 'pantry';
  await setSession(chatId, session);
  await editMessageText(chatId, messageId, PANTRY_HEADER, pantryKb(session));
  await answerCb(cqId, on ? `${item} اضافه شد ✅` : `${item} برداشته شد ⬜`);
}

/** Toggle a situational filter — data = "fl:<key>". */
export async function toggleFilter(chatId, messageId, key, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'pantry') {
    await answerCb(cqId, 'این منو منقضی شده؛ دوباره یخچال رو باز کن', true);
    return;
  }
  const filter = FILTERS.find((f) => f.key === key);
  if (!filter) {
    await answerCb(cqId, 'فیلتر ناشناس', false);
    return;
  }
  const filters = session.pantry.filters ?? [];
  const on = !filters.includes(filter.key);
  session.pantry.filters = on ? [...filters, filter.key] : filters.filter((k) => k !== filter.key);
  session.flow = 'pantry';
  await setSession(chatId, session);
  await editMessageText(chatId, messageId, PANTRY_HEADER, pantryKb(session));
  await answerCb(cqId, on ? `${filter.label} فعّال شد ✅` : `${filter.label} خاموش شد ⬜`);
}

/** Clear selections — data = "pa:clear". */
export async function clearPantry(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  const pantry = emptyPantry();
  await setSession(chatId, { flow: 'pantry', pantry });
  await editMessageText(chatId, messageId, PANTRY_HEADER, pantryKb({ flow: 'pantry', pantry }));
  await answerCb(cqId, 'انتخاب‌ها پاک شد 🧹');
}

/** Generate suggestions from the current selection — data = "pa:go". */
export async function startSuggest(chatId, messageId, cqId) {
  const session = await getSession(chatId);
  if (!session || session.flow !== 'pantry') {
    await answerCb(cqId, 'این منو منقضی شده؛ دوباره یخچال رو باز کن', true);
    return;
  }
  const { items = [], custom = [], filters = [] } = session.pantry ?? {};
  if (items.length === 0 && custom.length === 0) {
    await answerCb(cqId, PANTRY_EMPTY_ALERT, true);
    return;
  }
  await answerCb(cqId);
  await editMessageText(chatId, messageId, PANTRY_LOADING, null);
  await presentSuggestions(chatId, messageId, session, { source: 'pantry' });
}

/** Free-text ingredient list while the fridge is open. */
export async function handlePantryText(chatId, text, messageId = null) {
  const items = parseIngredientList(text);
  if (items.length === 0) {
    await sendMessage(chatId, UNKNOWN_HINT, MENU_ROW);
    return;
  }
  const session = (await getSession(chatId)) ?? { flow: 'pantry' };
  const pantry = { items: session.pantry?.items ?? [], custom: items, filters: session.pantry?.filters ?? [] };
  await setSession(chatId, { flow: 'pantry', pantry });
  await sendMessage(chatId, customIngredientsSaved(items), customIngredientsKb());
}
