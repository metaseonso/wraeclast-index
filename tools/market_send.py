"""Pack data/market/ for the site: the files the daily Market job in the data repo sends to POST /api/data/put
(metaseonso/wraeclast-data, .github/workflows/market.yml; worker/files.js MARKET), which the worker serves at
/data/market/<name> with their age. Nothing here is committed and nothing is sent from here: the job sends what
this writes, signed with its own GitHub token.

    python tools/market_send.py                pack into build/market-send/ and say each file's bytes
    python tools/market_send.py --out DIR      somewhere else

What it writes (each at most LIMIT bytes, under the worker's 1.5 MB; every one carries the source, the flag and
the rule):
  <product>.json          each top-level file tools/market_history.py wrote, as it is (liquidity.json, ...)
  <folder>.json           a folder of files (shocks/, digest/) as one file: {"files": {"<its name>": <the file>}}
  cards-<n>.json          the currency cards' parts (data/market/card/<did>.json, never committed), in as few
                          bundles as fit: {"cards": {"<did>": <the card>}}. A card's bundle is crc32(did) mod the
                          bundle count, so a card stays in its bundle from one day to the next
  index.json              data/market/index.json, and "site": each file's bytes, the bundle count, and each did's
                          bundle ({"cards": {"<did>": n}}): a page reads it to know which bundle has its card

A name the worker would not take, a file over the limit, or a file without its source or flag stops it: the
job then sends nothing. Run after tools/market_history.py (the pipeline's markethistory stage).
"""
import argparse
import json
import math
import re
import shutil
import sys
import zlib
from pathlib import Path

import marketlib as ml
import sitedata

SRC = sitedata.DATA / 'market'
OUT = ml.ROOT / 'build' / 'market-send'
LIMIT = 1_400_000          # bytes a file may be here: the worker takes 1.5e6 (worker/files.js MAX)
PER_BUNDLE = 1_000_000     # the card bytes a bundle starts out with, so each day's growth has room
MOST = 16                  # bundles the worker takes (cards-1 .. cards-16)


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def allowed():
    """The worker's own pattern for a market file name (worker/files.js MARKET), so the two never drift apart."""
    text = (ml.ROOT / 'worker' / 'files.js').read_text(encoding='utf-8')
    m = re.search(r'const MARKET = /(.+)/;', text)
    if not m:
        sys.exit('worker/files.js has no MARKET pattern: nothing would be taken')
    return re.compile(m.group(1).replace('\\/', '/'))


def bundles(cards, updated):
    """{did: card text} -> ({name: bundle}, {did: n}): the fewest bundles (crc32 of the did) that each fit LIMIT."""
    total = sum(len(t.encode('utf-8')) for t in cards.values())
    n = max(1, math.ceil(total / PER_BUNDLE))
    while n <= MOST:
        where = {d: zlib.crc32(d.encode('utf-8')) % n + 1 for d in cards}
        size = [0] * (n + 1)
        for d, t in cards.items():
            size[where[d]] += len(t.encode('utf-8')) + len(d) + 4
        if max(size) < LIMIT - 2000:
            break
        n += 1
    else:
        sys.exit('the cards do not fit %d bundles of %d bytes: raise MOST here and in worker/files.js' % (MOST, LIMIT))
    out = {}
    for k in range(1, n + 1):
        out['cards-%d.json' % k] = {
            'source': ml.SOURCE, 'flags': ml.FLAGS, 'updated': updated, 'thresholds': ml.THRESHOLDS,
            'rule': 'Each currency card\'s parts, by the card\'s did: bundle %d of %d (crc32 of the did, mod %d, plus 1). '
                    'Each card names the file each part\'s rule is in.' % (k, n, n),
            'cards': {d: json.loads(cards[d]) for d in sorted(cards) if where[d] == k}}
    return out, where


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--out', default=str(OUT))
    a = ap.parse_args(argv)
    out = Path(a.out)
    if not (SRC / 'index.json').exists():
        sys.exit('no %s: run tools/market_history.py first' % (SRC / 'index.json'))
    index = ml.load(SRC / 'index.json')
    updated = index.get('updated')
    files = {}
    for p in sorted(SRC.iterdir()):
        if p.is_file() and p.suffix == '.json' and p.name != 'index.json':
            files[p.name] = p.read_text(encoding='utf-8')
        elif p.is_dir() and p.name != 'card':
            inner = {q.stem: ml.load(q) for q in sorted(p.glob('*.json'))}
            if inner:
                files[p.name + '.json'] = dump({
                    'source': ml.SOURCE, 'flags': ml.FLAGS, 'updated': updated, 'thresholds': ml.THRESHOLDS,
                    'rule': 'Every file of data/market/%s/ by its name; each carries its own rule.' % p.name,
                    'files': inner})
    cards = {q.stem: q.read_text(encoding='utf-8') for q in sorted((SRC / 'card').glob('*.json'))}
    where = {}
    if cards:
        packed, where = bundles(cards, updated)
        files.update({k: dump(v) for k, v in packed.items()})
    site = {'files': {k: len(v.encode('utf-8')) for k, v in sorted(files.items())},
            'bundles': len([k for k in files if k.startswith('cards-')]), 'cards': dict(sorted(where.items())),
            'note': 'What the site serves at /data/market/<name> (tools/market_send.py). A card is in '
                    'cards-<cards[did]>.json.'}
    files['index.json'] = dump(dict(index, site=site))

    ok, bad = allowed(), []
    for name, text in files.items():
        b = len(text.encode('utf-8'))
        if not ok.match('market/' + name):
            bad.append('%s: not a name the worker takes (worker/files.js MARKET)' % name)
        if b > LIMIT:
            bad.append('%s: %d bytes, over %d' % (name, b, LIMIT))
        j = json.loads(text)
        if not str(j.get('source', '')).startswith('Source: ') or ml.FLAG not in (j.get('flags') or {}):
            bad.append('%s: no source or flag at its top' % name)
    if bad:
        for b in bad:
            print('FAIL', b)
        return 1
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    for name, text in sorted(files.items()):
        sitedata.save(out / name, text)
        print('%-22s %8.1f kB' % (name, len(text.encode('utf-8')) / 1000))
    print('%d files in %s, %d cards in %d bundles' % (len(files), out, len(cards), site['bundles']))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
