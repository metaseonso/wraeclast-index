import { $, onType, esc } from '../core/html.js';
import { KIND, CHIPS } from '../kinds.js';
import { route } from '../core/router.js';
import { find, whole, D, wake } from '../core/data.js';
import { card } from '../frame/card.js';
import { calm, flow } from '../frame/related.js';
import { seenKeys } from '../core/seen.js';
import { TRACKER } from '../frame/seam.js';

/* ---------- home view ----------
   The search bar and nothing under it until something is typed. */
const PAGE = 30;   // cards added each time the list reaches the bottom of the screen
const ENDLESS = 150;   // cards the list adds by itself; past this, one more page is a press of Show more
/* H.res is the answer for the words typed and the kind chip: how many of each kind, and H.list the keys of the
   chip's matches as far as the list has gone. A chip, or the next page of the list, is a slice of what the search
   already answered and never a second search (find). H.asked and H.draw count the questions and the draws, so an
   answer that comes after a newer one is dropped. */
const H = {q:'', kind:'all', shown:PAGE, res:null, list:[], asked:0, draw:0};
/* the chip of the kind on show pressed, the links to its list marked where the index is drawn, and the box
   saying what it searches */
function pickKind(){
  for(const c of $('#kinds').children) c.setAttribute('aria-pressed', String(c.dataset.k === H.kind));
  const K = H.kind !== 'all' && KIND[H.kind];
  $('#q').placeholder = K ? 'Search ' + K.many.toLowerCase() + '…' : Q_WORDS;
  for(const a of document.querySelectorAll('a[data-list]')){
    if(a.dataset.list === H.kind && route() === 'home') a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  const home = document.querySelector('.tabs a[data-route="home"]');
  if(home && route() === 'home' && K) home.removeAttribute('aria-current');
}
let Q_WORDS = '';
function homeInit(){
  const q = $('#q'), kinds = $('#kinds');
  Q_WORDS = q.placeholder;
  // index.html draws these chips itself, so the bar never changes shape on the first paint; the table is the
  // one in assets/kinds.js, and a kind that is in the table but not in the page puts them all back in order
  if([...kinds.children].map(c => c.dataset.k).join(' ') !== CHIPS.map(([k]) => k).join(' '))
    kinds.innerHTML = CHIPS.map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === 'all') + '">' + l + '<span class="ct"></span></button>').join('');
  kinds.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    H.kind = b.dataset.k; H.shown = PAGE;
    pickKind();
    homeRender(); syncHash(); q.focus();
  });
  onType(q, () => { H.q = q.value; H.shown = PAGE; homeRender(); syncHash(); });
  q.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ q.value = ''; H.q = ''; homeRender(); syncHash(); }
    if(e.key === 'Enter'){ const first = $('#cards .card .card-link'); if(first) first.click(); }
  });
  // endless list: when the bottom comes into view, the next 30 cards fly in, up to ENDLESS; then Show more
  const more = $('#more');
  more.addEventListener('click', homeMore);
  H.io = new IntersectionObserver(es => {
    if(es.some(e => e.isIntersecting) && !more.hidden && H.shown < ENDLESS && route() === 'home') homeMore();
  }, {rootMargin: '600px 0px'});
  H.io.observe(more);
}
/* The next page of the list, added under the cards already there: nothing above it is searched, drawn or
   moved again. Its cards come whole first (whole()), so a page is drawn once. */
function homeMore(){
  const from = H.shown;
  H.shown += PAGE;
  const draw = H.draw, q = H.q, kind = H.kind;
  if(!H.res || from >= H.res.total) return paintMore();
  paintMore();
  // the keys past what the list has, then the cards whole
  // the same trail the list was answered with, so the rest comes in the same order
  (H.list.length >= H.shown ? Promise.resolve() : find(q, {kind, take: H.shown, from: H.list.length, seen: H.res.seen}).then(r => {
    if(draw === H.draw) H.list = H.list.concat(r.keys);
  })).then(() => whole(H.list.slice(from, H.shown))).catch(() => []).then(() => {
    const add = H.list.slice(from, H.shown);
    if(draw !== H.draw) return;   // drawn again since: the list this page belonged to is gone
    const grid = $('#cards');
    const nodes = add.map(k => D.byKey.get(k)).filter(Boolean).map(it => { const n = card(it); n.dataset.key = it.k + ':' + it.id; return n; });
    grid.append(...nodes);
    if(!calm()) nodes.slice(0, 16).forEach((n, k) =>
      n.animate([{opacity:0, transform:'translateY(18px) scale(.97)'}, {opacity:1, transform:'none'}],
        {duration:420, delay:k * 24, easing:'cubic-bezier(.2,.8,.2,1)', fill:'backwards'}));
    // the observer only speaks when the bottom crosses into view: a page that left it in view is asked again
    if(H.io){ H.io.unobserve($('#more')); H.io.observe($('#more')); }
  });
}
// under the list: the words that say more is on its way while it still comes by itself, a button after
function paintMore(){
  const more = $('#more'), auto = H.shown < ENDLESS;
  more.hidden = !H.res || H.res.total <= H.shown;
  if(more.dataset.auto === String(auto)) return;
  more.dataset.auto = String(auto);
  more.innerHTML = auto ? '<span class="note">Loading more…</span>' : '<button type="button" class="btn">Show more</button>';
}
function syncHash(){
  const ps = [];
  if(H.q) ps.push('q=' + encodeURIComponent(H.q));
  if(H.kind !== 'all') ps.push('k=' + H.kind);
  const h = ps.length ? '#/?' + ps.join('&') : '#/';
  if(location.hash !== h) history.replaceState(null, '', h);
}
/* The answer is counts and card keys (find); the cards on show come whole before they are drawn, and a moment is
   all the grid waits for them: past HEAD_WAIT it draws their heads and each card fills in where it stands. */
const HEAD_WAIT = 150;
function homeRender(){
  const hero = $('#hero'), status = $('#status'), more = $('#more');
  // words typed, or a kind picked with none: a kind's own list (assets/kinds.js INDEX, the list pages)
  const listing = !H.q.trim() && H.kind !== 'all' && !!KIND[H.kind];
  const has = H.q.trim().length > 0 || listing;
  hero.classList.toggle('docked', has);
  let list, label;
  if(has && !D.search && !D.full && !D.failed){   // the search is on its way, a moment
    status.textContent = 'Loading…';
    for(const b of $('#kinds').children) b.querySelector('.ct').textContent = '';
    $('#quote').hidden = true; more.hidden = true;
    flow($('#cards'), [], null);
    if(!H.waiting){ H.waiting = true; wake().then(() => { H.waiting = false; if(route() === 'home') homeRender(); }, () => {}); }
    return;
  }
  if(has && !(H.res && H.res.q === H.q && H.res.kind === H.kind)){
    // the grid keeps what it shows until the answer is in; an answer to words or a chip since replaced is dropped
    const q = H.q, kind = H.kind, ask = ++H.asked, seen = seenKeys();
    find(q, {kind, n: H.shown, take: H.shown, seen}).then(r => {
      if(ask !== H.asked || q !== H.q || kind !== H.kind) return;
      H.res = {q, kind, seen, total: r.total, counts: r.counts};
      if(!r.total && q.trim() && TRACKER) TRACKER.note('search:none');   // a count for the owner; the words stay here
      H.list = r.keys;
      homeRender();
    }, () => {});
    return;
  }
  if(has){
    const counts = H.res.counts, total = H.res.total;
    // a list: each chip is that kind's own list, so it counts the whole kind (the manifest's count)
    const kinds = listing && D.man && D.man.kinds;
    for(const b of $('#kinds').children) b.querySelector('.ct').textContent = kinds
      ? (b.dataset.k === 'all' ? '' : kinds[b.dataset.k] ? (+kinds[b.dataset.k].n).toLocaleString() : '')
      : counts[b.dataset.k] || 0;
    // a kind the words found nothing in is not offered; All, and the kind in use, always are
    for(const b of $('#kinds').children){
      const none = !kinds && b.dataset.k !== 'all' && !counts[b.dataset.k];
      b.classList.toggle('zero', none);
      b.hidden = none && b.dataset.k !== H.kind;
    }
    list = H.list;
    label = !total ? '' : listing ? '<b>' + total.toLocaleString() + '</b> ' + esc(KIND[H.kind].many) :
      '<b>' + total.toLocaleString() + '</b> match' + (total === 1 ? '' : 'es');
  } else {
    for(const b of $('#kinds').children){ b.querySelector('.ct').textContent = ''; b.hidden = false; b.classList.remove('zero'); }
    list = []; label = ''; H.res = null; H.list = []; H.asked++;
  }
  const draw = ++H.draw, shown = list.slice(0, H.shown);
  const paint = () => {
    if(draw !== H.draw) return;
    status.innerHTML = label;
    $('#cards').classList.remove('wait');   // the first answer is in: the grid takes its own height
    $('#quote').hidden = has;
    flow($('#cards'), shown.map(key => ({key, it: D.byKey.get(key)})).filter(x => x.it), x => card(x.it));
    paintMore();
    if(has && !list.length){
      $('#cards').innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing matches</h3></div>';
    }
  };
  const heads = shown.some(key => { const it = D.byKey.get(key); return !it || it._head; });
  if(!heads) return paint();
  let drawn = false;
  const late = setTimeout(() => { drawn = true; paint(); }, HEAD_WAIT);
  whole(shown).catch(() => []).then(() => {
    if(draw !== H.draw) return;
    clearTimeout(late);
    if(!drawn) return paint();
    fill($('#cards'));
  });
}
/* A card drawn as its head, drawn again whole where it stands once its card is in: no glide, no fade. */
function fill(host){
  for(const el of [...host.querySelectorAll(':scope > .card[data-key]')]){
    const it = D.byKey.get(el.dataset.key);
    if(!it || it._head || !el.classList.contains('headonly')) continue;
    const n = card(it);
    n.dataset.key = el.dataset.key;
    el.replaceWith(n);
  }
}

/* The router's turn (core/router.js start): the address names a search and a kind chip, and the page follows it. */
function homeShow(p){
  const q = p.get('q') || '', k = p.get('k') || 'all';
  if(q || k !== 'all') wake();   // a search or a list in the address (the search waits for its worker itself)
  if(q !== H.q){ H.q = q; $('#q').value = q; }
  if(k !== H.kind){ H.kind = k in KIND || k === 'all' ? k : 'all'; H.shown = PAGE; }
  pickKind();
  homeRender();
  if(!matchMedia('(pointer:coarse)').matches) $('#q').focus({preventScroll:true});
}
// nothing typed: a shut page's one line may stand in the status row
const homeQuiet = () => !H.q;

export { PAGE, H, pickKind, homeInit, homeRender, homeShow, homeQuiet };
