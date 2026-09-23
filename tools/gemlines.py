"""data/gemlines.json: what a support gem's own lines say, once the frame around them is off.

The optimise button fills an empty support socket, which means scoring a support, which means reading its
lines the way every other line on the site is read. Two things stand in the way and this file settles both.

A support writes its lines about the skill it supports — "Supported Skills deal 30% more Damage" — and the
stat table in assets/maths.js reads "30% more Damage". The frame is stripped here, once, rather than in the
browser: the line a support puts on a skill is that line.

And the card index carries a gem's description, not its numbers. The numbers are in the committed
data/explore/gems.*.json, which is 2.7 MB and has no business on a build card. This writes the small file
that does: 86 KB of wordings, keyed by the gem the site already has a card for.

Nothing is judged here. Every line goes in, framed or not, and assets/maths.js decides which of them it can
read — so a support whose lines the table does not know is named on the card rather than counted as nothing.

It reads the committed data/explore/gems.*.json and nothing else — no network, no export — so it can be run
on any checkout:

    python tools/gemlines.py
    python tools/gemlines.py --report    say what would change, write nothing
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'gemlines.json'

BRACKET_PAIR = re.compile(r'\[([^\]|]+)\|([^\]]+)\]')
BRACKET = re.compile(r'\[([^\]]+)\]')
BRACES = re.compile(r'\{[^}]*\}')
# "Supported Skills deal", "Supported Grenade Skills have": the frame a support writes its lines inside
FRAME = re.compile(r"^Supported\s+(?:[A-Za-z' ]+?\s+)?Skills?\s+(?:deal|have|gain)\s+", re.I)


def plain(text):
    """The game writes a keyword inside its own brackets. A player never sees them and neither does the file."""
    return BRACES.sub('', BRACKET.sub(r'\1', BRACKET_PAIR.sub(r'\2', text))).strip()


def build():
    src = next(p for p in sorted((ROOT / 'data' / 'explore').iterdir()) if p.name.startswith('gems.'))
    gems = json.loads(src.read_text(encoding='utf-8'))['gems']
    words, at, gots = [], {}, {}
    framed = 0
    for g in gems:
        if g.get('t') != 'support':
            continue
        lines = []
        for s in g.get('ss') or []:
            for said in (s.get('tx') or {}).values():
                for one in str(said).split('\n'):
                    line = plain(one)
                    if not line:
                        continue
                    cut = FRAME.sub('', line)
                    if cut != line:
                        framed += 1
                    lines.append(cut)
        if not lines:
            continue
        got = []
        for line in lines:
            if line not in at:
                at[line] = len(words)
                words.append(line)
            got.append(at[line])
        gots[g['id']] = got
    return {'from': src.name, 'note': 'every support gem, by the id its card carries, and the lines it puts '
                                      'on the skill it supports, with the "Supported Skills" frame off',
            'framed': framed, 'w': words, 'g': gots}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='say what would change, write nothing')
    args = ap.parse_args()
    out = build()
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    was = OUT.read_text(encoding='utf-8', newline='') if OUT.exists() else ''
    print('gemlines %d supports, %d wordings, %d off the frame, %.0f KB%s'
          % (len(out['g']), len(out['w']), out['framed'], len(text.encode('utf-8')) / 1024,
             '' if text == was else (' (would change)' if args.report else ' -> data/gemlines.json')))
    if not args.report:
        OUT.write_text(text, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
