// tgcloud/lib/onboarding.js — multi-step profile setup, persisted in the
// sessions table (never in memory): محدودیت غذایی → پرهیزها/حساسیت → تعداد نفرات
// → سطح آشپزی. Also powers the single-field edits from ⚙️ settings; the
// پرهیزها step additionally accepts a typed free-text list ( allergies & dislikes ).

import { sendMessage, editMessageText, answerCb } from './telegram.js';
import { obDietKb, obHouseholdKb, obSkillKb, obAvoidKb, menuKb } from './keyboards.js';
import { WELCOME_NEW, onboardingQuestion, profileSaved, avoidListUpdated, AVOID_EMPTY_ALERT } from './texts.js';
import { setSession, getSession, deleteSession, saveProfile, countRecentHistory } from './store.js';
import { DIET_OPTIONS, SKILL_OPTIONS } from './config.js';
import { parseIngredientList } from './util.js';

const NEXT_STEP = { diet: 'avoid', avoid: 'household', household: 'skill', skill: null };

/** Begin (or resume) onboarding. */
export async function startOnboarding(chatId, { edit = false, messageId = null, draft = {} } = {}) {
  await setSession(chatId, { flow: 'onboarding', step: 'diet', ob: { ...draft }, pantry: {} });
  const text = WELCOME_NEW;
  if (edit && messageId) {
    await editMessageText(chatId, messageId, text, obDietKb());
  } else {
    await sendMessage(chatId, text, obDietKb());
  }
}

/** Begin a single-field edit (from profile settings). */
export async function editField(chatId, field, profile, messageId) {
  const session = {
    flow: 'onboarding',
    step: field,
    returnToMenu: true,
    ob: {
      diet: profile?.diet ?? 'none',
      household: profile?.household ?? 2,
      skill: profile?.skill ?? 'simple',
      avoidFoods: Array.isArray(profile?.avoidFoods) ? profile.avoidFoods : [],
    },
    pantry: {},
  };
  await setSession(chatId, session);
  await editMessageText(chatId, messageId, onboardingQuestion(field), kbForStep(field));
}

function kbForStep(step) {
  if (step === 'diet') return obDietKb();
  if (step === 'avoid') return obAvoidKb();
  if (step === 'household') return obHouseholdKb();
  if (step === 'skill') return obSkillKb();
  return menuKb();
}

/** «هیچ / ندارم / هیچی» → no restrictions at all. */
function isNoRestrictionText(text) {
  const t = String(text ?? '').trim().toLowerCase();
  return /^(هیچ|ندارم|نیست|هیچی|لازم نیست|no|none|nothing)/.test(t) || t.length <= 5;
}

/**
 * Free text while an onboarding session is active.
 * The پرهیزها (avoid) step accepts a typed ingredient list; other steps just
 * repeat their question — they are answered with inline buttons.
 */
export async function handleOnboardingText(chatId, session, text) {
  const step = session.step ?? 'diet';
  const current = session ?? {};
  const ob = { diet: 'none', household: 2, skill: 'simple', avoidFoods: [], ...(current.ob ?? {}) };

  if (step !== 'avoid') {
    // This question is answered with buttons — repeat it as a gentle hint.
    await sendMessage(chatId, `${onboardingQuestion(step)}\n\n<i>لطفاً از دکمه‌های زیر استفاده کن 👇</i>`, kbForStep(step));
    return;
  }

  if (isNoRestrictionText(text)) {
    await finishAvoidStep(chatId, { ...session, ob }, []);
    return;
  }

  const items = parseIngredientList(text).slice(0, 12);
  if (items.length === 0) {
    await sendMessage(chatId, AVOID_EMPTY_ALERT, obAvoidKb());
    return;
  }
  console.info('[onboarding] avoid items:', items.join('، '));
  await finishAvoidStep(chatId, { ...session, ob }, items);
}

/** Persist the پرهیزها answer: either advance onboarding or save an edit. */
async function finishAvoidStep(chatId, session, items) {
  const ob = { ...session.ob, avoidFoods: items };
  const next = NEXT_STEP.avoid;

  if (session.returnToMenu) {
    // Single-field edit from ⚙️ settings — save immediately and go back.
    await saveProfile(chatId, { avoidFoods: items });
    await deleteSession(chatId);
    await sendMessage(chatId, avoidListUpdated(items), menuKb());
    return;
  }

  // Full onboarding — advance to the next question (نفرات).
  await setSession(chatId, { flow: 'onboarding', step: next, ob, pantry: {} });
  const prefix = items.length
    ? `✅ ثبت شد: <i>${items.map((i) => `${escapeHtml(i)}`).join('، ')}</i> — توی هیچ پیشنهادی نمی‌آید.\n\n`
    : '';
  await sendMessage(chatId, `${prefix}${onboardingQuestion(next)}`, kbForStep(next));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Handle ob:* callbacks — data = "ob:<field>:<value>".
 * In full onboarding we advance step by step; in single-field edit mode we
 * persist immediately and return to the main menu.
 */
export async function handleObCallback(chatId, messageId, data, cqId) {
  const [, rawField, value] = data.split(':');
  // Keyboards emit "ob:hh:<n>" — normalize to the canonical field name so
  // NEXT_STEP and the setter share one vocabulary.
  const field = rawField === 'hh' ? 'household' : rawField;
  const current = (await getSession(chatId)) ?? {};
  const ob = { diet: 'none', household: 2, skill: 'simple', avoidFoods: [], ...(current.ob ?? {}) };
  const returnToMenu = current.returnToMenu ?? false;

  if (field === 'diet') ob.diet = DIET_OPTIONS.some((o) => o.key === value) ? value : 'none';
  else if (field === 'avoid' && value === 'none') ob.avoidFoods = [];
  else if (field === 'household') ob.household = Math.min(7, Math.max(1, Number(value) || 2));
  else if (field === 'skill') ob.skill = SKILL_OPTIONS.some((o) => o.key === value) ? value : 'simple';
  else {
    await answerCb(cqId, 'دستور نامعتبر بود', false);
    return;
  }

  const next = NEXT_STEP[field];
  if (!returnToMenu && next) {
    // Full onboarding — advance to the next question.
    await setSession(chatId, { flow: 'onboarding', step: next, ob, pantry: {} });
    await editMessageText(chatId, messageId, onboardingQuestion(next), kbForStep(next));
    await answerCb(cqId);
    return;
  }

  // Final step of onboarding, or a single-field edit → persist the profile.
  await saveProfile(chatId, {
    diet: ob.diet,
    household: ob.household,
    skill: ob.skill,
    avoidFoods: Array.isArray(ob.avoidFoods) ? ob.avoidFoods : [],
  });
  await deleteSession(chatId);
  console.info('[onboarding] profile saved:', JSON.stringify({ diet: ob.diet, household: ob.household, skill: ob.skill, avoidFoods: ob.avoidFoods }));
  const historyCount = await countRecentHistory(chatId);
  await editMessageText(chatId, messageId, profileSaved(ob, historyCount), menuKb());
  await answerCb(cqId, 'ذخیره شد ✅');
}
