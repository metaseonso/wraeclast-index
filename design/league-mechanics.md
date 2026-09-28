# League mechanics: the mechanic fields and the popularity strip

The design for [issue #81](https://github.com/metaseonso/wraeclast-index/issues/81) (a card per league mechanic) and the
data half of [issue #104](https://github.com/metaseonso/wraeclast-index/issues/104) (what players trade, per mechanic),
in the terms of the frame ([`docs/frame.md`](../docs/frame.md)). The data is built, and two of the three fields are
declared and drawn (`share` and `mechlines`, in `assets/kinds.js` and `assets/app.js`). The share chart, the groups
and the popularity strip are what is left. It sits beside [`hidden-odds.md`](hidden-odds.md), whose Pool kind it links
to.

## What is built

`tools/mechanics_league.py`, the pipeline's `leaguemech` stage (after `odds`), writes `data/leaguemech.json`: 57.9 kB,
18.6 kB gzipped. It reads the index, `data/market.json`, `data/odds.json`, `data/atlas.json`, `data/bosses.json`,
`data/leagues.json`, the game's own tables through `tools/gamepull.py` `dat()` (the Currency Exchange's own
categories, the stash tab layouts, the base item names, and the rites' campaign areas and bosses from
RitualWorldAreaGroups, off GGG's patch CDN), and one thing only the owner's machine has:

- GGG's Currency Exchange feed as archived by the hour (`WI_CX`, default `wraeclast-data/cx`). With no archive the
  tool keeps the popularity already in the file, and the currency in the order it was last ranked

One entry per mechanic a player meets: Ritual, Abyss, Breach, Delirium, Expedition, Strongbox, Essence, Shrine, Rogue
Exile, Azmeri Spirit, Trials, Atziri's Temple, and the two leagues Forbidden Rites (0.5.5) and Runes of Aldur (0.5).
Atziri's Temple is not on the ticket's list. It has its own atlas sub-tree, tablet and exchange category, and without
it 2% of every league's trading would belong to nothing.

| Mechanic | Card it is | Its currency | Atlas passives | Tablets | Bosses | Odds |
|---|---|---|---|---|---|---|
| Ritual | Ritual (keyword) | 48 | 19 | 1 | 2 | Ritual altars |
| Abyss | Abyss (keyword) | 25 | 19 | 1 | 1 | |
| Breach | Breach (keyword) | 30 | 18 | 1 | 3 | |
| Delirium | Delirium (keyword) | 30 | 16 | 1 | 1 | |
| Expedition | Expedition (keyword) | 60 | 13 | 2 | 1 | |
| Strongbox | Strongbox (keyword) | none | 21 | | | Strongboxes |
| Essence | Essence (keyword) | 82 | 25 | | | |
| Shrine | Shrine (keyword) | none | 19 | | | |
| Rogue Exile | Rogue Exile (keyword) | none | 19 | | | |
| Azmeri Spirit | Azmeri Spirit (keyword) | 1 | 27 | | | Azmeri spirits |
| Trials | none yet | 10 | | | 2 | |
| Atziri's Temple | Vaal Beacon (keyword) | 19 | 19 | 1 | 2 | |
| Forbidden Rites | Rite of the Nameless (keyword) | 1 | 1 | | | Foretold Bounty, Foretold Proliferation |
| Runes of Aldur | Verisium Remnant (keyword) | 6 | | | | |

Every list holds card names only: a currency card, an atlas passive, a tablet, a boss, a keyword. A name no card
answers to yet sits in `nocard` instead (Petition Splinter, the four Expedition artifacts, Runic Splinter, Exotic
Coinage, Djinn Barya), so the card half never links to nothing. Waystone modifiers have no cards, so they are
lines: `{n: affix, ls: the line}` (the ten Abyssal desecrated modifiers today). What a Forbidden Rite can foretell
is `odds`: the outcomes of its pools that are cards, with `oneIn` and the pool's flag. It has 34, from "Omen of
Dextral Exaltation, 1 in 15" to Mageblood.

## No new kind: fields on the keyword card that already exists

Frame step 4 asks first: does anything in the index already answer to this name? Thirteen of the fourteen do. The
game's glossary has an entry for each, and the site already cards it as a keyword with the game's own words:
Ritual is `w:ContainsRitual`, the Temple is `w:ContainsIncursion` ("Vaal Beacon"), Forbidden Rites is
`w:RitualRiteOfTheNameless` ("Rite of the Nameless"), Runes of Aldur is `w:ContainsExpedition2` ("Verisium Remnant").
A Mechanic kind would be a second card for each of them, which the frame says is a field on the card that exists
and not a kind. So each entry names its card (`card`, an internal key, never drawn), and its `line` is that
keyword's own first sentence, so the one plain line is the game's.

Nor is it the Mechanics kind `h`. An `h` card is ours, for a mechanic the game never writes down
([`docs/mechanics-cards.md`](../docs/mechanics-cards.md), the test a card has to pass). Ritual is written down.

**Trials is the one exception.** The game has an entry for the Sekhema keys and none for the Trial of the Sekhemas
or the Trial of Chaos, which passes that test's case 1. It becomes one `h` card, "Trials", in `tools/mechanics.py`,
with its words gated on "Trial of the Sekhemas" and "Trial of Chaos" (`fg`). Until it exists its entry has no
`card` and a line of ours, and its source says so.

## The fields (frame step 2, three new field types)

All three read `data/leaguemech.json` the first time a card that carries them opens, never in first paint, and find
the entry whose `card` is the card's own key. A keyword that is not a mechanic finds none and draws nothing.

`share` and `mechlines` are in (`assets/kinds.js`, `TYPE.share` and `TYPE.mechlines` in `assets/app.js`), on `w`
and `h`. `share` sits in `body`, not `fact`: a box that fills when its file lands is a body block, and a fact that
might draw nothing would leave a stray separator. It draws the newest league's share, the move over the last 7 league
days against the 7 before (each day weighed by what it traded), and the league's days as a sparkline, with the source
and the method in its tooltip. `sharechart`, every league side by side, is still to draw:

```js
sharechart: {type: 'sharechart', slot: 'body', file: 'data/leaguemech.json', label: 'Share of trading by league day'},
```

| Field | Slot | Draws | Absence |
|---|---|---|---|
| `share` | `body`, popup only | **Of what the Currency Exchange traded, Forbidden Rites: 16.9%**, the move over 7 days in points, and the league's days as a sparkline | no currency (Strongbox, Shrine, Rogue Exile): nothing drawn |
| `sharechart` | `body`, popup only | one line per league, each day's share, league day 1 to the end, past leagues beside it each in its own colour and dash, the same rule the price chart keeps. The key says how many days a short league has | fewer than 2 days: no chart |
| `mechlines` | `body`, popup only | its waystone modifiers as `affix: line`, then the campaign bosses as `area: boss`, each list under its own label and count | nothing to list: nothing drawn |

**Kinds that carry them:** `w` and `h`, one word each in `fields`. The guard's frame check measures the widest
`fact` and `body` again with them in; both must stay under their caps (8 and 6).

**Labels.** `Source: Currency Exchange (GGG public feed), archived by the hour` sits under `share` and
`sharechart`, with the method (below) in its tooltip. A share is measured, not modelled, so it never carries
**Estimate**. An `odds` outcome from a pool that is not sure carries **Subject to change** (tooltip *Depends on GGG.
May change without notice.*), exactly as on the Pool card. The card's `source` block reads each entry's `source`:
**Source: game files, patch 0.5.5 (its line, its currency, the atlas passives, the tablets)**, and for the bosses
**Source: data/bosses.json (Path of Building, Exiled Exchange 2, PoE2 Wiki)**.

## The groups (frame step 3, new relationships)

Everything else on the entry is a card, so it is Connections, not a field: a mechanic *has* its currency, and a
currency is *of* its mechanic. One `needs: 'leaguemech'` map built from the file the first time a card asks, and one
`EDGE` function per pair. No kind is named in either.

| `REL` | Label, from the card you are on | Rows | Built from |
|---|---|---|---|
| `mechcur` / `curmech` | Its currency / Currency of | `c` / `w`, `h` | `currency` |
| `mechatlas` / `atlasmech` | Atlas passives / Adds to | `a` / `w`, `h` | `atlas`, filter `atlas` |
| `mechtabs` / `tabmech` | Tablets / Adds | `a` / `w`, `h` | `tablets`, filter `atlas` |
| `mechboss` / `bossmech` | Bosses / Boss of | `x` / `w`, `h` | `bosses`, filter the Bosses tab |
| `mechpool` / `poolmech` | Its odds / Rolls inside | the Pool kind ([hidden odds](hidden-odds.md)) / `w`, `h` | `pools` |
| `mechpart` / `partmech` | Part of / League content in it | `w` / `w` | `partOf`: Forbidden Rites is part of Ritual, Runes of Aldur of Expedition |

Connections keeps its own rule: 8 rows, the true total beside the label, See all where there are more than 10.
Essence's 82 currencies cost 8 rows and one number. The currency is ordered by what it traded over every league
read, most first, which is the order the file ships.

The ticket's other links fall out of these. The Bosses tab: a boss card's **Boss of** row. The Farms tab (#56,
shut for rebuilding): a farm names the mechanic's card, and the card has the rest.

## The popularity strip (Atlas and Farms tabs)

Not a card slot. It is a page surface, the way the Currency tab's list is, and it reads `popularity` and nothing
else.

- **One row per mechanic** in `rows` (the eleven with a currency), ranked by today's league share, highest first.
  Each row: the mechanic's name as a link to its card, a bar, the share, and the move over 7 days. A mechanic with a
  share under 0.1% draws `under 0.1%`, never `0.0%`.
- **The league** is a switch over it: this league, then the ones before it, newest first, from `leagues`. The strip
  never mixes two leagues in one ranking.
- **Rows past the eighth** follow the Connections rule: 8 and See all 11.
- **Under it**, one line: `Source: Currency Exchange (GGG public feed), archived by the hour`, with `method` in its
  tooltip. The method says, in its last sentence, that this is what players buy and sell and not what they run.
- **A league day with fewer than 24 hours** (`days[i][0]`) is drawn, and the strip says the hours on that day's point.

## How the share is worked out

From the file's own `method`, in full:

- Each hour of the archive, the exalted value of everything bought with a Divine, Exalted or Chaos Orb, at that
  hour's own rates: exalted per divine from that hour's Divine and Exalted market, chaos from that hour's Divine and
  Chaos market, or its Exalted and Chaos market. No rate is carried from another hour, and nothing is modelled.
- Orbs traded for orbs are money changing hands, not a thing bought: left out.
- Two other things traded for each other have no price that hour: left out and counted (`left.unpriced`).
- An hour with no Divine and Exalted trades has no rate: left out and counted (`left.norate`: 7 hours over five
  leagues).
- A day's share is a mechanic's currency's value over the value of everything bought that day, in basis points.
  What no mechanic claims (Divine Orb, runes, gems, pinnacle fragments) is the rest of the 100%.
- Only the public trade leagues `data/leagues.json` names, softcore. Standard, Hardcore and every private league
  (`(PLnnnnn)`) are never read.

It measures trading, and trading is not play. Most of Ritual's share is its crafting omens: in Dawn of the Hunt,
Omen of Whittling alone was half of everything bought.

| League | Days | Ritual | Abyss | Delirium | Breach | Runes of Aldur | Atziri's Temple | Trials | Expedition |
|---|---|---|---|---|---|---|---|---|---|
| Forbidden Rites (0.5.5, running) | 23 | 16.9% | 16.4% | 5.9% | 2.9% | 1.8% | 1.7% | 1.1% | 0.8% |
| Runes of Aldur (0.5) | 121 | 17.9% | 12.0% | 4.1% | 2.4% | 4.3% | 2.6% | 0.9% | 1.2% |
| Fate of the Vaal (0.4) | 165 | 12.6% | 11.2% | 0.3% | 1.7% | | 1.8% | 0.8% | 0.9% |
| Rise of the Abyssal (0.3) | 101 | 23.8% | 16.4% | 3.3% | 0.3% | | | 0.1% | 0.8% |
| Dawn of the Hunt (0.2) | 144 | 74.9% | | 1.5% | 0.5% | | | 0.1% | 0.1% |

## The grouping, written once

Each mechanic's `currency` list is the table: a name is in one list or in none. The rules, first that answers wins:

1. **league**: what a league brought, named in the tool with the reason. Sacred Bloom first traded on the first day
   of Forbidden Rites and never before. Aldur's Saga says "Runes of Aldur only", and the five Aldur runes are the
   game's own Aldur's Legacies.
2. **cx**: the Currency Exchange's own category or sub-category. 286 of the 312 names.
3. **stash**: the mechanic's own stash tab, and the Expedition artifacts. This places Petition Splinter, which the
   exchange no longer lists but the past leagues traded.
4. **boss**: what opens the mechanic's boss in `data/bosses.json` (Exiled Exchange 2).
5. **named**: ours, in `named` with the reason: Zarokh's Reliquary Keys to Trials, Azmeri Reliquary Key to Azmeri
   Spirit, Exotic Coinage to Expedition.

Each entry's `from` says which rules placed its currency.

## What the guard proves

- `own_ids` (the last good rule, `tools/lastgood.py`) holds `data/leaguemech.json` to its own `ids`, as it does
  `data/odds.json`. Only `key`, `card`, `partOf`, `rows`, `to` and `from` may hold an internal key, and none of them
  is drawn.
- `voice`: `tools/mechanics_league.py` is read with `tools/mechanics.py`, since it writes a line a player reads.
- `frame`, once the rework lands it: the three types have renderers, `fact` and `body` stay under their caps, the
  twelve groups name real maps and kinds, and no card is its own row.

## Left for the rework

- Draw `sharechart`, the `REL` pairs and their `EDGE`, the strip on the Atlas tab, and on the Farms tab once it
  opens (`share` and `mechlines` are in).
- The Trials `h` card in `tools/mechanics.py`, id `Trials`. `tools/mechanics_league.py` picks up `h:Trials` once
  the index holds it, and its line becomes the card's.
- Cards for the names in `nocard`, so that they have somewhere to go.
- Run the tool on the data server after the archive's hourly update, so the running league's days keep coming.
