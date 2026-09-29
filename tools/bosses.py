"""Build data/bosses.json: every endgame and pinnacle boss, what it drops and what it costs to fight; and
data/dropsfrom.json: every unique, and where it drops.

Drop pools live on GGG's servers, not in the game files (the game-file survey on issue #83), so no file says
what drops where. Every drop list here is a community source, named on the row it gave.

Six sources, joined on nothing but names a player can read:
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
    a 429. This is a manual pull, never a scheduled scrape. The wiki turns away cloud addresses: when it does
    not answer, the rates are the committed copy's, and the run says so.
  - Maxroll's boss loot table (https://maxroll.gg/poe2/resources/boss-loot-table-cheat-sheet), for what each
    pinnacle and Expedition boss drops and the word Maxroll puts on how often ("Common", "Very Rare"). That
    word is theirs and stays theirs: it is kept beside the item as Maxroll's, never turned into a number.
    Credit "Maxroll".
  - poe2db (https://poe2db.tw/us/), for the drop list on a boss's own page, and the "Dropped by" or "Drop
    disabled" line on each unique's own page. Pages are kept a day in tools/cache/poe2db/, shared with
    tools/uniqueitems.py, and asked for one at a time with a pause between. Credit "poe2db".

A unique's own drop level is also held on the server. What the files do give is the drop level of its base, so
a unique no boss claims and poe2db puts no limit on "drops anywhere, from area level N" with N its base's drop
level (the official export's base_items), marked Estimate.

The two drop feeds are kept side by side rather than merged: every item records which feeds named it, so a
page can say where the list came from, and a pool no boss claims is reported at the end instead of guessed at.

Only endgame counts: areas the game files place in the endgame, plus the two trial bosses whose uniques Path
of Building names. Act bosses have no drop data in any source, so they are left out.

Nothing but player-facing names and numbers is written out: no area ids, no metadata ids, no source paths.

At the end it says which of the items it names nothing can price yet, so the tab never has to invent one.

data/dropsfrom.json is the other way round: unique name -> the bosses and encounters that drop it, each with the
sources that said so, and one line a card can show: "Drops from <bosses>", "Drops anywhere, from area level N",
"No longer obtainable" or "Source not known". Where the sources disagree both are kept, each under its name.
A drop rate is only ever a measured one (the wiki's kill samples), under the label "Source: PoE2 Wiki".

Usage:  python tools/bosses.py                 fetch everything, write data/bosses.json and data/dropsfrom.json
        python tools/bosses.py --cache DIR     keep the wiki pages in DIR and reuse them on the next run
"""
import datetime as dt
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'bosses.json'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'

AREAS = 'https://repoe-fork.github.io/poe2/world_areas.min.json'
BASES = 'https://repoe-fork.github.io/poe2/base_items.min.json'
POB_AREAS = 'https://raw.githubusercontent.com/PathOfBuildingCommunity/PathOfBuilding-PoE2/dev/src/Data/WorldAreas.lua'
POB_UNIQUES = 'https://api.github.com/repos/PathOfBuildingCommunity/PathOfBuilding-PoE2/contents/src/Data/Uniques?ref=dev'
DROPS = 'https://raw.githubusercontent.com/Kvan7/Exiled-Exchange-2/master/renderer/public/data/item-drop.json'
WIKI = 'https://www.poe2wiki.net/w/api.php'
MAXROLL = 'https://maxroll.gg/poe2/resources/boss-loot-table-cheat-sheet'
POE2DB = 'https://poe2db.tw/us/'
POE2DB_CACHE = ROOT / 'tools' / 'cache' / 'poe2db'   # the same cache tools/uniqueitems.py keeps
DAY = 24 * 3600
POE2DB_PAUSE = 0.8                # seconds between poe2db pages that are not in the cache
DROPSFROM = ROOT / 'data' / 'dropsfrom.json'
# the unique files, for when GitHub's listing API turns the run away (it allows 60 unauthenticated calls an
# hour); a file added since is missed until the listing answers again, and the run says it used this list
POB_FILES = ('amulet', 'axe', 'belt', 'body', 'boots', 'bow', 'claw', 'crossbow', 'dagger', 'fishing', 'flail',
             'flask', 'focus', 'gloves', 'helmet', 'incursionlimb', 'jewel', 'mace', 'quiver', 'ring', 'sceptre',
             'shield', 'soulcore', 'spear', 'staff', 'sword', 'talisman', 'tincture', 'traptool', 'wand')
BATCH = 25                        # boss pages asked for in one wiki request; the API allows 50
PAUSE = 3                         # seconds between wiki requests

PYOB = 'Path of Building'
EE2 = 'Exiled Exchange 2'
PWIKI = 'PoE2 Wiki'
MXR = 'Maxroll'
P2DB = 'poe2db'

# the three labels a drop line can carry, word for word, and the one that takes a tooltip
EST = 'Estimate'
CHANGE = 'Subject to change'
CHANGE_TIP = 'Depends on GGG. May change without notice.'

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


def pob_gone(files):
    """The uniques Path of Building marks "Source: No longer obtainable"."""
    out = set()
    for text in files:
        for item in re.findall(r'\[\[(.*?)\]\]', text, re.S):
            lines = [x.strip() for x in item.strip().split('\n') if x.strip()]
            if lines and 'Source: No longer obtainable' in lines:
                out.add(lines[0])
    return out


def pob_files():
    """The text of every unique file. The listing comes from GitHub's API; when that turns the run away, the
    files named in POB_FILES are read straight off the raw host instead, and the run says so."""
    try:
        listing = json.loads(fetch(POB_UNIQUES, tries=2))
        urls = [f['download_url'] for f in listing if f['name'].endswith('.lua')]
    except (RuntimeError, TypeError, KeyError) as e:
        print('  the Path of Building listing did not answer (%s); reading the %d known unique files'
              % (str(e)[:80], len(POB_FILES)), file=sys.stderr)
        raw = POB_AREAS.rsplit('/', 1)[0] + '/Uniques/'
        urls = [raw + n + '.lua' for n in POB_FILES]
    return [fetch(u) for u in urls]


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
            (cache / (re.sub(r'[^\w -]', '_', name) + '.txt')).write_text(out.get(name, ''), encoding='utf-8', newline='\n')
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


# ---------------------------------------------------------------- Maxroll's boss loot table

# the words Maxroll puts after an item for how often it falls; kept as Maxroll wrote them
MX_WORD = re.compile(r'(?:^|\s)[-\u2013]\s*(Always|Guaranteed[^.]*|(?:Very |Extremely )?(?:Common|Uncommon|Rare)'
                     r'(?:\s+to\s+(?:Very |Extremely )?(?:Common|Uncommon|Rare))?)\b')
MX_VARIANT = re.compile(r'^(\d+-Mod) ')      # "2-Mod Megalomaniac" is Megalomaniac, and the 2-Mod is part of the word


def words(fragment):
    """An HTML fragment as the words it shows."""
    t = re.sub(r'<[^>]+>', ' ', fragment or '')
    return re.sub(r'\s+', ' ', html.unescape(t)).strip()


class LootPage(HTMLParser):
    """Maxroll's cheat sheet read as it is laid out: a heading per boss (h2, or h3 for the Expedition bosses),
    and under it lists whose lines are the items. A line inside an item's line is a remark on that item ("Can
    be reforged into ...", "Has a very small chance ..."), not a drop of its own, so it is not read; a line
    inside a line that is not an item (a relic, a fold-out "Omen" panel) is read like any other."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines = []           # (heading, the paragraph above the list, [(what, words)])
        self.head = self.said = None
        self.para, self.last_para = None, ''
        self.lis, self.item = [], None

    @staticmethod
    def is_item(parts):
        return any(what == 'item' for what, _ in parts) or bool(MX_WORD.search(''.join(w for _, w in parts)))

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('h2', 'h3') and (a.get('id') or '').endswith('-header'):
            self.said = []
        elif tag == 'p' and not self.lis:
            self.para = []
        elif tag == 'li':
            self.lis.append([])
        elif tag == 'span' and 'poe2-item' in (a.get('class') or '') and self.lis:
            self.item = []

    def handle_endtag(self, tag):
        if tag in ('h2', 'h3') and self.said is not None:
            self.head, self.said = ' '.join(self.said).strip(), None
        elif tag == 'p' and self.para is not None:
            self.last_para, self.para = ' '.join(self.para), None
        elif tag == 'span' and self.item is not None:
            self.lis[-1].append(('item', ' '.join(self.item).strip()))
            self.item = None
        elif tag == 'li' and self.lis:
            got = self.lis.pop()
            if self.head and (not self.lis or not self.is_item(self.lis[-1])):
                self.lines.append((self.head, self.last_para, got))

    def handle_data(self, data):
        for bucket in (self.said, self.para, self.item):
            if bucket is not None:
                bucket.append(data)
        if self.lis and self.item is None:
            self.lis[-1].append(('text', data))


def maxroll_tables(page):
    """heading -> [{'name', 'said'}]: the lists under each boss heading of Maxroll's cheat sheet, the heading as
    Maxroll writes it. An item is one of their item links, or a plain line that ends in one of their words for
    how often ("Olroth Reliquary Key - Extremely Rare"); any other line (the changelog) is not an item. A relic
    line ("Causes Zarokh to drop ...") gives the uniques it names, not the relic. The chest tip under Zarokh is
    a chest, not the boss, so its list is left out."""
    end = page.find('id="credits-header"')
    reader = LootPage()
    reader.feed(page[:end] if end > 0 else page)
    out = {}
    for head, intro, parts in reader.lines:
        if re.sub(r'\s+', ' ', intro).strip().lower().startswith('tip'):
            continue
        text = re.sub(r'\s+', ' ', ''.join(w for _, w in parts)).strip()
        names = [w for what, w in parts if what == 'item' and w]
        cause = next((n for n, (what, w) in enumerate(parts) if what == 'text' and 'Causes' in w), None)
        word = MX_WORD.search(text)
        items = []
        if cause is not None:
            items = [{'name': w} for what, w in parts[cause:] if what == 'item' and w]
        elif names:
            items = [dict({'name': names[0]}, **({'said': word.group(1)} if word else {}))]
        elif word:
            items = [{'name': text[:word.start()].strip(), 'said': word.group(1)}]
        got = out.setdefault(head, {})
        for it in items:
            v = MX_VARIANT.match(it['name'])
            if v:
                it = dict(it, name=it['name'][v.end():], said=v.group(1) + (': ' + it['said'] if it.get('said') else ''))
            row = got.setdefault(key(it), {'name': it['name']})     # "Sekhema's Resolve" once per ring: one row
            if it.get('said') and it['said'] not in (row.get('said') or '').split('; '):
                row['said'] = '; '.join(x for x in (row.get('said'), it['said']) if x)
    return {head: list(items.values()) for head, items in out.items() if items}


# ---------------------------------------------------------------- poe2db's boss and unique pages

def poe2db(path):
    """One poe2db page, kept a day in tools/cache/poe2db/ so a day's builds ask once; '' when there is none."""
    f = POE2DB_CACHE / (re.sub(r'[^A-Za-z0-9_-]', '_', path) + '.html')
    if f.exists() and time.time() - f.stat().st_mtime < DAY:
        return f.read_text(encoding='utf-8')
    # poe2db wants the ' as it is and the comma encoded; its own list already encodes an "ö"
    url = POE2DB + urllib.parse.quote(urllib.parse.unquote(path), safe="'")
    try:
        body = fetch(url, tries=2)
    except RuntimeError as e:
        if '404' not in str(e):
            raise
        body = ''
    POE2DB_CACHE.mkdir(parents=True, exist_ok=True)
    f.write_text(body, encoding='utf-8', newline='\n')
    time.sleep(POE2DB_PAUSE)
    return body


def poe2db_path(name):
    """The address poe2db gives a boss or a unique it does not list: "Akthi, the Final Sting" ->
    "Akthi,_the_Final_Sting" (poe2db() encodes the comma)."""
    return name.replace(' ', '_')


def poe2db_boss_drops(page):
    """The items under "Drops" in the community section of a poe2db boss page: [{'name', 'said'?}], [] when it
    has none. A line is its first item; what the line adds in brackets ("Difficulty 4", "can drop Raven-Touched")
    is kept as poe2db's word on it, unless it names another unique (the unique an ore is reforged into, which
    the boss does not drop). A line "relic -> unique" is the unique, dropped with that relic in the trial."""
    m = re.search(r'id="markContent">(.*?)</div>', page, re.S)
    sec = re.search(r'<h2 id="drops">.*?</h2>(.*?)(?:<h[12] |$)', m.group(1), re.S) if m else None
    out = []
    for li in re.findall(r'<li>(.*?)</li>', sec.group(1), re.S) if sec else []:
        links = re.findall(r'<a[^>]*>(.*?)</a>', li, re.S)
        if not links:
            continue
        if '\u2192' in li:
            out.append({'name': words(links[-1]), 'said': 'with ' + words(links[0])})
            continue
        rest = li[li.find('</a>') + 4:]
        said = words(rest).strip('() ')
        item = {'name': words(links[0])}
        if said and 'UniqueItem' not in rest and 'uniqueitem' not in rest:
            item['said'] = said
        out.append(item)
    return out


def poe2db_uniques(page):
    """name -> address, off poe2db's unique list."""
    return {html.unescape(n).strip(): h for h, n in
            re.findall(r'href="/us/([^"]+)"><span class="uniqueName">(.*?)</span>', page)}


def poe2db_limit(page):
    """The Limit line on a unique's own page: ('by', [bosses]) for "Dropped by", ('off', []) for "Drop
    disabled", ('none', []) when the page carries no limit, and None when there is no page to read."""
    if not page:
        return None
    m = re.search(r'<tr><td>Limit</td><td>(.*?)</td></tr>', page, re.S)
    if not m:
        return ('none', [])
    said = words(m.group(1))
    if 'Dropped by' in said:
        return ('by', [words(a) for a in re.findall(r'<a[^>]*>(.*?)</a>', m.group(1), re.S)] or
                re.findall(r'\u300c(.*?)\u300d', said))
    if 'Drop disabled' in said:
        return ('off', [])
    return ('none', [])


# ---------------------------------------------------------------- joining it together

def key(item):
    """One name for an item across the feeds: Maxroll writes "Olroth Reliquary Key" for "Olroth's Reliquary Key"
    and "Arbiter Reliquary Key" for "The Arbiter's Reliquary Key"."""
    n = re.sub(r'^the ', '', (item['name'] if isinstance(item, dict) else item).strip().lower())
    return re.sub(r'\s+', ' ', n.replace("'s ", ' ').replace("'", ''))


def same(name):
    """One name for a boss across the feeds: Path of Building's unique files drop the leading "The"."""
    return re.sub(r'^the ', '', (name or '').strip().lower())


def aliases(name):
    """Every name a feed may use for one boss: its own, and the title after the comma where that title is a
    "The ..." ("Tangmazu, The Raven Trickster" is the boss the area files call "The Raven Trickster")."""
    n = same(name)
    head, _, tail = n.partition(', ')
    return {n, same(tail)} if tail.startswith('the ') else {n}


def matches(a, b):
    return bool(aliases(a) & aliases(b))


def attach(rows, lists, pool_list, kind_of):
    """Give each boss its drop pool, its access items and the feeds that named each item.

    lists: [(feed, boss name as that feed writes it, [{'name', 'base'?, 'said'?}])], one per boss a feed
    covers. A boss's own lists come first, then any access pool that shares two items with them. Every row
    records the feeds that covered it (checked), so a page can tell "this feed does not name it" from "this
    feed says nothing about this boss". Returns the lists no row claimed: the encounters that are not a boss
    of their own here (Simulacrum, Atziri's Vault)."""
    claimed = set()
    for row in rows:
        named, checked = {}, []
        for n, (feed, boss, items) in enumerate(lists):
            if not matches(boss, row['name']):
                continue
            claimed.add(n)
            if feed not in checked:
                checked.append(feed)
            for item in items:
                got = named.setdefault(key(item), dict(name=item['name'], kind=item.get('kind') or kind_of(item['name']),
                                                       src=[]))
                if item.get('base') and not got.get('base'):
                    got['base'] = item['base']
                if feed not in got['src']:
                    got['src'].append(feed)
                if item.get('said'):
                    got.setdefault('said', {})[feed] = item['said']
        known = set(named) | {key(r['item']) for r in row.get('rates', {}).get('rows', [])}
        access = []
        for pool in pool_list:
            hit = sum(1 for i in pool['items'] if key(i) in known)
            if hit < 2:
                continue
            if EE2 not in checked:
                checked.append(EE2)
            for name in pool['access']:
                if name not in access:
                    access.append(name)
            for item in pool['items']:
                got = named.setdefault(key(item), dict(item, src=[]))
                got['name'] = item['name']      # the game's own full name: "Olroth's Reliquary Key", not Maxroll's short one
                if item.get('base') and not got.get('base'):
                    got['base'] = item['base']
                if EE2 not in got['src']:
                    got['src'].append(EE2)
        if access:
            row['access'] = access
        if named:
            row['drops'] = [{k: it[k] for k in ('name', 'base', 'kind', 'src', 'said') if it.get(k)}
                            for it in sorted(named.values(), key=lambda i: i['name'])]
        if checked:
            row['checked'] = checked
    return [x for n, x in enumerate(lists) if n not in claimed]


def disagreements(rows):
    """Where the feeds that covered one boss name different items: a unique one of them leaves out, or an
    entry item or gem that one of the two feeds listing those (Exiled Exchange 2, Maxroll) leaves out. Both
    stay on the row, each under its own feed; this only says so."""
    out = []
    for row in rows:
        checked = row.get('checked') or []
        for it in row.get('drops') or []:
            could = checked if it.get('kind') == 'unique' else [f for f in checked if f in (EE2, MXR)]
            left = [f for f in could if f not in it['src']]
            if left and len(could) > 1:
                out.append('"%s": %s %s %s; %s %s not.'
                           % (row['name'], join(it['src']), 'names' if len(it['src']) == 1 else 'name',
                              it['name'], join(left), 'does' if len(left) == 1 else 'do'))
    return out


# ---------------------------------------------------------------- where each unique drops

def join(names):
    return names[0] if len(names) == 1 else ', '.join(names[:-1]) + ' and ' + names[-1]


def add_cards(found, index):
    """Give every unique a boss drops the card its row opens: `card`, the key of the first card of that name in
    the index's order. A unique on several bases is a card per base, and the page holds only the cards it shows,
    so the boss card's "Drops" list cannot look the name up itself (assets/edges.js)."""
    first = {}
    for it in index:
        if it.get('k') == 'u':
            first.setdefault(it['n'], 'u:' + it['id'])
    for n, e in found.items():
        if e.get('from') and n in first:
            e['card'] = first[n]
    return found


def drops_from(rows, extra, uniques, levels, limits, gone):
    """unique name -> where it drops, for data/dropsfrom.json.

    rows     the boss rows, with their drops attached
    extra    the lists no boss row claimed: (feed, encounter, items)
    uniques  every unique the index holds: name -> [bases]
    levels   base name -> the level it starts dropping at (the official export)
    limits   unique name -> poe2db's Limit line (poe2db_limit())
    gone     the uniques Path of Building marks no longer obtainable

    One status per unique, first that holds: 'boss' (a feed names a boss or encounter), 'gone', 'off'
    (poe2db: drop disabled), 'anywhere' (poe2db puts no limit on it and its base's drop level is known),
    'unknown'. A poe2db "Dropped by" is a feed naming a boss like any other."""
    low = {n.lower(): n for n in uniques}
    out = {n: {'from': []} for n in sorted(uniques)}

    def claim(unique, where, feeds, said=None):
        name = low.get(unique.strip().lower())
        if not name:
            return
        got = next((f for f in out[name]['from'] if matches(f['n'], where)), None)
        if got is None:
            got = {'n': where, 'src': []}
            out[name]['from'].append(got)
        for feed in feeds:
            if feed not in got['src']:
                got['src'].append(feed)
        for feed, word in (said or {}).items():
            got.setdefault('said', {})[feed] = word

    for row in rows:
        for it in row.get('drops') or []:
            claim(it['name'], row['name'], it['src'], it.get('said'))
        rates = row.get('rates') or {}
        for r in rates.get('rows', []):
            name = low.get(r['item'].strip().lower())
            if not name:
                continue
            claim(name, row['name'], [rates.get('src', PWIKI)])
            got = next(f for f in out[name]['from'] if matches(f['n'], row['name']))
            rate = {k: r[k] for k in ('rate', 'mode', 'group', 'sample') if r.get(k) is not None}
            rate['src'] = rates.get('src', PWIKI)
            if rates.get('patch'):
                rate['patch'] = rates['patch']
            got.setdefault('rates', []).append(rate)
    for feed, where, items in extra:
        for it in items:
            claim(it['name'], where, [feed], {feed: it['said']} if it.get('said') else None)

    notes = []
    for name, e in out.items():
        limit = limits.get(name)
        lv = [levels[b] for b in uniques[name] if levels.get(b)]
        feeds = []
        if e['from']:
            e['st'] = 'boss'
            e['line'] = 'Drops from ' + join([f['n'] for f in e['from']])
            feeds = [x for f in e['from'] for x in f['src']]
            if limit and limit[0] == 'none':
                said = list(dict.fromkeys(feeds))
                notes.append('%s: %s %s %s; poe2db\'s page for it names no boss.'
                             % (name, join(said), 'names' if len(said) == 1 else 'name', join([f['n'] for f in e['from']])))
        elif name in gone:
            e['st'], e['line'] = 'gone', 'No longer obtainable'
            feeds = [PYOB]
        elif limit and limit[0] == 'off':
            e['st'], e['line'] = 'off', 'Does not drop'
            feeds = [P2DB]
        elif limit and limit[0] == 'none' and lv:
            e['st'], e['lv'] = 'anywhere', min(lv)
            e['line'] = 'Drops anywhere, from area level %d' % e['lv']
            feeds = [P2DB]
        else:
            e['st'], e['line'] = 'unknown', 'Source not known'
        if name in gone and e['st'] != 'gone':
            notes.append('%s: Path of Building marks it no longer obtainable; %s says otherwise.'
                         % (name, ' and '.join(dict.fromkeys(feeds))))
        labels = [EST] if e['st'] == 'anywhere' else []
        if e['st'] in ('boss', 'off', 'anywhere'):
            labels.append(CHANGE)   # a drop pool is the server's, and the server changes without a patch note
        labels += ['Source: ' + f for f in dict.fromkeys(feeds)]
        if any(f.get('rates') for f in e['from']) and 'Source: ' + PWIKI not in labels:
            labels.append('Source: ' + PWIKI)
        if labels:
            e['labels'] = labels
        if not e['from']:
            del e['from']
    return out, notes


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
    # a source that came back thin is a fault, not a smaller file: lastgood.guarded() below keeps the
    # committed bosses.json, says why and raises a ticket for it
    if len(named) < 100 or len(areas) < 100:
        raise lastgood.Stale('the area sources came back too small: %d areas, %d with boss names'
                             % (len(areas), len(named)))

    files = pob_files()
    sources = pob_sources(files)
    gone = pob_gone(files)
    if not sources:
        raise lastgood.Stale('no unique carried a source line; the Path of Building files may have moved')

    pool_list = pools(json.loads(fetch(DROPS)))
    if not pool_list:
        raise lastgood.Stale('no access pool in the Exiled Exchange 2 file; its shape may have changed')

    tables = maxroll_tables(fetch(MAXROLL))
    if len(tables) < 8:
        raise lastgood.Stale('Maxroll\'s loot table gave %d boss lists; the page may have changed' % len(tables))

    index = json.loads((ROOT / 'data' / 'index.json').read_text(encoding='utf-8'))['items']
    uniques = {}
    for it in index:
        if it.get('k') == 'u':
            uniques.setdefault(it['n'], [])
            base = (it.get('s') or '').split(' \u00b7 ')[0]
            if base and base not in uniques[it['n']]:
                uniques[it['n']].append(base)
    gems = {it['n'].lower() for it in index if it.get('k') == 'g'}
    low = {n.lower() for n in uniques}

    def kind_of(name):
        n = name.strip().lower()
        return 'unique' if n in low else 'gem' if n in gems else 'item'

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

    # The wiki turns cloud addresses away. When it does, the rates are the committed copy's: last good wins
    # for this one feed, and the run says so rather than dropping every measured rate on the floor.
    try:
        pages = wiki_pages([r['name'] for r in rows], cache)
        wiki_down = None
    except RuntimeError as e:
        pages, wiki_down = {}, str(e)
        was = {r['name']: r['rates'] for r in (lastgood.committed('bosses.json', quiet=True) or {}).get('bosses', [])
               if r.get('rates')}
        for row in rows:
            if row['name'] in was:
                row['rates'] = was[row['name']]
    for row in rows:
        rates = wiki_rates(pages[row['name']]) if row['name'] in pages else None
        if rates:
            row['rates'] = rates
    no_page = [r['name'] for r in rows if r['name'] not in pages] if not wiki_down else []

    # poe2db: each boss's own page, then each unique's own page. The unique pages are the slow part the
    # first time (about 460 of them); the day's cache makes the next run quick.
    boss_pages = {r['name']: poe2db_boss_drops(poe2db(poe2db_path(r['name']))) for r in rows}
    where = poe2db_uniques(poe2db('Unique_item'))
    if len(where) < 300:
        raise lastgood.Stale('poe2db\'s unique list gave %d uniques; the page may have changed' % len(where))
    limits = {}
    for n, name in enumerate(sorted(uniques)):
        limits[name] = poe2db_limit(poe2db(where.get(name) or poe2db_path(name)))
        if n % 100 == 99:
            print('  poe2db %d/%d unique pages' % (n + 1, len(uniques)), file=sys.stderr)
    dropped_by = {}
    for name, limit in limits.items():
        for boss in (limit or ('', []))[1]:
            dropped_by.setdefault(boss, []).append({'name': name})

    lists = [(PYOB, boss, [dict(it, kind='unique') for it in got['items']]) for boss, got in sources.items()]
    lists += [(MXR, boss, items) for boss, items in tables.items()]
    lists += [(P2DB, boss, items) for boss, items in boss_pages.items() if items]
    lists += [(P2DB, boss, items) for boss, items in dropped_by.items()]
    extra = attach(rows, lists, pool_list, kind_of)

    # A boss no feed names a drop for says so, with the feeds that were read for it: Path of Building's
    # unique sources and Exiled Exchange 2's pools cover every boss, poe2db has a page for each, and the wiki
    # is in the list when it answered.
    read = [PYOB, EE2, P2DB] + ([] if wiki_down else [PWIKI])
    for row in rows:
        if not row.get('drops') and not row.get('rates'):
            row['nodrops'] = {'said': 'No special drops', 'src': read}

    notes = []
    for feed, boss, items in extra:
        notes.append('%s lists %d %s from "%s"; no endgame area names that boss.'
                     % (feed, len(items), 'drop' if len(items) == 1 else 'drops', boss))
    claimed = {a for r in rows for a in r.get('access', [])}
    for pool in pool_list:
        if not any(a in claimed for a in pool['access']):
            notes.append('No boss claimed the %s pool.' % ' / '.join(pool['access']))
    for row in rows:
        if row.get('rates') and not row.get('drops'):
            notes.append('No drop feed covers "%s"; only the community rates name its drops.' % row['name'])
    notes += disagreements(rows)
    if wiki_down:
        notes.append('%s did not answer (%s); its rates are the last copy\'s.' % (PWIKI, wiki_down[:120]))

    feeds = [
        {'name': PYOB, 'what': 'boss names, uniques a boss drops', 'url': 'https://pathofbuilding.community/'},
        {'name': EE2, 'what': 'drop pools', 'url': 'https://github.com/Kvan7/Exiled-Exchange-2'},
        {'name': MXR, 'what': 'pinnacle and Expedition boss drops, and how often in their words', 'url': MAXROLL},
        {'name': P2DB, 'what': 'boss drops, and each unique\'s drop limit', 'url': POE2DB},
        {'name': PWIKI, 'what': 'drop rates, community samples',
         'url': 'https://www.poe2wiki.net/', 'licence': 'CC BY-NC-SA'},
    ]
    out = {
        'built': dt.date.today().isoformat(),
        'sources': feeds,
        'labels': {CHANGE: CHANGE_TIP},
        'bosses': rows,
        'notes': notes,
    }

    # the base each unique sits on starts dropping at a level the official export states
    levels = {}
    for mid, b in json.loads(fetch(BASES)).items():
        if b.get('drop_level') and b.get('name') and 'Unique' not in mid:
            levels[b['name']] = min(b['drop_level'], levels.get(b['name'], b['drop_level']))
    found, unique_notes = drops_from(rows, extra, uniques, levels, limits, gone)
    add_cards(found, index)
    count = {}
    for e in found.values():
        count[e['st']] = count.get(e['st'], 0) + 1
    dropsfrom = {
        'built': out['built'],
        'sources': feeds,
        'labels': {CHANGE: CHANGE_TIP},
        'count': count,
        'uniques': found,
        'notes': unique_notes,
    }

    # Nothing goes out half built: a feed that came back thin is a failure, not a smaller file.
    # Last good wins (tools/lastgood.py) keeps the committed file, says so, and raises a ticket.
    pools_on = sum(1 for r in rows if r.get('drops'))
    rates_on = sum(1 for r in rows if r.get('rates'))

    def fresh():
        if pools_on < 5 or rates_on < 5:
            raise lastgood.Stale('only %d bosses came back with a drop pool and %d with rates'
                                 % (pools_on, rates_on))
        return out

    def fresh_from():
        if count.get('boss', 0) < 50 or count.get('unknown', 0) > len(found) / 2:
            raise lastgood.Stale('only %d uniques came back with a boss, and %d with no source at all'
                                 % (count.get('boss', 0), count.get('unknown', 0)))
        return dropsfrom

    if lastgood.pull('Bosses', fresh, file='bosses.json', url=AREAS, at='bosses', floor=80) is not None:
        body = ',\n'.join(json.dumps(r, ensure_ascii=False, separators=(',', ':')) for r in rows)
        head = json.dumps({k: v for k, v in out.items() if k != 'bosses'}, ensure_ascii=False, separators=(',', ':'))
        lastgood.save(OUT, head[:-1] + ',"bosses":[\n' + body + '\n]}\n')
        print('%d bosses, %d with drops, %d with community rates, %d saying no special drops, %d pinnacle -> %s '
              '(%.0f KB)' % (len(rows), pools_on, rates_on, sum(1 for r in rows if r.get('nodrops')),
                             sum(1 for r in rows if r['pinnacle']), OUT.relative_to(ROOT).as_posix(),
                             OUT.stat().st_size / 1024))
    if lastgood.pull('Drops from', fresh_from, file='dropsfrom.json', url=MAXROLL, at='uniques', floor=400) is not None:
        body = ',\n'.join(json.dumps(k, ensure_ascii=False) + ':' + json.dumps(v, ensure_ascii=False, separators=(',', ':'))
                          for k, v in found.items())
        head = json.dumps({k: v for k, v in dropsfrom.items() if k != 'uniques'}, ensure_ascii=False,
                          separators=(',', ':'))
        lastgood.save(DROPSFROM, head[:-1] + ',"uniques":{\n' + body + '\n}}\n')
        print('%d uniques -> %s: %s' % (len(found), DROPSFROM.relative_to(ROOT).as_posix(),
                                        ', '.join('%d %s' % (v, k) for k, v in sorted(count.items()))))
    for n in notes + unique_notes:
        print('  note: ' + n)
    if no_page:
        print('  no wiki page, so no rates: ' + ', '.join(no_page))
    gaps, quiet = price_gaps(rows)
    if quiet:
        print('  nothing listed when last looked at, so no price: ' + ', '.join(quiet))
    if gaps:
        print('  nothing prices these yet: ' + ', '.join(gaps) + '; write a search for them in data/bossqueries.json')
    return lastgood.report()


if __name__ == '__main__':
    # a fetch that gave up raises RuntimeError; guarded() makes that the same fault as any other
    sys.exit(lastgood.guarded(main, {'Bosses': 'bosses.json', 'Drops from': 'dropsfrom.json'}, url=AREAS))
