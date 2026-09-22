"""Two things the passive tree's own data already ships that a player could not reach: the small passives, and
the conquerors a timeless jewel rolls.

The drill-down page carries more than the index does (data/explore/), and these two were only there:

  small passives  3,760 small nodes sit on the tree. 3,265 of them have a name and an effect, and those are
                  893 different passives once the same name with the same effect is counted once. They were in
                  the drill-down's tree table and nowhere else: no card, and search found nothing. They are
                  passive cards like the keystones and the notables, with one field of their own: "lo", which
                  puts them below every other card that matches the same words, so typing "life" still puts
                  the notable and the unique first (assets/app.js). Each card carries what its nodes hold: the
                  effect in the game's words, the keywords marked in it, the region or the ascendancy it is
                  on, its picture, and how many of it are on the tree ("x", the pill assets/kinds.js declares).
                  Left out, because a card has to say something a player can use: 383 nodes with no effect
                  text (the masteries and the blank plates), 112 with no name, the jewel sockets, the
                  ascendancy starts, and anything the game files still mark [DNT].

  conquerors      Seven timeless jewel factions are in data/explore/jewels.*.json, 28 conqueror rows between
                  them, and two of the seven are items in the game: Heroic Tragedy (Kalguur) and Undying Hate
                  (Abyssals). Each rolls one conqueror out of three or five, and the item's own line carries
                  only the first, so the card named Vorana and Amanamu and search knew no others. Now the card
                  names all eight and finds all eight: "Kurgal" opens the jewel that rolls it. The five
                  factions with no item in the game get nothing - there is no jewel to hold, so there is
                  nothing to card. A row the files mark as only on older items is left out too: no jewel
                  drops that conqueror now.

Which jewel is which faction is not written down anywhere: the join is the line itself. A faction's rows are
one sentence with the jewel's seed range in the middle, and the item's own first line is that sentence with the
range filled in, so the card whose line matches a faction's row is that faction's jewel.

Not here: the item descriptions in data/info.json. 901 of the 1,086 have no card in data/index.json, but 562 of
those are rows of the live currency catalogue (data/market.json), which assets/app.js turns into searchable
currency cards as the page loads - a player reaches them today, with a real price on them. The other 339 reach
nothing and get no card: the official trade site's own item lists do not carry them (tools/tradedata.py). They
are Path of Exile 1 items the export still marks "released" - fossils and resonators, sextants and scarabs,
Bestiary nets, Harvest lifeforce, Heist markers and artifacts, Breach splinters and blessings, Legion emblems,
Labyrinth offerings, the Conquerors' crests, the five older Breachstone tiers - plus nine the game files mark
[DNT] and one lineage support the export gives no text for. Nine of the 339 are on the trade site's list at
all and seven of those nine say "This item is no longer usable".

Run after tools/gamelib.py and before tools/kwuse.py: tools/sync.py rebuilds data/index.json from the
artifact, so this has to come after it. Running it twice adds nothing twice.

Usage:
  python tools/treecards.py            write the cards, mark the references again, write the two parts
  python tools/treecards.py --report   count and say what would change, write nothing
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import sync  # noqa: E402
from gamelib import SHOWN, drilldown, node_image  # noqa: E402
from sync import DNT, KWREF, RAW, REPOE, SHOWN_FIELDS, plain, remote  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'index.json'
TREE = 'passive_skill_trees/Default.min.json'   # the game's own tree, for each node's picture
SUB = 'Small passive'      # the label under the name; tools/kwuse.py orders these rows by the first word
SEED = '{1}'               # where a conqueror's line carries the jewel's seed range


def effect(node):
    """A node's effect, in the game's own words, one line each (as tools/sync.py writes a passive card's)."""
    return [plain(y) for x in node.get('t') or [] for y in x.split('\n') if y.strip()]


def check(cards):
    """The standard tools/sync.py holds its own cards to: nothing a player reads may look like game code."""
    for it in cards:
        for f in SHOWN_FIELDS:
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if x and (any(m.search(x) for m in SHOWN) or RAW.search(x) or DNT.search(x)):
                    sys.exit('game code in %s %r: %r' % (f, it['n'], x))


# ---------------------------------------------------------------- small passives

def smalls(index, write=True):
    """One card per small passive: the same name with the same effect is one card, however many are on the tree."""
    have = {it['id'] for it in index['items'] if it['k'] == 'p'}
    known = {it['id'] for it in index['items'] if it['k'] == 'w'} | set(index.get('kwx') or {})
    icon = {p['id']: p for p in (remote('repoe-tree.json', REPOE + TREE) or {}).get('passives', {}).values()}

    groups, why = defaultdict(list), Counter()
    for node in drilldown('trdata')['passives']:
        name = (node.get('n') or '').strip()
        if node.get('k') != 'small':
            continue
        if not name:
            why['no name (an icon-only node)'] += 1
        elif name.startswith('[DNT') or (node.get('a') or '').startswith('[DNT'):
            why['not in the game yet'] += 1
        elif not effect(node):
            why['no effect text (a mastery or a blank plate)'] += 1
        else:
            groups[(name, ' · '.join(effect(node)))].append(node)

    # the most common spelling of a name keeps the name to itself; the rest are numbered, in the same order
    # every run (most on the tree first), so a card keeps its address between builds
    by_name = defaultdict(list)
    for key in sorted(groups):
        by_name[key[0]].append(key)
    ids = {}
    for name, keys in by_name.items():
        for i, key in enumerate(sorted(keys, key=lambda k: (-len(groups[k]), k[1]))):
            ids[key] = name if not i else '%s | %d' % (name, i + 1)

    cards, kept = [], 0
    for key in sorted(groups, key=lambda k: (k[0], ids[k])):
        nodes, cid = groups[key], ids[key]
        if cid in have:
            kept += 1
            continue
        regs = sorted({n['reg'] for n in nodes if n.get('reg')})
        ascs = sorted({n['a'] for n in nodes if n.get('a')})
        it = {'k': 'p', 'id': cid, 'n': key[0], 's': SUB + (' · ' + ascs[0] if len(ascs) == 1 else ''),
              'ls': effect(nodes[0]), 'lo': 1, 'x': len(nodes)}
        if regs + ascs:                      # the words search matches, as the notables carry them
            it['q'] = ' '.join(regs + ascs)
        if len(regs) == 1 and not ascs:      # one place on the tree: the pill says where (assets/kinds.js)
            it['reg'] = regs[0]
        if len(ascs) == 1 and not regs:
            it['asc'] = ascs[0]
        marked = sorted({m.group(1) for m in KWREF.finditer(json.dumps(nodes[0].get('t') or [], ensure_ascii=False))
                         if m.group(1) in known})
        if marked:
            it['kw'] = marked
        it['img'] = node_image(icon.get(nodes[0]['id'], {}))
        cards.append(it)
    check(cards)

    clash = sorted({it['id'] for it in cards} & have)
    if clash:
        sys.exit('a small passive wants an id a card already has: %s' % ', '.join(clash[:6]))
    if write and cards:
        at = max(i for i, it in enumerate(index['items']) if it['k'] == 'p') + 1
        index['items'][at:at] = cards   # next to the passive cards, so the index keeps its order
        sync.CACHE.mkdir(parents=True, exist_ok=True)   # the links node_image checked, remembered as sync.py does
        sync.CHECKED.write_text(json.dumps(sorted(sync._checked), indent=0), encoding='utf-8')
    return {'cards': cards, 'why': why, 'kept': kept, 'nodes': sum(len(v) for v in groups.values()),
            'groups': len(groups)}


# ---------------------------------------------------------------- the timeless jewels

def conquerors(index, write=True):
    """Every conqueror a timeless jewel rolls, on the card of the jewel that rolls it (see the file's own words
    for how a faction's rows are matched to an item)."""
    rows = defaultdict(list)
    for r in drilldown('jwdata').get('rows') or []:
        if r.get('rev') and r['rev'][1] == 0:
            continue                         # only on older items: no jewel drops that conqueror now
        if r.get('conqueror') and SEED in (r.get('text') or ''):
            rows[r['ver']].append(r)

    done, no_item = [], []
    for ver in sorted(rows):
        said = []
        for r in rows[ver]:
            if r['conqueror'] not in said:
                said.append(r['conqueror'])
        line = 'Conquerors: ' + (', '.join(said[:-1]) + ' or ' + said[-1] if len(said) > 1 else said[0])
        pre, post = rows[ver][0]['text'].split(SEED, 1)
        mine = re.compile('^' + re.escape(pre) + r'.{0,40}' + re.escape(post) + '$')
        hit = [it for it in index['items'] if it['k'] == 'u'
               and any(mine.match(x) for x in it.get('ls') or [])]
        if not hit:
            no_item.append(rows[ver][0]['faction'])
            continue
        for it in hit:
            if line in (it.get('pr') or []):
                continue
            check([{'n': it['n'], 'pr': [line]}])
            if write:
                it['pr'] = (it.get('pr') or []) + [line]
            done.append((it['n'], said))
    return {'done': done, 'no_item': no_item}


def main():
    ap = argparse.ArgumentParser(description='The small passives and the timeless jewel conquerors, as cards.')
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    args = ap.parse_args()

    index = json.loads(INDEX.read_text(encoding='utf-8'))
    was = sum(1 for it in index['items'] if it['k'] == 'p')
    sm = smalls(index, write=not args.report)
    cq = conquerors(index, write=not args.report)

    print('small passives %d nodes with an effect -> %d of them, %d new cards (%d already there); passives %d -> %d'
          % (sm['nodes'], sm['groups'], len(sm['cards']), sm['kept'], was, was + len(sm['cards'])))
    if sm['why']:
        print('        left out: ' + ', '.join('%d %s' % (n, r) for r, n in sorted(sm['why'].items(), key=lambda x: -x[1])))
    for name, said in cq['done']:
        print('conquerors %s: %s' % (name, ', '.join(said)))
    if cq['no_item']:
        print('        no jewel in the game for %d factions, so no card: %s'
              % (len(cq['no_item']), ', '.join(cq['no_item'])))
    if not cq['done']:
        print('        nothing to add: the conquerors are already on their cards')

    if args.report:
        print('\n--report: nothing written')
        return 0
    import nodelinks   # the doors inside the new cards' own lines
    rep = nodelinks.attach(index)
    INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    nodelinks.report(index, rep)
    import appdata   # the index in two parts for the home page
    appdata.write(index)
    print('\n-> data/index.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
