/* The check to run before a push: does the site still hold together?

     node tools/dev/guard.mjs                 against a local server it starts on this worktree
     node tools/dev/guard.mjs --live          against https://wraeclastindex.fyi
     node tools/dev/guard.mjs http://host     against any other address
     node tools/dev/guard.mjs --bless         the same, then write today's numbers into the baseline
     node tools/dev/guard.mjs --no-phone      skip the headless Chrome pass

   Six checks, one line each, non-zero exit on any FAIL:
     cards   how many cards of each kind, against tools/dev/guard-baseline.json
     links   every deep link the code emits lands on a real row in the data
     pages   every public page answers 200; the sitemap and llms.txt did not shrink
     rawcode no stat ids, [Word|Word] markup or {0} placeholders where a player can read them
     phone   a real phone-sized Chrome: cards stay open, nothing scrolls sideways, no console errors

   The local server is this worktree's own files plus worker/seo.js, run in this process, so no
   wrangler and no deploy. Nothing is written anywhere but the baseline, and only with --bless. */
import { createServer } from 'node:http';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as seo from '../../worker/seo.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const BASELINE = join(HERE, 'guard-baseline.json');
const LIVE = 'https://wraeclastindex.fyi';
const TOL = 0.02;          // a kind may lose this much before it counts as broken
const SAMPLE = 200;        // deep links tried per kind
const PAGE_SAMPLE = 20;    // item pages fetched per kind
const KINDS = {g: 'gems', u: 'uniques', p: 'passives', w: 'keywords', c: 'currency', b: 'bases', a: 'atlas'};

/* ---------- what counts as raw game code ---------- */
// "(?!\(" keeps a Markdown link ("[Gems](https://...)", llms.txt) from reading as game markup
const MARKS = [
  ['stat id', /(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])/],
  ['[a|b] markup', /\[[^\]|]{1,60}\|[^\]]{1,60}\](?!\()/],
  ['[Tag] markup', /\[[A-Z][A-Za-z]{2,}\](?!\()/],
  ['{0} placeholder', /\{\d*(?::[^}]{0,12})?\}/],
  ['%1$s template', /%\d+\$[sd]/],
  ['DNT marker', /\bDNT[-\w]*/],
];
const mark = s => { for(const [n, re] of MARKS) if(re.test(s)) return n; return null; };

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const bless = has('--bless'), noPhone = has('--no-phone');
const given = argv.find(a => /^https?:\/\//.test(a));
const base = (has('--live') ? LIVE : given || '').replace(/\/$/, '');

/* ---------- the report ---------- */
const lines = [];
let failed = 0;
function say(name, ok, detail){
  if(!ok) failed++;
  lines.push((ok ? 'ok   ' : 'FAIL ') + (name + ' '.repeat(8)).slice(0, 8) + detail);
}
const fmt = n => n.toLocaleString('en-US');
const clip = (s, n = 90) => String(s).replace(/\s+/g, ' ').slice(0, n);
const pick = (list, n) => list.length <= n ? list : [...list].sort(() => Math.random() - 0.5).slice(0, n);

/* ---------- a local copy of the site, in this process ---------- */
const TYPES = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2',
  ico: 'image/x-icon', jpg: 'image/jpeg', avif: 'image/avif'};

// the same file Cloudflare's asset server would send: "/" is index.html, "/explore" is explore.html
async function asset(req){
  const path = decodeURIComponent(new URL(req.url).pathname);
  if(path.includes('..')) return new Response('no', {status: 400});
  const tries = path === '/' ? ['/index.html'] : [path, path + '.html', path + '/index.html'];
  for(const t of tries){
    let body;
    try { body = await readFile(join(ROOT, t)); } catch { continue; }
    const ext = (t.match(/\.(\w+)$/) || [])[1] || '';
    return new Response(body, {status: 200, headers: {'Content-Type': TYPES[ext] || 'application/octet-stream'}});
  }
  return new Response('Not found', {status: 404, headers: {'Content-Type': 'text/plain'}});
}
// sw.js is served unstamped on purpose: unstamped it switches itself off (sw.js OFF), so a check never
// reads a page out of a service worker's copy
async function startServer(){
  const env = {ASSETS: {fetch: asset}};
  const srv = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://' + (req.headers.host || '127.0.0.1'));
    let r;
    try {
      r = seo.handles(url.pathname)
        ? await seo.respond(new Request(url.href, {method: req.method}), env, null, null)
        : await asset(new Request(url.href));
    } catch(e){ r = new Response('guard: ' + (e && e.message), {status: 500}); }
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(r.status === 301 || r.status === 302 ? '' : Buffer.from(await r.arrayBuffer()));
  });
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  return {url: 'http://127.0.0.1:' + srv.address().port, stop: () => new Promise(ok => srv.close(ok))};
}

/* ---------- reading the site ---------- */
const AT_ONCE = 8;         // requests in flight at a time: kind to a local server and to the live one
let SITE = '';
async function get(path){
  const r = await fetch(SITE + path, {headers: {'User-Agent': 'wraeclast-index-guard'}});
  return {status: r.status, text: await r.text()};
}
async function all(list, fn){
  const out = [];
  for(let i = 0; i < list.length; i += AT_ONCE) out.push(...await Promise.all(list.slice(i, i + AT_ONCE).map(fn)));
  return out;
}
async function getJSON(path){
  const r = await get(path);
  if(r.status !== 200) throw new Error(path + ' ' + r.status);
  return JSON.parse(r.text);
}

/* ---------- 1. how many cards of each kind ---------- */
function countKinds(index){
  const out = {};
  for(const it of index.items) if(KINDS[it.k]) out[it.k] = (out[it.k] || 0) + 1;
  return out;
}
function checkCards(now, want){
  const bad = [], moved = [];
  for(const [k, n] of Object.entries(want)){
    const got = now[k] || 0;
    if(!got) bad.push(KINDS[k] + ' gone');
    else if(got < n * (1 - TOL)) bad.push(KINDS[k] + ' ' + fmt(n) + ' \u2192 ' + fmt(got));
    else if(got !== n) moved.push(KINDS[k] + ' ' + (got > n ? '+' : '') + fmt(got - n));
  }
  for(const k of Object.keys(now)) if(!(k in want)) moved.push(KINDS[k] + ' new');
  const total = Object.values(now).reduce((a, b) => a + b, 0);
  say('cards', !bad.length, bad.length ? bad.join(', ')
    : Object.keys(now).length + ' kinds, ' + fmt(total) + ' cards' + (moved.length ? ' \u00b7 ' + moved.join(', ') : ' \u00b7 no change'));
}

/* ---------- 2. deep links ----------
   Every form the code emits, found in assets/app.js (hrefOf, craftHref, the "Found on" rows),
   assets/keys.js (the Go to ... shortcuts) and worker/seo.js (appHref, /item/<slug>). */
async function checkLinks(index, market){
  const miss = [], forms = new Set();
  const src = {
    app: await readFile(join(ROOT, 'assets', 'app.js'), 'utf8'),
    keys: await readFile(join(ROOT, 'assets', 'keys.js'), 'utf8'),
    bridge: await readFile(join(ROOT, 'assets', 'bridge.js'), 'utf8'),
    seo: await readFile(join(ROOT, 'worker', 'seo.js'), 'utf8'),
  };
  // the app's own tab names, and the drill-down page's sections
  const routes = new Set((src.app.match(/const r = \[([^\]]+)\]/) || ['', ''])[1].match(/'(\w+)'/g)?.map(s => s.slice(1, -1)) || []);
  const sections = new Set(Object.keys(JSON.parse((src.bridge.match(/const SECTIONS = \{([^}]*)\}/) || ['', ''])[1]
    .replace(/(\w+):/g, '"$1":').replace(/'/g, '"').replace(/^/, '{').replace(/$/, '}'))));
  if(!routes.size || !sections.size) miss.push('could not read the tab or section names out of app.js / bridge.js');
  // every "#/tab" and "explore#section" written anywhere in those files
  for(const f of ['app', 'keys', 'seo']) if(routes.size && sections.size){
    for(const m of src[f].matchAll(/#\/(\w+)/g)){ forms.add('#/' + m[1]); if(!routes.has(m[1])) miss.push(f + '.js emits #/' + m[1] + ', no such tab'); }
    for(const m of src[f].matchAll(/explore#(\w+)/g)){ forms.add('explore#' + m[1]); if(!sections.has(m[1])) miss.push(f + '.js emits explore#' + m[1] + ', no such section'); }
  }

  // the rows a deep link has to land on
  const html = (await get('/explore')).text;
  const files = JSON.parse((html.match(/var F=(\{[^}]*\})/) || ['', '{}'])[1]);
  const [gems, uniques, tree, keywords] = await Promise.all(['gemdata', 'uqdata', 'trdata', 'kwdata'].map(k => getJSON('/' + files[k])));
  const rows = {
    gems: new Set(gems.gems.map(g => g.n)),
    uniques: new Set(uniques.items.map(u => u.n)),
    tree: new Set(tree.passives.map(p => p.n)),
  };
  const kw = new Set(Object.keys(keywords));
  const craft = new Map(JSON.parse(await readFile(join(ROOT, 'data', 'craft.json'), 'utf8')).classes.map(c => [c.id, new Set(c.b.map(b => b[0]))]));
  const atlas = JSON.parse(await readFile(join(ROOT, 'data', 'atlas.json'), 'utf8'));
  // the lists each Atlas section really shows (assets/atlas.js): tablets carry the unique tablets too,
  // and the tree's names sit inside its groups
  const AT = {ways: atlas.ways, tabs: [...atlas.tabs, ...atlas.tuniq], keys: atlas.keys, items: atlas.items,
    tree: atlas.tree.flatMap(g => g.nodes)};
  const atNames = {};
  for(const [s, list] of Object.entries(AT)) atNames[s] = new Set((list || []).map(x => x && x.n).filter(Boolean));
  const priced = new Set(Object.keys((market && market.items) || {}));
  const CUT = /^\[DNT|^Removed Skill$/;   // the same rows the pages themselves drop (explore.html CUT, seo.js)
  const hay = it => [it.n, it.s, it.t, it.q, (it.ls || []).join(' ')].filter(Boolean).join(' ').toLowerCase();

  const byKind = {};
  for(const it of index.items) if(KINDS[it.k]) (byKind[it.k] = byKind[it.k] || []).push(it);
  let tried = 0;
  const want = (ok, form, it) => { tried++; if(!ok && miss.length < 12) miss.push(form + ' \u2192 ' + it.n); };
  for(const [k, list] of Object.entries(byKind)){
    for(const it of pick(list.filter(x => !CUT.test(x.n)), SAMPLE)){
      if(k === 'g') want(rows.gems.has(it.n), 'explore#gems=', it);
      if(k === 'u') want(rows.uniques.has(it.n), 'explore#uniques=', it);
      if(k === 'p') want(rows.tree.has(it.n), 'explore#tree=', it);
      // the Currency tab filters its catalogue by the id in the address, against the card's own words (app.js _hay)
      if(k === 'c' && priced.has('c:' + it.id)) want(hay(it).includes(it.id.toLowerCase()), '#/currency?c=', it);
      if(k === 'b' && it.cr) want(craft.has(it.cr) && craft.get(it.cr).has(it.n), '#/craft?s=', it);
      if(k === 'a' && it.at) want(!!atNames[it.at] && atNames[it.at].has(it.n), '#/atlas?s=' + it.at + '&q=', it);
      if(k === 'w'){   // the "See all in ..." button under "Found on"
        for(const [g, sec] of [['gems', 'gems'], ['uniques', 'uniques'], ['passives', 'tree']])
          if(it.use && it.use[g]) want(kw.has(it.id), 'explore#' + sec + '?kw=', it);
      }
    }
  }
  // the crawler's own pages, over the wire: the slug redirects to its canonical spelling, so this lands on the page
  const pages = [];
  for(const list of Object.values(byKind)) for(const it of pick(list.filter(x => !CUT.test(x.n)), PAGE_SAMPLE)) pages.push(it);
  const hits = await all(pages, async it => {
    const r = await get('/item/' + seo.slugify(it.n));
    return r.status === 200 ? null : '/item/' + seo.slugify(it.n) + ' ' + r.status;
  });
  for(const h of hits) if(h && miss.length < 12) miss.push(h);
  tried += pages.length;
  say('links', !miss.length, miss.length ? miss.length + ' broken: ' + clip(miss.join(', '), 160)
    : fmt(tried) + ' links tried, ' + forms.size + ' forms, all land');
}

/* ---------- 3. the public pages ---------- */
function publicPaths(src){
  const lists = [...(src.match(/const LISTS = \{[\s\S]*?\n\};/) || [''])[0].matchAll(/^  (\w+):/gm)].map(m => '/' + m[1]);
  const flat = [...src.matchAll(/path === '([^']+)'/g)].map(m => m[1]).filter(p => p !== '/search');
  return ['/', '/explore', '/privacy', ...lists, ...new Set(flat)];
}
async function checkPages(want){
  const src = await readFile(join(ROOT, 'worker', 'seo.js'), 'utf8');
  const paths = publicPaths(src);
  const bad = [];
  const got = await all(paths, async p => ({p, ...await get(p)}));
  for(const r of got) if(r.status !== 200) bad.push(r.p + ' ' + r.status);
  const counts = {};
  for(const r of got){
    if(r.p === '/sitemap.xml') counts.sitemap = (r.text.match(/<url>/g) || []).length;
    if(r.p === '/llms.txt') counts.llms = (r.text.match(/^- \[/gm) || []).length;
    if(r.p === '/llms-full.txt') counts.llmsFull = (r.text.match(/^### /gm) || []).length;
  }
  for(const [k, n] of Object.entries(counts)){
    const was = (want || {})[k];
    if(was && n < was * (1 - TOL)) bad.push(k + ' ' + fmt(was) + ' \u2192 ' + fmt(n));
  }
  say('pages', !bad.length, bad.length ? bad.join(', ')
    : paths.length + ' pages 200 \u00b7 sitemap ' + fmt(counts.sitemap || 0) + ', llms.txt ' + fmt(counts.llms || 0) +
      ' links, llms-full ' + fmt(counts.llmsFull || 0) + ' items');
  return {paths, counts, got};
}

/* ---------- 4. no raw game code where a player can read it ----------
   The shipped JSON is walked by path (array places and map keys collapse to * and {key}), so the
   allow-list stays short. Known internal keys are still full of raw ids today and sit on the list;
   a path that is not on it is new, and fails. Text a player really reads (rendered pages, llms.txt)
   gets no such excuse. */
function walk(file, path, v, out){
  if(typeof v === 'string'){
    const m = mark(v);
    if(m){ const key = file + ' ' + path + ' [' + m + ']'; const o = out.get(key) || {n: 0, eg: v}; o.n++; out.set(key, o); }
    return;
  }
  if(Array.isArray(v)){ for(const x of v) walk(file, path + '[]', x, out); return; }
  if(!v || typeof v !== 'object') return;
  const keys = Object.keys(v), wide = keys.length > 24;
  for(const k of keys){
    const m = mark(k);
    if(m){ const key = file + ' ' + path + '.{key} [' + m + ']'; const o = out.get(key) || {n: 0, eg: k}; o.n++; out.set(key, o); }
    walk(file, path + '.' + (wide || /^\d+$/.test(k) || k.includes('_') || k.length > 24 ? '*' : k), v[k], out);
  }
}
function visible(html){
  return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:amp|lt|gt|quot|#\d+|#x[0-9a-f]+|[a-z]+);/gi, ' ')
    .replace(/\s+/g, ' ');
}
/* A hit's signature is the text from the mark on, short and the same wherever that text is shown, so a
   known leak can sit on the allow-list by name without the page it was found on mattering. */
function lintText(where, text, seen){
  for(const [name, re] of MARKS){
    for(const m of text.matchAll(new RegExp(re.source, 'g'))){
      const sig = name + ': ' + clip(text.slice(m.index, m.index + 64).replace(/^[^\[{%A-Za-z]+/, ''), 56);
      if(!seen.has(sig)) seen.set(sig, where);
    }
  }
}
async function checkRaw(index, files, pages, want){
  const found = new Map();
  const jsonFiles = [['data/index.json', index]];
  for(const [key, path] of Object.entries(files)) jsonFiles.push([path.replace(/\.[0-9a-f]{6,}\.json$/, '.*.json'), await getJSON('/' + path)]);
  for(const name of ['kwuse.json', 'info.json', 'reqs.json', 'atlas.json', 'craft.json', 'uniques.json', 'trade.json'])
    jsonFiles.push(['data/' + name, await getJSON('/data/' + name)]);
  for(const [name, j] of jsonFiles) walk(name, '', j, found);

  const known = (want && want.raw) || {};
  const fresh = [...found.keys()].filter(k => !(k in known));
  const bad = fresh.slice(0, 6).map(k => k + ' \u00d7' + found.get(k).n + ' e.g. ' + JSON.stringify(clip(found.get(k).eg, 40)));

  // text a player or a crawler really reads: the rendered pages, and the plain files for AI search
  const seen = new Map();
  for(const r of pages) if(r.status === 200) lintText(r.p, r.p.endsWith('.txt') ? r.text : visible(r.text), seen);
  for(const p of ['/llms.txt', '/llms-full.txt']){
    const r = await get(p);
    if(r.status === 200) lintText(p, r.text, seen);
  }
  const allow = new Set((want && want.rawText) || []);
  const leaks = [...seen].filter(([sig]) => !allow.has(sig));
  for(const [sig, where] of leaks.slice(0, 5)) bad.push(where + ' shows ' + JSON.stringify(sig));
  say('rawcode', !bad.length, bad.length ? (fresh.length + leaks.length) + ' found: ' + clip(bad.join(' | '), 210)
    : found.size + ' known internal keys, nothing new; pages clean' +
      (allow.size ? ' but for ' + allow.size + ' known line' + (allow.size === 1 ? '' : 's') + ' of leftover game text' : ''));
  return {found, text: [...seen.keys()]};
}

/* ---------- 5. a real phone ---------- */
function chromePaths(){
  const env = [process.env.CHROME, process.env.CHROME_PATH].filter(Boolean);
  if(process.platform === 'win32') return [...env,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'];
  if(process.platform === 'darwin') return [...env,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'];
  return [...env, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'];
}
async function findChrome(){
  const { access } = await import('node:fs/promises');
  for(const p of chromePaths()){ if(!p) continue; try { await access(p); return p; } catch {} }
  return null;
}
function cdp(ws){
  let n = 0;
  const waits = new Map(), on = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if(m.id && waits.has(m.id)){ const w = waits.get(m.id); waits.delete(m.id); m.error ? w.bad(new Error(m.error.message)) : w.ok(m.result); }
    else if(m.method) for(const f of on.get(m.method) || []) f(m.params);
  });
  return {
    ws,
    send: (method, params = {}) => new Promise((ok, bad) => { const id = ++n; waits.set(id, {ok, bad}); ws.send(JSON.stringify({id, method, params})); }),
    on: (method, f) => { if(!on.has(method)) on.set(method, []); on.get(method).push(f); },
  };
}
async function open(url){
  const ws = new WebSocket(url);
  await new Promise((ok, bad) => { ws.addEventListener('open', ok, {once: true}); ws.addEventListener('error', bad, {once: true}); });
  return cdp(ws);
}
const wait = ms => new Promise(r => setTimeout(r, ms));
async function evalJS(page, expression){
  const r = await page.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if(r.exceptionDetails) throw new Error(clip(r.exceptionDetails.exception?.description || r.exceptionDetails.text, 120));
  return r.result.value;
}
async function until(page, expression, ms = 12000){
  for(const end = Date.now() + ms; Date.now() < end; ){
    if(await evalJS(page, '(() => { try { return !!(' + expression + '); } catch(e){ return false; } })()')) return true;
    await wait(120);
  }
  return false;
}
// a tap is a real touch; the drag and the selection use the pointer, because a long-press selection is not
// reliably scriptable — both end in the same click the popup listens to
async function tap(page, x, y){
  const at = [{x, y, radiusX: 8, radiusY: 8, force: 1, id: 1}];
  await page.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: at});
  await page.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  await wait(120);
}
async function drag(page, x1, y1, x2, y2){
  await page.send('Input.dispatchMouseEvent', {type: 'mousePressed', x: x1, y: y1, button: 'left', clickCount: 1, buttons: 1});
  for(let i = 1; i <= 6; i++)
    await page.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x: x1 + (x2 - x1) * i / 6, y: y1 + (y2 - y1) * i / 6, button: 'left', buttons: 1});
  await page.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x: x2, y: y2, button: 'left', clickCount: 1, buttons: 0});
  await wait(150);
}
async function phonePage(browser, port, errs){
  const {targetId} = await browser.send('Target.createTarget', {url: 'about:blank'});
  const page = await open('ws://127.0.0.1:' + port + '/devtools/page/' + targetId);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  page.on('Runtime.consoleAPICalled', p => { if(p.type === 'error') errs.push(clip((p.args || []).map(a => a.description || a.value).join(' '), 100)); });
  page.on('Runtime.exceptionThrown', p => errs.push(clip(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text, 100)));
  await page.send('Emulation.setDeviceMetricsOverride', {width: 375, height: 812, deviceScaleFactor: 2, mobile: true});
  await page.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  return page;
}
async function go(page, url){
  const loaded = new Promise(ok => page.on('Page.loadEventFired', ok));
  await page.send('Page.navigate', {url});
  await Promise.race([loaded, wait(20000)]);
}
const OPEN = 'document.querySelector(".ov") && !document.querySelector(".ov").hidden';
const BOX = '(() => { const b = document.querySelector(".ov-box"); const r = b.getBoundingClientRect(); return {x: r.x, y: r.y, w: r.width, h: r.height}; })()';

async function checkPhone(bigKeyword, want){
  const wide = {};   // how far each page scrolls sideways at 375px, this run
  const chrome = await findChrome();
  if(!chrome){
    say('phone', true, 'skipped: no Chrome found. Point at one with CHROME=<full path to chrome.exe>, or pass --no-phone.');
    return wide;
  }
  const dir = await mkdtemp(join(tmpdir(), 'wi-guard-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run',
    '--no-default-browser-check', '--disable-gpu', '--disable-extensions', '--hide-scrollbars', 'about:blank'],
    {stdio: ['ignore', 'ignore', 'pipe']});
  const bad = [], errs = [];
  let port = null;
  try {
    port = await new Promise((ok, no) => {
      let buf = '';
      const t = setTimeout(() => no(new Error('Chrome did not open a debugging port in 20s')), 20000);
      proc.stderr.on('data', d => {
        buf += d;
        const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)\//);
        if(m){ clearTimeout(t); ok(+m[1]); }
      });
      proc.on('exit', c => { clearTimeout(t); no(new Error('Chrome closed (' + c + ')')); });
    });
    const browser = await open('ws://127.0.0.1:' + port + '/devtools/browser' +
      (await (await fetch('http://127.0.0.1:' + port + '/json/version')).json())['webSocketDebuggerUrl'].split('/devtools/browser')[1]);

    /* --- the home page: a card that has a "Found on" filter --- */
    const page = await phonePage(browser, port, errs);
    await go(page, SITE + '/#/?q=' + encodeURIComponent(bigKeyword));
    if(!await until(page, 'document.querySelectorAll("#cards .card").length')) bad.push('no cards on the home page');
    else {
      const at = await evalJS(page, '(() => { const c = [...document.querySelectorAll("#cards .card")].find(x => x.classList.contains("k-w")) ||' +
        ' document.querySelector("#cards .card"); const r = c.getBoundingClientRect(); c.scrollIntoView({block: "center"});' +
        ' const q = c.getBoundingClientRect(); return {x: q.x + q.width / 2, y: q.y + 20}; })()');
      await tap(page, at.x, at.y);
      if(!await until(page, OPEN, 8000)) bad.push('a tap on a card did not open it');
      else {
        const b = await evalJS(page, BOX);
        const inx = b.x + b.w / 2, iny = b.y + Math.min(80, b.h / 3);
        await tap(page, inx, iny);
        if(!await evalJS(page, OPEN)) bad.push('a tap inside the card closed it');
        await drag(page, b.x + 20, iny, b.x + b.w - 20, iny);
        if(!await evalJS(page, OPEN)) bad.push('a drag across the card text closed it');
        // a selection that runs off the card and is let go on the backdrop
        await evalJS(page, '(() => { const t = document.querySelector(".ov-box .card-tx, .ov-box .card-ls li, .ov-box .card-sub");' +
          ' if(!t) return; const s = getSelection(); const r = document.createRange(); r.selectNodeContents(t); s.removeAllRanges(); s.addRange(r); })()');
        await drag(page, b.x + 20, iny, Math.min(370, b.x + b.w + 30), Math.max(6, b.y - 30));
        if(!await evalJS(page, OPEN)) bad.push('a text selection let go outside the card closed it');
        // the "Found on" filter box
        const f = await evalJS(page, '(() => { const s = document.querySelector(".ov-box .uses"); if(!s) return null;' +
          ' let q = s.querySelector(".uses-q");' +
          ' if(!q){ const tabs = [...s.querySelectorAll(".uses-tab")].filter(t => !t.disabled);' +
          '   const big = tabs.sort((a, b) => parseInt(b.querySelector(".ct").textContent.replace(/\\D/g, "") || 0) - parseInt(a.querySelector(".ct").textContent.replace(/\\D/g, "") || 0))[0];' +
          '   if(big) big.click(); q = s.querySelector(".uses-q"); }' +
          ' if(!q) return null; q.scrollIntoView({block: "center"}); const r = q.getBoundingClientRect();' +
          ' return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()');
        if(!f) bad.push('no "Found on" filter on this card');
        else {
          await tap(page, f.x, f.y);
          await wait(300);
          if(!await evalJS(page, OPEN)) bad.push('focusing the "Found on" filter closed the card');
          else if(!await evalJS(page, 'document.activeElement && document.activeElement.classList.contains("uses-q")')) bad.push('the "Found on" filter did not take focus');
        }
      }
      wide['/'] = await evalJS(page, 'document.documentElement.scrollWidth - document.documentElement.clientWidth');
    }

    /* --- the drill-down page --- */
    const two = await phonePage(browser, port, errs);
    await go(two, SITE + '/explore');
    await until(two, 'document.querySelectorAll("#tbody tr").length', 20000);
    await wait(600);
    wide['/explore'] = await evalJS(two, 'document.documentElement.scrollWidth - document.documentElement.clientWidth');
  } catch(e){
    bad.push('Chrome: ' + clip(e.message, 110));
  } finally {
    proc.kill();
    await rm(dir, {recursive: true, force: true}).catch(() => {});
  }
  // /explore is 190px too wide on a phone today; that number is in the baseline, so only a new or a
  // worse sideways scroll fails
  const knownWide = (want && want.phoneWide) || {};
  const still = [];
  for(const [p, px] of Object.entries(wide)){
    if(px > (knownWide[p] || 0)) bad.push(p + ' scrolls ' + px + 'px sideways at 375px' + (knownWide[p] ? ' (was ' + knownWide[p] + ')' : ''));
    else if(px > 0) still.push(p + ' still ' + px + 'px wide');
  }
  const real = errs.filter(e => e && !/favicon|ERR_/.test(e));
  if(real.length) bad.push(real.length + ' console error' + (real.length === 1 ? '' : 's') + ': ' + clip(real[0], 80));
  say('phone', !bad.length, bad.length ? bad.join(' \u00b7 ')
    : '375\u00d7812 touch: the card stays open through a tap, a drag, a selection let go outside and the filter; no console errors' +
      (still.length ? ' \u00b7 known: ' + still.join(', ') : ' \u00b7 nothing scrolls sideways'));
  return wide;
}

/* ---------- run ---------- */
const started = Date.now();
let want = {};
try { want = JSON.parse(await readFile(BASELINE, 'utf8')); }
catch { console.log('No baseline yet: run once with --bless to write tools/dev/guard-baseline.json.'); }

let server = null;
if(base) SITE = base;
else { server = await startServer(); SITE = server.url; }
console.log('guard \u00b7 ' + SITE + (server ? ' (this worktree)' : ''));

let raw = {found: new Map(), text: []}, now = {}, counts = {}, wide = want.phoneWide || {};
try {
  const index = await getJSON('/data/index.json');
  const market = await getJSON('/data/market.json').catch(() => null);
  now = countKinds(index);
  checkCards(now, want.kinds || now);
  await checkLinks(index, market);
  const pages = await checkPages(want.pages);
  counts = pages.counts;
  const html = (await get('/explore')).text;
  const files = JSON.parse((html.match(/var F=(\{[^}]*\})/) || ['', '{}'])[1]);
  raw = await checkRaw(index, files, pages.got, want);
  if(!noPhone){
    const kws = index.items.filter(it => it.k === 'w' && it.use);
    kws.sort((a, b) => Object.values(b.use).reduce((x, y) => x + y, 0) - Object.values(a.use).reduce((x, y) => x + y, 0));
    wide = await checkPhone((kws[0] || {n: 'Critical'}).n, want);
  } else say('phone', true, 'skipped (--no-phone)');
} finally {
  if(server) await server.stop();
}

for(const l of lines) console.log(l);
console.log((lines.length - failed) + ' ok, ' + failed + ' failed \u00b7 ' + ((Date.now() - started) / 1000).toFixed(1) + 's');

if(bless){
  const keys = {};
  for(const [k, v] of [...raw.found].sort()) keys[k] = v.n;
  const added = Object.keys(keys).filter(k => !((want.raw || {})[k]));
  const addedText = raw.text.filter(s => !((want.rawText || []).includes(s)));
  await writeFile(BASELINE, JSON.stringify({
    note: 'Written by tools/dev/guard.mjs --bless. kinds and pages: how big the site was. raw: the internal keys that ' +
      'still hold raw game ids today (a later ticket clears them) - a key that is not on this list fails. rawText: the ' +
      'leftover game text a rendered page still shows today. phoneWide: how far a page scrolls sideways at 375px today. ' +
      'The last two should shrink to nothing; nothing may be added to them without a reason.',
    made: new Date().toISOString().slice(0, 10),
    kinds: now, pages: counts, phoneWide: wide, rawText: raw.text.sort(), raw: keys,
  }, null, 2) + '\n');
  console.log('blessed: ' + Object.keys(keys).length + ' internal keys' + (added.length ? ' (' + added.length + ' new)' : '') +
    ', ' + raw.text.length + ' lines of leftover game text' + (addedText.length ? ' (' + addedText.length + ' new)' : '') +
    ', sideways scroll ' + JSON.stringify(wide) + '. Run it again without --bless to confirm.');
}
process.exit(failed ? 1 : 0);
