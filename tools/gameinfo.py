"""Build data/info.json (what each tradeable non-equipment item does, in the game's own words, and
its picture) and data/reqs.json (level and attribute requirements of every base item).

Covers currency, omens, fragments, breachstones and every augment (runes, soul cores, idols).
Run once per game patch:   python tools/gameinfo.py
Source: the official game files, as exported by RePoE (https://repoe-fork.github.io/poe2/).
Gem requirements need no file: see GEM_LEVELS in assets/app.js.
"""
import json
import re
import sys
import urllib.request
from pathlib import Path

import lastgood

ROOT = Path(__file__).resolve().parent.parent
REPOE = 'https://repoe-fork.github.io/poe2/'
CLASSES = {'StackableCurrency', 'Omen', 'MapFragment', 'Breachstone', 'PinnacleKeyStackable', 'SoulCore',
           'UncutSkillGemStackable', 'UncutReservationGemStackable', 'UncutSupportGemStackable', 'VaultKey',
           'DelveStackableSocketableCurrency', 'IncubatorStackable'}
RAW = re.compile(r'(?<![\w\[./-])[a-z][a-z0-9]*(?:_[a-z0-9%+]+){2,}|\{[^}\s]{1,80}\}')


def get(name):
    req = urllib.request.Request(REPOE + name, headers={'User-Agent': 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


GLUE = re.compile(r'(?:\b(?:a|an|the|your|next|of|to|with|and|or|for|in|on|by|per|up)|,)$', re.I)


def plain(t):
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    t = re.sub(r'\[([^\]]+)\]', r'\1', t)
    out = ''
    for x in (x.strip() for x in t.replace('\r', '').split('\n')):
        if not x:
            continue
        # the game wraps long sentences: a break mid-sentence is a space, a break between stats is a dot
        if not out:
            out = x
        elif x[0].islower() or GLUE.search(out):
            out += ' ' + x
        else:
            out += ' · ' + x
    return out


def main():
    bases = get('base_items.min.json')
    augments = get('augments.min.json')
    reqs = {'bases': {}}
    for b in bases.values():
        r = b.get('requirements')
        if b.get('release_state') == 'released' and r and b['name'] not in reqs['bases']:
            reqs['bases'][b['name']] = [r.get('level', 0), r.get('strength', 0), r.get('dexterity', 0), r.get('intelligence', 0)]
    # Last good wins (tools/lastgood.py): an export that came back short never strips the cards of their
    # requirements or their item text. 500 is the floor both lists have always cleared.
    if lastgood.pull('Item requirements', lambda: reqs, file='reqs.json', url=REPOE, at='bases', floor=500) is not None:
        lastgood.save(ROOT / 'data' / 'reqs.json', json.dumps(reqs, separators=(',', ':')))
        print(len(reqs['bases']), 'bases with requirements -> data/reqs.json')
    info = {}
    for path, b in bases.items():
        if b.get('release_state') != 'released' or b.get('item_class') not in CLASSES:
            continue
        props = b.get('properties') or {}
        text = plain(props.get('description', ''))
        aug = augments.get(path)
        if aug:  # runes and soul cores: what they grant in each kind of item
            parts = []
            for slot, c in (aug.get('categories') or {}).items():
                lines = ' · '.join(plain(x) for x in c.get('stat_text', []))
                if lines:
                    parts.append(slot + ': ' + lines)
            text = ' — '.join(parts) or text
        if not text:
            text = plain(props.get('directions', ''))
        if not text or RAW.search(text):
            continue
        entry = {'t': text, 'cls': b['item_class']}
        if b.get('drop_level', 0) > 1:
            entry['dl'] = b['drop_level']
        art = (b.get('visual_identity') or {}).get('dds_file') or ''
        if art.endswith('.dds'):   # the item's art in the game files; tools/market.py uses it when poe.ninja has none
            entry['a'] = art[:-4]
        if b['name'] in info and info[b['name']] != entry:
            continue  # keep the first of several same-named bases
        info[b['name']] = entry
    for b in bases.values():   # lineage supports trade on the currency exchange too: their picture only
        art = (b.get('visual_identity') or {}).get('dds_file') or ''
        if (b.get('release_state') == 'released' and '/Lineage/' in art and art.endswith('.dds')
                and b['name'] not in info and not b['name'].startswith('[')):
            info[b['name']] = {'cls': b['item_class'], 'a': art[:-4]}
    out = ROOT / 'data' / 'info.json'
    if lastgood.pull('Item text', lambda: info, file='info.json', url=REPOE, floor=500) is not None:
        lastgood.save(out, json.dumps(info, ensure_ascii=False, separators=(',', ':')))
        print(len(info), 'items described ->', out.relative_to(ROOT))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, {'Item requirements': 'reqs.json', 'Item text': 'info.json'}, url=REPOE))
