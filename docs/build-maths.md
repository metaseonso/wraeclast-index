# The character maths: every rule, and every hole

What `assets/maths.js` does, in words. The file is the only copy of the rules; this page is the only copy of
the reasoning behind them. `tools/dev/buildcheck.mjs` holds the file to this page, and the Build tab and the
check both import the file, so what the check proves is what a player gets.

Three rules run through all of it.

1. **The game's own data first.** Path of Building named where a formula is theirs, on the card as well as in
   the code.
2. **One table, not a rule per wording.** A wording nobody mapped is a stated hole, never a silent zero.
3. **Every answer is two numbers and a reason.** Where something is not settled the floor assumes it goes
   against you and the ceiling assumes it goes for you, and the answer names what widened it.

## The order of operations

`STEPS` is the order, word for word off the two flowcharts the site already ships — "How damage works" and
"How defences work". Guard 1 reads those cards out of `data/index-rest.json` and fails the moment either list
moves, so a card edited without the model following breaks the build rather than the numbers.

**A hit you deal:** base damage → added damage → conversion → gained as extra → the increased and reduced
sum for the type the damage now is, applied once → each more and less as its own multiplier → critical hits.

**A hit you take:** evasion and block decide whether it arrives → armour and resistance each cut what does,
as two multipliers on the same damage, so neither is before the other → then the pools take what is left:
Energy Shield, then Mana under Mind Over Matter, then Life.

Two numbers the cards state and the model uses as written: armour reduces a hit by armour divided by armour
plus ten times the hit, capped at 90%; the default maximum resistance is 75% and cannot go above 90%.

## The one table

Every line off every source goes through the same 27 shapes. The shapes are the forms the game writes in —
`+# to <noun>`, `#% increased <noun>`, `#% more <noun>`, `adds # to # <type> damage`, `#% of <type> damage
converted to <type> damage` — against a small vocabulary of nouns and damage types. The maths then runs over
the table and knows nothing about where a line came from.

**A line has three ways out, and never two.**

| | What it is | What it does to an answer |
|---|---|---|
| **read** | a number the table knows | it is in the number |
| **named** | a real mechanic v1.0 does not count — damage over time, ailments, minions, totems, triggers, leech, recoup, regeneration, stun, movement, cost, duration, area, what an item asks of you to equip it | it is not in the number, and the card says how many there were |
| **unread** | a wording nothing here knows | it is not in the number, the card says so, **and the check stands the build down on every stat the line's own words name** |

A line that overrides a stat, removes one or forbids something — "Maximum Life is 1", "Immune to Chaos
Damage" — is never *named*: it changes a number we do work out, so it is refused loudly and counted as
unread. That rule is what stops a keystone quietly doing nothing.

### What the table reads today

Measured by `node tools/dev/buildcheck.mjs` on every run, so it is a number that moves rather than a feeling.

| Source | Wordings | read | named | gap | Lines | read | gap |
|---|---|---|---|---|---|---|---|
| Craftable modifiers | 477 | 96 | 218 | 163 | 7,206 | 64% | 13% |
| Unique items | 1,028 | 99 | 456 | 473 | 3,594 | 45% | 24% |
| Passives | 1,530 | 102 | 754 | 674 | 5,996 | 31% | 26% |

`node tools/dev/buildcheck.mjs --gaps` prints the gap itself, most-read first. That list is the work: every
row on it is a wording to add a shape for, and each one closes some of the stand-downs below.

## Where the numbers that are not a line come from

| Number | Source |
|---|---|
| What a class starts with: attributes, Life, Mana, its unarmed hit | the game's own export, `data/gamestats.json` |
| One monster of each level: life, damage, accuracy, armour, evasion | the game's own export, `data/gamestats.json` |
| What every passive says | the game's own export, `data/treelines.json` (`tools/treelines.py`) |
| A base item's damage, crit and attack rate | the game's own export, the base's own card |
| The order, the armour curve, the caps | the mechanics cards, which credit Path of Building for what the game leaves out |
| What a level adds to Life (12), what Strength adds to Life (2, halved where a keystone says so), base Evasion (7), base Critical Damage Bonus (100) | Path of Building's own character maths, named on the card |
| The 5% increased Life a character carries before anything is allocated | it sits on the node a class starts from, and our tree data carries that node with no lines on it |
| How many gems go in a link: up to 5 supports, and a skill gem that casts another counts to 6 in total | the owner's own knowledge of the game, 23 September 2026. The export states neither, and `SOURCE.sockets` says so wherever a count is shown |

**What a hit is measured against.** Damage against nothing is a number with no meaning. The Build tab
measures against one monster of the level set on the card, out of the game's own table — its armour for what
you deal, its damage for what you take. The level is a control, it starts at the character's own, and two
rows move with it: how many of that monster's hits the pools stand, and what a second of your damage does
into its armour.

## The range, and what widens it

| What | How it widens | What the card says |
|---|---|---|
| The tree's free attribute points | the floor puts none of them here, the ceiling all of them | *Widened by: which attribute the tree's free points went to* |
| Mind Over Matter | the floor assumes Mana is spent when the hit lands, the ceiling that it is full | *Widened by: how much Mana stands in front of Life when the hit lands* |
| A modifier not rolled yet | the floor takes the bottom of the range the game prints, the ceiling the top | *2 affixes not rolled yet* |
| A wording the table does not read | **nothing** — it is left out and named | *N lines are not in these numbers* |

Each unknown carries a switch — *as if it works* / *as if it does not* / *both ways*. Set either way the
range narrows and the card records which way it was set. Set nothing and the range stays wide.

**The rule that makes the range worth reading:** a range widened by an unknown always names it. A range with
no name beside it is a range from modifiers not rolled yet and nothing else.

## The check

`node tools/dev/buildcheck.mjs`: the committed data, a fixed seed, no network, nothing written.

**Against Path of Building, without running Path of Building.** A Path of Building code is compressed XML and
the XML carries Path of Building's own answers in its `PlayerStat` lines. `tools/dev/pob` holds twelve codes
their authors shared publicly on poe.ninja, one per case: level 1, level 15, level 44, level 100, an attack
build, two spell builds, two armour builds, two that block, one with the attributes stacked.

**The bands.** Life, Energy Shield, Armour, Evasion, the resistances and the attributes are exact arithmetic
on both sides, so **the band is zero and one point out is a failure** — except that where an unknown widened
our answer the test is that our range holds Path of Building's number, which is the whole claim of a range.
Damage is not exact arithmetic on both sides, so the band there is 5% and only inside our range.

**Standing down.** A stat is not compared at all where any of these holds, and the check counts and names
every one:

* an unread line on the build names that stat;
* the stat is Life and an unread line names an attribute, because Life is worked out off Strength;
* the stat is an elemental resistance — **the game lowers your Elemental Resistances as you progress and
  publishes no number for it.** Chaos Resistance takes no such penalty and is held to the band as normal;
* the stat is Armour, Evasion or Energy Shield and the build has an item with a defence printed on it —
  **which of an item's lines are already inside that printed number is not something the line says.** Our
  craft data does mark it, per item class, which is how this one closes.

**The eight guards**, one per rule the model must never break: the order of operations is the cards'; nothing
is a silent zero; an unknown taken both ways gives a floor no higher than a ceiling; no number without the
monster level it was worked against; the caps hold and armour and resistance give the same answer either way
round; a link takes what the game admits; a build with no gear still answers; and the same build twice gives
the same numbers.

## What v1.0 does not cover

Said here once, and said on the card every time it bites.

* **Damage over time and ailment magnitude.** Ignite, Poison, Bleeding, Shock, Freeze.
* **Minions, totems, traps and triggers.** A build whose damage is theirs gets no damage number.
* **Leech, recoup and regeneration**, and anything that returns a pool over time.
* **Stun, and every threshold and buildup around it.**
* **Auras and curses on other creatures.**
* **Duration, area of effect, movement speed, cost and reservation, rarity.**
* **A skill gem's own base damage.** The Build tab has the base a weapon is worth and not a gem's own table,
  so an attack build gets a damage number and a spell build is told that its damage comes off the gem and is
  not in the count.
* **Configuration.** Path of Building has a screen of switches for enemy state, buffs and conditions. We have
  the monster level and the unknowns; everything else is what the build itself carries.

## What may be claimed, and what may not

The bar the owner set was *more sophisticated than Path of Building*. Where that is reachable:

* **Saying what is not known.** Path of Building answers with one number. We answer with a range, name the
  unknown that widened it, and let the player set it either way.
* **Agreeing with what we publish.** The order of operations is held to the mechanics cards by a guard. A
  player can read the card and then read the number and find the same rules.
* **Naming the source of every number on screen.** The game's export first, Path of Building named where a
  formula is theirs.

Where it is not, and must not be claimed:

* **Coverage.** Path of Building has years of per-skill handling. We read 64% of craftable lines, 45% of
  unique lines and 31% of passive lines, name another fifth or so as outside this version, and the rest is a
  stated gap.
* **Per-skill exactness.** We model a skill from its own data, which is right for most and approximate for
  the ones built around a behaviour.

**So the claim on the card is the one we can keep:** *worked out from the game's own data, in the order the
mechanics cards state, and where something is not known the range says so.* Not *better than Path of
Building* — more careful, never that it knows more.
