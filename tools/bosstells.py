"""data/bosstells.json: what a pinnacle boss's big hits look like before they land (#126).

The tells are kept by hand in tools/bosstells-src.json: per boss, per hit, the name the source uses for the move,
one short line in our own words, and every source that line stands on (name and address). This writes the file
the boss card reads, and holds the table to the game data first:

  * every boss is a boss in data/bosses.json;
  * every hit is one of that boss's hits in data/bosshits.json (its `n`), once;
  * every tell names a source with an https address; a cooldown only with a number.

A name it does not know stops the run with the name in the message, and the last good file stays (lastgood).
A patch that renames a hit in data/bosshits.json fails here until the table is brought up to it.

    python tools/pipeline.py --only bosstells   the way to run it: a patch stage, after bosshits
    python tools/bosstells.py                   write data/bosstells.json in place
    python tools/bosstells.py --report          say what it would write, write nothing
"""
import argparse
import datetime
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
import sitedata  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
SRC = ROOT / 'tools' / 'bosstells-src.json'
LONG = 220          # a tell is one short line: longer than this is a paragraph


def read(p):
    return json.loads(Path(p).read_text(encoding='utf-8'))


def build(src, bosses, hits):
    names = {b['name'] for b in bosses['bosses']}
    hit_names = {b['name']: [h['n'] for h in b.get('hits', [])] for b in hits['bosses']}
    known = src.get('sources', {})
    bad, out = [], []

    def check_src(where, pairs):
        if not pairs:
            bad.append('%s: no source' % where)
        for p in pairs:
            if not (isinstance(p, list) and len(p) == 2 and all(isinstance(x, str) and x for x in p)):
                bad.append('%s: a source is not [name, address]: %r' % (where, p))
            elif not p[1].startswith('https://'):
                bad.append('%s: %s has no https address: %s' % (where, p[0], p[1]))
            elif p[0] not in known:
                bad.append('%s: source %r is not in the table\'s sources' % (where, p[0]))

    for boss, rows in src.get('bosses', {}).items():
        if boss not in names:
            bad.append('boss %r is not in data/bosses.json' % boss)
            continue
        if boss not in hit_names:
            bad.append('boss %r has no hits in data/bosshits.json' % boss)
            continue
        seen, kept = set(), []
        for r in rows:
            hit = r.get('hit')
            where = '%s / %s' % (boss, hit)
            if hit not in hit_names[boss]:
                bad.append('hit %r is not one of %s\'s hits in data/bosshits.json (%s)'
                           % (hit, boss, ', '.join(hit_names[boss])))
                continue
            if hit in seen:
                bad.append('%s: twice' % where)
                continue
            seen.add(hit)
            tell = (r.get('tell') or '').strip()
            if not tell:
                bad.append('%s: no tell' % where)
            elif len(tell) > LONG:
                bad.append('%s: the tell is %d characters, over %d' % (where, len(tell), LONG))
            check_src(where, r.get('src'))
            if 'cd' in r and not (isinstance(r['cd'], (int, float)) and r['cd'] > 0):
                bad.append('%s: cooldown %r is not a number of seconds' % (where, r['cd']))
            row = {'n': hit, 'name': (r.get('name') or '').strip() or None, 'tell': tell,
                   'cd': r.get('cd'), 'src': [{'name': a, 'url': u} for a, u in r.get('src') or []]}
            kept.append({k: v for k, v in row.items() if v is not None})
        # the card's own order: the order data/bosshits.json lists the hits in
        order = {n: i for i, n in enumerate(hit_names[boss])}
        out.append({'name': boss, 'hits': sorted(kept, key=lambda x: order[x['n']])})
    for boss in src.get('none', {}):
        if boss not in names:
            bad.append('boss %r (under none) is not in data/bosses.json' % boss)
    if bad:
        raise ValueError('tools/bosstells-src.json: ' + '; '.join(bad))

    used = sorted({s['name'] for b in out for h in b['hits'] for s in h['src']})
    return {
        'built': datetime.date.today().isoformat(),
        'read': src.get('read'),
        'ids': [],
        'source': 'boss guides, read by hand: ' + ', '.join(used),
        'sources': [dict(name=n, **known[n]) for n in used],
        'note': 'Tells are from the named sources, each on the hit it belongs to. A hit with no '
                'source for its tell has none.',
        'bosses': sorted(out, key=lambda b: b['name']),
        'none': src.get('none', {}),
    }


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args(argv)
    src, bosses, hits = read(SRC), read(DATA / 'bosses.json'), read(DATA / 'bosshits.json')
    out = lastgood.pull('Boss tells', lambda: build(src, bosses, hits), file='bosstells.json', at='bosses', floor=1)
    if out is None:
        return lastgood.report() or 1
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    pin = [b['name'] for b in bosses['bosses'] if b.get('pinnacle')]
    told = {b['name'] for b in out['bosses']}
    print('bosstells: %d hits told on %d bosses, %d pinnacle bosses without one (%s), %s bytes' %
          (sum(len(b['hits']) for b in out['bosses']), len(out['bosses']), len([p for p in pin if p not in told]),
           ', '.join(p for p in pin if p not in told) or 'none', format(len(text), ',')))
    if not a.report:
        sitedata.save(DATA / 'bosstells.json', text)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Boss tells', file='bosstells.json', at='bosses'))
