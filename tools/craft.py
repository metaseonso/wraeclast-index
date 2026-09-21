"""Build data/craft.json and data/craft/<kind>.json: everything the Craft tab shows.

Run once per game patch (after tools/tradedata.py):   python tools/craft.py      (add --cache DIR to keep the downloads)

Sources, all official game data:
  RePoE export of the game files (https://repoe-fork.github.io/poe2/):
    base_items   the bases, their drop level, requirements, defences, weapon stats, implicits, tags and art
    mods         every mod: prefix or suffix, mod group, level, wording, tags and where it can roll (spawn tags);
                 also the desecrated mods (abyss bones) and the Vaal Orb's corruption mods.
                 The spawn weights are 1 or 0 — can roll, or cannot; how often one rolls is not in the files (weight())
    augments     runes, soul cores and idols: what each gives in each kind of item
    item_classes and the item metadata (Metadata/Items/.../Abstract*.json): socket limits and which rarities a kind can be
  The official trade site's item list (data/trade.json, built by tools/tradedata.py): which bases exist in the game today.
  poe2db.tw (datamined from the same game files), only for what RePoE does not export:
    - the essence tables: the mod each essence adds on each kind of item, prefix or suffix, and its level
    - "Minimum Modifier Level" of the Greater and Perfect orbs and the Ancient bones, "Maximum Item Level" of the Gnawed bones
  If poe2db cannot be reached, the essences and levels already in data/craft are kept.

Hand-kept facts (not in the game data exports):
  AFFIX_MAX  jewels take 2 prefixes and 2 suffixes; other rares 3 and 3; magic items 1 and 1.
  KEYWORDS   what the game's words "Armour", "Martial Weapon", ... cover, as the essence tables on poe2db expand them
             (checked on every run against those tables; a mismatch is printed).

Output (compact; every string is the game's own wording with the markup taken out):
  craft.json        patch, img (art prefix), ilvl (highest mod level), classes [{id, n, g group, cat trade category,
                    so max augment sockets, mx [prefixes, suffixes], rare, b [[base, drop level]]}],
                    orbs, omens, bones, cats (catalysts)
  craft/<id>.json   bases [{n, dl, rq [level, str, dex, int], d defences, pr property lines, im implicit lines, p pool, ic art, ca catalyst quality}]
                    fam   mod families: [prefix/suffix, wording with #, tags, exclusive groups (numbers), kind, lord]
                          kind: '' rolls normally, 'e' essence only, 'd' desecrated, 'c' Vaal Orb corruption
                    mods  [mod id (for links), family, level, lines, affix name, low, high] (low/high: the slider's number)
                    pools per base tag set: {m rolling mods, d desecrated, c corruption} as indexes into mods
                    ess   [essence, 'm' magic to rare or 'r' rare (removes a random mod), mod index, level in the essence table]
                    aug   [name, type, level, lines, bonded lines, limit]
"""
import argparse
import collections
import gzip
import hashlib
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'craft.json'
OUT_DIR = ROOT / 'data' / 'craft'
REPOE = 'https://repoe-fork.github.io/poe2/'
POE2DB = 'https://poe2db.tw/us/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
CACHE = None

# ---------------------------------------------------------------- the kinds of item
# game item class -> (page id, trade category). The name shown is the trade site's own name for the category.
CLASSES = [
    ('Body Armour', 'body-armour', 'armour.chest'), ('Helmet', 'helmet', 'armour.helmet'), ('Gloves', 'gloves', 'armour.gloves'),
    ('Boots', 'boots', 'armour.boots'), ('Shield', 'shield', 'armour.shield'), ('Buckler', 'buckler', 'armour.buckler'),
    ('Focus', 'focus', 'armour.focus'), ('Quiver', 'quiver', 'armour.quiver'),
    ('Amulet', 'amulet', 'accessory.amulet'), ('Ring', 'ring', 'accessory.ring'), ('Belt', 'belt', 'accessory.belt'),
    ('Bow', 'bow', 'weapon.bow'), ('Crossbow', 'crossbow', 'weapon.crossbow'), ('Wand', 'wand', 'weapon.wand'),
    ('Staff', 'staff', 'weapon.staff'), ('Sceptre', 'sceptre', 'weapon.sceptre'), ('Warstaff', 'quarterstaff', 'weapon.warstaff'),
    ('Spear', 'spear', 'weapon.spear'), ('One Hand Mace', 'one-hand-mace', 'weapon.onemace'),
    ('Two Hand Mace', 'two-hand-mace', 'weapon.twomace'), ('Talisman', 'talisman', 'weapon.talisman'),
    ('Flail', 'flail', 'weapon.flail'), ('Dagger', 'dagger', 'weapon.dagger'), ('Claw', 'claw', 'weapon.claw'),
    ('One Hand Sword', 'one-hand-sword', 'weapon.onesword'), ('Two Hand Sword', 'two-hand-sword', 'weapon.twosword'),
    ('One Hand Axe', 'one-hand-axe', 'weapon.oneaxe'), ('Two Hand Axe', 'two-hand-axe', 'weapon.twoaxe'),
    ('Jewel', 'jewel', 'jewel'),
    ('LifeFlask', 'life-flask', 'flask.life'), ('ManaFlask', 'mana-flask', 'flask.mana'), ('UtilityFlask', 'charm', 'flask.charm'),
]
GROUP = {'Amulet': 'Jewellery', 'Ring': 'Jewellery', 'Belt': 'Jewellery', 'Jewel': 'Jewels',
         'LifeFlask': 'Flasks', 'ManaFlask': 'Flasks', 'UtilityFlask': 'Flasks'}
ARMOUR = {'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Shield', 'Buckler', 'Focus'}
for _c in ARMOUR | {'Quiver'}:
    GROUP[_c] = 'Armour'
MARTIAL = {'Bow', 'Crossbow', 'Warstaff', 'Spear', 'One Hand Mace', 'Two Hand Mace', 'Talisman', 'Flail', 'Dagger', 'Claw',
           'One Hand Sword', 'Two Hand Sword', 'One Hand Axe', 'Two Hand Axe'}
CASTER = {'Wand', 'Staff', 'Sceptre'}
WEAPONS = MARTIAL | CASTER | {'Sceptre'}
JEWELLERY = {'Amulet', 'Ring'}
EQUIPMENT = ARMOUR | WEAPONS | JEWELLERY | {'Belt', 'Quiver'}
KEYWORDS = {'armour': ARMOUR, 'martial weapon': MARTIAL, 'caster weapon': CASTER, 'weapon': WEAPONS, 'weapons': WEAPONS,
            'jewellery': JEWELLERY, 'equipment': EQUIPMENT, 'all equipment': EQUIPMENT,
            'melee weapon': MARTIAL - {'Bow', 'Crossbow'},
            'one handed melee weapon': {'Spear', 'One Hand Mace', 'Flail', 'Dagger', 'Claw', 'One Hand Sword', 'One Hand Axe'},
            'two handed melee weapon': {'Warstaff', 'Two Hand Mace', 'Talisman', 'Two Hand Sword', 'Two Hand Axe'}}
for _c in WEAPONS:
    GROUP[_c] = 'Weapons'
AFFIX_MAX = {'Jewel': 2}          # rare jewels: 2 prefixes, 2 suffixes
LOCAL_GEAR = ARMOUR | WEAPONS | {'Quiver'}   # mods that read "(Local)" on the trade site sit on these
DOMAIN = {'Jewel': 'misc', 'LifeFlask': 'flask', 'ManaFlask': 'flask', 'UtilityFlask': 'flask'}

# mod tags shown as filter chips on the page (the rest are left out of the data)
TAGS = ['life', 'mana', 'defences', 'resistance', 'attribute', 'attack', 'caster', 'minion', 'physical', 'elemental',
        'fire', 'cold', 'lightning', 'chaos', 'critical', 'speed', 'ailment', 'gem', 'flask', 'charm', 'aura', 'curse', 'damage']
LORDS = {'ulaman_mod': 'Ulaman', 'amanamu_mod': 'Amanamu', 'kurgal_mod': 'Kurgal'}

# crafting orbs: name, the Greater and Perfect versions (if any)
ORBS = [('Orb of Transmutation', True), ('Orb of Augmentation', True), ('Regal Orb', True), ('Orb of Alchemy', False),
        ('Exalted Orb', True), ('Chaos Orb', True), ('Orb of Annulment', False), ('Divine Orb', False), ('Vaal Orb', False),
        ('Fracturing Orb', False), ("Artificer's Orb", False)]
# which orb an omen steers, found in the omen's own wording
OMEN_ORB = [('Exalted Orb', 'Exalted Orb'), ('Regal Orb', 'Regal Orb'), ('Chaos Orb', 'Chaos Orb'), ('Orb of Alchemy', 'Orb of Alchemy'),
            ('Orb of Annulment', 'Orb of Annulment'), ('Divine Orb', 'Divine Orb'), ('Vaal Orb', 'Vaal Orb'),
            ('Essence', 'Essence'), ('Desecrat', 'Desecrate')]

NUM = re.compile(r'[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?')
PAIR = re.compile(r'^([+-]?\d+(?:\.\d+)?)(?:-([+-]?\d+(?:\.\d+)?))?$')
ADDS = re.compile(r'\badds\b.*\bto\b', re.I)
RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}|\{[^}\s]{0,80}\}|\[[^\]]*\]|<[^>]+>')


# ---------------------------------------------------------------- fetching
def cache_file(url):
    return CACHE / (re.sub(r'[^\w.-]+', '_', url)[-120:] + '_' + hashlib.md5(url.encode()).hexdigest()[:8]) if CACHE else None


def fetch(url, binary=False):
    f = cache_file(url)
    if f:
        if f.exists():
            b = f.read_bytes()
            return b if binary else json.loads(b)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
            break
        except Exception:
            if attempt == 2:
                raise
            time.sleep(4)
    if f:
        f.write_bytes(b)
    return b if binary else json.loads(b)


def repoe(name):
    return fetch(REPOE + name)


def page(path):
    """A poe2db page as text (a short pause between pages, to be polite). path: as poe2db links it, e.g. Greater_Chaos_Orb."""
    f = cache_file(POE2DB + path)
    b = fetch(POE2DB + path, binary=True)
    if not (f and f.exists() and time.time() - f.stat().st_mtime > 5):
        time.sleep(0.4)
    return b.decode('utf-8', 'replace')


# ---------------------------------------------------------------- wording
def plain(t):
    """Game markup [Id|Shown] or [Id] to plain words."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    return re.sub(r'\[([^\]]+)\]', r'\1', t).replace('\r', '')


def lines(t):
    return [x.strip() for x in plain(t).split('\n') if x.strip()]


GLUE = re.compile(r'(?:\b(?:a|an|the|your|next|of|to|with|and|or|for|in|on|by|per|up)|,)$', re.I)


def sentence(t):
    """The game wraps long text over several lines: join a mid-sentence break with a space."""
    out = []
    for x in lines(t):
        if out and (x[0].islower() or GLUE.search(out[-1])):
            out[-1] += ' ' + x
        else:
            out.append(x)
    return ' '.join(out)


def template(line):
    """"+(10-19) to maximum Life" -> "+# to maximum Life"."""
    return NUM.sub(lambda m: ('+' if m.group(0).startswith('+') else '-' if m.group(0).startswith('-') and '(' not in m.group(0) else '') + '#', line)


def span(tok):
    neg = tok[0] == '-' and '(' in tok
    body = tok.lstrip('+-') if '(' in tok and tok[0] != '(' else tok.lstrip('+')
    m = PAIR.match(body.replace('(', '').replace(')', ''))
    if not m:
        return None
    a = float(m.group(1)); b = float(m.group(2)) if m.group(2) else a
    if neg:
        a, b = -a, -b
    return min(a, b), max(a, b)


def num(v):
    v = round(v, 2)
    return int(v) if v == int(v) else v


def line_range(ls):
    """The number a slider moves: the first line with numbers. "Adds (4-6) to (7-10)" -> the average, like the trade site.
    Same rules as range() in assets/trade.js."""
    for line in ls:
        parts = [p for p in (span(t) for t in NUM.findall(line)) if p]
        if not parts:
            continue
        if len(parts) > 1 and ADDS.search(line):
            return num(sum(p[0] for p in parts) / len(parts)), num(sum(p[1] for p in parts) / len(parts))
        return num(parts[0][0]), num(parts[0][1])
    return None


def norm(t):
    return re.sub(r'\s+', ' ', t.replace('—', '-').replace('–', '-')).strip().lower()


def cell(h):
    """poe2db table cell HTML -> the game's wording, one line per <br>."""
    h = re.sub(r'<span class="ndash">.*?</span>', '-', h, flags=re.S)
    h = re.sub(r'<br\s*/?>', '\n', h)
    h = re.sub(r'<[^>]+>', '', h)
    return '\n'.join(x.strip() for x in html.unescape(h).replace('—', '-').replace('–', '-').split('\n') if x.strip())


# ---------------------------------------------------------------- mods that can roll
def weight(m, tags):
    """The game's rule: the first spawn tag the item has decides.

    The export states every weight as 1 (can roll) or 0 (cannot) — the numbers the game rolls with are not in
    the files, and poe2db says the same ("Weight information cannot be obtained from game file"; theirs is
    measured with recombinators, not read out of the client). So a pool here is the set of mods a base can
    roll, with nothing to say which of them comes up more often, and the page shows no roll chances.
    scale() below prints the day that changes."""
    for w in m.get('spawn_weights') or []:
        if w['tag'] in tags:
            return w['weight']
    return 0


def scale(MODS):
    """What the export's spawn weights look like. If real weights ever appear, the Craft page can show them."""
    vals = sorted({w['weight'] for m in MODS.values() for w in m.get('spawn_weights') or []})
    print('spawn weights in the export:', vals,
          '(can roll / cannot: no real weights to show)' if set(vals) <= {0, 1} else '· REAL WEIGHTS — the Craft page can show how often a mod rolls')


class ClassMods:
    """The mods table of one kind of item. Families are mods of one type; tiers are its mods by level."""

    def __init__(self):
        self.mods, self.fam, self.at, self.fat, self.groups = [], [], {}, {}, {}

    def group(self, g):
        return self.groups.setdefault(g, len(self.groups))

    def add(self, mid, m, kind=''):
        if mid in self.at:
            return self.at[mid]
        ls = lines(m.get('text'))
        if not ls:
            return None
        affix = 'p' if m['generation_type'] == 'prefix' else 's' if m['generation_type'] == 'suffix' else ''
        fkey = (kind, affix, m['type'], tuple(template(x) for x in ls))
        f = self.fat.get(fkey)
        if f is None:
            tg = sorted({t for t in m.get('implicit_tags') or [] if t in TAGS})
            lord = next((LORDS[t] for t in m.get('implicit_tags') or [] if t in LORDS), '')
            f = self.fat[fkey] = len(self.fam)
            self.fam.append([affix, [template(x) for x in ls], tg, [self.group(g) for g in m['groups']], kind, lord])
        r = line_range(ls)
        self.at[mid] = len(self.mods)
        self.mods.append([mid, f, m['required_level'], ls, m.get('name') or '', r[0] if r else None, r[1] if r else None])
        return self.at[mid]

    def extra(self, key, affix, ls, lvl, groups=()):
        """An essence mod the game files do not list as a mod (matched by wording only)."""
        if key in self.at:
            return self.at[key]
        f = len(self.fam)
        self.fam.append([affix, [template(x) for x in ls], [], [self.group(g) for g in groups] or [self.group('essence ' + key)], 'e', ''])
        r = line_range(ls)
        self.at[key] = len(self.mods)
        self.mods.append([key, f, lvl, ls, '', r[0] if r else None, r[1] if r else None])
        return self.at[key]

    def ordered(self, idxs):
        """Mods of a pool: by family, then by level (lowest tier first)."""
        return sorted(set(idxs), key=lambda i: (self.mods[i][1], self.mods[i][2], self.mods[i][5] or 0))


def socket_limit(meta):
    """"1:5:100 2:5:100" (socket count : item level : weight) -> 2. Counts that need item level 9999 never happen."""
    info = ((meta or {}).get('Sockets') or {}).get('socket_info') or ''
    counts = [int(a) for a, lvl, _ in (t.split(':') for t in info.split() if t.count(':') == 2) if int(lvl) <= 100]
    return max(counts or [0])


# ---------------------------------------------------------------- base cards
def base_props(v):
    p = v.get('properties') or {}
    out = []
    val = lambda x: str(x['min']) if x['min'] == x['max'] else '%d-%d' % (x['min'], x['max'])
    if p.get('armour'):
        out.append('Armour: ' + val(p['armour']))
    if p.get('evasion'):
        out.append('Evasion Rating: ' + val(p['evasion']))
    if p.get('energy_shield'):
        out.append('Energy Shield: ' + val(p['energy_shield']))
    if p.get('block'):
        out.append('Block chance: %d%%' % p['block'])
    if p.get('physical_damage_max'):
        out.append('Physical Damage: %d-%d' % (p['physical_damage_min'], p['physical_damage_max']))
    if p.get('critical_strike_chance'):
        out.append('Critical Hit Chance: %s%%' % num(p['critical_strike_chance'] / 100))
    if p.get('attack_time'):
        out.append('Attacks per Second: %.2f' % (1000 / p['attack_time']))
    if p.get('life_per_use'):
        out.append('Recovers %d Life over %s Seconds' % (p['life_per_use'], num(p['duration'] / 10)))
    if p.get('mana_per_use'):
        out.append('Recovers %d Mana over %s Seconds' % (p['mana_per_use'], num(p['duration'] / 10)))
    if p.get('duration') and not (p.get('life_per_use') or p.get('mana_per_use')):
        out.append('Lasts %s Seconds' % num(p['duration'] / 10))
    if p.get('charges_per_use'):
        out.append('Consumes %d of %d Charges on use' % (p['charges_per_use'], p['charges_max']))
    return out


def defences(v):
    p = v.get('properties') or {}
    return '+'.join(c for k, c in (('armour', 'ar'), ('evasion', 'ev'), ('energy_shield', 'es')) if p.get(k))


# ---------------------------------------------------------------- poe2db
def essences(item_class_names):
    """Every essence: its kind (magic to rare, or on a rare) and per item class the mod it adds, from poe2db."""
    t = page('Essence')
    sec = t[t.find('id="Essence" class="tab-pane'):t.find('id="EssenceRef"')]
    out = []
    for c in sec.split('<div class="col">')[1:]:
        name = re.search(r'href="([^"]+)"><img[^>]*height="16"[^>]*/>([^<]+)</a>', c)
        if not name:
            continue
        mods = re.findall(r'<div class="explicitMod">(.*?)</div>', c, flags=re.S)
        what = cell(mods[0]) if mods else ''
        kind = 'm' if what.startswith('Upgrades a Magic item') else 'r' if 'Rare item' in what else None
        if not kind:
            continue
        p = page(html.unescape(name.group(1)))
        rows = []
        tb = p[p.find('<th>Class</th>'):]
        tb = tb[:tb.find('</table>')]
        for tr in re.findall(r'<tr>(.*?)</tr>', tb, flags=re.S):
            td = re.findall(r'<td>(.*?)</td>', tr, flags=re.S)
            if len(td) < 4:
                continue
            cls = item_class_names.get(cell(td[0]))
            if cls:
                lvl = re.sub(r'\D', '', cell(td[3]))
                rows.append([cls, cell(td[1]), cell(td[2]).lower()[:1], int(lvl or 1)])
        out.append({'n': html.unescape(name.group(2)).strip(), 'k': kind, 't': what, 'rows': rows,
                    'lines': [cell(x) for x in mods[1:]]})
    return out


def item_levels(name):
    """"Minimum Modifier Level" and "Maximum Item Level" on the item's poe2db card."""
    t = page(urllib.parse.quote(name.replace("'", '').replace(' ', '_')))
    box = t[t.find('newItemPopup'):][:6000]
    box = re.sub(r'<[^>]+>', ' ', box)
    lo = re.search(r'Minimum Modifier Level\s*:\s*(\d+)', box)
    hi = re.search(r'Maximum Item Level\s*:\s*(\d+)', box)
    return (int(lo.group(1)) if lo else None), (int(hi.group(1)) if hi else None)


# ---------------------------------------------------------------- main
def main():
    global CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', help='folder to keep the downloads in (for repeated runs)')
    args = ap.parse_args()
    if args.cache:
        CACHE = Path(args.cache)
        CACHE.mkdir(parents=True, exist_ok=True)

    version = re.search(r'version ([\d.]+)', fetch(REPOE, binary=True).decode('utf-8', 'replace'))
    version = version.group(1) if version else ''
    patch = re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', version)
    print('RePoE game version', version, '-> patch', patch)
    BASE = repoe('base_items.min.json')
    MODS = repoe('mods.min.json')
    scale(MODS)
    AUG = repoe('augments.min.json')
    ICLS = repoe('item_classes.min.json')
    trade = json.loads((ROOT / 'data' / 'trade.json').read_text(encoding='utf-8'))
    in_game = {x for g in ('Accessories', 'Armour', 'Weapons', 'Jewels', 'Flasks') for x in trade['bases'].get(g, [])}
    cat_name = dict(trade['options']['category'])
    plural = {v['name']: k for k, v in ICLS.items() if v.get('name')}   # "Body Armours" -> "Body Armour"
    wanted = {c for c, _, _ in CLASSES}
    old = {}
    if OUT.exists():
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
        except Exception:
            old = {}

    # ---- bases: in the game today, one entry per name (names whose variants differ are left out: Runemastered)
    by_name = collections.defaultdict(list)
    for path, v in BASE.items():
        if (v.get('release_state') == 'released' and v['item_class'] in wanted and v['name'] in in_game
                and v['domain'] in ('item', 'misc', 'flask')):
            by_name[v['name']].append((path, v))
    skipped = []
    bases = collections.defaultdict(list)
    for name, vs in by_name.items():
        if len({tuple(v['implicits']) for _, v in vs}) > 1:
            skipped.append(name)
            continue
        bases[vs[0][1]['item_class']].append(vs[0])
    print('bases:', sum(len(x) for x in bases.values()), '· left out (variants differ):', len(skipped))

    # ---- item metadata: socket limits and rarities
    meta = {}
    for cls in wanted:
        if bases.get(cls):
            parent = bases[cls][0][1]['inherits_from']
            try:
                meta[cls] = repoe(parent + '.min.json')
            except Exception as e:
                print('  no metadata for', cls, e, file=sys.stderr)
                meta[cls] = {}

    # ---- essences (poe2db)
    try:
        ESS = essences(plural)
        print('essences from poe2db:', len(ESS))
    except Exception as e:
        print('  poe2db essences not loaded (%s); keeping the ones in data/craft' % e, file=sys.stderr)
        ESS = None

    # ---- mods by text, for matching the essence tables
    by_text = collections.defaultdict(list)
    for mid, m in MODS.items():
        if m['domain'] in ('item', 'misc') and m['generation_type'] in ('prefix', 'suffix') and m.get('text'):
            by_text[norm('\n'.join(lines(m['text'])))].append(mid)

    # ---- keyword check: does "Martial Weapon" etc. cover what the essence tables say?
    if ESS:
        for e in ESS:
            for ln in e['lines']:
                if ':' not in ln:
                    continue
                cat, text = ln.split(':', 1)
                words = [w.strip().lower() for w in re.split(r',| or ', cat) if w.strip()]
                if len(words) != 1 or words[0] not in KEYWORDS:
                    continue
                got = {r[0] for r in e['rows'] if norm(r[1]) == norm(text)}
                want = KEYWORDS[words[0]] & set(bases)
                if got and got != want:
                    print('  keyword "%s" (%s): essence table has %s, we have %s' % (words[0], e['n'], sorted(got), sorted(want)), file=sys.stderr)

    # ---- per kind of item
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    classes, top_ilvl = [], 1
    for cls, cid, cat in CLASSES:
        if not bases.get(cls):
            continue
        domain = DOMAIN.get(cls, 'item')
        md = meta.get(cls) or {}
        rar = (md.get('Mods') or {})
        rare = bool((rar.get('enable_rarity') or {}).get('rare')) and rar.get('disable_rarity') != 'rare'
        mx = AFFIX_MAX.get(cls, 3) if rare else 1
        so = socket_limit(md)
        T = ClassMods()
        pools, pool_at, pool_sig, out_bases = [], {}, {}, []
        for path, v in sorted(bases[cls], key=lambda x: (x[1]['drop_level'], x[1]['name'])):
            tags = set(v['tags'])
            for imp in v['implicits']:
                tags |= set((MODS.get(imp) or {}).get('adds_tags') or [])
            key = tuple(sorted(tags))
            if key not in pool_at:
                roll, des, cor = [], [], []
                for mid, m in MODS.items():
                    if m.get('is_essence_only'):
                        continue
                    kind = None
                    if m['domain'] == domain and m['generation_type'] in ('prefix', 'suffix'):
                        kind, into = '', roll
                    elif m['domain'] == 'desecrated' and m['generation_type'] in ('prefix', 'suffix'):
                        kind, into = 'd', des
                    elif m['domain'] == domain and m['generation_type'] == 'corrupted':
                        kind, into = 'c', cor
                    if kind is None or weight(m, tags) <= 0:
                        continue
                    i = T.add(mid, m, kind)
                    if i is not None:
                        into.append(i)
                        if kind == '':
                            top_ilvl = max(top_ilvl, m['required_level'])
                sig = (tuple(sorted(roll)), tuple(sorted(des)), tuple(sorted(cor)))   # many tag sets roll the same mods
                if sig not in pool_sig:
                    pool_sig[sig] = len(pools)
                    pools.append({'m': roll, 'd': des, 'c': cor})
                pool_at[key] = pool_sig[sig]
            implicit = [x for imp in v['implicits'] for x in lines((MODS.get(imp) or {}).get('text'))]
            rq = v.get('requirements') or {}
            b = {'n': v['name'], 'dl': v['drop_level'], 'p': pool_at[key]}
            if any(rq.get(k) for k in ('level', 'strength', 'dexterity', 'intelligence')):
                b['rq'] = [rq.get('level', 0), rq.get('strength', 0), rq.get('dexterity', 0), rq.get('intelligence', 0)]
            if defences(v):
                b['d'] = defences(v)
            if base_props(v):
                b['pr'] = base_props(v)
            if implicit:
                b['im'] = implicit
            art = (v.get('visual_identity') or {}).get('dds_file') or ''
            if art.endswith('.dds'):
                b['ic'] = art[:-4]
            if 'ItemCanHaveBaseAndCatalystQuality' in v['implicits'] or cls in JEWELLERY or cls == 'Jewel':
                b['ca'] = 1
            out_bases.append(b)

        # essences for this kind
        ess = []
        if ESS is not None:
            names = set()
            for e in ESS:
                for rcls, text, affix, lvl in e['rows']:
                    if rcls != cls:
                        continue
                    cands = [mid for mid in by_text.get(norm(text), []) if (MODS[mid]['generation_type'][0] == affix)]
                    exact = [mid for mid in cands if MODS[mid]['required_level'] == lvl] or cands
                    known = [mid for mid in exact if mid in T.at]
                    if known:
                        i = known[0]
                        i = T.at[i]
                    elif exact:
                        m = MODS[exact[0]]
                        i = T.add(exact[0], dict(m, required_level=lvl), 'e')
                    else:
                        i = T.extra('essence:' + e['n'] + ':' + cls, affix, text.split('\n'), lvl)
                    if e['n'] not in names:
                        names.add(e['n'])
                        ess.append([e['n'], e['k'], i, lvl])
        else:
            prev = OUT_DIR / (cid + '.json')
            if prev.exists():
                pj = json.loads(prev.read_text(encoding='utf-8'))
                for n, k, i, lvl in pj.get('ess', []):
                    pm = pj['mods'][i]
                    pf = pj['fam'][pm[1]]
                    mid = pm[0]
                    j = T.at.get(mid)
                    if j is None:
                        j = T.add(mid, dict(MODS[mid], required_level=pm[2]), 'e') if mid in MODS else \
                            T.extra(mid, pf[0], pm[3], pm[2])
                    ess.append([n, k, j, lvl])

        # augments that fit this kind
        aug = []
        if so:
            for path, a in AUG.items():
                bi = BASE.get(path)
                if not bi or bi.get('release_state') != 'released':
                    continue
                for cname, c in (a.get('categories') or {}).items():
                    tgt = c.get('target')
                    if isinstance(tgt, list):
                        fits = {plural.get(x) for x in tgt}
                    else:
                        fits = set()
                        for w in re.split(r',| or | and ', plain(tgt or '')):
                            w = w.strip()
                            if not w:
                                continue
                            fits |= KEYWORDS.get(w.lower()) or {plural.get(w), plural.get(w + 's'), w}
                    if cls not in fits:
                        continue
                    ls = [x for t in c.get('stat_text') or [] for x in lines(t)]
                    bonded = [x for t in c.get('bonded_stat_text') or [] for x in lines(t)]
                    if ls and not any('destroys the item' in x for x in ls):   # Aldur's Legacy is for uniques
                        aug.append([bi['name'], plain(a.get('type_name')), a.get('required_level') or 0, ls, bonded, plain(a.get('limit') or '')])
                    break
            aug.sort(key=lambda x: (x[1] != 'Rune', x[1], x[2], x[0]))

        for p in pools:
            for k in p:
                p[k] = T.ordered(p[k])
        data = {'bases': out_bases, 'fam': T.fam, 'mods': T.mods, 'pools': pools, 'ess': ess, 'aug': aug}
        check(data, cid)
        (OUT_DIR / (cid + '.json')).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
        classes.append({'id': cid, 'c': cls, 'n': 'Jewel' if cat == 'jewel' else cat_name.get(cat, cls), 'g': GROUP.get(cls, ''), 'cat': cat, 'so': so,
                        'mx': [mx, mx], 'rare': rare, 'loc': cls in LOCAL_GEAR,
                        'b': [[b['n'], b['dl']] for b in out_bases]})
        print('  %-16s %3d bases  %4d mods  %2d pools  %2d essences  %3d augments  sockets %d  %s' % (
            cls, len(out_bases), len(T.mods), len(pools), len(ess), len(aug), so, 'rare %d/%d' % (mx, mx) if rare else 'magic'))

    # ---- orbs, omens, bones, catalysts
    cur = {}
    for path, v in BASE.items():
        if v.get('release_state') == 'released' and v['item_class'] in ('StackableCurrency', 'Omen'):
            cur.setdefault(v['name'], v)

    def desc(n):
        return sentence((cur.get(n, {}).get('properties') or {}).get('description', ''))

    old_lv = {o['n']: o for o in old.get('orbs', [])}
    old_lv.update({b['n']: b for b in old.get('bones', [])})

    def levels(n):
        try:
            return item_levels(n)
        except Exception as e:
            print('  poe2db level for %s not loaded (%s); keeping the old one' % (n, e), file=sys.stderr)
            o = old_lv.get(n) or {}
            return o.get('ml'), o.get('mi')

    orbs = []
    for n, tiered in ORBS:
        if n not in cur:
            continue
        o = {'n': n, 't': desc(n)}
        if tiered:
            o['up'] = []
            for pre in ('Greater ', 'Perfect '):
                if pre + n in cur:
                    ml, _ = levels(pre + n)
                    o['up'].append([pre + n, ml or 0])
        orbs.append(o)
    omens = []
    for n, v in cur.items():
        if v['item_class'] != 'Omen':
            continue
        t = desc(n)
        if not t or 'Waystone' in t or 'Logbook' in t:
            continue
        orb = next((o for w, o in OMEN_ORB if w in t), None)
        if not orb:
            continue
        t = re.sub(r'^While this item is active in your inventory\s*', '', t)
        o = {'n': n, 't': t[:1].upper() + t[1:], 'orb': orb}
        if re.search(r'\badd only prefix', t, re.I):     # steers what is added (not what is removed)
            o['only'] = 'p'
        elif re.search(r'\badd only suffix', t, re.I):
            o['only'] = 's'
        omens.append(o)
    omens.sort(key=lambda o: ([x[1] for x in OMEN_ORB].index(o['orb']), o['n']))
    ids = {c['c']: c['id'] for c in classes}
    bones = []
    for n, v in cur.items():
        t = (v.get('properties') or {}).get('description', '')
        if 'Abyssalify' not in t or 'Waystone' in t:
            continue
        tail = plain(t).split('Rare', 1)[-1].split(' with ')[0]
        on = set()
        for w in re.split(r',| or ', tail):
            w = w.strip()
            on |= KEYWORDS.get(w.lower()) or ({'Quiver'} if w == 'Quiver' else {'Jewel'} if w == 'Jewel' else {w})
        ml, mi = levels(n)
        b = {'n': n, 't': sentence(t), 'on': sorted(ids[c] for c in on if c in ids)}
        if ml:
            b['ml'] = ml
        if mi:
            b['mi'] = mi
        if b['on']:
            bones.append(b)
    bones.sort(key=lambda b: (b['on'][0], ['Gnawed', 'Preserved', 'Ancient', 'Altered'].index(b['n'].split()[0]) if b['n'].split()[0] in ('Gnawed', 'Preserved', 'Ancient', 'Altered') else 9))
    cats = []
    for n, v in cur.items():
        tg = [t[:-9] for t in v.get('tags', []) if t.endswith('_catalyst') and t != 'jewel_catalyst']
        if ('catalyst' in v.get('tags', []) or 'jewel_catalyst' in v.get('tags', [])) and tg and tg[0] != 'jewel':
            tag = {'defences': 'defences', 'defence': 'defences', 'attribute': 'attribute', 'attributes': 'attribute'}.get(tg[0], tg[0])
            cats.append({'n': n, 't': desc(n).replace(' Replaces other quality types', ''), 'tag': tag,
                         'on': 'jewel' if 'jewel' in desc(n).split('on a')[-1] else 'jewellery'})

    out = {'patch': patch, 'img': REPOE, 'ilvl': top_ilvl, 'classes': classes, 'orbs': orbs, 'omens': omens, 'bones': bones, 'cats': cats}
    check(out, 'craft.json')
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    size = OUT.stat().st_size + sum(f.stat().st_size for f in OUT_DIR.glob('*.json'))
    print('orbs %d, omens %d, bones %d, catalysts %d · %d kinds · %.0f KB in all -> data/craft.json, data/craft/' % (
        len(orbs), len(omens), len(bones), len(cats), len(classes), size / 1024))


def check(data, name):
    """No raw game code in anything the page shows (ids, art paths and trade categories are never shown)."""
    bad = []

    def scan(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                if k not in ('ic', 'cat', 'img', 'id', 'c'):
                    scan(v, path + '.' + k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                scan(v, path + '[%d]' % i)
        elif isinstance(x, str) and RAW.search(x):
            bad.append((path, x))
    mods = data.get('mods')
    if mods is not None:   # the first column of mods is the mod id (kept for links, never shown)
        data = dict(data, mods=[m[1:] for m in mods])
    scan(data, name)
    if bad:
        for b in bad[:20]:
            print('  raw game code:', b, file=sys.stderr)
        sys.exit('raw game code in ' + name + '; fix the wording before publishing')


if __name__ == '__main__':
    sys.exit(main())
