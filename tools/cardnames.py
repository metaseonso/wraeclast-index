"""The names of the cards the site already has, by kind, for the builders that link to them by name
(tools/achievements.py, tools/atlascontent.py, tools/runes.py).

  index    data/index.json: bases (b), uniques (u), currency (c), keywords (w), atlas items (a)
  exchange data/exchange.json: the Currency Exchange's own items, each a Currency card on the Currency tab
  bosses   data/bosses.json
  areas    data/areas.json (tools/areas.py, #72). Until that lands on this branch it is read from the branch it is
           on (origin/t72-areas), the same file; --areas or WI_AREAS points at another copy

A link is a name that answers to a card, and nothing else: a name no card answers to is kept apart and counted
by the builder, never drawn as a link.
"""
import json
import os
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
AREAS_BRANCH = 'origin/t72-areas'
FLAG = 'Subject to change'
FLAGS = {FLAG: 'Depends on GGG. May change without notice.'}


def game(name):
    """One file tools/datpull.mjs wrote into data/game/: its rows, and the source line it carries."""
    d = json.loads((DATA / 'game' / (name + '.json')).read_text(encoding='utf-8'))
    return d['rows'], d.get('source') or 'game files'


def index():
    """{kind letter: {name: id}} for the index's own cards."""
    out = {}
    for it in json.loads((DATA / 'index.json').read_text(encoding='utf-8'))['items']:
        out.setdefault(it.get('k'), {}).setdefault(it.get('n'), it.get('id'))
    return out


def items():
    """Every item name a card answers to: bases, uniques, gems, and currency (the index's and the exchange's)."""
    ix = index()
    names = set(ix.get('b', {})) | set(ix.get('u', {})) | set(ix.get('g', {})) | set(ix.get('c', {}))
    try:
        names |= set(json.loads((DATA / 'exchange.json').read_text(encoding='utf-8'))['items'])
    except Exception:
        pass
    return names


def bosses():
    """{boss name: its areas}, off data/bosses.json, and the names bosses.json marks pinnacle."""
    d = json.loads((DATA / 'bosses.json').read_text(encoding='utf-8'))
    return ({b['name']: [a.get('name') for a in b.get('areas') or [] if a.get('name')] for b in d['bosses']},
            {b['name'] for b in d['bosses'] if b.get('pinnacle')})


def areas(arg=None):
    """data/areas.json's areas, and where they were read from."""
    for p in [arg, os.environ.get('WI_AREAS'), DATA / 'areas.json']:
        if p and Path(p).exists():
            return json.loads(Path(p).read_text(encoding='utf-8'))['areas'], str(Path(p).name)
    try:
        text = subprocess.run(['git', 'show', AREAS_BRANCH + ':data/areas.json'], cwd=ROOT, capture_output=True,
                              text=True, encoding='utf-8', check=True).stdout
        return json.loads(text)['areas'], AREAS_BRANCH + ':data/areas.json'
    except Exception:
        return [], None


def write(name, doc):
    """data/<name>, compact, one step."""
    path = DATA / name
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_text(json.dumps(doc, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8', newline='\n')
    os.replace(tmp, path)
    return path.stat().st_size
