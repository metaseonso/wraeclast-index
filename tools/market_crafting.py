"""#105 Crafting demand: what the league is crafting with. Writes data/market/crafting.json: every crafting currency,
its divines traded this week and the week before, and whether the Craft tab's bench has it on the shelf (a row that
does links to the bench with it there).

The crafting currencies are the site's own lists, not a new grouping: the bench's shelf (data/craft.json: its orbs
and their greater and perfect forms, omens, bones and catalysts) and every essence data/essences.json knows.
"""
import marketlib as ml

KEY = 'crafting'
FILE = 'data/market/crafting.json'
WEEK_HOURS = 168
RULE = ('The crafting currencies: every orb (with its greater and perfect forms), omen, bone and catalyst on the Craft '
        'tab\'s shelf (data/craft.json), and every essence (data/essences.json). Exalted, Divine and Chaos Orbs are left '
        'out: they are what the rest is paid in. This week: the last %d hours read. Last week: the %d before them. '
        'Volume: divines changed hands, at each hour\'s own rates. A currency that traded in neither week is not '
        'listed.' % (WEEK_HOURS, WEEK_HOURS))


def groups():
    """{name: group}, and the names on the bench's shelf."""
    craft = ml.load(ml.ROOT / 'data' / 'craft.json')
    shelf = {}
    for o in craft.get('orbs') or []:
        shelf[o['n']] = 'Orb'
        for u in o.get('up') or []:
            shelf[u[0]] = 'Orb'
    for key, word in (('omens', 'Omen'), ('bones', 'Bone'), ('cats', 'Catalyst')):
        for o in craft.get(key) or []:
            shelf[o['n']] = word
    group = dict(shelf)
    for n in (ml.load(ml.ROOT / 'data' / 'essences.json').get('e') or {}):
        group.setdefault(n, 'Essence')
    for n in ('Exalted Orb', 'Divine Orb', 'Chaos Orb'):
        group.pop(n, None)
    return group, set(shelf)


def build(ctx):
    cur = ctx.cur
    T, W = cur.last, WEEK_HOURS * 3600
    group, shelf = groups()
    r1, w1, _ = cur.window(T - W + 3600, T)
    r0, w0, _ = cur.window(T - 2 * W + 3600, T - W)
    rows = []
    for n, g in group.items():
        a, b = w1.get(n), w0.get(n)
        v1 = a[0] / r1 if a and r1 else 0
        v0 = b[0] / r0 if b and r0 else 0
        if v1 or v0:
            rows.append([n, g, ml.sig(v1), ml.sig(v0), ml.pct(v1, v0), a[1] if a else 0, n in shelf])
    rows.sort(key=lambda r: (-(r[2] or 0), r[0]))
    out = ml.head(RULE, week_hours=WEEK_HOURS)
    out.update({'league': cur.name, 'from': ml.when(T - W + 3600), 'to': ml.when(T),
                'cols': ['name', 'group', 'divines this week', 'divines last week', '% change', 'amount this week',
                         'on the bench'],
                'items': rows})
    return {FILE: out}
