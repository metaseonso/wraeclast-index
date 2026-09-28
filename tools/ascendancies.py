"""data/ascendancies.json and the Ascendancy cards: each ascendancy, its class, GGG's own text, its notables, and
the trials that give its points (#90, #82).

The passive cards already say which ascendancy a notable belongs to ("Notable · Deadeye"), but the ascendancy
itself was nowhere: nothing to open on "Deadeye", nothing that lists its notables in one place, nothing that
says where the points come from.

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
  ascendancies.min.json                  each ascendancy: its name, its class (the character it belongs to), the
                                         flavour text the game shows on its page, and whether it is in the game
  passive_skill_trees/Default.min.json   its nodes: which are notables, and the icon its small nodes share (the
                                         card's picture, poe.ninja's copy of the game's own icon, tools/sync.py)
  data/index.json                        the notable cards (tools/sync.py, tools/gamelib.py), matched by name and
                                         ascendancy: a notable with no card (no stat lines, no skill) is counted
The points: which trial gives which set and from what area level. data/trials.json's "Ascension" entries when
that file is here (tools/trials.py, #82: the quest states, floor levels and trial lengths in the game files);
else ASCENSIONS below, the same four entries as tools/trials.py wrote them for 0.5.5. Where the files do not
say which set a trial gives, the entry carries Subject to change and names poe2db.

What counts as one: a name (no [DNT] marker), not disabled, and nodes on the tree. The export still carries
the fishing names the game keeps for later ("[DNT-UNUSED] Bait Fisher"), and Abyssal Lich, which has no nodes
of its own on 0.5.5.

data/ascendancies.json:
  rows     per ascendancy: n, id (never drawn), class, qt (the game's flavour text), img, notables (their names,
           in the tree's order), missing (notables the tree has and no card carries)
  points   the four Ascensions: n, points, total, ways (trial, how, level, src, later), t on the first
  labels   the words a page shows: later (Subject to change, and its tooltip), src
The cards (data/index.json, kind y, assets/kinds.js): n, s "Ascendancy · <class>", qt, t (ours: the eight points
and where they come from, in one sentence), ls (its notables' names: tools/nodelinks.py makes each a door to its
card, and the notable card is "Named by" its ascendancy), img, src.

Usage:
  python tools/ascendancies.py            write data/ascendancies.json and the cards
  python tools/ascendancies.py --report   count and say what it would write, write nothing
Run it after tools/sync.py, tools/gamelib.py and tools/treecards.py (it names the passive cards they write).
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
from gamepull import REPOE, official, patch  # noqa: E402
from gamelib import TREE, node_image  # noqa: E402
from sync import DNT, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'index.json'
OUT = ROOT / 'data' / 'ascendancies.json'
TRIALS = ROOT / 'data' / 'trials.json'
SRC = 'Source: the game files'
LATER = 'Subject to change'
LATER_TIP = 'Depends on GGG. May change without notice.'
SRC_POE2DB = 'Source: the game files for the level; poe2db for which set it gives'
STYLE = re.compile(r'<[^<>{}]*>\{([^{}]*)\}')   # the game's text styling, <i>{words}: the words stay

# The four Ascensions as tools/trials.py (#82) wrote them from the 0.5.5 game files, for when data/trials.json is
# not here yet. The first two sets are in the quest states; for the third and fourth the files hold the floor
# levels and trial counts, not which set each gives, so those ways say Subject to change and name poe2db.
ASCENSIONS = [
    {'n': 'First Ascension', 'points': 2, 'total': 2, 't': 'You choose your Ascendancy, and take its first 2 points.',
     'ways': [{'trial': 'Trial of the Sekhemas', 'how': 'The Test of Strength: defeat Rattlecage, the Earthbreaker '
               '(Act 2 quest Ascent to Power, with Balbala\'s Barya)', 'level': 22, 'src': SRC}]},
    {'n': 'Second Ascension', 'points': 2, 'total': 4,
     'ways': [{'trial': 'The Trial of Chaos', 'how': 'The Trialmaster\'s Challenges with the Chimeral Inscribed '
               'Ultimatum, 4 trials (Act 3 quest The Trials of Chaos)', 'level': 38, 'src': SRC},
              {'trial': 'Trial of the Sekhemas', 'how': 'A Barya with two trials, through the Test of Will (the floor '
               'opens from level 45)', 'level': 45, 'later': LATER, 'src': SRC_POE2DB}]},
    {'n': 'Third Ascension', 'points': 2, 'total': 6,
     'ways': [{'trial': 'Trial of the Sekhemas', 'how': 'A Barya with three trials, through the Test of Cunning (the '
               'floor opens from level 60)', 'level': 60, 'later': LATER, 'src': SRC_POE2DB},
              {'trial': 'The Trial of Chaos', 'how': 'An Inscribed Ultimatum of 7 trials (from area level 60)',
               'level': 60, 'later': LATER, 'src': SRC_POE2DB}]},
    {'n': 'Fourth Ascension', 'points': 2, 'total': 8,
     'ways': [{'trial': 'Trial of the Sekhemas', 'how': 'A Barya with four trials, through the Test of Time (the '
               'floor opens from level 75)', 'level': 75, 'later': LATER, 'src': SRC_POE2DB},
              {'trial': 'The Trial of Chaos', 'how': 'An Inscribed Ultimatum of 10 trials (from area level 75), then '
               'the Trialmaster behind the door at its end, opened with three Fates', 'level': 75, 'src': SRC}]},
]
# The card's one sentence, ours: what every ascendancy's points come to. The trials that give each set are in
# data/ascendancies.json "points", with the label each way carries.
POINTS = ('Eight Ascendancy points: two from each of four Ascensions, in the Trial of the Sekhemas or the Trial of '
          'Chaos.')


def ascensions():
    """The four Ascensions: data/trials.json's own entries when it is here, else the copy above."""
    try:
        rows = [r for r in json.loads(TRIALS.read_text(encoding='utf-8'))['rows'] if r.get('s') == 'Ascension']
    except (OSError, ValueError, KeyError):
        rows = []
    keep = ('n', 'points', 'total', 't', 'ways')
    return [{k: r[k] for k in keep if k in r} for r in rows] or ASCENSIONS, bool(rows)


def build(index):
    tree = official(TREE)['passives']
    cards = {(it.get('asc'), it['n']): it for it in index['items'] if it['k'] == 'p' and it.get('asc')}
    rows, why = [], Counter()
    for key, a in official('ascendancies.min.json').items():
        name = a.get('name') or ''
        nodes = [v for v in tree.values() if v.get('ascendancy') == key]
        if not name or DNT.search(name):
            why['a name no player sees'] += 1
            continue
        if str(a.get('disabled')) == 'True':
            why['disabled'] += 1
            continue
        if not nodes:
            why['no nodes on the tree'] += 1
            continue
        klass = (a.get('character') or [None, ''])[1]
        notables = [v['name'] for v in nodes if v.get('is_notable') and v.get('name')]
        have = [n for n in notables if (name, n) in cards]
        small = Counter(v.get('icon') for v in nodes
                        if not v.get('is_notable') and not v.get('is_ascendancy_starting_node') and v.get('icon'))
        row = {'n': name, 'id': name, 'class': klass,
               'qt': plain(STYLE.sub(lambda m: m.group(1), (a.get('flavour_text') or '').replace('\r\n', '\n'))),
               'img': node_image({'icon': small.most_common(1)[0][0]}) if small else None,
               'notables': have}
        if len(have) < len(notables):
            row['missing'] = [n for n in notables if n not in have]
        rows.append({k: v for k, v in row.items() if v})
    rows.sort(key=lambda r: (r['class'], r['n']))
    points, own = ascensions()
    out = {'source': 'game files, patch %s' % patch(), 'from': REPOE,
           'note': 'One entry per ascendancy in the game: its class, the flavour text the game shows for it (qt), '
                   'its notables by name (each a passive card), and the notables no card carries (missing). '
                   'points: the four Ascensions, each way a trial gives the set, with its area level and source; a '
                   'way the game files do not tie to its set carries later. Written by tools/ascendancies.py.',
           'labels': {'later': {'text': LATER, 'tip': LATER_TIP}, 'src': SRC},
           'ids': ['id'],
           'points': points,
           'rows': rows}
    return out, {'why': why, 'own': own}


def cards_into(index, rows):
    """The Ascendancy cards (kind y), after the passive cards they name."""
    index['items'] = [it for it in index['items'] if it['k'] != 'y']
    new = []
    for r in rows:
        it = {'k': 'y', 'id': r['id'], 'n': r['n'], 's': 'Ascendancy · ' + r['class'], 't': POINTS,
              'ls': r['notables'], 'src': SRC, 'q': 'ascendancy ' + r['class'].lower()}
        if r.get('qt'):
            it['qt'] = r['qt']
        if r.get('img'):
            it['img'] = r['img']
        new.append(it)
    index['items'].extend(new)
    return len(new)


def report(out, rep):
    rows = out['rows']
    print('ascendancies  %d, over %d classes; %d notables carded, %d with no card (%s)'
          % (len(rows), len({r['class'] for r in rows}), sum(len(r['notables']) for r in rows),
             sum(len(r.get('missing') or []) for r in rows),
             ', '.join(n for r in rows for n in r.get('missing') or [])))
    print('              left out: ' + ', '.join('%d %s' % (n, s) for s, n in rep['why'].most_common()))
    print('              points: %d Ascensions, from %s' % (len(out['points']),
                                                        'data/trials.json' if rep['own'] else 'the copy in this tool'))


def main():
    ap = argparse.ArgumentParser(description='Build the Ascendancy cards from the game files.')
    ap.add_argument('--report', action='store_true', help='count and say what it would write, write nothing')
    args = ap.parse_args()

    index = json.loads(INDEX.read_text(encoding='utf-8'))
    got = {}

    def fresh():
        got['out'], got['rep'] = build(index)
        return got['out']

    out = lastgood.pull('Ascendancies', fresh, file='ascendancies.json', url=REPOE, at='rows', floor=15)
    if got:
        report(got['out'], got['rep'])
    if args.report:
        print('\n--report: nothing written')
        return 0
    if out is None:
        return lastgood.report()
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(OUT, body)
    print('\n-> data/ascendancies.json, %d bytes' % len(body.encode('utf-8')))
    n = cards_into(index, out['rows'])
    import nodelinks   # each notable's name on the card, a door to its card
    rep = nodelinks.attach(index)
    lastgood.save(INDEX, json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    nodelinks.report(index, rep)
    import appdata   # the index in two parts for the home page
    appdata.write(index)
    print('-> %d Ascendancy cards in data/index.json' % n)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Ascendancies', file='ascendancies.json', url=REPOE))
