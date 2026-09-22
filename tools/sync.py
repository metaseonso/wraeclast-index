"""Sync the Wraeclast Index artifact into the site.

The artifact page (gems, uniques, passive tree) is the drill-down. This script:
  1. rewrites each unique's mod lines to the official ones (data/uniques.json, from tools/uniques.py),
     keeping the keyword links wherever the wording matches, and drops any line the game has no wording
     for (uniques.clean_lines), so no game-file text reaches a card
  2. copies the page to explore.html and adds the small bridge script that links it to the home page; the page's data
     goes to data/explore/ (see "the drill-down page's data, outside the page")
  3. builds data/index.json, the compact search index (with the base items, the Atlas and the currency the catalogue
     lacks, from tools/morecards.py; lineage support gems are marked "li"; our own mechanics cards, tools/mechanics.py),
     marks the phrases in each card's lines that name another card (tools/nodelinks.py), and writes its two parts
     the home page loads (tools/appdata.py)
  4. gives every card without a sprite an official game image (see "card images" below)

Usage:  python tools/sync.py path/to/artifact.html
"""
import gzip
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lastgood  # noqa: E402
from uniques import clean_lines  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BRIDGE = '<script src="assets/bridge.js" type="module"></script>'   # it reads the kind table (assets/kinds.js)
# On a phone the keyboard shrinks the page instead of covering it, so a card's own boxes stay in view
# (the card sheet is sized in dvh, assets/cards.css).
VIEWPORT_OLD = '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
VIEWPORT_NEW = '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover,interactive-widget=resizes-content">'
# For search engines and link previews: the page's own title (the artifact's sits in <body>, see TITLE),
# description, canonical address, preview card and structured data.
SEO = ('<title>PoE2 gems, uniques and passive tree · Wraeclast Index</title>'
       '<meta name="description" content="Full tables of every Path of Exile 2 gem, unique and passive: requirements, official mod lines, tags and the passive tree.">'
       '<link rel="canonical" href="https://wraeclastindex.fyi/explore"><meta name="theme-color" content="#070807">'
       '<meta property="og:type" content="website"><meta property="og:site_name" content="Wraeclast Index">'
       '<meta property="og:title" content="PoE2 gems, uniques and passive tree · Wraeclast Index">'
       '<meta property="og:description" content="Full tables of every Path of Exile 2 gem, unique and passive, from the game files.">'
       '<meta property="og:url" content="https://wraeclastindex.fyi/explore">'
       '<meta property="og:image" content="https://wraeclastindex.fyi/assets/brand/social.png">'
       '<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">'
       '<meta property="og:image:alt" content="Wraeclast Index"><meta name="twitter:card" content="summary_large_image">'
       '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage",'
       '"@id":"https://wraeclastindex.fyi/explore","url":"https://wraeclastindex.fyi/explore",'
       '"name":"PoE2 gems, uniques and passive tree","inLanguage":"en",'
       '"isPartOf":{"@type":"WebSite","@id":"https://wraeclastindex.fyi/#website","name":"Wraeclast Index","url":"https://wraeclastindex.fyi/"},'
       '"about":{"@type":"VideoGame","@id":"https://wraeclastindex.fyi/#game","name":"Path of Exile 2"}}</script>')
TITLE = '<title>Wraeclast Index</title>\n'   # the artifact's own title, in <body>: SEO's title takes its place
# In <head>, so the drill-down never paints in its old look first: the icon, the fonts (the site's own copies in
# assets/fonts, @font-face in theme.css; the two that paint first are preloaded), the shared card and theme styles,
# the drill-down's own additions and the forged-bronze look.
CSS = ('<link rel="stylesheet" href="assets/cards.css"><link rel="stylesheet" href="assets/theme.css">'
       '<link rel="stylesheet" href="assets/bridge.css"><link rel="stylesheet" href="assets/look.css">')
ICON = '<link rel="icon" type="image/png" sizes="64x64" href="assets/brand/favicon-64.png">'
FONTS = ('<link rel="preload" href="assets/fonts/ibmplexsans-latin.woff2" as="font" type="font/woff2" crossorigin>'
         '<link rel="preload" href="assets/fonts/cinzel-latin.woff2" as="font" type="font/woff2" crossorigin>')
HEAD = SEO + ICON + FONTS + CSS
HEAD_OLD = SEO + ICON + CSS   # the head before ticket 39, once its Google Fonts links are gone (GOOGLE_FONTS)
GOOGLE_FONTS = re.compile(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts\.(?:googleapis|gstatic)\.com[^"]*"(?: crossorigin)?>\n?')
# The header as the app draws it: the brand is a link home with the crest, then the app's own tabs. Everything the
# scripts fill in later is already there, the same size (the section tabs, the top search box, Suggest, the Patch
# notes label), so the header never jumps; the wisp above the crest loads after the page (assets/bridge.js).
MAST_OLD = '<h1 class="brand">Wraeclast <em>Index</em></h1>\n    <nav class="nav" id="nav" aria-label="Sections"></nav>'
NAV_BUTTONS = ''.join('<button type="button" data-k="%s" aria-pressed="%s">%s</button>' % (k, str(k == 'gems').lower(), label)
                      for k, label in (('gems', 'Gems'), ('uniques', 'Uniques'), ('tree', 'Passive tree')))


def mast(wisp, nav, boss=''):
    return ('<a href="./" class="brand-link"><h1 class="brand"><span class="mark" aria-hidden="true">' + wisp +
            '<img class="mark-logo" src="assets/brand/logo-64.webp" alt="" width="51" height="64"></span>Wraeclast <em>Index</em></h1></a>\n'
            '    <nav class="applinks" aria-label="Play"><a href="./#/"><i class="ti ti-search" aria-hidden="true"></i>Search</a><a href="./#/build"><i class="ti ti-build" aria-hidden="true"></i>Build</a><a href="./#/trade"><i class="ti ti-trade" aria-hidden="true"></i>Trade</a><a href="./#/farms"><i class="ti ti-farms" aria-hidden="true"></i>Farms</a></nav>\n'
            '    <div class="navgrp" role="group" aria-label="Look up"><nav class="applinks" aria-label="Tools"><a href="./#/craft"><i class="ti ti-craft" aria-hidden="true"></i>Craft</a><a href="./#/currency"><i class="ti ti-currency" aria-hidden="true"></i>Currency</a></nav>'
            '<nav class="nav" id="nav" aria-label="Sections">' + nav + '</nav>'
            '<nav class="applinks" aria-label="Atlas"><a href="./#/atlas"><i class="ti ti-atlas" aria-hidden="true"></i>Atlas</a>' + boss +
            '</nav></div>')


BOSS_LINK = '<a href="./#/bosses"><i class="ti ti-bosses" aria-hidden="true"></i>Bosses</a>'
WISP = '<img class="mark-wisp" data-src="assets/brand/wisp-b.webp" alt="" decoding="async">'
MAST_NEW = mast(WISP, NAV_BUTTONS, BOSS_LINK)
MAST_NOBOSS = mast(WISP, NAV_BUTTONS)   # the header before the Bosses tab had a way in
MAST_PREV = mast('<img class="mark-wisp" src="assets/brand/wisp-b.webp" alt="" decoding="async" fetchpriority="low">', '')
CL_OLD = '<button class="clbtn" id="clbtn" type="button">Patch notes</button>'
# The keybindings button (assets/keys.js), the same markup as in index.html.
KEYS_BTN = ('<button class="keysbtn" id="keysbtn" type="button" aria-haspopup="dialog" aria-label="Keybindings" title="Keybindings">'
            '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2" y="5" width="16" height="10.5" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/>'
            '<path d="M5.6 8.6h.1M8.6 8.6h.1M11.4 8.6h.1M14.4 8.6h.1M6.5 12.1h7" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg></button>')
# the top search box as assets/app.js mountTopSearch() writes it (it keeps this one), and the Suggest button (assets/suggest.js)
TOPSEARCH = ('<div class="topsearch" id="topsearch"><div class="tsearch"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>'
             '<path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'
             '<input type="search" placeholder="Search the index" autocomplete="off" spellcheck="false" aria-label="Search the index" '
             'role="combobox" aria-expanded="false" aria-autocomplete="list"><kbd aria-hidden="true">/</kbd>'
             '<div class="tsearch-drop" role="listbox" hidden></div></div></div>')
SUGGEST_BTN = '<button id="suggestbtn" type="button" class="suggestbtn" title="Send an idea or report a problem">Suggest</button>'
CL_BTN = '<button class="clbtn" id="clbtn" type="button">Patch notes <span class="ct wait">v0.00</span></button>'   # assets/notes.js writes the version
CL_NEW = TOPSEARCH + '\n    ' + SUGGEST_BTN + '\n    ' + KEYS_BTN + '\n    ' + CL_BTN
CL_PREV = '<div class="topsearch" id="topsearch"></div>\n    ' + KEYS_BTN + '\n    ' + CL_OLD

RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}(?:\s*=\s*-?\d+)?|\{[^}\s]{1,80}\}')


def block(html, bid):
    """One of the artifact's data blocks: in the page (the artifact), or in its file (explore.html, see externalize)."""
    m = re.search(r'<script id="%s" type="application/json">(.*?)</script>' % bid, html, re.S)
    if m:
        return json.loads(m.group(1))
    f = data_files(html).get(bid)
    if f and (ROOT / f).exists():
        return json.loads((ROOT / f).read_text(encoding='utf-8'))
    sys.exit('missing data block: ' + bid)


def plain(t):
    """Game keyword markup [Id|Shown] or [Id] to plain words."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    t = re.sub(r'\[([^\]]+)\]', r'\1', t)
    return re.sub(r'\s+', ' ', t).strip()


def plain_lines(t):
    """Game text over several lines to plain lines."""
    return [plain(x) for x in (t or '').split('\n') if x.strip()]


# ---- leftover game markers ----
# The game files mark text that is not live with [DNT] or [DNT-UNUSED] ("do not translate"). A gem whose NAME
# carries the marker is never a card (CUT, the same test in explore.html and worker/seo.js), but the marker also
# sits in the description of gems whose name is clean, and a description is printed on the card, on the item page
# and in llms-full.txt. Each of those is a decision, so each is written down here by gem id:
#   drop   not in the game. The row goes, the same way a [DNT] name goes.
#   keep   in the game, and the wording is the real one: the marker goes, the words stay.
#   blank  in the game, but the files hold no wording at all (the description is the placeholder "Description"):
#          the description goes and the card stays, like every other gem the files describe nothing for.
# Checked against the RePoE export, poe2db and the official trade site's own item lists.
# A gem that carries a marker and is not on this list stops the build (clean_gems), and so does a marker that
# reaches the search index (build_index). Shipping one is never the answer.
CUT = re.compile(r'^\[DNT|^Removed Skill$')
DNT = re.compile(r'\bDNT[\w-]*')
DNT_TAG = re.compile(r'\[DNT[\w-]*\]\s*')
# The fields of a card a player reads. Every one is checked for raw game code and for a leftover marker
# (build_index below, and tools/gamelib.py for the cards it adds after this tool has run).
SHOWN_FIELDS = ('n', 's', 't', 'ls', 'pr', 'tags', 'rec', 'o', 'nt', 'src')
DNT_GEMS = {
    'SupportGemAtzirisCall':    ('drop', 'the trade site has no such lineage gem, and the skill it triggers is a placeholder'),
    'SupportGemDreamersKnell':  ('drop', 'the trade site has no such lineage gem; its description is the codename "Ezomyte Four"'),
    'SupportGemKnightsAnthem':  ('blank', 'a real lineage gem on the trade site, but the files hold no description for it'),
    'SupportGemGreatwoodTwo':   ('keep', 'a real support gem: the trade site lists it under this name'),
    'SupportGemNadir':          ('keep', 'a real support gem'),
    'SupportGemFusillade':      ('keep', 'a real support gem'),
    'SkillGemDarkTempest':      ('keep', 'a real skill gem'),
    'SkillGemHazardousHoldout': ('keep', 'a real skill gem'),
}


def strip_dnt(v):
    """Every [DNT] tag out of a gem's text, and the marker itself out of its keyword list."""
    if isinstance(v, str):
        return DNT_TAG.sub('', v)
    if isinstance(v, list):
        return [strip_dnt(x) for x in v if not (isinstance(x, str) and DNT.fullmatch(x))]
    if isinstance(v, dict):
        return {k: strip_dnt(x) for k, x in v.items()}
    return v


def clean_gems(gems):
    """Every gem whose text still carries a game marker, settled by DNT_GEMS. Returns (dropped, cleaned) names."""
    kept, dropped, cleaned = [], [], []
    for g in gems['gems']:
        if CUT.match(g['n']) or not DNT.search(json.dumps(g, ensure_ascii=False)):
            kept.append(g)
            continue
        what, _ = DNT_GEMS.get(g['id'], (None, None))
        if not what:
            sys.exit('%s has a game marker in text a player reads: %r\n'
                     '  Say what it is in DNT_GEMS in tools/sync.py: "drop" if it is not in the game, "keep" if it '
                     'is and the wording is real, "blank" if it is and the files hold no wording.'
                     % (g['n'], plain(g.get('txt', ''))[:100] or g['n']))
        if what == 'drop':
            dropped.append(g['n'])
            # name and keywords only, no text: nothing draws these, but tools/kwuse.py counts them so its check
            # against the artifact's own numbers still adds up
            gems.setdefault('dropped', []).append({'n': g['n'], 'kw': strip_dnt(g.get('kw') or [])})
            continue
        if what == 'blank':
            g.pop('txt', None)
        for k in list(g):
            g[k] = strip_dnt(g[k])
        left = DNT.search(json.dumps(g, ensure_ascii=False))
        if left:
            sys.exit('%s still carries a game marker after cleaning: %r' % (g['n'], left.group(0)))
        cleaned.append(g['n'])
        kept.append(g)
    gems['gems'] = kept
    return dropped, cleaned


def with_clean_gems(html):
    gems = block(html, 'gemdata')
    dropped, cleaned = clean_gems(gems)
    return put(html, 'gemdata', gems), dropped, cleaned


# ---- official unique lines (data/uniques.json, from tools/uniques.py) ----
# A number, a range, or a signed range: 5, +(40-60), -(5-1), (4.01-5.48)
NUM = re.compile(r'[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?')


def skeleton(line):
    """A mod line with every number replaced, so a rolled line and its official range compare equal."""
    return NUM.sub('#', plain(line))


def transfer(marked, official):
    """The official numbers, written into the line that already carries the keyword links."""
    nums = iter(NUM.findall(official))
    parts = re.split(r'(\[[^\]]*\])', marked)
    return ''.join(p if p.startswith('[') else NUM.sub(lambda m: next(nums, m.group(0)), p) for p in parts)


def load_official():
    f = ROOT / 'data' / 'uniques.json'
    if not f.exists():
        return {}, {}
    o = json.loads(f.read_text(encoding='utf-8'))
    by_name = {}
    for k, v in o.items():
        by_name.setdefault(k.split(' | ')[0], []).append(v)
    return o, by_name


def official_for(u, o, by_name):
    """The official entry for a unique: same name and base, else the base variant it was forged from."""
    key = u['n'] + ' | ' + (u.get('b') or '')
    if key in o:
        return o[key], True
    b = re.sub(r'^(Runeforged|Runemastered) ', '', u.get('b') or '')
    if u['n'] + ' | ' + b in o:
        return o[u['n'] + ' | ' + b], False
    c = by_name.get(u['n'])
    return (c[0], False) if c and len(c) == 1 else (None, False)


def officialize(uq):
    """Rewrite each unique's mod lines to the official ones, in place. Returns how many changed."""
    o, by_name = load_official()
    changed = 0
    for u in uq['items']:
        for f in ('im', 'ex'):   # the drill-down's own lines carry game-file text too, official entry or not
            if u.get(f):
                u[f] = clean_lines(u[f])
        off, exact = official_for(u, o, by_name)
        if not off:
            continue
        old = (u.get('im') or []) + (u.get('ex') or [])
        used, lines = set(), []
        for ol in off['ls']:
            sk = skeleton(ol)
            hit = next((i for i, a in enumerate(old) if i not in used and skeleton(a) == sk), None)
            if hit is None:
                lines.append(ol)
            else:
                used.add(hit)
                lines.append(transfer(old[hit], ol))
        ni = off.get('ni', 0)
        im, ex = lines[:ni], lines[ni:]
        if im != (u.get('im') or []) or ex != (u.get('ex') or []):
            changed += 1
        u['im'], u['ex'] = im, ex
        if exact and off.get('rq') and off['rq'][0]:
            u['lv'] = off['rq'][0]
    return changed


def put(html, bid, obj):
    m = re.search(r'(<script id="%s" type="application/json">)(.*?)(</script>)' % bid, html, re.S)
    return html[:m.start(2)] + json.dumps(obj, ensure_ascii=False, separators=(',', ':')) + html[m.end(2):]


def with_official_uniques(html):
    uq = block(html, 'uqdata')
    n = officialize(uq)
    return put(html, 'uqdata', uq), n


def first_sentence(t, limit=150):
    t = plain(t)
    m = re.match(r'(.+?[.!?])(\s|$)', t)
    out = m.group(1) if m and len(m.group(1)) <= limit else t
    return out if len(out) <= limit else out[:limit - 1].rstrip() + '…'


# ---- card images ----
# Gems and most uniques show a sprite ("ic"). Every other card gets "img": a short code "<key>:<path>"
# that the page expands with the index's "imgs" table. All of it is official game art, best source first:
#   p  web.poecdn.com, the game's own image server: unique icons from poe.ninja's price lists, lineage
#      support gems from the official trade site's static list, and the Atlas items' icons in data/atlas.json.
#      Those links are signed: copied, never built.
#   n  assets.poe.ninja: passive skill icons, at the node's icon path in the official passive tree (and the
#      Atlas tree), in lower case as webp (the names poe.ninja's own tree uses). A node with no icon gets the blank socket.
#   r  repoe-fork.github.io: the 2D art exported from the game files, for items the two above lack (every base
#      item, the extra currency cards), and the one book (the in-game Book of Skill) on every keyword card.
# Each list is fetched at most once per run (cached for a day in tools/cache/). Each link built from a
# path is checked once (it must answer with an image) and remembered in tools/cache/checked.json.
REPOE = 'https://repoe-fork.github.io/poe2/'
IMGS = {'p': 'https://web.poecdn.com/gen/image/', 'n': 'https://assets.poe.ninja/poe2/tree/', 'r': REPOE}
KEYWORD_IMG = 'r:Art/2DItems/QuestItems/SkillBook.webp'
BLANK_NODE = 'n:passives/masteryblank.webp'   # the tree's own art for a node with no picture (a jewel socket)
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
CACHE = ROOT / 'tools' / 'cache'
NINJA = 'https://poe.ninja/poe2/api/economy/stash/current/item/overview?'
STASH = ['UniqueWeapons', 'UniqueArmours', 'UniqueAccessories', 'UniqueFlasks', 'UniqueCharms',
         'UniqueJewels', 'UniqueSanctumRelics', 'UniqueTablets', 'PrecursorTablets']
TRADE_STATIC = 'https://www.pathofexile.com/api/trade2/data/static'


def remote(name, url):
    """A remote JSON list, kept a day in tools/cache/<name>. On failure the last copy, else None."""
    f = CACHE / name
    if f.exists() and time.time() - f.stat().st_mtime < 86400:
        return json.loads(f.read_bytes())
    time.sleep(1)   # one request a second at most
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': 'application/json', 'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(req, timeout=90) as r:
            body = r.read()
            if r.headers.get('Content-Encoding') == 'gzip':
                body = gzip.decompress(body)
        json.loads(body)
        CACHE.mkdir(parents=True, exist_ok=True)
        f.write_bytes(body)
    except Exception as e:
        print('  could not fetch', url, e, file=sys.stderr)
        if not f.exists():
            return None
    return json.loads(f.read_bytes())


CHECKED = CACHE / 'checked.json'
_checked = set(json.loads(CHECKED.read_text(encoding='utf-8'))) if CHECKED.exists() else set()


def shows(code):
    """True if the image code's link answers with an image. Good links are remembered."""
    key, path = code.split(':', 1)
    url = IMGS[key] + path
    if url in _checked:
        return True
    time.sleep(0.25)
    try:
        with urllib.request.urlopen(urllib.request.Request(url, method='HEAD', headers={'User-Agent': UA}), timeout=30) as r:
            ok = r.status == 200 and r.headers.get_content_type().startswith('image/')
    except Exception:
        ok = False
    if ok:
        _checked.add(url)
    return ok


def game_art(dds):
    """A game file's art path (Art/.../X.dds) -> its image code on RePoE."""
    return 'r:' + urllib.parse.quote(dds[:-4]) + '.webp' if dds and dds.lower().endswith('.dds') else None


def image_sources():
    """Name -> image code tables for each kind of card, from the lists above."""
    src = {'unique': {}, 'gem': {}, 'art': {}, 'unique_art': {}, 'node': {}}
    market = ROOT / 'data' / 'market.json'
    league = json.loads(market.read_text(encoding='utf-8')).get('league') if market.exists() else None
    for typ in STASH if league else []:
        d = remote('ninja-%s.json' % typ, NINJA + urllib.parse.urlencode({'league': league, 'type': typ})) or {}
        for l in d.get('lines') or []:
            if l.get('name') and (l.get('icon') or '').startswith(IMGS['p']):
                code = 'p:' + l['icon'][len(IMGS['p']):]
                src['unique'].setdefault((l['name'], l.get('baseType')), code)
                src['unique'].setdefault((l['name'], None), code)
    for g in (remote('trade-static.json', TRADE_STATIC) or {}).get('result') or []:
        for e in g.get('entries') or []:
            if g.get('id') == 'LineageSupportGems' and (e.get('image') or '').startswith('/gen/image/'):
                src['gem'][e['text']] = 'p:' + e['image'][len('/gen/image/'):]
    for path, b in (remote('repoe-base_items.json', REPOE + 'base_items.min.json') or {}).items():
        code = game_art((b.get('visual_identity') or {}).get('dds_file'))
        if code and b.get('release_state') == 'released' and 'Gem' in (b.get('item_class') or ''):
            src['art'].setdefault(path.rsplit('/', 1)[-1], code)   # by gem id
            src['art'].setdefault(b['name'], code)
    for u in (remote('repoe-uniques.json', REPOE + 'uniques.min.json') or {}).values():
        code = game_art((u.get('visual_identity') or {}).get('dds_file'))
        if code and not u.get('is_alternate_art'):
            src['unique_art'].setdefault(u['name'], code)
    tree = remote('repoe-tree.json', REPOE + 'passive_skill_trees/Default.min.json') or {}
    for p in (tree.get('passives') or {}).values():
        icon = re.sub(r'^Art/2DArt/SkillIcons/', '', p.get('icon') or '', flags=re.I)
        if icon.lower().endswith('.dds') and not icon.startswith('Art/'):
            src['node'][p['id']] = 'n:' + urllib.parse.quote(icon[:-4].lower()) + '.webp'
    return src


def card_image(it, src, base=None):
    """The first image code that shows, for a card without a sprite."""
    if '_try' in it:   # the new kinds (tools/morecards.py) bring their own candidates
        tries = it.pop('_try') + ([BLANK_NODE] if it['k'] == 'a' and it.get('at') == 'tree' else [])
    elif it['k'] == 'w':
        tries = [KEYWORD_IMG]
    elif it['k'] == 'p':
        tries = [src['node'].get(it['id']), BLANK_NODE]
    elif it['k'] == 'u':
        tries = [src['unique'].get((it['n'], base)), src['unique'].get((it['n'], None)), src['unique_art'].get(it['n'])]
    else:
        tries = [src['gem'].get(it['n']), src['art'].get(it['id']), src['art'].get(it['n'])]
    # signed links came straight from the game's server; links built from a path are checked
    return next((c for c in tries if c and (c.startswith('p:') or shows(c))), None)


KWREF = re.compile(r'\[([A-Za-z][A-Za-z0-9_]*)(?:\|([^\]]*))?\]')


def build_index(html):
    gems = block(html, 'gemdata')
    uq = block(html, 'uqdata')
    tr = block(html, 'trdata')
    kw = block(html, 'kwdata')
    emo = tr.get('emotions') or {}
    reqs = json.loads((ROOT / 'data' / 'reqs.json').read_text(encoding='utf-8'))['bases']
    items = []

    # keywords: which ones each gem, unique and passive mentions (the game text marks them [Id] or [Id|words]),
    # and the words each keyword shows as, so other text (atlas, currency) can be matched too
    def refs(obj):
        return sorted({m.group(1) for m in KWREF.finditer(json.dumps(obj, ensure_ascii=False)) if m.group(1) in kw})
    forms = {}
    for blob in (gems, uq, tr, kw):
        for m in KWREF.finditer(json.dumps(blob, ensure_ascii=False)):
            k = m.group(1)
            if k in kw:
                forms.setdefault(k, set()).add(((m.group(2) or kw[k].get('t') or k)).strip())

    colour = {'r': 'Strength', 'g': 'Dexterity', 'b': 'Intelligence', 'w': ''}
    kind = {'active': 'Skill gem', 'spirit': 'Spirit gem', 'support': 'Support gem'}
    for g in gems['gems']:
        if CUT.match(g['n']):
            continue
        what = 'Lineage support gem' if g.get('lin') and g['t'] == 'support' else kind.get(g['t'], 'Gem')   # the game files mark lineage gems
        sub = what + (' · ' + colour[g['c']] if colour.get(g.get('c')) else '')
        tags = [plain(gems['gem_tags'][t]) for t in g.get('tg', []) if gems['gem_tags'].get(t)]
        it = {'k': 'g', 'id': g['id'], 'n': g['n'], 's': sub, 't': plain(g.get('txt', '')), 'ic': g.get('ic'),
              'q': ' '.join(g.get('tg', [])), 'tags': tags}
        if g['t'] != 'support':   # attribute weights; the page turns them into requirements at any gem level
            it['w'] = [g['rq'].get('strength', 0), g['rq'].get('dexterity', 0), g['rq'].get('intelligence', 0)]
        if g.get('cast'):
            it['ct'] = g['cast']
        for res, v in (g.get('cost') or {}).items():
            v = v[19] if isinstance(v, list) and len(v) >= 20 else (v[-1] if isinstance(v, list) and v else v)
            if v:
                it['cost'] = [v, res]
                break
        if (g.get('res') or {}).get('spirit') is not None:
            sp = g['res']['spirit']
            it['sp'] = sp[19] if isinstance(sp, list) and len(sp) >= 20 else sp
        if refs(g):
            it['kw'] = refs(g)
        if what.startswith('Lineage'):
            it['li'] = 1
        items.append(it)

    uniq, seen_u = [], set()
    for u in uq['items']:   # the files repeat a few unlisted uniques verbatim
        sig = (u['n'], u.get('b'), tuple(u.get('ex') or []))
        if sig not in seen_u:
            seen_u.add(sig)
            uniq.append(u)
    names, ubase = {}, {}
    for u in uniq:
        names[u['n']] = names.get(u['n'], 0) + 1
    for u in uniq:
        text = u.get('ex') or u.get('im') or []
        uid = u['n'] if names[u['n']] == 1 else u['n'] + ' | ' + (u.get('b') or '')   # variants share a name
        ubase[uid] = u.get('b')
        it = {'k': 'u', 'id': uid, 'n': u['n'], 's': ' · '.join(x for x in (u.get('b'), plain(u.get('c', ''))) if x),
              'ic': u.get('ic'), 'q': u.get('g', ''),
              'ls': [plain(y) for x in (u.get('im') or []) + (u.get('ex') or []) for y in x.split('\n') if y.strip()]}
        base = reqs.get(u.get('b') or '')
        lv = u.get('lv') or (base[0] if base else 0)
        if base or lv:
            it['rq'] = [lv] + (base[1:] if base else [0, 0, 0])
        ni = len([y for x in (u.get('im') or []) for y in x.split('\n') if y.strip()])
        if ni:
            it['ni'] = ni   # the first ni lines are implicit mods (the Trade button needs to know)
        if u.get('pr'):
            it['pr'] = [plain(x) for x in u['pr']]
        if u.get('cor'):
            it['cor'] = 1
        if refs(u):
            it['kw'] = refs(u)
        items.append(it)

    seen = set()
    for p in tr['passives']:
        if p.get('k') not in ('keystone', 'notable', 'anoint') or not p.get('t'):
            continue
        if p['n'].startswith('[DNT') or (p['n'], p.get('a')) in seen:
            continue
        seen.add((p['n'], p.get('a')))
        label = p['k'].capitalize() + (' · ' + p['a'] if p.get('a') else '')
        it = {'k': 'p', 'id': p['id'], 'n': p['n'], 's': label, 'q': p.get('reg', ''),
              'ls': [plain(y) for x in p['t'] for y in x.split('\n') if y.strip()]}
        if p.get('a'):
            it['asc'] = p['a']
        elif p.get('reg'):
            it['reg'] = p['reg']
        if p.get('rec'):
            it['rec'] = [emo.get(r, {}).get('name', '') for r in p['rec']]
            if p.get('ac'):
                it['ac'] = p['ac']
        if refs(p):
            it['kw'] = refs(p)
        items.append(it)

    # a keystone is its own keyword: its card stands for both. Other same-name cards (a Shock support gem and
    # the Shock ailment) are different things, so the keyword keeps its own card.
    taken = {it['n'].lower() for it in items if it['k'] == 'p' and it['s'].startswith('Keystone')}
    kwx = {}   # keyword -> the keystone card the app opens for it
    for k, v in kw.items():
        if not v.get('t') or not v.get('d'):
            continue
        if v['t'].startswith('[DNT'):   # a placeholder keyword, like a [DNT] gem or passive name: no card
            continue
        if v['t'].lower() in taken:
            kwx[k] = v['t']
            continue
        f = sorted(x for x in forms.get(k, ()) if len(x) >= 3 and x != v['t'])[:8]
        it = {'k': 'w', 'id': k, 'n': v['t'], 's': 'Keyword', 't': plain(v['d']), 'use': v.get('n') or {}}
        if f:
            it['f'] = f
        if refs(v.get('d', '')):
            it['kw'] = [x for x in refs(v.get('d', '')) if x != k]
        items.append(it)

    # base items, the Atlas, and the currency the catalogue lacks (tools/morecards.py)
    import morecards
    items += morecards.build(items, {'remote': remote, 'plain': plain, 'refs': refs, 'game_art': game_art, 'kw': kw,
                                     'REPOE': REPOE, 'IMGS': IMGS, 'plain_lines': plain_lines})

    # our own cards: the mechanics the game never writes down (tools/mechanics.py). Not game text, and they say so.
    import mechanics
    items += mechanics.build()

    src = image_sources()
    for it in items:   # every card shows a picture: its sprite, else official game art
        if not it.get('ic'):
            img = card_image(it, src, ubase.get(it['id']) if it['k'] == 'u' else None)
            if img:
                it['img'] = img
    CACHE.mkdir(parents=True, exist_ok=True)
    CHECKED.write_text(json.dumps(sorted(_checked), indent=0), encoding='utf-8')

    for it in items:  # the standard: nothing in the search index may read as game code
        it.pop('_try', None)
        for f in SHOWN_FIELDS:
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if x and RAW.search(x):
                    sys.exit('raw game code in %s %r: %r' % (f, it['n'], x))
                if x and DNT.search(x):
                    sys.exit('leftover game marker in %s %r: %r (see DNT_GEMS in tools/sync.py)' % (f, it['n'], x))
        for f in ('ls', 'pr', 'tags', 'o'):
            if f in it and not it[f]:
                del it[f]
        if not it.get('ic'):
            it.pop('ic', None)
        if not it.get('q'):
            it.pop('q', None)

    keys = [it['k'] + ':' + it['id'] for it in items]
    dup = {x for x in keys if keys.count(x) > 1}
    if dup:
        sys.exit('duplicate card keys: %s' % sorted(dup)[:10])
    index = {'v': gems['meta'].get('game_version'), 'gen': gems['meta'].get('generated'),
             'sprites': gems.get('sprites'), 'imgs': IMGS, 'kwx': kwx, 'items': items}
    import nodelinks   # the doors inside each card's own lines: a phrase naming another card
    nodelinks.report(index, nodelinks.attach(index))
    return index


# Prices on the drill-down page: never the snapshot baked into the artifact (poe.ninja), only the site's live file
# (/data/market.json: uniques from real trade listings, emotions from the Currency Exchange; ?part=now is every price
# without the day-by-day history, worker/prices.js). The baked numbers are removed; the page's own script waits (at
# most 3 s) for the live file and fills them in before it draws, so its price sorting and filters work on real prices.
LIVE = ('window.WI_MARKET=(window.WI_DATA&&WI_DATA.one||Promise.resolve()).then(function(){return fetch("data/market.json?part=now")})'   # after the Gems table's files
        '.then(function(r){return r.ok?r.json():null}).catch(function(){return null});'
        'window.wiLive=async function(UQ,TR){var m=await Promise.race([window.WI_MARKET,new Promise(function(r){setTimeout(function(){r(null)},3000)})]);'
        'if(!m||!m.items)return;var I=m.items;(UQ.items||[]).forEach(function(u){var p=I["u:"+u.n+" | "+u.b]||I["u:"+u.n];'
        'if(p&&p.v!=null){u.v=p.v;u.ls=p.ls;if(p.ch!=null)u.ch=p.ch;}});var E=(TR&&TR.emotions)||{};Object.keys(E).forEach(function(k){'
        'var p=I["c:"+E[k].name];if(p&&p.v!=null){E[k].v=p.v;if(p.ch!=null)E[k].ch=p.ch;}});};')
LIVE_TAG = re.compile(r'<script>window\.WI_MARKET=.*?</script>', re.S)   # the price script before ticket 39

# ---- the drill-down page's data, outside the page ----
# The artifact carries its data inline (<script type="application/json"> blocks, 4.7 MB). The site's page keeps only the
# page: each block goes to data/explore/<name>.<hash>.json (a new name whenever it changes, so browsers keep the files a
# year and the page never mixes two versions), fetched from <head> while the page paints (DATA_JS): the Gems table's
# files first (FIRST), the rest right after them. The page's own scripts run in their order, each once the files it
# reads are in (WI_DATA.run). Until the page has drawn its table (assets/bridge.js calls WI_DATA.show), the space under
# the header stays empty, so nothing jumps.
# cldata (the artifact's old changelog) is dropped: Patch notes come from data/changelog.json (assets/notes.js).
# `python tools/sync.py explore.html` works too: inline() puts the page back in the artifact's form first.
EXPLORE = ROOT / 'data' / 'explore'
DATA_FILES = {'gemdata': 'gems', 'uqdata': 'uniques', 'trdata': 'tree', 'kwdata': 'keywords', 'jwdata': 'jewels'}
DROP_BLOCKS = ('cldata',)
FIRST = ('kwdata', 'gemdata')   # the Gems table, the page's first view
BLOCK = re.compile(r'<script id="(\w+)" type="application/json">(.*?)</script>\n?', re.S)
PARSE = re.compile(r"JSON\.parse\(document\.getElementById\('(\w+)'\)\.textContent\)")
RUN = re.compile(r'<script>WI_DATA\.run\((\[[^\]]*\]),function\(\)\{(.*?)\}\);</script>', re.S)
DATA_TAG = re.compile(r'<script id="wi-data">.*?</script>', re.S)
DATA_JS = ('<script id="wi-data">/* the page\'s data (tools/sync.py): every file at once; each script runs in order once its files are in */\n'
           '(function(){var F=__FILES__,W=__FIRST__;var D=window.WI_DATA={files:F},q=Promise.resolve(),got={};'
           'document.documentElement.classList.add("wi-wait");'
           'function load(b,n){return fetch(F[b]).then(function(r){if(!r.ok)throw Error(F[b]+" "+r.status);return r.json()})'
           '.catch(function(e){if(n)throw e;return load(b,1)})}'
           'function get(b){return got[b]||(got[b]=load(b,0).then(function(o){return D[b]=o}))}'
           'D.one=Promise.all(W.filter(function(b){return F[b]}).map(get)).then(null,function(){});'
           'D.one.then(function(){for(var b in F)get(b)});'   # the rest once the first view's files are in
           'D.run=function(need,fn){var p=D.q=q=q.then(function(){return Promise.all(need.map(get))}).then(fn).catch(function(e){console.error(e)});'
           'if(need.indexOf("gemdata")>=0)D.gems=p;return p};'
           'D.show=function(){document.documentElement.classList.remove("wi-wait")};'
           'addEventListener("DOMContentLoaded",function(){q.then(function(){setTimeout(D.show,1500)})});'   # in case assets/bridge.js never runs
           '})();\n' + LIVE + '</script>')


def data_files(html):
    """The page's data files, as DATA_JS lists them: {block id: path}."""
    m = re.search(r'var F=(\{[^{}]*\})[,;]', html)
    return json.loads(m.group(1)) if m else {}


def inline(html):
    """An explore.html this script wrote, back in the artifact's form: the data blocks in the page, plain scripts."""
    files = data_files(html)
    html = LIVE_TAG.sub('', DATA_TAG.sub('', html))
    if not files:
        return html

    def unwrap(m):
        body = re.sub(r'\bWI_DATA\.(\w+)\b', lambda x: "JSON.parse(document.getElementById('%s').textContent)" % x.group(1), m.group(2))
        return '<script>' + re.sub(r'^(\s*)return \(async function\(\)\{', r'\1(async function(){', body, count=1) + '</script>'
    html = RUN.sub(unwrap, html)
    at = html.index('<script>', html.index('<body>'))
    blocks = ''.join('<script id="%s" type="application/json">%s</script>\n' % (b, (ROOT / f).read_text(encoding='utf-8'))
                     for b, f in files.items())
    return html[:at] + blocks + html[at:]


def externalize(html):
    """The data blocks out of the page into data/explore/, and the page's scripts made to wait for them."""
    EXPLORE.mkdir(parents=True, exist_ok=True)
    files = {}
    for m in BLOCK.finditer(html):
        bid = m.group(1)
        if bid in DROP_BLOCKS:
            continue
        if bid not in DATA_FILES:
            sys.exit('the artifact has a new data block %r: add it to DATA_FILES in tools/sync.py' % bid)
        body = json.dumps(json.loads(m.group(2)), ensure_ascii=False, separators=(',', ':'))
        rel = 'data/explore/%s.%s.json' % (DATA_FILES[bid], hashlib.sha1(body.encode('utf-8')).hexdigest()[:10])
        (ROOT / rel).write_text(body, encoding='utf-8')
        files[bid] = rel
    # older versions go, except the one the site serves now: a page loaded just before the new one goes live still finds its files
    live = ROOT / 'explore.html'
    keep = set(files.values()) | set(data_files(live.read_text(encoding='utf-8')).values() if live.exists() else ())
    for f in EXPLORE.glob('*.json'):
        if 'data/explore/' + f.name not in keep:
            f.unlink()
    html = BLOCK.sub('', html)

    def wrap(m):
        body = m.group(1)
        need = sorted(set(PARSE.findall(body)))
        if not need:
            return m.group(0)
        missing = [b for b in need if b not in files]
        if missing:
            sys.exit('the drill-down script reads %s, which the page no longer carries: update tools/sync.py' % missing)
        body = re.sub(r'^(\s*)\(async function\(\)\{', r'\1return (async function(){', PARSE.sub(lambda x: 'WI_DATA.' + x.group(1), body), count=1)
        return '<script>WI_DATA.run(%s,function(){%s});</script>' % (json.dumps(need, separators=(',', ':')), body)
    html = re.sub(r'<script>(.*?)</script>', wrap, html, flags=re.S)
    js = DATA_JS.replace('__FILES__', json.dumps(files, separators=(',', ':'))).replace('__FIRST__', json.dumps(list(FIRST)))
    return html.replace('</head>', js + '</head>', 1)


# The page's scripts, for the site: the old changelog button code goes (assets/notes.js runs that button), the section
# tabs replace the header's copies (NAV_BUTTONS), and the header shows the patch and gem count before the data is in.
CL_CODE = "const CHANGELOG = JSON.parse(document.getElementById('cldata').textContent);\n"
CL_LABEL = re.compile(r"\$\('#clbtn'\)\.innerHTML = .*?(?=function cl2\(\))", re.S)
NAV_OLD = "const nav = $('#nav');\n"
NAV_NEW = "const nav = $('#nav');\nnav.textContent = '';   // the header has the same buttons already (tools/sync.py NAV_BUTTONS)\n"
# the Gems table shows before this script runs (assets/bridge.js): its first go() keeps where the player has scrolled to
BOOT_OLD = "/* boot */\ngo('gems');\n"
BOOT_NEW = "/* boot */\n{ const y = scrollY; go('gems'); if(y) scrollTo(0, y); }   // tools/sync.py BOOT_NEW\n"


def site_scripts(html):
    html = html.replace(CL_CODE, '')
    html = CL_LABEL.sub('// the Patch notes button: assets/notes.js (data/changelog.json)\n', html, count=1)
    if "getElementById('cldata')" in html or 'CHANGELOG' in html.split('<body>', 1)[1]:
        sys.exit('the drill-down script still uses its changelog; update CL_CODE / CL_LABEL in tools/sync.py')
    if NAV_NEW not in html:
        if NAV_OLD not in html:
            sys.exit('the drill-down script changed; update NAV_OLD in tools/sync.py')
        html = html.replace(NAV_OLD, NAV_NEW, 1)
    if BOOT_NEW not in html:
        if BOOT_OLD not in html:
            sys.exit('the drill-down script changed; update BOOT_OLD in tools/sync.py')
        html = html.replace(BOOT_OLD, BOOT_NEW, 1)
    gems = block(html, 'gemdata')
    patch = re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', str(gems['meta'].get('game_version') or ''))
    live = sum(1 for g in gems['gems'] if not CUT.match(g['n']))   # the page's own count (CUT)
    html = re.sub(r'<b id="patch">[^<]*</b>', '<b id="patch">%s</b>' % patch, html, count=1)
    html = re.sub(r'<b id="total">[^<]*</b>', '<b id="total">{:,}</b>'.format(live), html, count=1)
    for pat, words in BUILD_COPY:   # the foot copy says the patch, not the client build
        html = pat.sub(words % patch, html, count=1)
    left = sorted(set(COPY_IDS.findall(html)))   # a reworded artifact that still carries game code
    if left:
        sys.exit('the drill-down copy still names %s; update the copy pairs in tools/sync.py' % ', '.join(left))
    return html


UQ_OLD = """(function(){\n"use strict";\nconst UQ = JSON.parse(document.getElementById('uqdata').textContent);"""
UQ_NEW = """(async function(){\n"use strict";\nconst UQ = JSON.parse(document.getElementById('uqdata').textContent);"""
TR_OLD = "const TR = JSON.parse(document.getElementById('trdata').textContent);\n"
TR_NEW = TR_OLD + "await wiLive(UQ, TR);   // live prices first (tools/sync.py LIVE)\n"
# ---- the drill-down's own copy ----
# Four places where the artifact wrote game code into a sentence a player reads: the jewel's file name and the
# stat that picks its conqueror, a Gemling flag, the id a Delirium anoint node starts with, and the folder the
# item art came out of. A closed "Technical details" box is the one place an internal id belongs; running copy
# is not it. Each pair is (what the artifact says, what the site says), and COPY_IDS at the end of site_scripts
# stops the build if a reworded artifact still carries any of them.
JLEDE_OLD = """'Seven factions sit in the mod files as <code>UniqueJewelAlternateTreeInRadius…</code>. Each jewel rolls three numbers: a '+
    '<b>version</b> fixed by which jewel it is, a <b>seed</b> inside the range below, and a <b>conqueror roll</b> that picks which '+
    'leader the jewel belongs to. The stat that picks the conqueror is named <code>local_unique_jewel_alternate_tree_keystone</code> '+
    'in the files, but what it selects is the conqueror line, not a keystone directly. '+
    'Two of the seven have an item on the market in Forbidden Rites: <b>Heroic Tragedy</b> carries the Kalguur version and '+
    '<b>Undying Hate</b> carries the Abyssal one. <b>Vaal, Karui, Maraketh, Templar and Eternal Empire are in the files with full '+
    'conqueror tables and seed ranges, but no Path of Exile 2 jewel carries them yet</b> — nothing in the unique list or on poe.ninja uses those versions. '+
    'Abyssal is the odd one out twice over: five conquerors instead of three, and a seed range of 79–30,977 against everyone else’s few thousand.'"""
JLEDE_NEW = """'Seven factions are in the game files, and each jewel rolls three numbers: a <b>version</b> set by which jewel it is, a '+
    '<b>seed</b> from the range below, and a roll that picks the <b>conqueror</b>. '+
    'Only two are real items — <b>Heroic Tragedy</b> is Kalguur, <b>Undying Hate</b> is Abyssal; <b>Vaal, Karui, Maraketh, '+
    'Templar and Eternal Empire have full conqueror tables and seed ranges but no jewel in the game yet</b>. '+
    'Abyssal is the odd one out twice over: five conquerors instead of three, and seeds 79–30,977 against everyone else’s few thousand.'"""
GEMFLAG_OLD = ("'The Gemling notable <i>Advanced Thaumaturgy</i> sets a flag called "
               "<code>ascendancy_gemling_enable_thaumaturgy_quality_stats</code> that nothing else in the dump refers to, "
               "so whatever extra quality it unlocks is not modelled here. '")
GEMFLAG_NEW = ("'The Gemling notable <i>Advanced Thaumaturgy</i> sets a flag nothing else in the game data uses, "
               "so whatever extra quality it unlocks is not counted here. '")
ANOINT_OLD = ('The 17 nodes whose id starts with <code>DeliriumAnoint_</code> are a separate thing: notables that exist '
              'only as anoints and sit nowhere on the tree')
ANOINT_NEW = ('The 17 Delirium anoints are a separate thing: notables that exist '
              'only as anoints and sit nowhere on the tree')
ART_OLD = "'Item art is the game’s own, from the RePoE mirror of the extracted <code>Art/2DItems</code> folder, packed into one sprite sheet; '"
ART_NEW = "'Item art is the game’s own, from the RePoE mirror of the game files, packed into one sprite sheet; '"
# The keyword popup's header line printed the keyword's own id beside its name. Ten of the 451 keywords have an
# id that reads as game code (the keystones); the name and what it is are all a player needs, so the id goes.
KWHEAD_OLD = """'<div class="sub" style="margin-top:3px">Keyword'+(meta.ks?' · a keystone on the passive tree':'')+
      ' · <code>'+esc(k)+'</code></div>'+"""
KWHEAD_NEW = """'<div class="sub" style="margin-top:3px">Keyword'+(meta.ks?' · a keystone on the passive tree':'')+
      '</div>'+"""
# The tree copy said about 0.7% of passive lines were shown as the raw id and value. Nothing on the page is any
# more, so the page stops describing a problem it no longer has.
STATID_OLD = ("'Effects are translated from raw stat ids using the game’s own description files; about 0.7% of lines "
              "have no description entry and are shown as the raw id and value instead of being dropped. '")
STATID_NEW = "'Effects are worded from the game’s own description files, so every line here reads as it does in game. '"
# The foot copy named the client build three times. A player knows the patch, which the header already shows, so
# these rewrite the sentence around whatever build the artifact carries (site_scripts works out the patch).
BUILD_COPY = [
    (re.compile(r"'Every gem in the game build <code>4\.[\d.]+</code> data dump — '"),
     "'Every gem in the game data for patch <b>%s</b> — '"),
    (re.compile(r"'game build <code>4\.[\d.]+</code> dump\. The dump names every unique"),
     "'game data for patch <b>%s</b>. It names every unique"),
    (re.compile(r"from the game build <code>4\.[\d.]+</code> tree export: '"),
     "from the patch <b>%s</b> tree export: '"),
]
COPY_IDS = re.compile(r'UniqueJewelAlternateTreeInRadius|local_unique_jewel_alternate_tree_keystone'
                      r'|ascendancy_gemling_enable_thaumaturgy_quality_stats|DeliriumAnoint_'
                      r'|Art/2DItems|<code>4\.[\d.]+</code>|raw id and value'
                      r"|<code>[^<]*'\s*\+")   # a code span the page fills in: an id printed into reading view
TEXT = [
    (JLEDE_OLD, JLEDE_NEW),
    (GEMFLAG_OLD, GEMFLAG_NEW),
    (ANOINT_OLD, ANOINT_NEW),
    (ART_OLD, ART_NEW),
    (STATID_OLD, STATID_NEW),
    (KWHEAD_OLD, KWHEAD_NEW),
    ('Prices are divine, from poe.ninja, Forbidden Rites', 'Prices in divine, from live trade listings'),
    ('Modifier text and prices come from poe.ninja\u2019s Forbidden Rites stash snapshot; the item list itself comes from the ',
     'Modifier text comes from the official game data and prices from live trade listings; the item list itself comes from the '),
    ('Prices are a snapshot in divine, roughly an hour behind the market.',
     'Prices are in divine: the middle of the 5 cheapest online listings on the trade site, checked through the day.'),
    ("title:'poe.ninja primary value, in divine. A snapshot, not a live price.'",
     "title:'The middle of the 5 cheapest online trade listings, in divine.'"),
    ("title:'How many were listed when the snapshot was taken. One or two means the price is one person’s asking price, not a market.'",
     "title:'How many are listed on the trade site right now. One or two means the price is one person’s asking price, not a market.'"),
    ('cost together, in divine, at the poe.ninja snapshot. Blank means', 'cost together, in divine, at today’s Currency Exchange prices. Blank means'),
    ('Prices are a poe.ninja snapshot for Forbidden Rites, so treat the total as the shape of the cost rather than a quote.',
     'Prices are today’s Currency Exchange prices.'),
    ('column totals what those three cost in divine at the poe.ninja snapshot. The spread runs from 0.0008 to 7.5 divine, a factor of about ten thousand, so the column sorts straight into cheap power.',
     'column totals what those three cost in divine at today’s Currency Exchange prices, so the column sorts straight into cheap power.'),
]


def live_prices(html):
    uq = block(html, 'uqdata')
    for u in uq['items']:
        for f in ('v', 'ls', 'ch'):
            u.pop(f, None)
    uq['meta']['src'] = 'RePoE ' + str(uq['meta'].get('src', '')).split('RePoE ')[-1]
    html = put(html, 'uqdata', uq)
    tr = block(html, 'trdata')
    for e in (tr.get('emotions') or {}).values():
        e.pop('v', None)
        e.pop('ch', None)
    tr['rates'] = {}
    html = put(html, 'trdata', tr)
    if UQ_NEW not in html:
        if UQ_OLD not in html or TR_OLD not in html:
            sys.exit('the drill-down script changed; update UQ_OLD / TR_OLD in tools/sync.py')
        html = html.replace(UQ_OLD, UQ_NEW, 1).replace(TR_OLD, TR_NEW, 1)
    for a, b in TEXT:
        html = html.replace(a, b)
    return html


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    html = inline(Path(sys.argv[1]).read_text(encoding='utf-8'))
    html, n = with_official_uniques(html)
    print('uniques with official lines:', n, 'changed')
    html, dropped, cleaned = with_clean_gems(html)
    print('gems with a leftover game marker: %d cleaned, %d dropped%s'
          % (len(cleaned), len(dropped), (' (' + ', '.join(dropped) + ')') if dropped else ''))
    index = build_index(html)
    (ROOT / 'data').mkdir(exist_ok=True)
    # Last good wins (tools/lastgood.py). The cards the artifact does not carry — the bases, the Atlas and the
    # currency — come from RePoE (tools/morecards.py), which answers with nothing rather than failing, so a
    # source that went quiet used to thin the search index in silence. The index and its two parts go out
    # together or not at all. 4,000 is the floor: the artifact's own cards are about 3,700, so under that
    # those sources gave nothing. explore.html is the artifact itself, so it is written either way.
    if lastgood.pull('Search index', lambda: index, file='index.json', url=REPOE, at='items', floor=4000) is not None:
        lastgood.save(ROOT / 'data' / 'index.json', json.dumps(index, ensure_ascii=False, separators=(',', ':')))
        import appdata   # the index in two parts for the home page (data/index-core.json, data/index-rest.json)
        appdata.write(index)
    (ROOT / 'explore.html').write_text(explore_page(html), encoding='utf-8', newline='')
    counts, bare = {}, {}
    for it in index['items']:
        counts[it['k']] = counts.get(it['k'], 0) + 1
        if not it.get('ic') and not it.get('img'):
            bare.setdefault(it['k'], []).append(it['n'])
    print('explore.html written (its data in data/explore/); index.json:', counts)
    for k, v in bare.items():
        print('  no image for %d %s cards:' % (len(v), k), ', '.join(v[:12]), file=sys.stderr)
    return lastgood.report()


def explore_page(html):
    """The artifact's page as the site serves it (explore.html): head, header, live prices, its data in files."""
    if BRIDGE not in html:
        html = html.replace('</body>', BRIDGE + '\n</body>', 1)
    html = GOOGLE_FONTS.sub('', html)   # the fonts are the site's own (assets/fonts)
    if VIEWPORT_NEW not in html:
        html = html.replace(VIEWPORT_OLD, VIEWPORT_NEW, 1)
    if HEAD not in html:
        html = html.replace(HEAD_OLD, HEAD, 1) if HEAD_OLD in html else html.replace(TITLE, '', 1).replace('</head>', HEAD + '</head>', 1)
    html = live_prices(html)
    for new, olds in ((MAST_NEW, (MAST_NOBOSS, MAST_PREV, MAST_OLD)), (CL_NEW, (CL_PREV, CL_OLD))):
        if new not in html:
            old = next((o for o in olds if o in html), None)
            if not old:
                sys.exit('the drill-down header changed; update MAST_OLD / CL_OLD in tools/sync.py')
            html = html.replace(old, new, 1)
    return externalize(site_scripts(html))


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Search index', file='index.json', url=REPOE, at='items'))
