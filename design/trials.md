# The Trials of Ascendancy: a kind of their own (#82)

A player at the Trial of Chaos altar or a Sekhemas door has a name and a line to choose by: "Reduced
Resistances III", "Ghastly Scythe". Nothing in the game says what the Trialmaster pays for taking it, or
whether it shuts off the build. The game files hold both. The data for a card per thing a player meets is in
`data/trials.json` (`tools/trials.py`). This page proposes how the frame takes it. Nothing in `assets/`
changes here: the front end is being reworked for 1.0, and this is the declaration to carry into it.

## What the data holds

210 entries, one per thing a player meets, `s` saying which:

| `s` | Entries | From |
|---|---|---|
| Trial of Chaos modifier | 33, over 111 tiers | UltimatumModifiers (`data/game/ultimatum_modifiers.json`, `ultimatum_types.json`) |
| Trial of Chaos wager | 9, over 11 rows | the same table |
| Trial of Chaos room | 7 | UltimatumEncounterTypes (`data/game/ultimatum_trials.json`) |
| Minor affliction, Major affliction | 36, 13 | SanctumPersistentEffects (`data/game/sanctum.json`, `sanctum_more.json`) |
| Minor boon, Major boon | 25, 13 | the same table |
| Pledge | 4 | the same table, with the cost each one comes with |
| Trial of the Sekhemas room | 21 | SanctumRoomTypes, with how many rooms of each the floors carry |
| Trial of the Sekhemas floor | 4 | SanctumFloors |
| Relic modifier | 41, over 137 tiers | the game's mod table read by RePoE (`mods.min.json`, domain sanctum_relic), with the relic bases that roll each |
| Ascension | 4 | the quest states, floor levels and trial lengths (below) |

Every row of the game's trial tables is in one entry: 122 of 122 Trial of Chaos rows, 109 of 110 Sekhemas
effects (the one left out is Wooden Effigy, whose whole text in the files is "UNUSED").

| Field | What it is | From | On |
|---|---|---|---|
| `n` | the name the game shows | the game files | all |
| `id` | the name; a second entry of the same name gets a number ("Death Toll 2": the countdown, beside the Death Toll that stops Sacred Water) | ours | all, never drawn |
| `s` | the sub line: which of the kinds above | ours | all |
| `ls` | the game's own lines | the game files | all but Trial of Chaos modifiers and Ascension |
| `tiers` | per tier: its name, `step` (I, II, III...), the game's `tier`, its lines, and `rarity`: the reward bonus it adds | the game files | Trial of Chaos modifiers, relic modifiers (there: the affix name and its level) |
| `t` | plain words for what it does | ours | Sekhemas effects whose line leans on a word a player may not know yet (43), rooms and floors take the game's words |
| `risk`, `reward` | the two sides of a choice, in plain words | ours, from the game's lines | Trial of Chaos modifiers and wagers, pledges |
| `on` | On you, On monsters, In the room | the game's own sort of each modifier (its `types`) and its line | Trial of Chaos modifiers |
| `steps`, `alt` | how many steps one name has, and the lines the other steps differ by | the game files | Ghastly Scythe, Death Toll, Assassin's Blade; the wagers with two versions |
| `tags` | what it does to you, in #77's words | read off the game's lines | 87 entries |
| `mark`, `why` | `danger` or `safe`, and which rule gave it | the rule below | 25 |
| `later` | why the entry carries Subject to change | ours | 4 |
| `gen`, `size`, `relics` | Prefix, Suffix or Corrupted; Small, Medium, Large or Any; the relics of that size | RePoE's mods and base items | relic modifiers |
| `rooms`, `names`, `level`, `key` | how many rooms of a kind, what each floor calls it, a floor's lowest level and the Barya it takes | the game files | rooms, floors |
| `points`, `total`, `ways` | two points a set, eight in all, and each trial that gives the set with its area level and source | below | Ascension |
| `q` | search words: the tags, `honour` on every entry that touches Honour (35), `dangerous`, `safe` | ours | 114 |
| `src` | "Source: the game files", "Source: the game files, read by RePoE", and on an Ascension way the files do not tie to its set, "Source: the game files for the level; poe2db for which set it gives" | — | all |

### The reward bonus

Every Trial of Chaos modifier carries a stat the game never words on the altar: `map_item_drop_rarity_+%_final_from_map`,
more Rarity of Items found in the trial. It is on each tier as `rarity`:

| | I | II | III | IV | V |
|---|---|---|---|---|---|
| Five-tier modifiers (Reduced Recovery, Damaged Defences...) | 4% | 9% | 15% | 22% | 30% |
| Three-tier modifiers that start harder (Time Paradox, Monster Speed, Unstoppable Monsters, Lethal Rare Monsters...) | 9% | 15% | 22% | | |
| Escalating Damage Taken, Enraged Bosses | 15% | 22% | 30% | | |
| Impending Doom, Blood Globules, Pyramid Beams | 12% | 20% | | | |
| Occasional Impotence, Random Projectiles, Entangling Monsters | 15% | | | | |
| Temple Traps | 15% | 22% | | | |
| Blood Mist | 10% | | | | |

The wagers carry none; what they pay is their own lines. Lethal Rare Monsters also carries its rare-monster
count and extra modifier in the same stats, and its own line says them already.

## The tags

The words #77 tags waystone modifiers with, and `data/monstermods.json` (#112) tags rare monster modifiers with,
so one filter reads all three. Read off the game's own lines only; nothing here is read off a name, so no tag is
marked Estimate. New words are the ones only a trial does to you.

| Tag | Chaos | Sekhemas | New here |
|---|---|---|---|
| less recovery | 1 | 0 | |
| fewer flask charges | 1 | 0 | |
| less resistance | 1 | 0 | (#77's word) |
| less defences | 1 | 4 | yes |
| less damage | 1 | 1 | yes |
| area and projectiles | 2 | 0 | yes |
| shorter buffs | 1 | 0 | yes |
| costs Honour | 0 | 8 | yes |
| curse | 0 | 1 | |
| slows you, stuns you | 2, 2 | 2, 1 | |
| knocks you back | 0 | 1 | yes |
| more damage taken | 2 | 8 | yes |
| extra element, ailment on hit, more crits, faster | 2, 4, 1, 1 | 0, 0, 0, 2 | |
| room hazard | 13 | 3 | yes |
| damage bursts, on death, cannot be damaged | 4, 2, 3 | 0 | |
| resists fire / cold / lightning | 1 / 1 / 1 | 0 | |
| harder to kill, stronger pack | 3, 2 | 1, 0 | |
| boss only | 1 | 0 | (#77's word) |
| costs Sacred Water, worse merchant, hides the map | 0 | 8, 4, 7 | yes |
| fewer boons, more afflictions, weaker relics | 0 | 2, 2, 2 | yes |

Boons and relic modifiers carry no tags: they are what a player takes to be stronger, and the tags say what a
thing does to you.

## The mark

"Dangerous for most builds" and "Safe to take" are given **only where the modifier's own words decide it**. No
build, league or opinion is weighed. Everything else is unmarked, because whether it hurts depends on the build:
"You have no Evasion" ends an evasion build and does nothing to an armour one, so it is not marked.

**Dangerous for most builds**: its line takes away something every build stands on. Six rules, and `why` on
the entry names the one that gave it:

1. Half or more of all your Armour, Evasion **and** Energy Shield gone (Damaged Defences from III, Corrosive
   Concoction).
2. Your maximum resistances lowered: nothing inside the trial can make that up (Reduced Resistances from III).
3. Life, Mana and Energy Shield recovery halved or worse (Reduced Recovery from III).
4. Your damage cut by 40% or more, or stopped (Blunt Sword, Occasional Impotence).
5. Losing any Honour ends the trial (Ghastly Scythe); Honour you lose does not come back (Branded Balbalakh,
   Haemorrhage).
6. Every hit takes control away (Chiselled Stone: monsters petrify on hit).

On a tiered Trial of Chaos modifier the mark is on the modifier and `why` says from which tier ("From Reduced
Resistances III: ..."); the tiers under it keep their own lines, so a player sees I and II are not.

**Safe to take**: every line of it changes only Sacred Water, the Merchant or what the Trial Map shows, and
nothing in it reaches a fight, your Honour or your life. 15 afflictions: Low Rivers, Gate Toll, Leaking
Waterskin, Death Toll (no Sacred Water from monsters), Exhausted Wells, Black Smoke, Trade Tariff, Winter Drought,
Veiled Sight, Red, Golden and Purple Smoke, Unquenched Thirst, Season of Famine, Tradition's Demand. No Trial of
Chaos modifier meets it: every one of them changes a fight.

Totals: 4 Trial of Chaos modifiers and 6 afflictions dangerous, 15 afflictions safe.

## Risk against reward

A choice has two sides, and the card shows them as two statements, never one sentence: the Trial of Chaos
modifier's plain words and the rarity it pays ("4% to 30% more Rarity of Items found in the trial, by tier"); a
wager's cost and pay ("Every reward waiting for you is destroyed" / "100% more item rarity"); a pledge's cost and
gain in the game's own two lines.

A pledge words its cost apart from its gain. Pledge to the Guileful's cost has an open number in the files ("Take
{0} Physical Damage on opening a Key Chest...") and poe2db prints it open too; the files keep the stat
(100), and `tools/trials.py` fills the line from it (`COST_FROM_STAT`).

## Ascension

| Set | Trial of the Sekhemas | The Trial of Chaos |
|---|---|---|
| First (choose your Ascendancy, 2 points) | Test of Strength, Rattlecage, area level 22, Act 2 (quest Ascent to Power) · the game files | — |
| Second (4 in all) | a Barya with two trials, the Test of Will (floor from level 45) · Subject to change, Source: poe2db | Chimeral Inscribed Ultimatum, 4 trials, area level 38, Act 3 (quest The Trials of Chaos) · the game files |
| Third (6) | three trials, the Test of Cunning (from 60) · Subject to change, Source: poe2db | 7 trials, from area level 60 · Subject to change, Source: poe2db |
| Fourth (8) | four trials, the Test of Time (from 75) · Subject to change, Source: poe2db | 10 trials, from area level 75, then the Trialmaster behind the door, opened with three Fates · the game files |

What the game files say outright: the Ascent to Power quest ends "you have completed the Trial of the Sekhemas
and have chosen an Ascendancy"; The Trials of Chaos quest ends "you have earned 2 Ascendancy Points" on the
flag for the second set; each of the four sets is 2 points; the door at the end of the Trial of Chaos is "the
secret challenge ... [that] will grant additional Ascendancy Skill Points"; an Inscribed Ultimatum holds 4 trials
from level 1, 7 from 60, 10 from 75; the floors open from 1, 45, 60 and 75. Which set a Barya of two, three or
four trials, or a 7-trial Ultimatum, gives is not in the files. Those say Subject to change and name poe2db,
whose Ascendancy page says so in wording written for an earlier patch (its levels there are 38, 60 and 80).
This is the part #90's ascendancy cards take ("how many points and which trials give them").

## The kind: move (b)4

It is a new sort of thing with its own name and its own rows. Does anything in the index answer to these names
already? No: no card is named for a trial modifier, an affliction, a boon or a relic modifier today. The unique
relics are cards already (priced by poe.ninja), and their lines are not repeated here. So one `KINDS` entry,
and no card code:

```js
/* A Trial of Ascendancy modifier: what a player chooses or is given in the Trial of Chaos and the Trial of the
   Sekhemas, what it does, what it does to you and what it pays (tools/trials.py, design/trials.md). */
{k: 'r', one: 'Trial modifier', tone: 'c-trial', many: 'Trial modifiers', place: 'Trials', index: true, search: true,
 crawl: true, mark: 'ls',
 fields: [...HEAD, 'trialmark', 'on', 'steps', 'rooms', 'floorlv', 'relicgen', 'later', ...SAYS, 'tiers', 'riskreward', 'why',
          'others', 'relics', ...REST, ...FOOT],
 acts: ['pin'],
 rel: ['cat', 'danger']},
```

The Ascension rows are not modifiers and do not join the kind: they are the field #90's ascendancy card
draws ("Ascendancy points"), four rows of `ways` under a label, the same `tiers` shape below.

### Fields, worked down the (b) list

| Field | Slot | Move | Why |
|---|---|---|---|
| `lines` (`ls`), `text` (`t`) | body | none: `SAYS` already | the game's lines, and the plain words |
| `tags`, `source` (`src`) | body | none: `REST` already | as every card draws them |
| `trialmark` | pill | (b)1: `{type: 'enum', at: 'mark', slot: 'pill', of: {danger: 'Dangerous for most builds', safe: 'Safe to take'}}` | a word off a table |
| `why` | body | (b)1: `{type: 'rich', at: 'why', slot: 'body', label: 'Why'}` | one line under the mark's own label |
| `on` | pill | (b)1: `{type: 'enum', at: 'on', slot: 'pill', of: {'On you': 'On you', 'On monsters': 'On monsters', 'In the room': 'In the room'}}` | |
| `steps` | pill | (b)1: the #112 declaration, `{type: 'number', at: 'steps', slot: 'pill', post: ' step', many: ' steps', from: 2}` | shared with rare monster modifiers |
| `rooms` | pill | (b)1: `{type: 'number', at: 'rooms', slot: 'pill', post: ' room', many: ' rooms'}` | |
| `floorlv` | pill | (b)1: `{type: 'number', at: 'level', slot: 'pill', pre: 'From level ', from: 2}` | the floor's lowest level; level 1 is not drawn |
| `relicgen` | pill | (b)1: `{type: 'enum', at: 'gen', slot: 'pill', of: {Prefix: 'Prefix', Suffix: 'Suffix', Corrupted: 'Corrupted'}}` | |
| `others` | body | (b)1: #112's `{type: 'rich', at: 'alt', slot: 'body', label: 'Another step'}` | shared with rare monster modifiers |
| `relics` | body | (b)1: `{type: 'rich', at: 'relics', slot: 'body', label: 'Rolls on'}` | a list of names |
| `tiers` | body | **(b)2, a new field type** `tiers`: `{type: 'tiers', at: 'tiers', slot: 'body', label: 'Tiers'}` | a list of rows, each a name, its lines and a number beside them; `rich` draws lines and nothing beside. The list keeps the frame's rule: 4 rows in the grid, the rest counted, all of them in the popup |
| `riskreward` | body | **(b)2, a new field type** `pair`: `{type: 'pair', at: ['risk', 'reward'], slot: 'body', label: ['Risk', 'Reward']}` | two statements in two boxes (docs/frame.md, "A number that moves, beside one that does not": two statements, never one sentence). The Trial of Chaos risk is its plain words |
| `later` | pill | **(b)2, a new field type** `label`: `{type: 'label', at: 'later', slot: 'pill', is: 'Subject to change', tip: 'Depends on GGG. May change without notice.'}` | the pill reads the label; the reason in `later` is the popup's line. The same type draws **Estimate** for any field that carries one (`is: 'Estimate'`), so the site says both labels one way |

Three new field types (`tiers`, `pair`, `label`), each a `TYPE` function that names no kind. The rest is
declarations on shapes that already draw.

### The labels

* **Subject to change** (tooltip "Depends on GGG. May change without notice."): on the three Ascension sets whose
  trial the files do not tie to the set, and on Unstoppable Monsters, whose line says 50% and 75% at II and III
  while the stats behind both tiers say 30% (`stats` on those tiers). The line may be the one out of date.
* **Estimate**: nothing here is one. Every number is the game's.
* **Source: X** from `src`, as every card with a source already draws it.

### Connections

* `cat`: already declared ("Listed with", the cards that carry the same sub line, inside the kind): every Minor
  affliction together, every Trial of Chaos wager together. Nothing to add.
* `danger`, **one relationship shared with #112** ((b)3, declared there): `MAPS.danger = {at: 'tags'}`,
  `REL.danger = {label: 'Does the same to you', edge: 'danger', map: 'danger'}`. #112 proposes it with `of: 'm'`;
  here it drops the `of`, so one group answers across rare monster modifiers and trial modifiers alike ("Deadly
  Monsters" lists "Extra Crits"). That is the point of the tags being one list.

### Search

A search row by its name, so "Scythe" finds Ghastly Scythe. The tags, `honour`, `dangerous` and `safe` go in `q`,
so "honour" finds all 35 entries that touch Honour (afflictions, boons, pledges, the Honour shrines and relic
modifiers), and "dangerous" every marked one. Done when (#82): a search for an affliction gives its card with
what it does and how bad it is.

## The check: poe2db

`python tools/trials.py --check` fetches poe2db's two trial pages (https://poe2db.tw/us/The_Trial_of_Chaos,
https://poe2db.tw/us/Trial_of_the_Sekhemas) and looks for every Trial of Chaos tier and wager, and every
Sekhemas affliction, boon and pledge, by name and by every line. Run 28 September 2026:

* 204 match by name and every line.
* 6 more match with poe2db leaving a number open where the files hold it ("Take {0} Physical Damage on Room
  Completion"; the files: 30).
* 1 does not: Orbala's Leathers, the affliction (the price the boon of the same name leaves: "50% less Maximum
  Honour"). poe2db lists the name with no line.

## Where it lands

`tools/trials.py` writes `data/trials.json` today and nothing reads it. It is the patch stage `trials` of
`tools/pipeline.py`, right after `datpull`, and reads `data/game/` (`tools/datpull.mjs`) and RePoE's mods and base
items (`tools/gamepull.py`'s cache). `data/trials.json` lists its own `ids`, and `tools/lastgood.py` `own_ids()`
holds it to them.

**Declarations (`assets/kinds.js`): none in this change.** The kind has no rows in `data/index.json` yet, and
three of its fields need types (`tiers`, `pair`, `label`) that `assets/app.js` has no renderer for, so a
declaration now would declare cards nothing draws. Once the kind is declared (with those renderers), the same rows
join `data/index.json`, `node tools/dev/schema.mjs --write` regenerates `data/schema.json`, and
`tools/dev/guard-baseline.json` gains the kind's count.

This branch adds one block at the end of `tools/datpull.mjs`'s declarations, read from tables #131 already reads
plus UltimatumModifierTypes and SanctumRoomTypes, and leaves #131's own declarations as they are:
`ultimatum_trials` (the rooms, the trial lengths and the area); `ultimatum_types` (each Trial of Chaos modifier's
`types`, the game's own sort, an id, under `ids`, keyed on the modifier's id); and `sanctum_more`, keyed on
`sanctum.json`'s ids: a pledge's `cost` (the files word it apart; `sanctum` keeps the gain only), each floor's area
level and act, and the kinds of room (SanctumRoomTypes). `tools/trials.py` merges them onto the rows they key on.

## Left open

* Which set of Ascendancy points a Barya of two to four trials, and a 7-trial Ultimatum, gives: not in the files
  (above). Subject to change until they are, or GGG says.
* How much Honour each shrine restores: the files hold the line with the number open, and which column fills it
  is not known yet (datpull says so and leaves it out).
* A Sekhemas floor's `level` is the column dat-schema calls MinLevel; that it is the lowest area level the floor
  opens at is read off the name and the floor order, and it matches poe2db's older table only for 60.
* #77's own tags on waystone modifiers, and the build check, are #77.
