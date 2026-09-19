# Wraeclast Index

Search every Path of Exile 2 gem, unique, passive, base item, atlas passive and item, currency and keyword, with live prices and trends.

**Live site:** https://wraeclastindex.fyi
**Roadmap:** [issue #13](https://github.com/metaseonso/wraeclast-index/issues/13)

## What is in it

- **Search** (home page): one search bar. Results show as live cards: requirements, stats, every mod line, live price, 7-day trend, and a link to the builds on poe.ninja that use the item.
  Kinds: gems (lineage supports marked), uniques, passives, bases (every weapon, armour piece, shield, buckler, focus, quiver, ring, amulet, belt, jewel, flask, charm, relic and wombgift; the gold button opens the Craft tab on that base), Atlas (atlas passives, waystone tiers, tablets, keys and atlas items; the gold button opens the Atlas tab there), currency and keywords.
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
| `explore.html` | The drill-down page (built from the Wraeclast Index artifact) |
| `data/index.json` | Search index, built by `tools/sync.py`; the base item, Atlas and extra currency cards come from `tools/morecards.py` (kinds `b`, `a`, `c`) |
| `data/kwuse.json` | What uses each keyword (the "Found on" lists on keyword cards), built by `tools/kwuse.py` |
| `data/info.json`, `data/reqs.json` | Item text and requirements, built by `tools/gameinfo.py` |
| `data/market.json` | Prices, rebuilt every hour by `tools/market.py` |
| `data/atlas.json` | Atlas tab: waystones, tablets, keys, atlas items and the Atlas tree, built by `tools/atlas.py` (run after a game patch) |
| `data/farms.json`, `data/farmqueries.json` | Farms tab: strategies from BawLoch's public tier list sheet and the trade searches for their rolled tablets and waystones, by hand with `python tools/farms.py` (`data/farmprices.json` holds those searches' prices) |
| `data/craft.json`, `data/craft/` | Craft tab: every base and the mods it can roll (all tiers, item levels, groups), essences, runes and soul cores, desecrated and corruption mods, orbs, omens and catalysts, built by `tools/craft.py` from the game files (essence tables and orb levels checked on poe2db; run after a game patch, after `tools/tradedata.py`) |

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

`/admin` (`admin.html`, `assets/admin.js`; not linked anywhere, kept out of search engines). Sign in with the dashboard password: the worker checks it against the `DASH_HASH` secret and sets a 12-hour cookie. The page holds no data; everything comes from `/api/admin/*` behind that cookie (`worker/dash.js`).

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
   catalogue lacks; the first run checks each new image link once, up to 20 minutes; lists are cached a day in `tools/cache/`)
3. After a game patch: `python tools/atlas.py` and `python tools/craft.py`, then `python tools/sync.py` again
   (the Atlas cards come from `data/atlas.json`, and a base's Craft link only where the Craft tab has that base)
4. Last, after any of the above: `python tools/kwuse.py`
   (every keyword's "Found on" lists in `data/kwuse.json`: uniques, gems, passives, bases, essences, atlas, crafting, currency,
   keywords; and the "Used by" counts in `data/index.json`; it prints its counts against the artifact's own, lower only for
   things the site leaves out)
5. Commit and push to `main`. The site republishes in about a minute.

Path of Exile is a trademark of Grinding Gear Games. This is a fan project and is not affiliated with them.
