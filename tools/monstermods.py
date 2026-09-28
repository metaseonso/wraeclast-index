"""data/monstermods.json: every rare monster modifier a player can meet, what it does, and what it does to you.

A rare monster wears its modifiers as names over its life bar ("Conjures Ice Prisons", "Temporal Bubble") and
nothing in the game says what a name does at the moment it matters. The game files hold three things about
them (#112):

  the name      data/game/monster_modifiers.json (tools/datpull.mjs, from ArchnemesisMods): 196 rows, one name
                on each. A name is on two rows or more where the game keeps one for a magic monster and one for
                a rare, or a weaker and a stronger step; 97 names in all. One entry per name, every row in it.
  the lines     the same file: the modifier's stats, worded by the game's own stat descriptions (RePoE's
                export of them, the translations every builder here reads). 65 rows have them; 22 more hold only stats
                the game never words, kept by datpull under "hidden".
  the help text the game's keyword help (keywords.min.json, RePoE's export of the game's own help entries,
                tools/gamepull.py). The game writes one for most of these, keyed Monster... and titled with
                the modifier's name: "Monster creates circular walls of Ice around enemies." That is the
                plain-words line, in the game's words.

What is left is a name with neither: a modifier whose whole effect is a skill the monster casts ("Trail of
Fire", "Kurgal's Last Gasp"). The game gives those no words, so neither does this file: the entry is the
name, and its tags (below) say they come from the name alone.

The tags say what a modifier does to you, in the same words #77 tags map modifiers with, so one filter can
read both: extra element, less recovery, reflect-like, curse, and so on (TAGS, in the order a card shows
them). A tag is read off the game's own words (the lines and the help text) and the stats the game never
words. Where a modifier has no words at all its tags are read off its name, and "est" lists those: a card
says Estimate beside them.

Nothing here reads an id: a stat the game never shows sits in data/game/ under "hidden" and is only matched
against, and the keyword ids in "kw" and "kwx" are the doors a card opens and the keyword card this one
stands for, never drawn. design/monster-mods.md is how a card shows it.

It reads data/game/monster_modifiers.json and the export's keywords (cached, tools/cache/official). It is the
pipeline's `monstermods` stage, after `datpull`:

    python tools/pipeline.py --only monstermods
    python tools/monstermods.py --report    count and say what would change, write nothing
"""
import argparse
import json
import re
import sys
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gamepull import official  # noqa: E402
from gamelib import SHOWN, untag  # noqa: E402
from sync import DNT, KWREF, RAW, plain  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'data' / 'game' / 'monster_modifiers.json'
OUT = ROOT / 'data' / 'monstermods.json'
KIND = 'Rare monster modifier'
GAME = 'Source: the game files'
HELP = "Source: the game's help text, read by RePoE"
BOTH = "Source: the game files, and the game's help text read by RePoE"

# The help entry for a name whose entry is titled another way, by its key in the export: the game titles the
# corruption "Corrupted Monsters", and "Reviving Minions" is also the title of the minion mechanic's own entry.
ALIAS = {'Corrupted': 'CorruptedMonster', 'Reviving Minions': 'MonsterRevivesMinions1'}

# What a modifier does to you, in #77's words. Each: the tag, then what matches it in the game's words
# (lines and help text, lower case), in the stats the game never words, and in the name alone. Order is the
# order a card shows them in: what stops your build first, what makes the fight longer last.
TAGS = [
    ('less recovery',      r'cannot recover|not be able to recover|energy shield\]? recovery rate|drains mana',
                           None, r'Recovery|Siphons Mana'),
    ('fewer flask charges', r'flask.{0,20}charges', None, r'Flask'),
    ('reflect-like',       r'when \[?hit\b|when hit\b|explodes after taking|creates volatile crystals when',
                           None, r'When Hit|Barrier'),
    ('curse',              r'\bcurse', None, r'Curse'),
    ('slows you',          r'\bhinders?\b|slowing by|reduced action speed|chills from your hits', None,
                           r'Hinder|Temporal|Ice Prison'),
    ('breaks armour',      r'breaks? armour|break armour', None, None),
    ('extra element',      r'damage as extra (?:fire|cold|lightning|chaos)', None,
                           r'^Extra (?:Fire|Cold|Lightning|Chaos) Damage$'),
    ('ailment on hit',     r'hits always|on hit\b|inflict bleeding|poison on hit', None,
                           r'Always|All Damage (?:Ignites|Chills|Shocks)'),
    ('damage bursts',      r'explod|barrages?|unleash', None, r'Explo|Volatile|Bombardier|unleashes|Meteor|Eruption|Geysers'),
    ('teleports',          r'teleport', None, r'Walker'),
    ('ground effect',      r'ground|trail of|walls of|circular effect|circles', None,
                           r'Ground|Trail|Conjures|Geysers|Hazards|Runes|Desecration'),
    ('on death',           r'on death|upon the monster.s death|when slain|after death', r'on_death|after_death',
                           r'on Death|Last Gasp|Demise|Eruption|Revenants'),
    ('cannot be damaged',  r'invulnerable|cannot be damaged|damage absorption|taken from monster.s pack',
                           r'cannot_take_damage|(?<!ignore_)cannot_be_damaged|damage_removed_from', r'Invulnerab|Undying|Tangib'),
    ('more crits',         r'critical hit chance|chance to critical', None, r'Crits$'),
    ('more accuracy',      r'accuracy', None, r'Accura'),
    ('stuns you',          r'stun\]? buildup|stun buildup', None, r'^Stuns$'),
    ('faster',             r'(?:attack|cast|movement|skill).{0,20}speed|enrage', None, r'Haste|Enrage'),
    ('more area',          r'area of effect|additional projectiles', None, r'Area|Projectiles|Bombardier'),
    ('stronger pack',      r'minion|revives|allies', None, r'Minion|Aura|Legion'),
    ('resists fire',       r'fire resistance|all elemental resistances', None, r'Fire Resistant'),
    ('resists cold',       r'cold resistance|all elemental resistances', None, r'Cold Resistant'),
    ('resists lightning',  r'lightning resistance|all elemental resistances', None, r'Lightning Resistant'),
    ('resists chaos',      r'chaos resistance', None, r'Chaos Resistant'),
    ('harder to kill',     r'increased (?:maximum )?life|added \[?energy ?shield|extra armour|extra evasion|\barmour\] based|'
                           r'\bevasion\] based|less damage taken|stun threshold|cannot be \[?stun|regenerat|'
                           r'reduced critical damage bonus|slowing\]? potency', r'for_armour|for_evasion|energy_shield',
                           r'Resistant|Armoured|Evasive|Increased Life|Regenerates|Undying'),
]
TAGS = [(t, re.compile(w, re.I), re.compile(h) if h else None, re.compile(n) if n else None) for t, w, h, n in TAGS]


def helps():
    """{name: (key, the words)} for the game's help entries on monster modifiers, keyed by their own title."""
    out = {}
    for k, v in official('keywords.min.json').items():
        term, text = (v.get('term') or '').strip(), (v.get('definition') or '').strip()
        if not k.startswith('Monster') or not term or not text or DNT.search(term + text):
            continue
        # two steps of one modifier share a title ("Shroud Walker" 1 and 2): the higher step, which says more
        if term not in out or k > out[term][0]:
            out[term] = (k, text)
    kws = official('keywords.min.json')
    for name, k in ALIAS.items():
        if k in kws:
            out[name] = (k, kws[k]['definition'].strip())
    return out


def tags(words, hidden, name):
    """What it does to you: (tags, the ones read off the name alone)."""
    text = ' '.join(words).lower()
    ids = ' '.join(hidden)
    got, est = [], []
    for tag, w, h, n in TAGS:
        if w.search(text) or (h and h.search(ids)):
            got.append(tag)
        elif not words and n and n.search(name):
            got.append(tag)
            est.append(tag)
    return got, est


def build():
    src = json.loads(SRC.read_text(encoding='utf-8'))
    help_ = helps()
    by = {}
    for r in src['rows']:
        by.setdefault(r['name'], []).append(r)
    rows = []
    for name, rs in by.items():
        sets = []
        for r in rs:
            if r.get('text') and r['text'] not in sets:
                sets.append(r['text'])
        hidden = sorted({k for r in rs for k in (r.get('hidden') or {})})
        it = {'n': name, 'id': name, 's': KIND, 'steps': len(rs)}
        src_ = []
        if name in help_:
            key, text = help_[name]
            it['t'] = plain(untag(text))
            it['kwx'] = key
            marks = sorted({m.group(1) for m in KWREF.finditer(text)})
            if marks:
                it['kw'] = marks
            src_.append(HELP)
        if sets:
            it['ls'] = sets[0]
            if len(sets) > 1:
                it['alt'] = sets[1:]      # the other steps, where they word it differently
        src_.insert(0, GAME)             # the name, at least, is the game's
        words = ([it['t']] if it.get('t') else []) + [x for s in sets for x in s]
        tg, est = tags(words, hidden, name)
        if tg:
            it['tags'] = tg
            it['q'] = ' '.join(tg)        # the search words: "reflect" finds every reflect-like one
        if est:
            it['est'] = est
        it['src'] = BOTH if len(src_) == 2 else GAME
        rows.append(it)
    check(rows)
    return {'source': 'game files, patch %s; help text from RePoE' % src.get('source', '').rsplit(' ', 1)[-1],
            'table': src.get('table'),
            'note': 'One entry per rare monster modifier name (steps: how many rows of the game files carry it). t is '
                    'the game\'s help text for it, ls its stat lines as the game words them (alt: another step '
                    'worded differently), tags what it does to you (q: the same, as search words), est the tags read off the name alone because '
                    'the game gives it no words. Written by tools/monstermods.py; design/monster-mods.md.',
            'ids': ['kw', 'kwx'], 'rows': rows}


def check(rows):
    """Nothing a player reads may look like game code (tools/sync.py's standard, and the #12 rule)."""
    for it in rows:
        for f in ('n', 's', 't', 'ls', 'alt', 'tags', 'est', 'src'):
            v = it.get(f)
            for x in (v if isinstance(v, list) else [v]):
                for y in (x if isinstance(x, list) else [x]):
                    if y and (RAW.search(y) or DNT.search(y) or any(m.search(y) for m in SHOWN)):
                        sys.exit('game code in %s %r: %r' % (f, it['n'], y))


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--report', action='store_true', help='count and say what would change, write nothing')
    args = ap.parse_args()
    out = build()
    rows = out['rows']
    said = Counter('help text and lines' if it.get('t') and it.get('ls') else 'help text' if it.get('t')
                   else 'lines' if it.get('ls') else 'the name only' for it in rows)
    print('monstermods %d names over %d rows of the game files: %s'
          % (len(rows), sum(it['steps'] for it in rows), ', '.join('%d %s' % (n, k) for k, n in said.most_common())))
    tally = Counter(t for it in rows for t in it.get('tags') or [])
    est = Counter(t for it in rows for t in it.get('est') or [])
    print('        tags: ' + ', '.join('%s %d%s' % (t, tally[t], ' (%d from the name)' % est[t] if est[t] else '')
                                       for t, *_ in TAGS if tally[t]))
    bare = [it['n'] for it in rows if not it.get('tags')]
    if bare:
        print('        no tag: ' + ', '.join(bare))
    text = json.dumps(out, ensure_ascii=False, indent=1) + '\n'
    was = OUT.read_text(encoding='utf-8') if OUT.exists() else ''
    if args.report:
        print('--report: nothing written%s' % ('' if text == was else ' (would change data/monstermods.json)'))
        return 0
    OUT.write_text(text, encoding='utf-8', newline='\n')
    print('-> data/monstermods.json')
    return 0


if __name__ == '__main__':
    sys.exit(main())
