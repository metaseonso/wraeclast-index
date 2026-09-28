"""#106 Rising fast: a currency whose volume or price jumps far above its own last 7 days. Writes
data/market/rising.json: every currency that moved in the last 24 hours read, with its numbers and the hour its run
started. It says what moved, never what will.

The rule is a plain z-score, hour by hour: the hour against the mean and standard deviation of the same currency's
previous 168 hours. flags() is the rule itself, and the weekly digest (tools/market_digest.py) runs it over a week.
"""
import math

import marketlib as ml

KEY = 'rising'
FILE = 'data/market/rising.json'
# The rule. The owner decides these numbers (design/market-products.md).
WINDOW = 168           # hours before the hour: its own last 7 days
Z = 4.0                # standard deviations above the mean
VOL_X = 2.0            # ...and volume at least twice the mean
PRICE_X = 1.15         # ...or price at least 15% above it
MIN_DIV = 2.0          # divines traded in the hour itself
MIN_HOURS = 24         # hours it traded in the 7 days
SHOW = 24              # the strip: what moved in the last 24 hours...
MIN_RUN = 2            # ...in at least this many of them
BACK = 72              # how far back a run's start is looked for
RULE = ('Each hour, each currency against its own previous %d hours (7 days) in the league. Volume: the hour\'s '
        'divines traded, against the mean and standard deviation of every hour of the 7 days (an hour it did not '
        'trade counts as 0). Price: the hour\'s price in divines against the hours it traded in the 7 days, on a log '
        'scale. It moved when z (standard deviations above the mean) is %s or more, and its volume is %sx the mean or '
        'its price %d%% above it, with %s or more traded in the hour and %d or more hours traded in the 7 '
        'days. The strip: every currency that moved in %d or more of the last %d hours read. Its run: the hours it moved '
        'in up to the last one, an hour\'s gap allowed; started is the run\'s first hour, peak its highest z. It says '
        'moved, never will move.'
        % (WINDOW, Z, VOL_X, round((PRICE_X - 1) * 100), ml.divines(MIN_DIV), MIN_HOURS, MIN_RUN, SHOW))


def flags(s, lo, hi):
    """Every hour lo..hi, every currency against its own previous WINDOW hours:
    {name: {hour: [(what, z, the hour's value, the 7-day mean), ...]}}, what being 'volume' or 'price'."""
    hs = list(range(lo - WINDOW * 3600, hi + 1, 3600))
    names = set()
    for h in hs:
        v = s.hours.get(h)
        if v:
            names.update(v[1])
    names.discard('Divine Orb')
    out = {}
    for n in names:
        # prefix sums over the hours: read hours and their volume, traded hours and their log price
        cr = sv = sv2 = ct = sp = sp2 = 0.0
        pre = [(0, 0.0, 0.0, 0, 0.0, 0.0)]
        vals = []
        for h in hs:
            v = s.hours.get(h)
            vol = lp = None
            if v:
                x = v[1].get(n)
                vol = x[0] / v[0] if x and x[1] else 0.0
                lp = math.log(x[0] / x[1] / v[0]) if x and x[1] else None
                cr += 1
                sv += vol
                sv2 += vol * vol
                if lp is not None:
                    ct += 1
                    sp += lp
                    sp2 += lp * lp
            vals.append((vol, lp))
            pre.append((cr, sv, sv2, ct, sp, sp2))
        for k in range(WINDOW, len(hs)):
            vol, lp = vals[k]
            if not vol or vol < MIN_DIV:
                continue
            a, b = pre[k - WINDOW], pre[k]
            nr, nt = b[0] - a[0], b[3] - a[3]
            if nt < MIN_HOURS:
                continue
            got = []
            mv = (b[1] - a[1]) / nr
            var = (b[2] - a[2]) / nr - mv * mv
            if var > 1e-12:
                z = (vol - mv) / math.sqrt(var)
                if z >= Z and vol >= VOL_X * mv:
                    got.append(('volume', z, vol, mv))
            mp = (b[4] - a[4]) / nt
            var = (b[5] - a[5]) / nt - mp * mp
            if lp is not None and var > 1e-12:
                z = (lp - mp) / math.sqrt(var)
                if z >= Z and math.exp(lp - mp) >= PRICE_X:
                    got.append(('price', z, math.exp(lp), math.exp(mp)))
            if got:
                out.setdefault(n, {})[hs[k]] = got
    return out


def what(got):
    return 'both' if len(got) == 2 else got[0][0]


def build(ctx):
    cur = ctx.cur
    T = cur.last
    f = flags(cur, T - (BACK + SHOW - 1) * 3600, T)
    rows = []
    for n, hrs in f.items():
        recent = [h for h in hrs if h > T - SHOW * 3600]
        if len(recent) < MIN_RUN:
            continue
        last = max(recent)
        run = [last]
        while run[-1] - 3600 in hrs or run[-1] - 7200 in hrs:
            run.append(run[-1] - 3600 if run[-1] - 3600 in hrs else run[-1] - 7200)
        start = run[-1]
        peak = max(run, key=lambda h: max(g[1] for g in hrs[h]))
        got = hrs[peak]
        e = {'name': n, 'moved': what(got), 'z': round(max(g[1] for g in got), 1), 'peak': ml.when(peak),
             'started': ml.when(start), 'last': ml.when(last), 'hours': len(recent)}
        for g in got:
            if g[0] == 'price':
                e['price'] = [ml.sig(g[2]), ml.sig(g[3]), ml.pct(g[2], g[3])]
            else:
                e['volume'] = [ml.sig(g[2]), ml.sig(g[3]), round(g[2] / g[3], 1) if g[3] else None]
        rows.append(e)
    rows.sort(key=lambda e: (-e['z'], e['name']))
    out = ml.head(RULE, window_hours=WINDOW, z=Z, volume_x=VOL_X, price_x=PRICE_X, min_divines=MIN_DIV,
                  min_hours=MIN_HOURS, show_hours=SHOW, min_run=MIN_RUN, back_hours=BACK)
    out.update({'league': cur.name, 'to': ml.when(T),
                'units': {'price': ['the hour, divines', '7-day mean, divines', '%'],
                          'volume': ['the hour, divines traded', '7-day hourly mean', 'times the mean']},
                'items': rows})
    return {FILE: out}
