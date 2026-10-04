"""The game's own pictures for the cards that had none: quests, trial modifiers, runes, areas, odds pools, bosses (#179).

Every picture here is art out of the game files, read by the same reader as the tables (tools/datpull.mjs, through
tools/gamepull.py): the table that names a thing's icon, then the file itself. None of it is on GGG's web CDN or
the RePoE mirror, so it is cut into one sprite sheet per kind, the way the gems and uniques already are
(sprites/<sheet>.webp, and the small copy tools/sprites.py makes beside it). A sheet is fetched the first time a
card of its kind is drawn, never in first paint.

Where each kind's picture comes from, best first:

  j  Quest            the quest's own icon (Quest.Icon_DDSFile), by the quest's id
  l  Trial modifier   the icon the trial shows for it: a Trial of Chaos modifier (UltimatumModifiers.Icon), an
                      affliction, boon or pledge of the Trial of the Sekhemas (SanctumPersistentEffects.Icon), by
                      name. A relic modifier, a room or a floor has none of its own and keeps its kind's mark
  o  Rune             the rune as a Runic Remnant shows it (Expedition2Runes.RemnantArt), by name
  r  Area             the mark the game's own maps put on it (WorldMapLegends): a town, an area with a
                      waypoint, any other area; on the Atlas, a map node or a waypoint
  s  Pool             the Atlas icon of the content the pool rolls in (the atlas content icons), by the game
                      table it is read from; the map content groups have none and keep their kind's mark
  x  Boss             the mark the game puts on the fight (WorldMapLegends, the Atlas icons): a pinnacle boss, a
                      boss in an Atlas map, any other boss encounter. A boss is no card in the index (the page
                      makes it out of data/bosses.json), so its cell is found by name: the sheet's `at`

A card never gets a picture that is not the one the game shows for it, or for the kind of thing it is. The ones
that have none in the files (achievements, acts, monster modifiers, item classes, our own mechanics and
interactions) keep their kind's mark (assets/app.js iconHTML).

Writes sprites/<sheet>.webp and sprites/<sheet>-1x.webp, the cells onto data/index.json ("ic", and the grid under
"sprites"), then the two parts the app loads (tools/appdata.py). Never a path to the art: the card carries its
cell and the sheet its grid.

    python tools/cardart.py
"""
import io
import json
import re
from pathlib import Path

from PIL import Image

import appdata
import gamepull
import lastgood
import sprites

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
CELL = (68, 68)        # two pixels per point of the 34 by 34 an <img> takes in the art box (assets/cards.css .card-ic img),
                       # so a row with a sheet's picture stands exactly as tall as a row with an item's
COLS = 16
QUALITY = 88
ATLAS = 'art/uiimages1.txt'   # the game's list of its interface pictures: name, file, box
UI = 'Art/2DArt/UIImages/InGame/'
LEGEND = UI + 'WorldMap/'
CONTENT = UI + 'AtlasScreen/AtlasIconContent/AtlasIconContent'

# the kinds this tool draws, each onto its own sheet
SHEETS = {'j': 'quests', 'l': 'trials', 'o': 'runes', 'r': 'areas', 's': 'pools', 'x': 'bosses'}

# the game's own map marks (WorldMapLegends: Town, VisitedWaypoint, ActPin; EndGamePin, EndGameWaypoint)
AREA = {'town': LEGEND + 'AreaNodeTown', 'wp': LEGEND + 'AreaNodeWaypoint', 'area': LEGEND + 'AreaNode',
        'map': UI + 'MapLegend/AreaNode', 'mapwp': UI + 'MapLegend/Waypoint'}
# the fight's own mark: the pinnacle pin, the Atlas "Powerful Map Boss" icon, the world map's "Boss Encounter"
BOSS = {'pinnacle': UI + 'MapPinsWindow/MapPinPopUpPinnacleBoss', 'map': CONTENT + 'MapBoss',
        'other': LEGEND + 'WorldMapContentBoss'}
# the pools, by the game table data/odds.json read them from: the Atlas icon of that content
POOL = {'ritual_rites': CONTENT + 'Ritual', 'ritual_altars': CONTENT + 'Ritual', 'strongboxes': CONTENT + 'StrongBox',
        'azmeri_spirits': CONTENT + 'AzmeriSpirit', 'atlas_corruption': CONTENT + 'Corruption'}
CLEANSED = CONTENT + 'Sanctification'   # the cleansed half of atlas_corruption: the Atlas's own cleansed icon


def load(name):
    return json.loads((DATA / name).read_text(encoding='utf-8'))


def atlas():
    """The game's interface pictures by name: (file, box), every name in lower case."""
    raw = gamepull.gamefiles([ATLAS]).get(ATLAS)
    if not raw:
        raise SystemExit('the game files hold no %s: nothing to cut the pictures from' % ATLAS)
    text = raw.decode('utf-16-le' if raw[1:2] == b'\x00' else 'utf-8').lstrip('﻿')
    out = {}
    for line in text.splitlines():
        m = re.match(r'^"([^"]+)" "([^"]+)" (\d+) (\d+) (\d+) (\d+)', line)
        if m:
            out[m.group(1).lower()] = (m.group(2).lower(), tuple(int(m.group(i)) for i in range(3, 7)))
    return out


def names(rows, key, art):
    """{name: art} off a table, the first row of a name that has art."""
    out = {}
    for r in rows:
        if r.get(key) and r.get(art) and r[key] not in out:
            out[r[key]] = r[art]
    return out


def wanted(index, bosses, areas, odds):
    """What each card's picture is: {(kind, key): art name}, key the card's id (a boss: its name)."""
    want = {}
    items = [it for it in index['items'] if it['k'] in SHEETS]
    quests = {r['Id']: r['Icon_DDSFile'] for r in gamepull.dat('Quest') if r.get('Icon_DDSFile')}
    trials = names(gamepull.dat('UltimatumModifiers'), 'Name', 'Icon')
    trials.update(names(gamepull.dat('SanctumPersistentEffects'), 'Name', 'Icon'))
    runes = {r['Id'] + ' Rune': r['RemnantArt'] for r in gamepull.dat('Expedition2Runes') if r.get('RemnantArt')}
    pools = {p['pool']: CLEANSED if 'cleansed' in (p.get('of') or '') else POOL.get(p.get('file'))
             for p in odds.get('pools') or []}
    town = {i for a in areas.get('areas') or [] if a.get('town') for i in a.get('id') or []}
    endgame = {a['n'] for a in areas.get('areas') or [] if a.get('act') == 'Endgame'}
    for it in items:
        k, key = it['k'], it['id']
        art = None
        if k == 'j':
            art = quests.get(key)
        elif k == 'l':
            art = trials.get(it['n'])
        elif k == 'o':
            art = runes.get(it['n'])
        elif k == 's':
            art = pools.get(it['n'])
        elif k == 'r':
            if key in town:
                art = AREA['town']
            elif it.get('act') == 'Endgame':
                art = AREA['mapwp' if it.get('wp') else 'map']
            else:
                art = AREA['wp' if it.get('wp') else 'area']
        if art:
            want[(k, key)] = art
    for b in bosses.get('bosses') or []:
        where = {a.get('name') for a in b.get('areas') or []}
        want[('x', b['name'])] = BOSS['pinnacle' if b.get('pinnacle') else 'map' if where & endgame else 'other']
    return want


def picture(art, place, files):
    """One picture off the game files: an interface picture cut out of its file by the game's own box, or a
    .dds of its own whole. None when the files do not hold it or it will not decode."""
    if art.lower() in place:
        f, (x1, y1, x2, y2) = place[art.lower()]
        box = (x1, y1, x2 + 1, y2 + 1)
    else:
        f, box = art.lower(), None
    raw = files.get(f)
    if not raw:
        return None
    try:
        im = Image.open(io.BytesIO(raw))
        im.load()
    except Exception:
        return None
    im = im.convert('RGBA')
    return im.crop(box) if box else im


def fit(im):
    """A picture into one cell: the empty margin the game's file leaves round it taken off, its shape kept, as
    large as the cell takes it, in the middle."""
    edge = im.getchannel('A').point(lambda v: 255 if v > 8 else 0).getbbox()
    if edge:
        im = im.crop(edge)
    cell = Image.new('RGBA', CELL)
    sc = min(CELL[0] / im.width, CELL[1] / im.height)
    w, h = max(1, round(im.width * sc)), max(1, round(im.height * sc))
    cell.alpha_composite(im.resize((w, h), Image.LANCZOS), ((CELL[0] - w) // 2, (CELL[1] - h) // 2))
    return cell


def sheet(name, arts, place, files):
    """The sheet of one kind: every picture once, in the order the cards first ask for it. {art: [col, row]}
    and the grid, or None where not one picture came."""
    cells, pics = {}, []
    for art in arts:
        if art in cells:
            continue
        im = picture(art, place, files)
        if im is None:
            continue
        cells[art] = [len(pics) % COLS, len(pics) // COLS]
        pics.append(fit(im))
    if not pics:
        return None, {}
    cols = min(COLS, len(pics))
    rows = -(-len(pics) // cols)
    out = Image.new('RGBA', (cols * CELL[0], rows * CELL[1]))
    for i, im in enumerate(pics):
        out.paste(im, ((i % cols) * CELL[0], (i // cols) * CELL[1]))
    f = name + '.webp'
    (ROOT / 'sprites').mkdir(exist_ok=True)
    out.save(ROOT / 'sprites' / f, 'WEBP', quality=QUALITY, method=6)
    grid = {'file': f, 'cw': CELL[0], 'ch': CELL[1], 'cols': cols, 'rows': rows, 'w': cols * CELL[0], 'h': rows * CELL[1]}
    sprites.make(grid)   # the small copy beside it, for a screen of one pixel per point
    return grid, cells


def main():
    index = load('index.json')
    want = wanted(index, load('bosses.json'), load('areas.json'), load('odds.json'))
    place = atlas()
    arts = sorted(set(want.values()))
    files = gamepull.gamefiles([place[a.lower()][0] if a.lower() in place else a for a in arts])
    by_sheet = {}
    for (k, key), art in want.items():
        by_sheet.setdefault(SHEETS[k], []).append(art)
    grids, cells = {}, {}
    for k, name in SHEETS.items():
        grid, got = sheet(name, by_sheet.get(name) or [], place, files)
        if grid:
            grids[name], cells[k] = grid, got
    said, n = [], 0
    for it in index['items']:
        if it['k'] in SHEETS and it['k'] != 'x':
            it.pop('ic', None)   # a picture the files no longer hold goes with them
            at = cells.get(it['k'], {}).get(want.get((it['k'], it['id'])))
            if at:
                it['ic'] = at
    for k, name in SHEETS.items():
        if name not in grids:
            said.append('%s none' % name)
            continue
        if k == 'x':   # the bosses are made on the page: their cells ride on the sheet, by name
            grids[name]['at'] = {key: cells[k][art] for (kk, key), art in want.items() if kk == k and art in cells[k]}
            got = len(grids[name]['at'])
            of = sum(1 for (kk, _) in want if kk == k)
        else:
            of = sum(1 for it in index['items'] if it['k'] == k)
            got = sum(1 for it in index['items'] if it['k'] == k and it.get('ic'))
        n += got
        said.append('%s %d of %d on %d pictures' % (name, got, of, len(cells[k])))
    index['sprites'] = {**{s: v for s, v in (index.get('sprites') or {}).items() if s not in SHEETS.values()}, **grids}
    body = json.dumps(index, ensure_ascii=False, separators=(',', ':'))
    lastgood.save(DATA / 'index.json', body)
    print('cardart: %d cards with the game\'s own picture · %s' % (n, ' · '.join(said)))
    appdata.write(index)


if __name__ == '__main__':
    main()
