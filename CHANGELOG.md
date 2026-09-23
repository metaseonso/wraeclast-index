# Changelog (internal)

The full list of changes. The public patch notes (data/changelog.json, shown on the site) stay short.
Add the details here first, then a short public line there.

## Next — What is still open in a build, and Build it

- Ticket 55, the Build tab's second function: the build you already have. The page read a Path of Building
  code and said what to buy next. It now also says **what is still open in it**, and **Build it** prices
  every piece of it.
- **What is still open** — the slots Path of Building itself lists empty, the jewel sockets the tree gives
  that nothing is in, the affixes each item still has room for, the augment sockets still empty, whether an
  ascendancy has been taken, and how many supports sit on the main skill. Every cap is the game's own, off
  `data/craft.json` through `assets/basepool.js` — the same file and the same reader the Trade page and the
  bench use, so one number is never written twice. A base that moves its own cap says so on the item
  (`+1 Prefix Modifier allowed`), and that line is read off the item rather than assumed.
- **Two numbers are not printed, because nobody published them.** How many supports a skill socket takes is
  in no file the site reads (docs/proposal-builder.md, 1.4), so the supports are counted and no cap is drawn
  against them. Passive points unspent is a floor, not a figure: levelling gives one point per level and
  quest points come on top, so it is only ever said where the tree holds fewer passives than levelling alone
  has given.
- **Build it** — every piece of the build as a card, with what the market asks for it today and the total of
  the ones it prices. The total says *Priced 16 of 25* beside itself rather than quietly leaving the rest
  out, which is the rule the builder already keeps (docs/proposal-builder.md, "Why the budget is not money").
- **Real prices only.** A price is the in-game Currency Exchange feed or a live trade listing and nothing
  else. A rare and a magic item are not listed things, so they carry no price ever and the panel says so in
  words. A unique the market has no listing for today shows no number at all — *The Bringer of Rain* on the
  build tested carried no price and drew none.
- **The pieces worth making rather than buying carry the bench.** A piece the market will not sell is a
  piece you make, so its card carries a button that opens the crafting bench on that base — the bench's own
  `openBench`, on the base card out of the index, never a second bench.
- **The trade link is the trade panel's.** A piece's card carries Trade, which opens the panel that turns an
  item's own lines into the search the trade site reads (`assets/trade.js`), already open. A rare goes out
  as its base type with rarity narrowed; a unique goes out by name and base. Nothing here builds a second
  query and nothing here knows the trade site's shape.
- **Price action is a card's own chart**, lifted out of the popup and named: `detailExtras` in
  `assets/app.js` now draws wherever a price is drawn. This league's line, the leagues before it behind it
  each in its own colour and dash, poe.ninja named where a past league is theirs, and under it where the
  price came from — how many are listed, or how much traded on the Currency Exchange in 24 hours.
- **No new component.** A piece is a card, its price line is the card's, its chart is the card's, Trade is
  the trade panel, Bench is the bench, the summary is the build summary's own grid. The only markup written
  for this is the rows of the two panels.
- **The offence / defence / neutral pass is not here.** It is its own module and is called where it ships:
  the Build tab hands it the build, what the numbers said and what is still open, and leaves it a box to
  draw its own control in. Without it the page stands as it is.
- Two things the tab got wrong before and now does not: Path of Building writes its slots in whatever order
  they were last touched, so the gear read as a shuffled list and is now in the order a character is worn;
  and a gear card handed the trade panel its lines without saying how many of them were implicits, so an
  implicit was searched for as a modifier.

## Next — Every interaction the game's wording names, and a way to settle the ones nobody has

- Ticket 58. The keywords were mapped and the interactions were not. "Recovery from your Life Flasks cannot
  be applied to anything other than you" names three of them — a recovery, an exclusion, a condition — and
  every one of those words sat as plain text.
- **Half one: the inventory.** `tools/interactions.py` reads the game's own wording across every line the
  site shows (uniques, bases, passives, gems, keywords, the Atlas, currency and our own cards) and settles
  each site into exactly one bucket. **3,819 sites in 9,627 lines: 516 open a card that already answers them
  (a keyword card, or a mechanics card), 3,225 are marked unclear, 78 are spoken for by a rule the frame
  already settles, and 0 are left plain.** The three "spoken for" reasons are counted apart — 28 read on the
  very card that answers them (a card is never its own door), 23 the game has an entry for and its own markup
  does not mark here, 27 under a phrase two cards answer to. The guard's cards line carries the count every
  run and **fails on a site left plain**, so a new patch's wording cannot go by unread.
- **Thirteen interaction cards**, kind `q`, one per open question, in the five families the game's wording
  takes: Recovery and Regeneration (recovery); Converted and gained (conversion); What sets it off (trigger);
  While it holds, Only if, Against whom, What it applies to, Stacking and counting (condition); Cannot,
  Instead of, Immune and unaffected, Other than (exclusion). Each states what the game states, then the line
  that begins **"Not settled:"**, and names its source as the game for the first part and nobody for the rest
   — which is the whole point of the card. Its sub line reads "Not settled · <family>".
- **A mark of its own.** `words.mark` gained a third value, `open`: the word with a question behind it, never
  the footnote a card that answers wears, so a player can tell an answer from an open question before
  pressing either. Nothing is written into the index for these words, the way nothing is for a keyword: the
  page marks them as it draws (`assets/marks.js`), off the same declaration.
- **Half two: what players report.** An interaction card takes an answer, and it travels the path a note from
  the Suggest button already takes — the same table, the same rate limit, the card key beside it. Migration
  `0010_clarify.sql` adds four columns to `suggestions`: `lean` (works / no / unclear, and the only thing
  that makes a note an answer), `who`, `src` and `shown`. **It needs applying.**
- **Which way it leans and who weighed in**, never one answer standing in for the rest: the lean is a tally
  with all three sides drawn, and each name sits beside what that player said and where it came from. A row
  the owner has checked is marked **Checked by us**; one taken down is on the card no more. What a player
  wrote is under its own heading and says so — "Players' own words, not the game's" — and the note's own
  words stay on the owner's dashboard, as they always have.
- **A heatmap** of how often each open interaction is answered at all, every one of them at once, busiest
  first, each cell the card it counts — so the ones that matter rise and are one press away.
- **What it feeds.** `assets/clarify.js` exports the hooks the builder's maths and the bench read:
  `open()` every open interaction, `openIn(text)` the ones a piece of the game's own wording names (so a
  range that depends on one is widened and the interaction is named rather than a number invented),
  `assume(key, how)` and `assumption(key)` for carrying on as if it works or as if it does not, and
  `reported(key)` for what players have said. `data/interactions.json` carries the same list for a build
  step. The card's own "Carry on as if" pair is the player's end of it.
- **`tools/map.py`'s `Marks`** now reads which of a kind's words are doors off the kind declarations instead
  of naming kinds itself, and honours each card's own gate — so the picture counts the interaction words,
  and the mechanics words whose gate is `any`, which it was missing. The map is 10 kinds, 6,690 dots and
  28,421 lines.

## Next — Found first: a rich result for anything in the index, and terms that ask to be cited

- Ticket 68. The 7,200 crawler pages already carried the words. What they did not carry was the structured
  data a search engine draws a result from, so every one of them came back as a blue line. Every page now
  answers the four questions a result is made of: what the thing is, what it looks like, what it costs today,
  and where it sits.
- **The type is a declaration, not a test.** `KIND` in `worker/seo.js` gained `is` — the schema.org type a
  kind is read as — and `unless`, the one test a kind needs where its rows are not all the same thing.
  A kind that can be held, dropped and traded is a **Product**: uniques, gems, base items, currency and the
  Atlas's own items. A kind that is a name with a meaning behind it is a **DefinedTerm** in the set its list
  page stands for: passives (the table already says a keystone is its own keyword) and keywords. The Atlas is
  both, so it is the only kind that carries `unless: {at: 'at', is: 'tree'}` — a waystone is an item, a node
  on the atlas tree is not. `itemPage` asks the table and tests no kind of its own.
- **The art.** `image` and `primaryImageOfPage` are the card's own picture, and a page that has one now says
  so in `og:image` too, with `twitter:card` dropping to `summary`: a link to Bluetongue previews Bluetongue
  instead of the brand card. A page with none keeps the wide brand card.
- **The price**, off the same market row the card draws. The Currency Exchange is one market at one rate, so
  it is an `Offer` with `price`; trade listings are many sellers, so they are an `AggregateOffer` with
  `lowPrice` and `offerCount`. The money is the game's own and it is named in full — `"Divine Orb"`,
  `"Exalted Orb"` — because no ISO 4217 code stands for a divine orb. schema.org allows a currency's own
  name; Google's price chip wants the three-letter code, so it will not draw one. The price is in the
  description either way, which is what a snippet reads. A passive with no price of its own now carries what
  the anoint costs in its description, the same figure the card shows.
- **Where it sits.** The breadcrumb was two rungs (the site, the list); it is four — the site, the list, the
  thing's own group on that list, and the thing. The group's rung links the section anchor the list page
  really has, since the crumb, the jump chip and the section id all read one `anchor()` now. A group that
  goes by its list's own name is dropped, so the trail never says "Currency › Currency".
- **The rest of the graph**: an `Organization` publisher with the logo, the `SearchAction` the home page
  already declared, `mainEntity`, `dateModified`, and the card's facts as `PropertyValue` rows — the gem's
  requirement at level 20, its use time, cost and Spirit; a unique's and a base's requirement and each of the
  game's own "Name: value" property lines; a currency's drop level. List pages carry an `ItemList` of their
  groups, and a list of terms is also the `DefinedTermSet` its rows say they belong to.
- **What each kind renders as**, checked page by page: gem → Product (+AggregateOffer where a lineage support
  is listed), unique → Product + AggregateOffer, base → Product, currency → Product + Offer, atlas item →
  Product + Offer, passive → DefinedTerm in Passives, atlas passive → DefinedTerm in Atlas, keyword →
  DefinedTerm in Keywords. Every page also carries WebSite, Organization, VideoGame, WebPage and
  BreadcrumbList.
- **The one gap.** 1,044 of 1,072 gems and 692 of 710 uniques have no picture a crawler can fetch: their art
  ships as a cell of a shared sprite sheet, and a cell has no URL. Those pages get a Product with no `image`,
  which is a Product snippet Google will not draw. `tools/sync.py` already resolves a per-item URL for both
  kinds and only skips it because the card has a sprite; a side file the worker reads would close it without
  putting 400 KB of signed links into the index the first paint loads. Raised as its own ticket.
- **The terms.** Four lines, word for word in `robots.txt`, `/llms.txt` and `/llms-full.txt`, and said again
  on every page as `creditText` (naming that page's own canonical URL) and `usageInfo` (pointing back at
  `/llms.txt`):

  > Free to read, free to quote, free to build on.
  > An answer built on this data should name Wraeclast Index and link the page it came from.
  > One page per thing, one canonical URL per page: https://wraeclastindex.fyi/item/&lt;name&gt;.
  > A request, not a licence: nothing here enforces it, and nothing is held back from anyone who ignores it.

  It is a request and it says so in its own fourth line. Nothing about it is enforceable: no crawler is
  blocked over it, no page is withheld over it, and a machine that ignores it gets exactly what one that
  obeys it gets. What it can do is make the credit the short way round — one wording wherever a machine
  looks, and one canonical URL per thing so there is an obvious thing to link. `llms-full.txt` now says
  outright that the second line of every entry is that thing's canonical URL.
- Whether it worked is already counted: the dashboard's **Crawlers by name** reads the user agent
  (`worker/cfstats.js`), so Googlebot, GPTBot, ClaudeBot, PerplexityBot and the rest are each a row with a
  kind beside it. Search Console will say the rest — Product snippets and breadcrumbs, valid and invalid.
- Checked with a local validator written against schema.org's own rules (every type known, every property one
  its type really carries, every `@id` landing on a node in the graph) plus Google's required fields for
  Breadcrumb and Product: 12 item pages, one per kind and per shape, and all 7 list pages, all valid. The
  sitemap parses as XML at 7,223 URLs; `llms.txt` holds its 16 links and `llms-full.txt` its 7,214 items,
  neither shrunk. guard 8 ok, 0 failed. `npx wrangler deploy --dry-run` builds.
## Next — Bosses: is the kill worth it, and how much of it is luck

- **The meter.** Ticket 59. A boss card priced the way in and the drops and never said whether killing it
  paid. It does now: four rows a run — **Way in**, **A kill**, **An hour**, **Settles** — inside the card's
  own frame, `assets/bosses.js` and a `.bo-roi` block in `assets/app.css`. No new component, no new job, no
  new file: the figures are worked in the browser out of `data/bossprices.json` and `data/bosses.json`, both
  already loaded by the tab.
- **Every rate is a range.** A rate is what a sample landed on, so each one draws its 95% Wilson band on the
  sample the wiki took, and the band is shown wherever the rate is: `42% · 31%–54% over 71 kills`. The wiki's
  own shapes are all kept — a number, `~1.5%`, `23-34%`, `19.5% (17%)` — and a ceiling (`<1%`) keeps the
  wiki's ceiling and takes no band, because nothing was counted to widen.
- **What is counted, and what is not.** A rate row with no sample and a drop with no real price are both left
  out and named under the rows: *Left out: 28 with no sample.* Of 116 rate rows in the file, 82 carry a
  sample. A boss with a rate table the wiki never counted draws the four rows saying `no sample` and no
  figure; a boss with no rate table draws no meter at all. **9 of 104 bosses draw one**, and the tab says so
  under the list.
- **A run is one way the fight is done.** The wiki splits a boss by mode (the Arbiter is Regular or Uber) and
  by the condition it writes into a group (*If the ring is taken immediately…*); a row that names neither
  belongs to every run. Two runs are never added together — that would count one drop twice — so the Arbiter
  and the Vessel each draw two meters.
- **The way in** is the cheapest entry that is really priced, named on the row, with how many priced entries
  there are. How many of one an entry takes comes off the item's own line and nothing else: *Combine 300
  Splinters* makes Xesht's cheapest door 300 × 0.005276 = **1.58 div** against 8.90 for the key.
- **The arithmetic**, worked on Olroth, Origin of the Fall (PoE2 Wiki, 71 kills, patch 0.3.0; prices the site's
  own, 23 Sep 2026). Wilson at z = 1.96 on 42% over 71 gives 31.2%–53.6%; 12.5% gives 6.7%–22.2%; ~1.5%
  gives 0.28%–7.7% — a 28-fold span, which is the point. Times the price of each drop and summed, a kill is
  **21.6 to 60.2 div**, against a 3.73 div key. The point rates give mu = 37.65 div and, each drop counted on
  its own, sigma = 77.13 div — Uhtred's Exodus alone (18% of 198.3 div) is 5,804 of the 5,950 variance. So
  n = (1.96 × 77.13 ÷ (0.25 × 37.65))² = **259 kills**, 43 hours at 6 an hour. For one drop that same sum is
  1.96/√k: 61 of the thing seen, the table in `docs/proposal-farms.md`.
- **Kills an hour is the player's**, 1 to 30 on a slider, kept in their browser (`wi.bosskph`) and never ours.
  It moves the two rows that stand on it and nothing else; the card's own copy is rewritten with them, so a
  step back and forward comes back at the number they set.
- **The rule this ticket is bound by** is unchanged: no value per kill, ever, as fact. Nothing here is a
  single number, every rate names the PoE2 Wiki and the size of its sample on screen, the hours-to-settle sits
  beside the money so a player can see how much of it is luck, and where the sample is missing the meter says
  so and draws nothing.
- Checked in headless Chrome at 375×812 touch and at 1180 desktop, against this worktree's files with the
  site's published prices: Olroth's range, source and settle figure; Zarokh's four rows saying `no sample`;
  Akthi drawing no meter; the slider moving 6 to 12 and holding through Back and Forward. No console errors,
  nothing scrolls sideways. guard 8 ok, 0 failed.

## Next — Attack Speed is a card, and every phrase like it is counted

- **The card.** Ticket 66. Five small passives answer to the name, so `tools/nodelinks.py` left the phrase
  plain rather than guessing which one a line meant, and the Craft page's "Reads with" had nothing to offer.
  The answer is the card: one kind `h` row in `tools/mechanics.py`, no card code, and the phrase has one
  place to go. It is a door in 188 lines on 178 cards, and "Reads with" fills on its own.
- **What it says**, in the game's order: where an Attack's base time comes from, that the increases sum and
  the more multipliers multiply the *time* and not the damage, that Skill Speed joins that sum, that an
  Added Skill Use Time is added after it and is never shortened, that a Slow is its own multiplier, that the
  Crossbow reload reads Attack Speed too, where the two decimal places bite, and where the rate stops.
- **Where the numbers are from.** The game for the Attacks, Spells, Base Skill Attack Time, Added Skill Use
  Time, Skill Speed and Slow entries; Path of Building for the order, the rounding and the cap, named on the
  card in its own line. `output.Speed = 1 / (baseTime / round((1 + inc/100) * more, 2) + added use time)`
  with `baseTime = 1 / source.AttackRate`, the Weapon's own rate being
  `round(AttackRateBase * (1 + AttackSpeedInc / 100), 2)` in `Item.lua`, and the cap
  `m_min(output.Speed, data.misc.ServerTickRate * output.Repeats)` with `ServerTickRate = 1 / 0.033`. The
  worked example is the site's own data: a Shortbow is 1.25 Attacks per Second, Quill Rain is a Shortbow
  with 100% increased Attack Speed and is 2.5 — the same unique the more and less card already uses.
- **The sweep that came with it.** Every phrase in the same shape — a name only the tree's small passives
  hold, so no card opens — counted over the whole index: **94 phrases in 1,468 lines on 1,204 cards.**
  Three are mechanics worth a card (Duration 170 cards, Area of Effect 116, Cast Speed 82), 13 are already
  on the list in `docs/mechanics-cards.md`, 35 carry a keyword the game defines and the page already marks
  it inside the phrase, and 43 are a stat whose behaviour the increased and more cards already give. The
  three, their sources and the Duration and Area of Effect breakpoints are written into that doc.
- guard 8 ok, 0 failed. Card count 8 -> 9 mechanics cards, baseline blessed for that one line.
  `data/index-core.json` 69,530 -> 69,746 bytes gzipped, `data/index-rest.json` 366,125 -> 367,216.
## Next — Real prices for base items

- The Craft tab's *Cost right now* priced the orbs and said nothing about the item. `data/market.json` priced
  currency and uniques only, because nothing ever asked the trade site what a base costs. It does now, the
  same way everything else on the site is priced: real listings, no estimate anywhere.
- **Which bases.** 1,554 of them is more than a day of checks allows, so `tools/baseprices.py` ranks them and
  writes `data/basequeries.json`. The rule: a shape is an item class and the defences its bases come in — a
  body armour of evasion and energy shield is not a body armour of armour, and nobody shopping for one takes
  the other — and the list is every base standing at the top drop level of its shape. Every base at that
  level, so two that drop together are never split by a tiebreak. 62 shapes, **108 bases**. `LEVELS` widens
  it: 2 takes the top two levels of each shape (201), 3 the top three (304).
- **Which price.** The white one: rarity `normal`, sellers online. A rare of that name is another item at
  another price on the trade site and is never counted in. The row carries `as: "white"`, so the card prints
  the word under the price and the popup reads `7 white listed on the trade site · checked 2 h ago`. The
  Craft tab's block names it the same way: `Aegis Quarterstaff white — 3 ex`, first, above the orbs.
- **The budget.** The hour holds 88 checks and every kind takes a share in proportion to what it has waiting,
  so the pass went from 798 things to 906: a full pass every 10 hours where it was 9, and a unique's share of
  one run from 71 checks to 63. Every kind comes round about an hour and a quarter later than it did, and the
  24 hours the site promises hold with 14 to spare. All 1,554 would not — 2,352 things is a 27-hour pass.
- **Nothing listed is no price.** A check that finds nobody selling writes an empty row: no value, no point on
  the day's line, no row in the Craft block and no price on the card. Never an estimate, never yesterday's
  price drawn as today's. The list itself is under the last-good rule (`tools/lastgood.py`): a patch that
  empties the craft tables keeps the committed list, goes red and raises a `data-fault` ticket.
- Plumbing: `base:<name>` keys in `trade_prices` (`worker/prices.js`), a `Base item prices` job in the watch
  (`worker/health.js`, late after 6 h like the rest), and the two trade kinds now age separately in
  `/data/market.json` so a kind that has stopped cannot hide behind one still running. The card needed no new
  field — `b:<name>` is the key `priceOf` already looks under.
- Checked in headless Chrome at 375×812 touch and at 1280: the Craft block and the base card both draw the
  price, a base with nothing listed draws none, no console errors, nothing scrolls sideways. guard 8 ok.

## Next — Craft: the page the canvas drew

- The tab shipped with the right structure and the wrong layout. This is it laid out the way the canvas has
  it, in the site's own tokens and components — no colour and no font came off the artboards.
- **"What can this base roll" is three columns.** Left, *What are you crafting*: the search, the chips of the
  kind in hand's own group, and the bases as cards (`Lv 67 · 158 mods`), the base in hand always one of them.
  Middle, the item over its pool: the base, `Open card →`, the base's own lines, and the item level the whole
  screen is read at. Right, *What puts it there*: what is guaranteed on this base, the orbs that can add one,
  what each costs right now, and under them the mechanics that were the middle column before.
- **The pool is rows, not a table of controls.** One row per modifier: the best roll this item level can
  take, its share of its own side as the number on the right, and one line under it —
  `weight 8,085 · 10 tiers · from ilvl 81`. Likeliest first, twelve a side, then `N more suffixes · Show all`.
  The row opens on the tier picker and the Add button it always had, so nothing that shipped was lost.
- **"How do I get this mod" leads with where it rolls.** A ranked table — item class, best tier, the item
  level that tier needs, share — best first, and picking a modifier lands on the kind of item it rolls best
  on, so the screen answers before anything is chosen. Under it, *What guarantees it*: the essences that put
  that very line on and the omens that hold the next orb to its side, whatever the item. Beside it, *The mod*:
  the roll, its side, its tags, the tier ladder down to T8 with the level each one needs, and the trade search
  for the modifier alone. Then *Reads with*: the cards the line's own words lead to, found the way every other
  line on the site finds them (assets/marks.js).
- **The numbers for the table are built, not fetched.** `tools/craftmods.py` already turns the 31 item class
  files inside out; it now also carries, per kind of item, the best tier's own wording, the level it needs and
  its share of that side at the highest item level. 59 KB → 113 KB, 16 KB over the wire, and still nothing in
  first paint — against 1.5 MB of class files the browser would otherwise have had to fetch to rank 16 kinds
  of item. Shares are Craft of Exile's measured weights, named on screen; tiers and levels are the game files.
- **The copy is the game's.** Empty states are "No modifier selected." and "Select a kind of item.", not a
  sentence about what a panel is for. "Pick an orb to see what it can add", "Pick a modifier and this is
  where…", "Try one word off the line itself" and "Drag to pick a tier, then Add" are gone.
- Kept: the segmented switch, the plan in the address, the ways into the bench, one job per screen on a phone.
  The phone leads with the item and its level, then the way to another base, then the pool, then the rail.
- Checked in headless Chrome at 375×812 touch and at 1440: no console errors, nothing scrolls sideways,
  nothing under 44px on the phone. guard 7 ok, simcheck 2 ok.
## Next — Trade: a search obeys the same rules as the item (ticket 65)

- The fault. #44 narrowed the Trade page's mod list to what the chosen base can roll and stopped there. The
  page knew **which** modifiers a base has and nothing about **how many of them one item can carry**, so a
  player could ask for five prefixes on a base that holds three, two modifiers out of one group, or a tier
  no item of the level asked for can reach. The trade site answered with nothing and the page never said why.
- **The rules are the bench's, and there is still one copy of them.** `assets/tradepage.js` imports
  `assets/engine.js` — the file `tools/dev/simcheck.mjs` measures over 250,000 rolls a class — and asks it:
  `newItem` builds the item the search describes, `addMod` puts the must-have lines on it, `candidates`
  answers what will still go on, and where the answer is no the wall is named by the same four the engine's
  own pick reads: `heldFams`, `heldGroups`, `capFor` and `lvlOf`. Nothing about a cap, a group or an item
  level is written down in the Trade page.
- **Every base the search covers.** One item is built per pool and per pair of caps the bases in scope come
  in, because a base's own implicit moves a cap (a Dusk Ring is 4 prefixes and 2 suffixes where the class is
  3 and 3) and two bases of one kind do not always roll the same pool. A whole kind is every base of it: what
  one of them can carry, the search can find, so "any Ring" with four prefixes is never called impossible.
- **What it says, and where.** A line the item cannot carry stays in the search, keeps its slider, and says
  the fact under it: *"Prefixes are full."* · *"This and +# to Level of all Spell Skills cannot sit on one
  item."* · *"Rolls from item level 16."* · *"Item level 60 rolls this to 35."* · *"Only a corrupted item
  carries it."* · *"A Normal item carries no modifiers."* A group of "some of these" says how many of them
  one item holds. The note by the Open button says the whole of it: *"No item carries all of this. The search
  finds nothing."*
- **Nothing is ever taken out of the search.** The query the page hands the trade site is the one the player
  built, wall or no wall. Beside each fact is the one tap that settles it — **Drop it**, **Item level 82**,
  **Ask 45**, **Ask 3**, **Corrupted: Any** — and the "Narrowed to" note's own ✕ turns the whole thing off,
  exactly as it already did for the mod list.
- **What excludes what.** A line this base only ever has from a desecration or a corruption, against a search
  that asks for an item that was never corrupted: the step that offers one is the engine's `take`, so the
  page runs it on a copy of the item and reads `corrupt` off the result rather than keeping a rule of its own.
- **The item level is a floor, not a wall.** "Item level at least 60" is a minimum on the trade site, so a
  tier that needs 82 is not impossible — it is a fact about what 60 reaches, and the tap moves the floor. Only
  a cap, a group and a corruption make a search find nothing.
- **Nothing new drawn.** The facts use the note the Craft tab already has (`cr-foff`) and the red line the
  Mods list already had (`tp-off`); two rules in `assets/app.css` put them on their own row inside the mod
  row. The rules and `data/craft.json` are fetched the first time a search names a base or a kind — the Trade
  tab with nothing picked loads neither, and first paint is unmoved.
- **Proved** in headless Chrome at 375×812 touch and at 1280×900, over eleven searches: a fourth prefix on a
  Sapphire Ring, a fifth on a Dusk Ring and a third suffix on it, two modifiers of one group on a Lapis
  Amulet, flat Armour beside flat Evasion on a Grand Regalia, a second prefix on a Greater Life Flask, a 41%
  Fire Resistance roll asked for at item level 60, Chaos Resistance at item level 10, five of five prefixes in
  a "some of these" group, a Desecrated modifier on an uncorrupted item, a Normal item, and the same searches
  with the note turned off. Every tap settled what it named, every query came out as asked, no console errors
  and nothing scrolls sideways. Hand-checked against `data/craft/ring.json`, `body-armour.json` and
  `life-flask.json`.

## Next — A tab left open across a deploy opens the new bench, instead of nothing at all

- The fault, live on wraeclastindex.fyi minutes after the bench went out (ticket 48). A tab opened before the
  deploy is still running that deploy's `assets/app.js`, which is right and is what `sw.js` is for. Click
  Crafting bench on a card in it and `sw.js` `file()` sees a page that is not of this deploy, goes to the
  network, and the network hands back the **new** `assets/craftsim.js`. Old `app.js` and new `craftsim.js`:
  *"The requested module './app.js' does not provide an export named 'repaint'"*, and the bench does not open.
  Nothing is said. One reload fixes it, and the craft survives a reload, so nothing was ever at risk — but the
  first try failed in silence.
- **It is not only the bench.** Every deploy that adds a module has the same window, for as long as a tab from
  the deploy before it is open. `sw.js` cannot close it: the older copy is deleted on activate and the server
  keeps one version of each path.
- **The failed load is the signal.** `assets/app.js` now fetches every module it needs later through one
  helper, `lazy()` — all ten lazy imports and the router's tab loader. A module that will not link means the
  page is a deploy behind, so the page reloads itself once and the next click opens the feature.
- **A refusal to link, never a file that did not arrive.** The browser throws a **SyntaxError** when the file
  came and its imports and exports do not line up, and a **TypeError** ("Failed to fetch dynamically imported
  module") when it could not be fetched at all — offline, blocked, or a path that is not there. Only the first
  reloads. Someone on a train is never reloaded in circles.
- **One reload a session.** `sessionStorage` holds the module that caused it, until that same module loads. So
  a module that is broken for a real reason fails once, and a later deploy in the same session still gets its
  one reload. A browser with storage denied is never reloaded, for want of anywhere to remember it.
- **Only then is anything said**, in one line at the foot of the screen: *"The crafting bench did not open.
  Reload the page."* The words are the button's own, so no file and no id is ever on a screen. The background
  mounts — Suggest, Patch notes, Support, the tracker, the league clock — say nothing, because there is
  nothing for a player to do about them.
- **Proved both ways** in headless Chrome over two builds on one origin: a tab recorded as a page of deploy
  `a1`, then deploy `b2` out with `craftsim.js` in it for the first time. Before: the SyntaxError above, no
  reload, no bench, nothing said. After: one reload, the tab comes back on `b2`'s `app.js`, the bench opens.
  Three ways round again for the loop: a module that 404s fails once and says so through five clicks; a module
  that is genuinely broken reloads once, then says so and stays put through four more; the marker clears the
  moment that module loads. First paint is unmoved — 212 ms median either way, over twelve cold loads each.
- `sw.js`'s header said "a page is always one deploy's files, never a mix". It now says what actually holds,
  and names the one file it cannot hold to and who catches it.
## Next — Craft: two questions, and the bench inside the page

- The tab answered one question: *what can this base roll* — and only once you knew the base. The other
  question a player actually has is *how do I get this mod*, and the page could not answer it at all. It now
  asks which one you want, in the site's own segmented control, and the answer is in the address
  (`#/craft?ask=mod&find=fire+res&mod=to-fire-resistance&base=Gold+Ring&ilvl=80`), so a link opens on the
  question it was sent about.
- **One item, two questions.** Picking a kind of item on the second screen picks the page's own item, so what
  you find there is already on the first screen, in the plan, in the trade search and on the way to the
  bench. Nothing is a separate mode with a state of its own.
- **The mod screen.** Type a modifier in its own words. The hits are the thinnest row the page has — the
  line, its side, how many kinds of item carry it, and whether an essence guarantees it — ordered by the line
  that reads the way it was typed, then the ones that roll before the ones only a desecration or a corruption
  adds, then the ones the most kinds of item carry. Nothing is ordered by how good a modifier is: that is the
  player's call. 40 rows, then the rest as a count.
- Pick one and it says what can carry it, and on the base you are on it draws the modifier as the same row
  the pool draws — its tiers on the trade slider, the tiers this item level cannot reach greyed, its weight,
  its share of that side at this item level, and Craft of Exile named for the weight directly under it. One
  modifier at a time, never the odds for a whole item, and no cost to hit anywhere.
- **The right rail is what was missing.** What guarantees it (the essences, with what each does and what it
  costs right now), what holds a roll to its side (the omens the game still has — which ones it has taken out
  is the bench's own table, `assets/engine.js`, never a second copy), and what can add one at all (the orbs,
  with the Greater and Perfect ones drawn only where a tier of this modifier is inside their reach at this
  item level). Every price is the in-game Currency Exchange and live trade listings; a currency the market
  does not price today carries no price rather than a made-up one.
- An item that cannot be Rare is never offered the orbs whose own line says "Rare item" — the game's words
  decide that, so there is no second list of which orb needs what.
- **The bench is in the page, not a link off it.** Two ways in, both where the player already is: a *Practise
  at the bench* button beside the base and on the item, and a gold one at the head of the rail. Either opens
  the bench card on the item this page is on — the base **and its item level**, which the bench used to
  replace with the class's top — and the rail's button hands over what it had just named: the essences that
  guarantee the modifier and the orbs that can add one, because an essence works on a Magic item and getting
  there is the orbs' job. Each pick comes off the bench in a tap, and one this kind of item does not craft
  with is named rather than swapped for something else (`alsoPicked`, `assets/craftsim.js`).
- **`data/craftmods.json`, 58 kB** (`tools/craftmods.py`): every modifier in the game, its side, its tags and
  the kinds of item that can carry it, with the lowest level it lands at and whether an essence guarantees it
  there. It is the 31 item class files — 1.6 MB — turned inside out, so nothing official is read a second
  time, and it is fetched the first time the second question is asked and never in first paint. A modifier
  that rolls on one kind of item and is desecrated on another is two rows, because those are two different
  answers to the question.
- **Three of the slices that were drawn and never cleared are cleared here.** *Thin rows*: the hits list.
  *Pools instead of 294 names*: a kind of item with 294 bases has a handful of pools, and the pool is what
  decides whether a modifier is in it, so the bases are offered as their pools — by the defences they come in,
  with how many bases are in each — and picking one picks a base of it. *Mechanics as filters*: on this screen
  the mechanics are not a panel to open, they are the answer — the rail is essences, omens and orbs, put
  against the modifier you asked about. The fourth, *a modifier as a card kind of its own*, is untouched:
  that is a `KINDS` entry and 637 rows in the index, which is the frame's move (b), not this ticket.
- **A phone does one job per screen.** The search and the list until a modifier is picked, then that modifier
  and how to get it, with *Every modifier* as the way back. Every control on the tab is at least 44px, the
  same rule `assets/bench.css` already keeps, and nothing scrolls sideways at 375px.
- Measured, 375×812 and 1440×950 in headless Chrome: both screens, a modifier row with its weight, its share
  and its source, the rail with live prices, the way into the bench taken and a craft run from it (a
  Transmutation, then the essence, landing the guaranteed modifier), no console errors, no sideways scroll,
  no control under 44px. First paint on the Craft tab is unmoved (184 ms before, 164 ms after, run five times
  each); the first screen costs +6.0 kB gzipped of `assets/craft.js` and +0.7 kB of `assets/app.css`, and the
  second screen pulls `data/craftmods.json` (8.6 kB gzipped) and `assets/engine.js` on top.

## Next — A levelling guide we did not write, on the Build tab

- A player called Dan sent a levelling guide in through the suggestion box:
  <https://domistae.github.io/poe2-leveling/poe2_act4_guide.html>. Read before anything was written about it.
  It is a free, unofficial, fan-made site by one person, **domistae** — an interactive campaign checklist for
  Acts I–IV and the Interludes with a box to tick per step, optimal routing, waypoints, gems, rewards and
  passive points, written for the live league (0.5.5 today), plus endgame and crafting pages beside it. Dan
  sent the Act IV page; the link goes to the **levelling hub** instead, because that is the page all four
  acts and the Interludes hang off and the Act IV page is one click inside it.
- **Where it sits.** The Build tab, one line under the paste box, so it is there before a build code is —
  the one player on that page who has no code to paste is the one still levelling. It reads: *Still
  levelling? Acts I–IV and the Interludes, step by step, ticked off as you go ↗ — PoE 2 Leveling Guide, by
  domistae.* Whose it is is in the line itself, the link opens in its own tab, and nothing about it reads as
  ours. Clicks on it already count as `out:domistae.github.io` in the owner's dashboard, with no change to
  `assets/track.js`.
- **The link is read on every publish, so it cannot rot quietly.** `tools/guides.py` holds the whole list —
  the name, whose it is, what a player will find, the address, and the words the page has to still carry —
  and writes `data/guides.json`; `assets/build.js` draws whatever that file holds, so a second guide is one
  entry in the tool and no page code. Every run fetches each address. A guide that answers keeps today's
  date. A guide whose address has gone, or whose page came back too short, or which no longer carries its own
  words — an address that outlived its guide — goes through `tools/lastgood.py` like any other outside
  source: the row already committed stays exactly as it was, the run names the guide and why on stderr,
  `data/faults.json` records it **under that guide's own name**, a `data-fault` ticket goes up and the run
  exits non-zero. One guide, one section, and the one thing counted is its own check, so the record reads
  "1 row before, 0 now" and dates the kept copy by the day that guide last checked out.
- **Proved all three ways** against a scratch data directory: a dead address, a page that no longer says what
  it should, and the guide answering again. The first two kept the committed row, named the fault and exited
  1; the third cleared the fault and exited 0.
- Once per publish, not on the hourly price runs (`.github/workflows/pages.yml`): one read of someone else's
  site per deploy is enough to catch a link going, and the hourly job is for prices.
- Styling is two lines in `assets/app.css` (`.guide`) over the existing `.note`: no new component, and the
  line wraps at 375px rather than pushing the page sideways.
## Next — Every data file says how old it is, backup or not

- The fault, live: `GET /api/health` answered `{"state":"unknown","ok":false,"note":"Currency prices: from
  the backup site, age not known here."}`. The owner: *"that's not right it needs to be fixed."*
- **Why it said that.** The hourly files still come from the backup site, not from the key-signed ingest into
  the files table, so there was no arrival time for them and the watch had nothing to count from. It read
  `unknown` and stayed there — which also meant a feed that froze could sit there for a week without ever
  raising a fault. The state machine was written for a cutover that is shelved.
- **The age now comes out of the file itself.** Every job writes the hour of its data at the top of what it
  sends, in `updated`: in `exchange.json` the hour of the Currency Exchange feed behind it, in `market.json`
  and `leagues.json` the moment the file was built. `ownTime` (`worker/files.js`) reads that field off the
  text, not the parsed file — it sits at the top of all three, so a 340 kB price file is never parsed to ask
  its age — and `fileWhen` hands it to the watch when the backup is the one answering. Nothing is invented:
  the file's own hour is never newer than the moment the file arrived, so this can only read older than the
  truth, never fresher.
- **Which time wins.** The arrival time whenever a job has sent the file in, the file's own hour only while
  the backup is answering. The cutover is untouched: the day the ingest starts writing rows, the arrival time
  is simply there and the fallback never runs again.
- **So the states work again.** Against the thresholds that were already in the table, a backup file goes
  fine, then late, then stopped like any other job: the currency file is the hourly one, late at two hours
  and stopped at six.
- **`unknown` now means what it says**: nothing anywhere gives a time. Only a file carrying no `updated` at
  all reads it, and the line says why — "Currency prices: the file does not say when it was made." A file
  the backup will not answer for at all still reads stopped, as before.
- **The dashboard keeps the distinction.** The Data jobs block shows the age, with "from the backup site"
  under it while a file is still coming from there. The public answer leads with an age and a state; it still
  carries which source answered, but no line of it reads "age not known" any more.
- **Checked against a local worker and a local database**, five ways: the live shape today (files table
  empty, backup answering, feed fresh) reads fine; a backup currency file three hours old reads late; four
  days old reads stopped; a fresh row in the files table over a five-day-old backup copy reads fine off its
  arrival; and a backup file with no `updated` reads unknown. The owner's Data jobs block was drawn in a real
  headless Chrome for all five. `node tools/dev/guard.mjs`: 7 ok, 0 failed.
## Next — The base you pick narrows the trade filters, and says so

- From the suggestion box: *"trade page can be better if filter and modifier options automatically change
  live to only show what is available for the base."*
- **Pick a base on the Trade page and the search narrows to it.** The mod list drops to the mods that base
  can really have, the defence types drop to the mixes it really comes in, and a slider's ends become what
  that mod rolls on that base. A gloves base: the mod picker goes from 8,001 to what it can carry, "spell
  damage" finds nothing there, and the type row is Armour and nothing else where before it showed none at
  all for a base.
- **The join was already shipped.** `data/craft/<class>.json` holds each class's pool (`tools/craft.py`)
  and `data/trade.json` holds the trade site's own list (`tools/tradedata.py`); they meet on the wording of
  a line with the numbers taken out, the same match the Craft tab makes when it builds a trade search. Of
  the 956 modifier families across all 31 classes, 951 land on a trade mod; the five that do not are not on
  the trade site at all. `assets/basepool.js` is the one place that reads the class table's shape, so a
  base narrows a card and a search to the same thing.
- **What a base can have is more than what it rolls.** A desecration, a corruption, a rune or soul core in
  a socket and the base's own implicit are all on the list. Totals ("+# total to Fire Resistance") stay
  whatever the base is: they are worked out from whatever is on the item, not rolled on it.
- **Nothing disappears without the page saying so.** The note sits with the Mods list and with the Type
  row — *Narrowed to what Stocky Mitts can have ✕* — and one tap puts everything back, with the way to
  narrow it again in the same place. A mod already in a group when the base was picked stays where it is
  and says the base cannot roll it. A defence type already ticked stays on the list whatever the base is.
  Same shape and the same styling as the Craft tab's own "Narrowed by".
- **The sliders keep the base's own tiers**, and where two of the base's mods read as one line on the trade
  site the slider keeps the ends and drops the tiers rather than drawing one mod's bands over another's.
- The class table is fetched when a base is picked, never before, and a table that does not come leaves
  the whole list where it was rather than half of it.

## Next — What a base can already have, and a switch where the player is

- From the suggestion box: *"gloves need a stonefist toggle and existing available modifiers to a base need
  to be shown for base as well as corruption options intuitively designed and presented. lightweight but
  responsive UI."*
- **A base item's card now lists what it can already have.** Its implicits and its properties were already
  on it; under them are **Modifiers it can roll** — every modifier family its own pool rolls, with which
  side it lands on, how many tiers it has here and the item level the first one needs — and **A corruption
  can add**, the outcomes a Vaal Orb can put on that base. Stocky Mitts: 27 modifiers and 9 corruption
  outcomes. Sapphire Ring: 31 and 12. Crescent Quarterstaff: 23 and 13.
- **It came out of the frame, not out of card code.** Both are the same new field type (`pool`), one entry
  each in `FIELDS` with `of` saying which list of the base's pool it reads, so a third list is one more line
  and no code. The data is the one the Craft tab already works from (`data/craft/<class>.json`,
  `tools/craft.py`) — nothing new was pulled, and the corruption outcomes were already shipped.
- **A field's table may now be one file per item class.** `file` takes `@field` and fills it in from the
  entry the way a gold button's link already does, so `data/craft/@cr.json` reaches every base of every
  class with no class named in the code. A base whose class has no table draws nothing rather than
  breaking — the 27 relics and wombgifts among the base cards are exactly that.
- **Nothing of it is in first paint.** Both fields draw on an opened card only, so the grid keeps its shape
  and the widest card is where it was (body 3 of 6). The class table and the small reader that shapes it
  (`assets/basepool.js`) are both fetched the first time a card is opened on a base, and a card that is
  never opened asks for neither. Checked in a headless Chrome: the home page asks for no craft file.
- **The Stonefist toggle is a switch on the card, not a panel.** A new field type (`swap`): the declaration
  says which entries carry it (gloves), the word on the switch, and the card it comes from. What it does is
  that card's own lines — Way of the Stonefist's own three lines, read off the passive card the site
  already has — so the game's wording is never written down twice, and the passive is one tap away under
  it. Every kind carries the field, so the next switch is one more line in the table.
- **On the Craft tab too.** The base card there is the same card, so it gained the corruption list and the
  switch with no work; it leaves the "modifiers it can roll" field off, because the whole table with tiers
  and roll chances is right under it. That is a caller's own call (`without`), like a card drawn with no
  price, never a rule about a kind.
- `tools/dev/frame.mjs` now fails a switch with no rule, no word or no card, and a switch from a card whose
  kind the table does not have. `docs/frame.md` settles three more cases: a table that is one file per item
  class, a switch on a card, and a page that already draws a field in full.
## Next — Item classes are cards, and every keyword card has its connections

- From the suggestion box: *"gloves and other item types need to be under keywords as well. Frankly we need
  to do a full keyword listing update for card frames to pickup."* Two halves: make the item classes
  something the frame can group on, and refresh the whole keyword listing against the current export.

### Item classes are a kind

- **A kind of their own, not keyword cards.** An item class is not in the game's glossary and has no
  glossary wording, so filing 31 rows under Keywords would put words in the game's mouth and hide them
  inside somebody else's count. It is the frame's fourth move — a new sort of thing with its own name and
  its own rows — so it is one `KINDS` entry (`i`, *Item class* / *Item classes*, drawn in `bronze`) plus its
  rows in the index. No card code: the card, the search chip, the map region, the count and the key all came
  from the declaration.
- **The `klass` map now answers from both ends.** It already grouped every card by the class it carries
  (`cr`). Adding `of: 'i'` says which kind answers to that name, which is the same shape a unique's base
  item already had — so a base item gets **Item class** (one row, `REL.klassof`) and the class gets **Bases
  of this class** (`REL.inclass`, 180 on Gloves). `EDGE.base` and `EDGE.klassof` became one line each over a
  shared `to()` that reads the map's own `at` and `of`, so neither names a kind.
- **An item class is its own class** (`make: {cr: 'id'}`, the same declaration that makes a base item its own
  base item). That is what keeps the class out of its own group, and what tells the gold button which of the
  two it is drawing: a base opens the Craft tab on that base, a class on the whole class
  (`./#/craft?kind=Gloves`). Both forms were already ones `assets/craft.js` reads.
- **What a class card says**, all of it off `data/craft.json` and `data/craft/<id>.json`, which
  `tools/craft.py` builds from the export's own item classes and item metadata: the group it sits in as its
  sub line, how many bases are in it, how many modifiers can roll on it per side, how many prefixes and
  suffixes it takes at most, and how many sockets. **Listed with** then groups the armour classes together,
  the weapons together, and so on, with nothing new declared.
- **Their names are not doors.** "Gloves" in a mod line is what the item is, not which card is meant, and
  "Shield", "Focus" and "Ring" are a keyword or a base item before they are a class — so the class kind
  declares no `words` (`assets/marks.js` never sees it) and `tools/nodelinks.py` keeps it out of the phrases
  it looks for (`NOT_A_NAME`, the kind-level twin of the rule a low-ranked card already had). Checked: the
  index's build-time marks are byte-for-byte what they were before the 31 cards existed.
- A class is reached from the search chip, from any base item's Connections, and from the Craft tab.

### The keyword listing, refreshed

- **Re-pulled** (`tools/gamepull.py`, RePoE fork, patch 0.5.5, files dated 11 Sep 2026) and compared card by
  card against what we ship. Nothing we carry has left the export, and not one of the 693 cards had been
  reworded upstream: same ids, same terms, same wording.
- **+32 cards** — the Expedition runes. They were left out because they are written as an in-game tooltip
  rather than a sentence, and rewriting them was never the answer. `untag()` reads the game's own display
  tags away (`<<Style>>`, `<rgb(…)>{…}`, `<font:…>{…}`, nested) and leaves the words between them untouched,
  so the card carries the game's own lines: *Monsters gain: / Extra Fire Damage / All Damage can Ignite*. The
  tooltip's title line is the card's name box, so it goes where it is the keyword's name — and stays where
  the files spell it differently (Gasp Rune's tooltip is headed *Volcanic Rune*), because the wording on the
  card is the game's and not ours. 693 → 725.
- **Still out, and counted:** 261 entries the export holds with no term or no text at all, 8 whose name is
  already on another card (the same monster modifier worded twice, and Power Rune), 2 names players never
  see, 1 placeholder.
- **The rewording rule now reaches every card.** It used to touch only the cards this tool had made itself;
  it now reworks any keyword card the export still holds, so a term reworded upstream lands on the next pull
  whoever built the card. Today that is 0 cards, which is the point: it says so every run.
- **Every keyword card now has its Connections.** `tools/kwuse.py` read only the drill-down page's own
  keyword block, so 282 of the 693 cards — every one the export had given us — opened with no connections at
  all. Its universe is now every keyword the index really cards (451 from that page, 314 more), using the
  card's own wording and the keyword list the card already carries. 448 → 762 keywords with lists, and 122 of
  the 314 have something in them.
- **A "See all" that has a list to send you to.** That page filters by the keywords it carries itself, so
  `tools/kwuse.py` names them (`dd`) and a card only offers the button for one of those. The guard reads the
  same list and checks every id in it is a row that page really has.

### Found on the way

- **One passive card was spelt with a space on the end** (`Inherited Strength `, a Marauder notable: the
  tree node itself is spelt that way). A card's name is stripped everywhere else — `tools/kwuse.py` and
  `assets/bridge.js` both say so and both do it — but `tools/sync.py` kept the node's own spelling, so the
  card's own deep link landed on the first row of the tree list instead of on it. Stripped where the card is
  built, and on the one row in the index. It also made the guard's links check fail about one run in ten,
  because that check tries 200 passives at random.
- **`data/essences.json` was a build behind.** The four mechanics cards added earlier never reached it, so an
  essence's modifier lines opened two of our cards where a base item's own lines opened six. Rebuilt in the
  documented order (`tools/nodelinks.py`, then `tools/essences.py`): 31 of the 95 essences now carry the
  marks they should, and three more cards are reachable from them.

### Counts

- Cards 6,613 → 6,676: keywords 693 → 725, item classes 0 → 31.
- `data/kwuse.json` 448 → 762 keywords, 726 KB → 773 KB (fetched only when a card asks for it).
- The map redrew itself off the declarations: 6,676 dots, 25,477 lines, 31 item classes in the key, nothing
  edited in `tools/map.py`.

## Next — The frame: one card, one map, and a loop with two moves

- The owner's call: *"we want cards and map to be a frame populated with predetermined items with a
  sequencing rule for when there is overflow to facilitate and frame appropriately for our purpose… nothing
  should have to be built in the future if we see all future edge cases now and build accordingly."* And the
  loop: *"every new dataset or entry that the current framework does not support is simply considered and
  addressed so it does. thats our loop once its built."*
- **`docs/frame.md`** is the frame, written down. It opens with the loop as exactly two moves — the frame
  supports it, so add the data and stop; or it does not, so extend the frame once and it is supported for
  good. (b) is a procedure: the four things a new dataset can need (a field type, a slot rule, a
  relationship, a kind declaration), the test that says which, what each costs, what to check before and
  after, what the guard proves, and a worked example of each. Then every slot in order with what may fill it,
  which field wins when two could, the sequencing rule for overflow, and the absence rule. Then the same for
  the map. Then eleven cases settled now, from a kind never seen to data from an older build.
- **The frame's numbers are in one place** (`FRAME`, `assets/kinds.js`): the cap per slot (pill 6, fact 8,
  body 6, foot 4), the slack of 1 that keeps a "+1 more" off a card, the 4 lines a list draws in the grid,
  and Connections (8 rows, slack 2, a filter box over 30). The caps were measured, not guessed: over 6,613
  cards the widest fills 4 pills, 3 facts, 3 body blocks and 1 mark, so nothing is cut today and the rule is
  there for the day something is. `tools/dev/frame.mjs` measures it again every run.
- **The map's rules are the frame's; its numbers are the drawing's.** The spec was first written with six
  numbers for a map drawn in the browser. The map that shipped is not that: `tools/map.py` lays the whole
  index out once with the data and the page is given a finished picture. So those six numbers are gone —
  a number no code obeys is the worst thing to leave in a frame. `FRAME.map` now names the file the page
  reads and states the rules the picture is held to, which are the card's rules at another scale: a region
  per kind off `many` and `tone`, a dot per card and every one of them, a line per edge the site can already
  follow, nothing thinned, and what is left out counted and named (1,317,426 group pairs today). The guard
  holds the picture to them.
- **A slot now draws the first n pieces and counts the rest.** One piece is one field that drew something.
  The popup draws all of them, so the count in the grid is the way to the rest: open the card. Each slot puts
  its count in its own shape — a pill, another ` · ` on the fact line, a muted line, a foot mark — all of
  them existing styles, so nothing was restyled.
- **The head is four boxes, not four lines of markup.** A head field lands in the box its declaration names
  (`box`), and `BOXES` gives the order. Two fields in one box both draw. The markup is byte-for-byte what it
  was.
- **Every per-kind special case moved out of the drawing code and into the table.** The rules left the code
  as declarations: `tone` (the colour a kind is told apart by, which `tools/map.py` already read),
  `sprite` (which sheet the art is cut from), `px` (where else a price may be listed),
  `gone` (an entry with nowhere to go), `notitem` (on the Atlas but not an item), `few` (how thin a market is
  ignored on the movers list), `rank` (what the search takes off a kind), `builds` (which of poe.ninja's
  lists, first test wins), `kw` (where a keyword id is), `words` (whose words are doors, and whether only in
  a line doing maths), `make` (fields worked out from an entry itself), and `MAPS` (the maps the index is
  turned into, once, for Connections). `assets/app.js`, `assets/edges.js` and `assets/marks.js` now hold no
  kind letter at all in the card path.
- **The offered mechanics cards are a declaration, not a table in the drawing code.** `OFFERS` in
  `assets/app.js` became `FIELDS.offer.cards`: each line is the card it leads to, what the card's own words
  have to read for it to be offered, and what the button says. A third of them is a third line and no code,
  a card about two of them is offered both in the order declared, and none of them is ever offered on a card
  of a kind one of them leads to. Same buttons on the same 2,160 and 2,404 cards, 535 of them with both.
- **`DECL` closes the list.** A kind may carry those declarations and nothing else, so a rule that would
  reach one kind cannot be slipped onto it — the guard fails the build over an unknown key.
- **A new guard check: `frame`.** `tools/dev/frame.mjs`, called by `tools/dev/guard.mjs` and runnable on its
  own. The table half: a kind the index carries with no declaration, a declaration the frame does not know, a
  field whose slot, box or type the frame does not have, a field type with no renderer or a renderer no field
  asks for, a field every card carries that one kind drops, a slot with no cap, a box no field fills, an edge
  whose map or kind is not declared. The map half: a kind drawn in a palette token `assets/theme.css` does
  not have, and a kind that is in neither the map's key nor what the picture says it left out. The card half,
  in a real headless Chrome over all 7,369 cards: a slot over its cap, a slot or a list that cut something and
  did not say how many, and a card that is its own connection or carries a mark that opens the card you are
  already on. Each was proved to bite by breaking it in a scratch copy: all eight named the right card and
  the right rule.
- **Proved the frame takes new things.** In a scratch copy, a kind that did not exist (Relics: one `KINDS`
  entry, three rows) and a field type that did not exist (`stars`, a rank out of five: one `FIELDS` entry,
  one `TYPE` function) both landed with no per-kind code — full cards, a search chip, the keyword and
  mechanics doors already worked out in their lines, and the frame check green at 10 kinds and 39 fields.
- **Nothing a player sees moved.** Every one of the 7,369 cards drawn before and after, in the grid and in
  the popup, at 375×812 touch and at desktop: identical markup, identical links, identical prices;
  6,918 Connections sections identical; 24,790 marks in lines identical; ten searches identical. The eight
  mechanics cards draw the same flowcharts, the same sources and the same offers, the gated words open on the
  same lines and stay plain in the same prose, and the map tab draws the same picture, the same key and the
  same counts.

## Next — Nothing on the Craft tab is a dead end

- Two things were wrong with the Craft tab. It prints **486 named things** — orbs, essences, bones, catalysts,
  omens, runes and soul cores — and 401 of them already carried a live price and a card everywhere else on the
  site, but not one of them opened from here. And a row whose **Add** was off said why in a `title=`, which a
  phone never shows, while the filter narrowing the pool sat above the table and scrolled away.
- **Every name opens its card, through the card layer, with no card code on this tab.** `cardOf`
  (`assets/craft.js`) builds one table out of the index the browser already holds — name to card, once a visit.
  Where two kinds answer to the same name the currency card wins, because everything named here is something
  you use on an item. `rowHTML` then draws every row the same way: the icon and the words are a button that
  hands that row's card to `openDetail`, exactly as a row anywhere else on the site would. A chip that names
  something else — an orb's Greater and Perfect versions, an omen that holds an orb to one side — keeps its own
  job and carries the card against it (`chipPair`), and the essence or rune a mod on the item came from opens
  its card from the item preview (`.cr-tag`). No per-kind code, and no card drawn here.
- **482 of the 486 open a card.** The four that do not are **Lesser Tempered Rune**, **Tempered Rune**,
  **Greater Tempered Rune** and **Soul Core of Vizoma**: the index carries no card for them and the market no
  price, so they stay plain text, as a name the index does not carry should.
- **A row that cannot be added says why, on the row**, in the same short wording everywhere: what blocks it,
  then what takes the block away. The `title=` is gone; the reason is its own line under the words and the
  button, at every width, so a phone reads it without a hover.

  | What blocks it | What the row says |
  | --- | --- |
  | The mod needs a higher item level | Needs item level 82 · raise the item level |
  | The orb only adds from a level | This orb only adds mods from level 70 · clear the orb |
  | That side of the item is full | Prefixes full · remove one to add this |
  | Another mod of the group is on | A mod of this group is on the item · remove it to add this |
  | The sockets are used up | Sockets full · remove a rune to add this |
  | The item has no sockets | No sockets on this item |

  The last one names no way out because there is none: an item without sockets never takes a rune.
- **What is narrowing the pool is at the head of the table, and stays there.** One line above the two columns —
  the orb's level, the side it holds to, the filter box, the tag — each as a chip that comes off with a tap.
  It is sticky, under the top bar, so it holds while the table scrolls; the tab measures the bar itself
  (`--crtop`), because the bar wraps to two rows on a phone. An orb that adds from level 1 and holds to neither
  side takes nothing out of the pool, so it is not listed as narrowing anything.
- **The share link is words.** It carried the plan as base64 JSON with the game's own mod ids in it
  (`{"m":[["p","IncreasedLife13"]]}`), which put a raw game id in front of a player. It now reads as the item
  it makes: `#/craft?base=Vaal+Cuirass&ilvl=80&mods=iron-rune,t2-life-regeneration-per-second,desecrated-lightning-and-chaos-resistances`.
  A mod is its tier and its own line; where it does not come from a roll the word for where it does comes first
  (`desecrated-`, `corrupted-`); where two mods of one base read alike the side tells them apart (`prefix-`,
  `suffix-`); an essence or a rune is simply its own name. A base belongs to one kind, so the kind is only in a
  link that has no base yet (`?kind=Amulet`, what a card's "Craft" and an essence's per-kind rows now point at).
  **Old links keep working:** a `?s=` link is still unpacked, and the tab writes the plan back in words, so it
  is shared on in the new shape. `craftHref` in `assets/app.js` and `appHref` in `worker/seo.js` write the same
  form, and `tools/dev/guard.mjs` names it in the report.
## Next — Four more mechanics cards: defences, resistances, where a modifier lands, damage over time

- The ticket from `docs/mechanics-cards.md`: the next four the page said were worth building, in the order
  it gave them. Twelve cards were judged worth building; eight are now live.
- **How defences work** is the mirror of the damage card, and it is drawn by the same code: `"fl"` on the
  card, `.flow` in `assets/cards.css`, no markup in the index. Three groups — the two steps that decide
  whether any damage arrives (Evasion, Block), the pair of columns for the two that get read as the same
  thing (Armour against Resistances), then the three pools that take what is left (Energy Shield, Mana under
  Mind Over Matter, Life). On a phone the pair stacks; on a wide card it sits side by side.
- **The order on that card is the order the code runs, not the order the ticket listed.** The ticket asked for
  evade, block, Energy Shield and Mind over Matter, armour, resistances, life. `CalcDefence.lua` does not do
  that. `takenHitFromDamage()` cuts the raw damage down first, through the
  `damageMitigationMultiplierForType()` it calls, which ends `return totalResistMult * totalDRMulti` — Armour
  and Resistance are two multipliers on the damage, so neither runs before the other — and only then does
  `reducePoolsByDamage()` spend the pools, Energy Shield first, then Mana under Mind Over Matter, then Life.
  The card follows the code and `docs/mechanics-cards.md` records the correction.
- **The Armour curve the game will not give.** The game's own entry stops at "more effective at reducing
  smaller hits". `armourReductionF()` is `armour / (armour + raw * data.misc.ArmourRatio) * 100` with
  `ArmourRatio = 10`, so the card says it in words: your Armour divided by your Armour plus ten times the
  Hit. The worked case is The Brass Dome's own Armour against what a monster of that level deals, both read
  out of our own files: at 3,091 Armour a Hit of 334 (level 80) is cut by 48%, a Hit of 584 (level 100) by
  35%. The caps are the game's own character metadata as Path of Building carries it: 90% damage reduction,
  75% default maximum resistance, 90% ceiling. A Hit's chance to land never falls below 5%
  (`monsterHitChance()`, and `DefaultMaxEvadeChancePercent = 95` from the other end).
- **The other three cards are the game's own entries and nothing else**, and say so: *"According to the
  game's own entries."*
  - **Resistances and the maximum** — the 75% default and the 90% ceiling (Maximum Resistances), Uncapped
    Resistance in parentheses on the Character Panel, the penalties as you progress (Resistances),
    Penetration applying to the target's defensive stats and only to Hits, so it does nothing for Ailments
    (Resistance Penetration), and Ignoring Resistances. Worked with Rise of the Phoenix's +5% to Maximum
    Fire Resistance.
  - **Where a modifier lands in a stat** — Stat Totals, Adding to Stat Totals, Stat Conversion, Gaining Stats
    from other Stats and Maximum, in that order. Worked with Decree of Acuity (554 Evasion Rating, 30%
    gained as extra Armour → 166 Armour that scales with increased Armour) and Ghostwrithe.
  - **Damage over time** — why no hit modifier helps an Ignite. Hit Damage, Damage Conversion and Damage
    Gained as extra X for what damage over time is shut out of, and the Ignite entry for the rest: a Damaging
    Ailment takes its damage from the Hit and has no Damage modifier applied to it afterwards; a modifier
    that applies to Hit damage (Penetration) does nothing to it, and one that changes how much damage the
    enemy takes (Shock) does. Worked with The Sentry: 41 Fire damage on the Hit, 20% of it a second for 4
    seconds.
- **Each card is reached from the words that need it**, and each card now carries its own rule for when one
  of its words counts (`"fg"`, `tools/mechanics.py`), which both `tools/nodelinks.py` and `assets/marks.js`
  apply. Two rules existed already — `pct` ("40% less Attack Damage") and `start` ("Adds 8 to 18 Cold
  Damage") — and the new cards needed a third: `any`, for a phrase that only ever means the mechanic
  ("Damage taken", "Converted to", "damage over time"), which does not have to prove itself against the
  line. Built into the index: **Resistances and the maximum** 397 lines on 312 cards, **Where a modifier
  lands in a stat** 141 on 123, **How defences work** 42 on 38, **Damage over time** 35 on 26. The page adds
  more as it draws (`assets/marks.js`): 18 more lines on 12 cards, 15 on 15, 2 on 2, 14 on 14.
- **The defences card is offered too, the way the damage card is.** `offerHTML()` in `assets/app.js` was one
  card and one word; it is now a table of two, each with the words that call for it, and a card about both
  (a body armour that adds damage) gets both buttons, damage first.
- `node tools/dev/guard.mjs`: 6 ok, 0 failed. The card count moved 4 → 8 mechanics cards and the baseline was
  blessed for that one line. Checked in a real headless Chrome at 375×812 with touch and at 1280×900: each
  of the four opens from search and from a marked word, Back returns from both, the defences flowchart fits
  (327px in a 375px card stacked, 559px in a 640px card side by side), no sideways scroll, no console errors.
## Next — The index as a map

- The owner: *"if we can create a visualization of the index's net-artwork, it would be nice to have for
  anyone who wants to see. nothing to interact with just a view. can make it interactable later."* Then two
  more: make it *alive, cheaply*, and *built once, then it populates itself*.
- **`#/map`: every card a dot, every connection a line, in one picture.** All 6,609 cards over eight kinds and
  the 24,541 connections the site can already follow, laid out once at build time by `tools/map.py` and shipped
  as `data/map.png` — 1600×800, 597 kB, written with the Python standard library alone (`zlib` and `struct`,
  no encoder, no dependency) and read by the browser as one image decode. Its own tab, linked from the footer;
  the home page fetches none of it, and `assets/app.js` skips the wait for the index on this one route because
  the picture needs nothing of it.
- **The connections drawn are the site's own, all five families**, so the picture cannot say anything the
  cards do not: `data/kwuse.json` (what uses each keyword), the marks a card's own lines carry, the build's
  own `lx`/`lxk` marks, a unique and the base it sits on, and `data/grants.json` both ways round. An edge two
  families both hold is drawn once. The marks are `assets/marks.js` in Python — the same vocabulary, longest
  phrase first, a keyword's other spellings only where the card's own list names it, never the card you are
  already on — so the lines drawn are the lines a player can really click.
- **Laid out, not scattered.** A force layout over the part of the index edges can walk: dots push off a grid
  (a crowded cell pushes as one weight from its middle, so the cost is the number of dots, not the square of
  it), edges pull less the busier their two ends are, and 260 passes cool it. The web settles about twice as
  long as it is deep, so it is turned onto its own long axis and the frame is 2:1 to match. The 241 cards no
  edge reaches are seated evenly round the rim as a ring of islands. No clock, no random seed, no dict order
  that moves: the same data in is the same picture out, byte for byte.
- **Light, not ink.** Every edge lays down a little light and the picture reads that off a log scale, the way
  a star chart does: one line lifts a pixel clear of the ground, and it takes two hundred and fifty to reach
  the top. A pixel in the middle carries nearly two thousand, so a straight scale would leave the arms black
  and the middle a flat pale patch.
- **Alive, for about a quarter of a millisecond a frame.** The picture never moves against itself, so the
  shape never smears: its drift and the haze over it are a transform and an opacity on their own layer, which
  the compositor carries without a repaint or a frame of script. The only thing drawn per frame is a small
  canvas over it — one clear, one breathing glow for the busiest card of each kind, and sixteen lights
  travelling along real edges, from one pre-drawn sprite so a frame allocates nothing. Measured in headless
  Chrome: **0.19 ms a frame on a desktop, 0.87 ms on a phone profile at 375×812 with the CPU throttled four
  times over**, nothing scrolling sideways at either size and no console errors. It stops dead when the tab is
  hidden and when the picture is scrolled off, and with `prefers-reduced-motion` it never starts: nought
  frames, an empty canvas, the still picture.
- **Nothing about a kind is written into the tool.** The kinds, their names, their colours and their counts
  come from `assets/kinds.js` (a new `tone` field naming the palette token each kind is drawn in) and the
  tokens in `assets/theme.css`; which of a card's fields the build marked comes from the `mark` each kind
  already declares. A kind with no `tone` gets a colour of its own worked out from its letter. Proved on a
  copy of the site: one more row in `KINDS` with no colour declared and forty rows of it in the index, tool
  untouched and byte-identical, and it arrived in the key with its count, a colour of its own, forty seats,
  a hub of its own and 136 pixels of that colour in the picture.
- **The page says what the picture leaves out**, off the same counts: 1,317,404 pairs of the big groups a card
  sits in, which are not links between two things; 2,739 rows in the keyword lists no card of its own answers
  to; and any kind the site cards that the index holds no rows for — the bosses today, whatever declares
  itself tomorrow. Everything else is drawn: none sampled, none thinned. If the index is ever rebuilt without
  the map, the page says so rather than letting the picture's counts read as today's.
- **`data/map-nodes.json`: every dot's seat**, kind by kind, with how many connections it has. Nothing reads
  it today; it is there so a later pass can put a click on a dot without laying anything out again.

## Next — Connections, and a past league in its own colour

- Two calls from the owner. First: *"instead of the word 'Found on' we need a more universally applicable
  [name] for our new card system and what it actually is showing connections to."* Second, on the price
  chart: *"by color coding league i meant based on GGG's marketing pallet for that league not ours"*, and
  *"the current league will remain red or green according to price action keeping the original style. once
  this league retires it will get its price action function shown as its own branded color."*
- **"Found on" is now Connections.** The name fitted a keyword card, where every row really was somewhere the
  word was found. It stopped fitting the day `assets/edges.js` started building the section for every kind and
  following each edge both ways: a unique's base item is not somewhere the unique was found, it is what it
  sits on. One `<h4>` in `assets/app.js`, and the word in the comments, the README, `tools/kwuse.py` and
  `tools/dev/guard.mjs` that meant that section. Nothing else moved: the in-card search, the per-category
  caps, the true counts and "See all" are the same code they were.
- **Every group now names the relationship, read from the card you are on** (`REL`, `assets/kinds.js`), so the
  same edge says the right thing from either end:

  | Group | Was | Now |
  | --- | --- | --- |
  | `base` / `uniques` | Base item / Uniques on this base | **Sits on** / **Used by uniques** |
  | `grants` / `granted` | Skills it grants / Items that grant it | **Grants** / **Granted by** |
  | `named` / `namedby` | Named on this card / Named by | **Names** / **Named by** |
  | `variants` | Other uniques on this base | **Shares its base with** |
  | `klass` | Bases of this kind | **Shares its class with** |
  | `section`, `cat` | The rest of this list | **Listed with** |
  | the nine keyword groups | Uniques, Gems, Passives, … | **Used by uniques**, **Used by gems**, **Used by passives**, **Used by bases**, **Used by essences**, **Used on the Atlas**, **Used by crafting mods**, **Used by currency**, **Used by keywords** |

  An edge that reads the same from both ends (`variants`, `klass`, `section`, `cat`) keeps the one label.
- **A retired league draws in GGG's colour for that league.** The current league is untouched: red when the
  price fell over the range, green when it rose, the same width, the same style. Behind it, a league that has
  ended takes its own colour at full strength, and only a league without one falls back to the faded ladder.
  The width ladder stays exactly as it was (2, 1.6, 1.4, 1.2), so the chart still reads with no colour at all.
- **The colour is on the league, not in the chart.** `tools/leagues.py` finds GGG's reveal post for a league in
  their Path of Exile 2 announcements forum, takes the banner that post opens with, and samples it: every pixel
  that carries a hue at all, gathered into ten-degree bins weighted by how much colour it carries, then the
  fullest bin and its neighbours. The result is lifted in lightness — hue and saturation held — until it clears
  3:1 against the chart's ground (`--sunken`, `#050605`). It lands on the league in `data/leagues.json` with
  the picture it came from and the day it was sampled, so a new league arrives with its colour and no one
  edits code. A league that already has one is never fetched again, so the hourly run asks pathofexile.com for
  nothing.

  | League | Colour | Sampled → lifted | From |
  | --- | --- | --- | --- |
  | Forbidden Rites 0.5.5 | `#4b5c8a` | 1.17:1 → 3.09:1 | Forbidden Rites FAQ banner |
  | Runes of Aldur 0.5 | `#864f2c` | 1.27:1 → 3.06:1 | Return of the Ancients reveal banner |
  | Fate of the Vaal 0.4 | `#416449` | 1.29:1 → 3.04:1 | The Last of the Druids reveal banner |
  | Rise of the Abyssal 0.3 | `#854f24` | 1.16:1 → 3.04:1 | The Third Edict reveal banner |
  | Dawn of the Hunt 0.2 | `#39607a` | 1.14:1 → 3.02:1 | Dawn of the Hunt reveal banner |

  Early Access 0.1 has no reveal post of its own in that forum, so it carries no colour and keeps the faded
  ladder; so does Release 1.0, which has not started. Forbidden Rites is the current league and its colour
  waits until it retires. Two of them land close together — Runes of Aldur and Rise of the Abyssal were both
  marketed on bronze — which is what the art says; the width ladder and the key tell those two lines apart.
- **The key and the line under it.** The key names every league with prices, newest first, each swatch in the
  colour its line is drawn in, and the current league's entry in its up or down colour. The caption now reads
  *"Daily price in each league. A past league is drawn in its own colour, from GGG's art for that league."* —
  the source, and nothing about what is missing.

## Next — Every keyword a card names, linked on the word itself

- The owner's call: *"The card for all listings need to have descriptions providing links to the cards for the
  respective mechanic."* On Temporalis the three mod lines were plain text while the keywords they name —
  Energy Shield, Resistances, Recoup — sat as chips at the bottom. The words were known; the lines did not
  lead anywhere.
- **Worked out as the card is drawn, not shipped.** `assets/marks.js` builds one table per index out of what
  the browser already holds: every keyword card, the other spellings the game shows each one as (`f`), and the
  mechanics cards' own words. A line is scanned once and the card keeps what it drew, so opening a card,
  stepping back to it or filtering it scans nothing. `data/index.json` and its two parts are **byte for byte
  unchanged** — the build-time marks that started this (`lx`/`lxk`, `tools/nodelinks.py`) skipped keywords
  because 11,457 spans would have pushed `data/index-core.json` past its budget, and nothing was added to it.
- **The rules, and no guessing.** Whole words, the phrase's own letters and case, longest phrase first, never
  inside another mark. A keyword's own name is a door wherever it is read. Its other spellings are doors only
  on a card whose own keyword list names it (`kw`, the game's own markup, and the list the chips are made
  from), so "Life" opens Life Leech on a card that leeches and is left alone on one that only grants Life. A
  phrase two cards answer to is left plain and nothing shorter is marked under it, unless one of them is
  actually called that and the other is only also known as it — so "Fire Resistance", which is both Fire
  Damage's word and Resistances', stays plain on the line. A mechanics word (increased, reduced, more, less,
  Adds) is a door only where the line uses it as a number, the rule the index already uses: after a percentage,
  or opening the line with a number behind it — never "Adds a Rune Socket" on a tablet. Never the card you are
  already on, and never on ground the index's own marks hold: a word is marked once.
- **Every kind, every line a player reads.** Effect lines, the "what it does" text, an Atlas passive's options,
  a base item's properties, the grid card's short text, and the prose in the damage card's own chart. Marked
  words, before → after: gems 0 → 3,676 · uniques 1,265 → 6,575 · passives 1,214 → 4,475 · bases 104 → 3,133 ·
  Atlas 0 → 610 · currency and essences 0 → 839 · keywords 0 → 1,999 · mechanics 6 → 17. **2,589 → 21,324
  marks on 5,528 of 6,293 cards**, from 1,511. The 2,589 the index itself marked are all still there and still
  say the same thing. A boss card carries no game text of its own, so it gains nothing and its rows were
  already cards.
- **Two marks, and neither is a chip.** A mechanics card is ours, not the game's, so it keeps the footnote it
  had (`.hlink`: the word, a dotted hairline and a `*`). A keyword is the game's own word, so it takes a plain
  hairline in the accent and the word's own colour (`.kwmark`), and lights up on hover. Both now sit above the
  card's own stretched link, which they did not: in a card's effect lines a mark was already on top, but in
  its description or its properties line a tap landed on the card and opened the card the word was on.
- **The chips stay.** They are the summary, the marks are the detail, and they are not the same list: of
  15,450 chips, 12,909 also appear in the lines (uniques 91%, bases 98%, passives 90%, keywords 83%, gems
  63%), and on **1,372 of 4,875 cards with a chip row** at least one chip is named nowhere in the text —
  Temporalis' own Elemental Damage Types among them. A card whose chips all appear inline still reads better
  with the row: it is the one place the whole list is.
- Checked: guard 6 ok, 0 failed. 375×812 touch and desktop, Chrome over CDP — Temporalis, a gem, a passive, a
  base, a currency card, a keyword card and the damage card; a real tap on a marked word in the grid and in
  the popup opens the right card, Back returns to the card behind it and a second Back closes; no console
  errors, nothing scrolls sideways. Every mark on every card of every kind resolves to a card and none points
  at the card it is on. Draw time per card, median of eleven: a six-line unique 0.13 ms → 0.20 ms, 0.17 ms
  drawn again; a passive 0.09 → 0.13 ms; a 30-card grid 0.11 → 0.18 ms; the longest keyword text 0.11 →
  0.19 ms. The biggest "Found on" there is (Hit Damage, 69 rows drawn) opens in 17 ms, as before: its rows are
  names, not lines, and nothing scans them. Payload: the data files unchanged, `assets/marks.js` 2.4 KB gzip
  and `assets/app.js` +1.0 KB, `assets/cards.css` +0.2 KB.

## Next — An essence card says what it adds, per kind of item

- The owner's call, with a screenshot of the Currency tab: *"I still don't see essence information. as you can
  see they all say that. but each one modifies items differently depending on what item. i need to ensure you
  are aware of that."* Every essence card carried the game's own one line — "Upgrades a Magic item to a Rare
  item, adding a guaranteed modifier" — and nothing about the modifier, although the game gives a different one
  to a bow than to a body armour.
- **The data was already in the repo and reached nothing.** `data/craft/<class>.json` carries an `ess` table per
  kind of item: **857 essence-to-modifier rows over 27 kinds of item**, each one pointing at that file's own mod
  list. The Craft tab reads it a class at a time and no card ever did.
- **One new field, no code per kind.** `assets/kinds.js` gains `adds` (`{type: 'adds', at: 'n', slot: 'body',
  file: 'data/essences.json', label: 'What it adds'}`) and the currency kind declares it between what the thing
  says and the rest of its body. `assets/app.js` gains one function per *type*, as everything else there does:
  `addsHTML` draws the rows and `addsFill` fills them in. A field type may now name a `file` of its own and
  answer with an empty box plus a `fill`; `card()` calls every fill once the card is built, so any later field
  whose table is a file of its own — an orb that adds a known modifier, say — is a declaration and no new code.
  The table is keyed by whatever `at` names, so anything else that adds a known modifier joins the same file.
- **One row per modifier, not per kind of item.** The 857 rows collapse to **178 modifiers**: a row carries the
  game's own wording once and lists every kind of item that gets that same one, in the Craft tab's order, with
  the side it lands on and its level. Lesser Essence of Ice reads as two rows, not thirteen. Each kind of item is
  a link that opens the **Craft tab on that class**, the same link the "Found on" rows already use.
- **The modifier text gets the same doors as any other card text.** `tools/nodelinks.py` now exposes its rules as
  `Doors`, so lines that are not in the index are marked by the same code, with the same key table: `attach()`
  itself is one call to it and marks `data/index.json` byte for byte as before (checked: 0 of 5,716 cards'
  `lx` rows changed, same 137 keys). **98 of the 178 modifiers** name a mechanics card in their own words
  (Increased and reduced 74, Added damage 24), drawn as the footnote mark the rest of the site uses.
- **The payload.** A file of its own, `data/essences.json`, **23.9 kB (4.2 kB over the wire)**, built by
  `tools/essences.py` and fetched the first time a currency card is opened, then kept for the visit. Nothing of
  it is in `data/index.json` or in first paint, and the 1.6 MB of `data/craft/` stays where it was: on the Craft
  tab, a class at a time. A name the table says nothing about — Chaos Orb — leaves an empty box, and an empty box
  draws nothing.
- **Sources.** The wording and its rolls are the game's own (RePoE's export); which modifier an essence adds on
  which kind of item is read from poe2db, which datamines the same files, as `tools/craft.py` already says. No
  weights are shown here: an essence's modifier is guaranteed, so a share of a pool would mean nothing.
- Checked: all 857 rows round-trip from `data/craft` to the card, none missing and none added. Three tiers by
  hand against `data/craft/*.json` — Lesser Essence of the Mind (6 kinds, +(25-34) to maximum Mana, prefix,
  level 12), Greater Essence of Ice (13 kinds, two rows: (31-38) to (47-59) and (46-57) to (70-88) Cold Damage,
  prefix, level 48) and Perfect Essence of Ruin (Body Armour only, (10-15)% of Physical Damage from Hits taken as
  Chaos Damage, prefix, level 57) — each matches the file exactly. Guard 6 ok, 0 failed. 375×812 touch and
  desktop: the rows read, an item class closes the card and lands on the Craft tab with that class loaded, the
  price, its chart and the drop level still draw on the same card, nothing scrolls sideways, no console errors.
- **95 essences now carry per-kind lines, 9.0 kinds of item each on average** (Essence of the Abyss 27, Perfect
  Essence of the Mind 1).
## Next — The three things we ship that a player could not reach

- The owner's call on all three: *"add them, ranked low in search, in the second data file"*, so the first screen
  stays as fast as today.
- **The tree's small passives, counted first.** 3,760 small nodes sit on the tree. 112 have no name and 383 no
  effect text (the masteries and the blank plates), which leaves **3,265 nodes** — and those are **893 different
  passives** once the same name with the same effect is counted once. They were in the drill-down's tree table and
  nowhere else: no card, and search found nothing. `tools/treecards.py` now cards all 893. Passive cards go from
  1,219 to 2,112.
- **A declaration, not card code.** The card comes from the kind table: `ontree` (the pill `assets/kinds.js`
  already declared for the Atlas, "11 on the tree") added to kind `p`'s field list, and nothing else. Each card
  carries what its nodes hold — the effect in the game's own words, the keywords marked in it, the region or the
  ascendancy when there is one of them, the node's own picture, and how many of it are on the tree — and joins the
  edges: its lines are read for the cards they name ("Named on this card"), it turns up under a keyword's "Found
  on", and it can reach the rest of its list. Jewel sockets, ascendancy starts and anything the files mark [DNT]
  get nothing: a card has to say something a player can use.
- **Ranked low, and it means low.** A card marked `lo` sorts in a second band, after every other card the same
  words matched (`search()` in `assets/app.js`). Measured over 18 queries, today's first ten results move **0
  places** on every one of them: "life" still gives Lifetap, Lifesprig, Life Drain; "armour" still gives the
  keyword, then Armourer's Scrap and Armoured Cap. Inside the low band they sort by the usual score, so the one
  the words really name leads it. A gentler rule that dropped only the phrase bonus was tried first and thrown
  away: it put five small passives above "Tenfold Attacks" for "attack speed" and pushed today's results down as
  much as 41 places.
- **The way in is the table they were always in.** A row of the drill-down's tree table now opens its card
  (`assets/bridge.js`). Where one name stands for several cards — the tree carries "Armour" in eight strengths —
  the row's own effect lines pick which: **406 of the 407 ambiguous rows** land on the right card, and the odd one
  out is a notable the index has never had a card for, which behaves exactly as it did before.
- **Timeless jewels name every conqueror they roll.** `data/explore/jewels.*.json` holds 28 conqueror rows over
  seven factions, and two of the seven are items in the game: **Heroic Tragedy** (Kalguur) and **Undying Hate**
  (Abyssals). The item's own line carries only the first conqueror, so the cards said Vorana and Amanamu and
  search knew no others. Both cards now carry the lot — "Conquerors: Amanamu, Kulemak, Kurgal, Tecrod or Ulaman" —
  and typing **Kurgal** brings Undying Hate up fourth. No card kind for the other five factions: there is no jewel
  in the game to hold, so there is nothing to card, and a row the files mark as only on older items is dropped.
  Properties now count in the search's haystack (`_hay`), which is what makes a conqueror's name findable.
- **The 900 item descriptions: 562 already reach a player, 339 are Path of Exile 1.** `data/info.json` has 1,086
  entries and **901 of them have no card in `data/index.json`** — the number the framework ticket left open. But
  **562** of those 901 are rows of the live currency catalogue (`data/market.json`), which `assemble()` in
  `assets/app.js` turns into searchable currency cards as the page loads, with a real price on them. That leaves
  **339 that reach nothing, and none of them becomes a card**: the official trade site's own item lists
  (`tools/tradedata.py`) do not carry them. They are items the export still marks "released" from the first game —
  178 currency (fossils, sextants, Breach splinters and blessings, Legion splinters, Incursion vials, Bestiary
  nets, Harvest lifeforce, Heist markers and artifacts, Delirium scouting reports, Eldritch embers and ichors, the
  influence exalts), 114 fragments (the Sacrifice and Mortal sets, the Elder guardian fragments, the Conquerors'
  crests, the Timeless emblems, the Labyrinth offerings, 64 scarabs, Divine Vessel, the Maven's Writ), 25
  Breachstones (five older tiers for each of five Breachlords; the one Path of Exile 2 has is simply
  "Breachstone", and it is in the catalogue already), 8 resonators, and 4 runes and soul cores the trade site does
  not list — plus 9 the game files mark [DNT] and one lineage support the export gives no text for. Nine of the
  339 are on the trade site's list at all and **seven of those nine say "This item is no longer usable"**.
- Sizes, against the standing budget of 70 KB compressed for `data/index-core.json`: **66.6 KB → 66.7 KB** (raw
  336.7 KB → 336.8 KB). The 893 new cards are all in the second file, as the owner asked: `data/index-rest.json`
  328.1 KB → 352.5 KB compressed (raw 1,763.3 KB → 1,975.6 KB). Core grows by 45 compressed bytes, and every one
  of them is the conqueror line on the two jewel cards. First paint, cold cache on the 8 Mbps profile, median of
  seven, run back to back against `origin/main` on the same machine: **388 ms → 388 ms**.
- Checked: guard 6 ok, 0 failed, baseline blessed (passives 1,219 → 2,112, sitemap 6,298 → 7,191). Both builders
  run twice, byte for byte the same the second time. `tools/kwuse.py` now reads a node's name stripped, as a card's
  name is — eight nodes on the tree are spelt with a space on the end — which takes the keyword lists' leftover
  plain rows from 893 to **one** (a Lich jewel socket, which is not a small passive). 375×812 touch and desktop: a
  small passive found by name and its card opened, a tree row opened, "Kurgal" opening Undying Hate, no console
  errors, nothing scrolls sideways.

## Next — Cards built from the index: one table, one renderer, everything the entry carries

- The owner's call: *"many of the cards have the price and yet no actual description of what they do which means
  the card building we spoke of is not working as intended. We wanted the cards to be built from the index
  automatically, which means not all cards are behaving the same."* And after it: *"if there is a description or
  stats or weights or anything it should be in the card"*, and *"the found on section should populate correctly
  and currently it does not in some cases"*.
- **One table, not twelve.** `assets/kinds.js` now holds every kind of thing the site cards: what it is called,
  which fields its cards carry and in what order, which buttons they offer, which related lists they can build,
  which of its lines carry the marked words, and where its gold button goes. It replaces `KIND`, `SECTION`,
  `PLACE`, `SEC`, `USE_KINDS`, `KINDS`, `OWN_CARD` and the kind map inside `usageOf` in `assets/app.js`, the
  `SECTIONS`/`INPUT`/`BODY` tables in `assets/bridge.js`, the kind names in `tools/dev/guard.mjs` (which read tab
  and section names back out of the JavaScript with a regular expression, and now imports the table), and the
  chips written into `index.html` (still written there so the bar never changes shape on the first paint, and put
  back in order by the app if the table has moved on).
- **One renderer.** `card()` walks the kind's field list and calls one function per field *type* — art, name,
  text, rich lines, quote, number, duration, money, enum, flag, cost, requirement pills, tags, chips, options,
  flowchart, source, offer, anoint, spark, usage, builds. `prep`, `priceOf`'s kind map, `reqsOf`, `factsOf`,
  `linesOf`, `optionsOf`, `anointOf`, `kwChips`'s placement, `hrefOf`'s five branches and the nine row builders in
  `useGroups` are gone. A field whose entry says nothing draws nothing, so the same declaration covers a full entry
  and a bare one, and a kind the table does not know at all (a farm card, a build's gear slot) still draws its head
  and whatever it carries.
- **Every description the data already held.** `tools/carddata.py` joins onto `data/index.json` what was shipped
  but never reached a card: the game's own flavour line for **693 uniques** and **46 keystones** (`qt`, already on
  the drill-down page), what an Atlas key or item is for (`t`, 7 more from `data/atlas.json` and `data/info.json`),
  how many mods can roll on each of **1,527 base items** and whether their weights are measured (`cw`, from
  `data/craft`, naming Craft of Exile where the number is theirs), and the official text for a priced name no card
  covers (`ix`, 11 of them). The market's own currency cards fill in the same way: a **lineage support gem**'s card
  had the words all along and its priced twin had none. Cards that carry a price and say nothing: currency
  **661 of 748 → 747**, bases **1,525 → 1,540**. `data/info.json` itself reaches only 186 names that have a
  card, and every one of them already had its text; its other 901 names have no card at all, which is a different
  ticket.
- **"Found on" is now every card's, and capped.** `assets/edges.js` follows the edges the index already holds,
  both ways: a unique names its base and a base names its uniques, a base grants a skill and that skill's gem names
  the items that grant it (`data/grants.json`, shipped since September and read by nothing until now), a line that
  names another card gives "Named on this card" one way and "Named by" the other, and everything in a list can
  reach the rest of that list. Before, the section existed on keyword cards and the 33 keystones only — 726 of
  5,716 cards; the other 4,990 had none. Per category it now shows the first 8 rows, the true total, and a "See
  all" that draws the rest on demand: **Hit Damage went from 1,448 rows built on open to 69**.
- **The audit that came first.** 282 of 693 keyword cards drew nine group tabs and "Nothing here uses it.": there
  is no entry for them in `data/kwuse.json` at all, and the section now draws nothing instead. Six of the nine
  groups (bases, essences, Atlas, crafting, currency, keywords) had no "See all" anywhere, and every row of every
  group was built on open, price lookup and icon and all. The counts themselves agree — the chip and the card's
  own "Used by ..." line matched on all 411 keywords that have an entry, once a passive is counted per place on
  the tree — so the on-tree number is now the category's tooltip and the row count is the total. No group repeats
  a row; 1,715 of 5,046 unique rows are another variant of a name already listed, which is right, because they are
  separate items with separate prices, and each row names its base.
- **The drill-down lands on the list the card was showing.** `explore#gems?kw=X` opened the Gems list in its
  default "Active skills" mode: for Ignite that is 30 of the 63 gems the card had just listed, with the 29 supports
  and 4 spirit gems missing. It now switches the list to "Everything" first. **New filter:**
  `explore#uniques?base=<base item>`, for "Uniques on this base" and "Other uniques on this base" — the uniques
  list gained a base filter and says so in its count line ("4 of 712 uniques · on Stellar Amulet"). A filter the
  page owns is handed to the page (`PoE.deep`), so the bridge never has to know what a base item is. "Bases of this
  kind" opens the Craft tab on that item class and "The rest of this list" opens the Atlas on that section.
- **Proof that a new kind needs no card code.** In a scratch copy, one entry in `KINDS` (`Relic`, six words of
  declaration) plus three rows in `data/index.json`: the search grew a Relics chip, the home page found all three,
  and the full card drew art, name, class, price with its change, requirement and drop-level pills, the trial
  duration fact, both effect lines, the description, the flavour line, tags, keyword chips, the damage offer, the
  Trade button and a related list — and the third relic, which carries nothing but a name and a class, drew
  nothing extra. No card code was written.
- Checked: field parity over 40 cards of each of the 8 kinds, before and after — nothing a card used to show is
  gone, and `qt`, `cw` and an Atlas implicit count are new. Guard 6 ok, 0 failed. 375×812 touch and desktop: every
  kind opens with its description, keywords, buttons and related list, Back and Forward walk the trail, marked
  words open their mechanics card, no console errors, nothing scrolls sideways. First paint, cold cache, median of
  seven: 236 ms → 204 ms. `data/index-core.json` 66.3 KB gzip → 66.3 KB; `data/index-rest.json` 297 KB →
  329 KB, which is the flavour lines and the mod counts.

## Next — Craft: how often a mod rolls, from the source that measures it
- The follow-on to "Craft: mod weights, and what the game files really carry" below, which ended with the weights
  being the owner's call. The call: *"crafting weights should be from official sources, and if not available the next
  most reliable. craft of exile is one of such."* Official still has nothing — the export's spawn weights are 1 or 0,
  can roll or cannot (`weight()`) — so the numbers now come from **Craft of Exile**, and the pool names them.
- **What was actually available, checked this week.** Craft of Exile runs two sites: the old one
  (`www.craftofexile.com`), whose PoE2 data is for patch 0.5.0, and the current one (`beta.craftofexile.com`), whose
  own pages load `json/poe2/<game build>/data.json` — **build 4.5.5.3, patch 0.5.5.3 "Forbidden Rites", last changed
  20 Sep 2026**, against our 4.5.5.2/0.5.5. That file carries a weight for every mod of every kind of item, keyed by
  the game's own mod key, so it is what `tools/craftweights.py` reads. Neither host publishes a robots.txt at all
  (every path, `/robots.txt` included, answers 200 with the app page), so nothing there is disallowed; they publish no
  terms of use, and their privacy notice is about personal data only. Three requests per patch, 1.5 s apart, our own
  User-Agent, the same files a visitor's browser loads.
- **poe2db was the cross-check and cannot be the source.** Its own `/us/weightings` page credits the same work —
  Krakenbul and the Prohibited Library Discord, recombinators, trade listings for bases that cannot be recombined —
  but every mod table it serves still prints weight 1 with "Modifier weight information cannot be obtained from game
  files" (checked on `/us/Rings` and `/us/Spears`: every weight it prints reads 1). Nothing numeric to pull. Its wiki text is
  CC BY-NC-SA 3.0; the weights themselves are not its own.
- **The join is exact, not matched on wording.** Their mod keys are the game's mod keys, which are the ids
  `data/craft/*.json` already carries: 9,782 mods looked up across every pool, 0 not found. Every one of our 1,527
  bases resolves to exactly one of their item classes, and each of our mod pools maps to exactly one of them — their
  classes split the way the game's spawn tags do (`Body Armours (STR/DEX)`, `Wands (Fire)`, `Grasping Mail`). Their
  minimum level for a mod agrees with the game files on all 10,634 pool entries, which is the check that the two data
  sets are on the same patch.
- **Coverage: 70 of their item classes carry measured weights** (every armour, weapon, shield, quiver and jewellery
  pool we show), 34 are flat — every weight in the table is 1, which is their "can roll, not measured". Flat means no
  number here: jewels, life and mana flasks and charms show no chances at all, and the page says so naming them.
  Grasping Mail is the one base with a mix: 79 of its 407 rollable mods (the minion and spell lines) are unmeasured,
  so those rows read "No weight", sort to the bottom, and stay out of the shares — the page says that too.
  Desecration and corruption keep no weights: their tables for those are 1s as well, and each panel says one line.
- **What the page shows.** Per mod row: the tier the slider is on with its weight and that weight's share of its own
  side of the pool ("Weight 500 · 1.8%"), and in the corner the whole mod's share, all its reachable tiers together
  ("8 of 12 tiers · 17% of prefixes"). Prefixes against prefixes, suffixes against suffixes; both columns sorted
  likeliest first. Everything answers the item-level control and the orb chips — at item level 40 an Iron Ring's
  "+# to maximum Life" is 15% of prefixes and top of the column, at 82 it is 12% and third — and moving a tier
  slider rewrites that row's weight without a repaint. **No whole-item odds anywhere:** one mod's share of its pool
  is the only number, and the note says so.
- **The source line, inline over the pool:** "Likeliest first. Shares are out of what this item level can roll on that
  side — prefixes against prefixes, suffixes against suffixes. One mod at a time, not the odds for a whole item.
  Weights: Craft of Exile — measured with recombinators by Krakenbul and the Prohibited Library, not in the game files.
  Pulled 22 Sept 2026 for their patch 0.5.5.3." The name links to their PoE2 page, and the date and the patch come
  from the pull, not from a hand-typed line.
- **Hand-checked against their data.json for three classes at item level 82**, top five mods a side, weights read
  straight out of the source: Iron Ring (their "Rings") prefixes total 69,500 — maximum Mana 12,000 = 17.3%, Evasion
  Rating 9,000 = 12.9%, maximum Life 8,000 = 11.5%, Physical Damage to Attacks 7,800 = 11.2%, Accuracy 6,000 = 8.6%;
  Vaal Cuirass ("Body Armours (STR)") prefixes total 54,000 — maximum Life 13,000 = 24.1%, Armour 11,000 = 20.4%,
  increased Armour 8,000 = 14.8%, Physical Thorns 7,000 = 13.0%, Armour and Life 6,000 = 11.1%; Gothic Quarterstaff
  ("Quarterstaves") prefixes total 44,655 — Lightning 8,085 = 18.1%, Cold 6,615 = 14.8%, Physical 6,300 = 14.1%, Fire
  5,880 = 13.2%, Accuracy 5,700 = 12.8%. Every weight matches the source mod for mod, and the shares add up to
  100.000000% on each side of each base, counted per mod and per tier. The page shows those same numbers.
- **A bad pull cannot empty the page.** `tools/craftweights.py` writes `tools/craftweights.json` (617 KB, one mod per line so a patch shows which weights moved, not part of
  the website) only when the pull holds at least 80% of the classes and weights the file already has; otherwise it
  keeps the last good file, prints why on stderr, leaves the reason and the time in a `faults` list inside the file,
  and exits 1. `tools/craft.py` prints that fault on its next run, and with no weights file at all it keeps the
  weights already in `data/craft/` and says so. Both paths were run: with the file hidden, the rebuild came out
  byte-identical, source line and all; with the host pointed at nothing, the 70 classes and 13,840 weights stayed put
  and the fault was recorded. No shared helper for this exists in the repo yet, so this follows what
  `tools/craft.py` and `tools/exchange.py` already do, per tool.
- **+44,726 bytes of data in all** (+43.7 KB) across `data/craft.json` and the 27 kinds that have weights, as one `w`
  array per pool beside the mod list — biggest single file `data/craft/body-armour.json`, +6,794 bytes. Still loaded
  one kind at a time, only when that kind is opened, exactly as before; `data/craft/jewel.json` and the three flask
  files are unchanged. `assets/craft.js` +3,973 bytes, `assets/app.css` +132.
- Phone: 375×812 headless Chrome on `#/craft` for Iron Ring at 82 and at 40, Vaal Cuirass, Gothic Quarterstaff,
  Grasping Mail (with the Desecrate panel open) and a Diamond jewel — nothing scrolls sideways (375px, no element past
  the edge), the weights and shares are readable in the corner and next to the slider, no console errors.
  Guard: 6 ok, 0 failed, baseline untouched.
- Not done: no public patch-notes line yet — that goes in with the next `data/changelog.json` batch, in one sentence:
  the Craft page now shows how often each mod rolls, and who measured it. Essences, runes and soul cores show no
  weights either; they are not rolled from a pool.
## Next — Prices: a fair share of the hour for every kind, and a day to come round
- **What was wrong.** `tools/pricepull.py` picked each kind's oldest and then poured all of them into one
  pile sorted oldest first. The uniques are the long list (710 of them against 55 slider points, 32 farm
  inputs and 1 boss entry item), so at 57 an hour they take over 12 hours to come round and every unique
  the run selects is older than anything else waiting. The pile therefore began with 57 uniques, and the
  trade site has been cutting runs off after as few as 16 searches: all 16 went to uniques, every time.
  Measured on the live database: `uniq:` 695 rows newest 8 minutes old, `roll:` 55 rows and `farm:` 32 rows
  newest **9 hours**, `boss:` its 1 row the same. Nothing was broken; the order was.
- Proved on a fixture, no network and no live database: a saved `/api/prices/state` holding that exact
  spread, run against the committed code, gives a 16-search run **13 uniques, 3 of them ones a boss card
  shows, and nothing at all for rolls, farms or boss entry items**.
- **A share per kind, in proportion to what it has waiting** (`share()`), so every kind comes round in the
  same time and one number is the cycle for the whole site: 71 uniques, 7 boss uniques, 6 slider points,
  3 farm inputs, 1 boss entry item — 88 searches, the same as before, paced one every 38 seconds across the
  55 minutes as before. Every kind has a floor of one search, so none can starve. A kind that wants less
  than its share hands the rest to the longest list, so the budget is spent but never overspent.
- **The kinds are spread through the run** (`plan()`) instead of queued behind one another, with every
  kind's first check at the front. On the same fixture a 16-search run now gives 1 boss entry item, 1 farm
  input, 1 slider point, 2 boss uniques and 11 uniques. Inside a kind it stays oldest first, and nothing is
  carried over: the next run asks the site what is oldest, which is where the last one stopped. Two cut runs
  in a row walk forward — second run takes `farm:abyss-tablet-pits`, `roll:…@30`, the next uniques.
- **The Bosses tab has a share of its own.** The 66 unique names a boss card prices (the way in, the drops,
  and the items only a drop rate table names) are read out of `data/bosses.json` and checked on their own
  share, under the same `uniq:` keys and the same one row each — nothing is checked twice. They used to wait
  behind the other 644. `boss:` is still one row and that is right: `data/bossqueries.json` holds exactly one
  query, Djinn Barya, and its own `unlisted` block records the other five entry items as having nothing
  listed and no bulk offer as of 21 Sep. Fabricating checks for those would make rows, not prices.
- **A day, not an hour.** 798 things to check; seeing all of them inside 24 hours needs 798/24 = 34 checks an
  hour to land, against a budget of 88 — a full pass every 9 to 11 hours when the site lets us through, so
  most of a run can be turned away and the day still holds. A whole day of nothing but 16-search runs is 384
  checks, a 50-hour pass: the run says that in as many words rather than hiding it.
- **The run ends by saying what happened**: per kind, how many it checked of its share, how many it skipped,
  why, and what a full pass takes at the rate it actually got. Plus the line that currency is not in this
  budget at all — those prices come from the Currency Exchange feed, hourly.
- `/data/rollprices.json`, `/data/farmprices.json` and `/data/bossprices.json` now say `every: "day"`, which
  is what one of those prices really is. Every price still carries its own `at`, so nothing is ever shown as
  newer than it is.
- **The watch was calling hourly** (`worker/health.js`): the four trade kinds read `every` 1 hour, late at 3,
  stopped at 8. They are a day's cycle now, so: `every` 24, **late at 6 hours** (several runs in a row with
  nothing of that kind) and **stopped at 26** (a whole cycle gone by with nothing, which means the oldest
  price of that kind is older than the day it promises). Same numbers for all four: every kind gets a share
  of every run, so the thing being watched is identical. The words are unchanged (fine / late / stopped).
- **Still claims hourly about trade prices, left for the copy pass.** Every one of these says "every hour"
  about listings, which is now a day: `worker/seo.js` 620 (the page footer), 664 (`llms-full.txt`) and 689
  (the `/data/market.json` line in `llms.txt`); `index.html` 136 (`#foot`); `assets/trade.js` 139 (the
  slider note); `assets/farms.js` 122 (`HOURLY`); `assets/bosses.js` 286 (the tab footer) and its comment on
  line 7; `assets/atlas.js` 123 and 135; `assets/craft.js` 4, which also still names poe.ninja; and the
  shipped public notes in `data/changelog.json`, 0.20 ("updated every hour") and 0.24 ("fill in every hour
  again"). **Correct as they stand**, because the Currency Exchange feed really is hourly:
  `assets/currency.js` 249 and 268, `worker/seo.js` 522, `index.html` 119.
- `python tools/pricepull.py --offline --state <file>` walks a run against a saved state with no trade calls
  at all, and `--cut 16` makes it act as if the site cut the run short, so the split can be read off without
  touching the network.

## Next — How the numbers stack: three concept cards, honestly sourced
- The follow-on to the entry below, which ended by saying what the honest fix would be: "a site-written note
## Next — Mechanics cards, and how damage works

- **The kind is Mechanics, not Concept.** The owner's word: they are mechanics cards. `tools/concepts.py` is
  `tools/mechanics.py`, the kind's label is **Mechanics** everywhere a player reads it (the filter chip in
  `index.html`, the badge on the card, the sub-line on each card, `KIND`/`KINDS` in `assets/app.js`), and the
  build tools, their comments and `tools/dev/guard.mjs` say mechanics too. The kind letter stays `h`: every
  reference already written into `data/index.json` is keyed `h:<id>` and `lxk` carries those keys into both
  parts, so changing the letter would buy nothing and break every existing link. 2,589 marked words on 1,591
  cards still open the same cards.
- **The voice was wrong and is rewritten.** Every line on all four cards now reads the way the game writes:
  declarative, present tense, one fact a line, `For example, ...` for a worked case, the game's capitalised
  nouns, and nothing that explains itself to the reader. What went: "That sum gets crowded", "you are on
  x 4.00", "still under where you started", "which is why they are rare", "So a flat roll is worth more the
  more increases you already have". The register was read off the game's own text before rewriting —
  `data/info.json` and the 437 glossary entries in `data/explore/keywords.*.json` — and `tools/mechanics.py`
  says so at the top, so the next edit has the same yardstick.
- **A fourth card: How damage works**, with a flowchart. Three groups, drawn by `flowHTML` in
  `assets/app.js` from `"fl"` on the card: a seven-step run for the hit (base, added, conversion, gained as
  extra, the increased sum, the more multipliers, crit), a two-column block for conversion against extra
  damage, and a four-step run for what reduces it (Evasion, Block, Armour, Resistances). The index holds the
  chart as text only — no markup in `data/index.json`; the boxes, the arrows and the columns are `.flow` in
  `assets/cards.css`. Plain markup, no library, no SVG text that cannot wrap: the columns are
  `repeat(auto-fit, minmax(210px, 1fr))`, so a phone gets one column and a wide popup gets two with no media
  query to keep in step, and every colour is a theme token.
- **Conversion and extra damage get their own block** because the two read as the same thing and are not.
  The game settles more of this than the first draft credited it with: the **Damage Conversion** entry gives
  the two step process and that converted damage "scale[s] with modifiers to the new damage type, and no
  longer scale[s] with modifiers to the old damage type", and **Damage Gained as extra X** gives the same
  rule for copies ("only scales with modifiers to the new type, not with modifiers to the source damage's
  type") plus "Damage Gain occurs in the same two step process as Damage Conversion". Both rule damage over
  time out. Those lines are the game's, and the card credits the game for them.
- **What Path of Building settles, read for this ticket** in PathOfBuildingCommunity/PathOfBuilding-PoE2
  (`dev`), `src/Modules/CalcOffence.lua`:
  - the conversion chain, in the file's own comments: `-- First step: Process skill conversion`, then
    `-- Second step: Process global conversion and gains`, and inside it
    `-- Process global conversion on skill-converted damage`, which runs `processDamageConversion()` again
    over every destination the skill already converted to. One portion can change type twice.
  - the cap: `-- Scale if over 100%` in `processDamageConversion()`, which scales a type's conversions down
    to total 100%. There is no such step for gains.
  - what a copy is taken from, in `calcGainedDamage()`:
    `local baseMin = output[otherType.."MinBase"] * activeSkill.conversionTable[otherType].mult`, then
    `gainedMin = gainedMin + (baseMin + convertedMin) * gainMult` — the source type's base after conversion
    has settled, including what was converted into it, and the source keeps its own damage.
  - **the order**, which is the part the chart turns on:
    `local summedMin = baseMin * convMult + convertedMin + gainedMin`, and only then does `calcDamage()`
    apply `inc` and `more` to `output[damageType.."SummedMinBase"]`. Conversion and gain land on the base,
    **before** the increased sum — not after it.
  - which modifiers a converted portion takes: `calcDamage()` is called once per damage type with
    `typeFlags` 0, so `damageStatsForTypes` hands it `"Damage"` and that one type's `"<Type>Damage"` and
    nothing else. Converted damage does not keep the modifiers of the type it came from.
  - crit after both: `output.PreEffectiveCritMultiplier = 1 + extraDamage` is applied to the per-type hit
    damage `calcDamage()` already returned.
  - `CalcPerform.lua` only feeds gain mods in (Unholy Might writes `DamageGainAsChaos`) and sets no order;
    `ModStore.lua`'s `Combine` sends `MORE` to `More()` and everything else to `Sum()`, the additive-against-
    multiplicative split the other three cards rest on.
- **Two things the brief asked for that the sources do not support, so the card does not say them.** Both are
  in the ticket report in full. Increases for the type damage came *from* do **not** still apply after
  conversion — the game's own Damage Conversion entry says the opposite in as many words, and PoB's
  `typeFlags` 0 call agrees; and conversion does not sit after the more multipliers, it sits on the base
  before the increased sum. Where PoB's single-pass gain table disagrees with the game's "same two step
  process", the card follows the game and says nothing about a copy being copied again.
- **The card is offered, not linked from 2,000 words.** `offerHTML` in `assets/app.js` draws one row at the
  foot of any card whose own search text matches a whole-word `damage` — read off `_hay`, which `prep`
  already builds, so nothing has to be marked per card and `data/index.json` carries no flag for it. Popup
  only: every card opens its popup first, and a chart that tall in the search grid would be noise. Mechanics
  cards never offer it. The word boundary keeps the internal stat ids in `"q"` out of it (`spell_damage_+%`
  has no word boundary before `damage`).
- **The flowchart card has no trigger words**, so `"f"` is left off it entirely and `build()` only writes
  that field where a card has words. Nothing else about the link machinery changed.
- Sizes: `data/index-rest.json` 1,686 KB -> 1,689 KB. `data/index-core.json` unchanged — mechanics cards live
  in the rest, which is where the popups already wait for them.
- `docs/mechanics-cards.md`: the full set scoped, with the test a card has to pass (the game ships 437
  glossary entries and every one is already a keyword card, so a mechanics card earns its place only where
  the game has no entry, never puts the pieces in order, or contradicts itself). Twelve worth building, the
  four live ones included; the five next are How defences work, Resistances and the maximum, Where a
  modifier lands in a stat, Damage over time, and Chance over 100%. Four of those five are pure official
  game data.
- The word the owner has banned on this project is cleared from the two code comments that held it
  (`assets/admin.js`, `tools/gamepull.py`) and from the entry below, which this one supersedes. Five older
  entries in this file still carry it; they are left as the record of what was written at the time, and are
  the ticket report's one open item.

## Next — How the numbers stack: three mechanics cards, sourced
- The follow-on to the entry below, which ended by saying what the right fix would be: "a site-written note
  against a named source ..., not a keyword card wearing the game's voice". That is what this is. Three cards
  of our own, a new kind `h` with its own label, declared in one place, `tools/mechanics.py`:
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
## Next — Data faults: the last good copy stays, and the run says so

- The rule, in one place: `tools/lastgood.py`. Every builder that fills the index from an outside source runs
  its pull through it. A pull that throws, comes back empty or collapses against what is committed keeps the
  committed copy, says so on stderr the moment it happens, writes the fault to `data/faults.json`, opens or
  reuses a GitHub issue labelled `data-fault`, and exits non-zero. Nothing is half-written: every file the rule
  guards now goes out through one `os.replace`, the index's two parts included (`tools/appdata.py`).
- What counts as a fault, and why those numbers. Empty: no entries at all. Under a floor: fewer than a working
  source has ever given, where one is known (uniques 300, the search index 4,000, the currency catalogue 100,
  the trade mod list 1,000, bosses 80, farms 10, the Currency Exchange 20 currencies, item text and
  requirements 500). Collapsed: more than a fifth of the committed rows gone — an ordinary game patch moves a
  list by a few percent, so a fifth is never a patch, it is the source or the parsing breaking. A kind gone: a
  group that had rows has none now, by the field that names the kind (`cat`, `k`) or the letter a key starts
  with. A file with several lists is only as good as its worst one.
- Four calls, and no copy of the rule in any tool: `pull()` checks one outside pull, `keep()` does the same for
  one section inside a file the builder writes anyway (the essences), `guarded()` wraps a whole builder so a
  source that dies halfway through is the same fault rather than a traceback, and `report()` prints the story
  and is the exit code.
- Covered: `sync.py` (the search index — the bases, the Atlas and the currency come from RePoE through
  `morecards.py`, which answers with nothing rather than failing, so this one could thin the index in silence),
  `craft.py` (the tab's 32 files go out together or not at all; the essences are their own section),
  `uniques.py`, `leagues.py`, `market.py`, `exchange.py`, `gamepull.py`, `tradedata.py`, `gameinfo.py`,
  `atlas.py`, `bosses.py`, `farms.py`. The tools that build only from files already on disk have no outside
  source to lose; the live prices are watched as jobs of their own.
- The per-tool copies of this check are gone: `bosses.py` stopped the run with a message on three thin sources,
  `atlas.py` on a base the export no longer names, `craft.py` counted its own essence names, and
  `leagues.py`, `market.py`, `uniques.py` and `exchange.py` each had their own "keeping the last file" exit.
  All of them now raise `lastgood.Stale` with the same words, so the fault is recorded and ticketed instead of
  only printed.
- What the owner sees: a stale section joins the dashboard's Data jobs block and the public `/api/health` in
  the same fine/late/stopped style as the jobs — late on the first day, stopped after that, with the reason in
  the builder's own words ("Currency prices: still showing the copy from 19 Sep, the source answered with
  nothing."). `data/faults.json` is served like the other hourly files (`worker/files.js`), so the site can name
  what is stale whether the file came from the data server or the backup.
- The record only moves when what is stale moves, so a good run leaves the same bytes behind it every time and
  the repo stays clean.
- `node tools/dev/faults.mjs` proves it with no network: a fake builder four ways (a source with nothing, one
  down to 60% of its rows, one that throws, and a builder that dies before its pull is checked) and a fifth good
  run. Each fault keeps the committed file, prints the loud line, lands in the record, goes red, and is named by
  both the dashboard and `/api/health`; the good run writes, twice over byte for byte, and clears the fault. The
  same three faults were run against the real `leagues.py` and `uniques.py` with every read dead, against a copy
  of the committed data: unchanged every time. `tools/dev/guard.mjs`: 6 ok, 0 failed.
- Nothing a player sees changes, so there is no public patch note for this.

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
