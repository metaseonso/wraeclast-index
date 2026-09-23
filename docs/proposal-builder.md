# The character builder: the proposal

You arrive with an idea, not a build. You find a mechanic on a card, send what fits to a pool, and the
builder turns the pool into a character: gear, passives, gems, supports, and two numbers that move while you
choose. [Issue #50](https://github.com/metaseonso/wraeclast-index/issues/50) holds the whole of it; this file
settles the four slices — #51 the pool and the budgets, #52 passives as clusters, #53 the maths, #54 the
optimise button.

Nothing here is built yet. This is the same kind of file as [the bench](craft-sim.md): what it does, where
every number comes from, what it refuses to do, and how it is checked. Written before any of it is code, so
the arguments happen here and not in a diff.

Four rules run through everything below.

1. **Official game data first.** The tree, the bases, the pools, the gems and the supports all come from the
   game's own files, through the tools that already build `data/`. Path of Building is named wherever a
   formula is theirs. Anything else is named where it is shown.
2. **No invented numbers.** Where an interaction is not known, the builder widens the range, says which
   unknown widened it, and lets the player carry on either way. It never picks a value nobody has measured
   and shows it as one.
3. **Real prices only.** Every price is the in-game Currency Exchange or a live trade listing
   (`data/market.json`). A rare has no price, so no budget is ever counted in currency where rares are in it.
4. **The UI we already have.** Cards, the popup trail, chips, the sliders with their tier bands, the Trade
   panel, the bench's item panel and picks strip. Where nothing existing fits, this file says so and says why.

And the frame's own rule holds: each piece below is one of the four moves in [the frame](frame.md) — a field,
a relationship, a kind, or a number — never a special case for one data set.

---

## What it is made of

Every piece of the builder against the move that adds it. Nothing needs a fifth kind of move.

| Piece | Move | Cost |
|---|---|---|
| Send a card to a build file | a new act | one `ACTS` entry, one word in each kind's `acts` |
| The build file itself | a new kind (`f`, an application, like the bench) | one `KINDS` entry, one module |
| A cluster | a new kind (`t`) with rows in the index | one `KINDS` entry, one build tool, one data file |
| A cluster's members, both ways | two new relationships | two `REL` entries, one `EDGE` function each |
| What a cluster costs and what it shares | two fields of types that exist | two `FIELDS` entries, no new renderer |
| The budgets, the gear preview, the tree preview, the numbers | new field types on the build card | four `FIELDS` entries, four `TYPE` functions |
| The optimise button | a control on the build card | no new type: `data-do`, answered by the card's own module |

Two new kind letters, `f` and `t`. Both are free today (`g u p b i a c w h x n r` are taken).

---

# 1. The option pool, the budgets, and what a session may hold

*[Issue #51](https://github.com/metaseonso/wraeclast-index/issues/51)*

## 1.1 How a card gets to a build file

Every card that could be part of a build carries the way in, the same way it carries Trade and the bench: a
unique, a base, a gem, a support, a passive, a cluster.

**Option A — one act under the card.** `ACTS.pool`, drawn beside Trade and Crafting bench, answered by the
builder's own module (`own`, `go`), with an `only` test so a card with nothing to give has no button.
Pressing it opens a row inside the popup: one checkbox per open file, ticked where the card is already in it.

```js
pool: {label: 'Add to a build', own: './builder.js', go: 'openPool',
       only: {/* by kind: g, u, b, p, t, c(gems listed as currency) */}}
```

*Cost:* one `ACTS` entry, one word in the `acts` of six kinds, one module. No new field type, no change to
any card's slots, nothing in first paint. The popup's delegated listener already carries controls like this
(`ensureOV` in `assets/app.js`), which is how the bench's item, picks and launch controls work.

**Option B — a field on every card.** A `pool` field type with `every: 1`, so the checkbox row draws inside
the body slot on every card in the grid, not only in the popup.

*Cost:* one `FIELDS` entry, one `TYPE` function — and a block in the body slot of all 6,676 cards. The body
cap is 6 blocks and the widest card draws 3 in the grid and 5 in the popup, so it would take the widest
passive card to 6 of 6 and start cutting. It also puts a control in a grid that today is all reading.

**Ship A.** The reason is the cap, not taste: a checkbox row on every card spends the body slot's remaining
room on a control almost no card view needs. Trade and the bench both went in as acts for the same reason,
and the act row is where a player already looks for what a card can do.

## 1.2 The checkbox: which file

The act opens **one row per open file**, in the popup, under the card. Three rows at most (below). Each row
is the file's name, a checkbox, and what it would fill — "Weapon", "Support slot", "Cluster" — so ticking is
never a guess about where the thing lands.

A card can be in more than one file at once. Ticking writes to the pool, not to the build: nothing is
*chosen* by ticking, it is only made available. That is the difference the whole builder rests on, and the
row says it in one line: *In the pool for. Choosing happens in the builder.*

## 1.3 x files open at once, y kept

These two numbers are a cost question. Here is the cost.

### What a build file holds

```js
{v: 1, n: '<the name the player gave it>', cls, asc, lv,
 main, sup: [...],                 // the skill and its supports, by card key
 gear: {weapon, offhand, helmet, body, gloves, boots, amulet, ring1, ring2, belt, ...},
 clusters: [{c, take: [...]}],     // a cluster and which of its nodes are taken
 pool: [ '<card key>', ... ],      // what was sent here, nothing chosen yet
 at}
```

Measured, not guessed: a card key on this site averages 21.8 characters (6,676 of them; the longest is 64). A
file with a 60-card pool, ten gear picks, twelve clusters and five supports is **3,160 bytes as JSON, 1,172
gzipped**. A 60-card pool on its own is 2,108 bytes. The cap we would set is **16 KB a file** — five times
the measured size, and a file over it is refused with its size on screen rather than silently trimmed.

### What the free plan gives

Read on 23 Sep 2026 from Cloudflare's own pages: D1 is **5 million rows read a day, 100,000 rows written a
day, 5 GB stored** (D1 pricing), and **requests to static assets are free and unlimited** (Workers static
assets billing), so only the paths in `wrangler.jsonc`'s `run_worker_first` and `/api/*` spend the worker's
**100,000 requests a day**. An index adds a second written row whenever the indexed column is written; the
site's own tracking already counts its writes that way (`worker/dash.js`).

### Two storage shapes

| | **A. One row per file** | **B. One row per pooled card** (the shape `pins` already has) |
|---|---|---|
| A save | 1 row written, 2 with the index | 1 row for one card; 120 to write a 60-card pool |
| Opening a file | 1 row read | 60 rows read |
| At the 100,000 writes a day | 50,000 saves | 833 pool builds |
| At the 5,000,000 reads a day | 5,000,000 opens | 83,333 opens |
| Busiest day we have seen, 347 visitors: A at 20 saves each, B at one 60-card pool each | 13,880 rows, **13.9%** of the write limit | 41,640 rows, **41.6%** |
| What it costs to change one card | rewrite the file (3 KB) | one row |
| What it costs to read a pool | one round trip | one round trip, 60 rows |

**Ship A.** B is tidier on paper and three times more expensive on writes and sixty times on reads. The file
is already small enough that rewriting it whole is cheaper than tracking rows, and one blob is one read.

### The traffic it has to fit inside

The dashboard's saved answers from the live site on 21 Sep 2026 (`tools/dev/dash-fixture/cloudflare.json`):
**61,731 zone requests and 789 unique visitors** over the week it returned, with the busiest day at 29,981
requests and 347 uniques. Most of those requests are static files, which are free.

A builder session costs, at most: 1 list, 3 opens, 20 saves = **24 worker requests**. At 347 visitors all
building, that is 8,328 requests — **8.3% of the day's 100,000** — and 13,880 written rows — **13.9% of the
day's 100,000**. Storage: keeping a tenth of the database (536,870,912 bytes) for build files holds **169,895
files at the measured size, 32,768 at the hard cap**.

### So: x = 3 open, y = 12 kept

| | Number | Why that one |
|---|---|---|
| **x**, open at once | **3** | It is a UI number, not a cost one. Three checkboxes and three names fit one popup row on a 375-pixel phone, which is the width the guard already tests. Three is also what a player compares: what they run, the idea, and the cheap version of the idea |
| **y**, kept | **12** | A list of 12 is one phone screen. In the grid a list draws 4 lines and counts the rest, and the popup draws all 12 — the frame's own rule, no new behaviour. 12 files an account is 38 KB, so the reserve above holds 14,157 accounts at the measured size and 2,730 at the hard cap |
| **guest** | **3, in the session** | A guest has no account to keep them in, so a guest keeps exactly what is open. `sessionStorage`, one key, the same store and the same try/catch the bench uses. 3 files is 9 KB against the 5 MB a browser gives |

**Two guards on top**, because the arithmetic above assumes a player, not a script:

- **A save writes at most once every 10 seconds**, and only when something changed. A one-hour session is
  then 360 saves at worst, 720 rows.
- **60 saves per file per day per account.** Twelve files at that cap is 1,440 rows a day for one account,
  so one account cannot take more than 1.4% of the write limit however hard it tries.

Neither number is near the limit today. That is the point of writing the arithmetic down: **x and y are set
by what a player can hold in their head, because cost does not bind until roughly 4,000 building sessions a
day**, which is twelve times the busiest day the site has had.

### Accounts are not live yet

`worker/migrations/0001_accounts.sql` declares `users`, `sessions` and `pins`, and **nothing serves them**:
there is no sign-in route in `worker/index.js` today. So the guest path ships first and works on its own, and
the account path is one migration and one route behind it. The builder must not assume an account exists; a
file is a file whether it lives in the session or in D1, and the only difference is how long it lasts.

## 1.4 The budgets

A budget says how many more of a thing the build can still take, and what is already spent. Every number in
it is the game's own, off `data/craft.json`:

| Group | Slots | Modifiers a Rare may hold | Augment sockets |
|---|---|---|---|
| Armour | body, helmet, gloves, boots, shield or buckler or focus, quiver | 3 prefix / 3 suffix | body 2, helmet, gloves, boots, shield, buckler, focus 1, quiver 0 |
| Jewellery | amulet, two rings, belt | 3 / 3 | 0 |
| Weapons | the weapon set, offhand where the weapon allows one | 3 / 3 | 2 on the two-handers, the bow, the crossbow, the quarterstaff and the talisman; 1 on the one-handers, the wand, the sceptre, the spear, the flail and the dagger |
| Jewels | the sockets the tree gives — 18 on the tree today | 2 / 2 | 0 |
| Flasks and charms | life flask, mana flask, charms as the belt allows | 1 / 1 | 0 |

A base may move its own caps and the game writes it on the item (`+1 Prefix Modifier allowed`); the bench
already reads those lines off the implicits, and the builder reads the same ones from the same place.

Uniques and rares are one budget per slot, not a count of their own: a slot holds one item, and the budget
says which of the two it is holding. A rare's budget is the affix caps above, and the row counts them. A
unique carries the lines the game gives it, so there are no affixes to spend and the row lists what it
carries instead of showing `0/6` against something that was never going to fill.

Gems and supports: **469 active skills, 631 supports and 44 spirit gems** in `data/explore/gems.*.json`. How
many supports a skill may socket is the one number in this section that **is not in any file we read** —
neither our gem data nor the game export's skill gem file carries a socket count (checked 23 Sep 2026). Until
it is, the support budget counts what the player has picked and says *the game decides how many fit*, rather
than printing a cap nobody published.

### Two ways to draw a budget

**Option A — budget rows on the build card.** The bench's item panel already draws exactly this shape: a
heading with a count beside it (`Augment sockets 1/2`), a list under it, sides labelled and counted. One row
per slot, the count on the right, what is in it under.

*Cost:* one field type (`budget`), one `TYPE` function, the bench's own CSS shapes reused. Roughly 20 rows on
one card, which is a list inside a block: 4 lines in the grid, all of them in the popup, the frame's rule
unchanged.

**Option B — budget chips over the pool.** The chips over the home page's search, one per slot, each carrying
its count (`Helmet 0/1`, `Supports 3`). Tapping a chip filters the pool to what fits that slot.

*Cost:* no new field type at all — the chips exist (`CHIPS` in `assets/kinds.js`, drawn by `assets/app.js`).
But a chip holds a word and a count, not a list, so it can say how much room is left and never what is in it.

**Ship both, for different jobs.** A is the budget; B is the filter over the pool. They are not two designs of
one thing: the card has to show what is spent, and the pool has to be narrowed to what fits. Neither is new
furniture. The rule that keeps them apart: **the budget rows are the truth, the chips are a view of it**, and
a chip never shows a number the rows do not.

### Inside a budget row: the sliders that already exist

A rare with an affix not chosen is the one place the builder needs a player to say *how good*. That control
is already built twice over. The Craft tab draws one row per modifier family with the Trade panel's number
box and slider beside it, the tiers as bands on the track (T1 the best roll, shaded cool to hot), a corner
reading `N of M tiers` for what this item level can reach, and the tiers it cannot reach greyed out
(`valHTML` and `syncVal` in `assets/trade.js`, used by `assets/craft.js`).

Opening a budget row shows exactly that: the modifiers the slot's own pool can roll, each with its slider and
its bands. Setting one is what tells the maths what to count, and what tells the optimiser what to aim at.
**No new control, and the same slider a player already used on Trade and on Craft.** The band the slider
lands in is the floor of the range in section 3.5; what it cannot reach at this item level is greyed, not
hidden, because a player choosing a base needs to see what raising the item level would buy.

### Why the budget is not money

A rare has no price. `data/market.json` on the live site (checked 23 Sep 2026, written 03:00 UTC) prices
**661 currency rows and 642 of the 695 uniques it carries** — and no rare, ever, because a rare is not a
listed thing. So a budget counted in currency could only ever be right for part of a build, and the frame's
own rule for a missing price is to draw nothing rather than a zero.

What the builder does instead: **the counts are the budget, and the price rides along where there is one.**
A unique in the pool shows its live price beside it, the way every card already does. The build card's foot
carries one line — *Priced: 7 of 11 picks* — and never a total that quietly leaves the rares out.

## 1.5 The gear preview and its mouseover

Small, one slot per piece, filled in the frame's own fixed order (armour, then jewellery, then the weapon
set, then jewels, then flasks and charms), with an empty box where nothing is chosen — the same way the
card's head keeps its art box whether or not there is art.

**Option A — the card, in a box beside the slot, on hover.** The preview slot is a small tile; a pointer over
it draws the card the site already draws, floated beside it.

*Cost:* one field type (`gear`), one `TYPE` function, and placement code. **It is not a new component**: the
card is the established element and the box is only where it sits. The cards are already styled as tooltips
(`assets/theme.css`, "the card as a tooltip").

**Option B — no hover at all: the tile opens the popup.** Tap or click, the card opens on the trail, Back
returns.

*Cost:* nothing beyond the tile. And the card is fuller than a hover box can be.

**Ship A on a pointer, B on touch — the same card either way.** A phone has no hover, so a hover-only design
would be a design for half the visitors; the guard already tests the site at 375×812 with touch. The rule:
**hover previews, tap opens**, and the two show the same card.

### "The stats actually possible on it"

This is the part that must never be an invented ideal. For a slot holding a **rare**, the preview's card shows
the base and the modifiers that base can roll at that item level — which is the `canroll` field the base card
already draws, off `data/craft/<class>.json`, the game's own pool. For a **unique**, it is the unique's own
card, with the ranges the game prints. Nothing is composed: what the mouseover shows is a card that exists.

Where the pool is one the bench rolls evenly, the preview carries the bench's own line — the count of
modifiers with no measured weight — because it is the same data and the same gap.

## 1.6 What #51 does not settle

- ~~**How many supports a skill can socket.**~~ Settled for #54: up to 5 supports, and 6 in total where one
  skill gem casts another. The owner's own knowledge of the game, 23 September 2026 — the export still states
  neither, and `assets/maths.js` `SOURCE.sockets` says so wherever a count is drawn.
- **What an account costs**, because accounts are not live. The arithmetic above assumes a file per account
  and a save per player; a sign-in route will add its own reads.
- **Sharing a file.** Out of scope here: a file is the player's own until a ticket says otherwise.

---

# 2. Passives as clusters

*[Issue #52](https://github.com/metaseonso/wraeclast-index/issues/52)*

## 2.1 What we ship, and what a cluster needs

`data/explore/tree.d94ecbfeea.json` is 1,352,363 bytes and holds **5,152 nodes**: each one's name, its
effect in the game's words, the keywords in it, its region or ascendancy, and its own stat keys (1,420
distinct ones, never shown to a player). From those, `tools/treecards.py` builds the **2,112 passive cards**
the index carries: 1,169 notables, 33 keystones, 893 small passives and 17 anoints.

What it does **not** hold, checked field by field: **no position, no group, no connection between nodes**.
Every way of cutting clusters needs at least one of the three.

The game's own tree file does hold them — `passive_skill_trees/Default.min.json`, which `tools/treecards.py`
already fetches for node pictures. It carries **1,623 groups** with their coordinates, each node's orbit and
its place on it, and **6,069 connections**. So the data exists at build time and is not shipped. That is the
one new file this slice needs.

Counted off that file, ignoring ascendancy nodes and ascendancy starts, **the main tree is 4,483 nodes**:
3,080 named smalls, 984 notables, 33 keystones, 368 plates with no effect, and 18 jewel sockets. 5,393 of the
6,069 connections have both ends on it.

## 2.2 Three ways to cut a cluster, with the counts

| | **A. By notable** | **B. By the tree's own groups** | **C. By a radius** |
|---|---|---|---|
| The rule | every node belongs to the nearest notable or keystone, counted in steps along the tree | a cluster is one of the tree's 1,623 groups | every node within *r* of a notable is in its cluster |
| Clusters | **1,017** | **1,369** hold a main-tree node | 1,017, one per notable |
| Nodes covered | **4,477 of 4,483** | 4,483 of 4,483 | at r=335: 2,774. At r=500: 3,945. At r=800: 4,443 |
| Size | mean 4.40, median 4, max 19 | mean 3.27, median 1, max 21 | at r=500, mean 7.72 members |
| What it gets wrong | **788 nodes are the same number of steps from two notables.** 66 clusters are a notable on its own. 6 nodes reach no notable at all | **638 groups hold no notable**, so 638 clusters (728 nodes) have no name to be called by. 206 groups hold more than one notable, so the name is a list | **a node lands in several clusters at once** — 1.99 times over at r=500, 4.38 at r=800. At r=335, 42 notables have nothing near them and 1,709 nodes are in no cluster at all |

The **Size** row above counts each node once, for one notable, which is the cheapest way to measure a cut.
The rule we ship does not do that — see below — so the shipped clusters are a little bigger: **mean 5.66,
median 5, largest 23, and 17 clusters that are a notable on its own.**
| What it costs | one breadth-first pass at build time | nothing: read the groups | one distance check per node per notable |

**Ship A, the notable cut.** Three reasons, in order:

1. It is the only one of the three that gives **every cluster a name a player already knows**. 1,016 of the
   1,017 notables have a card on this site today, so the cluster's name is a card, not a label we wrote.
2. It matches how a player talks — "the quarterstaff cluster" is the notable and the smalls you walk through
   to reach it — and it is what a build actually buys.
3. Its failure is bounded and countable: 788 contested nodes out of 4,483, and the rule for them is stated
   below rather than left to a tie-break nobody can see.

**What it gets wrong, stated on the card.** A contested node is genuinely in two clusters. We do not pick a
winner: **a node the same number of steps from two notables is in both clusters, and both say so** — the
cluster card's own line reads *3 of these are shared with another cluster*, and taking the node in one build
takes it in both. Points are counted once, which is what matters; the display is what is shared, not the
cost. The alternative — giving it to the lower-numbered notable — would make a cluster's contents depend on
an internal ordering a player cannot see, which is the kind of thing the frame exists to stop.

Counted with the tie carried down the branch rather than stopped where it starts, **862 of the 4,483 nodes
sit in more than one cluster** — 19% of the tree. That is the real size of this cut's one flaw, and it is a
number on the card rather than a decision made behind it.

The 6 nodes that reach nothing are one node named like a working title and five jewel sockets sitting on
their own. They are counted and named as **outside every cluster**, the way the map counts what it left out.

**Against the 2,112 cards we ship:** the clusters name **1,016 notable and keystone cards and 804 small
passive cards, 1,820 of the 2,112**. The remaining 292 are the ascendancy nodes (186 notables and keystones,
89 smalls) — which are chosen by class, never walked to, so they are not clusters — and the 17 anoints.

## 2.3 A cluster is a kind

A cluster is a thing the index carries, so it is a kind with its own declaration, never a hand-written list.

```js
{k: 't', one: 'Cluster', many: 'Clusters', place: 'Passive tree', sec: 'tree',
 index: true, search: true, mark: 'ls',
 fields: [...HEAD, 'region', 'points', 'shared', ...BODY, ...FOOT],
 acts: ['pool', 'full', 'open'],
 rel: ['incluster', 'clusterof', ...KWUSE, 'cat']}
```

**Two new fields, both of them the frame's existing types** — so this is move 1 in the frame's own table, a
word each, not a new renderer: `points` (a number with a word after it, "7 points inside") and `shared` (a
number, "3 shared with another cluster"). `region` already exists and is already declared on passives.

**Two new relationships:** *Nodes in this cluster* and *Cluster it sits in* — the two ends of one edge, the
same pair a unique and its base item already have. A shared node answers with two rows on the second one, and
says so, which is a group with more than one member and nothing new to the frame.

The rows come from one new tool, `tools/clusters.py`, run after `tools/treecards.py`: it reads the game's own
tree, does the one breadth-first pass, and writes the cluster rows into the index. **No card code.**

### The two files it ships

| File | Bytes | Gzipped | What is in it |
|---|---|---|---|
| The tree's shape | 109,627 | 43,481 | 4,483 positions, 5,393 edges, what kind each node is |
| The clusters | 61,242 | 23,119 | 1,017 clusters, each with its notable and its members — 4,741 memberships, shared nodes counted in both |

Both are fetched the first time a card asks for them and never in first paint, the way a field with a `file`
already works. For scale, the tree drill-down already ships 1,352,363 bytes.

## 2.4 How a cluster reads

**Option A — a card of its own.** Name the notable's name, sub line *Cluster · Ranger region*, body the
notable's own effect lines, then the members under Connections: *Nodes in this cluster (7)*, eight rows
before a **See all**, exactly as every other group works.

*Cost:* one kind, two relationships, two fields. It also means a cluster is searchable, is on the map, has a
price box it never fills, and is reached by every route a card is reached by — for free.

**Option B — a strip on the notable's card.** No new kind: the notable card grows a block listing the smalls
around it.

*Cost:* one field type, and it breaks two rules to do it. A notable card would carry a thing that is not the
notable, and the body slot is already at 3 of 6 on the widest passive card with 5 in the popup. Worse, a
cluster could not be searched for, chipped, pooled or connected, because it would not be a card.

**Ship A.** The vision this site is built on is that every card is a node and every related thing is a
clickable edge. A cluster that is not a card is a dead end.

### Inside the builder

The cluster in a build is the card, plus a **sub-option: which nodes in it are taken**. Two shapes exist on
the site for a list of names inside a card, and the choice between them is about what a row has to carry:

- **The keyword chips** (`keywords`, drawn in the popup) — small, name only, tap to open. Cheapest, and right
  for a cluster of 3 or 4 nodes with nothing to say about each.
- **The bench's sides** — a heading with a count (`Taken 5/7`), one row per node, each row a toggle with its
  own words beside it. The shape the bench already draws for prefixes and suffixes.

**Ship the bench's shape.** A row here has to carry three things a chip cannot: whether the node is taken,
what it gives, and whether it is shared with another cluster. Nodes shared with another cluster carry the
word *shared* in the row, so turning one on is never a surprise somewhere else. The chips stay where they
are, on the cluster card in the popup, as the way into each node's own card.

## 2.5 Pathing

**A cluster's cost is the points to reach it from what is already allocated, not the points inside it.**

The rule, in full:

1. The allocated set starts as the class's own start node, and grows with everything the player has taken.
2. A cluster's **entry cost** is the fewest steps from any allocated node to any node of the cluster.
3. Its **inside cost** is the nodes taken within it.
4. The cluster's cost is the two added, and the card shows them apart: *4 to reach, 5 inside, 9 points*.
5. Taking a second cluster is counted after the first, because the first may have paved half the road. The
   order the player took them in is the order they are counted in, and the card says so.
6. Nodes on the path that belong to no cluster are still points. They are counted and named as **path**, not
   folded into a cluster that did not ask for them.

**What it costs to run.** A breadth-first pass over the whole main tree — 4,483 nodes, 5,393 edges — takes
**1.03 milliseconds** on this machine (measured over 200 passes, 205.8 ms total), and one from the six class
starts takes 3.15 ms the first time. So the builder re-runs pathing on every change and never needs to be
clever about it. For scale: the median notable is **16 steps** from the nearest class start, the closest 5,
the furthest 23.

## 2.6 The tree preview

Beside the gear preview, filling the same way: a small picture of the main tree with what is allocated lit,
the clusters taken in the card's own colour, and the path between them drawn as a line. It is drawn from the
shape file above, which is why that file exists.

It is drawn once per change, not per frame, and the whole tree is 4,483 dots and 5,393 lines — the map
already draws 6,676 dots and 25,477 lines in one picture, so this is under a third of the work the site
does today.

## 2.7 Time-lost and timeless jewels

What the data says:

- **Time-Lost jewels** are four base items — Diamond, Emerald, Ruby, Sapphire — with their own pools of 160,
  77, 53 and 60 modifiers in `data/craft/jewel.json`. Two of the wordings in those pools are the ones that
  matter here: *increased Effect of Small Passive Skills in Radius* and *increased Effect of Notable Passive
  Skills in Radius*. A jewel's own affixes roll the same way everything else does, and jewels are a pool
  nobody has measured, so the bench's line applies to them here too.
- **Timeless jewels** are two uniques in the game today, Heroic Tragedy and Undying Hate. Each says
  *Passives in radius are Conquered by* a faction, and rolls one conqueror. `data/explore/jewels.*.json`
  carries seven factions and 28 conqueror rows; five of the seven have no item in the game.

**What is missing:** the radius in game units. No file we ship carries it, and the game export we read
(23 Sep 2026: its full file list, the tree, the jewel pools, `data/index.json`, `data/craft/jewel.json`) has
no jewel radius table. The tree's own orbit radii are in the file — 0, 82, 162, 251, 335, 493, 662, 846,
1080, 1332 — so a radius stated in those units could be drawn exactly, the day one is published.

**The rule, until a radius is published:** a jewel is a choice in the build like any other. It is socketed
against **a cluster the player names**, not a distance we made up, and the player says which of that
cluster's nodes it changes. The jewel's own lines say what the change is — the effect of the smalls, the
effect of the notables, or the conqueror's own wording — and the builder's numbers move with that.

The card carries one line: *The radius is not published, so this jewel covers the cluster you socketed it
against.* This is the same shape as the bench's Vaal Orb — the outcome is offered and the player picks one to
work with, rather than a number nobody has being rolled behind them. It is the only reading of this that
invents no distance, and the day a radius is published the clusters inside it can be worked out exactly,
because their positions are in the shape file already.

## 2.8 What #52 does not settle

- The radius, in game units, of any jewel.
- Which conqueror a given timeless jewel seed gives, node by node. The factions and conquerors are in the
  data; what a seed does to each node is not.
- Ascendancy nodes as clusters. They are chosen by class, so they are a separate choice in the builder, and
  the tree carries 36 ascendancies, 14 of which the files still mark as unused.

---

# 3. Effective HP and DPS, live, as a range

*[Issue #53](https://github.com/metaseonso/wraeclast-index/issues/53)* — the heaviest piece.

The bar the owner set is *more sophisticated than Path of Building*. Section 3.8 says plainly where that is
reachable and where it is not. The short form: **more sophisticated about what it does not know, not about
how many interactions it covers.** PoB covers more; it also answers with one number where the number is a
guess. Ours answers with a range and names what widened it.

## 3.1 What v1.0 covers, and what it does not

The model reads lines. Here is how many lines there are, and how far a first pass gets.

| Source | Lines | Distinct wordings once the numbers are taken out |
|---|---|---|
| Craftable modifiers, all 31 item classes | 7,206 | 477 |
| Unique items | 3,657 | 1,059 |
| Passives | 5,996 | 1,530 |

A keyword sweep over those wordings — anything naming damage, life, mana, energy shield, armour, evasion, a
resistance, attack or cast speed, critical, accuracy, an attribute, block, penetration, a level, added
damage, spirit, leech or regeneration — covers:

| Source | Wordings a core model reads | Share of the wordings | Share of the **lines** |
|---|---|---|---|
| Craftable modifiers | 290 | 61% | **85%** |
| Unique items | 573 | 54% | **72%** |
| Passives | 965 | 63% | **69%** |

That sweep is a measurement of the shape of the work, not a built model. What it establishes is the thing
worth knowing before building one: **a few hundred wordings carry most of the lines**, and the long tail is
long — 451 unique wordings appear on exactly one item, and 205 of the 710 uniques carry at least one such
line.

**v1.0 covers:** life, energy shield, mana, armour, evasion, block, the four resistances and their maximums,
the attributes and their requirements, added and increased and more damage by type, conversion and gained-as,
critical chance and bonus, attack and cast speed, accuracy, penetration, skill and support levels, charges,
and flasks.

**v1.0 does not cover, and says so on the card:** damage over time and ailment magnitude, minions, totems and
triggers, recoup and leech over time, aura and curse interactions on other creatures, stun, and anything a
line describes as a behaviour rather than a number. A build with one of those in it gets its numbers **and a
line saying which part of it is not in the count** — never a number that quietly leaves it out.

**Why not everything at once:** because a wording nobody mapped is a silent zero, and a silent zero is worse
than a stated gap. The count of mapped wordings is printed by the build tool on every run, the way
`tools/craft.py` prints its weight coverage, so the gap is a number that moves rather than a feeling.

## 3.2 The order of operations

It is the order the mechanics cards already ship, because they and this must never disagree. Both read from
one place: `tools/mechanics.py` writes the cards, and the model's step list is generated from the same table,
so a change to one is a change to both or the check fails.

**A hit you deal**, in order: base damage (the weapon's, or the skill's) → added damage → conversion, skill
first then everything else, capped at 100% out of a type → gained as extra → the increased and reduced sum
for the type the damage now is, applied once → each more and less as its own multiplier → critical hits.

**A hit you take**, in order: evasion and block decide whether it arrives → armour and resistance each cut
what does, as two multipliers on the same damage, so neither is before the other → then the pools take what
is left: energy shield, then mana under Mind Over Matter, then life.

Two numbers stated on the cards that the model uses as written: armour reduces a hit by armour divided by
armour plus ten times the hit, capped at 90%; the default maximum resistance is 75% and cannot go above 90%.

## 3.3 Where every number comes from

| Number | Source | Already on the site |
|---|---|---|
| Base damage, cast time, crit base, tags and levels of every gem | the game files | `data/explore/gems.*.json` |
| Which supports a skill may take | the game files: the skill's own type list against each support's allowed list | `data/explore/gems.*.json` |
| Every passive's effect | the game files | `data/explore/tree.*.json`, and the 2,112 cards |
| What a base can roll, at what level, in what range | the game files | `data/craft/<class>.json` |
| Affix caps and socket counts per item class | the game files | `data/craft.json` |
| A class's starting life, mana, attributes, unarmed hit and attack time | the game files | `data/gamestats.json`, the eight played classes |
| One monster of each level: life, damage, accuracy, armour, evasion | the game files | `data/gamestats.json`, 100 levels |
| The order of operations, the armour curve, the caps | the game glossary where it states them, **Path of Building** where it does not — named on the mechanics card that states each one | the eight mechanics cards |
| Prices | the in-game Currency Exchange and live trade listings | `data/market.json` |

**What a hit is measured against.** DPS against nothing is a number with no meaning. The builder measures
against **one monster of the level the player sets**, out of the game's own table — its armour and its
evasion for what you deal, its damage and accuracy for what you take. The level is a control on the card, it
defaults to the character's own level, and the number always carries it: *against a level 82 monster*. That
is a thing PoB does with a configuration screen; here it is one line under the number.

## 3.4 Two ways to build the model

**Option A — one stat table, filled by reading wordings.** Every line from every source is turned into
entries in one table: which stat, whether it is flat, increased or more, and the number. The maths then runs
over the table and knows nothing about where a line came from.

*Cost:* one wording-to-stat table of a few hundred rows, built by a tool and checked on every run. Every
source shares one reader, so a new unique with a known wording needs nothing. Measured: **3.1 microseconds** a
pass over 400 lines on this machine.

*What it is bad at:* a line that is a behaviour rather than a number ("Projectiles Chain an additional time")
has no place in the table, and must be refused rather than approximated.

**Option B — a rule per wording.** Each wording gets its own small function.

*Cost:* 1,333 functions for the craft and unique wordings alone, plus 1,530 more for the passives. Every one
is a place for a bug that only a specific item can show.

**Ship A.** B is what a model turns into when it grows without a shape; A is what it has to be to be checked
at all. The behaviours B would cover are the ones A names as uncovered, which is the whole argument of this
section.

**A thing we already have that helps:** the site's Trade panel matches a line to a trade modifier by its
wording with the numbers taken out (`key()` in `assets/trade.js`). Measured against that same table, **94.8%
of craftable wordings (452 of 477) and 74.4% of unique wordings (788 of 1,059) already match something.** So
the wording-to-stat table is being built against a matcher that already works on this data, not from nothing.

## 3.5 The range

**Every answer is two numbers and a reason.** The floor is what you have if every unknown goes against you;
the ceiling is what you have if every one goes for you. When nothing is unknown, the two are equal and the
card shows one number.

What widens it, and by how much:

| What | How it widens | What the card says |
|---|---|---|
| A modifier that has not been rolled yet (an empty affix on a rare you plan to craft) | the floor takes the bottom of the range the game prints, the ceiling the top | *2 affixes not rolled yet* |
| An interaction recorded as unknown | the floor assumes it does not work, the ceiling assumes it does | *Widened by:* and the unknown, named |
| A wording v1.0 does not read | **it does not widen the range** — it is left out of the count and named | *3 lines are not in this number* |
| A pool with no measured weights | nothing: the builder never rolls, so weights do not enter | — |

For each unknown the card carries a switch — *as if it works* / *as if it does not* — the same `swap` field
type the site already has for the notable that changes what a pair of gloves is. Set either way, the range
narrows and the card records which way it was set. Set nothing, and the range stays wide.

**The rule that makes the range worth reading:** a range widened by an unknown always names it. A range with
no name beside it is a range from unrolled modifiers and nothing else.

**Where the unknowns come from.** The interaction map is its own ticket
([#58](https://github.com/metaseonso/wraeclast-index/issues/58)) and is not built. Until it is, v1.0 carries
its own short list — one row per interaction it meets and cannot settle, written where the mechanics cards
are written, so there is one place and not two. The day #58 ships, the list is read from it and this one goes
away. The builder must not wait for #58: an unknown it does not know about is a wording it does not read,
which is already counted and named by the rule above.

## 3.6 What it costs to run

Measured on this machine with a stand-in that does the same shape of work — rebuild the stat table from 400
lines, work a hit out in the order above, then the defence side over four damage types:

| | Time | Passes a second |
|---|---|---|
| One evaluation | 3.1 microseconds | 326,675 |
| A range: a floor and a ceiling | 6.3 microseconds | 158,746 |
| A range with three unknowns taken both ways (eight corners) | 27.0 microseconds | 37,090 |

Parsing 400 lines of game wording into a stat table costs 36 microseconds a pass on top, which is why the
table is built once per change and not once per evaluation.

**On a phone.** We have not measured one. Taking a phone at a fifth of this machine's speed — an assumption,
stated as one — a full range is 32 microseconds, and a change to the build repaints in well under a frame.
The cost that matters on a phone is not the maths; it is drawing the tree preview, which is why the preview
is drawn once per change.

## 3.7 The check

`node tools/dev/buildcheck.mjs`, the way `simcheck.mjs` proves the bench: the committed data, a fixed seed,
no network, nothing written.

**What the seed is for.** The maths has no randomness in it — the same build gives the same numbers, always.
The seed drives the builds the check makes up: a seeded generator that assembles legal builds out of the real
data, thousands of them, and holds each one to the guards below. Same seed, same builds, so a failure can be
reproduced from its number. `--seed` and `--builds` are the switches, as `simcheck.mjs` has `--seed` and
`--rolls`.

**Against Path of Building, without running Path of Building.** A PoB build code is compressed XML, and the
XML carries PoB's own answers: `Life`, `EnergyShield`, the four resistances, `PhysicalMaximumHitTaken` and
its three siblings, `FullDPS`, `CombinedDPS`, `Speed`, `AverageHit`, the attribute requirements. The site
already reads every one of them (`assets/build.js`). So the check is:

1. A folder of committed build codes — one per case both models cover: an attack build, a spell build, a
   conversion build, an energy shield build, an armour build, a block build, a crit build, a build at level
   1 and one at 100.
2. For each, read the gear, tree, gems and supports out of the code, run our model, and compare our numbers
   against PoB's own from the same file.
3. Print one row per stat: PoB's, ours, the gap in percent, and whether the gap is inside the band.

**The bands.** Life, energy shield, mana, armour, evasion, the resistances and the attributes are exact
arithmetic on both sides: **the band is zero, and a difference of one point is a failure.** Damage is not —
PoB makes configuration choices we do not — so the band there is **5%, and only when our range contains PoB's
number**. A case where our range does not contain PoB's number fails, whatever the percentage, because that
is the whole claim of a range.

**And the guards**, one per rule the model must never break:

| # | What it proves |
|---|---|
| 1 | the order of operations in the model is the order in the mechanics cards, generated from the one table, so the two cannot drift |
| 2 | a wording the table does not know is counted and named, never silently zero |
| 3 | an unknown taken both ways gives a floor no higher than the ceiling, for every unknown on the map |
| 4 | no number is shown without the monster level it was worked against |
| 5 | armour never reduces more than 90%, a resistance never above its maximum, and neither is applied before the other |
| 6 | a support the skill's own type list does not admit can never be socketed, and a skill with no legal support says so |
| 7 | a build with no gear still answers, with the class's own starting numbers |
| 8 | two runs with the same seed and the same build give the same numbers, byte for byte |

Guard 1 is the one that will fail first: it breaks the next time a mechanics card is edited without the model
following, which is exactly when this file needs reading again.

## 3.8 "More sophisticated than Path of Building"

**Where that is reachable.**

- **Saying what is not known.** PoB answers with one number. We answer with a range, name the unknown that
  widened it, and let the player set it either way. This is reachable today and it is the whole of the bar
  worth aiming at.
- **Agreeing with what we publish.** Our order of operations is generated from the same table that writes the
  mechanics cards. A player can read the card and then read the number and find the same rules. PoB's
  calculations and its own notes are separate things.
- **Naming the source of every number on screen.** The game's export first; Path of Building named where a
  formula is theirs. PoB does not distinguish, in its output, between a value from the game's files and a
  value its authors worked out.
- **Being a card.** Every input in the build is a card on this site, with its Connections, its price, its
  keywords and its mechanics doors. In PoB an item is an input to a calculation, not a page you can read.

**Where it is not reachable, and should not be claimed.**

- **Coverage.** PoB has years of per-skill handling — minions, totems, triggers, ailments, every unique with
  a behaviour on it. v1.0 covers roughly 85% of craftable lines and 72% of unique lines, and the rest is
  named as uncovered. That gap does not close by design; it closes by grinding through wordings.
- **Per-skill exactness.** PoB models a skill's own quirks one by one. We model a skill from its own data —
  base damage, tags, types, crit, cast time — which is right for most skills and approximate for the ones
  built around a behaviour.
- **Configuration.** PoB has a screen of switches for enemy state, buffs and conditions. We have the monster
  level and the unknowns; everything else is what the build itself carries.

**So the claim we make on the card is the one we can keep:** *Worked out from the game's own data, in the
order the mechanics cards state. Where an interaction is not known, the range says so.* Not *better than Path
of Building*.

---

# 4. The optimise button

*[Issue #54](https://github.com/metaseonso/wraeclast-index/issues/54)*

One button. It says plainly that it is not perfect. It takes what the player has chosen and fills what is
still open toward **offence**, **defence** or **balanced**.

## 4.1 What it searches over

**Only what is open, and only out of the pool plus what the game allows.**

| Open thing | The candidates |
|---|---|
| An empty gear slot | the items in the pool that fit it, plus the rare bases that fit it |
| A rare with affixes not chosen | the modifiers its own pool can roll at that item level, one per side per step |
| An empty support socket | the supports the skill's own type list admits — **a median of 243 per skill** in the export the count was taken from. What ships to a browser is the card index's own tags, which reads a median of **170** over its 458 skills; the card prints the count for the skill in hand, worked out rather than quoted |
| Points not spent | the clusters not taken, entry cost counted from what is allocated |
| A jewel socket | the jewels in the pool |

**It never replaces a choice.** A slot the player filled, a modifier they picked, a cluster they took: the
search treats all of them as fixed. That is not a preference, it is what makes the change list below
meaningful.

**Why brute force is not on the table:** five supports chosen from a median 243 is **6,774,333,588
combinations**, before gear, before the tree. Even at 6.3 microseconds an evaluation that is 12 hours.

## 4.2 Two searches

**Option A — greedy with a beam, and a fixed step budget.** At each step, take every single change available,
score each one, keep the best *k*, and go on from all of them. Stop when nothing improves or the budget runs
out.

*Cost per step:* candidates × evaluations. A full step over an average build is roughly 243 supports + ~400
tree moves + ~60 pool items + ~40 modifier choices ≈ 750 candidates, so one step is 750 × 6.3 µs = **4.7
milliseconds** here, or about 24 ms on a phone at the assumed fifth of the speed. With a beam of 4 and 20
steps: **377 milliseconds here, under two seconds on a phone.**

*What it is bad at:* two changes that are only good together. It will not find a support that is worthless
until a cluster is taken.

**Option B — branch and bound over the budgets.** Treat each budget as a container, bound each branch by the
best it could still reach, and prune.

*Cost:* a bound that is any good needs to know the best a stat can still become, which means knowing how each
candidate interacts with the rest — which is the thing we cannot compute cheaply. Without a tight bound it
degenerates into the same search with more bookkeeping. And the interactions that make a good bound hard are
exactly the ones v1.0 does not model.

**Ship A, with one repair for its weakness:** after the greedy pass settles, run a **pair pass** over the top
40 candidates it rejected, two at a time — 780 pairs, 4.9 ms here — and take a pair if it beats the settled
answer. That catches the common case of a cluster and the support that needs it without paying for a general
two-change search.

## 4.3 How long it may run

| | Here | On a phone (assumed a fifth of the speed) |
|---|---|---|
| Candidate evaluations in 250 ms | 39,686 | 7,937 |
| ...in 3 seconds | 476,238 | 95,247 |

**The budget:** a **first answer in 250 milliseconds**, and a **full pass capped at 3 seconds**. The first
answer is the greedy pass with a beam of 1 — 20 steps at 4.7 ms is 94 ms here, and about 10 of the 20 steps
on a phone, which the card says. The full pass is the beam of 4 plus the pair pass: 381 ms here, about 1.9
seconds on a phone. In between, the answer improves and the button says how far it has got. The work is done
in slices between frames, so the page never stops answering; the site already keeps state on a card across
Back and Forward, which is what makes an interruptible search safe here.

**It is the same machine as the live recommendations.** While the player is choosing, the same scoring runs
over the same candidates and puts the best few under the numbers as *what would improve this*. Optimise is
that machine, let run. There is no second engine, and a recommendation the panel shows is one the button
would take.

## 4.4 When the answer is not clean

Four cases, each with one answer.

| Case | What it does |
|---|---|
| **Two answers score the same** | it shows both, and takes neither. A tie is a choice, and the player makes it. The card names what separates them — cheaper, fewer points, fewer unknowns |
| **Nothing improves** | it says so, in those words, and says what it tried: *Nothing in the pool improves this. 750 changes tried.* An empty answer is an answer |
| **The unknowns decide it** | where the best change is only best under one reading of an unknown, it says which unknown and shows the answer both ways. It never picks the reading that flatters the result |
| **The budget ran out** | it says how far it got and what it left: *Stopped at 3 seconds, 14 of 20 steps. 3 gear slots and 11 points are still open* |

And the one line it always carries: **This is not the best build. It is the best of what it tried, out of
what you pooled.**

## 4.5 What it changed, and putting it back

Every change is a row. The bench's own pattern, which already ships: a log capped at 200 steps, an undo stack
capped at 20, both written to storage on every change (`docs/craft-sim.md`, "The state that survives a
refresh").

```
It filled 9 things                              [Put all back]
  Helmet          empty → a rare helmet, 3 modifiers picked     +412 hit taken   [Put back]
  Support 2       empty → <the support>                          +8.1% damage    [Put back]
  Cluster         not taken → taken, 5 of 7 nodes, 9 points      +6.4% damage    [Put back]
```

Rules:

- **One row per change, in the order they were made**, each with what it did to the numbers and a button that
  puts that one back.
- **Putting one back re-runs the numbers**, because a later change may have depended on it. If it did, the
  row for that later change says *depends on the one you put back* and offers to put it back too. It never
  silently unwinds a second change.
- **Put all back** returns the build to exactly what the player had before the button, byte for byte, out of
  the state written before the search started.
- The list survives a refresh and Back, because it is written where the bench's run state is written.

## 4.6 What it left on the table

Under the list, one block, counted:

- Budgets not filled: *2 rings, 1 jewel socket*.
- Pool cards it did not use, and why in one word: *doesn't fit the slot*, *worse than what is there*,
  *needs more attributes*.
- Points not spent.
- **What it cost, where there is a real price**: the pooled uniques and currency it used, at live prices, and
  a count of the picks that have no price rather than a total that pretends they are free.

---

## What we need and do not have

Everything the builder cannot do at v1.0, why, and what would close it. Nothing in this table is estimated in
the meantime; each row is either a refusal, a stated gap, or a range that widens and says so.

| What we need | Who would have it | What we do instead | What would close it |
|---|---|---|---|
| ~~How many supports a skill can socket~~ **Settled** | The owner, 23 September 2026. Still in no file the game publishes | a skill gem takes up to 5 supports, and a skill gem that casts another skill gem counts to 6 in total, so skill → skill leaves four. `SOCKETS` and `socketsLeft` in `assets/maths.js`, and `SOURCE.sockets` is printed wherever a count is shown | — |
| A jewel's radius in game units | GGG. Not in the tree file, the jewel pools or anything else we read | the player tells the jewel which cluster it covers, and the card says why | a radius table, in the tree's own orbit units or any other |
| What a timeless jewel seed does node by node | GGG. The factions and conquerors are in our data; the per-node result is not | name the faction and the conqueror, and let the player say what it changed | a published mapping, or a measurement with its method shown |
| Whether a support is legal beyond the type gate | GGG. **512 of the game's own 4,746 recommended support entries fall outside our reading of the allowed-type list** | admit what the type list admits, and show the game's own recommended list beside it | an excluded-type list in the export, or the minion type lists |
| The formulas for ailment magnitude, stun buildup and damage over time | Path of Building has them; the game states the rules and not the numbers | leave them out of v1.0 and name them on the card | mapping them, with PoB named — the same way the mechanics cards do it |
| Weights for jewel and flask pools | nobody, by the bench's own finding | never rolls in the builder, so it does not arise | — |
| Real prices for rares | nobody: a rare is not a listed thing | count budgets, never money, where rares are in them | — |
| A phone measurement | us | assume a fifth of this machine's speed and say so | run the guard's phone check with a timing pass in it |

**The pattern.** Four of the eight rows are a number GGG has not published, and the answer for a number is
always the same: say what is missing where it would have been. The rest are rules, and for a rule the builder
takes the smallest reading and prints what it took.

---

## What we could not confirm

Where we looked, what we found, and what is still open. Checked 23 Sep 2026.

| Question | Where we looked | What it said |
|---|---|---|
| Does our tree data carry positions, groups or connections? | `data/explore/tree.d94ecbfeea.json`, every field on all 5,152 nodes | **No.** Name, effect, keywords, region, ascendancy, stat keys, and nothing about where a node is or what it touches |
| Does the game's own tree carry them? | `passive_skill_trees/Default.min.json` from the export `tools/treecards.py` already reads | **Yes.** 1,623 groups with coordinates, each node's orbit and place, 6,069 connections |
| Is a jewel radius published anywhere we read? | the export's whole file list (23 files), the tree, `data/craft/jewel.json`, `data/index.json`, `data/explore/jewels.*.json` | **No.** The wordings name Small, Medium and Large rings; no file gives a distance |
| How many supports fit in a skill? | our gem data, the export's skill gem file, `data/index.json` | **No count anywhere.** The export's skill gem file has base item, colour, crafting level, gem type, granted skills, icon, recommended supports, requirement weights and tags |
| Is our reading of the allowed-type list right? | the game's own recommended support list, all 469 active skills | **Partly.** 4,212 of 4,746 recommended entries pass our reading, 22 name a support we do not ship, and 512 do not pass. Reading the list as "any of these types" instead gives 4,217. Both readings leave roughly 11% outside, so the type list is not the whole rule |
| What the free plan really gives | Cloudflare's D1 pricing page and its static assets billing page | 5 million rows read a day, 100,000 written, 5 GB; static asset requests free and unlimited |
| What the site's traffic is | `tools/dev/dash-fixture/cloudflare.json`, the live site's own answers saved 21 Sep 2026 | 61,731 requests and 789 unique visitors over the week it returned; busiest day 29,981 requests, 347 uniques |
| What the live prices cover | `wraeclastindex.fyi/data/market.json`, written 03:00 UTC on 23 Sep 2026 | 661 currency rows priced, 642 of 695 uniques priced, no rares |
| Is there a hover preview on the site today? | `assets/app.js`, `assets/cards.css`, `assets/theme.css` | **No.** The cards are *styled* as tooltips; nothing shows one on hover |
| Are accounts live? | `worker/index.js`, every route; `worker/migrations/` | **No.** `users`, `sessions` and `pins` exist in the migrations and nothing serves them |
| How fast is this on a phone? | not measured | every phone figure in this file is this machine's number divided by five, and says so |

---

## The order to build it in

Each step is usable on its own, and each one is checkable before the next.

1. **The clusters** (#52). One tool, two data files, one kind, two relationships. It ships value before the
   builder exists: 1,017 new cards, searchable, connected, on the map.
2. **The pool and the files** (#51), guest only. One act, one kind, `sessionStorage`. No worker, no D1, no
   account — so none of the arithmetic in 1.3 is spent yet.
3. **The numbers** (#53), read-only at first: a build file gets a floor and a ceiling and the list of what is
   not in the count. `buildcheck.mjs` against committed PoB codes from day one.
4. **The budgets and the previews** (#51), once there are numbers for them to move.
5. **The optimise button** (#54), which is the scoring from step 3 let run.
6. **The account path** (#51), when sign-in exists.
