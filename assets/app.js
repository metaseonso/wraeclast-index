/* Wraeclast Index — app shell, live cards, and the search-first home page.
   Data files (all static, served by GitHub Pages):
     data/index.json   search index built from the game data (tools/sync.py)
     data/market.json  poe.ninja prices and 7-day trends (refreshed hourly by a GitHub Action)
     data/usage.json   poe.ninja build usage for the current league (same Action)            */

export const $ = (s, el = document) => el.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---------- data ---------- */
export const D = { index: null, market: null, usage: null, byKey: new Map() };
async function getJSON(url){
  const r = await fetch(url, {cache: 'no-cache'});
  if(!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}
export const ready = (async () => {
  const [index, market, usage] = await Promise.all([
    getJSON('data/index.json'),
    getJSON('data/market.json').catch(() => null),
    getJSON('data/usage.json').catch(() => null),
  ]);
  D.index = index; D.market = market; D.usage = usage;
  for(const it of index.items){
    it._nl = it.n.toLowerCase();
    it._hay = (it.n + ' ' + (it.s||'') + ' ' + (it.t||'') + ' ' + (it.q||'')).toLowerCase();
    D.byKey.set(it.k + ':' + it.id, it);
  }
  // currencies live only in the market file; they join the search as their own kind
  if(market && market.items){
    for(const [key, m] of Object.entries(market.items)){
      if(!key.startsWith('c:')) continue;
      const it = {k:'c', id:key.slice(2), n:m.n, s:m.cat || 'Currency', t:m.u || '', img:m.ic};
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
  if(SECTION[it.k]) return 'explore.html#' + SECTION[it.k] + '=' + encodeURIComponent(it.n);
  if(it.k === 'c') return '#/currency?c=' + encodeURIComponent(it.id);
  return null;
}
/* opts.invest: {label, div, note} for build cards; opts.rank: number badge */
export function card(it, opts = {}){
  const px = opts.price !== undefined ? opts.price : priceOf(it);
  const use = usageOf(it);
  const href = opts.href !== undefined ? opts.href : hrefOf(it);
  const el = document.createElement(href ? 'a' : 'article');
  if(href) el.href = href; else el.tabIndex = 0;
  el.className = 'card k-' + it.k;
  const tx = it.k === 'w' ? (it.d || it.t) : it.t;
  el.innerHTML =
    (opts.rank ? '<span class="card-rank">' + opts.rank + '</span>' : '') +
    '<div class="card-hd"><span class="card-ic">' + iconHTML(it) + '</span>' +
      '<div class="card-id"><h3>' + esc(it.n) + '</h3><p class="card-sub">' + esc(it.s || '') + '</p></div>' +
      (px && px.v !== undefined ? '<div class="card-px"><b>' + moneyHTML(px.v) + '</b>' + change(px.ch) + '</div>' : '') +
    '</div>' +
    (tx ? '<p class="card-tx">' + esc(tx) + '</p>' : '') +
    (opts.invest ? '<div class="card-inv"><span>' + esc(opts.invest.label) + '</span><b>' +
      (opts.invest.div !== undefined ? moneyHTML(opts.invest.div) : esc(opts.invest.note || '')) + '</b></div>' : '') +
    '<div class="card-ft">' + (px ? spark(px.sp, px.ch) : '') +
      (use !== null ? '<span class="use" title="Share of poe.ninja builds in ' + esc(D.usage && D.usage.league || 'the current league') +
        ' that use this">in ' + (use >= 10 ? Math.round(use) : trim(use, 1)) + '% of builds</span>' : '') +
      (px && px.ls !== undefined && px.ls < 3 ? '<span class="use" title="Few listings: this is one asking price, not a market">thin market</span>' : '') +
      '<span class="kind">' + (opts.kind || KIND[it.k] || '') + '</span></div>';
  if(!href) el.addEventListener('click', () => el.classList.toggle('open'));
  if(!href) el.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); el.classList.toggle('open'); } });
  return el;
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
  return list.slice(0, 24).map(x => x.it);
}

/* ---------- home view ---------- */
const H = {q:'', kind:'all', shown:36, list:[]};
function homeInit(){
  const q = $('#q'), kinds = $('#kinds');
  kinds.innerHTML = KINDS.map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === 'all') + '">' + l + '<span class="ct"></span></button>').join('');
  kinds.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    H.kind = b.dataset.k; H.shown = 36;
    [...kinds.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    homeRender(); q.focus();
  });
  let raf = 0;
  q.addEventListener('input', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { H.q = q.value; H.shown = 36; homeRender(); syncHash(); }); });
  q.addEventListener('keydown', e => {
    if(e.key === 'Escape'){ q.value = ''; H.q = ''; homeRender(); syncHash(); }
    if(e.key === 'Enter'){ const first = $('#cards .card'); if(first) first.click(); }
  });
  $('#more button').addEventListener('click', () => { H.shown += 36; homeRender(); });
  document.addEventListener('keydown', e => {
    if(e.key === '/' && document.activeElement !== q && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && route() === 'home'){
      e.preventDefault(); q.focus();
    }
  });
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
  const shown = list.slice(0, H.shown);
  flow($('#cards'), shown.map(it => ({key: it.k + ':' + it.id, it})), x => card(x.it));
  more.hidden = list.length <= H.shown;
  if(has && !list.length){
    $('#cards').innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing matches</h3><p>Try fewer words, or another spelling.</p></div>';
  }
}

/* ---------- router ---------- */
function route(){ const m = location.hash.match(/^#\/(\w+)/); return m ? m[1] : 'home'; }
export function params(){ const i = location.hash.indexOf('?'); return new URLSearchParams(i >= 0 ? location.hash.slice(i + 1) : ''); }
const loaded = {};
async function show(){
  const r = ['home', 'build', 'currency'].includes(route()) ? route() : 'home';
  document.querySelectorAll('.view').forEach(v => v.hidden = v.dataset.view !== r);
  document.querySelectorAll('.tabs a[data-route]').forEach(a => { if(a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  await ready;
  if(r === 'home'){
    const q = params().get('q') || '';
    if(q !== H.q){ H.q = q; $('#q').value = q; }
    homeRender();
    if(!matchMedia('(pointer:coarse)').matches) $('#q').focus({preventScroll:true});
  } else {
    if(!loaded[r]) loaded[r] = import('./' + r + '.js').then(m => m.mount($('#view-' + r)));
    const m = await loaded[r];
    if(m && m.update) m.update();
  }
}

/* ---------- boot ---------- */
homeInit();
addEventListener('hashchange', show);
show();
ready.then(() => {
  $('#gamever').textContent = D.index.v || '';
  const st = $('#stamp');
  if(D.market) st.innerHTML = 'Prices: <b>' + esc(D.market.league) + '</b> · ' + ago(D.market.updated);
  else st.textContent = 'Prices not loaded yet';
}).catch(err => {
  $('#status').innerHTML = '<span class="err">Could not load the index: ' + esc(err.message) + '</span>';
});
