"""#103 Best time to sell: volume and price by weekday and hour (UTC), each hour against its own day. Writes
data/market/sell.json: the whole market's week, and every currency with enough weeks behind it, with its busiest
and dearest hours. A currency card gets its map (`sell`, 168 cells, Monday 00:00 UTC first) and its two plain lines.

Pooled over every league the archive holds, softcore, after each league's first week (launch week trades like no
other week). Each hour is set against its own UTC day, so a busy league and a quiet one, or a league whose exalted is
worth ten times another's, weigh the same. Measured only, and it says how many weeks it is from.
"""
import datetime as dt
import math

import marketlib as ml

KEY = 'sell'
FILE = 'data/market/sell.json'
PARTS = ('sell',)
WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
# The rule. The owner decides these numbers (design/market-products.md).
SKIP_DAYS = 7          # each league's first league days, left out
DAY_HOURS = 20         # a UTC day with fewer hours read (the feed down, a league's first or last day) is left out
WEEKS = 8              # a currency needs this many weeks...
CELL_HOURS = 4         # ...and to have traded in this many hours in every one of the 168 cells
SPAN = 3               # busiest and dearest: the best this many hours in a row
RULE = ('Every league\'s hours after its first %d league days, up to the last complete week (Monday to Sunday, '
        'UTC), pooled; a UTC day with fewer than %d hours read is left '
        'out. Each hour of the week (weekday x hour, UTC) against its own day. Volume: the hour\'s divines traded over '
        'that day\'s hourly average (100 = an average hour; an hour it did not trade is 0). Price: the hour\'s price '
        'over that day\'s price (per mille above or below; the geometric mean over the hours it traded). A currency '
        'gets its map where it traded in %d or more weeks and in %d or more hours in every one of the 168 cells. '
        'Busiest and dearest: the best %d hours in a row. Weeks: how many weeks it traded in.'
        % (SKIP_DAYS, DAY_HOURS, WEEKS, CELL_HOURS, SPAN))


def cell(h):
    t = dt.datetime.fromtimestamp(h, dt.timezone.utc)
    return t.weekday() * 24 + t.hour


def best(cells):
    """The SPAN hours in a row (over midnight, and over Sunday into Monday) with the highest mean: (first cell, mean)."""
    top, at = None, 0
    for k in range(168):
        vals = [cells[(k + j) % 168] for j in range(SPAN)]
        if any(v is None for v in vals):
            continue
        m = sum(vals) / SPAN
        if top is None or m > top:
            top, at = m, k
    return at, top


def words(k):
    return '%s %02d:00-%02d:00 UTC' % (WD[k // 24], k % 24, (k + SPAN) % 24)


def build(ctx):
    per = {}
    market = [[0.0, 0] for _ in range(168)]
    upto = ml.week_of(ctx.cur.last)        # complete weeks only, so the maps move once a week
    for s, _ in ctx.ls:
        byday = {}
        for h in s.hours:
            if s.day(h) > SKIP_DAYS and h < upto:
                byday.setdefault(h // ml.DAY, []).append(h)
        for hs in byday.values():
            if len(hs) < DAY_HOURS:
                continue
            tot, whole = {}, {}
            for h in hs:
                rate, named = s.hours[h]
                whole[h] = sum(ex for n, (ex, amt) in named.items() if n not in ml.MONEY) / rate
                for n, (ex, amt) in named.items():
                    t = tot.setdefault(n, [0.0, 0])
                    t[0] += ex / rate
                    t[1] += amt
            mean = sum(whole.values()) / len(hs)
            for h in hs:
                if mean:
                    market[cell(h)][0] += whole[h] / mean
                    market[cell(h)][1] += 1
            for n, (dv, amt) in tot.items():
                if not amt:
                    continue
                e = per.get(n)
                if e is None:
                    e = per[n] = {'v': [0.0] * 168, 'nv': [0] * 168, 'p': [0.0] * 168, 'np': [0] * 168, 'weeks': set()}
                vmean, dayp = dv / len(hs), dv / amt
                for h in hs:
                    rate, named = s.hours[h]
                    k = cell(h)
                    x = named.get(n)
                    e['nv'][k] += 1
                    if x and x[1]:
                        e['v'][k] += x[0] / rate / vmean
                        e['p'][k] += math.log(x[0] / rate / x[1] / dayp)
                        e['np'][k] += 1
                        e['weeks'].add(ml.week_of(h))
    lines = []
    for n, e in per.items():
        if len(e['weeks']) < WEEKS or min(e['np']) < CELL_HOURS:
            continue
        vol = [e['v'][k] / e['nv'][k] if e['nv'][k] else None for k in range(168)]
        price = [math.exp(e['p'][k] / e['np'][k]) - 1 if e['np'][k] else None for k in range(168)]
        kv, bv = best(vol)
        kp, bp = best(price)
        weeks = len(e['weeks'])
        most = 'Trades most %s: %.1fx the day\'s average volume, %d weeks.' % (words(kv), bv, weeks)
        high = 'Sells highest %s: %+.1f%% on the day\'s price, %d weeks.' % (words(kp), bp * 100, weeks)
        ctx.card(n, 'sell', {'weeks': weeks, 'vol': [round(v * 100) for v in vol],
                             'price': [round(p * 1000) for p in price], 'most': most, 'high': high})
        lines.append([n, weeks, kv, round(bv * 100), kp, round(bp * 1000)])
    lines.sort(key=lambda r: r[0])
    mk = [m[0] / m[1] if m[1] else None for m in market]
    km, bm = best(mk)
    out = ml.head(RULE, skip_days=SKIP_DAYS, day_hours=DAY_HOURS, weeks=WEEKS, cell_hours=CELL_HOURS, span=SPAN)
    out.update({'cells': 'Mon 00:00 UTC first, 24 a day', 'market': [round(v * 100) if v else None for v in mk],
                'line': 'The whole market trades most %s: %.1fx the day\'s average volume.' % (words(km), bm),
                'cols': ['name', 'weeks', 'busiest: first cell', 'busiest: volume (100 = average)', 'dearest: first cell',
                         'dearest: price per mille'], 'items': lines})
    return {FILE: out}
