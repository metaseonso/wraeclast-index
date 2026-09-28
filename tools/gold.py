"""Build data/gold.json: what things cost in gold, as the game's own tables give it (#88).

Read from data/game/ (tools/datpull.mjs): gold.json (GoldRespecPrices, SkillGemGoldPricePerLevel,
SkillGemGoldPricePerQuality, UniqueGoldPrices), currency_exchange.json (CurrencyExchange) and game_constants.json.

  respec     the gold to refund one passive point, by character level (levels[0] is level 1). A full respec is
             that times the points refunded; the tables do not say how many points a character has at a level,
             so the page asks (docs: design/rules-gold.md). ascendancy: AscendancyRespecCost from GameConstants,
             the multiple an Ascendancy point costs over a passive point, as poe2db reads it (the game names it,
             it does not word it)
  exchange   the Currency Exchange's gold fee to buy one of an item, for every item that has a card to draw it on:
             a card in data/index.json, the Currency page (data/craft.json orbs and omens) or the exchange price
             list (data/exchange.json). The rest are counted and left out
  unique     each unique's gold price (UniqueGoldPrices), where it is more than 0 and the unique has a card
  gem        a gem's gold price by level and by quality, and the flat price of a support and a lineage support
             (GameConstants SupportGemGoldPrice, LineageSupportGemGoldPrice)

Left out, and why:
  * per-modifier gold (GoldModPrices, datpull's gold_mods): 3,254 rows, 298 kB worded; over the 100 kB a file
    of this kind may be, and no card draws it yet. Declared in tools/datpull.mjs (--only gold_mods) for when one does
  * per-base gold (GoldBaseTypePrices, datpull's gold_bases): 2,255 rows, 95 kB, and what a vendor does with the
    number is not verified. Declared the same way
  * inherent skills by level (GoldInherentSkillPricesPerLevel): 600 rows no card draws

  python tools/pipeline.py --only gold    the way to run it: a patch stage, under the last good rule
  python tools/gold.py            write data/gold.json
  python tools/gold.py --check    the same, and read poe2db's Gold page (its respec table) and Currency Exchange
                                  page (its fees): any disagreement stops the run, and what agreed is recorded under
                                  "checked". poe2db is not official: it is the check, never the source.
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
OUT = ROOT / 'data' / 'gold.json'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
POE2DB = {'respec': 'https://poe2db.tw/us/Gold', 'exchange': 'https://poe2db.tw/us/Currency_Exchange'}
CHANGE = {'label': 'Subject to change', 'tip': 'Depends on GGG. May change without notice.'}


def load(name):
    return json.loads((ROOT / 'data' / name).read_text(encoding='utf-8'))


def card_names():
    """Every name a card is drawn for: the index, the Currency page's orbs and omens, the exchange price list."""
    names = {x['n'] for x in load('index.json')['items']}
    craft = load('craft.json')
    names |= {x['n'] for k in ('orbs', 'omens') for x in craft.get(k, [])}
    names |= set(load('exchange.json').get('items', {}))
    return names


def page(url):
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    t = urllib.request.urlopen(req, timeout=60).read().decode('utf-8', 'replace')
    t = html.unescape(re.sub(r'<[^>]+>', ' ', re.sub(r'<script.*?</script>', ' ', t, flags=re.S)))
    return re.sub(r'\s+', ' ', t)


def check(out):
    """poe2db against ours: the respec table level by level, and every fee poe2db lists for an item we carry."""
    bad, agree = [], {}
    t = page(POE2DB['respec'])
    m = re.search(r'Level Gold ((?:\d+ \d+ ?)+)', t)
    if not m:
        raise SystemExit('poe2db’s Gold page no longer has its respec table')
    nums = [int(x) for x in m.group(1).split()]
    theirs = dict(zip(nums[::2], nums[1::2]))
    for lv, g in enumerate(out['respec']['levels'], 1):
        if lv in theirs and theirs[lv] != g:
            bad.append('respec at level %d: poe2db %d, ours %d' % (lv, theirs[lv], g))
    agree['respec'] = sum(1 for lv, g in enumerate(out['respec']['levels'], 1) if theirs.get(lv) == g)
    t = page(POE2DB['exchange'])
    agree['exchange'] = 0
    for item, row in out['exchange'].items():
        # poe2db lists "<name> <fee> <name> <fee>": a name counts only right after a fee, or "Adept Rune" would be
        # read inside "Lesser Adept Rune" (the first item under each heading is passed over)
        m = re.search(r'(?<=\d )' + re.escape(item) + r' (\d+)\b', t)
        if not m:
            continue
        if int(m.group(1)) != row['fee']:
            bad.append('%s: poe2db %s, ours %d' % (item, m.group(1), row['fee']))
        else:
            agree['exchange'] += 1
    if bad:
        raise SystemExit('gold: poe2db disagrees: ' + '; '.join(bad[:10]))
    return {'by': 'poe2db', 'urls': list(POE2DB.values()), 'on': date.today().isoformat(), 'agree': agree}


def main():
    g = json.loads((GAME / 'gold.json').read_text(encoding='utf-8'))
    ce = json.loads((GAME / 'currency_exchange.json').read_text(encoding='utf-8'))
    gc = {r['id'].strip(): r['value'] / r['divisor'] if 'divisor' in r else r['value']
          for r in json.loads((GAME / 'game_constants.json').read_text(encoding='utf-8'))['rows']}
    patch = g['source'].split('patch ')[-1]
    src = lambda t: 'Source: %s, game files %s' % (t, patch)
    rows = g['rows']
    kind = lambda k: [r for r in rows if r['kind'] == k]
    names = card_names()
    uniques = {x['n'] for x in load('index.json')['items'] if x['k'] == 'u'}

    refund = sorted(kind('Passive refund'), key=lambda r: r['level'])
    if [r['level'] for r in refund] != list(range(1, len(refund) + 1)):
        raise SystemExit('gold: GoldRespecPrices no longer runs level 1 upward without a gap')

    exchange, off = {}, 0
    for r in ce['rows']:
        if r['item'] in names and r.get('fee'):
            exchange[r['item']] = {k: v for k, v in (('fee', r['fee']), ('tab', r.get('category')),
                                                     ('standard', r.get('standard', False))) if v}
        else:
            off += 1

    out = {
        'source': 'game files, patch ' + patch,
        'table': 'GoldRespecPrices, CurrencyExchange, UniqueGoldPrices, SkillGemGoldPricePerLevel, '
                 'SkillGemGoldPricePerQuality, GameConstants',
        'note': 'Gold, as the game’s own tables give it. respec.levels[0] is character level 1: the gold to refund '
                'one passive point. exchange: the fee to buy one of an item on the Currency Exchange, by item name, for '
                'the items that have a card; tab is the Exchange tab it sits under, standard that Standard trades it '
                'too. unique: a unique’s gold price. gem: by level (levels[0] is level 1), by quality (quality[0] '
                'is 0%), and the flat price of a support and a lineage support.',
        'change': CHANGE,
        'ids': [],
        'respec': {'src': src('GoldRespecPrices'), 'levels': [r['gold'] for r in refund],
                   'ascendancy': gc.get('AscendancyRespecCost'),
                   'ascendancySrc': src('GameConstants') + '; read as poe2db reads it'},
        'exchange': dict(sorted(exchange.items())),
        'exchangeSrc': src('CurrencyExchange'),
        'unique': dict(sorted((r['item'], r['gold']) for r in kind('Unique') if r['gold'] and r['item'] in uniques)),
        'uniqueSrc': src('UniqueGoldPrices'),
        'gem': {'levels': [r['gold'] for r in sorted(kind('Gem level'), key=lambda r: r['level'])],
                'quality': [r['gold'] for r in sorted(kind('Gem quality'), key=lambda r: r['quality'])],
                'support': gc.get('SupportGemGoldPrice'), 'lineage': gc.get('LineageSupportGemGoldPrice'),
                'src': src('SkillGemGoldPricePerLevel, SkillGemGoldPricePerQuality, GameConstants')},
    }
    if '--check' in sys.argv:
        out['checked'] = check(out)
    else:
        try:
            prev = json.loads(OUT.read_text(encoding='utf-8')).get('checked')
            if prev:
                out['checked'] = prev
        except (OSError, ValueError):
            pass
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(body + '\n', encoding='utf-8', newline='\n')
    lv = out['respec']['levels']
    print('gold: respec %d levels (%s at 1, %s at 100), %d exchange fees (%d without a card left out), %d uniques, '
          '%d gem levels -> %s, %s bytes' % (len(lv), lv[0], lv[-1], len(exchange), off, len(out['unique']),
                                            len(out['gem']['levels']), OUT.relative_to(ROOT), format(len(body) + 1, ',')))


if __name__ == '__main__':
    main()
