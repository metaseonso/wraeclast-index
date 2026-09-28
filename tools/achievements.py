"""data/achievements.json: every achievement and league challenge, what it asks in plain words, where it belongs,
and the cards it needs (issue #91). The data half: the card is proposed in design/achievements.md.

One official source, the game's own tables, read by tools/datpull.mjs into data/game/:
  achievements        Achievements, AchievementItems (the steps), and the tables that name what a step counts:
                      MonsterVarieties and MonsterDeathAchievements (the monsters), CurrencyItems and
                      Expedition2CraftingAchievements (the items used), AchievementOmenTypes (the omens)
  achievement_sets    AchievementSetsDisplay and AchievementSetRewards: which set is which league, and its rewards
Joined, by name only, to the cards the site already has (tools/cardnames.py): data/index.json, data/bosses.json
and data/areas.json.

Per achievement, a player's words only:

  name, text  the game's own: its title and what it asks
  set         "Achievements" for the permanent ones; a league's name for its challenges, read off the set's own
              reward line ("the Runes of Aldur Challenger Trophy"); "Challenges" for a set the files tie to no league
  where       Act 1 ... Act 4, Interlude, Campaign (more than one act), Endgame or General. Ours, worked out in this
              order, the first that answers wins: the act the text names (two or more: Campaign); the word
              Campaign; the words Map, Atlas, Pinnacle, Endgame, Logbook or Simulacrum, or a pinnacle boss
              (bosses.json); the acts of the areas its monsters and its words name; else General. A monster fought
              in the campaign and in maps is linked to the areas of the part it belongs to
  only        Softcore or Hardcore where the game keeps it to one
  count       how many times, where it asks more than once ("Open 50 Rare Chests": 50)
  need        how many of its steps count, where not all of them do
  steps       the game's own step names: count where a step counts more than once, kill the monsters it counts
              (the game's names), in the areas they are fought in (areas.json), use the items that count for it
              (bosses.json's areas are maps: a monster it names only there is fought in no area of the campaign)
  areas, bosses, items, mechanics, keywords
              the cards it links to, by name: areas (areas.json), bosses (bosses.json), items (bases, uniques,
              currency), mechanics (the game's content keywords, "Contains..."), keywords (the rest of the keyword
              cards its text marks up). A name no card answers to is left out and counted in "nocard"
  how         a short line, only where the files say it outright: the monster a "powerful enemy" is, and the
              area it is fought in. Otherwise there is no line, never a guess
  source      "Source: ..." for the parts that are not the game's own tables

  id          the game's own id. Never shown (#12): the card keys on it, nothing draws it

Run after tools/datpull.mjs:   python tools/achievements.py            write data/achievements.json
                               python tools/achievements.py --report   count, write nothing
"""
import argparse
import datetime as dt
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import cardnames  # noqa: E402
import lastgood  # noqa: E402

OUT = 'achievements.json'
ENDGAME_WORDS = re.compile(r'\b(maps?|atlas|pinnacle|endgame|logbook|simulacrum)\b', re.I)
CAMPAIGN = re.compile(r'\bCampaign\b')
ACT = re.compile(r'\b(Act \d|Interlude)\b')
LEAGUE = re.compile(r'the (.+?) Challenger Trophy')


def matcher(names):
    """One pattern for many names, longest first, whole words; a leading "The" may be left off in the text."""
    alts = sorted({n for n in names if n and len(n) > 3}, key=len, reverse=True)
    if not alts:
        return None
    body = '|'.join(re.escape(re.sub(r'^The ', '', n)) for n in alts)
    return re.compile(r'(?<![\w\'])(?:The |the )?(' + body + r')(?![\w\'])')


def found(pat, text, names):
    """The card names a text names, in the order it names them."""
    if not pat or not text:
        return []
    bare = {re.sub(r'^The ', '', n): n for n in names}
    return list(dict.fromkeys(bare.get(m.group(1), m.group(1)) for m in pat.finditer(text)))


def build(areas_arg=None):
    rows, source = cardnames.game('achievements')
    sets, _ = cardnames.game('achievement_sets')
    ix = cardnames.index()
    boss_areas, pinnacle = cardnames.bosses()
    areas, areas_from = cardnames.areas(areas_arg)
    act_of = {a['n']: a.get('act') for a in areas}
    fought = {}                                   # monster name -> the areas that list it as their boss
    for a in areas:
        for b in a.get('boss') or []:
            fought.setdefault(b['n'], []).append(a['n'])
    for b, where in boss_areas.items():
        fought.setdefault(b, []).extend(x for x in where if x not in fought.get(b, []))
    items = cardnames.items()
    keywords = {kid: n for n, kid in ix.get('w', {}).items()}
    area_pat = matcher(act_of)
    item_pat = matcher([n for n in items if ' ' in n])      # one-word item names are too common a word to find in text

    label = {}
    for s in sets:
        lg = next((m.group(1) for r in s.get('rewards') or [] for m in [LEAGUE.search(r['text'])] if m), None)
        label[s['set']] = (lg, s.get('title'))
    monster_pat = matcher(fought)
    nocard = Counter()
    out = []
    for r in rows:
        league, title = label.get(r['set'], (None, None))
        kill = list(r.get('kill') or [])
        steps = r.get('steps') or []
        said = r['text'] + ' ' + ' '.join(st['name'] for st in steps)
        # every monster it counts: the files' own, and a boss the text names ("Slay the Bloated Miller")
        named = found(monster_pat, r['text'], fought)
        counted = list(dict.fromkeys(kill + named + [k for st in steps for k in st.get('kill') or []]))

        # where it belongs, first answer wins: the act the text names, the Campaign or the endgame by name,
        # a pinnacle boss, the acts of the areas its monsters and its words name
        acts = list(dict.fromkeys(m.group(1) for m in ACT.finditer(said)))
        in_text = found(area_pat, said, act_of)
        area_acts = list(dict.fromkeys(act_of[x] for x in in_text + [y for k in counted for y in fought.get(k, [])]))
        if acts:
            where = acts[0] if len(acts) == 1 else 'Campaign'
        elif CAMPAIGN.search(r['text']):
            where = 'Campaign'
        elif ENDGAME_WORDS.search(r['text']) or pinnacle & set(counted):
            where = 'Endgame'
        elif area_acts:
            where = area_acts[0] if len(area_acts) == 1 else 'Endgame' if 'Endgame' in area_acts else 'Campaign'
        else:
            where = 'General'

        def fought_in(k):
            """Where a monster is fought, kept to the part of the game the achievement belongs to."""
            at = fought.get(k, [])
            if where == 'Endgame':
                return [x for x in at if act_of.get(x, 'Endgame') == 'Endgame']
            if where != 'General':
                return [x for x in at if act_of.get(x, 'Endgame') != 'Endgame']
            return at

        links = {'areas': [], 'bosses': [], 'items': [], 'mechanics': [], 'keywords': []}

        def add(kind, name):
            if name and name not in links[kind]:
                links[kind].append(name)

        out_steps = []
        for st in steps:
            s = {'name': st['name']}
            if st.get('count'):
                s['count'] = st['count']
            if st.get('kill'):
                s['kill'] = st['kill']
                at = list(dict.fromkeys(x for k in st['kill'] for x in fought_in(k)))
                if at:
                    s['in'] = at
            use = (st.get('use') or []) + (st.get('own') or [])
            if use:
                s['use'] = use
            out_steps.append(s)
        for k in counted:
            if k in boss_areas:
                add('bosses', k)
            for x in fought_in(k):
                add('areas', x)
        for x in in_text:
            add('areas', x)
        for u in (r.get('use') or []) + [u for st in steps for u in (st.get('use') or []) + (st.get('own') or [])] + \
                [st['name'] for st in steps if st['name'] in items] + found(item_pat, r['text'], items):
            if u in items:
                add('items', u)
            else:
                nocard.update(['item'])
        for kid in r.get('keywords') or []:
            if kid in keywords:
                add('mechanics' if kid.startswith('Contains') else 'keywords', keywords[kid])
            else:
                nocard.update(['keyword'])

        # the how: only where the files name the monster outright and the areas file names where it is fought
        how = ['Defeat ' + k + ' in ' + ' or '.join(fought_in(k)[:3]) + '.' for k in kill if fought_in(k)]
        e = {'name': r['name'], 'id': r['id'], 'text': r['text'],
             'set': league or ('Achievements' if title == 'Achievements' else 'Challenges'), 'where': where}
        if r.get('only'):
            e['only'] = r['only']
        if r.get('count'):
            e['count'] = r['count']
        if r.get('need'):
            e['need'] = r['need']
        if out_steps:
            e['steps'] = out_steps
        e.update({k: v for k, v in links.items() if v})
        if how:
            e['how'] = how
            e['source'] = 'Source: game files (MonsterDeathAchievements), and the areas file for where'
        out.append(e)
    rewards = [{'set': label[s['set']][0] or ('Achievements' if s.get('title') == 'Achievements' else 'Challenges'),
                'rewards': [{'after': x['after'], 'text': re.sub(r'^Congratulations!\s*', '', x['text'])}
                            for x in s.get('rewards') or []]}
               for s in sets if s.get('rewards')]
    counts = Counter(e['where'] for e in out)
    return {'source': source, 'updated': dt.date.today().isoformat(), 'ids': ['id'], 'flags': cardnames.FLAGS,
            'sources': [source + ' (Achievements, AchievementItems and the tables that name their steps)'] +
                       (['the areas file (' + areas_from + ')'] if areas_from else []),
            'counts': {'achievements': len(out), 'sets': dict(Counter(e['set'] for e in out)), 'where': dict(counts),
                       'linked': sum(1 for e in out if any(e.get(k) for k in links)), 'how': sum(1 for e in out if e.get('how')),
                       'nocard': dict(nocard)},
            'rewards': rewards, 'achievements': out}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--report', action='store_true', help='count and say, write nothing')
    ap.add_argument('--areas', help='another copy of data/areas.json')
    a = ap.parse_args()
    doc = lastgood.pull('Achievements', lambda: build(a.areas), file=OUT, at='achievements')
    if doc is None:
        return lastgood.report()
    print('achievements:', doc['counts'])
    if not a.report:
        print('  wrote data/%s, %s bytes' % (OUT, format(cardnames.write(OUT, doc), ',')))
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Achievements', file=OUT))
