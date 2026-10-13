import { lazy } from '../core/lazy.js';
import { $ } from '../core/html.js';
import { SHUT, ROUTES, KIND } from '../kinds.js';
import { H, PAGE, pickKind, homeRender } from '../pages/home.js';
import { wake, need, ready, hist } from '../core/data.js';

/* ---------- router ---------- */
function route(){ const m = location.hash.match(/^#\/(\w+)/); return m ? m[1] : 'home'; }
const BARE = ['data', 'patches'];   // the pages that read a file or two of their own and never the index
export function params(){ const i = location.hash.indexOf('?'); return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : ''); }
/* A tab is drawn when it is opened and taken down when it is left: a page that kept every tab it had ever
   shown grew from a thousand elements to six thousand in a few clicks, and a weak machine pays for each one on
   every layout. What a tab was showing — its filters, its picks, the plan on the bench — is kept by its own
   module (each keeps an S), so coming back draws the same page again, scrolled where it was.
   A tab takes part by exporting unmount(), which lets go of whatever the page itself does not hold: a listener
   on the window, an observer, a timer. A tab without one stays drawn and hidden, the way every tab used to. */
const MODS = {};    // the module behind each tab, fetched once
const LIVE = {};    // the tabs drawn right now: a promise of what their mount handed back
const LEFT = {};    // where each tab was scrolled when it was left, and the address it was left at
let ON = null;      // the tab on show
// the tabs that read files of their own and never the index: the Data page (the manifest) and the Market
// (the daily market files, assets/market.js)
const OWN_FILES = new Set(['data', 'market']);
const modOf = r => MODS[r] || (MODS[r] = lazy('./' + ({trade: 'tradepage'}[r] || r) + '.js', 'This tab'));
function leave(r, at){
  const view = $('#view-' + r);
  if(!view) return;
  LEFT[r] = {y: scrollY, at};
  if(r in SHUT){ view.replaceChildren(); return; }
  const live = LIVE[r];
  if(!live) return;
  Promise.all([modOf(r), live]).then(([m]) => {
    // back on it before its mount had finished, or drawn again since: it stays
    if(!m.unmount || ON === r || LIVE[r] !== live) return;
    delete LIVE[r];
    m.unmount();
    view.replaceChildren();
  }, () => { if(LIVE[r] === live) delete LIVE[r]; });
}
async function show(e){
  // a page the table has shut (assets/kinds.js SHUT): its old links land on Search, with its one line
  if(route() in SHUT){
    const shut = route();
    history.replaceState(null, '', '#/');
    await show(e);
    const st = $('#status');
    if(st && !H.q) st.textContent = ROUTES[shut] + ': ' + SHUT[shut];
    return;
  }
  const r = route() in ROUTES ? route() : 'home';
  // the address the tab was left at is the one before this change: the tab may have written its own since
  const was = e && e.oldURL ? new URL(e.oldURL).hash : '';
  if(ON && ON !== r && ON !== 'home') leave(ON, was);   // home is the page itself: its search bar is never taken down
  const back = ON !== r && LEFT[r] && LEFT[r].at === location.hash ? LEFT[r].y : null;
  ON = r;
  document.body.dataset.route = r;
  document.querySelectorAll('.view').forEach(v => v.hidden = v.dataset.view !== r);
  document.querySelectorAll('.tabs a[data-route]').forEach(a => { if(a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if(r !== 'home') document.querySelectorAll('a[data-list]').forEach(a => a.removeAttribute('aria-current'));
  if(r === 'home'){
    const q = params().get('q') || '', k = params().get('k') || 'all';
    if(q || k !== 'all') wake();   // a search or a list in the address (the search waits for its worker itself)
    if(q !== H.q){ H.q = q; $('#q').value = q; }
    if(k !== H.kind){ H.kind = k in KIND || k === 'all' ? k : 'all'; H.shown = PAGE; }
    pickKind();
    homeRender();
    if(!matchMedia('(pointer:coarse)').matches) $('#q').focus({preventScroll:true});
  } else {
    if(!OWN_FILES.has(r) && !BARE.includes(r)) need();   // the Data, Patches and Market pages read files of their own
    // every other tab draws cards out of the index, with their charts; the map is a finished picture
    if(r !== 'map' && !OWN_FILES.has(r) && !BARE.includes(r)) await Promise.all([ready, hist()]);
    if(ON !== r) return;           // left again while the index came in: nothing to draw
    const view = $('#view-' + r);
    if(!LIVE[r]) LIVE[r] = modOf(r).then(m => m.mount(view));
    const live = LIVE[r];
    const m = await live;
    if(ON !== r || LIVE[r] !== live) return;
    if(m && m.update) await m.update();
    // the same address it was left at: the page it was, where it was
    if(back !== null && ON === r) scrollTo(0, back);
  }
}

export { route, show };
