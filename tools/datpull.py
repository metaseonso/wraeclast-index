"""The game's own tables (tools/datpull.mjs), under the last-good rule.

The reader is Node, because the only library that opens the game's bundles is (pathofexile-dat); the rule every
outside pull keeps is Python (tools/lastgood.py). So this runs the reader into a scratch folder and holds each file
it wrote up against the copy in data/game/ before that copy is replaced:

  * the reader stops, or the CDN, dat-schema or RePoE stops answering   every file stays as it is
  * one table comes back empty, or a fifth of its rows gone, or a kind   that file stays, the others move on
    of its rows gone (a pool of atlas corruption, a kind of sanctum effect)

and the fault is recorded, printed, ticketed and the run goes red, the same as every other builder
(README, "Last good wins"). data/game/_meta.json says which patch and which dat-schema commit each file is from,
so a file that was kept says so there.

Usage:
  python tools/datpull.py                     find today's patch folder, pull, keep what holds up
  python tools/datpull.py --patch 4.5.5.3     anything after the name goes to tools/datpull.mjs as it is

Needs Node 22 and `npm install` (pathofexile-dat is an optional dependency, like esbuild). Run after a game patch,
next to tools/gamepull.py.
"""
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
CDN = 'https://patch-poe2.poecdn.com/'
SECTION = 'Game tables'


def read(path):
    return json.loads(path.read_text(encoding='utf-8'))


def main():
    out = Path(tempfile.mkdtemp(prefix='datpull-'))
    try:
        node = shutil.which('node')
        if not node:
            raise lastgood.Stale('there is no Node here to run the reader with')
        r = subprocess.run([node, str(ROOT / 'tools' / 'datpull.mjs'), '--out', str(out), *sys.argv[1:]], cwd=str(ROOT))
        if r.returncode != 0:
            raise lastgood.Stale('the reader stopped (exit %d; what it said is above)' % r.returncode)
        meta = read(out / '_meta.json')
        home = lastgood.DATA / 'game'
        home.mkdir(parents=True, exist_ok=True)
        had = (lastgood.committed('game/_meta.json', quiet=True) or {}).get('files', {})
        for name in sorted(meta['files']):
            fresh = out / (name + '.json')
            got = lastgood.pull('%s: %s' % (SECTION, name), lambda: read(fresh), file='game/%s.json' % name, url=CDN, at='rows')
            if got is None:                      # kept: _meta.json keeps saying what the kept copy is
                if name in had:
                    meta['files'][name] = had[name]
                else:
                    del meta['files'][name]
                continue
            lastgood.save(home / fresh.name, fresh.read_text(encoding='utf-8'))
        meta['files'] = {**{k: v for k, v in had.items() if k not in meta['files']}, **meta['files']}
        meta['files'] = dict(sorted(meta['files'].items()))
        lastgood.save(home / '_meta.json', json.dumps(meta, ensure_ascii=False, indent=1) + '\n')
    finally:
        shutil.rmtree(out, ignore_errors=True)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, SECTION, file='game/_meta.json', url=CDN, at='files'))
