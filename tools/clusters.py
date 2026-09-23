"""The passive tree cut into clusters, one per notable, and the shape of the tree itself.

data/explore/tree.*.json carries every node's name, effect, keywords and region, and nothing about where a
node sits or what it touches. The game's own tree does: `passive_skill_trees/Default.min.json`, which
tools/treecards.py already reads for node pictures, holds 1,623 groups with their coordinates, each node's
orbit and its place on it, and 6,070 connections. This reads that file and writes the two things the index
cannot work out for itself.

The cut, in full (docs/proposal-builder.md settles it against the two others):

  * The main tree is every node that is not an ascendancy node and not an ascendancy start: 4,483 of them —
    3,080 named smalls, 984 notables, 33 keystones, 368 plates with no effect and 18 jewel sockets. 5,393 of
    the 6,070 connections have both ends on it.
  * Every notable and keystone is a cluster, so there are 1,017 of them. A node belongs to the nearest one,
    counted in steps along the tree.
  * A node the same number of steps from two notables is in both clusters, and both say so. The tie is
    carried down the branch rather than stopped where it starts, so 862 of the 4,483 nodes sit in more than
    one cluster. Points are counted once; what the card shows is what is shared.
  * 4,477 nodes are inside a cluster. The 6 that reach no notable at all are jewel sockets on their own, and
    they are counted as outside every cluster rather than folded into one.
  * Against the 2,112 passive cards the index ships, the clusters name 1,820: 1,016 notable and keystone
    cards and 804 small passive cards. The rest are the ascendancy nodes, which are chosen by class and never
    walked to.

What it writes:

  data/tree-shape.json  where every main-tree node sits, what kind it is, every edge between two of them, and
                        the six class starts. The builder's tree preview draws from this, pathing walks it,
                        and a jewel radius published in the tree's own orbit units could be drawn on it
                        exactly. Fetched the first time a card asks for it and never in first paint.
  data/clusters.json    the 1,017 clusters: each one's notable, the rest of its nodes, which nodes are shared
                        with another cluster, and the passive card each node has. Both ends of the
                        relationship are worked out from this one file (assets/edges.js).
  data/index.json       one card per cluster (kind 't'): the notable's name, its own effect lines, its
                        region, how many points are inside it and how many of those are shared.

A cluster card carries the notable's own words and none of its own. It takes the notable's lines, its
keywords and its picture, so nothing of the game's wording is written down twice, and its id is the notable's
own id, so a cluster keeps its address between builds.

Run after tools/treecards.py, which is what puts the small passive cards in the index the members are matched
against, and before tools/map.py, which draws the new kind into the picture. Running it twice adds nothing
twice.

Usage:
  python tools/clusters.py            write the two files and the cluster cards
  python tools/clusters.py --report   count and say what would change, write nothing
"""
import argparse
import json
import math
import statistics
import sys
from collections import Counter, defaultdict, deque
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamelib import SHOWN, drilldown  # noqa: E402
from sync import DNT, RAW, REPOE, SHOWN_FIELDS, plain, remote  # noqa: E402

import lastgood  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
INDEX = ROOT / 'data' / 'index.json'
SHAPE = ROOT / 'data' / 'tree-shape.json'
CLUSTERS = ROOT / 'data' / 'clusters.json'
TREE = 'passive_skill_trees/Default.min.json'
KIND = 't'                 # the letter the index marks a cluster with (assets/kinds.js)
SUB = 'Cluster'            # the first part of its sub line; the region follows it where there is one
# what kind of node each one is, in the shape file: the builder reads these, a player never does
SMALL, NOTABLE, KEYSTONE, JEWEL, PLATE = 0, 1, 2, 3, 4
SORTS = ['small passives', 'notables', 'keystones', 'jewel sockets', 'plates with no effect']


def effect(node):
    """A node's effect, in the game's own words, one line each (as tools/treecards.py writes a card's)."""
    return [plain(y) for x in node.get('t') or [] for y in x.split('\n') if y.strip()]


def check(cards):
    """The standard tools/sync.py holds its own cards to: nothing a player reads may look like game code."""
    for it in cards:
        for f in SHOWN_FIELDS:
            for x in (it.get(f) if isinstance(it.get(f), list) else [it.get(f)]):
                if x and (any(m.search(x) for m in SHOWN) or RAW.search(x) or DNT.search(x)):
                    sys.exit('game code in %s %r: %r' % (f, it['n'], x))


# ---------------------------------------------------------------- the tree, as the game ships it

def game_tree():
    """The game's own tree: groups with coordinates, each node's orbit, and the connections between them."""
    t = remote('repoe-tree.json', REPOE + TREE)
    if not t or not t.get('passives') or not t.get('groups'):
        sys.exit('the game tree did not come back, and nothing is cached')
    return t


def main_tree(tree):
    """The main tree: every node but the ascendancies, each one's place, what kind it is, and its edges.

    A node's place is its group's own point plus its orbit: the orbit's radius, turned by how far round the
    orbit the node sits. Both numbers are the tree's own (`orbit_radii`, `skills_per_orbit`)."""
    nodes = {int(h): p for h, p in tree['passives'].items()
             if not p.get('ascendancy') and not p.get('is_ascendancy_starting_node')}
    radii, per = tree['orbit_radii'], tree['skills_per_orbit']
    where, edges = {}, set()
    for g in tree['groups']:
        for n in g['passives']:
            h = n['hash']
            for c in n.get('connections') or []:
                if h != c and h in nodes and c in nodes:   # a node is never joined to itself (docs/frame.md)
                    edges.add((min(h, c), max(h, c)))
            if h not in nodes:
                continue
            orbit = n.get('radius') or 0
            r, step = radii[orbit], per[orbit]
            a = 2 * math.pi * (n.get('position_clockwise') or 0) / step
            where[h] = (round(g['x'] + r * math.sin(a)), round(g['y'] - r * math.cos(a)))
    return nodes, where, sorted(edges), [h for h in tree['roots'] if h in nodes]


def sort_of(node):
    if node.get('is_jewel_socket'):
        return JEWEL
    if node.get('is_keystone'):
        return KEYSTONE
    if node.get('is_notable'):
        return NOTABLE
    return SMALL if node.get('name') and not node.get('is_icon_only') else PLATE


# ---------------------------------------------------------------- the cut

def cut(nodes, edges):
    """Every node's cluster or clusters, by steps along the tree from the nearest notable or keystone.

    One breadth-first pass out of all 1,017 of them at once. A node one step further out belongs to whatever
    the nodes it came from belong to, so a tie is carried down the branch instead of being broken where it
    starts: a node the same number of steps from two notables is in both, and so is everything behind it that
    is no nearer to either."""
    adj = defaultdict(set)
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    src = sorted(h for h, p in nodes.items() if p.get('is_notable') or p.get('is_keystone'))
    step, owners, order = {h: 0 for h in src}, {h: {h} for h in src}, list(src)
    q = deque(src)
    while q:
        h = q.popleft()
        for m in sorted(adj[h]):
            if m not in step:
                step[m] = step[h] + 1
                owners[m] = set()
                order.append(m)
                q.append(m)
    for h in order:
        if step[h]:
            for m in adj[h]:
                if step.get(m) == step[h] - 1:
                    owners[h] |= owners[m]
    return src, step, owners


def reach(edges, starts):
    """How many steps each node is from the nearest of a set of nodes: the same pass, from somewhere else."""
    adj = defaultdict(set)
    for a, b in edges:
        adj[a].add(b)
        adj[b].add(a)
    step = {h: 0 for h in starts}
    q = deque(starts)
    while q:
        h = q.popleft()
        for m in adj[h]:
            if m not in step:
                step[m] = step[h] + 1
                q.append(m)
    return step


# ---------------------------------------------------------------- the card behind a node

def card_index(index):
    """Two ways to the passive card a node has: by the node's own id, and by its name and its effect.

    A notable or a keystone is carded under its own node id. A small passive is one card for every node of
    the same name with the same effect (tools/treecards.py), so the name and the effect find it."""
    by_id = {it['id'] for it in index['items'] if it['k'] == 'p'}
    by_said = defaultdict(list)
    for it in index['items']:
        if it['k'] == 'p':
            by_said[(it['n'], ' · '.join(it.get('ls') or []))].append(it['id'])
    return by_id, by_said


def card_of(node, by_id, by_said):
    """The passive card this node has, or nothing: 381 smalls with no effect text and 13 jewel sockets have
    none, so they are points inside a cluster and never a row on it."""
    if not node:
        return None
    if node['id'] in by_id:
        return node['id']
    got = by_said.get((node.get('n') or '', ' · '.join(effect(node))))
    return got[0] if got and len(got) == 1 else None


# ---------------------------------------------------------------- the two files

def shape(nodes, where, edges, roots, order, at):
    """Where every main-tree node sits, what kind it is, and every edge between two of them.

    Flat lists, one entry per node in the tree's own numbering order, because the builder walks this by place
    and never by name. A player reads none of it."""
    return {'v': 1, 'x': [where[h][0] for h in order], 'y': [where[h][1] for h in order],
            't': [sort_of(nodes[h]) for h in order],
            'e': [i for a, b in edges for i in (at[a], at[b])],
            'st': [at[h] for h in roots]}


def clusters(src, owners, step, order, at, cards, by_node):
    """The 1,017 clusters: the notable each is named for, the rest of its nodes, what is shared, and the
    passive card each node has. Both ends of the relationship are read out of this (assets/edges.js)."""
    inside = defaultdict(list)
    for h in order:
        if h in step:
            for c in owners[h]:
                if c != h:
                    inside[c].append(at[h])
    shared = sorted(at[h] for h in order if h in step and len(owners[h]) > 1)
    said = {}                              # card id -> its place in the card table
    table = []
    for c in cards:
        said[c] = len(table)
        table.append(c)
    return {'v': 1, 'id': [nid for nid, _ in src], 'at': [at[h] for _, h in src],
            'in': [sorted(inside[h]) for _, h in src], 'sh': shared,
            'cards': table, 'node': [said.get(by_node.get(h), -1) for h in order]}


# ---------------------------------------------------------------- the cards

def rows(src, inside, shared, said, index):
    """One card per cluster: the notable's name, its own words, where it is, and the two counts.

    A cluster's picture is its notable's, which the index already holds, so this never asks a picture server
    for one. A notable the index has no card for has no picture either, and the card draws its first letter
    the way the frame says."""
    have = {it['id'] for it in index['items'] if it['k'] == KIND}
    pics = {it['id']: it.get('img') for it in index['items'] if it['k'] == 'p'}
    out, kept = [], 0
    for nid, h in src:
        if nid in have:
            kept += 1
            continue
        d = said.get(h)
        if not d:
            continue
        reg = d.get('reg') or ''
        it = {'k': KIND, 'id': nid, 'n': d.get('n') or '',
              's': SUB + (' · ' + reg + ' region' if reg else ''),
              'pts': 1 + len(inside[h]), 'ls': effect(d)}
        n_shared = sum(1 for x in inside[h] if x in shared)
        if n_shared:
            it['shr'] = n_shared
        if reg:
            it['reg'] = reg
            it['q'] = reg
        if d.get('kw'):
            it['kw'] = list(d['kw'])
        if pics.get(nid):
            it['img'] = pics[nid]
        out.append(it)
    check(out)
    return out, kept


# ---------------------------------------------------------------- the run

def build(index):
    tree = game_tree()
    nodes, where, edges, roots = main_tree(tree)
    order = sorted(nodes)
    at = {h: i for i, h in enumerate(order)}
    src_h, step, owners = cut(nodes, edges)
    said = {p['h']: p for p in drilldown('trdata')['passives']}
    by_id, by_said = card_index(index)
    by_node = {h: card_of(said.get(h), by_id, by_said) for h in order}

    src = [((said.get(h) or {}).get('id') or nodes[h].get('id'), h) for h in src_h]
    inside = defaultdict(list)
    for h in order:
        if h in step:
            for c in owners[h]:
                if c != h:
                    inside[c].append(h)
    shared = {h for h in order if h in step and len(owners[h]) > 1}

    cards = sorted({c for h, c in by_node.items() if c and h in step})
    sh = shape(nodes, where, edges, roots, order, at)
    cl = clusters(src, owners, step, order, at, cards, by_node)
    new, kept = rows(src, inside, shared, said, index)

    tally = {
        'nodes': len(nodes), 'edges': len(edges), 'clusters': len(src),
        'covered': sum(1 for h in order if h in step),
        'outside': Counter(SORTS[sort_of(nodes[h])] for h in order if h not in step),
        'shared': len(shared), 'memberships': sum(len(v) for v in inside.values()),
        'sizes': sorted(1 + len(inside[h]) for _, h in src), 'named': len(cards), 'kept': kept,
    }
    return sh, cl, new, tally


def write(index, sh, cl, new):
    for path, part in ((SHAPE, sh), (CLUSTERS, cl)):
        lastgood.save(path, json.dumps(part, ensure_ascii=False, separators=(',', ':')))
    if new:
        p = [i for i, it in enumerate(index['items']) if it['k'] == 'p']
        at = (max(p) + 1) if p else len(index['items'])
        index['items'][at:at] = new       # next to the passive cards, so the index keeps its order
        INDEX.write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description='The passive tree cut into clusters, one per notable.')
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    args = ap.parse_args()

    index = json.loads(INDEX.read_text(encoding='utf-8'))
    sh, cl, new, t = build(index)

    sizes = t['sizes']
    print('main tree %d nodes, %d edges -> %d clusters, %d nodes inside one, %d outside every one'
          % (t['nodes'], t['edges'], t['clusters'], t['covered'], t['nodes'] - t['covered']))
    print('        size mean %.2f, median %g, largest %d, %d a notable on its own'
          % (sum(sizes) / len(sizes), statistics.median(sizes), max(sizes), sizes.count(1)))
    print('        %d nodes are in more than one cluster, and both clusters say so' % t['shared'])
    print('        the clusters name %d of the %d passive cards' % (t['named'], sum(1 for it in index['items'] if it['k'] == 'p')))
    if t['outside']:
        print('        outside every cluster: ' + ', '.join('%d %s' % (n, k) for k, n in t['outside'].most_common()))
    for name, part in (('data/tree-shape.json', sh), ('data/clusters.json', cl)):
        body = json.dumps(part, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        print('%s %s bytes' % (name, format(len(body), ',')))
    print('cluster cards %d new, %d already there' % (len(new), t['kept']))

    if args.report:
        print('\n--report: nothing written')
        return 0
    write(index, sh, cl, new)
    import appdata      # the index in two parts for the home page
    appdata.write(index)
    print('\n-> data/tree-shape.json, data/clusters.json, data/index.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
