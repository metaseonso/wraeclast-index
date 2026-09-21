"""The search index in two parts, for a fast first page (tools/sync.py and tools/kwuse.py run this after they write
data/index.json; run it by hand after editing data/index.json):

  data/index-core.json   what the home page's first cards need: the uniques and the currency cards, the index's
                         own details (version, sprites, image servers), the order of every kind, and the names the
                         rest has cards for (so a price in the market file is never shown on the wrong card)
  data/index-rest.json   everything else: gems, passives, keywords, bases and the Atlas, the keystone keywords,
                         and each core card's keyword chips

The home page shows its first cards as soon as the core and the prices are in; search, the popups and the other
tabs wait for the rest (assets/app.js). Both parts carry the same id (from data/index.json), so the page never mixes
two versions. data/index.json itself stays whole: the crawler pages (worker/seo.js) and the tools read it.

Shorter than the index: items are grouped by kind (no "k" on each), "id" is left out where it equals the name, and
the references in the lines ("lx", tools/nodelinks.py) point into a key table each part builds for itself ("lxk"),
so a file only carries the node keys it uses.

Usage:  python tools/appdata.py
"""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CORE_KINDS = ('u', 'c')   # uniques and currency: every card the home page's "biggest price moves" can show


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


def split(index, raw):
    ident = hashlib.sha1(raw).hexdigest()[:12]
    runs = []   # the index's order: [kind, how many], so the page puts every card back where it was
    for it in index['items']:
        if runs and runs[-1][0] == it['k']:
            runs[-1][1] += 1
        else:
            runs.append([it['k'], 1])
    core = {'id': ident, 'v': index.get('v'), 'gen': index.get('gen'), 'sprites': index.get('sprites'),
            'imgs': index.get('imgs'), 'order': runs,
            # the market's currency by these names belongs to a card in the rest (an atlas item), or is a lineage gem
            'skip': sorted({it['n'] for it in index['items'] if it['k'] == 'a'}),
            'li': sorted({it['n'] for it in index['items'] if it['k'] == 'g' and it.get('li')})}
    rest = {'id': ident, 'kwx': index.get('kwx') or {}, 'ckw': {}}
    keys = index.get('lxk') or []
    tables = {'core': ([], {}), 'rest': ([], {})}
    for it in index['items']:
        k = it['k']
        o = {f: v for f, v in it.items() if f != 'k' and not (f == 'id' and v == it['n'])}
        if o.get('lx'):
            table, at = tables['core' if k in CORE_KINDS else 'rest']
            o['lx'] = renumber(o['lx'], keys, table, at)
        if k in CORE_KINDS:
            if o.get('kw'):   # keyword chips show in the popup, which waits for the rest
                rest['ckw'][k + ':' + it['id']] = o.pop('kw')
            core.setdefault(k, []).append(o)
        else:
            rest.setdefault(k, []).append(o)
    for name, part in (('core', core), ('rest', rest)):
        if tables[name][0]:
            part['lxk'] = tables[name][0]
    return core, rest


def write(index=None):
    f = ROOT / 'data' / 'index.json'
    raw = f.read_bytes()
    if index is None:
        index = json.loads(raw)
    core, rest = split(index, raw)
    sizes = []
    for name, part in (('index-core.json', core), ('index-rest.json', rest)):
        body = json.dumps(part, ensure_ascii=False, separators=(',', ':'))
        (ROOT / 'data' / name).write_text(body, encoding='utf-8')
        sizes.append('%s %d KB' % (name, len(body.encode('utf-8')) // 1024))
    print('data/' + ', data/'.join(sizes))


if __name__ == '__main__':
    write()
