"""Build data/leagues.json: every Path of Exile 2 league with its patch and start date, and the next one
when it has been announced. The home page shows how long the current league has run and when the next
one starts.

Source: poe2db's league list (https://poe2db.tw/us/League; their robots.txt allows it; credited on the page).
One request, every 6 hours on the data server (tools/vm/; until the move is done, also hourly in
.github/workflows/pages.yml). Where the file goes and how it reaches the site: tools/sitedata.py.

    python tools/leagues.py
"""
import datetime as dt
import html
import json
import re
import sys
import urllib.request

import sitedata

URL = 'https://poe2db.tw/us/League'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'


def main():
    req = urllib.request.Request(URL, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        page = r.read().decode('utf-8', 'replace')
    box = page[page.index('id="LeaguesList"'):]
    body = box[box.index('<tbody'):box.index('</tbody>')]
    leagues = []
    for row in re.findall(r'<tr>(.*?)</tr>', body, re.S):
        cells = [html.unescape(re.sub(r'<[^>]+>', '', c)).strip() for c in re.findall(r'<td[^>]*>(.*?)</td>', row, re.S)]
        if len(cells) < 4 or not re.match(r'^\d{4}-\d{2}-\d{2}$', cells[3]):
            continue
        name, sub = cells[1], ''
        m = re.match(r'^(.*?)\s*<(.+)>$', name)   # "Runes of Aldur <Return of the Ancients>"
        if m:
            name, sub = m.group(1), m.group(2)
        leagues.append({'v': cells[0], 'name': name, 'sub': sub, 'start': cells[3],
                        'weeks': int(cells[2]) if cells[2].isdigit() else None})
    if len(leagues) < 3:
        sys.exit('league list not found; keeping the last file')
    leagues.sort(key=lambda x: x['start'], reverse=True)
    out = {'source': 'poe2db', 'url': URL, 'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'),
           'leagues': leagues}
    sitedata.publish('leagues.json', out)
    print(len(leagues), 'leagues; newest:', leagues[0])


if __name__ == '__main__':
    main()
