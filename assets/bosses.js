/* Bosses tab: every endgame boss in the game files, what it drops and what it costs to get in.
   Data: data/bosses.json (tools/bosses.py). The area, its level and the game's own pinnacle marking are game data.
   The boss names come from Path of Building; the drop pools and the entry items from Exiled Exchange 2 and Path of
   Building, checked against the game's own drop limits; the drop rates are the PoE2 Wiki's community samples, and
   every rate says so where it is shown. Nothing in the game files states a drop rate.
   Prices: data/bossprices.json (worker/prices.js) resolves every name at once from the hourly unique checks, the
   in-game Currency Exchange and the trade searches in data/bossqueries.json; a name it does not carry falls back to
   the card's own market price. Real prices only, and a rate never meets one: no value per kill, here or anywhere. */
import { D, $, esc, card, openDetail, priceOf, hrefOf, moneyHTML, change, spark, ago, params } from './app.js';

const SHOW = [['all', 'All'], ['pin', 'Pinnacle'], ['drops', 'With drops']];
const SORTS = [['name', 'Name'], ['way', 'Way in']];
const S = {q: '', show: 'all', sort: 'name'};
let EL, B = null, BP = null, ROWS = [], WIRED = false;

async function getJSON(url){
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const num = v => typeof v === 'number' && isFinite(v);
const hay = (...xs) => xs.flat(3).filter(Boolean).join(' ').toLowerCase();
const has = (h, q) => !q || q.split(/\s+/).every(t => h.includes(t));
// "235 and 100", the way the sample sizes read in a sentence
const andList = a => a.length < 2 ? String(a[0]) : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ---------- items: the index card when there is one, else a plain item ---------- */
let NAMES = null, LOWER = null;
function indexed(n){
  if(!NAMES){
    NAMES = new Map(); LOWER = new Map();
    const rank = {u: 0, g: 1, a: 2, c: 3};   // a lineage gem is both a gem and an exchange item: the gem card wins
    for(const it of D.index.items){
      if(!(it.k in rank)) continue;
      const cur = NAMES.get(it.n);
      if(!cur || rank[it.k] < rank[cur.k]){ NAMES.set(it.n, it); LOWER.set(it._nl, it); }
    }
  }
  return NAMES.get(n) || LOWER.get(n.toLowerCase()) || null;   // the wiki's tables carry the odd lower-case word
}
/* One item's price. The boss file's own endpoint first (it already picked the cheapest base that is really
   listed, and a null there means the last check found nobody selling), then the card's own market price.
   A catalogue row with no price and no check behind it is not a price: it is left out. */
function money(name, found){
  const M = (D.market && D.market.items) || {};
  const bp = BP && BP.items && BP.items[name];   // keyed by the name data/bosses.json writes
  const key = found ? found.n : name;
  const own = (found && priceOf(found)) || M['c:' + key] || M['u:' + key] || null;
  const m = own && (num(own.v) || own.src) ? own : null;
  if(!bp) return m;
  return bp.src === 'cx' && m ? {...m, ...bp} : bp;   // the same Currency Exchange number, with its 7-day line
}
const KOF = {unique: 'u', gem: 'g', item: 'c'};
function thing(name, kind, base){
  const found = indexed(name);
  const px = money(name, found);
  if(found) return {n: name, it: found, px, href: hrefOf(found), base: base || null};
  return {n: name, it: {k: KOF[kind] || 'c', id: name, n: name, s: base || ''}, px, href: null, plain: true,
    kind, base: base || null};
}

/* ---------- a boss row ---------- */
/* What a boss drops: the drop pool first, then anything only the wiki's rate table names (the two feeds are kept
   apart in the data, so each row carries the feeds that named it). */
function dropsOf(b){
  const rates = new Map();
  for(const r of (b.rates && b.rates.rows) || []){
    if(!rates.has(r.item)) rates.set(r.item, []);
    rates.get(r.item).push(r);
  }
  const out = [], seen = new Set();
  for(const d of b.drops || []){
    seen.add(d.name);
    out.push({...thing(d.name, d.kind, d.base), src: d.src || [], rate: rates.get(d.name) || []});
  }
  for(const [name, rows] of rates)
    if(!seen.has(name)) out.push({...thing(name, ''), src: [b.rates.src], rate: rows});
  return out;
}
const priceOrder = (a, x) => {   // what really sells first, cheapest at the top; the rest keep the feed's order
  const p = a.px && num(a.px.v) ? a.px.v : null, q = x.px && num(x.px.v) ? x.px.v : null;
  return p === null && q === null ? 0 : p === null ? 1 : q === null ? -1 : p - q;
};
function row(b, i){
  const access = (b.access || []).map(n => thing(n, 'item')).sort(priceOrder);
  const drops = dropsOf(b);
  return {b, i, access, drops, way: access[0] || null,
    h: hay(b.name, b.areas, b.pinnacle ? 'pinnacle' : '', access.map(x => x.n), drops.map(x => x.n))};
}
const wayValue = r => r.way && r.way.px && num(r.way.px.v) ? r.way.px.v : null;

/* ---------- small pieces ---------- */
const ICONS = new Map();
function icon(it){   // the live card's own icon, so a row always matches the card it opens
  const k = it.k + ':' + it.id;
  if(!ICONS.has(k)) ICONS.set(k, card(it, {detail: true, price: null, href: null, builds: false}).querySelector('.card-ic').innerHTML);
  return ICONS.get(k);
}
function priceHTML(x){
  if(x.px && num(x.px.v)) return spark(x.px.sp, x.px.ch) + '<span class="fm-p">' + moneyHTML(x.px.v) + '</span>' + change(x.px.ch);
  return '<span class="fm-p none">' + (x.px ? 'none listed' + (x.px.at ? ' · ' + esc(ago(x.px.at)) : '') : 'no price') + '</span>';
}
function rateHTML(rows){
  if(!rows.length) return '<span class="bo-r none">no sample</span>';   // never a blank cell: blank would read as zero
  return rows.map(r => {
    const tag = [r.mode, r.group].filter(Boolean).join(' · ').replace(/\.\.\.$/, '…');
    return '<span class="bo-r"><b>' + esc(r.rate) + '</b>' + (tag ? '<i>' + esc(tag) + '</i>' : '') + '</span>';
  }).join('');
}
/* Where a rate came from, inline, wherever a rate is shown. */
function rateSrc(rates){
  const smp = [...new Set((rates.rows || []).map(r => r.sample).filter(num))];
  const kills = smp.length ? ' - ' + andList(smp) + ' kills' : '';
  return 'Drop rates according to: ' + rates.src + kills + (rates.patch ? (kills ? ', patch ' : ' - patch ') + rates.patch : '');
}
function subOf(x){
  const bits = [];
  if(x.base) bits.push(x.base);
  if(x.src && x.src.length) bits.push(x.src.join(', '));
  return bits.join(' · ');
}
function itemRow(x, key, rated){
  const sub = subOf(x);
  return '<button type="button" class="bo-item' + (rated ? ' rated' : '') + '" data-bo="' + key + '">' +
    '<span class="card-ic">' + icon(x.it) + '</span>' +
    '<span class="bo-it"><b>' + esc(x.n) + '</b>' + (sub ? '<span>' + esc(sub) + '</span>' : '') + '</span>' +
    priceHTML(x) + (rated ? '<span class="bo-rate">' + rateHTML(x.rate || []) + '</span>' : '') + '</button>';
}

/* ---------- the boss card ---------- */
function bossItem(b){
  const where = (b.areas || []).join(' · ');
  return {k: 'x', id: b.name, n: b.name, s: where + (num(b.level) ? (where ? ' · ' : '') + 'area level ' + b.level : '')};
}
function itemOpts(r, x){
  const o = {price: x.px, href: x.href, nested: true};
  if(x.plain){ o.builds = false; if(x.kind === 'item') o.kind = 'Item'; }   // no card of its own: don't call it currency
  const rate = (x.rate || []).length
    ? '<p class="card-facts">From ' + esc(r.b.name) + ': ' + (x.rate).map(q => esc(q.rate) +
        ([q.mode, q.group].filter(Boolean).length ? ' (' + esc([q.mode, q.group].filter(Boolean).join(' · ').replace(/\.\.\.$/, '…')) + ')' : '')).join(' · ') +
      '</p><p class="note">' + esc(rateSrc(r.b.rates)) + '</p>'
    : '';
  o.extra = rate;
  return o;
}
function openBoss(r){
  const b = r.b, rated = !!(b.rates && (b.rates.rows || []).length);
  const pills = [];
  if(b.pinnacle) pills.push('<span class="pill">Pinnacle</span>');
  if(num(b.level)) pills.push('<span class="pill">Area level ' + b.level + '</span>');
  if(r.drops.length) pills.push('<span class="pill">' + r.drops.length + (r.drops.length === 1 ? ' drop' : ' drops') + '</span>');
  const extra =
    (pills.length ? '<div class="card-req">' + pills.join('') + '</div>' : '') +
    (r.access.length ? '<div class="bo-sec"><p class="lbl">Way in</p><div class="bo-tbl">' +
      r.access.map((x, i) => itemRow(x, r.i + ':a:' + i, false)).join('') +
      '</div><p class="note">Way in according to: Exiled Exchange 2.</p></div>' : '') +
    (r.drops.length ? '<div class="bo-sec"><p class="lbl">What it drops</p>' +
      (rated ? '<div class="bo-thd"><span>Item</span><span>Price</span><span>Drop rate</span></div>' : '') +
      '<div class="bo-tbl">' + r.drops.map((x, i) => itemRow(x, r.i + ':d:' + i, rated)).join('') + '</div>' +
      (rated ? '<p class="note">' + esc(rateSrc(b.rates)) + '</p>' : '') + '</div>'
      : '<p class="fm-miss">No feed names what this one drops.</p>');
  openDetail(bossItem(b), {price: null, builds: false, href: null, kind: b.pinnacle ? 'Pinnacle boss' : 'Boss', extra}, null);
}
/* The item rows live in the card's own HTML, so the popup redraws them itself on Back: one listener on the page,
   not on a card that gets replaced. */
function wire(){
  if(WIRED) return;
  WIRED = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest('.bo-item[data-bo]');
    if(!btn) return;
    const [i, sec, ix] = btn.dataset.bo.split(':');
    const r = ROWS[+i];
    const x = r && (sec === 'a' ? r.access : r.drops)[+ix];
    if(x) openDetail(x.it, itemOpts(r, x), x.href);
  });
}

/* ---------- the list ---------- */
/* A boss no feed covers keeps its name, area and level and nothing else: the last two cells are left off the row
   rather than filled with a dash. */
function listRow(r){
  const b = r.b, known = r.access.length || r.drops.length;
  return '<button type="button" class="bo-row" data-i="' + r.i + '">' +
    '<span class="bo-n"><b>' + esc(b.name) + '</b>' + (b.pinnacle ? '<small>Pinnacle</small>' : '') + '</span>' +
    '<span class="bo-w">' + esc((b.areas || []).join(', ')) + '</span>' +
    '<span class="bo-lv"><i class="l">Level</i>' + (num(b.level) ? b.level : '—') + '</span>' +
    (known ? '<span class="bo-in">' + wayHTML(r) + '</span>' +
      '<span class="bo-d"><i class="l">Drops</i>' + (r.drops.length || '—') + '</span>' : '') +
    '</button>';
}
function wayHTML(r){
  if(!r.access.length) return '<span class="bo-no">—</span>';
  const w = r.way, more = r.access.length - 1;
  return '<span class="bo-in-n">' + esc(w.n) + (more ? ' <i>+' + more + '</i>' : '') + '</span>' + priceHTML(w);
}

/* ---------- view ---------- */
export async function mount(el){
  EL = el;
  el.innerHTML = head() + '<p class="note">Loading…</p>';
  const [data, px] = await Promise.all([getJSON('data/bosses.json'), getJSON('data/bossprices.json')]);
  if(!data || !data.bosses){
    el.innerHTML = head() + '<p class="err">Could not load the bosses. Try again in a minute.</p>';
    return {};
  }
  B = data; BP = px;
  ROWS = data.bosses.map(row);
  wire();
  const count = {all: ROWS.length, pin: ROWS.filter(r => r.b.pinnacle).length, drops: ROWS.filter(r => r.drops.length).length};
  el.innerHTML = head() +
    '<div class="controls bo-ctl">' +
      '<div class="row"><input class="field" id="boq" type="search" autocomplete="off" spellcheck="false" ' +
        'placeholder="Search bosses, areas and drops…" aria-label="Search bosses, areas and drops">' +
        '<div class="kinds fm-chips" id="boshow" role="group" aria-label="Show">' + SHOW.map(([k, l]) =>
          '<button type="button" class="chip" data-v="' + k + '" aria-pressed="' + (k === S.show) + '">' + l +
          '<span class="ct">' + count[k] + '</span></button>').join('') + '</div></div>' +
      '<div class="row"><span class="note" id="bocount"></span><span class="grow"></span>' +
        '<span class="lbl">Sort</span><div class="seg" id="bosort" role="group" aria-label="Sort">' + SORTS.map(([k, l]) =>
          '<button type="button" data-v="' + k + '" aria-pressed="' + (k === S.sort) + '"' +
          (k === 'way' ? ' title="Cheapest way in first"' : '') + '>' + l + '</button>').join('') + '</div></div>' +
    '</div>' +
    '<div class="bo-list" id="bolist"></div>' +
    '<p class="note bo-foot">Prices: the in-game Currency Exchange and live trade site listings, every hour.' +
      (BP && BP.updated ? ' Last check ' + esc(ago(BP.updated)) + '.' : '') + '</p>' +
    '<p class="note">Only the bosses a drop feed covers have a way in and a drop list. Pinnacle is the game’s own ' +
      'marking, so a few fights players call pinnacle are not marked. Drop rates are community samples from the ' +
      '<a href="' + esc(srcURL('PoE2 Wiki')) + '" target="_blank" rel="noopener">PoE2 Wiki</a> (CC BY-NC-SA), not game data.</p>' +
    ((B.notes || []).length ? '<div class="sect"><h3>Gaps in the lists</h3></div><ul class="note bo-gaps">' +
      B.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '');

  $('#boq', el).addEventListener('input', e => { S.q = e.target.value; render(); sync(); });
  $('#boq', el).addEventListener('keydown', e => { if(e.key === 'Escape'){ e.target.value = ''; S.q = ''; render(); sync(); } });
  $('#boshow', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S.show = b.dataset.v;
    [...b.parentNode.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    render();
  });
  $('#bosort', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S.sort = b.dataset.v;
    [...b.parentNode.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    render();
  });
  $('#bolist', el).addEventListener('click', e => {
    const b = e.target.closest('.bo-row'); if(!b) return;
    openBoss(ROWS[+b.dataset.i]);
  });
  return {update};
}
const srcURL = name => ((B && B.sources) || []).reduce((u, s) => s.name === name ? s.url : u, '');
function head(){
  return '<div class="pagehd"><h2>Bosses</h2>' +
    '<p>Every endgame boss, what it drops and what it costs to get in.</p>' +
    '<p class="bo-src">Boss names: Path of Building. Drop lists: Exiled Exchange 2, checked against the game’s own drop limits.</p></div>';
}

function sync(){
  const h = '#/bosses' + (S.q.trim() ? '?q=' + encodeURIComponent(S.q.trim()) : '');
  if(location.hash !== h) history.replaceState(history.state, '', h);
}
function update(){
  if(!ROWS.length) return;
  S.q = params().get('q') || '';
  $('#boq', EL).value = S.q;
  render();
}

const byName = (a, b) => a.b.name.localeCompare(b.b.name);
const byWay = (a, b) => {   // bosses with no priced way in go last, whatever the sort
  const x = wayValue(a), y = wayValue(b);
  if(x === null && y === null) return byName(a, b);
  if(x === null) return 1;
  if(y === null) return -1;
  return x - y || byName(a, b);
};
function match(r){
  if(S.show === 'pin' && !r.b.pinnacle) return false;
  if(S.show === 'drops' && !r.drops.length) return false;
  return has(r.h, S.q.trim().toLowerCase());
}
function render(){
  if(!EL || !ROWS.length) return;
  const list = ROWS.filter(match).sort(S.sort === 'way' ? byWay : byName);
  const rated = list.filter(r => r.b.rates).length;
  $('#bocount', EL).innerHTML = '<b>' + list.length + '</b> boss' + (list.length === 1 ? '' : 'es') +
    ' · <b>' + rated + '</b> with drop rates';
  $('#bolist', EL).innerHTML = list.length
    ? '<div class="bo-hd"><span>Boss</span><span>Where</span><span>Level</span><span>Way in</span><span>Drops</span></div>' +
      list.map(listRow).join('')
    : '<div class="empty"><h3>Nothing matches</h3><p>Try fewer words.</p></div>';
}
