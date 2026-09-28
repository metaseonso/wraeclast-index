"""One pipeline: every builder in the order the data needs it, built aside and swapped in whole.

    python tools/pipeline.py patch              every stage a game patch needs, in order (patch and daily)
    python tools/pipeline.py daily              the daily stages;  hourly  the hourly ones;  hand  by hand
    python tools/pipeline.py --only craft       one stage             --from sync   that stage and every one after it
    python tools/pipeline.py --list             the table: what each stage reads, writes, and where it comes from
    python tools/pipeline.py --check            hold the data already here to the rules, write nothing
    python tools/pipeline.py patch --dry        build and check everything in build/, swap nothing in
    python tools/pipeline.py patch --force      run a stage even where its inputs match the last run
    python tools/pipeline.py patch --artifact path/to/artifact.html      the Wraeclast Index artifact, for sync

How a run goes:

  1. The worktree is copied into build/tree/ (not .git, node_modules, dist or build). Every stage runs there,
     so a builder writes where it always writes and nothing in data/ moves while the run is going.
  2. Each stage in turn: a stage whose inputs hash the same as the last run that shipped is skipped
     (tools/cache/stamps.json: the tool and the tools it imports, every file it reads, and for an outside
     source the patch, the day or the hour its cadence goes by). Otherwise it runs, and what it changed is
     copied to build/<stage>/ with its log.
  3. What it changed is checked: every JSON file still reads; the files the cards are made of hold to their
     declarations (tools/dev/schema.mjs, data/schema.json); and every JSON file it wrote holds up against the
     copy in data/ under the last good rule, counts and shape (tools/lastgood.py). The index's links too
     (tools/nodelinks.py, "lx"): a link the copy in data/ has is lost only with its card or its words. One
     lost while both cards are still there and the line still says the words fails the run (lost_links).
     A file a later stage of the same run writes too (data/index.json and its two parts: sync builds it, then
     gamelib, treecards, clusters and the rest add their cards to it) is held to the last good rule once, on
     its final state after the last stage that writes it, against the copy in data/. Halfway through it is
     not the file that ships, so its count means nothing there. The stage is told so in WI_CHECKED_LATER (the
     files, comma separated), and a builder that checks such a file itself (tools/sync.py, the index) keeps
     its floor and its declarations but leaves the comparison with the copy in data/ to the end of the run.
  4. Only when every stage passed does it all go into data/ at once: every file written beside its place
     first, then each moved over in one step. The stamps are written, and the warm caches copied back.

A stage that fails stops the run and nothing goes in: data/ keeps its last good copy, the run says why, the
fault goes into data/faults.json and a data-fault issue is opened or reused (tools/lastgood.py; WI_NO_TICKET=1
keeps it off GitHub). --dry and --check never write to data/, and never raise an issue.

A stage that needs what only the owner's machine has is skipped with a line that says so when it is not
given, and the stages after it build on the last good copy. Sync no longer does: without --artifact it runs
tools/sync.py --from-game, the drill-down's data from the game files (tools/fromgame.py). The
stages that send files to the site (the hourly ones on the Publish site workflow) never send from here: the
keys that would let them are taken out of every stage's environment.
"""
import argparse
import datetime as dt
import fnmatch
import glob
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
TREE = BUILD / 'tree'
CACHE = ROOT / 'tools' / 'cache'
STAMPS = CACHE / 'stamps.json'
LEAVE = {'.git', 'node_modules', 'dist', 'build', 'tmp', '.wrangler', '__pycache__'}   # never copied into the tree
WATCH = ('data', 'explore.html', 'tools/craftweights.json', 'tools/dev/gaps.txt')     # what a stage may change
RECORD = 'data/faults.json'          # the last good record: merged by lastgood, never swapped in as a data file
SENDS = ('WI_DATA_DIR', 'WI_INGEST_KEY', 'ACTIONS_ID_TOKEN_REQUEST_URL', 'ACTIONS_ID_TOKEN_REQUEST_TOKEN')
CADENCES = {'patch': ('patch', 'daily'), 'daily': ('daily',), 'hourly': ('hourly',), 'hand': ('hand',)}

# where each source lives, for the table and the stamps
REPOE = 'https://repoe-fork.github.io/poe2/'
TRADE = 'https://www.pathofexile.com/api/trade2/data/'
POE2DB = 'https://poe2db.tw/us/'
COE = 'https://www.craftofexile.com/'
NINJA = 'https://poe.ninja/poe2/'
FEED = 'https://web.poecdn.com/ (the Currency Exchange feed)'
CDN = 'https://patch-poe2.poecdn.com/'
DATSCHEMA = 'https://github.com/poe-tool-dev/dat-schema'

"""The stages, in the order the data needs them: a stage reads what the ones above it wrote. Per stage:

  name     what it is called here (--only, --from)
  run      the tool and its arguments; '@artifact' is the artifact's path, given with --artifact. A .py tool
           runs with this Python, a .mjs tool with Node
  cadence  patch (after a game patch), daily, hourly, or hand (run on purpose, never by a cadence)
  source   where its facts come from: game files (RePoE's export of them, or the game's own bundles), poe2db, Craft of Exile, trade (the
           official trade site's lists), Exchange (the in-game Currency Exchange feed), poe.ninja, the artifact,
           files (only what is already on disk), or a named outside page
  reads    files it reads (globs welcome) and the addresses it fetches
  writes   files it writes; count names the part of a file its rows are in, for the last good count (a glob
           names every file it matches; the first key that matches a file is the one)
  needs    something only the owner's machine has: the stage is skipped with a line saying so without it
  without  what to run instead when it is not given (sync: --from-game, the drill-down from the game files)
  last     a file it reads on purpose from the last good copy, though a later stage writes it
  minutes  how long it may take before it counts as stuck
"""
STAGES = [
    dict(name='gamepull', run=['tools/gamepull.py'], cadence='daily', source='game files',
         reads=[REPOE, 'data/trade.json', 'data/explore/jewels.*.json'],
         writes=['data/gamedata.json', 'tools/dev/gaps.txt'], count={'data/gamedata.json': 'patch'}),
    dict(name='gameinfo', run=['tools/gameinfo.py'], cadence='patch', source='game files',
         reads=[REPOE], writes=['data/reqs.json', 'data/info.json'], count={'data/reqs.json': 'bases'}),
    dict(name='datpull', run=['tools/datpull.mjs'], cadence='patch', source='game files',
         reads=[CDN, DATSCHEMA, REPOE], writes=['data/game/*.json'],
         count={'data/game/_meta.json': 'files', 'data/game/*.json': 'rows'}),
    dict(name='tradedata', run=['tools/tradedata.py'], cadence='patch', source='trade',
         reads=[TRADE, REPOE], writes=['data/trade.json']),
    dict(name='rollprices', run=['tools/rollprices.py'], cadence='patch', source='files',
         reads=['data/trade.json'], writes=['data/pricejobs.json']),
    dict(name='atlas', run=['tools/atlas.py'], cadence='patch', source='game files',
         reads=[REPOE, TRADE, POE2DB, NINJA, 'data/market.json'], writes=['data/atlas.json']),
    dict(name='areas', run=['tools/areas.py'], cadence='patch', source='game files',
         reads=[REPOE, CDN, DATSCHEMA, 'data/atlas.json',
                'data/bosses.json'], last=['data/bosses.json'],
         writes=['data/areas.json'], count={'data/areas.json': 'areas'}),
    dict(name='craftweights', run=['tools/craftweights.py'], cadence='patch', source='Craft of Exile',
         reads=[COE], writes=['tools/craftweights.json']),
    dict(name='craft', run=['tools/craft.py'], cadence='patch', source='game files',
         reads=[REPOE, POE2DB, 'data/trade.json', 'tools/craftweights.json'],
         writes=['data/craft.json', 'data/craft/*.json'], count={'data/craft.json': 'classes'}, minutes=30),
    dict(name='craftmods', run=['tools/craftmods.py'], cadence='patch', source='files',
         reads=['data/craft.json', 'data/craft/*.json'], writes=['data/craftmods.json']),
    dict(name='baseprices', run=['tools/baseprices.py'], cadence='patch', source='files',
         reads=['data/craft/*.json'], writes=['data/basequeries.json'], count={'data/basequeries.json': 'queries'}),
    dict(name='uniques', run=['tools/uniques.py'], cadence='patch', source='poe2db',
         reads=[POE2DB, 'data/index.json'], last=['data/index.json'], writes=['data/uniques.json']),
    dict(name='sync', run=['tools/sync.py', '@artifact'], cadence='patch', source='game files, or the artifact',
         needs='the Wraeclast Index artifact, which lives only on the owner\'s machine (--artifact PATH)',
         without=['--from-game'],   # no artifact: the blocks tools/fromgame.py ADOPTED, from the game files
         reads=['@artifact', REPOE, NINJA, TRADE, 'https://github.com/grindinggear/poe2-skilltree-export', 'data/patches.json',
                'data/uniques.json', 'data/market.json', 'data/reqs.json',
                'data/trade.json', 'data/craft.json', 'data/atlas.json', 'data/info.json'],
         writes=['data/index.json', 'data/index-core.json', 'data/index-rest.json', 'explore.html',
                 'data/explore/*.json', 'data/interactions.json'],
         count={'data/index.json': 'items'}, minutes=45),
    dict(name='gamelib', run=['tools/gamelib.py'], cadence='patch', source='game files',
         reads=[REPOE, CDN, DATSCHEMA, 'explore.html', 'data/explore/*.json', 'data/index.json', 'data/craft.json',
                'data/craft/*.json', 'data/trade.json', 'data/market.json', 'data/info.json'],
         writes=['data/index.json', 'data/index-core.json', 'data/index-rest.json', 'data/gamestats.json',
                 'data/jewels.json'],
         count={'data/index.json': 'items'}),
    dict(name='treecards', run=['tools/treecards.py'], cadence='patch', source='game files',
         reads=[REPOE, 'data/index.json', 'data/explore/*.json'],
         writes=['data/index.json', 'data/index-core.json', 'data/index-rest.json'], count={'data/index.json': 'items'}),
    dict(name='clusters', run=['tools/clusters.py'], cadence='patch', source='game files',
         reads=[REPOE, 'data/index.json'],
         writes=['data/tree-shape.json', 'data/clusters.json', 'data/index.json', 'data/index-core.json',
                 'data/index-rest.json'], count={'data/index.json': 'items'}),
    dict(name='buffs', run=['tools/buffs.py'], cadence='patch', source='game files',
         reads=[REPOE, 'data/index.json', 'data/grants.json'], last=['data/grants.json'],
         writes=['data/buffs.json', 'data/index.json', 'data/index-core.json', 'data/index-rest.json'],
         count={'data/buffs.json': 'rows', 'data/index.json': 'items'}),
    dict(name='ascendancies', run=['tools/ascendancies.py'], cadence='patch', source='game files',
         reads=[REPOE, 'data/index.json', 'data/trials.json'],
         writes=['data/ascendancies.json', 'data/index.json', 'data/index-core.json', 'data/index-rest.json'],
         count={'data/ascendancies.json': 'rows', 'data/index.json': 'items'}),
    dict(name='grants', run=['tools/grants.py'], cadence='patch', source='game files',
         reads=[REPOE, 'data/index.json', 'data/buffs.json'], writes=['data/grants.json']),
    dict(name='carddata', run=['tools/carddata.py'], cadence='patch', source='game files',
         reads=[REPOE, 'data/explore/*.json', 'data/atlas.json', 'data/info.json', 'data/craft.json', 'data/craft/*.json',
                'data/market.json', 'data/index.json'],
         writes=['data/index.json', 'data/index-core.json', 'data/index-rest.json'], count={'data/index.json': 'items'}),
    dict(name='nodelinks', run=['tools/nodelinks.py'], cadence='patch', source='files',
         reads=['data/index.json'],
         writes=['data/index.json', 'data/index-core.json', 'data/index-rest.json'], count={'data/index.json': 'items'}),
    dict(name='essences', run=['tools/essences.py'], cadence='patch', source='files',
         reads=['data/craft.json', 'data/craft/*.json', 'data/index.json'], writes=['data/essences.json']),
    dict(name='kwuse', run=['tools/kwuse.py'], cadence='patch', source='files',
         reads=['explore.html', 'data/explore/*.json', 'data/index.json', 'data/atlas.json', 'data/info.json',
                'data/market.json', 'data/craft.json', 'data/craft/*.json'],
         writes=['data/kwuse.json', 'data/index.json', 'data/index-core.json', 'data/index-rest.json'],
         count={'data/index.json': 'items'}),
    dict(name='gemlines', run=['tools/gemlines.py'], cadence='patch', source='files',
         reads=['data/explore/gems.*.json'], writes=['data/gemlines.json']),
    dict(name='treelines', run=['tools/treelines.py'], cadence='patch', source='files',
         reads=['data/explore/tree.*.json'], writes=['data/treelines.json']),
    dict(name='treechanges', run=['tools/treeexport.py'], cadence='patch', source="GGG's passive tree export",
         reads=['https://github.com/grindinggear/poe2-skilltree-export', REPOE, 'data/patches.json', 'explore.html',
                'data/explore/tree.*.json'],
         writes=['data/treechanges/*.json'], count={'data/treechanges/index.json': 'steps'}),
    dict(name='patchnotes', run=['tools/patchnotes.py'], cadence='patch', source="GGG's patch notes forum",
         reads=['https://www.pathofexile.com/forum/ (the patch notes threads data/patches.json names)',
                'data/patches.json', 'data/index.json'],
         writes=['data/patchnotes.json'], count={'data/patchnotes.json': 'lines'}),
    dict(name='map', run=['tools/map.py'], cadence='patch', source='files',
         reads=['data/index.json', 'data/kwuse.json', 'data/grants.json', 'data/gamedata.json', 'assets/kinds.js',
                'assets/theme.css'],
         writes=['data/map.png', 'data/map.json', 'data/map-nodes.json'], minutes=15),
    dict(name='guides', run=['tools/guides.py'], cadence='daily', source='the community guides',
         reads=['the guide pages tools/guides.py lists'], writes=['data/guides.json']),
    dict(name='market', run=['tools/market.py'], cadence='hourly', source='poe.ninja',
         reads=[NINJA, REPOE, 'data/info.json'], writes=['data/market.json'], count={'data/market.json': 'items'}),
    dict(name='exchange', run=['tools/exchange.py'], cadence='hourly', source='Exchange',
         reads=[FEED, REPOE, 'data/market.json', 'data/trade.json'],
         writes=['data/exchange.json', 'data/exchange-state.json'], count={'data/exchange.json': 'items'}),
    dict(name='leagues', run=['tools/leagues.py'], cadence='hourly', source='poe2db',
         reads=[POE2DB + 'League', 'https://www.pathofexile.com/forum/'], writes=['data/leagues.json'],
         count={'data/leagues.json': 'leagues'}),
    dict(name='bosses', run=['tools/bosses.py'], cadence='hand', source='game files',
         reads=[REPOE, 'https://www.poe2wiki.net/', 'https://github.com/ (Path of Building)',
                'https://maxroll.gg/ (boss loot table)', POE2DB, 'data/market.json', 'data/bossqueries.json',
                'data/index.json'],
         writes=['data/bosses.json', 'data/dropsfrom.json'],
         count={'data/bosses.json': 'bosses', 'data/dropsfrom.json': 'uniques'}),
    dict(name='farms', run=['tools/farms.py'], cadence='hand', source='BawLoch\'s tier list sheet',
         reads=['https://docs.google.com/ (the tier list sheet)', 'data/trade.json', 'data/market.json',
                'data/index-core.json', 'data/leagues.json'],
         writes=['data/farms.json', 'data/farmqueries.json']),
    dict(name='mechanics', run=['tools/mechanics.py'], cadence='hand', source='files',
         reads=['data/index.json'], writes=['data/index.json', 'data/index-core.json', 'data/index-rest.json'],
         count={'data/index.json': 'items'}),
    dict(name='ninjapast', run=['tools/ninjapast.py'], cadence='hand', source='poe.ninja',
         reads=[NINJA, 'data/leagues.json'], writes=['data/pastprices.json']),
    # last, once the index is final: the cut the site reads a piece at a time (the search, the cards, the crawler
    # pages). After a hand stage that edits the index, run it on its own (--only shards); --check says when it is due
    dict(name='shards', run=['tools/shards.py'], cadence='patch', source='files',
         reads=['data/index.json', 'data/index-core.json', 'worker/seo.js', 'assets/kinds.js', 'tools/seoshards.mjs'],
         writes=['data/manifest.json', 'data/search/*.json', 'data/cards/*.json', 'data/cards/*/*.json',
                 'data/seo/*.json', 'data/seo/*/*.json', 'data/seo/words/*.txt']),
]
BY = {s['name']: s for s in STAGES}


# ---------------------------------------------------------------- small things
def say(*a):
    print(*a, flush=True)


def is_url(r):
    return r.startswith('http') or ' ' in r and not r.startswith('data/')


def rel(p):
    return Path(p).as_posix()


def matches(path, globs):
    return any(fnmatch.fnmatch(path, g) for g in globs)


def count_of(stage, path):
    """The part of a file its rows are in, from the stage's count: the first key that matches the file."""
    return next((at for g, at in (stage or {}).get('count', {}).items() if fnmatch.fnmatch(path, g)), None)


def digest(b):
    return hashlib.sha1(b).hexdigest()


def snapshot(root):
    """Every file a stage may change, under root, by its hash."""
    out = {}
    for w in WATCH:
        p = root / w
        files = [p] if p.is_file() else [x for x in p.rglob('*') if x.is_file()] if p.is_dir() else []
        for f in files:
            out[rel(f.relative_to(root))] = digest(f.read_bytes())
    return out


def imports(tool, seen=None):
    """A tool and every tool of ours it imports, all the way down: what its stamp hashes as code."""
    seen = seen if seen is not None else set()
    if tool in seen:
        return seen
    seen.add(tool)
    try:
        src = (ROOT / 'tools' / (tool + '.py')).read_text(encoding='utf-8')
    except OSError:
        return seen
    for m in re.finditer(r'^\s*(?:import|from)\s+(\w+)', src, re.M):
        if (ROOT / 'tools' / (m.group(1) + '.py')).exists():
            imports(m.group(1), seen)
    return seen


def args_of(stage, artifact):
    if not artifact and '@artifact' in stage['run'] and stage.get('without'):
        return list(stage['without'])
    return [str(artifact) if a == '@artifact' else a for a in stage['run'][1:]]


def stamp(stage, root, artifact):
    """What a stage's inputs hash to now: its code, the files it reads as they are in root, and for an outside
    source the patch, the day or the hour, since what an address answers cannot be hashed without asking it.
    A file the stage also writes is left out: it edits that file in place and running it twice adds nothing
    twice, so what it wrote there last time is no reason to run again. A run where a stage above rewrote
    such a file runs it anyway (see main)."""
    h = hashlib.sha1()
    tool = Path(stage['run'][0]).stem
    js = stage['run'][0].endswith('.mjs')        # a Node tool: the file itself (its reads name what else it needs)
    if js:
        h.update(digest((root / stage['run'][0]).read_bytes()).encode())
    for t in [] if js else sorted(imports(tool)):
        h.update(t.encode() + digest((root / 'tools' / (t + '.py')).read_bytes()).encode())
    h.update(json.dumps(args_of(stage, artifact)).encode())
    for r in stage['reads']:
        if r == '@artifact':
            if artifact:
                h.update(digest(Path(artifact).read_bytes()).encode())
            continue
        if is_url(r) or matches(r, stage['writes']):
            continue
        for f in sorted(glob.glob(str(root / r))):
            h.update(rel(Path(f).relative_to(root)).encode() + digest(Path(f).read_bytes()).encode())
    if any(is_url(r) for r in stage['reads']):
        now = dt.datetime.now(dt.timezone.utc)
        c = stage['cadence']
        if c == 'patch':
            game = json_at(root / 'data' / 'gamedata.json') or {}
            h.update(('patch %s of %s' % (game.get('patch'), game.get('dated'))).encode())
        else:
            h.update(now.strftime('%Y-%m-%d' + (' %H' if c == 'hourly' else '')).encode())
    return h.hexdigest()


def json_at(p):
    try:
        return json.loads(Path(p).read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return None


# ---------------------------------------------------------------- the table
def table(stages):
    say('%-13s %-7s %-21s %s' % ('stage', 'cadence', 'source', 'reads -> writes'))
    for s in stages:
        reads = ', '.join(r if not is_url(r) else r.split('//')[-1].split('/')[0] if '//' in r else r for r in s['reads'])
        say('%-13s %-7s %-21s %s -> %s%s' % (s['name'], s['cadence'], s['source'][:21], reads, ', '.join(s['writes']),
                                              ('  [needs ' + s['needs'].split(',')[0] + ']') if s.get('needs') else ''))


def order_faults():
    """The table's own order, held to what the stages say they read and write: a stage that reads a file only
    a later stage writes is out of order, unless it says it reads that file's last good copy on purpose."""
    bad = []
    for i, s in enumerate(STAGES):
        for r in s['reads']:
            if is_url(r) or r == '@artifact' or r in s.get('last', []):
                continue
            later = [t['name'] for t in STAGES[i + 1:] if t['cadence'] == s['cadence'] and matches(r, t['writes'])
                     and not matches(r, s['writes'])]
            earlier = [t['name'] for t in STAGES[:i] if matches(r, t['writes'])]
            if later and not earlier:
                bad.append('%s reads %s, which only %s writes, after it' % (s['name'], r, ', '.join(later)))
        if not (ROOT / s['run'][0]).exists():
            bad.append('%s runs %s, which is not there' % (s['name'], s['run'][0]))
    return bad


# ---------------------------------------------------------------- the checks
def node():
    return shutil.which('node')


def schema_check(data_dir):
    """tools/dev/schema.mjs against a data folder: the problems, or [] when it holds (or there is no node)."""
    if not node():
        say('  (no node here: the declarations check is left to the guard)')
        return []
    r = subprocess.run([node(), str(ROOT / 'tools' / 'dev' / 'schema.mjs'), '--data', str(data_dir)],
                       cwd=str(ROOT), capture_output=True, text=True, encoding='utf-8', errors='replace')
    lines = [l[5:] for l in r.stdout.splitlines() if l.startswith('FAIL ')]
    if r.returncode and not lines:
        lines = [(r.stderr or r.stdout).strip()[-300:] or 'tools/dev/schema.mjs stopped with %d' % r.returncode]
    return lines


def last_copy(path, root=ROOT):
    """The last good copy of a file in root: the file itself, or for a file named by its content
    (data/explore/gems.<hash>.json) the one of the same name it replaces."""
    got = json_at(root / path)
    if got is not None:
        return got
    m = re.match(r'^(.*/[\w-]+)\.[0-9a-f]{6,}\.json$', path)
    if m:
        for f in sorted(glob.glob(str(root / m.group(1)) + '.*.json')):
            if re.match(r'^[0-9a-f]{6,}$', Path(f).name.split('.')[-2]):
                return json_at(f)
    return None


CARD_FILES = ('data/index.json', 'data/index-core.json', 'data/index-rest.json', 'data/bosses.json', 'data/schema.json')
# One numbered piece of the cut (tools/shards.py): data/cards/<kind>/NN.<hash>.json, data/seo/item/NN.<hash>.json.
# Which cards land in piece NN moves whenever the number of pieces does (a card more, a card less), so a piece is
# never held to the old piece of the same number: the cut as a whole is held to the index (shards.stale()), and
# the index to the committed one. A piece's own ids still hold.
CUT_PIECE = re.compile(r'^data/(?:cards|seo)/[\w-]+/\d+\.[0-9a-f]{6,}\.json$')


def links(index):
    """The index's links (tools/nodelinks.py): (card, card it opens, the words) for every span in every line."""
    import nodelinks
    keys, out = index.get('lxk') or [], []
    for it in index.get('items') or []:
        lines = nodelinks.lines_of(it)
        for j, row in enumerate(it.get('lx') or []):
            for s, n, k in (row or []) if j < len(lines) else []:
                if 0 <= k < len(keys):
                    out.append((it['k'] + ':' + it['id'], keys[k], lines[j][s:s + n]))
    return out


def lost_links(new, old):
    """The links the last good index had that this one lost while nothing explains it: both cards are still
    there and the card's lines still say the words. Links are the graph, so one of those is a fault. A link whose
    card went, or whose line no longer says the words, went with them. So did one whose words a longer link on
    the same card now covers: "Shroud" (the Shroud gem) inside "Ghost Shroud" (the buff card of that name)."""
    import nodelinks
    fresh = links(new)
    now = {(a, b) for a, b, _ in fresh}
    longer = {}
    for a, _, words in fresh:
        longer.setdefault(a, set()).add(words)
    cards = {it['k'] + ':' + it['id']: it for it in new.get('items') or []}
    lost = []
    for a, b, words in links(old):
        if (a, b) in now or a not in cards or b not in cards:
            continue
        if any(words in w and words != w for w in longer.get(a, ())):
            continue
        if any(words in line for line in nodelinks.lines_of(cards[a])):
            lost.append((a, b, words))
    return sorted(set(lost))


def link_counts(index):
    """How many links reach each kind of card."""
    out = {}
    for _, b, _ in links(index):
        out[b.split(':')[0]] = out.get(b.split(':')[0], 0) + 1
    return out


def check_files(stage, changed, root, against, schema=True, later=()):
    """What a stage wrote, held to the rules: (file, why) for the first file that does not hold up, else None.
    against(path) gives the last good copy of a file (data/ as it is, or the committed one). later: files a
    later stage of the run writes too, whose count and shape are checked once, on the final state."""
    for path in sorted(changed):
        if not path.endswith('.json') or path == RECORD:
            continue
        p = root / path
        if not p.exists():
            continue
        try:
            new = json.loads(p.read_text(encoding='utf-8'))
        except ValueError as e:
            return path, 'it does not read as JSON: %s' % str(e)[:100], {}
        old = None if path in later or CUT_PIECE.match(path) else against(path)
        if old is None:                       # new, rewritten later, or a piece of the cut: its own ids still hold
            why = lastgood.own_ids(new)
            if why:
                return path, why, {}
            continue
        name = path[len('data/'):] if path.startswith('data/') else path
        bad = lastgood.look(new, old, count_of(stage, path), file=name)
        if bad:
            return path, bad['why'], bad
        if path == 'data/index.json':
            lost = lost_links(new, old)
            if lost:
                return path, '%d link%s lost, both cards still there and the words still in the line: %s' % (
                    len(lost), '' if len(lost) == 1 else 's', '; '.join('%s -> %s "%s"' % x for x in lost[:6])), {
                    'was': len(lost), 'now': 0, 'gone': sorted({x[1].split(':')[0] for x in lost})}
    if schema and any(p in CARD_FILES for p in changed):
        problems = schema_check(root / 'data')
        if problems:
            return 'data/schema.json', 'the rows do not hold to their declarations: ' + ' | '.join(problems[:3]), {}
    return None


# ---------------------------------------------------------------- one stage
def env_for_stage(later=()):
    e = {k: v for k, v in os.environ.items() if k not in SENDS}   # nothing is sent to the site from here
    e['WI_NO_TICKET'] = '1'        # the pipeline raises the ticket itself, in the real record, once
    e['PYTHONIOENCODING'] = 'utf-8'
    e['PYTHONUTF8'] = '1'
    e.pop('WI_CHECKED_LATER', None)
    if later:                      # files a later stage rewrites: the run holds their final state to the rule
        e['WI_CHECKED_LATER'] = ','.join(sorted(later))
    return e


def rewritten_later(stage, chosen):
    """The files this stage writes that a stage after it in this run writes too: (path pattern -> the last
    stage that writes it). Their count and shape are checked once, on the final state (see the top)."""
    rest = chosen[chosen.index(stage) + 1:]
    out = {}
    for w in stage['writes']:
        for t in rest:
            if w in t['writes'] or matches(w, t['writes']):
                out[w] = t['name']
    return out


def run_stage(stage, artifact, log, later=()):
    runner = node() if stage['run'][0].endswith('.mjs') else sys.executable
    started = time.time()
    if not runner:
        Path(log).write_text('there is no Node here to run %s with\n' % stage['run'][0], encoding='utf-8')
        say('  | there is no Node here to run %s with' % stage['run'][0])
        return 127, 0
    cmd = [runner, str(TREE / stage['run'][0])] + args_of(stage, artifact)
    with open(log, 'w', encoding='utf-8') as out:
        out.write('$ %s\n' % ' '.join(cmd))
        p = subprocess.Popen(cmd, cwd=str(TREE), env=env_for_stage(later), stdout=subprocess.PIPE,
                             stderr=subprocess.STDOUT, text=True, encoding='utf-8', errors='replace')
        stuck = threading.Timer(60 * stage.get('minutes', 20), p.kill)
        stuck.start()
        for line in p.stdout:
            out.write(line)
            sys.stdout.write('  | ' + line)
        code = p.wait()
        late = not stuck.is_alive() and code != 0
        stuck.cancel()
        if late:
            out.write('\n(stopped: over %d minutes)\n' % stage.get('minutes', 20))
            return 124, time.time() - started
        return code, time.time() - started


def faults_since(t0):
    """The faults the stages in the tree recorded this run, off the tree's own record."""
    rec = json_at(TREE / RECORD) or {}
    return [f for f in rec.get('faults', []) if f.get('at', '') >= t0]


# ---------------------------------------------------------------- the run
def wipe(path):
    """shutil.rmtree, and on Windows past the read-only files git keeps (tools/cache/treeexport.git's packs)."""
    def writable(fn, f, _):
        os.chmod(f, 0o700)
        fn(f)
    shutil.rmtree(path, onexc=writable) if sys.version_info >= (3, 12) else shutil.rmtree(path, onerror=writable)


def over(src, dst):
    """shutil.copy2 onto a file git left read-only (tools/cache/treeexport.git's packs, on Windows)."""
    if os.path.exists(dst) and not os.access(dst, os.W_OK):
        os.chmod(dst, 0o600)
    return shutil.copy2(src, dst)


def copy_tree():
    if TREE.exists():
        wipe(TREE)
    for p in ROOT.iterdir():
        if p.name in LEAVE:
            continue
        if p.is_dir():
            shutil.copytree(p, TREE / p.name, ignore=shutil.ignore_patterns(*LEAVE, 'stamps.json', '*.pipeline'))
        else:
            TREE.mkdir(parents=True, exist_ok=True)
            shutil.copy2(p, TREE / p.name)
    # tools/cache comes along with tools/: the warm caches, since a first sync checks every picture once


def swap(changed):
    """Everything the run changed, into the worktree at once: each file written beside its place first, then
    all of them moved over, then what the run removed taken away."""
    staged = []
    for path, what in sorted(changed.items()):
        if what == 'gone':
            continue
        dst = ROOT / path
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_name(dst.name + '.pipeline')
        shutil.copy2(TREE / path, tmp)
        staged.append((tmp, dst))
    for tmp, dst in staged:
        os.replace(tmp, dst)
    for path, what in changed.items():
        if what == 'gone' and (ROOT / path).exists():
            (ROOT / path).unlink()


def keep_record(found):
    """The faults into the real record, and the tickets raised: tools/lastgood.py's own end of a run."""
    lastgood.FOUND.extend(found)
    return lastgood.report()


def check_only():
    """--check: the data here, held to the same rules a run holds a stage to. Nothing is written."""
    say('pipeline --check: the data in data/, against the rules and against the last commit')
    bad = order_faults()
    for b in bad:
        say('FAIL table: ' + b)

    def committed(path):
        r = subprocess.run(['git', 'show', 'HEAD:' + path], cwd=str(ROOT), capture_output=True)
        if r.returncode:
            return None
        try:
            return json.loads(r.stdout.decode('utf-8'))
        except ValueError:
            return None
    files = sorted({rel(Path(f).relative_to(ROOT)) for s in STAGES for w in s['writes'] if w.endswith('.json')
                    for f in glob.glob(str(ROOT / w))})
    n = 0
    for path in files:
        one = check_files(next((s for s in STAGES if count_of(s, path)), None), [path], ROOT, committed, schema=False)
        n += 1
        if one:
            bad.append('%s: %s' % one[:2])
            say('FAIL %s: %s' % one[:2])
    problems = schema_check(ROOT / 'data')
    for p in problems:
        bad.append(p)
        say('FAIL declarations: ' + p)
    import shards   # the cut is of this index (the staging runs leave it to the last stage)
    why = shards.stale()
    if why:
        bad.append(why)
        say('FAIL shards: ' + why)
    if not bad:
        say('ok   %d stages in order, %d data files hold up against the last commit, every row holds to its '
            'declaration, the cut is of this index' % (len(STAGES), n))
    return 1 if bad else 0


def main():
    try:
        sys.stdout.reconfigure(errors='replace')
    except AttributeError:
        pass
    ap = argparse.ArgumentParser(description='Every builder, in order, built aside and swapped in whole.')
    ap.add_argument('cadence', nargs='?', choices=sorted(CADENCES), help='which stages: patch, daily, hourly, hand')
    ap.add_argument('--only', help='one stage')
    ap.add_argument('--from', dest='start', help='this stage and every one after it')
    ap.add_argument('--list', action='store_true', help='the table, nothing run')
    ap.add_argument('--check', action='store_true', help='hold the data here to the rules, write nothing')
    ap.add_argument('--dry', action='store_true', help='build and check in build/, swap nothing in')
    ap.add_argument('--force', action='store_true', help='run stages whose inputs match the last run too')
    ap.add_argument('--artifact', help='the Wraeclast Index artifact (or explore.html, which holds the same data)')
    a = ap.parse_args()

    if a.list:
        table(STAGES)
        bad = order_faults()
        for b in bad:
            say('FAIL ' + b)
        return 1 if bad else 0
    if a.check:
        return check_only()

    for n in (a.only, a.start):
        if n and n not in BY:
            ap.error('no stage called %s (--list names them)' % n)
    if a.only:
        chosen = [BY[a.only]]
    elif a.cadence or a.start:
        # --from on its own keeps to the stage's own run: a patch stage runs on with the rest of the patch run
        own = next((k for k, v in CADENCES.items() if BY[a.start]['cadence'] in v), 'patch') if a.start else 'patch'
        cads = CADENCES[a.cadence or own]
        at = [s['name'] for s in STAGES].index(a.start) if a.start else 0
        chosen = [s for s in STAGES[at:] if s['cadence'] in cads]
    else:
        ap.error('say which stages: patch, daily, hourly, hand, --only or --from (--list names them)')
    artifact = Path(a.artifact).resolve() if a.artifact else None
    if artifact and not artifact.exists():
        ap.error('no artifact at %s' % artifact)

    bad = order_faults()
    if bad:
        for b in bad:
            say('FAIL ' + b)
        return 1

    t0 = dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes')
    say('pipeline: %d stage%s%s: %s' % (len(chosen), '' if len(chosen) == 1 else 's', ' (dry: nothing goes into data/)'
                                         if a.dry else '', ', '.join(s['name'] for s in chosen)))
    BUILD.mkdir(exist_ok=True)
    for old in BUILD.iterdir():
        if old.is_dir():
            wipe(old)
    copy_tree()
    start = snapshot(TREE)
    stamps = {} if a.force else (json_at(STAMPS) or {})
    new_stamps, ran, skipped, changed_all = {}, [], [], set()
    deferred = {}              # a file a later stage rewrites -> what to count in it, for the final check
    report = {'started': t0, 'dry': a.dry, 'stages': []}

    def fail(stage, why, found, counts=None):
        say('')
        say('FAILED at %s: %s' % (stage['name'], why))
        say('Nothing went into data/: it keeps its last good copy. The log is build/%s/log.txt.' % stage['name'])
        report['failed'] = {'stage': stage['name'], 'why': why}
        (BUILD / 'report.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
        if not found:
            found = [lastgood.fault('Pipeline: ' + stage['name'],
                                    {'was': (counts or {}).get('was', 0), 'now': (counts or {}).get('now', 0),
                                     'gone': (counts or {}).get('gone', []), 'why': why},
                                    file=', '.join(stage['writes'][:2]),
                                    url=next((r for r in stage['reads'] if is_url(r)), ''),
                                    old=lastgood.committed(stage['writes'][0][5:], quiet=True)
                                    if stage['writes'][0].startswith('data/') else None)]
            lastgood.FOUND.remove(found[0])
        if a.dry:
            for f in found:
                say('  would record: %s' % lastgood.line(f))
            return 1
        keep_record(found)
        return 1

    for stage in chosen:
        name = stage['name']
        out = BUILD / name
        out.mkdir(parents=True, exist_ok=True)
        if stage.get('needs') and '@artifact' in stage['run'] and not artifact and not stage.get('without'):
            say('\n== %s: skipped. It needs %s. The stages after it build on the last good copy.' % (name, stage['needs']))
            skipped.append(name)
            report['stages'].append({'name': name, 'skipped': 'needs ' + stage['needs']})
            continue
        key = stamp(stage, TREE, artifact)
        above = [p for p in changed_all if matches(p, [r for r in stage['reads'] if not is_url(r)])]
        if stamps.get(name) == key and not above:
            say('\n== %s: skipped, its inputs are the same as the last run that shipped' % name)
            skipped.append(name)
            report['stages'].append({'name': name, 'skipped': 'inputs unchanged'})
            new_stamps[name] = key
            continue
        say('\n== %s (%s, %s)' % (name, stage['cadence'], stage['source']))
        later = rewritten_later(stage, chosen)
        if later:
            say('  %s: checked on the final state, after %s' % (', '.join(sorted(later)),
                                                               ', '.join(sorted(set(later.values())))))
        before = snapshot(TREE)
        code, secs = run_stage(stage, artifact, out / 'log.txt', later)
        after = snapshot(TREE)
        changed = {p for p in set(before) | set(after) if before.get(p) != after.get(p)} - {RECORD}
        for p in changed:
            if (TREE / p).exists():
                (out / p).parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(TREE / p, out / p)
        stray = sorted(p for p in changed if not matches(p, stage['writes']))
        if stray:
            say('  note: %s also changed %s, which its row in STAGES does not list' % (name, ', '.join(stray)))
        report['stages'].append({'name': name, 'code': code, 'seconds': round(secs), 'changed': sorted(changed)})
        if code:
            return fail(stage, 'the stage stopped with exit %d' % code
                        + (' (over its %d minutes)' % stage.get('minutes', 20) if code == 124 else ''),
                        faults_since(t0))
        held = {p for p in changed if matches(p, list(later))}
        for p in held:
            deferred[p] = count_of(stage, p) or deferred.get(p)
        why = check_files(stage, changed, TREE, last_copy, later=held)
        if why:
            return fail(stage, '%s: %s' % why[:2], [], why[2])
        say('  %s: done in %ds, %d file%s changed, %s' % (
            name, secs, len(changed), '' if len(changed) == 1 else 's',
            'the rest holds up' if held else 'all of it holds up'))
        ran.append(name)
        changed_all |= changed
        new_stamps[name] = key

    end = snapshot(TREE)
    final = {p: ('gone' if p not in end else 'new' if p not in start else 'changed')
             for p in changed_all if start.get(p) != end.get(p)}
    # the files several stages wrote, as they stand after the last of them, against the copy in data/
    last = sorted(p for p in deferred if p in final and final[p] != 'gone')
    if last:
        say('\n== final check: %s, against the copy in data/' % ', '.join(last))
        why = check_files({'count': {p: deferred[p] for p in last if deferred[p]}}, last, TREE, last_copy)
        if why:
            by = next((s for s in reversed(chosen) if s['name'] in ran and matches(why[0], s['writes'])), chosen[-1])
            return fail(by, 'the final %s: %s' % why[:2], [], why[2])
        say('  it holds up')
    record_moved = start.get(RECORD) != end.get(RECORD)
    report.update(ran=ran, skipped=skipped, files=final)
    (BUILD / 'report.json').write_text(json.dumps(report, indent=1), encoding='utf-8')
    say('')
    if a.dry:
        say('dry run: %d ran, %d skipped, %d file%s would go into data/. Nothing did; see build/.'
            % (len(ran), len(skipped), len(final), '' if len(final) == 1 else 's'))
        return 0
    if final:
        swap(final)
    if record_moved:              # sections that came back fine this run drop out of the record
        swap({RECORD: 'changed'})
    stamps.update(new_stamps)
    CACHE.mkdir(parents=True, exist_ok=True)
    fresh = TREE / 'tools' / 'cache'
    if fresh.exists():
        shutil.copytree(fresh, CACHE, dirs_exist_ok=True, ignore=shutil.ignore_patterns('stamps.json'), copy_function=over)
    lastgood.save(STAMPS, json.dumps(stamps, indent=1, sort_keys=True))
    say('pipeline: %d ran, %d skipped, %d file%s into data/ in one step%s' % (
        len(ran), len(skipped), len(final), '' if len(final) == 1 else 's',
        ': ' + ', '.join(sorted(final)[:8]) + (' ...' if len(final) > 8 else '') if final else ''))
    return 0


if __name__ == '__main__':
    sys.exit(main())
