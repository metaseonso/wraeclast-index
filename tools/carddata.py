"""Everything a card can say, joined onto the index the cards are built from.

The cards draw whatever their index entry carries (assets/kinds.js). Four things the site already ships were
never joined onto the entry, so no card could draw them:

  qt  the game's own flavour line, for uniques and keystones — data/explore/uniques.*.json and
      data/explore/tree.*.json already show it on the drill-down page, one panel at a time. Where neither has
      one, the game's flavour file (flavour.min.json, by art id, through tools/gamepull.py): a unique by its one
      piece of art (uniques.min.json), and a base item, gem or Atlas item by its own (base_items.min.json) —
      never art a unique lends a base, whose words are the unique's
  lim "Limited to 1", for the uniques the game limits
  t   what an Atlas key or item is for — data/atlas.json carries the sentence, data/info.json a few more
  cw  how many mods can roll on a base item and whether their weights are measured (data/craft)
  ix  the official text for a name the market prices but no card covers, where the market file itself has
      none: it goes in the rest, so the popup can fill in a priced card that would otherwise say nothing
  did a currency card's address word, the key its daily market file is kept under (data/market.json's `did`,
      else the same rule on the name: tools/marketlib.py did), so its market fields can find it

Reads files this repo already ships, and for the flavour lines they lack, the game's own flavour file. Writes data/index.json, then the two parts the app loads
(tools/appdata.py). Run it after tools/sync.py, tools/atlas.py or tools/craft.py have written theirs:

    python tools/carddata.py
"""
import glob
import json
import re
from collections import Counter
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
    more = game_flavour(index)
    return ('uniques %d flavour, %d limited {DOT} passives %d flavour {DOT} %s'.replace('{DOT}', DOT)
            % (n, lim, k, more))


FLAVOUR_KINDS = ('u', 'b', 'g', 'a', 'c')   # the cards an item's own art stands behind


def game_flavour(index):
    """qt from the game's flavour file, for a card the drill-down's files give none. The file is keyed by art id:
    a unique's is its one piece of art (a unique with several, each with its own words, is left alone), anything
    else's is its base item's. Art a unique lends a base ("FourUniqueBodyStrInt14" on Ancient Mail) carries the
    unique's words, so it is never a base's."""
    try:
        from gamepull import official
        fl = {k.rstrip('_'): v for k, v in official('flavour.min.json').items()}
        uniq, bases = official('uniques.min.json'), official('base_items.min.json')
    except (Exception, SystemExit) as e:   # the export out of reach: the cards keep what the files above gave
        return 'the game\'s flavour file: not read (%s)' % e
    def art(vid):
        vid = (vid or '').rstrip('_')
        return fl.get(vid) or fl.get(re.sub(r'_+[a-z]$', '', vid).rstrip('_'))
    by_unique, by_base = {}, {}
    for u in uniq.values():
        if not u.get('is_alternate_art'):
            by_unique.setdefault(u['name'], set()).add(art((u.get('visual_identity') or {}).get('id')))
    for b in bases.values():
        vid = (b.get('visual_identity') or {}).get('id') or ''
        if b.get('name') and b.get('release_state') == 'released' and 'Unique' not in vid:
            by_base.setdefault(b['name'], set()).add(art(vid))
    got = Counter()
    for it in index['items']:
        if it['k'] not in FLAVOUR_KINDS or it.get('qt'):
            continue
        said = (by_unique if it['k'] == 'u' else by_base).get(it['n']) or set()
        said.discard(None)
        said.discard('')
        if len(said) == 1:
            it['qt'] = plain(said.pop().replace('\r\n', '\n'))
            got[it['k']] += 1
    return 'the game\'s flavour file %d more (%s)' % (sum(got.values()),
                                                     ', '.join('%d %s' % (n, k) for k, n in sorted(got.items())))


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


def tree_changes(index):
    """tc and wa: what the patches in data/treechanges/ did to the nodes a passive card holds (#87).

    tools/treeexport.py writes one file per patch, each node by the tree's own number. The drill-down's tree
    (data/explore/tree.*.json) joins that number to the node's game id, which is a notable's or a keystone's
    card id; a small passive's card holds every node with its name and effect, so those are joined by the two.
    Per card, the newest step that did each thing: tc {nw: the patch it was added in, ch: the patch it was
    last reworded or moved in, wn: its name before that}, wa: its lines before the newest reword that changed
    them. A card holding more nodes than changed says how many ("0.5.1 (2 of 12)"). A node gone from the tree
    has no card, so a removed one draws nothing. The number is never drawn (#12)."""
    try:
        ix = load('treechanges/index.json')
    except FileNotFoundError:
        return 'tree changes: none'
    tree = one('explore/tree.*.json') or {'passives': []}
    effect = lambda node: frozenset(plain(y) for x in node.get('t') or [] for y in x.split('\n') if y.strip())
    by_id, by_line = {}, {}
    for it in index['items']:
        if it['k'] != 'p':
            continue
        it.pop('tc', None)
        it.pop('wa', None)
        by_id[it['id']] = it
        if it.get('lo'):
            by_line[(it['n'], frozenset(it.get('ls') or []))] = it
    card_of, held = {}, Counter()
    for node in tree['passives']:
        it = by_id.get(node.get('id')) or by_line.get(((node.get('n') or '').strip(), effect(node)))
        if it:
            card_of[node['h']] = it
            held[id(it)] += 1
    got = {}   # id(card) -> {what: [patch, nodes, extra]}
    for step in ix.get('steps') or []:
        try:
            f = load(step['file'])
        except FileNotFoundError:
            continue
        v = step['to']
        for what, rows in (('nw', f.get('added')), ('ch', f.get('reworded')), ('ch', f.get('moved'))):
            for row in rows or []:
                it = card_of.get(row.get('id'))
                if not it:
                    continue
                g = got.setdefault(id(it), {'it': it})
                was = g.get(what)
                if not was or was[0] != v:
                    g[what] = [v, set()]
                g[what][1].add(row['id'])
                old = row.get('was') or {}
                if old.get('n') and old['n'] != it['n']:
                    g['wn'] = old['n']
                if old.get('ls'):
                    g['wa'] = [plain(x) for x in old['ls']]
    n = Counter()
    for g in got.values():
        it = g['it']
        tc = {}
        for what in ('nw', 'ch'):
            if what in g:
                v, nodes = g[what]
                of = held[id(it)]
                tc[what] = v + (' (%d of %d)' % (len(nodes), of) if of > 1 and len(nodes) < of else '')
                n[what] += 1
        if g.get('wn'):
            tc['wn'] = g['wn']
            n['wn'] += 1
        if g.get('wa') and g['wa'] != it.get('ls'):
            it['wa'] = g['wa']
            n['wa'] += 1
        if tc:
            it['tc'] = tc
    return 'passives: %d new, %d changed, %d renamed, %d with old lines (tree changes %s to %s)' % (
        n['nw'], n['ch'], n['wn'], n['wa'], (ix.get('steps') or [{}])[0].get('from', '?'), ix.get('latest', '?'))


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


def market_ids(index):
    """did: a currency card's address word, the key of its part in the daily market files (tools/market_history.py
    names each card file by it). The market's own currency cards carry theirs from data/market.json; an index
    currency card gets the same word here, by the same rule."""
    from marketlib import did
    try:
        market = load('market.json')
    except FileNotFoundError:
        market = {'items': {}}
    dids = {m['n']: m['did'] for m in (market.get('items') or {}).values() if m.get('n') and m.get('did')}
    n = 0
    for it in index['items']:
        if it['k'] == 'c':
            it['did'] = did(it['n'], dids)
            n += 1
    return 'currency %d with a market address' % n


def main():
    index = load('index.json')
    said = [flavour(index), atlas_text(index), weights(index), tree_changes(index), market_text(index), market_ids(index)]
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json ' + str(len(body.encode('utf-8')) // 1024) + ' KB ' + DOT + ' ' + (' ' + DOT + ' ').join(said))
    appdata.write(index)


if __name__ == '__main__':
    main()
