/* The budget: what the free plan lets the site be, and how close it is.

     node tools/dev/budget.mjs             the table: the biggest files and the headroom on every line
     node tools/dev/budget.mjs --offline   the same, with no request to the live site
   ...or as the guard's "budget" check (tools/dev/guard.mjs, check 9).

   It reads dist/, the site as Cloudflare serves it. dist/ missing, or older than any file in the repo, and it runs
   node tools/build.mjs first. Every limit is in LIMITS below, with where its number comes from. A warn line is
   printed and passes; a fail line fails.

   Seven lines:
     file      every file dist/ serves, one at a time
     count     how many files dist/ holds
     parse     every file the worker reads and parses while it answers a request: the shipped files it reads through
               env.ASSETS (worker/seo.js, worker/prices.js), every file data/manifest.json names for the crawler
               pages ("seo", tools/shards.py) when the worker reads the manifest, and the files the jobs send in,
               which it parses out of the database (worker/files.js NAMES). Found in the worker's code and the
               manifest, not listed here
     paint     the JSON the home page asks for before a search: index.html's own fetches and assets/app.js's reads
               that do not wait for need(). A file the worker builds (wrangler.jsonc run_worker_first) is measured
               on the live site, since only the worker can make it; --offline measures the shipped copy instead
     search    what the search reads before its first answer, off data/manifest.json: the manifest, the card meta
               and every kind's search rows (assets/searchworker.js reads them off the page's thread)
     d1        every file a job sends to the database (tools/sitedata.py publish, worker/files.js NAMES), at the
               size the job last wrote it in data/
     orphan    a file under data/ that nothing reads: no page, module, worker file, sw.js, tool or workflow names it
               (a file named by its content, name.<hash>.json, only by its exact path; any other by its name, or by
               its folder where the code builds the name). The build already leaves such a file out
               (tools/build.mjs); this says it is still in the repo. In dist/: every file under data/ named by its
               content is this deploy's own (sw-files.json "files") or the previous generation (sw-files.json
               "prev", tools/build.mjs 4b), and that is one generation: a file of the index a page reads by name
               (data/cards, data/search, data/explore) this deploy does not have, at most one per name, in dist/. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DIST = join(ROOT, 'dist');
const LIVE = 'https://wraeclastindex.fyi';
const KiB = 1024, MiB = 1024 * 1024;

/* ---------- the limits ---------- */
export const LIMITS = {
  // Cloudflare Workers static assets: 25 MiB per file on every plan
  // (developers.cloudflare.com/workers/static-assets/#limits, /workers/platform/limits/#static-assets)
  file:  {warn: 5 * MiB, fail: 20 * MiB, cap: 25 * MiB},
  // the same page: 20,000 files per Worker version on the free plan. The crawler's pages are files since 28 Sep
  // 2026 (an item page and its Markdown copy each, about 13,500 of them: tools/build.mjs); past 16,000 the owner
  // decides what gives before anything is cut. tools/build.mjs fails the build itself over the fail line.
  count: {warn: 16000, fail: 18000, cap: 20000},
  // Workers free plan: 10 ms of CPU per request (/workers/platform/limits/#cpu-time). A JSON.parse of 1 MiB is
  // a few ms on a fast machine and more at the edge, so a file the worker parses stays well under
  parse: {warn: 512 * KiB, fail: 1 * MiB},
  // the owner's line, not Cloudflare's: what a phone downloads and parses before the search bar answers
  paint: {fail: 700 * KiB},
  // what the search worker holds to answer: every kind's search rows. Past the warn, the rows want to load per
  // kind on need rather than all at once (issue #96)
  search: {warn: 2 * MiB, fail: 4 * MiB},
  // D1: a row holds at most 2,000,000 bytes (/d1/platform/limits/); worker/files.js takes 1.5e6 at most.
  // Decimal megabytes, like both of those
  d1:    {fail: 1.2e6, cap: 1.5e6},
};
/* Over a line before this check existed. Each is held at a ceiling so it cannot grow unseen, with the reason;
   it shows as a warn until it is back under the line, and fails past the ceiling. */
const HELD = {
  parse: {},   // data/index.json was held at 3 MiB until 27 Sep 2026: worker/seo.js now reads the cut (tools/shards.py)
};

/* ---------- helpers ---------- */
const fmt = n => n.toLocaleString('en-US');
const size = n => n >= MiB ? (n / MiB).toFixed(2) + ' MiB' : n >= KiB ? (n / KiB).toFixed(1) + ' KiB' : n + ' B';
const mb = n => (n / 1e6).toFixed(2) + ' MB';
const rel = p => p.slice(ROOT.length + 1).split(/[\\/]/).join('/');
const read = p => readFile(join(ROOT, p), 'utf8');
async function walk(dir, skip = () => false){
  const out = [];
  for(const d of await readdir(dir, {withFileTypes: true}).catch(() => [])){
    const p = join(dir, d.name);
    if(skip(p, d)) continue;
    if(d.isDirectory()) out.push({p, dir: true}, ...await walk(p, skip));
    else if(d.isFile()) out.push({p, dir: false});
  }
  return out;
}
const SKIP = new Set(['.git', 'node_modules', 'dist', 'tmp', '.wrangler', '__pycache__', 'cache']);
const skipRepo = (p, d) => d.isDirectory() && SKIP.has(d.name);
const readJSON = p => read(p).then(JSON.parse).catch(() => null);
// every file a manifest names, wherever it names one ({"file": path})
function named(v, out = []){
  if(v && typeof v === 'object'){
    if(typeof v.file === 'string') out.push(v.file);
    for(const x of Object.values(v)) named(x, out);
  }
  return out;
}

/* ---------- dist/, fresh ---------- */
// dist/sw-files.json is the build's last write: any file or folder in the repo newer than it and dist/ is stale
export async function fresh(){
  let built = 0;
  try { built = (await stat(join(DIST, 'sw-files.json'))).mtimeMs; } catch {}
  if(built){
    let newest = 0;
    for(const {p} of await walk(ROOT, skipRepo)) newest = Math.max(newest, (await stat(p)).mtimeMs);
    newest = Math.max(newest, (await stat(ROOT)).mtimeMs);
    if(newest <= built) return 'dist/ as built';
  }
  const r = spawnSync(process.execPath, [join(ROOT, 'tools', 'build.mjs')], {cwd: ROOT, encoding: 'utf8'});
  if(r.status !== 0) throw new Error('tools/build.mjs failed: ' + (r.stderr || r.stdout).trim().split('\n').pop());
  return built ? 'dist/ was stale: built again' : 'no dist/: built';
}

/* ---------- what the worker parses ---------- */
async function workerFiles(){
  const dir = join(ROOT, 'worker'), src = {};
  for(const n of (await readdir(dir)).filter(n => n.endsWith('.js'))) src[n] = await readFile(join(dir, n), 'utf8');
  const all = Object.values(src).join('\n');
  const found = new Map();
  const add = (name, how) => { const f = 'data/' + name; found.set(f, [...new Set([...(found.get(f) || []), how])]); };
  // shipped files, fetched through env.ASSETS and parsed: asset(env, origin, 'x.json'), assetJSON(env, origin, '/data/x.json'),
  // assetGet(env, origin, '/data/x.json')
  for(const m of all.matchAll(/\basset(?:JSON|Get)?\(\s*env\s*,\s*[\w.]+\s*,\s*'(?:\/data\/)?([\w.-]+\.json)'/g)) add(m[1], 'shipped');
  // the crawler pages' own files, named in the manifest the worker reads
  if(found.has('data/manifest.json')){
    const man = await readJSON('data/manifest.json');
    for(const f of named(man && man.seo)) found.set(f, ['shipped, named in data/manifest.json']);
  }
  // files the jobs send in, parsed out of the database: published(env, origin, 'x.json'), and every name /api/data/put takes
  for(const m of all.matchAll(/\bpublished(?:Row)?\(\s*env\s*,\s*[\w.]+\s*,\s*'([\w.-]+\.json)'/g)) add(m[1], 'database');
  for(const n of d1Names(src['files.js'] || '')) add(n, 'database');
  return found;
}
function d1Names(filesJs){
  const m = filesJs.match(/const NAMES = new Set\(\[([^\]]*)\]\)/);
  return m ? [...m[1].matchAll(/'([\w.-]+\.json)'/g)].map(x => x[1]) : [];
}

/* ---------- what the home page reads before a search ---------- */
async function paintFiles(){
  const urls = new Set();
  const html = await read('index.html');
  for(const s of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi))
    for(const m of s[1].matchAll(/\bfetch\(\s*'([^']+\.json[^']*)'/g)) urls.add(m[1]);
  // top-level reads in app.js; the index and the rest start behind need() (GO.then) and are not first paint
  const app = await read('assets/app.js');
  for(const m of app.matchAll(/^(?:export\s+)?const\s+\w+\s*=\s*getJSON\(\s*'([^']+\.json[^']*)'/gm)) urls.add(m[1]);
  return [...urls];
}
async function workerRouted(){
  const w = await read('wrangler.jsonc');
  const m = w.match(/"run_worker_first"\s*:\s*\[([^\]]*)\]/);
  return m ? [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]) : [];
}
const routed = (list, path) => list.some(r => r.endsWith('*') ? path.startsWith(r.slice(0, -1)) : path === r);

/* ---------- orphans ---------- */
const HASHED = /\.[0-9a-f]{8,}\.json$/;
const SELF = new Set(['tools/dev/budget.mjs', 'tools/dev/dumpreport.mjs', 'tools/build.mjs']);   // they name data files to judge them
async function orphans(){
  const readers = (await walk(ROOT, skipRepo)).map(x => x.p).map(rel)
    .filter(f => /\.(html|m?js|py|ya?ml|jsonc)$/.test(f) && !f.startsWith('data/') && !SELF.has(f));
  const text = (await Promise.all(readers.map(read))).join('\n');
  const data = (await walk(join(ROOT, 'data'))).filter(x => !x.dir).map(x => rel(x.p));
  const cut = new Set(named(await readJSON('data/manifest.json')));   // what the manifest names is read through it
  return data.filter(f => {
    if(cut.has(f)) return false;
    const name = f.slice(f.lastIndexOf('/') + 1), dir = f.slice(0, f.lastIndexOf('/') + 1);
    if(HASHED.test(f)) return !text.includes(f);
    return !text.includes(name) && !text.includes("'" + dir + "'") && !text.includes('"' + dir + '"');
  });
}

// dist/: files named by their content that neither this deploy nor the previous generation names, and a previous
// generation that is more than one ({what, note} each)
const CARRY = /^\/data\/(cards|search|explore)\/.+\.[0-9a-f]{8,}\.json$/;   // tools/build.mjs CARRY
async function distOrphans(){
  let list = null;
  try { list = JSON.parse(await readFile(join(DIST, 'sw-files.json'), 'utf8')); } catch { return []; }
  const own = list.files || {}, prev = list.prev || {}, out = [], slots = new Set();
  for(const p of Object.keys(prev).sort()){
    const slot = p.replace(HASHED, '');
    if(!CARRY.test(p)) out.push({what: p.slice(1), note: 'in the previous generation, but not a file of the index a page reads by name'});
    else if(own[p]) out.push({what: p.slice(1), note: 'in the previous generation and in this deploy both'});
    else if(slots.has(slot)) out.push({what: p.slice(1), note: 'a second older ' + slot.slice(1) + ': the previous generation is one generation'});
    else if(!(await stat(join(DIST, p.slice(1))).catch(() => null))) out.push({what: p.slice(1), note: 'in the previous generation, not in dist/'});
    slots.add(slot);
  }
  for(const {p, dir} of await walk(join(DIST, 'data'))){
    const f = '/' + p.slice(DIST.length + 1).split(/[\\/]/).join('/');
    if(!dir && HASHED.test(f) && !own[f] && !prev[f]) out.push({what: f.slice(1), note: 'in dist/, and neither this deploy nor the previous generation names it'});
  }
  return out;
}

/* ---------- the check ---------- */
function judge(line, n, what, lim, held){
  if(held){
    if(n > held.max) return {line, what, n, state: 'FAIL', note: 'past its held ceiling ' + size(held.max) + ' (' + held.why + ')'};
    if(n > lim.fail) return {line, what, n, state: 'held', note: 'held at ' + size(held.max) + ': ' + held.why};
  }
  if(n > lim.fail) return {line, what, n, state: 'FAIL'};
  if(lim.warn && n > lim.warn) return {line, what, n, state: 'warn'};
  return {line, what, n, state: 'ok'};
}

export async function checkBudget({offline = false} = {}){
  const bad = [], warn = [], rows = {};
  const how = await fresh();
  const dist = (await walk(DIST)).filter(x => !x.dir).map(x => ({f: rel(x.p).replace(/^dist\//, ''), p: x.p}));
  for(const x of dist) x.n = (await stat(x.p)).size;
  dist.sort((a, b) => b.n - a.n);
  const note = r => { if(r.state === 'FAIL') bad.push(r); else if(r.state !== 'ok') warn.push(r); return r; };

  // file, count
  rows.file = dist.map(x => note(judge('file', x.n, x.f, LIMITS.file)));
  rows.count = [note(judge('count', dist.length, 'files in dist/', LIMITS.count))];

  // parse
  const wf = await workerFiles();
  if(!wf.size) bad.push({line: 'parse', what: 'worker/', state: 'FAIL', note: 'found no file the worker parses: the pattern here no longer fits worker/'});
  rows.parse = [];
  for(const [f, via] of [...wf].sort()){
    let buf = null;
    try { buf = await readFile(join(DIST, f)); } catch { try { buf = await readFile(join(ROOT, f)); } catch {} }
    if(!buf){ rows.parse.push({line: 'parse', what: f, n: 0, state: 'ok', note: 'not in this repo (' + via.join(', ') + ')'}); continue; }
    const text = buf.toString('utf8'), t = [];
    // a words file (worker/seo.js, llms-full.txt) is split, not parsed
    const readIt = f.endsWith('.json') ? () => JSON.parse(text) : () => text.split('\u0001');
    for(let i = 0; i < 3; i++){ const a = performance.now(); readIt(); t.push(performance.now() - a); }
    const r = note(judge('parse', buf.length, f, LIMITS.parse, (HELD.parse || {})[f]));
    r.ms = t.sort((a, b) => a - b)[1];
    r.via = via;
    rows.parse.push(r);
  }

  // paint
  const urls = await paintFiles(), wr = await workerRouted();
  if(!urls.length) bad.push({line: 'paint', what: 'index.html', state: 'FAIL', note: 'found no first-paint read: the pattern here no longer fits index.html/app.js'});
  rows.paint = [];
  for(const u of urls){
    const path = '/' + u.split('?')[0];
    let n = null, from = 'dist/';
    if(routed(wr, path) && !offline){
      try {
        const r = await fetch(LIVE + '/' + u, {signal: AbortSignal.timeout(10000), headers: {'User-Agent': 'wraeclast-index budget check'}});
        if(r.ok){ n = (await r.arrayBuffer()).byteLength; from = 'live (the worker builds it)'; }
      } catch {}
      if(n === null) from = 'dist/ (the live site did not answer)';
    }
    if(n === null){ try { n = (await stat(join(DIST, path.slice(1)))).size; } catch { n = 0; from = 'nowhere'; } }
    rows.paint.push({line: 'paint', what: u, n, state: 'ok', note: from});
  }
  const paintSum = rows.paint.reduce((a, r) => a + r.n, 0);
  rows.paintSum = note(judge('paint', paintSum, 'home, before a search', LIMITS.paint));

  // search: the manifest, the card meta and every kind's search rows
  const man = await readJSON('data/manifest.json');
  rows.search = [];
  if(!man) bad.push({line: 'search', what: 'data/manifest.json', state: 'FAIL', note: 'not there: run python tools/shards.py'});
  else for(const f of ['data/manifest.json', man.meta.file, ...Object.values(man.kinds).map(k => k.search.file)]){
    let n = 0;
    try { n = (await stat(join(DIST, f))).size; } catch { try { n = (await stat(join(ROOT, f))).size; } catch {} }
    rows.search.push({line: 'search', what: f, n, state: 'ok'});
  }
  rows.searchSum = note(judge('search', rows.search.reduce((a, r) => a + r.n, 0), 'the search, before its first answer', LIMITS.search));

  // d1
  const py = await readdir(join(ROOT, 'tools')).catch(() => []);
  const names = new Set(d1Names(await read('worker/files.js').catch(() => '')));
  for(const n of py.filter(n => n.endsWith('.py'))){
    const s = await read('tools/' + n);
    for(const m of s.matchAll(/sitedata\.publish\(\s*'([\w.-]+\.json)'/g)) names.add(m[1]);
    const rec = s.match(/^RECORD\s*=\s*'([\w.-]+\.json)'/m);
    if(rec && s.includes('sitedata.publish(RECORD')) names.add(rec[1]);
  }
  rows.d1 = [];
  for(const n of [...names].sort()){
    let b = null;
    try { b = (await stat(join(ROOT, 'data', n))).size; } catch {}
    rows.d1.push(b === null ? {line: 'd1', what: 'data/' + n, n: 0, state: 'ok', note: 'not in this repo'} : note(judge('d1', b, 'data/' + n, LIMITS.d1)));
  }

  // orphans
  rows.orphan = await orphans();
  for(const f of rows.orphan) bad.push({line: 'orphan', what: f, state: 'FAIL', note: 'nothing reads it: delete it, or name what reads it'});
  const stray = await distOrphans();
  for(const x of stray) bad.push({line: 'orphan', what: 'dist/' + x.what, state: 'FAIL', note: x.note});
  rows.orphan.push(...stray.map(x => 'dist/' + x.what));
  try { rows.prev = Object.keys(JSON.parse(await readFile(join(DIST, 'sw-files.json'), 'utf8')).prev || {}).length; } catch { rows.prev = 0; }

  return {bad, warn, rows, how, offline};
}

/* ---------- the guard's one line, and the table ---------- */
export function budgetLine(r){
  const top = r.rows.file[0], parse = [...r.rows.parse].sort((a, b) => b.n - a.n)[0], d1 = [...r.rows.d1].sort((a, b) => b.n - a.n)[0];
  const head = [
    'biggest ' + (top ? top.what.replace(/^data\//, '') + ' ' + size(top.n) + '/' + size(LIMITS.file.fail) : '-'),
    fmt(r.rows.count[0].n) + '/' + fmt(LIMITS.count.fail) + ' files',
    'parse ' + (parse ? parse.what.replace(/^data\//, '') + ' ' + size(parse.n) + (parse.state === 'held' ? ' (held)' : '/' + size(LIMITS.parse.fail)) : '-'),
    'paint ' + size(r.rows.paintSum.n) + '/' + size(LIMITS.paint.fail),
    'search ' + size(r.rows.searchSum.n) + '/' + size(LIMITS.search.fail),
    'd1 ' + (d1 ? mb(d1.n) + '/' + mb(LIMITS.d1.fail) : '-'),
    r.rows.orphan.length + ' orphans',
    r.rows.prev + ' of the previous generation',
  ].join(' · ');
  const say = x => x.line + ' ' + x.what + (x.n ? ' ' + size(x.n) : '') + (x.note ? ' (' + x.note + ')' : '');
  if(r.bad.length) return r.bad.length + ' over: ' + r.bad.slice(0, 3).map(say).join(' | ');
  return head + (r.warn.length ? ' · warn: ' + r.warn.map(x => x.line + ' ' + x.what.replace(/^data\//, '')).join(', ') : '');
}

function table(r){
  const out = [], pct = (n, of) => (100 * n / of).toFixed(0) + '%';
  const row = (a, b, c, d) => out.push('  ' + a.padEnd(46) + b.padStart(12) + '  ' + c.padEnd(6) + d);
  out.push('budget · ' + r.how + (r.offline ? ' · offline' : ''));
  out.push('');
  out.push('the biggest files dist/ serves (warn ' + size(LIMITS.file.warn) + ', fail ' + size(LIMITS.file.fail) + ', Cloudflare stops at ' + size(LIMITS.file.cap) + ')');
  for(const x of r.rows.file.slice(0, 10)) row(x.what, size(x.n), x.state, pct(x.n, LIMITS.file.fail) + ' of the line');
  out.push('');
  out.push('files in dist/ (warn ' + fmt(LIMITS.count.warn) + ', fail ' + fmt(LIMITS.count.fail) + ', Cloudflare stops at ' + fmt(LIMITS.count.cap) + ')');
  row('dist/', fmt(r.rows.count[0].n), r.rows.count[0].state, fmt(LIMITS.count.fail - r.rows.count[0].n) + ' to the line');
  out.push('');
  out.push('parsed by the worker per request (warn ' + size(LIMITS.parse.warn) + ', fail ' + size(LIMITS.parse.fail) + '; 10 ms of CPU a request)');
  for(const x of [...r.rows.parse].sort((a, b) => b.n - a.n))
    row(x.what, x.n ? size(x.n) : '-', x.state, (x.ms != null ? x.ms.toFixed(1) + ' ms to parse here, ' : '') + (x.via || []).join(' + ') + (x.note ? ' · ' + x.note : ''));
  out.push('');
  out.push('JSON the home page reads before a search (fail over ' + size(LIMITS.paint.fail) + ')');
  for(const x of r.rows.paint) row(x.what, size(x.n), '', x.note);
  row('together', size(r.rows.paintSum.n), r.rows.paintSum.state, size(LIMITS.paint.fail - r.rows.paintSum.n) + ' to the line');
  out.push('');
  out.push('what the search reads before its first answer (warn ' + size(LIMITS.search.warn) + ', fail ' + size(LIMITS.search.fail) + ')');
  for(const x of r.rows.search) row(x.what, size(x.n), '', '');
  row('together', size(r.rows.searchSum.n), r.rows.searchSum.state, size(LIMITS.search.fail - r.rows.searchSum.n) + ' to the line');
  out.push('');
  out.push('bodies the jobs send to the database (fail over ' + mb(LIMITS.d1.fail) + '; worker/files.js takes ' + mb(LIMITS.d1.cap) + ')');
  for(const x of [...r.rows.d1].sort((a, b) => b.n - a.n)) row(x.what, x.n ? mb(x.n) : '-', x.state, x.note || mb(LIMITS.d1.fail - x.n) + ' to the line');
  out.push('');
  out.push('data files nothing reads: ' + (r.rows.orphan.length ? r.rows.orphan.join(', ') : 'none'));
  out.push('');
  for(const x of r.bad) out.push('FAIL ' + x.line + ' ' + x.what + (x.n ? ' ' + size(x.n) : '') + (x.note ? ': ' + x.note : ''));
  for(const x of r.warn) out.push('warn ' + x.line + ' ' + x.what + ' ' + size(x.n) + (x.note ? ': ' + x.note : ''));
  out.push(r.bad.length ? r.bad.length + ' over' : 'all under' + (r.warn.length ? ', ' + r.warn.length + ' to watch' : ''));
  return out.join('\n');
}

if(import.meta.url === 'file:///' + (process.argv[1] || '').replace(/\\/g, '/').replace(/^\//, '')){
  const r = await checkBudget({offline: process.argv.includes('--offline')});
  console.log(table(r));
  process.exit(r.bad.length ? 1 : 0);
}
