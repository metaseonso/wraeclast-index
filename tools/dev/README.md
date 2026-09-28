# tools/dev

Checks to run by hand. Nothing here ships (`.assetsignore`) and nothing here touches the live site.

**`node tools/dev/guard.mjs` — before every push.** About 85 seconds. It starts a local server on this
worktree (the static files plus `worker/seo.js`, same process, no wrangler) and prints one line per check,
`ok` or `FAIL`; non-zero exit on any FAIL.

- **cards** how many of each kind, against `guard-baseline.json`, and every interaction the game's wording
  names: how many open a card, how many are marked unclear, how many are left plain (`tools/interactions.py`,
  `data/interactions.json` — a site left plain fails) · **links** every deep link the code emits
  lands on a real row · **pages** every public page 200, sitemap and llms.txt did not shrink · **rawcode**
  no stat ids, `[Word|Word]` markup or `{0}` placeholders where a player reads them · **voice** every word a
  player reads is the game's, not an assistant's (`voice.mjs`) · **market** `data/market/` and a sample of its sums
  from the raw exchange hours (`marketcheck.mjs`, below) · **frame** every card
  and the map keep to the frame · **dash** the owner's dashboard opens and all eight tabs fill · **phone**
  375x812 with touch: a card and a boss card stay open through a tap, a drag and a selection, the Bosses
  table fits, no sideways scroll, no console errors · **budget** dist/ against the free plan (`budget.mjs`,
  below)
- `--live` check wraeclastindex.fyi instead (or pass any `http://...`) · `--no-phone` skip both Chrome
  checks · `--offline` the budget's first-paint line from the shipped copy · `CHROME=<path to chrome.exe>` if
  Chrome is somewhere odd
- `--bless` rewrite the baseline: the counts, and what the site is allowed to be wrong about today.
  Only after a data rebuild, and read what it says it added.

`frame.mjs`: the frame (`docs/frame.md`), enforced. Three parts.

- **the table**, read straight out of `assets/kinds.js`: a kind the index carries with no declaration, a
  declaration the frame does not know, a field whose slot, box or type the frame does not have, a field type
  with no renderer or a renderer no field asks for, a field every card carries that one kind drops, a slot
  with no cap, a box no field fills, an edge whose map or kind is not declared.
- **the map**: a kind drawn in a palette token `assets/theme.css` does not have, and a kind that is in
  neither the map's key nor what `data/map.json` says the picture left out.
- **the cards**, drawn in headless Chrome over the whole index: a slot over its cap, a slot or a list that
  cut something and did not say how many, and a card that is its own connection or carries a mark that opens
  the card you are already on. It also prints the widest card per slot, which is what the caps are set
  against.

`guard.mjs` runs all three; `node tools/dev/frame.mjs` on its own does the table and the map, and needs no
browser.

`budget.mjs`: what the free plan lets the site be, and how close it is. Reads `dist/`, the site as Cloudflare
serves it, and runs `node tools/build.mjs` first when `dist/` is missing or older than any file in the repo.
Every number is in `LIMITS` at the top, each with where it comes from. A warn passes; a fail fails.

| line | warn | fail | why |
|---|--:|--:|---|
| each file in `dist/` | 5 MiB | 20 MiB | Cloudflare stops at 25 MiB a file |
| files in `dist/` | 10,000 | 18,000 | Cloudflare stops at 20,000 on the free plan |
| a file the worker parses | 512 KiB | 1 MiB | 10 ms of CPU a request on the free plan |
| home's JSON before a search | | 700 KiB | the owner's line, for a phone |
| what the search reads before its first answer | 2 MiB | 4 MiB | past the warn, search rows load per kind on need |
| a file a job sends the database | | 1.2 MB | a D1 row holds 2 MB; `worker/files.js` takes 1.5 MB |

What the worker parses is read out of `worker/`: the shipped files it fetches through `env.ASSETS`, every file
`data/manifest.json` names for the crawler pages (`tools/shards.py`), and the files the jobs send in
(`worker/files.js` NAMES). The home page's JSON is `index.html`'s own fetches and the reads in `assets/app.js`
that do not wait for `need()`; one the worker builds (`market.json?part=live`) is measured on the live site, or
from the shipped copy with `--offline`. The search line is the manifest, the card meta and every kind's search
rows. A file already over a line when this check came in is in `HELD`, at a ceiling and with its reason: it
warns until it is back under, and fails past the ceiling. None is held since 27 Sep: `data/index.json` (2.66 MiB)
was, until `worker/seo.js` moved to the cut. A file the manifest names counts as read.

It also fails a data file nothing reads: a file under `data/` no page, module, worker file, `sw.js`, tool or
workflow names. A file named by its content (`name.<hash>.json`, the drill-down's data) counts only by its
exact path; any other by its name, or by its folder where the code builds the name (`'data/craft/' + id`).
`tools/build.mjs` already leaves such a file out of `dist/`, and every top-level `data/*.json` ships whether a
page reads it or not: the index is open for builders.

`node tools/dev/budget.mjs` prints the table: the ten biggest files and the headroom on every line. About 3
seconds with a built `dist/`. Writes nothing but `dist/`. It is the guard's ninth check too.

`dumpreport.mjs`: what a data rebuild changed, before anyone reads the diff. `node tools/dev/dumpreport.mjs`
compares `origin/main` with this working tree; pass any ref, or `a..b` for two commits. Per file under `data/`,
the bytes before and after. Per kind in `data/index.json`, the cards before and after and the first few added,
removed and changed; per field, how many cards changed it, emptied it or filled it. `index-core.json` and
`index-rest.json` list by list, words unpacked. Every other JSON file, the rows in each part. Flagged: a kind or
a list that lost more than 10%, a field gone empty on 20 cards and a tenth of those that had it, a file gone or
halved, a part of any other file that lost more than 10% (the last-good rule: a collapse is a fault). A drill-down
file that came back under a new hash is replaced, not gone. Markdown to stdout, the whole report as JSON to
`tmp/dumpreport.json` (`--json <file>` for elsewhere); `--strict` exits 2 on a flag. The Checks workflow runs it
on every pull request that touches `data/` and keeps it as one comment there, rewritten on each push; a flag
turns that job red. About 10 seconds, no network.

`dash-fixture/`: what the live site answered on 21 Sep 2026 for the dashboard's four reads, saved as it came
(the notes list is empty in it: that is the answer the paging bug gave). The **dash** check serves these
to `admin.html` in headless Chrome, three times over — those numbers, an answer with nothing in it, and reads
that fail — clicks all eight tabs each time, and fails if any block is left empty or draws nothing. A block
saying "No data." or that it failed is fine; a blank one is not.

`marketcheck.mjs`: `data/market/` (`tools/market_history.py`, `design/market-products.md`), two ways. Every file
carries its source, the Subject to change flag and its rule, has the bytes `data/market/index.json` says, and carries
no internal id and no private league. Then, where the Currency Exchange archive is on the machine (`WI_CX`, else
`wraeclast-data/cx` beside the repo or any folder above it), it reads a sample of league days from the raw hours
exactly as GGG sent them, works out every hour's rates and five currencies' daily prices again in its own code, and
compares them with the card files' league-day curves and `inflation.json` (a gap over 0.6% fails). About 2 seconds;
without the archive the sums are skipped and the line says so. `node tools/dev/marketcheck.mjs` (`--files` for the
first part only). It is the guard's `market` check too.

`simcheck.mjs`: the crafting bench's maths, against the committed data (`docs/craft-sim.md`). It rolls
250,000 modifiers on each of three kinds of item — two whose weights are measured, one whose are not — and
prints, per modifier, the share the weights say it should take and the share it took, with the gap in
percentage points and in standard deviations. Then twelve guards: a full side never gains another modifier and
a full item refuses; nothing above the item level is ever reached and an orb whose floor is out of reach
refuses; no modifier or group lands twice; a class with no weights takes the even path, says so and prints no
share on any row; a step whose whole effect is an unpublished number refuses instead of guessing; every omen in
the game data is accounted for and the six the game removed cannot craft; a currency the item state does not
take refuses in the game's own words; every rolled number lands inside the range the game prints; an essence
refuses rather than half-run; Omen of Whittling always takes a lowest-level modifier; Omen of Homogenising
Exaltation only adds a modifier sharing a tag; and no omen grants its currency a permission it lacks.
`node tools/dev/simcheck.mjs` (about 10 seconds); `--rolls`, `--seed`, `--quiet` for the verdicts alone and
`--craft` for one craft printed step by step. Seeded, so the same seed prints the same table. Reads the data
files and nothing else, writes nothing, no network. Not part of `guard.mjs`: it is the bench's own check.

`speed.mjs`: how the site runs on a slow machine. Headless Chrome with the CPU slowed 4x and a fresh profile per
page, so no cache or service worker helps. It reads home at rest (JSON parsed before anyone types, elements, heap,
main-thread time over 5 idle seconds), typing "fireball" (busy time, longest frame, endless animations left once the
hero docks), every tab and back home (elements and heap left behind) and /explore#tree (JSON and time to the first
row). `node tools/dev/speed.mjs` against the live site, or pass any `http://...`; `--json` for a before and an after,
`--budget` to fail when a number is over `BUDGET`. About two minutes. Writes nothing.

`faults.mjs`: the last-good rule (`tools/lastgood.py`) without the network. It runs a fake builder four
ways — a source that gives nothing, one that gives 60% of its rows, one that throws, and a builder that dies
before its pull is even checked — and each time checks that the committed file is untouched, the loud line was
printed, the fault landed in `data/faults.json`, the run went red, and the dashboard's Data jobs block and
`/api/health` name the section in plain English. A fifth run proves a good pull still writes, twice over, byte
for byte, and clears the fault behind it.
Writes only inside a temporary folder; `node tools/dev/faults.mjs` (add `--keep` to leave that folder behind).
Not part of `guard.mjs`: it runs Python, so it is its own line.

`cfcheck.mjs`: every Cloudflare query the owner's dashboard makes, against the real API. Needs `CF_ANALYTICS_TOKEN`.

`dash.mjs`: set `WI_OWNER_KEY` to the owner key (only its SHA-256 lives in the `OWNER_HASH` secret), then
`node tools/dev/dash.mjs` (add `http://127.0.0.1:8787` for a local worker, `--raw stats` to dump one answer).
It prints per read endpoint: status, bytes, top-level keys and what came back empty or null. The key only reads.
