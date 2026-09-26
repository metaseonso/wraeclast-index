"""The sprite sheets at the size a screen of one pixel per point draws them.

sprites/gems.webp and sprites/uniques.webp are the game's own art, one cell per gem or unique, laid out in the
grid data/index.json "sprites" describes (cell size, columns, rows). They came into this repo whole with the
drill-down page and nothing here rebuilds them: a new sheet is dropped in over the old one, with its grid in
the gems data (tools/sync.py reads it from there). After that, run this once:

    python tools/sprites.py

It writes sprites/<name>-1x.webp beside each sheet: every cell cut out on its own and shrunk to the box the app
draws an icon in (assets/app.js iconHTML: 34 by 38 points, the cell's shape kept), so no cell bleeds into the
next, in the same grid. The page asks for it on a screen of one pixel per point and keeps the full sheet for
every other screen (image-set); the cell arithmetic is the same for both, because the page sets the sheet's
drawn size itself. tools/appdata.py names the small sheet in data/index-core.json ("lo") when it is there, so
run tools/appdata.py after this (or any tool that runs it).

Lossy, with a lighter alpha: at 34 points nobody can tell, and it is under half the bytes.
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BOX = (34, 38)        # the icon box in assets/app.js iconHTML
QUALITY, ALPHA = 70, 50


def small(name):
    return name[:-len('.webp')] + '-1x.webp'


def make(sp):
    src = ROOT / 'sprites' / sp['file']
    sheet = Image.open(src).convert('RGBA')
    sc = min(BOX[0] / sp['cw'], BOX[1] / sp['ch'])
    cw, ch = -(-sp['cw'] * sc // 1), -(-sp['ch'] * sc // 1)   # whole pixels, never under the drawn size
    cw, ch = int(cw), int(ch)
    out = Image.new('RGBA', (sp['cols'] * cw, sp['rows'] * ch))
    for r in range(sp['rows']):
        for c in range(sp['cols']):
            cell = sheet.crop((c * sp['cw'], r * sp['ch'], (c + 1) * sp['cw'], (r + 1) * sp['ch']))
            out.paste(cell.resize((cw, ch), Image.LANCZOS), (c * cw, r * ch))
    dst = src.with_name(small(sp['file']))
    out.save(dst, 'WEBP', quality=QUALITY, alpha_quality=ALPHA, method=6)
    return '%s %dx%d, %d KB (the full sheet: %d KB)' % (dst.name, out.width, out.height,
                                                        dst.stat().st_size // 1024, src.stat().st_size // 1024)


def main():
    index = json.loads((ROOT / 'data' / 'index.json').read_text(encoding='utf-8'))
    for sp in (index.get('sprites') or {}).values():
        print('sprites/' + make(sp))


if __name__ == '__main__':
    main()
