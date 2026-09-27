"""The keywords the drill-down links to, from the game files: data/explore/keywords.*.json, without the artifact.

A keyword is a word the game marks in its own text ([Ignite], [Charges|Power Charges]); hovering it in game
opens a short help text. The drill-down carries every keyword its gems, uniques and passives mark, with that
help text and how many of each link to it.

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
  keywords.min.json   each keyword's name (term) and help text (definition), the game's own words
and the other four blocks of the drill-down, built first (tools/fromgame.py ORDER), for which keywords they
mark and how often. A keystone is marked in unique text by its passive id; its keyword card is the keystone's
own name and lines from the passive tree block.

Built last, from the blocks built before it (NEEDS_BLOCKS). The rows are in the order the blocks first mark
them: gems, then uniques, then passives.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import official  # noqa: E402

NEEDS_BLOCKS = True
KWREF = re.compile(r'\[([A-Za-z][A-Za-z0-9_-]*)(?:\|[^\]]*)?\]')
KEYSTONE = 'passive_keystone_'
# which rows of each block count, and the fields a row marks keywords in (its kw list, made by its builder)
GROUPS = (('gems', 'gemdata', 'gems'), ('uniques', 'uqdata', 'items'), ('passives', 'trdata', 'passives'))


def spaced(k):
    """A key the game has no keyword entry for, as words: the capitals split out, as the artifact did."""
    return re.sub(r'(?<!^)([A-Z])', r' \1', k)


def build(old=None, built=None):
    built = built or {}
    export = official('keywords.min.json')
    tree = (built.get('trdata') or {}).get('passives') or []
    keystones = {p['id']: p for p in tree if p.get('k') == 'keystone'}
    counts, order = {}, []
    for group, bid, at in GROUPS:
        rows = list((built.get(bid) or {}).get(at) or [])
        if bid == 'gemdata':
            rows += (built.get(bid) or {}).get('dropped') or []   # already settled by tools/sync.py: still counted
        for r in rows:
            for k in r.get('kw') or []:
                if k not in counts:
                    counts[k] = {}
                    order.append(k)
                counts[k][group] = counts[k].get(group, 0) + 1
    out = {}
    for k in order:
        e = export.get(k) or {}
        if k.startswith(KEYSTONE) and k[len(KEYSTONE):] in keystones or k in keystones:
            p = keystones.get(k[len(KEYSTONE):]) or keystones[k]
            row = {'t': p['n'], 'd': '\n'.join(p.get('t') or [])}
        elif e.get('term'):
            row = {'t': e['term'], 'd': (e.get('definition') or '').replace('\r\n', '\n').strip()}
        else:
            row = {'t': spaced(k), 'd': ''}
        row['n'] = counts[k]
        row['c'] = sum(counts[k].values())
        if k.startswith(KEYSTONE):
            row['ks'] = 1
        out[k] = row
    return out


def main():
    import fromgame
    got = fromgame.blocks()['kwdata']
    print('keywords the drill-down links to: %d (%d with the game\'s own help text)'
          % (len(got), sum(1 for v in got.values() if v['d'])))


if __name__ == '__main__':
    main()
