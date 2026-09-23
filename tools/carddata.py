"""Everything a card can say, joined onto the index the cards are built from.

The cards draw whatever their index entry carries (assets/kinds.js). Four things the site already ships were
never joined onto the entry, so no card could draw them:

  qt  the game's own flavour line, for uniques and keystones — data/explore/uniques.*.json and
      data/explore/tree.*.json already show it on the drill-down page, one panel at a time
  lim "Limited to 1", for the uniques the game limits
  t   what an Atlas key or item is for — data/atlas.json carries the sentence, data/info.json a few more
  cw  how many mods can roll on a base item and whether their weights are measured (data/craft)
  ix  the official text for a name the market prices but no card covers, where the market file itself has
      none: it goes in the rest, so the popup can fill in a priced card that would otherwise say nothing

Reads only files this repo already ships. Writes data/index.json, then the two parts the app loads
(tools/appdata.py). Run it after tools/sync.py, tools/atlas.py or tools/craft.py have written theirs:

    python tools/carddata.py
"""
import glob
import json
import re
from pathlib import Path

import appdata
import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DOT = '·'


def plain(t):
    """Game keyword markup [Id|Shown] or [Id] to plain words (the same rule as tools/sync.py)."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    t = re.sub(r'\[([^\]]+)\]', r'\1', t)
    return re.sub(r'\s+', ' ', t).strip()


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def one(pattern):
    """The drill-down page's data file, whose name carries the hash of its contents."""
    hits = sorted(glob.glob(str(DATA / pattern)))
    return json.loads(Path(hits[-1]).read_text(encoding='utf-8')) if hits else None


def base_of(it):
    """A unique's base item, as its entry says it: "Shortsword {DOT} One Hand Sword"."""
    return (it.get('s') or '').split(DOT)[0].strip()


def flavour(index):
    """qt: the game's flavour line, and lim: the copies the game allows."""
    uq = one('explore/uniques.*.json') or {'items': []}
    by = {}
    for u in uq['items']:
        by[(u['n'], u.get('b') or '')] = u
    n = lim = 0
    for it in index['items']:
        if it['k'] != 'u':
            continue
        u = by.get((it['n'], base_of(it)))
        if not u:
            continue
        if u.get('fl'):
            it['qt'] = plain(u['fl'])
            n += 1
        if u.get('lim'):
            it['lim'] = u['lim']
            lim += 1
    tree = one('explore/tree.*.json') or {'passives': []}
    fl = {p['n']: p['f'] for p in tree['passives'] if p.get('f')}
    k = 0
    for it in index['items']:
        if it['k'] == 'p' and it['n'] in fl:
            it['qt'] = plain(fl[it['n']])
            k += 1
    return 'uniques %d flavour, %d limited {DOT} passives %d flavour'.replace('{DOT}', DOT) % (n, lim, k)


def atlas_text(index):
    """t: what an Atlas key or item is for."""
    at = load('atlas.json')
    info = load('info.json')
    said = {}
    for row in list(at.get('keys') or []) + list(at.get('items') or []):
        if row.get('t'):
            said[row['n']] = plain(row['t'])
    n = 0
    for it in index['items']:
        if it['k'] != 'a' or it.get('t'):
            continue
        t = said.get(it['n']) or (info.get(it['n']) or {}).get('t')
        if t:
            it['t'] = plain(t)
            n += 1
    return 'atlas %d descriptions' % n


def ladders(index, craft):
    """up: the orb upgrade ladders — [plain, [Greater, level], [Perfect, level]] — five of them.

    The game's own description is identical on all three steps of a ladder ("Augments a Rare item with a new
    random modifier" on the Exalted Orb, the Greater and the Perfect alike), so nothing a player reads says
    what the upgrade buys. The lowest modifier level each step guarantees is read from poe2db, and the card
    names that source beside it. It is about 0.3 kB, so it rides in the first paint rather than costing a
    fetch, and the prices the card puts beside it are ones the page already has."""
    index['up'] = [[o['n']] + [[u[0], u[1]] for u in (o.get('up') or [])]
                   for o in (craft.get('orbs') or []) if o.get('up')]


def weights(index):
    """cw: [prefixes, suffixes, 1 if the weights are measured] for a base item.

    A base rolls from one pool (data/craft/<class>.json). The mods in that pool are counted per side; the
    pool's weights are the measured ones (data/craft.json names who measured them)."""
    n = meas = 0
    craft = load('craft.json')
    index['ws'] = ((craft.get('wsrc') or {}).get('n') or '')   # who measured them, named on the card
    ladders(index, craft)
    for f in sorted(glob.glob(str(DATA / 'craft' / '*.json'))):
        cls = json.loads(Path(f).read_text(encoding='utf-8'))
        pools, fam, mods = cls.get('pools') or [], cls.get('fam') or [], cls.get('mods') or []
        sides = []
        for p in pools:
            side = {'p': 0, 's': 0}
            for i in p.get('m') or []:
                a = fam[mods[i][1]][0] if mods[i][1] < len(fam) else ''
                if a in side:
                    side[a] += 1
            w = p.get('w') or []
            sides.append([side['p'], side['s'], 1 if any(w) else 0])
        by = {b['n']: sides[b.get('p') or 0] for b in cls.get('bases') or [] if (b.get('p') or 0) < len(sides)}
        for it in index['items']:
            if it['k'] == 'b' and it['n'] in by:
                it['cw'] = by[it['n']]
                n += 1
                meas += by[it['n']][2]
    return 'bases %d with a mod count, %d of them measured' % (n, meas)


def market_text(index):
    """ix: the official text for a priced name no card covers, where the market file has none itself."""
    carded = {it['n'] for it in index['items']}
    info = load('info.json')
    at = load('atlas.json')
    said = dict(info and {k: v.get('t') for k, v in info.items() if v.get('t')} or {})
    for row in list(at.get('keys') or []) + list(at.get('items') or []):
        if row.get('t'):
            said[row['n']] = row['t']
    try:
        market = load('market.json')
    except FileNotFoundError:
        market = {'items': {}}
    ix = {}
    for m in (market.get('items') or {}).values():
        n = m.get('n')
        if n and not m.get('u') and n not in carded and said.get(n):
            ix[n] = plain(said[n])
    index['ix'] = ix
    return 'priced names with no card of their own %d' % len(ix)


def main():
    index = load('index.json')
    said = [flavour(index), atlas_text(index), weights(index), market_text(index)]
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json ' + str(len(body.encode('utf-8')) // 1024) + ' KB ' + DOT + ' ' + (' ' + DOT + ' ').join(said))
    appdata.write(index)


if __name__ == '__main__':
    main()
