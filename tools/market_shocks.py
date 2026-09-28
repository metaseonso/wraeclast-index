"""#102 Patch shocks: what a patch did to prices. Writes data/market/shocks/<league version>.json, one file per league
(the patch page reads its own): every patch, hotfix and restart in data/patches.json (tools/patches.py, the hour GGG
posted its notes), each currency's price 72 hours before that hour against the first 24 and the 72 hours after, and
each patch's biggest moves. A currency card gets its part (`shocks`): the patches whose notes name it
(data/patchnotes.json, where that file is built), and any patch (not a hotfix) that moved it 25% or more in its first
24 hours.

A price here is the middle of the hourly prices in the window, not the window's total: a thin market's one odd trade
(someone paying a thousand divines for a rune) moves one hour, not the whole window.

The market moves on its own too, patch or no patch: the basket's own move over the same hours
(tools/market_inflation.py) sits beside every patch, so a fall of 5% on a day everything fell 5% reads as what it is.
"""
import cxlib
import marketlib as ml
import market_inflation

KEY = 'shocks'
FILE = 'data/market/shocks/'
PARTS = ('shocks',)
# The rule. The owner decides these numbers (design/market-products.md).
WINDOW, FIRST = 72, 24                   # hours either side, and the first hours after
MIN_HOURS = 48                           # a patch needs this many hours of trading on each side
BEFORE_HOURS, AFTER_HOURS = 24, 8        # a currency: traded in 24+ of the 72 hours before and 8+ of the first 24 after
MIN_DIV = 5.0                            # ...and 5+ divines changed hands on each side
TOP = 5                                  # the biggest rises and the biggest falls, per patch
CARD_MOVE = 25.0                         # a card lists a patch (not a hotfix) that moved it this much in 24 hours
RULE = ('A patch\'s hour is the hour GGG posted its notes (data/patches.json). Before: the %d hours up to it. After: '
        'the %d hours from it, and the first %d. A price is the middle (median) of the hourly prices in the window, in '
        'divines; an hour\'s price is divines paid over the amount bought in it. A currency is listed where it traded '
        'in %d or more of the hours before and %d or more of the first %d after, with %s or more changed hands on each '
        'side. Moves: the %d biggest rises and %d biggest falls in the first %d hours. basket: the basket\'s own move '
        'over the %d hours (inflation.json), in %%. Patches less than %d hours apart share hours; near says how many '
        'others fall inside a patch\'s window. A patch with fewer than %d hours of trading on either side (a league\'s '
        'first or last days, or no league in the archive) is left out, and counted.'
        % (WINDOW, WINDOW, FIRST, BEFORE_HOURS, AFTER_HOURS, FIRST, ml.divines(MIN_DIV), TOP, TOP, FIRST, WINDOW, WINDOW,
           MIN_HOURS))


def build(ctx):
    W, A = WINDOW * 3600, FIRST * 3600
    by_name = {s.name: s for s, _ in ctx.ls}
    notes = ml.ROOT / 'data' / 'patchnotes.json'
    named = {}
    if notes.exists():                   # #86: the cards each patch's notes name
        pn = ml.load(notes)
        for key, lines in (pn.get('on') or {}).items():
            if key.startswith('c:'):
                named[key[2:]] = {pn['patches'][pn['lines'][i][0]]['title'] for i in lines}
    rows, left = [], 0
    ps = sorted((p for p in ctx.patches if p.get('posted')), key=lambda p: p['posted'])
    left += sum(1 for p in ctx.patches if not p.get('posted'))
    hours = [cxlib.hour_of(p['posted']) for p in ps]
    per_card = {}
    for p, H in zip(ps, hours):
        s = by_name.get(p.get('league'))
        if not s:
            left += 1
            continue
        _, b, n0 = s.window(H - W, H - 3600)
        _, a3, n2 = s.window(H, H + W - 3600)
        if n0 < MIN_HOURS or n2 < MIN_HOURS:
            left += 1
            continue
        m0, m1, m3 = s.medians(H - W, H - 3600), s.medians(H, H + A - 3600), s.medians(H, H + W - 3600)
        moves = []
        for n, (p0, h0, v0) in m0.items():
            x1, x3 = m1.get(n), m3.get(n)
            if n == 'Divine Orb' or not x1 or not x3 or h0 < BEFORE_HOURS or x1[1] < AFTER_HOURS:
                continue
            if v0 < MIN_DIV or x3[2] < MIN_DIV:
                continue
            moves.append([n, ml.sig(p0), ml.pct(x1[0], p0), ml.pct(x3[0], p0), ml.pct(x3[2], v0)])
        idx, _ = market_inflation.index({n: v[:2] for n, v in b.items()}, {n: v[:2] for n, v in a3.items()})
        moves.sort(key=lambda m: m[2])
        up = [m for m in moves[::-1][:TOP] if m[2] > 0]
        down = [m for m in moves[:TOP] if m[2] < 0]
        title = p.get('title') or p['v']
        rows.append({'v': p['v'], 'title': title, 'kind': p['kind'], 'at': p['posted'], 'league': s.name,
                     'basket': ml.sig(idx - 100, 3) if idx else None,
                     'near': sum(1 for q in hours if q != H and abs(q - H) < W),
                     'listed': len(moves), 'up': up, 'down': down})
        for m in moves:
            if title in named.get(m[0], ()) or (p['kind'] == 'patch' and abs(m[2] or 0) >= CARD_MOVE):
                per_card.setdefault(m[0], []).append([title, p['posted'], m[2], m[3], title in named.get(m[0], ())])
    for n, v in per_card.items():
        ctx.card(n, 'shocks', v[-12:])
    files = {}
    for s in {r['league'] for r in rows}:
        lg = next(x for x, _ in ctx.ls if x.name == s)
        out = ml.head(RULE, window_hours=WINDOW, first_hours=FIRST, min_hours=MIN_HOURS, before_hours=BEFORE_HOURS,
                      after_hours=AFTER_HOURS, min_divines=MIN_DIV, top=TOP, card_move=CARD_MOVE)
        out.update({'league': s, 'v': lg.v, 'left': left,
                    'cols': ['name', 'price before (div)', '% in 24 hours', '% in 72 hours', 'volume % in 72 hours'],
                    'card': ['patch', 'posted', '% in 24 hours', '% in 72 hours', 'its notes name it'],
                    'patches': [r for r in rows[::-1] if r['league'] == s]})
        files[FILE + lg.v + '.json'] = out
    return files
