/* The site as Cloudflare serves it: every file the website holds, copied into dist/ and made smaller.

     node tools/build.mjs              dist/ from the repo (wrangler.jsonc "build" runs this before every deploy)
     node tools/build.mjs --out <dir>  somewhere else
     node tools/build.mjs --plain      copied only, nothing made smaller
     WI_PRICES_FROM=<origin|off>       where step 3 reads the live prices (https://wraeclastindex.fyi), or not at all

   1. Copy. Every file .assetsignore lets through, read the way wrangler reads it from the repo root (plus _headers,
      which Cloudflare reads from the folder it serves), so dist/ serves exactly the paths the repo root served,
      less the files below data/ that nothing on the site asks for (a drill-down data copy the page no longer names).
   2. Smaller. The .js and .css files, and the inline <script>/<style> of the pages, through esbuild: one file at a
      time, no bundling, every import path and export name kept, whitespace and comments gone. sw.js keeps its
      '__WI_BUILD__' exactly (step 6 writes over it) or ships as it is. A file esbuild throws on ships as it is.
   3. The last good prices: data/market-last.json, today's prices as the live site answers them at build time
      (market.json?part=live: every price with the time it was checked), and data/facts/<v>.json, the catalogue's
      words that go with them. A page whose live prices fail or take over 4 seconds reads these instead and says
      when they are from and that live prices are paused (assets/app.js), so a site out of worker requests, or with
      its database down, still shows every price with its real age. The live answer is taken only when it reads as a
      price file, is no older than the copy the site already ships, and has not lost half its prices; otherwise
      that shipped copy is kept, loudly. Nothing at all to read: no file, and the page says prices are not loaded.
   4. sw-files.json: every path the site serves with a short hash of its bytes, and the files the home page needs
      before its first paint (read off index.html and what its modules import). sw.js keeps only those at install,
      takes every unchanged file over from the last deploy's copy, and checks what it keeps against the hashes.
      The crawler's files (5) are not in it: the service worker never keeps them.
   4b. The previous generation: the files of the index a page reads by name (data/cards, data/search,
      data/explore: named by their content) that the live deploy names and this build no longer has, fetched from
      the live site (WI_PREV_FROM, default https://wraeclastindex.fyi; off: none) and checked against the hash the
      live sw-files.json gives them. A returning visitor's first load after a data deploy is the service worker's
      copy of the deploy before (sw.js), with that deploy's manifest: its files still answer, so its cards draw
      whole. One generation only: sw-files.json lists them under "prev", never under "files" (the service worker
      never keeps them and they do not change the stamp), and the next build carries them again only for a folder
      whose own files did not change. A file that will not fetch or does not match its hash is left out, loudly;
      a page further behind reloads once into the new deploy (assets/app.js moved).
   5. The crawler's files, made by worker/seo.js crawl() out of dist/'s own data and the prices of this moment
      (the live https://wraeclastindex.fyi/data/market.json; the copy in data/ when that does not answer, said
      loudly): every item page (item/<slug>.html) and its Markdown copy (md/item/<slug>.md), the lists
      (gems.html, ...), 404.html, the sitemaps, llms.txt, llms-full.txt and llms/<list>.txt; an old address as a
      line of _redirects; and crawl.json, a short hash of each page's own words, so the scheduled rebuild can tell
      search engines which pages changed (.github/workflows/rebuild.yml). Written after 2, never minified: a page
      is the bytes worker/seo.js made.
   6. sw.js stamped: its '__WI_BUILD__' becomes a hash of every path sw-files.json lists and the bytes behind it, so
      a deploy that changes any of those files is a new service worker with its own copy, and /sw.js is a plain
      static file: no page load ever calls the worker for it (the worker stamped it on every load until 28 Sep). A
      sw.js the stamp cannot be written into ships unstamped, and an unstamped sw.js switches itself off (sw.js OFF).

   It never stops a deploy for the small part: no esbuild, a file it cannot read, a manifest that will not write,
   and the site ships unminified or without the manifest (sw.js then does what it always did). A copy that cannot
   be made, crawler files that cannot be made, more than 2,000 redirects or more files than the free plan's line
   (tools/dev/budget.mjs LIMITS.count.fail) exit non-zero, and then Cloudflare keeps the deploy that is live.

   The repo root stays the website for everything else: the GitHub Pages backup, tools/dev/guard.mjs and the voice
   and frame checks all read the source files, never dist/. */
import { readFile, writeFile, mkdir, rm, readdir, lstat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { LIMITS } from './dev/budget.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const at = args.indexOf('--out');
const OUT = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : join(ROOT, 'dist');
const PLAIN = args.includes('--plain');
const warn = m => console.warn('build: warning: ' + m);
// esbuild's own first error, with its line; anything else, its first line
const why = e => { const x = e && e.errors && e.errors[0]; return x ? x.text + (x.location ? ' (line ' + x.location.line + ')' : '') : String(e && e.message || e).split('\n')[0]; };

/* ---------- which files the site serves: .assetsignore, as wrangler reads it (gitignore rules) ---------- */
// wrangler always leaves out its own three files; .assetsignore adds the rest (workers-shared createAssetsIgnoreFunction)
const ALWAYS = ['/.assetsignore', '/_redirects', '/_headers'];
function rule(line){
  let p = line.replace(/(^|[^\\])\s+$/, '$1');
  if(!p || p.startsWith('#')) return null;
  const not = p.startsWith('!');
  if(not) p = p.slice(1);
  const dir = p.endsWith('/');
  if(dir) p = p.slice(0, -1);
  const anchored = p.includes('/');
  if(p.startsWith('/')) p = p.slice(1);
  let re = '';
  for(let i = 0; i < p.length; i++){
    const c = p[i];
    if(c === '*' && p[i + 1] === '*'){
      if(p[i + 2] === '/'){ re += '(?:.*/)?'; i += 2; }
      else { re += '.*'; i += 1; }
    }
    else if(c === '*') re += '[^/]*';
    else if(c === '?') re += '[^/]';
    else if(c === '\\' && i + 1 < p.length) re += '\\' + p[++i];
    else if(c === '[') { const j = p.indexOf(']', i + 1); if(j > i){ re += p.slice(i, j + 1); i = j; } else re += '\\['; }
    else re += c.replace(/[.+^${}()|\]\\]/g, '\\$&');
  }
  return {not, dir, re: new RegExp((anchored ? '^' : '^(?:.*/)?') + re + '$')};
}
async function ignorer(){
  let text = '';
  try { text = await readFile(join(ROOT, '.assetsignore'), 'utf8'); } catch {}
  const rules = [...ALWAYS, ...text.split(/\r?\n/)].map(rule).filter(Boolean);
  // one path (a/b/c), a folder or not: the last rule that matches it decides
  const one = (path, isDir) => {
    let out = false;
    for(const r of rules) if((!r.dir || isDir) && r.re.test(path)) out = !r.not;
    return out;
  };
  return {dir: path => one(path, true), file: path => one(path, false)};
}
// every file under the root the site serves, as 'a/b.ext'; a folder that is left out is not walked
async function served(){
  const ig = await ignorer(), files = [];
  const out = OUT.startsWith(ROOT) ? OUT.slice(ROOT.length + 1).split(/[\\/]/).join('/') : null;
  async function walk(rel){
    for(const d of await readdir(rel ? join(ROOT, rel) : ROOT, {withFileTypes: true})){
      const path = rel ? rel + '/' + d.name : d.name;
      if(path === out) continue;
      if(d.isSymbolicLink()) continue;   // wrangler skips links
      if(d.isDirectory()){ if(!ig.dir(path)) await walk(path); }
      else if(d.isFile() && !ig.file(path)) files.push(path);
    }
  }
  await walk('');
  return files.sort();
}

/* ---------- data files the site never asks for ----------
   Every top-level data/*.json ships, read by a page or not: the index is open for anyone building on it. Below
   data/, a file ships only when a page, a module, the worker or sw.js asks for it:
     - a file named by its content (name.<hash>.json: the drill-down page's data, tools/sync.py) by its exact path,
       so a copy the page stopped naming stays in the repo at most and never ships
     - a file data/manifest.json names (the index cut a piece at a time, tools/shards.py): the page, the search
       worker and the crawler pages read the manifest and ask for what it names
     - any other file by its name, or by its folder when the code builds the name ('data/craft/' + id + '.json')
   tools/dev/budget.mjs fails on a data file nothing reads at all, site or tool. */
const PUBLIC = [
  [/^data\/[^/]+\.json$/, 'the index, open for builders: every top-level data file ships, read by a page or not'],
];
const HASHED = /\.[0-9a-f]{8,}\.json$/;
async function siteText(files){
  const want = f => /^[^/]+\.html$/.test(f) || /^assets\/.+\.m?js$/.test(f) || f === 'sw.js';
  const parts = await Promise.all(files.filter(want).map(f => readFile(join(ROOT, f), 'utf8')));
  for(const d of await readdir(join(ROOT, 'worker'), {withFileTypes: true}).catch(() => []))
    if(d.isFile() && d.name.endsWith('.js')) parts.push(await readFile(join(ROOT, 'worker', d.name), 'utf8'));
  return parts.join('\n');
}
// every file a manifest names, wherever it names one ({"file": path})
function manifestFiles(man){
  const out = new Set();
  (function walk(v){
    if(!v || typeof v !== 'object') return;
    if(typeof v.file === 'string') out.add(v.file);
    for(const x of Object.values(v)) walk(x);
  })(man);
  return out;
}
async function asked(files){
  const text = await siteText(files), left = [];
  let cut = new Set();
  try {
    const man = JSON.parse(await readFile(join(ROOT, 'data', 'manifest.json'), 'utf8'));
    cut = manifestFiles(man);
    // a language's own list (data/lang/<code>/files.<h>.json) names the rest of its files: assets/lang.js reads it
    for(const e of Object.values(man.lang || {}))
      for(const f of manifestFiles(JSON.parse(await readFile(join(ROOT, e.file), 'utf8')))) cut.add(f);
  } catch {}
  const keep = files.filter(f => {
    if(!f.startsWith('data/') || PUBLIC.some(([re]) => re.test(f)) || cut.has(f)) return true;
    const name = f.slice(f.lastIndexOf('/') + 1), dir = f.slice(0, f.lastIndexOf('/') + 1);
    const ok = HASHED.test(f) ? text.includes(f) : text.includes(name) || text.includes("'" + dir + "'") || text.includes('"' + dir + '"');
    if(!ok) left.push(f);
    return ok;
  });
  for(const f of left) console.log('build: left out ' + f + ' (nothing on the site asks for it)');
  return keep;
}

/* ---------- 1. copy ---------- */
async function copyAll(files){
  await rm(OUT, {recursive: true, force: true});
  const made = new Set();
  const place = async p => { const d = dirname(join(OUT, p)); if(!made.has(d)){ await mkdir(d, {recursive: true}); made.add(d); } };
  for(const f of files){ await place(f); await copyFile(join(ROOT, f), join(OUT, f)); }
  // Cloudflare reads these two from the folder it serves (they are not served themselves)
  for(const f of ['_headers', '_redirects']){
    try { await lstat(join(ROOT, f)); } catch { continue; }
    await place(f); await copyFile(join(ROOT, f), join(OUT, f));
  }
  // the copy is whole: every file there, as large as the one it came from
  for(const f of files){
    const [a, b] = await Promise.all([lstat(join(ROOT, f)), lstat(join(OUT, f))]);
    if(a.size !== b.size) throw new Error(f + ' copied as ' + b.size + ' bytes, not ' + a.size);
  }
}

/* ---------- 2. smaller ---------- */
const JS = {loader: 'js', minify: true, target: 'es2020', legalComments: 'none'};
const CSS = {loader: 'css', minify: true, target: ['chrome90', 'edge90', 'firefox88', 'safari14'], legalComments: 'none'};
// step 6 stamps sw.js by its exact text '__WI_BUILD__' (single quotes): esbuild writes strings in double
// quotes, so the one literal is put back, and a sw.js where that is not exactly one literal ships as it is
const STAMP = "'__WI_BUILD__'";
function stampKept(src, out){
  if(src.split('__WI_BUILD__').length !== 2 || src.split(STAMP).length !== 2) throw new Error('sw.js does not hold one ' + STAMP);
  const back = out.split('"__WI_BUILD__"').join(STAMP);
  if(back.split('__WI_BUILD__').length !== 2 || back.split(STAMP).length !== 2) throw new Error('the stamp did not survive');
  return back;
}
async function smaller(files){
  let esbuild;
  try { esbuild = await import('esbuild'); }
  catch(e){ warn('esbuild is not installed (' + (e.code || e.message) + '): the files ship as they are'); return; }
  const tally = {};
  const count = (kind, a, b) => { const t = tally[kind] || (tally[kind] = {files: 0, before: 0, after: 0, gzBefore: 0, gzAfter: 0}); t.files++; t.before += a.length; t.after += b.length; t.gzBefore += gzipSync(a).length; t.gzAfter += gzipSync(b).length; };
  for(const f of files){
    const ext = (f.match(/\.(\w+)$/) || [])[1];
    if(!['js', 'mjs', 'css', 'html'].includes(ext)) continue;
    const src = await readFile(join(OUT, f), 'utf8');
    let out = src;
    try {
      if(ext === 'html') out = await inline(esbuild, src, f);
      else {
        const r = await esbuild.transform(src, ext === 'css' ? CSS : JS);
        out = f === 'sw.js' ? stampKept(src, r.code) : r.code;
        if(!out.trim() && src.trim()) throw new Error('came out empty');
      }
    } catch(e){ warn(f + ' ships as it is: ' + why(e)); out = src; }
    if(out.length >= src.length) out = src;
    if(out !== src) await writeFile(join(OUT, f), out);
    count(f.startsWith('assets/') && ext !== 'html' ? 'assets/*.' + ext : ext === 'html' ? 'pages' : f, Buffer.from(src), Buffer.from(out));
  }
  const kb = n => (n / 1024).toFixed(1) + ' KB';
  for(const [k, t] of Object.entries(tally))
    console.log('build: ' + k.padEnd(12) + String(t.files).padStart(3) + ' files  ' + kb(t.before).padStart(9) + ' -> ' + kb(t.after).padStart(9) +
      '   gzip ' + kb(t.gzBefore).padStart(8) + ' -> ' + kb(t.gzAfter).padStart(8));
}
// a page's own <script> and <style> blocks; a block that could end early in the page after esbuild is left alone
async function inline(esbuild, html, f){
  const parts = [];
  const re = /(<script(\s[^>]*)?>)([\s\S]*?)(<\/script\s*>)|(<style(\s[^>]*)?>)([\s\S]*?)(<\/style\s*>)/gi;
  let last = 0, m;
  while((m = re.exec(html))){
    parts.push(html.slice(last, m.index));
    last = re.lastIndex;
    const script = !!m[1], attrs = (script ? m[2] : m[6]) || '', body = script ? m[3] : m[7];
    const type = (attrs.match(/\stype\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    const plain = script ? !/\ssrc\s*=/i.test(attrs) && (!type || /^(module|text\/javascript)$/i.test(type)) : true;
    let done = body;
    if(plain && body.trim()){
      try {
        const r = await esbuild.transform(body, script ? JS : CSS);
        const code = r.code.replace(/\n$/, '');
        if(code.trim() && !(script ? /<\/script|<!--|<script/i : /<\/style/i).test(code)) done = code;
      } catch(e){ warn(f + ': one ' + (script ? 'script' : 'style') + ' block ships as it is: ' + why(e)); }
    }
    parts.push((script ? m[1] : m[5]) + done + (script ? m[4] : m[8]));
  }
  parts.push(html.slice(last));
  return parts.join('');
}

/* ---------- 3. the last good prices ---------- */
const PRICES = (process.env.WI_PRICES_FROM || 'https://wraeclastindex.fyi').replace(/\/$/, '');
const UA = 'wraeclast-index-build/1.0 (contact: https://wraeclastindex.fyi/)';
async function getText(url){
  const r = await fetch(url, {headers: {'User-Agent': UA}, signal: AbortSignal.timeout(20000)});
  if(!r.ok) throw new Error(url + ' answered ' + r.status);
  return r.text();
}
// a live price part, or null: the shape assets/app.js reads, with its age and enough prices to be the market
const count = m => Object.keys(m.items).length;
function priceFile(text){
  let m = null;
  try { m = JSON.parse(text); } catch { return null; }
  return m && m.part === 'live' && typeof m.league === 'string' && Date.parse(m.updated) > 0 && m.items && typeof m.items === 'object' &&
    Object.keys(m.items).length >= 50 ? m : null;
}
async function lastPrices(){
  if(PRICES === 'off'){ warn('WI_PRICES_FROM=off: no data/market-last.json in this build'); return []; }
  let live = null, kept = null, why = '';
  try { live = priceFile(await getText(PRICES + '/data/market.json?part=live')); if(!live) why = 'the answer was not a price file'; }
  catch(e){ why = String(e && e.message || e); }
  try { kept = priceFile(await getText(PRICES + '/data/market-last.json')); } catch {}
  let pick = live, from = 'live';
  if(live && kept && Date.parse(live.updated) < Date.parse(kept.updated)) { why = 'live prices are older than the shipped copy'; pick = null; }
  if(live && kept && count(live) < count(kept) / 2) { why = 'live prices hold ' + count(live) + ' of the ' + count(kept) + ' the shipped copy holds'; pick = null; }
  if(!pick && kept){ pick = kept; from = 'kept'; }
  if(!pick){
    warn('NO data/market-last.json: live prices did not pass (' + why + ') and the site ships no copy. A page whose live prices fail says prices are not loaded');
    return [];
  }
  if(from === 'kept') warn('live prices did not pass (' + why + '): data/market-last.json keeps the shipped copy, prices from ' + pick.updated);
  const out = [];
  await mkdir(join(OUT, 'data', 'facts'), {recursive: true});
  await writeFile(join(OUT, 'data', 'market-last.json'), JSON.stringify({...pick, last: {built: new Date().toISOString(), from}}));
  out.push('data/market-last.json');
  // the catalogue's words for those prices, by the name the price file gives them (the shipped file, else the worker)
  const v = /^[0-9a-f]{12}$/.test(pick.facts || '') ? pick.facts : null;
  if(v){
    let facts = null;
    for(const u of [PRICES + '/data/facts/' + v + '.json', PRICES + '/data/market.json?part=facts&v=' + v]){
      try { const t = await getText(u), f = JSON.parse(t); if(f && f.v === v && f.items){ facts = t; break; } } catch {}
    }
    if(facts){ await writeFile(join(OUT, 'data', 'facts', v + '.json'), facts); out.push('data/facts/' + v + '.json'); }
    else warn('no data/facts/' + v + '.json: the price file names catalogue words the live site no longer has');
  }
  console.log('build: market-last.json  ' + count(pick) + ' prices from ' + pick.updated + ' (' + (from === 'live' ? 'the live site' : 'the shipped copy') + ')' +
    (out.length > 1 ? ', with its facts' : ''));
  return out;
}

/* ---------- 4. sw-files.json ---------- */
const hash = buf => createHash('sha256').update(buf).digest('hex').slice(0, 16);
// the paths a file answers on: index.html is "/", explore.html is also "/explore" (Cloudflare's html handling)
function paths(f){
  const out = ['/' + f];
  if(f === 'index.html') out.push('/');
  else if(f.endsWith('/index.html')) out.push('/' + f.slice(0, -10));
  else if(f.endsWith('.html')) out.push('/' + f.slice(0, -5));
  return out;
}
// what the home page asks for before its first paint: its stylesheets, fonts, modules (and what they import),
// icons and pictures, as index.html names them
async function homeShell(have){
  const html = await readFile(join(OUT, 'index.html'), 'utf8');
  const want = new Set();
  for(const m of html.matchAll(/<link\b[^>]*>/gi)){
    const tag = m[0], rel = (tag.match(/\brel\s*=\s*["']?([^"'>]+)/i) || [])[1] || '', href = (tag.match(/\bhref\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    if(href && /\b(stylesheet|modulepreload|icon)\b/i.test(rel) || href && /\bpreload\b/i.test(rel) && /\bas\s*=\s*["']?(font|style|script|image)/i.test(tag)) want.add(href);
  }
  for(const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) want.add(m[1]);
  for(const m of html.matchAll(/<img\b[^>]*>/gi)) for(const s of m[0].matchAll(/\b(?:data-)?src\s*=\s*["']?([^"'\s>]+)/gi)) want.add(s[1]);
  const shell = new Set(), todo = [...want].map(u => new URL(u, 'https://x/').pathname);
  while(todo.length){
    const p = todo.pop();
    if(shell.has(p) || !have[p]) continue;
    shell.add(p);
    if(!p.endsWith('.js')) continue;
    // static imports only: import ... from './x.js', import './x.js', export ... from './x.js'
    const src = await readFile(join(OUT, p.slice(1)), 'utf8');
    for(const m of src.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{},\s]+?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g))
      todo.push(new URL(m[1], 'https://x' + p).pathname);
  }
  return [...shell].sort().map(p => p.slice(1));
}
// every path the deploy serves, with the short hash of its bytes
async function hashes(files){
  const have = {};
  for(const f of files) { const h = hash(await readFile(join(OUT, f))); for(const p of paths(f)) have[p] = h; }
  return have;
}
async function manifest(files, have, prev = {}){
  const shell = await homeShell(have);
  const body = JSON.stringify({v: 1, shell, files: have, prev});
  await writeFile(join(OUT, 'sw-files.json'), body);
  console.log('build: sw-files.json  ' + Object.keys(have).length + ' paths, ' + shell.length + ' in the home shell, ' + (body.length / 1024).toFixed(1) + ' KB');
}

/* ---------- 4b. the previous generation ---------- */
const PREV_FROM = (process.env.WI_PREV_FROM || 'https://wraeclastindex.fyi').replace(/\/$/, '');
// the files a page reads by name out of a manifest or its own page: what an older page still asks for
const CARRY = /^\/data\/(cards|search|explore)\/.+\.[0-9a-f]{8,}\.json$/;
const folder = p => p.split('/')[2];
async function getBytes(url){
  const r = await fetch(url, {headers: {'User-Agent': UA}, signal: AbortSignal.timeout(30000)});
  if(!r.ok) throw new Error(url + ' answered ' + r.status);
  if(/text\/html/i.test(r.headers.get('Content-Type') || '')) throw new Error(url + ' answered a page');
  return Buffer.from(await r.arrayBuffer());
}
// {path: hash} of every file written, each checked against the live deploy's hash for it
async function previous(have){
  if(PREV_FROM === 'off' || args.includes('--offline')){ console.log('build: previous generation: not carried (' + (PREV_FROM === 'off' ? 'WI_PREV_FROM=off' : '--offline') + ')'); return {}; }
  let live = null;
  try { live = JSON.parse(await getText(PREV_FROM + '/sw-files.json')); } catch(e){ live = null; warn('previous generation: ' + PREV_FROM + '/sw-files.json did not read (' + (e && e.message || e) + ')'); }
  if(!live || live.v !== 1 || !live.files || typeof live.files !== 'object'){
    warn('previous generation NOT carried: no live sw-files.json. A visitor whose first load after this deploy is the copy of the last one may find its cards without lines and reload once');
    return {};
  }
  // per folder: the live deploy's own files this build drops; a folder that dropped none carries on the live
  // deploy's own previous generation (price-only rebuilds keep it), so never more than one generation back
  const want = {}, dropped = new Set();
  for(const [p, h] of Object.entries(live.files)) if(CARRY.test(p) && !have[p]){ want[p] = h; dropped.add(folder(p)); }
  for(const [p, h] of Object.entries(live.prev || {})) if(CARRY.test(p) && !have[p] && !dropped.has(folder(p))) want[p] = h;
  const out = {}, bad = [], jobs = Object.entries(want);
  let bytes = 0;
  const run = async () => {
    for(let j; (j = jobs.shift()); ){
      const [p, h] = j;
      try {
        const buf = await getBytes(PREV_FROM + p);
        if(hash(buf) !== h) throw new Error('its bytes do not match the live hash');
        await mkdir(dirname(join(OUT, p.slice(1))), {recursive: true});
        await writeFile(join(OUT, p.slice(1)), buf);
        out[p] = h; bytes += buf.length;
      } catch(e){ bad.push(p + ' (' + (e && e.message || e) + ')'); }
    }
  };
  await Promise.all([run(), run(), run(), run(), run(), run()]);
  if(bad.length) warn('previous generation: ' + bad.length + ' file(s) left out, so a page of the last deploy that asks for one reloads once: ' + bad.slice(0, 3).join('; '));
  console.log('build: previous generation  ' + Object.keys(out).length + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB, from ' + PREV_FROM +
    (Object.keys(out).length ? ' (' + [...new Set(Object.keys(out).map(folder))].join(', ') + ')' : ''));
  return out;
}

/* ---------- 5. the crawler's files ---------- */
const LIVE_MARKET = 'https://wraeclastindex.fyi/data/market.json';
const MAX_REDIRECTS = 2000;   // Cloudflare's line for static rules in _redirects (/workers/static-assets/redirects/)
const TYPE = {json: 'application/json', txt: 'text/plain', md: 'text/markdown', html: 'text/html', xml: 'application/xml'};
// the price file of this moment: --market <file>, else the live one; null when neither reads (seo.js then takes dist/'s copy)
async function marketText(){
  const at = args.indexOf('--market');
  if(at >= 0 && args[at + 1]) return {text: await readFile(resolve(args[at + 1]), 'utf8'), from: args[at + 1]};
  if(args.includes('--offline')) return null;
  try {
    const r = await fetch(LIVE_MARKET, {signal: AbortSignal.timeout(30000), headers: {'User-Agent': 'wraeclast-index build'}});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const text = await r.text(), j = JSON.parse(text);
    if(!j || !j.items || !Object.keys(j.items).length || !j.updated) throw new Error('it holds no prices');
    return {text, from: LIVE_MARKET};
  } catch(e){
    warn('the live price file did not answer (' + (e && e.message || e) + '): the crawler pages carry the prices in data/market.json, each with its own checked time');
    return null;
  }
}
// the file a path is served from: '/item/x' -> item/x.html, '/gems' -> gems.html, '/404' -> 404.html, the rest as named
const fileOf = p => /\.(xml|txt|md|json)$/.test(p) ? p.slice(1) : p.slice(1) + '.html';
async function crawlFiles(){
  const t0 = Date.now();
  const seo = await import('../worker/seo.js');
  const got = await marketText();
  const env = {ASSETS: {fetch: async req => {
    const p = decodeURIComponent(new URL(req.url).pathname).slice(1);
    if(p.includes('..')) return new Response('', {status: 400});
    try { return new Response(await readFile(join(OUT, p)), {headers: {'Content-Type': TYPE[(p.match(/\.(\w+)$/) || [])[1]] || 'application/octet-stream'}}); }
    catch { return new Response('', {status: 404}); }
  }}};
  const load = got ? async () => new Response(got.text, {headers: {'Content-Type': 'application/json'}}) : null;
  const made = new Set(), redirects = [], pages = {};
  let n = 0, bytes = 0;
  for await (const f of seo.crawl(env, 'https://wraeclastindex.fyi', load)){
    if(f.from){ redirects.push(f.from + ' ' + f.to + ' 301'); continue; }
    const file = join(OUT, fileOf(f.path)), d = dirname(file);
    if(!made.has(d)){ await mkdir(d, {recursive: true}); made.add(d); }
    await writeFile(file, f.body);
    n++; bytes += Buffer.byteLength(f.body);
    // what a page says of itself: an item's own words (its Markdown copy), a list or a text file whole
    const own = f.path.startsWith('/md/item/') ? '/item/' + f.path.slice(9, -3) : f.path.startsWith('/item/') ? null : f.path;
    if(own) pages[own] = hash(f.body).slice(0, 12);
  }
  const m = seo.marketOf();
  if(!m || !m.items) warn('no prices at all: the crawler pages are built without any');
  if(redirects.length > MAX_REDIRECTS) throw new Error(redirects.length + ' redirects: Cloudflare takes ' + MAX_REDIRECTS + ' static ones');
  // _redirects: the repo's own lines (if it has any), then the crawler's old addresses
  let head = '';
  try { head = (await readFile(join(OUT, '_redirects'), 'utf8')).replace(/\s*$/, '\n'); } catch {}
  await writeFile(join(OUT, '_redirects'), head + '# old addresses of the crawler pages (worker/seo.js crawl, tools/build.mjs)\n' + redirects.join('\n') + '\n');
  await writeFile(join(OUT, 'crawl.json'), JSON.stringify({v: 1, built: new Date().toISOString(),
    market: m ? {updated: m.updated || null, league: m.league || null, from: got ? got.from : 'data/market.json'} : null, pages}));
  console.log('build: crawler     ' + n + ' files, ' + (bytes / 1048576).toFixed(1) + ' MB, ' + redirects.length + ' redirects, prices ' +
    (m && m.updated ? 'of ' + m.updated + ' (' + (got ? got.from : 'data/market.json') + ')' : 'none') + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
}
// every file dist/ holds, _headers and _redirects too (they count against the same line)
async function countOut(dir = OUT){
  let n = 0, bytes = 0;
  for(const d of await readdir(dir, {withFileTypes: true})){
    if(d.isDirectory()){ const x = await countOut(join(dir, d.name)); n += x.n; bytes += x.bytes; }
    else if(d.isFile()){ n++; bytes += (await lstat(join(dir, d.name))).size; }
  }
  return {n, bytes};
}

/* ---------- 6. sw.js stamped ----------
   BUILD is "v-" and the first 16 hex of the SHA-256 of every served path and its bytes' hash, in path order: the
   same files give the same stamp, any changed, added or removed file a new one. */
async function stampSW(have){
  const stamp = 'v-' + hash(Object.keys(have).sort().map(p => p + ' ' + have[p]).join('\n'));
  const file = join(OUT, 'sw.js'), src = await readFile(file, 'utf8');
  if(src.split(STAMP).length !== 2) throw new Error('dist/sw.js does not hold one ' + STAMP);
  await writeFile(file, src.replace(STAMP, JSON.stringify(stamp)));
  console.log('build: sw.js stamped ' + stamp);
}

/* ---------- run ---------- */
const t0 = Date.now();
let files;
try {
  files = await served();
  try { files = await asked(files); }
  catch(e){ warn('could not tell which data files the site asks for (' + (e && e.message || e) + '): every one ships'); }
  await copyAll(files);
  console.log('build: copied ' + files.length + ' files into ' + OUT);
} catch(e){
  console.error('build: the copy failed, so nothing ships (the live deploy stays): ' + (e && e.stack || e));
  process.exit(1);
}
if(!PLAIN){
  try { await smaller(files); }
  catch(e){
    // something went wrong past one file: start again from a plain copy rather than ship half a job
    warn('minify stopped (' + (e && e.message || e) + '): the files ship as they are');
    try { await copyAll(files); } catch(e2){ console.error('build: the copy failed: ' + (e2 && e2.stack || e2)); process.exit(1); }
  }
}
try { files = [...files, ...await lastPrices()].sort(); }
catch(e){ warn('NO data/market-last.json (' + (e && e.message || e) + '): a page whose live prices fail says prices are not loaded'); }
// the crawler's files: without them every item page is a not-found, so a build that cannot make them does not ship
try { await crawlFiles(); }
catch(e){
  console.error('build: the crawler pages could not be made, so nothing ships (the live deploy stays): ' + (e && e.stack || e));
  process.exit(1);
}
let have = null;
try {
  have = await hashes(files);
  let prev = {};
  try { prev = await previous(have); }
  catch(e){ warn('previous generation NOT carried (' + (e && e.message || e) + ')'); }
  await manifest(files, have, prev);
}
catch(e){
  warn('no sw-files.json (' + (e && e.message || e) + '): the service worker keeps what it always kept');
  await rm(join(OUT, 'sw-files.json'), {force: true}).catch(() => {});
}
const total = await countOut();
console.log('build: dist/ holds ' + total.n + ' files, ' + (total.bytes / 1048576).toFixed(1) + ' MB (the free plan: ' + LIMITS.count.cap + ' files; this build stops at ' + LIMITS.count.fail + ')');
if(total.n > LIMITS.count.fail){
  console.error('build: ' + total.n + ' files is over the line of ' + LIMITS.count.fail + ', so nothing ships (the live deploy stays). tools/dev/budget.mjs has the table.');
  process.exit(1);
}
try { await stampSW(have || await hashes(files)); }
catch(e){ warn('sw.js ships unstamped (' + (e && e.message || e) + '): the service worker switches itself off until the next deploy'); }
console.log('build: done in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
