"""More cards for the search index (data/index.json). tools/sync.py calls build() from build_index, so every sync
keeps them. Three kinds, on top of the gems, uniques, passives and keywords of the artifact:

  b  base items: every weapon, armour piece, shield, buckler, focus, quiver, ring, amulet, belt, jewel, flask,
     charm, relic and wombgift in the game today. Name, "<item class> · drops from level N", requirements,
     implicit lines ("ls"), properties in plain words ("pr"), keyword ids ("kw") and "cr", the Craft tab's kind
     (only for bases the Craft tab has, so its link opens on that exact base).
  a  the Atlas: atlas passives (every node of the Atlas tree and its subtrees, with the options of choice nodes),
     waystone tiers, tablets, the unique tablet the artifact lacks, and the keys and atlas items the currency
     catalogue does not list. "at" is the Atlas tab section the card opens.
  c  currency and other bulk items the catalogue (data/market.json) does not list, with their official text.
     Never a price: prices come only from real trade data, and the catalogue is where they attach.

Sources, all official game data:
  RePoE's export of the game files (https://repoe-fork.github.io/poe2/): base_items (bases, requirements, properties,
    implicits, granted skills, art), mods (implicit wording), augments (rune, soul core and idol types) and the
    Atlas passive tree (node icons).
  The official trade site's lists (data/trade.json, tools/tradedata.py): which bases and bulk items exist in the game
    today (RePoE marks hundreds of unused and old items "released": test weapons, trap tools, Heist and Bestiary items).
  data/atlas.json (tools/atlas.py), data/info.json (tools/gameinfo.py), data/craft.json (tools/craft.py).
Hand-kept (the game files have it, RePoE does not export it):
  SPIRIT    sceptres grant 100 Spirit. Checked on poe2db on all five sceptres (0.5.5).
  NO_LEVEL  a base with no requirements in the export requires its drop level (poe2db shows "Requires: Level N" =
            DropLevel on rings, amulets, belts, quivers, flasks, charms and the Kalguuran Forgehammer), except these
            kinds: relics have no level requirement, jewels and wombgifts show none.
Not in the export, so not shown: Runic Ward on runeforged bases, belt charm slots, a base's sockets, charm effects.
"""
import json
import re
import sys
import urllib.parse
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from craft import CLASSES, base_props  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SPIRIT = {'Sceptre': 100}
NO_LEVEL = {'Relic', 'Jewel', 'BrequelFruit'}
# game item class -> the trade site's category (its name is the one shown); the Craft tab's own list, and two more
TRADE_CAT = {c: cat for c, _, cat in CLASSES}
TRADE_CAT.update({'Relic': 'sanctum.relic', 'BrequelFruit': None})
CLASS_NAME = {'Jewel': 'Jewel', 'BrequelFruit': 'Wombgift'}
IN_GAME = ('Accessories', 'Armour', 'Weapons', 'Jewels', 'Flasks', 'Sanctum', 'Wombgift')   # trade.json base groups
# properties that clearly name a keyword (the implicit lines carry their own markup)
PROP_KW = [('armour', 'Armour'), ('evasion', 'Evasion'), ('energy_shield', 'EnergyShield'), ('block', 'Block'),
           ('physical_damage_max', 'Physical'), ('critical_strike_chance', 'Critical'), ('attack_time', 'Attack')]
CLASS_KW = {'Sceptre': ['Spirit'], 'LifeFlask': ['Flask'], 'ManaFlask': ['Flask'], 'UtilityFlask': ['Charm']}
AUG_KIND = {'Rune': 'Runes', 'Soul Core': 'Soul Cores', 'Idol': 'Idols', 'Abyssal Eye': 'Abyssal Eyes'}
CUR_KIND = {'Omen': 'Omens', 'MapFragment': 'Fragments', 'PinnacleKeyStackable': 'Fragments', 'Breachstone': 'Fragments',
            'UncutSkillGemStackable': 'Uncut Gems', 'UncutReservationGemStackable': 'Uncut Gems',
            'UncutSupportGemStackable': 'Uncut Gems', 'DelveStackableSocketableCurrency': 'Resonators',
            'IncubatorStackable': 'Incubators', 'VaultKey': 'Keys'}
TREE_ICON = re.compile(r'^Art/2DArt/SkillIcons/', re.I)


def build(items, H):
    """The new cards. items: the cards so far (their names are taken). H: sync.py's helpers {remote, plain, plain_lines,
    refs, game_art, kw, REPOE, IMGS}. Each card may carry "_try": image codes, best first (sync.py checks them)."""
    data = lambda f: json.loads((ROOT / 'data' / f).read_text(encoding='utf-8')) if (ROOT / 'data' / f).exists() else {}
    market = (data('market.json').get('items') or {})
    trade = data('trade.json')
    # a name that already has a card keeps it (gems, uniques, the currency catalogue): no second card for it
    taken = {it['n'] for it in items if it['k'] not in ('p', 'w')} | {m['n'] for k, m in market.items() if k.startswith('c:') and m.get('n')}
    out, counts = [], {}
    for kind, make in (('b', bases), ('a', atlas), ('c', currency)):
        made = make(H, data, market, trade, taken)
        for it in made:
            taken.add(it['n'])
        counts[kind] = len(made)
        out += made
    print('more cards:', counts)
    return out


# ---------------------------------------------------------------- base items
def bases(H, data, market, trade, taken):
    remote, plain, refs, REPOE = H['remote'], H['plain'], H['refs'], H['REPOE']
    BASE = remote('repoe-base_items.json', REPOE + 'base_items.min.json') or {}
    MODS = remote('repoe-mods.json', REPOE + 'mods.min.json') or {}
    if not BASE or not MODS:
        print('  base items not built: RePoE lists missing', file=sys.stderr)
        return []
    in_game = {x for g in IN_GAME for x in (trade.get('bases') or {}).get(g, [])}
    cat_name = dict((trade.get('options') or {}).get('category') or [])
    craft = data('craft.json')
    craft_of = {b[0]: c['id'] for c in craft.get('classes') or [] for b in c['b']}
    gem_name = {p: v['name'] for p, v in BASE.items() if 'Gem' in (v.get('item_class') or '')}

    by_name = defaultdict(list)
    for path, v in BASE.items():
        if (v.get('release_state') == 'released' and v.get('item_class') in TRADE_CAT and v['name'] in in_game
                and not v['name'].startswith('[')):
            by_name[v['name']].append((path, v))

    def version(v):
        """A variant as the game shows it: implicit lines (with markup), property lines, granted skills, requirements."""
        imp = [x for i in v.get('implicits') or [] for x in (MODS.get(i) or {}).get('text', '').replace('\r', '').split('\n') if x.strip()]
        pr = base_props(v)
        if SPIRIT.get(v['item_class']):
            pr.append('Spirit: %d' % SPIRIT[v['item_class']])
        sk = ['Grants Skill: ' + gem_name[s] for s in v.get('skills_granted') or [] if gem_name.get(s)]
        r = v.get('requirements') or {}
        rq = [r.get('level', 0), r.get('strength', 0), r.get('dexterity', 0), r.get('intelligence', 0)]
        if not r and v['item_class'] not in NO_LEVEL and v.get('drop_level', 1) > 1:
            rq[0] = v['drop_level']   # no requirements in the export: the game asks for the drop level
        return imp, pr, sk, rq if any(rq) else None

    out = []
    for name, vs in sorted(by_name.items()):
        # the plain base first (not a unique's own copy), then the lowest drop level
        plain_vs = [x for x in vs if 'Unique' not in x[0]]
        vs = sorted(plain_vs or vs, key=lambda x: (x[1]['drop_level'], x[0]))
        path, v = vs[0]
        imp, pr, sk, rq = version(v)
        # true alternates (same stats, another implicit or granted skill: Two-Stone Ring, Shrine Sceptre): "or" the rest
        alts, skills = [], [sk]
        for p2, v2 in vs[1:]:
            i2, pr2, sk2, rq2 = version(v2)
            if (pr2, rq2, v2['drop_level']) != (pr, rq, v['drop_level']):
                continue
            if i2 != imp and i2 not in alts:
                alts.append(i2)
            if sk2 != sk and sk2 not in skills:
                skills.append(sk2)
        if alts and not plain_vs:   # only uniques' own copies (Runemastered): just the lines they all share
            imp = [x for x in imp if all(x in i2 for i2 in alts)]
            alts = []
        raw = list(imp)
        ls = [plain(x) for x in imp]
        for i2 in alts:
            raw += i2
            more = [plain(x) for x in i2]
            if more:
                ls += (['or ' + more[0]] + more[1:]) if ls else more
        pr = pr + sk + [('or ' if j == 0 and sk else '') + x for s2 in skills[1:] for j, x in enumerate(s2)]
        cls = v['item_class']
        cname = CLASS_NAME.get(cls) or cat_name.get(TRADE_CAT.get(cls) or '', cls)
        it = {'k': 'b', 'id': name, 'n': name, 's': '%s · drops from level %d' % (cname, v.get('drop_level') or 1)}
        if rq:
            it['rq'] = rq
        if ls:
            it['ls'] = ls
        if pr:
            it['pr'] = pr
        props = v.get('properties') or {}
        kw = set(refs(raw)) | {k for p, k in PROP_KW if props.get(p)} | set(CLASS_KW.get(cls, []))
        kw = sorted(k for k in kw if k in H['kw'])
        if kw:
            it['kw'] = kw
        if craft_of.get(name):
            it['cr'] = craft_of[name]
        it['_try'] = [H['game_art']((v.get('visual_identity') or {}).get('dds_file'))]
        out.append(it)
    return out


# ---------------------------------------------------------------- the Atlas
def code_of(url, IMGS):
    """A full image link -> the index's short code, if it is on one of the image servers."""
    for k, pre in IMGS.items():
        if url and url.startswith(pre):
            return k + ':' + url[len(pre):]
    return None


def atlas(H, data, market, trade, taken):
    A = data('atlas.json')
    if not A:
        print('  atlas cards not built: data/atlas.json missing (run tools/atlas.py)', file=sys.stderr)
        return []
    IMGS = H['IMGS']
    out = []

    def card(sec, name, sub, ic=None, **f):
        it = {'k': 'a', 'id': name, 'n': name, 's': sub, 'at': sec}
        it.update({k: v for k, v in f.items() if v})
        it['_try'] = [code_of(ic, IMGS)] if ic else []
        out.append(it)
        return it

    for w in A.get('ways') or []:
        if w['n'] in taken:
            continue
        n = sum(1 for g in A.get('wmods') or [] for r in g['r'] if r.get('w') and r['w'][0] <= w['t'] <= r['w'][1])
        card('ways', w['n'], 'Waystone · area level %d' % w['al'], w.get('ic'), t='%d mods can roll at this tier.' % n)
    for t in A.get('tabs') or []:
        if t['n'] not in taken:   # ni: how many lines are implicit (the Trade button needs to know)
            card('tabs', t['n'], 'Tablet · %d mods can roll' % len(t.get('mods') or []), t.get('ic'), ls=t.get('ls'),
                 ni=len(t.get('ls') or []))
    for u in A.get('tuniq') or []:
        if u['n'] not in taken:
            card('tabs', u['n'], 'Unique tablet · ' + u['b'], u.get('ic'), ls=u.get('ls'), ni=u.get('ni'), base=u['b'],
                 nt=u.get('note'))
    for sec in ('keys', 'items'):
        for x in A.get(sec) or []:
            if x['n'] in taken:
                continue
            kind, where = x.get('kind') or '', x.get('s') or ''
            sub = kind if not where or where.lower() in kind.lower() else kind + ' · ' + where
            ls = (x.get('ls') or []) + ([x['t']] if x.get('ls') and x.get('t') else [])
            card(sec, x['n'], sub, x.get('ic'), ls=ls, t=None if x.get('ls') else x.get('t'), nt=x.get('note'))

    # atlas passives: the node's icon from the game's Atlas tree (poe.ninja serves the tree art, as for the passive tree)
    tree = H['remote']('repoe-atlastree.json', H['REPOE'] + 'passive_skill_trees/Atlas.min.json') or {}
    icon_by, icon_one = {}, {}
    for p in (tree.get('passives') or {}).values():
        ic = TREE_ICON.sub('', p.get('icon') or '')
        if not p.get('name') or not ic.lower().endswith('.dds') or ic.startswith('Art/'):
            continue
        code = 'n:' + urllib.parse.quote(ic[:-4].lower()) + '.webp'
        ls = tuple(x for s in p.get('stat_text') or [] for x in H['plain_lines'](s))
        icon_by.setdefault((p['name'], ls), code)
        icon_one.setdefault(p['name'], code)
    used = {it['id'] for it in out}
    for g in A.get('tree') or []:
        for nd in g.get('nodes') or []:
            it = card('tree', nd['n'], 'Atlas passive · ' + g['n'], None, ls=nd.get('ls'), o=nd.get('o'), ty=nd.get('ty'), x=nd.get('x'))
            if it['id'] in used:   # node names are unique today; keep the ids unique if that changes
                it['id'] += ' | ' + g['n']
            used.add(it['id'])
            it['_try'] = [icon_by.get((nd['n'], tuple(nd.get('ls') or []))), icon_one.get(nd['n'])]
    return out


# ---------------------------------------------------------------- currency the catalogue lacks
def currency(H, data, market, trade, taken):
    info = data('info.json')
    if not info:
        return []
    ex = set(trade.get('exchange') or {})
    listed = {x for g in ('Currency', 'Maps') for x in (trade.get('bases') or {}).get(g, [])}
    BASE = H['remote']('repoe-base_items.json', H['REPOE'] + 'base_items.min.json') or {}
    AUG = H['remote']('repoe-augments.json', H['REPOE'] + 'augments.min.json') or {}
    aug_kind = {}
    for path, a in AUG.items():
        b = BASE.get(path)
        if b:
            aug_kind[b['name']] = AUG_KIND.get(H['plain'](a.get('type_name') or ''), 'Augments')
    out = []
    for name in sorted(info):
        x = info[name]
        cls = x.get('cls') or ''
        if name in taken or name.startswith('[') or 'Gem' in cls:   # lineage supports are gem cards
            continue
        # in the game today: on the Currency Exchange, or an omen or augment on the trade site's list
        if not (name in ex or (name in listed and (cls in ('Omen', 'SoulCore')))):
            continue
        t = x.get('t') or ''
        if not t or 'no longer usable' in t:
            continue
        cat = aug_kind.get(name) if cls == 'SoulCore' else 'Essences' if 'Essence' in name else CUR_KIND.get(cls, 'Currency')
        it = {'k': 'c', 'id': name, 'n': name, 's': cat or 'Currency', 't': t}
        if x.get('dl'):
            it['dl'] = x['dl']
        it['_try'] = [H['game_art'](x['a'] + '.dds')] if x.get('a') else []
        out.append(it)
    return out
