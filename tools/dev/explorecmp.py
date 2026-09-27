"""The drill-down's data built from the game files, held up against the committed copy, field by field.

tools/sync.py --from-game builds data/explore/ from the export (tools/gems.py and the builders beside it)
instead of the saved artifact. Before any of it replaces what is committed, this says how close it is:
for every block, every field of every row, how many rows match exactly, how many differ, and how many are
only on one side. A field under 100% prints its first differences, so each one can be explained.

Nothing is written. It reads the committed files explore.html names, and builds the new ones in memory.

Usage:
  python tools/dev/explorecmp.py                 every block
  python tools/dev/explorecmp.py gems tree       only these (gems, uniques, tree, jewels, keywords)
  python tools/dev/explorecmp.py gems --show 8   more examples per field (default 3)
  python tools/dev/explorecmp.py gems --field ss.tx   only that field's examples
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import fromgame  # noqa: E402
from sync import ROOT, data_files, whole  # noqa: E402

# block -> (explore.html's block id, the rows inside it, the key a row is matched on)
BLOCKS = {
    'gems': ('gemdata', 'gems', lambda r: r['id']),
    'uniques': ('uqdata', 'items', lambda r: '%s | %s | %s' % (r['n'], r.get('b'), (r.get('ex') or [''])[-1:])),
    'tree': ('trdata', 'passives', lambda r: r['id']),
    'keywords': ('kwdata', None, None),
    'jewels': ('jwdata', 'rows', lambda r: '%s.%s.%s' % (r['ver'], r['idx'], r['conqueror'])),
}
# fields held inside each row that are rows of their own, compared one level down
NESTED = {'gems': {'ss': lambda s: s['id']}}


def committed(block):
    files = data_files((ROOT / 'explore.html').read_text(encoding='utf-8'))
    f = files[BLOCKS[block][0]]
    return whole(BLOCKS[block][0], json.loads((ROOT / f).read_text(encoding='utf-8')), files)


def short(v, n=220):
    s = json.dumps(v, ensure_ascii=False)
    return s if len(s) <= n else s[:n] + '…'


class Tally:
    def __init__(self):
        self.f = {}

    def add(self, field, verdict, key, old=None, new=None):
        t = self.f.setdefault(field, {'same': 0, 'diff': 0, 'old only': 0, 'new only': 0, 'ex': []})
        t[verdict] += 1
        if verdict != 'same':
            t['ex'].append((verdict, key, old, new))

    def rows(self, pairs, block, prefix=''):
        """pairs: key -> (old row or None, new row or None)"""
        nested = NESTED.get(block, {}) if not prefix else {}
        for key, (o, n) in pairs.items():
            if o is None or n is None:
                self.add(prefix + '(row)', 'new only' if o is None else 'old only', key)
                continue
            self.add(prefix + '(row)', 'same', key)
            for f in sorted(set(o) | set(n)):
                if f in nested and isinstance(o.get(f, []), list) and isinstance(n.get(f, []), list):
                    kf = nested[f]
                    sub = {}
                    for i, s in enumerate(o.get(f) or []):
                        sub.setdefault('%s/%s' % (key, kf(s)), [None, None])[0] = s
                    for s in n.get(f) or []:
                        sub.setdefault('%s/%s' % (key, kf(s)), [None, None])[1] = s
                    order_same = [kf(s) for s in o.get(f) or []] == [kf(s) for s in n.get(f) or []]
                    self.add(f + '(order)', 'same' if order_same else 'diff', key,
                             [kf(s) for s in o.get(f) or []], [kf(s) for s in n.get(f) or []])
                    self.rows({k: tuple(v) for k, v in sub.items()}, block, f + '.')
                    continue
                if f not in o:
                    self.add(prefix + f, 'new only', key, None, n[f])
                elif f not in n:
                    self.add(prefix + f, 'old only', key, o[f], None)
                else:
                    self.add(prefix + f, 'same' if o[f] == n[f] else 'diff', key, o[f], n[f])

    def print(self, show, only=None):
        width = max([len(f) for f in self.f] + [5])
        print('  %-*s %7s %6s %6s %8s %8s' % (width, 'field', 'match', 'same', 'diff', 'old only', 'new only'))
        for f in sorted(self.f, key=lambda x: (x.split('.')[0] != '(row)', x)):
            t = self.f[f]
            total = t['same'] + t['diff'] + t['old only'] + t['new only']
            print('  %-*s %6.1f%% %6d %6d %8d %8d' % (width, f, 100.0 * t['same'] / total if total else 100,
                                                    t['same'], t['diff'], t['old only'], t['new only']))
        for f in sorted(self.f):
            if only and f != only:
                continue
            for verdict, key, o, n in self.f[f]['ex'][:show]:
                print('    %s %s [%s]' % (f, verdict, key))
                if isinstance(o, dict) and isinstance(n, dict):   # only the keys that differ
                    ks = [k for k in list(o) + [k for k in n if k not in o] if o.get(k, '(none)') != n.get(k, '(none)')]
                    o, n = {k: o.get(k, '(none)') for k in ks}, {k: n.get(k, '(none)') for k in ks}
                if o is not None:
                    print('      old', short(o))
                if n is not None:
                    print('      new', short(n))


def compare(block, show=3, only=None):
    bid, at, key = BLOCKS[block]
    old = committed(block)
    new = fromgame.build(block)
    print('== %s' % block)
    t = Tally()
    if at is None:   # keywords: a map of rows by key
        pairs = {k: (old.get(k), new.get(k)) for k in set(old) | set(new)}
    else:
        pairs = {}
        for r in old.get(at) or []:
            pairs.setdefault(key(r), [None, None])[0] = r
        for r in new.get(at) or []:
            pairs.setdefault(key(r), [None, None])[1] = r
        pairs = {k: tuple(v) for k, v in pairs.items()}
        # the parts beside the rows (meta, tags, sprites, ...) compared whole
        for f in sorted((set(old) | set(new)) - {at}):
            t.add('<%s>' % f, 'same' if old.get(f) == new.get(f) else
                  ('new only' if f not in old else 'old only' if f not in new else 'diff'), f, old.get(f), new.get(f))
        order = [key(r) for r in old.get(at) or []] == [key(r) for r in new.get(at) or []]
        t.add('<row order>', 'same' if order else 'diff', at)
    t.rows(pairs, block)
    t.print(show, only)
    return t


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument('blocks', nargs='*', default=list(BLOCKS))
    ap.add_argument('--show', type=int, default=3)
    ap.add_argument('--field')
    a = ap.parse_args()
    for b in a.blocks:
        compare(b, a.show, a.field)


if __name__ == '__main__':
    main()
