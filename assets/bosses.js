/* Bosses tab: every endgame boss in the game files, what it drops and what it costs to get in.
   Data: data/bosses.json (tools/bosses.py). The areas, each area's own level and the game's own pinnacle marking
   are game data. The boss names come from Path of Building; the drop pools and the entry items from Exiled
   Exchange 2 and Path of Building, joined to a boss on item names and nothing else (three of them were checked
   by hand against the game's drop limits, nothing more); the drop rates are the PoE2 Wiki's community samples,
   and every rate says so where it is shown. Nothing in the game files states a drop rate.
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
// "a, b and c", the way a list reads in a sentence
const andList = a => a.length < 2 ? String(a[0]) : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1];

/* ---------- items: the index card when there is one, else a plain item ---------- */
let NAMES = null, LOWER = null, IDS = null;
function indexed(n, base){
  if(!NAMES){
    NAMES = new Map(); LOWER = new Map(); IDS = new Map();
    const rank = {u: 0, g: 1, a: 2, c: 3};   // a lineage gem is both a gem and an exchange item: the gem card wins
    for(const it of D.index.items){
      if(!(it.k in rank)) continue;
      IDS.set(it.id.toLowerCase(), it);
      const cur = NAMES.get(it.n);
      if(!cur || rank[it.k] < rank[cur.k]){ NAMES.set(it.n, it); LOWER.set(it._nl, it); }
    }
  }
  // a unique on several bases has a card per base; the drop feed names the base, so open that one and not
  // whichever of them the index happens to list first
  return (base && IDS.get((n + ' | ' + base).toLowerCase())) ||
    NAMES.get(n) || LOWER.get(n.toLowerCase()) || null;   // the wiki's tables carry the odd lower-case word
}
/* One item's price. The boss file's own endpoint first (it already picked the cheapest base that is really
   listed, carries that base and its 7-day line, and a null there means the last check found nobody selling),
   then the card's own market price. A catalogue row with no price and no check behind it is not a price:
   it is left out. */
function money(name, found){
  const M = (D.market && D.market.items) || {};
  const bp = BP && BP.items && BP.items[name];   // keyed by the name data/bosses.json writes
  if(bp) return bp;
  const key = found ? found.n : name;
  const own = (found && priceOf(found)) || M['c:' + key] || M['u:' + key] || null;
  return own && (num(own.v) || own.src) ? own : null;
}
const KOF = {unique: 'u', gem: 'g', item: 'c'};
function thing(name, kind, base){
  const found = indexed(name, base);
  const px = money(name, found);
  if(found) return {n: found.n, it: found, px, href: hrefOf(found), base: base || null};
  return {n: name, it: {k: KOF[kind] || 'c', id: name, n: name, s: base || ''}, px, href: null, plain: true,
    kind, base: base || null};
}

/* ---------- a boss row ---------- */
/* What a boss drops: the drop pool first, then anything only the wiki's rate table names (the two feeds are kept
   apart in the data, so each row carries the feeds that named it). */
function dropsOf(b){
  const rates = new Map();   // keyed low: the wiki's odd lower-case word still meets the drop feed's own row
  for(const r of (b.rates && b.rates.rows) || []){
    const k = r.item.toLowerCase();
    if(!rates.has(k)) rates.set(k, {name: r.item, rows: []});
    rates.get(k).rows.push(r);
  }
  const out = [], seen = new Set();
  for(const d of b.drops || []){
    const k = d.name.toLowerCase();
    seen.add(k);
    out.push({...thing(d.name, d.kind, d.base), src: d.src || [], rate: (rates.get(k) || {rows: []}).rows});
  }
  for(const [k, got] of rates)
    if(!seen.has(k)) out.push({...thing(got.name, ''), src: [b.rates.src], rate: got.rows});
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
    h: hay(b.name, areaNames(b), b.pinnacle ? 'pinnacle' : '', access.map(x => x.n), drops.map(x => x.n))};
}
const wayValue = r => r.way && r.way.px && num(r.way.px.v) ? r.way.px.v : null;

/* ---------- small pieces ---------- */
const ICONS = new Map();
function icon(it){   // the live card's own icon, so a row always matches the card it opens
  const k = it.k + ':' + it.id;
  if(!ICONS.has(k)) ICONS.set(k, card(it, {detail: true, price: null, href: null, builds: false}).querySelector('.card-ic').innerHTML);
  return ICONS.get(k);
}
/* The three price pieces go out as one element: .bo-item is a grid with a fixed column count, and a loose
   change badge would land in a column of its own. */
function priceHTML(x){
  const inner = x.px && num(x.px.v)
    ? spark(x.px.sp, x.px.ch) + '<span class="fm-p">' + moneyHTML(x.px.v) + '</span>' + change(x.px.ch)
    : '<span class="fm-p none">' + (x.px ? 'none listed' + (x.px.at ? ' · ' + esc(ago(x.px.at)) : '') : 'no price') + '</span>';
  return '<span class="bo-px">' + inner + '</span>';
}
/* A rate carries its own sample: a number the wiki took over 50 kills must never inherit another row's count,
   and most pages sample some rows and not others. */
const rateTag = r => [r.mode, (r.group || '').replace(/\.\.\.$/, '…'), num(r.sample) ? r.sample + ' kills' : null]
  .filter(Boolean).join(' · ');
function rateHTML(rows){
  if(!rows.length) return '<span class="bo-r none">no sample</span>';   // never a blank cell: blank would read as zero
  return rows.map(r => {
    const tag = rateTag(r);
    return '<span class="bo-r"><b>' + esc(r.rate) + '</b>' + (tag ? '<i>' + esc(tag) + '</i>' : '') + '</span>';
  }).join('');
}
/* Where a rate came from, inline, wherever a rate is shown. The kill count is not here: it sits on the row
   it was taken on. */
function rateSrc(rates){
  return 'Drop rates according to: ' + rates.src + (rates.patch ? ', patch ' + rates.patch : '');
}
/* Where the drop list came from. Exiled Exchange 2 names no boss anywhere: it lists a pool of items behind an
   entry item, and that pool lands on this boss because two or more of its items are ones Path of Building or
   the wiki already put here. The join is the site's, so the line says what was joined instead of handing the
   reader a source that does not carry the claim. */
const FEEDS = [['Path of Building', 'the source lines in Path of Building'],
  ['Exiled Exchange 2', 'the pool Exiled Exchange 2 lists behind the entry items above'],
  ['PoE2 Wiki', 'the PoE2 Wiki’s own rate table']];
function dropSrc(r){
  const seen = new Set(r.drops.flatMap(x => x.src || []));
  const bits = FEEDS.filter(([f]) => seen.has(f)).map(([, text]) => text);
  return bits.length ? 'Drop list: ' + andList(bits) + '.' : '';
}
function subOf(x){
  const bits = [];
  if(x.base) bits.push(x.base);
  // the endpoint prices the cheapest base really listed, which is not always the base the drop feed names
  if(x.px && x.px.base && x.px.base !== x.base) bits.push('cheapest on ' + x.px.base);
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

/* ---------- areas and their levels ----------
   Every area keeps its own level: the same fight is 65 on Obscure Island and 80 in the Kalguuran Tomb, and both
   are game data, so no area's name is ever printed next to another area's level. */
const areaNames = b => (b.areas || []).map(a => a.name);
const areaLevel = a => !num(a.lo) ? '' : !num(a.hi) || a.hi === a.lo ? String(a.lo) : a.lo + '-' + a.hi;
const whereText = b => (b.areas || []).map(a => a.name + (areaLevel(a) ? ' ' + areaLevel(a) : '')).join(' · ');
function levelText(b){   // the whole span the fight is run at, for the one narrow column on the list
  const ns = [];
  for(const a of b.areas || []){ if(num(a.lo)) ns.push(a.lo); if(num(a.hi)) ns.push(a.hi); }
  if(!ns.length) return '';
  const lo = Math.min(...ns), hi = Math.max(...ns);
  return lo === hi ? String(lo) : lo + '-' + hi;
}

/* ---------- the boss card ---------- */
const bossItem = b => ({k: 'x', id: b.name, n: b.name, s: whereText(b)});
function itemOpts(r, x){
  const o = {price: x.px, href: x.href, nested: true};
  if(x.plain){ o.builds = false; if(x.kind === 'item') o.kind = 'Item'; }   // no card of its own: don't call it currency
  const rate = (x.rate || []).length
    ? '<p class="card-facts">From ' + esc(r.b.name) + ': ' + (x.rate).map(q => {
        const tag = rateTag(q);
        return esc(q.rate) + (tag ? ' (' + esc(tag) + ')' : '');
      }).join(' · ') +
      '</p><p class="note">' + esc(rateSrc(r.b.rates)) + '</p>'
    : '';
  o.extra = rate;
  return o;
}
function openBoss(r){
  const b = r.b, rated = !!(b.rates && (b.rates.rows || []).length), from = dropSrc(r);
  const pills = [];   // the level is not a pill: it sits on its own area, in the line under the boss's name
  if(b.pinnacle) pills.push('<span class="pill">Pinnacle</span>');
  if(r.drops.length) pills.push('<span class="pill">' + r.drops.length + (r.drops.length === 1 ? ' drop' : ' drops') + '</span>');
  const extra =
    (pills.length ? '<div class="card-req">' + pills.join('') + '</div>' : '') +
    (r.access.length ? '<div class="bo-sec"><p class="lbl">Way in</p><div class="bo-tbl">' +
      r.access.map((x, i) => itemRow(x, r.i + ':a:' + i, false)).join('') +
      '</div><p class="note">Way in: the entry items Exiled Exchange 2 lists as dropping what this boss drops.</p></div>' : '') +
    (r.drops.length ? '<div class="bo-sec"><p class="lbl">What it drops</p>' +
      (rated ? '<div class="bo-thd"><span>Item</span><span>Price</span><span>Drop rate</span></div>' : '') +
      '<div class="bo-tbl">' + r.drops.map((x, i) => itemRow(x, r.i + ':d:' + i, rated)).join('') + '</div>' +
      (from ? '<p class="note">' + esc(from) + '</p>' : '') +
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
    '<span class="bo-w">' + esc(areaNames(b).join(', ')) + '</span>' +
    '<span class="bo-lv"><i class="l">Level</i>' + (levelText(b) || '—') + '</span>' +
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
    '<p class="bo-src">Boss names: Path of Building. Drop lists: Exiled Exchange 2 and Path of Building.</p></div>';
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
