-- Popular trade searches (the search itself only, nothing about the person) and simple per-address rate limits
CREATE TABLE IF NOT EXISTS trade_searches (
  id      TEXT PRIMARY KEY,    -- SHA-256 of the search
  state   TEXT NOT NULL,       -- the Trade page's search, as JSON
  n       INTEGER NOT NULL DEFAULT 1,
  first   TEXT NOT NULL,
  last    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS trade_searches_last ON trade_searches(last);
CREATE TABLE IF NOT EXISTS hits (
  key     TEXT PRIMARY KEY,    -- SHA-256 of today's date + address + action: cannot be traced back after the day
  n       INTEGER NOT NULL,
  until   INTEGER NOT NULL     -- unix seconds when the window ends
);
