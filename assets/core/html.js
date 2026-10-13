/* Wraeclast Index — app shell, live cards, and the search-first home page.
   Data files (see "data" below):
     data/index-core.json, data/index-rest.json   the search index built from the game data (tools/sync.py, tools/appdata.py)
     data/market.json  real prices only: currency from the in-game Currency Exchange, everything else from live
                       trade site listings (worker/prices.js); trends from the site's own daily prices
   Build usage links to poe.ninja's own builds page: their builds API is not open to other sites. */

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- a box that answers as you type ----------
   Every search box on the site runs through here. A hand at the keys types five letters in a burst, and only
   the last of them is worth answering: each box waits TYPE_WAIT after the last key and then answers once.
   Three things never wait. Enter acts on the text as it stands, so the answer it opens is the one for every
   letter typed. Escape drops whatever was waiting, and the box's own Escape does the rest at once. And a box
   emptied, or changed by the page itself rather than a key (a script, the popup's own Escape), answers at once,
   because there is no burst to wait out. `run` reads the box itself; the function handed back runs it now. */
const TYPE_WAIT = 120;
export function onType(box, run, wait = TYPE_WAIT){
  let t = 0;
  const now = () => { clearTimeout(t); t = 0; run(); };
  box.addEventListener('input', e => {
    clearTimeout(t);
    if(!e.isTrusted || !box.value.trim()) return void now();
    t = setTimeout(now, wait);
  });
  // capture: on the box itself it runs before the box's own keys, so Enter already sees the answer
  box.addEventListener('keydown', e => {
    if(!t) return;
    if(e.key === 'Enter') now();
    else if(e.key === 'Escape'){ clearTimeout(t); t = 0; }
  }, true);
  return () => { if(t) now(); };
}

/* Work that can wait: run it when the page is idle, and at the latest after 4 seconds. */
export function idle(f){ (window.requestIdleCallback || (g => setTimeout(g, 1200)))(f, {timeout: 4000}); }
// the app (index.html) or a page that borrows its search and popup (the drill-down page)
export const IS_APP = !!document.getElementById('view-home');

export { reduceMotion };
