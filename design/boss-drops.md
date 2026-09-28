# Boss drops: "Drops from", both ways

The design for [issue #74](https://github.com/metaseonso/wraeclast-index/issues/74), in the terms of
`docs/frame.md`, with the hook for player drop reports ([#125](https://github.com/metaseonso/wraeclast-index/issues/125)).
The data is built (`tools/bosses.py` writes `data/bosses.json` and `data/dropsfrom.json`); the cards that
draw it are the owner's, for 1.0. Nothing here touches `assets/`.

## What the data can and cannot say

Drop pools live on GGG's servers. The game files carry no drop table (the survey on #83), so **no official
source says what drops where**. Every drop list is a community source, and every row carries the names of the
sources that gave it:

| Source | What it gives | Covers |
|---|---|---|
| Path of Building | `Source: Drops from unique{...}` on a unique | 9 bosses and encounters |
| Exiled Exchange 2 | the pool behind each fragment, invitation, splinter and key | the pinnacle fights |
| Maxroll | the pinnacle loot table, with their word for how often ("Common", "Very Rare") | 12 bosses and the Simulacrum |
| poe2db | a boss page's own drop list, and "Dropped by" or "Drop disabled" on each unique's page | every boss and unique it has a page for |
| PoE2 Wiki | measured drop rates, from kill samples | 10 bosses |

What the files do give is each base's drop level. A unique no source ties to a boss, and that poe2db puts no
limit on, reads "Drops anywhere, from area level N", N its base's drop level. The unique's own level is on the
server too, so that N is an **Estimate**.

The PoE2 Wiki turns cloud addresses away (and web.archive.org resets the connection), so its rates are the
committed copy's until a run from a home connection refreshes them. The tool keeps them and says so.

## The words, exactly

Three labels, and no others, sit beside a drop line:

| Label | When | Tooltip |
|---|---|---|
| **Estimate** | a number the sources imply rather than state: the area level of a world drop | — |
| **Subject to change** | every drop line: a drop pool is the server's, and it changes without a patch | *Depends on GGG. May change without notice.* |
| **Source: X** | one per source that gave the line, X its name as `sources` lists it | — |

A drop rate is only ever a measured one (the wiki's kill samples, with the sample size) and carries
**Source: PoE2 Wiki**. Maxroll's words ("Rare") stay Maxroll's, beside the item, never turned into a number.

## The data

`data/bosses.json`, per boss (the Bosses tab's own file, read by `assets/bosses.js`):

- `drops`: `[{name, base?, kind, src: [sources], said?: {source: word}}]`, as today, with Maxroll and poe2db
  added to the sources.
- `checked`: the sources that had a list for this boss. An item whose `src` is shorter than `checked` is a
  disagreement: one source names it, another that covered the same boss does not. Both stay.
- `nodrops`: `{said: "No special drops", src: [sources read]}` on a boss no source names a drop for.
- `access`, `rates`: unchanged.

`data/dropsfrom.json`, per unique, keyed by the unique's name as the index writes it:

```
"Solus Ipse": {"from": [{"n": "The Arbiter of Ash", "src": ["Path of Building", "Exiled Exchange 2",
                         "Maxroll", "poe2db"], "said": {"Maxroll": "Very Rare"}, "rates": [...]}],
               "st": "boss", "line": "Drops from The Arbiter of Ash",
               "labels": ["Subject to change", "Source: Path of Building", ...]}
"Headhunter":  {"st": "anywhere", "lv": 50, "line": "Drops anywhere, from area level 50",
                "labels": ["Estimate", "Subject to change", "Source: poe2db"]}
```

`st` is one of `boss`, `anywhere`, `gone` (Path of Building: no longer obtainable), `off` (poe2db: drop
disabled) and `unknown` ("Source not known"). `line` is the words a card shows; `labels` the labels beside
it, in order. A `from` entry that is not a boss of its own on the site (the Simulacrum, Atziri's Vault, a
league mechanic poe2db names) is a plain row, not a card. `labels` at the top carries the tooltip.

## In frame terms

**The line on a unique card: move 2, one new field type.** `source` exists, but it reads a field of the
index entry and draws plain words; the drop line lives in its own table and carries labels, one with a
tooltip. So:

```
FIELDS.drop = {type: 'drop', at: 'n', slot: 'body', file: 'data/dropsfrom.json', label: 'Drops from'}
TYPE.drop   = the entry's `line`, then its `labels` as pills; "Subject to change" takes the tooltip
```

The table is fetched the first time a card asks for it, never in first paint, like `adds` and `canroll`. A
card whose name the table does not hold draws nothing. Add `drop` to the unique kind's `fields`, in the body
next to `source`. No kind is named in the renderer, so the day a gem or a currency has a drop line, it is
one word in that kind's `fields`.

*If the owner would rather not add a type:* move 1 works too. `tools/uniqueitems.py` copies `line` and the
labels into the entry's `src` as words, and the `source` field draws them as they stand. What is lost is the
tooltip.

**The Connections group, both ways: move 3, one relationship with two ends** (the pair `grants`/`granted`
already is):

```
REL.dropsfrom = {label: 'Drops from', of: 'x', edge: 'dropsfrom', needs: 'dropsfrom'}   // on a unique
REL.drops     = {label: 'Drops',      of: 'u', edge: 'drops',     needs: 'dropsfrom'}   // on a boss
REL_FILES.dropsfrom = 'data/dropsfrom.json'
EDGE.dropsfrom(it, F) = F.dropsfrom.uniques[it.n].from -> a boss card where one answers to the name,
                        a plain row {n, sub: sources} where none does (Simulacrum, Abyss)
EDGE.drops(it, F)     = every unique whose `from` names this boss (matched as the file matches names:
                        "Tangmazu, The Raven Trickster" is the boss the areas call "The Raven Trickster")
```

The unique kind names `dropsfrom` in its `rel`; the boss kind names `drops`. Read from both ends: a unique
*drops from* a boss; a boss *drops* its uniques. Each row's `sub` is its sources, so a disagreement shows on
the row itself. The group is capped like any other (8 rows, slack 2): Zarokh, with 13 uniques, is the one
boss list today that draws 8 and a **See all 13**.

**The boss card** is `own` (`assets/bosses.js`), so "No special drops" and its sources are that module's to
draw from `nodrops`, the way it draws `drops` and `rates` today. The frame asks nothing new of it.

**The area card (#72):** "What drops here" is the same edge read through the boss: area -> its bosses ->
their `drops`. No table of its own.

## The player-report hook (#125)

Reports fill what the servers hide, and in frame terms they are **one more source in the same file**, so
nothing downstream changes:

- **The ask is an act.** `ACTS.report = {label: 'Report a drop', own: './report.js', go: 'openReport', only:
  {u: ..., x: ...}}`: under a unique card and a boss card, the way `bench` and `pool` sit under theirs. It
  opens a short form: the item, where it fell (a boss or encounter from `bosses.json` and the `from` names),
  area level, date. It posts along the path the Suggest button already takes (`worker/community.js`, #25),
  with the card's own key and nothing about the person.
- **Moderation is a match, not a judgement.** A report is kept only when the item is a unique the index holds
  and the place is a boss or encounter the file already knows. An outlier is held, not shown: an area level
  under the base's drop level, or a boss whose other sources all name a closed list the item is not on.
- **Counts, never guesses.** A nightly step folds the kept reports into `dropsfrom.json` as a source of its
  own: `{"n": "Xesht, We That Are One", "src": ["player reports"], "seen": 14}`. The line reads "Reported 14
  times from Xesht, We That Are One", labelled **Source: player reports**, **Subject to change**. It never
  becomes a rate: a count of reports is not a count of kills.
- **It is data, move (a).** The `drop` field and the `dropsfrom`/`drops` edges draw a player-report row like
  any other row. The one new piece is the act and its module. The report store and the fold are the
  framework's (#96), not this ticket's.
- PC first; other platforms later, said on the form.

## Run it

```
python tools/bosses.py        # writes data/bosses.json and data/dropsfrom.json through tools/lastgood.py
```

The first run reads about 560 poe2db pages, one at a time with a pause between (a day's cache in
`tools/cache/poe2db/`, shared with `tools/uniqueitems.py`); later runs that day are quick. A source that stops
answering or comes back thin keeps the committed files (last good wins), except the wiki, whose rates are
carried over from the committed copy and named in the notes.

## Coverage, 28 September 2026

| | Before | After |
|---|--:|--:|
| Bosses with a drop list | 7 of 104 | 13 of 104 |
| Bosses saying "No special drops", with the sources read | 0 | 91 |
| Uniques that drop from a boss or encounter | – | 91 of 459 |
| Uniques that drop anywhere, from area level N (Estimate) | – | 337 |
| No longer obtainable (Path of Building) | – | 9 |
| Does not drop (poe2db: drop disabled) | – | 3 |
| Source not known | – | 19 |

Where the sources disagree, the file keeps both and the run prints each case. The ones a player would notice:
Assailum and Megalomaniac drop from the Simulacrum (Maxroll) and from Kosis, The Revelation (Path of Building,
poe2db); Blessed Bonds is no longer obtainable (Path of Building) or drops from Zarokh with The Remembered
Tales (poe2db); Immaculate Adherence drops from the Arbiter of Divinity (Maxroll), where poe2db's page names
no boss; the Vessel of Kulemak drops Darkness Enthroned and The Unborn Lich (poe2db, Exiled Exchange 2), which
Path of Building does not list.

## Left open

- The wiki's rates date from the last run that reached it; a run from a home connection refreshes them.
- A unique on a base the export has no drop level for (19 today, most of them listed only on a Runemastered
  base) says "Source not known" even where poe2db puts no limit on it.
- Map bosses: no source names a special drop for any of them. 91 bosses say "No special drops" with the
  sources read; Medved and Vorana, the two Expedition bosses Maxroll does not cover, are among them. Player
  reports are the way that changes.
