"""data/quests.json: every quest a player can do, what it asks, where, who gives it and what it gives, and the
permanent rewards act by act. The data half of the Quest card (issue #76) and of the campaign companion's act
checklist (issue #118); both are proposed in design/quests.md.

One official source: the game's own tables, read straight out of the game's bundles on GGG's patch CDN through
tools/gamepull.py dat() (tools/datpull.mjs --raw, issue #83; no token, kept in tools/cache/dat-<CDN folder>/).
--game or WI_GAME points at a folder of decoded <Table>.json files instead. Read by name:

  Quest, QuestType          the quest's name, act and kind, and the reward kinds its quest log shows (QuestRewardType)
  QuestStates               its tracker: the first step's text is what it asks, the areas and map pins it names are
                            where it takes place
  QuestRewardOffers,        the reward windows: the items offered (take one of a window), their item level and
  QuestRewards              rarity, and the gold a window pays (a column dat-schema does not name: 7 of its 8
                            amounts are the ones poe2db shows, and Dark Mists' 7,500 is not on poe2db)
  NPCTalk, NPCs             who gives the quest (the talk that sets its first step's flag) and who hands out its
                            reward (the talk that opens its reward window)
  QuestItems, ClientStrings what a quest item grants, in the item's own words ("Grants +5 to Dexterity")
  QuestStaticRewards        which quest items and world-map places grant something for good
  MapPins                   the world map's own list of those places, with the reward in the game's words
                            ("+10% to Cold Resistance" under Beira of the Rotten Pack), and which of them rule each
                            other out (a pin that hides while another option is active)
  WorldAreas                an area's name where data/areas.json (#72) does not have it

Area names are joined to data/areas.json on the game's own area id (--areas, default data/areas.json), so a
quest names a place the way its Area card does and never names one that card hides. Without the file, the
game's own names are used.

Per quest, a player's words only:

  n      the name. One name in one act is one card: the files keep a quest in parts ("Secrets in the Dark" twice)
  act    the act as the game titles it: "Act 1", "Interlude", "Endgame"; actn its number, for order
  kind   Main, Optional, Trial (the quest the game marks important: the Ascendancy trials) or Mission
  do     what it asks, the tracker's first line
  where  the areas its tracker and its map pins name, in the order the quest walks them
  by     who gives it; from who hands out the reward
  take   the reward windows, each one a choice of one: n item, lv item level, r rarity, x stack, tier for an
         uncut gem whose base names its tier
  gold   the gold its windows pay
  also   a reward kind its quest log shows that no window or permanent reward covers ("Salvage Bench Unlock")
  keep   what it gives for good: n the item or the place, ls the game's words, and pick where it is one of a set
  id     the game's own ids for it. Never shown (issue #12): the card keys on it, nothing draws it (a permanent
         reward under acts carries one too, its map pin's or its item's flag, for a checklist to key on)

acts, one row per act: sum, what the act gives for good added up in the game's own shape; pick, its choices, listed
beside the totals and never added in; from, every permanent reward of the act, from a quest or not (a boss's drop,
a shrine), with where it is won. A choice's options are the game's own; whether a choice can be undone is not in
the files and nothing public from GGG says it, so every choice carries undo: "Subject to change" until one does
(issue #76).

Class: every reward window offers the same choices to every class. The reward rows' two unnamed list columns,
the only place a class list could sit, are empty on all 197 rows (the table's variable data section is its
8-byte marker and 4 bytes, so no row points anywhere), and poe2db's QuestRewards page draws every row across all
seven of its class columns. Source: poe2db (https://poe2db.tw/us/QuestRewards), as the check.

Left out and counted: Act 5 (Oriath: no area of it is in the game files, so none can be reached), quests in no
act, [DNT] items, permanent rewards the files cannot place (no quest, no map pin), and the developers' test rows.

  python tools/pipeline.py --only quests   the way to run it: a patch stage, under the last good rule
  python tools/quests.py              write data/quests.json in place
  python tools/quests.py --report     count and say what would change, write nothing
  python tools/quests.py --check      hold data/quests.json up against poe2db's quest list, quest by quest: act,
                                      kind, the items each window offers with their item level, and gold
  WI_DEBUG=1                          also name the permanent rewards the files cannot place
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
from gamepull import dat  # noqa: E402
from sync import DNT, RAW, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = 'quests.json'
ENDGAME = 10
URL = 'the game files, read from GGG\'s patch CDN (issue #83)'
KIND = {'Normal': 'Main', 'Optional': 'Optional', 'Important': 'Trial', 'MasterMission': 'Mission'}
# the developers' own rows in QuestStaticRewards: a test flag, the mobile game's, and ones the game marks old
TEST = re.compile(r'Test|^PoEM_|^OLD_')
# The words a permanent reward is written in, read back into numbers so an act can add them up. Only these
# shapes are added; a line in any other shape is shown as it is and not added (and counted, so it is seen).
NUMBER = {'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5}
TALLY = [
    (re.compile(r'^\+(\d+)% to (Fire|Cold|Lightning|Chaos) Resistance$', re.I), lambda m: (m[2] + ' Resistance', '%', int(m[1]))),
    (re.compile(r'^\+(\d+)% to (?:all )?Elemental Resistances$', re.I), lambda m: ('all Elemental Resistances', '%', int(m[1]))),
    (re.compile(r'^\+(\d+) to maximum Life$', re.I), lambda m: ('maximum Life', '+', int(m[1]))),
    (re.compile(r'^(\d+)% increased maximum Life and Mana$', re.I),
     lambda m: [('increased maximum Life', 'x', int(m[1])), ('increased maximum Mana', 'x', int(m[1]))]),
    (re.compile(r'^(\d+)% increased maximum Life$', re.I), lambda m: ('increased maximum Life', 'x', int(m[1]))),
    (re.compile(r'^(\d+)% increased maximum Mana$', re.I), lambda m: ('increased maximum Mana', 'x', int(m[1]))),
    (re.compile(r'^\+(\d+) to (?:maximum )?Spirit$', re.I), lambda m: ('Spirit', '+', int(m[1]))),
    (re.compile(r'^\+(\d+) Charm Slots?$', re.I), lambda m: ('Charm Slot', 'n', int(m[1]))),
    (re.compile(r'^\+(\d+) to (Strength|Dexterity|Intelligence|all Attributes)$', re.I), lambda m: (m[2], '+', int(m[1]))),
    (re.compile(r'(one|two|three|\d+) Weapon Set Passive Skill Points?', re.I),
     lambda m: ('Weapon Set Passive Skill Points', 'n', NUMBER.get(m[1].lower()) or int(m[1]))),
]
# the order an act's totals are written in
ORDER = ['Fire Resistance', 'Cold Resistance', 'Lightning Resistance', 'Chaos Resistance', 'all Elemental Resistances',
         'maximum Life', 'increased maximum Life', 'increased maximum Mana', 'Spirit', 'Strength', 'Dexterity',
         'Intelligence', 'all Attributes', 'Charm Slot', 'Weapon Set Passive Skill Points']


# ---------------------------------------------------------------- the decoded tables

def game_dir(arg=None):
    """A folder of decoded tables given with --game or WI_GAME (its raw/ where it has one), else None: the
    tables are then read through tools/gamepull.py dat()."""
    p = arg or os.environ.get('WI_GAME')
    if not p:
        return None
    for d in (Path(p) / 'raw', Path(p)):
        if (d / 'QuestRewardOffers.json').exists():
            return d
    raise lastgood.Stale('no decoded game tables in %s (QuestRewardOffers.json is not there)' % p)


class Tables:
    """The raw tables, read once each; a foreign key is a row number."""
    def __init__(self, where):
        self.where, self.t = where, {}

    def __getattr__(self, name):
        if name.startswith('_') or name in ('where', 't'):
            raise AttributeError(name)
        if name not in self.t:
            self.t[name] = dat(name) if self.where is None else \
                json.loads((self.where / (name + '.json')).read_text(encoding='utf-8'))
        return self.t[name]


def words(t):
    """The game's text as a player reads it: markup and colour tags off, one line per line."""
    while re.search(r'<[a-z]+>\{[^{}]*\}', t or ''):
        t = re.sub(r'<[a-z]+>\{([^{}]*)\}', r'\1', t)
    return [plain(x) for x in re.split(r'\r?\n', t or '') if x.strip()]


def shown(name):
    return bool(name) and not DNT.search(name) and name.strip() != 'NULL'


def tally(line):
    """A permanent reward's line as [(what, how, number)], or [] when it is not in a shape an act adds up."""
    line = re.sub(r'^Grants ', '', line.strip())
    for re_, f in TALLY:
        m = re_.search(line)
        if m:
            t = f(m)
            return t if isinstance(t, list) else [t]
    return []


def total(what, how, n):
    """A total back in the game's own shape."""
    if how == '%':
        return '+%d%% to %s' % (n, what)
    if how == 'x':
        return '%d%% %s' % (n, what)
    if what == 'Weapon Set Passive Skill Points':
        return '%d Weapon Set Passive Skill Point%s' % (n, '' if n == 1 else 's')
    if what == 'Charm Slot':
        return '+%d Charm Slot%s' % (n, '' if n == 1 else 's')
    return '+%d to %s' % (n, what)


# ---------------------------------------------------------------- the build

def build(where, areas_file):
    T = Tables(where)
    flag = lambda i: T.QuestFlags[i]['Id'] if i is not None else None
    item = lambda i: T.BaseItemTypes[i]['Name'] if i is not None else None
    npc = lambda i: T.NPCs[i]['Name'] if i is not None else None
    text = lambda i: T.ClientStrings[i]['Text'] if i is not None else None
    acts = {a['ActNumber']: a.get('UI_Title') or 'Act %d' % a['ActNumber'] for a in T.Acts}
    reached = {w['Act'] for w in T.WorldAreas if w.get('AreaLevel')}       # an act with no area is not in the game
    left = Counter()

    # the area names, as the Area cards have them
    card = None
    if areas_file and Path(areas_file).exists():
        card = {i: a['n'] for a in json.loads(Path(areas_file).read_text(encoding='utf-8'))['areas'] for i in a['id']}

    def area(i):
        if i is None:
            return None
        w = T.WorldAreas[i]
        if card is not None:
            return card.get(w['Id'])
        return w['Name'] if shown(w['Name']) and not w.get('IsHideout') and w.get('AreaLevel') else None

    # ---- which quests a flag belongs to
    of_flag = defaultdict(set)
    for s in T.QuestStates:
        for f in (s.get('FlagsPresent') or []) + (s.get('FlagsMissing') or []):
            of_flag[f].add(s['Quest'])
    for q in T.Quest:
        for f in q.get('QuestFlag') or []:
            of_flag[f].add(q['_i'])
    for o in T.QuestRewardOffers:
        if o.get('QuestFlag') is not None and o.get('QuestKey') is not None:
            of_flag[o['QuestFlag']].add(o['QuestKey'])
    of_item = defaultdict(set)                  # an item: the quests that hand it out or name it on their tracker
    shown_in = defaultdict(set)                 # a reward window draws an item: one base can stand for several
    for r in T.QuestRewards:                    # (every Book of Specialisation window draws the same one)
        o = T.QuestRewardOffers[r['RewardOffer']]
        if o.get('QuestKey') is not None:
            shown_in[r['Reward']].add(o['QuestKey'])
    shown_log = defaultdict(set)                # and so can a reward kind the quest log shows
    for q in T.Quest:
        for k in q.get('NormalReward') or []:
            if T.QuestRewardType[k].get('Reward') is not None:
                shown_log[T.QuestRewardType[k]['Reward']].add(q['_i'])
    for src in (shown_in, shown_log):
        for i, qs in src.items():
            if len(qs) == 1:
                of_item[i] |= qs
    for s in T.QuestStates:
        for i in s.get('QuestItem') or []:
            of_item[i].add(s['Quest'])

    # ---- what grants something for good: a static reward row, and the quest item whose use sets its flag
    static = {r['QuestFlag']: r for r in T.QuestStaticRewards if not TEST.search(flag(r['QuestFlag']) or '')}
    left['test rows in the static rewards'] = len(T.QuestStaticRewards) - len(static)
    keep = []                                   # {n, ls, flags, quests, act, where, from}
    by_flag = {}
    items = defaultdict(list)
    for x in T.QuestItems:
        for k in ('QuestFlagUsed', 'QuestComplete'):
            if x.get(k) in static:
                items[x[k]].append(x)
    for f, xs in items.items():
        for x in xs:
            name = item(x['BaseItemType'])
            ls = words(text(x.get('Description')))
            if not shown(name) or not ls:
                left['unused or wordless quest items'] += 1
                continue
            if x.get('QuestFlagUsed') is not None and x['QuestFlagUsed'] != f and x['QuestFlagUsed'] in static:
                continue                        # the one with its own flag says it: not twice through the set's flag
            if any(k['n'] == name and f in k['flags'] for k in keep):
                continue                        # the same item twice in the files (a second copy of the model)
            path = T.BaseItemTypes[x['BaseItemType']]['Id']
            m = re.search(r'/(Act(\d+)|Interlude|Endgame)/', path)
            act = int(m[2]) if m and m[2] else (6 if m and m[1] == 'Interlude' else 10 if m else None)
            qs = set(of_item.get(x['BaseItemType'], ())) | of_flag.get(f, set())
            if x.get('TriggeredQuestFlag') is not None:
                qs |= of_flag.get(x['TriggeredQuestFlag'], set())
            if static[f].get('QuestKey') is not None:
                qs.add(static[f]['QuestKey'])
            e = {'n': name, 'ls': ls, 'flags': {f, x.get('QuestFlagUsed'), x.get('QuestComplete')} - {None},
                 'set': x.get('QuestComplete'), 'quests': qs, 'act': act, 'where': None, 'from': None}
            e['id'] = flag(f)
            keep.append(e)
            by_flag.setdefault(x.get('QuestFlagUsed') if x.get('QuestFlagUsed') in static else f, e)

    # the world map's own list: a pin whose text carries the reward, at the place it is won
    pins = T.MapPins

    def pin_area(p):
        for i in [p.get('WorldArea')] + (p.get('WorldAreasKeys') or []):
            if i is not None and area(i):
                return area(i)
        return pin_area(pins[p['ParentMapPin']]) if p.get('ParentMapPin') is not None else None
    markers = defaultdict(set)
    for p in pins:
        for f in p.get('QuestFlags3') or []:
            markers[f].add(p.get('MetadataId'))
    rewarded = []
    for p in pins:
        ft = p.get('FlavourText') or ''
        if '<white>{' not in ft:
            continue
        ls = words(ft[ft.index('<white>{'):])          # the reward, and a penalty after it where there is one
        show = set(p.get('QuestFlags1') or [])
        rewarded.append((p, ls, show))
    for p, ls, show in rewarded:
        if not any(re.search(r'\d|\b(?:one|two|three)\b', l, re.I) for l in ls):
            left['map pins that sum up others (no number of their own)'] += 1
            continue
        e = next((by_flag[f] for f in show if f in by_flag), None)
        # the quest it belongs to: its own flags, and what hides the other states of the same marker (the
        # Medallion's empty altar hides once the Relics are in, and that is the quest's own flag)
        near = set().union(*[set(o.get('QuestFlags3') or []) for o in pins if o.get('MetadataId') == p.get('MetadataId')])
        near = {f for f in near if len(markers[f]) == 1}    # not a state of the whole act ("in the past")
        qs = set().union(*[of_flag.get(f, set()) for f in show | near])
        if e is None:                           # the same reward, handed out by the quest this pin belongs to
            e = next((k for k in keep if k['quests'] & qs and [l.lower() for l in k['ls']] == [l.lower() for l in ls]
                      and k['where'] is None), None)
        if e is None:
            e = {'n': p['Name'], 'ls': ls, 'flags': set(), 'set': None, 'quests': set(), 'act': p.get('Act'),
                 'where': None, 'from': None}
            keep.append(e)
        e['flags'] |= show
        e['quests'] |= qs
        e['where'] = e['where'] or pin_area(p)
        e.setdefault('id', p['Id'])
        e['act'] = p.get('Act') or e['act']
        if not e['n'].startswith(p['Name']):    # "Venom Draught" over the Venom Draught of Stone says nothing new
            e['from'] = p['Name']
        # options that rule each other out: this pin hides the moment another option is active
        e.setdefault('hides', set()).update(p.get('QuestFlags3') or [])
    # a set of options: items that close on one flag, or pins that each hide under the others
    sets = defaultdict(list)
    for e in keep:
        if e['set'] is not None and sum(1 for k in keep if k['set'] == e['set']) > 1:
            sets['i%d' % e['set']].append(e)
    for e in keep:
        if any(id(e) in {id(x) for x in s} for s in sets.values()):
            continue
        rivals = [k for k in keep if k is not e and k.get('hides') and e['flags'] & k['hides'] and k['flags'] & e.get('hides', set())]
        if rivals:
            key = 'p' + min(str(sorted(k['flags'])) for k in rivals + [e])
            if e not in sets[key]:
                sets[key].append(e)
            for k in rivals:
                if k not in sets[key]:
                    sets[key].append(k)
    for n, s in enumerate(sorted(sets.values(), key=lambda s: (s[0]['act'] or 0, s[0]['n']))):
        for e in s:
            e['pick'] = n
    placed = []
    for e in keep:
        e['quests'] = {q for q in e['quests'] if T.Quest[q]['Act'] in reached and shown(T.Quest[q]['Name'])}
        # the Atlas has no world-map pins: an Endgame quest item counts in the Endgame, where it is used
        if not e['quests'] and not e['where'] and e['act'] != ENDGAME:
            left['permanent rewards the files cannot place'] += 1
            if os.environ.get('WI_DEBUG'):
                print('  unplaced', e['n'], e['ls'], sorted(flag(f) for f in e['flags']), file=sys.stderr)
            continue
        if e['quests']:                         # a quest's reward counts in the act the quest is in
            e['act'] = min(T.Quest[q]['Act'] for q in e['quests'])
        if e['act'] is None or e['act'] not in reached:
            left['permanent rewards in an act not in the game'] += 1
            continue
        placed.append(e)

    # ---- the quests
    states = defaultdict(list)
    for s in T.QuestStates:
        states[s['Quest']].append(s)
    starts = defaultdict(set)                   # flag -> the NPCs whose talk sets it
    gives = defaultdict(set)                    # reward window -> the NPCs who hand it out
    for t in T.NPCTalk:
        who = npc(t.get('NPCKey'))
        if not shown(who):
            continue
        for f in (t.get('QuestFlags1') or []) + [t.get('QuestFlag2')]:
            if f is not None:
                starts[f].add(who)
        if t.get('QuestRewardOffersKey') is not None:
            gives[t['QuestRewardOffersKey']].add(who)
    windows = defaultdict(list)
    for o in T.QuestRewardOffers:
        if o.get('QuestKey') is None:
            left['reward windows with no quest'] += 1
            continue
        windows[o['QuestKey']].append(o)
    rewards = defaultdict(list)
    for r in sorted(T.QuestRewards, key=lambda r: (r['RewardOffer'], r['RewardOrder'])):
        rewards[r['RewardOffer']].append(r)
    tiers = {u['BaseItemType']: u['Tier'] for u in T.UncutGems}
    rarity = lambda i: T.Rarity[i]['Id'] if i is not None else None

    cards = {}
    for q in T.Quest:
        name, act = q['Name'], q['Act']
        if not shown(name):
            left['quests with no name'] += 1
            continue
        if act not in reached:
            left['quests in no act' if not act else 'quests in Act %d (no area of it in the game)' % act] += 1
            continue
        key = (name, act)
        c = cards.get(key)
        if c is None:
            c = cards[key] = {'n': name, 'act': acts.get(act) or 'Act %d' % act, 'actn': act,
                              'kind': KIND.get(T.QuestType[q['Type']]['Id'], 'Main'), 'id': [], '_q': [],
                              '_where': [], '_by': set(), '_from': set(), 'take': [], 'gold': 0, '_also': []}
        c['id'].append(q['Id'])
        c['_q'].append(q['_i'])
        st = sorted(states.get(q['_i'], []), key=lambda s: -s['Order'])
        if 'do' not in c:
            first = next((s for s in st if s.get('Text') and not s.get('Unknown5')), None)
            if first:
                do = ' '.join(words(first['Text']))
                if do and not re.search(r'\{\d*\}?', do):
                    c['do'] = do
                elif do:
                    left['first steps the game fills in as it goes'] += 1
                for f in first.get('FlagsPresent') or []:
                    c['_by'] |= starts.get(f, set())
        for s in st:
            for i in s.get('WorldArea') or []:
                c['_where'].append(area(i))
            for i in (s.get('MapPinsKeys') or []) + [s.get('MapPinsKey')]:
                if i is not None:
                    c['_where'].append(pin_area(pins[i]))
        for o in windows.get(q['_i'], []):
            c['_from'] |= gives.get(o['_i'], set())
            c['gold'] += o.get('Unknown14') or 0
            one = []
            for r in rewards.get(o['_i'], []):
                n = item(r['Reward'])
                if not shown(n):
                    left['unused reward items'] += 1
                    continue
                x = {'n': n}
                if r.get('RewardLevel', 1) > 1:
                    x['lv'] = r['RewardLevel']
                if r.get('Reward') in tiers:
                    x['tier'] = tiers[r['Reward']]
                if rarity(r.get('RewardRarity')):
                    x['r'] = rarity(r['RewardRarity'])
                if (r.get('RewardStack') or 1) > 1:
                    x['x'] = r['RewardStack']
                one.append(x)
            if one:
                c['take'].append(one)
        for k in q.get('NormalReward') or []:
            c['_also'].append(T.QuestRewardType[k]['Name'])

    # ---- the permanent rewards onto their quests, and each card finished
    out = []
    for c in cards.values():
        mine = [e for e in placed if e['quests'] & set(c['_q'])]
        if mine:
            c['keep'] = [perm(e) for e in mine]
            for e in mine:
                e.setdefault('_cards', []).append(c['n'])
        # the quest log's reward kinds are its icons: where a window or a permanent reward says the thing itself,
        # the icon adds nothing ("Charm" over three Charms), so it stays only where nothing else does
        also = [] if c['take'] or mine else \
            [a for a in dict.fromkeys(c.pop('_also')) if a != 'Gold' and not re.search(r'Consumable|Permanent', a)]
        c.pop('_also', None)
        if also:
            c['also'] = also
        where = [w for w in dict.fromkeys(c.pop('_where')) if w]
        if where:
            c['where'] = where                                 # the first step's areas first
        by, fr = sorted(c.pop('_by')), sorted(c.pop('_from'))
        if len(by) == 1:                                       # more than one is a shared flag, not a giver
            c['by'] = by
        if fr:
            c['from'] = fr
        if not c['take']:
            del c['take']
        if not c['gold']:
            del c['gold']
        c.pop('_q')
        out.append({k: c[k] for k in ('n', 'act', 'actn', 'kind', 'do', 'where', 'by', 'from', 'take', 'gold', 'also',
                                      'keep', 'id') if k in c})
    order = {q['Name']: i for i, q in enumerate(T.Quest)}
    out.sort(key=lambda c: (c['actn'], order[c['n']]))

    # ---- act by act: the totals, and the choices beside them
    by_act = []
    for a in sorted({e['act'] for e in placed}):
        es = [e for e in placed if e['act'] == a]
        sums, other = Counter(), []
        for e in es:
            if 'pick' in e:
                continue
            for l in e['ls']:
                for t in tally(l):
                    sums[t[:2]] += t[2]
                if not tally(l):
                    other.append(l)
        picks = []
        for n in sorted({e['pick'] for e in es if 'pick' in e}):
            s = [e for e in es if e.get('pick') == n]
            picks.append({'of': [{'n': e['n'], 'ls': e['ls']} for e in s], 'where': s[0]['where'] or None,
                          'quest': (s[0].get('_cards') or [None])[0], 'undo': 'Subject to change'})
        row = {'act': acts.get(a) or 'Act %d' % a, 'actn': a,
               'sum': [total(w, h, sums[(w, h)]) for w in ORDER for h in ('%', '+', 'x', 'n') if sums.get((w, h))],
               'pick': [{k: v for k, v in p.items() if v} for p in picks],
               'from': [{k: v for k, v in (('n', e['n']), ('ls', e['ls']), ('where', e['where']), ('by', e['from']),
                                            ('quest', (e.get('_cards') or [None])[0]), ('pick', 'pick' in e),
                                            ('id', e['id'])) if v}
                        for e in es]}
        if other:
            row['other'] = other
        by_act.append(row)

    check(out, by_act)
    return {'note': 'Every quest a player can do: what it asks, where, who gives it, the reward windows (take one of '
                    'each), gold, and what it gives for good; the permanent rewards act by act with the choices '
                    'beside the totals. Written by tools/quests.py; "id" is the game\'s own and is never shown.',
            'updated': dt.date.today().isoformat(),
            'sources': ['the game tables of patch 0.5.5 (Quest, QuestStates, QuestRewardOffers, QuestRewards, '
                        'QuestStaticRewards, QuestItems, MapPins, NPCTalk, WorldAreas)',
                        'area names as data/areas.json has them (#72)' if card is not None else
                        'area names from WorldAreas (data/areas.json was not there)'],
            'check': 'poe2db (https://poe2db.tw/us/Quest): quest names, acts, reward windows, item levels and gold',
            'classes': 'Every class is offered every choice: the reward rows carry no class list in 0.5.5. '
                       'Source: poe2db, as the check.',
            'ids': ['id'],
            'counts': {'quests in the game': len(T.Quest), 'carded': len(out),
                       'merged': sum(len(c['id']) - 1 for c in out),
                       'permanent rewards': len(placed), 'choices': len({e['pick'] for e in placed if 'pick' in e}),
                       'left out': dict(sorted((k, v) for k, v in left.items() if v))},
            'quests': out, 'acts': by_act}


def perm(e):
    x = {'n': e['n'], 'ls': e['ls']}
    if e['where']:
        x['where'] = e['where']
    if e['from']:
        x['by'] = e['from']
    if 'pick' in e:
        x['pick'] = 'One of a set'
        x['undo'] = 'Subject to change'
    return x


def check(cards, acts):
    """Nothing a player reads may look like game code (the standard tools/sync.py holds its cards to)."""
    for c in cards + acts:
        for k, v in c.items():
            if k in ('id', 'actn'):
                continue
            w = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
            w = re.sub(r'"id": "[^"]*"', '', w)                # a reward's own key, never drawn
            w = re.sub(r'"(n|ls|lv|r|x|tier|where|by|of|quest|pick|undo|act)":', '', w)
            if RAW.search(w) or DNT.search(w) or re.search(r'\[[A-Za-z][^\]"]*\]|Metadata/|\{\d*\}|<[a-z]+>', w) or \
                    re.search(r'\b[A-Z]\d+(?:_\d+)+[a-z]?\b', w):
                raise lastgood.Stale('game code on %s: %s %r' % (c.get('n') or c.get('act'), k, v))


# ---------------------------------------------------------------- the check against poe2db

POE2DB = 'https://poe2db.tw/us/Quest'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'


def poe2db_check(out):
    """Every quest poe2db lists beside the same quest here: its act, its kind, the items its windows offer with
    their item level, and its gold. poe2db reads the same game files, so this checks the reading, not the game."""
    import html as H
    import urllib.request
    req = urllib.request.Request(POE2DB, headers={'User-Agent': UA})
    page = urllib.request.urlopen(req, timeout=60).read().decode('utf-8')
    theirs = defaultdict(list)                  # (name, act) -> [(item, item level)]
    for row in re.findall(r'<tr><td><a class="questitem"[^>]*>([^<]+)</a><div>Act (\d+)</div></td><td>(.*?)</td></tr>', page):
        name, act, cell = H.unescape(row[0]), int(row[1]), row[2]
        for it, lv in re.findall(r'<a [^>]*>(?:<img[^>]*>)?([^<]+)</a>\s*(?:\(iLv(\d+)\))?', cell):
            theirs[(name, act)].append((H.unescape(it).strip(), int(lv) if lv else None))
    flat = H.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', page)))
    flat = flat[flat.find('Quest /1'):]
    kinds = {'Main': 'Normal', 'Optional': 'Optional', 'Trial': 'Important', 'Mission': 'MasterMission'}
    said, same, differ = [], 0, 0
    for q in out['quests']:
        k = (q['n'], q['actn'])
        m = re.search(re.escape(q['n']) + r' (Normal|Optional|Important|MasterMission) Act ' + str(q['actn']) +
                      r'(?: Reward: (.*?))?(?= [A-Z][^ ]* (?:[A-Z][^ ]* )*(?:Normal|Optional|Important|MasterMission) Act |$)', flat)
        if k not in theirs and not m:
            continue
        ours = sorted((x['n'], x.get('lv')) for w in q.get('take') or [] for x in w)
        got = sorted(theirs.get(k, []))
        bad = []
        if k in theirs and ours != got:
            bad.append('items: ours %s, poe2db %s' % (ours, got))
        if m and kinds[q['kind']] != m[1]:
            bad.append('kind: ours %s, poe2db %s' % (q['kind'], m[1]))
        g = re.match(r'.*?(\d+) Gold', flat[m.start(2):m.end() + 12]) if m and m[2] else None
        gold = int(g[1]) if g else 0
        if m and gold != q.get('gold', 0):
            bad.append('gold: ours %s, poe2db %s' % (q.get('gold', 0), gold))
        if bad:
            differ += 1
            said.append('  differs  %s (%s): %s' % (q['n'], q['act'], '; '.join(bad)))
        else:
            same += 1
            said.append('  same     %s (%s)%s' % (q['n'], q['act'], ' %d items' % len(ours) if ours else ''))
    return same, differ, said


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    ap.add_argument('--game', help="the decoded tables' out/ folder")
    ap.add_argument('--areas', default=str(lastgood.DATA / 'areas.json'), help='the Area cards (data/areas.json)')
    ap.add_argument('--check', action='store_true', help='hold data/quests.json up against poe2db, write nothing')
    args = ap.parse_args()
    if args.check:
        same, differ, said = poe2db_check(json.loads((lastgood.DATA / OUT).read_text(encoding='utf-8')))
        print('\n'.join(said))
        print('poe2db  %d quests the same, %d differ (Source: poe2db, %s)' % (same, differ, POE2DB))
        return 0
    where = game_dir(args.game)
    out = lastgood.pull('Quests', lambda: build(where, args.areas), file=OUT, url=URL, at='quests', floor=60)
    if out is None:
        return lastgood.report()
    c = out['counts']
    print('quests %d in the game files, %d carded (%d more merged into a card of the same name)'
          % (c['quests in the game'], c['carded'], c['merged']))
    print('       by act: %s' % ', '.join('%s %d' % kv for kv in Counter(q['act'] for q in out['quests']).items()))
    print('       %d with a reward window, %d with gold, %d with a permanent reward; %d permanent rewards, %d choices'
          % (sum(1 for q in out['quests'] if q.get('take')), sum(1 for q in out['quests'] if q.get('gold')),
             sum(1 for q in out['quests'] if q.get('keep')), c['permanent rewards'], c['choices']))
    for a in out['acts']:
        print('       %-9s %s%s' % (a['act'], ', '.join(a['sum']) or '-',
                                    ''.join('; one of %d' % len(p['of']) for p in a['pick'])))
    if c['left out']:
        print('       left out: %s' % ', '.join('%d %s' % (n, w) for w, n in c['left out'].items()))
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    path = lastgood.DATA / OUT
    was = path.read_text(encoding='utf-8') if path.exists() else ''
    print('quests %.0f KB%s' % (len(text.encode('utf-8')) / 1024, '' if text == was else
                                (' (would change)' if args.report else ' -> data/%s' % OUT)))
    if not args.report:
        lastgood.save(path, text)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Quests', file=OUT, url=URL))
