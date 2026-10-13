import { openDetail, setTracker } from '../frame/seam.js';
import { hrefOf } from '../frame/href.js';
import { priceOf, find, D, searching, wake } from '../core/data.js';
import { iconHTML, moneyHTML } from '../core/format.js';
import { esc, onType, $ } from '../core/html.js';
import { initKeys } from '../keys.js';
import { IS_APP } from '../core/html.js';
import { route } from '../core/router.js';
import { lazy } from '../core/lazy.js';

/* An item copied in game (Ctrl+C) and pasted into either search box opens its card (assets/ui/paste.js). Only the
   game's own item text: a first line naming the class or the rarity, a rarity line and a line of dashes. Any
   other paste, and all typing, goes into the box as ever. The reader is fetched on the first such paste. */
const ITEM_PASTE = t => /^\s*(?:Item Class|Rarity): \S/.test(t) && /^Rarity: \S/m.test(t) && /^-{8,}\s*$/m.test(t);
const BOX = '#view-home #q, .tsearch input';   // the home page's box and the top search
addEventListener('paste', e => {
  const box = e.target && e.target.closest && e.target.closest(BOX);
  const t = box && e.clipboardData && e.clipboardData.getData('text/plain');
  if(!t || !ITEM_PASTE(t)) return;
  e.preventDefault();
  wake();
  lazy('./ui/paste.js', 'The item').then(m => m.pasted(t, box), () => {});
}, true);

/* ---------- top search ----------
   On every page but home. Results drop down under the bar; each opens the popup. */
let TOPQ = null;
export function mountTopSearch(host){
  if(!host.querySelector('.tsearch input')) host.innerHTML = '<div class="tsearch"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
    '<path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>' +
    '<input type="search" placeholder="Search the index" autocomplete="off" spellcheck="false" aria-label="Search the index" ' +
    'role="combobox" aria-expanded="false" aria-autocomplete="list"><kbd aria-hidden="true">/</kbd>' +
    '<div class="tsearch-drop" role="listbox" hidden></div></div>';
  const q = host.querySelector('input'), drop = host.querySelector('.tsearch-drop');
  TOPQ = q;
  let rows = [], sel = 0, total = 0;
  const close = () => { drop.hidden = true; q.setAttribute('aria-expanded', 'false'); };
  const pick = i => { const it = rows[i]; if(!it) return; close(); openDetail(it, {}, hrefOf(it)); };
  const paint = () => {
    drop.innerHTML = rows.length ? rows.map((it, i) => {
      const px = priceOf(it);
      return '<button type="button" class="tsearch-row k-' + it.k + '" role="option" data-i="' + i + '" aria-selected="' + (i === sel) + '">' +
        '<span class="card-ic">' + iconHTML(it) + '</span><span class="t"><b>' + esc(it.n) + '</b><span>' + esc(it.s || '') + '</span></span>' +
        (px && px.v !== undefined ? '<span class="p">' + moneyHTML(px.v) + '</span>' : '') + '</button>';
    }).join('') + (total > rows.length ? '<div class="tsearch-none">Top ' + rows.length + ' of ' + total.toLocaleString() + '.</div>' : '')
    : '<div class="tsearch-none">Nothing matches.</div>';
    drop.hidden = false; q.setAttribute('aria-expanded', 'true');
  };
  let asked = 0;
  onType(q, async () => {
    const words = q.value, mine = ++asked;
    if(!words.trim()){ close(); return; }
    let keys;
    try { keys = await find(words, {n: 10, take: 10}); } catch { return; }
    if(mine !== asked || q.value !== words) return;   // more was typed since: that answer is on its way
    if(document.activeElement !== q) return;   // left the box before its answer came: nothing drops open behind it
    total = keys.total; rows = keys.keys.map(k => D.byKey.get(k)).filter(Boolean); sel = 0; paint();
  });
  q.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown' && rows.length){ e.preventDefault(); sel = (sel + 1) % rows.length; paint(); }
    else if(e.key === 'ArrowUp' && rows.length){ e.preventDefault(); sel = (sel - 1 + rows.length) % rows.length; paint(); }
    else if(e.key === 'Enter'){ e.preventDefault(); pick(sel); }
    else if(e.key === 'Escape'){ if(!drop.hidden) close(); else { q.value = ''; q.blur(); } }
  });
  drop.addEventListener('mousedown', e => e.preventDefault());   // keep focus in the box while clicking a row
  drop.addEventListener('click', e => { const b = e.target.closest('.tsearch-row'); if(b) pick(+b.dataset.i); });
  q.addEventListener('focus', () => { if(q.value.trim() && rows.length) paint(); });
  q.addEventListener('blur', () => setTimeout(close, 120));
}
// every keyboard shortcut lives in keys.js; "Search everything" jumps into the big box on home, the top box everywhere else
initKeys(() => (IS_APP && route() === 'home' && document.getElementById('q')) || TOPQ);
/* The page's extras. A first visit that opens on a search (#/?q=...) takes the answer first: on a phone on 4G these
   few files share the line with the search rows, so they wait until the search has answered (tools/dev/speed.mjs
   phone, #117). Any other page loads them at once. */
function extras(){
  lazy('./ui/suggest.js').then(m => { m.mountSuggest(); m.mountFlag(); }).catch(() => {});   // the Suggest button, and the owner's own flag
  lazy('./ui/notes.js').then(m => m.mountNotes()).catch(() => {});       // Patch notes, on every page
  lazy('./ui/pins.js').then(m => m.mountPins()).catch(() => {});         // the Pins button, and the list it opens
  lazy('./ui/runs.js').then(m => m.mountRuns()).catch(() => {});         // the run counter, and the key that counts one
  lazy('./ui/support.js').then(m => m.mountSupport()).catch(() => {});   // Support link, once data/support.json is filled in
  lazy('./ui/track.js').then(m => { setTracker(m); m.mountTrack(); }).catch(() => {});       // page views and clicks for the owner's dashboard
  mountGuide();                                                       // the community guide under the hero
}
if(document.getElementById('view-home') && /^#\/\?(.*&)?q=[^&]/.test(location.hash))
  Promise.race([searching, new Promise(r => setTimeout(r, 8000))]).then(() => setTimeout(extras, 300), () => extras());
else extras();

/* A guide somebody else wrote, for a player who has not got to any of this yet. Linked where it helps,
   named where it is shown, never ours. The list is data/guides.json (tools/guides.py), which reads every
   address on every publish, so a link that rots is a fault with its own name in data/faults.json rather than
   a dead link sitting here quietly. Another guide is one entry in that tool and no code here.
   It sits under the hero, so it is there before a search and out of the way after one. */
async function mountGuide(){
  const box = $('#guide');
  if(!box) return;
  let list = [];
  try { list = ((await (await fetch('data/guides.json')).json()) || {}).guides || []; } catch {}
  if(!list.length) return;
  box.innerHTML = list.map(g => '<p class="note"><a href="' + esc(g.url) +
    '" target="_blank" rel="noopener">' + esc(g.what) + ' ↗</a> — ' + esc(g.name) + ', by ' + esc(g.by) + '.</p>').join('');
  box.hidden = false;
}

/* the counts in the index's contents (index.html #toc, the Data page): each kind's own, from the manifest */
export function fillCounts(man, host = document){
  const K = (man && man.kinds) || {};
  for(const el of host.querySelectorAll('.toc-n[data-k]')){
    const n = K[el.dataset.k] && +K[el.dataset.k].n;
    if(n) el.textContent = n.toLocaleString('en');
  }
}
