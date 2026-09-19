-- Accounts, sessions and pins for wraeclastindex.fyi
-- Usernames are first come, first served. Linking a Google account marks the name as claimed.
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  username    TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass_hash   TEXT,              -- PBKDF2-SHA256, base64; NULL for Google-only accounts
  pass_salt   TEXT,
  google_sub  TEXT UNIQUE,       -- Google's stable account id, once linked
  google_email TEXT,
  claimed     INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,  -- SHA-256 of the cookie value; the cookie itself is never stored
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS pins (
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,     -- a card key such as "u:Headhunter" or "c:Divine Orb"
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS attempts (
  key         TEXT PRIMARY KEY,  -- hashed IP or username, for sign-in rate limits
  window_start INTEGER NOT NULL,
  count       INTEGER NOT NULL
);
