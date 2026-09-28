"""data/buffs.json: every buff and debuff a player can see, what it does, its icon and what gives it (#89).

A player sees an icon and a name on their bar ("Tailwind", "Onslaught", "Hindered") and has nothing to look it up
by. The game files hold all three: the buff's name and its own description, the icon it is drawn with, and the
stats and modifiers that put it on a character.

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
  buffs.min.json            every buff definition: name, description, whether it is drawn at all (invisible), its
                            category (Buff, Debuff, Flask, Charge...), its stats, its most stacks, the visual it uses;
                            the buff templates that set its numbers (their stat_text is the game's own lines), and
                            the modifiers and passives the files tie to it ("sources")
  buff_visuals.min.json     the icon each visual draws (an Art/... path, shown through RePoE's copy of the art the
                            way every base item's picture is: tools/sync.py game_art)
  stat_translations/stat_descriptions.min.json, passive_skill_stat_descriptions.min.json
                            the game's wording of every stat: a stat whose words give the buff by name ("Gain
                            [Tailwind] on Critical Hit", "you and nearby Allies have Tailwind") is a stat that
                            grants it
  passive_skill_trees/Default.min.json   the passives that carry such a stat
  skills.min.json, skill_gems.min.json   the skills whose own id or name is the buff's (a Herald is its own buff),
                            or whose own words give it, and the gems that grant those skills; a support gem whose
                            own text gives it
  data/grants.json          the cards that grant such a skill (a unique's "Grants Skill: Discipline"), which give
                            the buff too (tools/grants.py: the base_items, passive tree and unique joins)
  mods.min.json, base_items.min.json     the modifiers that carry such a stat or that the buff names as its source:
                            a unique's line (matched to the unique cards in data/index.json by the mod's own words),
                            a base item's implicit, a monster's, an area's or a Trial of Chaos modifier
  data/index.json           the cards those names open (never an id on a card: #12)

What counts as one a player can see: it has a name (no [DNT] marker, no {0} the game fills in, no test or WIP
name), it is not marked invisible, its visual has an icon and RePoE serves that icon, and something in today's
game gives it: a card we carry, a modifier, or a keyword card of the same name. The export still carries
hundreds of Path of Exile 1 buffs (brands, mines, the Labyrinth's traps) that nothing gives any more; they are
counted in the report and not carded. A category the game only uses in PvP is left out the same way.

One entry per name. The files often define one buff several times (a monster's copy, a unique's copy); the
entry takes every line they say, the first icon, and everything that gives any of them.

The fields of an entry (data/buffs.json "rows"):
  n        the name the game shows under the icon
  id       the name again: what the entry is looked up by (never drawn)
  s        the sub line: Buff, Debuff, Flask effect, Charm effect, Charge, Curse, Shrine... (the game's category)
  t        what it does: the game's own description, markup taken off. When the files hold none, ls instead
  ls       the game's own lines for it: the template's stat text (Tailwind: "1% increased Movement Speed" ...)
  img      its icon, as an image code (tools/sync.py IMGS: r: is RePoE's copy of the game art)
  max      the most stacks it can have, where the game caps it
  by       what gives it, as cards: [{n, k, key}] with k the card's kind (g gem, u unique, p passive, b base) and
           key the card's index key (never drawn: #12)
  mods     modifiers that give it and have no card: {Monster modifiers: N, Area modifiers: N, Item modifiers: N,
           Trial of Chaos modifiers: N}
  kw       the keyword card of the same name, where there is one (its id: never drawn). The design doc proposes
           that card takes this entry's icon and "given by" list instead of a second card being made
  q        search words: the category and the kinds of thing that give it
  src      "Source: the game files"

The cards (data/index.json, kind d, assets/kinds.js): one per entry whose name no other card carries, with
its name, sub line, words, icon, stack cap (max) and one line for the modifiers with no card (fm). A buff whose
name a keyword card already carries is that card (docs/frame.md: a second card for a thing that has one is not a
kind): the keyword card takes the buff's icon instead of the Book of Skill, and its stack cap. A buff named like a card of another
kind ("Herald of Ice", the gem that is its own buff) stays in data/buffs.json only. What gives a buff reaches
the cards as edges, both ways, through data/grants.json (tools/grants.py reads "by" from here). A buff's name is
a door wherever a line says it (KINDS words, assets/marks.js).

Usage:
  python tools/buffs.py              write data/buffs.json, the buff cards into data/index.json and its two parts
  python tools/buffs.py --report     count and say what it would write, write nothing
Run it after tools/sync.py, tools/gamelib.py, tools/treecards.py and tools/clusters.py (it names the cards they
write), and before tools/grants.py (which turns "by" into edges) and tools/carddata.py.
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
from gamepull import REPOE, official, patch  # noqa: E402
from gamelib import SHOWN, TREE  # noqa: E402
from sync import DNT, RAW, game_art, plain, shows  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'index.json'
OUT = ROOT / 'data' / 'buffs.json'
GRANTS = ROOT / 'data' / 'grants.json'
SRC = 'Source: the game files'

# A name no player sees: a {0} the game fills in, and the names the files use for tests and work in progress.
TEMPLATE = re.compile(r'\{\d*\}')
NOT_A_NAME = re.compile(r'\b(?:Test|Cheat|WIP|TEMP|UNUSED|Unused|Placeholder)\b|^[A-Z ]+ BUFF$|^[A-Z][a-z]+[A-Z]\w*$')
# Categories only PvP and the Labyrinth use: neither is in Path of Exile 2.
GONE = {'PVP team', 'PVP flag', 'Labyrinth trap'}
# The game's category, as the sub line reads it. A category not here reads as the game names it.
SUB = {'Buff': 'Buff', 'Debuff': 'Debuff', 'Flask': 'Flask effect', 'Charm': 'Charm effect', 'Charge': 'Charge',
       'Hex': 'Curse', 'Buff shrine': 'Shrine', 'Spell shrine': 'Shrine', 'Active skill': 'Skill effect',
       'Stolen': 'Stolen modifier', None: 'Effect'}
# The words that give a thing by name: "Gain Tailwind", "you have Onslaught", "Enemies are Hindered", "inflict
# Withered". The clause they sit in must not be a condition ("while you have Tailwind") or a denial ("cannot be
# Chilled"), and up to four small words may sit between the verb and the name ("gain a stack of", "Gain 3").
GIVE = re.compile(r'\b(?:gain|gains|gaining|grant|grants|granting|have|has|inflict|inflicts|inflicting|apply|applies'
                  r'|applying|are|is|be|become|becomes|create|creates|leave|leaves)\s+'
                  r'(?:(?:a|an|the|up to|additional|an additional|\d+|#|\{\d+\}|stacks? of|stages? of|maximum|random|you|'
                  r'your|them|their|an area of|a burst of)\s+){0,4}$',
                  re.I)
IF = re.compile(r'\b(?:while|whilst|if|when|per|during|for each|unless|as long as|against|cannot|can\'t|not|never|'
                r'no|immune|instead of|remove|removes|lose|loses)\b', re.I)
CLAUSE = re.compile(r'[,.;:\n]')
NUM = re.compile(r'[+-]?\(?[\d.]+(?:-[\d.]+)?\)?')
# the kinds of card that can give a buff, in the order a card lists them
KINDS = ('g', 'p', 'u', 'b')
WHERE = {'monster': 'Monster modifiers', 'area': 'Area modifiers', 'item': 'Item modifiers',
         'ultimatum': 'Trial of Chaos modifiers'}
ON = {'Monster modifiers': 'on monsters', 'Area modifiers': 'on areas', 'Item modifiers': 'on items',
      'Trial of Chaos modifiers': 'in the Trial of Chaos'}   # the card's one line for the modifiers with no card
KEYWORD_IMG = 'r:Art/2DItems/QuestItems/SkillBook.webp'   # a keyword card's picture when no buff lends it one


def shape(line):
    """A line with its numbers taken out, so a mod's roll range and a card's rolled numbers read the same."""
    return NUM.sub('#', plain(line)).strip()


class Finder:
    """Which buff a piece of the game's wording gives, by name."""

    def __init__(self, names):
        self.names = names
        alt = '|'.join(re.escape(n) for n in sorted(names, key=len, reverse=True))
        self.find = re.compile(r'(?<![\w\'])(?:' + alt + r')(?![\w\'])')

    def gives(self, text):
        """The buff names this text gives, read off the game's words with the markup taken off."""
        text = plain(text)
        out = set()
        for m in self.find.finditer(text):
            before = CLAUSE.split(text[:m.start()])[-1]
            g = GIVE.search(before)
            if g and not IF.search(before[:g.start()]) and not IF.search(before[g.start():]):
                out.add(m.group(0))
        return out


def visible():
    """name -> the buff definitions a player can see under that name, in the export's order; and what was left
    out, counted by why."""
    visuals = official('buff_visuals.min.json')
    out, why = defaultdict(list), Counter()
    for key, b in official('buffs.min.json').items():
        name = (b.get('name') or '').strip()
        icon = (visuals.get(b.get('visuals')) or {}).get('icon')
        if not name:
            why['no name'] += 1
        elif DNT.search(name) or TEMPLATE.search(name) or NOT_A_NAME.search(name):
            why['a name no player sees'] += 1
        elif b.get('invisible'):
            why['not drawn on the bar'] += 1
        elif not icon:
            why['no icon'] += 1
        elif b.get('category') in GONE:
            why['PvP or the Labyrinth'] += 1
        elif 'UNUSED' in (b.get('description') or ''):
            why['a name no player sees'] += 1
        else:
            out[name].append((key, b, icon))
    return out, why


def grant_stats(finder):
    """stat id -> the buff names its wording gives, over the two description files the tree and the items use."""
    out = defaultdict(set)
    for f in ('stat_translations/stat_descriptions.min.json', 'stat_translations/passive_skill_stat_descriptions.min.json'):
        for e in official(f):
            said = set()
            for w in e.get('English') or []:
                said |= finder.gives(w.get('string') or '')
            for sid in e.get('ids') or []:
                out[sid] |= said
    return out


class Cards:
    """The cards the index carries, in the shapes the joins need."""

    def __init__(self, index):
        self.name = {}
        self.unique_lines = defaultdict(set)
        for it in index['items']:
            if it['k'] in KINDS:
                self.name[it['k'] + ':' + it['id']] = it['n']
            if it['k'] == 'u':
                for line in it.get('ls') or []:
                    self.unique_lines[shape(line)].add('u:' + it['id'])
        # the keyword card a buff's name already opens: its own name, else one of its other words (f) that no
        # other keyword card claims. "Fire" is a word of Fire Damage's card, so the Fire debuff is that card and
        # not a second door on every "Fire" in the index (assets/marks.js reads a keyword's f words as its own)
        kws = [it for it in index['items'] if it['k'] == 'w']
        alt = defaultdict(set)
        for it in kws:
            for w in it.get('f') or []:
                alt[w].add(it['id'])
        self.keyword = {w: next(iter(ids)) for w, ids in alt.items() if len(ids) == 1}
        self.keyword.update({it['n']: it['id'] for it in kws})

    def card(self, key):
        return {'n': self.name[key], 'k': key[0], 'key': key} if key in self.name else None


def givers(names, finder, cards):
    """name -> {card keys}, and name -> Counter of modifiers with no card, by where they roll."""
    by, mods = defaultdict(set), defaultdict(Counter)
    ids = {key: n for n, defs in names.items() for key, _, _ in defs}
    stats = grant_stats(finder)

    def stat_names(sids):
        return set().union(*(stats.get(s, set()) for s in sids)) & set(names)

    # passives: a node whose stats give it, or that the buff names as its source
    tree = official(TREE)['passives']
    for node in tree.values():
        for n in stat_names(node.get('stats') or {}):
            by[n].add('p:' + (node.get('id') or ''))
    node_of = {v.get('id'): v for v in tree.values()}

    # gems: a skill whose own id or name is the buff's, or whose words give it; the gems that grant that skill,
    # and a support whose own text gives it
    gems_of = defaultdict(set)
    for path, g in official('skill_gems.min.json').items():
        key = 'g:' + path.rsplit('/', 1)[-1]
        for s in g.get('grants_skills') or []:
            gems_of[s].add(key)
        for n in finder.gives(g.get('support_text') or '') & set(names):
            by[n].add(key)
    for sid, s in official('skills.min.json').items():
        act = s.get('active_skill') or {}
        got = set()
        if act.get('id') in ids:
            got.add(ids[act['id']])
        if act.get('display_name') in names:
            got.add(act['display_name'])
        got |= finder.gives(act.get('description') or '') & set(names)
        for ss in s.get('stat_sets') or []:
            for text in ((ss.get('static') or {}).get('stat_text') or {}).values():
                got |= finder.gives(text) & set(names)
            first = (ss.get('per_level') or {}).get('1') or {}
            for text in (first.get('stat_text') or {}).values():
                got |= finder.gives(text) & set(names)
        for n in got:
            by[n] |= gems_of.get(sid, set())

    # modifiers: the ones the buff names as its source, and the ones whose words or stats give it
    all_mods = official('mods.min.json')
    mod_names = defaultdict(set)
    for n, defs in names.items():
        for _, b, _ in defs:
            for how, rows in (b.get('sources') or {}).items():
                for r in rows:
                    if how == 'Mods':
                        mod_names[r['id']].add(n)
                    elif how == 'PassiveSkills' and r['id'] in node_of:
                        by[n].add('p:' + r['id'])
                    elif how == 'UltimatumModifiers':
                        mods[n][WHERE['ultimatum']] += 1
            for t in b.get('templates') or {}:
                if t in all_mods:
                    mod_names[t].add(n)
    for mid, m in all_mods.items():
        got = mod_names.get(mid, set()) | stat_names(s['id'] for s in m.get('stats') or [])
        if m.get('text'):
            got |= finder.gives(m['text']) & set(names)
        if got:
            mod_names[mid] = got
    implicit_of = defaultdict(set)
    for b in official('base_items.min.json').values():
        if b.get('release_state') == 'released' and b.get('name'):
            for mid in b.get('implicits') or []:
                implicit_of[mid].add('b:' + b['name'])
    for mid, got in mod_names.items():
        m = all_mods.get(mid) or {}
        dom, gen = m.get('domain'), m.get('generation_type')
        keys = set()
        if dom == 'item' and gen == 'unique' and m.get('text'):
            keys = {k for line in m['text'].split('\n') for k in cards.unique_lines.get(shape(line), ())}
        elif dom == 'item' and gen == 'implicit':
            keys = implicit_of.get(mid, set())
        for n in got:
            if keys:
                by[n] |= keys
            elif dom in ('monster', 'area', 'item'):
                mods[n][WHERE[dom]] += 1
    # ...and a card that grants a skill that gives it gives it too (data/grants.json, tools/grants.py)
    edges = json.loads(GRANTS.read_text(encoding='utf-8')).get('of', {}) if GRANTS.exists() else {}
    for n in list(by):
        for key in [k for k in by[n] if k.startswith('g:')]:
            by[n] |= {card for card, _ in edges.get(key, [])}
    return by, mods


def entry(name, defs, cards, keys, mods):
    """One buff's entry, from every definition of it a player can see."""
    cats = [b.get('category') for _, b, _ in defs]
    cat = next((c for c in cats if c), None)
    said = []
    for _, b, _ in defs:
        d = plain((b.get('description') or '').replace('\r\n', '\n'))
        if d and d not in said:
            said.append(d)
    lines = []
    for _, b, _ in defs:
        for t in (b.get('templates') or {}).values():
            for x in t.get('stat_text') or []:
                x = plain(x)
                if x and x not in lines:
                    lines.append(x)
    out = {'n': name, 'id': name, 's': SUB.get(cat, cat)}
    if len(said) == 1:
        out['t'] = said[0]
    elif said:
        out['ls'] = said
    elif lines:
        out['ls'] = lines
    icon = defs[0][2]
    out['img'] = game_art(icon)
    top = max((b.get('stack_limit') or 0 for _, b, _ in defs), default=0)
    if top > 1:
        out['max'] = top
    rows = [c for c in (cards.card(k) for k in keys) if c]
    rows.sort(key=lambda c: (KINDS.index(c['k']), c['n']))
    if rows:
        out['by'] = rows
    if mods:
        out['mods'] = dict(sorted(mods.items()))
    if name in cards.keyword:
        out['kw'] = cards.keyword[name]
    words = {out['s'].lower()} | {{'g': 'gem', 'p': 'passive', 'u': 'unique', 'b': 'base'}[c['k']] for c in rows}
    words |= {w.split()[0].lower() for w in (mods or {})}
    out['q'] = ' '.join(sorted(words))
    out['src'] = SRC
    return out


def build(index):
    names, why = visible()
    cards = Cards(index)
    finder = Finder(set(names))
    by, mods = givers(names, finder, cards)
    rows, idle, mute, icons = [], [], [], Counter()
    for name in sorted(names):
        defs = names[name]
        keys, got = by.get(name, set()), mods.get(name, Counter())
        live = [k for k in keys if k in cards.name]
        if not live and not got and name not in cards.keyword:
            idle.append(name)
            continue
        code = game_art(defs[0][2])
        if not code or not shows(code):
            icons['not served'] += 1
            continue
        e = entry(name, defs, cards, live, got)
        if not (e.get('t') or e.get('ls')):
            mute.append(name)
            continue
        rows.append(e)
    for e in rows:   # nothing a player reads may be game code (the marks tools/dev/guard.mjs looks for)
        for f in ('n', 's', 't', 'ls', 'src'):
            for x in (e[f] if isinstance(e.get(f), list) else [e.get(f)]):
                if x and (any(m.search(x) for m in SHOWN) or RAW.search(x) or DNT.search(x)):
                    raise SystemExit('game code in %s of %r: %r' % (f, e['n'], x))
        for c in e.get('by') or []:
            if lastgood.raw_id(c['n']):
                raise SystemExit('game code in a name %r gives: %r' % (e['n'], c['n']))
    out = {'source': 'game files, patch %s' % patch(), 'from': REPOE,
           'note': 'One entry per buff or debuff a player can see: its name, what it does (t, the game\'s '
                   'description, or ls, the game\'s own lines), its icon (img), its stack cap (max), what gives it '
                   '(by: cards; mods: modifiers with no card, counted by where they roll) and the keyword card of '
                   'the same name (kw). Written by tools/buffs.py; design/buffs.md.',
           'labels': {'src': SRC},
           'ids': ['id', 'key', 'kw', 'img'],   # img: the icon's address, never shown as words
           'rows': rows}
    rep = {'why': why, 'idle': idle, 'mute': mute, 'icons': icons, 'names': len(names)}
    return out, rep


def cards_into(index, rows):
    """The buffs as cards (kind d), and the keyword cards of the same name given the buff's icon.

    A buff whose name another card already carries is not a second card (docs/frame.md, "A new kind
    declaration"): a keyword of that name takes the buff's icon, and what gives it reaches the keyword card
    through data/grants.json (tools/grants.py); one named like its own gem ("Herald of Ice") is that gem's."""
    index['items'] = [it for it in index['items'] if it['k'] != 'd']
    taken = {it['n'] for it in index['items'] if it['k'] != 'w'}
    lend = {r['kw']: r for r in rows if r.get('kw')}   # by the keyword card's id: a buff may be one of its words
    for it in index['items']:
        if it['k'] != 'w':
            continue
        r = lend.get(it['id'])
        if r:
            it['img'] = r['img']
        elif (it.get('img') or '').startswith('r:Art/2DArt/'):   # a buff that lent it one is gone
            it['img'] = KEYWORD_IMG
        if r and r.get('max'):
            it['max'] = r['max']
        else:
            it.pop('max', None)
    new, same = [], []
    for r in rows:
        if r.get('kw'):
            continue
        if r['n'] in taken:
            same.append(r['n'])
            continue
        it = {'k': 'd', 'id': r['id'], 'n': r['n'], 's': r['s']}
        for f in ('t', 'ls', 'img', 'max'):
            if r.get(f):
                it[f] = r[f]
        if r.get('mods'):
            it['fm'] = ['From modifiers: ' + ', '.join('%d %s' % (n, ON[w]) for w, n in r['mods'].items())]
        it['q'] = r['q']
        it['src'] = r['src']
        new.append(it)
    index['items'].extend(new)
    return {'cards': len(new), 'keywords': len(lend), 'same': same}


def report(out, rep):
    rows = out['rows']
    print('buffs   %d cards, from %d names a player can see' % (len(rows), rep['names']))
    print('        %s' % ', '.join('%d %s' % (n, s) for s, n in Counter(r['s'] for r in rows).most_common()))
    print('        %d say what gives them as cards (%d gems, %d passives, %d uniques, %d bases), %d by modifiers only'
          % (sum(1 for r in rows if r.get('by')),
             *(sum(1 for r in rows if any(c['k'] == k for c in r.get('by') or [])) for k in KINDS),
             sum(1 for r in rows if r.get('mods') and not r.get('by'))))
    print('        %d share a name with a keyword card; %d have a stack cap'
          % (sum(1 for r in rows if r.get('kw')), sum(1 for r in rows if r.get('max'))))
    print('        left out before the join: ' + ', '.join('%d %s' % (n, s) for s, n in rep['why'].most_common()))
    print('        left out after it: %d nothing in today\'s game gives (%s ...), %d with no words, %d icons not served'
          % (len(rep['idle']), ', '.join(rep['idle'][:5]), len(rep['mute']), sum(rep['icons'].values())))


def main():
    ap = argparse.ArgumentParser(description='Build the buff and debuff cards from the game files.')
    ap.add_argument('--report', action='store_true', help='count and say what it would write, write nothing')
    args = ap.parse_args()

    index = json.loads(INDEX.read_text(encoding='utf-8'))
    got = {}

    def fresh():
        got['out'], got['rep'] = build(index)
        return got['out']

    out = lastgood.pull('Buffs', fresh, file='buffs.json', url=REPOE, at='rows', floor=200)
    if got:
        report(got['out'], got['rep'])
    if args.report:
        print('\n--report: nothing written')
        return 0
    if out is None:
        return lastgood.report()
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(OUT, body)
    print('\n-> data/buffs.json, %d bytes' % len(body.encode('utf-8')))

    put = cards_into(index, out['rows'])
    print('cards   %d buff cards; %d keyword cards take their buff\'s icon; %d named like a card of another kind '
          'stay in data/buffs.json (%s ...)' % (put['cards'], put['keywords'], len(put['same']),
                                              ', '.join(put['same'][:4])))
    import nodelinks   # the doors other cards' lines open into the new cards
    rep = nodelinks.attach(index)
    lastgood.save(INDEX, json.dumps(index, ensure_ascii=False, separators=(',', ':')))
    nodelinks.report(index, rep)
    import appdata   # the index in two parts for the home page
    appdata.write(index)
    print('-> data/index.json')
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Buffs', file='buffs.json', url=REPOE))
