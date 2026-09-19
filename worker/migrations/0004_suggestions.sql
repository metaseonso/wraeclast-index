-- Notes from players (the Suggest button). Shown on the owner's dashboard only.
CREATE TABLE IF NOT EXISTS suggestions (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  text    TEXT NOT NULL,
  page    TEXT,
  at      TEXT NOT NULL,
  status  TEXT NOT NULL DEFAULT 'new'   -- new, read, done
);
CREATE INDEX IF NOT EXISTS suggestions_at ON suggestions(at);
