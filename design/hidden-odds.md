# Hidden odds: the `weight` field and the pool page

The design for [issue #110](https://github.com/metaseonso/wraeclast-index/issues/110), in the terms of the frame
([`docs/frame.md`](../docs/frame.md)). The data is built, and the `weight` field is declared and drawn: one entry in
`assets/kinds.js`, one renderer (`TYPE.odds`) in `assets/app.js`, on the unique and keyword cards the pools name. The
pool page is not built yet, because its rows are not in the index. This page is what that picks up.

## What is built

`tools/odds.py`, the pipeline's `odds` stage, reads `data/game/` (the `datpull` stage, #83) and writes `data/odds.json`, 23 kB. It fetches
nothing, measures nothing and guesses nothing. A share is an outcome's weight divided by the sum of its pool's
weights. The only thing that is not sure is **which outcomes roll against each other**. The files say what weight a
row rolls at. They do not say which rows share a roll. So:

- A pool the table makes by itself (one list, one named weight column, nothing that switches a row on) is `sure`.
- Any other pool is our reading of the rows (a prefix, a level, a column dat-schema has no name for). It is **kept
  apart** from the rest, flagged **Subject to change**, and says why in `why`.

| Pool | Rolls in | Outcomes | Sure |
|---|---|---|---|
| Foretold Bounty | a Forbidden Rite on the Atlas | 50 | Subject to change: whether Bounty and Proliferation share a pool is not verified, and one rite with no words (weight 1,800) may roll among them |
| Foretold Bounty, once unlocked | a Forbidden Rite on the Atlas | 10 (Mageblood, Headhunter, Kalandra's Touch 30 each) | Subject to change: these roll only once something unlocks them |
| Foretold Proliferation | a Forbidden Rite on the Atlas | 6 | Subject to change |
| Strongboxes | a strongbox in an area | 9 (Strongbox 300 … Jeweller's and Cartographer's 10) | Subject to change: the versions per level band are read as one pool; atlas stats move some weights |
| Corrupted atlas node | a corrupted map on the Atlas | 15 | sure |
| Cleansed atlas node | a cleansed map on the Atlas | 11 | Subject to change: its weight column has no name in dat-schema yet |
| Map content, groups 1 to 3, and group 1 by biome | a map on the Atlas | 36, 6, 1, 6 | Subject to change: grouped by a column with no name yet |
| Ritual altars | a Ritual in a map | 10 (Queen's 44, others 100 or 0) | sure |
| Azmeri spirits, by area level (4 to 32, 33 to 65, 66 and up) | an Azmeri spirit in an area | 9, 10, 11 | Subject to change: area tags also move a spirit's weight, and those are not read here yet |

Each outcome carries `name`, `weight`, `share` (6 places), `oneIn` (rounded) and `text` where the game words it
beyond its name. A weight of 0 is listed with share 0 and no `oneIn`: it is in the table and cannot roll today
(Trialmaster's Trainee, Omen of Corruption). Everything a player reads is a name the game uses. `file`, the
internal file name, is the only field allowed to hold an id (`ids: ["file"]`), and the last good rule (`tools/lastgood.py`
`own_ids`) fails a build where anything else does.

## Labels

Three labels, word for word, the same everywhere:

| Label | When | Tooltip |
|---|---|---|
| **Subject to change** | a pool whose structure is not verified (`sure: false`) | *Depends on GGG. May change without notice.* The pool's own `why` sits under it in the popup |
| **Source: game files, patch 0.5.5** | every weight, every pool: `source` in `data/odds.json`, from `data/game/_meta.json` | none |
| **Estimate** | not used here. A weight is read, not estimated. It is kept for a number we work out that the game does not publish | none |

No expected value, anywhere. A share and a real price can sit side by side. They are never multiplied into a
number the game does not publish.

## The `weight` field (frame step 2: a new field type)

**Before.** No renderer draws "1 in N of a pool". `number` draws one value with a word. It cannot divide by a pool
total or name the pool. `pool` (`canroll`) draws a list of an item class's modifiers, not one line about this card.
So this is a new field type. A new relationship is also needed (step 3, below).

**The move.** One `FIELDS` entry and one `TYPE` function, both in:

```js
weight: {type: 'odds', at: 'n', slot: 'body', file: 'data/odds.json', label: 'How often it rolls'},
```

It sits in `body`, like `adds`: a table of its own is fetched the first time a card opens, and a box that fills
when it lands is a body block. The rules below still hold, one row per pool instead of one fact piece.

`TYPE.odds` finds every outcome whose `name` is the card's name and draws one row per pool: the pool and
**1 in N**, with the pool's `of` beside it (**Foretold Bounty, once unlocked: 1 in 31** · a Forbidden Rite on the
Atlas, on the Mageblood card). A pool that is not `sure` draws **Subject to change** beside it, its tooltip and
`why` on hover. The block ends **Source: game files, patch 0.5.5**.

| | Rule |
|---|---|
| **Slot** | `body`, one block, one row per pool the card is in, in the popup only (the most any card is in today is 3) |
| **Order** | `data/odds.json`'s own pool order, which is the order of the tables in #110 |
| **Match** | the outcome's `name` against the card's name, exactly. "2 Divine Orbs" is not the Divine Orb card. The pool page shows it, and the Divine Orb card shows only the rites that name it once |
| **Weight 0** | nothing on the card. The pool page lists it last |
| **Absence** | no pool names the card: no piece, no line |
| **Fetched** | the first time a card that carries the field opens, never in first paint, like `adds` |

**Kinds that carry it.** Today uniques (the ten rite uniques) and keywords (the strongbox and Azmeri spirit keyword
cards, which the pools name exactly). Currency, once a rite outcome names an orb by its card's name; map content once
it is a card. It is one word in each kind's `fields`.

## The pool page (frame step 4: a new kind, plus step 3: a new relationship)

A pool has rows with an identity of its own, so it is a **kind**, not a field. One `KINDS` entry (`one: 'Pool'`,
`many: 'Odds'`), and its rows come from `data/odds.json`. No card code:

| Slot | What fills it |
|---|---|
| `head` | `name`: the pool's name. `sub`: `of` ("a Forbidden Rite on the Atlas") |
| `pill` | **Subject to change** where the pool is not `sure`. The outcome count |
| `fact` | the total weight · the chance of the most likely outcome |
| `body` | the outcomes block: one row each, sorted by weight, **name · weight · 1 in N · today's price**. The price goes through `money`, the only type that draws a price, and there is no price where the market has none. 4 rows in the grid, all in the popup, the whole table on its own page by the gold button. Then `why` for a pool that is not sure, then `source` |
| `foot` | the kind name |

**Connections**, one `REL` pair that is followed both ways, built from the same file: an item card gets **Rolls in**
(the pools that name it), and a pool gets **Can roll** (the cards its outcomes name). One `EDGE` function, and no
kind is named in it.

**The page per pool** is the gold button: the pool's outcomes as a sorted table with the price beside each, the
flag and its reason at the top, and the source at the foot. Real prices only. An outcome the market does not price
shows none.

## What the guard proves

- `own_ids` (the last good rule): no internal id in `data/odds.json` outside `file`.
- `frame`, once the rework lands the field and the kind: the field type has a renderer and the renderer has a
  field; the `fact` slot stays under its cap across the index; the new kind is declared; the new group names a real
  map and kind; no pool lists itself.

## Left for the rework

- Draw the kind, `REL`/`EDGE`, and the pool table page (`FIELDS.weight` and `TYPE.odds` are in).
- Cards for strongboxes, map content and Azmeri spirits, so that their outcomes have a card to open.
- Verify the pools flagged here, one at a time. When a pool is verified, `tools/odds.py` merges it and drops the flag.
  The label comes off in the data, and no page code changes.
- Read the Azmeri spirits' per-area-tag weights (`TormentSpirits.SpawnTags`/`SpawnWeights`) into `data/game/`.
