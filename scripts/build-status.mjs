#!/usr/bin/env node
// scripts/build-status.mjs
//
// Generates `landing/status.json` — the data source for the «وضعیت زنده»
// section of the GitHub Pages landing page. It calls the Telegram Bot API
// (getMe + getWebhookInfo) exactly like the sandbox dashboard's
// /api/bot-status route, so the static landing page can show live-ish bot
// health without ever exposing the bot token to visitors: the token is used
// only here, inside CI, and the published JSON contains no secrets.
//
// Contract (mirrors /api/bot-status):
// {
//   ok, reason,
//   bot:      { id, username, firstName } | null,
//   webhook:  { url, isTgcloud, pendingUpdateCount, lastErrorMessage, lastErrorDate } | null,
//   ai:       { provider, model, mockAvailable } | null,
//   generatedAt
// }
//
// The script ALWAYS writes a payload and exits 0 (unless writing itself
// fails): a degraded `ok:false` status is a normal landing-page state, not a
// CI failure. Set TELEGRAM_BOT_TOKEN in the environment to get real data.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'landing', 'status.json');
const META = path.join(ROOT, 'bot-meta.json');
const TELEGRAM_TIMEOUT_MS = 10_000;

const basePayload = (patch) => ({
  ok: false,
  reason: null,
  bot: null,
  webhook: null,
  ai: null,
  generatedAt: new Date().toISOString(),
  ...patch,
});

async function telegramCall(method, token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TELEGRAM_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.ok || data.result === undefined || data.result === null) {
      throw new Error(data.description || 'invalid Telegram response');
    }
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function readAiMeta() {
  try {
    const raw = await readFile(META, 'utf8');
    const meta = JSON.parse(raw);
    if (!meta.ai) return null;
    return {
      provider: meta.ai.provider ?? 'unknown',
      model: meta.ai.model ?? 'unknown',
      mockAvailable: Boolean(meta.ai.mockAvailable),
    };
  } catch {
    return null;
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const ai = await readAiMeta();

  if (!token) {
    await write(
      basePayload({
        reason: 'TELEGRAM_BOT_TOKEN تنظیم نشده است',
        ai,
      }),
    );
    console.log('status.json written (degraded: no TELEGRAM_BOT_TOKEN)');
    return;
  }

  try {
    const me = await telegramCall('getMe', token);
    const bot = {
      id: me.id,
      username: me.username ?? '',
      firstName: me.first_name ?? '',
    };

    let webhook = null;
    try {
      const info = await telegramCall('getWebhookInfo', token);
      const url = info.url ?? '';
      webhook = {
        url,
        isTgcloud: /telegram\.org|tgcloud/i.test(url),
        pendingUpdateCount: info.pending_update_count ?? 0,
        lastErrorMessage: info.last_error_message ?? null,
        lastErrorDate: info.last_error_date ?? null,
      };
    } catch {
      webhook = null; // best-effort, same as the sandbox API route
    }

    await write(basePayload({ ok: true, bot, webhook, ai }));
    console.log(
      `status.json written (ok:true, @${bot.username}, pending=${webhook?.pendingUpdateCount ?? 'n/a'})`,
    );
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown error';
    await write(basePayload({ reason: `اتصال به تلگرام برقرار نشد (${detail})`, ai }));
    console.log(`status.json written (ok:false: ${detail})`);
  }
}

async function write(payload) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

main().catch((e) => {
  console.error('build-status failed:', e);
  process.exit(1);
});
