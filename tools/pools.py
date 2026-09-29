"""The odds pools as cards of their own (issue #110, design/hidden-odds.md, docs/data-plan.md kind `s`).

Reads data/odds.json (tools/odds.py, the game's own weight tables) and joins one card per pool onto data/index.json,
then writes the two parts the app loads (tools/appdata.py). It fetches nothing and works nothing out that the file
does not already say: the weights, the 1 in N and the flags are the file's own.

  s  Pool   one per pool, in the file's own order. Its id is its name, and nothing on it is an internal id

A row:
  n, s    the pool's name, and what it rolls in ("a Forbidden Rite on the Atlas")
  nn      how many outcomes it has
  tw      the pool's total weight
  tp      the most likely outcome's 1 in N
  oc      the outcomes, heaviest first, each [name, weight, 1 in N (0 where the weight is 0), the game's words]
  ro      the cards its outcomes name (assets/kinds.js MAPS ro): "Can roll" one way, "Rolls in" the other
  un, uw  Subject to change, and the file's own reason, where the pool's shape is our reading of the table
  src     the file's source line

An outcome names a card where its name is exactly the name of a card of a kind that draws how often it rolls (the
kinds whose declaration in assets/kinds.js carries the `weight` field), or of a price row the market lists under
such a kind. "2 Divine Orbs" is not the Divine Orb card. A weight of 0 names no card: it cannot roll today.

Runs before tools/nodelinks.py, so every run links the same cards.

    python tools/pools.py
"""
import json
import re
from pathlib import Path

import appdata
import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
KINDS_JS = ROOT / 'assets' / 'kinds.js'
KIND = 's'   # the letter the index marks a pool with (assets/kinds.js), taken off again before it is written
FIELD = 'weight'   # the field a kind's card draws how often it rolls with (assets/kinds.js FIELDS)


def load(name, default=None):
    try:
        return json.loads((DATA / name).read_text(encoding='utf-8'))
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def weight_kinds():
    """The kinds whose cards draw how often they roll: read off the declarations, never listed here."""
    src = KINDS_JS.read_text(encoding='utf-8')
    body = src[src.index('export const KINDS'):src.index('export const DEFAULT')]
    cuts = [m.start() for m in re.finditer(r"\{k: '(\w)'", body)]
    out = []
    for i, start in enumerate(cuts):
        row = body[start:cuts[i + 1] if i + 1 < len(cuts) else len(body)]
        m = re.search(r"fields: \[([^\]]*)\]", row)
        if m and ("'%s'" % FIELD) in m.group(1):
            out.append(re.match(r"\{k: '(\w)'", row).group(1))
    if not out:
        raise SystemExit('pools: no kind in assets/kinds.js draws the %s field' % FIELD)
    return out


def main():
    odds = load('odds.json')
    index = load('index.json')
    market = set((load('market.json', {'items': {}}).get('items') or {}))
    kinds = weight_kinds()

    items = [it for it in index['items'] if it['k'] != KIND]
    by_name = {}
    for it in items:
        if it['k'] in kinds:
            by_name.setdefault(it['n'], []).append(it['k'] + ':' + it['id'])

    def cards(name):
        """Every card this exact name is: the index's own, then a price row the market lists by the name."""
        keys = list(by_name.get(name, []))
        for k in kinds:
            key = k + ':' + name
            if key in market and not any(x.startswith(k + ':') for x in keys):
                keys.append(key)
        return keys

    source = odds.get('source') or ''
    flags = odds.get('flags') or {}
    rows, named, seen = [], 0, set()
    for p in odds.get('pools') or []:
        name = (p.get('pool') or '').strip()
        if not name or name in seen:
            raise SystemExit('pools: a pool with no name, or two named %r' % name)
        seen.add(name)
        outs = [o for o in p.get('outcomes') or [] if o.get('name')]
        # heaviest first; a weight of 0 last. Python's sort keeps the file's own order among equals
        outs = sorted(outs, key=lambda o: -(o.get('weight') or 0))
        oc, ro = [], []
        for o in outs:
            w = o.get('weight') or 0
            row = [o['name'], w, (o.get('oneIn') or 0) if w > 0 else 0]
            words = [x.strip() for x in (o.get('text') or '').split('\n') if x.strip()]
            if words:
                row.append(words)
            oc.append(row)
            if w > 0:
                for key in cards(o['name']):
                    if key not in ro:
                        ro.append(key)
        live = [o for o in outs if (o.get('weight') or 0) > 0]
        row = {'k': KIND, 'id': name, 'n': name, 's': p.get('of') or 'Odds', 'nn': len(outs)}
        if p.get('total'):
            row['tw'] = p['total']
        if live and live[0].get('oneIn'):
            row['tp'] = live[0]['oneIn']
        row['oc'] = oc
        if ro:
            row['ro'] = ro
            named += len(ro)
        if not p.get('sure'):
            flag = p.get('flag') or 'Subject to change'
            if flag not in flags:
                raise SystemExit('pools: %s carries the flag %r, which data/odds.json does not word' % (name, flag))
            row['un'] = 1
            if p.get('why'):
                row['uw'] = p['why']
        if source:
            row['src'] = 'Source: ' + source
        rows.append(row)
    if not rows:
        raise SystemExit('pools: data/odds.json holds no pool')

    index['items'] = items + rows
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json %d KB · pools %d, %d flagged, %d cards named (kinds %s)' % (
        len(body.encode('utf-8')) // 1024, len(rows), sum(1 for r in rows if r.get('un')), named, ', '.join(kinds)))
    appdata.write(index)


if __name__ == '__main__':
    main()
