# Wraeclast Index

Search every Path of Exile 2 gem, unique, passive, base item, atlas passive and item, currency and keyword, with live prices and trends.

**Live site:** https://wraeclastindex.fyi
**Roadmap:** [issue #13](https://github.com/metaseonso/wraeclast-index/issues/13)

## What is in it

- **Search** (home page): one search bar. Results show as live cards: requirements, stats, every mod line, live price, 7-day trend, and a link to the builds on poe.ninja that use the item.
  Kinds: gems (lineage supports marked), uniques, passives, bases (every weapon, armour piece, shield, buckler, focus, quiver, ring, amulet, belt, jewel, flask, charm, relic and wombgift; the gold button opens the Craft tab on that base), Atlas (atlas passives, waystone tiers, tablets, keys and atlas items; the gold button opens the Atlas tab there), currency, keywords, and concepts — our own cards for how the numbers on a mod line stack (increased and reduced, more and less, added damage), each naming where its maths comes from.
- **Gems, Uniques, Passive tree** (`explore.html`): the full tables and detail panels, for drilling down.

## Where the data comes from

| Data | Source | Refreshed |
|---|---|---|
| Gems, uniques, passives, keywords | The official game files (RePoE export), checked against poe2db | Each game patch |
| Item requirements, currency text | The official game files (RePoE `base_items`, `augments`) | Each game patch |
| Base items | The official game files (RePoE `base_items`, `mods`), only the bases on the official trade site's list (what exists in the game today) | Each game patch |
| Atlas cards | `data/atlas.json` (the game files, see below) | Each game patch |
| Prices and trends | poe.ninja public economy API, current league | Every hour |
| Card images | Official game art only: the game's image server (links from poe.ninja and the official trade site), poe.ninja's passive icons, and RePoE's export of the game's art | Each sync |

Standards every page follows:
- No raw game code in the default view (see issue #12).
- Official game data only. Path of Building is used only to read a pasted build code.

## How it works

The site is static. GitHub Pages serves it; a GitHub Action (`.github/workflows/pages.yml`) runs every hour, fetches prices with `tools/market.py`, and publishes.

| File | What it is |
|---|---|
| `index.html`, `assets/app.js`, `assets/app.css` | The app: search home page and the live card |
| `assets/kinds.js` | Every kind of thing the site cards, in one table: what it is called, which fields its cards carry, which buttons they offer, which related lists they can build, and where its gold button goes. `assets/app.js` draws a card by walking it — one function per field type, none of them per kind — and `assets/bridge.js` and `tools/dev/guard.mjs` read the same table. A field may name a table of its own (`file`), fetched the first time a card asks for it and never in first paint, which is how an essence card lists what it adds per kind of item. A new kind is one entry here plus its rows in the index, and no card code |
| `assets/edges.js` | What else belongs with a card: every list under "Found on", worked out from the index itself and followed both ways (a unique names its base, a base names its uniques). Answers per list how many there are altogether and the first few, so a card draws eight rows and says the true total |
| `explore.html` | The drill-down page (built from the Wraeclast Index artifact); its data sits in `data/explore/` (files named by their content) |
| `data/index.json` | Search index, built by `tools/sync.py`; the base item, Atlas and extra currency cards come from `tools/morecards.py` (kinds `b`, `a`, `c`), and the keyword cards the artifact does not carry, plus the ascendancy notables whose whole effect is a skill, from `tools/gamelib.py` (kinds `w` and `p`), and the concept cards from `tools/concepts.py` (kind `h`); the phrases in a card's lines that name another card are marked by `tools/nodelinks.py` (`lx` on the card, `lxk` the key table). `tools/carddata.py` then joins on everything a card can say that was shipped but never reached one: the game's flavour line for uniques and keystones (`qt`), what an Atlas key or item is for (`t`), how many mods can roll on a base and whether their weights are measured (`cw`), and the official text for a name the market prices but no card covers (`ix`). The home page loads it in two parts, `data/index-core.json` and `data/index-rest.json` (`tools/appdata.py`) |
| `sw.js` | The service worker (see Speed) |
| `assets/fonts/` | The site's own copies of its fonts (Cinzel, IBM Plex Sans, IBM Plex Mono; SIL Open Font License) |
| `data/kwuse.json` | What uses each keyword (the nine lists under "Found on" on a keyword card), built by `tools/kwuse.py`. Loaded the first time a card that needs it opens |
| `data/grants.json` | What grants a skill and what each skill is granted by (base items, ascendancy notables and uniques), both directions, built by `tools/grants.py`. Loaded the first time a card that needs it opens, like `data/kwuse.json` |
| `data/essences.json` | What an essence adds, on each kind of item: one row per modifier, the game's own wording for it, the kinds of item that get that same one (each opening the Craft tab there), which side it lands on and its level. Built by `tools/essences.py` from the essence tables in `data/craft/`, 24 kB; the `adds` field declares it in `assets/kinds.js` and it is fetched the first time a card that needs it opens, so the 1.6 MB behind it stays on the Craft tab |
| `data/info.json`, `data/reqs.json` | Item text and requirements, built by `tools/gameinfo.py` |
| `data/market.json` | Prices, rebuilt every hour by `tools/market.py` |
| `data/atlas.json` | Atlas tab: waystones, tablets, keys, atlas items and the Atlas tree, built by `tools/atlas.py` (run after a game patch) |
| `data/farms.json`, `data/farmqueries.json` | Farms tab: strategies from BawLoch's public tier list sheet and the trade searches for their rolled tablets and waystones, by hand with `python tools/farms.py` (`data/farmprices.json` holds those searches' prices) |
| `data/bosses.json`, `data/bossqueries.json` | Bosses tab (`assets/bosses.js`, at `#/bosses`, in the top bar and linked from the Atlas page): every endgame boss, what it drops and what it costs to fight, by hand with `python tools/bosses.py`; the entry items the in-game Currency Exchange does not trade get a trade search of their own here. The site serves `/data/bossprices.json`: every one of those items' real price, from the hourly unique checks, the Currency Exchange and those searches (`worker/prices.js`). The search reads this file too, so every boss is a card of its own kind (`x`) without a `tools/sync.py` rebuild |
| `data/craft.json`, `data/craft/` | Craft tab: every base and the mods it can roll (all tiers, item levels, groups), how often each mod rolls, essences, runes and soul cores, desecrated and corruption mods, orbs, omens and catalysts, built by `tools/craft.py` from the game files (essence tables and orb levels checked on poe2db; run after a game patch, after `tools/tradedata.py`). The weights are the one thing the game files do not carry — every spawn weight in the export is 1 or 0, can roll or cannot — so they come from Craft of Exile, pulled into `tools/craftweights.json` by `tools/craftweights.py` and named on the page where they are shown |
| `data/gamedata.json` | Which patch the shipped data is from, written by `tools/gamepull.py` (one daily pull of the official export; it also writes the gap report `tools/dev/gaps.txt` — what the game files hold against what we card) |
| `data/gamestats.json` | One monster of each level (life, damage, accuracy, armour, evasion) and what each class starts with, from the game files by `tools/gamelib.py`. Nothing reads it yet |
| `data/faults.json` | Which sections are showing an older copy right now, and why, written by `tools/lastgood.py` (see below). The dashboard's Data jobs block and `/api/health` read it |

### Last good wins

Every builder that fills the index from an outside source runs its pull through `tools/lastgood.py`. A pull that
throws, comes back empty or collapses against what is committed (an empty list, under a floor that source has
always cleared, a fifth of its rows gone, or a whole kind gone) never overwrites the good file. The committed
copy stays, the run prints what went stale with the counts before and after, how old the kept copy is and the
likely cause, the fault is written to `data/faults.json`, a GitHub issue labelled `data-fault` is opened or
reused (where the `gh` CLI is signed in), and the run exits non-zero. The owner sees the section in the
dashboard's Data jobs block and in `/api/health`, in the same fine/late/stopped style as the jobs. Applies to
`sync.py`, `craft.py`, `uniques.py`, `leagues.py`, `market.py`, `exchange.py`, `gamepull.py`, `tradedata.py`,
`gameinfo.py`, `atlas.py`, `bosses.py` and `farms.py`. The tools that build only from files already on disk
(`appdata.py`, `concepts.py`, `kwuse.py`, `nodelinks.py`, `essences.py`, `grants.py`, `gamelib.py`, `rollprices.py`) have no
outside source to lose; the live prices (`pricepull.py`) are watched as jobs of their own. Proved without the
network by `node tools/dev/faults.mjs`.

**Before every push: `node tools/dev/guard.mjs`** (about 5 seconds). It starts a local copy of the site and
checks the card counts, every deep link the code emits, every public page, that no raw game code shows where a
player reads it, and that a phone-sized Chrome still opens a card without it snapping shut. See
[`tools/dev/README.md`](tools/dev/README.md).

## Speed

- **First visit.** The home page asks for what its first cards need before anything else: `data/index-core.json` (uniques
  and currency cards) and `data/market.json?part=now` (today's prices without the day-by-day history). The rest of the
  index and the history follow right after (`data/index-rest.json`, `?part=past`); search, the popups and the other tabs
  wait for them, a moment later. The fog and wisps load after the first cards. The fonts are the site's own
  (`assets/fonts`, only the weights in use; the two that paint first are preloaded).
- **The drill-down page** is only the page (about 35 KB); its data comes from `data/explore/`, the Gems table's files
  first. Until its table is drawn, the space under the header stays empty, so nothing jumps.
- **Repeat visits** open from the browser's own copy: `sw.js` keeps each deploy's files together. The worker writes the
  deploy's version id into it, so every deploy is a new copy and a page is never a mix of two deploys. After a deploy,
  the next load still opens the copy it has while the new one downloads; the load after that is the new deploy (reload
  twice to check a deploy in a browser that has visited before). Never kept: `/api/*`, `/admin`, the crawler pages and
  the live price files (market, leagues, roll and farm prices).
- **Nothing to run by hand:** `tools/sync.py` and `tools/kwuse.py` write the index parts and the drill-down files; after
  editing `data/index.json` by hand, run `python tools/appdata.py` (or `python tools/nodelinks.py`, which finds the
  references in the lines again and then writes the parts). To switch the service worker off everywhere, make
  `sw.js` a file that only calls `self.registration.unregister()`.

## Findable (search engines and AI search)

The app runs on scripts, so the worker also serves plain pages that any crawler can read (`worker/seo.js`, built live from `data/index.json` and the market file, cached for an hour):

| Address | What it is |
|---|---|
| `/item/<name>` | One page per gem, unique, passive, base item, atlas thing, currency and keyword: requirements, official lines, price and 7-day change, and a gold link into the app. Unique variants add the base (`/item/runeseekers-call-runic-fork`) |
| `/gems`, `/uniques`, `/passives`, `/bases`, `/atlas`, `/currency`, `/keywords` | The lists, grouped |
| `/sitemap.xml` | Every page, with dates |
| `/llms.txt`, `/llms-full.txt` | The site in plain words for AI search; the full one has every item |
| `/search?q=...` | Opens the app's search (for the search box in Google results) |
| `robots.txt` | Everyone welcome, AI crawlers named one by one |

`index.html` and `explore.html` carry the title, description, canonical address, link preview (`assets/brand/social.png`, made by `tools/social.py` from the brand files) and structured data. The explore page's head comes from `SEO` in `tools/sync.py`.

Two things to do by hand, once:
1. Add `https://wraeclastindex.fyi` in [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) (Bing can import from Google). Verify with a DNS TXT record in Cloudflare, or paste the meta tag where the comment in `index.html` says. Then submit `https://wraeclastindex.fyi/sitemap.xml` in both.
2. In the Cloudflare dashboard, for the domain: **AI Crawl Control** (also under Security > Bots): turn off "Block AI bots" and set the AI crawlers to allow, and turn off the "managed robots.txt" option (it adds its own blocks for AI crawlers in front of ours). Cloudflare can block AI crawlers by default.

## Owner dashboard

`/admin` (`admin.html`, `assets/admin.js`; not linked anywhere, kept out of search engines). Sign in with the dashboard password: the worker checks it against the `DASH_HASH` secret and sets a 12-hour cookie. The page holds no data; everything comes from `/api/admin/*` behind that cookie (`worker/dash.js`). The same numbers can be read without a password with the owner's key (`Authorization: Bearer <key>`, only its SHA-256 in the `OWNER_HASH` secret): the four reading GETs only, never a write or a sign-in (`tools/dev/dash.mjs`).

It shows page views per day, pages, how visitors arrive (direct, search engines, AI search, social, other sites), countries, devices, top clicks, a heatmap per page and device, notes from the Suggest button (mark read or done), the trade site load per hour, and how close the site is to the Cloudflare free plan.

What is tracked (`assets/track.js`, sent in small batches to `/api/t`):
- page views: the page, the other site's name or "direct" (or a `utm_source` tag), phone/tablet/desktop
- clicks: a fixed label such as "tab:Trade", "card:gem", "popup:Trade" or the host of a link out; never what anyone types
- click spots: across in 2% steps of the screen width, down in 20 px steps of the page

What is not: no cookies for visitors, no IP address, no account, nothing typed (only the Suggest notes players send on purpose). Nothing is sent when the browser asks not to be tracked (Do Not Track or Global Privacy Control), from inside a frame, or from the owner's own browser once signed in (a tick box on the dashboard).

The counts live in the site's D1 database, per day (tables `views`, `clicks`, `heat` from `worker/migrations/0005_dash.sql`); request volume goes into the `load` table. The country is Cloudflare's two-letter guess.

## Update the game data

In this order (each step reads what the one before wrote):

1. After a game patch: `python tools/gameinfo.py`, then `python tools/tradedata.py`
2. `python tools/sync.py path/to/artifact.html` (after the Wraeclast Index artifact changes; `explore.html` works too, it holds the same data)
   (builds `data/index.json`: the artifact's gems, uniques, passives and keywords, plus base items, the Atlas and the currency the
   catalogue lacks, and the references inside each card's lines; the first run checks each new image link once, up to 20 minutes;
   lists are cached a day in `tools/cache/`)
3. After a game patch: `python tools/atlas.py`, then `python tools/craftweights.py` and `python tools/craft.py`, then `python tools/sync.py` again
   (the Atlas cards come from `data/atlas.json`, and a base's Craft link only where the Craft tab has that base.
   `tools/craftweights.py` pulls the mod weights Craft of Exile publishes, three requests, into `tools/craftweights.json`;
   if it fails it keeps the last good file, says so and exits 1, and `tools/craft.py` then keeps the weights already
   in `data/craft/` — so run it first and read what it says, but a bad pull never empties the page)
4. After every `tools/sync.py`: `python tools/gamelib.py`
   (the keyword cards the artifact does not carry, the keyword links that reach them, the 33 ascendancy notables whose
   whole effect is a skill, and `data/gamestats.json`; `tools/sync.py` rebuilds `data/index.json` from the artifact, so
   this has to come after it. Running it twice adds nothing twice, and `--report` says what it would do without writing)
5. After `tools/gamelib.py`: `python tools/grants.py`, then `python tools/nodelinks.py`
   (`data/grants.json`, the grants-skill edges both ways; it resolves against the cards the two steps above wrote, and
   writes nothing else. `tools/nodelinks.py` after it, so the new cards' own lines get their references too.
   `python tools/concepts.py` does the same after changing a concept card's wording, without a full sync)
6. After `tools/nodelinks.py`, and after any `tools/craft.py`: `python tools/essences.py`
   (`data/essences.json`, what each essence adds per kind of item, off the essence tables in `data/craft/`; it marks
   the phrases in those modifier lines the same way a card's own lines are marked, so it reads `data/index.json` and
   writes nothing else)
7. Last, after any of the above: `python tools/kwuse.py`
   (every keyword's "Found on" lists in `data/kwuse.json`: uniques, gems, passives, bases, essences, atlas, crafting, currency,
   keywords; and the "Used by" counts in `data/index.json`; it prints its counts against the artifact's own, lower only for
   things the site leaves out)
8. Commit and push to `main`. The site republishes in about a minute.

Path of Exile is a trademark of Grinding Gear Games. This is a fan project and is not affiliated with them.
