"""The doors inside a card's own lines: a phrase that names another card becomes a reference the page can link.

Every card in the index is a node, and every line a player reads may name another node ("Grants Skill: Ice Nova",
"Herald of Ash", "Iron Ring"). This finds those phrases in the lines the builders already wrote and records where
they sit, so nothing has to be written by hand and a new card opens its own doors the next time the index is built.

What is read: the mod and stat lines a player sees — "ls" on uniques, bases and passives, "t" on gems. The wording
is never changed.

The rules, and no guessing:
  * the phrase is matched exactly: same letters, same case, whole words, longest phrase first, never inside another
  * the phrases are every card's name, plus the other words a keyword card is shown as ("f", from the game's own
    markup): "Endurance Charges" is the keyword, so it wins over the notable called "Endurance" inside it
  * a mechanics card's words ("f" again, tools/mechanics.py) count where that card's own gate says they do: a word
    that is also a plain English word only where the line uses it as a number, so "40% less Attack Damage" is a
    door and "no more than once" is not; a phrase that only ever means the mechanic ("Converted to") wherever it is
  * exactly one card has that name          -> a reference to it
  * the card's own name                      -> not a door, and nothing else with that name is one either
  * several cards of one kind share the name -> nothing (two uniques called Decompose: which one?)
  * several kinds share the name             -> nothing, unless the line declares a preference: a "Grants Skill:"
                                                line names a gem, so a gem wins there
  * a keyword card                           -> nothing: 6,570 more spans would push data/index-core.json past
                                                its size budget, and the page marks those words itself as the
                                                card is drawn (assets/marks.js), off the keyword cards it
                                                already holds
  * a card ranked low ("lo": the tree's small passives, tools/treecards.py) is never a phrase to look for: its
    name is the stat's own wording ("Attack Speed", "Minion Damage"), so every mod line that says the words
    would open it, and nothing in the line is naming a node. Their own lines are read as any other card's.
  * no card has that name                    -> plain text, as before

What is written, beside the lines (never in place of them, so every page still reads the plain text):
  index["lxk"]   the node keys this index refers to, once each ("g:<id>", "u:<id>", ...), as assets/app.js keys them
  item["lx"]     one entry per line, in the same order as the card's own lines ("ls", or "t" where a card's text is
                 one line): 0 where the line has no reference, else [[start, length, key], ...] with key an index
                 into "lxk". tools/appdata.py renumbers both into a table of each part's own when it splits the
                 index, so a file only carries the keys it uses.

Usage:  python tools/nodelinks.py     rebuild the references in data/index.json and its two parts, and report
tools/sync.py calls attach() while it builds the index, so a full sync needs no extra step.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import mechanics  # noqa: E402
from phrases import Matcher  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
# The lines a player reads, per kind of card. A card has one or the other, never both.
LINE_FIELDS = {'u': 'ls', 'b': 'ls', 'p': 'ls', 'g': 't', 'h': 'ls'}
NO_LINK = {'w'}            # keywords: the page marks those itself, as the card is drawn (assets/marks.js)
FORMS = {'w', 'h'}         # kinds with other words they are reached by ("f")
# A line that declares which kind it names. "Grants Skill: Ice Nova" is a gem, whatever else shares the name.
PREFERS = (('Grants Skill:', 'g'),)
KIND = {'g': 'gems', 'u': 'uniques', 'p': 'passives', 'b': 'bases', 'a': 'atlas', 'c': 'currency', 'w': 'keywords',
        'h': 'mechanics'}


def lines_of(it):
    """The lines this card shows, in the order it shows them."""
    f = LINE_FIELDS.get(it['k'])
    if not f:
        return []
    v = it.get(f)
    return list(v) if isinstance(v, list) else ([v] if v else [])


def prefers(line):
    """The kind this line names, where the line says so."""
    for start, k in PREFERS:
        if line.startswith(start):
            return k
    return None


def blank_rep():
    """The counters a run fills in, so report() can say what it did."""
    return {'refs': Counter(), 'lines': Counter(), 'cards': Counter(), 'targets': Counter(), 'seen': Counter(),
            'amb_kind': Counter(), 'amb_name': Counter(), 'amb_who': {}, 'chips': Counter(),
            'skipped': [], 'phrases': Counter(), 'prose': Counter(),
            'to': Counter(), 'tocards': defaultdict(set)}   # the mechanics cards, and who reaches them


class Doors:
    """The rules at the top of this file, over any line at all.

    attach() marks the index's own lines with one of these. A builder whose lines are not in the index — the
    essence tables, tools/essences.py — marks its own the same way, so one mod line reads the same wherever the
    site shows it. `keys` is the key table that file writes out ("lxk"), filled as the lines are marked.
    """

    def __init__(self, index):
        by_name = defaultdict(list)
        for it in index['items']:
            if it.get('lo'):   # a low-ranked card's name is the stat's own wording, not a name: see the rules above
                continue
            by_name[it['n']].append(it)
        for it in index['items']:   # the other words a keyword is shown as, so a longer keyword beats a shorter card name
            if it['k'] in FORMS:
                for f in it.get('f') or ():
                    if it not in by_name[f]:
                        by_name[f].append(it)
        self.matcher = Matcher(by_name, what='card name', skip_bad=True)
        self.skipped = self.matcher.skipped
        self.keys, self.at = [], {}

    def key(self, node):
        """Where this card sits in the key table, adding it the first time it is asked for."""
        if node not in self.at:
            self.at[node] = len(self.keys)
            self.keys.append(node)
        return self.at[node]

    def spans(self, line, mine=None, want=None, rep=None, k=''):
        """One line's references: [[start, length, key], ...], key an index into self.keys. [] where it has none.

        mine: the card the line is on, which is never a door to itself. want: the kind the line declares.
        """
        rep = blank_rep() if rep is None else rep
        spans = []
        for s, e, name, hit in self.matcher.scan(line):
            rep['seen'][k] += 1
            cand = list(hit)
            if mine and any(x['k'] + ':' + x['id'] == mine for x in cand):
                continue   # the card's own name: a card is not a door to itself
            if all(x['k'] in NO_LINK for x in cand):
                rep['chips'][name] += 1   # a keyword, whichever one: the page marks it itself (assets/marks.js)
                continue
            if len(cand) > 1:
                kinds = {x['k'] for x in cand}
                pick = [x for x in cand if x['k'] == want] if want else []
                if len(pick) == 1:
                    cand = pick
                else:
                    rep['amb_name'][name] += 1
                    rep['amb_who'][name] = sorted(x['k'] + ':' + x['id'] for x in cand)
                    rep['amb_kind']['one kind' if len(kinds) == 1 else 'several kinds'] += 1
                    continue
            t = cand[0]
            if t['k'] == mechanics.KIND and not mechanics.gate(name, line, s):
                rep['prose'][name] += 1   # the word, not the maths: "no more than once every 3 seconds"
                continue
            spans.append([s, e - s, self.key(t['k'] + ':' + t['id'])])
            if t['k'] == mechanics.KIND:
                rep['to'][t['n']] += 1
                rep['tocards'][t['n']].add(mine or k)
            rep['refs'][k + '->' + t['k']] += 1
            rep['targets'][t['k']] += 1
            rep['phrases'][name] += 1
        return spans


def attach(index):
    """Find every reference in the index's own lines and write them onto the cards. Returns the report."""
    doors = Doors(index)
    rep = blank_rep()
    rep['skipped'] = sorted(doors.skipped)
    for it in index['items']:
        mine = it['k'] + ':' + it['id']
        rows, found = [], False
        for line in lines_of(it):
            rep['lines'][it['k']] += 1
            spans = doors.spans(line, mine=mine, want=prefers(line), rep=rep, k=it['k'])
            if spans:
                found = True
                rep['lines'][it['k'] + ' linked'] += 1
            rows.append(spans or 0)
        if found:
            it['lx'] = rows
            rep['cards'][it['k']] += 1
        else:
            it.pop('lx', None)
    if doors.keys:
        index['lxk'] = doors.keys
    else:
        index.pop('lxk', None)
    return rep


RUN = re.compile(r"[A-Z][A-Za-z'-]+(?:(?: (?:of|the|to|and|a|an|in|on|from|with))? [A-Z][A-Za-z'-]+)+")
LABEL = re.compile(r'\b(?:Grants|Supports|Supported)\b')   # what a mod line calls itself, never a name


def unresolved(index, top=20):
    """Phrases that read like a name but open nothing: two or more capitalised words no card is called."""
    known = {it['n'] for it in index['items'] if not it.get('lo')}   # the same names attach() looks for
    for it in index['items']:
        if it['k'] == 'w':
            known.update(it.get('f') or ())
    out = Counter()
    for it in index['items']:
        for line in lines_of(it):
            for m in RUN.finditer(line):
                p = m.group(0)
                if p not in known and not LABEL.search(p):
                    out[p] += 1
    return out.most_common(top)


def report(index, rep):
    print('references: %d in %d lines on %d cards, to %d different cards (%d phrases read)' %
          (sum(rep['refs'].values()), sum(v for k, v in rep['lines'].items() if k.endswith(' linked')),
           sum(rep['cards'].values()), len(index.get('lxk') or []), sum(rep['seen'].values())))
    for k in sorted(rep['lines']):
        if not k.endswith(' linked'):
            print('  %-9s %5d lines, %4d with a reference, on %d of the cards' %
                  (KIND.get(k, k), rep['lines'][k], rep['lines'].get(k + ' linked', 0), rep['cards'][k]))
    print('  by target: ' + ', '.join('%s %d' % (KIND.get(k, k), v) for k, v in rep['targets'].most_common()))
    print('  from -> to: ' + ', '.join('%s %d' % (k, v) for k, v in sorted(rep['refs'].items())))
    print('  left as plain text: %d keyword phrases (%d of them, and the page marks those itself), '
          '%d ambiguous (%d one kind, %d several kinds)' %
          (sum(rep['chips'].values()), len(rep['chips']), sum(rep['amb_name'].values()),
           rep['amb_kind']['one kind'], rep['amb_kind']['several kinds']))
    if rep['to']:
        print('  mechanics cards (tools/mechanics.py), reached from their own words:')
        for name, c in rep['to'].most_common():
            print('    %-24s %5d line%s on %4d cards' % (name, c, ' ' if c == 1 else 's', len(rep['tocards'][name])))
        print('    left as plain text: %d where the word is prose, not a number (%s)' %
              (sum(rep['prose'].values()), ', '.join('%s %d' % x for x in rep['prose'].most_common())))
    if rep['amb_name']:
        print('  ambiguous phrases, left as plain text:')
        for name, c in rep['amb_name'].most_common():
            print('    %-26s %3d line%s  %s' % (name, c, ' ' if c == 1 else 's', ', '.join(rep['amb_who'][name])))
    print('  top phrases: ' + ', '.join('%s %d' % (p, c) for p, c in rep['phrases'].most_common(12)))
    print('  did not resolve but look like a name (top 20):')
    for p, c in unresolved(index):
        print('    %-40s %d' % (p, c))
    if rep['skipped']:
        print('  names that do not start with a word (never matched): %s' % ', '.join(rep['skipped']))


def main():
    f = ROOT / 'data' / 'index.json'
    index = json.loads(f.read_text(encoding='utf-8'))
    rep = attach(index)
    f.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    report(index, rep)
    import appdata   # the two parts the home page loads, with each part's own key table
    appdata.write(index)


if __name__ == '__main__':
    main()
