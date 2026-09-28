# Game rules and gold on the cards (#111, #88)

A proposal. The data ships now (`data/rules.json`, `data/gold.json`); nothing draws it yet, because the front end
is being reworked for 1.0 and this does not touch `assets/`, `index.html` or the CSS. What follows says where each
piece lands **in frame terms** (`docs/frame.md`), so the rework can take it as data and not as a special case.

## What ships

| File | Built by | From | Size |
|---|---|---|---|
| `data/rules.json` | `python tools/rules.py [--check]` | `data/game/game_constants.json`, `affliction_constants.json`, `ritual_constants.json`, `resistance_penalty.json` | 14 kB |
| `data/gold.json` | `python tools/gold.py [--check]` | `data/game/gold.json`, `currency_exchange.json`, `game_constants.json` | 59 kB |

`tools/datpull.mjs` gains four declarations, in one block at the end of its list: `affliction_constants`,
`ritual_constants` and `currency_exchange` (written to `data/game/`), and `gold_bases` (marked `later`, like
`gold_mods`: declared, proved, not written). Both builders are patch stages of `tools/pipeline.py`, `rules` and
`gold`, after `kwuse` (they read the finished `data/index.json`): `python tools/pipeline.py --only datpull`, then
`--only rules` and `--only gold`. The pipeline holds each to the last good rule. `--check` (poe2db, the check,
never the source) is run by hand: `python tools/rules.py --check`, `python tools/gold.py --check`.

Both files list their own `ids` (the internal constant ids sit only in `rules.json`'s `from`), and
`tools/lastgood.py` `own_ids()` fails a file with one anywhere else. Both tools are read by `tools/dev/voice.mjs`,
since they write words a player reads.

**Declarations (`assets/kinds.js`): none in this change.** The `rules` field below needs a `rules` renderer that
`assets/app.js` does not have, and `exfee` and `goldv` read `gx` and `gv`, which nothing writes onto an index entry
yet. The change that adds the renderer (and has `tools/gold.py` write `gx` and `gv`) declares them and runs
`node tools/dev/schema.mjs --write`.

## The labels

Exactly three, and nothing else in their place:

* **Source: X** on every line and every block. X is the game table and the patch, as the file carries it:
  `Source: GameConstants, game files 0.5.5`. poe2db is never a source; it is the check (below).
* **Subject to change** once per block, with the tooltip *Depends on GGG. May change without notice.* Both
  files carry it as `change: {label, tip}`, so the words live in the data and not in the renderer.
* **Estimate**: nothing in either file is one. Every number is the game's own, or the game's own multiplied by
  a number the player typed. It is reserved for the respec calculator, if a later version fills in the points
  from the level instead of asking (the tables do not say how many points a character has at a level).

## Rules on cards (#111)

37 lines on 35 cards: 34 keyword cards (kind `w`) and one Mechanics card (kind `h`, *Resistances and the
maximum*). Each row in `rules.json`: `card` (the card's name in `data/index.json`; `tools/rules.py` stops when a
name is not there), `kind`, `text`, `from` (the constants and their values), `src`, and two marks:

* `said`: the card's own text already gives every number in the line (18 of 37). The line then confirms the card:
  it draws as the source mark on the card's own text, not as a second copy of the sentence.
* `check: "poe2db"`: poe2db's GameConstants page gives the same number for every constant the line reads
  (33 of 37). The four without it read tables poe2db does not list (AfflictionConstants, and the resistance penalty).

### In frame terms

Move **1** fails (no field reads a file of lines keyed by the card's name), so it is move **2, a new field
type**, one `FIELDS` entry and one `TYPE` function, no kind named:

```js
rules: {type: 'rules', at: 'n', slot: 'body', file: 'data/rules.json', label: 'In the game files'},
```

* **Slot.** `body`, after `lines`/`text` and before the tail (`quote`, `source`...): the words first, then what
  the game's tables add to them. One block, however many lines.
* **Kinds.** Add `rules` to the `fields` of `w` and `h`. The file is keyed by name, so any kind that later has a
  row in it (an area card, #72) takes it by adding the one word.
* **Fetch.** Only when a card is opened, like `adds` and `canroll`. 14 kB, never in first paint.
* **Lines.** A line that is not `said` draws as a line of the block. A `said` line draws no sentence: the
  block shows its `src` under the card's own text. A card whose lines are all `said` has a block of one line,
  the source.
* **Cap.** Widest today 3 of 6 in the body; this is one block more, so 4 of 6. Inside the block, the list rule
  (4 lines in the grid, the rest `+N more`); the widest is *Item Rarity* with 3 lines.
* **Absence.** A card with no row draws nothing.

### The resistance penalty on area cards (#72)

`rules.json` carries the penalty's steps as `levels: [[16, -10], [33, -20], [45, -30], [54, -40], [60, -50],
[65, -60]]` on both of its rows. An area card knows its own area level, so the builder that writes the area cards
works out the penalty and writes it onto the card; the card draws it with move **1**, an existing type:

```js
respen: {type: 'number', at: 'rp', slot: 'fact', pre: 'Your resistances here: '},
```

A number with a word before it is already `number`. Waystone cards (kind `a`, *area level 65* in their sub
line) would read **Your resistances here: −60** the day this lands.

### Left out, on purpose

A constant whose name does not settle what it is: AtlasPassiveRespecCost (5000), the Ritual Tribute
requirements (30,000 and 10,000 in a quest), MonsterFirstReviveLessPoints / MonsterRepeatReviveLessPoints,
every Delirium fog-bank and shard-spawn number, Heavy Stun and ailment-chance formula constants, the Tencent and
hard-mode variants. Party, vendor and unidentified multipliers sit on *Item Rarity* because no card covers
drops or vendors; a Gold card (below) is where they would move.

## Gold (#88)

`data/gold.json`:

* `respec.levels`: gold to refund **one** passive point, by character level (`levels[0]` is level 1):
  15 at 1, **1,089 at 50**, **2,904 at 80**, **10,129 at 100**. `respec.ascendancy` is 5
  (GameConstants AscendancyRespecCost), an Ascendancy point costing five times a passive point *as poe2db
  reads it*: the game names the constant and does not word it, so the label says so.
* `exchange`: the Currency Exchange's gold fee to buy one, by item name, for all 687 items it trades, every one
  with a card (the index, the Currency page or the exchange price list). **Divine Orb 800, Exalted Orb 120,
  Chaos Orb 160, Mirror of Kalandra 25,000.** `tab` is the Exchange tab it sits under.
* `unique`: 446 uniques with a gold price above 0 and a card.
* `gem`: by level (1 to 23), by quality (0 to 40%), and the flat price of a support (228) and a lineage
  support (9,091).

Left out: per-modifier gold (GoldModPrices, 298 kB worded, over the ~100 kB limit and no card draws it),
per-base gold (GoldBaseTypePrices, 95 kB, and what a vendor does with the number is not verified), inherent
skills by level (600 rows no card draws). The first two are declared in `tools/datpull.mjs` for the day a card
needs them (`--only gold_mods`, `--only gold_bases`).

### On the cards

A gold number is a game fact, not a price: it never goes in the `price` box (the frame's "A number that moves,
beside one that does not"). Move **1**, an existing type, in the `fact` slot:

```js
exfee: {type: 'number', at: 'gx', slot: 'fact', post: ' gold to buy on the Exchange'},
goldv: {type: 'number', at: 'gv', slot: 'fact', post: ' gold'},
```

`tools/gold.py` would write `gx` onto the currency, gem, atlas and keyword cards the Exchange trades (116 of
them are in the index today; the rest are Currency page cards, which read `data/gold.json` by name) and `gv` onto
the 446 uniques. The fact slot is at 3 of 8; this adds one.

### A respec calculator on the passive page (proposal)

The Passive tree section (`explore#tree`). A card that is an application (the frame's "A card that is an
application"): one card, its kind names the module, a field of type `own` leaves the box.

```
Respec                                                     Subject to change
Character level   [ 80 ]
Passive points    [ 20 ]          Ascendancy points   [ 0 ]
────────────────────────────────────────────────────────────
2,904 gold a point · 58,080 gold
Source: GoldRespecPrices, game files 0.5.5
```

* Reads `data/gold.json` `respec` only (1 kB of it), fetched when the card is opened.
* Total = `levels[level − 1] × passive points + levels[level − 1] × ascendancy × ascendancy points`. The
  Ascendancy line carries its own source: *Source: GameConstants, game files 0.5.5; read as poe2db reads it*.
* Empty points: the per-point cost alone, no total. Never a guessed count of points.
* A level outside 1 to 100 shows nothing.

## Checked against poe2db

poe2db is not official. It is the check, never the source, and the tools say so.

* `python tools/rules.py --check` reads https://poe2db.tw/us/GameConstants: 33 of 37 lines agree on every
  constant (culling 35/20/10/5, party +20% quantity and +30% unique, sell price 11%, unidentified Rare ×6,
  maps from area level 65, Ritual revive 40% less, and the rest). None disagree.
* `python tools/gold.py --check` reads https://poe2db.tw/us/Gold (its respec table) and
  https://poe2db.tw/us/Currency_Exchange: all 100 respec levels agree, and 643 exchange fees agree (the others
  are the first item under a poe2db heading, which the reader passes over). None disagree.

A run where poe2db disagrees stops without writing. Checked 28 Sep 2026, patch 0.5.5.
