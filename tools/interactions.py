"""Every interaction the game's own wording refers to: the ones a card already answers, and the ones nobody has.

The keywords are mapped. The interactions are not. "Recovery from your Life Flasks cannot be applied to
anything other than you" names three of them — a recovery, an exclusion, a condition — and until now every
one of those words sat as plain text. This finds them all, and settles each one into exactly one of three
buckets:

  mapped    the phrase already opens a card that answers it: a keyword card (the game's own glossary) or one
            of our mechanics cards (tools/mechanics.py). Nothing to add.
  marked    nothing answers it, so it opens one of the cards below: our own, kind "q", which say plainly
            what is settled, what is not, and take what a player has tested (assets/clarify.js).
  plain     an interaction word the game writes that neither of the above reaches. Counted and named, never
            left as an "etc." — a new patch's wording lands here and the build says so.

The cards are ours, so they never pretend otherwise: their own kind, their own label, the source named on
each one, and a mark of its own where their words are read (assets/kinds.js words.mark 'open', the word with
a question behind it rather than the footnote our mechanics cards wear). Nothing a player wrote is on the
card as the game's own word: what the game states is the card's lines, and what a player tested is under
"What players report", named and dated, in their own words.

They are not mechanics cards and they do not pretend to be one. A mechanics card answers a question
(docs/mechanics-cards.md states the test it has to pass); an interaction card holds a question open. Where
one of these is settled — by the game writing an entry, or by our own testing — it stops being one of these
and becomes a keyword chip or a mechanics card, and the count below moves.

The five families, which are the shapes the game's own wording takes:

  recovery    an amount put back into a pool: Recovery, Regeneration, Leech, Recoup, a Flask
  conversion  a thing becoming, or copying into, another thing: Converted to, gained as extra
  trigger     an event setting something off: when you, whenever, each time, on Kill
  condition   something true for the modifier to apply: while, during, against, if you
  exclusion   something that does not happen: cannot, never, instead of, other than, Immune

Which words open which card sits in CARDS below, in "words", and the page marks them as it draws
(assets/marks.js reads the same declaration every keyword and mechanics word is marked from). Nothing is
written into the index for them, the way nothing is written in for a keyword: 3,000 more spans would push
data/index-core.json past its size budget, and the browser already holds every card.

What it writes:
  data/interactions.json   the counts the build reports and the guard holds, the open interactions, and the
                           wording still left plain. The builder's maths and the bench read the open list:
                           an unknown interaction widens a range and is named, and a player can carry on as
                           if it works or as if it does not (assets/clarify.js assume/assumption).

Usage:  python tools/interactions.py     put these cards in data/index.json, relink it, write the two parts
tools/sync.py calls build() while it builds the index and write() once the index is whole, so a full sync
needs no extra step.
"""
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from map import Marks  # noqa: E402  (assets/marks.js in Python: the same vocabulary, the same rules)
from phrases import Matcher  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
KIND = 'q'          # an interaction card: ours, and open until somebody settles it
OUT = ROOT / 'data' / 'interactions.json'

# The lines a player reads, per kind of card: the game's own wording, wherever the site shows it.
LINE_FIELDS = {'u': 'ls', 'b': 'ls', 'p': 'ls', 'g': 't', 'h': 'ls', 'w': 't', 'a': 'ls', 'c': 't'}

# What one of the five families is, in the game's own terms. A card's sub line says what it is and which
# family it is in, so the card states its own standing before a word of it is read.
SUB = 'Not settled · '
FAMILIES = {
    'recovery':   'Recovery',
    'conversion': 'Conversion',
    'trigger':    'Trigger',
    'condition':  'Condition',
    'exclusion':  'Exclusion',
}

# Named on the cards, where the player reads it. An interaction card's source is the game for what the game
# states and nobody for the rest, which is the whole point of the card.
GAME = "The game's own entries for what is stated here. What is not settled is not stated anywhere official."


# ---------- the cards: the interactions nobody has settled ----------
# "words" are the wording that opens the card, in the forms the game writes them; the page marks them as it
# draws (assets/marks.js), gated 'any' because each phrase only ever names the interaction.
CARDS = [
    {'id': 'Recovery', 'n': 'Recovery', 'fam': 'recovery',
     'words': ['Recovery', 'recovery', 'Recover', 'recover', 'Recovers', 'recovers', 'Recovered', 'recovered',
               'Recovering', 'recovering', 'Restore', 'restore', 'Restores', 'restores', 'Restored',
               'restored', 'Restoring', 'restoring', 'Replenish', 'replenish', 'Replenishes', 'replenishes',
               'Heal', 'heal', 'Heals', 'heals', 'Healed', 'healed', 'leech', 'leeches', 'leeching'],
     'q': 'recovery recover recovery rate life mana energy shield flask leech recoup regeneration instant '
          'heal restore replenish how fast does recovery arrive',
     'ls': ['Recovery is an amount of Life, Mana or Energy Shield put back into the pool it came out of.',
            'Flasks, Leech, Recoup and Regeneration are each a source of Recovery, and the game states each '
            'one on its own.',
            'A Recovery Rate modifier changes how fast an amount arrives, not how much of it arrives.',
            'Not settled: which sources a modifier to Recovery Rate reaches, and whether an Instant Recovery '
            'is modified by it at all. The game has no entry for Recovery itself.']},

    {'id': 'Regeneration', 'n': 'Regeneration', 'fam': 'recovery',
     'words': ['Regeneration', 'regeneration', 'Regenerate', 'regenerate', 'Regenerates', 'regenerates',
               'Regenerating', 'regenerating', 'Regenerated', 'regenerated'],
     'q': 'regeneration regenerate life regeneration mana regeneration per second tick degeneration '
          'recovery rate how often does regeneration tick',
     'ls': ['Regeneration puts an amount back every second, with no Hit, Flask or Kill behind it.',
            'It is stated per second, and as a percentage it is a share of the pool it fills.',
            'Not settled: how often the amount actually arrives, and whether a modifier to Recovery Rate '
            'reaches it. The game states neither.']},

    {'id': 'Trigger', 'n': 'What sets it off', 'fam': 'trigger',
     'words': ['Trigger', 'trigger', 'triggers', 'triggered', 'triggering', 'when you', 'When you',
               'whenever', 'Whenever', 'each time', 'Each time', 'after you', 'After you', 'on Kill',
               'on Kills', 'on Killing'],
     'q': 'trigger triggered when you whenever each time on kill order of triggers chain cooldown what sets '
          'it off',
     'ls': ['A Triggered Skill is used by something other than pressing its key: a Hit, a Kill, a Skill '
            'used, time passing.',
            'The game names the event on each Skill that has one, and its Triggered Skills entry states the '
            'shape.',
            'Not settled: the order two effects set off by the same event run in, and whether an effect set '
            'off by another effect can set off a third.']},

    {'id': 'While', 'n': 'While it holds', 'fam': 'condition',
     'words': ['while', 'While', 'during', 'During', 'when on', 'When on'],
     'q': 'while during when on low life full life condition holds continuous buff ends ailment already '
          'running',
     'ls': ['A modifier written with while, during or when on applies for as long as that is true and no '
            'longer.',
            'The condition is read as the modifier is used, so it turns on and off inside a fight.',
            'Not settled: whether a condition that ends while an Ailment or a Damage over Time from it is '
            'still running keeps modifying that damage.']},

    {'id': 'IfYou', 'n': 'Only if', 'fam': 'condition',
     'words': ['if you', 'If you', 'at least', 'At least'],
     'q': 'if you have at least with at least condition checked when hit lands skill used threshold',
     'ls': ['A modifier written with if you, with at least or have at least applies only when that is true '
            'of you.',
            'Not settled: when it is read — as the Skill is used, as the Hit lands, or every moment in '
            'between. The game states none of the three.']},

    {'id': 'Against', 'n': 'Against whom', 'fam': 'condition',
     'words': ['against', 'Against'],
     'q': 'against enemies rare unique bosses full life low life chilled ignited target condition minion '
          'totem ailment',
     'ls': ['A modifier written with against applies only to what it names: a kind of enemy, a state an '
            'enemy is in, or a kind of damage coming at you.',
            'Not settled: whether against reaches the Ailment a Hit leaves behind, and whether it reads the '
            'state at the moment the Hit lands.']},

    {'id': 'Instead', 'n': 'Instead of', 'fam': 'exclusion',
     'words': ['instead of', 'Instead of', 'instead', 'Instead', 'in place of', 'In place of', 'replace',
               'Replace', 'replaces', 'Replaces', 'replaced', 'Replaced', 'replacing', 'Replacing'],
     'q': 'instead of in place of replaces replaced overrides two replacements same thing which one wins',
     'ls': ['Instead replaces. What the line names takes the place of what would have happened, and the '
            'original does not also happen.',
            'Not settled: what happens where two sources each replace the same thing.']},

    {'id': 'Cannot', 'n': 'Cannot', 'fam': 'exclusion',
     'words': ['cannot', 'Cannot', 'can not', 'Can not', 'do not', 'Do not', 'does not', 'Does not',
               'no longer', 'No longer', 'never', 'Never', 'prevent', 'Prevent', 'prevents', 'Prevents',
               'prevented', 'Prevented', 'preventing', 'Preventing'],
     'q': 'cannot can not never no longer prevents prevented absolute overrides granted anyway does nothing',
     'ls': ['Cannot is absolute. A modifier that grants what a cannot forbids does nothing at all.',
            'A cannot is not a number: nothing raises it, lowers it or outweighs it.',
            'Not settled: whether a cannot from a source that has ended leaves an effect already running in '
            'place, and which wins where one source forbids what another grants.']},

    {'id': 'Immune', 'n': 'Immune and unaffected', 'fam': 'exclusion',
     'words': ['Immune', 'Immunity', 'immunity', 'immune', 'bypass', 'Bypass', 'bypasses', 'Bypasses', 'bypassed',
               'Bypassed', 'bypassing', 'Bypassing', 'unaffected', 'ignore', 'ignores', 'ignoring',
               'ignored'],
     'q': 'immune immunity unaffected by bypass ignores ailment applied counted removed still on you',
     'ls': ['Immune means the thing is not applied at all.',
            'Unaffected means the thing is applied and does nothing while that holds, so anything counting '
            'what is on you still counts it.',
            'Not settled: which of the two each wording is, where the game names neither.']},

    {'id': 'OtherThan', 'n': 'Other than', 'fam': 'exclusion',
     'words': ['other than', 'Other than', 'except', 'Except', 'except for', 'Except for'],
     'q': 'other than except for excluding exception set sources anything other than you',
     'ls': ['Other than and except take something back out of the set the line has just named.',
            'Not settled: whether the exception reaches the sources a set is built from, or only the set '
            'itself.']},

    {'id': 'Applies', 'n': 'What it applies to', 'fam': 'condition',
     'words': ['applies to', 'Applies to', 'apply to', 'Apply to', 'applies', 'Applies', 'apply', 'Apply',
               'applied', 'Applied', 'applying', 'Applying', 'affect', 'Affect', 'affects', 'Affects',
               'affected', 'Affected', 'affecting', 'Affecting'],
     'q': 'applies to apply affects affected minions totems allies ailments which things does it reach',
     'ls': ['A line that says what it applies to names the set it reaches, and reaches nothing outside it.',
            'Not settled: whether it reaches a Minion, a Totem or an Ailment of yours where the line names '
            'none of them.']},

    {'id': 'Stacks', 'n': 'Stacking and counting', 'fam': 'condition',
     'words': ['stack', 'Stack', 'stacks', 'stacking', 'Stacking', 'stacked', 'count as', 'Count as',
               'counts as', 'Counts as', 'counted as', 'Counted as', 'treated as', 'Treated as', 'count',
               'counts', 'counted', 'counting', 'counts towards', 'counts toward'],
     'q': 'stack stacking counts as treated as two of the same source duplicate double counted set',
     'ls': ['Two modifiers of the same wording from different sources both apply, unless a line says '
            'otherwise.',
            'Counts as and treated as put a thing into a set, for everything that reads that set.',
            'Not settled: whether counts as reaches a condition reading the same set, and how many times one '
            'source can be counted.']},

    {'id': 'Converted', 'n': 'Converted and gained', 'fam': 'conversion',
     'words': ['converted', 'converts', 'convert', 'converting', 'Conversion', 'conversion',
               'gained as', 'gains as'],
     'q': 'converted conversion convert gained as extra damage stat which increases apply chain twice',
     'ls': ['Conversion changes what a thing is. Gained as adds a copy of it and leaves the original alone.',
            'The game states both for damage, and its Damage Conversion entry settles which modifiers the '
            'converted part scales with.',
            'Not settled: how either behaves on a stat that is not damage, and what a second source of '
            'conversion does to a portion the first has already converted.']},
]

# Every interaction word the game writes, in the forms it writes them. A site this finds is mapped, marked or
# named as plain — and a form the game starts using that is on none of the cards above lands in that last
# bucket, so the build says so instead of a word quietly going by unread.
NET = sorted({
    w for c in CARDS for w in c['words']
} | {
    # the wording the game's own entries already answer: the count proves it is answered, not overlooked
    'Recovery', 'Recover', 'Recovers', 'Recovered', 'Recovering', 'Leech', 'Leeches', 'Leeching', 'Leeched',
    'Recoup', 'Recouped', 'Recoups', 'Regenerate', 'Regenerates',
    'Converted', 'Converted to', 'Conversion', 'as extra', 'as Extra', 'Gained as', 'gained as',
    'Trigger', 'Triggered', 'Triggers', 'Triggering', 'on Hit', 'on Kill', 'on Killing',
    'while', 'While', 'during', 'During', 'against', 'Against', 'if you', 'If you', 'at least',
    'cannot', 'Cannot', 'Unaffected', 'unaffected', 'Immune', 'immune', 'Ignore', 'Ignores', 'Ignoring',
    'instead', 'Instead', 'instead of', 'Instead of', 'other than', 'Other than', 'except', 'Except',
})


def build():
    """The interaction cards, as the index holds them."""
    out = []
    for c in CARDS:
        out.append({'k': KIND, 'id': c['id'], 'n': c['n'], 's': SUB + FAMILIES[c['fam']], 'ls': list(c['ls']),
                    'q': c['q'], 'src': GAME, 'f': list(c['words']), 'fg': 'any'})
    return out


def lines_of(it):
    """The lines this card shows, in the order it shows them."""
    f = LINE_FIELDS.get(it['k'])
    if not f:
        return []
    v = it.get(f)
    return list(v) if isinstance(v, list) else ([v] if v else [])


class Every:
    """A card carrying every keyword there is: the probe above asks what the game's markup could mark here."""

    def __contains__(self, x):
        return True


EVERY = Every()


class Survey:
    """Every site the net finds, settled into one of the three buckets.

    A site is one occurrence of one interaction word in one line the game wrote. Whether it opens a card is
    not guessed at: it is the page's own answer, off assets/marks.js in Python (tools/map.py Marks), over the
    same index the browser holds.
    """

    WORD = re.compile(r'\w+', re.A)

    def __init__(self, index):
        self.index = index
        self.marks = Marks(index['items'], index.get('kwx') or {})
        self.net = {}
        first = defaultdict(list)
        for p in NET:
            m = self.WORD.match(p)
            if m:
                first[m.group(0)].append(p)
        for rows in first.values():
            rows.sort(key=len, reverse=True)
        self.first = first
        self.mine = {w: KIND + ':' + c['id'] for c in CARDS for w in c['words']}
        # a phrase two cards answer to opens nothing and still holds its ground (assets/marks.js): the
        # frame's own rule, so a site under one is spoken for rather than unread
        self.shared = Matcher({p: 1 for rows in self.marks.first.values()
                               for p, key, _ in rows if key == 0}, skip_bad=True)

    def sites(self, text):
        """The net's own matches in one line: the longest at each place, never one inside another."""
        out, at = [], 0
        for m in self.WORD.finditer(text):
            if m.start() < at:
                continue
            for p in self.first.get(m.group(0), ()):
                s, e = m.start(), m.start() + len(p)
                if not text.startswith(p, s) or (e < len(text) and self.WORD.match(text[e])):
                    continue
                out.append((s, e, p))
                at = e
                break
        return out

    def run(self):
        rep = {'mapped': Counter(), 'marked': Counter(), 'itself': Counter(), 'unmarked': Counter(),
               'shared': Counter(), 'plain': Counter(), 'to': Counter(), 'on': defaultdict(set), 'lines': 0,
               'words': Counter(), 'plainex': {}, 'unmarkedto': Counter()}
        for it in self.index['items']:
            mine = it['k'] + ':' + it['id']
            # the same line read twice: once as the card really draws it, and once as a card with every
            # keyword on it and no name of its own. The difference is the two rules the frame already
            # settles — a card is never its own door, and a keyword's other spellings count only where the
            # game's own markup marks them — so each is its own count and not a word left unread.
            probe = {'k': it['k'], 'id': '\u0000', 'kw': EVERY}
            for text in lines_of(it):
                rep['lines'] += 1
                opens = self.marks.spans(it, text, None)
                anywhere = None
                for s, e, p in self.sites(text):
                    rep['words'][p] += 1
                    door = next((k for a, b, k in opens if s < b and e > a), None)
                    if door and door[0] != KIND:
                        rep['mapped'][p] += 1
                        rep['to'][door] += 1
                        continue
                    if door:
                        rep['marked'][p] += 1
                        rep['to'][door] += 1
                        rep['on'][door].add(mine)
                        continue
                    if anywhere is None:
                        anywhere = self.marks.spans(probe, text, None)
                    could = next((k for a, b, k in anywhere if s < b and e > a), None)
                    if could == mine:
                        rep['itself'][p] += 1
                    elif could:
                        rep['unmarked'][p] += 1
                        rep['unmarkedto'][could] += 1
                    elif any(a <= s and b >= e for a, b, _, _ in self.shared.find(text)):
                        rep['shared'][p] += 1
                    else:
                        rep['plain'][p] += 1
                        rep['plainex'].setdefault(p, text[:110])
        return rep


def survey(index):
    return Survey(index).run()


def counts(rep):
    """What the build reports every run, and what tools/dev/guard.mjs holds the site to."""
    n = {b: sum(rep[b].values()) for b in ('mapped', 'marked', 'itself', 'unmarked', 'shared', 'plain')}
    n['sites'] = sum(n.values())
    n['words'], n['cards'], n['lines'] = len(NET), len(CARDS), rep['lines']
    return n


def write(index, rep=None):
    """data/interactions.json: the counts, the open interactions and the wording still left plain."""
    rep = survey(index) if rep is None else rep
    open_rows = []
    for c in CARDS:
        key = KIND + ':' + c['id']
        open_rows.append({'k': key, 'n': c['n'], 'fam': c['fam'], 'sub': SUB + FAMILIES[c['fam']],
                          'read': rep['to'][key], 'on': len(rep['on'][key])})
    body = {
        'gen': index.get('gen') or '',
        'n': counts(rep),
        # the open interactions, for the builder's maths and the bench: an unknown one widens a range and is
        # named, and a player can carry on as if it works or as if it does not (assets/clarify.js)
        'open': open_rows,
        'plain': [[p, n] for p, n in rep['plain'].most_common()],
    }
    # written as bytes, so the one newline in it is the one the repo keeps (.gitattributes eol=lf)
    OUT.write_bytes(json.dumps(body, ensure_ascii=False, separators=(',', ':')).encode('utf-8') + b'\n')
    return body


def report(rep):
    n = counts(rep)
    print('interactions: %d sites in %d lines · %d mapped to a card that answers them, %d marked unclear, '
          '%d spoken for by the frame, %d left plain'
          % (n['sites'], n['lines'], n['mapped'], n['marked'],
             n['itself'] + n['unmarked'] + n['shared'], n['plain']))
    print('  spoken for: %d read on the very card that answers them (a card is never its own door), '
          '%d the game has an entry for and does not mark here (its own markup decides), '
          '%d under a phrase two cards answer to (it holds its ground and opens neither)'
          % (n['itself'], n['unmarked'], n['shared']))
    print('  the cards a mapped site opens: ' +
          ', '.join('%s %d' % (k, v) for k, v in rep['to'].most_common() if not k.startswith(KIND + ':'))[:400])
    print('  marked unclear, per card (%d of them):' % len(CARDS))
    for c in CARDS:
        key = KIND + ':' + c['id']
        print('    %-24s %-11s %5d read on %4d cards' % (c['n'], FAMILIES[c['fam']], rep['to'][key],
                                                         len(rep['on'][key])))
    if rep['plain']:
        print('  left plain, and what the line says:')
        for p, n in rep['plain'].most_common(20):
            print('    %-18s %4d  %s' % (p, n, rep['plainex'].get(p, '')))


def main():
    f = ROOT / 'data' / 'index.json'
    index = json.loads(f.read_text(encoding='utf-8'))
    was = len(index['items'])
    index['items'] = [it for it in index['items'] if it['k'] != KIND] + build()
    print('cards: %d -> %d (%d interaction cards)' % (was, len(index['items']), len(CARDS)))
    import nodelinks
    rel = nodelinks.attach(index)
    f.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    nodelinks.report(index, rel)
    rep = survey(index)
    write(index, rep)
    report(rep)
    import appdata   # the two parts the home page loads
    appdata.write(index)
    return 0


if __name__ == '__main__':
    sys.exit(main())
