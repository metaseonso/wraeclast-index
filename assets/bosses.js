/* Bosses tab: every endgame boss in the game files, what it drops and what it costs to get in.
   Data: data/bosses.json (tools/bosses.py). The areas, each area's own level and the game's own pinnacle marking
   are game data. The boss names come from Path of Building; the drop pools and the entry items from Exiled
   Exchange 2 and Path of Building, joined to a boss on item names and nothing else (three of them were checked
   by hand against the game's drop limits, nothing more); the drop rates are the PoE2 Wiki's community samples,
   and every rate says so where it is shown. Nothing in the game files states a drop rate.
   Prices: data/bossprices.json (worker/prices.js) resolves every name at once from the unique checks, the
   in-game Currency Exchange and the trade searches in data/bossqueries.json; a name it does not carry falls back to
   the card's own market price. Real prices only, and a rate never meets one: no value per kill, here or anywhere. */
import { D, $, esc, card, openDetail, priceOf, hrefOf, money as coin, moneyHTML, change, spark, ago, params } from './app.js';

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

/* ---------- is it worth killing? ----------
   Three real prices and one community sample, and nothing else. What the way in costs and what a drop sells
   for are live prices; how often a drop falls is the PoE2 Wiki's own sample, named and counted on screen
   wherever it is used. A rate never lands as one number: every one is drawn as the 95% Wilson band on the
   sample the wiki took, so a figure taken over 71 kills reads as the span it really is. A row with no sample
   and a drop with no price are both left out and counted on screen. Nothing here is filled in with a guess,
   and no rate is ever multiplied into a value per kill that is offered as fact.

   The settle figure is the other half of the answer, because these returns are lumpy. After n kills the 95%
   band on the average is 1.96 * sigma / (mu * sqrt(n)) wide, so the kills that bring it inside a quarter of
   the average are n = (1.96 * sigma / (0.25 * mu))^2, sigma taken over the counted drops one at a time (each
   on its own, which is the wide end: a table where one unique drops or another cannot swing further than
   that). For a single drop it comes to 1.96 / sqrt(k), which is 61 of the thing seen — the same arithmetic
   as docs/proposal-farms.md. Kills an hour is the player's own number and is never ours. */
const Z = 1.96;         // the 95% band
const NEAR = 0.25;      // how near the average has to settle before an average is worth reading
const KPH_KEY = 'wi.bosskph';
let KPH = 6;            // kills an hour, the player's own, kept in their browser
try { const v = Math.round(+localStorage.getItem(KPH_KEY)); if(v >= 1 && v <= 30) KPH = v; } catch {}

function wilson(p, n, up){
  const k = Z * Z / n, c = (p + k / 2) / (1 + k);
  const h = Z / (1 + k) * Math.sqrt(p * (1 - p) / n + k / (4 * n));
  return Math.max(0, Math.min(1, up ? c + h : c - h));
}
/* The shapes the wiki writes a rate in: a number, an approximation ("~1.5%"), a span ("23-34%"), now and then
   two numbers ("19.5% (17%)"), and a ceiling ("<1%"). A ceiling keeps the wiki's own ceiling and takes no
   band: it is already a statement about how small the number is, and nothing was counted to widen. */
function rateBand(r){
  const ns = String(r.rate || '').match(/\d+(?:\.\d+)?/g);
  if(!ns || !num(r.sample)) return null;
  const v = ns.map(x => +x / 100), pt = v[0];
  if(/^\s*</.test(r.rate)) return {lo: 0, hi: pt, pt, cap: true};
  return {lo: wilson(Math.min(...v), r.sample, false), hi: wilson(Math.max(...v), r.sample, true), pt};
}
const pct = v => (v * 100 >= 10 ? Math.round(v * 100) : +(v * 100).toFixed(1)) + '%';

/* A run is one way the fight is done. The wiki's table splits a boss by mode — the Arbiter is Regular or
   Uber — and by the conditions it writes into a group ("If the ring is taken immediately…"); a row that names
   neither belongs to every run. Two runs are never added together: that would count one drop twice. */
const isCond = g => /^if\b/i.test(g || '');
function runsOf(b){
  const rows = (b.rates && b.rates.rows) || [];
  const modes = [...new Set(rows.map(r => r.mode || '').filter(Boolean))];
  const out = [];
  for(const m of modes.length ? modes : ['']){
    const mine = rows.filter(r => !r.mode || r.mode === m);
    const conds = [...new Set(mine.map(r => r.group || '').filter(isCond))];
    // the wiki writes a condition as a whole sentence about what drops; the run is named by the condition
    // itself, which is the clause before the comma
    for(const c of conds.length ? conds : [''])
      out.push({name: [m, c.split(',')[0].replace(/\.*$/, '')].filter(Boolean).join(' · '),
        rows: mine.filter(r => !isCond(r.group) || r.group === c)});
  }
  return out;
}
/* How many of an entry item one way in takes, off the item's own line and nothing else: a splinter says
   "Combine 300 Splinters…" itself. An item that says nothing is one item. */
function eachOf(x){
  const M = (D.market && D.market.items) || {};
  const said = (x.it && x.it.t) || (M['c:' + x.n] || {}).u || '';
  const m = said.match(/Combine (\d+)/);
  return m ? +m[1] : 1;
}
/* One run, worked: what it costs to get in, what the sampled drops come to, and how many kills the average
   takes to settle. counted, nosample and noprice are all shown, so the reader sees how much of the table the
   figures are made of. */
function meterOf(r, run){
  const px = new Map(r.drops.map(x => [x.n.toLowerCase(), x.px]));
  const out = {counted: 0, nosample: 0, noprice: 0, lo: 0, hi: 0, kills: null, rows: run.rows.length,
    sample: [...new Set(run.rows.filter(x => num(x.sample)).map(x => x.sample))].sort((a, b) => a - b)};
  let mu = 0, vr = 0;
  for(const row of run.rows){
    const b = rateBand(row);
    if(!b){ out.nosample++; continue; }
    const p = px.get(row.item.toLowerCase());
    if(!p || !num(p.v)){ out.noprice++; continue; }
    out.counted++;
    out.lo += b.lo * p.v; out.hi += b.hi * p.v;
    mu += b.pt * p.v; vr += p.v * p.v * b.pt * (1 - b.pt);
  }
  if(out.counted && mu > 0) out.kills = Math.ceil(Math.pow(Z * Math.sqrt(vr) / (NEAR * mu), 2));
  const ways = r.access.filter(x => x.px && num(x.px.v))
    .map(x => ({n: x.n, each: eachOf(x), div: eachOf(x) * x.px.v}))
    .sort((a, x) => a.div - x.div);
  out.way = ways[0] || null;
  out.ways = ways.length;
  return out;
}

/* ---------- the meter: four rows, and every one of them either a figure or what it is missing ---------- */
/* A range in one unit, the dearer end picking it, so the two ends read against each other. */
function span(lo, hi){
  const m = coin(Math.max(Math.abs(lo), Math.abs(hi)));
  if(!m) return '<b class="none">no price</b>';
  const ex = (D.market && D.market.rates && D.market.rates.exalted) || 1;
  const put = v => {
    const x = m.u === 'ex' ? v * ex : v, a = Math.abs(x);
    return (a >= 100 ? Math.round(x).toLocaleString() : +x.toFixed(a >= 10 ? 1 : 2)).toString();
  };
  return '<b>' + put(lo) + ' – ' + put(hi) + '<small>' + m.u + '</small></b>';
}
const hrs = n => n < 10 ? +n.toFixed(1) : Math.round(n);
const miss = said => '<b class="none">' + esc(said) + '</b>';
const figHTML = (cls, label, value, sub) => '<div class="bo-fig' + (cls ? ' ' + cls : '') + '"><span>' + label +
  '</span>' + value + '<i>' + esc(sub) + '</i></div>';
const wayFig = m => figHTML('', 'Way in', m.way ? '<b>' + moneyHTML(m.way.div) + '</b>' : miss('no price'),
  m.way ? m.way.n + (m.way.each > 1 ? ' ×' + m.way.each : '') +
    (m.ways > 1 ? ' · cheapest of ' + m.ways + ' priced' : '') : 'no entry priced');
const killFig = m => figHTML('', 'A kill', m.counted ? span(m.lo, m.hi) : miss('no sample'),
  m.counted ? m.counted + ' of ' + m.rows + ' drops · ' + m.sample.join(' and ') + ' kills sampled'
    : m.rows + ' drops, none sampled');
const hourFig = m => figHTML('bo-hr', 'An hour',
  m.counted && m.way ? span((m.lo - m.way.div) * KPH, (m.hi - m.way.div) * KPH) : miss(m.counted ? 'no price' : 'no sample'),
  m.counted && m.way ? 'at ' + KPH + ' kills an hour' : m.counted ? 'the way in has none' : 'nothing to work it out from');
const settleFig = m => figHTML('bo-set', 'Settles',
  m.kills ? '<b>' + m.kills.toLocaleString() + ' kills</b>' : miss('no sample'),
  m.kills ? hrs(m.kills / KPH) + ' hours at ' + KPH + ' an hour' : 'nothing to work it out from');

function runHTML(r, run, i){
  const m = meterOf(r, run);
  const left = [m.nosample ? m.nosample + ' with no sample' : '', m.noprice ? m.noprice + ' with no price' : '']
    .filter(Boolean);
  return '<div class="bo-roi" data-run="' + i + '">' +
    (run.name ? '<p class="lbl">' + esc(run.name) + '</p>' : '') +
    wayFig(m) + killFig(m) + hourFig(m) + settleFig(m) +
    (left.length ? '<p class="note">Left out: ' + esc(left.join(', ')) + '.</p>' : '') + '</div>';
}
/* The whole section. A boss the wiki never sampled draws no meter at all: where there is no sample there is
   no figure, and a blank would read as a zero. */
function roiHTML(r){
  const b = r.b;
  if(!b.rates || !((b.rates.rows || []).length)) return '';
  const runs = runsOf(b);
  return '<div class="bo-sec bo-worth"><p class="lbl">Worth it</p>' +
    runs.map((run, i) => runHTML(r, run, i)).join('') +
    '<label class="bo-kph"><span class="lbl">Kills an hour <b>' + KPH + '</b></span>' +
      '<input type="range" min="1" max="30" step="1" value="' + KPH + '" data-do="kph" aria-label="Kills an hour"></label>' +
    '<p class="note">' + esc(rateSrc(b.rates)) + '</p>' +
    '<p class="note">Prices: the in-game Currency Exchange and the trade site' +
      (BP && BP.updated ? ', checked ' + esc(ago(BP.updated)) : '') + '. Kills an hour is yours.</p>' +
    '<p class="note">Settles: the kills it takes for the average to sit within a quarter of itself, ' +
      '19 times in 20.</p></div>';
}
// a boss the meter can answer for: one run with a sampled rate and a real price on the same drop
const drawsMeter = r => runsOf(r.b).some(run => meterOf(r, run).counted > 0);
/* The slider moves and the two rows that stand on it are redrawn where they are, so the card keeps its place
   and the finger keeps the slider. The card's own extra is rewritten with them: a step back and forward
   redraws from it, and it would otherwise come back at the old number. */
function onBoss(r, opts, what, el){
  if(what !== 'kph') return;
  const v = Math.max(1, Math.min(30, Math.round(+el.value) || KPH));
  KPH = v;
  try { localStorage.setItem(KPH_KEY, String(v)); } catch {}
  const box = el.closest('.bo-worth');
  if(!box) return;
  const lab = box.querySelector('.bo-kph b');
  if(lab) lab.textContent = v;
  const runs = runsOf(r.b);
  for(const blk of box.querySelectorAll('.bo-roi')){
    const m = meterOf(r, runs[+blk.dataset.run]);
    const hr = blk.querySelector('.bo-hr'), st = blk.querySelector('.bo-set');
    if(hr) hr.outerHTML = hourFig(m);
    if(st) st.outerHTML = settleFig(m);
  }
  opts.extra = extraOf(r);
}

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
/* ...and its own band: a rate is what a sample landed on, so what it says next to it is the span that sample
   really covers — 42% over 71 kills is 31% to 54%, and a reader who sees only the 42% is reading luck. */
const rateTag = r => {
  const b = rateBand(r);
  return [r.mode, (r.group || '').replace(/\.\.\.$/, '…'),
    b && !b.cap ? pct(b.lo) + '–' + pct(b.hi) + ' over ' + r.sample + ' kills'
      : num(r.sample) ? r.sample + ' kills' : null].filter(Boolean).join(' · ');
};
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
/* One boss's card, from anywhere: the search opens it without the tab ever being on screen
   (assets/app.js OWN_CARD hands the kind over here). */
export async function openCard(it){
  if(await load()){
    const r = ROWS.find(x => x.b.name === it.n);
    if(r) openBoss(r);
  }
}
/* Everything the boss card carries under its head, made again whenever it is drawn again: the meter stands on
   a number the player sets, so the card's own copy of it has to be made fresh and not kept. */
function extraOf(r){
  const b = r.b, rated = !!(b.rates && (b.rates.rows || []).length), from = dropSrc(r);
  const pills = [];   // the level is not a pill: it sits on its own area, in the line under the boss's name
  if(b.pinnacle) pills.push('<span class="pill">Pinnacle</span>');
  if(r.drops.length) pills.push('<span class="pill">' + r.drops.length + (r.drops.length === 1 ? ' drop' : ' drops') + '</span>');
  return (pills.length ? '<div class="card-req">' + pills.join('') + '</div>' : '') +
    roiHTML(r) +
    (r.access.length ? '<div class="bo-sec"><p class="lbl">Way in</p><div class="bo-tbl">' +
      r.access.map((x, i) => itemRow(x, r.i + ':a:' + i, false)).join('') +
      '</div><p class="note">Way in: the entry items Exiled Exchange 2 lists as dropping what this boss drops.</p></div>' : '') +
    (r.drops.length ? '<div class="bo-sec"><p class="lbl">What it drops</p>' +
      (rated ? '<div class="bo-thd"><span>Item</span><span>Price</span><span>Drop rate</span></div>' : '') +
      '<div class="bo-tbl">' + r.drops.map((x, i) => itemRow(x, r.i + ':d:' + i, rated)).join('') + '</div>' +
      (from ? '<p class="note">' + esc(from) + '</p>' : '') +
      (rated ? '<p class="note">' + esc(rateSrc(b.rates)) + '</p>' : '') + '</div>'
      : '<p class="fm-miss">No feed names what this one drops.</p>');
}
function openBoss(r){
  const b = r.b, it = bossItem(b);
  const here = /^#\/bosses\b/.test(location.hash);   // on the tab already: the gold button has nowhere new to go
  const opts = {price: null, builds: false, drawn: true, kind: b.pinnacle ? 'Pinnacle boss' : 'Boss',
    extra: extraOf(r)};
  opts.on = (what, el) => onBoss(r, opts, what, el);
  openDetail(it, opts, here ? null : hrefOf(it));
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
/* The rows, made once, whether the tab or the search asked for them. The boss file is the one the search
   already holds (assets/app.js D.bosses); only the prices are fetched here. */
let LOADING = null;
function load(){
  return LOADING || (LOADING = (async () => {
    const [data, px] = await Promise.all([D.bosses || getJSON('data/bosses.json'), getJSON('data/bossprices.json')]);
    if(!data || !data.bosses) return false;
    B = data; BP = px;
    ROWS = data.bosses.map(row);
    wire();
    return true;
  })());
}
export async function mount(el){
  EL = el;
  el.innerHTML = head() + '<p class="note">Loading…</p>';
  if(!await load()){
    el.innerHTML = head() + '<p class="err">Could not load the bosses. Try again in a minute.</p>';
    return {};
  }
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
    '<p class="note bo-foot">Prices: the in-game Currency Exchange every hour, live trade site listings over the day.' +
      (BP && BP.updated ? ' Last check ' + esc(ago(BP.updated)) + '.' : '') + '</p>' +
    '<p class="note">Only the bosses a drop feed covers have a way in and a drop list. Pinnacle is the game’s own ' +
      'marking, so a few fights players call pinnacle are not marked. Drop rates are community samples from the ' +
      '<a href="' + esc(srcURL('PoE2 Wiki')) + '" target="_blank" rel="noopener">PoE2 Wiki</a> (CC BY-NC-SA), not game data. ' +
      'A meter is drawn where a sample and a real price meet on the same drop: ' +
      ROWS.filter(drawsMeter).length + ' of ' + ROWS.length + ' bosses.</p>' +
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
    : '<div class="empty"><h3>Nothing matches</h3></div>';
}
