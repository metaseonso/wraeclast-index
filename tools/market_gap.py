"""#108 League, Hardcore and past league: the price gap. Writes data/market/gap.json: every currency's price over the
last 24 hours in the league, in the league's Hardcore, and in the league before it while that league still trades,
each where its market traded (a card finds its own row by name), and the biggest gaps between the league and its
Hardcore. One file and not a part of each card, since all of it changes every day.

Each league is in its own orbs: an exalted or a divine is not worth the same in two leagues, so a gap is the
difference in divines, each league's own. Private leagues are never read.
"""
import marketlib as ml

KEY = 'gap'
FILE = 'data/market/gap.json'
# The rule. The owner decides these numbers (design/market-products.md).
OPEN_HOURS = 48        # the past league still trades: its last hour within this many hours of the league's
LIST_HOURS = 12        # the list: each side traded in this many of the 24 hours
LIST = 40
RULE = ('Each league\'s last 24 hours read, each in its own orbs: a price is divines paid over the amount bought, at '
        'that league\'s own hourly rates. %% is the other league\'s price over this league\'s, less 1. The past league '
        'is the one before this while it still trades (its last hour within %d hours of this league\'s). A market is '
        'shown only where it traded in those 24 hours; hours says in how many. The list: the %d biggest gaps between '
        'the league and its Hardcore, where each traded in %d or more of the hours. The Divine Orb\'s own price is in '
        'exalted.' % (OPEN_HOURS, LIST, LIST_HOURS))


def day(lg):
    """(exalted per divine, {name: (price in divines, hours traded)}) over a league's last 24 hours."""
    if not lg or not lg.last:
        return None, {}
    r, tot, _ = lg.window(lg.last - 23 * 3600, lg.last)
    if not r:
        return None, {}
    return r, {n: (v[0] / v[1] / (1 if n == 'Divine Orb' else r), v[2]) for n, v in tot.items() if v[1]}


def build(ctx):
    s, hc = ctx.cur, ctx.hc
    past = next((p for p, _ in reversed(ctx.ls[:-1]) if p.last >= s.last - OPEN_HOURS * 3600), None)
    r0, a = day(s)
    r1, b = day(hc)
    r2, c = day(past)
    rows, every = [], []
    for n, (p0, h0) in sorted(a.items()):
        row = [n, ml.sig(p0), h0]
        row += [ml.sig(b[n][0]), b[n][1], ml.pct(b[n][0], p0)] if n in b else [None, 0, None]
        row += [ml.sig(c[n][0]), c[n][1], ml.pct(c[n][0], p0)] if n in c else [None, 0, None]
        every.append(row)
        if n in b and h0 >= LIST_HOURS and b[n][1] >= LIST_HOURS and n != 'Divine Orb':
            rows.append([n, ml.sig(p0), ml.sig(b[n][0]), ml.pct(b[n][0], p0)])
    rows.sort(key=lambda r: (-abs(r[3] or 0), r[0]))
    out = ml.head(RULE, open_hours=OPEN_HOURS, list_hours=LIST_HOURS, list=LIST)
    out.update({'league': s.name, 'hardcore': hc.archive if hc else None, 'past': past.name if past else None,
                'rate': {'league': ml.sig(r0, 4), 'hardcore': ml.sig(r1, 4), 'past': ml.sig(r2, 4)},
                'all': ['name', 'league (div)', 'hours of 24', 'Hardcore (div)', 'hours of 24', '%', 'past league (div)',
                        'hours of 24', '%'],
                'every': every,
                'cols': ['name', 'league (div)', 'Hardcore (div)', '%'], 'items': rows[:LIST]})
    return {FILE: out}
