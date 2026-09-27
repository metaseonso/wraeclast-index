"""What changed between two patches, by data: every card field that moved, every card that came and went.

    python tools/diff.py <old> <new>          write data/changes/<new build>.json
    python tools/diff.py <old> <new> --out F  somewhere else
    python tools/diff.py ... --levels all     a gem's text at every level that moved (default: level 1, level 20,
                                              its last level, or the first level that moved when none of those did)
    python tools/diff.py --check [DIR]        the check on data/changes (or DIR); writes nothing

<old> and <new> are snapshots (tools/snapshot.py): a folder, or a client build number, which is downloaded
from the data repo when it is not in tools/cache/snapshots/ yet.

data/changes/<build>.json:
  from, to        the two snapshots: build, patch family, when each was taken
  count           how many cards changed, came and went
  changed         {card key: {field: [old, new]}}: a card key is "<kind>:<id>", the same pair data/index.json
                  carries; a field is the index's own name for it (ls lines, pr properties, rq requirements, t
                  text, n name ...) or, for a gem's text at one level, lv<level> with that level's lines
  added           {card key: name}: cards the new patch has and the old one did not
  removed         {card key: name}: cards the new patch no longer has. The name stays, because the card is not
                  in the index any more and "Removed in 0.x" has to say what was removed.
Only what the game moved is in it: the fields that only draw a card are never in a snapshot. Prices never are.
One file per patch, fetched the first time a card asks for it, never in first paint.

The check (also run by .github/workflows/checks.yml): every change row names a card data/index.json has, or one
a change file marks removed; every removed card keeps a name; and no value carries raw game code (stat ids,
[a|b] markup, {0} placeholders), the same marks tools/dev/guard.mjs looks for.
"""
import argparse
import datetime as dt
import json
import re
import sys
from pathlib import Path

import snapshot

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
CHANGES = DATA / 'changes'
SAMPLE = (1, 20)            # the levels a player reads a gem at, plus its last one
MARKS = [                   # tools/dev/guard.mjs MARKS
    ('stat id', re.compile(r'(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])')),
    ('[a|b] markup', re.compile(r'\[[^\]|]{1,60}\|[^\]]{1,60}\](?!\()')),
    ('[Tag] markup', re.compile(r'\[[A-Z][A-Za-z]{2,}\](?!\()')),
    ('{0} placeholder', re.compile(r'\{\d*(?::[^}]{0,12})?\}')),
    ('%1$s template', re.compile(r'%\d+\$[sd]')),
    ('DNT marker', re.compile(r'\bDNT[-\w]*')),
]


def at_level(lv, n):
    """A gem's lines at one level, from its snapshot's per-line lists."""
    return [s[n - 1] for s in lv or [] if len(s) >= n and s[n - 1]]


def levels(old, new, every):
    """{lv<n>: [old lines, new lines]} for the levels that moved."""
    top = max([len(s) for s in (old or []) + (new or [])] or [0])
    moved = [n for n in range(1, top + 1) if at_level(old, n) != at_level(new, n)]
    if not moved:
        return {}
    if not every:
        pick = [n for n in (*SAMPLE, top) if n in moved]
        moved = sorted(set(pick)) or moved[:1]
    return {'lv%d' % n: [at_level(old, n), at_level(new, n)] for n in moved}


def diff(a, b, every=False):
    """The change file's body, from two loaded snapshots."""
    changed, added, removed = {}, {}, {}
    for k in sorted(set(a['kinds']) | set(b['kinds'])):
        old, new = a['kinds'].get(k, {}), b['kinds'].get(k, {})
        for cid in sorted(set(old) | set(new)):
            key = '%s:%s' % (k, cid)
            if cid not in new:
                removed[key] = old[cid].get('n') or cid
                continue
            if cid not in old:
                added[key] = new[cid].get('n') or cid
                continue
            o, n = old[cid], new[cid]
            rows = {}
            for f in sorted(set(o) | set(n)):
                if f == 'lv':
                    rows.update(levels(o.get('lv'), n.get('lv'), every))
                elif o.get(f) != n.get(f):
                    rows[f] = [o.get(f), n.get(f)]
            if rows:
                changed[key] = rows
    side = lambda s: {x: s['meta'].get(x) for x in ('build', 'patch', 'taken')}
    return {'from': side(a), 'to': side(b), 'made': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
            'tool': 'tools/diff.py', 'levels': 'all' if every else 'sampled',
            'count': {'changed': len(changed), 'added': len(added), 'removed': len(removed)},
            'changed': changed, 'added': added, 'removed': removed}


# ---------------------------------------------------------------- the check
def strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, list):
        for x in v:
            yield from strings(x)
    elif isinstance(v, dict):
        for x in v.values():
            yield from strings(x)


def check(folder=CHANGES, index_file=DATA / 'index.json'):
    """Every problem in the change files, as plain lines, and how many files and rows were read."""
    files = sorted(Path(folder).glob('*.json'))
    if not files:
        return [], 0, 0
    have = {'%s:%s' % (it['k'], it['id']) for it in json.loads(Path(index_file).read_text(encoding='utf-8'))['items']}
    bodies, bad = {}, []
    for f in files:
        try:
            bodies[f.name] = json.loads(f.read_text(encoding='utf-8'))
        except ValueError as e:
            bad.append('%s does not read: %s' % (f.name, e))
    gone = {k for b in bodies.values() for k in (b.get('removed') or {})}
    rows = 0
    for name, b in bodies.items():
        for part in ('changed', 'added', 'removed'):
            if not isinstance(b.get(part), dict):
                bad.append('%s has no %s table' % (name, part))
        for key in [*(b.get('changed') or {}), *(b.get('added') or {})]:
            rows += 1
            if key not in have and key not in gone:
                bad.append('%s: %s is not a card, and no change file marks it removed' % (name, key))
        for key, n in (b.get('removed') or {}).items():
            rows += 1
            if not isinstance(n, str) or not n.strip():
                bad.append('%s: removed %s has lost its name' % (name, key))
        for key, fields in (b.get('changed') or {}).items():
            for f, pair in fields.items():
                if not (isinstance(pair, list) and len(pair) == 2):
                    bad.append('%s: %s %s is not [old, new]' % (name, key, f))
                    continue
                for s in strings(pair):
                    hit = next((m for m, pat in MARKS if pat.search(s)), None)
                    if hit:
                        bad.append('%s: %s %s carries a %s: %s' % (name, key, f, hit, s[:80]))
                        break
    return bad, len(files), rows


def main():
    ap = argparse.ArgumentParser(description='What changed between two snapshots.')
    ap.add_argument('old', nargs='?')
    ap.add_argument('new', nargs='?')
    ap.add_argument('--out', help='the file to write (default data/changes/<new build>.json)')
    ap.add_argument('--levels', choices=('sampled', 'all'), default='sampled')
    ap.add_argument('--check', nargs='?', const=str(CHANGES), metavar='DIR', help='check the change files')
    args = ap.parse_args()
    if args.check:
        bad, n, rows = check(args.check)
        for b in bad[:40]:
            print('  ' + b)
        print('changes: %d files, %d rows, %s' % (n, rows, 'ok' if not bad else '%d FAIL' % len(bad)))
        return 1 if bad else 0
    if not args.old or not args.new:
        ap.error('give two snapshots, old then new')
    a, b = snapshot.load(args.old), snapshot.load(args.new)
    if a['meta']['build'] == b['meta']['build']:
        print('note: both snapshots are build %s' % a['meta']['build'])
    body = diff(a, b, every=args.levels == 'all')
    out = Path(args.out) if args.out else CHANGES / ('%s.json' % b['meta']['build'])
    out.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(body, ensure_ascii=False, separators=(',', ':'))
    out.write_text(text + '\n', encoding='utf-8', newline='\n')
    c = body['count']
    print('%s -> %s: %d changed, %d added, %d removed -> %s (%.0f KB)' % (
        a['meta']['build'], b['meta']['build'], c['changed'], c['added'], c['removed'], out, len(text) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
