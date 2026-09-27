"""data/areas.json: every place a player can stand in, with its level, its waypoint, where it leads and who is
fought there. The data half of the Area card (issue #72); the card itself is proposed in design/areas.md.

Two official sources, joined on the area's own id and nothing else:

  the export   RePoE's world_areas (https://repoe-fork.github.io/poe2/world_areas.min.json, through
               tools/gamepull.py): each area's name, act, area level, waypoint, town, the town it belongs to and
               the areas it connects to. The modifiers an area always carries are worded from RePoE's mods
               (their "text", the game's own words)
  the tables   the 0.5.5 game tables decoded from the client (the private data archive's game/<patch>/out,
               issue #83; --game or WI_GAME points at it): the boss names an area lists (WorldAreas,
               MonsterVarieties), which areas are hideouts, the act titles (Acts), the elemental resistance
               penalty per area level (ResistancePenaltyPerAreaLevel), the areas a quest's own tracker names
               (QuestStates), and per Atlas map its biomes and its flavour line (EndgameMaps)

Per area, a player's words only:

  n      the name
  act    the act as the game titles it: "Act 2", "Interlude", "Endgame"
  lv     the area level (a pair where one name covers areas of two levels)
  way    1 on an Atlas map whose level its Waystone sets, and lv is then the Waystones' range (data/atlas.json).
         The files say it no one place, so it is read off four: an Endgame area the files tag "map", listed
         in EndgameMaps, at the lowest Waystone's level, and not a unique map, a pinnacle fight or a quest area
  wp     1 where there is a waypoint, town 1 on a town, hub the town it belongs to
  to     the areas it connects to, by name
  boss   who is fought there; x 1 where data/bosses.json has that boss, so the card can open it
  res    the elemental resistance penalty at its level (a pair with lv)
  mods   what the area always carries, in the game's words; hid 1 where the game never shows the line,
         and the words are ours (HIDDEN): only the ones whose meaning is sure are worded, the rest are counted
  quest  the quests whose tracker names it
  biome  an Atlas map's biomes, qt its flavour line
  id     the game's own ids for it. Never shown (issue #12): the card keys on it, nothing draws it

Left out, and counted in "hidden": the areas players never see. No name, a [DNT] marker, a hideout, the
developers' own areas (TEST), and the entries that are not a place (level 0: character select, the act maps,
"Current Town"). One name in one act is one card: the Trial of the Sekhemas is 16 areas in the files and one
place to a player, so its entries are merged, their ids kept in "id", the level a pair where they differ.

Run after tools/bosses.py (it names the bosses that have a card) and after tools/atlas.py (the Waystone range):

  python tools/areas.py              write data/areas.json
  python tools/areas.py --report     count and say what would change, write nothing
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
from gamepull import REPOE, official  # noqa: E402
from sync import DNT, RAW, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = 'areas.json'
AREAS = 'world_areas.min.json'
MODS = 'mods.min.json'
URL = REPOE + AREAS
ENDGAME = 10
# The developers' own areas, by id: they carry a name, a level and sometimes a waypoint, and no player reaches
# them ("Gone Fishing" is the designers' test area, "Programming World" the programmers', "Boss Rush Area 1"
# a test harness, "Druid Trailer" the class trailer's set).
TEST = re.compile(r'^(Design|Programming|BlackTest|DruidTrailer|BossRush_)')
# A modifier the game gives an area and never shows. Worded here, in plain words, only where the stat says it
# outright; the rest are counted and left off (a timer in milliseconds, a flag for the quest log, a value of 0).
HIDDEN = {
    'MapBlockBossRituals': ['No Ritual in the boss area'],
    'MapDropNoLeagueTablets': ['Tablets for league content do not drop here'],
    'MapNoPortals': ['Portals cannot be used'],
    'MapForceHumanFormLoad': ['You arrive in human form'],
    'BreachDomainIncreasedCatalystsRings': ['200% increased number of Rings in Breach chests',
                                            '200% increased number of Catalysts dropped by Breach monsters'],
}


# ---------------------------------------------------------------- the decoded tables

def game_dir(arg=None):
    """The decoded tables' out/ folder: --game, WI_GAME, or the archive beside the checkout or in home."""
    patch = (lastgood.committed('gamedata.json', quiet=True) or {}).get('patch') or '0.5.5'
    for p in [arg, os.environ.get('WI_GAME'),
              ROOT.parent / 'wraeclast-data' / 'game' / patch / 'out',
              Path.home() / 'wraeclast-data' / 'game' / patch / 'out']:
        if p and (Path(p) / 'world_areas.json').exists():
            return Path(p)
    raise lastgood.Stale('no decoded game tables for patch %s (pass --game DIR or set WI_GAME)' % patch)


def table(where, name):
    """One decoded table: a curated file's rows, or a raw table."""
    d = json.loads((where / name).read_text(encoding='utf-8'))
    return d['data'] if isinstance(d, dict) and 'data' in d else d


# ---------------------------------------------------------------- the rules

def why_hidden(aid, a, raw):
    """Why a player never sees this area, in a word, or None when they do."""
    name = (a.get('name') or '').strip()
    if not name or name == 'NULL' or name == aid:
        return 'no name'
    if DNT.search(name):
        return '[DNT]'
    if (raw.get(aid) or {}).get('IsHideout') or aid.startswith('Hideout') or name.endswith(' Hideout'):
        return 'hideout'
    if TEST.match(aid):
        return 'test'
    if not a.get('area_level'):
        return 'not a place'
    return None


def natural(aid):
    """G1_2 before G1_10: the files number an act's areas in the order the act walks them."""
    return [int(x) if x.isdigit() else x for x in re.split(r'(\d+)', aid)]


def pair(lo, hi):
    return lo if lo == hi else [lo, hi]


# ---------------------------------------------------------------- build

def build(where):
    areas = official(AREAS)
    if len(areas) < 300:
        raise lastgood.Stale('the area export came back with %d areas' % len(areas))
    mods = official(MODS)
    raw = {w['Id']: w for w in table(where, 'raw/WorldAreas.json')}
    named = {w['id']: w for w in table(where, 'world_areas.json')}
    acts = {a['ActNumber']: (a.get('UI_Title') or '').strip() or 'Act %d' % a['ActNumber']
            for a in table(where, 'raw/Acts.json')}
    penalty = {r['areaLevel']: r['penalty'] for r in table(where, 'resistance_penalty.json')}
    maps = {m['areaId']: m for m in table(where, 'map_bosses.json')}
    bosses = {b['name'] for b in (lastgood.committed('bosses.json', quiet=True) or {}).get('bosses') or []}
    ways = [w.get('al') for w in (lastgood.committed('atlas.json', quiet=True) or {}).get('ways') or [] if w.get('al')]

    # the areas a quest's own tracker names
    quests = table(where, 'raw/Quest.json')
    rows = table(where, 'raw/WorldAreas.json')
    questsof = defaultdict(set)
    for s in table(where, 'raw/QuestStates.json'):
        q = quests[s['Quest']] if s.get('Quest') is not None and s['Quest'] < len(quests) else None
        qn = plain((q or {}).get('Name') or '')
        if not qn or DNT.search(qn):
            continue
        for w in s.get('WorldArea') or []:
            questsof[rows[w]['Id']].add(qn)

    hidden, shown = Counter(), {}
    for aid, a in areas.items():
        why = why_hidden(aid, a, raw)
        if why:
            hidden[why] += 1
        else:
            shown[aid] = a

    # one card per name per act
    cards, key = {}, {}
    for aid in sorted(shown, key=lambda i: (shown[i]['act'], natural(i))):
        a = shown[aid]
        k = (plain(a['name']), a['act'])
        key[aid] = k
        cards.setdefault(k, []).append(aid)

    left, out = Counter(), []
    for (name, act), ids in cards.items():
        ids = sorted(ids, key=lambda i: (not shown[i]['has_waypoint'], natural(i)))   # the one with the waypoint first
        ones = [shown[i] for i in ids]
        lo, hi = min(a['area_level'] for a in ones), max(a['area_level'] for a in ones)
        card = {'n': name, 'act': acts.get(act) or 'Act %d' % act, 'actn': act}
        m = next((maps[i] for i in ids if i in maps), None)
        way = (act == ENDGAME and ways and lo == min(ways) and m is not None and not m.get('isUnique')
               and all('map' in (shown[i].get('tags') or []) for i in ids)
               and not any((raw.get(i) or {}).get('IsUniqueMapArea') for i in ids)
               and not any('pinnacle_boss' in (shown[i].get('tags') or []) for i in ids)
               and not any('MapIsQuestArea' in (shown[i].get('area_mods') or []) for i in ids))
        if way:
            lo, hi = min(ways), max(ways)
            card['way'] = 1
        card['lv'] = pair(lo, hi)
        if any(a['has_waypoint'] for a in ones):
            card['wp'] = 1
        if any(a['is_town'] for a in ones):
            card['town'] = 1
        hubs = {plain(areas[a['parent_town']]['name']) for a in ones
                if a.get('parent_town') in shown and plain(areas[a['parent_town']]['name']) != name}
        if hubs:
            card['hub'] = sorted(hubs)[0]
        to = []
        for a in ones:
            for c in a.get('connections') or []:
                if c not in key:
                    left['connection to a hidden area'] += 1
                    continue
                cn = key[c][0]
                if key[c] != (name, act) and cn not in to:
                    to.append(cn)
        if to:
            card['to'] = to
        fought = []
        for i in ids:
            for b in (named.get(i) or {}).get('bosses') or []:
                b = plain(b)
                if not b or DNT.search(b):
                    left['boss with no name'] += 1
                elif b not in [x['n'] for x in fought]:
                    fought.append({'n': b, **({'x': 1} if b in bosses else {})})
        if fought:
            card['boss'] = fought
        if penalty:
            card['res'] = pair(penalty.get(lo, 0), penalty.get(hi, 0))
        said, seen = [], set()
        for a in ones:
            for mid in a.get('area_mods') or []:
                if mid in seen:
                    continue
                seen.add(mid)
                text = (mods.get(mid) or {}).get('text')
                if text:
                    said += [{'t': plain(x)} for x in text.split('\n') if plain(x)]
                elif mid in HIDDEN:
                    said += [{'t': x, 'hid': 1} for x in HIDDEN[mid]]
                else:
                    left['hidden modifier with no sure wording'] += 1
        if said:
            card['mods'] = said
        qs = sorted({q for i in ids for q in questsof.get(i, ())})
        if qs:
            card['quest'] = qs
        if m:
            if m.get('biomes'):
                card['biome'] = m['biomes']
            if (m.get('flavour') or '').strip():
                card['qt'] = plain(m['flavour'])
        card['id'] = ids
        out.append(card)

    out.sort(key=lambda c: (c['actn'], c['lv'] if isinstance(c['lv'], int) else c['lv'][0], natural(c['id'][0])))
    check(out)
    return {'note': 'Every area a player can stand in: level, waypoint, where it leads, who is fought there. '
                    'Written by tools/areas.py; "id" is the game\'s own and is never shown.',
            'updated': dt.date.today().isoformat(),
            'sources': ['RePoE world_areas and mods (the game files)',
                        'the game tables of patch 0.5.5 (WorldAreas, Acts, ResistancePenaltyPerAreaLevel, '
                        'QuestStates, EndgameMaps)'],
            'counts': {'game': len(areas), 'carded': len(out), 'merged': len(shown) - len(out),
                       'hidden': dict(sorted(hidden.items())), 'left out': dict(sorted(left.items()))},
            'areas': out}


def check(cards):
    """Nothing a player reads may look like game code (the standard tools/sync.py holds its cards to)."""
    for c in cards:
        for k, v in c.items():
            if k in ('id', 'actn'):
                continue
            for w in (json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v,):
                w = re.sub(r'"(n|t|x|hid)":', '', w)
                if RAW.search(w) or DNT.search(w) or re.search(r'\[[A-Za-z][^\]"]*\]|Metadata/', w):
                    raise lastgood.Stale('game code on the %s area: %s %r' % (c['n'], k, v))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    ap.add_argument('--game', help="the decoded tables' out/ folder")
    args = ap.parse_args()
    where = game_dir(args.game)
    out = lastgood.pull('Areas', lambda: build(where), file=OUT, url=URL, at='areas', floor=200)
    if out is None:
        return lastgood.report()
    c = out['counts']
    acts = Counter(a['act'] for a in out['areas'])
    print('areas  %d in the game, %d carded (%d more merged into a card of the same name), hidden: %s'
          % (c['game'], c['carded'], c['merged'], ', '.join('%d %s' % (n, w) for w, n in c['hidden'].items())))
    print('       by act: %s' % ', '.join('%s %d' % kv for kv in acts.items()))
    print('       %d with a waypoint, %d with a boss (%d of those bosses have a card), %d with modifiers, '
          '%d with quests, %d set by a Waystone'
          % (sum(1 for a in out['areas'] if a.get('wp')), sum(1 for a in out['areas'] if a.get('boss')),
             len({b['n'] for a in out['areas'] for b in a.get('boss') or [] if b.get('x')}),
             sum(1 for a in out['areas'] if a.get('mods')), sum(1 for a in out['areas'] if a.get('quest')),
             sum(1 for a in out['areas'] if a.get('way'))))
    if c['left out']:
        print('       left out: %s' % ', '.join('%d %s' % (n, w) for w, n in c['left out'].items()))
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    path = lastgood.DATA / OUT
    was = path.read_text(encoding='utf-8') if path.exists() else ''
    print('areas  %.0f KB%s' % (len(text.encode('utf-8')) / 1024, '' if text == was else
                                (' (would change)' if args.report else ' -> data/%s' % OUT)))
    if not args.report:
        lastgood.save(path, text)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Areas', file=OUT, url=URL))
