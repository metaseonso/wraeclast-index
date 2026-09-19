-- Live trade prices, pulled slowly by the worker's once-a-minute job (worker/prices.js)
CREATE TABLE IF NOT EXISTS trade_prices (
  key     TEXT PRIMARY KEY,   -- "roll:<trade stat id>@<value>" or "farm:<key>"
  league  TEXT NOT NULL,
  p       TEXT NOT NULL,      -- JSON: the 10 cheapest listings as [amount, currency]
  total   INTEGER NOT NULL,   -- how many listings matched
  at      TEXT NOT NULL       -- when it was checked (UTC)
);
-- Our own load, per hour: trade searches and fetches, and how often the trade site said "slow down"
CREATE TABLE IF NOT EXISTS load (
  hour    TEXT NOT NULL,      -- "2026-09-19T14"
  kind    TEXT NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, kind)
);
CREATE TABLE IF NOT EXISTS meta (
  k       TEXT PRIMARY KEY,
  v       TEXT
);
