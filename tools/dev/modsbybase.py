"""The Craft tab's tables held up against the game's own list of which modifiers roll on which base.

data/craft/<class>.json (tools/craft.py) works out each base's pool from the modifiers' spawn tags. The export
carries the game's own answer beside it: mods_by_base.min.json, per item class and tag set, the bases and every
modifier that rolls on them with its level (RePoE works it out from the same files, with the game's own spawn
rules). This reads both and says where they part, per base: a modifier only one side rolls, or the same
modifier at another level. Run it on each patch; a mismatch is either the craft table or the export moving, and
either way it is a thing to look at before the Craft tab shows it.

What is compared, per base in data/craft/: its pool's rolling modifiers ("m") against the export's prefix and
suffix lists, and its corruption modifiers ("c") against the export's corrupted list. Not compared: desecrated
modifiers ("d"), which the export lists in a domain of their own and not per base, and essence-only ones.
Left out, and counted: a base whose own implicit adds spawn tags (Grasping Mail's "Can roll Ring Modifiers" adds
ring and two more). The export's per-base list is worked out from the base's own tags only, so for those it is
not the game's answer; the craft table's is (the added tags, then each modifier's first matching tag).

Nothing is fetched and nothing is written: it reads the copies tools/gamepull.py keeps in tools/cache/official.
Where those are not here (a fresh checkout), it says so and passes; --pull fetches them first.

Usage:
  python tools/dev/modsbybase.py            the report; exit 1 on any mismatch
  python tools/dev/modsbybase.py --quiet    one line (the guard's)
  python tools/dev/modsbybase.py --pull     fetch the two export files first if they are not here
"""
import argparse
import glob
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
import gamepull  # noqa: E402

ROOT = HERE.parent.parent
FILES = ('mods_by_base.min.json', 'base_items.min.json', 'mods.min.json')
ROLLS = ('prefix', 'suffix')


def load(pull):
    """The two export files, from the cache; None when they are not here and --pull was not given."""
    if not pull and not all(gamepull._file(n).exists() for n in FILES):
        return None
    return [gamepull.official(n) for n in FILES]


def flat(v, gens):
    """mod id -> level, over the export's lists of one base's tag set."""
    out = {}
    for g in gens:
        for group in (v.get('mods') or {}).get(g, {}).values():
            out.update(group)
    return out


def compare():
    got = load(ARGS.pull)
    if got is None:
        return None
    by_base, bases, all_mods = got
    where = {}
    for sets in by_base.values():
        for v in sets.values():
            for b in v['bases']:
                where[b] = v
    path, adds = defaultdict(list), set()
    for p, b in bases.items():
        if b.get('name') and p in where:
            path[b['name']].append(p)
            if any((all_mods.get(m) or {}).get('adds_tags') for m in b.get('implicits') or []):
                adds.add(p)
    out, seen = defaultdict(list), Counter()
    for f in sorted(glob.glob(str(ROOT / 'data' / 'craft' / '*.json'))):
        d = json.loads(Path(f).read_text(encoding='utf-8'))
        mods, page = d['mods'], Path(f).stem
        for b in d['bases']:
            paths = path.get(b['n'])
            if not paths:
                out['no base in the export'].append((page, b['n'], ''))
                continue
            if paths[0] in adds:
                seen['added'] += 1
                continue
            v = where[paths[0]]
            game, cor = flat(v, ROLLS), flat(v, ('corrupted',))
            pool = d['pools'][b['p']]
            ours = {mods[i][0]: mods[i][2] for i in pool['m']}
            ourc = {mods[i][0]: mods[i][2] for i in pool.get('c') or []}
            seen['bases'] += 1
            for what, a, g in (('rolls', ours, game), ('corruption', ourc, cor)):
                for k in sorted(set(a) - set(g)):
                    out['%s: only the craft table has it' % what].append((page, b['n'], k))
                for k in sorted(set(g) - set(a)):
                    out['%s: only the export has it' % what].append((page, b['n'], k))
                for k in sorted(set(a) & set(g)):
                    if a[k] != g[k]:
                        out['%s: another level' % what].append((page, b['n'], '%s %s here, %s in the export' % (k, a[k], g[k])))
    return out, seen


def main():
    got = compare()
    if got is None:
        print('ok   modsbybase  no copy of %s here (tools/gamepull.py keeps them): nothing to compare' % ' or '.join(FILES))
        return 0
    out, seen = got
    n = sum(len(v) for v in out.values())
    head = '%s modsbybase  %d bases in data/craft against the export: %s' % (
        'ok  ' if not n else 'FAIL', seen['bases'],
        'every modifier and level the same' if not n else '%d mismatches (%s)' % (
            n, ', '.join('%d %s' % (len(v), k) for k, v in sorted(out.items()))))
    if seen['added']:
        head += ' · %d left out: their implicit adds spawn tags the export\'s list does not see' % seen['added']
    print(head)
    if not ARGS.quiet:
        for k, rows in sorted(out.items()):
            print('\n  %s: %d' % (k, len(rows)))
            per = Counter((p, b) for p, b, _ in rows)
            for (p, b), c in per.most_common(12):
                eg = [x for pp, bb, x in rows if (pp, bb) == (p, b) and x][:4]
                print('    %-16s %-34s %4d  %s' % (p, b, c, ', '.join(eg)))
    return 1 if n else 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser(description='Hold the craft tables up against the export\'s mods by base.')
    ap.add_argument('--quiet', action='store_true', help='one line')
    ap.add_argument('--pull', action='store_true', help='fetch the two export files first if they are not here')
    ARGS = ap.parse_args()
    sys.exit(main())
