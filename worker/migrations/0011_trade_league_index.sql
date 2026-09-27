-- The trade prices of one league, one kind at a time (worker/prices.js kindRows: the market build, the slider,
-- farm and boss price files, and GET /api/prices/state). Before 27 Sep these were asked with LIKE and no index
-- on league, so each one read the whole table; the database went past the free plan's 5 million reads a day.
-- The code already asks by key range, which the key's own index answers, so it does not wait on this file:
-- this index only lets the league narrow it first. Safe to apply twice; DROP INDEX trade_prices_league undoes it.
CREATE INDEX IF NOT EXISTS trade_prices_league ON trade_prices(league, key);
