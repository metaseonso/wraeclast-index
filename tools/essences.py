"""Build data/essences.json: what an essence adds, on each kind of item.

Every essence card used to carry one line — the game's own "Upgrades a Magic item to a Rare item, adding a
guaranteed modifier" — and nothing about the modifier, although the game gives a different one per kind of item.
This writes that table out on its own, small enough to fetch when a card opens (assets/kinds.js declares the
field, assets/app.js draws it), so the 1.6 MB of data/craft/ stays where it is: on the Craft tab.

Run after tools/craft.py and tools/nodelinks.py:   python tools/essences.py

Sources:
  data/craft.json, data/craft/<class>.json (tools/craft.py)  the mod each essence adds on each kind of item.
      The wording and its rolls are the game's own (RePoE's export of the game files); which mod an essence
      adds on which kind of item is read from poe2db, which datamines the same files. Nothing here is measured
      or guessed, so the card names no source of its own.
  data/index.json   only to mark the phrases in a mod line that name another card, exactly as a card's own
      lines are marked (tools/nodelinks.py). The page draws the mechanics ones, as it does everywhere else.

Output (compact; the wording is the game's, never rewritten):
  v, gen   the game patch the tables came from, and the day this ran
  cl       class id -> what the game calls that kind of item (only the kinds an essence touches)
  lxk      the cards the mod lines name, once each, as assets/app.js keys them
  e        essence name -> [[prefix/suffix, level, [class ids], [lines], lx], ...], one row per mod it adds.
           A row carries every kind of item that gets that same mod, in the Craft tab's own order; lx is one
           entry per line, 0 where the line names nothing, and the row leaves it out where no line does.
"""
import json
import sys
import time
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nodelinks  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'essences.json'


def tables():
    """Every essence row in data/craft/, as (essence, class id, prefix/suffix, level, lines)."""
    craft = json.loads((ROOT / 'data' / 'craft.json').read_text(encoding='utf-8'))
    order = [c['id'] for c in craft['classes']]
    name = {c['id']: c['n'] for c in craft['classes']}
    rows = []
    for cid in order:
        f = ROOT / 'data' / 'craft' / (cid + '.json')
        if not f.exists():
            continue
        d = json.loads(f.read_text(encoding='utf-8'))
        for essence, _, i, level in d.get('ess') or []:
            mod = d['mods'][i]
            rows.append((essence, cid, d['fam'][mod[1]][0], level, list(mod[3])))
    return craft, order, name, rows


def build():
    craft, order, name, rows = tables()
    index = json.loads((ROOT / 'data' / 'index.json').read_text(encoding='utf-8'))
    doors = nodelinks.Doors(index)
    rep = nodelinks.blank_rep()
    rank = {cid: i for i, cid in enumerate(order)}

    # one row per (essence, side, level, wording): every kind of item the game gives that same mod to
    groups = defaultdict(list)
    for essence, cid, side, level, lines in rows:
        groups[(essence, side, level, tuple(lines))].append(cid)

    out, marked = {}, 0
    for (essence, side, level, lines), kinds in sorted(groups.items(), key=lambda g: (g[0][0], rank[min(g[1], key=rank.get)])):
        lx = [doors.spans(line, rep=rep, k='e') for line in lines]
        if any(lx):
            marked += 1
        row = [side, level, sorted(set(kinds), key=rank.get), list(lines)]
        if any(lx):
            row.append([s or 0 for s in lx])
        out.setdefault(essence, []).append(row)

    used = [cid for cid in order if any(cid in r[2] for rs in out.values() for r in rs)]
    doc = {'v': craft.get('patch', ''), 'gen': time.strftime('%Y-%m-%d'),
           'cl': {cid: name[cid] for cid in used}, 'e': out}
    if doors.keys:
        doc['lxk'] = doors.keys
    return doc, rows, marked, rep


def main():
    doc, rows, marked, rep = build()
    if not doc['e']:
        sys.exit('no essence tables in data/craft — run python tools/craft.py first')
    text = json.dumps(doc, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(text, encoding='utf-8')
    mods = sum(len(v) for v in doc['e'].values())
    print('data/essences.json: %d essences, %d mods over %d kinds of item (%d rows in data/craft), %.1f kB'
          % (len(doc['e']), mods, len(doc['cl']), len(rows), len(text.encode('utf-8')) / 1000))
    print('  kinds of item per essence: %.1f on average, %d at most'
          % (sum(len(r[2]) for v in doc['e'].values() for r in v) / len(doc['e']),
             max(sum(len(r[2]) for r in v) for v in doc['e'].values())))
    print('  %d of %d mods name another card in their own words (%s)'
          % (marked, mods, ', '.join('%s %d' % x for x in rep['to'].most_common()) or 'none'))


if __name__ == '__main__':
    main()
