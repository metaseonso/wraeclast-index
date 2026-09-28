# Quest cards and the act checklist

A proposal for [issue #76](https://github.com/metaseonso/wraeclast-index/issues/76) (quests, and the choices you
cannot undo) and the data half of [issue #118](https://github.com/metaseonso/wraeclast-index/issues/118) (the
campaign companion), drawn in the terms of [the frame](../docs/frame.md). The data is built (`tools/quests.py`,
`data/quests.json`). Nothing below is applied to `assets/kinds.js` yet: the quests have no rows in
`data/index.json` (the join, step 1 of "What is left", is not built) and the `take` field needs a `choice` renderer
that `assets/app.js` does not have, so a declaration now would declare cards nothing draws. The change that joins
them onto the index adds these entries to `assets/kinds.js` and runs `node tools/dev/schema.mjs --write`.

---

## What there is to card

Measured on `data/quests.json`, 27 September 2026, patch 0.5.5, area names joined to the `data/areas.json` of
#72 (PR #132).

| | |
|---|---|
| Quests in the game files | **137** |
| Carded | **103**: Act 1 17, Act 2 16, Act 3 9, Act 4 23, Interlude 8, Endgame 30. Kinds: 54 Main, 43 Optional, 2 Trial (the Ascendancy trials, which the game marks important), 4 Mission |
| Merged | 3 rows share a name and an act with another and are one quest to a player ("Secrets in the Dark" is two rows) |
| Left out | 7 in Act 5 (Oriath: not one area of it is in the game files, so nothing of it can be reached), 10 in no act, 14 with no name |
| With what it asks | 67, the tracker's first line in the game's words. 11 Ritual quests leave their first line for the game to fill in as it goes ("Complete Rituals in these areas: {0}") and carry none |
| With where | 61, the areas the tracker and its map pins name, in the order the quest walks them |
| Who | 23 name who gives it (the one talk that sets its first step); 51 name who hands out the reward (the talk that opens its window) |
| Reward windows | 57 quests; 13 windows are a real choice (take one of 2 to 6) |
| Gold | 8 quests, 100 to 7,500 |
| Permanent rewards | **50** in the campaign and the Endgame; **8** choices among them, 22 of the 50 being one option of one |

### Every act, what it gives for good

Straight from `acts[].sum` and `acts[].pick`. The totals add up only what is not a choice; a choice is listed
beside them.

| Act | Added up | And one of each |
|---|---|---|
| Act 1 | +10% to Cold Resistance, +30 to maximum Life, +30 to Spirit, 4 Weapon Set Passive Skill Points | — |
| Act 2 | +10% to Lightning Resistance, 4 Weapon Set Passive Skill Points | the Medallion in Valley of the Titans: 30% increased Charm Charges gained or 30% increased Charm Effect Duration, each with +1 Charm Slot |
| Act 3 | +10% to Fire Resistance, +30 to Spirit, 4 Weapon Set Passive Skill Points | a Venom Draught: Stone (25% increased Stun Threshold), the Veil (30% increased Elemental Ailment Threshold) or Clarity (25% increased Mana Regeneration Rate) |
| Act 4 | +10% to Lightning Resistance, 5% increased maximum Mana, 8 Weapon Set Passive Skill Points | three tattoos (+5 to an attribute or +5% to a resistance, each test), Kaom's Lesson or Rakiata's Lesson (the Shark Fin), the Goddess of Justice (30% Life or Mana Recovery from Flasks) |
| Interlude | 5% increased maximum Life, +40 to Spirit, 6 Weapon Set Passive Skill Points | one of the Seven Pillars in Qimah (Alima's gives 5% increased Experience Gain with a penalty on each of the other six's stats, "Alima's Disgrace" in the game's words) |
| Endgame | +5% to all Elemental Resistances, 5% increased maximum Life, 5% increased maximum Mana, +10 to Spirit, 1 Weapon Set Passive Skill Point | — |

**Where these come from.** The game's own world map lists them: a map pin at the place it is won, whose text
carries the reward in the game's words (`<white>{+10% to Cold Resistance}` under Beira of the Rotten Pack, in
Clearfell). 35 pins do, and a quest item that grants something says so in its own description ("Grants +5 to
Dexterity"). The tool joins the two on the quest flag both set, so the Crowbell's Book of Specialisation is one
reward with a place (Hunting Grounds), not two. A reward that is not a quest's — a boss drop, a shrine — is still
in its act, with where it is won: 8 of Act 1 to 3's 18 are.

**Passive points.** Every "passive point" reward in the files is worded as **Weapon Set Passive Skill Points**
(the Book of Specialisation, the Tattoo of Hinekora, the Warden's Ledger, the Blood Sacrifice). poe2db's quest
list words the same rows as "2 Passive Skill Points, 2 Passive Respec Points" — its reading of two unnamed
columns. The item's own text is the official word, so that is what is shipped. Ascendancy points (2 per trial,
four trials) are in the files by trial, not by quest, and are left out of the totals (below, "What is left").

---

## The class filter: decoded, and empty

The #83 survey left one question: the class filter sits in an array column dat-schema does not name.
`QuestRewards` has two such columns (after `RewardStack`, and after the second unnamed foreign key). Read at the
byte level, both are `(count 0, offset 12)` on **all 197 rows**, and the table's variable-data section is only
its 8-byte marker and 4 bytes: no row points at any list at all. **No reward in 0.5.5 is filtered by class.**
Every class is offered every choice.

Source: poe2db (https://poe2db.tw/us/QuestRewards), as the check: its reward table has a column per class, and
all 64 of its rows span all seven columns (`colspan='7'`), none split by class.

---

## Choices you cannot undo

What the files do say, and the tool ships as verified:

- **One of a set.** Items that close on one quest flag (the three Venom Draughts all set `SnakeLadyPotionUsed…`;
  each tattoo pair its test's flag; Kaom's and Rakiata's Lessons one flag), and world-map pins that hide while
  another option of the same place is active (the Medallion, the Goddess of Justice, the Seven Pillars). The
  Ancient Vows tracker says it outright: "can now choose to side with one of the Clans and receive a permanent
  reward".
- **Where, and from which quest.** The Venom Draughts are The Slithering Dead's (The Venom Crypts), the tattoos
  Tawhoa's, Tasalio's and Ngamahu's Tests, the Lessons Tribal Medicine's (the Great White One's Shark Fin, which
  is the forum's "shark fin blessing").

What they do not say: whether a choice can be changed afterwards. The pins hide each other rather than the
chosen one staying for good, which fits either answer, and the two forum threads the ticket names could not be
read (pathofexile.com answered with a block page). So **no choice is marked "cannot undo"**: each one carries
`undo: "Subject to change"`, drawn as the **Subject to change** pill with the tooltip *Depends on GGG. May
change without notice.* The day GGG says it (patch notes, a forum answer), the tool gets one line with the
source and the pill becomes **Cannot undo** with **Source: X**.

---

## Checked against poe2db

`python tools/quests.py --check` reads poe2db's quest list (https://poe2db.tw/us/Quest) and holds every quest
it lists up against the card: act, kind, the items each window offers with their item level, and gold.

**64 quests the same, 1 differs.** The same, among them: Reaching Clearfell (Uncut Skill Gem (Level 1)),
Treacherous Ground (Uncut Support Gem, item level 4, 100 Gold), The Lost Lute, Ominous Altars (three Charms,
item level 11), Earning Passage (200 Gold), The City of Seven Waters, A Theft of Ivory and A Crown of Stone (400
Gold each), The Slithering Dead (three Venom Draughts and an Artificer's Orb), Treasures of Utzaal (1000 Gold),
Tribal Vengeance (five Charms, item level 38), Shrike Island (four Rings and a gem), Whakapanu Island (two
Uncut Skill Gems, item level 48), Tribal Medicine, Trial of the Ancestors, the three tattoo tests, Siege of
Oriath, and the Endgame's book quests.

The one: **Dark Mists**, where the gold column says 7,500 on Tujen's window and poe2db shows no gold. The column
has no name in dat-schema; 7 of its 8 amounts match poe2db. It ships as the files have it, and the card should
draw that one amount with **Subject to change** until someone has seen it paid.

poe2db reads the same game files, so this checks the reading, not the game.

---

## The rows in the index

`data/quests.json` is the table; the index carries one row per quest, and one per act for the act card, written
by the join step that already puts facts on cards (`tools/carddata.py`).

| Key | From | Drawn |
|---|---|---|
| `k: 'j'`, `id` | the quest's first game id | never |
| `n` | `n` | the name |
| `s` | `act` and `kind`: "Act 3 · Optional" | the sub line |
| `gd` | `gold` | a pill |
| `pm`, `pk`, `un` | set where `keep` has anything, where a reward is one of a set, and where one carries `undo` | pills |
| `t` | `do` | the text |
| `wh`, `gv`, `rf` | `where`, `by`, `from` | facts |
| `tk` | `take`, `also` | the choice block |
| `kp` | `keep`: each line, and the place and boss where it is won | a block of its own |
| `src` | always: "Source: the game files" | the source line |
| `ax`, `ix` | the act and the reward items, as card keys | never: the groups read them |

Search words: the reward items' names, `by` and `from`. So **"Hinekora"** finds the three tattoo tests (the
tattoos go on at a *Hinekora Totem*) and Trial of the Ancestors (the *Tattoo of Hinekora*), and **"Venom
Draught"** finds The Slithering Dead — each card with every option side by side, what each gives, and
Subject to change (issue #76, "done when").

---

## The declarations

Procedure step 4 twice (two kinds), plus what they need from steps 1, 2 and 3. Letters `j` and `v` are free
(`q` is the Interaction kind; `r` is the Area kind of #72).

```js
{k: 'j', one: 'Quest', tone: 'muted', many: 'Quests', index: true, search: true, crawl: true,
 fields: [...HEAD, 'questgold', 'permanent', 'oneofset', 'undo', 'where', 'givenby', 'rewardfrom',
          ...SAYS, 'take', 'keeps', ...REST, ...FOOT],
 acts: ['pin'],
 rel: ['questwhere', 'rewards', 'questact']},

{k: 'v', one: 'Act', tone: 'muted', many: 'Acts', index: true, search: true,
 fields: [...HEAD, ...SAYS, 'take', ...REST, ...FOOT],
 acts: ['pin'],
 rel: ['questsin', 'inact']},
```

The act card's `ls` are its totals ("+10% to Cold Resistance", …) and its `tk` its choices, so it draws with the
fields the Quest kind already declares; `inact` is #72's group, and an act lists its areas with no new code.

### Fields

| Field | Declaration | Draws | Step |
|---|---|---|---|
| `questgold` | `{type: 'number', at: 'gd', slot: 'pill', post: ' Gold'}` | **400 Gold** | 1 |
| `permanent` | `{type: 'flag', at: 'pm', slot: 'pill', is: 'Permanent'}` | **Permanent** | 1 |
| `oneofset` | `{type: 'flag', at: 'pk', slot: 'pill', is: 'One of a set'}` | **One of a set** | 1 |
| `undo` | `{type: 'flag', at: 'un', slot: 'pill', is: 'Subject to change', note: 'Depends on GGG. May change without notice.'}` | the pill and its tooltip | 1, with `note` on `flag` (the ask #72 makes too) |
| `where` | `{type: 'lines', at: 'wh', slot: 'fact'}` | **Ogham Farmlands · Clearfell Encampment** | 1 |
| `givenby` | `{type: 'text', at: 'gv', slot: 'fact', pre: 'Given by '}` | **Given by Servi** | 1 |
| `rewardfrom` | `{type: 'text', at: 'rf', slot: 'fact', pre: 'Reward from '}` | **Reward from Servi** | 1 |
| `take` | `{type: 'choice', at: 'tk', slot: 'body', label: 'Take one'}` | the options side by side | **2** |
| `keeps` | `{type: 'rich', at: 'kp', slot: 'body', label: 'Permanent'}` | the lines, each with where it is won | 1, with `label` on `rich` |

- **`choice` is the one new field type.** A window's options side by side, each an item with its item level
  and rarity ("Ruby Charm · Item level 11 · Normal"), and a window of one drawn as one line. More than one
  window is one row each ("Take one" over each). It names no kind: an Atlas choice node's options, a Sekhema
  relic, an essence's outcomes can all use it. Four options in the grid, the rest counted, all of them in the
  popup — the list rule every block has.
- **An uncut gem says its item level** ("Uncut Skill Gem · Item level 41"). The files give the quest's gem as the
  untiered base at an item level; which tier that cuts into is not in them, so no tier is written except where
  the base names it (Reaching Clearfell's Uncut Skill Gem (Level 1), tier 1).
- **A quest with no reward window** (Finding the Forge) draws its quest log's reward kind instead
  ("Salvage Bench Unlock"), the one `also` the files carry.

### Connections

Step 3: one `REL` entry and one `EDGE` function each.

| Group | Declaration | From The Slithering Dead | Reverse |
|---|---|---|---|
| `questwhere` | `{label: 'Where', of: 'r', edge: 'questwhere'}` | The Venom Crypts, Ziggurat Encampment | on the Area card, #72's `questhere`, **Quests here** |
| `rewards` | `{label: 'Rewards', edge: 'rewards'}` | Artificer's Orb (a currency card); a Venom Draught has no card, and a row with no card is not drawn | on the item's card, `rewardin`, **Quest reward in**: a Ruby Ring's base card lists Shrike Island |
| `questact` | `{label: 'Act', of: 'v', edge: 'questact', map: 'act'}` | Act 3 | on the Act card, `questsin`, **Quests in this act**, in the order the game lists them |

`MAPS.act` is #72's (`{at: 'act', per: 'kind'}`), so an act card lists its areas and its quests off one map.

### The frame, measured

| Slot | Widest quest | Cap |
|---|---|---|
| pill | 3 (Permanent, One of a set, Subject to change: The Slithering Dead, the tattoo tests) | 6 |
| fact | 3 (where, given by, reward from) | 8 |
| body | 5 (text, take, permanent, source, and the flavour line an item-card popup already draws) | 6 |
| a list in the body | 15 windows (Cataclysm's Wake, one core per tier) | 4 + "+11 more" in the grid, all in the popup |
| Connections | 14 areas (Legacy of the Vaal, Act 3) | 8 + See all 14 |

---

## The campaign companion's act checklist (#118)

The companion reads `data/quests.json` and nothing else for its acts. One act of it:

```js
{act: 'Act 3', actn: 3,
 gives: ['+10% to Fire Resistance', '+30 to Spirit', '4 Weapon Set Passive Skill Points'],   // acts[].sum
 steps: [                                                     // quests[] of the act, in the game's order
   {key: 'CleanseTheSnakePit', n: 'The Slithering Dead', kind: 'Optional',
    where: ['The Venom Crypts', 'Ziggurat Encampment'],
    miss: true,                                               // a permanent reward on a quest the story skips
    take: [[{n: 'Venom Draught of Stone'}, …], [{n: "Artificer's Orb"}]],
    keep: [{n: 'Venom Draught of Stone', ls: ['Grants 25% increased Stun Threshold'], pick: 'One of a set',
            undo: 'Subject to change'}, …]},
   …],
 extra: [                                                     // acts[].from with no quest: won at a place
   {key: 'SoulCoreConsumableUsed', n: 'The Flame Core', ls: ['Grants +10% to Fire Resistance'],
    where: "Jiquani's Machinarium", by: 'Blackjaw, the Remnant', miss: true}],
 pick: [ … acts[].pick … ]}
```

- `key` is the game's own id (the quest's; for an extra, `acts[].from[].id`: its item's flag, or its map
  pin's where there is no item). It is what the checklist stores and
  never what it draws (#12).
- `miss` is the companion's "do not skip": every permanent reward is one, and a Main quest without one is not.
  Of Act 1 to 3's 18 permanent rewards, 8 are not on a quest at all (a boss's drop, a shrine) — the checklist
  is the only place a player is told to go there.
- **What the checklist remembers** (browser only, until accounts, #7): `localStorage['wi-companion']` =
  `{v: 1, chars: {"<name the player types>": {done: {"<key>": 1}, picks: {"<first key of the set>": "<option n>"}}}}`.
  Per viewer, wrapped in try/catch, and the page works without it. A pick is written down as the player's own
  note of what they took; it never claims the game will hold them to it.
- The act's total is recounted from what is ticked: `gives` over the ticked rows, the picks by what was chosen.

The companion's other half — the vendors, base types by level, and uncut gem tiers by act — is not in these
tables; `data/quests.json` gives it the gem rewards by act and item level (18 of them) and nothing more.

---

## What is left

1. The join onto the index (`tools/carddata.py`), the two `KINDS` entries, the nine `FIELDS`, the `choice` type,
   the three `REL` and `EDGE` entries and their reverses, `note` on `flag` and `label` on `rich` — after the
   1.0 front end, and after #72's Area kind (the `questwhere` group needs it).
2. **Undo.** A GGG source for whether any of the eight choices can be changed; until then every one is
   **Subject to change**.
3. **Two rewards the files cannot place**: the Burning Heart (+10% to Fire Resistance, an Act 2 item on no quest
   and no map pin) and a second Book of Specialisation from Yama the White (whose map pin already carries its two
   points). Counted in `counts['left out']`, not drawn.
4. **Ascendancy points**: the files give 2 per trial (`AscendancyPoints1` to `4`), keyed by trial, not by quest.
   Ascent to Power's tracker says "obtained Ascendancy Passive Points". A line on the two Trial cards, once the
   order of the four trials is sure.
5. **Uncut gem tiers**: which tier an Uncut Support Gem of item level 8 cuts into.
6. **Dark Mists' 7,500 Gold**, the one amount poe2db does not show.
7. `tools/quests.py` is the patch stage `quests` of `tools/pipeline.py` and reads the game tables through
   `tools/gamepull.py` `dat()` (GGG's CDN, no token). It reads the area names from `data/areas.json` (#72, PR #132);
   until that file is on main it falls back to the game's own names, so run it again
   (`python tools/pipeline.py --only quests`) once #132 has merged.
