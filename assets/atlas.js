/* Atlas tab: waystones, tablets, keys and invitations, other atlas items, and the Atlas passive tree.
   Game data: data/atlas.json (tools/atlas.py, from the game files). Prices: data/market.json (poe.ninja, hourly).
   Every item is a live card: price and 7-day trend where poe.ninja has one, the popup, and the Trade button
   (the bulk exchange for exchange items, a trade search by base type with mod rows for tablets). */
import { D, $, esc, card, flow, params } from './app.js';

const SECTS = [['ways', 'Waystones'], ['tabs', 'Tablets'], ['keys', 'Keys & invitations'], ['items', 'Atlas items'], ['tree', 'Atlas tree']];
const HINT = {ways: 'Search waystones and mods…', tabs: 'Search tablets and mods…', keys: 'Search keys…',
  items: 'Search atlas items…', tree: 'Search the Atlas tree…'};
const SORTS = [['price', 'Price'], ['move', 'Biggest move'], ['name', 'Name']];
const WKINDS = [['all', 'All'], ['p', 'Prefixes'], ['s', 'Suffixes'], ['des', 'Desecrated'], ['emo', 'Liquid Emotions']];
const TY = {c: 'Choice', n: 'Notable', s: 'Small'};
const S = {sec: 'ways', q: '', sort: 'price', wk: 'all', tb: 'all', sub: 'all'};
let EL, A = null, CARDS = {};

/* ---------- data ---------- */
function priceOf(name){
  const M = D.market && D.market.items;
  return M ? (M['c:' + name] || M['u:' + name] || null) : null;
}
function iconOf(name, ic){
  const m = priceOf(name);
  return (m && m.ic) || ic || '';
}
const tiers = w => !w ? 'Doesn’t roll' : w[0] === 1 && w[1] === 16 ? 'Any tier' : w[0] === w[1] ? 'Tier ' + w[0] : 'Tier ' + w[0] + '–' + w[1];
const hay = (...xs) => xs.flat(3).filter(Boolean).join(' ').toLowerCase();
const has = (h, q) => !q || q.split(/\s+/).every(t => h.includes(t));

function build(){
  // waystones: one card per tier, the popup lists every mod that can roll at that tier
  const ways = A.ways.map(w => {
    const at = {p: [], s: []};
    let n = 0;
    for(const g of A.wmods) for(const r of g.r) if(r.w && r.w[0] <= w.t && w.t <= r.w[1]){ at[g.k].push(...r.ls); n++; }
    const pop = '<div class="at-pop">' + [['p', 'Prefixes'], ['s', 'Suffixes']].map(([k, l]) => at[k].length ?
      '<h4>' + l + '</h4><ul class="card-ls">' + at[k].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '').join('') + '</div>';
    const it = {k: 'c', id: w.n, n: w.n, s: 'Area level ' + w.al + ' · ' + n + ' mods can roll', img: iconOf(w.n, w.ic)};
    return {key: 'w:' + w.t, it, px: priceOf(w.n), kind: 'Waystone', extra: pop, h: hay(w.n, 'tier ' + w.t, 'level ' + w.al, at.p, at.s)};
  });
  // tablets: the base card carries its mods, so the Trade button can search them
  const tabs = A.tabs.map(t => {
    const mods = t.mods.map(i => A.tmods[i]).sort((a, b) => !!b.on - !!a.on);
    const it = {k: 'b', id: t.n, n: t.n, base: t.n, s: 'Tablet · ' + mods.length + ' mods can roll', img: iconOf(t.n, t.ic),
      ls: [...t.ls, ...mods.flatMap(m => m.ls)], ni: t.ls.length};
    return {key: 't:' + t.n, it, px: priceOf(t.n), kind: 'Tablet', h: hay(t.n, it.ls)};
  }).concat(A.tuniq.map(u => {
    const it = {k: 'u', id: u.n, n: u.n, base: u.b, s: u.b, img: iconOf(u.n, u.ic), ls: u.ls, ni: u.ni};
    return {key: 'u:' + u.n, it, px: priceOf(u.n), kind: 'Unique', note: u.note, warn: true, h: hay(u.n, u.b, u.ls)};
  }));
  // keys and items: exchange items trade on the bulk exchange, the rest by name
  const thing = sec => x => {
    const ls = x.ls ? [...x.ls, ...(x.t ? [x.t] : [])] : null;
    const it = {k: x.x ? 'c' : 'b', id: x.n, n: x.n, s: x.s, img: iconOf(x.n, x.ic)};
    if(ls) it.ls = ls; else it.t = x.t;
    if(!x.x) it.base = x.n;
    return {key: sec + ':' + x.n, it, px: priceOf(x.n), kind: x.kind, note: x.note, h: hay(x.n, x.s, x.kind, x.ls, x.t)};
  };
  CARDS = {ways, tabs, keys: A.keys.map(thing('k')), items: A.items.map(thing('i'))};
}

function make(c){
  const extra = (c.note ? '<div class="card-req"><span class="pill' + (c.warn ? ' warn' : '') + '">' + esc(c.note) + '</span></div>' : '') + (c.extra || '');
  return card(c.it, {href: null, builds: false, price: c.px, kind: c.kind, extra});
}

const SORTER = {
  price: (a, b) => ((b.px && b.px.v) ?? -1) - ((a.px && a.px.v) ?? -1),
  move: (a, b) => Math.abs((b.px && b.px.ch) ?? -1) - Math.abs((a.px && a.px.ch) ?? -1),
  name: (a, b) => a.it.n.localeCompare(b.it.n),
};

/* ---------- lists (mods, tree) ---------- */
function modRow(name, k, rows, extra){
  const same = rows.every(r => JSON.stringify(r.b || []) === JSON.stringify(rows[0].b || []));
  return '<div class="at-row"><div class="at-hd"><b>' + esc(name || (k === 'p' ? 'Prefix' : 'Suffix')) + '</b>' +
    (name ? '<span class="at-tag">' + (k === 'p' ? 'Prefix' : 'Suffix') + '</span>' : '') + '</div>' +
    '<ul class="at-ls">' + rows.map(r => '<li>' + (r.w !== undefined ? '<span class="at-t">' + tiers(r.w) + '</span>' : '') +
      '<span>' + r.ls.map(esc).join('<br>') + (!same && r.b && r.b.length ? '<small class="at-bonus">Reward: ' + r.b.map(esc).join(' · ') + '</small>' : '') +
      '</span></li>').join('') + '</ul>' +
    (same && rows[0].b && rows[0].b.length ? '<p class="at-bonus">Reward: ' + rows[0].b.map(esc).join(' · ') + '</p>' : '') +
    (extra || '') + '</div>';
}
function wayList(q){
  const out = [];
  if(S.wk === 'all' || S.wk === 'p' || S.wk === 's')
    for(const g of A.wmods) if((S.wk === 'all' || S.wk === g.k) && has(hay(g.a, g.r.map(r => [r.ls, r.b])), q)) out.push(modRow(g.a, g.k, g.r));
  if(S.wk === 'all' || S.wk === 'des')
    for(const d of A.wdes) if(has(hay(d.a, d.ls, d.b, 'desecrated'), q))
      out.push(modRow(d.a, d.k, [{ls: d.ls, b: d.b}], '<p class="at-on">Desecrated · Preserved Vertebrae</p>'));
  if(S.wk === 'all' || S.wk === 'emo')
    for(const e of A.wemo) if(has(hay(e.n, e.ls, 'liquid emotion'), q))
      out.push('<div class="at-row"><div class="at-hd"><b>' + esc(e.n) + '</b><span class="at-tag">Instilled</span></div><ul class="at-ls">' +
        e.ls.map(x => '<li><span>' + esc(x) + '</span></li>').join('') + '</ul></div>');
  return out;
}
function tabList(q){
  const all = A.tabs.length;
  return A.tmods.filter(m => (S.tb === 'all' || !m.on || m.on.includes(S.tb)) && has(hay(m.a, m.ls, m.on || 'all tablets'), q))
    .sort((a, b) => !!b.on - !!a.on)
    .map(m => modRow(m.a, m.k, [{ls: m.ls}], '<p class="at-on">' + (m.on && m.on.length < all ? esc(m.on.join(', ')) : 'All tablets') + '</p>'));
}
function treeList(q){
  const out = [];
  for(const g of A.tree){
    if(S.sub !== 'all' && S.sub !== g.n) continue;
    const rows = g.nodes.filter(n => has(hay(n.n, n.ls, n.o, TY[n.ty], g.n), q));
    if(!rows.length) continue;
    out.push('<h4 class="at-grp">' + esc(g.n) + '<span>' + rows.reduce((a, n) => a + (n.x || 1), 0) + '</span></h4>');
    out.push(...rows.map(n => '<div class="at-row"><div class="at-hd"><span class="dot t-' + n.ty + '"></span><b>' + esc(n.n) + '</b>' +
      (n.x ? '<span class="at-x">×' + n.x + '</span>' : '') + '<span class="at-tag">' + TY[n.ty] + '</span></div>' +
      '<ul class="card-ls">' + n.ls.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' +
      (n.o ? '<div class="at-opts"><span>Options</span><ul class="at-ls">' + n.o.map(x => '<li><span>' + esc(x) + '</span></li>').join('') + '</ul></div>' : '') +
      '</div>'));
  }
  return out;
}

/* ---------- view ---------- */
export async function mount(el){
  EL = el;
  el.innerHTML = '<div class="pagehd"><h2>Atlas</h2><p>Waystones, tablets, keys and the Atlas tree.' +
    (D.market ? ' Prices: ' + esc(D.market.league) + ', every hour.' : '') + '</p></div><p class="note">Loading…</p>';
  try {
    const r = await fetch('data/atlas.json', {cache: 'no-cache'});
    if(!r.ok) throw new Error(r.status);
    A = await r.json();
  } catch(e){
    el.querySelector('.note').outerHTML = '<p class="err">Could not load the Atlas data. Try again in a minute.</p>';
    return {};
  }
  build();
  el.innerHTML =
    '<div class="pagehd"><h2>Atlas</h2><p>Waystones, tablets, keys and the Atlas tree. Patch ' + esc(A.patch) +
      (D.market ? ' · prices ' + esc(D.market.league) + ', every hour.' : '.') + '</p></div>' +
    '<div class="kinds at-secs" id="atsec" role="group" aria-label="Section">' + SECTS.map(([k, l]) =>
      '<button type="button" class="chip" data-v="' + k + '" aria-pressed="' + (k === S.sec) + '">' + l + '<span class="ct"></span></button>').join('') + '</div>' +
    '<div class="at-bar"><input class="field" id="atq" type="search" autocomplete="off" spellcheck="false">' +
      '<div class="seg" id="atsort" role="group" aria-label="Sort">' + SORTS.map(([k, l]) =>
        '<button type="button" data-v="' + k + '" aria-pressed="' + (k === S.sort) + '">' + l + '</button>').join('') + '</div></div>' +
    '<p class="status at-status" id="atstatus"></p>' +
    '<div class="cards" id="atcards"></div>' +
    '<div class="sect" id="atlhd"><h3></h3><div class="seg" id="atlseg" role="group"></div></div>' +
    '<div class="at-list" id="atlist"></div>';

  $('#atsec', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b || b.dataset.v === S.sec) return;
    S.sec = b.dataset.v;
    render(true); sync();
  });
  $('#atq', el).addEventListener('input', e => { S.q = e.target.value; render(); sync(); });
  $('#atq', el).addEventListener('keydown', e => { if(e.key === 'Escape'){ e.target.value = ''; S.q = ''; render(); sync(); } });
  $('#atsort', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S.sort = b.dataset.v; render();
  });
  $('#atlseg', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S[{ways: 'wk', tabs: 'tb', tree: 'sub'}[S.sec]] = b.dataset.v; render();
  });
  return {update};
}

function sync(){
  const p = new URLSearchParams();
  if(S.sec !== 'ways') p.set('s', S.sec);
  if(S.q.trim()) p.set('q', S.q.trim());
  const h = '#/atlas' + (p.toString() ? '?' + p : '');
  if(location.hash !== h) history.replaceState(history.state, '', h);
}

function update(){
  if(!A) return;
  const p = params();
  const s = p.get('s');
  S.sec = s && SECTS.some(x => x[0] === s) ? s : 'ways';
  S.q = p.get('q') || '';
  $('#atq', EL).value = S.q;
  render(true);
}

function render(fresh){
  const q = S.q.trim().toLowerCase();
  for(const b of $('#atsec', EL).children){
    b.setAttribute('aria-pressed', String(b.dataset.v === S.sec));
    const ct = b.querySelector('.ct');
    if(!q) ct.textContent = '';
    else ct.textContent = b.dataset.v === 'tree' ? treeCount(q) : b.dataset.v === 'ways' ? CARDS.ways.filter(c => has(c.h, q)).length + wayList(q).length
      : CARDS[b.dataset.v].filter(c => has(c.h, q)).length + (b.dataset.v === 'tabs' ? tabList(q).length : 0);
  }
  const qi = $('#atq', EL);
  qi.placeholder = HINT[S.sec];
  qi.setAttribute('aria-label', HINT[S.sec].replace('…', ''));
  const sorted = S.sec === 'tabs' || S.sec === 'keys' || S.sec === 'items';
  $('#atsort', EL).hidden = !sorted;
  for(const b of $('#atsort', EL).children) b.setAttribute('aria-pressed', String(b.dataset.v === S.sort));

  // cards
  const grid = $('#atcards', EL);
  if(fresh) grid.replaceChildren();
  let list = S.sec === 'tree' ? [] : CARDS[S.sec].filter(c => has(c.h, q));
  if(sorted) list = [...list].sort(SORTER[S.sort]);
  grid.hidden = S.sec === 'tree';
  flow(grid, list, make);

  // the list under the cards
  const lhd = $('#atlhd', EL), seg = $('#atlseg', EL), box = $('#atlist', EL);
  let rows = [], title = '', opts = null, cur = null;
  if(S.sec === 'ways'){ title = 'Waystone mods'; opts = WKINDS; cur = S.wk; rows = wayList(q); }
  else if(S.sec === 'tabs'){ title = 'Tablet mods'; opts = [['all', 'All'], ...A.tabs.map(t => [t.n, t.n.replace(/ Tablet$/, '')])]; cur = S.tb; rows = tabList(q); }
  else if(S.sec === 'tree'){ title = 'Atlas tree'; opts = [['all', 'All'], ...A.tree.map(g => [g.n, g.n])]; cur = S.sub; rows = treeList(q); }
  lhd.hidden = box.hidden = !opts;
  if(opts){
    lhd.querySelector('h3').textContent = title;
    seg.setAttribute('aria-label', title);
    seg.innerHTML = opts.map(([k, l]) => '<button type="button" data-v="' + esc(k) + '" aria-pressed="' + (k === cur) + '">' + esc(l) + '</button>').join('');
    box.innerHTML = rows.length ? rows.join('') : '<div class="empty"><h3>Nothing matches</h3><p>Try fewer words.</p></div>';
  }
  const shown = list.length, lines = S.sec === 'tree' ? treeCount(q, S.sub) : rows.filter(r => r.startsWith('<div')).length;
  $('#atstatus', EL).innerHTML = S.sec === 'tree' ? '<b>' + lines + '</b> of ' + treeCount('', S.sub) + ' passives' :
    '<b>' + shown + '</b> item' + (shown === 1 ? '' : 's') + (opts ? ' · <b>' + lines + '</b> mods' : '');
  if(S.sec !== 'tree' && !shown) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing matches</h3><p>Try fewer words.</p></div>';
}
function treeCount(q, sub = 'all'){
  let n = 0;
  for(const g of A.tree) if(sub === 'all' || sub === g.n) for(const x of g.nodes) if(has(hay(x.n, x.ls, x.o, TY[x.ty], g.n), q)) n += x.x || 1;
  return n;
}
