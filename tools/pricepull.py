"""Live trade prices, pulled slowly: runs once an hour in .github/workflows/prices.yml and spreads its
official trade searches evenly over about 55 minutes (one every ~40 s), never in a burst.

Jobs: the mod tiers in data/pricejobs.json (tools/rollprices.py) and the farm inputs in data/farmqueries.json.
For each: search the current league (online sellers, cheapest first), read the 10 cheapest listings, and send
them to the site (POST /api/prices/ingest) a few at a time. The site keeps them in its database and serves
/data/rollprices.json and /data/farmprices.json, priced in divines.

Signing in to the site: GitHub gives this job a short-lived signed token (OpenID Connect) that says which repo
and workflow it is; the site checks GitHub's signature. No password or key is stored anywhere.

The trade site allows about 100 searches an hour from one address; this makes at most 90, reads the
X-Rate-Limit headers and stops early when it gets close.

    python tools/pricepull.py              # in GitHub Actions
    python tools/pricepull.py --dry 3      # locally: 3 searches, print instead of sending
"""
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://wraeclastindex.fyi'
WORTH = 'https://metaseonso.github.io/wraeclast-index/data/worth.json'
API = 'https://www.pathofexile.com/api/trade2/'
UA = 'wraeclast-index/1.0 (+https://wraeclastindex.fyi)'
SPAN = 55 * 60     # seconds to spread the searches over
MAX = 90           # searches per run
BATCH = 4          # results per upload


class Limited(Exception):
    pass


def http(url, body=None, headers=None, timeout=30):
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body is not None else None,
                                 headers={'User-Agent': UA, 'Content-Type': 'application/json', **(headers or {})})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.load(r), r.headers


def trade(path, body=None):
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


def jobs():
    out = []
    roll = json.loads((ROOT / 'data' / 'pricejobs.json').read_text(encoding='utf-8'))
    for stat, values in roll.get('roll', []):
        for v in values:
            out.append(('roll:%s@%s' % (stat, v), {
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
                out.append(('farm:' + f['key'], body))
    return out[:MAX]


def oidc():
    """A fresh signed token from GitHub for this job (valid a few minutes)."""
    url, tok = os.environ.get('ACTIONS_ID_TOKEN_REQUEST_URL'), os.environ.get('ACTIONS_ID_TOKEN_REQUEST_TOKEN')
    if not url or not tok:
        return None
    data, _ = http(url + '&audience=' + urllib.parse.quote(SITE), headers={'Authorization': 'bearer ' + tok})
    return data['value']


def send(league, rows, counts, dry):
    if not rows and not any(counts.values()):
        return
    payload = {'league': league, 'rows': rows, 'load': counts}
    if dry:
        print('would send', json.dumps(payload)[:400])
        return
    token = oidc()
    if not token:
        sys.exit('no GitHub sign-in token (this runs in GitHub Actions with id-token: write)')
    data, _ = http(SITE + '/api/prices/ingest', payload, {'Authorization': 'Bearer ' + token})
    print('sent', len(rows), data)


def main():
    dry = int(sys.argv[sys.argv.index('--dry') + 1]) if '--dry' in sys.argv else 0
    worth, _ = http(WORTH)
    league = worth['league']
    todo = jobs()[:dry] if dry else jobs()
    gap = SPAN / max(1, len(todo))
    print(league, len(todo), 'searches, one every %.0f s' % gap)
    start, rows = time.time(), []
    counts = {'trade_search': 0, 'trade_fetch': 0, 'trade_limited': 0, 'trade_error': 0}
    try:
        for i, (key, body) in enumerate(todo):
            due = start + i * gap
            if time.time() < due and not dry:
                time.sleep(due - time.time())
            try:
                found, wait = trade('search/poe2/' + urllib.parse.quote(league), body)
                counts['trade_search'] += 1
                ids = (found.get('result') or [])[:10]
                p = []
                if ids and not wait:
                    got, wait = trade('fetch/' + ','.join(ids) + '?query=' + found['id'] + '&realm=poe2')
                    counts['trade_fetch'] += 1
                    p = [[x['listing']['price']['amount'], x['listing']['price']['currency']]
                         for x in got.get('result') or [] if x and (x.get('listing') or {}).get('price', {}).get('amount')]
                if not ids or p:
                    rows.append({'key': key, 'p': p, 'total': found.get('total', 0)})
                if wait:
                    time.sleep(wait)
            except Limited:
                raise
            except Exception as e:   # one bad search: note it and go on
                counts['trade_error'] += 1
                print('error', key, e)
            if len(rows) >= BATCH:
                send(league, rows, counts, dry)
                rows, counts = [], {k: 0 for k in counts}
    except Limited as e:
        counts['trade_limited'] += 1
        print('stopped early:', e)
    send(league, rows, counts, dry)


if __name__ == '__main__':
    main()
