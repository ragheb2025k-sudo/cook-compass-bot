// handlers/message.js — runs on each incoming `message` update. The platform
// unwraps the Update for us: this handler receives the Message payload.
// All routing lives in lib/router.js.

import { handleMessage } from '../lib/router.js';

export default async function handleMessageUpdate(message, ctx) {
  await handleMessage(message, ctx);
}
