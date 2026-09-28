# Area cards

A proposal for [issue #72](https://github.com/metaseonso/wraeclast-index/issues/72): the **Area** kind, drawn
in the terms of [the frame](../docs/frame.md). The data half is built (`tools/areas.py`, `data/areas.json`).
The declaration below is **not** applied to `assets/kinds.js`: the owner is reworking the front end for 1.0,
so this is the entry to add when that lands.

---

## What there is to card

Measured on `data/areas.json`, 27 September 2026, patch 0.5.5.

| | |
|---|---|
| Areas in the game files | **442** |
| Carded | **288** places: Act 1 19, Act 2 23, Act 3 23, Act 4 21, Interlude 22, Endgame 180 |
| Merged | 38 entries share a name and an act with another and are the same place to a player (the Trial of the Sekhemas is 16 entries, Precursor Tower 7) |
| Hidden | **116**: 92 hideouts, 9 developers' areas ("Gone Fishing", "Programming World", "Boss Rush Area 1", "Druid Trailer"), 9 that are not a place (character select, the act maps, "Current Town"), 5 marked [DNT], 1 with no name |
| With a waypoint | 98 |
| With a boss | 185; all 104 bosses in `data/bosses.json` are among them |
| With fixed modifiers | 34 (15 carry a line the game never shows) |
| With quests | 46, from the areas a quest's own tracker names |
| Level from a Waystone | 98 Atlas maps |

Two names are two places each, in different acts: Vaal Ruins (Act 3, level 2; Endgame, from its Waystone)
and The Well of Souls (Act 2 and Endgame). They are two cards with the act on the sub line.

"Keth" is `{n: 'Keth', act: 'Act 2', lv: 21, wp: 1, hub: 'The Ardura Caravan', to: ['The Ardura Caravan',
'The Lost City'], boss: [{n: 'Kabala, Constrictor Queen'}], res: -10}`. Kabala has no Boss card
(`data/bosses.json` holds the endgame only), so her row draws no door until one exists.

---

## The rows in the index

`data/areas.json` is the table; the index carries one row per place, written by the join step that already
puts facts on cards after the index is built (`tools/carddata.py`). The row is the card's words and the keys
its groups follow — the same split the index already has between `ls` and `rx`.

| Key | From | Drawn |
|---|---|---|
| `k: 'r'`, `id` | the first of the area's own ids | never |
| `n` | `n` | the name |
| `s` | `act`, and the level: "Act 2 · Area level 21", "Endgame · Area level 65 to 80" | the sub line |
| `lvt` | `lv`, as words: "21", "65 to 80" | a pill |
| `wp`, `town`, `way` | the same | pills |
| `rs` | `res`, only where it is not 0 | a pill |
| `ls` | `mods` the game shows | the lines |
| `hm` | `mods` it does not (`hid`) | a block of its own |
| `qt` | `qt` | the flavour line |
| `bio` | `biome` | a fact |
| `src` | set only where `hm` is | the source line |
| `go`, `bx`, `qx`, `wx` | `to`, `boss`, `quest`, and the Waystones for a `way` map, as card keys | never: the groups read them |

Names in `to` resolve inside the same act first, which settles Vaal Ruins and The Well of Souls.

---

## The declaration

Procedure step 4 (a new kind), plus what it needs from steps 1 and 3. Letter `r` is free.

```js
{k: 'r', one: 'Area', tone: 'muted', many: 'Areas', index: true, search: true, crawl: true,
 fields: [...HEAD, 'arealv', 'waypoint', 'town', 'waystone', 'resist', 'unshown', 'biome',
          ...SAYS, 'hidden', ...REST, ...FOOT],
 acts: ['pin'],
 rel: ['leadsto', 'leadsfrom', 'bosshere', 'questhere', 'openedwith', 'inact']},
```

No `place` and no `link`: there is no Areas tab, and the card is the page. No `px`: an area has no price.

### Fields

Step 1 for all but the last — types that exist, with their own `at`, `pre`, `post`, `is`.

| Field | Declaration | Draws |
|---|---|---|
| `arealv` | `{type: 'text', at: 'lvt', slot: 'pill', pre: 'Area level '}` | **Area level 21** |
| `waypoint` | `{type: 'flag', at: 'wp', slot: 'pill', is: 'Waypoint'}` | **Waypoint** |
| `town` | `{type: 'flag', at: 'town', slot: 'pill', is: 'Town'}` | **Town** |
| `waystone` | `{type: 'flag', at: 'way', slot: 'pill', is: 'Level from its Waystone'}` | on a map |
| `resist` | `{type: 'number', at: 'rs', slot: 'pill', post: '% Elemental Resistances'}` | **-10% Elemental Resistances** |
| `unshown` | `{type: 'flag', at: 'hm', slot: 'pill', is: 'Subject to change', note: 'Depends on GGG. May change without notice.'}` | where a line is not shown in game |
| `biome` | `{type: 'lines', at: 'bio', slot: 'fact'}` | **Forest · Island** |
| `hidden` | `{type: 'rich', at: 'hm', slot: 'body', label: 'Not shown in game'}` | the unshown lines under their heading |

- **The penalty** is the game's own table (`ResistancePenaltyPerAreaLevel`): 0 to 15, -10 from 16, -20 from
  33, -30 from 45, -40 from 54, -50 from 60, -60 from 65. It is a pill, not a sentence ("your resistances
  here"), because the card states facts and the player does the rest.
- **What the area always carries** is the game's own wording where the game has one (RePoE's mods, `text`):
  "All items dropped are converted to Gold" on Castaway, "Monsters drop no items" on Untainted Paradise.
  Fifteen areas carry a modifier the game never shows. Five of those modifiers say what they do outright in
  their stat — no Ritual in the boss area, no league Tablets drop, no portals, you arrive in human form, more
  Rings and Catalysts in the Twisted Domain — and are worded in plain words (`HIDDEN` in the tool). They are
  not the game's words and the game never shows them, so they sit in a block of their own, with the
  **Subject to change** pill and its tooltip, and the card names its source: "Source: the game files, a line
  the game does not show". The rest (a timer in milliseconds, a quest-log flag, a value of 0; 31 lines over the cards) are counted
  and left off: only what is sure is shown (issue #92).
- **Two asks of the framework**, both one line that reaches every kind: `label` on `rich` (the one
  `design/tree-diff.md` asks for too; `adds`, `pool` and `ladder` already draw it), and `note` on `flag`
  as the pill's `title` (the `thin` field already does exactly this in the foot).

### Connections

Step 3: one `REL` entry and one `EDGE` function each. The keys are on the row, so each edge is the shape
`named` already is — the row's own list of keys, `cardRows` dropping any key with no card behind it.

| Group | Declaration | From Keth | Reverse |
|---|---|---|---|
| `leadsto` | `{label: 'Leads to', of: 'r', edge: 'leadsto'}` | The Ardura Caravan, The Lost City | `leadsfrom`, **Reached from**, the same list turned round |
| `bosshere` | `{label: 'Bosses here', of: 'x', edge: 'bosshere'}` | nothing yet: Kabala has no card | on the Boss kind, `foughtin`, **Fought in**, off each boss's own `areas` in `data/bosses.json` |
| `questhere` | `{label: 'Quests here', edge: 'questhere'}` | — | on the Quest kind (#76), **Where** |
| `openedwith` | `{label: 'Opened with', of: 'a', edge: 'openedwith'}` | — | on a Waystone card, **Opens**: 98 maps, 8 rows and See all 98 |
| `inact` | `{label: 'In this act', of: 'r', edge: 'inact', map: 'act'}` with `MAPS.act = {at: 'act', per: 'kind'}` | the 22 other Act 2 areas | runs both ways alike |

- **The levelling route** is `inact`: Connections draw in the order the index holds them, and
  `data/areas.json` is ordered by act, then area level, then the order the game files number an act's areas
  in. An act card is not needed; every area of an act lists its act in that order, and the search chip
  **Areas** filters the grid.
- **A Waystone links by level, not by name.** Issue #72 asks for a Waystone card to open "the map area of the
  same name"; in 0.5.5 no Waystone is named after a map — they are Tier 1 to Tier 16, area level 65 to 80
  (`data/atlas.json`). So every map a Waystone opens is one group on the Waystone's card, and each map's card
  says **Level from its Waystone** and lists the tiers.
- **Quests** wait for the Quest kind (#76). Until it lands the group draws nothing — a row with no card behind
  it is never drawn — and the quest names still go into the card's search words, so "Ancient Beacons" finds
  Vaal Ruins.
- **Every boss in `data/bosses.json` names its area**, and each of those areas is carded, so the boss's
  `foughtin` and the area's `bosshere` are the two ends of one edge (#72, "done when").

### The frame, measured

| Slot | Widest area | Cap |
|---|---|---|
| pill | 4 (a town: area level, waypoint, town, penalty) | 6 |
| fact | 1 (biome) | 8 |
| body | 4 (lines, hidden, flavour, source) | 6 |
| Connections | 13 rows (The Ardura Caravan leads to 13 areas) | 8 + See all 13 |

---

## What is left

1. The join onto the index (`tools/carddata.py`), the `KINDS` entry, the eight `FIELDS`, the six `REL` and
   `EDGE` entries, `MAPS.act`, and `label` on `rich` / `note` on `flag` — after the 1.0 front end.
2. `foughtin` on the Boss kind and `opens` on the Atlas kind's Waystone cards.
3. Art: the game ships a loading screen per area (`loading_screens` in the export); the card draws the letter
   glyph until one is chosen.
4. Quest cards (#76), for `questhere` to draw.
5. A job for `tools/areas.py` (it is in the update order in `README.md`, by hand), once the decoded game tables
   are read in CI rather than from the archive.
