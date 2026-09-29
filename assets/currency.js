/* Currency tab: every currency-type item, what it does, how its price moves, trading routes,
   and a watch list. Prices: data/market.json: what each currency traded for on the in-game Currency Exchange
   (GGG's public hourly feed, tools/exchange.py). */
import { D, $, esc, card, flow, money, moneyHTML, params, openDetail, openBox, actHTML, runAct, iconHTML, words, hits, onType } from './app.js';
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
const MOST = 200;         // ...and the most one press of Show all draws: past it, the rest is another press
// the button that draws the rest says how much it draws: all of it, or the next MOST
const allLabel = (n, shown) => n - shown <= MOST ? 'Show all ' + n : 'Show ' + MOST + ' more';

const S = {ask: 'all', cat: 'all', trend: 'all', sort: 'move', q: '', words: [], liquid: true, shown: PAGE, watch: loadWatch()};
let EL, ALL = [], ALLOF = null;   // the rows, and the prices they were made from

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
/* What a question chip counts: the rows its press would show, every other filter as it stands. A group the
   question does not hold is dropped by the press (the ask handler), so it is dropped from the count too: the
   chip that is pressed always says what the grid holds. */
const catFor = k => k === 'all' || S.cat === 'all' || ASK[S.cat] === k ? S.cat : 'all';
const askCount = k => ALL.filter(r => match(r, k, catFor(k))).length;

function match(r, ask = S.ask, cat = S.cat){
  const {it, m} = r;
  if(ask !== 'all' && ASK[m.cat] !== ask) return false;
  if(cat !== 'all' && m.cat !== cat) return false;
  if(S.liquid && (m.vol ?? 0) < MIN_VOL && S.trend !== 'watch') return false;
  if(S.q && hits(it, S.words || []) === null) return false;   // every word, anywhere on the row
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
  // both ends wear their own art, the way every other row on the site does: this for that, at a glance
  host.innerHTML = M.map(([a, b, r, vol]) => {
    const A = D.byKey.get('c:' + a), B = D.byKey.get('c:' + b);
    return '<button type="button" class="cxm-row" data-k="' + esc(a) + '">' +
      '<span class="cxm-ic">' + iconHTML(A || {n: a}) + '</span>' +
      // the name and the rate share a line while the tile holds both; past that the rate drops under the name
      '<span class="cxm-top"><b>' + esc(a) + '</b>' +
      '<span class="cxm-for">1 = ' + (r >= 100 ? Math.round(r).toLocaleString() : +r.toPrecision(3)) +
        (B ? '<span class="cxm-ic sm">' + iconHTML(B) + '</span>' : ' ') + '<b>' + esc(b) + '</b></span></span>' +
      '<span class="cxm-vol">' + compact(vol) + ' div traded</span></button>';
  }).join('');
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
    (list.length > PICK.shown ? ' · <button type="button" class="btn cxp-more">' + allLabel(list.length, PICK.shown) + '</button>' : '');
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
  const pq = $('.cxp-q', box);
  onType(pq, () => { PICK.q = pq.value.trim().toLowerCase(); PICK.shown = PICK_PAGE; paintPick(); });
  box.addEventListener('click', e => {
    const c = e.target.closest('.cxp-cats .chip');
    if(c){ PICK.cat = c.dataset.c; PICK.fam = ''; PICK.shown = PICK_PAGE; paintPick(true); return; }
    const f = e.target.closest('.cxp-fams .chip');
    if(f){ PICK.fam = PICK.fam === f.dataset.f ? '' : f.dataset.f; PICK.shown = PICK_PAGE; paintPick(true); return; }
    if(e.target.closest('.cxp-more')){ PICK.shown += MOST; paintPick(); return; }
    const row = e.target.closest('.cxp-row');
    if(row) toggleWatch(row.dataset.id);
  });
  paintPick(true);
  openBox(box, 'Watch list');
  setTimeout(() => $('.cxp-q', box).focus(), 50);
}

/* ---------- the loot filter block ----------
   Rules to paste into a loot filter: the currencies worth over a number of exalted on the Currency Exchange
   today, or the watch list. Built off the same price rows the grid draws, in the words GGG's own filter
   reference uses (pathofexile.com/item-filter/about): BaseType ==, GemLevel, and the label, sound, beam and map
   icon actions, each value inside the range the reference gives. A price moves, so the block says in a comment
   when the prices it was cut from were checked, and is cut again from today's prices every time it is opened.

   A name the Exchange lists with its level ("Uncut Skill Gem (Level 20)") is one base item at a gem level, so a
   group in LEVELLED is written as the base and the levels it was picked at, each run of levels one rule. */
const LEVELLED = {'Uncut Gems': 'GemLevel'};
const LEVEL = /^(.+) \(Level (\d+)\)$/;
const FILTER_OVER = 50;   // exalted: where "worth over" starts
const LOOK = ['SetFontSize 45', 'SetTextColor 255 255 255 255', 'SetBorderColor 255 255 255 255',
  'SetBackgroundColor 120 30 140 255', 'PlayAlertSound 1 300', 'PlayEffect Purple', 'MinimapIcon 0 Purple Star'];
const FLT = {mode: 'over', over: FILTER_OVER};
let FEL = null;   // the open filter box

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function utc(iso){
  const d = new Date(iso);
  if(isNaN(d)) return '';
  const two = n => String(n).padStart(2, '0');
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + ', ' +
    two(d.getUTCHours()) + ':' + two(d.getUTCMinutes()) + ' UTC';
}
const exOf = r => {
  const ex = D.market.rates && D.market.rates.exalted;
  return ex && r.m.v !== undefined && r.m.v !== null ? r.m.v * ex : null;
};
function filterRows(){
  if(FLT.mode === 'watch') return ALL.filter(r => S.watch.has(r.it.id));
  return ALL.filter(r => (r.m.vol ?? 0) >= MIN_VOL && exOf(r) !== null && exOf(r) >= FLT.over);
}
function filterText(list){
  const quote = n => '"' + n + '"';
  const plain = [], lv = new Map();
  for(const r of list){
    if(r.it.n.includes('"')) continue;   // no base item carries one; a name that did could not be written
    const m = LEVELLED[r.m.cat] && LEVEL.exec(r.it.n);
    if(m) (lv.get(m[1]) || lv.set(m[1], []).get(m[1])).push(+m[2]);
    else plain.push(r.it.n);
  }
  const rules = [];
  const rule = conds => rules.push(['Show', ...conds, ...LOOK].map((x, i) => i ? '\t' + x : x).join('\n'));
  if(plain.length) rule(['BaseType == ' + plain.sort((a, b) => a.localeCompare(b)).map(quote).join(' ')]);
  for(const [base, levels] of [...lv].sort((a, b) => a[0].localeCompare(b[0]))){
    const at = LEVELLED[list.find(r => r.it.n.startsWith(base + ' (')).m.cat];
    levels.sort((a, b) => a - b);
    for(let i = 0; i < levels.length; ){
      let j = i;
      while(j + 1 < levels.length && levels[j + 1] === levels[j] + 1) j++;
      rule(['BaseType == ' + quote(base), at + ' >= ' + levels[i], at + ' <= ' + levels[j]]);
      i = j + 1;
    }
  }
  const times = list.map(r => r.m.at).filter(Boolean).sort();
  const px = list.map(exOf).filter(v => v !== null).sort((a, b) => a - b);
  const exs = v => (v >= 100 ? Math.round(v).toLocaleString('en') : +v.toPrecision(2)) + ' ex';
  const said = FLT.mode === 'watch' ? 'the watch list' + (px.length ? ', worth ' + (px.length > 1 && exs(px[0]) !== exs(px[px.length - 1])
      ? exs(px[0]) + ' to ' + exs(px[px.length - 1]) : exs(px[0])) : '')
    : 'worth ' + FLT.over.toLocaleString('en') + ' ex or more, ' + MIN_VOL + '+ div traded a day';
  return ['# Wraeclast Index: ' + said,
    '# Prices checked ' + (utc(times[0] || D.market.updated) || 'at an unknown time') + ' on the Currency Exchange',
    '# ' + list.length + (list.length === 1 ? ' item' : ' items') + '. Place above every other rule.',
    '', rules.join('\n\n'), ''].join('\n');
}
function paintFilter(){
  if(!FEL) return;
  const list = filterRows();
  for(const b of FEL.querySelectorAll('.cxf-mode .chip')) b.setAttribute('aria-pressed', String(b.dataset.m === FLT.mode));
  $('.cxf-watch .ct', FEL).textContent = watched();
  const out = $('.cxf-out', FEL), copy = $('.cxf-copy', FEL);
  out.textContent = list.length ? filterText(list)
    : FLT.mode === 'watch' ? 'No stars yet.' : 'Nothing worth that much today.';
  copy.disabled = !list.length;
  copy.textContent = 'Copy';
  $('.cxf-n', FEL).textContent = list.length + (list.length === 1 ? ' currency' : ' currencies');
}
function copyFilter(btn){
  const text = $('.cxf-out', FEL).textContent;
  const done = () => { btn.textContent = 'Copied'; };
  const byHand = () => {   // no clipboard permission: select the block, the way a player would
    const r = document.createRange();
    r.selectNodeContents($('.cxf-out', FEL));
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
    try { if(document.execCommand('copy')) done(); } catch {}
  };
  if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, byHand);
  else byHand();
}
function openFilter(){
  const box = document.createElement('section');
  box.className = 'cxfilt panel';
  box.innerHTML = '<h3>Loot filter</h3>' +
    '<div class="cxf-mode">' +
      '<button type="button" class="chip" data-m="over">Worth over</button>' +
      '<label class="cxf-over"><input class="field" type="number" min="1" step="1" inputmode="numeric" ' +
        'aria-label="Exalted Orbs" value="' + FLT.over + '"> ex</label>' +
      '<button type="button" class="chip cxf-watch" data-m="watch">★ Watching <span class="ct"></span></button>' +
    '</div>' +
    '<pre class="cxf-out" tabindex="0"></pre>' +
    '<div class="cxf-ft"><span class="note cxf-n" aria-live="polite"></span>' +
      '<button type="button" class="btn gold cxf-copy">Copy</button></div>';
  FEL = box;
  const n = $('.cxf-over input', box);
  onType(n, () => {
    const v = Math.floor(+n.value);
    if(v >= 1){ FLT.over = v; FLT.mode = 'over'; paintFilter(); }
  });
  box.addEventListener('click', e => {
    const m = e.target.closest('.cxf-mode .chip');
    if(m){ FLT.mode = m.dataset.m; paintFilter(); return; }
    const c = e.target.closest('.cxf-copy');
    if(c) copyFilter(c);
  });
  paintFilter();
  openBox(box, 'Loot filter');
}

/* ---------- view ---------- */
export function mount(el){
  EL = el;
  if(!D.market){ el.innerHTML = '<div class="pagehd"><h2>Currency</h2><p class="err">Prices are not loaded.</p></div>'; return {}; }
  // the rows are made once per set of prices: coming back to the tab draws them again, it does not remake them
  if(ALLOF !== D.market){ ALL = rows(); ALLOF = D.market; }
  /* The currency a player came for is the top of the page. The busiest markets are a thing to browse once
     you are done, so they sit under the grid rather than 24 rows above it. */
  el.innerHTML =
    '<div class="pagehd"><h2>Currency</h2><p>What each currency really traded for on the in-game Currency ' +
      'Exchange over the last 24 hours. Updated every hour.</p></div>' +
    '<div class="sect"><h3>Every currency</h3><span class="grow"></span>' +
      '<span class="sect-btns"><button type="button" class="btn" id="cxfilter">Loot filter</button>' +
      '<button type="button" class="btn gold" id="cxpick">★ Add to watch list</button></span></div>' +
    /* One row that wraps: what a player came with in hand, asked as a question; then the group (narrowed to
       whatever is asked), the search, and how the list is cut and sorted. The chips carry the tab's one count,
       drawn again with the grid (render). The price chips were a row of their own; one list says the same
       seven things. */
    '<div class="controls cx"><div class="row cx-row">' +
      '<div class="kinds cx-ask" id="cxask">' +
        [['all', 'All'], ...ASKS].map(([k, words]) => '<button type="button" class="chip" data-v="' + k + '" aria-pressed="' +
          (k === S.ask) + '">' + esc(words) + ' <span class="chip-n" data-n="' + k + '"></span></button>').join('') +
      '</div>' +
      '<select class="field" id="cxcat" aria-label="Group"></select>' +
      '<input class="field" id="cxq" type="search" placeholder="Search currency…" autocomplete="off" aria-label="Search currency">' +
        '<label class="note cx-liq"><input type="checkbox" id="cxliq" checked> Hide low volume</label>' +
        '<select class="field" id="cxtrend" aria-label="Price action">' + TRENDS.map(([k, l]) =>
          '<option value="' + k + '">' + (k === 'all' ? 'Any price action' : l) + '</option>').join('') + '</select>' +
        '<select class="field" id="cxsort" aria-label="Sort">' + SORTS.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select>' +
    '</div></div>' +
    '<div class="cards" id="cxcards"></div><div class="more cx-more" id="cxmore" hidden>' +
      '<button type="button" class="btn cx-next">Show more</button><button type="button" class="btn cx-all">Show all</button></div>' +
    '<p class="note" style="margin-top:18px">Rising or falling: 10%+ this week. Swinging: 12%+ in one day. Low volume: under ' + MIN_VOL + ' div a day. ' +
      'Source: the in-game Currency Exchange (GGG’s hourly feed of real trades).</p>' +
    '<div class="sect"><h3>Busiest exchange markets</h3><p>Last 24 hours. What one buys, and how much traded.</p></div>' +
    '<div class="cxm" id="cxmarkets"></div>';

  $('#cxcat', el).addEventListener('change', e => { S.cat = e.target.value; S.shown = PAGE; render(); });
  $('#cxtrend', el).addEventListener('change', e => { S.trend = e.target.value; S.shown = PAGE; render(); });
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
  const cq = $('#cxq', el);
  onType(cq, () => { S.q = cq.value.trim().toLowerCase(); S.words = S.q ? words(S.q) : []; S.shown = PAGE; render(); });
  // back on the tab: the boxes say what the list is already filtered by
  cq.value = S.q;
  $('#cxliq', el).checked = S.liquid;
  $('#cxtrend', el).value = S.trend;
  $('#cxsort', el).value = S.sort;
  $('#cxsort', el).addEventListener('change', e => { S.sort = e.target.value; render(); });
  $('#cxliq', el).addEventListener('change', e => { S.liquid = e.target.checked; S.shown = PAGE; render(); });
  $('.cx-next', el).addEventListener('click', () => { S.shown += PAGE; render(); });
  $('.cx-all', el).addEventListener('click', () => { S.shown += MOST; render(); });
  $('#cxpick', el).addEventListener('click', openPicker);
  $('#cxfilter', el).addEventListener('click', openFilter);
  el.addEventListener('click', onPage);

  markets($('#cxmarkets', el));
  return {update};
}

function update(){
  const c = params().get('c');
  if(c){ S.q = c.toLowerCase(); S.words = words(S.q); S.cat = 'all'; S.trend = 'all'; S.liquid = false;
    const q = $('#cxq', EL); if(q) q.value = c;
    const l = $('#cxliq', EL); if(l) l.checked = false;
    const g = $('#cxcat', EL); if(g) g.value = 'all';
    const t = $('#cxtrend', EL); if(t) t.value = 'all';
  }
  render();
}

/* The group list, drawn again whenever the question changes: every group, then each one the question covers. */
function paintCats(){
  const box = EL && $('#cxcat', EL); if(!box) return;
  box.innerHTML = ['all', ...askCats()].map(c => '<option value="' + esc(c) + '">' + (c === 'all' ? 'Every group' : esc(c)) + '</option>').join('');
  box.value = S.cat;
}
function render(){
  if(!EL) return;   // off the tab (a star from the popup): the tab draws the list from S when it is back
  const list = ALL.filter(r => match(r)).sort(SORTER[S.sort]);
  for(const n of EL.querySelectorAll('#cxask .chip-n'))
    n.textContent = (n.dataset.n === S.ask ? list.length : askCount(n.dataset.n)).toLocaleString();
  const grid = $('#cxcards', EL);
  flow(grid, list.slice(0, S.shown).map(r => ({key: 'c:' + r.it.id, r})), x => currencyCard(x.r));
  if(!list.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing here</h3>' +
    (S.trend === 'watch' ? '<p>Nothing watched yet.</p>' : '') + '</div>';
  const more = $('#cxmore', EL);
  more.hidden = list.length <= S.shown;
  if(!more.hidden) $('.cx-all', more).textContent = allLabel(list.length, S.shown);
}
/* The one listener on the tab's own box rather than on something drawn inside it, so it is taken off with the
   page: the box stays when the page goes, and a second one would star every card twice. */
function onPage(e){
  const act = e.target.closest('.card-do[data-act]');
  if(act){ e.preventDefault(); e.stopPropagation(); runAct(act.dataset.act, D.byKey.get('c:' + act.dataset.id)); return; }
  const b = e.target.closest('.star'); if(!b) return;
  e.preventDefault();
  toggleWatch(b.dataset.id);
}
/* Off the tab: its page goes, and what it was showing stays in S for the next time it is drawn. The watch list
   box lives in the popup, not on the page, so it is left alone. */
export function unmount(){
  if(EL) EL.removeEventListener('click', onPage);
  EL = null;
}
