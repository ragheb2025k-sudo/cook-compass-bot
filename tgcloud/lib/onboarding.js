// tgcloud/lib/onboarding.js — multi-step profile setup, persisted in the
// sessions table (never in memory): محدودیت غذایی → تعداد نفرات → سطح آشپزی.
// Also powers the single-field edits from ⚙️ settings.

import { sendMessage, editMessageText, answerCb } from './telegram.js';
import { obDietKb, obHouseholdKb, obSkillKb, menuKb } from './keyboards.js';
import { WELCOME_NEW, onboardingQuestion, profileSaved } from './texts.js';
import { setSession, getSession, deleteSession, saveProfile, countRecentHistory } from './store.js';
import { DIET_OPTIONS, SKILL_OPTIONS } from './config.js';

const NEXT_STEP = { diet: 'household', household: 'skill', skill: null };

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
    },
    pantry: {},
  };
  await setSession(chatId, session);
  await editMessageText(chatId, messageId, onboardingQuestion(field), kbForStep(field));
}

function kbForStep(step) {
  if (step === 'diet') return obDietKb();
  if (step === 'household') return obHouseholdKb();
  if (step === 'skill') return obSkillKb();
  return menuKb();
}

/**
 * Handle ob:* callbacks — data = "ob:<field>:<value>".
 * In full onboarding we advance step by step; in single-field edit mode we
 * persist immediately and return to the main menu.
 */
export async function handleObCallback(chatId, messageId, data, cqId) {
  const [, field, value] = data.split(':');
  const current = (await getSession(chatId)) ?? {};
  const ob = { diet: 'none', household: 2, skill: 'simple', ...(current.ob ?? {}) };
  const returnToMenu = current.returnToMenu ?? false;

  if (field === 'diet') ob.diet = DIET_OPTIONS.some((o) => o.key === value) ? value : 'none';
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
  await saveProfile(chatId, { diet: ob.diet, household: ob.household, skill: ob.skill });
  await deleteSession(chatId);
  const historyCount = await countRecentHistory(chatId);
  await editMessageText(chatId, messageId, profileSaved(ob, historyCount), menuKb());
  await answerCb(cqId, 'ذخیره شد ✅');
}
