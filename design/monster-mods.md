# Rare monster modifiers: a kind of their own (#112)

A rare monster wears its modifiers as names over its life bar. A player reads "Temporal Bubble" or "Conjures
Ice Prisons" and has nothing that says what it does, or what it does to them. The data for a card per name is
in `data/monstermods.json` (`tools/monstermods.py`, the pipeline's `monstermods` stage). This page proposes how the
frame takes it. The part that shows today is one field (below, "What shows now"); the kind waits on its rows joining
the index.

## What the data holds

97 names over the 196 rows of `data/game/monster_modifiers.json` (the game's ArchnemesisMods table, read by
`tools/datpull.mjs`). A name sits on two rows or more where the game keeps a weaker and a stronger step of one
modifier; all 196 are covered, each under its name (`steps` counts them).

| Field | What it is | From | Count |
|---|---|---|---|
| `n`, `id` | the name over the monster; the name is the id, as a small passive's is | the game files | 97 |
| `s` | "Rare monster modifier" | ours, the kind's name | 97 |
| `t` | what it does, in the game's own help text: "Monster creates circular walls of Ice around enemies." | the game's keyword help (`keywords.min.json`), via RePoE | 58 |
| `ls` | its stat lines as the game prints them: "Gain 40% of Damage as Extra Fire Damage" | the game files, worded by the game's stat descriptions (RePoE's export of them) | 33 |
| `alt` | another step's lines, where they differ (Haste Aura, Temporal Bubble) | the game files | 2 |
| `tags` | what it does to you, in #77's words | read off `t`, `ls` and the stats the game never words | 95 |
| `est` | the tags read off the name alone, because the game gives the modifier no words | the name | 31 names |
| `q` | the tags again, as search words | — | 95 |
| `kw` | the keywords its help text marks, for the doors in `t` | the help text | internal ids, never drawn |
| `kwx` | the keyword card this card stands for | the help text | internal id, never drawn |
| `src` | "Source: the game files", with the help text's source beside it when there is one | — | 97 |

34 names have neither help text nor lines: a modifier whose whole effect is a skill the monster casts
("Trail of Fire", "Kurgal's Last Gasp", "Amanamu's Void"). The game gives them no words, and neither does the
file. Their card is the name, the tags read off it (marked Estimate) and nothing invented.

## The tags

The same words #77 tags waystone and tablet modifiers with, so one filter reads both, in the order a card
shows them: what shuts off part of a build first, what makes the fight longer last. A tag comes from the
game's words (`t` and `ls`), or from a stat the game never words (`hidden` in `data/game/`, matched and never
shown). Only where a modifier has no words at all is a tag read off its name, and then it is in `est`.

| Tag | Names | From the name alone |
|---|---|---|
| less recovery | 3 | 0 |
| fewer flask charges | 1 | 0 |
| reflect-like | 5 | 1 |
| curse | 0 | 0 |
| slows you | 3 | 0 |
| breaks armour | 1 | 0 |
| extra element | 4 | 0 |
| ailment on hit | 5 | 0 |
| damage bursts | 23 | 14 |
| teleports | 2 | 1 |
| ground effect | 15 | 11 |
| on death | 13 | 10 |
| cannot be damaged | 6 | 1 |
| more crits | 1 | 0 |
| more accuracy | 1 | 0 |
| stuns you | 1 | 0 |
| faster | 4 | 0 |
| more area | 2 | 0 |
| stronger pack | 13 | 2 |
| resists fire / cold / lightning / chaos | 2 / 2 / 2 / 1 | 0 |
| harder to kill | 17 | 1 |

#77's no regen, no leech, less flask effect, penetration, less resistance and boss only are waystone words:
no rare monster modifier's own words say any of them, so no row carries them. Curse stays in the table with 0
so the two lists stay one list. Two names have no tag at all (Soul Siphoner, Amanamu's Void): no words, and a
name that says nothing about what it does.

## What shows now: the `mondanger` field

55 of the 97 names are already cards: the keyword cards `tools/gamelib.py` makes of the game's help entries, under
the same name. So the tags show there first, with no change to the index:

```js
mondanger: {type: 'danger', at: 'n', slot: 'body', file: 'data/monstermods.json',
  label: 'On a rare monster, what it does to you'},
```

`TYPE.danger` (`assets/app.js`) reads a table of `{n, tags, est, why, src}` rows, finds the row by the card's name,
and draws the tags, **Estimate** beside a tag in `est`, the game's line on hover for a tag in `why`, and the row's
`src`. It is fetched the first time a card opens, never in first paint. The map modifiers (#77,
`data/mapdanger.json`) use the same type and the same words, so the two read as one list.

## The kind: move (b)4

It is a new sort of thing with its own name and its own rows, so it is a new `KINDS` entry and no card code.
The frame's first question first: does anything in the index already answer to these names? Yes, 55 of them:
`tools/gamelib.py` cards the game's help entries as keyword cards, and 55 of the 97 are there as keywords
(`w:MonsterGlacialPrison1` is "Conjures Ice Prisons"). A second card for the same thing is not a kind. So the
modifier card stands for both, the way a keystone already stands for its own keyword:

* `tools/gamelib.py` stops carding a help entry whose key a modifier row names in `kwx`, and puts it in
  `kwx` of the index instead (keyword id to card), exactly as it does for keystones today. A keyword link to
  "Conjures Ice Prisons" anywhere opens the modifier card.
* The modifier card carries the help text as its `t`, so nothing of the game's wording is written down twice.

```js
/* A rare monster modifier: the name over the monster's life bar, what it does in the game's own words, and
   what it does to you (tools/monstermods.py, design/monster-mods.md). It stands for the keyword the game's
   help text makes of the same name, so a keyword link to it opens this card. */
{k: 'm', one: 'Rare monster modifier', tone: 'c-rare', many: 'Rare monster modifiers', index: true, search: true,
 crawl: true, mark: 't', kw: 'kwx', words: {n: 'own', mark: 'game'},
 fields: [...HEAD, 'steps', ...SAYS, 'others', ...REST, ...FOOT],
 acts: ['pin'],
 rel: ['namedby', 'danger']},
```

### Fields, worked down the (b) list

| Field | Slot | Move | Why |
|---|---|---|---|
| `lines` (`ls`), `text` (`t`) | body | none: `SAYS` already | the game's words, drawn as every card's are |
| `tags` | body | none: `REST` already | a list of short words; the tags renderer draws it. Tags in `est` draw with **Estimate** beside them |
| `source` (`src`) | body | none: `REST` already | a string, "Source: the game files, and the game's help text read by RePoE" |
| `steps` | pill | (b)1: `{type: 'number', at: 'steps', slot: 'pill', post: ' step', many: ' steps', from: 2}` | the `ontree` shape with another word; drawn only from 2 |
| `others` | body | (b)1: `{type: 'rich', at: 'alt', slot: 'body', label: 'Another step'}` | lines, like `lines`, under a label |

No new field type. `steps` and `others` are two `FIELDS` entries on shapes that already draw.

### The labels

* **Estimate**, beside every tag in `est`: it is read off a name, not off anything the game says the
  modifier does.
* **Subject to change** (tooltip "Depends on GGG. May change without notice.") beside `t` wherever its numbers
  and the lines' differ: the help text is a separate entry in the game and can lag behind the stats. Today
  that is Haste Aura (20% and 10% in the help, 25% and 25% on the stronger step) and Siphons Flask Charges.
* **Source: X** from `src`, as every card with a source already draws it.

### Connections

* `namedby`: already declared; a keyword link in another card's words that names this one.
* `danger`, one new relationship ((b)3): `MAPS.danger = {at: 'tags', of: 'm'}`,
  `REL.danger = {label: 'Does the same to you', of: 'm', edge: 'danger', map: 'danger'}`. The modifiers
  sharing a tag, read from the card you are on. When #77 tags waystone modifiers with the same words, the
  same map answers across both with no new code, which is the point of the words being one list.

### Search

The card is a search row by its name, so "Ice Prison" finds "Conjures Ice Prisons" the way the search already
finds a word inside a name. The tags go in `q` (the search words a card does not show), so "reflect" finds
every reflect-like modifier.

## Where it lands

`tools/monstermods.py` writes `data/monstermods.json` today and the keyword cards read it (`mondanger`). Once the
kind is declared,
the same rows join `data/index.json` (a step after `tools/gamelib.py`, which it has to follow to fold the 55
keyword cards in), and `tools/dev/guard-baseline.json` gains the new kind's count.

## Left open

* Which step is the magic monster's and which the rare's: the game's table has three flags dat-schema does
  not name yet. Until it does, a card lists the steps and does not say which is which.
* The 34 names with no words. poe2db (the one other source that lists them) has no words for them either.
  They get words when the game writes a help entry for them, and the next run of the tool picks it up.
* #77's own tags on waystone modifiers, and the build check ("this mod stops your leech"), are #77.
