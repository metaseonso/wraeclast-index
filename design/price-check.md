# Price-check tools: how each one works, and where WI fits

Ticket: #114. Overlay design: [`overlay.md`](overlay.md) (#115). Written 27 Sep 2026.

Every claim below points at the code that does it. Where only a web page or a forum post says it, the line
says **Source: X**. Where nothing checked it, the line says **Unverified**. Anything that GGG can change
without notice is marked **Subject to change (depends on GGG)**. Numbers that are guesses are marked
**Estimate**.

## What was read

Shallow clones, read on 27 Sep 2026. A reference like `EE2 main/src/proxy.ts:5-19` means that file and those
lines at the commit below.

| Short name | Repository | Commit read | Commit date | Licence (file) |
|---|---|---|---|---|
| EE2 | github.com/Kvan7/Exiled-Exchange-2 | `cca30662bf31` | 2026-09-06 | MIT (`LICENSE`) |
| Sidekick | github.com/Sidekick-Poe/Sidekick | `194621647c67` | 2026-09-20 | MIT (`LICENSE`) |
| Exile-UI | github.com/Lailloken/Exile-UI | `3152d169dbbc` | 2026-09-03 | MIT (`LICENSE.md`) |
| poe2scout | github.com/poe2scout/poe2scout | `0e3f718b709d` | 2026-08-06 | MIT (`LICENSE`) |
| XileTrade | github.com/maxensas/xiletrade | `7daa877cc6f5` | 2026-09-05 | GPL-3.0 app, LGPL-3.0 library, MIT JSON (`licenses/`) |
| PCO | github.com/POE2-VibeTools/poe2-currency-overlay | `20ea30ad1205` | 2026-09-18 | GPL-3.0 (`LICENSE`) |
| PoE-Overlay (old, PoE 1) | github.com/Kyusung4698/PoE-Overlay | `c961eabbf423` | 2021-01-15 | MIT (`LICENSE.md`) |

Not open source, so not read: **PoE Overlay II** (Overwolf) and **GGG's in-game price check**. Their rows say
where each claim comes from.

GitHub's release pages and API were closed to this session, so "update cadence" counts git tags since
27 Mar 2026 (six months), from `git for-each-ref refs/tags` after deepening each clone. Tag dates are commit
dates, so they are close to, not exactly, release dates.

## The rules every tool works under

- GGG's developer docs split third-party apps in three: websites; "executable apps independent from the
  game", which are allowed with conditions; and apps that "interact with the game or game files", which are
  "strictly against our Terms of Use (sections 7b, 7c, 7i)" and lead to "immediate account termination".
  Source: https://www.pathofexile.com/developer/docs (read 27 Sep 2026). **Subject to change (depends on GGG).**
- Macros in an allowed app: "Macros must be invoked manually by the user (automated invocations such as but
  not limited to: timers, reacting to file changes, or from reading the screen are not allowed)", "Each macro
  invocation must have one set function", and it may "only perform one action that interacts with the game".
  Same source.
- "Reading the game's log files is okay as long as the user is aware of what you are doing with that data."
  Same source.
- Rate limits: the headers `X-Rate-Limit-Policy`, `X-Rate-Limit-Rules`, `X-Rate-Limit-{rule}` and
  `X-Rate-Limit-{rule}-State` (each "hits:period:restricted-seconds"), and `Retry-After` on a 429. GGG asks for
  `User-Agent: OAuth {clientId}/{version} (contact: {contact})`. Same source.
- **The trade API is not in those docs.** Every tool below calls `/api/trade2/...`, the endpoints the
  official trade website itself uses. They are not a published API, so GGG may change them at any time.
  **Subject to change (depends on GGG).**
- GGG does not approve tools. A GGG staff member (CoryA_GGG) on the forum, asked whether PoE Overlay II is
  bannable: "we do not encourage the creation or use of third-party tools ... we're unable to guarantee if a
  tool is allowed or would remain allowed in the future." Source: https://www.pathofexile.com/forum/view-thread/3637217.
  One player in the same thread says they were banned after a month of use; **Unverified**, one person's claim.

The common pattern that keeps the clipboard tools inside those rules: one hotkey press sends **one** copy
command (Ctrl+C or Ctrl+Alt+C) to the game, then the tool reads the text the game put on the clipboard. No
tool read here reads game memory.

---

## Exiled Exchange 2 (EE2)

Fork of Awakened PoE Trade for PoE 2 (`LICENSE` keeps "Copyright (c) 2020 Alexander Drozdov").

| Question | Answer, with evidence |
|---|---|
| How it reads the item | Clipboard. On the price hotkey it presses the copy keys itself: `pressKeysToCopyItemText` holds Ctrl plus the game's "show advanced item descriptions" key (Alt by default) and taps C, so the game gets **Ctrl+Alt+C** (`main/src/shortcuts/Shortcuts.ts:293-325`). It learns that key from the game's own settings file, `Documents/My Games/Path of Exile 2/poe2_production_Config.ini`, key `ACTION_KEYS.show_advanced_item_descriptions` (`main/src/host-files/GameConfig.ts:10-26, 87-89`). It then polls the clipboard every 48 ms for up to 500 ms until the text starts with `Item Class: ` in one of its languages (`main/src/shortcuts/HostClipboard.ts:4-5, 31-83, 110-120`), and can put the old clipboard back (`:57-59`). |
| Other inputs | Reads `logs/Client.txt` for a client-log feature (`main/src/host-files/GameLogWatcher.ts:12-30`). Screenshots the game window for one OCR feature (Heist gems, Windows only) on its own hotkey (`Shortcuts.ts:245-270`). |
| Item-text parser | `renderer/src/parser/Parser.ts`. Splits the text on `--------` lines (`itemTextToSections`, `:232-251`), then runs a list of section parsers in order (`:132-187`): unidentified, item level, requirements, sockets, armour, weapon, gem, stack size, modifiers (`parseModifiersPoe2`, `:1195`), corrupted (`:666`), mirrored (`:1423`), sanctified, waystone (`:392`), trials (`:1687`) and more. Mods are matched to trade stat ids through `stats.ndjson`. |
| Endpoints | `POST {site}/api/trade2/search/{league}` (`renderer/src/web/price-check/trade/pathofexile-trade.ts:1269-1282`); `GET {site}/api/trade2/fetch/{ids}?query={id}` (`:1313-1318`); `POST {site}/api/trade2/exchange/{league}` for bulk items (`trade/pathofexile-bulk.ts:76-89`). All requests go through a local proxy that only allows the official GGG hosts, `poe.ninja`, `www.poeprices.info` and the author's `api.exiledexchange2.dev` (`main/src/proxy.ts:5-19`), with the player's own session cookies (`:52`). |
| Request body | `{query:{status:{option}, stats:[{type:"and",filters:[]}], filters:{}}, sort:{price:"asc"}}` (`pathofexile-trade.ts:567-590`). Status defaults to `securable` (instant buyout) (`filters/create-item-filters.ts:50`). Adds `trade_filters.price.option` (currency), `trade_filters.collapse` (one listing per seller; default on, `PriceCheckWindow.vue:188`), `trade_filters.indexed` (listed since), `type_filters.rarity`, `misc_filters.identified`, `misc_filters.unidentified_tier`, `misc_filters.corrupted`, `misc_filters.mirrored` (`pathofexile-trade.ts:594-850`), and `count` groups for pseudo stats (`:873, 1207, 1219`). |
| How it picks listings | Shows the cheapest first. Fetches 10 then 10 more in parallel, then 10 at a time until it has 7 sellers not listed more than twice and 10 groups, capped at 100 (`trade/trade-api.ts:13-15, 73-120`). No single "the price": the player reads the list. A poe.ninja-based quick price also shows for items poe.ninja lists (`renderer/src/web/background/Prices.ts:157-230`). |
| Stat ranges | Rolled stats get a min of value minus `searchStatRange`, default 10% (`PriceCheckWindow.vue:197`; `filters/create-stat-filters.ts:316-330`). Stat filters start off unless `defaultAllSelected` (default false, `PriceCheckWindow.vue:202`). |
| Rate limits | Starts at 1 request per 5 s for search, fetch and exchange (`trade/common.ts:52-54`). After every reply it reads `x-rate-limit-rules`, `x-rate-limit-{rule}` and `x-rate-limit-{rule}-state` and rebuilds its limiters to match the server, adding `apiLatencySeconds` (default 2) to each window (`trade/common.ts:59-146`; `PriceCheckWindow.vue:187`). It refuses to queue a search it cannot run soon (`preventQueueCreation`, `common.ts:149-170`) and caches results (`pathofexile-trade.ts:1260-1302`). |
| Unidentified | Unidentified uniques: a picker lets the player choose which unique of that base it is (`price-check/unidentified-resolver/UnidentifiedResolver.vue`); only implicit stats are searched (`create-stat-filters.ts:49-60`). Unidentified rares: `identified=false` filter, off by default (`create-item-filters.ts:443-455`). |
| Corrupted | Not corrupted: search asks for `corrupted=false`. Corrupted: no corrupted filter unless "exact" ("let the buyer corrupt") (`create-item-filters.ts:305-321`; `pathofexile-trade.ts:796-806`). Waystones are left out (`create-item-filters.ts:311`). |
| Rares | Full stat-by-stat search; player ticks the stats. Optional ML estimate from poeprices.info, off by default (`PriceCheckWindow.vue:199`; `price-prediction/poeprices.ts:42`), which the code itself doubts for PoE 2 (`poeprices.ts:69`, "FIXME: check this if poeprices ever gets poe2 support"). |
| Bundled data | `renderer/public/data/{lang}/items.ndjson` (1.7 MB en), `stats.ndjson` (0.9 MB en), `client_strings.js`, `item-drop.json`. Built by `dataParser/` (Python): the game's own files exported with the `pathofexile-dat` tool from a local install (`dataParser/src/providers/game_api.py:12-18`, table list in `dataParser/data/vendor/config.json`), plus `/api/trade2/data/{filters,stats,items,static}` (`dataParser/src/constants/urls.py:25-30`). `item-drop.jsonc` is hand-written with `//#region` comments; the app downloads a fresh copy from `api.exiledexchange2.dev/proxy/data/item-drop.json` (`Prices.ts:173`). The author says the builder is developed "in a different private repo" (`dataParser/README.md`). |
| Price feeds | poe.ninja data through the author's own proxy: `api.exiledexchange2.dev/proxy/{league}/overviewData.json` and `namespaceMap.json`, every 31 min while in use (`Prices.ts:62-64, 192-203`). |
| Hotkeys | Price check **Ctrl+D**, locked window **Ctrl+Alt+D** (`PriceCheckWindow.vue:193-195`). Refuses game keys like Ctrl+C, Ctrl+V, Enter (`Shortcuts.ts:133-150`). Links out to poe2wiki, poe2db and Craft of Exile (the last with the whole item text in the URL) (`renderer/src/web/item-check/hotkeyable-actions.ts:116-125`). |
| Overlay tech | Electron 40 (`main/package.json`), `electron-overlay-window` 4.0.2 (MIT, by SnosMe) to glue to the game window by title "Path of Exile 2", `uiohook-napi` for key hooks and key sending. The overlay library supports Windows and X11 only (its README, npm). The game must be in Windowed or Windowed Fullscreen, not Fullscreen (`docs/download.md:32-33`). |
| Platforms | Windows (NSIS + portable), Linux AppImage, macOS dmg (`main/electron-builder.yml`); CI builds all three (`.github/workflows/main.yml:38-40`). Open issue "Does not run on macos" (#215) and "wrong monitor on Wayland" (#96). Source: EE2 issue list, 27 Sep 2026. |
| Signing | Unsigned: "you'll have to bypass security warnings on Windows and macOS" (`docs/download.md:23`); `mac.identity: null` (`electron-builder.yml`). |
| Cadence | 14 tags in six months; last v0.16.3 on 2026-09-06. |
| Outside code | `AI_POLICY.md`: "Maximum generally allowed is end of line completion. Please do not use agents or copy-paste blocks of code from llms." Any change we send to EE2 has to be written by a person. |
| Player complaints | Most-reacted issues: Wayland monitor (#96), no macOS (#215), "Query is too complex" on resistances (#101), price check from chat-linked items (#900), Linux overlay blocks input (#299). Source: GitHub issue list sorted by reactions, 27 Sep 2026. Reddit was not reachable: **Unverified** beyond GitHub. |

## Sidekick

| Question | Answer, with evidence |
|---|---|
| How it reads the item | Clipboard. On the hotkey it (optionally) saves the clipboard, empties it, releases Alt and sends **Ctrl+C**, waits 100 ms, reads, then restores (`src/Sidekick.Common.Platform/Clipboard/ClipboardProvider.cs:16-54`). The Craft of Exile action sends **Ctrl+Alt+C** instead (`src/Sidekick.Modules.General/Keybinds/OpenInCraftOfExileHandler.cs:34`). Hotkey only works while a `PathOfExile*` process has focus (`PriceCheckItemKeybindHandler.cs:24`; `Sidekick.Common.Platform/Windows/Processes/ProcessProvider.cs:22-29, 94`). If nothing was copied it passes the key press on to the game (`PriceCheckItemKeybindHandler.cs:28-33`). |
| Item-text parser | `src/Sidekick.Game.Parser/ItemParser.cs:29` (`ParseItem`); text is split on `--------` into blocks (`Items/OriginalText.cs:12, 21`); one class per property under `Properties/Definitions/` (e.g. `CorruptedProperty.cs`, `UnidentifiedProperty.cs`); stats matched by regex patterns from `stats.json` (`StatParser.cs:38-61`). |
| Endpoints | `POST {site}/api/trade2/search/{league}` (`src/Sidekick.Apis.Poe.Trade/Trade/ItemTradeService.cs:50-60`); `GET {site}/api/trade2/fetch/{ids}?query={id}` (`:118`). Base URLs per language in `src/Sidekick.Game.Providers/Languages/Implementations/GameLanguage*.cs:10-12`. No `/api/trade2/exchange` call found: currency prices come from poe.ninja `economy/exchange/current/overview` (`src/Sidekick.Apis.PoeNinja/Exchange/NinjaExchangeProvider.cs:74`), other items also from `economy/stash/current/item/overview` (`Stash/NinjaStashProvider.cs:428`). Price history from poe2scout: `api.poe2scout.com/{realm}/Leagues/{league}/Items/{id}/History?logCount=24` (`src/Sidekick.Apis.Poe2Scout/History/ScoutHistoryProvider.cs:17, 78`). |
| Request body | `{query:{status, name, type, term, stats, filters}, sort:{price:"asc"}}` (`src/Sidekick.Game.Parser/Trade/Requests/Query.cs:4-16`, `QueryRequest.cs:7`). Status defaults to `securable` (`Filters/Definitions/PlayerStatusFilter.cs:39-43`). |
| How it picks listings | Cheapest first; fetches 10 at a time as the player scrolls (`src/Sidekick.Modules.Items/Trade/TradeService.cs:57`). No single price. |
| Rate limits | Reads `X-Rate-Limit-Policy`, `X-Rate-Limit-Rules`, `X-Rate-Limit-{rule}` and `-State`, keeps one limiter per rule synced to the server's hit count, and runs one request at a time (`src/Sidekick.Apis.Common/Limiter/LimitHandler.cs:10-111`). Handles Cloudflare by opening a browser dialog and reusing its user agent (`Sidekick.Apis.Common/Cloudflare/CloudflareService.cs:49-63`). |
| Unidentified / corrupted | Each is a three-state filter (yes / no / any) picked by auto-select rules (`Properties/Definitions/UnidentifiedProperty.cs:26-61`, `CorruptedProperty.cs:27-91`). Which state is the default per item kind: **Unverified** (it is settings-driven). |
| Rares | Stat filters with a normalise option (`Filters/Types/IntPropertyFilter.cs:13-60`); optional poeprices.info estimate (`src/Sidekick.Apis.PoePriceInfo/PoePriceInfoClient.cs:26`). |
| Bundled data | `data/poe2/{lang}/base-items.json, items.json, item-classes.json, stats.json, pseudo.json, texts.json, trade-filters.json, trade-stats.json` plus `leagues.json`, `ninja-*-items.json`, `invariant-stats.json` (`src/Sidekick.Game/GameDataType.cs:5-45`). The ids (`crafted.stat_1002535626`) are the trade site's (`/api/trade2/data/stats`). The code that builds these files is **not in this repository** (no writer found for `DataProvider.Write`): where they come from is **Unverified**. |
| Hotkeys | Price check **Ctrl+D** (`src/Sidekick.Modules.Items/StartupExtensions.cs:21`), wiki **Alt+W**, find items **Ctrl+F** (`Sidekick.Modules.General/StartupExtensions.cs:36-37`). Global hook and key sending: SharpHook (`Sidekick.Common.Platform/Input/InputProvider.cs:7-21, 397`); clipboard: TextCopy. |
| Overlay tech | .NET 10; the UI is Blazor in a WebView. Releases build the **Avalonia** app (`.github/workflows/release.yml:75, 151`) with top-most windows (`src/Sidekick.Avalonia/OverlayWindow.axaml.cs:30`). A WPF + WebView2 app and a MAUI app are also in the tree. Updates by Velopack (`release.yml:92-100`). A "web" build runs in a browser too (`release.yml:76, 152`). |
| Platforms | Windows x64 and Linux x64 (AppImage, needs `xsel`, `webkit2gtk-4.1`, `dotnet-runtime`, per `README.md`). No macOS release job (`release.yml`). |
| Signing | No signing step in `release.yml`: **Unverified** whether binaries are signed some other way. |
| Cadence | 28 tags in six months; last v2026.9.2 on 2026-09-06. |
| Outside code | "We accept most PR and ideas. If you want a feature included, create an issue and we will discuss it." (`README.md`). Already has one module per outside price site: `Sidekick.Apis.PoeNinja`, `Sidekick.Apis.Poe2Scout`, `Sidekick.Apis.PoePriceInfo`. |
| Player complaints | Top issues are about windows and Linux: focus switching (#445), Wayland protocol error (#1115), Linux support (#328). Source: GitHub issue list, 27 Sep 2026. |

## Exile-UI

A hobby toolkit, "centered around SSF" (`README.md`). It is **not a trade price checker** for single items.

| Question | Answer, with evidence |
|---|---|
| How it reads the item | Clipboard. The "omni-key" (default **CapsLock**, `modules/hotkeys.ahk:15`) sends **Ctrl+C** and waits up to 0.1 s (`modules/omni-key.ahk:40-41`). Also reads `Client.txt` (`modules/client log.ahk`) and checks screen pixels to see which game panel is open; reads on-screen text with Windows' built-in OCR only on a key press (`modules/_ocr thread.ahk:65`). The author lists all of this under "Transparency Notice" (`README.md`). |
| Item-text parser | `modules/item-checker.ahk`: loops over lines for class, rarity, name, base (`:177`), unidentified (`:204`), then scores mods against its tier tables to judge loot quality. It shows tiers, not prices. |
| How it prices | Only for stash tabs ("Stash-Ninja"): poe.ninja `poe2/api/economy/exchange/current/overview` (`modules/stash-ninja.ahk:440-443`), and on a click, the bulk exchange: `POST https://www.pathofexile.com/api/trade/exchange/{league}` with `{"query":{"status":{"option":"onlineleague"},"have":[x],"want":[y]},"sort":{"have":"asc"},"engine":"new"}` (`modules/_functions.ahk:173-185`). Note the path is `/api/trade/`, not `/api/trade2/`; whether that serves PoE 2 leagues is **Unverified**. |
| Rate limits | Reads `X-Rate-Limit-Ip` and `X-Rate-Limit-Ip-State` only, and `Retry-After` on a 429 (`modules/_functions.ahk:189-198`). |
| Unidentified / corrupted / rares | Item-info marks unidentified (`item-checker.ahk:204`) and rates rare mods by tier; no trade search. |
| Bundled data | `data/global/item mods 2.json`, `item bases 2.json`, `item drop-tiers 2.json`, leveling trees, and more; updates pulled from its own GitHub (`modules/_functions.ahk:701-718`). How the mod tables are made: **Unverified**. |
| Tech | AutoHotkey v1.1, 64-bit (`Exile UI.ahk:3`), WinHttp for requests. |
| Platforms | Windows only (AutoHotkey). |
| Cadence | 21 tags in six months; last v1.65.0 on 2026-09-03. |

## poe2scout

A **price website with a public API**, not an overlay. Sidekick and PCO both read it.

| Question | Answer, with evidence |
|---|---|
| Where prices come from | Currency: GGG's public Currency Exchange feed `https://web.poecdn.com/api/currency-exchange/{id}` with no sign-in (`net/Poe2scout.CurrencyExchange.Worker/PoeCurrencyExchangeClient.cs:18`; tests assert no OAuth, `net/Poe2scout.CurrencyExchange.Worker.Tests/CurrencyExchangeClientTests.cs:10-28`). Uniques: the trade site, `https://www.pathofexile.com/api/trade2` search and fetch (`net/Poe2scout.UniquePriceLog.Worker/PoeTradeClient.cs:34, 76, 88`). |
| Request body | Uniques: `status: securable`, `name`, `trade_filters.price.option = {currency}`, `misc_filters.corrupted = false` except jewels, `sort: price asc` (`PoeTradeClient.cs:164-198`). Other items: `status: online`, `type` (`:200-211`). |
| How it picks a price | Three searches per unique (priced in exalted, chaos, divine), 10 listings each, takes the **cheapest** of each, converts, and keeps the lowest (`UniquePriceLogWorker.cs:95-143, 165, 191`). |
| Rate limits | Fixed waits, not the headers: 17 s between searches, 3 s between fetches, 300 s on 403/405/503 (`PoeTradeClient.cs:38-40, 120-131`). A 429 is thrown, not retried (`:153`). Sends `User-Agent: POE2SCOUT (contact: ...)` (`:36, 112`). |
| Tech | .NET 10 API and workers, Python workers, PostgreSQL, React front end (`README.md`). |

## XileTrade

| Question | Answer, with evidence |
|---|---|
| How it reads the item | Clipboard; sends **Ctrl+Alt+C** or **Ctrl+C** with `SendKeys` (`src/Xiletrade.UI.WPF/Services/SendInputService.cs:36, 41`). |
| Endpoints | `/api/trade2/search/`, `/fetch/`, `/exchange/`, `/data/`, and `/whisper` on every regional site (`src/Xiletrade.Library/Shared/Strings.cs:57-62`). |
| Rate limits | Reads `X-Rate-Limit-Policy` and the `Ip`, `Account` and `Client` rules with their `-State` (`Strings.cs:755-765`). |
| Tech, platform | WPF on .NET 10, Windows only (`src/Xiletrade.UI.WPF/Xiletrade.UI.WPF.csproj:4`). |
| Licence | GPL-3.0 for the app. Code from it cannot go into a closed or MIT project. |
| Cadence | 10 tags in six months; last 1.15.10 on 2026-08-22. |

## POE2 Currency Overlay (PCO, "VibeTools")

| Question | Answer, with evidence |
|---|---|
| How it reads the item | Clipboard: taps C with Ctrl held via `uiohook-napi` (`main.js:1100-1118`). Also takes **screen captures** with Electron's `desktopCapturer` for its stash net-worth and exchange readers (`main.js:1619, 2615`). What triggers each capture was not traced: **Unverified**. |
| Endpoints | `/api/trade2/search/poe2/{league}`, `/api/trade2/fetch/...`, `/api/trade2/exchange/poe2/{league}`, `/api/trade2/data/leagues` (`trade2.js:165-264`), reads `x-rate-limit-policy` (`trade2.js:99`); poe2scout API (`main.js:53`); a "CX-only" price path from the Currency Exchange feed (`main.js:648`). |
| Parser | A vendored copy of EE2's parser: `renderer/vendor/ee2/src/parser/Parser.ts`. |
| Tech, platform, licence | Electron 43 + uiohook-napi (`package.json:79, 89`); Windows first, with Linux capture code (`main.js:1542-1660`); GPL-3.0. |
| Cadence | 43 tags in six months (3.x since 2026-08-14). |

## PoE Overlay II (closed source)

| Question | Answer |
|---|---|
| Code | Not public. The PoE 1 ancestor, Kyusung4698/PoE-Overlay (MIT), was an Electron/Angular app, deprecated in 2021 in favour of Overwolf (`DEPRECATED.md`). Nothing below is checked in code: **Unverified**. |
| What it says it does | "Instant price checks" with "live trade data from the official site", an in-game market browser. Source: overwolf.com/app/kyusung4698-poe_overlay_ii. |
| Platforms | "Windows only"; not Linux, Steam Deck or macOS. Overwolf or standalone. Source: poeoverlay.com/download/poe-overlay-ii. |
| Money | Free with ads; paid Premium removes ads (monthly, yearly or a 60-day League Pass). Same source. |
| GGG stance | The forum reply above was about this tool. |

## GGG's in-game price check (built into the game)

| Question | Answer |
|---|---|
| Since | Content Update 0.5.0, "Return of the Ancients", 29 May 2026. Source: https://www.pathofexile.com/forum/view-thread/3932540. |
| How it reads the item | It is the game: **Shift+Alt+click** an item "will populate the filters for searching the trade market so you can see the current prices". On controller, "holding Y or Triangle on the item". Same source. |
| Rares | "enable and disable each modifier to easily determine the effect each one has on an item's price." Same source. |
| Platforms | PC and console (the controller line above). A console player thread confirms it reached consoles. Source: https://www.pathofexile.com/forum/view-thread/3932182. |
| What it does not do | No price history, no liquidity, no "what is it worth to craft", no drop sources. It shows the live listings only. **Unverified** beyond the patch notes: no code to read. |
| Cost to a player | None: no install, no ban risk. |

## Other tools seen, not read

`PoeAncientsPriceHelper` and `RuneshapePriceChecker` (both OCR on exchange / Runes of Aldur windows),
`PoE2k` (Overwolf). Found by web search only; **Unverified**.

---

## Side by side

| | EE2 | Sidekick | Exile-UI | XileTrade | PCO | PoE Overlay II | In-game | poe2scout |
|---|---|---|---|---|---|---|---|---|
| Reads item by | Ctrl+Alt+C → clipboard | Ctrl+C → clipboard | Ctrl+C → clipboard; screen text on key | Ctrl(+Alt)+C → clipboard | Ctrl+C → clipboard; screen capture | Unverified | the game | n/a |
| Prices from | trade2 search/fetch/exchange + poe.ninja (via own proxy) | trade2 search/fetch + poe.ninja + poe2scout | poe.ninja + bulk exchange (stash only) | trade2 all | trade2 + poe2scout + CX feed | "official site" (Unverified) | trade market | CX feed + trade2 |
| One price or a list | list | list | tier score, no price | list | list + "suggested floor" | Unverified | list | one number |
| Reads rate-limit headers | yes, all rules | yes, all rules | Ip rule only | Ip/Account/Client | policy (partly read) | Unverified | n/a | no, fixed waits |
| History / liquidity | no / no | poe2scout history / no | no / no | no / no | 7-day sparkline (Source: its README) / no | Unverified | no / no | yes / volume |
| Stack | Electron | .NET Avalonia + Blazor | AutoHotkey v1 | .NET WPF | Electron | Overwolf | — | web |
| Windows / Linux / macOS | yes / yes / dmg, "does not run" issue | yes / yes / no | yes / no / no | yes / no / no | yes / partly / no | yes / no / no | PC + console | browser |
| Licence | MIT | MIT | MIT | GPL-3.0 | GPL-3.0 | closed | — | MIT |
| Takes outside price data | only hard-coded hosts (`proxy.ts:5-19`) | per-site modules, PRs welcome | no | Unverified | poe2scout only | no | no | — |
| Tags in 6 months | 14 | 28 | 21 | 10 | 43 | n/a | patches | n/a |

What they all miss, and WI already has: a price that is one number with its age (WI takes the middle of the
5 cheapest of 10 online listings, `tools/pricepull.py:6-7`), a daily history, and from #85 and #99 the
Currency Exchange volume, spread and stock. What WI does not have and they do: a price for one exact rare.

---

## WI's options

### (a) Link out

WI stays a website. Two ways in:

1. **Paste the item into WI's search.** The player presses Ctrl+Alt+C in game (the game's own copy, no tool),
   then pastes into WI on a second screen or phone. WI parses the text in the browser and opens the card. No
   install, no ban question, works on any PC with a browser. Needs only the parser from `overlay.md`.
2. **Buttons in other tools.** EE2 and Sidekick open fixed sites (EE2 `hotkeyable-actions.ts:116-125`:
   poe2wiki, poe2db, Craft of Exile with the item text in the URL). A "WI" button there needs a change in their
   code (see b).

Cost: small. Reach: every PC player, today.

### (b) Feed WI data into those tools

No tool has a plugin point for an outside price source. Each outside site is code inside the tool:

- **Sidekick**: the best fit. It has one module per price site (`Sidekick.Apis.Poe2Scout` shows history from
  poe2scout's public API, `ScoutHistoryProvider.cs:78`), and says it accepts most PRs after an issue. WI would
  need a stable public read API: per item, price, age, daily history, liquidity pill. Then a
  `Sidekick.Apis.WraeclastIndex` module. Their decision, not ours.
- **EE2**: only allows hard-coded hosts (`main/src/proxy.ts:5-19`), and its `AI_POLICY.md` forbids agent-written
  code. A change there must be written by hand by the owner and accepted by its author.
- **Exile-UI**: SSF-focused hobby project; unlikely.
- **PoE Overlay II**: closed; no.

Cost: WI's public API is useful anyway (#117's phone mode needs it). The PRs are small but their acceptance
is not ours to decide. Reach: that tool's users only.

### (c) WI's own overlay (#115)

A small PC app: hotkey → one Ctrl+Alt+C → WI's card over the game. Design in [`overlay.md`](overlay.md).

Cost: large and lasting. The parser must follow every patch (the tools above release 10 to 43 times in six
months). Signing, updates and support on three OSes. Reach: players who install it.

### Recommendation

**Do (a) first, then (c) as a thin shell around (a), and offer (b) to Sidekick along the way.**

1. The hard part of every option is the same: **a parser for copied item text, tested on 100 real items.**
   Build it once, in the browser, for "paste into WI" (a1). It ships to every player with no install.
2. **Do not build another trade-search price checker.** GGG's own Shift+Alt+click check now does the live
   listing search in the game, on PC and console, with no ban risk. EE2 and Sidekick do it too, better than a
   first version of ours would. WI's value is what none of them show: one price with its age, history,
   liquidity (#99), craft value, drop sources, patch changes, waystone danger. The overlay shows WI's card,
   not a list of listings.
3. **Then the overlay (c)** is a small shell: the same parser and the same card, plus a hotkey. It reads WI's
   public price files, not the trade API, so it has no trade rate limits to manage and cannot get a player's
   IP limited.
4. **A public read API** (needed for 3 and for #117) makes (b) possible. Open an issue on Sidekick offering it;
   do not spend effort on EE2 unless the owner wants to write that change by hand.

Rares stay with the tools built for them: WI's card for a rare shows its base and mods, and one button opens
the official trade site with the search filled in. The player can also use the game's own Shift+Alt+click.

## What the owner must decide

1. Is (a) "paste an item into WI" wanted on the site in 1.0, given the front-end rework?
2. Build the overlay (c) at all, or stop at (a) plus (b)?
3. A public read API for prices (per item: price, age, history, liquidity): yes or no, and under what terms
   (free, rate-limited, attribution).
4. Whether to open a Sidekick issue offering WI data.
5. The overlay-level choices listed at the end of [`overlay.md`](overlay.md).
