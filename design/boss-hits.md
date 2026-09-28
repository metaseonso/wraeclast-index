# Boss hits: the card's hits table, its working, and "you take about Y"

Design for #80 (monster stats and boss hits) and #126 (boss fight cards), in the terms of `docs/frame.md` and
#96 W5 ("worked-out numbers show their working"). Data and tools only in this change: nothing here is drawn
yet. The owner reworks the front end for 1.0, and this is what the rework can draw from.

## What ships

`data/bosshits.json`, written by `tools/bosshits.py`. 66.7 kB on disk, 14 kB gzipped. Not in first paint:
a boss card fetches it the first time it opens (W6).

| Part | What | Label |
|---|---|---|
| `levels` | per area level 1–100: a normal monster's life, damage, accuracy, armour, evasion, and the resistance step | none: game files (DefaultMonsterStats, the same numbers as `data/gamestats.json`) |
| `tiers` | waystone tier → area level, 1 → 65 … 16 → 80 | none: game files (MapTiers) |
| `bosses[]` | 104 of the 104 bosses in `data/bosses.json`, each joined to one monster in the game files | see below |
| `calc` | every formula, every input, and where each input comes from | the working itself |
| `keys` | what each short key in a hit means | – |

Per boss: `lv` (the level of its lowest area), `lifePct`, `damagePct`, `atk` (attack time), `spread` are the
game's (no label). `life`, `armour`, `evasion`, `res` at `lv` and every hit are **Estimate**. A hit at another
waystone tier is **Subject to change** (the tier bonus tables ship as zeros).

Per hit: `n` name, `k` kind (attack, spell, damage over time), `t` main damage type, `d` damage by type where
there is more than one, `h` the hit `[min, max]` at the boss's level, `cd` cooldown, `cm` the cooldown is the
one of the move that sets the hit off, `ct` cast or attack time, `x` cannot be evaded, blocked or dodged, `w` the
working. Four hits a boss: the biggest, then the biggest of each other damage type, then the next biggest.

### Run it

```
python tools/pipeline.py --only bosshits   # a patch stage, after bosses; the pipeline holds it to the last good rule
python tools/bosshits.py --report          # say what it would write, write nothing
```

The tables (MonsterVarieties, MonsterTypes, MonsterResistances, GrantedEffects, GrantedEffectsPerLevel,
GrantedEffectStatSets, GrantedEffectStatSetsPerLevel, ActiveSkills, ActiveSkillType, Stats, Mods,
DefaultMonsterStats, MapTiers, WorldAreas, GameConstants) come from `tools/gamepull.py` `dat()`, which runs
`tools/datpull.mjs --raw` against GGG's CDN (no token; kept in `tools/cache/dat-<CDN folder>/`). `--raw <dir>`
reads `<Table>.json` files from a folder instead. Fewer than 50 bosses joined, or a collapse against the last good
copy, and the old file stays. `data/bosshits.json` lists its own `ids` (none), and `tools/lastgood.py`
`own_ids()` fails a file where an internal id slipped into a field.

### Declarations (assets/kinds.js)

None in this change. The Boss kind draws its card in its own module (`assets/bosses.js`), and no renderer in
`assets/app.js` draws a `hits` table or a `calc` working yet, so a field declared for them would declare
something nothing draws. The `hits` field type and the generic `calc` popup below stay proposals here until the
renderer that draws them lands; that change adds the declarations to `assets/kinds.js` and runs
`node tools/dev/schema.mjs --write`.

## The formula, and what it was checked against

| Part | Formula | poe2db | Path of Building (PoE2) |
|---|---|---|---|
| level damage | DefaultMonsterStats.Damage at the level | its "Damage" = this × boss damage, every level shown | `data.monsterDamageTable` is the same table |
| attack | level damage × boss damage % × (100 + BaseMultiplier/100) % ± damage spread | **matches** every "Base Damage" and "Attack Damage" it prints | the switched-off boss export does the same (its "old method") |
| spell | 3.885209 × effectiveness × (1 + incremental × (L−1)) × (1 + damage incremental)^(L−1) × base value | **matches** every "Deals X to Y" it prints | **same formula**, `src/Modules/CalcTools.lua` |
| boss damage on spells | not applied | poe2db prints spells without it | the boss export leaves it off (commented out) |
| unique rarity | 65% damage, 2,900% life (Mods: MonsterUnique5, MonsterUnique2) | **left out** ("does not include monster rarity bonuses") | the boss export applies the damage one |
| life | level life × boss life % × unique rarity | matches without rarity (Arbiter of Ash, 74: 147,381) | – |
| armour | level armour × (1 + type armour %) | matches (Arbiter of Ash: 4,099) | – |
| resistance | the type's resistance sets at the level's step (1: 1–45, 2: 46–67, 3: 68+) | matches the Arbiter of Ash (45% fire, −15% cold at 74) and the campaign King in the Mists (60% chaos at 80); a second column (the table's fifth) is not read and its meaning is not known | – |
| accuracy | not modelled on the boss | prints twice the level's accuracy for every boss checked | – |

Checked: 639 values poe2db prints for six bosses (The Arbiter of Ash, The Arbiter of Divinity, Vessel of
Kulemak, The Black Crow, Count Geonor, The King in the Mists), at every level each page shows (11 to 80),
0 differences once unique rarity is left out. poe2wiki could not be read (the site and web.archive.org both
refused the request), so it is not a source here.

**Not verified, so labelled Subject to change:** whether a boss's damage multiplier also applies to its spells
(it would make spells 1.5× to 5.3× bigger, the range of boss damage multipliers), whether unique rarity applies (35% less), and any hidden per-tier
bonus the server adds. poe2db's own note says it leaves out map modifiers and rarity; Path of Building's boss
export is switched off ("temporarily disabled due to issues with game files"). Measuring one hit in game, at a
known level with known defences, would settle all three.

## The card: the hits table

A new field type, `hits`, in the **body** slot (docs/frame.md, move 2). One block. Its list keeps to the body's
list rule: 4 rows in the grid, which is exactly what the file holds, so nothing is cut; the popup draws the same.

```
Big hits                                           Estimate ⓘ
 Hit                    Type        At level 74      Cooldown
 Flame seed donut nuke  Fire        11,900–17,850    60 s ·   Cannot be evaded
 Bullet hell damage high Fire       11,900–17,850    55 s ·   Cannot be evaded
 Chasm slam             Physical    1,309–1,963      –        (Physical 916–1,374, Fire 393–589)
 Sword slam             Physical    851–1,276        22.5 s
```

* **Label:** `Estimate` on the block, drawn by the frame (W5 label field). Its tooltip lists the inputs.
* **Size:** `h` as `min–max`, grouped by thousands. A hit with more than one type shows `d` under it.
* **Cooldown:** `cd` in seconds; with `cm`, the cooldown is the move's and the tooltip says "the move that sets
  this off". No cooldown: `–`.
* **Marks:** `x` draws the game's words, "Cannot be evaded, blocked or dodged".
* **Names:** the game gives almost no monster skill a name. `g` marks the few it does ("Basic Attack"); the
  rest are worded from the skill's file name and carry `Source: game file name` in the row's tooltip until
  #126 fills the names and tells players use, each with its own `Source: X`.
* **Tier (map bosses):** a pill `Tier 1 … 16` above the table on bosses whose `lv` is 65. Picking a tier redraws
  every size and adds `Subject to change` (tooltip: "Depends on GGG. May change without notice."). Attacks
  scale by the damage row: The Black Crow's Leap slam, 1,242–1,863 at tier 1, is 1,896–2,844 at tier 15
  (× 324.19 / 212.36). Spells scale by their own formula at the new level.
* **Map modifiers (#77)** multiply in the same place once #77 has them as numbers: "+N% monster damage" is
  one more input in the working.

## The working (`calc`, W5)

One click on a size opens the working: the number, the formula, and each input with where it comes from. The
file holds all of it (`calc.<kind>.in` names the field each input is read from), so the popup is generic:
one renderer for every `calc` field, no boss named anywhere.

```
Sword slam · about 851–1,276 Physical                         Estimate
  279.68   level 74 monster damage         game files
× 450%     The Arbiter of Ash's damage     game files
× 130%     Sword slam's attack damage      game files
× 65%      unique monster                  game files · Subject to change
= 1,063.5  ± 20% damage spread             game files
Checked against: Source: poe2db (matches without the 65%), Source: Path of Building
```

```
Head fireball impact (Xesht) · about 1,651–2,477 Fire        Estimate
  3.885209 × 24 × (1 + 0.1 × 78) × 1.0175^78 = 3,175.4   level 79 spell effectiveness   game files
× 0.8–1.2  base value                                                        game files
× 65%      unique monster                                                    game files · Subject to change
Boss damage (300%) not applied to spells                                     Subject to change
```

Guard (W5): a `calc` input with no source fails. Every input in `calc.*.in` has one today.

## Area and waystone cards (step 1)

A `fact` on an area card and a waystone card, from `levels` at its area level, no label:
"Monsters here: about 24,852 life · 1,893 accuracy · 4,540 armour" (level 79, a normal monster). Rare and
unique monsters are bigger; the fact says "a normal monster" in its tooltip.

## With a pasted build: "you take about Y" (#70, #119)

`assets/maths.js` already has the pieces, from the build page: `evadeChance`, `armourCut`, `resCut`, `taken`,
`maxHit`. A hit from this file goes through them unchanged:

1. **Arrives:** a hit with `x` cannot be evaded, blocked or dodged; any other can be evaded, with the boss's
   accuracy. The boss's accuracy is not settled (poe2db prints twice the level's), so the evade chance is a
   range between the two: `range()` takes it as an unknown.
2. **Cuts:** per damage type in `d` (or `t`), `taken(raw, type, defences)`: armour against physical (armour over
   armour plus ten times the hit, 90% at most), resistance against the rest.
3. **Pools:** the sum against `maxHit`. The card says "you take about Y" and, where Y is more than life plus
   energy shield, "can kill you from full".

Every step is a `calc` input with its source ("your 75% fire resistance: your build"), so the working shows the
build's numbers next to the game's. The whole answer is an Estimate.

**Hardcore (#119):** with the Hardcore switch on, the hits table is the first block on a boss card, sorted by
what the pasted build takes, and a hit that can kill from full is marked first. Without a build, it sorts by size.

## What is left

* Hit names and tells (#126): from guides and players, each with `Source: X`.
* The three open points above; one in-game measurement settles them.
* Map modifier numbers (#77) as inputs.
* The second resistance column (the table's fifth) and boss accuracy.
* A hit whose damage sits in a skill the monster does not list itself (a projectile table, a ground effect) is
  not read yet: 413 hits kept, from the damaging skills each monster lists.
* The cooldown of a hit set off by another move is matched by name (`cm`); a hit with no match shows `–`.
