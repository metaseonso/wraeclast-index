"""Build data/rules.json: the game's own constants a player meets, each worded as one line for the card it belongs on (#111).

The engine keeps its rules in tables of bare numbers: GameConstants, AfflictionConstants (Delirium),
RitualConstants and ResistancePenaltyPerAreaLevel. tools/datpull.mjs reads them out of the game files into
data/game/. This words the ones a player can meet in play: the culling thresholds, the party bonus, the
resistance penalty by area level, the Delirium and Ritual numbers, what a vendor pays.

Each line says:
  * the words, in the game's register: declarative, present tense, one fact, the game's capitalised nouns
  * the card it lands on, by name: a Mechanics card (kind "h") or a keyword card (kind "w") in data/index.json.
    A card that is not in the index stops the run: a rule is never written for a card nobody can open
  * the table and the constants it was read off ("from", their ids and values: the only place an id sits)
  * "said" where the card's own text already carries every number in the line: the line then confirms the card
    and the table is its source, rather than adding a fact

What is left out, on purpose: a constant whose meaning the name does not settle. The game gives these tables
ids, not words, so a constant is worded only where the id says plainly what it is and, where it can, a keyword
card of the game's own states the same number. AscendancyRespecCost (5), AtlasPassiveRespecCost (5000), the
Ritual Tribute requirements, MonsterFirstReviveLessPoints and every Delirium fog-bank number are in the tables
and not here: what unit they are in, or what they apply to, is a guess.

  python tools/pipeline.py --only rules   the way to run it: a patch stage, under the last good rule
  python tools/rules.py            write data/rules.json from data/game/
  python tools/rules.py --check    the same, and read poe2db's GameConstants page (which lists GameConstants and
                                   RitualConstants): a line whose every number poe2db agrees with is marked
                                   check "poe2db"; one it disagrees with stops the run. poe2db is not official:
                                   it is named as the check, never as the source.

Without --check, a line keeps the mark it had while its numbers are the same.
"""
import html
import json
import re
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
GAME = ROOT / 'data' / 'game'
OUT = ROOT / 'data' / 'rules.json'
INDEX = ROOT / 'data' / 'index.json'
POE2DB = 'https://poe2db.tw/us/GameConstants'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
KIND = {'h': 'Mechanics', 'w': 'Keyword'}
CHANGE = {'label': 'Subject to change', 'tip': 'Depends on GGG. May change without notice.'}

FILES = {'GameConstants': 'game_constants', 'AfflictionConstants': 'affliction_constants',
         'RitualConstants': 'ritual_constants'}


def n(v):
    """A number as the game prints it: 35, 1.5, 0.2."""
    return str(int(v)) if float(v).is_integer() else ('%.2f' % v).rstrip('0').rstrip('.')


def s(ms):
    return n(ms / 1000)


# One entry a line: the card, the table, the constants it reads, and the words made from their values (a dict of
# id -> the number, value / divisor already applied). Grouped by the card they land on, in the order the card reads.
G, A, R = 'GameConstants', 'AfflictionConstants', 'RitualConstants'
RULES = [
    ('Culling Strike', G, ['CullingStrikeNormalThreshold', 'CullingStrikeMagicThreshold', 'CullingStrikeRareThreshold',
                           'CullingStrikeUniqueThreshold'],
     lambda v: 'Culling Strike kills a Normal enemy at %s%% Life or below, Magic at %s%%, Rare at %s%% and Unique at %s%%.'
     % tuple(n(x) for x in v.values())),

    ('Item Rarity', G, ['PartyQuantityBonusPerAdditionalPlayer', 'PartyUniqueBonusPerAdditionalPlayer',
                        'PartyRarityBonusPerAdditionalPlayer'],
     lambda v: 'Each player in the party after the first adds %s%% Quantity of Items dropped and %s%% to Unique Items '
     'dropped. Rarity of Items gains %s%% from the party.' % tuple(n(x * 100) for x in v.values())),
    ('Item Rarity', G, ['SellPriceMultiplier'],
     lambda v: 'A vendor pays %s%% of an item’s gold price for it.' % n(v['SellPriceMultiplier'] * 100)),
    ('Item Rarity', G, ['IdentifiedMagicMultiplier', 'UnidentifiedMagicMultiplier', 'IdentifiedRareMultiplier',
                        'UnidentifiedRareMultiplier'],
     lambda v: 'A vendor\u2019s price for a Magic item is multiplied by %s identified and %s unidentified; for a Rare item, '
     'by %s identified and %s unidentified.' % tuple(n(x) for x in v.values())),

    ('Resistances and the maximum', 'ResistancePenaltyPerAreaLevel', None, None),     # worded by penalty() below
    ('Resistances', 'ResistancePenaltyPerAreaLevel', None, None),

    ('Waystones', G, ['EndgameStartLevel'],
     lambda v: 'Maps start at area level %s.' % n(v['EndgameStartLevel'])),

    ('Evasion', G, ['DefaultMaxEvadeChancePercent'],
     lambda v: 'Chance to Evade is at most %s%%.' % n(v['DefaultMaxEvadeChancePercent'])),
    ('Deflect', G, ['BasePercentDamageDeflected'],
     lambda v: 'A Deflected Hit deals %s%% less damage.' % n(v['BasePercentDamageDeflected'])),
    ('Energy Shield Recharge', G, ['BaseShieldRegenCooldownTimeMs'],
     lambda v: 'Energy Shield starts to Recharge %s seconds after it was last lost.' % s(v['BaseShieldRegenCooldownTimeMs'])),
    ('Elemental Ailment Threshold', G, ['PlayerAilmentThresholdLifeFactor'],
     lambda v: 'A player’s Ailment Threshold is %s%% of their Maximum Life.' % n(v['PlayerAilmentThresholdLifeFactor'] * 100)),
    ('Low Life', G, ['DefaultLowStatusThresholdPercent'],
     lambda v: 'Low Life is %s%% of Maximum Life or less.' % n(v['DefaultLowStatusThresholdPercent'])),
    ('Low Mana', G, ['DefaultLowStatusThresholdPercent'],
     lambda v: 'Low Mana is %s%% of Maximum Mana or less.' % n(v['DefaultLowStatusThresholdPercent'])),
    ('Low Energy Shield', G, ['DefaultLowStatusThresholdPercent'],
     lambda v: 'Low Energy Shield is %s%% of Maximum Energy Shield or less.' % n(v['DefaultLowStatusThresholdPercent'])),
    ('Surrounded', G, ['BaseRequiredEnemiesToBeConsideredSurrounded'],
     lambda v: 'Surrounded takes %s enemies by default.' % n(v['BaseRequiredEnemiesToBeConsideredSurrounded'])),
    ('Life Leech', G, ['EffectiveMaxDamageForLeech'],
     lambda v: 'Leech counts at most %s damage from one Hit.' % format(int(v['EffectiveMaxDamageForLeech']), ',')),
    ('Light Stun', G, ['LightStunMinimumChance'],
     lambda v: 'A chance to Light Stun below %s%% is treated as 0%%.' % n(v['LightStunMinimumChance'])),

    ('Bleeding', G, ['BleedingHitDamagePercentPerMinute', 'BaseBleedingDuration'],
     lambda v: 'Bleeding deals %s%% of the Hit’s Physical damage per second for %s seconds.'
     % (n(v['BleedingHitDamagePercentPerMinute'] / 60), n(v['BaseBleedingDuration']))),
    ('Bloodstained', G, ['BaseBloodstainedAfterBleedingDuration', 'BloodstainedMultiplierWhenMovingOrBleedingAggravated'],
     lambda v: 'Bloodstained follows %s seconds of Bleeding; it builds up %s times as fast while the target moves or the '
     'Bleeding is Aggravated.' % (n(v['BaseBloodstainedAfterBleedingDuration']),
                                   n(v['BloodstainedMultiplierWhenMovingOrBleedingAggravated']))),
    ('Ignite', G, ['IgniteHitDamagePercentPerMinute', 'BaseIgniteDuration'],
     lambda v: 'Ignite deals %s%% of the Hit’s Fire damage per second for %s seconds.'
     % (n(v['IgniteHitDamagePercentPerMinute'] / 60), n(v['BaseIgniteDuration']))),
    ('Flammability', G, ['BaseFlammabilityDuration', 'BaseFlammabilityDurationPlayer'],
     lambda v: 'Flammability lasts %s seconds on non-players and %s seconds on players.' % tuple(n(x) for x in v.values())),
    ('Poison', G, ['PoisonHitDamagePercentPerMinute', 'BasePoisonDuration'],
     lambda v: 'Poison deals %s%% of the Hit’s Physical and Chaos damage per second for %s seconds.'
     % (n(v['PoisonHitDamagePercentPerMinute'] / 60), n(v['BasePoisonDuration']))),
    ('Chill', G, ['ChillMaxEffect', 'BaseChillDuration', 'BaseChillDurationPlayer'],
     lambda v: 'Chill Slows by at most %s%%, and lasts %s seconds on non-players and %s seconds on players.'
     % tuple(n(x) for x in v.values())),
    ('Freeze', G, ['FreezeDuration', 'FreezeDurationPlayer'],
     lambda v: 'Freeze lasts %s seconds on non-players and %s seconds on players.' % tuple(n(x) for x in v.values())),
    ('Shock', G, ['BaseShockMagnitude', 'BaseShockDuration', 'BaseShockDurationPlayer'],
     lambda v: 'Shocked targets take %s%% increased damage. Shock lasts %s seconds on non-players and %s seconds on players.'
     % tuple(n(x) for x in v.values())),
    ('Electrocution', G, ['ElectrocuteDuration', 'ElectrocuteDurationPlayer'],
     lambda v: 'Electrocution lasts %s seconds on non-players and %s seconds on players.' % tuple(s(x) for x in v.values())),
    ('Pinned', G, ['PinDuration', 'PinDurationPlayer'],
     lambda v: 'Pinned lasts %s seconds on non-players and %s seconds on players.' % tuple(n(x) for x in v.values())),
    ('Impale', G, ['ImpalePercentage', 'ImpaleMaximumStacks'],
     lambda v: 'Impale stores %s%% of the Hit’s Physical damage; a target holds at most %s Impales.'
     % (n(v['ImpalePercentage'] * 100), n(v['ImpaleMaximumStacks']))),
    ('Jagged Ground', G, ['JaggedGroundMagnitude'],
     lambda v: 'Jagged Ground Slows movement by %s%%.' % n(-v['JaggedGroundMagnitude'])),
    ('Unholy Might', G, ['UnholyMightBaseMagnitude'],
     lambda v: 'Unholy Might grants %s%% of damage as extra Chaos Damage.' % n(v['UnholyMightBaseMagnitude'])),
    ('Rage', G, ['BaseMaximumRage', 'BaseRageLossPerMinute', 'BaseRageLossDelayMs'],
     lambda v: 'Maximum Rage is %s by default. Rage is lost at %s per second, starting %s seconds after Rage was last gained.'
     % (n(v['BaseMaximumRage']), n(v['BaseRageLossPerMinute'] / 60), s(v['BaseRageLossDelayMs']))),
    ('Elemental Infusions', G, ['BaseMaximumInfusionCount', 'BaseInfusionDurationMs', 'InfusionRemnantBaseDuration'],
     lambda v: 'Up to %s of each Infusion by default, each lasting %s seconds. A Remnant stays on the ground for %s seconds.'
     % (n(v['BaseMaximumInfusionCount']), s(v['BaseInfusionDurationMs']), s(v['InfusionRemnantBaseDuration']))),
    ('Divinity', G, ['DivinityInherentRegenPercentPerMinute'],
     lambda v: 'Divinity Regenerates %s%% per second.' % n(v['DivinityInherentRegenPercentPerMinute'] / 60)),
    ('Hideout', G, ['MaxHideoutDoodads'],
     lambda v: 'A Hideout holds up to %s decorations.' % n(v['MaxHideoutDoodads'])),

    ('Delirium', A, ['SimulacrumWaves'],
     lambda v: 'A Simulacrum has %s waves.' % n(v['SimulacrumWaves'])),
    ('Delirious Players', A, ['DeliriousnessPerRarePercent', 'DeliriousnessPerUniquePercent',
                              'DeliriousnessOnMapCompletePercent'],
     lambda v: 'Deliriousness rises by %s%% for each Rare Monster killed, %s%% for each Unique Monster and %s%% when the '
     'Map is completed.' % tuple(n(x) for x in v.values())),

    ('Ritual', R, ['MonsterFirstReviveLessXP', 'MonsterFirstReviveLessIIQ', 'MonsterRepeatReviveLessXP',
                   'MonsterRepeatReviveLessIIQ'],
     lambda v: 'A monster the Ritual revives gives %s%% less Experience and drops %s%% less Quantity of Items. Each '
     'revive after the first: %s%% less Experience and %s%% less Quantity of Items again.' % tuple(n(x) for x in v.values())),
]


def load(name):
    return json.loads((GAME / (name + '.json')).read_text(encoding='utf-8'))


def constants():
    """{table: {id: number}}, value / divisor applied. The game's own ids carry a stray space now and then."""
    out = {}
    for table, f in FILES.items():
        out[table] = {r['id'].strip(): r['value'] / r['divisor'] if 'divisor' in r else r['value']
                      for r in load(f)['rows']}
    return out


def penalty(card):
    """The elemental resistance penalty, as the steps it takes and every level of it for the area cards (#72)."""
    rows = load('resistance_penalty')['rows']
    steps, last = [], 0
    for r in rows:
        if r['penalty'] != last:
            steps.append([r['level'], r['penalty']])
            last = r['penalty']
    words = ', '.join('%d%% from area level %d' % (-p, lv) for lv, p in steps)
    return {'text': 'Elemental Resistances are lowered by ' + words + '.', 'levels': steps}


def cards():
    items = json.loads(INDEX.read_text(encoding='utf-8'))['items']
    return {x['n']: x for x in items if x['k'] in KIND}


def card_text(c):
    return ' '.join([c.get('t') or ''] + list(c.get('ls') or []))


def said(text, c):
    """Every number the line gives is already on the card."""
    own = card_text(c).replace(',', '')
    nums = re.findall(r'\d+(?:\.\d+)?', text.replace(',', ''))
    return bool(nums) and all(re.search(r'(?<![\d.])' + re.escape(x) + r'(?![\d])', own) for x in nums)


def poe2db():
    """{table: {id: number}} off poe2db's GameConstants page: its rows read "<table> <id> <value>"."""
    req = urllib.request.Request(POE2DB, headers={'User-Agent': UA})
    page = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    t = html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<script.*?</script>', ' ', page, flags=re.S)))
    out = {}
    for table, cid, v in re.findall(r'\b(GameConstants|RitualConstants|AfflictionConstants)\s+(\w+)\s+(-?\d+(?:\.\d+)?)\b', t):
        out.setdefault(table, {})[cid] = float(v)
    if len(out.get('GameConstants', {})) < 50:
        raise SystemExit('poe2db’s GameConstants page no longer reads as a table of constants')
    return out


def main():
    check = '--check' in sys.argv
    C, by_name = constants(), cards()
    theirs = poe2db() if check else {}
    try:
        had = {r['text']: r.get('check') for r in json.loads(OUT.read_text(encoding='utf-8'))['rows']}
    except (OSError, ValueError, KeyError):
        had = {}
    patch = load('game_constants')['source'].split('patch ')[-1]
    rows, bad = [], []
    for card, table, ids, word in RULES:
        c = by_name.get(card)
        if not c:
            bad.append('no Mechanics or keyword card is called ' + card)
            continue
        row = {'card': card, 'kind': KIND[c['k']], 'table': table}
        if ids is None:
            p = penalty(card)
            row.update(text=p['text'], levels=p['levels'])
        else:
            missing = [i for i in ids if i not in C[table]]
            if missing:
                bad.append('%s no longer has %s' % (table, ', '.join(missing)))
                continue
            vals = {i: C[table][i] for i in ids}
            row.update(text=word(vals), **{'from': vals})
        row['src'] = 'Source: %s, game files %s' % (table, patch)
        if said(row['text'], c):
            row['said'] = True
        if check and ids is not None:
            got = [theirs.get(table, {}).get(i) for i in ids]
            if all(g is not None for g in got):
                off = [i for i, g in zip(ids, got) if abs(g - C[table][i]) > 1e-9]
                if off:
                    bad.append('poe2db disagrees on ' + ', '.join('%s (%s against %s)' % (i, n(theirs[table][i]), n(C[table][i]))
                                                                   for i in off))
                else:
                    row['check'] = 'poe2db'
        elif had.get(row['text']):
            row['check'] = had[row['text']]
        rows.append(row)
    if bad:
        raise SystemExit('rules: ' + '; '.join(bad))
    out = {
        'source': 'game files, patch ' + patch,
        'table': ', '.join(dict.fromkeys(r['table'] for r in rows)),
        'note': 'The game’s own constants a player meets, one line each, with the card it lands on (card, kind) and '
                'the constants it was read off (from). said: the card already gives every number in the line. '
                'check: poe2db agrees with every number (a check, not a source). levels: the resistance penalty’s '
                'steps, [area level, penalty].',
        'change': CHANGE,
        'ids': ['from'],
        'rows': rows,
    }
    if check:
        out['checked'] = {'by': 'poe2db', 'url': POE2DB, 'on': date.today().isoformat(),
                          'agree': sum(1 for r in rows if r.get('check') == 'poe2db')}
    else:
        try:
            prev = json.loads(OUT.read_text(encoding='utf-8')).get('checked')
            if prev:
                out['checked'] = prev
        except (OSError, ValueError):
            pass
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')
    cards_hit = len({r['card'] for r in rows})
    print('rules: %d lines on %d cards, %d already said by the card, %d checked against poe2db -> %s'
          % (len(rows), cards_hit, sum(1 for r in rows if r.get('said')), sum(1 for r in rows if r.get('check')),
             OUT.relative_to(ROOT)))


if __name__ == '__main__':
    main()
