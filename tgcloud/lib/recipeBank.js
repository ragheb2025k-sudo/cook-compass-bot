// tgcloud/lib/recipeBank.js — GENERATED AGGREGATOR (do not hand-edit).
// Source: tools/build-bank.py — banke dastoorhaye paz-kh az kotobha va ap-haye amoozesh ash-pazi
// (SarAshpaz Papion, Ketab Elektroniki Ashpazi, Ashpazi Ghazahaye Bedoone Goosht, Amoozesh Ashpazi Irani).
// Query helpers live in lib/bank.js.
//
// Record shape (compact):
//   n  name · c category · p protein/diet tags · t timeMin · d difficulty
//   i  [[ingredient, qty]…] · s steps · tip chef tip
import { RECIPE_SHARD as S0 } from './recipeBankA.js';
import { RECIPE_SHARD as S1 } from './recipeBankB.js';
import { RECIPE_SHARD as S2 } from './recipeBankC.js';

export const RECIPE_BANK = [...S0, ...S1, ...S2];

export const BANK_META = {"count": 2474, "sources": {"book": 68, "papoon": 2406}, "categories": ["آش و سوپ", "خورشت", "پلو و چلو", "کباب", "کوکو و املت", "کتلت و شامی", "دلمه و کوفته", "خوراک مرغ", "خوراک گوشت", "ماهی و میگو", "غذای گیاهی", "ماکارونی و پاستا", "غذای سریع", "سالاد", "پیش‌غذا و بورانی", "دسر و شیرینی", "نان و خمیر", "مربا و ترشی", "نوشیدنی", "غذای ملل", "غذای محلی", "غذای رژیمی", "غذای کودک"]};
