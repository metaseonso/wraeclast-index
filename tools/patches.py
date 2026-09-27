"""Build data/patches.json: every Path of Exile 2 patch, hotfix and restart, with the hour its notes went up,
the league it belongs to, the thread, the passive tree export it matches, and every client build the index has
carried. The per-patch snapshots (tools/snapshot.py) and the diff between two of them (tools/diff.py) are named
by these rows; a build's patch and a price's patch are found here.

Sources, each named on the rows it fills:
  notes   GGG's Path of Exile 2 patch notes forum (https://www.pathofexile.com/forum/view-forum/2212): one row
          per thread whose title names a version. The hour is the thread's post time. The forum prints it in
          the time zone it guesses for the reader (window.momentTimezone on the page); it is turned into UTC
          here, so the hour is the same wherever the job runs. Threads with no version ("Server Maintenance")
          are left out.
  leagues data/leagues.json (poe2db's league list, tools/leagues.py): the league a version belongs to, and the
          day a league-opening patch went live.
  tree    GGG's passive tree export (https://github.com/grindinggear/poe2-skilltree-export): the commit whose
          message is the version, and its tag where GGG tagged one. The tree export is a check on a patch, not
          a date for it.
  index   data/index.json "v": the client build the shipped cards were built from (the RePoE export's build,
          tools/gamepull.py). A build is added the first time the index carries it: "seen" is the day the
          index says it was generated, "dated" the day the export's files carry (data/gamedata.json).
  archive A build read some other way and named by where it was read (the wraeclast-data game tables).

A field nothing states is left out, never guessed: a client build is tied to its patch family (4.5.5.2 is
0.5.5, the rule tools/gamepull.py uses), not to a letter patch, until something official says which.

    python tools/patches.py              add the index's client build if it is new (no network)
    python tools/patches.py --notes      also read the patch notes forum, newest page first, until a page
                                         brings nothing new (--all: every page, about ten)
    python tools/patches.py --tree       also read the passive tree export's commits and tags
    python tools/patches.py --check      check the file and write nothing (exit 1 on a bad row)

A forum or GitHub read that fails is a fault (tools/lastgood.py): the committed file stays, the run says so, a
data-fault issue goes up, and the run exits non-zero.
"""
import argparse
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
FILE = 'patches.json'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
FORUM = 'https://www.pathofexile.com/forum/view-forum/2212'
THREAD = 'https://www.pathofexile.com/forum/view-thread/'
TREE = 'https://github.com/grindinggear/poe2-skilltree-export'
TREE_API = 'https://api.github.com/repos/grindinggear/poe2-skilltree-export'
PAGES = 40          # the forum has about ten pages; this is only a stop
PACE = 1.5          # seconds between requests to pathofexile.com
NOTE = ('Every Path of Exile 2 patch, hotfix and restart, and every client build the index has carried. '
        'Written by tools/patches.py. Times are UTC. A field nothing states is left out.')
SOURCES = {
    'notes': {'n': 'Path of Exile 2 patch notes forum (Grinding Gear Games)', 'url': FORUM},
    'leagues': {'n': 'data/leagues.json (poe2db league list)', 'url': 'https://poe2db.tw/us/League'},
    'tree': {'n': 'Passive tree export (Grinding Gear Games)', 'url': TREE},
    'index': {'n': 'data/index.json: the client build the cards were built from (RePoE export)',
              'url': 'https://repoe-fork.github.io/poe2/'},
    'export': {'n': 'data/gamedata.json: the date the export files carry', 'url': 'https://repoe-fork.github.io/poe2/'},
    'archive': {'n': 'wraeclast-data game tables (the CDN folder they were read from)',
                'url': 'https://github.com/metaseonso/wraeclast-data'},
}
KINDS = ('patch', 'hotfix', 'restart', 'maintenance')

# A thread title as GGG write them. The version is always first, except on a content update's own post.
V = r'(\d+\.\d+\.\d+)\.?([a-z]?)'       # "0.5.5c", and once "0.3.1.d"
TITLES = [
    (re.compile(r'^Content Update ' + V + r'\b', re.I), 'patch'),
    (re.compile(r'^' + V + r'\s+Hoti?fx(?:\s+(\d+))?|^' + V + r'\s+Hotfix(?:\s+(\d+))?', re.I), 'hotfix'),
    (re.compile(r'^' + V + r'\s+Restart', re.I), 'restart'),
    (re.compile(r'^' + V + r'\s+Maintenance', re.I), 'maintenance'),
    (re.compile(r'^' + V + r'\s+Patch\s*notes', re.I), 'patch'),
]
ROW = re.compile(r'<div class="title">\s*<a href="/forum/view-thread/(\d+)">\s*(.*?)\s*</a>.*?'
                 r'<span class="post_date">,\s*(.*?)</span>', re.S)
ZONE = re.compile(r"momentTimezone\s*=\s*'([^']+)'")


# ---------------------------------------------------------------- reading
def read(url, pace=0.0, accept=None):
    headers = {'User-Agent': UA}
    if accept:
        headers['Accept'] = accept
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=30) as r:
        body = r.read()
    if pace:
        time.sleep(pace)
    return body


def parse_title(title):
    """(patch, kind, hotfix number, flags) for a thread title, or None when it names no version."""
    for pat, kind in TITLES:
        m = pat.match(title)
        if not m:
            continue
        g = [x for x in m.groups()]
        if kind == 'hotfix':
            g = g[:3] if g[0] else g[3:]
        v = g[0] + (g[1] or '')
        n = int(g[2]) if kind == 'hotfix' and g[2] else (1 if kind == 'hotfix' else None)
        low = title.lower()
        flags = [f for f, w in (('restartless', 'restartless'), ('rolled back', 'rolled back')) if w in low]
        return v, kind, n, flags
    return None


def row_id(v, kind, n):
    return v if kind == 'patch' else '%s %s' % (v, kind) + (' %d' % n if kind == 'hotfix' else '')


def utc(stamp, zone):
    """"Sep 18, 2026, 6:30:00 AM" in the forum's zone, as "2026-09-17T22:30Z"."""
    t = dt.datetime.strptime(stamp.strip(), '%b %d, %Y, %I:%M:%S %p').replace(tzinfo=ZoneInfo(zone))
    return t.astimezone(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ')


def forum(known, every=False):
    """Rows from the patch notes forum, newest first. Stops at the first page that brings nothing new, unless
    every page is asked for."""
    out = []
    for p in range(1, PAGES + 1):
        page = read(FORUM + ('' if p == 1 else '/page/%d' % p), PACE).decode('utf-8', 'replace')
        rows = ROW.findall(page)
        if not rows:
            if p == 1:
                raise lastgood.Stale('the forum page lists no threads any more')
            break
        zone = ZONE.search(page)
        if not zone:
            raise lastgood.Stale('the forum page no longer says which time zone its dates are in')
        fresh = 0
        for tid, title, stamp in rows:
            title = ' '.join(html.unescape(re.sub(r'<[^>]+>', '', title)).split())
            got = parse_title(title)
            if not got:
                continue
            v, kind, n, flags = got
            r = {'id': row_id(v, kind, n), 'v': v, 'kind': kind, 'posted': utc(stamp, zone.group(1)),
                 'notes': THREAD + tid, 'title': title}
            if n is not None:
                r['n'] = n
            if flags:
                r['flags'] = flags
            if known.get(r['id'], {}).get('notes') != r['notes']:
                fresh += 1
            out.append(r)
        if not fresh and not every:
            break
    return out


def tree_refs():
    """{version: {'commit': short sha, 'at': commit time, 'tag': tag}} from GGG's passive tree export."""
    def api(path):
        return json.loads(read(TREE_API + path, accept='application/vnd.github+json'))
    tags = {t['commit']['sha']: t['name'] for t in api('/tags?per_page=100')}
    out = {}
    for c in api('/commits?per_page=100'):
        msg = (c['commit']['message'] or '').split('\n')[0].strip()
        if not re.fullmatch(r'\d+\.\d+\.\d+[a-z]?', msg) or msg in out:
            continue        # a preview ("0.5.0 Preview 2") is not the patch
        ref = {'commit': c['sha'][:10], 'at': c['commit']['committer']['date'][:16] + 'Z'}
        if tags.get(c['sha']):
            ref['tag'] = tags[c['sha']]
        out[msg] = ref
    for sha, name in tags.items():          # a tag on a commit whose message is something else
        if name not in out and re.fullmatch(r'\d+\.\d+\.\d+[a-z]?', name):
            out[name] = {'commit': sha[:10], 'tag': name}
    return out


# ---------------------------------------------------------------- the rows
def family(v):
    """"0.5.5c" -> "0.5.5"."""
    return re.match(r'^\d+\.\d+\.\d+', v).group(0)


def patch_of_build(b):
    """Client build 4.5.5.2 -> patch family 0.5.5 (the rule tools/gamepull.py uses)."""
    m = re.match(r'^4\.(\d+)\.(\d+)', b or '')
    return '0.%s.%s' % m.groups() if m else None


def league_of(v, leagues):
    """The league whose version is the longest one this version starts with ("0.5.4" is Runes of Aldur, 0.5)."""
    best = None
    for lg in leagues:
        lv = lg.get('v') or ''
        if (family(v) == lv or family(v).startswith(lv + '.')) and (not best or len(lv) > len(best['v'])):
            best = lg
    return best


def openers(by, leagues):
    """A row for every league-opening patch that has started, even with no thread of its own: 0.1.0 went live
    with the game and was never given patch notes, but its hotfixes were."""
    today = dt.date.today().isoformat()
    for lg in leagues:
        lv = lg.get('v') or ''
        if not re.fullmatch(r'\d+\.\d+(\.\d+)?', lv) or not lg.get('start') or lg['start'] > today:
            continue
        v = lv if lv.count('.') == 2 else lv + '.0'
        if v not in by:
            by[v] = {'id': v, 'v': v, 'kind': 'patch'}


def fill(rows, leagues, tree):
    """What the other sources say about each row: its league, the day a league-opening patch went live, and
    the tree export that matches a patch."""
    for r in rows:
        lg = league_of(r['v'], leagues)
        if lg:
            r['league'] = lg['name']
            if r['kind'] == 'patch' and r['v'] in (lg['v'], lg['v'] + '.0') and lg.get('start'):
                r['live'] = lg['start']
        if r['kind'] == 'patch' and tree.get(r['v']):
            r['tree'] = tree[r['v']]


def order(rows):
    """Newest first, by the hour the notes went up; rows with no hour after, by version."""
    return sorted(rows, key=lambda r: (r.get('posted') or '', r['id']), reverse=True)


def index_build():
    """(build, the day the index was generated) off data/index.json."""
    head = (DATA / 'index.json').read_text(encoding='utf-8')[:400]
    b = re.search(r'"v"\s*:\s*"([^"]+)"', head)
    g = re.search(r'"gen"\s*:\s*"([^"]+)"', head)
    return (b.group(1) if b else None), (g.group(1)[:10] if g else None)


def add_build(builds, build, seen, src, **more):
    if not build or any(x['build'] == build for x in builds):
        return False
    row = {'build': build, 'patch': patch_of_build(build), 'seen': seen, 'src': src, **more}
    builds.append({k: v for k, v in row.items() if v})
    builds.sort(key=lambda x: [int(p) for p in re.findall(r'\d+', x['build'])], reverse=True)
    return True


# ---------------------------------------------------------------- the check
def check(reg, leagues):
    """Every problem with the registry, as plain lines. Empty when it holds."""
    bad, seen = [], set()
    names = {lg['name'] for lg in leagues}
    for r in reg.get('patches', []):
        rid = r.get('id')
        if not rid or rid in seen:
            bad.append('a row with no id, or twice: %r' % rid)
        seen.add(rid)
        if r.get('kind') not in KINDS:
            bad.append('%s: kind %r' % (rid, r.get('kind')))
        if not re.fullmatch(r'\d+\.\d+\.\d+[a-z]?', r.get('v') or ''):
            bad.append('%s: version %r' % (rid, r.get('v')))
        if r.get('posted') and not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z', r['posted']):
            bad.append('%s: posted %r is not a UTC hour' % (rid, r['posted']))
        if r.get('notes') and not r['notes'].startswith(THREAD):
            bad.append('%s: notes link %r is not a forum thread' % (rid, r['notes']))
        if r.get('league') and r['league'] not in names:
            bad.append('%s: league %r is not in data/leagues.json' % (rid, r['league']))
    for b in reg.get('builds', []):
        if not re.fullmatch(r'\d+(\.\d+){3}', b.get('build') or ''):
            bad.append('build %r' % b.get('build'))
        if b.get('src') not in SOURCES:
            bad.append('build %s names no source' % b.get('build'))
    return bad


# ---------------------------------------------------------------- the run
def main():
    ap = argparse.ArgumentParser(description='The patch registry, data/patches.json.')
    ap.add_argument('--notes', action='store_true', help='read the patch notes forum')
    ap.add_argument('--all', action='store_true', help='with --notes: every page, not only the new ones')
    ap.add_argument('--tree', action='store_true', help='read the passive tree export')
    ap.add_argument('--check', action='store_true', help='check the file, write nothing')
    args = ap.parse_args()

    leagues = (lastgood.committed('leagues.json', quiet=True) or {}).get('leagues', [])
    had = lastgood.committed(FILE, quiet=True) or {'patches': [], 'builds': []}
    if args.check:
        bad = check(had, leagues)
        for b in bad:
            print('  ' + b)
        print('patches: %d rows, %d builds, %s' % (len(had.get('patches', [])), len(had.get('builds', [])),
                                                   'ok' if not bad else '%d FAIL' % len(bad)))
        return 1 if bad else 0

    def build():
        reg = json.loads(json.dumps(had))
        reg.setdefault('patches', [])
        reg.setdefault('builds', [])
        by = {r['id']: r for r in reg['patches']}
        if args.notes:
            for r in forum(by, every=args.all):
                by[r['id']] = {**by.get(r['id'], {}), **r}
        openers(by, leagues)
        tree = tree_refs() if args.tree else {r['v']: r['tree'] for r in by.values() if r.get('tree')}
        rows = list(by.values())
        fill(rows, leagues, tree)
        reg['patches'] = order(rows)
        b, gen = index_build()
        stamp = lastgood.committed('gamedata.json', quiet=True) or {}
        dated = stamp.get('dated') if stamp.get('patch') == patch_of_build(b) else None
        if add_build(reg['builds'], b, gen or dt.date.today().isoformat(), 'index', dated=dated):
            print('  new client build %s (patch %s): take its snapshot, python tools/snapshot.py' % (b, patch_of_build(b)))
        bad = check(reg, leagues)
        if bad:
            raise lastgood.Stale('%d rows do not hold up, first: %s' % (len(bad), bad[0]))
        return reg

    out = lastgood.pull('Patch dates', build, file=FILE, url=FORUM if args.notes else '', at='patches', floor=1)
    if out is not None:
        body = {'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'), 'note': NOTE,
                'sources': SOURCES, 'patches': out['patches'], 'builds': out['builds']}
        was = {k: v for k, v in had.items() if k != 'updated'}
        if {k: v for k, v in body.items() if k != 'updated'} != was:
            lastgood.save(DATA / FILE, json.dumps(body, ensure_ascii=False, indent=1) + '\n')
            print('-> data/%s' % FILE)
        ps = out['patches']
        print('%d rows (%s), %d builds; newest: %s, posted %s' % (
            len(ps), ', '.join('%d %s' % (sum(r['kind'] == k for r in ps), k) for k in KINDS),
            len(out['builds']), ps[0]['id'] if ps else '-', ps[0].get('posted') if ps else '-'))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Patch dates', file=FILE, url=FORUM))
