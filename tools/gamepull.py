"""One daily pull of the official game data, and a straight gap report.

Every other tool fetches its own copy of the export whenever it runs, so nothing ever says when the game
data moved on, or how much of it we do not ship yet. This is the one place that pulls it and counts.

Source: the RePoE fork's PoE2 export of the game files (https://repoe-fork.github.io/poe2/).
Two rows of the report are measured against the official trade site's lists instead (data/trade.json,
tools/tradedata.py): the export marks hundreds of old and unused items "released", so for bases and
currency the trade site is the only straight answer to "is this in the game today".

Usage:
  python tools/gamepull.py            pull what changed, then print the report
  python tools/gamepull.py --report   the report from the copies already here, nothing fetched
  python tools/gamepull.py --force    download every file again, changed or not

Writes:
  tools/cache/official/    the copies (not in git); pulled.json remembers each file's ETag, date and
                           hash, so a re-run asks for what changed and downloads only that
  data/gamedata.json       which patch the data is from, for the site to show
  tools/dev/gaps.txt       the same report this prints

Changes nothing else. The other tools still fetch their own copies; when one moves over, it is one line:

  from gamepull import official
  bases = official('base_items.min.json')
"""
import argparse
import datetime
import email.utils
import gzip
import hashlib
import json
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'cache' / 'official'
PULLED = CACHE / 'pulled.json'
REPOE = 'https://repoe-fork.github.io/poe2/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
TRIES = 3
PAUSE = 1.0        # at most one request a second
BACKOFF = (3, 10)  # seconds to wait after a failed try

# The files the site is built from today, plus skill_gems and skills (the gap report and tools/grants.py) and the three
# tools/gamelib.py turns into site data.
PULL = [
    'base_items.min.json',          # bases, requirements, properties, implicits, granted skills, art
    'mods.min.json',                # the wording of every mod
    'augments.min.json',            # runes, soul cores, idols
    'item_classes.min.json',        # item class names
    'uniques.min.json',             # unique art and base
    'skill_gems.min.json',          # every gem, and the skills each one grants
    'skills.min.json',              # every skill by name (tools/grants.py turns a "Grants Skill" line into a gem)
    'keywords.min.json',            # the game's own help text (the keyword cards tools/gamelib.py adds)
    'gem_tags.min.json',            # the game's name for each gem tag (tools/gems.py)
    'ascendancies.min.json',        # ascendancy names and each class's part of the wheel (tools/tree.py)
    'flavour.min.json',             # every flavour text, by art id (tools/uniqueitems.py)
    'default_monster_stats.min.json',   # one monster of each level  } data/gamestats.json,
    'characters.min.json',              # what each class starts with } tools/gamelib.py
    'world_areas.min.json',         # every area: level, waypoint, connections, bosses (tools/areas.py, tools/bosses.py)
    'passive_skill_trees/Default.min.json',
    'passive_skill_trees/Atlas.min.json',
    'stat_translations/stat_descriptions.min.json',
    'stat_translations/passive_skill_stat_descriptions.min.json',   # the tree's wording (tools/tree.py)
    'stat_translations/tablet_stat_descriptions.min.json',
    'stat_translations/endgame_map_stat_descriptions.min.json',
    'stat_translations/map_stat_descriptions.min.json',
    'stat_translations/atlas_stat_descriptions.min.json',
    'stat_translations/atlas_variant_stat_descriptions.min.json',
]
# tools/exchange.py and tools/kwuse.py read the full base_items.json and augments.json instead of the
# .min ones. Same data; the full files keep the fields whose value is null. official() takes any name.

DNT = re.compile(r'\[DNT')          # the game files' marker for a thing players never see
TEMPLATE = re.compile(r'\{\d*\}')   # a name the game fills in, e.g. "Spectre: {0}"
_state = None
_home = None   # the listing page, fetched once a run
_seen = {}     # name -> parsed JSON, so one run parses each file once


# ---------------------------------------------------------------- the pull

def state():
    global _state
    if _state is None:
        _state = json.loads(PULLED.read_text(encoding='utf-8')) if PULLED.exists() else {'files': {}}
        _state.setdefault('files', {})
    return _state


def save_state():
    CACHE.mkdir(parents=True, exist_ok=True)
    PULLED.write_text(json.dumps(state(), indent=1, sort_keys=True), encoding='utf-8', newline='\n')


def _open(url, headers):
    """One request, retried. Returns (status, body, headers); 304 comes back with no body."""
    last = None
    for attempt in range(TRIES):
        time.sleep(PAUSE)
        req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip', **headers})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                body = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    body = gzip.decompress(body)
                return r.status, body, r.headers
        except urllib.error.HTTPError as e:
            if e.code == 304:
                return 304, b'', e.headers
            last = '%s answered %d' % (url, e.code)
            if e.code < 500 and e.code != 429:
                break   # our fault, not theirs: another try will not help
        except Exception as e:
            last = '%s: %s' % (url, e)
        if attempt < TRIES - 1:
            print('  %s, trying again' % last, file=sys.stderr)
            time.sleep(BACKOFF[min(attempt, len(BACKOFF) - 1)])
    raise RuntimeError(last or 'could not fetch ' + url)


def _file(name):
    return CACHE / name.replace('/', '__')


def pull(name, force=False):
    """Fetch one export file into the cache if the server says it changed. Returns 'new', 'same' or 'kept'."""
    f, was = _file(name), state()['files'].get(name) or {}
    headers = {}
    if f.exists() and not force:
        if was.get('etag'):
            headers['If-None-Match'] = was['etag']
        elif was.get('modified'):
            headers['If-Modified-Since'] = was['modified']
    try:
        status, body, head = _open(REPOE + name, headers)
    except RuntimeError as e:
        if not f.exists():
            raise SystemExit('cannot pull %s and there is no copy here: %s' % (name, e))
        print('  keeping the copy from %s: %s' % (was.get('pulled', 'before'), e), file=sys.stderr)
        return 'kept'
    now = datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
    if status == 304:
        was['checked'] = now
        state()['files'][name] = was
        return 'same'
    json.loads(body)   # a half-written or error page must never land in the cache
    # GitHub Pages stamps its own ETag per server, so the same file can come back 200 with a new tag.
    # The bytes decide: only a file that really differs counts as changed.
    changed = not f.exists() or f.read_bytes() != body
    if changed:
        CACHE.mkdir(parents=True, exist_ok=True)
        f.write_bytes(body)
    state()['files'][name] = {'etag': head.get('ETag'), 'modified': head.get('Last-Modified'),
                              'bytes': len(body), 'sha': hashlib.sha256(body).hexdigest()[:12],
                              'pulled': now if changed else was.get('pulled', now), 'checked': now,
                              'build': state().get('build') or was.get('build')}
    return 'new' if changed else 'same'


def official(name):
    """One export file, parsed. From the cache; pull it first if it is not here yet, or if it was last checked
    against another client build than the one the last pull saw (a file outside PULL is refreshed by the first
    tool that reads it after a new patch; the pull asks only whether it changed)."""
    if name not in _seen:
        f = _file(name)
        now = state().get('build')
        if not f.exists() or (now and (state()['files'].get(name) or {}).get('build') != now):
            pull(name)
            save_state()
        _seen[name] = json.loads(f.read_bytes())
    return _seen[name]


# ---------------------------------------------------------------- the game's own tables

_dat_dir = None


def dat_dir():
    """tools/cache/dat-<CDN folder>/ (not in git): the live patch folder on GGG's CDN, asked once a run, so every
    table a run reads is from the same client and a hotfix reads them all again. The CDN out of reach: the newest
    folder already read, said on stderr, so a table a hotfix behind is never read in silence."""
    global _dat_dir
    if _dat_dir is None:
        cache = ROOT / 'tools' / 'cache'
        node = shutil.which('node')
        live = ''
        try:
            live = subprocess.run([node, str(ROOT / 'tools' / 'datpull.mjs'), '--find-patch'], cwd=str(ROOT),
                                  capture_output=True, text=True, check=True, timeout=300).stdout.strip()
        except Exception as e:
            print('  could not ask GGG\'s CDN for the live patch folder: %s' % (getattr(e, 'stderr', '') or e),
                  file=sys.stderr)
        if not re.fullmatch(r'\d+(?:\.\d+)+', live):
            have = sorted((p.name[4:] for p in cache.glob('dat-*') if re.fullmatch(r'dat-\d+(?:\.\d+)+', p.name)),
                          key=lambda v: [int(x) for x in v.split('.')])
            if not have:
                raise SystemExit('cannot read the game tables: no live patch folder and none read before')
            live = have[-1]
            print('  reading the game tables of %s, the newest read before' % live, file=sys.stderr)
        _dat_dir = cache / ('dat-' + live)
    return _dat_dir


def dat(table):
    """One of the game's own tables, decoded, for what the export leaves out: a list of rows keyed by
    poe-tool-dev dat-schema's column names, a foreign key as the row number it points at, an enum by its name,
    _i the row's own number.

    Read straight out of the game's bundles on GGG's patch CDN by tools/datpull.mjs --raw, the same reader that
    writes data/game/: no token, no private copy of the tables. Kept in dat_dir(), so a second read is a file."""
    d = dat_dir()
    f = d / (table + '.json')
    if not f.exists():
        node = shutil.which('node')
        if not node:
            raise SystemExit('cannot read the game table %s: there is no Node here to run tools/datpull.mjs' % table)
        r = subprocess.run([node, str(ROOT / 'tools' / 'datpull.mjs'), '--raw', table, '--patch', d.name[4:],
                            '--out', str(d)], cwd=str(ROOT), stdout=sys.stderr, timeout=1800)
        if r.returncode or not f.exists():
            raise SystemExit('cannot read the game table %s from %s (tools/datpull.mjs --raw stopped with %d)'
                             % (table, d.name[4:], r.returncode))
    return json.loads(f.read_bytes())


def home():
    """The export's listing page, fetched once a run: it carries the build number and every file name."""
    global _home
    if _home is None:
        try:
            _home = _open(REPOE, {})[1].decode('utf-8', 'replace')
        except RuntimeError as e:
            print('  could not read the listing page:', e, file=sys.stderr)
            _home = ''
    return _home


def build(refresh=True):
    """The export's own build string, e.g. 4.5.5.2. It is on the listing page."""
    if refresh:
        m = re.search(r'version ([\d.]+)', home())
        if m:
            state()['build'] = m.group(1)
    return state().get('build') or ''


def patch(b=None):
    """The build as players know it: client 4.5.5.2 is public patch 0.5.5."""
    return re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', b if b is not None else state().get('build') or '')


def listing():
    """Every file at the top of the export, from the listing page (used to spot what we never read). The list is
    kept with the pull, so --report, which fetches nothing, still has the one the last pull saw."""
    got = sorted(set(re.findall(r'>([a-z_]+\.min\.json)<', home())))
    if got:
        state()['listing'] = got
    return got or state().get('listing') or []


# The export files no tool reads, and why not: each one is a line in the gap report instead of a silent gap
# (#90). A file that gets a reader drops out of the report by itself; one that turns up with no reader and no
# line here is listed on its own, so it is looked at.
UNREAD = {
    'active_skill_types.min.json': 'the names of the skill types; skills.min.json already names every skill\'s '
                                   'types, and the gem cards draw the game\'s own tag names (gem_tags) instead',
    'audio.min.json': 'the sound each thing plays; the site plays none',
    'cost_types.min.json': 'what each skill cost is paid in and how the game writes it; skills.min.json already '
                           'names the resource on every cost the gem cards show',
    'stat_value_handlers.min.json': 'how a stat description turns a number before it is shown (negate, per minute '
                                    'to per second); the few the tree uses are applied in tools/tree.py (Wording), '
                                    'and every other line comes already worded in the export',
    'stats_by_file.min.json': 'which description file words each stat; the tools read the two files the items and '
                              'the tree are worded from, in the game\'s order, and never need to look one up',
    'tag_details.min.json': 'the display names of the spawn tags; no card shows a spawn tag',
    'tags.min.json': 'the spawn tags items and modifiers roll by; tools/craft.py reads them straight off each base '
                     'and modifier, and they are never shown',
}


# ---------------------------------------------------------------- the gap report

def site(name):
    f = ROOT / 'data' / name
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else None


def real(names):
    """Names a player could ever see: no [DNT] marker, no {0} the game fills in."""
    return {n.strip() for n in names if n and not DNT.search(n) and not TEMPLATE.search(n)}   # a card's name is trimmed


def sample(missing, n=3):
    m = sorted(missing)
    if not m:
        return ''
    return ', '.join(m[:n]) + (' …' if len(m) > n else '')


def rows():
    """One row per kind: (kind, the names the game has, the names we card, is this the whole card kind).
    Each row is matched only against the card kinds that may hold it, so a keyword card never covers for a
    missing keystone. Rows that share a card kind with other rows cannot say what we carry on top."""
    index = site('index.json') or {'items': []}
    ours = {}
    for it in index['items']:
        ours.setdefault(it['k'], set()).add(it['n'])
    out = []

    from sync import DNT_GEMS   # the gems that tool drops for good: not in the game, so not a gap either
    cut = {k for k, (what, _) in DNT_GEMS.items() if what == 'drop'}
    gems = real((v.get('base_item') or {}).get('display_name')
                for k, v in official('skill_gems.min.json').items()
                if (v.get('base_item') or {}).get('release_state') == 'released' and k.rsplit('/', 1)[-1] not in cut)
    out.append(('gems', gems, ours.get('g', set()), True))

    uniq = real(v.get('name') for v in official('uniques.min.json').values() if not v.get('is_alternate_art'))
    out.append(('uniques', uniq, ours.get('u', set()), True))

    tree = official('passive_skill_trees/Default.min.json')['passives'].values()
    p = ours.get('p', set())
    out.append(('notables', real(v.get('name') for v in tree if v.get('is_notable')), p, False))
    out.append(('keystones', real(v.get('name') for v in tree if v.get('is_keystone')), p, False))
    small = real(v.get('name') for v in tree
                 if not v.get('is_notable') and not v.get('is_keystone') and not v.get('is_jewel_socket'))
    out.append(('small passives', small, p, False))

    kw = real(v.get('term') for v in official('keywords.min.json').values() if (v.get('definition') or '').strip())
    # a keystone is its own keyword: its card stands for both (tools/sync.py, index "kwx"); and a rare monster
    # modifier is the keyword its help text makes of the same name (tools/modcards.py)
    out.append(('keywords', kw, ours.get('w', set()) | ours.get('m', set()) | set((index.get('kwx') or {}).values()),
                True))

    trade = (site('trade.json') or {}).get('bases') or {}
    if trade:
        in_game = {x for g in ('Accessories', 'Armour', 'Weapons', 'Jewels', 'Flasks', 'Sanctum', 'Wombgift')
                   for x in trade.get(g, [])}
        out.append(('bases', real(in_game), ours.get('b', set()), True))
        # bulk items are carded three ways: the currency kind, the Atlas tab's keys and items, and the catalogue
        market = (site('market.json') or {}).get('items') or {}
        money = real(set(trade.get('Currency', [])) | set(trade.get('Maps', [])))
        carded = ours.get('c', set()) | ours.get('a', set()) | ours.get('b', set())
        out.append(('currency', money, carded | {v['n'] for v in market.values() if v.get('n')}, False))

    atlas = real(v.get('name') for v in official('passive_skill_trees/Atlas.min.json')['passives'].values())
    out.append(('atlas tree', atlas, ours.get('a', set()), False))

    # areas are not a card kind yet: data/areas.json holds what the Area card will draw (tools/areas.py)
    places = real(v.get('name') for v in official('world_areas.min.json').values() if v.get('name') != 'NULL')
    out.append(('areas', places, {a['n'] for a in (site('areas.json') or {}).get('areas') or []}, True))
    return out


def reasons(kind, missing):
    """Why each name the game has and no card carries is left out: {name: reason}. A name with no reason here is
    a gap nobody has looked at, and the report says so."""
    why = {}
    if kind == 'areas':   # tools/areas.py decides what a player never stands in; its words, one reason each
        import areas
        said = {'hideout': "a hideout: a player's own place, not the world",
                'not a place': "a screen or a heading, not a place (character select, an act's title)",
                'test': "a developers' test area", '[DNT]': 'marked "do not translate": not in the game players see',
                'no name': 'an area with no name'}
        for aid, v in official('world_areas.min.json').items():
            n = (v.get('name') or '').strip()
            if n in missing and n not in why:
                w = areas.why_hidden(aid, v, {})
                if w in said:
                    why[n] = said[w]
    elif kind == 'gems':
        for n in missing:
            if n == 'Coming Soon':
                why[n] = 'a slot the game holds open for a gem that is not in it yet'
            elif n == 'Removed Skill':
                why[n] = 'the stand-in the game shows where a skill was taken out'
    elif kind in ('notables', 'small passives'):
        nodes = {}
        for v in official('passive_skill_trees/Default.min.json')['passives'].values():
            if (v.get('name') or '').strip() in missing:
                nodes.setdefault(v['name'].strip(), []).append(v)
        for n, vs in nodes.items():
            if all(v.get('is_icon_only') for v in vs):
                why[n] = 'an icon-only node (a mastery or a blank plate): no effect to show'
            elif all(v.get('is_ascendancy_starting_node') for v in vs):
                why[n] = 'where an ascendancy starts on its wheel: no effect to show'
            elif all(v.get('is_multiple_choice') for v in vs):
                why[n] = 'a choice notable: no effect of its own, and each option it offers is a card'
            elif all(v.get('skill_points') for v in vs):
                why[n] = 'grants passive points: the tree gives it no line of text'
            elif all(not v.get('stats') and not v.get('ascendancy') for v in vs):
                why[n] = 'a class\'s starting plate on the tree: no effect to show'
            elif all(not v.get('stats') and not v.get('granted_skill') for v in vs):
                why[n] = 'an ascendancy notable with no stat line and no skill: no lines, no card'
    elif kind == 'keywords':
        from gamelib import pick   # the rule the keyword cards are made by (tools/gamelib.py)
        _, _, left = pick(site('index.json') or {'items': []})
        export = official('keywords.min.json')
        for k, r in left.items():
            n = (export[k].get('term') or '').strip()
            if n in missing and r != 'already ours':
                why[n] = {'a placeholder': 'the game\'s own placeholder, "This test case is designed to be overwitten"'}.get(r, r)
    elif kind == 'currency':
        info = site('info.json') or {}
        for n in missing:
            t = (info.get(n) or {}).get('t') or ''
            if 'no longer usable' in t:
                why[n] = 'the game\'s own text says it is no longer usable'
            elif not t:
                why[n] = 'no text anywhere in the game files for it (poe2db shows none either)'
    return why


def notes():
    """The few things a row of numbers does not say."""
    said = []
    index = site('index.json') or {'items': []}   # the missing notables have their reasons above (reasons())

    info = site('info.json') or {}
    if info:
        market = (site('market.json') or {}).get('items') or {}
        cards = {it['n'] for it in index['items']} | {v['n'] for v in market.values() if v.get('n')}
        trade = (site('trade.json') or {}).get('bases') or {}
        money = set(trade.get('Currency', [])) | set(trade.get('Maps', []))
        gap = [n for n in info if n not in cards]
        said.append('%d items have official text in data/info.json and %d of them get no card — but only %d of those '
                    'are on the trade site\'s list today. The rest are old items the export still carries.'
                    % (len(info), len(gap), sum(1 for n in gap if n in money)))

    bases = official('base_items.min.json')
    grants = real(v['name'] for v in bases.values() if v.get('skills_granted') and v.get('release_state') == 'released')
    shown = {it['n'] for it in index['items']
             if it['k'] == 'b' and any('Grants Skill' in x for x in (it.get('pr') or []))}
    carded = {it['n'] for it in index['items'] if it['k'] == 'b'}
    said.append('%d base items grant a skill; we card %d of them and name the skill on %d. The other %d are not on '
                'the trade site\'s list.' % (len(grants), len(grants & carded), len(grants & shown),
                                             len(grants - carded)))

    areas = site('areas.json')
    if areas:
        c = areas.get('counts') or {}
        said.append('%d areas in the game files are %d places in data/areas.json (%d more merged into a place of the '
                    'same name); %d are hidden on purpose (%s). No card kind draws them yet (design/areas.md).'
                    % (c.get('game', 0), c.get('carded', 0), c.get('merged', 0), sum((c.get('hidden') or {}).values()),
                       ', '.join('%d %s' % (n, w) for w, n in (c.get('hidden') or {}).items())))

    jewels = sorted((ROOT / 'data' / 'explore').glob('jewels.*.json'))
    if jewels:
        n = len(json.loads(jewels[0].read_text(encoding='utf-8')).get('rows') or [])
        jw = site('jewels.json') or {}
        said.append('The drill-down page lists %d timeless jewel lines. data/jewels.json (tools/gamelib.py) holds the '
                    'Jewel kind\'s data: %d jewel bases, %d timeless factions and %d conquerors; the card kind itself '
                    'is proposed in design/gems-gaps.md.' % (n, len(jw.get('bases') or []), len(jw.get('timeless') or []),
                                                            sum(len(f.get('conquerors') or []) for f in jw.get('timeless') or [])))

    everything = listing()
    if everything:   # this file names every export file it pulls, so it does not count as a reader
        tools = sorted(ROOT.glob('tools/*.py')) + sorted(ROOT.glob('tools/dev/*.py'))
        src = '\n'.join(f.read_text(encoding='utf-8', errors='replace') for f in tools if f.name != Path(__file__).name)
        # a whole file name, so tags.min.json is not read because gem_tags.min.json is
        named = lambda n: re.search(r'(?<![\w-])' + re.escape(n), src)
        unread = [n for n in everything if not named(n) and not named(n.replace('.min', ''))]
        why = [n for n in unread if n in UNREAD]
        if why:
            said.append('%d of the %d export files no tool reads, each for a reason:' % (len(why), len(everything)))
            said += ['%s: %s.' % (n, UNREAD[n]) for n in why]
        lost = [n for n in unread if n not in UNREAD]
        if lost:
            said.append('No tool here reads these export files at all, and nothing says why: ' + ', '.join(lost) + '.')
    return said


def wrap(text, lead='  · ', width=104):
    """One note over as many lines as it needs, the follow-on lines lined up under the first word."""
    out, line = [], lead
    for word in text.split(' '):
        if len(line) + len(word) > width and line.strip() != lead.strip():
            out.append(line.rstrip())
            line = ' ' * len(lead)
        line += word + ' '
    out.append(line.rstrip())
    return out


def report(pulls=None):
    lines = ['Wraeclast Index · the official game data, and what we ship of it', '']
    dated = [f.get('modified') for f in state()['files'].values() if f.get('modified')]
    when = max((email.utils.parsedate_to_datetime(d) for d in dated), default=None)
    lines.append('  export  patch %s%s' % (patch() or '?', when and ', files dated ' + when.strftime('%d %b %Y') or ''))
    lines.append('  pulled  %s%s' % (datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M UTC'),
                                     pulls and ' · %d files, %d downloaded' % (sum(pulls.values()), pulls.get('new', 0)) or ''))
    index = site('index.json') or {'items': []}
    lines.append('  index   %s cards over %s names' % (f"{len(index['items']):,}",
                                                       f"{len({(i['k'], i['n']) for i in index['items']}):,}"))
    lines += ['', '  Counts are names, not cards: one name can be several cards.', '',
              '  kind             game  carded     gap  missing, a sample']
    why = []
    for kind, game, ours, whole in rows():
        missing, extra = game - ours, ours - game
        tail = sample(missing) or ('+%d we card that the export has no name for' % len(extra) if whole and extra else '-')
        lines.append(('  %-14s %6d  %6d  %6d  %s' % (kind, len(game), len(game & ours), len(missing), tail)).rstrip())
        said = reasons(kind, missing)
        count = {}
        for n in sorted(missing):
            count.setdefault(said.get(n, 'NO REASON YET'), []).append(n)
        for r, names in sorted(count.items(), key=lambda x: (x[0] == 'NO REASON YET', -len(x[1]), x[0])):
            why.append('%s, %d: %s (%s)' % (kind, len(names), r, sample(names, 4)))
    lines += ['', '  Why each gap stays (every name the game has and no card carries has one reason):', '']
    for w in why:
        lines += wrap(w)
    lines += ['',
              '  game: the export, minus the names players never see ([DNT] markers, names the game fills in).',
              '  Bases and currency count the official trade site\'s lists instead (data/trade.json): the export',
              '  still marks hundreds of old and unused items released.', '']
    for n in notes():
        lines += wrap(n)
    return '\n'.join(lines) + '\n'


# ---------------------------------------------------------------- run it

def main():
    ap = argparse.ArgumentParser(description='Pull the official game data and report what we do not ship.')
    ap.add_argument('--report', action='store_true', help='report on the copies already here, fetch nothing')
    ap.add_argument('--force', action='store_true', help='download every file again')
    args = ap.parse_args()

    pulls = None
    if not args.report:
        print('pulling %d files from %s' % (len(PULL), REPOE))
        pulls = {'new': 0, 'same': 0, 'kept': 0}
        for name in PULL:
            how = pull(name, force=args.force)
            pulls[how] += 1
            if how == 'new':
                print('  new  ' + name)
        b = build()
        print('  build %s = patch %s · %d new, %d unchanged, %d kept' %
              (b, patch(b), pulls['new'], pulls['same'], pulls['kept']))
        state()['pulled'] = datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%dT%H:%M:%SZ')
        save_state()
    else:
        if not any(_file(n).exists() for n in PULL):
            raise SystemExit('nothing in %s yet — run without --report first' % CACHE.relative_to(ROOT))
        globals()['_home'] = ''   # --report fetches nothing, so the listing page stays unread

    text = report(pulls)
    print()
    print(text, end='')
    gaps = ROOT / 'tools' / 'dev' / 'gaps.txt'
    gaps.write_text(text, encoding='utf-8', newline='\n')

    # what the site may say: the public patch and the dates, never the internal build
    dated = [f.get('modified') for f in state()['files'].values() if f.get('modified')]
    when = max((email.utils.parsedate_to_datetime(d) for d in dated), default=None)
    stamp = {'patch': patch(), 'dated': when.strftime('%Y-%m-%d') if when else '',
             'pulled': datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d')}

    # Last good wins (tools/lastgood.py). The cache already keeps a file the export would not give; this is
    # what makes that loud. A file kept, or a build number the listing page would not show, means the patch
    # stamp cannot be trusted, so the one already committed stays and a ticket goes up for it.
    kept = (pulls or {}).get('kept', 0)

    def fresh():
        if kept:
            raise lastgood.Stale('the export would not give %d of its %d files' % (kept, len(PULL)))
        return stamp

    if lastgood.pull('Game export', fresh, file='gamedata.json', url=REPOE, at='patch', floor=1) is None:
        return lastgood.report()
    lastgood.save(ROOT / 'data' / 'gamedata.json', json.dumps(stamp, separators=(',', ':')))
    print('\n-> data/gamedata.json, tools/dev/gaps.txt')
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Game export', file='gamedata.json', url=REPOE))
