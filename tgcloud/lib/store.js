// tgcloud/lib/store.js — the persistence layer.
//
// Stateless-execution contract: handlers never keep state in memory. Everything
// (FSM state, pantry selections, profiles, cooking history, plans) lives in the
// platform's built-in database, so any invocation can pick up where the last
// one left off.

import { db } from 'sdk';
import { eq, lt, and, gte, desc } from 'sdk/db';
import { profiles, sessions, cookingHistory, mealPlans } from '../schema.js';
import { SESSION_TTL_MS, HISTORY_DAYS } from './config.js';

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
