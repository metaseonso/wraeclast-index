# The data going on the site: what is settled

The design docs in `design/` were written one at a time and ask for some of the same names. This settles each
clash once, so work on them can run side by side (docs/concert.md). Where this and a design doc disagree, this
wins; the design doc still says what each thing shows.

## Card letters (assets/kinds.js KINDS `k`)

Taken today: a b c d f g h i n p q t u w x y.

| Letter | Kind | Design doc | Section in the index (INDEX) |
|---|---|---|---|
| `r` | Area | areas.md (#72) | World |
| `j` | Quest | quests.md (#76) | World |
| `v` | Act | quests.md | World (no page of its own: its cards group the areas and quests) |
| `z` | Achievement | achievements.md (#91), which asked for `y` (Ascendancy's) | World |
| `l` | Trial modifier | trials.md (#82), which asked for `r` | Endgame |
| `m` | Rare monster modifier | monster-mods.md (#112) | Mechanics |
| `o` | Rune | runes.md (#113) | Items |
| `s` | Odds pool | hidden-odds.md (#110) | Endgame |

A Jewel kind (gems-gaps.md) is not made for 1.0.

The index gains one section, **World** (Areas, Quests, Achievements), between Passives and Mechanics.

## Field names (assets/kinds.js FIELDS)

| Name | What it is | Replaces |
|---|---|---|
| `steps` | a number pill: how many steps a modifier has (monster mods, trial mods) | — |
| `goals` | an achievement's list of steps, each with where it is | achievements.md's `steps` |
| `changed` | the body block: what each patch changed on this card, in GGG's words (patchnotes.json) | — |
| `treechg` | the pills on a passive: new in, changed in, was named (treechanges) | tree-diff.md's `changed` pill |
| `respen` | the resistance penalty at an area's level, one number fact | areas.md `resist` and rules-gold.md `respen` |
| `hidden` | an area's lines the game does not show; atlas-content.md's hidden mods join the same list | — |

## Framework, once for all

- `rich` takes a `label` (the words above the lines): areas, tree changes, quests, monster mods, trials.
- "Subject to change" is a `note` on `flag`, never a type of its own (trials.md's `label` type is dropped).
- A kind whose rows come from a file of its own (the Odds pool) declares `rows: 'data/<file>.json'`.

## Decisions the docs left open, taken for 1.0

- Patch notes on cards: one file (patchnotes.json), fetched the first time a card asks; the popup shows 8 patches,
  then "See all".
- Gem tiers read "Level N", the game's own word.
- Market numbers stay version 1 (the owner, 28 Sep); every threshold is reviewed after the first week.
- Everything the game files leave unsure carries the "Subject to change" note, never a guess.
