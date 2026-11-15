// tgcloud/lib/store.js — the persistence layer.
//
// Stateless-execution contract: handlers never keep state in memory. Everything
// (FSM state, pantry selections, profiles, cooking history, plans) lives in the
// platform's built-in database, so any invocation can pick up where the last
// one left off.

import { db } from 'sdk';
import { eq, lt, and, gte, desc } from 'sdk/db';
import { profiles, sessions, cookingHistory, mealPlans, savedRecipes, seenUpdates, rateLimits, aiUsage } from '../schema.js';
import { SESSION_TTL_MS, HISTORY_DAYS, SAVED_RECIPES_CAP, GUARDS } from './config.js';

/* ------------------------------------------------------------------ */
/* Profiles                                                            */
/* ------------------------------------------------------------------ */

export async function getProfile(tgId) {
  const row = await db.select().from(profiles).where(eq(profiles.tgId, tgId)).get();
  return row ?? null;
}

/** Upsert a profile patch (diet / household / skill). */
export async function saveProfile(tgId, patch) {
  const now = new Date();
  await db.insert(profiles)
    .values({ tgId, ...patch, updatedAt: now })
    .onConflictDoUpdate({
      target: profiles.tgId,
      set: { ...patch, updatedAt: now },
    })
    .run();
}

/* ------------------------------------------------------------------ */
/* Sessions — per-chat FSM state with TTL                              */
/* ------------------------------------------------------------------ */

/** Returns the session data object, or null when missing/expired. */
export async function getSession(chatId) {
  const row = await db.select().from(sessions).where(eq(sessions.chatId, chatId)).get();
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await deleteSession(chatId);
    return null;
  }
  return row.data;
}

export async function setSession(chatId, data) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions)
    .values({ chatId, data, expiresAt })
    .onConflictDoUpdate({
      target: sessions.chatId,
      set: { data, expiresAt },
    })
    .run();
  // Lazy sweep — keep the table small without a background job.
  if (Math.random() < 0.15) {
    await db.delete(sessions).where(lt(sessions.expiresAt, Math.floor(Date.now() / 1000))).run();
  }
}

export async function deleteSession(chatId) {
  await db.delete(sessions).where(eq(sessions.chatId, chatId)).run();
}

/* ------------------------------------------------------------------ */
/* Cooking history — feeds the 14-day no-repeat rule                   */
/* ------------------------------------------------------------------ */

export async function addHistory(tgId, dish, source = 'decide', meta = null) {
  await db.insert(cookingHistory)
    .values({ tgId, dish: String(dish).slice(0, 160), source, meta: meta ?? undefined })
    .run();
}

export async function addHistoryMany(tgId, dishes, source = 'plan') {
  const rows = dishes
    .map((d) => String(d).trim())
    .filter(Boolean)
    .slice(0, 30)
    .map((dish) => ({ tgId, dish: dish.slice(0, 160), source }));
  if (rows.length === 0) return;
  await db.insert(cookingHistory).values(rows).run();
}

/** Distinct dish names cooked within the last `days` days (newest first). */
export async function getRecentDishes(tgId, days = HISTORY_DAYS) {
  // Where-clause comparisons take raw values — pass epoch seconds, not Date.
  const sinceSec = Math.floor((Date.now() - days * 24 * 60 * 60 * 1000) / 1000);
  const rows = await db.select({ dish: cookingHistory.dish })
    .from(cookingHistory)
    .where(and(eq(cookingHistory.tgId, tgId), gte(cookingHistory.cookedAt, sinceSec)))
    .orderBy(desc(cookingHistory.cookedAt))
    .limit(80)
    .all();
  return [...new Set(rows.map((r) => r.dish))];
}

export async function clearHistory(tgId) {
  await db.delete(cookingHistory).where(eq(cookingHistory.tgId, tgId)).run();
}

export async function countRecentHistory(tgId, days = HISTORY_DAYS) {
  const dishes = await getRecentDishes(tgId, days);
  return dishes.length;
}

/* ------------------------------------------------------------------ */
/* Saved recipes — «📚 دستورهای من» — MANUAL archive. A dish lands here
/* only when the user taps «💾 ذخیره» on a served recipe card (the save
/* callback carries a stable bank index / rescue-idea id, so old message
/* buttons keep working). Only the NAME is stored; cards are re-rendered
/* fresh from lib/recipeBank.js + lib/rescue.js at open time. No TTL:
/* entries stay until the user deletes them (per item or wipe).
/* ------------------------------------------------------------------ */

/** Insert dish names (deduped against the existing archive), oldest
 *  overflow beyond SAVED_RECIPES_CAP pruned. Order preserved: newest last. */
export async function addSavedRecipes(tgId, dishes, source = 'decide') {
  const names = [...new Set((dishes ?? [])
    .map((d) => String(d ?? '').trim())
    .filter(Boolean)
    .slice(0, 10))];
  if (names.length === 0) return;
  const existing = await db.select({ dish: savedRecipes.dish })
    .from(savedRecipes).where(eq(savedRecipes.tgId, tgId)).all();
  const have = new Set(existing.map((r) => r.dish));
  const fresh = names.filter((n) => !have.has(n));
  if (fresh.length === 0) return;
  await db.insert(savedRecipes)
    .values(fresh.map((dish) => ({ tgId, dish: dish.slice(0, 160), source })))
    .run();
  // Keep the archive bounded — drop the OLDEST rows beyond the cap.
  if (existing.length + fresh.length > SAVED_RECIPES_CAP) {
    const overflow = existing.length + fresh.length - SAVED_RECIPES_CAP;
    const oldest = await db.select({ id: savedRecipes.id })
      .from(savedRecipes).where(eq(savedRecipes.tgId, tgId))
      .orderBy(savedRecipes.id).limit(overflow).all();
    for (const row of oldest) {
      await db.delete(savedRecipes).where(eq(savedRecipes.id, row.id)).run();
    }
  }
}

/** Saved dishes, newest first — optional offset/limit paging. `id` is
 *  included so the per-item delete callback can target a row exactly. */
export async function getSavedRecipes(tgId, { offset = 0, limit = 100 } = {}) {
  const rows = await db.select({ id: savedRecipes.id, dish: savedRecipes.dish, source: savedRecipes.source })
    .from(savedRecipes)
    .where(eq(savedRecipes.tgId, tgId))
    .orderBy(desc(savedRecipes.id))
    .limit(limit)
    .offset(offset)
    .all();
  return rows;
}

export async function countSavedRecipes(tgId) {
  const rows = await db.select({ dish: savedRecipes.dish })
    .from(savedRecipes).where(eq(savedRecipes.tgId, tgId)).all();
  return rows.length;
}

/** Per-item delete (user-driven from the archive menu). */
export async function removeSavedRecipe(tgId, id) {
  await db.delete(savedRecipes).where(and(eq(savedRecipes.tgId, tgId), eq(savedRecipes.id, id))).run();
}

/** Has the user already saved this dish name? */
export async function hasSavedRecipe(tgId, dish) {
  const rows = await db.select({ dish: savedRecipes.dish })
    .from(savedRecipes).where(eq(savedRecipes.tgId, tgId)).all();
  return rows.some((r) => r.dish === dish);
}

export async function clearSavedRecipes(tgId) {
  await db.delete(savedRecipes).where(eq(savedRecipes.tgId, tgId)).run();
}

/* ------------------------------------------------------------------ */
/* Meal plans — latest plan per user                                   */
/* ------------------------------------------------------------------ */

export async function savePlan(tgId, plan) {
  const now = new Date();
  await db.insert(mealPlans)
    .values({
      tgId,
      mode: plan.mode,
      days: plan.days,
      recipes: plan.recipes,
      shoppingList: plan.shoppingList,
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: mealPlans.tgId,
      set: {
        mode: plan.mode,
        days: plan.days,
        recipes: plan.recipes,
        shoppingList: plan.shoppingList,
        createdAt: now,
      },
    })
    .run();
}

export async function getPlan(tgId) {
  const row = await db.select().from(mealPlans).where(eq(mealPlans.tgId, tgId)).get();
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Security guards — idempotency, throttle, AI quota (Gate 1.3.4,      */
/* 4.1.1, 4.1.3). All DB-backed: the stateless contract holds.         */
/* ------------------------------------------------------------------ */

/**
 * Duplicate-webhook idempotency (Gate 1.3.4). Marks an update as seen and
 * returns true when it was ALREADY processed inside the TTL window — the
 * caller then silently drops the redelivery.
 * key = "m:<chatId>:<message_id>" for messages, "c:<callback_id>" for presses.
 */
export async function seenRecently(key, chatId = null) {
  const nowSec = Math.floor(Date.now() / 1000);
  const row = await db.select().from(seenUpdates).where(eq(seenUpdates.key, String(key))).get();
  if (row && nowSec - row.createdAt < GUARDS.SEEN_TTL_SEC) return true;
  await db.insert(seenUpdates)
    .values({ key: String(key), chatId, createdAt: nowSec })
    .onConflictDoUpdate({ target: seenUpdates.key, set: { createdAt: nowSec } })
    .run();
  // Lazy sweep of expired keys.
  if (Math.random() < 0.1) {
    await db.delete(seenUpdates).where(lt(seenUpdates.createdAt, nowSec - GUARDS.SEEN_TTL_SEC)).run();
  }
  return false;
}

/**
 * Per-chat rolling 60s throttle (Gate 4.1.1). Increments the counter and
 * returns true when the user has exceeded MAX_ACTIONS_PER_MIN.
 */
export async function hitRateLimit(chatId) {
  const nowSec = Math.floor(Date.now() / 1000);
  const row = await db.select().from(rateLimits).where(eq(rateLimits.chatId, chatId)).get();
  if (!row || nowSec - row.windowStart >= 60) {
    await db.insert(rateLimits)
      .values({ chatId, windowStart: nowSec, count: 1 })
      .onConflictDoUpdate({ target: rateLimits.chatId, set: { windowStart: nowSec, count: 1 } })
      .run();
    return false;
  }
  const count = (row.count ?? 0) + 1;
  await db.update(rateLimits).set({ count }).where(eq(rateLimits.chatId, chatId)).run();
  return count > GUARDS.MAX_ACTIONS_PER_MIN;
}

/**
 * Per-user daily AI quota (Gate 4.1.3). Increments the counter, returns
 * { allowed, remaining } — call right before every AI invocation.
 */
export async function aiQuota(tgId) {
  const dayKey = new Date().toISOString().slice(0, 10);
  const key = `${tgId}:${dayKey}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 2 * 24 * 60 * 60; // swept after 48h
  const row = await db.select().from(aiUsage).where(eq(aiUsage.key, key)).get();
  const count = (row?.count ?? 0) + 1;
  await db.insert(aiUsage)
    .values({ key, tgId, count, expiresAt })
    .onConflictDoUpdate({ target: aiUsage.key, set: { count, expiresAt } })
    .run();
  // Lazy sweep of stale days.
  if (Math.random() < 0.1) {
    await db.delete(aiUsage).where(lt(aiUsage.expiresAt, Math.floor(Date.now() / 1000))).run();
  }
  return { allowed: count <= GUARDS.AI_DAILY_LIMIT, remaining: Math.max(0, GUARDS.AI_DAILY_LIMIT - count) };
}

/** GDPR / Telegram data-deletion (Gate 5.1.5): wipe every trace of a user. */
export async function deleteAllUserData(tgId) {
  await deleteSession(tgId);
  await db.delete(profiles).where(eq(profiles.tgId, tgId)).run();
  await db.delete(cookingHistory).where(eq(cookingHistory.tgId, tgId)).run();
  await db.delete(mealPlans).where(eq(mealPlans.tgId, tgId)).run();
  await db.delete(savedRecipes).where(eq(savedRecipes.tgId, tgId)).run();
  await db.delete(rateLimits).where(eq(rateLimits.chatId, tgId)).run();
  await db.delete(aiUsage).where(eq(aiUsage.tgId, tgId)).run();
  await db.delete(seenUpdates).where(eq(seenUpdates.chatId, tgId)).run();
}
