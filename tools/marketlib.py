"""What every market product (tools/market_*.py) shares: the leagues, read once, their hours and their days, and
how a product file is headed and written. tools/market_history.py runs the products; tools/cxlib.py reads the
exchange archive under all of it.

A league is data/leagues.json's, read under its archive name: Early Access (0.1) is Standard and Hardcore up to the
first hour of 0.2; every league after it is its own name and "HC " + its name. Private leagues never.
A league day is 24 hours from the league's first hour with a Divine and Exalted trade: day 1 is its first 24 hours
(Forbidden Rites: from 2026-09-04 23:00 UTC). Leagues open at different hours, so a league day is not a date.
A price here is divines paid over the amount bought, each league in its own orbs, at each hour's own rates (the
Divine Orb's own price is in exalted).
"""
import datetime as dt
import json
import math
import re
from pathlib import Path

import cxlib
import sitedata

ROOT = sitedata.ROOT
SOURCE = 'Source: Currency Exchange (GGG public feed), read every hour since 6 Dec 2024'
FLAG = 'Subject to change'
FLAGS = {FLAG: 'Depends on GGG. May change without notice.'}
DAY, WEEK = 86400, 7 * 86400
MONEY = ('Divine Orb', 'Chaos Orb')      # what the rest is paid in (the Exalted Orb has no price of its own in exalted)


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def sig(x, n=3):
    """A number to n significant figures, as JSON writes it shortest."""
    if x is None or not math.isfinite(x):
        return None
    if x == 0:
        return 0
    return float('%.*g' % (n, x))


def pct(a, b):
    """a over b as a % change, one decimal."""
    return round((a / b - 1) * 100, 1) if a and b else None


def divines(x):
    """'1 divine', '50 divines', '0.5 divines': for a rule's words."""
    return '{:g} divine{}'.format(x, '' if x == 1 else 's')


def when(h):
    return cxlib.iso(h)


def did(name, dids):
    """The card's own address word (data/market.json `did`), else the same rule on the name."""
    return dids.get(name) or re.sub(r'[^a-z0-9]+', '-', name.lower().replace("'", '')).strip('-')


def head(rule, **numbers):
    """What every product file opens with: its source, the flag, the rule in words and the rule's numbers."""
    return {'source': SOURCE, 'flags': FLAGS, 'rule': rule, 'numbers': numbers}


class League:
    """One league as the archive holds it: every hour valued by item name, and its days."""

    def __init__(self, cx, names, v, name, archive, lo=None, hi=None):
        self.v, self.name, self.archive = v, name, archive
        self.hours = {}
        self.left = {'norate': 0, 'unpriced': 0, 'noname': 0}
        self._days = None
        for h, (rate, got, unpriced) in cxlib.league_hours(cx, archive, lo, hi).items():
            if not rate:
                self.left['norate'] += 1
                continue
            self.left['unpriced'] += unpriced
            named = {}
            for i, (ex, amt) in got.items():
                n = names.get(i)
                if not n:
                    self.left['noname'] += 1
                    continue
                if amt > 0:
                    t = named.setdefault(n, [0.0, 0])
                    t[0] += ex
                    t[1] += amt
            self.hours[h] = (rate, named)
        self.first = min(self.hours) if self.hours else None
        self.last = max(self.hours) if self.hours else None

    def day(self, h):
        return (h - self.first) // DAY + 1

    def days(self):
        """{league day: (exalted per divine, {name: [exalted, amount]}, hours read)}, worked out once."""
        if self._days is None:
            out = {}
            for h, (rate, named) in self.hours.items():
                d = out.setdefault(self.day(h), [{}, 0])
                d[1] += 1
                for n, (ex, amt) in named.items():
                    t = d[0].setdefault(n, [0.0, 0])
                    t[0] += ex
                    t[1] += amt
            self._days = {}
            for d, (named, hrs) in out.items():
                dv = named.get('Divine Orb')
                self._days[d] = (dv[0] / dv[1] if dv else None, named, hrs)
        return self._days

    def price(self, d, n):
        """A currency's price on a league day in divines (the Divine Orb's in exalted), or None."""
        v = self.days().get(d)
        x = v[1].get(n) if v and v[0] else None
        if not x or not x[1]:
            return None
        return x[0] / x[1] / (1 if n == 'Divine Orb' else v[0])

    def window(self, lo, hi):
        """(exalted per divine, {name: [exalted, amount, hours traded]}, hours read) over hours lo..hi inclusive."""
        tot, n = {}, 0
        for h in range(lo, hi + 1, 3600):
            v = self.hours.get(h)
            if not v:
                continue
            n += 1
            for name, (ex, amt) in v[1].items():
                t = tot.setdefault(name, [0.0, 0, 0])
                t[0] += ex
                t[1] += amt
                t[2] += 1
        dv = tot.get('Divine Orb')
        return (dv[0] / dv[1] if dv else None), tot, n

    def medians(self, lo, hi):
        """{name: (the middle of its hourly prices in divines, hours traded, divines traded)} over hours lo..hi. One
        odd trade moves an hour, not the window: what a change between two windows is read from."""
        ps, vol = {}, {}
        for h in range(lo, hi + 1, 3600):
            v = self.hours.get(h)
            if not v:
                continue
            rate, named = v
            for n, (ex, amt) in named.items():
                if amt:
                    ps.setdefault(n, []).append(ex / amt / (1 if n == 'Divine Orb' else rate))
                    vol[n] = vol.get(n, 0.0) + ex / rate
        out = {}
        for n, p in ps.items():
            p.sort()
            k = len(p)
            out[n] = ((p[k // 2] if k % 2 else (p[k // 2 - 1] + p[k // 2]) / 2), k, vol[n])
        return out


def leagues(cx, names):
    """Every league data/leagues.json names that the archive holds, oldest first: [(softcore, Hardcore or None)]."""
    rows = [lg for lg in load(ROOT / 'data' / 'leagues.json')['leagues'] if lg.get('start') and lg.get('weeks')]
    rows.sort(key=lambda lg: lg['start'])
    have = load(cx / 'derived' / 'leagues.json')['leagues']
    out = []
    for k, lg in enumerate(rows):
        if lg['v'] == '0.1':   # Early Access: Standard and Hardcore, up to the first hour of the league after it
            nxt = rows[k + 1]['name'] if k + 1 < len(rows) else None
            hi = cxlib.hour_of(have[nxt]['first_hour']) - 3600 if nxt in have else None
            sc, hc = ('Standard', None, hi), ('Hardcore', None, hi)
        else:
            sc, hc = (lg['name'], None, None), ('HC ' + lg['name'], None, None)
        if sc[0] not in have:
            continue
        s = League(cx, names, lg['v'], lg['name'], *sc)
        h = League(cx, names, lg['v'], lg['name'], *hc) if hc[0] in have else None
        if s.hours:
            out.append((s, h))
    return out


def week_of(h):
    """The Monday 00:00 UTC that starts the week an hour is in (1 Jan 1970 was a Thursday)."""
    return (h - 4 * DAY) // (7 * DAY) * (7 * DAY) + 4 * DAY


def iso_week(h):
    y, w, _ = dt.datetime.fromtimestamp(h, dt.timezone.utc).isocalendar()
    return '%d-W%02d' % (y, w)
