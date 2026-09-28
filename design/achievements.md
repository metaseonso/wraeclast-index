# Achievements: the data, and the card proposed

The design for [#91](https://github.com/metaseonso/wraeclast-index/issues/91) (achievement guides), in the terms of
the frame ([`docs/frame.md`](../docs/frame.md)). The data is built and is a pipeline stage. The drawing is not:
nothing is declared in `assets/kinds.js` yet, because an achievement is a new kind with no row in the index and no
module of its own, and none of the renderers there reads this file's shape (below, "Why not in kinds.js yet").
This page is what the 1.0 front end picks up.

The same pull also feeds [#92](https://github.com/metaseonso/wraeclast-index/issues/92) (Atlas content,
`design/atlas-content.md`) and [#113](https://github.com/metaseonso/wraeclast-index/issues/113) (Runes of Aldur,
`design/runes.md`), which stack on this branch.

## What is built

Six more files from the game's own tables, declared in one block at the end of `tools/datpull.mjs`'s `FILES` and
written to `data/game/` like the rest (`python tools/pipeline.py --only datpull`):

| File | Tables | Rows | Read by |
|---|---|---|---|
| `achievements` | Achievements, AchievementItems, MonsterVarieties, MonsterDeathAchievements, CurrencyItems, AchievementOmenTypes, Expedition2CraftingAchievements, BaseItemTypes | 80 | #91 |
| `achievement_sets` | AchievementSetsDisplay, AchievementSetRewards | 6 | #91 |
| `endgame_maps` | EndgameMaps, EndgameMapLocations, EndgameMapBiomes, EndgameMapContent, EndgameMapContentSet, WorldAreas, MonsterVarieties, ClientStrings2, Mods, Stats | 172 | #92 |
| `rune_recipes` | Expedition2Recipes, Expedition2Runes, ExpeditionCategory, BaseItemTypes, ClientStrings | 322 | #113 |
| `rune_highlights` | Expedition2RunesWeights, Expedition2Runes | 175 | #113 |
| `verisium_crafts` | Expedition2VerisiumCrafts, BaseItemTypes, Words | 718 | #113 |

`tools/cardnames.py` is the one place the three builders read card names from: the index, `data/exchange.json`,
`data/bosses.json`, and `data/areas.json` from #72 (read off `origin/t72-areas` until that lands).

| Stage | Writes | Size (gzipped) | Holds |
|---|---|---|---|
| `achievements` (`python tools/pipeline.py --only achievements`) | `data/achievements.json` | 27.8 kB (6.5 kB) | 80 achievements and challenges, the set rewards |

The file carries `ids` (the fields that may hold an internal id; `tools/lastgood.py` `own_ids()` holds every other
field to it) and `flags` (`Subject to change` with its tooltip, "Depends on GGG. May change without notice.").
`tools/achievements.py` writes lines a player reads, so it is in `tools/dev/voice.mjs`'s list (with the two
builders #92 and #113 add).

## Checked against poe2db

poe2db ([poe2db.tw/us/Achievements](https://poe2db.tw/us/Achievements)) is the check, not a source: nothing in the
file is read from it. All 56 permanent achievements match its list on name, words and number of steps. Two needed
a fix to match: "Chest Cracker" counts 50 on a step with no name (now `count: 50`), and "Nameless Nemesis" has a
double space in the game's own text (now one).

A find: "Defeat a powerful enemy in The Burning Monolith" is The Arbiter of Ash (MonsterDeathAchievements), so five
achievements get a how line from the files alone.

## The card: a new kind (frame step 4)

Nothing answers to an achievement today, and each has its own name and rows: a kind.

```js
{k: 'y', one: 'Achievement', tone: 'gold', many: 'Achievements', index: true, search: true, mark: 'ls',
 fields: [...HEAD, 'pill', 'steps', 'how', ...BODY, ...FOOT], rel: ['needs'], acts: []},
```

| Slot | Draws | Read from |
|---|---|---|
| `name` | the game's title: "Pinnacle Prevailer" | `name` |
| `sub` | `set · where`: "Achievements · Endgame", "Runes of Aldur · Campaign" | `set`, `where` |
| `pill` | Softcore or Hardcore only; "Any 15 of 20" where `need` | `only`, `need`, `steps` |
| `lines` | what it asks, in the game's words | `text` |
| `steps` (new, frame step 2) | its steps: a list, 4 in the grid, all in the popup; a step's `in` after it ("The Bloated Miller · The Riverbank") | `steps` |
| `how` | the how line, then `Source: game files (MonsterDeathAchievements), and the areas file for where` | `how`, `source` |

`where` is ours and says so in the doc of `tools/achievements.py`: the act the text names, the word Campaign, the
endgame words or a pinnacle boss, the acts of the areas it names, else General. The chips over the search group by
`set` first (Achievements, Runes of Aldur, Forbidden Rites, Challenges), then `where`.

**Connections (frame step 3).** One `REL` group read off the entry's own lists, and its mirror on the cards it names:

```js
MAPS.needs  = {at: ['areas', 'bosses', 'items', 'mechanics', 'keywords'], of: ['r', 'x', 'b', 'u', 'g', 'c', 'w']};
REL.needs   = {label: 'Needs', of: ['r', 'x', 'b', 'u', 'g', 'c', 'w'], edge: 'needs', map: 'needs'};
REL.askedby = {label: 'Asked by achievements', of: 'y', edge: 'askedby', map: 'needs'};
```

Every name in those lists is a card name already; a name no card answers to is counted (`counts.nocard`) and not
listed. The Area kind (`r`, #72) and the Boss kind (`x`) name `askedby` in their `rel`.

## Why not in kinds.js yet

A kind declared `index: true` needs its rows in `data/index.json`, and one drawn by its own module needs that
module; this file is neither. The renderers that read a file of their own (`adds`, `pool`) each read one shape
(`data/essences.json`, `data/craft/<class>.json`), and `steps` is a new one. Declaring the kind now would put a kind
on the site with no rows and no way to draw them, so the declaration waits for the rows to go into the index (a
step of `tools/sync.py` or a stage after it) and the `steps` renderer in `assets/app.js`.

## Labels

Exactly these: `Subject to change` (tooltip "Depends on GGG. May change without notice."), `Source: X` where a line is
not the game's own, `Estimate` nowhere (no number here is modelled). No internal id reaches a player: `id` sits in
the field the file names in `ids`.

## What is left

- The drawing, in the 1.0 front end: the kind and fields above, and the rows in the index.
- `data/areas.json` is read from `origin/t72-areas` until #72 lands.
