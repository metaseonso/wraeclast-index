"""Freeze the index under the patch it is from: every card's fields that can change between patches (numbers,
lines, tags, requirements, a gem's text at every level), one compact file per kind. Prices are not in it.
Each patch we do not freeze is gone: the export only ever holds the patch that is live.

A snapshot is named by the client build the index was built from (data/index.json "v", e.g. 4.5.5.2), because
that is the one thing the data itself states; data/patches.json ties the build to its patch (tools/patches.py).
Two hotfixes that change the game files are two builds, so they are two snapshots.

    python tools/snapshot.py               the current index, into tools/cache/snapshots/<build>/ (not in git)
    python tools/snapshot.py --out DIR     somewhere else
    python tools/snapshot.py --upload      the same, then kept as the release snapshot-<build> on the data repo
    python tools/snapshot.py --get BUILD   a kept snapshot, downloaded into tools/cache/snapshots/<build>/
    python tools/snapshot.py --list        the snapshots the data repo keeps

What is in a snapshot folder:
  meta.json       the build, its patch family, when the index was generated and when this was taken, and per
                  kind the card count, the fields kept and the sha256 of the file's JSON
  <kind>.json.gz  {"k": kind, "build": ..., "cards": {card id: {field: value}}}: the index's own fields for
                  that kind, without the ones that only draw the card (pictures, link marks, search words,
                  keyword chips, counts worked out from other cards). Gems also carry their text at every level
                  (lv: one list per line, level 1 first) and the fixed lines of each part of the skill (tx),
                  from the drill-down page's gem files. Our own mechanics cards are left out: they are our
                  writing, not the game's.
The same index gives the same bytes, so a snapshot taken twice is the same file, and an upload that would
change nothing changes nothing.

Where they are kept: GitHub release assets on the private data repo (WI_DATA_REPO, default
metaseonso/wraeclast-data), one release per build, tag snapshot-<build>. Outside this repo's history, and free.
The upload and download go through the gh CLI: signed in as the owner, or GH_TOKEN set to the data repo's own
token in its workflow (.github/workflows/wraeclast-index.yml there, kept here at tools/data-repo/, which checks
this repo out and runs this twice a day). While a build is current, a
new upload replaces its files (the index is rebuilt more often than the game patches); once the index moves to a
new build, the old release is never touched again.
"""
import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
HOME = ROOT / 'tools' / 'cache' / 'snapshots'
REPO = os.environ.get('WI_DATA_REPO') or 'metaseonso/wraeclast-data'
TAG = 'snapshot-'
SKIP_KINDS = {'h', 'q'}          # our own mechanics cards
# fields that only draw a card or are worked out from other cards: they move whenever the site does, not the game
DRAW = {'k', 'id', 'img', 'ic', 'lx', 'q', 'kw', 'use', 'lo', 'cr', 'cw', 'f', 'fg', 'src'}
MARKUP = [(re.compile(r'\[([^\]|]+)\|([^\]]+)\]'), r'\2'), (re.compile(r'\[([^\]]+)\]'), r'\1')]


def plain(t):
    """Game keyword markup ([Id|Shown], [Id]) to the words a player reads, the way tools/sync.py does."""
    t = t or ''
    for pat, rep in MARKUP:
        t = pat.sub(rep, t)
    return re.sub(r'\s+', ' ', t).strip()


def canon(obj):
    return json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def explore_file(stem):
    """The drill-down page's current file of one name (explore.html names it with its content hash)."""
    m = re.search(r'\b' + stem + r'\.([0-9a-f]+)\.json', (ROOT / 'explore.html').read_text(encoding='utf-8'))
    return DATA / 'explore' / ('%s.%s.json' % (stem, m.group(1))) if m else None


def gem_extras(build):
    """{gem id: {'lv': [...], 'tx': [...], 'crit': [...], 'ml': n}} from the drill-down gem files, which must be
    from the same build as the index (a snapshot never mixes two)."""
    gf, tf = explore_file('gems'), explore_file('gemtext')
    if not gf or not tf:
        raise SystemExit('explore.html names no gem files; run tools/sync.py first')
    gems = json.loads(gf.read_text(encoding='utf-8'))
    got = (gems.get('meta') or {}).get('game_version')
    if got != build:
        raise SystemExit('the gem files are build %s and the index is %s: rebuild with tools/sync.py first' % (got, build))
    text = json.loads(tf.read_text(encoding='utf-8'))
    out = {}
    for g in gems['gems']:
        e = {}
        sets = g.get('ss') or []
        crit = [s['crit'] / 100 for s in sets if isinstance(s.get('crit'), (int, float))]
        if crit:
            e['crit'] = crit
        tx = [plain(v) for s in sets for v in (s.get('tx') or {}).values() if plain(v)]
        if tx:
            e['tx'] = tx
        if g.get('ml'):
            e['ml'] = g['ml']
        lv = []
        for s in text.get(g['id']) or []:
            for levels in (s or {}).values():
                top = max((int(x) for x in levels if x.isdigit()), default=0)
                line = [plain(levels.get(str(n))) or None for n in range(1, top + 1)]
                if any(line):
                    lv.append(line)
        if lv:
            e['lv'] = lv
        if e:
            out[g['id']] = e
    return out, {'gems': gf.name, 'gemtext': tf.name}


def take(out_dir):
    """Write the snapshot of the current index into out_dir. Returns its meta."""
    index = json.loads((DATA / 'index.json').read_text(encoding='utf-8'))
    build = index.get('v')
    if not re.fullmatch(r'\d+(\.\d+){3}', build or ''):
        raise SystemExit('data/index.json carries no client build ("v"): %r' % build)
    extras, files = gem_extras(build)
    kinds = {}
    for it in index['items']:
        k = it.get('k')
        if k in SKIP_KINDS:
            continue
        card = {f: v for f, v in it.items() if f not in DRAW and v not in (None, '', [], {})}
        if k == 'g' and it['id'] in extras:
            card.update(extras[it['id']])
        kinds.setdefault(k, {})[it['id']] = card
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for old in out_dir.glob('*.json.gz'):
        old.unlink()
    meta = {'build': build, 'patch': re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', build), 'gen': index.get('gen'),
            'taken': dt.datetime.now(dt.timezone.utc).strftime('%Y-%m-%dT%H:%MZ'),
            'from': {'index': 'data/index.json', **{k: 'data/explore/' + v for k, v in files.items()}},
            'tool': 'tools/snapshot.py', 'kinds': {}}
    for k in sorted(kinds):
        body = canon({'k': k, 'build': build, 'cards': kinds[k]}).encode('utf-8')
        packed = gzip.compress(body, compresslevel=9, mtime=0)
        (out_dir / (k + '.json.gz')).write_bytes(packed)
        fields = sorted({f for c in kinds[k].values() for f in c})
        meta['kinds'][k] = {'cards': len(kinds[k]), 'fields': fields, 'bytes': len(packed),
                            'sha256': hashlib.sha256(body).hexdigest()}
    (out_dir / 'meta.json').write_text(json.dumps(meta, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    return meta


def load(where):
    """A snapshot as {'meta': ..., 'kinds': {k: {id: card}}}, from a folder or a build number (downloaded if it is
    not here yet)."""
    p = Path(where)
    if not p.is_dir():
        p = HOME / str(where)
        if not (p / 'meta.json').exists():
            get(str(where))
    meta = json.loads((p / 'meta.json').read_text(encoding='utf-8'))
    kinds = {}
    for k, info in meta['kinds'].items():
        body = gzip.decompress((p / (k + '.json.gz')).read_bytes())
        if hashlib.sha256(body).hexdigest() != info['sha256']:
            raise SystemExit('%s/%s.json.gz does not match its meta.json: take or download it again' % (p, k))
        kinds[k] = json.loads(body)['cards']
    return {'meta': meta, 'kinds': kinds, 'dir': p}


# ---------------------------------------------------------------- the data repo
def gh(*args, check=True):
    if not shutil.which('gh'):
        raise SystemExit('the gh CLI is needed to reach %s' % REPO)
    r = subprocess.run(['gh', *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise SystemExit('gh %s failed: %s' % (' '.join(args[:3]), (r.stderr or r.stdout).strip()[:300]))
    return r


def get(build):
    """Download snapshot-<build> into tools/cache/snapshots/<build>/."""
    dest = HOME / build
    dest.mkdir(parents=True, exist_ok=True)
    gh('release', 'download', TAG + build, '-R', REPO, '-D', str(dest), '--clobber')
    print('got %s%s from %s -> %s' % (TAG, build, REPO, dest.relative_to(ROOT)))


def upload(folder, meta):
    """Keep the snapshot as the release snapshot-<build>. Nothing is sent when the release already holds the
    same files."""
    tag = TAG + meta['build']
    files = [str(folder / 'meta.json')] + [str(folder / (k + '.json.gz')) for k in sorted(meta['kinds'])]
    have = gh('release', 'view', tag, '-R', REPO, '--json', 'assets', check=False)
    if have.returncode == 0:
        with tempfile.TemporaryDirectory() as t:
            gh('release', 'download', tag, '-R', REPO, '-p', 'meta.json', '-D', t)
            kept = json.loads((Path(t) / 'meta.json').read_text(encoding='utf-8'))
        if {k: v['sha256'] for k, v in kept['kinds'].items()} == {k: v['sha256'] for k, v in meta['kinds'].items()}:
            print('%s on %s already holds these cards (taken %s): nothing sent' % (tag, REPO, kept.get('taken')))
            return
        gh('release', 'upload', tag, *files, '-R', REPO, '--clobber')
        stale = {a['name'] for a in json.loads(have.stdout).get('assets', [])} - {Path(f).name for f in files}
        for name in sorted(stale):
            gh('release', 'delete-asset', tag, name, '-R', REPO, '-y')
        print('%s on %s: files replaced (the index changed within build %s)' % (tag, REPO, meta['build']))
        return
    notes = ('Every card of the index at client build %s (patch %s), frozen by tools/snapshot.py in wraeclast-index. '
             'Index generated %s, snapshot taken %s. %s.' % (
                 meta['build'], meta['patch'], meta.get('gen'), meta['taken'],
                 ', '.join('%s %d' % (k, v['cards']) for k, v in meta['kinds'].items())))
    gh('release', 'create', tag, *files, '-R', REPO, '--title', 'Snapshot %s (build %s)' % (meta['patch'], meta['build']),
       '--notes', notes)
    print('%s kept on %s' % (tag, REPO))


def listing():
    r = gh('release', 'list', '-R', REPO, '--limit', '200', '--json', 'tagName,name,createdAt')
    rows = [x for x in json.loads(r.stdout or '[]') if x['tagName'].startswith(TAG)]
    for x in rows:
        print('%-24s %s  %s' % (x['tagName'], x['createdAt'][:10], x['name']))
    print('%d snapshots on %s' % (len(rows), REPO))


def main():
    ap = argparse.ArgumentParser(description='Freeze the index under its patch.')
    ap.add_argument('--out', help='the folder to write (default tools/cache/snapshots/<build>)')
    ap.add_argument('--upload', action='store_true', help='keep it as a release on the data repo')
    ap.add_argument('--get', metavar='BUILD', help='download a kept snapshot')
    ap.add_argument('--list', action='store_true', help='the snapshots the data repo keeps')
    args = ap.parse_args()
    if args.list:
        return listing()
    if args.get:
        return get(args.get)
    build = json.loads((DATA / 'index.json').read_text(encoding='utf-8')).get('v')
    folder = Path(args.out) if args.out else HOME / str(build)
    meta = take(folder)
    total = sum(v['bytes'] for v in meta['kinds'].values())
    print('snapshot %s (patch %s): %s -> %s, %.0f KB' % (
        meta['build'], meta['patch'], ', '.join('%s %d' % (k, v['cards']) for k, v in meta['kinds'].items()),
        folder, total / 1024))
    if args.upload:
        upload(folder, meta)
    return 0


if __name__ == '__main__':
    sys.exit(main())
