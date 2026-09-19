-- Data files the hourly jobs send in (POST /api/data/put, worker/files.js): exchange.json, market.json, leagues.json
CREATE TABLE IF NOT EXISTS files (
  name    TEXT PRIMARY KEY,   -- "exchange.json"
  body    TEXT NOT NULL,      -- the file itself (JSON, at most 1.5 MB)
  at      INTEGER NOT NULL    -- when it came in (unix seconds)
);
