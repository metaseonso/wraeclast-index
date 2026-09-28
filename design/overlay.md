# WI overlay for PC: design

Ticket: #115. Background and the tool-by-tool evidence: [`price-check.md`](price-check.md) (#114). Phone and
console: #117. Written 27 Sep 2026. **No overlay code exists yet**; this is the plan.

Updated for main at `c123ad2` (28 Sep 2026): where the data comes from, and the patch-changes file.

Labels as in `price-check.md`: **Source: X**, **Unverified**, **Estimate**, **Subject to change (depends on GGG)**.
Code references like `EE2 main/src/proxy.ts:5-19` point at the commits listed there.

## What it is

Press one key over an item in game. The overlay copies the item (one Ctrl+Alt+C), reads the text, finds the
item in WI, and shows its card beside the cursor. Esc or a click elsewhere hides it. No alt-tab.

Order: Windows first, then Linux, then macOS. Consoles cannot run it; they get the phone mode (#117). The
download page says so.

## The rules it keeps

From GGG's developer docs (quotes and link in `price-check.md`). **Subject to change (depends on GGG).**

- One key press = one action in the game: the overlay sends one Ctrl+Alt+C, nothing else. It never types in
  chat, never clicks, never repeats.
- Only on a key press by the player. Never on a timer, never when the clipboard changes, never because
  something appeared on screen.
- No game memory, no game files changed, no screen reading. (Reading the game's own settings file to learn the
  "advanced description" key, as EE2 does, `EE2 main/src/host-files/GameConfig.ts:10-26`, is optional; first
  version asks the player instead.)
- It does not call the trade API (see "Where the data comes from"), so it has no trade rate limits to break.
- GGG approves no tool (`price-check.md`, forum reply). The page says that plainly.

## Stack

Needs: a small always-on-top window with no frame, a global hotkey, a way to send one key combo, clipboard
read/write, WI's card drawn with WI's own HTML/CSS/JS, auto-update, and low memory on weak PCs.

| | Electron | Tauri 2 | .NET Avalonia (Sidekick's way) | AutoHotkey (Exile-UI's way) |
|---|---|---|---|---|
| UI | Bundled Chromium; WI's card code runs as is | System webview: WebView2 on Windows, WebKitGTK on Linux, WKWebView on macOS; WI's card code runs as is | Avalonia, with a WebView for web UI (Sidekick: Blazor in a WebView) | AHK GUI; WI's card would be rewritten |
| Installer size | about 80–120 MB (**Estimate**) | about 5–15 MB (**Estimate**) | about 60–100 MB self-contained (**Estimate**) | a few MB, plus AutoHotkey |
| Memory when idle | about 150–300 MB (**Estimate**) | about 50–120 MB, mostly WebView2 (**Estimate**) | about 100–200 MB (**Estimate**) | under 30 MB (**Estimate**) |
| Hotkey, key send, clipboard | `globalShortcut`, `clipboard` built in; key send via `uiohook-napi` (EE2, PCO) | `tauri-plugin-global-shortcut`, `tauri-plugin-clipboard-manager` (both 2.4.0, MIT/Apache-2.0); key send via `enigo` 0.6.1 (MIT) or the `windows` crate | SharpHook, TextCopy (Sidekick) | built in |
| Stick to game window | `electron-overlay-window` (MIT), Windows and X11 only (its README) | write it: Win32 `GetForegroundWindow` + window title "Path of Exile 2" via the `windows` crate | own code (Sidekick) | built in |
| Linux / macOS | yes / yes (EE2 ships both; its macOS build has an open "does not run" issue #215) | yes / yes; Wayland limits global hotkeys and window placement for every stack (EE2 #96, Sidekick #1115) | yes / possible, Sidekick ships none | no / no |
| Updates | `electron-updater` | `tauri-plugin-updater` 2.13.0; updates must be signed with the app's own key (Source: Tauri docs; **Unverified** in code) | Velopack (Sidekick) | own |
| Licence | MIT | MIT or Apache-2.0 | MIT | GPL-2.0 (AutoHotkey itself) |
| New language for WI | none (JS) | Rust for the small native part | C# | AHK |

Versions checked on npm and crates.io on 27 Sep 2026: Electron 44.4.5, Tauri 2.12.0.

**Choice: Tauri 2.** Reasons:

1. **Weak PCs.** The game already uses most of the memory. Tauri uses the webview Windows already has
   (WebView2 ships with Windows 11 and comes to Windows 10 through updates; Source: Microsoft's WebView2
   docs; **Unverified** here), so there is no second Chromium in memory and the download is small.
2. **WI's card as it is.** The overlay loads the same card code as the site. One card, two places.
3. **Small native part.** Only four native jobs: hotkey, one key send, clipboard, window placement. That is
   a few hundred lines of Rust, written once.
4. **Licences fit.** Tauri, its plugins, `enigo` and `windows` are all MIT or Apache-2.0.

What Tauri costs: Rust in the build; WebView2 differs slightly from Chrome (test the card there); WebKitGTK on
Linux is slower than Chromium (**Estimate**). If Rust is not wanted, Electron is the fallback: it works (EE2
proves it on three OSes) but costs 3–5 times the memory (**Estimate**).

**Fullscreen.** No stack draws over exclusive Fullscreen. The game must be in Windowed or Windowed Fullscreen,
same as EE2 (`EE2 docs/download.md:32-33`). The overlay says so on first run and when the hotkey finds no game
window. If the game runs as Administrator, the overlay must too (`EE2 docs/download.md:42-44`).

## Reading the item

1. Player presses the overlay hotkey (default to be decided; must not clash with EE2's and Sidekick's
   Ctrl+D or the game's own keys; EE2 refuses Ctrl+C, Ctrl+V, Ctrl+A, Ctrl+F, Ctrl+Enter, Enter and arrows,
   `EE2 main/src/shortcuts/Shortcuts.ts:133-147`).
2. Only if Path of Exile 2 has focus (Sidekick checks the focused process, `Sidekick …/ProcessProvider.cs:94`).
3. Save the clipboard, send **Ctrl+Alt+C** once (advanced text: tiers and mod names, which the card can use).
4. Poll the clipboard every ~50 ms for up to 500 ms until the text starts with `Item Class: `
   (EE2's numbers, `HostClipboard.ts:4-5`).
5. Restore the clipboard at once. EE2 warns that a late restore can leave old clipboard contents, even a
   password, where the game reads them (`HostClipboard.ts:7-11`); restore only after the item text arrived.
6. Parse, look up, show the card. If nothing arrived, show nothing and pass the key on (Sidekick,
   `PriceCheckItemKeybindHandler.cs:28-33`).

## The parser

Written once in plain JS, used by the site ("paste an item into WI", option (a) in `price-check.md`) and by
the overlay. English first; other game languages later.

What it must read (the card needs no more than this; it does **not** build trade queries):

- Header: `Item Class`, `Rarity`, name and base type lines. Magic names carry affixes around the base.
- Blocks split on `--------` (both EE2 and Sidekick do this: `EE2 renderer/src/parser/Parser.ts:232-251`,
  `Sidekick …/Items/OriginalText.cs:12, 21`).
- Flags: `Unidentified`, `Corrupted`, `Mirrored`, sanctified, `Unmodifiable`.
- Numbers: item level, quality, stack size, waystone tier, area level, sockets and what is in them.
- Mod lines, with the `{ Prefix Modifier "Name" (Tier: 2) — tags }` lines from Ctrl+Alt+C kept beside them.
- The look-up: unique by name; everything else by base type; currency and other stackables by name. Uses WI's
  own index, not EE2's or Sidekick's data files.

Why not reuse EE2's parser: it is MIT, so we could, with its notice kept. But it depends on its 2.6 MB of
`items.ndjson` and `stats.ndjson`, made by a builder the author keeps in a private repo
(`EE2 dataParser/README.md`), and it does far more than the card needs. Our own small parser, tested against
the same kind of text, is less to keep up each patch. We read their code for the edge cases (e.g. Magic
names, `EE2 renderer/src/parser/magic-name.ts`). **Do not copy code from XileTrade or PCO: GPL-3.0.**

### The 100 test items

Real copied item texts already sit in those repos' tests. Counted by `Item Class: ` lines, PoE 2, English:

| Where | Count | Licence of the repo |
|---|---|---|
| EE2 `renderer/specs/Parser/items.ts` | 26 | MIT |
| Sidekick `tests/Sidekick.Apis.Poe.Tests/Poe2English/Parser/*.cs` and `tests/Sidekick.Apis.PoeNinja.Tests/Poe2English/` | 43 | MIT |
| XileTrade `src/Xiletrade.Test/ItemInfoDescription2/English/*.txt` | 41 | GPL-3.0 |
| XileTrade `src/Xiletrade.Test/Poe2Ninja/*.txt` | 13 | GPL-3.0 |
| **Total** | **123** before removing repeats | |

Classes covered: 15 stackable currency, 9 boots, 7 waystones, 7 tablets, 7 jewels, 6 socketables, 6 bows,
5 rings, 5 crossbows, and 1–3 each of about 30 more (wands, gems, charms, flasks, relics, quivers, keys,
logbooks, omens...). Both EE2 and Sidekick include Ctrl+Alt+C texts with `{ Prefix Modifier ... }` lines.

Plan:

1. Take the 69 from EE2 and Sidekick (MIT; keep their notice in the fixtures folder).
2. The texts themselves are the game's words, not XileTrade's code, but they sit in a GPL repo: **owner
   decides** whether to copy those 54. If not, fill the gap with our own copies from the current league.
3. Add our own copies for every WI card kind (`assets/kinds.js`) with fewer than 3 items, and for every new patch (old fixtures
   miss new lines). Target: 100 or more, at least one per WI kind.
4. Each fixture gets the WI card it must open, written by hand. The test: every fixture parses without error
   and opens that card. Run it in `tools/dev/` beside the other checks.

## What the overlay shows

WI's card for the item (#115), with the item's own facts on top:

| Part | From | Notes |
|---|---|---|
| Price, with its age | WI real prices (`tools/pricepull.py`, `tools/exchange.py`) | Real prices only. No price: say so, never guess. |
| How easy to trade | #99 | Easy / Slow / Thin, with the rule written on the card. |
| Worth crafting | WI craft data | For bases. |
| Where it drops | WI | |
| What changed in the patch | WI patch notes; per card, `data/changes/<build>.json` (`tools/diff.py`) once one is committed | |
| Danger | #77 | Waystones and tablets: the mods read from the copied text. |
| Trial modifiers | #82 | |
| For a rare | the copied mods | Base price and tiers. One button: open the official trade site with the search filled in (in the browser). The game's own Shift+Alt+click check also works. |
| Unidentified | the copied text | Unique base: list the uniques on that base with their prices. |
| Corrupted | the copied text | Shown as a fact; WI's unique prices are for uncorrupted items where the pricing says so. |

Size: one card, about 380 × 520 px, beside the cursor, never covering the item. Optional QR code that opens
the same card on a phone (#117).

## Where the data comes from

- WI's public data, fetched from wraeclastindex.fyi: the search index (`data/index-core.json` and
  `data/index-rest.json`, static files, free to serve) and today's prices (`/data/market.json?part=live`, one
  worker call), cached on disk, refreshed at most once an hour (WI's prices change hourly). So one install
  costs the site about 24 worker calls a day at most (Estimate). Which file(s) exactly depends on the public read
  API decision (`price-check.md`, owner decision 3). The daily price copy (`tools/pricehistory.py`) is kept in a
  private repo, so it is not a source for the overlay.
- **No trade API calls** in the first version. So no `X-Rate-Limit-*` handling, no Cloudflare, no session
  cookie, and a player's IP cannot be limited because of us. If a later version adds a live search, it must
  follow the headers the way EE2 does (`EE2 renderer/src/web/price-check/trade/common.ts:59-146`) and send
  GGG's `User-Agent` format.

## Privacy

- Reads the clipboard only right after its own hotkey, and only keeps text that starts with `Item Class: `.
- The item text never leaves the PC. The overlay downloads WI's files; it does not upload anything about the
  item. (A look-up by name could be sent instead of downloading the index; the offline way leaks nothing.)
- No account, no sign-in, no game log, no screenshots.
- No usage counting by default. If the owner wants counts, an opt-in with a plain list of what is sent.
- Settings in a local file; uninstall removes everything.

## Updates and signing

- **App updates:** `tauri-plugin-updater` from WI's GitHub releases. Update files signed with a key the owner
  holds; the app refuses unsigned updates (Source: Tauri docs; **Unverified** in code). A new release is
  needed when the parser needs a fix after a patch; data needs no release (it is downloaded).
- **Windows code signing:** unsigned apps get SmartScreen's "Windows protected your PC" warning; EE2 ships
  unsigned and tells players to click through (`EE2 docs/download.md:23`). A code-signing certificate or a
  signing service costs money every year (**Estimate**: about 100–400 USD a year). **Owner decides.**
- **macOS:** unsigned apps need the right-click → Open dance; a notarised app needs an Apple Developer account
  (99 USD a year; Source: Apple). The key-send needs the Accessibility permission on macOS (**Unverified**
  for Tauri + `enigo`; EE2 has a macOS-only key workaround, `Shortcuts.ts:299-306`).
- **Linux:** AppImage first. X11 works; on Wayland the hotkey and placement may not (EE2 #96, Sidekick
  #1115). Say so on the page.

## Build order

1. Parser + 100 fixtures + test (shared with the site's paste feature).
2. Windows prototype: hotkey → Ctrl+Alt+C → card in a Tauri window. This is what "done" in #115 asks for.
3. Game-window check, first-run notes (Windowed Fullscreen, admin), settings (hotkey), updater.
4. Signing, release page. Then Linux, then macOS.

## "Console later" (#117)

Consoles (PS5, Xbox) cannot run any overlay or read a clipboard. They already have GGG's in-game check (hold
Y or Triangle, since 0.5.0; Source: patch notes, `price-check.md`), which shows live listings but no price
history, liquidity or drop sources. "Later" means: after the PC overlay, a phone page built for one-hand
search while playing (#117), fed by the same public data. The overlay can show a QR code that opens the same
card on a phone. Nothing in this design blocks it; the public read API serves both.

## What the owner must decide

1. **Build it?** (see `price-check.md`: (a) first, then this as a thin shell.)
2. **Stack:** Tauri 2 (recommended; needs Rust in the build) or Electron (no Rust, 3–5× the memory, **Estimate**).
3. **Hotkey default**, and whether the overlay sends Ctrl+Alt+C itself (one action per press, as EE2 and
   Sidekick do) or asks the player to press Ctrl+Alt+C first and then the overlay key (zero key sending,
   two presses).
4. **Signing money:** Windows certificate or signing service (yearly); Apple account (yearly) or no macOS.
5. **Test items from XileTrade** (GPL repo): copy the 54 texts, or collect our own instead.
6. **WI's licence.** The repo has no licence file today. Needed before shipping an app, and before copying any
   MIT fixtures (their notice must be kept either way).
7. **Usage counts:** none, or opt-in.
8. **Public read API** for prices (shared with #117 and option (b)).
