"""Every gem, from the game files: the drill-down's gem file (data/explore/gems.*.json), without the artifact.

Source: the RePoE fork's PoE2 export (https://repoe-fork.github.io/poe2/), through tools/gamepull.py:
  skill_gems.min.json   the gem: name, colour, type, tags, attribute weights, crafting level and types,
                        lineage, the skills it grants, a support's own text
  skills.min.json       each granted skill: description, skill types, cast time, costs, reservation,
                        cooldown, uses, cost multiplier, a support's allowed and added types, and every stat
                        set with its stats, per level, and the game's own rendered wording for each line
  gem_tags.min.json     the game's name for each gem tag
Every line of text is the game's own rendered wording (the export's stat_text, made with the game's stat
description files). The stat ids beside them are what the drill-down's "Technical details" box shows.

Two things are not in the game files, and are carried over from the committed copy by gem id:
  ic        the gem's cell in sprites/gems.webp, our own sheet of the game's icons (a new gem has none
            until the sheet is rebuilt; the search index then gives it the game's art, tools/sync.py)
  sprites   that sheet's grid
The layout of each field is the artifact's (docs/sources-explore.md maps every one to its source).

Usage:
  python tools/gems.py              build and print the counts, write nothing
  (tools/sync.py --from-game writes it; tools/dev/explorecmp.py gems holds it up against the committed copy)
"""
import datetime
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import build as export_build, official, state  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SOON = 'Coming Soon'   # a gem slot the game reserves for later: no name, nothing to show
# a spell's own base damage (and the one off-hand line that works the same way): the drill-down draws these as
# its damage table, min and max per level. Every other damage stat is a plain stat.
DAMAGE = re.compile(r'^(?:spell|off_hand)_(minimum|maximum)_(?:base|added)_(physical|fire|cold|lightning|chaos)_damage'
                    r'(?:_per_5_shield_evasion_rating)?$')
DUMMY = 'dummy_stat_display_nothing'   # a quality line the game draws as nothing
# Three gems are named by the game with a slot it fills in once the gem holds a monster ("Spectre: {0}").
# A {0} is never shown to a player, so the empty gem reads the way the drill-down has always named it.
# Our words, not the game's: the one place in this file that is.
FILLED = {'SkillGemSummonSpectre': 'any monster', 'SkillGemSummonBeast': 'any Beast',
          'SkillGemSoulCrystal': 'any Undead'}
KWREF = re.compile(r'\[([A-Za-z][A-Za-z0-9_-]*)(?:\|[^\]]*)?\]')


def levels(d):
    """A per-level table's levels, in order (the export keys them "1", "10", "11", ... "2")."""
    return sorted(d or {}, key=int)


def flat(vals):
    """One value when every level has the same one, else the list."""
    return vals[0] if vals and all(v == vals[0] for v in vals) else vals


def per_level(skill, key):
    """A value the skill sets per level, as one list over its levels; None when no level sets it."""
    pl = skill.get('per_level') or {}
    lv = levels(pl)
    if not any(key in (pl[l] or {}) for l in lv):
        return None
    return [(pl[l] or {}).get(key) for l in lv]


def stat_set(s):
    """One stat set as the drill-down reads it: its constant stats, its damage, its wording, and every line
    of wording at every level (txL)."""
    st = s.get('static') or {}
    stats = st.get('stats') or []
    pl = s.get('per_level') or {}
    lv = levels(pl)
    out = {'id': s['id']}
    if st.get('crit_chance') is not None:
        out['crit'] = st['crit_chance']
    dm = [(pl[l] or {}).get('damage_multiplier') for l in lv]
    if any(v is not None for v in dm):
        out['dm'] = dm
    elif st.get('damage_multiplier') is not None:
        out['dm0'] = st['damage_multiplier']
    bd, cs = {}, {}
    for i, x in enumerate(stats):
        sid = x.get('id')
        if 'value' in x:   # the same at every level
            cs[sid] = x['value']
            continue
        vals = []
        for l in lv:
            row = ((pl[l] or {}).get('stats') or [])
            v = row[i] if i < len(row) else None
            vals.append(v.get('value') if isinstance(v, dict) else v)
        if all(v is None for v in vals):   # declared, never set
            continue
        m = DAMAGE.match(sid or '')
        if m:
            bd.setdefault(m.group(2), [None, None])[m.group(1) == 'maximum'] = vals
        else:
            cs[sid] = vals
    if bd:
        out['bd'] = bd
    if st.get('stat_text'):
        out['tx'] = st['stat_text']
    q = [{'t': q.get('stat'), 's': q.get('stats')} for q in st.get('quality_stats') or []
         if q.get('stat') or DUMMY not in (q.get('stats') or {})]
    if q:
        out['q'] = q
    if cs:
        out['cs'] = cs
    txl = {}
    for l in lv:
        for k, t in ((pl[l] or {}).get('stat_text') or {}).items():
            txl.setdefault(k, {})[l] = t
    if txl:
        out['txL'] = txl
    return out if len(out) > 1 else None   # a set with nothing in it: the drill-down has nothing to draw


def gem(key, g, skills, tags):
    b = g.get('base_item') or {}
    sk = skills.get((g.get('grants_skills') or [None])[0]) or {}
    act = sk.get('active_skill') or {}
    st = sk.get('static') or {}
    sup = sk.get('support_gem') or {}
    out = {'n': b.get('display_name'), 'id': key.rsplit('/', 1)[-1], 't': g.get('gem_type'), 'c': g.get('color'),
           'tg': g.get('tags') or [], 'rq': g.get('requirement_weights') or {}}
    if g.get('is_lineage'):
        out['lin'] = 1
    out['cl'] = g.get('crafting_level')
    if g.get('crafting_types'):
        out['cty'] = g['crafting_types']
    txt = g.get('support_text') if g.get('gem_type') == 'support' else act.get('description')
    if txt:
        out['txt'] = txt
    out['ml'] = len(sk.get('per_level') or {})
    if act.get('types'):
        out['ty'] = act['types']
    if 'cast_time' in sk:
        out['cast'] = sk['cast_time']
    for f, src in (('cm', 'cost_multiplier'), ('asm', 'attack_speed_multiplier'), ('cd', 'cooldown'), ('su', 'stored_uses')):
        if st.get(src) is not None:
            out[f] = st[src]
    for f, src in (('cmL', 'cost_multiplier'), ('cdL', 'cooldown')):
        v = per_level(sk, src)
        if v is not None:
            out[f] = v
    if sup.get('added_types'):
        out['sa'] = sup['added_types']
    if sup.get('allowed_types'):
        out['sl'] = sup['allowed_types']
    costs = per_level(sk, 'costs')
    if costs is not None or st.get('costs') is not None:
        cost = {}
        for r in sorted({r for c in costs or [] if c for r in c}):   # a cost that moves with the level: a list
            cost[r] = [(c or {}).get(r) for c in costs]
        for r, v in (st.get('costs') or {}).items():                 # one that does not: a number
            cost.setdefault(r, v)
        out['cost'] = cost
    resv = per_level(sk, 'reservations')
    if resv is not None:
        res = sorted({r for c in resv if c for r in c})
        out['res'] = {r: flat([(c or {}).get(r) for c in resv]) for r in res}
    elif st.get('reservations') is not None:
        out['res'] = st['reservations']
    ss = [x for x in (stat_set(s) for s in sk.get('stat_sets') or []) if x]
    if ss:
        out['ss'] = ss
    if out['id'] in FILLED and out['n']:
        out['n'] = out['n'].replace('{0}', FILLED[out['id']])
    # the keywords the gem's own text links to, anywhere but its name (a [DNT] name is a marker, not a link)
    kw = sorted({m.group(1) for m in KWREF.finditer(json.dumps({k: v for k, v in out.items() if k != 'n'},
                                                                ensure_ascii=False))})
    if kw:
        out['kw'] = kw
    return out


READS = ('skill_gems.min.json', 'skills.min.json', 'gem_tags.min.json')


def pulled(names):
    """The day the newest of these export files was pulled: the date the data is from, so a rebuild of the
    same export writes the same bytes (and the same file name in data/explore/)."""
    days = [(state()['files'].get(n) or {}).get('pulled', '')[:10] for n in names]
    return max([d for d in days if d] or [datetime.date.today().isoformat()])


def carry(new, old):
    """The sprite cells (ours, not the game's) onto the fresh gems, by gem id, with the sheet's grid."""
    if not old:
        return new
    ic = {g['id']: g['ic'] for g in old.get('gems') or [] if g.get('ic')}
    for g in new['gems']:
        if g['id'] in ic:
            g['ic'] = ic[g['id']]
    if old.get('sprites'):
        new['sprites'] = old['sprites']
    return new


def build(old=None):
    """The gem file, whole (each stat set's level text in "txL"; tools/sync.py splits it out). old is the
    committed copy, for what the game files do not carry (carry())."""
    tags = official('gem_tags.min.json')
    skills = official('skills.min.json')
    gems = []
    for key, g in official('skill_gems.min.json').items():
        if (g.get('base_item') or {}).get('display_name') == SOON:
            continue
        gems.append(gem(key, g, skills, tags))
    meta = {'source': 'RePoE PoE2 dump', 'game_version': export_build(refresh=False) or export_build(),
            'generated': pulled(READS), 'n': len(gems)}
    return carry({'meta': meta, 'gem_tags': tags, 'gems': gems}, old)


def main():
    out = build()
    kinds = {}
    for g in out['gems']:
        kinds[g['t']] = kinds.get(g['t'], 0) + 1
    print('gems from the game files, build %s: %d (%s)' % (out['meta']['game_version'], len(out['gems']),
          ', '.join('%d %s' % (n, k) for k, n in sorted(kinds.items()))))


if __name__ == '__main__':
    main()
