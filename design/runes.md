# Runes of Aldur: the data, and the cards proposed

The design for [#113](https://github.com/metaseonso/wraeclast-index/issues/113) (Runes of Aldur), in the terms of the
frame ([`docs/frame.md`](../docs/frame.md)). The data is built and is a pipeline stage. The drawing is not: nothing
is declared in `assets/kinds.js` yet (below, "Why not in kinds.js yet"). It stacks on #91
(`design/achievements.md`), which pulls `data/game/rune_recipes.json`, `rune_highlights.json` and
`verisium_crafts.json` and holds `tools/cardnames.py`.

## What is built

| Stage | Reads | Writes | Size (gzipped) | Holds |
|---|---|---|---|---|
| `runes` (`python tools/pipeline.py --only runes`) | `data/game/rune_recipes.json`, `rune_highlights.json`, `verisium_crafts.json`; the index, `data/exchange.json` | `data/runes.json` | 214.6 kB (30.9 kB) | 322 recipes both ways, 34 runes, 175 highlight bands, 718 Anvil crafts |

The file carries `ids` (empty: nothing in it is an internal id, and `tools/lastgood.py` `own_ids()` holds all of it
to that) and `flags` (`Subject to change`, "Depends on GGG. May change without notice."). `tools/runes.py` writes
lines a player reads and is in `tools/dev/voice.mjs`'s list.

## Checked against poe2db

poe2db ([poe2db.tw](https://poe2db.tw/us/)) is the check, not a source.

- **Recipes** ([Runeshape Combinations](https://poe2db.tw/us/Runeshape_Combinations), 322): every rune combination
  matches, and the Tome tabs match poe2db's counts (Currency 93, Runes 131, Gems 61, Alloys 14, Uniques 23). Two
  names differ: poe2db calls the Rage rune "Enrage" (the name of its picture) and draws the Bait rune of Krillson's
  Bay Key as a Power rune (it uses the Power rune's picture). The files name them Rage and Bait. poe2db prints a
  level range beside each rune of a recipe that none of the three tables holds as such; ours is the file's own
  highlight rows, flagged (below).
- **The Anvil** (Rusted Cuirass, Fur Plate, Cabalist Helm, Runeforged Rusted Cuirass): every Verisium cost matches,
  and Rusted Cuirass's Runemastered craft (Bramblejack, 230 Verisium and Medved's Crest of the Circle) too.

A find: the Anvil's plain-base marker is the word Void. 409 of 718 crafts carry "Void" in their unique column. The
builder reads it as none, and stops if a unique is ever called Void.

## The Rune kind, the finder as an application card, the Anvil on the base card

**The Rune kind (step 4):** `{k: 'o', one: 'Rune', many: 'Runes', ...}`, 34 rows, one per rune: its name ("Tempest
Rune"), how many recipes it is in, and its highlight bands as a list (`2 runes, slot 1: level 1-16`).
`REL.inrecipe` ("Makes", rune to result card) off `byRune`.

**The finder (frame: a card that is an application):** one card, kind `e`, `own: './runes.js'`, reading
`data/runes.json` when opened. Two controls, both ways out of one list: pick runes and it lists what they make
(`byRune`, intersected); pick a result and it lists the combinations that make it (`makes`). Each row: the runes,
the result (a link where `card: 1`), count, gem level, the Tome tab. The highlight rows under a recipe (`offered`)
carry `Subject to change`, because that a recipe is offered when one of them is highlighted is read off the column
names. A band table beside it: per recipe length, the rune each area-level band highlights (`bands`).

**The Anvil on the base card (step 2):** a field `anvil` on the Base kind, reading `byBase`: a `fact` piece
"Runeforged: 20 Verisium", and a `body` list of the unique crafts ("Bramblejack · Runemastered · 230 Verisium,
Medved's Crest of the Circle"). 496 bases carry it; 9 of the crafts start from something that is not a base card
(the Starlit Ores, Shattered Triskelion) and are counted.

**Made from runes (step 3):** `REL.runemade` on currency, gem and unique cards, off `makes`: 288 of 322 recipes make
a thing with a card.

## Why not in kinds.js yet

The Rune kind has no rows in the index and the finder has no module (`assets/runes.js`), so neither can be declared
without putting a kind on the site with nothing to draw. The `anvil` field would sit on the Base kind, which is
declared, but it reads `data/runes.json` as a file of its own, and the renderers that do that (`adds`, `pool`) each
read one other shape (`data/essences.json`, `data/craft/<class>.json`). It waits for its renderer in the 1.0 front
end; the declaration is then one line in `FIELDS` and one name in the Base kind's `fields`.

## What is left

- The drawing, in the 1.0 front end: the kind, the finder module and the `anvil` renderer.
- The level range poe2db prints beside each rune: not in these three tables; found elsewhere, it replaces the flag.
