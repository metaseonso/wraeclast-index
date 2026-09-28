"""#100 League-day curves and the league-start playbook.

Each currency card gets its price by league day in this league and every past league the archive holds (card part
`days`), and the same-day line (`sameDay`): its price on the league's last full day, and the last three leagues' on
that same day. data/market/playbook.json: week 1 of the last three leagues and of this one, what traded for the most
and how fast its price fell after. Measured history only: no forecast.
"""
import marketlib as ml

KEY = 'leaguedays'
FILE = 'data/market/playbook.json'
PARTS = ('days', 'sameDay')
# The rule. The owner decides these numbers (design/market-products.md).
LEAGUES, TOP, WEEK1, AT = 3, 15, 7, (14, 28, 56)
DAYS_RULE = ('Each league\'s price by league day (day 1 = its first 24 hours): divines paid over the amount bought that '
             'day, in that league\'s own orbs (the Divine Orb in exalted); null where it did not trade. sameDay: the '
             'league\'s last full day, and the last three leagues\' price on that same league day.')
PLAY_RULE = ('Week 1 is league days 1 to %d. The list: the %d currencies that traded for the most divines in week 1 '
             '(Divine and Chaos Orbs left out: they are what the rest is paid in). Week-1 price: divines paid over the '
             'amount bought, the 7 days together. Then the price on league days %s as a %% of the week-1 price, and the '
             'first day after week 1 when it was half the week-1 price or less. The last %d leagues, and this one so '
             'far.' % (WEEK1, TOP, ', '.join(map(str, AT)), LEAGUES))


def curve(s, n):
    days = s.days()
    vals = [ml.sig(s.price(d, n)) for d in range(1, max(days) + 1)]
    while vals and vals[-1] is None:
        vals.pop()
    return vals


def last_full(s):
    """The league's last complete day."""
    d = s.day(s.last)
    return d if (s.last - s.first) % ml.DAY == ml.DAY - 3600 else d - 1


def build(ctx):
    cur = ctx.cur
    full = last_full(cur)
    for n in sorted({n for h in cur.hours.values() for n in h[1]}):
        cv = [[s.name, curve(s, n)] for s, _ in ctx.ls]
        cv = [c for c in cv if any(v is not None for v in c[1])]
        ctx.card(n, 'days', cv)
        now = cur.price(full, n)
        if now is not None:
            past = [[s.name, ml.sig(s.price(full, n))] for s, _ in ctx.ls[:-1] if s.price(full, n) is not None][-3:]
            ctx.card(n, 'sameDay', {'day': full, 'now': ml.sig(now), 'past': past})
    out = ml.head(PLAY_RULE, leagues=LEAGUES, top=TOP, week_days=WEEK1, at_days=list(AT))
    out['cards'] = DAYS_RULE
    out['cols'] = ['name', 'week-1 price (div)', 'divines traded in week 1'] + ['day %d %%' % d for d in AT] + \
                  ['half by day']
    out['leagues'] = []
    for s, _ in reversed(ctx.ls[-LEAGUES - 1:]):
        days = s.days()
        wk = {}
        for d in range(1, WEEK1 + 1):
            if d in days and days[d][0]:
                for n, (ex, amt) in days[d][1].items():
                    t = wk.setdefault(n, [0.0, 0])
                    t[0] += ex / days[d][0]
                    t[1] += amt
        top = sorted(((n, v) for n, v in wk.items() if n not in ml.MONEY), key=lambda kv: -kv[1][0])[:TOP]
        rows = []
        for n, (dv, amt) in top:
            p1 = dv / amt
            row = [n, ml.sig(p1), ml.sig(dv)]
            for d in AT:
                p = s.price(d, n) if d <= last_full(s) else None
                row.append(round(p / p1 * 100) if p else None)
            row.append(next((d for d in sorted(days) if WEEK1 < d <= last_full(s) and (s.price(d, n) or p1) <= p1 / 2),
                            None))
            rows.append(row)
        out['leagues'].append({'league': s.name, 'v': s.v, 'days': last_full(s), 'running': s is cur, 'items': rows})
    return {FILE: out}
