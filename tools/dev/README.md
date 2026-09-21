# tools/dev

Checks to run by hand. Nothing here ships (`.assetsignore`) and nothing here touches the live site.

**`node tools/dev/guard.mjs` — before every push.** About 11 seconds. It starts a local server on this
worktree (the static files plus `worker/seo.js`, same process, no wrangler) and prints one line per check,
`ok` or `FAIL`; non-zero exit on any FAIL.

- **cards** how many of each kind, against `guard-baseline.json` · **links** every deep link the code emits
  lands on a real row · **pages** every public page 200, sitemap and llms.txt did not shrink · **rawcode**
  no stat ids, `[Word|Word]` markup or `{0}` placeholders where a player reads them · **dash** the owner's
  dashboard opens and all eight tabs fill · **phone** 375x812 with touch: a card and a boss card stay open
  through a tap, a drag and a selection, the Bosses table fits, no sideways scroll, no console errors
- `--live` check wraeclastindex.fyi instead (or pass any `http://...`) · `--no-phone` skip both Chrome
  checks · `CHROME=<path to chrome.exe>` if Chrome is somewhere odd
- `--bless` rewrite the baseline: the counts, and what the site is allowed to be wrong about today.
  Only after a data rebuild, and read what it says it added.

`dash-fixture/`: what the live site answered on 21 Sep 2026 for the dashboard's four reads, saved as it came
(the notes list is empty in it: that is the answer the paging bug gave). The **dash** check serves these
to `admin.html` in headless Chrome, three times over — those numbers, an answer with nothing in it, and reads
that fail — clicks all eight tabs each time, and fails if any block is left empty or draws nothing. A block
saying "No data." or that it failed is fine; a blank one is not.

`cfcheck.mjs`: every Cloudflare query the owner's dashboard makes, against the real API. Needs `CF_ANALYTICS_TOKEN`.

`dash.mjs`: set `WI_OWNER_KEY` to the owner key (only its SHA-256 lives in the `OWNER_HASH` secret), then
`node tools/dev/dash.mjs` (add `http://127.0.0.1:8787` for a local worker, `--raw stats` to dump one answer).
It prints per read endpoint: status, bytes, top-level keys and what came back empty or null. The key only reads.
