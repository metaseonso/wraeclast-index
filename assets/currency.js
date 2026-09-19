/* Currency tab: every currency-type item, what it does, how its price moves, trading routes,
   and a watch list. Prices: data/market.json: what each currency traded for on the in-game Currency Exchange
   (GGG's public hourly feed, tools/exchange.py). */
import { D, $, esc, card, flow, money, moneyHTML, params, openDetail } from './app.js';

const WATCH_KEY = 'wi.watch';
function loadWatch(){ try { return new Set(JSON.parse(localStorage.getItem(WATCH_KEY) || '[]')); } catch { return new Set(); } }
function saveWatch(){ try { localStorage.setItem(WATCH_KEY, JSON.stringify([...S.watch])); } catch {} }

const TRENDS = [
  ['all', 'All'], ['rising', 'Rising'], ['falling', 'Falling'], ['volatile', 'Swinging'],
  ['steady', 'Steady'], ['cheap', 'Below league average'], ['watch', '★ Watching'],
];
const SORTS = [['move', 'Biggest move'], ['price', 'Price'], ['vol', 'Volume'], ['name', 'Name']];
const PAIR = {divine: 'Divine Orbs', exalted: 'Exalted Orbs', chaos: 'Chaos Orbs'};
const MIN_VOL = 5;        // divine traded per day before a price counts as a market
const ROUTE_MIN = 3, ROUTE_MAX = 60, ROUTE_VOL = 25;

const S = {cat: 'all', trend: 'all', sort: 'move', q: '', liquid: true, shown: 48, watch: loadWatch()};
let EL, ALL = [];

/* ---------- signals ---------- */
function swing(sp){   // the largest single-day move in the 7-day line, in points
  const p = (sp || []).filter(x => x !== null);
  let m = 0;
  for(let i = 1; i < p.length; i++) m = Math.max(m, Math.abs(p[i] - p[i - 1]));
  return m;
}
function vsLeague(m){  // today's price against the average of the league so far
  if(!m.h || m.h.length < 4) return null;
  const avg = m.h.reduce((a, x) => a + x[1], 0) / m.h.length;
  return avg ? (m.v / avg - 1) * 100 : null;
}
function trendOf(m){
  if((m.ch ?? 0) >= 10) return 'rising';
  if((m.ch ?? 0) <= -10) return 'falling';
  return 'steady';
}

function rows(){
  const M = D.market.items;
  return D.index.items.filter(it => it.k === 'c' && M['c:' + it.id]).map(it => {   // the catalogue's items (the index has a few more)
    const m = M['c:' + it.id];
    return {it, m, sw: swing(m.sp), vl: vsLeague(m)};
  });
}

function match(r){
  const {it, m} = r;
  if(S.cat !== 'all' && m.cat !== S.cat) return false;
  if(S.liquid && (m.vol ?? 0) < MIN_VOL && S.trend !== 'watch') return false;
  if(S.q && !it._hay.includes(S.q)) return false;
  switch(S.trend){
    case 'rising': return (m.ch ?? 0) >= 10;
    case 'falling': return (m.ch ?? 0) <= -10;
    case 'volatile': return r.sw >= 12;
    case 'steady': return Math.abs(m.ch ?? 0) < 5 && r.sw < 6;
    case 'cheap': return r.vl !== null && r.vl <= -15;
    case 'watch': return S.watch.has(it.id);
  }
  return true;
}
const SORTER = {
  move: (a, b) => Math.abs(b.m.ch ?? 0) - Math.abs(a.m.ch ?? 0),
  price: (a, b) => (b.m.v ?? 0) - (a.m.v ?? 0),
  vol: (a, b) => (b.m.vol ?? 0) - (a.m.vol ?? 0),
  name: (a, b) => a.it.n.localeCompare(b.it.n),
};

/* ---------- cards ---------- */
function compact(v){ return v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e3 ? (v / 1e3).toFixed(v >= 1e4 ? 0 : 1) + 'k' : String(Math.round(v)); }
function leagueLine(r){
  const {m} = r;
  if(!m.h || m.h.length < 4) return '';
  const vals = m.h.map(x => x[1]), lo = Math.min(...vals), hi = Math.max(...vals);
  const lm = money(lo), hm = money(hi);
  return '<p class="card-facts">This league: ' + lm.v + ' ' + lm.u + ' to ' + hm.v + ' ' + hm.u +
    (r.vl !== null ? ' · <span class="' + (r.vl > 0 ? 'up' : 'down') + '">' + (r.vl > 0 ? '+' : '') + Math.round(r.vl) +
      '% vs average</span>' : '') + '</p>';
}
function currencyCard(r){
  const {it, m} = r;
  const on = S.watch.has(it.id);
  const star = '<button type="button" class="star" aria-pressed="' + on + '" title="' + (on ? 'Stop watching' : 'Watch this') +
    '" data-id="' + esc(it.id) + '">' + (on ? '★' : '☆') + '</button>';
  const extra = '<p class="card-facts">' + compact(m.vol || 0) + ' div traded in 24 h' +
    (r.sw >= 12 ? ' · swings ' + Math.round(r.sw) + '% a day' : '') + '</p>' + leagueLine(r);
  return card(it, {href: null, builds: false, action: star, extra});
}
/* the busiest pairs on the Currency Exchange: each opens its currency's card */
function markets(host){
  const M = (D.market.markets || []).filter(x => D.byKey.get('c:' + x[0])).slice(0, 24);
  if(!M.length){ host.innerHTML = '<p class="note">No exchange data yet.</p>'; return; }
  host.innerHTML = M.map(([a, b, r, vol]) => '<button type="button" class="cxm-row" data-k="' + esc(a) + '">' +
    '<b>' + esc(a) + '</b><span class="cxm-for">1 = ' + (r >= 100 ? Math.round(r).toLocaleString() : +r.toPrecision(3)) + ' ' + esc(b) + '</span>' +
    '<span class="cxm-vol">' + compact(vol) + ' div traded</span></button>').join('');
  host.addEventListener('click', e => { const b = e.target.closest('.cxm-row'); const it = b && D.byKey.get('c:' + b.dataset.k); if(it) openDetail(it, {}, null); });
}
function routeCard(r){
  const {it, m} = r, a = m.arb;
  const buy = m.routes.find(x => x.via === a.buy), sell = m.routes.find(x => x.via === a.sell);
  const b = money(buy.v), s = money(sell.v);
  const why = 'Buy ' + it.n + ' with ' + PAIR[a.buy] + ' (about ' + b.v + ' ' + b.u + ' each), then sell it for ' +
    PAIR[a.sell] + ' (about ' + s.v + ' ' + s.u + ' each).';
  return card(it, {href: null, builds: false, why,
    invest: {label: 'Profit before fees', note: '+' + Math.round(a.gain * 10) / 10 + '%'},
    extra: '<p class="card-facts">' + compact(a.thin) + ' div traded a day</p>'});
}

/* ---------- view ---------- */
export function mount(el){
  EL = el;
  if(!D.market){ el.innerHTML = '<div class="pagehd"><h2>Currency</h2><p class="err">Prices are not loaded. Try again in a minute.</p></div>'; return {}; }
  ALL = rows();
  const cats = ['all', ...new Set(ALL.map(r => r.m.cat))];
  el.innerHTML =
    '<div class="pagehd"><h2>Currency</h2><p>' + esc(D.market.league) + ': what each currency really traded for on the in-game Currency Exchange ' +
      'over the last 24 hours. Updated every hour.</p></div>' +
    '<div class="sect"><h3>Busiest exchange markets</h3><p>Last 24 hours. What one buys, and how much traded.</p></div>' +
    '<div class="cxm" id="cxmarkets"></div>' +
    '<div class="sect"><h3>Watch list</h3><p id="cxcount"></p></div>' +
    '<div class="controls cx">' +
      '<div class="row"><div class="seg" id="cxcat">' + cats.map(c => '<button type="button" data-v="' + esc(c) + '" aria-pressed="' + (c === S.cat) + '">' +
        (c === 'all' ? 'All' : esc(c)) + '</button>').join('') + '</div></div>' +
      '<div class="row"><input class="field" id="cxq" type="search" placeholder="Search currency…" autocomplete="off">' +
        '<div class="kinds" id="cxtrend" style="margin:0;justify-content:flex-start">' + TRENDS.map(([k, l]) =>
          '<button type="button" class="chip" data-v="' + k + '" aria-pressed="' + (k === S.trend) + '">' + l + '</button>').join('') + '</div>' +
        '<span class="grow"></span>' +
        '<label class="note"><input type="checkbox" id="cxliq" checked> Hide low volume</label>' +
        '<select class="field" id="cxsort">' + SORTS.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="cards" id="cxcards"></div><div class="more" id="cxmore" hidden><button type="button" class="btn">Show more</button></div>' +
    '<p class="note" style="margin-top:18px">Rising or falling: 10%+ this week. Swinging: 12%+ in one day. Low volume: under ' + MIN_VOL + ' div a day. ' +
      'Source: the in-game Currency Exchange (GGG\u2019s hourly feed of real trades).</p>';

  const seg = (id, key) => $('#' + id, el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S[key] = b.dataset.v; S.shown = 48;
    [...b.parentNode.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    render();
  });
  seg('cxcat', 'cat'); seg('cxtrend', 'trend');
  $('#cxq', el).addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); S.shown = 48; render(); });
  $('#cxsort', el).addEventListener('change', e => { S.sort = e.target.value; render(); });
  $('#cxliq', el).addEventListener('change', e => { S.liquid = e.target.checked; S.shown = 48; render(); });
  $('#cxmore button', el).addEventListener('click', () => { S.shown += 48; render(); });
  el.addEventListener('click', e => {
    const b = e.target.closest('.star'); if(!b) return;
    e.preventDefault();
    const id = b.dataset.id;
    S.watch.has(id) ? S.watch.delete(id) : S.watch.add(id);
    saveWatch();
    b.setAttribute('aria-pressed', String(S.watch.has(id)));
    b.textContent = S.watch.has(id) ? '★' : '☆';
    if(S.trend === 'watch') render();
  });

  markets($('#cxmarkets', el));
  return {update};
}

function update(){
  const c = params().get('c');
  if(c){ S.q = c.toLowerCase(); S.cat = 'all'; S.trend = 'all'; S.liquid = false;
    const q = $('#cxq', EL); if(q) q.value = c;
    const l = $('#cxliq', EL); if(l) l.checked = false;
    EL.querySelectorAll('#cxcat button, #cxtrend button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === 'all')));
  }
  render();
}

function render(){
  const list = ALL.filter(match).sort(SORTER[S.sort]);
  $('#cxcount', EL).textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
  const grid = $('#cxcards', EL);
  flow(grid, list.slice(0, S.shown).map(r => ({key: 'c:' + r.it.id, r})), x => currencyCard(x.r));
  if(!list.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing here</h3><p>' +
    (S.trend === 'watch' ? 'Tap the star on a card to watch it.' : 'Try fewer filters.') + '</p></div>';
  $('#cxmore', EL).hidden = list.length <= S.shown;
}
