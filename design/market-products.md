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

Nothing under `data/market/` ships to the site yet: `tools/build.mjs` ships a file below `data/` only when a page asks
for it, and no page does until the front end draws these. The tool names every file, so none is an orphan to the
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

## #99 Liquidity: `data/market/liquidity.json`

33.2 kB (10.3 kB gzipped). `tools/market_liquidity.py`. One row per currency the league traded in the last 24 hours,
already in the order the Currency tab sorts by: `[name, pill, hours traded of 24, divines traded, ratio range %
(middle hour), in stock this hour (up to)]`.

**The rule.** Over the last 24 hours read, on its markets against Divine, Exalted and Chaos Orbs. **Easy to trade**:
traded in 20 or more of the 24 hours, and 50 divines or more changed hands. **Thin to trade**: traded in fewer than 6
hours, or under 1 divine changed hands. **Slow to trade**: everything between. **In stock**: the most of it on offer
this hour on those markets, added together (the top of the hour's stock range).

The ratio range is in the row but not in the pill, which the ticket had asked for. Measured over Forbidden Rites' last
day, the middle hour's range grows with the market: 0% for currencies trading under 10 divines a day (one trade, one
ratio), 25% at 10-100, 100% at 100-1,000, 58% at 1,000-100,000, 10% above that. In the pill it would call Orb of
Annulment (604,000 divines a day, every hour) slow. It is a range within the hour, never a spread.

**Today** (26 Sep 01:00 to 27 Sep 00:00 UTC): 656 currencies, 391 Easy, 218 Slow, 47 Thin. Omen of Light: Easy, 24
hours, 1,490,000 divines, up to 12,667 in stock this hour.

**In the frame.** Procedure (b), step 2: one field type, since nothing draws a value read by name out of a file of its
own into the pill and fact slots.

```js
// FIELDS, assets/kinds.js
liquid: {type: 'market', of: 'pill', slot: 'pill', file: 'data/market/liquidity.json', src: 'Currency Exchange'},
stock:  {type: 'market', of: 'stock', slot: 'fact', file: 'data/market/liquidity.json', pre: 'Up to about ', post: ' in stock this hour'},
```

- **pill**: `Easy to trade`, `Slow to trade`, `Thin to trade`, the rule (`rule`) as its title, `Subject to change` on it.
- **fact**: `Up to about 12,667 in stock this hour`. Never "bid", "ask" or "spread".
- **Currency tab**: a sort, "Easiest to trade", is the file's own row order; the counts (`counts`) sit over the list.
- The currency kind (`c`) adds `liquid` and `stock` to its `fields`. A card the file has no row for draws neither.

**The owner decides**: the four numbers (20 hours, 50 divines; 6 hours, 1 divine), and whether the ratio range is
shown at all.

## #100 League-day curves and the league-start playbook

`tools/market_leaguedays.py`. Two outputs.

**Each currency card's curves** (card part `days`, in `data/market/card/<did>.json`): its price by league day in every
league the archive holds, `[[league, [day 1, day 2, ...]], ...]`, null where it did not trade. And `sameDay`: its
price on the league's last full day, and the last three leagues' on that same league day. 688 card files, 3.3 MB in all
(about 1 MB gzipped), the largest 8.9 kB; `days` is about 4.3 kB of a busy currency's file.

> Orb of Annulment, day 22: 0.718 div. Rise of the Abyssal on day 22: 0.326, Fate of the Vaal 0.102, Runes of Aldur
> 0.594.

**The playbook** (`data/market/playbook.json`, 4.6 kB): week 1 (league days 1-7) of the last three leagues and of this
one so far. The 15 currencies that traded for the most divines in week 1 (Divine and Chaos Orbs left out: they are what
the rest is paid in), each with its week-1 price, its price on league days 14, 28 and 56 as a % of that, and the first
day after week 1 when it was half the week-1 price or less. Measured history only, no forecast.

> Runes of Aldur, week 1: Rakiata's Flow 103 div (111% of that on day 14, 149% on day 28); Omen of Abyssal Echoes 1.25
> div (47% by day 14, half by day 13). Rise of the Abyssal: Perfect Jeweller's Orb 0.621 div, 9% by day 28.

**In the frame.**

- The card's chart is already settled in the frame: "Past leagues draw beside it, each in its own colour and its own
  dash." What changes is the axis: league day, not date. One field, step 2, a new type reading the card's own file:
  `leaguedays: {type: 'leaguedays', slot: 'body', file: 'data/market/card/@did.json', label: 'By league day'}`. The
  currency cards carry `did` on the Currency tab (`data/market.json`); index currency cards (`c`, 96 of them) do not yet,
  so `tools/carddata.py` adds it, or the field reads the name by the same rule.
- The same-day line is a fact: `Day 22: 0.718 div · last leagues on day 22: 0.326, 0.102, 0.594`, one field of the same
  type (`of: 'sameDay'`).
- The playbook is a block on the Currency tab ("League start"), not a card: one table per league, newest first, the
  week-1 price in the `money` type's own format.

**The owner decides**: three leagues, the top 15, ranked by divines traded (the other reading of "worth most" is the
dearest unit price: a list of Mirrors), and days 14, 28 and 56.

## When new hours arrive

The archive job in `wraeclast-data` (`.github/workflows/archive.yml`) adds the new hours every 6 hours (at :23 past 0,
6, 12 and 18 UTC) as raw files, and builds a month's derived rows on the 2nd of the next month. `tools/cxlib.py` reads
the derived rows and then every raw hour after them, so the products are current to the last archived hour whichever
of the two the hours are in.

The data repo is private, so a WI job needs either a token or a file the data repo publishes. **Recommended: the token
WI already has.** The Game patch workflow reads the same repo with `DATA_REPO_READ`, a read-only token for that one
repo (`WI_DATA_TOKEN`, `tools/gamepull.py`). A daily "Market history" job, at 00:47 UTC (after the 00:23 archive run,
so the league day that just ended is in), would:

1. check out `wraeclast-data` with that token, sparse: `cx/derived/leagues.json`, the public leagues' derived files
   (`cx/derived/*/<league>.jsonl.gz` for the leagues `data/leagues.json` names, about 250 MB), `cx/raw/<this month>`
   and `cx/raw/<last month>`, and `game/<patch>/out/raw/BaseItemTypes.json`;
2. restore `tools/cache` (actions/cache, as `patch.yml` does: the valued hours per league and month, about 400 MB, so
   only the month still running is read again);
3. run `python tools/pipeline.py --only markethistory` with `WI_CX` pointing at the checkout;
4. commit `data/market/` to a branch and open or update one pull request, as the Game patch workflow does. It never
   pushes to main.

Why not a published derived file: the data repo's own job has the archive and its own token, but anything it publishes
from a private repo is private too, so WI would still need a token to read it, and there would be one more file to
keep in step. The token route reads what is there.

A card file changes once a day (its league's curve gains a day; its weekday map once a week), so a daily commit
changes about 700 small files; git keeps each change as a delta. If that ever weighs on the repo, the card files can
go to the site's own store instead (`tools/sitedata.py`) and the rest stay in git.

## The check

`node tools/dev/marketcheck.mjs`, and the guard's `market` line. Every file under `data/market/` carries its source,
the flag and its rule, has the bytes `index.json` says, and carries no `Metadata/` id and no private league. Then, where
the archive is on the machine, it reads a sample of league days (one in the league still running, one in a past league)
from the raw hours exactly as GGG sent them (not the derived rows the tool reads), works out every hour's rates and five
currencies' daily prices again in its own code, and compares them with the card files' league-day curves and
`inflation.json`'s exalted per divine. The tool rounds to 3 significant figures, so a gap over 0.6% fails. Today there are 12
sums once the league-day curves (#100) and the index (#101) are in, worst gap 0.31%. About 2 seconds; without the archive (on the Checks workflow) the sums are skipped and the line
says so.
