import { D, usageOf } from '../../core/data.js';
import { KIND, holds, FRAME } from '../../kinds.js';
import { iconHTML, trim, isUnit, pxAge, unitHTML, moneyHTML, change, ago, spark } from '../../core/format.js';
import { esc } from '../../core/html.js';
import { lineHTML, reqPills, gemReq, ATTR, richHTML, pill } from '../../frame/types/reqs.js';
import { PLAY } from '../../core/store.js';
import { mechFill, weightedHTML, tableFill, rulesHTML, goldHTML, gemGoldHTML, oddsFill, shareHTML, mechlinesHTML, keyedFill } from '../../frame/types/game.js';
import { addsFill, dangerFill, dropFill, poolFill, fileOf, ESTIMATE } from '../../frame/types/item.js';
import { mkFill } from '../../frame/types/market.js';
import { changedFill, diffFill } from '../../frame/types/patches.js';
import { clarifyFill, reportsFill, swapHTML, ownFill, benchItemHTML, budgetHTML, gearHTML, treeHTML, picksHTML } from '../../frame/types/own.js';
import { flowHTML, offerHTML, askHTML, anointHTML, buildsHref } from '../../frame/types/damage.js';
import { kwChips } from '../../frame/related.js';

/* ---------- the live card ----------
   One layout for everything on the site. The kind says which fields its cards carry, which buttons they
   offer and which related lists they can build (assets/kinds.js); each field says what type it is; and there
   is one function per type below. Nothing here knows what a gem or a unique is, so a new kind — a new
   league's items, a new list — draws a full card with no code of its own.

   opts.full: the popup, where nothing is clipped · opts.invest {label, div, note}: the cost line on build
   cards · opts.rank: the order badge · opts.why: why this card is on screen · opts.without: fields this
   caller leaves off, because the page the card sits on already draws them in full */

/* the Craft tab, opened on this base — or, with no base, on this kind of item. The plan lives in the address
   in words (assets/craft.js): a base belongs to one kind, so a base link needs nothing else. */
const crEnc = s => encodeURIComponent(s).replace(/%20/g, '+');
export const craftHref = (c, b = '', kind = '') => './#/craft?' + (b ? 'base=' + crEnc(b) : 'kind=' + crEnc(kind || c));
/* The forms a gold button can take that a template cannot write: one entry each, named by a kind's "link".
   A whole craft plan is one of them, so a second thing that carries a plan is a second entry and no code. */
const LINKS = {
  /* A card that names an item class: the class itself opens the Craft tab on the whole class, a base item on
     that base. An item class is its own class (KINDS make), which is what tells the two apart. */
  craft: it => !it.cr ? null : it.cr === it.id ? craftHref(it.cr, '', it.n)
    : D.byKey.get('b:' + it.id) === it ? craftHref(it.cr, it.n) : null,
};
/* Where a card's gold button goes: the kind's own "link", with @field filled in from the entry, or one of the
   forms above. A field the entry has nothing for means no link at all, and so does an entry its kind calls
   gone — one with nowhere to go yet (KINDS gone: a currency the catalogue does not list). */
export function hrefOf(it){
  const d = KIND[it.k];
  if(!d || !d.link) return null;
  if(d.gone && holds(it, d.gone)) return null;
  if(LINKS[d.link]) return LINKS[d.link](it);
  let have = true;
  const href = d.link.replace(/@(\w+)/g, (_, f) => {
    if(it[f] === undefined || it[f] === '') have = false;
    return encodeURIComponent(it[f]);
  });
  return have ? href : null;
}
/* an item is something that can be traded, unless its kind says this entry is not one (KINDS notitem: an
   Atlas passive is on the Atlas but is not an item) */
const isItem = it => { const d = KIND[it.k]; return !!(d && d.item) && !(d.notitem && holds(it, d.notitem)); };

/* ---------- one function per field type ----------
   Each answers with the words to draw, or with markup where a field is more than words ("raw"): the slot it
   sits in wraps the rest. A field whose entry says nothing answers with nothing and draws nothing, so one
   declaration covers a full entry and a bare one.
   A type whose table is a file of its own answers with an empty box and a "fill" as well: card() calls it once
   the card is built, and it fills its own box when the file lands. */
export const TYPE = {
  art:    {raw: 1, v: it => iconHTML(it)},
  name:   {raw: 1, v: (it, f, o) => o.href ? '<a class="card-link" href="' + esc(o.href) + '">' + esc(it.n) + '</a>' : esc(it.n)},
  text:   {v: (it, f) => it[f.at] ? (f.pre || '') + it[f.at] + (f.post || '') : ''},
  enum:   {v: (it, f) => (f.of || {})[it[f.at]] || ''},
  flag:   {v: (it, f) => it[f.at] ? f.is : ''},
  number: {v: (it, f) => {
    const n = it[f.at];
    if(n === undefined || n === null || !isFinite(n) || (f.from !== undefined && n < f.from)) return '';
    return (f.pre || '') + n.toLocaleString() + (n === 1 ? (f.post || '') : (f.many || f.post || ''));
  }},
  duration: {v: (it, f) => it[f.at] ? trim(it[f.at] / 1000, 2) + ' s' + (f.post || '') : ''},
  cost:   {v: (it, f) => { const c = it[f.at]; return c ? c[0] + ' ' + c[1] + ' at gem level 20' : ''; }},
  lines:  {raw: 1, v: (it, f) => (it[f.at] || []).map((x, i) =>
    '<span data-mk="' + f.at + ':' + i + '">' + lineHTML(it, f.at, i, x, false) + '</span>').join(' · ')},
  /* px.as: what was really priced, where that is not the item as the card names it — a base item is priced
     white, and a rare of that name is another item at another price. The word goes under the number, so the
     price is never read as the wrong thing. It comes off the price row, so no kind is named here. */
  /* ...and its age right under it, off the price's own time: a price is a reading, and says when it was taken */
  money:  {raw: 1, v: (it, f, o) => !PLAY.px ? '' : isUnit(it)
    ? (u => u && u + pxAge(D.market && D.market.times && D.market.times.currency))(unitHTML()) : o.px && o.px.v !== undefined
    ? '<b>' + moneyHTML(o.px.v) + '</b>' + change(o.px.ch) +
      (o.px.as ? '<span class="card-pxa">' + esc(o.px.as) + '</span>' : '') + pxAge(o.px.at) : ''},
  /* a keyword: how much of the game it touches, from the index's own count. In the popup each count is a door
     to its own Connections group (`go`), which it opens and scrolls to */
  uses:   {raw: 1, v: (it, f, o) => {
    const u = it[f.at] || {}, parts = [];
    for(const [k, one, many] of [['gems','gem','gems'], ['uniques','unique','uniques'], ['passives','passive','passives']]){
      if(!u[k]) continue;
      const words = esc(u[k].toLocaleString() + ' ' + (u[k] === 1 ? one : many)), c = o.full && (f.go || {})[k];
      parts.push(c ? '<a class="fold-go" href="#" data-go="' + esc(c) + '">' + words + '</a>' : words);
    }
    return parts.length ? 'Used by ' + parts.join(', ') : '';
  }},
  /* how many mods can roll on this base item, and who measured how often each one does (tools/carddata.py,
     the numbers the Craft tab works from). */
  weights: {v: (it, f) => {
    const w = it[f.at];
    if(!w) return '';
    const n = (w[0] || 0) + (w[1] || 0);
    if(!n) return '';
    return n.toLocaleString() + ' modifier tiers can roll here' + (w[0] && w[1] ? ' (' + w[0] + ' prefix, ' + w[1] + ' suffix)' : '') +
      (w[2] && D.index.ws ? ' · how often each one rolls: ' + D.index.ws : '');
  }},
  gemreq: {raw: 1, v: (it, f) => {
    if(!it[f.at]) return reqPills([0, 0, 0, 0]);
    const r20 = gemReq(it[f.at], 20), r1 = gemReq(it[f.at], 1);
    const one = 'At gem level 1: ' + (r1[0] ? 'level ' + r1[0] + ', ' : '') +
      ATTR.map((a, i) => r1[i + 1] ? r1[i + 1] + ' ' + a[0] : '').filter(Boolean).join(', ');
    return reqPills(r20, '<span title="' + esc(one) + '">at gem level 20</span>');
  }},
  reqs:   {raw: 1, v: (it, f) => reqPills(it[f.at])},
  rich:   {raw: 1, v: (it, f, o) => {
    const html = richHTML(it, f.at, o.full ? Infinity : (f.lines || FRAME.lines));
    // `label`: the words above the lines, where the lines are one block of several on the card
    return html && f.label ? '<div class="card-blk"><p class="card-facts">' + esc(f.label) + '</p>' + html + '</div>' : html;
  }},
  /* short facts off one object on the entry, each its own pill, in the declaration's order (`of`: what each
     reads, the words before and after it, its tone). A part the entry does not carry draws nothing. */
  pills:  {raw: 1, v: (it, f) => {
    const v = it[f.at];
    if(!v || typeof v !== 'object') return '';
    return (f.of || []).filter(p => v[p.at]).map(p => pill((p.pre || '') + v[p.at] + (p.post || ''), p.tone)).join('');
  }},
  /* Rows of options: each row a choice of one where it offers more than one, drawn side by side, and one
     thing given where it offers one. A row may name where it is, ahead of its options ({w, o}). The grid draws
     FRAME.lines rows and counts the rest; the popup draws all of them. */
  choice: {raw: 1, v: (it, f, o) => {
    const rows = it[f.at];
    if(!Array.isArray(rows) || !rows.length) return '';
    const cap = o.full ? rows.length : FRAME.lines;
    const over = rows.length - cap > FRAME.slack ? rows.length - cap : 0;
    const row = r => {
      const opts = Array.isArray(r) ? r : (r.o || []), w = Array.isArray(r) ? '' : (r.w || '');
      const lead = [opts.length > 1 ? f.pick : '', w].filter(Boolean).join(' · ');
      return '<li>' + (lead ? '<span class="tk-lead">' + esc(lead) + '</span>' : '') +
        opts.map(x => '<span class="tk-o">' + esc(x) + '</span>').join('') + '</li>';
    };
    return '<div class="card-blk">' + (f.label ? '<p class="card-facts">' + esc(f.label) + '</p>' : '') +
      '<ul class="card-take">' + rows.slice(0, over ? cap : rows.length).map(row).join('') +
      (over ? '<li class="more-n">' + esc(FRAME.more(over)) + '</li>' : '') + '</ul></div>';
  }},
  /* Rows of tiers: each which one it is (the first of `lead` the row carries), its lines, and a number beside them
     (the first of `num`). The grid draws FRAME.lines rows and counts the rest; the popup draws all of them. */
  tiers:  {raw: 1, v: (it, f, o) => {
    const rows = it[f.at];
    if(!Array.isArray(rows) || !rows.length) return '';
    const cap = o.full ? rows.length : FRAME.lines;
    const over = rows.length - cap > FRAME.slack ? rows.length - cap : 0;
    const lead = r => { for(const a of f.lead || []) if(r[a] !== undefined && r[a] !== '') return String(r[a]); return ''; };
    const num = r => { for(const x of f.num || []) if(typeof r[x.at] === 'number') return (x.pre || '') + r[x.at].toLocaleString() + (x.post || ''); return ''; };
    return '<div class="card-blk">' + (f.label ? '<p class="card-facts">' + esc(f.label) + '</p>' : '') +
      '<ul class="card-tiers">' + rows.slice(0, over ? cap : rows.length).map((r, j) =>
        '<li><span class="tr-at">' + esc(lead(r)) + '</span><span class="tr-ls">' +
        (r.ls || []).map((x, i) => lineHTML(it, f.at + j + '.', i, x, false)).join('<br>') + '</span>' +
        '<span class="tr-n">' + esc(num(r)) + '</span></li>').join('') +
      (over ? '<li class="more-n">' + esc(FRAME.more(over)) + '</li>' : '') + '</ul></div>';
  }},
  weighted: {raw: 1, fill: mechFill(weightedHTML), v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  /* the same words where the game wrote them as a table: the slot on the left, what it gives there on the
     right. The grid draws four rows the way any list in a slot does, the popup draws all of them, and what
     is not drawn is a count. The right-hand side keeps the game's own middot where a slot gives two things. */
  /* the three steps of an orb's upgrade ladder, side by side. A price column and a level column, because a
     number that moves and a number that does not are two statements (docs/frame.md). A step with no price
     shows no price and no multiple — never a zero, never a stale one. */
  ladder: {raw: 1, v: (it, f) => {
    const lad = it[f.at];
    if(!lad || lad.length < 2) return '';
    const M = (D.market && D.market.items) || {};
    const at = D.market && D.market.updated;
    const px = n => { const r = M['c:' + n]; return r && r.v !== undefined && r.v !== null ? r.v : null; };
    const base = px(lad[0]);
    const step = (name, floor) => {
      const v = px(name), x = v !== null && base ? v / base : null;
      return '<li' + (name === it.n ? ' class="lad-on"' : '') + '>' +
        '<span class="lad-n">' + esc(name) + '</span>' +
        '<span class="lad-p">' + (v !== null ? moneyHTML(v) : '<span class="lad-no">no price today</span>') +
          (x !== null && x >= 1.05 ? '<em>×' + (x >= 100 ? Math.round(x).toLocaleString() : +x.toPrecision(3)) + '</em>' : '') + '</span>' +
        // the same words the bench already uses for the same fact, so the site says it once and one way
        '<span class="lad-f">' + (floor ? 'nothing below modifier level ' + floor : '') + '</span></li>';
    };
    return '<div class="card-lad"><p class="card-facts">' + esc(f.label || '') + '</p><ul>' +
      step(lad[0], 0) + lad.slice(1).map(([n, lv]) => step(n, lv)).join('') + '</ul>' +
      '<p class="card-src">Prices from the in-game Currency Exchange' + (at ? ', checked ' + esc(ago(at)) : '') +
      '. The modifier levels are not in the game’s own words: ' + esc(f.src || '') + '.</p></div>';
  }},
  perslot: {raw: 1, v: (it, f, o) => {
    const vals = it[f.at] || [], at = it[f.beside] || [];
    if(!vals.length) return '';
    const cap = o.full ? vals.length : FRAME.lines;
    const over = vals.length - cap > FRAME.slack ? vals.length - cap : 0;
    return '<ul class="card-slots">' +
      vals.slice(0, over ? cap : vals.length).map((what, i) =>
        '<li><span class="cs-at">' + esc(at[i] || '') + '</span>' +
        '<span class="cs-is" data-mk="' + f.at + ':' + i + '">' + lineHTML(it, f.at, i, what, false) + '</span></li>').join('') +
      (over ? '<li class="more-n">' + esc(FRAME.more(over)) + '</li>' : '') + '</ul>';
  }},
  quote:  {raw: 1, v: (it, f) => it[f.at] ? '<p class="card-fl">' + esc(it[f.at]) + '</p>' : ''},
  options: {raw: 1, v: (it, f, o) => {   // an atlas choice passive: what it lets you pick (in full in the popup)
    const list = it[f.at];
    if(!list || !list.length) return '';
    return '<p class="card-facts">' + (o.full ? 'Choose one:' : list.length + ' options to choose from') + '</p>' +
      (o.full ? '<ul class="card-ls">' + list.map((x, i) =>
        '<li data-mk="' + f.at + ':' + i + '">' + lineHTML(it, f.at, i, x, false) + '</li>').join('') + '</ul>' : '');
  }},
  adds:   {raw: 1, fill: addsFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  danger: {raw: 1, fill: dangerFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  rules:  {raw: 1, fill: tableFill(rulesHTML), v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  gold:   {raw: 1, fill: tableFill(goldHTML), v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  gemgold: {raw: 1, fill: tableFill(gemGoldHTML), v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  /* the outcomes of a weight table, off the entry: each [name, weight, 1 in N, the game's words], heaviest first
     as the entry holds them. The grid draws FRAME.lines rows and counts the rest; the popup draws all of them. A
     weight of 0 has no 1 in N: it is in the table and cannot roll. No price is set beside a chance here: a card
     the outcome names carries its own price under Connections. */
  outcomes: {raw: 1, v: (it, f, o) => {
    const rows = it[f.at];
    if(!Array.isArray(rows) || !rows.length) return '';
    const cap = o.full ? rows.length : FRAME.lines;
    const over = rows.length - cap > FRAME.slack ? rows.length - cap : 0;
    const n = x => (+x).toLocaleString('en');
    return '<div class="card-blk">' + (f.label ? '<p class="card-facts">' + esc(f.label) + '</p>' : '') +
      '<ul class="card-pool">' + rows.slice(0, over ? cap : rows.length).map(([name, w, one, words]) =>
        '<li><span class="pool-ml">' + esc(name) + ((words || []).length
          ? '<span class="pool-tx">' + words.map(esc).join('<br>') + '</span>' : '') + '</span>' +
        '<span class="pool-rs">' + (one > 0 ? '1 in ' + n(one) + ' · ' : '') + 'weight ' + n(w) + '</span></li>').join('') +
      (over ? '<li class="more-n">' + esc(FRAME.more(over)) + '</li>' : '') + '</ul></div>';
  }},
  odds:   {raw: 1, fill: oddsFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  share:  {raw: 1, fill: mechFill(shareHTML), v: (it, f, o, name) => o.full && it.id
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  mechlines: {raw: 1, fill: mechFill(mechlinesHTML), v: (it, f, o, name) => o.full && it.id
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  /* the market files: a pill in the pill slot, a block anywhere else, each filled when its file lands */
  market: {raw: 1, fill: mkFill, v: (it, f, o, name) => !o.full || !it[f.at] ? ''
    : f.slot === 'pill' ? '<span class="pill mk-pill" data-fill="' + esc(name) + '" hidden></span>'
    : '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>'},
  keyed:  {raw: 1, fill: keyedFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<a class="pill pill-src" data-fill="' + esc(name) + '" target="_blank" rel="noopener" hidden></a>' : ''},
  changed: {raw: 1, fill: changedFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox card-chg" data-fill="' + esc(name) + '" hidden></div>' : ''},
  patchdiff: {raw: 1, fill: diffFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox card-chg" data-fill="' + esc(name) + '" hidden></div>' : ''},
  drop:   {raw: 1, fill: dropFill, v: (it, f, o, name) => o.full && it[f.at]
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  pool:   {raw: 1, fill: poolFill, v: (it, f, o, name) => o.full && it[f.at] && fileOf(f, it)
    ? '<div class="card-addsbox" data-fill="' + esc(name) + '" hidden></div>' : ''},
  players: {raw: 1, fill: clarifyFill, v: (it, f, o, name) => o.full
    ? '<div class="card-clar" data-fill="' + esc(name) + '"></div>' : ''},
  heat:   {raw: 1, fill: clarifyFill, v: (it, f, o, name) => o.full
    ? '<div class="card-heat" data-fill="' + esc(name) + '"></div>' : ''},
  reports: {raw: 1, fill: reportsFill, v: (it, f, o, name) => o.full && it.n
    ? '<div class="card-got" data-fill="' + esc(name) + '"></div>' : ''},
  swap:   {raw: 1, v: (it, f, o) => swapHTML(it, f, o.full)},
  flow:   {raw: 1, v: (it, f, o) => flowHTML(it, o.full)},
  source: {raw: 1, v: (it, f) => it[f.at] ? '<p class="card-src">' + esc(it[f.at]) + '</p>' : ''},
  offer:  {raw: 1, v: (it, f, o) => offerHTML(it, f, o.full)},
  ask:    {raw: 1, v: (it, f, o) => askHTML(it, o.full)},
  /* a list of short words. `label`: the words above them, where they are one block of several; `est`: the field
     of the entry naming the ones read off its name alone, which say Estimate beside them */
  tags:   {raw: 1, v: (it, f) => {
    const tags = it[f.at] || [];
    if(!tags.length) return '';
    const est = new Set(f.est ? it[f.est] || [] : []);
    const html = '<p class="card-tags">' + tags.map(g => esc(g) + (est.has(g) ? ESTIMATE : '')).join(' · ') + '</p>';
    return f.label ? '<div class="card-blk"><p class="card-facts">' + esc(f.label) + '</p>' + html + '</div>' : html;
  }},
  anoint: {raw: 1, v: it => anointHTML(it)},
  chips:  {raw: 1, v: (it, f, o) => o.full ? kwChips(it) : ''},
  /* the kind's own module fills this one: the currency tab on the bench, the simulator on a run */
  own:    {raw: 1, fill: ownFill, v: (it, f, o, name) => '<div class="card-own" data-fill="' + esc(name) + '"></div>'},
  /* ---------- the crafting bench ----------
     Three fields that draw a card's own state instead of a row of the index, and take a click. A control
     says what it does in `data-do` and the card's own module answers it (opts.on, through the popup's one
     delegated listener). docs/craft-sim.md, "The bench card and the running card". */
  item:   {raw: 1, v: (it, f) => benchItemHTML(it[f.at])},
  /* the builder's three: a build file's budgets, its gear preview and its tree preview */
  budget: {raw: 1, v: (it, f, o) => budgetHTML(it[f.at], o.full)},
  gear:   {raw: 1, v: (it, f) => gearHTML(it[f.at])},
  tree:   {raw: 1, v: (it, f) => treeHTML(it[f.at])},
  // what is picked to craft with, before a craft is rolling. While one is, the drawer says what is in hand
  picks:  {raw: 1, v: (it, f) => it[f.at] && it[f.at].running ? '' : picksHTML(it[f.at])},
  note:   {raw: 1, v: (it, f) => it[f.at] ? '<p class="card-src bn-note">' + esc(it[f.at]) + '</p>' : ''},
  launch: {raw: 1, v: (it, f) => {
    const p = it[f.at];
    if(!p || p.running) return '';   // a craft already rolling has its own controls; it is not started again
    return '<div class="bn-go">' +
      (p.again ? '<button type="button" class="btn bn-again" data-do="again">' + esc(p.again) + '</button>' : '') +
      '<button type="button" class="btn gold bn-roll" data-do="roll"' + (p.ready ? '' : ' disabled') +
      '>Roll it →</button>' +
      (p.ready ? '' : '<span class="bn-why">' + esc(p.why || '') + '</span>') + '</div>';
  }},
  spark:  {raw: 1, v: (it, f, o) => o.px && !isUnit(it) ? spark(o.px.sp, o.px.ch) : ''},
  thin:   {raw: 1, v: (it, f, o) => o.px && o.px[f.at] !== undefined && o.px[f.at] < f.under
    ? '<span class="use" title="' + esc(f.note) + '">' + esc(f.is) + '</span>' : ''},
  usage:  {raw: 1, v: it => {
    const u = usageOf(it);
    return u === null ? '' : '<span class="use">in ' + (u >= 10 ? Math.round(u) : trim(u, 1)) + '% of builds</span>';
  }},
  builds: {raw: 1, v: (it, f, o) => {
    const bh = o.builds === false ? null : buildsHref(it);
    return bh ? '<a class="card-ext" href="' + esc(bh) + '" target="_blank" rel="noopener" title="Characters in ' +
      esc(D.market.league) + ' that use this, on poe.ninja">Builds ↗</a>' : '';
  }},
};

export { isItem };
