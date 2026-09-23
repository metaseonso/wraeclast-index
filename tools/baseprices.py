"""Build data/basequeries.json: which base items get live prices, and the trade search that asks for each one.

tools/pricepull.py works through this list a share of every run, the same way it works through the mod rolls
and the farm inputs, and the site serves what comes back under the base's own name (worker/prices.js), so a
base card carries a price the way a unique's card does and the Craft tab can say what the item itself costs.

Which bases. There are 1,554 of them and an hour holds 88 checks, so the whole lot is a pass of nearly three
days and every other kind of price waits behind it (the arithmetic is at the top of tools/pricepull.py). What
a player buys white is the best base of the kind they are crafting, so that is the rule. A shape is an item
class and the defences its bases come in — a body armour of evasion and energy shield is not a body armour of
armour, and a player shopping for one will not take the other — and the list is every base at the top drop
level of its shape. Every base at that level, so two that drop together are never split by a tiebreak.
Today that is 62 shapes and 108 bases.

LEVELS is where it widens: 2 takes the top two drop levels of each shape (201 bases), 3 the top three (304).
Every base added takes its share of the hour off every other kind of price, so the number sits here, with
what it costs written down beside it, and is not left to be guessed at.

What is asked for. The white base and nothing else: rarity "normal". A rare of the same name is a different
item at a different price on the trade site and never stands in for this one.

The craft tables are the source (tools/craft.py, data/craft/*.json). A patch that empties one of them must not
empty this list with it, so the pull runs under the last-good rule (tools/lastgood.py): the committed file
stays, the run goes red and says why, and a ticket goes up.

Run it after tools/craft.py, once per game patch:

    python tools/baseprices.py
    python tools/baseprices.py --dry     print the list and the arithmetic, write nothing
"""
import datetime as dt
import json
import sys
from pathlib import Path

import lastgood

CRAFT = lastgood.DATA / 'craft'      # the same data/ the committed list is held up against
SOURCE = 'data/craft/*.json'
OUT = 'basequeries.json'
LEVELS = 1     # drop levels per shape: see the top of this file before moving it
FLOOR = 50     # fewer than this is the craft tables broken, not a patch: keep the last good list
BUDGET = 88    # searches in one run, and the rest of the arithmetic: tools/pricepull.py
CYCLE = 24     # hours a full pass of every price on the site should take
REST = 798     # everything else already in that pass, so this can say what it takes from them


def shapes():
    """Every base in the game, by the shape a player shops in: its item class and the defences it comes in.
    Read from the Craft tab's own tables, so the list is whatever the last patch left there."""
    out = {}
    for f in sorted(CRAFT.glob('*.json')):
        data = json.loads(f.read_text(encoding='utf-8'))
        for b in data.get('bases') or []:
            if b.get('n') and b.get('dl'):
                out.setdefault((f.stem, b.get('d') or ''), []).append(b)
    return out


def ranked(groups, levels=LEVELS):
    """The bases worth a check: the top `levels` drop levels of each shape, every base standing at them.
    Highest first inside a shape, and a name is only ever asked for once."""
    out, seen = [], set()
    for (cls, mix), bases in sorted(groups.items()):
        want = sorted({b['dl'] for b in bases}, reverse=True)[:levels]
        for b in sorted(bases, key=lambda b: (-b['dl'], b['n'])):
            if b['dl'] in want and b['n'] not in seen:
                seen.add(b['n'])
                out.append((cls, mix, b))
    return out


def query(name):
    """The search this sends to the trade site: the white one, from sellers who are online."""
    return {'query': {'status': {'option': 'online'}, 'type': name,
                      'filters': {'type_filters': {'filters': {'rarity': {'option': 'normal'}}}}},
            'sort': {'price': 'asc'}}


def build():
    groups = shapes()
    if not groups:
        raise lastgood.Stale('the craft tables name no bases')
    rows = ranked(groups)
    return {'updated': dt.date.today().isoformat(), 'levels': LEVELS, 'rarity': 'normal',
            'why': 'Every base at the top drop level of its shape (item class and defences). The white one '
                   'only: a rare of the same name is another item at another price. tools/baseprices.py.',
            'queries': [{'key': b['n'], 'label': '%s: white, drops from level %d' % (b['n'], b['dl']),
                         'query': query(b['n'])} for _, _, b in rows]}


def arithmetic(n):
    """What this list costs the rest of the pass, in the terms tools/pricepull.py states it in."""
    was, now = REST / BUDGET, (REST + n) / BUDGET
    print('%d bases, %d things in the pass now (%d before)' % (n, REST + n, REST))
    print('  a full pass: every %.1f h, %.1f h before, against the %d h it should take' % (now, was, CYCLE))
    print('  the share of one run: uniques %.0f, was %.0f' % (BUDGET * 644 / (REST + n), BUDGET * 644 / REST))


def main():
    out = lastgood.pull('Base price list', build, file=OUT, url=SOURCE, at='queries', floor=FLOOR)
    if out is None:
        return lastgood.report()
    rows = out['queries']
    for q in rows:
        print(' ', q['label'])
    arithmetic(len(rows))
    if '--dry' in sys.argv:
        print('--dry: nothing written')
        return lastgood.report()
    lastgood.save(lastgood.DATA / OUT, json.dumps(out, ensure_ascii=False, separators=(',', ':')))
    print('wrote data/%s' % OUT)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Base price list', file=OUT, url=SOURCE, at='queries'))
