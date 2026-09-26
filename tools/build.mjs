/* The site as Cloudflare serves it: every file the website holds, copied into dist/ and made smaller.

     node tools/build.mjs              dist/ from the repo (wrangler.jsonc "build" runs this before every deploy)
     node tools/build.mjs --out <dir>  somewhere else
     node tools/build.mjs --plain      copied only, nothing made smaller

   1. Copy. Every file .assetsignore lets through, read the way wrangler reads it from the repo root (plus _headers,
      which Cloudflare reads from the folder it serves), so dist/ serves exactly the paths the repo root served.
   2. Smaller. The .js and .css files, and the inline <script>/<style> of the pages, through esbuild: one file at a
      time, no bundling, every import path and export name kept, whitespace and comments gone. sw.js is left as it
      is (worker/index.js writes the deploy's id into its '__WI_BUILD__'). A file esbuild throws on ships as it is.
   3. sw-files.json: every path the site serves with a short hash of its bytes, and the files the home page needs
      before its first paint (read off index.html and what its modules import). sw.js keeps only those at install,
      takes every unchanged file over from the last deploy's copy, and checks what it keeps against the hashes.

   It never stops a deploy for the small part: no esbuild, a file it cannot read, a manifest that will not write,
   and the site ships unminified or without the manifest (sw.js then does what it always did). Only a copy that
   cannot be made exits non-zero, and then Cloudflare keeps the deploy that is live.

   The repo root stays the website for everything else: the GitHub Pages backup, tools/dev/guard.mjs and the voice
   and frame checks all read the source files, never dist/. */
import { readFile, writeFile, mkdir, rm, readdir, lstat, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const at = args.indexOf('--out');
const OUT = at >= 0 && args[at + 1] ? resolve(args[at + 1]) : join(ROOT, 'dist');
const PLAIN = args.includes('--plain');
const warn = m => console.warn('build: warning: ' + m);

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
const KEEP = new Set(['sw.js']);   // worker/index.js stamps this one by its exact text
async function smaller(files){
  let esbuild;
  try { esbuild = await import('esbuild'); }
  catch(e){ warn('esbuild is not installed (' + (e.code || e.message) + '): the files ship as they are'); return; }
  const tally = {};
  const count = (kind, a, b) => { const t = tally[kind] || (tally[kind] = {files: 0, before: 0, after: 0, gzBefore: 0, gzAfter: 0}); t.files++; t.before += a.length; t.after += b.length; t.gzBefore += gzipSync(a).length; t.gzAfter += gzipSync(b).length; };
  for(const f of files){
    const ext = (f.match(/\.(\w+)$/) || [])[1];
    if(!['js', 'mjs', 'css', 'html'].includes(ext) || KEEP.has(f)) continue;
    const src = await readFile(join(OUT, f), 'utf8');
    let out = src;
    try {
      if(ext === 'html') out = await inline(esbuild, src, f);
      else {
        const r = await esbuild.transform(src, ext === 'css' ? CSS : JS);
        out = r.code;
        if(!out.trim() && src.trim()) throw new Error('came out empty');
      }
    } catch(e){ warn(f + ' ships as it is: ' + String(e && e.message || e).split('\n')[0]); out = src; }
    if(out.length >= src.length) out = src;
    if(out !== src) await writeFile(join(OUT, f), out);
    count(f.startsWith('assets/') && ext !== 'html' ? 'assets/*.' + ext : ext === 'html' ? 'pages' : ext, Buffer.from(src), Buffer.from(out));
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
      } catch(e){ warn(f + ': one ' + (script ? 'script' : 'style') + ' block ships as it is: ' + String(e && e.message || e).split('\n')[0]); }
    }
    parts.push((script ? m[1] : m[5]) + done + (script ? m[4] : m[8]));
  }
  parts.push(html.slice(last));
  return parts.join('');
}

/* ---------- 3. sw-files.json ---------- */
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
async function manifest(files){
  const have = {};
  for(const f of files) { const h = hash(await readFile(join(OUT, f))); for(const p of paths(f)) have[p] = h; }
  const shell = await homeShell(have);
  const body = JSON.stringify({v: 1, shell, files: have});
  await writeFile(join(OUT, 'sw-files.json'), body);
  console.log('build: sw-files.json  ' + Object.keys(have).length + ' paths, ' + shell.length + ' in the home shell, ' + (body.length / 1024).toFixed(1) + ' KB');
}

/* ---------- run ---------- */
const t0 = Date.now();
let files;
try {
  files = await served();
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
try { await manifest(files); }
catch(e){
  warn('no sw-files.json (' + (e && e.message || e) + '): the service worker keeps what it always kept');
  await rm(join(OUT, 'sw-files.json'), {force: true}).catch(() => {});
}
console.log('build: done in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s');
