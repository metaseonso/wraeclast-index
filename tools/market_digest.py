"""#107 The weekly economy digest, composed: one file per complete week of the league,
data/market/digest/<year>-W<week>.json. The facts only, from the other products, each with the cards it names so a
page can link every number to its card: the index and exalted per divine (#101), the biggest moves, the patch shocks
(#102), what rose fast (#106), crafting (#105), and the mechanics' shares (#104, data/leaguemech.json, where that file
is built). `lines` are plain templated lines, numbers first; nothing is written beyond them.
"""
import datetime as dt

import cxlib
import marketlib as ml
import market_crafting
import market_inflation
import market_rising

KEY = 'digest'
FILE = 'data/market/digest/'
# The rule. The owner decides these numbers (design/market-products.md).
MOVES, MIN_DIV, RISING, CRAFTING, PATCH_LINES = 5, 20.0, 8, 5, 3
RULE = ('A week is Monday 00:00 to Sunday 23:00 UTC; complete weeks only. Index and exalted per divine: the league day '
        'the week ends on, against the day before it starts (inflation.json). Moves: the middle of the week\'s hourly '
        'prices against the week before\'s, in divines, where %s or more changed hands in each; the %d biggest each '
        'way. A week whose week before is not all inside the league (the first) sets nothing against it. Patch shocks: '
        'the patches in shocks/ posted in the week; lines for the %d that moved a currency most. Rising fast: '
        'rising.json\'s rule over every hour of the week, the %d with the highest z. Crafting: crafting.json\'s '
        'currencies, the %d with the most divines traded in the week. Mechanics: data/leaguemech.json\'s shares over '
        'the week\'s days.' % (ml.divines(MIN_DIV), MOVES, PATCH_LINES, RISING, CRAFTING))


def num(x):
    if x is None:
        return ''
    return '{:,}'.format(round(x)) if abs(x) >= 100 else '%g' % ml.sig(x, 3)


def shares(cur, a, b):
    lm = ml.ROOT / 'data' / 'leaguemech.json'
    if not lm.exists():
        return None
    mech = ml.load(lm)
    pop = mech.get('popularity') or {}
    lg = next((x for x in pop.get('leagues') or [] if x['league'] == cur.name), None)
    rows = pop.get('rows') or []
    if not lg:
        return None
    start = dt.date.fromisoformat(lg['start'])
    tot, ex = [0.0] * len(rows), 0.0
    for k, d in enumerate(lg['days']):
        t = int(dt.datetime.combine(start + dt.timedelta(days=k), dt.time(), dt.timezone.utc).timestamp())
        if a <= t <= b:
            ex += d[1]
            for j in range(len(rows)):
                tot[j] += d[1] * d[2 + j] / 10000
    if not ex:
        return None
    label = {m['key']: m['name'] for m in mech.get('mechanics') or []}
    return sorted(([label.get(r, r), round(tot[j] / ex * 100, 1)] for j, r in enumerate(rows)), key=lambda x: -x[1])


def build(ctx):
    cur = ctx.cur
    W = ml.WEEK
    idx = next(x for x in ctx.done['inflation'][market_inflation.FILE]['leagues'] if x['league'] == cur.name)['days']
    idx = {r[0]: r for r in idx}
    shock = [p for f in ctx.done['shocks'].values() for p in f['patches']]
    group, _ = market_crafting.groups()
    a = ml.week_of(cur.first) + W
    fl = market_rising.flags(cur, a, cur.last) if a + W - 3600 <= cur.last else {}
    out = {}
    while a + W - 3600 <= cur.last:
        b = a + W - 3600
        d0, d1 = cur.day(a) - 1, cur.day(b)
        i0, i1 = idx.get(d0), idx.get(d1)
        r1, w1, _ = cur.window(a, b)
        r0, w0, _ = cur.window(a - W, a - 3600)
        m1, m0 = cur.medians(a, b), cur.medians(a - W, a - 3600)
        whole = a - W >= cur.first          # the week before is all inside the league: else nothing is set against it
        if not whole:
            m0, w0, r0 = {}, {}, None
        moves = []
        for n, x in m1.items():
            y = m0.get(n)
            if n != 'Divine Orb' and y and x[2] >= MIN_DIV and y[2] >= MIN_DIV:
                moves.append([n, ml.sig(x[0]), ml.pct(x[0], y[0])])
        moves.sort(key=lambda m: m[2])
        up = [m for m in moves[::-1][:MOVES] if m[2] > 0]
        down = [m for m in moves[:MOVES] if m[2] < 0]
        pats = [p for p in shock if a <= cxlib.hour_of(p['at']) <= b]
        ris = []
        for n, hrs in fl.items():
            hh = [h for h in hrs if a <= h <= b]
            if hh:
                pk = max(hh, key=lambda h: max(g[1] for g in hrs[h]))
                ris.append([n, market_rising.what(hrs[pk]), round(max(g[1] for g in hrs[pk]), 1), ml.when(min(hh))])
        ris.sort(key=lambda r: (-r[2], r[0]))
        ris = ris[:RISING]
        cr = []
        for n in group:
            x, y = w1.get(n), w0.get(n)
            if x and r1:
                cr.append([n, ml.sig(x[0] / r1), ml.pct(x[0] / r1, y[0] / r0) if y and r0 else None])
        cr.sort(key=lambda r: (-r[1], r[0]))
        cr = cr[:CRAFTING]
        sh = shares(cur, a, b)
        lines = []
        if i1:
            lines.append({'t': 'Index %s on league day %d%s. 1 Divine Orb: %s Exalted Orbs%s.' % (
                num(i1[1]), d1, ' (%+.1f on the week)' % (i1[1] - i0[1]) if i0 else '', num(i1[2]),
                ' (%+.1f%%)' % ml.pct(i1[2], i0[2]) if i0 and i0[2] else ''), 'cards': ['Divine Orb', 'Exalted Orb']})
        if up:
            lines.append({'t': 'Up most: ' + ', '.join('%s %+.0f%%' % (m[0], m[2]) for m in up) + '.',
                          'cards': [m[0] for m in up]})
        if down:
            lines.append({'t': 'Down most: ' + ', '.join('%s %+.0f%%' % (m[0], m[2]) for m in down) + '.',
                          'cards': [m[0] for m in down]})
        for p in sorted(pats, key=lambda p: -max([abs(m[2]) for m in p['up'] + p['down']] or [0]))[:PATCH_LINES]:
            ms = p['up'] + p['down']
            if ms:
                m = max(ms, key=lambda m: abs(m[2]))
                lines.append({'t': '%s: %s %+.0f%% in 24 hours.' % (p['title'], m[0], m[2]), 'cards': [m[0]]})
        if ris:
            lines.append({'t': 'Rising fast: ' + ', '.join('%s (%s, from %s %s UTC)' % (
                r[0], r[1], dt.datetime.strptime(r[3], '%Y-%m-%dT%H:00Z').strftime('%a'), r[3][11:16])
                for r in ris[:3]) + '.', 'cards': [r[0] for r in ris[:3]]})
        if cr:
            lines.append({'t': 'Crafting: ' + ', '.join('%s %s div%s' % (r[0], num(r[1]), ' (%+.0f%%)' % r[2]
                                                                         if r[2] is not None else '')
                                                        for r in cr[:3]) + '.', 'cards': [r[0] for r in cr[:3]]})
        if sh:
            lines.append({'t': 'Most traded: ' + ', '.join('%s %.1f%%' % (s_[0], s_[1]) for s_ in sh[:3]) + '.',
                          'cards': []})
        w = ml.head(RULE, moves=MOVES, min_divines=MIN_DIV, patch_lines=PATCH_LINES, rising=RISING, crafting=CRAFTING)
        w.update({'week': ml.iso_week(a), 'league': cur.name, 'from': ml.when(a), 'to': ml.when(b), 'days': [d0 + 1, d1],
                  'weekBefore': whole,
                  'index': i1 and {'day': d1, 'v': i1[1], 'change': round(i1[1] - i0[1], 1) if i0 else None,
                                   'rate': i1[2], 'rateChange': ml.pct(i1[2], i0[2]) if i0 else None},
                  'up': up, 'down': down,
                  'patches': [{'title': p['title'], 'at': p['at'], 'basket': p['basket'], 'up': p['up'][:3],
                               'down': p['down'][:3]} for p in pats],
                  'rising': ris, 'crafting': cr, 'mechanics': sh, 'lines': lines})
        out[FILE + ml.iso_week(a) + '.json'] = w
        a += W
    return out
