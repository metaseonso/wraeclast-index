"""One daily pull of the official game data, and an honest gap report.

Every other tool fetches its own copy of the export whenever it runs, so nothing ever says when the game
data moved on, or how much of it we do not ship yet. This is the one place that pulls it and counts.

Source: the RePoE fork's PoE2 export of the game files (https://repoe-fork.github.io/poe2/).
Two rows of the report are measured against the official trade site's lists instead (data/trade.json,
tools/tradedata.py): the export marks hundreds of old and unused items "released", so for bases and
currency the trade site is the only honest answer to "is this in the game today".

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
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CACHE = ROOT / 'tools' / 'cache' / 'official'
PULLED = CACHE / 'pulled.json'
REPOE = 'https://repoe-fork.github.io/poe2/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
TRIES = 3
PAUSE = 1.0        # at most one request a second
BACKOFF = (3, 10)  # seconds to wait after a failed try

# The files the site is built from today, plus the two the gap report counts against (skill_gems and
# keywords: the gems and keyword cards come from the artifact, nothing here reads the export for them).
PULL = [
    'base_items.min.json',          # bases, requirements, properties, implicits, granted skills, art
    'mods.min.json',                # the wording of every mod
    'augments.min.json',            # runes, soul cores, idols
    'item_classes.min.json',        # item class names
    'uniques.min.json',             # unique art and base
    'skill_gems.min.json',          # every gem
    'keywords.min.json',            # the game's own help text
    'passive_skill_trees/Default.min.json',
    'passive_skill_trees/Atlas.min.json',
    'stat_translations/stat_descriptions.min.json',
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
    PULLED.write_text(json.dumps(state(), indent=1, sort_keys=True), encoding='utf-8')


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
                              'pulled': now if changed else was.get('pulled', now), 'checked': now}
    return 'new' if changed else 'same'


def official(name):
    """One export file, parsed. From the cache; pull it first if it is not here yet."""
    if name not in _seen:
        f = _file(name)
        if not f.exists():
            pull(name)
            save_state()
        _seen[name] = json.loads(f.read_bytes())
    return _seen[name]


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
    """Every file at the top of the export, from the listing page (used to spot what we never read)."""
    return sorted(set(re.findall(r'>([a-z_]+\.min\.json)<', home())))


# ---------------------------------------------------------------- the gap report

def site(name):
    f = ROOT / 'data' / name
    return json.loads(f.read_text(encoding='utf-8')) if f.exists() else None


def real(names):
    """Names a player could ever see: no [DNT] marker, no {0} the game fills in."""
    return {n for n in names if n and not DNT.search(n) and not TEMPLATE.search(n)}


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

    gems = real((v.get('base_item') or {}).get('display_name')
                for v in official('skill_gems.min.json').values()
                if (v.get('base_item') or {}).get('release_state') == 'released')
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
    out.append(('keywords', kw, ours.get('w', set()), True))

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
    return out


def notes():
    """The few things a row of numbers does not say."""
    said = []
    tree = official('passive_skill_trees/Default.min.json')['passives'].values()
    index = site('index.json') or {'items': []}
    have = {it['n'] for it in index['items'] if it['k'] == 'p'}
    lost = [v for v in tree if v.get('is_notable') and real([v.get('name')]) and v['name'] not in have]
    if lost:
        grant = sum(1 for v in lost if v.get('granted_skill'))
        said.append('%d of the missing notables are ascendancy notables with no stat lines; %d of those grant a '
                    'skill instead. No lines, no card.' % (len(lost), grant))

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

    jewels = sorted((ROOT / 'data' / 'explore').glob('jewels.*.json'))
    if jewels:
        n = len(json.loads(jewels[0].read_text(encoding='utf-8')).get('rows') or [])
        said.append('The drill-down page lists %d jewels; there is no jewel card kind at all.' % n)

    everything = listing()
    if everything:   # this file names every export file it pulls, so it does not count as a reader
        src = '\n'.join(f.read_text(encoding='utf-8', errors='replace') for f in sorted(ROOT.glob('tools/*.py'))
                        if f.name != Path(__file__).name)
        unread = [n for n in everything if n not in src and n.replace('.min', '') not in src]
        if unread:
            said.append('No tool turns these export files into site data: ' + ', '.join(unread) + '.')
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
    for kind, game, ours, whole in rows():
        missing, extra = game - ours, ours - game
        tail = sample(missing) or ('+%d we card that the export has no name for' % len(extra) if whole and extra else '-')
        lines.append(('  %-14s %6d  %6d  %6d  %s' % (kind, len(game), len(game & ours), len(missing), tail)).rstrip())
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
    (ROOT / 'data' / 'gamedata.json').write_text(json.dumps(stamp, separators=(',', ':')), encoding='utf-8', newline='\n')
    print('\n-> data/gamedata.json, tools/dev/gaps.txt')


if __name__ == '__main__':
    sys.exit(main())
