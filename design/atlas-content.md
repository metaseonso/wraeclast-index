# Atlas content: the data, and the fields proposed

The design for [#92](https://github.com/metaseonso/wraeclast-index/issues/92) (what each Atlas map can hold, and
what corruption adds), in the terms of the frame ([`docs/frame.md`](../docs/frame.md)). The data is built and is a
pipeline stage. The drawing is not: nothing is declared in `assets/kinds.js` yet (below, "Why not in kinds.js yet").
It stacks on #91 (`design/achievements.md`), which pulls `data/game/endgame_maps.json` and holds
`tools/cardnames.py`.

## What is built

| Stage | Reads | Writes | Size (gzipped) | Holds |
|---|---|---|---|---|
| `atlascontent` (`python tools/pipeline.py --only atlascontent`) | `data/game/endgame_maps.json`, `map_content.json`, `atlas_corruption.json`; the index, `data/bosses.json`, `data/areas.json` | `data/atlascontent.json` | 73.5 kB (13.7 kB) | 172 maps, the node content, the weighted node modifiers, corruption and cleansing |

The file carries `ids` (`id` and `hidden`, which `tools/lastgood.py` `own_ids()` leaves whole) and `flags`
(`Subject to change`, "Depends on GGG. May change without notice."). `tools/atlascontent.py` writes lines a player
reads and is in `tools/dev/voice.mjs`'s list.

## Checked against poe2db

poe2db ([poe2db.tw](https://poe2db.tw/us/)) is the check, not a source. Castaway, Burial Bog, Blooming Field,
Savannah and Sinking Spire: biomes, boss and Castaway's three fixed lines ("All items dropped are converted to
Gold") all match.

A find: only 41 of 172 maps say nothing about their content. 107 draw from the set All, 12 can only be Irradiated,
4 only Irradiated or a Powerful Map Boss, 7 only a Notable Location, and The Copper Citadel can hold nothing.

## Fields on the Area card, and one on the Corruption keyword

An Atlas map already has a card: the Area kind (#72, `data/areas.json`), which draws its biomes, boss and modifiers.
Frame step 4 says no new kind. The map's entry here keys on the same name (`area: 1` where the Area card exists).

| Field (new) | Slot | Draws | Absence |
|---|---|---|---|
| `mechanics` | `fact` | "Any content", "No content", or the names it is kept to ("Irradiated · Powerful Map Boss") | a map whose files name no set: nothing |
| `influences` | `body`, popup only | the biome Influences that can roll on it, each with its weight, and `Subject to change` | not an All map: nothing |
| `hidden` lines | the Area card's existing `mods` | a line the game never shows, worded where the game words the stat elsewhere (`hid`); ours only where the stat's name says it outright (`ours`, then `Source: the stat's own name`) | 4 maps keep one stat nobody can word: counted, never drawn |

The weighted node modifiers (Essence Trove, Affluent Armies ... 49 rows, three groups) are one table, not a field
per map: a `body` block on the Biome keyword card (`w:Biome`), weights beside them, `Subject to change` on the group,
which is a column dat-schema does not name.

**Corruption:** a `body` block on the Corruption keyword (`w:ContainsCorruption`): the 15 lines a corrupted node can
add, each with its weight and share, "Corrupted, nothing more" for the line whose stats are all 0, and the 11
cleansed lines under their own heading. Both pools carry `Subject to change`: that the lines are one pool is not
verified, and the cleansed weight is an unnamed column.

**Connections:** `REL.onlyholds` ("Can only hold", map to keyword) and its mirror `REL.onlyon` ("Maps that hold only
this", keyword to Area), off `onlyOn`.

## Why not in kinds.js yet

The fields go on the Area kind, and the Area kind is #72's: it is not on main, so there is no kind to declare them
on. The Biome and Corruption blocks would read `data/atlascontent.json` as a file of their own, and the renderers
that do that today (`adds`, `pool`) each read one other shape. Both wait for #72 and the 1.0 front end.

## What is left

- The drawing, in the 1.0 front end, once the Area kind is in.
- "Maps where a mechanic spawns more" (#92's mechanic card line): nothing in these tables says it, so it is not
  drawn.
- `data/areas.json` is read from `origin/t72-areas` until #72 lands.
