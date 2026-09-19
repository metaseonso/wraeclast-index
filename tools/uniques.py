"""Build data/uniques.json: every unique's official mod lines with their full roll ranges.

Source: poe2db (https://poe2db.tw/us/Unique_item), datamined from the game files and updated each
patch. One list page, plus one page each for the few older uniques the list leaves out.
Run once per game patch, after tools/sync.py has built data/index.json:
    python tools/uniques.py
tools/sync.py then uses these lines on the cards and in the drill-down.
"""
import html
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LIST = 'https://poe2db.tw/us/Unique_item'
UA = 'Mozilla/5.0 (compatible; wraeclast-index/1.0; contact: https://wraeclastindex.fyi/)'
RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}|\{[^}\s]{1,80}\}')


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
        lines = [re.sub(r' *\n *', '\n', x).strip() for x in im + ex if x.strip()]
        if not name or not lines or any(RAW.search(x) for x in lines):
            continue
        entry = {'ls': lines, 'ni': sum(1 for x in im if x.strip())}
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
    lines = [re.sub(r'\s*[–—]\s*', '-', x).strip() for x in html.unescape(d.group(1)).split('\n') if x.strip()]
    if not lines or any(RAW.search(x) for x in lines):
        return {}
    return {name + ' | ' + base: {'ls': lines, 'ni': 0}}


def main():
    out = parse(fetch(LIST))
    if len(out) < 300:
        sys.exit('only %d uniques found; the page layout may have changed' % len(out))
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
    (ROOT / 'data' / 'uniques.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(len(out), 'uniques with official lines -> data/uniques.json')


if __name__ == '__main__':
    main()
