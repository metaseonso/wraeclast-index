-- Player drop reports (#125, worker/community.js drops): "I got <item> from <boss or area>", with the area level
-- and the day. Drop pools are held on GGG's servers, so no file says what drops where; players can.
--   item   the item's card, by name: "u:<unique name>". Never an id.
--   src    where it fell, by name: "x:<boss name>" or "r:<area name>". Never an id.
--   lvl    the area level the player gave, 1 to 100.
--   day    the day it dropped, as the player gave it (YYYY-MM-DD).
--   at     when the report came in.
--   held   1 where the area level is under the item's drop level (data/dropsfrom.json): kept, counted on the
--          owner's dashboard, in no count on a card. 0 otherwise.
-- Nothing about the person: one report per item and place per address a day, by the daily-salted hash every
-- other limit uses (the hits table, migration 0003), which is gone the next day.
-- A card shows a pair once 3 reports that are not held name it, as a count. Both ends read by their own index.
CREATE TABLE IF NOT EXISTS drops (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  item  TEXT NOT NULL,
  src   TEXT NOT NULL,
  lvl   INTEGER NOT NULL,
  day   TEXT NOT NULL,
  at    TEXT NOT NULL,
  held  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS drops_item ON drops(item, held, src);
CREATE INDEX IF NOT EXISTS drops_src ON drops(src, held, item);
CREATE INDEX IF NOT EXISTS drops_held ON drops(held);
