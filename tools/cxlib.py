"""The Currency Exchange archive, read one way for every tool that reads it: tools/market_history.py and its
products (tools/market_*.py), and tools/mechanics_league.py (#148), whose hour_values is the one below, moved here
unchanged, so that tool can import it instead of keeping its own copy.

GGG's feed (https://web.poecdn.com/api/currency-exchange/poe2/{hour}) is archived hour by hour in wraeclast-data/cx
(private; WI_CX, default wraeclast-data/cx beside the repo): derived/YYYY-MM/<league>.jsonl.gz, one row per market per
hour, and raw/YYYY-MM/DDTHH-<hour>.json.gz, each hour exactly as GGG sent it. The derived rows of a month are built
once it is complete, so the hours after the last derived hour of a league are read from the raw files here, the same
way tools/exchange.py reads the live feed.

A row is one market (a pair of currencies) in one hour: how much of each side changed hands (volume_traded), and the
range within the hour of how much was on offer (lowest/highest_stock) and at what ratio (lowest/highest_ratio, an
integer pair; "lowest" and "highest" describe the pair as a whole). Ranges, not an order book: never a bid or an ask.

What a thing is worth in an hour, the one method (tools/exchange.py prices the same way, in divines):
  * exalted per divine from that hour's Divine and Exalted market; chaos per divine from that hour's Divine and Chaos
    market, or failing that its Exalted and Chaos market
  * everything bought with Divine, Exalted or Chaos Orbs is valued in exalted at those rates; its price is the exalted
    paid over the amount bought
  * a trade of one of those three orbs for another is money changing hands, not a thing bought: left out, except
    that the Divine Orb's own price is its Divine and Exalted market, and the Chaos Orb's the market its rate came from
  * a trade of two other things for each other has no price in that hour: left out, and counted
  * an hour with no Divine and Exalted trades has no rate: left out, and counted
Nothing is carried over from another hour and nothing is modelled.

Private leagues ("(PLnnnnn)") are never read.
"""
import datetime as dt
import gzip
import json
import os
import pickle
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'cache' / 'cx'
DIV, EX, CHAOS = ('Metadata/Items/Currency/CurrencyModValues', 'Metadata/Items/Currency/CurrencyAddModToRare',
                  'Metadata/Items/Currency/CurrencyRerollRare')
MONEY = (DIV, EX, CHAOS)
PRIVATE = re.compile(r'\(PL\d+\)')
FIELDS = ('volume_traded', 'lowest_stock', 'highest_stock', 'lowest_ratio', 'highest_ratio')


def home(env, *parts):
    """The env var's folder, else wraeclast-data beside the repo or beside any folder above it (a worktree, or the
    pipeline's build/tree), else in the home folder."""
    if os.environ.get(env):
        return Path(os.environ[env])
    for top in list(ROOT.parents) + [Path.home()]:
        if (top / 'wraeclast-data').is_dir():
            return top.joinpath('wraeclast-data', *parts)
    return Path.home().joinpath('wraeclast-data', *parts)


def safe(league):
    """A league's file name in the archive."""
    return re.sub(r'[^A-Za-z0-9._()-]+', '_', league)


def iso(h):
    return dt.datetime.fromtimestamp(h, dt.timezone.utc).strftime('%Y-%m-%dT%H:00Z')


def hour_of(text):
    """'2026-09-05T02:13Z' -> the hour it falls in, as the feed counts hours (seconds since 1970, UTC)."""
    t = dt.datetime.strptime(text[:16], '%Y-%m-%dT%H:%M').replace(tzinfo=dt.timezone.utc)
    return int(t.timestamp()) // 3600 * 3600


def names(tables):
    """{item id: name} off the game's own BaseItemTypes (tools/datpull.mjs output). Ids never leave this module's
    callers: every file a player reads carries the name (#12)."""
    base = json.loads((tables / 'raw' / 'BaseItemTypes.json').read_text(encoding='utf-8'))
    return {b['Id']: b['Name'] for b in base if b.get('Name')}


# ---------- one hour, valued ----------
def hour_prices(rows):
    """One hour's traded rows [(a, b, volume a, volume b)] -> (rate, {item id: [exalted paid, amount bought]},
    unpriced), or (None, {}, 0) where the hour has no rate. rate is exalted per divine."""
    rate = cpd = None
    money = {}
    for a, b, va, vb in rows:
        v = {a: va, b: vb}
        if {a, b} == {DIV, EX}:
            rate = v[EX] / v[DIV]                  # exalted per divine
            money[DIV] = [float(v[EX]), v[DIV]]
        elif {a, b} == {DIV, CHAOS}:
            cpd = v[CHAOS] / v[DIV]                # chaos per divine
            chaos = (v[DIV], v[CHAOS])
    if rate is None:
        return None, {}, 0
    if cpd is None:
        for a, b, va, vb in rows:
            if {a, b} == {EX, CHAOS}:
                v = {a: va, b: vb}
                cpd = v[CHAOS] / v[EX] * rate
                money[CHAOS] = [float(v[EX]), v[CHAOS]]
    elif cpd:
        money[CHAOS] = [chaos[0] * rate, chaos[1]]
    in_ex = {EX: 1.0, DIV: rate}
    if cpd:
        in_ex[CHAOS] = rate / cpd
    got, unpriced = {}, 0
    for a, b, va, vb in rows:
        if a in in_ex and b in in_ex:
            continue                               # money for money: not a thing bought
        if a in in_ex:
            t = got.setdefault(b, [0.0, 0])
            t[0] += va * in_ex[a]
            t[1] += vb
        elif b in in_ex:
            t = got.setdefault(a, [0.0, 0])
            t[0] += vb * in_ex[b]
            t[1] += va
        else:
            unpriced += 1
    # the money itself, off the markets that set the rates: exalted paid for divines, and for chaos
    got.update(money)
    return rate, got, unpriced


def hour_values(rows):
    """One hour's rows -> ({item id: exalted paid for it}, unpriced) or (None, 0) where the hour has no rate. The
    method tools/mechanics_league.py (#148) values a league's trading by, unchanged."""
    rate, got, unpriced = hour_prices(rows)
    if rate is None:
        return None, 0
    return {i: v[0] for i, v in got.items() if i not in MONEY}, unpriced


# ---------- reading the archive ----------
def league_files(cx, league):
    """The derived month files of one league, oldest first."""
    if PRIVATE.search(league):
        return []
    return sorted((cx / 'derived').glob('*/' + safe(league) + '.jsonl.gz'))


def _traded(f):
    """{hour: [(a, b, va, vb)]} for the traded rows of one derived file. Most rows of a quiet market have a zero side,
    so those are skipped before they are parsed."""
    by_hour = {}
    with gzip.open(f, 'rt', encoding='utf-8') as fh:
        for line in fh:
            if '"volume_traded_a":0,' in line or '"volume_traded_b":0,' in line:
                continue
            r = json.loads(line)
            va, vb = r.get('volume_traded_a') or 0, r.get('volume_traded_b') or 0
            if va > 0 and vb > 0:
                by_hour.setdefault(r['hour'], []).append((r['a'], r['b'], va, vb))
    return by_hour


def _cached(f, what, make):
    """make(f), kept in tools/cache/cx until the file changes (a month's derived file is written once it is complete,
    so only the running month is ever read twice)."""
    st = f.stat()
    key = CACHE / ('%s-%s-%s.pickle' % (f.parent.name, f.name.split('.jsonl')[0], what))
    if key.exists():
        try:
            with open(key, 'rb') as fh:
                size, mtime, out = pickle.load(fh)
            if size == st.st_size and mtime == st.st_mtime:
                return out
        except Exception:
            pass
    out = make(f)
    CACHE.mkdir(parents=True, exist_ok=True)
    with open(key, 'wb') as fh:
        pickle.dump((st.st_size, st.st_mtime, out), fh, protocol=pickle.HIGHEST_PROTOCOL)
    return out


def _priced(f):
    out = {}
    for h, rows in _traded(f).items():
        rate, got, unpriced = hour_prices(rows)
        out[h] = (rate, {i: (round(v[0], 6), v[1]) for i, v in got.items()}, unpriced)
    return out


def raw_hours(cx, after, until=None):
    """The raw hour files after hour `after` (and up to `until`), oldest first: [(hour, path)]."""
    out = []
    for d in sorted((cx / 'raw').glob('*')):
        if not d.is_dir():
            continue
        for p in d.glob('*.json.gz'):
            m = re.search(r'-(\d+)\.json\.gz$', p.name)
            if m and '.err' not in p.name:
                h = int(m.group(1))
                if h > after and (until is None or h <= until):
                    out.append((h, p))
    return sorted(out)


def raw_markets(path, league):
    """One raw hour: its markets in one league, as derived rows."""
    d = json.loads(gzip.decompress(path.read_bytes()))
    out = []
    for m in d.get('markets') or []:
        if m.get('league') != league:
            continue
        a, b = m['market_pair']
        r = {'a': a, 'b': b}
        for k in FIELDS:
            v = m.get(k) or {}
            r[k + '_a'], r[k + '_b'] = v.get(a), v.get(b)
        out.append(r)
    return out


def last_derived(cx, league):
    """(the last hour the derived rows hold for a league, and whether the league was still trading when they were
    built: its last hour is within a day of the newest hour any league holds). Off derived/leagues.json."""
    p = cx / 'derived' / 'leagues.json'
    if not p.exists():
        return 0, False
    ls = json.loads(p.read_text(encoding='utf-8'))['leagues']
    if league not in ls:
        return 0, False
    last = hour_of(ls[league]['last_hour'])
    newest = max(hour_of(v['last_hour']) for v in ls.values())
    return last, last >= newest - 86400


def league_hours(cx, league, lo=None, hi=None, tail=True):
    """{hour: (rate, {item id: (exalted paid, amount bought)}, unpriced)} for one league, hours lo..hi inclusive. The
    derived months first, then (tail) the raw hours after the last derived hour, so a league still running is read to
    the newest hour the archive holds. Private leagues read as nothing."""
    out = {}
    if PRIVATE.search(league):
        return out
    for f in league_files(cx, league):
        ym = f.parent.name
        start = int(dt.datetime.strptime(ym + '-01', '%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp())
        if hi is not None and start > hi:
            continue
        if lo is not None and start + 32 * 86400 < lo:
            continue
        for h, v in _cached(f, 'priced', _priced).items():
            if (lo is None or h >= lo) and (hi is None or h <= hi):
                out[h] = v
    last, running = last_derived(cx, league)
    if tail and running:
        for h, p in raw_hours(cx, max([last] + list(out)), hi):
            rows = [(r['a'], r['b'], r['volume_traded_a'] or 0, r['volume_traded_b'] or 0) for r in raw_markets(p, league)]
            rows = [r for r in rows if r[2] > 0 and r[3] > 0]
            if not rows:
                continue
            rate, got, unpriced = hour_prices(rows)
            if lo is None or h >= lo:
                out[h] = (rate, {i: (round(v[0], 6), v[1]) for i, v in got.items()}, unpriced)
    return out


def league_rows(cx, league, lo, hi):
    """Every row (traded or not) of one league for hours lo..hi inclusive, as dicts: for the stock and ratio ranges,
    which only the last day or so is ever read for."""
    out = []
    if PRIVATE.search(league):
        return out
    last, running = last_derived(cx, league)
    for f in league_files(cx, league):
        ym = f.parent.name
        start = int(dt.datetime.strptime(ym + '-01', '%Y-%m-%d').replace(tzinfo=dt.timezone.utc).timestamp())
        if start > hi or start + 32 * 86400 < lo:
            continue
        with gzip.open(f, 'rt', encoding='utf-8') as fh:
            for line in fh:
                r = json.loads(line)
                if lo <= r['hour'] <= hi:
                    out.append(r)
    for h, p in (raw_hours(cx, last, hi) if running else []):
        if h >= lo:
            for r in raw_markets(p, league):
                r['hour'] = h
                out.append(r)
    return out
