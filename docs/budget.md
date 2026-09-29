# Traffic budget for 1.0 (#128)

Measured 29 Sep 2026 from Cloudflare's own counts (GraphQL analytics, the 7 days 22–28 Sep). Prices from
https://developers.cloudflare.com/workers/platform/pricing/ and https://developers.cloudflare.com/d1/platform/pricing/.

## What costs anything

Static files (every page, card data, search index, pictures, the crawler pages) are free and have no limit.
Only the worker paths count (wrangler.jsonc `run_worker_first`): `/data/market.json`, `/data/market/*`,
`/data/rollprices.json`, `/data/farmprices.json`, `/data/bossprices.json`, `/api/*`, `/search`. Those use two
metered things: worker requests, and D1 database rows read and written.

## Today

| | Free plan limit | Average day | Busiest day |
|---|---|---|---|
| Worker requests | 100,000 a day | 7,700 | 12,348 (24 Sep) |
| D1 rows read | 5,000,000 a day | 1,600,000 | 5,041,267 (25 Sep: over the limit) |
| D1 rows written | 100,000 a day | 4,500 | 8,261 |
| Real visitor page loads (browser count) | | 65 | 186 |
| Page views, bots included | | 7,400 | 12,211 |

Worker requests by path, 7 days, with a user agent:

| Path | Requests | Who |
|---|---|---|
| `/data/market.json` | 2,421 | visitors |
| `/api/prices/ingest` | 769 | the hourly price job |
| `/api/data/put` | 526 | the data jobs |
| `/api/t` | 250 | visitors (page counts) |
| `/api/prices/state` | 198 | the price job |
| `/api/health` | 75 | the watch job, the Data page |
| `/data/rollprices.json`, `/data/bossprices.json` | 111 | visitors |

The rest of the worker requests show no user agent in the zone counts; the worker's own cache reads and writes
(`caches.default`) show the same way. A count per route inside the worker would split them; until then this budget
counts every worker request, whoever made it, and grows all of it with traffic.

The worker also stopped some requests on the free plan's 10 ms CPU cap: about 50 on 27 Sep (`exceededResources`).

## At 10× and 50×

Every worker request and every row read grows with traffic. Busiest day as the base:

| | Today (busiest) | 10× | 50× |
|---|---|---|---|
| Worker requests a day | 12,348 | 123,000 | 617,000 |
| Worker requests a month | 370,000 | 3,700,000 | 18,500,000 |
| D1 rows read a day | 5,000,000 | 50,000,000 | 250,000,000 |
| Free plan | over on D1 already | over on both | over on both |
| Workers Paid, a month | $5 | $5 | $7.55 |

Workers Paid is $5 a month. It includes 10 million worker requests a month (then $0.30 a million), 25 billion D1
rows read and 50 million rows written a month, and a 30 s CPU cap. 50× is 18.5 million requests: $5 + 8.5 × $0.30
= $7.55. D1 at 50× is 7.5 billion rows read a month, inside the 25 billion.

On the free plan, a day over a limit stops the worker paths until midnight UTC: prices, charts, the dashboard and
the jobs' uploads. The static site keeps working, with the last prices each browser kept (sw.js `wi-last`).

## What is done

- Caching: `market.json` answers carry `public, max-age=300, stale-while-revalidate=600`, and each data centre keeps
  its copy 5 minutes (worker/prices.js). The browser asks again at most every 5 minutes.
- A cap per address on the worker paths: 120 a minute (wrangler.jsonc `ratelimits`, worker/index.js `flooding`).
  A page asks 1 to 3. The jobs' paths have their own keys and no cap.
- The page counts go to Analytics Engine, not D1, since 28 Sep, so traffic cannot spend D1's writes.

## What is next

- Move to Workers Paid before 1.0 (owner: paid hosting waits for funding, #33). It removes both walls for $5 a
  month up to 10× and about $7.55 at 50×. Set a billing notification in the Cloudflare dashboard when it is on.
- Rows read: 25 Sep read 5 million rows. Find the query behind it before traffic grows (worker/cfstats.js D1 meter).
- A count per route inside the worker, so the untagged requests have a name.
- A load test at 10× today's busiest hour (about 850 worker requests) against a preview deploy, not the live site.
