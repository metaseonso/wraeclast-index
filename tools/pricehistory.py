"""Keep a copy of every price the site shows, once a day, for the whole league and every league after it.

The site's price files hold 45 days, and a new league overwrites them; D1 keeps one line per thing per league
(worker/prices.js price_leagues). This keeps the prices themselves, as the site showed them that day, in the
private data repo, outside this repo's history: one compressed file a day.

What is copied, from the live site (the same files the pages read):
  /data/market.json?part=now   every item with a price: currency from the in-game Currency Exchange, uniques and
                               base items from trade site listings. Key as the market keys it ("c:Divine Orb",
                               "u:<name>", "b:<base>"), the Exchange's busiest markets (pair:<a>|<b>, how many
                               b one a buys) and its exalted-per-divine rate (rate:exalted)
  /data/rollprices.json        each trade slider step: roll:<modifier>@<value>
  /data/farmprices.json        rolled tablets and waystones: farm:<key>
  /data/bossprices.json        boss entry items the other files do not already carry: boss:<name>
Each row is one price exactly as the site had it: key, value, unit, source (cx: the Currency Exchange; trade:
trade site listings), the time it was checked, and the Exchange volume or the listing count behind it. A thing
the site shows with no price has no row. Nothing is worked out, averaged or carried over.

Where it goes, in the data repo (WI_DATA_REPO, default metaseonso/wraeclast-data):
  prices/daily/YYYY-MM/YYYY-MM-DD.json.gz   the day's rows (about 1,500 rows, about 30 KB)
  prices/days.jsonl                         one line per day: kept (rows, bytes, sha256 of the JSON, when
                                            taken) or missing, with why. A day with no run at all is written
                                            as missing the next time it runs. A missing day is never filled:
                                            a copy taken later that same UTC day replaces its missing line,
                                            a later day never does.
Both in one commit, through GitHub's API (no checkout of a repo that holds the whole exchange archive). It runs
inside the data repo, whose own token writes there: GH_TOKEN (or GITHUB_TOKEN), else gh signed in as the owner.

    python tools/pricehistory.py               take today's copy and keep it
    python tools/pricehistory.py --out DIR     take it and write it to DIR only; nothing is sent
    python tools/pricehistory.py --days        the kept and missing days, from the data repo

Runs twice a day (the first copy of a UTC day stands) in the data repo's .github/workflows/wraeclast-index.yml, which checks this repo out to run it
(the file is kept here at tools/data-repo/). A copy that cannot be taken is a fault (tools/lastgood.py): the day
is written as missing, the run says why, a data-fault issue goes up (in the data repo: GH_REPO), and the run
exits non-zero.
"""
import argparse
import base64
import datetime as dt
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

import lastgood

SITE = (os.environ.get('WI_SITE') or 'https://wraeclastindex.fyi').rstrip('/')
REPO = os.environ.get('WI_DATA_REPO') or 'metaseonso/wraeclast-data'
API = 'https://api.github.com/repos/' + REPO
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
DAYS = 'prices/days.jsonl'
DAILY = 'prices/daily/%s/%s.json.gz'
FLOOR = 100          # priced rows a working site has always shown: the market alone has held over 1,000
SECTION = 'Daily price copy'
COLS = ['key', 'v', 'unit', 'src', 'at', 'vol', 'ls']
SOURCES = {'cx': "the in-game Currency Exchange (GGG's public hourly feed)",
           'trade': 'listings on the official trade site'}
README = """# Daily price copy

Every price Wraeclast Index showed, once a day, kept by `tools/pricehistory.py` in wraeclast-index
(`.github/workflows/wraeclast-index.yml` here).

| Path | What |
|---|---|
| `daily/YYYY-MM/YYYY-MM-DD.json.gz` | One day: `cols` names each row's fields (key, value, unit, source, when it was checked, Exchange volume, listing count). |
| `days.jsonl` | One line per day: kept, or missing and why. A missing day is never filled. |

Sources: `cx` is the in-game Currency Exchange (GGG's public hourly feed), `trade` is listings on the official trade site.
"""


# ---------------------------------------------------------------- the copy
def fetch(path, tries=3):
    """One of the site's price files, parsed."""
    url = SITE + path
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
            return json.loads(body)
        except (urllib.error.URLError, TimeoutError, ValueError):
            if i == tries - 1:
                raise
            time.sleep(10 * (i + 1))


def row(key, v, unit, src, at, vol=None, ls=None):
    return [key, v, unit, src, at, vol, ls]


def priced(v):
    return isinstance(v, (int, float)) and v == v and v >= 0


def copy_of_today(now):
    """The day's copy: every price the site shows right now, one row each."""
    market = fetch('/data/market.json?part=now')
    items = market.get('items') or {}
    if not market.get('league') or not items:
        raise lastgood.Stale('the market file came back with no league or no items')
    unit = market.get('primary') or 'divine'
    times = market.get('times') or {}
    rows, names, unpriced = [], set(), 0
    for key, it in sorted(items.items()):
        if not priced(it.get('v')):
            unpriced += 1
            continue
        rows.append(row(key, it['v'], unit, it.get('src'), it.get('at'), it.get('vol'), it.get('ls')))
        names.add(it.get('n') or key.split(':', 1)[-1])
    for m in market.get('markets') or []:     # the busiest Exchange markets: how many of b one a buys
        if len(m) >= 3 and priced(m[2]):
            rows.append(row('pair:%s|%s' % (m[0], m[1]), m[2], m[1] + ' per ' + m[0], 'cx',
                            times.get('currency') or market.get('updated'), m[3] if len(m) > 3 else None))
    for other, rate in sorted((market.get('rates') or {}).items()):
        if priced(rate):
            rows.append(row('rate:' + other, rate, other + ' per ' + unit, 'cx', times.get('currency') or market.get('updated')))
    files = {'market': {k: market.get(k) for k in ('league', 'updated', 'late', 'times') if market.get(k) is not None}}
    read = []
    try:
        rolls = fetch('/data/rollprices.json')
        for mod, m in sorted((rolls.get('mods') or {}).items()):
            for value, price, total in m.get('pts') or []:
                if priced(price):
                    rows.append(row('roll:%s@%s' % (mod, value), price, unit, 'trade', m.get('at'), None, total))
        files['rollprices'] = {'updated': rolls.get('updated')}
        read.append('rollprices')
    except Exception as e:
        files['rollprices'] = {'missing': lastgood.why_broke(e)}
    try:
        farms = fetch('/data/farmprices.json')
        for key, f in sorted((farms.get('items') or {}).items()):
            if priced(f.get('price')):
                rows.append(row('farm:' + key, f['price'], unit, 'trade', f.get('at'), None, f.get('total')))
        files['farmprices'] = {'updated': farms.get('updated')}
        read.append('farmprices')
    except Exception as e:
        files['farmprices'] = {'missing': lastgood.why_broke(e)}
    try:
        boss = fetch('/data/bossprices.json')
        for name, b in sorted((boss.get('items') or {}).items()):
            if name in names or not priced(b.get('v')):
                continue            # the market row already holds it
            rows.append(row('boss:' + name, b['v'], boss.get('primary') or unit, b.get('src'), b.get('at'), b.get('vol'), b.get('ls')))
        files['bossprices'] = {'updated': boss.get('updated')}
        read.append('bossprices')
    except Exception as e:
        files['bossprices'] = {'missing': lastgood.why_broke(e)}
    return {'day': now.strftime('%Y-%m-%d'), 'taken': now.strftime('%Y-%m-%dT%H:%MZ'), 'site': SITE,
            'league': market['league'], 'unit': unit, 'sources': SOURCES, 'files': files,
            'unpriced': unpriced, 'cols': COLS, 'rows': rows}


def pack(day):
    """The day as the bytes kept, and the sha256 of its JSON."""
    body = json.dumps(day, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    return gzip.compress(body, compresslevel=9, mtime=0), hashlib.sha256(body).hexdigest()


# ---------------------------------------------------------------- the data repo
def token():
    for name in ('GH_TOKEN', 'GITHUB_TOKEN'):
        t = (os.environ.get(name) or '').strip()
        if t:
            return t
    if shutil.which('gh'):
        r = subprocess.run(['gh', 'auth', 'token'], capture_output=True, text=True)
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    raise SystemExit("no way to write %s: run it in that repo's workflow, or sign gh in" % REPO)


def api(method, path, body=None, tok=None):
    data = json.dumps(body).encode('utf-8') if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        'User-Agent': UA, 'Accept': 'application/vnd.github+json', 'Authorization': 'Bearer ' + tok,
        'X-GitHub-Api-Version': '2022-11-28', **({'Content-Type': 'application/json'} if data else {})})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b'null')


def days_file(tok, ref):
    """prices/days.jsonl at one commit, as a list of rows; empty before the first day."""
    try:
        got = api('GET', '/contents/%s?ref=%s' % (DAYS, ref), tok=tok)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return []
        raise
    text = base64.b64decode(got['content']).decode('utf-8')
    return [json.loads(x) for x in text.splitlines() if x.strip()]


def with_day(lines, entry, today):
    """The day lines with this one in, and every day since the last one that had no run marked missing."""
    by = {x['day']: x for x in lines}
    if by.get(entry['day'], {}).get('ok'):
        return None                                       # already kept today: the first copy stands
    if by:
        d = dt.date.fromisoformat(max(by)) + dt.timedelta(days=1)
        while d < today:
            by.setdefault(d.isoformat(), {'day': d.isoformat(), 'ok': False, 'why': 'no run that day'})
            d += dt.timedelta(days=1)
    by[entry['day']] = entry
    return [by[d] for d in sorted(by)]


def keep(entry, packed=None, tok=None):
    """One commit on the data repo: the day's file (when there is one) and its line in days.jsonl. Retried when
    the archive job moves main in between. Returns what happened, in a few words."""
    today = dt.date.fromisoformat(entry['day'])
    for attempt in range(4):
        head = api('GET', '/git/ref/heads/main', tok=tok)['object']['sha']
        base = api('GET', '/git/commits/' + head, tok=tok)['tree']['sha']
        lines = with_day(days_file(tok, head), entry, today)
        if lines is None:
            return 'already kept for ' + entry['day']
        tree = [{'path': DAYS, 'mode': '100644', 'type': 'blob',
                 'content': ''.join(json.dumps(x, separators=(',', ':')) + '\n' for x in lines)}]
        if packed is not None:
            blob = api('POST', '/git/blobs', {'content': base64.b64encode(packed).decode('ascii'), 'encoding': 'base64'}, tok)
            tree.append({'path': entry['file'], 'mode': '100644', 'type': 'blob', 'sha': blob['sha']})
            if len(lines) == 1:
                tree.append({'path': 'prices/README.md', 'mode': '100644', 'type': 'blob', 'content': README})
        new_tree = api('POST', '/git/trees', {'base_tree': base, 'tree': tree}, tok)['sha']
        what = ('Keep the prices of %s (%d rows)' % (entry['day'], entry['rows']) if entry.get('ok')
                else 'Mark %s missing: %s' % (entry['day'], entry.get('why')))
        commit = api('POST', '/git/commits', {'message': what, 'tree': new_tree, 'parents': [head]}, tok)['sha']
        try:
            api('PATCH', '/git/refs/heads/main', {'sha': commit, 'force': False}, tok)
            return what
        except urllib.error.HTTPError as e:
            if e.code != 422 or attempt == 3:
                raise
            time.sleep(2 ** (attempt + 1))          # main moved: read it again and put the day on top
    return 'not kept'


def show_days(tok):
    lines = days_file(tok, 'main')
    kept = [x for x in lines if x.get('ok')]
    for x in lines[-30:]:
        print('  %s  %s' % (x['day'], '%d rows, %d bytes' % (x['rows'], x['bytes']) if x.get('ok') else 'missing: ' + x.get('why', '')))
    print('%d days kept, %d missing, %.1f MB in all' % (len(kept), len(lines) - len(kept), sum(x['bytes'] for x in kept) / 1e6))
    return 0


# ---------------------------------------------------------------- the run
def main():
    ap = argparse.ArgumentParser(description='A daily copy of every price the site shows.')
    ap.add_argument('--out', help='write the day here and send nothing')
    ap.add_argument('--days', action='store_true', help='the kept and missing days')
    args = ap.parse_args()
    if args.days:
        return show_days(token())
    now = dt.datetime.now(dt.timezone.utc)
    tok = None if args.out else token()          # no way to write is a stop before anything is read
    day = lastgood.pull(SECTION, lambda: copy_of_today(now), url=SITE + '/data/market.json?part=now', at='rows', floor=FLOOR)
    if day is None:
        why = lastgood.FOUND[-1]['why'] if lastgood.FOUND else 'the copy could not be taken'
        entry = {'day': now.strftime('%Y-%m-%d'), 'ok': False, 'why': why, 'at': now.strftime('%Y-%m-%dT%H:%MZ')}
        if tok:
            try:
                print(keep(entry, None, tok))
            except Exception as e:
                print('  could not mark the day missing on %s: %s' % (REPO, e), file=sys.stderr)
        return lastgood.report()
    packed, sha = pack(day)
    entry = {'day': day['day'], 'ok': True, 'rows': len(day['rows']), 'bytes': len(packed), 'sha256': sha,
             'taken': day['taken'], 'league': day['league'], 'file': DAILY % (day['day'][:7], day['day'])}
    missing = [f for f, v in day['files'].items() if 'missing' in v]
    if missing:
        entry['without'] = missing
    print('%s: %d prices (%s league), %d shown with no price, %.0f KB packed%s' % (
        day['day'], len(day['rows']), day['league'], day['unpriced'], len(packed) / 1024,
        '; could not read ' + ', '.join(missing) if missing else ''))
    if args.out:
        out = Path(args.out) / (day['day'] + '.json.gz')
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(packed)
        print('-> %s (nothing sent)' % out)
        return 0
    print(keep(entry, packed, tok))
    for f in missing:     # the day is kept, but it is not every price the site showed: that is loud too
        lastgood.fault('%s: %s' % (SECTION, f), {'was': 0, 'now': 0, 'gone': [], 'why': day['files'][f]['missing']},
                       url=SITE + '/data/%s.json' % f)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, SECTION, url=SITE + '/data/market.json?part=now'))
