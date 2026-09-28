"""The passive tree, from the game files: the drill-down's tree file (data/explore/tree.*.json), without the artifact.

Every node of the Default tree, with its wording, kind, ascendancy, the part of the wheel it sits in, and the
three Liquid emotions that anoint it.

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
  passive_skill_trees/Default.min.json   every node (passives): hash, id, name, stats, flags, flavour,
                                         ascendancy, granted skill; and the layout (groups, orbit_radii,
                                         skills_per_orbit, roots) the node positions come from
  stat_translations/stat_descriptions.min.json and passive_skill_stat_descriptions.min.json
                                         the game's wording. The passive file includes the main one and then
                                         adds its own entries; a stat both describe takes the passive file's
                                         wording and place (keystones read in full, no "Global")
  skill_gems.min.json                    a granted skill's name
  ascendancies.min.json                  an ascendancy's name, and the angle of its class's part of the
                                         wheel (tree_region_angle)
  characters.min.json                    each class's name and starting attributes
Where the export falls short, the game's own tables, read out of the game's bundles on GGG's patch CDN
(tools/gamepull.py dat(), which runs tools/datpull.mjs --raw; kept in tools/cache/dat-<CDN folder>/, not in git):
  BlightCraftingRecipes    the three emotions of each anointing recipe (BlightCraftingItems) and its result
  BlightCraftingResults    the passive a result anoints (PassiveSkill)
  BlightCraftingItems      each emotion's base item (BaseItemType)
  BaseItemTypes            the emotion's name
  PassiveSkills, Stats     a passive's hash (PassiveSkillGraphId); whether it exists only as an anoint
                           (IsAnointmentOnly); and its stats past the fourth (Stats, Stat5Value..Stat7Value),
                           which the export drops (12 nodes on 0.5.5)
  ClientStrings            ItemDisplayGrantedSkillNoScaling, "Grants Skill: {0}", the line a node that grants
                           a skill shows

The fields of a row (the artifact's layout):
  h, id, n, s   the node's hash, id, name and stats
  t             its lines in the game's wording and order (the description files' order, the way the game
                lists them), [Id|words] markup kept, then "Grants Skill: <name>" when it grants one; left out
                when it has none. Where an entry gives a short "Label@{0}%" form (the game's stat tables) and
                the full sentence, the full sentence. Where GGG's own passive tree export
                (https://github.com/grindinggear/poe2-skilltree-export, tools/treeexport.py official_lines)
                gives the node other lines, GGG's (#133): the tree GGG publish is the game's own wording, and
                RePoE's rendering of the stat files is the check. Only when the export's newest patch is the
                patch the export files are from; a node GGG give no lines keeps these
  k             keystone; ascendancy start; anoint (anoint-only and on the anointing list); jewel socket;
                notable; small
  kw            every keyword id its lines mark, sorted
  a             its ascendancy's name
  io, mco, mc   1 when the node is icon-only, a multiple-choice option, a multiple-choice node
  sp            the passive points it grants
  f             its flavour text, the game's styling (<i>{word}) taken off
  rec           the three emotions that anoint it, in the recipe's order
  at, ats, reg  its attribute colour: ats "granted" when its own stats give attributes (at: which ones);
                else ats "region", reg the class whose part of the wheel it sits in and at that class's
                attributes. Ascendancy nodes sit on no part of the wheel and have none.
The part of the wheel: seen from the middle of the tree (the middle of the box around every node outside
the ascendancies), a node belongs to the class start node it is closest to by angle. Ours, from the game's
node positions: the game files draw the regions as art and name none.

Nothing is carried over from the committed copy. The anoint cost is not in this file: a price, not a game
value. The page adds up the three emotions' live Currency Exchange prices itself (explore.html, tools/sync.py LIVE).
The emotions (Distilled emotions, now "Liquid") are keyed by base item name without spaces, with a slug;
their prices are the page's, live (tools/sync.py unpriced), and rates is empty.

Usage:
  python tools/tree.py              build and print the counts, write nothing
  (tools/sync.py --from-game writes it; tools/dev/explorecmp.py tree holds it up against the committed copy)
"""
import json
import math
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import build as export_build, dat, official, patch as export_patch  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KWREF = re.compile(r'\[([A-Za-z][A-Za-z0-9_-]*)(?:\|[^\]]*)?\]')
MARKUP = re.compile(r'\[([^\]|]+)(?:\|([^\]]+))?\]')   # [Id|words] or [Id]: the words a player reads
STYLE = re.compile(r'<[^<>{}]*>\{([^{}]*)\}')   # the game's text styling, <i>{dekhara}: the words stay
GRANTS = 'Grants Skill: %s'   # ClientStrings ItemDisplayGrantedSkillNoScaling, "Grants Skill: <underline>{{{0}}}"
ATTRS = ('strength', 'dexterity', 'intelligence')
# the stats that give attributes: +N, or N% increased, to one, two or all of them, and "+5 to any Attribute".
# A stat that only reads one (per 10 Strength, equal to Intelligence) gives none.
GIVES = re.compile(r'^(?:base_|additional_)?(strength|dexterity|intelligence|all_attributes)'
                   r'(?:_and_(strength|dexterity|intelligence))?(?:_\+%)?$')
ANY = 'display_passive_attribute_text'   # "+5 to any Attribute"


# ---------------------------------------------------------------- the game's wording

class Wording:
    """Renders a node's stats the way the game does: every description entry that names one of the stats,
    in the description file's order, with the first wording whose conditions the values meet."""

    def __init__(self):
        # the passive file includes the main one and then adds its own entries: a stat it describes again
        # takes the passive file's wording and place
        self.entries = (official('stat_translations/stat_descriptions.min.json') +
                        official('stat_translations/passive_skill_stat_descriptions.min.json'))
        self.by_stat = {}
        for n, e in enumerate(self.entries):
            for sid in e['ids']:
                self.by_stat[sid] = n

    @staticmethod
    def meets(c, v):
        ok = ('min' not in c or v >= c['min']) and ('max' not in c or v <= c['max'])
        return not ok if c.get('negated') else ok

    @staticmethod
    def handle(v, hs):
        for h in hs:
            if h == 'negate':
                v = -v
            elif h == 'negate_and_double':
                v = -v * 2
            elif h == 'double':
                v = v * 2
            elif h == 'times_twenty':
                v = v * 20
            elif h == 'plus_two_hundred':
                v = v + 200
            elif h == 'add_one':
                v = v + 1
            elif h == 'subtract_one':
                v = v - 1
            elif h.startswith('per_minute_to_per_second'):
                v = v / 60
            elif h.startswith('milliseconds_to_seconds'):
                v = v / 1000
            elif h.startswith('deciseconds_to_seconds'):
                v = v / 10
            elif h == 'divide_by_one_hundred_and_negate':
                v = -v / 100
            elif h.startswith('divide_by_twenty_then_double'):
                v = v / 20 * 2
            else:
                m = re.match(r'divide_by_(\w+?)(?:_\d+dp|_\d+dp_if_required)?$', h)
                if m:
                    words = {'two': 2, 'three': 3, 'four': 4, 'five': 5, 'ten': 10, 'fifteen': 15, 'twenty': 20,
                             'fifty': 50, 'one_hundred': 100}
                    if m.group(1) in words:
                        v = v / words[m.group(1)]
        return v

    @staticmethod
    def dp(hs):
        for h in hs:
            m = re.search(r'_(\d)dp', h)
            if m:
                return int(m.group(1)), h.endswith('_if_required')
        return None, True

    def number(self, v, hs):
        places, if_required = self.dp(hs)
        if places is not None and not if_required:
            return '%.*f' % (places, v)
        if isinstance(v, float):
            if abs(v - round(v)) < 1e-9:
                return str(int(round(v)))
            return ('%.*f' % (places if places is not None else 2, v)).rstrip('0').rstrip('.')
        return str(v)

    def lines(self, stats):
        out = []
        for n in sorted({self.by_stat[s] for s in stats if s in self.by_stat}):
            e = self.entries[n]
            vals = [stats.get(sid, 0) for sid in e['ids']]
            fit = [w for w in e['English']
                   if all(self.meets(c, vals[i]) for i, c in enumerate(w['condition']) if i < len(vals))]
            # "Label@{0}%" is the game's short form for its two-column stat tables; the tooltip reads the
            # full sentence the entry gives next ("{0}% increased ... against Enemies that are on Full Life")
            full = [w for w in fit if '@' not in w['string']]
            for w in (full or fit)[:1]:
                s = w['string']
                for i, fm in enumerate(w['format']):
                    if fm == 'ignore':
                        continue
                    hs = w['index_handlers'][i] if i < len(w['index_handlers']) else []
                    v = self.handle(vals[i], hs)
                    txt = self.number(v, hs)
                    if fm == '+#' and v >= 0:
                        txt = '+' + txt
                    s = s.replace('{%d}' % i, txt)
                if '@' in s:   # only the short form fits: its label and value, the way the table shows them
                    s = s.replace('@', ': ')
                if s.strip():
                    out.append(s)
        return out


# ---------------------------------------------------------------- the wheel

def positions(tree):
    """Every node's place on the tree: its group's centre, out along its orbit, clockwise from the top."""
    radii, per = tree['orbit_radii'], tree['skills_per_orbit']
    pos = {}
    for g in tree['groups']:
        for p in g['passives']:
            a = 2 * math.pi * p['position_clockwise'] / per[p['radius']]
            r = radii[p['radius']]
            pos[p['hash']] = (g['x'] + r * math.sin(a), g['y'] - r * math.cos(a))
    return pos


def bearing(x, y, cx, cy):
    """Degrees clockwise from the top of the tree, as seen from (cx, cy)."""
    return math.degrees(math.atan2(x - cx, -(y - cy))) % 360


def regions(tree, pos):
    """The six classic classes, each with its start node and attributes: [(name, [str, dex, int], hash)].
    A class's start node is the root at its ascendancies' tree_region_angle; of the classes sharing that
    part of the wheel, the first in the game's class list (the classic six) names it."""
    classes = official('characters.min.json')
    angle_of = {}
    for asc in official('ascendancies.min.json').values():
        ch = asc.get('character') or []   # [metadata id, class name, ...]
        if ch and 'tree_region_angle' in asc:
            angle_of[ch[0]] = asc['tree_region_angle']
    out, taken = [], set()
    for c in sorted(classes, key=lambda c: c['integer_id']):
        a = angle_of.get(c['metadata_id'])
        if a is None or a in taken:
            continue
        taken.add(a)
        root = min(tree['roots'], key=lambda h: abs((bearing(*pos[h], 0, 0) - a + 180) % 360 - 180))
        b = c['base_stats']
        vals = [b[k] for k in ATTRS]
        out.append((c['name'], [int(v > min(vals)) for v in vals], root))
    return out


def wheel(tree, pos):
    """node hash -> the region (name, attributes) it sits in, for every node outside the ascendancies."""
    P = tree['passives']
    free = [pos[int(h)] for h, p in P.items() if not p.get('ascendancy')]
    cx = (min(x for x, _ in free) + max(x for x, _ in free)) / 2
    cy = (min(y for _, y in free) + max(y for _, y in free)) / 2
    regs = [(name, at, bearing(*pos[root], cx, cy)) for name, at, root in regions(tree, pos)]
    out = {}
    for h, p in P.items():
        if p.get('ascendancy'):
            continue
        b = bearing(*pos[int(h)], cx, cy)
        name, at, _ = min(regs, key=lambda r: abs((b - r[2] + 180) % 360 - 180))
        out[int(h)] = (name, at)
    return out, {name: at for name, at, _ in regs}


def granted(stats):
    """The attributes a node's own stats give, or None."""
    at = [0, 0, 0]
    for sid in stats:
        m = GIVES.match(sid)
        for n in ['all_attributes'] if sid == ANY else [x for x in m.groups() if x] if m else []:
            if n == 'all_attributes':
                at = [1, 1, 1]
            else:
                at[ATTRS.index(n)] = 1
    return at if any(at) else None


# ---------------------------------------------------------------- anointing

def slug(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def anointing():
    """(hash -> [emotion ids], {emotion id: {slug, name}}, anoint-only hashes) from the game's tables."""
    skills = dat('PassiveSkills')
    bases = dat('BaseItemTypes')
    items = dat('BlightCraftingItems')
    results = dat('BlightCraftingResults')
    emotions, ids = {}, []
    for it in items:
        name = bases[it['BaseItemType']]['Name']
        eid = name.replace(' ', '')
        ids.append(eid)
        emotions[eid] = {'slug': slug(name), 'name': name}
    rec = {}
    for r in dat('BlightCraftingRecipes'):
        res = results[r['BlightCraftingResult']]
        if res.get('PassiveSkill') is None:
            continue
        h = skills[res['PassiveSkill']]['PassiveSkillGraphId']
        rec.setdefault(h, [ids[i] for i in r['BlightCraftingItems']])
    only = {s['PassiveSkillGraphId'] for s in skills if s.get('IsAnointmentOnly')}
    return rec, {k: emotions[k] for k in sorted(emotions)}, only


# ---------------------------------------------------------------- the stats the export drops

def dropped_stats():
    """hash -> {stat id: value} for the stats the export leaves off a node. The export carries four stat values
    a node; the game's table carries up to seven (PassiveSkills Stats with Stat1Value..Stat7Value), and a dozen
    nodes use the extra ones (Way of the Mountain's 30 stacks, chaos32's movement speed). Only for a node whose
    export stats are all in the table with the same values, so a later patch never mixes two versions."""
    stats = dat('Stats')
    out = {}
    for s in dat('PassiveSkills'):
        if s.get('SkillType') != 'PASSIVE_TREE':
            continue
        vals = {stats[i]['Id']: s['Stat%dValue' % (n + 1)] for n, i in enumerate(s['Stats'])}
        out[s['PassiveSkillGraphId']] = vals
    return out


def all_stats(p, table):
    have = p['stats']
    full = table.get(p['hash'])
    if not full or len(full) <= len(have) or any(full.get(k) != v for k, v in have.items()):
        return have
    return {**have, **{k: v for k, v in full.items() if k not in have}}


# ---------------------------------------------------------------- build

def kind(p, anoint_only, rec):
    if p['is_ascendancy_starting_node']:
        return 'ascendancy start'
    if p['is_keystone']:
        return 'keystone'
    # anoint-only and on the anointing list (Zarokh's Gift, a socket, too); the Sinister sockets the Voices
    # jewel adds are anoint-only as well but no emotion reaches them: they stay jewel sockets
    if p['hash'] in anoint_only and p['hash'] in rec:
        return 'anoint'
    if p['is_jewel_socket']:
        return 'jewel socket'
    if p['is_notable']:
        return 'notable'
    return 'small'


def ggg_lines(rows, patch_now):
    """GGG's wording on every node where it differs from the rendered lines (#133), in place. Returns (the export's
    patch, how many nodes took GGG's lines), or (its patch, None) when it is another patch than the export files
    and nothing was taken."""
    import treeexport
    got, lines = treeexport.official_lines()
    if got != patch_now:
        print('  GGG\'s tree export is patch %s and the game files %s: the rendered lines stay' % (got, patch_now),
              file=sys.stderr)
        return got, None
    def plain(xs):     # what a player reads: the same words in another order, or other markup, is no difference
        return sorted(' '.join(MARKUP.sub(lambda m: m.group(2) or m.group(1), x).split()) for x in xs)
    taken = 0
    for r in rows:
        theirs = lines.get(r['h'])
        if not theirs or plain(theirs) == plain(r.get('t') or []):
            continue
        r['t'] = theirs
        kw = sorted({m for x in theirs for m in KWREF.findall(x)})
        if kw:
            r['kw'] = kw
        else:
            r.pop('kw', None)
        taken += 1
    print('  passives: GGG\'s own lines on %d nodes (their %s tree export)' % (taken, got))
    return got, taken


def build(old=None):
    tree = official('passive_skill_trees/Default.min.json')
    asc = {k: v['name'] for k, v in official('ascendancies.min.json').items()}
    words = Wording()
    pos = positions(tree)
    where, region_at = wheel(tree, pos)
    rec, emotions, anoint_only = anointing()
    table = dropped_stats()
    gems = official('skill_gems.min.json')
    rows = []
    for h in sorted(tree['passives'], key=int):
        p = tree['passives'][h]
        stats = all_stats(p, table)
        r = {'h': p['hash'], 'id': p['id'], 'n': p['name'], 's': stats}
        t = words.lines(stats)
        if p.get('granted_skill'):
            name = ((gems.get(p['granted_skill']) or {}).get('base_item') or {}).get('display_name')
            if name:
                t.append(GRANTS % name)
        if t:
            r['t'] = t
        r['k'] = kind(p, anoint_only, rec)
        if p.get('ascendancy'):
            r['a'] = asc.get(p['ascendancy'], p['ascendancy'])
        if p.get('flavour_text'):
            r['f'] = STYLE.sub(lambda m: m.group(1), p['flavour_text'])
        kw = sorted({m for x in t for m in KWREF.findall(x)})
        if kw:
            r['kw'] = kw
        if p['hash'] in rec:
            r['rec'] = rec[p['hash']]
        g = granted(stats)
        if g:
            r['at'], r['ats'] = g, 'granted'
        elif p['hash'] in where:
            r['at'], r['ats'], r['reg'] = where[p['hash']][1], 'region', where[p['hash']][0]
        if p['is_icon_only']:
            r['io'] = 1
        if p['is_multiple_choice_option']:
            r['mco'] = 1
        if p['skill_points']:
            r['sp'] = p['skill_points']
        if p['is_multiple_choice']:
            r['mc'] = 1
        rows.append(r)
    b = export_build(refresh=False) or export_build()
    ggg, taken = ggg_lines(rows, export_patch(b))
    src = 'RePoE %s Default tree' % b + (", lines from GGG's %s tree export where they differ" % ggg if taken is not None else '')
    return {'meta': {'src': src, 'n': len(rows)}, 'passives': rows,
            'emotions': emotions, 'rates': {}, 'regions': region_at}


def main():
    out = build()
    kinds = {}
    for p in out['passives']:
        kinds[p['k']] = kinds.get(p['k'], 0) + 1
    print('passive tree from the game files (%s): %d nodes (%s), %d anointable, %d emotions'
          % (out['meta']['src'], len(out['passives']), ', '.join('%d %s' % (n, k) for k, n in sorted(kinds.items())),
             sum(1 for p in out['passives'] if 'rec' in p), len(out['emotions'])))


if __name__ == '__main__':
    main()
