"""Our own cards: the mechanics the game never writes down.

A player asked why a passive saying "increased" shows no keyword chip. It shows none because the game's own
glossary has no entry for increased, reduced, more or less, and the game never marks those words. The
behaviour is real all the same, and 1,700-odd cards in the index are written in those words, so the words
themselves are the door: these cards say what the maths does, and the lines that use the words lead to them.

They are not game text, so they never pretend to be:
  * their own kind ("h"), their own label (Mechanics), and no keyword chips
  * each one carries the source it was read off ("src"), shown on the card itself (assets/app.js)
  * the page draws the words that lead here differently from the game's keyword chips (.hlink, cards.css)

Written in the game's own register: declarative, present tense, one fact a line, "For example, ..." for a
worked case, and the game's capitalised nouns where the game has a word for the thing. Read data/info.json
and the keyword text in data/explore/keywords.*.json before changing a line here — that is the voice to match.

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

The flowchart card is the one card here the game does most of the talking on: every step it names is a step
the game has a glossary entry for, quoted down to the game's own wording. The order, the conversion chain and
what extra damage copies come off Path of Building (see "read for conversion" below). "fl" holds the chart as
steps and notes, never as markup — assets/app.js draws the boxes and the arrows (.flow in cards.css), so the
index stays text. A group is either a run of steps ("st", one box each, an arrow between them) or a pair of
columns ("cols", side by side on a wide card and stacked on a phone): conversion and extra damage get the
pair, because the two read as the same thing and are not.

What was read for conversion, in the same repo, and what settles it:
  CalcOffence.lua, the conversion table, in its own comments: "-- First step: Process skill conversion",
    then "-- Second step: Process global conversion and gains", and inside that second step
    "-- Process global conversion on skill-converted damage", which runs processDamageConversion() again
    over each destination the skill already converted to: that is the chain, and a portion can change type
    twice. processDamageConversion() caps a type's conversion at 100% ("-- Scale if over 100%").
  CalcOffence.lua, calcGainedDamage(), extra damage as:
      local baseMin = output[otherType.."MinBase"] * activeSkill.conversionTable[otherType].mult
      local convertedMin, convertedMax = calcConvertedDamage(activeSkill, output, cfg, otherType)
      gainedMin = gainedMin + (baseMin + convertedMin) * gainMult
    the copy is taken off the source type's base after conversion has settled, the source keeps its own
    damage, and the gain table is built by adding skill and global gains in one pass with no cap and no
    second round, so a copy is never copied again.
  CalcOffence.lua, the base every type is left with, and the proof that all of this lands before the
  increases: summedMin = baseMin * convMult + convertedMin + gainedMin, and only then does calcDamage()
  apply inc and more to output[damageType.."SummedMinBase"].
  CalcOffence.lua, which modifiers a converted or copied portion takes: calcDamage() is called once per
  damage type with typeFlags 0, so damageStatsForTypes gives it "Damage" and that one type's "<Type>Damage"
  and nothing else. The damage does not keep the modifiers of the type it came from.
The game states that last part itself, so the card credits the game for it and not the code: the Damage
Conversion entry ("scale with modifiers to the new damage type, and no longer scale with modifiers to the old
damage type"), and "Damage Gained as extra X" for the copies ("only scales with modifiers to the new type,
not with modifiers to the source damage's type"). That same entry says gain "occurs in the same two step
process as Damage Conversion", where the code instead adds skill and global gains in one pass — the card
follows the game, and says nothing about a copy being copied again, which the two do not agree on. Both
entries rule damage over time out, and the card says so.
  CalcPerform.lua only feeds the gain mods in (Unholy Might writes "DamageGainAsChaos"); it sets no order.
  ModStore.lua's Combine sends MORE to More() and everything else to Sum(), which is the additive-against-
  multiplicative split the other three cards rest on.

What was read for the defences flowchart, in src/Modules/CalcDefence.lua, and what it settles:
  the order a Hit you take runs through. takenHitFromDamage() cuts the raw damage down first, through
  damageMitigationMultiplierForType(), which it calls and which ends —
      local totalDRMulti = 1 - m_max(m_min(output[damageType .. "DamageReductionMax"], totalDRPercent
                                           - enemyOverwhelmPercent), 0) / 100
      local totalResistMult = output[type .. "ResistTakenHitMulti"]
      return totalResistMult * totalDRMulti
    Armour and Resistance are two multipliers on the damage, so neither runs "before" the other, and a
    Resistance's multiplier does not read the damage at all where the Armour one does — which is the whole
    of "the same share off every Hit, large or small". Only then does reducePoolsByDamage() hand what is
    left to the pools, in the order its loop spends them: Energy Shield, then Mana under Mind Over Matter,
    then Life.
  the Armour curve the game will not give. armourReductionF():
      return (armour / (armour + raw * data.misc.ArmourRatio) * 100)
    with src/Modules/Data.lua's ArmourRatio = 10: the reduction is Armour over Armour plus ten times the
    Hit. That is the whole of "more effective at reducing smaller hits", which is as far as the game's
    entry goes.
  the caps, from the game's own character metadata as src/Data/Misc.lua carries it in data.characterConstants
  (-- From Metadata/Characters/Character.ot): ["maximum_physical_damage_reduction_%"] = 90 and
  ["base_maximum_all_resistances_%"] = 75, with src/Modules/Data.lua's MaxResistCap = 90.
  Evasion: monsterHitChance() is what the player is checked against, and it is held at 5% at the bottom
  (m_max(m_min(round(rawChance), 100), 5)); the same number from the other end is data.misc.EvadeChanceCap,
  src/Data/Misc.lua's ["DefaultMaxEvadeChancePercent"] = 95. So a Hit's chance to land never falls to nothing.
The three cards that are nothing but the game's own entries (resistances, where a modifier lands, damage over
time) name the game and no one else. Nothing was taken from the wiki for any of them: its host turns the
fetch away.

What was read for Attack Speed, in the same repo, and what settles it:
  CalcOffence.lua, the rate a Skill is used at, in one line:
      output.Speed = 1 / (baseTime / round((1 + inc/100) * more, 2) + skillModList:Sum("BASE", cfg,
                          "TotalAttackTime") + skillModList:Sum("BASE", cfg, "TotalCastTime"))
    with baseTime = 1 / source.AttackRate + skillModList:Sum("BASE", cfg, "Speed") for an Attack. The
    increased sum and the more multipliers divide the time; the Skill's own added use time is added after
    them and is never divided, which is the game's Added Skill Use Time entry in the code. Common.lua's
    round(x, 2) is floor(x * 100 + 0.5) / 100, so the combined multiplier is held to two decimal places.
  Item.lua, the Attacks per Second the Weapon itself shows:
      weaponData.AttackRate = round(self.base.weapon.AttackRateBase * (1 + weaponData.AttackSpeedInc / 100), 2)
    a Weapon's own increased Attack Speed lands there, before any of the above, and is rounded the same way.
    The site's own data shows it: a Shortbow is 1.25 Attacks per Second, and Quill Rain, a Shortbow with 100%
    increased Attack Speed, is 2.5.
  CalcOffence.lua, where the rate stops:
      output.Speed = m_min(output.Speed, data.misc.ServerTickRate * output.Repeats)
    for a Skill that is not Channelled, with Modules/Data.lua's ServerTickRate = 1 / 0.033: about 30 a
    second. A Cooldown holds it lower — m_min(output.Speed, 1 / output.Cooldown * output.Repeats).
  CalcOffence.lua on the Crossbow reload:
      local reloadTimeMulti = calcLib.mod(boltSkill.skillModList, boltSkill.skillCfg, "ReloadSpeed", "Speed")
    "Speed" is the stat an increased Attack Speed modifier writes, so the reload reads it too.
  ModParser.lua, which is that stat both times: ["attack speed"] = { "Speed", flags = ModFlag.Attack } and
    ["skill speed"] = { "Speed", "WarcrySpeed", "TotemPlacementSpeed" } — one sum, which is the game's own
    "stack additively" in the code.
  CalcPerform.lua's actionSpeedMod(): a Slow is its own multiplier on the finished rate, outside that sum.
The game says the rest itself and the card credits it there: Attacks and Spells for what an Attack's speed
comes off and what a Spell's does not, Base Skill Attack Time, Added Skill Use Time, Skill Speed and Slow.

The words a card is reached by sit in "f", which tools/nodelinks.py already reads as the other spellings of a
keyword, and the rule for when one counts sits beside them in "fg" — the card's gate, which assets/marks.js
applies as it draws. A single word that is also a plain English word is only a door where the line uses it as
a number: "40% less Attack Damage" ("pct"), "Adds 8 to 18 Cold Damage" ("start"), never prose ("no more than
once every 3 seconds"). A phrase that only ever means the mechanic ("Damage taken", "Converted to", "damage
over time") is a door wherever it is read ("any"). See gate(). The damage flowchart card has no such words:
a card whose text is about damage offers it instead, which assets/app.js does at the card itself.

Usage:  python tools/mechanics.py    put these cards in data/index.json, relink it, write the two parts
tools/sync.py calls build() while it builds the index, so a full sync needs no extra step.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KIND = 'h'          # a mechanics card: ours, never the game's
SUB = 'Mechanics'
# Named on every one of these cards, where the player reads it.
SOURCE = "According to Path of Building's own damage maths."
# A card assembled out of the game's own entries and nothing else.
GAME = "According to the game's own entries."
# The defences flowchart: the game for each step, Path of Building for the order, the curve and the caps.
DEF_SOURCE = ("Each step and what it does: as the game states it. The order they run in, how Armour and "
              "Resistances each cut the damage, and the caps: according to Path of Building's own damage "
              "maths.")
# The flowchart card names the game for every step it takes from the game — and the game's own Damage
# Conversion and "Damage Gained as extra X" entries settle most of that block — and Path of Building for what
# the game leaves out: the order, the conversion chain, the caps, and what a copy is taken from.
FLOW_SOURCE = ("The steps, which modifiers converted and gained damage scale with, and the two step "
               "process: as the game states them. Where they sit in the order, the conversion chain, the "
               "caps and what a copy is taken from: according to Path of Building's own damage maths.")
# Attack Speed: the game for where the base time comes from and what stacks with what, Path of Building for
# the order it is all applied in, the rounding, the reload and where the rate stops.
SPEED_SOURCE = ("What an Attack's base time is taken from, what Skill Speed stacks with, the fixed part of "
                "a use time and how Slows multiply: as the game states them. The order they are applied "
                "in, the rounding, the reload and where the rate stops: according to Path of Building's "
                "own damage maths.")
DAMAGE = KIND + ':HowDamage'   # assets/app.js offers this card wherever a card's text is about damage

# When a word counts. PCT: "(30-40)% more", "5% reduced". START: the word opens the line, which is the only
# way the game writes an added-damage mod. ANY: a phrase that only ever means the mechanic, so the line does
# not have to prove it ("Damage taken", "Converted to", "damage over time").
PCT = re.compile(r'%\s*$')
GATES = {'pct': lambda line, s: bool(PCT.search(line[:s])), 'start': lambda line, s: s == 0,
         'any': lambda line, s: True}

# The cards themselves. "words" are what a mod line has to say to reach them, "gate" when it counts; "q" the
# extra words a search for this card is likely to use; "fl" the flowchart, drawn by assets/app.js.
CARDS = [
    {'id': 'HowDamage', 'n': 'How damage works', 'words': [], 'gate': 'pct', 'src': FLOW_SOURCE,
     'q': 'damage calculator flowchart order hit crit critical conversion converted convert extra gained '
          'gain as armour resistance evasion block base added increased more less how damage works',
     'ls': ['Damage is worked out in order. Each step works on the result of the step before it.',
            "Any damage that isn't damage over time is Hit damage.",
            'Conversion and extra damage are settled on the base damage, before any increase is applied.'],
     'fl': [
         {'h': 'The hit', 'st': [
             ['Base damage', 'Attacks use your Martial Weapon’s stats unless the skill says otherwise. '
                             'Spells use the damage listed on the skill.'],
             ['Added damage', 'An Adds line goes into the base damage for its own type.'],
             ['Damage Conversion', 'The damage changes type. Worked out on the base, before any increase.'],
             ['Gained as extra damage', 'A copy is added as another damage type. The original is still '
                                        'dealt, and the copy scales with the new type only.'],
             ['Increased and reduced', 'Per damage type: every increased and reduced modifier to it is added '
                                       'into one sum, and the sum is applied once. Conversion has already '
                                       'settled which type the damage is, so this is the new type’s sum.'],
             ['More and less', 'Each more and less modifier is its own multiplier, applied after that sum.'],
             ['Critical Hits', 'Critical Hits deal +100% extra damage by default. Critical Damage Bonuses '
                               'modify that.'],
         ]},
         # the two that get read as the same thing. Side by side on a wide card, stacked on a phone.
         {'h': 'Conversion is not extra damage', 'cols': [
             {'h': 'Damage Conversion', 'ls': [
                 'The damage changes type. The type it came from keeps only the part that was not converted.',
                 'Converted damage scales with modifiers to the new damage type, and no longer with '
                 'modifiers to the old one.',
                 'Conversion is a two step process. Conversion inherent to Skills occurs first, then '
                 'Conversion from all other sources.',
                 'That second step also converts what the Skill already converted, so one portion can change '
                 'type twice: Physical to Cold on the Skill, then Cold to Fire from an item, is Physical '
                 'dealt as Fire.',
                 'Conversion out of one damage type is capped at 100%. More than that is scaled down to fit.',
                 'Damage over time cannot be converted.',
             ]},
             {'h': 'Gained as extra damage', 'ls': [
                 'The damage does not change type. A copy of it is added as the new type, and the original '
                 'is dealt as well.',
                 'Damage gained as a damage type only scales with modifiers to the new type, not with '
                 'modifiers to the source damage’s type.',
                 'Damage Gain occurs in the same two step process as Damage Conversion.',
                 'The copy is taken from the base the source type is left with after conversion, including '
                 'damage converted into that type.',
                 'Gain is not capped at 100% the way conversion is.',
                 'Damage over time cannot benefit from damage Gain.',
             ]},
         ]},
         {'h': 'What reduces it', 'st': [
             ['Evasion', 'Accuracy is checked against the target’s Evasion. An Evaded Hit does not Hit '
                         'at all.'],
             ['Block', 'Blocking completely prevents the damage of an incoming Hit.'],
             ['Armour', 'Armour reduces damage taken from Hits. By default it applies only to Physical '
                        'damage, and it is more effective against smaller hits.'],
             ['Resistances', 'Resistances reduce damage taken of the matching damage type — Fire, Cold, '
                             'Lightning or Chaos — up to a Maximum.'],
         ]},
     ]},
    {'id': 'IncreasedReduced', 'n': 'Increased and reduced', 'words': ['increased', 'reduced'], 'gate': 'pct',
     'ls': ['Increased and reduced modifiers to the same stat are added into one sum. The sum is applied once.',
            'A reduced modifier counts against that sum, as a negative increase.',
            'For example, Honed Instincts, Deep Trance and Chakra of Rhythm grant 8%, 8% and 6% increased '
            'Attack Speed, and Crushing Verdict grants 5% reduced Attack Speed. The sum is 17% increased, so '
            'Attack Speed is multiplied by 1.17.',
            'Each further increase is a smaller part of the total. At 300% increased the stat is multiplied '
            'by 4.00, and a further 20% increased makes it 4.20.']},
    {'id': 'MoreLess', 'n': 'More and less', 'words': ['more', 'less'], 'gate': 'pct',
     'ls': ['More and less modifiers are not added into the increased sum. Each one is its own multiplier, '
            'applied to everything else.',
            'For example, Quill Rain has 40% less Attack Damage, a multiplier of 0.60. With 50% increased '
            'Attack Damage as well the result is 1.50 × 0.60 = 0.90.',
            'A reduced modifier would join the sum instead: 50% increased and 40% reduced sum to 10% '
            'increased, a multiplier of 1.10.',
            'More and less modifiers multiply each other. 20% more and 50% more is 1.20 × 1.50 = 1.80.']},
    {'id': 'AddedDamage', 'n': 'Added damage', 'words': ['Adds'], 'gate': 'start',
     'ls': ['An Adds line goes into the base damage. The increased sum and the more multipliers then work on '
            'that larger base.',
            "For example, Winter's Bite adds 8 to 18 Cold Damage, an average of 13. At 100% increased Cold "
            'Damage that damage is 26. At 300% increased it is 52.',
            'Added damage is scaled by every increased and more modifier to its damage type.']},
    # the mirror of the damage card. The Armour numbers: The Brass Dome's own Armour (data/index.json)
    # against what one monster of that level deals (data/gamestats.json, the official export).
    {'id': 'HowDefences', 'n': 'How defences work', 'words': ['Damage taken', 'Damage Reduction'],
     'gate': 'any', 'src': DEF_SOURCE,
     'q': 'defence defences defense flowchart order hit taken evade evasion block armour armor resistance '
          'resistances energy shield mind over matter mana life damage reduction mitigation tanky survive '
          'how defences work',
     'ls': ['Damage you take is worked out in order. Each step works on what the step before it left.',
            'Evasion and Block decide whether any damage arrives. Armour and Resistances cut down what does. '
            'Energy Shield, Mana and Life take what is left.',
            'For example, The Brass Dome has Armour: (2676-3091). At 3,091 Armour a Hit of 334 Physical '
            'damage, what one level 80 monster deals, is reduced by 48%. The same Armour reduces a Hit of '
            '584, one level 100 monster’s, by 35%.'],
     'fl': [
         {'h': 'Does any damage arrive', 'st': [
             ['Evasion', 'Evasion Rating grants a chance to Evade enemy Hits, preventing them from Hitting '
                         'you at all. The chance also depends on the attacker’s Accuracy, and a Hit’s chance '
                         'to land never falls below 5%.'],
             ['Block', 'Blocking completely prevents the damage of an incoming Hit. You still take the Stun '
                       'from it, and you cannot Block while Stunned or Frozen.'],
         ]},
         # the two that get read as the same thing. Side by side on a wide card, stacked on a phone.
         {'h': 'Armour is not a Resistance', 'cols': [
             {'h': 'Armour', 'ls': [
                 'Armour reduces damage taken from Hits. By default it applies only to Physical damage.',
                 'Damage reduction from Armour is proportional to the amount of damage, and is more '
                 'effective at reducing smaller hits.',
                 'The reduction is your Armour divided by your Armour plus ten times the Hit.',
                 'Damage reduction is capped at 90%.',
                 'Armour Break lowers your Armour. Brought to 0 it is Fully Broken for 4 seconds.',
             ]},
             {'h': 'Resistances', 'ls': [
                 'Resistances reduce damage taken of the matching damage type — Fire, Cold, Lightning or '
                 'Chaos — up to a Maximum.',
                 'A Resistance takes the same share off every Hit, large or small.',
                 'The default Maximum is 75%. It cannot be raised above 90%.',
                 'Physical damage has no Resistance. Armour is what reduces it.',
                 'Fire, Cold and Lightning Resistances are Elemental Resistances. Chaos Resistance is not.',
             ]},
         ]},
         {'h': 'What takes what is left', 'st': [
             ['Energy Shield', 'Energy Shield protects your Life by taking damage instead. Chaos damage '
                               'removes twice as much. Damage from Bleeding and Poison bypasses it to '
                               'remove Life directly.'],
             ['Mind Over Matter', 'Mind Over Matter takes all damage from Mana before Life. It takes what '
                                  'Energy Shield did not.'],
             ['Life', 'What is left comes off Life.'],
         ]},
     ]},
    {'id': 'ResistanceMax', 'n': 'Resistances and the maximum',
     'words': ['to Fire', 'to Cold', 'to Lightning', 'to Chaos', 'to all', 'to Maximum Fire',
               'to Maximum Cold', 'to Maximum Lightning', 'to Maximum Chaos', 'to Maximum Resistances'],
     'gate': 'pct', 'src': GAME,
     'q': 'resistance resistances maximum max cap capped uncapped 75 90 penetration penetrate ignore '
          'ignoring elemental fire cold lightning chaos how much resistance is enough overcap',
     'ls': ['Resistances reduce damage taken of the matching damage type — Fire, Cold, Lightning or Chaos — '
            'up to a Maximum.',
            'The default Maximum for Elemental or Chaos Resistance is 75%. Maximum Resistances cannot be '
            'raised above 90%.',
            'Resistance above your Maximum reduces nothing further. What it would be without the Maximum is '
            'your Uncapped Resistance, shown in parentheses at the top of the Character Panel.',
            'Your Elemental Resistances are lowered as you progress through the game.',
            'Penetration treats the target’s Resistance as lower than it is when working out damage taken '
            'from your Hits, down to 0% by default. It applies to the target’s defensive stats rather than '
            'your own offensive stats, and only to Hits, so it does nothing for Ailments.',
            'Ignoring Resistances means your damage cannot be modified in any way by the target’s '
            'Resistance stats.',
            'For example, Rise of the Phoenix grants +5% to Maximum Fire Resistance. At 80% you take 20% of '
            'a Fire Hit where 75% leaves 25%: a fifth less.']},
    {'id': 'ModifierLands', 'n': 'Where a modifier lands in a stat',
     'words': ['Converted to', 'as extra', 'as Extra'], 'gate': 'any', 'src': GAME,
     'q': 'added to total stat totals adding conversion converted convert gained gain as extra additional '
          'maximum which increases apply modifier stat base value scales with',
     'ls': ['The Total value of a stat is the value after all calculations. Modifiers to the Total apply '
            'after all other modifiers.',
            'Adding to the Total value of a stat occurs after all other calculations, so the added value '
            'does not benefit from percentage modifiers to the stat.',
            'Converting stat A to stat B applies the base value of stat A to stat B instead. The converted '
            'stat scales with percentage modifiers to stat B, not with percentage modifiers to stat A.',
            'Gaining a percentage of stat A as stat B is calculated from the base value of stat A. The '
            'portion gained scales with percentage modifiers to stat B, not with percentage modifiers to '
            'stat A.',
            'Where a modifier has a maximum, the maximum is applied to the whole modifier, including the '
            'constant part.',
            'For example, Decree of Acuity has Evasion Rating: (408-554) and grants Gain (15-30)% of '
            'Evasion Rating as extra Armour. At 554 and 30% that is 166 Armour, and the 166 scales with '
            'increased Armour, not with increased Evasion Rating.',
            'Ghostwrithe has 35% of Maximum Life Converted to Energy Shield. That portion scales with '
            'increased Energy Shield, and no longer with increased maximum Life.']},
    {'id': 'DamageOverTime', 'n': 'Damage over time',
     'words': ['damage over time', 'Damage over Time', 'Damage over time'], 'gate': 'any', 'src': GAME,
     'q': 'damage over time dot degen ignite ignited burning bleeding poison ailment ailments magnitude hit '
          'modifiers penetration conversion converted gain killing blow why do my modifiers do nothing',
     'ls': ['Any damage that isn’t damage over time is Hit damage.',
            'Damage over time cannot be converted, and cannot benefit from damage Gain.',
            'A Damaging Ailment which results from a Hit calculates its damage from that Hit, and does not '
            'subsequently have Damage modifiers applied directly to it. Raising Hit damage raises the '
            'Ailment with it.',
            'Modifiers that apply to Hit damage, such as Penetration, do not affect Ailment damage. '
            'Modifiers that affect how much damage the enemy takes, such as Shock, do.',
            'Damage over time cannot cause Killing Blows.',
            'For example, The Sentry adds (25-32) to (40-50) Fire Damage. At its best roll that is an '
            'average of 41 Fire damage on the Hit, and an Ignite from it deals 20% of that per second for 4 '
            'seconds: 8.2 a second, 32.8 in all.']},
    # Five small passives answer to this name, so the phrase used to stay plain. The card is where it goes.
    # The example is the site's own data, on the unique the more and less card already uses.
    {'id': 'AttackSpeed', 'n': 'Attack Speed', 'words': ['Attack Speed'], 'gate': 'any', 'src': SPEED_SOURCE,
     'q': 'attack speed aps attacks per second attack time faster attacks weapon base skill attack time '
          'added skill use time skill speed cast speed warcry speed slow onslaught crossbow reload cap '
          'breakpoint rounding how fast can i attack',
     'ls': ["The base damage, attack speed and Critical Hit chance of an Attack are determined using your "
            "Martial Weapon's stats unless the skill says otherwise. Spells do not benefit from a Weapon's "
            'attack speed.',
            'Base Skill Attack Time accounts only for the Attacks per Second value of the relevant Weapon '
            'and the percentage of Base Attack Speed listed on the Attack gem.',
            'Increases and reductions to Attack Speed are added into one sum, and the sum is applied once. '
            'Each more or less modifier is its own multiplier. Both work on the time an Attack takes, and '
            'neither changes the damage of the Hit.',
            'Increases and reductions to Skill Speed stack additively with increases and reductions to '
            'Attack Speed, Cast Speed, Warcry Speed, and similar stats.',
            'An Added Skill Use Time is fixed and is not modified by skill use speed stats. It is added '
            'after the increases, so nothing shortens it.',
            'A Slow is a modifier from a Debuff that causes actions to take longer. It is its own '
            'multiplier on the finished rate, and Slows are always multiplicative with each other.',
            "Modifiers to Attack Speed also apply to a Crossbow's reload.",
            "A Weapon's Attacks per Second and a Skill's combined multiplier are each held to two decimal "
            'places, so an increase small enough changes neither.',
            'A Skill that is not Channelled is used at most about 30 times a second. A Skill with a '
            'Cooldown is held to its Cooldown.',
            'For example, a Shortbow has Attacks per Second: 1.25. Quill Rain is a Shortbow with 100% '
            'increased Attack Speed, and its Attacks per Second is 2.5 — an Attack every 0.40 seconds. A '
            'further 20% increased Attack Speed on the character makes it 3.00, an Attack every 0.33 '
            'seconds.']},
]


def build():
    """The mechanics cards, as the index holds them."""
    out = []
    for c in CARDS:
        it = {'k': KIND, 'id': c['id'], 'n': c['n'], 's': SUB, 'ls': list(c['ls']),
              'q': c.get('q') or ' '.join(c['words']).lower(), 'src': c.get('src') or SOURCE}
        if c['words']:   # the damage flowchart card has none: a card about damage offers it instead
            it['f'] = list(c['words'])
            it['fg'] = c['gate']   # when one of them counts, for assets/marks.js to apply as it draws
        if c.get('fl'):
            it['fl'] = []
            for g in c['fl']:
                one = {'h': g['h']}
                if g.get('st'):
                    one['st'] = [list(s) for s in g['st']]
                if g.get('cols'):
                    one['cols'] = [{'h': col['h'], 'ls': list(col['ls'])} for col in g['cols']]
                it['fl'].append(one)
        out.append(it)
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
    print('cards: %d -> %d (%d mechanics cards)' % (was, len(index['items']), len(CARDS)))
    rep = nodelinks.attach(index)
    f.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    nodelinks.report(index, rep)
    import appdata   # the two parts the home page loads
    appdata.write(index)
    return 0


if __name__ == '__main__':
    sys.exit(main())
