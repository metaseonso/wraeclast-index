# Buffs and debuffs: what is this icon on my bar? (#89)

A player sees an icon and a name under it ("Tailwind", "Onslaught", "Withered") and has nothing to look it up
by. The game files hold the three things the card needs: the buff's own description, the icon it is drawn with,
and the stats and modifiers that put it on a character. `tools/buffs.py` reads them into `data/buffs.json` and
the index. The declarations are in `assets/kinds.js`; this page is what they do not say.

## What the data holds

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), patch 0.5.5.

| Export file | What it gives |
|---|---|
| `buffs.min.json` | 3,218 buff definitions: name, description, invisible or not, category, stats, stack cap, visual; the buff templates' `stat_text` (the game's lines with numbers); the modifiers and passives the files tie to a buff (`sources`) |
| `buff_visuals.min.json` | the icon each visual draws, an `Art/...dds` path, shown through RePoE's copy of the game art (the `r:` image code every base item already uses, `tools/sync.py game_art`) |
| stat descriptions, passive tree, skills, skill gems, mods, base items | what gives it (below) |

1,116 names a player could see: a name (no `[DNT]`, no `{0}`, no test or WIP name), not marked invisible, an
icon, and not a PvP or Labyrinth category. **262** of them have something in today's game that gives them, or a
keyword card of the same name, and words to say what they do. The other 842 are Path of Exile 1 buffs the export
still carries (brands, mines, "A Fragment of Sun"); nothing gives them, so no card. 12 more have no words at
all. `python tools/buffs.py --report` counts all of it every run.

| `data/buffs.json` field | What it is |
|---|---|
| `n`, `id` | the name under the icon; the id is the name, never drawn |
| `s` | the game's category in its words: Buff (122), Debuff (79), Curse (Hex), Charge, Shrine, Mark, Herald, Flask effect, Skill effect; Effect where the files give none |
| `t` / `ls` | the game's description, markup off; where one name has several descriptions, or none but a template's lines, `ls` |
| `img` | the icon, `r:Art/2DArt/BuffIcons/...webp` |
| `max` | the stack cap, where the game sets one (22) |
| `by` | the cards that give it: `{n, k, key}`, `key` never drawn |
| `mods` | modifiers with no card, counted: on monsters, on areas, on items, in the Trial of Chaos |
| `kw` | the keyword card of the same name (85), never drawn |
| `q`, `src` | search words; "Source: the game files" |

## What gives it: the joins

Every join is an id or a stat the export links, and the game's own words for that stat. Nothing is read off a
card's name except where the buff is the skill itself.

1. **A stat that gives it by name.** Every stat description whose words give the buff: "Gain [Tailwind] on
   Critical Hit", "you and nearby Allies have Tailwind", "Enemies are Hindered". A verb that gives (gain, grant,
   have, inflict, apply, are, become, create, leave) with up to four small words before the name; never inside a
   condition ("while you have Tailwind", "per Tailwind") or a denial ("cannot be Chilled", "lose all
   Tailwind"). The passives that carry such a stat give it.
2. **A skill.** A skill whose own id is the buff's (`herald_of_ice`), whose name is the buff's, or whose own
   description or stat lines give it by rule 1; the gems that grant that skill; a support gem whose own text gives
   it. Then every card that grants that skill's gem (`data/grants.json`: a unique's "Grants Skill: Discipline").
3. **A modifier.** The ones the buff names as its source, the ones whose template the buff carries, and the ones
   whose stats or words give it by rule 1. A unique's modifier opens the unique cards whose line reads the same
   (numbers aside); a base item's implicit opens that base; the rest are counted by where they roll.
4. **A passive the buff names as its source** (`sources.PassiveSkills`).

Over the 262: 170 are given by a card (gems 138, passives 46, uniques 48, bases 33), 62 by modifiers only.

## How it fits the frame

Worked down the (b) list in `docs/frame.md`:

1. **Does a field already draw it?** The name, sub line, words, icon and source: yes, `name`, `sub`, `text` or
   `lines`, `art` (the `img` code), `source`. What gives it: yes, `REL.granted` ("Granted by") reads
   `data/grants.json`, and `tools/grants.py` now writes the buff edges there, both ways. A gem, passive, unique or
   base that gives one lists it under **Grants**.
2. **A value no renderer draws?** No. The stack cap is a `number` field (`stacks`: "Up to 10 stacks"), and the
   modifiers with no card are one `lines` fact (`frommods`: "From modifiers: 2 on monsters, 5 on areas"). Two
   `FIELDS` entries, no new type.
3. **A new relationship?** No. `REL.grants` loses its `of: 'g'`: a card grants gems and buffs alike.
4. **A new kind?** Yes, for the buffs no card answers to: **Buff**, kind `d`, 99 cards. Not for the other 163:
   - **85 share a name with a keyword card** (Tailwind, Onslaught, Withered). That card is the buff's card
     (`docs/frame.md`: a second card for a thing that has one is not a kind). It takes the buff's icon instead of
     the Book of Skill, its stack cap, and "Granted by" (`w` now names `granted` and `stacks`).
   - **78 are named like a card of another kind** (Herald of Ice, Arctic Armour, Apocalypse): the gem or passive
     is the buff. They stay in `data/buffs.json`, and a second card of the same name would take the doors other
     lines open into the gem (`tools/nodelinks.py`: two kinds sharing a name open nothing).

## The keyword mark

A line that names a buff opens its card, the way a keyword's name does. The declaration is the whole of it:
`words: {n: 'own', mark: 'game'}` on the Buff kind. `assets/marks.js` marks the name wherever a line says it,
underlined as the game's own word, and `tools/nodelinks.py` marks it at build time in the lines it reads, so
"Connections" gets "Named by" both ways. 80 lines on 66 cards name one of the 99 today ("Physical Thorns" on The
Blood Thorn, "Power Charges" on Bonestorm). The 85 keyword buffs keep the keyword's own mark.

## Left for later

- **The 78 buffs named like a gem or passive.** Their icon and what gives them are in `data/buffs.json`; the gem
  card could take the icon as a second picture, which is a field on that card, not a kind.
- **Monster and area modifiers** are counted, not named: the export carries no name a player sees for most of
  them (a rare monster's "of the Inferno" is the affix, not what the bar shows).
- **Trial of Chaos modifiers** that give a debuff are counted here; their cards are #82's (`data/trials.json`).
