// tgcloud/lib/telegram.js — thin, defensive wrappers around the platform's Bot
// API client. Every helper swallows expected failures (stale messages, 429s,
// "message is not modified") and retries rate limits once, so flows never die
// on Telegram-side noise.

import { api, BotApiError } from 'sdk';
import { BOT_COMMANDS } from './config.js';
import { sleep } from './util.js';
import { splitLongText } from './format.js';

const NO_PREVIEW = { link_preview_options: { is_disabled: true } };

// Gate 1.2.3 — never let a Bot-API token appear in a log line, even if an
// error object happens to carry the request URL it failed on.
const TOKEN_RE = /bot\d+:[A-Za-z0-9_-]{20,}/g;
function redact(value) {
  return String(value ?? '').replace(TOKEN_RE, 'bot***:***');
}

const ERROR_TEXT = [
  '😮‍💨 <b>وای! انگار آشپزخونه‌م یه لحظه برقش رفت.</b>',
  '',
  'دوباره تلاش کن؛ اگه نشد چند دقیقه دیگه برگرد 🙏',
].join('\n');

const RETRY_KB = [[{ text: '🔄 تلاش دوباره', callback_data: 'retry' }, { text: '🏠 منوی اصلی', callback_data: 'menu' }]];

function isRateLimit(e) {
  return e instanceof BotApiError && e.code === 429 && e.parameters?.retry_after;
}

/** Accept either a full ReplyMarkup object (from keyboards.js) or a raw rows array. */
function markup(inlineKeyboard) {
  if (!inlineKeyboard) return undefined;
  return Array.isArray(inlineKeyboard) ? { inline_keyboard: inlineKeyboard } : inlineKeyboard;
}

function isBenignEditError(e) {
  if (!(e instanceof BotApiError && e.code === 400)) return false;
  const d = String(e.description ?? '');
  return d.includes('message is not modified')
    || d.includes('message can\'t be edited')
    || d.includes('message to edit not found')
    || d.includes('message to reply not found');
}

/** sendMessage with HTML parse mode, link-preview off and a 429 retry. */
export async function sendMessage(chatId, text, inlineKeyboard = null) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const sent = await api.sendMessage({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: markup(inlineKeyboard),
        ...NO_PREVIEW,
      });
      if (sent?.message_id) console.info('[sent]', sent.message_id);
      return sent;
    } catch (e) {
      if (isRateLimit(e) && attempt === 0) {
        await sleep((Number(e.parameters.retry_after) + 1) * 1000);
        continue;
      }
      console.error('sendMessage failed:', redact(e?.description ?? e?.message ?? e));
      return null;
    }
  }
  return null;
}

/** editMessageText that ignores benign "nothing changed / too old" errors. */
export async function editMessageText(chatId, messageId, text, inlineKeyboard = null) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await api.editMessageText({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        reply_markup: markup(inlineKeyboard),
        ...NO_PREVIEW,
      });
    } catch (e) {
      if (isRateLimit(e) && attempt === 0) {
        await sleep((Number(e.parameters.retry_after) + 1) * 1000);
        continue;
      }
      if (isBenignEditError(e)) return null;
      console.error('editMessageText failed:', redact(e?.description ?? e?.message ?? e));
      return null;
    }
  }
  return null;
}

/** answerCallbackQuery — never throws. */
export async function answerCb(callbackId, text = null, showAlert = false) {
  try {
    await api.answerCallbackQuery({
      callback_query_id: callbackId,
      ...(text ? { text, show_alert: showAlert } : {}),
    });
  } catch (e) {
    console.warn('answerCallbackQuery failed:', redact(e?.description ?? e?.message));
  }
}

/** best-effort error notice to the user when a flow blows up. */
export async function sendError(chatId) {
  await sendMessage(chatId, ERROR_TEXT, RETRY_KB);
}

/* ------------------------------------------------------------------ */
/* Long-message helpers — full recipe cards with complete steps often   */
/* exceed Telegram's 4096-char limit. These split the text at line      */
/* boundaries («ادامهٔ دستور» markers on continuations) and keep the     */
/* inline keyboard only on the last part.                              */
/* ------------------------------------------------------------------ */

/** Edit `messageId` with part 1, then send the remaining parts as new messages. */
export async function editMessageTextSmart(chatId, messageId, text, inlineKeyboard = null) {
  const parts = splitLongText(text);
  const last = parts.length - 1;
  await editMessageText(chatId, messageId, parts[0], parts.length > 1 ? null : inlineKeyboard);
  for (let i = 1; i < parts.length; i++) {
    await sendMessage(chatId, parts[i], i === last ? inlineKeyboard : null);
  }
  return parts.length;
}

/** Send any text, auto-split into as many messages as needed. */
export async function sendMessageSmart(chatId, text, inlineKeyboard = null) {
  const parts = splitLongText(text);
  const last = parts.length - 1;
  for (let i = 0; i < parts.length; i++) {
    await sendMessage(chatId, parts[i], i === last ? inlineKeyboard : null);
  }
  return parts.length;
}

/** setMyCommands — registers the "/" quick-access command menu (default scope,
 *  so it shows for every user regardless of locale). Idempotent and cheap;
 *  called on /start. Best-effort: a Telegram-side hiccup here must never
 *  break the flow that triggered it. */
export async function registerCommands() {
  try {
    await api.setMyCommands({ commands: BOT_COMMANDS });
    console.info('[commands] "/" menu registered');
  } catch (e) {
    console.warn('setMyCommands failed:', redact(e?.description ?? e?.message ?? e));
  }
}
