// handlers/callback_query.js — runs on each incoming inline-button press.
// This handler receives the CallbackQuery payload.

import { handleCallbackQuery } from '../lib/router.js';

export default async function handleCallbackQueryUpdate(callbackQuery, ctx) {
  await handleCallbackQuery(callbackQuery, ctx);
}
