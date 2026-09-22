"""Pull the mod spawn weights the game files do not carry, into tools/craftweights.json.

Run after a game patch, before tools/craft.py:   python tools/craftweights.py      (--report writes nothing)

Why this tool exists: the official export states every spawn weight as 1 or 0 — can roll, cannot roll — and
nothing numeric (tools/craft.py, weight()). poe2db prints the same on every mod table ("Modifier weight
information cannot be obtained from game files") and shows 1 for every mod, so it carries no numbers either.
The next most reliable source, and the one the owner named, is Craft of Exile: its own pages load a plain
JSON per game build, and that JSON holds a weight for every mod of every kind of item.

Where the numbers come from (craftofexile.com/weightings, poe2db.tw/us/weightings say the same):
  Krakenbul and the Prohibited Library Discord measure them with recombinators. For bases that cannot be
  recombined (charms, jewels, tablets, waystones) they parse trade listings instead, match each listing's
  mods to the game's mods, and normalise the counts; those tables come out flat (every weight 1), so this
  tool drops them — a flat table says nothing. Measured, not official: the Craft page names the source.

The pull, three requests, a pause between them:
  1. craftofexile.com's PoE2 page, for the game build its data is keyed by (4.5.5.3) and the patch it calls
     that build (0.5.5.3) — the same numbers the site's own patch picker shows.
  2. json/poe2/<build>/data.json          the mods (by the game's own mod key), the item classes and the weights
  3. json/poe2/<build>/localization/english.json   the names, to match their item classes to our bases
Neither craftofexile.com nor beta.craftofexile.com publishes a robots.txt (every path answers with the app
page), so nothing there is disallowed; this reads the same files a visitor's browser reads, once per patch.

Output tools/craftweights.json (not part of the website, .assetsignore):
  src      name, page, how the numbers were made, the day of the pull, their build and patch
  weights  {their item class: {mod key: weight}} — only classes whose weights are not all the same number
  bases    {base name: their item class} — how tools/craft.py finds a base's weights
  flat     the classes whose table is flat (no numbers to show: jewels, flasks, charms, tablets, waystones)
  faults   what went wrong on a run that kept the last good weights, newest first (up to 5)

A pull that fails, or comes back with far less than the file already holds, writes no weights: the last good
file stays, the reason goes to stderr and into faults, and the exit code is 1. tools/craft.py then keeps the
weights already in data/craft/ and says so, so the site never loses a table it had.
"""
import argparse
import datetime
import gzip
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent / 'craftweights.json'
COE = 'https://beta.craftofexile.com/'
PAGE = COE + '?game=poe2'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
HOW = 'measured with recombinators by Krakenbul and the Prohibited Library'
KEEP_FAULTS = 5
OK_SHARE = 0.8      # a pull holding less than this much of what the file has counts as collapsed


def fetch(url):
    """One polite read: the site's own User-Agent, gzip, three tries."""
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept-Encoding': 'gzip'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                b = r.read()
                if r.headers.get('Content-Encoding') == 'gzip':
                    b = gzip.decompress(b)
            return b.decode('utf-8', 'replace')
        except Exception:
            if attempt == 2:
                raise
            time.sleep(4)


def assigned(text, name):
    """Their data files are one assignment, "coedata={...}" — the JSON is everything after the first =."""
    i = text.find('=')
    if i < 0:
        raise LookupError('%s is not the assignment this expects' % name)
    return json.loads(text[i + 1:].strip().rstrip(';'))


def build():
    """Their current game build and the patch they call it, from the page's own constants block.
    No block (they moved it): fall back to the data file the page loads, which names the build too."""
    t = fetch(PAGE)
    m = re.search(r'<div id=[\'"]\w*[Cc]onstants[\'"][^>]*>(\{.*?\})</div>', t, re.S)
    if m:
        c = json.loads(m.group(1))
        b = c.get('patch') or (c.get('core') or {}).get('currentPatch')
        if b:
            p = next((x for x in (c.get('core') or {}).get('patches') or [] if x.get('number') == b), {})
            return b, (p.get('label') or ''), (p.get('league') or '')
    m = re.search(r'src=[\'"]json/poe2/([\d.]+)/data\.json', t)
    if not m:
        raise LookupError('the PoE2 page names no build and loads no data file this can read')
    print('  their constants block has moved; took the build from the data file the page loads', file=sys.stderr)
    return m.group(1), '', ''


def pull():
    """{their class: {mod key: weight}}, {base name: their class}, the flat classes, and what was pulled."""
    b, label, league = build()
    time.sleep(1.5)
    data = assigned(fetch('%sjson/poe2/%s/data.json' % (COE, b)), 'data.json')
    time.sleep(1.5)
    lang = assigned(fetch('%sjson/poe2/%s/localization/english.json' % (COE, b)), 'the localisation')
    name = lambda i: lang[i] if isinstance(i, int) and 0 <= i < len(lang) else ''
    key = {m['id']: m['key'] for m in data['mods']['entries']}
    cls = {c['id']: name(c['label']) for c in data['classes']['entries']}
    if len(set(cls.values())) != len(cls):
        raise LookupError('two of their item classes share a name; this keys weights by name')

    weights, flat = {}, []
    for cid, cname in cls.items():
        w = {key[int(k)]: v for k, v in (data['classmods'].get(str(cid)) or {}).items() if int(k) in key}
        if not w:
            continue
        if len(set(w.values())) < 2:        # one number for every mod: their table for this class is flat
            flat.append(cname)
            continue
        weights[cname] = dict(sorted(w.items()))

    bases, twice = {}, set()
    for it in data['items']['entries']:
        n = name(it['label'])
        if not n:
            continue
        if n in bases and bases[n] != cls.get(it['class']):
            twice.add(n)                    # one name, two of their classes: no telling which is ours
        bases.setdefault(n, cls.get(it['class']))
    for n in twice:
        bases.pop(n, None)
    if twice:
        print('  the same name in two of their item classes, left out: %s' % ', '.join(sorted(twice)[:8]), file=sys.stderr)
    if not weights or not bases:
        raise LookupError('no weights in their data (read %d classes, %d bases)' % (len(cls), len(bases)))
    return {'src': {'n': 'Craft of Exile', 'u': 'https://www.craftofexile.com/?game=poe2', 'how': HOW,
                    'd': datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d'), 'build': b, 'patch': label, 'league': league},
            'weights': weights, 'bases': dict(sorted(bases.items())), 'flat': sorted(flat)}


def on_disk():
    try:
        return json.loads(OUT.read_text(encoding='utf-8'))
    except Exception:
        return {}


def write(d):
    """One mod per line, so a patch's diff shows which weights moved. LF, like everything else in the repo."""
    OUT.write_text(json.dumps(d, ensure_ascii=False, indent=1) + '\n', encoding='utf-8', newline='\n')


def counts(d):
    return len(d.get('weights') or {}), sum(len(w) for w in (d.get('weights') or {}).values())


def fault(old, why):
    """Keep the last good weights, say so loudly, and leave the reason in the file."""
    print('  Craft of Exile weights NOT pulled (%s); keeping the ones in %s' % (why, OUT.name), file=sys.stderr)
    if not old:
        print('  and there are none yet: run this again before tools/craft.py', file=sys.stderr)
        return 1
    old['faults'] = ([{'d': datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%d %H:%M'), 'why': str(why)[:200]}]
                     + (old.get('faults') or []))[:KEEP_FAULTS]
    write(old)
    print('  last good pull: %s (their patch %s) · %d classes, %d weights' % (
        old['src'].get('d', '?'), old['src'].get('patch', '?'), *counts(old)), file=sys.stderr)
    return 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--report', action='store_true', help='say what would change, write nothing')
    args = ap.parse_args()
    old = on_disk()
    had_c, had_w = counts(old)
    try:
        new = pull()
    except Exception as e:
        return fault(old, e)
    got_c, got_w = counts(new)
    if had_c and (got_c < had_c * OK_SHARE or got_w < had_w * OK_SHARE):
        return fault(old, 'only %d classes and %d weights read, the file has %d and %d' % (got_c, got_w, had_c, had_w))
    s = new['src']
    print('Craft of Exile, their build %s (patch %s%s): %d item classes with weights, %d mod weights in all' % (
        s['build'], s['patch'], ', ' + s['league'] if s['league'] else '', got_c, got_w))
    print('  flat tables (no numbers to show): %s' % (', '.join(new['flat']) or 'none'))
    gone = sorted(set(old.get('weights') or {}) - set(new['weights']))
    if gone:
        print('  gone from their data since the last pull: %s' % ', '.join(gone[:8]), file=sys.stderr)
    if args.report:
        print('  --report: nothing written (the file holds %d classes, %d weights)' % (had_c, had_w))
        return 0
    if old.get('faults'):
        new['faults'] = old['faults'][:KEEP_FAULTS]     # the record of what went wrong stays with the file
    write(new)
    print('  %.0f KB -> %s · run tools/craft.py next' % (OUT.stat().st_size / 1024, OUT.name))
    return 0


if __name__ == '__main__':
    sys.exit(main())
