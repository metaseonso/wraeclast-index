"""data/treechanges/: what each patch did to the passive tree, read from GGG's own tree export.

GGG publishes the PoE2 passive tree themselves: https://github.com/grindinggear/poe2-skilltree-export, one
data.json per patch (nodes, classes, ascendancies, edges, jewel slots). It is the only game data GGG exports
for PoE2, so it is read first here (official data first) and RePoE's copy of the same tree, the one the site
is built from today (tools/gamepull.py), is held up against it as a check.

Which commit is which patch: data/patches.json, the patch registry (tools/patches.py --tree reads the export's
commits and tags for it: a tag, or a commit whose whole message is the patch number; "0.5.0 Preview" is not a
patch). Every registry patch with a tree commit is read, in version order. Consecutive patches are one step,
and each step is one file named for the patch it arrives at: data/treechanges/0.5.5.json is 0.5.4 to 0.5.5.

Per step, four lists, each node named the way the game names it:

  added     on the tree now and not before, or before only as a node players could not see (an
            ascendancy the game had not named yet)
  removed   the other way round
  reworded  the same node with a different name or different lines. "was" holds the old name and lines,
            so a card can say "Was: ..." in the game's own words
  moved     the same node somewhere else on the tree, or joined to different nodes. "how" says which:
            "position" (more than MOVED units away), "links" (it gained or lost a neighbour, named in
            "joined" and "left")

A node players never see is left out of all four: no name, a [DNT] marker, or an ascendancy the export
gives no name to or marks [DNT] (the classes that have none in the game yet, the fishing one in 0.4.0). The game's keyword brackets are read away
(tools/sync.py plain), and nothing a player reads carries an internal id: the tree's own number for a node
sits in "id" only, so the tree view can light the node, and is never drawn.

data/treechanges/index.json lists the steps with their counts, and the check against RePoE: nodes one tree
has and the other does not, names that differ, and lines the site shows (the drill-down's tree block) that
differ from GGG's wording. A mismatch is reported, never fixed here; which one is right is a question for
the owner.

The export is read with git, into tools/cache/treeexport.git (not in git), fetched again each run and read
offline when the fetch fails. A stage of tools/pipeline.py (treechanges, patch cadence, after treelines: it
checks the drill-down's finished tree), which applies the last good rule to it.

Usage:
  python tools/pipeline.py --only treechanges   the stage
  python tools/treeexport.py            fetch, diff every step, check against RePoE, write data/treechanges/
  python tools/treeexport.py --report   the same, and say what would change, write nothing
"""
import argparse
import datetime as dt
import json
import math
import re
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
from gamelib import untag  # noqa: E402
from sync import DNT, RAW, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
FOLDER = 'data/treechanges/'     # one file per patch, named for the patch it arrives at, and index.json
OUT = ROOT / FOLDER
REPO = 'https://github.com/grindinggear/poe2-skilltree-export'
CLONE = ROOT / 'tools' / 'cache' / 'treeexport.git'
FILE = 'data.json'
VERSION = re.compile(r'^\d+\.\d+\.\d+$')   # a patch, and nothing after it
MOVED = 1.0          # units on the export's own grid; less than this is rounding, not a move
SOURCE = "Source: GGG's passive tree export"
REPOE_TREE = 'passive_skill_trees/Default.min.json'
TYPES = (('isKeystone', 'Keystone'), ('isNotable', 'Notable'), ('isJewelSocket', 'Jewel socket'),
         ('isMastery', 'Mastery'), ('isGenericAttribute', 'Attribute'))


# ---------------------------------------------------------------- the export, with git

def git(*args, check=True):
    r = subprocess.run(['git', *args], capture_output=True, text=True, timeout=600)
    if check and r.returncode != 0:
        raise lastgood.Stale('git %s: %s' % (args[0], (r.stderr or r.stdout).strip()[:200]))
    return r


def fetch():
    """The export's history in tools/cache/treeexport.git. A failed fetch keeps the copy already here and
    says so; with no copy at all there is nothing to read, and that is the fault."""
    if not (CLONE / 'HEAD').exists():
        CLONE.parent.mkdir(parents=True, exist_ok=True)
        git('clone', '--bare', '--quiet', REPO, str(CLONE))
        return 'cloned'
    r = git('-C', str(CLONE), 'fetch', '--quiet', '--tags', '--prune', 'origin',
            '+refs/heads/*:refs/heads/*', check=False)
    if r.returncode != 0:
        print('  could not fetch %s, reading the copy already here: %s' % (REPO, r.stderr.strip()[:160]),
              file=sys.stderr)
        return 'kept'
    return 'fetched'


def key(v):
    """"0.5.10" after "0.5.9"."""
    return tuple(int(x) for x in re.findall(r'\d+', v))


def versions():
    """[(patch, commit, date)], oldest first: every patch data/patches.json ties to a tree export commit, with
    the day git gives that commit."""
    reg = lastgood.committed('patches.json', quiet=True) or {}
    rows = sorted(((r['v'], r['tree']['commit']) for r in reg.get('patches', [])
                   if r.get('kind') == 'patch' and VERSION.match(r.get('v') or '') and (r.get('tree') or {}).get('commit')),
                  key=lambda x: key(x[0]))
    out = []
    for name, sha in rows:
        r = git('-C', str(CLONE), 'log', '-1', '--format=%H\t%cs', sha, check=False)
        if r.returncode != 0:
            raise lastgood.Stale('data/patches.json ties %s to tree export commit %s, which the export does not have'
                                 % (name, sha))
        full, day = r.stdout.strip().split('\t')
        out.append((name, full, day))
    return out


def tree_at(sha):
    return json.loads(git('-C', str(CLONE), 'show', '%s:%s' % (sha, FILE)).stdout)


# ---------------------------------------------------------------- one tree, as a player reads it

def said(v):
    """A node's lines as a player reads them: the game's display tags (<underline>{Name}) and its keyword
    brackets read away, one line each."""
    return [plain(x) for s in v.get('stats') or [] for x in untag(s).split('\n') if x.strip()]


def seen(tree):
    """{number: node} for every node a player can see, each with its name, lines and where it sits."""
    asc = {a['id']: plain(a['name']) for c in tree.get('classes') or [] for a in c.get('ascendancies') or []
           if a.get('name') and not DNT.search(a['name'])}
    out = {}
    for key, v in (tree.get('nodes') or {}).items():
        name = (v.get('name') or '').strip()
        if not key.isdigit() or not name or DNT.search(name):
            continue
        if v.get('ascendancyId') and v['ascendancyId'] not in asc:
            continue        # an ascendancy the game has not named, or marks [DNT]: not in the game
        lines = said(v)
        lines = [x for x in lines if not DNT.search(x)]
        ty = next((word for flag, word in TYPES if v.get(flag)), 'Small')
        node = {'id': int(key), 'n': plain(name), 'ty': ty, 'ls': lines,
                'xy': (v.get('x'), v.get('y')), 'nb': set(v.get('out') or []) | set(v.get('in') or [])}
        if v.get('ascendancyId'):
            node['asc'] = asc[v['ascendancyId']]
        out[int(key)] = node
    return out


def shown(node, **more):
    """A node as the file carries it: the number in "id", and only words after that."""
    out = {'id': node['id'], 'n': node['n'], 'ty': node['ty']}
    if node.get('asc'):
        out['asc'] = node['asc']
    if node['ls']:
        out['ls'] = node['ls']
    out.update(more)
    return out


def names(numbers, tree):
    """Neighbours by name, sorted, a name once. The root and the unnamed plates have no name and are left out."""
    return sorted({tree[int(n)]['n'] for n in numbers if str(n).isdigit() and int(n) in tree})


def step(old, new):
    """What one patch did: added, removed, reworded, moved."""
    a, b = seen(old), seen(new)
    out = {'added': [shown(b[k]) for k in sorted(b.keys() - a.keys(), key=lambda k: (b[k]['n'], k))],
           'removed': [shown(a[k]) for k in sorted(a.keys() - b.keys(), key=lambda k: (a[k]['n'], k))],
           'reworded': [], 'moved': []}
    for k in sorted(a.keys() & b.keys(), key=lambda k: (b[k]['n'], k)):
        was, now = a[k], b[k]
        if was['n'] != now['n'] or was['ls'] != now['ls']:
            then = {}
            if was['n'] != now['n']:
                then['n'] = was['n']
            if was['ls'] != now['ls']:
                then['ls'] = was['ls']
            out['reworded'].append(shown(now, was=then))
        how, more = [], {}
        (x0, y0), (x1, y1) = was['xy'], now['xy']
        if None not in (x0, y0, x1, y1) and math.hypot(x1 - x0, y1 - y0) > MOVED:
            how.append('position')
        joined, left = names(now['nb'] - was['nb'], b), names(was['nb'] - now['nb'], a)
        if joined or left:
            how.append('links')
            if joined:
                more['joined'] = joined
            if left:
                more['left'] = left
        if how:
            out['moved'].append(shown(now, how=how, **more))
    return out


# ---------------------------------------------------------------- the check against RePoE

def check(tree):
    """GGG's tree held up against RePoE's (what the site is built from) and against the lines the site shows.
    Names only, never an id: this is read by a person."""
    from gamepull import build, official, patch
    ours = official(REPOE_TREE)['passives']
    gg = {int(k): v for k, v in tree['nodes'].items() if k.isdigit()}
    re_ = {int(v['hash']): v for v in ours.values() if 'hash' in v}
    only_gg = sorted(gg.keys() - re_.keys())
    only_re = sorted(re_.keys() - gg.keys())
    def name(v):
        n = plain(v.get('name') or '')
        return '' if DNT.search(n) else n
    both = sorted(gg.keys() & re_.keys())
    named = [(name(gg[k]), name(re_[k])) for k in both if name(gg[k]) and name(re_[k]) and name(gg[k]) != name(re_[k])]
    blank = sorted({name(re_[k]) for k in both if name(re_[k]) and not name(gg[k])})   # GGG gives these no name
    flags = [name(gg[k]) or name(re_[k]) or 'a node with no name' for k in both
             if bool(gg[k].get('isNotable')) != bool(re_[k].get('is_notable'))
             or bool(gg[k].get('isKeystone')) != bool(re_[k].get('is_keystone'))
             or bool(gg[k].get('isJewelSocket')) != bool(re_[k].get('is_jewel_socket'))]
    words, order, skills = [], 0, 0
    try:
        from gamelib import drilldown
        site = {int(p['h']): p for p in drilldown('trdata')['passives']}
        for k in sorted(gg.keys() & site.keys()):
            mine = [plain(x) for s in site[k].get('t') or [] for x in s.split('\n') if x.strip()]
            theirs = said(gg[k])
            if sorted(mine) == sorted(theirs):
                order += mine != theirs      # the same lines in another order: the game's order is GGG's
            elif not mine and all(x.startswith('Grants Skill: ') for x in theirs):
                skills += 1                  # the notables whose whole effect is a skill: tools/gamelib.py cards them
            elif name(gg[k]):
                words.append({'n': plain(gg[k].get('name') or ''), 'site': mine, 'ggg': theirs})
    except SystemExit as e:        # no drill-down data here: the word check is skipped and says so
        words = None
        print('  lines check skipped: %s' % e, file=sys.stderr)
    return {'against': 'RePoE %s (patch %s)' % (REPOE_TREE, patch(build()) or '?'),
            'only_ggg': len(only_gg), 'only_repoe': len(only_re),
            'only_ggg_names': sorted({plain(gg[k].get('name') or '') for k in only_gg} - {''}),
            'only_repoe_names': sorted({plain(re_[k].get('name') or '') for k in only_re} - {''}),
            'names_differ': [{'ggg': a, 'repoe': b} for a, b in named],
            'unnamed_in_ggg': blank,
            'flags_differ': sorted({plain(n) for n in flags}),
            'lines_differ': len(words) if words is not None else None,
            'lines_order_only': order,
            'lines_skill_only': skills,
            'lines_sample': (words or [])[:40]}


# ---------------------------------------------------------------- run it

def build():
    fetch()
    vs = versions()
    if len(vs) < 2:
        raise lastgood.Stale('the export has %d patch%s, and a change needs two' % (len(vs), '' if len(vs) == 1 else 'es'))
    trees = {name: tree_at(sha) for name, sha, _ in vs}
    files, steps = {}, []
    for (was, _, _), (now, _, day) in zip(vs, vs[1:]):
        diff = step(trees[was], trees[now])
        counts = {k: len(v) for k, v in diff.items()}
        files[now] = {'from': was, 'to': now, 'dated': day, 'src': SOURCE, 'counts': counts, **diff}
        steps.append({'from': was, 'to': now, 'dated': day, 'file': 'treechanges/%s.json' % now, **counts})
    latest = vs[-1][0]
    index = {'note': 'What each patch did to the passive tree, from GGG\'s own tree export. One file per '
                     'patch, named for the patch it arrives at. Written by tools/treeexport.py.',
             'src': SOURCE, 'url': REPO, 'latest': latest,
             'updated': dt.date.today().isoformat(), 'steps': steps,
             'check': check(trees[latest])}
    for name, f in files.items():
        guard(f, name)
    return {'index': index, 'files': files}


def guard(f, name):
    """Nothing a player reads may look like game code (the standard tools/sync.py holds its cards to)."""
    def words(x):
        if isinstance(x, str):
            yield x
        elif isinstance(x, list):
            for y in x:
                yield from words(y)
        elif isinstance(x, dict):
            for k, v in x.items():
                if k != 'id':
                    yield from words(v)
    for w in words({k: v for k, v in f.items() if k in ('added', 'removed', 'reworded', 'moved')}):
        if RAW.search(w) or DNT.search(w) or re.search(r'\[[^\]]+\]|[<>{}]', w):
            raise lastgood.Stale('game code in the %s changes: %r' % (name, w))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='say what would change, write nothing')
    args = ap.parse_args()
    had = lastgood.committed('treechanges/index.json', quiet=True)     # the steps are counted against these
    out = lastgood.pull('Tree changes', build, file='treechanges/index.json', url=REPO, at='index.steps',
                        floor=5, old={'index': had} if had else None)
    if out is None:
        return lastgood.report()
    idx = out['index']
    for s in idx['steps']:
        print('  %-6s -> %-6s %s  %4d added  %4d removed  %4d reworded  %4d moved'
              % (s['from'], s['to'], s['dated'], s['added'], s['removed'], s['reworded'], s['moved']))
    c = idx['check']
    print('  check against %s: %d only in GGG\'s, %d only in RePoE\'s, %d names differ, %d named only in '
          'RePoE\'s, %d types differ, %s lines differ (%d more in another order only)'
          % (c['against'], c['only_ggg'], c['only_repoe'], len(c['names_differ']), len(c['unnamed_in_ggg']),
             len(c['flags_differ']), '?' if c['lines_differ'] is None else c['lines_differ'], c['lines_order_only']))
    for x in c['names_differ'][:10]:
        print('    name: GGG %r, RePoE %r' % (x['ggg'], x['repoe']))
    for x in c['lines_sample'][:5]:
        print('    lines on %s: site %r, GGG %r' % (x['n'], x['site'], x['ggg']))
    texts = {'%s.json' % name: json.dumps(f, ensure_ascii=False, separators=(',', ':')) + '\n'
             for name, f in out['files'].items()}
    texts['index.json'] = json.dumps(idx, ensure_ascii=False, indent=1) + '\n'
    size = sum(len(t.encode('utf-8')) for t in texts.values())
    if args.report:
        moved = [n for n, t in texts.items() if n != 'index.json'
                 and (not (OUT / n).exists() or (OUT / n).read_text(encoding='utf-8') != t)]
        print('treechanges %d files, %.0f KB%s' % (len(texts), size / 1024,
                                                 ' (would change: %s)' % ', '.join(moved) if moved else ''))
        return lastgood.report()
    OUT.mkdir(parents=True, exist_ok=True)
    for n, t in texts.items():
        lastgood.save(OUT / n, t)
    print('treechanges %d files, %.0f KB -> data/treechanges/' % (len(texts), size / 1024))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Tree changes', file='treechanges/index.json', url=REPO))
