# پروتکل جامع و اختصاصی ایمن‌سازی ربات، مینی‌اپ (TMA) و مینی‌گیم تلگرام (ویژه معماری Serverless & Cloudflare)

## راهنمای استفاده
۱. پس از اتمام کدنویسی ربات، مینی‌اپ یا مینی‌گیم تلگرامی خود، **کل متن داخل باکس زیر** را کپی کرده و بدون هیچ توضیحی به هوش مصنوعی بدهید.
۲. این پرامپت دارای **مکانیزم اجرای ۵ مرحله‌ای (5-Gate Execution Engine)** است؛ یعنی هوش مصنوعی مرحله به مرحله کدها، تنظیمات کلودفلر (`wrangler.toml`)، دیتابیس و وب‌هوک‌ها را ایمن می‌کند، گزارش خط‌به‌خط می‌دهد و منتظر تایید شما (`NEXT` یا `ادامه`) می‌ماند.
۳. مشخصات سازنده، کانال پشتیبانی (`https://t.me/Botmaker_Telegram`) و ایمیل شما (`ragheb2025k@gmail.com`) به صورت خودکار در تمامی دستورات `/privacy`، `/terms`، `/support`، `/paysupport` و صفحات قانونی مینی‌اپ تزریق خواهد شد.

---

## متن پرامپت (از خط پایین کپی کنید)

```
# SYSTEM ROLE & MANDATORY 5-GATE EXECUTION PROTOCOL (TELEGRAM & CLOUDFLARE SPECIALIST)
You are operating as an elite Principal Telegram Bot / Mini-App (TMA) Security Architect, Cloudflare Serverless Infrastructure Engineer (Workers, Pages, D1, KV, Durable Objects, R2, Queues), Anti-Cheat Game Auditor, and Telegram ToS Compliance Specialist.

My Telegram project (Telegram Bot, Telegram WebApp / Mini-App, or Telegram Mini-Game) has finished its functional Vibe-Coding phase. Before launching to production, you must execute an **exhaustive, code-level Security, Serverless Resilience, Anti-Cheat, and Legal Hardening Protocol**.

## 📌 PRE-CONFIGURED OWNER & SUPPORT IDENTITY (MANDATORY INJECTION):
Whenever this protocol requires owner/company attribution, support links, legal notices, `/privacy`, `/terms`, `/support`, `/paysupport`, or UI footers, you MUST hardcode/configure these exact details:
- **Creator / Brand / Company Name:** `Botmaker Telegram` (`@Botmaker_Telegram`)
- **Official Telegram Channel & Support Link:** `https://t.me/Botmaker_Telegram` (Handle: `@Botmaker_Telegram`)
- **Official Contact & Legal Email:** `ragheb2025k@gmail.com`

## 🚨 CRITICAL EXECUTION ENGINE RULES (DO NOT VIOLATE):
To prevent context-window fatigue, superficial scanning, or breaking the bot/mini-app by modifying 25 files at once, you MUST execute this protocol in **5 STRICT SEQUENTIAL GATES (GATE 1 to GATE 5)**:

1. **ONE GATE AT A TIME (HARD STOP):** Right now, execute **ONLY GATE 1**. Do NOT execute Gate 2, 3, 4, or 5 until I explicitly reply with `NEXT` (or `ادامه`).
2. **ACTION OVER ADVICE:** Never give me theoretical advice if a fix can be written in code, `wrangler.toml`, SQL migrations, or middleware. **Write and apply the actual code fixes directly into my project files during each Gate.**
3. **PROOF OF WORK (NO FAKE CHECKMARKS):** You are strictly forbidden from marking an item as `SECURE` or `FIXED` without inspecting the exact file and line numbers. Every item in your Gate report MUST cite the exact `filepath:line_number` modified or verified.
4. **BUILD & TYPE CHECK BEFORE STOPPING:** At the end of EACH Gate, verify that your changes did not break syntax, types, or Cloudflare Worker bindings, output the **Gate Completion Report**, and **STOP** to wait for my `NEXT` command.

---

# ==========================================
# 🛑 GATE 1: SECRETS, CLOUDFLARE CONFIG (`wrangler.toml`) & WEBHOOK LOCKDOWN
# (Execute ONLY this Gate first, apply all code fixes, report, and STOP)
# ==========================================

### 1.1 Telegram & Serverless Architecture Discovery
Scan the entire workspace and output a brief profile:
- **Project Components:** [Telegram Bot / Telegram Mini-App (TMA) / Telegram HTML5 Mini-Game]
- **Bot Framework & Runtime:** [grammY / Telegraf / Raw Telegram Bot API / Python aiogram / Node.js / Cloudflare Workers / Pages]
- **Data & State Layer:** [Cloudflare D1 / KV / Durable Objects / R2 / Supabase / PostgreSQL / Redis]
- **Monetization & External APIs:** [Telegram Stars (`XTR`) / TON Connect & Crypto / Zarinpal & External Gateways / In-Game Coins / OpenAI & AI APIs]
- **Primary Language Detected:** [Persian / English / Bilingual]

### 1.2 Secrets, `wrangler.toml` & Frontend Bundle Hygiene
*   **1.2.1 Eradicate Hardcoded Secrets & `wrangler.toml` Leaks:**
    *   Scan all code and config files (`wrangler.toml`, `wrangler.json`, `.env`, frontend `.ts/.js` bundles).
    *   **CRITICAL CLOUDFLARE RULE:** NEVER place `BOT_TOKEN`, `WEBHOOK_SECRET`, `PAYMENT_PROVIDER_TOKEN`, `AI_API_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` inside the `[vars]` section of `wrangler.toml` (because `wrangler.toml` gets committed to Git!). Remove secrets from `[vars]`, document that they must be set via `npx wrangler secret put <KEY>`, and create a `.dev.vars.example` file while ensuring `.dev.vars` and `.env*` are in `.gitignore`.
*   **1.2.2 Zero Secrets in Mini-App / Mini-Game Frontend (Video Rule #1):**
    *   Ensure the Mini-App/Game client bundle (`VITE_`, `NEXT_PUBLIC_`, HTML/JS) contains **ZERO** private keys or `BOT_TOKEN`s. Anyone opening Chrome DevTools inside Telegram Desktop or mobile WebView must never be able to extract a secret key.
*   **1.2.3 Hide Bot Token from URLs & Error Logs:**
    *   Telegram Bot API URLs contain the secret token (`https://api.telegram.org/bot<TOKEN>/...`). Ensure global error handlers, `console.error`, and logging utilities **redact `<TOKEN>`** from any failed `fetch`/`axios` request URLs so a failed network log never leaks the Bot Token.

### 1.3 Webhook Security & Serverless Execution Safety
*   **1.3.1 Mandatory Webhook Secret Token Verification:**
    *   Every incoming Telegram Webhook POST request MUST verify the `X-Telegram-Bot-Api-Secret-Token` HTTP header against `env.TELEGRAM_WEBHOOK_SECRET` using a constant-time comparison (`crypto.subtle.timingSafeEqual` or equivalent) BEFORE parsing JSON or running bot logic. Return `401 Unauthorized` immediately if missing or mismatched.
*   **1.3.2 Secure Setup/Management Endpoints:**
    *   If the codebase has helper routes like `/setWebhook`, `/init`, `/seed`, or `/debug`, lock them behind a strict admin secret header or remove them from production so attackers cannot hijack the bot's webhook URL.
*   **1.3.3 Cloudflare Serverless `ctx.waitUntil()` & Timeout Resilience (CRITICAL FOR TELEGRAM):**
    *   Telegram retries webhooks if your server takes $> 5\text{–}10$ seconds or returns a `5xx` error, causing **infinite retry loops** where the bot sends duplicate messages or runs AI calls 20 times!
    *   Ensure the webhook handler validates the secret, wraps heavy background tasks (AI generation, broadcasting, analytics) inside Cloudflare's `ctx.waitUntil(...)` (or Queues), and always returns HTTP `200 OK` cleanly by catching unhandled exceptions inside the webhook pipeline.
*   **1.3.4 Update Deduplication (`update_id` Idempotency):**
    *   Protect critical commands/payments against duplicate Telegram webhook deliveries by tracking processed `update_id`s (or `telegram_payment_charge_id`) in D1/KV/DB or ignoring stale updates.

👉 **END OF GATE 1:** Apply all Gate 1 fixes now, run a syntax/type check, output the **Gate 1 Report Table** (Item #, Status, File:Line Modified, Summary), and **STOP**. Ask me to reply `NEXT` to proceed to Gate 2.

---

# ==========================================
# 🛑 GATE 2: MINI-APP (`initData`) CRYPTOGRAPHY, AUTH, ADMIN LOCKS & DB ISOLATION
# (Execute ONLY after the user replies `NEXT` to Gate 1)
# ==========================================

### 2.1 Telegram Mini-App (TMA) & Mini-Game Cryptographic Auth
*   **2.1.1 NEVER Trust `initDataUnsafe` on the Server:**
    *   Audit every API route called by the Mini-App or Mini-Game. If any route accepts `telegram_id`, `user_id`, or `username` directly from the request body/query without cryptographic verification, **FIX IT IMMEDIATELY**.
*   **2.1.2 Mandatory `HMAC-SHA256` `initData` Validation (Web Crypto API Compatible):**
    *   Implement/verify strict server-side middleware using Cloudflare Worker's native `crypto.subtle` (or Node `crypto`) that:
        1. Parses the raw `Telegram.WebApp.initData` query string sent in the `Authorization` header.
        2. Extracts `hash` and sorts all remaining `key=value` pairs alphabetically joined by `\n`.
        3. Derives the secret key via `HMAC_SHA256(key: "WebAppData", data: env.BOT_TOKEN)`.
        4. Computes `HMAC_SHA256(key: secretKey, data: dataCheckString)` and verifies it matches `hash` in constant time.
*   **2.1.3 Anti-Replay Expiration (`auth_date` Check):**
    *   Inside the `initData` validator, verify `Math.floor(Date.now() / 1000) - Number(auth_date) < 86400` (e.g., max 1–24 hours) so stolen `initData` strings cannot be replayed indefinitely.
*   **2.1.4 HTML5 Game Callback Signature Verification (If Telegram Game Engine):**
    *   If using `callback_query.game_short_name`, sign the game launch URL parameters (`user_id`, `inline_message_id` / `chat_id` + `message_id`, `timestamp`) with `HMAC-SHA256` on the server so users cannot forge `setGameScore` calls for other players.

### 2.2 Bot Access Control, Admin Locks & Group Chat Privacy
*   **2.2.1 Lock Admin Commands & Panels ("Hidden != Locked" - Video Rule #5):**
    *   Audit all admin commands (`/admin`, `/broadcast`, `/stats`, `/ban`, `/addbalance`, `/give`) and admin callback queries (`admin_*`).
    *   Enforce a strict server-side middleware check against an explicit allowlist of numeric Telegram `ctx.from.id`s stored in `env.ADMIN_TELEGRAM_IDS`.
    *   **NEVER** authenticate admins by `@username` (Telegram usernames can be changed/swapped and hijacked!).
*   **2.2.2 Callback Query Ownership & Tampering Defense:**
    *   When handling inline keyboard clicks (`callback_query.data`), never let User A click a button meant for User B in a group chat, or tamper with callback payloads (e.g., changing `withdraw_100` or `delete_order_55`) without verifying `order.telegram_id === ctx.from.id` on the server.
*   **2.2.3 Private vs. Group Chat Data Isolation:**
    *   Ensure commands that display sensitive user data (wallet balance, referral links, API keys, personal settings, order history) strictly check `ctx.chat.type === 'private'` (or reply via DM) so a user invoking the bot in a public group does not leak their private data to the whole group.

### 2.3 Database Security (Cloudflare D1 / KV / R2 / Supabase RLS)
*   **2.3.1 Strict Tenant Isolation & IDOR Elimination (Video Rule #2):**
    *   If using **Cloudflare D1 / SQL**: Every single `SELECT`, `UPDATE`, and `DELETE` query triggered by a user MUST explicitly bind `WHERE telegram_id = ?1` using the authenticated `ctx.from.id` / verified `initData.user.id`—never a client-supplied ID.
    *   If using **Supabase / PostgreSQL**: Enable Row-Level Security (RLS) on **EVERY table** with explicit CRUD policies, and ensure the Mini-App frontend never uses the `service_role` key.
*   **2.3.2 Cloudflare KV & R2 Key-Scoping & Private Access:**
    *   Prevent key-injection in Cloudflare KV/R2 (e.g., sanitize user keys so a user cannot pass `../admin_config` as a key name). Ensure R2 buckets storing private user uploads are NOT publicly enumerable and are served via Worker auth checks or signed URLs.

👉 **END OF GATE 2:** Apply all Gate 2 fixes now, verify build/types, output the **Gate 2 Report Table** (with exact `filepath:line`), and **STOP**. Ask me to reply `NEXT` to proceed to Gate 3.

---

# ==========================================
# 🛑 GATE 3: ANTI-CHEAT (MINI-GAMES/TMA), FINANCIAL LOGIC, TELEGRAM STARS & ATOMIC STATE
# (Execute ONLY after the user replies `NEXT` to Gate 2)
# ==========================================

### 3.1 Mini-Game & Mini-App Anti-Cheat Architecture (Server-Authoritative State)
*   **3.1.1 Zero Trust in Client Scores, Taps, or Coins:**
    *   Never trust endpoints like `POST /api/score { score: 999999 }` or `POST /api/claim { coins: 5000 }`.
    *   Enforce **Server-Authoritative Validation**:
        *   **Rate & Physics Plausibility:** Calculate maximum humanly possible taps/points per second elapsed since `last_sync_timestamp` (e.g., max 15–20 taps/sec) and reject/ban automated script spikes.
        *   **Energy / Stamina / Cooldown Enforcement:** Track energy regeneration and task timers strictly on the server using server timestamps (`Date.now()`), never client device clocks (which users manipulate by changing phone time).
*   **3.1.2 Sybil & Fake Referral Abuse Prevention:**
    *   In `start` payload referral systems (`/start ref_12345`):
        1. Block self-referrals (`referrer_id !== current_user_id`).
        2. Enforce a `UNIQUE` database constraint so each user can only ever be referred **ONCE** (on first registration).
        3. Validate that the `start` parameter matches a strict regex (`/^[a-zA-Z0-9_-]{1,64}$/`).

### 3.2 Atomic Financial Logic & Cloudflare KV Consistency Fix
*   **3.2.1 CRITICAL CLOUDFLARE KV WARNING (Eventual Consistency):**
    *   Cloudflare KV is **eventually consistent**! If wallet balances, coins, inventory, or coupon usage are stored solely in Cloudflare KV (`await env.KV.get('balance')` -> `await env.KV.put('balance', newBalance)`), 20 parallel clicks WILL cause massive **Double-Spending / Race Conditions**.
    *   Ensure all balances, inventory deductions, reward claims, and coupon redemptions use **Atomic SQL Operations in D1/Postgres** (`UPDATE users SET balance = balance - ?1 WHERE telegram_id = ?2 AND balance >= ?1 RETURNING balance`) or **Cloudflare Durable Objects** (single-threaded strongly consistent state).
*   **3.2.2 Server-Side Price & Upgrade Lookup:**
    *   Never accept item prices, upgrade costs, or VIP plan amounts from the Mini-App request body. Always look up costs from the server's authoritative config/DB.

### 3.3 Telegram Stars (`XTR`), Crypto (TON) & Payment Gateways
*   **3.3.1 Telegram Stars (`XTR`) & Bot Payments Hardening:**
    *   **Pre-Checkout Validation:** Handle `pre_checkout_query` within $< 10$ seconds by verifying the `invoice_payload`, checking that the item is still valid, and verifying that `total_amount` and `currency` match the server price before calling `answerPreCheckoutQuery(true)`.
    *   **Idempotent Delivery:** Only grant VIP/coins/items inside the `message:successful_payment` handler, and store `telegram_payment_charge_id` in a `UNIQUE` DB column so webhook retries never grant double items.
    *   **Refund Support Readiness:** Store `telegram_payment_charge_id` alongside the user's purchase record so `refundStarPayment` can be executed if needed.
*   **3.3.2 TON Connect / Crypto & External Gateways (Zarinpal, etc.):**
    *   If accepting TON or crypto: never trust a client-side `{ txHash, status: 'paid' }` message alone. Verify the transaction on-chain (confirming recipient wallet address, exact sender/memo/comment payload, amount, and unique `tx_hash`).
    *   If using external gateways (Stripe, Zarinpal, CryptoBot): verify webhook HMAC signatures or perform server-to-server `/verify` with exact expected amounts from DB and `UNIQUE` transaction ID locks.

👉 **END OF GATE 3:** Apply all Gate 3 fixes now, verify build/types, output the **Gate 3 Report Table** (with exact `filepath:line`), and **STOP**. Ask me to reply `NEXT` to proceed to Gate 4.

---

# ==========================================
# 🛑 GATE 4: ANTI-FLOOD, TELEGRAM `429` PROTECTION, AI WALLET GUARD & INJECTION DEFENSE
# (Execute ONLY after the user replies `NEXT` to Gate 3)
# ==========================================

### 4.1 Bot Anti-Flood, Broadcast Safety & Paid AI Wallet Guard
*   **4.1.1 Per-User Command & Callback Throttling (Video Rule #3):**
    *   Implement per-user rate limiting middleware on bot commands, inline button clicks, and Mini-App API routes (e.g., max 20–30 actions/min per `telegram_id`, returning `429` or answering callback query with a polite cooldown alert). This prevents malicious bots from spamming buttons and driving up Cloudflare Worker / DB read-write bills.
*   **4.1.2 Telegram Outgoing API Rate Limit Protection (`429 Retry After`):**
    *   Telegram limits bots to ~30 messages/sec globally and 1 message/sec per chat.
    *   If the bot has an Admin Broadcast feature (`/broadcast`), ensure it sends messages in throttled batches (e.g., 20–25 msgs/sec with delay or via Cloudflare Queues), gracefully handles `429 Too Many Requests` (`retry_after`), and catches `403 Forbidden: bot was blocked by the user` (marking the user as inactive in DB instead of crashing the broadcast loop).
*   **4.1.3 AI & Paid API Wallet Drain Defense:**
    *   If the bot/mini-app calls OpenAI, Claude, Gemini, Replicate, or paid third-party APIs:
        1. Enforce strict per-user daily/monthly usage quotas and concurrent job locks (so a user cannot send 10 prompts simultaneously).
        2. Enforce hard character caps on incoming Telegram text/captions and `max_tokens` on AI output.
        3. Isolate system prompts from user messages and ensure LLM function-calling tools are strictly scoped to the current user's `telegram_id`.

### 4.2 Injection, Markdown/HTML Escaping & Media Upload Defense
*   **4.2.1 SQL / NoSQL Injection Eradication:**
    *   Ensure 100% of Cloudflare D1 (`stmt.bind(...)`), Postgres, or ORM queries are parameterized. Zero string concatenation with `ctx.from.first_name`, `username`, or message text!
*   **4.2.2 Telegram `HTML` / `MarkdownV2` Injection & Crash Defense:**
    *   When echoing user names (`ctx.from.first_name`) or user inputs inside bot replies with `parse_mode: 'HTML'` or `'MarkdownV2'`, always escape special characters (`<`, `>`, `&` in HTML, or special symbols in MarkdownV2). Otherwise, a user with `<script>` or an unclosed `*` in their Telegram display name will crash `sendMessage` (`400 Bad Request: can't parse entities`) or spoof fake links!
*   **4.2.3 Mini-App XSS, Open Redirect & CORS Lockdown:**
    *   Escape all user names/avatars/messages rendered in the Mini-App UI (sanitize any `innerHTML` / `dangerouslySetInnerHTML`).
    *   Validate URLs passed to `Telegram.WebApp.openLink()` or `openTelegramLink()` against `javascript:` or untrusted phishing redirects.
    *   Lock CORS (`Access-Control-Allow-Origin`) on Mini-App backend APIs strictly to the Mini-App's production domain (never `*` on authenticated endpoints) and set `Content-Security-Policy` (`frame-ancestors https://web.telegram.org https://*.telegram.org`).
*   **4.2.4 Safe Telegram File Downloads, SSRF & EXIF Stripping:**
    *   If the bot downloads user photos/documents via `getFile`: validate file size (max 20MB for bots) and MIME/magic-bytes before processing.
    *   Remember that `https://api.telegram.org/file/bot<TOKEN>/<file_path>` contains your **SECRET BOT TOKEN**! Never send this raw Telegram file URL to other users or to the Mini-App frontend—proxy it through your Worker or re-upload to R2 after stripping GPS EXIF metadata.

👉 **END OF GATE 4:** Apply all Gate 4 fixes now, verify build/types, output the **Gate 4 Report Table** (with exact `filepath:line`), and **STOP**. Ask me to reply `NEXT` to proceed to Gate 5.

---

# ==========================================
# 🛑 GATE 5: TELEGRAM MANDATORY COMPLIANCE (`/privacy`, `/paysupport`, `/terms`) & OWNER BRANDING
# (Execute ONLY after the user replies `NEXT` to Gate 4)
# ==========================================

### 5.1 Mandatory Telegram Bot Compliance Commands (Auto-Ban Prevention)
Telegram strictly enforces bot compliance rules. Missing these commands can cause BotFather / Telegram Trust & Safety to suspend the bot or revoke payment access. You MUST implement and wire up the following directly in the bot and Mini-App:

*   **5.1.1 Centralized Legal & Owner Config (`legal.config.ts` / `.js` / `.py`):**
    Create a single configuration module containing the exact owner identity provided:
    - `BRAND_NAME`: `"Botmaker Telegram"`
    - `CREATOR_CHANNEL_URL`: `"https://t.me/Botmaker_Telegram"`
    - `SUPPORT_CHANNEL_HANDLE`: `"@Botmaker_Telegram"`
    - `CONTACT_EMAIL`: `"ragheb2025k@gmail.com"`
    - `LAST_UPDATED`: Current Date
*   **5.1.2 Mandatory `/privacy` Command (Required by Telegram for ALL Bots & Mini-Apps):**
    Implement a working `/privacy` command in the bot (matching the bot's primary language: Persian, English, or Bilingual) that clearly states:
    1. What Telegram data is collected (`user_id`, `first_name`, `username`, `language_code`, plus any game/order/app data).
    2. How the data is stored (Cloudflare / encrypted DB) and any third-party processors used (e.g., AI providers, payment gateways).
    3. How users can request data deletion (`/delete_my_data` or via support).
    4. Official Creator & Support Contact: **`https://t.me/Botmaker_Telegram`** and Email: **`ragheb2025k@gmail.com`**.
*   **5.1.3 Mandatory `/terms` & `/support` Commands:**
    Implement `/terms` (Terms of Service, acceptable use, anti-cheat rules, digital goods policy, AI/financial disclaimers if applicable) and `/support` (directing users with an inline button to **`https://t.me/Botmaker_Telegram`** and **`ragheb2025k@gmail.com`**).
*   **5.1.4 Mandatory `/paysupport` Command (CRITICAL IF PAYMENTS / STARS EXIST):**
    Telegram's Bot Payments & Stars Terms **strictly require** every bot offering goods/services to respond to `/paysupport`. Implement `/paysupport` (even if payments are planned for later) so it displays clear payment support instructions, transaction inquiry guidance, and a direct inline button to Support (**`https://t.me/Botmaker_Telegram`**) and Email (**`ragheb2025k@gmail.com`**).
*   **5.1.5 User Data Deletion (`/delete_my_data` / GDPR Compliance):**
    Implement a command or Mini-App settings button allowing a user to request account/data deletion (with a confirmation step so they don't click it by accident).

### 5.2 Mini-App / Mini-Game UI Legal & Privacy Hardening
*   **5.2.1 Self-Host Fonts & Stop IP Leaks (€100/visitor GDPR risk):**
    If there is a Mini-App/Web frontend, remove external `<link href="https://fonts.googleapis.com/...">` tags that leak user IPs without consent, and use local/self-hosted fonts instead.
*   **5.2.2 Mini-App Legal Modal / Footer & Support Button:**
    In the Mini-App UI (Settings, Profile, or Footer), add clean links/modals for **Privacy Policy**, **Terms of Service**, and a **Support / Contact Creator** button linking directly to `Telegram.WebApp.openTelegramLink('https://t.me/Botmaker_Telegram')` and displaying `ragheb2025k@gmail.com`.
*   **5.2.3 Crypto / Financial / AI Disclaimers (If Applicable):**
    If the bot/game includes airdrops, tokens, points, trading, or AI responses, include a clear disclaimer in `/terms` and the Mini-App UI stating that in-game points/coins have no guaranteed monetary value and AI/automated outputs are not financial, legal, or medical advice.

### 5.3 Final Master Report & Manual Cloudflare / BotFather Checklist
After completing Gate 5 and verifying that the entire project builds without errors, output the **Final Master Executive Summary**:
1.  **Gate 5 Report Table** (Items `5.1.1` to `5.2.3` with exact `filepath:line`).
2.  **Exact `npx wrangler` Commands for Production:**
    Give me the exact copy-paste terminal commands to set all secrets (`npx wrangler secret put ...`), run D1 migrations (`npx wrangler d1 migrations apply ... --remote`), and deploy.
3.  **Exact Telegram Webhook Registration Command:**
    Give me the exact `curl` command (including `secret_token` and `allowed_updates`) to securely register my production Cloudflare Worker URL with the Telegram Bot API.
4.  **BotFather Command List Copy-Paste Block:**
    Give me the exact formatted command list (`start`, `help`, `support`, `privacy`, `terms`, `paysupport`) so I can paste it directly into `@BotFather` -> `/setcommands` and `/setprivacy`.

---
🚀 **START NOW WITH GATE 1 ONLY.** Scan the codebase, apply all Gate 1 code and config fixes, output the Gate 1 Report Table with exact file/line citations, and STOP to wait for my `NEXT` command.
```