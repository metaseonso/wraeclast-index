# Where the drill-down's data comes from

The drill-down page (`explore.html`) reads five data files in `data/explore/`. They used to come only from a
saved copy of the Wraeclast Index artifact, re-exported by hand. Each now has a builder that reads the game
files, and `python tools/sync.py --from-game` runs them. This page maps every field of every file to its
source, and says what has none.

**Sources, best first.** The game files, read through the RePoE fork's PoE2 export
(`https://repoe-fork.github.io/poe2/`, pulled by `tools/gamepull.py` into `tools/cache/official/`). Where the
export lacks a value, the game's own tables decoded for 0.5.5 (`metaseonso/wraeclast-data`, `game/0.5.5/out/raw/`,
issue #83). Then poe2db. Anything else is named where it is used.

**Proving it.** `python tools/dev/explorecmp.py` builds every block and holds it up against the committed file,
field by field (`--show N`, `--field F` for the differences). The numbers below are from patch 0.5.5
(export build 4.5.5.2, the same build the committed files were made from).

**Adopting it.** `tools/fromgame.py` `ADOPTED` names the blocks `--from-game` rebuilds by default: the ones
whose every difference is explained below. The others are built only when named
(`python tools/sync.py --from-game gems,tree,uniques`), and the committed copy stands until they are adopted.

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

## Uniques: `uniques.*.json`

Not adopted yet: the committed copy stands. A builder (`tools/uniqueitems.py`) is registered in `tools/fromgame.py`
`BUILDERS`; `python tools/dev/explorecmp.py uniques` measures it once the file is there. What it reads: R `uniques`, `base_items`, `mods`, `flavour`, `stat_translations`; the sprite cell `ic` and `sprites` are ours and carry over.

## Passive tree: `tree.*.json`

Not adopted yet: the committed copy stands. A builder (`tools/tree.py`) is registered in `tools/fromgame.py`
`BUILDERS`; `python tools/dev/explorecmp.py tree` measures it once the file is there. What it reads: R `passive_skill_trees/Default` and `stat_translations`; emotions from R `base_items`.

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
| gem names with `{0}` | three gems the game names with a slot it fills in | `gems.FILLED`, the artifact's words |

## A new patch

1. `python tools/gamepull.py` (the export, every file the builders read)
2. `python tools/dev/explorecmp.py` — read what moved. After a patch the differences are the patch.
3. `python tools/sync.py --from-game`, then the rest of README "Update the game data" from step 3 on.
