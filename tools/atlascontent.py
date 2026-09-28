"""data/atlascontent.json: per Atlas map, its biomes, what content it can hold, its boss and what it always carries;
and what corrupting (or cleansing) a map can add (issue #92). The data half: the card is proposed in
design/atlas-content.md.

One official source, the game's own tables, read by tools/datpull.mjs into data/game/:
  endgame_maps       EndgameMaps, EndgameMapLocations, EndgameMapBiomes, EndgameMapContentSet, WorldAreas: per map
                     its area level, biomes, bosses, the modifiers its area always carries, its fixed content
  map_content        EndgameMapContent and EndgameMapContentWeightings: what a map node can show, and the weights
  atlas_corruption   EndgameCorruptionMods and EndgameCleansedMods
Joined by name to the cards the site has (tools/cardnames.py): the keyword cards (a mechanic's card), bosses.json
and areas.json.

What is sure, and what is not (only the sure part is drawn plain; the rest carries its flag):
  * biomes, bosses, area level, the area's own modifier lines, the flavour and the unique map texts: named columns,
    the game's words. A modifier the game never shows is worded only where the game words the same stat elsewhere
    (a map content line with that one stat: hid 1) or the stat's name says it outright (HIDDEN below: hid 1 and
    ours 1, the words are ours). The rest are counted in "unworded", never guessed
  * mechanics: the content set a map draws from. Its own name says what it is (All, IrradiatedOnly, QuestAreaOnly,
    DisallowAll), and what it lists is a named column; a map with no set says nothing and gets nothing
  * rolls: the weighted node modifiers (Essence Trove, Water Influence ...) with their weight, and the group each
    sits in. The group is a column dat-schema does not name: flagged Subject to change. That the pool is shared by
    every map drawing from the All set is ours, and flagged the same way. A weight row that lists biomes holds in
    those biomes only (Grass Influence: Water, Mountain, Forest, Swamp, Desert), so each map carries its own list
    of the ones that can roll on it (influences)
  * corruption: every line a corrupted node can add, with its weight, and its share of the pool. That the fifteen
    lines are one pool is not verified: the share carries Subject to change. The cleansed weight is an unnamed
    column: Subject to change on every cleansed row

Run after tools/datpull.mjs:   python tools/atlascontent.py            write data/atlascontent.json
                               python tools/atlascontent.py --report   count, write nothing
"""
import argparse
import datetime as dt
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardnames  # noqa: E402
import lastgood  # noqa: E402

OUT = 'atlascontent.json'
FLAG = cardnames.FLAG
# A stat a map carries and the game never shows, worded here only where the stat's own name says it outright
# (the same words tools/areas.py uses for the area card, #72)
HIDDEN = {
    'map_drop_no_league_tablets': 'Tablets for league content do not drop here',
    'map_block_ritual_at_boss_area': 'No Ritual in the boss area',
    'map_disable_portal_use': 'Portals cannot be used',
    'map_force_human_players_when_loading_in': 'You arrive in human form',
}
# the content sets, in words: what each one's own name says
SETS = {'All': 'any', 'DisallowAll': 'none'}


def keyword_card(name, kw):
    """The keyword card a content name answers to: its own name, or the name without a plural s."""
    for n in (name, name[:-1] if name.endswith('s') else None):
        if n and n in kw:
            return n
    return None


def build(areas_arg=None):
    maps, source = cardnames.game('endgame_maps')
    content, _ = cardnames.game('map_content')
    corrupt, _ = cardnames.game('atlas_corruption')
    kw = set(cardnames.index().get('w', {}))
    boss_areas, _ = cardnames.bosses()
    areas, areas_from = cardnames.areas(areas_arg)
    area_names = {a['n'] for a in areas}

    # a hidden stat the game words elsewhere: a content line whose only stat it is (the game's words)
    worded = {}
    for c in content:
        h = c.get('hidden') or {}
        if len(h) == 1 and c.get('text'):
            worded.setdefault(next(iter(h)), c['text'])

    pool, influence, nodes = [], [], []
    for c in content:
        ws = c.get('weights') or []
        if not ws:
            nodes.append({k: v for k, v in {'name': c['name'], 'text': c.get('text'),
                                            'card': keyword_card(c['name'], kw)}.items() if v})
            continue
        for w in ws:
            row = {'name': c['name'], 'text': c.get('text'), 'weight': w['weight'], 'group': w.get('set', 0)}
            if w.get('biomes'):
                row['biomes'] = w['biomes']
                influence.append(row)
            pool.append(row)

    out, unworded, sets = [], Counter(), Counter()
    for m in maps:
        e = {'name': m['name'], 'id': m['id'], 'level': m.get('level')}
        if m.get('unique'):
            e['unique'] = 1
        if m['name'] in area_names:
            e['area'] = 1
        for k in ('biomes', 'nearBiomes', 'boss'):
            if m.get(k):
                e[k] = m[k]
        cards = [b for b in m.get('boss') or [] if b in boss_areas]
        if cards:
            e['bossCards'] = cards
        mods = [{'t': t} for t in m.get('text') or []]
        for stat, v in (m.get('hidden') or {}).items():
            if stat in worded and v:
                mods.append({'t': worded[stat], 'hid': 1})
            elif stat in HIDDEN and v:
                mods.append({'t': HIDDEN[stat], 'hid': 1, 'ours': 1})
            else:
                unworded[stat] += 1
                e['unworded'] = e.get('unworded', 0) + 1
        if mods:
            e['mods'] = mods
        if m.get('set'):
            sets[m['set']] += 1
            if m['set'] in SETS:
                e['mechanics'] = SETS[m['set']]
            elif m.get('setFlag'):
                # a set with the unnamed switch on that lists content: whether it keeps or bars them is not known
                e['mechanics'] = {'names': m.get('setContent') or [], 'flag': FLAG}
            else:
                e['mechanics'] = m.get('setContent') or []
            if m['set'] == 'All':
                own = [r['name'] for r in influence if set(r['biomes']) & set(m.get('biomes') or [])]
                if own:
                    e['influences'] = own
        if m.get('content'):
            e['fixed'] = m['content']
        for k in ('flavour', 'objective'):
            if m.get(k):
                e[k] = m[k]
        if m.get('special'):
            e['special'] = m['special']
        out.append(e)

    def weighed(rows, kind, flag_weight):
        rs = [r for r in rows if r['kind'] == kind]
        total = sum(r.get('weight') or 0 for r in rs)
        lines = []
        for r in rs:
            x = {'text': r.get('text') or [], 'weight': r.get('weight') or 0}
            if total and x['weight']:
                x['share'] = round(x['weight'] / total, 4)
            if not x['text'] and not r.get('hidden'):
                x['nothing'] = 1            # every stat at 0: the node is corrupted and gains no line
            elif not x['text']:
                x['unworded'] = 1
            lines.append(x)
        return {'total': total, 'flag': FLAG,
                'why': ('The weight is read from a column dat-schema does not name. ' if flag_weight else '') +
                       'That these lines roll from one pool is not verified, so a share may be off.',
                'lines': lines}

    by_mech = {}
    for e in out:
        if isinstance(e.get('mechanics'), list):
            for n in e['mechanics']:
                by_mech.setdefault(n, []).append(e['name'])
    return {'source': source, 'updated': dt.date.today().isoformat(), 'ids': ['id', 'hidden'], 'flags': cardnames.FLAGS,
            'sources': [source + ' (EndgameMaps, EndgameMapLocations, EndgameMapBiomes, EndgameMapContentSet, '
                                 'EndgameMapContent, EndgameMapContentWeightings, EndgameCorruptionMods, '
                                 'EndgameCleansedMods, WorldAreas)'] +
                       (['the areas file (' + areas_from + ')'] if areas_from else []),
            'counts': {'maps': len(out), 'sets': dict(sets), 'withBoss': sum(1 for e in out if e.get('boss')),
                       'unique': sum(1 for e in out if e.get('unique')), 'unworded': sum(unworded.values()),
                       'pool': len(pool), 'nodes': len(nodes)},
            'hidden': dict(unworded),       # the stats left unworded, by id, and on how many maps
            'nodes': nodes,
            'rolls': {'flag': FLAG, 'why': 'The group is a column dat-schema does not name, and that every map '
                                           'drawing from the All set shares this pool is not verified.',
                      'lines': pool},
            'onlyOn': by_mech,
            'corruption': {'corrupted': weighed(corrupt, 'Corrupted', False),
                           'cleansed': weighed(corrupt, 'Cleansed', True)},
            'maps': out}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--report', action='store_true', help='count and say, write nothing')
    ap.add_argument('--areas', help='another copy of data/areas.json')
    a = ap.parse_args()
    doc = lastgood.pull('Atlas content', lambda: build(a.areas), file=OUT, at='maps')
    if doc is None:
        return lastgood.report()
    print('atlas content:', doc['counts'])
    if not a.report:
        print('  wrote data/%s, %s bytes' % (OUT, format(cardnames.write(OUT, doc), ',')))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Atlas content', file=OUT))
