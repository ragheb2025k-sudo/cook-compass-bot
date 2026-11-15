// tgcloud/lib/recipeBank.js — GENERATED AGGREGATOR (do not hand-edit).
// Source: tools/build-bank.py — banke dastoorhaye paz-kh az kotobha va ap-haye amoozesh ash-pazi
// (SarAshpaz Papion, Ketab Elektroniki Ashpazi, Ashpazi Ghazahaye Bedoone Goosht, Amoozesh Ashpazi Irani).
// Query helpers live in lib/bank.js.
//
// Record shape (compact):
//   n  name · c category · p protein/diet tags · t timeMin (app prep+cook or
//      category estimate) · d difficulty · i [[ingredient, qty]…] ·
//   s  full steps (no truncation) · tip chef tip from the source
import { RECIPE_SHARD as S0 } from './recipeBankA.js';
import { RECIPE_SHARD as S1 } from './recipeBankB.js';
import { RECIPE_SHARD as S2 } from './recipeBankC.js';
import { RECIPE_SHARD as S3 } from './recipeBankD.js';
import { RECIPE_SHARD as S4 } from './recipeBankE.js';

export const RECIPE_BANK = [...S0, ...S1, ...S2, ...S3, ...S4];

export const BANK_META = {"count": 2486, "sources": {"book": 76, "papoon": 2410}, "categories": ["آش و سوپ", "خورشت", "پلو و چلو", "کباب", "کوکو و املت", "کتلت و شامی", "دلمه و کوفته", "خوراک مرغ", "خوراک گوشت", "ماهی و میگو", "غذای گیاهی", "ماکارونی و پاستا", "غذای سریع", "سالاد", "پیش‌غذا و بورانی", "دسر و شیرینی", "نان و خمیر", "مربا و ترشی", "نوشیدنی", "غذای ملل", "غذای محلی", "غذای رژیمی", "غذای کودک"]};
