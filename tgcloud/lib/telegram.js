// tgcloud/lib/telegram.js — thin, defensive wrappers around the platform's Bot
// API client. Every helper swallows expected failures (stale messages, 429s,
// "message is not modified") and retries rate limits once, so flows never die
// on Telegram-side noise.

import { api, BotApiError } from 'sdk';
import { sleep } from './util.js';

const NO_PREVIEW = { link_preview_options: { is_disabled: true } };

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
      console.error('sendMessage failed:', e?.description ?? e?.message ?? e);
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
      console.error('editMessageText failed:', e?.description ?? e?.message ?? e);
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
    console.warn('answerCallbackQuery failed:', e?.description ?? e?.message);
  }
}

/** best-effort error notice to the user when a flow blows up. */
export async function sendError(chatId) {
  await sendMessage(chatId, ERROR_TEXT, RETRY_KB);
}
