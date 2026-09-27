"""What a patch changed, card by card: two snapshots (tools/snapshot.py) held side by side (#73, #96 W1).

For every card a patch touched, each line that moved: what it said before and what it says now, in the game's
own words ("Deals 224 to 336 Fire Damage" -> "Deals 250 to 370 Fire Damage", at level 20). The cards the patch
added, and the ones it took away, which keep a card marked "Removed in 0.5.5". Nothing is read from patch
notes: this is the data, so a change GGG never wrote down is here too (#86 puts the official note beside it).

A line is matched to its old self by its wording with the numbers taken out, so a number that moved is one
change, and a line reworded is the old line gone and the new one added. The order lines come in is not a
change. A gem is compared level by level and shown at level 20 (the level a gem drops at most), with the levels
the change reaches beside it.

Every change names a card by the same key the index uses ("g:SkillGemFireball", tools/sync.py): a card that
is in data/index.json, or one that is gone by the patch on the site now and so is marked removed in a later
patch's file. What the index does not card (a monster-only skill, a node with no effect) is counted, not shown.

Usage:
  python tools/diff.py                  the newest snapshot against the one before it
  python tools/diff.py 0.5.5            that patch against the one before it
  python tools/diff.py --all            every patch with a snapshot before it
  python tools/diff.py --old DIR --new DIR --out FILE    two snapshot folders, anywhere (tools/dev/changes.py)

Writes data/changes/<patch>.json, which the site fetches when a card is opened, never in first paint:

  v, was    this patch and the one it is held up against
  source    the kinds whose numbers are not the game's own files, and whose they are ("u": "poe2db")
  cards     card key: [[field, old, new, levels], ...]
              field   "" for the card's own lines; else what the line is ("Level 20", "Requires", "Implicit",
                      "Prefix", "Suffix", "Corrupted", "Desecrated prefix", "Name", "Drop level")
              old     what it said, or null for a line the patch added
              new     what it says, or null for a line the patch took away
              levels  gems only: the levels the change reaches ("1-40"), where it is not every level
  new       the cards the patch added
  gone      card key: [name, "Removed in <patch>", [what it said on its last patch]] for a card the patch
            took away, so it keeps a card with a body (a gem at level 20)
  tree      {new: [...], gone: [...]} passive tree node numbers the patch added and took away, the way a
            build names its passives: tools for telling which patch a build was made on (design/what-changed.md)
  n         per kind: cards changed, added, removed, and changes found on things the index does not card
  missing   the kinds one of the two snapshots does not have (the passive tree before 0.4, uniques before 0.5.5)
"""
import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / 'data' / 'history'
CHANGES = ROOT / 'data' / 'changes'
INDEX = ROOT / 'data' / 'index.json'
SHOW_AT = 20                     # the level a gem's change is shown at, where the change reaches it
LETTER = {'gems': 'g', 'passives': 'p', 'atlas': 'a', 'bases': 'b', 'mods': 'i', 'uniques': 'u'}
SOURCE = {'uniques': 'poe2db'}   # not the game's own files: the card says whose they are ("Source: poe2db")
AFFIX = {('p', 0): 'Prefix', ('s', 0): 'Suffix', ('c', 0): 'Corrupted', ('p', 1): 'Desecrated prefix',
         ('s', 1): 'Desecrated suffix'}
NUM = re.compile(r'(?<![\w.])-?\d+(?:\.\d+)?')

sys.path.insert(0, str(Path(__file__).resolve().parent))
from snapshot import key as patch_key, fill   # noqa: E402  (one reading of a snapshot, not two)


def wording(line):
    return NUM.sub('#', line)


def load(folder, kind):
    f = Path(folder) / (kind + '.json')
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else None


# ---------------------------------------------------------------- lines against lines

def pair(old, new):
    """Two lists of lines -> [(old line or None, new line or None)] for the lines that differ. Lines are matched
    on their wording with the numbers out, the same wording twice in order; what is left over on both sides is a
    line reworded, old beside new; order itself is no change."""
    def group(ls):
        g = {}
        for x in ls or []:
            g.setdefault(wording(x), []).append(x)
        return g
    a, b = group(old), group(new)
    out, lone = [], []
    for w in list(a) + [w for w in b if w not in a]:
        xs, ys = list(a.get(w, [])), list(b.get(w, []))
        for y in list(ys):
            if y in xs:   # the same line on both sides is no change, once for each time it is there
                xs.remove(y)
                ys.remove(y)
        for i in range(min(len(xs), len(ys))):
            out.append((xs[i], ys[i]))
        lone += [(x, None) for x in xs[len(ys):]] + [(None, y) for y in ys[len(xs):]]
    # a line reworded: what is left on each side, old beside new in the order they come
    olds, news = [o for o, _ in lone if o is not None], [n for _, n in lone if n is not None]
    for i in range(max(len(olds), len(news))):
        out.append((olds[i] if i < len(olds) else None, news[i] if i < len(news) else None))
    return out


def rows(field, old, new):
    return [[field, o, n] for o, n in pair(old, new)]


# ---------------------------------------------------------------- per kind

def spans(levels):
    """[1, 2, 3, 7, 8] -> "1-3, 7-8"."""
    out, run = [], []
    for n in levels:
        if run and n == run[-1] + 1:
            run.append(n)
        else:
            if run:
                out.append(run)
            run = [n]
    if run:
        out.append(run)
    return ', '.join('%d' % r[0] if len(r) == 1 else '%d-%d' % (r[0], r[-1]) for r in out)


def per_level(e):
    """A gem as {wording: [numbers at each level]}: its level lines as they are, and each line that reads the same
    at every level spread over every level, so a line that starts to scale with level is one change, not two."""
    ml = e.get('ml') or 1
    out = {}
    for x in e.get('st') or []:
        w, k = wording(x), 2
        while w in out:
            w, k = wording(x) + ' ' * k, k + 1
        nums = NUM.findall(x)
        out[w] = [nums] * ml
    for w, vals in (e.get('lv') or {}).items():
        while w in out:
            w += ' '
        out[w] = [None if v is None else [str(n) for n in (v if isinstance(v, list) else [v])] for v in vals]
    return out, ml


def gem_rows(a, b):
    out = []
    if a['n'] != b['n']:
        out.append(['Name', a['n'], b['n']])
    wa, mla = per_level(a)
    wb, mlb = per_level(b)
    top = max(mla, mlb)
    for w in list(wa) + [w for w in wb if w not in wa]:
        va, vb = wa.get(w, []), wb.get(w, [])
        at = lambda vs, n: vs[n - 1] if n - 1 < len(vs) else None
        moved = [n for n in range(1, top + 1) if at(va, n) != at(vb, n)]
        if not moved:
            continue
        n = SHOW_AT if SHOW_AT in moved else moved[0]
        text = lambda v: None if v is None else fill(w.rstrip(), v)
        same = lambda vs: len({json.dumps(v) for v in vs}) <= 1
        if top == 1 or same(va) and same(vb):   # the same at every level, before and after: the line itself
            out.append(['', text(at(va, n)), text(at(vb, n))])
            continue
        row = ['Level %d' % n, text(at(va, n)), text(at(vb, n))]
        if len(moved) < top:
            row.append(spans(moved))
        out.append(row)
    if mla != mlb and mla > 1 and mlb > 1:
        out.append(['Levels', str(mla), str(mlb)])
    return out


def lines_rows(a, b):
    out = [] if a.get('n') == b.get('n') else [['Name', a.get('n'), b.get('n')]]
    return out + rows('', a.get('ls'), b.get('ls'))


def requires(rq):
    if not rq:
        return None
    lv, s, d, i = (list(rq) + [0, 0, 0, 0])[:4]
    parts = (['Level %d' % lv] if lv else []) + ['%d %s' % (v, k) for v, k in ((s, 'Str'), (d, 'Dex'), (i, 'Int')) if v]
    return ', '.join(parts) or None


def base_rows(a, b):
    out = []
    if requires(a.get('rq')) != requires(b.get('rq')):
        out.append(['Requires', requires(a.get('rq')), requires(b.get('rq'))])
    if a.get('dl') != b.get('dl'):
        out.append(['Drop level', str(a.get('dl')) if a.get('dl') else None, str(b.get('dl')) if b.get('dl') else None])
    return out + rows('', a.get('pr'), b.get('pr')) + rows('Implicit', a.get('im'), b.get('im'))


def unique_rows(a, b):
    out = []
    if requires(a.get('rq')) != requires(b.get('rq')):
        out.append(['Requires', requires(a.get('rq')), requires(b.get('rq'))])
    return out + rows('', a.get('ls'), b.get('ls'))


def last(kind, e):
    """What a removed card said on its last patch, so its card still has a body: a gem at level 20."""
    if kind == 'gems':
        ml = e.get('ml') or 1
        n = min(SHOW_AT, ml)
        return list(e.get('st') or []) + [fill(w.rstrip(), v[n - 1]) for w, v in (e.get('lv') or {}).items()
                                          if len(v) >= n and v[n - 1] is not None]
    if kind == 'bases':
        return ([('Requires ' + requires(e['rq']))] if requires(e.get('rq')) else []) + list(e.get('pr') or []) + list(e.get('im') or [])
    return list(e.get('ls') or [])


def tier(m):
    return 'Modifier level %d: %s' % (m['lv'], ' / '.join(m['ls']))


# ---------------------------------------------------------------- cards

class Cards:
    """Which card a thing in a snapshot is. Keys are the index's own ("g:SkillGemFireball")."""

    def __init__(self, index_file, latest):
        items = json.loads(Path(index_file).read_text(encoding='utf-8'))['items']
        self.keys = {'%s:%s' % (it['k'], it['id']) for it in items}
        self.names = {}
        self.small = {}
        for it in items:
            self.names.setdefault((it['k'], it['n']), []).append('%s:%s' % (it['k'], it['id']))
            if it['k'] == 'p' and it.get('lo'):
                self.small[(it['n'], frozenset(it.get('ls') or []))] = 'p:' + it['id']
        self.latest = latest   # {kind: rows} of the snapshot of the patch on the site now

    def has(self, k):
        return k in self.keys

    def of(self, kind, k, e):
        """The card key for one snapshot entry, and whether the site cards it now (or it is gone by now, so a
        later patch marks it removed)."""
        now = (self.latest.get(kind) or {})
        if kind == 'gems':
            c = 'g:' + k
        elif kind in ('passives', 'atlas'):
            letter = LETTER[kind]
            cur = now.get(k) or e
            c = '%s:%s' % (letter, cur.get('id') if kind == 'passives' else cur.get('n'))
            if not self.has(c) and kind == 'passives':
                c = self.small.get((cur.get('n'), frozenset(cur.get('ls') or []))) or c
            if not self.has(c):
                named = self.names.get((letter, cur.get('n'))) or []
                c = named[0] if len(named) == 1 else c
        elif kind == 'bases':
            c = 'b:' + k
        elif kind == 'uniques':
            c = 'u:' + k if self.has('u:' + k) else 'u:' + k.split(' | ')[0]
        else:
            raise ValueError(kind)
        return c, self.has(c) or (bool(now) and k not in now)


def compare(old_dir, new_dir, cards, patch, was):
    out = {'v': patch, 'was': was, 'source': {}, 'cards': {},
           'new': [], 'gone': {}, 'tree': {'new': [], 'gone': []}, 'n': {}, 'missing': []}
    removed = 'Removed in %s' % patch

    def add(card, got):
        if got:
            have = out['cards'].setdefault(card, [])
            for r in got:
                if r not in have:   # many tree nodes are one card: the same change once
                    have.append(r)

    for kind, letter in LETTER.items():
        a, b = load(old_dir, kind), load(new_dir, kind)
        if a is None or b is None:
            out['missing'].append(kind)
            continue
        if kind in SOURCE:
            out['source'][letter] = SOURCE[kind]
        n = {'changed': 0, 'new': 0, 'gone': 0, 'uncarded': 0}
        before = set(out['cards'])
        if kind == 'mods':
            for mid in sorted(set(a) | set(b)):
                x, y = a.get(mid), b.get(mid)
                on = sorted(set((x or {}).get('on', [])) | set((y or {}).get('on', [])))
                for cls in on:
                    c = 'i:' + cls
                    ox = x if x and cls in x['on'] else None
                    oy = y if y and cls in y['on'] else None
                    if ox and oy and tier(ox) == tier(oy):
                        continue
                    if not cards.has(c):
                        n['uncarded'] += 1
                        continue
                    m = oy or ox
                    add(c, [[AFFIX.get((m['a'], m.get('d', 0)), 'Modifier'), ox and tier(ox), oy and tier(oy)]])
        else:
            diff = {'gems': gem_rows, 'passives': lines_rows, 'atlas': lines_rows, 'bases': base_rows,
                    'uniques': unique_rows}[kind]
            for k in sorted(set(a) | set(b)):
                x, y = a.get(k), b.get(k)
                c, carded = cards.of(kind, k, y or x)
                if x and y:
                    got = diff(x, y)
                    if got and carded:
                        add(c, got)
                    elif got:
                        n['uncarded'] += 1
                elif y:   # the patch added it
                    if kind == 'passives':
                        out['tree']['new'].append(int(k))
                    if carded and c not in out['new'] and c not in before:
                        out['new'].append(c)
                        n['new'] += 1
                else:     # the patch took it away
                    if kind == 'passives':
                        out['tree']['gone'].append(int(k))
                    if cards.has(c):
                        continue   # the card is still there: other nodes of the same passive, or a name reused
                    if c not in out['gone']:
                        out['gone'][c] = [x['n'] if 'n' in x else k.split(' | ')[0], removed, last(kind, x)]
                        n['gone'] += 1
        n['changed'] = len(set(out['cards']) - before)
        out['n'][letter] = n
    out['new'] = [c for c in out['new'] if c not in out['cards']]
    out['tree'] = {k: sorted(v) for k, v in out['tree'].items()}
    out['cards'] = dict(sorted(out['cards'].items()))
    return out


def dump(out):
    """Compact, one card a line: small to fetch, and a patch's file reads in a diff."""
    head = {k: v for k, v in out.items() if k not in ('cards', 'gone')}
    body = json.dumps(head, ensure_ascii=False, separators=(',', ':'))[:-1]
    for k in ('gone', 'cards'):
        rows = out[k]
        body += ',\n"%s":{' % k + ','.join('\n%s:%s' % (json.dumps(c, ensure_ascii=False),
                                                         json.dumps(v, ensure_ascii=False, separators=(',', ':')))
                                           for c, v in rows.items()) + ('\n}' if rows else '}')
    return body + '\n}\n'


def snapshots():
    return sorted((d.name for d in HISTORY.iterdir() if d.is_dir() and re.fullmatch(r'0\.\d+\.\d+', d.name)),
                  key=patch_key) if HISTORY.exists() else []


def latest_rows(folder):
    return {k: load(folder, k) for k in LETTER}


def run(patch, cards=None, quiet=False):
    """data/changes/<patch>.json from its snapshot and the one before it. Returns the file, or None."""
    have = snapshots()
    if patch not in have or have.index(patch) == 0:
        print('%s: no snapshot before it to hold it against' % patch)
        return None
    was = have[have.index(patch) - 1]
    cards = cards or Cards(INDEX, latest_rows(HISTORY / have[-1]))
    out = compare(HISTORY / was, HISTORY / patch, cards, patch, was)
    CHANGES.mkdir(parents=True, exist_ok=True)
    f = CHANGES / ('%s.json' % patch)
    f.write_text(dump(out), encoding='utf-8', newline='\n')
    if not quiet:
        say(out, f)
    return f


def say(out, f):
    n = out['n']
    print('%s against %s: %d cards changed, %d new, %d removed%s -> %s (%s KB)' % (
        out['v'], out['was'], len(out['cards']), len(out['new']), len(out['gone']),
        ' · not compared: ' + ', '.join(out['missing']) if out['missing'] else '',
        f.relative_to(ROOT) if f.is_relative_to(ROOT) else f, '%.0f' % (f.stat().st_size / 1024)))
    print('  ' + ' · '.join('%s %d/%d/%d%s' % (k, v['changed'], v['new'], v['gone'],
                                              ' (+%d uncarded)' % v['uncarded'] if v['uncarded'] else '')
                            for k, v in n.items()))


def main():
    ap = argparse.ArgumentParser(description='What a patch changed, card by card, from two snapshots.')
    ap.add_argument('patch', nargs='?', help='the patch to work out (default: the newest snapshot)')
    ap.add_argument('--all', action='store_true', help='every patch with a snapshot before it')
    ap.add_argument('--old', help='a snapshot folder to hold --new against')
    ap.add_argument('--new', help='the snapshot folder that is the patch')
    ap.add_argument('--out', help='with --old/--new: the file to write')
    ap.add_argument('--index', default=str(INDEX), help='the index the cards are looked up in')
    args = ap.parse_args()

    if args.old or args.new:
        if not (args.old and args.new and args.out):
            raise SystemExit('--old, --new and --out go together')
        cards = Cards(args.index, latest_rows(args.new))
        out = compare(args.old, args.new, cards, Path(args.new).name, Path(args.old).name)
        f = Path(args.out)
        f.parent.mkdir(parents=True, exist_ok=True)
        f.write_text(dump(out), encoding='utf-8', newline='\n')
        say(out, f.resolve())
        return 0
    have = snapshots()
    if not have:
        raise SystemExit('no snapshots in %s: run python tools/snapshot.py first' % HISTORY.relative_to(ROOT))
    todo = have[1:] if args.all else [args.patch or have[-1]]
    cards = Cards(args.index, latest_rows(HISTORY / have[-1]))
    for p in todo:
        run(p, cards)
    return 0


if __name__ == '__main__':
    sys.exit(main())
