# Wraeclast Index

A searchable index for Path of Exile 2: skill gems, uniques, the passive tree and timeless jewels.

**Live site:** https://metaseonso.github.io/wraeclast-index/

## What is in it

- **Gems** — every skill and support gem, with stats at any level (1–40) and quality.
- **Uniques** — every unique item with its modifiers and a price from poe.ninja.
- **Passive tree** — every passive node, with duplicates merged, filterable by ascendancy and attribute region, with the divine cost to anoint each notable.
- **Timeless jewels** — every conqueror and its seed range.

Game data comes from the RePoE PoE2 dump (build 4.5.5.2).

## How it is built

The whole site is one static page, `index.html`, plus two sprite sheets in `sprites/`.
There is no build step. GitHub Pages serves the `main` branch as-is.

## Update the site

1. Replace `index.html` (and `sprites/` if the icons changed).
2. Commit and push to `main`.
3. GitHub Pages redeploys in about a minute.

Path of Exile is a trademark of Grinding Gear Games. This is a fan project and is not affiliated with them.
