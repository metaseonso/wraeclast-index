"""Build data/bosses.json: every endgame and pinnacle boss, what it drops and what it costs to fight.

Four sources, joined on nothing but names a player can read:
  - the official area export (https://repoe-fork.github.io/poe2/world_areas.min.json), for the area a boss
    is fought in, that area's level, and the game's own "pinnacle boss" marking. Game data, no credit line.
  - Path of Building's world area data (PathOfBuilding-PoE2/src/Data/WorldAreas.lua), for the boss display
    names the official export leaves out, and Path of Building's unique item files, for the "Source: Drops
    from unique{...}" line a few uniques carry. Credit "Path of Building".
  - Exiled Exchange 2's item-drop.json (MIT), for what an invite, fragment or key is worth: the pool of items
    the fight behind it can drop. Credit "Exiled Exchange 2".
  - the PoE2 Wiki API, for the community's estimated drop rates and their sample sizes. Nothing in the game
    files states a drop rate, so every rate here is a community sample and carries src "PoE2 Wiki" and the
    patch the sample came from. The wiki's robots.txt disallows /index.php, so only the API is used, and it
    is asked for 25 pages at a time with a pause between, five requests for the lot; a page at a time earns
    a 429. This is a manual pull, never a scheduled scrape.

The two drop feeds are kept side by side rather than merged: every item records which feeds named it, so a
page can say where the list came from, and a pool no boss claims is reported at the end instead of guessed at.

Only endgame counts: areas the game files place in the endgame, plus the two trial bosses whose uniques Path
of Building names. Act bosses have no drop data in any source, so they are left out.

Nothing but player-facing names and numbers is written out: no area ids, no metadata ids, no source paths.

At the end it says which of the items it names nothing can price yet, so the tab never has to invent one.

Usage:  python tools/bosses.py                 fetch everything, write data/bosses.json
        python tools/bosses.py --cache DIR     keep the wiki pages in DIR and reuse them on the next run
"""
import datetime as dt
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'bosses.json'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'

AREAS = 'https://repoe-fork.github.io/poe2/world_areas.min.json'
POB_AREAS = 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/dev/src/Data/WorldAreas.lua'
POB_UNIQUES = 'https://api.github.com/repos/PathOfBuildingCommunity/PathOfBuilding-PoE2/contents/src/Data/Uniques?ref=dev'
DROPS = 'https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/master/renderer/public/data/item-drop.json'
WIKI = 'https://www.poe2wiki.net/w/api.php'
BATCH = 25                        # boss pages asked for in one wiki request; the API allows 50
PAUSE = 3                         # seconds between wiki requests

PYOB = 'Path of Building'
EE2 = 'Exiled Exchange 2'
PWIKI = 'PoE2 Wiki'

ENDGAME_ACT = 10                  # the act the game files file every map and league area under
# a pool the game hands out for a fight, as opposed to the currency and legacy pools in the same file
ACCESS = re.compile(r'\b(Fragment|Splinter|Invitation|Reliquary Key|Fate|Djinn Barya|Inscribed Ultimatum)\b')
DROP_KINDS = {'UNIQUE': 'unique', 'GEM': 'gem', 'ITEM': 'item'}


def fetch(url, tries=4):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read().decode('utf-8')
        except Exception as e:
            if n == tries - 1:
                raise RuntimeError('could not fetch %s: %s' % (url.split('?')[0], e))
            time.sleep(5 * (n + 1))       # a wiki that says "too many requests" means it


# ---------------------------------------------------------------- areas and boss names

def pob_areas(lua):
    """area id -> the boss display names Path of Building lists for it."""
    out = {}
    for aid, body in re.findall(r'worldAreas\["([^"]+)"\] = \{(.*?)\n\}', lua, re.S):
        block = re.search(r'bossVarieties = \{(.*?)\}', body, re.S)
        if block:
            names = [n.strip() for n in re.findall(r'"([^"]+)"', block.group(1))]
            out[aid] = [n for n in names if n]
    return out


def boss_rows(areas, named):
    """One row per boss name the endgame areas hold: name, pinnacle, and every area it is fought in with
    that area's own level. The level stays on its area rather than becoming one number for the boss: the
    same fight runs at 65 on Obscure Island and 80 in the Kalguuran Tomb, and both are game data. An area
    the files carry twice under one name keeps both levels as lo/hi."""
    rows = {}
    for aid, names in named.items():
        area = areas.get(aid) or {}
        if area.get('act') != ENDGAME_ACT or aid.startswith('BossRush'):
            continue
        where, lv = area.get('name'), area.get('area_level') or 0
        for name in names:
            row = rows.setdefault(name, {'name': name, 'areas': [], 'pinnacle': False})
            if where:
                at = next((a for a in row['areas'] if a['name'] == where), None)
                if at is None:
                    at = {'name': where}
                    row['areas'].append(at)
                if lv:
                    at['lo'] = min(lv, at.get('lo', lv))
                    at['hi'] = max(lv, at.get('hi', lv))
            if 'pinnacle_boss' in (area.get('tags') or []):
                row['pinnacle'] = True
    return rows


# ---------------------------------------------------------------- Path of Building's unique sources

def pob_sources(files):
    """boss name -> the uniques Path of Building says drop from it."""
    bosses = {}
    for text in files:
        for item in re.findall(r'\[\[(.*?)\]\]', text, re.S):
            lines = [x.strip() for x in item.strip().split('\n') if x.strip()]
            src = next((x for x in lines if x.startswith('Source: Drops from unique{')), None)
            if not src or len(lines) < 2:
                continue
            boss = re.search(r'unique\{([^}]*)\}', src).group(1).strip()
            # line two is the base item, unless the item varies by patch and puts its bases further down
            base = lines[1] if not re.match(r'\w+:|\{', lines[1]) else None
            bosses.setdefault(boss, {'items': []})['items'].append({'name': lines[0], 'base': base})
    return bosses


# ---------------------------------------------------------------- Exiled Exchange 2's drop pools

def pools(raw):
    """The access pools: [{'access': [names], 'items': [{name, base, kind}]}]."""
    out = []
    for group in raw:
        access = [q.split('::', 1)[-1] for q in group.get('query') or []]
        if not access or not all(ACCESS.search(a) for a in access):
            continue
        items = []
        for entry in group.get('items') or []:
            kind, _, rest = entry.partition('::')
            name, _, base = rest.partition(' // ')
            if not name.strip():
                continue
            item = {'name': name.strip(), 'kind': DROP_KINDS.get(kind, 'item')}
            if base.strip():
                item['base'] = base.strip()
            items.append(item)
        if items:
            out.append({'access': access, 'items': items})
    return out


# ---------------------------------------------------------------- the wiki's community drop rates

REF = re.compile(r'<ref[^>]*/>|<ref.*?</ref>', re.S)
COMMENT = re.compile(r'<!--.*?-->', re.S)
IL = re.compile(r'\{\{il\s*\|\s*(?:page\s*=\s*)?([^|}]+)')
PCT = re.compile(r'(~?<?>?\s?\d+(?:\.\d+)?(?:\s?-\s?\d+(?:\.\d+)?)?\s?%)')
BRACKETED = re.compile(r'^\s*\(\s*(~?<?>?\s?\d+(?:\.\d+)?(?:\s?-\s?\d+(?:\.\d+)?)?\s?%)\s*\)')
VERSION = re.compile(r'\[\[version ([\d.]+[a-z]?)\]\]')
# "Drop rate" on its own is the number's column, not a mode of the fight; "Pre 0.3.0 drop rate" is both
RATE_COL = re.compile(r'\s*\(?\s*(?:estimated\s+)?drop\s+rates?\s*\)?\s*$', re.I)


def plain(text):
    """Wiki markup with the decoration taken off, so what is left is words a player would read."""
    t = COMMENT.sub('', REF.sub('', text or ''))
    t = re.sub(r'\{\{Tooltip\s*\|([^|}]*)\|[^}]*\}\}', r'\1', t)
    t = re.sub(r'\{\{il\s*\|\s*(?:page\s*=\s*)?([^|}]+)[^}]*\}\}', r'\1', t)
    t = re.sub(r'\{\{[^{}]*\}\}', ' ', t)
    t = re.sub(r'\[\[[^\]|]*\|([^\]]*)\]\]', r'\1', t)
    t = re.sub(r'\[\[([^\]]*)\]\]', r'\1', t)
    t = t.replace("'''", '').replace("''", '')
    t = re.sub(r'<br\s*/?>|</?del>|</?sup>', ' ', t)
    return re.sub(r'\s+', ' ', t).strip()


def rate_of(cell):
    """The percentage a table cell or bullet states, or None when it states no number. A cell that puts a
    second figure in brackets ("35.5% (31%)") keeps both, as written: the wiki never says what the bracketed
    one is, so it is not silently thrown away and not silently promoted either."""
    text = plain(cell)
    m = PCT.search(text)
    if not m:
        return None
    rate = re.sub(r'\s+', '', m.group(1))
    also = BRACKETED.match(text[m.end():])
    return rate + ' (' + re.sub(r'\s+', '', also.group(1)) + ')' if also else rate


def mode_of(head):
    """A rate column's heading as a mode of the fight. "Difficulty 3" stays; a bare "Drop rate" is the
    number's own column, so it is no mode at all; a qualified one keeps the qualifier that makes the
    number mean something ("Pre 0.3.0 drop rate" -> "Pre 0.3.0")."""
    return RATE_COL.sub('', head).strip() or None


def cell_text(cell):
    """A table cell without its styling: "rowspan=2 | Guaranteed" is the word, not the styling."""
    head, bar, rest = cell.partition('|')
    return rest if bar and re.match(r'^[^|\[\]{}]*=[^|]*$', head) else cell


def drops_section(text):
    """The Drops section of a boss page, up to the next heading at the same depth or above."""
    m = re.search(r'^(=+)\s*Drops\s*=+\s*$', text, re.M)
    if not m:
        return ''
    rest = text[m.end():]
    nxt = re.search(r'^={1,%d}[^=]' % len(m.group(1)), rest, re.M)
    return rest[:nxt.start()] if nxt else rest


def table_rates(section):
    """Rates from the wikitable layout: a column per difficulty or version, a Sample size row, an item a row."""
    rows, kills = [], {}
    for table in re.findall(r'\{\|.*?\n\|\}', section, re.S):
        modes, group = [], None
        for chunk in re.split(r'\n\|-+', table):
            if re.search(r'(?:^|\n)!', chunk):         # a header row: the columns, or a side label
                heads = [h for h in (plain(cell_text(x)) for x in re.split(r'\n!|!!', chunk)) if h]
                if len(heads) > 1 and not modes:
                    heads = heads[1:] if heads[0].lower() in ('', 'item') else heads
                    modes = [mode_of(h) for h in heads]
                elif len(heads) == 1 and re.match(r'^(Guaranteed|Additional)', heads[0], re.I):
                    group = heads[0]
                continue
            cells = [cell_text(c) for c in re.split(r'\n\|(?!\})|\|\|', chunk)]
            cells = [c for c in cells if not re.match(r'^\s*\+', c)]
            while cells and not cells[0].strip():
                cells.pop(0)
            label = plain(cells[0]) if cells else ''
            if label.lower().startswith('sample size'):
                nums = [int(m.group()) for m in (re.search(r'\d+', plain(c)) for c in cells[1:]) if m]
                for mode, n in zip(modes[-len(nums):] or [None], nums):
                    kills[mode] = n
                continue
            if label and not IL.search(cells[0]):     # the "Guaranteed" / "Additional drops" side label
                group = label if re.match(r'^(Guaranteed|Additional)', label, re.I) else group
                cells.pop(0)
            item = next((c for c in cells if IL.search(c)), None)
            if item is None:
                continue
            names = [plain(n) for n in IL.findall(item)]
            values = cells[cells.index(item) + 1:]
            pairs = list(zip(modes[-len(values):], values)) if modes else [(None, values[0] if values else '')]
            for mode, value in pairs:
                rate = rate_of(value)
                for name in names if rate else []:
                    rows.append({'item': name, 'rate': rate, 'mode': mode, 'group': group,
                                 'sample': kills.get(mode)})
    return rows, kills


def heading_of(line):
    """The short label for a bullet list: what the wiki's lead-in sentence says the list is."""
    flat = plain(line).rstrip(':').strip()
    if re.search(r'always drops|one of the following', flat, re.I) and not flat.lower().startswith('if'):
        return 'Guaranteed'
    if re.search(r'can also drop|in addition', flat, re.I) and not flat.lower().startswith('if'):
        return 'Additional'
    words = flat.split()
    return ' '.join(words[:11]) + ('...' if len(words) > 11 else '') if words else None


def bullet_rates(section):
    """Rates from the bullet layout: "always drops one of the following:" then "* {{il|Name}} (35%)"."""
    rows, group = [], None
    for line in section.split('\n'):
        if not line.strip().startswith('*'):
            if plain(line).endswith(':'):
                group = heading_of(line)
            continue
        rate = rate_of(line) if IL.search(line) else None
        if rate:
            rows.append({'item': plain(IL.search(line).group(1)), 'rate': rate, 'mode': None, 'group': group})
    return rows


def wiki_pages(names, cache=None):
    """The wikitext of every boss page that exists, asked for a batch at a time, redirects followed."""
    out, want = {}, []
    for name in names:
        hit = cache / (re.sub(r'[^\w -]', '_', name) + '.txt') if cache else None
        if hit and hit.exists():
            out[name] = hit.read_text(encoding='utf-8')
        else:
            want.append(name)
    for at in range(0, len(want), BATCH):
        batch = want[at:at + BATCH]
        url = WIKI + '?' + urllib.parse.urlencode(
            {'action': 'query', 'prop': 'revisions', 'rvprop': 'content', 'rvslots': 'main',
             'titles': '|'.join(batch), 'redirects': '1', 'format': 'json', 'formatversion': '2'})
        answer = json.loads(fetch(url)).get('query') or {}
        # a title can be normalised and then redirected before it lands on the page that holds the text
        moved = {m['from']: m['to'] for m in answer.get('normalized', []) + answer.get('redirects', [])}
        pages = {p['title']: p for p in answer.get('pages', [])}
        for name in batch:
            title = name
            for _ in range(4):
                title = moved.get(title, title)
            page = pages.get(title) or {}
            if page.get('revisions'):
                out[name] = page['revisions'][0]['slots']['main']['content']
        print('  wiki %d/%d pages' % (min(at + BATCH, len(want)), len(want)), file=sys.stderr)
        if at + BATCH < len(want):
            time.sleep(PAUSE)
    if cache:
        cache.mkdir(parents=True, exist_ok=True)
        for name in want:
            (cache / (re.sub(r'[^\w -]', '_', name) + '.txt')).write_text(out.get(name, ''), encoding='utf-8')
    return out


def wiki_rates(text):
    """The community rate rows off one boss page, or None when the page states no rate."""
    section = drops_section(text)
    if not section:
        return None
    rows, kills = table_rates(section)
    rows += [dict(r, sample=kills.get(None)) for r in bullet_rates(section)]
    seen, kept = set(), []
    for r in rows:
        key = (r['item'], r['rate'], r['mode'], r['group'])
        if key not in seen:
            seen.add(key)
            kept.append({k: v for k, v in r.items() if v is not None})
    if not kept:
        return None
    # the sample size a bullet page states in its own words, "n=295 (234 kills)"
    said = re.search(r'(\d+) kills', section) or re.search(r'\bn\s?=\s?(\d+)', section)
    if said:
        for r in kept:
            r.setdefault('sample', int(said.group(1)))
    versions = VERSION.findall(section)
    patch = '-'.join(dict.fromkeys([versions[0], versions[-1]])) if versions else None
    out = {'src': PWIKI, 'rows': kept}
    if patch:
        out['patch'] = patch
    return out


# ---------------------------------------------------------------- joining it together

def key(item):
    return item['name'].strip().lower()


def same(name):
    """One name for a boss across the feeds: Path of Building's unique files drop the leading "The"."""
    return re.sub(r'^the ', '', (name or '').strip().lower())


def attach(rows, sources, pool_list):
    """Give each boss its drop pool, its access items and the feeds that named each item."""
    for row in rows:
        named = {}
        for name, got in sources.items():
            if same(name) != same(row['name']):
                continue
            for item in got['items']:
                named.setdefault(key(item), dict(item, kind='unique', src=[]))['src'].append(PYOB)
        known = set(named) | {r['item'].strip().lower() for r in row.get('rates', {}).get('rows', [])}
        access = []
        for pool in pool_list:
            hit = sum(1 for i in pool['items'] if key(i) in known)
            if hit < 2:
                continue
            for name in pool['access']:
                if name not in access:
                    access.append(name)
            for item in pool['items']:
                got = named.setdefault(key(item), dict(item, src=[]))
                if item.get('base') and not got.get('base'):
                    got['base'] = item['base']
                if EE2 not in got['src']:
                    got['src'].append(EE2)
        if access:
            row['access'] = access
        if named:
            row['drops'] = [{k: it[k] for k in ('name', 'base', 'kind', 'src') if it.get(k)}
                            for it in sorted(named.values(), key=lambda i: i['name'])]


# ---------------------------------------------------------------- what the site can put a price on
def price_gaps(rows):
    """(nothing prices these, nothing listed when last looked at). A unique is priced by the hourly unique
    checks, which cover every unique in data/index.json; an entry item or a gem is priced by the in-game
    Currency Exchange if the catalogue carries it (data/market.json), or by a trade search if one is written
    for it (data/bossqueries.json). An item in none of those has no real price anywhere, and the tab shows
    nothing for it, so it is worth saying out loud."""
    def read(name):
        try:
            return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))
        except Exception:
            return None

    market, queries, index = read('market.json'), read('bossqueries.json'), read('index.json')
    if not market or not index:
        return [], []
    # matched without case: a wiki rate table carries the odd lower-case word, and the price endpoint
    # looks the same names up the same way
    uniques = {i['n'].lower() for i in index.get('items', []) if i.get('k') == 'u'}
    traded = {k[2:].lower() for k in market.get('items', {}) if k.startswith('c:')}
    searched = {(q.get('item') or '').lower() for q in (queries or {}).get('queries', [])}
    unlisted = {n.lower() for n in ((queries or {}).get('unlisted') or {}).get('items', [])}
    want = {}
    for row in rows:
        for name in row.get('access', []):
            want.setdefault(name, 'entry')
        for item in row.get('drops', []):
            want.setdefault(item['name'], item.get('kind'))
        # the tab draws a price cell for a rate row too, even when no drop feed names the item
        for rate in (row.get('rates') or {}).get('rows', []):
            want.setdefault(rate['item'], None)
    gaps = [n for n, kind in want.items() if n.lower() not in traded and n.lower() not in searched
            and n.lower() not in unlisted and not (kind in ('unique', None) and n.lower() in uniques)]
    return sorted(gaps), sorted(n for n in want if n.lower() in unlisted)


def main():
    args = sys.argv[1:]
    cache = Path(args[args.index('--cache') + 1]) if '--cache' in args else None

    areas = json.loads(fetch(AREAS))
    named = pob_areas(fetch(POB_AREAS))
    if len(named) < 100 or len(areas) < 100:
        sys.exit('the area sources came back too small: %d areas, %d with boss names' % (len(areas), len(named)))

    listing = json.loads(fetch(POB_UNIQUES))
    files = [fetch(f['download_url']) for f in listing if f['name'].endswith('.lua')]
    sources = pob_sources(files)
    if not sources:
        sys.exit('no unique carried a source line; the Path of Building files may have moved')

    pool_list = pools(json.loads(fetch(DROPS)))
    if not pool_list:
        sys.exit('no access pool in the Exiled Exchange 2 file; its shape may have changed')

    rows = boss_rows(areas, named)
    # the trial bosses: the endgame fights the area files still file under their campaign act, kept because
    # Path of Building names the uniques they drop. Their level rides on the trial, so no level is claimed.
    known = {same(n): (n, aid) for aid, names in named.items() for n in names}
    for name in sources:
        full, aid = known.get(same(name), (None, None))
        if not full or any(same(r) == same(name) for r in rows):
            continue
        where = (areas.get(aid) or {}).get('name')
        rows[full] = {'name': full, 'areas': [{'name': where}] if where else [], 'pinnacle': False}
    rows = sorted(rows.values(), key=lambda r: r['name'])

    pages = wiki_pages([r['name'] for r in rows], cache)
    for row in rows:
        rates = wiki_rates(pages[row['name']]) if row['name'] in pages else None
        if rates:
            row['rates'] = rates
    no_page = [r['name'] for r in rows if r['name'] not in pages]

    attach(rows, sources, pool_list)

    notes = []
    placed = {same(r['name']) for r in rows}
    for name, got in sorted(sources.items()):
        if same(name) not in placed:
            notes.append('%s lists %d uniques from "%s"; no endgame area names that boss.'
                         % (PYOB, len(got['items']), name))
    claimed = {a for r in rows for a in r.get('access', [])}
    for pool in pool_list:
        if not any(a in claimed for a in pool['access']):
            notes.append('No boss claimed the %s pool.' % ' / '.join(pool['access']))
    for row in rows:
        drops = row.get('drops') or []
        if row.get('rates') and not drops:
            notes.append('Neither drop feed covers "%s"; only the community rates name its drops.'
                         % row['name'])
        both = all(any(feed in it['src'] for it in drops) for feed in (PYOB, EE2))
        if both and not any(len(it['src']) > 1 for it in drops):
            notes.append('"%s": the two drop feeds name different items and share none.' % row['name'])

    out = {
        'built': dt.date.today().isoformat(),
        'sources': [
            {'name': PYOB, 'what': 'boss names', 'url': 'https://pathofbuilding.community/'},
            {'name': EE2, 'what': 'drop pools', 'url': 'https://github.com/Kvan7/Exiled-Exchange-2'},
            {'name': PWIKI, 'what': 'drop rates, community samples',
             'url': 'https://www.poe2wiki.net/', 'licence': 'CC BY-NC-SA'},
        ],
        'bosses': rows,
        'notes': notes,
    }
    # nothing goes out half built: a feed that came back thin is a failure, not a smaller file
    pools_on = sum(1 for r in rows if r.get('drops'))
    rates_on = sum(1 for r in rows if r.get('rates'))
    if len(rows) < 80 or pools_on < 5 or rates_on < 5:
        sys.exit('too thin to write: %d bosses, %d with a pool, %d with rates' % (len(rows), pools_on, rates_on))
    body = ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows)
    head = json.dumps({k: v for k, v in out.items() if k != 'bosses'}, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(head[:-1] + ',"bosses":[\n' + body + '\n]}\n', encoding='utf-8')

    print('%d bosses, %d with a drop pool, %d with community rates, %d pinnacle -> %s (%.0f KB)'
          % (len(rows), pools_on, rates_on, sum(1 for r in rows if r['pinnacle']),
             OUT.relative_to(ROOT).as_posix(), OUT.stat().st_size / 1024))
    for n in notes:
        print('  note: ' + n)
    if no_page:
        print('  no wiki page, so no rates: ' + ', '.join(no_page))
    gaps, quiet = price_gaps(rows)
    if quiet:
        print('  nothing listed when last looked at, so no price: ' + ', '.join(quiet))
    if gaps:
        print('  nothing prices these yet: ' + ', '.join(gaps) + '; write a search for them in data/bossqueries.json')


if __name__ == '__main__':
    try:
        main()
    except RuntimeError as e:
        sys.exit(str(e))
