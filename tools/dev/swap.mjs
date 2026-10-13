/* A deploy swapped under a returning visitor: does a page ever run two deploys' modules?

     node tools/dev/swap.mjs <dist A> <dist B>         two built sites (node tools/build.mjs --out <dir>)
     node tools/dev/swap.mjs --refs <ref A>,<ref B>    build both first, each from a git ref (a temporary worktree)
     node tools/dev/swap.mjs ... --only=held,open     some of the visitors below
     node tools/dev/swap.mjs ... --keep                leave the built folders behind (they are printed)
     node tools/dev/swap.mjs ... --age=<s>             seconds between the last visit and the deploy (125: past max-age=120,
                                                       inside stale-while-revalidate, where the 13 Oct break happened)
     node tools/dev/swap.mjs ... --no-live             the worker's paths answer 404 (no prices: the check then waits
                                                       for a drawn card, not a priced one)

   One server on http://localhost:<port> (a secure context, so the service worker runs, and a real browser cache: Chrome
   keeps none for a host whose certificate it was told to ignore). It serves dist A or dist B on the same origin, with
   that build's own _headers, an ETag and 304s, a page revalidated every time (as Cloudflare answers a page with no
   rule), and the worker's paths (prices) from the live site. Three visitors, each a Chrome profile kept across loads:
     clean     B only, first visit and second visit
     held      A twice (cached by the browser, no service worker), then the deploy (the server now answers B), then
               B twice
     held+sw   the same with A's service worker installed and its copy kept
     open      A open in a tab when B is deployed under it; the tab then opens Bosses, Currency and a card: modules it
               never had, which must be A's (tools/build.mjs carries the last deploy's named module copies one deploy on)
   A load passes when the search's card is drawn (priced, with prices) within 30 seconds, after at most one reload,
   with no module answered 404 and no uncaught error. Exit 1 on any failed load. About two minutes; four with --refs. */
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, mkdtemp, rm, readFile as rf } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const KEEP = args.includes('--keep'), NOLIVE = args.includes('--no-live');
const ONLY = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);   // some of the visitors
const run = name => !ONLY.length || ONLY.includes(name);
const AGE = +((args.find(a => a.startsWith('--age=')) || '--age=125').slice(6));   // seconds between the last visit and the deploy
const PATH = '/#/?q=mageblood';
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- the two sites ---------- */
let A, B;
const made = [];
const refsAt = args.indexOf('--refs');
if(refsAt >= 0){
  const [ra, rb] = (args[refsAt + 1] || '').split(',');
  if(!ra || !rb){ console.error('swap.mjs --refs <ref A>,<ref B>'); process.exit(2); }
  const build = async ref => {
    const tree = await mkdtemp(join(tmpdir(), 'wi-swap-tree-')), out = await mkdtemp(join(tmpdir(), 'wi-swap-dist-'));
    execFileSync('git', ['-C', ROOT, 'worktree', 'add', '--detach', tree, ref], {stdio: 'ignore'});
    made.push(() => execFileSync('git', ['-C', ROOT, 'worktree', 'remove', '--force', tree], {stdio: 'ignore'}));
    // the tree borrows this checkout's node_modules (esbuild) through NODE_PATH-free resolution: a link
    try { execFileSync(process.platform === 'win32' ? 'cmd' : 'ln', process.platform === 'win32'
      ? ['/c', 'mklink', '/J', join(tree, 'node_modules'), join(ROOT, 'node_modules')] : ['-s', join(ROOT, 'node_modules'), join(tree, 'node_modules')], {stdio: 'ignore'}); } catch {}
    console.log('swap: building ' + ref + ' into ' + out);
    execFileSync(process.execPath, [join(tree, 'tools', 'build.mjs'), '--out', out], {cwd: tree, stdio: 'ignore', env: {...process.env, WI_PREV_FROM: 'off'}});
    if(!KEEP) made.push(() => rm(out, {recursive: true, force: true}));
    return out;
  };
  A = await build(ra); B = await build(rb);
} else {
  [A, B] = args.filter(a => !a.startsWith('--')).map(p => resolve(p));
  if(!A || !B){ console.error('swap.mjs <dist A> <dist B>   or   swap.mjs --refs <ref A>,<ref B>'); process.exit(2); }
}

/* ---------- the server ---------- */
const WORKER = /^\/(data\/market\.json|data\/market\/|data\/(rollprices|farmprices|bossprices)\.json|api\/)/;
const TYPES = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8',
  txt: 'text/plain; charset=utf-8', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2', ico: 'image/x-icon', jpg: 'image/jpeg'};
let SITE = A;
// _headers: a path pattern and its lines; every matching block applies in order, "! Name" drops a header
const RULES = new Map();
function headersFor(dir, path){
  if(!RULES.has(dir)){
    const out = [];
    let cur = null;
    for(const line of readFileSync(join(dir, '_headers'), 'utf8').split(/\r?\n/)){
      if(!line.trim() || line.trim().startsWith('#')) continue;
      if(!/^\s/.test(line)){ cur = {re: new RegExp('^' + line.trim().replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$'), set: []}; out.push(cur); continue; }
      const t = line.trim();
      if(t.startsWith('!')) cur.set.push(['drop', t.slice(1).trim().toLowerCase()]);
      else { const i = t.indexOf(':'); cur.set.push(['set', t.slice(0, i).trim().toLowerCase(), t.slice(i + 1).trim()]); }
    }
    RULES.set(dir, out);
  }
  const h = {};
  for(const r of RULES.get(dir)) if(r.re.test(path)) for(const [op, k, v] of r.set) op === 'drop' ? delete h[k] : (h[k] = v);
  return h;
}
// _redirects: the plain lines (from to status), as Cloudflare answers them before the files
const REDIRECTS = new Map();
function redirectOf(dir, path){
  if(!REDIRECTS.has(dir)){
    const m = new Map();
    try { for(const line of readFileSync(join(dir, '_redirects'), 'utf8').split(/\r?\n/)){ const p = line.trim().split(/\s+/); if(p.length >= 2 && p[0].startsWith('/') && !p[0].includes('*')) m.set(p[0], [p[1], +(p[2] || 302)]); } } catch {}
    REDIRECTS.set(dir, m);
  }
  return REDIRECTS.get(dir).get(path);
}
async function file(dir, path){
  const tries = path === '/' ? ['/index.html'] : [path, path + '.html', path + '/index.html'];
  for(const t of tries){ try { return {status: 200, body: await readFile(join(dir, t)), type: TYPES[(t.match(/\.(\w+)$/) || [])[1]] || 'application/octet-stream'}; } catch {} }
  return {status: 404, body: Buffer.from('Not found'), type: TYPES.txt};
}
const LIVE = new Map();
async function live(url){
  const key = url.pathname + url.search;
  if(NOLIVE) return {status: 404, body: Buffer.from('{}'), type: TYPES.json};
  if(!LIVE.has(key)) LIVE.set(key, fetch('https://wraeclastindex.fyi' + key, {headers: {'User-Agent': 'wraeclast-index swap.mjs'}})
    .then(async r => ({status: r.status, body: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || TYPES.json})));
  return LIVE.get(key);
}
const srv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost'), path = decodeURIComponent(url.pathname), dir = SITE;
  const moved = redirectOf(dir, path);
  if(moved){ res.writeHead(moved[1], {location: moved[0]}); res.end(); return; }
  let r;
  try { r = WORKER.test(path) ? await live(url) : await file(dir, path); } catch(e){ r = {status: 502, body: Buffer.from(String(e)), type: TYPES.txt}; }
  const h = {'content-type': r.type};
  if(r.status === 200){
    Object.assign(h, WORKER.test(path) ? {'cache-control': 'no-store'} : headersFor(dir, path));
    if(!h['cache-control'] && /html/.test(r.type)) h['cache-control'] = 'public, max-age=0, must-revalidate';
    h.etag = '"' + createHash('sha1').update(r.body).digest('hex').slice(0, 16) + '"';
    if(req.headers['if-none-match'] === h.etag){ res.writeHead(304, h); res.end(); return; }
  }
  res.writeHead(r.status, h); res.end(r.body);
});
await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
const ORIGIN = 'http://localhost:' + srv.address().port;

/* ---------- Chrome ---------- */
const CHROME = process.env.CHROME || [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', 'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].find(p => { try { readFileSync(p); return true; } catch { return false; } });
if(!CHROME){ console.error('swap: no Chrome found; set CHROME=<path>'); process.exit(2); }
function cdp(ws){
  let n = 0; const waits = new Map(), on = new Map();
  ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
    if(m.id && waits.has(m.id)){ const w = waits.get(m.id); waits.delete(m.id); m.error ? w.bad(new Error(m.error.message)) : w.ok(m.result); }
    else if(m.method) for(const f of on.get(m.method) || []) f(m.params); });
  return {send: (method, params = {}) => new Promise((ok, bad) => { const id = ++n; waits.set(id, {ok, bad}); ws.send(JSON.stringify({id, method, params})); }),
    on: (method, f) => { if(!on.has(method)) on.set(method, []); on.get(method).push(f); }};
}
async function open(url){ const ws = new WebSocket(url); await new Promise((ok, bad) => { ws.addEventListener('open', ok, {once: true}); ws.addEventListener('error', bad, {once: true}); }); return cdp(ws); }
async function evalJS(page, expression){
  const r = await page.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  return r.exceptionDetails ? null : r.result.value;
}
async function visitor(name, steps){
  const dir = await mkdtemp(join(tmpdir(), 'wi-swap-profile-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
  const out = [];
  try {
    const port = await new Promise((ok, no) => { let buf = ''; const t = setTimeout(() => no(new Error('Chrome did not open a port')), 20000);
      proc.stderr.on('data', d => { buf += d; const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)\//); if(m){ clearTimeout(t); ok(+m[1]); } }); });
    const ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    const browser = await open(ver.webSocketDebuggerUrl);
    const {targetId} = await browser.send('Target.createTarget', {url: 'about:blank'});
    const page = await open('ws://127.0.0.1:' + port + '/devtools/page/' + targetId);
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Network.enable');
    let rec = null;
    page.on('Page.frameNavigated', p => { if(rec && !p.frame.parentId && /^http/.test(p.frame.url)) rec.loads++; });
    page.on('Network.responseReceived', p => { if(rec && p.response.status >= 400 && /\/assets\/.+\.js/.test(p.response.url)) rec.failed.push(p.response.status + ' ' + p.response.url.replace(ORIGIN, '')); });
    page.on('Runtime.exceptionThrown', p => { if(rec) rec.errors.push((p.exceptionDetails.exception?.description || p.exceptionDetails.text || '').split('\n')[0].slice(0, 140)); });
    const card = NOLIVE ? `document.querySelector('#cards .card')` : `document.querySelector('#cards .card .card-px')`;
    const load = async (label) => {
      await page.send('Page.navigate', {url: 'about:blank'}); await wait(300);   // a visit, not a change of the address's #
      rec = {visitor: name, site: SITE === A ? 'A' : 'B', label, loads: 0, failed: [], errors: []};
      const t0 = Date.now();
      await page.send('Page.navigate', {url: ORIGIN + PATH});
      let ok = false;
      for(const end = Date.now() + 30000; Date.now() < end; ){ if(await evalJS(page, '!!' + card)){ ok = true; break; } await wait(200); }
      await wait(1500);   // a reload on its way lands here
      if(ok) ok = !!(await evalJS(page, '!!' + card));
      const r = rec; rec = null;
      r.ms = Date.now() - t0 - 1500; r.drawn = ok;
      r.pass = ok && r.loads <= 2 && !r.failed.length && !r.errors.length;
      out.push(r);
      return r;
    };
    // something done on the page already open (no new visit): passes when `done` comes true in 30 s, at most one reload
    const act = async (label, run, done) => {
      rec = {visitor: name, site: SITE === A ? 'A' : 'B', label, loads: 1, failed: [], errors: []};
      const t0 = Date.now();
      await evalJS(page, run);
      let ok = false;
      for(const end = Date.now() + 30000; Date.now() < end; ){ if(await evalJS(page, '!!(' + done + ')')){ ok = true; break; } await wait(200); }
      await wait(1500);
      const r = rec; rec = null;
      r.ms = Date.now() - t0 - 1500; r.drawn = ok;
      r.pass = ok && r.loads <= 2 && !r.failed.length && !r.errors.length;
      out.push(r);
      return r;
    };
    const sw = async on => {
      if(!on) return page.send('Network.setBypassServiceWorker', {bypass: true});
    };
    await steps({load, act, sw, page, ready: async () => {
      await evalJS(page, `Promise.race([navigator.serviceWorker.ready.then(() => 1), new Promise(r => setTimeout(r, 20000))])`);
      await wait(6000);   // its copy kept
    }});
  } finally {
    proc.kill(); await wait(500); await rm(dir, {recursive: true, force: true}).catch(() => {});
  }
  return out;
}

/* ---------- the visitors ---------- */
const results = [];
SITE = B;
if(run('clean')) results.push(...await visitor('clean', async ({load}) => { await load('first visit'); await load('second visit'); }));
for(const withSW of [false, true]) if(run(withSW ? 'held+sw' : 'held')) results.push(...await visitor(withSW ? 'held+sw' : 'held', async ({load, sw, ready}) => {
  SITE = A;
  await sw(withSW);
  await load('first visit');
  if(withSW) await ready();
  await load('second visit');
  await wait(AGE * 1000);   // past a browser cache's fresh time (_headers max-age=120): what it keeps is now stale
  SITE = B;   // the deploy
  await load('first load after the deploy');
  if(withSW) await wait(8000);   // B's service worker installs
  await load('second load after the deploy');
}));
// a tab left open across the deploy, that then opens a tab of the site and a card: modules it never fetched before
if(run('open')) results.push(...await visitor('open', async ({load, act, sw}) => {
  SITE = A;
  await sw(false);
  await load('the visit');
  SITE = B;   // the deploy, under the open tab
  await act('then the Bosses tab', `location.hash = '#/bosses'`, `document.querySelectorAll('#view-bosses *').length > 100`);
  await act('then the Currency tab', `location.hash = '#/currency'`, `document.querySelectorAll('#view-currency .card').length > 5`);
  await act('then a card from it', `(document.querySelector('#view-currency .card h3') || document.querySelector('#view-currency .card')).click()`,
    `document.querySelector('.ov') && !document.querySelector('.ov').hidden && document.querySelector('.ov h3')`);
}));
srv.close();
for(const f of made.reverse()) await f();
const bad = results.filter(r => !r.pass);
for(const r of results) console.log((r.pass ? 'ok   ' : 'FAIL ') + (r.visitor + ' ').padEnd(9) + r.site + ' ' + r.label.padEnd(28) +
  (r.drawn ? 'card in ' + r.ms + ' ms' : 'no card') + (r.loads > 1 ? ', ' + (r.loads - 1) + ' reload' + (r.loads > 2 ? 's' : '') : '') +
  (r.failed.length ? ' · ' + r.failed.slice(0, 3).join(', ') : '') + (r.errors.length ? ' · ' + r.errors[0] : ''));
console.log(bad.length ? bad.length + ' load(s) failed' : 'every load drew its card, none ran two deploys');
process.exit(bad.length ? 1 : 0);
