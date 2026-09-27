"""Freeze what a patch says, so the next patch can be held up against it (#73, #96 W1).

A card says what the game says today and nothing else. "What changed in 0.5.5" needs what it said in 0.5.4 as
well, and the export only ever holds now. So once per patch this keeps the numbers a patch can move — every
gem at every level, every passive, every base item, every modifier and the level of each tier, the Atlas tree,
every unique — under that patch, and tools/diff.py holds two of them side by side.

Only what a patch can change is kept, and only in the game's own words: no art, no search words, no keywords,
no prices. A line is split into its wording and its numbers ("Deals # to # Fire Damage" and [224, 336]), so a
gem's 40 levels are one wording and 40 numbers, and a line that reads the same at every level is kept once.

Source: the official game files, as the RePoE fork exports them (https://repoe-fork.github.io/poe2/), the files
tools/gamepull.py keeps and every builder here reads. The patch on the site now comes from gamepull's copies
(tools/cache/official). A past patch comes from the export's own git history (https://github.com/repoe-fork/poe2,
one commit per export): the same files, read by the same code, so a difference between two snapshots is the
game's, never a difference in how we read it. Uniques are the one exception. The export does not say which
modifiers a unique carries, so they are frozen from data/uniques.json (poe2db, tools/uniques.py) and only from
the patch this started on.

Usage:
  python tools/snapshot.py                     the patch gamepull's copies are from (fetches any it lacks)
  python tools/snapshot.py --past DIR          every past patch in a clone of repoe-fork/poe2 with no snapshot yet
  python tools/snapshot.py --past DIR --since 0.4.0    ... from that patch on (the default: every export it has)
  python tools/snapshot.py --at DIR COMMIT     one export commit of that clone
  python tools/snapshot.py --only uniques      data/uniques.json under the current patch (after tools/uniques.py)
  --force                                      write a patch that already has a snapshot again

  A clone that costs little: git clone --filter=blob:none --no-checkout https://github.com/repoe-fork/poe2
  (history without the files; each file an export needs is fetched when it is read, about a second each).

tools/gamepull.py runs on_pull() after every pull that holds up: the first time it sees a patch, and again when a
hotfix moves the export inside the patch, the patch is frozen (again) and tools/diff.py works out what it changed.

Writes data/history/<patch>/<kind>.json, one entry a line so git keeps a patch as a small delta, and
data/history/patches.json, the list of snapshots. Not shipped (.assetsignore): the site reads the changes
tools/diff.py works out from them, never these.

  gems      gem id: {n name, t gem type, ml levels, st [lines the same at every level],
                     lv {wording: [numbers at level 1, 2, ...; null where the line is not there]}}
  passives  node hash: {id, n, ls [lines]} — the passive tree
  atlas     node hash: {id, n, ls} — the Atlas tree
  bases     name: {c item class, dl drop level, rq [level, str, dex, int], pr [properties], im [implicits]}
  mods      modifier id: {a p/s/c (prefix, suffix, corruption), d 1 when desecrated, lv modifier level,
                          ls [lines], on [the kinds of item it rolls on, as data/craft.json names them]}
  uniques   "Name | Base": {ls, rq} as data/uniques.json has them
"""
import argparse
import datetime
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HISTORY = ROOT / 'data' / 'history'
REGISTRY = HISTORY / 'patches.json'
KINDS = ('gems', 'passives', 'atlas', 'bases', 'mods', 'uniques')
REPOE = 'the official game files, as the RePoE fork exports them (repoe-fork.github.io/poe2)'
NUM = re.compile(r'(?<![\w.])-?\d+(?:\.\d+)?')   # "11-18" is two numbers, 11 and 18; "-10%" is -10
DNT = re.compile(r'\[DNT|\{\d*\}')                # a thing players never see, or a name the game fills in


# ---------------------------------------------------------------- where the files come from

class Export:
    """One export of the game files: gamepull's copies (the patch on the site now), or one commit of the export's
    git history. get() takes the names gamepull uses ("mods.min.json") and answers None for a file that export
    did not have yet (the passive tree only arrives with 0.4)."""

    def __init__(self, repo=None, commit=None):
        self.repo, self.commit, self._got = repo, commit, {}
        if repo:
            said = self._git('log', '-1', '--format=%s%n%cs', commit).split('\n')
            m = re.search(r'Export ([\d.]+)', said[0])
            if not m:
                raise SystemExit('%s is not an export commit: "%s"' % (commit, said[0]))
            self.build, self.dated = m.group(1), said[1]
            self.sha = self._git('rev-parse', '--short', commit).strip()
            self.said = 'repoe-fork/poe2 at %s (export %s)' % (self.sha, self.build)
        else:
            import email.utils
            import gamepull
            self.build = gamepull.build(refresh=False) or gamepull.build()
            dated = [f.get('modified') for f in gamepull.state()['files'].values() if f.get('modified')]
            when = max((email.utils.parsedate_to_datetime(d) for d in dated), default=None)   # as gamepull dates it
            self.dated = when.strftime('%Y-%m-%d') if when else ''
            self.said = 'tools/cache/official (export %s)' % self.build
        self.patch = patch_of(self.build)

    def _git(self, *args):
        return subprocess.run(['git', '-C', str(self.repo)] + list(args), check=True, capture_output=True,
                              text=True, encoding='utf-8').stdout

    def get(self, name):
        if name in self._got:
            return self._got[name]
        if self.repo:
            path = 'data/' + name.replace('.min.json', '.json')
            r = subprocess.run(['git', '-C', str(self.repo), 'show', '%s:%s' % (self.commit, path)], capture_output=True)
            got = json.loads(r.stdout, object_hook=bare) if r.returncode == 0 else None
        else:
            import gamepull
            got = gamepull.official(name)
        self._got[name] = got
        return got


def bare(d):
    """The history holds the full files, which keep every field whose value is null; gamepull's .min copies leave
    them out. Reading one like the other keeps the two shapes one."""
    return {k: v for k, v in d.items() if v is not None}


def patch_of(build):
    """The build as players know it: client 4.5.5.2 is public patch 0.5.5 (tools/gamepull.py patch())."""
    return re.sub(r'^4\.(\d+)\.(\d+).*$', r'0.\1.\2', build or '')


def key(p):
    """"0.5.10" after "0.5.9"."""
    return tuple(int(x) for x in re.findall(r'\d+', p))


# ---------------------------------------------------------------- lines, wording and numbers

def plain(t):
    """Game markup [Id|Shown] or [Id] to plain words."""
    t = re.sub(r'\[([^\]|]+)\|([^\]]+)\]', r'\2', t or '')
    return re.sub(r'\[([^\]]+)\]', r'\1', t).replace('\r', '')


def lines(t):
    return [x.strip() for x in plain(t).split('\n') if x.strip()]


def token(s):
    """A number as it was written: 224 stays a number, 1.20 stays "1.20" so it reads back the same."""
    return int(s) if re.fullmatch(r'-?(?:0|[1-9]\d*)', s) else s


def split(line):
    """"Deals 224 to 336 Fire Damage" -> ("Deals # to # Fire Damage", [224, 336])."""
    return NUM.sub('#', line), [token(x) for x in NUM.findall(line)]


def fill(wording, nums):
    """split(), the other way."""
    it = iter(nums if isinstance(nums, list) else [nums])
    return re.sub('#', lambda m: str(next(it)), wording)


def seconds(ms):
    return ('%.2f' % (ms / 1000))


def real(name):
    return bool(name) and not DNT.search(name)


# ---------------------------------------------------------------- gems

def trim(v, dp, always=False):
    s = '%.*f' % (dp, v)
    return s if always or '.' not in s else s.rstrip('0').rstrip('.')


# the handlers a quality line names after its stat ("{stat/handler}"), as explore.html applies them
HANDLE = {
    'negate': lambda v: trim(-v, 2),
    'divide_by_ten_1dp_if_required': lambda v: trim(v / 10, 1),
    'divide_by_one_hundred_2dp_if_required': lambda v: trim(v / 100, 2),
    'divide_by_one_hundred_0dp': lambda v: trim(v / 100, 0, True),
    'milliseconds_to_seconds': lambda v: trim(v / 1000, 2),
    'milliseconds_to_seconds_1dp': lambda v: trim(v / 1000, 1, True),
    'milliseconds_to_seconds_2dp_if_required': lambda v: trim(v / 1000, 2),
    'per_minute_to_per_second_2dp_if_required': lambda v: trim(v / 60, 2),
}


def quality(q, own):
    """A quality line at 20% quality, the most a gem drops with. The files store each line per 1% quality in
    thousandths (explore.html qRender). A number the line does not scale is the gem's own; a line with a number
    neither holds is left out rather than shown half filled."""
    def one(m):
        sid, _, h = m.group(1).partition('/')
        v = (q.get('stats') or {}).get(sid)
        v = v * 20 / 1000 if v is not None else own.get(sid)
        if v is None:
            raise KeyError(sid)
        return HANDLE.get(h, lambda x: trim(x, 2))(v)
    try:
        said = ' '.join(lines(re.sub(r'\{([^}]+)\}', one, q.get('stat') or '')))
    except KeyError:
        return None
    return 'At 20% Quality: ' + said if said else None


def cost(what, n):
    """A cost type as the game names it: "Mana" 104 -> "104 Mana"; "ManaPerMinute" 600 -> "10 Mana per second";
    "ManaPercentPerMinute" 30 -> "0.5% Mana per second". The game files count a drain per minute; a gem shows it
    per second."""
    m = re.fullmatch(r'([A-Z][a-z]+)(Percent)?(PerMinute)?', what)
    if not m:
        return '%s %s' % (n, re.sub(r'(?<=[a-z])(?=[A-Z])', ' ', what))
    v = trim(n / 60, 2) if m.group(3) else str(n)
    return '%s%s %s%s' % (v, '%' if m.group(2) else '', m.group(1), ' per second' if m.group(3) else '')


def skill_lines(s, many_sets):
    """One granted skill: the lines that belong to no level, and {level: [lines]}. Each line is (the stat set it
    belongs to, the line): Fireball's projectile, explosion and firebolts are three sets of one skill."""
    static, at = [], {}
    types = (s.get('active_skill') or {}).get('types') or []
    top = s.get('static') or {}
    if s.get('cast_time') and 'Spell' in types:
        static.append(('', 'Cast Time: %s sec' % seconds(s['cast_time'])))
    if top.get('attack_speed_multiplier'):
        static.append(('', 'Attack Speed: %d%% of base' % (100 + top['attack_speed_multiplier'])))

    def own(p, into):
        for what, n in sorted((p.get('costs') or {}).items()):
            into.append(('', 'Cost: ' + cost(what, n)))
        for what, n in sorted((p.get('reservations') or {}).items()):
            into.append(('', 'Reservation: %s %s' % (n, what.capitalize())))
        if p.get('cooldown'):
            into.append(('', 'Cooldown Time: %s sec' % seconds(p['cooldown'])))
        if p.get('stored_uses'):
            into.append(('', 'Can Store %d Use%s' % (p['stored_uses'], '' if p['stored_uses'] == 1 else 's')))
        if p.get('cost_multiplier'):
            into.append(('', 'Cost Multiplier: %d%%' % p['cost_multiplier']))
    own(top, static)
    for lv, p in (s.get('per_level') or {}).items():
        own(p, at.setdefault(int(lv), []))

    for ss in s.get('stat_sets') or []:
        lab = ss.get('label')
        lab = plain(lab[0] if isinstance(lab, list) else lab) if many_sets and lab else ''
        st = ss.get('static') or {}
        fixed = {x['id']: x['value'] for x in st.get('stats') or [] if isinstance(x, dict) and 'value' in x}
        if st.get('crit_chance'):
            static.append((lab, 'Critical Hit Chance: %.2f%%' % (st['crit_chance'] / 100)))
        if st.get('damage_multiplier'):
            static.append((lab, 'Attack Damage: %d%% of base' % st['damage_multiplier']))
        static += [(lab, x) for t in (st.get('stat_text') or {}).values() if 'DNT' not in t for x in lines(t)]
        static += [(lab, x) for x in (quality(q, fixed) for q in st.get('quality_stats') or []) if x]
        for lv, p in (ss.get('per_level') or {}).items():
            into = at.setdefault(int(lv), [])
            if p.get('crit_chance'):
                into.append((lab, 'Critical Hit Chance: %.2f%%' % (p['crit_chance'] / 100)))
            if p.get('damage_multiplier'):
                into.append((lab, 'Attack Damage: %d%% of base' % p['damage_multiplier']))
            into += [(lab, x) for t in (p.get('stat_text') or {}).values() if 'DNT' not in t for x in lines(t)]
    return static, at


def named(*parts):
    """("Explosion", "Deals 8 to 12 Fire Damage") -> "Explosion: Deals 8 to 12 Fire Damage"; empty parts drop out."""
    return ': '.join(x for x in parts if x)


def gems(ex):
    G, S = ex.get('skill_gems.min.json'), ex.get('skills.min.json')
    if not G or not S:
        return None
    out = {}
    for path, g in G.items():
        base = g.get('base_item') or {}
        name = base.get('display_name')
        if base.get('release_state') != 'released' or not real(name):
            continue
        sids = [x for x in g.get('grants_skills') or [] if x in S]
        static, at = [], {}
        for sid in sids:
            s = S[sid]
            skill = (s.get('active_skill') or {}).get('display_name') or ''
            if 'DNT' in skill:
                continue   # a skill the game files mark as one players never see
            skill = plain(skill) if len(sids) > 1 and real(skill) else ''
            st, lv = skill_lines(s, len(s.get('stat_sets') or []) > 1)
            static += [(named(skill, lab), x) for lab, x in st]
            for n, ls in lv.items():
                at.setdefault(n, []).extend((named(skill, lab), x) for lab, x in ls)
        ml = max(at, default=1)
        # a line the same at every level is one line; the rest are one wording with a number per level
        by = {}
        for n in range(1, ml + 1):
            seen = {}
            for lab, x in at.get(n, []):
                w, v = split(x)
                seen[lab, w] = seen.get((lab, w), 0) + 1
                k = (lab, w, seen[lab, w])   # the same wording twice at one level is two lines
                by.setdefault(k, [None] * ml)[n - 1] = v[0] if len(v) == 1 else v
        per = []
        for (lab, w, _), vals in by.items():
            if vals[0] is not None and len({json.dumps(v) for v in vals}) == 1:
                static.append((lab, fill(w, vals[0])))
            else:
                per.append((lab, w, vals))
        e = {'n': name, 't': g.get('gem_type') or '', 'ml': ml}
        st = unlabel([(lab, x, None) for lab, x in static])
        if st:
            e['st'] = [x for x, _ in st]
        lv = {}
        for w, vals in unlabel(per):
            while w in lv:   # the same wording twice at one level: the second is told apart by where it sits
                w += ' '
            lv[w] = vals
        if lv:
            e['lv'] = lv
        out[path.rsplit('/', 1)[-1]] = e
    return out


def unlabel(rows):
    """[(stat set, line, numbers)] -> [(line, numbers)]. A line every set carries alike is said once with no
    set's name on it; a line one set carries on its own keeps the set's name. Order is kept."""
    sets = {}
    for lab, w, vals in rows:
        sets.setdefault((w, json.dumps(vals)), []).append(lab)
    out, done = [], set()
    for lab, w, vals in rows:
        k = (w, json.dumps(vals))
        if k in done:
            continue
        labs = sets[k]
        if len(labs) > 1:
            done.add(k)
            out.append((w, vals))
        else:
            out.append((named(lab, w), vals))
    return out


# ---------------------------------------------------------------- the two trees

def words(ex, files):
    """The game's stat wording (tools/atlas.py Words), read from this export rather than fetched."""
    import atlas

    class Words(atlas.Words):
        FILES = files

        def __init__(self):
            self.index = {}
            for f in self.FILES:
                name = 'stat_translations/' + (f if f == 'stat_descriptions' else f + '_stat_descriptions') + '.min.json'
                idx = {}
                for e in ex.get(name) or []:
                    for sid in e['ids']:
                        idx.setdefault(sid, e)
                self.index[f] = idx
    return Words()


def tree(ex, name, files):
    t = ex.get('passive_skill_trees/%s.min.json' % name)
    if not t:
        return None
    W = words(ex, files)
    G = ex.get('skill_gems.min.json') or {}
    out = {}
    for h, v in t['passives'].items():
        if not real(v.get('name')) or v.get('is_jewel_socket') or v.get('is_ascendancy_starting_node'):
            continue
        ls, _ = W.render([(k, x, x) for k, x in sorted((v.get('stats') or {}).items())], files)
        grant = ((G.get(v.get('granted_skill') or '') or {}).get('base_item') or {}).get('display_name')
        if grant:
            ls.append('Grants Skill: ' + grant)
        if ls:
            out[str(v.get('hash', h))] = {'id': v['id'], 'n': v['name'], 'ls': ls}
    return out


def passives(ex):
    return tree(ex, 'Default', ['passive_skill', 'stat_descriptions'])


def atlas_tree(ex):
    return tree(ex, 'Atlas', ['atlas', 'atlas_variant', 'stat_descriptions'])


# ---------------------------------------------------------------- items

def in_game(v):
    return v.get('release_state') == 'released' and v.get('domain') in ('item', 'misc', 'flask') and real(v.get('name'))


def bases(ex):
    import craft
    B, M = ex.get('base_items.min.json'), ex.get('mods.min.json') or {}
    if not B:
        return None
    out = {}
    for path in sorted(B):
        v = B[path]
        if not in_game(v) or v['name'] in out or v.get('item_class') in ('QuestItem', 'StackableCurrency'):
            continue
        rq = v.get('requirements') or {}
        e = {'c': v.get('item_class') or '', 'dl': v.get('drop_level') or 0}
        if any(rq.get(k) for k in ('level', 'strength', 'dexterity', 'intelligence')):
            e['rq'] = [rq.get('level', 0), rq.get('strength', 0), rq.get('dexterity', 0), rq.get('intelligence', 0)]
        pr = craft.base_props(v)
        if pr:
            e['pr'] = pr
        im = [x for i in v.get('implicits') or [] for x in lines((M.get(i) or {}).get('text'))]
        if im:
            e['im'] = im
        out[v['name']] = e
    return out


def mods(ex):
    """Every modifier that can roll on a kind of item the Craft tab has, and the kinds it rolls on. The rule is
    tools/craft.py's (the first spawn tag the item has decides), on this export's own bases and tags."""
    import craft
    B, M = ex.get('base_items.min.json'), ex.get('mods.min.json')
    if not B or not M:
        return None
    tagsets = {}
    for v in B.values():
        if in_game(v):
            tags = set(v.get('tags') or [])
            for i in v.get('implicits') or []:
                tags |= set((M.get(i) or {}).get('adds_tags') or [])
            tagsets.setdefault(v['item_class'], set()).add(frozenset(tags))
    out = {}
    for cls, cid, _ in craft.CLASSES:
        domain = craft.DOMAIN.get(cls, 'item')
        for tags in tagsets.get(cls, ()):
            for mid, m in M.items():
                if m.get('is_essence_only') or not m.get('text'):
                    continue
                gen, dom = m.get('generation_type'), m.get('domain')
                if gen in ('prefix', 'suffix') and dom in (domain, 'desecrated'):
                    a = gen[0]
                elif gen == 'corrupted' and dom == domain:
                    a = 'c'
                else:
                    continue
                if craft.weight(m, tags) <= 0:
                    continue
                e = out.get(mid)
                if e is None:
                    e = out[mid] = {'a': a, 'lv': m.get('required_level') or 0, 'ls': lines(m['text']), 'on': []}
                    if dom == 'desecrated':
                        e['d'] = 1
                if cid not in e['on']:
                    e['on'].append(cid)
    for e in out.values():
        e['on'].sort()
    return out


def uniques(_ex=None):
    f = ROOT / 'data' / 'uniques.json'
    if not f.exists():
        return None
    return {k: {x: v[x] for x in ('ls', 'rq') if v.get(x)} for k, v in json.loads(f.read_text(encoding='utf-8')).items()}


READ = {'gems': gems, 'passives': passives, 'atlas': atlas_tree, 'bases': bases, 'mods': mods, 'uniques': uniques}


# ---------------------------------------------------------------- writing

def dump(rows):
    """One entry a line, sorted: the same data always writes the same bytes, and git stores a patch as a delta."""
    body = ',\n'.join('%s:%s' % (json.dumps(k, ensure_ascii=False), json.dumps(rows[k], ensure_ascii=False, separators=(',', ':'), sort_keys=True))
                      for k in sorted(rows, key=lambda k: (len(k), k) if k.isdigit() else (0, k)))
    return '{\n' + body + '\n}\n'


def registry():
    if REGISTRY.exists():
        return json.loads(REGISTRY.read_text(encoding='utf-8'))
    return {'note': 'The snapshots tools/snapshot.py has taken, oldest first: the patch, the export build it was read '
                    'from, the day that export is dated, where it came from and how many entries each kind holds. '
                    'Not shipped; tools/diff.py reads them.', 'patches': []}


def record(patch, fields):
    reg = registry()
    rows = [p for p in reg['patches'] if p['v'] != patch]
    was = next((p for p in reg['patches'] if p['v'] == patch), {})
    row = {**was, **fields, 'v': patch}
    row['n'] = {**was.get('n', {}), **fields.get('n', {})}
    rows.append(row)
    reg['patches'] = sorted(rows, key=lambda p: key(p['v']))
    HISTORY.mkdir(parents=True, exist_ok=True)
    REGISTRY.write_text(json.dumps(reg, indent=1, ensure_ascii=False) + '\n', encoding='utf-8', newline='\n')


def write(patch, kind, rows):
    d = HISTORY / patch
    d.mkdir(parents=True, exist_ok=True)
    (d / (kind + '.json')).write_text(dump(rows), encoding='utf-8', newline='\n')


def take(ex, kinds=KINDS, force=False, quiet=False):
    """Snapshot one export. Returns the patch, or None when it already has one (and force is off)."""
    patch = ex.patch
    if not re.fullmatch(r'0\.\d+\.\d+', patch):
        raise SystemExit('cannot tell which patch export %r is' % ex.build)
    if (HISTORY / patch).exists() and not force:
        if not quiet:
            print('%s: a snapshot is there already (--force to write it again)' % patch)
        return None
    n, skipped = {}, []
    for kind in kinds:
        if kind == 'uniques' and ex.repo:
            continue   # a past patch: data/uniques.json is today's, not that patch's
        try:
            rows = READ[kind](ex)
        except Exception as e:   # an older export in a shape this does not read: that kind is left out and said
            print('  %s %s: not read (%s: %s)' % (patch, kind, type(e).__name__, e), file=sys.stderr)
            rows = None
        if not rows:
            skipped.append(kind)
            continue
        write(patch, kind, rows)
        n[kind] = len(rows)
    fields = {'build': ex.build, 'dated': ex.dated, 'from': ex.said, 'n': n}
    if 'uniques' in n:
        fields['uniques'] = 'data/uniques.json (poe2db), frozen %s' % datetime.date.today().isoformat()
    record(patch, fields)
    print('%s: %s%s' % (patch, ', '.join('%s %d' % kv for kv in n.items()),
                        ' · not in this export: ' + ', '.join(skipped) if skipped else ''))
    return patch


def on_pull(was):
    """tools/gamepull.py, after a pull that held up: the first time a patch is seen, freeze it and work out what it
    changed. was is the patch data/gamedata.json said before this pull.

    The uniques come from data/uniques.json, which tools/uniques.py rebuilds on its own day. The moment a new patch
    is seen, that file still holds the patch before it, so it is frozen under that patch then, and the new patch
    gets its uniques when tools/uniques.py has run (python tools/snapshot.py --only uniques)."""
    ex = Export()
    now = ex.patch
    if not re.fullmatch(r'0\.\d+\.\d+', now):
        return None
    had = next((p for p in registry()['patches'] if p['v'] == now), None)
    if (HISTORY / now).exists() and had and had.get('build') == ex.build:
        return None
    # a hotfix inside the patch (4.5.5.1 -> 4.5.5.2) takes the patch's snapshot again: a patch is kept as it ends,
    # the way the past ones are, so the next patch's changes are its own and not the hotfixes before it
    moved = bool(was) and was != now
    if moved and (HISTORY / was).exists() and not (HISTORY / was / 'uniques.json').exists():
        rows = uniques()
        if rows:
            write(was, 'uniques', rows)
            record(was, {'n': {'uniques': len(rows)},
                         'uniques': 'data/uniques.json (poe2db), frozen %s' % datetime.date.today().isoformat()})
    take(ex, tuple(k for k in KINDS if k != 'uniques' or not (moved or had)), force=True)
    import diff
    diff.run(now)
    return now


def exports(repo):
    """The last export commit of each patch in a clone of repoe-fork/poe2, oldest first: {patch: commit}."""
    log = subprocess.run(['git', '-C', str(repo), 'log', '--format=%H %s', '--grep=Export'], check=True,
                         capture_output=True, text=True).stdout
    last = {}
    for line in log.splitlines():   # newest first, so the first seen of a patch is its last export
        m = re.search(r'Export ([\d.]+)', line)
        if m and re.match(r'4\.\d+\.\d+', m.group(1)):
            last.setdefault(patch_of(m.group(1)), line.split()[0])
    return dict(sorted(last.items(), key=lambda kv: key(kv[0])))


def current():
    """The patch data/gamedata.json says the site is on."""
    f = ROOT / 'data' / 'gamedata.json'
    return json.loads(f.read_text(encoding='utf-8')).get('patch', '') if f.exists() else ''


def main():
    ap = argparse.ArgumentParser(description='Freeze the numbers a patch can change under data/history/<patch>/.')
    ap.add_argument('--past', metavar='DIR', help='a clone of https://github.com/repoe-fork/poe2: every past patch in it')
    ap.add_argument('--since', default='0.0.0', help='with --past: from this patch on')
    ap.add_argument('--at', nargs=2, metavar=('DIR', 'COMMIT'), help='one export commit of that clone')
    ap.add_argument('--only', choices=KINDS, action='append', help='these kinds only')
    ap.add_argument('--force', action='store_true', help='write a patch that already has a snapshot again')
    args = ap.parse_args()
    kinds = tuple(args.only or KINDS)
    sys.path.insert(0, str(Path(__file__).resolve().parent))

    if args.past:
        now = current()
        for p, commit in exports(args.past).items():
            if key(p) < key(args.since) or p == now:   # the patch on the site now is read from gamepull's copies
                continue
            take(Export(args.past, commit), kinds, args.force)
    elif args.at:
        take(Export(*args.at), kinds, args.force)
    else:
        take(Export(), kinds, args.force or bool(args.only))
    return 0


if __name__ == '__main__':
    sys.exit(main())
