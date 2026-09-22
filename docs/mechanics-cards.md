# Mechanics cards: the full set

What a mechanics card is: our own card, kind `h`, declared in `tools/mechanics.py`. Not game text, so it
names its source on the card itself. Four are live.

## The test a card has to pass

The game ships a glossary of 437 entries, and every one of them is already a keyword card on the site with
the game's own text on it. So a mechanics card only earns its place where one of these is true:

1. **The game has no entry at all.** Increased, reduced, more and less are the case that started this: the
   behaviour decides every number on the site and the glossary does not mention it.
2. **The game has the pieces and never puts them in order.** Conversion, crit, armour and resistances each
   have an entry; nothing in the game says what happens in which order. That is the damage card.
3. **Two entries disagree, or one contradicts what the code does.** Worth a card precisely because a player
   reading one entry gets it wrong.

A single glossary entry restated is not a mechanics card — the keyword card already is one. Presence,
Reservation, Weapon Sets and Support Gems were all considered and dropped on that ground.

## Live now

| Card | The one thing it answers | Numbers from | Built |
|---|---|---|---|
| **How damage works** | In what order is a hit worked out, and how is conversion different from extra damage? | Game glossary for every step and for which modifiers converted and gained damage scale with; Path of Building for the order, the conversion chain and the caps | yes |
| **Increased and reduced** | Why did my next 20% increased do almost nothing? | Path of Building | yes |
| **More and less** | Why is 40% less worse than 40% reduced? | Path of Building | yes |
| **Added damage** | Is a flat roll or an increase worth more to me? | Path of Building | yes |

## Worth building, in order of value to a player

**1. How defences work** — In what order does a hit I take get stopped or cut down, and how much armour is
enough? The mirror of the damage card, same flowchart: Evade, Block, Energy Shield and Mind over Matter,
Armour, Resistances, Life. Game glossary has an entry for each step, and states that armour is "more
effective at reducing smaller hits" without ever giving the curve; Path of Building's `CalcDefence.lua` has
the curve and the order. **Buildable today.**

**2. Resistances and the maximum** — How much resistance do I actually need? Assembles five entries the game
keeps apart: Resistances, Maximum Resistances (75% default, 90% hard ceiling), Resistance Penetration
(applies to the target, so it does nothing for ailments), Ignoring Resistances, and the fact that the game
lowers your resistances as you progress. All official game files. **Buildable today**, and the cheapest high
-value card on this list.

**3. Where a modifier lands in a stat** — My mod says added to total / converted / gained as — does it get my
increases? Generalises the three stacking cards from damage to every stat. Official entries cover it
outright: Adding to Stat Totals ("occurs after all other calculations", so no percentage modifiers apply),
Stat Totals, Stat Conversion and Gaining Stats from other Stats (both: the portion scales with the
destination stat's modifiers, not the source's), and Maximum. All official game files. **Buildable today.**

**4. Damage over time** — Why do none of my hit modifiers help my Ignite? The exclusions are stated in
official text and scattered across four entries: damage over time cannot be converted, cannot benefit from
damage Gain, is not Hit damage, and a damaging ailment from a hit takes its damage from that hit and then
gets no further damage modifiers. Official game files. **Buildable today.**

**5. Chance over 100%** — Is 150% chance to do a thing worth anything? The game has two entries that give
opposite answers — "Chance can Surpass 100%" (it happens twice, then rolls for a third) and "Chances in
excess of 100%" (it is the same as 100%) — and which one applies is a property of the stat. Official game
files. **Buildable today**, and case 3 of the test in its purest form.

**6. Ailments: what sets the magnitude** — What makes my Ignite, Shock or Freeze bigger? Official entries
give the rules (which damage type feeds which ailment, what Damage Contributing to Ailments changes,
buildup against threshold) but not the magnitude formulas. Path of Building has those.
**Buildable today**, with Path of Building named for the formulas.

**7. Critical Hits, in full** — What does crit actually multiply, and what is my real crit chance? The game
gives the default (+100%), a worked example of increased crit chance, and separate entries for Bifurcated
and Inevitable Critical Hits and for Rerolling Critical Hit Chance. Mostly official; the attack-vs-spell base
and the order against the more multipliers come from Path of Building. **Buildable today.** Goes deeper than
the crit step on the damage card.

**8. Stun and Heavy Stun** — Why do I keep getting stunlocked? Official entries exist for Stun, Heavy Stun,
Light Stun, Player Stun Threshold and Primed for Stun, and they carry some numbers but not the buildup
maths. Path of Building has part of it. **Buildable today**, with the gap named on the card rather than
filled in.

## Considered and not worth a card

- **Requirements: what a gem asks of you** — the site has the verified formula from the official files, but
  the gem card already shows the answer for the gem in front of you. A card would repeat it.
- **What a rare can roll** — the pool is official; **how often** a mod rolls is in no source. The official
  export states every weight as 1 or 0, and poe2db says outright that weight information cannot be obtained
  from the game files. **Not buildable**, and it should stay unbuilt rather than carry a guess.
- **Armour against one big hit** — real gap, but it belongs inside card 1, not beside it.
- **Skill speed** — official single entry; the interesting half is the increased/more cards, which exist.
- **Presence, Reservation, Spirit, Weapon Sets, Support Gems** — one glossary entry each, already a keyword
  card, nothing to assemble.

## The count

**Twelve cards are worth building: the four that are live and eight more.** The list stops there on purpose
— past card 8 every candidate is either a single glossary entry restated or a formula no source states.

**The five to build next, in order: How defences work, Resistances and the maximum, Where a modifier lands
in a stat, Damage over time, Chance over 100%.** Four of those five are pure official game data and need no
outside source at all.
