# Farms: what the tab should be

A proposal for [issue #56](https://github.com/metaseonso/wraeclast-index/issues/56). Two options, both
buildable, both drawn against the card frame and the elements the site already has. No code yet.

The tab today lists twenty farming strategies and prices the items they name. It never says what one costs,
what one returns, or how long it takes to pay back. That is the gap. The question is what we can put in that
gap without inventing a number the game does not publish.

---

## Where the tab stands

Measured against the files in this worktree, 23 September 2026.

| | Today |
|---|---|
| Entries | 20, from BawLoch's public tier list (`data/farms.json`, built by `tools/farms.py`) |
| Made for | patch **0.5**, league **Runes of Aldur**, sheet updated **15 June 2026**, last fetched 19 September |
| The game is on | patch **0.5.5**, league **Forbidden Rites** — so every entry is a patch and a league behind |
| What each entry carries | tier, mechanics, an atlas master, a waystone line, tablets with their modifiers, a rarity note, free-text notes, links out, and lists of what you spend and what it makes |
| What is priced | plain items off the in-game Currency Exchange; rolled tablets and waystones off the trade site (`data/farmprices.json`) |
| What is **not** priced | `data/farmprices.json` is `{"updated": null, "league": null, "items": {}}`. **Every rolled tablet and waystone on the tab reads "no price yet."** 32 searches are declared in `data/farmqueries.json` and none has answered |
| What the maths says | nothing. `farms.js` has no total by design: *"the sheet gives no amounts per map"* |

Two facts decide most of this proposal.

**The Currency Exchange prices none of the inputs that matter.** `data/exchange.json` holds 661 rows. Not one
of them is a waystone and not one is a tablet. Omens, orbs, splinters and fragments are all there; the things
a farm actually consumes per map are not, because they are rolled items and rolled items trade on the trade
site. So the cost side of every farm depends on a job that has not yet returned a single row.

**The entries are three months and several patches old.** A tier list made for 0.5 in June is not wrong
because it is old, but it is not evidence about 0.5.5 either, and nothing on the tab says how far that has
gone.

---

## What we may say, and what we may not

Three rules, and the reason for each. They are not new; they are what the Bosses tab already does.

**Never a value per kill or per run as fact.** The game publishes no drop rates. A number like "4 divines a
map" is a guess wearing a decimal point, and a player who plans an evening around it has been misled by us,
not by the person who first said it. `worker/prices.js` states the rule for the Bosses tab in one line: *the
drop rates in `data/bosses.json` never meet these prices: no value per kill, here or anywhere.* The Farms tab
gets the same rule.

**Every rate names its source and its sample, on screen.** `assets/bosses.js` already does it: a rate carries
its own kill count, because *"a number the wiki took over 50 kills must never inherit another row's count"*,
and a row with nothing reads `no sample` rather than a blank, because *"blank would read as zero"*. The farms
card copies that wording and that discipline.

**A price is a real price or there is no price.** The frame settles it: no price means the box is not drawn,
and everything downstream of a price draws nothing rather than a zero.

---

## The maths, worked

One farm, all the way through. **200% Deli Splinter Farm**, S tier on the sheet. What it names per map: a
T15 waystone rolled to five modifiers, an Omen of Chaotic Rarity, an Omen of Chaotic Quantity, an Omen of
Chaotic Effectiveness, an Exalted Orb, and four Delirium Tablets carrying a fractured splinter modifier. The
one output it names is the Simulacrum Splinter.

### 1. What a run costs

Prices are the Currency Exchange's own, for 19 September 2026, in divines. One divine was 462.3 Exalted Orbs
that hour.

| Per waystone | Divines |
|---|---|
| Omen of Chaotic Quantity | 0.5838 |
| Omen of Chaotic Rarity | 0.4563 |
| Omen of Chaotic Effectiveness | 0.1355 |
| Chaos Orb × 3 | 0.3510 |
| Exalted Orb | 0.0021 |
| **Named and priced** | **1.5287** |
| T15 waystone, five modifiers | not priced today |
| Delirium Tablet × 4, fractured splinters | not priced today |

The three Chaos Orbs are not on the sheet. They are on the omens: each one's own line reads *"your next Chaos
Orb will replace all Modifiers on a Waystone…"*, so an omen without its orb is half a cost. We ship that line
already, in the catalogue. **An input list that names the omen and not the orb understates the cost by 23%
here**, and the build step should add the orb wherever an omen's own line names one.

At a run a player can actually keep up — 10, 12 or 15 maps an hour — the priced part of the basket alone is
**15.3, 18.3 or 22.9 divines an hour**, before a single tablet.

### 2. What a run has to make

Here is the number that is made only of prices, and so is the number we can publish.

A Simulacrum Splinter was 0.00952 divines that day. So:

```
break-even = cost of the run ÷ price of the drop
           = 1.5287 ÷ 0.009524
           = 160.5, so 161 splinters a map
```

The game's own line on the splinter says *"Combine 300 Splinters to create a Simulacrum."* So break-even is
**0.54 of a Simulacrum from every map**, and a player who has run the strategy knows instantly whether that is
near what they see. We asserted no rate. We multiplied one real price by another.

This is the shape of the answer for the whole tab: **we publish the bar, the player knows the jump.**

### 3. What actually moves the answer

The same basket and the same output, day by day, off the fifteen days of price history the Exchange feed
already ships:

| Day | Basket, divines | Splinter, divines | Break-even per map |
|---|---|---|---|
| 5 September | 0.2077 | 0.00872 | **24** |
| 12 September | 1.1509 | 0.00719 | **160** |
| 16 September | 1.4620 | 0.00809 | **181** (the league's worst) |
| 19 September | 1.5287 | 0.00952 | **161** |

In fourteen days the cost of the same setup went up **7.4×** and the bar it has to clear went up **6.7×**.
No drop rate moved. The Omen of Chaotic Effectiveness alone is +233% over seven days and the Omen of Chaotic
Rarity +94%.

**So the largest error bar on a farm is not the drop rate. It is the price of the inputs, and the price of
the inputs is the one thing we hold hourly and for real.** That is the argument for building the cost side
first and the rate side never.

### 4. Payback, once a player brings their own count

Break-even answers "does a run pay". ROI needs a count, and the count has to be the player's, not ours.
Suppose a player logs 40 runs and 9,800 splinters — 245 a run:

```
return per run  = 245 × 0.00952        = 2.3324 div
profit per run  = 2.3324 − 1.5287      = 0.8037 div
profit per hour = 0.8037 × 12 runs     = 9.6 div
payback on a 30 div start-up           = 30 ÷ 0.8037 = 37.3, so 38 runs ≈ 3.2 hours
```

And the interval on their own count, which is arithmetic we can do for them: 9,800 events gives a relative
half-width of 1.96 ÷ √9,800 = **±2%**, so 240–250 a run, so **9.1 to 10.2 divines an hour**. Their number,
our maths, their error bar.

Now the point the card has to make next to it. At the 5 September basket the very same 245 splinters a map
earned **1.93 divines a run**. At the 19 September basket it earns **0.80**. If the basket doubles once more —
which it has done twice in a fortnight — it earns **nothing**: 2.33 in, 3.06 out. A farm's answer has a shelf
life of days, and the card must say so beside the number, not in a footnote.

### 5. Where a measured rate exists at all

It exists in one place we already read: the PoE2 Wiki's community drop tables, which `tools/bosses.py` pulls
through the wiki API, sample-size row and all. What that gets us today, in `data/bosses.json`:

* 104 bosses. **10** have any rate rows. **82** rows carry a sample size.
* The sample sizes actually seen: 48, 50, 71, 100, 143, 200, 234, 235.
* Every row carries `src` "PoE2 Wiki" and the patch, and the tab prints *"Drop rates according to: …"* wherever
  a rate is shown.

Nothing there covers a map farm. The wiki samples bosses, not strategies. So for the Farms tab the rate side
is: **zero usable rows today**, and a slot ready for the day someone samples one.

### 6. What a sample of that size is actually worth

This is the part that has to be on screen, because it is the part that makes a rate safe to show. A 95%
interval (Wilson) on the real rows in our own file:

| What the wiki says | Over | What it really means |
|---|---|---|
| 42% | 71 kills | **31.2% – 53.6%** |
| 12.5% | 71 kills | **6.7% – 22.2%** |
| ~1.5% | 71 kills | **0.28% – 7.7%** — a 28-fold span |
| 36% | 200 kills | **29.7% – 42.9%** |

And the general rule, which is the one line worth printing on the card: **the width of the bar is set by how
many of the thing were seen, not by how many runs were done.** For a count, the relative 95% half-width is
about 1.96 ÷ √k:

| To know a rate within | You need to have seen |
|---|---|
| ±50% | 15 |
| ±25% | 61 |
| ±20% | 96 |
| ±10% | 384 |
| ±5% | 1,537 |

So a "1 in 21" figure for something rare needs about 8,000 kills before it is worth one decimal place. A site
that prints such a figure off 71 kills is printing 0.3% to 7.7% and calling it 1.5%.

**A live example of the thing we are refusing to become.** Elyxir's PoE2 farming guide states *"roughly 1
Rakiata's Flow per 21 Jade Isle boss kills"*, attributed to "large community-tracked samples", with no sample
size and no named source. That number may well be right. It is unusable, because nothing on the page lets a
reader tell a 400-kill sample from a 40-kill one.

### 7. What the card must never say

* A divines-per-hour figure of ours. Per hour is the player's count times our prices, and it is labelled as
  theirs.
* A drop rate with no sample size beside it.
* A single number where a range exists. A rate always draws as a range; where the range is wider than about
  3× the card says so in words instead of drawing a bar that flatters it.
* A total that quietly drops an unpriced input. If a named input has no real price, the total is not drawn —
  `costHTML` in `assets/farms.js` already names what is missing and that behaviour stays.

---

## Option A — The board

**What it is.** The owner's starting thought, built the narrow way: a feed of what other people are running
right now, as links, never as writing of ours.

**Where entries come from.** One allowlist in a new `tools/farmfeed.py`, in the shape `tools/guides.py`
already uses — the name, whose it is, the address, and what the page must still carry:

* YouTube channel Atom feeds (`/feeds/videos.xml?channel_id=…`). No key, no quota, 15 entries a channel.
* A subreddit search feed for the game's subreddit, newest first.
* The strategy pages of named sites (Maxroll's currency section), read for their own "last updated" stamp —
  their Tablet Farming guide carries *"September 2, 2026"* and *"0.5.5"*, which is exactly the stamp we need.

**What we publish.** The title as its author wrote it, who made it, when, and the link. **No summary of ours.**
Two reasons. A summary of a video nobody here watched is a claim we cannot stand behind, and the repo already
settled the pattern with the levelling guide: link out, credit in the line itself, nothing reads as ours.

**The UI, from what exists.** A third chip row on the Farms tab beside the tier and mechanic rows, using the
same `chips()` helper: *Tier list* / *Latest*. Each feed item is a card in the same grid, made by the tab the
way a farm card already is — the frame's `DEFAULT` covers a card whose kind is not in the table. Art is the
letter glyph. Name is the title, linking out. Sub line is who and when. The body carries one line: which
mechanics the title names, matched against the mechanic list `data/farms.json` already holds, so the existing
mechanic chips filter the feed too, with nothing new declared.

**What a player gets.** A reason to come back. What people are running this week, rather than what one person
ranked in June.

**What it does not give.** Any of the maths in the section above. And it puts us in the business of policing
an allowlist: a channel that goes quiet, a video that is a thumbnail for a build guide, a title that promises
150 divines an hour. We would be hosting other people's claims next to our own prices, and a player will read
the two as one.

**A variant, considered and not offered.** A feed that promotes a link into a full entry with a setup and an
input list. That is not code, it is an hour of the owner's reading per entry, forever, and it puts someone
else's numbers under our name.

---

## Option B — The ledger

**What it is.** No feed. Every farm card answers three questions with numbers, and the only numbers we assert
are prices.

**1. What it costs to start.** The one-off: the uniques the setup names (Visions of Paradise, Freedom of
Faith, Unforeseen Consequences and the rest), priced through the trade job that already prices uniques, plus
the atlas master and tree the entry names. Drawn in the head's price box as a one-off, with anything unpriced
named rather than dropped.

**2. What it costs per run.** The consumable basket, worked as in section 1 above: the Exchange for omens,
orbs and fragments; the trade job for rolled tablets and waystones; plus the orb an omen's own line names.
Drawn through `opts.invest`, which the card already supports and the Currency tab's route card already uses —
label *Per run*, value the figure. Beneath it, one line: the same figure at the player's runs-an-hour.

**3. What it has to make.** The break-even count, per named output, beside the price the row already shows.
The `.fm-row` output rows in `assets/farms.js` gain one column and no new component. On the popup, a
*What it has to make* section, a `fm-sec` like the two that are there.

**The player's own count, and their own answer.** In the popup, a counter beside each output row and a runs
box — the same number-and-slider pair `valHTML` in `assets/trade.js` already draws, with `prices` giving the
track its bands so the slider shades from red to gold as the per-hour return crosses zero. From their counts:
profit per run, profit per hour, payback in runs and in minutes, and the 95% interval off their own event
count, with the line *"another N of them halves this bar."* Kept in `localStorage`, exactly like the Currency
tab's watch list. **Nothing about a player leaves their browser**, which is also why it costs no D1 row.

**Where a rate exists.** A rate slot on the output row, drawn only when a named sample exists, using the
Bosses tab's own renderer and its own wording: the range, the sample size, the patch, and
*"Drop rates according to: PoE2 Wiki."* It is never multiplied by a price. Today it draws on nothing, which
is the correct amount of nothing.

**What a player gets.** The tab stops being a list of other people's opinions with prices stapled on and
starts answering the question they came with: is this worth my evening, at today's prices, at my clear speed.

**What it does not give.** Freshness. A ledger over stale entries is a well-kept ledger of June. That is what
the staleness rule below is for, and it is the reason the rule is part of this option and not a nicety.

---

## Option C, considered and not offered

Retire the tab and fold the twenty entries into the Atlas tab as notes. It is cheap and it is defensible while
`farmprices.json` is empty. It is not offered because the trade searches are already written and the Exchange
already prices the omens: the tab is one job away from being the only place on the site that answers a
money question end to end.

---

## What each costs on the free plan

The budget, from `worker/dash.js`: **100,000 requests a day, 100,000 D1 writes a day, 5,000,000 D1 reads a
day, 5 GB stored.** The trade site's own budget is **100 searches an hour**.

One thing decides most of the cost: a static file under `/data/` is served from the edge and never runs the
worker. Only the paths in `wrangler.jsonc` under `run_worker_first` cost a request, and
`/data/farmprices.json` is already one of them.

| | Option A — the board | Option B — the ledger |
|---|---|---|
| New fetch job | one, **once a day**, a GitHub Actions job of its own. ~12 outbound reads: 6 channel feeds, 2 search feeds, 4 strategy pages | **none.** It uses the hourly Exchange feed and the hourly trade job, both already running |
| Cloudflare requests added | **0** per visit if the file ships in the repo like `data/farms.json`; +1 per Farms visit if it goes through `POST /api/data/put` | **0** |
| D1 writes added | 0, or 1 a day through the ingest | **0.** The run log is in the player's browser |
| D1 rows stored | 0 | 0 |
| Bytes at first paint | **0.** Neither file is in first paint; the Farms tab fetches on mount | **0** |
| Bytes on the tab | +≈9 kB (`data/farmfeed.json`, ~40 entries), ~3 kB gzipped | +≈2 kB on `data/farms.json`, which is 42.6 kB today. The break-even is worked out in the browser from prices already loaded |
| Trade-site budget | none | **none added.** The 32 farm searches are already declared; at 100 an hour each key comes round about once a day, which is the freshness a per-run cost needs |
| Headroom | the price job's own writes are about 100 × 24 × 2 = **4,800 a day, 4.8%** of the D1 write budget. Neither option moves that number | |

For scale, measured in this worktree: `data/index-core.json` is 349,138 bytes and is in first paint;
`data/market.json`'s catalogue is 246,722 bytes, of which 122,149 is picture addresses;
`data/exchange.json` is 351,801 bytes, of which the day-by-day history alone is 242,036 and is served
separately as `?part=past` for the charts.

**Option B costs nothing new.** That is not a tie-breaker, it is the loudest argument in the table.

---

## Staleness: how an entry ages out

A farm that was good three patches ago is worse than no entry, so ageing is a rule with teeth, not a warning
strip. Three clocks, and the strictest wins.

| Clock | Test | What happens |
|---|---|---|
| **Patch** | the entry's patch is behind the live one by a point release (0.5 against 0.5.5) | marked on the card, and it sorts below every current entry |
| | behind by a minor version (0.5 against 0.6) | **the maths is not drawn at all.** The entry stays as a link and a setup, with one line saying which patch it was written for |
| | behind by two minor versions | **retired at build time** by `tools/farms.py`, counted in the run's report, and the tab prints the count: *"N entries retired: made for patch X."* Never silently |
| **League** | the entry names an older league | the setup stands, the prices do not. Today's league's prices are used and the card says the setup is from another league. `versionHTML()` already does this |
| **Price** | a named input has had no real price for more than 7 days, by the trade job's own `at` | the cost line is not drawn and the missing input is named — `costHTML` already does this |
| | more than half an entry's inputs are unpriced | the entry cannot answer the question it exists for, so it sits behind a *Not priced* chip rather than showing a blank total |
| **Source** | the sheet has not been refetched in 60 days | the tab says so on the version bar, above the entries, not under them |

And when the source itself fails, it goes the way every other outside source goes: `tools/lastgood.py` keeps
the last good copy exactly as it was, the run names the farm and why on stderr, `data/faults.json` records it
under that farm's own name, a tagged ticket goes up, and the run exits non-zero. That is the pattern
`tools/guides.py` was proved against three ways, and it is the pattern here.

One consequence worth stating plainly: **applied today, the patch clock marks all twenty entries**, because
the sheet is 0.5 and the game is 0.5.5. That is the correct first output of the rule. It is also the reason
the version bar's warning is not enough on its own — it is one line above twenty cards that each look current.

---

## The pick

**Ship Option B, the ledger.** Four reasons.

1. **It closes the actual gap.** The tab's failing is that it shows prices and no money. A feed of links would
   add freshness beside the same silence.
2. **Every number in it is ours to stand behind.** Prices we buy hourly, plus the player's own counts. The one
   thing the game does not publish is the one thing we never assert.
3. **It costs nothing new** — no job, no D1 row, no first-paint byte, no extra trade search.
4. **It is the only thing on the site that would answer a money question end to end**, which is what the site
   is for.

What survives from Option A: the version bar already links the sheet author's own channel through
`SRC.links`, so the "what is this person doing now" door exists. If the feed is wanted later it is one tool
and one chip row, and this proposal's Option A is the spec for it. It should be a ticket, not a blocker.

**What has to happen first, in order.**

1. Get `data/farmprices.json` answering. Nothing in Option B works while every tablet reads "no price yet",
   and 32 searches are sitting written and unrun.
2. Add the orb an omen rides on to the input list, off the omen's own line. Without it every omen cost is
   understated — by 23% on the worked example.
3. Then the ledger: break-even, the per-run line, the run log, the slider.
4. Then the staleness clocks, which on their first run will mark all twenty entries.

---

## What I could not confirm

* **The PoE2 Wiki's pages could not be read from this machine.** `poe2wiki.net` answered with its bot-check
  page. Everything said here about the wiki's rate tables comes from our own `tools/bosses.py`, which parses
  them, and from the 82 sampled rows already in `data/bosses.json`.
* **Reddit's feed.** `reddit.com` is not reachable from this machine, and Reddit's own API rate-limit page
  answered 403. So Option A's subreddit feed is costed as "one read a day" without a confirmed limit. Check
  it before building.
* **The YouTube channel feed.** The documented form is `?channel_id=…`; the old `?user=…` form answered 404,
  and I do not have the channel ids. Reports through 2026 also say the endpoint returns 404 or 500 to
  data-centre addresses while working fine from a browser — and our jobs run on a data-centre address. That is
  a real risk to Option A and a reason to prefer a feed we can retry cheaply.
* **The served size of `/data/market.json`.** The worker builds it at the edge from D1 and two ingested
  files, and I did not run the worker. The component sizes above are measured; the served total is not.
* **The Chaos Orbs on the omen line** come from the omens' own text, which we ship. The sheet does not name
  them, so "three orbs per waystone" is read off "your next Chaos Orb" times three omens, not off the sheet.
* **Runs an hour** is illustrative throughout (10, 12, 15). It is a player's input, never ours.

---

## Sources

Ours, and named on screen where they are used:

* The in-game Currency Exchange, GGG's public hourly feed — `tools/exchange.py`, `data/exchange.json`.
* The official trade site's live listings — `tools/pricepull.py`, `worker/prices.js`.
* BawLoch's public tier list sheet — `data/farms.json`, credited on the tab with the author's own links.
* The PoE2 Wiki (CC BY-NC-SA), for community drop rates and their sample sizes — `tools/bosses.py`,
  `data/bosses.json`. The wiki's `robots.txt` disallows `/index.php`, so only the API is used, 25 pages a
  request, and it is a manual pull rather than a scheduled scrape.
* Path of Building and Exiled Exchange 2, already credited on the Bosses tab for names and drop pools.

Read while writing this, and named because the proposal leans on what they do or do not do:

* Maxroll's PoE2 currency guides (Tablet Farming, Abyssal Chest, Citadel, Expedition, 200% Delirium Abyss)
  and its Currency Meta page. Its strategy guides carry a patch stamp and a last-updated date; they carry no
  investment figure, no per-hour figure and no drop rate — which is the same line we are drawing, arrived at
  independently.
* Elyxir's Rakiata's Flow farming guide, quoted above as the pattern to avoid: a rate with no sample size and
  no named source.
* YouTube's Data API quota page, for the feed costings in Option A.
