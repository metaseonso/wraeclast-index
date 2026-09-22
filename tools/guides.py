"""Build data/guides.json: the community guides the site links out to, each one read to see it is still there.

A guide is somebody else's work. The site links one where it helps a player and names whose it is on the
spot; it is never shown as ours. The whole list is GUIDES below — a name, whose it is, what a player will
find, the address, and the words the page has to still carry — and assets/build.js draws whatever this file
holds, so a second guide is one entry here and no page code.

Every run reads each address. A guide that answers keeps today's date. A guide whose address has rotted, or
whose page no longer carries its own words, is a fault like any other source that stopped answering
(tools/lastgood.py): the row already committed stays exactly as it is, the run says which guide and why,
data/faults.json records it under that guide's own name, a GitHub issue labelled data-fault goes up and the
run exits non-zero. Then the link is fixed or the guide is dropped, by hand. The one thing that never
happens is a dead link sitting on the site quietly.

Run on every publish (.github/workflows/pages.yml), not on the hourly price runs: one read of someone
else's site per deploy is enough to catch a link going.

    python tools/guides.py
"""
import datetime as dt
import json
import sys
import urllib.request

import lastgood

UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
OUT = lastgood.DATA / 'guides.json'
NOTE = ('Community guides the site links out to, each one named where it is shown. Written by tools/guides.py, '
        'which reads every address before it publishes one.')
FLOOR = 4000        # bytes: a page shorter than this answered with something, but not with a guide

# One line per guide. `what` is what a player will find, in our own words and short enough for one line;
# `holds` is the words the page has to still carry, so an address that survives its own guide is caught too.
GUIDES = [
    {'name': 'PoE 2 Leveling Guide',
     'by': 'domistae',
     'what': 'Acts I–IV and the Interludes, step by step, ticked off as you go',
     'url': 'https://domistae.github.io/poe2-leveling/poe2_leveling_guide.html',
     'holds': 'Leveling Guide'},
]


def check(guide):
    """One guide, read. The row the site shows, dated today; anything wrong with the page is a fault."""
    req = urllib.request.Request(guide['url'], headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        if r.status != 200:
            raise lastgood.Stale('the page answered %d' % r.status)
        page = r.read().decode('utf-8', 'replace')
    if len(page) < FLOOR:
        raise lastgood.Stale('the page came back %d bytes long, so there is no guide on it' % len(page))
    if guide['holds'] not in page:
        raise lastgood.Stale('the page no longer says "%s", so it is not the guide any more' % guide['holds'])
    return {'name': guide['name'], 'by': guide['by'], 'what': guide['what'], 'url': guide['url'],
            'checked': dt.date.today().isoformat()}


def main():
    # Last good wins: a guide that did not answer keeps the row it last checked out on, and says so loudly.
    # The row carries its own date, so a stale guide leaves the file byte for byte as it was.
    had = {g.get('name'): g for g in (lastgood.committed('guides.json', quiet=True) or {}).get('guides', [])}
    guides = []
    for g in GUIDES:
        # one guide, one section, one thing counted: its own check. So a guide that stopped answering reads
        # "1 row before, 0 now", and the copy being kept is dated by the day that guide last checked out.
        was = had.get(g['name'])
        row = lastgood.pull(g['name'], lambda g=g: check(g), file='guides.json', url=g['url'],
                            at='checked', old=was or {}) or was
        if row:
            guides.append(row)
            print('  %s, by %s: %s' % (row['name'], row['by'], 'read today' if row is not was else
                                       'keeping the check from ' + lastgood.day(row.get('checked'))))
    lastgood.save(OUT, json.dumps({'note': NOTE, 'guides': guides}, ensure_ascii=False, separators=(',', ':')) + '\n')
    print(len(guides), 'guide' + ('' if len(guides) == 1 else 's'), 'written to', OUT)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, {g['name']: 'guides.json' for g in GUIDES}))
