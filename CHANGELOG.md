# Changelog (internal)

The full list of changes. The public patch notes (data/changelog.json, shown on the site) stay short.
Add the details here first, then a short public line there.

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
