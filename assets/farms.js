/* Farms tab: money-making strategies from BawLoch's public tier list sheet (data/farms.json, built by
   tools/farms.py). The sheet has no profit numbers and no amounts per map, so there is no cost or profit total:
   only each item's own price, and only when it comes from real listings.
   Prices: plain items from data/market.json (the Currency Exchange or trade listings). Rolled tablets and waystones from
   data/farmprices.json: the site's worker runs the trade searches in data/farmqueries.json through the
   hour and keeps the middle price of the 5 cheapest listings. Every item opens the normal card popup.

   An omen is spent on an orb. Its own line names the orb ("your next Chaos Orb will replace all Modifiers on
   a Waystone…"), the sheet never does, so the build pairs the two (tools/farms.py rides_on) and an input
   carrying `on` costs what both cost. An input list that names the omen alone is short of the run.

   Three clocks age an entry, and the strictest one wins (docs/proposal-farms.md):
     patch    a point release behind      marked on the card, and sorted below every current entry
              a minor version behind      the prices are not drawn: the entry keeps its setup and its links
              two minor versions behind   retired by the build, and the count printed here. Never silently
     league   the entry names an older league    the setup stands and today's prices are used, said on the card
     price    a rolled input unpriced for 7 days  no price is drawn for it and it is named
              over half an entry's inputs unpriced  the entry cannot answer for a run, so it says Not priced
     source   the sheet unread for 60 days   said once, on the version bar above the entries */
import { D, $, esc, card, flow, openDetail, priceOf, hrefOf, moneyHTML, change, spark, ago } from './app.js';
import { searchURL } from './trade.js';

const TIER_ORDER = ['S', 'A', 'B', 'C', 'D', 'F'];
const SORTS = [['tier', 'Tier'], ['rise', 'Outputs rising most']];
const S = {tier: 'all', mech: 'all', sort: 'tier'};
let EL, SRC = null, ROWS = [], QUERY = {}, FP = null;

async function getJSON(url){
  try {
    const r = await fetch(url);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
const num = v => typeof v === 'number' && isFinite(v);
const league = () => (D.market && D.market.league) || (FP && FP.league) || 'Standard';

/* ---------- the clocks ---------- */
const DAY = 864e5;
const PRICE_DAYS = 7;    // a rolled input whose last real listing is older than this has no price here
const SHEET_DAYS = 60;   // ...and the sheet itself goes on the version bar after this long unread
const older = (at, days) => { const t = at ? Date.parse(at) : NaN; return isFinite(t) && Date.now() - t > days * DAY; };
// the game's own patch, off the index the site already carries: the files count from 4, the game says 0
const livePatch = () => { const v = (D.index && D.index.v) || ''; const m = /^4\.(\d+)\.(\d+)/.exec(v); return m ? '0.' + m[1] + '.' + m[2] : ''; };
const parts = v => (String(v || '').match(/\d+/g) || []).map(Number);
/* How far an entry is behind the live patch. A missing third number is a .0, so 0.5 against 0.5.5 is five
   point releases behind and no minor version behind at all. A whole release apart counts as two minors:
   0.5 against 1.0 is further than any minor step inside a release. */
function behind(made, live){
  const a = parts(made), b = parts(live);
  if(a.length < 2 || b.length < 2) return null;
  if(b[0] !== a[0]) return {minor: b[0] > a[0] ? 2 : 0, point: 0};
  const minor = Math.max(0, b[1] - a[1]);
  return {minor, point: minor ? 0 : Math.max(0, (b[2] || 0) - (a[2] || 0))};
}
const madeFor = f => f.pv || (SRC && SRC.version) || '';
/* now: current. mark: a point release behind. dry: a minor behind, so no price is drawn. gone: retired.
   The build retires an entry two minors behind; this catches one the build has not seen yet, so the rule
   holds on the page whether or not the sheet has been read since the game moved on. */
function ageOf(f){
  const b = behind(madeFor(f), livePatch());
  if(!b) return 'now';
  return b.minor >= 2 ? 'gone' : b.minor === 1 ? 'dry' : b.point ? 'mark' : 'now';
}
const AGE = ['now', 'mark', 'dry'];
const ageIx = r => Math.max(0, AGE.indexOf(r.age));

/* ---------- items: the index entry when there is one, else a plain item the trade site knows ---------- */
let NAMES = null;
function indexed(n){
  if(!NAMES){
    NAMES = new Map();
    const rank = {u: 0, g: 1, c: 2};   // a lineage gem is both a gem and an exchange item: the gem card wins
    for(const it of D.index.items){
      if(!(it.k in rank)) continue;
      const cur = NAMES.get(it.n);
      if(!cur || rank[it.k] < rank[cur.k]) NAMES.set(it.n, it);
    }
  }
  return NAMES.get(n) || null;
}
function resolve(x){
  const q = x.q || 1, mods = x.m || [];
  const tq = x.tk && QUERY[x.tk];   // a rolled tablet or waystone: its own trade price, never the plain one
  const fp = x.tk && FP && FP.items && FP.items[x.tk];
  const trade = x.tk ? {url: tq ? searchURL(league(), tq) : null, at: fp && fp.at, total: fp && fp.total} : null;
  // the price clock: a listing the job last saw a week ago is not what a run costs today, so it is no price
  const cold = !!fp && older(fp.at, PRICE_DAYS);
  const tpx = fp && num(fp.price) && !cold ? {v: fp.price} : null;
  if(x.k === 'grp') return {n: x.n, q, mods, grp: true, trade, px: tpx, cold};
  const M = (D.market && D.market.items) || {};
  const found = indexed(x.n);
  const k = /^[cugb]$/.test(x.k) ? x.k : 'b';
  const it = found || {k, id: x.n, n: x.n, s: k === 'b' ? x.n + ' · ' + (x.s || 'Item') : (k === 'c' ? x.s || '' : '')};
  const m = x.tk ? tpx : (priceOf(it) || M['c:' + x.n] || M['u:' + x.n] || null);
  const px = m && num(m.v) ? m : null;
  const on = x.on ? resolve(x.on) : null;   // the orb an omen is spent on: one use each, off the omen's line
  return {n: x.n, q, mods, it, trade, px, cold, on, href: found ? hrefOf(found) : null,
    kind: found ? undefined : x.s, plain: !found,
    // what this input costs the run: the item and the use it rides on, and neither of them alone
    pair: px && (!on || on.px) ? (px.v + (on && on.px ? on.px.v : 0)) * q : null};
}

function row(f, i){
  const ins = (f.in || []).map(resolve), outs = (f.out || []).map(resolve);
  const age = ageOf(f), dry = age === 'dry';   // a minor version behind: the entry stands, the prices do not
  if(dry) for(const x of [...ins, ...outs]){ x.px = null; x.pair = null; if(x.on) x.on.px = null; }
  // an input is priced only with the use it rides on: an omen whose orb has no price cannot be costed either
  const short = x => !x.px || (x.on && !x.on.px);
  const missing = [...new Set(ins.filter(short).flatMap(x => x.px ? [x.on.n] : [x.n]))];
  return {f, i, ins, outs, age, dry,
    missing: dry ? [] : missing,
    // over half the inputs unpriced: the entry cannot answer what a run costs, and says so instead
    thin: !dry && ins.length > 0 && ins.filter(short).length * 2 > ins.length,
    traded: ins.some(x => x.trade)};
}

/* ---------- small pieces ---------- */
const ICONS = new Map();
function icon(it){   // the live card's own icon, so a row always matches the card it opens
  const k = it.k + ':' + it.id;
  if(!ICONS.has(k)) ICONS.set(k, card(it, {detail: true, price: null, href: null, builds: false}).querySelector('.card-ic').innerHTML);
  return ICONS.get(k);
}
function tierBadge(el, tier){
  el.classList.add('fm', 't-' + tier.toLowerCase());
  el.querySelector('.card-ic').innerHTML = '<span class="fm-tier" title="' + tier + ' tier">' + tier + '</span>';
}
function dots(label, n){
  if(!num(n)) return '';
  return '<span class="fm-rate">' + label + '<span class="fm-dots" role="img" aria-label="' + n + ' of 5">' +
    [1, 2, 3, 4, 5].map(i => '<i' + (i <= n ? ' class="on"' : '') + '></i>').join('') + '</span></span>';
}
function ratings(f){
  const h = dots('Difficulty', f.d) + dots('Investment', f.i);
  return h ? '<div class="fm-rates">' + h + '</div>' : '';
}
function costHTML(r){   // no total: the sheet gives no amounts per map. Just what has no real price yet.
  if(r.dry) return '';
  return r.missing.length ? '<p class="fm-miss">' + (r.thin ? '<span class="fm-tag off">Not priced</span>' : '') +
    'No price yet: ' + r.missing.map(esc).join(', ') + '</p>' : '';
}
/* The patch and league clocks, in one line on the entry they age. A card that looks current and is not is
   the fault this line exists for, so it is on the card and not only on the bar above them all. */
function ageHTML(r){
  if(r.age === 'now' && !oldLeague()) return '';
  const made = esc(madeFor(r.f)), live = livePatch(), lg = D.market && D.market.league;
  const from = oldLeague() ? made + ' · ' + esc(SRC.league) : made;
  if(r.dry) return '<p class="fm-age hard">Made for patch ' + from + '. Prices are not drawn.</p>';
  return '<p class="fm-age">Made for patch ' + from + '. The game is on ' + esc(live || '?') +
    (oldLeague() ? ' · ' + esc(lg) : '') + '.</p>';
}
const oldLeague = () => { const lg = D.market && D.market.league; return !!(lg && SRC && SRC.league && lg !== SRC.league); };
/* the trade line on a rolled tablet or waystone: listings, when it was checked, and the search itself */
function tradeLine(x, dry){
  const t = x.trade;
  if(!t || dry) return '';
  const said = x.px ? (num(t.total) ? t.total.toLocaleString() + ' listed · ' : '') + (t.at ? 'checked ' + ago(t.at) : '')
    : x.cold ? 'No price this week · last checked ' + ago(t.at)
    : (t.at && num(t.total) && !t.total ? 'None listed · checked ' + ago(t.at) : 'No price yet');
  return '<p class="card-facts fm-tline"><span class="fm-tag">Trade</span>' + esc(said) +
    (t.url ? ' <a class="card-ext" href="' + esc(t.url) + '" target="_blank" rel="noopener" title="This search on the trade site">Search ↗</a>' : '') + '</p>';
}
function outRows(r){
  const rows = r.outs.map((x, i) => x.grp ? '' :
    '<button type="button" class="fm-row" data-i="' + i + '"><span class="card-ic">' + icon(x.it) + '</span>' +
    '<span class="fm-n">' + esc(x.n) + '</span>' +
    (x.px ? spark(x.px.sp, x.px.ch) + '<span class="fm-p">' + moneyHTML(x.px.v) + '</span>' + change(x.px.ch)
      : r.dry ? '' : '<span class="fm-p none">no price</span>') + '</button>').join('');
  return rows + groups(r.outs, r.dry);
}
function groups(list, dry){
  const g = list.filter(x => x.grp);
  if(!g.length) return '';
  return '<div class="fm-grp">' + g.map(x => {
    const label = esc(x.n) + (x.q > 1 ? ' ×' + x.q : '') +
      (x.trade && !dry ? ' · ' + (x.px ? moneyHTML(x.px.v) + ' each' : 'no price yet') : '');
    return x.trade && x.trade.url
      ? '<a class="pill fm-tq" href="' + esc(x.trade.url) + '" target="_blank" rel="noopener" title="' + esc((x.mods || []).join(' · ')) + '">' + label + ' ↗</a>'
      : '<span class="pill">' + label + '</span>';
  }).join('') + '</div>';
}
function tradeLeague(u){   // the sheet's saved searches, opened in today's league
  const lg = D.market && D.market.league;
  return lg && SRC.league && lg !== SRC.league ? u.replace(/(\/trade2\/search\/poe2\/)[^/?#]+/, '$1' + encodeURIComponent(lg)) : u;
}
function links(f){
  const L = f.links || [];
  if(!L.length) return '';
  return '<div class="fm-links">' + L.map(l => '<a class="btn gold" href="' + esc(l.k === 'trade' ? tradeLeague(l.u) : l.u) +
    '" target="_blank" rel="noopener">' + esc(l.k === 'trade' ? 'Trade: ' + l.t : l.t) + ' ↗</a>').join('') + '</div>';
}
const HOURLY = 'Currency: the in-game Currency Exchange. Rolled tablets and waystones: middle of the 5 cheapest trade listings, checked over the day.';

/* ---------- the farm card, in the grid ---------- */
function farmCard(r){
  const f = r.f;
  const it = {k: 'f', id: f.id, n: f.name, s: (f.mech || []).join(' · ')};
  const extra = ageHTML(r) + ratings(f) + costHTML(r) +
    (f.in && f.in.length ? '<div class="fm-out"><p class="lbl">What it makes</p>' +
      (r.outs.length ? outRows(r) : '<p class="fm-miss">No drops named in the list.</p>') + '</div>'
      : '<p class="fm-miss">Only on the tier list. No setup given.</p>');
  const el = card(it, {detail: true, price: null, href: null, builds: false, kind: 'Farm', extra,
    action: f.master ? '<span class="fm-master" title="Atlas master">' + esc(f.master) + '</span>' : ''});
  tierBadge(el, f.tier);
  el.addEventListener('click', e => {
    const b = e.target.closest('.fm-row');
    if(b){ openItem(r.outs[+b.dataset.i], r.dry); return; }
    if(e.target.closest('a, button')) return;
    openFarm(r);
  });
  el.addEventListener('keydown', e => {
    if(e.target === el && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openFarm(r); }
  });
  return el;
}

/* ---------- popups ---------- */
/* The orb an omen is spent on. Both are gone at the end of the use, so the run costs both: the card keeps
   the omen's own price and carries the pair beside it. The orb is the game's own word on the omen, not the
   sheet's, so it is named on the card and opens its own. */
function ridesHTML(x, dry){
  const on = x.on;
  if(!on || dry) return '';
  const name = (x.q > 1 ? x.q + ' ' : '') + on.n + (x.q > 1 ? 's' : '');
  return '<p class="card-facts fm-on">Rides on ' +
    (on.href ? '<a class="card-ext" href="' + esc(on.href) + '">' + esc(name) + '</a>' : esc(name)) +
    ' · ' + (on.px ? moneyHTML(on.px.v * x.q) : 'no price yet') + '</p>';
}
function itemOpts(x, dry){
  const o = {price: dry ? null : x.px, href: x.href};
  if(x.plain){ o.builds = false; if(x.kind) o.kind = x.kind; }
  if(x.on && !dry) o.invest = {label: 'With its ' + x.on.n, div: x.pair,
    note: x.pair === null ? 'no price yet' : ''};
  o.extra = (x.mods.length ? '<p class="fm-mods">' + x.mods.map(esc).join(' · ') + '</p>' : '') +
    (x.q > 1 ? '<p class="card-facts">' + x.q + ' per run' + (x.px && !dry ? ' · ' + moneyHTML(x.px.v * x.q) : '') + '</p>' : '') +
    ridesHTML(x, dry) + tradeLine(x, dry);
  return o;
}
function openItem(x, dry){ if(x && x.it) openDetail(x.it, itemOpts(x, dry), x.href); }

function setupHTML(f){
  const rows = [];
  if(f.setups) for(const s of f.setups)
    rows.push([s.map, [s.master, s.waystone, s.tablets].filter(Boolean).map(esc).join('<br>')]);
  else {
    if(f.master) rows.push(['Atlas master', esc(f.master)]);
    if(f.waystone) rows.push(['Waystone', esc(f.waystone)]);
    if(f.tablets) rows.push(['Tablets', f.tablets.length ? '<ul class="fm-tabs">' + f.tablets.map(t => '<li><b>' + esc(t.n) + '</b>' +
      (t.x > 1 ? ' ×' + t.x : '') + (t.mods.length ? '<span>' + t.mods.map(esc).join(' · ') + '</span>' : '') + '</li>').join('') + '</ul>' : 'None']);
  }
  if(f.rarity) rows.push(['Rarity', esc(f.rarity)]);
  return rows.length ? '<div class="fm-sec"><p class="lbl">Setup</p><dl class="fm-dl">' +
    rows.map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + v + '</dd>').join('') + '</dl></div>' : '';
}
function openFarm(r){
  const f = r.f;
  const spend = r.ins.filter(x => !x.grp).length, make = r.outs.filter(x => !x.grp).length;
  const notes = (f.notes || []).length ? '<ul class="card-ls fm-notes">' + f.notes.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '';
  const extra = ageHTML(r) + ratings(f) + (f.in && f.in.length ? '' : '<p class="fm-miss">Only on the tier list. No setup given.</p>') + notes + setupHTML(f) +
    (r.ins.length ? '<div class="fm-sec"><p class="lbl">What you spend</p>' + costHTML(r) +
      (r.traded && !r.dry ? '<p class="fm-miss">' + HOURLY + '</p>' : '') +
      (spend ? '<div class="cards fm-items" data-fm="in"></div>' : '') + groups(r.ins, r.dry) + '</div>' : '') +
    (f.in && f.in.length ? '<div class="fm-sec"><p class="lbl">What it makes</p>' +
      (r.outs.length ? (make ? '<div class="cards fm-items" data-fm="out"></div>' : '') + groups(r.outs, r.dry) : '<p class="fm-miss">No drops named in the list.</p>') + '</div>' : '') +
    links(f);
  const it = {k: 'f', id: f.id, n: f.name, s: [f.tier + ' tier', ...(f.mech || [])].join(' · ')};
  openDetail(it, {price: null, builds: false, kind: 'Farm', why: f.tip, extra,
    action: '<span>' + (f.updated ? 'Updated ' + esc(f.updated) + ' · ' : '') + 'by ' + esc(SRC.author) + '</span>'}, null);
  const box = document.querySelector('.ov .ov-body > .card.detail');
  if(!box) return;
  tierBadge(box, f.tier);
  const fill = (sel, list) => {
    const host = box.querySelector(sel);
    if(host) host.append(...list.filter(x => !x.grp).map(x => card(x.it, itemOpts(x, r.dry))));
  };
  fill('[data-fm="in"]', r.ins);
  fill('[data-fm="out"]', r.outs);
}

/* ---------- the version line: which patch and league the list was made for ---------- */
/* "N entries retired: made for patch X." The build drops them (tools/farms.py retire) and the count comes
   out with the file; an entry the build has not caught up with is retired here and counted the same way.
   A retirement is never silent: twenty cards that each look current is the fault this tab had. */
function retiredHTML(){
  const gone = new Map();
  for(const x of (SRC.retired || [])) gone.set(x.v, (gone.get(x.v) || 0) + x.n);
  for(const r of ROWS) if(r.age === 'gone') gone.set(madeFor(r.f), (gone.get(madeFor(r.f)) || 0) + 1);
  return [...gone].sort().map(([v, n]) => '<p class="fm-warn">' + n + ' entr' + (n === 1 ? 'y' : 'ies') +
    ' retired: made for patch ' + esc(v) + '.</p>').join('');
}
function versionHTML(){
  const s = SRC, lg = D.market && D.market.league;
  const patch = livePatch();   // same as the footer
  const yt = (s.links || []).find(l => l.t === 'YouTube');
  const by = yt ? '<a href="' + esc(yt.u) + '" target="_blank" rel="noopener">' + esc(s.author) + '</a>' : esc(s.author);
  const warn = [];
  if(!lg) warn.push('Prices are not loaded. Try again in a minute.');
  else if(s.league && lg !== s.league) warn.push('This list is from an older league. Prices below are from ' + esc(lg) + '.');
  if(patch && s.version && patch !== s.version && !patch.startsWith(s.version + '.')) warn.push('The game is on patch ' + esc(patch) + ' now.');
  const entries = n => n + ' entr' + (n === 1 ? 'y is' : 'ies are');
  const marked = ROWS.filter(r => r.age === 'mark').length, dried = ROWS.filter(r => r.dry).length;
  if(marked) warn.push(entries(marked) + ' a point release behind.');
  if(dried) warn.push(entries(dried) + ' a minor version behind. No prices are drawn for those.');
  if(older(s.fetched, SHEET_DAYS)) warn.push('The sheet was last read ' + esc(ago(s.fetched)) + '.');
  return '<div class="fm-ver"><p class="fm-label">Made for patch <b>' + esc(s.version) + '</b> · <b>' + esc(s.league) + '</b> league · updated <b>' +
    esc(s.updated) + '</b> · tier list by ' + by + '</p>' + retiredHTML() +
    warn.map(w => '<p class="fm-warn">' + w + '</p>').join('') +
    '<div class="fm-src"><a class="btn gold" href="' + esc(s.url) + '" target="_blank" rel="noopener">Open the sheet ↗</a>' +
    (s.links || []).map(l => '<a class="card-ext" href="' + esc(l.u) + '" target="_blank" rel="noopener">' + esc(l.t) + ' ↗</a>').join('') + '</div></div>';
}

/* ---------- view ---------- */
export async function mount(el){
  EL = el;
  el.innerHTML = '<div class="pagehd"><h2>Farms</h2></div><p class="note">Loading…</p>';
  const [data, qs, fp] = await Promise.all([getJSON('data/farms.json'), getJSON('data/farmqueries.json'), getJSON('data/farmprices.json')]);
  if(!data || !data.farms){
    el.innerHTML = '<div class="pagehd"><h2>Farms</h2><p class="err">Could not load the farms. Try again in a minute.</p></div>';
    return {};
  }
  SRC = data.source;
  QUERY = Object.fromEntries(((qs && qs.queries) || []).map(x => [x.key, x.query]));
  FP = fp;
  ROWS = data.farms.map(row);
  const live = ROWS.filter(r => r.age !== 'gone');   // a retired entry is a count on the bar, not a chip
  const tiers = TIER_ORDER.filter(t => live.some(r => r.f.tier === t));
  const count = {};
  for(const r of live) for(const m of r.f.mech || []) count[m] = (count[m] || 0) + 1;
  const mechs = Object.keys(count).sort((a, b) => count[b] - count[a] || a.localeCompare(b));
  const chips = (id, list, cur) => '<div class="kinds fm-chips" id="' + id + '">' + list.map(([v, l]) =>
    '<button type="button" class="chip" data-v="' + esc(v) + '" aria-pressed="' + (v === cur) + '">' + esc(l) + '</button>').join('') + '</div>';
  el.innerHTML =
    '<div class="pagehd"><h2>Farms</h2><p>Money-making strategies from ' + esc(SRC.author) + '\'s tier list, priced live.</p></div>' +
    versionHTML() +
    '<div class="controls fm-ctl">' +
      '<div class="row">' + chips('fmtier', [['all', 'All tiers'], ...tiers.map(t => [t, t])], S.tier) + '</div>' +
      '<div class="row">' + chips('fmmech', [['all', 'All'], ...mechs.map(m => [m, m])], S.mech) + '</div>' +
      '<div class="row"><span class="note" id="fmcount"></span><span class="grow"></span><label class="lbl" for="fmsort">Sort</label>' +
        '<select class="field" id="fmsort">' + SORTS.map(([k, l]) => '<option value="' + k + '"' + (k === S.sort ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
    '</div>' +
    '<div class="cards fm-grid" id="fmcards"></div>' +
    '<p class="note fm-foot">' + HOURLY +
      (FP && FP.updated ? ' Last check ' + esc(ago(FP.updated)) + '.' : '') +
      ' Tiers, setups and notes: <a href="' + esc(SRC.url) + '" target="_blank" rel="noopener">' + esc(SRC.author) + '\'s sheet</a>.</p>';

  const seg = (id, key) => $('#' + id, el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S[key] = b.dataset.v;
    [...b.parentNode.children].forEach(c => c.setAttribute('aria-pressed', String(c === b)));
    render();
  });
  seg('fmtier', 'tier'); seg('fmmech', 'mech');
  $('#fmsort', el).addEventListener('change', e => { S.sort = e.target.value; render(); });
  return {update: render};
}

const rise = r => {   // the average 7-day move of the drops that have a price
  const m = r.outs.filter(x => x.px && num(x.px.ch)).map(x => x.px.ch);
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
};
const tierIx = r => { const i = TIER_ORDER.indexOf(r.f.tier); return i < 0 ? 99 : i; };
// an entry behind the live patch sorts below every current one, whatever the sort: the patch clock first
const byTier = (a, b) => ageIx(a) - ageIx(b) || tierIx(a) - tierIx(b) || a.i - b.i;
const last = (a, b, v, dir) => {   // farms with nothing priced go last in any price sort
  if(ageIx(a) !== ageIx(b)) return ageIx(a) - ageIx(b);
  const x = v(a), y = v(b);
  if(x === null && y === null) return byTier(a, b);
  if(x === null) return 1;
  if(y === null) return -1;
  return dir * (x - y) || byTier(a, b);
};
const SORTER = {
  tier: byTier,
  rise: (a, b) => last(a, b, rise, -1),
};
function match(r){
  if(r.age === 'gone') return false;   // retired: counted on the version bar, never drawn as a strategy
  if(S.tier !== 'all' && r.f.tier !== S.tier) return false;
  if(S.mech !== 'all' && !(r.f.mech || []).includes(S.mech)) return false;
  return true;
}
function render(){
  if(!EL || !ROWS.length) return;
  const list = ROWS.filter(match).sort(SORTER[S.sort] || byTier);
  $('#fmcount', EL).innerHTML = '<b>' + list.length + '</b> farm' + (list.length === 1 ? '' : 's');
  const grid = $('#fmcards', EL);
  flow(grid, list.map(r => ({key: r.f.id, r})), x => farmCard(x.r));
  if(!list.length) grid.innerHTML = '<div class="empty" style="grid-column:1/-1"><h3>Nothing here</h3></div>';
}
