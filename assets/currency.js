/* Currency tab: every currency-type item, what it does, how its price moves, trading routes,
   and a watch list. Prices: data/market.json: what each currency traded for on the in-game Currency Exchange
   (GGG's public hourly feed, tools/exchange.py). */
import { D, $, esc, card, flow, money, moneyHTML, params, openDetail, openBox, actHTML, runAct } from './app.js';
import { ASKS, ASK } from './kinds.js';   // the questions the page is asked, and which group answers which

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
const PAGE = 48;          // rows the grid adds at a time

const S = {ask: 'all', cat: 'all', trend: 'all', sort: 'move', q: '', liquid: true, shown: PAGE, watch: loadWatch()};
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
    return {it, m, sw: swing(m.sp), vl: vsLeague(m), fw: famWords(it.n)};
  });
}

// the kinds the catalogue gives, in its own order. A handful of Exchange rows carry none: those answer to
// the search box and to their family, rather than to a kind this page made up for them
const cats = () => [...new Set(ALL.map(r => r.m.cat).filter(Boolean))];
// ...and the groups inside whichever question is being asked, so the second row narrows with the first
const askCats = () => S.ask === 'all' ? cats() : cats().filter(c => ASK[c] === S.ask);
const askCount = k => ALL.filter(r => ASK[r.m.cat] === k).length;

function match(r){
  const {it, m} = r;
  if(S.ask !== 'all' && ASK[m.cat] !== S.ask) return false;
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

/* ---------- families ----------
   Nothing is written down here: a family is a word the names themselves share, so Vaal, Jiquani or
   whatever next league calls its things names itself off the same data the prices come from. */
const FAM_MIN = 3;          // names that must share a word before it reads as a family
const FAM_MOST = 0.9;       // a word in nearly every name of a group says nothing about it
const FAM_TOGETHER = 0.9;   // two words this often in the same names are one family: Soul Core
const FAM_SHOWN = 14;       // family chips offered at once

function famWords(n){   // the words of a name that could name a family: no levels, no "the", no "of"
  const out = [];
  for(let w of n.replace(/\([^)]*\)/g, ' ').replace(/^The\s+/, '').split(/[^\p{L}']+/u)){
    w = w.replace(/'s$|'$/, '');
    if(w.length >= 3 && /^\p{Lu}/u.test(w) && !out.includes(w)) out.push(w);
  }
  return out;
}
function families(list){
  const at = new Map();   // word -> the names carrying it
  for(const r of list) for(const w of r.fw) (at.get(w) || at.set(w, new Set()).get(w)).add(r.it.id);
  for(const [w, s] of at) if(s.size < FAM_MIN || s.size > list.length * FAM_MOST) at.delete(w);
  const fam = [...at].map(([label, ids]) => ({label, ids}));
  for(let i = 0; i < fam.length; i++) for(let j = i + 1; j < fam.length; j++){
    const a = fam[i], b = fam[j];
    if(a.label.includes(' ') || b.label.includes(' ')) continue;   // already a pair; one join is enough
    let both = 0;
    for(const x of a.ids) if(b.ids.has(x)) both++;
    if(both < a.ids.size * FAM_TOGETHER || both < b.ids.size * FAM_TOGETHER) continue;
    const n = (list.find(r => a.ids.has(r.it.id) && b.ids.has(r.it.id)) || {it: {}}).it.n || '';
    a.label = n.indexOf(b.label) >= 0 && n.indexOf(b.label) < n.indexOf(a.label) ? b.label + ' ' + a.label : a.label + ' ' + b.label;
    for(const x of b.ids) a.ids.add(x);
    fam.splice(j--, 1);
  }
  return fam.sort((a, b) => b.ids.size - a.ids.size || a.label.localeCompare(b.label));
}

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
  // the bench in the card's own corner: the act's test decides which of these get one (assets/kinds.js ACTS)
  return card(it, {href: null, builds: false, action: star + actHTML('bench', it), extra});
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

/* ---------- the watch list picker ----------
   The grid shows the biggest movers first, so a currency nobody moved today has no star to click and
   most of the 600-odd never appear. This searches the lot, whatever the volume, groups them by what
   their names share, and stars straight from the results. Same ids as the cards: a watch list saved
   before this reads the same. */
const PICK_PAGE = 60;     // rows the picker shows before "Show all"
const PICK = {q: '', cat: 'all', fam: '', shown: PICK_PAGE};
let PEL = null, FAMS = new Map();   // the open picker, and the families of the group it is showing

/* one place a star goes on or off: the card on the page and the row in the picker both follow */
function toggleWatch(id){
  S.watch.has(id) ? S.watch.delete(id) : S.watch.add(id);
  saveWatch();
  const on = S.watch.has(id);
  if(EL) for(const b of EL.querySelectorAll('.star[data-id]')) if(b.dataset.id === id){
    b.setAttribute('aria-pressed', String(on));
    b.title = on ? 'Stop watching' : 'Watch this';
    b.textContent = on ? '★' : '☆';
  }
  if(PEL && PEL.isConnected){
    for(const r of PEL.querySelectorAll('.cxp-row')) if(r.dataset.id === id){
      r.setAttribute('aria-checked', String(on));
      r.querySelector('.star').textContent = on ? '★' : '☆';
    }
    const ct = $('.chip[data-c="watch"] .ct', PEL);
    if(ct) ct.textContent = watched();
  }
  if(S.trend === 'watch') render();
}

const groupRows = () => PICK.cat === 'watch' ? ALL.filter(r => S.watch.has(r.it.id))
  : PICK.cat === 'all' ? ALL : ALL.filter(r => r.m.cat === PICK.cat);
const watched = () => ALL.filter(r => S.watch.has(r.it.id)).length;   // stars the Exchange still lists
function pickList(){
  const fam = PICK.fam && FAMS.get(PICK.fam);
  const toks = PICK.q.split(/\s+/).filter(Boolean);
  return groupRows().filter(r => (!fam || fam.has(r.it.id)) && toks.every(t => r.it._nl.includes(t)))
    .sort((a, b) => a.it.n.localeCompare(b.it.n));
}
const chip = (attr, v, label, n) => '<button type="button" class="chip" data-' + attr + '="' + esc(v) + '" aria-pressed="' +
  (({c: PICK.cat, f: PICK.fam})[attr] === v) + '">' + label + (n === undefined ? '' : '<span class="ct">' + n + '</span>') + '</button>';
function groupChips(){
  return chip('c', 'watch', '★ Watching', watched()) + chip('c', 'all', 'All', ALL.length) +
    cats().map(c => chip('c', c, esc(c), ALL.filter(r => r.m.cat === c).length)).join('');
}
function famChips(){
  const fam = families(groupRows());
  FAMS = new Map(fam.map(f => [f.label, f.ids]));
  return fam.slice(0, FAM_SHOWN).map(f => chip('f', f.label, esc(f.label), f.ids.size)).join('');
}
function pickRow(r){
  const on = S.watch.has(r.it.id);
  const px = r.m.v === undefined || r.m.v === null ? '' : '<span class="cxp-px">' + moneyHTML(r.m.v) + '</span>';
  return '<button type="button" class="cxp-row" role="checkbox" aria-checked="' + on + '" data-id="' + esc(r.it.id) + '">' +
    '<span class="star" aria-hidden="true">' + (on ? '★' : '☆') + '</span>' +
    '<span class="cxp-nm">' + esc(r.it.n) + '</span>' + px +
    '<span class="cxp-cat">' + esc(r.m.cat || '') + '</span></button>';
}
function paintPick(groups){
  if(!PEL) return;
  if(groups){ $('.cxp-cats', PEL).innerHTML = groupChips(); $('.cxp-fams', PEL).innerHTML = famChips(); }
  const list = pickList();
  $('.cxp-list', PEL).innerHTML = list.length ? list.slice(0, PICK.shown).map(pickRow).join('')
    : '<p class="note">' + (PICK.cat === 'watch' && !PICK.q ? 'No stars yet.' : 'Nothing by that name.') + '</p>';
  $('.cxp-ft', PEL).innerHTML = list.length + (list.length === 1 ? ' currency' : ' currencies') +
    (list.length > PICK.shown ? ' · <button type="button" class="btn cxp-more">Show all ' + list.length + '</button>' : '');
}
function openPicker(){
  const box = document.createElement('section');
  box.className = 'cxpick panel';
  box.innerHTML = '<h3>Watch list</h3><p class="note">Every currency the Exchange lists, busy or not.</p>' +
    '<input class="field cxp-q" type="search" placeholder="Search currency…" autocomplete="off" aria-label="Search currency">' +
    '<div class="cxp-chips cxp-cats"></div><div class="cxp-chips cxp-fams"></div>' +
    '<div class="cxp-list"></div><p class="note cxp-ft" aria-live="polite"></p>';
  PEL = box;
  PICK.q = ''; PICK.cat = 'all'; PICK.fam = ''; PICK.shown = PICK_PAGE;
  $('.cxp-q', box).addEventListener('input', e => { PICK.q = e.target.value.trim().toLowerCase(); PICK.shown = PICK_PAGE; paintPick(); });
  box.addEventListener('click', e => {
    const c = e.target.closest('.cxp-cats .chip');
    if(c){ PICK.cat = c.dataset.c; PICK.fam = ''; PICK.shown = PICK_PAGE; paintPick(true); return; }
    const f = e.target.closest('.cxp-fams .chip');
    if(f){ PICK.fam = PICK.fam === f.dataset.f ? '' : f.dataset.f; PICK.shown = PICK_PAGE; paintPick(true); return; }
    if(e.target.closest('.cxp-more')){ PICK.shown = Infinity; paintPick(); return; }
    const row = e.target.closest('.cxp-row');
    if(row) toggleWatch(row.dataset.id);
  });
  paintPick(true);
  openBox(box, 'Watch list');
  setTimeout(() => $('.cxp-q', box).focus(), 50);
}

/* ---------- view ---------- */
export function mount(el){
  EL = el;
  if(!D.market){ el.innerHTML = '<div class="pagehd"><h2>Currency</h2><p class="err">Prices are not loaded. Try again in a minute.</p></div>'; return {}; }
  ALL = rows();
  const kinds = ['all', ...cats()];
  el.innerHTML =
    '<div class="pagehd"><h2>Currency</h2><p>' + esc(D.market.league) + ': what each currency really traded for on the in-game Currency Exchange ' +
      'over the last 24 hours. Updated every hour.</p></div>' +
    '<div class="sect"><h3>Busiest exchange markets</h3><p>Last 24 hours. What one buys, and how much traded.</p></div>' +
    '<div class="cxm" id="cxmarkets"></div>' +
    '<div class="sect"><h3>Watch list</h3><p id="cxcount"></p><span class="grow"></span>' +
      '<button type="button" class="btn gold" id="cxpick">★ Add to watch list</button></div>' +
    '<div class="controls cx">' +
      // what a player came with in hand, asked as a question. The groups below narrow to whatever is asked.
      '<div class="row"><div class="kinds cx-ask" id="cxask" style="margin:0;justify-content:flex-start">' +
        '<button type="button" class="chip" data-v="all" aria-pressed="' + (S.ask === 'all') + '">All ' +
          ALL.length.toLocaleString() + '</button>' +
        ASKS.map(([k, words]) => '<button type="button" class="chip" data-v="' + k + '" aria-pressed="' +
          (k === S.ask) + '">' + esc(words) + ' <span class="chip-n">' + askCount(k) + '</span></button>').join('') +
      '</div></div>' +
      '<div class="row"><div class="seg" id="cxcat">' + kinds.map(c => '<button type="button" data-v="' + esc(c) + '" aria-pressed="' + (c === S.cat) + '">' +
        (c === 'all' ? 'All' : esc(c)) + '</button>').join('') + '</div></div>' +
      '<div class="row"><input class="field" id="cxq" type="search" placeholder="Search currency…" autocomplete="off">' +
        '<div class="kinds" id="cxtrend" style="margin:0;justify-content:flex-start">' + TRENDS.map(([k, l]) =>
          '<button type="button" class="chip" data-v="' + k + '" aria-pressed="' + (k === S.trend) + '">' + l + '</button>').join('') + '</div>' +
        '<span class="grow"></span>' +
        '<label class="note"><input type="checkbox" id="cxliq" checked> Hide low volume</label>' +
        '<select class="field" id="cxsort">' + SORTS.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="cards" id="cxcards"></div><div class="more cx-more" id="cxmore" hidden>' +
      '<button type="button" class="btn cx-next">Show more</button><button type="button" class="btn cx-all">Show all</button></div>' +
    '<p class="note" style="margin-top:18px">Rising or falling: 10%+ this week. Swinging: 12%+ in one day. Low volume: under ' + MIN_VOL + ' div a day. ' +
      '“Add to watch list” searches every currency, busy or not. ' +
      'Source: the in-game Currency Exchange (GGG\u2019s hourly feed of real trades).</p>';

  const seg = (id, key) => $('#' + id, el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S[key] = b.dataset.v; S.shown = PAGE;
    [...b.parentNode.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    render();
  });
  seg('cxcat', 'cat'); seg('cxtrend', 'trend');
  /* a question narrows the groups under it, and the group chips are drawn again to whatever is left. The
     group a player had chosen is kept where the new question still holds it, and dropped where it does not. */
  $('#cxask', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S.ask = b.dataset.v; S.shown = PAGE;
    if(S.cat !== 'all' && !askCats().includes(S.cat)) S.cat = 'all';
    [...b.parentNode.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    paintCats();
    render();
  });
  paintCats();
  $('#cxq', el).addEventListener('input', e => { S.q = e.target.value.trim().toLowerCase(); S.shown = PAGE; render(); });
  $('#cxsort', el).addEventListener('change', e => { S.sort = e.target.value; render(); });
  $('#cxliq', el).addEventListener('change', e => { S.liquid = e.target.checked; S.shown = PAGE; render(); });
  $('.cx-next', el).addEventListener('click', () => { S.shown += PAGE; render(); });
  $('.cx-all', el).addEventListener('click', () => { S.shown = Infinity; render(); });
  $('#cxpick', el).addEventListener('click', openPicker);
  el.addEventListener('click', e => {
    const act = e.target.closest('.card-do[data-act]');
    if(act){ e.preventDefault(); e.stopPropagation(); runAct(act.dataset.act, D.byKey.get('c:' + act.dataset.id)); return; }
    const b = e.target.closest('.star'); if(!b) return;
    e.preventDefault();
    toggleWatch(b.dataset.id);
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

/* The group chips, drawn again whenever the question changes: All, then every group the question covers. */
function paintCats(){
  const box = $('#cxcat', EL); if(!box) return;
  box.innerHTML = ['all', ...askCats()].map(c => '<button type="button" data-v="' + esc(c) + '" aria-pressed="' +
    (c === S.cat) + '">' + (c === 'all' ? 'All' : esc(c)) + '</button>').join('');
}
function render(){
  const list = ALL.filter(match).sort(SORTER[S.sort]);
  $('#cxcount', EL).textContent = list.length + ' item' + (list.length === 1 ? '' : 's');
  const grid = $('#cxcards', EL);
  flow(grid, list.slice(0, S.shown).map(r => ({key: 'c:' + r.it.id, r})), x => currencyCard(x.r));
  if(!list.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing here</h3>' +
    (S.trend === 'watch' ? '<p>Nothing watched yet.</p>' : '') + '</div>';
  const more = $('#cxmore', EL);
  more.hidden = list.length <= S.shown;
  if(!more.hidden) $('.cx-all', more).textContent = 'Show all ' + list.length;
}
