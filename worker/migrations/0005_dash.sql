-- Owner dashboard (worker/dash.js): page views, clicks and click spots, counted per day (UTC).
-- Nothing about the person: no address, no cookie, no typed text. The country is Cloudflare's two letters.
-- WITHOUT ROWID: the primary key is the table, so each count is one row written (no second index row).
CREATE TABLE IF NOT EXISTS views (
  day     TEXT NOT NULL,      -- "2026-09-19"
  route   TEXT NOT NULL,      -- home, build, currency, trade, farms, atlas, explore-gems, explore-uniques, explore-tree
  source  TEXT NOT NULL,      -- how they arrived: "direct", the other site's host, "utm:<tag>", or "site" (moved inside the site)
  device  TEXT NOT NULL,      -- phone, tablet, desktop (by screen width)
  country TEXT NOT NULL,      -- two letters, "XX" when unknown
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route, source, device, country)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS clicks (
  day     TEXT NOT NULL,
  route   TEXT NOT NULL,
  label   TEXT NOT NULL,      -- what was clicked: "tab:Trade", "card:gem", "out:poe.ninja", "popup:Trade" (never typed text)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, route, label)
) WITHOUT ROWID;
CREATE TABLE IF NOT EXISTS heat (
  day     TEXT NOT NULL,
  route   TEXT NOT NULL,
  device  TEXT NOT NULL,
  xb      INTEGER NOT NULL,   -- across: 0-49, 2% of the screen width each
  yb      INTEGER NOT NULL,   -- down the page: 0-299, 20 px each (the first 6000 px)
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (route, day, device, xb, yb)   -- the heatmap reads one page at a time
) WITHOUT ROWID;
