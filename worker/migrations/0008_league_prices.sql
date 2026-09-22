-- The price line per league: one row per priced thing per league, so a league's prices are still here after
-- the league ends (worker/prices.js). trade_prices keeps only the live row, 45 days, and every field on it is
-- overwritten when a new league starts, so on its own it can never carry a past league.
--   s   the same shape as trade_prices.h: [[day, price in divines], ...] in day order, one price a day, days
--       nothing was checked left out. Only what a check really found; nothing is worked out or filled in here.
--   cx: rows are the in-game Currency Exchange's own currencies (exchange.json), rolled in once a day.
-- A row is added to in place (one write a day per thing), and rows for leagues older than the last four are
-- dropped, so the table does not grow with the age of the site.
CREATE TABLE IF NOT EXISTS price_leagues (
  key     TEXT NOT NULL,      -- "uniq:<index id>", "roll:<mod>@<value>", "farm:<key>", "boss:<key>", "cx:<currency>"
  league  TEXT NOT NULL,      -- the league the prices are from, as the trade site names it
  s       TEXT NOT NULL,      -- JSON: [[day, price], ...]
  at      TEXT NOT NULL,      -- when this row was last added to (UTC)
  PRIMARY KEY (key, league)
);

-- Carry this league's prices in, so nothing measured so far is lost: a straight copy of the live history, the
-- same shape and the same days, nothing worked out and nothing dropped. The league on the row decides which
-- league the days belong to, so no day can land in the wrong one.
-- Safe to apply twice (the primary key keeps one row per pair, and DO NOTHING leaves a row already there
-- alone), and reversible with DROP TABLE price_leagues: trade_prices is not touched by this file at all.
INSERT INTO price_leagues (key, league, s, at)
SELECT key, league, h, at FROM trade_prices
WHERE league <> '' AND h IS NOT NULL AND json_valid(h) AND json_array_length(h) > 0
ON CONFLICT(key, league) DO NOTHING;
