"""Build data/market/: what GGG's Currency Exchange feed says about the market, measured over every hour since the
PoE2 launch, in small files the site fetches when a card or a tab asks for one. Measured history only: nothing here
forecasts a price, and nothing is an expected value.

Reads the exchange archive (WI_CX, default wraeclast-data/cx beside the repo, private) through tools/cxlib.py, which
values every hour one way, the way tools/exchange.py and tools/mechanics_league.py (#148) do: what a thing traded
for in Divine, Exalted or Chaos Orbs, in exalted at that hour's own rates. The leagues, league days and prices are
tools/marketlib.py's. Names are the game's own (BaseItemTypes, WI_GAME_OUT): no file here carries an internal id
(#12). Every file carries its source, the Subject to change flag, when it was built to (the last hour read), the
rule it was built by in words, and that rule's numbers. The owner decides the numbers
(design/market-products.md).

Each product is a module of its own (tools/market_<product>.py), listed in PRODUCTS in the order they build; a later
one may read what an earlier one built (ctx.done). A product writes its own files, and hands a card its part
(ctx.card), which this puts together into one file per currency card:
  data/market/index.json            every file with its bytes, and the leagues read
  data/market/card/<did>.json       one per currency the league's exchange has priced, named by the did
                                    data/market.json gives the card: each product's part for that card

    python tools/market_history.py                 every product, and the cards
    python tools/market_history.py rising gap      only those products' own files (and index.json); cards untouched

Runs as the pipeline's markethistory stage (tools/pipeline.py, daily). Without the archive it writes nothing, keeps
the files already here, and says so.
"""
import json
import sys

import cxlib
import marketlib as ml
import sitedata

INDEX = 'data/market/index.json'
CARDS = 'data/market/card/'
PRODUCTS = []      # the product modules, in build order: each ticket's product adds itself here


class Ctx:
    """What a product builds from: the archive, the names, the leagues, the league still running, the cards' did
    words, data/patches.json's rows, and what the products before it built."""

    def __init__(self, cx, names, ls, dids, patches):
        self.cx, self.names, self.ls, self.dids, self.patches = cx, names, ls, dids, patches
        self.cur, self.hc = ls[-1]
        self.updated = ml.when(self.cur.last)
        self.done, self.cards = {}, {}

    def card(self, name, part, value):
        self.cards.setdefault(name, {})[part] = value


def write(rel, obj, written):
    """Write one file where it changed; note its bytes either way."""
    p = sitedata.DATA / rel[len('data/'):]          # data/ here, or WI_DATA_DIR on the data server
    text = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
    p.parent.mkdir(parents=True, exist_ok=True)
    if not p.exists() or p.read_text(encoding='utf-8') != text:
        sitedata.save(p, text)
    written[rel] = len(text.encode('utf-8'))


def tables():
    """The decoded game tables: WI_GAME_OUT, else the newest patch folder under wraeclast-data/game."""
    g = cxlib.home('WI_GAME_OUT', 'game')
    if (g / 'raw').exists():
        return g
    return g / sorted(p.name for p in g.iterdir() if p.is_dir())[-1] / 'out'


def main(argv):
    want = [a for a in argv if not a.startswith('-')]
    cx = cxlib.home('WI_CX', 'cx')
    if not (cx / 'derived' / 'leagues.json').exists():
        print('no exchange archive at %s: data/market/ stays as it is' % cx)
        return 0
    names = cxlib.names(tables())
    ls = ml.leagues(cx, names)
    dids = {v['n']: v['did'] for v in ml.load(ml.ROOT / 'data' / 'market.json')['items'].values() if v.get('did')}
    patches = ml.load(ml.ROOT / 'data' / 'patches.json')['patches']
    ctx = Ctx(cx, names, ls, dids, patches)
    written = {}
    idx_path = ml.ROOT / INDEX
    old = ml.load(idx_path) if idx_path.exists() else {}
    for mod in PRODUCTS:
        files = mod.build(ctx)
        ctx.done[mod.KEY] = files
        if want and mod.KEY not in want:
            continue
        for rel, obj in files.items():
            obj = dict(obj)
            obj['updated'] = ctx.updated
            write(rel, obj, written)
    cards = {}
    if not want and ctx.cards:
        seen = set()
        for n in sorted(ctx.cards):
            e = {'n': n, 'source': ml.SOURCE, 'flags': ml.FLAGS, 'updated': ctx.updated,
                 'rules': {part: mod.FILE for mod in PRODUCTS for part in getattr(mod, 'PARTS', ())
                           if part in ctx.cards[n]}}
            e.update(ctx.cards[n])
            rel = CARDS + ml.did(n, dids) + '.json'
            write(rel, e, cards)
            seen.add(rel)
        for p in (ml.ROOT / CARDS).glob('*.json'):
            if CARDS + p.name not in seen:
                p.unlink()
    files = {k: v for k, v in (old.get('files') or {}).items() if (ml.ROOT / k).exists()}
    files.update(written)
    index = {'source': ml.SOURCE, 'flags': ml.FLAGS, 'updated': ctx.updated,
             'note': 'Written by tools/market_history.py from the Currency Exchange archive. Each file with its bytes; '
                     'the site fetches one when a card or a tab asks for it.',
             'leagues': [{'name': s.name, 'v': s.v, 'first': ml.when(s.first), 'last': ml.when(s.last),
                          'hours': len(s.hours), 'days': s.day(s.last), 'left': s.left,
                          'hardcore': h.archive if h else None} for s, h in ls],
             'files': dict(sorted(files.items())),
             'cards': ({'files': len(cards), 'bytes': sum(cards.values()), 'largest': max(cards.values())}
                       if cards else old.get('cards'))}
    write(INDEX, index, written)
    for k, v in sorted(written.items()):
        print('%-36s %8.1f kB' % (k, v / 1000))
    if cards:
        print('%-36s %8.1f kB in %d files, largest %.1f kB' % (CARDS + '*.json', sum(cards.values()) / 1000, len(cards),
                                                               max(cards.values()) / 1000))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
