"""The drill-down's data blocks from the game files, in the artifact's exact form.

tools/sync.py used to read these blocks out of a saved copy of the Wraeclast Index artifact. Each now has a
builder of its own that reads the official export (tools/gamepull.py), and this is the one place that
knows which builder fills which block (BUILDERS). A builder is a module with build(old) -> the block, where
old is the committed copy of that block, for the few things the game files do not carry (the sprite cells).
A block whose builder is not here yet is read from the committed copy, as before.

  python tools/fromgame.py            build every block, print what each holds, write nothing

tools/sync.py --from-game writes them (each through tools/lastgood.py); tools/dev/explorecmp.py holds each
one up against the committed copy, field by field. docs/sources-explore.md maps every field to its source.
"""
import copy
import importlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

ROOT = Path(__file__).resolve().parent.parent
# block name -> the artifact's block id
IDS = {'gems': 'gemdata', 'uniques': 'uqdata', 'tree': 'trdata', 'keywords': 'kwdata', 'jewels': 'jwdata'}
# block id -> (the builder module in tools/, the part lastgood counts, the least a working build gives)
BUILDERS = {
    'gemdata': ('gems', 'gems', 900),
}
# the order they are built in: the keyword file counts what the other four link to, so it goes last
ORDER = ('gemdata', 'uqdata', 'trdata', 'jwdata', 'kwdata')


def committed(bid):
    """A block as the committed explore.html names it, whole (the gem file with its level text)."""
    import sync
    files = sync.data_files((ROOT / 'explore.html').read_text(encoding='utf-8'))
    f = files.get(bid)
    if not f or not (ROOT / f).exists():
        return None
    return sync.whole(bid, json.loads((ROOT / f).read_text(encoding='utf-8')), files)


def committed_file(bid):
    """The committed file's name under data/, as tools/lastgood.py wants it (explore/gems.<hash>.json)."""
    import sync
    f = sync.data_files((ROOT / 'explore.html').read_text(encoding='utf-8')).get(bid) or ''
    return f[len('data/'):] if f.startswith('data/') else f


def builder(bid):
    name = (BUILDERS.get(bid) or (None,))[0]
    return importlib.import_module(name) if name else None


def raw(bid, built=None):
    """One block in the artifact's form: built from the game files where a builder exists, else the
    committed copy. built: the blocks made before it this run (the keyword file reads the other four)."""
    old = committed(bid)
    mod = builder(bid)
    if not mod:
        return copy.deepcopy(old)
    if getattr(mod, 'NEEDS_BLOCKS', False):
        return mod.build(old, built or {})
    return mod.build(old)


def blocks():
    """Every block, in the artifact's form, no lastgood: for the comparison and the report."""
    out = {}
    for bid in ORDER:
        out[bid] = raw(bid, out)
    return out


def build(name, built=None):
    """One block as tools/sync.py writes it to data/explore/, for the comparison: after its own clean-up
    (the [DNT] gems settled; the unique lines made official and the baked prices dropped)."""
    import sync
    bid = IDS[name]
    if built is None:
        built = {}
        if getattr(builder(bid), 'NEEDS_BLOCKS', False):
            for b in ORDER[:ORDER.index(bid)]:
                built[b] = raw(b, built)
    obj = raw(bid, built)
    return site(bid, obj)


def site(bid, obj):
    """A block through tools/sync.py's own steps, the ones it takes before writing data/explore/."""
    import sync
    if bid == 'gemdata':
        sync.clean_gems(obj)
    elif bid == 'uqdata':
        sync.officialize(obj)
    if bid in ('uqdata', 'trdata'):
        sync.unpriced(bid, obj)
    return obj


def main():
    got = blocks()
    for name, bid in IDS.items():
        b = got[bid]
        mod = BUILDERS.get(bid)
        part = b.get(mod[1]) if mod and isinstance(b, dict) and mod[1] else b
        print('%-9s %-10s %6d rows  %s' % (name, bid, len(part or []),
                                           'from the game files (tools/%s.py)' % mod[0] if mod else 'the committed copy'))


if __name__ == '__main__':
    main()
