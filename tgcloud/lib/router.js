// tgcloud/lib/router.js — the single dispatch point for every update.
// handlers/message.js and handlers/callback_query.js are one-line adapters;
// everything routes through here so flows stay in one place.
//
// Security pipeline on every update (serverless hardening):
//   1. duplicate-delivery idempotency   (seenRecently — Gate 1.3.4)
//   2. per-chat rate limit              (hitRateLimit — Gate 4.1.1)
//   3. input length cap                 (Gate 4.1.3)
// Tenant isolation: chatId is always taken from the incoming update itself,
// never from any client-supplied payload (Gate 2.3.1).

import { sendMessage, editMessageText, answerCb, sendError, registerCommands } from './telegram.js';
import { menuKb, MENU_ROW, profileKb, historyClearKb, supportKb, deleteDataKb } from './keyboards.js';
import { openPlanner, startPlan, sendShoppingList, sendDayRecipes, handlePqCallback } from './planner.js';
import {
  MENU_MAIN,
  HELP_TEXT,
  CANCELLED,
  UNKNOWN_HINT,
  welcomeBack,
  profileView,
  HISTORY_CLEARED,
  historyClearConfirm,
  RANDOM_SPINNING,
  RESCUE_HEADER,
  RESCUE_EMPTY_ALERT,
  RATE_LIMIT_ALERT,
  INPUT_TOO_LONG,
  PRIVACY_TEXT,
  TERMS_TEXT,
  SUPPORT_TEXT,
  PAYSUPPORT_TEXT,
  DELETE_CONFIRM,
  DATA_DELETED,
} from './texts.js';
import {
  getSession, setSession, deleteSession, getProfile, clearHistory, getRecentDishes,
  countRecentHistory, seenRecently, hitRateLimit, deleteAllUserData,
} from './store.js';
import { GUARDS } from './config.js';
import { startOnboarding, editField, handleObCallback, handleOnboardingText } from './onboarding.js';
import { openFridge, togglePantry, toggleFilter, clearPantry, startSuggest, handlePantryText } from './pantry.js';
import { cmdSaved, handleSavedCallback } from './saved.js';
import { decideNext, decidePick, decideAgain, runRescue, startRandom, randomAdd, openCats, openCategory, catNext, catAdd, parseIngredientList, ensureProfile } from './flows.js';

/* ------------------------------------------------------------------ */
/* Message updates                                                     */
/* ------------------------------------------------------------------ */

export async function handleMessage(message) {
  try {
    if (!message?.chat?.id) return;
    if (message.chat.type !== 'private') return; // private chats only (Gate 2.2.3)
    const chatId = message.chat.id;

    // Gate 1.3.4 — duplicate webhook deliveries must never double-fire flows.
    if (await seenRecently(`m:${chatId}:${message.message_id}`, chatId)) return;
    // Gate 4.1.1 — per-chat throttle.
    if (await hitRateLimit(chatId)) {
      return await sendMessage(chatId, RATE_LIMIT_ALERT, MENU_ROW);
    }

    const text = typeof message.text === 'string' ? message.text.trim() : '';

    // Commands
    if (text.startsWith('/')) {
      const cmd = text.split(/[\s@]/)[0].toLowerCase();
      switch (cmd) {
        case '/start': return await cmdStart(chatId);
        case '/help': return await sendMessage(chatId, HELP_TEXT, MENU_ROW);
        case '/cancel': {
          await deleteSession(chatId);
          return await sendMessage(chatId, CANCELLED, MENU_ROW);
        }
        case '/fridge':
        case '/home':
          return await openFridge(chatId);
        case '/rescue': return await cmdRescue(chatId);
        case '/plan': return await openPlanner(chatId);
        case '/random': return await cmdRandomMessage(chatId);
        case '/cats': return await openCats(chatId);
        case '/recipes': return await cmdSaved(chatId);
        case '/profile': return await cmdProfile(chatId, null);
        case '/privacy': return await sendMessage(chatId, PRIVACY_TEXT, MENU_ROW);
        case '/terms': return await sendMessage(chatId, TERMS_TEXT, MENU_ROW);
        case '/support': return await sendMessage(chatId, SUPPORT_TEXT, supportKb());
        case '/paysupport': return await sendMessage(chatId, PAYSUPPORT_TEXT, MENU_ROW);
        case '/delete_my_data': return await cmdDeleteMyData(chatId);
        default:
          return await sendMessage(chatId, UNKNOWN_HINT, MENU_ROW);
      }
    }

    // Free text — route by current flow.
    if (!text) return; // photos/stickers etc.
    // Gate 4.1.3 — hard character cap on free-text input.
    if (text.length > GUARDS.MAX_INPUT_CHARS) {
      return await sendMessage(chatId, INPUT_TOO_LONG, MENU_ROW);
    }
    const session = (await getSession(chatId)) ?? { flow: null };
    if (session.flow === 'rescue') {
      const items = parseIngredientList(text).slice(0, 3);
      if (items.length === 0) {
        return await sendMessage(chatId, RESCUE_EMPTY_ALERT, [[{ text: '🏠 منوی اصلی', callback_data: 'menu' }]]);
      }
      const sent = await sendMessage(chatId, RESCUE_HEADER, [[{ text: '🔄 تلاش دوباره', callback_data: 'retry:rescue' }]]);
      return await runRescue(chatId, sent?.message_id ?? null, items);
    }
    if (session.flow === 'pantry') {
      return await handlePantryText(chatId, text);
    }
    if (session.flow === 'onboarding') {
      return await handleOnboardingText(chatId, session, text);
    }
    return await sendMessage(chatId, UNKNOWN_HINT, MENU_ROW);
  } catch (e) {
    console.error('handleMessage failed:', e);
    if (message?.chat?.id) await sendError(message.chat.id);
  }
}

/* ------------------------------------------------------------------ */
/* Callback queries                                                    */
/* ------------------------------------------------------------------ */

export async function handleCallbackQuery(cq) {
  try {
    if (!cq?.data) return await answerCb(cq.id);
    const chatId = cq.message?.chat?.id;
    const messageId = cq.message?.message_id;
    if (!chatId || cq.message?.chat?.type !== 'private') {
      // Gate 2.2.3 — private chats only; group presses never leak data.
      return await answerCb(cq.id, 'فقط توی چت خصوصی 🧭', false);
    }
    // Gate 1.3.4 — idempotency on callback deliveries too.
    if (await seenRecently(`c:${cq.id}`, chatId)) return await answerCb(cq.id);
    // Gate 4.1.1 — per-chat throttle on button spam.
    if (await hitRateLimit(chatId)) {
      return await answerCb(cq.id, '😅 یه‌کم آروم‌تر! چند ثانیه صبر کن.', true);
    }
    await routeCallback(chatId, messageId, cq.data, cq.id);
  } catch (e) {
    console.error('handleCallbackQuery failed:', e);
    if (cq?.message?.chat?.id) {
      await answerCb(cq.id);
      await sendError(cq.message.chat.id);
    }
  }
}

async function routeCallback(chatId, messageId, data, cqId) {
  const [root, sub, sub2] = data.split(':');

  switch (root) {
    case 'menu': {
      await answerCb(cqId);
      switch (sub) {
        case undefined: return await showMenu(chatId, messageId);
        case 'fridge': return await openFridge(chatId, { edit: Boolean(messageId), messageId });
        case 'rescue': return await cmdRescue(chatId, messageId);
        case 'plan': return await openPlanner(chatId, { edit: Boolean(messageId), messageId });
        case 'random': return await startRandom(chatId, messageId, cqId);
        case 'cats': return await openCats(chatId, messageId, cqId);
        case 'profile': return await cmdProfile(chatId, messageId, cqId);
        default: return await showMenu(chatId, messageId);
      }
    }

    case 'ob': {
      return await handleObCallback(chatId, messageId, data, cqId);
    }

    case 'pa': {
      if (sub === 'go') return await startSuggest(chatId, messageId, cqId);
      if (sub === 'clear') return await clearPantry(chatId, messageId, cqId);
      return await togglePantry(chatId, messageId, Number(sub), cqId);
    }

    case 'fl':
      return await toggleFilter(chatId, messageId, sub, cqId);

    case 'dec': {
      if (sub === 'next') return await decideNext(chatId, messageId, cqId);
      if (sub === 'pick') return await decidePick(chatId, messageId, cqId);
      if (sub === 'again') return await decideAgain(chatId, messageId, cqId);
      return await answerCb(cqId);
    }

    case 'rnd': {
      if (sub === 'again') return await startRandom(chatId, messageId, cqId);
      if (sub === 'add') return await randomAdd(chatId, messageId, cqId);
      return await startRandom(chatId, messageId, cqId);
    }

    case 'cat': {
      // 🍽 Category browse — cat | cat:<idx> | cat:next | cat:add
      if (sub === 'next') return await catNext(chatId, messageId, cqId);
      if (sub === 'add') return await catAdd(chatId, messageId, cqId);
      if (sub === undefined) return await openCats(chatId, messageId, cqId);
      return await openCategory(chatId, messageId, Number(sub), cqId);
    }

    case 'pq': {
      // Weekly-plan questionnaire — pq:<field>:<n>
      return await handlePqCallback(chatId, messageId, data, cqId);
    }

    case 'sv': {
      // 📚 Saved-recipes archive — sv | sv:pg:<n> | sv:go:<page>:<slot> | sv:clear[:yes]
      return await handleSavedCallback(chatId, messageId, data, cqId);
    }

    case 'pl': {
      if (sub === 'simple' || sub === 'batch') return await startPlan(chatId, messageId, sub, cqId);
      if (sub === 'shop') return await sendShoppingList(chatId, cqId);
      if (sub === 'cook') return await sendDayRecipes(chatId, Number(sub2 ?? 0), cqId);
      if (sub === 'again') return await openPlanner(chatId, { edit: Boolean(messageId), messageId });
      return await answerCb(cqId);
    }

    case 'del': {
      // /delete_my_data confirmation (Gate 5.1.5) — never destructive without it.
      if (sub === 'yes') {
        await deleteAllUserData(chatId);
        await answerCb(cqId, 'پاک شد ✅');
        return await sendMessage(chatId, DATA_DELETED, MENU_ROW);
      }
      await answerCb(cqId);
      return await showMenu(chatId, messageId);
    }

    case 'pr': {
      if (sub === 'edit') return await cmdProfileEdit(chatId, sub2, messageId, cqId);
      if (sub === 'clearhist') {
        if (sub2 === 'yes') {
          await clearHistory(chatId);
          await answerCb(cqId);
          return await sendMessage(chatId, HISTORY_CLEARED, MENU_ROW);
        }
        const n = await countRecentHistory(chatId);
        await answerCb(cqId);
        return await sendMessage(chatId, historyClearConfirm(n), historyClearKb());
      }
      return await cmdProfile(chatId, messageId, cqId);
    }

    case 'retry': {
      // data = "retry:<action>" — re-run the failed AI step on this message.
      await answerCb(cqId, 'دارم دوباره تلاش می‌کنم...');
      const session = (await getSession(chatId)) ?? {};
      const action = sub;
      if (action === 'suggest') return await startSuggest(chatId, messageId, null);
      if (action === 'decide') return await decideAgain(chatId, messageId, null);
      if (action === 'random') return await startRandom(chatId, messageId, null);
      if (action === 'cat') return await openCategory(chatId, messageId, Number(sub2 ?? 0), null);
      if (action === 'rescue') return await runRescue(chatId, messageId, session.rescueItems ?? []);
      if (action === 'plan') return await startPlan(chatId, messageId, sub2 ?? 'simple', null);
      if (action === 'shop') return await sendShoppingList(chatId, null);
      if (action === 'day') return await sendDayRecipes(chatId, Number(sub2 ?? 0), null);
      return await showMenu(chatId, messageId);
    }

    default: {
      await answerCb(cqId);
      return await showMenu(chatId, messageId);
    }
  }
}

/* ------------------------------------------------------------------ */
/* Shared command bodies                                               */
/* ------------------------------------------------------------------ */

async function showMenu(chatId, messageId) {
  const session = (await getSession(chatId)) ?? {};
  await setSession(chatId, { ...session, flow: null, retryCb: null });
  const text = MENU_MAIN;
  if (messageId) await editMessageText(chatId, messageId, text, menuKb());
  else await sendMessage(chatId, text, menuKb());
}

async function cmdStart(chatId) {
  // Keep the "/" quick-access menu registered (idempotent, best-effort).
  await registerCommands();
  const profile = await getProfile(chatId);
  if (profile) {
    await deleteSession(chatId);
    return await sendMessage(chatId, welcomeBack(profile), menuKb());
  }
  return await startOnboarding(chatId);
}

async function cmdRescue(chatId, messageId = null) {
  const profile = await ensureProfile(chatId, messageId);
  if (!profile) return;
  const session = (await getSession(chatId)) ?? {};
  await setSession(chatId, { ...session, flow: 'rescue', pantry: session.pantry ?? {} });
  if (messageId) await editMessageText(chatId, messageId, RESCUE_HEADER, [[{ text: '🏠 منوی اصلی', callback_data: 'menu' }]]);
  else await sendMessage(chatId, RESCUE_HEADER, [[{ text: '🏠 منوی اصلی', callback_data: 'menu' }]]);
}

async function cmdRandomMessage(chatId) {
  // Invoked via /random command — send a fresh carrier message to spin on.
  const sent = await sendMessage(chatId, RANDOM_SPINNING, null);
  if (sent?.message_id) await startRandom(chatId, sent.message_id, null);
}

async function cmdProfile(chatId, messageId, cqId = null) {
  const profile = await getProfile(chatId);
  if (!profile) {
    if (cqId) await answerCb(cqId);
    return await startOnboarding(chatId);
  }
  const dishes = await getRecentDishes(chatId);
  const text = profileView(profile, dishes.length, dishes[0] ?? null);
  if (cqId) await answerCb(cqId);
  if (messageId) await editMessageText(chatId, messageId, text, profileKb());
  else await sendMessage(chatId, text, profileKb());
}

async function cmdProfileEdit(chatId, field, messageId, cqId) {
  const profile = await getProfile(chatId);
  if (!profile) {
    if (cqId) await answerCb(cqId);
    return await startOnboarding(chatId);
  }
  if (cqId) await answerCb(cqId);
  return await editField(chatId, field, profile, messageId);
}

/** Gate 5.1.5 — data deletion entry point with confirmation step. */
async function cmdDeleteMyData(chatId) {
  const session = (await getSession(chatId)) ?? {};
  await setSession(chatId, { ...session, flow: null });
  await sendMessage(chatId, DELETE_CONFIRM, deleteDataKb());
}
