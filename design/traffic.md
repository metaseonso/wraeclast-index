# 1.0 traffic: what calls the worker, what it costs, what to change

For [issue #128](https://github.com/metaseonso/wraeclast-index/issues/128). First read against main at `5973867`
(patch notes 0.31) on 27 September 2026. No site code changes here: this is the budget and the list of fixes, for
the owner to pick from while the front end is reworked for 1.0.

Updated for main at `c123ad2` (patch notes 0.34, 28 Sep 2026). What moved since `5973867`:

- **The price file is built once per change, not once per cache miss** (0.32, `worker/prices.js` `buildMarket`).
  A `market.json` miss now reads about 5-8 D1 rows instead of scanning whole tables. The build moved into the
  job calls (`/api/prices/ingest`, `/api/data/put`), which now read and write more. Fix 6 below is done.
- **D1 rows read ran out on 25 Sep** (5 M a day), before that fix. So the free plan has already broken once, on
  reads, not on requests or writes. The dashboard's meter now counts rows read too.
- **The hourly files are sent in** by `pages.yml` (`tools/sitedata.py`), and the backup copy is kept 5 minutes,
  so `leagues.json` and the builds no longer fetch GitHub Pages.
- **Static files come from `dist/`** (`tools/build.mjs`: minified, data files nothing asks for left out): 167
  files today, checked by `tools/dev/budget.mjs`.
- The one-row top bar (`assets/topnav.js`), the pipeline (`tools/pipeline.py`) and the daily price copy
  (`tools/pricehistory.py`) change no worker calls per visit. The price copy adds 4 job calls a day.

Figures come from one of three places, and each is marked:

- **Code**: read off `wrangler.jsonc`, `worker/*.js`, `sw.js`, `assets/*.js`.
- **Measured**: `worker/seo.js` and `worker/prices.js` run in Node 22 on this machine against the repo's own data
  files (D1 and the Cache API stubbed), on `5973867`. Node is not workerd, but both use V8, so the CPU numbers are close enough
  to know which side of 10 ms a call lands on.
- **Snapshot**: the owner's dashboard as committed in `tools/dev/dash-fixture/` (Cloudflare's own numbers,
  19 Sep 02:00 to 21 Sep 13:00 UTC, 59 hours). It is the only real traffic in the repo. It is from before 0.31
  and before the 25 Sep read outage, and it may include the owner's own testing.
- **Estimate**: anything else. Always labelled.

Cloudflare prices, checked on 27 Sep 2026 at <https://developers.cloudflare.com/workers/platform/pricing/>
(page dated 28 Aug 2026):

| | Free | Paid (Standard) |
|---|---|---|
| Base | $0 | **$5 a month** minimum |
| Worker requests | 100,000 a day, then **429 on every `run_worker_first` path** until 00:00 UTC | 10 M a month included, then $0.30 per million |
| CPU | **10 ms per call** (Error 1102 past it) | 30 M CPU-ms a month included, then $0.02 per million; default cap 30 s per call |
| Static asset requests | free, unlimited | free, unlimited |
| D1 rows read | 5 M a day | 25 B a month included, then $0.001 per million |
| D1 rows written | 100,000 a day | 50 M a month included, then $1.00 per million |
| D1 over the free limit | **every D1 query fails** until 00:00 UTC, reads too (D1 pricing FAQ) | billed |
| Workers Logs (`observability` is on) | 200,000 events a day | 20 M a month included, then $0.60 per million |

Two lines on those pages matter more than the prices:

1. *"When using `run_worker_first`, requests matching the specified patterns will always invoke your Worker
   script. If you exceed your free tier request limits, these requests will receive a 429."* On the free plan the
   site does not slow down at the limit: prices, league dates, the service worker, and every crawler page
   stop until midnight UTC. Static files keep working.
2. The new **Workers Cache** (`"cache": {"enabled": true}`) serves worker answers without running the worker, but
   once it is on, *every* request is billed as a worker request, **static assets included**. It saves CPU, and
   CPU is not what costs WI money. It adds requests, and those do. **Do not turn it on.**

---

## 1. Every path that runs the worker

`wrangler.jsonc` `run_worker_first` sends these to `worker/index.js` before any static file is looked at:
`/data/market.json`, `/sw.js`, `/data/leagues.json`, `/data/rollprices.json`, `/data/farmprices.json`,
`/data/bossprices.json`, `/api/*`, `/item/*`, `/gems`, `/uniques`, `/passives`, `/bases`, `/atlas`,
`/currency`, `/keywords`, `/sitemap.xml`, `/llms.txt`, `/llms-full.txt`, `/search` (unchanged at `c123ad2`).
Everything else is a static file from `dist/`. Any other path that
matches no static file (a typo, a scanner probing `/wp-login.php`) also runs the worker, which hands it to
`env.ASSETS` for the 404.

**Every one of these is a billed request, even when the answer comes from the Cache API.** `caches.default`
is looked up *inside* the worker, so it saves CPU and D1 reads, never the request. The only things that save a
request are the browser's own cache (the `Cache-Control` the worker sends), the service worker's copy, or not
asking at all.

| Path | What one call does | CPU per call | D1 per call | Outside fetch | Browser keeps it |
|---|---|---|---|---|---|
| `/data/market.json?part=live` (home) / `now` (explore) | Cache API hit: returns the stored copy. Miss (per data centre, every 5 min): one D1 batch reads when each input last changed and the built part (`files`, `built:<deploy>:market:<part>`), and serves it. Only when an input is newer than the built part (a rare miss) does it build `now` and `live` the old way and keep them | hit ~1 ms; miss ~1-3 ms (Estimate); a build **~70 ms** (Measured on `5973867`, warm; 146 ms cold) | hit 0; miss **~5-8 rows** (Code); a build ~800 rows of `trade_prices` by key range | none | 5 min, stale 10 min |
| `/data/market.json?part=hist` (first chart or popup) | Same, for `past` and `hist`. The league order is kept in D1 `meta` (`lorder`) and the past leagues' lines as a built row of their own | hit ~1 ms; miss ~1-3 ms (Estimate); a build **~80 ms** (Measured on `5973867`) | miss ~5-8 rows; a build adds the past lines (a few rows, or `price_leagues` for those leagues when the order moved) | none (`pastprices.json` is read from the site's own copy) | 5 min |
| `/data/market.json?part=facts&v=` | Hit: stored copy. Miss: hashes the catalogue | miss ~20 ms (Measured) | 0-1 | none | **a year** (named by content) |
| `/sw.js` | Reads `sw.js` from ASSETS, writes the deploy id in | ~1 ms (Estimate) | 0 | none | `no-cache`: **asked on every page load** (browsers check the service worker on each navigation) |
| `/data/leagues.json` | Cache API, else D1 `files` (`pages.yml` sends it in every hour) | ~1 ms (Estimate) | 0-1 | GitHub Pages copy only if D1 has none, then kept 5 min | 5 min |
| `/data/rollprices.json`, `/data/farmprices.json` (Trade, Farms) | Cache API, else that kind's rows of `trade_prices` by key range (`kindRows`) | ~1-5 ms (Estimate) | miss: that kind's rows only (index on `(league, key)`, migration 0011) | none | 1 min |
| `/data/bossprices.json` (Bosses) | Cache API, else reads `bosses.json` from ASSETS + the `uniq` and `boss` rows by key range | miss ~10-20 ms (Estimate) | miss: those two kinds' rows | none | 5 min |
| `/item/<slug>` (7,214 pages) | Cache API (key: the path, 1 h), else render. The first render in a fresh isolate parses `data/index.json` (**2.8 MB**) and the market | hit ~1 ms; warm render **0.6 ms** avg, 13 ms max; **cold isolate 161 ms** (Measured) | 0 (market via the in-memory copy, refreshed every 5 min through `serveMarket`) | none | 1 h (404: 5 min) |
| `/gems` `/uniques` `/passives` `/bases` `/atlas` `/currency` `/keywords` | Same model, one list page (70-110 kB) | 3-11 ms (Measured) | 0 | none | 1 h |
| `/sitemap.xml` (7,223 URLs, 740 kB) | Same model | 17 ms (Measured) | 0 | none | 1 h |
| `/llms.txt` / `/llms-full.txt` (1.8 MB) | Same model | 0.3 ms / **67 ms** (Measured) | 0 | none | 1 h |
| `/search?q=` | 302 to `/#/?q=` | <1 ms | 0 | none | never |
| `/api/t` (page views, clicks, heat) | `allowed()` rate check, then one D1 batch of upserts | ~1-2 ms (Estimate) | **2 reads + ~9 rows written per batch** (Snapshot: 103 tracking writes for 12 batches) | none | POST |
| `/api/suggest` GET (interaction cards) | Cache API 60 s, else 3 queries | ~1 ms | miss: 3 queries over `suggestions` | none | 1 min |
| `/api/suggest` POST, `/api/trade/searches` POST | `allowed()` + insert | ~1-2 ms | 2-4 reads, 3-5 rows written | none | POST |
| `/api/trade/searches` GET | Cache API 2 min, else top 10 | ~1 ms | miss: scan of `trade_searches` | none | 2 min |
| `/api/pob?url=` (Build tab, pasted link) | Fetches the build from pobb.in / poe.ninja / maxroll / mobalytics / poe2db / pastebin | ~1-5 ms | 0 | **1 fetch** (edge-cached 10 min) | `no-store` |
| `/api/health`, `/api/admin/*` | Owner and job checks. `/api/health` reads each kind's newest check from `meta` (`at:<kind>`), not the whole table | a few ms; `/api/admin/*` stats also ask Cloudflare for today's D1 rows read (kept 5 min) | several reads | GraphQL | `no-store` |
| `/api/prices/state`, `/api/prices/ingest`, `/api/data/put` (the jobs) | Job traffic, signed (GitHub's own token, both jobs). After answering, an ingest that saved prices, or a put of `market.json`, `exchange.json` or `leagues.json`, rebuilds the `now` and `past` groups (`buildMarket`, in `waitUntil`) | ingest: JWKS check + batch; a rebuild **~150 ms**, charged to that call (Estimate: the two builds above) | ingest: ~30 reads, ~30 rows written per batch of 12; a rebuild **~810 rows read, ~10 written** (Estimate) | JWKS (cached 1 h) | n/a |

What the snapshot says about CPU: **p50 1 ms, p99 59 ms**, 11 exceptions in 53,462 calls. The p99 was the
cache misses and cold isolates above. Since 0.32 a miss mostly reads the built part, so the heavy CPU sits in
~11 job calls an hour (the rebuilds) and in cold isolates for crawler pages. On the free plan each of those is
over the 10 ms limit. They mostly get through, but nothing guarantees that. The paid plan removes the question
(30 s default).

### Worker calls per thing a person does (Code)

The app is one page (`index.html`) with `#/` routes, so moving between tabs is not a page load.

| What happens | Worker calls | Which |
|---|---|---|
| **First visit, home page** | **5-6** | `sw.js` 1, `market.json?part=live` 1, `?part=facts` 1, `leagues.json` 1, `/api/t` 1-2 (a batch every 30 s while there is something to send, and one when the tab is hidden or closed) |
| **Returning visit, home page** (more than 5 min later) | **4-5** | `sw.js` 1, `live` 1, `leagues` 1, `/api/t` 1-2 (`facts` is kept a year) |
| Reload within 5 min | 2 | `sw.js` 1, `/api/t` 1 |
| `/explore` page load | 3 | `sw.js`, `market.json?part=now`, `/api/t` |
| **A search** (typing in the box) | **0** | Search runs in the browser over `index-core.json` / `index-rest.json` (static). The clicks ride in the next `/api/t` batch. `/search?q=` from a search engine's search box: 1 |
| **A card opened** | **0**, or 1 | The card comes from the index (static). The first chart or popup of the page load adds `market.json?part=hist` (1), once. An interaction card adds `/api/suggest?card=` (1) |
| Trade tab | 2, +1 per search | `rollprices.json`, `/api/trade/searches` GET, +1 POST per search run |
| Farms tab / Bosses tab | 1 each | `farmprices.json` / `bossprices.json` |
| Build tab, a pasted link | 1 | `/api/pob` |
| **A crawler, one page** | **1** | `/item/<slug>` or a list. Crawlers do not run the app, so no `sw.js`, no prices, no tracking |
| A crawler, the whole site | ~7,225 | 7,214 item pages + 7 lists + sitemap + llms files |
| A search engine that renders the app (Googlebot) | 3-4 | `live`, `facts`, `leagues`, maybe `/api/t` (Googlebot does not install service workers) |
| The data jobs | ~14 an hour, ~340 a day (Estimate) | `pricepull.py`: 1 `state` + ~8 `ingest` an hour; `pages.yml` via `sitedata.py`: 4 `data/put` an hour (3 of them start a rebuild); `pricehistory.py`: 4 a day (`now`, roll, farm and boss prices) |

**A typical visit** (home page, a few tabs, one card with a chart): **~7.5 worker calls** and **~18 rows
written** to D1 (2 tracking batches). Estimate. The rows written matter as much as the calls: see below.

Wrangler dev was not run: `wrangler` is not installed in the repo (`package.json` has only esbuild), and the
counts above come from the code, not from a guess about it. The CPU figures are the Node runs listed above.

---

## 2. Cost: today, 10x, 50x

### Where to read the real numbers

The dashboard already has them. Sign in at `/admin`, or read the same numbers with the owner key:

```
WI_OWNER_KEY=... node tools/dev/dash.mjs --raw cloudflare   # workers: requests, errors, cpu p50/p99; d1: rows read/written per day
WI_OWNER_KEY=... node tools/dev/dash.mjs --raw stats        # plan: today's views, batches, tracking and price writes, % of the free plan
```

- `cloudflare.workers.requests` over `days` is the billed number. Divide by the days that had traffic.
- `cloudflare.d1[]` gives rows read and written per day: the other two free limits.
- `stats.plan.pct` and `verdict` are the dashboard's own "how close to the free plan", taken as the larger of
  writes / 100,000, requests / 100,000 and, since 0.32, rows read / 5 M (Cloudflare's own count for today,
  `worker/cfstats.js` `d1Today`). **Its request count is still only tracking batches plus page views**
  (`worker/dash.js` line 287), so it misses crawlers, `sw.js`, `market.json` and the jobs. Use `cloudflare.workers.requests`
  for requests.

### Today (Snapshot)

| | Snapshot, 59 h | Per day |
|---|---|---|
| Worker requests | 53,462 | **~22,000** (22% of the free limit) |
| CPU | p50 1 ms, p99 59 ms | mean ~3 ms (Estimate) |
| D1 rows read | 66k-302k a day | up to 302k (6%). By 25 Sep it passed 5 M and D1 stopped until midnight UTC; since 0.32, Estimate ~0.2-0.3 M |
| D1 rows written | 645-2,263 a day | up to 2,263 (2%); price jobs 830 of it, tracking 103 (`stats.plan.today`). Since 0.32 the rebuilds and their `meta` rows add ~3,600 (Estimate) |
| People | 82 counted views, 305 real page loads / 71 visits (Web Analytics) | ~35 views, ~50 visits (Estimate) |

**Most of today's worker calls are not people.** In the same window: ClaudeBot 6,525 and GPTBot 3,795 requests,
Googlebot 2,935, "no browser name" 85,161 (zone-wide), our own jobs 2,767. Single item pages were fetched
130-280 times each in 59 hours (`/item/snap` 281), and `sitemap.xml` 185 times. At 1.0 the crawler share and
the people share grow at different rates, so there are two tables.

### Table A: everything times N (the ticket's framing)

Crawlers, scanners and people all grow together. Jobs stay flat. Estimate throughout.

| | Today | 10x | 50x |
|---|---|---|---|
| Worker requests / day | 22,000 | 220,000 | 1,100,000 |
| Worker requests / month | 0.66 M | 6.6 M | 33 M |
| D1 rows written / day | ~5,900 | ~17,600 | ~69,600 |
| D1 rows read / day | ~0.25 M | ~0.35 M | ~0.6 M |
| **Free plan** | fine (22%) | **breaks**: the 100,000th request comes at ~11:00 UTC; worker paths 429 for the rest of the day | **breaks** at ~02:10 UTC on requests |
| **Paid: requests** | $0 (in the 10 M) | $0 | (33 - 10) x $0.30 = **$6.90** |
| **Paid: CPU** (3 ms mean) | $0 (2 M of 30 M) | $0 (20 M) | (99 - 30) x $0.02 = **$1.38** |
| **Paid: D1** | $0 | $0 | $0 (2.1 M writes, 18 M reads a month) |
| **Paid: Workers Logs** (one event per call) | $0 | $0 | (33 - 20) x $0.60 = **$7.80**; $0 at 10% sampling |
| **Paid total / month** | **$5.00** | **$5.00** | **$21.08**, or **$13.28** with log sampling |

The free plan breaks at **~4.5x today's total**, on worker requests. Before 0.32, reads came first: every
`market.json` miss scanned whole tables, and that is what ran out on 25 Sep. Now reads are ~800 rows per
rebuild (~11 an hour, flat) plus ~5-8 rows per miss. Misses grow with the number of data centres serving the
site, not with visits, so reads stay well under 5 M a day at 50x (Estimate).

### Table B: people times N, crawlers as today

People at ~7.5 calls and ~18 D1 rows written per visit; everything else stays at today's ~22,000 calls and
~5,000 rows written (jobs now ~4,400 of it). Estimate.

| | Today (~50 visits) | 10x (500) | 50x (2,500) | Free plan breaks at |
|---|---|---|---|---|
| Worker requests / day | 22,400 | 25,800 | 40,800 | ~10,400 visits |
| D1 rows written / day | 6,000 | 14,000 | 50,000 | **~5,300 visits** |
| Paid total / month | $5 | $5 | $5 | still $5 until ~40,000 visits a day |

**For people, the free plan breaks first on D1 rows written, not on requests**: the page-view tracking
(`/api/t`) writes ~9 rows per batch. When D1's daily write limit is hit, D1 refuses every query, so
`market.json` misses, the price jobs and the Suggest button all fail until midnight UTC. The tracking is the
smallest feature on the site and the one that takes the prices down with it.

### What a free-plan outage looks like

It has happened once, on reads: on 25 Sep D1 passed 5 M rows read, so every D1 query failed until midnight
UTC. Built prices, tracking and the jobs' writes stopped; static pages kept working.

Past 100,000 requests: `market.json`, `leagues.json` and the three price files answer 429, so cards show no
prices. `sw.js` 429s, so service-worker updates stop (pages keep working from the kept copy). Every
`/item/*` page, the lists, the sitemap and llms.txt 429, which search engines and AI crawlers see and remember.
Static pages, scripts and the index keep working. It lasts until 00:00 UTC.

### A load test at 10x

The ticket asks for a load test at 10x today's peak. The snapshot's peak hour is ~12,000 requests
(19 Sep 04:00 UTC); 10x is 120,000 in an hour, ~33 a second. Workers do not notice 33 a second; **the quota
does**: one hour of that test on the free plan uses more than the day's 100,000 and takes the site's prices down
until midnight. Run it after the move to paid, against a preview version (`wrangler versions upload`, then the
preview URL), with k6 or `hey` against the mix in Table A. What to watch: `cpuTimeP99`, errors, and D1
rows read. On paid, the hour costs about 120,000 x $0.30 / 1 M = $0.04.

---

## 3. Fixes, ranked by what they save for the work they take

| # | Fix | Saves | Work |
|---|---|---|---|
| 1 | **Move to Workers Paid ($5/month) before 1.0, and set a spend alert** | Removes the 429 cliff at 100,000/day, the 10 ms CPU limit (cold isolates and cache misses run 60-160 ms today), and D1 refusing every query past 100,000 writes or 5 M reads. Table A: $5 at 10x, ~$13-21 at 50x | Minutes, in the dashboard |
| 2 | **One Cloudflare rate-limiting rule and two WAF custom rules as kill switches** | Blocked requests never reach the worker, so they are free. Caps a looping client or a scanner before it costs anything | Minutes, in the dashboard |
| 3 | **Lighter tracking**: one `/api/t` batch per visit (on `pagehide` / hidden only, drop the 30 s timer), heat from 1 in 10 visits, page views from Cloudflare Web Analytics (already on: `/cdn-cgi/rum` is not the worker) | ~1 call and ~13 of the ~18 D1 rows written per visit (Estimate). Moves the people breaking point on the free plan from ~5,300 to ~12,000 visits a day, where requests become the limit | Small: `assets/track.js`, `worker/dash.js` |
| 4 | **`sw.js` and `leagues.json` off the worker** | 2 of the 4-6 calls on every page load (~35-40% of people's calls) | Small: `tools/build.mjs` already writes `dist/`; stamp `sw.js` there with a hash of `sw-files.json` (it changes when any file changes, which is what the deploy id is for); ship `leagues.json` static (league dates change a few times a year) or fold it into `market.json?part=live`; drop both from `run_worker_first` |
| 5 | **Crawler pages as static files**: `tools/build.mjs` renders every `/item/*`, the 7 lists, `sitemap.xml`, `llms.txt`, `llms-full.txt` through `worker/seo.js` at deploy | All crawler traffic (most of today's ~22,000/day) to $0, and the 161 ms cold render goes away. 7,223 files + today's 167 in `dist/` fits the free plan's 20,000 files per version (`tools/dev/budget.mjs` warns at 10,000, fails at 18,000) | Medium: prices in these pages are then as of the last deploy (say so on the page, with the date); drop the paths from `run_worker_first`. Unknown slugs still reach the worker (no static file matches), so the 301s for old names and the 404 keep working |
| 6 | **Done in 0.32**: key-range reads, `trade_prices(league, key)` index (migration 0011), league order kept in `meta`, and the price file built once per change | A `market.json` miss reads ~5-8 rows instead of whole tables. Reads stay under ~0.6 M a day at 50x (Estimate) | Done. `price_leagues(league)` has no index yet; it is read only on a rebuild after the league order moves |
| 7 | **Longer browser cache where the data allows it**: `part=hist` changes once a day (`max-age=3600`); `bossprices`/`farmprices` are checked about once a day (`max-age=900`); `rollprices` from 1 min to 15 min | Fewer repeat calls from the same browser in long sessions | Tiny: the `Cache-Control` strings in `worker/prices.js` |
| 8 | **Log sampling**: `"observability": {"enabled": true, "head_sampling_rate": 0.1}` | $7.80 of the $21 at 50x | One line in `wrangler.jsonc` |
| 9 | **CPU cap per call on paid**: `"limits": {"cpu_ms": 300}` | A bad deploy or a runaway request cannot burn 30 s of CPU per call | One line |

Not recommended: **Workers Cache** (bills every static request), and **moving `market.json` to Cloudflare's
CDN cache** (a worker on a custom domain runs before the zone cache, so Cache Rules do not apply to its answers).

### Rate limits

- **Free zone plan**: 1 rate-limiting rule, 10 s window, counted per IP, matching on path. Use it on the paths a
  loop would hit: `starts_with(http.request.uri.path, "/api/") or starts_with(http.request.uri.path, "/mcp")`,
  e.g. 60 requests in 10 s, block for 10 s. The site's own pages never come near that (a heavy Trade session is
  ~1 call a second). Leave `market.json` and `/item/*` out of it: shared addresses (a university, a mobile
  carrier) would lose prices.
- **In the worker**: the Workers Rate Limiting binding (`ratelimits` in `wrangler.jsonc`, 10 s or 60 s
  windows, per Cloudflare location) for what one rule cannot express: per-tool limits on the MCP endpoint, a
  per-IP cap on `/api/pob` (it makes outside requests on WI's behalf). It needs no D1 writes, unlike
  `allowed()` in `worker/community.js`, which costs 2 reads and 2 rows written each time it runs.

### Crawler controls

- robots.txt already welcomes the crawlers and disallows `/api/`, `/search`, `/admin`. Keep it: the site wants
  to be read. Fix 5 makes crawling free, which is the real answer.
- Until fix 5: add `<lastmod>` to `sitemap.xml` (from the data's `updated`), so crawlers that honour it stop
  refetching 7,000 unchanged pages, and send `ETag`/`Last-Modified` so a recrawl can be a 304 (still a call,
  but a cheap one).
- Cloudflare **AI Crawl Control** shows each crawler's request count and can rate-limit or block one crawler
  without touching robots.txt. The README already says to leave AI crawlers allowed there. If one misbehaves,
  limit that one there.

### Spend alerts

- **Paid plan**: Cloudflare dashboard > Notifications > Add > **Usage Based Billing**, one per product
  (Workers requests, Workers CPU, D1 rows written), with a threshold. Start with 15 M requests a month
  (about $1.50 over the included 10 M), so there is notice well before it matters. (The notification name is
  as it appears today; check it in the dashboard.)
- **Either plan**: the dashboard's free-plan meter (`stats.plan`) already turns amber. Fix its request count
  to use `cloudflare.workers.requests` (see above), so it counts crawlers too.

### Kill switches, fastest first

1. **WAF custom rule, Block**, one per switch, left disabled: `/api/t` (tracking), `/mcp` (hosted MCP),
   `/api/pob`, `/item/` (crawler pages, in an emergency only). Turning one on takes seconds, needs no deploy,
   and blocked requests never run the worker. The free zone plan allows 5 custom rules.
2. **A flag in D1 `meta`** (`off:track`, `off:mcp`), read through the Cache API with a 60 s key, so the check
   costs no D1 read per call. For switches the code must answer politely (a JSON-RPC error on `/mcp` rather
   than a Cloudflare block page).
3. The service worker's own switch, already documented at the top of `sw.js`: deploy a `sw.js` that
   unregisters.
4. **The budget switch for MCP** (see `design/mcp.md`): a cron trigger reads today's `/mcp` calls from
   Cloudflare's analytics and sets `off:mcp` past the day's budget.

### Donations (#33)

Built and hidden: `assets/support.js` shows the "Support the site" link in the footer, the Patch notes popup
and the Suggest popup once `data/support.json` has something in it. Today it is `{"kofi":"","crypto":[]}`.
**To show it, the owner fills in that file and pushes:**

```json
{"kofi": "https://ko-fi.com/<name>", "crypto": [{"coin": "BTC", "address": "<address>"}]}
```

Either field on its own is enough. It is a static file, so it costs no worker calls.

---

## The budget, in one line each

- Today: ~22,000 worker calls a day, mostly crawlers; free plan at ~22% on requests. D1 reads broke it once
  (25 Sep); fixed in 0.32.
- 10x everything: 220,000 a day; the free plan stops the worker paths every day around 11:00 UTC. Paid: $5.
- 50x everything: 1.1 M a day; paid ~$21 a month, ~$13 with log sampling; with fixes 4 and 5, well under $10.
- People alone: the free plan lasts to ~5,300 visits a day (D1 writes), ~12,000 with fix 3 (then requests), more with fix 4.
- Recommendation: fixes 1 and 2 before 1.0 (minutes), 3 and 4 with the front-end rework, 5 when there is a
  day for it.
