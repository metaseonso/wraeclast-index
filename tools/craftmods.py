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

The question is asked ranked — which kind of item carries this modifier best — so each kind carries its
best tier, the item level that tier needs and its share of that side, worked out here rather than by the
browser fetching 31 class files to find out.

Output (compact; the same wording the class files carry, with the roll numbers left out):
  v     the game patch the class files were built from
  gen   the day this was built
  cl    item class ids, in data/craft.json's order
  m     [side, [lines], [tags], kind, [on], [tiers]]
        side: 'p' prefix, 's' suffix, '' neither (a corruption's implicit)
        kind: '' it rolls, 'd' a desecration adds it, 'c' a corruption adds it
        on:    [class, lowest modifier level, 1 where an essence guarantees it,
                the best tier as an index into tiers (-1: none), the level that tier needs,
                its share of that side in hundredths of a percent (0: nothing measured)]
        tiers: the best tier's own lines, once per wording — a bow's best roll is not a staff's
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


def best_in(d, pool, at, fam, top):
    """The family's best tier in one pool, and what that tier is worth there.

    Tiers sit in the pool lowest first, so the best one is the last — the same reading the Craft tab does
    (T1 is the last). The share is the whole family's weight against everything its side can roll at the
    highest item level in the game, which is the share the tab prints beside the modifier. A pool nobody
    has measured has no weights, so it has no share either, and never a made-up one.
    """
    mods = d['mods']
    tiers = [i for i in pool.get(at) or [] if mods[i][1] == fam]
    if not tiers:
        return None
    best = tiers[-1]
    w = pool.get('w') if at == 'm' else None
    share = 0
    if w:
        side = d['fam'][fam][0]
        weight = sum(w[k] for k, i in enumerate(pool['m']) if mods[i][1] == fam and mods[i][2] <= top)
        whole = sum(w[k] for k, i in enumerate(pool['m'])
                    if d['fam'][mods[i][1]][0] == side and mods[i][2] <= top)
        if weight and whole:
            share = round(weight / whole * 10000)
    return {'lines': mods[best][3], 'lvl': mods[best][2], 'share': share}


def best_of(d, fam, kind, top):
    """The same, over every pool the class comes in: a body armour rolls one table in evasion and another in
    armour, and the answer is the pool that gives the modifier the most — its tier, that tier's level and its
    share, all read off the one pool so the three of them agree."""
    at = dict(KINDS)[kind]
    found = [x for x in (best_in(d, pool, at, fam, top) for pool in d['pools']) if x]
    return max(found, key=lambda x: (x['share'], x['lvl'])) if found else None


def build():
    craft = json.loads((DATA / 'craft.json').read_text(encoding='utf-8'))
    classes, top = craft['classes'], craft['ilvl']
    out = {}
    for at, cl in enumerate(classes):
        f = DATA / 'craft' / (cl['id'] + '.json')
        if not f.exists():
            print('no file for %s' % cl['id'], file=sys.stderr)
            continue
        d = json.loads(f.read_text(encoding='utf-8'))
        for fam, kind, lvl, guaranteed in rows_for(d):
            side, lines, tags = d['fam'][fam][0], d['fam'][fam][1], d['fam'][fam][2]
            row = out.setdefault((side, tuple(lines), kind), {'t': tags, 'c': [], 'b': []})
            best = best_of(d, fam, kind, top)
            tier = -1
            if best:
                key = tuple(best['lines'])
                if key not in row['b']:
                    row['b'].append(key)
                tier = row['b'].index(key)
            on = [at, lvl, 1 if guaranteed else 0, tier,
                  best['lvl'] if best else lvl, best['share'] if best else 0]
            while len(on) > 2 and not on[-1]:   # a nothing at the end is left off and read back as one
                on.pop()
            row['c'].append(on)
    mods = [[side, list(lines), row['t'], kind, row['c'], [list(b) for b in row['b']]]
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
