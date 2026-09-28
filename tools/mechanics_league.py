"""Build data/leaguemech.json: one entry per league mechanic a player meets in a map (#81), and each one's share of
what the Currency Exchange traded, day by day, this league and in past leagues (#104).

A mechanic entry says, in card names the site already has:
  * what it is, in one plain line
  * its own currency: the things the game itself files under that mechanic (the grouping below)
  * what it can roll, with the real odds, where data/odds.json has a pool for it
  * how to get more of it: its atlas passives, its tablets, the waystone modifiers that add it
  * its bosses, off data/bosses.json
Nothing here is a price. A price is the card's own, drawn by the card; this file only names the card.

The grouping, currency to mechanic, is written once, here, and shipped in the file (each mechanic's `currency`).
It is the game's own wherever the game has one, and ours only where it has none, in this order (the first that
answers wins):
  1. league   a thing the current or last league brought, named below with the reason
  2. cx       the Currency Exchange's own category or sub-category (CurrencyExchange, CurrencyExchangeCategories):
              the exchange files Omen of Whittling under Ritual and Preserved Cranium under Abyss
  3. stash    the mechanic's own stash tab (RitualStashTabLayout, ...), and the Expedition artifacts
              (ExpeditionCurrency): this is what places Petition Splinter, which the exchange no longer lists
  4. boss     what opens the mechanic's boss (data/bosses.json "access", from Exiled Exchange 2)
  5. named    ours: a key or a coin the game files nowhere, named for the mechanic. Listed in `named`
Anything none of them claims belongs to no mechanic (Divine Orb, runes, gems, pinnacle fragments).

The popularity, per league and per day, from GGG's own Currency Exchange feed as archived hour by hour
(wraeclast-data/cx/derived, rows per market per hour; tools/exchange.py reads the same feed live):
  * each hour, the exalted value of everything bought with Divine, Exalted or Chaos Orbs, at that hour's own rates:
    exalted per divine from that hour's Divine and Exalted market, chaos from that hour's Divine and Chaos market
    (or, failing that, its Exalted and Chaos market). Nothing is carried over from another hour and nothing is
    modelled, so no share carries "Estimate"
  * a trade of one of those three orbs for another is money changing hands, not a thing bought: left out
  * a trade of two other things for each other has no price in that hour: left out, and counted
  * an hour with no Divine and Exalted trades has no rate: left out, and counted
  * a day's share is a mechanic's own currency's value over the value of everything bought that day. The last
    day of a league still running is a part day; each day says how many hours it holds
It is what players buy and sell, which is not the same as what they run: Ritual's share is mostly its crafting
omens. The file says so beside the numbers.
Only the public trade leagues data/leagues.json names are read (softcore; Standard and Hardcore left out).
A private league ("(PLnnnnn)") is never read.

The pipeline's `leaguemech` stage, after `odds`:   python tools/pipeline.py --only leaguemech
The game's own tables for the grouping (CurrencyExchange, its categories, the stash tab layouts, BaseItemTypes) and
for the rites' campaign bosses (RitualWorldAreaGroups, WorldAreas, MonsterVarieties) come through tools/gamepull.py
dat(), off GGG's patch CDN. One thing only the owner's machine has, kept from the file already here when it is not:
the exchange archive (WI_CX, default wraeclast-data/cx) for the popularity.

Output (data/leaguemech.json):
  source, flags          as data/odds.json
  ids                    the fields that may hold an internal id (tools/lastgood.py own_ids): our keys, the card key
  mechanics[]  key       our key for it (never drawn)
               card      the game's own keyword card it is ("w:<keyword id>"), cardName that card's name. Every
                         mechanic but Trials has one, so the fields below go on a card that already exists
               name, sub, line    its name as players say it, what sort of thing it is, the one plain line: the
                                  keyword's own first sentence, ours only where there is no keyword
               league    {name, v} for a league mechanic; partOf the core mechanic it grew out of
               currency  its own currency, by name, most traded first where the archive says. Every mechanic's list
                         together is the grouping table, written once: a name is in one list or in none
               from      which of the rules below placed its currency
               odds      outcomes of its odds pools that are cards: {n, pool, oneIn, flag where the pool is not sure}
               pools     its pools in data/odds.json, by name
               atlas     atlas passives (cards): its own sub-tree, then the main tree's nodes that name it
               tablets   tablet cards that add it          waystone  waystone modifiers that add it {n, ls}
               bosses    boss cards (data/bosses.json)     campaign  bosses the game files name for it outside maps
               nocard    names it holds that no card answers to yet
               source    what each part is read from, "Source: ..." words
  named        the part of the grouping that is ours (rule 5), with the reason
  popularity   method (words), source, rows (mechanic keys with a currency, in order), leagues[]:
               {league, v, start, hours, left {norate, unpriced}, total [basis points per row],
                days [[hours, exalted, basis points per row...], ...]} one per day from start
"""
import datetime as dt
import gzip
import json
import os
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import dat  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
OUT = DATA / 'leaguemech.json'
FLAG = 'Subject to change'
FLAGS = {FLAG: 'Depends on GGG. May change without notice.'}
DIV, EX, CHAOS = ('Metadata/Items/Currency/CurrencyModValues', 'Metadata/Items/Currency/CurrencyAddModToRare',
                  'Metadata/Items/Currency/CurrencyRerollRare')
PRIVATE = re.compile(r'\(PL\d+\)')

# ---------- the mechanics, written once ----------
# key, name (as players say it) and sub; kw the game's own keyword card it is, whose words are its one line (the
# card already exists, so a mechanic is fields on it and not a card of its own: docs/frame.md, a new kind);
# own our Mechanics card where the game has no keyword, and line until that card exists. cx the exchange's
# categories that are its own; stash its stash tabs; tree its atlas sub-tree; node what a main-tree node's own line
# reads when it is about it; tabs its tablet bases; way what a waystone modifier reads when it adds it; pools the
# data/odds.json pools that roll inside it; bosses its boss cards; league the league it is, and partOf the
# mechanic the exchange files its currency under.
M = [
    dict(key='ritual', name='Ritual', sub='Map content', kw='ContainsRitual',
         cx=['Ritual'], stash=['RitualStashTabLayout'], tree='Ritual', node=r'\bRitual|Tribute|Favour',
         tabs=['Ritual Tablet'], pools=['Ritual altars'], bosses=['The King in the Mists', 'The Bodach']),
    dict(key='abyss', name='Abyss', sub='Map content', kw='ContainsAbyss',
         cx=['Abyss'], stash=['AbyssStashTabLayout'], tree='Abyss', node=r'\bAbyss', tabs=['Abyss Tablet'],
         way=r'\bAbyss', bosses=['Vessel of Kulemak']),
    dict(key='breach', name='Breach', sub='Map content', kw='ContainsBreach',
         cx=['Breach'], stash=['BreachStashTabLayout'], tree='Breach', node=r'\bBreach', tabs=['Breach Tablet'],
         bosses=['Xesht, We That Are One', 'It That Was Esh', 'It That Was Tul']),
    dict(key='delirium', name='Delirium', sub='Map content', kw='ContainsDelirium',
         cx=['Delirium'], stash=['DeliriumStashTabLayout'], tree='Delirium', node=r'\bDeli|Simulacrum|Emotion',
         tabs=['Delirium Tablet'], bosses=['The Raven Trickster']),
    dict(key='expedition', name='Expedition', sub='Map content', kw='ContainsExpedition',
         cx=['Expedition'], stash=['ExpeditionStashTabLayout', 'ExpeditionCurrency'], tree='Expedition',
         node=r'\bExpedition|Logbook', tabs=['Expedition Tablet'], bosses=['Olroth, Origin of the Fall']),
    dict(key='strongbox', name='Strongbox', sub='Map content', kw='Strongbox', node=r'\bStrongbox',
         pools=['Strongboxes']),
    dict(key='essence', name='Essence', sub='Map content', kw='Essence',
         cx=['Essences'], stash=['EssenceStashTabLayout'], node=r'\bEssence'),
    dict(key='shrine', name='Shrine', sub='Map content', kw='Shrine', node=r'\bShrine'),
    dict(key='exile', name='Rogue Exile', sub='Map content', kw='RogueExile', node=r'\bRogue Exile'),
    dict(key='azmeri', name='Azmeri Spirit', sub='Map content', kw='AzmeriSpirit', node=r'\bAzmeri|\bPossess',
         pools=['Azmeri spirits']),
    dict(key='trial', name='Trials', sub='Endgame content', own='Trials',
         line='The Trial of the Sekhemas and the Trial of Chaos. Each is entered with its own offering and ends in '
              'its own boss.',
         cx=['Ultimatum Fragments'], bosses=['Zarokh, the Temporal', 'The Trialmaster']),
    dict(key='temple', name="Atziri's Temple", sub='Map content', kw='ContainsIncursion',
         cx=["Atziri's Temple"], tree='Temple', node=r'\bTemple|Vaal Beacon', tabs=['Temple Tablet'],
         bosses=['Maztli, Flesh-Shaper', 'Ytzara, Blood Oracle']),
    dict(key='rites', name='Forbidden Rites', sub='League, 0.5.5', kw='RitualRiteOfTheNameless',
         league='Forbidden Rites', partOf='ritual',
         node=r'\bRites?\b|Foretold', pools=['Foretold Bounty', 'Foretold Proliferation']),
    dict(key='aldur', name='Runes of Aldur', sub='League, 0.5', kw='ContainsExpedition2',
         league='Runes of Aldur', partOf='expedition', node=r'\bAldur|Remnant|Verisium'),
]
# Rule 1: what a league brought, by name, with the reason. Sacred Bloom first traded on the exchange on the first
# day of Forbidden Rites and never before it in the archive; the exchange files it under Ritual. Aldur's Saga says
# "Runes of Aldur only" on its own card, and the five Aldur runes are the game's own Aldur's Legacies (the keyword).
LEAGUE = {'Sacred Bloom': 'rites', "Aldur's Saga": 'aldur', "Aldur's Legacy": 'aldur', 'Breath of Aldur': 'aldur',
          'Betrayal of Aldur': 'aldur', 'Ire of Aldur': 'aldur', 'Passion of Aldur': 'aldur'}
# Rule 5: ours. Each is a key or a coin the game files under no mechanic, and the reason it is placed where it is.
NAMED = {
    "Zarokh's Reliquary Key: ": ('trial', "Named for Zarokh, the Temporal, the boss of the Trial of the Sekhemas."),
    'Azmeri Reliquary Key': ('azmeri', 'Named for the Azmeri.'),
    'Exotic Coinage': ('expedition', 'An Expedition currency of the leagues before 0.5. The exchange no longer lists it.'),
}
POOLS_SRC = 'game files'


def load(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def home(env, *parts):
    """The env var's folder, else wraeclast-data beside the repo (or beside the folder its worktrees sit in), else in
    the home folder."""
    if os.environ.get(env):
        return Path(os.environ[env])
    for top in (ROOT.parent, ROOT.parent.parent, Path.home()):
        if (top / 'wraeclast-data').is_dir():
            return top.joinpath('wraeclast-data', *parts)
    return Path.home().joinpath('wraeclast-data', *parts)


# ---------- the cards a name can open ----------
def cards():
    """Every name a card answers to: the index, the Currency tab's own cards (data/market.json) and the bosses."""
    names = {}
    for it in load(DATA / 'index.json')['items']:
        names.setdefault(it['n'], it['k'])
    for m in load(DATA / 'market.json')['items'].values():
        names.setdefault(m['n'], 'c')
    for b in load(DATA / 'bosses.json')['bosses']:
        names.setdefault(b['name'], 'x')
    return names


# ---------- the grouping ----------
def exchange_items():
    """The exchange's own list: {item id: (name, category, sub-category)}, and every base item's name by id."""
    base = dat('BaseItemTypes')
    by_i = {b['_i']: b for b in base}
    cats = {c['_i']: c['Name'] for c in dat('CurrencyExchangeCategories')}
    listed = {}
    for r in dat('CurrencyExchange'):
        b = by_i[r['Item']]
        listed[b['Id']] = (b['Name'], cats.get(r['Category']), cats.get(r.get('SubCategory')))
    stash = {}
    for m in M:
        for t in m.get('stash') or []:
            for r in dat(t):
                i = r.get('StoredItem', r.get('BaseItemType'))
                if i is not None and i in by_i and by_i[i]['Name']:
                    stash.setdefault(by_i[i]['Name'], m['key'])
    return listed, {b['Id']: b['Name'] for b in base if b.get('Name')}, stash


def grouping(listed, stash, bosses, id_names):
    """{name: (mechanic key, rule)} over every name the exchange lists, every stash-tab name, every boss's way in, and
    the base items rule 5 names."""
    cx = {c: m['key'] for m in M for c in m.get('cx') or []}
    access = {}
    for m in M:
        for b in bosses:
            if b['name'] in (m.get('bosses') or []):
                for a in b.get('access') or []:
                    access.setdefault(a, m['key'])
    out = {}
    ours = {n for n in id_names.values() if any(is_named(n, k) for k in NAMED)}
    for name in sorted({n for n, _, _ in listed.values()} | set(stash) | set(access) | ours):
        cat, sub = next(((c, s) for n, c, s in listed.values() if n == name), (None, None))
        named = next((v for k, v in NAMED.items() if is_named(name, k)), None)
        if name in LEAGUE:
            out[name] = (LEAGUE[name], 'league')
        elif cat in cx or sub in cx:
            out[name] = (cx.get(cat) or cx[sub], 'cx')
        elif name in stash:
            out[name] = (stash[name], 'stash')
        elif name in access:
            out[name] = (access[name], 'boss')
        elif named:
            out[name] = (named[0], 'named')
    return out


def is_named(name, k):
    """A name rule 5 places: the name itself, or every name under a key that ends in ': ' (the keys of one boss)."""
    return name == k or (k.endswith(': ') and name.startswith(k))


# ---------- the popularity ----------
def hour_values(rows):
    """One hour's rows -> ({item id: exalted paid for it}, priced) or (None, 0) where the hour has no rate."""
    rate = cpd = None
    for a, b, va, vb in rows:
        v = {a: va, b: vb}
        if {a, b} == {DIV, EX}:
            rate = v[EX] / v[DIV]                  # exalted per divine
        elif {a, b} == {DIV, CHAOS}:
            cpd = v[CHAOS] / v[DIV]                # chaos per divine
    if rate is None:
        return None, 0
    if cpd is None:
        for a, b, va, vb in rows:
            if {a, b} == {EX, CHAOS}:
                v = {a: va, b: vb}
                cpd = v[CHAOS] / v[EX] * rate
    in_ex = {EX: 1.0, DIV: rate}
    if cpd:
        in_ex[CHAOS] = rate / cpd
    got, unpriced = {}, 0
    for a, b, va, vb in rows:
        if a in in_ex and b in in_ex:
            continue                               # money for money: not a thing bought
        if a in in_ex:
            got[b] = got.get(b, 0.0) + va * in_ex[a]
        elif b in in_ex:
            got[a] = got.get(a, 0.0) + vb * in_ex[b]
        else:
            unpriced += 1
    return got, unpriced


def league_days(cx, league):
    """{day: {item id: exalted}}, {day: hours read} and what was left out, for one league, from the monthly files."""
    safe = re.sub(r'[^A-Za-z0-9._()-]+', '_', league)
    days, hours, left = {}, {}, {'norate': 0, 'unpriced': 0}
    for f in sorted((cx / 'derived').glob('*/' + safe + '.jsonl.gz')):
        by_hour = {}
        with gzip.open(f, 'rt', encoding='utf-8') as fh:
            for line in fh:
                r = json.loads(line)
                va, vb = r.get('volume_traded_a') or 0, r.get('volume_traded_b') or 0
                if va > 0 and vb > 0:
                    by_hour.setdefault(r['hour'], []).append((r['a'], r['b'], va, vb))
        for h, rows in by_hour.items():
            got, unpriced = hour_values(rows)
            if got is None:
                left['norate'] += 1
                continue
            left['unpriced'] += unpriced
            day = dt.datetime.fromtimestamp(h, dt.timezone.utc).date().isoformat()
            hours[day] = hours.get(day, 0) + 1
            dd = days.setdefault(day, {})
            for i, x in got.items():
                dd[i] = dd.get(i, 0.0) + x
    return days, hours, left


def popularity(cx, leagues, names, group, rows):
    """The per-league, per-day shares, and each item's total value over every league read (for the order)."""
    known = {n.replace(' ', '_') for n in (p.name.split('.jsonl')[0] for p in (cx / 'derived').glob('*/*.jsonl.gz'))}
    per_item, out = {}, []
    for lg in leagues:
        if PRIVATE.search(lg['name']) or lg['name'].replace(' ', '_') not in known:
            continue
        days, hours, left = league_days(cx, lg['name'])
        if not days:
            continue
        first = min(days)
        span = (dt.date.fromisoformat(max(days)) - dt.date.fromisoformat(first)).days + 1
        series, whole, whole_all = [], {r: 0.0 for r in rows}, 0.0
        for n in range(span):
            day = (dt.date.fromisoformat(first) + dt.timedelta(days=n)).isoformat()
            dd = days.get(day) or {}
            tot = sum(dd.values())
            per = {r: 0.0 for r in rows}
            for i, x in dd.items():
                g = group.get(names.get(i, ''))
                if g:
                    per[g[0]] += x
                name = names.get(i)
                if name:
                    per_item[name] = per_item.get(name, 0.0) + x
            whole_all += tot
            for r in rows:
                whole[r] += per[r]
            series.append([hours.get(day, 0), float('%.3g' % tot)] + [round(per[r] / tot * 10000) if tot else 0 for r in rows])
        out.append({'league': lg['name'], 'v': lg['v'], 'start': first, 'hours': sum(hours.values()), 'left': left,
                    'total': [round(whole[r] / whole_all * 10000) if whole_all else 0 for r in rows], 'days': series})
    return out, per_item


# ---------- the cards ----------
def atlas_of(m, index):
    tree = [x for x in index if x['k'] == 'a' and x.get('at') == 'tree']
    own = [x['n'] for x in tree if m.get('tree') and x.get('s') == 'Atlas passive · ' + m['tree']]
    main = [x['n'] for x in tree if x.get('s') == 'Atlas passive · Main tree' and m.get('node')
            and re.search(m['node'], ' '.join(x.get('ls') or []))]
    return own + [n for n in main if n not in own]


def tablets_of(m, index):
    bases = set(m.get('tabs') or [])
    return [x['n'] for x in index if x['k'] == 'a' and x.get('at') == 'tabs' and (x['n'] in bases or x.get('base') in bases)]


def waystone_of(m, atlas):
    if not m.get('way'):
        return []
    out, seen = [], set()
    for w in (atlas.get('wdes') or []) + (atlas.get('wmods') or []):
        for r in (w.get('r') or [w]):
            line = next((ln for ln in r.get('ls') or [] if re.search(m['way'], ln)), None)
            if line and line not in seen:
                seen.add(line)
                out.append({'n': w['a'], 'ls': line})
    return out


def pools_of(m, odds, names):
    pools = [p for p in odds['pools'] if any(p['pool'] == q or p['pool'].startswith(q + ',') for q in m.get('pools') or [])]
    drops, seen = [], set()
    for p in pools:
        for o in p['outcomes']:
            if o['name'] in names and o.get('oneIn') and o['name'] not in seen:
                seen.add(o['name'])
                d = {'n': o['name'], 'pool': p['pool'], 'oneIn': o['oneIn']}
                if not p['sure']:
                    d['flag'] = FLAG
                drops.append(d)
    return [p['pool'] for p in pools], drops


def campaign_of(m, old):
    """The bosses a league's rites call up in the campaign, one per area: the game's own RitualWorldAreaGroups
    (each group's area and its boss), through tools/gamepull.py dat(). Without the tables, the list the last good
    file holds."""
    if m['key'] != 'rites':
        return []
    try:
        groups, areas, monsters = dat('RitualWorldAreaGroups'), dat('WorldAreas'), dat('MonsterVarieties')
    except SystemExit as e:
        print('the rites\' campaign bosses kept from the last good file: %s' % e)
        was = next((e for e in old.get('mechanics') or [] if e.get('key') == m['key']), {})
        return was.get('campaign') or []
    out = []
    for g in groups:
        a = g.get('Unknown0')
        area = (areas[a].get('Name') or '').strip() if a is not None and a < len(areas) else ''
        if not area:
            continue
        for b in g.get('Boss') or []:
            name = (monsters[b].get('Name') or '').strip() if b is not None and b < len(monsters) else ''
            if name:
                out.append({'area': area, 'boss': name})
    return out


def main():
    meta = load(DATA / 'game' / '_meta.json')
    cx = home('WI_CX', 'cx')
    index = load(DATA / 'index.json')['items']
    odds, atlas, bosses = load(DATA / 'odds.json'), load(DATA / 'atlas.json'), load(DATA / 'bosses.json')['bosses']
    names = cards()
    listed, id_names, stash = exchange_items()
    group = grouping(listed, stash, bosses, id_names)
    rows = [m['key'] for m in M if any(g == m['key'] for g, _ in group.values())]
    old = load(OUT) if OUT.exists() else {}
    if (cx / 'derived').exists():
        leagues = [lg for lg in load(DATA / 'leagues.json')['leagues'] if lg.get('start')]
        pop, per_item = popularity(cx, leagues, id_names, group, rows)
    else:
        pop = (old.get('popularity') or {}).get('leagues') or []
        # ...and the currency in the order it was last ranked in, most traded first
        per_item = {n: len(e['currency']) - i for e in old.get('mechanics') or []
                    for i, n in enumerate(e.get('currency') or [])}
        print('no exchange archive at %s: the popularity already in %s is kept' % (cx, OUT.name))
    boss_names = {b['name'] for b in bosses}
    words = {it['id']: it for it in index if it['k'] == 'w' and it.get('id')}
    ours = {it['id']: it for it in index if it['k'] == 'h' and it.get('id')}
    mechs = []
    for m in M:
        cur = sorted((n for n, (g, _) in group.items() if g == m['key']), key=lambda n: (-per_item.get(n, 0), n))
        pools, drops = pools_of(m, odds, names)
        e = {'key': m['key'], 'name': m['name'], 'sub': m['sub']}
        kw = words.get(m.get('kw'))
        if kw:   # the game's own keyword card: the mechanic's fields sit on it, and its first sentence is the line
            e.update({'card': 'w:' + kw['id'], 'cardName': kw['n'], 'line': re.split(r'(?<=[.!?])\s', kw['t'])[0]})
        elif m.get('own') in ours:   # our own Mechanics card, where the game has no keyword (docs/mechanics-cards.md)
            own = ours[m['own']]
            e.update({'card': 'h:' + own['id'], 'cardName': own['n'], 'line': (own.get('ls') or [m['line']])[0]})
        else:
            e['line'] = m['line']
        if m.get('league'):
            lg = next(x for x in load(DATA / 'leagues.json')['leagues'] if x['name'] == m['league'])
            e['league'] = {'name': lg['name'], 'v': lg['v']}
            e['partOf'] = m['partOf']
        e.update({'currency': cur, 'from': sorted({r for n, (g, r) in group.items() if g == m['key']}),
                  'odds': drops, 'pools': pools,
                  'atlas': atlas_of(m, index), 'tablets': tablets_of(m, index), 'waystone': waystone_of(m, atlas),
                  'bosses': [b for b in m.get('bosses') or [] if b in boss_names]})
        camp = campaign_of(m, old)
        if camp:
            e['campaign'] = camp
        nocard = [n for n in cur if n not in names] + [b for b in m.get('bosses') or [] if b not in boss_names]
        if nocard:
            e['nocard'] = nocard
        parts = [w for w, has in (('its line', kw), ('its currency', cur), ('the odds', pools),
                                  ('the atlas passives', e['atlas']), ('the tablets', e['tablets']),
                                  ('the waystone modifiers', e['waystone']), ('the campaign bosses', camp)) if has]
        src = ['game files, patch %s (%s)' % (meta['patch'], ', '.join(parts))]
        if not kw:
            src.append('Wraeclast Index for its line: the game has no keyword for it')
        if e['bosses']:
            src.append('data/bosses.json (Path of Building, Exiled Exchange 2, PoE2 Wiki) for the bosses')
        e['source'] = src
        mechs.append({k: v for k, v in e.items() if v not in ([], None)})
    doc = {
        'source': meta['source'], 'ids': ['key', 'card', 'partOf', 'rows', 'to', 'from'], 'flags': FLAGS,
        'mechanics': mechs,
        'named': {n.strip(): {'to': g, 'why': why} for n, (g, why) in NAMED.items()},
        'popularity': {
            'source': 'Currency Exchange (GGG public feed), archived by the hour',
            'method': ('Each hour, the exalted value of everything bought with Divine, Exalted or Chaos Orbs, at that '
                       "hour's own rates. A day's share is a mechanic's own currency over everything bought that day. "
                       'Orbs traded for orbs are left out, as are trades of two other things and hours with no '
                       'Divine and Exalted trades. It is what players buy and sell, not what they run: most of '
                       "Ritual's share is its crafting omens."),
            'unit': 'basis points (1 = 0.01%)', 'rows': rows, 'leagues': pop},
    }
    OUT.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    by_rule = {}
    for g, rule in group.values():
        by_rule[rule] = by_rule.get(rule, 0) + 1
    print('data/leaguemech.json: %d mechanics, %d currencies grouped (%s), %d leagues, %d bytes'
          % (len(mechs), len(group), ', '.join('%s %d' % kv for kv in sorted(by_rule.items())), len(pop), OUT.stat().st_size))
    for lg in pop:
        top = sorted(zip(rows, lg['total']), key=lambda t: -t[1])[:5]
        print('  %-20s %3d days  %s' % (lg['league'], len(lg['days']), '  '.join('%s %.1f%%' % (k, v / 100) for k, v in top)))
    for m in mechs:
        if m.get('nocard'):
            print('  %s: no card yet for %s' % (m['name'], ', '.join(m['nocard'][:6]) + (' +%d' % (len(m['nocard']) - 6) if len(m['nocard']) > 6 else '')))


if __name__ == '__main__':
    main()
