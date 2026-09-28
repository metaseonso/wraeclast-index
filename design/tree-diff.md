# Tree changes on the card and on the tree

A proposal for [issue #87](https://github.com/metaseonso/wraeclast-index/issues/87): how a passive card and the
tree view say what the last patch did to a node, drawn in the terms of [the frame](../docs/frame.md). The data
half is built (`tools/treeexport.py`, `data/treechanges/`). No front-end code yet: the owner is reworking the
front end for 1.0, so this is the declaration to add when that lands, not a change to `assets/`.

---

## What there is to show

Read from GGG's own tree export (https://github.com/grindinggear/poe2-skilltree-export), 27 September 2026.
One file per patch, named for the patch it arrives at.

| Step | Added | Removed | Reworded | Moved |
|---|---|---|---|---|
| 0.4.0 → 0.5.0 | 164 | 21 | 253 | 381 |
| 0.5.0 → 0.5.1 | 68 | 0 | 12 | 149 |
| 0.5.1 → 0.5.2 | 0 | 0 | 7 | 0 |
| 0.5.2 → 0.5.4 | 0 | 0 | 4 | 0 |
| 0.5.4 → 0.5.5 | 0 | 0 | 4 | 0 |

The export has no 0.5.3: the commit after 0.5.2 is 0.5.4. 0.5.4 → 0.5.5 is four names put right and nothing
else ("Devestating Devices" is "Devastating Devices" now). A patch the size of 0.5.0 is where this earns its
place.

Every row in a file is a node as a player reads it: its name, its type, its ascendancy where it has one, its
lines, and the tree's own number for it in `id`. The number is how the tree view finds the node and how a card
finds its nodes; it is never drawn (issue #12).

| List | What a row carries beyond the node |
|---|---|
| `added` | nothing: the node as it is now |
| `removed` | nothing: the node as it was |
| `reworded` | `was`: the old name, the old lines, or both — only what changed |
| `moved` | `how`: `position`, `links` or both; `joined` and `left`: the neighbours gained and lost, by name |

---

## On the card

A passive card is one name and one effect, and a small passive's card holds every node with that name and
effect (`x`, "12 on the tree"). So the card reads the nodes it holds, not a name: the drill-down's tree block
already joins each node's number (`h`) to the card's own `id`, and the join step is one pass over that, in the
tool that already joins facts onto cards after the index is built (`tools/carddata.py`).

Three fields, in the order they draw. Each is procedure step 1 of the frame — a field type that exists, with
its own `at`, `pre` and `tone` — except the last, which asks one thing of `rich`.

| Field | Slot | Declaration | Draws |
|---|---|---|---|
| `newin` | `pill` | `{type: 'text', at: 'nw', slot: 'pill', pre: 'New in ', tone: 'lin'}` | **New in 0.5.5** |
| `changed` | `pill` | `{type: 'text', at: 'ch', slot: 'pill', pre: 'Changed in '}` | **Changed in 0.5.5** |
| `wasname` | `pill` | `{type: 'text', at: 'wn', slot: 'pill', pre: 'Was: '}` | **Was: Devestating Devices** |
| `waslines` | `body` | `{type: 'rich', at: 'wa', slot: 'body', label: 'Was:'}` | a block headed **Was:**, the old lines under it |

- **One patch only.** The card says what the latest patch did (`data/treechanges/index.json`, `latest`). A
  node new in 0.5.0 is not "New" in 0.5.5. Older patches are the patch page's job (issue #73), which reads the
  same files.
- **New** carries `nw` only. **Reworded** carries `ch` and `wn` and/or `wa`. **Moved** carries `ch` alone: a
  move is a fact about the tree, not the card, and the tree view says where.
- **A card that holds several nodes, not all changed** (a small passive, 12 on the tree, 2 of them moved):
  `ch` reads "0.5.5 on 2 of its 12" — still one `text` pill, the words worked out by the join, never by the
  renderer. A reworded node leaves its old card and lands on a new one, so the new card carries it whole.
- **Removed** has no card to draw on: the node is gone from the index. It is a row on the patch page, and a
  search for the old name opens nothing, the way it does today.
- **Slots.** Two pills at most (`ch` + `wn`), under the pill cap of 6 with the widest passive at 3 today
  (`asc`, `region`, `ontree`). One body block, under the cap of 6. The popup draws the old lines in full; the
  grid cuts them at 4 with a `+N more` row like every list.
- **The one ask of the framework: `rich` with a `label`.** `adds`, `pool` and `ladder` already draw
  `f.label` as a `card-facts` line over their rows; `rich` does not. Teaching it the same one line reaches
  every kind and names none, so it is the frame's own move, not a special case. The alternative — "Was:" put
  into the data as the first line — makes the game's lines say something the game did not.
- **Voice.** The words are the game's and the patch number. "New in 0.5.5", "Was:", "Changed in 0.5.5" —
  nothing explains itself (`tools/dev/voice.mjs`).
- **Source.** GGG publishes the export, so the card names no source (the frame: *anything the game does not
  publish names its source*). The files still carry `src` ("Source: GGG's passive tree export") for the patch
  page, where a list of changes is ours and says whose data it is read from.
- **Absence.** No change, no pill, no block: a field the entry does not carry draws nothing.

---

## On the tree

The tree is drawn in two places: the drill-down's Passive tree section (`explore.html`) and the builder's
`treemap` field (type `tree`). Both place a node by the same number the change files carry, so neither needs a
join.

- **The mark.** A ring round the node, in one of three tones: added (`lin`), reworded (`accent`), moved
  (`muted`). A removed node is not on the tree to ring; the legend counts it.
- **The legend.** One line under the tree, and the frame's rule for what is not drawn: always a count, never
  an "etc." — **0.5.5: 4 reworded** (and on a bigger patch, "164 new · 253 reworded · 381 moved · 21
  removed"). Each count is a toggle that shows or hides its rings.
- **Hover and tap.** The node's own card, which already says New / Changed / Was: the tree never words a
  change itself, so the card and the tree can never disagree.
- **Loading.** The latest patch's file is fetched the first time the tree is drawn with marks on, never in
  first paint — the rule every field with a `file` keeps. 0.5.5's is 1 kB; 0.5.0's, the biggest, 145 kB.
- **Off by default in the builder**, on by default in the drill-down: a build is about what is allocated, the
  drill-down is where a player goes to read the tree.

---

## Connections

One group, procedure step 3, off a field the join already writes: `MAPS.patch = {at: 'ch', per: 'kind'}`
and `REL.patch = {label: 'Also changed in this patch', of: 'p', edge: 'cat', map: 'patch'}`. It is the same
edge as "Listed with" reading a different map, so it is two entries and no code. A new node carries `nw`
and not `ch`, so a second map on `nw` (`MAPS.newin`, `REL.newin`, "Also new in this patch") is the same two
lines again.

---

## The check against RePoE

Every run holds GGG's latest tree up against RePoE's (`passive_skill_trees/Default.min.json`, what the site
is built from) and against the lines the drill-down shows (`tools/tree.py`, from the game files since 27 Sep).
Reported in `data/treechanges/index.json` (`check`), never fixed by the tool. On 28 September 2026, 0.5.5:

| | |
|---|---|
| Nodes in one tree and not the other | 0 and 0 |
| Names that differ | 0 |
| Named in RePoE's, no name in GGG's | 15 — the ascendancy starts of classes not in the game (Assassin, Guardian, Berserker…) plus two more. GGG leaves them blank, so they are not in the game |
| Node type differs | 2 |
| Lines in another order only | 0 — `tools/tree.py` lists them in the game's order now (677 on the artifact's tree) |
| No lines on the site, "Grants Skill" in GGG's | the notables `tools/gamelib.py` cards from the skill |
| **Lines that differ** | **9** (32 on the artifact's tree) |

`tools/tree.py` closed 23 of the artifact's 32 (the missing lines, the old Owl Feather count, the "@100%" stat
text). The 9 left:

- **Points a node grants.** Weapon Master, Passive Point(s), Path of the Sorceress and Path of the Warrior grant
  passive points (`sp`) and GGG's tree says so in a line; the site's lines do not.
- **A zero line.** Minion Life shows "Minions have +0% to Chaos Resistance"; GGG's tree has no such line.
- **Wording.** Self Sacrificing reads "-20% increased Spirit Reservation Efficiency" where GGG's says "20%
  reduced Spirit Reservation Efficiency of Skills".

The fix is in `tools/tree.py`, not here (#133): GGG's wording first where the two differ.

---

## What is left

1. The join onto passive cards (`nw`, `ch`, `wn`, `wa`) in `tools/carddata.py`, and the four `FIELDS`
   entries plus `label` on `rich` — after the 1.0 front end lands.
2. The tree marks and legend in the drill-down and the builder.
3. The patch page (issue #73) reading `data/treechanges/`.
4. The 9 line mismatches above (#133).
5. Done: `treechanges` is a patch stage of `tools/pipeline.py`, after `treelines`. A patch the export has and
   `data/patches.json` does not tie to a commit yet waits for `python tools/patches.py --tree`.
