"""data/grants.json: what grants a skill, and what each skill is granted by.

The first edges of the card graph. A card's lines already name other cards as text (tools/nodelinks.py marks
where those names sit), but "this item grants this skill" is a fact the game files state outright, so it is
worth holding as an edge rather than re-reading a sentence: it is exact, it works in both directions, and the
reverse — "what gives me this skill?" — is a question no line on any card answers today.

Three kinds of card grant a skill, and each is read from the place the game says it:

  bases      base_items, "skills_granted": the skill a Withered Wand or an Absent Amulet comes with.
  passives   the passive tree, "granted_skill": the 54 ascendancy nodes whose whole effect is a skill.
  uniques    the unique's own "Grants Skill: ..." line, resolved through the skill list: the line names a
             skill, the skill list says which skill that is, and the gem list says which gem grants it.
             Where the skill list has no such name, the name is matched against the gem cards instead, and
             that edge is marked as coming from the item's wording rather than from the files.

Nothing is ever guessed. Where a name could mean two cards (Herald of Ash is two gem entries, Decompose is
two), no edge is written at all; the pair is listed under "amb" instead, so the page can say the game does
not settle it and a later run can pick it up if the files ever do.

Every edge carries where it came from, so a page can name the source. Today both sources are official; the
field is there so a named-but-unofficial source can be added later without changing the shape.

What is written (ids, never names — the card layer already has the names, the same way data/kwuse.json works):

  "by"    node key -> [[skill node key, source], ...]   what this card grants
  "of"    skill node key -> [[node key, source], ...]   what grants this skill
  "amb"   [[node key, the name the line used, [the node keys it could mean]], ...]
  "src"   source letter -> the words a page can print for it

Run it after tools/sync.py and tools/gamelib.py (it resolves against the cards those two write) and before
tools/kwuse.py. It writes one file and touches nothing else, so re-running it is free.

Usage:
  python tools/grants.py            write data/grants.json
  python tools/grants.py --report   count and say what it would write, write nothing
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import official, patch  # noqa: E402
from gamelib import TREE, dated  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'index.json'
OUT = ROOT / 'data' / 'grants.json'

# Where an edge came from. Both are official today; a page prints these words, so they stay plain.
SRC = {'f': 'the official game files', 'w': "the item's own wording"}
# A unique's line: "Grants Skill: Spear Throw", "Grants Skill: Level 15 The Stars Answer".
GRANTS = re.compile(r'^Grants Skill: (?:Level \d+ )?(.+)$')


def key(kind, ident):
    return kind + ':' + ident


class Cards:
    """The cards this index has, in the shapes the three readers below need."""

    def __init__(self, index):
        self.gem = {it['id'] for it in index['items'] if it['k'] == 'g'}
        self.base = {it['n'] for it in index['items'] if it['k'] == 'b'}
        self.passive = {it['id'] for it in index['items'] if it['k'] == 'p'}
        self.gem_by_name = defaultdict(list)
        for it in index['items']:
            if it['k'] == 'g':
                self.gem_by_name[it['n']].append(it['id'])

    def gem_key(self, path):
        """The gem card a granted-skill path points at, if we card it."""
        gid = path.rsplit('/', 1)[-1]
        return key('g', gid) if gid in self.gem else None


def skill_index():
    """Skill name -> the gem cards that grant a skill of that name, from the official lists.

    skills.min.json names every skill the game has; skill_gems.min.json says which skills each gem grants.
    Together they turn the name on a unique's line into a gem without reading the name twice."""
    by_skill = defaultdict(list)
    for path, v in official('skill_gems.min.json').items():
        for s in v.get('grants_skills') or []:
            by_skill[s].append(path)
    out = defaultdict(set)
    for sid, v in official('skills.min.json').items():
        name = ((v.get('active_skill') or {}).get('display_name') or '').strip()
        if name:
            out[name].update(by_skill.get(sid, ()))
    return out


# ---------------------------------------------------------------- the three readers

def from_bases(cards):
    """A base item's own skill: base_items "skills_granted"."""
    out, lost = [], []
    for path, v in official('base_items.min.json').items():
        name = v.get('name') or ''
        if not v.get('skills_granted') or name not in cards.base:
            continue
        for s in v['skills_granted']:
            gem = cards.gem_key(s)
            if gem:
                out.append((key('b', name), gem, 'f'))
            else:
                lost.append(name)
    return out, lost


def from_passives(cards):
    """An ascendancy node's own skill: the passive tree's "granted_skill"."""
    out, lost = [], []
    for node in official(TREE)['passives'].values():
        skill, nid = node.get('granted_skill'), node.get('id') or ''
        if not skill or nid not in cards.passive:
            continue
        gem = cards.gem_key(skill)
        if gem:
            out.append((key('p', nid), gem, 'f'))
        else:
            lost.append(node.get('name') or nid)
    return out, lost


def from_uniques(index, cards):
    """A unique's "Grants Skill: ..." line, through the skill list first and its own wording second."""
    skills = skill_index()
    out, amb = [], []
    for it in index['items']:
        if it['k'] != 'u':
            continue
        for line in it.get('ls') or []:
            m = GRANTS.match(line)
            if not m:
                continue
            name = m.group(1).strip()
            src = 'f'
            hit = {g for g in (cards.gem_key(p) for p in skills.get(name, ())) if g}
            if not hit:   # no skill of that name in the files: the line's own words against the gem cards
                src = 'w'
                hit = {key('g', g) for g in cards.gem_by_name.get(name, ())}
            if len(hit) == 1:
                out.append((key('u', it['id']), hit.pop(), src))
            elif hit:
                amb.append([key('u', it['id']), name, sorted(hit)])
    return out, amb


# ---------------------------------------------------------------- build

def build(index):
    cards = Cards(index)
    b, blost = from_bases(cards)
    p, plost = from_passives(cards)
    u, amb = from_uniques(index, cards)

    by, of = defaultdict(dict), defaultdict(dict)
    for node, gem, src in b + p + u:
        by[node].setdefault(gem, src)     # one edge per pair, however many variants say it
        of[gem].setdefault(node, src)
    out = {'v': 1, 'patch': patch(), 'dated': dated('base_items.min.json'), 'src': SRC,
           'by': {n: [[g, s] for g, s in sorted(v.items())] for n, v in sorted(by.items())},
           'of': {g: [[n, s] for n, s in sorted(v.items())] for g, v in sorted(of.items())}}
    if amb:
        out['amb'] = sorted(amb)
    rep = {'bases': b, 'passives': p, 'uniques': u, 'amb': amb, 'lost': blost + plost,
           'by': out['by'], 'of': out['of']}
    return out, rep


def report(out, rep):
    per = lambda rows: (len(rows), len({r[0] for r in rows}))
    print('grants  %d edges from %d cards, to %d skills' %
          (sum(len(v) for v in out['by'].values()), len(out['by']), len(out['of'])))
    for what, rows in (('bases', rep['bases']), ('passives', rep['passives']), ('uniques', rep['uniques'])):
        print('        %-9s %4d lines -> %3d cards' % (what, *per(rows)))
    w = sum(1 for r in rep['uniques'] if r[2] == 'w')
    print('        uniques: %d of %d through the skill list, %d by the name on the line, %d not settled'
          % (len(rep['uniques']) - w, len(rep['uniques']), w, len(rep['amb'])))
    for node, name, who in rep['amb'][:6]:
        print('          %-44s %-18s %s' % (node, name, ', '.join(who)))
    if len(rep['amb']) > 6:
        print('          ... and %d more' % (len(rep['amb']) - 6))
    if rep['lost']:
        print('        %d granted skills have no card: %s' % (len(rep['lost']), ', '.join(sorted(set(rep['lost']))[:6])))


def main():
    ap = argparse.ArgumentParser(description='Build the grants-skill edges of the card graph.')
    ap.add_argument('--report', action='store_true', help='count and say what it would write, write nothing')
    args = ap.parse_args()

    index = json.loads(INDEX.read_text(encoding='utf-8'))
    out, rep = build(index)
    report(out, rep)
    if args.report:
        print('\n--report: nothing written')
        return
    body = json.dumps(out, ensure_ascii=False, separators=(',', ':'))
    OUT.write_text(body, encoding='utf-8', newline='\n')
    print('\n-> data/grants.json, %d bytes' % len(body.encode('utf-8')))


if __name__ == '__main__':
    sys.exit(main())
