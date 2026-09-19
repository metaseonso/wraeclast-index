"""Build data/exchange.json: currency prices from the in-game Currency Exchange, using GGG's own public feed
(https://www.pathofexile.com/developer/docs/reference#currency-exchange). Every hour GGG publishes each market
(a pair of currencies) that traded in that hour: how much of each side changed hands. A currency's price is
what it actually traded for: divines (or exalted or chaos, turned into divines at that hour's own rate) paid,
divided by the amount bought, over the last 24 hours.

Runs every hour on the data server (tools/vm/; until the move is done, also in .github/workflows/pages.yml
after tools/market.py, which gives the league). It keeps its running totals in exchange-state.json: on the data
server in WI_DATA_DIR; in GitHub Actions, published with the site so the next run continues from it. With no
totals yet it takes that published copy once, else a first run fills in the last 14 days, so trends show at once.
Where files go and how they reach the site: tools/sitedata.py.

Output data/exchange.json:
  league, updated (end of the last hour read), rate (exalted per divine, last 24 h)
  items[name]: v (divines, last 24 h), v1h (last hour), vol (divines traded, last 24 h), tid (trade site id),
               h ([[day, v], ...] one price per day), ch (% move over 7 days), pairs (busiest markets:
               [other currency, how many of it one buys, divines traded])
  markets: the busiest markets over the last 24 h: [a, b, how many b one a buys, divines traded]

    python tools/exchange.py
"""
import datetime as dt
import json
import sys
import time
import urllib.error
import urllib.request

import sitedata

FEED = 'https://web.poecdn.com/api/currency-exchange/poe2/'
LAST = 'https://metaseonso.github.io/wraeclast-index/data/exchange-state.json'
REPOE = 'https://repoe-fork.github.io/poe2/base_items.json'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
DIV, EX, CHAOS = 'Metadata/Items/Currency/CurrencyModValues', 'Metadata/Items/Currency/CurrencyAddModToRare', 'Metadata/Items/Currency/CurrencyRerollRare'
BACKFILL_DAYS, KEEP_DAYS = 14, 45


def get(url, tries=3):
    for i in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(3 * (i + 1))
        except (urllib.error.URLError, TimeoutError):
            time.sleep(3 * (i + 1))
    raise RuntimeError('could not read ' + url)


def hour_totals(markets, league):
    """One hour: per currency, [divines paid, amount bought], from the markets against divine, exalted or chaos."""
    ms = [m for m in markets if m.get('league') == league]
    vol = lambda m, x: (m.get('volume_traded') or {}).get(x) or 0
    rate = chaos = None
    for m in ms:
        pair = set(m['market_pair'])
        if pair == {DIV, EX} and vol(m, DIV):
            rate = vol(m, EX) / vol(m, DIV)               # exalted per divine
        if pair == {DIV, CHAOS} and vol(m, DIV):
            chaos = vol(m, CHAOS) / vol(m, DIV)          # chaos per divine
    if chaos is None and rate:
        for m in ms:
            if set(m['market_pair']) == {EX, CHAOS} and vol(m, EX):
                chaos = vol(m, CHAOS) / vol(m, EX) * rate
    in_div = {DIV: 1.0, EX: 1 / rate if rate else None, CHAOS: 1 / chaos if chaos else None}
    out, pairs = {}, {}
    for m in ms:
        a, b = m['market_pair']
        for x, o in ((a, b), (b, a)):
            if o not in in_div or not in_div[o] or not vol(m, x) or not vol(m, o):
                continue
            paid = vol(m, o) * in_div[o]
            t = out.setdefault(x, [0.0, 0])
            t[0] += paid
            t[1] += vol(m, x)
            if x not in in_div:   # the market itself, for "busiest markets"
                p = pairs.setdefault((x, o), [0.0, 0, 0])
                p[0] += paid
                p[1] += vol(m, x)
                p[2] += vol(m, o)
    return rate, out, pairs


def main():
    cat = sitedata.latest('market.json')
    league = cat['league']
    names = {k: v.get('name') for k, v in (get(REPOE) or {}).items() if v.get('name')}
    names[DIV], names[EX], names[CHAOS] = 'Divine Orb', 'Exalted Orb', 'Chaos Orb'
    tids = sitedata.site_file('trade.json')['exchange']
    kept = sitedata.DATA / 'exchange-state.json'
    if sitedata.SERVER and kept.exists():
        st = json.loads(kept.read_text(encoding='utf-8'))
    else:   # GitHub Actions, or the data server's first run: the copy published with the site
        try:
            st = get(LAST) or {}
        except RuntimeError:
            st = {}
    if st.get('league') != league:
        st = {}
    now_hour = int(time.time()) // 3600 * 3600
    nxt = st.get('next') or now_hour - BACKFILL_DAYS * 86400
    hours = {int(k): v for k, v in (st.get('hours') or {}).items()}
    days = st.get('days') or {}
    rates = {int(k): v for k, v in (st.get('rates') or {}).items()}
    pairs24 = {int(k): v for k, v in (st.get('pairs') or {}).items()}
    read = 0
    while nxt < now_hour:
        d = get(FEED + str(nxt))
        if not d:
            break
        rate, tot, pairs = hour_totals(d.get('markets') or [], league)
        hours[nxt] = {x: [round(v[0], 6), v[1]] for x, v in tot.items()}
        if rate:
            rates[nxt] = rate
        pairs24[nxt] = [[x, o, round(v[0], 4), v[1], v[2]] for (x, o), v in pairs.items()]
        day = dt.datetime.fromtimestamp(nxt, dt.timezone.utc).strftime('%Y-%m-%d')
        dd = days.setdefault(day, {})
        for x, v in tot.items():
            t = dd.setdefault(x, [0.0, 0])
            t[0] = round(t[0] + v[0], 6)
            t[1] += v[1]
        read += 1
        n = d.get('next_change_id')
        if not n or n <= nxt:
            break
        nxt = n
        time.sleep(0.4)
    # keep 24 hours of hourly totals and KEEP_DAYS of daily totals
    cut = nxt - 24 * 3600
    hours = {k: v for k, v in hours.items() if k >= cut}
    rates = {k: v for k, v in rates.items() if k >= cut}
    pairs24 = {k: v for k, v in pairs24.items() if k >= cut}
    days = dict(sorted(days.items())[-KEEP_DAYS:])
    if not hours:
        sys.exit('no Currency Exchange data for %s; keeping the last file' % league)
    state = {'league': league, 'next': nxt, 'hours': {str(k): v for k, v in hours.items()}, 'days': days,
             'rates': {str(k): v for k, v in rates.items()}, 'pairs': {str(k): v for k, v in pairs24.items()}}
    sitedata.save(kept, json.dumps(state, separators=(',', ':')))

    # ---------- the summary the site reads ----------
    last = max(hours)
    day24 = {}
    for h in hours.values():
        for x, v in h.items():
            t = day24.setdefault(x, [0.0, 0])
            t[0] += v[0]
            t[1] += v[1]
    items = {}
    today = max(days)
    for x, (paid, amount) in day24.items():
        name = names.get(x)
        if not name or not amount:
            continue
        it = {'v': float('%.4g' % (paid / amount)), 'vol': round(paid, 2)}
        lh = hours[last].get(x)
        if lh and lh[1]:
            it['v1h'] = float('%.4g' % (lh[0] / lh[1]))
        hist = [[d, float('%.4g' % (days[d][x][0] / days[d][x][1]))] for d in sorted(days) if x in days[d] and days[d][x][1]]
        if len(hist) >= 2:
            it['h'] = hist
            week = [p for p in hist if (dt.date.fromisoformat(today) - dt.date.fromisoformat(p[0])).days in (6, 7)]
            if week and week[0][1] > 0:
                it['ch'] = round((it['v'] / week[0][1] - 1) * 100, 1)
        if name in tids:
            it['tid'] = tids[name]
        items[name] = it
    # the busiest markets over 24 h, and each currency's own busiest
    agg = {}
    for plist in pairs24.values():
        for x, o, paid, vx, vo in plist:
            t = agg.setdefault((x, o), [0.0, 0, 0])
            t[0] += paid
            t[1] += vx
            t[2] += vo
    markets = []
    for (x, o), (paid, vx, vo) in agg.items():
        if names.get(x) and names.get(o) and vx:
            markets.append([names[x], names[o], float('%.4g' % (vo / vx)), round(paid, 2)])
    markets.sort(key=lambda m: -m[3])
    for m in markets:
        it = items.get(m[0])
        if it is not None and len(it.setdefault('pairs', [])) < 5:
            it['pairs'].append([m[1], m[2], m[3]])
    r24 = [v for v in rates.values() if v]
    out = {'league': league, 'source': 'Currency Exchange (GGG public feed)',
           'updated': dt.datetime.fromtimestamp(nxt, dt.timezone.utc).isoformat(timespec='minutes'),
           'rate': float('%.4g' % (sum(r24) / len(r24))) if r24 else None, 'items': items, 'markets': markets[:80]}
    if items.get('Exalted Orb') and items['Exalted Orb'].get('v'):
        out['rate'] = float('%.4g' % (1 / items['Exalted Orb']['v']))
    sitedata.publish('exchange.json', out)
    print(league, 'hours read:', read, 'currencies:', len(items), 'rate:', out['rate'], 'ex/div')


if __name__ == '__main__':
    main()
