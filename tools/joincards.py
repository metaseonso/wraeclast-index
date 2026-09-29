"""Runes and achievements as cards: data/runes.json and data/achievements.json joined onto the index (#113, #91).

Reads the tables the builders before it wrote, and nothing from outside:

  data/runes.json         tools/runes.py: every rune recipe both ways, the highlight bands, the Verisium Anvil
  data/achievements.json  tools/achievements.py: every achievement and league challenge, its steps and the cards
                          it names
  data/exchange.json, data/market.json and the index itself: the names a card answers to

Writes two kinds onto data/index.json, and one field onto the Base kind (assets/kinds.js declares them;
design/runes.md and design/achievements.md say what each draws), then the two parts the app loads
(tools/appdata.py):

  o  Rune         one per rune: how many recipes it is in, the bands it is highlighted in, the cards its recipes
                  make (mk) and the keyword card of the same name (rk). Its id is its name
  z  Achievement  one per achievement or challenge: the game's text, its steps each with where it is (gl), and
                  the cards it needs (ax): areas, bosses, items and keywords. Its id is the game's own and is
                  never drawn. Challenges the files repeat word for word, league after league, are one card
  b  (av)         a base the Verisium Anvil takes: what it makes, and what that costs

A connection is a list of card keys on the row (mk, rk, ax); the page turns them round for the other end
(assets/graph.js, MAPS): a card a recipe makes is "Made from runes", a card an achievement names is "Asked by
achievements". A name no card answers to is never a key.

Anything the files leave unsure carries "un", the Subject to change pill. Nothing here is a guess: a step with
no area in the files has none on the card.

    python tools/joincards.py
"""
import json
import re
from pathlib import Path

import appdata
import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DOT = ' · '
KINDS = ('o', 'z')   # the kinds this tool writes, and takes off again before it writes them
ANVIL = 'av'         # the field it puts on a base card, taken off again the same way
ITEM_KINDS = ('c', 'b', 'u', 'a', 'g')   # the cards an item name can be, in the order a name is claimed
RESULT_KINDS = ('c', 'g', 'u', 'b', 'a')   # ...and a rune recipe's result: a lineage gem is a gem before an item
LEAGUE = 'Runes of Aldur'


def load(name, default=None):
    try:
        return json.loads((DATA / name).read_text(encoding='utf-8'))
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def uniq(xs):
    return list(dict.fromkeys(x for x in xs if x))


def level(lv):
    """An area-level band as words: 1 to 16, 70 and up, or one level."""
    lo, hi = lv[0], lv[-1]
    if lo == hi:
        return 'area level %d' % lo
    return 'area level %d and up' % lo if hi >= 100 else 'area level %d to %d' % (lo, hi)


def main():
    index = load('index.json')
    runes = load('runes.json')
    ach = load('achievements.json')
    market = {(v or {}).get('n') for v in (load('market.json', {'items': {}}).get('items') or {}).values()}
    market |= set((load('exchange.json', {'items': {}}).get('items') or {}))

    items = [it for it in index['items'] if it['k'] not in KINDS]
    for it in items:
        it.pop(ANVIL, None)
    by_name = {}
    for it in items:
        by_name.setdefault(it['n'], []).append(it)

    def card_key(name, kinds):
        """The key of the card a name answers to, of the first of these kinds that has one."""
        for k in kinds:
            if k == 'c' and name in market and not any(x['k'] == 'c' for x in by_name.get(name, [])):
                return 'c:' + name
            for it in by_name.get(name, []):
                if it['k'] == k:
                    return k + ':' + it['id']
        return None

    def keyword_key(name, content=False):
        """A keyword card by name; for a content name, the atlas one (Contains...) where two share it."""
        ws = [it for it in by_name.get(name, []) if it['k'] == 'w']
        ws.sort(key=lambda it: 0 if it['id'].startswith('Contains') == content else 1)
        return 'w:' + ws[0]['id'] if ws else None

    counts = {}

    # ---------- runes ----------
    recipes = runes.get('recipes') or []
    rows_o = []
    for r in runes.get('runes') or []:
        name = r['name']
        row = {'k': 'o', 'id': name, 'n': name, 's': LEAGUE, 'nr': r.get('recipes') or 0}
        bands = sorted(r.get('highlighted') or [], key=lambda b: (b['runes'], b['slot'], b['level'][0]))
        if bands:
            row['hb'] = ['%d runes, slot %d%s%s' % (b['runes'], b['slot'], DOT, level(b['level'])) for b in bands]
        mk = uniq(card_key(recipes[i]['makes'], RESULT_KINDS) for i in (runes.get('byRune') or {}).get(name, [])
                  if 0 <= i < len(recipes) and recipes[i].get('card'))
        if mk:
            row['mk'] = mk
        kw = keyword_key(name)
        if kw:
            row['rk'] = [kw]
        row['src'] = 'Source: the game files'
        rows_o.append(row)
    counts['runes'] = len(rows_o)
    counts['recipe results with a card'] = len({k for r in rows_o for k in r.get('mk', [])})

    # ---------- the Verisium Anvil, on the base it takes ----------
    def cost(c):
        return c['item'] if c.get('count', 1) == 1 else '{:,} {}'.format(c['count'], c['item'])

    anvil = runes.get('anvil') or []
    bases = {}
    for it in items:
        if it['k'] == 'b':
            bases.setdefault(it['n'], []).append(it)
    on = 0
    for base, at in (runes.get('byBase') or {}).items():
        crafts = [anvil[i] for i in at if 0 <= i < len(anvil)]
        crafts.sort(key=lambda e: (1 if e.get('unique') else 0, e.get('unique') or ''))
        # the table repeats a craft word for word where it differs only in columns nobody has named: one line
        lines = uniq((e['unique'] + ': ' if e.get('unique') else '') + e['makes'] + DOT +
                     ', '.join(cost(c) for c in e.get('cost') or []) for e in crafts)
        for it in bases.get(base, []):
            it[ANVIL] = lines
            on += 1
    counts['bases on the Anvil'] = on

    # ---------- achievements ----------
    area = {}      # (name, act) -> key, and name -> the first key
    for it in items:
        if it['k'] == 'r':
            area.setdefault((it['n'], it.get('act')), 'r:' + it['id'])
            area.setdefault((it['n'], None), 'r:' + it['id'])
    bosses = {b['name'] for b in load('bosses.json', {'bosses': []}).get('bosses') or []}

    def place(name, where):
        return area.get((name, where)) or area.get((name, None))

    seen, rows_z, same = {}, [], 0
    for a in ach.get('achievements') or []:
        steps = a.get('steps') or []
        sig = (a['name'], a['text'], a['set'], a['where'], json.dumps(steps, sort_keys=True))
        if sig in seen:   # the same challenge, repeated for another league: one card
            same += 1
            continue
        seen[sig] = 1
        row = {'k': 'z', 'id': a['id'], 'n': a['name'], 's': a['set'] + DOT + a['where'], 't': a['text']}
        if a.get('only'):
            row['ho'] = a['only']
        if a.get('need') and steps:
            row['an'] = 'Any %d of %d' % (a['need'], len(steps))
        if a.get('count') and str(a['count']) not in re.sub(r'[,\s]', '', a['text']):
            row['cn'] = a['count']
        goals = []
        for s in steps:
            words = s['name'] + (' (%d)' % s['count'] if s.get('count') else '')
            goals.append(words + (DOT + ', '.join(s['in']) if s.get('in') else ''))
        if goals:
            row['gl'] = goals
        if a.get('how'):
            row['hw'] = a['how']
        if a.get('source'):
            row['src'] = a['source']
        where = a['where'] if a['where'].startswith('Act') else None
        names = uniq(a.get('areas') or []) + uniq(w for s in steps for w in s.get('in') or [])
        ax = uniq(place(n, where) for n in names)
        ax += uniq('x:' + b for b in a.get('bosses') or [] if b in bosses)
        ax += uniq(card_key(n, ITEM_KINDS) for n in a.get('items') or [])
        ax += uniq(keyword_key(n, True) for n in a.get('mechanics') or [])
        ax += uniq(keyword_key(n) for n in a.get('keywords') or [])
        ax = uniq(ax)
        if ax:
            row['ax'] = ax
        words = uniq([s['name'] for s in steps] + [k for s in steps for k in s.get('kill') or []] +
                     list(a.get('bosses') or []))
        if words:
            row['q'] = ' '.join(words)
        rows_z.append(row)
    counts['achievements'] = len(rows_z)
    counts['repeated challenges'] = same
    counts['with connections'] = sum(1 for r in rows_z if r.get('ax'))

    index['items'] = items + rows_o + rows_z
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json %d KB%s%s' % (len(body.encode('utf-8')) // 1024, DOT,
                                         ', '.join('%s %d' % kv for kv in counts.items())))
    appdata.write(index)


if __name__ == '__main__':
    main()
