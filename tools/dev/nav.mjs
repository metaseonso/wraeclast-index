/* The top bar's index, written into the pages that carry it as plain HTML, out of the one table
   (assets/kinds.js INDEX, navHTML). The crawler pages draw it themselves (worker/seo.js).
     node tools/dev/nav.mjs            write it into index.html, explore.html and privacy.html
     node tools/dev/nav.mjs --check    say which page differs from the table, write nothing (tools/dev/frame.mjs)
     node tools/dev/nav.mjs --print ./ print it for a page at that base (tools/sync.py, for explore.html's header) */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAGES = [['index.html', ''], ['explore.html', './'], ['privacy.html', './']];
const NAV = /([ \t]*)<nav class="tabs topnav" aria-label="Index">[\s\S]*?<\/nav>/;

async function table(){ return import(pathToFileURL(join(ROOT, 'assets', 'kinds.js')).href); }
/* the page with its bar as the table writes it, or null where the page has no bar to hold it */
export async function written(file, base){
  const { navHTML } = await table();
  const s = await readFile(join(ROOT, file), 'utf8');
  const m = s.match(NAV);
  if(!m) return {s, out: null};
  const nav = navHTML(base).split('\n').map(l => m[1] + l).join('\n');
  return {s, out: s.slice(0, m.index) + nav + s.slice(m.index + m[0].length)};
}
/* the pages whose bar is not the table's */
export async function drift(){
  const bad = [];
  for(const [file, base] of PAGES){
    const {s, out} = await written(file, base).catch(() => ({s: null, out: null}));
    if(s === null) continue;
    if(out === null) bad.push(file + ' has no top bar index to hold the table');
    else if(out !== s) bad.push(file + '’s top bar is not the index table (node tools/dev/nav.mjs)');
  }
  return bad;
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const a = process.argv.slice(2);
  if(a[0] === '--print'){ const { navHTML } = await table(); console.log(navHTML(a[1] || '')); }
  else if(a[0] === '--check'){ const bad = await drift(); console.log(bad.length ? bad.join('\n') : 'ok   nav: every page\'s top bar is the index table'); process.exit(bad.length ? 1 : 0); }
  else {
    for(const [file, base] of PAGES){
      const {s, out} = await written(file, base);
      if(out !== null && out !== s){ await writeFile(join(ROOT, file), out); console.log('wrote ' + file); }
    }
  }
}
