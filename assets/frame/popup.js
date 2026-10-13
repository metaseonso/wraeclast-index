import { D, LEAGUE_COLOUR, wake, hist, whole, priceOf } from '../core/data.js';
import { esc } from '../core/html.js';
import { isUnit, money, ago } from '../core/format.js';
import { openFold, peekKw, REL_STEP, paintRel, relSection, holdFiles, releaseFiles } from '../frame/related.js';
import { hrefOf, isItem } from '../frame/href.js';
import { keywordCard } from '../frame/keywords.js';
import { setOV, TRACKER } from '../frame/seam.js';
import { flipSwap } from '../frame/swap.js';
import { lazy, lazyOwn } from '../core/lazy.js';
import { openMech } from '../frame/types/reqs.js';
import { OWN } from '../frame/types/own.js';
import { KIND, FIELDS, holds, ACTS, SHUT } from '../kinds.js';
import { sawCard } from '../core/seen.js';
import { PLAY } from '../core/store.js';
import { card } from '../frame/card.js';
import { keyLabel, setCardKeys } from '../keys.js';

/* ---------- the popup ----------
   Every card opens here first. The gold button is the one way on to the drill-down page.

   The trail: the cards you have opened, in order, exactly like a browser's own back and forward.
   TRAIL holds a step per card (the card, how it was opened, and the whole state you left it in: see
   saveStep); AT says which step is on show. Every open pushes one history entry carrying that step's id,
   so the phone's Back and Forward both land on a real step and nothing dead is left behind. Opening a card
   from the middle of the trail drops the steps after it. Step 51 drops the oldest one. */
const typing = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);   // same guard as keys.js
const TAP = 10;   // px a finger may slide and still count as a tap, not a drag
const TRAIL_MAX = 50;   // cards kept on the trail; all of it is in this browser, so nothing is paid for it
const PANELS_KEPT = 5;  // ...and how many steps either side of the one on show keep their Trade or act panel
let OV = null, lastFocus = null;
let TRAIL = [], AT = -1, SEQ = 0, PEND = null;   // the trail, where you are on it, the next step id, a card still loading
const CUR = () => TRAIL[AT] || null;   // the card on show
const focusBox = () => OV.querySelector('.ov-box').focus({preventScroll: true});
/* Everything about the step you are leaving, so coming back to it finds it untouched: where the card was
   scrolled, and its Connections list's group, filter and own scroll. The Trade panel is kept as it stands —
   the same panel comes back, so Back never fires a second trade search. paintStep puts it all back. */
function saveStep(){
  const step = CUR();
  if(!step || !OV || OV.hidden) return;
  const box = OV.querySelector('.ov-box'), sec = box.querySelector('.uses');
  step.top = box.scrollTop;
  step.uses = sec && !sec.hidden ? {open: [...(sec._open || [])], more: {...(sec._more || {})},
    q: (sec.querySelector('.uses-q') || {}).value || '', top: (sec.querySelector('.uses-list') || {}).scrollTop || 0,
    fold: [...(sec._fold || [])]} : null;
  step.trade = box.querySelector('.trade') || null;
  step.panel = box.querySelector('.ov-panel') || null;   // ...and the panel one of its acts opened
  // a panel is a whole piece of page, kept whole: only the few steps nearest are worth that. Further back, a
  // step keeps its scroll and its list, and its panel is opened again by hand if it is wanted
  TRAIL.forEach((s, i) => { if(Math.abs(i - AT) > PANELS_KEPT) s.trade = s.panel = null; });
}
// a box you are typing in, brought back above the keyboard. Twice: once now, once after the keyboard has settled
function keepInView(el){
  const show = () => { if(el.isConnected) el.scrollIntoView({block: 'nearest'}); };
  show();
  setTimeout(show, 260);
}
/* The price line on an opened card: this league red or green with the price, the leagues before it behind it
   each in its own colour, and a key naming them so nobody has to guess which line is which league. Every line
   is placed by which day of its own league it is (lh.d0 plus a day's place in the line), so the shapes read
   against each other; a day nothing was checked is a null and breaks the line there. No league's line joins
   another's and no day is filled in. lh is market.json's lh (worker/prices.js): without it this draws the one
   line, as before. */
// this league, then one, two and three back: how faded each step is and how thick. Measured against the
// chart's own ground: the faintest still reads at 3.1 to 1, so the oldest league holds up on a phone. A past
// league with a colour of its own is drawn at full strength instead, and keeps its place on the width ladder,
// so the chart reads the same way without colour.
/* how far back a league is, drawn as a line: this league solid, then the dashes pull further apart the older
   the league is. Colour says which league it is, the dashes say how far back, so the chart reads without
   colour too. A league with no colour of its own also fades. */
/* A league we have no prices of our own in is drawn from poe.ninja's own numbers (tools/ninjapast.py), and
   their mark sits beside it in the key, so nobody reads their work as ours. */
const NINJA_MARK = '<img class="chart-src" src="assets/brand/ninja.png" alt="poe.ninja" width="11" height="11" loading="lazy">';
const DASH = [null, '7 4', '3 4', '1 5'];
const FADE = [null, null, null, '.72'];
const WIDE = [2, 1.7, 1.6, 1.5];
const realDays = v => v.reduce((n, x) => n + (x !== null && x !== undefined && isFinite(x) ? 1 : 0), 0);
/* h leaves out a day nothing was checked, so its prices sit next to each other however far apart the days
   are; lh.g says where those days were ([place in the line, days missing before it], worker/prices.js gapsOf).
   Putting them back as nulls places this league's line by day of league, the way a past league's already is,
   and breaks it where nothing was checked instead of drawing straight across. */
function byDay(vals, gaps){
  if(!gaps || !gaps.length) return vals;
  const miss = new Map(gaps.map(([i, n]) => [i, n])), out = [];
  for(let i = 0; i < vals.length; i++){
    for(let k = miss.get(i) || 0; k > 0; k--) out.push(null);
    out.push(vals[i]);
  }
  return out;
}
function linePath(v, d0, x0, xw, lo, span, w, h){
  let d = '', on = false;
  for(let i = 0; i < v.length; i++){
    const y = v[i];
    if(y === null || y === undefined || !isFinite(y)){ on = false; continue; }   // a day with no check: the line stops
    d += (on ? 'L' : 'M') + (((d0 + i - x0) / xw) * (w - 4) + 2).toFixed(1) + ' ' + (h - 4 - ((y - lo) / span) * (h - 8)).toFixed(1);
    on = true;
  }
  return d;
}
function bigLine(vals, label, lh){
  const now = byDay((vals || []).map(v => v === null || v === undefined || !isFinite(v) ? null : v), lh && lh.g);
  // s.b is how many leagues back it is, so a thing that skipped a league keeps that league's shade free
  // instead of moving up a step (worker/prices.js lh.past)
  const back = ((lh && lh.past) || []).map(s => ({n: s.n, b: Math.min(+s.b || 1, FADE.length - 1), d0: +s.d0 || 0,
    v: s.v || [], src: s.src || ''}))
    .sort((x, y) => x.b - y.b).slice(0, FADE.length - 1);
  const lines = [{n: (D.market && D.market.league) || 'This league', b: 0, d0: (lh && +lh.d0) || 0, v: now}, ...back];
  if(!lines.some(s => realDays(s.v) >= 2)) return '';   // one price is not a line: nothing is drawn from it
  const real = [];
  for(const s of lines) for(const y of s.v) if(y !== null && isFinite(y)) real.push(y);
  const lo = Math.min(...real), hi = Math.max(...real), span = hi - lo || 1, w = 300, h = 64;
  const x0 = Math.min(...lines.map(s => s.d0)), xw = Math.max(...lines.map(s => s.d0 + s.v.length - 1)) - x0 || 1;
  const p = now.filter(v => v !== null);
  const mine = p.length < 2 ? 'var(--faint)' : p[p.length - 1] >= p[0] ? 'var(--pos)' : 'var(--neg)';
  // this league keeps the price's own red or green; a retired league takes GGG's colour for it, and only a
  // league without one is faded back into the ladder
  const own = s => s.b ? LEAGUE_COLOUR.get(s.n) || '' : '';
  const col = s => s.b ? own(s) || 'var(--text)' : mine;
  const dim = s => own(s) ? FADE[s.b] : (FADE[s.b] || '.6');   // no colour of its own: the old faded ladder
  const dash = s => DASH[s.b];
  const at = (i, y) => [(i - x0) / xw * w, h - (y - lo) / span * h];   // a day and a price, as the chart draws them
  const paths = lines.map(s => {
    if(realDays(s.v) === 1){   // one number is a dot: the league ended there and that is all we have
      const i = s.v.findIndex(y => y !== null && isFinite(y));
      const [cx, cy] = at(s.d0 + i, s.v[i]);
      return '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="2.6" fill="' + col(s) + '"' +
        (dim(s) ? ' style="fill-opacity:' + dim(s) + '"' : '') + '/>';
    }
    const d = linePath(s.v, s.d0, x0, xw, lo, span, w, h);
    return d ? '<path d="' + d + '" fill="none" stroke="' + col(s) + '"' + (dim(s) ? ' style="stroke-opacity:' + dim(s) + '"' : '') +
      (dash(s) ? ' stroke-dasharray="' + dash(s) + '"' : '') +
      ' stroke-width="' + WIDE[s.b] + '" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' : '';
  }).reverse().join('');   // the oldest league first, so this league is drawn on top of them
  // the key: every league with prices, newest first, each in the colour its line is drawn in. A few days says
  // so rather than reading as a whole league.
  const key = lines.map(s => {
    const n = realDays(s.v);
    return n ? '<li><i style="border-color:' + col(s) + (dim(s) ? ';opacity:' + dim(s) : '') +
      (dash(s) ? ';border-top-style:dashed' : '') + '"></i>' + esc(s.n) + (s.src === 'ninja' ? NINJA_MARK : '') +
      (n < 14 ? '<span>' + n + (n === 1 ? ' day' : ' days') + '</span>' : '') + '</li>' : '';
  }).join('');
  // what the lines are: a past league we have days for is a line, one we have a single number for is the
  // price it ended at, and whose number that is belongs in the same breath
  const dots = back.filter(s => realDays(s.v) === 1);
  const said = [back.length ? (dots.length === back.length
      ? 'Daily price this league. Before it, the price each league ended at.'
      : 'Daily price in this league and the three before it.') : '',
    back.some(s => s.src === 'ninja') ? 'Past leagues: poe.ninja.' : '',
    (lh && lh.note) || ''].filter(Boolean).join(' ');
  return '<figure class="chart"><figcaption>' + label + '</figcaption><svg viewBox="0 0 ' + w + ' ' + h +
    '" preserveAspectRatio="none" aria-hidden="true">' + paths + '</svg><ul class="chart-key">' + key + '</ul>' +
    (said ? '<figcaption class="chart-said">' + esc(said) + '</figcaption>' : '') + '</figure>';
}
/* A lone day far off its neighbours — one listing at twenty times the rest — draws a spike that flattens the
   whole line under it. It is left off the line (a gap), never off the price: over 4 times the middle of the line
   with both days beside it under half of it, or under a quarter of the middle with both beside it over twice it.
   The line says how many it left off. */
function lone(pts){
  const vals = pts.filter(x => x !== null && isFinite(x)).sort((a, b) => a - b);
  if(vals.length < 5) return {pts, cut: 0};
  const mid = vals[vals.length >> 1];
  let cut = 0;
  const out = pts.map((v, i) => {
    const a = pts[i - 1], b = pts[i + 1];
    if(v === null || a == null || b == null) return v;
    if((v > mid * 4 && a < v / 2 && b < v / 2) || (v < mid / 4 && a > v * 2 && b > v * 2)){ cut++; return null; }
    return v;
  });
  return {pts: out, cut};
}
/* The price action under a card: this league's line with the leagues before it behind it, and where the
   price came from. Exported because the Build tab's bill is a shopping list of cards and each one carries
   the same chart — one drawing of a price, wherever a price is drawn. */
export function detailExtras(it, px){
  if(!px) return '';
  let out = '';
  // px.lh carries the leagues before this one (worker/prices.js). sp is only reached with three days or fewer,
  // where it is the whole of h, so lh.d0 still says which day of the league the line starts on.
  if(isUnit(it)){}   // the Divine Orb: always 1 divine, a flat line says nothing
  else if(px.h && px.h.length > 3){
    const {pts, cut} = lone(px.h.map(x => x[1])), kept = pts.filter(x => x !== null);
    const lo = money(Math.min(...kept)), hi = money(Math.max(...kept));
    out += bigLine(pts, 'Since ' + px.h[0][0] + ' \u00b7 low ' + lo.v + ' ' + lo.u + ', high ' + hi.v + ' ' + hi.u +
      (cut ? ' \u00b7 ' + cut + (cut === 1 ? ' lone day' : ' lone days') + ' left off the line' : ''), px.lh);
  } else if(px.sp) out += bigLine(lone(px.sp).pts, 'Last 7 days', px.lh);
  else if(px.lh && px.lh.past) out += bigLine([], 'Past leagues', px.lh);
  // nothing to draw and something to say: one day is a price, not price action, so the card says that instead
  if(!out && px.lh && px.lh.note) out += '<p class="chart-said">' + esc(px.lh.note) + '</p>';
  const facts = [];
  // where the price comes from, and when it was checked
  if(px.src === 'trade') facts.push((px.ls || 0).toLocaleString() + (px.as ? ' ' + px.as : '') +
    ' listed on the trade site' + (px.at ? ' \u00b7 checked ' + ago(px.at) : ''));
  if(px.src === 'cx'){
    facts.push(Math.round(px.vol || 0).toLocaleString() + ' div traded on the Currency Exchange in 24 h' + (px.at ? ' · ' + ago(px.at) : ''));
    if(px.pairs && px.pairs.length) facts.push('Trades for: ' + px.pairs.slice(0, 3).map(([o, r]) =>
      (r >= 100 ? Math.round(r).toLocaleString() : +(+r).toPrecision(3)) + ' ' + o).join(', ') + ' each');
  }
  if(facts.length) out += '<p class="card-facts">' + facts.map(esc).join(' \u00b7 ') + '</p>';
  return out;
}
function ensureOV(){
  if(!OV){
    OV = document.createElement('div');
    OV.className = 'ov'; OV.hidden = true;
    setOV(OV);   // what Connections reads to know a card is open (frame/seam.js)
    // the bar sits inside the scroll box, so Back, Forward and Close never scroll away. The tip is a row of
    // the bar, so it sits beside the arrows it is talking about and never covers anything.
    OV.innerHTML = '<div class="ov-scrim"></div><div class="ov-box" role="dialog" aria-modal="true" aria-label="Details" tabindex="-1">' +
      '<div class="ov-nav" hidden><button type="button" class="ov-back">← <span class="ov-nm">Back</span></button>' +
      '<span class="ov-at"></span><button type="button" class="ov-fwd">→</button>' +
      '<button type="button" class="ov-x" aria-label="Close">✕</button>' +
      '<p class="ov-tip" hidden><span class="ov-tipt"></span>' +
      '<button type="button" class="ov-tipx">Got it</button></p></div>' +
      '<div class="ov-body"></div></div>';
    document.body.appendChild(OV);
    scrimTap();
    OV.addEventListener('click', e => {
      const t = e.target;
      if(t.closest('.ov-tipx')){ tipSeen(); focusBox(); return; }   // "Got it": the line goes, for good
      const nb = t.closest('.ov-nav button');
      if(nb){
        if(nb.disabled) return;
        if(nb.classList.contains('ov-back')) history.back();
        else if(nb.classList.contains('ov-fwd')) history.forward();
        else closeDetail();
        return;
      }
      const go = t.closest('a.btn.gold, a.uses-go');
      if(go){ if(go.target !== '_blank') hideDetail(); return; }   // leaving the page: nothing to undo. A new tab: the card stays
      const door = t.closest('a[data-go]');   // a count on the card that is a Connections group: open it, go to it
      if(door){ e.preventDefault(); openFold(door.dataset.go); return; }
      const chip = t.closest('.kwlink');   // a keyword chip: its words, in place under the row
      if(chip){ peekKw(chip); return; }
      const kw = t.closest('.kwpeek-go, .kwmark');   // the way on from those words, or a marked word in a line
      if(kw){ const c = keywordCard(kw.dataset.kw); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const ask = t.closest('.card-ask');   // the mark in the corner: a note about the card you are on
      if(ask){ lazy('./ui/suggest.js').then(m => m.openSuggest(ask.dataset.ask), () => {}); return; }
      const hl = t.closest('.hlink, .card-offer');   // a word in a line, or the offer: a mechanics card (tools/mechanics.py)
      if(hl){ openMech(hl.dataset.h, {nested: true}); return; }
      const sw = t.closest('[data-swap]');   // a switch on the card: the same card again, with it on
      if(sw){ flipSwap(sw.dataset.swap); saveStep(); paintStep(); return; }
      const row = t.closest('.uses-row[data-key]');
      if(row){ const c = D.byKey.get(row.dataset.key); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const all = t.closest('.uses-all');   // "See all": the rest of that category, drawn here
      if(all){   // ...or, on a category already opened, its next rows
        const sec = all.closest('.uses'), c = all.dataset.c;
        if(sec._open.has(c)) sec._more[c] = (sec._more[c] || REL_STEP) + REL_STEP; else sec._open.add(c);
        paintRel(sec);
        return;
      }
      const cur = CUR();
      // an act a module of ours answers: the module and the call are in the act's own declaration (ACTS go),
      // so one route covers every act of that shape and no module is named here
      const own = t.closest('.btn[data-act]');
      if(own){
        if(own.dataset.act === 'pin'){ if(cur){ togglePin(cur.it); repaint(); } return; }
        if(cur) runAct(own.dataset.act, cur.it);
        return;
      }
      // a card that is an application, answering its own controls: the control says what it does and the
      // card's own module does it (opts.on). Nothing here knows what any of the words mean.
      const did = t.closest('button[data-do], a[data-do]');
      if(did && cur && cur.opts.on){ cur.opts.on(did.dataset.do, did, e); return; }
      if(t.closest('.fullstats') && cur && cur.opts.onFull){ const f = cur.opts.onFull; closeDetail(); setTimeout(f, 60); }
    });
    // ...and the controls that are not a click: a list, a slider. The same route, so a card's own module
    // answers everything on it the same way.
    for(const ev of ['change', 'input']) OV.addEventListener(ev, e => {
      const el = e.target.closest && e.target.closest('[data-do]');
      const cur = CUR();
      if(el && cur && cur.opts.on) cur.opts.on(el.dataset.do, el, e);
    });
    addEventListener('keydown', e => {
      if(e.key !== 'Escape' || OV.hidden) return;
      const el = document.activeElement;
      if(typing(el)){   // typing in a filter box: Esc empties it, then lets it go. The cards stay.
        if(el.value){ el.value = ''; el.dispatchEvent(new Event('input', {bubbles: true})); } else el.blur();
        return;
      }
      history.back();   // one step back, and the trail stays: Forward brings the card straight back
    });
    addEventListener('keydown', trapTab, true);
    addEventListener('focusin', e => {   // focus stays inside the open card
      if(OV.hidden) return;
      if(!OV.contains(e.target)) return focusBox();
      if(typing(e.target)) keepInView(e.target);   // the phone's keyboard is about to take the bottom half
    });
    // the keyboard resizes the page rather than covering it (the viewport hint on both pages):
    // whichever way it goes, the box you type in comes back on screen
    if(window.visualViewport) visualViewport.addEventListener('resize', () => {
      if(!OV.hidden && typing(document.activeElement) && OV.contains(document.activeElement)) keepInView(document.activeElement);
    });
    addEventListener('popstate', () => {
      const id = (history.state || {}).ov;
      saveStep();   // remember the card we are leaving, whole
      const i = id ? TRAIL.findIndex(s => s.id === id) : -1;
      if(i >= 0 && i !== AT) tipSeen();   // a real step back or forward — the bar, the keys or a swipe. No need to say so.
      // off the trail: the popup goes, the trail stays, so Forward walks straight back into it
      if(i < 0) return hideDetail();
      AT = i;
      showOV();
      paintStep();
    });
  }
}
/* Tab runs round the open card and never out of it */
function trapTab(e){
  if(e.key !== 'Tab' || !OV || OV.hidden) return;
  const box = OV.querySelector('.ov-box');
  const stops = [...box.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')]
    .filter(el => el.getClientRects().length);
  if(!stops.length) return;
  const at = document.activeElement, first = stops[0], last = stops[stops.length - 1];
  if(!box.contains(at)){ e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
  if(e.shiftKey && (at === first || at === box)){ e.preventDefault(); last.focus(); }
  else if(!e.shiftKey && at === last){ e.preventDefault(); first.focus(); }
}
/* The dim closes the cards only on a real tap on it: the finger goes down and comes up on the dim itself,
   barely moves, and leaves no text selected. A drag out of the card, a swipe, or letting go of a selection
   over the dim keeps the cards where they are. */
function scrimTap(){
  const scrim = OV.querySelector('.ov-scrim');
  let from = null;   // where the finger went down on the dim
  scrim.addEventListener('pointerdown', e => { from = {id: e.pointerId, x: e.clientX, y: e.clientY}; });
  addEventListener('pointercancel', () => { from = null; });
  addEventListener('pointerup', e => {
    const f = from; from = null;
    if(!f || f.id !== e.pointerId || e.target !== scrim) return;   // it started or ended somewhere else
    if(Math.hypot(e.clientX - f.x, e.clientY - f.y) > TAP) return;   // a drag, not a tap
    const sel = getSelection();
    if(sel && !sel.isCollapsed) return;   // the end of a text selection
    closeDetail();
  });
}
/* A panel one of the card's own acts opens under the buttons, the way the Trade panel opens under Trade:
   the act's own module makes the node and this is where it goes, and the same act again takes it away. It is
   the node itself that is kept, so Back and Forward bring it back with whatever was set on it (saveStep). */
export function actPanel(node, tag){
  if(!OV || OV.hidden || !CUR()) return null;
  const body = OV.querySelector('.ov-body');
  const had = body.querySelector('.ov-panel');
  if(had) had.remove();
  if(had && had.dataset.panel === tag) return null;
  node.classList.add('ov-panel');
  node.dataset.panel = tag;
  body.appendChild(node);
  node.scrollIntoView({block: 'nearest'});
  return node;
}
/* the same popup for anything else (e.g. the Suggest box): no card, so no trail */
export function openBox(node, label = 'Details'){
  wake();   // a box can name cards (Pins): their heads come through the search
  ensureOV();
  TRAIL = []; AT = -1;
  OV.querySelector('.ov-box').removeAttribute('aria-labelledby');
  OV.querySelector('.ov-box').setAttribute('aria-label', label);
  OV.querySelector('.ov-nav').hidden = true;
  OV.querySelector('.ov-body').replaceChildren(node);
  showOV();
  history.pushState({ov: 0, d: 1}, '', location.href);   // ov 0: not a card. Back closes it
}
/* opts.nested: opened from inside the popup (a keyword, or something that uses it).
   opts.onFull: the drill-down page's own full-stats panel, offered as a button. */
export function openDetail(it, opts = {}, href){
  if(TRACKER && it && it.k && it.n) TRACKER.note('opened:' + it.k + ':' + it.n);
  const key = it.k + ':' + it.id;
  it = D.byKey.get(key) || it;
  if(!((D.search || D.full) && D.past && !it._head) && !D.failed){
    // the card whole, the words that mark its lines, and its history: a moment away. A second tap while it
    // loads takes over, so one tap, one card. A card that never comes whole does not open
    const mine = PEND = {};
    const go = () => { if(PEND !== mine) return; PEND = null; const x = D.byKey.get(key) || it; if(!x._head) openDetail(x, opts, href); };
    Promise.all([wake(), hist(), whole([key, ...refsOf(it)])]).then(go, go);
    return;
  }
  PEND = null;
  const own = (KIND[it.k] || {}).own;   // a boss: its tab has the way in and the drops, so it draws the card and calls back
  if(own && !opts.drawn) return void lazyOwn(own, 'This card').then(m => { OWN[own] = m; m.openCard(it); }, () => {});
  sawCard(it);   // the trail the search ranks by: one card, once, where every card is opened
  ensureOV();
  const cur = CUR();
  let d = 1;
  if(!OV.hidden && cur){
    saveStep();              // the state of the card you are leaving
    TRAIL.length = AT + 1;   // opening from the middle of the trail drops what was ahead, like a browser
    d = ((history.state || {}).d || 0) + 1;
  } else TRAIL = [];         // a card opened from the page starts a fresh trail
  TRAIL.push({id: ++SEQ, it, opts, href, top: 0});
  if(TRAIL.length > TRAIL_MAX) TRAIL.shift();   // 50 deep is plenty; the oldest step drops off
  AT = TRAIL.length - 1;
  showOV();
  history.pushState({ov: TRAIL[AT].id, d}, '', location.href);   // one entry per card, both ways
  paintStep();
}
/* The cards a card draws from as it opens: the one a switch on it reads its lines from (FIELDS swaps). */
function refsOf(it){
  const out = [];
  for(const name of (KIND[it.k] || {}).fields || []){
    const of = (FIELDS[name] || {}).of;   // a list of switches; an enum's `of` is a table of words, not a list
    if(Array.isArray(of)) for(const x of of) if(x && x.card && holds(it, x.on)) out.push(x.card);
  }
  return out;
}

/* ---------- pins: a personal watch list ----------
   Any card whose kind names 'pin' in its acts (assets/kinds.js) can be kept here, from the one button under
   it — no kind writes its own star. Kept in this browser (localStorage) across visits; a tab's older list
   (sessionStorage, before 29 Sep 2026) joins it once. This is the seam for a signed-in account (issue #7): swap
   loadPins/savePins for a read and write of the same list from the account, keyed the same way ("kind:id"),
   and nothing below needs to change — isPinned, togglePin and pinnedKeys stay the same functions.
   assets/pins.js is the other half: the top-bar button and the box that reads the list back, both built on
   these exports alone (it does not touch the storage itself). */
const PINS_KEY = 'wi.pins';
function loadPins(){
  const read = st => { try { return JSON.parse(st.getItem(PINS_KEY) || '[]'); } catch { return []; } };
  let tab = [];
  try { tab = read(sessionStorage); if(tab.length) sessionStorage.removeItem(PINS_KEY); } catch {}
  const set = new Set([...(() => { try { return read(localStorage); } catch { return []; } })(), ...tab]);
  if(tab.length) try { localStorage.setItem(PINS_KEY, JSON.stringify([...set])); } catch {}
  return set;
}
function savePins(){ try { localStorage.setItem(PINS_KEY, JSON.stringify([...PINS])); } catch {} }
let PINS = loadPins();
const PIN_SUBS = new Set();
const pinKey = it => it.k + ':' + it.id;
export const isPinned = it => PINS.has(pinKey(it));
export const pinnedKeys = () => [...PINS];
export function onPinChange(fn){ PIN_SUBS.add(fn); }
export function togglePin(it){
  const k = pinKey(it);
  PINS.has(k) ? PINS.delete(k) : PINS.add(k);
  savePins();
  for(const fn of PIN_SUBS) fn();
  return PINS.has(k);
}

/* The buttons under a card, from the kind's own list (assets/kinds.js ACTS). Each one draws only when it
   has something to do: Trade for an item, Full stats where the page behind the card has a panel, Pin for
   any card kept in the watch list above, and the gold button where the kind has a tab and this card has an
   address in it. */
/* The same act, in a card's own corner in a grid, for a tab that wants it one press away instead of two.
   It draws where the act's own test holds and nowhere else, so a currency the bench cannot craft with has no
   button, exactly as in the popup. A page deciding what a card it draws carries is the caller's own call
   (docs/frame.md, "A page that already draws a field in full"), so this names no kind and no tab. */
export function actHTML(name, it){
  const a = ACTS[name] || {};
  if(!a.go || (a.page && a.page in SHUT)) return '';
  if(a.only && it.k in a.only && !holds(it, a.only[it.k])) return '';
  return '<button type="button" class="card-do" data-act="' + esc(name) + '" data-id="' + esc(it.id || '') +
    '">' + esc(a.short || a.label) + '</button>';
}
/* ...and one way to run one, wherever it was pressed: the act's declaration names the module and the call,
   so nothing that offers an act ever names a file. */
export function runAct(name, it){
  const a = ACTS[name];
  if(!a || !a.go || !it) return;
  lazyOwn(a.own, 'The ' + (a.label || 'button').toLowerCase()).then(m => m[a.go] && m[a.go](it), () => {});
}

function actsHTML(it, opts, href){
  const d = KIND[it.k] || {}, out = [];
  for(const a of d.acts || []){
    const act = ACTS[a] || {};
    if(a === 'trade' && isItem(it))
      out.push('<button type="button" class="btn ttoggle" aria-expanded="false">' + ACTS.trade.label + '</button>');
    else if(a === 'full' && opts.onFull)
      out.push('<button type="button" class="btn fullstats">' + ACTS.full.label + '</button>');
    else if(a === 'pin'){
      const on = isPinned(it);
      out.push('<button type="button" class="btn" data-act="pin" aria-pressed="' + on + '">' + (on ? 'Unpin' : 'Pin') + '</button>');
    }
    // an act a module of ours answers, drawn where this card carries what the act asks of its kind (ACTS only)
    else if(act.go && !(act.page && act.page in SHUT) && (!act.only || !(it.k in act.only) || holds(it, act.only[it.k])))
      out.push('<button type="button" class="btn" data-act="' + esc(a) + '">' + esc(act.label) + '</button>');
    else if((a === 'open' || a === 'craft') && href)
      out.push('<a class="btn gold" href="' + esc(href) + '">' + ACTS[a].label + (a === 'open' ? d.place : '') + ' →</a>');
  }
  return out.join('');
}
function paintStep(){
  const step = CUR();
  const {it, opts, href} = step;
  const box = OV.querySelector('.ov-box');
  const px = !PLAY.px ? null : opts.price !== undefined ? opts.price : priceOf(it);
  const body = OV.querySelector('.ov-body');
  const c = card(it, {...opts, href: null, rank: undefined, full: true, detail: true, extra: (opts.extra || '') + detailExtras(it, px)});
  c.classList.add('detail');
  body.replaceChildren(c);
  // the box is called by the card's own name
  const h = c.querySelector('h3');
  if(h){ h.id = 'ov-title'; box.removeAttribute('aria-label'); box.setAttribute('aria-labelledby', 'ov-title'); }
  else { box.removeAttribute('aria-labelledby'); box.setAttribute('aria-label', it.n || 'Details'); }
  const uses = relSection(it, step.uses);
  body.appendChild(uses);
  const acts = actsHTML(it, opts, href);
  // the patch the card's game data is from, at the foot of every card (#127); a price says its own age above
  const patch = D.man && D.man.patch ? '<span class="ov-fresh" title="Game data from the game files of this patch">Patch ' + esc(D.man.patch) + '</span>' : '';
  if(acts || patch){
    const row = document.createElement('div');
    row.className = 'ov-go';
    row.innerHTML = patch + acts;
    body.appendChild(row);
    const tb = row.querySelector('.ttoggle');
    if(tb) tb.addEventListener('click', async () => {
      const open = body.querySelector('.trade');
      if(open){ open.remove(); tb.setAttribute('aria-expanded', 'false'); return; }
      tb.disabled = true;
      try {
        const {tradePanel} = await lazy('./engines/trade.js', 'The trade listings');
        body.appendChild(await tradePanel(it));
        tb.setAttribute('aria-expanded', 'true');
        row.scrollIntoView({block: 'start'});   // the panel opens below the fold: show it, with the button above it
      } finally { tb.disabled = false; }
    });
    if(step.trade){   // the panel this step had open, itself: no second trade search
      body.appendChild(step.trade);
      if(tb) tb.setAttribute('aria-expanded', 'true');
    }
  }
  if(step.panel) body.appendChild(step.panel);   // ...and the act's own panel, with whatever was set on it
  paintNav();
  const back = () => { if(CUR() === step) box.scrollTop = step.top || 0; };   // back to where you had this card
  back();
  // ...and again once the Connections rows are in: they come from data/kwuse.json a moment later, and until
  // they do the card is too short to scroll that far, so the browser would clamp it back to the top
  if(uses) uses._then = back;
  const on = document.activeElement;
  if(!on || !box.contains(on) || on.disabled) focusBox();   // the button under the finger may have just gone
}
/* A card that is an application changes as it is used, and this is how its own module says so: the card is
   drawn again where it stands, so the scroll it was at and the live parts it holds both survive. */
export function repaint(){
  if(!OV || OV.hidden || !CUR()) return;
  saveStep();
  paintStep();
}
/* the bar: where you are, the card behind you, the card ahead */
function paintNav(){
  const nav = OV.querySelector('.ov-nav');
  nav.hidden = AT < 0;
  if(nav.hidden) return;
  const back = nav.querySelector('.ov-back'), fwd = nav.querySelector('.ov-fwd'), at = nav.querySelector('.ov-at');
  const prev = TRAIL[AT - 1], next = TRAIL[AT + 1];
  back.disabled = !prev; back.hidden = !prev;   // an arrow only where there is a card to go to
  fwd.hidden = !next;
  back.querySelector('.ov-nm').textContent = prev ? prev.it.n : 'Back';
  back.setAttribute('aria-label', prev ? 'Back to ' + prev.it.n : 'Back');
  fwd.disabled = !next;
  fwd.setAttribute('aria-label', next ? 'Forward to ' + next.it.n : 'Forward');
  at.textContent = TRAIL.length > 1 ? (AT + 1) + '/' + TRAIL.length : '';
  const tip = nav.querySelector('.ov-tip');
  tip.hidden = tipOff || TRAIL.length < TIP_AT;
  if(!tip.hidden) tip.querySelector('.ov-tipt').textContent = tipLine();
}
/* One line, once: the cards remember where you have been. It waits until the trail is three deep, because
   that is when stepping back starts to be worth knowing, and it is gone for good once it is dismissed or
   once the player has stepped back or forward without it. Kept in this browser, beside the keybindings. */
const TIP_KEY = 'wi.cardtip', TIP_AT = 3;
let tipOff = false;
try { tipOff = localStorage.getItem(TIP_KEY) === '1'; } catch {}
function tipLine(){
  const keys = [keyLabel('cardback'), keyLabel('cardfwd')].filter(Boolean).join(' and ');
  return 'Back and forward through cards: ' + (keys ? keys + ', or ' : '') + 'the arrows.';
}
function tipSeen(){
  if(tipOff) return;
  tipOff = true;
  try { localStorage.setItem(TIP_KEY, '1'); } catch {}
  const t = OV && OV.querySelector('.ov-tip');
  if(t) t.hidden = true;
}
function showOV(){
  if(!OV.hidden) return;
  lastFocus = document.activeElement;
  OV.hidden = false;
  document.body.classList.add('ov-open');
  holdFiles();
  focusBox();
}
function hideDetail(){
  if(!OV || OV.hidden) return;
  OV.hidden = true;
  document.body.classList.remove('ov-open');
  releaseFiles();
  if(lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({preventScroll: true});   // back on the row that opened it
}
// Close means closed: every entry the popup pushed is unwound, so one more Back leaves the page
function closeDetail(){
  const d = (history.state || {}).d || 0;
  if(d) history.go(-d); else hideDetail();   // popstate hides it
}
/* "Search this list or card" inside a card: a box for what this card holds. A keyword card filters its
   Connections list; any other card filters its own lines. Typing filters the rows live; Esc empties the box
   and then leaves it (the Escape handler above), so the card stays open either way. */
function cardFilter(){
  const box = OV.querySelector('.ov-box');
  // a card that is an application drew its own box over its own list: that is the list you are looking at,
  // so the key goes there rather than building a second one over the lines behind it
  let q = box.querySelector('input[type=search][data-find]');
  if(!q) q = box.querySelector('.uses-q');
  if(q) q.hidden = false;                                  // a short Connections list keeps its box out of the way until now
  else if(box.querySelector('.uses-list')) return false;   // a list still loading, or with nothing in it to filter
  else q = lineFilter(box);
  if(!q) return false;
  q.focus(); q.select(); keepInView(q);
  return true;
}
// the card's own lines — mods, stats, drops — with a box above them and a word when nothing is left
function lineFilter(box){
  const had = box.querySelector('.card-q');
  if(had) return had;
  const c = box.querySelector('.card.detail'), lists = c ? [...c.querySelectorAll('.card-ls')] : [];
  const rows = lists.flatMap(l => [...l.children]);
  if(rows.length < 2) return null;
  const hay = rows.map(el => el.textContent.toLowerCase());
  const q = document.createElement('input');
  q.className = 'uses-q card-q'; q.type = 'search'; q.autocomplete = 'off'; q.spellcheck = false;
  q.placeholder = 'Filter lines…';
  q.setAttribute('aria-label', 'Filter the lines on this card');
  const none = document.createElement('p');
  none.className = 'note uses-none'; none.hidden = true; none.textContent = 'Nothing matches.';
  q.addEventListener('input', () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    rows.forEach((el, i) => { const hit = words.every(w => hay[i].includes(w)); el.hidden = !hit; shown += hit; });
    none.hidden = shown > 0;
  });
  lists[0].before(q);
  lists[lists.length - 1].after(none);
  return q;
}
// the card's own keys, in the keybindings sheet (assets/keys.js) like every other shortcut
setCardKeys(id => {
  if(!OV || OV.hidden || AT < 0) return false;
  if(id === 'list') return cardFilter();
  if(id === 'cardback'){ if(AT < 1) return false; history.back(); return true; }
  if(id === 'cardfwd'){ if(AT >= TRAIL.length - 1) return false; history.forward(); return true; }
  if(id === 'cardclose'){ closeDetail(); return true; }
  return false;
});


