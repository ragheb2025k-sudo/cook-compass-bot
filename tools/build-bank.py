#!/usr/bin/env python3
# tools/build-bank.py — builds tgcloud/lib/recipeBank.js from the extracted
# cooking sources:
#   1) tools/book-seed.json            (hand-encoded recipes from the uploaded PDF books)
#   2) /tmp/papoon-dec/b*.json         (سرآشپز پاپیون APK — 2,552 decoded recipes)
# Output: a single compact JS data module + a stats report.
#
# Run:  python3 tools/build-bank.py
import json, re, glob, os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEC = '/tmp/papoon-dec'
OUT = os.path.join(ROOT, 'tgcloud', 'lib', 'recipeBank.js')

FA = str.maketrans('0123456789', '۰۱۲۳۴۵۶۷۸۹')

CAT_MAP = {
    'سوپ': 'آش و سوپ', 'آش وحلیم': 'آش و سوپ', 'آبگوشت و اشکنه': 'آش و سوپ',
    'خورش': 'خورشت',
    'انواع پلو': 'پلو و چلو', 'ته چین': 'پلو و چلو', 'برنج': 'پلو و چلو',
    'کباب': 'کباب',
    'کوکو': 'کوکو و املت', 'املت وکرپ': 'کوکو و املت',
    'کتلت و شامی': 'کتلت و شامی', 'شامی': 'کتلت و شامی',
    'دلمه و کوفته': 'دلمه و کوفته',
    'مرغ وپرنده': 'خوراک مرغ', 'گوشت مرغ': 'خوراک مرغ',
    'گوشت قرمز': 'خوراک گوشت', 'استیک': 'خوراک گوشت',
    'ماهی و میگو': 'ماهی و میگو',
    'سبزیجات': 'غذای گیاهی', 'حبوبات': 'غذای گیاهی', 'میوه و سبزی': 'غذای گیاهی',
    'ماکارونی': 'ماکارونی و پاستا', 'لازانیا و سوفله': 'ماکارونی و پاستا', 'پای وگراتن': 'ماکارونی و پاستا',
    'پیتزا': 'غذای سریع', 'ساندویچ': 'غذای سریع', 'فست فود': 'غذای سریع', 'اسنک و رول': 'غذای سریع',
    'غذای دانشجویی': 'غذای سریع',
    'سالاد': 'سالاد', 'انواع سالاد': 'سالاد',
    'پیش غذا': 'پیش‌غذا و بورانی', 'اردور': 'پیش‌غذا و بورانی', 'بورانی و پوره': 'پیش‌غذا و بورانی',
    'دسر': 'دسر و شیرینی', 'دسر ایرانی': 'دسر و شیرینی', 'دسر مدرن': 'دسر و شیرینی',
    'انواع بستنی': 'دسر و شیرینی', 'انواع ژله': 'دسر و شیرینی', 'کرم وموس': 'دسر و شیرینی',
    'کیک و شیرینی': 'دسر و شیرینی', 'انواع کیک': 'دسر و شیرینی', 'کلوچه و کوکی': 'دسر و شیرینی',
    'شیرینی عید نوروز': 'دسر و شیرینی', 'شیرینی خشک': 'دسر و شیرینی', 'شیرینی تر': 'دسر و شیرینی',
    'مافین و کاپ': 'دسر و شیرینی', 'پای و تارت': 'دسر و شیرینی',
    'نان و خمیر': 'نان و خمیر',
    'مربا و کمپوت': 'مربا و ترشی', 'ترشی و شور': 'مربا و ترشی',
    'نوشیدنی': 'نوشیدنی', 'نوشیدنی گرم': 'نوشیدنی', 'شربت ها': 'نوشیدنی',
    'اسموتی و شیک': 'نوشیدنی', 'مخلوط ها': 'نوشیدنی', 'سایر نوشیدنی ها': 'نوشیدنی', 'نوشیدنی ها': 'نوشیدنی',
    'غذای ملل': 'غذای ملل',
    'ایتالیایی': 'غذای ملل', 'فرانسوی': 'غذای ملل', 'چینی': 'غذای ملل', 'عربی': 'غذای ملل',
    'ترکی': 'غذای ملل', 'مکزیکی': 'غذای ملل', 'آلمانی': 'غذای ملل', 'یونانی': 'غذای ملل',
    'سایر کشورها': 'غذای ملل', 'هندی': 'غذای ملل', 'کره ای': 'غذای ملل',
    'غذای محلی': 'غذای محلی', 'گیلانی': 'غذای محلی', 'آذربایجان': 'غذای محلی', 'قزوین': 'غذای محلی',
    'جنوبی': 'غذای محلی', 'شیرازی': 'غذای محلی', 'اصفهان': 'غذای محلی', 'مازندرانی': 'غذای محلی',
    'اردبیل': 'غذای محلی', 'کرمان': 'غذای محلی', 'سایر استان ها': 'غذای محلی', 'همدان': 'غذای محلی',
    'خراسان': 'غذای محلی',
    'غذای رژیمی': 'غذای رژیمی', 'غذای کودک': 'غذای کودک',
    'غذاهای سنتی': None, 'غذاهای مدرن': None, 'خوراک': None, 'سایر': None, 'سایر غذاها': None,
    'گوشت قرمز ': 'خوراک گوشت',
}
EXCLUDED_CATS = {'نکات آشپزی', 'اصطلاحات', 'مقیاس های اندازه گیری', 'تزئینات', 'چاشنی وادویه',
                 'سس ورب', 'پختن', 'مناسبت ها', 'تنقلات', 'کوکی'}

NAME_RULES = [
    (re.compile(r'پلو|چلو|کته|ته ?چین|بریانی'), 'پلو و چلو'),
    (re.compile(r'خورش'), 'خورشت'),
    (re.compile(r'سوپ|آش |حلیم'), 'آش و سوپ'),
    (re.compile(r'سالاد'), 'سالاد'),
    (re.compile(r'کوکو|املت|کرپ'), 'کوکو و املت'),
    (re.compile(r'کتلت|شامی'), 'کتلت و شامی'),
    (re.compile(r'کوفته|دلمه'), 'دلمه و کوفته'),
    (re.compile(r'کباب'), 'کباب'),
    (re.compile(r'ماکارونی|پاستا|لازانیا|اسپاگتی'), 'ماکارونی و پاستا'),
    (re.compile(r'پیتزا'), 'غذای سریع'),
    (re.compile(r'ساندویچ|برگر|هات داگ|اسنک|رول'), 'غذای سریع'),
    (re.compile(r'ماهی|میگو|تن ?ماهی|قزل|سالمون'), 'ماهی و میگو'),
    (re.compile(r'مرغ|جوجه|بوقلمون|اردک|کبک'), 'خوراک مرغ'),
    (re.compile(r'کیک|شیرینی|دسر|بستنی|ژله|موس|فرنی|حلوا|شله|مربا|ترشی|نوشیدنی|شربت|اسموتی|چای|قهوه'), 'دسر و شیرینی'),
    (re.compile(r'بورانی|پوره'), 'پیش‌غذا و بورانی'),
    (re.compile(r'نان'), 'نان و خمیر'),
]

TIME_BY_CAT = {
    'سالاد': 15, 'نوشیدنی': 10, 'دسر و شیرینی': 60, 'آش و سوپ': 45, 'خورشت': 75,
    'پلو و چلو': 75, 'کباب': 45, 'کوکو و املت': 30, 'کتلت و شامی': 40, 'دلمه و کوفته': 60,
    'خوراک مرغ': 45, 'خوراک گوشت': 50, 'ماهی و میگو': 35, 'غذای گیاهی': 40,
    'ماکارونی و پاستا': 40, 'غذای سریع': 25, 'پیش‌غذا و بورانی': 30, 'نان و خمیر': 90,
    'مربا و ترشی': 60, 'غذای ملل': 45, 'غذای محلی': 60, 'غذای رژیمی': 30, 'غذای کودک': 30,
}
EASY_CATS = {'سالاد', 'نوشیدنی', 'کوکو و املت', 'غذای سریع', 'پیش‌غذا و بورانی', 'غذای کودک', 'غذای رژیمی'}

FISH_RE = re.compile(r'ماهی|میگو|تن ?ماهی|قزل|سالمون|فیل ماهی')
CHICKEN_RE = re.compile(r'مرغ|جوجه|بوقلمون|اردک|کبک|ژامبون')
MEAT_RE = re.compile(r'گوشت|قیمه|قورمه|کباب|استیک|فیله|بره|گوسفند|گوساله|تخمه? مغز|مغز گوس')
DAIRY_RE = re.compile(r'شیر |ماست|پنیر|خامه|کشک|کره|یخ مایه|مارگارین')
EGG_RE = re.compile(r'تخم ?مرغ')

def norm_name(s):
    s = (s or '').replace('\ufeff', '').strip()
    s = re.sub(r'\s+', ' ', s)
    return s

def key_of(s):
    s = norm_name(s)
    s = re.sub(r'[\u200c\s\(\)\.\-_:،؛!؟"/\']+', '', s)
    return s.lower()

def fa_digits(s):
    return str(s).translate(FA)

def fmt_qty(qty, unit):
    qty = str(qty).strip()
    unit = (unit or '').strip()
    if unit in ('0', ''): unit = ''
    try:
        q = float(qty.replace('/', '.').replace('٫', '.'))
    except ValueError:
        q = None
    if q is not None and q <= 0:
        return unit or 'به مقدار لازم'
    unit_fa = unit if unit and unit != '0' else ('عدد' if q is not None else '')
    txt = f"{fa_digits(qty)} {unit_fa}".strip()
    return txt if txt else 'به مقدار لازم'

def split_steps(method):
    raw = (method or '').replace('\r', '')
    parts = [p.strip() for p in re.split(r'nnn|\n{2,}|\r', raw) if p.strip()]
    parts = [re.sub(r'\s+', ' ', p) for p in parts]
    if (len(parts) == 1 and len(parts[0]) > 240):
        # break a single long paragraph at sentence ends
        chunks, cur = [], ''
        for seg in re.split(r'(?<=[.،؛!])\s+', parts[0]):
            if len(cur) + len(seg) > 180 and cur:
                chunks.append(cur.strip()); cur = seg
            else:
                cur = (cur + ' ' + seg).strip()
            if len(chunks) >= 2: break
        if cur and len(chunks) < 3: chunks.append(cur.strip())
        parts = [c for c in chunks if c]
    return [p[:150] for p in parts[:3]]

def classify(name, ing_names):
    text = name + ' ' + ' '.join(ing_names)
    p = []
    if FISH_RE.search(text): p.append('fish')
    elif CHICKEN_RE.search(text): p.append('chicken')
    elif MEAT_RE.search(text): p.append('meat')
    else: p.append('veg')
    tags = set(p)
    if DAIRY_RE.search(text): tags.add('dairy')
    if EGG_RE.search(text): tags.add('egg')
    return sorted(tags)

def guess_cat(name, papoon_cat):
    if papoon_cat:
        mapped = CAT_MAP.get(papoon_cat, 'NOPE')
        if mapped and mapped != 'NOPE': return mapped
    for rx, cat in NAME_RULES:
        if rx.search(name): return cat
    # fallback by protein tag later
    return None

def time_for(cat, n_steps, n_ings):
    t = TIME_BY_CAT.get(cat, 45)
    return max(10, min(240, t))

# ---------------- load book seed ----------------
seed = json.load(open(os.path.join(os.path.dirname(__file__), 'book-seed.json'), encoding='utf-8'))
bank, seen = [], set()
stats = {'book': 0, 'papoon': 0, 'papoon_skipped': 0}

for r in seed['recipes']:
    name = norm_name(r['n'])
    k = key_of(name)
    if k in seen: continue
    seen.add(k)
    ings = [[norm_name(a), b] for a, b in r['i']][:12]
    tags = classify(name, [a for a, _ in ings] + [r['s'][0]])
    cat = r['c']
    rec = {'n': name, 'c': cat, 'p': tags, 't': r['t'], 'd': r['d'],
           'i': ings, 's': r['s'][:6]}
    if r.get('tip'): rec['tip'] = r['tip'][:200]
    bank.append(rec)
    stats['book'] += 1

# ---------------- load papoon ----------------
ing_names = {r['a']: r['b'] for r in json.load(open(f'{DEC}/b15.json', encoding='utf-8'))['c']}
units = {r['a']: r['b'] for r in json.load(open(f'{DEC}/b19.json', encoding='utf-8'))['c']}
catmap = {r['a']: r['b'].replace('\ufeff', '').strip() for r in json.load(open(f'{DEC}/b0.json', encoding='utf-8'))['c']}
cat_of = {}
for l in json.load(open(f'{DEC}/b20.json', encoding='utf-8'))['c']:
    cat_of.setdefault(l['a'], catmap.get(l['b'], ''))
links = {}
for f in ('b16', 'b17', 'b18'):
    for l in json.load(open(f'{DEC}/{f}.json', encoding='utf-8'))['c']:
        links.setdefault(l['a'], []).append(l)

recipes_rows = []
for i in range(1, 14):
    recipes_rows.extend(json.load(open(f'{DEC}/b{i}.json', encoding='utf-8'))['c'])
print('papoon raw rows:', len(recipes_rows), '| links:', len(links), '| ings:', len(ing_names))

for r in recipes_rows:
    name = norm_name(r.get('b'))
    method = r.get('d') or ''
    rid = r['a']
    if len(name) < 3 or len(name) > 80 or len(method) < 60:
        stats['papoon_skipped'] += 1; continue
    steps = split_steps(method)
    if len(steps) < 2:
        stats['papoon_skipped'] += 1; continue
    # spice/notes/decor entries are not cookable meals — keep only when the
    # dish name itself clearly identifies a real dish category.
    papoon_cat = cat_of.get(rid, '')
    if papoon_cat in EXCLUDED_CATS and not any(rx.search(name) for rx, _ in NAME_RULES):
        stats['papoon_skipped'] += 1; continue
    ings = []
    for l in links.get(rid, []):
        nm = norm_name(ing_names.get(l['b'], ''))
        if not nm or len(nm) > 60: continue
        q = fmt_qty(l['d'], units.get(l['c'], ''))
        note = norm_name(l.get('e', ''))
        if note and len(note) < 40:
            q = f"{q} ({note})" if q != 'به مقدار لازم' else f"به مقدار لازم ({note})"
        ings.append([nm, q])
    if len(ings) < 2:
        stats['papoon_skipped'] += 1; continue
    ings = ings[:10]
    k = key_of(name)
    if k in seen:
        stats['papoon_skipped'] += 1; continue
    seen.add(k)
    cat = guess_cat(name, cat_of.get(rid, ''))
    tags = classify(name, [a for a, _ in ings])
    if cat is None:
        cat = {'fish': 'ماهی و میگو', 'chicken': 'خوراک مرغ', 'meat': 'خوراک گوشت'}.get(tags[0], 'غذای گیاهی')
    bank.append({'n': name, 'c': cat, 'p': tags, 't': time_for(cat, len(steps), len(ings)),
                 'd': 'آسان' if cat in EASY_CATS else 'متوسط', 'i': ings, 's': steps})
    stats['papoon'] += 1

# ---------------- finalize ----------------
cats = {}
for r in bank: cats[r['c']] = cats.get(r['c'], 0) + 1
order = ['آش و سوپ', 'خورشت', 'پلو و چلو', 'کباب', 'کوکو و املت', 'کتلت و شامی', 'دلمه و کوفته',
         'خوراک مرغ', 'خوراک گوشت', 'ماهی و میگو', 'غذای گیاهی', 'ماکارونی و پاستا',
         'غذای سریع', 'سالاد', 'پیش‌غذا و بورانی', 'دسر و شیرینی', 'نان و خمیر', 'مربا و ترشی',
         'نوشیدنی', 'غذای ملل', 'غذای محلی', 'غذای رژیمی', 'غذای کودک']
cat_list = [c for c in order if c in cats] + [c for c in sorted(cats) if c not in order]

# The platform caps each module at 1 MB — split the corpus into shard modules
# and concatenate them in lib/recipeBank.js.
LIMIT = 900 * 1024  # safety margin under the 1048576-byte hard cap
shards, cur, cur_size = [], [], 0
for r in bank:
    sz = len(json.dumps(r, ensure_ascii=False, separators=(',', ':')).encode('utf-8')) + 1
    if cur and cur_size + sz > LIMIT:
        shards.append(cur); cur, cur_size = [], 0
    cur.append(r); cur_size += sz
if cur: shards.append(cur)

names = []
for i, shard in enumerate(shards):
    name = f'recipeBank{chr(ord("A") + i)}.js'
    names.append(name)
    body = json.dumps(shard, ensure_ascii=False, separators=(',', ':'))
    js = f"""// tgcloud/lib/{name} — GENERATED DATA SHARD {i + 1}/{len(shards)} (do not hand-edit).
// Source: tools/build-bank.py — بانک دستورهای پخت از کتاب‌ها و اپ‌های آموزش آشپزی.
// Platform module cap is 1 MB, so the corpus is split across shards; the
// aggregator is lib/recipeBank.js.
export const RECIPE_SHARD = {body};
"""
    path = os.path.join(ROOT, 'tgcloud', 'lib', name)
    open(path, 'w', encoding='utf-8').write(js)
    print(f"WROTE {path}: {len(shard)} recipes, {len(js.encode('utf-8')) / 1024:.0f} KB")

meta = json.dumps({'count': len(bank), 'sources': {'book': stats['book'], 'papoon': stats['papoon']},
                   'categories': cat_list}, ensure_ascii=False)

imports = '\n'.join(f"import {{ RECIPE_SHARD as S{i} }} from './recipeBank{chr(ord('A') + i)}.js';" for i in range(len(shards)))
concat = ', '.join(f'...S{i}' for i in range(len(shards)))
agg = f"""// tgcloud/lib/recipeBank.js — GENERATED AGGREGATOR (do not hand-edit).
// Source: tools/build-bank.py — banke dastoorhaye paz-kh az kotobha va ap-haye amoozesh ash-pazi
// (SarAshpaz Papion, Ketab Elektroniki Ashpazi, Ashpazi Ghazahaye Bedoone Goosht, Amoozesh Ashpazi Irani).
// Query helpers live in lib/bank.js.
//
// Record shape (compact):
//   n  name · c category · p protein/diet tags · t timeMin · d difficulty
//   i  [[ingredient, qty]…] · s steps · tip chef tip
{imports}

export const RECIPE_BANK = [{concat}];

export const BANK_META = {meta};
"""
open(OUT, 'w', encoding='utf-8').write(agg)
print('categories:', json.dumps({c: cats.get(c, 0) for c in cat_list}, ensure_ascii=False))
print(f"WROTE {OUT}: {len(bank)} recipes in {len(shards)} shards | {os.path.getsize(OUT) / 1024:.0f} KB")
print('stats:', stats)
