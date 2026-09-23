# Currency: an overhaul that fits what a currency does

A proposal for [issue #57](https://github.com/metaseonso/wraeclast-index/issues/57). Two options, both
buildable, both drawn against the card frame, the chips, the price chart, the popup trail and the bench's own
currency tab. No new component where one of those does the job. No code yet.

The tab prices 652 things very well and says almost nothing about any of them. A player opens it to find out
whether a Perfect Exalted Orb is worth what it is asking today, and leaves knowing that it moved 39% this week.

---

## Where the tab stands

Measured against the files in this worktree, 23 September 2026.

| | Today |
|---|---|
| Rows | **652** currency cards, every one with a price from the in-game Currency Exchange. Nine more rows exist on the Exchange that the catalogue does not name |
| Groups | the game's own 14: Runes 140, Essences 79, Lineage Supports 75, Currency 53, Soul Cores 52, Uncut Gems 42, Omens 39, Idols 35, Catalysts 28, Fragments 26, Liquid Emotions 26, Verisium 24, Expedition 18, Abyssal Bones 15 |
| What the page is about | price and price action: busiest markets, biggest movers, rising, falling, swinging, steady, below league average, a watch list |
| What a card says about what it is | one line — the game's own use text. **87 rows carry no line at all**, 75 of them Lineage Supports |
| Where it comes from | the drop area level, on 448 of 652. The field exists and the tab does not use it |
| Hidden by default | **101** priced rows sit under the 5-divines-a-day volume filter and are never seen unless a player turns it off |
| The way to the bench | the act exists on the card (`ACTS.bench`) and reaches **465 of 652**. From the tab it takes two clicks: open the card, then press the button |

So the tab is a market page for a catalogue of tools. It answers *what is it worth* and none of: what does it
do, what does it do it to, is it worth using rather than selling, what competes with it, where does it come
from.

---

## What a player is actually asking

Six questions, in the order they come up. The tab answers one and a half.

1. **What does this do, and to what?** Answered for 565 of 652 by one run-on line, and not at all for 87.
2. **What is it worth?** Answered well. This is the part that stays.
3. **Is it worth using rather than selling?** Not answered anywhere.
4. **What competes with it?** Not answered. The nearest thing is *Listed with* under Connections, which names
   siblings without their prices.
5. **Where does it come from?** In the data, unused.
6. **How do I use it?** The bench answers this, two clicks away.

---

## The shape problem, and why one table is the wrong answer

An orb rewrites an item. A rune drops into a socket and stays. An essence guarantees a modifier. A catalyst
adds quality to a ring. A fragment opens a door. These do not share columns. A table with a *What it does*
column is either empty for most rows or a paragraph for all of them.

The frame already settles this, and the answer is not a table: **a card draws the fields its kind declares,
and a field the entry carries nothing for draws nothing.** One declaration covers a full entry and a bare
one. So the tab does not need a shape that fits everything. It needs the currency kind to carry the few
fields that each group's cards want, and a way in that asks a player's question rather than a market's.

The shapes are measurable, off the lines we already ship:

| Shape | Rows | What the line looks like | What draws it |
|---|---|---|---|
| Changes an item | 110 (Currency 53, Omens 39, Expedition 18) | one sentence about the item | `text`, already there |
| Guarantees a modifier | 129 (Essences 79, Liquid Emotions 26, Verisium 24) | the same sentence 118 times, on three different targets | `adds`, already there for essences |
| Sockets in and stays | 227 (Runes 140, Soul Cores 52, Idols 35) | a list of slots run together in one string, 128 of them | **nothing draws it as a list** |
| Adds quality | 28 (Catalysts) | what quality, on what | `text`, and the tag is in the craft data |
| Desecrates | 15 (Abyssal Bones) — 11 the bench runs, 4 that carry slot lines | either shape | both |
| Becomes a gem | 42 (Uncut Gems) | *"Creates a Skill Gem or Level an existing gem to level 14"* | `text`, already there |
| Is a support gem | 75 (Lineage Supports) | nothing at all on the currency row | the gem's own card, which the currency card already borrows |

That covers all 652 with no row in two places and none left over.

One warning the numbers give: **the game's own category is not a reliable shape either.** The Breach Splinter
and the Breachstone are filed under *Catalysts* in the catalogue; the Simulacrum and its splinter are under
*Fragments*. So a field must read the item's own line, not its group. The group is a door; the line is the
answer.

---

## Option 1 — The shelf

**What it is.** Rebuild the tab as the bench's own currency tab at full size. `assets/craftsim.js` already
draws it: the game's groups down the side, one group's list in the middle, each cell an icon, a name, the
sub line that matters for that group, its live price and a *Card* button. On a phone it is a sheet with the
groups along the top and a handle that pulls the whole tab up.

**Why it is tempting.** It is the game's own furniture, it is already built, it already prices every cell,
and it already gives each group its own sub line — which is exactly the "not one shape" answer, written
once and working.

**What it costs.** A rewrite of the tab's view. The grid, the cards, the popup, the price chart and the watch
list either go or become sections under the shelf. And the deeper problem: **the shelf is a chooser and the
tab has nothing to choose for.** The bench's sub lines are good because the bench has an item class in hand —
an essence cell can say which side the modifier lands on and which family it belongs to because the bench
knows it is a bow. A Currency tab has no item. It would either show a poorer line than the bench does, or ask
the player to pick an item class first, which is the bench's question asked in the wrong room.

**What a player gets.** A faster way to browse by group, and a layout they know from the game.

**What they lose.** The chart, the movers, the watch list and the card — which is where every connection,
every keyword door and every price history lives.

---

## Option 2 — The question row

**What it is.** Keep the grid of cards. Give the currency kind the few fields its groups need, so each card
says the thing its group is about, wherever that card is drawn. Then change the way in: the chips ask a
player's question instead of naming a market condition.

### The fields

The frame's own procedure, worked down in order. Four of these need no renderer at all — they are existing
types with a different word in front.

| Field | Type | Slot | Reads | Draws | Cost |
|---|---|---|---|---|---|
| `rides` | `text` | pill | which orb an omen rides on | *Rides on an Exalted Orb* | one entry |
| `floor` | `number` | fact | an upgraded orb's lowest modifier level | *nothing below modifier level 50 · poe2db* | one entry |
| `quality` | `text` | pill | a catalyst's tag and what it goes on | *Life quality · rings and amulets* | one entry |
| `useson` | `text` | pill | what a bone desecrates, and its level cap | *Amulet, ring or belt · level 64 or less* | one entry |
| `perslot` | **new** | body | the item's own line, split on its own separator | a two-column list: the slot, what it gives there. 4 lines in the grid, all of them in the popup | one entry, one renderer |
| `ladder` | **new** | body | the orb's own upgrades | three rows: plain, Greater, Perfect. A price column aged like every other price on the site, and a lowest-modifier-level column with its source. Two columns, never one sentence | one entry, one renderer |
| `setprice` | **new** | fact | the count in a *Combine N…* line | *300 of these cost 2.93 div · the whole one costs 3.33 div* | one entry, one renderer |
| `cheapest` | **new** | fact | prices already loaded, across the card's own group | *Cheapest in Catalysts: Flesh Catalyst, 0.023 div* | one entry, one renderer |

The first four come off the game files through `tools/carddata.py`, which already joins on the flavour line,
the Atlas text and the mod weights for exactly this reason. `perslot` and `setprice` read the line the card
already carries, so they cost nothing in bytes at all. `ladder` needs the ten upgrade rows joined on, about
0.3 kB. `cheapest` is arithmetic on prices already in the browser.

None of the eight names a kind, so any other kind that grows one of these shapes gets the field by adding one
word to its `fields`. That is the frame working as written.

### The chips

Eight chips over the grid, in the same `.kinds .chip` row with the same counts the watch-list picker already
draws. Each is a declared list of the game's own categories — no classification of our own:

| Chip | The game's groups behind it | Rows |
|---|---|---|
| Changes an item | Currency, Omens, Expedition | 110 |
| Guarantees a modifier | Essences, Verisium, Liquid Emotions | 129 |
| Sockets in and stays | Runes, Soul Cores, Idols | 227 |
| Adds quality | Catalysts | 28 |
| Desecrates | Abyssal Bones | 15 |
| Opens a door | Fragments | 26 |
| Becomes a gem | Uncut Gems | 42 |
| Supports a skill | Lineage Supports | 75 |

All 652, once each. The price chips that are there now — rising, falling, swinging, steady, below average,
watching — stay, on the second row where they are today. A player who came for the market still finds it; a
player who came with an orb in hand now has a door.

And one more chip, off a field that already exists and is not used: **Drops where you are**, on the drop area
level, which 448 of 652 carry.

### What stays exactly as it is

The card, the popup, the price chart, the trail, the watch list, the busiest-markets strip, the search box,
the volume filter, the sorts. Nothing here replaces a component. The only thing removed is the assumption
that the page is about prices.

---

## The way to the bench, in one move

The act already exists and already knows who may have it: `ACTS.bench` carries its own test, and a currency
whose group the bench does not craft with has no button, *"the way a base with nothing to craft has no craft
link."* It reaches **465 of 652**. The 187 without it are the Lineage Supports (75), Uncut Gems (42),
Fragments (26), Liquid Emotions (26) and Expedition items (18) — the ones that are not used on an item, or
whose table the bench does not hold.

Today the tab costs two clicks: open the card, then press the button in the popup. **One move is the same act
in the card's action corner, in the grid.**

That corner is already in use and is not a slot: `opts.action` is a card option, and the Currency tab already
passes the watch star through it while the Farms tab passes a tier badge. Two small buttons fit the box the
star sits in. **No frame number changes** — the pill cap is 6 with the widest card at 4, and the action
corner is not counted against it. The frame also settles that this is allowed: a page deciding what a card it
draws carries is *"the caller's own call, like a card drawn with no price or no link, never a rule about a
kind."*

Where the act's own test fails, nothing is drawn there. That is one rule reused, not a new one.

---

## The maths, worked

Every number below is two real prices divided, or a real price times a count the game itself states. Nothing
is estimated, and nothing needs a drop rate.

### 1. What an upgrade actually costs

The game names its own upgrade ladders and the modifier-level floor each one buys; we already carry both.
Prices are the Currency Exchange's, 19 September 2026, in divines.

| Orb | Plain | Greater | × | Perfect | × | Floor it buys |
|---|---|---|---|---|---|---|
| Transmutation | 0.002672 | 0.00394 | 1.5 | 0.02984 | **11.2** | level 44 / 70 |
| Augmentation | 0.006107 | 0.01031 | 1.7 | 0.25320 | **41.5** | level 44 / 70 |
| Regal | 0.004265 | 0.00895 | 2.1 | 0.04639 | **10.9** | level 35 / 50 |
| Exalted | 0.002163 | 0.00872 | 4.0 | 2.69300 | **1,245** | level 35 / 50 |
| Chaos | 0.117300 | 0.34400 | 2.9 | 5.67200 | **48.4** | level 35 / 50 |

**Two things, and they are never one sentence.**

The multiple is a price. It was 1,245 when these two prices were read and it is a different number by the
hour, so it is drawn as a price is drawn everywhere else on this site: with its own age beside it, and gone
rather than stale if either end has no price.

The lowest modifier level is not a price and does not move. It is also not in the game's own words — the
Exalted Orb, the Greater and the Perfect all carry the same line, *"Augments a Rare item with a new random
modifier"*. The 50 comes from poe2db and is named on screen, per the standing rule for anything the game
does not publish.

So the card says three things, in three slots, and a reader can take any one of them on its own:

> **Augments a Rare item with a new random modifier** — the game's own line
> **nothing below modifier level 50** · poe2db — a fact, with its source
> **1,245 × Exalted Orb** · checked 41 min ago — a price, with its age

Welded into one sentence it reads as a single claim that is half true by the hour, and it is not how
anything else on this site talks.

At the prices in the table above the Greater step is 1.5× to 4× and the Perfect step is 11× to 1,245×. Those
multiples are prices and move with them. What does not move is which level floor each step buys.

### 2. The set against its parts

Where the game's own line names a count, both ends are real prices:

> Simulacrum Splinter — *"Combine 300 Splinters to create a Simulacrum."*

| | Divines | Traded a day |
|---|---|---|
| 300 splinters | **2.934** | 7,228 div |
| One Simulacrum | **3.332** | 266,313 div |

The whole costs **13.6% more** than its parts, and the whole is the market with 37 times the trade in it.
That answers "use it or sell it" for this pair with no rate and no guess.

**And the limit, stated rather than hidden:** the catalogue holds exactly **two** lines of this shape. The
other is the Breach Splinter, 300 of which cost 1.635 divines — and the thing it makes is not traded on the
Exchange, so that pair has **no answer today** and the field draws nothing. Two of 652 is not a feature; it
is one plain fact the `setprice` field can state and otherwise stay quiet about.

### 3. What competes with it

Within a group, the cheapest thing doing the same job, off prices already loaded. Catalysts, same day:

| | Divines |
|---|---|
| Flesh Catalyst | 0.0231 |
| Neural Catalyst | 0.0532 |
| Xoph's Catalyst | 0.0622 |
| Reaver Catalyst | 0.3276 |
| Sibilant Catalyst | 0.8357 |

The same act — quality on a ring or amulet — over a **36× spread**, because what the quality enhances is
what is priced. A player choosing what to put on a ring wants that column and gets none of it today.

### 4. Where it comes from

The drop area level is on 448 of 652 cards and the field is declared. One chip and one sort, no new data.

### 5. What the tab must not try to answer

Whether an essence is worth using rather than selling depends on what it would make, which depends on the
item, its level, its pool and what is already on it. That is a craft, it is the bench's job, and the bench
does it properly with the game's own tables. **129 rows carry that question, and the right answer from the
tab is a button, not a number.** Which is the whole argument for putting the bench in the action corner.

---

## What each costs on the free plan

The budget, from `worker/dash.js`: **100,000 requests a day, 100,000 D1 writes a day, 5,000,000 D1 reads a
day, 5 GB stored.** Only the paths listed under `run_worker_first` in `wrangler.jsonc` cost a request;
`/data/market.json` is one of them and is asked for once a visit already.

| | Option 1 — the shelf | Option 2 — the question row |
|---|---|---|
| New fetch job | none | none |
| New job cadence | — | — |
| Cloudflare requests added | **0** | **0** |
| D1 writes added | 0 | 0 |
| D1 rows stored | 0 | 0 |
| Bytes at first paint | 0 | **+≈2.5 kB** in the index: the omen's orb (39), the catalyst tag and target (28), the bone's target and level cap (15), the ten upgrade rows. Against `data/index-core.json` at 349,138 bytes, **0.7%** |
| Bytes fetched on the tab | 0 | 0. `perslot` and `setprice` read lines already shipped; `cheapest` is arithmetic on prices already loaded |
| Code | a rewrite of the tab's view; the grid, chart, movers and watch list re-homed or dropped | 8 `FIELDS` entries, 4 `TYPE` functions, one chip table, one line in `tools/carddata.py`, one action-corner button |
| Reach | the Currency tab only | **every card of kind `c` everywhere** — the search, the drill-down, a boss's drop row, a farm's output row |

For scale, measured here: `data/market.json`'s catalogue is 246,722 bytes, of which 122,149 is picture
addresses; `data/exchange.json` is 351,801 bytes, of which the day-by-day history alone is 242,036 and is
already served separately for the charts; `data/essences.json` is 24,271 bytes and is fetched only when a
card asks for it.

Neither option adds a request, a row or a job. The difference is what they cost to build and how far the work
reaches.

---

## Staleness

Prices age by the hour and the site already handles it: every price carries its own age, a broken source
keeps its last good copy and raises a tagged fault, and no price is ever shown as fresher than it is. Three
things this proposal adds are not prices, and they need their own answer.

| What | How it ages | What happens |
|---|---|---|
| The upgrade floors, the omen's orb, the catalyst's tag, the bone's cap | they come from the game files and change with a patch | rebuilt by `tools/carddata.py` on the patch run, stamped with the patch. A card whose entry lacks the field draws nothing, so an older row draws a shorter card, never a broken one |
| The ladder's multiples and the set-against-parts line | prices, so hourly | they are worked out at draw time from the prices in hand. If either end has no price the line is not drawn — never a zero, never a stale multiple |
| The seven chips | a new league can add a group the table does not name | the chip table is declared, so an unnamed group is **counted and named** on the page rather than silently dropped, the same way the map names what it left out. A build check should fail when a category is in no chip |

Two rules hold all three.

**What is not drawn is a number, never an "etc."**

**A price and a fact never share a sentence.** A price carries its age and is gone rather than stale. A fact
carries its source where the game does not publish it. They sit in different slots, and a reader can take
either one on its own without the other having to be true. The owner, 23 September 2026, on a draft that
welded them: *"It doesnt always cost that. it can state currently based on present price. and the next part
is a separate statement about what it does."*

---

## The pick

**Ship Option 2, the question row.** Four reasons.

1. **The frame's own loop says so.** A new shape is a field in the table, not a page of its own. The shelf is
   a special case for one tab, and the frame's whole point is that a rule reaching one kind is the wrong
   shape.
2. **It reaches every card, not one page.** The same orb card carries its ladder in the search, in a boss's
   drop list and on a farm's output row. The shelf reaches the tab.
3. **The shelf is the bench's answer to the bench's question.** It is good furniture for choosing with an
   item in hand. The Currency tab has no item in hand, and asking for one is the bench's job, one click away.
4. **It is cheaper and it ships in pieces**: the four no-renderer fields first, then `perslot` for the 227
   socketables, then `ladder`, then the chips, then the bench button. Every step is useful on its own.

What survives from Option 1: the group-down-the-side layout, kept where it belongs — in the bench, where it
already is.

**Order of work.**

1. The bench button in the action corner. One line, one click saved, 465 cards.
2. `perslot`. 227 rows whose whole meaning is a list currently drawn as a run-on sentence.
3. The four no-renderer fields, plus the join in `tools/carddata.py`.
4. `ladder` and `setprice`, and the chip row.
5. `cheapest`, last, because it is the one that will want tuning.

---

## What I could not confirm

* **What other price sites show, first hand.** poe2scout.com and poe.ninja both render in the browser, so a
  fetch returns their shell. What is said here about them is from their own descriptions and their public
  interfaces, not from reading a rendered page. Worth a look by eye before any layout is copied — though the
  recommendation here is to copy none of it.
* **The Refined catalysts.** The catalogue holds both plain and Refined versions with a large spread — Reaver
  0.328 against Refined Reaver 3.606, an 11× step. Nothing in the data we ship names the recipe that turns
  one into the other, so no ladder row can be drawn for them. If a recipe exists in the game files, that is
  eleven more ladder rows for free; I could not confirm it here.
* **The Lineage Supports — settled, 24 September 2026.** The owner: *"those lineage supports ARE gems and can
  be traded in the currency market."* So the currency card stays, because the market really lists them, and
  a chip calling them "becomes a gem" was wrong about all 75 — they already are one. They have their own
  question now, *Supports a skill*, in the game's own first word: 77 of the 78 lineage gem lines begin with
  "Supports", and the index cards every one of them as a "Lineage support gem". The currency row carries no
  line of its own and borrows the gem card's, which it already did.
* **The nine Exchange rows the catalogue does not name.** They price, they have no card. Not looked into.
* **The served size of `/data/market.json`.** The worker builds it at the edge; the component sizes above are
  measured, the served total is not.
* **Verisium.** 24 rows, 13 of which say the essence sentence. What the other 11 do was not checked.

---

## Sources

Ours, and named on screen where they are used:

* The in-game Currency Exchange, GGG's public hourly feed — `tools/exchange.py`, `data/exchange.json`. Every
  price in this document is one of its own.
* The official trade site's live listings — `worker/prices.js`.
* The game files, through `tools/craft.py` and `tools/gameinfo.py`: the orb upgrade floors (read from
  poe2db's minimum modifier level), the omens and the orb each rides on, the catalysts' tags and targets, the
  desecration bones and their level caps, and every use line quoted above.
* `docs/frame.md` for the card, the slots and the procedure for a new field; `docs/craft-sim.md` for the
  bench act, its test, and the bench's own currency tab.

Read while writing this, and named because the proposal leans on what they do:

* Maxroll's PoE2 currency pages, which are farming guides rather than a currency reference — there is no
  general "what is this orb worth using on" page on the sites players already use, which is the gap this
  proposal aims at.
* poe2scout and poe.ninja, both price trackers first; neither shows what a currency does beside what it
  costs. See the note above on what could not be read directly.
