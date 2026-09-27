"""Real prices from the official trade site, for every price on the site. Runs once an hour, in
.github/workflows/prices.yml, and spreads its checks over about 55 minutes, never in a burst.

Currency prices come from the in-game Currency Exchange instead (tools/exchange.py), hourly, so they are not
in this budget at all.
What it checks (it asks the site, GET /api/prices/state, when each was last checked):
  - uniques: the 10 cheapest listings from online sellers (the site uses the middle of the 5 cheapest)
  - the uniques the Bosses tab shows: the same checks, on a share of their own
  - base items, white: the best base of each shape a player shops in (data/basequeries.json,
    tools/baseprices.py, which states which bases and why). The white one only — a rare of the same name is
    another item at another price and never stands in for it.
  - trade slider tiers (data/pricejobs.json, tools/rollprices.py), farm inputs (data/farmqueries.json) and the
    boss entry items the in-game Currency Exchange does not trade (data/bossqueries.json, by hand).
Results go to POST /api/prices/ingest a few at a time. The site works out each price (the middle of those
listings, in divines) and keeps one price per day for trends.

What this aims at is a day, not an hour: every priced thing seen at least once inside CYCLE hours. Each kind
takes a share of every run in proportion to how many it has waiting (share()), so every kind comes round in
the same time and there is one cycle number for the whole site; the kinds are then spread through the run
(plan()) with each kind's first check at the front, so a run the trade site cuts short still covers all of
them. Inside a kind it is oldest first, and nothing is carried over: the next run starts from what the site
says is oldest, which is wherever this one stopped.
The arithmetic, on today's lists (906 things: 644 uniques, 66 more of them on the Bosses tab, 108 base items,
55 slider points, 32 farm inputs, 1 boss entry item): seeing all of them inside a day needs 906/24 = 38
checks an hour to land. BUDGET is 88, a full pass every 10 hours, so the site can turn away most of a run and
the day still holds. A whole day of nothing but 16-search runs (the worst we have seen) is 384 checks, a
57-hour pass: that misses the day, the run says so in as many words, and the age on every price on the site
says so too.
What the base items took: the pass went from 9 hours to 10, and a unique's share of one run from 71 checks to
63, so every other kind comes round about an hour and a quarter later than it did. The 24 hours hold either
way. All 1,554 bases would not: 2,352 things is a 27-hour pass, which is why the list is the 108 (and where
it widens: tools/baseprices.py).

Signing in to the site: in GitHub Actions, GitHub gives this job a short-lived signed token (OpenID Connect);
the site checks it. Run by hand somewhere else, the key in WI_INGEST_KEY instead (the site keeps only its
SHA-256). Where the input files come from (data/ or WI_DATA_DIR): tools/sitedata.py.

Every batch also carries the run's own account (Tally): checks tried, came back, failed and why (rate limited,
no listings, HTTP errors), by kind. The site keeps it for the job watch, so the dashboard says "Unique prices: 15
of 22 checks failed this hour" rather than "on time". Past a quarter of a run failing, or one check failing 3
runs running, the run says so in plain words, opens or adds to one data-fault issue (tools/lastgood.py ticket)
and ends red. The prices already on the site stay, each with its own age.

The trade site's limits come back in the X-Rate-Limit headers: searches about 100 an hour (this makes 88),
It slows down near a limit and stops if one is hit.

    python tools/pricepull.py                       # in GitHub Actions, or by hand
    python tools/pricepull.py --dry 2 0             # locally: 2 searches, printed, not sent
    python tools/pricepull.py --offline --state f   # what a run would check, from a saved /api/prices/state
    python tools/pricepull.py --offline --cut 16    # the same, as if the site cut the run short after 16
"""
import datetime as dt
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import lastgood
import sitedata

SITE = sitedata.SITE
CATALOGUE = 'https://metaseonso.github.io/wraeclast-index/data/market.json'
API = 'https://www.pathofexile.com/api/trade2/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
SPAN = 55 * 60
BUDGET = 88          # searches in one run: the trade site allows about 100 an hour from one address
FLOOR = 1            # and every kind gets at least this many of them, so none can starve
CYCLE = 24           # hours a full pass of everything should take
KINDS = ('uniq', 'bossuniq', 'base', 'roll', 'farm', 'boss')   # what a search can be spent on, in plain words:
NAMES = {'uniq': 'uniques', 'bossuniq': 'boss uniques', 'base': 'base items', 'roll': 'mod rolls',
         'farm': 'farm inputs', 'boss': 'boss entry items', 'cur': 'currency'}
EXCHANGE = 0                                    # currency comes from the Currency Exchange feed now
BATCH = 12
# item classes, which the index gives in place of a base for a few uniques (jobs())
CLASSES = {'Amulet', 'Ring', 'Belt', 'Body Armour', 'Boots', 'Gloves', 'Helmet', 'Shield', 'Buckler', 'Focus', 'Quiver',
           'Jewel', 'Mace', 'One Hand Mace', 'Two Hand Mace', 'Sceptre', 'Staff', 'Quarterstaff', 'Wand', 'Bow',
           'Crossbow', 'Spear', 'Flail', 'Talisman', 'Claw', 'Dagger', 'Sword', 'Axe', 'Flask', 'Charm', 'Tablet'}


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
    token = sitedata.KEY or oidc()
    if not token:
        sys.exit('no sign-in: set WI_INGEST_KEY, or run in GitHub Actions with id-token: write')
    data, _ = http(SITE + path, body, {'Authorization': 'Bearer ' + token})
    return data


# ---------- what there is to check ----------
def bossitems(bosses):
    """Every name the Bosses tab puts a price on, lower-cased: the way in, what a boss drops, and the items
    only a drop rate table names (worker/prices.js, /data/bossprices.json)."""
    out = set()
    for b in (bosses or {}).get('bosses') or []:
        out.update(b.get('access') or [])
        out.update(d['name'] for d in b.get('drops') or [] if d.get('name'))
        out.update(r['item'] for r in ((b.get('rates') or {}).get('rows') or []) if r.get('item'))
    return {n.lower() for n in out if n}


def jobs(catalogue):
    out = {'roll': [], 'farm': [], 'boss': [], 'base': [], 'uniq': [], 'bossuniq': [], 'cur': []}
    roll = sitedata.site_file('pricejobs.json')
    for stat, values in roll.get('roll', []):
        for v in values:
            out['roll'].append(('roll:%s@%s' % (stat, v), {
                'query': {'status': {'option': 'online'},
                          'stats': [{'type': 'and', 'filters': [{'id': stat, 'value': {'min': v}}]}],
                          'filters': {'type_filters': {'filters': {'rarity': {'option': 'nonunique'}}}}},
                'sort': {'price': 'asc'}}))
    # the base items keep their own name as the key, the way the uniques do, so the site needs no second
    # list to turn a check back into the card it belongs to (worker/prices.js)
    for kind, name in (('farm', 'farmqueries.json'), ('boss', 'bossqueries.json'), ('base', 'basequeries.json')):
        written = sitedata.site_file(name, required=False)
        if written is None:
            continue
        for f in (written if isinstance(written, list) else written.get('queries') or written.get('items') or []):
            if f.get('key') and f.get('query'):
                body = dict(f['query']) if 'query' in f['query'] else {'query': f['query']}
                body['query'] = {**body['query'], 'status': {'option': 'online'}}
                body['sort'] = {'price': 'asc'}
                out[kind].append(('%s:%s' % (kind, f['key']), body))
    ontab = bossitems(sitedata.site_file('bosses.json', required=False))
    index = sitedata.site_file('index.json')
    # the base each unique really comes on, from the game files (data/uniques.json, "<name> | <base>")
    real = {}
    for k in sitedata.site_file('uniques.json', required=False) or {}:
        if ' | ' in k:
            n, b = k.split(' | ', 1)
            real.setdefault(n, []).append(b)
    for it in index['items']:
        if it['k'] != 'u':
            continue
        base = (it.get('s') or '').split(' · ')[0]
        # A unique the index files under its item class only ("Belt", "Helmet") is not a base the trade site
        # knows: it answered HTTP 400 for all 15 of them, every run, at the front of every run (they were never
        # priced, so always the oldest). Its one real base from the game files instead, or its name alone.
        if base in CLASSES and base not in real.get(it['n'], []):
            bases = real.get(it['n'], [])
            base = bases[0] if len(bases) == 1 else ''
        q = {'status': {'option': 'online'}, 'name': it['n'],
             'filters': {'type_filters': {'filters': {'rarity': {'option': 'unique'}}}}}
        if base:
            q['type'] = base
        # same uniq: key and one row either way; a unique a boss card shows just gets its own share of the
        # hour, so the Bosses tab never waits behind the other six hundred
        kind = 'bossuniq' if it['n'].lower() in ontab else 'uniq'
        out[kind].append(('uniq:' + it['id'], {'query': q, 'sort': {'price': 'asc'}}))
    exchange = sitedata.site_file('trade.json')['exchange']
    for key in catalogue.get('items', {}):
        name = key[2:]
        if key.startswith('c:') and name in exchange and exchange[name] != 'exalted':
            out['cur'].append(('cur:%s|%s' % (exchange[name], name), exchange[name]))
    return out


def oldest(items, at, n):
    return sorted(items, key=lambda kv: at.get(kv[0], ''))[:n]


# ---------- how one run's searches are split up and ordered ----------
def share(todo):
    """How many searches each kind gets this run: in proportion to how many it has waiting, so every kind
    comes round in the same time and one number is the cycle for the whole site. At least FLOOR each so
    nothing can starve, never more than a kind has waiting, and BUDGET in all (the rounding, and anything a
    short list does not want, goes to the longest lists)."""
    left = {k: len(todo[k]) for k in KINDS}
    total = sum(left.values()) or 1
    want = {k: min(left[k], max(FLOOR if left[k] else 0, BUDGET * left[k] // total)) for k in KINDS}
    for k in sorted(KINDS, key=lambda k: -left[k]):
        want[k] = max(0, want[k] + min(BUDGET - sum(want.values()), left[k] - want[k]))
    return want


def plan(todo, at):
    """One run's searches in the order they go out: each kind's oldest, then the kinds spread evenly through
    the run, with every kind's first check at the front. A run the trade site cuts short after a handful of
    searches therefore still covers every kind, in about the same proportions as a whole one.
    Returns the list of (kind, key, what) and how many of each kind it planned."""
    want = share(todo)
    picked = sorted(((k, oldest(todo[k], at, want[k])) for k in KINDS), key=lambda ki: len(ki[1]))
    spread = []
    for rank, (kind, items) in enumerate(picked):   # shortest list first, so the rarest kinds go out first
        for j, (key, what) in enumerate(items):
            spread.append((j / len(items), rank, kind, key, what))
    spread.sort(key=lambda x: x[:2])
    return [x[2:] for x in spread], {k: len(v) for k, v in picked}


# ---------- one check ----------
def listing_prices(league, body, counts, offline=False):
    if offline:   # --offline: no call at all, so a dry run can be driven from a saved state file
        counts['trade_search'] += 1
        return {'p': [], 'total': 0}, 0
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


# ---------- what happened ----------
def report(todo, planned, done, failed, why):
    """The last thing a run prints, in plain words: what it checked of each kind, what it left, and why."""
    print('what this run checked:')
    slow = 0
    for kind in sorted(KINDS, key=lambda k: -len(todo[k])):
        planned_n, got, waiting = planned.get(kind, 0), done.get(kind, 0), len(todo[kind])
        every = waiting / got if got else 0
        slow = max(slow, every)
        print('  %-17s %3d of %-3d planned, %2d skipped   %4d waiting, %s' % (
            NAMES[kind], got, planned_n, planned_n - got, waiting,
            'a full pass every %.0f h at this rate' % every if got else 'no pass at all at this rate'))
    if why:
        print('  skipped because ' + why)
        print('  nothing was made up for them: the next run starts with each kind\'s oldest, where this stopped')
    elif failed:
        print('  the skipped ones failed on the way out; the next run comes back to them')
    else:
        print('  nothing skipped: every kind got its whole share')
    print('  at this rate a full pass takes %.0f h, %s' % (slow, 'inside the %d h it should' % CYCLE if slow
          and slow <= CYCLE else 'longer than the %d h it should, and every price on the site shows its own age' % CYCLE))
    print('  currency prices are not in this budget: they come from the Currency Exchange feed, hourly')


# ---------- the run's own account of itself ----------
FAIL_SHARE = 0.25              # more than this share of a run's checks failing is a data fault
FAIL_RUNS = 3                  # and so is the same check failing this many runs running
FAULT = 'Trade price checks'   # the section name on the data-fault issue (tools/lastgood.py ticket)


def cause(e):
    """Why a check failed, in a few words the dashboard can show."""
    if isinstance(e, urllib.error.HTTPError):
        return 'HTTP %d' % e.code
    if isinstance(e, (urllib.error.URLError, TimeoutError, OSError)):
        return 'no answer'
    return type(e).__name__


class Tally:
    """What this run tried, what came back and why the rest did not, by kind of key (uniq, base, roll, ...).
    Sent with every batch (worker/prices.js ingest keeps it for the job watch, worker/health.js), so a failing
    check shows on the dashboard within the hour instead of only in this log. A check the trade site turned
    away (rate limited) counts as failed; one that found nobody selling came back, with no listings."""

    def __init__(self, planned):
        self.id = os.environ.get('GITHUB_RUN_ID') or str(int(time.time()))
        self.planned = planned
        self.tried = self.ok = self.failed = self.empty = self.limited = 0
        self.why, self.kinds, self.new, self.streak = {}, {}, [], {}

    def kind(self, key):
        self.tried += 1
        k = self.kinds.setdefault(key.split(':', 1)[0], {'tried': 0, 'ok': 0, 'failed': 0, 'empty': 0})
        k['tried'] += 1
        return k

    def good(self, key, res):
        k = self.kind(key)
        self.ok += 1
        k['ok'] += 1
        if not res.get('p'):
            self.empty += 1
            k['empty'] += 1

    def bad(self, key, why, limited=False):
        k = self.kind(key)
        self.failed += 1
        k['failed'] += 1
        self.why[why] = self.why.get(why, 0) + 1
        if limited:
            self.limited += 1
        else:
            self.new.append([key, why])   # the trade site turning the run away is not this item's fault

    def run(self, final=False):
        return {'id': self.id, 'final': final, 'tried': self.tried, 'ok': self.ok, 'failed': self.failed, 'empty': self.empty,
                'limited': self.limited, 'skipped': max(0, self.planned - self.tried), 'why': self.why, 'kinds': self.kinds}


def said_before(f):
    """Whether the open data-fault issue already gives this cause last, so a failing hour does not say the same
    thing on it again (tools/lastgood.py ticket adds to the issue whenever f['said'] differs)."""
    r = lastgood.gh('issue', 'list', '--label', lastgood.LABEL, '--state', 'open', '--limit', '100', '--json', 'title,body,comments')
    if not r or r.returncode != 0:
        return False
    try:
        issues = json.loads(r.stdout or '[]')
    except ValueError:
        return False
    for x in issues:
        if x.get('title') == '%s: %s' % (lastgood.LABEL, f['section']):
            said = [x.get('body') or ''] + [c.get('body') or '' for c in x.get('comments') or []]
            return ('- Likely cause: %s\n' % f['why']) in said[-1]
    return False


def alarm(t, dry):
    """Say it plainly when the checks are failing: more than FAIL_SHARE of this run, or the same check FAIL_RUNS
    runs running (the site keeps that count: worker/prices.js). Then one data-fault issue, opened or added to.
    The prices already on the site stay as they are, each with its own age: nothing is blanked.
    Returns the exit code: 1 on a fault, so the step goes red."""
    share = t.failed / t.tried if t.tried else 0
    stuck = sorted(k for k, n in t.streak.items() if n >= FAIL_RUNS)
    causes = ', '.join('%s %d' % kv for kv in sorted(t.why.items(), key=lambda kv: -kv[1]))
    print('checks this run: %d tried, %d came back (%d with no listings), %d failed%s, %d not reached' % (
        t.tried, t.ok, t.empty, t.failed, ' (' + causes + ')' if causes else '', max(0, t.planned - t.tried)))
    if not ((t.tried >= 4 and share > FAIL_SHARE) or stuck):
        return 0
    print('PRICE CHECKS FAILING: %d of %d checks failed this run (%s).' % (t.failed, t.tried, causes))
    if stuck:
        print('  failing %d runs running: %s' % (FAIL_RUNS, ', '.join(stuck[:20])))
    print('  the prices already on the site stay, each with its own age: nothing was blanked')
    if dry:
        return 0
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes')
    why = 'checks failing (%s)' % ', '.join(sorted(t.why)) + (
        '; failing %d runs running: %s' % (FAIL_RUNS, ', '.join(stuck[:10])) if stuck else '')
    f = {'section': FAULT, 'file': 'trade prices (the site database)', 'url': API, 'was': t.tried, 'now': t.ok,
         'gone': sorted(k for k, v in t.kinds.items() if v['tried'] and not v['ok']), 'why': why, 'good': '',
         'since': now, 'at': now}
    if said_before(f):
        f['said'] = '%d/%s' % (f['now'], f['why'])
    told = lastgood.ticket(f)
    print('  Ticket: %s / %s - %s' % (lastgood.LABEL, FAULT, told or 'not raised here (WI_NO_TICKET)'))
    return 1


def flag(name, n=0):
    """The whole numbers written after --name, at most n of them. None when the flag is not there at all."""
    if name not in sys.argv:
        return None
    out = []
    for x in sys.argv[sys.argv.index(name) + 1:][:n]:
        if not x.lstrip('-').isdigit():
            break
        out.append(int(x))
    return out


def main():
    limit = flag('--dry', 2)              # --dry [searches] [exchange checks]: printed, never sent
    state = sys.argv[sys.argv.index('--state') + 1] if '--state' in sys.argv else None
    cut = (flag('--cut', 1) or [0])[0]    # act as if the trade site cut the run short after this many
    offline = '--offline' in sys.argv     # no trade calls at all: what a run would check, nothing fetched
    dry = limit is not None or bool(state) or bool(cut) or offline
    # the catalogue: on the data server, the one market.py last wrote there
    catalogue = sitedata.latest('market.json') if sitedata.SERVER or offline else http(CATALOGUE)[0]
    league = catalogue['league']
    todo = jobs(catalogue)
    if state:
        with open(state, encoding='utf-8') as f:
            at = json.load(f).get('at', {})
    else:
        at = {} if dry else site('/api/prices/state?league=' + urllib.parse.quote(league)).get('at', {})
    searches, planned = plan(todo, at)
    divine = [kv for kv in todo['cur'] if kv[0].startswith('cur:divine|')]
    others = oldest([kv for kv in todo['cur'] if not kv[0].startswith('cur:divine|')], at, EXCHANGE - 1)
    exchanges = [('cur', key, what) for key, what in (divine + others)] if EXCHANGE else []
    if limit:
        searches = searches[:limit[0]]
        exchanges = exchanges[:limit[1]] if len(limit) > 1 else exchanges
    gap_s, gap_e = SPAN / max(1, len(searches)), SPAN / max(1, len(exchanges))
    print(league, len(searches), 'searches (one every %.0f s),' % gap_s, len(exchanges), 'exchange checks (one every %.0f s)' % gap_e)
    counts = {'trade_search': 0, 'trade_fetch': 0, 'trade_exchange': 0, 'trade_limited': 0, 'trade_error': 0}
    rows, rate, done, tried, failed, why = [], None, {}, 0, 0, None
    tally = Tally(len(searches) + len(exchanges))
    start = time.time()
    lanes = {'s': {'list': searches, 'i': 0, 'gap': gap_s, 'next': start, 'on': True},
             'e': {'list': exchanges, 'i': 0, 'gap': gap_e, 'next': start, 'on': True}}

    def flush(force=False):
        nonlocal rows, counts
        if not rows and not force:
            return
        payload = {'league': league, 'rows': rows, 'load': counts, 'run': tally.run(final=force), 'failedKeys': tally.new}
        if dry:
            print(json.dumps(payload)[:600])
        elif rows or any(counts.values()) or tally.tried:
            got = site('/api/prices/ingest', payload)
            tally.streak.update(got.get('streak') or {})
            print('sent', len(rows), got)
        rows, counts, tally.new = [], {k: 0 for k in counts}, []

    while True:
        live = [(k, l) for k, l in lanes.items() if l['on'] and l['i'] < len(l['list'])]
        if not live:
            break
        k, lane = min(live, key=lambda kl: kl[1]['next'])
        if time.time() < lane['next'] and not dry:
            time.sleep(lane['next'] - time.time())
        kind, key, what = lane['list'][lane['i']]
        lane['i'] += 1
        wait = 0
        try:
            if k == 's':
                tried += 1
                if cut and tried > cut:
                    raise Limited('pretend cut-off after %d searches (--cut)' % cut)
                res, wait = listing_prices(league, what, counts, offline)
            else:
                if key.startswith('cur:divine|'):
                    res, wait = exchange_offers(league, 'divine', ['exalted'], None, counts)
                    units = sorted(u for u, c in res['p'] if c == 'exalted')[:5]
                    rate = statistics.median(units) if units else None
                else:
                    res, wait = exchange_offers(league, what, ['divine', 'exalted'], rate, counts)
            rows.append({'key': key, **res})
            tally.good(key, res)
            done[kind] = done.get(kind, 0) + 1
            if dry:
                print('  %-9s %s' % (kind, key))
        except Limited as e:
            counts['trade_limited'] += 1
            tally.bad(key, 'rate limited', limited=True)
            why = 'the trade site cut this run short after %d checks: %s' % (sum(done.values()), e)
            print('lane', k, 'stopped:', e)
            lane['on'] = False
        except Exception as e:   # one bad check: note it and go on
            counts['trade_error'] += 1
            failed += 1
            tally.bad(key, cause(e))
            print('error', key, e)
        lane['next'] = max(lane['next'] + lane['gap'], time.time() + wait)
        if len(rows) >= BATCH:
            flush()
    flush(force=True)
    print('done in %.0f s' % (time.time() - start))
    report(todo, planned, done, failed, why)
    return alarm(tally, dry)


if __name__ == '__main__':
    sys.exit(main())
