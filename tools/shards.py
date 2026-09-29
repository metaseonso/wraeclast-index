"""The index cut into the files the site reads a piece at a time, so the index can grow without first paint,
the search or the crawler pages growing with it (issue #96, W6). Run by the pipeline's "shards" stage once the
index is final, and by hand after any edit to data/index.json:

    python tools/shards.py            write data/manifest.json and every file it names
    python tools/shards.py --check    say whether those files are of this data/index.json; write nothing

What it writes, all but the manifest named by their content (<name>.<hash>.json), so a browser keeps each one
for a year and a new index is new names:

  data/manifest.json          small and never kept long: the index's id, its client build and patch, where it
                              comes from, and per kind how many cards there are and every file below with its
                              bytes. The one file anything reads first.
  data/cards/meta.<h>.json    what every card is drawn with and no card carries: the sprite sheets, the image
                              servers, the orb ladders, the keyword names, the table the line marks point into,
                              the names the market must not repeat and the text a lineage gem lends its price row
  data/search/<k>.<h>.json    one kind's search rows, in the index's order: what the search, a result's first
                              paint, a Connections row and a pin need, and every other word the card carries,
                              said once each ("h"). The search worker reads these (assets/searchworker.js); the
                              page never holds them all
  data/cards/<k>/<nn>.<h>.json  one kind's cards whole, in the index's order, about 200 KB a file: fetched when a
                              card is opened or drawn, never all at once unless a tab needs the whole index
  data/seo/...                the crawler pages' own cut (worker/seo.js cut(), run by tools/seoshards.mjs):
                              base.<h>.json, list/<k>.<h>.json, item/<nn>.<h>.json, words/<k>.<h>.txt

data/index.json, index-core.json and index-rest.json are left exactly as they are: they are the open data,
and a page opened before this cut still reads them.

The search rows keep a card's words, not its lines: "h" is every word the card's text carries that its name
and sub line do not, lower case, each once, split where JavaScript's \\s splits. A search matches a typed word
inside a card's words (String.includes, assets/rank.js), and a typed word never holds a space, so a word found
in the whole text is found in one of its words, and the other way round: the answers are exactly the answers
the whole text gives. A gem's "q" is trimmed as tools/appdata.py trims it for the page.
"""
import hashlib
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import lastgood
from appdata import gem_words, pack, sheets

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
CARD_BYTES = 200 * 1024     # a card file is closed once it passes this
SEO_BYTES = 96 * 1024       # about what one bucket of whole crawler entries comes to
WORDS_BYTES = 256 * 1024    # llms-full.txt's words, per file
ENTRY = chr(1)              # what worker/seo.js puts between two entries' words
DIRS = ('data/search', 'data/cards', 'data/seo')   # every file under these is this tool's, and only the named ones stay

# the words a search reaches, after the name and the sub line (assets/app.js prep, the same list in the same order)
HAY = ('t', 'q', 'asc', 'reg', 'qt', 'src', 'ls', 'pr', 'tags', 'o', 'rec', 'f')
# what a search row carries besides its words: the head a result, a row or a pin is first drawn with, and what
# the ranking reads (the low band, the field a kind's price row is tested on, the fields the Connections groups
# are keyed by, the words a keyword or mechanics card is marked by)
# (the act a card is in, and the lists of keys the page turns round: assets/kinds.js MAPS)
HEAD = ('ic', 'img', 'lo', 'li', 'cr', 'at', 'f', 'fg', 'act', 'go', 'bx', 'wx', 'ox', 'mx', 'rw', 'ro', 'mk', 'ax')
# JavaScript's \s: a typed word is split on these, so a word never holds one
SPACE = re.compile('[\t\n\x0b\x0c\r    -     　﻿]+')
# the kinds whose names the market must not repeat: an index card of that name is the card (worker/seo.js does
# the same; assets/kinds.js says it as the kinds whose price row is "c" with no test)
NAMED = ('a', 'c')


def sha(b):
    return hashlib.sha1(b).hexdigest()


def body(o):
    return json.dumps(o, ensure_ascii=False, separators=(',', ':'))


# never in a card file: the kind (the file says it), and "ac", a kept anoint cost, which is a price with no source
# and no age (an anoint shows a sum only when every oil has a live price)
DROP = ('k', 'ac')


def card_of(it):
    """A card as the page reads it: no id where it is the name, a gem's search words trimmed the way the page
    has always had them, nothing in DROP."""
    o = {f: v for f, v in it.items() if f not in DROP and not (f == 'id' and v == it['n'])}
    if it['k'] == 'g' and 'q' in o:
        o['q'] = gem_words(it)
        if not o['q']:
            del o['q']
    return o


def words_of(it, card):
    """Every word the card's text carries that its name and sub line do not: lower case, each once, in order."""
    parts = []
    for f in HAY:
        v = card.get(f)
        if isinstance(v, list):
            v = ' '.join(str(x) for x in v)
        if v:
            parts.append(str(v))
    own = set(w for w in SPACE.split((it['n'] + ' ' + (it.get('s') or '')).lower()) if w)
    out, seen = [], set()
    for w in SPACE.split(' '.join(parts).lower()):
        if w and w not in seen and w not in own:
            seen.add(w)
            out.append(w)
    return ' '.join(out)


def search_row(it, card, keys):
    row = {'n': it['n']}
    if it['id'] != it['n']:
        row['id'] = it['id']
    if it.get('s'):
        row['s'] = it['s']
    for f in HEAD:
        if f in card and card[f] not in (None, '', []):
            row[f] = card[f]
    h = words_of(it, card)
    if h:
        row['h'] = h
    if card.get('kw'):
        row['kw'] = card['kw']
    rx = []   # every card its lines name, once each (assets/app.js prep "rx"): the search weighs what you opened
    for r in card.get('lx') or []:
        for x in r or []:
            key = keys[x[2]] if x[2] < len(keys) else None
            if key and key not in rx:
                rx.append(key)
    if rx:
        row['rx'] = rx
    if isinstance(card.get('use'), dict):
        row['us'] = sum(v for v in card['use'].values() if isinstance(v, (int, float)))
    return row


def packed(k, rows, more=None):
    """One file of one kind's rows, every word said many times said once ("dict", tools/appdata.py pack; the page
    and the search worker put the words back as they read it)."""
    part = {k: rows}
    pack(part, [k])
    out = {'k': k, **(more or {}), 'rows': part[k]}
    if part.get('dict'):
        out['dict'] = part['dict']
    return out


def named(name, data, folder):
    """A file named by its content: <folder>/<name>.<hash>.<ext>."""
    raw = data.encode('utf-8') if isinstance(data, str) else data
    stem, ext = name.rsplit('.', 1)
    return '%s/%s.%s.%s' % (folder, stem, sha(raw)[:10], ext), raw


def seo_cut(index_file, buckets):
    node = shutil.which('node')
    if not node:
        raise SystemExit('shards: node is not on this machine, and the crawler pages are cut by worker/seo.js')
    r = subprocess.run([node, str(ROOT / 'tools' / 'seoshards.mjs'), str(buckets), str(index_file)],
                       cwd=str(ROOT), capture_output=True)
    if r.returncode:
        raise SystemExit('shards: tools/seoshards.mjs stopped: ' + r.stderr.decode('utf-8', 'replace')[-400:])
    return json.loads(r.stdout.decode('utf-8'))


def build(index_file=DATA / 'index.json'):
    """Every file, as {path: bytes}, and the manifest."""
    raw = Path(index_file).read_bytes()
    index = json.loads(raw)
    ident = sha(raw)[:12]
    items = index['items']
    keys = index.get('lxk') or []
    files = {}

    def put(name, data, folder):
        path, b = named(name, data, folder)
        files[path] = b
        return {'file': path, 'bytes': len(b)}

    order = []
    for it in items:
        if order and order[-1][0] == it['k']:
            order[-1][1] += 1
        else:
            order.append([it['k'], 1])
    up = index.get('up')
    if up is None:   # not every tool that writes the index carries the ladders: the core keeps the last ones
        try:
            up = json.loads((DATA / 'index-core.json').read_text(encoding='utf-8')).get('up') or []
        except (OSError, ValueError):
            up = []
    meta = {
        'id': ident, 'v': index.get('v'), 'gen': index.get('gen'), 'sprites': sheets(index.get('sprites')),
        'imgs': index.get('imgs') or {}, 'ws': index.get('ws') or '', 'up': up,
        'kwx': index.get('kwx') or {}, 'ix': index.get('ix') or {}, 'lxk': keys,
        # the market's currency by these names is an index card's price row, never a card of its own
        'named': sorted({'c:' + it['n'] for it in items if it['k'] in NAMED}),
        # the lineage support gems: the market lists them too, and its row borrows the gem card's text
        'li': sorted({it['n'] for it in items if it['k'] == 'g' and it.get('li')}),
        'lt': {it['n']: it['t'] for it in items if it['k'] == 'g' and it.get('li') and it.get('t')},
    }
    kinds = {}
    for k, _ in order:
        if k in kinds:
            continue
        mine = [it for it in items if it['k'] == k]
        cards = [card_of(it) for it in mine]
        rows = [search_row(it, c, keys) for it, c in zip(mine, cards)]
        chunks, cur, size = [], [], 0
        for c in cards:
            n = len(body(c).encode('utf-8')) + 1
            if cur and size + n > CARD_BYTES:
                chunks.append(cur)
                cur, size = [], 0
            cur.append(c)
            size += n
        if cur:
            chunks.append(cur)
        entry = {'n': len(mine), 'search': put(k + '.json', body(packed(k, rows)), 'data/search'), 'cards': []}
        at = 0
        for i, ch in enumerate(chunks):
            f = put('%02d.json' % i, body(packed(k, ch, {'from': at})), 'data/cards/' + k)
            f['n'] = len(ch)
            entry['cards'].append(f)
            at += len(ch)
        kinds[k] = entry

    total = len(raw)
    buckets = max(1, round(total / SEO_BYTES))
    cut = seo_cut(index_file, buckets)
    seo = {'base': put('base.json', body(cut['base']), 'data/seo'), 'lists': {}, 'words': {}, 'items': {'files': []}}
    for k, rows in cut['lists'].items():
        seo['lists'][k] = put(k + '.json', body(rows), 'data/seo/list')
    for k, text in cut['words'].items():   # cut where one entry ends, about WORDS_BYTES a file
        seo['words'][k], cur = [], []
        for e in text.split(ENTRY) if text else []:
            if cur and len(ENTRY.join(cur + [e]).encode('utf-8')) > WORDS_BYTES:
                seo['words'][k].append(put('%s%02d.txt' % (k, len(seo['words'][k])), ENTRY.join(cur), 'data/seo/words'))
                cur = []
            cur.append(e)
        if cur:
            seo['words'][k].append(put('%s%02d.txt' % (k, len(seo['words'][k])), ENTRY.join(cur), 'data/seo/words'))
    for i, box in enumerate(cut['items']):
        seo['items']['files'].append(put('%02d.json' % i, body(box), 'data/seo/item'))

    man = {
        'id': ident, 'v': index.get('v'), 'gen': index.get('gen'),
        'patch': re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', index.get('v') or ''),
        'source': 'data/index.json: the game files (tools/sync.py and the pipeline stages after it), cut by tools/shards.py',
        'order': order, 'meta': put('meta.json', body(meta), 'data/cards'), 'kinds': kinds, 'seo': seo,
    }
    return man, files


def files_of(man):
    """Every file a manifest names, wherever it names one ({"file": path})."""
    out = []
    def walk(v):
        if isinstance(v, dict):
            if isinstance(v.get('file'), str):
                out.append(v['file'])
            for x in v.values():
                walk(x)
        elif isinstance(v, list):
            for x in v:
                walk(x)
    walk(man)
    return out


def stale():
    """Why the files here are not of this data/index.json, or None."""
    try:
        man = json.loads((DATA / 'manifest.json').read_text(encoding='utf-8'))
    except (OSError, ValueError):
        return 'data/manifest.json is not there: run python tools/shards.py'
    ident = sha((DATA / 'index.json').read_bytes())[:12]
    if man.get('id') != ident:
        return 'data/manifest.json is of another data/index.json (%s, not %s): run python tools/shards.py' % (man.get('id'), ident)
    gone = [f for f in files_of(man) if not (ROOT / f).exists()]
    if gone:
        return '%d files data/manifest.json names are not there (%s): run python tools/shards.py' % (len(gone), gone[0])
    return None


def write():
    man, files = build()
    for path, b in files.items():
        p = ROOT / path
        p.parent.mkdir(parents=True, exist_ok=True)
        if not p.exists() or p.read_bytes() != b:
            lastgood.save(p, b.decode('utf-8'))
    lastgood.save(DATA / 'manifest.json', body(man))   # read before every search: kept short
    # a file an older cut named goes: nothing names it now, and it would ship
    keep = set(files)
    gone = 0
    for d in DIRS:
        for p in sorted((ROOT / d).rglob('*')) if (ROOT / d).exists() else []:
            if p.is_file() and p.relative_to(ROOT).as_posix() not in keep:
                p.unlink()
                gone += 1
    kb = lambda n: '%d KB' % (n // 1024)
    search = sum(k['search']['bytes'] for k in man['kinds'].values())
    cards = sum(c['bytes'] for k in man['kinds'].values() for c in k['cards'])
    seo = sum(len(b) for p, b in files.items() if p.startswith('data/seo/'))
    print('data/manifest.json %d kinds, %d cards: search rows %s in %d files, cards %s in %d files, meta %s, '
          'crawler %s in %d files%s' % (
              len(man['kinds']), sum(k['n'] for k in man['kinds'].values()), kb(search), len(man['kinds']), kb(cards),
              sum(len(k['cards']) for k in man['kinds'].values()), kb(man['meta']['bytes']), kb(seo),
              sum(1 for p in files if p.startswith('data/seo/')), (', %d old files removed' % gone) if gone else ''))


if __name__ == '__main__':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except (AttributeError, ValueError):
        pass
    if '--check' in sys.argv[1:]:
        why = stale()
        print(('FAIL ' + why) if why else 'ok   data/manifest.json and every file it names are of this data/index.json')
        sys.exit(1 if why else 0)
    write()
