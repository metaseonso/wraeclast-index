"""A normal monster's life and damage at an area's level, on the Area and Waystone cards (issue #80, design/boss-hits.md).

Reads data/bosshits.json (tools/bosshits.py): `levels`, the game's own DefaultMonsterStats by area level, and
`tiers`, the game's own MapTiers (waystone tier to area level). Its `labels.levels` is the label the numbers carry,
and the file gives none: they are the game's own, so they are written as they are and nothing is worked out.

  ml   a normal monster's life at the area's level
  md   a normal monster's damage at the area's level, as the table gives it

Onto every Area card whose level is one level (data/areas.json `lv`; a map whose level comes from its Waystone has
none of its own and gets nothing), and every Waystone card, by the tier in its name. The fields are taken off
first, so a card that no longer has a level loses them.

Runs after tools/world.py (it writes the Area cards) and before tools/nodelinks.py.

    python tools/monsterlevels.py
"""
import json
import re
from pathlib import Path

import appdata
import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
FIELDS = ('ml', 'md')
TIER = re.compile(r'\(Tier (\d+)\)$')


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def main():
    hits = load('bosshits.json')
    index = load('index.json')
    areas = load('areas.json')['areas']
    if (hits.get('labels') or {}).get('levels'):
        raise SystemExit('monsterlevels: data/bosshits.json now labels its levels %r; the cards draw no label'
                         % hits['labels']['levels'])
    lv = hits.get('levels') or {}
    cols = lv.get('cols') or []
    for c in ('level', 'life', 'damage'):
        if c not in cols:
            raise SystemExit('monsterlevels: data/bosshits.json levels has no %r column' % c)
    at = {c: cols.index(c) for c in ('level', 'life', 'damage')}
    by_level = {r[at['level']]: (r[at['life']], r[at['damage']]) for r in lv.get('rows') or []}
    if len(by_level) < 90:
        raise SystemExit('monsterlevels: data/bosshits.json has %d area levels, not 1 to 100' % len(by_level))
    tiers = dict((t, a) for t, a in hits.get('tiers') or [])

    area_level = {}
    for a in areas:
        v = a.get('lv')
        if isinstance(v, list):
            v = v[0] if v and v[0] == v[-1] else None
        if isinstance(v, int) and a.get('id'):
            area_level['r:' + a['id'][0]] = v

    done = {'r': 0, 'a': 0}
    for it in index['items']:
        for f in FIELDS:
            it.pop(f, None)
        key = it['k'] + ':' + it['id']
        level = None
        if it['k'] == 'r' and not it.get('way'):
            level = area_level.get(key)
        elif it['k'] == 'a' and it.get('at') == 'ways':
            m = TIER.search(it['n'])
            level = tiers.get(int(m.group(1))) if m else None
        if level in by_level:
            it['ml'], it['md'] = by_level[level]
            done[it['k']] += 1
    if not done['r'] or not done['a']:
        raise SystemExit('monsterlevels: %d areas and %d waystones found a level; both should' % (done['r'], done['a']))

    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json %d KB · monster life and damage on %d areas and %d waystones' % (
        len(body.encode('utf-8')) // 1024, done['r'], done['a']))
    appdata.write(index)


if __name__ == '__main__':
    main()
