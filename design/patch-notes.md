# Changed in: GGG's patch notes on the card

A proposal for #86. Nothing here is built: the front end is being reworked for 1.0, so this says what the card
should draw and where it sits in the frame ([`docs/frame.md`](../docs/frame.md)), and the data it reads is
already made by `tools/patchnotes.py` (the `patchnotes` stage of `tools/pipeline.py`). The dates, leagues and
threads are `data/patches.json`, the patch registry `tools/patches.py` keeps (#97); this file names a patch by
its row id there and keeps nothing of it twice.

## What a player gets

Open the Frostbolt card. Under its lines:

> **Changed in**
> **0.4.0** · 4 Dec 2025 · Gem Changes
> Frostbolt: Now has 120-195% more Magnitude of Chill inflicted at Gem levels 5-20. …
> **0.2.0e** · 10 Apr 2025 · Player Balance Changes
> Frostbolt's Explosion radius is now 2.4 metres (previously 1.6).
> …
> Source: GGG patch notes

GGG's words exactly as posted, newest patch first. The version is the link to its thread. The section is GGG's
own heading. Words in a line that name another card are doors, marked the way every card's lines are
(`assets/marks.js`), so a line that names Frostbolt and Frost Bomb opens either one.

## The data

`data/patchnotes.json`, built by `python tools/patchnotes.py` from the first post of every thread
`data/patches.json` names (GGG's patch notes forum, https://www.pathofexile.com/forum/view-forum/2212), official
data only.

| Part | What it is |
|---|---|
| `patches` | every registry row with a notes thread, oldest first: its `id` in `data/patches.json` (`0.5.5c`, `0.5.5 hotfix 2`) and the thread it was read from. The version, title, time (`posted`, UTC) and league are read off `data/patches.json` |
| `heads` | GGG's section headings ("Skill Gem Changes", "Bug Fixes") |
| `lines` | `[patch, heading, GGG's words]`, only lines that name a card |
| `on` | card key → the lines that name it. The key is the kind and the name, `g:Frostbolt`, `u:Bluetongue`: what the card already carries, never a game id (#12) |
| `unmatched` | lines that name no card: counted per patch and heading, not shipped. The lines themselves are in `tools/dev/patchgaps.txt` (`--gaps`) |
| `names` | a fingerprint of the names matched against, so a run knows when the index has moved on |

Today: 259 threads (0.1.0 Hotfix, 7 Dec 2024, to 0.5.5c, 17 Sep 2026), 6,175 lines, 4,067 of them naming a
card (66%), 1,925 cards named. A line GGG repeat under "Updates to Patch Notes" in the same post is kept once,
under its own section; a corrected line with new wording is GGG's correction and stays. The #86 test holds: every gem, unique, passive and keystone the index cards
that 0.5.5's notes name has its line. What 0.5.5 leaves unmatched names bosses, league mechanics, UI and
crashes. The bosses are cards in `data/bosses.json` but not in the index, so they are the first gap to close.

How a name is found: case-sensitive, whole words, longest name first ("Herald of Ash" before "Ash"), with a
trailing `s` or `'s` allowed. Every kind the index cards counts, keyword cards too, except the tree's small
passives (`lo`: "Strength" in a line is the word, not the node) and our own mechanics and interaction cards,
which GGG never names. "Freeze Support" is the Freeze gem only. A bare "Freeze" is both the gem and the
keyword, which is the same rule `assets/marks.js` keeps.

## In frame terms

Procedure (b), step 2: **a new field type**. Nothing draws the shape today. `adds` is the nearest (a table of
its own, keyed off the card), but a patch line carries a version, a date, a link and a heading.

```js
// FIELDS, assets/kinds.js
changed: {type: 'changed', at: 'n', slot: 'body', file: 'data/patchnotes.json', label: 'Changed in', src: 'GGG patch notes'},
```

- **`TYPE.changed`** in `assets/app.js` builds the key `k + ':' + n` from the entry. It reads `on[key]`,
  groups the lines by patch, newest first, and draws each group as a heading row (version as the thread link,
  the date, GGG's section) and then the lines. No kind is named in it.
- **Where it sits.** In `REST`, after `flow` and before `source`, so every kind carries it with one word and
  a card with nothing in the file draws nothing (frame: "Absence. Nothing drawn."). No kind declaration
  changes.
- **First paint.** Never. Like `adds`, it draws in the popup only (`o.full`), and the file is fetched the
  first time a popup asks for it. The grid card stays as it is.
- **The list inside the block.** The frame's rule for a block that is a list applies unchanged: 4 lines in
  the grid (not drawn there anyway), every line in the popup. Measured: the median card has 2 lines, 194 of
  1,925 cards have more than 8, and the widest is the Quality keyword with 159. See the open questions.
- **Source.** The block ends with `Source: GGG patch notes`, and each version links its own thread.
- **Dates.** The date is when GGG posted the thread (`posted` on its `data/patches.json` row, UTC), shown in the reader's own day. A content
  update's notes go up days before the league starts: 0.5.0's thread is 21 May 2026, and Runes of Aldur
  started 30 May.
- **Subject to change.** A content update whose league has not started yet (its `v` matches a league in
  `data/leagues.json` whose `start` is later than today) wears the `Subject to change` pill, with the tooltip
  *Depends on GGG. May change without notice.* GGG edit notes before launch, and their "Updated Patch Notes"
  sections show it. Nothing else here is an estimate: the lines are GGG's own.

## `data/patches.json` (#97)

On main: `tools/patches.py` keeps it (every patch, hotfix and restart, the hour its notes went up, its league,
thread and tree export commit, and every client build the index has carried). This proposal reads it and
adds nothing to it.

## Size

776 kB as written, 224 kB over the wire (gzip), one fetch per visit, then kept by `sw.js`. Keywords are two
thirds of it. If that is too much for one popup, the same run can write one file per kind instead, and the
field reads `file: 'data/patchnotes/@k.json'` (the frame's `@field` rule). Measured per kind, gzip: keywords
151 kB, gems 85 kB, passives 31 kB, item classes 28 kB, uniques 25 kB, the rest under 20 kB. That is one flag
in the tool and one word in the declaration.

## Open questions for the owner

1. **One file or one per kind** (above).
2. **Keyword cards.** They are the noisiest: "Maximum" matches "Maximum Life" (102 lines), "Armour" 145.
   Keep them (same rule as `marks.js`), or show on a keyword card only the lines that name no other card?
3. **A cap in the popup.** Draw every line (the frame's rule today), or the newest 8 patches and a
   `See all N` the way Connections does? The second is a new number in `FRAME` and reaches every card at once.
4. **Hourly on the live site.** `tools/patchnotes.py` is cheap on an ordinary run (any new thread, and the
   last three days' again). For a new hotfix to land on the live site within the hour, `tools/patches.py
   --notes` and this would join the data server's hourly files: `NAMES` in `worker/files.js` and a line in the
   data server's job. Not done here: today it is a patch stage.

## Feeds

#73 (the data diff) and #75 (gem history) read the same file: the diff says which numbers moved, the line
says why, in GGG's words. #96 reads `data/patches.json` to place a build in time.
