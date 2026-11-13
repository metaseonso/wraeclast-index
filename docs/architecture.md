# The site as it is

Measured 11 Oct 2026 on `main` (a1f6707) with `node tools/dev/arch.mjs`, `node tools/dev/speed.mjs` against the
live site, and `curl` for wire sizes. Every number below comes from one of those three; run them again to refresh it.
`docs/framework.md` says where this goes; `docs/migration.md` says how it gets there.

## 1. The parts

| Part | Lives in | Runs | Job |
|---|---|---|---|
| App shell | `index.html`, `assets/app.js` | the browser | the top bar, the home search, the router, the live card, the popup, the data loading |
| Frame table | `assets/kinds.js` | browser, search worker, Cloudflare worker, the checks | every declaration: kinds, fields, slots, caps, routes, index, relationships |
| Frame helpers | `edges.js`, `graph.js`, `rank.js`, `cut.js`, `marks.js`, `keys.js`, `topnav.js` | browser and worker | connections, the maps, the ranking, the cut's unpacking, the marked words, shortcuts, the bar |
| Search worker | `assets/searchworker.js` | a module Worker (or the page as a fallback) | holds every kind's search rows, answers questions by id |
| Pages (routes) | `craft`, `currency`, `market`, `atlas`, `bosses`, `campaign`, `start`, `data`, `patches`, `runes`, `tradepage`, `map` (+ `build`, `farms`, shut) | browser, fetched on first visit | one tab each: `mount(el)`, `unmount()` |
| Card helpers | `trade`, `basepool`, `clarify`, `drops`, `paste`, `itemtext`, `pins`, `notes`, `suggest`, `support`, `runs`, `league`, `lang`, `track` | browser, fetched when a card or a button asks | panels and boxes a card or the bar opens |
| Engines | `engine.js`, `maths.js`, `optimise.js`, `craftsim.js`, `builder.js` | browser and the checks | the bench and the build maths; pure where the checks read them |
| Drill-down page | `explore.html` (116 KiB, 80.8 KiB of it inline script written by `tools/sync.py`), `assets/bridge.js`, `bridge.css` | browser | the full gem, unique and tree tables; opens the app's popup through `bridge.js` |
| Service worker | `sw.js` | the browser, per deploy | one copy of the deploy's files per deploy; prices network-first with a last-good copy |
| Cloudflare worker | `worker/index.js` + `prices`, `files`, `seo`, `dash`, `health`, `community`, `cfstats` | the edge, D1 | live prices, the daily market files, `/api/*`, `/search`; `seo.js` builds the crawler pages at deploy |
| Pipeline | `tools/pipeline.py`, 61 stages | GitHub Actions and the owner's machine | the data: game files to `data/`, the cut (`tools/shards.py`), `explore.html` |
| Build | `tools/build.mjs` | before every deploy | copies, minifies one file at a time (no bundling), writes `sw-files.json`, stamps `sw.js`, writes the crawler pages |
| Checks | `tools/dev/guard.mjs` (12 checks), `frame.mjs`, `voice.mjs`, `schema.mjs`, `speed.mjs`, `budget.mjs`, `arch.mjs` (new) | by hand and in CI | what must hold before a push |

55 modules (48 under `assets/`, `sw.js`, 7 under `worker/`), 155 edges between them: 83 static imports, 35 dynamic,
1 Worker.

## 2. The dependency graph

```
index.html ─┬─ app.css  cards.css  theme.css  look.css        (4 sheets, 32.4 KiB on the wire)
            ├─ cinzel-latin.woff2  ibmplexsans-latin.woff2     (71.6 KiB)
            ├─ topnav.js                                        (reads the bar it is given; imports nothing)
            └─ app.js ──static──► kinds.js  keys.js  edges.js  marks.js  rank.js  cut.js
                        │                      │        └──► graph.js ──► kinds.js
                        │                      └──► kinds.js
                        ├──Worker──► searchworker.js ──► kinds.js  rank.js  graph.js  cut.js
                        ├──dynamic (route)──► craft currency market atlas bosses campaign start data patches runes tradepage map
                        └──dynamic (on demand)──► suggest lang paste trade clarify drops notes pins runs support track league basepool
                                                   every one of which ──static──► app.js        ◄── the ring
explore.html ─┬─ cards.css theme.css bridge.css look.css
              ├─ topnav.js
              └─ bridge.js ──static──► kinds.js ; ──dynamic──► app.js (the popup, the top search)
worker/index.js ──► seo prices files community dash health ; seo dash ──► ../assets/kinds.js
                    dash ──► health ──► files ──► dash                                            ◄── the only static cycle
```

Measured:

| | Count | Where |
|---|--:|---|
| Static cycles | 1 | `worker/dash.js` → `health.js` → `files.js` → `dash.js` (`files.js:31` imports `same` from dash; `health.js:26` imports from files; `dash.js:28` imports from health) |
| Cycles once dynamic imports count | 2 | the worker ring above, and **a 24-module ring through `app.js`**: every page and card helper imports `app.js` statically, and `app.js` imports each of them dynamically (`app.js:3359 modOf`, `:63 lazy`) |
| Modules that import `app.js` | 26 | every page, every card helper, `bridge.js` |
| What `app.js` exports | 73 names | `esc` used by 26 modules, `D` by 21, `openDetail` 18, `hrefOf` 17, `moneyHTML` 7, `openBox` 7 |
| Exports nothing imports | 16 | `MODE, searching, usageOf, isUnit, GEM_LEVELS, gemReq, MARKS, buildsHref, mkRow, mkTip, patchesOf, TYPE, slotsOf, isPinned, BEEN, fillCounts` (`slotsOf` and `TYPE` are read by `tools/dev/frame.mjs` in a browser, not imported) |
| Depth of the static graph from `app.js` | 3 | app → edges → graph → kinds |
| Modules that import `kinds.js` | 17 | including `worker/seo.js`, `worker/dash.js` and the checks: the table is the one true shared thing |

The ring through `app.js` is not a build error (dynamic imports resolve at run time) but it is why `app.js` is a
deploy hazard: a page from an older deploy that fetches a newer helper fails to link, and `app.js:38–90` carries a
reload-once mechanism (`STALE`, `spend`, `lazy`) to paper over exactly that.

## 3. Sizes

Source (`arch.mjs`), and on the wire from the live site (minified by `tools/build.mjs`, brotli by Cloudflare):

| File | Source KiB | gzip KiB | Live wire KiB | Lines | Functions | Exports |
|---|--:|--:|--:|--:|--:|--:|
| `assets/app.js` | 214.9 | 70.7 | 35.0 | 3,552 | 227 | 73 |
| `assets/craft.js` | 87.4 | 27.4 | 17.6 | 1,506 | 129 | 2 |
| `assets/kinds.js` | 86.8 | 28.1 | 10.5 | 1,134 | 10 | 36 |
| `worker/seo.js` | 79.3 | 26.3 | — | 1,330 | 84 | 9 |
| `worker/prices.js` | 63.1 | 20.9 | — | 993 | 45 | 8 |
| `assets/builder.js` | 62.8 | 20.1 | — | 1,310 | 82 | 4 |
| `assets/admin.js` | 54.7 | 17.7 | — | 968 | 60 | 0 |
| `assets/build.js` (shut) | 46.0 | 15.8 | — | 798 | 45 | 1 |
| `assets/tradepage.js` | 43.2 | 14.6 | — | 729 | 52 | 2 |
| `assets/craftsim.js` | 41.9 | 14.4 | — | 824 | 49 | 3 |
| `assets/cards.css` | 75.1 | 17.7 | 12.2 | 847 | 654 rules | — |
| `assets/app.css` | 70.8 | 16.9 | 13.6 | 1,068 | 862 rules | — |
| `assets/theme.css` | 22.3 | 5.6 | 3.4 | 246 | 150 rules | — |
| `assets/look.css` | 14.2 | 3.8 | 2.5 | 202 | 67 rules | — |
| `explore.html` | 116.4 | 34.9 | 27.9 | — | 5 inline scripts, 80.8 KiB | — |
| `index.html` | 26.2 | 5.6 | 5.1 | — | 5 inline scripts, 3.1 KiB | — |

Of the 1,310 KiB of `assets/*.js`, `app.js` is 16%; of what the home page loads before anything is typed, it is 62%
of the JavaScript.

**Functions over 80 lines: 12** across all 55 modules. The site is written as small functions; the long ones are
`bridge.js:12` (the whole module is one 282-line IIFE), `rank.js:32 ranker` 158, `trade.js:176 tradePanel` 140,
`craft.js:1346 wire` 138, `optimise.js:168 start` 130, `cfstats.js:200` 114, `itemtext.js:72 parse` 106,
`seo.js:776 itemPage` 105, `app.js:2266 ensureOV` 100, `prices.js:670 makeMarket` 99, `dash.js:328 stats` 89,
`builder.js:864 openings` 83. Length is not the problem here; the problem is which file a function sits in.

**Churn, 60 days, 736 commits:** `app.js` changed in 142 of them, `app.css` 81, `cards.css` 69, `index.html` 68,
`kinds.js` 63, `explore.html` 58. Four of the six most-touched files are the ones two helpers are editing right now.

## 4. State and data flow

### The D object (`app.js:122`)

```
export const D = { index, market, usage, byKey: Map, full }      + man, meta, named, lineage, bosses, rt, past, search, failed
```

One mutable object, imported by 21 modules, written by `app.js` (`first`, `searching`, `ready`, `hold`, `settle`,
`runtime`) and read everywhere. Flags on it stand for phases: `D.search` (the worker answered `init`), `D.full` (every
card file is on the page), `D.past` (the history is in), `D.failed`. Nothing announces a change: a module that
cares reads a flag or awaits one of the three promises below.

### Loading, in order (`app.js:91–160`, `430–575`)

| Step | Trigger | Fetches | Resolves |
|---|---|---|---|
| `index.html` `<head>` | parse | `data/market.json?part=live` (58 KiB wire), `data/manifest.json` (2.4 KiB) into `window.WI_FIRST` | — |
| `NOW` | module evaluation | the two above (`EARLY`), or `data/market-last.json` after 4 s | `D.market` via `live()` |
| `MAN` | module evaluation | the manifest | the manifest |
| `GO` → `META`, `BOSS`, `FACTS` | `wake()` or `need()` | `data/cards/meta.<h>.json` (47 KiB), `data/bosses.json` (53 KiB), `data/facts/<v>.json` (34 KiB wire) | `first` = `D.index` skeleton |
| `SEEK` → worker `fetch` | `wake()` | `data/search/<k>.<h>.json` for all 21 kinds: **1,762 KiB raw** before the first answer | — |
| `searching` | `first` + worker `init`, `words`, `runtime` | — | `D.search = true` |
| `ready` | `need()` | every card file: 32 files, 2,307 KiB | `D.full = true` |
| `hist()` | a popup or a chart | `data/market.json?part=hist` | `D.past = true` |

`wake()` is fired by a pointer or key in a search box, `/`, a search in the address, a card opened, or the home page
idle. `need()` by any tab that is not `data`, `market`, `patches` or `map` (`app.js:3391–3396`): the Craft tab, the
Currency tab and the rest each load the whole index (2.3 MB) before they mount.

### Prices (NOW)

`worker/prices.js` builds `market.json` in parts (`live`, `hist`, `facts`); `sw.js` serves it network-first with the
last good copy in `wi-last`; `app.js live()` and `facts()` put the compact form back into the shape the pages read
(`app.js:231–430`). `priceOf(it)` (`app.js:578`) is the only lookup; `TYPE.money` the only renderer of a price.
`D.market` is also read directly by 10 modules (`currency.js`, `bosses.js`, `farms.js`, `trade.js`, `market.js`, ...).

### The search worker protocol (`searchworker.js:170–199`, `app.js:430–450`)

`postMessage({op, id, ...})` → `{id, ...answer}` or `{id, error}`. Ops: `fetch`, `init`, `runtime`, `market`,
`search`, `heads`, `bodies`, `rel`, `find`, `words`. Un-typed: every op's shape lives in two places (the sender in
`app.js`, `OPS` in the worker) and nothing checks they agree. Where a module Worker cannot start, the same file runs
on the page (`handle`).

### Routes (`app.js:3340–3416`)

`#/<route>?<params>`; `ROUTES` and `SHUT` in `kinds.js:84–99`. `show()` hides every `.view`, calls `leave()` on the
old route (which calls `unmount()` if the module exports one), lazy-loads the module, awaits `ready` and `hist()`
unless the route is in `OWN_FILES`/`BARE`, then `mount(view)`, then `update()` if present. 12 of 14 route modules
export `unmount`; `map.js`, `build.js`, `farms.js` do not. Each page keeps its own state in a module-level `S`
object (`atlas.js:14`, `bosses.js:14`, `currency.js:24`, `craft.js:33`, ...), nine of them, each a different shape,
and reads URL state through `params()` by hand.

Two other copies of the route list exist outside the table: `index.html:54` (an inline list of 14 route names, so
the body gets `data-route` before paint) and `app.js:3359` (`{trade: 'tradepage'}`). `tools/dev/frame.mjs` checks
the nav against the table but not that inline list.

## 5. The frame and rendering

The frame is declared once (`kinds.js`: `SLOTS`, `BOXES`, `FRAME`, `FIELDS` 130, `KINDS` 24, `REL` 64, `ACTS` 7,
`MAPS`, `MAKE`) and drawn once (`app.js:1958–2083`: `slotHTML`, `headHTML`, `card`). This part is sound: caps, slack,
fill order and `+N more` all come from `FRAME`, `card()` names no kind, and `frame.mjs` fails a build that breaks
it. Keep it.

What sits around it is not as clean:

- **61 field types** live inside `app.js` (`TYPE`, `:1708–1957`), and the ~1,000 lines before them (`:703–1707`) are
  the renderers' own helpers: gem requirements (`:703`), the damage card (`:816`), where a unique drops (`:963`),
  what a base can have (`:979`), the game's rules and gold (`:1040`), hidden odds (`:1103`), a league mechanic
  (`:1130`), the Currency Exchange measured (`:1200`), patch notes (`:1341`), the bench's fields (`:1470`), the
  builder's fields (`:1585`). Each is legal under the frame (a type, not a kind) but they are domain code in the
  shell, and every one of them makes `app.js` grow.
- **Per-kind code in the shell:** `app.js:605 isUnit = it.k === 'c' && it.id === 'Divine Orb'`, `:682 'b:' + it.id`,
  `:380 {k: 'x', ...}` (bosses made into cards at run time), `:348 'c:' + m.n`, `:899`, `:1818`. `edges.js` 7 lines,
  `currency.js` 7, `atlas.js` 7, `campaign.js` 7, `builder.js` 24, `build.js` 17, `worker/seo.js` 101 (its `LISTS`
  table, `seo.js:64–76`, is a second kinds table).
- **Rendering is string HTML** everywhere: 27 `innerHTML =`/`insertAdjacentHTML` in `app.js`, 16 in `admin.js`,
  12 in `craft.js`, 11 in `currency.js`. Every module escapes with the same `esc` from `app.js`. There is no
  component contract: a card is `card(it, opts)` → element with listeners attached inside (`app.js:2061–2082`); a
  page is `mount(el)` → `el.innerHTML = ...` then `addEventListener` by hand; a popup section is a function that
  returns a string and another that wires it after insertion.
- **Event wiring:** 34 `addEventListener` calls in `app.js`; across `assets/`, 85 `click`, 25 `keydown`, 16 `change`.
  Some are delegated (`data-do`, 23 uses in `app.js`; `data-mk`, `data-swap`, `data-key`), most are attached per
  element after render.

## 6. CSS: four sheets, three colour layers

| Sheet | Rules | Tokens defined | Tokens used | `html:not(#_)` | Raw colours | `@media` | Motion decl. | Loaded by |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| `app.css` | 862 | 24 | 31 | 0 | 32 | 20 | 20 | index |
| `cards.css` | 654 | 1 | 30 | 2 | 36 | 23 | 21 | index, explore |
| `theme.css` | 150 | 29 | 22 | 0 | 28 | 2 | 16 | index, explore |
| `look.css` | 67 | 10 | 18 | **105** | **135** | 1 | 8 | index, explore |
| `bridge.css`, `bench.css`, `builder.css` | 257 | 0 | 36 | 2 | 9 | 4 | 1 | explore / on demand |

- **Three layers for one palette.** `app.css:2–37` defines `:root` as a *light* theme with Fraunces
  (`--disp:'Fraunces'`) plus a `prefers-color-scheme: dark` block; `theme.css:42` redefines 29 tokens under
  `html:root:not([data-theme="none"])` as the dark Poison theme with Cinzel; `look.css:11` adds 10 `--fa-*`
  gradient tokens under `html:not(#_)` and then **restates 105 selectors at id specificity** to beat both. 21
  tokens are defined in two sheets and the page (`--ground, --surface, --text, --accent, --str/dex/int, ...`).
  The light theme in `app.css` is never shown: it is dead weight that every rule below has to out-rank.
- **135 raw colours in `look.css` and 96 elsewhere** (hex, `rgba()`), outside any token definition. `--sunk` is used
  twice in `cards.css:264,272` and defined nowhere (it falls back to its `rgba()`).
- **Rules for one component in four files:** `.card` has 145 rules in `cards.css`, 25 in `app.css`, 16 in `theme.css`,
  19 in `look.css`; the top bar 40 + 3 + 3 + 4; the popup (`.ov`) 31 + 2 + 2 + 1.
- **Breakpoints:** 17 distinct queries. `max-width:640px` ×21, `max-width:760px` ×4, `min-width:1280px` ×3,
  `max-width:1279px` ×2, `min-width:641px` ×2, and one each of 480, 520, 560, 899, 1000 px. `pointer:coarse` ×2.
  One `@container` (in `app.css`). `topnav.js:13` hard-codes `matchMedia('(max-width:1279px)')` to match `cards.css`.
- **Motion:** 21 durations in use (`0s .12s .15s .2s .24s .3s .45s .55s .7s .75s 1.2s 3s 3.65s 4.5s 6.5s 13s 17s
  19.5s 22.5s 23s 53s`), 4 easings; 66 transition/animation declarations, 10 of them inside a
  `prefers-reduced-motion` block. `app.css:49` kills all motion under reduced motion with `*{animation:none!important}`;
  `theme.css:239` and `cards.css:569,645` then guard three more by hand. The `lite` class is set in `index.html:9`
  (and again by `tools/sync.py` into `explore.html`), read in `app.js:2942 calm()`, `:3527`, `bridge.js:221`,
  `map.js:29`. Fog animations run forever at rest (`speed.mjs home.running 6`).

## 7. Loading, caching, the service worker

- **First paint set** (what `index.html` names or preloads, plus the static closure): 16 files, 639.5 KiB source,
  241 KiB gzip, **about 166 KiB on the wire** minified and brotli (32.4 CSS + 56.8 JS + 71.6 fonts + 5.1 HTML).
  Add the two first-paint fetches and it is 226 KiB: `market.json?part=live` is 58 KiB, the biggest single file after
  the two fonts, and the stamp needs one field of it.
- `index.html` preloads 8 modules by hand (`index.html:45–48`); `tools/build.mjs homeShell()` reads the same list for
  `sw-files.json`. A module added to the shell must be added to the list by hand or it is a late discovery.
- `_headers`: assets and data 120 s + stale-while-revalidate; content-named files a year; the manifest and
  `/explore` always revalidated. `sw.js` keeps one copy per deploy (`wi-<hash>`), takes unchanged files over from the
  last copy by hash, holds `market.json` network-first with a 3 s fallback to `wi-last`.
- Two reload-once mechanisms in `app.js` exist because of the ring and the per-deploy copy: `lazy()` (`:63`, a
  helper that will not link) and `moved()` (`:463`, a cut file that is gone).

## 8. Speed today (`speed.mjs`, live, CPU 4x slower)

| Measure | Today | Budget |
|---|--:|--:|
| home: JSON before typing | 214 KiB (513 settled) | 700 |
| home: idle busy over 5 s | 125 ms | 400 |
| home: endless animations at rest | 6 | — |
| typing "fireball": busy / longest frame | 602 ms / 140 ms | 1500 |
| all tabs and back: elements / heap | 572 / 18 MB | 3000 |
| explore#tree: first row / JSON | 2,980 ms / 1,926 KiB | 3000 |
| **phone 4G, first visit to a search, first priced card** | **3,049 ms** (3,848 on a second run) · 526 KiB · 38 requests | **2,000** |
| phone slow 4G | 5,149 ms · 386 KiB | — |

The phone waterfall (`speed.mjs --only=phone --list`), ms from navigation:

| Phase | From → to | What |
|---|---|---|
| Shell | 278 → 900 | 4 sheets, 2 fonts, 9 modules, logo: all in parallel, done by 0.9 s |
| Prices and manifest | 307 → 1,099 | `market.json?part=live` 59 KiB is the last of the first wave |
| **Evaluate** | 900 → 1,677 | nothing on the network: `app.js` + `kinds.js` + helpers parsing and running (the first `GO` fetch, `bosses.json`, leaves at 1,677) |
| Meta, facts, bosses | 1,677 → 2,171 | three serial-ish small files the card skeleton waits for |
| **Worker** | 2,134 → ~3,800 | the module Worker starts (kinds, rank, graph, cut again, from cache), fetches 21 search-row files (1,762 KiB raw, hidden from the page's timeline), ranks, answers `heads`; the card draws |
| Decoration | 3,455 → | fog and wisp images, held back correctly by `later()` |

Two things cost the second above budget: the search rows are fetched whole for every kind before any answer, and
the worker is not started until `first` has resolved on the main thread (the main thread is itself busy evaluating
215 KiB of shell until 1.7 s).

## 9. Worker and pipeline boundaries

- The Cloudflare worker shares exactly one file with the front end: `assets/kinds.js` (`seo.js:23`, `dash.js:25`). Its
  routes are a flat `if` list in `index.js:36–53`. `prices.js` writes the compact parts and `app.js:231–430` reads them
  back: one format, two files, no shared schema.
- The pipeline (61 stages, `pipeline.py --list`) writes `data/` and `explore.html`; the front end reads `data/manifest.json`
  to find the cut. `tools/shards.py` reads `assets/kinds.js` and `worker/seo.js` to know what to cut; `tools/map.py`
  and `tools/lang.mjs` read `kinds.js` too. `data/schema.json` (`schema.mjs --write`) is generated from the table and
  checked against every row: this is the one typed boundary between pipeline and site.
- `tools/sync.py` writes `explore.html` whole, including a copy of the top bar (`sync.py:117–162`) and the `lite`
  line; `tools/dev/nav.mjs` rewrites the nav and the contents into `index.html`, `explore.html` and `privacy.html`
  from the table. The crawler pages (`worker/seo.js`) draw their own bar.

## 10. The spaghetti, named

Ten structural faults, each with the evidence. Ranked by what they cost to work around.

| # | Fault | Evidence | Cost |
|---|---|---|---|
| 1 | **`app.js` is shell, data layer, frame renderer, 61 field types, popup, search UI, router and boot in one 215 KiB file.** | 40 sections (`/* ---- */` headers at `:18…3519`), 227 functions, 73 exports, 142 commits in 60 days | every change to anything collides with everything; two helpers cannot edit it at once; 0.8 s of phone CPU before the first fetch after the shell |
| 2 | **The 24-module ring**: pages import `app.js`, `app.js` lazy-imports pages. | `arch.mjs` cycles "with dynamic": 24 modules; `app.js:63 lazy`, `:3359 modOf`; `STALE`/reload-once at `:38–90` | a deploy skew needs a reload; nothing can be tested without `app.js`; `app.js` cannot shrink because every helper needs it whole |
| 3 | **`D` is global mutable state with flag-phases and no change signal.** | `app.js:122`; 21 importers; `D.search`, `D.full`, `D.past`, `D.failed` written at `:506`, `:528`, `:150`; pages poll with `if(!D.market)` (`currency.js:386`) | ordering bugs are found by reading; a page that mounts before `ready` draws "not loaded" |
| 4 | **Three colour layers, two of them fighting.** | `app.css:2` light `:root`; `theme.css:42` dark override; `look.css` 105 `html:not(#_)` selectors; 21 tokens defined in 2 sheets + the page; 231 raw colours; `--sunk` undefined | a palette change is three edits and a specificity check; the light theme ships and is never seen |
| 5 | **Component styles spread over four sheets.** | `.card`: 145 + 25 + 16 + 19 rules; top bar 40 + 3 + 3 + 4; popup 31 + 2 + 2 + 1 | no file is "the card's CSS"; `cards.css` and `theme.css` are both on the sweep helpers' lists for this reason |
| 6 | **Field-type renderers and their domain helpers in the shell.** | `app.js:703–1957`: ~1,250 lines, 11 domain sections; `TYPE` is exported and imported by nobody | the frame's one extension point (`TYPE`) is inside the file nobody should have to open |
| 7 | **The search reads every kind's rows before it answers, and starts late.** | 1,762 KiB raw / 21 files before `init` (`searchworker.js:93–118`); the Worker is created at 2.1 s on the phone, after `first` | 1.7 s of the 3.0 s phone time; `budget.mjs` warns at 2 MiB, so one more kind fails the budget |
| 8 | **Un-typed message and data seams.** | worker ops: 10 `op` strings in two files, no schema; `market.json` compact form written in `prices.js`, read in `app.js:231–430`; `WI_FIRST`, `WI_MARKET`, `WI_DATA`, `PoE` on `window` across `index.html`, `explore.html`, `app.js`, `bridge.js`, `league.js` | a change on one side is found at run time |
| 9 | **Pages share no contract beyond `mount`.** | 9 different `S` shapes; `params()` parsed by hand in each; `unmount` missing in 3; `OWN_FILES`/`BARE` exceptions in the router (`app.js:3342`, `:3358`); the route list repeated in `index.html:54` | a new page is copied from the nearest one; the router grows a special case per page |
| 10 | **Two UI stacks: the app and `explore.html`.** | 80.8 KiB of inline script in `explore.html` written by `tools/sync.py` from an artifact; `bridge.js` is a 282-line IIFE that reaches into both (`#nav`, `#topsearch`, `WI_DATA`, `PoE.deep`); the top bar is copied into the page by `sync.py:128` | every bar change is made twice; the drill-down's tables cannot use the card frame |

Smaller, also measured: the worker's `dash ↔ files ↔ health` static cycle; `topnav.js:13` and `cards.css` holding the
same breakpoint in two places; `index.html:45–48` and `tools/build.mjs homeShell()` both listing the shell modules;
the `lite` test in `index.html:9` and `sync.py` both; 21 motion durations where a scale of five would do.
