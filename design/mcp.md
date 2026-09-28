# MCP server: WI for AI assistants, local and hosted

For [issue #116](https://github.com/metaseonso/wraeclast-index/issues/116). A design, no code yet. Cost figures
use Cloudflare's prices as checked on 27 Sep 2026 (see `design/traffic.md` for the table and the sources).
Anything not read off the code, the spec or a measurement is marked **Estimate**.

Updated for main at `c123ad2` (28 Sep 2026): the `changes` tool now has its data format (`tools/diff.py`), the
file count uses `dist/` and its budget check, and prices come from the built parts (`design/traffic.md`).

## What it is

An MCP server lets an AI assistant (Claude, ChatGPT, Cursor and others) search WI, read cards, prices and price
history, and name WI as the source. Two forms, the same tools, the same answers:

1. **Local**: an npm package the player runs on their own machine (`npx -y wraeclast-index-mcp`), speaking
   **stdio**. It reads WI's static files over HTTPS. Static asset requests are free and unlimited on
   Cloudflare, so it costs WI almost nothing.
2. **Hosted**: `https://wraeclastindex.fyi/mcp` on the existing worker, speaking **Streamable HTTP**. It is what
   the web apps' "add a connector" boxes need (they take a URL, not a program), and **every message is a billed
   worker request**.

## The spec

Current revision: **2026-07-28** (<https://modelcontextprotocol.io/specification/2026-07-28>). What it changed
suits a worker well:

- **Stateless.** No `initialize` / `notifications/initialized` handshake, no `Mcp-Session-Id`. Every request
  carries its protocol version and client capabilities in `_meta`, so any isolate in any data centre can answer
  any request, and nothing has to be stored between calls.
- **`server/discover`** (required): the server's versions, capabilities and name.
- **Streamable HTTP**: one endpoint, **POST only** (the GET stream is gone). Each JSON-RPC request is its own
  POST. The answer is either one JSON object or an SSE stream scoped to that request. WI answers every request
  with plain `application/json`: nothing it does is slow enough to need progress notifications.
- Required headers on each POST: `MCP-Protocol-Version`, `Mcp-Method`, and `Mcp-Name` on `tools/call`. The
  header must match the body or the server answers 400. Those headers also mean a WAF rule or the worker can see
  which tool is called without parsing the body.
- `tools/list` results carry `ttlMs` and `cacheScope`, so clients can keep the tool list instead of asking again.
  The server should return tools in a fixed order.
- The server **must validate `Origin`**: 403 when present and not allowed. WI allows none (server-side clients
  and agents send none) and its own origin. Any other browser origin gets 403.

**Older clients.** Many clients in the field still speak 2025-06-18 or 2025-11-25: `initialize`, then
`notifications/initialized`, then `tools/list`, then the calls, sometimes a GET for a stream. The hosted
server answers those statelessly (an `initialize` result with no session id, 202 for the notification, 405
for GET), per the spec's backward-compatibility section. That costs 2-4 extra requests per client session,
which is in the numbers below.

**Local, stdio**: newline-delimited JSON-RPC on stdin/stdout, a subprocess the client starts. No network
listener, so DNS rebinding and `Origin` do not apply.

## Tools

Read-only, small answers, names and WI URLs only: no raw game ids (#12). Every answer ends with the
source line, **"Wraeclast Index: https://wraeclastindex.fyi/item/<slug>"**, and every price says where it came
from and how old it is. Each tool returns human-readable `content` and the same data as `structuredContent`,
with an `outputSchema`.

| Tool | Input | Answer | Size | Data (static unless marked) |
|---|---|---|---|---|
| `search` | `query` (≤100 chars), `kind?` (gem, unique, passive, base, atlas, currency, keyword, concept), `limit?` (≤10, default 5) | Name, kind, one line, WI URL per hit | 0.3-1.5 kB (~100-400 tokens) | `data/index-core.json` + `index-rest.json` (1.86 MB, read once) or a search file built for it (Estimate ~300 kB: names, kinds, slugs) |
| `card` | `name` or `url` | The card as WI shows it: kind, requirements, the game's own lines, tags, price summary, URL | **median 650 chars, p90 905, max 1,984** (Measured: the visible text of 722 of the 7,214 crawler pages). Cap 4 kB | The index files, or per-card files (below) |
| `price` | `name` | Value in divine (and exalted), **source** ("in-game Currency Exchange, last 24 h" / "trade site: middle of the 5 cheapest online listings, white base"), **checked at**, **age in hours**, `late` when a job has missed its run, listing count | ~300 bytes | `market.json?part=live` (**worker path**) |
| `history` | `name`, `days?` (default 30, ≤365), `league?` | Daily points, cut to ≤60 points, plus past leagues' lines (marked when the value is poe.ninja's, as the card does) | 0.6-1.5 kB | `market.json?part=hist` (**worker path**), `leagues.json` |
| `changes` | `patch?`, `name?` | What changed in a game patch: for one card, or a list for the patch (paged, 25 a page) | ≤3 kB a page `data/changes/<build>.json`, written by `tools/diff.py` from two snapshots (`tools/snapshot.py`, kept on the data repo); `data/patches.json` ties a build to its patch. The format is on main; no file is committed yet |
| `compare` | `names` (2-4) | The cards side by side: the fields they share, prices with source and age | 2-5 kB | The index files + `live` |

Also `resources`: `llms.txt` and the terms from robots.txt, so a client can show where the data comes from and
how to credit it.

**One core, two shells.** The tools live in one module (`mcp/core.js`) that takes a `load(path)` function and
builds every answer. The local package passes a loader that fetches from `https://wraeclastindex.fyi` and keeps a
disk cache. The worker passes `env.ASSETS.fetch`. Same code, same answers, which is what "both answer the same
way" in #116 needs. The only difference is where the files come from.

**Per-card files (for the hosted form).** The first request in a new isolate that parses the 2.8 MB
`data/index.json` takes **161 ms CPU** (Measured, the crawler pages' model). That is fine once per isolate on the
paid plan, and over the free plan's 10 ms every time. So `tools/build.mjs` writes one small JSON per card
(`data/mcp/<slug>.json`, ~1-2 kB, Estimate) and a compact search file, and the hosted tools read only the file
they need. 7,214 files plus the 7,223 crawler pages (`design/traffic.md` fix 5) plus today's 167 in `dist/` is
~14,600: within the free plan's 20,000 files per version and under `tools/dev/budget.mjs`'s fail line (18,000),
but over its warn line (10,000). `tools/build.mjs` leaves out any file below `data/` that no page, module or
worker file names, so the worker code must name the folder (`'data/mcp/'`) or the files never ship.

## Local package: how it reads WI

| Reads | From | Cost to WI |
|---|---|---|
| The index (or the search file and per-card files) | `https://wraeclastindex.fyi/data/...`: static | **$0**: free and unlimited. Kept on disk and revalidated with `If-None-Match` once a day; a 304 is also a static request |
| `leagues.json` | A worker path today; `design/traffic.md` fix 4 makes it static | 1 call a day per install today (kept a day); $0 after fix 4 |
| Prices (`price`, `compare`) | `market.json?part=live`: **worker** | 1 call per 10 min at most, and only while price tools are being used |
| History | `market.json?part=hist`: **worker** | 1 call per hour at most, only when asked |

The package never asks for prices on its own schedule: the first price question fetches, later ones use the
copy for 10 minutes. It sends `User-Agent: wraeclast-index-mcp/<version> (+https://wraeclastindex.fyi)`, so the
owner's dashboard shows it in the agents list and a WAF rule can single it out if a version misbehaves.

**Per 1,000 tool calls, local** (Estimate: a one-hour session, prices asked about throughout): ~6 `live` + 1
`hist` = **~7 worker calls**. On paid, that is $0.000002. On free, it is 0.007% of the day's quota. **A local
install cannot take the site down**, however badly the agent behind it loops: the floor is 6 price calls and 1
history call an hour, whatever the agent does.

Worst case: an install left running with an agent polling prices all day is 144 + 24 = 168 calls a day. It
would take ~600 of those to reach 100,000 a day. Keep the floors as they are.

Setup, for the README:

```json
{"mcpServers": {"wraeclast-index": {"command": "npx", "args": ["-y", "wraeclast-index-mcp"]}}}
```

## Hosted endpoint: what a call costs

| | Per 1,000 tool calls |
|---|---|
| Worker requests | **~1,200** (Estimate): 1,000 POSTs, plus `server/discover` / `tools/list` for new clients, plus 2-4 handshake requests per session from pre-2026-07-28 clients (assumed 10 calls a session) |
| CPU | ~2 ms a call from small files and in-memory copies = **~2,400 CPU-ms** (Estimate) |
| D1 | **0** per call. Nothing is written (no tracking, no D1 counter), and prices come from the Cache API copies `market.json` already keeps; a miss there reads ~5-8 rows, once per data centre every 5 min |
| Free plan | 1.2% of the 100,000 a day, shared with the site |
| Paid, inside the included 10 M requests / 30 M CPU-ms | **$0** |
| Paid, past the included amounts | requests 1,200 x $0.30/M = $0.00036; CPU 2,400 x $0.02/M = $0.00005; Workers Logs 1,200 x $0.60/M = $0.00072 (none at 10% log sampling) |
| **Paid, total past the included amounts** | **~$0.0011 per 1,000 calls; ~$0.0004 with log sampling** (Estimate) |

In other words: **a million hosted tool calls a month costs about $0.40-$1.10** once the included amounts are
used up, or nothing if they are not. The money is not the risk. **The free plan's shared quota is**: one agent
looping at 2 calls a second is 172,800 requests a day, more than the whole site's 100,000. From that moment
`market.json`, the crawler pages and the service worker all answer 429 until midnight UTC.

## No keys, read-only

- No sign-in, no API key, no account. Every tool only reads public game data and WI's own prices.
- Nothing a player typed goes out: Suggest notes, names and sources players gave, and trade searches are never
  in an answer. The data is the game's text and WI's numbers, so there is nothing for a prompt injection to
  ride in on.
- Nothing is written per call. Counting comes from Cloudflare's own analytics (free), not D1.
- The terms are robots.txt's four lines, returned as a resource and on every answer's source line: free to use,
  name WI and link the page.
- A request, not a licence, as robots.txt says. The rate limits and the budget below are what actually protect
  the quota.

## Rate limits

Blocked before the worker runs, so blocked calls cost nothing:

- **The zone's one rate-limiting rule** (free zone plan: 1 rule, 10 s window, per IP), shared with `/api/`:
  `starts_with(http.request.uri.path, "/mcp") or starts_with(http.request.uri.path, "/api/")`, 60 requests in
  10 s, block for 10 s. Stops a tight loop at ~6 a second.

In the worker, with the Workers Rate Limiting binding (`ratelimits` in `wrangler.jsonc`; 10 s or 60 s
windows, counted per Cloudflare location, no D1):

- `MCP_CLIENT`: 60 calls a minute per client key (a hash of IP + User-Agent).
- `MCP_HEAVY`: `history` and `compare`, 10 a minute per client key.
- Over a limit: HTTP 429 with `Retry-After`, and a JSON-RPC error whose message says when to try again, in words
  an agent will act on: "Rate limited. Try again in 40 s. Prices change hourly; the answer you have is current."

**Shared addresses.** Hosted connectors (claude.ai, ChatGPT) call from their providers' servers, so
thousands of players can arrive from a few IPs. That is why the key is IP + User-Agent and not IP alone, and
why the limit is per minute, not per day. If one platform's traffic is legitimate and large, raise its limit by
User-Agent. The daily budget is the backstop, not the per-client limits.

## Caching

- **In the isolate**: the search file and the parsed prices stay in memory (prices refreshed every 5 minutes, as
  `worker/seo.js` already does for the crawler pages). Most calls parse nothing.
- **Cache API**: a `tools/call` with the same tool and the same arguments (normalized: lower-case, trimmed,
  sorted) is answered from a 5-minute copy for prices and history, 1 hour for cards and search. It saves CPU,
  not requests: a request that reaches the worker is billed, cached or not.
- **The client's own cache**: `tools/list` with `ttlMs` 24 h and `cacheScope` public; each price answer says when
  it was checked and when the next check is due, so an agent has a reason not to ask again.
- **Not** Workers Cache (it bills every static request on the site; see `design/traffic.md`), and not
  Cloudflare's CDN cache (POST is not cached).

## The daily budget and the kill switch

1. **Budget**: a cron trigger (`"triggers": {"crons": ["*/15 * * * *"]}`, 96 calls a day) asks Cloudflare's
   analytics how many requests `/mcp` has had since 00:00 UTC. The read-only analytics token the dashboard uses
   (`CF_ANALYTICS_TOKEN`, `worker/cfstats.js`) is enough. Past the day's budget it writes `off:mcp` to D1 `meta`
   (one row written) and clears it at 00:00 UTC. Starting budgets: **20,000 a day on the free plan** (a fifth of
   the site's quota), **500,000 a day on paid** (worst case, all of it past the included amounts: ~$0.56 a day, ~$0.21 with log sampling; Estimate).
2. **The worker reads the flag through the Cache API** (a 60 s key), not D1, so checking it costs nothing per
   call. When it is set, every tool answers a JSON-RPC error: "WI's hosted tools are resting until 00:00 UTC.
   The local package works: npx -y wraeclast-index-mcp."
3. **By hand, in seconds**: a WAF custom rule `starts_with(http.request.uri.path, "/mcp")`, Block, left
   disabled until needed. No deploy, and blocked calls never reach the worker.

The analytics lag a few minutes, so the budget can be overrun by 15 minutes of traffic. The rate limits
bound that: at most ~6 a second per client.

## Abuse cases

| Case | What happens | What stops it |
|---|---|---|
| An agent loops on the same call | Same tool, same arguments, many times a second | Cache API copy (no CPU); the per-client limit after 60 a minute; the zone rule after 60 in 10 s; the answer's own "checked at ... next check ..." |
| An agent polls a price | `price` every few seconds | The same, plus `MCP_HEAVY`-style limits if needed; the answer says prices change hourly (currency) or about daily (trade listings) |
| Walking every card through `card` | 7,214 calls | Cheap on paid ($0.008 past the included amounts); the per-client limit spreads it over two hours; `llms-full.txt` and the per-card files are the better route, and `resources` says so |
| Many agents behind one platform's IPs | Legit traffic looks like one heavy client | Key by IP + User-Agent; raise that platform's limit; the budget backstops |
| Huge inputs | Long queries, 50-name compares, 10-year histories | `inputSchema` limits, checked in the worker; bodies over 8 kB refused before parsing |
| A spread-out scrape | Many IPs, each under the limits | The daily budget; then the WAF block; Cloudflare's bot controls |
| Prompt injection through WI's data | Text in an answer that tells the agent to do something | Answers carry only the game's text and WI's numbers; nothing a player typed |
| A local install gone wrong | An agent loops on the local package | The floors: ≤6 `live` and ≤1 `hist` worker calls an hour per install; everything else is static |

## Which first

**Local first, hosted second, and hosted only after the paid plan and the rate-limit rule are in place.**

The reasoning, in cost:

- **Local**: ~7 worker calls per 1,000 tool calls, and a hard floor of ~7 calls an hour per install, however
  the agent behaves. It works on the free plan today and cannot hurt the site. It is also the proving ground
  for the tool set, the answer sizes and the wording, with no quota at stake.
- **Hosted**: ~1,200 worker calls per 1,000 tool calls. On paid that is ~$0.0004-$0.0011 per 1,000 calls past
  the included amounts, so money is not the problem. On the free plan one looping agent uses up the site's
  whole day, and prices and crawler pages go down with it. It only becomes safe after `design/traffic.md`
  fixes 1 (paid plan) and 2 (the WAF rule and kill switches), plus the budget switch above.
- Hosted still matters: the web apps' connector boxes take a URL, so hosted is how most players who use an
  assistant in a browser would reach WI. It should follow the local package quickly, before 1.0 is announced,
  on the same core.

Order of work:

1. `mcp/core.js`, the six tools over a `load()` function. `changes` needs a committed `data/changes/<build>.json`
   (`tools/diff.py`); ship five tools and add `changes` when the first file lands.
2. The local package (stdio), published to npm, set up in the README.
3. `tools/build.mjs` writes the per-card files and the search file.
4. The paid plan, the zone rate-limit rule, the WAF kill-switch rule (`design/traffic.md`).
5. `/mcp` in `worker/index.js`: `server/discover`, `tools/list`, `tools/call`, the older clients' handshake,
   `Origin` check, the rate-limit bindings, the Cache API copies, the `off:mcp` flag.
6. The budget cron.
7. Listed where assistants look for servers, with the URL and the npm name.
