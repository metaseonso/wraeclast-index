"""The world as cards: every area, quest and act, joined onto the index as cards of their own (issues #72, #76, #92).

Reads the tables the builders before it wrote, and nothing from outside:

  data/areas.json         tools/areas.py: every place a player can stand in, its level, waypoint, where it leads,
                          who is fought there and what it always carries
  data/quests.json        tools/quests.py: every quest, where it walks, who gives it, its reward windows and what
                          it gives for good; and per act, the permanent rewards added up and the choices beside them
  data/atlascontent.json  tools/atlascontent.py: per Atlas map, the content it can hold and the lines it carries
                          that the game never shows
  data/bosses.json, data/market.json, data/exchange.json and the index itself: the names a card answers to

Writes three kinds onto data/index.json (assets/kinds.js declares them; design/areas.md and design/quests.md say
what each draws), then the two parts the app loads (tools/appdata.py):

  r  Area   one per place. The game's own id is the card's key and is never drawn
  j  Quest  one per quest
  v  Act    one per act: the permanent rewards added up, the choices beside them, and the act's areas and quests
            under Connections

A connection is a list of card keys on the row (go, bx, wx, ox, mx, rw) or the act the row is in (act); the page
turns them round for the other end (assets/graph.js, MAPS). A name no card answers to is never a key: it stays
in the card's words, so the search still finds it.

Anything the files leave unsure carries "un", the Subject to change pill: a line the game never shows, a choice
nobody has said can be undone, and gold, which is read from a column dat-schema does not name.

    python tools/world.py
"""
import json
import re
from pathlib import Path

import appdata
import lastgood

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
DOT = ' · '
KINDS = ('v', 'r', 'j')   # the kinds this tool writes, and takes off again before it writes them
ITEM_KINDS = ('c', 'b', 'u', 'a', 'g')   # the cards a reward can be, in the order a name is claimed


def load(name, default=None):
    try:
        return json.loads((DATA / name).read_text(encoding='utf-8'))
    except FileNotFoundError:
        if default is not None:
            return default
        raise


def level(lv):
    """An area level as words: 21, or 65 to 80."""
    if isinstance(lv, list):
        return str(lv[0]) if lv[0] == lv[-1] else '%d to %d' % (lv[0], lv[-1])
    return str(lv)


def clean(t):
    return re.sub(r'\s+', ' ', t or '').strip()


def uniq(xs):
    return list(dict.fromkeys(x for x in xs if x))


def content_words(m):
    """What an Atlas map can hold, in a line: its content set, and what it always holds."""
    out, unsure = [], False
    mech = m.get('mechanics')
    if mech == 'any':
        out.append('Can hold any content')
    elif mech == 'none':
        out.append('Holds no content')
    elif isinstance(mech, dict):   # a set whose switch the files do not name: kept or barred, not known
        unsure = True
        names = mech.get('names') or []
        if names:
            out.append('Content set: ' + ', '.join(names))
    elif isinstance(mech, list) and mech:
        out.append('Can only hold ' + ' or '.join(mech))
    if m.get('fixed'):
        out.append('Always holds ' + ' and '.join(m['fixed']))
    return out, unsure


def main():
    index = load('index.json')
    areas = load('areas.json')['areas']
    Q = load('quests.json')
    atlas = load('atlascontent.json')
    bosses = {b['name'] for b in load('bosses.json')['bosses']}
    market = {(v or {}).get('n') for v in (load('market.json', {'items': {}}).get('items') or {}).values()}
    market |= set((load('exchange.json', {'items': {}}).get('items') or {}))

    items = [it for it in index['items'] if it['k'] not in KINDS]
    by_name = {}
    for it in items:
        by_name.setdefault(it['n'], []).append(it)

    def card_key(name, kinds):
        """The key of the card a name answers to, of the first of these kinds that has one."""
        for k in kinds:
            if k == 'c' and name in market and not any(x['k'] == 'c' for x in by_name.get(name, [])):
                return 'c:' + name
            for it in by_name.get(name, []):
                if it['k'] == k:
                    return k + ':' + it['id']
        return None

    def keyword_key(name):
        """A content name to its keyword card: the atlas one (Contains...) where two share the name."""
        ws = [it for it in by_name.get(name, []) if it['k'] == 'w']
        ws.sort(key=lambda it: 0 if it['id'].startswith('Contains') else 1)
        return 'w:' + ws[0]['id'] if ws else None

    # ---------- areas ----------
    area_key = {}   # (name, act) -> key, and name -> [keys] in the index's order
    by_area_name = {}
    for a in areas:
        key = 'r:' + a['id'][0]
        area_key[(a['n'], a['act'])] = key
        by_area_name.setdefault(a['n'], []).append(key)

    def place(name, act):
        """An area name to its card: the one in the same act first (Vaal Ruins, The Well of Souls)."""
        return area_key.get((name, act)) or (by_area_name.get(name) or [None])[0]

    maps = {}
    for m in atlas.get('maps') or []:
        if m.get('area'):
            maps.setdefault(m['name'], m)
    nodes = {n['name']: n for n in atlas.get('nodes') or []}
    waystones = []
    for it in items:
        lv = re.search(r'area level (\d+)', it.get('s') or '')
        if it['k'] == 'a' and it['n'].startswith('Waystone') and lv:
            waystones.append((int(lv.group(1)), 'a:' + it['id']))
    corruption = [it for it in items if it['k'] == 'w' and it['id'] == 'ContainsCorruption']

    quests = Q.get('quests') or []
    quest_key = {(q['n'], q['act']): 'j:' + q['id'][0] for q in quests}
    quest_where = {}   # quest key -> the area keys it walks, in its own order
    for q in quests:
        quest_where[quest_key[(q['n'], q['act'])]] = uniq(place(w, q['act']) for w in q.get('where') or [])
    for a in areas:   # an area whose own tracker names a quest is on that quest's way too
        for qn in a.get('quest') or []:
            qk = quest_key.get((qn, a['act'])) or next((v for (n, _), v in quest_key.items() if n == qn), None)
            if qk and area_key[(a['n'], a['act'])] not in quest_where[qk]:
                quest_where[qk].append(area_key[(a['n'], a['act'])])

    rows_r = []
    counts = {'hidden lines': 0, 'content': 0, 'corruption': 0, 'unsure': 0}
    for a in areas:
        key = area_key[(a['n'], a['act'])]
        lvt = level(a['lv'])
        row = {'k': 'r', 'id': a['id'][0], 'n': a['n'], 's': a['act'] + DOT + 'Area level ' + lvt, 'act': a['act']}
        for f in ('wp', 'town', 'way'):
            if a.get(f):
                row[f] = 1
        if a.get('res'):
            row['rs'] = a['res']
        m = maps.get(a['n']) if a['act'] == 'Endgame' else None
        mods = list(a.get('mods') or []) + list((m or {}).get('mods') or [])
        shown = uniq(clean(x['t']) for x in mods if not x.get('hid'))
        hidden = [t for t in uniq(clean(x['t']) for x in mods if x.get('hid')) if t not in shown]
        if shown:
            row['ls'] = shown
        if m and m.get('objective'):
            row['t'] = clean(m['objective'])
        if hidden:
            row['hm'] = hidden
            row['un'] = 1
            row['src'] = 'Source: the game files, lines the game does not show'
            counts['hidden lines'] += len(hidden)
        biome = a.get('biome') or (m or {}).get('biomes')
        if biome:
            row['bio'] = biome
        if m:
            words, unsure = content_words(m)
            if words:
                row['mc'] = words
                counts['content'] += 1
            if unsure:
                row['un'] = 1
            held = m.get('mechanics') if isinstance(m.get('mechanics'), list) else []
            mx = uniq(keyword_key(nodes.get(n, {}).get('card') or n) for n in held + list(m.get('fixed') or []))
            if mx:
                row['mx'] = mx
        qt = a.get('qt') or (m or {}).get('flavour')
        if qt:
            row['qt'] = clean(qt)
        go = uniq(place(t, a['act']) for t in a.get('to') or [])
        go = [g for g in go if g != key]
        if go:
            row['go'] = go
        bx = uniq('x:' + b['n'] for b in a.get('boss') or [] if b['n'] in bosses)
        if bx:
            row['bx'] = bx
        if a.get('way'):
            lv = a['lv'] if isinstance(a['lv'], list) else [a['lv']]
            lo, hi = lv[0], lv[-1]
            ox = [k for lv, k in sorted(waystones) if lo <= lv <= hi]
            if ox:
                row['ox'] = ox
            row['cx'] = 1   # a node on the Atlas: the corruption pool reaches it
            counts['corruption'] += 1
        words = uniq([b['n'] for b in a.get('boss') or []] + list(a.get('quest') or []))
        if words:
            row['q'] = ' '.join(words)
        counts['unsure'] += 1 if row.get('un') else 0
        rows_r.append(row)
    for it in corruption:
        it['cx'] = 1

    # ---------- quests ----------
    def option(o):
        n = o['n'] + (' ×' + str(o['x']) if o.get('x') else '')
        return DOT.join([n] + (['Item level ' + str(o['lv'])] if o.get('lv') else []) + ([o['r']] if o.get('r') else []))

    def kept(k):
        at = [k.get('where'), k.get('by')]
        return DOT.join([k['n']] + list(k.get('ls') or []) + [x for x in at if x])

    rows_j = []
    for q in quests:
        key = quest_key[(q['n'], q['act'])]
        row = {'k': 'j', 'id': q['id'][0], 'n': q['n'], 's': q['act'] + DOT + q['kind'], 'act': q['act']}
        keep = q.get('keep') or []
        if q.get('gold'):
            row['gd'] = q['gold']
        if keep:
            row['pm'] = 1
        if any(k.get('pick') for k in keep):
            row['pk'] = 1
        if q.get('gold') or any(k.get('undo') for k in keep):
            row['un'] = 1
        if q.get('do'):
            row['t'] = clean(q['do'])
        if q.get('where'):
            row['wh'] = q['where']
        if q.get('by'):
            row['gb'] = ', '.join(q['by'])
        if q.get('from'):
            row['rf'] = ', '.join(q['from'])
        take = [[option(o) for o in w] for w in q.get('take') or []]
        take += [[x] for x in q.get('also') or []]
        if take:
            row['tk'] = take
        if keep:
            row['kp'] = [kept(k) for k in keep]
        row['src'] = 'Source: the game files'
        wx = quest_where.get(key) or []
        if wx:
            row['wx'] = wx
        names = uniq(o['n'] for w in q.get('take') or [] for o in w)
        rw = uniq(card_key(n, ITEM_KINDS) for n in names)
        if rw:
            row['rw'] = rw
        words = uniq(names + [k['n'] for k in keep] + list(q.get('by') or []) + list(q.get('from') or []))
        if words:
            row['q'] = ' '.join(words)
        counts['unsure'] += 1 if row.get('un') else 0
        rows_j.append(row)

    # ---------- acts ----------
    rows_v = []
    for a in Q.get('acts') or []:
        n_areas = sum(1 for r in rows_r if r['act'] == a['act'])
        n_quests = sum(1 for r in rows_j if r['act'] == a['act'])
        row = {'k': 'v', 'id': a['act'], 'n': a['act'], 'act': a['act'],
               's': '%d areas%s%d quests' % (n_areas, DOT, n_quests)}
        if a.get('sum'):
            row['kp'] = a['sum']
        picks = []
        for p in a.get('pick') or []:
            opts = [DOT.join([o['n']] + list(o.get('ls') or [])) for o in p.get('of') or []]
            if opts:
                picks.append({'w': DOT.join(x for x in (p.get('where'), p.get('quest')) if x), 'o': opts})
        if picks:
            row['tk'] = picks
            if any(p.get('undo') for p in a.get('pick') or []):
                row['un'] = 1
        row['src'] = 'Source: the game files'
        rows_v.append(row)

    index['items'] = items + rows_v + rows_r + rows_j
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('data/index.json %d KB%sacts %d, areas %d, quests %d%s%s' % (
        len(body.encode('utf-8')) // 1024, DOT, len(rows_v), len(rows_r), len(rows_j), DOT,
        ', '.join('%s %d' % kv for kv in counts.items())))
    appdata.write(index)


if __name__ == '__main__':
    main()
