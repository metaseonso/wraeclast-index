-- Where a note came from (the Suggest button, worker/community.js). The page was already kept; this adds
-- the card it was sent from, so the owner's dashboard shows a note against the thing it is about instead of
-- a sentence with no context.
--   card  the card's own key, "<kind>:<id>" — "u:Headhunter", "c:Divine Orb" — or empty where the note was
--         sent from a page and not from a card. Nothing else is kept: no words typed elsewhere on the page,
--         nothing about the person.
-- Every note already in the table keeps its NULL and draws as it did.
ALTER TABLE suggestions ADD COLUMN card TEXT;
