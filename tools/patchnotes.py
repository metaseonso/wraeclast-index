"""Build data/patchnotes.json: GGG's own patch-note lines, each tied to the cards it names (#86).

Which patches there are, when each went out and which thread holds its notes is data/patches.json, the patch
registry tools/patches.py keeps (python tools/patches.py --notes reads the forum's listing pages for it). This
reads only what the registry does not hold: each thread's first post (GGG's "Early Access Patch Notes" forum,
https://www.pathofexile.com/forum/view-forum/2212; their robots.txt allows it), a div.content of <h3> sections
and <ul><li> lines, split here one line to a row with its section kept. Every registry row with a notes thread
is read (patches, hotfixes, restarts); a row with none (0.1.0 went live without notes) has no lines.

data/patchnotes.json: every line that names a card, and which cards. A patch is named by its registry id
("0.5.5c", "0.5.5 hotfix 2"), so its date, league and thread are read off data/patches.json and never kept twice.
A card is named by its kind and its name ("g:Fireball", "u:Bluetongue"), never by a game id: a page reads the
key off the card it is on. Names are matched case-sensitive and whole-word, longest first, so "Herald of Ash"
wins over "Ash"; a trailing "s" still counts ("Fireballs"). Every kind the index cards counts, keyword cards
included, except the tree's small passives (marked lo: "Strength" is a word in a line far more often than it
is that node) and the site's own mechanics and interaction cards, which GGG never names. A line that names
nothing the site cards is not shipped: it is counted per patch and section under "unmatched", so the gap
shows, and --gaps writes the lines themselves to tools/dev/patchgaps.txt for whoever widens the index next.
The file is fetched the first time a card asks for it (docs/frame.md, `file`), never in first paint.

What a run reads: the first post of every registry row it has no lines for, plus any posted in the last REREAD
days (GGG edit notes after they post). The lines that matched nothing were never kept, so a new card cannot
reach an old line without reading the thread again: when the names the index holds have changed since the
committed file (its "names" fingerprint), the run says so, and --all re-reads every thread and matches them
all again. PACE seconds between requests, so --all is about 7 minutes and an ordinary run a few seconds.

A stage of tools/pipeline.py (patchnotes, patch cadence, after the stages that write the index), which applies
the last good rule to it:

    python tools/pipeline.py --only patchnotes   the stage
    python tools/patchnotes.py            new threads, and the last REREAD days'
    python tools/patchnotes.py --all      re-read every thread and match every line again
    python tools/patchnotes.py --all --gaps   also write every unmatched line to tools/dev/patchgaps.txt
    python tools/patchnotes.py --cache DIR   keep each thread in DIR and reuse it on the next run
"""
import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

import lastgood

FORUM = 'https://www.pathofexile.com/forum/view-forum/2212'
THREAD = 'https://www.pathofexile.com/forum/view-thread/'
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
PACE = 1.5          # seconds between requests to pathofexile.com
FLOOR = 240         # threads with notes: 259 at 0.5.5c, and the forum keeps every one
REREAD = 3          # days a thread is read again after it is posted: GGG fix their notes in the first days
OUT = 'patchnotes.json'
GAPS = lastgood.ROOT / 'tools' / 'dev' / 'patchgaps.txt'
SKIP = {'h', 'q'}   # the site's own explainer cards: GGG never names them
UPDATES = re.compile(r'^updat', re.I)   # "Updates to Patch Notes", "Updated Patch Notes"
CONTENTS = 'Table of Contents'   # a big patch's own index: lines that only point further down the post
CACHE = None        # --cache DIR: keep each thread as read, for repeated runs by hand

TIER = re.compile(r' (?:I|II|III|IV|V)$')    # a support gem's tier: "Wildshards II"


# ---------------------------------------------------------------- reading the forum
def read(url, timeout=30):
    """One polite read, then a pause: nothing here fetches in a hurry."""
    req = urllib.request.Request(url, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode('utf-8', 'replace')
    time.sleep(PACE)
    return body


def iso(t):
    return t.strftime('%Y-%m-%dT%H:%MZ')


class Lines(HTMLParser):
    """A post's list lines, each with the heading it sits under. A line inside a line is a line of its own;
    its parent keeps only its own words."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.out, self.stack, self.head, self.heading = [], [], '', None

    def handle_starttag(self, tag, attrs):
        if tag in ('h2', 'h3', 'h4'):
            self.heading = []
        elif tag == 'li':
            self.stack.append([])
        elif tag == 'br' and self.stack:
            self.stack[-1].append(' ')

    def handle_endtag(self, tag):
        if tag in ('h2', 'h3', 'h4') and self.heading is not None:
            self.head, self.heading = clean(''.join(self.heading)), None
        elif tag == 'li' and self.stack:
            text = clean(''.join(self.stack.pop()))
            if text:
                self.out.append((self.head, text))

    def handle_data(self, data):
        if self.heading is not None:
            self.heading.append(data)
        elif self.stack:
            self.stack[-1].append(data)


def clean(s):
    return ' '.join(s.replace('’', "'").replace('\xa0', ' ').split())


def thread(tid):
    """A thread's page: from the cache when --cache holds it, else read (and kept there)."""
    hit = CACHE / (tid + '.html') if CACHE else None
    if hit and hit.exists():
        return hit.read_text(encoding='utf-8')
    page = read(THREAD + tid)
    if hit:
        CACHE.mkdir(parents=True, exist_ok=True)
        lastgood.save(hit, page)
    return page


def notes(tid):
    """A thread's first post, split into (section, line) rows. The first post is the one the thread was
    opened with: a staff post, or for a big patch a news post (the same notes, laid out as news). Anything
    else is not GGG's notes and gives nothing. The post runs from its first div.content to the box that says
    who posted it."""
    page = thread(tid)
    start = page.find('forumPostListTable')
    row = re.search(r'<tr class="([^"]*)">', page[start:]) if start >= 0 else None
    body = page.find('<div class="content">', start)
    end = min((i for i in (page.find('class="posted-by"', body), page.find('class="post_info"', body)) if i > 0),
              default=-1)
    if not row or body < 0 or end < 0:
        raise lastgood.Stale('thread %s no longer reads as a forum post' % tid)
    if not {'staff', 'newsPost'} & set(row.group(1).split()):
        return []
    p = Lines()
    p.feed(page[body:end])
    p.close()
    # A big patch repeats a line it corrected under "Updates to Patch Notes". One copy per thread: the one
    # under the section it belongs to, where there is one.
    best = {}
    for section, text in p.out:
        if section != CONTENTS and (text not in best or UPDATES.match(best[text]) and not UPDATES.match(section)):
            best[text] = section
    return [(best[text], text) for text in best]


# ---------------------------------------------------------------- matching lines to cards
class Names:
    """Every card name the index holds, ready to find in a line: grouped by the first word, longest first."""

    def __init__(self, items):
        by = {}
        for x in items:
            if x.get('k') in SKIP or x.get('lo') or not x.get('n'):
                continue
            by.setdefault(x['n'], set()).add(x['k'] + ':' + x['n'])
            if x['k'] == 'g' and str(x.get('s', '')).startswith('Support'):
                # "Freeze Support" is the gem, never the Freeze keyword; "Wildshards Support" is every
                # Wildshards the game has (I, II)
                by.setdefault(TIER.sub('', x['n']) + ' Support', set()).add('g:' + x['n'])
        self.keys = by
        self.print = hashlib.sha256('\n'.join(sorted(k for ks in by.values() for k in ks)).encode()).hexdigest()[:12]
        self.first = {}
        for name in sorted(by, key=len, reverse=True):
            w = re.match(r"[\w']+", name)
            if w:
                self.first.setdefault(w.group(0), []).append(name)

    def find(self, line):
        """The cards a line names, in the order it names them. Longest name first at each word; a match
        takes its words, so a shorter name inside it does not count again."""
        out, i = [], 0
        for w in re.finditer(r"[\w']+", line):
            if w.start() < i:
                continue
            word = w.group(0)
            bare = word[:-2] if word.endswith("'s") else word[:-1] if word.endswith('s') else None
            for name in self.first.get(word, []) + (self.first.get(bare, []) if bare else []):
                if not line.startswith(name, w.start()):
                    continue
                end = w.start() + len(name)
                if end < len(line) and line[end] == 's':
                    end += 1
                if end < len(line) and (line[end].isalnum() or line[end] == '_'):
                    continue
                if w.start() and line[w.start() - 1] in "-'":
                    continue
                for k in sorted(self.keys[name]):
                    if k not in out:
                        out.append(k)
                i = end
                break
        return out


def matched(patches, texts, names, carry):
    """patchnotes.json's body out of the registry rows (oldest first) and each one's lines, keyed by row id.
    carry holds the unmatched counts of the threads kept from the committed copy, whose unmatched lines were
    never kept."""
    heads, head_at, cards, card_at, lines, gaps, gap_lines, total, uncounted = [], {}, [], {}, [], [], [], 0, 0

    def head(section):
        if section not in head_at:
            head_at[section] = len(heads)
            heads.append(section)
        return head_at[section]

    for pi, p in enumerate(patches):
        per = {}
        for section, n in carry.get(p['id'], []):
            per[head(section)] = per.get(head(section), 0) + n
            total += n
            uncounted += n
        for section, text in texts.get(p['id'], []):
            total += 1
            head(section)
            found = names.find(text)
            if not found:
                per[head_at[section]] = per.get(head_at[section], 0) + 1
                gap_lines.append((p.get('title') or p['id'], section, text))
                continue
            ks = []
            for k in found:
                if k not in card_at:
                    card_at[k] = len(cards)
                    cards.append(k)
                ks.append(card_at[k])
            lines.append([pi, head_at[section], text, ks])
        gaps += [[pi, s, n] for s, n in per.items()]
    on = {}
    for li, line in enumerate(lines):
        for c in line[3]:
            on.setdefault(cards[c], []).append(li)
    # The sections in a fixed order, so a run that reuses the committed lines writes the same file as one
    # that reads every thread again.
    order = sorted(range(len(heads)), key=lambda i: heads[i])
    to = {old: new for new, old in enumerate(order)}
    return {'heads': [heads[i] for i in order], 'lines': [[l[0], to[l[1]], l[2]] for l in lines], 'on': on,
            'unmatched': {'n': len(gap_lines) + uncounted, 'of': total,
                          'by': sorted([pi, to[si], n] for pi, si, n in gaps)}}, gap_lines


def kept(old):
    """The lines a committed patchnotes.json already holds, per registry row id, as (section, line) rows: the
    ones that matched. The ones that did not were counted, never kept, so a thread only reused this way has
    to carry its counts over too."""
    ids = [p['id'] for p in (old or {}).get('patches', [])]
    if not ids:
        return {}, {}, {}
    texts, gaps = {}, {}
    for pi, si, text in old.get('lines', []):
        texts.setdefault(ids[pi], []).append((old['heads'][si], text))
    for pi, si, n in old.get('unmatched', {}).get('by', []):
        gaps.setdefault(ids[pi], []).append((old['heads'][si], n))
    return texts, gaps, {p['id']: p.get('notes') for p in old['patches']}


# ---------------------------------------------------------------- the run
def registry():
    """The rows of data/patches.json that have a notes thread, oldest first."""
    reg = lastgood.committed('patches.json', quiet=True) or {}
    rows = [r for r in reg.get('patches', []) if r.get('notes') and r.get('posted')]
    if len(rows) < FLOOR:
        raise lastgood.Stale('data/patches.json lists %d threads with notes: run python tools/patches.py --notes --all'
                             % len(rows))
    return sorted(rows, key=lambda r: (r['posted'], r['id']))


def build(args, gaps_out):
    """data/patchnotes.json: each registry thread's first post, split and matched against the index's cards."""
    rows = registry()
    old = lastgood.committed(OUT, quiet=True) or {}
    index = json.loads((lastgood.DATA / 'index.json').read_text(encoding='utf-8'))
    names = Names(index['items'])
    if old and old.get('names') != names.print and not args.all:
        print('  the index names other cards than the committed notes were matched against: run with --all to '
              'match every old line again', file=sys.stderr)
    now = dt.datetime.now(dt.timezone.utc)
    had, had_gaps, had_thread = ({}, {}, {}) if args.all else kept(old)
    cut = iso(now - dt.timedelta(days=REREAD))
    texts, carry, read_n = {}, {}, 0
    for r in rows:
        if r['id'] in had_thread and had_thread[r['id']] == r['notes'] and r['posted'] < cut:
            texts[r['id']] = had.get(r['id'], [])
            carry[r['id']] = had_gaps.get(r['id'], [])
        else:
            texts[r['id']] = notes(r['notes'].rsplit('/', 1)[-1])
            read_n += 1
    body, gap_lines = matched(rows, texts, names, carry)
    out = {'v': 2, 'updated': now.isoformat(timespec='minutes'), 'names': names.print,
           'source': {'name': "GGG's patch notes forum", 'url': FORUM},
           'note': ("GGG's own patch-note lines, each with the cards it names (kind:name). A patch is its row id in "
                    'data/patches.json, where its league is; its thread, title and time (UTC) are copied here. Lines that name no card are counted '
                    'under unmatched, not shipped. Written by tools/patchnotes.py.'),
           # the thread's own title and the hour it went up ride along from the registry, so a card that asks
           # for this file reads one file and not two (docs/frame.md, `file`)
           'patches': [{'id': r['id'], 'notes': r['notes'], 'title': r.get('title') or r['id'], 'posted': r['posted']}
                       for r in rows],
           **body}
    n, of = body['unmatched']['n'], body['unmatched']['of']
    print('%d threads (%d read, %d kept from the committed copy); %d lines, %d name a card (%d%%), %d cards named'
          % (len(rows), read_n, len(rows) - read_n, of, of - n, round(100 * (of - n) / of) if of else 0,
             len(body['on'])))
    gaps_out[:] = gap_lines
    return out


def write_gaps(gap_lines):
    """tools/dev/patchgaps.txt: every line that names nothing the site cards, grouped by patch and section."""
    out, last = ['# Patch-note lines that name no card on the site. Written by tools/patchnotes.py --gaps.', ''], None
    for title, section, text in gap_lines:
        if (title, section) != last:
            out += ['', '## %s / %s' % (title, section or '(no heading)')]
            last = (title, section)
        out.append('- ' + text)
    lastgood.save(GAPS, '\n'.join(out) + '\n')
    print('wrote', GAPS.relative_to(lastgood.ROOT), len(gap_lines), 'lines')


def main():
    ap = argparse.ArgumentParser(description="GGG's patch-note lines, tied to the cards they name.")
    ap.add_argument('--all', action='store_true', help='re-read every thread and match every line again')
    ap.add_argument('--gaps', action='store_true',
                    help='write the unmatched lines read this run to tools/dev/patchgaps.txt (with --all: every one)')
    ap.add_argument('--cache', help='folder to keep the threads in (for repeated runs)')
    args = ap.parse_args()
    global CACHE
    if args.cache:
        CACHE = Path(args.cache)
    gap_lines = []
    # Last good wins: every thread stays in the forum, so the lists only ever grow, and a drop is the page or
    # the parsing, not GGG.
    body = lastgood.pull('Patch notes', lambda: build(args, gap_lines), file=OUT, url=FORUM,
                         at={'patches': FLOOR, 'lines': 1000})
    if body is not None:
        was = lastgood.committed(OUT, quiet=True) or {}
        if {k: v for k, v in body.items() if k != 'updated'} != {k: v for k, v in was.items() if k != 'updated'}:
            lastgood.save(lastgood.DATA / OUT, json.dumps(body, ensure_ascii=False, separators=(',', ':')) + '\n')
            print('-> data/%s' % OUT)
        else:
            print('data/%s: no line moved, left as it is' % OUT)
        if args.gaps:
            write_gaps(gap_lines)
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Patch notes', file=OUT, url=FORUM))
