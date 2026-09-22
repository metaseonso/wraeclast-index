/* Wraeclast Index — app shell, live cards, and the search-first home page.
   Data files (see "data" below):
     data/index-core.json, data/index-rest.json   the search index built from the game data (tools/sync.py, tools/appdata.py)
     data/market.json  real prices only: currency from the in-game Currency Exchange, everything else from live
                       trade site listings (worker/prices.js); trends from the site's own daily prices
   Build usage links to poe.ninja's own builds page: their builds API is not open to other sites. */
import {initKeys, setCardKeys, keyLabel} from './keys.js';
import {KIND, DEFAULT, FIELDS, ACTS, CHIPS, NAMES, ROUTES, fieldsOf} from './kinds.js';
import * as edges from './edges.js';
import * as marks from './marks.js';

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
// the bosses keep their own file (data/bosses.json, tools/bosses.py); it joins the search with the rest
const BOSS = AFTER.then(() => getJSON('data/bosses.json', {priority: 'low'}).catch(() => null));
// the history, only when the worker split it off (the backup site's market file has no parts: it is all in NOW)
const PAST = AFTER.then(() => NOW).then(m => m && m.part === 'now' ? getJSON('data/market.json?part=past', {priority: 'low'}).catch(() => null) : null);

function prep(it, k, IMGS, lxk){   // once per card: its kind, full image link, mechanics links and search words
  if(it._nl !== undefined) return it;
  it.k = k;
  if(it.id === undefined) it.id = it.n;   // the parts leave the id out where it is the name
  if(it.img){ const i = it.img.indexOf(':'), pre = IMGS[it.img.slice(0, i)]; if(pre) it.img = pre + it.img.slice(i + 1); }   // "<server key>:<path>"
  // "lx" marks every phrase in a line that names another card (tools/nodelinks.py). The page draws one kind of
  // them: the words that lead to a mechanics card ("h:", tools/mechanics.py). The rest stays plain text, as before.
  if(it.lx && lxk){
    const hx = it.lx.map(r => (r || []).filter(x => (lxk[x[2]] || '').startsWith('h:')).map(x => [x[0], x[1], lxk[x[2]]]));
    if(hx.some(r => r.length)) it.hx = hx;
    // every card its lines name, once each: the related lists follow these both ways (assets/edges.js)
    const rx = new Set();
    for(const r of it.lx) for(const x of r || []) if(lxk[x[2]]) rx.add(lxk[x[2]]);
    if(rx.size) it.rx = [...rx];
  }
  it._nl = it.n.toLowerCase();
  it._hay = [it.n, it.s, it.t, it.q, it.asc, it.reg, (it.ls || []).join(' '), (it.pr || []).join(' '),
    (it.tags || []).join(' '), (it.o || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
  if(k === 'b'){ it.base = it.n; if(it.ls) it.ni = it.ls.length; }   // a base: every line is an implicit
  if(k === 'c') it.nx = true;   // nx: not in the catalogue (yet)
  return it;
}
const MC = new Map();   // the market's own currency cards, made once
const MB = new Map();   // the boss cards, made once
/* The index as the pages use it: every card in the index's own order, then the market's currency and the bosses.
   Without the rest (the first cards), only the core's kinds. */
function assemble(core, rest){
  const IMGS = core.imgs || {}, pool = {}, at = {}, lxk = {};   // lxk: each part's own table of the cards its lines name
  for(const part of [core, rest]) if(part) for(const [k] of core.order) if(Array.isArray(part[k])){ pool[k] = part[k]; at[k] = 0; lxk[k] = part.lxk || []; }
  const items = [], byKey = new Map();
  for(const [k, n] of core.order){
    const list = pool[k]; if(!list) continue;
    for(let i = 0; i < n && at[k] < list.length; i++){ const it = prep(list[at[k]++], k, IMGS, lxk[k]); items.push(it); byKey.set(k + ':' + it.id, it); }
  }
  if(rest) for(const [key, kw] of Object.entries(rest.ckw || {})){ const it = byKey.get(key); if(it) it.kw = kw; }
  // the core's own cards keep their keyword chips and flavour line in the rest, so the first cards stay small
  if(rest) for(const [key, qt] of Object.entries(rest.cqt || {})){ const it = byKey.get(key); if(it) it.qt = qt; }
  const named = new Map();   // atlas and bulk item cards of the index, by name (the market must not repeat them)
  for(const it of items) if(it.k === 'a' || it.k === 'c') named.set(it.n, it);
  const skip = rest ? new Set() : new Set(core.skip || []);   // cards the rest has: their prices wait for it
  const lineage = new Set(core.li || []);   // lineage support gems: the market lists them too (the gem card shows that price)
  const itemText = new Map();   // a lineage gem's own words, for the market's card of the same name
  for(const it of items) if(it.k === 'g' && it.li && it.t) itemText.set(it.n, it.t);
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
      // A priced card must still say what the thing does. The market file says so for most of them; for the
      // rest the official text is in the index — a lineage support gem's own card, or "ix" for a name no card
      // covers at all (tools/carddata.py). Both are in the rest, so this fills in when the rest lands.
      if(!it.t && rest){
        it.t = itemText.get(m.n) || (rest.ix || {})[m.n] || '';
        if(it.t) it._hay += ' ' + it.t.toLowerCase();
      }
      items.push(it); byKey.set('c:' + it.id, it);
    }
  }
  // the bosses live in their own file; they join the search as their own kind, and the Bosses tab draws their card
  for(const b of (D.bosses && D.bosses.bosses) || []){
    let it = MB.get(b.name);
    if(!it){
      const where = (b.areas || []).map(a => a.name).join(' · ');
      it = {k: 'x', id: b.name, n: b.name, s: where};
      it._nl = it.n.toLowerCase();
      it._hay = (it.n + ' ' + where + ' boss' + (b.pinnacle ? ' pinnacle' : '')).toLowerCase();
      MB.set(b.name, it);
    }
    items.push(it); byKey.set('x:' + it.id, it);
  }
  D.index = {v: core.v, gen: core.gen, sprites: core.sprites, imgs: IMGS, kwx: rest ? rest.kwx || {} : {},
    ws: (rest && rest.ws) || core.ws || '', items};
  D.byKey = byKey;
}
export const first = (async () => {
  const [core, market] = await Promise.all([CORE, NOW]);
  D.market = market; D.core = core;
  assemble(core, null);
  return D;
})();
export const ready = (async () => {
  let [, rest, past, boss] = await Promise.all([first, REST, PAST, BOSS]);
  let core = D.core;
  D.bosses = boss;
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
  const U = D.usage && D.usage[NAMES[it.k]];
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

/* ---------- the live card ----------
   One layout for everything on the site. The kind says which fields its cards carry, which buttons they
   offer and which related lists they can build (assets/kinds.js); each field says what type it is; and there
   is one function per type below. Nothing here knows what a gem or a unique is, so a new kind — a new
   league's items, a new list — draws a full card with no code of its own.

   opts.full: the popup, where nothing is clipped · opts.invest {label, div, note}: the cost line on build
   cards · opts.rank: the order badge · opts.why: why this card is on screen */

/* the Craft tab, opened on this base (its plan lives in the address, see craft.js) */
export const craftHref = (c, b = '') => './#/craft?s=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({c, b, l: 0, m: []})))));
/* Where a card's gold button goes: the kind's own "link", with @field filled in from the entry. A field the
   entry has nothing for means no link at all. Two kinds need more than a template: a base carries a whole
   craft plan, and a currency the catalogue does not list yet has nowhere to go. */
export function hrefOf(it){
  const d = KIND[it.k];
  if(!d || !d.link) return null;
  if(d.link === 'craft') return it.cr && D.byKey.get('b:' + it.id) === it ? craftHref(it.cr, it.n) : null;
  if(it.k === 'c' && it.nx) return null;
  let have = true;
  const href = d.link.replace(/@(\w+)/g, (_, f) => {
    if(it[f] === undefined || it[f] === '') have = false;
    return encodeURIComponent(it[f]);
  });
  return have ? href : null;
}
/* an item is something that can be traded; an Atlas passive is on the Atlas but is not an item */
const isItem = it => { const d = KIND[it.k]; return !!(d && d.item) && !(it.k === 'a' && it.at === 'tree'); };

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
const pill = (text, tone) => '<span class="pill' + (tone ? ' ' + tone : '') + '">' + esc(text) + '</span>';
function reqPills(rq, note){
  if(!rq) return '';
  const out = [];
  if(rq[0] > 1) out.push(pill('Lv ' + rq[0]));
  ATTR.forEach(([a, c], i) => { if(rq[i + 1]) out.push(pill(rq[i + 1] + ' ' + a, 'a-' + c)); });
  if(!out.length) out.push(pill('No requirements'));
  return out.join('') + (note ? '<span class="pill-note">' + note + '</span>' : '');
}
marks.setup({D, keywordIdOf});   // the keyword cards are its vocabulary: assets/marks.js
/* One line as the card shows it, with its doors marked. Two kinds of mark, and they never overlap: the words
   marked when the data was built (tools/nodelinks.py — it.hx from prep above, or a table file's own spans) and
   the keywords worked out as the card is drawn (assets/marks.js), which never land on ground the build already
   took. A mechanics card is ours, not the game's, so its mark is the word with a footnote; a keyword is the
   game's own word, so its mark is the word underlined. Neither is a keyword chip: the chips under the card are
   the summary, these are the detail. See .hlink and .kwmark in assets/cards.css. */
const HLINK_TITLE = 'How it works — our own note, not the game’s';
const KWMARK_TITLE = 'Keyword — the game’s own words';
function spansHTML(text, spans){
  if(!spans || !spans.length) return esc(text);
  let out = '', at = 0;
  for(const [s, n, key] of spans){
    if(s < at) continue;
    const word = esc(text.slice(s, s + n));
    out += esc(text.slice(at, s)) + (key[0] === 'h'
      ? '<button type="button" class="hlink" title="' + HLINK_TITLE + '" data-h="' + esc(key) + '">' + word + '</button>'
      : '<button type="button" class="kwmark" title="' + KWMARK_TITLE + '" data-kw="' + esc(key.slice(2)) + '">' + word + '</button>');
    at = s + n;
  }
  return out + esc(text.slice(at));
}
/* One line, with the marks the build gave it and the keywords worked out here. `fixed` is what the build
   marked and this draws; `block` is all the ground the build's marks hold, whether or not they are drawn, so
   a keyword is never marked inside a name the build already read. */
function drawLine(it, text, fixed, block){
  const found = marks.scan(it, text, block);
  return spansHTML(text, fixed && fixed.length ? [...fixed, ...found].sort((a, b) => a[0] - b[0]) : found);
}
/* A line marked in a file of its own, the way the index marks its own cards' lines (tools/nodelinks.py): the
   phrases that lead to a mechanics card, off that file's key table. */
const mechSpans = (spans, lxk) => (spans || [])
  .filter(x => (lxk[x[2]] || '').startsWith('h:')).map(x => [x[0], x[1], lxk[x[2]]]);
/* A card is drawn again every time it is opened, stepped back to, filtered or scrolled past, and its lines do
   not change between draws: each line keeps the form it was marked into, until the index itself moves on. */
function lineHTML(it, at, i, text, marked){
  const v = marks.version();
  if(it._mkv !== v){ it._mkv = v; it._mk = {}; }
  const key = at + i;
  let html = it._mk[key];
  if(html === undefined) it._mk[key] = html =
    drawLine(it, text, marked && it.hx && it.hx[i], marked && it.lx && it.lx[i]);
  return html;
}
/* The keyword cards land with the rest of the index, so the home page's very first cards can be drawn with
   nothing to mark yet. They take their marks in place the moment it lands: only the lines are drawn again, so
   a card keeps its place, its price and its buttons. */
function remark(host){
  for(const el of host.querySelectorAll('[data-mk]')){
    const c = el.closest('.card');
    const it = c && c.dataset.key ? D.byKey.get(c.dataset.key) : null;
    if(!it) continue;
    const [at, i] = el.dataset.mk.split(':');
    const v = it[at];
    el.innerHTML = lineHTML(it, at, +i, Array.isArray(v) ? v[+i] : v, (KIND[it.k] || {}).mark === at);
  }
}
/* The card behind a marked word: a keyword's, or a mechanics card's. The index loads in two parts, so one of
   the very first cards can be tapped before the part the mechanics cards are in has arrived: then it waits. */
function openMark(el, opts){
  const id = el.dataset.kw;
  if(id !== undefined){ const c = keywordCard(id); if(c) openDetail(c, opts, hrefOf(c)); return; }
  openMech(el.dataset.h, opts);
}
function openMech(key, opts){
  const c = D.byKey.get(key);
  if(c) return void openDetail(c, opts, null);
  ready.then(() => { const x = D.byKey.get(key); if(x) openDetail(x, opts, null); }, () => {});
}
/* A field of lines — one string, or a list of them — with the marked words in whichever of them the index
   marked (the kind's own "mark", assets/kinds.js). A list longer than max says how many are left.
   Every drawn line says which field and which line it is ("data-mk"), so remark above can find it again. */
function richHTML(it, at, max){
  const v = it[at];
  if(v === undefined || v === null || v === '') return '';
  const marked = (KIND[it.k] || {}).mark === at;
  if(!Array.isArray(v)) return '<p class="card-tx" data-mk="' + at + ':0">' + lineHTML(it, at, 0, v, marked) + '</p>';
  if(!v.length) return '';
  const li = (x, i) => '<li data-mk="' + at + ':' + i + '">' + lineHTML(it, at, i, x, marked) + '</li>';
  const more = v.length - max;
  return '<ul class="card-ls">' + v.slice(0, more > 1 ? max : v.length).map(li).join('') +
    (more > 1 ? '<li class="more-n">+' + more + ' more</li>' : '') + '</ul>';
}
/* ---------- the damage card ----------
   The flowchart a mechanics card can carry ("fl", tools/mechanics.py). A group is either a run of steps
   ("st"): one box each, an arrow drawn in the gap between them; or a pair of columns ("cols"): conversion
   against extra damage, side by side where there is room and stacked on a phone.
   Plain markup, no library: the boxes wrap, so a long step still reads at 375px, and every colour is a theme
   token, so it draws in either theme. The index holds the chart as text and this draws it, which keeps the
   markup out of the data.
   Only in the popup: it is taller than a card in the grid, and every card opens its popup first. */
function flowHTML(it, full){
  if(!it.fl || !it.fl.length || !full) return '';
  // the chart's own labels stay plain; what a step says is a line like any other, and carries its marks
  const run = st => '<ol class="flow-run">' + st.map(([n, note]) =>
    '<li class="flow-st"><b>' + esc(n) + '</b>' + (note ? '<span>' + drawLine(it, note) + '</span>' : '') + '</li>'
  ).join('') + '</ol>';
  const cols = cs => '<div class="flow-cols">' + cs.map(c =>
    '<div class="flow-col"><b>' + esc(c.h) + '</b><ul>' + (c.ls || []).map(x => '<li>' + drawLine(it, x) + '</li>').join('') +
    '</ul></div>').join('') + '</div>';
  return '<div class="flow">' + it.fl.map(g => '<p class="flow-hd">' + esc(g.h) + '</p>' +
    (g.st ? run(g.st) : '') + (g.cols ? cols(g.cols) : '')).join('') + '</div>';
}
/* The damage card, offered on every card whose text is about damage. Read off the card's own search text, so
   nothing has to be marked per card; the mechanics cards themselves already say it and never offer it. */
const DAMAGE_CARD = 'h:HowDamage';   // tools/mechanics.py declares it
const DAMAGE_WORD = /\bdamage\b/;
function offerHTML(it, full){
  if(!full || it.k === 'h' || !it._hay || !DAMAGE_WORD.test(it._hay)) return '';
  return '<button type="button" class="card-offer" data-h="' + DAMAGE_CARD + '">' +
    '<b>How damage works</b><small>the order it is worked out in</small></button>';
}
function anointHTML(it){
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

/* ---------- what a thing adds to an item, per kind of item ----------
   The game's own line on an essence says a guaranteed modifier and stops there, while the modifier itself is a
   different one on a bow than on a body armour. The table is a file of its own (the field's "file",
   assets/kinds.js), 24 kB, fetched the first time a card asks for it and kept for the rest of the visit — the
   full mod tables behind it are 1.6 MB and stay on the Craft tab, a class at a time.
   It is keyed by whatever the field reads (FIELDS.adds.at: an essence is keyed by its name), so anything else
   that adds a known modifier joins the same table without a line of code here.
   One row per modifier: every kind of item that gets that same one, the game's own wording for it, and which
   side it lands on. A kind of item opens the Craft tab on it, where the whole table for that kind is. */
const TABLES = {};   // file -> a promise of it, asked for once
const tableOf = file => TABLES[file] || (TABLES[file] = getJSON(file, {priority: 'low'}).catch(() => null));
const SIDE = {p: 'Prefix', s: 'Suffix'};
function addsHTML(it, t, rows){
  const cl = t.cl || {}, lxk = t.lxk || [];
  // game wording like any other line: the file's own marks are drawn, and its keywords are worked out here
  const line = (x, spans) => drawLine(it, x, mechSpans(spans, lxk), spans);
  return '<ul class="card-adds">' + rows.map(([side, lv, kinds, lines, lx]) =>
    '<li><span class="adds-on">' + kinds.map(c => '<a class="uses-go" href="' + craftHref(c) + '">' +
        esc(cl[c] || c) + '</a>').join(', ') + '</span>' +
      '<span class="adds-ml">' + lines.map((x, i) => line(x, (lx || [])[i])).join('<br>') + '</span>' +
      '<span class="adds-rs">' + (SIDE[side] || '') + (lv ? ' · level ' + lv : '') + '</span></li>').join('') + '</ul>';
}
/* the card is drawn before the table is in, so the field leaves a box and fills it once the file lands. A name
   the table says nothing about leaves the box empty, and an empty box draws nothing. */
function addsFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const rows = t && t.e && t.e[it[f.at]];
    if(!rows || !rows.length || !host.isConnected) return;
    host.innerHTML = (f.label ? '<p class="card-facts">' + esc(f.label) + '</p>' : '') + addsHTML(it, t, rows);
    host.hidden = false;
  });
}

/* ---------- one function per field type ----------
   Each answers with the words to draw, or with markup where a field is more than words ("raw"): the slot it
   sits in wraps the rest. A field whose entry says nothing answers with nothing and draws nothing, so one
   declaration covers a full entry and a bare one.
   A type whose table is a file of its own answers with an empty box and a "fill" as well: card() calls it once
   the card is built, and it fills its own box when the file lands. */
const TYPE = {
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
  money:  {raw: 1, v: (it, f, o) => o.px && o.px.v !== undefined
    ? '<b>' + moneyHTML(o.px.v) + '</b>' + change(o.px.ch) : ''},
  uses:   {v: (it, f) => {   // a keyword: how much of the game it touches, from the index's own count
    const u = it[f.at] || {}, parts = [];
    for(const [k, one, many] of [['gems','gem','gems'], ['uniques','unique','uniques'], ['passives','passive','passives']])
      if(u[k]) parts.push(u[k].toLocaleString() + ' ' + (u[k] === 1 ? one : many));
    return parts.length ? 'Used by ' + parts.join(', ') : '';
  }},
  /* how many mods can roll on this base item, and who measured how often each one does (tools/carddata.py,
     the numbers the Craft tab works from). */
  weights: {v: (it, f) => {
    const w = it[f.at];
    if(!w) return '';
    const n = (w[0] || 0) + (w[1] || 0);
    if(!n) return '';
    return n.toLocaleString() + ' mods can roll here' + (w[0] && w[1] ? ' (' + w[0] + ' prefix, ' + w[1] + ' suffix)' : '') +
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
  rich:   {raw: 1, v: (it, f, o) => richHTML(it, f.at, o.full ? Infinity : 4)},
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
  flow:   {raw: 1, v: (it, f, o) => flowHTML(it, o.full)},
  source: {raw: 1, v: (it, f) => it[f.at] ? '<p class="card-src">' + esc(it[f.at]) + '</p>' : ''},
  offer:  {raw: 1, v: (it, f, o) => offerHTML(it, o.full)},
  tags:   {raw: 1, v: (it, f) => (it[f.at] || []).length
    ? '<p class="card-tags">' + it[f.at].map(esc).join(' · ') + '</p>' : ''},
  anoint: {raw: 1, v: it => anointHTML(it)},
  chips:  {raw: 1, v: (it, f, o) => o.full ? kwChips(it) : ''},
  spark:  {raw: 1, v: (it, f, o) => o.px ? spark(o.px.sp, o.px.ch) : ''},
  thin:   {raw: 1, v: (it, f, o) => o.px && o.px.ls !== undefined && o.px.ls < 3
    ? '<span class="use" title="Only a few listed">few listed</span>' : ''},
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
/* the fields of one slot, drawn in the order the kind declares them */
function slotHTML(it, slot, o){
  const out = [];
  for(const name of fieldsOf(it.k, slot)){
    const f = FIELDS[name], t = TYPE[f.type];
    if(!t) continue;
    const v = t.v(it, f, o, name);
    if(v === null || v === undefined || v === '') continue;
    out.push({name, f, html: t.raw ? v : esc(v), text: t.raw ? '' : v});
  }
  return out;
}
const oneOf = (list, name) => (list.find(x => x.name === name) || {}).html || '';

export function card(it, opts = {}){
  const o = {...opts};
  o.px = opts.price !== undefined ? opts.price : priceOf(it);
  o.href = opts.href !== undefined ? opts.href : hrefOf(it);
  const d = KIND[it.k] || DEFAULT;
  const el = document.createElement('article');
  el.className = 'card k-' + it.k + (o.href ? ' linked' : '');
  if(!o.href) el.tabIndex = 0;
  const head = slotHTML(it, 'head', o), pills = slotHTML(it, 'pill', o);
  const facts = slotHTML(it, 'fact', o), body = slotHTML(it, 'body', o), foot = slotHTML(it, 'foot', o);
  el.innerHTML =
    (o.rank ? '<span class="card-rank">' + o.rank + '</span>' : '') +
    '<div class="card-hd"><span class="card-ic">' + oneOf(head, 'art') + '</span>' +
      '<div class="card-id"><h3>' + oneOf(head, 'name') + '</h3>' +
      '<p class="card-sub">' + oneOf(head, 'sub') + '</p></div>' +
      (oneOf(head, 'price') ? '<div class="card-px">' + oneOf(head, 'price') + '</div>' : '') +
    '</div>' +
    (o.why ? '<p class="card-why">' + esc(o.why) + '</p>' : '') +
    (pills.length ? '<div class="card-req">' + pills.map(x =>
      x.f.type === 'reqs' || x.f.type === 'gemreq' ? x.html : pill(x.text, x.f.tone)).join('') + '</div>' : '') +
    (facts.length ? '<p class="card-facts">' + facts.map(x => x.html).join(' · ') + '</p>' : '') +
    body.map(x => x.html).join('') +
    (o.invest ? '<div class="card-inv"><span>' + esc(o.invest.label) + '</span><b>' +
      (o.invest.div !== undefined && o.invest.div !== null ? moneyHTML(o.invest.div) : esc(o.invest.note || '')) + '</b></div>' : '') +
    (o.extra || '') +
    '<div class="card-ft">' + (o.action || '') + foot.map(x => x.html).join('') +
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
let OV = null, lastFocus = null;
let TRAIL = [], AT = -1, SEQ = 0, PEND = null;   // the trail, where you are on it, the next step id, a card still loading
const CUR = () => TRAIL[AT] || null;   // the card on show
const focusBox = () => OV.querySelector('.ov-box').focus({preventScroll: true});
/* Everything about the step you are leaving, so coming back to it finds it untouched: where the card was
   scrolled, and its "Found on" list's group, filter and own scroll. The Trade panel is kept as it stands —
   the same panel comes back, so Back never fires a second trade search. paintStep puts it all back. */
function saveStep(){
  const step = CUR();
  if(!step || !OV || OV.hidden) return;
  const box = OV.querySelector('.ov-box'), sec = box.querySelector('.uses');
  step.top = box.scrollTop;
  step.uses = sec && !sec.hidden ? {open: [...(sec._open || [])], q: (sec.querySelector('.uses-q') || {}).value || '',
    top: (sec.querySelector('.uses-list') || {}).scrollTop || 0} : null;
  step.trade = box.querySelector('.trade') || null;
}
// a box you are typing in, brought back above the keyboard. Twice: once now, once after the keyboard has settled
function keepInView(el){
  const show = () => { if(el.isConnected) el.scrollIntoView({block: 'nearest'}); };
  show();
  setTimeout(show, 260);
}
/* The price line on an opened card: this league solid, the leagues before it behind it, each step fainter and
   thinner than the one in front, and a key naming them in their own shades so nobody has to guess which line
   is which league. Every line is placed by which day of its own league it is (lh.d0 plus a day's place in the
   line), so the shapes read against each other; a day nothing was checked is a null and breaks the line there.
   No league's line joins another's and no day is filled in. lh is market.json's lh (worker/prices.js): without
   it this draws the one line, as before. */
// this league, then one, two and three back: how faded each step is and how thick. Measured against the
// chart's own ground: the faintest still reads at 3.1 to 1, so the oldest league holds up on a phone.
const FADE = [null, '.74', '.54', '.4'];
const WIDE = [2, 1.6, 1.4, 1.2];
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
  const back = ((lh && lh.past) || []).map(s => ({n: s.n, b: Math.min(+s.b || 1, FADE.length - 1), d0: +s.d0 || 0, v: s.v || []}))
    .sort((x, y) => x.b - y.b).slice(0, FADE.length - 1);
  const lines = [{n: (D.market && D.market.league) || 'This league', b: 0, d0: (lh && +lh.d0) || 0, v: now}, ...back];
  if(!lines.some(s => realDays(s.v) >= 2)) return '';   // one price is not a line: nothing is drawn from it
  const real = [];
  for(const s of lines) for(const y of s.v) if(y !== null && isFinite(y)) real.push(y);
  const lo = Math.min(...real), hi = Math.max(...real), span = hi - lo || 1, w = 300, h = 64;
  const x0 = Math.min(...lines.map(s => s.d0)), xw = Math.max(...lines.map(s => s.d0 + s.v.length - 1)) - x0 || 1;
  const p = now.filter(v => v !== null);
  const mine = p.length < 2 ? 'var(--faint)' : p[p.length - 1] >= p[0] ? 'var(--pos)' : 'var(--neg)';
  const col = i => i ? 'var(--text)' : mine;
  const paths = lines.map(s => {
    const d = linePath(s.v, s.d0, x0, xw, lo, span, w, h);
    return d ? '<path d="' + d + '" fill="none" stroke="' + col(s.b) + '"' + (FADE[s.b] ? ' style="stroke-opacity:' + FADE[s.b] + '"' : '') +
      ' stroke-width="' + WIDE[s.b] + '" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' : '';
  }).reverse().join('');   // the oldest league first, so this league is drawn on top of them
  // the key: every league with prices, newest first, in its own shade. A few days says so rather than reading
  // as a whole league.
  const key = lines.map(s => {
    const n = realDays(s.v);
    return n ? '<li><i style="border-color:' + col(s.b) + (FADE[s.b] ? ';opacity:' + FADE[s.b] : '') + '"></i>' + esc(s.n) +
      (n < 14 ? '<span>' + n + (n === 1 ? ' day' : ' days') + '</span>' : '') + '</li>' : '';
  }).join('');
  const said = [back.length ? 'Daily price in each league. A league with no line had nothing listed then.' : '',
    (lh && lh.note) || ''].filter(Boolean).join(' ');
  return '<figure class="chart"><figcaption>' + label + '</figcaption><svg viewBox="0 0 ' + w + ' ' + h +
    '" preserveAspectRatio="none" aria-hidden="true">' + paths + '</svg><ul class="chart-key">' + key + '</ul>' +
    (said ? '<figcaption class="chart-said">' + esc(said) + '</figcaption>' : '') + '</figure>';
}
function detailExtras(it, px){
  if(!px) return '';
  let out = '';
  // px.lh carries the leagues before this one (worker/prices.js). sp is only reached with three days or fewer,
  // where it is the whole of h, so lh.d0 still says which day of the league the line starts on.
  if(px.h && px.h.length > 3){
    const lo = money(Math.min(...px.h.map(x => x[1]))), hi = money(Math.max(...px.h.map(x => x[1])));
    out += bigLine(px.h.map(x => x[1]), 'Since ' + px.h[0][0] + ' \u00b7 low ' + lo.v + ' ' + lo.u + ', high ' + hi.v + ' ' + hi.u, px.lh);
  } else if(px.sp) out += bigLine(px.sp, 'Last 7 days', px.lh);
  else if(px.lh && px.lh.past) out += bigLine([], 'Past leagues', px.lh);
  // nothing to draw and something to say: one day is a price, not price action, so the card says that instead
  if(!out && px.lh && px.lh.note) out += '<p class="chart-said">' + esc(px.lh.note) + '</p>';
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
      const kw = t.closest('.kwlink, .kwmark');   // a keyword chip, or a marked word in a line
      if(kw){ const c = keywordCard(kw.dataset.kw); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const hl = t.closest('.hlink, .card-offer');   // a word in a line, or the offer: a mechanics card (tools/mechanics.py)
      if(hl){ openMech(hl.dataset.h, {nested: true}); return; }
      const row = t.closest('.uses-row[data-key]');
      if(row){ const c = D.byKey.get(row.dataset.key); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const all = t.closest('.uses-all');   // "See all": the rest of that category, drawn here
      if(all){ const sec = all.closest('.uses'); sec._open.add(all.dataset.c); paintRel(sec); return; }
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
  const own = (KIND[it.k] || {}).own;   // a boss: its tab has the way in and the drops, so it draws the card and calls back
  if(own && !opts.drawn) return void import(own).then(m => m.openCard(it), () => {});
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
/* The buttons under a card, from the kind's own list (assets/kinds.js ACTS). Each one draws only when it
   has something to do: Trade for an item, Full stats where the page behind the card has a panel, and the
   gold button where the kind has a tab and this card has an address in it. */
function actsHTML(it, opts, href){
  const d = KIND[it.k] || {}, out = [];
  for(const a of d.acts || []){
    if(a === 'trade' && isItem(it))
      out.push('<button type="button" class="btn ttoggle" aria-expanded="false">' + ACTS.trade.label + '</button>');
    else if(a === 'full' && opts.onFull)
      out.push('<button type="button" class="btn fullstats">' + ACTS.full.label + '</button>');
    else if((a === 'open' || a === 'craft') && href)
      out.push('<a class="btn gold" href="' + esc(href) + '">' + ACTS[a].label + (a === 'open' ? d.place : '') + ' →</a>');
  }
  return out.join('');
}
function paintStep(){
  const step = CUR();
  const {it, opts, href} = step;
  const box = OV.querySelector('.ov-box');
  box.setAttribute('aria-label', 'Details');
  const px = opts.price !== undefined ? opts.price : priceOf(it);
  const body = OV.querySelector('.ov-body');
  const c = card(it, {...opts, href: null, rank: undefined, full: true, detail: true, extra: (opts.extra || '') + detailExtras(it, px)});
  c.classList.add('detail');
  body.replaceChildren(c);
  const uses = relSection(it, step.uses);
  body.appendChild(uses);
  const acts = actsHTML(it, opts, href);
  if(acts){
    const row = document.createElement('div');
    row.className = 'ov-go';
    row.innerHTML = acts;
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
    if(step.trade){   // the panel this step had open, itself: no second trade search
      body.appendChild(step.trade);
      if(tb) tb.setAttribute('aria-expanded', 'true');
    }
  }
  paintNav();
  const back = () => { if(CUR() === step) box.scrollTop = step.top || 0; };   // back to where you had this card
  back();
  // ...and again once the "Found on" rows are in: they come from data/kwuse.json a moment later, and until
  // they do the card is too short to scroll that far, so the browser would clamp it back to the top
  if(uses) uses._then = back;
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
  return 'Cards remember where you’ve been. Step back and forward with ' + (keys ? keys + ', or ' : '') + 'the arrows in this bar.';
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
/* "Search this list or card" inside a card: a box for what this card holds. A keyword card filters its
   "Found on" list; any other card filters its own lines. Typing filters the rows live; Esc empties the box
   and then leaves it (the Escape handler above), so the card stays open either way. */
function cardFilter(){
  const box = OV.querySelector('.ov-box');
  let q = box.querySelector('.uses-q');
  if(q) q.hidden = false;                                  // a short "Found on" list keeps its box out of the way until now
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

/* ---------- keywords: the chips on a card ----------
   Every gem, unique, passive and keyword lists the keywords its game text marks (the index's "kw"). The chips
   are the way to them; which cards a keyword is itself found on is the related section below. */
export function keywordCard(id){
  const name = D.index.kwx && D.index.kwx[id];   // a keystone stands for its own keyword
  return D.byKey.get('w:' + id) || (name && D.index.items.find(x => x.k === 'p' && x.n === name)) || null;
}
/* Kept on the card: every line of it asks, and the answer is a walk over the keystones (assets/marks.js). */
export function keywordIdOf(it){
  if(it._kwid !== undefined) return it._kwid;
  let id = null;
  if(it.k === 'w') id = it.id;
  else if(it.k === 'p' && D.index.kwx) for(const [k, n] of Object.entries(D.index.kwx)) if(n === it.n){ id = k; break; }
  return it._kwid = id;
}
function kwChips(it){
  const own = keywordIdOf(it);
  const ids = (it.kw || []).filter(k => k !== own && keywordCard(k));
  if(!ids.length) return '';
  return '<div class="kwchips"><span class="lbl">Keywords</span>' + ids.map(k =>
    '<button type="button" class="chip kwlink" data-kw="' + esc(k) + '">' + esc(keywordCard(k).n) + '</button>').join('') + '</div>';
}

/* ---------- the related section ----------
   Built from the edges the index already holds, followed both ways (assets/edges.js), in the categories the
   kind declares (assets/kinds.js). Per category: the first CAP rows, the true total, and a "See all" that
   draws the rest here on demand — a keyword like Hit is on 1,448 things and nobody wants all of them at once.
   Where the drill-down page can show the same list, the gold link carries the filter that makes it the same
   list rather than the default view.
   A keyword's own nine categories come from data/kwuse.json (tools/kwuse.py), fetched the first time one of
   them is needed. */
/* The two files some of the lists are worked out from, each fetched the first time a card asks for one and
   kept for the rest of the visit. A card that needs neither never asks for either. */
const REL_FILES = {kwuse: 'data/kwuse.json', grants: 'data/grants.json'};
const HAVE = {};            // what is in
const JOB = {};             // what is on its way
let relBad = false;         // a fetch that failed: the card says so instead of waiting for ever
function needFiles(names){
  return Promise.all(names.map(f => JOB[f] || (JOB[f] =
    getJSON(REL_FILES[f]).then(j => { HAVE[f] = j; }, () => { relBad = true; }))));
}
const CAP = 8;             // rows drawn per category before the "See all"
const SLACK = 2;           // ...unless no more than this many would be left over
const USE_FILTER = 30;     // a section with more rows than this gets its filter box from the start
edges.setup({D, keywordCard, keywordIdOf, kindOf: k => KIND[k]});

/* one row: anything with a card of its own opens it, an Atlas row without one goes to its tab, and the rest
   is a plain row. `hay` is what the filter box searches — the same words the search itself uses. */
function relRow(r){
  const it = r.key ? D.byKey.get(r.key) : null;
  const times = n => n > 1 ? ' <span class="uses-x">×' + n + '</span>' : '';
  const kinds = r.craft && r.craft.length
    ? '<span class="uses-kinds">' + r.craft.map((c, j) =>
        '<a class="uses-go" href="' + craftHref(c) + '">' + esc((r.kinds || [])[j] || c) + '</a>').join(', ') + '</span>'
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
  kw(it, of){ const id = keywordIdOf(it); return id && of && of.sec ? ['#' + of.sec + '?kw=' + encodeURIComponent(id), of.place] : null; },
  base(it, of){ const b = it.k === 'b' ? it.n : edges.baseName(it); return b ? ['#uniques?base=' + encodeURIComponent(b), of.place] : null; },
  craft(it){ return it.cr ? [craftHref(it.cr), 'Craft'] : null; },
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
function relSection(it, want){
  const sec = document.createElement('section');
  sec.className = 'uses';
  sec._it = it;
  sec._open = new Set((want && want.open) || []);
  sec._want = want || null;
  const need = paintRel(sec);
  if(need.length) needFiles(need).then(() => { paintRel(sec); if(sec._then) sec._then(); });
  return sec;
}
function paintRel(sec){
  const it = sec._it;
  // what the player had typed and where they had scrolled: a "See all" redraws the whole section
  const was = sec.querySelector('.uses-q');
  const keep = was ? {q: was.value, top: (sec.querySelector('.uses-list') || {}).scrollTop || 0} : null;
  const got = edges.categories(it, HAVE);
  const cats = got.list, waiting = got.need.length && !relBad;
  sec.hidden = !cats.length && !waiting;
  if(sec.hidden){ sec.innerHTML = ''; sec._rows = []; return got.need; }
  const all = [];   // every row drawn, in order, for the filter box
  const blocks = cats.map(c => {
    const show = sec._open.has(c.id) || c.total <= CAP + SLACK ? c.total : CAP;
    const drawn = c.rows.slice(0, show).map(relRow);
    all.push(...drawn);
    const left = c.total - show, more = seeAllHTML(it, c);
    return '<div class="uses-cat" data-c="' + esc(c.id) + '">' +
      '<p class="uses-hd"><b>' + esc(c.label) + '</b><span class="ct"' + (c.note ? ' title="' + esc(c.note) + '"' : '') +
      '>' + c.total.toLocaleString() + '</span></p>' +
      drawn.map(x => x.html).join('') +
      (left > 0 || more ? '<p class="uses-more">' +
        (left > 0 ? '<button type="button" class="uses-all" data-c="' + esc(c.id) + '">See all ' +
          c.total.toLocaleString() + '</button>' : '') + more + '</p>' : '') +
      '</div>';
  }).join('');
  const note = waiting ? '<p class="note">Looking…</p>' : relBad && !cats.length
    ? '<p class="note">Could not load this list. Try again in a minute.</p>' : '';
  const filter = all.length > 1 ? '<input class="uses-q" type="search" autocomplete="off" spellcheck="false"' +
    (all.length > USE_FILTER ? '' : ' hidden') +
    ' placeholder="Filter this list…" aria-label="Filter the related list">' : '';
  sec.innerHTML = '<h4>Found on</h4>' + filter + '<div class="uses-list">' + blocks + note + '</div>' +
    '<p class="note uses-none" hidden>Nothing matches.</p>';
  sec._rows = all;
  const q = sec.querySelector('.uses-q');
  if(q) q.addEventListener('input', () => {
    const words = q.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const els = [...sec.querySelectorAll('.uses-row')];
    let shown = 0;
    els.forEach((el, i) => { const hit = words.every(w => (all[i] || {hay: ''}).hay.includes(w)); el.hidden = !hit; shown += hit; });
    for(const cat of sec.querySelectorAll('.uses-cat'))
      cat.hidden = ![...cat.querySelectorAll('.uses-row')].some(r => !r.hidden);
    sec.querySelector('.uses-none').hidden = shown > 0;
  });
  // Back to this card, or a category just opened: the filter it had and where the list was scrolled
  const want = sec._want || keep;
  if(want && !waiting){
    sec._want = null;
    if(q && want.q){ q.value = want.q; q.dispatchEvent(new Event('input')); }
    sec.querySelector('.uses-list').scrollTop = want.top || 0;
  }
  return got.need;
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
  /* Two bands, and the low one is always second: a card marked "lo" is the tree's own wording for a stat
     ("Attack Speed", "Armour" — the 893 small passives tools/treecards.py cards), so the words match it every
     time and it would crowd out what the words actually name. Nothing low ever sits above something else the
     same words matched: typing "life" still puts the notable and the unique first. Inside the low band they
     sort by the same score as everything else, so the one the words really name leads it. */
  out.sort((a, b) => (a.it.lo ? 1 : 0) - (b.it.lo ? 1 : 0) || b.s - a.s);
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
  // index.html draws these chips itself, so the bar never changes shape on the first paint; the table is the
  // one in assets/kinds.js, and a kind that is in the table but not in the page puts them all back in order
  if([...kinds.children].map(c => c.dataset.k).join(' ') !== CHIPS.map(([k]) => k).join(' '))
    kinds.innerHTML = CHIPS.map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === 'all') + '">' + l + '<span class="ct"></span></button>').join('');
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
  // these are the only cards drawn before the whole index is in: they take their keyword marks when it lands
  if(!D.full && !H.marked){ H.marked = true; ready.then(() => remark($('#cards')), () => {}); }
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
  const r = ROUTES.includes(route()) ? route() : 'home';
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
