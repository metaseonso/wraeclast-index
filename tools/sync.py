"""Sync the Wraeclast Index artifact into the site.

The artifact page (gems, uniques, passive tree) is the drill-down. This script:
  1. rewrites each unique's mod lines to the official ones (data/uniques.json, from tools/uniques.py),
     keeping the keyword links wherever the wording matches
  2. copies the page to explore.html and adds the small bridge script that links it to the home page
  3. builds data/index.json, the compact search index the home page loads

Usage:  python tools/sync.py path/to/artifact.html
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BRIDGE = '<script src="assets/bridge.js" defer></script>'
# In <head>, so the drill-down never paints in its old look first: the fonts, the shared card and
# theme styles, the drill-down's own additions, and the icon.
HEAD = ('<link rel="icon" type="image/png" sizes="64x64" href="assets/brand/favicon-64.png">'
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&display=swap">'
        '<link rel="stylesheet" href="assets/cards.css"><link rel="stylesheet" href="assets/theme.css">'
        '<link rel="stylesheet" href="assets/bridge.css">')
# The header as the app draws it: the brand is a link home with the crest, then the app's own tabs.
MAST_OLD = '<h1 class="brand">Wraeclast <em>Index</em></h1>\n    <nav class="nav" id="nav" aria-label="Sections"></nav>'
MAST_NEW = ('<a href="./" class="brand-link"><h1 class="brand"><span class="mark" aria-hidden="true">'
            '<img class="mark-wisp" src="assets/brand/wisp-b.webp" alt="" decoding="async" fetchpriority="low">'
            '<img class="mark-logo" src="assets/brand/logo-64.webp" alt="" width="51" height="64"></span>Wraeclast <em>Index</em></h1></a>\n'
            '    <nav class="applinks" aria-label="App"><a href="./#/">Search</a><a href="./#/build">Build</a><a href="./#/currency">Currency</a><a href="./#/trade">Trade</a><a href="./#/farms">Farms</a></nav>\n'
            '    <nav class="nav" id="nav" aria-label="Sections"></nav>')
CL_OLD = '<button class="clbtn" id="clbtn" type="button">Patch notes</button>'
CL_NEW = '<div class="topsearch" id="topsearch"></div>\n    ' + CL_OLD

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


# ---- official unique lines (data/uniques.json, from tools/uniques.py) ----
# A number, a range, or a signed range: 5, +(40-60), -(5-1), (4.01-5.48)
NUM = re.compile(r'[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?')


def skeleton(line):
    """A mod line with every number replaced, so a rolled line and its official range compare equal."""
    return NUM.sub('#', plain(line))


def transfer(marked, official):
    """The official numbers, written into the line that already carries the keyword links."""
    nums = iter(NUM.findall(official))
    parts = re.split(r'(\[[^\]]*\])', marked)
    return ''.join(p if p.startswith('[') else NUM.sub(lambda m: next(nums, m.group(0)), p) for p in parts)


def load_official():
    f = ROOT / 'data' / 'uniques.json'
    if not f.exists():
        return {}, {}
    o = json.loads(f.read_text(encoding='utf-8'))
    by_name = {}
    for k, v in o.items():
        by_name.setdefault(k.split(' | ')[0], []).append(v)
    return o, by_name


def official_for(u, o, by_name):
    """The official entry for a unique: same name and base, else the base variant it was forged from."""
    key = u['n'] + ' | ' + (u.get('b') or '')
    if key in o:
        return o[key], True
    b = re.sub(r'^(Runeforged|Runemastered) ', '', u.get('b') or '')
    if u['n'] + ' | ' + b in o:
        return o[u['n'] + ' | ' + b], False
    c = by_name.get(u['n'])
    return (c[0], False) if c and len(c) == 1 else (None, False)


def officialize(uq):
    """Rewrite each unique's mod lines to the official ones, in place. Returns how many changed."""
    o, by_name = load_official()
    changed = 0
    for u in uq['items']:
        off, exact = official_for(u, o, by_name)
        if not off:
            continue
        old = (u.get('im') or []) + (u.get('ex') or [])
        used, lines = set(), []
        for ol in off['ls']:
            sk = skeleton(ol)
            hit = next((i for i, a in enumerate(old) if i not in used and skeleton(a) == sk), None)
            if hit is None:
                lines.append(ol)
            else:
                used.add(hit)
                lines.append(transfer(old[hit], ol))
        ni = off.get('ni', 0)
        im, ex = lines[:ni], lines[ni:]
        if im != (u.get('im') or []) or ex != (u.get('ex') or []):
            changed += 1
        u['im'], u['ex'] = im, ex
        if exact and off.get('rq') and off['rq'][0]:
            u['lv'] = off['rq'][0]
    return changed


def put(html, bid, obj):
    m = re.search(r'(<script id="%s" type="application/json">)(.*?)(</script>)' % bid, html, re.S)
    return html[:m.start(2)] + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + html[m.end(2):]


def with_official_uniques(html):
    uq = block(html, 'uqdata')
    n = officialize(uq)
    return put(html, 'uqdata', uq), n


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
    emo = tr.get('emotions') or {}
    reqs = json.loads((ROOT / 'data' / 'reqs.json').read_text(encoding='utf-8'))['bases']
    items = []

    colour = {'r': 'Strength', 'g': 'Dexterity', 'b': 'Intelligence', 'w': ''}
    kind = {'active': 'Skill gem', 'spirit': 'Spirit gem', 'support': 'Support gem'}
    for g in gems['gems']:
        if re.match(r'^\[DNT|^Removed Skill$', g['n']):
            continue
        sub = kind.get(g['t'], 'Gem') + (' · ' + colour[g['c']] if colour.get(g.get('c')) else '')
        tags = [plain(gems['gem_tags'][t]) for t in g.get('tg', []) if gems['gem_tags'].get(t)]
        it = {'k': 'g', 'id': g['id'], 'n': g['n'], 's': sub, 't': plain(g.get('txt', '')), 'ic': g.get('ic'),
              'q': ' '.join(g.get('tg', [])), 'tags': tags}
        if g['t'] != 'support':   # attribute weights; the page turns them into requirements at any gem level
            it['w'] = [g['rq'].get('strength', 0), g['rq'].get('dexterity', 0), g['rq'].get('intelligence', 0)]
        if g.get('cast'):
            it['ct'] = g['cast']
        for res, v in (g.get('cost') or {}).items():
            v = v[19] if isinstance(v, list) and len(v) >= 20 else (v[-1] if isinstance(v, list) and v else v)
            if v:
                it['cost'] = [v, res]
                break
        if (g.get('res') or {}).get('spirit') is not None:
            sp = g['res']['spirit']
            it['sp'] = sp[19] if isinstance(sp, list) and len(sp) >= 20 else sp
        items.append(it)

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
              'ic': u.get('ic'), 'q': u.get('g', ''),
              'ls': [plain(y) for x in (u.get('im') or []) + (u.get('ex') or []) for y in x.split('\n') if y.strip()]}
        base = reqs.get(u.get('b') or '')
        lv = u.get('lv') or (base[0] if base else 0)
        if base or lv:
            it['rq'] = [lv] + (base[1:] if base else [0, 0, 0])
        ni = len([y for x in (u.get('im') or []) for y in x.split('\n') if y.strip()])
        if ni:
            it['ni'] = ni   # the first ni lines are implicit mods (the Trade button needs to know)
        if u.get('pr'):
            it['pr'] = [plain(x) for x in u['pr']]
        if u.get('cor'):
            it['cor'] = 1
        items.append(it)

    seen = set()
    for p in tr['passives']:
        if p.get('k') not in ('keystone', 'notable', 'anoint') or not p.get('t'):
            continue
        if p['n'].startswith('[DNT') or (p['n'], p.get('a')) in seen:
            continue
        seen.add((p['n'], p.get('a')))
        label = p['k'].capitalize() + (' · ' + p['a'] if p.get('a') else '')
        it = {'k': 'p', 'id': p['id'], 'n': p['n'], 's': label, 'q': p.get('reg', ''),
              'ls': [plain(y) for x in p['t'] for y in x.split('\n') if y.strip()]}
        if p.get('a'):
            it['asc'] = p['a']
        elif p.get('reg'):
            it['reg'] = p['reg']
        if p.get('rec'):
            it['rec'] = [emo.get(r, {}).get('name', '') for r in p['rec']]
            if p.get('ac'):
                it['ac'] = p['ac']
        items.append(it)

    taken = {it['n'].lower() for it in items}
    for k, v in kw.items():
        if not v.get('t') or not v.get('d'):
            continue
        if v['t'].lower() in taken:   # a keystone or gem already has its own card
            continue
        items.append({'k': 'w', 'id': k, 'n': v['t'], 's': 'Keyword', 't': plain(v['d']),
                      'use': v.get('n') or {}})

    for it in items:  # the standard: nothing in the search index may read as game code
        for f in ('n', 's', 't', 'ls', 'pr', 'tags', 'rec'):
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if x and RAW.search(x):
                    sys.exit('raw game code in %s %r: %r' % (f, it['n'], x))
        for f in ('ls', 'pr', 'tags'):
            if f in it and not it[f]:
                del it[f]
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
    html, n = with_official_uniques(html)
    print('uniques with official lines:', n, 'changed')
    index = build_index(html)
    (ROOT / 'data').mkdir(exist_ok=True)
    (ROOT / 'data' / 'index.json').write_text(
        json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    if BRIDGE not in html:
        html = html.replace('</body>', BRIDGE + '\n</body>', 1)
    if HEAD not in html:
        html = html.replace('</head>', HEAD + '</head>', 1)
    for a, b in ((MAST_OLD, MAST_NEW), (CL_OLD, CL_NEW)):
        if b not in html:
            if a not in html:
                sys.exit('the drill-down header changed; update MAST_OLD / CL_OLD in tools/sync.py')
            html = html.replace(a, b, 1)
    (ROOT / 'explore.html').write_text(html, encoding='utf-8', newline='')
    counts = {}
    for it in index['items']:
        counts[it['k']] = counts.get(it['k'], 0) + 1
    print('explore.html written; index.json:', counts)


if __name__ == '__main__':
    main()
