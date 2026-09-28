# The export files we downloaded and never read (#90)

`tools/dev/gaps.txt` listed thirteen export files no tool read. Each one is now read, or has its reason in the gap
report. Source for all of it: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), patch 0.5.5.

| File | Now |
|---|---|
| `buffs`, `buff_visuals` | the buff and debuff cards, #89 (`tools/buffs.py`, `design/buffs.md`) |
| `ascendancies` | the Ascendancy cards (below). `tools/tree.py` already read it for the names and the wheel |
| `flavour` | the game's flavour line on 29 more cards (below). `tools/uniqueitems.py` already read it for the uniques' |
| `gem_tags` | already read: `tools/gems.py` puts the game's own name for every gem tag in the gem file (`gem_tags`), and each gem card's `tags` are those names. The gap report counted it as unread because it was stale |
| `mods_by_base` | a check on the craft tables (below) |
| `active_skill_types`, `audio`, `cost_types`, `stat_value_handlers`, `stats_by_file`, `tag_details`, `tags` | not read, each with its reason in the gap report (`tools/gamepull.py` `UNREAD`). A file that turns up with no reader and no reason is listed on a line of its own |

The gap report also now counts a file as read only by its whole name (`tags.min.json` was counted as read because
`gem_tags.min.json` is), reads `tools/dev/` as well as `tools/`, and keeps the export's file list with the pull, so
`--report` has it too.

## Ascendancy cards

`tools/ascendancies.py` writes `data/ascendancies.json` and 22 cards, kind `y`, **Ascendancy** (`assets/kinds.js`).

| Card | From |
|---|---|
| name, sub line "Ascendancy · Ranger" | `ascendancies.min.json`: its name and its class |
| flavour line (`qt`) | the text the game shows on its page, "A woman can change the world with a single well-placed arrow." |
| lines (`ls`) | its notables by name, in the tree's order: 202 of them carded. Each line is a door to the notable's card and the notable is "Named by" its ascendancy (`tools/nodelinks.py` now reads an ascendancy's lines). 7 notables have no card (no stat lines, no skill): named in `missing` |
| text (`t`) | ours, one sentence: eight points, two from each of four Ascensions, in the Trial of the Sekhemas or the Trial of Chaos |
| picture | the icon its small nodes share (`n:passives/deadeye/deadeyenode.webp`), the game's own. The class illustration (`passive_tree_image`) is not served by RePoE |

Left out: the 14 fishing names the game keeps for later (`[DNT-UNUSED] Bait Fisher`) and Abyssal Lich, which has no
nodes of its own on 0.5.5.

Which trial gives which set of points is `data/ascendancies.json` "points": the four Ascensions from #82
(`data/trials.json`, PR #147, when that file is here; the same four entries copied in the tool until then). The
first two sets are in the game's quest states. For the third and fourth the files hold the floor levels and
trial counts, not which set each gives, so those ways carry **Subject to change** (tooltip "Depends on GGG. May
change without notice.") and **Source: the game files for the level; poe2db for which set it gives**. The card
does not draw the table yet: it is a table of rows, and the frame has no field type for one outside the orb
ladders. A field type for it (one row per Ascension: the trial, the level, the label) is the widening when the
front end takes it.

## Flavour

`tools/carddata.py` joins the game's flavour file onto a card the drill-down's files give none: a unique by its
one piece of art (14: Infernoclasp, Thunderstep, Ab Aeterno...), a base item, gem or Atlas item by its own (8
amulets and belts, the 4 lineage supports, the 3 Calamity Fragments). Art a unique lends a base (Ancient Mail
wears a unique's) carries the unique's words, so it is never a base's. A unique with several pieces of art, each
with its own words (Guiding Palm), is left alone.

## mods_by_base

`python tools/dev/modsbybase.py` holds every base in `data/craft/` up against the export's own list of which
modifiers roll on it, and at what level: rolling modifiers against the prefix and suffix lists, corruption
against the corrupted list. **1,523 bases, every modifier and level the same.** 4 are left out and counted: the
Grasping Mail bases, whose implicit "Can roll Ring Modifiers" adds spawn tags the export's per-base list does not
see (the craft table has them, and the check first flagged all four). Desecrated modifiers are not per base in
the export and are not compared. It reads the copies `tools/gamepull.py` keeps, fetches nothing, runs in under a
second, and is the guard's `mods` line; on a checkout without the copies it passes and says so.
