"""Publish the libraries the official export holds and the site does not ship yet.

tools/gamepull.py counts the gap; this closes the part of it that is nothing but "the game has more than we
carry". Five jobs, all from the export (tools/cache/official, gamepull.official):

  keywords   The drill-down artifact carries 451 keywords. The game's own help text has far more, and every
             one of them is a thing a player meets: map and area mechanics, monster modifiers, shrines,
             Expedition runes, medallions. They become keyword cards like the others, so a keyword link in
             any text has something to open, in the game's own wording. A few are written as an in-game
             tooltip rather than a sentence; the tags are read away and the lines inside them are the card's
             (untag). Every card the export still holds is reworded to it each run, so a term reworded
             upstream lands here on the next pull.
  classes    The item classes as cards of their own: Gloves, Boots, Quarterstaves, Body Armour and the rest.
             The game sorts every item into one and the site already groups by it, but the class itself was
             nowhere, so nothing could be opened on it and no card could point at it.
  notables   The 33 ascendancy notables whose whole effect is a skill. The tree gives them no stat line, so
             the drill-down has no row for them and the site had no card — but "Grants Skill: <name>" is
             the line, the same line a base item or a unique shows for the same thing.
  gems       Counted only. The export has 1,191 gem entries and we card 1,072; every one of the 119 is a
             name no player ever sees (see gems()). Nothing to add, and the count says so each run.
  numbers    data/gamestats.json: what one monster of each level is worth in life, damage and defences, and
             what each class starts with. The only official answer to "how much do I need at level N".
             Written for the site to use later; no page reads it yet.

Run it after tools/sync.py (which rebuilds data/index.json from the artifact and would drop these cards) and
before tools/grants.py and tools/kwuse.py. Running it twice adds nothing twice.

Usage:
  python tools/gamelib.py            write the cards and the numbers
  python tools/gamelib.py --report   count and say what would change, write nothing
"""
import argparse
import email.utils
import json
import re
import sys
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import official, patch, state  # noqa: E402
from sync import (BLANK_NODE, CUT, DNT, DNT_GEMS, KWREF, RAW, SHOWN_FIELDS,  # noqa: E402
                  data_files, plain, shows, whole)

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'index.json'
STATS = ROOT / 'data' / 'gamestats.json'
CRAFT = ROOT / 'data' / 'craft.json'
CRAFTDIR = ROOT / 'data' / 'craft'
KEYWORD_IMG = 'r:Art/2DItems/QuestItems/SkillBook.webp'   # the in-game Book of Skill, as tools/sync.py uses

# A keyword we leave out on purpose, by its key in the export.
SKIP = {'Test'}          # "This test case is designed to be overwitten by other content"
# CUT, DNT and DNT_GEMS come from tools/sync.py: the marker for a thing players never see, and what each gem
# that carries one was settled as. This tool runs after that one, so it answers to the same list.
TEMPLATE = re.compile(r'\{\d*\}')   # a name the game fills in, e.g. "Spectre: {0}"
# The game's own display tags: <<StyleName>>, <rgb(1,2,3)>{words}, <font:'fontin'>{words}. A few keywords are
# written as an in-game tooltip rather than a sentence (every Expedition rune). untag() reads the tags away
# and leaves the words between them exactly as the game holds them.
TAGGED = re.compile(r'<[^>]*>|[{}]')
STYLE = re.compile(r'<<[^>]*>>')       # the style the tooltip is drawn in, and nothing a player reads
OPEN = re.compile(r'<[^<>{}]*>\{')     # a tag and the words it wraps, which may hold another of the same
# What counts as game code on a card, the same marks tools/dev/guard.mjs looks for on a rendered page.
SHOWN = [re.compile(r'(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])'),   # a stat id
         re.compile(r'\[[^\]|]{1,60}\|[^\]]{1,60}\]'), re.compile(r'\[[A-Z][A-Za-z]{2,}\]'),  # keyword markup
         re.compile(r'\{\d*(?::[^}]{0,12})?\}'), re.compile(r'%\d+\$[sd]'), re.compile(r'\bDNT[-\w]*')]


def real(s):
    return bool(s) and not DNT.search(s) and not TEMPLATE.search(s)


def untag(t):
    """The game's display tags read away: <<Style>> dropped, <tag>{words} down to the words. Nothing else moves."""
    t = STYLE.sub('', t or '')
    out, i = [], 0
    while i < len(t):
        m = OPEN.search(t, i)
        if not m:
            out.append(t[i:])
            break
        out.append(t[i:m.start()])
        depth, j = 1, m.end()
        while j < len(t) and depth:
            depth += {'{': 1, '}': -1}.get(t[j], 0)
            j += 1
        out.append(untag(t[m.end():j - 1]))
        i = j
    return ''.join(out)


def words_of(v):
    """A keyword's own wording as a card carries it, or None where the game's markup is more than styling.

    Most are a sentence: one field, "t". The few written as an in-game tooltip are the game's own lines, so
    they stay lines ("ls"). A tooltip opens with its own title, which the card's name box already holds, so
    that line goes where it is the keyword's name — and stays where the files spell it differently, because
    the wording on the card is the game's, not ours."""
    text = (v.get('definition') or '').strip()
    if not TAGGED.search(text):
        return ('t', plain(text))
    said = untag(text)
    if TAGGED.search(said):
        return None
    rows = [x for x in (plain(y) for y in said.replace('\r\n', '\n').split('\n')) if x]
    if rows and rows[0].casefold() == plain(v.get('term') or '').casefold():
        rows = rows[1:]
    return ('ls', rows) if rows else None


# ---------------------------------------------------------------- keywords

def drilldown(block):
    """One of the drill-down page's data blocks, from the file explore.html names for it. Never by glob:
    data/explore/ keeps the last version's files too, so two hashes of the same block can sit there."""
    page = ROOT / 'explore.html'
    files = data_files(page.read_text(encoding='utf-8')) if page.exists() else {}
    f = files.get(block)
    if not f:
        sys.exit('explore.html does not name a %s file — run tools/sync.py first' % block)
    return whole(block, json.loads((ROOT / f).read_text(encoding='utf-8')), files)   # a gem's level text is a file of its own


def pick(index):
    """The export's keywords sorted into: new cards, keystones that already are that keyword, and what we drop.
    A term is dropped when it would put the same name on two cards: the export words a few monster modifiers
    exactly like a keyword we already ship, and a few like each other, and nothing in the data says which one a
    player means."""
    ours = {it['id'] for it in index['items'] if it['k'] == 'w'} | set(index.get('kwx') or {})
    why = {}   # key -> why it is not a card
    wanted = {}
    for k, v in official('keywords.min.json').items():
        term, text = (v.get('term') or '').strip(), (v.get('definition') or '').strip()
        if not term or not text:
            why[k] = 'no term or no text'
        elif k in ours:
            why[k] = 'already ours'
        elif not real(term) or not real(text):
            why[k] = 'a name players never see'
        elif k in SKIP:
            why[k] = 'a placeholder'
        elif not words_of(v):
            why[k] = 'written as game markup'
        else:
            wanted[k] = v

    # a keystone and a keyword of the same name share one card, the keystone's (tools/sync.py does the same)
    keystones = {it['n'].lower() for it in index['items'] if it['k'] == 'p' and (it.get('s') or '').startswith('Keystone')}
    kwx = {k: v['term'] for k, v in wanted.items() if v['term'].lower() in keystones}
    rest = {k: v for k, v in wanted.items() if k not in kwx}

    seen = {}
    for it in index['items']:
        if it['k'] == 'w':
            seen[it['n'].lower()] = seen.get(it['n'].lower(), 0) + 1
    for v in rest.values():
        seen[v['term'].lower()] = seen.get(v['term'].lower(), 0) + 1
    new = {}
    for k, v in rest.items():
        if seen[v['term'].lower()] > 1:
            why[k] = 'the name is on another card'
        else:
            new[k] = v
    return new, kwx, why


def sources():
    """Card key -> the game text that card was made from, for the cards whose text marks keywords: every gem,
    unique and passive row of the drill-down, and every keyword's own description."""
    out = {}
    for g in drilldown('gemdata')['gems']:
        out['g:' + g['id']] = json.dumps(g, ensure_ascii=False)
    for p in drilldown('trdata')['passives']:
        out['p:' + p['id']] = json.dumps(p, ensure_ascii=False)
    uniq, seen = [], set()                    # the files repeat a few unlisted uniques verbatim
    for u in drilldown('uqdata')['items']:
        sig = (u['n'], u.get('b'), tuple(u.get('ex') or []))
        if sig not in seen:
            seen.add(sig)
            uniq.append(u)
    names = {}
    for u in uniq:
        names[u['n']] = names.get(u['n'], 0) + 1
    for u in uniq:   # a unique's card id is its name, or "name | base" where variants share the name
        uid = u['n'] if names[u['n']] == 1 else u['n'] + ' | ' + (u.get('b') or '')
        out['u:' + uid] = json.dumps(u, ensure_ascii=False)
    for k, v in drilldown('kwdata').items():
        out['w:' + k] = v.get('d') or ''
    for k, v in official('keywords.min.json').items():
        out.setdefault('w:' + k, v.get('definition') or '')   # the ones this tool cards
    return out


def keywords(index, write=True):
    """Add the export's missing keywords as cards, and point the keyword links that reach them at them."""
    new, kwx, why = pick(index)
    text = sources()
    known = ({it['id'] for it in index['items'] if it['k'] == 'w'} | set(index.get('kwx') or {})
             | set(new) | set(kwx))

    def links(k, s):
        """The keywords this text marks, as card ids: the edges out of this card."""
        return {m.group(1) for m in KWREF.finditer(s or '') if m.group(1) in known and m.group(1) != k}

    cards = []
    for k, v in sorted(new.items(), key=lambda x: x[1]['term']):
        f, said = words_of(v)
        it = {'k': 'w', 'id': k, 'n': v['term'], 's': 'Keyword', f: said,
              'use': {}, 'img': KEYWORD_IMG}
        edges = links(k, v['definition'])
        if edges:
            it['kw'] = sorted(edges)
        cards.append(it)

    # the standard: nothing a player reads may look like game code (the same marks as tools/dev/guard.mjs),
    # over the same fields and with the same marker test tools/sync.py runs on the cards it builds
    for it in cards:
        for f in SHOWN_FIELDS:
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if not x:
                    continue
                if any(m.search(x) for m in SHOWN) or RAW.search(x):
                    sys.exit('game code in %s %r: %r' % (f, it['n'], x))
                if DNT.search(x):
                    sys.exit('leftover game marker in %s %r: %r (see DNT_GEMS in tools/sync.py)' % (f, it['n'], x))

    # the other way round: a card whose own text marks one of these keywords now links to it
    back = 0
    for it in index['items']:
        add = links(it['id'], text.get(it['k'] + ':' + it['id'])) - set(it.get('kw') or [])
        if add:
            it['kw'] = sorted(set(it.get('kw') or []) | add)
            back += 1

    # the wording stays the game's: every keyword card the export still holds is reworded to it, whoever built
    # the card, so a term reworded upstream lands here on the next pull
    export, fresh = official('keywords.min.json'), 0
    for it in index['items']:
        if it['k'] != 'w' or it['id'] not in export:
            continue
        said = words_of(export[it['id']])
        if not said:
            continue
        f, v = said
        rows = v if isinstance(v, list) else [v]
        if any(m.search(x) for x in rows for m in SHOWN) or any(RAW.search(x) for x in rows):
            continue
        if it.get(f) != v or it.get('ls' if f == 't' else 't') is not None:
            it.pop('t', None)
            it.pop('ls', None)
            it[f] = v
            fresh += 1

    if write and cards:
        at = max(i for i, it in enumerate(index['items']) if it['k'] == 'w') + 1
        index['items'][at:at] = cards       # next to the keyword cards, so the index keeps its order
    if write and kwx:
        index.setdefault('kwx', {}).update(kwx)
    return {'cards': cards, 'kwx': kwx, 'why': why, 'back': back, 'fresh': fresh}


# ---------------------------------------------------------------- item classes

def mod_count(cid):
    """How many modifiers can roll on a whole item class, per side: every rolling pool of data/craft/<id>.json,
    counted the way one base item's own count is (tools/carddata.py) but over the class rather than one pool."""
    f = CRAFTDIR / (cid + '.json')
    if not f.exists():
        return None
    d = json.loads(f.read_text(encoding='utf-8'))
    fam, mods = d.get('fam') or [], d.get('mods') or []
    side = {'p': set(), 's': set()}
    for p in d.get('pools') or []:
        for i in p.get('m') or []:
            a = fam[mods[i][1]][0] if mods[i][1] < len(fam) else ''
            if a in side:
                side[a].add(mods[i][0])
    return (len(side['p']), len(side['s'])) if side['p'] or side['s'] else None


def classes(index, write=True):
    """The item classes as cards of their own (assets/kinds.js declares the kind).

    Every item in the game is of one class, and the site already groups by it — a base item says which class
    it is, the Craft tab holds one class at a time — but the class itself had no card, so a player could not
    open Gloves and see what is on gloves, and nothing could point at it. One card each: the group it sits in,
    how many bases are in it, how many modifiers can roll on it and how many sockets it takes, with the gold
    button on the Craft tab and every base of the class under Connections.

    Read from data/craft.json, which tools/craft.py builds from the export's own item classes and item
    metadata, so a class the game adds lands here with nothing to edit."""
    have = {it['id'] for it in index['items'] if it['k'] == 'i'}
    craft = json.loads(CRAFT.read_text(encoding='utf-8')) if CRAFT.exists() else {'classes': []}
    cards, why = [], {}
    for c in craft.get('classes') or []:
        if c['id'] in have:
            why[c['id']] = 'already ours'
            continue
        if not real(c.get('n') or ''):
            why[c['id']] = 'a name players never see'
            continue
        pr = ['%s bases' % '{:,}'.format(len(c.get('b') or []))]
        n = mod_count(c['id'])
        if n:
            pr.append('%s mods can roll here (%d prefix, %d suffix)' % ('{:,}'.format(n[0] + n[1]), n[0], n[1]))
        mx = c.get('mx') or []
        if len(mx) == 2:
            pr.append('%d prefixes and %d suffixes at most' % (mx[0], mx[1]))
        if c.get('so'):
            pr.append('%d socket%s' % (c['so'], '' if c['so'] == 1 else 's'))
        cards.append({'k': 'i', 'id': c['id'], 'n': c['n'], 's': c.get('g') or 'Item class', 'pr': pr})

    # the same standard tools/sync.py holds its own cards to
    for it in cards:
        for f in SHOWN_FIELDS:
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if x and (any(m.search(x) for m in SHOWN) or RAW.search(x) or DNT.search(x)):
                    sys.exit('game code in %s %r: %r' % (f, it['n'], x))

    if write and cards:
        at = max(i for i, it in enumerate(index['items']) if it['k'] == 'b') + 1
        index['items'][at:at] = cards   # next to the base items, whose classes they are
    return {'cards': cards, 'why': why}


# ---------------------------------------------------------------- ascendancy notables

TREE = 'passive_skill_trees/Default.min.json'
ICON = re.compile(r'^Art/2DArt/SkillIcons/', re.I)   # what the tree's icon path is called on poe.ninja's copy


def node_image(node):
    """A tree node's picture, the way tools/sync.py finds it: poe.ninja's copy of the node's own icon."""
    icon = ICON.sub('', node.get('icon') or '')
    if icon.lower().endswith('.dds') and not icon.startswith('Art/'):
        code = 'n:' + urllib.parse.quote(icon[:-4].lower()) + '.webp'
        if shows(code):
            return code
    return BLANK_NODE


def notables(index, write=True):
    """The ascendancy notables whose whole effect is a skill.

    The passive tree gives them no stat line, so the drill-down page has no row for them and tools/sync.py
    made no card: 33 notables a player can spend a point on and not look up anywhere here. The tree does say
    which skill each one grants, and that is the card — one line, "Grants Skill: <name>", the same words a
    base item or a unique shows for the same thing.

    Left out: the five Pathfinder concoction choices, which are options inside another notable rather than
    notables of their own, and anything whose name or skill is a name players never see."""
    have = {it['id'] for it in index['items'] if it['k'] == 'p'}
    gem = {it['id']: it['n'] for it in index['items'] if it['k'] == 'g'}
    # the ascendancy's real name, from the cards we already have: the tree writes it as a class and a number
    asc = {}
    for it in index['items']:
        if it['k'] == 'p' and it.get('asc'):
            m = re.match(r'^(Ascendancy[A-Za-z]+\d)', it['id'])
            if m:
                asc.setdefault(m.group(1), it['asc'])

    cards, why = [], {}
    for node in official(TREE)['passives'].values():
        skill, nid = node.get('granted_skill'), node.get('id') or ''
        if not skill or nid in have:
            continue
        name = (node.get('name') or '').strip()
        gid = skill.rsplit('/', 1)[-1]
        m = re.match(r'^(Ascendancy[A-Za-z]+\d)', nid)
        who = asc.get(m.group(1)) if m else None
        if not node.get('is_notable'):
            why[nid] = 'an option inside another notable'
        elif not real(name) or not real(gem.get(gid, '')):
            why[nid] = 'a name players never see'
        elif gid not in gem:
            why[nid] = 'the skill has no card'
        elif not who:
            why[nid] = 'no ascendancy we know'
        else:
            cards.append({'k': 'p', 'id': nid, 'n': name, 's': 'Notable · ' + who,
                          'ls': ['Grants Skill: ' + gem[gid]], 'asc': who, 'img': node_image(node)})
    cards.sort(key=lambda c: (c['asc'], c['n']))

    # the same standard tools/sync.py holds its own cards to
    for it in cards:
        for f in SHOWN_FIELDS:
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if x and (any(m.search(x) for m in SHOWN) or RAW.search(x) or DNT.search(x)):
                    sys.exit('game code in %s %r: %r' % (f, it['n'], x))

    if write and cards:
        at = max(i for i, it in enumerate(index['items']) if it['k'] == 'p') + 1
        index['items'][at:at] = cards   # next to the passive cards, so the index keeps its order
    return {'cards': cards, 'why': why}


# ---------------------------------------------------------------- gems

def gem_names():
    """Every gem entry in the export, by the id the index cards it under, with the name it carries."""
    return {k.rsplit('/', 1)[-1]: (v.get('base_item') or {}) for k, v in official('skill_gems.min.json').items()}


def gems(index):
    """What the export's 1,191 gem entries are made of. Every one we do not card is a name no player sees:
    a [DNT] entry, the "Removed Skill" stand-in, a "Coming Soon" slot held open for a gem that is not in the
    game, or one tools/sync.py dropped because the marker sat in its text instead of its name (DNT_GEMS).
    None of them may become a card, so this counts and adds nothing."""
    every = gem_names()
    carded = {it['id'] for it in index['items'] if it['k'] == 'g'}
    out = {'export': len(every), 'carded': len(carded & set(every)), 'dnt': 0, 'soon': 0, 'removed': 0,
           'cut': [], 'other': []}
    for k, b in every.items():
        if k in carded:
            continue
        n = b.get('display_name') or ''
        if DNT.search(n):
            out['dnt'] += 1
        elif n == 'Coming Soon':
            out['soon'] += 1
        elif n == 'Removed Skill':
            out['removed'] += 1
        elif DNT_GEMS.get(k, ('', ''))[0] == 'drop':
            out['cut'].append(n)
        else:
            out['other'].append(n)
    out['cut'].sort()
    return out


def gone(index):
    """The gems tools/sync.py drops for good, and the check that none of them is a card again. This tool runs
    after that one and writes into the same index, so it answers to the same list."""
    every = gem_names()
    drop = {k for k, (what, _) in DNT_GEMS.items() if what == 'drop'}
    names = {(every.get(k) or {}).get('display_name') for k in drop} - {None, ''}
    for it in index['items']:
        if it['k'] == 'g' and (it['id'] in drop or it['n'] in names):
            sys.exit('%s is a card again: tools/sync.py drops it (DNT_GEMS)' % it['n'])
        if CUT.match(it['n']):
            sys.exit('a name players never see is a card: %r' % it['n'])
    return sorted(names)


# ---------------------------------------------------------------- monster and class numbers

# The export's own field names are game code; these are the words the file ships.
MONSTER = [('life', 'life'), ('ally_life', 'ally'), ('physical_damage', 'damage'),
           ('accuracy', 'accuracy'), ('armour', 'armour'), ('evasion', 'evasion')]
# The export also carries experience per kill. It stays out: the site never prints a per-kill figure.


def dated(name):
    """The date the export's copy of one file carries, as the site writes dates."""
    when = (state()['files'].get(name) or {}).get('modified')
    return email.utils.parsedate_to_datetime(when).strftime('%Y-%m-%d') if when else ''


def gamestats():
    """data/gamestats.json: one monster of each level, and what each class starts with.

    Only the eight classes that are in the game: the export carries twelve, and four of them (Duelist,
    Marauder, Shadow, Templar) have not one ascendancy node with a stat line on the passive tree — they are
    slots held open, the same as the gems above."""
    rows = []
    mon = official('default_monster_stats.min.json')
    for lv in sorted(mon, key=int):
        v = mon[lv]
        rows.append([int(lv)] + [round(v[src], 2) if isinstance(v[src], float) else v[src] for src, _ in MONSTER])

    played = set()
    for p in official('passive_skill_trees/Default.min.json')['passives'].values():
        if p.get('ascendancy') and p.get('stats'):
            played.add(p['ascendancy'].rstrip('123'))
    classes = []
    for c in official('characters.min.json'):
        if c['name'] not in played:
            continue
        b, u = c['base_stats'], c['base_stats']['unarmed']
        classes.append({'n': c['name'], 'str': b['strength'], 'dex': b['dexterity'], 'int': b['intelligence'],
                        'life': b['life'], 'mana': b['mana'],
                        'hit': [u['min_physical_damage'], u['max_physical_damage']],
                        'time': u['attack_time'], 'range': u['range']})
    classes.sort(key=lambda c: c['n'])
    return {'patch': patch(), 'dated': dated('default_monster_stats.min.json'),
            'monsters': {'cols': ['level'] + [name for _, name in MONSTER], 'rows': rows,
                         'note': 'one monster of that level, as the game rates it; ally is the same for a monster on your side'},
            'classes': classes}


# ---------------------------------------------------------------- run it

def main():
    ap = argparse.ArgumentParser(description='Publish the official libraries the site does not ship yet.')
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    args = ap.parse_args()

    index = json.loads(INDEX.read_text(encoding='utf-8'))
    was = sum(1 for it in index['items'] if it['k'] == 'w')
    wasp = sum(1 for it in index['items'] if it['k'] == 'p')
    wasi = sum(1 for it in index['items'] if it['k'] == 'i')
    kw = keywords(index, write=not args.report)
    cl = classes(index, write=not args.report)
    nb = notables(index, write=not args.report)

    cut = gone(index)
    g = gems(index)
    print('gems    export %d = %d cards + %d marked [DNT] + %d Coming Soon + %d Removed Skill + %d dropped (%s)%s'
          % (g['export'], g['carded'], g['dnt'], g['soon'], g['removed'], len(g['cut']), ', '.join(g['cut']),
             ', %d unaccounted: %s' % (len(g['other']), ', '.join(sorted(g['other'])[:6])) if g['other'] else '. Nothing to add'))
    print('        still gone, and checked every run: %s' % ', '.join(cut))

    why = {}
    for reason in kw['why'].values():
        why[reason] = why.get(reason, 0) + 1
    print('keywords the export has %d, we had %d -> %d cards (+%d), %d keystones that are their own keyword'
          % (len(official('keywords.min.json')), was, was + len(kw['cards']), len(kw['cards']), len(kw['kwx'])))
    print('         left out: ' + ', '.join('%d %s' % (n, r) for r, n in sorted(why.items(), key=lambda x: -x[1])
                                            if r != 'already ours'))
    print('         %d of the new cards link on to another keyword; %d cards we already had now link to one'
          % (sum(1 for c in kw['cards'] if c.get('kw')), kw['back']))
    print('         %d keyword cards reworded to the export' % kw['fresh'])

    cwhy = {}
    for reason in cl['why'].values():
        cwhy[reason] = cwhy.get(reason, 0) + 1
    print('classes  the game sorts items into %d classes, we had %d -> %d cards (+%d)'
          % (len(cl['cards']) + len(cl['why']), wasi, wasi + len(cl['cards']), len(cl['cards'])))
    if any(r != 'already ours' for r in cwhy):
        print('         left out: ' + ', '.join('%d %s' % (n, r) for r, n in sorted(cwhy.items(), key=lambda x: -x[1])
                                                if r != 'already ours'))

    nwhy = {}
    for reason in nb['why'].values():
        nwhy[reason] = nwhy.get(reason, 0) + 1
    print('notables the tree grants a skill on %d nodes, %d of them had no card; passives %d -> %d (+%d)'
          % (sum(1 for n in official(TREE)['passives'].values() if n.get('granted_skill')),
             len(nb['cards']) + len(nb['why']), wasp, wasp + len(nb['cards']), len(nb['cards'])))
    if nwhy:
        print('         left out: ' + ', '.join('%d %s' % (n, r) for r, n in sorted(nwhy.items(), key=lambda x: -x[1])))

    stats = gamestats()
    print('numbers %d monster levels, %d classes in the game (the export lists %d)'
          % (len(stats['monsters']['rows']), len(stats['classes']), len(official('characters.min.json'))))

    if args.report:
        print('\n--report: nothing written')
        return
    INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    STATS.write_text(json.dumps(stats, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='\n')
    import appdata   # the index in two parts for the home page
    appdata.write(index)
    print('\n-> data/index.json, data/gamestats.json')


if __name__ == '__main__':
    sys.exit(main())
