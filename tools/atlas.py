"""Build data/atlas.json: everything the Atlas tab shows (waystones, tablets, keys, atlas items, atlas tree).

Run once per game patch:   python tools/atlas.py            (add --cache DIR to keep the downloads)

Sources, all official game data:
  RePoE export of the game files (https://repoe-fork.github.io/poe2/): base items, mods, the stat wording
    files, the Atlas passive tree, and the item art (RePoE serves the game's art as .webp).
  The official trade site's data lists (/api/trade2/data/static and /items): which items trade, their
    currency-exchange ids and the official icon of every exchange item.
  poe2db.tw's copy of the Atlas tree (datamined from the same game files): only for the options of the
    44 choice nodes, which RePoE does not export. If poe2db cannot be reached, the options already in
    data/atlas.json are kept.
  poe.ninja: only the icon of each unique tablet (an official web.poecdn.com image; RePoE has no unique
    tablet art). Prices are not stored here: the page reads them live from data/market.json.

Where the 0.5.5 patch notes and the game data disagree, the patch notes win (see PATCH_NOTES).

Output (compact, only what the page shows; every string is the game's own wording, markup removed):
  ways   waystone tiers: n name, t tier, al area level, x exchange id, ic icon
  wmods  waystone mods by group: a affix, k p/s (prefix/suffix), r [{w [from, to] tiers or null, ls lines, b bonus}]
  wdes   desecrated waystone mods (Preserved Vertebrae): a, k, ls, b
  wemo   Liquid Emotions instilled into a waystone: n emotion, ls
  tabs   tablet bases: n, ic, ls implicit lines, mods [index into tmods]
  tuniq  unique tablets: n, b base, ic, ls (implicit first), ni implicit count, note
  tmods  tablet mods: a, k, ls, on (bases it rolls on; omitted = every tablet)
  keys, items   n, s sub line, kind, ls effect lines, t directions, x exchange id or null, ic, note
  tree   [{n subtree, nodes: [{n, ty c/n/s (choice/notable/small), ls, o options, x count}]}]
"""
import argparse
import collections
import gzip
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'atlas.json'
REPOE = 'https://repoe-fork.github.io/poe2/'
TRADE = 'https://www.pathofexile.com/api/trade2/data/'
CDN = 'https://web.poecdn.com'
NINJA = 'https://poe.ninja/poe2/api/economy/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
CACHE = None

# ---------------------------------------------------------------- hand-kept facts
# Waystone area level is tier + 64 (65 to 80). RePoE has only the drop level; poe2db shows the area level.
AREA_LEVEL_OFFSET = 64

# 0.5.5 patch notes vs the game data. The notes win.
#   "The Pandora's Box Atlas Passive Skill now provides Possessed Strongboxes have 15% increased Item Rarity"
#   Both the RePoE and poe2db tree exports still say 10%.
PATCH_NOTES = {"Pandora's Box": [('10% increased Item Rarity', '15% increased Item Rarity')]}

# Unique tablets: RePoE's uniques file has no tablets, so each unique's mods are listed here by game mod id.
UNIQUE_TABLET_MODS = {
    'Wraeclast Besieged': ['UniqueBreachHiveAdditionalWaves', 'UniqueTowerBreachDensityIncrease', 'UniqueBreachMinimumRadius', 'UniqueBreachUnstableAdditionalRares'],
    'Clear Skies': ['UniqueDeliriumEndlessFog', 'UniqueDeliriumDifficultyIncrease'],
    'Freedom of Faith': ['UniqueRitualTributeCostIncrease', 'UniqueRitualUnlimitedRerolls'],
    'The Grand Project': ['UniqueMapsAccessedWithoutConnection'],
    'Visions of Paradise': ['UniqueMapsAddIrridiationWhenCompleting'],
    'Mastered Domain': [],   # one of six biome mods (UniqueBiomeTablet*), shown as one line
    'Season of the Hunt': ['UniqueMapBossPossession'],
    'Cruel Hegemony': ['UniqueMapBossAdditionalModifier'],
    'Unforeseen Consequences': ['UniqueMapAbyssOverrun'],
    'Forgotten By Time': ['UniqueExpeditionExplosionRemovesLife', 'UniqueExpeditionTwinnedElites'],
}
# Patch 0.5.0: "temporarily disabled from dropping". Still on the trade site.
UNIQUE_NOTES = {'Forgotten By Time': 'No longer drops'}

# Keys & invitations: name, base item id hint, sub line, note.
KEYS = [
    ('Breachstone', 'MapFragments/CurrencyBreachFragment', 'Breach', None),
    ('Breachlord Sac', 'BreachPinnacleKey', 'Breach', None),
    ('Simulacrum', 'CurrencyAfflictionFragment', 'Delirium', None),
    ("Raven's Reflection", 'DeliriumPinnacleKey', 'Delirium', None),
    ('An Audience with the King', 'CurrencyRitualBossFragment', 'Ritual', None),
    ('Head of the King', 'RitualPinnacleKey', 'Ritual', None),
    ('Call of the Shadows', 'RitualPinnacleEffigyPiece', 'Ritual', None),
    ('Sacred Bloom', 'CurrencyWildwoodFragment', 'Ritual', 'Forbidden Rites only'),   # 0.5.5 notes
    ("Kulemak's Invitation", 'AbyssPinnacleKey', 'Abyss', None),
    ('The Triskelion Reforged', 'Currency/Expedition/ExpeditionPinnacleKey', 'Expedition', None),
    ('Idol of Estazunti', 'VaalAtlasKey', 'Vaal', None),
    ('Ancient Crisis Fragment', 'BurningMonolithKey1', 'Arbiter of Ash', None),
    ('Faded Crisis Fragment', 'BurningMonolithKey2', 'Arbiter of Ash', None),
    ('Weathered Crisis Fragment', 'BurningMonolithKey3', 'Arbiter of Ash', None),
    ('Primary Calamity Fragment', 'BurningMonolithKeyUber1', 'Arbiter of Ash', None),
    ('Secondary Calamity Fragment', 'BurningMonolithKeyUber2', 'Arbiter of Ash', None),
    ('Tertiary Calamity Fragment', 'BurningMonolithKeyUber3', 'Arbiter of Ash', None),
    ('Origin Spark', 'MothersoulEmbryo', 'Arbiter of Divinity', None),
    ('Origin Cradle', 'MothersoulEgg', 'Arbiter of Divinity', None),
    ('Origin Core', 'MothersoulCombined', 'Arbiter of Divinity', None),
]
# Reliquary keys. The plain "Zarokh's Reliquary Key" is not on the trade site (not obtainable) and is left out.
RELIQ = ['Twilight Reliquary Key', "Xesht's Reliquary Key", "The Trialmaster's Reliquary Key", 'Ritualistic Reliquary Key',
         "Tangmazu's Reliquary Key", "Olroth's Reliquary Key", "The Arbiter's Reliquary Key",
         "Zarokh's Reliquary Key: Against the Darkness", "Zarokh's Reliquary Key: Sandstorm Visage",
         "Zarokh's Reliquary Key: Blessed Bonds", "Zarokh's Reliquary Key: Sekhema's Resolve",
         "Zarokh's Reliquary Key: Temporalis", 'Azmeri Reliquary Key']
# The keys have no directions in RePoE; this is the game's text (poe2db, Twilight Reliquary Key), the same on every key.
RELIQ_TEXT = 'Open a Reliquary portal by using this item at The Reliquary Vault. Can only be used once.'

# Other atlas items: name, base item id hint, sub line, note.
ITEMS = [
    ('Expedition Logbook', 'Expedition2Logbook', 'Expedition', None),
    ("Medved's Saga", None, 'Expedition', None),
    ("Vorana's Saga", None, 'Expedition', None),
    ("Uhtred's Saga", None, 'Expedition', None),
    ("Olroth's Saga", None, 'Expedition', None),
    ("Aldur's Saga", None, 'Expedition', 'Runes of Aldur only'),   # 0.5.5 notes
    ('Shattered Triskelion', 'Currency/Expedition/ExpeditionPinnacleKeyShard', 'Expedition', None),
    ('Simulacrum Splinter', None, 'Delirium', None),
    ('Breach Splinter', None, 'Breach', None),
    ('Preserved Vertebrae', None, 'Abyss', None),
    ('Omen of Chaotic Rarity', None, 'Waystone omen', None),
    ('Omen of Chaotic Quantity', None, 'Waystone omen', None),
    ('Omen of Chaotic Monsters', None, 'Waystone omen', None),
    ('Omen of Chaotic Effectiveness', None, 'Waystone omen', None),
    ('Omen of Answered Prayers', None, 'Map omen', None),
    ('Omen of Secret Compartments', None, 'Map omen', None),
    ('Omen of the Hunt', None, 'Map omen', None),
    ('Omen of Reinforcements', None, 'Map omen', None),
    ('Ancient Infuser', None, 'Tablet crafting', None),
    ('Cryptic Key', None, 'Strongbox', None),
]
# Liquid Emotions instil a waystone: DistilledEmotionN adds mod InstilledMapDeliriumN
# (checked on poe2db for Diluted Liquid Ire and Liquid Envy).
EMOTIONS = 10

KIND = {'MapFragment': 'Fragment', 'Breachstone': 'Breachstone', 'PinnacleKeyStackable': 'Pinnacle key',
        'VaultKey': 'Reliquary key', 'Omen': 'Omen', 'ExpeditionLogbook': 'Logbook', 'Expedition2Logbooks': 'Logbook'}
SUBTREES = [('Generic', 'Main tree'), ('Breach', 'Breach'), ('Delirium', 'Delirium'), ('Ritual', 'Ritual'),
            ('Expedition', 'Expedition'), ('Abyss', 'Abyss'), ('Incursion', 'Temple')]
TABLET_ORDER = ['Breach Tablet', 'Delirium Tablet', 'Ritual Tablet', 'Expedition Tablet', 'Abyss Tablet',
                'Temple Tablet', 'Irradiated Tablet', 'Overseer Tablet']
REWARD = re.compile(r'(_final_from_map$|^map_map_item_drop_chance|^map_item_drop_rarity|^map_pack_size|'
                    r'^map_number_of_(magic|rare)|^map_item_drop_quantity|^map_number_of_magic_and_rare)')
RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}|\{[^}\s]{0,80}\}|\[[^\]]*\]|<[^>]+>')


# ---------------------------------------------------------------- fetching
def fetch(url, binary=False, headers=None):
    if CACHE:
        f = CACHE / (re.sub(r'[^\w.-]+', '_', url)[-120:] + '_' + hashlib.md5(url.encode()).hexdigest()[:8])
        if f.exists():
            b = f.read_bytes()
            return b if binary else json.loads(b)
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', **(headers or {})})
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
    if CACHE:
        f.write_bytes(b)
    return b if binary else json.loads(b)


def repoe(name):
    return fetch(REPOE + name)


def exists(url):
    try:
        req = urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:
        return False


# ---------------------------------------------------------------- game wording
def plain(t):
    """Game markup [Id|Shown] or [Id] to plain words."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    return re.sub(r'\[([^\]]+)\]', r'\1', t)


GLUE = re.compile(r'(?:\b(?:a|an|the|your|next|of|to|with|and|or|for|in|on|by|per|up)|,)$', re.I)


def sentence(lines):
    """The game wraps long text over several lines: join a mid-sentence break with a space."""
    out = []
    for x in (plain(x).strip() for x in lines):
        if not x:
            continue
        if out and (x[0].islower() or GLUE.search(out[-1])):
            out[-1] += ' ' + x
        else:
            out.append(x)
    return out


class Words:
    """Renders stat ids with (min, max) values into the game's wording, from RePoE stat_translations."""
    FILES = ['tablet', 'endgame_map', 'map', 'atlas', 'atlas_variant', 'stat_descriptions']

    def __init__(self):
        self.index = {}
        for f in self.FILES:
            name = 'stat_translations/' + (f if f == 'stat_descriptions' else f + '_stat_descriptions') + '.min.json'
            idx = {}
            for e in repoe(name):
                for sid in e['ids']:
                    idx.setdefault(sid, e)
            self.index[f] = idx

    def find(self, sid, order):
        for f in order:
            e = self.index[f].get(sid)
            if e:
                return e
        return None

    @staticmethod
    def handle(v, hs):
        for h in hs:
            if h == 'negate':
                v = -v
            elif h.startswith('per_minute_to_per_second'):
                v = v / 60
            elif h.startswith('milliseconds_to_seconds'):
                v = v / 1000
            elif h.startswith('divide_by_one_hundred_and_negate'):
                v = -v / 100
            elif h.startswith('divide_by_one_hundred'):
                v = v / 100
            elif h.startswith('divide_by_ten'):
                v = v / 10
            elif h == 'double':
                v = v * 2
            elif h == 'negate_and_double':
                v = -v * 2
            elif h == 'times_twenty':
                v = v * 20
            elif h.startswith('divide_by_two'):
                v = v / 2
            elif h == 'divide_by_five':
                v = v / 5
            elif h == 'divide_by_three':
                v = v / 3
            elif h == 'divide_by_four':
                v = v / 4
            elif h == 'divide_by_fifty':
                v = v / 50
            elif h == 'subtract_one':
                v = v - 1
            elif h == 'add_one':
                v = v + 1
            elif h == 'multiply_by_ten':
                v = v * 10
            elif h == 'deciseconds_to_seconds':
                v = v / 10
        return v

    @staticmethod
    def num(v):
        if isinstance(v, float):
            if abs(v - round(v)) < 1e-9:
                return str(int(round(v)))
            return ('%.2f' % v).rstrip('0').rstrip('.')
        return str(v)

    @staticmethod
    def ok(cond, v):
        if 'min' in cond and v < cond['min']:
            return False
        if 'max' in cond and v > cond['max']:
            return False
        if cond.get('negated'):
            return not Words.ok({k: x for k, x in cond.items() if k != 'negated'}, v)
        return True

    def render(self, stats, order):
        """stats: [(id, min, max)]. Returns (lines, ids with no wording)."""
        vals = {sid: (mn, mx) for sid, mn, mx in stats}
        done, lines, missing = set(), [], []
        for sid, mn, mx in stats:
            if sid in done:
                continue
            if sid.startswith('dummy_stat_display_nothing'):
                done.add(sid)
                continue
            e = self.find(sid, order)
            if not e:
                missing.append(sid)
                done.add(sid)
                continue
            ids = e['ids']
            done.update(ids)
            rng = [vals.get(i) for i in ids]
            # a range across zero reads as two wordings in game (increased / reduced): the second starts with "or"
            if len(ids) == 1 and rng[0] and rng[0][0] < 0 < rng[0][1]:
                pos, _ = self.render([(sid, 1, rng[0][1])], order)
                neg, _ = self.render([(sid, rng[0][0], -1)], order)
                lines += pos + ['or ' + x for x in neg]
                continue
            chosen = None
            for l in e['English']:
                good = True
                for i, c in enumerate(l['condition']):
                    r = rng[i] if i < len(rng) else None
                    if r is None:
                        good = good and self.ok(c, 0)
                    else:
                        good = good and self.ok(c, r[0]) and self.ok(c, r[1])
                if good:
                    chosen = l
                    break
            if chosen is None:
                for l in e['English']:
                    if all(self.ok(c, (rng[i] or (0, 0))[1]) for i, c in enumerate(l['condition'])):
                        chosen = l
                        break
            if chosen is None:
                missing.append(sid)
                continue
            s = chosen['string']
            for i, fm in enumerate(chosen['format']):
                if fm == 'ignore':
                    continue
                r = rng[i] if i < len(rng) and rng[i] is not None else (0, 0)
                hs = chosen['index_handlers'][i] if i < len(chosen['index_handlers']) else []
                a, b = sorted((self.handle(r[0], hs), self.handle(r[1], hs)))
                if a == b:
                    txt = self.num(a)
                elif a < 0 and b < 0:
                    txt = '-(%s-%s)' % (self.num(-b), self.num(-a))
                else:
                    txt = '(%s-%s)' % (self.num(a), self.num(b))
                if fm == '+#' and a >= 0:
                    txt = '+' + txt
                s = s.replace('{%d}' % i, txt)
            s = s.replace('{0}', '')
            for x in (x.strip() for x in plain(s).split('\n')):
                if x and x[0].islower() and lines:   # the game wraps a long line: keep it one line
                    lines[-1] += ' ' + x
                elif x:
                    lines.append(x)
        return lines, missing


# ---------------------------------------------------------------- build
def main():
    global CACHE
    ap = argparse.ArgumentParser()
    ap.add_argument('--cache', help='folder to keep the downloads in (for repeated runs)')
    ap.add_argument('--no-check', action='store_true', help='skip checking that every icon loads')
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
    W = Words()
    tree = repoe('passive_skill_trees/Atlas.min.json')
    static = fetch(TRADE + 'static')['result']
    time.sleep(1)
    titems = fetch(TRADE + 'items')['result']
    MAPW = ['endgame_map', 'map', 'stat_descriptions', 'atlas', 'tablet']
    TABW = ['tablet', 'endgame_map', 'map', 'stat_descriptions', 'atlas']
    unresolved = []

    # trade site lists
    exch, icon_of = {}, {}
    for cat in static:
        for e in cat['entries']:
            if e.get('id') and e['id'] != 'sep' and e.get('text'):
                exch[e['text']] = e['id']
                if e.get('image'):
                    icon_of[e['text']] = CDN + e['image'] if e['image'].startswith('/') else e['image']
    tradeable = set()
    for cat in titems:
        for e in cat['entries']:
            tradeable.add(e.get('name') if (e.get('flags') or {}).get('unique') else e['type'])

    def base(name, hint=None):
        c = [(k, v) for k, v in BASE.items() if v['name'] == name and v['item_class'] != 'QuestItem']
        if hint:
            c = [kv for kv in c if hint in kv[0]] or c
        if not c:
            sys.exit('no base item named ' + name)
        return c[0]

    def art(v):
        dds = (v.get('visual_identity') or {}).get('dds_file')
        return REPOE + dds[:-4] + '.webp' if dds else None

    def icon(name, v):
        return icon_of.get(name) or art(v)

    def mod_lines(mid, order, split=False):
        m = MODS[mid]
        st = [(s['id'], s['min'], s['max']) for s in m['stats'] if not (s['min'] == 0 and s['max'] == 0)]
        if not split:
            ls, miss = W.render(st, order)
            unresolved.extend((mid, x) for x in miss)
            return ls
        eff, miss1 = W.render([s for s in st if not REWARD.search(s[0])], order)
        bon, miss2 = W.render([s for s in st if REWARD.search(s[0])], order)
        unresolved.extend((mid, x) for x in miss1 + miss2)
        return eff, bon

    def weight(m, tags):
        for sw in m['spawn_weights']:
            if sw['tag'] in tags:
                return sw['weight']
        return 0

    # ============================================================ waystones
    ways, tier_tags = [], {}
    for k, v in BASE.items():
        if v['item_class'] == 'Map' and v['release_state'] == 'released':
            t = int(re.search(r'Tier(\d+)', k).group(1))
            tier_tags[t] = v['tags']
            ways.append({'n': v['name'], 't': t, 'al': t + AREA_LEVEL_OFFSET, 'x': exch.get(v['name']), 'ic': icon(v['name'], v)})
    ways.sort(key=lambda w: w['t'])

    def runs(ts):
        """[1,2,3,4,5] -> [1, 5]; the tiers of one mod tier are always one run."""
        return [ts[0], ts[-1]] if ts else None

    groups = collections.OrderedDict()
    for mid, m in MODS.items():
        if m['domain'] != 'area' or m['generation_type'] not in ('prefix', 'suffix'):
            continue
        if all(s['id'].startswith('dummy_stat_display_nothing') for s in m['stats']):
            continue
        eff, bon = mod_lines(mid, MAPW, split=True)
        if not eff:
            continue
        ts = [t for t in sorted(tier_tags) if weight(m, tier_tags[t]) > 0]
        key = ((m['groups'] or [mid])[0], m['name'], m['generation_type'])
        g = groups.setdefault(key, {'a': m['name'] or '', 'k': m['generation_type'][0], 'r': []})
        g['r'].append({'w': runs(ts), 'ls': eff, 'b': bon})
    wmods = []
    for g in groups.values():
        rows = []
        for r in g['r']:   # several game mods can read the same
            if r not in rows:
                rows.append(r)
        g['r'] = sorted(rows, key=lambda r: (r['w'] is None, (r['w'] or [99])[0]))
        wmods.append(g)
    wmods.sort(key=lambda g: (g['k'] != 'p', all(r['w'] is None for r in g['r']), g['a']))

    wdes = []
    for mid, m in MODS.items():
        if m['domain'] == 'desecrated' and any(s['tag'] == 'map' and s['weight'] > 0 for s in m['spawn_weights']):
            eff, bon = mod_lines(mid, MAPW, split=True)
            if eff:
                wdes.append({'a': m['name'] or '', 'k': m['generation_type'][0], 'ls': eff, 'b': bon})
    wemo = []
    for i in range(1, EMOTIONS + 1):
        wemo.append({'n': BASE['Metadata/Items/Currency/DistilledEmotion%d' % i]['name'],
                     'ls': mod_lines('InstilledMapDelirium%d' % i, MAPW)})

    # ============================================================ tablets
    tabs, tab_tags = [], {}
    for k, v in BASE.items():
        if v['item_class'] != 'TowerAugmentation':
            continue
        impl = []
        for iid in v['implicits']:
            impl += mod_lines(iid, TABW)
        tab_tags[v['name']] = v['tags']
        tabs.append({'n': v['name'], 'ic': art(v), 'ls': impl, 'k': k})
    tabs.sort(key=lambda t: TABLET_ORDER.index(t['n']) if t['n'] in TABLET_ORDER else 99)
    tmods = []
    for mid, m in MODS.items():
        if m['domain'] != 'tablet' or m['generation_type'] not in ('prefix', 'suffix'):
            continue
        on = [t['n'] for t in tabs if weight(m, tab_tags[t['n']]) > 0]
        if not on:
            continue   # cannot roll (no spawn weight on any tablet)
        e = {'a': m['name'] or '', 'k': m['generation_type'][0], 'ls': mod_lines(mid, TABW)}
        if len(on) < len(tabs):
            e['on'] = on
        tmods.append(e)
    for t in tabs:
        t['mods'] = [i for i, e in enumerate(tmods) if t['n'] in e.get('on', [t['n']])]
        del t['k']

    # unique tablets: the trade site's unique list; icons from poe.ninja's listings (official image URLs)
    league = None
    try:
        league = json.loads((ROOT / 'data' / 'market.json').read_text(encoding='utf-8')).get('league')
    except Exception:
        pass
    ninja_ic = {}
    if league:
        try:
            d = fetch(NINJA + 'stash/current/item/overview?' + urllib.parse.urlencode({'league': league, 'type': 'UniqueTablets'}))
            ninja_ic = {l['name']: l['icon'] for l in d.get('lines', []) if l.get('icon')}
        except Exception as e:
            print('  poe.ninja icons not loaded:', e, file=sys.stderr)
    biomes = sorted((k for k in MODS if k.startswith('UniqueBiomeTablet')), key=lambda k: MODS[k]['stats'][0]['id'])
    biome_words = [re.sub(r'^Map also counts as an? (.*) Map$', r'\1', mod_lines(k, TABW)[0]) for k in biomes]
    tuniq = []
    for cat in titems:
        for e in cat['entries']:
            if not ((e.get('flags') or {}).get('unique') and 'Tablet' in e['type']):
                continue
            nm, bt = e['name'], e['type']
            bk, bv = base(bt, 'TowerAugment')
            uimp = bv['implicits'][0] + 'Unique'
            impl = mod_lines(uimp, TABW) if uimp in MODS else []
            expl = []
            for mid in UNIQUE_TABLET_MODS.get(nm, []):
                expl += mod_lines(mid, TABW)
            if nm == 'Mastered Domain':
                expl = ['Map also counts as a ' + ', '.join(biome_words[:-1]) + ' or ' + biome_words[-1] + ' Map']
            if not expl:
                print('  no mods for unique tablet', nm, file=sys.stderr)
            u = {'n': nm, 'b': bt, 'ic': ninja_ic.get(nm) or art(bv), 'ls': impl + expl, 'ni': len(impl)}
            if nm in UNIQUE_NOTES:
                u['note'] = UNIQUE_NOTES[nm]
            tuniq.append(u)
    tuniq.sort(key=lambda u: (TABLET_ORDER.index(u['b']) if u['b'] in TABLET_ORDER else 99, u['n']))

    # ============================================================ keys and atlas items
    def item(nm, hint, sub, note, directions=None, effect=None):
        k, v = base(nm, hint)
        p = v.get('properties') or {}
        eff = effect if effect is not None else sentence((p.get('description') or '').split('\n'))
        eff += [x for iid in v.get('implicits') or [] for x in mod_lines(iid, MAPW)]
        d = directions or ' '.join(sentence((p.get('directions') or '').split('\n')))
        # drop the "right click this item ..." how-to when the effect already says what it does,
        # unless it carries a condition (a number, like Simulacrum's 100% Deliriousness)
        if eff and d.startswith('Right click this item') and not re.search(r'\d', d):
            d = ''
        kind = 'Saga' if nm.endswith('Saga') else KIND.get(v['item_class'], 'Currency')
        e = {'n': nm, 's': sub, 'kind': kind, 'ls': eff, 't': d,
             'x': exch.get(nm), 'ic': icon(nm, v)}
        if note:
            e['note'] = note
        if nm not in tradeable and nm not in exch:
            print('  not on the trade site:', nm, file=sys.stderr)
        return {x: y for x, y in e.items() if y not in ('', [], None) or x == 'x'}

    keys = [item(n, h, s, note) for n, h, s, note in KEYS]
    keys += [item(n, 'VaultKey', 'Reliquary', None, directions=RELIQ_TEXT) for n in RELIQ]
    items = [item(n, h, s, note) for n, h, s, note in ITEMS]
    for i, emo in enumerate(wemo, 1):   # a Liquid Emotion on the Atlas: its waystone effect, not its jewel use
        e = item(emo['n'], 'DistilledEmotion%d' % i, 'Liquid Emotion', None, effect=list(emo['ls']))
        e.pop('t', None)
        e['kind'] = 'Liquid Emotion'
        items.append(e)

    # ============================================================ atlas tree
    P = tree['passives']
    adj = collections.defaultdict(set)
    for g in tree['groups']:
        for q in g['passives']:
            for c in q['connections']:
                adj[str(q['hash'])].add(str(c))
                adj[str(c)].add(str(q['hash']))
    roots = [str(r) for r in tree['roots']]
    sub_of = {}
    for r in roots:
        seen, todo = {r}, [r]
        while todo:
            x = todo.pop()
            for y in adj[x] - seen:
                seen.add(y)
                todo.append(y)
        for h in seen:
            sub_of.setdefault(h, (P[r].get('atlas_subtree') or {}).get('id') or 'Generic')

    options = {}
    try:
        p2 = fetch('https://poe2db.tw/data/atlas-skill-tree/%s/data_us.json' % '.'.join(version.split('.')[:2]))['nodes']
        rawline = re.compile(r'^([a-z][a-z0-9 +%_]*?)(?: \[(-?\d+)\])?$')
        for h, q in p2.items():
            opts = []
            for s in q.get('stats') or []:
                if not s.startswith('\n'):
                    continue
                for ln in s.split('\n'):
                    if not ln.strip():
                        continue
                    m = rawline.match(ln.strip())
                    if m and ' ' in ln.strip():   # a stat id ("map item drop rarity +% [10]"): word it, or drop it if hidden
                        sid, val = m.group(1).replace(' ', '_'), int(m.group(2) or 1)
                        ws, _ = W.render([(sid, val, val)], ['atlas', 'atlas_variant', 'map', 'endgame_map', 'stat_descriptions'])
                        opts += ws
                        continue
                    if (ln.startswith(' ') or ln[0].islower()) and opts:   # the game wrapped a long option
                        opts[-1] += ' ' + plain(ln).strip()
                    else:
                        opts.append(plain(ln).strip())
            if opts:
                options[h] = opts
        print('choice options from poe2db:', len(options), 'nodes')
    except Exception as e:
        print('  poe2db tree not loaded (%s); keeping the options in data/atlas.json' % e, file=sys.stderr)
        try:
            old = json.loads(OUT.read_text(encoding='utf-8'))
            for g in old.get('tree', []):
                for n in g['nodes']:
                    if n.get('o'):
                        options['name:' + n['n']] = n['o']
        except Exception:
            pass

    by_sub = collections.OrderedDict((s, collections.OrderedDict()) for s, _ in SUBTREES)
    total = 0
    for h, p in P.items():
        if h not in sub_of or h in roots:
            continue   # start nodes and unreachable decorative nodes
        total += 1
        ty = 'c' if p['is_keystone'] else 'n' if p['is_notable'] else 's'
        ls = [x for s in p['stat_text'] for x in plain(s).split('\n') if x.strip()]
        for old, new in PATCH_NOTES.get(p['name'], []):
            ls = [x.replace(old, new) for x in ls]
        node = {'n': p['name'], 'ty': ty, 'ls': ls}
        o = options.get(h) or options.get('name:' + p['name'])
        if o and ty == 'c':
            node['o'] = o
        key = (p['name'], ty, tuple(ls), tuple(node.get('o', [])))
        sub = (p.get('atlas_subtree') or {}).get('id') or sub_of[h]
        bucket = by_sub.setdefault(sub, collections.OrderedDict())
        if key in bucket:
            bucket[key]['x'] = bucket[key].get('x', 1) + 1
        else:
            bucket[key] = node
    names = dict(SUBTREES)
    tree_out = []
    for sub, nodes in by_sub.items():
        ns = sorted(nodes.values(), key=lambda n: ('cns'.index(n['ty']), n['n']))
        tree_out.append({'n': names.get(sub, sub), 'nodes': ns})

    out = {'patch': patch, 'ways': ways, 'wmods': wmods, 'wdes': wdes, 'wemo': wemo,
           'tabs': tabs, 'tuniq': tuniq, 'tmods': tmods, 'keys': keys, 'items': items, 'tree': tree_out}

    # ============================================================ checks
    bad = []

    def scan(x, path):
        if isinstance(x, dict):
            for k, v in x.items():
                if k not in ('ic', 'x'):
                    scan(v, path + '.' + k)
        elif isinstance(x, list):
            for i, v in enumerate(x):
                scan(v, path + '[%d]' % i)
        elif isinstance(x, str) and RAW.search(x):
            bad.append((path, x))
    scan(out, '')
    if bad:
        for b in bad[:20]:
            print('  raw game code:', b, file=sys.stderr)
        sys.exit('raw game code in the output; fix the wording before publishing')
    if unresolved:
        print('  stats with no wording (hidden in game, left out):', len(set(unresolved)))
    if not args.no_check:
        missing = []
        for x in ways + tabs + tuniq + keys + items:
            if not x.get('ic') or (x['ic'].startswith(REPOE) and not exists(x['ic'])):
                missing.append(x['n'])
        if missing:
            print('  icons missing:', missing, file=sys.stderr)

    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('waystones', len(ways), 'mod groups', len(wmods), 'desecrated', len(wdes), 'emotions', len(wemo))
    print('tablets', len(tabs), 'unique tablets', len(tuniq), 'tablet mods', len(tmods))
    print('keys', len(keys), 'atlas items', len(items))
    print('tree nodes', total, {g['n']: sum(n.get('x', 1) for n in g['nodes']) for g in tree_out})
    print('->', OUT.relative_to(ROOT), OUT.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()
