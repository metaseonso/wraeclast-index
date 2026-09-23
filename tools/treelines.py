"""data/treelines.json: what every passive on the tree says, keyed by the number the tree calls it.

The Build tab works a character out from the lines it carries, and a build's passives arrive as the tree's
own numbers. The cards on this site carry a passive's lines already, but they are keyed by name, and the
tree's small passives have no card at all, so neither road gets from a number to a line.

So this writes the one file that does: the wordings once, and per passive the wordings it holds. The game's
keyword brackets are taken out here rather than in the browser, because nothing downstream wants them and a
player must never see one.

It reads the committed data/explore/tree.*.json and nothing else — no network, no export — so it can be run
on any checkout:

    python tools/treelines.py
    python tools/treelines.py --report    say what would change, write nothing
"""
import argparse
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data' / 'treelines.json'

BRACKET_PAIR = re.compile(r'\[([^\]|]+)\|([^\]]+)\]')
BRACKET = re.compile(r'\[([^\]]+)\]')


def plain(text):
    """The game writes a keyword inside its own brackets. A player never sees them and neither does the file."""
    return BRACKET.sub(r'\1', BRACKET_PAIR.sub(r'\2', text)).strip()


def build():
    src = next(p for p in sorted((ROOT / 'data' / 'explore').iterdir()) if p.name.startswith('tree.'))
    passives = json.loads(src.read_text(encoding='utf-8'))['passives']
    words, at, nodes = [], {}, {}
    for p in passives:
        lines = [plain(one) for block in p.get('t') or [] for one in block.split('\n') if one.strip()]
        if not lines:
            continue
        got = []
        for line in lines:
            if line not in at:
                at[line] = len(words)
                words.append(line)
            got.append(at[line])
        nodes[str(p['h'])] = got
    return {'from': src.name, 'note': 'every passive on the tree, by the number the tree calls it, and the '
                                      'wordings it holds', 'w': words, 'n': nodes}


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='say what would change, write nothing')
    args = ap.parse_args()
    out = build()
    text = json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n'
    was = OUT.read_text(encoding='utf-8', newline='') if OUT.exists() else ''
    print('treelines %d passives, %d wordings, %.0f KB%s'
          % (len(out['n']), len(out['w']), len(text.encode('utf-8')) / 1024,
             '' if text == was else (' (would change)' if args.report else ' -> data/treelines.json')))
    if not args.report:
        OUT.write_text(text, encoding='utf-8', newline='\n')


if __name__ == '__main__':
    main()
