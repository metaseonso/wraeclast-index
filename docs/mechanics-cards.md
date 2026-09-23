# Mechanics cards: the full set

What a mechanics card is: our own card, kind `h`, declared in `tools/mechanics.py`. Not game text, so it
names its source on the card itself. Nine are live.

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
| **How defences work** | In what order does a hit I take get stopped or cut down, and how much armour is enough? | Game glossary for every step; Path of Building for the order, the armour curve and the caps | yes |
| **Resistances and the maximum** | How much resistance is enough? | Game glossary | yes |
| **Where a modifier lands in a stat** | My mod says added to total / converted / gained as — does it get my increases? | Game glossary | yes |
| **Damage over time** | Why do none of my hit modifiers help my Ignite? | Game glossary | yes |
| **Attack Speed** | What does faster actually multiply, and how fast can I get? | Game glossary for where an Attack's base time comes from, what Skill Speed stacks with, the fixed part of a use time and how Slows multiply; Path of Building for the order, the rounding, the reload and the cap | yes |

The order on the defences card is the order the code runs, which is not the order this page first listed:
evade, block, then armour and resistances on the damage, then Energy Shield, then Mana under Mind Over
Matter, then Life. `CalcDefence.lua` cuts the raw damage down in `takenHitFromDamage()` (armour and
resistance are two multipliers on it, so neither is before the other) and only then hands what is left to the
pools in `reducePoolsByDamage()`, energy shield first. Energy Shield and Mind over Matter do not sit before
armour.

## Worth building, in order of value to a player

**1. Chance over 100%** — Is 150% chance to do a thing worth anything? The game has two entries that give
opposite answers — "Chance can Surpass 100%" (it happens twice, then rolls for a third) and "Chances in
excess of 100%" (it is the same as 100%) — and which one applies is a property of the stat. Official game
files. **Buildable today**, and case 3 of the test in its purest form.

**2. Ailments: what sets the magnitude** — What makes my Ignite, Shock or Freeze bigger? Official entries
give the rules (which damage type feeds which ailment, what Damage Contributing to Ailments changes,
buildup against threshold) but not the magnitude formulas. Path of Building has those.
**Buildable today**, with Path of Building named for the formulas.

**3. Critical Hits, in full** — What does crit actually multiply, and what is my real crit chance? The game
gives the default (+100%), a worked example of increased crit chance, and separate entries for Bifurcated
and Inevitable Critical Hits and for Rerolling Critical Hit Chance. Mostly official; the attack-vs-spell base
and the order against the more multipliers come from Path of Building. **Buildable today.** Goes deeper than
the crit step on the damage card.

**4. Stun and Heavy Stun** — Why do I keep getting stunlocked? Official entries exist for Stun, Heavy Stun,
Light Stun, Player Stun Threshold and Primed for Stun, and they carry some numbers but not the buildup
maths. Path of Building has part of it. **Buildable today**, with the gap named on the card rather than
filled in.

**5. Duration** — Read on 170 cards, more than any other phrase with nowhere to go. The game has no entry
for Duration at all: each thing that has one states its own seconds and nothing says what an increase does
to them, which is case 1 of the test. `CalcOffence.lua` settles it — every increase and more to Duration,
Primary Duration and Damaging Ailment Duration in one modifier, then
`m_ceil(output.Duration * data.misc.ServerTickRate) / data.misc.ServerTickRate`: a duration is rounded **up**
to a whole server tick, which is the breakpoint. **Buildable today**, Path of Building named. Building it
also answers Skill Effect Duration, Charge Duration, Minion Duration, Curse Duration, Endurance and Frenzy
Charge Duration, Hazard Duration and Warcry Cooldown, which are 74 more lines with nowhere to go.

**6. Area of Effect** — Read on 116 cards. Two official entries exist and neither is the mechanic: Area of
Effect Skills says what an area skill is, and Presence says Presence Area modifiers are not Skill Area
modifiers. What an increase does is `CalcOffence.lua`'s `calcRadius()` —
`radiusPercent = m_floor(100 * m_sqrt(areaMod))`: the modifiers scale the **area**, and the radius is its
square root, floored, so the radius moves in steps and small increases do nothing at all. Path of Building
computes the next step itself (`calcRadiusBreakpoints()`). **Buildable today**, Path of Building named.
Answers Attack Area, Attack Area Damage, Spell Area Damage, Hazard Area and Grenade Area with it.

**7. Cast Speed** — Read on 82 cards, and the same shape as Attack Speed: the same line of `CalcOffence.lua`
divides the same base time by the same rounded multiplier, against the same cap. What differs is the base —
a Spell's own use time off the skill, never a Weapon's — and the official Spells entry that says so. The
open question is whether that earns a card or restates the Attack Speed one: seven of its ten lines would be
the same sentence. **Buildable today**; worth a decision before it is built.

## Considered and not worth a card

- **Requirements: what a gem asks of you** — the site has the verified formula from the official files, but
  the gem card already shows the answer for the gem in front of you. A card would repeat it.
- **What a rare can roll** — the pool is official; **how often** a mod rolls is in no source. The official
  export states every weight as 1 or 0, and poe2db says outright that weight information cannot be obtained
  from the game files. **Not buildable**, and it should stay unbuilt rather than carry a guess.
- **Armour against one big hit** — real gap, and it sits inside How defences work, not beside it.
- **Skill Speed** — official single entry, already a keyword card, and the Attack Speed card quotes it where
  it bites. This was listed here as not worth a card while the phrase players actually read was Attack
  Speed, which had no entry and no card; that is what the Attack Speed card is.
- **Presence, Reservation, Spirit, Weapon Sets, Support Gems** — one glossary entry each, already a keyword
  card, nothing to assemble.
- **Movement Speed, Mana Regeneration, Life Regeneration, Attack Damage, Spell Damage** — read often and
  answered already: the increases sum, the more multipliers multiply, and the damage card puts the damage
  ones in order. A card would restate two cards.

## Where the next ones came from: the phrases with nowhere to go

A card's own lines name things that have cards. `tools/nodelinks.py` will not make a phrase a door where the
only cards with that name are the tree's small passives, because their name is the stat's own wording — so
"Attack Speed" sat plain while five passives answered to it. With the card built it is a door in 188 lines
on 178 cards. That rule, run over the whole index, is the list of every phrase in Attack Speed's shape.

**Ninety-four phrases, read in 1,468 lines on 1,204 cards, open nothing today.** Sorted (the per-row line
counts add up higher, because one line can hold two of them):

| | How many | Read in | What they are |
|---|---|---|---|
| A mechanic worth a card | **3** | 390 lines | Duration, Area of Effect, Cast Speed — 5, 6 and 7 above |
| Already on this list | **13** | 182 lines | Critical Damage and Ballista Critical Damage (card 3); Flammability, Chill, Shock and Parried Debuff Magnitude, Ignite, Poison, Bleeding, Shock, Ailment and Elemental Ailment Duration, Shock Chance (card 2); Projectile Stun Buildup (card 4) |
| A keyword the game defines | **35** | 419 lines | The keyword is inside the phrase and the page already marks it: Armour and Evasion, Presence Area, Mana Cost Efficiency, Charm Charges, Rage on Hit, Maximum Block, Armour Break Duration and 28 more |
| A stat, not a mechanic | **43** | 698 lines | Movement Speed, Mana Regeneration, Attack Damage, Spell Damage, Skill Effect Duration, Charge Duration, Totem Damage and 36 more. The increases sum and the more multipliers multiply, which two cards already say |

Nine of the 43 fall to the Duration card and five to Area of Effect if those are built.

## The count

**Fifteen cards are worth building: the nine that are live and six more.** The list stops there on purpose
— past the last of them every candidate is either a single glossary entry restated or a formula no source
states.

**The six to build next: Chance over 100%, Ailments: what sets the magnitude, Critical Hits in full, Stun
and Heavy Stun, Duration, Area of Effect — and Cast Speed once it is decided.** Only the first is pure
official game data; the rest need Path of Building named for the formulas the game leaves out.
