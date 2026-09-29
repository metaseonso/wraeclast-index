"""What the data changed from one patch to the next (#73): one frozen copy of the numbers per patch, and the
diff between each two, card by card, old value -> new value in the game's own words.

    python tools/patchdiff.py            freeze the current patch if it has no copy yet, then every diff again
    python tools/patchdiff.py --check    the copies read, and the diff files are what they give; writes nothing

data/snapshots/<patch>.json.gz: the numbers that matter at one patch. Written once, the first run that sees the
patch, and never again: a copy is a record of that patch, not of the site. Not part of the website
(.assetsignore). What one holds, per part (`has` lists the parts it has):
  g    every gem card: its words, use time, cost, Spirit, critical hit chance, requirements, quality, tags,
       and its lines at every level ("lv": a line whose wording holds from level to level is kept once, as
       the words with # for each number and the numbers per level)
  u    every unique: its lines, properties, requirements, base, limit
  b    every base item: its properties, requirements, implicit lines
  mod  every modifier the Craft tab rolls (data/craft/*.json): its name, level, lines, and the item classes
  p    every passive on the tree, node by node (data/explore/tree.*.json): its name and lines
The current patch's copy is taken from the finished index and the drill-down files, which must be of the same
client build (tools/snapshot.py gem_extras says so). An older patch has a copy only where its data is still at
hand: GGG's passive tree export steps (data/treechanges/, tools/treeexport.py) hold every passive a patch added,
removed or reworded, so the passives of each older patch are the newer copy with its step undone. Those copies
hold `p` only. Nothing is guessed: a part a copy does not hold is not compared.

data/patchdiff/index.json: the copies, and per step (two copies in patch order, newest first) the file that
holds it, the parts compared, how many things changed per part, how many of them the patch notes never name,
and the cards they are on ("kind:name", the key the cards already carry; never a game id, #12).
data/patchdiff/<patch>.json: one step, per part, every thing that changed:
  n   its name (the new one where it was renamed)       s   its sub line, where two share one name
  c   the cards it is on, where they are cards now      on  the item classes a modifier rolls on
  st  "new" or "gone", with its lines in ls              r   [label, old, new] per change; old or new is null
  q   1: the patch notes of the step never name it      m   how many nodes of the tree share this one change
"Not in the patch notes" (q): no line of the step's notes names it. The step's notes are every thread
data/patches.json ties to a version after the old patch up to the new one, and the fixes to the old patch
posted after it (a later letter or hotfix), read from data/patchnotes.json (the lines that name a card) and
tools/dev/patchgaps.txt (the rest). A name is found the way tools/patchnotes.py finds one: case and whole words,
a trailing s or 's allowed; a renamed thing by either name. A modifier has no name the notes use, so it counts
as named where a line of the step carries its own words (the line without its numbers, "increased Armour and
Evasion").

Files the site reads: data/patchdiff/index.json the first time a card is opened or the Patches page asks, and a
step's file only when the card is on it or the page shows it. Never in first paint.
"""
import argparse
import glob
import gzip
import json
import re
import sys
from pathlib import Path

import lastgood
import snapshot

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
HOME = 'data/snapshots/'           # the copies, one per patch (never part of the website)
SITE = 'data/patchdiff/'           # what the cards and the Patches page read
SNAPS = ROOT / HOME
OUT = ROOT / SITE
GAPS = ROOT / 'tools' / 'dev' / 'patchgaps.txt'
PARTS = ['g', 'u', 'b', 'mod', 'p']          # the order the page groups them in
NAMES = {'g': 'Gems', 'u': 'Uniques', 'b': 'Bases', 'mod': 'Modifiers', 'p': 'Passives'}
SRC = {'index': 'Game files', 'tree': "GGG's passive tree export"}
NUM = re.compile(r'\d+(?:\.\d+)?')
TOP = 20                                     # the gem level a change is shown at, where it moved there
GEM_LEVELS = [0, 3, 6, 10, 14, 18, 22, 26, 31, 36, 41, 46, 52, 58, 64, 66, 72, 78, 84, 90]   # assets/app.js gemReq
ATTR = ['Str', 'Dex', 'Int']
NOTE = ('What the game data changed from one patch to the next, per card, old to new in the game\'s words. '
        'Written by tools/patchdiff.py from the copies in data/snapshots/.')


def plain(t):
    return snapshot.plain(t)


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def vkey(v):
    """A version as numbers and a letter, for order: 0.5.4f -> (0, 5, 4, 'f')."""
    m = re.match(r'(\d+)\.(\d+)\.(\d+)([a-z]?)', v or '')
    return (int(m.group(1)), int(m.group(2)), int(m.group(3)), m.group(4)) if m else (0, 0, 0, '')


def family(v):
    return vkey(v)[:3]


# ---------------------------------------------------------------- the copies
def pack_levels(per):
    """A gem line at every level: once as words with # for each number, and the numbers per level, where the
    words hold at every level it has; else the lines as they are."""
    tpls = {NUM.sub('#', s) for s in per if s}
    if len(tpls) != 1:
        return per
    return {'t': tpls.pop(), 'v': [[x for x in NUM.findall(s)] if s else None for s in per]}


def unpack_levels(x):
    if isinstance(x, list):
        return x
    parts = x['t'].split('#')
    out = []
    for nums in x['v']:
        if nums is None:
            out.append(None)
            continue
        s = parts[0]
        for i, n in enumerate(nums):
            s += n + parts[i + 1]
        out.append(s)
    return out


def tree_nodes():
    tree = snapshot.explore_file('tree')
    if not tree:
        raise SystemExit('explore.html names no tree file; run tools/sync.py first')
    return json.loads(tree.read_text(encoding='utf-8'))


def node_lines(node):
    return [plain(y) for x in node.get('t') or [] for y in x.split('\n') if y.strip()]


def current():
    """The client build the index is from, and its patch (data/patches.json builds, else the family rule
    tools/gamepull.py uses: 4.5.5.2 is 0.5.5)."""
    build = load('index.json').get('v')
    if not re.fullmatch(r'\d+(\.\d+){3}', build or ''):
        raise SystemExit('data/index.json carries no client build ("v"): %r' % build)
    patch = next((b['patch'] for b in load('patches.json').get('builds', []) if b.get('build') == build),
                 re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', build))
    return build, patch


def take():
    """The current patch's copy, from the finished index and the files beside it."""
    index = load('index.json')
    build, patch = current()
    extras, _ = snapshot.gem_extras(build)
    body = {'patch': patch, 'build': build, 'taken': index.get('gen'), 'from': 'index', 'has': PARTS,
            'g': {}, 'u': {}, 'b': {}, 'mod': {}, 'p': {}}
    keep = {'g': ('n', 's', 't', 'ct', 'cost', 'sp', 'w', 'gq', 'tags'), 'u': ('n', 's', 'ls', 'pr', 'rq', 'lim'),
            'b': ('n', 's', 'ls', 'pr', 'rq')}
    for it in index['items']:
        k = it.get('k')
        if k not in keep:
            continue
        e = {f: it[f] for f in keep[k] if it.get(f) not in (None, '', [], {})}
        if k == 'g':
            x = extras.get(it['id']) or {}
            for f in ('crit', 'tx'):
                if x.get(f):
                    e[f] = x[f]
            if x.get('lv'):
                e['lv'] = [pack_levels(line) for line in x['lv']]
        body[k][it['id']] = e
    for f in sorted(glob.glob(str(DATA / 'craft' / '*.json'))):
        cls = Path(f).stem
        t = json.loads(Path(f).read_text(encoding='utf-8'))
        fam = t.get('fam') or []
        for m in t.get('mods') or []:
            mid, fi, lv, lines, affix = m[0], m[1], m[2], m[3], m[4]
            e = {'n': affix, 'lv': lv, 'ls': lines, 'sd': fam[fi][0] if fi < len(fam) else ''}
            key = mid
            have = body['mod'].get(key)
            if have and {x: have[x] for x in e} != e:
                key = mid + '|' + cls           # the same modifier rolling differently on this class
                have = body['mod'].get(key)
            if have:
                have['on'].append(cls)
            else:
                body['mod'][key] = dict(e, on=[cls])
    for node in tree_nodes()['passives']:
        name = (node.get('n') or '').strip()
        if name:
            body['p'][str(node['h'])] = [name, node_lines(node)]
    return body


def write_once(body):
    p = SNAPS / ('%s.json.gz' % body['patch'])
    if p.exists():
        return False
    p.parent.mkdir(parents=True, exist_ok=True)
    raw = json.dumps(body, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
    p.write_bytes(gzip.compress(raw, compresslevel=9, mtime=0))
    return True


def read(p):
    return json.loads(gzip.decompress(Path(p).read_bytes()))


def copies():
    """Every copy in data/snapshots/, oldest patch first."""
    out = [read(p) for p in glob.glob(str(SNAPS / '*.json.gz'))]
    return sorted(out, key=lambda s: vkey(s['patch']))


def undo_tree(newer, step):
    """The passives one tree step before `newer` (a copy that has them): the step's added nodes taken away, its
    removed ones put back and its reworded ones given their old name and lines. Returns the older copy, and how
    many of the step's rows did not match the newer copy as they should."""
    p = {h: [n, list(ls)] for h, (n, ls) in newer['p'].items()}
    off = 0
    for row in step.get('added') or []:
        if p.pop(str(row['id']), None) is None:
            off += 1
    for row in step.get('reworded') or []:
        h = str(row['id'])
        if h not in p:
            off += 1
            continue
        was = row.get('was') or {}
        if was.get('n'):
            p[h][0] = was['n']
        if was.get('ls'):
            p[h][1] = [plain(x) for x in was['ls']]
    for row in step.get('removed') or []:
        h = str(row['id'])
        if h in p:
            off += 1
        p[h] = [row['n'], [plain(x) for x in row.get('ls') or []]]
    return {'patch': step['from'], 'taken': None, 'from': 'tree', 'has': ['p'], 'p': p}, off


def older_tree_copies(have):
    """The passive copies of the patches GGG's tree export steps reach back to, that have none yet: each is the
    copy of the patch after it with that step undone. Written once, like any copy."""
    ix = load('treechanges/index.json')
    steps = sorted(ix.get('steps') or [], key=lambda s: vkey(s['to']), reverse=True)
    by = {s['patch']: s for s in have}
    made = []
    for st in steps:
        if st['from'] in by:
            continue
        newer = by.get(st['to'])
        if not newer or 'p' not in newer.get('has', []):
            continue
        older, off = undo_tree(newer, load(st['file']))
        older['taken'] = next((s.get('dated') for s in steps if s['to'] == st['from']), None)
        if off:
            print('  %s -> %s: %d rows of the tree step do not match the %s copy' % (st['from'], st['to'], off, st['to']))
        by[older['patch']] = older
        if write_once(older):
            made.append(older['patch'])
    return made


# ---------------------------------------------------------------- saying a value
def reqs(rq):
    if not rq:
        return 'None'
    out = ['Level %d' % rq[0]] if rq[0] > 1 else []
    out += ['%d %s' % (v, a) for v, a in zip(rq[1:], ATTR) if v]
    return ', '.join(out) or 'None'


def gem_reqs(w):
    lv = GEM_LEVELS[TOP - 1]
    attr = lambda x: int((5 + (lv - 3) * 1.7) * (x / 100) ** 0.9 + 0.5) + 4 if x else 0
    return reqs([lv] + [attr(x) for x in w])


def num(v):
    return ('%.2f' % v).rstrip('0').rstrip('.') if isinstance(v, float) else str(v)


SAY = {   # part -> [(field, label, how the value reads)]
    'g': [('t', 'Description', str), ('ct', 'Use time', lambda v: num(v / 1000) + ' s'),
          ('cost', 'Cost at gem level 20', lambda v: '%s %s' % (v[0], v[1])), ('sp', 'Spirit', str),
          ('crit', 'Critical Hit Chance', lambda v: ' / '.join(num(x) + '%' for x in v)),
          ('w', 'Requirements at gem level 20', gem_reqs), ('tags', 'Tags', ', '.join)],
    'u': [('s', 'Base', lambda v: v.split(' · ')[0]), ('rq', 'Requirements', reqs), ('lim', 'Limited to', str)],
    'b': [('rq', 'Requirements', reqs)],
    'mod': [('n', 'Name', str), ('lv', 'Modifier level', str)],
}
LINES = {'g': [('gq', 'Quality'), ('tx', None)], 'u': [('pr', None), ('ls', None)], 'b': [('pr', None), ('ls', None)],
         'mod': [('ls', None)]}


def line_rows(old, new, label=None):
    """Two lists of game lines as changes: a line in both is no change, whatever its place; a line whose words
    are the same but for its numbers is one change; what is left pairs up in order where both sides have as
    many, else it is a line gone and a line new."""
    o, n = list(old or []), []
    for x in new or []:
        if x in o:
            o.remove(x)
        else:
            n.append(x)
    rows = []
    for x in list(o):
        t = NUM.sub('#', x)
        y = next((y for y in n if NUM.sub('#', y) == t), None)
        if y is not None:
            rows.append([label, x, y])
            o.remove(x)
            n.remove(y)
    if len(o) == len(n):
        rows += [[label, x, y] for x, y in zip(o, n)]
    else:
        rows += [[label, x, None] for x in o] + [[label, None, y] for y in n]
    return rows


def level_rows(old, new):
    """A gem's lines at every level as changes, each at level 20 where it moved there, else at the last level
    that moved."""
    olds = [unpack_levels(x) for x in old or []]
    news = [unpack_levels(x) for x in new or []]
    ident = lambda per: NUM.sub('#', next((s for s in per if s), ''))
    rows, left_o, left_n = [], [], list(news)
    for per in olds:
        hit = next((x for x in left_n if ident(x) == ident(per)), None)
        if hit is None:
            left_o.append(per)
            continue
        left_n.remove(hit)
        top = max(len(per), len(hit))
        at = lambda xs, lv: xs[lv - 1] if lv <= len(xs) else None
        moved = [lv for lv in range(1, top + 1) if at(per, lv) != at(hit, lv)]
        if moved:
            lv = TOP if TOP in moved else moved[-1]
            rows.append(['Level %d' % lv, at(per, lv), at(hit, lv)])
    show = lambda per: (min(TOP, len(per)), per[min(TOP, len(per)) - 1] if per else None)
    for per in left_o:
        lv, s = show(per)
        if s:
            rows.append(['Level %d' % lv, s, None])
    for per in left_n:
        lv, s = show(per)
        if s:
            rows.append(['Level %d' % lv, None, s])
    return rows


def lines_of(part, e):
    """What a new or gone thing says, for its entry."""
    if part == 'p':
        return e[1]
    if part == 'g':
        return [e['t']] if e.get('t') else []
    if part == 'mod':
        return e.get('ls') or []
    return (e.get('pr') or []) + (e.get('ls') or [])


def rows_of(part, o, n, names):
    if part == 'p':
        rows = [['Name', o[0], n[0]]] if o[0] != n[0] else []
        return rows + line_rows(o[1], n[1])
    rows = []
    for f, label, how in SAY.get(part, []):
        if o.get(f) != n.get(f):
            rows.append([label, how(o[f]) if o.get(f) not in (None, '', []) else None,
                         how(n[f]) if n.get(f) not in (None, '', []) else None])
    for f, label in LINES.get(part, []):
        rows += line_rows(o.get(f), n.get(f), label)
    if part == 'g':
        rows += level_rows(o.get('lv'), n.get('lv'))
    if part == 'mod' and o.get('on') != n.get('on'):
        say = lambda cs: ', '.join(names.get(c, c) for c in cs) or None
        rows.append(['Item classes', say(o.get('on') or []), say(n.get('on') or [])])
    return rows


# ---------------------------------------------------------------- the patch notes of a step
def note_lines(a, b):
    """Every line of GGG's notes for the step from patch a to patch b (see the top)."""
    reg = {r['id']: r for r in load('patches.json').get('patches', [])}
    notes = load('patchnotes.json')
    ids = [p['id'] for p in notes.get('patches', [])]

    def inside(rid):
        r = reg.get(rid) or {}
        f = family(r.get('v') or rid)
        return family(a) < f <= family(b) or (f == family(a) and rid != a)
    keep = {i for i, rid in enumerate(ids) if inside(rid)}
    out = [l[2] for l in notes.get('lines', []) if l[0] in keep]
    titles = {}
    for p in notes.get('patches', []):
        titles.setdefault(p.get('title') or p['id'], []).append(p['id'])
    if GAPS.exists():
        on = False
        for line in GAPS.read_text(encoding='utf-8').splitlines():
            if line.startswith('## '):
                title = line[3:].rsplit(' / ', 1)[0]
                on = any(inside(rid) for rid in titles.get(title, []))
            elif on and line.startswith('- '):
                out.append(line[2:])
    return '\n'.join(out)


def named(text, name):
    return bool(name) and re.search(r"(?<![\w'-])" + re.escape(name) + r"(?:'s|s)?(?!\w)", text) is not None


def said(text, lines):
    """A modifier's own words in a line of the notes: its longest run of words with no number in it."""
    low = text.lower()
    for ln in lines or []:
        runs = [r.strip() for r in re.split(r'[#()+%\d.,-]+', NUM.sub('#', ln)) if len(r.strip().split()) >= 2]
        if runs and max(runs, key=len).lower() in low:
            return True
    return False


# ---------------------------------------------------------------- one step
def cards_now():
    """What each part's things are on today, as card keys: gems, uniques and bases by their card, a modifier's
    item classes by theirs, a passive node by the card that holds it (the way tools/carddata.py joins them)."""
    index = load('index.json')
    by_id, by_line, cls = {}, {}, {}
    for it in index['items']:
        if it['k'] == 'p':
            by_id[it['id']] = it
            if it.get('lo'):
                by_line[(it['n'], frozenset(it.get('ls') or []))] = it
        if it['k'] == 'i':
            cls[it['id']] = it['n']
    node = {}
    for x in tree_nodes()['passives']:
        it = by_id.get(x.get('id')) or by_line.get(((x.get('n') or '').strip(), frozenset(node_lines(x))))
        if it:
            node[str(x['h'])] = 'p:' + it['n']
    keys = {(it['k'], it['id']): it['k'] + ':' + it['n'] for it in index['items'] if it['k'] in 'gub'}
    return keys, node, cls


def step(a, b, now):
    keys, node, cls = now
    parts = [p for p in PARTS if p in a.get('has', []) and p in b.get('has', [])]
    text = note_lines(a['patch'], b['patch'])
    out = {}
    for part in parts:
        old, new = a.get(part) or {}, b.get(part) or {}
        name_of = lambda e: (e[0] if part == 'p' else e.get('n') or (e.get('ls') or [''])[0]) or ''
        shared = {}
        for e in new.values():
            shared[name_of(e)] = shared.get(name_of(e), 0) + 1
        rows = []
        for key in sorted(set(old) | set(new), key=lambda k: (name_of(new.get(k) or old.get(k)), k)):
            o, n = old.get(key), new.get(key)
            e = n if n is not None else o
            ent = {}
            if part == 'p':
                ent['n'] = e[0]
                card = node.get(key) if n is not None else None
                olds = [o[0]] if o else []
            else:
                ent['n'] = name_of(e)
                if part != 'mod' and shared.get(ent['n'], 0) > 1 and e.get('s'):
                    ent['s'] = e['s']
                card = keys.get((part, key)) if part != 'mod' and n is not None else None
                olds = [o.get('n')] if o else []
            if o is None or n is None:
                ent['st'] = 'new' if o is None else 'gone'
                ent['ls'] = lines_of(part, e)
                if part == 'p' and not ent['ls']:
                    continue             # a node with no lines (a class's start, an empty mastery) says nothing
            else:
                r = rows_of(part, o, n, cls)
                if not r:
                    continue
                ent['r'] = r
            if part == 'mod':
                ent['on'] = [cls.get(c, c) for c in e.get('on') or []]
                if n is not None:
                    ent['c'] = ['i:' + cls[c] for c in e.get('on') or [] if c in cls]
                heard = said(text, (o or {}).get('ls')) or said(text, (n or {}).get('ls'))
            else:
                if card:
                    ent['c'] = [card]
                heard = any(named(text, x) for x in {ent['n'], *olds})
            if not heard:
                ent['q'] = 1
            rows.append(ent)
        if part == 'p':          # nodes that share one name and one change are one row
            merged = {}
            for ent in rows:
                sig = json.dumps({k: v for k, v in ent.items() if k != 'c'}, sort_keys=True)
                if sig in merged:
                    m = merged[sig]
                    m['m'] = m.get('m', 1) + 1
                    for c in ent.get('c') or []:
                        if c not in m.setdefault('c', []):
                            m['c'].append(c)
                else:
                    merged[sig] = ent
            rows = list(merged.values())
        if rows:
            out[part] = rows
    return parts, out


# ---------------------------------------------------------------- the run
def build():
    build_, patch = current()
    if (SNAPS / ('%s.json.gz' % patch)).exists():
        print('copy of %s already kept: not taken again' % patch)
    elif write_once(take()):
        print('copy of %s (build %s) taken' % (patch, build_))
    have = copies()
    made = older_tree_copies(have)
    if made:
        print('copies of %s made from the passive tree export' % ', '.join(made))
    have = copies()
    now_cards = cards_now()
    steps, files = [], {}
    for a, b in zip(have, have[1:]):
        parts, body = step(a, b, now_cards)
        if not parts:
            continue
        name = 'patchdiff/%s.json' % b['patch']
        files[name] = {'from': a['patch'], 'to': b['patch'], 'has': parts, 'src': SRC[a['from']], 'parts': body}
        cards = sorted({c for rows in body.values() for e in rows for c in e.get('c') or []})
        steps.append({'from': a['patch'], 'to': b['patch'], 'file': SITE + b['patch'] + '.json', 'has': parts, 'src': SRC[a['from']],
                      'n': {p: len(body[p]) for p in PARTS if p in body},
                      'q': sum(1 for rows in body.values() for e in rows if e.get('q')), 'cards': cards})
    steps.reverse()
    ix = {'note': NOTE, 'latest': have[-1]['patch'] if have else None, 'names': NAMES,
          'copies': [{'patch': s['patch'], 'build': s.get('build'), 'has': s['has'], 'src': SRC[s['from']],
                      'taken': s.get('taken')} for s in reversed(have)],
          'steps': steps}
    return ix, files


def dump(v):
    return json.dumps(v, ensure_ascii=False, separators=(',', ':')) + '\n'


def main():
    ap = argparse.ArgumentParser(description='The data diff between patches.')
    ap.add_argument('--check', action='store_true', help='the diff files are what the copies give; write nothing')
    args = ap.parse_args()
    if args.check:
        have = copies()
        ix = json.loads((OUT / 'index.json').read_text(encoding='utf-8'))
        bad = []
        now_cards = cards_now()
        for a, b in zip(have, have[1:]):
            parts, body = step(a, b, now_cards)
            f = OUT / ('%s.json' % b['patch'])
            if parts and (not f.exists() or json.loads(f.read_text(encoding='utf-8'))['parts'] != body):
                bad.append('%s is not what the copies of %s and %s give' % (f.name, a['patch'], b['patch']))
        for b in bad:
            print('  ' + b)
        print('patchdiff: %d copies, %d steps, %s' % (len(have), len(ix.get('steps', [])), 'ok' if not bad else 'FAIL'))
        return 1 if bad else 0
    ix, files = build()
    OUT.mkdir(parents=True, exist_ok=True)
    for name, body in files.items():
        lastgood.save(DATA / name, dump(body))
    for f in OUT.glob('*.json'):
        if f.name != 'index.json' and 'patchdiff/' + f.name not in files:
            f.unlink()
    lastgood.save(OUT / 'index.json', dump(ix))
    for s in ix['steps']:
        print('%s -> %s (%s): %s; %d not in the patch notes, on %d cards' % (
            s['from'], s['to'], ', '.join(NAMES[p] for p in s['has']),
            ', '.join('%s %d' % (NAMES[p], n) for p, n in s['n'].items()) or 'nothing changed', s['q'], len(s['cards'])))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Patch data diff', file='patchdiff/index.json'))
