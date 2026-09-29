/* The index, written into the pages that carry it as plain HTML, out of the one table (assets/kinds.js INDEX):
   the top bar's index (navHTML) on index.html, explore.html and privacy.html, and the contents under the home
   page's search box (contentsHTML) on index.html. The crawler pages draw the bar themselves (worker/seo.js).
     node tools/dev/nav.mjs            write them
     node tools/dev/nav.mjs --check    say which page differs from the table, write nothing (tools/dev/frame.mjs)
     node tools/dev/nav.mjs --print ./ print the bar for a page at that base (tools/sync.py, explore.html's header) */
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAGES = [['index.html', '', ['nav', 'toc']], ['explore.html', './', ['nav']], ['privacy.html', './', ['nav']]];
const BLOCKS = {
  nav: {re: /([ \t]*)<nav class="tabs topnav" aria-label="Index">[\s\S]*?<\/nav>/, html: (K, base) => K.navHTML(base), what: 'top bar'},
  toc: {re: /([ \t]*)<div class="toc" id="toc">[\s\S]*?\n\1<\/div>|([ \t]*)<div class="toc" id="toc"><\/div>/, html: (K, base) => K.contentsHTML(null, base), what: 'contents'},
};

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
    const html = B.html(K, base).split('\n').map(l => pad + l).join('\n');
    s = s.slice(0, m.index) + html + s.slice(m.index + m[0].length);
  }
  return {s: was, out: s, missing};
}
/* the pages whose blocks are not the table's */
export async function drift(){
  const bad = [];
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
