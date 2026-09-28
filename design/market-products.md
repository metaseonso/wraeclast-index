# Market products: the Currency Exchange, measured

The data half of the market tickets ([#99](https://github.com/metaseonso/wraeclast-index/issues/99) liquidity,
[#100](https://github.com/metaseonso/wraeclast-index/issues/100) league-day curves and the league-start playbook,
[#101](https://github.com/metaseonso/wraeclast-index/issues/101) the inflation index,
[#102](https://github.com/metaseonso/wraeclast-index/issues/102) patch shocks,
[#103](https://github.com/metaseonso/wraeclast-index/issues/103) best time to sell,
[#105](https://github.com/metaseonso/wraeclast-index/issues/105) crafting demand,
[#106](https://github.com/metaseonso/wraeclast-index/issues/106) rising fast,
[#108](https://github.com/metaseonso/wraeclast-index/issues/108) the league, Hardcore and past-league gap) and the
composition of [#107](https://github.com/metaseonso/wraeclast-index/issues/107), the weekly digest. The data is built;
the drawing is not. `assets/`, `index.html` and the CSS stay as they are because the front end is being reworked for
1.0, and no field is declared in `assets/kinds.js` yet: this page says, in the terms of the frame
([`docs/frame.md`](../docs/frame.md)), where each product goes when it is. Each product lands in its own pull request;
this page grows a section with each.

## What is built

`python tools/market_history.py` writes `data/market/`. It runs as the pipeline's `markethistory` stage
(`tools/pipeline.py`, daily). About 30 seconds with a warm cache, 60 cold.

| Part | What |
|---|---|
| `tools/cxlib.py` | The exchange archive, read one way: the derived rows, then the raw hours after the last derived one, and every hour valued (below). `hour_values` is #148's (`tools/mechanics_league.py`), moved here unchanged, so that tool can import it instead of keeping its own copy |
| `tools/marketlib.py` | The leagues, their hours and days, and how a product file is headed |
| `tools/market_history.py` | Runs the products in order and puts each currency card's parts into one file per card |
| `tools/market_<product>.py` | One per ticket. Each has its rule in words and every number of it at the top |
| `tools/dev/marketcheck.mjs` | The check (below), and the guard's `market` line |

Every file carries `source` ("Source: Currency Exchange (GGG public feed), read every hour since 6 Dec 2024"),
`flags` (`Subject to change`: "Depends on GGG. May change without notice."), `updated` (the last hour read), `rule`
(the rule in words, as a page can print it) and `numbers` (the rule's numbers). `data/market/index.json` lists every
file with its bytes, and the leagues read.

Nothing under `data/market/` ships with the site: the site serves the copies the data repo's daily job sends in
(below, "When new hours arrive"), at `/data/market/<name>`. The tool names every file, so none is an orphan to the
budget check.

## The shared rules

**The source.** GGG's Currency Exchange feed, every hour since the first hour with markets (6 Dec 2024 23:00 UTC),
archived in the private `wraeclast-data/cx` (`WI_CX`). Per market (a pair of currencies) and hour: what changed hands on
each side, and the range within the hour of the stock and of the ratio. A range, not an order book: nothing here is a
bid, an ask or a spread.

**What a thing is worth in an hour.** The one method `tools/exchange.py` already prices by, and #148 values trading by:
exalted per divine from that hour's Divine and Exalted market; chaos from its Divine and Chaos market (else its Exalted
and Chaos market); everything bought with one of the three is valued in exalted at those rates, and its price is the
exalted paid over the amount bought. Money for money is left out; a trade of two other things has no price in that hour
and is counted; an hour with no Divine and Exalted trade has no rate and is counted. Nothing is carried over and
nothing is modelled.

**The leagues.** `data/leagues.json`'s, oldest first: Early Access (Standard and Hardcore until 0.2 opened), Dawn of the
Hunt, Rise of the Abyssal, Fate of the Vaal, Runes of Aldur, Forbidden Rites; each with its Hardcore. Private leagues
(`(PLnnnnn)`) are never read, and the check fails a file that names one.

**A league day** is 24 hours from the league's first hour with a Divine and Exalted trade (Forbidden Rites: 4 Sep 2026
23:00 UTC). Leagues open at different hours, so a league day is not a date. Forbidden Rites is on day 23 as of the last
hour read (27 Sep 00:00 UTC); day 22 is its last full day.

**Prices** are in divines, each league in its own orbs (the Divine Orb's own in exalted). An exalted or a divine is
not worth the same in two leagues, and nothing here pretends it is.

**Labels.** Every file: `Source: Currency Exchange` and `Subject to change` (tooltip "Depends on GGG. May change without
notice."). `Estimate` goes on anything modelled; nothing here is (every number is a sum or a ratio of what traded), so
no product carries it today. A product that one day converts across leagues or fills a gap would carry it.

**No internal ids** (#12). Every currency is its game name (BaseItemTypes, the decoded tables in `wraeclast-data/game`);
the check fails a file with a `Metadata/` id in it. A card file is named by the `did` `data/market.json` gives the card
(`orb-of-annulment`), else the same rule on the name.

## When new hours arrive

The archive job in `wraeclast-data` (`.github/workflows/archive.yml`) adds the new hours every 6 hours (at :23 past 0,
6, 12 and 18 UTC) as raw files, and builds a month's derived rows on the 2nd of the next month. `tools/cxlib.py` reads
the derived rows and then every raw hour after them, so the products are current to the last archived hour whichever
of the two the hours are in.

**Who builds it and how it reaches the site (the owner's decision, 28 Sep 2026).** The files are not committed here:
a card file changes every day, and 700 of them a day is churn the repo does not need. The data repo builds them, since
it holds the archive, and sends them to the site the way the hourly jobs send theirs, with no new token:

1. `metaseonso/wraeclast-data`, `.github/workflows/market.yml` ("Market"), runs daily at 00:47 UTC and after every
   Archive run. It checks out its own `cx/` sparsely (`cx/derived/leagues.json`, the public leagues' derived files,
   Standard and Hardcore only to April 2025, the raw hours of this month and last) and the decoded `BaseItemTypes`, and
   this repo, which is public, at `main` (an input, `wi_ref`, picks another branch; until #155 is merged the job has
   no tools to run on `main` and says so).
2. It runs `python tools/pipeline.py --only markethistory --force` with `WI_CX` on its checkout (the stage's own
   checks and last good copy apply), `node tools/dev/marketcheck.mjs` (the files and the sums from the raw hours),
   then `python tools/market_send.py`, which packs `data/market/` into `build/market-send/` (below).
3. It sends each file to `POST https://wraeclastindex.fyi/api/data/put?name=market/<name>`, signed with the job's own
   GitHub token (OpenID Connect, audience `https://wraeclastindex.fyi`). `worker/files.js` takes a market name
   (`MARKET`) only from that workflow on the data repo's `main` (`MARKET_JOBS`), and takes nothing else from it.
   `workflow_dispatch` with `dry_run` builds and packs and sends nothing.

What is sent (`tools/market_send.py`; each file at most 1.4 MB, under the worker's 1.5 MB):

| Name | What |
|---|---|
| `<product>.json` | each product file as the tool wrote it: `liquidity`, `playbook`, `inflation`, `sell`, `crafting`, `rising`, `gap` |
| `shocks.json`, `digest.json` | a folder of files as one: `{"files": {"0.5": ..., "2026-W38": ...}}` |
| `cards-<n>.json` | the currency cards' parts, `{"cards": {"<did>": card}}`, in as few bundles as fit (4 today). A card's bundle is crc32 of its did, mod the bundle count, so a card stays put from day to day |
| `index.json` | `data/market/index.json`, plus `site`: each file's bytes, the bundle count and `cards` (did -> bundle) |

Every file keeps its `source`, `flags`, `updated` (the last exchange hour read), `rule`, `numbers`, and `thresholds`
(`{"version": 1, "set": "2026-09-28", "note": "First numbers, set 28 Sep 2026. They are reviewed after one week of
data."}`): the owner took this page's defaults as version 1. A page prints the note beside the rule. A change to any
rule's numbers is version 2, in `tools/marketlib.py`.

**How the front end fetches.** `GET /data/market/<name>` (the worker, `worker/index.js`): the newest copy the job sent,
each data centre keeping it 5 minutes, with its age in the headers (`X-Data-At`, when it came in, unix seconds;
`X-Data-Age`, seconds since; `Last-Modified`). A file not sent in yet is a 404, never an older build. A card: fetch
`/data/market/index.json` once, look up `site.cards[did]`, fetch `/data/market/cards-<n>.json`, read `cards[did]`. A
tab reads its product file directly (`/data/market/liquidity.json`). Show the age the way the price files do: a file
more than two days old says so.

`data/market/` here keeps the product files as the stack committed them (what the check and a review read); the card
files are ignored (`.gitignore`) and exist only where the tool has just run.

## The check

`node tools/dev/marketcheck.mjs`, and the guard's `market` line. Every file under `data/market/` carries its source,
the flag and its rule, has the bytes `index.json` says, and carries no `Metadata/` id and no private league. Then, where
the archive is on the machine, it reads a sample of league days (one in the league still running, one in a past league)
from the raw hours exactly as GGG sent them (not the derived rows the tool reads), works out every hour's rates and five
currencies' daily prices again in its own code, and compares them with the card files' league-day curves and
`inflation.json`'s exalted per divine. The tool rounds to 3 significant figures, so a gap over 0.6% fails. Today there are 12
sums once the league-day curves (#100) and the index (#101) are in, worst gap 0.31%. About 2 seconds; without the archive (on the Checks workflow) the sums are skipped and the line
says so.
