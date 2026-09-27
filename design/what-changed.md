# What changed: the data, and how the Build page reads it

The Build page (#70) is approved around one line: **paste your build → what changed, what threatens it, what
it may cost.** This file is the first third. It says what the data is (#96 W1, the data half of #73), how a
pasted build is placed on a patch, and what the "changed" block on a card is in the frame's own terms
([`docs/frame.md`](../docs/frame.md)). Nothing here touches `assets/`, `index.html` or the CSS: the owner is
reworking the front end for 1.0, and this is the shape the data hands it.

Labels, as the owner set them (#96, 27 Sep 2026), and nothing else: no label for what is measured or official;
**Estimate** for what is worked out from real data; **Subject to change** (tooltip: "Depends on GGG. May
change without notice.") for what depends on GGG; **Source: X** for what is not official, with X named.

---

## 1. The data

### Snapshots: `data/history/<patch>/`

`tools/snapshot.py` freezes the numbers a patch can move, one file per kind, and nothing else — no art, no
search words, no prices:

| File | One entry per | Holds |
|---|---|---|
| `gems.json` | gem | every line at every level: a line the same at every level once, the rest as one wording and a number per level ("Deals # to # Fire Damage" and 40 pairs) |
| `passives.json` | passive tree node, by its number | name and lines |
| `atlas.json` | Atlas tree node, by its number | name and lines |
| `bases.json` | base item | requirements, properties, implicits, drop level |
| `mods.json` | modifier | side, level, lines, the kinds of item it rolls on (Craft tab's list) |
| `uniques.json` | unique | lines with roll ranges, requirements |

Everything but the uniques is the game's own files as the RePoE fork exports them, read by one piece of code
for every patch: today's from `tools/gamepull.py`'s copies, a past patch from the export's git history
(https://github.com/repoe-fork/poe2, one commit per export, the last export of each patch). The two roads
give the same bytes for the same export (checked on 0.5.5: all five files identical). The uniques are
`data/uniques.json`, which is poe2db's (**Source: poe2db**): the export does not say which modifiers a
unique carries, so they start with 0.5.5 and have no past.

`tools/gamepull.py` freezes a patch the first time it sees it, and again when a hotfix moves the export
inside the patch, so a patch is kept as it ends. Then `tools/diff.py` works out what it changed.
`data/history/` is a tool's input and is not shipped (`.assetsignore`).

| Patch | Export | Gems | Passive tree | Atlas tree | Bases | Mods |
|---|---|---|---|---|---|---|
| 0.2.1 | 4.2.1.2 | 692 | — | — | 906 | 1,295 |
| 0.3.0 | 4.3.0.6 | 929 | — | — | 948 | 1,338 |
| 0.3.1 | 4.3.1.6 | 929 | — | — | 948 | 1,348 |
| 0.4.0 | 4.4.0.14 | 1,029 | 4,304 | 227 | 978 | 2,115 |
| 0.5.0 – 0.5.4 | 4.5.0.3.4 … 4.5.4.11 | 1,114 – 1,117 | 4,447 – 4,489 | 479 – 528 | 1,753 – 1,785 | 2,191 – 2,193 |
| 0.5.5 | 4.5.5.2 | 1,117 | 4,489 | 530 | 1,785 | 2,193 (+ 455 uniques) |

The export only carries the two trees from 0.4.0 on. GGG's own tree export
(https://github.com/grindinggear/poe2-skilltree-export) has tags from 0.4.0 too (0.4.0, 0.5.0, 0.5.1, 0.5.2,
0.5.4, 0.5.5), so it cannot reach further back either; it is used as the check instead. Held up against it,
passive by passive in plain words: 0.5.1 → 0.5.2 six of six the same (GGG's seventh is a jewel socket, which
has no card); 0.5.2 → 0.5.4 two of two, plus one node GGG's file does not carry; 0.5.4 → 0.5.5 none on either
side. The 249 passives GGG's file "rewords" in 0.5.5 are markup only (`[HitDamage|Hit]` became `[Hit]`): a
player reads the same words, so they are not changes.

### Changes: `data/changes/<patch>.json`

One file per patch, the patch against the one before it. Per card, every line that moved, old beside new, in
the game's words; the cards the patch added; the cards it took away. The file's own header in
`tools/diff.py` gives every field. In short:

```
"cards": {"g:SkillGemFerociousRoar": [["Level 20", "Supported Skills deal 58% increased Damage",
                                                   "Supported Skills deal 87% increased Damage", "20-40"]]}
"new":   ["a:Royal Lenience", ...]
"gone":  {"p:energy_shield30": ["Calibration", "Removed in 0.5.0", ["...its last lines..."]]}
"tree":  {"new": [node numbers], "gone": [node numbers]}
```

A card key is the index's own (`g:`, `p:`, `a:`, `b:`, `i:`, `u:` and the card's id), so a change always lands
on a card that exists, or on one marked removed — the W1 rule, which the guard holds (`changes`). A removed
card keeps a card: its name, "Removed in 0.x", and what it said on its last patch.

What the patches changed, by the data:

| Patch | Cards changed | Added | Removed | File |
|---|---|---|---|---|
| 0.3.0 | 1,060 | 286 | 9 | 438 kB (56 kB gzip) |
| 0.3.1 | 23 | 0 | 0 | 4 kB |
| 0.4.0 | 349 | 128 | 3 | 251 kB (32 kB gzip) |
| 0.5.0 | 929 | 1,122 | 77 | 259 kB (42 kB gzip) |
| 0.5.1 | 22 | 33 | 0 | 5 kB |
| 0.5.2 | 24 | 1 | 0 | 4 kB |
| 0.5.3 | 183 | 3 | 0 | 19 kB |
| 0.5.4 | 32 | 17 | 0 | 3 kB |
| 0.5.5 | 17 | 2 | 0 | 4 kB |

The big files are big because a modifier that moved is a change on every kind of item it rolls on: 0.3.0 moved
modifier levels on 26 kinds of item, 2,017 rows between them, most of them the same modifier over again. The
files are only fetched when a card is opened on that patch.

**What a diff of data cannot tell.** A change in the files is a change in the files. Once in a while that is
the exporter and not the game: 0.5.4 gives 29 wands, staves and sceptres a level and Intelligence requirement
the 0.5.3 export did not carry at all. #86 lays the official patch note beside each change; a change with no
note is then marked "not in the patch notes" (#73), and this kind is the one to read twice.

---

## 2. Which patch a build was made on

From the research in #96 (36 real pobb.in builds): a build code pins the major version only
(`<Spec treeVersion>` is `0_5` whatever the hotfix), `<Import lastLeague>` pins the league when it is there
(25 of 36), and the pobb.in page's `data-last-modified` is the upload time. Everything else comes from the
snapshots.

**The rule.**

* **Earliest** possible patch = the latest of: the start of the tree's major version, the start of the league
  it was imported in, and the newest thing it uses.
* **Latest** possible patch = the earliest of: the patch live when it was uploaded, and the patch before the
  first thing it uses that a patch took away.

"The newest thing it uses": every passive (by node number, the way a build names them) and every gem is
looked up in the `tree.new` and `new` lists; the patch whose file lists it as new is the first patch it could
have been taken on. "The first thing it uses that was taken away": the same, in `tree.gone` and `gone`.

**What the player sees.**

* Earliest and latest are one patch → **Made on 0.5.5.**
* Else a range → **Made on 0.5 (0.5.1–0.5.4)**, the patch picker set to the latest, and the picker always
  there so a wrong guess is one click from right (W2).
* The patch dates come from the league list and GGG's announcements, so the range is **Subject to change**
  ("Depends on GGG. May change without notice.") until #97 gives each patch its date and hour.

On the sample, the league alone pins the exact patch for 8 of 36 builds; the fingerprints are what turn the
rest from "0.5" into a short range.

---

## 3. What changed for the build

Every card the build names, against every patch after the one it was made on, up to the patch on the site:

| In the build | Card |
|---|---|
| a gem (`gemId`, else its name) | `g:` + the gem's id |
| a passive (node number) | `p:` + the node's id; a small passive by its name and lines (the tree file the site already ships holds number, id, name and lines) |
| a unique | `u:` + its name, or `u:Name \| Base` where a name has two bases |
| a base item | `b:` + its name |
| a rare's modifiers | `i:` + its kind of item, keeping only the rows whose wording matches a line the item carries |

The changes come in the order of the patches. With a range, the changes inside the range are marked "may
already be in your build" and the ones after it are not; the list starts from the earliest patch, so nothing
is left out. A card the build uses that a later patch took away comes first: that is the one a player most
needs to know, and it is also where "what threatens it" (#77, #80) begins.

**What it may cost** is an **Estimate**, never a budget: the real prices of what the build needs summed, the
rares listed as "not priced", and one click shows each price and where it came from (W5). A change never
moves a price by itself; a price is only ever a real one.

---

## 4. The "changed" block on a card, in the frame's terms

Worked down the frame's list ([`docs/frame.md`](../docs/frame.md), move (b)):

1. **An existing field with a different `at`?** No: no field draws "this line, then that line".
2. **A new field type — yes.** `changed`: one `FIELDS` entry and one `TYPE` function, no kind named.

```js
// FIELDS
changed: {type: 'changed', slot: 'body', file: 'data/changes/@patch.json', ctx: 'patch', label: 'Changed in'},
```

* **Where it reads.** A table of its own, like every `file` field: `data/changes/<patch>.json`, the rows under
  the card's own key. Fetched when a card is opened, never in first paint. `@patch` is filled in from the page's
  context (W2): the patch picked, the patch on the site by default.
* **What it draws.** A block in the body slot titled "Changed in 0.5.5". One row per change: the field when
  there is one ("Level 20", "Requires", "Prefix"), then the old line struck through and the new line after it.
  A line only on the new side is the new line alone; a line only on the old side is the old line struck
  through. The levels a gem's change reaches go in small type after it ("levels 20–40").
* **Sequencing and cuts.** The frame's own list rule: 4 rows in the grid with a `+N more` row, every row in
  the popup. No number of its own.
* **Absence.** A card the patch did not touch has no rows and no block.
* **Labels.** A row from the uniques carries **Source: poe2db** (the file's `source`). The patch on the site
  is still being hotfixed, so its block carries **Subject to change** until the next patch lands. Measured,
  official rows carry nothing.
* **Removed cards.** `gone` already exists as a declaration. A card that is only in a `gone` list draws from
  its entry — the name, "Removed in 0.5.0" as its sub line, its last lines as its body — and is plain, never a
  link, as `gone` cards are today.
* **Every kind at once.** The field is added to the `fields` of every kind the changes cover (gems, passives,
  Atlas passives, bases, item classes, uniques), and the next kind with a snapshot gets it by adding the word.

**What the guard proves** (`changes`, in `node tools/dev/guard.mjs`, and `node tools/dev/changes.mjs` on its
own): every change names a card the index has or one a patch marks removed, and says so as "Removed in 0.x";
no row a player reads holds raw game code; and `tools/diff.py`, run on a copy of the newest snapshot made
older by hand in ten places, finds exactly those ten changes on the right cards and nothing more.

---

## 5. Left

* **A gem at the build's own level.** The change file shows a gem at level 20. The Build page wants the
  build's level: the rows can carry the numbers per level for the wording that moved (small: only moved lines).
* **Patch notes beside the data (#86)**, and "not in the patch notes" on the changes with none.
* **Uniques before 0.5.5.** The export does not map a unique to its modifiers, and poe2db keeps no history.
  Path of Building's unique list has a git history per patch, and would be **Source: Path of Building**.
* **The patch registry** (`data/patches.json`, W1): `data/history/patches.json` has each snapshot's export
  and date today; the public patch dates with hours are #97.
