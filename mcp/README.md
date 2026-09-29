# wraeclast-index-mcp

Wraeclast Index for AI assistants: Path of Exile 2 cards, prices, price history and patch notes over MCP.
Local and read-only. It reads the site's public files from https://wraeclastindex.fyi and nothing else.

## Install

Once published on npm:

```
npx wraeclast-index-mcp
```

Node 18 or later. The server speaks MCP on stdio.

### Claude Desktop

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wraeclast-index": {
      "command": "npx",
      "args": ["-y", "wraeclast-index-mcp"]
    }
  }
}
```

### Claude Code

```
claude mcp add wraeclast-index -- npx -y wraeclast-index-mcp
```

## Tools

| Tool | Input | Answer |
|---|---|---|
| `search` | `words`, `kind` (optional) | Up to 10 cards: name, kind, page. Names first, then the cards' own lines. |
| `card` | `name`, `kind` (optional) | What it is, requirements, the official lines, other versions, anoint, price, page. |
| `price` | `name`, `kind` (optional), `unit`: `divine` or `exalted` (optional) | The price now, the time it was checked, its source. |
| `history` | `name`, `kind` (optional) | Day by day: a currency by league day, a traded item over its last 7 days. |
| `changes` | `card` and `kind`, or `patch` | GGG's patch-note lines that name a card; the cards one patch names; Wraeclast Index's own notes by version ("0.45"). Neither: the latest patches. |
| `compare` | `names` (2 to 5), `kind` (optional) | Kind, requirements, price and checked time side by side, then each card's lines. |

Kinds: `unique`, `gem`, `passive`, `keyword`, `currency`, `base`, `atlas`, `area`, `quest`. A name used by two kinds
goes to the first of that list; `kind` picks the other ("Freeze", `keyword`).

Prices: PC, the current trade league. Currency from the in-game Currency Exchange (hourly), everything else from live
trade site listings (each at least once a day). Divine from 1 divine up, exalted below, unless `unit` says.

One answer (`price`, name `Headhunter`):

```
Headhunter · Unique · Heavy Belt · Belt
Price: 250 div, up 14% in 7 days.
Checked: 2026-09-28 16:52 UTC, 15 h ago.
Price source: Forbidden Rites league, live trade site listings, 4 listed.

Source: Wraeclast Index, https://wraeclastindex.fyi/item/headhunter
Site data CC BY 4.0: credit Wraeclast Index and link the page. Game text © Grinding Gear Games.
```

Every answer is short plain text. No game ids, no stat ids. A price always has its own lines, with the time it was
checked and its source; a fact never shares its sentence.

## The rules

- **Credit.** Every answer names Wraeclast Index and the card's page, `https://wraeclastindex.fyi/item/<name>`.
  Pass that on with the answer.
- **Cache.** Every file is kept in memory and on disk, in the OS cache folder (`%LOCALAPPDATA%\wraeclast-index-mcp`,
  `~/Library/Caches/wraeclast-index-mcp`, or `$XDG_CACHE_HOME/wraeclast-index-mcp`, else `~/.cache/wraeclast-index-mcp`).
  - Files named by their content (`data/seo/base.<hash>.json` and the like): until the manifest no longer names them.
  - Prices (`data/market.json?part=live`): 5 minutes.
  - The manifest: 10 minutes. The market files, the patch files and the site's own notes: 1 hour.
  - When the site does not answer, the last copy stands. Its prices keep their own checked times.
  - `WI_MCP_CACHE=<folder>` puts the copies elsewhere; `WI_MCP_CACHE=off` keeps them in memory only.
- **User-Agent.** Every request sends `wraeclast-index-mcp/<version> (+https://wraeclastindex.fyi/#/data)`.
- **Rate.** One request at a time, never two within a second, never more than 60 in a minute. The site's cap is
  120 a minute per address; over it, 429, and the server waits out `Retry-After` before it asks again.

## What it reads

Only these, over HTTPS from https://wraeclastindex.fyi. Any other path is refused before a request goes out.

- `data/manifest.json`, and the index files it names (`data/seo/`, `data/cards/`, `data/search/`)
- `data/market.json?part=live`
- `data/market/*` (the daily Currency Exchange files: a currency's price by league day)
- `data/changelog.json` (Wraeclast Index's own notes), `data/patches.json` (the patch registry)
- `data/patchnotes.json` (GGG's patch-note lines, each with the cards it names)

Static files cost the site nothing; `data/market.json` and `data/market/*` are the site's worker, which is why the
cache and the rate limit hold.

## Tests

```
cd mcp
npm install
npm test
```

Node's built-in test runner, against `test/fixture/`: a small copy of the site's files, never the live site.
`node dev/fixture.mjs <snapshot folder>` cuts it again from the repo's `data/` and one snapshot of the price file.

## Terms

- Site data: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Credit Wraeclast Index and link the page
  the data came from.
- Game data, game text and item art: © Grinding Gear Games. This package is not affiliated with or endorsed by
  Grinding Gear Games.
- Issues: https://github.com/metaseonso/wraeclast-index/issues
