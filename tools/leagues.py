"""Build data/leagues.json: every Path of Exile 2 league with its patch and start date, its own colour, and
the next league when it has been announced. The home page shows how long the current league has run and when
the next one starts; a card's price chart draws each retired league in its own colour.

Source: poe2db's league list (https://poe2db.tw/us/League; their robots.txt allows it; credited on the page).
One request, every hour, in .github/workflows/pages.yml (it only needs 6-hourly; it runs on pages.yml's own
hourly timer instead, since that is what triggers it). Where the file goes and how it reaches the site:
tools/sitedata.py.

A league's colour is GGG's own, sampled once from the art they published for that league (the banner their
announcement post opens with, from the Path of Exile 2 announcements forum; their robots.txt allows both).
It is kept on the league from then on, so a league that has one is never fetched again and an ordinary run
asks pathofexile.com for nothing. A new league gets its colour the first run after it starts, and a league
whose art cannot be found or read simply carries none.

    python tools/leagues.py
"""
import colorsys
import datetime as dt
import html
import io
import json
import re
import sys
import time
import urllib.request

import lastgood
import sitedata

URL = 'https://poe2db.tw/us/League'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'

# GGG's Path of Exile 2 announcements forum: every league is revealed there, and the reveal post opens with
# that league's own banner art.
FORUM = 'https://www.pathofexile.com/forum/view-forum/2211'
THREAD = 'https://www.pathofexile.com/forum/view-thread/'
PAGES = 12          # listing pages walked back: about two years of announcements
PACE = 1.5          # seconds between requests to pathofexile.com
GROUND = (5, 6, 5)  # --sunken, the ground a card's price chart is drawn on (assets/theme.css)
CLEARS = 3.0        # the contrast a league's colour has to hold against it
ROW = re.compile(r'<div class="title">\s*<a href="/forum/view-thread/(\d+)">\s*(.*?)\s*</a>', re.S)
ART = re.compile(r'<img[^>]+src="(https://web\.poecdn\.com/public/news/[^"]+)"')


def build():
    """The league list as the site reads it. Anything wrong in here is a fault: main() keeps the last file."""
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
    leagues.sort(key=lambda x: x['start'], reverse=True)
    colours(leagues)
    return {'source': 'poe2db', 'url': URL, 'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'),
            'leagues': leagues}


# ---------------------------------------------------------------- a league's own colour
def read(url, timeout=30):
    """One polite read, then a pause: nothing here fetches in a hurry."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read()
    time.sleep(PACE)
    return body


def posts():
    """Every announcement in the forum, newest first: (thread id, title)."""
    out = []
    for p in range(1, PAGES + 1):
        page = read(FORUM + ('' if p == 1 else '/page/%d' % p)).decode('utf-8', 'replace')
        rows = ROW.findall(page)
        if not rows:
            break
        out += [(i, html.unescape(re.sub(r'<[^>]+>', '', t)).strip()) for i, t in rows]
    return out


def reveals(league, all_posts):
    """The posts that could carry this league's art, oldest first. GGG name a league in their marketing before
    they name it in the game data, so the name to look for is the marketing one: "Return of the Ancients"
    for Runes of Aldur. The reveal ("Announcing ...") comes first; after it, the posts the league is the
    subject of, earliest first, because the earliest is the one the art was made for."""
    name = (league.get('sub') or league['name']).lower()
    said, about = [], []
    for tid, title in all_posts:
        low = title.lower()
        if name not in low:
            continue
        if low.startswith('announcing'):
            said.append(tid)
        elif low.startswith(name) or 'path of exile 2: ' + name in low:
            about.append(tid)
    return [*reversed(said), *reversed(about)]


def art_of(league, all_posts):
    """The address of GGG's art for one league: the first picture in the first of its posts that has one."""
    for tid in reveals(league, all_posts):
        page = read(THREAD + tid).decode('utf-8', 'replace')
        found = ART.search(page[page.find('newsPost'):])
        if found:
            return found.group(1)
    return None


def sample(data):
    """The colour a picture is made of: every pixel that carries a hue at all, gathered into ten-degree bins
    and weighted by how much colour it carries, then the fullest bin and its neighbours. Near-black and
    near-grey pixels say nothing about a palette, so they are left out."""
    from PIL import Image        # only a league without a colour needs it; the kept ones stand without it
    im = Image.open(io.BytesIO(data)).convert('RGB')
    im = im.resize((200, max(1, round(200 * im.height / im.width))))
    px = im.tobytes()
    weight, hue, sat, val = [0.0] * 36, [0.0] * 36, [0.0] * 36, [0.0] * 36
    for i in range(0, len(px), 3):
        h, s, v = colorsys.rgb_to_hsv(px[i] / 255, px[i + 1] / 255, px[i + 2] / 255)
        if v < 0.06 or s < 0.15:
            continue
        b = int(h * 36) % 36
        weight[b] += s
        hue[b] += h * s
        sat[b] += s * s
        val[b] += v * s
    if not sum(weight):
        return None
    b = max(range(36), key=lambda i: weight[i] + (weight[i - 1] + weight[(i + 1) % 36]) / 2)
    w = weight[b]
    return tuple(round(x * 255) for x in colorsys.hsv_to_rgb(hue[b] / w, sat[b] / w, val[b] / w))


def lum(rgb):
    """Relative luminance, the way contrast is measured."""
    c = [x / 255 for x in rgb]
    c = [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def contrast(rgb, on=GROUND):
    lo, hi = sorted((lum(rgb), lum(on)))
    return (hi + 0.05) / (lo + 0.05)


def lift(rgb):
    """The same colour, brighter until it clears CLEARS against the chart's ground. Key art is dark, so most
    of these need lifting; the hue and the saturation never move, so the league keeps its own colour."""
    h, l, s = colorsys.rgb_to_hls(*[x / 255 for x in rgb])
    while contrast(rgb) < CLEARS and l < 1:
        l = min(1.0, l + 0.01)
        rgb = tuple(round(x * 255) for x in colorsys.hls_to_rgb(h, l, s))
    return rgb


def colours(leagues):
    """Give every league its colour: the one it already has, or a fresh sample from GGG's art for it. Only a
    league that has started and carries none is looked up, so most runs fetch nothing at all."""
    had = {l.get('name'): l for l in (lastgood.committed('leagues.json', quiet=True) or {}).get('leagues', [])}
    today = dt.date.today().isoformat()
    for l in leagues:
        was = had.get(l['name']) or {}
        for f in ('colour', 'art', 'sampled'):
            if was.get(f):
                l[f] = was[f]
    want = [l for l in leagues if not l.get('colour') and l['start'] <= today]
    if not want:
        return
    try:
        all_posts = posts()
    except Exception as e:
        print('  no league colours this run:', e, file=sys.stderr)
        return
    for l in want:
        try:
            url = art_of(l, all_posts)
            raw = sample(read(url)) if url else None
        except Exception as e:
            print('  could not read the art for', l['name'] + ':', e, file=sys.stderr)
            continue
        if not raw:
            print('  no art found for', l['name'], file=sys.stderr)
            continue
        lit = lift(raw)
        l['colour'] = '#%02x%02x%02x' % lit
        l['art'] = url
        l['sampled'] = today
        print('  %s: #%02x%02x%02x lifted to %s, %.2f:1 to %.2f:1, from %s'
              % (l['name'], *raw, l['colour'], contrast(raw), contrast(lit), url))


def main():
    # Last good wins: a page that stopped answering or stopped listing leagues never blanks the home page.
    # Three is the floor because the game has never had fewer, so anything under it is the page, not the game.
    out = lastgood.pull('League dates', build, file='leagues.json', url=URL, at='leagues', floor=3)
    if out is not None:
        sitedata.publish('leagues.json', out)
        print(len(out['leagues']), 'leagues; newest:', out['leagues'][0])
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'League dates', file='leagues.json', url=URL))
