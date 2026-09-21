"""Build data/kwuse.json: for every keyword, everything that uses it, from every source, in order.

A keyword's card lists what uses it ("Found on"). A use is found two ways:
  1. the game-text markup: [Ignite] or [Ignite|Ignites] in a gem, unique, passive or keyword description
     (and the artifact's own keyword list for each gem, unique and passive)
  2. the keyword's words in plain text: its title and the forms the markup shows it as (Ignites, Ignited...),
     whole words, case-sensitive, 3 letters or more
Sources: every gem (description, stat lines, per-level and quality text), every unique (all variants), every
passive (keystones, notables and anoints as cards; small passives grouped: the same name and text is one row
with how many are on the tree), the Atlas (waystone mods with their tiers, desecrated waystone mods, liquid
emotions, tablets, unique tablets, tablet mods, keys, atlas items, atlas tree nodes and their choices; a row
names the card it opens when the index or the currency catalogue has one), base items (implicit lines and
properties, and the keywords tools/sync.py marked on the card), essences (the mod each one guarantees, per kind
of item, from data/craft), currency and other bulk items (their game text), crafting mods (each mod line once,
with the item kinds it rolls on) and other keywords' descriptions.

Which markup forms count as a keyword's words: a form that holds every word of the keyword's name or id
(Ignites, Critically Hit, Power Charges), or a form only this keyword is ever shown as that the markup links
to this keyword at least half the times it appears (Magnitude). So [Hit|Damage] does not make every
"Damage" a use of Hit, and [LifeLeech|Life] does not make every "Life" a use of Life Leech.
A form that is another keyword's own name (Frozen, Delirium) is left to that keyword.
NOT_THIS lists the few longer names that hold a keyword's word but are something else (Energy Shield is not
a Shield, a Power Charge has nothing to do with Monster Power), and ONLY_WITH the few keywords whose word is an
everyday one (Gain, Maximum, Charges), matched in plain text only next to their own context.

Every list is in alphabetical order. The "Used by" counts on keyword cards (data/index.json "use") are set to
these lists' lengths. Checked against the artifact's own counts (kwdata "n"): every gem,
unique and passive it counts is here, except the ones the site leaves out (unreleased [DNT] gems and passives,
the gems tools/sync.py drops by name in DNT_GEMS, and repeated copies of a unique); the report says which.

Output groups per keyword: u uniques, g gems, p passives, b bases, e essences (rows of "es"), a atlas (rows of "at"),
m crafting (rows of "cr"), c currency (rows of "cu"), w keywords.

Usage:  python tools/kwuse.py [explore.html]
Run last: after tools/atlas.py, tools/craft.py and tools/sync.py (it reads explore.html and its data/explore/ files, data/index.json,
data/atlas.json, data/info.json, data/market.json and data/craft/).
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from phrases import Matcher  # noqa: E402
from sync import KWREF, RAW, block  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'kwuse.json'

# Longer names that hold a keyword's word but mean something else: a plain-text match inside one of these
# is not a use of that keyword. Keyed by keyword id; each value is a regular expression.
NOT_THIS = {
    'Shield': r'Energy Shield',                                     # a defence, not a Shield
    'Energy': r'Energy Shield|Abyssal Energy',                      # Energy is the meta gem resource
    'Power': r'Power\b[\w ,/-]{0,40}?\bCharges?|Power Siphon|Sigil of Power|Power Runes?',   # not Monster Power
    'Rarity': r'Rarity of Items|Item Rarity',                       # the stat, not Normal/Magic/Rare/Unique
    'Chain': r"Temporal Chains|Coward's Chains",                    # a curse and a unique
    'Spirit': r'Azmeri Spirits?|Spirits? [Oo]f [Tt]he \w+|Spirit-Influenced|Spirit (?:Vessel|duration|Drinker)'
              r'|(?:Ancestral|Bear|Sacred|Tempered|random|Raging) Spirits?',   # spirits, not the Spirit resource
    'Corrupted': r'Corrupted Blood',                                # a debuff, not a Corrupted item
    'Strike': r'Culling Strike|Decimating Strike',                  # effects, not Strike skills
    'Orb': r'(?:[A-Z][\w\'-]* )+Orbs?\b|\bOrbs? of \w+',             # currency orbs, not Orb skills
    'Augment': r'Augments? an? (?:Normal|Magic|Rare|Unique|random|new)\b[^.]*|Augments? (?:the|your)(?:self)? \w+'
               r'|Augment yourself',                                # the verb
    'Freeze': r'Time Freeze',                                       # a skill
    'Armour': r'Body Armours?|\bArmour(?=:)|Armour Items?',         # the item slot, not the defence
    'Burning': r'The Burning Monolith',                             # a place
    'Sacrifice': r'Altar of Sacrifice|Sacrifice this item',         # the Ritual altar
    'Remnant': r'(?:Verisium|Explosive|Runic) Remnants?',           # Expedition remnants
    'Total': r'Total (?:Attack|Cast|Use) Time',                     # a skill's timing, not a stat total
}
# Keywords whose word is an everyday one: a plain-text line counts only if it also matches this.
ONLY_WITH = {
    'Gain': r'as [Ee]xtra|[Gg]ained as',                            # Damage Gained as extra X, not every "Gain"
    'MaximumTotal': r'a [Mm]aximum of',                             # "up to a maximum of", not every "Maximum"
    'Charges': r'\b(?:Power|Frenzy|Endurance)\b',                   # not Flask, Charm or verb charges
}

STOP = {'of', 'the', 'and', 'or', 'to', 'a', 'an', 'as', 'in', 'on', 'with', 'from', 'for', 'other', 'any', 'all',
        'x', 'by', 'is'}
KIND_ORDER = {'keystone': 0, 'notable': 1, 'anoint': 2, 'small': 3}
AT_TIER = lambda lo, hi: 'Any tier' if (lo, hi) == (1, 16) else 'Tier %d' % lo if lo == hi else 'Tier %d–%d' % (lo, hi)
TREE_TY = {'c': 'Choice', 'n': 'Notable', 's': 'Small'}
CLS = {'StackableCurrency': 'Currency', 'SoulCore': 'Augment', 'MapFragment': 'Fragment', 'Omen': 'Omen',
       'Support Skill Gem': 'Lineage support', 'Breachstone': 'Breachstone', 'PinnacleKeyStackable': 'Fragment',
       'UncutSkillGemStackable': 'Uncut gem', 'UncutReservationGemStackable': 'Uncut gem',
       'UncutSupportGemStackable': 'Uncut gem', 'DelveStackableSocketableCurrency': 'Resonator',
       'IncubatorStackable': 'Incubator', 'VaultKey': 'Key'}


def lines(t):
    """Game text (markup [Id|Shown] or [Id]) to plain lines."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    t = re.sub(r'\[([^\]]+)\]', r'\1', t)
    return [re.sub(r'\s+', ' ', x).strip() for x in t.replace('\r', '').split('\n') if x.strip()]


def strings(o):
    if isinstance(o, str):
        yield o
    elif isinstance(o, dict):
        for v in o.values():
            yield from strings(v)
    elif isinstance(o, list):
        for v in o:
            yield from strings(v)


def sort_key(s):
    """Alphabetical, ignoring case and any leading numbers or signs (+#% to...)."""
    return re.sub(r'^[^A-Za-z]+', '', s).casefold(), s


# ---------- the keyword's words ----------
def words(s):   # lower case, "Allies" read as "Ally"
    return [re.sub(r'ies$', 'y', w.lower()) for w in re.findall(r'[A-Za-z]+', s) if w.lower() not in STOP]


def id_words(k):
    return words(re.sub(r'(?<=[a-z])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])', ' ', k.replace('_', ' ')))


def same_word(a, b):
    n = min(len(a), len(b))
    p = 0
    while p < n and a[p] == b[p]:
        p += 1
    return p >= min(4, n)


def covers(fw, ws):
    return bool(ws) and all(any(same_word(w, x) for x in fw) for w in ws)


def keyword_forms(kw, blobs):
    """keyword id -> the words it is matched by in plain text."""
    shown = defaultdict(Counter)   # keyword -> display form -> how often the markup shows it so
    for blob in blobs:
        for m in KWREF.finditer(json.dumps(blob, ensure_ascii=False)):
            if m.group(1) in kw:
                shown[m.group(1)][(m.group(2) or m.group(1)).strip()] += 1
    owners = defaultdict(set)
    for k, c in shown.items():
        for f in c:
            owners[f].add(k)
    for k, v in kw.items():
        owners[v['t']].add(k)
    # how often each candidate form appears in the marked-up text at all (to test the forms only one keyword has)
    corpus = [x for blob in blobs for s in strings(blob) if ' ' in s for x in lines(s)]
    single = {f for k, c in shown.items() for f in c if owners[f] == {k}}
    seen = Counter()
    m = Matcher({f: {f} for f in single}, what='keyword form')
    for text in corpus:
        for _, _, f, _ in m.find(text):
            seen[f] += 1
    titles = defaultdict(set)
    for k, v in kw.items():
        titles[v['t']].add(k)
    forms, dropped = {}, {}
    for k, v in kw.items():
        t = v['t']
        iw, tw = id_words(k), words(t)
        keep = {t} if len(t) >= 3 else set()
        for f, n in shown.get(k, {}).items():
            if len(f) < 3 or f == t:
                continue
            fw = words(f)
            if f in titles and titles[f] != {k}:   # another keyword's own name (Frozen, Delirium, Parried)
                dropped.setdefault(k, []).append(f)
            elif covers(fw, iw) or covers(fw, tw):
                keep.add(f)
            elif owners[f] == {k} and any(same_word(a, b) for a in fw for b in iw + tw) and n * 2 >= seen[f]:
                keep.add(f)
            else:
                dropped.setdefault(k, []).append(f)
        forms[k] = keep
    return forms, dropped


# ---------- sources ----------
def gem_texts(g):
    out = list(lines(g.get('txt')))
    for s in g.get('ss') or []:
        for x in (s.get('tx') or {}).values():
            out += lines(x)
        for per in (s.get('txL') or {}).values():
            for x in (per or {}).values():
                out += lines(x)
        for q in s.get('q') or []:
            out += lines(re.sub(r'\{[^}]*\}', '#', q.get('t') or ''))
    return out


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('-')]
    src = Path(args[0]) if args else ROOT / 'explore.html'
    html = src.read_text(encoding='utf-8')
    gems, uq, tr, kw = (block(html, b) for b in ('gemdata', 'uqdata', 'trdata', 'kwdata'))
    index = json.loads((ROOT / 'data' / 'index.json').read_text(encoding='utf-8'))
    atlas = json.loads((ROOT / 'data' / 'atlas.json').read_text(encoding='utf-8'))
    info = json.loads((ROOT / 'data' / 'info.json').read_text(encoding='utf-8'))
    market = json.loads((ROOT / 'data' / 'market.json').read_text(encoding='utf-8')).get('items') or {}
    craft = json.loads((ROOT / 'data' / 'craft.json').read_text(encoding='utf-8'))
    cards = {it['k'] + ':' + it['id']: it for it in index['items']}
    kwx = index.get('kwx') or {}

    unused = lambda k: k.startswith('DNT') or kw[k]['t'].startswith('[DNT')
    live = [k for k in kw if kw[k].get('t') and not unused(k)]
    forms, dropped = keyword_forms(kw, (gems, uq, tr, kw))
    phrases = defaultdict(set)
    for k in live:
        for f in forms[k]:
            phrases[f].add(k)
    matcher = Matcher(phrases, what='keyword form')
    not_this = {k: re.compile(p) for k, p in NOT_THIS.items()}
    only_with = {k: re.compile(p) for k, p in ONLY_WITH.items()}

    def found(texts, obj=None, extra=()):
        """Keyword ids used by an object: its markup, the artifact's own list, and its words in plain text."""
        ks = set(extra)
        if obj is not None:
            ks |= {m.group(1) for m in KWREF.finditer(json.dumps(obj, ensure_ascii=False)) if m.group(1) in kw}
        for text in texts:
            spans = {}
            for s, e, f, hit in matcher.find(text):
                for k in hit:
                    if k in ks or (k in only_with and not only_with[k].search(text)):
                        continue
                    if k in not_this:
                        if k not in spans:
                            spans[k] = [x.span() for x in not_this[k].finditer(text)]
                        if any(a <= s and e <= b for a, b in spans[k]):
                            continue
                    ks.add(k)
        return {k for k in ks if k in kw and not unused(k)}

    def first_line(texts, k):
        """The first of these lines that shows keyword k (for rows that are not cards)."""
        for text in texts:
            if found([text]) & {k}:
                return text
        return texts[0] if texts else ''

    use = {k: defaultdict(list) for k in live}   # keyword -> group -> entries
    on_card = defaultdict(set)                    # keyword -> the passive cards that use it
    missing = []

    # gems: every gem the site lists (not the unreleased [DNT] ones)
    for g in gems['gems']:
        if re.match(r'^\[DNT|^Removed Skill$', g['n']):
            continue
        if 'g:' + g['id'] not in cards:
            missing.append('gem ' + g['n'])
            continue
        for k in found(gem_texts(g), g, g.get('kw') or ()):
            use[k]['g'].append((sort_key(g['n']), g['id']))

    # uniques: every variant, as the index names them ("Name" or "Name | Base" when names repeat)
    uniq, seen = [], {}
    for u in uq['items']:
        sig = (u['n'], u.get('b'), tuple(u.get('ex') or []))
        if sig in seen:
            seen[sig].append(u)
        else:
            seen[sig] = [u]
            uniq.append(u)
    names = Counter(u['n'] for u in uniq)
    for u in uniq:
        uid = u['n'] if names[u['n']] == 1 else u['n'] + ' | ' + (u.get('b') or '')
        if 'u:' + uid not in cards:
            missing.append('unique ' + uid)
            continue
        ks = set()
        for copy in seen[(u['n'], u.get('b'), tuple(u.get('ex') or []))]:
            texts = [y for x in (copy.get('im') or []) + (copy.get('ex') or []) + (copy.get('pr') or []) for y in lines(x)]
            ks |= found(texts, copy, copy.get('kw') or ())
        for k in ks:
            use[k]['u'].append(((u['n'].casefold(), (u.get('b') or '').casefold()), uid))

    # passives: keystones, notables and anoints are cards; small passives are grouped by name and text
    card_of, card_n, small = {}, Counter(), {}
    for p in tr['passives']:
        name, asc = p.get('n') or '', p.get('a') or ''
        if not name or name.startswith('[DNT') or asc.startswith('[DNT') or not p.get('t'):
            continue
        texts = [y for x in p['t'] for y in lines(x)]
        card = p['k'] in ('keystone', 'notable', 'anoint')
        ks = found(texts if card else [name] + texts, p, p.get('kw') or ())   # a small passive's name says what it does
        if card:
            pid = card_of.setdefault((name, asc), p['id'])
            card_n[pid] += 1   # a card can stand for more than one node of the same name
            if 'p:' + pid not in cards:
                missing.append('passive ' + name)
                continue
            for k in ks:
                on_card[k].add(pid)
        else:
            key = (name, ' · '.join(texts))
            g = small.setdefault(key, {'n': 0, 'reg': set(), 'asc': set(), 'kind': p['k'], 'ks': set()})
            g['n'] += 1
            g['ks'] |= ks
            if asc:
                g['asc'].add(asc)
            elif p.get('reg'):
                g['reg'].add(p['reg'])
    sp = []   # small passive groups: [name, text, how many on the tree, where]
    for (name, text), g in sorted(small.items(), key=lambda x: (sort_key(x[0][0]), x[0][1])):
        where = []
        if g['reg']:
            r = sorted(g['reg'])
            where.append((', '.join(r[:-1]) + ' and ' + r[-1] + ' regions') if len(r) > 1 else r[0] + ' region')
        if g['asc']:
            where.append(', '.join(sorted(g['asc'])))
        sp.append([name, text, g['n'], ', '.join(where)])
        for k in g['ks']:
            use[k]['p'].append(((sort_key(name), 3, text), len(sp) - 1))
    for k, pids in on_card.items():
        for x in pids:
            it = cards['p:' + x]
            use[k]['p'].append(((sort_key(it['n']), KIND_ORDER.get(it['s'].split(' ')[0].lower(), 1), it['s']), x))

    # the Atlas: [section, name, what it is, the line that shows the keyword, the card it opens]
    at, at_by = [], {}
    card_for = {}   # an atlas thing's card: its own atlas card, else a unique tablet, else a currency card
    for key in [k for k in cards if k[0] in 'cu'] + ['c:' + m['n'] for k, m in market.items() if k.startswith('c:') and m.get('n')]:
        card_for.setdefault(key.split(':', 1)[1], key)
    for key, it in cards.items():
        if it['k'] == 'a':
            card_for[it['n']] = key

    def add_atlas(sec, name, what, texts, own=False):
        texts = [y for x in texts if x for y in lines(x)]
        for k in found(texts):
            key = (sec, name, what)
            if key not in at_by:
                at_by[key] = len(at)
                at.append([sec, name, what, {}, card_for.get(name) if own else None])
            at[at_by[key]][3].setdefault(k, first_line(texts, k))

    for m in atlas.get('wmods') or []:
        side = 'Waystone prefix' if m.get('k') == 'p' else 'Waystone suffix'
        per = defaultdict(list)   # keyword -> tiers whose lines show it
        for r in m.get('r') or []:
            for k in found([y for x in (r.get('ls') or []) + (r.get('b') or []) for y in lines(x)]):
                per[k].append(r)
        for k, rs in per.items():
            w = [r['w'] for r in rs if r.get('w')]
            key = ('ways', m['a'], side + (' · ' + AT_TIER(min(x[0] for x in w), max(x[1] for x in w)) if w else ''))
            if key not in at_by:
                at_by[key] = len(at)
                at.append(['ways', m['a'], key[2], {}, None])
            texts = [y for x in (rs[0].get('ls') or []) + (rs[0].get('b') or []) for y in lines(x)]
            at[at_by[key]][3].setdefault(k, first_line(texts, k))
    for m in atlas.get('wdes') or []:
        add_atlas('ways', m['a'], 'Desecrated waystone mod', (m.get('ls') or []) + (m.get('b') or []))
    for m in atlas.get('wemo') or []:
        add_atlas('ways', m['n'], 'Liquid Emotion', m.get('ls') or [], True)
    for t in atlas.get('tabs') or []:
        add_atlas('tabs', t['n'], 'Tablet', t.get('ls') or [], True)
    for t in atlas.get('tuniq') or []:
        add_atlas('tabs', t['n'], 'Unique tablet', t.get('ls') or [], True)
    for m in atlas.get('tmods') or []:
        add_atlas('tabs', m['a'], 'Tablet mod', m.get('ls') or [])
    for x in atlas.get('keys') or []:
        add_atlas('keys', x['n'], x.get('kind') or x.get('s') or 'Key', [x.get('t')] + (x.get('ls') or []), True)
    for x in atlas.get('items') or []:
        add_atlas('items', x['n'], x.get('kind') or x.get('s') or 'Atlas item', (x.get('ls') or []) + [x.get('t')], True)
    for g in atlas.get('tree') or []:
        for nd in g.get('nodes') or []:
            what = g['n'] + ' · ' + TREE_TY.get(nd.get('ty'), 'Node') + (' ×' + str(nd['x']) if nd.get('x') else '')
            add_atlas('tree', nd['n'], what, (nd.get('ls') or []) + (nd.get('o') or []), True)
    order = sorted(range(len(at)), key=lambda i: (sort_key(at[i][1]), at[i][2]))
    at = [at[i] for i in order]
    for i, a in enumerate(at):
        for k in a[3]:
            use[k]['a'].append(((i,), i))
    at_out = [[a[0], a[1], a[2]] + ([a[4]] if a[4] else []) for a in at]
    at_line = {(i, k): line for i, a in enumerate(at) for k, line in a[3].items()}

    # currency and other bulk items: their game text. The market name finds the card ("c:<name>").
    cu = []
    for name in sorted(info, key=sort_key):
        if name.startswith('[DNT'):
            continue
        m = market.get('c:' + name) or {}
        text = m.get('u') or info[name].get('t') or ''
        if not text:
            continue
        ks = found(lines(text))
        if not ks:
            continue
        cu.append([name, m.get('cat') or CLS.get(info[name].get('cls'), 'Currency'), text])
        for k in ks:
            use[k]['c'].append(((len(cu),), len(cu) - 1))

    # crafting: every mod line once, with the item kinds it rolls on
    kinds = {c['id']: c['n'] for c in craft['classes']}
    mods = defaultdict(set)   # (line, what) -> kinds
    for cid in kinds:
        f = ROOT / 'data' / 'craft' / (cid + '.json')
        if not f.exists():
            continue
        d = json.loads(f.read_text(encoding='utf-8'))
        for fam in d.get('fam') or []:
            side = {'p': 'prefix', 's': 'suffix'}.get(fam[0], '')
            src, lord = fam[4] if len(fam) > 4 else '', fam[5] if len(fam) > 5 else ''
            what = {'d': 'Desecrated ' + side + (' (' + lord + ')' if lord else ''), 'c': 'Corrupted',
                    'e': 'Essence ' + side}.get(src, side.capitalize() or 'Mod').strip()
            mods[(' / '.join(y for x in fam[1] for y in lines(x)), what)].add(cid)
    cr = []
    for (line, what) in sorted(mods, key=lambda x: (sort_key(x[0]), x[1])):
        ks = found([line])
        if not ks:
            continue
        ck = sorted(mods[(line, what)], key=lambda c: list(kinds).index(c))
        cr.append([line, what, ck])
        for k in ks:
            use[k]['m'].append(((len(cr),), len(cr) - 1))

    # base items: their implicit lines and properties, and the keywords sync.py marked on the card
    #   (it names the property ones: "Armour: 25" is the defence, which the plain-text rules leave to the markup)
    for key, it in cards.items():
        if it['k'] == 'b':
            for k in found((it.get('ls') or []) + (it.get('pr') or []), None, it.get('kw') or ()):
                use[k]['b'].append((sort_key(it['n']), it['id']))

    # essences: the mod each one guarantees, per kind of item (data/craft: the essence tables from poe2db)
    ess = defaultdict(set)   # (essence, line) -> kinds
    for cid in kinds:
        f = ROOT / 'data' / 'craft' / (cid + '.json')
        if not f.exists():
            continue
        d = json.loads(f.read_text(encoding='utf-8'))
        for name, _, i, _ in d.get('ess') or []:
            ess[(name, ' / '.join(y for x in d['mods'][i][3] for y in lines(x)))].add(cid)
    es = []
    for (name, line) in sorted(ess, key=lambda x: (sort_key(x[0]), x[1])):
        ks = found([line])
        if not ks:
            continue
        es.append([name, line, sorted(ess[(name, line)], key=lambda c: list(kinds).index(c))])
        for k in ks:
            use[k]['e'].append(((len(es),), len(es) - 1))

    # other keywords whose description shows this one
    has_card = lambda k: ('w:' + k) in cards or k in kwx
    for k2 in live:
        for k in found(lines(kw[k2].get('d') or ''), kw[k2].get('d') or ''):
            if k != k2:
                use[k]['w'].append((sort_key(kw[k2]['t']), k2))

    # a keyword and a keystone of the same name share one card: they share one list
    same = defaultdict(list)
    for k in live:
        same[('p', kwx[k]) if k in kwx else ('w', k)].append(k)
    out_k = {}
    for card_key, ids in same.items():
        self_p = card_of.get((card_key[1], '')) if card_key[0] == 'p' else None
        merged = defaultdict(dict)
        for k in ids:
            for grp, rows in use[k].items():
                for sk, x in rows:
                    if (grp == 'p' and x == self_p) or (grp == 'w' and x in ids):
                        continue
                    merged[grp].setdefault(x, sk)
        entry = {}
        for grp in 'ugpbeamcw':
            rows = sorted(merged.get(grp, {}).items(), key=lambda r: (r[1], str(r[0])))
            if rows:
                entry[grp] = [[x, card_n[x]] if grp == 'p' and card_n[x] > 1 else x for x, _ in rows]
        if 'a' in entry:   # the atlas line differs per keyword: [row, line]
            entry['a'] = [[i, next((at_line[(i, k)] for k in ids if (i, k) in at_line), '')] for i in entry['a']]
        for k in ids:
            out_k[k] = entry

    kn = {k: kw[k]['t'] for k in live if not has_card(k)}   # keywords with no card of their own: just the name
    out = {'v': index.get('v'), 'sp': sp, 'at': at_out, 'cu': cu, 'cr': cr, 'es': es, 'ck': kinds, 'kn': kn, 'k': out_k}

    # the standard: nothing visible may read as game code
    for s in strings({x: out[x] for x in ('sp', 'at', 'cu', 'cr', 'es', 'ck', 'kn')}):
        if RAW.search(s):
            sys.exit('raw game code in kwuse: %r' % s)
    for k, e in out_k.items():
        for i, line in e.get('a', []):
            if RAW.search(line):
                sys.exit('raw game code in kwuse: %r' % line)

    raw = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(raw, encoding='utf-8')
    print('data/kwuse.json: %d keywords, %d KB (small passive groups %d, atlas %d (%d with a card), currency %d, crafting %d, '
          'essence lines %d)' % (len(out_k), len(raw.encode('utf-8')) // 1024, len(sp), len(at_out), sum(len(a) > 3 for a in at_out),
                                  len(cu), len(cr), len(es)))
    print('  keywords used by bases: %d, by essences: %d' % (sum(1 for e in out_k.values() if e.get('b')),
                                                            sum(1 for e in out_k.values() if e.get('e'))))
    if missing:
        print('  not in the index (skipped):', ', '.join(missing[:20]), file=sys.stderr)

    # the "Used by" line on each keyword card (data/index.json "use", also the crawler pages) counts these lists
    changed = 0
    for it in index['items']:
        if it['k'] == 'w' and it['id'] in out_k:
            e = out_k[it['id']]
            # passives: every one on the tree (a small passive that is there 18 times counts 18), as the list's tab
            p = on_tree(e, sp)
            n = {grp: v for grp, v in (('gems', len(e.get('g', []))), ('uniques', len(e.get('u', []))), ('passives', p)) if v}
            if it.get('use') != n:
                it['use'] = n
                changed += 1
    if changed:
        (ROOT / 'data' / 'index.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('data/index.json: "Used by" counts on %d keyword cards updated' % changed)
    import appdata   # and its two parts for the home page
    appdata.write()

    check(kw, out_k, sp, gems, uq, tr, uniq)
    if '-v' in sys.argv:
        for k in sorted(dropped):
            print('  %s: not matched as plain text: %s' % (k, ', '.join(dropped[k])))


def on_tree(e, sp):
    """How many passives on the tree a keyword's list stands for: a card once (or [id, n] n times), a small group n times."""
    return sum(sp[x][2] if isinstance(x, int) else x[1] if isinstance(x, list) else 1 for x in e.get('p', []))


def check(kw, out_k, sp, gems, uq, tr, uniq):
    """The counts the site shows against the artifact's own (kwdata "n"). Lower only where the site leaves things out."""
    dnt_g = Counter(k for g in gems['gems'] if re.match(r'^\[DNT|^Removed Skill$', g['n']) for k in set(g.get('kw') or []))
    # and the gems tools/sync.py left out of the file altogether (DNT_GEMS "drop"), which it lists in "dropped"
    dnt_g += Counter(k for g in gems.get('dropped') or [] for k in set(g.get('kw') or []))
    dup_u = Counter(k for u in uq['items'] for k in set(u.get('kw') or [])) - Counter(k for u in uniq for k in set(u.get('kw') or []))
    dnt_p = Counter(k for p in tr['passives'] if (p.get('n') or '').startswith('[DNT') or (p.get('a') or '').startswith('[DNT')
                    or not p.get('n') or not p.get('t') for k in set(p.get('kw') or []))
    low = []
    for k, e in out_k.items():
        n = kw[k].get('n') or {}
        mine = {'gems': len(e.get('g', [])), 'uniques': len(e.get('u', [])),
                'passives': on_tree(e, sp)}
        left = {'gems': dnt_g[k], 'uniques': dup_u[k], 'passives': dnt_p[k]}
        for grp in ('gems', 'uniques', 'passives'):
            if mine[grp] < n.get(grp, 0):
                why = 'left out by the site: %d' % left[grp]
                bad = mine[grp] + left[grp] < n.get(grp, 0)
                low.append(('FIX ' if bad else '    ') + '%s %s: %d here, %d in the artifact (%s)' % (k, grp, mine[grp], n[grp], why))
    print('check against the artifact counts: %d lower' % len(low) + (' (all left out on purpose)' if not any(x.startswith('FIX') for x in low) else ''))
    for x in low:
        print(' ', x)


if __name__ == '__main__':
    main()
