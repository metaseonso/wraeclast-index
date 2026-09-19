# Wraeclast Index

Search every Path of Exile 2 gem, unique, passive, currency and keyword, with live prices and trends.

**Live site:** https://metaseonso.github.io/wraeclast-index/
**Roadmap:** [issue #13](https://github.com/metaseonso/wraeclast-index/issues/13)

## What is in it

- **Search** (home page): one search bar. Results show as live cards: requirements, stats, every mod line, live price, 7-day trend, and a link to the builds on poe.ninja that use the item.
- **Gems, Uniques, Passive tree** (`explore.html`): the full tables and detail panels, for drilling down.

## Where the data comes from

| Data | Source | Refreshed |
|---|---|---|
| Gems, uniques, passives, keywords | The official game files (RePoE export), checked against poe2db | Each game patch |
| Item requirements, currency text | The official game files (RePoE `base_items`, `augments`) | Each game patch |
| Prices and trends | poe.ninja public economy API, current league | Every hour |

Standards every page follows:
- No raw game code in the default view (see issue #12).
- Official game data only. Path of Building is used only to read a pasted build code.

## How it works

The site is static. GitHub Pages serves it; a GitHub Action (`.github/workflows/pages.yml`) runs every hour, fetches prices with `tools/market.py`, and publishes.

| File | What it is |
|---|---|
| `index.html`, `assets/app.js`, `assets/app.css` | The app: search home page and the live card |
| `explore.html` | The drill-down page (built from the Wraeclast Index artifact) |
| `data/index.json` | Search index, built by `tools/sync.py` |
| `data/info.json`, `data/reqs.json` | Item text and requirements, built by `tools/gameinfo.py` |
| `data/market.json` | Prices, rebuilt every hour by `tools/market.py` |
| `data/farms.json`, `data/farmqueries.json` | Farms tab: strategies from BawLoch's public tier list sheet and the trade searches for their rolled tablets and waystones, by hand with `python tools/farms.py` (`data/farmprices.json` holds those searches' prices) |

## Update the game data

1. After a game patch: `python tools/gameinfo.py`
2. After the Wraeclast Index artifact changes: save it, then `python tools/sync.py path/to/artifact.html`
3. Commit and push to `main`. The site republishes in about a minute.

Path of Exile is a trademark of Grinding Gear Games. This is a fan project and is not affiliated with them.
