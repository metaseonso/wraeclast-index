"""The leagues before this one, from poe.ninja, so a card's chart has something behind its own line.

Our own price store starts with Forbidden Rites: every league before it is empty, so every chart draws one
line and says "4 days of prices this league so far". poe.ninja kept those leagues, so this reads what they
have and writes it once, by hand, to data/pastprices.json. From this league on the lines are our own and this
tool is only history.

What poe.ninja has for an ended Path of Exile 2 league is currency, and only currency: their unique pages
answer nothing for a past league. What is taken is the one number that is unambiguous — the value each
currency finished the league at, in divine, the same unit our own prices are in.

Their rows also carry a sparkline. It is not taken: the Divine Orb's own sparkline moves, so whatever those
points are measured against, it is not the divine the value is quoted in, and a line drawn from them would be
a guess wearing real decimals. One real point a league is worth more than seven invented ones.

Every row is marked as theirs (src "ninja"), and the site draws their mark beside any line that came from
here — worker/prices.js merges it, assets/app.js draws it. Their terms are read once and named on the page.

    python tools/ninjapast.py          write data/pastprices.json
    python tools/ninjapast.py --show   print what it would write, and write nothing
"""
import io
import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
OUT = DATA / 'pastprices.json'

NINJA = 'https://poe.ninja/poe2/'
STATE = NINJA + 'api/data/index-state'
OVERVIEW = NINJA + 'api/economy/exchange/current/overview'
SITE = 'poe.ninja'
BACK = 3          # how many leagues back a card's chart draws (worker/prices.js BACK)
UA = {'User-Agent': 'wraeclast-index/1.0 (+https://wraeclastindex.fyi)'}


def fetch(url):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode('utf-8', 'replace'))


def our_leagues():
    """This league and the ones before it, newest first, from the site's own list."""
    f = json.loads((DATA / 'leagues.json').read_text(encoding='utf-8'))
    out = []
    for l in f.get('leagues') or []:
        if l.get('name') and l.get('start'):
            out.append((l['name'], l['start']))
    out.sort(key=lambda x: x[1], reverse=True)
    today = datetime.now(timezone.utc).date().isoformat()
    return [x for x in out if x[1] <= today]


def theirs():
    """Every league poe.ninja will answer for, by name."""
    st = fetch(STATE)
    names = set()
    for key in ('economyLeagues', 'oldEconomyLeagues'):
        for l in st.get(key) or []:
            if l.get('name'):
                names.add(l['name'])
    return names


def league_rows(name):
    """One past league: every currency poe.ninja priced, and what it ended the league at."""
    d = fetch(OVERVIEW + '?' + urllib.parse.urlencode({'league': name, 'type': 'Currency'}))
    names = {}
    for src in ((d.get('core') or {}).get('items') or [], d.get('items') or []):
        for it in src:
            if it.get('id') and it.get('name'):
                names[it['id']] = it['name']
    rows = {}
    for row in d.get('lines') or []:
        n = names.get(row.get('id'))
        v = row.get('primaryValue')
        if not n or not isinstance(v, (int, float)) or v <= 0:
            continue
        rows[n] = {'v': round(v, 6)}
    return rows


def main(show=False):
    ours = our_leagues()
    if not ours:
        print('no league list to work from', file=sys.stderr)
        return 1
    here, past = ours[0][0], ours[1:1 + BACK]
    known = theirs()
    out = {'source': SITE, 'url': NINJA + 'economy', 'read': datetime.now(timezone.utc).isoformat(timespec='seconds'),
           'league': here, 'leagues': []}
    for name, start in past:
        if name not in known:
            print('  %s: poe.ninja does not carry it' % name, file=sys.stderr)
            continue
        rows = league_rows(name)
        print('  %-18s %3d priced at the end of the league' % (name, len(rows)))
        out['leagues'].append({'name': name, 'start': start, 'items': rows})
    if not out['leagues']:
        print('nothing came back', file=sys.stderr)
        return 1
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    if show:
        print(text[:2000])
        return 0
    with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(text)
    print('%s %d KB, %d leagues' % (OUT.relative_to(ROOT), len(text) // 1024, len(out['leagues'])))
    return 0


if __name__ == '__main__':
    sys.exit(main('--show' in sys.argv))
