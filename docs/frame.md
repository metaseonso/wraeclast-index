# The frame

One card. One map. Every kind of thing on the site goes through them, and what a card looks like is decided
here and nowhere else: `assets/kinds.js` holds the frame, `assets/app.js` draws it, `tools/dev/frame.mjs`
fails a build that breaks it.

## The loop

Two moves. There is no third.

**(a) The frame already supports it.** Add the data to the index. Stop. No card code, no card review, no
page to update — the cards, the search, the connections and the map take it as they are.

**(b) The frame does not support it yet.** Extend the frame once, in the table. From then on it is supported
for good, for every kind alike. Never a special case for one data set: a rule that would reach one kind is
the wrong shape, and the guard fails it.

### (b) as a procedure

A new dataset needs exactly one of four things. Work down the list and stop at the first **yes**.

| # | Ask | If yes | Cost |
|---|---|---|---|
| 1 | Does a field already draw this value, with a different `at`, `pre`, `post`, `of` or `label`? | Nothing to extend. Add the field name to the kinds that want it. | one word |
| 2 | Does the value belong beside the others in a slot — a pill, a fact, a block, a mark — but no renderer draws that shape? | **A new field type** | one `FIELDS` entry, one `TYPE` function |
| 3 | Do two things in the index belong together and nothing under Connections says so? | **A new relationship** | one `REL` entry, a `MAPS` entry where it groups by a field, one `EDGE` function |
| 4 | Is it a new sort of thing with its own name and its own rows? | **A new kind declaration** | one `KINDS` entry |
| — | None of the four, and a card no longer fits? | **A new slot rule**: a number in `FRAME`. Reaches every card at once. | one number |

#### 1. A new field type

**Before.** Check `TYPE` in `assets/app.js` end to end. A number with a word after it is `number`; a word off
a table is `enum`; a yes/no is `flag`; a list of game lines is `rich`. Only write a type when none of them
draws the shape.
**The move.** One entry in `FIELDS` saying its type, what it reads and which slot it lands in; one function in
`TYPE` that answers with the words, or with markup where the field is more than words. Neither names a kind.
Then add the field name to the `fields` of every kind that carries it.
**After.** `node tools/dev/guard.mjs`. The frame check prints the widest card per slot; the new field must
still leave the slot under its cap.
**What the guard proves.** A field type with no renderer fails. A renderer no field asks for fails. A field
whose slot or box the frame does not have fails.

> **Worked.** A relic carries a rank out of five. Nothing draws marks, so: `stars: {type: 'stars', at: 'st',
> slot: 'pill', of: 5}` in `FIELDS`, and in `TYPE` a `stars` that answers `★★★★☆`. The slot wraps it in a pill
> like any other plain field. Two lines, no kind named, and every kind that adds `stars` to its `fields` gets
> it. Proved in a scratch copy: the card drew `★★★★☆`, and the frame check went from 38 fields to 39 with
> every slot still inside its cap.

#### 2. A new slot rule

**Before.** Measure, do not guess. The guard's frame check prints the widest card per slot over the whole
index every run (`widest pill 4/6, fact 3/8, body 3/6, foot 1/4`). A cap goes above the real widest with room
over it.
**The move.** One number in `FRAME`: a cap, the slack, the lines a list draws, one of the Connections
numbers. Nothing else changes.
**After.** Draw every card before and after and compare field by field. The comparison must be empty except
where the new number was meant to bite, and that difference has to be named.
**What the guard proves.** Every slot has a cap and every cap belongs to a slot. No card draws more pieces in
a slot than its cap. Everything a slot cut is counted, and the count says the right number.

> **Worked.** The body slot. Measured over 6,613 index cards: the widest draws 3 blocks in the grid and 5 in
> the popup. The cap is 6 — above the widest, with room. Nothing is cut today, and a kind that grows past it
> is cut and counted instead of growing the card.

#### 3. A new relationship

**Before.** Is the join already in the data — a field one card carries that names another? Then it is an
edge worked out from the index. If it needs a table of its own, it is an edge with a `needs`, and the file is
fetched the first time a card asks for it and never before.
**The move.** One entry in `REL` with the label as it reads **from the card you are on** — a unique *sits on*
its base, a base is *used by uniques*. Where it groups cards by a field of their own, one entry in `MAPS`
saying which field. One function in `EDGE`. Then the kinds that build it name it in `rel`.
**After.** Read the label from both ends. Run the guard: the connection count moves, nothing is its own row.
**What the guard proves.** A group a kind names that does not exist fails. A group whose map is not declared
fails. A group of a kind that is not a kind fails. A row that is the card it sits on fails.

> **Worked.** "Shares its class with." The class is already on a base item (`cr`). So: `MAPS.klass =
> {at: 'cr'}`, `REL.klass = {label: 'Shares its class with', of: 'b', edge: 'klass', map: 'klass', filter:
> 'craft'}`, `EDGE.klass` reads that map, and the base kind names `klass` in its `rel`. The map is built for
> every kind alike — no kind letter anywhere in it.

#### 4. A new kind declaration

**Before.** Does anything in the index already answer to this name? If a row would be a second card for a
thing that already has one, it is not a kind — it is a field on the card that exists. A kind is rows with
their own identity.
**The move.** One entry in `KINDS`: its letter, what one of it and a list of it are called, the fields its
card draws, the buttons under it, the groups it builds, and whichever of the small declarations it needs
(`tone`, `link`, `sprite`, `px`, `few`, `rank`, `builds`, `mark`, `make`, `kw`, `words`, `gone`, `notitem`).
Plus its rows in the index. **No card code.**
**After.** `node tools/dev/frame.mjs` for the table, then the full guard for the cards. Redraw the map
(`python tools/map.py`) so the new kind takes its place in the picture, the key and the count — the tool reads
the declaration, so there is nothing to edit in it.
**What the guard proves.** A kind the index carries with no declaration fails. A declaration on a kind that
the frame does not know fails — that is what stops a rule reaching one kind. A kind that drops a field every
card carries fails. A kind whose slots run out of frame order fails. A kind naming a field or a Connections
group that does not exist fails.

> **Worked.** Relics: one `KINDS` entry (`{k: 'z', one: 'Relic', many: 'Relics', index, search, item, mark,
> fields, acts, rel}`) and three rows in the index. Result in a scratch copy, with no code: a full card — art
> fallback, name, sub line, the new star pill, its lines with the keyword and mechanics doors already worked
> out, its flavour line, its tags, the kind name in the foot — a **Relics** chip over the search, and the
> search finding it by name and by kind. The frame check went from 9 kinds to 10 and stayed green.

---

## The card

Five slots, drawn in this order. `SLOTS` names them, `FRAME` holds every number, and no number that keeps a
card in shape lives anywhere else.

**Order decides, always.** Inside a slot, the fields draw in the order the kind declares them. Where one
field has more than one place to read, the declaration's order decides. Nothing is ever picked because its
value looks better.

### 1. `head` — four boxes

Not capped: the head is four boxes and a field lands in the one its declaration names (`box`). Two fields in
one box both draw, in the kind's own order. `art` and `name` keep their place whether or not they have
anything in them, because they hold the card's shape; `sub` keeps its place too; `price` does not.

| Box | What may fill it | Which wins | Absence |
|---|---|---|---|
| `art` | the entry's own image; else its cell off the sprite sheet its kind names (`sprite`); else the first letter of its name | image, then sprite, then letter — in that order | the letter glyph. The box never disappears |
| `name` | the name, as a link where the kind has a tab and this entry has an address in it, plain otherwise | a link beats plain text; an entry its kind calls `gone` is always plain | never absent |
| `sub` | the entry's sub line | — | an empty box, keeping the card's height |
| `price` | the price, divine over one divine and exalted under it, with the change over 7 days | its own row by id, then its own row by name, then the row its kind says it may be listed under (`px`) | the box is not drawn and the head closes up |

### 2. `pill` — short facts, in a row

Requirements, flags, a limit, a group, how many of it are on the tree, a warning. A field that answers with
plain words is wrapped in a pill by the slot; a field that draws its own pills goes in whole.

* **Sequencing.** The kind's declared order. Cap **6**. Cut only when more than **1** would be left over —
  "+1 more" is worse than the thing itself. Cut: the first 6, then a pill reading `+N more`.
* **Reaching the rest.** Open the card. The popup draws every piece, uncapped.
* **Absence.** No pills, no row.
* **Widest today.** 4 of 6 (a unique).

### 3. `fact` — one measured line

Use time, cost, spirit, properties, implicits, how many mods can roll. One line, pieces joined by ` · `.

* **Sequencing.** The kind's declared order. Cap **8**, slack **1**. Cut: the first 8, then ` · +N more`.
* **Reaching the rest.** The popup.
* **Absence.** No line at all.
* **Widest today.** 3 of 8 (a base item).

### 4. `body` — the blocks

The words first (`lines`, then `text`), then whatever the kind puts between them, then the tail every card
shares: flavour, options, chart, source, the mechanics cards it is offered, tags, anoint, keyword chips.

* **Sequencing.** The kind's declared order. Cap **6** blocks, slack **1**. Cut: the first 6, then a muted
  line reading `+N more`.
* **A list inside a block** is its own sequence: **4** lines in the grid, same slack of 1, the rest counted
  as a `+N more` row. The popup draws every line. A single line is never truncated mid-word — it wraps.
* **Reaching the rest.** The popup, and the gold button for the whole thing on its own page.
* **Absence.** Nothing drawn.
* **Widest today.** 3 of 6 in the grid, 5 in the popup (a passive).

### 5. `foot` — the marks

The sparkline, how many builds use it, whether the market behind the price is thin, the link to builds. The
kind's name sits at the right-hand end and is not a piece: it is always there.

* **Sequencing.** The kind's declared order. Cap **4**, slack **1**. Cut: the first 4, then `+N more`.
* **Absence.** An empty foot, keeping the kind name.
* **Widest today.** 1 of 4.

### Under the card: Connections

Not a slot — the popup's own section, built from the edges the index already holds, followed both ways.

* **Per group:** the first **8** rows, the true total beside the label, and a **See all N** that draws the
  rest in place. Slack **2**: a group with 10 or fewer draws all of them rather than showing 8 and a button.
* **Ordered by** the order the index itself holds them in, which is the order the game data ships.
* **The rest,** where the drill-down page can show the same list, is a gold button carrying the filter that
  makes it that list and not the default view.
* **A section over 30 rows** gets its filter box from the start; a shorter one keeps it out of the way until
  the card's own filter key is pressed.
* **Absence.** A group with nothing in it is not drawn. A card with no groups has no section.

---

## The map

One picture of the whole index: `tools/map.py` lays it out with the data and writes `data/map.png`,
`data/map.json` and `data/map-nodes.json`; `assets/map.js` frames it and lights it at `#/map`. It is laid out
once at build time, so the page obeys no number per frame and the picture's own constants sit with the
drawing, the way a card's markup sits in `assets/app.js`. What the frame owns is the rule every kind is drawn
by — and it is the same rule the card keeps: the picture is built from the declarations, and what it does not
draw it counts.

| | Rule |
|---|---|
| **Regions** | One per kind, named and coloured off this table: `many` for the name, `tone` for the palette token (`assets/theme.css`). **Nothing about a kind is written into the tool.** A kind with no `tone` gets a colour worked out from its letter, so it still lands in the picture, the key and the count with nobody editing anything. |
| **Node** | One dot per card, every one of them — 6,613 today. Its size is how many edges it has. |
| **Edge** | A line per edge the site can already follow, and no other: the keyword lists, the marks a card's own lines carry, the build's own marks, a unique and its base item, and what grants a skill both ways. 25,005 today. A card is never joined to itself. |
| **Density** | Nothing is thinned and no dot is dropped. |
| **What is left out** | A *group* is not a link between two things — "Listed with", "Shares its class with", "Shares its base with" put everything in one bag, and one group of 967 cards is 467,000 lines that all say the same thing. Those are left out, **counted**, and the page says how many (1,317,426 pairs today). Same rule as a slot: what is not drawn is a number, never an "etc." |
| **Key** | Every kind, with its colour and its count. A kind the index holds no rows for — the bosses, which are cards at runtime out of their own file — is named among what the picture left out instead. Every kind is in one list or the other, and the guard fails if one is in neither. |
| **Growth** | A new kind lands in the picture, the key and the count with nobody editing `tools/map.py`. Redraw it (`python tools/map.py`) and the new kind is there. |
| **Lights** | Up to 18 real edges travel, spread over the picture so no two are taken within an eighth of it (15 today — the spacing rule, not the number, decides). They are picked with the layout and shipped in `data/map.json`, so the page draws one frame in well under a millisecond and never runs the maths. |

`FRAME.map` in `assets/kinds.js` names the file the page reads and states the rules above; `tools/dev/frame.mjs`
holds the picture to them.

---

## Settled now

Every case below has one answer, and the answer is the frame's, not a kind's.

| Case | Settled |
|---|---|
| **A kind never seen** | A card with no kind in the table still draws: head, body, foot, and the kind name whichever tab passed it in (`DEFAULT`). But a kind letter the shipped index carries with no declaration **fails the guard**, so it never reaches a player unseen. |
| **A field type with no renderer** | The field is skipped and the card draws without it — one missing renderer never costs a card. The build **fails** on it, both ways round: a type with no renderer, and a renderer no field asks for. |
| **Text far longer than its slot** | Never truncated mid-word. A long line wraps. The list it sits in is cut to 4 lines with a `+N more` row; the popup draws every line; the gold button opens the whole thing on its own page. |
| **No art** | The sprite cell off the sheet the kind names; failing that, the first letter of the name as a glyph. The art box keeps its place either way, so a grid of cards never goes ragged. |
| **No price** | The price box is not drawn and the head closes up. Everything downstream of a price — the sparkline, the thin-market mark, the chart, the "biggest movers" list — draws nothing rather than drawing a zero. A price is only ever a real one — the in-game Currency Exchange or live trade listings, never an estimate — so no price is the answer when there is none. |
| **A price with no history** | One day is a price, not price action: no chart, and the card says so in the market file's own words. Two days make a line. Under 14 days, the key says how many days, so a short line never reads as a whole league. Past leagues draw beside it, each in its own colour and its own dash. |
| **A source that must be named** | The `source` field: a block in the body tail, on every kind. Anything the game does not publish names its source on the card itself, in the card's own words. |
| **A table that is one file per item class** | The field's `file` carries `@field`, filled in from the entry the way a gold button's link is. One declaration reads a table per class, no class is written down, and an entry with nothing for that field has no table and draws nothing. It is fetched when a card is opened on it, never in first paint. |
| **A switch on a card** | A field type of its own (`swap`), and the declaration says which entries carry it, the word on the switch and the card it comes from. What it does is that card's own lines, so the game's wording is never written down twice; it is off until it is pressed, and on for the visit once it is. Every kind carries the field, so the next switch is one more line in the table and no code. |
| **A page that already draws a field in full** | The page leaves it off the card it draws (`without`), and the frame decides everything else about that card exactly as it does anywhere else. It is the caller's own call, like a card drawn with no price or no link, never a rule about a kind. |
| **A relationship with hundreds of members** | 8 rows, the true total beside the label, **See all N** draws the rest in place, and the gold button carries the filter to the drill-down page. 1,448 things on one keyword costs 8 rows and one number. |
| **A relationship with one member** | Still a group, still its own label, still a total of 1. No "See all" (1 is inside the slack), no button. A group of one is not a special case. |
| **A card that is its own target** | Never, anywhere. A card is not in its own group, is not a row in its own Connections, is not its own base item, a word on it never opens the card you are already on, and a card is never offered a mechanics card of its own kind. The map joins no dot to itself. All of it **fails the guard**. |
| **Data from an older build** | A field the entry does not carry draws nothing, so one declaration covers a full entry and a bare one and an old row draws a shorter card, never a broken one. A row whose kind is gone from the table fails the guard, which is the signal to retire it or restore it. |

---

## The tables

| Table | In | Holds |
|---|---|---|
| `SLOTS`, `BOXES` | `assets/kinds.js` | the five slots in order, the four boxes of the head |
| `tone` | `assets/kinds.js` | the palette token each kind is drawn in where kinds are told apart by colour |
| `FRAME` | `assets/kinds.js` | every number: the caps, the slack, the lines, Connections, the map |
| `FIELDS` | `assets/kinds.js` | one entry per field: its type, what it reads, its slot, whether every card carries it, and the table of its own it reads where it has one (`file`, which may carry `@field`) |
| `KINDS`, `DECL` | `assets/kinds.js` | one entry per kind, and the whole list of declarations a kind may carry |
| `REL`, `MAPS` | `assets/kinds.js` | the groups under Connections, and the maps the index is turned into for them |
| `MAKE` | `assets/kinds.js` | the answers a kind can work out from an entry itself |
| `TYPE` | `assets/app.js` | one function per field type. No function here knows what a gem or a unique is |
| `EDGE` | `assets/edges.js` | one function per edge. Reads the maps `MAPS` declares |
| — | `tools/map.py` | draws the map off `many`, `tone` and `mark`. No kind is named in it |

Run `node tools/dev/frame.mjs` for the table on its own, or `node tools/dev/guard.mjs` for the table plus
every card in the index drawn against it.
