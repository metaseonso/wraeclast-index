"""data/runes.json: Runes of Aldur, the recipe finder and the Verisium Anvil (issue #113). The data half: the card
and the finder are proposed in design/runes.md.

One official source, the game's own tables, read by tools/datpull.mjs into data/game/:
  rune_recipes      Expedition2Recipes (322), Expedition2Runes, ExpeditionCategory: which runes make what
  rune_highlights   Expedition2RunesWeights (175): which rune is highlighted, per recipe length and area-level band
  verisium_crafts   Expedition2VerisiumCrafts (718): which base becomes which Runeforged or Runemastered base, and
                    what it costs
Joined by name to the cards the site has (tools/cardnames.py): bases, uniques, gems and currency.

The finder, both ways, out of one list:
  recipes[]   runes      the runes in order, each "<word> Rune" (the game files name a rune by one word, and the
                         game's own lines call it that way: "a Power Rune")
              makes      what it makes: the item, or the game's words where it is not one item ("Unique Shield")
              count, gemLevel, level (the area levels it can be made in, where not every level), tab (the Tome's)
              card 1     where makes is the name of a card the site has
              offered    the highlight rows the recipe lists (RuneWeights), by position in bands: the rune, its
                         slot, the recipe length and the area-level band. That a recipe is offered when one of them
                         is highlighted is ours, read off the names of the columns: Subject to change
              blocked    the game's words, where a quest opens it
  byRune      each rune: the recipes it is in (runes -> result)
  makes       each result: the recipes that make it (result -> runes)
  bands       every highlight row: recipe length, slot, rune, area-level band ("which rune is highlighted per band")
  runes       each rune: how many recipes, and the bands it is highlighted in

The Verisium Anvil:
  anvil[]     base (the base it takes; unique, where it takes that unique), makes (the base it makes), cost
              [{item, count}], verisium (the Verisium in it, for sorting), card 1 where the base is a base card
  byBase      each base: its crafts, so a base card shows its cost
  The files fill the unique column with the word Void where a craft takes a plain base; no unique is called Void
  (the index), so it is read as none

Run after tools/datpull.mjs:   python tools/runes.py            write data/runes.json
                               python tools/runes.py --report   count, write nothing
"""
import argparse
import datetime as dt
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardnames  # noqa: E402
import lastgood  # noqa: E402

OUT = 'runes.json'
FLAG = cardnames.FLAG
NO_UNIQUE = 'Void'


def rune(word):
    return word + ' Rune'


def build():
    recipes, source = cardnames.game('rune_recipes')
    bands_raw, _ = cardnames.game('rune_highlights')
    anvil_raw, _ = cardnames.game('verisium_crafts')
    items = cardnames.items()
    ix = cardnames.index()
    bases, uniques = set(ix.get('b', {})), set(ix.get('u', {}))
    if NO_UNIQUE in uniques:
        raise ValueError('a unique is called %s now: the Anvil\'s plain-base marker is no longer safe to read as none'
                         % NO_UNIQUE)

    bands = [{'runes': b['runes'], 'slot': b['slot'], 'rune': rune(b['rune']), 'level': b['level']} for b in bands_raw]
    out, by_rune, makes = [], {}, {}
    for r in recipes:
        e = {'runes': [rune(w) for w in r['runes']], 'makes': r['reward'], 'count': r.get('count') or 1}
        if r.get('gemLevel'):
            e['gemLevel'] = r['gemLevel']
        if r.get('level') and r['level'] != [1, 100]:
            e['level'] = r['level']
        if r.get('tab'):
            e['tab'] = r['tab']
        if r['reward'] in items:
            e['card'] = 1
        if r.get('highlights'):
            e['offered'] = [i for i in r['highlights'] if 0 <= i < len(bands)]
        if r.get('blocked'):
            e['blocked'] = r['blocked']
        i = len(out)
        out.append(e)
        for w in dict.fromkeys(e['runes']):
            by_rune.setdefault(w, []).append(i)
        makes.setdefault(e['makes'], []).append(i)

    runes = []
    for w in by_rune:
        rb = [{'runes': b['runes'], 'slot': b['slot'], 'level': b['level']} for b in bands if b['rune'] == w]
        runes.append({'name': w, 'recipes': len(by_rune[w]), **({'highlighted': rb} if rb else {})})

    anvil, by_base, left = [], {}, Counter()
    for v in anvil_raw:
        e = {'base': v['from'], 'makes': v['to']}
        if v.get('unique') and v['unique'] != NO_UNIQUE:
            e['unique'] = v['unique']
            if v['unique'] not in uniques:
                left['unique with no card'] += 1
        e['cost'] = v.get('cost') or []
        ver = sum(c['count'] for c in e['cost'] if c['item'] == 'Verisium')
        if ver:
            e['verisium'] = ver
        if v['from'] in bases:
            e['card'] = 1
        else:
            left['base with no card'] += 1
        by_base.setdefault(v['from'], []).append(len(anvil))
        anvil.append(e)

    kinds = Counter(e['makes'].split(' ')[0] for e in anvil)
    return {'source': source, 'updated': dt.date.today().isoformat(), 'ids': [], 'flags': cardnames.FLAGS,
            'sources': [source + ' (Expedition2Recipes, Expedition2Runes, Expedition2RunesWeights, '
                                 'Expedition2VerisiumCrafts, ExpeditionCategory)'],
            'counts': {'recipes': len(out), 'runes': len(runes), 'bands': len(bands), 'results': len(makes),
                       'tabs': dict(Counter(e.get('tab') for e in out)), 'anvil': len(anvil),
                       'runeforged': kinds.get('Runeforged', 0), 'runemastered': kinds.get('Runemastered', 0),
                       'bases': len(by_base), 'left': dict(left)},
            'offered': {'flag': FLAG, 'why': 'The files list the highlight rows a recipe goes with; that the recipe '
                                             'is offered when one of them is highlighted is read off the column names.'},
            'recipes': out, 'byRune': by_rune, 'makes': makes, 'bands': bands, 'runes': runes,
            'anvil': anvil, 'byBase': by_base}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--report', action='store_true', help='count and say, write nothing')
    a = ap.parse_args()
    doc = lastgood.pull('Runes of Aldur', build, file=OUT, at='recipes')
    if doc is None:
        return lastgood.report()
    print('runes:', doc['counts'])
    if not a.report:
        print('  wrote data/%s, %s bytes' % (OUT, format(cardnames.write(OUT, doc), ',')))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Runes of Aldur', file=OUT))
