# Price-check tools: how each one works, and where WI fits

Ticket: #114. Overlay design: [`overlay.md`](overlay.md) (#115). Phone mode: #117.

First written 27 Sep 2026. Rewritten 29 Sep 2026:

- every code claim now links to the file and lines at the commit read;
- a new tool, PoE2 Oracle (native Rust, Windows), read from its code;
- its author's measured memory and CPU for four overlays, which replace our own guesses for the stack;
- the open price files on WI's Data page, field by field, for option (b);
- player complaints, each with its link.

Labels:

- **Source: X** — only a web page or a post says it, not code.
- **Unverified** — nothing checked it.
- **Code does not settle it** — the code was read and does not answer the question.
- **Subject to change (depends on GGG)** — GGG can change it without notice.
- **Estimate** — a guess, not a measurement.

## What was read

Each repository was read at one commit, over the GitHub API and raw files. No clone. Line numbers are for that
commit. On 29 Sep 2026 the default branch of the first six still pointed at the same commit, so every line
reference below is current.

| Short name | Repository | Commit read | Commit date | Licence |
|---|---|---|---|---|
| EE2 | [Kvan7/Exiled-Exchange-2](https://github.com/Kvan7/Exiled-Exchange-2) | [`cca30662bf31`](https://github.com/Kvan7/Exiled-Exchange-2/tree/cca30662bf31eaf38bd711e2ec1a6b899a06c40e) | 2026-09-06 | MIT ([`LICENSE`](https://github.com/Kvan7/Exiled-Exchange-2/tree/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/LICENSE)) |
| Sidekick | [Sidekick-Poe/Sidekick](https://github.com/Sidekick-Poe/Sidekick) | [`194621647c67`](https://github.com/Sidekick-Poe/Sidekick/tree/194621647c675233656d548c9345565c22bb0812) | 2026-09-20 | MIT ([`LICENSE`](https://github.com/Sidekick-Poe/Sidekick/tree/194621647c675233656d548c9345565c22bb0812/LICENSE)) |
| Oracle | [mttzzz/poe2-oracle](https://github.com/mttzzz/poe2-oracle) | [`4e3d994b4075`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c) | 2026-09-29 | MIT or Apache-2.0 ([`LICENSE-MIT`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/LICENSE-MIT), [`LICENSE-APACHE`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/LICENSE-APACHE)) |
| Exile-UI | [Lailloken/Exile-UI](https://github.com/Lailloken/Exile-UI) | [`3152d169dbbc`](https://github.com/Lailloken/Exile-UI/tree/3152d169dbbc3dc19308b42ac4b3f45538713070) | 2026-09-03 | MIT ([`LICENSE.md`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/LICENSE.md)) |
| poe2scout | [poe2scout/poe2scout](https://github.com/poe2scout/poe2scout) | [`0e3f718b709d`](https://github.com/poe2scout/poe2scout/tree/0e3f718b709dfa0c92eeeea7425b4e63a209b97c) | 2026-08-06 | MIT ([`LICENSE`](https://github.com/poe2scout/poe2scout/tree/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/LICENSE)) |
| XileTrade | [maxensas/xiletrade](https://github.com/maxensas/xiletrade) | [`7daa877cc6f5`](https://github.com/maxensas/xiletrade/tree/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79) | 2026-09-05 | GPL-3.0 app, LGPL-3.0 library, MIT JSON ([`licenses`](https://github.com/maxensas/xiletrade/tree/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79/licenses)) |
| PCO | [POE2-VibeTools/poe2-currency-overlay](https://github.com/POE2-VibeTools/poe2-currency-overlay) | [`20ea30ad1205`](https://github.com/POE2-VibeTools/poe2-currency-overlay/tree/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b) | 2026-09-18 | GPL-3.0 ([`LICENSE`](https://github.com/POE2-VibeTools/poe2-currency-overlay/tree/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/LICENSE)) |
| PoE-Overlay (PoE 1, old) | [Kyusung4698/PoE-Overlay](https://github.com/Kyusung4698/PoE-Overlay) | [`c961eabbf423`](https://github.com/Kyusung4698/PoE-Overlay/tree/c961eabbf423099aaa4c7870ac7641f712d9a7f5) | 2021-01-15 | MIT ([`LICENSE.md`](https://github.com/Kyusung4698/PoE-Overlay/blob/c961eabbf423099aaa4c7870ac7641f712d9a7f5/LICENSE.md)) |

Closed source, so no code to read: **PoE Overlay II** (Overwolf) and **GGG's in-game price check**. Their rows
name the page each claim comes from.

**Reddit could not be read.** reddit.com refuses this session's fetcher (HTTP 403 on its search, and the web
search tool is barred from the domain). Player complaints below come from GitHub issues, GGG's forum and one
tool's own measurements. A person should read r/PathOfExile2 before the owner decides (c).

## GGG's rules, for every tool

Source for this section: https://www.pathofexile.com/developer/docs (read 29 Sep 2026).
**Subject to change (depends on GGG).**

- Three kinds of third-party app. Websites: "Little to no risk for end users". Executable apps independent from
  the game: "While not encouraged, these are permitted. They must use a public OAuth client if interacting with
  our APIs." Apps that interact with the game or its files: "strictly against our Terms of Use (sections 7b, 7c,
  7i)".
- Macros: "Macros must be invoked manually by the user (automated invocations such as but not limited to:
  timers, reacting to file changes, or from reading the screen are not allowed)". "Each macro invocation must
  have one set function". The function "must only perform one action that interacts with the game (sending a
  single chat message or command counts as one action)".
- Logs: "Reading the game's log files is okay as long as the user is aware of what you are doing with that
  data."
- Rate limits: `X-Rate-Limit-Policy`, `X-Rate-Limit-Rules`, `X-Rate-Limit-{rule}` and
  `X-Rate-Limit-{rule}-State`, and `Retry-After` on a 429. User-Agent: `OAuth {clientId}/{version} (contact:
  {contact})`.
- **The trade API is not on that page.** Every tool below calls `/api/trade2/...`, the endpoints the official
  trade site itself uses, with the player's own site cookie, not an OAuth client. GGG can change them at any
  time. **Subject to change (depends on GGG).**
- GGG approves no tool. CoryA_GGG, 15 Dec 2024, asked if PoE Overlay II is allowed: "we do not encourage the
  creation or use of third-party tools because they may provide advantages for players that use them. I'm
  afraid that we're unable to guarantee if a tool is allowed or would remain allowed in the future." Source:
  https://www.pathofexile.com/forum/view-thread/3637217. In the same thread one player says he was banned after
  a month of use (12 Apr 2025). **Unverified**: one person's claim.

What keeps the clipboard tools inside the macro rule: one key press sends **one** copy command (Ctrl+C or
Ctrl+Alt+C) to the game. The tool then reads the text the game put on the clipboard. No tool read here reads
game memory. Two tools also watch the screen (Oracle's XP bars, PCO's reprice mode). Neither sends input from
what it sees, so neither is a macro in GGG's words. They sit closest to the line all the same.

---

## Exiled Exchange 2 (EE2)

A fork of Awakened PoE Trade for PoE 2 ([`LICENSE`](https://github.com/Kvan7/Exiled-Exchange-2/tree/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/LICENSE) keeps "Copyright (c) 2020 Alexander Drozdov").

| Question | Answer, with evidence |
|---|---|
| Reads the item | **Clipboard.** On the hotkey it holds Ctrl plus the game's "advanced item description" key (Alt by default) and taps C: the game gets **Ctrl+Alt+C** ([`main/src/shortcuts/Shortcuts.ts:293-325`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/shortcuts/Shortcuts.ts#L293-L325)). It learns that key from the game's own settings file, `poe2_production_Config.ini` ([`main/src/host-files/GameConfig.ts:10-26`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/host-files/GameConfig.ts#L10-L26)). It polls the clipboard every 48 ms for up to 500 ms for text that starts with `Item Class: ` ([`main/src/shortcuts/HostClipboard.ts:4-5`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/shortcuts/HostClipboard.ts#L4-L5)), and can put the old clipboard back. |
| Other inputs | **Game log:** `logs/Client.txt` ([`main/src/host-files/GameLogWatcher.ts:12-30`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/host-files/GameLogWatcher.ts#L12-L30)). **Screen:** a screenshot for one OCR feature (Heist gems, Windows only) on its own hotkey ([`main/src/shortcuts/Shortcuts.ts:245-270`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/shortcuts/Shortcuts.ts#L245-L270)). |
| Parser | [`renderer/src/parser/Parser.ts`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/parser/Parser.ts). Splits on `--------` lines ([`renderer/src/parser/Parser.ts:232-251`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/parser/Parser.ts#L232-L251)), then runs section parsers in order ([`renderer/src/parser/Parser.ts:132-187`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/parser/Parser.ts#L132-L187)): unidentified, item level, requirements, sockets, weapon, gem, stack size, modifiers, corrupted, mirrored, waystone, trials and more. Mods map to trade stat ids through `stats.ndjson`. |
| Trade API calls | `POST /api/trade2/search/{league}` ([`trade/pathofexile-trade.ts:1269-1282`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/pathofexile-trade.ts#L1269-L1282)); `GET /api/trade2/fetch/{ids}?query={id}` ([`trade/pathofexile-trade.ts:1313-1318`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/pathofexile-trade.ts#L1313-L1318)); `POST /api/trade2/exchange/{league}` for bulk items ([`trade/pathofexile-bulk.ts:76-89`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/pathofexile-bulk.ts#L76-L89)). All through a local proxy that allows only GGG's hosts, `poe.ninja`, `www.poeprices.info` and the author's `api.exiledexchange2.dev` ([`main/src/proxy.ts:5-19`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/proxy.ts#L5-L19)), with the player's own site cookies ([`main/src/proxy.ts:52`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/proxy.ts#L52)). |
| Filters | Body `{query:{status, stats, filters}, sort:{price:"asc"}}` ([`trade/pathofexile-trade.ts:567-590`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/pathofexile-trade.ts#L567-L590)). Status `securable` (instant buyout) by default ([`filters/create-item-filters.ts:50`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/filters/create-item-filters.ts#L50)). Adds price currency, `collapse` (one listing per seller, on by default), listed-since, rarity, identified, unidentified tier, corrupted, mirrored ([`trade/pathofexile-trade.ts:594-850`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/pathofexile-trade.ts#L594-L850)). Rolled stats get a minimum of the roll less 10% ([`filters/create-stat-filters.ts:316-330`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/filters/create-stat-filters.ts#L316-L330); `searchStatRange: 10`, [`PriceCheckWindow.vue:197`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/PriceCheckWindow.vue#L197)). |
| Picks listings | Cheapest first. Fetches 10, then 10 more in parallel, then 10 at a time until it holds 7 sellers listed at most twice and 10 groups, capped at 100 ([`trade/trade-api.ts:13-15`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/trade-api.ts#L13-L15), [`trade/trade-api.ts:73-120`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/trade-api.ts#L73-L120)). No single price: the player reads the list. A poe.ninja price also shows for items poe.ninja lists ([`renderer/src/web/background/Prices.ts:157-230`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/background/Prices.ts#L157-L230)). |
| Rate limits | Starts at 1 request per 5 s for search, fetch and exchange ([`trade/common.ts:52-54`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/common.ts#L52-L54)). After each reply it reads `x-rate-limit-rules`, `x-rate-limit-{rule}` and `-state` and rebuilds its limiters to match, plus 2 s of latency per window ([`trade/common.ts:59-146`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/common.ts#L59-L146); `apiLatencySeconds: 2`, [`PriceCheckWindow.vue:187`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/PriceCheckWindow.vue#L187)). It refuses a search that would queue 1.5 s or more ([`trade/common.ts:149-170`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/common.ts#L149-L170)). No `Retry-After` handling found in the trade files read: **Code does not settle it.** |
| Unidentified | Unique: a picker asks which unique of that base it is ([`unidentified-resolver/UnidentifiedResolver.vue`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/unidentified-resolver/UnidentifiedResolver.vue)); only implicits are searched ([`filters/create-stat-filters.ts:49-60`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/filters/create-stat-filters.ts#L49-L60)). Rare with an unidentified tier: a tier filter, on only for tier 5 and up. Otherwise an `unidentified` filter, on only for uniques ([`filters/create-item-filters.ts:443-455`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/filters/create-item-filters.ts#L443-L455)). |
| Corrupted | Item not corrupted: searches `corrupted = false`. Item corrupted: no corrupted filter, so both kinds come back. Magic jewels search their own state exactly ([`filters/create-item-filters.ts:303-321`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/filters/create-item-filters.ts#L303-L321); [`trade/pathofexile-trade.ts:796-806`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/trade/pathofexile-trade.ts#L796-L806)). Waystones get no filter ("buyer wont care", [`filters/create-item-filters.ts:311`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/filters/create-item-filters.ts#L311)). |
| Rares | Full stat-by-stat search. Stats start unticked (`defaultAllSelected: false`, [`PriceCheckWindow.vue:202`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/PriceCheckWindow.vue#L202)). Optional poeprices.info estimate, off by default ([`price-prediction/poeprices.ts:42`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/price-prediction/poeprices.ts#L42)); the code doubts it for PoE 2 ([`price-prediction/poeprices.ts:69`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/price-check/price-prediction/poeprices.ts#L69): "FIXME: check this if poeprices ever gets poe2 support"). |
| Data it ships | `renderer/public/data/{lang}/items.ndjson` (1.7 MB en), `stats.ndjson` (0.9 MB en), `client_strings.js`, `item-drop.json`. Built by `dataParser/` (Python) from the game's files, exported with `pathofexile-dat` from a local install ([`dataParser/src/providers/game_api.py:12-18`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/dataParser/src/providers/game_api.py#L12-L18)), plus `/api/trade2/data/{filters,stats,items,static}` ([`dataParser/src/constants/urls.py:25-30`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/dataParser/src/constants/urls.py#L25-L30)). The author keeps the working copy "in a different private repo" ([`dataParser/README.md`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/dataParser/README.md)). `item-drop.json` is downloaded fresh from `api.exiledexchange2.dev` ([`renderer/src/web/background/Prices.ts:173`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/background/Prices.ts#L173)). |
| Price feeds | poe.ninja's data through the author's proxy, `api.exiledexchange2.dev/proxy/{league}/overviewData.json`, every 31 min while in use ([`renderer/src/web/background/Prices.ts:62-64`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/background/Prices.ts#L62-L64), [`renderer/src/web/background/Prices.ts:192-203`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/web/background/Prices.ts#L192-L203)). |
| Stack | Electron, `electron-overlay-window` to stick to the "Path of Exile 2" window, `uiohook-napi` for keys ([`main/package.json`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/package.json)). The game must be Windowed or Windowed Fullscreen ([`docs/download.md:32-33`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/docs/download.md#L32-L33)). |
| Platforms | Windows, Linux AppImage, macOS dmg ([`main/electron-builder.yml`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/electron-builder.yml)). Unsigned: "you'll have to bypass security warnings on Windows and macOS" ([`docs/download.md:23`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/docs/download.md#L23)). |
| GGG rules | Clipboard on one key press, one copy command: inside the macro rule. Log reading: allowed if the player knows. |
| Outside code | "Maximum generally allowed is end of line completion. Please do not use agents or copy-paste blocks of code from llms." ([`AI_POLICY.md`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/AI_POLICY.md)) |

**Player complaints** (GitHub issues, sorted by reactions and by comments, 29 Sep 2026):

- Rate limit on the first check of a session, "failed to load leagues": [#910](https://github.com/Kvan7/Exiled-Exchange-2/issues/910) (35 comments, open). One
  player: the other checker "starts with S" works every time. Another: "Randomly exceeding trade limit",
  and live searches on the trade site stop too, since both share one limit: [#502](https://github.com/Kvan7/Exiled-Exchange-2/issues/502).
- Cloudflare challenges the overlay cannot pass: [#470](https://github.com/Kvan7/Exiled-Exchange-2/issues/470), [#502](https://github.com/Kvan7/Exiled-Exchange-2/issues/502).
- Linux: the overlay blocks input [#299](https://github.com/Kvan7/Exiled-Exchange-2/issues/299), does not work on CachyOS [#673](https://github.com/Kvan7/Exiled-Exchange-2/issues/673), regression [#820](https://github.com/Kvan7/Exiled-Exchange-2/issues/820);
  wrong monitor on Wayland [#96](https://github.com/Kvan7/Exiled-Exchange-2/issues/96). No macOS: [#215](https://github.com/Kvan7/Exiled-Exchange-2/issues/215).
- Parse faults on new items: unidentified rare boots [#809](https://github.com/Kvan7/Exiled-Exchange-2/issues/809), an unidentified unique [#975](https://github.com/Kvan7/Exiled-Exchange-2/issues/975), Omen of
  Light [#584](https://github.com/Kvan7/Exiled-Exchange-2/issues/584).
- "Query is too complex" on items with resistances [#101](https://github.com/Kvan7/Exiled-Exchange-2/issues/101). Items linked in chat cannot be checked
  [#900](https://github.com/Kvan7/Exiled-Exchange-2/issues/900). Copy fails, no item text [#338](https://github.com/Kvan7/Exiled-Exchange-2/issues/338).

## Sidekick

| Question | Answer, with evidence |
|---|---|
| Reads the item | **Clipboard.** On the hotkey it can save the clipboard, empties it, releases Alt, sends **Ctrl+C**, waits 100 ms, reads, then restores ([`Clipboard/ClipboardProvider.cs:16-54`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Common.Platform/Clipboard/ClipboardProvider.cs#L16-L54)). The Craft of Exile action sends **Ctrl+Alt+C** ([`OpenInCraftOfExileHandler.cs:34`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Modules.General/Keybinds/OpenInCraftOfExileHandler.cs#L34)). Works only while a `PathOfExile*` process has focus ([`PriceCheckItemKeybindHandler.cs:24`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Modules.Items/Keybinds/PriceCheckItemKeybindHandler.cs#L24); [`Windows/Processes/ProcessProvider.cs:22-29`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Common.Platform/Windows/Processes/ProcessProvider.cs#L22-L29)). If nothing was copied, it passes the key on to the game ([`PriceCheckItemKeybindHandler.cs:28-33`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Modules.Items/Keybinds/PriceCheckItemKeybindHandler.cs#L28-L33)). |
| Parser | `ParseItem` ([`src/Sidekick.Game.Parser/ItemParser.cs:29`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/ItemParser.cs#L29)). Text split on `--------` ([`Items/OriginalText.cs:12`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Items/OriginalText.cs#L12)). One class per property under `Properties/Definitions/`. Stats matched by regex from `stats.json` ([`src/Sidekick.Game.Parser/StatParser.cs:38-61`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/StatParser.cs#L38-L61)). |
| Trade API calls | `POST /api/trade2/search/{league}` ([`Trade/ItemTradeService.cs:50-60`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Poe.Trade/Trade/ItemTradeService.cs#L50-L60)); `GET /api/trade2/fetch/{ids}?query={id}` ([`Trade/ItemTradeService.cs:118`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Poe.Trade/Trade/ItemTradeService.cs#L118)). No bulk exchange call found. Currency from poe.ninja `economy/exchange/current/overview` ([`Exchange/NinjaExchangeProvider.cs:74`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.PoeNinja/Exchange/NinjaExchangeProvider.cs#L74)), other items also from poe.ninja ([`Stash/NinjaStashProvider.cs:428`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.PoeNinja/Stash/NinjaStashProvider.cs#L428)). History from poe2scout, `api.poe2scout.com/{realm}/Leagues/{league}/Items/{id}/History?logCount=24` ([`History/ScoutHistoryProvider.cs:17`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Poe2Scout/History/ScoutHistoryProvider.cs#L17), [`History/ScoutHistoryProvider.cs:78`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Poe2Scout/History/ScoutHistoryProvider.cs#L78)). |
| Filters | `{query:{status, name, type, term, stats, filters}, sort:{price:"asc"}}` ([`Trade/Requests/Query.cs:4-16`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Trade/Requests/Query.cs#L4-L16)). Status `securable` by default ([`Filters/Definitions/PlayerStatusFilter.cs:39-43`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Filters/Definitions/PlayerStatusFilter.cs#L39-L43)). Stat filters with a normalise option ([`Filters/Types/IntPropertyFilter.cs:13-60`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Filters/Types/IntPropertyFilter.cs#L13-L60)). |
| Picks listings | Cheapest first; 10 at a time as the player scrolls ([`src/Sidekick.Modules.Items/Trade/TradeService.cs:57`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Modules.Items/Trade/TradeService.cs#L57)). No single price. |
| Rate limits | Reads `X-Rate-Limit-Policy`, `-Rules`, `-{rule}` and `-State`, keeps one limiter per rule in step with the server, and sends one request at a time ([`Limiter/LimitHandler.cs:10-111`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Common/Limiter/LimitHandler.cs#L10-L111)). On a Cloudflare challenge it opens a browser window and reuses its user agent ([`Cloudflare/CloudflareService.cs:49-63`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Common/Cloudflare/CloudflareService.cs#L49-L63)). |
| Unidentified | Unidentified item: searches `identified = false`. Identified item: no filter ([`Definitions/UnidentifiedProperty.cs:45-83`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Properties/Definitions/UnidentifiedProperty.cs#L45-L83)). Normal, Magic, Rare, Unique only. Each rule can be changed in settings. |
| Corrupted | Corrupted item: searches corrupted only. Not corrupted: searches not corrupted ([`Definitions/CorruptedProperty.cs:47-93`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Properties/Definitions/CorruptedProperty.cs#L47-L93)). Gems too. |
| Rares | Stat filters; optional poeprices.info estimate ([`PoePriceInfoClient.cs:26`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.PoePriceInfo/PoePriceInfoClient.cs#L26)). |
| Data it ships | `data/poe2/{lang}/` base items, items, item classes, stats, pseudo, texts, trade filters, trade stats; plus `leagues.json`, `ninja-*-items.json`, `scout-items.json`, `invariant-stats.json` ([`src/Sidekick.Game/GameDataType.cs:5-45`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game/GameDataType.cs#L5-L45)). The ids are the trade site's. `DataProvider.Write` exists ([`src/Sidekick.Game.Providers/DataProvider.cs:70-105`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Providers/DataProvider.cs#L70-L105)) but a code search finds no caller in the repository. Where the files come from: **Code does not settle it.** |
| Stack | .NET 10. UI is Blazor in a WebView. Releases build the **Avalonia** app ([`.github/workflows/release.yml:75`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/.github/workflows/release.yml#L75)) with top-most windows ([`src/Sidekick.Avalonia/OverlayWindow.axaml.cs:30`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Avalonia/OverlayWindow.axaml.cs#L30)). Hook and key sending: SharpHook ([`Input/InputProvider.cs:7-21`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Common.Platform/Input/InputProvider.cs#L7-L21)). Updates: Velopack ([`.github/workflows/release.yml:92-100`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/.github/workflows/release.yml#L92-L100)). |
| Platforms | Windows x64 and Linux x64 AppImage ([`README.md`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/README.md)). No macOS job in [`.github/workflows/release.yml`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/.github/workflows/release.yml). No signing step there: whether binaries are signed another way, **Unverified**. |
| GGG rules | Clipboard on one key press, one copy command: inside the macro rule. |
| Outside code | "We accept most PR and ideas. If you want a feature included, create an issue and we will discuss it." ([`README.md`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/README.md)). Has one module per outside price site: poe.ninja, poe2scout, poeprices.info. |

**Player complaints:** focus jumps to the wrong window [#445](https://github.com/Sidekick-Poe/Sidekick/issues/445); webviews not closed [#350](https://github.com/Sidekick-Poe/Sidekick/issues/350); Wayland
protocol error [#1115](https://github.com/Sidekick-Poe/Sidekick/issues/1115); Linux support [#328](https://github.com/Sidekick-Poe/Sidekick/issues/328); "not responding" [#904](https://github.com/Sidekick-Poe/Sidekick/issues/904); Cloudflare challenge
[#474](https://github.com/Sidekick-Poe/Sidekick/issues/474); first launch fails [#444](https://github.com/Sidekick-Poe/Sidekick/issues/444). Rate limits: players asked to see them [#258](https://github.com/Sidekick-Poe/Sidekick/issues/258), [#367](https://github.com/Sidekick-Poe/Sidekick/issues/367).

## PoE2 Oracle (new, found 29 Sep 2026)

Created 22 Sep 2026, 0 stars on 29 Sep. One developer, who writes "with AI help (Claude)" ([`README.md:78`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/README.md#L78)).

| Question | Answer, with evidence |
|---|---|
| Reads the item | **Clipboard.** Sends Ctrl + the game's advanced-description key + C with `SendInput`, ported from EE2 ([`crates/poe2-oracle/src/platform/synth_input.rs:1-14`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/src/platform/synth_input.rs#L1-L14)). Waits up to 500 ms for item text, then always puts the player's clipboard back; a password copied from a password manager is not written back ([`crates/poe2-oracle/src/platform/clipboard_poll.rs:1-33`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/src/platform/clipboard_poll.rs#L1-L33)). Hotkey **Ctrl+E** ([`README.md:20-23`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/README.md#L20-L23)). |
| Other inputs | **Game log:** tails `Client.txt` for the XP overlay ([`crates/poe2-oracle/src/platform/client_log.rs:1-12`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/src/platform/client_log.rs#L1-L12)). **Screen, all the time the game is in front:** reads the XP bar and watches the HUD with DXGI desktop duplication, several looks a second ([`crates/poe2-oracle/src/platform/lip_watch.rs:1-15`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/src/platform/lip_watch.rs#L1-L15)). It sends no input from it. |
| Parser | Own Rust crate, [`crates/item-parser/src/lib.rs`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/item-parser/src/lib.rs). Stat matchers generated from EE2's `stats.ndjson` ([`crates/item-parser/data/NOTICE`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/item-parser/data/NOTICE)). |
| Trade API calls | `GET /api/trade2/data/leagues`, `/data/filters`; `POST /api/trade2/search/{league}`; `GET /api/trade2/fetch/{ids}` ([`crates/trade-client/src/lib.rs:73-74`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/lib.rs#L73-L74), [`crates/trade-client/src/lib.rs:539`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/lib.rs#L539), [`crates/trade-client/src/lib.rs:1828`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/lib.rs#L1828)). Currency: GGG's hourly Currency Exchange feed, `web.poecdn.com/api/currency-exchange/poe2/{hour}` ([`crates/trade-client/src/cx.rs:60`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/cx.rs#L60)). poe2scout for uniques and 7-day history ([`crates/trade-client/src/scout.rs:1-30`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/scout.rs#L1-L30)). Optional sign-in through the site's own page (Edge WebView2) stores the `POESESSID` cookie in Windows' Credential Manager ([`crates/poe2-oracle/src/login.rs:1-8`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/src/login.rs#L1-L8)). |
| Filters | "Quick price": up to 4 most valuable stats, the player's rolls as minimums, chosen "the way PoE Overlay II does" ([`docs/guide/src/en/price-check.md:159`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L159), [`docs/guide/src/en/price-check.md:176`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L176)). Sellers: Instant Buyout by default ([`docs/guide/src/en/price-check.md:241-243`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L241-L243)). |
| Picks listings | The 10 cheapest, cheapest first ([`docs/guide/src/en/price-check.md:255`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L255)). No single price for gear. Currency Exchange items get one price from GGG's feed. |
| Rate limits | One limiter per endpoint family, fed by `X-Rate-Limit-{rule}` and `-State`. Checked live: a 429 carries only `Retry-After`, and it restricts the whole address ([`crates/trade-client/src/rate_limit.rs:1-37`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/rate_limit.rs#L1-L37)). Measured tightest rules: search 5 per 10 s, fetch 12 per 4 s, exchange 5 per 15 s (same lines). **Subject to change (depends on GGG).** |
| Unidentified | Only unidentified listings by default; a click lets identified ones in ([`docs/guide/src/en/price-check.md:103`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L103)). |
| Corrupted | Not corrupted: corrupted listings left out. Corrupted: corrupted only. Both switchable ([`docs/guide/src/en/price-check.md:101-102`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L101-L102)). |
| Rares | Filter rows per mod, "Match N of M", empty prefix and suffix rows ([`docs/guide/src/en/price-check.md:144`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L144)). No estimate. |
| Data it ships | `stat-matchers-{en,ru}.tsv` and `item-refs.tsv` from EE2's data files (MIT) ([`crates/item-parser/data/NOTICE`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/item-parser/data/NOTICE), [`crates/poe2-oracle/assets/data/NOTICE`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/assets/data/NOTICE)); `mod-tiers.tsv` and `cx-items.tsv` from the game's tables as RePoE exports them ([`crates/stat-filters/data/NOTICE`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/stat-filters/data/NOTICE), [`crates/trade-client/data/NOTICE`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/data/NOTICE)). |
| Stack | Rust, drawn with Zed's GPUI through Direct3D 11 ([`README.md:104`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/README.md#L104); [`crates/poe2-oracle/Cargo.toml:17`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/Cargo.toml#L17)). Signed updates ([`crates/auto-update/release-signing-key.pub`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/auto-update/release-signing-key.pub)). |
| Platforms | Windows 10 and 11, 64-bit only ([`README.md:51`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/README.md#L51)). Installer unsigned. |
| GGG rules | Clipboard on one key press: inside the macro rule. Quick actions type one chat command per press ([`crates/poe2-oracle/src/platform/synth_input.rs:15-17`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/poe2-oracle/src/platform/synth_input.rs#L15-L17)): GGG counts that as one action. The screen watcher is not a macro but reads the screen all the time. |
| Outside code | Pull requests after an issue ([`CONTRIBUTING.md:485-498`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/CONTRIBUTING.md#L485-L498)). |

**Its measurements** (one PC, one author, 26–27 Sep 2026; [`docs/guide/src/en/performance.md:70-75`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/performance.md#L70-L75),
[`docs/guide/src/en/performance.md:92-98`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/performance.md#L92-L98), [`docs/guide/src/en/performance.md:168-173`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/performance.md#L168-L173)). Memory is
Task Manager's column, which Windows trims on idle apps, so it is not a strict comparison (same file, lines 77-83).

| App (stack) | Memory, MB | CPU with the mouse moving, % of a core | CPU per price check, ms | Dedicated GPU memory, MB |
|---|--:|--:|--:|--:|
| PoE2 Oracle (Rust, GPUI) | 34–50 | 0.35 | 164 | 68–130 |
| EE2 (Electron) | 67–90 | 1.00 | 154 | 0 |
| PCO (Electron) | 41–107 | 0.71 | 212 | 71–72 |
| PoE Overlay II + Overwolf | 285–373 | 1.97 | 1050 | 39 |

**Player complaints:** none yet on GitHub (repository one week old).

## Exile-UI

A hobby toolkit "centered around SSF" ([`README.md`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/README.md)). Not a trade price checker for single items.

| Question | Answer, with evidence |
|---|---|
| Reads the item | **Clipboard.** The "omni-key" (default **CapsLock**, [`modules/hotkeys.ahk:15`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/hotkeys.ahk#L15)) sends **Ctrl+C** and waits up to 0.1 s ([`modules/omni-key.ahk:40-41`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/omni-key.ahk#L40-L41)). **Game log:** [`modules/client log.ahk`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/client%20log.ahk). **Screen:** pixel checks to see which panel is open, and Windows OCR on a key press ([`modules/_ocr thread.ahk:65`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/_ocr%20thread.ahk#L65)). The author lists all of it under "Transparency Notice" ([`README.md`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/README.md)). |
| Parser | [`modules/item-checker.ahk`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/item-checker.ahk): class, rarity, name, base ([`modules/item-checker.ahk:177`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/item-checker.ahk#L177)), unidentified ([`modules/item-checker.ahk:204`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/item-checker.ahk#L204)). It scores mods against its tier tables. Tiers, not prices. |
| Prices | Stash tabs only. poe.ninja `poe2/api/economy/exchange/current/overview` ([`modules/stash-ninja.ahk:440-443`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/stash-ninja.ahk#L440-L443)). On a click, the bulk exchange: `POST https://www.pathofexile.com/api/trade/exchange/{league}`, `status: onlineleague`, `sort: have asc` ([`modules/_functions.ahk:173-185`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/_functions.ahk#L173-L185), called from [`modules/stash-ninja.ahk:985`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/stash-ninja.ahk#L985)). The path is `/api/trade/`, not `/api/trade2/`, for both games. Whether that serves PoE 2 leagues: **Code does not settle it.** |
| Rate limits | Reads `X-Rate-Limit-Ip` and `X-Rate-Limit-Ip-State` only, and `Retry-After` on a 429 ([`modules/_functions.ahk:189-198`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/_functions.ahk#L189-L198)). |
| Unidentified / corrupted / rares | Marks unidentified; rates rare mods by tier. No trade search. |
| Data it ships | `data/global/item mods 2.json`, `item bases 2.json`, `item drop-tiers 2.json` and more ([`modules/_functions.ahk:72-76`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/_functions.ahk#L72-L76)). Updates from its own GitHub ([`modules/_functions.ahk:701-718`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/modules/_functions.ahk#L701-L718)). How the tables are made: **Unverified**. |
| Stack, platform | AutoHotkey v1.1, 64-bit ([`Exile UI.ahk:3`](https://github.com/Lailloken/Exile-UI/blob/3152d169dbbc3dc19308b42ac4b3f45538713070/Exile%20UI.ahk#L3)). Windows only. |
| GGG rules | Clipboard and OCR on a key press. The pixel checks watch the screen but send nothing. |

**Player complaints:** screen checks fail with HDR [#351](https://github.com/Lailloken/Exile-UI/issues/351) or on Windows 11 [#323](https://github.com/Lailloken/Exile-UI/issues/323); Linux [#446](https://github.com/Lailloken/Exile-UI/issues/446);
resizes the game client [#812](https://github.com/Lailloken/Exile-UI/issues/812); "Rune-Ninja" shows "???" [#781](https://github.com/Lailloken/Exile-UI/issues/781).

## XileTrade

| Question | Answer, with evidence |
|---|---|
| Reads the item | **Clipboard.** Sends **Ctrl+Alt+C** or **Ctrl+C** with `SendKeys` ([`src/Xiletrade.UI.WPF/Services/SendInputService.cs:36-41`](https://github.com/maxensas/xiletrade/blob/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79/src/Xiletrade.UI.WPF/Services/SendInputService.cs#L36-L41)). |
| Trade API calls | `/api/trade2/search/`, `/fetch/`, `/exchange/`, `/data/`, and `/whisper`, on every regional site ([`src/Xiletrade.Library/Shared/Strings.cs:57-62`](https://github.com/maxensas/xiletrade/blob/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79/src/Xiletrade.Library/Shared/Strings.cs#L57-L62)). |
| Rate limits | Reads `X-Rate-Limit-Policy` and the `Ip`, `Account` and `Client` rules with `-State` ([`src/Xiletrade.Library/Shared/Strings.cs:755-765`](https://github.com/maxensas/xiletrade/blob/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79/src/Xiletrade.Library/Shared/Strings.cs#L755-L765)). |
| Unidentified / corrupted / rares | Not traced: **Unverified**. |
| Data it ships | JSON under MIT ([`licenses`](https://github.com/maxensas/xiletrade/tree/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79/licenses)); source of the JSON: **Unverified**. |
| Stack, platform | WPF on .NET 10, Windows only ([`src/Xiletrade.UI.WPF/Xiletrade.UI.WPF.csproj:4`](https://github.com/maxensas/xiletrade/blob/7daa877cc6f51cf4bf486bcc8ffdde4af3050a79/src/Xiletrade.UI.WPF/Xiletrade.UI.WPF.csproj#L4)). |
| Licence | GPL-3.0 app. Its code cannot go into WI. |

**Player complaints:** keybinds need two presses [#84](https://github.com/maxensas/xiletrade/issues/84); the search window does not open [#86](https://github.com/maxensas/xiletrade/issues/86); mod
parsing faults [#39](https://github.com/maxensas/xiletrade/issues/39), [#40](https://github.com/maxensas/xiletrade/issues/40); Korean IME clash with Right Ctrl [#114](https://github.com/maxensas/xiletrade/issues/114).

## POE2 Currency Overlay (PCO, "VibeTools")

| Question | Answer, with evidence |
|---|---|
| Reads the item | **Clipboard.** Taps C with Ctrl held via `uiohook-napi` ([`main.js:1100-1118`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L1100-L1118)). |
| Other inputs | **Screen.** Stash net worth: a capture on its own hotkey ([`main.js:2572`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L2572), [`main.js:3002`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L3002)). Reprice mode: while on, a right-click on an item reads the price box off a held-open screen stream and puts a new price on the clipboard; "The app never sends a key or a click" ([`REPRICE.md`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/REPRICE.md); [`main.js:3516-3530`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L3516-L3530)). |
| Trade API calls | `/api/trade2/search/poe2/{league}`, `/fetch/`, `/exchange/poe2/{league}`, `/data/leagues` ([`trade2.js:165-264`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/trade2.js#L165-L264)); reads `x-rate-limit-policy` ([`trade2.js:99`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/trade2.js#L99)). poe2scout ([`main.js:53`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L53)). A Currency Exchange-only price path ([`main.js:648`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L648)). |
| Parser | A copy of EE2's parser, [`renderer/vendor/ee2/src/parser/Parser.ts`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/renderer/vendor/ee2/src/parser/Parser.ts). |
| Unidentified / corrupted / rares | As EE2's parser; the search side not traced: **Unverified**. |
| Stack, platform | Electron + `uiohook-napi` ([`package.json:79`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/package.json#L79), [`package.json:89`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/package.json#L89)). The README says Windows only and unsigned ([`README.md:38`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/README.md#L38)); Linux capture code exists ([`main.js:1542-1660`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L1542-L1660)). |
| GGG rules | Clipboard on a key press: inside. Reprice mode reads the screen on a right-click and sends nothing; it sits closest to the "reading the screen" line. |
| Licence | GPL-3.0. Its code cannot go into WI. |

**Player complaints:** Linux AppImage fails to start [#1](https://github.com/POE2-VibeTools/poe2-currency-overlay/issues/1); Traditional Chinese [#3](https://github.com/POE2-VibeTools/poe2-currency-overlay/issues/3).

## poe2scout

A **price website with a public API**, not an overlay. Sidekick, PCO and Oracle all read it.

| Question | Answer, with evidence |
|---|---|
| Prices from | Currency: GGG's public Currency Exchange feed `web.poecdn.com/api/currency-exchange` without sign-in ([`net/Poe2scout.CurrencyExchange.Worker/PoeCurrencyExchangeClient.cs:18`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.CurrencyExchange.Worker/PoeCurrencyExchangeClient.cs#L18)). Uniques: the trade site's search and fetch ([`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:34`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs#L34)). |
| Filters | Uniques: `status: securable`, `name`, price currency, `corrupted = false` except jewels, `sort: price asc` ([`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:164-198`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs#L164-L198)). |
| Picks a price | Three searches per unique (in exalted, chaos, divine), 10 listings each. Takes the **cheapest** of each, converts, keeps the lowest ([`net/Poe2scout.UniquePriceLog.Worker/UniquePriceLogWorker.cs:95-143`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/UniquePriceLogWorker.cs#L95-L143)). |
| Rate limits | Fixed waits, not the headers: 17 s between searches, 3 s between fetches, 300 s on 403, 405 or 503 ([`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:38-40`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs#L38-L40), [`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:120-131`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs#L120-L131)). A 429 is thrown, not retried ([`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:153`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs#L153)). Sends `User-Agent: POE2SCOUT (contact: ...)` ([`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:36`](https://github.com/poe2scout/poe2scout/blob/0e3f718b709dfa0c92eeeea7425b4e63a209b97c/net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs#L36)). |
| Public API | `api.poe2scout.com/poe2/Leagues/{league}/Items`, `.../Currencies/ByCategory?...&DataPoints=7`, no auth, prices in Exalted Orbs. Source: Oracle's live check, [`crates/trade-client/src/scout.rs:7-30`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/scout.rs#L7-L30). |

**Player complaints:** missing uniques [#82](https://github.com/poe2scout/poe2scout/issues/82); currencies off the exchange did not work [#2](https://github.com/poe2scout/poe2scout/issues/2);
search autocorrect [#129](https://github.com/poe2scout/poe2scout/issues/129).

## PoE Overlay II (closed source)

| Question | Answer |
|---|---|
| Code | Not public. Its PoE 1 ancestor, Kyusung4698/PoE-Overlay (MIT, Electron + Angular), was deprecated in 2021 for Overwolf ([`DEPRECATED.md`](https://github.com/Kyusung4698/PoE-Overlay/blob/c961eabbf423099aaa4c7870ac7641f712d9a7f5/DEPRECATED.md)). Nothing below is checked in code. |
| Reads the item, prices | "Price Checker" named, method not stated. Source: https://www.poeoverlay.com/download/poe-overlay-ii. Oracle's guide says Oracle's "Quick price" picks stats "the way PoE Overlay II does" ([`docs/guide/src/en/price-check.md:176`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/price-check.md#L176)). **Unverified** beyond that. |
| Platforms | "Windows only"; Overwolf or standalone. Same source. |
| Money | Free with ads; Premium removes ads (monthly, yearly or a 60-day League Pass). Same source. |
| Weight | 285–373 MB and about 1 s of CPU per check, the heaviest of four ([`docs/guide/src/en/performance.md:70-75`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/docs/guide/src/en/performance.md#L70-L75)). |
| GGG rules | The forum reply above was about this tool. One player claims a ban after a month. **Unverified.** |

## GGG's in-game price check

| Question | Answer |
|---|---|
| Since | Content Update 0.5.0, "Return of the Ancients". Notes: "Added the ability to quickly search the trade market with an item you have. Shift-Alt Clicking on an item will populate the filters for searching the trade market so you can see the current prices." On controller: hold Y or Triangle. Source: https://www.pathofexile.com/forum/view-thread/3932540. |
| Reads the item | It is the game. Opens the Market panel with the item's mods as the search. Source: https://dadsofexile.com/price-check. **Unverified** in play. |
| Where | Town and hideout only, not while mapping. Players say so in a bug report, 30 May 2026; no staff reply there. Source: https://www.pathofexile.com/forum/view-thread/3934718. |
| Rares | Every mod goes in the search, so "A rare with eight modifiers will return almost nothing"; the player unticks mods. Source: dadsofexile.com, above. |
| Platforms | PC and console. |
| Not there | No history, no liquidity, no drop source, no "worth crafting". Live listings only. |
| Cost | No install. No ban question. |

## Other tools seen, not read

- [PoeAncientsPriceHelper](https://github.com/pedro-quiterio/PoeAncientsPriceHelper) and
  [RuneshapePriceChecker](https://github.com/Barragek0/RuneshapePriceChecker): OCR on one exchange or rune
  window, poe.ninja or poe2scout prices. Source: their READMEs, via web search.
- [Exiled-Exchange-2-Expedition-Checker](https://github.com/Endre-Tonnessen/Exiled-Exchange-2-Expedition-Checker):
  an EE2 fork with OCR for Expedition runeshapes. Source: its README title.
- Path of Price Check (iPhone): camera OCR of the screen. Source:
  https://apps.apple.com/qa/app/path-of-price-check-poe2-tool/id6741771726.
- PoE2k (Overwolf). **Unverified.**

---

## Side by side

| | EE2 | Sidekick | Oracle | Exile-UI | XileTrade | PCO | PoE Overlay II | In-game | poe2scout |
|---|---|---|---|---|---|---|---|---|---|
| Reads item by | Ctrl+Alt+C | Ctrl+C | Ctrl+Alt+C | Ctrl+C; OCR on key | Ctrl(+Alt)+C | Ctrl+C; screen | Unverified | the game | n/a |
| Also reads | log; OCR on key | — | log; screen always | log; screen pixels | — | screen on key or right-click | Unverified | — | — |
| Prices from | trade2 + poe.ninja | trade2 + poe.ninja + poe2scout | trade2 + CX feed + poe2scout | poe.ninja + bulk (stash) | trade2 | trade2 + CX + poe2scout | "official site" | trade market | CX feed + trade2 |
| One price or a list | list | list | list; CX one price | tiers | list | list | Unverified | list | one |
| Rate-limit headers | all rules | all rules | all rules + Retry-After | Ip rule | Ip/Account/Client | policy | Unverified | n/a | fixed waits |
| History / liquidity | no / no | poe2scout / no | poe2scout 7 days / no | no / no | no / no | poe2scout / no | Unverified | no / no | yes / volume |
| Stack | Electron | .NET Avalonia + Blazor | Rust GPUI | AutoHotkey v1 | .NET WPF | Electron | Overwolf | — | web |
| Win / Linux / macOS | yes / yes / "does not run" | yes / yes / no | yes / no / no | yes / no / no | yes / no / no | yes / partly / no | yes / no / no | PC + console | browser |
| Licence | MIT | MIT | MIT or Apache-2.0 | MIT | GPL-3.0 | GPL-3.0 | closed | — | MIT |
| Takes an outside price source | hard-coded hosts only | one module per site; PRs welcome | poe2scout module; PRs after an issue | no | Unverified | poe2scout | no | no | — |

What none of them shows, and WI has: one price per item with its age (WI takes the middle of the 5 cheapest of
10 online listings, [`tools/pricepull.py:6-7`](../tools/pricepull.py#L6-L7)), a day-by-day line for the league and past leagues, and
Currency Exchange liquidity: Easy, Slow or Thin to trade ([`data/market/liquidity.json`](../data/market/liquidity.json)). What they have
and WI does not: a price for one exact rare.

---

## WI's open price files, as a tool would read them

From the Data page's "Build on it" block ([`assets/data.js:75-91`](../assets/data.js#L75-L91)), live on 29 Sep 2026:

| File | What it holds | Evidence |
|---|---|---|
| `data/manifest.json` | Every card and search file, each named by its content, with its size. | [`assets/data.js:83-84`](../assets/data.js#L83-L84) |
| `data/market.json?part=live` | Today's prices, 1,500 items, 196 KB. Keys: `c:<name>` (658 Currency Exchange items), `u:<name>` (734 uniques), `b:<base>` (108 white bases). Per item: `v` price in divines, `a` its age in seconds after `t0` (0 = the Currency Exchange hour in `times.currency`), `ls` listings seen, `sp` the last 7 daily prices, `ch` the 7-day move in %, and for currency `vol` (divines traded in 24 h) and `v1h` (last hour). | [`worker/prices.js:303-321`](../worker/prices.js#L303-L321), [`worker/prices.js:753-760`](../worker/prices.js#L753-L760), [`tools/exchange.py:14`](../tools/exchange.py#L14) |
| `data/market.json?part=hist` | One price a day for the league, per item, and the exchange pairs. | [`worker/prices.js:760-763`](../worker/prices.js#L760-L763) |
| `data/market/index.json` | Lists the market files: liquidity, gap, sell, rising, inflation, crafting, playbook, weekly digests, shocks per league. | [`data/market/index.json`](../data/market/index.json) |
| `data/market/liquidity.json` | Per currency: Easy, Slow or Thin, hours traded of 24, divines traded, in stock. The rule is written in the file. | [`data/market/liquidity.json`](../data/market/liquidity.json) |

Terms on the same page: CC BY 4.0, name Wraeclast Index and link it. Open to any site (CORS). Keep a copy 5
minutes. Name the tool and a contact in the User-Agent. Over 120 requests a minute from one address gets a 429
([`assets/data.js:77-90`](../assets/data.js#L77-L90); [`wrangler.jsonc:39-41`](../wrangler.jsonc#L39-L41)). The live file answers with
`Cache-Control: public, max-age=300` and `Access-Control-Allow-Origin: *` (checked 29 Sep 2026).

What a tool still lacks from us:

1. **No written schema for the market file.** The compact keys (`a`, `sp`, `ch`) are explained only in the
   worker's comments. `data/schema.json` does not cover it. A tool needs a promise that the keys stay.
2. **No look-up by one item.** A tool must download the whole 196 KB file. That is fine every 5 minutes or
   more; it is not fine per key press.
3. **Names are the keys.** Good for English clients. Other game languages need the trade id, which the live
   file does not carry.
4. **PC, current trade league, softcore only.** Said on the Data page.
5. **No rares.** #94 is held.

---

## WI's options

### (a) Link out

WI stays a website.

1. **Paste an item into WI.** The player presses Ctrl+Alt+C in game (the game's own copy, no tool) and pastes
   into WI's search on a second screen or a phone. WI reads the text in the browser and opens the card. No
   install, no GGG question, any PC. Needs the parser below. WI's Build tab reads Path of Building's item text
   ([`assets/build.js:49-81`](../assets/build.js#L49-L81)); that is PoB's format, not the game's, so the parser is new work.
2. **A "trade site" button on each card**, opening the official search in the browser. The in-game
   Shift+Alt+click already does this in town.

Cost: small. Reach: every PC player with a browser, today. Console players: through #117.

### (b) Feed WI's data into those tools

No tool has a plug-in point. Each outside price site is code inside the tool. But three tools already read one
outside price API, poe2scout's (Sidekick [`History/ScoutHistoryProvider.cs:78`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Apis.Poe2Scout/History/ScoutHistoryProvider.cs#L78), PCO [`main.js:53`](https://github.com/POE2-VibeTools/poe2-currency-overlay/blob/20ea30ad1205f489a382ac2a879f2a8dd3ae6d9b/main.js#L53),
Oracle [`crates/trade-client/src/scout.rs:1-30`](https://github.com/mttzzz/poe2-oracle/blob/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/trade-client/src/scout.rs#L1-L30)). WI can be the same kind of source, with what poe2scout
lacks: each price's age, the middle of 5 listings rather than the cheapest one, liquidity, and past leagues.

- **Sidekick:** best fit. MIT, Windows and Linux, 28 tags in six months, a module per price site, "We accept most PR and ideas" after an
  issue. A `Sidekick.Apis.WraeclastIndex` module would read `market.json?part=live` every 5 minutes or more.
- **Oracle:** MIT or Apache-2.0, AI-written, PRs after an issue. Small reach today (one week old).
- **EE2:** hard-coded hosts ([`main/src/proxy.ts:5-19`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/main/src/proxy.ts#L5-L19)) and no agent-written code ([`AI_POLICY.md`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/AI_POLICY.md)).
  Only an issue from the owner, or a change he writes by hand.
- **Exile-UI, XileTrade, PCO, PoE Overlay II:** no. SSF focus, GPL, or closed.

Cost: the five gaps above, mainly a written schema and a promise to keep it. Then one issue per tool. Whether
they take it is theirs to decide. Reach: that tool's players.

### (c) WI's own overlay (#115)

A small PC app: hotkey, one Ctrl+Alt+C, WI's card over the game. Full design: [`overlay.md`](overlay.md).

Cost: large and lasting. The parser must follow every patch; the tools above tagged 10 to 43 releases in the
six months to 27 Sep 2026. Signing, updates and support. Reach: players who install one more overlay, next to seven that exist.

**Stack, sized for low-end PCs.** Oracle's measurements (above) change our earlier guesses:

- Electron is not the memory problem we wrote. EE2 sits at 67–90 MB and PCO at 41–107 MB in Task Manager,
  about 2× a native Rust app (34–50 MB), not 3–5×. PoE Overlay II with Overwolf is the heavy one (285–373 MB).
- Native Rust (Oracle) is lightest on CPU: 0.35% of a core with the mouse moving, against 0.7–1.0% for the
  Electron apps. It also holds 68–130 MB of the graphics card's memory, where EE2 holds none. On a low-end PC
  the graphics card's memory is the game's.
- Tauri 2 was not measured. It uses WebView2, which is Chromium too, so its memory should sit near Electron's
  renderer, not near native. **Estimate.** Its clear win is the download: no Chromium in the installer.

**Choice: Tauri 2, with a measured budget.** It runs WI's own card HTML, so one card serves the site and the
overlay. Native Rust would need the card drawn twice. The budget, measured Oracle's way on a low-end PC: under
100 MB in Task Manager, under 1% of a core with the mouse moving, and no dedicated GPU memory while hidden
(turn off GPU drawing for a static card, as EE2's 0 MB suggests is possible). If Tauri misses it, fall back to
Electron (proven by EE2 on three systems), not to native. No screen reading, ever: only the clipboard.

**Item-text parser plan.** One plain-JS parser, used by (a) and (c).

1. Split on `--------`, as EE2 and Sidekick do ([`renderer/src/parser/Parser.ts:232-251`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/src/parser/Parser.ts#L232-L251),
   [`Items/OriginalText.cs:12`](https://github.com/Sidekick-Poe/Sidekick/blob/194621647c675233656d548c9345565c22bb0812/src/Sidekick.Game.Parser/Items/OriginalText.cs#L12)).
2. Read the header (`Item Class`, `Rarity`, name, base), flags (`Unidentified`, `Corrupted`, `Mirrored`,
   sanctified, `Unmodifiable`), numbers (item level, quality, stack size, waystone tier, sockets), mod lines,
   and the `{ Prefix Modifier "Name" (Tier: 2) }` lines from Ctrl+Alt+C.
3. Look the item up by WI's own keys, which are the live file's keys: currency by name (`c:`), unique by name
   (`u:`), a white base by base (`b:`). No trade stat ids, no `stats.ndjson`. The card needs no trade query.
4. Unidentified unique: list the uniques on that base with their prices. Unidentified or rare gear: base and
   mods, and the trade-site button. Corrupted: shown as a fact; a unique's price says it is for uncorrupted
   items where the check was so.
5. Tests: at least 100 real copied texts, at least one per WI card kind, each with the card it must open.
   Free to reuse: EE2's 26 ([`renderer/specs/Parser/items.ts`](https://github.com/Kvan7/Exiled-Exchange-2/blob/cca30662bf31eaf38bd711e2ec1a6b899a06c40e/renderer/specs/Parser/items.ts)), Sidekick's 43, Oracle's 27 own English
   ones ([`crates/item-parser/tests/fixtures`](https://github.com/mttzzz/poe2-oracle/tree/4e3d994b4075d2b72b64821228c59da0b82a128c/crates/item-parser/tests/fixtures); its other 40 English ones are Sidekick's). All MIT, notice
   kept. XileTrade's 54 sit in a GPL repository: owner decides. New fixtures from every patch.

### Recommendation

**(a) now, (b) next, (c) only after (a) shows players use it.**

1. **The parser is the shared hard part.** Build it once, in the browser, for "paste into WI". It reaches every
   PC player with no install and no GGG question.
2. **Do not build another listing search.** Seven tools and the game itself already do it. GGG's own check is
   free, safe and on console. WI's value is what none of them shows: one price with its age, the league's line,
   liquidity, craft value, drop sources, patch changes.
3. **(b) costs little once the schema is written.** Three tools already read poe2scout the same way. Write the
   schema, then open an issue on Sidekick first, Oracle second.
4. **(c) last, as a thin shell** around the same parser and card, on Tauri 2 with the budget above. It reads
   WI's files, not the trade API, so it has no trade rate limits and cannot get a player's address limited.
   Build it only if (a) shows the demand: the field is crowded, and the cost never stops.

## What the owner must decide

1. "Paste an item into WI" on the site in 1.0: yes or no.
2. Write a schema for `market.json?part=live` and promise to keep its keys: yes or no. Add the trade id to each
   item for other game languages: yes or no.
3. Open an issue offering WI's prices to Sidekick, then Oracle: yes or no. For EE2, only you can write it.
4. Build the overlay (c) now, after (a), or not at all.
5. XileTrade's 54 test items (GPL repository): use them or collect our own.
6. WI's code licence. The repository has no licence file; the data is CC BY 4.0. Needed before any app ships.
7. A person to read r/PathOfExile2 for complaints this session could not reach.
