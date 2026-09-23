"""The site's own art, made through OpenRouter's image models and kept as a plate the CSS can move.

The crest and the fog that hangs behind it were made this way once, by hand, and nothing wrote down how.
This does: every plate is a row in PLATES, so the one that made a picture is the one that can make it again,
and a plate nobody likes is a prompt to change rather than a file to hunt for.

What comes back is a picture on a black field, and the black has to become nothing so the plate can be laid
over anything. Two ways, because a gas and a badge are not the same thing:
  glow  the plate's own brightness is its alpha, so a wisp fades out the way it is painted. Gas.
  cut   only the black around the shape goes; the shape itself stays as solid as it was painted, so the dark
        metal of a letter is metal and not a hole. Lettering.
Nothing is traced by hand afterwards.

    python tools/art.py                 make every plate that is not there yet
    python tools/art.py cheat-gas-1     make one, whatever is there already
    python tools/art.py --all           make every plate again, over the top of what is there
    python tools/art.py --list          say what the plates are and which are made

The key is the last line of wi-secrets/WI_OPENROUTER_KEY.txt, or WI_OPENROUTER_KEY in the environment. It is
never printed and never passed on a command line.
"""
import base64
import io
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'assets' / 'brand'
SECRETS = Path(os.environ.get('WI_SECRETS', ROOT.parent / 'wi-secrets'))
API = 'https://openrouter.ai/api/v1/chat/completions'
MODEL = 'google/gemini-3-pro-image'
SITE = 'https://wraeclastindex.fyi'

# The look every plate is drawn in, so one hand made all of them. Said once here, not in every prompt.
LOOK = ('Dark fantasy game art in the style of Path of Exile: grim, painterly, no text, no letters, no logo, '
        'no watermark, no border, no frame. Pure black background, nothing else in the picture.')

# The badge the site is known by (assets/brand/logo-320.webp), in words, so lettering made here is the same
# hand as the crest: blackened metal, green stone lit from inside it, bone-white bevels, small red gems.
BADGE = ('Dark fantasy game logo in the style of Path of Exile, drawn as one piece of forged metal: letters '
         'cut from blackened dark metal with a pale bone-white bevelled edge, filled with cracked green stone '
         'lit from within, a few small dark red gems set into the metal, ornate gothic serif letterforms with '
         'sharp spurs. Pure black background, no frame, no border, no watermark, nothing else in the picture. '
         'The lettering fills the frame and is the whole picture.')

# Each plate: what it is for, and what it has to be a picture of. A plate is a texture the page moves — it is
# never a finished thing on its own, which is why every one of them is loose and off-centre rather than posed.
GLOW, CUT = 'glow', 'cut'
PLATES = {
    'cheat-gas-1': LOOK + ' A thick column of poisonous green smoke pouring straight down from the top of the '
                          'frame, heaviest and brightest where it enters at the top, spreading and thinning as '
                          'it falls, wisps curling outward at the bottom edges. Sickly toxic green, bright '
                          'where it is dense, fading to nothing at the edges.',
    'cheat-gas-2': LOOK + ' A wide rolling bank of poisonous green vapour spilling downward and outward, like '
                          'gas poured over a surface and spreading across it, heavy in the middle, tendrils '
                          'reaching left and right. Sickly toxic green, soft edges, fading to nothing.',
    'cheat-words': (CUT, BADGE + ' Two lines of capitals, centred, the first line reading exactly '
                    '"CHEAT CODE" and the second line reading exactly "ACTIVATED". Spelled exactly that way '
                    'and nothing else written anywhere.'),
    'cheat-gas-3': LOOK + ' Thin ragged streamers of poisonous green gas falling, broken and uneven, wisps and '
                          'tatters rather than a solid mass, some curling upward as they fall. Sickly toxic '
                          'green, very soft, most of the frame empty black.',
}


def key():
    v = os.environ.get('WI_OPENROUTER_KEY')
    if v:
        return v.strip()
    f = SECRETS / 'WI_OPENROUTER_KEY.txt'
    try:
        lines = [l.strip() for l in f.read_text(encoding='utf-8').splitlines() if l.strip()]
    except OSError:
        lines = []
    if not lines:
        print('no key: put it in %s, or set WI_OPENROUTER_KEY' % f, file=sys.stderr)
        sys.exit(1)
    return lines[-1]


def ask(prompt):
    """One picture from the model, as bytes. Whatever it sends back that is an image, the first of them."""
    body = json.dumps({'model': MODEL, 'modalities': ['image', 'text'],
                       'messages': [{'role': 'user', 'content': prompt}]}).encode('utf-8')
    req = urllib.request.Request(API, data=body, headers={
        'Authorization': 'Bearer ' + key(), 'Content-Type': 'application/json',
        'HTTP-Referer': SITE, 'X-Title': 'Wraeclast Index'})
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            d = json.loads(r.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        print('  the model answered %s: %s' % (e.code, e.read().decode('utf-8', 'replace')[:300]), file=sys.stderr)
        return None
    for c in d.get('choices') or []:
        for img in (c.get('message') or {}).get('images') or []:
            url = ((img or {}).get('image_url') or {}).get('url') or ''
            if url.startswith('data:'):
                return base64.b64decode(url.split(',', 1)[1])
    print('  nothing came back that was a picture: ' + json.dumps(d)[:300], file=sys.stderr)
    return None


def plate(raw, how=GLOW, width=1024):
    """The picture as the page needs it: the black gone, the rest kept the way that shape wants to be kept."""
    from PIL import Image
    im = Image.open(io.BytesIO(raw)).convert('RGB')
    if im.width != width:
        im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
    grey = im.convert('L')
    # cut: black is nothing, anything above a whisper is whole, with a short ramp between so no edge is a stair
    out = im.convert('RGBA')
    out.putalpha(grey.point(lambda v: 0 if v < 8 else min(255, (v - 8) * 12)) if how == CUT else grey)
    buf = io.BytesIO()
    out.save(buf, 'WEBP', quality=82, method=6)
    return buf.getvalue()


def make(name, over):
    f = OUT / (name + '.webp')
    if f.exists() and not over:
        print('  %-14s already there' % name)
        return True
    want = PLATES[name]
    how, prompt = want if isinstance(want, tuple) else (GLOW, want)
    raw = ask(prompt)
    if not raw:
        print('  %-14s nothing made' % name)
        return False
    b = plate(raw, how)
    f.write_bytes(b)
    print('  %-14s %d KB' % (name, len(b) // 1024))
    return True


def main(args):
    if '--list' in args:
        for n in PLATES:
            print('  %-14s %s' % (n, 'made' if (OUT / (n + '.webp')).exists() else 'not made'))
        return 0
    over = '--all' in args
    want = [a for a in args if a in PLATES] or list(PLATES)
    ok = 0
    for n in want:
        ok += 1 if make(n, over or n in args) else 0
    print('%d of %d' % (ok, len(want)))
    return 0 if ok == len(want) else 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
