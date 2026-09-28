"""data/trials.json: the two Trials of Ascendancy, card by card: what each modifier does, how bad it is, and what it pays.

A player in a trial picks a modifier or takes an affliction with a second to think, and the game gives the name,
one line and nothing else: not what the Trial of Chaos pays for it, not whether it shuts off the build (#82).
The game files hold all of it. This reads them and writes one entry per thing a player meets:

  Trial of Chaos    data/game/ultimatum_modifiers.json (tools/datpull.mjs, from UltimatumModifiers): 122 rows,
                    each with the game's own sort of it from data/game/ultimatum_types.json.
                    A modifier comes in tiers (Reduced Recovery, II, III...); one entry per modifier, every tier
                    in it with its own line and the reward bonus the game hides behind it: each tier adds more
                    Rarity of Items found in the trial (map_item_drop_rarity, "reward" in the file). The ten
                    wagers are entries of their own. data/game/ultimatum_trials.json: the rooms a trial can be,
                    and how many trials an Inscribed Ultimatum holds by area level.
  Sekhemas          data/game/sanctum.json (SanctumPersistentEffects and the rest), with data/game/sanctum_more.json
                    on the same ids (a floor's area level and act, a pledge's cost, the kinds of room): afflictions, boons and
                    pledges; one entry per name, its steps in it where the game keeps several (Assassin's Blade
                    1 to 10). The floors and the kinds of room, the Honour shrines among them.
  Relics            the modifiers a relic rolls, read from the game's mod table by RePoE (mods.min.json, domain
                    sanctum_relic) with the relic bases that roll each (base_items.min.json). One entry per
                    modifier and relic size, its tiers in it. Unique relics are cards already (poe.ninja prices
                    them); their lines are not repeated here.
  Ascension         which trial gives which set of Ascendancy points and from what area level, from the quest
                    states, the floor levels and the trial lengths in the game files. Where the files do not
                    say which set a trial gives, the entry says Subject to change and names its source.

Each entry carries plain words (t, ours) beside the game's own lines (ls, the game's), the tags of what it does
to you (the words #77 and data/monstermods.json use, so one filter reads all three), and a mark only where the
modifier's own effect decides it (RULES below, and design/trials.md): "Dangerous for most builds" where it
takes away something every build stands on, "Safe to take" where it cannot touch a fight at all. Everything
else is left unmarked, because whether it hurts depends on the build.

Nothing a player reads carries an id: a hidden stat is only matched against, and the ids in "ids" are never
drawn. design/trials.md is how the frame takes it.

    python tools/pipeline.py --only trials   the way to run it: a patch stage, under the last good rule
    python tools/trials.py
    python tools/trials.py --report    count and say what would change, write nothing
    python tools/trials.py --check     also fetch poe2db's two trial pages and check names and lines against them
"""
import argparse
import html
import json
import re
import sys
import urllib.request
from collections import Counter, OrderedDict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import official  # noqa: E402
from gamelib import SHOWN  # noqa: E402
from sync import DNT, RAW, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'data' / 'game'
OUT = ROOT / 'data' / 'trials.json'

SRC = 'Source: the game files'
SRC_REPOE = 'Source: the game files, read by RePoE'
SRC_POE2DB = 'Source: the game files for the level; poe2db for which set it gives'
LATER = 'Subject to change'          # the label; its tooltip is "Depends on GGG. May change without notice."
EST = 'Estimate'

CHAOS, WAGER, CROOM = 'Trial of Chaos modifier', 'Trial of Chaos wager', 'Trial of Chaos room'
KINDS = {'Minor Afflictions': 'Minor affliction', 'Major Afflictions': 'Major affliction', 'Minor Boons': 'Minor boon',
         'Major Boons': 'Major boon', 'Pledges': 'Pledge'}
SROOM, FLOOR, RELIC, ASC = 'Trial of the Sekhemas room', 'Trial of the Sekhemas floor', 'Relic modifier', 'Ascension'
ROMAN = ['I', 'II', 'III', 'IV', 'V']

# ---------------------------------------------------------------- what it does to you

# In #77's words and data/monstermods.json's, in the order a card shows them: what shuts off part of a build
# first, what makes the fight longer last. The words new here are the ones only a trial does to you (less
# defences, costs Honour...). Each: the tag, and what matches it in the game's own lines, lower case.
TAGS = [
    ('less recovery',        r'reduced life, mana,? and energy shield recovery'),
    ('fewer flask charges',  r'flask and charm charges'),
    ('less resistance',      r'^-\d+% to elemental resistances'),
    ('less defences',        r'less armour, evasion|you have no (armour|evasion)|less energy shield|armour, evasion and energy shield are zero'),
    ('less damage',          r'you and your minions deal (\d+% less|no) damage'),
    ('area and projectiles', r'less area of effect|your projectiles fly'),
    ('shorter buffs',        r'buffs on you expire'),
    ('costs Honour',         r'honour (lost|restored)|maximum honour|cannot restore honour|losing honour'),
    ('curse',                r'cursed with'),
    ('slows you',            r'slowing you|reduced movement speed|binding chains|grasping vines'),
    ('stuns you',            r'petrify|stun you'),
    ('knocks you back',      r'knockback'),
    ('more damage taken',    r'damage taken will\s+increase|increased damage taken|take \d+% increased damage|'
                             r'monsters deal \d+% more damage|traps deal (triple|\d+% increased)|remove \d+% of your life|'
                             r'take \d+ physical damage'),
    ('extra element',        r'damage as extra (damage of a random element|chaos damage)'),
    ('ailment on hit',       r'bleed|poison|corrupted blood|inflicting ruin'),
    ('more crits',           r'critical hit chance'),
    ('faster',               r'skill speed and movement speed|attack, cast and movement speed|traps are faster'),
    ('room hazard',          r'turrets|statues|machination|pyramid objects|shade stalks|globules|bloody hearts|runes will appear|'
                             r'rings (and circles )?of doom|spikes|^traps|blood mist'),
    ('damage bursts',        r'explod|volatiles|lightning storms|they will fall'),
    ('on death',             r'on death'),
    ('cannot be damaged',    r'immune to damage|an invulnerable'),
    ('resists fire',         r'monsters have \+\d+% to all resistances'),
    ('resists cold',         r'monsters have \+\d+% to all resistances'),
    ('resists lightning',    r'monsters have \+\d+% to all resistances'),
    ('harder to kill',       r'maximum life as extra maximum energy shield|increased toughness|stun threshold|increased maximum life'),
    ('stronger pack',        r'rare monsters'),
    ('boss only',            r'^bosses '),
    ('costs Sacred Water',   r'sacred water'),
    ('worse merchant',       r'merchant'),
    ('hides the map',        r'trial map|minimap|light radius|taken to the room'),
    ('fewer boons',          r'cannot gain any more boons|boon you gain is converted'),
    ('more afflictions',     r'gain (an additional )?a? ?random minor affliction'),
    ('weaker relics',        r'relics'),
]
TAGS = [(t, re.compile(w, re.I | re.M)) for t, w in TAGS]

# The mark, and the whole of the rule behind it. A mark is given only where the modifier's own words decide it:
# nothing here weighs a build, a league or anyone's opinion. Each rule: the words that meet it, and why, in the
# words the card shows beside the mark.
DANGER = [
    (lambda s: _pct(s, r'(\d+)% less armour, evasion and energy shield') >= 50
               or 'armour, evasion and energy shield are zero' in s or 'you have no armour, evasion and energy shield' in s,
     'Takes away half or more of all your Armour, Evasion and Energy Shield'),
    (lambda s: re.search(r'-\d+% to maximum elemental resistances', s),
     'Lowers your maximum resistances, which no gear inside the trial can make up'),
    (lambda s: _pct(s, r'(\d+)% reduced life, mana,? and energy shield recovery') >= 50,
     'Halves or worse every way you recover Life, Mana and Energy Shield'),
    (lambda s: _pct(s, r'you and your minions deal (\d+)% less damage') >= 40 or 'deal no damage' in s,
     'Cuts your damage by 40% or more, or stops it'),
    (lambda s: 'losing honour ends the trial' in s,
     'Losing any Honour at all ends the trial'),
    (lambda s: 'cannot restore honour' in s,
     'Honour you lose does not come back, so every hit brings the end of the trial closer'),
    (lambda s: 'petrify on hit' in s,
     'Every hit takes control away from you'),
]
# "Safe to take": every line of it changes only Sacred Water, the Merchant or what the Trial Map shows, and
# nothing in it reaches a fight, your Honour or your life.
SAFE_LINE = re.compile(r'sacred water|merchant|trial map|room types are unknown|rewards are unknown|afflictions are unknown|'
                       r'rooms are unknown', re.I)
UNSAFE = re.compile(r'honour|damage|life|defen|monsters (deal|have|inflict|remove|always)|trap', re.I)
SAFE_WHY = 'Changes only Sacred Water, the Merchant or the Trial Map; nothing in a fight'


def _pct(s, pat):
    m = re.search(pat, s)
    return int(m.group(1)) if m else -1


def tags_of(lines):
    text = '\n'.join(lines).lower()
    return [t for t, w in TAGS if w.search(text)]


def danger(lines):
    s = ' '.join(lines).lower()
    for ok, why in DANGER:
        if ok(s):
            return why
    return None


# what only says when a line happens, not what it does: "Lose 20 Sacred Water when you take Damage from an Enemy Hit"
# changes Sacred Water and nothing else
WHEN = re.compile(r'when you take damage from an enemy hit|monsters no longer drop', re.I)


def safe(lines):
    return bool(lines) and all(SAFE_LINE.search(x) and not UNSAFE.search(WHEN.sub('', x)) for x in lines)


# ---------------------------------------------------------------- plain words (ours)

# What each Trial of Chaos modifier does, in plain words. The game's own line for every tier is on the entry
# beside it; these say the same thing the way a player would say it at the altar.
CHAOS_WORDS = {
    'Reduced Recovery': 'You heal, regain Mana and recharge Energy Shield slower, from every source: flasks, regeneration, leech.',
    'Lessened Reach': 'Your area skills cover less ground and your projectiles fly slower.',
    'Time Paradox': 'Your buffs run out sooner, and ailments and curses on you last longer.',
    'Damaged Defences': 'Less Armour, Evasion and Energy Shield, all three at once.',
    'Reduced Resistances': 'Your elemental resistances drop; from tier III your maximum resistances drop too.',
    'Drought': 'Kills refill your flasks and charms less, and at tier V not at all.',
    'Escalating Damage Taken': 'The longer you stay in a room, the more damage you take, up to 50% more.',
    'Monster Speed': 'Monsters attack, cast and move faster.',
    'Prismatic Monsters': 'Monster hits carry extra fire, cold or lightning damage.',
    'Chaotic Monsters': 'Monster hits carry extra chaos damage.',
    'Deadly Monsters': 'Monsters land critical hits far more often.',
    'Toxic Monsters': 'Monster hits can poison you or make you bleed.',
    'Resistant Monsters': 'Monsters resist fire, cold and lightning damage.',
    'Unstoppable Monsters': 'Monsters are harder to slow and to stun.',
    'Shielding Monsters': 'Monsters get Energy Shield on top of their Life.',
    'Volatile Fiends': 'Monsters can leave an exploding orb behind when they die; rare monsters leave bigger ones.',
    'Enraged Bosses': 'The bosses take longer to kill and hit harder.',
    'Lethal Rare Monsters': 'More rare monsters; at tier III each has one more modifier.',
    'Stormcaller Runes': 'Runes on the floor call lightning down on you if you stand in them.',
    'Impending Doom': 'Rings grow on the floor and explode for physical damage when they are full size.',
    'Blood Globules': 'Blood globules follow you and drop on you for physical damage.',
    'Vaal Omnitect': 'A Vaal machine in the room attacks you.',
    'Pyramid Beams': 'Pyramids sweep the room with rotating beams that inflict Corrupted Blood.',
    'Petrification Statues': 'Statues turn you to stone if you stand in their gaze too long.',
    'Stalking Shade': 'A shade that cannot be killed follows you and inflicts Ruin with its hits.',
    'Burning Turrets': 'Turrets in the room shoot fire projectiles.',
    'Shocking Turrets': 'Turrets in the room shoot lightning projectiles.',
    'Temple Traps': 'Spikes on the floor deal physical damage when you step on them.',
    'Entangling Monsters': 'Monster hits wrap you in Grasping Vines.',
    'Random Projectiles': 'Your projectiles fly in random directions.',
    'Occasional Impotence': 'For 2 seconds in every 8, you and your minions deal no damage.',
    'Heart Tethers': 'Hearts tether and slow you; breaking a tether stuns you and you take more damage for a while.',
    'Blood Mist': 'Monsters standing in the blood mist cannot be damaged.',
}
# A wager: what it costs and what it pays, in that order.
WAGER_WORDS = {
    'Wager of the Present': ('Every modifier you already chose goes up a tier', 'Currency rewards waiting for you are doubled'),
    'Wager of Rarity': ('Every reward waiting for you is destroyed', '100% more item rarity'),
    'Wager of Rerolling': ('Two of the modifiers you chose go up a tier', 'Rewards waiting for you are rolled again'),
    'Wager of Ruin': ('A shade that cannot be killed hunts you and your Ruin is set to 5', 'The trial bosses drop a rare unique item'),
    'Wager of Mystery': ('You no longer see the modifiers you are offered', 'Every reward offered is Lucky'),
    'Wager of Upgrades': ('Each modifier you choose also raises one you chose before', 'Each room cleared adds one to a waiting reward'),
    'Wager of Danger': ('Boss rooms offer their modifiers at the highest tier', 'Boss rooms offer one more reward'),
    'Wager of the Future': ('Every modifier offered comes a tier higher', 'Currency rewards offered come in double stacks'),
    'Wager of Chaos': ('Modifiers you chose go up a tier', 'Every room offers more rewards'),
}
# The Sekhemas effects in plain words, where the game's line leans on a word a player may not know yet
# (Honour, a Maraketh Shrine, Binding Chains...). Everywhere else the game's own line is plain already, and the
# card shows it alone rather than say it twice.
SEKHEMAS_WORDS = {
    'Hungry Fangs': 'Every hit takes a slice of your Life, Mana and Energy Shield off the top, whatever your defences.',
    'Branded Balbalakh': 'Nothing restores Honour for the rest of the trial: every hit you take stays taken.',
    'Suspected Sympathiser': 'Shrines, boons and relics give back half as much Honour.',
    'Haemorrhage': 'Nothing restores Honour until the next boss is dead.',
    'Ghastly Scythe': 'For the next few rooms, losing any Honour at all ends the trial.',
    'Weakened Flesh': 'Your Honour bar is a quarter shorter.',
    'Orbala\'s Leathers': 'The price of the Orbala\'s Leathers boon once it has saved you: half your Honour bar.',
    'Death Toll 2': 'A countdown: after that many rooms you take 250 physical damage.',
    'Spiked Exit': 'Every room you finish costs 30 physical damage.',
    'Chains of Binding': 'Monster hits bind you in chains for 2 seconds.',
    'Untouchable': 'Enfeeble is on you for the rest of the trial: you deal less damage.',
    'Chiselled Stone': 'Monster hits turn you to stone.',
    'Rusted Mallet': 'Every monster hit knocks you back, and further.',
    'Dishonoured Tattoo': 'Once you are on Low Life, you take double damage.',
    'Worn Sandals': 'You move slower for a while after each hit you take.',
    'Fiendish Wings': 'Monsters are faster, and nothing can slow them below their normal speed.',
    'Tattered Blindfold': 'You see almost nothing around you, and the minimap is gone.',
    'Deceptive Mirror': 'A third of the time the door takes you to another room than the one you picked.',
    'Myriad Aspersions': 'Every affliction brings another minor one with it.',
    'Costly Aid': 'Every shrine you venerate also gives you a minor affliction.',
    'Glass Shard': 'Your next boon turns into a minor affliction.',
    'Unassuming Brick': 'No more boons for the rest of the trial.',
    'Orb of Negation': 'Your relics do nothing, except unique ones.',
    'Forgotten Traditions': 'Your relics give half as much, except unique ones.',
    'Veiled Sight': 'The Trial Map shows no rooms ahead.',
    'Iron Manacles': 'Evasion is gone for the rest of the trial.',
    'Sharpened Arrowhead': 'Armour is gone for the rest of the trial.',
    'Corrosive Concoction': 'Armour, Evasion and Energy Shield are all gone for the rest of the trial.',
    'Garukhan\'s Favour': 'The first hit you take in each room does nothing.',
    'Ahkeli\'s Guard': 'After each hit you take, you cannot be damaged for a second.',
    'Sekhema\'s Cloak': 'When your Honour runs out, you come back once with it full.',
    'Glowing Orb': 'The first time you drop under 20% Life, you get all your Life and Energy Shield back and half your Honour.',
    'Moment\'s Peace': 'Nothing can damage you until you finish the next room.',
    'Crystal Shard': 'Your next affliction turns into a minor boon.',
    'Silver Chalice': 'Your next minor boon turns into a major one.',
    'Holy Water': 'Every shrine you venerate also gives you a minor boon.',
    'Earned Honour': 'Every room you finish gives some Honour back.',
    'Reparations': 'Taking a hit pays you 2 Sacred Water.',
    'Assassin\'s Blade': 'The next few non-boss monsters you hit die on the spot.',
    'Pledge to the Guileful': 'Open one reward chest in each room with no key; doing it costs you damage.',
    'Pledge to the Powerful': 'Bosses cost you half the Honour; every other room costs double.',
    'Pledge to the Deserted': 'The Merchant is half price, but monsters stop dropping Sacred Water.',
    'Pledge to the Afflicted': 'Every affliction comes with a key, and Honour comes back a little slower.',
}
# A pledge's cost the game words with a number left open ({0}): which of the row's numbers fills it is not known
# to datpull, so it keeps the stat, and the cost is worded here from that stat's own number. poe2db prints the
# same line with the number left open.
COST_FROM_STAT = {
    'sanctum_take_damage_on_opening_chest_without_key': 'Take {} Physical Damage on opening a Key Chest without using a Key',
}

# ---------------------------------------------------------------- the rows


def rarity(lines):
    for x in lines or []:
        m = re.match(r'(\d+)% more Rarity of Items found', x)
        if m:
            return int(m.group(1))
    return None


def family(name):
    return re.sub(r' (?:I|II|III|IV|V)$', '', name)


def ultimatum_modifiers():
    """data/game/ultimatum_modifiers.json with each row's types (the game's own sort of it) from ultimatum_types.json."""
    src = json.loads((GAME / 'ultimatum_modifiers.json').read_text(encoding='utf-8'))
    types = {r['id']: r.get('types') for r in json.loads((GAME / 'ultimatum_types.json').read_text(encoding='utf-8'))['rows']}
    for r in src['rows']:
        if types.get(r.get('id')):
            r['types'] = types[r['id']]
    return src


def sanctum():
    """data/game/sanctum.json with what sanctum_more.json adds on the same ids: a floor's area level and act, a
    pledge's cost, and the kinds of room (appended, kind Room)."""
    src = json.loads((GAME / 'sanctum.json').read_text(encoding='utf-8'))
    more = json.loads((GAME / 'sanctum_more.json').read_text(encoding='utf-8'))['rows']
    extra = {(m['kind'] == 'Floor', m['id']): m for m in more if m['kind'] in ('Floor', 'Pledge')}
    for r in src['rows']:
        m = extra.get((r['kind'] == 'Floor', r.get('id')))
        if m:
            r.update({k: v for k, v in m.items() if k not in ('kind', 'id')})
    src['rows'] += [m for m in more if m['kind'] == 'Room']
    return src


def nums(s):
    """The numbers a line prints, a lone 1 aside ("Inflict 1 Grasping Vine" is the vine, not an amount)."""
    return sorted({int(x) for x in re.findall(r'\d+', s or '')} - {1})


def chaos():
    src = ultimatum_modifiers()
    fams = OrderedDict()
    for r in src['rows']:
        fams.setdefault(family(r['name']), []).append(r)
    rows = []
    for name, rs in fams.items():
        types = {t for r in rs for t in r.get('types') or []}
        if types & {'Wager', 'WagerShade'}:
            rows.append(wager(name, rs))
            continue
        tiers, danger_from, why, off = [], None, None, []
        for i, r in enumerate(rs):
            lines = [x for x in r['text'].split('\n') if x.strip()]
            # n is the game's name for the tier; step is its place in the modifier (I, II...), which is what a
            # player reads where the game gives every tier the same name (Lethal Rare Monsters)
            tier = {'n': r['name'], 'step': ROMAN[i], 'tier': r['tier'],
                    'ls': [re.sub(r'\s+', ' ', x).strip() for x in lines]}
            if rarity(r.get('reward')) is not None:
                tier['rarity'] = rarity(r['reward'])
            # the game's line against the stats behind it: where their numbers part, the line may be the one that
            # is out of date, and the card says so rather than pick one
            if r.get('mods') and not set(nums(' '.join(r['mods']))) <= set(nums(r['text'])):
                tier['stats'] = r['mods']
                off.append(name + ' ' + ROMAN[i])
            d = danger(tier['ls'])
            if d and danger_from is None:
                danger_from, why = name + ' ' + ROMAN[i], d
            tiers.append(tier)
        on = ('In the room' if any('Daemon' in t for t in types)
              else 'On monsters' if re.match(r'(Monsters|Bosses|Rare Monsters|\d+% increased Rare)', rs[0]['text'])
              else 'On you')
        allls = [x for t in tiers for x in t['ls']]
        tg = tags_of(allls)
        if on == 'In the room' and 'room hazard' not in tg:
            tg.append('room hazard')
        # the plain words are the risk side of the choice, and the reward bonus is the other
        it = {'n': name, 'id': name, 's': CHAOS, 'on': on, 'tiers': tiers, 'risk': CHAOS_WORDS.get(name)}
        rr = [t['rarity'] for t in tiers if t.get('rarity') is not None]
        if rr:
            it['reward'] = ('%d%% more Rarity of Items found in the trial' % rr[0] if len(rr) == 1 else
                            '%d%% to %d%% more Rarity of Items found in the trial, by tier' % (rr[0], rr[-1]))
        if tg:
            it['tags'] = tg
        if danger_from:
            it['mark'] = 'danger'
            it['why'] = why if danger_from == name + ' I' else 'From %s: %s' % (danger_from, why[0].lower() + why[1:])
        if off:
            it['later'] = 'The game\'s line and the stats behind it give different numbers on %s' % ', '.join(off)
        it['src'] = SRC
        rows.append(drop(it))
    return rows


def wager(name, rs):
    lines = [[re.sub(r'\s+', ' ', x).strip() for x in r['text'].split('\n') if x.strip()] for r in rs]
    cost, pay = WAGER_WORDS.get(name, (None, None))
    it = {'n': name, 'id': name, 's': WAGER, 'ls': lines[0], 'alt': lines[1:] or None, 'risk': cost, 'reward': pay,
          'tags': tags_of([x for ls in lines for x in ls]) or None, 'src': SRC}
    return drop(it)


def chaos_rooms():
    src = json.loads((GAME / 'ultimatum_trials.json').read_text(encoding='utf-8'))
    rooms = [drop({'n': r['name'], 'id': 'Chaos: ' + r['name'], 's': CROOM, 'src': SRC})
             for r in src['rows'] if r['kind'] == 'Room']
    lengths = [(r['level'], r['trials']) for r in src['rows'] if r['kind'] == 'Length']
    area = next((r for r in src['rows'] if r['kind'] == 'Area'), {})
    return rooms, lengths, area


def sekhemas():
    src = sanctum()
    groups = OrderedDict()
    for r in src['rows']:
        if r['kind'] not in KINDS or not r.get('text') or 'UNUSED' in r['text']:
            continue
        # one entry per name; two effects that share a name but not their words are two entries ("Death Toll":
        # no Sacred Water from monsters, and the countdown). The first two words, numbers aside, tell them apart.
        key = (r['kind'], r['name'], ' '.join(re.sub(r'\d+', '#', r['text']).split()[:2]))
        groups.setdefault(key, []).append(r)
    rows, seen = [], Counter()
    for (kind, name, _), rs in groups.items():
        seen[name] += 1
        steps = [[x for x in r['text'].split('\n') if x.strip()] for r in rs]
        ls = steps[0]
        it = {'n': name, 'id': name if seen[name] == 1 else '%s %d' % (name, seen[name]), 's': KINDS[kind]}
        it['ls'] = ls
        if len(steps) > 1:
            # the other steps, each by the line that differs from the first ("removed after 2 rooms")
            it['steps'] = len(steps)
            it['alt'] = [x for st in steps[1:] for x in st if x not in ls]
        it['t'] = SEKHEMAS_WORDS.get(it['id'])
        if kind == 'Pledges':
            cost = rs[0].get('cost')
            if not cost:
                for stat, words in COST_FROM_STAT.items():
                    if stat in (rs[0].get('hidden') or {}):
                        cost = words.format(rs[0]['hidden'][stat])
            it['risk'], it['reward'] = cost, ls[0]
            if cost:
                it['ls'] = ls + [cost]
        allls = [x for s in steps for x in s] + ([it['risk']] if it.get('risk') else [])
        if 'Afflictions' in kind or kind == 'Pledges':
            tg = tags_of(allls)
            if tg:
                it['tags'] = tg
        if 'Afflictions' in kind:
            d = danger(allls)
            if d:
                it['mark'], it['why'] = 'danger', d
            elif safe(allls):
                it['mark'], it['why'] = 'safe', SAFE_WHY
        it['src'] = SRC
        rows.append(drop(it))
    floors = [r for r in src['rows'] if r['kind'] == 'Floor']
    rooms = []
    for r in src['rows']:
        if r['kind'] != 'Room':
            continue
        # two kinds of room are both called Fountain: the large one says so in its own line
        big = ' (large)' if 'Large' in (r.get('text') or '') else ''
        rooms.append(drop({'n': r['name'], 'id': 'Sekhemas: ' + r['name'] + big, 's': SROOM,
                           'ls': [r['text']] if r.get('text') else None, 'rooms': r['rooms'],
                           'names': ['%s: %s' % (f['name'], n) for f, n in zip(floors, r.get('names') or [])],
                           'src': SRC}))
    flo = [drop({'n': f['name'], 'id': f['name'], 's': FLOOR, 'ls': [f['text']] if f.get('text') else None, 'level': f.get('level'),
                 'key': f.get('key'), 'rooms': f.get('rooms'), 'src': SRC}) for f in floors]   # level: the floor's MinLevel
    return rows, rooms, flo, floors


def relics():
    """The relic modifiers, one entry per modifier and relic size, tiers in order."""
    mods = official('mods.min.json')
    bases = official('base_items.min.json')
    size_of = {}
    for b in bases.values():
        for t in b.get('tags') or []:
            if t.endswith('_sanctum_relic') and b.get('release_state') == 'released':
                size_of.setdefault(t, []).append(b['name'])
    SIZE = {'small_sanctum_relic': 'Small', 'medium_sanctum_relic': 'Medium', 'large_sanctum_relic': 'Large', 'default': 'Any'}
    fams = OrderedDict()
    for mid, m in mods.items():
        if m.get('domain') != 'sanctum_relic' or m.get('generation_type') not in ('prefix', 'suffix', 'corrupted'):
            continue
        w = [s['tag'] for s in m.get('spawn_weights') or [] if s.get('weight')]
        if not w or not m.get('text'):
            continue          # a tier that never rolls: the game keeps it, no relic carries it
        text = plain(m['text'])
        tmpl = re.sub(r'\(\d+(?:\.\d+)?-\d+(?:\.\d+)?\)|\d+(?:\.\d+)?', '#', text)
        fams.setdefault((tmpl, w[0], m['generation_type']), []).append((m, text))
    rows = []
    for (tmpl, size, gen), ms in fams.items():
        ms.sort(key=lambda x: x[0].get('required_level') or 0)
        where = SIZE.get(size, size)
        it = {'n': tmpl, 'id': '%s (%s)' % (tmpl, where.lower()), 's': RELIC,
              'gen': 'Corrupted' if gen == 'corrupted' else gen.capitalize(),
              'size': where, 'relics': sorted(size_of.get(size, [])) if size != 'default' else None,
              'tiers': [drop({'n': m.get('name') or None, 'level': m.get('required_level'), 'ls': [text]}) for m, text in ms],
              'src': SRC_REPOE}
        if re.search(r'honour', tmpl, re.I):
            it['q'] = 'honour'
        rows.append(drop(it))
    return rows


def ascension(floors, lengths, area):
    """Which trial gives which set of Ascendancy points, and from what area level. The quest states name the
    first two outright: Ascent to Power ends "you have chosen an Ascendancy", The Trials of Chaos ends "you have
    earned 2 Ascendancy Points" on the flag for the second set. For the third and fourth the files hold the
    floor levels, the trial counts and the Trialmaster's door ("the secret challenge behind the door at the end of
    this Trial will grant additional Ascendancy Skill Points"), but not which set a Barya of three or four trials
    gives: those say Subject to change, and poe2db is the source."""
    fl = {f['name']: f for f in floors}
    by_len = {t: lv for lv, t in lengths}
    first = fl.get('Test of Strength', {})

    def floor(name, trials):
        f = fl.get(name, {})
        return {'trial': 'Trial of the Sekhemas', 'how': 'A Barya with %s trials, through the %s (the floor opens from level %s)'
                % (trials, name, f.get('level')), 'level': f.get('level'), 'later': LATER, 'src': SRC_POE2DB}
    rows = [
        {'n': 'First Ascension', 'points': 2, 'total': 2, 't': 'You choose your Ascendancy, and take its first 2 points.',
         'ways': [{'trial': 'Trial of the Sekhemas', 'how': 'The Test of Strength: defeat %s (Act %s quest Ascent to Power, '
                   'with Balbala\'s Barya)' % (re.sub(r'^Contains ', '', first.get('text', '')), first.get('act')),
                   'level': first.get('areaLevel'), 'src': SRC}]},
        {'n': 'Second Ascension', 'points': 2, 'total': 4,
         'ways': [{'trial': 'The Trial of Chaos', 'how': 'The Trialmaster\'s Challenges with the Chimeral Inscribed Ultimatum, '
                   '%d trials (Act %s quest The Trials of Chaos)' % (dict(lengths).get(1, 4), area.get('act')),
                   'level': area.get('level'), 'src': SRC},
                  floor('Test of Will', 'two')]},
        {'n': 'Third Ascension', 'points': 2, 'total': 6,
         'ways': [floor('Test of Cunning', 'three'),
                  {'trial': 'The Trial of Chaos', 'how': 'An Inscribed Ultimatum of 7 trials (from area level %s)' % by_len.get(7),
                   'level': by_len.get(7), 'later': LATER, 'src': SRC_POE2DB}]},
        {'n': 'Fourth Ascension', 'points': 2, 'total': 8,
         'ways': [floor('Test of Time', 'four'),
                  {'trial': 'The Trial of Chaos', 'how': 'An Inscribed Ultimatum of 10 trials (from area level %s), then the '
                   'Trialmaster behind the door at its end, opened with three Fates' % by_len.get(10),
                   'level': by_len.get(10), 'src': SRC}]},
    ]
    for r in rows:
        r.update({'id': r['n'], 's': ASC, 'src': SRC})
        if any(w.get('later') for w in r['ways']):
            r['later'] = 'The game files hold the levels and the trial counts, not which set of points each gives'
    return [drop(r) for r in rows]


def drop(o):
    return {k: v for k, v in o.items() if v not in (None, '', [], {})}


def build():
    c = chaos()
    crooms, lengths, area = chaos_rooms()
    s, srooms, flo, floors = sekhemas()
    rel = relics()
    asc = ascension(floors, lengths, area)
    rows = c + crooms + s + srooms + flo + rel + asc
    for it in rows:
        q = set(it.get('tags') or [])
        blob = json.dumps(it, ensure_ascii=False)
        if 'Honour' in blob:
            q.add('honour')
        if it.get('mark') == 'danger':
            q.add('dangerous')
        elif it.get('mark') == 'safe':
            q.add('safe')
        if q:
            it['q'] = ' '.join(sorted(q))
    ids = Counter(it['id'] for it in rows)
    dup = [k for k, n in ids.items() if n > 1]
    if dup:
        sys.exit('two entries share an id: %s' % ', '.join(dup))
    check(rows)
    meta = json.loads((GAME / '_meta.json').read_text(encoding='utf-8'))
    return {'source': 'game files, patch %s; relic modifiers from RePoE; poe2db where an entry says so' % meta.get('patch', ''),
            'table': ', '.join(OrderedDict.fromkeys(t.strip() for f in ('ultimatum_modifiers', 'ultimatum_types', 'ultimatum_trials', 'sanctum', 'sanctum_more')
                               for t in json.loads((GAME / (f + '.json')).read_text(encoding='utf-8'))['table'].split(','))) +
                     '; relics: Mods, BaseItemTypes (RePoE)',
            'note': 'One entry per thing a player meets in the two Trials of Ascendancy; s says which. t is plain words (ours; '
                    'a Trial of Chaos modifier carries them as its risk), '
                    'ls the game\'s own lines (tiers: one per tier, with rarity, the hidden reward bonus that tier adds). '
                    'tags say what it does to you, in #77\'s words; mark is danger or safe only where the rule in '
                    'tools/trials.py decides it from the modifier\'s own words, and why says which rule. risk and reward '
                    'are the two sides of a choice. later is why an entry carries the Subject to change label (labels.later: its words '
                    'and tooltip). q holds search words, honour on everything that touches Honour. Written by tools/trials.py; '
                    'design/trials.md.',
            'labels': {'later': {'text': LATER, 'tip': 'Depends on GGG. May change without notice.'}, 'est': EST},
            'ids': ['id'], 'rows': rows}


def check(rows):
    """Nothing a player reads may look like game code (tools/sync.py's standard, and the #12 rule)."""
    def walk(v, where):
        if isinstance(v, str):
            if RAW.search(v) or DNT.search(v) or any(m.search(v) for m in SHOWN):
                sys.exit('game code in %s: %r' % (where, v))
        elif isinstance(v, list):
            for x in v:
                walk(x, where)
        elif isinstance(v, dict):
            for k, x in v.items():
                if k != 'id':
                    walk(x, where + '.' + k)
    for it in rows:
        walk(it, it['id'])


# ---------------------------------------------------------------- the check against poe2db

POE2DB = {'The Trial of Chaos': 'https://poe2db.tw/us/The_Trial_of_Chaos',
          'Trial of the Sekhemas': 'https://poe2db.tw/us/Trial_of_the_Sekhemas'}


def page_text(url):
    req = urllib.request.Request(url, headers={'User-Agent': 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'})
    raw = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    raw = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', raw, flags=re.S)
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', raw))).strip()


def norm(s):
    """The page's words as a line reads: poe2db wraps each keyword in a tag of its own, which leaves a space
    before a comma and after a hyphen once the tags are gone."""
    s = re.sub(r'\s+', ' ', s.replace('—', '-'))
    return re.sub(r'- (?=[A-Z])', '-', re.sub(r' (?=[,.:;])', '', s)).strip()


def poe2db_check(rows):
    """Every Trial of Chaos tier and wager, and every Sekhemas affliction, boon and pledge: its name and each of
    its lines must be on poe2db's page for that trial. poe2db prints some lines with the number left open ("Take
    {0} Physical Damage"), where the game files hold it: those match with the number counted as open, and are
    counted apart. Prints what matched and what did not."""
    pages = {k: norm(page_text(u)) for k, u in POE2DB.items()}
    ok, open_, bad = 0, 0, []

    def found(x, page):
        if norm(x) in page:
            return 1
        pat = re.sub(r'\d+', lambda m: r'(?:%s|\{\d\})' % m.group(), re.escape(norm(x)))   # this number, or poe2db's open one
        return 2 if re.search(pat, page) else 0
    for it in rows:
        if it['s'] in (CHAOS, WAGER):
            page = pages['The Trial of Chaos']
            items = [(t['n'], t['ls']) for t in it.get('tiers') or []] or [(it['n'], it['ls'] + (it.get('alt') or [[]])[0])]
        elif it['s'] in KINDS.values():
            page, items = pages['Trial of the Sekhemas'], [(it['n'], it['ls'])]
        else:
            continue
        for name, lines in items:
            got = [found(x, page) for x in [name] + lines]
            if 0 in got:
                bad.append('%s: %s' % (name, ' | '.join(x for x, g in zip([name] + lines, got) if not g)))
            elif 2 in got:
                open_ += 1
            else:
                ok += 1
    print('poe2db   %d match by name and every line, %d more with poe2db leaving a number open; %d do not'
          % (ok, open_, len(bad)))
    for b in bad:
        print('         not on poe2db as written: ' + b)
    return ok, open_, bad


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    ap.add_argument('--check', action='store_true', help='check names and lines against poe2db (network)')
    args = ap.parse_args()
    out = build()
    rows = out['rows']
    by = Counter(it['s'] for it in rows)
    print('trials   ' + ', '.join('%d %s' % (n, k) for k, n in by.items()))
    tiers = [t for it in rows if it['s'] == CHAOS for t in it['tiers']]
    bonus = Counter(t['rarity'] for t in tiers if 'rarity' in t)
    print('         Trial of Chaos: %d tiers; reward bonus (more rarity) %s' % (len(tiers), ', '.join(
        '%d%% x%d' % (k, bonus[k]) for k in sorted(bonus))))
    marks = Counter((it['s'], it['mark']) for it in rows if it.get('mark'))
    print('         marks: ' + ', '.join('%s %s %d' % (s, m, n) for (s, m), n in sorted(marks.items())))
    tally = Counter(t for it in rows for t in it.get('tags') or [])
    print('         tags: ' + ', '.join('%s %d' % (t, tally[t]) for t, _ in TAGS if tally[t]))
    later = [it['n'] for it in rows if it.get('later')]
    print('         %s: %s' % (LATER, ', '.join(later)))
    if args.check:
        poe2db_check(rows)
    text = json.dumps(out, ensure_ascii=False, indent=1) + '\n'
    was = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    if args.report:
        print('--report: nothing written%s' % ('' if text == was else ' (would change data/trials.json)'))
        return 0
    OUT.write_text(text, encoding='utf-8', newline='\n')
    print('-> data/trials.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
