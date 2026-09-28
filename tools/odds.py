"""Build data/odds.json: the real weights behind the game's hidden rolls, one pool per table (#110).

The game files carry the weight of every rite a Forbidden Rite can foretell, every strongbox, every corrupted and
cleansed atlas node, every piece of map content, every ritual altar and every Azmeri spirit. No site shows them.
This turns each table into pools: the outcomes that roll against each other, each with its weight and its share of
the pool ("1 in 3,333"), and the pool named the way a player would name it.

The pipeline's `odds` stage, after `datpull`:   python tools/pipeline.py --only odds   (or python tools/odds.py)

Source: data/game/ (the `datpull` stage, tools/datpull.mjs, the game files, patch in data/game/_meta.json). Nothing here is fetched,
measured or guessed: a share is a weight over the sum of its pool's weights, and nothing else. What is not sure is
which outcomes share a pool. The files say which weight rolls, not which rows roll against each other, so:

  * a pool the table itself makes (one list, one named weight column, nothing that switches a row on) is `sure`
  * any other pool is built from what the rows say (a prefix, a level, a column dat-schema has no name for yet),
    kept apart from the rest until it is verified, and flagged "Subject to change" with the reason in `why`

Output:
  source     "game files, patch 0.5.5": what the page prints after "Source: "
  flags      each flag and the words its tooltip carries
  unnamed    rows that could not go in any pool because the game gives them no words, per table
  pools[]    pool       the pool's name
             of         what rolls it, in a player's words (a Forbidden Rite, a strongbox in a map)
             file       the data/game file it is built from (an internal name: never drawn)
             total      the sum of the weights in the pool
             sure       true where the table makes the pool; false and flag + why where the pool is ours
             outcomes[] name, weight, share (of the pool, 6 places), oneIn (1 in how many, rounded), text where the
                        game words an outcome beyond its name. Sorted by weight, most likely first. A weight of 0 is
                        listed with share 0 and no oneIn: it is in the table and cannot roll today.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'data' / 'game'
OUT = ROOT / 'data' / 'odds.json'
FLAG = 'Subject to change'
FLAGS = {FLAG: 'Depends on GGG. May change without notice.'}
RITE = re.compile(r'^(Foretold [A-Z][a-z]+): (.+)$')


def rows(name):
    return json.loads((GAME / (name + '.json')).read_text(encoding='utf-8'))['rows']


def pool(name, of, file, outcomes, why=None):
    """One pool: every outcome with its share. why, where given, is the reason the pool is not sure."""
    outcomes = sorted(outcomes, key=lambda o: (-o['weight'], o['name']))
    total = sum(o['weight'] for o in outcomes)
    for o in outcomes:
        o['share'] = round(o['weight'] / total, 6) if total else 0
        o['oneIn'] = round(total / o['weight']) if o['weight'] else None
    out = {'pool': name, 'of': of, 'file': file, 'total': total, 'sure': not why}
    if why:
        out['flag'], out['why'] = FLAG, why
    out['outcomes'] = [{k: v for k, v in o.items() if v is not None} for o in outcomes]
    return out


def one(name, weight, text=None):
    o = {'name': name, 'weight': weight or 0}
    if text and text != name:
        o['text'] = text
    return o


def bands(levels):
    """Area level bands out of the lowest level each outcome rolls at: [(from, to), ...], the last open."""
    edges = sorted(set(max(1, lv) for lv in levels))
    return [(a, (edges[i + 1] - 1) if i + 1 < len(edges) else None) for i, a in enumerate(edges)]


def band_name(a, b):
    return 'area level %d and up' % a if b is None else 'area level %d to %d' % (a, b)


def by_band(levels, outcomes_at):
    """[(from, to, outcomes)] per band, where two bands next to each other that roll the same outcomes at the same
    weights are one: a band is only drawn where the pool really changes."""
    out = []
    for a, b in bands(levels):
        outs = outcomes_at(a)
        if out and sorted((o['name'], o['weight']) for o in outs) == sorted((o['name'], o['weight']) for o in out[-1][2]):
            out[-1] = (out[-1][0], b, out[-1][2])
        else:
            out.append((a, b, outs))
    return out


def banded(name, a, b, one_band):
    """The pool's name, with its level band unless the band is every level there is."""
    return name if one_band else name + ', ' + band_name(a, b)


# ---------------------------------------------------------------- the tables
def rites(unnamed):
    """Forbidden Rites. A rite is worded "Foretold Bounty: 2 Divine Orbs": the part before the colon is its kind.
    Whether the kinds roll in one pool is not verified, so each kind is a pool; the rites something else has to
    unlock first (a condition stat on the row) are a pool of their own too."""
    groups = {}
    for r in rows('ritual_rites'):
        m = RITE.match((r.get('text') or [''])[0])
        if not m:
            unnamed['Forbidden Rites'] = unnamed.get('Forbidden Rites', 0) + 1
            continue
        locked = bool((r.get('stats') or {}).get('condition'))
        groups.setdefault((m.group(1), locked), []).append(one(m.group(2), r.get('weight')))
    out = []
    for (kind, locked), outs in sorted(groups.items()):
        why = ('Whether %s rites share one pool with the other kinds of rite is not verified, and one rite the game '
               'gives no words may roll among them.' % kind)
        if locked:
            why = ('These roll only once something unlocks them; whether they then roll among the other %s rites is '
                   'not verified.' % kind)
        out.append(pool(kind + (', once unlocked' if locked else ''), 'a Forbidden Rite on the Atlas', 'ritual_rites', outs, why))
    return out


def strongboxes():
    """Strongboxes. Each kind comes in versions that start at different area levels and name no last one, so a band
    takes, per kind, the version that starts highest while still starting at or below it."""
    rs = [r for r in rows('strongboxes') if r.get('weight')]

    def at(a):
        best = {}
        for r in rs:
            if max(1, r.get('level', 0)) <= a and r.get('level', 0) >= best.get(r['name'], {}).get('level', -1):
                best[r['name']] = r
        return [one(n, r['weight']) for n, r in best.items()]
    got = by_band([r.get('level', 0) for r in rs], at)
    return [pool(banded('Strongboxes', a, b, len(got) == 1), 'a strongbox in an area', 'strongboxes', outs,
                 'The versions of a strongbox that start at different area levels are read as one pool per level; '
                 'that they roll that way is not verified. Some strongboxes are more likely with atlas stats that '
                 'raise their weight.') for a, b, outs in got]


def corruption():
    """Corrupted and cleansed atlas nodes: two lists in the files. The corrupted weight is a named column; the
    cleansed one is not yet."""
    out = []
    for kind, of, why in (('Corrupted', 'a corrupted map on the Atlas', None),
                          ('Cleansed', 'a cleansed map on the Atlas',
                           'The cleansed weight is read from a column dat-schema does not name yet; not verified.')):
        outs = [one(' · '.join(r.get('text') or []) or 'Nothing added', r.get('weight'))
                for r in rows('atlas_corruption') if r['kind'] == kind]
        out.append(pool(kind + ' atlas node', of, 'atlas_corruption', outs, why))
    return out


def map_content():
    """Map content. Each weight row sits in a set (a column dat-schema does not name yet) and may name the biomes it
    holds in. Each set is a pool, and the rows that hold in some biomes only are a pool of their own."""
    groups = {}
    for c in rows('map_content'):
        for w in c.get('weights') or []:
            weight = w['weight'] if isinstance(w['weight'], int) else max(w['weight'])
            groups.setdefault((w.get('set', 0), bool(w.get('biomes'))), []).append(one(c['name'], weight, c.get('text')))
    out = []
    for (s, biome), outs in sorted(groups.items()):
        name = 'Map content, group %d' % (s + 1) + (', by biome' if biome else '')
        why = ('Grouped by a column dat-schema does not name yet; that each group is one pool is not verified.' +
               (' Each of these rolls only in the biomes it names.' if biome else ''))
        out.append(pool(name, 'a map on the Atlas', 'map_content', outs, why))
    return out


def altars():
    """Ritual altars: one list, one named weight, one level range for all of them today."""
    rs = rows('ritual_altars')
    got = by_band([r['level'][0] for r in rs], lambda a: [one(r['name'], r.get('weight'), r.get('text')) for r in rs if r['level'][0] <= a])
    return [pool(banded('Ritual altars', a, b, len(got) == 1), 'a Ritual in a map', 'ritual_altars', outs) for a, b, outs in got]


def spirits():
    """Azmeri spirits: one named weight, but a spirit also weighs differently by the tags of the area it is in
    (read in the files, not taken out yet), and some start at a higher level. One pool per level band."""
    rs = [r for r in rows('azmeri_spirits') if r.get('weight')]
    got = by_band([r['level'][0] for r in rs], lambda a: [one(r['name'], r['weight']) for r in rs if r['level'][0] <= a])
    return [pool(banded('Azmeri spirits', a, b, len(got) == 1), 'an Azmeri spirit in an area', 'azmeri_spirits', outs,
                 'A spirit\u2019s weight also moves with the kind of area it is in, which is not read here yet.')
            for a, b, outs in got]


def main():
    meta = json.loads((GAME / '_meta.json').read_text(encoding='utf-8'))
    unnamed = {}
    pools = rites(unnamed) + strongboxes() + corruption() + map_content() + altars() + spirits()
    doc = {'source': meta['source'], 'ids': ['file'], 'flags': FLAGS, 'unnamed': unnamed, 'pools': pools}
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    sure = sum(1 for p in pools if p['sure'])
    print('data/odds.json: %d pools (%d sure, %d %s), %d outcomes, %d bytes'
          % (len(pools), sure, len(pools) - sure, FLAG, sum(len(p['outcomes']) for p in pools), OUT.stat().st_size))
    for p in pools:
        print('  %-44s %3d outcomes, total %7d%s' % (p['pool'], len(p['outcomes']), p['total'], '' if p['sure'] else '  (' + FLAG + ')'))
    for k, n in unnamed.items():
        print('  left out: %d %s row%s the game gives no words' % (n, k, '' if n == 1 else 's'))


if __name__ == '__main__':
    main()
