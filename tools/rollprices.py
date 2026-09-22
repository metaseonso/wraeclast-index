"""Build data/pricejobs.json: which mods get live roll prices, and at which values.

tools/pricepull.py works through this list slowly, a share of every run, and the site serves the results at
/data/rollprices.json. One point comes round in about a day, not an hour. The trade sliders colour their
track by those prices and show "from ~X" beside the box.

Each job is a mod and a few of its tier breakpoints (always the lowest and the best tier). Run it after
tools/tradedata.py (it reads data/trade.json):

    python tools/rollprices.py
"""
import json
import re
from pathlib import Path

from tradedata import key

ROOT = Path(__file__).resolve().parent.parent

# (trade id or the mod's wording, how many breakpoints). The total decides how long one point waits: every
# kind gets a share of the hour in proportion to how many it has waiting (tools/pricepull.py), so 55 points
# come round in about 9 hours. Doubling them would double that wait, not the load on the trade site.
MODS = [
    ('pseudo.pseudo_total_life', 6),
    ('pseudo.pseudo_total_fire_resistance', 4),
    ('pseudo.pseudo_total_cold_resistance', 4),
    ('pseudo.pseudo_total_lightning_resistance', 4),
    ('pseudo.pseudo_total_chaos_resistance', 4),
    ('#% increased Movement Speed', 5),
    ('+# to Spirit', 4),
    ('+# to Level of all Spell Skills', 4),
    ('+# to Level of all Projectile Skills', 4),
    ('+# to Level of all Melee Skills', 4),
    ('+# to Level of all Minion Skills', 4),
    ('#% increased Cast Speed', 4),
    ('#% increased Attack Speed', 4),
]


def pick(values, n):
    """n breakpoints spread over the tiers, always the lowest and the best."""
    if len(values) <= n:
        return values
    return [values[round(i * (len(values) - 1) / (n - 1))] for i in range(n)]


def main():
    trade = json.loads((ROOT / 'data' / 'trade.json').read_text(encoding='utf-8'))
    rows = {m[0]: m for m in trade['mods']}
    by_text = {}
    for m in trade['mods']:   # explicit, not the "(Local)" copy
        if m[0].startswith('explicit.') and not re.search(r'\(Local\)\s*$', m[1]):
            by_text.setdefault(key(m[1]), m)
    jobs = []
    for ref, n in MODS:
        m = rows.get(ref) or by_text.get(key(ref))
        if not m or len(m) < 4:
            print('skip (no range):', ref)
            continue
        tiers = trade['tiers'].get(m[4]) if len(m) > 4 else None
        values = pick(sorted({t[0] for t in tiers}), n) if tiers else pick([m[2], m[3]], 2)
        jobs.append([m[0], values])
        print(m[1], values)
    (ROOT / 'data' / 'pricejobs.json').write_text(json.dumps({'roll': jobs}, separators=(',', ':')), encoding='utf-8')
    print(len(jobs), 'mods,', sum(len(v) for _, v in jobs), 'points to check')


if __name__ == '__main__':
    main()
