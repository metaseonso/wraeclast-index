/* The index, written into the pages that carry it as plain HTML, out of the one table (assets/kinds.js INDEX):
   the top bar's index (navHTML) on index.html, explore.html and privacy.html, and the contents under the home
   page's search box (contentsHTML) on index.html. The crawler pages draw the bar themselves (worker/seo.js).
     node tools/dev/nav.mjs            write them
     node tools/dev/nav.mjs --check    say which page differs from the table, write nothing (tools/dev/frame.mjs)
     node tools/dev/nav.mjs --print ./ print the bar for a page at that base (tools/sync.py, explore.html's header)
   It also writes index.html's <link rel="modulepreload"> lines: every module assets/app.js and assets/topnav.js import statically, at any
   depth, so the first paint fetches its whole module graph in one wave and nothing else (the popup and every tab come
   later, by lazy()). A module added to or taken out of that graph changes the list; --check fails until it is written. */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAGES = [['index.html', '', ['nav', 'toc', 'pre']], ['explore.html', './', ['nav']], ['privacy.html', './', ['nav']]];
const BLOCKS = {
  nav: {re: /([ \t]*)<nav class="tabs topnav" aria-label="Index">[\s\S]*?<\/nav>/, html: (K, base) => K.navHTML(base), what: 'top bar'},
  pre: {re: /([ \t]*)<!-- the first paint's modules[^\n]*-->\n(?:[ \t]*<link rel="modulepreload"[^\n]*\n)*/, html: () => preloadHTML(), what: 'module preloads', lines: true},
  toc: {re: /([ \t]*)<div class="toc" id="toc">[\s\S]*?\n\1<\/div>|([ \t]*)<div class="toc" id="toc"><\/div>/, html: (K, base) => K.contentsHTML(null, base), what: 'contents'},
};

/* assets/app.js and every module it imports statically, at any depth (static imports only: import ... from './x.js',
   import './x.js', export ... from './x.js'), as paths from the repo root */
export async function bootGraph(){
  const seen = new Set(), todo = ['assets/app.js', 'assets/topnav.js'];   // the page's two module scripts
  while(todo.length){
    const f = todo.pop();
    if(seen.has(f)) continue;
    seen.add(f);
    const src = await readFile(join(ROOT, f), 'utf8');
    for(const m of src.matchAll(/(?:^|[;}\s])(?:import|export)\s*(?:[\w$*{},\s]+?\s*from\s*)?["'](\.{1,2}\/[^"']+)["']/g))
      todo.push(new URL(m[1], 'https://x/' + f).pathname.slice(1));
  }
  seen.delete('assets/topnav.js');   // a <script> of its own, found by the browser as soon as app.js
  return [...seen].sort((a, b) => (a === 'assets/app.js' ? -1 : b === 'assets/app.js' ? 1 : a.localeCompare(b)));
}
async function preloadHTML(){
  return "<!-- the first paint's modules: assets/app.js and all it imports, fetched in one wave (tools/dev/nav.mjs writes these) -->\n" +
    (await bootGraph()).map(f => '<link rel="modulepreload" href="' + f + '">').join('\n') + '\n';
}
async function table(){ return import(pathToFileURL(join(ROOT, 'assets', 'kinds.js')).href); }
/* the page with its blocks as the table writes them; missing names the blocks the page has no place for */
export async function written(file, base, blocks){
  const K = await table();
  let s = await readFile(join(ROOT, file), 'utf8');
  const was = s, missing = [];
  for(const b of blocks){
    const B = BLOCKS[b], m = s.match(B.re);
    if(!m){ missing.push(B.what); continue; }
    const pad = m[1] ?? m[2] ?? '';
    let html = await B.html(K, base);
    if(!B.lines) html = html.split('\n').map(l => pad + l).join('\n');
    s = s.slice(0, m.index) + html + s.slice(m.index + m[0].length);
  }
  return {s: was, out: s, missing};
}
/* The home page's other two copies of the route list, both needed before the first paint and so written as plain
   HTML: the <section class="view" id="view-<route>"> a tab draws into, and the inline list that gives <body> its
   data-route before assets/app.js runs (index.html). Each must be exactly the open routes of the table. */
export async function routeDrift(){
  const K = await table(), bad = [];
  const want = Object.keys(K.ROUTES).filter(r => r !== 'home').sort();
  let s;
  try { s = await readFile(join(ROOT, 'index.html'), 'utf8'); } catch { return bad; }
  const views = [...s.matchAll(/<section class="view" id="view-(\w+)" data-view="\1"/g)].map(m => m[1]).filter(r => r !== 'home').sort();
  const m = s.match(/document\.body\.dataset\.route = [^\n]*?\[([^\]]*)\]\.indexOf\(r\)/);
  const inline = m ? [...m[1].matchAll(/'(\w+)'/g)].map(x => x[1]).sort() : null;
  if(views.join() !== want.join()) bad.push('index.html’s view sections are not the table’s routes: ' + views.join(' ') + ' vs ' + want.join(' '));
  if(!inline) bad.push('index.html has no pre-paint route list (document.body.dataset.route)');
  else if(inline.join() !== want.join()) bad.push('index.html’s pre-paint route list is not the table’s routes: ' + inline.join(' ') + ' vs ' + want.join(' '));
  return bad;
}
/* the pages whose blocks are not the table's */
export async function drift(){
  const bad = await routeDrift();
  for(const [file, base, blocks] of PAGES){
    const r = await written(file, base, blocks).catch(() => null);
    if(!r) continue;
    for(const w of r.missing) bad.push(file + ' has no place for the index ' + w);
    if(r.out !== r.s) bad.push(file + '’s index is not the index table (node tools/dev/nav.mjs)');
  }
  return bad;
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const a = process.argv.slice(2);
  if(a[0] === '--print'){ const K = await table(); console.log(K.navHTML(a[1] || '')); }
  else if(a[0] === '--check'){ const bad = await drift(); console.log(bad.length ? bad.join('\n') : 'ok   nav: every page\'s index is the table'); process.exit(bad.length ? 1 : 0); }
  else {
    for(const [file, base, blocks] of PAGES){
      const r = await written(file, base, blocks);
      if(r.out !== r.s){ await writeFile(join(ROOT, file), r.out); console.log('wrote ' + file); }
      for(const w of r.missing) console.log(file + ': no place for the ' + w);
    }
  }
}
