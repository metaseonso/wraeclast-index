"""#101 Inflation index: the league's own price level, day by day. Writes data/market/inflation.json: for this league
and every past league the archive holds, by league day, the basket's price in exalted against day 1 (= 100), and
exalted per divine beside it.

The basket is fixed and written here once: base currency that every league, Early Access to now, has traded on
every one of its days, so no league's index is missing a part of it. The Divine Orb is not in it: exalted per divine
is drawn beside the index instead.
"""
import math

import marketlib as ml

KEY = 'inflation'
FILE = 'data/market/inflation.json'
# The rule. The owner decides the basket and the base day (design/market-products.md).
BASKET = ['Chaos Orb', 'Regal Orb', 'Orb of Alchemy', 'Orb of Annulment', 'Vaal Orb', 'Orb of Chance',
          'Orb of Transmutation', 'Orb of Augmentation', "Artificer's Orb", "Gemcutter's Prism",
          "Glassblower's Bauble", "Greater Jeweller's Orb", "Perfect Jeweller's Orb"]
BASE_DAY = 1
RULE = ('The basket: %d currencies every league has traded on every one of its days, Early Access to now. Each day, '
        'each one\'s price in exalted: the exalted paid for it that day (divines and chaos at each hour\'s own rates) '
        'over the amount bought. The index is the geometric mean of each one\'s price over its day-%d price, times '
        '100: day %d is 100 and every currency counts the same. A day on which one of them did not trade leaves it '
        'out, and the day says how many it holds. Exalted per divine: that day\'s Divine and Exalted market, exalted '
        'paid over divines bought.' % (len(BASKET), BASE_DAY, BASE_DAY))


def index(base, named):
    """The basket's price in `named` against `base` ({name: [exalted, amount]} each): (index, currencies it holds)."""
    logs = []
    for n in BASKET:
        a, b = base.get(n), named.get(n)
        if a and b and a[1] and b[1]:
            logs.append(math.log((b[0] / b[1]) / (a[0] / a[1])))
    if not logs:
        return None, 0
    return 100 * math.exp(sum(logs) / len(logs)), len(logs)


def build(ctx):
    out = ml.head(RULE, basket=BASKET, base_day=BASE_DAY)
    out['cols'] = ['league day', 'index', 'exalted per divine', 'basket currencies', 'hours read']
    out['leagues'] = []
    for s, _ in ctx.ls:
        days = s.days()
        base = days[BASE_DAY][1]
        rows = []
        for d in sorted(days):
            rate, named, hrs = days[d]
            idx, n = index(base, named)
            rows.append([d, ml.sig(idx, 4), ml.sig(rate, 4), n, hrs])
        out['leagues'].append({'league': s.name, 'v': s.v, 'first': ml.when(s.first), 'days': rows})
    return {FILE: out}
