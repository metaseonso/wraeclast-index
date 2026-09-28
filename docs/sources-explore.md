# Where the drill-down's data comes from

The drill-down page (`explore.html`) reads five data files in `data/explore/`. They used to come only from a
saved copy of the Wraeclast Index artifact, re-exported by hand. Each now has a builder that reads the game
files, and `python tools/sync.py --from-game` runs them. This page maps every field of every file to its
source, and says what has none.

**Sources, best first.** The game files, read through the RePoE fork's PoE2 export
(`https://repoe-fork.github.io/poe2/`, pulled by `tools/gamepull.py` into `tools/cache/official/`). Where the
export lacks a value, the game's own tables, read out of the game's bundles on GGG's patch CDN by
`tools/datpull.mjs --raw` through `tools/gamepull.py` `dat()` (issue #83; the same rows the private data repo's
`game/0.5.5/out/raw/` held, checked table for table). Then poe2db. Anything else is named where it is used.

**Proving it.** `python tools/dev/explorecmp.py` builds every block and holds it up against the committed file,
field by field (`--show N`, `--field F` for the differences). The numbers below are from patch 0.5.5
(export build 4.5.5.2, the same build the committed files were made from).

**Adopting it.** `tools/fromgame.py` `ADOPTED` names the blocks `--from-game` rebuilds by default: the ones
whose every difference is explained below. All five are adopted.

Letters in the tables: **R** = RePoE export file and field, **D** = decoded game table and column,
**ours** = made by the site, not a game value.

## Gems: `gems.*.json` and `gemtext.*.json` (`tools/gems.py`, adopted)

The file is `{meta, gem_tags, gems, sprites, dropped}`. `gemtext` is each stat set's `txL`, split out by
`tools/sync.py` (unchanged).

| Field | Source |
|---|---|
| `meta.source`, `meta.game_version` | R: the export's build string on its listing page (`gamepull.build`) |
| `meta.generated` | the day the gem files of the export were last pulled (`tools/cache/official/pulled.json`) |
| `meta.n` | the count of gems kept (every gem but the 45 "Coming Soon" slots) |
| `gem_tags` | R `gem_tags.min.json`, whole |
| `sprites` | ours: the grid of `sprites/gems.webp`, carried from the committed copy |
| `dropped` | `tools/sync.py` `clean_gems` (unchanged) |
| `n` | R `skill_gems` `base_item.display_name`. Three names hold a slot the game fills in (`Spectre: {0}`): ours, `gems.FILLED` ("any monster", "any Beast", "any Undead"), as the artifact had them |
| `id` | R `skill_gems` key, last part |
| `t`, `c`, `tg`, `rq`, `cl`, `cty` | R `skill_gems` `gem_type`, `color`, `tags`, `requirement_weights`, `crafting_level`, `crafting_types` |
| `lin` | R `skill_gems` `is_lineage` |
| `txt` | R `skill_gems` `support_text` for a support, else R `skills` `active_skill.description` of the gem's first granted skill |
| `ml` | the number of levels R `skills` `per_level` holds for that skill |
| `ty` | R `skills` `active_skill.types` |
| `cast` | R `skills` `cast_time` |
| `cm`, `asm`, `cd`, `su` | R `skills` `static`: `cost_multiplier`, `attack_speed_multiplier`, `cooldown`, `stored_uses` |
| `cmL`, `cdL` | the same, where R `skills` `per_level` sets them level by level (a list, level 1 first) |
| `sl`, `sa` | R `skills` `support_gem.allowed_types`, `added_types` |
| `cost` | R `skills` `per_level[*].costs` (a list per resource) and `static.costs` (a number) |
| `res` | R `skills` `per_level[*].reservations`, else `static.reservations` |
| `kw` | every `[Id]` / `[Id|words]` the gem's own text marks, anywhere but its name |
| `ic` | ours: the gem's cell in `sprites/gems.webp`, carried by gem id. A new gem has none until the sheet is rebuilt; its search card then shows the game's art (`tools/sync.py` `card_image`) |
| `ss[]` | R `skills` `stat_sets` of the first granted skill; a set with nothing in it is left out |
| `ss.id` | the stat set's `id` |
| `ss.crit`, `ss.dm0` | R stat set `static.crit_chance`, `static.damage_multiplier` |
| `ss.dm` | R stat set `per_level[*].damage_multiplier` |
| `ss.bd` | a spell's base damage: the `spell_*_base_<type>_damage` stats (and the one off-hand line built the same way) per level, `{type: [mins, maxes]}` |
| `ss.cs` | every other stat: a fixed value (R `static.stats[].value`), else its value per level (R `per_level[*].stats`) |
| `ss.tx` | R stat set `static.stat_text`: the game's rendered wording |
| `ss.q` | R stat set `static.quality_stats` (`stat` → `t`, `stats` → `s`), without the empty line the game draws as nothing |
| `ss.txL` | R stat set `per_level[*].stat_text`, by line, by level |

**Match on 0.5.5** (1,144 gems after `clean_gems`, 1,300 stat sets): every field 100% except

- `ml` 99.3% (8 gems): Hydra Familiar, Pinnacle of Power and six Cast on / Cast while meta gems. The artifact
  says 8 to 20 levels; the export (4.5.5.2) and the game's own table (`GrantedEffectsPerLevel`, 4.5.5.3) hold one
  level for each, and nothing in the artifact's own entries for them runs past level 1. The game's number is kept.
- `ss.cs` 98.2% (23 stat sets): a stat the export gives one fixed value but types as per-level ("additional",
  "float") — Tornado Shot's 15 s duration, Herald of Blood's 15% explosion, Freezing Salvo's 0.75 s seal gain.
  The artifact looked for those per level, found nothing and dropped them. They are kept: real values, shown only
  in the Technical details box.
- `meta.generated`: the build day, which moves with every pull.

## Keywords: `keywords.*.json` (`tools/keywords.py`, adopted)

`{keyword id: {t, d, n, c, ks?}}`, in the order the gems, then the uniques, then the passives first mark them.

| Field | Source |
|---|---|
| key | every `[Id]` the other four blocks' rows mark (their `kw`), gems counted with the ones `clean_gems` drops |
| `t`, `d` | R `keywords.min.json` `term`, `definition` (line ends made `\n`, trimmed). A keystone (`passive_keystone_<id>`, marked in unique text) is the keystone's own name and lines from the tree block. A key with no entry (the `DNT` markers, `Blinded`) is its own name spaced out, with no text, as the artifact had it |
| `n`, `c` | counted: how many gems, uniques and passives mark it, and the total |
| `ks` | 1 for a keystone |

**Match on 0.5.5** (451 keywords): `t`, `d`, `ks` 100%; `n`, `c` 98.2% (8 keywords, one count each): the artifact's
counts disagree with its own passive rows (Way of the Mountain marks Surpassing, Sustained, Hit, Power,
Immobilised and Attack; the artifact did not count it). The counts made from the rows are kept.

## Uniques: `uniques.*.json` (`tools/uniqueitems.py`, adopted)

`{meta, items, sprites}`. The game files do not say which base a unique is made on or which mods it carries (the
game server holds that), so the list of uniques, each one's base and its lines come from poe2db
(`data/uniques.json`, `tools/uniques.py`), checked against the official trade site's own item list
(`data/trade.json`, `tools/tradedata.py`); everything around them comes from the game files.

| Field | Source |
|---|---|
| rows | poe2db's name and base, then each Runeforged and Runemastered base D `Expedition2VerisiumCrafts` forges it onto that the trade site lists today, then every name in R `uniques` (the collection tab) no source gives a base. A unique poe2db has no base for takes the one base the trade site lists for it |
| `n`, `b` | as above |
| `c` | R `item_classes` `category` of the base's class (a buckler is `Buckler`, as the game and the site's base cards name it) |
| `g` | ours: the drill-down's group, by item class; `Unlisted` with `nolist` when D `UniqueStashLayout` hides the unique (both `ShowIfEmpty` flags off) or no base is known |
| `ex`, `im` | poe2db's lines in the game's wording: the R `mods` text that reads the same (numbers aside) gives the words and keyword markup, poe2db the numbers (`tools/sync.py` `officialize`, the same rule). A line no mod reads like takes the wording of R `stat_descriptions` / `tablet_stat_descriptions` when one reads the same ("Map also counts as a [Biome\|Water] Map"). A forged row: the unique's own lines, and the forged base's own implicits (R `base_items` `implicits` → R `mods` text) instead of the old base's |
| `pr` | the base's properties (R `base_items`, D `ArmourTypes` Runic Ward, D `ItemSpirit` Spirit, D `WeaponTypes` reload time) with the unique's own local mods applied, lowest and highest roll, no quality, nothing socketed. Rounded the way Path of Building rounds (`round`) |
| `lv` | poe2db's requirement; a forged row: the forged base's level (R `base_items` `requirements`) or the unique's, whichever is higher |
| `fl` | R `flavour` by the art id of the unique's place in the collection tab; one the tab does not hold: its poe2db page, kept only when R `flavour` holds the same words |
| `lim` | D `UniqueJewelLimits` |
| `cor` | poe2db's list: drops corrupted |
| `kw` | every `[Id]` its lines mark, plus the committed row's keywords beyond its own lines (what the lines stand for: From Nothing's keystones, Mageblood's Legacies, the pools Loreweave and Flesh Crucible roll from) |
| `ic`, `sprites` | ours: the cell in `sprites/uniques.webp`, carried by name and base |
| `meta.kept` | the committed rows no source here gives: kept whole (last good wins), each with why |

**Match on 0.5.5** (734 rows; 692 match the committed 712 by name, base and last line): `b`, `c`, `cor`, `g`,
`ic`, `lim`, `n`, `nolist`, `sprites` 100%. The rest, the game's version kept:

- Rows: 18 committed rows are under another key, none gone. 15 had no base and now have one (poe2db or the
  trade site: Ab Aeterno, Blessed Bonds, Forbidden Gaze, Guiding Palm (three identical rows, now one), Infernoclasp,
  Merit of Service, Palm of the Dreamer, Solus Ipse, Split Personality, The Deepest Tower, The Fallen Formation,
  The Road Warrior, The Wailing Wall, Thunderstep, Wylund's Stake). Grand Spectrum Emerald and Sapphire had the
  Ruby's line since `officialize` fell back by name (fixed: by name only for a row with no base or a forged one);
  their lines are the game's mods `UniqueMaximumSpiritPerStackableJewel1` and
  `UniqueAllResistancePerStackableJewel1`, which the artifact had on them before, each matching its gem's flavour
  text (the game files do not join the two). Cruel Hegemony's last line gains its markup. New: 15 uniques the
  committed file never had (Apron of Emiran, Arvil's Wheel, Bronzebeard, Cloak of Defiance, Cornathaum, Elevore,
  Erian's Cobble, Leer Cast, Morior Invictus, Powertread, Redblade Banner, Sine Aequo, The Black Doubt, The Coming
  Calamity, The Hollow Mask) and 9 forged rows, all on the trade site. Winter's Bite and the two Grand Spectrums
  are in `meta.kept`: on the trade site, in no other source here.
- Several bases of one name: Mjölner forges onto three Runemastered Torment Clubs, Eyes of the Runefather onto
  three Runemastered Venerable Defender shields and a buckler, each with implicits of its own. One row each, the one
  the committed row was (its item class, the keywords of its implicits).
- `pr` 51.7% (334): the artifact's numbers came from market listings, with quality and socketed runes (the
  13-16 Fire and 1-30 Lightning on dozens of weapons are runes). These are the item's own: base and local mods.
  Checked on 12 rows against poe2db: the same, but for 1 on a fraction (poe2db rounds down, Path of Building
  rounds: 83 × 2.5 = 207.5 reads 208 here) and Frostbreath's crit (poe2db's box shows the base's 5% without its
  own +5%). Reload Time now shows on every crossbow from the game's
  `WeaponTypes` (Rampart Raptor's 30% reduced Reload Speed makes it 1.21 s, not the artifact's 0.77-0.85); none
  for the Trarthan Cannon, which cannot load.
- `im` 93.2% (47): 42 forged rows show their base's own implicits (Runemastered Runic Fork: "(30-50)% chance for
  Spell Skills to fire 2 additional Projectiles"), and drop the old base's (a Runeforged Tense Crossbow has no
  Bolt Speed implicit in the game files); 5 lines gain the game's markup (Marohi Erqi, Fury of the King, three
  tablets).
- `kw` 91.2% (60): follows the lines above: the rune keywords go with the runes, the forged implicits' come in.
- `lv` 96.2% (23, 3 new): all forged rows, now the forged base's own level (Runemastered Runic Fork 65, not 84).
  Bluetongue, Redbeak and Tabula Rasa (Runeforged) are level 1: poe2db and the base both say so.
- `fl` 99.7% (2): Blackheart has the game's flavour for its art ("If evil must always exist..."; poe2db the same);
  Cursecarver keeps the game's line break.
- `ex` 99.9% (1): Undying Hate's "Desecration makes this item unstable" gains its markup.
- `meta`: `kept` is new; row order: the builder sorts by group, class, name, base (the page sorts on its own).

On the trade site but in no row, here or in the committed file: Demigod's Virtue, Forgotten By Time, Hand of
Wisdom and Action, Seeing Stars, The Dancing Dervish, The Remembered Tales, The Surrender, Voll's Protector on
Ironclad Vestments (no source gives their lines).

## Passive tree: `tree.*.json` (`tools/tree.py`, adopted)

`{meta, passives, emotions, rates, regions}`. Nothing is carried over from the committed copy.

| Field | Source |
|---|---|
| `meta.src` | the export's build string (`gamepull.build`) |
| `h`, `id`, `n` | R `passive_skill_trees/Default` passive `hash`, `id`, `name` |
| `s` | R passive `stats`, plus the stats past the fourth the export drops: D `PassiveSkills` `Stats` / `Stat5Value`..`Stat7Value` (`Stats` for the ids), only where the export's own stats match the table |
| `t` | the game's wording of `s`: R `stat_descriptions` then `passive_skill_stat_descriptions` (a stat both describe takes the passive file's entry), every entry in the files' order, the first wording whose conditions the values meet, with its index handlers. `[Id|words]` markup kept. Then `Grants Skill: <name>` (D `ClientStrings` `ItemDisplayGrantedSkillNoScaling`) with the skill's name from R `skill_gems` |
| `k` | R passive flags; `anoint` = D `PassiveSkills` `IsAnointmentOnly` and on the anointing list |
| `kw` | every `[Id]` its lines mark |
| `a` | R `ascendancies` name |
| `io`, `mco`, `mc`, `sp`, `f` | R passive `is_icon_only`, `is_multiple_choice_option`, `is_multiple_choice`, `skill_points`, `flavour_text` (styling taken off) |
| `rec`, `emotions` | D `BlightCraftingRecipes` → `BlightCraftingResults` → `PassiveSkills`; the emotions' names from D `BlightCraftingItems` → `BaseItemTypes` |
| `at`, `ats` | "granted" when the node's own stats give attributes; else "region" |
| `reg`, `regions` | ours: the class start node closest by angle, seen from the middle of the tree (R node positions, class angles from R `ascendancies` `tree_region_angle`, attributes from R `characters`). The game draws the regions as art and names none |
| `rates` | empty: prices are live on the page |

No anoint cost (`ac`) any more: it was the artifact's saved price. The page adds the three emotions' live
Currency Exchange prices up itself, with their age, and shows — while one has no price (`explore.html`,
`tools/sync.py` `LIVE`).

**Match on 0.5.5** (5,152 nodes): `a`, `ats`, `f`, `h`, `id`, `io`, `k`, `mc`, `mco`, `n`, `rec`, `sp`,
`emotions`, `meta`, `rates`, `regions` and row order 100%. The rest, each one the game's version kept:

- `t` 83.5% (703 differ, 38 new):
  - 675 nodes: the same lines in another order. The game lists a node's lines in the description files'
    order; the artifact did not, and puts the same two lines both ways round on different nodes (7 pairs, numbers aside; none in the game's order). Path of Building's tree
    (`PathOfBuilding-PoE2` `src/TreeData/0_5/tree.json`) has the game's order on all 675.
  - `Grants Skill: <name>` on all 54 skill-granting nodes (the artifact had 8): 38 nodes that had no text and
    8 more. Jade Heritage reads "Encase in Jade", the skill's name, not "Encase in [Jade]".
  - 12 nodes gain the stats the export drops (the `s` list below): Flesh Withstands, Cower Before the First
    Ones, Cirel of Tarth's Light, Voll's Protection, Spaghettification, Hunter, Furious Wellspring, The Natural
    Order, Avatar of Evolution, Sanguine Tides, Way of the Mountain, and one Huntress node whose extra stat only
    flags a notable taken (no line of its own). Path of Building shows every one of these lines.
  - Mhacha's Gift: "up to 3 Owl Feathers". The stat is 2 and the game's wording adds one (`add_one`); the
    artifact and Path of Building print the raw 2.
  - Way of the Mountain: one entry of the game's describes both its stats, so its two sentences are one line
    with a line break, as every other two-stat entry is.
  - Preemptive Strike, both Critical Damage vs Full Life nodes, The Mórrigan's Guidance: the full sentence
    ("100% increased Critical Damage Bonus against Enemies that are on Full Life"), not the short
    "...vs full life enemies@100%" form the game keeps for its stat tables, which the artifact showed.
  - 4 nodes (Pyromantic Pact, Explosive Impact, The Mórrigan's Guidance, Embrace the Darkness) are the order case
    above with a two-line entry.
- `s` 99.8% (12): the stats the export drops, above.
- `kw` 99.9% (5): the keywords of those new lines (Shock, Chaos, LightRadius, Critical), and Way of the
  Mountain's MountainsTeachings, which the artifact left out although its own lines mark it.
- `at`, `reg` 99.8% (7): armour48, enemies_on_full_life9, projectile_spells8, lightning50, rage29, fire1_,
  corpses19 sit within 0.3° of the line halfway between two class starts. Neither side is a game value.

## Timeless jewels: `jewels.*.json` (`tools/jewels.py`, adopted)

`{rows, seeds}`. Every value is the game's; nothing is carried over from the committed copy.

| Field | Source |
|---|---|
| `rows[]` | one per wording of the R `stat_descriptions` entry that starts with `local_unique_jewel_alternate_tree_version`, in the game's order |
| `ver`, `idx` | the wording's conditions on the version (the faction) and the keystone index (the conqueror) |
| `rev` | its condition on the internal revision: `[min, max]` (`max` null when open), null when any revision reads it (Ahuana took over Zerphi's index at revision 1) |
| `text` | the wording's first line, `{1}` left for the seed |
| `faction` | the wording's second line, "Passives in radius are Conquered by the ..." |
| `conqueror` | the closing run of capitalised words of the first line |
| `seeds` | R `mods` `UniqueJewelAlternateTreeInRadius*`: per version, the mod and the seed, keystone and radius ranges it rolls |

**Match on 0.5.5** (28 rows, 5 jewels): every field 100%, row order and `seeds` included.

## No official source

| Field | What it is | Where it comes from now |
|---|---|---|
| gem `ic`, `sprites` | the site's sprite sheet of the game's icons | carried from the committed copy by id; nothing rebuilds the sheet |
| unique `ic`, `sprites` | the same, for the uniques | carried by name and base |
| the tree's `reg`, `regions` | the part of the wheel a node sits in | ours, from the node positions |
| unique → base | the game server holds it | poe2db, checked against the trade site's list |
| gem names with `{0}` | three gems the game names with a slot it fills in | `gems.FILLED`, the artifact's words |

## A new patch

1. `python tools/gamepull.py` (the export, every file the builders read; a file outside its list is refreshed by
   the first tool that reads it after the build moves). The decoded game tables are read from the data repo's
   folder for the new patch (`gamepull.dat`), and from its newest folder, said on stderr, until that one exists.
2. `python tools/dev/explorecmp.py` — read what moved. After a patch the differences are the patch.
3. `python tools/sync.py --from-game`, then the rest of README "Update the game data" from step 3 on.
