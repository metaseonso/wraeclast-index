/* The last-good rule, proved without the network.

   Every builder that fills the index from an outside source ends its pull through tools/lastgood.py: a pull
   that throws, comes back empty or collapses keeps the file already committed, says so loudly, writes the
   fault to data/faults.json and goes red. This runs a builder that is not real against a source that is not
   real, five ways, and checks all of that — then feeds the record through worker/health.js to check the owner
   sees the section named in plain English, the same way the dashboard's Data jobs block reads it.

     node tools/dev/faults.mjs           about a second
     node tools/dev/faults.mjs --keep    leave the temporary folder behind to look at

   Everything it writes lives in a temporary folder. It never reaches the real data/, GitHub or the site:
   WI_NO_TICKET=1 keeps the ticket step off GitHub. */
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLS = join(HERE, '..');
const ROOT = join(TOOLS, '..');
const keep = process.argv.includes('--keep');

let failed = 0;
const lines = [];
function say(name, ok, detail){
  if(!ok) failed++;
  lines.push((ok ? 'ok   ' : 'FAIL ') + (name + ' '.repeat(22)).slice(0, 22) + detail);
}

/* one run of the builder that is not real; gives back what it printed and what it exited with */
function run(dir, mode){
  return new Promise(ok => {
    execFile('python', [join(dir, 'fakebuild.py')], {
      cwd: ROOT, env: {...process.env, WI_DATA_DIR: join(dir, 'data'), WI_NO_TICKET: '1', FAULT_MODE: mode,
        PYTHONPATH: TOOLS, PYTHONIOENCODING: 'utf-8'},
    }, (err, out, errOut) => ok({code: err ? err.code || 1 : 0, out, err: errOut}));
  });
}

const read = async (p, or = null) => { try { return await readFile(p, 'utf8'); } catch { return or; } };

/* ---------- a builder, a source and a last good file, none of them real ---------- */
const BUILDER = `"""A builder that is not real, for tools/dev/faults.mjs: it pulls a list of widgets from a source
that is not real, under the same rule every real builder uses. FAULT_MODE says how that source behaves."""
import json
import os
import sys

import lastgood

HOW = os.environ.get('FAULT_MODE', 'good')
URL = 'https://example.invalid/widgets'
KINDS = ('Big', 'Small')


def source():
    """The pull. Four ways it can go: whole, nothing at all, most of it gone, and dead."""
    if HOW == 'throw':
        raise TimeoutError('the read timed out')
    n = {'good': 50, 'empty': 0, 'thin': 24}[HOW]
    return {'updated': '2026-09-22T00:00+00:00',
            'items': [{'n': 'Widget %d' % i, 'cat': KINDS[i % 2]} for i in range(n)]}


def main():
    if HOW == 'crash':
        raise ValueError('a page this reads changed its shape')   # dies before there is anything to check
    out = lastgood.pull('Widgets', source, file='widget.json', url=URL, at='items')
    if out is not None:
        lastgood.save(lastgood.DATA / 'widget.json', json.dumps(out, ensure_ascii=False, separators=(',', ':')))
        print(len(out['items']), 'widgets -> widget.json')
    return lastgood.report()


if __name__ == '__main__':
    sys.exit(lastgood.guarded(main, 'Widgets', file='widget.json', url=URL, at='items'))
`;

const dir = await mkdtemp(join(tmpdir(), 'wi-faults-'));
const data = join(dir, 'data');
await mkdir(data, {recursive: true});
await writeFile(join(dir, 'fakebuild.py'), BUILDER);

/* the copy already committed: 40 widgets, built on 19 September */
const GOOD = JSON.stringify({updated: '2026-09-19T00:00+00:00',
  items: Array.from({length: 40}, (_, i) => ({n: 'Widget ' + i, cat: i % 2 ? 'Small' : 'Big'}))});
await writeFile(join(data, 'widget.json'), GOOD);
await writeFile(join(data, 'faults.json'), JSON.stringify({updated: '', note: '', faults: []}, null, 1) + '\n');

console.log('faults · ' + dir);

/* ---------- four faults: nothing, most of it gone, dead, and a builder that died before its own check ---------- */
for(const [mode, what, cause] of [['empty', 'a source with nothing', 'answered with nothing'],
  ['thin', 'a source down to 60%', 'dropped 40%'], ['throw', 'a source that threw', 'stopped answering'],
  ['crash', 'a builder that died', 'changed its shape']]){
  const r = await run(dir, mode);
  const still = await read(join(data, 'widget.json'));
  const rec = JSON.parse(await read(join(data, 'faults.json'), '{}'));
  const f = (rec.faults || []).find(x => x.section === 'Widgets');
  const loud = /^DATA FAULT {2}Widgets: 40 before/m.test(r.err) && r.err.includes('Keeping the copy from 19 Sep');
  say(mode, still === GOOD && loud && !!f && r.code === 1 && (f.why || '').includes(cause),
    what + ': kept ' + (still === GOOD ? 'the committed file' : 'SOMETHING ELSE') + ', ' +
    (loud ? 'said so' : 'SAID NOTHING') + ', ' + (f ? 'recorded "' + f.why + '"' : 'RECORDED NOTHING') +
    ', exit ' + r.code);
}

/* ---------- the owner's side: worker/health.js reads that record ---------- */
globalThis.caches = {default: {match: async () => null, put: async () => {}}};
const RECORD = await read(join(data, 'faults.json'), '{}');
globalThis.fetch = async (u, opt = {}) => new Response(String(u).endsWith('faults.json') && opt.method !== 'HEAD'
  ? RECORD : '{}', {status: 200});
const { health, serveHealth, JOBS } = await import(pathToFileURL(join(ROOT, 'worker', 'health.js')).href);
/* every trade price job came in a minute ago, so the stale section is the worst thing on the site and the
   line at the top of the dashboard has to be about it. Which kinds those are comes off the watch's own
   table, so a new kind of price lands here with nobody editing this. */
const fresh = new Date(Date.now() - 60000).toISOString();
const env = {DB: {prepare(){ return {bind(){ return this; }, async first(){ return null; },
  async all(){ return {results: JOBS.filter(j => j[0] === 'price').map(j => ({kind: j[1], at: fresh}))}; }}; }}};
const h = await health(env, 'https://wraeclastindex.fyi');
const row = (h.jobs || []).find(j => j.where === 'data' && j.what === 'Widgets');
const named = !!row && /^Widgets: still showing the copy from 19 Sep, /.test(row.note || '') &&
  h.line === row.note && ['late', 'stopped'].includes(row.state);
say('dashboard', named, named ? 'the Data jobs block says "' + row.note + '" (' + row.state + ')'
  : 'the dashboard does not name the stale section: ' + JSON.stringify(row || h.line));

/* the same, on the public /api/health */
const url = new URL('https://wraeclastindex.fyi/api/health');
const api = await (await serveHealth(new Request(url), env, url, {waitUntil(){}})).json();
const one = (api.stale || {}).Widgets;
say('api/health', !!one && one.note === row.note && api.note === row.note && one.state === row.state,
  one ? 'stale.Widgets: ' + JSON.stringify({state: one.state, note: one.note}) : 'nothing under "stale": ' + JSON.stringify(api.stale));

/* ---------- a good pull still writes, and writes the same bytes twice ---------- */
const first = await run(dir, 'good');
const once = await read(join(data, 'widget.json'));
const rec1 = await read(join(data, 'faults.json'));
const second = await run(dir, 'good');
const twice = await read(join(data, 'widget.json'));
const rec2 = await read(join(data, 'faults.json'));
const cleared = !(JSON.parse(rec1 || '{}').faults || []).length;
say('good', once !== GOOD && once === twice && rec1 === rec2 && first.code === 0 && second.code === 0 && cleared,
  'wrote 50 widgets, byte for byte the same on the second run (the record too), exit 0, and the fault cleared itself');

for(const l of lines) console.log(l);
console.log((lines.length - failed) + ' ok, ' + failed + ' failed');
if(!keep) await rm(dir, {recursive: true, force: true});
process.exit(failed ? 1 : 0);
