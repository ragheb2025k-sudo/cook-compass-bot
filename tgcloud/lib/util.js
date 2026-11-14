// tgcloud/lib/util.js — tiny shared helpers: Persian digits, HTML escaping,
// integer clamping, a defensive sleep (the runtime may not expose timers) and
// the ~N دقیقه time label.

const FA_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Convert Latin digits to Persian digits. */
export function fa(value) {
  return String(value).replace(/\d/g, (d) => FA_DIGITS[Number(d)]);
}

/** Escape a value for Telegram's HTML parse mode. */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Safely coerce to a bounded integer. */
export function clampInt(value, min, max, fallback) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Sleep that degrades to a no-op when timers are unavailable in the isolate. */
export async function sleep(ms) {
  try {
    await new Promise((resolve) => setTimeout(resolve, ms));
  } catch {
    // Timers unavailable — resolve immediately.
  }
}

/** Split a free-text ingredient list (فارسی و لاتین جداکننده‌ها). */
export function parseIngredientList(text) {
  return String(text ?? '')
    .split(/[،,؛;\n]+|\s+و\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && s.length <= 60)
    .slice(0, 12);
}

/** "~۳۵ دقیقه" */
export function timeLabel(minutes) {
  return `~${fa(minutes)} دقیقه`;
}
