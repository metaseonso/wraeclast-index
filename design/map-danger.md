# Map modifier danger: a tag filter on the Atlas tab, and a check against your build (#77)

"There is no universal list of safe mods" is right: a modifier is only dangerous to a build that relies on
what it shuts off. The data for both halves is in `data/mapdanger.json` (`tools/mapdanger.py`): every modifier
a player can meet on a map, what it does to you in tags read off its stats, and the in-game search text that
avoids a set of tags. This page proposes how the Atlas tab shows it and how a pasted build turns it red.
What shows today is one field: `mapdanger` (`assets/kinds.js`, type `danger`, the same renderer the rare monster
modifiers use) on the tablet cards and the unique tablets, found by name, with each tag's `why` line on hover and
the source. The Atlas tab's filter and the build check below are what is left to carry into the page.

## What the data holds

272 modifiers of the game's mod table (RePoE's export of the game files), in 191 rows: one row per modifier
a player reads, its tiers or steps inside it.

| Pool | Rows | What | Filtered by |
|---|---|---|---|
| waystone | 38 | prefixes (15) and suffixes (23) | the area domain, a spawn weight on some waystone tier |
| waystone | 17 | desecrated prefixes (11) and suffixes (6), from a Preserved Vertebrae | the desecrated domain, weighted on waystones |
| waystone | 10 | the Liquid Emotions instilled into a waystone | the instilled modifiers |
| tablet | 86 | prefixes (13) and suffixes (73) | the tablet domain, a spawn weight on some tablet base (`on`: the bases, where not all) |
| tablet | 8 | each tablet base's implicit ("Adds an Otherworldly Breach to a Map") | the base item |
| tablet | 9 | the unique tablets' modifiers | the list `tools/atlas.py` keeps |
| atlas | 23 | what a corrupted (13) or cleansed (10) atlas node puts on its maps | EndgameCorruption / EndgameCleansed rows, with the weight `data/game/atlas_corruption.json` read from the game; 2 at weight 0 are left out |

| Field | What it is | From |
|---|---|---|
| `n`, `s`, `k` | the name a player reads (the affix, the emotion, the unique, the node), what it is ("Waystone suffix"), prefix or suffix | the game files |
| `r` | its steps: `w` the waystone tiers it rolls on, `ls` its lines, `b` the bonus lines it adds ("20% more Waystones found in Area") | the game files; `w` joined from `data/atlas.json` (113 of 113 joined, 0 worked out anew) |
| `tags`, `q` | what it does to you, and the same as search words | its stats, through the table below |
| `why` | per tag, the game's line that carries it ("Players have (36-40)% less Recovery Rate of Life and Energy Shield") | the game files |
| `re`, `also` | the search fragment that lights this row alone; where none can, what else it lights | worked out here |
| `wt`, `sub` | an atlas node's weight; `sub` where the weight is a column dat-schema does not name yet | `data/game/atlas_corruption.json` |
| `mods`, `hid` | the game's ids for it, and a tag's stat the game never words | internal ids, never drawn (`ids`) |
| `avoid` | per pool and tag, the search text that finds waystones or tablets without it | worked out here |

Waystone tiers are the ones the Atlas tab already shows; `data/craft/` has no waystone or tablet class (the
bench does not craft them), so `data/atlas.json` is where WI ships them.

## The tags

One list with `data/monstermods.json` (#112), in one order: the tool stops if `tools/monstermods.py`'s `TAGS` or
the rare monster file carries a tag word its table does not, or if the words the two share stand in another order,
so a filter on "extra element" reads both files and a card lists them the same way. Every tag comes from a stat, through the
table `STATS` in `tools/mapdanger.py`: the tag, a pattern over the stat's id, and why. Three rules keep it
from being an opinion:

* **A reward is not a danger.** The bonus lines a waystone carries (pack size, rarity, waystones found) are
  never tagged; `tools/atlas.py` already names them (`REWARD`).
* **A signed stat counts in the direction that hurts.** "Monsters in your Maps have 30% less Life" is no
  danger, "Players have 36% less Recovery Rate" is. A monster's stat counts when it goes up, a player's when it
  goes down, and a rule that knows better says so (a monster's curse effect is against you when it drops).
* **Where a stat names a curse or a debuff, the tag is what the game's help entry says it does.** Elemental
  Weakness "lowers Elemental Resistances" (less resistance), Temporal Chains and Grasping Vines "slow" (slows
  you), Marked for Death "causes you to take 50% increased damage", Delirious players meet monsters that "deal
  more damage and have additional Toughness".

| Tag | Waystone | Tablet | Atlas node | Rare monster |
|---|---|---|---|---|
| no regen | 0 | 0 | 0 | 0 |
| no leech | 0 | 0 | 0 | 0 |
| less recovery | 2 | 0 | 0 | 3 |
| less flask effect | 0 | 0 | 0 | 0 |
| fewer flask charges | 1 | 0 | 0 | 1 |
| less resistance | 2 | 0 | 0 | 0 |
| penetration | 1 | 0 | 0 | 0 |
| extra element | 4 | 0 | 0 | 4 |
| curse | 3 | 0 | 0 | 0 |
| curses weaker | 1 | 0 | 0 | 0 |
| reflect-like | 0 | 0 | 0 | 5 |
| cannot | 1 | 0 | 0 | 0 |
| more damage taken | 1 | 0 | 0 | 0 |
| slower cooldowns | 1 | 0 | 0 | 0 |
| slows you | 3 | 0 | 0 | 3 |
| breaks armour | 1 | 0 | 0 | 1 |
| ailment on hit | 4 | 0 | 0 | 5 |
| stuns you | 1 | 0 | 0 | 1 |
| ground effect | 7 | 0 | 0 | 15 |
| more damage | 1 | 0 | 1 | 0 |
| more crits | 1 | 0 | 0 | 1 |
| more accuracy | 1 | 0 | 0 | 1 |
| faster | 2 | 0 | 0 | 4 |
| more area | 2 | 0 | 0 | 2 |
| more rare modifiers | 4 | 3 | 0 | 0 |
| boss only | 0 | 11 | 0 | 0 |
| resists crits | 1 | 0 | 0 | 0 |
| resists ailments | 1 | 0 | 0 | 0 |
| resists fire / cold / lightning / chaos | 1 / 1 / 1 / 0 | 0 | 0 | 2 / 2 / 2 / 1 |
| harder to kill | 6 | 3 | 4 | 17 |
| delirious | 10 | 2 | 0 | 0 |

The rare-monster-only words (damage bursts, teleports, on death, cannot be damaged, stronger pack) are in the
table too and meet no map modifier. 56 of 65 waystone rows carry a tag, 18 of 103 tablet rows (a tablet
mostly adds content and reward), 5 of 23 atlas node rows.

**No regen, no leech, less flask effect and reflect-like meet nothing in 0.5.5.** The game's mod table still
holds "Players cannot Regenerate Life, Mana or Energy Shield", "Monsters cannot be Leeched from" and the
reflect modifiers, but on no waystone tier, tablet or node: they are the older game's map modifiers with no
spawn weight. The tags stay, at 0, so the day a patch weights one it is tagged without anyone editing the
table. What a leech build meets in 0.5.5 is **of Smothering**, "Players have (20-40)% less Recovery Rate of
Life and Energy Shield": Leech is recovery in the game's own help ("Leech recovers an amount of Life").

## The search text

**GGG's syntax**, in the game's own help text for the stash search (`StashPanelSearchInfo` in the client
strings): keywords split on spaces, quotation marks keep a phrase whole, and "Regular expressions are
supported". The search is case-insensitive and meets one line of the item at a time (both tools below build on
that: poe2.re anchors fragments with `$` at a line's end). A term that starts with `!` asks for the items that
do **not** match it: not in the help text, and used by both tools below.

**The length limit is not settled.** GGG publishes no number. poe2ref.com/regex counts to **50** and says "GGG
has said it will rise to 250"; poe2.re builds up to **250**; GGG's own Early Access bug forum has a report
titled "Search textbox limited to 50 characters (not 250)" (pathofexile.com/forum/view-thread/3897083). So the
text is measured against both, the file carries `limits` with the label **Subject to change** (tooltip
"Depends on GGG. May change without notice."), and a text over 50 says its length rather than being cut.

**How the two community tools build theirs** (read from their shipped pages, 28 September 2026):

* **poe2.re/waystone** (veiset): a hand-kept list of 32 waystone modifiers, each with a short fragment
  (`"trates"`, `"ss rec"`, `"a cold$"`, `"e \d+% cr"`). "I don't want any of these mods" joins them into one
  quoted term, `"!ss rec|trates|a cold$"`, and the result is capped at 250. Source: poe2.re.
* **poe2ref.com/regex**: for each modifier the shortest run of letters that no other modifier in the pool
  shares, letters only so a rolled number never matters, and it lists what else lights where a line sits
  wholly inside another's. Same `!` term for avoiding. Source: poe2ref.com.

**What `tools/mapdanger.py` does**, the two together: the fragment is letters, spaces and `'` only
(poe2ref's rule), three characters at least, checked against every line an item of the pool can print — its
modifiers, their bonus lines and the item's own property lines. Where poe2.re keeps one fragment per
modifier, avoiding a set of tags is a cover: a fragment that lights only modifiers being avoided may stand for
several of them ("e pe" is in "are periodically Cursed" and in "Damage Penetrates"), so the text is shorter
than one fragment each. The result goes in one `"!…"` term, poe2.re's form.

**Checked against poe2.re.** Each of its 32 waystone fragments, run over this file's waystone lines, lights
the modifier poe2.re names for it and nothing else in 30 cases (with its twin where a prefix and a suffix print
the same line: Flaming and of Flames). The other two are differences, not errors here:

* "Painful", `^\d+% i`, also lights **Liquid Disgust** ("30% increased Tablets found in Area") and **Liquid
  Despair**, and every bonus line such as "30% increased Waystones found": poe2.re's pool has no Liquid
  Emotions. This file's fragment for Painful is `d monster d`.
* "Destructive", `e \d+% cr`, needs "have 11% Critical" where the game's line reads "have +11% Critical Damage
  Bonus"; this file's `d c` meets "increased Critical" on the same modifier.

A waystone fragment here is 3 to 11 characters, against poe2.re's 4 to 15.

**Not covered, by either tool or this one:** a rare waystone's name is two words the game draws from a list
the export does not carry, and a three-letter fragment can land in one. The name is one line; a waystone it
lights by accident is a waystone the search skips, never one it keeps.

### Three worked examples

`python tools/mapdanger.py --avoid "<tags>"` prints each. Each was checked by running the text as a regular
expression over every line of every row of the pool: it lights exactly the rows named, and no property line.

**1. A life leech build.** Tags: less recovery, no leech, no regen.

```
"!f l|ana"
```

10 characters. `f l` is in "Recovery Rate of Life" (of Smothering) and `ana` in "Mana Siphoning Ground" (of
Siphoning, whose ground drains mana: a stat the game never words, so its `why` is empty and the reason shows
its line). No regen and no leech add nothing in 0.5.5.

**2. A build at its resistance cap.** Tags: curse, less resistance, penetration.

```
"!e pe|m p"
```

11 characters. `e pe` covers Penetrating ("Damage Penetrates") and all three curse suffixes ("are periodically
Cursed"), `m p` is of Exposure ("maximum Player Resistances").

**3. A hardcore list.** Tags: extra element, more crits, penetration, less resistance, less recovery, cannot,
more damage taken.

```
"!s d|d c|f l|etr|nin|nds|akn|m p"
```

34 characters, 12 modifiers, inside 50. The same 12 modifiers one fragment each, poe2.re's way, come to 50
characters: `s d` alone stands for all four extra elements and of Cycling.
Over tablets, "boss only" and "delirious" come to 61 characters: past 50, inside 250, so that one is marked
with its length.

## The Atlas tab: a filter by tag

The Atlas tab is a page of its own (`assets/atlas.js`), not a card grid: its rows are `data/atlas.json`'s
waystone and tablet modifiers, its chips the sections, its search a word against each row's text. In frame
terms this is move **(a)** — the rows exist, and they gain data — with one thing the page draws that it does
not yet: a row of tag chips.

* **The data.** `data/mapdanger.json` is fetched the first time the Waystones or Tablets section opens, never
  in first paint, the way a field whose table is a file of its own is. A row joins by name and side (`n`, `k`
  against `a`, `k`), the join `tools/mapdanger.py` already proves for every tier.
* **The tags in the search.** Each row's `q` goes into the words its search reads, so "curse" in the box finds
  the three curse suffixes, as the monster modifier card finds "reflect" (`design/monster-mods.md`).
* **The chips.** One chip per tag the section's rows carry, in the table's order, with its count, the chip
  shape the page already draws for sections. Pressed, a chip keeps the rows carrying that tag; pressing
  **Avoid** turns it round and dims them. Nothing new in `FRAME`: a chip row is the page's own control, and
  its counts are the rows, as the section chips are.
* **The search text.** Under the chips: the text for the tags pressed, its length, and a copy button. The page
  joins the `avoid` text of each tag pressed (one term per tag); the tool's cover across tags is shorter and
  is what the tool prints. "Copied." is the only state after a press. The length carries **Subject to
  change**.
* **On a row.** The tags, each with its `why` line on hover; **Source: the game files**.

Where the rows become cards (the monster modifier kind, `m`, is proposed in `design/monster-mods.md`), the
same `MAPS.danger = {at: 'tags'}` groups map and monster modifiers together under "Does the same to you": the
reason the two files share one list of words.

## Check my build

A pasted Path of Building code, and the modifiers that shut off what the build relies on turn red, each with
the build's fact and the modifier's own line, two statements side by side (the frame's rule for a number
beside a fact):

> **Leech** · 312 Life a second · Source: Path of Building
> of Smothering · Players have (36-40)% less Recovery Rate of Life and Energy Shield

Red means **shuts off or cuts what the build relies on**: the tags no regen, no leech, less recovery, fewer
flask charges, less flask effect, less resistance, penetration, curses weaker, slower cooldowns, resists
crits, resists ailments, breaks armour and cannot. Harder monsters (more damage, faster, harder to kill) are
the same for every build and stay as they are. Nothing is red without a fact from the build beside it, and the
fact is the build's number, never a judgement of it.

### The build facts, and where they come from

The Build tab (#70) already reads a Path of Building code (`assets/build.js`: the XML's `PlayerStat` lines are
Path of Building's own answers, its skills and its items). What the check needs from it:

| Build fact | Read from | Meets |
|---|---|---|
| leeches Life, Mana or Energy Shield | `PlayerStat` LifeLeechGainRate, ManaLeechGainRate, EnergyShieldLeechGainRate (#70) | less recovery, no leech |
| regenerates | LifeRegenRecovery, ManaRegenRecovery, EnergyShieldRegenRecovery (#70) | less recovery, no regen, cannot |
| lives on Energy Shield | EnergyShield against Life (#70) | less recovery |
| resistances at the cap, and by how much over | FireResist, FireResistOverCap and the same for Cold, Lightning, Chaos (#70) | less resistance, penetration, curse (Elemental Weakness) |
| uses flasks and charms | the build's items in flask and charm slots (#70) | fewer flask charges, less flask effect |
| casts curses | its skills, by the gem's Curse tag (#70, and the gem cards) | curses weaker |
| relies on cooldowns | its skills, by the skill's cooldown (the gem cards) | slower cooldowns |
| crits | CritChance (#70) | resists crits |
| damage over time or ailments | WithIgniteDPS, WithBleedDPS, WithPoisonDPS, TotalDot (#70) | resists ailments |
| armour | Armour (#70) | breaks armour |

**#73** is the other half: a waystone modifier or a build's gem that changed between patches. With a snapshot
per patch, a build pasted after one says which of these facts moved, and a modifier that changed says so on
its row ("Changed in 0.5.5").

Two limits the check says on its own face. The numbers are Path of Building's (**Source: Path of Building**),
not the game's, and the Build tab's own maths names leech and regeneration as mechanics it does not count
(`docs/build-maths.md`), so the fact is read, never worked out here. And a modifier red for a reason that runs
through a help entry rather than its own line (Elemental Weakness lowering resistances) shows the help
entry's words beside it.

### Done when (#77)

"A life-leech build pasted in sees 'cannot leech' in red with the reason, and one click copies a regex that
avoids it." In 0.5.5 no modifier a player can meet says cannot leech (above). The same build sees **of
Smothering** in red with its leech per second and the line "Players have (36-40)% less Recovery Rate of Life
and Energy Shield", and one click copies `"!f l|ana"`. When a patch weights a "cannot be leeched from"
modifier again, it is tagged no leech on the next run of the tool, and the same click covers it.

## The labels

* **Subject to change** (tooltip "Depends on GGG. May change without notice."): the search text's length
  against 50 and 250; the cleansed atlas node weights (`sub`); the `!` term, which GGG's help text does not
  name.
* **Source: the game files** on every row (`src`); **Source: Path of Building** on every build fact;
  **Source: poe2.re** and **Source: poe2ref.com** where this page's comparison is shown.
* **Estimate**: nothing in this file. A tag is read off a stat, a line is the game's, a tier is shipped. The
  rare monster file's `est` tags (read off a name) keep their Estimate where the two lists meet.

## Left open

* The length of the search box, until GGG writes it down.
* Rare waystone names: the word list is in the game files (the dat reader of #83 can read it) and is the one
  thing a fragment is not yet checked against.
* Three waystone modifiers (Splitting, of Giants, of Nemeses) roll on no waystone tier: `nt` says so, and
  what puts them on a waystone is not in this file.
* The map-area modifiers of the game's older map pool (no regen, reflect, cannot leech) are left out on purpose:
  no spawn weight anywhere in 0.5.5.
