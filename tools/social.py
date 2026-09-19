"""The link preview image (1200x630) for social sites and chat apps: assets/brand/social.png.

Made only from the existing brand files (crest, haze, fog bank) on the site's own dark ground,
with the name set in a serif from the system fonts. Nothing drawn by hand, no new art.

Usage:  python tools/social.py
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / 'assets' / 'brand'
W, H = 1200, 630
GROUND = (7, 8, 7)            # --ground
TEXT = (220, 227, 210)        # --text
MUTED = (152, 164, 142)       # --muted
FAINT = (102, 114, 94)        # --faint
GREEN = (140, 203, 63)        # --accent, poison green
BRONZE = (168, 132, 74)       # --bronze
FONTS = [r'C:\Windows\Fonts\BOOKOSB.TTF', r'C:\Windows\Fonts\georgiab.ttf',
         '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf']
FONTS_REG = [r'C:\Windows\Fonts\BOOKOS.TTF', r'C:\Windows\Fonts\georgia.ttf',
             '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf']


def font(paths, size):
    for p in paths:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default(size)


def glow(cx, cy, rx, ry, rgb, alpha):
    """A soft radial light, like the theme's miasma gradients."""
    y, x = np.mgrid[0:H, 0:W]
    d = np.clip(1 - np.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2), 0, 1) ** 2 * alpha
    layer = np.zeros((H, W, 4), np.uint8)
    layer[..., :3] = rgb
    layer[..., 3] = (d * 255).astype(np.uint8)
    return Image.fromarray(layer, 'RGBA')


def screen(base, layer, opacity, box):
    """Blend a texture in screen mode at a given opacity, the way the site's fog is drawn."""
    tex = Image.new('RGB', base.size, (0, 0, 0))
    a = layer.getchannel('A').point(lambda v: int(v * opacity))
    tex.paste(layer.convert('RGB'), box, a)
    return ImageChops.screen(base, tex)


def spaced(draw, xy, text, f, fill, tracking):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=f, fill=fill)
        x += draw.textlength(ch, font=f) + tracking
    return x


def main():
    img = Image.new('RGB', (W, H), GROUND)
    img = Image.alpha_composite(img.convert('RGBA'), glow(600, -120, 900, 520, (120, 190, 50), .10))
    img = Image.alpha_composite(img, glow(1200, 0, 620, 380, (179, 38, 30), .10)).convert('RGB')

    haze = Image.open(BRAND / 'haze.webp').convert('RGBA')
    bank = Image.open(BRAND / 'fog-bank.webp').convert('RGBA')
    logo = Image.open(BRAND / 'logo-320.webp').convert('RGBA')

    lx, ly = 166, (H - logo.height) // 2 + 6
    hz = haze.resize((720, int(haze.height * 720 / haze.width)))
    img = screen(img, hz, .30, (lx + logo.width // 2 - hz.width // 2, ly + 30))
    bk = bank.resize((620, int(bank.height * 620 / bank.width)))
    img = screen(img, bk, .22, (lx + logo.width // 2 - bk.width // 2, ly + logo.height - bk.height // 2 - 20))

    shadow = Image.new('RGBA', img.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 230), (lx, ly + 14), logo.getchannel('A'))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img = Image.alpha_composite(img.convert('RGBA'), shadow)
    img.alpha_composite(logo, (lx, ly))
    bk2 = bank.resize((560, int(bank.height * 560 / bank.width)))
    img = screen(img.convert('RGB'), bk2, .16, (lx + logo.width // 2 - bk2.width // 2, ly + logo.height - bk2.height // 2 + 10))

    d = ImageDraw.Draw(img)
    tx = 488
    big = font(FONTS, 66)
    sub = font(FONTS_REG, 29)
    small = font(FONTS_REG, 22)

    # the name: engraved capitals, INDEX lit in poison green
    title_y = 196
    lit = Image.new('RGBA', img.size, (0, 0, 0, 0))
    ld = ImageDraw.Draw(lit)
    spaced(ld, (tx, title_y + 84), 'INDEX', big, GREEN + (150,), 6)
    lit = lit.filter(ImageFilter.GaussianBlur(14))
    img = Image.alpha_composite(img.convert('RGBA'), lit).convert('RGB')
    d = ImageDraw.Draw(img)
    spaced(d, (tx, title_y), 'WRAECLAST', big, TEXT, 6)
    spaced(d, (tx, title_y + 84), 'INDEX', big, GREEN, 6)

    # forged hairline under the name
    hy = title_y + 186
    line = Image.new('RGBA', (560, 2), BRONZE + (255,))
    fade = np.linspace(0, 1, 560)
    fade = np.minimum(fade / .2, 1) * np.minimum((1 - fade) / .2, 1)
    line.putalpha(Image.fromarray((fade * 150).astype(np.uint8)[None, :].repeat(2, 0), 'L'))
    img.paste(line, (tx, hy), line)

    d = ImageDraw.Draw(img)
    d.text((tx, hy + 22), 'Path of Exile 2, made easier', font=sub, fill=MUTED)
    d.text((tx, hy + 60), 'for every kind of player', font=sub, fill=MUTED)
    d.text((tx, hy + 118), 'wraeclastindex.fyi', font=small, fill=FAINT)

    out = BRAND / 'social.png'
    img.save(out, optimize=True)
    print(out, out.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
