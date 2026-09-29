"""Build data/filtertiers.json: the tier NeverSink's loot filter gives each base item and currency (issue #93).

NeverSink's filter for Path of Exile 2 (https://github.com/NeverSinkDev/NeverSink-Filter-for-PoE2) sorts drops by
hand into tiers. The game publishes no such thing, so every tier here is NeverSink's and the card says so, with a
link to the release it is read from (assets/kinds.js FIELDS.filtertier, the cite-unofficial-sources rule).

Source: the repo's latest release on GitHub, and in it the SOFT filter, the one that hides nothing: a stricter
filter hides the lower tiers, it never moves an item from one tier to another. Two requests a run.

How it is read. Each rule of the filter opens with a line like

    Show # %D5 $type->currency->omen $tier->a !currency_a

and its BaseType == "..." line lists the items it catches. TIERED below says which of NeverSink's types are a
tier list of base items or of currency, and which card kind their items are. A tier is a letter (S to E, NeverSink's
own economy tiers) or a number (T1 to T4, NeverSink's rare base tiers). Every other rule is left out:

  exhide, restex   NeverSink's hide and catch-all rules, not a tier
  supplies, leveling, socketleveling   shown while levelling or by stack, not a tier
  a Class line with no BaseType list (the T5 rare catch-all: every base of those classes the lists above miss)
  BaseType without ==, which catches by part of a name

An item two lists name keeps the first, the way the game reads a filter top down. Only names the site has a card
for are kept: the base cards in data/index.json, the currency cards in data/index.json and data/market.json.

Last good wins (tools/lastgood.py): a release that cannot be read, or one that comes back with far fewer tiers,
keeps the committed file, says so, and the run fails.

    python tools/filtertiers.py
"""
import datetime as dt
import json
import re
import sys
import urllib.request
from urllib.parse import quote

import lastgood

REPO = 'NeverSinkDev/NeverSink-Filter-for-PoE2'
HOME = 'https://github.com/' + REPO
LATEST = 'https://api.github.com/repos/' + REPO + '/releases/latest'
RAW = 'https://raw.githubusercontent.com/' + REPO + '/%s/%s'
FILE = "NeverSink's filter 2 - 0-SOFT.filter"   # the strictness that hides nothing
UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'
OUT = 'filtertiers.json'
FLOOR = 400          # the 0.10.4 release gives 918 names with a card; under this the reading has broken

# NeverSink's tier lists: their type, and the kind of card their items are
TIERED = {
    'currency': 'c', 'currency->emotions': 'c', 'currency->catalysts': 'c', 'currency->essence': 'c',
    'currency->omen': 'c', 'fragments->generic': 'c', 'sockets->general': 'c', 'xenotiering': 'c',
    'gems->lineage': 'c',
    'rr': 'b', 'rr->jewellery': 'b',
}
LETTER = re.compile(r'^([sabcde])$')          # NeverSink's economy tiers
NUMBER = re.compile(r'^t(\d)(?:_[a-z0-9]+)?$')  # NeverSink's rare base tiers: t1_top and t1_other are both T1
HEAD = re.compile(r'^(Show|Hide|Minimal)\b(.*)$')
TYPE = re.compile(r'\$type->(\S+)')
TIER = re.compile(r'\$tier->(\S+)')


def read(url, accept=None):
    head = {'User-Agent': UA}
    if accept:
        head['Accept'] = accept
    with urllib.request.urlopen(urllib.request.Request(url, headers=head), timeout=60) as r:
        return r.read().decode('utf-8')


def tier_of(t):
    """NeverSink's tier as the filter's own tier list shows it (S, A, T1), or None where it is not one."""
    m = LETTER.match(t or '')
    if m:
        return m.group(1).upper()
    m = NUMBER.match(t or '')
    return 'T' + m.group(1) if m else None


def blocks(text):
    """Every rule of the filter: its type, its tier, and the names its BaseType == line lists."""
    out, cur = [], None
    for line in text.splitlines():
        m = HEAD.match(line)
        if m:
            ty, ti = TYPE.search(m.group(2)), TIER.search(m.group(2))
            cur = {'type': ty.group(1) if ty else None, 'tier': ti.group(1) if ti else None, 'names': [], 'exact': True}
            out.append(cur)
            continue
        s = line.strip()
        if cur is None or not s:
            cur = None if not s else cur
            continue
        if s.startswith('BaseType'):
            parts = s.split(None, 2)
            cur['exact'] = cur['exact'] and len(parts) > 1 and parts[1] == '=='
            cur['names'] += re.findall(r'"([^"]+)"', s)
    return out


def cards():
    """The names the site has a card for, per kind."""
    index = lastgood.committed('index.json') or {}
    have = {'b': set(), 'c': set()}
    for it in index.get('items') or []:
        if it.get('k') in have:
            have[it['k']].add(it['n'])
    market = lastgood.committed('market.json', quiet=True) or {}
    for key, m in (market.get('items') or {}).items():
        if key.startswith('c:') and m.get('n'):
            have['c'].add(m['n'])
    return have


def build():
    rel = json.loads(read(LATEST, 'application/vnd.github+json'))
    tag = rel.get('tag_name')
    if not tag:
        raise lastgood.Stale('the latest release names no tag')
    text = read(RAW % (quote(tag), quote(FILE)))
    ver = re.search(r'^#\s*VERSION:\s*(\S+)', text, re.M)
    if not ver:
        raise lastgood.Stale('the filter file carries no VERSION line')
    have = cards()
    tiers, twice, left = {}, 0, 0
    for b in blocks(text):
        kind, tier = TIERED.get(b['type']), tier_of(b['tier'])
        if not kind or not tier or not b['exact'] or not b['names']:
            continue
        for n in b['names']:
            key = kind + ':' + n
            if key in tiers:
                twice += tiers[key] != tier
                continue
            if n not in have[kind]:
                left += 1
                continue
            tiers[key] = tier
    print('NeverSink %s (%s): %d names with a card, %d without one, %d named by two tiers (the first kept)'
          % (ver.group(1), tag, len(tiers), left, twice))
    return {'src': "NeverSink's loot filter " + ver.group(1), 'url': HOME + '/releases/tag/' + quote(tag),
            'made': (rel.get('published_at') or dt.date.today().isoformat())[:10],
            'tiers': dict(sorted(tiers.items()))}


def main():
    out = lastgood.pull("NeverSink's filter tiers", build, file=OUT, url=HOME, at='tiers', floor=FLOOR)
    if out is not None:
        lastgood.save(lastgood.DATA / OUT, json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True) + '\n')
        n = {}
        for key in out['tiers']:
            n[key[0]] = n.get(key[0], 0) + 1
        print('data/%s: %d bases, %d currency' % (OUT, n.get('b', 0), n.get('c', 0)))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, "NeverSink's filter tiers", file=OUT, url=HOME))
