// tgcloud/lib/format.js — Persian HTML renderers: the strict recipe card
// template, the 7-day plan overview, the categorized shopping list and the
// chunker that keeps every message under Telegram's 4096-char limit.

import { BOT, WEEKDAYS_FA } from './config.js';
import { esc, fa, timeLabel } from './util.js';

function footer() {
  return `🧭 ${esc(BOT.name)} | ${esc(BOT.username)}`;
}

/**
 * The strict recipe card — every recipe the bot sends uses this template:
 *   نام غذا + زمان + سطح سختی
 *   مواد لازم (دقیقاً به اندازه نفرات)
 *   مراحل پخت (شماره‌گذاری‌شده)
 *   ترفند سرآشپز
 *   فوتر کوتاه
 */
export function recipeCard(recipe, { headerNote = null, pickedNote = null } = {}) {
  const lines = [];
  lines.push(`🍽 <b>${esc(recipe.name)}</b>`);
  lines.push(`⏱ ${timeLabel(recipe.timeMin)} | 📊 ${esc(recipe.difficulty)}${recipe.category ? ` | 🏷 ${esc(recipe.category)}` : ''}`);
  if (recipe.household) lines.push(`👩‍🍳 دستور برای ${recipe.household >= 7 ? '۶ نفر یا بیشتر' : `${fa(recipe.household)} نفر`}`);
  if (recipe.why) lines.push(`💬 ${esc(recipe.why)}`);
  if (headerNote) lines.push('', headerNote);

  lines.push('', '🛒 <b>مواد لازم:</b>');
  for (const ing of recipe.ingredients) {
    lines.push(`• ${esc(ing.name)}${ing.qty ? ` — ${esc(ing.qty)}` : ''}`);
  }

  if (recipe.steps?.length) {
    lines.push('', '👨‍🍳 <b>مراحل پخت:</b>');
    recipe.steps.forEach((step, i) => {
      lines.push(`${fa(i + 1)}. ${esc(step)}`);
    });
  }

  if (recipe.chefTip) {
    lines.push('', `💡 <b>ترفند سرآشپز:</b> ${esc(recipe.chefTip)}`);
  }

  if (pickedNote) lines.push('', pickedNote);
  lines.push('', footer());
  return lines.join('\n');
}

/** Day-by-day 7-day overview (ناهار + جایگزین + شام + جایگزین + تگ شام سبک). */
export function planOverview(plan, household) {
  const lines = [];
  for (const day of plan.days) {
    const label = WEEKDAYS_FA[day.n - 1] ?? `روز ${fa(day.n)}`;
    lines.push(`🟠 <b>روز ${fa(day.n)} — ${esc(label)}</b>`);
    lines.push(`• ☀️ ناهار: ${esc(day.lunch || '—')}`);
    if (day.lunchAlt) lines.push(`  🔁 جایگزین: ${esc(day.lunchAlt)}`);
    const lightTag = day.dinnerLight ? ' 🥗 <i>(سبک)</i>' : '';
    lines.push(`• 🌙 شام: ${esc(day.dinner || '—')}${lightTag}`);
    if (day.dinnerAlt) lines.push(`  🔁 جایگزین: ${esc(day.dinnerAlt)}`);
  }
  if (plan.mode === 'batch' && plan.batchNotes?.length) {
    lines.push('', '🫙 <b>یادداشت‌های پخت و فریز:</b>');
    for (const note of plan.batchNotes) lines.push(`• ${esc(note)}`);
  }
  return lines.join('\n');
}

/** Categorized shopping checklist. */
export function shoppingListText(shoppingList) {
  const lines = [];
  for (const cat of shoppingList) {
    lines.push('', `<b>${esc(cat.category)}:</b>`);
    for (const item of cat.items) {
      lines.push(`• ${esc(item.name)}${item.qty ? ` — ${esc(item.qty)}` : ''}`);
    }
  }
  return lines.join('\n');
}

/** Group recipe cards into messages under ~3900 characters. */
export function chunkRecipes(cards, maxLen = 3900) {
  const chunks = [];
  let current = [];
  let size = 0;
  for (const card of cards) {
    if (current.length && size + card.length > maxLen) {
      chunks.push(current.join('\n\n'));
      current = [];
      size = 0;
    }
    current.push(card);
    size += card.length;
  }
  if (current.length) chunks.push(current.join('\n\n'));
  return chunks;
}

/** Item list preview for the pantry message. */
export function pantrySelectionSummary(session) {
  const items = session?.pantry?.items ?? [];
  const custom = session?.pantry?.custom ?? [];
  const all = [...items, ...custom];
  if (all.length === 0) return '';
  return `\n🧺 انتخاب‌ها: ${all.map(esc).join('، ')}`;
}
