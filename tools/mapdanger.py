"""data/mapdanger.json: every map modifier a player can meet, what it does to you, and the search text to avoid it.

#77. A waystone, a tablet or a corrupted atlas node puts modifiers on a map, and nothing in the game says which
of them shuts off part of a build. This file holds each one in the game's own words, its tiers where it has
them, and tags for what it does to the player, in the same words data/monstermods.json tags rare monster
modifiers with (#112), so one filter reads both.

What is in it, all from the game's mod table (RePoE's export of Mods.dat, the official game files), filtered
the way the game rolls them:

  waystone   prefixes and suffixes of the area domain that some waystone tier can roll (a spawn weight on a
             waystone base's tags), the desecrated modifiers a Preserved Vertebrae puts on a waystone (the
             desecrated domain, weighted on "map"), and the ten Liquid Emotions instilled into one
  tablet     precursor tablet prefixes and suffixes that some tablet base can roll, each base's implicit, and
             the modifiers of the unique tablets (tools/atlas.py names them)
  atlas      what a corrupted or a cleansed atlas node puts on its maps: EndgameCorruption*/EndgameCleansed*
             rows of the same table, with the weights data/game/atlas_corruption.json read out of the game's
             own EndgameCorruptionMods table (tools/datpull.mjs). A weight of 0 cannot roll and is left out

Tiers are the ones data/atlas.json already ships (tools/atlas.py, the waystone tier runs a modifier rolls on);
this joins them by name and line, and says how many it could not join.

The tags come from the modifier's stats, never from its words and never from an opinion: STATS below is the
whole table, one line per rule, each with the reason. A stat the game never words still tags (it is matched
against, never shown). Where a stat names a curse or a debuff, the tag says what that curse does in the game's
own help entry for it (Elemental Weakness "lowers Elemental Resistances"), and the rule says so.

The search text. The game's search box takes a regular expression (its own help text, StashPanelSearchInfo:
"Regular expressions are supported"; words split on spaces unless quoted). Two community tools build waystone
search text, and both do the same thing this does: poe2.re/waystone (veiset) joins a short fragment per mod
into one quoted term, "!a|b|c", where "!" asks for waystones with none of them; poe2ref.com/regex picks for each
mod the shortest run of letters that no other mod in the pool shares, so the number a mod rolls never matters.
Here: frag() picks that fragment per modifier against every line of its pool (the bonus lines too), and avoid()
covers a set of tags with as few fragments as it can. How long the box may be is not settled: poe2ref says 50
today and that GGG has said 250, poe2.re builds to 250, and GGG's own bug forum has a report titled "Search
textbox limited to 50 characters (not 250)". So the text is measured against both and the page labels it
Subject to change. design/map-danger.md has three worked examples.

    python tools/mapdanger.py                       write data/mapdanger.json
    python tools/mapdanger.py --report              count and say what would change, write nothing
    python tools/mapdanger.py --avoid "less recovery,curse"            the search text for those tags
    python tools/mapdanger.py --avoid "extra element" --pool tablet    the same over tablets

It reads the export (tools/gamepull.py's cache, pulled if missing), data/atlas.json,
data/game/atlas_corruption.json and tools/monstermods.py's tag words: the pipeline's `mapdanger` stage, after
`atlas` (python tools/pipeline.py --only mapdanger).
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import atlas  # noqa: E402
from gamepull import official  # noqa: E402
from gamelib import SHOWN  # noqa: E402
from monstermods import TAGS as MONSTER_TAGS  # noqa: E402
from sync import DNT, RAW  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'mapdanger.json'
ATLAS = ROOT / 'data' / 'atlas.json'
CORRUPT = ROOT / 'data' / 'game' / 'atlas_corruption.json'
MONSTER = ROOT / 'data' / 'monstermods.json'
GAME = 'Source: the game files'

# The stat descriptions each pool is worded from, first match wins (tools/atlas.py's own order)
MAPW = ['endgame_map', 'map', 'stat_descriptions', 'atlas', 'tablet']
TABW = ['tablet', 'endgame_map', 'map', 'stat_descriptions', 'atlas']

# The stat -> tag table. Each: the tag, the stat ids it reads (a pattern over the id), and why. Only a stat that
# does something to the map is read: the reward lines a waystone carries as its bonus (atlas.REWARD: pack size,
# rarity, waystones found) are never tagged. Order is the order a card shows them in, the one monstermods.py
# uses: what shuts off part of a build first, what makes the fight longer last. A tag that no live modifier
# carries stays in the table, so the list stays one list with data/monstermods.json and a modifier that comes
# back in a patch is tagged the day it does.
STATS = [
    ('no regen',            r'no_regeneration',
     'the player does not regenerate (the game\'s old "no regeneration" map stats; none rolls in 0.5.5)'),
    ('no leech',            r'cannot_be_leeched_from|cannot_leech|no_leech',
     'monsters cannot be leeched from (same: in the table, not on a waystone in 0.5.5)'),
    ('less recovery',       r'player_life_and_es_recovery_speed|recovery_reduction|mana_siphoning_mana_degeneration',
     'less Recovery Rate of Life and Energy Shield; ground that drains mana'),
    ('less flask effect',   r'player_flask_effect|flask_effect_\+%|cancel_flask_on_flask_use',
     'flasks do less, or are cancelled'),
    ('fewer flask charges', r'player_charges_gained|remove_enemy_flask_charge|steal_charges',
     'players gain fewer flask charges, or monsters take them'),
    ('less resistance',     r'additional_player_maximum_resistances|players_resist_all|reduce_enemy_\w+_resistance|'
                            r'elemental_weakness_curse',
     'lower maximum resistances; Elemental Weakness, which the game\'s help says "lowers Elemental Resistances"'),
    ('penetration',         r'penetrate', 'monster damage penetrates your resistances'),
    ('reflect-like',        r'reflect', 'damage or curses come back to you'),
    ('curse',               r'curse_zones|apply_random_curses', 'players are cursed'),
    ('curses weaker',       r'monsters_curse_effect', 'your curses do less to monsters', '-'),
    ('cannot',              r'player\w*_cannot_|no_regeneration|player_damage_cycle|cannot_be_leeched_from',
     'something the player does is switched off: no regeneration, no leech, no damage for a while'),
    ('more damage taken',   r'death_mark', 'Marked for Death: the game\'s help says "you take 50% increased damage"'),
    ('slower cooldowns',    r'player_cooldown_speed', 'less Cooldown Recovery Rate'),
    ('slows you',           r'temporal_chains_curse|player_speed_\+%_final|grasping_vines',
     'Temporal Chains and Grasping Vines "slow", in the game\'s help; less movement and skill speed'),
    ('breaks armour',       r'armour_break', 'monsters Break your Armour'),
    ('extra element',       r'damage_to_gain_as_|gain_as_(?:fire|cold|lightning|chaos)',
     'monsters deal part of their damage again as an element'),
    ('ailment on hit',      r'inflict_bleeding|poison_on_hit|elemental_ailment_chance|grasping_vines_on_hit',
     'monster hits bleed, poison, or apply elemental ailments more'),
    ('damage bursts',       r'monster\w*explo|barrage|meteor', 'monsters let off bursts of damage'),
    ('teleports',           r'teleport', 'monsters teleport'),
    ('ground effect',       r'ground_(?!effect_radius|effect_patches)|ground_effect_patches',
     'patches of burning, chilled, shocked or siphoning ground'),
    ('on death',            r'on_death|after_death', 'something happens when a monster dies'),
    ('cannot be damaged',   r'cannot_take_damage|(?<!ignore_)cannot_be_damaged|damage_removed_from',
     'monsters cannot be damaged for a while'),
    ('more damage',         r'monsters_damage_\+%|monster_damage|monster_potency.*deal|deal_more_damage',
     'monsters deal more damage'),
    ('more crits',          r'critical_strike_chance|critical_strike_multiplier_\+', 'monsters crit more, and harder'),
    ('more accuracy',       r'accuracy', 'monsters hit you more often'),
    ('stuns you',           r'hit_damage_stun_multiplier', 'monsters build up stun on you faster'),
    ('faster',              r'attack_cast_and_movement_speed|soul_eater', 'monsters act faster (Soul Eater: '
                            '"1% increased Skill Speed" a soul, in the game\'s help)'),
    ('more area',           r'monsters_area_of_effect|number_of_projec', 'bigger monster area, more projectiles'),
    ('stronger pack',       r'minion|monsters_revive|allies', 'the pack is stronger together'),
    ('more rare modifiers', r'num_additional_modifiers|boss_num_additional|additional_modifier_chance|abyssal_modifiers|'
                            r'number_of_additional_mods',
     'rare or unique monsters, or the map itself, carry more modifiers'),
    ('boss only',           r'map_boss|unique_boss|powerful_map_boss|mapboss|maps_with_powerful_bosses',
     'it touches the map boss, or the map only because of its boss'),
    ('resists crits',       r'self_critical_strike_multiplier', 'monsters take less extra damage from critical hits'),
    ('resists ailments',    r'ailment_threshold', 'monsters are harder to inflict ailments on'),
    ('resists fire',        r'additional_(?:elemental|fire)_resistance', 'monster fire resistance'),
    ('resists cold',        r'additional_(?:elemental|cold)_resistance', 'monster cold resistance'),
    ('resists lightning',   r'additional_(?:elemental|lightning)_resistance', 'monster lightning resistance'),
    ('resists chaos',       r'additional_chaos_resistance', 'monster chaos resistance'),
    ('harder to kill',      r'monsters_life_\+%|monster_life|to_add_to_maximum_energy_shield|ratio_%_for_(?:armour|evasion)|'
                            r'stun_threshold|monster_potency|difficulty_tankiness|monsters_enhanced|monster_level|^map_level_\+',
     'more life, energy shield, armour or evasion; more Effectiveness, which the game\'s help says gives '
     '"more Toughness"; a higher monster level'),
    ('delirious',           r'endgame_fog_depth|affliction_encounter_monster_depth|delirium_fog_never_dissipates',
     'players are Delirious: the game\'s help says monsters "deal more damage and have additional Toughness"'),
]
STATS = [(x[0], re.compile(x[1]), x[2], x[3] if len(x) > 3 else None) for x in STATS]
REWARD = atlas.REWARD


def hurts(sid, lo, hi, sign=None):
    """Does this roll go against the player? A signed stat (+% or +) counts only in the direction that does:
    more for a monster's, less for a player's ("Monsters in your Maps have 30% less Life" is no danger).
    A stat named in -% (monsters take less from crits) counts when it is above zero. Any other stat is a
    switch or an amount, and counts. A rule that knows better says its own sign (a monster's curse effect is
    against you when it goes down)."""
    if sign:
        return lo < 0 if sign == '-' else hi > 0
    if '_-%' in sid:
        return hi > 0
    if '+' in sid:
        return lo < 0 if 'player' in sid else hi > 0
    return True


def tag(stats):
    """What the stats do to you: [(tag, stat id that carries it)], each tag once, in table order.
    stats: [(id, min, max)]."""
    out = []
    for t, p, _, sign in STATS:
        for sid, lo, hi in stats:
            if not REWARD.search(sid) and p.search(sid) and hurts(sid, lo, hi, sign):
                out.append((t, sid))
                break
    return out


def runs(ts):
    return [ts[0], ts[-1]] if ts else None


def weight(m, tags):
    for sw in m['spawn_weights']:
        if sw['tag'] in tags:
            return sw['weight']
    return 0


class Pools:
    """Reads the export once and turns a game mod into lines, bonus lines, tags and the lines behind each tag."""

    def __init__(self):
        atlas.repoe = official          # tools/atlas.py's wording, over tools/gamepull.py's cache
        self.W = atlas.Words()
        self.M = official('mods.min.json')
        self.B = official('base_items.min.json')
        self.missing = Counter()

    def stats(self, mid):
        return [(s['id'], s['min'], s['max']) for s in self.M[mid]['stats'] if not (s['min'] == 0 and s['max'] == 0)]

    def words(self, st, order):
        ls, miss = self.W.render(st, order)
        for x in miss:
            self.missing[x] += 1
        return ls

    def read(self, mid, order):
        """(effect lines, bonus lines, tags, why, hidden): why is {tag: the game line that carries it}."""
        st = self.stats(mid)
        eff = self.words([s for s in st if not REWARD.search(s[0])], order)
        bon = self.words([s for s in st if REWARD.search(s[0])], order)
        tg, why, hid = [], {}, []
        for t, sid in tag(st):
            tg.append(t)
            one = [s for s in st if s[0] == sid]
            line, miss = self.W.render(one, order)
            if line:
                why[t] = line[0]
            else:
                hid.append(sid)
        return eff, bon, tg, why, hid


def waystones(P, have):
    """Waystone prefixes and suffixes, by group, with the tiers data/atlas.json ships."""
    tier_tags = {}
    for k, v in P.B.items():
        if v['item_class'] == 'Map' and v['release_state'] == 'released':
            tier_tags[int(re.search(r'Tier(\d+)', k).group(1))] = v['tags']
    shipped = {(g['a'], g['k']): g for g in have.get('wmods') or []}
    groups, joined, own = {}, 0, 0
    for mid, m in P.M.items():
        if m['domain'] != 'area' or m['generation_type'] not in ('prefix', 'suffix'):
            continue
        if all(s['id'].startswith('dummy_stat_display_nothing') for s in m['stats']):
            continue
        eff, bon, tg, why, hid = P.read(mid, MAPW)
        if not eff:
            continue
        ts = [t for t in sorted(tier_tags) if weight(m, tier_tags[t]) > 0]
        key = ((m['groups'] or [mid])[0], m['name'], m['generation_type'])
        g = groups.setdefault(key, {'n': m['name'] or '', 'k': m['generation_type'][0], 'pool': 'waystone',
                                    's': 'Waystone ' + m['generation_type'], 'r': [], 'mods': []})
        # the tier run WI already shows on the Atlas tab, joined by name, side and lines
        w = runs(ts)
        ship = shipped.get((g['n'], g['k']))
        hit = [r for r in (ship or {}).get('r', []) if r['ls'] == eff and r['b'] == bon]
        if hit:
            w = hit[0]['w'] if len(hit) == 1 else next((r['w'] for r in hit if r['w'] == w), hit[0]['w'])
            joined += 1
        else:
            own += 1
        row = {'w': w, 'ls': eff, 'b': bon}
        if row not in g['r']:
            g['r'].append(row)
        g['mods'].append(mid)
        merge(g, tg, why, hid)
    out = []
    for g in groups.values():
        g['r'].sort(key=lambda r: (r['w'] is None, (r['w'] or [99])[0]))
        if all(r['w'] is None for r in g['r']):
            g['nt'] = 'Rolls on no waystone tier'
        out.append(g)
    out.sort(key=lambda g: (g['k'] != 'p', g['n']))
    return out, joined, own


def merge(g, tg, why, hid):
    for t in tg:
        if t not in g.setdefault('tags', []):
            g['tags'].append(t)
    for t, line in why.items():
        g.setdefault('why', {}).setdefault(t, line)
    for h in hid:
        if h not in g.setdefault('hid', []):
            g['hid'].append(h)


def extras(P, have):
    """The desecrated waystone modifiers (Preserved Vertebrae) and the ten Liquid Emotions."""
    out = []
    for mid, m in P.M.items():
        if m['domain'] == 'desecrated' and any(s['tag'] == 'map' and s['weight'] > 0 for s in m['spawn_weights']):
            eff, bon, tg, why, hid = P.read(mid, MAPW)
            g = {'n': m['name'] or '', 'k': m['generation_type'][0], 'pool': 'waystone',
                 's': 'Desecrated waystone ' + m['generation_type'], 'r': [{'w': None, 'ls': eff, 'b': bon}],
                 'mods': [mid]}
            merge(g, tg, why, hid)
            out.append(g)
    emo = [e['n'] for e in have.get('wemo') or []]
    for i in range(1, atlas.EMOTIONS + 1):
        mid = 'InstilledMapDelirium%d' % i
        if mid not in P.M:
            continue
        eff, bon, tg, why, hid = P.read(mid, MAPW)
        g = {'n': emo[i - 1] if i <= len(emo) else 'Liquid Emotion', 'pool': 'waystone', 's': 'Instilled Liquid Emotion',
             'r': [{'w': None, 'ls': eff, 'b': bon}], 'mods': [mid]}
        merge(g, tg, why, hid)
        out.append(g)
    return out


def tablets(P):
    """Tablet prefixes and suffixes, each base's implicit, and the unique tablets' modifiers."""
    tabs = {v['name']: v for v in P.B.values() if v['item_class'] == 'TowerAugmentation'}
    order = [t for t in atlas.TABLET_ORDER if t in tabs] + sorted(t for t in tabs if t not in atlas.TABLET_ORDER)
    out = []
    for n in order:
        for mid in tabs[n]['implicits']:
            eff, bon, tg, why, hid = P.read(mid, TABW)
            g = {'n': n, 'pool': 'tablet', 's': 'Tablet implicit', 'r': [{'w': None, 'ls': eff + bon, 'b': []}],
                 'mods': [mid]}
            merge(g, tg, why, hid)
            out.append(g)
    for mid, m in P.M.items():
        if m['domain'] != 'tablet' or m['generation_type'] not in ('prefix', 'suffix'):
            continue
        on = [t for t in order if weight(m, tabs[t]['tags']) > 0]
        if not on:
            continue
        eff, bon, tg, why, hid = P.read(mid, TABW)
        g = {'n': m['name'] or '', 'k': m['generation_type'][0], 'pool': 'tablet', 's': 'Tablet ' + m['generation_type'],
             'r': [{'w': None, 'ls': eff + bon, 'b': []}], 'mods': [mid]}
        if len(on) < len(order):
            g['on'] = on
        merge(g, tg, why, hid)
        out.append(g)
    for n, mids in atlas.UNIQUE_TABLET_MODS.items():
        mids = [m for m in mids if m in P.M]
        if not mids:
            continue
        g = {'n': n, 'pool': 'tablet', 's': 'Unique tablet', 'r': [{'w': None, 'ls': [], 'b': []}], 'mods': mids}
        for mid in mids:
            eff, bon, tg, why, hid = P.read(mid, TABW)
            g['r'][0]['ls'] += eff + bon
            merge(g, tg, why, hid)
        out.append(g)
    return out


def nodes(P):
    """What a corrupted or cleansed atlas node puts on its maps, with the game's weights."""
    rows = json.loads(CORRUPT.read_text(encoding='utf-8'))['rows'] if CORRUPT.exists() else []
    out, off = [], 0
    for mid, m in P.M.items():
        if not mid.startswith(('EndgameCorruption', 'EndgameCleansed')) or m['domain'] != 'area':
            continue
        eff, bon, tg, why, hid = P.read(mid, MAPW)
        lines = eff + bon
        if not lines:
            continue                      # the base node row: no words, nothing on the map
        kind = 'Corrupted' if mid.startswith('EndgameCorruption') else 'Cleansed'
        hit = [r for r in rows if r['kind'] == kind and r.get('text') == lines]
        if hit and not hit[0].get('weight'):
            off += 1
            continue                      # weight 0: the game will not roll it
        g = {'n': kind + ' atlas node', 'pool': 'atlas', 's': kind + ' atlas node modifier',
             'r': [{'w': None, 'ls': lines, 'b': []}], 'mods': [mid]}
        if hit:
            g['wt'] = hit[0]['weight']
        if kind == 'Cleansed':
            g['sub'] = True               # the cleansed weight is a column dat-schema does not name yet
        merge(g, tg, why, hid)
        out.append(g)
    return out, off


# ---------------------------------------------------------------- the search text

# How the item reads besides its modifiers: the property lines a waystone and a tablet print (the game's own
# words, as the item shows them). A fragment must miss these too.
BASE_LINES = {
    'waystone': ['Waystone (Tier #)', 'Waystone Tier: #', 'Revives Available: #', 'Item Quantity: +#%', 'Item Rarity: +#%',
                 'Monster Pack Size: +#%', 'Monster Rarity: +#%', 'Monster Effectiveness: +#%',
                 'Waystone Drop Chance: +#%', 'Item Level: #', 'Corrupted'],
    'tablet': ['# uses remaining', 'Item Level: #', 'Corrupted'] + ['%s Tablet' % t for t in
               ('Breach', 'Delirium', 'Ritual', 'Expedition', 'Abyss', 'Temple', 'Irradiated', 'Overseer')],
    'atlas': [],
}
LIMITS = (50, 250)
NUM = re.compile(r'[+-]?\(?\d[\d.]*(?:-\d[\d.]*)?\)?')


def norm(line):
    """A line as the search box meets it: lower case, every number a #."""
    return NUM.sub('#', line.lower())


def pieces(line, most=18, least=3):
    """Every run of letters, spaces and ' in a line, shortest first: what a fragment may be made of. Three
    letters at least: a rare waystone's name is two random words the game does not export, and two letters
    ("tt", "gn") land in a name far more often than three do."""
    got = set()
    for part in re.split(r"[^a-z' ]+", line):
        n = len(part)
        for i in range(n):
            for j in range(i + least, min(n, i + most) + 1):
                f = part[i:j]
                if f.strip() == f:
                    got.add(f)
    return sorted(got, key=lambda f: (len(f), f))


def corpus(rows, pool):
    """[(row index or None, line)]: every line a searched item of the pool can print."""
    out = [(None, norm(x)) for x in BASE_LINES[pool]]
    for i, g in enumerate(rows):
        if g['pool'] != pool:
            continue
        for r in g['r']:
            out += [(i, norm(x)) for x in r['ls']]
            out += [(None, norm(x)) for x in r['b']]     # a bonus line is on many modifiers: never a target
    return out


def frag(rows, pool):
    """For each row of the pool, the shortest fragment that lights up that row and nothing else, or the
    shortest one it shares, with who else it lights (a line wholly inside another's)."""
    lines = corpus(rows, pool)
    for i, g in enumerate(rows):
        if g['pool'] != pool:
            continue
        own = [x for j, x in lines if j == i]
        best = None
        for line in own:
            for f in pieces(line):
                hit = {j for j, x in lines if f in x}
                if hit == {i}:
                    if best is None or len(f) < len(best):
                        best = f
                    break
        if best:
            g['re'] = best
        elif own:
            # nothing isolates it: the shortest piece that misses the base and bonus lines, and who shares it
            cands = [(f, {j for j, x in lines if f in x}) for line in own for f in pieces(line)]
            cands = [(f, h) for f, h in cands if None not in h]
            if cands:
                f, h = min(cands, key=lambda c: (len(c[1]), len(c[0])))
                g['re'] = f
                g['also'] = sorted(rows[j]['n'] for j in h if j != i)


def avoid(rows, tags, pool='waystone'):
    """The search text that finds the items of a pool with none of the modifiers carrying any of these tags.

    Greedy cover: every fragment that lights only chosen rows (never a row the player keeps, a base line or a
    bonus line) is a candidate; take the one that covers most chosen rows per character until all are covered.
    Returns {text, n, len, fits: {50: bool, 250: bool}, rows: [names], left: [names no fragment isolates]}."""
    tags = [t.strip() for t in tags if t.strip()]
    lines = corpus(rows, pool)
    want = {i for i, g in enumerate(rows) if g['pool'] == pool and set(tags) & set(g.get('tags') or [])}
    cand = {}
    for i in want:
        for r in rows[i]['r']:
            for line in r['ls']:
                for f in pieces(norm(line), most=24):
                    if f in cand:
                        continue
                    hit = {j for j, x in lines if f in x}
                    if hit and None not in hit and hit <= want:
                        cand[f] = hit
    left, picked = set(want), []
    while left:
        best = max(((f, h & left) for f, h in cand.items() if h & left),
                   key=lambda c: (len(c[1]) / (len(c[0]) + 1), -len(c[0])), default=None)
        if not best:
            break
        picked.append(best[0])
        left -= best[1]
    body = '|'.join(picked)
    text = '"!%s"' % body if body else ''
    return {'text': text, 'find': '"%s"' % body if body else '', 'len': len(text),
            'fits': {str(n): len(text) <= n for n in LIMITS},
            'rows': sorted(rows[i]['n'] for i in want), 'left': sorted(rows[i]['n'] for i in left)}


# ---------------------------------------------------------------- the file

def vocab():
    """Where the two lists of tag words part: a word tools/monstermods.py's TAGS or data/monstermods.json uses that
    STATS does not have, or the words the two share in another order. One list, one order, so a filter or a card
    that reads both files reads one vocabulary (assets/kinds.js, the `danger` fields)."""
    ours = [t for t, *_ in STATS]
    theirs = [t for t, *_ in MONSTER_TAGS]
    try:
        theirs += [t for it in json.loads(MONSTER.read_text(encoding='utf-8'))['rows'] for t in it.get('tags') or []]
    except (OSError, ValueError, KeyError):
        pass
    bad = sorted(set(theirs) - set(ours))
    shared = [t for t in ours if t in {x for x, *_ in MONSTER_TAGS}]
    if not bad and shared != [t for t, *_ in MONSTER_TAGS]:
        bad = ['the order: STATS has ' + ', '.join(shared) + '; tools/monstermods.py has ' +
               ', '.join(t for t, *_ in MONSTER_TAGS)]
    return bad


def build():
    have = json.loads(ATLAS.read_text(encoding='utf-8'))
    P = Pools()
    ways, joined, own = waystones(P, have)
    rows = ways + extras(P, have) + tablets(P)
    at, off = nodes(P)
    rows += at
    for g in rows:
        if g.get('tags'):
            g['q'] = ' '.join(g['tags'])
        g['src'] = GAME
        if not g.get('hid'):
            g.pop('hid', None)
        if not g.get('k'):
            g.pop('k', None)
    for pool in ('waystone', 'tablet'):
        frag(rows, pool)
    per = {}
    for pool in ('waystone', 'tablet'):
        for t, *_ in STATS:
            a = avoid(rows, [t], pool)
            if a['text']:
                per.setdefault(pool, {})[t] = a['text']
    check(rows)
    extra = vocab()
    if extra:
        sys.exit('the tag words part from tools/monstermods.py: ' + ', '.join(extra))
    return {'source': 'game files, patch %s (the mod table, read by RePoE); tiers from data/atlas.json' % have.get('patch', ''),
            'table': 'Mods, Stats, BaseItemTypes, EndgameCorruptionMods',
            'note': 'One row per modifier a player can meet on a waystone, a tablet or a corrupted or cleansed atlas '
                    'node. pool is where it rolls; r its steps (w the waystone tiers, ls its lines, b the bonus lines '
                    'it adds); tags what it does to you, from its stats (why: the line that says it); re the search '
                    'fragment that lights it alone (also: what else it lights); avoid, per pool and tag, the search '
                    'text for waystones or tablets without it. Written by tools/mapdanger.py; design/map-danger.md.',
            'tags': [{'t': t, 'why': why} for t, _, why, _ in STATS],
            'limits': {'len': list(LIMITS), 'label': 'Subject to change',
                       'why': 'poe2ref.com/regex says 50 today; poe2.re builds to 250; GGG has not written a number'},
            'avoid': per,
            'counts': {'tiers joined from data/atlas.json': joined, 'tiers worked out here': own,
                       'atlas node modifiers with weight 0, left out': off},
            'ids': ['mods', 'hid'], 'rows': rows}


def check(rows):
    """Nothing a player reads may look like game code (the #12 rule, and tools/dev/ids.mjs over this file)."""
    for g in rows:
        for f in ('n', 's', 'tags', 'why', 'nt', 'src', 'r', 'on', 'also'):
            v = g.get(f)
            vals = []
            if isinstance(v, dict):
                vals = list(v.values())
            elif isinstance(v, list):
                for x in v:
                    vals += (x['ls'] + x['b']) if isinstance(x, dict) else [x]
            elif v:
                vals = [v]
            for y in vals:
                if isinstance(y, str) and (RAW.search(y) or DNT.search(y) or any(m.search(y) for m in SHOWN)):
                    sys.exit('game code in %s %r: %r' % (f, g['n'], y))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    ap.add_argument('--avoid', help='tags, comma separated: print the search text that avoids them')
    ap.add_argument('--pool', default='waystone', choices=['waystone', 'tablet'])
    args = ap.parse_args()
    if args.avoid:
        rows = json.loads(OUT.read_text(encoding='utf-8'))['rows']
        a = avoid(rows, args.avoid.split(','), args.pool)
        print(a['text'] or '(no %s modifier carries %s)' % (args.pool, args.avoid))
        print('%d characters · fits 50: %s · fits 250: %s' % (a['len'], a['fits']['50'], a['fits']['250']))
        print('avoids: ' + ', '.join(a['rows']))
        if a['left']:
            print('no fragment isolates: ' + ', '.join(a['left']))
        return 0
    out = build()
    rows = out['rows']
    by = Counter(g['pool'] for g in rows)
    print('mapdanger %d modifiers: %s' % (len(rows), ', '.join('%s %d' % kv for kv in by.items())))
    for pool in by:
        tally = Counter(t for g in rows if g['pool'] == pool for t in g.get('tags') or [])
        print('  %-9s tagged %d · %s' % (pool, sum(1 for g in rows if g['pool'] == pool and g.get('tags')),
                                          ', '.join('%s %d' % (t, tally[t]) for t, *_ in STATS if tally[t])))
    iso = Counter(g['pool'] for g in rows if g.get('re') and not g.get('also'))
    print('  search fragments: ' + ', '.join('%s %d of %d alone' % (p, iso[p], by[p]) for p in ('waystone', 'tablet')))
    print('  ' + ', '.join('%s %d' % kv for kv in out['counts'].items()))
    if any(not g.get('re') for g in rows if g['pool'] != 'atlas'):
        print('  no fragment: ' + ', '.join(g['n'] for g in rows if g['pool'] != 'atlas' and not g.get('re')))
    text = json.dumps(out, ensure_ascii=False, indent=1) + '\n'
    was = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    if args.report:
        print('--report: nothing written%s' % ('' if text == was else ' (would change data/mapdanger.json)'))
        return 0
    OUT.write_text(text, encoding='utf-8', newline='\n')
    print('-> data/mapdanger.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
