// tgcloud/schema.js — database tables for «قطب‌نمای آشپزی» (@CookCompassBot).
//
// The platform's built-in SQLite-backed database is the bot's single source of
// truth: profiles, the 14-day cooking history, the per-chat FSM state (the
// stateless replacement for external Redis) and the weekly meal plans.

import { table, integer, text, json, index, sql } from 'sdk/db';

// ---------------------------------------------------------------------------
// User profile — filled during onboarding, editable from ⚙️ settings.
// ---------------------------------------------------------------------------
export const profiles = table('profiles', {
  tgId:      integer('tg_id').primaryKey(),
  diet:      text('diet').notNull().default('none'),    // none | vegetarian | no_red_meat | no_dairy
  household: integer('household').notNull().default(2), // 1..7 (7 means "6 or more")
  skill:     text('skill').notNull().default('simple'), // simple | medium
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

// ---------------------------------------------------------------------------
// Cooking history — every dish the user actually commits to. The AI reads the
// last 14 days and is forbidden from repeating any of them.
// ---------------------------------------------------------------------------
export const cookingHistory = table('cooking_history', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  tgId:     integer('tg_id').notNull(),
  dish:     text('dish').notNull(),
  source:   text('source').notNull().default('decide'), // decide | rescue | random | plan
  meta:     json('meta'),
  cookedAt: integer('cooked_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (t) => ({
  byUser: index('idx_history_user').on(t.tgId, t.cookedAt),
}));

// ---------------------------------------------------------------------------
// Sessions — per-chat FSM state + temporary selections (pantry grid, decision
// queue, onboarding draft). TTL-enforced; swept lazily. This is the stateless
// execution contract: handlers never keep anything in memory.
// ---------------------------------------------------------------------------
export const sessions = table('sessions', {
  chatId:    integer('chat_id').primaryKey(),
  data:      json('data').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
}, (t) => ({
  expIdx: index('idx_sessions_expiry').on(t.expiresAt),
}));

// ---------------------------------------------------------------------------
// Meal plans — the latest generated 7-day lunch/dinner plan per user, so the
// shopping list and recipes can be re-sent without a new AI call.
// ---------------------------------------------------------------------------
export const mealPlans = table('meal_plans', {
  tgId:         integer('tg_id').primaryKey(),
  mode:         text('mode').notNull().default('simple'), // simple | batch
  days:         json('days').notNull(),
  recipes:      json('recipes').notNull(),
  shoppingList: json('shopping_list').notNull(),
  createdAt:    integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
