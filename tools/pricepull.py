"""Real prices from the official trade site, for every price on the site. Runs once an hour in
.github/workflows/prices.yml and spreads its checks over about 55 minutes, never in a burst.

Currency prices come from the in-game Currency Exchange instead (tools/exchange.py).
What it checks, oldest first (it asks the site, GET /api/prices/state, when each was last checked):
  - uniques: the 10 cheapest listings from online sellers (the site uses the middle of the 5 cheapest). About 58 an hour.
  - trade slider tiers (data/pricejobs.json, tools/rollprices.py) and farm inputs (data/farmqueries.json).
Results go to POST /api/prices/ingest a few at a time. The site works out each price (the middle of those
listings, in divines) and keeps one price per day for trends.

Signing in to the site: GitHub gives this job a short-lived signed token (OpenID Connect); the site checks it.
No password or key is stored anywhere.

The trade site's limits come back in the X-Rate-Limit headers: searches about 100 an hour (this makes 88),
It slows down near a limit and stops if one is hit.

    python tools/pricepull.py                 # in GitHub Actions
    python tools/pricepull.py --dry 2 0       # locally: 2 searches, printed, not sent
"""
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://wraeclastindex.fyi'
CATALOGUE = 'https://metaseonso.github.io/wraeclast-index/data/market.json'
API = 'https://www.pathofexile.com/api/trade2/'
UA = 'wraeclast-index/1.0 (contact: https://github.com/metaseonso/wraeclast-index/issues)'
SPAN = 55 * 60
SEARCH = {'uniq': 58, 'roll': 18, 'farm': 12}   # searches per run
EXCHANGE = 0                                    # currency comes from the Currency Exchange feed now
BATCH = 12


class Limited(Exception):
    pass


def http(url, body=None, headers=None, timeout=30):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'User-Agent': UA, 'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r), r.headers


def trade(path, body=None):
    """One call to the trade site. Returns (data, seconds to wait before the next call in this lane)."""
    try:
        data, h = http(API + path, body)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            raise Limited('trade site said slow down (retry after %s s)' % e.headers.get('Retry-After'))
        raise
    rules, state = h.get('X-Rate-Limit-Ip'), h.get('X-Rate-Limit-Ip-State')
    wait = 0
    if rules and state:
        for rule, st in zip(rules.split(','), state.split(',')):
            mx, per, _ = map(int, rule.split(':'))
            hits, _, locked = map(int, st.split(':'))
            if locked:
                raise Limited('locked out for %d s' % locked)
            if hits >= mx - 1:
                if per > 900:
                    raise Limited('close to the %d s limit' % per)
                wait = max(wait, per + 1)
    return data, wait


def oidc():
    url, tok = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'), os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    if not url or not tok:
        return None
    data, _ = http(url + '&audience=' + urllib.parse.quote(SITE), headers={'Authorization': 'bearer ' + tok})
    return data['value']


def site(path, body=None):
    token = oidc()
    if not token:
        sys.exit('no GitHub sign-in token (this runs in GitHub Actions with id-token: write)')
    data, _ = http(SITE + path, body, {'Authorization': 'Bearer ' + token})
    return data


# ---------- what there is to check ----------
def jobs(catalogue):
    out = {'roll': [], 'farm': [], 'uniq': [], 'cur': []}
    roll = json.loads((ROOT / 'data' / 'pricejobs.json').read_text(encoding='utf-8'))
    for stat, values in roll.get('roll', []):
        for v in values:
            out['roll'].append(('roll:%s@%s' % (stat, v), {
                'query': {'status': {'option': 'online'},
                          'stats': [{'type': 'and', 'filters': [{'id': stat, 'value': {'min': v}}]}],
                          'filters': {'type_filters': {'filters': {'rarity': {'option': 'nonunique'}}}}},
                'sort': {'price': 'asc'}}))
    fq = ROOT / 'data' / 'farmqueries.json'
    if fq.exists():
        farm = json.loads(fq.read_text(encoding='utf-8'))
        for f in (farm if isinstance(farm, list) else farm.get('queries') or farm.get('items') or []):
            if f.get('key') and f.get('query'):
                body = dict(f['query']) if 'query' in f['query'] else {'query': f['query']}
                body['query'] = {**body['query'], 'status': {'option': 'online'}}
                body['sort'] = {'price': 'asc'}
                out['farm'].append(('farm:' + f['key'], body))
    index = json.loads((ROOT / 'data' / 'index.json').read_text(encoding='utf-8'))
    for it in index['items']:
        if it['k'] != 'u':
            continue
        base = (it.get('s') or '').split(' · ')[0]
        q = {'status': {'option': 'online'}, 'name': it['n'],
             'filters': {'type_filters': {'filters': {'rarity': {'option': 'unique'}}}}}
        if base:
            q['type'] = base
        out['uniq'].append(('uniq:' + it['id'], {'query': q, 'sort': {'price': 'asc'}}))
    exchange = json.loads((ROOT / 'data' / 'trade.json').read_text(encoding='utf-8'))['exchange']
    for key in catalogue.get('items', {}):
        name = key[2:]
        if key.startswith('c:') and name in exchange and exchange[name] != 'exalted':
            out['cur'].append(('cur:%s|%s' % (exchange[name], name), exchange[name]))
    return out


def oldest(items, at, n):
    return sorted(items, key=lambda kv: at.get(kv[0], ''))[:n]


# ---------- one check ----------
def listing_prices(league, body, counts):
    found, wait = trade('search/poe2/' + urllib.parse.quote(league), body)
    counts['trade_search'] += 1
    ids = (found.get('result') or [])[:10]
    p = []
    if ids:
        got, w = trade('fetch/' + ','.join(ids) + '?query=' + found['id'] + '&realm=poe2')
        counts['trade_fetch'] += 1
        wait = max(wait, w)
        for x in got.get('result') or []:
            pr = ((x or {}).get('listing') or {}).get('price') or {}
            if pr.get('amount') and pr.get('currency'):
                p.append([pr['amount'], pr['currency']])
    return {'p': p, 'total': found.get('total', 0)}, wait


def exchange_offers(league, want, have, rate, counts):
    body = {'query': {'status': {'option': 'online'}, 'have': have, 'want': [want]}, 'sort': {'have': 'asc'}, 'engine': 'new'}
    data, wait = trade('exchange/poe2/' + urllib.parse.quote(league), body)
    counts['trade_exchange'] += 1
    offers = []
    for v in (data.get('result') or {}).values():
        for o in ((v or {}).get('listing') or {}).get('offers') or []:
            ex, it = o.get('exchange') or {}, o.get('item') or {}
            if ex.get('amount') and it.get('amount') and ex.get('currency') in ('divine', 'exalted'):
                unit = ex['amount'] / it['amount']
                offers.append((unit if ex['currency'] == 'divine' else unit / rate if rate else unit, unit, ex['currency']))
    offers.sort()
    return {'p': [[u, c] for _, u, c in offers[:10]], 'total': data.get('total', len(offers))}, wait


def main():
    dry = [int(x) for x in sys.argv[sys.argv.index('--dry') + 1:sys.argv.index('--dry') + 3]] if '--dry' in sys.argv else None
    catalogue, _ = http(CATALOGUE)
    league = catalogue['league']
    todo = jobs(catalogue)
    at = {} if dry else site('/api/prices/state?league=' + urllib.parse.quote(league)).get('at', {})
    searches = []
    for kind, n in SEARCH.items():
        searches += oldest(todo[kind], at, n)
    # stalest first across kinds, so a slow first run still covers the most important gaps
    searches.sort(key=lambda kv: at.get(kv[0], ''))
    divine = [kv for kv in todo['cur'] if kv[0].startswith('cur:divine|')]
    others = oldest([kv for kv in todo['cur'] if not kv[0].startswith('cur:divine|')], at, EXCHANGE - 1)
    exchanges = (divine + others) if EXCHANGE else []
    if dry:
        searches, exchanges = searches[:dry[0]], exchanges[:dry[1]]
    gap_s, gap_e = SPAN / max(1, len(searches)), SPAN / max(1, len(exchanges))
    print(league, len(searches), 'searches (one every %.0f s),' % gap_s, len(exchanges), 'exchange checks (one every %.0f s)' % gap_e)
    counts = {'trade_search': 0, 'trade_fetch': 0, 'trade_exchange': 0, 'trade_limited': 0, 'trade_error': 0}
    rows, rate = [], None
    start = time.time()
    lanes = {'s': {'list': searches, 'i': 0, 'gap': gap_s, 'next': start, 'on': True},
             'e': {'list': exchanges, 'i': 0, 'gap': gap_e, 'next': start, 'on': True}}

    def flush(force=False):
        nonlocal rows, counts
        if not rows and not force:
            return
        payload = {'league': league, 'rows': rows, 'load': counts}
        if dry:
            print(json.dumps(payload)[:600])
        elif rows or any(counts.values()):
            print('sent', len(rows), site('/api/prices/ingest', payload))
        rows, counts = [], {k: 0 for k in counts}

    while True:
        live = [(k, l) for k, l in lanes.items() if l['on'] and l['i'] < len(l['list'])]
        if not live:
            break
        k, lane = min(live, key=lambda kl: kl[1]['next'])
        if time.time() < lane['next'] and not dry:
            time.sleep(lane['next'] - time.time())
        key, what = lane['list'][lane['i']]
        lane['i'] += 1
        wait = 0
        try:
            if k == 's':
                res, wait = listing_prices(league, what, counts)
            else:
                if key.startswith('cur:divine|'):
                    res, wait = exchange_offers(league, 'divine', ['exalted'], None, counts)
                    units = sorted(u for u, c in res['p'] if c == 'exalted')[:5]
                    rate = statistics.median(units) if units else None
                else:
                    res, wait = exchange_offers(league, what, ['divine', 'exalted'], rate, counts)
            rows.append({'key': key, **res})
        except Limited as e:
            counts['trade_limited'] += 1
            print('lane', k, 'stopped:', e)
            lane['on'] = False
        except Exception as e:   # one bad check: note it and go on
            counts['trade_error'] += 1
            print('error', key, e)
        lane['next'] = max(lane['next'] + lane['gap'], time.time() + wait)
        if len(rows) >= BATCH:
            flush()
    flush(force=True)
    print('done in %.0f s' % (time.time() - start))


if __name__ == '__main__':
    main()
