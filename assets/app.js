/* Wraeclast Index — app shell, live cards, and the search-first home page.
   Data files (all static, served by GitHub Pages):
     data/index.json   search index built from the game data (tools/sync.py)
     data/market.json  poe.ninja prices and 7-day trends (refreshed hourly by a GitHub Action)
   Build usage links to poe.ninja's own builds page: their builds API is not open to other sites. */
import {initKeys} from './keys.js';

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- data ---------- */
export const D = { index: null, market: null, usage: null, byKey: new Map() };   // usage stays empty: see buildsHref
async function getJSON(url){
  const r = await fetch(url);   // the browser keeps it for 2 minutes (_headers), then checks for a new one
  if(!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
export const ready = (async () => {
  const [index, market] = await Promise.all([
    getJSON('data/index.json'),
    getJSON('data/market.json').catch(() => null),
  ]);
  D.index = index; D.market = market;
  const IMGS = index.imgs || {};   // images are stored short, "<key>:<path>"; the key names the image server
  for(const it of index.items){
    if(it.img){ const i = it.img.indexOf(':'), pre = IMGS[it.img.slice(0, i)]; if(pre) it.img = pre + it.img.slice(i + 1); }
    it._nl = it.n.toLowerCase();
    it._hay = [it.n, it.s, it.t, it.q, it.asc, it.reg, (it.ls || []).join(' '), (it.tags || []).join(' ')]
      .filter(Boolean).join(' ').toLowerCase();
    D.byKey.set(it.k + ':' + it.id, it);
  }
  // currencies live only in the market file; they join the search as their own kind
  if(market && market.items){
    for(const [key, m] of Object.entries(market.items)){
      if(!key.startsWith('c:')) continue;
      const it = {k:'c', id:key.slice(2), n:m.n, s:m.cat || 'Currency', t:m.u || '', img:m.ic, dl:m.dl};
      it._nl = it.n.toLowerCase(); it._hay = (it.n + ' ' + it.s + ' ' + it.t).toLowerCase();
      index.items.push(it); D.byKey.set('c:' + it.id, it);
    }
  }
  return D;
})();

/* ---------- market lookups ---------- */
export function priceOf(it){
  const M = D.market && D.market.items;
  if(!M) return null;
  return M[it.k + ':' + it.id] || M[it.k + ':' + it.n] || null;
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
const KIND = {g:'Gem', u:'Unique', p:'Passive', w:'Keyword', c:'Currency', b:'Build item'};
const SECTION = {g:'gems', u:'uniques', p:'tree'};
export function hrefOf(it){
  if(SECTION[it.k]) return 'explore#' + SECTION[it.k] + '=' + encodeURIComponent(it.n);
  if(it.k === 'c') return './#/currency?c=' + encodeURIComponent(it.id);
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
    if(!it.w) return '<span class="pill">No requirements</span>';
    const r20 = gemReq(it.w, 20), r1 = gemReq(it.w, 1);
    const one = 'At gem level 1: ' + (r1[0] ? 'level ' + r1[0] + ', ' : '') + ATTR.map((a, i) => r1[i + 1] ? r1[i + 1] + ' ' + a[0] : '').filter(Boolean).join(', ');
    return reqPills(r20, '<span title="' + esc(one) + '">at gem level 20</span>');
  }
  if(it.k === 'u') return reqPills(it.rq) + (it.cor ? '<span class="pill warn">Corrupted</span>' : '');
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
  if(it.k === 'u' && it.pr) f.push(...it.pr);
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
    linesOf(it, opts.full ? Infinity : 4) +
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
   Every card opens here first. The gold button is the one way on to the drill-down page. */
const PLACE = {g: 'Gems', u: 'Uniques', p: 'Passive tree', c: 'Currency'};
let OV = null, lastFocus = null;
let CUR = null, STACK = [], CLOSING = false;   // the card on show, and the cards under it (Back returns to them)
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
    out += bigLine(px.h.map(x => x[1]), 'This league, ' + px.h[0][0] + ' to today \u00b7 low ' + lo.v + ' ' + lo.u + ', high ' + hi.v + ' ' + hi.u);
  } else if(px.sp) out += bigLine(px.sp, 'Last 7 days');
  const facts = [];
  if(px.ls !== undefined) facts.push(px.ls.toLocaleString() + ' listed');
  if(px.vol) facts.push(Math.round(px.vol).toLocaleString() + ' div traded today');
  if(px.routes) facts.push('Price by currency: ' + px.routes.map(r => { const m = money(r.v); return {divine: 'Divine', exalted: 'Exalted', chaos: 'Chaos'}[r.via] + ' ' + m.v + ' ' + m.u; }).join(', '));
  if(facts.length) out += '<p class="card-facts">' + facts.map(esc).join(' \u00b7 ') + '</p>';
  return out;
}
function ensureOV(){
  if(!OV){
    OV = document.createElement('div');
    OV.className = 'ov'; OV.hidden = true;
    // no close button: clicking off the card, Esc or Back closes it
    OV.innerHTML = '<div class="ov-scrim" data-close></div><div class="ov-box" role="dialog" aria-modal="true" aria-label="Details" tabindex="-1">' +
      '<div class="ov-body"></div></div>';
    document.body.appendChild(OV);
    OV.addEventListener('click', e => {
      const t = e.target;
      if(t.closest('[data-close]')) return closeDetail();
      if(t.closest('a.btn.gold, a.uses-go')) return hideDetail();   // leaving the page: nothing to undo
      if(t.closest('.ov-back')) return history.back();
      const kw = t.closest('.kwlink');
      if(kw){ const c = keywordCard(kw.dataset.kw); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const row = t.closest('.uses-row[data-key]');
      if(row){ const c = D.byKey.get(row.dataset.key); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
      const tab = t.closest('.uses-tab');
      if(tab){ const sec = tab.closest('.uses'); sec.dataset.on = tab.dataset.g; paintUses(sec); return; }
      if(t.closest('.fullstats') && CUR && CUR.opts.onFull){ const f = CUR.opts.onFull; closeDetail(); setTimeout(f, 60); }
    });
    addEventListener('keydown', e => { if(e.key === 'Escape' && !OV.hidden) closeDetail(); });
    addEventListener('popstate', () => {
      if(OV.hidden) return;
      if(CLOSING){ CLOSING = false; STACK = []; CUR = null; hideDetail(); return; }
      if(STACK.length){ CUR = STACK.pop(); paintDetail(); OV.querySelector('.ov-box').scrollTop = 0; }
      else hideDetail();
    });
  }
}
/* the same popup for anything else (e.g. the Suggest box) */
export function openBox(node, label = 'Details'){
  ensureOV();
  CUR = null; STACK = [];
  OV.querySelector('.ov-box').setAttribute('aria-label', label);
  OV.querySelector('.ov-body').replaceChildren(node);
  showOV();
}
/* opts.nested: opened from inside the popup (a keyword, or something that uses it): Back returns.
   opts.onFull: the drill-down page's own full-stats panel, offered as a button. */
export function openDetail(it, opts = {}, href){
  ensureOV();
  const nested = !OV.hidden && CUR && opts.nested;
  if(nested) STACK.push(CUR); else STACK = [];
  CUR = {it, opts, href};
  paintDetail();
  if(nested){ history.pushState({ov: STACK.length + 1}, '', location.href); OV.querySelector('.ov-box').scrollTop = 0; }
  else showOV();
}
function paintDetail(){
  const {it, opts, href} = CUR;
  OV.querySelector('.ov-box').setAttribute('aria-label', 'Details');
  const px = opts.price !== undefined ? opts.price : priceOf(it);
  const body = OV.querySelector('.ov-body');
  const c = card(it, {...opts, href: null, rank: undefined, full: true, detail: true, extra: (opts.extra || '') + detailExtras(it, px)});
  c.classList.add('detail');
  body.replaceChildren(c);
  if(STACK.length) body.insertAdjacentHTML('afterbegin', '<button type="button" class="btn ov-back">\u2190 Back to ' + esc(STACK[STACK.length - 1].it.n) + '</button>');
  const chips = kwChips(it);
  if(chips) body.insertAdjacentHTML('beforeend', chips);
  const uses = usesSection(it);
  if(uses) body.appendChild(uses);
  const tradeable = /^[ugcb]$/.test(it.k);
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
      } finally { tb.disabled = false; }
    });
  }
}
function showOV(){
  lastFocus = document.activeElement;
  OV.hidden = false;
  document.body.classList.add('ov-open');
  history.pushState({ov: 1}, '', location.href);   // the back button closes the popup
  OV.querySelector('.ov-box').focus({preventScroll: true});
}
function hideDetail(){
  if(!OV || OV.hidden) return;
  OV.hidden = true;
  document.body.classList.remove('ov-open');
  if(lastFocus && lastFocus.focus) lastFocus.focus({preventScroll: true});
}
function closeDetail(){
  const depth = (history.state && history.state.ov) || 0;   // the popup and every card opened inside it
  if(depth){ CLOSING = true; history.go(-depth); }   // popstate hides it
  else { STACK = []; hideDetail(); }
}

/* ---------- keywords: what uses what ----------
   Every gem, unique, passive and keyword lists the keywords its game text marks (data/index.json "kw").
   A keyword's card turns that around: everything that uses it, by kind. Atlas and currency text has no marks,
   so it is matched by the words the keyword shows as ("f": Ignited, Ignites...). */
let REV = null, ATLAS = null;
const SEC = {g: 'gems', u: 'uniques', p: 'tree'};
function rev(){
  if(!REV){
    REV = {};
    for(const x of D.index.items) for(const k of x.kw || []) (REV[k] = REV[k] || []).push(x);
  }
  return REV;
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
const reEsc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function wordsOf(it){ return new RegExp('\\b(' + [it.n, ...(it.f || [])].map(reEsc).join('|') + ')\\b'); }
const USE_KINDS = [['u', 'Uniques'], ['g', 'Gems'], ['p', 'Passives'], ['a', 'Atlas'], ['c', 'Currency'], ['w', 'Keywords']];
function usesSection(it){
  const id = keywordIdOf(it);
  if(!id) return null;
  const R = (rev()[id] || []).filter(x => x !== it), re = wordsOf(it);
  const groups = {u: [], g: [], p: [], a: null, c: [], w: []};
  for(const x of R) if(groups[x.k]) groups[x.k].push(x);
  for(const x of D.index.items) if(x.k === 'c' && re.test(x.t || '')) groups.c.push(x);
  const pv = x => { const p = priceOf(x); return p && p.v || 0; };
  groups.u.sort((a, b) => pv(b) - pv(a)); groups.c.sort((a, b) => pv(b) - pv(a));
  for(const k of 'gpw') groups[k].sort((a, b) => a.n.localeCompare(b.n));
  const sec = document.createElement('section');
  sec.className = 'uses';
  sec._g = groups; sec._id = id;
  sec.dataset.on = (USE_KINDS.find(([k]) => groups[k] && groups[k].length) || ['u'])[0];
  paintUses(sec);
  atlasUses(re).then(list => { groups.a = list; paintUses(sec); });
  return sec;
}
async function atlasUses(re){
  if(!ATLAS){ try { ATLAS = await (await fetch('data/atlas.json')).json(); } catch { ATLAS = {}; } }
  const out = [], A = ATLAS;
  const add = (sec, name, lines, what) => { const hit = (lines || []).find(l => re.test(l)); if(hit) out.push({sec, name, line: hit, what}); };
  for(const m of A.wmods || []) add('ways', m.a, (m.r || []).flatMap(r => r.ls || []), 'Waystone mod');
  for(const m of A.wdes || []) add('ways', m.a, m.ls, 'Desecrated waystone mod');
  for(const m of A.wemo || []) add('ways', m.n, m.ls, 'Liquid Emotion');
  for(const t of A.tabs || []) add('tabs', t.n, t.ls, 'Tablet');
  for(const t of A.tuniq || []) add('tabs', t.n, t.ls, 'Unique tablet');
  for(const m of A.tmods || []) add('tabs', m.a, m.ls, 'Tablet mod');
  for(const k of A.keys || []) add('keys', k.n, [k.t, ...(k.ls || [])].filter(Boolean), k.s || 'Key');
  for(const i of A.items || []) add('items', i.n, [...(i.ls || []), i.t].filter(Boolean), i.s || 'Atlas item');
  for(const tr of A.tree || []) for(const nd of tr.nodes || []) add('tree', nd.n, [...(nd.ls || []), ...(nd.o || [])], tr.n);
  return out;
}
function paintUses(sec){
  const G = sec._g, on = sec.dataset.on, list = G[on];
  const tabs = USE_KINDS.map(([k, l]) => '<button type="button" class="chip uses-tab" data-g="' + k + '" aria-pressed="' + (k === on) + '">' +
    l + ' <span class="ct">' + (G[k] ? G[k].length : '\u2026') + '</span></button>').join('');
  let rows;
  if(!list) rows = '<p class="note">Looking\u2026</p>';
  else if(!list.length) rows = '<p class="note">Nothing here uses it.</p>';
  else if(on === 'a') rows = list.slice(0, 60).map(x => '<a class="uses-row uses-go" href="./#/atlas?s=' + x.sec + '&q=' + encodeURIComponent(x.name) + '">' +
    '<span class="uses-t"><b>' + esc(x.name) + '</b><span>' + esc(x.what) + ' \u00b7 ' + esc(x.line) + '</span></span></a>').join('');
  else rows = list.slice(0, 60).map(x => { const p = priceOf(x);
    return '<button type="button" class="uses-row" data-key="' + esc(x.k + ':' + x.id) + '"><span class="uses-ic">' + iconHTML(x) + '</span>' +
      '<span class="uses-t"><b>' + esc(x.n) + '</b><span>' + esc(x.s || '') + '</span></span>' +
      (p && p.v !== undefined ? '<span class="uses-px">' + moneyHTML(p.v) + '</span>' : '') + '</button>'; }).join('');
  const more = (list && list.length > 60 ? '<p class="note">+' + (list.length - 60) + ' more</p>' : '') +
    (on === 'p' && list && list.length ? '<p class="note">Notables and keystones. The Passive tree shows the small ones too.</p>' : '');
  const here = /explore/.test(location.pathname) ? '' : 'explore';   // on the drill-down already: stay on the page
  const all = SEC[on] ? '<a class="btn gold" href="' + here + '#' + SEC[on] + '?kw=' + encodeURIComponent(sec._id) + '">See all in ' +
    {g: 'Gems', u: 'Uniques', p: 'Passive tree'}[on] + ' \u2192</a>' : '';
  sec.innerHTML = '<h4>Found on</h4><div class="uses-tabs">' + tabs + '</div><div class="uses-list">' + rows + '</div>' + more +
    (all && list && list.length ? '<div class="uses-all">' + all + '</div>' : '');
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
const KINDS = [['all','All'], ['g','Gems'], ['u','Uniques'], ['p','Passives'], ['c','Currency'], ['w','Keywords']];
export function search(q, kind = 'all'){
  const qs = q.trim().toLowerCase();
  const toks = qs.split(/\s+/).filter(Boolean);
  const out = [];
  if(!toks.length) return out;
  const wordStart = new RegExp('(^|[^a-z0-9])' + qs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  for(const it of D.index.items){
    if(kind !== 'all' && it.k !== kind) continue;
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
  kinds.innerHTML = KINDS.map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === 'all') + '">' + l + '<span class="ct"></span></button>').join('');
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
  host.innerHTML = '<div class="tsearch"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/>' +
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

/* ---------- router ---------- */
function route(){ const m = location.hash.match(/^#\/(\w+)/); return m ? m[1] : 'home'; }
export function params(){ const i = location.hash.indexOf('?'); return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : ''); }
const loaded = {};
async function show(){
  const r = ['home', 'build', 'currency', 'trade', 'farms', 'atlas'].includes(route()) ? route() : 'home';
  document.body.dataset.route = r;
  document.querySelectorAll('.view').forEach(v => v.hidden = v.dataset.view !== r);
  document.querySelectorAll('.tabs a[data-route]').forEach(a => { if(a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  await ready;
  if(r === 'home'){
    const q = params().get('q') || '';
    if(q !== H.q){ H.q = q; $('#q').value = q; }
    homeRender();
    if(!matchMedia('(pointer:coarse)').matches) $('#q').focus({preventScroll:true});
  } else {
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
ready.then(() => {
  // the client build (4.5.5.2) as players know it: patch 0.5.5
  $('#gamever').textContent = (D.index.v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');
  const st = $('#stamp');
  if(D.market) st.innerHTML = 'Prices: <b>' + esc(D.market.league) + '</b> · ' + ago(D.market.updated);
  else st.textContent = 'Prices not loaded yet';
  import('./league.js').then(m => m.mountLeague($('#leagueclock'))).catch(() => {});   // the league clock
  // fetch the drill-down page in the background once this page is idle, so Gems / Uniques / Passive tree open fast
  (window.requestIdleCallback || (f => setTimeout(f, 2500)))(() => {
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = 'explore'; document.head.appendChild(l);
  });
}).catch(err => {
  $('#status').innerHTML = '<span class="err">Could not load the index: ' + esc(err.message) + '</span>';
});
}
