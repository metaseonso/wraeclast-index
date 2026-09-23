"""Build data/craftmods.json: one row per modifier, and every kind of item it can land on.

Run after tools/craft.py (it reads nothing else):   python tools/craftmods.py

The Craft tab's second question is "how do I get this mod", which is asked without a base in hand, so it
needs the modifiers of every item class at once. The item class files hold that already — 31 of them,
1.5 MB — so this turns them into the one small table the question needs: the modifier's own wording, its
side, its tags, and the kinds of item that can carry it. 59 KB, fetched the first time that question is
asked and never in first paint.

Nothing is added here that the class files do not already say, and nothing official is read a second time:
data/craft.json and data/craft/<kind>.json come from the game files (tools/craft.py), and this is those
files, turned inside out.

Output (compact; the same wording the class files carry, with the roll numbers left out):
  v     the game patch the class files were built from
  gen   the day this was built
  cl    item class ids, in data/craft.json's order
  m     [side, [lines], [tags], kind, [[class, lowest modifier level, 1 where an essence guarantees it]]]
        side: 'p' prefix, 's' suffix, '' neither (a corruption's implicit)
        kind: '' it rolls, 'd' a desecration adds it, 'c' a corruption adds it
A modifier that rolls on one kind of item and is desecrated on another is two rows, because those are two
different answers to the question.
"""
import json
import sys
import time
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
OUT = DATA / 'craftmods.json'
KINDS = (('', 'm'), ('d', 'd'), ('c', 'c'))   # what we call it -> the pool list it is in


def rows_for(d):
    """Per modifier family of one item class: the kinds it appears as, and the lowest level it does so at."""
    ess = {d['mods'][e[2]][1] for e in d.get('ess') or []}
    seen = {}
    for pool in d['pools']:
        for kind, at in KINDS:
            for i in pool.get(at) or []:
                mod = d['mods'][i]
                key = (mod[1], kind)
                if key not in seen or mod[2] < seen[key]:
                    seen[key] = mod[2]
    return [(fam, kind, lvl, fam in ess) for (fam, kind), lvl in seen.items()]


def build():
    craft = json.loads((DATA / 'craft.json').read_text(encoding='utf-8'))
    classes = craft['classes']
    out = {}
    for at, cl in enumerate(classes):
        f = DATA / 'craft' / (cl['id'] + '.json')
        if not f.exists():
            print('no file for %s' % cl['id'], file=sys.stderr)
            continue
        d = json.loads(f.read_text(encoding='utf-8'))
        for fam, kind, lvl, guaranteed in rows_for(d):
            side, lines, tags = d['fam'][fam][0], d['fam'][fam][1], d['fam'][fam][2]
            row = out.setdefault((side, tuple(lines), kind), {'t': tags, 'c': []})
            row['c'].append([at, lvl, 1] if guaranteed else [at, lvl])
    mods = [[side, list(lines), row['t'], kind, row['c']]
            for (side, lines, kind), row in sorted(out.items(), key=lambda x: (x[0][1], x[0][0], x[0][2]))]
    return {'v': craft['patch'], 'gen': time.strftime('%Y-%m-%d'),
            'cl': [c['id'] for c in classes], 'm': mods}


def main():
    data = build()
    if not data['m']:
        print('nothing to write: the item class files hold no modifiers', file=sys.stderr)
        return 1
    lastgood.save(OUT, json.dumps(data, ensure_ascii=False, separators=(',', ':')))
    print('%d modifiers over %d kinds of item · %.0f KB -> data/craftmods.json' % (
        len(data['m']), len(data['cl']), OUT.stat().st_size / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
