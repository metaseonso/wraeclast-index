# The crafting bench: the engine

A bench where a player picks an item, picks the currency and omens they want to use, and crafts as if in
game. It is for practice, so the one thing it owes the player is that what it rolls is what the game would
roll. Where we cannot promise that, it says so on the card in one line and never fills the hole with a
number nobody measured.

Three rules run through everything below.

1. **Official game data first.** The item, its bases, which modifiers a base can roll, their level, their
   side, their group and the numbers printed on each line all come from the game's own files, through
   `tools/craft.py` into `data/craft.json` and `data/craft/<class>.json`. A non-official number is named
   where it is shown.
2. **No invented numbers.** Where a chance is not published anywhere, the step does not roll it. It either
   asks the player which outcome to practise, or it refuses and says why. The one exception the owner
   ruled on is a pool nobody has measured: it rolls evenly and says, on the card, that it will not match
   the game exactly.
3. **No expected value.** No "1 in N", no average cost, no cost to hit, no footnote that adds up to one.
   The bench shows what happened, and what a single roll can still land on. Nothing else.

This file is the engine. `assets/engine.js` is the one copy of it in code: the bench in the browser
(`assets/craftsim.js`) and the check (`tools/dev/simcheck.mjs`) both import that file, so what the check
proves over 250,000 rolls is what a player gets. The screens are someone else's; what they need from the
engine is in [The bench card and the running card](#the-bench-card-and-the-running-card).

---

## The data underneath

| What | Where | Built by |
|---|---|---|
| Kinds of item, their affix caps, socket count, whether they can be Rare | `data/craft.json` → `classes[]` | `tools/craft.py`, from the game files |
| Every orb, omen, bone and catalyst, with the game's own description line | `data/craft.json` → `orbs`, `omens`, `bones`, `cats` | the game files |
| Bases: drop level, requirements, defences, implicit lines, which pool it rolls | `data/craft/<class>.json` → `bases[]` | the game files |
| Modifier families: side, wording, tags, exclusive groups | → `fam[]` | the game files |
| Modifiers (one entry per tier): level, lines with their ranges, affix name | → `mods[]` | the game files |
| Pools: which modifiers a base can roll, which can be desecrated, which the Vaal Orb can add | → `pools[]` `m`, `d`, `c` | the game files |
| How often each modifier rolls | → `pools[].w`, one number per entry of `m` | **Craft of Exile**, measured with recombinators by Krakenbul and the Prohibited Library (`tools/craftweights.py`) |
| Essences: which modifier each one adds to each kind of item | → `ess[]` | poe2db |
| Runes and soul cores: what each gives in each kind of item | → `aug[]` | the game files |

The one thing the game files do not carry is the weights. Every spawn weight in the export is 1 or 0 — can
roll, cannot roll — and poe2db prints the same. So the pool is official and the odds inside it are not; the
card names the source for the odds, and `tools/craft.py` prints the day real weights appear in the export so
the borrowed ones can be dropped.

---

## The item

One object. Everything a step needs is on it, and nothing on it is worked out twice.

```js
item = {
  cls:    'ring',            // the kind of item (data/craft.json classes[].id)
  base:   'Sapphire Ring',   // the base name
  ilvl:   81,                // item level: the highest modifier level it can roll
  rarity: 'normal' | 'magic' | 'rare',
  corrupt: false,
  quality: 0,                // and, on jewellery and jewels, which catalyst the quality is
  mods:   [ {i, src, vals, lines, frac} ],   // in the order they went on
  sockets: [ runeName | null ],
}
```

A modifier on the item is the index of its tier in `mods[]` (`i`), where it came from (`src`: rolled,
essence, desecrated, corruption implicit), the numbers that were rolled for it (`vals`), the lines as the
item shows them, and whether it is fractured. Side, level, group and wording are never copied onto it: they
are read from `fam[]` and `mods[]` each time, so a rebuilt data file cannot leave a stale copy behind.

**The caps.** `classes[].mx` gives the prefix and suffix cap for a Rare of that kind — 3 and 3 for
equipment, 2 and 2 for a jewel. A Magic item takes 1 and 1. A base can move its own caps and the game writes
it on the item: `+1 Prefix Modifier allowed`, `-1 Suffix Modifier allowed`, `+2 Prefix Modifiers allowed`.
Nine amulets and four rings carry one, one of them on both sides at once. The engine reads those lines off
the base's implicits and adds them to the cap, never below zero. The game states the line; it does not state what the line does to a Magic
item, so we apply it to both Magic and Rare and say so here.

**Flasks and charms cannot be Rare** (`classes[].rare` is false for them, from the game's own item
metadata), so every currency that needs a Rare refuses on them, in those words.

---

## The pool, and how one modifier is picked

### The candidates

A base points at one pool (`bases[].p`). `pools[].m` is every modifier that base can roll, one entry per
tier, in family and level order, with `pools[].w` holding one weight per entry in the same order.

For one pick, walk `m` and drop an entry when any of these is true, in this order:

1. an omen steers the side and this is the other side;
2. its level is above the item level (`mods[i][2] > item.ilvl`);
3. the orb has a lowest modifier level and this is below it (Greater and Perfect orbs);
4. the step is steered to certain families and this is not one of them;
5. its side is already full;
6. a modifier of its family is already on the item;
7. any of its family's groups is already on the item — this is the game's own exclusion list, and it runs
   across families: flat Armour, flat Evasion, flat Energy Shield and the Evasion/Energy Shield hybrid all
   sit in one group on gloves, so an item can hold one of the four;
8. it has no weight (a measured pool that has an unmeasured entry is handled below).

What is left is the candidate list, each with a weight. The side is **not** picked first: both sides are in
one list, and the side a roll lands on is the side of the modifier that came up. An omen that says "only
prefix modifiers" is the one thing that picks a side first, by dropping the other side from the list.

The tier is not picked separately either. Each tier is its own entry with its own weight, so the tier
distribution falls out of the same draw — the same shape the game's own tables have.

### The draw

Sum the candidate weights, draw one float in `[0, total)`, walk the list subtracting until it goes
negative. That is the whole of it. The check in `tools/dev/simcheck.mjs` proves the result matches the
weights over 250,000 rolls per class, including the last entry in the list, which is the one a careless
integer draw loses.

A multi-modifier step (an Orb of Alchemy, an omen that adds two) rebuilds the candidate list between every
pick, so the second pick already knows what the first one put on.

### Measured, or even

Two kinds of pool, and they must never look alike on screen.

- **measured** — every modifier the base can roll has a number. The pick runs on the weights, and the card
  carries the weight source line it already carries on the Craft tab.
- **even** — it does not. Every candidate is as likely as every other, and the card says so in one line:
  > No measured weights for this kind of item — every modifier rolls evenly here, so it will not match the game exactly.

  For a base whose pool is only part measured, the same line with the count:
  > 79 of this base's 407 modifiers have no measured weight — it rolls them all evenly, so it will not match the game exactly.

A pool that is part measured counts as **even**, not as measured-minus-a-few. Rolling on the measured part
and leaving the rest out would mean a modifier that can roll in game never rolls here; mixing a measured
weight with a made-up one for the rest would be a number we do not have. Rolling the lot evenly is the only
one of the three that invents nothing, and the line says what it is.

**What each of the two prints.** A measured pool's rows carry the weight and its share of that side of the
pool, exactly as the Craft tab already draws them — one modifier against its own side, never the odds for a
whole item. An even pool prints **no share on any row**, measured or not: in a pool the bench rolls evenly, a
share taken from the weights would not be the bench's own odds, so the rows that have a number keep it out of
sight with the rows that do not. That is what keeps the two cases from ever reading alike — one has shares
everywhere, the other has shares nowhere and a line saying why.

**The running card prints no share at all**, in either case. The pool with its shares belongs to the bench
card, where the player is choosing; a share shown beside a modifier that has just landed is a chance reported
per hit, and this bench reports none.

### The numbers on a modifier

The game prints the range into the line: `+(5-8) to Strength`. Every number in a line rolls on its own,
evenly, in the steps the range is written in — whole numbers normally, tenths where the range is written in
tenths (`(2.1-3) Life Regeneration per second`). Reduced modifiers are written best end first
(`(15-10)% reduced Flask Charges used`), so the two ends are sorted before rolling. 82 modifiers are written
that way and 7,355 ranges are rolled this way in total; a modifier with no range in its line has no number
to roll.

---

## What a step reports

Every currency answers the same shape, and the bench shows it as one line in the step history:

```js
{ok: true,  what: '1 swapped', added: [mod], removed: [mod], note: ''}
{ok: false, why: 'An Exalted Orb needs Rare, this is magic'}
```

`what` is the short line. `added` and `removed` are the modifiers themselves, so the history can show the
roll that came up and the undo stack can put it back. `why` is what the bench shows where a step will not
run, in the game's own terms. A step never half-runs: if the roll cannot be made, the item is left as it
was.

---

## The currencies

Every line in the *What it does* column is the game's own, from `data/craft.json` → `orbs`. **Fixed** is what
happens the same way every time; **rolled** is what the generator decides. A step that cannot run changes
nothing and answers `{ok: false, why}`.

Three rules hold across the whole table and are not repeated in it:

- **Adding** means one pass of [the pick](#the-pool-and-how-one-modifier-is-picked): the candidate list is
  built fresh, the draw runs on the weights, the numbers on the line roll after. A step that adds more than
  one rebuilds the list between every pick.
- **Removing** means an even draw among the modifiers that can go — explicit modifiers, not fractured, on the
  side an omen allows if one is set. Implicits are never eligible. That is [decision 1](#1-what-a-removal-takes).
- **A corrupted item takes nothing.** Every step that would change a modifier refuses on one, in those words.

| Currency | It needs | What one use does | Fixed | Rolled |
|---|---|---|---|---|
| Orb of Transmutation | a Normal item | *Upgrades a Normal item to a Magic item with 1 modifier* | Normal → Magic; one modifier | which one; its numbers |
| Greater Orb of Transmutation | the same | the same, no modifier below level 44 | the floor, 44 | which one; its numbers |
| Perfect Orb of Transmutation | the same | the same, no modifier below level 70 | the floor, 70 | which one; its numbers |
| Orb of Augmentation | a Magic item with a side not full | *Augments a Magic item with a new random modifier* | one modifier | which one; its numbers |
| Greater / Perfect Orb of Augmentation | the same | the same, floor 44 / 70 | the floor | which one; its numbers |
| Regal Orb | a Magic item of a kind that can be Rare | *Upgrades a Magic item to a Rare item, adding 1 modifier* | Magic → Rare; one modifier | which one; its numbers |
| Greater / Perfect Regal Orb | the same | the same, floor 35 / 50 | the floor | which one; its numbers |
| Orb of Alchemy | a Normal or Magic item of a kind that can be Rare | *Upgrades a Normal or Magic item to a Rare item with 4 random modifiers* | → Rare; it ends holding 4 | each pick; the numbers |
| Exalted Orb | a Rare item with a side not full | *Augments a Rare item with a new random modifier* | one modifier | which one; its numbers |
| Greater / Perfect Exalted Orb | the same | the same, floor 35 / 50 | the floor | which one; its numbers |
| Chaos Orb | a Rare item with a modifier that can go | *Removes a random modifier and augments a Rare item with a new random modifier* | one out, one in | which goes; which comes; its numbers |
| Greater / Perfect Chaos Orb | the same | the same, the new modifier no lower than 35 / 50 | the floor | as above |
| Orb of Annulment | a Magic or Rare item with a modifier that can go | *Removes a random modifier from an item* | one modifier goes | which one |
| Divine Orb | an uncorrupted item with a number on it | *Randomises the numeric values of modifiers on an item* | every number on the item is rerolled | each number |
| Fracturing Orb | a Rare item with at least 4 modifiers | *Fracture a random modifier on a rare item with at least 4 modifiers, locking it in place.* | one modifier is locked and can never be removed | which one |
| Artificer's Orb | a kind with an augment socket free (`classes[].so`) | *Adds an Augment Socket to a Martial Weapon, wand, staff or Armour* | one socket | nothing |
| Rune, soul core | an item with an empty augment socket | the lines `aug[]` carries for this kind of item | the lines, exactly | nothing |
| Catalyst | a ring, amulet or jewel below its quality cap (`bases[].ca`) | *Adds quality that enhances <tag> modifiers* | the quality, and which tag it names | nothing |
| Lesser / Normal / Greater Essence | a Magic item of a kind that can be Rare | *Upgrades a Magic item to a Rare item, adding a guaranteed modifier* — the modifier is the one `ess[]` names for this kind of item | Magic → Rare; **which** modifier | only its numbers |
| Perfect Essence, Corrupted Essence | a Rare item | *Removes a random modifier and augments a Rare item with a new guaranteed modifier* | which modifier comes | which goes; its numbers |
| Vaal Orb | an uncorrupted item | *Modifies an item unpredictably and Corrupts it* | — | **nothing: it does not roll.** The outcomes are listed and the player picks one to practise |
| Bone (desecration) | a Rare item of the kind the bone names (`bones[].on`) | reveals a choice of Desecrated modifiers and the player takes one | the item is corrupted by the reveal | **nothing: it does not roll.** The pool is the game's own `pools[].d`; how often each is offered is measured nowhere |

**The Greater and Perfect floors** come off `orbs[].up` in `data/craft.json`, which `tools/craft.py` reads from
poe2db's "Minimum Modifier Level". They are a floor on the modifier the orb *adds*, not on the item: an orb
whose floor leaves the candidate list empty refuses and says so, rather than quietly dropping the floor.

**The two essence shapes** are the game's own, from the 0.3.0 notes: *"Lesser, Normal, and Greater Essences can
upgrade a Magic item to Rare, adding a guaranteed modifier"* and *"Perfect Essences and Essences obtained
through Corruption remove a random modifier and augments a Rare item with a new guaranteed modifier"*. Which
modifier is not a roll at all: `ess[]` carries one modifier per essence **per kind of item**, and it may sit on
either side — 0.3.0 again, *"Essences now add a specific modifier, depending on the Tier of Essence and type of
item it is being applied to"*. What is still rolled is the numbers on that modifier's line, and, for the Perfect
and Corrupted shapes, which modifier is removed.

### Smaller readings

Four places where the game's words leave a gap that is not one of [the eleven](#the-eleven-decisions), too small
to carry a decision of its own but written down rather than left implied.

| Where | The gap | What the bench does |
|---|---|---|
| Orb of Alchemy on a Magic item | the line says *"a Rare item with 4 random modifiers"*, not how many it adds to an item that already has one or two | it adds until the item holds 4, keeping what was there. On a jewel, 4 is the whole item |
| Divine Orb and implicits | Omen of the Blessed says *"will only reroll Implicit Modifiers"*, so a plain Divine Orb reaches them too | a plain Divine rerolls every number on the item, implicit and explicit; the Blessed omen narrows it to the implicits |
| Orb of Alchemy, Chaos Orb and a pool that runs dry | nothing says what happens when fewer modifiers can be rolled than the orb wants | it adds what it can and the step line says how many went on. It refuses only when it can add none, and then changes nothing |
| Fracturing Orb | which of the 4-plus modifiers is locked | the same even draw as every other removal ([decision 1](#1-what-a-removal-takes)), and a fractured modifier is out of every later removal |

---

## The omens

An omen is not a step. It is a rider on **the next use of one currency**, and it is consumed when that
currency is used. So an omen never has a step function of its own: it sets one or more options on the step its
currency already runs, and the whole of the engine's omen handling is those options.

```js
opt = {only, removeOnly, min, fam, twice, whittle, homog}
```

| Option | Set by | What it does to the step |
|---|---|---|
| `only` | the Sinistral / Dextral omens that *add* | drops the other side from the candidate list before the draw |
| `removeOnly` | the Erasure, Annulment and Crystallisation omens | narrows the even removal draw to one side |
| `min` | nothing — it is the Greater and Perfect orbs' own floor | drops every modifier below that level |
| `fam` | Homogenising, Necromancy by lord, an essence | narrows the candidate list to a set of families |
| `twice` | Greater Exaltation | two picks instead of one, the list rebuilt between them |
| `whittle` | Whittling | replaces the even removal draw with the lowest-level rule |
| `homog` | Homogenising | picks one tag off the item first, then sets `fam` from it |

`only` and `removeOnly` are two different things and the table below keeps them apart, because the Erasure
omens steer the Chaos Orb's **removal** while its addition still rolls over both sides.

### The ones the bench runs

| Omen | Its currency | The game's line | How the bench runs it |
|---|---|---|---|
| Omen of Sinistral Exaltation | Exalted Orb | *will add only prefix modifiers* | `only: 'p'` |
| Omen of Dextral Exaltation | Exalted Orb | *will add only suffix modifiers* | `only: 's'` |
| Omen of Greater Exaltation | Exalted Orb | *will add two random modifiers* | `twice` — two draws by the ordinary rule, no side reserved · [decision 8](#8-greater-exaltation-two-modifiers-and-a-full-side) |
| Omen of Homogenising Exaltation | Exalted Orb | *will add a Modifier of the same type as an existing Modifier on the Item* | `homog` — one tag off the item, then the draw inside it · [decision 5](#5-what-same-type-means) |
| Omen of Homogenising Coronation | Regal Orb | the same, on a Regal Orb | `homog`, on the Regal step |
| Omen of Sinistral Erasure | Chaos Orb | *will remove only prefix modifiers* | `removeOnly: 'p'` |
| Omen of Dextral Erasure | Chaos Orb | *will remove only suffix modifiers* | `removeOnly: 's'` |
| Omen of Whittling | Chaos Orb | *will remove the lowest level modifier* | `whittle` · [decision 7](#7-which-level-whittling-compares) |
| Omen of Sinistral Annulment | Orb of Annulment | *will remove only prefix modifiers* | `removeOnly: 'p'` |
| Omen of Dextral Annulment | Orb of Annulment | *will remove only suffix modifiers* | `removeOnly: 's'` |
| Omen of Light | Orb of Annulment | *will remove only Desecrated modifiers* | the removal draw is narrowed to modifiers whose `src` is desecrated; with none on the item it refuses |
| Omen of the Blessed | Divine Orb | *will only reroll Implicit Modifiers* | the reroll is narrowed to the base's implicit lines |
| Omen of Sinistral Crystallisation | Perfect / Corrupted Essence | *will remove only Prefix modifiers* | `removeOnly: 'p'` on the essence's removal |
| Omen of Dextral Crystallisation | Perfect / Corrupted Essence | *will remove only Suffix modifiers* | `removeOnly: 's'` |
| Omen of Sinistral Necromancy | desecration | *will add only prefix modifiers* | the revealed choice is narrowed to prefixes |
| Omen of Dextral Necromancy | desecration | *will add only suffix modifiers* | the revealed choice is narrowed to suffixes |
| Omen of the Blackblooded | desecration | *will guarantee a random Kurgal modifier* | the choice is narrowed to that lord — `fam[][5]` in the data carries it |
| Omen of the Liege | desecration | *will guarantee a random Amanamu modifier* | the same, Amanamu |
| Omen of the Sovereign | desecration | *will guarantee a random Ulaman modifier* | the same, Ulaman |
| Omen of Abyssal Echoes | desecration | *the next time you reveal Desecrated modifiers you can reroll the options once* | the reveal is a choice, not a roll, so this shows a second choice and lets the player take it |

The desecration omens narrow **a choice the player makes**, not a draw the bench makes — the reveal itself is
[a step that will not roll](#steps-that-will-not-roll), so an omen on it changes what is offered and nothing else.

### The ones the bench will not run

| Omen | Why |
|---|---|
| Omen of Catalysing Exaltation | its whole effect is a number PoE2 has never published · [decision 6](#6-catalysing-exaltation) |
| Omen of Sanctification | 0.5.0 changed what Sanctify does and did not publish the new curve · [decision 9](#9-the-sanctification-curve) |
| Omen of Putrefaction | its own line and the 0.5.0 Desecrated cap cannot both be right as written · [decision 10](#10-putrefaction-against-the-one-desecrated-cap) |

### Legacy

Five omens were taken out of the game in 0.3.0 — *"The following Omens can no longer be obtained: Omen of
Greater Annulment, Omen of Dextral Alchemy, Omen of Sinistral Alchemy, Omen of Dextral Coronation, and Omen of
Sinistral Coronation"* — and one more in 0.5.0, *"Omen of Corruption can no longer be obtained"*. They are still
in the game's own data, so they are still on the site's cards, and the bench must not pretend they are craftable
today.

| Omen | Gone since | What it did |
|---|---|---|
| Omen of Greater Annulment | 0.3.0 | *will remove two modifiers* |
| Omen of Dextral Alchemy | 0.3.0 | *will result in the maximum number of suffix modifiers* |
| Omen of Sinistral Alchemy | 0.3.0 | *will result in the maximum number of prefix modifiers* |
| Omen of Dextral Coronation | 0.3.0 | *will add only suffix modifiers* |
| Omen of Sinistral Coronation | 0.3.0 | *will add only prefix modifiers* |
| Omen of Corruption | 0.5.0 | *will always result in change* |

The bench offers none of the six as a pick, and the line on the row is the patch that took it:
> Removed in 0.3.0 — it can no longer be obtained, so the bench does not craft with it.

Two more are not removed but no longer drop: 0.5.0 says *"The following items only appear on the Currency
Exchange in Standard Leagues: Omen of Corruption, Omen of Homogenising Coronation, and Omen of Homogenising
Exaltation"*. The two Homogenising omens still work, so the bench runs them, with a line saying where they come
from now.

---

## The eleven decisions

Eleven things the bench has to do that no source we trust states. Each one is **a decision, not a fact**, and
each is marked as one in the engine and on the screen. The rule for all eleven is the same: where the gap is a
*number*, the step refuses rather than invent it; where the gap is a *rule*, the bench takes the reading that
adds least to what the game said, and says on the card what it took and where the player would be misled.

In the engine every one of them is a constant with the same shape, so none can be changed by accident and a
search for `DECISION` finds them all. `tools/dev/simcheck.mjs` holds the reference copy and fails if one loses
a field or goes missing; `says` is the only part of a decision allowed on screen:

```js
DECISION[3] = {what: 'Item level does not gate an essence tier',
               why:  'Nothing official ties a tier to an item level, and an essence names one modifier, so there is no pool to narrow',
               says: 'Whether the game needs an item level for an essence tier is not published…'}
```

---

### 1. What a removal takes

**The gap.** Nothing published says which modifier an Orb of Annulment, a Chaos Orb, a Fracturing Orb or a
Perfect Essence takes, or whether an implicit can be taken.

**Decision.** One even draw among the item's **explicit** modifiers that are not fractured and are on the side
an omen allows, if one is set. Implicits are never eligible, by any currency.

**Why.** Even is the only draw that adds no number. Craft of Exile's own model gives every eligible modifier
the same weight for annulment, so the one source with numbers agrees. Implicits are out because they are not
affixes — the caps do not count them, no currency in the game's list names them, and the one currency that
*does* reach them, the Divine Orb under Omen of the Blessed, names them explicitly.

**On screen**, on the step line and on every removing currency's row:
> Which modifier a removal takes is not published. The bench draws evenly from the ones it could take. Implicits are never touched.

---

### 2. An essence against a Rare that is not ready for it

**The gap.** The 0.3.0 line is *"Perfect Essences and Essences obtained through Corruption remove a random
modifier and augments a Rare item with a new guaranteed modifier"*. It does not say what happens when the Rare
has fewer than 6 modifiers, when the side the essence's modifier needs is already full, or when the item already
has that very modifier.

**Decision**, three parts, and the step is atomic — it works all three out before it touches the item:

- **Fewer than 6 modifiers**: it runs. One modifier is removed, the guaranteed one is added. Nothing in the
  line asks for a full item.
- **The side it needs is full after the removal**: it refuses and changes nothing. This is the case a
  Crystallisation omen makes easy to hit — the omen sends the removal to one side while the essence's modifier
  wants the other.
- **Its own modifier, or one of that modifier's exclusive groups, is already on the item**: it refuses and
  changes nothing.

**Why.** An essence names one modifier and has no second choice to fall back on. Guessing a fallback — a
different modifier, a second removal, a silent no-op — would each be a different game. Refusing is the only
answer that is visibly not a guess, and the player loses nothing but a click.

**On screen**, on the essence row, and as the `why` when it refuses:
> An essence adds one exact modifier. If the item already has it, or the side it needs is full, the bench stops rather than guess — the game has not said what it does instead.

---

### 3. Item level and the essence tiers

**The gap.** Whether a Greater or Perfect essence needs an item level, the way a Greater orb has a modifier
floor. `ess[]` carries a level per essence, but that is the level **of the modifier in the essence table**, not
a requirement on the item.

**Decision.** Item level does not gate an essence tier. Any tier runs on any item level, and the modifier it
names goes on whole, at its own level, whatever the item level is.

**Why.** An essence adds one named modifier, so there is no pool for the item level to narrow — the rule the
item level exists for has nothing to bite on. And nothing official ties a tier to a level. The bench is
therefore *more permissive* than the game may be, which is the safe direction for practice: it never stops a
craft the game would allow.

**On screen**, on the essence row wherever the essence's modifier level is above the item level:
> Whether the game needs a minimum item level for this essence tier is not published. The bench lets it run at any item level. This is the one place it may be more generous than the game.

---

### 4. Corrupted essences

**The gap.** *"Essences obtained through Corruption"* exist and the game says what they do. It does not say
which tier you feed to the corruption, or how often each outcome comes out.

**Decision.** The bench does not simulate making a corrupted essence at all. A corrupted essence is offered as
something the player already has, and the craft it does is simulated in full. The corruption that produces it is
out of scope.

**Why.** Both halves of it are numbers — which input, with what odds — and neither is published. Simulating it
would mean printing exactly the kind of chance this bench exists not to print. Leaving the input out costs the
player nothing: the craft they came to practise is the essence's craft, not the making of it.

**On screen**, on every corrupted essence's row:
> How a corrupted essence is made, and how often, is not published. Pick one here and the bench will run its craft; it does not roll the corruption that makes one.

---

### 5. What "same type" means

**The gap.** The Homogenising omens say *"a Modifier of the same type as an existing Modifier on the Item"*.
"Type" is not defined anywhere in the game's words.

**Decision.** Type is the modifier's **tag**, as the game files carry it (`fam[][2]`: `fire`, `life`, `attack`,
`caster`, `attribute`, and so on). The step picks one tag **evenly among the distinct tags the item's modifiers
carry**, narrows the candidate list to modifiers with that tag, and then draws on the weights as usual.

**Why.** The tag set is the only "type" a modifier and an existing modifier can share that the files actually
carry — mod group is too narrow (a group is already excluded, so nothing could ever be added), and side is not a
type. The game uses the same word for the same field elsewhere: a catalyst's line reads *"enhances Fire
modifiers"* and its `tag` in the data is `fire`. The even pick among the distinct tags is the second half of the
decision and the shakier half: an item with two fire modifiers and one life modifier makes fire and life equally
likely here, and the game may instead weigh a tag by how many modifiers carry it.

**On screen**, on the omen's row and on the step line:
> "Same type" is not defined in the game's words. The bench reads it as the modifier's tag — the same tags the catalysts name — takes one evenly from the tags already on the item, then rolls inside it. If the game instead favours a tag the item has more of, this will not match.

---

### 6. Catalysing Exaltation

**The gap.** *"will consume all Catalyst Quality to increase the chance of the corresponding type of
Modifier"*. By how much is not published for PoE2. A PoE1 figure exists and Craft of Exile models one percent of
weight per point of quality to a cap of twenty; neither is a PoE2 measurement.

**Decision.** The step refuses. The omen is shown, its line is shown, and it cannot be used.

**Why.** This omen *is* a number — take the multiplier away and there is no effect left to simulate. A PoE1
number in a PoE2 bench would be the most confident kind of wrong: it would roll, it would look measured, and
nothing on the screen would tell the player it came from another game.

**On screen**, on the omen's row and as the `why`:
> How much catalyst quality moves the odds is not published for PoE2. The only figures anywhere are from PoE1. The bench will not use this omen rather than roll on a number from a different game.

---

### 7. Which "level" Whittling compares

**The gap.** *"will remove the lowest level modifier"*. Which level, and what happens when two are equally low.

**Decision.** The level is the **modifier's own level** — the level at which that tier of that modifier starts
rolling, `mods[i][2]`, the same number the Craft tab already greys a tier out by. Not the item level, not the
tier number, not the value rolled. Where two or more modifiers tie for lowest, one of the tied is taken
**evenly**, and the step line says how many were tied.

**Why.** Modifier level is the only per-modifier level the data has, and it is the one the game's own
Greater-and-Perfect floors count in, so it is the reading that keeps one meaning for one word. The tie-break is
the part that is a guess: a fixed rule — leftmost, newest, prefix first — would be a claim about the game's
internals, and an even draw among the tied is the smallest thing we can do instead. Saying how many tied puts
the guess on screen every time it is used.

**On screen**, on the step line whenever more than one tied:
> Three modifiers tied at level 22. The game does not say which of a tie goes, so the bench took one evenly.

---

### 8. Greater Exaltation, two modifiers and a full side

**The gap.** *"will add two random modifiers"*. Whether the two are steered to any side, and what happens when
only one can go on.

**Decision.** Two ordinary picks, the candidate list rebuilt between them, so each one's side falls out of its
own draw and no side is reserved. If only one can be added, one is added and the step line says so. If none can,
the step refuses and the item is untouched. The omen is used up either way it triggers.

**Why.** "Two random modifiers" is two of the thing a plain Exalted Orb does, and that is the whole of what the
line says — reserving a side, or requiring one of each, would be a rule the game did not write. Rebuilding
between the two is not a choice: it is the same rule every multi-modifier step on this bench follows, so the
second pick cannot repeat the first or break a group.

**On screen**, on the omen's row:
> The game does not say whether the two land on any particular side. The bench draws twice by the same rule as one Exalted Orb. Where only one can go on, it adds one and says so.

---

### 9. The Sanctification curve

**The gap.** Patch 0.5.0: *"Sanctifying an item now multiplies each modifier value based on the current value,
instead of randomising values."* The multiplier is not published. The 78–122% range still printed on poe2db
describes the behaviour 0.5.0 replaced — it is a *randomising* range, and 0.5.0 says Sanctify no longer
randomises. It is stale, not merely unconfirmed.

**Decision.** The step refuses. The omen is shown, the 0.5.0 line is shown next to it, and it cannot be used.

**Why.** The effect is entirely the curve, and it lands on every modifier on the item at once, so a guessed
curve would quietly rewrite the whole item. The one number in circulation is known to describe the old
behaviour, which makes using it worse than having nothing: it would be wrong in a way that looks sourced.

**On screen**, on the omen's row and as the `why`:
> Patch 0.5.0 changed Sanctify from randomising each value to multiplying it based on its current value, and did not publish the multiplier. The 78–122% range still printed elsewhere is the old behaviour. The bench will not run this omen.

---

### 10. Putrefaction against the one-Desecrated cap

**The gap.** The omen's own line: *"your next Desecration attempt will replace all modifiers on the item
creating an item with up to 6 Unrevealed modifiers and Corrupting the item"*. Patch 0.5.0: *"Desecrated
modifiers no longer count as crafted modifiers, but items are limited to 1 Desecrated modifier."* 0.5.0 does not
mention Putrefaction anywhere, so neither line has been withdrawn.

**Decision.** The step refuses, and the card shows both lines, side by side, with their sources.

**Why.** Either the omen is an exception to the cap, or the cap has quietly cut it to one modifier. Picking one
would be inventing a rule, and here the two readings are not close: six Desecrated modifiers and one are
different items. Showing the two lines together is the most useful thing the bench can do — a player who reads
them knows exactly as much as we do.

**On screen**, on the omen's row and as the `why`:
> The omen says "up to 6 Unrevealed modifiers". Patch 0.5.0 says an item is limited to 1 Desecrated modifier. Both are current and they do not agree, so the bench will not guess which one the game is running.

---

### 11. An omen on a corrupted item

**The gap.** Which omens, if any, work on a corrupted item.

**Decision.** An omen is legal exactly where the currency it rides on is legal, and nowhere else. It never
grants its currency a permission the currency lacks. A corrupted item refuses every currency that would change a
modifier, so on a corrupted item every omen refuses with its currency — and, because it never triggered, it is
not consumed.

**Why.** Every omen is written as a rider: *"Your next <currency> will…"*. The omen's subject is the currency,
so its legality is the currency's, and that is one rule instead of twenty-nine. It also fails safe: no omen can
ever be the thing that lets a corrupted item be edited.

**On screen**, on every omen's row:
> An omen only changes the next use of its own currency. Where that currency will not run — a corrupted item, the wrong rarity — the omen does not trigger and is not used up.

---

## Randomness

The site has no random number generator today — this is the first one. It is a seeded mulberry32: 5 lines,
no dependency, the same stream everywhere. A run mints a seed when it starts and keeps it with the run
state, so a reload mid-craft carries on the same stream rather than starting a fresh one, and a check can
replay a run exactly. `assets/engine.js` holds it, and both the bench and the check draw from that one.

The bench never rerolls a step behind the player's back, and there is no pity, no smoothing and no
weighting by what the player has already hit.

---

## The bench card and the running card

Two cards, both reached the way every card on this site is reached: `openDetail` in `assets/app.js`, the
trail, Back and Forward, 50 steps deep.

### The bench card

A card that holds the plan: the item, and the currency and omens the player wants to use. Cold, it opens on
the last item the bench had this session, or empty. Reached from another card, it opens with that card's
thing already in hand:

| Reached from | What the bench opens with |
|---|---|
| a base card (kind `b`) | that base in hand, its kind of item chosen, item level at the class's top |
| an orb or omen card (kind `c`) | that currency picked, the item left as it was |
| an essence card (kind `c`) | that essence picked; from one of the rows under *What it adds*, that kind of item chosen with it |
| a bone or a rune card | that currency picked, and the kinds of item it works on offered first |
| a kind-of-item row on the Craft tab | that kind chosen, no base yet |
| the tab, or a link with nothing on it | the session's last item, or empty |

That is one act on the card you came from, the way `ACTS.craft` already works on a base card, plus the
`it` the act carries. Nothing is passed through the address bar that the card cannot rebuild.

The act is the frame's, not the bench's: `ACTS.bench` names the module and the call it makes (`own`, `go`), so
the popup answers it with one route that names nothing, and `only` is the small test a card has to pass for
the act to be drawn at all — for a currency, that its group is one the game crafts with. A base item always
has one. Adding the act to a kind is one word in that kind's `acts`, which is how every crafting card got it
at once.

Orbs, essences, omens, bones and catalysts are all kind `c` on this site — there is no separate kind for
any of them — so the bench works out what it has been handed by matching the card's name against
`data/craft.json`'s own lists (`orbs`, `omens`, `bones`, `cats`) and the kind's `ess`. A currency in none of
them has no bench act, the way a base with nothing to craft has no craft link today.

**Declaration** (`assets/kinds.js`, one entry in `KINDS`):

```js
{k: 'n', one: 'Bench', many: 'Bench', place: 'Craft', own: './craftsim.js',
 fields: [...HEAD, ...SAYS, 'benchitem', 'benchtab', 'benchpicks', 'benchnote', 'launch', ...REST, ...FOOT],
 acts: [], rel: []}
```

The shared slots come in whole, as they do on every kind: a field the bench carries nothing for draws nothing,
and the frame fails a kind that drops one of them ([the frame](frame.md), "one rule, every kind").

**Field types it needs** (new `FIELDS` entries in `assets/kinds.js`, new `TYPE` functions in
`assets/app.js`, one function each, same contract as the 28 that exist):

| Field | Type | What it draws |
|---|---|---|
| `benchitem` | `item` | the item as it stands: rarity, base, item level, implicits, each modifier with its side and tier — and, on the bench, the kind, the base and the item level to pick from, and what one more roll can still land on |
| `benchtab` | `own` | the box the currency tab goes in: the kind's own module fills it (`KINDS own`) |
| `benchpicks` | `picks` | the currency and omens chosen, in the order they were picked, each removable |
| `benchnote` | `note` | the one line an even pool puts on the card, and nothing when the pool is measured |
| `launch` | `launch` | the one button that starts the run, and the way back into a run this session left |

`item`, `picks` and `launch` are the first fields on the site that take a click. They render from the card's
own state, not from an index row, and they answer clicks through the overlay's delegated listener (`ensureOV`
in `assets/app.js`) — the same route the keyword chips and the Trade toggle already take. One rule carries all
of them and names no kind: a control says what it does in `data-do`, and the card's own module answers it
(`opts.on`, set when the module opens the card). The controls that are not a click — the kind, the base, the
item level — go the same way, off `change`.

`own` is the other half of the same idea and is not the bench's alone: a field of that type draws an empty box
and the kind's module puts its application in it, the way `adds` leaves a box for a file. That is what keeps
an application inside the frame instead of beside it.
No field type on the site holds a text input today and the bench does not need one: a base is chosen from a
list, an item level from a slider the Craft tab already draws, currency from the list of what fits.

### The running card

One button on the bench — **Roll it** — opens a second card: the simulator itself, with the item in it and
the picks ready. It is a card, so it is on the trail, so Back from it means the bench and Forward means the
run again.

```js
{k: 'r', one: 'Craft run', many: 'Craft runs', own: './craftsim.js',
 fields: [...HEAD, ...SAYS, 'benchitem', 'runbody', ...REST, ...FOOT],
 acts: [], rel: []}
```

The item is the same field the bench draws, because it is the same item: on a run it carries no pickers and
the whole of it is the button you use the picked currency on, which is the order the game does it in. What is
under it — what you are holding, what each step did, the undo, the start over and what it cost — is the
module's, in the box `runbody` leaves.

Everything under the head is drawn by the module, the way a boss card is (`KIND.own` → `openCard(it)`,
`assets/app.js` 836-837). It is an application, not a row: it holds the item, the currency the player has
left to use, the step history, an undo stack and the run's seed.

**What passes from the bench to the run.** The `it` the bench pushes onto the trail carries the plan and
nothing else:

```js
{k: 'r', id: 'run-<time>-<n>', n: '<base name>', s: '<kind of item>',
 plan: {cls, base, ilvl, rarity, picks: [...], seed}}
```

The run mints its own id at launch. Two runs on the trail are two ids and two saved states, so going Back
to the bench, changing the plan and launching again leaves the first run where it was.

**Back, from inside a run.** Back is `history.back()`, which lands on the `popstate` listener
(`assets/app.js` 773-783) and repaints the previous step. A run must survive that untouched, and the site
already has the pattern: `saveStep()` keeps the live Trade panel node on the step and `paintStep()`
re-appends it, so Back never re-fires a trade search. The run node is kept the same way, one step further
back: the module holds one node per run id and puts that same node into the box `runbody` leaves every time
the card is drawn, so the node — and everything in it — survives Back, Forward and a redraw, and two runs on
the trail are two nodes that never cross. Scroll comes back the same way as every other card, from
`step.top`, and the run does not fight it because the run's own scrolling lives inside the card, not in the
overlay box.

Leaving the run does not end it: the state is already written (below), so even a closed popup, a new trail
or a reload finds the run where it was. What Back must never do is quietly throw a run away, and with the
state written on every step it cannot.

### The state that survives a refresh

`sessionStorage`, one key per run, `wi.sim.<run id>`, plus `wi.sim` holding the bench's own plan and the id
of the run in front. `sessionStorage` because the owner asked for the session: it lives as long as the tab,
dies with it, and is never shared between tabs. The site already keeps one thing there (`wi.pob`) and five
things in `localStorage`, every read and write in a `try`/`catch` that does nothing on failure, because a
browser with storage denied has to work the same.

```js
{v: 1,                       // the shape of this record
 p: '0.5.5',                 // the patch data/craft.json was built for
 w: '2026-09-22',            // the day the weights were pulled
 t: 1758585600000,           // when it was written
 cls: 'ring', base: 'Sapphire Ring', ilvl: 81, rarity: 'rare', corrupt: false,
 mods: [['<mod>', [24, 31]], ...],     // the modifier and the numbers rolled for it
 picks: [...],               // the currency and omens still to use
 log: [...],                 // the last 200 steps, oldest first
 undo: [...],                // the last 20 item states
 seed: 481920347, at: 1183}  // the stream, and how far down it the run is
```

A modifier is saved by the game's own key for it, not by its place in the file, because that place moves
every time the data is rebuilt. Those keys never reach the screen; `assets/craft.js` already stores the same
keys in `wi.craft` for the same reason.

**Size.** A modifier costs about 40 bytes, an item six of them, a step about 80. A run 200 steps deep with
20 undos is about 25 KB — far inside the 5 MB a browser gives a session. The log is capped at 200 steps and
the undo stack at 20; past that the oldest falls off, the way the trail drops its 51st card.

**When it is written.** After every step that changes the item, and on `saveStep()` when the card is left.
Not on every keystroke, because there are none.

**When it expires.** With the tab. A record more than 12 hours old is dropped on read as well, so a tab left
open overnight does not restore a craft the player has forgotten.

**When the data has moved on.** On read, before anything is drawn:

| Check | If it fails |
|---|---|
| `v` is the shape this build knows | drop the record |
| `p` matches `data/craft.json`'s `patch` | drop the item, keep the plan, and say it in one line: *The game is on patch 0.5.5 now* — the same line `assets/farms.js` already uses when its data is older than the game |
| `w` matches the weight pull day | keep the item, redraw the shares from the new numbers |
| the kind of item and the base still exist | drop the record |
| every saved modifier key still resolves, and to a modifier this base can roll | drop that modifier, keep the rest, say how many went |
| the item still obeys its caps, its groups and its item level | drop the record |

The item is rebuilt from the data, never trusted as saved: a restored item is one the engine would let the
player build today, or it is not restored at all. Nothing impossible ever comes back.

---

## Steps that will not roll

Six places where a chance is not published anywhere we would take it from. None of them is guessed.

| Step | What is missing | What the bench does |
|---|---|---|
| Vaal Orb | the game says the item is modified unpredictably; no source publishes what each outcome's chance is | shows the outcomes the game can give on this item and asks which one to practise |
| Desecration (bones) | which Desecrated modifiers are offered, and how often | offers the choice the game offers and lets the player take one; the pool is the game's own list |
| Omen of Catalysing Exaltation | how much catalyst quality moves the weights, in PoE2 | refuses, and says the only figures are from PoE1 · [decision 6](#6-catalysing-exaltation) |
| Omen of Sanctification | the multiplier curve 0.5.0 replaced the old randomisation with | refuses, and shows the 0.5.0 line · [decision 9](#9-the-sanctification-curve) |
| Omen of Putrefaction | which of two current, disagreeing lines the game is running | refuses, and shows both lines · [decision 10](#10-putrefaction-against-the-one-desecrated-cap) |
| A pool nobody has measured | the weights | rolls evenly, with the line on the card and no shares anywhere |

The last row is the odd one out, and that is the owner's ruling: unknown weights never stop a player crafting,
they only change what the card says. Everywhere else, a step we cannot roll correctly refuses rather than
invents — and the first two refuse into a choice, so the player still practises the craft, just without a
number nobody has.

---

## Weights we do not have

Of 10,634 modifier entries across every pool on the site, 9,703 carry a measured number. The rest:

| Kind of item | Bases | Entries with no number | What the bench does |
|---|---|---|---|
| Jewel | 8 | 692 (all of them, 8 pools) | rolls evenly, says so |
| Charm | 12 | 51 (all of them) | rolls evenly, says so |
| Life Flask | 9 | 57 (all of them) | rolls evenly, says so |
| Mana Flask | 9 | 52 (all of them) | rolls evenly, says so |
| Body Armour, the Grasping Mail pool | 4 | 79 of 407 | rolls the whole pool evenly, says so with the count |

Every other kind of item — 27 of 31 — rolls on measured weights for every base.

**Why those four are empty.** Craft of Exile measure weights with recombinators. Charms, jewels, flasks,
tablets and waystones cannot be recombined, so for those they infer a distribution from trade listings and
normalise it instead; the tables that come out of it are flat — every weight in them is 1, their marker for
"can roll, not measured". `tools/craftweights.py` drops a flat table on that ground, because a flat table
says nothing. The 79 in the Grasping Mail pool are the same 1: modifiers that base can roll which their
measurement has not covered.

**A flat table is not the same as an even one.** Before rolling those pools evenly we went looking for anything
that would make evenness a fact rather than a fallback. Five places, checked 23 Sep 2026:

| Where we looked | What it says | Does it confirm even? |
|---|---|---|
| The game export's own field | every `spawn_weight` in the export is 1 or 0 (`tools/craft.py`, `weight()` and `scale()`, which prints the set of values on every build) | **No.** 1 means *can roll*. The field carries no rate at all, for any kind of item — including the 27 kinds we do have measured numbers for, where the real rates are plainly not equal |
| poe2db, `/us/weightings` | *"Weight information cannot be obtained from game file"*, and for *"bases that cannot be recombined, such as Charms, Jewels, Tablets and Waystones"* the numbers come *"from parsing trade-site listings"* | **No**, and it makes no evenness claim about any kind of item |
| Craft of Exile, `/weightings` | the same method, then *"a normalization script is applied to apply breakpoints to the weighting numbers and create familiar curves"*, so as to *"give a rough idea of which modifiers and tiers are rarer or more common"*, with the bias toward desirable modifiers called out | **No — the opposite.** The one source that has looked says these pools have rarer and commoner modifiers; it just cannot measure which |
| GGG | a player asked this exact question on the official forum in Jun 2026 (*"Do Jewel Modifiers have weight too?"*, thread 3967602). No GGG reply in the thread, and no statement anywhere else we found | **No** |
| The wiki (poe2wiki.net) | the modifier list pages answer with an Anubis bot check, not content | **Unverified — not read.** A search engine's summary of a page is not a read of it, and nothing from it is used here |

So evenness is not confirmed, and the best-informed source positively expects these pools to be uneven. That
settles it the way the owner ruled: unknown weights do not stop a player crafting, they change what the card
says. The bench rolls the pool evenly so that every modifier the base can roll can come up, and the card says in
one line that this is a fallback and not the game.

Which also means the line has to be the *only* thing that distinguishes them, and it has to be impossible to
miss — hence [the shares rule](#measured-or-even): an even pool prints no share anywhere, on any row.

---

## What we need and do not have

Everything the bench cannot do today, why, and where the answer would come from if it ever exists. Nothing in
this table is estimated in the meantime; each row is either a refusal or the even fallback, and each one says so
on the card.

| What we need | Who would have it | What we do instead | What would close it |
|---|---|---|---|
| Real spawn weights, for every kind of item | the game files. The export's `spawn_weights` field is already the right shape — it just holds 1 and 0 | the measured numbers from Craft of Exile for 27 of 31 kinds; the even fallback for the other 4 | GGG shipping numbers in that field. `tools/craft.py`'s `scale()` prints **REAL WEIGHTS** on the build it happens, and the borrowed table is dropped the same day |
| Weights for jewels, charms, life flasks, mana flasks and the Grasping Mail pool | nobody. They cannot be recombined, and Craft of Exile's trade-listing numbers for them are normalised approximations by their own account, which is why our pull reads their table as flat | roll evenly, say so on the card ([above](#weights-we-do-not-have)) | either real weights in the export, or a measurement someone can show their working for. A normalised approximation is not enough to print as a share |
| What a Vaal Orb can do, and how often | the game. *"Modifies an item unpredictably"* is the whole published statement | list the outcomes the item can take and let the player pick one to practise | a published outcome table. The pool of corruption modifiers we already have (`pools[].c`); it is the odds that are missing |
| How often each Desecrated modifier is offered | nobody. The pool is in the files (`pools[].d`); the reveal's odds are not | offer the choice, let the player take one | a measurement of the reveal, or the numbers in the export |
| The Catalysing Exaltation multiplier for PoE2 | GGG. A PoE1 figure exists and is not transferable | refuse the omen ([decision 6](#6-catalysing-exaltation)) | a PoE2 number from GGG, or a measurement with its method shown |
| The Sanctification curve after 0.5.0 | GGG. 0.5.0 said Sanctify *"multiplies each modifier value based on the current value"* and stopped there | refuse the omen ([decision 9](#9-the-sanctification-curve)) | the multiplier, or the curve. Note that any source still printing 78–122% is describing the behaviour 0.5.0 replaced |
| Whether Putrefaction survives the one-Desecrated cap | GGG. Its line and the 0.5.0 cap both stand and disagree | refuse the omen and show both lines ([decision 10](#10-putrefaction-against-the-one-desecrated-cap)) | one patch note settling it either way |
| Which essence tier corrupts into a Corrupted Essence, and with what odds | GGG | do not simulate it; offer the corrupted essences as inputs ([decision 4](#4-corrupted-essences)) | a published recipe and its odds |
| Whether an item level gates an essence tier | GGG, or the essence's own item data | do not gate, and say the bench may be the more generous of the two ([decision 3](#3-item-level-and-the-essence-tiers)) | a requirement in the export, the way `orbs[].up` carries the orb floors |
| Whether a "type" for the Homogenising omens is the tag, and whether tags are weighted by count | GGG | read it as the tag, pick evenly among the item's tags, say both halves on the card ([decision 5](#5-what-same-type-means)) | a definition, or a measurement of which tag comes up |
| The tie-break when Whittling finds two modifiers at the same level | GGG | draw evenly among the tied and say how many tied ([decision 7](#7-which-level-whittling-compares)) | a stated rule |

**The pattern.** Nine of the eleven rows are a number GGG has not published, and for a number the answer is
always the same: refuse, and show the line that is missing. The two that are not numbers — the even fallback,
and the readings behind decisions 3, 5, 7 and 8 — are rules, and for a rule the bench takes the smallest reading
and prints what it took. The player is never told a chance we do not have, and never blocked from practising by
a gap that is only a rule.

---

## What we took from Craft of Exile, and what we did not

The owner asked for their PoE1 simulator as the reference for the build. It is one client-side bundle with
its data in a few JSON files, so what it does can be read. Read on 22 Sep 2026: `craftofexile.com/faq`,
`craftofexile.com/weightings?game=poe2`, their app bundle and the first page of their data file. There is
no `robots.txt` on the host — every path answers with the app page — and `tools/craftweights.py` already
reads the same files once per patch, with our own User-Agent.

**Taken.**

- One pool entry per modifier *and tier*, each with its own weight, so the tier falls out of the same draw
  instead of being a second roll. Our data is already shaped that way.
- Weights kept per base, not per kind of item: two bases of one class can roll the same modifier at
  different rates. Our pools are keyed by the base's tag set and their item class for the same reason.
- Exclusion checked before the draw, not after: the group list, the affix caps and the item level all
  narrow the pool, so every entry left is one the item can actually take.
- Rebuilding the pool between every pick of a multi-modifier step.
- Saying where the numbers come from at all. Their weightings page is more forthcoming than most, and it is
  what let `tools/craftweights.py` be written with the method named on our own card.

**Not taken.**

- **Weights shipped as bare integers with no provenance.** Their tier record carries a level, a weight and
  the value ranges — no field for how the weight was arrived at, whether it was measured or inferred from
  trade listings, or how big the sample was. A number they measured and a number they extrapolated look
  identical in the simulator. We keep the two apart: a weight their table does not carry is a 1, our build
  drops it, and the pool it belongs to says on the card that it rolls evenly.
- **Multipliers standing in for unmeasured rules.** Their catalyst model is one percent of weight per point
  of quality to a cap of twenty; for annulment every eligible modifier is given a weight of a thousand
  first; an effect that favours higher tiers drops the bottom half of the tier list by count; one mechanic
  uses ninety times in the calculator and ten times in the simulator. Each is a guess doing the work of a
  rule. We have no measured number for catalyst quality, so the Omen of Catalysing Exaltation does not
  roll — it says the number is not published, and nothing about it is estimated.
- **Their integer draw.** They draw an integer in `1 .. total - 1`, so the last weight point of the pool is
  unreachable and a last entry with a weight of one can never come up. We draw a float in `[0, total)` and
  the check measures the result, last entry included.
- **A minimum modifier level that quietly falls back.** When a Greater or Perfect orb's floor would empty
  the pool they keep the last tier anyway so the roll always succeeds. We refuse the step and say why: an
  orb that cannot roll on this item is a thing worth knowing at the bench.
- **Tag checks written as truthiness over a joined string.** One of theirs reads inverted — it flags a
  clash when the tag is *absent*. We use the group numbers the game's own files carry, as sets.
- **A chance reported per hit.** After a roll they report the weight of the tier that came up and the ones
  after it in pool order, called the chance of that hit. We report no chance after a roll at all.
- **An unseeded generator.** Theirs is the browser's; ours is seeded and kept with the run, so a run can be
  replayed and the distribution can be regression-tested.
- **Cost, and the reciprocal of a chance.** Their calculator shows "1 in N" and a cost per attempt from a
  price feed. Ours shows neither, in any form.

---

## The check

`node tools/dev/simcheck.mjs` — the engine above, against the committed data, with a seeded generator.

- **shares** — one table per class: every modifier the base can roll at that item level, its weight, the
  share the bench card would print beside it, the share the weights say it should take, the share it took over
  250,000 rolls, and the gap in percentage points and in standard deviations. Two classes with measured
  weights and one without, so both paths are covered. It fails if any one modifier is more than five standard
  deviations out, or if the pool as a whole strays by more than five on chi-square over its degrees of freedom.
- **guards** — twelve of them, one per rule the engine must never break:

| # | What it proves |
|---|---|
| 1 | a full side never gains another modifier, and a full item refuses instead of doing nothing quietly |
| 2 | nothing above the item level is ever reached, and an orb whose floor the item level cannot reach refuses |
| 3 | 10,000 items rolled to six modifiers never repeat a modifier or a group |
| 4 | a class with no weights takes the even path, every candidate at the same weight, the line on the card, and **no share on any row** — while a measured class prints its shares and the running card prints none |
| 5 | the five steps whose whole effect is an unpublished number all refuse, each with its own reason |
| 6 | every omen in `data/craft.json` sits in exactly one of the four groups, nothing is named here that the game does not have, and none of the six the game removed can craft |
| 7 | a currency the item state does not take refuses, in the game's own words |
| 8 | every rolled number lands inside the range the game prints, both ends included |
| 9 | [decision 2](#2-an-essence-against-a-rare-that-is-not-ready-for-it): an essence runs on a part-filled Rare, refuses when its modifier is already there, refuses into a full side, and leaves the item untouched when it refuses |
| 10 | [decision 7](#7-which-level-whittling-compares): Whittling always takes a modifier at the lowest level on the item, and says how many tied |
| 11 | [decision 5](#5-what-same-type-means): Homogenising only ever adds a modifier sharing a tag with one already there, and refuses on an item with nothing to match |
| 12 | [decision 11](#11-an-omen-on-a-corrupted-item): no omen grants its currency a permission it lacks — all fourteen refuse on a corrupted item, which is left untouched |

Guard 6 is the one that will fail first: it breaks on the next patch that adds an omen, which is exactly when
this file needs reading again.

It writes nothing and touches no network. `--rolls`, `--seed`, `--quiet` and `--craft` are the only switches.
