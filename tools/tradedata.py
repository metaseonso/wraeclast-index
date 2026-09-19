"""Build data/trade.json: what the Trade button needs to write an official trade search.

Source: the official trade site's own data lists (https://www.pathofexile.com/api/trade2/data/...).
Run once per game patch:   python tools/tradedata.py

Output:
  mods      every searchable mod: [trade id, wording]. The id prefix is its kind: explicit, implicit,
            enchant, rune (augment), desecrated, fractured, crafted, pseudo (the site's totals).
            A wording ending in "(Local)" is the version that sits on a weapon or armour itself.
  exchange  currency-type item name  ->  exchange id (for the bulk exchange)
  uniques   unique name  ->  base types it comes on
  states    item-state filters: corrupted, twice corrupted, cultivated Vaal unique, sanctified, ...
  options   the site's own choices for category, rarity, "listed within" and price currency
  bases     every non-unique base type, by group (for "I want a ... ")
"""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
API = 'https://www.pathofexile.com/api/trade2/data/'
UA = 'wraeclast-index/1.0 (+https://github.com/metaseonso/wraeclast-index)'
KINDS = ('explicit', 'implicit', 'rune', 'desecrated', 'fractured', 'enchant', 'crafted')


def get(name):
    req = urllib.request.Request(API + name, headers={'User-Agent': UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)['result']


def main():
    stats = get('stats'); time.sleep(1)
    items = get('items'); time.sleep(1)
    static = get('static'); time.sleep(1)
    filters = get('filters')
    out = {'mods': [], 'exchange': {}, 'uniques': {}, 'states': [], 'options': {}, 'bases': {}}
    for group in stats:
        if group.get('id') not in KINDS + ('pseudo',):
            continue
        for e in group.get('entries', []):
            out['mods'].append([e['id'], e['text']])
    for group in items:
        for e in group.get('entries', []):
            if (e.get('flags') or {}).get('unique') and e.get('name'):
                bases = out['uniques'].setdefault(e['name'], [])
                if e['type'] not in bases:
                    bases.append(e['type'])
    for group in filters:   # the site's own option lists
        for f in group.get('filters', []):
            if f['id'] in ('category', 'rarity', 'indexed', 'price'):
                out['options'][f['id']] = [[o.get('id'), o.get('text')] for o in f['option']['options'] if o.get('id')]
    for group in items:
        seen = set()
        for e in group.get('entries', []):
            if not (e.get('flags') or {}).get('unique') and e.get('type') and e['type'] not in seen:
                seen.add(e['type'])
                out['bases'].setdefault(group['label'], []).append(e['type'])
    for group in filters:   # yes/no item states from the Miscellaneous group
        if group.get('id') != 'misc_filters':
            continue
        for f in group.get('filters', []):
            opts = [o.get('id') for o in (f.get('option') or {}).get('options', [])]
            if 'true' in opts and 'false' in opts and f['id'] != 'identified':
                out['states'].append([f['id'], f.get('text') or f['id']])
    for group in static:
        for e in group.get('entries', []):
            if e.get('id') and e.get('text'):
                out['exchange'][e['text']] = e['id']
    (ROOT / 'data' / 'trade.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print({k: len(v) for k, v in out.items()}, 'states:', [x[1] for x in out['states']])


if __name__ == '__main__':
    sys.exit(main())
