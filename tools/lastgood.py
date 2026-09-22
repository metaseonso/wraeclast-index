"""Last good wins: no builder here ever replaces good index data with nothing.

Every tool that fills the index from an outside source (the game export, poe2db, poe.ninja, the official
trade site, the tier list sheet) runs its pull through this. A pull that throws, comes back empty or
collapses against the copy already committed is a fault:

  1. the committed copy stays. Nothing is overwritten, nothing is half-written, the site stays whole
  2. the run says so on stderr the moment it happens, and prints the whole story at the end
  3. the fault is written to data/faults.json, so it outlives the run and the site can show it
  4. a GitHub issue labelled data-fault is opened, or the open one is reused (needs the gh CLI, signed in)
  5. the run exits non-zero, so a job that goes stale goes red

Usage, one call per outside pull:

    import lastgood

    out = lastgood.pull('League dates', build, file='leagues.json', url=URL, at='leagues', floor=3)
    if out is not None:                       # None means the pull did not hold up: write nothing
        sitedata.publish('leagues.json', out)
    return lastgood.report()                  # the exit code: one per section this run kept an old copy of

and one line at the bottom, so a builder that dies before its pull is checked is the same fault:

    if __name__ == '__main__':
        sys.exit(lastgood.guarded(main, 'League dates', file='leagues.json', url=URL))

One section inside a file the builder writes anyway (the essences in data/craft) is the same call, with the
rows already on disk handed to it, because they are not the whole file:

    ESS = lastgood.pull('Essences', fresh, file='craft/*.json', url=POE2DB, old=sorted(had))

What counts as a fault:

  nothing      the pull threw (a source that stopped answering, or markup that no longer reads)
  empty        no entries came back at all
  under floor  fewer than the least a working source has ever given (floor=, where one is known)
  collapsed    fewer than 80% of the entries the committed copy holds (TOLERANCE; pass tolerance= per section)
  a kind gone  a group that had entries in the committed copy has none now

at= says what to count: one part of the file ("items"), or several with a floor each
({'mods': 1000, 'uniques': 100}), or nothing to count the whole file. A file is only as good as its
worst part, so one thin part keeps the whole file on its last good copy.

20% is the default because an ordinary game patch moves a list by a few percent: a fifth of a list
disappearing is never a patch, it is the source or the parsing breaking.

Run without writing anything:  WI_NO_TICKET=1 keeps it off GitHub; the record and the printing still happen.
"""
import datetime as dt
import json
import os
import re
import shutil
import subprocess
import sys
import traceback
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(os.environ['WI_DATA_DIR']) if os.environ.get('WI_DATA_DIR') else ROOT / 'data'
RECORD = 'faults.json'
NOTE = 'Sections showing an older copy because their source failed. Written by tools/lastgood.py.'
LABEL = 'data-fault'        # the issue label, the way held cloud work is tagged "shelved"
TOLERANCE = 0.2             # a fifth of the rows may go before it counts as a collapse
MONTHS = ('Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec')
STAMPS = ('updated', 'gen', 'made', 'checked')   # a file that says when it was built says so in one of these
KEY_KIND = re.compile(r'^([a-z]{1,4}):')         # the market's keys: "c:Divine Orb", "u:Name | Base"
ROW_KIND = ('k', 'cat', 'kind', 'g')             # a field on a row that says what kind of row it is

FOUND = []    # the faults this run turned up
FINE = []     # the sections that came back fine this run: their old faults are dropped


# ---------------------------------------------------------------- counting
def dig(data, at=None):
    """One part of a file, by a dotted path ("items", "options.category"). The whole thing when at is empty."""
    for step in str(at or '').split('.'):
        if not step:
            continue
        if not isinstance(data, dict):
            return None
        data = data.get(step)
    return data


def rows(data, at=None):
    """How many entries there are."""
    v = dig(data, at)
    if isinstance(v, (list, dict)):
        return len(v)
    return 1 if v else 0      # a blank stamp or a zero is nothing, the same as a missing one


def part(at):
    """The part of the file to count when only one number can be given: the first, where at names several."""
    return next(iter(at), None) if isinstance(at, (list, dict, tuple)) else at


def by_field(entries):
    """Entries grouped by the field that says what each one is ("cat" on the market's rows, "k" on a card),
    or None when they do not carry one."""
    entries = list(entries)
    field = next((f for f in ROW_KIND if all(isinstance(x, dict) and f in x for x in entries)), None) if entries else None
    if not field:
        return None
    out = {}
    for x in entries:
        out[str(x[field])] = out.get(str(x[field]), 0) + 1
    return out


def kinds(data, at=None):
    """The entries grouped by what kind they are, so a whole kind going missing is spotted: by the field that
    names the kind, else by the letter a key starts with ("c:Divine Orb"). Empty when entries carry neither
    and only the counts can be checked."""
    v = dig(data, at)
    out = {}
    if isinstance(v, dict):
        got = by_field(v.values())
        if got is not None:
            return got
        for key in v:
            m = KEY_KIND.match(str(key))
            if not m:
                return {}
            out[m.group(1)] = out.get(m.group(1), 0) + 1
        return out
    if isinstance(v, list):
        return by_field(v) or {}
    return {}


# ---------------------------------------------------------------- the rule
class Stale(Exception):
    """A builder saying in its own plain words why its pull cannot be trusted. Raise it inside the build and
    the words go straight into the fault, the record and the ticket."""


def why_broke(e):
    """Plain English for the exception a pull died on, to finish "..., <this>". A builder's own words and a
    source that stopped answering need nothing else; anything else is a bug or a page that changed its shape,
    and only the traceback says where, so that one goes out too."""
    if isinstance(e, Stale):
        return str(e)
    if isinstance(e, (urllib.error.URLError, TimeoutError, OSError)):
        return 'the source stopped answering'
    traceback.print_exception(type(e), e, e.__traceback__)
    one = ' '.join(str(e).split())[:120]
    return 'the pull broke: ' + (one or type(e).__name__)


def look(new, old, at=None, tolerance=TOLERANCE, floor=0, error=None):
    """What is wrong with a fresh pull, or None when it holds up.

    at names the part to count: one path ("items"), several ({"mods": 1000, "uniques": 100} — each with its
    own floor, or a plain list for none), or nothing at all to count the whole file. A file with several
    parts is only as good as its worst one, so the first part that is wrong is the answer."""
    if error is not None:
        return {'was': rows(old, part(at)), 'now': 0, 'gone': [], 'why': why_broke(error)}
    if isinstance(at, (list, dict, tuple)):
        for one in at:
            bad = look(new, old, one, tolerance, at[one] if isinstance(at, dict) else floor)
            if bad:
                bad['why'] += ' in "%s"' % one
                return bad
        return None
    was, now = rows(old, at), rows(new, at)
    if not now:
        return {'was': was, 'now': 0, 'gone': [], 'why': 'the source answered with nothing'}
    if floor and now < floor:
        return {'was': was, 'now': now, 'gone': [],
                'why': 'only %d came back, and a working source has at least %d' % (now, floor)}
    if was and now < was * (1 - tolerance):
        return {'was': was, 'now': now, 'gone': [],
                'why': 'the source dropped %d%% of what it used to give' % round((1 - now / was) * 100)}
    fresh = kinds(new, at)
    gone = sorted(k for k, n in kinds(old, at).items() if n and not fresh.get(k))
    if gone:
        return {'was': was, 'now': now, 'gone': gone, 'why': 'nothing came back for ' + ', '.join(gone)}
    return None


def pull(section, build, *, file='', url='', at=None, tolerance=TOLERANCE, floor=0, old=None):
    """Run one outside pull under the rule. The fresh data when it holds up against what is committed,
    None when it does not — then the caller writes nothing and the last good file stays where it is.
    old= for a section that is not a whole file: what is on disk for it now, to be held up against."""
    try:
        new, error = build(), None
    except Exception as e:
        new, error = None, e
    if old is None and file:
        old = committed(file, quiet=True)
    bad = look(new, old, at, tolerance, floor, error)
    if not bad:
        FINE.append(section)
        return new
    fault(section, bad, file=file, url=url, old=old)
    return None


def guarded(build, section, *, file='', url='', at=None):
    """A whole builder under the same rule, for the one line at the bottom of each tool. Most of these fetch
    for a while before there is anything to check, and that is where a source dies: anything that escapes the
    builder is the same fault as a pull that threw, so the committed files stay, the run says so and a ticket
    goes up instead of a traceback nobody reads. Gives back the exit code, the way report() does.

    section is one name, or several with a file each ({'Item requirements': 'reqs.json', ...}) where one pull
    fills more than one file."""
    try:
        return build()
    except Exception as e:      # not SystemExit: a tool that stops itself on purpose has said why already
        why = why_broke(e)
        for name, f in (section if isinstance(section, dict) else {section: file}).items():
            old = committed(f, quiet=True) if f else None
            fault(name, {'was': rows(old, part(at)), 'now': 0, 'gone': [], 'why': why}, file=f, url=url, old=old)
        return report()


# ---------------------------------------------------------------- the record
def committed(name, quiet=False):
    """The data file already on disk, parsed. None when there is none, or it cannot be read."""
    p = DATA / name
    try:
        return json.loads(p.read_text(encoding='utf-8'))
    except Exception as e:
        if not quiet:
            print('  could not read', p, e, file=sys.stderr)
        return None


def save(path, text):
    """Write a file in one step, so nothing ever reads half of one."""
    path = Path(path)
    tmp = path.with_name(path.name + '.tmp')
    tmp.write_bytes(text.encode('utf-8'))
    os.replace(tmp, path)


def when(data, file=''):
    """The date the kept data is from: its own stamp, else when its file was last committed, else its mtime.
    A file= with a * in it (the per-kind craft files) is answered by the first of them: they are written
    together, so each is as old as the rest."""
    if isinstance(data, dict):
        for f in STAMPS:
            v = data.get(f)
            if isinstance(v, str) and re.match(r'^\d{4}-\d{2}-\d{2}', v):
                return v[:10]
    p = next(iter(sorted(DATA.glob(file))), None) if '*' in file else (DATA / file if file else None)
    if p and p.exists():
        try:
            r = subprocess.run(['git', 'log', '-1', '--format=%cs', '--', str(p)],
                               cwd=str(ROOT), capture_output=True, text=True, timeout=20)
            if r.returncode == 0 and r.stdout.strip():
                return r.stdout.strip()
        except Exception:
            pass
        return dt.date.fromtimestamp(p.stat().st_mtime).isoformat()
    return None


def day(iso):
    """A date the way a person says it: "19 Sep"."""
    try:
        d = dt.date.fromisoformat(str(iso)[:10])
    except ValueError:
        return 'before this'
    return '%d %s' % (d.day, MONTHS[d.month - 1])


def old_by(iso):
    """How old the kept data is, in plain words."""
    try:
        d = dt.date.fromisoformat(str(iso)[:10])
    except ValueError:
        return 'age not known'
    n = (dt.date.today() - d).days
    return 'today' if n <= 0 else '1 day old' if n == 1 else '%d days old' % n


def fault(section, bad, *, file='', url='', old=None):
    """Remember one fault, and say it on stderr the moment it happens."""
    f = {'section': section, 'file': file, 'url': url, 'was': bad['was'], 'now': bad['now'],
         'gone': bad['gone'], 'why': bad['why'], 'good': when(old, file),
         'at': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes')}
    FOUND.append(f)
    print('DATA FAULT  %s: %d before, %d now, %s. Keeping the copy from %s (%s).'
          % (section, f['was'], f['now'], f['why'], day(f['good']), old_by(f['good'])), file=sys.stderr)
    return f


def line(f):
    """The one sentence the site shows an owner about a stale section."""
    return '%s: still showing the copy from %s, %s.' % (f['section'], day(f.get('good')), f.get('why') or 'the source failed')


def merge():
    """Every section showing an old copy right now: this run's faults folded into the ones already recorded.
    A section that came back fine this run drops out. A section nothing looked at this run stays as it was."""
    had = {f.get('section'): f for f in (committed(RECORD, quiet=True) or {}).get('faults', []) if f.get('section')}
    out, now = {}, {f['section'] for f in FOUND}           # one entry per section, whatever went wrong
    for f in FOUND:
        before = had.get(f['section']) or {}
        f['since'] = before.get('since') or f['at']        # when it first went stale
        if before.get('good'):
            f['good'] = before['good']                     # the kept data does not get younger while it is stale
        for carry in ('issue', 'said'):
            if before.get(carry):
                f[carry] = before[carry]
        out[f['section']] = f
    for section, f in had.items():
        if section not in now and section not in FINE:
            out[section] = f
    return sorted(out.values(), key=lambda x: x['section'])


def write_record(faults):
    """data/faults.json: the record that outlives the run. Committed, and on the data server sent to the site
    with the hourly files, so the dashboard and /api/health can name what is stale (tools/sitedata.py).
    A run that changes nothing writes nothing: the file moves only when what is stale moves, so a good run
    leaves the same bytes behind it every time."""
    rows = [{**f, 'line': line(f)} for f in faults]
    if (committed(RECORD, quiet=True) or {}).get('faults') == rows:
        return
    out = {'updated': dt.datetime.now(dt.timezone.utc).isoformat(timespec='minutes'), 'note': NOTE, 'faults': rows}
    try:
        import sitedata
        if sitedata.KEY:
            sitedata.publish(RECORD, out)   # writes it where the jobs keep their files, and sends it on
            return
    except Exception as e:
        print('  could not send', RECORD, 'to the site:', e, file=sys.stderr)
    save(DATA / RECORD, json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + '\n')


# ---------------------------------------------------------------- the ticket
def gh(*args):
    """One gh call. None when gh is not here."""
    if not shutil.which('gh'):
        return None
    try:
        return subprocess.run(['gh', *args], cwd=str(ROOT), capture_output=True, text=True, timeout=90)
    except Exception as e:
        print('  gh failed:', e, file=sys.stderr)
        return None


def ticket(f):
    """One GitHub issue per stale section, labelled data-fault. The open one is reused, never duplicated.
    Returns what happened, in a few words, or None when no issue was touched."""
    if os.environ.get('WI_NO_TICKET') == '1':
        return None
    if not shutil.which('gh'):
        return 'no gh CLI here, so no issue was raised (the record in data/%s stands)' % RECORD
    if (gh('auth', 'status') or subprocess.CompletedProcess([], 1)).returncode != 0:
        return 'gh is here but not signed in, so no issue was raised (the record in data/%s stands)' % RECORD
    title = '%s: %s' % (LABEL, f['section'])
    body = ('The index is showing an older copy of this section because its source failed.\n\n'
            '- Section: %s\n- File: %s\n- Rows: %d before, %d now\n- Kinds gone: %s\n- Likely cause: %s\n'
            '- Source: %s\n- Kept copy is from: %s (%s)\n- Stale since: %s\n- Seen: %s\n\n'
            'Raised by tools/lastgood.py. It closes itself out of data/%s when the source comes back.'
            % (f['section'], f.get('file') or '-', f['was'], f['now'], ', '.join(f['gone']) or 'none',
               f['why'], f.get('url') or '-', day(f.get('good')), old_by(f.get('good')),
               f.get('since', '')[:10], f['at'][:10], RECORD))
    said = '%d/%s' % (f['now'], f['why'])        # nothing new to say while these are the same
    gh('label', 'create', LABEL, '--color', 'B60205',
       '--description', 'A data source failed; the index is serving an older copy')   # already there: fine
    open_ = gh('issue', 'list', '--label', LABEL, '--state', 'open', '--limit', '100', '--json', 'number,title')
    found = None
    if open_ and open_.returncode == 0:
        try:
            found = next((x['number'] for x in json.loads(open_.stdout or '[]') if x.get('title') == title), None)
        except ValueError:
            found = None
    if found:
        f['issue'] = found
        if f.get('said') == said:
            return 'issue #%d is already open for this' % found
        r = gh('issue', 'comment', str(found), '--body', body)
        if r and r.returncode == 0:
            f['said'] = said
            return 'added to issue #%d' % found
        return 'could not add to issue #%d: %s' % (found, (r.stderr if r else '').strip()[:120])
    r = gh('issue', 'create', '--label', LABEL, '--title', title, '--body', body)
    if r and r.returncode == 0:
        m = re.search(r'/issues/(\d+)', r.stdout or '')
        f['issue'] = int(m.group(1)) if m else None
        f['said'] = said
        return 'opened issue %s' % (r.stdout.strip().splitlines() or ['?'])[-1]
    return 'could not open an issue: %s' % (r.stderr if r else '').strip()[:120]


# ---------------------------------------------------------------- the end of a run
def report():
    """The end of every builder: print the whole story, keep it in data/faults.json, raise the tickets.
    Returns how many sections this run kept an old copy of — use it as the exit code, so a job that goes
    stale goes red. Sections another builder is keeping are printed but are that builder's job to go red for."""
    faults = merge()
    told = {f['section']: ticket(f) for f in FOUND}     # what the ticket step did, this run only
    write_record(faults)
    if not faults:
        if FINE:
            print('Data check: %s came back whole.' % ', '.join(FINE))
        return 0
    print('')
    print('%d section%s showing an older copy (data/%s):' % (len(faults), '' if len(faults) == 1 else 's', RECORD))
    for f in faults:
        gone = '; nothing for ' + ', '.join(f['gone']) if f.get('gone') else ''
        said = told.get(f['section']) or ('#%s' % f['issue'] if f.get('issue') else 'in the record only')
        print('  %s' % line(f))
        print('     %d rows before, %d now%s. Kept copy is %s, stale since %s.'
              % (f['was'], f['now'], gone, old_by(f.get('good')), day(f.get('since'))))
        if f.get('url'):
            print('     Source: %s' % f['url'])
        print('     Ticket: %s / %s - %s' % (LABEL, f['section'], said))
    return len(FOUND)
