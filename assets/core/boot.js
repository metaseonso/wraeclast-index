/* Gone in stage 10 (docs/migration.md): its code is assets/app.js now. A browser still holding stage 9's modules in
   its HTTP cache (/assets/* may be served stale for minutes while it revalidates, _headers) asks for this file
   from them: app.js, core/seen.js and ui/topsearch.js imported it. Those stale copies are fetched again past the
   cache and the page reloads once onto the deploy that is live. The names they imported are given so the stale
   graph links rather than throwing before the reload. */
const KEY = 'wi.boot-gone';
const STALE = ['assets/app.js', 'assets/core/seen.js', 'assets/ui/topsearch.js', './'];
let once = false;
try { once = !!sessionStorage.getItem(KEY); sessionStorage.setItem(KEY, '1'); } catch {}
if(!once){
  Promise.all(STALE.map(u => fetch(new URL(u, document.baseURI), {cache: 'reload'}).catch(() => null)))
    .finally(() => location.reload());
}
export const idle = f => setTimeout(f, 1);
export const IS_APP = !!document.getElementById('view-home');
export function later(){}
export function registerSW(){ return false; }
