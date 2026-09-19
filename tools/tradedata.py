"""Build data/trade.json: what the Trade button needs to write an official trade search.

Source: the official trade site's own data lists (https://www.pathofexile.com/api/trade2/data/...).
Run once per game patch:   python tools/tradedata.py

Output:
  mods      every searchable mod: [trade id, wording, low, high, tiers key]. Low/high is the roll range a slider
            covers (a rare's lowest to highest tier, or the site's total); tiers key points into "tiers". The id prefix is its kind: explicit, implicit,
            enchant, rune (augment), desecrated, fractured, crafted, pseudo (the site's totals).
            A wording ending in "(Local)" is the version that sits on a weapon or armour itself.
  exchange  currency-type item name  ->  exchange id (for the bulk exchange)
  uniques   unique name  ->  base types it comes on
  states    item-state filters: corrupted, twice corrupted, cultivated Vaal unique, sanctified, ...
  options   the site's own choices for category, rarity, "listed within" and price currency
  bases     every non-unique base type, by group (for "I want a ... ")
  tiers     wording -> the rare mod's tiers, low to high: [low, high, item level needed] (from the game files, RePoE)
  limits    slider ends for item level (highest mod level), quality and character level
  typings   gear kind -> the defence mixes its bases come in, e.g. boots: armour, evasion, energy shield, ...
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = 'https://www.pathofexile.com/api/trade2/data/'
UA = 'wraeclast-index/1.0 (contact: https://github.com/metaseonso/wraeclast-index/issues)'
KINDS = ('explicit', 'implicit', 'rune', 'desecrated', 'fractured', 'enchant', 'crafted')


def get(name):
    req = urllib.request.Request(API + name, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)['result']


# ---------- roll ranges and tiers, from the game files (RePoE) ----------
REPOE = 'https://repoe-fork.github.io/poe2/'
NUM = re.compile(r'[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?')
MARK = re.compile(r'\[([^\]|]*)\|([^\]]*)\]|\[([^\]]*)\]')
PAIR = re.compile(r'^([+-]?\d+(?:\.\d+)?)(?:-([+-]?\d+(?:\.\d+)?))?$')
ADDS = re.compile(r'\badds\b.*\bto\b', re.I)


def repoe(name):
    req = urllib.request.Request(REPOE + name, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def plain(t):
    return MARK.sub(lambda m: m.group(2) if m.group(2) is not None else m.group(3), t)


def key(t):
    """The wording with the numbers taken out. Must match key() in assets/trade.js."""
    t = NUM.sub('#', t).replace('+#', '#').replace('-#', '#')
    return re.sub(r'\s+', ' ', t).strip().lower()


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


def line_range(line):
    """"+(5-8) to Strength" -> (5, 8). "Adds (4-6) to (7-10)" -> the average, as the trade site searches it."""
    toks = NUM.findall(line)
    if not toks:
        return None
    parts = [p for p in (span(t) for t in toks) if p]
    if not parts:
        return None
    if len(parts) > 1 and ADDS.search(line):
        return (sum(p[0] for p in parts) / len(parts), sum(p[1] for p in parts) / len(parts))
    return parts[0]


def num(v):
    v = round(v, 2)
    return int(v) if v == int(v) else v


def rolls():
    """Per wording: the full roll range (any source), and the tiers of the normal rare mod (low to high,
    each [low, high, item level it needs]), and per mod group the best roll (for the site's totals)."""
    mods = repoe('mods.min.json'); time.sleep(1)
    aug = repoe('augments.json')
    span_by, groups, tiers, ilvl = {}, {}, {}, 1

    def add(line, group=None, tier=None):
        r = line_range(line)
        if not r:
            return
        k = key(line)
        cur = span_by.get(k)
        span_by[k] = [min(cur[0], r[0]), max(cur[1], r[1])] if cur else [r[0], r[1]]
        if group:
            g = groups.setdefault(k, {})
            g[group] = max(g.get(group, r[1]), r[1])
        if tier is not None:
            tiers.setdefault(k, {}).setdefault(tier[0], []).append([r[0], r[1], tier[1]])

    for m in mods.values():
        if m['domain'] not in ('item', 'desecrated', 'flask') or not m.get('text'):
            continue
        affix = m['generation_type'] in ('prefix', 'suffix') and m['domain'] == 'item'
        if affix:
            ilvl = max(ilvl, m['required_level'])
        grp = m['groups'][0] if affix and m['groups'] else None
        lines = plain(m['text']).split('\n')
        rolls_on = any(w['weight'] > 0 for w in m.get('spawn_weights', []))
        for line in lines:
            tier = (grp, m['required_level']) if grp and len(lines) == 1 and not m.get('is_essence_only') and rolls_on else None
            add(line, grp, tier)
    for a in aug.values():
        for c in (a.get('categories') or {}).values():
            for t in c.get('stat_text', []):
                for line in plain(t).split('\n'):
                    add(line, 'augment')
    # tiers: the mod group with the most tiers for that wording, one entry per distinct roll
    best = {}
    for k, by_group in tiers.items():
        rows = max(by_group.values(), key=len)
        seen, out = set(), []
        for lo, hi, w in sorted(rows):
            if (lo, hi) not in seen:
                seen.add((lo, hi)); out.append([num(lo), num(hi), w])
        if len(out) > 1:
            best[k] = out
    return span_by, groups, best, ilvl


# The site's totals ("pseudo" mods): the most one item can have = the best roll of every mod group that adds to it.
RES = {e: ['#% to ' + e + ' resistance', '#% to all elemental resistances'] for e in ('fire', 'cold', 'lightning')}
ATTR = {a: ['# to ' + a, '# to all attributes'] for a in ('strength', 'dexterity', 'intelligence')}
PSEUDO_SUM = {
    'pseudo_total_fire_resistance': RES['fire'], 'pseudo_total_cold_resistance': RES['cold'],
    'pseudo_total_lightning_resistance': RES['lightning'], 'pseudo_total_chaos_resistance': ['#% to chaos resistance'],
    'pseudo_total_elemental_resistance': RES['fire'] + RES['cold'] + RES['lightning'],
    'pseudo_total_resistance': RES['fire'] + RES['cold'] + RES['lightning'] + ['#% to chaos resistance'],
    'pseudo_total_all_elemental_resistances': ['#% to all elemental resistances'],
    'pseudo_total_strength': ATTR['strength'], 'pseudo_total_dexterity': ATTR['dexterity'],
    'pseudo_total_intelligence': ATTR['intelligence'], 'pseudo_total_all_attributes': ['# to all attributes'],
    'pseudo_total_attributes': ATTR['strength'] + ATTR['dexterity'] + ATTR['intelligence'],
    'pseudo_total_life': ['# to maximum life'], 'pseudo_total_mana': ['# to maximum mana'],
    'pseudo_total_energy_shield': ['# to maximum energy shield'],
    'pseudo_increased_energy_shield': ['#% increased maximum energy shield'],
    'pseudo_increased_movement_speed': ['#% increased movement speed'],
}
PSEUDO_TIERS = {'pseudo_total_fire_resistance': '#% to fire resistance', 'pseudo_total_cold_resistance': '#% to cold resistance',
                'pseudo_total_lightning_resistance': '#% to lightning resistance', 'pseudo_total_chaos_resistance': '#% to chaos resistance',
                'pseudo_total_life': '# to maximum life', 'pseudo_total_mana': '# to maximum mana',
                'pseudo_increased_movement_speed': '#% increased movement speed'}
# counts that follow the item rules: a rare has up to 3 prefixes and 3 suffixes; 4 resistances, 3 of them elemental
PSEUDO_COUNT = {'pseudo_count_resistances': 4, 'pseudo_count_elemental_resistances': 3,
                'pseudo_number_of_prefix_mods': 3, 'pseudo_number_of_suffix_mods': 3, 'pseudo_number_of_affix_mods': 6,
                'pseudo_number_of_desecrated_prefix_mods': 3, 'pseudo_number_of_desecrated_suffix_mods': 3,
                'pseudo_number_of_desecrated_mods': 6, 'pseudo_number_of_unrevealed_prefix_mods': 3,
                'pseudo_number_of_unrevealed_suffix_mods': 3, 'pseudo_number_of_unrevealed_mods': 6,
                'pseudo_number_of_empty_prefix_mods': 3, 'pseudo_number_of_empty_suffix_mods': 3,
                'pseudo_number_of_empty_affix_mods': 6}


def add_ranges(out):
    span_by, groups, tiers, ilvl = rolls()
    used = {}
    for m in out['mods']:
        kind, name = m[0].split('.', 1)
        if kind == 'pseudo':
            if name in PSEUDO_COUNT:
                m += [0, PSEUDO_COUNT[name]]
            elif name in PSEUDO_SUM:
                hi = sum(sum(groups.get(k, {}).values()) for k in PSEUDO_SUM[name])
                # "all elemental" counts once per element in the combined totals
                if name in ('pseudo_total_elemental_resistance', 'pseudo_total_resistance'):
                    hi += 2 * sum(groups.get('#% to all elemental resistances', {}).values())
                if name == 'pseudo_total_attributes':
                    hi += 2 * sum(groups.get('# to all attributes', {}).values())
                if hi > 0:
                    m += [0, num(hi)]
                    tk = PSEUDO_TIERS.get(name)
                    if tk in tiers:
                        m.append(tk)
                        used[tk] = tiers[tk]
            continue
        k = key(re.sub(r'\s*\(Local\)\s*$', '', m[1]))
        if k in tiers:   # a rare's normal range: lowest tier to highest tier
            m += [tiers[k][0][0], max(t[1] for t in tiers[k]), k]
            used[k] = tiers[k]
        elif k in span_by and span_by[k][0] != span_by[k][1]:
            m += [num(span_by[k][0]), num(span_by[k][1])]
    out['tiers'] = used
    out['limits'] = {'ilvl': ilvl, 'quality': 20, 'level': 100}


# Defence types per gear kind, from the base items that drop: which mixes of armour, evasion and energy shield exist.
GEAR = {'Helmet': 'armour.helmet', 'Body Armour': 'armour.chest', 'Gloves': 'armour.gloves', 'Boots': 'armour.boots',
        'Shield': 'armour.shield', 'Buckler': 'armour.buckler', 'Focus': 'armour.focus'}
DEF = (('armour', 'ar'), ('evasion', 'ev'), ('energy_shield', 'es'))


def typings(out):
    bases = repoe('base_items.json')
    seen = {}
    for b in bases.values():
        cat = GEAR.get(b.get('item_class'))
        if not cat or b.get('domain') != 'item' or b.get('release_state') != 'released':
            continue
        props = b.get('properties') or {}
        t = tuple(code for name, code in DEF if props.get(name))
        if t:
            c = seen.setdefault(cat, {})
            c[t] = c.get(t, 0) + 1
    order = [('ar',), ('ev',), ('es',), ('ar', 'ev'), ('ar', 'es'), ('ev', 'es'), ('ar', 'ev', 'es')]
    # a mix needs a few bases to count (one-off bases are for uniques); a kind needs two mixes to be worth a choice
    out['typings'] = {cat: [list(t) for t in order if c.get(t, 0) >= 3] for cat, c in seen.items()
                      if sum(1 for t in order if c.get(t, 0) >= 3) > 1}


def main():
    stats = get('stats'); time.sleep(1)
    items = get('items'); time.sleep(1)
    static = get('static'); time.sleep(1)
    filters = get('filters')
    out = {'mods': [], 'exchange': {}, 'uniques': {}, 'states': [], 'options': {}, 'bases': {}}
    for group in stats:
        if group.get('id') not in KINDS + ('pseudo',):
            continue
        for e in group.get('entries', []):
            out['mods'].append([e['id'], e['text']])
    for group in items:
        for e in group.get('entries', []):
            if (e.get('flags') or {}).get('unique') and e.get('name'):
                bases = out['uniques'].setdefault(e['name'], [])
                if e['type'] not in bases:
                    bases.append(e['type'])
    for group in filters:   # the site's own option lists
        for f in group.get('filters', []):
            if f['id'] in ('category', 'rarity', 'indexed', 'price'):
                out['options'][f['id']] = [[o.get('id'), o.get('text')] for o in f['option']['options'] if o.get('id')]
    for group in items:
        seen = set()
        for e in group.get('entries', []):
            if not (e.get('flags') or {}).get('unique') and e.get('type') and e['type'] not in seen:
                seen.add(e['type'])
                out['bases'].setdefault(group['label'], []).append(e['type'])
    for group in filters:   # yes/no item states from the Miscellaneous group
        if group.get('id') != 'misc_filters':
            continue
        for f in group.get('filters', []):
            opts = [o.get('id') for o in (f.get('option') or {}).get('options', [])]
            if 'true' in opts and 'false' in opts and f['id'] != 'identified':
                out['states'].append([f['id'], f.get('text') or f['id']])
    for group in static:
        for e in group.get('entries', []):
            if e.get('id') and e.get('text'):
                out['exchange'][e['text']] = e['id']
    add_ranges(out)
    typings(out)
    (ROOT / 'data' / 'trade.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print({k: len(v) for k, v in out.items()}, 'states:', [x[1] for x in out['states']])


if __name__ == '__main__':
    sys.exit(main())
