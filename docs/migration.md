# From here to the framework

Thirteen stages, each one PR, each leaving the site working and every check green. Behaviour is kept unless a stage
says otherwise. The order is by risk and value: the first seven touch no file the sweep helpers are editing
(`assets/app.js`, `assets/kinds.js`, `assets/cards.css`, `assets/theme.css`, `explore.html`, `assets/bridge.js`) and
can start now; the rest wait for `sweep-cards` and `sweep-text` to merge.

Every stage is verified the same four ways, then whatever the stage adds:

- `node tools/dev/guard.mjs` 0 failed, `node tools/dev/arch.mjs --check` within every line, `python tools/pipeline.py --check` ok;
- `node tools/dev/speed.mjs --json` before and after, against the preview deploy: no number worse, `phone.pricedMs` noted;
- the browser at 1440 and at 375: home, a search, a card open, its popup, Trade, Craft, Currency, Bosses, Map, explore#tree;
- `node tools/dev/dumpreport.mjs origin/main` flags nothing (stages that touch data).

Rollback for every stage is `git revert` of the merge: no stage changes a data format a later deploy cannot read, and
content-named files stay in place for the deploy before (`tools/build.mjs` "the previous generation").

| # | Stage | Touches sweep files | Starts |
|---|---|---|---|
| 1 | Hold the shape: `arch` in the guard, the route list checked | no | now |
| 2 | Worker: break the `dash ↔ files ↔ health` ring, a routes table | no | now |
| 3 | Pages: the page contract on every route module | no | now |
| 4 | Search protocol: one table of ops, both sides checked | no (worker side only) | now |
| 5 | Search tiers: names first, a kind's rows on demand | no | now |
| 6 | Motion and screen: the scale, the one kill switch, two breakpoints (the sheets not under sweep) | no | now |
| 7 | Folders: `ui/`, `engines/`, `pages/`, `search/` with shims | no | now |
| 8 | Tokens: one `tokens.css`, the light theme gone, `look.css` drained | yes | after the sweeps |
| 9 | Split `app.js`: `core/`, `frame/`, boot; `app.js` re-exports for one stage | yes | after the sweeps |
| 10 | The router reads the contract; the ring is cut; the worker starts early | yes | after 9 |
| 11 | CSS by component; container queries; touch rule | yes | after 8 |
| 12 | The drill-down page under the same bar, popup and search | yes | after 10 |
| 13 | Tighten every line to its target; delete the aliases | yes | last |

---

## Stage 1 — Hold the shape

**Files:** `tools/dev/guard.mjs`, `tools/dev/arch.mjs`, `tools/dev/nav.mjs`, `tools/dev/README.md`, `.github/workflows/checks.yml`.

**What moves:** nothing on the site. `arch.mjs --check` becomes the guard's `arch` line with `LINES` at today's
numbers (ratchet: nothing may get worse). `nav.mjs --check` also compares the inline `data-route` list
(`index.html:54`) and the `<section class="view">` ids with `ROUTES`. `speed.mjs --budget` gets a `--only=phone` run in
the Checks workflow against the preview deploy, reporting only (the budget line is 2,000 ms and today reads 3,049).

**New checks:** `arch` (12 lines), `nav` grows two comparisons.

**Verify:** guard 0 failed on `main`; `arch.mjs --check` exit 0; the workflow runs green.

**Rollback:** revert; nothing on the site changed.

## Stage 2 — The Cloudflare worker's ring and routes

**Files:** `worker/index.js`, `worker/dash.js`, `worker/files.js`, `worker/health.js`, new `worker/util.js`, new `worker/routes.js`.

**What moves:** `same()` (`files.js:31` imports it from `dash.js`) moves to `worker/util.js`; `health.js` stops
importing `files.js` by taking `fileWhen`/`published` as arguments from the one caller that has them. The `if` ladder
in `index.js:36–53` becomes a table `ROUTES = [{path, handler}]` in `routes.js`, read by `index.js` and by
`tools/dev/budget.mjs` (which lists the worker's paths by hand today).

**New checks:** `arch` tightens `staticCycles` to 0.

**Verify:** `npx wrangler deploy --dry-run`; the guard's `pages` and `dash` lines; `curl` every `run_worker_first` path
on the preview.

**Rollback:** revert the merge.

## Stage 3 — The page contract

**Files:** `assets/craft.js`, `currency.js`, `market.js`, `atlas.js`, `bosses.js`, `campaign.js`, `start.js`, `data.js`,
`patches.js`, `runes.js`, `tradepage.js`, `map.js`, `build.js`, `farms.js`; `tools/dev/nav.mjs`; `index.html` (written by
`nav.mjs`).

**What moves:** every page exports `route`, `needs`, `state(params)` and `unmount` (added to `map.js`, `build.js`,
`farms.js`: today they leave their listeners behind). `mount` is unchanged; the router still ignores the new exports
until stage 10, so behaviour is identical. Each module's `S` is kept but filled from `state(params())` at mount, so the
URL shape is written down once. `nav.mjs` writes the `.view` sections and the pre-paint route list into `index.html`
from `ROUTES`.

**New checks:** `arch` `pages` rule in warn mode (a route module missing an export is listed, not failed) until stage 10.

**Verify:** every tab opened and left twice at 1440 and 375; `speed.mjs tabs.elements` and `heapMB` not worse (572 / 18 MB
today); Back and Forward into Craft and Trade keep their plan.

**Rollback:** revert; `nav.mjs` is idempotent.

## Stage 4 — The search protocol

**Files:** new `assets/search/protocol.js`, `assets/searchworker.js`, `tools/dev/arch.mjs`.

**What moves:** `OPS` in the worker is keyed by names imported from `protocol.js`, which holds, per op, the fields
asked and the fields answered. The page side (`app.js:430–450`) still sends string ops: a check reads both files and
fails if a string op the page sends is not in the table or an answer field the page reads is not declared. The
page's import of the names lands with stage 9.

**New checks:** `arch` `seams`: worker ops against `protocol.js`.

**Verify:** a search, a card opened from the grid, a Connections group opened, a paste of an item (all five ops on
the page's side are exercised); the fallback path with `Worker` disabled in DevTools.

**Rollback:** revert.

## Stage 5 — Search tiers

**Files:** `tools/shards.py`, `assets/searchworker.js`, `assets/cut.js`, `tools/dev/budget.mjs`, `data/manifest.json`
and `data/search/` (built), `docs/frame.md` (one line under "The tables").

**What moves:** `shards.py` writes one more file, `data/search/heads.<h>.json`: every card's key, name, sub line and
kind (what `heads` and the first grid need), about a fifth of the rows' bytes. The manifest names it. The worker's
`fetch` reads it first and answers `init`, `heads` and `find` from it; a kind's full rows (`data/search/<k>.<h>.json`,
unchanged) are read the first time a `search` narrows to that kind or asks for ranked words, and `words` reads the
three kinds it needs. Answers do not change: `init` resolves sooner, and the first `search` for a word may wait for the
kinds it touches.

**Behaviour change, named:** a search's first answer can arrive before every kind's rows are in; the counts on the
chips fill in as the kinds arrive (they already do when `runtime` rows join).

**New checks:** `budget.mjs` "what the search reads before its first answer" tightens from a 2 MiB warn to 512 KiB;
`speed.mjs phone.kB` recorded.

**Verify:** `speed.mjs --only=phone,slow4g` before and after (today 3,049 ms / 526 KiB and 5,149 ms / 386 KiB); the
guard's `cards` and `links` lines (they read the rows the worker reads); `dumpreport` on the new file; a search for a
rare word, a two-letter word, a kind chip with no words, Pins, a paste.

**Rollback:** revert the code; the old search files stay named by content and the previous manifest still answers
(`tools/build.mjs` previous generation).

## Stage 6 — Motion and screen (the sheets not under sweep)

**Files:** new `assets/css/motion.css`, new `assets/core/screen.js`, new `assets/core/motion.js`, `assets/app.css`,
`assets/look.css`, `assets/bench.css`, `assets/builder.css`, `assets/topnav.js`, `assets/map.js`, `assets/suggest.js`,
`index.html`, `tools/sync.py` (the link line it writes into `explore.html`).

**What moves:** `motion.css` holds the duration and easing tokens, every `@keyframes` from `app.css`, and the one
reduced-motion rule (`app.css:49`). `app.css`, `look.css`, `bench.css`, `builder.css` use the tokens; their odd
breakpoints (480, 520, 560, 899, 1000 px) move to 640 or to a container query. `screen.js` exports `{phone: 640, bar:
1279}`; `topnav.js:13` reads it. `motion.js calm()` is read by `map.js` and `suggest.js` (`app.js:2942` keeps its own
until stage 9). `cards.css` and `theme.css` keep their durations and keyframes until stage 8.

**New checks:** `arch` `motion` and `breakpoints` rules on the files this stage touched (a list the rule grows).

**Verify:** at 375 and 1440: hover a card, dock the hero, open and close the popup, the Map's lights, the bar's
sheet; with `prefers-reduced-motion` on, nothing moves; `speed.mjs home.running` (6 today) not worse.

**Rollback:** revert.

## Stage 7 — Folders with shims

**Files:** moves under `assets/`: `keys`, `pins`, `notes`, `suggest`, `support`, `runs`, `league`, `lang`, `track`, `paste`,
`clarify`, `drops` → `ui/`; `engine`, `maths`, `optimise`, `craftsim`, `builder`, `basepool`, `itemtext`, `trade` (the
library half) → `engines/`; the fourteen route modules → `pages/`; `searchworker.js` → `search/worker.js`. Each old path
keeps a one-line shim (`export * from './ui/pins.js'`) so `app.js`'s lazy paths and `new Worker(new URL('./searchworker.js'))`
still resolve. `sw.js SHELL`, `tools/build.mjs`, `tools/dev/*.mjs` and `.github` paths updated. `topnav.js` and
`keys.js` stay in place: they are in the first paint and a shim would cost a round trip.

**What moves:** files only; no code changes beyond import paths.

**New checks:** `arch` `layers` rule in warn mode (shims are allowed to point up for now).

**Verify:** every tab, every card act, a paste, the keybindings box, the pins box; `sw-files.json` lists the new paths;
`speed.mjs phone.requests` not worse than +1 per shimmed lazy module.

**Rollback:** revert; nothing content-named moved.

---

## Stage 8 — Tokens (after the sweeps)

**Files:** new `assets/css/tokens.css`, `assets/app.css`, `assets/theme.css`, `assets/look.css`, `assets/cards.css`,
`assets/bridge.css`, `index.html`, `privacy.html`, `admin.html`, `tools/sync.py`, `tools/map.py` (reads `theme.css` for
`tone`), `tools/dev/frame.mjs` (checks `tone` tokens against `theme.css`).

**What moves:** every custom property into `tokens.css` in three blocks (base, theme, look); `app.css:2–37` (the light
theme and its dark override) deleted; `theme.css`'s `html:root:not([data-theme="none"])` selectors become plain
rules; `look.css`'s 105 `html:not(#_)` rules lose the boost and move beside the rules they override (`.card` rules
into `cards.css`, the bar's into its block), winning by order, not specificity. `--sunk` defined. The 231 raw colours
become tokens (`--rim-hi`, `--gem`, `--clasp`, ... — a name per distinct colour, about 40).

**Behaviour change, named:** none visible; verified by screenshots compared pixel-wise at 1440 and 375 (the guard's
phone pass can save them) before and after on home, a card, the popup, Craft, Bosses.

**New checks:** `arch` `tokens`: no raw colour outside `tokens.css`, no undefined token, no token in two files, no
`html:not(#_)`; `tokensMultiFile` → 0, `htmlNot` → 0, `rawColours` → 0.

**Verify:** the screenshots; `frame.mjs`'s map `tone` check against the new file; `explore` and `privacy` carry the
new link order; CSS wire size (32.4 KiB today) recorded.

**Rollback:** revert; the old sheets are in git whole.

## Stage 9 — Split `app.js`

**Files:** `assets/app.js` → `assets/app.js` (boot + re-exports), new `assets/core/{html,store,fetch,first,router,bus}.js`,
new `assets/frame/{card,popup,related}.js`, new `assets/frame/types/{text,number,money,reqs,rich,pool,chart,game}.js`,
moves `edges`, `graph`, `rank`, `cut`, `marks` → `frame/`; `index.html` preloads; `sw.js SHELL`; `tools/build.mjs`;
`tools/dev/frame.mjs` (imports `TYPE`, `slotsOf`, `card` from `frame/card.js`).

**What moves:** the 40 sections of `app.js` to the files named in `docs/framework.md` §10, function by function, no
rewrites. `app.js` keeps `export {…}` of all 73 names re-exported from their new homes, so the 26 importers and
`bridge.js` keep working for one stage. `D` becomes `store.S` with `export const D = S` in `store.js`. `TYPE` is
assembled in `frame/card.js` from the type files (`Object.assign({}, text, number, …)`), so `FIELDS.type` names are
unchanged and `frame.mjs`'s renderer checks pass as they are.

**New checks:** `arch` `size`: `core/*` ≤ 24 KiB, `frame/card.js` ≤ 48, a type file ≤ 24; `hub` warns above 24
exports (the shim is exempt for this stage).

**Verify:** the full guard (the frame check draws every card against the new renderer); `speed.mjs` all six
(`phone.pricedMs` and the evaluate phase from `--list`); the drill-down page's popup and top search.

**Rollback:** revert; a one-stage shim means no importer changed yet.

## Stage 10 — The router reads the contract; the ring is cut

**Files:** `assets/core/router.js`, `assets/core/fetch.js`, `assets/app.js` (the shim goes), every page and ui module
(imports from `core/`, `frame/`, `ui/` instead of `app.js`), the shims of stage 7 (deleted), `index.html` (the stamp),
`tools/build.mjs` (writes the preload lines), `assets/search/protocol.js` (the page side imports the names).

**What moves:** the router awaits a page's `needs` and passes `state(params())` to `mount`; `OWN_FILES`, `BARE` and
the `{trade: 'tradepage'}` alias go (the file is `pages/trade.js`). `fetch.js` creates the Worker when the manifest
resolves (today after `first`, at 2.1 s on the phone) and sends `fetch` at once. The stamp reads `updated` and
`league` off the manifest, so `market.json?part=live` leaves the `<head>` and is asked for with the first card. The
`lazy()` reload-once helper stays (a deploy skew is still possible) but has nothing to catch in the shell.

**Behaviour change, named:** the Currency, Atlas, Bosses, Craft and Runes tabs mount without the whole index where
their `needs` say so (today each awaits `ready`, 2.3 MB). The "Prices from …" stamp shows a moment earlier than the
first price.

**New checks:** `arch` `layers`, `cycles` (0 with dynamic edges counted, except table-read ones), `dynamic edges`,
`pages`, `seams` all at full strength; `hub` ≤ 24.

**Verify:** `speed.mjs` all six; the phone waterfall shows the Worker leaving before the meta file; every tab's first
mount at 375 on 4G; Back and Forward across tabs and cards.

**Rollback:** revert to the stage 9 shim.

## Stage 11 — CSS by component

**Files:** `assets/cards.css`, `assets/app.css` → `assets/css/base.css`, `components/{card,topbar,popup,search,chips,panels}.css`,
`pages/{craft,currency,market,atlas,bosses,map,…}.css`; `index.html`, `tools/sync.py`, `tools/build.mjs` (a page's sheet
loads with its module); `assets/bench.css`, `builder.css` → `pages/`.

**What moves:** rules by the component they style, one file each; `.cards` becomes a container and the card's own
layout rules become `@container` rules; the two breakpoints only for the bar, the hero and the grid columns; the one
touch rule in `base.css`. A page's sheet is linked when its module mounts (`<link>` added by the router, with the
module), so the first paint carries `tokens + base + motion + card + topbar + search` only.

**Behaviour change, named:** none visible; screenshots as in stage 8.

**New checks:** `arch` `breakpoints` at full strength (two widths); first-paint CSS wire ≤ 25 KiB.

**Verify:** screenshots; `speed.mjs home` and `phone`; the phone pass's "nothing scrolls sideways"; the 44 px rule
measured on the chips and the card foot at 375.

**Rollback:** revert.

## Stage 12 — The drill-down page

**Files:** `tools/sync.py`, `explore.html`, `assets/bridge.js` → `assets/pages/explore.js`, `assets/bridge.css` →
`css/explore.css`, `sw.js`, `tools/build.mjs`, `worker/seo.js` (the bar).

**What moves:** the 80.8 KiB of inline script `sync.py` writes becomes `assets/pages/explore.js`, a file, minified and
cached like every module; the bar is no longer copied into the page by `sync.py:128` but mounted by `ui/topbar.js`
from the one table; the popup and top search come from `frame/` and `ui/` directly, not through `bridge.js`'s
`import('./app.js')`; `WI_DATA`, `WI_MARKET` and `PoE` are read through `core/first.js`.

**Behaviour change, named:** none visible; the page's first paint should be faster (the script is cached across
deploys where its bytes do not change).

**New checks:** `arch` `seams`: `window.WI_*` outside `core/first.js` fails; the guard's `pages` line keeps checking
`/explore`.

**Verify:** `speed.mjs explore` (2,980 ms to the first row today); every deep link form in `bridge.js`'s header
comment (`explore#gems=Untether`, `#uniques?base=…`, `#tree=…`); the row fly-in; the keyword picker.

**Rollback:** revert; `sync.py` writes the old page shape again.

## Stage 13 — Tighten and delete

**Files:** `tools/dev/arch.mjs` `LINES`, `assets/core/store.js` (the `D` alias), `tools/dev/README.md`, `docs/frame.md`
("The tables" names the new files), `docs/architecture.md` (re-measured), `.github/workflows/checks.yml`
(`speed.mjs --budget` fails the job).

**What moves:** `LINES` to the framework's targets (section 11 of `docs/framework.md`); the `D` alias deleted and its
21 importers read `S`; `speed.mjs --budget` with `phone.pricedMs ≤ 2000` goes from reporting to failing in CI.

**New checks:** all of them, at target.

**Verify:** the full guard, `arch --check`, `speed --budget` green on the preview deploy and then on the live site.

**Rollback:** loosen a line; nothing else to revert.

---

## What the owner decides before stage 8

1. **The light theme goes.** `app.css:2–37` defines a light palette no page shows. Stage 8 deletes it. Keeping a light
   mode would mean a second token block, not a second sheet.
2. **Folders.** Stage 7 and 9 move most of `assets/` into `core/ frame/ ui/ pages/ engines/ search/ css/`. The
   alternative (flat `assets/`, layers by name prefix) keeps paths stable but hides the layers.
3. **Two breakpoints.** 640 and 1279 px stay; the one-off widths (480, 520, 560, 760, 899, 1000) fold into those two or
   into container queries. Anything that looks different at a width in between is a stage 6 or 11 finding to look at.
4. **The names-only search tier (stage 5)** changes what the first answer waits for: a search for a word can show its
   first cards before every kind's rows are in, and the chip counts settle a moment later.
5. **Stage order after the sweeps.** 8 before 9 keeps the CSS change apart from the JS change; both are large. Doing
   them the other way round is equally safe; doing them together is not.
