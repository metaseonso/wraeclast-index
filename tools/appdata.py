"""The search index in two parts, for a fast first page (tools/sync.py and tools/kwuse.py run this after they write
data/index.json; run it by hand after editing data/index.json):

  data/index-core.json   what the home page's first cards need: the uniques and the currency cards, the index's
                         own details (version, sprites, image servers), the order of every kind, and the names the
                         rest has cards for (so a price in the market file is never shown on the wrong card)
  data/index-rest.json   everything else: gems, passives, keywords, bases and the Atlas, the keystone keywords,
                         each core card's keyword chips and flavour line, and the official text for a priced
                         name no card covers

The page asks for both only once it needs them (a search, a card, another tab, or the home page sitting idle:
assets/app.js need()); search, the popups and the other tabs wait for the rest. Both parts carry the same id (from
data/index.json), so the page never mixes two versions. data/index.json itself stays whole: the crawler pages
(worker/seo.js) and the tools read it. The core also names each sprite sheet's small copy ("lo", tools/sprites.py).

Shorter than the index: items are grouped by kind (no "k" on each), "id" is left out where it equals the name, and
the references in the lines ("lx", tools/nodelinks.py) point into a key table each part builds for itself ("lxk"),
so a file only carries the node keys it uses.

Every word said many times is said once ("dict"). A field whose every value is a string or a list of strings, and
that repeats enough to be worth it (a picture shared by 700 keywords, a region, a sub line, a keyword chip, a
recipe's oils, a line many passives share), keeps its words in one list per part, and each card carries numbers
into it: a string becomes one number, a list of strings a list of numbers. The commonest words get the smallest
numbers. assets/app.js puts the words back as it reads the part, before anything else sees a card. The index
itself is untouched: the crawler pages and the tools read the words as they are.

A gem's "q" is the game's own tag list, lower case, for search only. The words its tags already show are left
out, and so is anything with an underscore in it (grants_active_skill: an internal id, never a word a player
types). What is left is a word the card does not show but a player may search for: area, strength, stages.

Usage:  python tools/appdata.py
"""
import hashlib
import json
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
CORE_KINDS = ('u', 'c')   # uniques and currency: the part of the index that loads first


def renumber(lx, keys, table, at):
    """A card's references, pointed at this part's own key table instead of the whole index's."""
    out = []
    for spans in lx:
        if not spans:
            out.append(0)
            continue
        row = []
        for start, n, i in spans:
            key = keys[i]
            if key not in at:
                at[key] = len(table)
                table.append(key)
            row.append([start, n, at[key]])
        out.append(row)
    return out


def gem_words(it):
    """The search words a gem's own tag list adds to what its tags already say (see above)."""
    shown = set(' '.join(it.get('tags') or []).lower().split())
    return ' '.join(w for w in (it.get('q') or '').split() if w not in shown and '_' not in w)


PLAIN = ('id', 'n', 'lx')   # never put in the dict: what a card is looked up by, and its line references
WORTH = 1000                # bytes a field must save before it is put in the dict


def pack(part, kinds, extra=None):
    """Put each field worth it into the part's dict (see above). extra: {field: [values]} held elsewhere in the
    part (the core cards' keyword chips, in the rest) that share the field's list and are numbered with it."""
    vals = {}
    for k in kinds:
        for it in part.get(k) or []:
            for f, v in it.items():
                vals.setdefault(f, []).append(v)
    for f, more in (extra or {}).items():
        vals.setdefault(f, []).extend(more)
    size = lambda s: len(json.dumps(s, ensure_ascii=False)) + 1
    words = lambda v: [v] if isinstance(v, str) else v
    table = {}
    for f, vs in sorted(vals.items()):
        if f in PLAIN or not all(isinstance(v, str) or (isinstance(v, list) and all(isinstance(x, str) for x in v)) for v in vs):
            continue
        count = {}
        for v in vs:
            for w in words(v):
                count[w] = count.get(w, 0) + 1
        order = sorted(count, key=lambda w: (-count[w], w))
        at = {w: i for i, w in enumerate(order)}
        now = sum(size(w) * c for w, c in count.items())
        then = sum(size(w) for w in order) + sum(len(str(at[w])) + 1 for w, c in count.items() for _ in range(c))
        if now - then >= WORTH:
            table[f] = (order, at)
    code = lambda f, v: table[f][1][v] if isinstance(v, str) else [table[f][1][w] for w in v]
    for k in kinds:
        for it in part.get(k) or []:
            for f in it:
                if f in table:
                    it[f] = code(f, it[f])
    if table:
        part['dict'] = {f: order for f, (order, _) in sorted(table.items())}
    return lambda f, v: code(f, v) if f in table else v


def sheets(sprites):
    """The sprite sheets, each with its small copy for a screen of one pixel per point ("lo") where there is one
    (tools/sprites.py makes them)."""
    if not sprites:
        return sprites
    out = {}
    for name, sp in sprites.items():
        lo = sp['file'][:-len('.webp')] + '-1x.webp' if str(sp.get('file', '')).endswith('.webp') else ''
        out[name] = dict(sp, lo=lo) if lo and (ROOT / 'sprites' / lo).exists() else sp
    return out


def split(index, raw):
    ident = hashlib.sha1(raw).hexdigest()[:12]
    runs = []   # the index's order: [kind, how many], so the page puts every card back where it was
    for it in index['items']:
        if runs and runs[-1][0] == it['k']:
            runs[-1][1] += 1
        else:
            runs.append([it['k'], 1])
    core = {'id': ident, 'v': index.get('v'), 'gen': index.get('gen'), 'sprites': sheets(index.get('sprites')),
            'imgs': index.get('imgs'), 'order': runs, 'ws': index.get('ws') or '',
            'up': index.get('up') or [],   # the orb upgrade ladders: in the first paint, about 0.3 kB
            # the market's currency by these names belongs to a card in the rest (an atlas item), or is a lineage gem
            'skip': sorted({it['n'] for it in index['items'] if it['k'] == 'a'}),
            'li': sorted({it['n'] for it in index['items'] if it['k'] == 'g' and it.get('li')})}
    rest = {'id': ident, 'kwx': index.get('kwx') or {}, 'ckw': {}, 'cqt': {}, 'ws': index.get('ws') or '',
            # the official text for a name the market prices but no card covers (tools/carddata.py)
            'ix': index.get('ix') or {}}
    keys = index.get('lxk') or []
    tables = {'core': ([], {}), 'rest': ([], {})}
    for it in index['items']:
        k = it['k']
        o = {f: v for f, v in it.items() if f != 'k' and not (f == 'id' and v == it['n'])}
        if k == 'g' and 'q' in o:
            o['q'] = gem_words(it)
            if not o['q']:
                del o['q']
        if o.get('lx'):
            table, at = tables['core' if k in CORE_KINDS else 'rest']
            o['lx'] = renumber(o['lx'], keys, table, at)
        if k in CORE_KINDS:
            if o.get('kw'):   # keyword chips show in the popup, which waits for the rest
                rest['ckw'][k + ':' + it['id']] = o.pop('kw')
            if o.get('qt'):   # the flavour line, likewise: it keeps the core under the size the first cards need
                rest['cqt'][k + ':' + it['id']] = o.pop('qt')
            core.setdefault(k, []).append(o)
        else:
            rest.setdefault(k, []).append(o)
    for name, part in (('core', core), ('rest', rest)):
        if tables[name][0]:
            part['lxk'] = tables[name][0]
    kinds = [k for k, _ in runs]
    pack(core, kinds)
    code = pack(rest, kinds, {'kw': list(rest['ckw'].values())})
    rest['ckw'] = {key: code('kw', kw) for key, kw in rest['ckw'].items()}
    return core, rest


def write(index=None):
    f = ROOT / 'data' / 'index.json'
    raw = f.read_bytes()
    if index is None:
        index = json.loads(raw)
    if 'up' not in index:
        # the orb ladders are joined on by tools/carddata.py, and not every tool that writes data/index.json
        # carries them: an index without them keeps the ones the core already has
        try:
            index['up'] = json.loads((ROOT / 'data' / 'index-core.json').read_text(encoding='utf-8')).get('up') or []
        except (OSError, ValueError):
            pass
    core, rest = split(index, raw)
    sizes = []
    for name, part in (('index-core.json', core), ('index-rest.json', rest)):
        body = json.dumps(part, ensure_ascii=False, separators=(',', ':'))
        lastgood.save(ROOT / 'data' / name, body)   # in one step: the home page never reads half of one
        sizes.append('%s %d KB' % (name, len(body.encode('utf-8')) // 1024))
    print('data/' + ', data/'.join(sizes))


if __name__ == '__main__':
    write()
