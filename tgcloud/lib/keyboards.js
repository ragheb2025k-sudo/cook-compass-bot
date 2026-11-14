// tgcloud/lib/keyboards.js — inline keyboard builders.
// Callback data vocabulary (all ≤ 64 bytes):
//   menu | menu:fridge | menu:rescue | menu:plan | menu:random | menu:profile
//   ob:diet:<key> | ob:hh:<n> | ob:skill:<key>
//   pa:<index> (pantry toggle) | pa:go | pa:clear | pa:text
//   fl:<key> (filter toggle)
//   dec:next | dec:pick | dec:again
//   rnd | rnd:again | rnd:add
//   pl:simple | pl:batch | pl:shop | pl:cook | pl:again
//   pr | pr:edit:diet | pr:edit:household | pr:edit:skill | pr:clearhist | pr:clearhist:yes
//   retry

import { PANTRY_ITEMS, FILTERS, DIET_OPTIONS, SKILL_OPTIONS, WEEKDAYS_FA } from './config.js';

export const kb = (rows) => ({ inline_keyboard: rows });
const btn = (text, callback_data) => ({ text, callback_data });

export const MENU_ROW = [[btn('🏠 منوی اصلی', 'menu')]];

export function menuKb() {
  return kb([
    [btn('🧊 یخچالم چی داره؟', 'menu:fridge')],
    [btn('🚑 نجات مواد در حال فساد', 'menu:rescue')],
    [btn('📅 برنامه غذایی هفتگی', 'menu:plan')],
    [btn('🎰 گردونه شانس', 'menu:random')],
    [btn('⚙️ تنظیمات من', 'menu:profile')],
  ]);
}

export function obDietKb() {
  const rows = DIET_OPTIONS.map((o) => [btn(o.label, `ob:diet:${o.key}`)]);
  rows.push([btn('🏠 منوی اصلی', 'menu')]);
  return kb(rows);
}

export function obHouseholdKb() {
  const rows = [];
  for (const n of [1, 2, 3, 4, 5, 6]) rows.push([btn(`${n} نفر`, `ob:hh:${n}`)]);
  rows.push([btn('۶ نفر یا بیشتر', 'ob:hh:7')]);
  rows.push([btn('🏠 منوی اصلی', 'menu')]);
  return kb(rows);
}

export function obSkillKb() {
  const rows = SKILL_OPTIONS.map((o) => [btn(o.label, `ob:skill:${o.key}`)]);
  rows.push([btn('🏠 منوی اصلی', 'menu')]);
  return kb(rows);
}

function pantryGrid(session) {
  const selected = new Set(session?.pantry?.items ?? []);
  const rows = [];
  for (let i = 0; i < PANTRY_ITEMS.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, PANTRY_ITEMS.length); j++) {
      const item = PANTRY_ITEMS[j];
      const on = selected.has(item);
      row.push(btn(`${on ? '✅' : '⬜'} ${item}`, `pa:${j}`));
    }
    rows.push(row);
  }
  return rows;
}

function filterRows(session) {
  const active = new Set(session?.pantry?.filters ?? []);
  const rows = [];
  for (let i = 0; i < FILTERS.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, FILTERS.length); j++) {
      const f = FILTERS[j];
      row.push(btn(active.has(f.key) ? `${f.label} ✅` : f.label, `fl:${f.key}`));
    }
    rows.push(row);
  }
  return rows;
}

export function pantryKb(session) {
  const rows = [...pantryGrid(session), ...filterRows(session)];
  rows.push([btn('✅ پیشنهاد غذا بده!', 'pa:go')]);
  rows.push([btn('🧹 پاک کردن انتخاب‌ها', 'pa:clear'), btn('🏠 منوی اصلی', 'menu')]);
  return kb(rows);
}

export function customIngredientsKb() {
  return kb([
    [btn('✅ پیشنهاد غذا بده!', 'pa:go')],
    [btn('✖️ شروع تازه', 'pa:clear'), btn('🏠 منوی اصلی', 'menu')],
  ]);
}

export function decideKb(isLast) {
  const rows = [[btn('✅ همینه!', 'dec:pick'), btn(isLast ? '🏁 آخرین گزینه' : '❌ بعدی', 'dec:next')]];
  rows.push([btn('🔄 پیشنهادهای تازه', 'dec:again')]);
  rows.push([btn('🎰 گردونه شانس', 'rnd'), btn('🏠 منوی اصلی', 'menu')]);
  return kb(rows);
}

export function decideExhaustedKb() {
  return kb([
    [btn('🔄 پیشنهاد تازه', 'dec:again')],
    [btn('🎰 گردونه شانس', 'rnd')],
    [btn('🏠 منوی اصلی', 'menu')],
  ]);
}

export function randomKb() {
  return kb([
    [btn('✅ ثبت در سابقه پخت', 'rnd:add')],
    [btn('🔄 بچرخون دوباره', 'rnd:again')],
    [btn('🏠 منوی اصلی', 'menu')],
  ]);
}

export function planModeKb() {
  return kb([
    [btn('🗓 برنامه ساده', 'pl:simple')],
    [btn('🫙 پخت و فریز (پایه مشترک)', 'pl:batch')],
    [btn('🏠 منوی اصلی', 'menu')],
  ]);
}

export function planKb(plan) {
  const rows = [];
  const days = plan?.days ?? [];
  for (let i = 0; i < days.length; i += 2) {
    const row = [];
    for (let j = i; j < Math.min(i + 2, days.length); j++) {
      const d = days[j];
      const label = WEEKDAYS_FA[d.n - 1] ?? `روز ${d.n}`;
      row.push(btn(`🍲 روز ${d.n} (${label})`, `pl:cook:${d.n}`));
    }
    rows.push(row);
  }
  rows.push([btn('🛒 لیست خرید', 'pl:shop')]);
  rows.push([btn('🔄 برنامه جدید', 'menu:plan'), btn('🏠 منوی اصلی', 'menu')]);
  return kb(rows);
}

export function profileKb() {
  return kb([
    [btn('🥦 محدودیت غذایی', 'pr:edit:diet')],
    [btn('👥 تعداد نفرات', 'pr:edit:household')],
    [btn('🥄 سطح آشپزی', 'pr:edit:skill')],
    [btn('🧹 پاک‌سازی سابقه پخت', 'pr:clearhist')],
    [btn('🏠 منوی اصلی', 'menu')],
  ]);
}

export function historyClearKb() {
  return kb([
    [btn('🧹 بله، پاک کن', 'pr:clearhist:yes')],
    [btn('✖️ بی‌خیال', 'pr')],
  ]);
}

export function rescueKb() {
  return kb([
    [btn('🏠 منوی اصلی', 'menu')],
  ]);
}
