"""data/bosshits.json: how hard a monster hits at each area level, and each boss's big hits (#80, #126).

Two parts, and they are held to different labels:

  levels   per area level, a normal monster's life, damage, accuracy, armour and evasion. The game's own table
           (DefaultMonsterStats), the same numbers data/gamestats.json carries. No label: it is measured.
  bosses   every boss in data/bosses.json that joins to a monster in the game files: its life and damage
           multipliers, attack time, resistances, and its biggest hits by damage type with their size at its
           level, cooldown and cast time. The multipliers, cooldowns and resistances are the game's; the size
           of a hit is worked out, so it carries the label Estimate and the file says how (`calc`).

How a hit's size is worked out (Estimate; checked against poe2db and Path of Building, design/boss-hits.md):

  attack   level damage x the boss's damage multiplier x the skill's attack damage x 65% (unique rarity),
           spread +-its damage spread, split by the skill's own conversion.
           level damage: DefaultMonsterStats.Damage. Boss damage: MonsterVarieties.DamageMultiplier. Skill:
           100 + BaseMultiplier/100 %, times any "more damage" the skill has. Rarity: Mods MonsterUnique5.
  spell    3.885209 (GameConstants SkillDamageBaseEffectiveness) x the skill's base effectiveness
           x (1 + incremental x (level - 1)) x (1 + damage incremental)^(level - 1) x the skill's base value per
           damage type (GrantedEffectStatSets + ...PerLevel) x 65% (unique rarity). The boss's own damage
           multiplier is NOT applied to spells: Path of Building leaves it out and poe2db prints spells without
           it; whether the game applies it is not settled (Subject to change).
  over time  the same as a spell, per second (the game stores it per minute).

Map tier scaling: MonsterMapDifficulty and MonsterMapBossDifficulty ship as zeros in 0.5.5, so a waystone tier is
read as its area level (MapTiers: tier 1 = 65 ... tier 16 = 80); an attack grows with that level's damage row and
a spell with its own formula at that level. Any
hidden per-tier bonus the server adds is not in the files: Subject to change.

Input: the decoded game tables (TABLES below), read through tools/gamepull.py dat(), which runs
tools/datpull.mjs --raw and keeps them in tools/cache/dat-<CDN folder>/ (no token, not in git):

    python tools/pipeline.py --only bosshits    the way to run it: a patch stage, under the last good rule
    python tools/bosshits.py                    write data/bosshits.json in place
    python tools/bosshits.py --raw <dir>        read <Table>.json files from a folder instead
    python tools/bosshits.py --report           say what it would write, write nothing

Names: the game gives almost no monster skill a player-facing name. A hit is called by the game's
own name where it has one ("Basic Attack"), else by its internal skill name split into words with the
boss's name and the file-type prefix taken off ("Fire Vortex"); `named` says which. No internal id is written.
"""
import argparse
import datetime
import json
import math
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
import sitedata  # noqa: E402
from gamepull import dat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
RAW = os.environ.get('WI_GAME_RAW')      # a folder of <Table>.json to read instead of gamepull.dat()
TABLES = ['MonsterVarieties', 'MonsterTypes', 'MonsterResistances', 'GrantedEffects', 'GrantedEffectsPerLevel',
          'GrantedEffectStatSets', 'GrantedEffectStatSetsPerLevel', 'ActiveSkills', 'ActiveSkillType', 'Stats', 'Mods',
          'DefaultMonsterStats', 'MapTiers', 'WorldAreas', 'GameConstants']
TYPES = ['Physical', 'Fire', 'Cold', 'Lightning', 'Chaos']
HITS = 4            # big hits kept per boss: the biggest, plus the biggest of each damage type, up to this many
NO_DAMAGE = {'base_deal_no_damage', 'spell_skills_deal_no_damage', 'base_deal_no_spell_damage'}
NOT_A_HIT = re.compile(r'^(empty_action|change_to_stance|teleport|move_daemon|dash_to_target|monster_dodge|face_last|do_nothing'
                       r'|translate_rotate|walk_emerge|summon_|spawn_object|geometry_trigger|transform|marker_warp|izaro_warp)')
DIRECTION = re.compile(r'\b(left|right|forwards?|backwards?|front|back|short|mid|long|low|high|start|end|l|r|\d+)\b', re.I)
WORDS = {'proj': 'projectile', 'dmg': 'damage', 'aoe': 'area', 'tele': 'teleport', 'ga': '', 'gs': '', 'eaa': '', 'eas': ''}


def load(raw):
    if not raw:
        return {t: dat(t) for t in TABLES}
    raw = Path(raw)
    missing = [t for t in TABLES if not (raw / (t + '.json')).exists()]
    if missing:
        sys.exit('bosshits: no decoded ' + ', '.join(missing) + ' in ' + str(raw) + '\n  node tools/datpull.mjs --raw ' +
                 ','.join(TABLES) + ' --out ' + str(raw))
    return {t: json.loads((raw / (t + '.json')).read_text(encoding='utf-8')) for t in TABLES}


def r1(x):
    return int(round(x)) if x >= 100 else round(x, 1)


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument('--raw', default=RAW)
    ap.add_argument('--report', action='store_true')
    a = ap.parse_args(argv)
    T = load(a.raw)
    out = lastgood.pull('Boss hits', lambda: build(T), file='bosshits.json', at='bosses', floor=50)
    if out is None:
        return lastgood.report()
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    hits = sum(len(b['hits']) for b in out['bosses'])
    print('bosshits: %d bosses joined of %d, %d big hits, %d area levels, %s bytes' %
          (len(out['bosses']), out['asked'], hits, len(out['levels']['rows']), format(len(text), ',')))
    if out['unjoined']:
        print('  not joined:', ', '.join(out['unjoined']))
    if not a.report:
        sitedata.save(DATA / 'bosshits.json', text)
    return lastgood.report()


def build(T):
    st = [s['Id'] for s in T['Stats']]
    const = {c['Id']: c['Value'] / (c['Divisor'] or 1) for c in T['GameConstants']}
    base_eff = const['SkillDamageBaseEffectiveness']
    dms = {int(r['DisplayLevel']): r for r in T['DefaultMonsterStats']}
    mods = T['Mods']

    def mod_stat(mod_id, stat):
        for m in mods:
            if m['Id'] == mod_id:
                for k in range(1, 7):
                    if m.get('Stat%d' % k) is not None and st[m['Stat%d' % k]] == stat:
                        return (m.get('Stat%dValue' % k) or [0])[0]
        return None
    rarity_dmg = mod_stat('MonsterUnique5', 'monster_rarity_damage_+%_final')
    rarity_life = mod_stat('MonsterUnique2', 'monster_life_+%_final_from_rarity')
    rdmg = 1 + (rarity_dmg or 0) / 100
    rlife = 1 + (rarity_life or 0) / 100

    ast = {i: r['Id'] for i, r in enumerate(T['ActiveSkillType'])}
    sspl = {}
    for r in T['GrantedEffectStatSetsPerLevel']:
        sspl.setdefault(r['StatSet'], []).append(r)
    gpl = {}
    for r in T['GrantedEffectsPerLevel']:
        gpl.setdefault(r['GrantedEffect'], []).append(r)

    def spell_eff(s, level):
        return (base_eff * (s['BaseEffectiveness'] or 0) * (1 + (s['IncrementalEffectiveness'] or 0) * (level - 1))
                * (1 + (s['DamageIncrementalEffectiveness'] or 0)) ** (level - 1))

    # ---------- the skills of one monster, each with its damage at a level ----------
    def skill(gi, v, mt, level, prefix):
        g = T['GrantedEffects'][gi]
        s = T['GrantedEffectStatSets'][g['StatSet']]
        lv = sorted(sspl.get(g['StatSet'], []), key=lambda r: r['GemLevel'])[:1]
        pl = sorted(gpl.get(gi, []), key=lambda r: r['Level'])[:1]
        lv, pl = (lv[0] if lv else {}), (pl[0] if pl else {})
        act = T['ActiveSkills'][g['ActiveSkill']] if g.get('ActiveSkill') is not None else {}
        types = {ast.get(t) for t in act.get('ActiveSkillTypes') or []}
        implicit = {st[i] for i in s['ImplicitStats']}
        stats = dict(zip([st[i] for i in s['ConstantStats']], s['ConstantStatsValues']))
        stats.update(zip([st[i] for i in lv.get('AdditionalStats') or []], lv.get('AdditionalStatsValues') or []))
        floats = dict(zip([st[i] for i in lv.get('FloatStats') or []],
                          zip(lv.get('FloatStatsValues') or [], lv.get('StatInterpolations') or [])))
        if implicit & NO_DAMAGE or NOT_A_HIT.match(act.get('Id') or ''):
            return None
        more = 1 + stats.get('active_skill_damage_+%_final', 0) / 100
        eff = spell_eff(s, level)

        def per_type(kind):      # the skill's own base values, resolved at the level
            dmg, base = {}, {}
            f = lambda x: 0 if not x else (x[0] * eff if x[1] == 'EXPONENTIAL' else x[0])
            for t in TYPES:
                lo, hi = (floats.get('spell_%s_base_%s_damage' % (m, t.lower())) for m in ('minimum', 'maximum'))
                per_min = floats.get('base_%s_damage_to_deal_per_minute' % t.lower())
                if kind == 'Spell' and (lo or hi):
                    dmg[t] = [f(lo), f(hi)]
                    base[t] = [round(x[0], 3) if x else 0 for x in (lo, hi)]
                elif kind == 'Damage over time' and per_min:
                    dmg[t] = [f(per_min) / 60] * 2
                    base[t] = [round(per_min[0] / 60, 4)] * 2
            return dmg, base

        work = {}
        if 'Attack' in types and not floats:
            kind = 'Attack'
            skill_pct = 100 + (lv.get('BaseMultiplier') or 0) / 100
            spread = (mt.get('DamageSpread') or 0) / 100
            mid = dms[level]['Damage'] * v['DamageMultiplier'] / 100 * skill_pct / 100 * more * rdmg
            conv = {t: stats.get('active_skill_base_physical_damage_%%_to_convert_to_%s' % t.lower(), 0) +
                    stats.get('skill_physical_damage_%%_to_convert_to_%s' % t.lower(), 0) for t in TYPES[1:]}
            left = max(0, 100 - sum(conv.values()))
            split = {'Physical': left, **conv}
            if split.get('Fire') and stats.get('active_skill_base_fire_damage_%_to_convert_to_chaos'):
                moved = split['Fire'] * stats['active_skill_base_fire_damage_%_to_convert_to_chaos'] / 100
                split['Fire'] -= moved
                split['Chaos'] += moved
            dmg = {t: [mid * p / 100 * (1 - spread), mid * p / 100 * (1 + spread)] for t, p in split.items() if p}
            work = {'skill': r1(skill_pct)}
        else:
            kind = 'Damage over time' if not any('spell_' in k for k in floats) and any('per_minute' in k for k in floats) else 'Spell'
            dmg, base = per_type(kind)
            if not dmg:
                return None
            dmg = {t: [x * more * rdmg for x in mm] for t, mm in dmg.items()}
            work = {'eff': round(s['BaseEffectiveness'], 2), 'inc': round(s['IncrementalEffectiveness'], 4),
                    'dinc': round(s['DamageIncrementalEffectiveness'], 4), 'base': base}
        if more != 1:
            work['more'] = r1((more - 1) * 100)
        total = [sum(x[0] for x in dmg.values()), sum(x[1] for x in dmg.values())]
        name, named = word(g['Id'], act, prefix)
        cd = (pl.get('Cooldown') or 0) / 1000
        by_anim = 'action_attack_or_cast_time_uses_animation_length' in implicit
        cast = None if by_anim else (v['AttackSpeed'] if kind == 'Attack' else g.get('CastTime') or 0) / 1000
        sure = bool(implicit & {'base_skill_cannot_be_avoided_by_dodge_roll_or_evaded_or_blocked',
                                'cannot_be_blocked_or_dodged_or_suppressed'})
        return {'name': name, 'game': named == 'game' or None, 'kind': kind,
                'type': max(dmg, key=lambda t: dmg[t][1]),
                'dmg': {t: [r1(x[0]), r1(x[1])] for t, x in dmg.items()},
                'total': [r1(total[0]), r1(total[1])],
                'cd': cd or None, 'uses': (pl.get('StoredUses') or 0) if (pl.get('StoredUses') or 0) > 1 else None,
                'cast': cast, 'area': 'is_area_damage' in implicit or None, 'sure': sure or None, 'w': work,
                'stem': stem(g['Id'], prefix)}

    # ---------- the join: a boss in data/bosses.json to one monster in the game files ----------
    bosses = json.loads((DATA / 'bosses.json').read_text(encoding='utf-8'))['bosses']
    by_name = {}
    for i, v in enumerate(T['MonsterVarieties']):
        by_name.setdefault((v['Name'] or '').strip(), []).append(i)
    area_bosses = {}
    for w in T['WorldAreas']:
        for m in w.get('Bosses_MonsterVarietiesKeys') or []:
            area_bosses.setdefault(m, set()).add(w['Name'])
    out, unjoined = [], []
    for b in bosses:
        cands = [i for i in by_name.get(b['name'], [])]
        if not cands:
            unjoined.append(b['name'])
            continue
        areas = {x['name'] for x in b.get('areas') or []}
        lvls = [x['lo'] for x in b.get('areas') or [] if x.get('lo')]
        vs = T['MonsterVarieties']
        pick = max(cands, key=lambda i: (bool(area_bosses.get(i, set()) & areas), bool(vs[i]['BossHealthBar']),
                                          len(vs[i]['GrantedEffects'] or []), vs[i]['LifeMultiplier']))
        v = vs[pick]
        mt = T['MonsterTypes'][v['MonsterType']]
        level = min(lvls) if lvls else 65
        row = dms[level]
        diff = row['Difficulty']
        res = {}
        for ri in mt.get('MonsterResistances') or []:
            r = T['MonsterResistances'][ri]
            for t in ('Fire', 'Cold', 'Lightning', 'Chaos'):
                scale = [x for x in (r.get(t + '4') or [])]
                if scale and any(scale):
                    res[t] = res.get(t, 0) + scale[min(diff, len(scale) - 1)]
        extra = []
        for mi in (v.get('Mods') or []) + (v.get('Special_Mods') or []):
            m = mods[mi]
            for k in range(1, 7):
                if m.get('Stat%d' % k) is not None and st[m['Stat%d' % k]] in ('damage_+%', 'maximum_life_+%'):
                    extra.append([st[m['Stat%d' % k]], (m.get('Stat%dValue' % k) or [0])[0]])
        dmg_inc = 1 + sum(x for s, x in extra if s == 'damage_+%') / 100
        life_inc = 1 + sum(x for s, x in extra if s == 'maximum_life_+%') / 100
        prefix = boss_prefix([T['GrantedEffects'][gi]['Id'] for gi in v['GrantedEffects'] or []])
        skills = [x for x in (skill(gi, v, mt, level, prefix) for gi in v['GrantedEffects'] or []) if x]
        for x in skills:
            if dmg_inc != 1:
                x['dmg'] = {t: [r1(a * dmg_inc), r1(c * dmg_inc)] for t, (a, c) in x['dmg'].items()}
                x['total'] = [r1(x['total'][0] * dmg_inc), r1(x['total'][1] * dmg_inc)]
        # a hit that is set off by another move (a slam's impact, a beam's damage) has no cooldown of its own:
        # the move that sets it off has. Matched by name, so it is marked (cm) as the move's.
        moves = []
        for gi in v['GrantedEffects'] or []:
            pl = sorted(gpl.get(gi, []), key=lambda r: r['Level'])[:1]
            if pl and (pl[0].get('Cooldown') or 0) > 0:
                moves.append((stem(T['GrantedEffects'][gi]['Id'], prefix), pl[0]['Cooldown'] / 1000))
        for x in skills:
            if not x['cd']:
                best = max(((shared(x['stem'], m), cd) for m, cd in moves), default=(0, None))
                if best[0] >= 2 or (best[0] == 1 and len(x['stem']) == 1):
                    x['cd'], x['cm'] = best[1], True
        hits = pick_hits(skills)
        out.append({k: val for k, val in {
            'name': b['name'], 'pinnacle': b.get('pinnacle') or None, 'lv': level,
            'lifePct': v['LifeMultiplier'], 'damagePct': v['DamageMultiplier'],
            'atk': v['AttackSpeed'] / 1000, 'spread': mt.get('DamageSpread') or 0,
            'life': int(round(row['MonsterLife'] * v['LifeMultiplier'] / 100 * rlife * life_inc)),
            'armour': int(round(row['Armour'] * (1 + (mt.get('Armour') or 0) / 100))),
            'evasion': int(round(row['Evasion'] * (1 + (mt.get('Evasion') or 0) / 100))),
            'res': res or None, 'inc': [s.replace('damage_+%', 'damage').replace('maximum_life_+%', 'life') + ' ' +
                                        ('%+d%%' % x) for s, x in extra] or None,
            'skills': len(skills), 'hits': hits}.items() if val is not None})
    return {
        'built': datetime.date.today().isoformat(),
        'patch': '0.5.5', 'asked': len(bosses), 'unjoined': unjoined,
        'ids': [],
        'source': 'game files, patch 0.5.5: DefaultMonsterStats, MonsterVarieties, MonsterTypes, MonsterResistances, '
                  'GrantedEffects, GrantedEffectsPerLevel, GrantedEffectStatSets, GrantedEffectStatSetsPerLevel, '
                  'ActiveSkills, Mods, MapTiers, GameConstants',
        'labels': {'levels': None, 'lifePct': None, 'damagePct': None, 'atk': None, 'cd': None, 'res': 'Estimate',
                   'life': 'Estimate', 'hits': 'Estimate', 'tiers': 'Subject to change'},
        'keys': {'n': 'name', 'g': 'the name is the game\'s own (else worded from the skill\'s file name)',
                 'k': 'kind: a attack, s spell, d damage over time (per second)', 't': 'main damage type',
                 'd': 'damage by type [min, max], where more than one', 'h': 'the hit [min, max] at the boss\'s level (lv)',
                 'cd': 'cooldown, seconds', 'cm': 'the cooldown is the one of the move that sets this hit off (matched by name)', 'u': 'uses before the cooldown', 'ct': 'cast or attack time, seconds '
                 '(absent: set by its animation)', 'x': 'cannot be evaded, blocked or dodged',
                 'w': 'the working: s skill attack damage %%; e skill effectiveness, c [incremental, damage incremental] '
                      'where not %s, b base values per type where not %s; m more damage %%' % (list(DEFAULT_CURVE), DEFAULT_BASE)},
        'calc': calc(base_eff, rarity_dmg, rarity_life),
        'tiers': [[r['Tier'], r['Level']] for r in T['MapTiers']],
        'levels': {'cols': ['level', 'life', 'damage', 'accuracy', 'armour', 'evasion', 'resistStep'],
                   'rows': [[L, r['MonsterLife'], round(r['Damage'], 2), r['Accuracy'], r['Armour'], r['Evasion'], r['Difficulty']]
                            for L, r in sorted(dms.items())]},
        'bosses': out,
    }


def calc(base_eff, rarity_dmg, rarity_life):
    """The working a `calc` field shows (W5, #96): each formula with every input and where it comes from."""
    game = 'game files'
    return {
        'Attack': {'says': 'level damage × boss damage × skill attack damage × unique rarity, ± damage spread',
                   'in': [['level damage', 'levels.damage', game + ' (default monster stats)'],
                          ['boss damage', 'damagePct', game + ' (monster)'],
                          ['skill attack damage', 'w.s', game + ' (skill, 100 + base multiplier / 100)'],
                          ['unique rarity', '%d%%' % (100 + (rarity_dmg or 0)), game + ' (unique monster modifier)'],
                          ['damage spread', 'spread', game + ' (monster type)']]},
        'Spell': {'says': '%.6g × skill effectiveness × (1 + incremental × (level − 1)) × (1 + damage incremental)^(level − 1)'
                          ' × skill base value × unique rarity' % base_eff,
                  'in': [['base effectiveness', '%.6g' % base_eff, game + ' (game constants)'],
                         ['skill effectiveness', 'w.e', game + ' (skill)'],
                         ['incremental', 'w.c[0] or 0.1', game + ' (skill)'], ['damage incremental', 'w.c[1] or 0.0175', game + ' (skill)'],
                         ['skill base value', 'w.b or [0.8, 1.2]', game + ' (skill)'],
                         ['unique rarity', '%d%%' % (100 + (rarity_dmg or 0)), game + ' (unique monster modifier)']],
                  'open': 'Boss damage is not applied to spells. Path of Building leaves it out and poe2db prints spells '
                          'without it; the game files do not say. Subject to change.'},
        'Damage over time': {'says': 'as a spell, per second', 'in': []},
        'life': {'says': 'level life × boss life × unique rarity',
                 'in': [['level life', 'levels.life', game], ['boss life', 'lifePct', game + ' (monster)'],
                        ['unique rarity', '%d%%' % (100 + (rarity_life or 0)), game + ' (unique monster modifier)']]},
        'res': {'says': 'the monster type\'s resistance sets at the level\'s resistance step (1: levels 1–45, 2: 46–67, 3: 68+)',
                'in': [['resistance step', 'levels.resistStep', game]]},
        'tiers': {'says': 'a waystone tier is read as its area level (tiers). An attack grows with that level\'s damage '
                          'row, a spell with its own formula at that level. The tier bonus tables ship as zeros in 0.5.5.',
                  'label': 'Subject to change'},
        'rarity': {'says': 'unique rarity is the game\'s unique monster modifier: %d%% damage, %d%% life. Path of Building\'s '
                           'boss export applies the damage one; poe2db prints both without it.' % (100 + (rarity_dmg or 0), 100 + (rarity_life or 0)),
                   'label': 'Subject to change'},
        'checked': [['Source: poe2db', 'https://poe2db.tw/us/The_Arbiter_of_Ash',
                     'every attack base damage, attack damage % and spell damage poe2db prints for six bosses (639 '
                     'values, levels 65 to 80) comes out of these formulas without unique rarity, to the unit'],
                    ['Source: Path of Building (PoE2)', 'https://github.com/PathOfBuildingCommunity/PathOfBuilding-PoE2',
                     'the same spell formula (src/Modules/CalcTools.lua); its boss export (src/Export/Scripts/bossData.lua, '
                     'switched off) applies unique rarity and leaves boss damage off spells']],
    }


def boss_prefix(ids):
    """The words most of this boss's skills start with (its own name in the file), to take off: the longest
    leading run that at least 40% of them share, and never a whole skill's name."""
    words = [split(strip_kind(i)) for i in ids]
    best = []
    for k in range(1, 5):
        count = {}
        for w in words:
            if len(w) > k:
                count[tuple(w[:k])] = count.get(tuple(w[:k]), 0) + 1
        top = max(count.items(), key=lambda x: x[1], default=(None, 0))
        if top[1] >= max(2, 0.4 * len(words)):
            best = list(top[0])
        else:
            break
    return best


def strip_kind(i):
    return re.sub(r'^[A-Z]{2,4}(?=[A-Z][a-z])', '', i)


def split(i):
    return re.findall(r'[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+', i)


def stem(gid, prefix):
    """A skill's file name as words, the boss's own name and the direction words taken off: what a move and
    the hit it sets off have in common."""
    w = split(strip_kind(gid))
    if prefix and w[:len(prefix)] == prefix and len(w) > len(prefix):
        w = w[len(prefix):]
    return [x.lower() for x in w if not DIRECTION.fullmatch(x) and not (x.isupper() and len(x) <= 4)
            and x not in ('Boss', 'Triggered', 'Trigger', 'Impact', 'Enraged')]


def shared(a, b):
    n = 0
    for x, y in zip(a, b):
        if x != y:
            break
        n += 1
    return n


def word(gid, act, prefix):
    shown = (act.get('DisplayedName') or '').strip()
    if shown:
        return shown, 'game'
    w = split(strip_kind(gid))
    if prefix and w[:len(prefix)] == prefix and len(w) > len(prefix):
        w = w[len(prefix):]
    elif 'Boss' in w[:4] and w.index('Boss') + 1 < len(w):
        w = w[w.index('Boss') + 1:]
    w = [WORDS.get(x.lower(), x) for x in w]
    w = [x for x in w if x and not x.isdigit() and len(x) > 1 and not (x.isupper() and len(x) <= 4)
         and x not in ('Boss', 'Monster', 'Map', 'Uber', 'Pinnacle', 'Triggered', 'Trigger', 'Standalone')]
    name = ' '.join(w).strip() or 'Unnamed hit'
    return name[0].upper() + name[1:].lower(), 'file'


def pick_hits(skills):
    """The biggest hit, then the biggest of each other damage type, then the next biggest, up to HITS. One row per
    move: the same move to the left and to the right is one row."""
    seen, uniq = {}, []
    for x in sorted(skills, key=lambda x: -(x['total'][0] + x['total'][1])):
        bare = re.sub(r'\s+', ' ', DIRECTION.sub('', x['name'])).strip()
        key = (bare.lower(), x['kind'])
        if key in seen:
            if bare:             # the same move to the other side: one row, named without the side
                seen[key]['name'] = bare[0].upper() + bare[1:]
            continue
        seen[key] = x
        uniq.append(x)
    keep, types = [], set()
    for x in uniq:
        if x['type'] not in types:
            keep.append(x)
            types.add(x['type'])
    for x in uniq:
        if len(keep) >= HITS:
            break
        if x not in keep:
            keep.append(x)
    keep = sorted(keep[:HITS], key=lambda x: -(x['total'][0] + x['total'][1]))
    return [short(x) for x in keep]


KIND = {'Attack': 'a', 'Spell': 's', 'Damage over time': 'd'}
DEFAULT_CURVE = (0.1, 0.0175)           # the spell curve nearly every monster spell uses: written only when it differs
DEFAULT_BASE = [0.8, 1.2]


def short(x):
    """One hit as it is written: the keys (`keys` in the file) short, and what every hit shares left out."""
    w = x['w']
    if x['kind'] == 'Attack':
        work = {'s': w['skill']}
    else:
        work = {'e': w['eff']}
        if (w['inc'], w['dinc']) != DEFAULT_CURVE:
            work['c'] = [w['inc'], w['dinc']]
        if not (len(w['base']) == 1 and list(w['base'].values())[0] == DEFAULT_BASE):
            work['b'] = w['base']
    if 'more' in w:
        work['m'] = w['more']
    out = {'n': x['name'], 'g': 1 if x['game'] else None, 'k': KIND[x['kind']], 't': x['type'],
           'd': x['dmg'] if len(x['dmg']) > 1 else None, 'h': x['total'], 'cd': x['cd'], 'u': x['uses'],
           'cm': 1 if x.get('cm') else None, 'ct': x['cast'], 'x': 1 if x['sure'] else None, 'w': work}
    return {k: v for k, v in out.items() if v is not None}


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Boss hits', file='bosshits.json'))
