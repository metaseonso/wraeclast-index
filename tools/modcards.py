"""The modifiers as cards: every Trial modifier and every Rare monster modifier, joined onto the index as cards of
their own (issues #82, #112; design/trials.md, design/monster-mods.md, docs/data-plan.md).

Reads the tables the builders before it wrote, and nothing from outside:

  data/trials.json       tools/trials.py: everything a player meets in the Trial of Chaos and the Trial of the
                         Sekhemas, with its tiers, what it does to you and what it pays
  data/monstermods.json  tools/monstermods.py: every name a rare monster wears over its life bar, what it does in
                         the game's own help text and lines, and what it does to you
  data/bosses.json and the index itself: the cards a trial floor, a relic modifier and a Barya answer to

Writes two kinds onto data/index.json (assets/kinds.js declares them), then the two parts the app loads
(tools/appdata.py):

  l  Trial modifier          one per entry of data/trials.json but the four Ascensions, which are the
                             Ascendancy cards' (tools/ascendancies.py)
  m  Rare monster modifier   one per name

A rare monster modifier stands for the keyword card the game's help text makes of the same name
(tools/gamelib.py cards them): those keyword cards are taken off the index here, so one thing has one card. The
crawler gives the modifier card the keyword's old address where the name is the same (worker/seo.js), and
_redirects carries the few whose address moves.

What it does to you ("dg", the words #77 tags map modifiers with) is one list on both kinds, so the Connections
group "Does the same to you" answers across both (assets/kinds.js MAPS danger). A tag read off a name alone is
in "est" and says Estimate. Anything the files leave unsure carries "un", the Subject to change pill.

    python tools/modcards.py
"""
import json
import re
from pathlib import Path

import appdata
import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DOT = ' · '
KINDS = ('l', 'm')   # the kinds this tool writes, and takes off again before it writes them
OWNERS = ('Ascension',)   # entries of data/trials.json that are another kind's (the Ascendancy cards)

NUM = re.compile(r'(?<![\d.])(\d+(?:\.\d+)?)(?![\d.]| ?metre)')    # a number in the game's words, not a distance
HASH = re.compile(r'\(([-+]?\d+(?:\.\d+)?)-([-+]?\d+(?:\.\d+)?)\)|([-+]?\d+(?:\.\d+)?)')
CONTAINS = re.compile(r'^Contains (.+)$')


def load(name, default=None):
    try:
        return json.loads((DATA / name).read_text(encoding='utf-8'))
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def flat(alt):
    """Another step's lines: a list of lines, or a list of other versions each a list of lines."""
    out = []
    for x in alt or []:
        out.extend(x if isinstance(x, list) else [x])
    return out


def trim(x):
    return ('%g' % x) if isinstance(x, float) else str(x)


def relic_name(r):
    """A relic modifier's name, as the game prints its lines: the "#" of the stat's own wording filled with the
    range every tier together rolls, "(5-25)% increased maximum Life". A number every tier shares stays one
    number. Where a tier's line does not read against the wording, the name stays as it came, never guessed."""
    parts = r['n'].split('#')
    if len(parts) == 1:
        return r['n']
    pat = re.compile('^' + r'(.+?)'.join(re.escape(p) for p in parts) + '$')
    lows, highs = [None] * (len(parts) - 1), [None] * (len(parts) - 1)
    for t in r.get('tiers') or []:
        m = pat.match((t.get('ls') or [''])[0])
        if not m:
            return None
        for i, g in enumerate(m.groups()):
            h = HASH.fullmatch(g)
            if not h:
                return None
            a, b = (float(h.group(1)), float(h.group(2))) if h.group(1) else (float(h.group(3)),) * 2
            lo, hi = min(a, b), max(a, b)
            lows[i] = lo if lows[i] is None else min(lows[i], lo)
            highs[i] = hi if highs[i] is None else max(highs[i], hi)
    if None in lows:
        return None
    fill = [trim(int(lo) if lo == int(lo) else lo) if lo == hi else
            '(%s-%s)' % (trim(int(lo) if lo == int(lo) else lo), trim(int(hi) if hi == int(hi) else hi))
            for lo, hi in zip(lows, highs)]
    return ''.join(p + (fill[i] if i < len(fill) else '') for i, p in enumerate(parts))


def help_differs(r):
    """The help text and the lines give other numbers (a distance aside): the help is a separate entry in the
    game and can lag behind the stats, so the card says Subject to change (design/monster-mods.md)."""
    if not r.get('t') or not r.get('ls'):
        return False
    said = {abs(float(x)) for x in NUM.findall(r['t'])}
    lines = {abs(float(x)) for x in NUM.findall(' '.join(r['ls']))}
    return bool(said) and said != lines


def main():
    index = load('index.json')
    trials = load('trials.json')
    mons = load('monstermods.json')
    bosses = {b['name'] for b in load('bosses.json', {'bosses': []}).get('bosses') or []}

    # the keyword cards a rare monster modifier stands for: the help entry its row names, and a keyword card of
    # the same name keyed as a monster's help entry (a weaker step's). A keyword that is a word of its own
    # (Enraged, Soul Eater, Reviving Minions: what a player's own skills do) keeps its card.
    names = {r['n'] for r in mons['rows']}
    helps = {r['kwx'] for r in mons['rows'] if r.get('kwx')}
    fold = {it['id'] for it in index['items'] if it['k'] == 'w' and it['n'] in names
            and (it['id'] in helps or it['id'].startswith('Monster'))}
    items = [it for it in index['items'] if it['k'] not in KINDS and not (it['k'] == 'w' and it['id'] in fold)]
    by_name = {}
    for it in items:
        by_name.setdefault(it['n'], []).append(it)

    def key_of(name, kind):
        return next((kind + ':' + it['id'] for it in by_name.get(name, []) if it['k'] == kind), None)

    counts = {'unsure': 0, 'marked': 0, 'tagged': 0, 'renamed': 0}

    # ---------- trial modifiers ----------
    rows_l = []
    for r in trials['rows']:
        if r['s'] in OWNERS:
            continue
        row = {'k': 'l', 'id': r['id'], 'n': r['n'], 's': r['s']}
        if '#' in r['n']:
            n = relic_name(r)
            if n:
                row['n'] = n
                counts['renamed'] += 1
        for f in ('on', 'mark', 'steps', 'rooms', 'level', 'gen', 'ls', 't', 'risk', 'reward', 'why', 'names'):
            if r.get(f) not in (None, '', []):
                row[f] = r[f]
        if row.get('ls') and set(row['ls']) <= {row.get('risk'), row.get('reward')}:
            del row['ls']   # a pledge: its two lines are its cost and its gain, drawn once, as the two
        if r.get('tiers'):
            row['tiers'] = [{k: v for k, v in t.items() if k in ('n', 'step', 'ls', 'rarity', 'level')}
                            for t in r['tiers']]
        if r.get('alt'):
            row['alt'] = flat(r['alt'])
        if r.get('later'):
            row['un'] = 1
            counts['unsure'] += 1
        if r.get('mark'):
            counts['marked'] += 1
        if r.get('tags'):
            row['dg'] = r['tags']
            counts['tagged'] += 1
        # the cards it names: the relic bases it rolls on, the Barya a floor takes, the boss a floor holds
        rb = [k for k in (key_of(x, 'b') for x in r.get('relics') or []) if k]
        if rb:
            row['rb'] = rb
        kx = key_of(r['key'], 'c') if r.get('key') else None
        if kx:
            row['kx'] = [kx]
        bx = []
        for line in r.get('ls') or [] if r['s'] == 'Trial of the Sekhemas floor' else []:
            m = CONTAINS.match(line)
            if m and m.group(1) in bosses:
                bx.append('x:' + m.group(1))
        if bx:
            row['bx'] = bx
        row['src'] = r.get('src') or 'Source: the game files'
        # search words: the file's own, and the relics it rolls on (the card shows them under Connections)
        q = ' '.join(x for x in [r.get('q')] + list(r.get('relics') or []) if x)
        if q:
            row['q'] = q
        rows_l.append(row)

    # ---------- rare monster modifiers ----------
    rows_m = []
    for r in mons['rows']:
        row = {'k': 'm', 'id': r['id'], 'n': r['n'], 's': r['s']}
        for f in ('steps', 't', 'ls', 'kw', 'est', 'src', 'q'):
            if r.get(f) not in (None, '', []):
                row[f] = r[f]
        if r.get('alt'):
            row['alt'] = flat(r['alt'])
        if r.get('tags'):
            row['dg'] = r['tags']
            counts['tagged'] += 1
        if help_differs(r):
            row['un'] = 1
            counts['unsure'] += 1
        rows_m.append(row)

    index['items'] = items + rows_l + rows_m
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json %d KB%strial modifiers %d, rare monster modifiers %d, keyword cards folded in %d%s%s' % (
        len(body.encode('utf-8')) // 1024, DOT, len(rows_l), len(rows_m), len(fold), DOT,
        ', '.join('%s %d' % kv for kv in counts.items())))
    print('  Subject to change on: ' + ', '.join(x['n'] for x in rows_l + rows_m if x.get('un')))
    appdata.write(index)


if __name__ == '__main__':
    main()
