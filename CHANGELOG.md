# Changelog (internal)

The full list of changes. The public patch notes (data/changelog.json, shown on the site) stay short.
Add the details here first, then a short public line there.

## Next — How the numbers stack: three concept cards, honestly sourced
- The follow-on to the entry below, which ended by saying what the honest fix would be: "a site-written note
  against a named source ..., not a keyword card wearing the game's voice". That is what this is. Three cards
  of our own, a new kind `h` with its own label (Concept), declared in one place, `tools/concepts.py`:
  **Increased and reduced**, **More and less**, **Added damage**. Every worked example uses real mods out of
  `data/index.json` (Honed Instincts, Deep Trance, Chakra of Rhythm, Crushing Verdict, Quill Rain,
  Winter's Bite) with the arithmetic spelled out.
- Where the maths comes from, read for this ticket in PathOfBuildingCommunity/PathOfBuilding-PoE2 (`dev`),
  `src/Modules`. The lines that settle additive against multiplicative, in `CalcOffence.lua`, in the function
  that works out a hit's damage per type:

      local inc = 1 + skillModList:Sum("INC", cfg, unpack(modNames)) / 100
      local more = skillModList:More(cfg, unpack(modNames))
      ...
      return  round(summedMin * inc * more * moreMinDamage + addMin),
              round(summedMax * inc * more * moreMaxDamage + addMax)

  every INC is summed and applied once; every MORE is its own multiplier. The same file says it in as many
  words in the doc comment on the area maths: `---@param incArea number @Additive modifier` /
  `---@param moreArea number @Multiplicative modifier`. `CalcDefence.lua` has the same shape for Life, Mana
  and Spirit (`output[res] = override or m_max(round((base * (1 - conv/100) + extra) * (1 + inc/100) * more +
  total), 1)`, which also shows an added `extra` landing inside the base before the increases), and
  `CalcPerform.lua` repeats `(1 + inc / 100) * more` for buff and aura effect. `Calcs.lua` only reads INC
  through `modDB:Sum`, and `ModStore.lua`'s `Combine` sends `MORE` to `More()` and everything else to `Sum()`.
- **The cards name that source where a player reads it**, one line on each card: *"How it stacks: according to
  Path of Building's own damage maths. The game never says it."* No file names on the card — the standard is
  that nothing a player reads shows a path or an id.
- **Not claimed:** the PoE2 wiki. It states this too according to second-hand pages, but its own host
  (`poe2wiki.net`) turns the fetch away, so it was never read and is not named on the cards.
- Reached from the text that needs it, through the build-time machinery that was already there
  (`tools/nodelinks.py`), not a runtime parser. A concept card's trigger words sit in `f`, the same field a
  keyword's other spellings use, and `FORMS` now covers both kinds. A word only becomes a door where the line
  uses it as a number — `%` immediately before it for increased/reduced/more/less, line start for `Adds`
  (`gate()` in `tools/concepts.py`) — which keeps prose out: 299 hits left as plain text, 211 of them *more*
  in gem descriptions ("no more than once every 3 seconds", "Duration is lower the more times ..."), and the
  nine real oddities like Skin of the Loyal's "Armour is increased by Uncapped Fire Resistance".
- Counts: **2,586 references on 1,511 cards** (788 passives, 617 uniques, 104 bases, 2 concept cards
  cross-linking). Increased and reduced 2,377 lines on 1,434 cards; Added damage 129 on 112; More and less
  80 on 66. No gem reaches one, because a gem's text is prose and never says "20% more".
- The page draws them as words in the line, never as keyword chips, so nobody reads them as the game's own
  glossary: `.hlink` in `assets/cards.css` is the line's own type and colour with a dotted underline and a
  footnote `*`, against a chip's accent-coloured pill. `assets/app.js` resolves only the `h:` spans out of
  `lx` (`prep`, `lineHTML`); every other reference a line carries stays plain text exactly as before, which is
  a different ticket's job.
- The rest of it behaves like any card because it is one: searchable (a `Concepts` filter chip beside
  Keywords, in `index.html` and `KINDS`), openable from a grid card or from inside another card, on the
  back/forward trail both ways, and no sideways scroll at 375px. No crawler page: `worker/seo.js` publishes
  only the game-data kinds, and `tools/dev/guard.mjs` now reads that list out of `seo.js` instead of assuming
  every kind has one.
- Sizes, against the standing budget of 70 KB compressed for `data/index-core.json`: 63.6 KB -> 66.6 KB
  gzipped (the uniques' own references live in that part). `data/index-rest.json` 291.8 KB -> 296.0 KB.

## Next — The essence tables survive a poe2db redesign

- poe2db took the Essence list out of its tab: the section is now plain `<div id="Essence">`, so the marker
  `tools/craft.py` sliced on (`id="Essence" class="tab-pane`) was not on the page any more. `str.find` returned
  -1, the slice ran backwards from the end and yielded nothing, and the run printed "essences from poe2db: 0".
  The section is now found by `id="Essence"` followed by a space or a `>`, which reads both the old shape and the
  new one. Everything else on the page — the per-essence link, the per-item-class table behind it, the orb and
  bone cards — is unchanged and was left alone.
- The worse half: an empty parse was not a failure. `main()` only fell back to what is in `data/craft` when
  `essences()` raised, and an empty list is not an exception, so a run today would have written every
  `data/craft/*.json` with `"ess": []` and dropped the essence-only mods out of the mods table with them
  (ring.json 246 -> 237). The docstring promised the opposite. Three guards now close that:
  `essences()` raises when the section is missing and again when the page yields no essence it can read, and
  `main()` counts the essence names already in `data/craft` (95 today) and treats a parse under four fifths of
  that as not loaded. All three keep what is on disk and say why on stderr. An empty table is never published.
- Essences that really do leave the game still go: the count only has to clear four fifths, and any name that was
  on disk and is no longer on poe2db is named on stderr rather than dropped in silence.
- `item_levels()` had the same silent-empty hole, and its fallback was dead on top of that. A Greater or Perfect
  orb keeps its level inside its base orb's `up` list, not under a top-level `n`, so `old_lv` never held one and
  the old value could not have been kept even when the fetch threw. `old_lv` now reads the `up` entries too, and
  a level the page no longer shows falls back to the one in `data/craft.json`, per field, with a line on stderr.
- Checked against the live site and against four broken copies of its pages (section renamed, link markup changed,
  only 20 of 95 essences left, level line gone from a Greater orb and a Gnawed bone). The good run rebuilds
  `data/craft.json` and all 31 `data/craft/*.json` byte for byte as they already are in git; each broken run keeps
  the same files untouched and prints the reason. `tools/dev/guard.mjs`: 6 ok, 0 failed.
- Nothing the site shows changes, so there is no public patch note for this.
## Next — "Increased" is not a keyword (checked, nothing changed)
- Reported: passive nodes whose text says "increased" show no Increased keyword. Nothing was changed, because
  there is nothing to attach. The official export's help text — `keywords.min.json`, the same 1,030 entries
  `tools/gamelib.py` reads — has no entry keyed or named *increased*, *reduced*, *more* or *less*. The only
  three terms containing the word are monster modifiers (Increased Area of Effect, Increased Life, Increased
  Stun Threshold), which are fights, not maths. The artifact's own 451 keywords have none either, and the 693
  keyword cards the site ships have none.
- The game never marks those words as a link, so the builder is not dropping one. A card's chips come from the
  game's own `[Id|words]` markup (`refs()` in `tools/sync.py`); across every shipped block of game text there
  is not a single mark whose words begin "increased" or "reduced". Add one and the site would be inventing a
  glossary entry the game does not have, which is the one thing the data rule forbids.
- The size of it, for the record: 1,772 of 5,712 cards say increased or reduced, 744 of them passives.
- What is real, and what could be done about it instead: 249 of those 1,772 cards carry no keyword chip at all
  (31 passives), because the game left every word on them unmarked — "16% increased Cast Speed" marks neither
  Cast nor Speed. That is a gap in the game's markup, not a missing keyword, and the honest fix for it is the
  plain-text pass `tools/kwuse.py` already does in the other direction ("Found on"), turned around to suggest
  chips. If the owner wants players to learn what increased actually does — additive with every other increase,
  unlike *more* — that is a site-written note against a named source (the rule for anything the game does not
  state), not a keyword card wearing the game's voice.

## Next — Back to a card, exactly as you left it
- The trail already kept a `top` per step and put it back, and it never worked: measured on a phone, a card
  scrolled to 371 came back at 0. The line that restores it runs the moment the card is drawn, and at that
  moment the "Found on" list is still the word "Looking…" — its rows come from `data/kwuse.json` a promise
  later. A short card cannot be scrolled to 371, so the browser clamps it to the top, and the rows arriving
  afterwards do not undo that. The card goes back to where it was a second time now, once the rows are in
  (`uses._then` in `assets/app.js`); when the file is already loaded that second go happens before the browser
  paints, so there is nothing to see.
- A step is the whole state, not a scroll number. `saveStep()` is one place, called by both the places that
  leave a card (a new card opened, and the Back/Forward handler), and it takes: the popup's own scroll, the
  "Found on" list's group, the filter you typed in it, that list's own scroll (it is its own scroller above
  760px), and the Trade panel if you had it open. `paintStep()` puts all five back, forwards and backwards
  alike — one path, so Forward has never needed its own code.
- The Trade panel comes back as the panel, not as a new one: the step holds the element, so Back never fires
  a second trade search. Closing it with its own button still clears it from the step.
- The list's group and filter are put back once and then let go, so a group you press after coming back starts
  clean. The keyword-wide memory of the last group used (`USE_TAB`) still applies to a card opened fresh; the
  step's own answer wins over it.
- Untouched: the history entries the trail pushes, Close unwinding all of them, deep links, "Full stats" on the
  drill-down page and that page's own panel. Checked at 375×812 with touch and at 1280×900, three levels deep,
  Back to the bottom and Forward to the top and back down again.

## Next — Bosses: a way in, and a boss in the search
- The tab shipped with no way to reach it. `index.html` already carried the view and `assets/app.js` already
  routed `#/bosses`; what was missing was a door. The only one was a gold button on the Atlas page, so a player
  who never opened Atlas never learned the tab existed, and `assets/bosses.js` was never fetched.
- **The menu.** Bosses joins the second group, after Atlas, on both pages (`index.html`, and the drill-down's own
  header through `mast()` in `tools/sync.py`, with the header-before-this-change added to the chain that tool
  replaces so the next sync still lands). The second group is the look-up group and that is what this is: a list
  you read, not a thing you do. A sixth segment inside the Atlas page would have buried 104 bosses behind two taps
  and a segment whose four neighbours are atlas *items* — bosses are not. One tap from the bar now, and the Atlas
  page keeps its gold button as a second door. `.ti-bosses` is a skull in the same 16px, 1.5-weight, no-fill line
  as the other ten nav icons (`assets/cards.css`).
- **The search.** Bosses are a kind of their own, `x`, declared the way the market's currency cards already are:
  `data/bosses.json` joins the index in `assemble()` (`assets/app.js`), one loop, with the kind's name, its place
  on the home chips, its address and its card owner in the four small tables next to it. No rebuild: the file the
  Bosses tab already reads is the file the search reads, so a `tools/bosses.py` run reaches both at once and
  `tools/sync.py` never has to know bosses exist. 104 boss cards, found by name, by area, and by the words "boss"
  and "pinnacle"; 28 KB, fetched with the rest of the index at low priority, and kept by the service worker.
- **The card is the tab's own.** `OWN_CARD` is one line in `assets/app.js`: a kind whose card its own tab draws.
  A boss opened from anywhere — the grid, the top search box, a deep link — hands over to `assets/bosses.js`,
  which builds the same card the list does (way in, what it drops, the rates and their sources) and hands it back
  to the popup. So the drops open their own cards from the search exactly as they do from the tab, and the popup's
  trail, Back and Forward work on them like anything else. The card carries **Open in Bosses →** unless you are
  already on the tab.
- The rows are built once now (`load()` in `assets/bosses.js`), whether the tab or the search asked for them, and
  they reuse the boss file the search already holds, so nothing is fetched twice.
## Next — Currency: a watch list you can actually build
- The complaint: the Vaal temple currencies were not in the watch list. They were never missing — all seven
  are in the data with real Exchange prices and, four of them, enormous volume (Vaal Armourer's Infuser 67,332
  div a day). The grid just draws the first 48 rows sorted by biggest move, out of 661 the Exchange lists, so
  unless you already knew to type "vaal" in the filter box there was no star to click. Most of the 661 could
  not be reached at all.
- **The picker.** A gold **★ Add to watch list** at the head of the Watch list section opens the site's own
  popup (`openBox`, the one the Suggest box uses), so Escape, the phone's Back and a tap on the dim all close
  it and there is no ✕. Inside: a search box over every row whatever its volume, the group chips, and the
  currencies. A row is the whole tap target — star on the left, name and its kind in the middle, the live
  Exchange price on the right — and a starred row lights up, border and star both, so the state reads at a
  glance. A currency the Exchange has no price for gets no price cell at all, not a dash and not a zero.
- **Groups come out of the data, not out of a list someone has to maintain.** Two rows of chips:
  - the catalogue's own kinds, as the page's filter already used them: Currency, Fragments, Abyssal Bones,
    Uncut Gems, Lineage Supports, Essences, Soul Cores, Idols, Runes, Omens, Expedition, Liquid Emotions,
    Catalysts, Verisium.
  - **families found in the names themselves**: a word at least three names in the group share. A word that
    covers 90% or more of its group says nothing and is dropped (so no "Essence" chip inside Essences), and
    two words that travel together 90% of the time both ways read as one chip — that is where "Soul Core",
    "Uncut Gem", "Reliquary Key", "Crisis Fragment" and "Starlit Ore" come from. Levels in brackets and a
    leading "The" are not words a family can be named after.
- What that actually gives today: **All** → Rune 128, Essence 82, Soul Core 49, Greater 45, Uncut Gem 42,
  Perfect 41, Omen 37, Lesser 34, Orb 32, Ancient 31, Idol 31, Liquid 27, Catalyst 26, Skill 20. **Currency**
  → Orb 32, **Vaal 7**, Greater 6, Perfect 6, Infuser 5, Regal 4, Sacrifice 4, Shard 4, Transmutation 4, and
  four more of three. **Runes** → Warding 17, Aldur 5, Glacial 4, Iron 4… **Soul Cores** → Jiquani 15, Atziri 4,
  Thesis 4. **Fragments** → Reliquary Key 9. **Verisium** → Alloy 13, Crest 4, Starlit Ore 4. Fourteen chips at
  most per group, biggest first.
- Nine rows the Exchange trades carry no kind in the catalogue at all (Stone Rune, Charging Rune, Essence of
  Battle, Lesser Stone Rune and five more). No kind was invented for them: they answer to the search box and
  to their family, and the page's own kind filter no longer draws the blank chip it used to draw for them.
- **Past 48.** The "Show more" row grew a **Show all N** beside it. Every one of the 661 rows draws in about
  half a second on a 375×812 phone profile, with no sideways scroll and no console error; the picker has its
  own "Show all 661" and draws in about 90 ms. On a phone the two chip rows run in one swipeable line each so
  the currencies still start above the fold, and the list scrolls with the popup rather than inside it, the
  same way the card's "Found on" list does.
- **Nothing changed for a watch list already saved.** Same `wi.watch` key, same ids as the card stars. One
  `toggleWatch` now turns a star on or off for both the card on the page and the row in the picker, so they
  cannot disagree — the grid reuses card nodes, so the card's star had to be told.
- Checked in headless Chrome at 375×812 with touch and at 1280×900, against a local server that merges
  `exchange.json` into `market.json` the way `worker/prices.js` does, so the prices under test are the real
  feed: find and star all seven Vaal currencies through the picker, reload, "★ Watching" then lists exactly
  those seven with their live prices, no zero anywhere, "Show all" draws 661, and the picker opens and closes
  by Escape, by Back and by the dim. `node tools/dev/guard.mjs` stays 6 ok, 0 failed.
- Not done: the picker sorts by name only — no "busiest first". Families are one at a time, not stacked. The
  Watching chip counts only stars the Exchange still lists, so a star left over from an older league is kept
  but not counted. No public patch-notes line yet: that goes in with the release.
## Next — Craft: mod weights, and what the game files really carry
- The ticket was "crafting mod weights are required under crafting section": per mod tier its spawn weight and its
  share of the pool it competes in. **The weights are not in the game data.** RePoE's export of the current client
  (game version 4.5.5.2, both `mods.json` and `mods.min.json`) states every spawn weight as 1 or 0 and nothing else —
  7,933 ones and 9,125 zeros across 16,784 mods, no third value anywhere. 1 means the mod can roll on an item with
  that tag, 0 means it cannot. `generation_weights` is empty on every mod; `mods_by_base` carries levels, not weights.
- poe2db says the same out loud on every mod table: "Modifier weight information cannot be obtained from game file."
  The numbers it does print are compiled by Krakenbul from recombinator experiments, and from parsing trade listings
  for bases that cannot be recombined. Measured, not read out of the client — an estimate, so not for this page
  (see `official-data-only`: game files first, and say where a number came from when it is not official).
- So there is nothing numeric to carry: `weight()` already uses the 1/0 as the filter that builds a pool, which makes
  the pool itself the whole of the weight information the files hold. **data/craft.json and data/craft/\*.json are
  untouched — 0 bytes added.**
- And no percentages. With every weight at 1 a share is 1/N and the same for every mod in the pool: an Iron Ring at
  item level 82 rolls 103 suffixes, so each is 0.971% — "+(41-45)% to Fire Resistance" exactly as likely as
  "+(5-8) to Strength". The shares do sum to 100%, and the number is still a wrong claim about the game, so the page
  does not print it. Checked by hand against the export for three classes at item level 82: Iron Ring 203 mods
  (100 prefixes / 103 suffixes), Vaal Cuirass 144 (59/85), Siphoning Wand 185 (84/101) — each pool matches the built
  file mod for mod, and every weight in all three is 1.
- What the Craft page shows instead, both honest and level-aware: the corner of each mod now counts the tiers this
  item level can actually reach — "6 of 8 tiers" at level 40, "8 tiers" at 82, "0 of 9 tiers" for a mod that is out
  of reach — which is the level requirement the ticket asked for, made a number rather than a grey bar on a slider.
  Under the pool, one line: "No roll chances here: the game files say which mods a base can roll at an item level,
  not how often each one comes up." `assets/craft.js` +479 bytes, still lazy-loaded per kind of item as before.
- `tools/craft.py`: `weight()` now records what the export carries and why the page shows no chances, and `scale()`
  prints the weights it saw on every run — "spawn weights in the export: [0, 1] (can roll / cannot: no real weights
  to show)" today, and a loud line the day GGG starts exporting real ones. That is the trigger to build this ticket
  properly; until then the only other route is poe2db's measured table, which is the owner's call, not ours.
- Phone: 375×812 headless Chrome on `#/craft` with an Iron Ring at item level 82 and at 40 — the new count sits in
  the corner the tier count already used, nothing scrolls sideways (0px, and no element past the edge), no console
  errors. Guard: 6 ok, 0 failed, baseline untouched.
- Not done: no public patch-notes line — nothing a player would call a feature landed, and the note on the page says
  the rest. Found on the way and left alone: poe2db's Essence page no longer carries the tab markup `essences()`
  reads, so a run today parses 0 essences and, because an empty list is not `None`, writes every craft file with its
  essence table gone instead of keeping the old one. Raised as its own ticket; the data here was rebuilt, checked
  against that, and restored.

## Next — Bosses: who drops what, and what the way in costs
- The tab itself, after the two commits that built its data (`data/bosses.json`) and its prices
  (`data/bossprices.json`). It sits under Atlas: `#/bosses`, a new route in `assets/app.js` and a new view in
  `index.html`, with no entry of its own in the top bar — the Atlas page carries a gold **Bosses →** button at the
  top of every one of its sections, which is the only way in besides the address. One line in the nav would promote
  it if the owner wants that later.
- `assets/bosses.js` follows `assets/farms.js`: the list is rows rather than cards (104 bosses, most of them only a
  name, an area and a level), each row opens the site's own card popup, and every item inside that popup opens its
  own card on top of it, with Back returning to the boss. The item rows sit in the card's own HTML, so the popup
  redraws them itself on Back; the one click listener lives on the page, not on a card that gets replaced.
- Columns: boss, where, area level, the way in with its real live price, and how many items are known to drop.
  Sorts: name, and the way in cheapest first with the unpriced last. There is no total, no per-kill figure and no
  column that multiplies a price by a rate — the drop rates and the prices never meet anywhere in the code.
- A boss with no drop feed behind it keeps its name, area and level and leaves the last two cells off the row
  rather than filling them with a dash. Chips filter to the game's own pinnacle marking (7) or to the bosses a feed
  covers (10); the search box matches a boss, an area or anything it drops.
- What a boss drops is the drop pool plus anything only the wiki's rate table names (The Aberration, The Bodach and
  The Raven Trickster have no pool at all, so that is their whole card). Each row carries the feeds that named it
  — "Path of Building, Exiled Exchange 2", or "PoE2 Wiki" for a rate-only row — under the item, so the two feeds'
  disagreements stay visible instead of being merged away.
- Rates get their own column, and one line under the table: "Drop rates according to: PoE2 Wiki, patch 0.3.0",
  built from the patch actually stored for that boss (no patch for Zarokh and The Trialmaster, so the line stops
  after the name). The kill count sits on the rate it was taken on, not in that line. A boss with no rates has no
  rate column. The item card repeats the rate and that line when it is opened from a boss that has one.
- Prices: `/data/bossprices.json` first, because it already picked the cheapest base really listed and its null
  means the last check found nobody selling; then the card's own market price. A catalogue row with no price and
  no check behind it is not a price and is left out — that bug showed as "none listed" on items nothing had ever
  checked. `no price` and `none listed · checked 40 min ago` read differently, and neither can sort as free.
- Phone: no sideways scroll at 375px in the list or in a card. The wide five-column table stacks to three lines
  (name, then area and level, then the way in and the drop count) under 760px, and the rate column drops under the
  item name under 640px. `tools/dev/guard.mjs` now opens `#/bosses` in its phone pass, taps The Arbiter of Ash,
  drags across the card and counts the item rows, and measures the tab's sideways scroll (0, against a baseline of
  nothing allowed) — still five checks, still five ok.
- Not done: the boss names are not in the site search. The index is built by `tools/sync.py` from the artifact HTML
  only the owner's machine has, so adding a kind for bosses needs a rebuild the owner runs; the drops themselves
  (uniques, gems, currency) are already in the search. No public patch-notes line yet either: that goes in with
  the release. (Both settled in the entry above: the search reads `data/bosses.json` itself, so no rebuild.)
## Next — What grants what: the first edges of the card graph (#13)
- A card's lines name other cards as text, and the last step marked where those names sit. "This grants that
  skill" is different: the game files state it outright, so it is worth holding as an edge instead of re-reading
  a sentence. It is exact, it works in both directions, and the reverse — "what gives me this skill?" — is a
  question no line on any card answers today. **data/grants.json** (`tools/grants.py`) is that edge set: 452
  edges from 391 cards to 168 skills, and the same 452 the other way round, built in one pass.
- Read from the place the game says it, per kind:
  - **base items** — `skills_granted`: 260 lines on 201 base cards (253 different pairs; a few bases have
    alternates the card prints as "or", and each alternate's skill is an edge of its own).
  - **ascendancy notables** — the passive tree's `granted_skill`: 49 nodes. The tree grants a skill on 54; the
    other five are the Pathfinder concoction choices, which are options inside a notable rather than nodes a
    card could be.
  - **uniques** — the item's own "Grants Skill: ..." line, through the official skill list: the line names a
    skill, `skills.min.json` says which skill that is, and the gem list says which gem grants it. 149 of 150
    resolved that way; one (The Dark Defiler, Skeletal Warrior) has no skill of that name in the files and was
    matched against the gem cards by name instead, and carries a different source because of it.
- **Nothing is guessed.** 13 lines name something two cards could be — Decompose, Spark, Blink, the three
  Heralds, Ember Fusillade, Lightning Bolt — where the game has a plain gem and a second entry made for one
  item, and nothing in the line says which. No edge is written for them; they are listed under "amb" with both
  candidates, so a page can say the files do not settle it and a later run picks it up if they ever do.
- Every edge carries where it came from ("f" the official game files, "w" the item's own wording), with the
  words to print in the file's own "src" table. Both are official today; the field is there so a named source
  that is not can be added later without changing the shape.
- Shipped the way data/kwuse.json is: its own file, ids not names, loaded the first time a card needs it — so
  **data/index-core.json does not grow at all** (63.6 KB compressed against a budget of 70, one byte off what it
  was). data/grants.json is 48.7 KB, 7.4 KB compressed. Nothing on the site reads it yet.
- **33 new passive cards.** The gap report flagged 40 ascendancy notables with no card because the tree gives
  them no stat line, 33 of them granting a skill — and "Grants Skill: <name>" is the line, the same words a base
  item or a unique shows for the same thing. tools/gamelib.py now makes them (a fourth job), with the node's own
  icon from poe.ninja's copy of the tree, so the passive side of the edge set went from 16 cards to 49 and the
  notables are searchable at last. Passives 1,186 -> 1,219.
- Those cards' own lines go through tools/nodelinks.py like any other, so 20 of them link straight to the gem
  they grant (references 242 -> 262, passive -> gem 20 -> 40). The other 13 are the notables the game names
  after the skill itself (Mirage Deadeye, Archon of Chayula): a card is not a door to itself, so the line stays
  plain and the edge in data/grants.json carries it instead.
- tools/gamepull.py pulls `skills.min.json` now (18 files), so the daily pull carries everything tools/grants.py
  reads and no builder fetches on its own; the report's "no tool reads these" list is one shorter for it. Its gem
  row also stops counting the two gems DNT_GEMS drops as a gap — they are not in the game, so they are not
  missing — and the notable gap it flagged is down from 40 (33 granting a skill) to 7 (none of them granting one).
- tools/dev/guard.mjs reads data/grants.json in the raw-code check now, like the other data files. It holds no
  raw key at all: 62 known internal keys, nothing new. Guard: 6 ok, 0 failed; baseline blessed for the 33 cards
  (passives 1,186 -> 1,219, sitemap 6,265 -> 6,298, llms-full 6,256 -> 6,289).

## Next — The lines carry their own links (build side)
- A card's lines name other cards all the time ("Grants Skill: Icestorm", "Zealot's Oath", "You can only Socket
  Ruby Jewels in this item") and every one of them shipped as flat text. The builders now find those phrases and
  write down where they sit, so no card's links are typed by hand and a new card opens its own doors the next
  time the index is built. Nothing on the site changes yet: the browser still reads the same plain lines.
- `tools/phrases.py` holds the matcher both jobs now share. `tools/kwuse.py` had it (whole-word, case-sensitive,
  many phrases at once); it moved out with `find()` unchanged and a `scan()` beside it that takes the longest
  phrase at each place and never one inside another. `tools/kwuse.py` writes a byte-identical `data/kwuse.json`
  after the move.
- `tools/nodelinks.py` is the resolver: 5,070 card names plus the 554 other words the game's own markup shows a
  keyword as, matched over the lines a player reads ("ls" on uniques, bases and passives, "t" on gems). It never
  guesses. One card with that name is a reference; the card's own name is not a door; two cards of one kind with
  that name (Decompose, Herald of Ash, Spark) is nothing; two kinds is nothing unless the line says which kind it
  means, and only "Grants Skill:" does — it names a gem. A keyword is nothing: the card already carries its
  keyword chips, and linking the 13,990 keyword phrases in these lines as well (11,457 references) would put
  `data/index-core.json` at 81.1 KB compressed against a budget of 70. Keyword forms still earn their place by
  blocking: "Endurance Charges" is the keyword, so the notable called "Endurance" inside it is left alone.
- 242 references on 215 cards, in 237 lines: 205 to gems, 17 to passives, 14 to bases, 3 to uniques, 3 to the
  Atlas. 150 of the 163 "Grants Skill:" lines on uniques now name their gem; the 13 that do not are the skills
  the game has two gem entries for. 46 phrases stay plain as ambiguous over 377 lines, the loudest being Shock
  and Freeze (a support gem and an ailment share the name).
- The lines themselves are untouched. A card gains `lx`, one entry per line in the order the card shows them:
  0 where the line has no reference, else `[[start, length, key], ...]` with key an index into a table of node
  keys ("g:...", "u:...", the keys `D.byKey` is built from). `tools/appdata.py` renumbers into a table of each
  part's own when it splits the index, so `data/index-core.json` carries only the 81 keys it uses and
  `data/index-rest.json` the 32 it uses. Compressed: core 63.9 KB -> 65.9 KB (the budget is 70), rest
  280.1 KB -> 281.1 KB. Written as `[text, spans...]` instead, with the text copied a second time, core would
  have been 68.6 KB and could drift from the line it copies.
- Proof nothing moved: across all 5,400 cards in all three files, not one existing field changed value and the
  only new keys are `lx` and `lxk`; 20 item pages across five kinds, rendered through `worker/seo.js` before and
  after, hash the same. `tools/dev/guard-baseline.json` gains one line: the key table holds five passive ids,
  which read as game code in the data and are never shown to anyone.
## Next — Owner dashboard: the blank tabs, and the notes that never came

- Every tab but Overview came up blank on the live site: no numbers, no "No data.", nothing under the tab
  strip. A pane is filled once, while it is still hidden — the panel only opens later — and nothing ever
  wrote it again: showTab() redrew six charts and no blocks at all. Against the answers the live site gives,
  every tab does fill here in headless Chrome; but a pane filled that way rests on one write landing, and if
  it does not, that tab is empty for good, with not even "No data." to show for it. So a tab now draws its
  own blocks when it opens, from the answers already in hand (paint() in assets/admin.js), and blanks() gives
  anything still empty the line it should have: "Loading…" while its part is on its way, the failure line and
  a Retry if that part went wrong, else "No data.". A tab click costs 0-34 ms with a full week in hand.
- Two smaller holes in the same page: the heatmap box says "Loading…" while it loads instead of being an empty
  square, and the row under the notes list is empty again when there is nothing older to ask for — an empty
  answer there was being turned into "No data." under a list that had notes in it.
- /api/admin/suggestions answered `{"list":[],"more":false,"count":{"new":2,"read":0,"done":0}}`: the count was
  right, the notes were gone. A missing `?before=` went through int(), which clamped it to the low end of its
  range instead of saying it was not there at all, so the paging query asked for notes with `id < 1`
  (worker/dash.js). int() now gives null for nothing at all — missing, empty, not a number — and the first page
  asks for `id < 2^31` again. Two other reads get stricter for free: a click spot with no x or y is dropped
  instead of counted as 0, and a note id of null no longer passes for note 1.
- tools/dev/guard.mjs has a sixth check, **dash**. It serves tools/dev/dash-fixture (what the live site answered
  on 21 Sep 2026, saved as it came) to admin.html in headless Chrome, three times over — those numbers, an
  answer with nothing in it, and reads that fail — clicks all eight tabs each time, and fails if any of the 31
  blocks is left empty or draws nothing. It skips cleanly without Chrome, with --no-phone, and against --live.
## Next — No DNT markers in gem descriptions (#29)

- The game files mark text that is not live with `[DNT]` or `[DNT-UNUSED]` ("do not translate"). The site has
  always dropped a gem whose NAME carries the marker, but the marker also sits in the description of gems whose
  name is clean, and a description is printed on the card, on the item page and in llms-full.txt. Eight gems
  showed one there: Atziri's Call, Dreamer's Knell, Greatwood II, Styrn's Anthem, Nadir, His Dark Horizon,
  Kinetic Bash and Fusillade. All eight were on the deploy guard's known-exception list (guard-baseline.json
  `rawText`), which is now empty.
- Each was settled on its own, against the RePoE fork's export, poe2db and the official trade site's own item
  lists, and written down in DNT_GEMS in tools/sync.py:
  - **Atziri's Call** and **Dreamer's Knell** are not in the game. Neither is in the trade site's lineage gem
    list or its item list, the skills they grant are still placeholders ("Fill me in", "Ring Ring but small"),
    and Dreamer's Knell's whole description is the codename "Ezomyte Four". They are not cards any more: the
    rows leave the gem data, the same end as a `[DNT]` name.
  - **Styrn's Anthem** is a real lineage gem — the trade site lists it, and its card's picture already comes
    from that list — but the files hold no description for it at all, only the placeholder "Description". The
    description goes and the card stays, like the 13 other lineage gems the files describe nothing for.
  - **Greatwood II**, **Nadir**, **His Dark Horizon**, **Kinetic Bash** and **Fusillade** are in the game and
    the wording is the real one, word for word what poe2db prints. Only the marker goes. (Greatwood II reads
    like an internal name, but the trade site itself lists the gem under it, so it stays.)
- One more card came out of the same marker: the keyword **[DNT-UNUSED] Edict Declaration**. Its name kept it
  off the crawler pages but not out of the app's search, so build_index now drops a `[DNT]` keyword the way it
  already drops a `[DNT]` gem or passive.
- The fix is at the source, in tools/sync.py, so a data pull cannot bring it back: clean_gems() runs over the
  gem block before anything reads it, and a gem that carries a marker and is not in DNT_GEMS **stops the
  build**, naming the gem and the three calls open to it. A marker that reaches the search index stops the
  build too, beside the existing raw-game-code check. CUT (the `[DNT]`/Removed Skill name test) is now one
  expression instead of three copies.
- A dropped row would have left tools/kwuse.py's check against the artifact's own counts two gems short, so
  clean_gems() leaves the dropped names and their keywords in the gem block under `dropped` — nothing draws
  it, kwuse.py counts it, and the check still adds up ("all left out on purpose").
- The shipped data was patched in place with that same cleaner rather than rebuilt (a full rebuild needs the
  artifact HTML, which only the owner's machine has): data/explore/gems.*.json renamed to its new content hash
  the way externalize() names it (b077d996f1 → 9b8a02fcf1) with explore.html pointed at it and its gem count
  down to 1,072, data/index.json and its two parts (tools/appdata.py), and data/kwuse.json re-run.
- Still there and still hidden behind the name filter, untouched: the 43 `[DNT]`-named gems, 104 passives and
  the placeholder keyword entries in the drill-down's own data, which the guard already knows as internal keys.
## Next — Publish the missing libraries (#11)
- tools/gamepull.py counted the gap; tools/gamelib.py closes the part of it that is nothing but "the game has
  more than we carry". It runs after tools/sync.py (which rebuilds data/index.json from the artifact and would
  drop these cards) and before tools/kwuse.py. Running it twice adds nothing twice; `--report` writes nothing.
- It answers to the same [DNT] list tools/sync.py does. CUT, DNT and DNT_GEMS are imported from there rather
  than written a second time, every card it adds is checked over the same fields (SHOWN_FIELDS, now a name in
  tools/sync.py instead of a tuple written out twice), and every run checks that neither gem that list drops —
  Atziri's Call, Dreamer's Knell — has come back as a card. The gem count names them as dropped instead of
  reporting them as unaccounted for.
- **Keywords: 411 cards -> 693.** The artifact carries 451 keywords; the game's own help text has 1,030 entries.
  282 of them became cards, in the game's exact wording — map and area mechanics (Abyssal Fissure, Invaded City,
  Citadel), monster modifiers (Shroud Walker, Volatile Plants), shrines, medallions, Expedition, strongboxes,
  Sanctum rooms. Every card carries what the card layer already expects: name, "Keyword", the text, an empty
  "Used by" and the Book of Skill image the other keyword cards use.
- Left out, on purpose: 261 entries with no term or no text; 33 whose official text is the game's own tooltip
  markup rather than a sentence (every Expedition rune — `<rgb(...)>{Cold Rune}`; rewriting it into words would
  stop being the game's wording, so they wait for a step that can read those tags); 7 whose name is already on
  another card and nothing in the data says which one a player means (Enraged, Reviving Minions, Shroud Walker,
  Siphons Mana and Deals Lightning Damage); one developer placeholder ("Test"); two [DNT] names.
- 8 more keystones now stand for their own keyword (index "kwx", the rule tools/sync.py already uses): Chaos
  Inoculation, Mind over Matter, Primal Hunger, Trusted Kinship, Conduit, Resonance, Blackflame Covenant,
  Whispers of Doom. A keyword link to any of them opens the keystone card, not a second card saying the same.
- The links go both ways, which is the point: 216 of the new cards link on to another keyword, and 26 cards we
  already had now link to one of the new ones (25 keywords and the passive Way of the Mountain, whose text marks
  Mountain's Teachings). A card's links are read from its own game text, the same rule tools/sync.py uses.
- **Gems: nothing to add, and now it says so every run.** The audit read the gap as 1,072 of 1,191. The 119 are
  45 "Coming Soon" slots (SkillGemUnknown1-27, ReservationSkillGemUnknown1-9, SupportGemUnknown1-9), 71 entries
  named [DNT], the one "Removed Skill" stand-in and the two DNT_GEMS drops. Not one is a gem a player can hold,
  and none may become a card.
- **data/gamestats.json** (4 KB): one monster of each of the 100 levels — life, the life of a monster on your
  side, physical damage, accuracy, armour, evasion — and what each class starts with (attributes, life, mana,
  unarmed hit, attack time and range). The only official answer to "how much do I need at level N". The export's
  own field names are game code, so the file ships plain words. Experience per kill is in the export and stays
  out: the site never prints a per-kill figure. Nothing reads the file yet; that is a later ticket.
- Eight classes, not the export's twelve: Duelist, Marauder, Shadow and Templar have 51 ascendancy nodes each on
  the passive tree and not one of them has a stat line, the same kind of slot held open as the gems above. The
  eight that are in the game have between 27 and 57.
- tools/gamepull.py now pulls keywords, default_monster_stats and characters as site data rather than report-only
  (17 files), and its "no tool reads these" note says what it measures.

## Next — One daily pull of the official data (#10)
- Every tool fetched its own copy of the RePoE fork's export whenever it ran, and nothing ever said when the game
  data moved on or how much of it we do not ship. tools/gamepull.py is the one place that pulls it and counts.
- It pulls the 15 export files the site is built from (plus skill_gems and keywords, which only the report reads)
  with the site's User-Agent, one request a second, three tries with a backoff, and a clear message on failure —
  it keeps the copy it has if it has one, and stops outright if it does not. The copies live in tools/cache/official
  (already git-ignored, the folder tools/sync.py uses), with pulled.json holding each file's ETag, Last-Modified,
  size, hash and dates.
- GitHub Pages stamps its own ETag per server, so the same unchanged file comes back 200 with a new tag on about
  half the requests. A conditional GET is still sent, but the bytes decide what counts as changed: only a file that
  really differs is written, so a re-run reports "0 new, 15 unchanged" instead of inventing changes.
- data/gamedata.json records the public patch (0.5.5), the date the export's files carry and the date we pulled —
  the patch number a player knows, never the internal build, which stays in the cache manifest and the report.
- tools/dev/gaps.txt (and stdout) is the gap report: per kind, how many names the game has, how many we card, and
  a sample of what is missing. Gems, uniques, passives, keywords and the Atlas tree are counted against the export
  minus the names players never see ([DNT] markers, names the game fills in); bases and currency against the
  official trade site's lists, since the export still marks hundreds of old items released. The report also names
  the export files no tool reads at all.
- Nothing else changed: no existing tool was touched, and every data file the site already had is byte-identical
  after a run. gamepull is importable, so moving a tool onto it later is one line (`from gamepull import official`).

### What three reviews found, and what was done
- The page header told every visitor the drop lists were "checked against the game's own drop limits". Nothing did
  that check: `tools/bosses.py` fetches four things and none of them is a drop restriction. The only check that ever
  happened was three items by hand. The clause is gone from `assets/bosses.js` head() and from the file's own
  comment, which now says what the hand-check was.
- "Way in according to: Exiled Exchange 2." credited EE2 with a claim it does not make: item-drop.json names no boss
  anywhere, it lists a pool behind an entry item, and the pool lands on a boss here because two or more of its items
  are ones Path of Building or the wiki already put there (`attach()`, `if hit < 2: continue`). The line now names
  the real chain, and the drop list, joined by the same rule, got one of its own (`dropSrc()`).
- `level` was the *lowest* level across a boss's areas, then printed as a flat fact next to a list of areas it
  contradicted: Olroth read 65 beside "Obscure Island · Kalguuran Tomb" when the Tomb is 80, Count Geonor and
  Geonor read 75 beside The Iron Citadel's 80, and Jamanra's two Copper Citadels (75 and 80) hid behind one name.
  The level now lives on its own area: `boss_rows()` writes `areas: [{name, lo, hi}]` and no boss-wide `level` at
  all, the card's sub line reads "Obscure Island 65 · Kalguuran Tomb 80", the list's narrow Level column reads the
  whole span ("65-80"), and the old "Area level" pill is gone rather than repeat it. There was no Level sort to fix:
  the tab sorts by name and by way in.
- `data/bosses.json` and `data/bossqueries.json` were outside the rawcode guard: `checkRaw` walks a hard-coded list,
  and the tab is a hash route, so its rendered rows are never linted either. Both are on the list now
  (`tools/dev/guard.mjs`), proven by injecting `[Fire|Fire]` into each and watching the check fail.
- A wiki column heading was thrown away whenever it merely *contained* "drop rate", which is how Zarokh's
  `! Item !! Pre 0.3.0 drop rate` became an unlabelled rate on a 0.5.x game. `mode_of()` now strips only the rate
  column's own words and keeps the qualifier, so the card reads "35.5% (31%) Pre 0.3.0". No patch is invented for
  that section: "Pre 0.3.0" is not patch 0.3.0, and it is on every row of the table anyway. The second figure in
  `35.5% (31%)` used to be dropped with no rule; `rate_of()` keeps it in its brackets as written, because the wiki
  never says what it is.
- The one line under a drop table stated a kill count built only from the rows that carry a sample, so on The King
  in the Mists "50 kills" sat above 28 Omen rows that state no sample at all. The sample moved onto its own row,
  beside the mode and the group it already carries; the footer no longer claims one.
- For a unique on several bases `indexed()` kept whichever index row came first, which was the Runemastered variant
  for 7 of the 8 multi-base boss drops: the row read "Keeper of the Arc — Spiritbone Crown" and opened a card titled
  "Runemastered Spiritbone Crown". It now looks for the index id `<name> | <base>` first. `bossprices.json`'s `base`
  (the base it really priced) is shown in the sub line when it differs, as "cheapest on …".
- `serveBossPrices` left `h` out of its SELECT, so `fields()` built no h/sp/ch and a unique opened from a boss card
  had no sparkline, no change badge and no 45-day chart, while the same unique had all three everywhere else.
  `h` is in the SELECT, the Currency Exchange rows carry their own history the way `serveMarket` builds it, and
  `money()` in `assets/bosses.js` no longer has to merge a market row back in.
- The endpoint walked only `access` and `drops`, but the tab draws a price cell for every rate-table item the drop
  pool misses — 61 rows, the whole drop list of The Aberration, The Bodach and The Raven Trickster among them. It
  loops the rate rows too now. Four omens are in neither the index nor the catalogue and still read "no price";
  `price_gaps()` reports them by name instead of staying quiet, which is the honest end of it.
- The 7-day change badge broke every Currency-Exchange-priced row in a boss card: `priceHTML()` returned three
  siblings into `.bo-item`, a three-column grid, so `.chg` became a fourth grid item and wrapped to the next line at
  column 1. Measured at 375×812 on The Arbiter of Ash with a bossprices.json that really carries `ch`: the badge sat
  223px left of its price and 34px below it, on all 15 rows. The three pieces now go out as one `.bo-px` cell; the
  same measurement gives 0 rows off, and the tab still scrolls 0px sideways. The guard cannot see this by itself —
  `/data/bossprices.json` 404s on its own server and the repo's market.json has no prices — so it was measured with
  a stub outside the repo.
- The tab printed the wiki's spelling instead of the site's own: "Emergent instinct" directly above "Emergent
  Protection", opening a card titled "Emergent Instinct". `thing()` returns `found.n` now, `dropsOf()` matches the
  two feeds without case so one item cannot become two rows, and the price endpoint looks the Currency Exchange and
  the unique checks up the same way.

## Next — No game-file text on the cards (#2)
- Brutus' Lead Sprinkler carried "local display grants level X molten shower [1]" on its card, straight from the
  game files. poe2db prints a stat like that when the game has no wording for it: the stat's id written out in
  words with the raw value in brackets. 35 such lines were on 29 uniques (54 lines over 46 rows in the drill-down),
  among them Voltaxic Rift, Facebreaker, Lioneye's Glare, Lightning Coil, Vestige of Darkness, Grand Spectrum and
  both timeless jewels. All of them are art, visual and flag stats: not one has an English wording in the RePoE
  fork's export (all 27 stat_translations files checked, 15,786 stat ids), and the game shows the player nothing
  for them, so there is no honest wording to put in their place — the lines go.
- tools/uniques.py owns that text, so the cleaner lives there: is_raw_line() (a line ending on a bracketed number
  with no capital in it bar the level placeholder X) and clean_lines(), which drops those lines mod by mod and the
  mod with them when nothing is left. parse() and from_summary() run every implicit and explicit line through it,
  and the implicit count is now taken after cleaning, so a dropped implicit cannot shift the Trade button's split.
- tools/sync.py imports clean_lines and runs it over the drill-down's own lines in officialize(), before the
  official ones are matched in, so an item with no entry in data/uniques.json is cleaned too. The next data pull
  cannot bring these lines back.
- Five places in the drill-down's own copy named game code in a sentence a player reads. All reworded in the
  site's words, same facts, no ids: the timeless-jewel lede (the jewel's file name and the stat that picks its
  conqueror — the poe.ninja mention went with it, since prices are the Currency Exchange and live listings now);
  the Gemling flag in the gems foot; the id a Delirium anoint node starts with, in the tree foot; the art folder
  in the uniques foot; and the client build, printed three times, which now reads as the patch a player knows
  (0.5.5), the way the header already shows it.
- The tree foot also claimed about 0.7% of passive lines are shown as the raw id and value. No line on the page
  is any more, so the page stops describing a problem it does not have.
- The keyword popup printed the keyword's own id under its name — every one of the 451, not only the ten
  keystones whose id reads as plain code. The line is now just what it is: "Keyword", or "Keyword · a keystone
  on the passive tree". The name above it is unchanged and nothing else moves.
- Each one is a pair in tools/sync.py TEXT (the three build ones match whatever client build the artifact
  carries, so a patch bump needs no edit), and COPY_IDS at the end of site_scripts stops the build outright,
  naming what it found, if a reworded artifact still carries any of them — including any <code> span the page
  fills in from a value, which is how the keyword id got out. No <code> span is left in the page at all. The
  closed "Technical details" box on the gem and passive panels is the sanctioned place for an internal id and
  is untouched.
- The shipped data was patched in place with the same cleaner rather than rebuilt (a full rebuild needs the
  artifact HTML, which only the owner's machine has): data/uniques.json, data/index.json and its two parts
  (tools/appdata.py). data/explore/uniques.*.json is served immutable for a year, so it was renamed to its new
  content hash (f801baf1f0 -> afc15012da) and explore.html now names that file; browsers get the clean copy
  straight away instead of the cached one.

## Next — Owner dashboard: it cannot freeze any more
- The bug live on 542ec64: the dashboard drew in two big runs (render() then cloudflare()), so the first field that
  was missing threw and everything after it stayed empty — and because cloudflare() was called after render() in the
  same function, a throw in the first one also skipped every Cloudflare block and the first showTab(). That is why
  the owner saw content on the first tab only and a page that looked frozen. Proved by running the live module
  headless against payload variants (tools were throwaway): workers, workers.byStatus, free or totals missing, a
  null click label, plan.links missing, a missing load kind and routes missing each blanked the rest of the page.
- assets/admin.js rebuilt around three parts that never wait on each other: our own count (/api/admin/stats),
  Cloudflare (/api/admin/cloudflare) and the notes (/api/admin/suggestions, which now also sends how many of each
  kind there are). Sign in shows a loading screen — the crest, a poison cloud creeping across a sunken well, and one
  line saying what it is doing — and the panel opens when all three are in, or after 15 seconds whatever happens.
  A part that is still out keeps its blocks on "Loading…" and fills them when it lands; a part that fails or passes
  20 seconds puts "failed" and a Retry in its own blocks only.
- Every block now draws inside its own try/catch (safe()), through helpers that cannot throw on a missing field, a
  null, a number that is not one or a division by zero (arr, obj, fin, share). A block that still fails says so in
  place and the page keeps going. Anything uncaught, from a block or from the window, also goes in one line at the
  top of the page with its message, so the owner can read it out without dev tools. Empty data says "No data".
- The tab buttons are plain buttons drawn before any data, so they work on keyboard and touch from the first moment
  and never depend on a fetch. worker/dash.js: stats, cloudflare and suggestions each answer through own(), so one
  that breaks returns its message instead of an empty worker error page.

## Next — Owner dashboard: everything Cloudflare gives us
- worker/cfstats.js rebuilt around blocks: one breakdown = one named GraphQL block with a scope (zone by date,
  zone by time, account by time, account by date). Blocks go out five per request; a request that fails is retried
  block by block (budget 25 a call, so the worker's subrequest limit is safe), a block the free plan will not answer
  is dropped, remembered in MISS while the worker is warm, and named in `missing` for the dashboard to show.
  reach() probes how far back single events go (range, a week, three days, a day) before anything else, for the zone
  and for Web Analytics on their own. Still one 5-minute cache per range. About 12 requests on a cache miss.
  New: requests and bytes per hour, hosts, methods, cache status, content types per request, HTTP and TLS versions,
  server status codes, data centres (coloCode), device kinds and systems apart, named bots (verifiedBotCategory),
  visitor kinds and threat kinds (ipClassMap, threatPathingMap), bytes and threats per country, encrypted share,
  cached requests; real visitors also per hour and by host; Core Web Vitals split good / needs work / poor per
  metric, time to first byte, and a page load step by step (DNS, connect, TLS, ask, answer, drawn, loaded, full,
  each P50 and P75 from rumPerformanceEventsAdaptiveGroups; those come in microseconds, and a step can honestly
  read 0 ms).
  Checked against the real API with tools/dev/cfcheck.mjs, twice. This plan will not give us: query strings,
  referring hosts per request, networks (ASN), visitor kinds per request, regions, cities, firewall events,
  https or plain, what the request wanted, Cloudflare's own first byte, or the upper-tier data centre. Those blocks
  are gone and the dashboard names them (NEVER). Referrers come from Web Analytics instead, and the Traffic tab says
  that where the per-request table would have been. originResponseDurationMs does answer but we have no origin (the
  worker and its files answer everything) and its quantiles come back 0, so it is left out as well. edgeStatus
  dropped too (the per-day map already answers it). 38 blocks, about 11 requests on a cache miss.
- admin.html + assets/admin.js: tabs (Overview, Visitors, Traffic, Clicks, Speed, Notes, Data jobs, Plan), the last
  one kept in localStorage `wi-admin-tab`. Charts are drawn when their tab opens (a hidden box has no width), and the
  heatmap's page preview only loads on the Clicks tab. Breakdown tables now say how many rows they have, fold away
  everything past the first 10-20 and have a "Show all"; the Cloudflare boxes are built from one BREAK list.
- Notes from players are their own tab with the new count on it, the filter chips and "Load older":
  GET /api/admin/suggestions?before=<id> sends the next hundred, newest first (worker/dash.js).
- tools/dev/cfcheck.mjs (new): runs every block from cfstats.js against the real API one at a time with
  CF_ANALYTICS_TOKEN from the environment, and prints rows and fields back, or Cloudflare's error. No key in the repo.

## Next — Speed (#39)
- Home: data/index.json split for the page by tools/appdata.py (run by sync.py and kwuse.py): index-core.json (u and c
  cards, the kinds' order, atlas names the market must skip, lineage names; ~58 KB br) and index-rest.json (everything
  else, keystone keywords, the core cards' keyword chips; ~253 KB br); items grouped by kind, id left out where it
  equals the name, both parts carry the same id (a mismatch refetches both). index.json stays whole (seo.js, tools).
  app.js: `first` (core + prices) draws the first cards; `ready` (all) gates search, popups and the other tabs; the rest
  starts after the first files. index.html fetches the two first files from an inline script before its styles
  (a link preload was not reused under the service worker).
- worker/prices.js: /data/market.json?part=now (no h/pairs: 68 KB br instead of 130) and ?part=past (only those);
  each part cached on its own. Plain /data/market.json unchanged (seo.js).
- explore.html: the artifact's data blocks moved to data/explore/<name>.<hash>.json (gems, uniques, tree, keywords,
  jewels; cldata dropped); tools/sync.py DATA_JS fetches them (Gems table's files first) and runs the page's three
  scripts in order as their files arrive (WI_DATA.run). inline() turns a written page back into the artifact's form, so
  `sync.py explore.html` still works. Header written complete (section tabs, patch and gem count, top search box,
  Suggest, Patch notes label) and the sections hidden until drawn (bridge.js WI_DATA.show): CLS 1.1 -> 0 (headless
  Chrome, 1366 px). The page's own changelog code removed (notes.js runs that button). The previous data version is
  kept on sync. /explore is always revalidated (_headers).
- sw.js (new, service worker): per-deploy copy (BUILD = the deploy's version id, written by worker/index.js from the
  CF_VERSION_METADATA binding; wrangler.jsonc version_metadata, /sw.js in run_worker_first). Pages and site files come
  from the copy of the deploy the page was loaded with (client id -> deploy kept in cache wi-meta); other pages get the
  network. Precaches the shell and the drill-down data at install (replaces the home page's explore prefetch).
  Unstamped (Pages, local) it does nothing and unregisters.
- Fonts self-hosted (assets/fonts, woff2 from Google Fonts, OFL files alongside): Cinzel (variable 500-700), IBM Plex
  Sans (variable 400-600), IBM Plex Mono 400/500/600; latin, latin-ext and the other subsets by unicode-range.
  Fraunces dropped (unused: theme.css sets --disp to Cinzel). Removed from index, explore, privacy, admin and seo.js.
  Until they load, text uses Georgia / Arial sized to their width ('Cinzel fallback', 'Plex fallback' in theme.css:
  size-adjust measured on the site's own titles and UI text), so the swap moves nothing (CLS on 1.6 Mbps: 0.11 -> 0).
- Layout shift on home: kind chips, Patch notes / Suggest buttons and the top search box in the HTML; the league clock
  and price stamp keep their space; the card grid keeps the footer out of view until the first cards; a search in the
  address (#/?q=) starts with the hero docked. Fog and wisps load
  after the first cards (data-src; each fog layer fades in, a wisp's loop starts when loaded).

## v0.23 — The whole game in one search (19 Sep 2026)
- #37 (helper): tools/morecards.py (called from tools/sync.py build_index): 1,554 base cards (kind b; RePoE bases that are
  also on the trade site's list; requirements, implicits, properties, keywords, official art), 368 atlas cards (kind a:
  333 atlas passives, 16 waystone tiers, tablets, keys/items), 96 extra currency cards (no price). Lineage gems labelled.
  kwuse.py: Bases and Essences groups. Update order after a patch: atlas.py, craft.py, sync.py, kwuse.py.
  seo.js: /bases and /atlas lists, image-code fix (item pages printed short image codes). Sitemap ~6,000 URLs.
- Owner dashboard: Cloudflare section (worker/cfstats.js, secret CF_ANALYTICS_TOKEN, read-only).
- GGG readiness: exact third-party notice in every footer, privacy.html, request tags name a contact (repo issues).

## v0.22 — Real prices only (19 Sep 2026)
- Standard (owner): every price on the site comes from real trade data; if we don't have it, it isn't shown.
- Currency: tools/exchange.py reads GGG's public Currency Exchange feed (web.poecdn.com/api/currency-exchange/poe2,
  hourly digests of real trades per market pair). Price = divines paid / amount bought over 24 h (exalted and chaos
  converted at that hour's own rate). 14-day backfill, then incremental via data/exchange-state.json (on Pages).
  Output data/exchange.json: v, v1h, vol (div traded 24 h), h/ch (daily, 7-day move), pairs, markets.
- Uniques: tools/pricepull.py checks the trade site (online sellers, 10 cheapest) ~58 an hour, oldest first
  (GET /api/prices/state); price = middle of the 5 cheapest, converted at Currency Exchange rates.
- worker/prices.js serveMarket builds /data/market.json from those only (poe.ninja file used for names/icons/text).
  Migration 0006: trade_prices v, h (daily history). Trade-site bulk offers were NOT used for currency (they are
  player listings, not the in-game exchange).
- explore.html (tools/sync.py LIVE): baked poe.ninja prices removed; the page waits up to 3 s for /data/market.json
  and fills unique prices and emotion (anoint) costs before it draws. Tooltips reworded.
- Keywords (#36, helper): tools/kwuse.py -> data/kwuse.json (448 keywords; markup + plain-text word matches with
  NOT_THIS / ONLY_WITH rules; all gems, every unique variant, all passives incl. small ones (xN), atlas, craft mods,
  currency, keywords; alphabetical; no cap; filter box over 30 rows). Also sets the keyword cards' "Used by" counts in
  data/index.json: rerun `python tools/kwuse.py` after tools/sync.py.
- Farms: Cost to run removed (no amounts per map in the sheet; the sum was partial and guessed).
- Currency tab: Flips removed (built on daily averages); Busiest exchange markets added. Footer names the sources.

## v0.21 — Keywords and Crafting (19 Sep 2026)
- tools/sync.py: every gem/unique/passive/keyword in data/index.json lists the keyword ids its game text marks ("kw");
  keywords list the words they show as ("f"); keystones stand for their own keyword (index "kwx"). Keyword cards
  are kept when a gem or notable shares the name (Shock gem vs Shock ailment): 412 keyword cards.
- Popup (app.js): clickable keyword chips on every card; keyword cards get "Found on" tabs (uniques by price, gems,
  passives [notables/keystones], atlas [text match on atlas.json], currency [text match], keywords) with
  "See all in <section>" linking to explore#<section>?kw=<id>. Cards opened inside the popup stack: Back returns,
  Esc/click-off closes all.
- Drill-down (bridge.js): row and keyword clicks open the site's card popup (window capture, stops the page's own
  handlers); "Full stats" opens the page's own panel; deep links mark the row instead of opening it;
  explore#<section>?kw=<id> filters with the page's keyword picker.
- Owner dashboard (#26, helper): /admin (noindex) behind the dashboard password (Worker secret DASH_HASH, PBKDF2);
  first-party tracking (assets/track.js: views, click labels, heat buckets; off for DNT/GPC/bots/frames/the owner);
  worker/dash.js; D1 tables views, clicks, heat (0005). Plan headroom meter vs Workers Free limits.
- Craft tab (#30, helper): tools/craft.py -> data/craft.json + data/craft/*.json per kind.

## v0.20 — Live prices on trade sliders, Farms and Atlas (19 Sep 2026)
- A live league clock in the home page's top bar: how long this league has run and the countdown to the next one.
- Trade sliders now show real prices from the trade site: the colour and the "from ~" price beside each box. Prices update every hour.
- New Farms tab: BawLoch's farming tier list (made for 0.5), with the live cost to run and live prices for what each farm makes.
- New Atlas tab: waystones, tablets, keys and invitations, atlas items and the Atlas tree.
- The Trade page shows popular searches from other players this week.
- Suggest button in the top bar: send an idea or a problem, no sign-in.
- Patch notes on every page.
- The Build tab reads Mobalytics build links too.
- Tick all in every Trade window (uniques, items and your Build gear).
- Pages load faster: browsers keep files, and Gems, Uniques and Passive tree load in the background.

## v0.19 — Forged bronze look and better sliders (19 Sep 2026)
- Cards, buttons and boxes get a forged bronze frame, like the crest.
- Every number box on trade has a slider beside it, with each tier marked (T1 is the best roll).
- Pick Boots, Gloves, Helmet, Body Armour or Shield and tick Armour, Evasion or Energy Shield (hybrids too).
- New tagline: Path of Exile 2, made easier for every kind of player.

## v0.18 — Keybindings, art on every card, easier to find (19 Sep 2026)
- Keybindings: press ? to see and change them. / searches everything, Ctrl + / searches the list you are on.
- List rows glide into place as you filter, like the home cards.
- Official game art on every card: gems, uniques, passives, keywords and currency.
- Plain item pages for Google and AI search, so people can find the site.

## v0.17 — Trade in plain words (19 Sep 2026)
- New Trade page: must have, any of these, at least some of these, add these up, must not have. Opens the search on the official trade site.
- A Trade button on every card's popup, with at least / at most / exactly and item states (corrupted, Vaal, sanctified and more).

## v0.16 — New home: wraeclastindex.fyi (19 Sep 2026)
- The site moved to its own address and got faster.
- Poison theme and the animated W.I. crest.
- A search box at the top of every page (press / to type). Picks open in a popup before you leave the page.

## v0.15 — The header counts the tab you are on (19 Sep 2026)
- Gems shows 1,074 gems, Uniques shows 712 uniques, Passive tree shows 5,152 passives.
- The patch number comes from the game data, so it updates with the data.

## v0.14 — Patch number and gem count (19 Sep 2026)
- The header shows the game patch, 0.5.5, instead of the client build number.
- The gem count only counts gems you can get: 1,074. Cut gems still show when you turn on Show cut content.

## v0.13 — Official roll ranges on every unique (19 Sep 2026)
- Unique mod lines now show the official roll ranges from the game files (as published on poe2db), not the numbers on one market listing. Bluetongue now reads Adds (4-6) to (7-10) Physical Damage.
- 456 uniques changed. Runeforged and Runemastered versions show the ranges of the unique they were forged from.
- Keyword links stay on every line whose wording matches the game's. Two uniques with no official page left keep their market lines.

## v0.12 — No raw game code (19 Sep 2026)
- 40 lines on 34 passives printed raw game code instead of words. Unfettered was one. None do now.
- Where the game prints a line, the page now prints the same line. Nine ascendancy notables now read Grants Skill: …, and Way of the Mountain, Eldritch Empowerment and Endless Munitions show their full in-game text.
- Where the game prints nothing, the line is gone. These are hidden stats, such as the flat Armour on the Body Armour notables, and stats at zero. Searching by stat id still finds them.
- Gems too. Five quality lines printed a template where the gem's own number belongs: Arctic Armour, Eternal March, Frost Bomb, Plague Bearer and Remnants of Kalguur. They now print that number at the chosen gem level.
- Three gems are named after what they hold, and read Spectre: any monster, Companion: any Beast and Soul Crystal: any Undead instead of a blank template.
- Two keystones in the keyword list printed their internal names. They now read Primal Hunger and Trusted Kinship, with the keystone's own text as the definition.
- Internal ids and the game's stat list in the gem and passive panels now sit in a closed Technical details box at the bottom. Nothing in the default view is game code.

## v0.11 — The tree is coloured by its regions (19 Sep 2026)
- 4,060 passives now carry a real attribute colour, taken from where they sit on the wheel. The six class starts form an inner ring about 60° apart — Marauder pure strength, Ranger pure dexterity, Witch pure intelligence, and between them Duelist (strength/dexterity), Templar (strength/intelligence) and Shadow (dexterity/intelligence). Each node takes the attributes of the sector it falls in, so a hybrid region splits its orbs down the middle.
- The earlier “this cannot be derived” finding was my error, not the data's. The first attempt paired the six start nodes with the class list by array position, and those two orders do not align — it had the Ranger start labelled Warrior. That is why strength nodes appeared to cluster around the wrong start. The starts are labelled in the export by their own legacy names; matching on those makes it come out.
- Checked against node content: reading each node's own stats for armour / melee / physical against evasion / projectile / accuracy against energy shield / mana / spell, the theme agrees with its sector's attribute on 1,782 of 1,974 nodes — 90.3%.
- 430 nodes still override the region with an attribute they grant outright. 662 stay hollow: the ascendancy nodes, which sit off the wheel and have no region. Every orb's tooltip says which region it came from, or that the node granted it.
- The orb key is gone. Once the colours mean something on every row, it was just taking up space.

## v0.10 — Anointments, and a correction (19 Sep 2026)
- I under-reported the anoints by fifty times. This page said the tree had 17 anoints. It has 874 anointable notables — GGG's tree export carries a recipe field of three Distilled emotions on each one, and I had not looked at it. The 17 DeliriumAnoint_ nodes are a different thing: notables that exist only as anoints and sit nowhere on the tree.
- New Anoint column: the divine cost of each notable's three emotions, priced against poe.ninja's Forbidden Rites snapshot. Sortable, and an Anointable only toggle sorts cheapest-first on the spot.
- The spread is the point: 0.0008 divine to 7.5 divine, a factor of about ten thousand. Insulated Treads costs 0.0008; Zarokh's Gift costs 7.52.
- Thirteen emotions appear across all 875 recipes. Three of them — Potent Contempt, Ferocity and Melancholy — are used by just 19 nodes between them, and they are the entire reason the dear end is dear. Everything else is priced in thousandths of a divine.
- Opening a notable shows its three emotions with each one's own price and 7-day move, so you can see which leg of a recipe is the expensive one.

## v0.9 — The orb explains itself (19 Sep 2026)
- An orb key now sits above both tables. The previous version shipped blank circles with nothing anywhere on the page saying what blank meant.
- A blank orb meant two different things and was drawn the same way both times. On a gem it is an answer — 207 gems require no attribute at all, and the files say so plainly. On a passive it is a gap — 4,722 nodes have no attribute recorded anywhere. Those are not the same statement and should never have shared a symbol.
- They are now distinct: a solid ring means the thing requires no attribute, a dashed ring means the files state none. Tooltips say which, in words.
- Verified while splitting them: across all 1,146 gems the attribute weights and the attribute tags never disagree, and all 207 blanks carry the colour letter w with no attribute tag — so the no-requirement reading is the data's, not an assumption.

## v0.8 — The attribute orb (19 Sep 2026)
- The bullet on every gem and passive is now an attribute orb on the red / green / blue trinity: one attribute fills it, two split it down the middle, three take a third each.
- This fixed a real error in the gem section. 122 gems carry 50/50 dual attribute requirements — Cluster Grenade is strength and dexterity, Charge Regulation is dexterity and intelligence — and the single colour letter in the files flattens all of them to “Any”. They were showing as grey. They now show as split orbs, and the attribute filter chips match on the actual weights rather than the letter, so searching Strength finds them too.
- Passives: the orb is filled where the node states an attribute — 430 of 5,152, including 9 genuine two-attribute nodes and 312 “any attribute” smalls that take all three. A new attribute segmented control filters by it.
- The remaining 4,722 passives keep a hollow orb whose ring carries the node kind, because the files assign no attribute to an ordinary passive and both reconstructions I tried failed verification: walking the tree out from the six class starts put more strength-granting nodes nearest the Sorceress start (19) than the Warrior start (13), and slicing the tree by angle mixed all three attributes inside single 15° sectors. Colouring 4,722 nodes on either basis would have been wrong more often than right.

## v0.7 — Uniques and the passive tree, rebuilt to the gem grammar (19 Sep 2026)
- Both sections had the gem table's functions but not its design language. Measured: the gem rows carried 236 unit labels and 120 category dots and every row the same height; uniques carried none of either and swung from 61 to 310 pixels a row.
- Segmented controls replace loose chips for picking an item group or a passive kind, matching the gem type switcher. Category dots colour-code the group or kind. Unit labels follow the numbers.
- Row rhythm restored. Modifier and effect text is clamped to three lines with a +n more marker — the full text was always in the detail panel. Unique rows now run 56–78px instead of 61–310.
- Passive duplicates merged by default. The tree carries 293 separate nodes called Attribute, and 3,760 small nodes that are only 1,035 distinct effects. Merged, the tree is 2,404 rows instead of 5,152, with a Copies column counting each one and a toggle to put every node back.
- The tree drops its Internal id and stat-count columns from the table — both are still in the panel — and moves ascendancy under the name, where it does not leave 4,483 empty cells.
- Uniques get a price band: min and max divine sliders, mirroring the gem level and quality sliders. A min-listings control was built first and cut — the median unique has 818 listings, so it filtered almost nothing. Only 8 items have fewer than three listings, and those are greyed out in place instead.

## v0.6 — Keywords, across all three sections (19 Sep 2026)
- Path of Exile 2 writes its own text as [Token|Display], where Token is an entry in the game's keyword glossary. The page was stripping that markup and throwing the keywords away. It now keeps them.
- 451 keywords compiled from every gem, unique and passive line, 445 of them with the game's own definition text. Uniques reference 321, passives 251, gems 263.
- Every section now has a keyword filter with counts, a search box and any/all matching — the same treatment the gem tags already had. Uniques and passives also get a Keywords column you can sort by.
- Every keyword in every line of text is clickable, anywhere on the page. It opens the glossary definition, shows how many gems, uniques and passives use it, and offers to filter the section you are in by it.
- Eight keystone references on uniques — From Nothing and Flesh Crucible point at passives by internal id — are cross-linked to the actual keystone on the tree, so the definition shown is that keystone's real effect.
- Five tokens have no glossary entry at all: DNT-UNUSED, DNT, Blinded and two keystone ids with no matching node. They still filter; they just carry no definition.

## v0.5 — Artwork (19 Sep 2026)
- Gem icons and unique item art, from the game's own extracted Art/ folder on the RePoE mirror — 841 gem icons and 440 item pictures, packed into two sprite sheets so the whole set costs two requests instead of 1,281.
- 1,111 of 1,146 gems and 694 of 712 uniques now carry their picture in the table and in the detail panel.
- No art on the passive tree. The extracted art folder holds only 54 passive icons, nearly all Path of Exile 1 leftovers, and GGG's own tree export ships no sprite sheet — there is no official source to pull node art from.
- Images are served from this page rather than hot-linked: every external image host is blocked here, so anything not embedded would simply not appear.

## v0.4 — Uniques, the passive tree, and this changelog (19 Sep 2026)
- New Uniques section: 712 items — every unique in the game files, with modifier text and divine prices for the 695 that had a market listing. Sort by price, listing count, 7-day move or modifier count.
- New Passive tree section: all 5,152 passives — 33 keystones, 1,288 notables, 17 anoint-only notables, 3,760 smalls — with effects translated out of raw stat ids into English.
- Timeless jewels: the full conqueror table for all seven factions, with each one's seed range and radius straight from the mod files.
- Finding: Vaal, Karui, Maraketh, Templar and Eternal Empire exist in the files with complete conqueror tables, but no Path of Exile 2 jewel carries them. Only Kalguur (Heroic Tragedy) and Abyssal (Undying Hate) have items.
- Finding: the dump's 10,447 unique modifiers are not joined to the items that carry them, which is why modifier text comes from poe.ninja rather than the game files.
- Not built: a timeless-jewel seed calculator. The seed-to-passive rewrite table and the keystone each conqueror grants are both absent from the dump.

## v0.3 — Gemling view (19 Sep 2026)
- Gemling view toggle: three Skill Gem Quality nodes at +2% each raise the quality ceiling to 26%, and the Implants nodes add +2 levels to Strength, Dexterity and Intelligence gems. White gems belong to no attribute and correctly get nothing.
- Gear steppers for the two real ceilings in the mod files: the of Kurgal amulet suffix at +5% and a +10% unique mod, taking quality to 31% and 36%.
- New Level used column showing the gem level each row is actually read at.
- Fixed: a missing damage_multiplier at a level means 100%, not missing data. Reading it as absent made the damage column fall through to a different component of the same skill — Boneshatter's scaling compared its main strike at level 20 against its shockwave at level 1 and printed 1.56× instead of 3.12×. 29 gems were affected.
- Not modelled: the Gemling notable Advanced Thaumaturgy sets a flag nothing else in the dump refers to.

## v0.2 — Quality (19 Sep 2026)
- Quality slider, 0–20%, with every quality line recalculated live.
- Quality bonus selector: quality bonuses are different stats in different units, so sorting them all together compares nothing. Pick one bonus and the table narrows to the gems sharing it, then sorts by size.
- Scale worked out and checked: a quality line's stored number is the stat's raw value per 1% quality times 1000. Confirmed on two stats with unrelated units — Boneshatter's attack speed and Arc's chain count.
- Finding: no support gem in the game has quality, and only 357 gems have a quality line at all.

## v0.1 — Gem index (18 Sep 2026)
- Every skill and support gem at game build 4.5.5.2 — 469 active, 44 spirit, 633 support — with each gem's own level table from 1 to 40.
- Sorting on tags, cost multiplier, damage multiplier, spell base damage, crit, cost, spirit and level scaling.
- Cut and unused [DNT-UNUSED] content hidden behind a toggle.
- Finding: support gems have tiers, not levels. Finding: attack damage % and spell base damage never appear on the same gem.
- Verified against poe2db on eight gems.

## Since then

- Live prices are pulled on GitHub (tools/pricepull.py, hourly, spread over ~55 min) and sent to
  /api/prices/ingest with GitHub OIDC; Cloudflare egress IPs were rate limited by the trade site.
- Caching: _headers (2 min code/data, 1 month brand art), preload index/market, prefetch /explore when idle.
- Online sellers only is unticked by default (trade panel and Trade page).
