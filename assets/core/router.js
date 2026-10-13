import { lazy } from '../core/lazy.js';
import { $ } from '../core/html.js';
import { SHUT, ROUTES } from '../kinds.js';
import { wake, need, ready, hist, manifest, prices, searching } from '../core/data.js';

/* ---------- router ---------- */
function route(){ const m = location.hash.match(/^#\/(\w+)/); return m ? m[1] : 'home'; }
export function params(){ const i = location.hash.indexOf('?'); return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : ''); }
/* What a page may wait for before it is drawn: the names a page lists in its `needs` (assets/pages/*.js). A page
   that reads files of its own lists none and is drawn at once. */
const PHASE = {
  index:    () => { need(); return ready; },   // the whole index
  hist:     () => hist(),                       // the price history, for the charts
  prices:   () => prices(),                     // today's prices
  manifest: () => manifest(),                   // the manifest
  search:   () => { wake(); return searching; } // the search worker answering
};
const waitFor = needs => Promise.all((needs || []).map(n => PHASE[n] ? PHASE[n]() : Promise.reject(new Error('no phase ' + n))));
/* The home page is the page itself: drawn by the first paint and never taken down. app.js hands it in (start). */
let HOME = null;
export function start(home){
  HOME = home;
  addEventListener('hashchange', show);
  show();
}
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
const modOf = r => MODS[r] || (MODS[r] = lazy('./pages/' + r + '.js', 'This tab'));   // the file is named after the route
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
    if(st && HOME.homeQuiet()) st.textContent = ROUTES[shut] + ': ' + SHUT[shut];
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
  if(r === 'home') HOME.homeShow(params());
  else {
    // the page's module first, then what it says it needs; a page that reads files of its own waits for nothing
    const mod = await modOf(r);
    if(ON !== r) return;
    await waitFor(mod.needs);
    if(ON !== r) return;           // left again while the index came in: nothing to draw
    const view = $('#view-' + r);
    if(!LIVE[r]) LIVE[r] = Promise.resolve().then(() => mod.mount(view, mod.state(params())));
    const live = LIVE[r];
    const m = await live;
    if(ON !== r || LIVE[r] !== live) return;
    if(m && m.update) await m.update();
    // the same address it was left at: the page it was, where it was
    if(back !== null && ON === r) scrollTo(0, back);
  }
}

export { route, show };
