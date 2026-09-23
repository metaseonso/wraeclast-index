-- What a player reports about an interaction (worker/community.js). An interaction card holds a question
-- open (tools/interactions.py), so the card takes an answer, and the answer travels the path a note from the
-- Suggest button already takes: the same table, the same rate limit, and the card it is about beside it
-- (migration 0009). These four columns are what an answer is, over and above the note.
--   lean   which way the player says it works: 'works', 'no' or 'unclear'. Empty on an ordinary note, and
--          the only thing that makes a note an answer rather than a note.
--   who    the name the player gave themselves, in their own words, or empty. Nothing is asked of them and
--          nothing is kept about them: there is no sign-in and no address behind this.
--   src    where it comes from, in their own words: their own testing, or a source they name.
--   shown  -1 hidden by the owner, 0 as it was sent, 1 checked by us. The card draws the lean, the name and
--          the source of every row at 0 and above, and marks a 1 as ours. The note's own words are never
--          public: they stay on the owner's dashboard, as they always have.
-- Every note already in the table keeps its NULL lean and is no answer, so nothing already sent changes.
ALTER TABLE suggestions ADD COLUMN lean TEXT;
ALTER TABLE suggestions ADD COLUMN who TEXT;
ALTER TABLE suggestions ADD COLUMN src TEXT;
ALTER TABLE suggestions ADD COLUMN shown INTEGER NOT NULL DEFAULT 0;
-- the card's own answers, and the count per card behind the heatmap: both read by card
CREATE INDEX IF NOT EXISTS suggestions_card ON suggestions(card);
