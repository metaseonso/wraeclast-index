import { OP } from '../search/protocol.js';
import { D, TR, whole, getJSON, priceOf, wake, ask, have } from '../core/data.js';
import { KW, KIND, SAYS, FIELDS, FRAME } from '../kinds.js';
import { esc, reduceMotion } from '../core/html.js';
import { OV } from '../frame/seam.js';
import { keywordCard, keywordIdOf } from '../frame/keywords.js';
import { tableOf } from '../frame/types/item.js';
import * as edges from '../edges.js';
import { craftHref } from '../frame/href.js';
import { iconHTML, moneyHTML } from '../core/format.js';
import { foldHTML } from '../frame/types/patches.js';

/* ---------- keywords: the chips on a card ----------
   Every gem, unique, passive and keyword lists the keywords its game text marks (the index's "kw"). The chips
   are the way to them; which cards a keyword is itself found on is the related section below. */
function kwChips(it){
  const own = keywordIdOf(it);
  const ids = (it.kw || []).filter(k => k !== own && keywordCard(k));
  if(!ids.length) return '';
  return '<div class="kwchips"><span class="lbl">Keywords</span>' + ids.map(k =>
    '<button type="button" class="chip kwlink" data-kw="' + esc(k) + '" aria-expanded="false" aria-controls="ov-kwpeek">' +
      esc(keywordCard(k).n) + '</button>').join('') + '</div>' +
    '<div class="kwpeek" id="ov-kwpeek" hidden></div>';
}
/* A chip opens its keyword's own words in place, under the row: one at a time, and a way on to its card. The
   words are the card's own (SAYS), so a keyword card and a keystone that stands for its keyword read alike. */
function peekHTML(c, id){
  const say = x => esc((TR && TR.line(x)) || x);
  const words = SAYS.map(n => c[FIELDS[n].at]).flatMap(v => Array.isArray(v) ? v : v ? [v] : []);
  return (words.length ? words.map(x => '<p class="kwpeek-tx">' + say(x) + '</p>').join('') : '<p class="kwpeek-tx">…</p>') +
    '<button type="button" class="kwpeek-go" data-kw="' + esc(id) + '">Open ' + esc(c.n) + ' →</button>';
}
function peekKw(b){
  const row = b.closest('.kwchips'), box = row && row.nextElementSibling;
  if(!box || !box.classList.contains('kwpeek')) return;
  const was = b.getAttribute('aria-expanded') === 'true';
  for(const x of row.querySelectorAll('.kwlink')) x.setAttribute('aria-expanded', 'false');
  box.hidden = true;
  if(was) return;
  const c = keywordCard(b.dataset.kw);
  if(!c) return;
  b.setAttribute('aria-expanded', 'true');
  const draw = x => {
    if(b.getAttribute('aria-expanded') !== 'true' || !box.isConnected) return;
    box.innerHTML = peekHTML(x, b.dataset.kw);
    box.hidden = false;
  };
  draw(c);
  if(c._head) whole([c.k + ':' + c.id]).then(([x]) => { if(x) draw(x); }, () => {});
}

/* ---------- the related section ----------
   Built from the edges the index already holds, followed both ways (assets/edges.js), in the categories the
   kind declares (assets/kinds.js). Per category: the first CAP rows, the true total, and a "See all" that
   draws the rest here on demand — a keyword like Hit is on 1,448 things and nobody wants all of them at once.
   Where the drill-down page can show the same list, the gold link carries the filter that makes it the same
   list rather than the default view.
   A keyword's own nine categories come from data/kwuse.json (tools/kwuse.py), fetched the first time one of
   them is needed. */
/* The files some of the lists are worked out from, each fetched the first time a card asks for one and kept
   for the rest of the visit. A card that needs none of them never asks for any. */
const REL_FILES = {kwuse: 'data/kwuse.json', grants: 'data/grants.json', clusters: 'data/clusters.json',
  dropsfrom: 'data/dropsfrom.json', leaguemech: 'data/leaguemech.json'};
const HAVE = {};            // what is in
const JOB = {};             // what is on its way
let DRILL = null;           // the keywords the drill-down page can filter by, once its file is in
function drillKw(){
  if(!HAVE.kwuse) return null;
  return DRILL || (DRILL = new Set(HAVE.kwuse.dd || []));
}
/* The keyword lists are the biggest of them (data/kwuse.json, near 800 KB, and more once read). With the popup
   closed for a minute they are let go, and the next card that wants them reads them again. Only where the
   service worker is running: it keeps every file of the deploy in this browser (sw.js), so reading it again is
   a read off the disk and never the network, and never a newer file than the index this page has. */
const LET_GO = 60000;
let letGo = 0;
function holdFiles(){ clearTimeout(letGo); letGo = 0; }
function releaseFiles(){
  holdFiles();
  if(!HAVE.kwuse || !(navigator.serviceWorker && navigator.serviceWorker.controller)) return;
  letGo = setTimeout(() => {
    if(OV && !OV.hidden) return;
    delete HAVE.kwuse; delete JOB.kwuse; DRILL = null;
  }, LET_GO);
}
let relBad = false;         // a fetch that failed: the card says so instead of waiting for ever
/* A file a card's own fields read too (data/dropsfrom.json, data/leaguemech.json) is the same copy they read
   (tableOf), so it is fetched once. The keyword lists are the one file let go, so they are read on their own. */
const relFile = f => f === 'kwuse' ? getJSON(REL_FILES[f])
  : tableOf(REL_FILES[f]).then(j => j || Promise.reject(new Error(REL_FILES[f])));
function needFiles(names){
  return Promise.all(names.map(f => JOB[f] || (JOB[f] =
    relFile(f).then(j => { HAVE[f] = j; }, () => { relBad = true; }))));
}
// rows per category before the "See all", the slack that is not worth a button, and the width a section
// gets its filter box at: the frame's own numbers, the same on every card (assets/kinds.js FRAME.rel)
const {cap: CAP, slack: SLACK, filter: USE_FILTER} = FRAME.rel;
// ...and what "See all" draws at a time: a keyword like Hit is on 1,448 things, and a thousand rows at once is
// a long wait on a weak machine. The rest is one Show more away, and the filter box searches all of it.
const REL_STEP = 200;
edges.setup({D, keywordCard, keywordIdOf, kindOf: k => KIND[k], has: key => D.byKey.has(key)});

/* one row: anything with a card of its own opens it, an Atlas row without one goes to its tab, and the rest
   is a plain row. `hay` is what the filter box searches — the same words the search itself uses. */
function relRow(r){
  const it = r.key ? D.byKey.get(r.key) : null;
  const times = n => n > 1 ? ' <span class="uses-x">×' + n + '</span>' : '';
  const kinds = r.craft && r.craft.length
    ? '<span class="uses-kinds">' + r.craft.map((c, j) =>
        '<a class="uses-go" href="' + craftHref(c, '', (r.kinds || [])[j]) + '">' + esc((r.kinds || [])[j] || c) + '</a>').join(', ') + '</span>'
    : (r.kinds || []).length ? '<span class="uses-kinds">' + esc(r.kinds.join(', ')) + '</span>' : '';
  const wrap = kinds ? ' uses-wrap' : '';
  if(it){
    const p = priceOf(it), sub = r.sub === undefined ? (it.s || '') : r.sub;
    return {hay: ((it._hay || '') + ' ' + sub).toLowerCase(),
      html: '<button type="button" class="uses-row' + wrap + '" data-key="' + esc(r.key) + '">' +
        '<span class="uses-ic">' + iconHTML(it) + '</span>' +
        '<span class="uses-t"><b>' + esc(it.n) + times(r.x) + '</b><span>' + esc(sub) + '</span>' + kinds + '</span>' +
        (p && p.v !== undefined ? '<span class="uses-px">' + moneyHTML(p.v) + '</span>' : '') + '</button>'};
  }
  const sub = r.sub || '';
  const hay = [r.n, sub, (r.kinds || []).join(' '), r.hay].filter(Boolean).join(' ').toLowerCase();
  if(r.go) return {hay, html: '<a class="uses-row uses-go" href="' + esc(r.go) + '" title="' + esc(sub) + '">' +
    '<span class="uses-t"><b>' + esc(r.n) + '</b><span>' + esc(sub) + '</span></span></a>'};
  return {hay, html: '<div class="uses-row uses-plain' + wrap + '" title="' +
    esc(sub + (r.x > 1 ? ' · ' + r.x + ' on the tree' : '')) + '">' +
    (r.ic ? '<span class="uses-ic"></span>' : '') +
    '<span class="uses-t"><b>' + esc(r.n) + times(r.x) + '</b><span>' + esc(sub) + '</span>' + kinds + '</span></div>'};
}
/* "See all" on the drill-down page, with the filter that makes it the list the card was showing. Each name
   here is one the page knows (assets/bridge.js): a keyword, a base item, an item class, an Atlas section.
   A category with no filter of its own has no link, only the button that draws the rest here. */
const SEEALL = {
  /* the drill-down page filters its lists by the keywords it carries itself (data/kwuse.json "dd"), so a
     keyword the site cards and that page does not know has its rows here and no list to send anyone to */
  kw(it, of){
    const id = keywordIdOf(it), dd = drillKw();
    return id && of && of.sec && dd && dd.has(id) ? ['#' + of.sec + '?kw=' + encodeURIComponent(id), of.place] : null;
  },
  base(it, of){ return it.base ? ['#uniques?base=' + encodeURIComponent(it.base), of.place] : null; },
  // the link to the whole kind carries its name: a class card is that name, a base item says it in its sub line
  craft(it){ return it.cr ? [craftHref(it.cr, '', it.cr === it.id ? it.n : (it.s || '').split('·')[0].trim()), 'Craft'] : null; },
  atlas(it){ return it.at ? ['./#/atlas?s=' + encodeURIComponent(it.at), 'Atlas'] : null; },
};
function seeAllHTML(it, cat){
  const f = SEEALL[cat.filter], got = f && f(it, KIND[cat.of]);
  if(!got) return '';
  const href = got[0].startsWith('#') ? (/explore/.test(location.pathname) ? '' : 'explore') + got[0] : got[0];
  return '<a class="btn gold uses-go" href="' + esc(href) + '">See all ' + cat.total.toLocaleString() +
    ' in ' + esc(got[1]) + ' →</a>';
}
/* want: the categories the player had opened, the filter and the scroll (saveStep), put back once the rows
   are in */
/* A door on the card to one of its Connections groups ("Used by 63 gems"): the group opens and comes into view.
   A group still loading is opened the moment it is drawn. */
function openFold(c){
  const sec = OV && OV.querySelector('.uses');
  if(!sec || !sec._fold) return;
  sec._fold.set(c, true);
  const d = sec.querySelector('details.uses-cat[data-c="' + CSS.escape(c) + '"]');
  if(!d){ sec._jump = c; return; }
  d.open = true;
  d.scrollIntoView({block: 'start'});
  d.querySelector('summary').focus({preventScroll: true});
}
function relSection(it, want){
  const sec = document.createElement('section');
  sec.className = 'uses';
  sec._it = it;
  sec._open = new Set((want && want.open) || []);
  sec._more = {...((want && want.more) || {})};   // an opened category drawn past its first REL_STEP rows
  sec._want = want || null;
  sec._fold = new Map((want && want.fold) || []);   // the groups the player opened or shut, by id
  sec.addEventListener('click', e => {
    const s = e.target.closest('summary.fold-hd'), d = s && s.parentElement;
    if(d && d.dataset.c) sec._fold.set(d.dataset.c, !d.open);   // the click is about to turn it
  });
  // a page holding only what it shows first asks for the card's lists and the heads of every row they name
  sec._wait = !D.full;
  const need = paintRel(sec);
  if(!sec._wait){
    if(need.length) needFiles(need).then(() => { paintRel(sec); if(sec._then) sec._then(); });
    return sec;
  }
  relHeads(it).then(() => { sec._wait = false; paintRel(sec); if(sec._then) sec._then(); },
    () => { relBad = true; sec._wait = false; paintRel(sec); });
  return sec;
}
/* What a card's Connections need before they are drawn, where the page holds only what it shows: the lists its
   groups give it (the search worker's, "_g": assets/graph.js), the files its other lists come from, and the head
   of every card any of them names, so a row that has a card draws it and one that has none is left out, as ever. */
async function relHeads(it){
  const key = it.k + ':' + it.id;
  if(!it._g && D.byKey.has(key) && !D.full){
    await wake();
    const r = await ask(OP.rel, {key});
    if(r.lists) it._g = r.lists;
  }
  const need = edges.categories(it, HAVE).need;
  if(need.length) await needFiles(need);
  if(!D.full) await have(edges.keysOf(it, HAVE));
}
function paintRel(sec){
  const it = sec._it;
  // what the player had typed and where they had scrolled: a "See all" redraws the whole section
  const was = sec.querySelector('.uses-q');
  const keep = was ? {q: was.value, top: (sec.querySelector('.uses-list') || {}).scrollTop || 0} : null;
  const got = sec._wait ? {list: [], need: []} : edges.categories(it, HAVE);
  const waiting = (sec._wait || got.need.length) && !relBad;
  /* In order of meaning: FRAME.rel.lead first, then the kind's own order, then the bags (FRAME.rel.last), less
     any bag that only repeats another group's cards. The first FRAME.rel.open open by themselves; a bag never. */
  const bag = new Set(FRAME.rel.last), row = r => r.key || r.n;
  const kept = got.list.filter(c => !bag.has(c.id));
  const lead = [...new Set([...FRAME.rel.lead.map(id => kept.find(c => c.id === id)).filter(Boolean), ...kept])];
  const cats = [...lead, ...got.list.filter(c => bag.has(c.id) &&
    !kept.some(o => { const has = new Set(o.rows.map(row)); return c.rows.every(r => has.has(row(r))); }))];
  const opens = new Set(lead.slice(0, FRAME.rel.open).map(c => c.id));
  sec.hidden = !cats.length && !waiting;
  if(sec.hidden){ sec.innerHTML = ''; sec._rows = []; return got.need; }
  const all = [];   // every row drawn, in order, for the filter box
  // each group a fold, the ones picked above open, until the player opens or shuts one, which it then stays
  const blocks = cats.map(c => {
    const open = sec._open.has(c.id);
    const show = open ? Math.min(c.total, sec._more[c.id] || REL_STEP) : c.total <= CAP + SLACK ? c.total : CAP;
    c.drawn = show;
    const drawn = c.rows.slice(0, show).map(relRow);
    all.push(...drawn);
    const left = c.total - show, more = seeAllHTML(it, c);
    return foldHTML({cls: 'uses-cat', c: c.id, label: c.label, count: c.total.toLocaleString(), note: c.note,
      open: sec._fold.has(c.id) ? sec._fold.get(c.id) : opens.has(c.id)},
      drawn.map(x => x.html).join('') +
      (left > 0 || more ? '<p class="uses-more">' +
        (left > 0 ? '<button type="button" class="uses-all" data-c="' + esc(c.id) + '">' +
          (open ? 'Show more' : 'See all ' + c.total.toLocaleString()) + '</button>' : '') + more + '</p>' : ''));
  }).join('');
  const note = waiting ? '<p class="note">Looking…</p>' : relBad && !cats.length
    ? '<p class="note">This list did not load.</p>' : '';
  const filter = all.length > 1 ? '<input class="uses-q" type="search" autocomplete="off" spellcheck="false"' +
    (all.length > USE_FILTER ? '' : ' hidden') +
    ' placeholder="Filter this list…" aria-label="Filter these connections">' : '';
  sec.innerHTML = '<h4>Connections</h4>' + filter + '<div class="uses-list">' + blocks + note + '</div>' +
    '<p class="note uses-none" hidden>Nothing matches.</p>';
  sec._rows = all;
  const q = sec.querySelector('.uses-q');
  if(q) q.addEventListener('input', () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for(const x of sec.querySelectorAll('.uses-extra')) x.remove();
    const els = [...sec.querySelectorAll('.uses-row')];
    let shown = 0;
    els.forEach((el, i) => { const hit = words.every(w => (all[i] || {hay: ''}).hay.includes(w)); el.hidden = !hit; shown += hit; });
    /* A category opened with "See all" draws REL_STEP rows at a time, but the filter still answers for all of
       it: the rows not drawn yet are searched too, and the ones that match are drawn under the rest, up to
       REL_STEP of them. They go again with the next letter typed. */
    if(words.length) for(const c of cats){
      if(!sec._open.has(c.id) || c.drawn >= c.total) continue;
      const box = sec.querySelector('.uses-cat[data-c="' + CSS.escape(c.id) + '"] .uses-more');
      if(!box) continue;
      let html = '', n = 0;
      for(let i = c.drawn; i < c.total && n < REL_STEP; i++){
        const r = c.rows[i]._row || (c.rows[i]._row = relRow(c.rows[i]));
        if(words.every(w => r.hay.includes(w))){ html += r.html; n++; }
      }
      if(!n) continue;
      const t = document.createElement('template');
      t.innerHTML = html;
      for(const el of t.content.children) el.classList.add('uses-extra');
      box.before(t.content);
      shown += n;
    }
    for(const cat of sec.querySelectorAll('.uses-cat')){
      cat.hidden = ![...cat.querySelectorAll('.uses-row')].some(r => !r.hidden);
      if(words.length && !cat.hidden) cat.open = true;   // a hit is never behind a shut fold
    }
    sec.querySelector('.uses-none').hidden = shown > 0;
  });
  // Back to this card, or a category just opened: the filter it had and where the list was scrolled
  const want = sec._want || keep;
  if(want && !waiting){
    sec._want = null;
    if(q && want.q){ q.value = want.q; q.dispatchEvent(new Event('input')); }
    sec.querySelector('.uses-list').scrollTop = want.top || 0;
  }
  if(sec._jump && !waiting && sec.querySelector('details.uses-cat[data-c="' + CSS.escape(sec._jump) + '"]')){
    const c = sec._jump;
    sec._jump = null;
    requestAnimationFrame(() => openFold(c));
  }
  return got.need;
}
/* Render a list of cards into a grid. Cards that stay glide to their new place, new cards fly in,
   and cards that leave fade out where they stood (FLIP, Web Animations API).
   What it costs is the reading of where each card sits, so every place is read in one pass before anything
   is written, and again in one pass after: a read between two writes is a whole layout of the page, once per
   card. Only a card on screen, or near it, is moved: one far below is never seen gliding. And a draw that
   moves a great many cards at once does not glide them at all — nobody follows forty cards moving, and a
   weak machine pays for every one. */
const GLIDE_MAX = 40;    // cards on the grid before a draw, past which it is simply redrawn in its new order
const NEAR_VIEW = 300;   // px above and below the screen a card still counts as on it
// no motion where it was asked for, and none on a machine the page has marked as slow (the class "lite")
function calm(){ return reduceMotion || document.documentElement.classList.contains('lite'); }
export function flow(grid, list, make){
  const old = new Map();
  for(const c of grid.children) if(c.dataset.key) old.set(c.dataset.key, c);
  // every card on the grid now either stays or leaves, so that is the number of cards that would move
  const still = calm(), glide = !still && old.size > 0 && old.size <= GLIDE_MAX;
  const before = new Map();
  let gridBox = null;
  if(glide){
    gridBox = grid.getBoundingClientRect();
    for(const [k, c] of old) before.set(k, c.getBoundingClientRect());
  }
  const nodes = list.map(x => {
    let n = old.get(x.key);
    if(n) old.delete(x.key);
    else { n = make(x); n.dataset.key = x.key; n._fresh = true; }
    return n;
  });
  const leaving = [...old.values()];
  grid.replaceChildren(...nodes);
  if(still){ for(const n of nodes) n._fresh = false; return; }
  const lo = -NEAR_VIEW, hi = innerHeight + NEAR_VIEW;
  const seen = r => r && r.bottom > lo && r.top < hi;
  // the new places, all read before the first animation is started
  const after = nodes.map(n => n._fresh || glide ? n.getBoundingClientRect() : null);
  // ghosts for cards that left, so they fade where they were instead of vanishing
  if(glide) leaving.slice(0, 12).forEach(n => {
    const r = before.get(n.dataset.key); if(!seen(r)) return;
    Object.assign(n.style, {position:'absolute', left:(r.left - gridBox.left) + 'px', top:(r.top - gridBox.top) + 'px',
      width:r.width + 'px', height:r.height + 'px', margin:0, pointerEvents:'none', zIndex:0});
    grid.appendChild(n);
    n.animate([{opacity:1, transform:'none'}, {opacity:0, transform:'scale(.96)'}], {duration:180, easing:'ease-in'})
      .onfinish = () => n.remove();
  });
  let k = 0;
  nodes.forEach((n, i) => {
    const b = after[i];
    if(n._fresh){
      n._fresh = false;
      if(seen(b)) n.animate([{opacity:0, transform:'translateY(18px) scale(.97)'}, {opacity:1, transform:'none'}],
        {duration:420, delay:Math.min(k++, 16) * 24, easing:'cubic-bezier(.2,.8,.2,1)', fill:'backwards'});
    } else if(glide){
      const a = before.get(n.dataset.key);
      if(!a || !(seen(a) || seen(b))) return;
      const dx = a.left - b.left, dy = a.top - b.top;
      if(Math.abs(dx) > 1 || Math.abs(dy) > 1)
        n.animate([{transform:'translate(' + dx + 'px,' + dy + 'px)'}, {transform:'none'}],
          {duration:420, easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  });
}

export { kwChips, peekKw, holdFiles, releaseFiles, REL_STEP, openFold, relSection, paintRel, calm };
