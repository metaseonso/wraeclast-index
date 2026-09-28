"""#99 Liquidity: how easy each currency is to trade, and how much of it is on offer. Writes
data/market/liquidity.json, one row per currency the league traded in the last 24 hours, in the order the Currency
tab sorts by (Easy, then Slow, then Thin; the most divines traded first within each).

GGG's feed gives, per market and hour, what changed hands and the range within the hour of the stock on each side and
of the ratio: a range, never an order book, so nothing here is a bid, an ask or a spread. Only the markets against
Divine, Exalted and Chaos Orbs count, since those are the ones a price is read from.
"""
import cxlib
import marketlib as ml

KEY = 'liquidity'
FILE = 'data/market/liquidity.json'
# The rule. The owner decides these numbers (design/market-products.md).
EASY_HOURS, EASY_DIV = 20, 50.0          # Easy: traded in 20+ of the 24 hours, and 50+ divines changed hands
THIN_HOURS, THIN_DIV = 6, 1.0            # Thin: traded in under 6 hours, or under 1 divine. Slow: between
# The hour's ratio range is shown beside the pill and is not part of it: measured over Forbidden Rites' last day, the
# middle hour's range grows with the market (0% under 10 divines a day, 100% at 100-1,000, 10% over 100,000), so it
# would call the busiest markets slow.
RULE = ('Over the last 24 hours read, on its markets against Divine, Exalted and Chaos Orbs. Easy to trade: it traded '
        'in %d or more of the 24 hours, and %s or more changed hands. Thin to trade: it traded in fewer than %d '
        'hours, or under %s changed hands. Slow to trade: everything between. Ratio range: the middle hour\'s '
        'range of ratios on those markets, the dearer end over the cheaper, less 1; a range within the hour, not a bid '
        'and an ask, and not part of the pill. In stock: the most of it on offer this hour on those markets, added '
        'together; the feed gives the stock as a range within the hour, and this is the top of it.'
        % (EASY_HOURS, ml.divines(EASY_DIV), THIN_HOURS, ml.divines(THIN_DIV)))


def pill(hours, div):
    if hours >= EASY_HOURS and div >= EASY_DIV:
        return 'Easy'
    if hours < THIN_HOURS or div < THIN_DIV:
        return 'Thin'
    return 'Slow'


def build(ctx):
    cur = ctx.cur
    T = cur.last
    lo = T - 23 * 3600
    rate, tot, _ = cur.window(lo, T)
    ranges, stock = {}, {}
    for r in cxlib.league_rows(ctx.cx, cur.archive, lo, T):
        for s, t in (('a', 'b'), ('b', 'a')):
            x, o = r[s], r[t]
            if o not in cxlib.MONEY or x in cxlib.MONEY:
                continue
            n = ctx.names.get(x)
            if not n:
                continue
            if r['hour'] == T:
                stock[n] = stock.get(n, 0) + (r.get('highest_stock_' + s) or 0)
            if (r.get('volume_traded_' + s) or 0) > 0 and (r.get('volume_traded_' + t) or 0) > 0:
                lx, lo_, hx, ho = (r.get('lowest_ratio_' + s), r.get('lowest_ratio_' + t),
                                   r.get('highest_ratio_' + s), r.get('highest_ratio_' + t))
                if lx and lo_ and hx and ho:
                    p1, p2 = lo_ / lx, ho / hx          # what one of it went for at each end of the range
                    ranges.setdefault(n, []).append(max(p1, p2) / min(p1, p2) - 1)
    rows = []
    for n, (ex, amt, hrs) in tot.items():
        if n in ml.MONEY or not amt:
            continue
        div = ex / rate
        rs = sorted(ranges.get(n) or [])
        mid = rs[len(rs) // 2] if rs else None
        rows.append([n, pill(hrs, div), hrs, ml.sig(div), None if mid is None else round(mid * 100), stock.get(n)])
    order = {'Easy': 0, 'Slow': 1, 'Thin': 2}
    rows.sort(key=lambda r: (order[r[1]], -(r[3] or 0), r[0]))
    out = ml.head(RULE, easy_hours=EASY_HOURS, easy_divines=EASY_DIV, thin_hours=THIN_HOURS, thin_divines=THIN_DIV)
    out.update({'league': cur.name, 'from': ml.when(lo), 'to': ml.when(T),
                'counts': {p: sum(1 for r in rows if r[1] == p) for p in order},
                'cols': ['name', 'pill', 'hours traded of 24', 'divines traded', 'ratio range % (middle hour)',
                         'in stock this hour (up to)'],
                'items': rows})
    return {FILE: out}
