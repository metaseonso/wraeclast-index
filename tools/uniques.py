"""Build data/uniques.json: every unique's official mod lines with their full roll ranges.

Source: poe2db (https://poe2db.tw/us/Unique_item), datamined from the game files and updated each
patch. One list page, plus one page each for the few older uniques the list leaves out.
Run once per game patch, after tools/sync.py has built data/index.json:
    python tools/uniques.py
tools/sync.py then uses these lines on the cards and in the drill-down.

Lines the game has no wording for never get through: clean_lines() drops them here, and tools/sync.py
imports it so the drill-down's own lines are cleaned the same way.
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
LIST = 'https://poe2db.tw/us/Unique_item'
UA = 'Mozilla/5.0 (compatible; wraeclast-index/1.0; contact: https://wraeclastindex.fyi/)'
RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}|\{[^}\s]{1,80}\}')
# A stat the game shows the player nothing for: poe2db writes its id out in words with the raw value in
# brackets, "local display grants level X molten shower [1]". Such a line ends on that bracketed number and
# carries no capital (the level placeholder X aside), because it never went through the game's wording table.
RAW_TAIL = re.compile(r'\[[+-]?\d+\]$')
SHOWN = re.compile(r'\[([^\[\]|]+)\|([^\[\]]+)\]')   # keyword markup: the words after the bar are what a player reads


def is_raw_line(line):
    """True when one line of a mod is game-file text rather than the wording the game shows."""
    t = re.sub(r'\s+', ' ', str(line or '')).strip()
    return bool(RAW_TAIL.search(t)) and not re.search(r'[A-WYZ]', SHOWN.sub(r'\2', t))


def clean_lines(lines):
    """Mod lines with every game-file line dropped; a mod left with nothing goes with them."""
    out = []
    for mod in lines:
        kept = '\n'.join(x for x in str(mod).split('\n') if x.strip() and not is_raw_line(x))
        if kept:
            out.append(kept)
    return out


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), timeout=90) as r:
        return r.read().decode('utf-8')


def text(fragment):
    t = re.sub(r'<span class="ndash">[^<]*</span>', '-', fragment)   # "(40–60)", written the way the index writes ranges
    t = re.sub(r'<br\s*/?>', '\n', t)
    t = html.unescape(re.sub(r'<[^>]+>', '', t))
    return re.sub(r'[ \t]+', ' ', t).strip()


def parse(page, only=None):
    """Every unique card on a poe2db page: name | base -> {ls: lines, rq: [level, str, dex, int]}."""
    out = {}
    for b in re.split(r'<span class="uniqueName">', page)[1:]:
        name = text(b[:b.index('</span>')])
        if only and name != only:
            continue
        tl = re.search(r'<span class="uniqueTypeLine">(.*?)</span>', b, re.S)
        base = text(tl.group(1)) if tl else ''
        end = b.find('<div class="col">')   # the next card starts here
        body = b if end < 0 else b[:end]
        im = [text(x) for x in re.findall(r'<div class="implicitMod">(.*?)</div>', body, re.S)]
        ex = [text(x) for x in re.findall(r'<div class="explicitMod">(.*?)</div>', body, re.S)]
        # one entry per mod; a mod the game wraps over two lines keeps its line break
        im = clean_lines(re.sub(r' *\n *', '\n', x).strip() for x in im if x.strip())
        ex = clean_lines(re.sub(r' *\n *', '\n', x).strip() for x in ex if x.strip())
        lines = im + ex
        if not name or not lines or any(RAW.search(x) for x in lines):
            continue
        entry = {'ls': lines, 'ni': len(im)}
        rq = re.search(r'<div class="requirements">(.*?)</div>', body, re.S)
        if rq:
            r_ = text(rq.group(1))
            lv = re.search(r'Level (\d+)', r_)
            attrs = {a: int(v) for v, a in re.findall(r'(\d+) (Str|Dex|Int)', r_)}
            entry['rq'] = [int(lv.group(1)) if lv else 0, attrs.get('Str', 0), attrs.get('Dex', 0), attrs.get('Int', 0)]
        out.setdefault(name + ' | ' + base, entry)
    return out


def from_summary(page, name):
    """Older uniques' own pages carry the item in their summary tags: title "Name Base", one mod per line."""
    t = re.search(r'<meta property="og:title" content="([^"]*)"', page)
    d = re.search(r'<meta property="og:description" content="([^"]*)"', page, re.S)
    if not t or not d or not html.unescape(t.group(1)).startswith(name):
        return {}
    base = html.unescape(t.group(1))[len(name):].strip()
    lines = clean_lines(re.sub(r'\s*[–—]\s*', '-', x).strip() for x in html.unescape(d.group(1)).split('\n') if x.strip())
    if not lines or any(RAW.search(x) for x in lines):
        return {}
    return {name + ' | ' + base: {'ls': lines, 'ni': 0}}


def build():
    """Every unique with official lines. Anything wrong in here is a fault: main() keeps the last file."""
    out = parse(fetch(LIST))
    # uniques the index knows that the list page leaves out (older items): read their own pages
    names = {k.split(' | ')[0] for k in out}
    index = ROOT / 'data' / 'index.json'
    missing = []
    if index.exists():
        for it in json.loads(index.read_text(encoding='utf-8'))['items']:
            if it['k'] == 'u' and it['n'] not in names and it['n'] not in missing:
                missing.append(it['n'])
    for n in missing[:80]:
        time.sleep(1)
        try:
            page = fetch('https://poe2db.tw/us/' + urllib.parse.quote(n.replace(' ', '_')))
            got = parse(page, only=n) or from_summary(page, n)
        except Exception as e:
            got = {}
            print('  no page for', n, e, file=sys.stderr)
        for k, v in got.items():
            out.setdefault(k, v)
        print('  older unique:', n, 'found' if got else 'not found', file=sys.stderr)
    return out


def main():
    # Last good wins: a poe2db layout change never leaves the cards without their roll ranges.
    # 300 is the floor the list page has always cleared, so under it is the page, not the game.
    out = lastgood.pull('Unique lines', build, file='uniques.json', url=LIST, floor=300)
    if out is not None:
        lastgood.save(ROOT / 'data' / 'uniques.json', json.dumps(out, ensure_ascii=False, separators=(',', ':')))
        print(len(out), 'uniques with official lines -> data/uniques.json')
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Unique lines', file='uniques.json', url=LIST))
