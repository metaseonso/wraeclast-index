/* Wraeclast Index — app shell, live cards, and the search-first home page.
   Data files (see "data" below):
     data/index-core.json, data/index-rest.json   the search index built from the game data (tools/sync.py, tools/appdata.py)
     data/market.json  real prices only: currency from the in-game Currency Exchange, everything else from live
                       trade site listings (worker/prices.js); trends from the site's own daily prices
   Build usage links to poe.ninja's own builds page: their builds API is not open to other sites. */
import {initKeys, setCardKeys} from './keys.js';

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- data ----------
   Two parts each, so the first cards never wait for the whole index (tools/appdata.py):
     data/index-core.json   the uniques and currency cards: all the home page's first cards need
     data/index-rest.json   everything else (gems, passives, keywords, bases, the Atlas)
     data/market.json?part=now    every price, without the day-by-day history (worker/prices.js)
     data/market.json?part=past   the history, for the charts
   `first` is the core with today's prices: the home page's first cards. `ready` is all of it: search, the popups
   and the other tabs wait for it (a moment later; the rest loads while the first cards fly in). */
export const D = { index: null, market: null, usage: null, byKey: new Map(), full: false };   // usage stays empty: see buildsHref
async function getJSON(url, opt, early){
  const r = await (early || fetch(url, opt));   // the browser keeps it for 2 minutes (_headers), then checks for a new one
  if(!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
const EARLY = window.WI_FIRST || {};   // index.html asks for these two before its styles
const CORE = getJSON('data/index-core.json', undefined, EARLY.core);
const NOW = getJSON('data/market.json?part=now', undefined, EARLY.now).catch(() => null);
// the rest starts once the first cards' files are in, so it never slows them down
const AFTER = Promise.all([CORE, NOW]).catch(() => null);
const REST = AFTER.then(() => getJSON('data/index-rest.json', {priority: 'low'}));
// the history, only when the worker split it off (the backup site's market file has no parts: it is all in NOW)
const PAST = AFTER.then(() => NOW).then(m => m && m.part === 'now' ? getJSON('data/market.json?part=past', {priority: 'low'}).catch(() => null) : null);

function prep(it, k, IMGS){   // once per card: its kind, full image link and search words
  if(it._nl !== undefined) return it;
  it.k = k;
  if(it.id === undefined) it.id = it.n;   // the parts leave the id out where it is the name
  if(it.img){ const i = it.img.indexOf(':'), pre = IMGS[it.img.slice(0, i)]; if(pre) it.img = pre + it.img.slice(i + 1); }   // "<server key>:<path>"
  it._nl = it.n.toLowerCase();
  it._hay = [it.n, it.s, it.t, it.q, it.asc, it.reg, (it.ls || []).join(' '), (it.tags || []).join(' '), (it.o || []).join(' ')]
    .filter(Boolean).join(' ').toLowerCase();
  if(k === 'b'){ it.base = it.n; if(it.ls) it.ni = it.ls.length; }   // a base: every line is an implicit
  if(k === 'c') it.nx = true;   // nx: not in the catalogue (yet)
  return it;
}
const MC = new Map();   // the market's own currency cards, made once
/* The index as the pages use it: every card in the index's own order, then the market's currency.
   Without the rest (the first cards), only the core's kinds. */
function assemble(core, rest){
  const IMGS = core.imgs || {}, pool = {}, at = {};
  for(const part of [core, rest]) if(part) for(const [k] of core.order) if(Array.isArray(part[k])){ pool[k] = part[k]; at[k] = 0; }
  const items = [], byKey = new Map();
  for(const [k, n] of core.order){
    const list = pool[k]; if(!list) continue;
    for(let i = 0; i < n && at[k] < list.length; i++){ const it = prep(list[at[k]++], k, IMGS); items.push(it); byKey.set(k + ':' + it.id, it); }
  }
  if(rest) for(const [key, kw] of Object.entries(rest.ckw || {})){ const it = byKey.get(key); if(it) it.kw = kw; }
  const named = new Map();   // atlas and bulk item cards of the index, by name (the market must not repeat them)
  for(const it of items) if(it.k === 'a' || it.k === 'c') named.set(it.n, it);
  const skip = rest ? new Set() : new Set(core.skip || []);   // cards the rest has: their prices wait for it
  const lineage = new Set(core.li || []);   // lineage support gems: the market lists them too (the gem card shows that price)
  // currencies live in the market file; they join the search as their own kind
  const market = D.market;
  if(market && market.items){
    for(const [key, m] of Object.entries(market.items)){
      if(!key.startsWith('c:') || skip.has(m.n)) continue;
      const own = named.get(m.n);
      if(own){ own.nx = false; if(!own.img) own.img = m.ic; continue; }   // the index has it: its card, with the market's price
      let it = MC.get(key);
      if(!it){
        it = {k:'c', id:key.slice(2), n:m.n, s:m.cat || 'Currency', t:m.u || '', img:m.ic, dl:m.dl};
        if(lineage.has(m.n)) it.dup = true;   // kept for the Currency tab; the search shows the gem card
        it._nl = it.n.toLowerCase(); it._hay = (it.n + ' ' + it.s + ' ' + it.t).toLowerCase();
        MC.set(key, it);
      }
      items.push(it); byKey.set('c:' + it.id, it);
    }
  }
  D.index = {v: core.v, gen: core.gen, sprites: core.sprites, imgs: IMGS, kwx: rest ? rest.kwx || {} : {}, items};
  D.byKey = byKey;
}
export const first = (async () => {
  const [core, market] = await Promise.all([CORE, NOW]);
  D.market = market; D.core = core;
  assemble(core, null);
  return D;
})();
export const ready = (async () => {
  let [, rest, past] = await Promise.all([first, REST, PAST]);
  let core = D.core;
  if(rest.id !== core.id){   // two versions (a new one went live between the two files): both again, fresh
    [core, rest] = await Promise.all([getJSON('data/index-core.json', {cache: 'no-cache'}), getJSON('data/index-rest.json', {cache: 'no-cache'})]);
    D.core = core;
  }
  if(past && past.items && D.market && D.market.items)   // the history joins today's prices
    for(const [key, h] of Object.entries(past.items)) if(D.market.items[key]) Object.assign(D.market.items[key], h);
  assemble(core, rest);
  D.full = true;
  return D;
})();
ready.catch(() => { D.failed = true; });

/* ---------- market lookups ---------- */
export function priceOf(it){
  const M = D.market && D.market.items;
  if(!M) return null;
  return M[it.k + ':' + it.id] || M[it.k + ':' + it.n] || (it.k === 'a' || it.li ? M['c:' + it.n] : null) || null;
}
export function usageOf(it){
  const U = D.usage && D.usage[{g:'gems', u:'uniques', p:'passives'}[it.k]];
  return U ? (U[it.n] ?? null) : null;
}

/* ---------- formatting ---------- */
// prices are stored in divine; below one divine they read better in exalted
export function money(div){
  if(div === null || div === undefined || !isFinite(div)) return null;
  const ex = D.market && D.market.rates && D.market.rates.exalted;
  if(div >= 1 || !ex) return {v: div >= 100 ? Math.round(div).toLocaleString() : trim(div, div >= 10 ? 1 : 2), u: 'div'};
  const e = div * ex;
  return {v: e >= 100 ? Math.round(e).toLocaleString() : trim(e, e >= 10 ? 0 : 1), u: 'ex'};
}
function trim(v, dp){ return (+v.toFixed(dp)).toString(); }
export function moneyHTML(div){
  const m = money(div);
  return m ? m.v + '<small>' + m.u + '</small>' : '';
}
export function change(ch){
  if(ch === null || ch === undefined || !isFinite(ch)) return '';
  const r = Math.round(ch);
  const cls = r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
  const arrow = r > 0 ? '▲' : r < 0 ? '▼' : '•';
  return '<span class="chg ' + cls + '" title="Change over the last 7 days">' + arrow + ' ' + Math.abs(r) + '%</span>';
}
export function spark(pts, ch){
  const p = (pts || []).filter(x => x !== null && isFinite(x));
  if(p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1, w = 84, h = 22;
  const xy = p.map((v, i) => [(i / (p.length - 1)) * (w - 2) + 1, h - 2 - ((v - lo) / span) * (h - 4)]);
  const d = xy.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join('');
  const col = ch > 0.5 ? 'var(--pos)' : ch < -0.5 ? 'var(--neg)' : 'var(--faint)';
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d +
    '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
export function ago(iso){
  if(!iso) return '';
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if(m < 1) return 'just now';
  if(m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}

/* ---------- icons ---------- */
function iconHTML(it){
  if(it.img) return '<img src="' + esc(it.img) + '" alt="" loading="lazy" decoding="async">';
  const S = D.index && D.index.sprites;
  if(it.ic && S){
    const sp = it.k === 'u' ? S.uniques : S.gems;
    if(sp){
      const sc = Math.min(34 / sp.cw, 38 / sp.ch), w = sp.cw * sc, h = sp.ch * sc;
      return '<span class="ic" style="width:' + w + 'px;height:' + h + 'px;background-image:url(sprites/' + sp.file +
        ');background-size:' + (sp.w * sc) + 'px ' + (sp.h * sc) + 'px;background-position:' + (-it.ic[0] * w) + 'px ' + (-it.ic[1] * h) + 'px"></span>';
    }
  }
  return '<span class="glyph">' + esc((it.n || '?').replace(/^[^A-Za-z]+/, '').charAt(0)) + '</span>';
}

/* ---------- the live card ---------- */
const KIND = {g:'Gem', u:'Unique', p:'Passive', w:'Keyword', c:'Currency', b:'Base', a:'Atlas'};
const SECTION = {g:'gems', u:'uniques', p:'tree'};
/* the Craft tab, opened on this base (its plan lives in the address, see craft.js) */
export const craftHref = (c, b = '') => './#/craft?s=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({c, b, l: 0, m: []})))));
export function hrefOf(it){
  if(SECTION[it.k]) return 'explore#' + SECTION[it.k] + '=' + encodeURIComponent(it.n);
  if(it.k === 'c') return it.nx ? null : './#/currency?c=' + encodeURIComponent(it.id);   // the Currency tab lists the catalogue
  if(it.k === 'b' && it.cr && D.byKey.get('b:' + it.id) === it) return craftHref(it.cr, it.n);
  if(it.k === 'a' && it.at) return './#/atlas?s=' + it.at + '&q=' + encodeURIComponent(it.n);
  return null;
}
/* ---------- requirements ----------
   Gem level -> character level, and the attribute formula, from the official game data.
   Checked against poe2db on 48 random skill and spirit gems: every value matched.
   Support gems have no requirements. */
export const GEM_LEVELS = [0,3,6,10,14,18,22,26,31,36,41,46,52,58,64,66,72,78,84,90];
export function gemReq(w, gemLevel = 20){
  const lv = GEM_LEVELS[Math.min(gemLevel, 20) - 1];
  const attr = x => x ? Math.floor((5 + (lv - 3) * 1.7) * Math.pow(x / 100, 0.9) + 0.5) + 4 : 0;
  return [lv, attr(w[0]), attr(w[1]), attr(w[2])];
}
const ATTR = [['Str','r'], ['Dex','g'], ['Int','b']];
function reqPills(rq, note){
  if(!rq) return '';
  const out = [];
  if(rq[0] > 1) out.push('<span class="pill">Lv ' + rq[0] + '</span>');
  ATTR.forEach(([a, c], i) => { if(rq[i + 1]) out.push('<span class="pill a-' + c + '">' + rq[i + 1] + ' ' + a + '</span>'); });
  if(!out.length) out.push('<span class="pill">No requirements</span>');
  return out.join('') + (note ? '<span class="pill-note">' + note + '</span>' : '');
}
function reqsOf(it){
  if(it.k === 'g'){
    const lin = it.li ? '<span class="pill lin">Lineage</span>' : '';
    if(!it.w) return lin + '<span class="pill">No requirements</span>';
    const r20 = gemReq(it.w, 20), r1 = gemReq(it.w, 1);
    const one = 'At gem level 1: ' + (r1[0] ? 'level ' + r1[0] + ', ' : '') + ATTR.map((a, i) => r1[i + 1] ? r1[i + 1] + ' ' + a[0] : '').filter(Boolean).join(', ');
    return lin + reqPills(r20, '<span title="' + esc(one) + '">at gem level 20</span>');
  }
  if(it.k === 'u') return reqPills(it.rq) + (it.cor ? '<span class="pill warn">Corrupted</span>' : '');
  if(it.k === 'b') return reqPills(it.rq);
  if(it.k === 'a') return (it.ty ? '<span class="pill">' + ({c: 'Choice', n: 'Notable', s: 'Small'}[it.ty] || '') + '</span>' : '') +
    (it.x > 1 ? '<span class="pill">' + it.x + ' on the tree</span>' : '') + (it.nt ? '<span class="pill warn">' + esc(it.nt) + '</span>' : '');
  if(it.k === 'p'){
    const out = [];
    if(it.asc) out.push('<span class="pill">' + esc(it.asc) + ' ascendancy</span>');
    else if(it.reg) out.push('<span class="pill">' + esc(it.reg) + ' region</span>');
    return out.join('');
  }
  if(it.k === 'c' && it.dl) return '<span class="pill">Drops from area level ' + it.dl + '</span>';
  return '';
}
function factsOf(it){
  const f = [];
  if(it.k === 'g'){
    if(it.ct) f.push(trim(it.ct / 1000, 2) + ' s use time');
    if(it.cost) f.push(it.cost[0] + ' ' + it.cost[1] + ' at gem level 20');
    if(it.sp !== undefined) f.push(it.sp + ' Spirit');
  }
  if((it.k === 'u' || it.k === 'b') && it.pr) f.push(...it.pr);
  if(it.k === 'w' && it.use){
    const u = it.use, parts = [];
    for(const [k, one, many] of [['gems','gem','gems'], ['uniques','unique','uniques'], ['passives','passive','passives']])
      if(u[k]) parts.push(u[k] + ' ' + (u[k] === 1 ? one : many));
    if(parts.length) f.push('Used by ' + parts.join(', '));
  }
  return f.length ? '<p class="card-facts">' + f.map(esc).join(' · ') + '</p>' : '';
}
function linesOf(it, max = 4){
  if(it.ls && it.ls.length){
    if(max === Infinity) return '<ul class="card-ls">' + it.ls.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    const more = it.ls.length - max;
    return '<ul class="card-ls">' + it.ls.slice(0, more > 1 ? max : it.ls.length).map(x => '<li>' + esc(x) + '</li>').join('') +
      (more > 1 ? '<li class="more-n">+' + more + ' more</li>' : '') + '</ul>';
  }
  return it.t ? '<p class="card-tx">' + esc(it.t) + '</p>' : '';
}
function optionsOf(it, full){   // an atlas choice passive: what it lets you pick (in full in the popup)
  if(!it.o || !it.o.length) return '';
  return '<p class="card-facts">' + (full ? 'Choose one:' : it.o.length + ' options to choose from') + '</p>' +
    (full ? '<ul class="card-ls">' + it.o.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
}
function anointOf(it){
  if(!it.rec || !it.rec.length) return '';
  let div = null;
  const M = D.market && D.market.items;
  if(M){   // live: the three Distilled emotions at today's price
    const vals = it.rec.map(n => (M['c:' + n] || M['c:' + n.toLowerCase().replace(/[^a-z]+/g, '-')] || {}).v);
    if(vals.every(v => v !== undefined)) div = vals.reduce((a, b) => a + b, 0);
  }
  if(div === null && it.ac) div = it.ac;
  return '<div class="card-inv"><span title="' + esc(it.rec.join(' + ')) + '">Anoint with 3 emotions</span><b>' +
    (div !== null ? moneyHTML(div) : '') + '</b></div>';
}

/* poe.ninja's builds page, filtered to characters that use this thing (its own link format) */
export function buildsHref(it){
  const lg = D.market && D.market.builds;
  if(!lg) return null;
  const q = v => encodeURIComponent(v).replaceAll('%20', '+');
  let key = null;
  if(it.k === 'g') key = it.w ? 'skills' : 'allskills';
  else if(it.k === 'u') key = 'items';
  else if(it.k === 'p') key = /^Keystone/.test(it.s) || it.asc ? 'keypassives' : (it.rec ? 'anointed' : null);
  return key ? 'https://poe.ninja/poe2/builds/' + lg + '?' + key + '=' + q(it.n) : null;
}

/* The live card. One layout for every object on the site.
   opts.invest {label, div, note}: the cost line on build cards; opts.rank: the order badge */
export function card(it, opts = {}){
  const px = opts.price !== undefined ? opts.price : priceOf(it);
  const use = usageOf(it);
  const href = opts.href !== undefined ? opts.href : hrefOf(it);
  const bh = opts.builds === false ? null : buildsHref(it);
  const el = document.createElement('article');
  el.className = 'card k-' + it.k + (href ? ' linked' : '');
  if(!href) el.tabIndex = 0;
  const req = reqsOf(it);
  const title = href ? '<a class="card-link" href="' + esc(href) + '">' + esc(it.n) + '</a>' : esc(it.n);
  el.innerHTML =
    (opts.rank ? '<span class="card-rank">' + opts.rank + '</span>' : '') +
    '<div class="card-hd"><span class="card-ic">' + iconHTML(it) + '</span>' +
      '<div class="card-id"><h3>' + title + '</h3><p class="card-sub">' + esc(it.s || '') + '</p></div>' +
      (px && px.v !== undefined ? '<div class="card-px"><b>' + moneyHTML(px.v) + '</b>' + change(px.ch) + '</div>' : '') +
    '</div>' +
    (opts.why ? '<p class="card-why">' + esc(opts.why) + '</p>' : '') +
    (req ? '<div class="card-req">' + req + '</div>' : '') +
    factsOf(it) +
    linesOf(it, opts.full ? Infinity : 4) + optionsOf(it, opts.full) +
    (it.tags ? '<p class="card-tags">' + it.tags.map(esc).join(' · ') + '</p>' : '') +
    anointOf(it) +
    (opts.invest ? '<div class="card-inv"><span>' + esc(opts.invest.label) + '</span><b>' +
      (opts.invest.div !== undefined && opts.invest.div !== null ? moneyHTML(opts.invest.div) : esc(opts.invest.note || '')) + '</b></div>' : '') +
    (opts.extra || '') +
    '<div class="card-ft">' + (opts.action || '') + (px ? spark(px.sp, px.ch) : '') +
      (use !== null ? '<span class="use">in ' + (use >= 10 ? Math.round(use) : trim(use, 1)) + '% of builds</span>' : '') +
      (px && px.ls !== undefined && px.ls < 3 ? '<span class="use" title="Only a few listed">few listed</span>' : '') +
      (bh ? '<a class="card-ext" href="' + esc(bh) + '" target="_blank" rel="noopener" title="Characters in ' +
        esc(D.market.league) + ' that use this, on poe.ninja">Builds ↗</a>' : '') +
      '<span class="kind">' + (opts.kind || KIND[it.k] || '') + '</span></div>';
  if(opts.detail) return el;
  // a card opens its popup; only the gold button in the popup leaves the page
  el.addEventListener('click', e => {
    if(e.target.closest('.card-ext, .star, button')) return;
    const link = e.target.closest('.card-link');
    if(link && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) return;   // new tab still works
    e.preventDefault();
    openDetail(it, opts, href);
  });
  if(!href) el.addEventListener('keydown', e => {
    if(e.target === el && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openDetail(it, opts, href); }
  });
  return el;
}

/* ---------- the popup ----------
   Every card opens here first. The gold button is the one way on to the drill-down page.

   The trail: the cards you have opened, in order, exactly like a browser's own back and forward.
   TRAIL holds a step per card (the card, how it was opened, and where you had scrolled it); AT says
   which step is on show. Every open pushes one history entry carrying that step's id, so the phone's
   Back and Forward both land on a real step and nothing dead is left behind. Opening a card from the
   middle of the trail drops the steps after it. Step 51 drops the oldest one. */
const PLACE = {g: 'Gems', u: 'Uniques', p: 'Passive tree', c: 'Currency', b: 'Craft', a: 'Atlas'};
const typing = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);   // same guard as keys.js
const TAP = 10;   // px a finger may slide and still count as a tap, not a drag
const TRAIL_MAX = 50;   // cards kept on the trail; all of it is in this browser, so nothing is paid for it
let OV = null, lastFocus = null;
let TRAIL = [], AT = -1, SEQ = 0, PEND = null;   // the trail, where you are on it, the next step id, a card still loading
const CUR = () => TRAIL[AT] || null;   // the card on show
const focusBox = () => OV.querySelector('.ov-box').focus({preventScroll: true});
function bigLine(vals, label){
  const p = vals.filter(v => v !== null && isFinite(v));
  if(p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1, w = 300, h = 64;
  const d = p.map((v, i) => (i ? 'L' : 'M') + ((i / (p.length - 1)) * (w - 4) + 2).toFixed(1) + ' ' + (h - 4 - ((v - lo) / span) * (h - 8)).toFixed(1)).join('');
  const up = p[p.length - 1] >= p[0];
  return '<figure class="chart"><figcaption>' + label + '</figcaption><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + d + '" fill="none" stroke="' + (up ? 'var(--pos)' : 'var(--neg)') + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg></figure>';
}
function detailExtras(it, px){
  if(!px) return '';
  let out = '';
  if(px.h && px.h.length > 3){
    const lo = money(Math.min(...px.h.map(x => x[1]))), hi = money(Math.max(...px.h.map(x => x[1])));
    out += bigLine(px.h.map(x => x[1]), 'Since ' + px.h[0][0] + ' \u00b7 low ' + lo.v + ' ' + lo.u + ', high ' + hi.v + ' ' + hi.u);
  } else if(px.sp) out += bigLine(px.sp, 'Last 7 days');
  const facts = [];
  // where the price comes from, and when it was checked
  if(px.src === 'trade') facts.push((px.ls || 0).toLocaleString() + ' listed on the trade site' + (px.at ? ' \u00b7 checked ' + ago(px.at) : ''));
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
    // the bar sits inside the scroll box, so Back, Forward and Close never scroll away
    OV.innerHTML = '<div class="ov-scrim"></div><div class="ov-box" role="dialog" aria-modal="true" aria-label="Details" tabindex="-1">' +
      '<div class="ov-nav" hidden><button type="button" class="ov-back">← <span class="ov-nm">Back</span></button>' +
      '<span class="ov-at"></span><button type="button" class="ov-fwd">→</button>' +
      '<button type="button" class="ov-x" aria-label="Close">✕</button></div>' +
      '<div class="ov-body"></div></div>';
    document.body.appendChild(OV);
    scrimTap();
    OV.addEventListener('click', e => {
      const t = e.target;
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
      const kw = t.closest('.kwlink');
      if(kw){ const c = keywordCard(kw.dataset.kw); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const row = t.closest('.uses-row[data-key]');
      if(row){ const c = D.byKey.get(row.dataset.key); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const tab = t.closest('.uses-tab');
      if(tab){ const sec = tab.closest('.uses'); sec.dataset.on = tab.dataset.g; paintUses(sec); return; }
      const cur = CUR();
      if(t.closest('.fullstats') && cur && cur.opts.onFull){ const f = cur.opts.onFull; closeDetail(); setTimeout(f, 60); }
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
      if(OV.hidden || OV.contains(e.target)) return;
      focusBox();
    });
    addEventListener('popstate', () => {
      const id = (history.state || {}).ov;
      const cur = CUR();
      if(!OV.hidden && cur) cur.top = OV.querySelector('.ov-box').scrollTop;   // remember the card we are leaving
      const i = id ? TRAIL.findIndex(s => s.id === id) : -1;
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
/* the same popup for anything else (e.g. the Suggest box): no card, so no trail */
export function openBox(node, label = 'Details'){
  ensureOV();
  TRAIL = []; AT = -1;
  OV.querySelector('.ov-box').setAttribute('aria-label', label);
  OV.querySelector('.ov-nav').hidden = true;
  OV.querySelector('.ov-body').replaceChildren(node);
  showOV();
  history.pushState({ov: 0, d: 1}, '', location.href);   // ov 0: not a card. Back closes it
}
/* opts.nested: opened from inside the popup (a keyword, or something that uses it).
   opts.onFull: the drill-down page's own full-stats panel, offered as a button. */
export function openDetail(it, opts = {}, href){
  if(!D.full && !D.failed){
    // its keywords and history: a moment away. A second tap while it loads takes over, so one tap, one card
    const mine = PEND = {};
    const go = () => { if(PEND !== mine) return; PEND = null; openDetail(it, opts, href); };
    ready.then(go, go);
    return;
  }
  PEND = null;
  ensureOV();
  const cur = CUR();
  let d = 1;
  if(!OV.hidden && cur){
    cur.top = OV.querySelector('.ov-box').scrollTop;   // where you had scrolled the card you are leaving
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
function paintStep(){
  const {it, opts, href, top} = CUR();
  const box = OV.querySelector('.ov-box');
  box.setAttribute('aria-label', 'Details');
  const px = opts.price !== undefined ? opts.price : priceOf(it);
  const body = OV.querySelector('.ov-body');
  const c = card(it, {...opts, href: null, rank: undefined, full: true, detail: true, extra: (opts.extra || '') + detailExtras(it, px)});
  c.classList.add('detail');
  body.replaceChildren(c);
  const chips = kwChips(it);
  if(chips) body.insertAdjacentHTML('beforeend', chips);
  const uses = usesSection(it);
  if(uses) body.appendChild(uses);
  const tradeable = /^[ugcb]$/.test(it.k) || (it.k === 'a' && it.at !== 'tree');   // atlas passives are not items
  if((href && PLACE[it.k]) || tradeable || opts.onFull){
    const row = document.createElement('div');
    row.className = 'ov-go';
    row.innerHTML = (tradeable ? '<button type="button" class="btn ttoggle" aria-expanded="false">Trade</button>' : '') +
      (opts.onFull ? '<button type="button" class="btn fullstats">Full stats</button>' : '') +
      (href && PLACE[it.k] ? '<a class="btn gold" href="' + esc(href) + '">Open in ' + PLACE[it.k] + ' \u2192</a>' : '');
    body.appendChild(row);
    const tb = row.querySelector('.ttoggle');
    if(tb) tb.addEventListener('click', async () => {
      const open = body.querySelector('.trade');
      if(open){ open.remove(); tb.setAttribute('aria-expanded', 'false'); return; }
      tb.disabled = true;
      try {
        const {tradePanel} = await import('./trade.js');
        body.appendChild(await tradePanel(it));
        tb.setAttribute('aria-expanded', 'true');
        row.scrollIntoView({block: 'start'});   // the panel opens below the fold: show it, with the button above it
      } finally { tb.disabled = false; }
    });
  }
  paintNav();
  box.scrollTop = top || 0;   // back to where you had this card
  const on = document.activeElement;
  if(!on || !box.contains(on) || on.disabled) focusBox();   // the button under the finger may have just gone
}
/* the bar: where you are, the card behind you, the card ahead */
function paintNav(){
  const nav = OV.querySelector('.ov-nav');
  nav.hidden = AT < 0;
  if(nav.hidden) return;
  const back = nav.querySelector('.ov-back'), fwd = nav.querySelector('.ov-fwd'), at = nav.querySelector('.ov-at');
  const prev = TRAIL[AT - 1], next = TRAIL[AT + 1];
  back.disabled = !prev;
  back.querySelector('.ov-nm').textContent = prev ? prev.it.n : 'Back';
  back.setAttribute('aria-label', prev ? 'Back to ' + prev.it.n : 'Back');
  fwd.disabled = !next;
  fwd.setAttribute('aria-label', next ? 'Forward to ' + next.it.n : 'Forward');
  at.textContent = TRAIL.length > 1 ? (AT + 1) + '/' + TRAIL.length : '';
}
function showOV(){
  if(!OV.hidden) return;
  lastFocus = document.activeElement;
  OV.hidden = false;
  document.body.classList.add('ov-open');
  focusBox();
}
function hideDetail(){
  if(!OV || OV.hidden) return;
  OV.hidden = true;
  document.body.classList.remove('ov-open');
  if(lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus({preventScroll: true});   // back on the row that opened it
}
// Close means closed: every entry the popup pushed is unwound, so one more Back leaves the page
function closeDetail(){
  const d = (history.state || {}).d || 0;
  if(d) history.go(-d); else hideDetail();   // popstate hides it
}
// the card's own keys, in the keybindings sheet (assets/keys.js) like every other shortcut
setCardKeys(id => {
  if(!OV || OV.hidden || AT < 0) return false;
  if(id === 'cardback'){ if(AT < 1) return false; history.back(); return true; }
  if(id === 'cardfwd'){ if(AT >= TRAIL.length - 1) return false; history.forward(); return true; }
  if(id === 'cardclose'){ closeDetail(); return true; }
  return false;
});

/* ---------- keywords: what uses what ----------
   Every gem, unique, passive and keyword lists the keywords its game text marks (data/index.json "kw": the chips).
   A keyword's card turns that around with data/kwuse.json (tools/kwuse.py, loaded the first time a keyword opens):
   everything that uses it, from every source (the game's markup and the keyword's words in plain text), each
   list in alphabetical order and in full. Anything with a card opens it (gems, uniques, passives, bases, essences,
   atlas things, currency, keywords); small passives and crafting mods are plain rows; other atlas rows and item kinds
   link to their tab. */
let KWUSE = null;
const SEC = {g: 'gems', u: 'uniques', p: 'tree'};
function kwUse(){
  if(!KWUSE) KWUSE = getJSON('data/kwuse.json').catch(() => { KWUSE = null; return null; });
  return KWUSE;
}
export function keywordCard(id){
  const name = D.index.kwx && D.index.kwx[id];   // a keystone stands for its own keyword
  return D.byKey.get('w:' + id) || (name && D.index.items.find(x => x.k === 'p' && x.n === name)) || null;
}
function keywordIdOf(it){
  if(it.k === 'w') return it.id;
  if(it.k === 'p' && D.index.kwx) for(const [k, n] of Object.entries(D.index.kwx)) if(n === it.n) return k;
  return null;
}
function kwChips(it){
  const own = keywordIdOf(it);
  const ids = (it.kw || []).filter(k => k !== own && keywordCard(k));
  if(!ids.length) return '';
  return '<div class="kwchips"><span class="lbl">Keywords</span>' + ids.map(k =>
    '<button type="button" class="chip kwlink" data-kw="' + esc(k) + '">' + esc(keywordCard(k).n) + '</button>').join('') + '</div>';
}
const USE_KINDS = [['u', 'Uniques'], ['g', 'Gems'], ['p', 'Passives'], ['b', 'Bases'], ['e', 'Essences'], ['a', 'Atlas'],
  ['m', 'Crafting'], ['c', 'Currency'], ['w', 'Keywords']];
const USE_FILTER = 30;   // a list longer than this gets a filter box
const USE_TAB = new Map();   // keyword -> the tab last shown
function usesSection(it){
  const id = keywordIdOf(it);
  if(!id) return null;
  const sec = document.createElement('section');
  sec.className = 'uses';
  sec._id = id;
  paintUses(sec);
  kwUse().then(U => {
    sec._g = U ? useGroups(U, U.k[id] || {}) : 'err';
    const was = USE_TAB.get(id);   // Back to this keyword: the tab it was on
    if(U) sec.dataset.on = was && sec._g[was].length ? was : (USE_KINDS.find(([k]) => sec._g[k].length) || ['u'])[0];
    paintUses(sec);
  });
  return sec;
}
/* the rows of each group, in the file's order: {html, h: the words the filter box searches} */
function useGroups(U, e){
  const card = key => D.byKey.get(key);
  const times = n => n > 1 ? ' <span class="uses-x">\u00d7' + n + '</span>' : '';   // how many of it are on the tree
  const cardRow = (x, sub, n, more = '') => { const p = priceOf(x);   // more: extra lines under the sub line (they wrap)
    return '<button type="button" class="uses-row' + (more ? ' uses-wrap' : '') + '" data-key="' + esc(x.k + ':' + x.id) + '">' +
      '<span class="uses-ic">' + iconHTML(x) + '</span>' +
      '<span class="uses-t"><b>' + esc(x.n) + times(n) + '</b><span>' + esc(sub) + '</span>' + more + '</span>' +
      (p && p.v !== undefined ? '<span class="uses-px">' + moneyHTML(p.v) + '</span>' : '') + '</button>'; };
  const plainRow = (name, sub, o = {}) => '<div class="uses-row uses-plain' + (o.wrap ? ' uses-wrap' : '') + '" title="' + esc(o.title || sub) + '">' +
    (o.ic ? '<span class="uses-ic"></span>' : '') + '<span class="uses-t"><b>' + esc(name) + times(o.n) + '</b><span>' + esc(sub) + '</span>' +
    (o.more || '') + '</span></div>';
  const row = (html, ...h) => ({html, h: h.filter(Boolean).join(' ').toLowerCase()});
  const G = {};   // a card row is found by anything its card says (name, lines, tags), as in the search
  G.u = (e.u || []).map(id => card('u:' + id)).filter(Boolean).map(x => row(cardRow(x, x.s || ''), x._hay));
  G.g = (e.g || []).map(id => card('g:' + id)).filter(Boolean).map(x => row(cardRow(x, x.s || ''), x._hay));
  G.p = (e.p || []).map(x => {
    if(typeof x !== 'number'){   // a card: its id, or [id, how many of it are on the tree]
      const [id, k] = Array.isArray(x) ? x : [x, 1], c = card('p:' + id), r = c && row(cardRow(c, c.s || '', k), c._hay);
      if(r) r.n = k;
      return r;
    }
    const [n, t, k, where] = U.sp[x] || [];   // a small passive: one row, counted each time it is on the tree
    const sub = t + (where ? ' \u00b7 ' + where : '');
    const r = n && row(plainRow(n, sub, {ic: 1, n: k, title: sub + ' \u00b7 ' + k + ' on the tree'}), n, t, where, 'small passive');
    if(r) r.n = k;
    return r;
  }).filter(Boolean);
  G.b = (e.b || []).map(id => card('b:' + id)).filter(Boolean).map(x => row(cardRow(x, x.s || ''), x._hay));
  G.e = (e.e || []).map(i => { const [n, line, kinds] = (U.es || [])[i] || [];   // an essence and the mod it guarantees
    const c = n && card('c:' + n), names = (kinds || []).map(k => U.ck[k] || k).join(', ');
    return n && row(c ? cardRow(c, line, 0, '<span class="uses-kinds">' + esc(names) + '</span>')
      : plainRow(n, line, {ic: 1, wrap: 1, title: line + ' \u00b7 ' + names, more: '<span class="uses-kinds">' + esc(names) + '</span>'}), n, line, names); }).filter(Boolean);
  G.a = (e.a || []).map(([i, line]) => { const [s, n, what, key] = U.at[i] || [];
    const c = key && card(key);   // an atlas thing with a card opens it; the rest open the Atlas tab
    if(c) return row(cardRow(c, what + ' \u00b7 ' + line), n, what, line);
    return n && row('<a class="uses-row uses-go" href="./#/atlas?s=' + esc(s) + '&q=' + encodeURIComponent(n) + '" title="' + esc(line) + '">' +
      '<span class="uses-t"><b>' + esc(n) + '</b><span>' + esc(what) + ' \u00b7 ' + esc(line) + '</span></span></a>', n, what, line); }).filter(Boolean);
  G.m = (e.m || []).map(i => { const [line, what, kinds] = U.cr[i] || [];
    const names = (kinds || []).map(c => U.ck[c] || c);
    return line && row(plainRow(line, what, {title: line + ' \u00b7 ' + what + ' \u00b7 ' + names.join(', '),
      more: '<span class="uses-kinds">' + (kinds || []).map((c, j) => '<a class="uses-go" href="' + craftHref(c) + '">' + esc(names[j]) + '</a>').join(', ') + '</span>'}),
      line, what, names.join(' ')); }).filter(Boolean);
  G.c = (e.c || []).map(i => { const [n, cat, t] = U.cu[i] || [];
    const c = card('c:' + n);   // a card when the market lists it
    return n && row(c ? cardRow(c, cat + ' \u00b7 ' + t) : plainRow(n, cat + ' \u00b7 ' + t, {ic: 1}), n, cat, t); }).filter(Boolean);
  G.w = (e.w || []).map(k => { const c = keywordCard(k);
    return c ? row(cardRow(c, c.k === 'w' ? 'Keyword' : c.s || ''), c._hay)
      : U.kn && U.kn[k] ? row(plainRow(U.kn[k], 'Keyword'), U.kn[k]) : null; }).filter(Boolean);
  return G;
}
function paintUses(sec){
  const G = sec._g, ok = G && G !== 'err', on = sec.dataset.on, list = ok ? G[on] : null;
  if(ok) USE_TAB.set(sec._id, on);
  const count = k => G[k].reduce((a, x) => a + (x.n || 1), 0);   // passives: every one on the tree
  const tabs = USE_KINDS.map(([k, l]) => '<button type="button" class="chip uses-tab" data-g="' + k + '" aria-pressed="' + (k === on) + '"' +
    (ok ? '' : ' disabled') + (ok && count(k) !== G[k].length ? ' title="' + count(k) + ' on the tree, ' + G[k].length + ' different"' : '') + '>' +
    l + ' <span class="ct">' + (ok ? count(k).toLocaleString() : G ? '\u2013' : '\u2026') + '</span></button>').join('');
  let rows;
  if(G === 'err') rows = '<p class="note">Could not load this list. Try again in a minute.</p>';
  else if(!list) rows = '<p class="note">Looking\u2026</p>';
  else if(!list.length) rows = '<p class="note">Nothing here uses it.</p>';
  else rows = list.map(x => x.html).join('');
  const kind = {u: 'uniques', g: 'gems', p: 'passives', b: 'bases', e: 'essences', a: 'atlas entries', m: 'mods', c: 'items', w: 'keywords'}[on] || '';
  const filter = list && list.length > USE_FILTER ? '<input class="uses-q" type="search" autocomplete="off" spellcheck="false" placeholder="Filter ' +
    kind + '\u2026" aria-label="Filter the ' + kind + '">' : '';
  const here = /explore/.test(location.pathname) ? '' : 'explore';   // on the drill-down already: stay on the page
  const all = SEC[on] ? '<a class="btn gold" href="' + here + '#' + SEC[on] + '?kw=' + encodeURIComponent(sec._id) + '">See all in ' +
    {g: 'Gems', u: 'Uniques', p: 'Passive tree'}[on] + ' \u2192</a>' : '';
  sec.innerHTML = '<h4>Found on</h4><div class="uses-tabs">' + tabs + '</div>' + filter + '<div class="uses-list">' + rows + '</div>' +
    '<p class="note uses-none" hidden>Nothing matches.</p>' + (all && list && list.length ? '<div class="uses-all">' + all + '</div>' : '');
  const q = sec.querySelector('.uses-q');
  if(q) q.addEventListener('input', () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean), els = sec.querySelector('.uses-list').children;
    let shown = 0;
    list.forEach((x, i) => { const hit = words.every(w => x.h.includes(w)); els[i].hidden = !hit; shown += hit; });
    sec.querySelector('.uses-none').hidden = shown > 0;
  });
}

/* Render a list of cards into a grid. Cards that stay glide to their new place, new cards fly in,
   and cards that leave fade out where they stood (FLIP, Web Animations API). */
export function flow(grid, list, make){
  const before = new Map();
  for(const c of grid.children) if(c.dataset.key) before.set(c.dataset.key, c.getBoundingClientRect());
  const gridBox = grid.getBoundingClientRect();
  const old = new Map([...grid.children].filter(c => c.dataset.key).map(c => [c.dataset.key, c]));
  const nodes = list.map(x => {
    let n = old.get(x.key);
    if(n) old.delete(x.key);
    else { n = make(x); n.dataset.key = x.key; n._fresh = true; }
    return n;
  });
  const leaving = [...old.values()];
  grid.replaceChildren(...nodes);
  if(reduceMotion) return;
  // ghosts for cards that left, so they fade where they were instead of vanishing
  leaving.slice(0, 12).forEach(n => {
    const r = before.get(n.dataset.key); if(!r) return;
    Object.assign(n.style, {position:'absolute', left:(r.left - gridBox.left) + 'px', top:(r.top - gridBox.top) + 'px',
      width:r.width + 'px', height:r.height + 'px', margin:0, pointerEvents:'none', zIndex:0});
    grid.appendChild(n);
    n.animate([{opacity:1, transform:'none'}, {opacity:0, transform:'scale(.96)'}], {duration:180, easing:'ease-in'})
      .onfinish = () => n.remove();
  });
  let k = 0;
  nodes.forEach(n => {
    if(n._fresh){
      n._fresh = false;
      n.animate([{opacity:0, transform:'translateY(18px) scale(.97)'}, {opacity:1, transform:'none'}],
        {duration:420, delay:Math.min(k++, 16) * 24, easing:'cubic-bezier(.2,.8,.2,1)', fill:'backwards'});
    } else {
      const a = before.get(n.dataset.key), b = n.getBoundingClientRect();
      if(!a) return;
      const dx = a.left - b.left, dy = a.top - b.top;
      if(Math.abs(dx) > 1 || Math.abs(dy) > 1)
        n.animate([{transform:'translate(' + dx + 'px,' + dy + 'px)'}, {transform:'none'}],
          {duration:420, easing:'cubic-bezier(.2,.8,.2,1)'});
    }
  });
}

/* ---------- search ---------- */
const KINDS = [['all','All'], ['g','Gems'], ['u','Uniques'], ['p','Passives'], ['b','Bases'], ['a','Atlas'], ['c','Currency'], ['w','Keywords']];
export function search(q, kind = 'all'){
  const qs = q.trim().toLowerCase();
  const toks = qs.split(/\s+/).filter(Boolean);
  const out = [];
  if(!toks.length) return out;
  const wordStart = new RegExp('(^|[^a-z0-9])' + qs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for(const it of D.index.items){
    if((kind !== 'all' && it.k !== kind) || it.dup) continue;
    let s = 0, ok = true;
    for(const t of toks){
      if(it._nl.includes(t)) s += 40;
      else if(it._hay.includes(t)) s += 8;
      else { ok = false; break; }
    }
    if(!ok) continue;
    if(it._nl === qs) s += 1000;
    else if(it._nl.startsWith(qs)) s += 600;
    else if(wordStart.test(it._nl)) s += 380;
    else if(it._nl.includes(qs)) s += 220;
    if(it.k === 'w') s -= 25;                       // glossary entries rank below the things they describe
    if(priceOf(it)) s += 12;
    const u = usageOf(it); if(u) s += Math.min(40, u * 2);
    out.push({it, s: s - it.n.length * 0.2});
  }
  out.sort((a, b) => b.s - a.s);
  return out.map(x => x.it);
}

/* biggest price moves this week, for the empty home page */
function movers(){
  const M = D.market && D.market.items;
  if(!M) return [];
  const list = [];
  for(const it of D.index.items){
    const m = M[it.k + ':' + it.id] || M[it.k + ':' + it.n];
    if(!m || m.ch === undefined || m.ch === null) continue;
    if(it.k === 'u' && (m.ls ?? 0) < 10) continue;   // thin markets swing on one listing
    if(it.k === 'c' && (m.vol ?? 0) < 1) continue;
    list.push({it, s: Math.abs(m.ch) * Math.log10(10 + (m.ls ?? m.vol ?? 10))});
  }
  list.sort((a, b) => b.s - a.s);
  return list.map(x => x.it);
}

/* ---------- home view ---------- */
const PAGE = 30;   // cards added each time the list reaches the bottom of the screen
const H = {q:'', kind:'all', shown:PAGE, list:[]};
function homeInit(){
  const q = $('#q'), kinds = $('#kinds');
  if(!kinds.children.length) kinds.innerHTML = KINDS.map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === 'all') + '">' + l + '<span class="ct"></span></button>').join('');
  kinds.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    H.kind = b.dataset.k; H.shown = PAGE;
    [...kinds.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    homeRender(); q.focus();
  });
  q.addEventListener('input', () => { H.q = q.value; H.shown = PAGE; homeRender(); syncHash(); });
  q.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ q.value = ''; H.q = ''; homeRender(); syncHash(); }
    if(e.key === 'Enter'){ const first = $('#cards .card .card-link'); if(first) first.click(); }
  });
  // endless list: when the bottom comes into view, the next 30 cards fly in
  const more = $('#more');
  more.addEventListener('click', () => { H.shown += PAGE; homeRender(); });
  new IntersectionObserver(es => {
    if(es.some(e => e.isIntersecting) && !more.hidden && route() === 'home'){ H.shown += PAGE; homeRender(); }
  }, {rootMargin: '600px 0px'}).observe(more);
}
function syncHash(){
  const h = H.q ? '#/?q=' + encodeURIComponent(H.q) : '#/';
  if(location.hash !== h) history.replaceState(null, '', h);
}
function homeRender(){
  const hero = $('#hero'), status = $('#status'), more = $('#more');
  const has = H.q.trim().length > 0;
  hero.classList.toggle('docked', has);
  let list, label;
  if(has && !D.full && !D.failed){   // search covers everything: it waits for the rest of the index, a moment
    status.textContent = 'Loading…';
    for(const b of $('#kinds').children) b.querySelector('.ct').textContent = '';
    $('#quote').hidden = true; more.hidden = true;
    flow($('#cards'), [], null);
    if(!H.waiting){ H.waiting = true; ready.then(() => { H.waiting = false; if(route() === 'home') homeRender(); }, () => {}); }
    return;
  }
  if(has){
    const all = search(H.q, 'all');
    const counts = {all: all.length};
    for(const it of all) counts[it.k] = (counts[it.k] || 0) + 1;
    for(const b of $('#kinds').children) b.querySelector('.ct').textContent = counts[b.dataset.k] || 0;
    list = H.kind === 'all' ? all : all.filter(it => it.k === H.kind);
    label = list.length ? '<b>' + list.length.toLocaleString() + '</b> match' + (list.length === 1 ? '' : 'es') : '';
  } else {
    for(const b of $('#kinds').children) b.querySelector('.ct').textContent = '';
    list = movers().filter(it => H.kind === 'all' || it.k === H.kind);
    label = list.length ? 'Biggest price moves this week' + (D.market ? ' · ' + esc(D.market.league) : '') : 'Start typing to search.';
  }
  status.innerHTML = label;
  $('#cards').classList.remove('wait');   // the first cards are in: the grid takes its own height
  $('#quote').hidden = has || !list.length;
  const shown = list.slice(0, H.shown);
  flow($('#cards'), shown.map(it => ({key: it.k + ':' + it.id, it})), x => card(x.it));
  more.hidden = list.length <= H.shown;
  if(has && !list.length){
    $('#cards').innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing matches</h3><p>Try fewer words.</p></div>';
  }
}

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
  q.addEventListener('input', async () => {
    await ready;
    if(!q.value.trim()){ close(); return; }
    const all = search(q.value);
    total = all.length; rows = all.slice(0, 10); sel = 0; paint();
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
import('./suggest.js').then(m => m.mountSuggest()).catch(() => {});   // the Suggest button, on every page
import('./notes.js').then(m => m.mountNotes()).catch(() => {});       // Patch notes, on every page
import('./support.js').then(m => m.mountSupport()).catch(() => {});   // Support link, once data/support.json is filled in
import('./track.js').then(m => m.mountTrack()).catch(() => {});       // page views and clicks for the owner's dashboard

/* ---------- router ---------- */
function route(){ const m = location.hash.match(/^#\/(\w+)/); return m ? m[1] : 'home'; }
export function params(){ const i = location.hash.indexOf('?'); return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : ''); }
const loaded = {};
async function show(){
  const r = ['home', 'build', 'currency', 'trade', 'farms', 'atlas', 'bosses', 'craft'].includes(route()) ? route() : 'home';
  document.body.dataset.route = r;
  document.querySelectorAll('.view').forEach(v => v.hidden = v.dataset.view !== r);
  document.querySelectorAll('.tabs a[data-route]').forEach(a => { if(a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  if(r === 'home'){
    await first;   // the core and today's prices: the first cards (search waits for the rest itself)
    const q = params().get('q') || '';
    if(q !== H.q){ H.q = q; $('#q').value = q; }
    homeRender();
    if(!matchMedia('(pointer:coarse)').matches) $('#q').focus({preventScroll:true});
  } else {
    await ready;
    if(!loaded[r]) loaded[r] = import('./' + ({trade: 'tradepage'}[r] || r) + '.js').then(m => m.mount($('#view-' + r)));
    const m = await loaded[r];
    if(m && m.update) m.update();
  }
}

/* ---------- boot ----------
   The drill-down page imports this module for the top search and the popup only. */
const IS_APP = !!document.getElementById('view-home');
if(IS_APP){
homeInit();
mountTopSearch(document.getElementById('topsearch'));
addEventListener('hashchange', show);
show();
const failed = err => { $('#status').innerHTML = '<span class="err">Could not load the index: ' + esc(err.message) + '</span>'; };
first.then(() => {
  // the client build (4.5.5.2) as players know it: patch 0.5.5
  $('#gamever').textContent = (D.index.v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');
  const st = $('#stamp');
  st.classList.remove('wait');
  // the real age of the data behind the prices (worker/prices.js), and a word when a job has missed a run
  const M = D.market;
  if(M && M.updated) st.innerHTML = 'Prices: <b>' + esc(M.league) + '</b> · ' + ago(M.updated) +
    (M.late ? ' · <span class="err">waiting for new prices</span>' : '');
  else st.textContent = 'Prices not loaded yet';
  import('./league.js').then(m => m.mountLeague($('#leagueclock'))).catch(() => {});   // the league clock
}).catch(failed);
first.then(later, later);   // the crest's fog, once the first cards are on screen
ready.then(() => {
  // once this page is idle: the service worker (repeat visits paint from this browser's copy, and it keeps a copy of
  // the drill-down page, so Gems / Uniques / Passive tree open fast); without one, fetch the drill-down page ahead
  idle(() => {
    if(registerSW()) return;
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = 'explore'; document.head.appendChild(l);
  });
}).catch(failed);
}

/* ---------- after the first paint ----------
   Decoration that must never hold up the page: the fog and wisps (index.html and explore.html give them data-src).
   Each fog layer fades in once its images are in, so the drifting starts smooth; a wisp starts its loop when loaded. */
function idle(f){ (window.requestIdleCallback || (g => setTimeout(g, 1200)))(f, {timeout: 4000}); }
export function later(){
  requestAnimationFrame(() => setTimeout(() => {
    for(const img of document.querySelectorAll('img[data-src]')){
      const box = img.closest('.fog') || img;
      img.addEventListener('load', () => {
        img.classList.add('on');
        if(box !== img && [...box.querySelectorAll('img')].every(x => x.classList.contains('on'))) box.classList.add('on');
      }, {once: true});
      img.src = img.dataset.src; img.removeAttribute('data-src');
    }
  }, 0));
}
/* The service worker (sw.js): not on the backup site (GitHub Pages serves sw.js unstamped) or inside a frame. */
export function registerSW(){
  if(!('serviceWorker' in navigator) || /\.github\.io$/.test(location.hostname) || window.top !== window) return false;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  return true;
}
