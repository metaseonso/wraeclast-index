/* The Market tab (#/market): the Currency Exchange measured, once a day, from every hour of GGG's feed since
   6 Dec 2024 (design/market-products.md). The price index, the league start, what is rising fast, what crafters
   are buying, the gap to Hardcore and the league before, what each patch moved, and the weekly digest.

   Every block is drawn out of one daily market file (/data/market/<name>, worker/files.js), fetched the first
   time the block comes near the screen and kept for the visit, the same copy an opened currency card reads
   (assets/app.js table). Nothing of it is in the index or in first paint, and the tab never loads the index: a
   currency's name opens its card through the search, only when it is pressed.

   A price here is always in its own league's orbs and carries the hour it is from (the block's source line);
   a rule's words are the file's own. Nothing is modelled. */
import { D, $, esc, table, mkSource, divText, pct, utcHour, dayLines, leagueColours, wake, whole, openDetail, hrefOf } from './app.js';

const FILE = n => 'data/market/' + n + '.json';
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const day = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); };
const num = n => (+n || 0).toLocaleString('en');
const FEW = 10;   // rows a long list draws before the rest is a button

/* what the tab keeps between visits: the league picked in each block, and the lists opened in full */
const S = {book: 0, shock: null, all: {}};
let EL = null, IO = null;
const GOT = {};   // block -> its file, once drawn

/* A currency's name: its card, opened through the search when it is pressed. The address is the Currency tab
   on that name, for a new tab or a name the exchange no longer lists. */
const cur = n => '<a class="mk-n" href="#/currency?c=' + encodeURIComponent(n) + '" data-cur="' + esc(n) + '">' + esc(n) + '</a>';
const rule = t => t && t.rule ? '<details class="mk-rule"><summary>The rule</summary><p>' + esc(t.rule) + '</p>' +
  (t.thresholds && t.thresholds.note ? '<p>' + esc(t.thresholds.note) + '</p>' : '') + '</details>' : '';
const more = (b, n) => n > FEW && !S.all[b] ? '<button type="button" class="btn mk-all" data-all="' + b + '">Show all ' + n + '</button>' : '';
const few = (b, list) => S.all[b] ? list : list.slice(0, FEW);
const chips = (attr, list, on) => '<div class="kinds mk-chips">' + list.map(([v, words]) =>
  '<button type="button" class="chip" data-' + attr + '="' + esc(v) + '" aria-pressed="' + (String(v) === String(on)) + '">' +
  esc(words) + '</button>').join('') + '</div>';
const cell = v => v === null || v === undefined ? '<td class="mk-no">–</td>' : '<td>' + v + '</td>';

/* ---------- the blocks, in the order the page draws them ---------- */
const BLOCKS = [
  {b: 'index', h: 'Price index', sub: 'The basket against its own day 1, by league day', file: 'inflation', draw: drawIndex},
  {b: 'book', h: 'League start', sub: 'Week 1 of each league, and where it went from there', file: 'playbook', draw: drawBook},
  {b: 'rising', h: 'Rising fast', sub: 'Moved in the last 24 hours read, against its own last 7 days', file: 'rising', draw: drawRising},
  {b: 'craft', h: 'Crafting this week', sub: 'Divines traded in the last 7 days, against the 7 before', file: 'crafting', draw: drawCraft},
  {b: 'gap', h: 'League gap', sub: 'The league, its Hardcore and the league before it, last 24 hours', file: 'gap', draw: drawGap},
  {b: 'shocks', h: 'Patch shocks', sub: 'What each patch moved in its first 24 hours', file: 'shocks', draw: drawShocks},
  {b: 'digest', h: 'Weekly digest', sub: 'Every full week of the league, Monday to Sunday UTC', file: 'digest', draw: drawDigest},
];

/* The price index: this league's number and exalted per divine on its last full day, the same day in the leagues
   before it, and both by league day for every league. */
function drawIndex(t){
  const L = t.leagues || [];
  const now = L[L.length - 1];
  if(!now || !(now.days || []).length) return '';
  const full = now.days.filter(d => d[4] >= 24), last = full[full.length - 1] || now.days[now.days.length - 1];
  const at = n => (L2 => { const r = (L2.days || []).find(d => d[0] === n); return r ? r[1] : null; });
  const past = L.slice(0, -1).map(x => [x.league, at(last[0])(x)]).filter(x => x[1] !== null).reverse();
  const series = k => L.map(x => { const v = []; for(const d of x.days || []) v[d[0] - 1] = d[k]; return [x.league, Array.from(v, y => y ?? null)]; });
  const upto = Math.max(56, now.days.length + 7);
  return '<p class="mk-big"><b>' + num(Math.round(last[1])) + '</b><span>' + esc(now.league) + ', league day ' + last[0] +
      ' · 1 Divine Orb = ' + num(Math.round(last[2])) + ' Exalted Orbs</span></p>' +
    (past.length ? '<p class="card-facts">Past leagues on day ' + last[0] + ': ' + past.map(([n, v]) => esc(n) + ' ' + num(Math.round(v))).join(', ') + '</p>' : '') +
    '<div class="mk-two"><div><p class="card-facts">Price index</p>' + dayLines(series(1), {upto}) + '</div>' +
    '<div><p class="card-facts">1 Divine Orb, in Exalted Orbs</p>' + dayLines(series(2), {upto, log: true}) + '</div></div>' +
    ((t.numbers || {}).basket ? '<p class="card-facts">The basket, day 1 = 100: ' + t.numbers.basket.map(cur).join(', ') + '</p>' : '') +
    rule(t) + mkSource(t);
}

/* The league start: the 15 that traded most in week 1, the week-1 price, and the price on days 14, 28 and 56 as a
   share of it. One league at a time, newest first. */
function drawBook(t){
  const L = t.leagues || [];
  if(!L.length) return '';
  const i = Math.min(S.book, L.length - 1), x = L[i];
  const at = (t.numbers || {}).at_days || [14, 28, 56];
  const rows = (x.items || []).map(r => '<tr><td>' + cur(r[0]) + '</td><td>' + esc(divText(r[1])) + '</td>' +
    [r[3], r[4], r[5]].map(v => cell(v === null ? null : num(v) + '%')).join('') + cell(r[6] === null ? null : 'day ' + r[6]) + '</tr>').join('');
  return chips('book', L.map((y, j) => [j, y.league + (y.running ? ' (day ' + y.days + ')' : '')]), i) +
    '<div class="dt-scroll"><table class="dt-jobs mk-t"><thead><tr><th>Currency</th><th>Week 1</th>' +
    at.map(d => '<th>Day ' + d + '</th>').join('') + '<th>Half by</th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
    '<p class="card-facts">Days ' + at.join(', ') + ': the price as a share of week 1. Half by: the first day at half of it or less.</p>' +
    rule(t) + mkSource(t, 'each league in its own orbs');
}

/* Rising fast: what moved, how far, and since when. It says moved, never will move. */
function drawRising(t){
  const list = t.items || [];
  if(!list.length) return '<p class="note">Nothing moved in the last 24 hours read.</p>' + mkSource(t);
  const said = r => [r.volume && (r.moved === 'volume' || r.moved === 'both') ? 'Volume ' + (+r.volume[2]).toLocaleString('en') + 'x its 7-day average' : '',
    r.price && (r.moved === 'price' || r.moved === 'both') ? 'Price ' + pct(r.price[2]) + ' on its 7-day average' : ''].filter(Boolean).join(' · ');
  return '<ul class="mk-list">' + few('rising', list).map(r => '<li>' + cur(r.name) + '<span>' + esc(said(r)) +
    ' · since ' + esc(utcHour(r.started)) + '</span></li>').join('') + '</ul>' + more('rising', list.length) + rule(t) + mkSource(t);
}

/* Crafting this week: every crafting currency by divines traded, with the move on the week before. */
function drawCraft(t){
  const list = t.items || [];
  if(!list.length) return '';
  const rows = few('craft', list).map(r => '<tr><td>' + cur(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(num(r[2])) + ' div</td>' +
    '<td class="' + (r[4] > 0 ? 'up' : r[4] < 0 ? 'down' : '') + '">' + esc(pct(r[4])) + '</td></tr>').join('');
  return '<div class="dt-scroll"><table class="dt-jobs mk-t"><thead><tr><th>Currency</th><th>Group</th><th>Traded</th><th>On the week</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></div>' + more('craft', list.length) + rule(t) + mkSource(t);
}

/* The league gap: the rates in each league, then the biggest gaps between the league and its Hardcore. */
function drawGap(t){
  const list = t.items || [], rate = t.rate || {};
  const rates = [[t.league, rate.league], [t.hardcore, rate.hardcore], [t.past, rate.past]].filter(x => x[0] && x[1]);
  const rows = few('gap', list).map(r => '<tr><td>' + cur(r[0]) + '</td><td>' + esc(divText(r[1])) + '</td><td>' + esc(divText(r[2])) +
    '</td><td class="' + (r[3] > 0 ? 'up' : 'down') + '">' + esc(pct(r[3])) + '</td></tr>').join('');
  return (rates.length ? '<p class="card-facts">1 Divine Orb: ' + rates.map(([n, v]) => num(Math.round(v)) + ' Exalted Orbs in ' + esc(n)).join(', ') + '</p>' : '') +
    (list.length ? '<div class="dt-scroll"><table class="dt-jobs mk-t"><thead><tr><th>Currency</th><th>' + esc(t.league) + '</th><th>' +
      esc(t.hardcore) + '</th><th>Gap</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + more('gap', list.length) : '') +
    rule(t) + mkSource(t, 'each league in its own orbs');
}

/* Patch shocks: one league at a time, newest patch first, each with the biggest rises and falls in its first 24
   hours and the basket's own move over the same hours. */
function drawShocks(t){
  const files = Object.values(t.files || {}).filter(f => (f.patches || []).length);
  if(!files.length) return '';
  const newest = f => f.patches.reduce((a, p) => p.at > a ? p.at : a, '');
  files.sort((a, b) => newest(b).localeCompare(newest(a)));
  const f = files.find(x => x.v === S.shock) || files[0];
  const move = ([n, was, d1]) => cur(n) + ' <span class="' + (d1 > 0 ? 'up' : 'down') + '">' + esc(pct(d1)) + '</span> <span class="mk-was">from ' +
    esc(divText(was)) + '</span>';
  const patch = p => '<details class="mk-patch"><summary><b>' + esc(p.title) + '</b><span>' + esc(day(p.at)) + ' · ' + esc(p.kind) +
      (p.basket !== null && p.basket !== undefined ? ' · the basket ' + esc(pct(p.basket, 1)) + ' over 72 hours' : '') + '</span></summary>' +
    ((p.up || []).length ? '<p class="card-facts">Up in 24 hours</p><ul class="mk-moves">' + p.up.map(m => '<li>' + move(m) + '</li>').join('') + '</ul>' : '') +
    ((p.down || []).length ? '<p class="card-facts">Down in 24 hours</p><ul class="mk-moves">' + p.down.map(m => '<li>' + move(m) + '</li>').join('') + '</ul>' : '') +
    '<p class="card-facts">' + num(p.listed) + ' currencies measured' + (p.near ? ' · shares its hours with ' + p.near + (p.near === 1 ? ' other patch' : ' other patches') : '') + '</p></details>';
  return chips('shock', files.map(x => [x.v, x.league]), f.v) + '<div class="mk-patches">' + f.patches.map(patch).join('') + '</div>' +
    (f.left ? '<p class="card-facts">' + num(f.left) + ' patches left out over every league: under 48 hours of trading on one side.</p>' : '') +
    rule(f) + mkSource(f);
}

/* The weekly digest: the newest week open, the rest a line each until opened. Every name is its card. */
function linked(text, names){
  const at = [];
  for(const n of [...new Set(names || [])].sort((a, b) => b.length - a.length)){
    let i = text.indexOf(n);
    while(i >= 0){
      if(!at.some(([s, e]) => i < e && i + n.length > s)) at.push([i, i + n.length, n]);
      i = text.indexOf(n, i + n.length);
    }
  }
  at.sort((a, b) => a[0] - b[0]);
  let out = '', k = 0;
  for(const [s, e, n] of at){ out += esc(text.slice(k, s)) + cur(n); k = e; }
  return out + esc(text.slice(k));
}
function drawDigest(t){
  const weeks = Object.values(t.files || {}).filter(w => w && w.week).sort((a, b) => b.week.localeCompare(a.week));
  if(!weeks.length) return '<p class="note">No full week yet.</p>' + mkSource(t);
  const span = w => { const a = new Date(w.from), b = new Date(w.to); return a.getUTCDate() + (a.getUTCMonth() === b.getUTCMonth() ? '' : ' ' + MON[a.getUTCMonth()]) +
    '–' + b.getUTCDate() + ' ' + MON[b.getUTCMonth()] + ' ' + b.getUTCFullYear(); };
  return weeks.map((w, i) => '<details class="mk-patch mk-week"' + (i ? '' : ' open') + '><summary><b>' + esc(span(w)) + '</b><span>' +
      esc(w.league) + (w.days ? ', league days ' + w.days[0] + '–' + w.days[1] : '') + '</span></summary>' +
      (w.lines || []).map(l => '<p class="mk-line">' + linked(l.t, l.cards) + '</p>').join('') + '</details>').join('') +
    rule(weeks[0]) + mkSource(t);
}

/* ---------- the page ---------- */
export function mount(el){
  EL = el;
  el.innerHTML = '<div class="pagehd"><h2>Market</h2><p>The Currency Exchange, hour by hour since 6 Dec 2024. Built once a day.</p></div>' +
    '<p class="note px-off">Prices: Trade mode only.</p>' +   // a play mode with no prices draws no block (assets/cards.css)
    BLOCKS.map(x => '<section class="mk-block" data-b="' + x.b + '"><div class="sect"><h3>' + esc(x.h) + '</h3><p>' + esc(x.sub) + '</p></div>' +
      '<div class="mk-body"><p class="note mk-wait">Loading…</p></div></section>').join('');
  el.addEventListener('click', onClick);
  // a block's file is asked for as the block comes near the screen, and never before
  IO = new IntersectionObserver(es => { for(const e of es) if(e.isIntersecting){ IO.unobserve(e.target); load(e.target.dataset.b); } },
    {rootMargin: '300px 0px'});
  for(const s of el.querySelectorAll('.mk-block')) IO.observe(s);
  return {};
}
export function unmount(){
  if(IO) IO.disconnect();
  if(EL) EL.removeEventListener('click', onClick);
  IO = EL = null;
}
function load(b){
  const x = BLOCKS.find(y => y.b === b);
  if(!x) return;
  Promise.all([table(FILE(x.file)), leagueColours()]).then(([t]) => { GOT[b] = t; paint(b); }, () => { GOT[b] = null; paint(b); });
}
function paint(b){
  const x = BLOCKS.find(y => y.b === b), box = EL && $('.mk-block[data-b="' + b + '"] .mk-body', EL);
  if(!x || !box) return;
  const t = GOT[b];
  let html = '';
  try { html = t ? x.draw(t) : ''; } catch { html = ''; }
  box.innerHTML = html || '<p class="note">Not in yet.</p>';
}
async function onClick(e){
  const all = e.target.closest('[data-all]');
  if(all){ S.all[all.dataset.all] = true; paint(all.dataset.all); return; }
  const bk = e.target.closest('[data-book]');
  if(bk){ S.book = +bk.dataset.book; paint('book'); return; }
  const sh = e.target.closest('[data-shock]');
  if(sh){ S.shock = sh.dataset.shock; paint('shocks'); return; }
  const a = e.target.closest('a.mk-n');
  if(!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
  e.preventDefault();
  const key = 'c:' + a.dataset.cur;
  try {
    await wake();
    const it = D.byKey.get(key) || (await whole([key]))[0];
    if(it){ openDetail(it, {}, hrefOf(it)); return; }
  } catch {}
  location.hash = a.getAttribute('href').slice(1);
}
