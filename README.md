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

The site is static, and every hourly job that keeps it live runs on GitHub Actions — nothing of ours is deployed anywhere. `.github/workflows/pages.yml` runs every hour (and on every push to main): fetches prices with `tools/market.py`, currency prices with `tools/exchange.py`, league dates with `tools/leagues.py`, then publishes to GitHub Pages. `.github/workflows/prices.yml` runs every hour too, checking real listings on the official trade site with `tools/pricepull.py` and sending them to the site.

| File | What it is |
|---|---|
| `index.html`, `assets/app.js`, `assets/app.css` | The app: search home page and the live card |
| `assets/kinds.js` | Every kind of thing the site cards, in one table — the framework's declarations: what it is called, which fields its cards carry, which buttons they offer, which groups of connections they can build, and where its gold button goes. `assets/app.js` is the framework's one generic renderer: it draws a card by walking the declaration — one function per field type, none of them per kind — and `assets/bridge.js` and `tools/dev/guard.mjs` read the same table. A field may name a table of its own (`file`), fetched the first time a card asks for it and never in first paint, which is how an essence card lists what it adds per kind of item; that name may carry `@field`, filled in from the entry, so one field reads a table per item class — how a base item's card lists the modifiers it can roll and what a corruption can add. A new kind that fits the framework is one entry here plus its rows in the index, and no card code; a kind that does not is what widens it. It also holds the card's own frame — the slots it has, how many pieces each draws and what it says about the rest — written out in [`docs/frame.md`](docs/frame.md) and enforced by `tools/dev/frame.mjs` |
| `assets/edges.js` | What else belongs with a card: every group under Connections, worked out from the index itself and followed both ways (a unique names its base, a base names its uniques). Answers per list how many there are altogether and the first few, so a card draws eight rows and says the true total |
| `assets/marks.js` | The doors inside a line: every keyword a card's own lines name, marked on the word where it is read and opening that keyword's card. Worked out as the card is drawn from the keyword cards the browser already holds, so the index ships nothing for it. A keyword's own name counts wherever it is read; its other spellings count only on a card whose own keyword list names it (`kw`, the game's markup, and the list the chips are made from); a phrase two cards answer to is left plain. The index's own build-time marks (`lx`, `tools/nodelinks.py`) keep the ground they hold |
| `assets/basepool.js` | What one base item can already have, read off its own item class's table in `data/craft/`: the modifiers its pool rolls, the ones a corruption adds, and the defence mixes its bases come in. It draws nothing and knows no kind — a base item's card reads it through the `canroll` and `cancorrupt` fields, and the Trade page reads it to narrow its mod list, its defence types and its sliders to the base you picked, so both narrow to the same thing |
| `explore.html` | The drill-down page (built from the Wraeclast Index artifact); its data sits in `data/explore/` (files named by their content) |
| `data/index.json` | Search index, built by `tools/sync.py`; the base item, Atlas and extra currency cards come from `tools/morecards.py` (kinds `b`, `a`, `c`), and the keyword cards the artifact does not carry, the item classes, plus the ascendancy notables whose whole effect is a skill, from `tools/gamelib.py` (kinds `w`, `i` and `p`), and the mechanics cards from `tools/mechanics.py` (kind `h`), and the tree's small passives plus the conquerors a timeless jewel rolls from `tools/treecards.py` (kind `p`, marked `lo`: they rank below every other card the same words match); the phrases in a card's lines that name another card are marked by `tools/nodelinks.py` (`lx` on the card, `lxk` the key table). `tools/carddata.py` then joins on everything a card can say that was shipped but never reached one: the game's flavour line for uniques and keystones (`qt`), what an Atlas key or item is for (`t`), how many mods can roll on a base and whether their weights are measured (`cw`), and the official text for a name the market prices but no card covers (`ix`). The home page loads it in two parts, `data/index-core.json` and `data/index-rest.json` (`tools/appdata.py`) |
| `sw.js` | The service worker (see Speed) |
| `tools/build.mjs`, `package.json` | What Cloudflare serves: before every deploy (`wrangler.jsonc` `build`) the files `.assetsignore` lets through are copied into `dist/` and the JS, CSS and the pages' inline scripts minified by esbuild, one file at a time. `dist/sw-files.json` lists every path with a hash of its bytes for `sw.js`. A file esbuild cannot read ships as it is, and no esbuild at all ships the plain copy. `dist/` is never committed; GitHub Pages and the checks read the repo itself |
| `assets/fonts/` | The site's own copies of its fonts (Cinzel, IBM Plex Sans, IBM Plex Mono; SIL Open Font License) |
| `data/kwuse.json` | What uses each keyword (the nine groups under Connections on a keyword card), built by `tools/kwuse.py` for every keyword the site cards, not only the ones the drill-down page carries. It also names the keywords that page can filter its own lists by (`dd`), which is what decides whether a card's "See all in Gems" has a list to send anyone to. Loaded the first time a card that needs it opens |
| `data/grants.json` | What grants a skill and what each skill is granted by (base items, ascendancy notables and uniques), both directions, built by `tools/grants.py`. Loaded the first time a card that needs it opens, like `data/kwuse.json` |
| `data/essences.json` | What an essence adds, on each kind of item: one row per modifier, the game's own wording for it, the kinds of item that get that same one (each opening the Craft tab there), which side it lands on and its level. Built by `tools/essences.py` from the essence tables in `data/craft/`, 24 kB; the `adds` field declares it in `assets/kinds.js` and it is fetched the first time a card that needs it opens, so the 1.6 MB behind it stays on the Craft tab |
| `data/info.json`, `data/reqs.json` | Item text and requirements, built by `tools/gameinfo.py` |
| `data/market.json` | Prices, rebuilt every hour by `tools/market.py` |
| `data/leagues.json` | Every league with its patch, start date and its own colour, by `tools/leagues.py`. The colour is GGG's: sampled once from the art they published for that league, lifted until it clears 3:1 on the chart's ground, and kept on the league with the picture it came from and the day it was sampled. The home page's league clock and a card's price chart read it — a retired league's line is drawn in it — so a new league arrives with its colour and no one edits code |
| `data/atlas.json` | Atlas tab: waystones, tablets, keys, atlas items and the Atlas tree, built by `tools/atlas.py` (run after a game patch) |
| `data/farms.json`, `data/farmqueries.json` | Farms tab: strategies from BawLoch's public tier list sheet and the trade searches for their rolled tablets and waystones, by hand with `python tools/farms.py` (`data/farmprices.json` holds those searches' prices) |
| `data/bosses.json`, `data/bossqueries.json` | Bosses tab (`assets/bosses.js`, at `#/bosses`, in the top bar and linked from the Atlas page): every endgame boss, what it drops and what it costs to fight, by hand with `python tools/bosses.py`; the entry items the in-game Currency Exchange does not trade get a trade search of their own here. The site serves `/data/bossprices.json`: every one of those items' real price, from the hourly unique checks, the Currency Exchange and those searches (`worker/prices.js`). The search reads this file too, so every boss is a card of its own kind (`x`) without a `tools/sync.py` rebuild |
| `data/basequeries.json` | Which base items carry a live price, and the trade search for each: the white one, rarity normal, so a rare of the same name never stands in for it. Built by `python tools/baseprices.py` after `tools/craft.py`, once per game patch. 1,554 bases is more than a day's checks allow, so the rule is the top base of every shape a player shops in — an item class and the defences its bases come in — which is 108 of them today; the tool states the rule, the count and what widening it costs. `tools/pricepull.py` works through them a share of every run and the price lands on `/data/market.json` under the base's own name, so a base card carries it like any other card and the Craft tab's "Cost right now" can say what the item itself costs |
| `data/craft.json`, `data/craft/` | Craft tab: every base and the mods it can roll (all tiers, item levels, groups), how often each mod rolls, essences, runes and soul cores, desecrated and corruption mods, orbs, omens and catalysts, built by `tools/craft.py` from the game files (essence tables and orb levels checked on poe2db; run after a game patch, after `tools/tradedata.py`). The weights are the one thing the game files do not carry — every spawn weight in the export is 1 or 0, can roll or cannot — so they come from Craft of Exile, pulled into `tools/craftweights.json` by `tools/craftweights.py` and named on the page where they are shown |
| `data/craftmods.json` | The Craft tab's second question, "how do I get this mod", which is asked with no base in hand: one row per modifier — its own wording, its side, its tags and every kind of item that can carry it, with the lowest level it lands at and whether an essence guarantees it there. Built by `tools/craftmods.py` out of the item class files above, so nothing official is read twice, 58 kB against their 1.6 MB; fetched the first time that question is asked and never in first paint. Run it after `tools/craft.py` |
| `data/gamedata.json` | Which patch the shipped data is from, written by `tools/gamepull.py` (one daily pull of the official export; it also writes the gap report `tools/dev/gaps.txt` — what the game files hold against what we card) |
| `data/gamestats.json` | One monster of each level (life, damage, accuracy, armour, evasion) and what each class starts with, from the game files by `tools/gamelib.py`. Nothing reads it yet |
| `data/guides.json` | The community guides the Build tab links out to: one line each, and the day the address was last read. Built by `tools/guides.py`, which holds the list and reads every address on each publish — a guide whose page has gone, or no longer carries its own words, keeps the row it last checked out on and becomes a named fault instead of a dead link. Someone else's work, named where it is shown and never ours |
| `data/patches.json` | Every Path of Exile 2 patch, hotfix and restart since 0.1 (260 rows at 0.5.5c): the hour its notes went up (UTC), its league, its thread on the official patch notes forum, the league-opening day where a patch opened one, the passive tree export commit and tag that match it, and every client build the index has carried with the day it was first seen. Built by `tools/patches.py`; see Patches, snapshots and price history |
| `data/changes/<build>.json` | What the game moved between two patches, card by card: old and new value per field, the cards added, and the cards removed with their names kept. Written by `tools/diff.py`, fetched the first time a card asks for it and never in first paint |
| `data/faults.json` | Which sections are showing an older copy right now, and why, written by `tools/lastgood.py` (see below). The dashboard's Data jobs block and `/api/health` read it |
| `data/map.png`, `data/map.json`, `data/map-nodes.json` | The map of the index (`assets/map.js`, at `#/map`, linked from the footer): every card a dot and every connection a line, in one 1600×800 picture, laid out once at build time by `tools/map.py` — a force layout over all 6,609 cards and the 24,541 edges the site can follow (`data/kwuse.json`, `data/grants.json`, a unique's base, a card's own marks, `lx`). Same data in, same picture out. `map.json` is the key, the busiest card of each kind, a few edges for the travelling lights and what the picture leaves out; `map-nodes.json` is every dot's seat, so a later pass can make a dot clickable without laying anything out again. Nothing but the tab fetches any of it, and the kinds, their names, their colours and their counts come from `assets/kinds.js` and `assets/theme.css`, never a list in the tool |

### Last good wins

Every builder that fills the index from an outside source runs its pull through `tools/lastgood.py`. A pull that
throws, comes back empty or collapses against what is committed (an empty list, under a floor that source has
always cleared, a fifth of its rows gone, or a whole kind gone) never overwrites the good file. The committed
copy stays, the run prints what went stale with the counts before and after, how old the kept copy is and the
likely cause, the fault is written to `data/faults.json`, a GitHub issue labelled `data-fault` is opened or
reused (where the `gh` CLI is signed in), and the run exits non-zero. The owner sees the section in the
dashboard's Data jobs block and in `/api/health`, in the same fine/late/stopped style as the jobs. Applies to
`sync.py`, `craft.py`, `uniques.py`, `leagues.py`, `market.py`, `exchange.py`, `gamepull.py`, `tradedata.py`,
`gameinfo.py`, `atlas.py`, `bosses.py`, `farms.py`, `guides.py` (where the outside source is a link we
send players to, and the fault is that it has rotted) and `baseprices.py` (whose source is the craft tables a
patch fills: a patch that empties one of them must not empty the price list with it). The tools that build only from files already on disk
(`appdata.py`, `mechanics.py`, `kwuse.py`, `nodelinks.py`, `essences.py`, `grants.py`, `gamelib.py`, `rollprices.py`) have no
outside source to lose; the live prices (`pricepull.py`) are watched as jobs of their own. Proved without the
network by `node tools/dev/faults.mjs`.

The count is not the whole of it: a pull can keep every row and lose what is in them. So the same rule reads the
shape of the rows too. A field that half the rows or more carried and that is now on far fewer of them (on 98% of
the uniques before, on 38% now), a field that comes back in another shape (a list of lines turned into one
string), and a value shaped like a raw game id (`Metadata/...`, a snake_case stat id, `[DNT]`) in a field a card
draws as words, or in any field that held none before, are each a collapse: last good copy kept, fault, ticket.
Which fields a card draws comes from `data/schema.json`; the fields no card draws (the Technical details ids, the
search words, a keyword chip's ids) may hold ids. The live price files skip the "fewer of them" rule, since a
price that thins out is the market and not the parse. `python tools/lastgood.py --shape` shows all three on a
spoiled copy of the committed index, writing nothing.

**Before every push: `node tools/dev/guard.mjs`**. It starts a local copy of the site and checks the card
counts, every deep link the code emits, every public page, that no raw game code shows where a player reads
it, that every card keeps to the frame (`tools/dev/frame.mjs`) and every shipped row to its declaration
(`tools/dev/schema.mjs`), and that a phone-sized Chrome still opens a
card without it snapping shut. See [`tools/dev/README.md`](tools/dev/README.md).

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
  twice to check a deploy in a browser that has visited before). A new deploy downloads only what changed: every file
  whose bytes match `dist/sw-files.json` is taken over from the last copy, the home page's first-paint files are fetched
  if they changed, and everything else is kept the first time a page asks for it. Never kept: `/api/*`, `/admin`, the
  crawler pages and the live price files (market, leagues, roll and farm prices).
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

One command, `tools/pipeline.py`. It holds every builder in one table (`STAGES`): what each one reads, what it
writes, where its facts come from and how often it runs. The order is the table's, so no one keeps it in their
head. `--list` prints it.

```
python tools/pipeline.py patch --artifact path/to/artifact.html     after a game patch: the whole rebuild
python tools/pipeline.py patch                                        the same, without sync (see below)
python tools/pipeline.py --only craft                                 one stage
python tools/pipeline.py --from gamelib                               that stage and every one after it
python tools/pipeline.py --check                                      the data here against the rules; writes nothing
python tools/pipeline.py patch --dry                                  build and check in build/; nothing goes in
```

| Stages, in order | Cadence | Source |
|---|---|---|
| `gamepull` | daily | the game files (RePoE's export); also the gap report `tools/dev/gaps.txt` |
| `gameinfo`, `atlas`, `craft`, `gamelib`, `treecards`, `clusters`, `grants` | patch | the game files (`craft` also checks essences and orb levels on poe2db) |
| `tradedata` | patch | the official trade site's lists |
| `craftweights` | patch | Craft of Exile (the mod weights the game files do not carry) |
| `uniques` | patch | poe2db |
| `sync` | patch | the Wraeclast Index artifact, plus RePoE and poe.ninja for the cards it lacks |
| `rollprices`, `craftmods`, `baseprices`, `carddata`, `nodelinks`, `essences`, `kwuse`, `gemlines`, `treelines`, `map` | patch | the files the stages above wrote |
| `guides` | daily | the community guides the Build tab links to |
| `market`, `exchange`, `leagues` | hourly | poe.ninja, the in-game Currency Exchange, poe2db (the Publish site workflow runs these three on its own) |
| `bosses`, `farms`, `mechanics`, `ninjapast` | by hand | the game files and poe2wiki, BawLoch's tier list sheet, our own cards, poe.ninja |

`patch` runs every patch and daily stage. How a run goes:

1. The worktree is copied into `build/tree/`, and every stage runs there. A builder writes where it always writes,
   and nothing in `data/` moves while the run is going.
2. A stage whose inputs hash the same as the last run that shipped is skipped (`tools/cache/stamps.json`, not
   committed): its tool and every tool it imports, each file it reads, and for an outside source the patch, the
   day or the hour its cadence goes by. A stage that reads a file a stage above it rewrote this run always runs.
3. What a stage changed is copied to `build/<stage>/` with its log, and checked: every JSON file still reads,
   every file it wrote holds up against the copy in `data/` under the last good rule (counts and shape, below),
   and the index, its two parts and the bosses hold to their declarations (`data/schema.json`).
4. Only when every stage passed does it all go into `data/` at once: each file written beside its place, then
   all of them moved over. A stage that fails stops the run, nothing goes in, and the fault is recorded and
   ticketed as it is for any builder.

**What runs only here.** `sync` builds the index from the Wraeclast Index artifact, which is only on the owner's
machine: without `--artifact` it is skipped with a line that says so, and every stage after it builds on the
index already committed (`explore.html` works as the artifact too; it holds the same data). Everything else
runs anywhere.

**Game patch** (`.github/workflows/patch.yml`, started by hand from the Actions tab) runs `python tools/pipeline.py
patch` on GitHub, then the guard, then pushes a branch `data/<patch>` and opens a pull request. It never pushes to
`main`: merging the pull request is what ships. Its `sync` is always skipped, for the reason above. One setting,
once, for the pull request: Settings > Actions > General > "Allow GitHub Actions to create and approve pull
requests".

**One declaration per kind.** `tools/dev/schema.mjs --write` turns `assets/kinds.js` into `data/schema.json`:
every field an index row may carry, its shape, which kinds carry it and which must. The frame check holds every
shipped row to it (a stale `data/schema.json` fails too), `tools/lastgood.py` holds a fresh pull to it, and
`worker/seo.js` reads the kinds it publishes (`crawl`) from the same table. A new kind or field is one entry in
`assets/kinds.js`, then `node tools/dev/schema.mjs --write`.

After a game patch, also `python tools/patches.py --notes` (see Patches, snapshots and price history). After a run:
`node tools/dev/guard.mjs`, commit, push to `main`. The site republishes in about a minute, and the data repo's own
workflow freezes the new index under its build within twelve hours.

## Patches, snapshots and price history

Each patch the index is not frozen under is gone: the export only ever holds the live one. Each day of prices not
kept is gone too: the site's price files hold 45 days. Both are kept outside this repo's history, in the private
data repo `metaseonso/wraeclast-data`, and nothing here is estimated or filled in.

| What | Where | Size | By |
|---|---|---|---|
| The patch registry | `data/patches.json` (this repo) | 67 KB | `tools/patches.py` |
| A snapshot per client build: every card's fields that can move between patches, one file per kind | the release `snapshot-<build>` on the data repo | about 460 KB a build | `tools/snapshot.py`, twice a day from the data repo's workflow |
| What changed between two builds | `data/changes/<build>.json` (this repo, served) | depends on the patch | `tools/diff.py` |
| Every price the site shows, once a day | `prices/daily/YYYY-MM/YYYY-MM-DD.json.gz` on the data repo, and one line a day in `prices/days.jsonl` | about 25 KB a day, about 10 MB a year | `tools/pricehistory.py`, from the data repo's workflow at 21:37 UTC |

- **`python tools/patches.py`** adds the index's client build (`data/index.json` `v`) when it is new, with no
  network. `--notes` reads the official patch notes forum (forum 2212) until a page brings nothing new (`--all`
  every page); the hour is the thread's post time, turned into UTC from the time zone the forum prints it in.
  `--tree` reads GGG's passive tree export for the commit and tag of each patch. `--check` checks the file and
  writes nothing. A build is tied to its patch family (4.5.5.2 is 0.5.5), never to a letter patch, until
  something official says which. A forum that stops answering keeps the committed file (Last good wins).
- **`python tools/snapshot.py`** freezes the current index into `tools/cache/snapshots/<build>/` (not in git):
  `meta.json` and one `<kind>.json.gz` per kind. Kept: the fields a patch can move (lines, properties,
  requirements, tags, numbers, a gem's text at every level). Left out: what only draws a card (pictures, link
  marks, search words), prices, and our own mechanics cards. The same index gives the same bytes. `--upload`
  keeps it as the release `snapshot-<build>` (an upload that would change nothing sends nothing), `--get BUILD`
  downloads one, `--list` lists them.
- **`python tools/diff.py <old> <new>`** writes `data/changes/<new build>.json` from two snapshots (folders or
  build numbers). A gem's level text is compared at level 1, level 20 and its last level (`--levels all` for
  every level). **`python tools/diff.py --check`** fails when a change row names a card that is not in the index
  and not marked removed, when a removed card has lost its name, or when a value carries raw game code. It runs
  in `.github/workflows/checks.yml` with `tools/patches.py --check`.
- **`python tools/pricehistory.py`** takes the copy: `/data/market.json?part=now` (currency from the Currency
  Exchange, uniques and bases from trade site listings, the busiest Exchange markets and the exalted rate),
  `/data/rollprices.json`, `/data/farmprices.json` and the boss items the market does not carry. One row per
  price: key, value, unit, source (`cx` or `trade`), when it was checked, and the volume or listing count behind
  it. A thing shown with no price has no row. The day's file and its line go up in one commit through GitHub's
  API. A day with no copy is written as missing, with why, and never filled; a failed copy also raises a
  data-fault issue and ends the run red. `--out DIR` takes it without sending, `--days` lists the kept and
  missing days.

**Where the jobs run:** in the data repo, so they write there with its own token and nothing needs a secret.
`tools/data-repo/.github/workflows/wraeclast-index.yml` is that workflow, kept here and copied to
`.github/workflows/wraeclast-index.yml` in `metaseonso/wraeclast-data`. It checks this repo out and runs
`tools/pricehistory.py` once a day and `tools/snapshot.py --upload` twice a day; a failed price copy raises its
data-fault issue in the data repo. This repo's checks run `tools/patches.py --check` and `tools/diff.py --check`,
which write nothing. Once, by hand, where `gh` is signed in as the owner: `python tools/snapshot.py --upload`
keeps the first snapshot, 0.5.5 at build 4.5.5.2, before the workflow's first run.

Path of Exile is a trademark of Grinding Gear Games. This is a fan project and is not affiliated with them.
