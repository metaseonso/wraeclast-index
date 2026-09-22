"""Our own cards: how the numbers on a mod line stack.

A player asked why a passive saying "increased" shows no keyword chip. It shows none because the game's own
glossary has no entry for increased, reduced, more or less, and the game never marks those words. The
behaviour is real all the same, and 1,700-odd cards in the index are written in those words, so the words
themselves are the door: these cards say what the maths does, and the lines that use the words lead to them.

They are not game text, so they never pretend to be:
  * their own kind ("h"), their own label, and no keyword chips
  * each one carries the source it was read off ("src"), shown on the card itself (assets/app.js)
  * the page draws the words that lead here differently from the game's keyword chips (.hlink, cards.css)

What was read for these, in PathOfBuilding-PoE2 (src/Modules), and what it says:
  CalcOffence.lua, the damage a hit deals:
      local inc = 1 + skillModList:Sum("INC", cfg, unpack(modNames)) / 100
      local more = skillModList:More(cfg, unpack(modNames))
      return round(summedMin * inc * more * moreMinDamage + addMin), ...
    every INC is summed and applied once; every MORE is its own multiplier; the added damage (BASE) is
    already inside summedMin, so the increases work on it too.
  CalcOffence.lua, in as many words, on the area maths:
      ---@param incArea number @Additive modifier
      ---@param moreArea number @Multiplicative modifier
  CalcDefence.lua, Life, Mana and Spirit, the same shape:
      output[res] = override or m_max(round((base * (1 - conv/100) + extra) * (1 + inc/100) * more + total), 1)
  CalcPerform.lua, buff and aura effect, the same shape again: (1 + inc / 100) * more
The PoE2 wiki was not readable (its host turns the fetch away), so it is not named on the cards.

The words a card is reached by sit in "f", which tools/nodelinks.py already reads as the other spellings of a
keyword. A word is only a door where the line uses it as a number — "40% less Attack Damage", "Adds 8 to 18
Cold Damage" — never in prose ("no more than once every 3 seconds"): see gate().

Usage:  python tools/concepts.py     put these cards in data/index.json, relink it, write the two parts
tools/sync.py calls build() while it builds the index, so a full sync needs no extra step.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KIND = 'h'          # a concept card: ours, never the game's
SUB = 'How the numbers stack'
# Named on every one of these cards, where the player reads it. The game does not state any of this.
SOURCE = "How it stacks: according to Path of Building's own damage maths. The game never says it."

# A word only counts where the line uses it as a number. PCT: "(30-40)% more", "5% reduced". START: the word
# opens the line, which is the only way the game writes an added-damage mod.
PCT = re.compile(r'%\s*$')
GATES = {'pct': lambda line, s: bool(PCT.search(line[:s])), 'start': lambda line, s: s == 0}

# The cards themselves. "words" are what a mod line has to say to reach them, "gate" when it counts.
CARDS = [
    {'id': 'IncreasedReduced', 'n': 'Increased and reduced', 'words': ['increased', 'reduced'], 'gate': 'pct',
     'ls': ['Every increased and reduced line for the same stat lands in one sum. Add them up, apply once.',
            'Honed Instincts 8% increased Attack Speed, Deep Trance 8%, Chakra of Rhythm 6%, Crushing Verdict '
            '5% reduced: 8 + 8 + 6 − 5 = 17, so attack speed × 1.17.',
            'That sum gets crowded. At 300% increased you are on × 4.00, and the next 20% increased takes '
            'you to × 4.20 — a 5% gain, not 20%.']},
    {'id': 'MoreLess', 'n': 'More and less', 'words': ['more', 'less'], 'gate': 'pct',
     'ls': ['More and less never join that sum. Each line is its own multiplier, on top of everything else.',
            "Quill Rain has 40% less Attack Damage, so × 0.60. Add Crushing Verdict's 50% increased "
            'Attack Damage and it is 1.50 × 0.60 = 0.90 — still under where you started.',
            'Reduced would have joined the sum instead: 50 − 40 = 10, so × 1.10. Same numbers, '
            'different answer.',
            'Two more lines multiply each other: 20% more and 50% more is 1.20 × 1.50 = 1.80, not 70%. '
            'Nothing crowds them out, which is why they are rare.']},
    {'id': 'AddedDamage', 'n': 'Added damage', 'words': ['Adds'], 'gate': 'start',
     'ls': ['An Adds line goes into the base damage first. The increased sum and the more multipliers then '
            'work on that bigger base.',
            "Winter's Bite adds 8 to 18 Cold Damage, 13 on average. At 100% increased Cold Damage that 13 "
            'is doing 26; at 300% increased it is doing 52.',
            'So a flat roll is worth more the more increases you already have, and increases are worth more '
            'the more flat damage you already have.']},
]


def build():
    """The concept cards, as the index holds them."""
    out = []
    for c in CARDS:
        out.append({'k': KIND, 'id': c['id'], 'n': c['n'], 's': SUB, 'ls': list(c['ls']),
                    'f': list(c['words']), 'q': ' '.join(c['words']).lower(), 'src': SOURCE})
    return out


_GATE = {w: GATES[c['gate']] for c in CARDS for w in c['words']}


def gate(word, line, s):
    """Does this line use the word as a number, here? (tools/nodelinks.py asks before making it a door)"""
    g = _GATE.get(word)
    return g(line, s) if g else True


def main():
    import nodelinks
    f = ROOT / 'data' / 'index.json'
    index = json.loads(f.read_text(encoding='utf-8'))
    was = len(index['items'])
    index['items'] = [it for it in index['items'] if it['k'] != KIND] + build()
    print('cards: %d -> %d (%d concept cards)' % (was, len(index['items']), len(CARDS)))
    rep = nodelinks.attach(index)
    f.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    nodelinks.report(index, rep)
    import appdata   # the two parts the home page loads
    appdata.write(index)
    return 0


if __name__ == '__main__':
    sys.exit(main())
