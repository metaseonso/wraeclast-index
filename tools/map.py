"""The map of the index: one picture of every card and every edge between them.

The site already holds a graph — a unique sits on a base, an item grants a skill, a keyword is used by two
thousand things, a line on a card names another card — and nobody has ever seen the shape of it. This draws
it: every row of data/index.json is a dot, coloured by its kind, and every edge the site can follow is a line
between two dots. Nothing here is a new fact about the game; it is the same edges assets/edges.js, marks.js
and the keyword lists already walk, laid out once at build time instead of in a browser.

Laid out here, not in the page. A force layout over 6,609 dots is a couple of minutes of work, so the page
gets the finished picture and a table of seats, never the maths: the answer is the same every run for the
same data (no clock, no random seed, no dict order that moves), so a rebuild changes the picture only where
the data changed.

What it writes:

  data/map.png         the picture: the edges first, then a dot per card. Flat ground, no text, so the page
                       can put its own words over it and the file stays small.
  data/map.json        what the page reads: the key (one line per kind, with its colour and its count), the
                       busiest card of each kind, a handful of edges for the lights that travel, what the
                       picture leaves out, and which data it was built from. Small enough to fetch with it.
  data/map-nodes.json  every card's seat: kind, id, x, y and how big its dot is. Nothing reads it today; it
                       is here so a later pass can put a click on a dot without laying anything out again.

Nothing about a kind is written into this file. The kinds, their names, their colours and their counts come
from the declarations the cards themselves live by (assets/kinds.js, and the palette tokens in
assets/theme.css), so a new kind — a new league's items, a new list — appears here, in the key and in the
count with nobody editing this tool. A kind the table does not name yet still lands: it gets a colour of its
own worked out from its letter and is named by that letter until it has an entry.

The edges drawn, all five of them the site's own:

  keywords   data/kwuse.json: what uses each keyword (uniques, gems, passives, bases, essences, Atlas,
             currency, other keywords). The rows that have no card of their own — a small passive, a
             crafting mod — are not dots, so they are not lines either.
  marks      the keywords and mechanics words a card's own lines name, found the way assets/marks.js finds
             them as a card is drawn: the same vocabulary, the same rules.
  named      the marks the build already made in the index (lx/lxk, tools/nodelinks.py).
  base       a unique and the base item it sits on.
  grants     data/grants.json: what grants a skill, both ways round.

What is left out, and why: "Listed with", "Shares its class with" and "Shares its base with" are not links
between two things, they are one group everything in it belongs to, and drawing a group of 967 cards is
467,000 lines that say one thing. They are counted and the page says how many. A kind the site cards but the
index holds no rows for — the bosses, which are cards at runtime out of their own file, with no edge into the
index — is named as left out, off the same declarations, so a new one of those names itself too.

Run it last, after tools/kwuse.py, so it reads the finished index and the finished lists.

Usage:
  python tools/map.py              write the picture, the key and the seats
  python tools/map.py --report     count and say what it would write, write nothing
  python tools/map.py --steps N    fewer passes of the layout (a quick look; the picture ships at the default)
"""
import argparse
import json
import math
import re
import struct
import sys
import zlib
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / 'data'
KINDS_JS = ROOT / 'assets' / 'kinds.js'
THEME_CSS = ROOT / 'assets' / 'theme.css'

WIDE = 1600              # the picture, across
TALL = 800               # and down: the web settles about twice as long as it is deep, so the frame is too
MARGIN = 34              # ground left around the outermost dot
STEPS = 260              # passes of the layout
GROUND = (0x07, 0x08, 0x07)     # --ground: the same black the site is on
EDGE = 0.085             # how much light one edge lays down
LIT = 48                 # steps of the light scale per unit of light
RAMP = 1024              # how many steps that scale has altogether: its top is 251 edges over one pixel
SOFT = 1.4               # how many edges it takes to lift a pixel properly clear of the ground

# ---------- the declarations ----------
# assets/kinds.js is a table, not a program: these read the fields the map needs out of it, the same way
# tools/dev/guard.mjs imports it. A kind that stops declaring one of them falls back, never crashes.
KIND_AT = re.compile(r"\{k: '(\w)'")
WORDS_OBJ = re.compile(r"words: \{([^}]*)\}")
FIELD = re.compile(r"(\w+): '([^']*)'")
TOKEN = re.compile(r"--([\w-]+):\s*(#[0-9A-Fa-f]{3,8})")


def declarations():
    """Every kind the site cards, in the order it declares them: letter, name, colour, which of a card's own
    fields the build already marked references in, and which of its own words are doors into it."""
    src = KINDS_JS.read_text(encoding='utf-8')
    body = src[src.index('export const KINDS'):src.index('export const DEFAULT')]
    palette = dict(TOKEN.findall(THEME_CSS.read_text(encoding='utf-8')))
    out, cuts = [], [m.start() for m in KIND_AT.finditer(body)]
    for i, start in enumerate(cuts):
        row = body[start:cuts[i + 1] if i + 1 < len(cuts) else len(body)]
        k = KIND_AT.match(row).group(1)
        # the "words" declaration is an object of its own: read it apart, so its keys are not read as the
        # kind's (a keyword's words.mark is whose words they are, never the field the build marked)
        w = WORDS_OBJ.search(row)
        words = dict(FIELD.findall(w.group(1))) if w else {}
        f = dict(FIELD.findall(row[:w.start()] + row[w.end():] if w else row))
        many = f.get('many') or ('Kind ' + k)
        out.append({'k': k, 'many': many, 'mark': f.get('mark', ''), 'words': words, 'kw': f.get('kw', ''),
                    'rgb': rgb(palette.get(f.get('tone', ''), '')) or own_colour(k)})
    return out


def word_rules():
    """Which of a kind's own words open its card, and which kind is a keyword itself (assets/kinds.js
    `words` and `kw`), for Marks below: {k: words} and the letters whose card stands for its own keyword."""
    kinds = declarations()
    return ({d['k']: d['words'] for d in kinds if d['words']},
            {d['k'] for d in kinds if d.get('kw') == 'id'})


def rgb(hexcolour):
    h = (hexcolour or '').lstrip('#')
    if len(h) == 3:
        h = ''.join(c + c for c in h)
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)) if len(h) >= 6 else None


def own_colour(k):
    """A kind with no tone declared: a colour of its own, off its letter, at the palette's own lightness."""
    hue = (ord(k) * 137.508) % 360.0
    return hsl(hue, 0.42, 0.62)


def hsl(h, s, light):
    def ch(n):
        a = s * min(light, 1 - light)
        x = (n + h / 30.0) % 12
        return round(255 * (light - a * max(-1, min(min(x - 3, 9 - x), 1))))
    return (ch(0), ch(8), ch(4))


# ---------- the graph ----------
class Graph:
    """Every card as a node, every edge the site can follow, and what was left out."""

    def __init__(self, kinds):
        # which field of a card the build already marked, per kind: the `mark` each one declares
        self.marked = {d['k']: d['mark'] for d in kinds if d.get('mark')}
        self.index = json.loads((DATA / 'index.json').read_text(encoding='utf-8'))
        self.items = [it for it in self.index['items'] if not it.get('dup')]
        self.by_key = {it['k'] + ':' + it['id']: it for it in self.items}
        self.order = {key: i for i, key in enumerate(self.by_key)}
        self.edges = set()
        self.per_family = {}
        self.grouped = {}       # the "listed with" groups: name -> how many pairs it would draw
        self.no_card = 0        # rows in the keyword lists that no card answers to

    def family(self, name, fn):
        """One family of edges, counted on its own: an edge two families both hold is drawn once."""
        was = len(self.edges)
        found = set()
        fn(found)
        mine = {(a, b) if a < b else (b, a) for a, b in found if a != b and a in self.by_key and b in self.by_key}
        for pair in sorted(mine):
            self.edges.add(pair)
        self.per_family[name] = {'edges': len(mine), 'new': len(self.edges) - was}

    def build(self):
        self.family('keywords', self.keywords)
        self.family('marks', self.marks)
        self.family('named', self.named)
        self.family('base', self.bases)
        self.family('grants', self.grants)
        self.groups()

    # --- data/kwuse.json: the nine lists under a keyword card (assets/edges.js kwRows) ---
    def keywords(self, out):
        use = json.loads((DATA / 'kwuse.json').read_text(encoding='utf-8'))
        def pair(src, key):
            if key in self.by_key:
                out.add((src, key))
            else:
                self.no_card += 1
        for kwid, lists in use['k'].items():
            src = 'w:' + kwid
            if src not in self.by_key:       # a keyword the site has no card for: its list is nobody's
                continue
            for name in lists.get('u', []):
                pair(src, 'u:' + name)
            for ident in lists.get('g', []):
                pair(src, 'g:' + ident)
            for name in lists.get('b', []):
                pair(src, 'b:' + name)
            for row in lists.get('p', []):   # a string is a passive card, anything else a small passive
                ident = row[0] if isinstance(row, list) else row
                if isinstance(ident, str):
                    pair(src, 'p:' + ident)
                else:
                    self.no_card += 1
            for other in lists.get('w', []):
                pair(src, 'w:' + other)
            for i in lists.get('e', []):     # an essence: the row names the currency card it is
                row = at(use.get('es'), i)
                pair(src, 'c:' + row[0]) if row else None
            for i in lists.get('c', []):
                row = at(use.get('cu'), i)
                pair(src, 'c:' + row[0]) if row else None
            for row in lists.get('a', []):   # an Atlas row carries the key of its card where it has one
                found = at(use.get('at'), row[0])
                if found and len(found) > 3 and found[3]:
                    pair(src, found[3])
                else:
                    self.no_card += 1
            self.no_card += len(lists.get('m', []))     # a crafting mod is a line, never a card

    # --- the marks a card takes as it is drawn (assets/marks.js, the same rules) ---
    def marks(self, out):
        for it, text, block in self.lines():
            mine = it['k'] + ':' + it['id']
            for key in self.vocabulary().scan(it, text, block):
                if key in self.by_key:
                    out.add((mine, key))

    def lines(self):
        """Every line of a card a player reads, with the ground the build's own marks hold on it."""
        for it in self.items:
            marked = self.marked.get(it['k'])
            for at_field in ('ls', 't'):
                value = it.get(at_field)
                if value is None:
                    continue
                rows = value if isinstance(value, list) else [value]
                for i, text in enumerate(rows):
                    if not isinstance(text, str):
                        continue
                    block = (it.get('lx') or [])[i:i + 1] if at_field == marked else []
                    yield it, text, (block[0] if block else None)

    def vocabulary(self):
        if not hasattr(self, '_vocab'):
            self._vocab = Marks(self.items, self.index.get('kwx') or {})
        return self._vocab

    # --- the index's own build-time marks (lx/lxk, tools/nodelinks.py) ---
    def named(self, out):
        keys = self.index['lxk']
        for it in self.items:
            mine = it['k'] + ':' + it['id']
            for row in it.get('lx') or []:
                for span in row or []:
                    target = at(keys, span[2])
                    if target:
                        out.add((mine, target))

    # --- a unique and the base it sits on ---
    def bases(self, out):
        for it in self.items:
            if it['k'] != 'u':
                continue
            base = (it.get('s') or '').split('·')[0].strip()
            if base and 'b:' + base in self.by_key:
                out.add((it['k'] + ':' + it['id'], 'b:' + base))

    # --- data/grants.json ---
    def grants(self, out):
        given = json.loads((DATA / 'grants.json').read_text(encoding='utf-8'))
        for side in ('by', 'of'):
            for src, rows in given.get(side, {}).items():
                for row in rows:
                    out.add((src, row[0]))

    # --- the groups, which are not edges ---
    def groups(self):
        groups = {'listed with': defaultdict(int), 'shares its class with': defaultdict(int),
                  'shares its base with': defaultdict(int), 'listed with (Atlas)': defaultdict(int)}
        for it in self.items:
            if it.get('s'):
                groups['listed with'][it['k'] + '/' + it['s']] += 1
            if it['k'] == 'b' and it.get('cr'):
                groups['shares its class with'][it['cr']] += 1
            if it['k'] == 'a' and it.get('at'):
                groups['listed with (Atlas)'][it['at']] += 1
            if it['k'] == 'u':
                base = (it.get('s') or '').split('·')[0].strip()
                if base and 'b:' + base in self.by_key:
                    groups['shares its base with'][base] += 1
        for name, counted in groups.items():
            self.grouped[name] = sum(n * (n - 1) // 2 for n in counted.values())


def at(rows, i):
    return rows[i] if rows and isinstance(i, int) and 0 <= i < len(rows) else None


class Marks:
    """assets/marks.js, in Python: the phrases a card's lines open a door on.

    The same table and the same rules, so the lines this counts are the lines a player can really click:
    whole words, longest phrase first, never inside another mark; a card's own name a door wherever it is
    read or only where the card being drawn carries that keyword, whichever its kind declares; a word of a
    kind whose words each carry their own rule only where that rule says so; never the card you are already
    on.

    Which of a card's own words are doors is the kind's own declaration and nothing here (assets/kinds.js
    `words`, read by word_rules above), so a new kind whose words are doors lands with nobody editing this.
    """

    WORD = re.compile(r'\w+', re.A)
    FIRST = re.compile(r'^\w+', re.A)
    WORDY = re.compile(r'\w', re.A)
    PCT = re.compile(r'%\s*$')
    NUM = re.compile(r'^\s*\(?[-+]?\d')

    def __init__(self, items, keystones, rules=None):
        rules, self.own_kw = word_rules() if rules is None else rules
        own, other, self.gates = {}, {}, {}
        box = {'own': own, 'alt': other}
        def add(table, phrase, key):
            if phrase and len(phrase) > 1:
                table[phrase] = 0 if (phrase in table and table[phrase] != key) else key
        for it in items:
            w = rules.get(it['k'])
            if not w:
                continue
            key = it['k'] + ':' + it['id']
            if w.get('n') in box:
                add(box[w['n']], it['n'], key)
            for spelling in it.get('f') or ():
                if w.get('f') in box:
                    add(box[w['f']], spelling, key)
                if w.get('only') == 'gate':
                    self.gates[spelling] = it.get('fg') or ''
        self.first = defaultdict(list)
        for table, alt in ((own, 0), (other, 1)):
            for phrase, key in table.items():
                if alt and phrase in own:
                    continue
                head = self.FIRST.match(phrase)
                if head:
                    self.first[head.group(0)].append((phrase, key, alt))
        for rows in self.first.values():
            rows.sort(key=lambda row: -len(row[0]))
        self.gated = {k for k, w in rules.items() if w.get('only') == 'gate'}
        self.keystone = {}       # a keystone passive stands for its own keyword: not a door to itself
        by_name = {}
        for it in items:
            if it['k'] == 'p':
                by_name.setdefault(it['n'], it['k'] + ':' + it['id'])
        for kwid, name in keystones.items():
            if name in by_name:
                self.keystone[by_name[name]] = kwid

    def ok(self, gate, text, start, end):
        """When one of a gated kind's words counts, by that card's own rule ("fg", tools/mechanics.py)."""
        pct = bool(self.PCT.search(text[:start]))
        opens = (not start) and bool(self.NUM.match(text[end:]))
        if gate == 'any':
            return True
        if gate == 'pct':
            return pct
        if gate == 'start':
            return opens
        return pct or opens

    def spans(self, it, text, block):
        """The marks in one line: [(start, end, key)], left to right and never overlapping."""
        mine = it['k'] + ':' + it['id']
        self_kw = it['id'] if it['k'] in self.own_kw else self.keystone.get(mine)
        kw = it.get('kw') or ()
        found, at_word = [], 0
        for m in self.WORD.finditer(text):
            if m.start() < at_word:
                continue
            for phrase, key, alt in self.first.get(m.group(0), ()):
                start = m.start()
                end = start + len(phrase)
                if not text.startswith(phrase, start) or (end < len(text) and self.WORDY.match(text[end])):
                    continue
                if key:
                    if alt and key[2:] not in kw:
                        continue
                    if key[0] in self.gated and not self.ok(self.gates.get(phrase, ''), text, start, end):
                        continue
                at_word = end
                if key and key != mine and not (self_kw and key == 'w:' + self_kw) and not held(block, start, end):
                    found.append((start, end, key))
                break
        return found

    def scan(self, it, text, block):
        """The cards one line opens, in the order it opens them."""
        return [key for _, _, key in self.spans(it, text, block)]


def held(block, start, end):
    for span in block or ():
        if start < span[0] + span[1] and end > span[0]:
            return True
    return False


# ---------- the layout ----------
INNER = 0.86             # how much of the picture the connected part of the index gets
PUSH = 3.0               # how far a dot's push reaches, in ideal distances
APART = 2.4              # how hard dots push: above 1 the web opens out, below it closes up
CROWD = 10               # a cell of the grid with more dots than this pushes as one weight
PULLIN = 0.012           # the weight toward the middle, so nothing wanders off


def components(n, links):
    """The islands: every run of nodes edges can walk between, biggest first, in a fixed order."""
    near = defaultdict(list)
    for i, j in links:
        near[i].append(j)
        near[j].append(i)
    seen, found = set(), []
    for i in range(n):
        if i in seen:
            continue
        seen.add(i)
        stack, island = [i], []
        while stack:
            v = stack.pop()
            island.append(v)
            for w in near[v]:
                if w not in seen:
                    seen.add(w)
                    stack.append(w)
        island.sort()
        found.append(island)
    found.sort(key=lambda island: (-len(island), island[0]))
    return found


def layout(keys, edges, steps):
    """Where every dot sits: a force layout, the same answer every run.

    Dots push each other apart and edges pull their two ends together, cooling over the passes until nothing
    moves much. The push is read off a grid — only the neighbouring cells count, and a cell with a crowd in
    it pushes as one weight at the middle of that crowd — so the cost is the number of dots, not the square
    of it. An edge pulls less the busier its two ends are, or the keyword hubs would drag the whole index
    into one knot.

    Only the part of the index edges can walk gets the forces. Everything else — a card with no edge at all,
    a pair that only names each other — has nothing to be pulled by and would drift wherever the push left
    it, so it is seated around the rim instead, each island's cards side by side: a ring of what the data
    does not connect to anything.
    """
    n = len(keys)
    place = {key: i for i, key in enumerate(keys)}
    degree = [0] * n
    links = []
    for a, b in edges:
        i, j = place[a], place[b]
        links.append((i, j))
        degree[i] += 1
        degree[j] += 1

    islands = components(n, links)
    main = islands[0]
    inside = set(main)
    seats = [(0.0, 0.0)] * n
    for i, (x, y) in zip(main, spread(main, [(i, j) for i, j in links if i in inside], degree, steps)):
        seats[i] = (x, y)
    rim(seats, [i for island in islands[1:] for i in island])
    return seats, degree, islands


def spread(nodes, links, degree, steps):
    """The force layout itself, over one island, in a square of its own: fit() turns and sizes what it gives."""
    n = len(nodes)
    at = {node: i for i, node in enumerate(nodes)}
    links = [(at[i], at[j]) for i, j in links]
    pull = [1.0 / math.sqrt(1.0 + min(degree[nodes[i]], degree[nodes[j]])) for i, j in links]

    side = float(WIDE)
    k = 0.72 * math.sqrt(side * side / n)          # how far apart two dots want to be
    # where each dot starts: a sunflower, so no two sit on each other and no random number is involved
    xs, ys = [0.0] * n, [0.0] * n
    for i in range(n):
        r = 0.5 * side * math.sqrt((i + 0.5) / n)
        a = i * 2.39996322972865332
        xs[i] = side / 2 + r * math.cos(a)
        ys[i] = side / 2 + r * math.sin(a)

    cell = k * 1.6
    reach = PUSH * PUSH * k * k
    temp = side / 9.0
    cool = math.exp(math.log(0.02) / max(1, steps))
    for _ in range(steps):
        fx, fy = [0.0] * n, [0.0] * n
        # --- push: off the grid, neighbouring cells only ---
        grid = defaultdict(list)
        for i in range(n):
            grid[(int(xs[i] / cell), int(ys[i] / cell))].append(i)
        kk = k * k * APART
        middle = {}                     # a crowded cell, as one weight at the middle of what is in it
        for at_cell, rows in grid.items():
            if len(rows) > CROWD:
                middle[at_cell] = (sum(xs[i] for i in rows) / len(rows),
                                   sum(ys[i] for i in rows) / len(rows), float(len(rows)))
        for (cx, cy), here in grid.items():
            one, many = [], []
            for gx in (cx - 1, cx, cx + 1):
                for gy in (cy - 1, cy, cy + 1):
                    there = grid.get((gx, gy))
                    if not there:
                        continue
                    lump = middle.get((gx, gy))
                    if lump and (gx, gy) != (cx, cy):
                        many.append(lump)
                    else:
                        one.append(there)
            for i in here:
                x, y = xs[i], ys[i]
                ax = ay = 0.0
                for rows in one:
                    for j in rows:
                        dx = x - xs[j]
                        dy = y - ys[j]
                        d2 = dx * dx + dy * dy
                        if d2 < 1e-6:
                            dx, dy, d2 = (i - j) * 1e-3 + 1e-3, (i + j) % 7 * 1e-3 + 1e-3, 1e-6
                        if d2 < reach:
                            f = kk / d2
                            ax += dx * f
                            ay += dy * f
                for mx, my, mass in many:
                    dx = x - mx
                    dy = y - my
                    d2 = dx * dx + dy * dy
                    if 0.04 * kk < d2 < reach:
                        f = kk * mass / d2
                        ax += dx * f
                        ay += dy * f
                fx[i] += ax
                fy[i] += ay
        # --- pull: the edges ---
        for e, (i, j) in enumerate(links):
            dx = xs[i] - xs[j]
            dy = ys[i] - ys[j]
            d = math.sqrt(dx * dx + dy * dy) or 1e-3
            f = d / k * pull[e]
            fx[i] -= dx * f
            fy[i] -= dy * f
            fx[j] += dx * f
            fy[j] += dy * f
        # --- and a little weight toward the middle, so nothing wanders off ---
        mid = side / 2
        for i in range(n):
            fx[i] += (mid - xs[i]) * PULLIN
            fy[i] += (mid - ys[i]) * PULLIN
            d = math.sqrt(fx[i] * fx[i] + fy[i] * fy[i])
            if d > temp:
                fx[i] *= temp / d
                fy[i] *= temp / d
            xs[i] += fx[i]
            ys[i] += fy[i]
        temp *= cool
    return fit(xs, ys)


def fit(xs, ys):
    """The island turned onto its own long way, then moved and scaled to fill the picture, keeping its shape.

    The web settles about twice as long as it is deep, and which way that length points is whatever the
    forces happened to leave it: turned, the picture is the shape of the web instead of the web a band across
    a square. Nothing is stretched — one scale for both ways round.

    It is sized on where all but the outermost one in two hundred sit, so a handful of far-flung cards
    cannot shrink the whole web to fit them; they land a little further out, in the ground left for the rim,
    and the one or two further out than that are held at the picture's edge rather than drawn off it.
    """
    cx = sum(xs) / len(xs)
    cy = sum(ys) / len(ys)
    pts = [(x - cx, y - cy) for x, y in zip(xs, ys)]
    cos, sin = long_way(pts)
    pts = [(x * cos + y * sin, y * cos - x * sin) for x, y in pts]
    scale = INNER * min((WIDE / 2.0 - MARGIN) / reach(p[0] for p in pts),
                        (TALL / 2.0 - MARGIN) / reach(p[1] for p in pts))
    return [(inside(WIDE / 2.0 + x * scale, WIDE), inside(TALL / 2.0 + y * scale, TALL)) for x, y in pts]


def long_way(pts):
    """Which way the web is longest, as a turn: the first axis of how the dots lie about their middle."""
    sxx = sum(x * x for x, _ in pts)
    syy = sum(y * y for _, y in pts)
    sxy = sum(x * y for x, y in pts)
    a = 0.5 * math.atan2(2 * sxy, sxx - syy)      # never a quarter turn or more, so the turn is one answer
    return math.cos(a), math.sin(a)


def reach(vs):
    """How far out all but the outermost one in two hundred sit, one way round."""
    out = sorted(abs(v) for v in vs)
    return out[int(len(out) * 0.995)] or 1.0


def inside(v, span):
    return MARGIN if v < MARGIN else (span - MARGIN if v > span - MARGIN else v)


def rim(seats, nodes):
    """The islands of one and two, evenly around the edge of the picture, in the order they were found.

    Evenly by the length of the ring, not by the angle, or a ring twice as long as it is deep would bunch
    them at its two ends.
    """
    if not nodes:
        return
    ax, ay = WIDE / 2.0 - MARGIN, TALL / 2.0 - MARGIN
    ring = [(math.cos(t * math.pi / 1000), math.sin(t * math.pi / 1000)) for t in range(2001)]
    run = [0.0]
    for (x0, y0), (x1, y1) in zip(ring, ring[1:]):
        run.append(run[-1] + math.hypot((x1 - x0) * ax, (y1 - y0) * ay))
    step, at = run[-1] / len(nodes), 0
    for t, i in enumerate(nodes):
        want = (t + 0.5) * step
        while at < len(run) - 2 and run[at + 1] < want:
            at += 1
        seats[i] = (WIDE / 2.0 + ax * ring[at][0], TALL / 2.0 + ay * ring[at][1])


# ---------- the picture ----------
class Picture:
    """A dark ground, the edges as light laid on it, then a dot per card. No text: the page puts its own on."""

    def __init__(self, w, h):
        self.w = w
        self.h = h
        self.glow = [0.0] * (w * h)              # how much edge light landed on each pixel
        self.dots = []

    def line(self, x0, y0, x1, y1, weight):
        """One edge, drawn with its ends feathered (Wu), so a thin line reads at any angle."""
        w = self.w
        glow = self.glow
        steep = abs(y1 - y0) > abs(x1 - x0)
        if steep:
            x0, y0, x1, y1 = y0, x0, y1, x1
        if x0 > x1:
            x0, x1, y0, y1 = x1, x0, y1, y0
        dx = x1 - x0
        if dx < 1e-9:
            return
        slope = (y1 - y0) / dx
        start, end = int(x0), int(x1)
        y = y0 + slope * (start + 0.5 - x0)
        # a steep line was turned on its side above, so from here `x` runs down the picture and `at` across it
        along, across = (self.h, w) if steep else (w, self.h)
        for x in range(max(0, start), min(along, end + 1)):
            base = int(y)
            frac = y - base
            for at, part in ((base, 1.0 - frac), (base + 1, frac)):
                if 0 <= at < across:
                    glow[x * w + at if steep else at * w + x] += weight * part
            y += slope

    def dot(self, x, y, r, colour):
        self.dots.append((x, y, r, colour))

    def bytes(self):
        """The picture, as PNG: the glow through a ramp of the site's own green, then the dots over it."""
        w, h = self.w, self.h
        ramp = green_ramp()
        last = len(ramp) - 1
        glow = self.glow
        rows = []
        for y in range(h):
            row = bytearray()
            base = y * w
            for x in range(w):
                v = int(glow[base + x] * LIT)
                row += ramp[v if v < last else last]
            rows.append(row)
        for x, y, r, colour in self.dots:
            splat(rows, w, h, x, y, r, colour)
        raw = bytearray()
        for row in rows:
            raw.append(0)
            raw += row
        return png(w, h, bytes(raw))


def green_ramp():
    """Ground -> deep green -> the site's poison green -> pale: how much light landed, read as colour.

    A pixel out in the arms carries one line; a pixel in the middle carries two thousand. On a straight
    scale the arms are black and the middle one flat pale patch, so this is the scale a star chart uses:
    the first line or two lift a pixel clear of the ground, and it takes a couple of hundred more to reach
    the top. Above that the scale stops, which is a few dozen pixels in the very middle.
    """
    stops = [(0.0, GROUND), (0.16, (0x16, 0x24, 0x13)), (0.42, (0x3B, 0x63, 0x26)),
             (0.72, (0x8C, 0xCB, 0x3F)), (1.0, (0xDF, 0xF0, 0xC2))]
    steps = []
    top = math.log1p((RAMP / float(LIT)) / EDGE / SOFT)
    for i in range(RAMP):
        t = math.log1p((i / float(LIT)) / EDGE / SOFT) / top
        for (t0, c0), (t1, c1) in zip(stops, stops[1:]):
            if t <= t1 or t1 == 1.0:
                f = max(0.0, min(1.0, 0.0 if t1 == t0 else (t - t0) / (t1 - t0)))
                steps.append(bytes(round(c0[j] + (c1[j] - c0[j]) * f) for j in range(3)))
                break
    return steps


def splat(rows, w, h, cx, cy, r, colour):
    """One dot, feathered at its edge; a busy one keeps a soft halo, so the hubs read from across the map."""
    halo = r * 2.4 if r > 3.0 else r + 0.5
    x0, x1 = max(0, int(cx - halo)), min(w - 1, int(cx + halo))
    y0, y1 = max(0, int(cy - halo)), min(h - 1, int(cy + halo))
    cr, cg, cb = colour
    for y in range(y0, y1 + 1):
        row = rows[y]
        dy = y + 0.5 - cy
        for x in range(x0, x1 + 1):
            dx = x + 0.5 - cx
            d = math.sqrt(dx * dx + dy * dy)
            if d <= r:
                a = 1.0 if d <= r - 0.7 else max(0.0, (r - d) / 0.7)
            elif d <= halo:
                a = 0.30 * (1.0 - (d - r) / (halo - r)) ** 2
            else:
                continue
            i = x * 3
            row[i] = mix(row[i], cr, a)
            row[i + 1] = mix(row[i + 1], cg, a)
            row[i + 2] = mix(row[i + 2], cb, a)


def mix(under, over, a):
    v = int(under + (over - under) * a + 0.5)
    return 255 if v > 255 else (0 if v < 0 else v)


def png(width, height, raw):
    def chunk(tag, body):
        return struct.pack('>I', len(body)) + tag + body + struct.pack('>I', zlib.crc32(tag + body) & 0xFFFFFFFF)
    head = struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', head)
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


# ---------- what the page is given ----------
def radius(degree):
    return round(min(11.0, 1.15 + 0.78 * math.log(1 + degree)), 2)


def sparks(keys, seats, edges, degree, place, want=18):
    """A few edges for the lights that travel: long ones, off the busiest ends, spread over the picture.

    Enough of them that the picture reads as alive from anywhere in it, few enough that the page draws one
    frame in well under a millisecond. No two are taken within an eighth of the picture of each other, so
    they never bunch into one corner.
    """
    scored = []
    for a, b in edges:
        i, j = place[a], place[b]
        (x0, y0), (x1, y1) = seats[i], seats[j]
        length = math.hypot(x1 - x0, y1 - y0)
        if length < WIDE * 0.10 or length > WIDE * 0.62:
            continue
        scored.append((-(min(degree[i], degree[j]) * length), a, b, i, j))
    scored.sort()
    taken, out = [], []
    for _, a, b, i, j in scored:
        (x0, y0), (x1, y1) = seats[i], seats[j]
        mx, my = (x0 + x1) / 2, (y0 + y1) / 2
        if any(math.hypot(mx - px, my - py) < WIDE * 0.085 for px, py in taken):
            continue
        taken.append((mx, my))
        out.append([round(x0, 1), round(y0, 1), round(x1, 1), round(y1, 1)])
        if len(out) >= want:
            break
    return out


def report(graph, kinds, counts, drawn, args):
    print('cards   ' + ' · '.join('%s %s' % (f'{counts[d["k"]]:,}', d['many'].lower())
                                       for d in kinds if counts.get(d['k'])))
    print('edges   ' + ' · '.join('%s %s (%s not already drawn)' % (f'{v["edges"]:,}', name, f'{v["new"]:,}')
                                       for name, v in graph.per_family.items()))
    print('drawn   %s different edges over %s cards' % (f'{drawn:,}', f'{sum(counts.values()):,}'))
    print('left out %s pairs of the groups (%s)' % (
        f'{sum(graph.grouped.values()):,}', ', '.join('%s %s' % (f'{v:,}', n) for n, v in graph.grouped.items())))
    print('        %s rows in the keyword lists that no card answers to' % f'{graph.no_card:,}')


def main():
    ap = argparse.ArgumentParser(description='The map of the index: data/map.png and where every dot sits.')
    ap.add_argument('--report', action='store_true', help='count and say what it would write, write nothing')
    ap.add_argument('--steps', type=int, default=STEPS, help='passes of the layout (default %d)' % STEPS)
    args = ap.parse_args()

    kinds = declarations()
    graph = Graph(kinds)
    graph.build()
    counts = defaultdict(int)
    for it in graph.items:
        counts[it['k']] += 1
    # a kind in the index that the table does not name yet still gets a line of its own
    named = {d['k'] for d in kinds}
    for k in counts:
        if k not in named:
            kinds.append({'k': k, 'many': 'Kind ' + k, 'rgb': own_colour(k)})

    keys = sorted(graph.by_key, key=lambda key: (
        next((i for i, d in enumerate(kinds) if d['k'] == key[0]), 99), graph.order[key]))
    edges = sorted(graph.edges)
    if args.report:
        report(graph, kinds, counts, len(edges), args)
        return 0

    seats, degree, islands = layout(keys, edges, args.steps)
    place = {key: i for i, key in enumerate(keys)}
    colour = {d['k']: tuple(d['rgb']) for d in kinds}

    pic = Picture(WIDE, TALL)
    for a, b in edges:
        i, j = place[a], place[b]
        pic.line(seats[i][0], seats[i][1], seats[j][0], seats[j][1], EDGE)
    for i, key in enumerate(keys):
        x, y = seats[i]
        pic.dot(x, y, radius(degree[i]), colour.get(key[0], (0xDC, 0xE3, 0xD2)))
    picture = pic.bytes()
    (DATA / 'map.png').write_bytes(picture)

    game = json.loads((DATA / 'gamedata.json').read_text(encoding='utf-8'))
    # the busiest card of each kind: one light per kind, wherever that kind's weight sits, busiest first.
    # A list that grows by itself when a kind is added, and never one hub's neighbours all in the same spot.
    best = {}
    for i in sorted(range(len(keys)), key=lambda i: (-degree[i], keys[i])):
        best.setdefault(keys[i][0], i)
    hubs = [{'x': round(seats[i][0], 1), 'y': round(seats[i][1], 1), 'r': radius(degree[i]),
             'k': keys[i][0], 'n': graph.by_key[keys[i]]['n'], 'deg': degree[i]}
            for i in sorted(best.values(), key=lambda i: (-degree[i], keys[i]))]
    out = {
        'v': 1,
        'index': graph.index.get('v'), 'gen': graph.index.get('gen'), 'patch': game.get('patch'),
        'w': WIDE, 'h': TALL, 'png': 'data/map.png',
        'cards': sum(counts.values()), 'edges': len(edges),
        'kinds': [{'k': d['k'], 'many': d['many'], 'n': counts[d['k']],
                   'c': '#%02X%02X%02X' % tuple(d['rgb'])} for d in kinds if counts.get(d['k'])],
        'hubs': hubs,
        'sparks': sparks(keys, seats, edges, degree, place),
        # what the picture does not hold: the groups, the rows no card answers to, and any kind the site
        # cards that the index has no rows for — the bosses today, whatever else declares itself tomorrow
        'out': {'groups': sum(graph.grouped.values()), 'rows': graph.no_card,
                'by': {name: n for name, n in graph.grouped.items()},
                'kinds': [d['many'] for d in kinds if not counts.get(d['k'])]},
    }
    write(DATA / 'map.json', out)

    seatlist = defaultdict(list)
    for i, key in enumerate(keys):
        seatlist[key[0]].append([key[2:], round(seats[i][0], 1), round(seats[i][1], 1), radius(degree[i]), degree[i]])
    write(DATA / 'map-nodes.json', {'v': 1, 'index': graph.index.get('v'), 'w': WIDE, 'h': TALL,
                                    'of': ['id', 'x', 'y', 'r', 'edges'], 'nodes': dict(seatlist)})

    report(graph, kinds, counts, len(edges), args)
    for name in ('map.png', 'map.json', 'map-nodes.json'):
        print('data/%s %s KB' % (name, f'{(DATA / name).stat().st_size / 1024:,.0f}'))
    return 0


def write(path, body):
    path.write_text(json.dumps(body, ensure_ascii=False, separators=(',', ':')), encoding='utf-8', newline='')


if __name__ == '__main__':
    sys.exit(main())
