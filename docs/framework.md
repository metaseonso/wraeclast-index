# The framework

What the code should look like once `docs/migration.md` is done. Small, in-house, no runtime library: the site paints
in about 166 KiB today and nothing off the shelf gets a card on screen faster than string HTML and one listener. What
changes is where things live, what may import what, and what a check fails.

Every rule here is held by a check (section 11). A rule nobody enforces is a comment.

The frame (`docs/frame.md`) does not change: cards are fixed slots with caps and a fill order, declared in
`assets/kinds.js`, drawn by one generic renderer, never per kind. This document puts walls around it.

## 1. Layers

Five layers. A module imports from its own layer or a lower one, never a higher one. The one way down-to-up is the
table: a lower layer never names a higher module in code, it reads the name off `kinds.js` (`ROUTES`, `ACTS.own`,
`FIELDS.file`) and imports it dynamically. That is already how a boss card finds `bosses.js` (`KINDS.x.own`); it
becomes the only way.

| Layer | Folder | Holds | May import |
|---|---|---|---|
| 0 table | `assets/kinds.js` (stays where it is: 17 modules, the worker, the pipeline and the checks read this path) | every declaration | nothing |
| 1 core | `assets/core/` | `html.js` (esc, h), `store.js`, `fetch.js`, `router.js`, `bus.js`, `motion.js`, `screen.js`, `first.js` | table |
| 2 frame | `assets/frame/` | `card.js`, `types/*.js`, `popup.js`, `related.js`, `edges.js`, `graph.js`, `rank.js`, `cut.js`, `marks.js` | table, core |
| 3 ui | `assets/ui/` | `topbar.js`, `keys.js`, `box.js`, `pins.js`, `notes.js`, `suggest.js`, `support.js`, `runs.js`, `league.js`, `lang.js`, `track.js`, `paste.js`, `panels/trade.js`, `panels/clarify.js`, `panels/drops.js` | table, core, frame |
| 4 pages | `assets/pages/` | `home.js`, `craft.js`, `currency.js`, `market.js`, `atlas.js`, `bosses.js`, `campaign.js`, `start.js`, `data.js`, `patches.js`, `runes.js`, `trade.js`, `map.js` | everything below |
| — engines | `assets/engines/` | `engine.js`, `maths.js`, `optimise.js`, `craftsim.js`, `builder.js`, `basepool.js`, `itemtext.js`, `tradelib.js` | core only; pure where a check reads them (`engine.js`, `maths.js`, `itemtext.js` import nothing, as now) |
| — search | `assets/search/` | `worker.js`, `protocol.js` | table, core, frame (`rank`, `graph`, `cut`) |
| — boot | `assets/app.js` | 2 KiB: imports core and frame, mounts the bar, starts the router | everything |

Why: the 24-module ring exists because `app.js` is both the lowest layer (esc, D) and the highest (the router).
Splitting it along these lines removes every static import of a higher layer and leaves one dynamic edge per route,
one per act, one per own module, all read off the table. `arch.mjs` already reads those edges off `ROUTES`.

## 2. Components

One contract, used by the card, its slots, every panel, the bar and every page section:

```js
// a component is a module that exports one object
export const Foo = {
  html(props, ctx)       // string. Pure: no DOM, no fetch, no store writes. ctx = {esc, t, px, href, full}
  attach(el, props, ctx) // wires events on the element its html() made; returns detach() or nothing
};
```

- `html` is the only place markup is written; `attach` is the only place `addEventListener` is called on it. A
  component that needs no events has no `attach`. A detach is returned where the component took something outside
  `el` (a window listener, an observer, a timer); the page's `unmount` calls every detach it holds.
- Events bubble: `attach` listens on `el` once and reads `data-do` on the target, the way the card already does for
  `data-mk`, `data-swap`, `data-key` (`app.js:2061–2075`). One listener per component, not one per button.
- Composition is by call, not by inheritance: `card.html` calls `slot.html` which calls `type.html` which may call
  `block.html`. A field type is a component whose props are `(it, field)`. A page section is a component.
- Where a component lives: a field type in `frame/types/<group>.js` (text, number, money, reqs, rich, lines, pool,
  chart, ...: 61 types today, grouped by what they read, about 8 files); the card, the head, the slot rule in
  `frame/card.js` (today's `app.js:1958–2083`, unchanged); the popup in `frame/popup.js`; Connections in
  `frame/related.js`; a panel in `ui/panels/`; a page's own blocks beside the page.

Why: `html` out and `attach` in is what every module already does by hand, just not in one shape. Writing it down
lets the frame check render every component headless (string in, string out), the way `frame.mjs` already renders
every card.

## 3. Pages

```js
export const route = 'currency';                          // the key in kinds.js ROUTES (the file is named after it)
export const needs = ['prices'];                          // store phases to await before mount: 'prices' | 'search' | 'index' | 'hist'
export function state(params){ return {...}; }             // URL params -> page state (one shape per page, declared here)
export function mount(el, state, ctx){ ... }               // draws into el; returns {update, unmount} or nothing
```

- `needs` replaces the router's `OWN_FILES`/`BARE` exceptions (`app.js:3342,3356`): the router awaits what the page
  says and nothing else. Today every tab but four loads the whole 2.3 MB index before it mounts; a page that only
  needs `prices` says so and mounts in a tenth of the time.
- `state(params)` is the one place URL state is read, so Back lands on the same page and the search in the address
  is not parsed three ways. The page keeps its state in the object `mount` was given, not in a module-level `S` of
  its own shape (nine shapes today).
- Lifecycle: `mount` once per visit; `update()` when the hash changes inside the route; `unmount()` when left. Every
  page exports `unmount` (three do not today). The router removes the view's children itself.
- The route list lives in `kinds.js ROUTES` and nowhere else. `index.html` gets its `<section class="view">` and the
  pre-paint `data-route` list written by `tools/dev/nav.mjs` from the table, as it already writes the bar.

## 4. Connections

Modules talk through three kinds of seam, each typed in one file:

| Seam | File | Shape |
|---|---|---|
| Store events | `core/bus.js` | `on('prices', fn)`, `on('search', fn)`, `on('index', fn)`, `on('mode', fn)`, `on('route', fn)`, `on('pins', fn)`. A name not in `EVENTS` throws in dev. |
| Worker protocol | `search/protocol.js` | `OPS = {init: {ask: [...], answer: [...]}, heads: ..., bodies: ..., ...}`. Both `core/fetch.js` and `search/worker.js` import the names; the check fails a `postMessage` whose `op` is a string literal. |
| Page globals | `core/first.js` | the only module that reads `window.WI_FIRST`, `WI_MARKET`, `WI_DATA`; exports them as functions. `bridge.js` and `league.js` lose their `window.*` reads. |

No module reaches into another's internals: no `document.getElementById` of an element another module made (nine ids
are reached from two or more modules today: `#keysbtn` from five). A component that wants a button in the bar asks
`ui/topbar.js` for a slot (`topbar.add({id, html, attach})`).

## 5. State and data

One store, `core/store.js`, under 3 KiB:

```js
export const S = {prices: null, manifest: null, meta: null, index: {items: [], byKey: Map}, mode, lang, pins};
export const ready = {prices: Promise, manifest: Promise, first: Promise, search: Promise, index: Promise, hist: Promise};
export function set(key, value)   // writes and emits on the bus
```

- `D` is kept as an alias of `S` for the migration and deleted at its last stage.
- Phases are promises with names, not flags on an object (`D.search`, `D.full`, `D.past`, `D.failed` today). A page
  says which it needs; nothing polls.
- Cache rules, stated once in `core/fetch.js`: the manifest `no-cache`; content-named files (`data/cards/`,
  `data/search/`, `data/facts/`, fonts) a year; prices network-first with the last good copy (as `sw.js` does); card
  files through the worker as a card is drawn; the whole index only on `needs: ['index']`.
- The worker reads the manifest first and the rows it needs when asked: a names-only row set for every kind (small,
  one file, enough for `heads` and the first grid) and the full rows per kind the first time a search narrows to it.
  Today it reads 1,762 KiB raw across 21 files before any answer. This is a pipeline change (`tools/shards.py`) plus
  the worker's `fetch`, and it is where most of the missing second is.

## 6. Design tokens

One file, `assets/css/tokens.css`, defines every custom property, in three blocks in cascade order:

1. **base** — spacing `--s1..--s6` (4 8 12 16 24 32), type `--t1..--t6` (12.5 13 14 15 17 20; display 26), radii
   `--r`, `--r-sm`, line `--line-w`, the font stacks `--sans --mono --disp`;
2. **theme** — the Poison palette as it is in `theme.css:42–60` today (`--ground --surface --raised --sunken --line
   --text --muted --faint --accent --blood --str --dex --int --pos --neg --shadow`), Cinzel for `--disp`;
3. **look** — the ten `--fa-*` gradients and shadows from `look.css:11–22`, renamed `--rim --rim-dim --well --poison
   --face --plate --plate-hi --sunk --lip --drop` (`--sunk` is used today and defined nowhere).

No `html:not(#_)`, no `html:root:not([data-theme])`: with one `:root` there is nothing to out-rank. The light theme in
`app.css:2–37` is deleted; it has never been shown. Component sheets use tokens only: the check fails a hex, `rgb()`
or `hsl()` outside `tokens.css` (231 today).

Why: 21 tokens are defined in two sheets plus the page, 105 selectors in `look.css` carry an id-level boost, and the
bronze rim lives in a different file from the card it frames. One source makes a palette change one edit, and makes
`tools/map.py` (which reads `theme.css` for `tone`) read one file.

## 7. Responsive

- **Breakpoints are tokens in one place**: `core/screen.js` exports `{phone: 640, bar: 1279}` and `tokens.css` carries
  the same two numbers in a comment the check compares. Every `@media (max-width|min-width)` in CSS must be one of
  them (17 distinct queries today collapse to 2 widths plus `pointer:coarse`, `prefers-reduced-motion`,
  `hover:hover`). `topnav.js:13` reads `screen.bar` instead of its own string.
- **Components use container queries**, not breakpoints: `.cards` is a `container-type: inline-size` and the card
  lays itself out by its own width (one `@container` exists today, in `app.css`). Page layout (the bar, the hero, the
  grid columns) uses the two breakpoints.
- **Touch**: one rule in `base.css`, `@media (pointer:coarse){ button, .chip, .pill[role], .btn, .tsearch input,
  .card-ft .use { min-height: 44px } }`, and the guard's phone check (375×812) measures it.

## 8. Motion

One file, `assets/css/motion.css`, and one function, `core/motion.js calm()`:

- Scale: `--dur-1: 120ms` (hover colour), `--dur-2: 200ms` (open, dock, rim), `--dur-3: 300ms` (panel), `--dur-4:
  450ms` (flow glide); `--ease: cubic-bezier(.2,.8,.2,1)`, `--ease-io: ease-in-out`. Ambient (the fog, the wisp, the
  map haze) keeps its own long durations under `--amb-*`, in `motion.css` only. 21 durations today become 4 + ambient.
- Motion is allowed on a **state change** (hover, focus, open, close, dock, a list reflow) and nowhere else. Ambient
  motion is allowed only on the hero at rest, never while a card is open or the crest is scrolled off (as
  `theme.css:189` does now), and never under `lite` or reduced motion.
- One kill switch: `@media (prefers-reduced-motion: reduce){ * { animation: none !important; transition: none
  !important } }` (today's `app.css:49`) in `motion.css`; the three hand guards in `theme.css:239`, `cards.css:569,645`
  go. `html.lite` is set once (`index.html:9`), read only through `calm()`.
- The check fails a `transition` or `animation` whose duration is not a `--dur-*`/`--amb-*` token, and any
  `@keyframes` outside `motion.css`.

## 9. Load-time budget

Measured today on the phone (4G, CPU 4×): 3.0 s to the first priced card; the phases are in
`docs/architecture.md` §8. Target ≤ 2.0 s, held by `speed.mjs --budget`.

| Budget | Today | Target | How |
|---|--:|--:|---|
| First paint set on the wire (HTML + CSS + shell JS + 2 fonts) | 166 KiB | ≤ 150 KiB | fonts stay 72; CSS 32 → ≤ 25 (one token layer, no restated rules); shell JS 57 → ≤ 45 (popup, types the first grid does not use, Connections, and the pins/notes/keys boxes leave the shell) |
| Shell JS evaluated before the first fetch after the shell | 0.8 s | ≤ 0.4 s | the same split: `app.js` 215 KiB source → boot 2 + core 20 + frame/card 40 + types/core 30 |
| Worker start | at 2.1 s | at manifest arrival (~0.65 s) | `core/fetch.js` creates the worker when the manifest resolves, not after `first` |
| Rows read before the first answer | 1,762 KiB raw, 21 files | ≤ 400 KiB, 1–2 files | names-only tier from `tools/shards.py`; full rows per kind on demand |
| `market.json?part=live` in first paint | 58 KiB | stamp from the manifest | the stamp needs `updated` and `league`; prices arrive for the first card, not for the bar |
| Module graph depth from boot | 3 | ≤ 3 | held |
| Preload list | by hand in `index.html:45–48` | written by `tools/build.mjs` from the graph | `homeShell()` already walks imports; it writes the `<link rel=modulepreload>` lines too |
| Critical CSS | 4 files, render-blocking | `tokens + base + topbar + hero` inline (~6 KiB), the rest with `media="print" onload` | measured before it ships: inline CSS is not cached, so only if the phone number moves |
| Service worker | one copy per deploy, hash take-over | unchanged | `sw.js` is right; it loses the hand-kept `SHELL` fallback list once `sw-files.json` is the only source |

Adding the four phase savings (worker start ~1.0 s, rows ~0.4 s, shell evaluation ~0.4 s, partly overlapping) puts
the first priced card at about 1.6–1.9 s on the same device. The number that counts is the one `speed.mjs` prints
after each stage.

## 10. File layout

```
index.html  explore.html  privacy.html  admin.html  sw.js
assets/
  app.js                 boot (2 KiB)
  kinds.js               the table (unchanged path)
  core/   html.js store.js fetch.js router.js bus.js motion.js screen.js first.js
  frame/  card.js popup.js related.js edges.js graph.js rank.js cut.js marks.js  types/{text,number,money,reqs,rich,pool,chart,game}.js
  ui/     topbar.js keys.js box.js pins.js notes.js suggest.js support.js runs.js league.js lang.js track.js paste.js  panels/{trade,clarify,drops}.js
  pages/  home.js craft.js currency.js market.js atlas.js bosses.js campaign.js start.js data.js patches.js runes.js trade.js map.js
  engines/ engine.js maths.js optimise.js craftsim.js builder.js basepool.js itemtext.js tradelib.js
  search/ worker.js protocol.js
  css/    tokens.css base.css motion.css  components/{card,topbar,popup,search,chips,panels}.css  pages/{craft,currency,market,atlas,bosses,map,...}.css  explore.css
  brand/ fonts/ words/
worker/   index.js routes.js prices.js files.js seo.js dash.js health.js community.js cfstats.js
tools/    pipeline.py ... build.mjs  dev/{guard,frame,voice,schema,speed,budget,arch,nav}.mjs
```

`explore.html`'s 80 KiB of inline script becomes `assets/pages/explore.js` written by `tools/sync.py` as a file, so
it is minified, cached and measured like every other module; `bridge.js` becomes a page under the same contract.
The drill-down's tables stay (they are the owner's drill-down), but their bar, popup and search come from `ui/` and
`frame/` like every other page.

## 11. The guard checks

`tools/dev/arch.mjs --check` becomes the guard's thirteenth line, `arch`. Its `LINES` table today holds the shape where
it is; each migration stage tightens one line. The rules, once the layout above is in:

| Rule | Fails when |
|---|---|
| layers | a module imports statically from a higher layer (folder order: kinds, core, frame, ui, pages); `engines/` imports anything but `core/` |
| cycles | any static cycle (worker included: `dash ↔ files ↔ health` goes) |
| dynamic edges | a dynamic import whose target is not read off the table (`ROUTES`, `ACTS.own`, `KINDS.own`, `FIELDS.file`) or made by `core/router.js` |
| size | a module over its layer's cap: core 24 KiB, frame/card 48, a type file 24, a page 96, boot 4; first-paint wire ≤ 150 KiB (read off `dist/` when built) |
| hub | no module exports more than 24 names |
| functions | none over 80 lines |
| tokens | a hex/`rgb`/`hsl` colour outside `tokens.css`; a `var(--x)` with no definition; a token defined in two files; `html:not(#_)` anywhere |
| breakpoints | an `@media` width not in `core/screen.js` |
| motion | a duration not from the scale; `@keyframes` outside `motion.css`; a hand-written reduced-motion block |
| seams | `window.WI_*` outside `core/first.js`; a `postMessage` op not from `protocol.js`; `getElementById` of an id another module owns |
| pages | a route in `ROUTES` with no `pages/<route>.js`; a page module without `route`, `needs`, `state`, `mount`, `unmount` |
| nav | the inline `data-route` list and the `.view` sections in `index.html` match `ROUTES` (`nav.mjs --check` grows this) |

`speed.mjs --budget` runs in CI against a preview deploy with `phone.pricedMs ≤ 2000`, `home.running 0` once the
fog is paused at rest, and the first-paint wire line; `budget.mjs` keeps its free-plan lines.

## 12. What this costs to add things, before and after

| Change | Today | After |
|---|---|---|
| A new card kind | one `KINDS` row, rows in the index (unchanged: the frame already pays for this) | the same |
| A new field type | a `FIELDS` row + a function inside `app.js` (215 KiB, 142 commits in 60 days) | a `FIELDS` row + a function in `frame/types/<group>.js` (≤ 24 KiB file) |
| A new page | a module + `ROUTES` row + `index.html` section + `index.html:54` list + maybe `OWN_FILES`/`BARE` + `sw.js SHELL` | a module exporting the page contract + `ROUTES` row; `nav.mjs` writes the HTML |
| A palette or rim change | `theme.css` + `look.css` + a specificity check against `app.css` | one token in `tokens.css` |
| A new panel under a card | an `ACTS` row + a module importing `app.js` | an `ACTS` row + a component in `ui/panels/` |
| A new breakpoint | a 17th media query | not allowed: a container query, or a change to one of two numbers |
| Working in parallel | two helpers on `app.js`, `cards.css`, `theme.css` at once | one helper per folder |

## 13. What is not changed

The frame and its tables; string HTML; ES modules with no bundler; `tools/build.mjs` minifying one file at a time;
`sw.js`; the Cloudflare worker's paths and D1; the pipeline's stages (one new tier in `shards.py`); the look (dark
stone, bronze rims, Cinzel, poison green); every page and function the site has; game voice; real prices; no raw ids;
no side columns or overlays.
