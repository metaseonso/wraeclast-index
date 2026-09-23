"""Build data/market.json: the catalogue of currency-like items (names, pictures, what they do, drop level) and
the league name, from poe.ninja's public economy API. NO PRICES: the site shows only real prices, which come from
the in-game Currency Exchange (tools/exchange.py) and live trade listings (tools/pricepull.py); the site's worker
(worker/prices.js) builds the /data/market.json that pages read. poe.ninja's prices are dropped here.

Runs every hour in .github/workflows/pages.yml, and by hand:  python tools/market.py
(where files go and how they reach the site: tools/sitedata.py)
poe.ninja's API guidelines (https://poe.ninja/docs/api): public economy endpoints only, a descriptive
User-Agent, at most hourly, low concurrency. This script makes about 24 requests, one after another.

Output, every price in divine:
  items["c:<name>"]           currency-like items: v, ch (7-day %), sp (7-day line), vol, cat, ic, u (what it does)
  items["u:<name> | <base>"]  uniques and tablets: v, ch, sp, ls (listings)
  items["u:<name>"]           the most-listed variant of that unique, for plain name lookups
"""
import datetime as dt
import gzip
import json
import sys
import time
import urllib.parse
import urllib.request

import lastgood
import sitedata

API = 'https://poe.ninja/poe2/api/economy/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
CDN = 'https://web.poecdn.com'
ART = 'https://repoe-fork.github.io/poe2/'   # the game's own item art, as RePoE exports it

EXCHANGE = {  # type -> label on the Currency tab
    'Currency': 'Currency', 'Fragments': 'Fragments', 'Abyss': 'Abyssal Bones', 'UncutGems': 'Uncut Gems',
    'LineageSupportGems': 'Lineage Supports', 'Essences': 'Essences', 'SoulCores': 'Soul Cores', 'Idols': 'Idols',
    'Runes': 'Runes', 'Ritual': 'Omens', 'Expedition': 'Expedition', 'Delirium': 'Liquid Emotions',
    'Breach': 'Catalysts', 'Verisium': 'Verisium',
}
STASH = ['UniqueWeapons', 'UniqueArmours', 'UniqueAccessories', 'UniqueFlasks', 'UniqueCharms',
         'UniqueJewels', 'UniqueSanctumRelics', 'UniqueTablets', 'PrecursorTablets']


def get(path, **params):
    url = API + path + ('?' + urllib.parse.urlencode(params) if params else '')
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'gzip'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=40) as r:
                body = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                return json.loads(body)
        except Exception as e:  # one retry after a pause, then give up on this type
            if attempt == 2:
                print('  failed', url, e, file=sys.stderr)
                return None
            time.sleep(5)


def get_state():
    req = urllib.request.Request('https://poe.ninja/poe2/api/data/index-state',
                                 headers={'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            body = r.read()
            return json.loads(gzip.decompress(body) if r.headers.get('Content-Encoding') == 'gzip' else body)
    except Exception as e:
        print('  index-state failed', e, file=sys.stderr)
        return None


def to_div(core):
    """Factor that turns a primaryValue into divine."""
    primary = (core or {}).get('primary', 'divine')
    rates = (core or {}).get('rates') or {}
    if primary == 'divine':
        return 1.0
    return rates.get('divine')  # rates are "units per 1 primary"


def rnd(v, sig=4):
    if v is None:
        return None
    return float('%.*g' % (sig, v))


def line(sp):
    pts = [p for p in ((sp or {}).get('data') or [])]
    return [None if p is None else round(p, 2) for p in pts]


def build():
    """The catalogue as the site reads it. Anything wrong in here is a fault: main() keeps the last file."""
    leagues = get('leagues') or []
    league = next((l['id'] for l in leagues if l.get('id') and 'Standard' not in l['id'] and not l['id'].startswith('HC ')), None)
    if not league:
        raise lastgood.Stale('poe.ninja does not name a current league')
    info = sitedata.site_file('info.json')
    items, rates = {}, None

    for typ, label in EXCHANGE.items():
        d = get('exchange/current/overview', league=league, type=typ)
        if not d or not d.get('lines'):
            print('  empty', typ, file=sys.stderr)
            continue
        f = to_div(d.get('core'))
        if typ == 'Currency':
            rates = d['core'].get('rates')
        meta = {x['id']: x for x in (d.get('items') or []) + (d.get('core', {}).get('items') or [])}
        prices = {l['id']: (l.get('primaryValue') or 0) * f for l in d['lines']}
        for l in d['lines']:
            m = meta.get(l['id'], {})
            name = m.get('name')
            if not name or l.get('primaryValue') is None:
                continue
            v = l['primaryValue'] * f
            e = {'n': name, 'cat': label, 'v': rnd(v), 'ch': rnd((l.get('sparkline') or {}).get('totalChange'), 3),
                 'sp': line(l.get('sparkline')), 'vol': rnd((l.get('volumePrimaryValue') or 0) * f, 3)}
            gi = info.get(name)
            if m.get('image'):
                e['ic'] = CDN + m['image'] if m['image'].startswith('/') else m['image']
            elif gi and gi.get('a'):   # poe.ninja has no picture for a few: the game's own art
                e['ic'] = ART + urllib.parse.quote(gi['a']) + '.webp'
            if m.get('detailsId'):
                e['did'] = m['detailsId']
            # the busiest trading pair implies its own price; a gap against the index price is a route to check
            pair, rate = l.get('maxVolumeCurrency'), l.get('maxVolumeRate')
            pv = prices.get(pair) if pair else None
            if pair == 'divine':
                pv = 1.0
            if pair and rate and pv and v:
                e['pair'] = pair
                e['gap'] = rnd((pv / rate / v - 1) * 100, 3)
            if gi and gi.get('t'):
                e['u'] = gi['t']
                if gi.get('dl'):
                    e['dl'] = gi['dl']
            items['c:' + name] = e
        time.sleep(1)

    # Routes for the core currencies: each trading pair is its own market, so the same orb can cost
    # less in one currency than it sells for in another. Rates are poe.ninja's daily averages.
    r = rates or {}
    to_div_pair = {'divine': 1.0, 'exalted': 1 / r['exalted'] if r.get('exalted') else None,
                   'chaos': 1 / r['chaos'] if r.get('chaos') else None}
    for key, e in list(items.items()):
        if e.get('cat') != 'Currency' or not e.get('did'):
            continue
        d = get('exchange/current/details', league=league, type='Currency', id=e['did'])
        time.sleep(0.5)
        if not d or not d.get('pairs'):
            continue
        routes, hist_pair = [], None
        for p in d['pairs']:
            f = to_div_pair.get(p.get('id'))
            if not f or not p.get('rate'):
                continue
            routes.append({'via': p['id'], 'v': rnd(p['rate'] * f), 'vol': rnd(p.get('volumePrimaryValue') or 0, 3)})
            if hist_pair is None or (p.get('volumePrimaryValue') or 0) > (hist_pair.get('volumePrimaryValue') or 0):
                hist_pair = p
        if len(routes) >= 2:
            lo = min(routes, key=lambda x: x['v'])
            hi = max(routes, key=lambda x: x['v'])
            e['routes'] = routes
            e['arb'] = {'buy': lo['via'], 'sell': hi['via'], 'gain': rnd((hi['v'] / lo['v'] - 1) * 100, 3),
                        'thin': rnd(min(lo['vol'], hi['vol']), 3)}
        if hist_pair and to_div_pair.get(hist_pair['id']):   # league-long daily price, oldest first
            f = to_div_pair[hist_pair['id']]
            pts = sorted(hist_pair.get('history') or [], key=lambda h: h['timestamp'])
            e['h'] = [[h['timestamp'][:10], rnd(h['rate'] * f)] for h in pts if h.get('rate')]

    for typ in STASH:
        d = get('stash/current/item/overview', league=league, type=typ)
        if not d or not d.get('lines'):
            print('  empty', typ, file=sys.stderr)
            continue
        f = to_div(d.get('core'))
        best = {}
        for l in d['lines']:
            if l.get('primaryValue') is None or not l.get('name'):
                continue
            e = {'v': rnd(l['primaryValue'] * f), 'ch': rnd((l.get('sparkLine') or {}).get('totalChange'), 3),
                 'sp': line(l.get('sparkLine')), 'ls': l.get('listingCount', 0)}
            key = l['name'] + ' | ' + (l.get('baseType') or '')
            if key in items and items[key].get('ls', 0) >= e['ls']:
                continue
            items['u:' + key] = e
            if e['ls'] >= best.get(l['name'], {}).get('ls', -1):
                best[l['name']] = e
        for n, e in best.items():
            items['u:' + n] = e
        time.sleep(1)

    # the league's page name on poe.ninja's builds site, so cards can link to "builds using this"
    state = get_state() or {}
    slug = next((v.get('url') for v in state.get('snapshotVersions') or [] if v.get('name') == league), None)
    # the catalogue only: names, pictures, text, drop level. No prices of any kind (see the top of this file).
    keep = ('n', 'cat', 'ic', 'did', 'u', 'dl')
    catalogue = {k: {f: v[f] for f in keep if f in v} for k, v in items.items() if k.startswith('c:')}
    seen = {}
    for k in items:
        seen[k[0]] = seen.get(k[0], 0) + 1
    print(league, seen, 'rates', rates)
    return {'league': league, 'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'),
            'source': 'catalogue (names and pictures); prices come from the Currency Exchange and trade listings',
            'builds': slug, 'items': catalogue}


def main():
    # Last good wins: a poe.ninja outage, or one of its types going quiet, never empties the Currency tab.
    # 100 is the floor the catalogue has always cleared; a type that went missing is caught by the kind check.
    out = lastgood.pull('Currency list', build, file='market.json', url=API, at='items', floor=100)
    if out is not None:
        sitedata.publish('market.json', out)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Currency list', file='market.json', url=API))
