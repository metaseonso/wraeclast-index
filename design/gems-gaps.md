# Gem cards: quality, where to get it, history

For #75. poe2db shows three things on every gem page that the gem card did not
(https://poe2db.tw/us/Lightning_Arrow): "Additional Effects From Quality", where the gem comes from ("From: Uncut
Skill Gem Tier 1"), and the gem's history patch by patch. The first two are built here and on the card; the third
is a design, because its data is two other tickets' files (#137 and #138, both open) and is not copied here.

## What a player gets

Open the Lightning Arrow card:

> **Lightning Arrow** · Skill gem · Dexterity
> *its requirement pills* · **From Uncut Skill Gem (Level 1)**
> Fire a charged arrow at the target. …
> Additional Effects From Quality:
> (0-40)% more chance to Shock

The pill says which uncut gem makes it, by the game's own name for the item. An uncut gem cuts to its own level,
so the level in that name is also the lowest level the gem can be cut at: Fireball reads **From Uncut Skill Gem
(Level 3)**, Herald of Ice **From Uncut Spirit Gem (Level 4)**. A support gem has no level, and the level of its
uncut gem is the tier it offers: Brutality I reads **From Uncut Support Gem (Level 1)**. A gem no uncut gem makes (a
lineage support, a skill an item or an ascendancy grants) has no pill.

The quality lines are the game's own tooltip: its divider line (`ItemDescriptionGemQualityStatDivider` in
ClientStrings, "Additional Effects From Quality:"), then each line with the range the tooltip prints between 0 and
20% quality. A number in the line that quality does not move is the gem's own at level 20.

## The data

On the gem cards in `data/index.json`, written by `python tools/gamelib.py` (the gamelib stage, after sync) with
what `tools/gems.py` reads out of the export. Every card is set again each run.

| Field | What it is | From |
|---|---|---|
| `uc` | the uncut gem that makes it: "Uncut Skill Gem (Level 1)" | the export: the gem's `crafting_level` (skill_gems) and the uncut items themselves (base_items: "Uncut Skill Gem (Level N)", "Uncut Support Gem (Level N)", "Uncut Spirit Gem (Level N)") |
| `gq` | the divider, then what 0-20% quality adds, one line each | the export: each stat set's `quality_stats` of every skill the gem grants (skills) |

Today: 686 of the 1,072 gem cards carry `uc`, 384 carry `gq`. Five quality stats have no line anywhere in the
game's wording (a stat set repeating another set's stat keeps the words on that one; these are left out and
counted each run).

How each is read:

- **Which uncut gem.** The spirit one's own text is "Creates a Persistent Skill Gem"; the game's own table
  (SkillGems) puts every persistent gem there except the minions, which the skill one makes. So: a support gem →
  Uncut Support Gem; a persistent gem that is not a minion → Uncut Spirit Gem; any other → Uncut Skill Gem. The
  level is the first one of that sort at or over the gem's crafting level (the spirit ones start at 4). This
  agrees with the game's table on every gem.
- **The quality number.** The export stores the stat's raw value per 1% quality, times 1000, so at 20% it is the
  stored value / 50 (the same rule the drill-down's quality column uses, checked there on Boneshatter and Arc). The
  game's own display rule for the number (divide by ten, milliseconds to seconds, …) is applied; one the file does
  not know stops the build.
- **Every granted skill.** A gem's quality can sit on its second skill (Blink's is on the dodge, not the
  reservation) or on a part of it (Pounce's is on the mark). The drill-down's gem file keeps the first skill only,
  so this reads the export's skills directly.

### Checked against poe2db

The check: the gem's page on poe2db, "From: Uncut … Gem Tier N" and the first block of "Additional Effects From
Quality", on 28 Sep 2026 (patch 0.5.5).

| Gem | poe2db from | ours | poe2db quality | ours |
|---|---|---|---|---|
| Lightning Arrow | Skill Tier 1 | Uncut Skill Gem (Level 1) | (0—40)% more chance to Shock | (0-40)% more chance to Shock |
| Fireball | Skill Tier 3 | Uncut Skill Gem (Level 3) | +(0—10)% chance to fire 2 additional Projectiles | (0-10)% chance to fire 2 additional Projectiles |
| Pounce | Skill Tier 3 | Uncut Skill Gem (Level 3) | Marked target takes (0—1)% increased damage … up to (0—15)% | the same |
| Spell Totem | Skill Tier 7 | Uncut Skill Gem (Level 7) | +(0—4) seconds to Totem duration | (0-4) seconds to Totem duration |
| Cast on Critical | Spirit Tier 14 | Uncut Spirit Gem (Level 14) | (0—10)% increased Reservation Efficiency | the same |
| Brutality I | Support Tier 1 | Uncut Support Gem (Level 1) | none | none |
| Herald of Ice | Spirit Tier 4 | Uncut Spirit Gem (Level 4) | Explosion radius is (0—0.4) metres | the same |
| Raise Zombie | Skill Tier 5 | Uncut Skill Gem (Level 5) | (0—25)% increased effect of Empowerment on Raised Zombies | the same |
| Boneshatter | Skill Tier 1 | Uncut Skill Gem (Level 1) | (0—20)% increased Attack Speed | the same |
| Arc | Skill Tier 5 | Uncut Skill Gem (Level 5) | Chains +(0—2) times | Chains (0-2) times |
| Blink | Spirit Tier 8 | Uncut Spirit Gem (Level 8) | (0—10)% increased Cooldown Recovery Rate | the same |
| Skeletal Reaver | Skill Tier 9 | Uncut Skill Gem (Level 9) | Minions have (0—20)% increased effect of Rage | the same |
| Blasphemy | Spirit Tier 8 | Uncut Spirit Gem (Level 8) | (0—10)% increased Reservation Efficiency | the same |

13 of 13 on where it comes from, 13 of 13 on the numbers. Two differences, both named here and not fixed yet:

1. **The plus sign.** Where the game's stat wording prints a sign ("Chains +2 times"), poe2db keeps it and we drop
   it: the export's quality wording leaves the number's format out. Reading the format off the gem stat
   descriptions (`stat_translations/active_skill_gem_stat_descriptions` and the per-skill files) would put it
   back.
2. **A second quality line.** poe2db draws a second block under the first (`secondaryQualityMod`: Lightning Arrow
   "(0—30)% chance for Lightning Damage with Hits to be Lucky"). That is the game's own table
   GrantedEffectQualityStats, columns `AltStats` and `AltStatValuesPermille`; the export does not carry it. It
   needs that table (`tools/gamepull.py dat()`) and the wording of those stats from the per-skill stat
   descriptions. Not done: a line with no wording is worse than no line.

## In frame terms

Procedure (b), step 1 both times: a field that already draws the shape, with its own `at` and `pre`. Declared in
`assets/kinds.js`, schema written again (`node tools/dev/schema.mjs --write`). No renderer, no card code.

```js
cutfrom:  {type: 'text', at: 'uc', slot: 'pill', pre: 'From '},
quality:  {type: 'rich', at: 'gq', slot: 'body'},
// the gem kind: [...HEAD, 'gemreq', 'lineage', 'cutfrom', 'usetime', 'cost', 'spirit', ...SAYS, 'quality', ...REST, ...FOOT]
```

- **Pill.** One more pill on a gem that an uncut gem makes, inside the cap of 6.
- **Body.** The quality lines are a list like the gem's own lines: 4 in the grid and a `+N more` row, all of them
  in the popup. The widest has 6 lines under the divider.
- **No source line.** Both are the game's own words and numbers. The poe2db check is how they were verified, not
  where they come from, so the card does not name it.

## History: design only

A gem's history is two things, kept by two tickets, and read where they are kept:

| What | File (the ticket that writes it) | Key on the gem card |
|---|---|---|
| the numbers a patch moved | `data/changes/<patch>.json`, `cards` (#73, PR #137) | `g:` + the card's id: `g:SkillGemLightningArrow` |
| GGG's own patch-note lines | `data/patchnotes.json`, `on` (#86, PR #138) | `g:` + the card's name: `g:Lightning Arrow` |

Nothing of either is copied here. Once both are on main:

- **The words** are #138's proposed `changed` field (`design/patch-notes.md`): `type: 'changed', at: 'n', file:
  'data/patchnotes.json'`, which every kind carries. Nothing more for gems.
- **The numbers** need one more field of the same shape, reading #137's files: per patch, the rows under the card's
  key, each `[where, before, after]` ("Level 20", "58% increased Damage", "87% increased Damage"). A patch per
  file means a popup would fetch one file per patch to find the ones that name this gem, so #137 should also write
  one roll-up, `data/changes/index.json`: card key → the patches that changed it. Then the field fetches the
  roll-up and only the patches it names. Proposed:

  ```js
  moved:    {type: 'moved', at: 'id', slot: 'body', file: 'data/changes/index.json', label: 'Changed in', src: 'the official game files'},
  ```

  `TYPE.moved` (new, in `assets/app.js`) draws a patch heading and its rows, newest first, in the popup only
  (like `adds`), and merges its patches with `changed`'s so one patch is one heading with GGG's line under the
  numbers. Where #138's line and #137's numbers disagree, both show: GGG's words are what GGG said, the numbers are
  what the files hold.
- **Labels.** A patch whose league has not started yet wears `Subject to change` (tooltip: *Depends on GGG. May
  change without notice.*), the rule #138 already sets. The block ends with `Source: GGG patch notes` for the
  words and `Source: the official game files` for the numbers.
- **Done when** (#75): Lightning Arrow's card shows at least the last patch's change. In #137's files the last
  patch that moved Lightning Arrow is 0.4.0 (0.5.0 to 0.5.5 did not); 0.5.5 moved four gems.

## Open questions for the owner

1. The pill reads the game's item name, "From Uncut Skill Gem (Level 1)". poe2db calls the same thing "Tier 1".
   Keep the game's name, or add the word Tier?
2. A roll-up for #137 (`data/changes/index.json`), or one file per kind as #138 offers (`@k`)?
