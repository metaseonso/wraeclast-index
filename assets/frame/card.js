import { leadFirst, PLAY } from '../core/store.js';
import { fieldsOf, FIELDS, FRAME, SLOTS, BOXES, KIND, DEFAULT } from '../kinds.js';
import { TYPE } from '../frame/types/index.js';
import { hrefOf } from '../frame/href.js';
import { esc } from '../core/html.js';
import { priceOf, D } from '../core/data.js';
import { pill, openMark } from '../frame/types/reqs.js';
import { moneyHTML } from '../core/format.js';
import { flipSwap } from '../frame/swap.js';
import { openDetail, late } from '../frame/seam.js';

/* ---------- the slot rule ----------
   The fields of one slot, drawn in the order the kind declares them. A field that drew nothing is not in the
   slot at all, so a slot holds the pieces the entry really has.

   The grid keeps its shape: a slot draws the first FRAME.cap[slot] pieces and says how many it did not draw.
   The popup draws all of them, so the count is the way to the rest — open the card. `more` is where each slot
   puts that count, in its own shape and with no style of its own. */
function slotHTML(it, slot, o){
  const out = [];
  // the play mode's own two rules (FRAME.modes): what it leads with first, and no field off the market without prices
  for(const name of leadFirst(fieldsOf(it.k, slot), n => FIELDS[n].first)){
    if(o.without && o.without.includes(name)) continue;   // a page that already draws this field in full
    const f = FIELDS[name], t = TYPE[f.type];
    if(!t || (f.popup && !o.full) || (f.trade && !PLAY.px)) continue;   // a field its declaration keeps to the opened card
    const v = t.v(it, f, o, name);
    if(v === null || v === undefined || v === '') continue;
    out.push({name, f, html: t.raw ? v : esc(v), text: t.raw ? '' : v});
  }
  const cap = FRAME.cap[slot];
  if(!o.full && cap && out.length - cap > FRAME.slack){
    const left = out.length - cap;
    out.length = cap;
    out.over = left;
  }
  return out;
}
/* What a card's slots came to: what each one had to draw, what it drew, and what it counted instead. The
   same call the card itself makes, so tools/dev/frame.mjs reads the frame rather than the markup. */
export function slotsOf(it, opts = {}){
  const o = {...opts};
  o.px = !PLAY.px ? null : opts.price !== undefined ? opts.price : priceOf(it);   // no prices: a card with no price
  o.href = opts.href !== undefined ? opts.href : hrefOf(it);
  const out = {};
  for(const slot of SLOTS){
    const list = slotHTML(it, slot, o);
    out[slot] = {drew: list.length, over: list.over || 0, cap: FRAME.cap[slot] || 0};
  }
  return out;
}
/* what a slot that did not draw everything says, in that slot's own shape. Always a count, never an "etc." */
const MORE = {
  pill:  n => pill(FRAME.more(n)),
  fact:  n => FRAME.more(n),
  body:  n => '<p class="card-facts">' + esc(FRAME.more(n)) + '</p>',
  foot:  n => '<span class="use">' + esc(FRAME.more(n)) + '</span>',
};
const overHTML = (list, slot) => list.over ? MORE[slot](list.over) : '';

/* ---------- the head ----------
   Four boxes, in the order BOXES gives them; a head field lands in the box its own declaration names, so a
   second field in a box joins it and no box is ever written per kind. A box marked `always` keeps its place
   whether or not it has anything in it — the art and the name hold the card's shape — and one that is not
   draws nothing when it is empty. */
const HEADBOX = {
  art:   {open: '<span class="card-ic">', close: '</span>', always: 1},
  name:  {open: '<h3>', close: '</h3>', always: 1, group: 'card-id'},
  sub:   {open: '<p class="card-sub">', close: '</p>', always: 1, group: 'card-id'},
  price: {open: '<div class="card-px">', close: '</div>'},
};
function headHTML(head){
  let out = '', group = null;
  for(const b of BOXES){
    const w = HEADBOX[b];
    if(!w) continue;
    const v = head.filter(x => x.f.box === b).map(x => x.html).join('');
    if(!v && !w.always) continue;
    if((w.group || null) !== group){
      if(group) out += '</div>';
      group = w.group || null;
      if(group) out += '<div class="' + group + '">';
    }
    out += w.open + v + w.close;
  }
  return '<div class="card-hd">' + out + (group ? '</div>' : '') + '</div>';
}

export function card(it, opts = {}){
  const o = {...opts};
  o.px = !PLAY.px ? null : opts.price !== undefined ? opts.price : priceOf(it);   // no prices: a card with no price
  o.href = opts.href !== undefined ? opts.href : hrefOf(it);
  const d = KIND[it.k] || DEFAULT;
  const el = document.createElement('article');
  el.className = 'card k-' + it.k + (o.href ? ' linked' : '') + (it._head ? ' headonly' : '');
  if(!o.href) el.tabIndex = 0;
  const head = slotHTML(it, 'head', o), pills = slotHTML(it, 'pill', o);
  const facts = slotHTML(it, 'fact', o), body = slotHTML(it, 'body', o), foot = slotHTML(it, 'foot', o);
  // a pill slot's own fields are plain words and the slot wraps each in a pill; a field that draws its own
  // markup (the requirement pills) is already a pill and goes in whole
  el.innerHTML =
    (o.rank ? '<span class="card-rank">' + o.rank + '</span>' : '') +
    headHTML(head) +
    (o.why ? '<p class="card-why">' + esc(o.why) + '</p>' : '') +
    (pills.length ? '<div class="card-req">' + pills.map(x =>
      TYPE[x.f.type].raw ? x.html : pill(x.text, x.f.tone, x.f.note)).join('') + overHTML(pills, 'pill') + '</div>' : '') +
    (facts.length ? '<p class="card-facts">' + [...facts.map(x => x.html), overHTML(facts, 'fact')]
      .filter(Boolean).join(' · ') + '</p>' : '') +
    body.map(x => x.html).join('') + overHTML(body, 'body') +
    (o.invest ? '<div class="card-inv"><span>' + esc(o.invest.label) + '</span><b>' +
      (o.invest.div !== undefined && o.invest.div !== null ? moneyHTML(o.invest.div) : esc(o.invest.note || '')) + '</b></div>' : '') +
    (o.extra || '') +
    '<div class="card-ft">' + (o.action || '') + foot.map(x => x.html).join('') + overHTML(foot, 'foot') +
      '<span class="kind">' + (o.kind || d.one || '') + '</span></div>';
  // the fields whose table is a file of its own: each fills the box it left, once its file is in
  for(const x of [...head, ...pills, ...facts, ...body, ...foot]){
    const t = TYPE[x.f.type];
    if(t.fill) t.fill(el.querySelector('[data-fill="' + x.name + '"]'), it, x.f, o);
  }
  if(o.detail) return el;
  // a card opens its popup; only the gold button in the popup leaves the page
  el.addEventListener('click', e => {
    const mk = e.target.closest('.hlink, .kwmark');   // a marked word: the card it names, not this one
    if(mk){ e.preventDefault(); openMark(mk, {}); return; }
    const sw = e.target.closest('[data-swap]');       // a switch on the card: redraw this card, not the page
    if(sw){ e.preventDefault(); flipSwap(sw.dataset.swap); el.replaceWith(card(it, opts)); return; }
    const src = e.target.closest('.uses-row[data-key]');   // a card named on this one
    if(src){ e.preventDefault(); const c = D.byKey.get(src.dataset.key); if(c) openDetail(c, {}, hrefOf(c)); return; }
    if(e.target.closest('.card-ext, .star, button')) return;
    const link = e.target.closest('.card-link');
    if(link && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;   // new tab still works
    e.preventDefault();
    openDetail(it, opts, o.href);
  });
  if(!o.href) el.addEventListener('keydown', e => {
    if(e.target === el && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openDetail(it, opts, o.href); }
  });
  return el;
}
late.card = card;   // a field type draws a card inside a card through this (frame/seam.js)
