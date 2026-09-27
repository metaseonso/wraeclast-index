"""The timeless jewels, from the game files: the drill-down's jewel file (data/explore/jewels.*.json), without the artifact.

A timeless jewel conquers the passives in its radius for one faction, in the name of one of its conquerors.
The game writes the jewel's top line from four stats of its one mod: the version (the faction), the seed (the
number in the line), the keystone index (the conqueror) and an internal revision (a later conqueror that took
over an old index). The drill-down shows each conqueror's line and the seed range each jewel rolls.

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
  mods.min.json                                  the UniqueJewelAlternateTreeInRadius* mods: each one's version,
                                                 seed, keystone and radius stats with their ranges
  stat_translations/stat_descriptions.min.json   the entry for those four stats: one wording per conqueror,
                                                 each with the version, keystone and revision it needs

Every value comes from the game files; nothing is carried over from the committed copy (old is not read).

  rows[]    one per wording of the entry, in the game's order
    ver       the version the wording needs (condition 0)
    idx       the keystone index it needs (condition 2)
    rev       the revision it needs (condition 3): [min, max], max None when open, None when any revision
    text      its first line, the {1} left for the seed
    faction   its second line, "Passives in radius are Conquered by the <faction>"
    conqueror the name that ends the first line (its closing run of capitalised words)
  seeds     per version: the mod, and the seed, keystone and radius ranges it rolls

Usage:
  python tools/jewels.py            build and print the counts, write nothing
  (tools/sync.py --from-game writes it; tools/dev/explorecmp.py jewels holds it up against the committed copy)
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import official  # noqa: E402

VERSION = 'local_unique_jewel_alternate_tree_version'
SEED = 'local_unique_jewel_alternate_tree_seed'
KEYSTONE = 'local_unique_jewel_alternate_tree_keystone'
RADIUS = 'local_jewel_effect_base_radius'
MOD = 'UniqueJewelAlternateTreeInRadius'
FACTION = re.compile(r'Passives in radius are Conquered by the (.+)$')
NAME = re.compile(r'((?:[A-Z][\w\'-]*\s?)+)$')   # the closing run of capitalised words: "High Templar Venarius"


def span(stat):
    return [stat['min'], stat['max']]


def cond(c):
    """One condition as the artifact wrote a range: None when it asks nothing, else [min, max or None]."""
    if not c:
        return None
    return [c.get('min'), c.get('max')]


def build(old=None):
    entry = next((e for e in official('stat_translations/stat_descriptions.min.json') if e['ids'][0] == VERSION), None)
    if not entry or entry['ids'][2] != KEYSTONE:
        raise SystemExit('jewels: the timeless jewel wording is not in the stat descriptions any more')
    rows = []
    for w in entry['English']:
        c = w['condition']
        lines = w['string'].split('\n')
        m = FACTION.match(lines[1] if len(lines) > 1 else '')
        name = NAME.search(lines[0])
        if not m or not name or c[0].get('min') != c[0].get('max') or c[2].get('min') != c[2].get('max'):
            raise SystemExit('jewels: a timeless jewel line the builder cannot read: %r' % w['string'])
        rows.append({'ver': c[0]['min'], 'idx': c[2]['min'], 'faction': m.group(1),
                     'conqueror': name.group(1).strip(), 'rev': cond(c[3] if len(c) > 3 else {}),
                     'text': lines[0]})
    seeds = {}
    for mid, mod in official('mods.min.json').items():
        if not mid.startswith(MOD):
            continue
        st = {s['id']: s for s in mod['stats']}
        if VERSION not in st:
            continue
        seeds[st[VERSION]['min']] = {'mod': mid, 'seed': span(st[SEED]), 'idx': span(st[KEYSTONE]),
                                     'radius': span(st[RADIUS])}
    return {'rows': rows, 'seeds': {str(v): seeds[v] for v in sorted(seeds)}}


def main():
    out = build()
    factions = []
    for r in out['rows']:
        if r['faction'] not in factions:
            factions.append(r['faction'])
    print('timeless jewels from the game files: %d conqueror lines, %d jewels (%s)'
          % (len(out['rows']), len(out['seeds']), ', '.join(factions)))


if __name__ == '__main__':
    main()
