"""Sync the Wraeclast Index artifact into the site.

The artifact page (gems, uniques, passive tree) is the drill-down. This script:
  1. copies it to explore.html and adds the small bridge script that links it to the home page
  2. builds data/index.json, the compact search index the home page loads

Usage:  python tools/sync.py path/to/artifact.html
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRIDGE = '<link rel="stylesheet" href="assets/bridge.css"><script src="assets/bridge.js" defer></script>'

RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}(?:\s*=\s*-?\d+)?|\{[^}\s]{1,80}\}')


def block(html, bid):
    m = re.search(r'<script id="%s" type="application/json">(.*?)</script>' % bid, html, re.S)
    if not m:
        sys.exit('missing data block: ' + bid)
    return json.loads(m.group(1))


def plain(t):
    """Game keyword markup [Id|Shown] or [Id] to plain words."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    t = re.sub(r'\[([^\]]+)\]', r'\1', t)
    return re.sub(r'\s+', ' ', t).strip()


def first_sentence(t, limit=150):
    t = plain(t)
    m = re.match(r'(.+?[.!?])(\s|$)', t)
    out = m.group(1) if m and len(m.group(1)) <= limit else t
    return out if len(out) <= limit else out[:limit - 1].rstrip() + '…'


def build_index(html):
    gems = block(html, 'gemdata')
    uq = block(html, 'uqdata')
    tr = block(html, 'trdata')
    kw = block(html, 'kwdata')
    items = []

    colour = {'r': 'Strength', 'g': 'Dexterity', 'b': 'Intelligence', 'w': ''}
    kind = {'active': 'Skill gem', 'spirit': 'Spirit gem', 'support': 'Support gem'}
    for g in gems['gems']:
        if re.match(r'^\[DNT|^Removed Skill$', g['n']):
            continue
        sub = kind.get(g['t'], 'Gem') + (' · ' + colour[g['c']] if colour.get(g.get('c')) else '')
        items.append({'k': 'g', 'id': g['id'], 'n': g['n'], 's': sub,
                      't': first_sentence(g.get('txt', '')), 'ic': g.get('ic'),
                      'q': ' '.join(g.get('tg', []))})

    uniq, seen_u = [], set()
    for u in uq['items']:   # the files repeat a few unlisted uniques verbatim
        sig = (u['n'], u.get('b'), tuple(u.get('ex') or []))
        if sig not in seen_u:
            seen_u.add(sig)
            uniq.append(u)
    names = {}
    for u in uniq:
        names[u['n']] = names.get(u['n'], 0) + 1
    for u in uniq:
        text = u.get('ex') or u.get('im') or []
        uid = u['n'] if names[u['n']] == 1 else u['n'] + ' | ' + (u.get('b') or '')   # variants share a name
        it = {'k': 'u', 'id': uid, 'n': u['n'], 's': ' · '.join(x for x in (u.get('b'), plain(u.get('c', ''))) if x),
              't': plain(text[0]) if text else '', 'ic': u.get('ic'), 'q': u.get('g', '')}
        items.append(it)

    seen = set()
    for p in tr['passives']:
        if p.get('k') not in ('keystone', 'notable', 'anoint') or not p.get('t'):
            continue
        if p['n'].startswith('[DNT') or (p['n'], p.get('a')) in seen:
            continue
        seen.add((p['n'], p.get('a')))
        label = p['k'].capitalize() + (' · ' + p['a'] if p.get('a') else '')
        items.append({'k': 'p', 'id': p['id'], 'n': p['n'], 's': label,
                      't': plain(' · '.join(p['t']))[:170], 'q': p.get('reg', '')})

    taken = {it['n'].lower() for it in items}
    for k, v in kw.items():
        if not v.get('t') or not v.get('d'):
            continue
        if v['t'].lower() in taken:   # a keystone or gem already has its own card
            continue
        items.append({'k': 'w', 'id': k, 'n': v['t'], 's': 'Keyword', 't': first_sentence(v['d'], 170),
                      'd': plain(v['d'])})

    for it in items:  # the standard: nothing in the search index may read as game code
        for f in ('n', 's', 't', 'd'):
            if it.get(f) and RAW.search(it[f]):
                sys.exit('raw game code in %s %r: %r' % (f, it['n'], it[f]))
        if not it.get('ic'):
            it.pop('ic', None)
        if not it.get('q'):
            it.pop('q', None)

    keys = [it['k'] + ':' + it['id'] for it in items]
    dup = {x for x in keys if keys.count(x) > 1}
    if dup:
        sys.exit('duplicate card keys: %s' % sorted(dup)[:10])
    return {'v': gems['meta'].get('game_version'), 'gen': gems['meta'].get('generated'),
            'sprites': gems.get('sprites'), 'items': items}


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    html = Path(sys.argv[1]).read_text(encoding='utf-8')
    index = build_index(html)
    (ROOT / 'data').mkdir(exist_ok=True)
    (ROOT / 'data' / 'index.json').write_text(
        json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if BRIDGE not in html:
        html = html.replace('</body>', BRIDGE + '\n</body>', 1)
    (ROOT / 'explore.html').write_text(html, encoding='utf-8', newline='')
    counts = {}
    for it in index['items']:
        counts[it['k']] = counts.get(it['k'], 0) + 1
    print('explore.html written; index.json:', counts)


if __name__ == '__main__':
    main()
