"""Every unique item, from the game files: the drill-down's unique file (data/explore/uniques.*.json), without the artifact.

The game files do not say which base a unique is made on or which mods it carries: the game server holds that.
So the list of uniques, each one's base and its mod lines come from poe2db (data/uniques.json, tools/uniques.py),
and everything around them from the game files.

Sources, best first:
  the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
    uniques.min.json       the unique collection tab: each unique's name, item class and art (visual_identity.id)
    mods.min.json          every mod's wording with the game's keyword markup ("text"), its stats and level
    base_items.min.json    each base: item class, level requirement, drop level, properties, implicit mods
    item_classes.min.json  each item class's own name ("category")
    flavour.min.json       every flavour text, by the art id of the unique it belongs to
  the game's own tables, read out of the game's bundles on GGG's patch CDN (tools/gamepull.py dat()),
  for what the export leaves out:
    UniqueStashLayout            which uniques the collection tab hides (ShowIfEmpty...), and each one's name key
    Expedition2VerisiumCrafts    the Runeforged and Runemastered base each unique can be forged onto
    BaseItemTypes                the base each row of those two tables points at
    ArmourTypes                  a base's Runic Ward
    ItemSpirit                   a sceptre's Spirit
    WeaponTypes                  a crossbow's reload time (ReloadTime, in ms), which the export leaves out
    UniqueJewelLimits            how many of a unique jewel can be socketed
  the official trade site's own item list (data/trade.json, tools/tradedata.py): which unique is made on which
  base today. A Runeforged or Runemastered base the forge table names but the trade site does not list is left
  out; a unique poe2db names without a base takes the one base the trade site lists for it.
  poe2db (https://poe2db.tw/us/Unique_item), where the game files hold nothing:
    data/uniques.json      each unique's base and its lines with their roll ranges (implicit count, requirements)
    the list page          which uniques drop corrupted
    a unique's own page    the flavour text of a unique the collection tab does not hold (its text is then
                           checked against flavour.min.json, so the words are still the game's)

Every mod line is poe2db's line with the game's own wording and keyword markup: the mod in mods.min.json whose
text reads the same (numbers aside) gives the markup, poe2db gives the numbers, exactly as tools/sync.py
officialize() does. A line no game mod reads like ("Grants Skill: ...") stays poe2db's plain words.

Carried over from the committed copy:
  ic        the unique's cell in sprites/uniques.webp, our own sheet of the game's art, by name and base
            (by name alone when the base is new: every base of a unique shows the same art)
  sprites   that sheet's grid
  kw        the keywords the committed row had beyond what its own lines mark: what its lines stand for, the
            pool it rolls from (From Nothing's keystones, Mageblood's Legacies, Loreweave's mods), added to the
            keywords of the fresh lines
  a row     a unique on a base the trade site lists that none of the sources above gives lines for (Winter's
            Bite, two of the three Grand Spectrums): the committed row, whole, named in meta.kept with the
            reason, so no unique the site shows goes missing. The last good copy (tools/lastgood.py).
  the base  of a unique the forge table puts on several bases of one name (Eyes of the Runefather: three
            Runemastered Venerable Defender shields and a buckler): the committed row's item class decides

Usage:
  python tools/uniqueitems.py       build and print the counts, write nothing
  (tools/sync.py --from-game writes it; tools/dev/explorecmp.py uniques holds it up against the committed copy)
"""
import html
import json
import math
import re
import sys
import time
import urllib.parse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import build as export_build, dat as table, official  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
POE2DB_CACHE = ROOT / 'tools' / 'cache' / 'poe2db'
DAY = 24 * 3600
KWREF = re.compile(r'\[([A-Za-z][A-Za-z0-9_-]*)(?:\|[^\]]*)?\]')
NUM = re.compile(r'[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?')   # the same as tools/sync.py

# The drill-down's groups (explore.html UGRP), by the export's item class id. A class not named here is
# Armour when its base is tagged "armour", else a Weapon. Our grouping, not the game's.
GROUP = {'Ring': 'Accessory', 'Amulet': 'Accessory', 'Belt': 'Accessory', 'Jewel': 'Jewel',
         'LifeFlask': 'Flask', 'ManaFlask': 'Flask', 'UtilityFlask': 'Charm', 'Relic': 'Relic',
         'TowerAugmentation': 'Tablet', 'Quiver': 'Armour', 'Focus': 'Armour'}
UGRP = ['Weapon', 'Armour', 'Accessory', 'Jewel', 'Flask', 'Charm', 'Relic', 'Tablet', 'Unlisted']
FORGED = ('', 'Runeforged ', 'Runemastered ')   # a unique's own base first, then the ones it is forged onto
ELEMENTS = (('fire', '[Fire|Fire] Damage'), ('cold', '[Cold|Cold] Damage'),
            ('lightning', '[Lightning|Lightning] Damage'), ('chaos', '[Chaos] Damage'))


# ---------------------------------------------------------------- reading the sources

def poe2db(page):
    """One poe2db page, kept a day in tools/cache/ so a day's builds ask once."""
    from uniques import fetch
    f = POE2DB_CACHE / (re.sub(r'[^A-Za-z0-9_-]', '_', page) + '.html')
    if not f.exists() or time.time() - f.stat().st_mtime > DAY:
        body = fetch('https://poe2db.tw/us/' + urllib.parse.quote(page, safe="'"))   # poe2db wants the ' as it is
        POE2DB_CACHE.mkdir(parents=True, exist_ok=True)
        f.write_text(body, encoding='utf-8', newline='\n')
    return f.read_text(encoding='utf-8')


def corrupted():
    """The uniques poe2db's list shows as dropping corrupted: {name | base}."""
    out = set()
    for card in re.split(r'<span class="uniqueName">', poe2db('Unique_item'))[1:]:
        end = card.find('<div class="col">')   # the next card starts here
        body = card if end < 0 else card[:end]
        if 'class="corrupted"' not in body:
            continue
        name = html.unescape(re.sub(r'<[^>]+>', '', card[:card.index('</span>')])).strip()
        tl = re.search(r'<span class="uniqueTypeLine">(.*?)</span>', body, re.S)
        out.add(name + ' | ' + (html.unescape(re.sub(r'<[^>]+>', '', tl.group(1))).strip() if tl else ''))
    return out


def page_flavour(name, flavours):
    """The flavour text on a unique's own poe2db page, if the game's flavour file holds the same words."""
    m = re.search(r'class="FlavourText"[^>]*>(.*?)</div>', poe2db(name.replace(' ', '_')), re.S)
    if not m:
        return None
    words = lambda t: re.sub(r'\s+', ' ', t).strip()
    seen = words(html.unescape(re.sub(r'<[^>]+>', ' ', m.group(1))))
    return next((t for t in flavours.values() if words(t) == seen), None)


# ---------------------------------------------------------------- mod lines

def number_list(line):
    import sync
    return NUM.findall(sync.plain(line))


FLIP = (('reduced', 'increased'), ('less', 'more'))


def flip(text):
    """A line with "reduced" read as "increased" and "less" as "more"."""
    for a, b in FLIP:
        text = re.sub(r'\b%s\b' % a, b, text)
    return text


def same_words(marked, line):
    """The mod's wording with poe2db's increased / reduced (more / less) where the two differ."""
    for a, b in FLIP:
        for x, y in ((a, b), (b, a)):
            if re.search(r'\b%s\b' % x, line) and not re.search(r'\b%s\b' % x, marked):
                marked = re.sub(r'\b%s\b' % y, x, marked, count=1)
    return marked


DEFENCE = re.compile(r'armour|evasion|energy_shield|physical_damage_reduction|block|ward')


def is_local(m):
    return any(s['id'].startswith('local_') for s in m.get('stats') or [])


def kind(m):
    """What a mod changes: 'defence' (armour, evasion, energy shield, block, ward) or 'other'."""
    return 'defence' if any(DEFENCE.search(s['id']) for s in m.get('stats') or []) else 'other'


def base_kinds(base):
    """What a base has of its own for a local mod to change: its defences, or its weapon (and flask) numbers."""
    p = (base or {}).get('properties') or {}
    out = set()
    if any(p.get(k) for k in ('armour', 'evasion', 'energy_shield', 'block')):
        out.add('defence')
    if p.get('attack_time') or p.get('charges_max'):
        out.add('other')
    return out


class Mods:
    """Every mod the export words, found by its wording with the numbers taken out (tools/sync.py skeleton).
    One mod often holds several lines that poe2db lists one by one, so each run of a mod's lines is found
    too. A range across zero poe2db writes as "(-10-10)% reduced" where the mod says "increased": a line
    found under neither wording is looked up with the two words swapped (FLIP)."""

    def __init__(self, mods):
        import sync
        self.mods = mods
        self.by, self.flipped = {}, {}
        for mid, m in mods.items():
            lines = (m.get('text') or '').split('\n')
            for i in range(len(lines)):
                for j in range(i + 1, len(lines) + 1):
                    run = '\n'.join(lines[i:j])
                    if run.strip():
                        self.by.setdefault(sync.skeleton(run), []).append((mid, run))
                        self.flipped.setdefault(flip(sync.skeleton(run)), []).append((mid, run))

    def find(self, line, implicits, domain, kinds):
        """(mod id, the mod's own wording) for this poe2db line: a mod with the same numbers first, then a
        base's implicit (for an implicit line), then a unique's own mod (its id starts "Unique"), then one
        that is local exactly when the item has what it changes (local(): "increased Armour" on body armour
        is the item's own Armour, on a bow it is the wearer's), then one of the item's mod domain, then the
        mod whose whole text it is."""
        import sync
        hits = self.by.get(sync.skeleton(line)) or self.flipped.get(flip(sync.skeleton(line)))
        if not hits:
            return None, None
        nums = number_list(line)

        def score(hit):
            mid, run = hit
            m = self.mods[mid]
            return (-(number_list(run) == nums),
                    -(mid in implicits),
                    -(m.get('generation_type') == 'unique'),
                    -mid.startswith('Unique'),
                    -(is_local(m) == bool(kinds & {kind(m)})),
                    -(m.get('domain') == domain),
                    -(run == m['text']),
                    'UNUSED' in mid, mid)
        return min(hits, key=score)


class Wordings:
    """The stat descriptions' own wordings, by skeleton, for a line no mod's text reads like: a tablet's
    "Map also counts as a [Biome|Water] Map" is a stat the tablet file words, not a mod text."""
    FILES = ('stat_translations/tablet_stat_descriptions.min.json', 'stat_translations/stat_descriptions.min.json')

    def __init__(self):
        import sync
        self.by = {}
        for f in self.FILES:
            for e in official(f):
                for w in e['English']:
                    text = re.sub(r'\{\d+\}', '1', w['string'])
                    self.by.setdefault(sync.skeleton(text), text)

    def find(self, line):
        import sync
        return self.by.get(sync.skeleton(line))


def tidy(line):
    """The game writes a few lines with a space before the line break ("to a Map \n1 uses remaining")."""
    return re.sub(r' +\n', '\n', line)


def mark(lines, ni, base, mods, words=None):
    """poe2db's lines in the game's wording: (implicit lines, explicit lines, what each was read from as
    (mod id, the mod's wording, poe2db's line), the mod id of each line or None)."""
    import sync
    implicits = set((base or {}).get('implicits') or [])
    domain = (base or {}).get('domain')
    kinds = base_kinds(base)
    out, found, ids = [], [], []
    for i, line in enumerate(lines):
        mid, run = mods.find(line, implicits if i < ni else (), domain, kinds)
        ids.append(mid)
        if mid:
            out.append(tidy(same_words(sync.transfer(run, line), line)))
            found.append((mid, run, line))
        elif words and words.find(line):
            out.append(tidy(same_words(sync.transfer(words.find(line), line), line)))
        else:
            out.append(line)
    return out[:ni], out[ni:], found, ids


# ---------------------------------------------------------------- properties

RANGE = re.compile(r'^([+-]?)\(?([+-]?\d+(?:\.\d+)?)(?:-([+-]?\d+(?:\.\d+)?))?\)?$')


def ranges(text):
    """Every number of a line as (low, high): "(4-6)" (4, 6), "10" (10, 10), "-(5-1)" (-5, -1)."""
    out = []
    for token in number_list(text):
        m = RANGE.match(token)
        if not m:
            continue
        a = float(m.group(2))
        b = float(m.group(3)) if m.group(3) else a
        if m.group(1) == '-':
            a, b = -a, -b
        out.append((min(a, b), max(a, b)))
    return out


def rolls(mods, found, extra=()):
    """Each stat the mods set, summed: {stat id: [lowest roll, highest roll]}. A mod poe2db lists with a
    different range than the export (the game moved it) takes poe2db's numbers, for each stat its text
    shows as it is: "(50-75)% reduced Charges per use" is local_charges_used_+% from -75 to -50."""
    per_mod = {}
    for mid, run, line in found:
        stats = mods.mods[mid].get('stats') or []
        got = per_mod.setdefault(mid, {s['id']: [s.get('min', 0), s.get('max', 0)] for s in stats})
        have, want = ranges(run), ranges(line)
        if len(have) != len(want):
            continue
        free = list(stats)
        for h, w in zip(have, want):
            for s in free:
                if (s.get('min'), s.get('max')) == h:
                    got[s['id']] = [w[0], w[1]]
                elif (s.get('min'), s.get('max')) == (-h[1], -h[0]):   # shown as "reduced": the stat is negative
                    got[s['id']] = [-w[1], -w[0]]
                else:
                    continue
                free.remove(s)
                break
    for mid in extra:
        per_mod.setdefault(mid, {s['id']: [s.get('min', 0), s.get('max', 0)] for s in mods.mods[mid].get('stats') or []})
    out = {}
    for got in per_mod.values():
        for sid, (lo, hi) in got.items():
            lo_hi = out.setdefault(sid, [0, 0])
            lo_hi[0] += lo
            lo_hi[1] += hi
    return out


def num(x, places=2):
    """A number the way the game writes it: no trailing zeros ("1.5", "1", "7.25")."""
    s = '%.*f' % (places, x)
    return s.rstrip('0').rstrip('.') if '.' in s else s


def span(lo, hi, places=0):
    a, b = num(lo, places), num(hi, places)
    return a if a == b else '(%s-%s)' % (a, b)


def whole(x):
    """The game rounds a scaled value to the nearest whole number."""
    return int(math.floor(x + 0.5))


def scaled(base, flat, inc, lo_hi):
    """(base + flat) * (1 + increased / 100), at the lowest and at the highest roll."""
    return [whole((base + flat[i]) * (1 + inc[i] / 100)) for i in lo_hi]


def weapon_lines(p, st, spirit, reload=0):
    z = [0, 0]
    out = []
    phys_pct = 100
    split = {}
    for kind, _ in ELEMENTS:   # a base whose damage is partly an element (the hidden base implicit)
        pct = st.get('local_weapon_implicit_hidden_%%_base_damage_is_%s' % kind)
        if pct:
            split[kind] = pct[0]
            phys_pct -= pct[0]
    bmin, bmax = p.get('physical_damage_min', 0), p.get('physical_damage_max', 0)
    inc = st.get('local_physical_damage_+%', z)
    if 'local_weapon_no_physical_damage' not in st:
        lo = scaled(int(bmin * phys_pct / 100), st.get('local_minimum_added_physical_damage', z), inc, (0, 1))
        hi = scaled(int(bmax * phys_pct / 100), st.get('local_maximum_added_physical_damage', z), inc, (0, 1))
        if hi[1] > 0:
            out.append('[Physical] Damage: %s-%s' % (span(*lo), span(*hi)))
    for kind, label in ELEMENTS:
        mn = [a + b for a, b in zip(st.get('local_minimum_added_%s_damage' % kind, z),
                                    st.get('local_weapon_implicit_hidden_added_minimum_%s_damage' % kind, z))]
        mx = [a + b for a, b in zip(st.get('local_maximum_added_%s_damage' % kind, z),
                                    st.get('local_weapon_implicit_hidden_added_maximum_%s_damage' % kind, z))]
        if kind in split:   # the element's share of the base damage, rounded down
            mn = [v + int(bmin * split[kind] / 100) for v in mn]
            mx = [v + int(bmax * split[kind] / 100) for v in mx]
        if mx[1] > 0:
            out.append('%s: %s-%s' % (label, span(*mn), span(*mx)))
    if p.get('critical_strike_chance'):
        add = st.get('local_critical_strike_chance', z)
        inc = st.get('local_critical_strike_chance_+%', z)
        crit = [(p['critical_strike_chance'] + add[i]) * (1 + inc[i] / 100) / 100 for i in (0, 1)]
        out.append('[Critical|Critical Hit] Chance: %s%%' % span(crit[0], crit[1], 2))
    if p.get('attack_time'):
        inc = st.get('local_attack_speed_+%', z)
        aps = [round(1000 / p['attack_time'] * (1 + inc[i] / 100), 2) for i in (0, 1)]
        out.append('Attacks per Second: %s' % span(aps[0], aps[1], 2))
    if reload:   # faster reloading is less time: the highest roll gives the shortest
        inc = st.get('local_reload_speed_+%', z)
        secs = [round(reload / 1000 / (1 + inc[i] / 100), 2) for i in (1, 0)]
        out.append('Reload Time: %s' % span(secs[0], secs[1], 2))
    if spirit:
        inc = st.get('local_spirit_+%', z)
        out.append('[Spirit]: %s' % span(*scaled(spirit, z, inc, (0, 1))))
    return out


# each defence: its base property, its label, its flat stats, its increased stats
DEFENCES = (
    ('armour', '[Armour]', ('local_base_physical_damage_reduction_rating', 'local_physical_damage_reduction_rating'),
     ('local_physical_damage_reduction_rating_+%', 'local_armour_and_evasion_+%', 'local_armour_and_energy_shield_+%',
      'local_armour_and_evasion_and_energy_shield_+%')),
    ('evasion', '[Evasion|Evasion Rating]', ('local_base_evasion_rating', 'local_evasion_rating'),
     ('local_evasion_rating_+%', 'local_armour_and_evasion_+%', 'local_evasion_and_energy_shield_+%',
      'local_armour_and_evasion_and_energy_shield_+%')),
    ('energy_shield', '[EnergyShield|Energy Shield]', ('local_energy_shield',),
     ('local_energy_shield_+%', 'local_armour_and_energy_shield_+%', 'local_evasion_and_energy_shield_+%',
      'local_armour_and_evasion_and_energy_shield_+%')),
    ('ward', '[Ward|Runic Ward]', ('local_ward',), ('local_ward_+%',)),
)
NO_ES = ('local_unique_tabula_rasa_no_requirement_or_energy_shield', 'local_hidden_no_energy_shield')


def total(st, ids):
    return [sum(st.get(s, [0, 0])[i] for s in ids) for i in (0, 1)]


def armour_lines(p, st, ward):
    out = []
    if p.get('block'):
        add = st.get('local_additional_block_chance_%', [0, 0])
        inc = st.get('local_block_chance_+%', [0, 0])
        block = [int((p['block'] + add[i]) * (1 + inc[i] / 100)) for i in (0, 1)]   # a whole number, rounded down
        out.append('[Block] chance: %s%%' % span(*block))
    for prop, label, flat, inc in DEFENCES:
        if prop == 'energy_shield' and any(s in st for s in NO_ES):
            continue
        base = ward if prop == 'ward' else (p.get(prop) or {}).get('min', 0)
        got = scaled(base, total(st, flat), total(st, inc), (0, 1))
        if got[1] > 0:
            out.append('%s: %s' % (label, span(*got)))
    return out


def flask_lines(p, st, charm):
    z = [0, 0]
    out = []
    if charm:
        inc = total(st, ('local_charm_duration_+%', 'local_flask_duration_+%'))
        secs = [p['duration'] / 10 * (1 + inc[i] / 100) for i in (0, 1)]
        out.append('Lasts %s Second%s' % (span(secs[0], secs[1], 1), '' if secs == [1, 1] else 's'))
    else:
        what = 'Life' if p.get('life_per_use') else 'Mana'
        amount = p.get('life_per_use') or p.get('mana_per_use') or 0
        inc = total(st, ('local_flask_amount_to_recover_+%', 'local_flask_life_to_recover_+%'))
        more = st.get('local_flask_life_to_recover_+%_final', z)
        got = [whole(amount * (1 + inc[i] / 100) * (1 + more[i] / 100)) for i in (0, 1)]
        rate = st.get('local_flask_recovery_speed_+%', z)
        longer = st.get('local_flask_duration_+%', z)
        # a higher recovery rate is over less time: the lowest roll of the rate gives the longest time
        secs = [p['duration'] / 10 * (1 + longer[i] / 100) / (1 + rate[1 - i] / 100) for i in (0, 1)]
        how = 'every' if 'local_flask_always_drinking' in st else 'over'
        out.append('Recovers %s %s %s %s Seconds' % (span(*got), what, how, span(min(secs), max(secs), 1)))
    used = st.get('local_charges_used_+%', z)
    per = [whole(p['charges_per_use'] * (1 + used[i] / 100)) for i in (0, 1)]
    more = st.get('local_max_charges_+%', z)
    extra = st.get('local_extra_max_charges', z)
    cap = [int(p['charges_max'] * (1 + more[i] / 100)) + extra[i] for i in (0, 1)]
    out.append('Consumes %s of %s Charges on use' % (span(min(per), max(per)), span(min(cap), max(cap))))
    return out


def properties(base, st, ward, spirit, reload=0):
    """The lines a unique's base shows under its name, with its own local mods applied, at their lowest and
    highest rolls (no quality, nothing socketed)."""
    if not base:
        return []
    p = base.get('properties') or {}
    cls = base.get('item_class')
    if p.get('attack_time') or spirit:
        return weapon_lines(p, st, spirit, reload)
    if cls in ('LifeFlask', 'ManaFlask', 'UtilityFlask') and p.get('charges_max'):
        return flask_lines(p, st, cls == 'UtilityFlask')
    if any(p.get(k) for k in ('armour', 'evasion', 'energy_shield', 'block')) or ward:
        return armour_lines(p, st, ward)
    return []


# ---------------------------------------------------------------- the rows

def level(base, off, mods, used):
    """The level a unique needs on this base: the base's own level, or what its mods need if that is more.
    What the mods need is poe2db's requirement for the unique (on a forged base: the unique it was forged
    from, whose base never needs more than the forged one), else four fifths of the highest mod's level,
    the rule poe2db's requirements follow for 426 of the 445 uniques that list one."""
    if not base:
        return None
    lv = (base.get('requirements') or {}).get('level') or base.get('drop_level') or 0
    if off and (off.get('rq') or [0])[0]:
        return max(lv, off['rq'][0])
    top = max([mods.mods[m].get('required_level') or 0 for m in used] or [0])
    return max(lv, int(top * 0.8)) or None


def pick_base(bases, name):
    """The base item of this name: a base anyone can find before a unique-only copy of it."""
    got = (bases.get(name) or []) if name else []
    if not got:
        return None, None
    return sorted(got, key=lambda kv: ('Unique' in kv[0], kv[1].get('release_state') != 'released'))[0]


def build(old=None):
    """The unique file, in the artifact's form. old is the committed copy, for the sprite cells (carry())."""
    import sync
    lines_of, by_name = sync.load_official()   # poe2db: name | base -> lines
    stash = official('uniques.min.json')
    base_items = official('base_items.min.json')
    classes = official('item_classes.min.json')
    flavours = official('flavour.min.json')
    mods = Mods(official('mods.min.json'))
    words = Wordings()
    trade = trade_uniques()
    old_class = {(r['n'], r.get('b') or ''): r.get('c') for r in (old or {}).get('items') or []}
    old_kw = {(r['n'], r.get('b') or ''): set(r.get('kw') or []) for r in (old or {}).get('items') or []}
    layout = table('UniqueStashLayout')
    base_rows = table('BaseItemTypes')
    ward = {base_rows[r['BaseItemType']]['Id']: r['Ward'] for r in table('ArmourTypes') if r.get('Ward')}
    spirit = {base_rows[r['BaseItemType']]['Id']: r['SpiritGranted'] for r in table('ItemSpirit')}
    reload = {base_rows[r['BaseItemType']]['Id']: r['ReloadTime'] for r in table('WeaponTypes') if r.get('ReloadTime')}

    bases = {}
    for bid, b in base_items.items():
        bases.setdefault(b['name'], []).append((bid, b))

    # the collection tab, by name: each unique's art, class, and whether the tab hides it
    tab, name_of_word = {}, {}
    for key, u in stash.items():
        row = layout[int(key)]
        tab.setdefault(u['name'], []).append((u, row))
        name_of_word.setdefault(row['WordsKey'], u['name'])
    hidden = {n: all(not r['ShowIfEmptyStandard'] and not r['ShowIfEmptyChallengeLeague'] for _, r in e)
              for n, e in tab.items()}
    limit = {name_of_word[r['JewelName']]: r['Limit'] for r in table('UniqueJewelLimits')
             if r['JewelName'] in name_of_word}
    cor = corrupted()

    # every row: poe2db's name | base, then each Runeforged and Runemastered base the game forges it onto.
    # The forge table names the exact base of both ends (a base name can have several: Venerable Defender)
    keys = [tuple(k.split(' | ', 1)) for k in lines_of]
    exact_base, choices, forged_from = {}, {}, {}
    for r in table('Expedition2VerisiumCrafts'):
        n = name_of_word.get(r['UniqueName'])
        if not n:   # a unique the export's collection tab does not name (Gatecrasher, Heretic's Veil)
            continue
        for end in ('OriginalBaseType', 'NewBaseType'):   # the game names two "Runeforged Shortbow"
            bid = base_rows[r[end]]['Id']
            got = choices.setdefault((n, base_rows[r[end]]['Name']), [])
            if bid in base_items and bid not in got:
                got.append(bid)
        new = (n, base_rows[r['NewBaseType']]['Name'])
        forged_from.setdefault(new, base_rows[r['OriginalBaseType']]['Name'])   # Sacred Focus -> Runemastered Plumed Focus
        if new not in keys and (not trade or new[1] in (trade.get(n) or ())):   # the trade site lists it today
            keys.append(new)
    # Of several bases of one name (Mjolner forges onto three Runemastered Torment Clubs, each with implicits of
    # its own), one row: the one the committed row was, by its item class and the keywords of its implicits, else
    # the first the forge table names.
    def closeness(key, bid):
        imp = ' '.join(mods.mods[m].get('text') or '' for m in base_items[bid].get('implicits') or [] if m in mods.mods)
        return (sync.plain(classes[base_items[bid]['item_class']]['category']) == old_class.get(key),
                len(set(KWREF.findall(imp)) & old_kw.get(key, set())))
    for key, ids in choices.items():
        if ids:
            exact_base[key] = max(reversed(ids), key=lambda i: closeness(key, i))
    known = {n for n, _ in keys}
    keys += [(n, '') for n in tab if n not in known]   # in the collection tab, but no base anywhere
    # a unique poe2db knows no base for: the one base the trade site lists for it
    keys = [(n, b or (trade[n][0] if len(trade.get(n) or []) == 1 and trade[n][0] in bases else ''))
            for n, b in keys]

    items = []
    for n, b in keys:
        bid = exact_base.get((n, b))
        bid, base = (bid, base_items[bid]) if bid else pick_base(bases, b)
        off, exact = sync.official_for({'n': n, 'b': b}, lines_of, by_name)
        if not off and (n, b) in forged_from:   # forged from a base of another name: that row's lines
            off, exact = lines_of.get(n + ' | ' + forged_from[(n, b)]), False
        forged = b.startswith(FORGED[1:])
        read_on = base
        if forged and off:   # poe2db's lines are the unique on the base it was forged from
            ob = forged_from.get((n, b)) or re.sub(r'^Rune\w+ ', '', b)
            read_on = base_items[exact_base[(n, ob)]] if exact_base.get((n, ob)) else pick_base(bases, ob)[1] or base
        im, ex, found, ids = mark(off['ls'], off.get('ni', 0), read_on, mods, words) if off else ([], [], [], [])
        if forged and base:   # the forged base's own implicits instead of the old base's
            was = set((read_on or {}).get('implicits') or [])
            im = [line for line, mid in zip(im, ids) if mid not in was]
            im += [t for t in (tidy(mods.mods[m]['text']) for m in base.get('implicits') or []
                               if (mods.mods.get(m) or {}).get('text')) if t not in im]
            found = [f for f in found if f[0] not in was]
        used = list(dict.fromkeys(mid for mid, _, _ in found))   # a mod poe2db lists over several lines is one mod
        # the base's own implicits count even where poe2db shows none: a hidden one splits a Torment Club's
        # damage into Physical and Lightning
        st = rolls(mods, found, [m for m in (base or {}).get('implicits') or [] if m not in used and m in mods.mods])
        entry = tab.get(n) or []
        if base:
            cls = base['item_class']
            g = GROUP.get(cls) or ('Armour' if 'armour' in base['tags'] else 'Weapon')
            c = sync.plain(classes[cls]['category'])
        else:
            g, c = None, entry[0][0]['item_class'] if entry else ''
        row = {'n': n, 'b': b, 'g': g, 'c': c, 'ex': ex,
               'pr': properties(base, st, ward.get(bid, 0), spirit.get(bid, 0), reload.get(bid, 0)), 'im': im}
        fl = flavour(n, b, entry, flavours)
        if fl:
            row['fl'] = fl
        if n in limit:
            row['lim'] = limit[n]
        if n + ' | ' + b in cor:
            row['cor'] = 1
        lv = off['rq'][0] if exact and (off.get('rq') or [0])[0] else level(base, off, mods, used)
        if lv:
            row['lv'] = lv
        if hidden.get(n) or not base:   # the tab hides it, or nothing says what it is made on
            row['g'] = 'Unlisted'
            row['nolist'] = 1
        kw = sorted({m.group(1) for m in KWREF.finditer(json.dumps(im + ex + row['pr'], ensure_ascii=False))})
        if kw:
            row['kw'] = kw
        items.append(row)
    kept = keep(items, old, trade, mods)
    items.sort(key=lambda r: (UGRP.index(r['g']), r['c'], r['n'],
                              next(i for i, p in reversed(list(enumerate(FORGED))) if r['b'].startswith(p)), r['b']))
    meta = {'src': 'RePoE ' + (export_build(refresh=False) or export_build()), 'n': len(items)}
    if kept:
        meta['kept'] = kept
    return carry({'meta': meta, 'items': items}, old)


def trade_uniques():
    """The official trade site's unique list, {name: [base, ...]} (data/trade.json), or {} when it is not here."""
    f = ROOT / 'data' / 'trade.json'
    if not f.exists():
        return {}
    got = json.loads(f.read_text(encoding='utf-8')).get('uniques') or {}
    return {n: b for n, b in got.items() if n != 'INCOMPLETE'}


# The Grand Spectrum gems: the game has three (the collection tab's three arts, the trade site's three bases),
# poe2db lists the Ruby only, and the game files do not say which of the three "per socketed Grand Spectrum" mods
# sits on which gem. The committed rows had them from the artifact, matching each gem's flavour text, until a
# fallback by name gave all three the Ruby's line: the wording here is the game's own mod text, by mod id.
KEPT_LINES = {('Grand Spectrum', 'Sapphire'): 'UniqueAllResistancePerStackableJewel1',
              ('Grand Spectrum', 'Emerald'): 'UniqueMaximumSpiritPerStackableJewel1'}


def keep(items, old, trade, mods):
    """The committed rows the fresh build has no row for, put back (last good wins), each named with why. A row
    the committed copy had with no base goes only when the fresh build has that unique on a base."""
    have = {(r['n'], r['b']) for r in items}
    named = {r['n'] for r in items if r['b']}
    out = []
    for r in (old or {}).get('items') or []:
        key = (r['n'], r.get('b') or '')
        if key in have or (not key[1] and key[0] in named):
            continue
        row = {k: v for k, v in r.items() if k not in ('v', 'ls', 'ch')}
        on_trade = key[1] in (trade.get(key[0]) or ())
        why = 'on the trade site, but no source here gives its lines' if on_trade else 'no source here has it'
        if key in KEPT_LINES:
            row['ex'] = [mods.mods[KEPT_LINES[key]]['text']]
            row['kw'] = sorted(set(KWREF.findall(row['ex'][0])))
            why += '; its line is the game mod ' + KEPT_LINES[key]
        items.append(row)
        have.add(key)
        out.append({'n': key[0], 'b': key[1], 'why': why})
    return sorted(out, key=lambda k: (k['n'], k['b']))


def flavour(name, base, entry, flavours):
    """A unique's flavour text: the game's, by the art id of its place in the collection tab (the copy of the
    art that names its base first, for a unique made on several). One the tab does not hold: its poe2db page."""
    if not entry:
        return page_flavour(name, flavours)
    squash = re.sub(r'\W', '', base).lower()
    art = sorted(entry, key=lambda e: squash not in e[0]['visual_identity']['dds_file'].lower().replace('_', ''))
    vid = art[0][0]['visual_identity']['id']
    for key in (vid.rstrip('_'), re.sub(r'_+[a-z]$', '', vid).rstrip('_')):   # the flavour file drops the art's suffix
        t = flavours.get(key)
        if t is None:
            t = next((v for k, v in flavours.items() if k.rstrip('_') == key), None)
        if t is not None:
            return t or None
    return None


def carry(new, old):
    """The sprite cells (ours, not the game's) onto the fresh rows, by name and base, else by name alone, with
    the sheet's grid."""
    if not old:
        return new
    by_key, by_name, kw = {}, {}, {}
    for r in old.get('items') or []:
        lines = json.dumps((r.get('im') or []) + (r.get('ex') or []) + (r.get('pr') or []), ensure_ascii=False)
        extra = set(r.get('kw') or []) - set(KWREF.findall(lines))
        if extra:
            kw[(r['n'], r.get('b') or '')] = extra
        if r.get('ic'):
            by_key[(r['n'], r.get('b'))] = r['ic']
            by_name.setdefault(r['n'], r['ic'])
    for r in new['items']:
        ic = by_key.get((r['n'], r['b'])) or by_name.get(r['n'])
        if ic:
            r['ic'] = ic
        # the keywords of what a unique's lines stand for but do not mark: the pool it rolls from ("(20-10)% less
        # [random stat]", From Nothing's keystone, Mageblood's Legacies, Loreweave's mods), the committed list
        if kw.get((r['n'], r['b'])):
            r['kw'] = sorted(set(r.get('kw') or []) | kw[(r['n'], r['b'])])
    if old.get('sprites'):
        new['sprites'] = old['sprites']
    return new


def main():
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    out = build()
    groups = {}
    for r in out['items']:
        groups[r['g']] = groups.get(r['g'], 0) + 1
    print('uniques from the game files, build %s: %d rows, %d uniques (%s)' % (
        out['meta']['src'], len(out['items']), len({r['n'] for r in out['items']}),
        ', '.join('%d %s' % (groups[g], g) for g in UGRP if g in groups)))


if __name__ == '__main__':
    main()
