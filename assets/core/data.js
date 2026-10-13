import { OP } from '../search/protocol.js';   // the ops the search worker answers, by name
import { lazy, stuck, spend } from '../core/lazy.js';
import { ours, KIND, MAKE, slotList, jobOf, holds, NAMES } from '../kinds.js';
import { seenKeys } from '../core/seen.js';
import { ranker } from '../rank.js';
import * as edges from '../edges.js';
import { idle, IS_APP } from '../core/html.js';
import { unpack, inOrder } from '../cut.js';

/* ---------- data ----------
   The home page is a search bar, so all its first paint takes is today's prices, for the stamp in the top bar,
   and the manifest, for the patch it names. Nothing of the index is fetched until the page needs it, and then
   only the piece it needs (the cut, tools/shards.py):
     data/market.json?part=live   every price, without the day-by-day history, written short (worker/prices.js).
                                  index.html asks for it before its styles; the drill-down page hands in the
                                  ?part=now it has already read (window.WI_MARKET), so no page asks twice
     data/manifest.json           the index's id and patch, and every file of the cut. Never kept long
     data/market-last.json        the prices as they were when the deploy was built (tools/build.mjs), every one
                                  with the time it was checked: read only when the live prices fail or take over 4
                                  seconds, and the stamp then says when they are from and that live prices are paused
     data/facts/<v>.json          what the catalogue says about each currency: its name, picture and what it does.
                                  Named by its content, so the browser keeps it for a year; the deploy ships the one
                                  that was live when it was built, and a newer one (a 404 here) comes from the worker
                                  as data/market.json?part=facts&v=<v>
     data/cards/meta.<h>.json     what every card is drawn with and no card carries: sprite sheets, image servers,
                                  the orb ladders, keyword names, the table the line marks point into
     data/search/<k>.<h>.json     every kind's search rows: read by the search worker (assets/searchworker.js),
                                  never by the page. The page asks it for answers and holds only what it shows
     data/cards/<k>/<nn>.<h>.json the cards whole, a couple of hundred KB a file: through the worker as a card is
                                  drawn or opened, or all of them on a tab that works over the whole index
     data/bosses.json             the bosses, which join the search (tools/bosses.py)
     data/market.json?part=hist   the history, for the charts: only once a chart or a popup asks (hist())
   Three steps, each started once and never by itself:
     wake()   the search: a search box touched, the "/" key, a search in the address, a card or a box opened, or
              the home page sitting idle a few seconds after it is drawn. `first` is the meta with today's prices
              and the cards the page makes itself; `searching` is the worker answering and the keyword and
              mechanics cards held, whose words mark every card's lines
     have(keys), whole(keys)   the head, or the whole card, of each key the page is about to draw
     need()   the whole index, for a tab that works over all of it (and the Map): `ready`. A page holding the
              whole index answers its searches itself, by the same rules (assets/rank.js). */
/* A second copy of the shell. On the app, this file runs before the page has finished loading, every time. Running
   after it means an older app already on this page (a tab left open across a deploy) has just fetched a module of a
   newer deploy, and that module asked for the store by a path the older app never loaded: two stores on one page,
   one of them empty. The page reloads once into the deploy the server has now (the same one reload lazy() takes). */
if(IS_APP && document.readyState === 'complete' && spend('core/data.js')) location.reload();

export const D = { index: null, market: null, usage: null, byKey: new Map(), full: false };   // usage stays empty: see buildsHref
async function getJSON(url, opt, early){
  const r = await (early || fetch(url, opt));   // the browser keeps it for 2 minutes (_headers), then checks for a new one
  if(!r) return getJSON(url, opt);              // the copy handed in never came: ask
  if(typeof r.json !== 'function') return r;    // the drill-down page's own copy, already read
  if(!r.ok || isPage(r)) throw Object.assign(new Error(url + ' ' + r.status), {gone: r.status === 404 || r.status === 410 || isPage(r)});
  return r.json();
}
// a page where a data file was asked for: the not-found page, or anything else that is not the file
const isPage = r => /text\/html/i.test(r.headers.get('Content-Type') || '');
const EARLY = window.WI_FIRST || {};   // index.html asks for today's prices before its styles
/* Today's prices: live from the worker, or the last good copy. The live answer is taken unless it fails or is not
   in within LIVE_WAIT; then the copy the deploy shipped (data/market-last.json). A copy kept by the service worker
   or the worker when the live build failed (X-WI-Last) is the last good copy too. Either way every price keeps the
   time it was checked, and the file is marked paused, so the stamp says when the prices are from and never passes
   them off as live. */
const LIVE_WAIT = 4000;
async function livePrices(){
  let r = await (EARLY.now || window.WI_MARKET);
  if(r && typeof r.json !== 'function') return r;   // the drill-down page's own copy, already read
  if(!r) r = await fetch('data/market.json?part=live');   // the copy handed in never came: ask
  if(!r.ok) throw new Error('live prices ' + r.status);
  const m = await r.json();
  if(!m || !m.items) throw new Error('live prices empty');
  if(r.headers.get('X-WI-Last')) m.paused = true;
  return m;
}
async function lastPrices(){
  const m = await getJSON('data/market-last.json');
  if(!m || !m.items) throw new Error('no last prices');
  m.paused = true;
  return m;
}
const NOW = Promise.race([livePrices(), new Promise((_, no) => setTimeout(() => no(new Error('live prices slow')), LIVE_WAIT))])
  .catch(() => lastPrices()).then(m => (D.market = live(m)), () => null);
const MAN = getJSON('data/manifest.json', {cache: 'no-cache'}, EARLY.man);

/* ---------- the player's language (#121) ----------
   English is the page as it is: an English visit runs none of this and fetches nothing for it. A language picked
   in the footer is kept in this browser (wi.lang), and assets/lang.js comes in for it with the files the manifest
   names: our own words and every card's name first, before a card is drawn, then each kind's lines the first time
   a card of that kind is drawn whole. Only on the index's own page, not the drill-down page. */
const LANG_KEY = 'wi.lang';
const LANG = (() => { try { return localStorage.getItem(LANG_KEY) || ''; } catch { return ''; } })();
let TR = null;   // the language, once it is in
const LANGUP = !LANG || !document.getElementById('view-home') ? null : MAN.then(man => {
  const e = man.lang && man.lang[LANG];
  return e ? lazy('./ui/lang.js').then(m => m.start(LANG, e)).then(t => (TR = t)) : null;
}).catch(() => null);
const inLang = kinds => LANGUP ? LANGUP.then(t => t && t.need(kinds)) : null;
/* for the tabs that say what the index holds and how fresh it is (assets/data.js) */
export const manifest = () => MAN;
export const prices = () => NOW;
let go, seek, all;
const GO = new Promise(r => { go = r; });      // the meta, the bosses, the catalogue's words
const SEEK = new Promise(r => { seek = r; });  // the search worker
const ALL = new Promise(r => { all = r; });    // every card
export function wake(){ go(); seek(); return searching; }
// a first visit that opens on a search (#/?q=...): the meta and the search worker start now, not once the page is drawn
if(document.getElementById('view-home') && /^#\/\?(.*&)?q=[^&]/.test(location.hash)){ go(); seek(); }
export function need(){ go(); all(); return ready; }
const META = GO.then(() => MAN).then(m => getJSON(m.meta.file));
const BOSS = GO.then(() => getJSON('data/bosses.json', {priority: 'low'}).catch(() => null));
// the catalogue's words, when today's prices came without them (the drill-down page's copy has them already)
const FACTS = GO.then(() => NOW).then(m => m && m.part === 'live' && /^[0-9a-f]{12}$/.test(m.facts || '')
  ? getJSON('data/facts/' + m.facts + '.json').catch(() => getJSON('data/market.json?part=facts&v=' + m.facts)).then(f => facts(m, f))
  : null).catch(() => null);
// the league dates: the league clock and the charts' colours read the one copy (assets/league.js). They ride in
// today's prices (worker/prices.js); a price file without them (the drill-down page's ?part=now from before, the
// backup site) falls back to the copy that shipped with the site
let LEAGUES = null;
export const leagues = () => LEAGUES || (LEAGUES = NOW.then(m => m && m.leagues && Array.isArray(m.leagues.leagues) && m.leagues.leagues.length
  ? m.leagues : getJSON('data/leagues.json')).catch(() => null));
/* Each league's own colour, by name (data/leagues.json, tools/leagues.py): GGG's colour for that league,
   sampled from their art for it and already lifted to read on the chart's ground. A card's price chart
   draws a retired league in it (bigLine). A league without one keeps the faded ladder, and so does every
   league until this lands — it comes with the history, before a chart is drawn. */
const LEAGUE_COLOUR = new Map();
/* The history, the first time a chart or a popup needs it: the day-by-day prices, the exchange pairs and the past
   leagues' lines join today's prices, with the leagues' colours. Only when the worker split it off (the backup
   site's market file has no parts: it is all in NOW). D.past once it is in, or has failed: a popup never waits
   twice. */
let HIST = null;
export function hist(){
  return HIST || (HIST = Promise.all([
    NOW.then(m => m && m.part ? getJSON('data/market.json?part=hist', {priority: 'low'}) : null).then(p => past(D.market, p), () => {}),
    leagues().then(f => { for(const l of (f && f.leagues) || []) if(l.colour) LEAGUE_COLOUR.set(l.name, l.colour); }),
  ]).then(() => { D.past = true; }));
}
/* The page wakes the search as soon as a player reaches for it: a tap or a key in a search box, or the "/"
   that jumps to one. Not when the home page puts the cursor in its own box as it opens: that is before anyone has
   touched the page. */
const BOX = '#view-home #q, .tsearch input';
const touched = e => { const t = e.target; if(t && t.closest && t.closest(BOX)) wake(); };
addEventListener('pointerdown', touched, {capture: true, passive: true});
addEventListener('keydown', e => { if(e.key === '/') wake(); else touched(e); }, {capture: true, passive: true});
addEventListener('focusin', e => { const u = navigator.userActivation; if(!u || u.hasBeenActive) touched(e); }, true);

/* ---------- the short files, read back ----------
   Every file above that is written short is put back into the shape the rest of the page reads here, as it
   arrives, and nowhere else: nothing past this point knows it was short.
   unpack   a file of the cut: every word said once in its "dict", back on each row (assets/cut.js)
   live     today's prices: n where it is the name in the key, and each price's age and source from "a"
   facts    the catalogue's words (names, pictures, what it does) onto today's prices
   past     the history (hist): the days back from numbers to "Sep 5", and each note and each pair's currency
            back from its place in notes and pn. The old ?part=past is joined as it comes
   (worker/prices.js "the compact parts") */
function live(m){
  if(!m || m.part !== 'live' || !m.items) return m;
  const t0 = m.t0 ? Date.parse(m.t0) : null, cx = m.times ? m.times.currency : null;
  for(const [k, it] of Object.entries(m.items)){
    if(k.startsWith('c:') && it.n === undefined) it.n = k.slice(2);
    if(it.a === 0){ it.at = cx; it.src = 'cx'; }
    else if(typeof it.a === 'number' && t0 !== null){ it.at = new Date(t0 + it.a * 1000).toISOString(); it.src = 'trade'; }
    delete it.a;
  }
  return m;
}
function facts(m, f){
  if(!m || !m.items || !f || !f.items) return;
  for(const [k, x] of Object.entries(f.items)){
    const it = m.items[k] || (m.items[k] = {n: k.slice(2)});
    for(const [at, v] of Object.entries(x)) it[at] = at === 'ic' && f.icp && !String(v).includes('://') ? f.icp + v : v;
  }
}
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayLabel = n => { const d = new Date(n * 864e5); return MON[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
function past(m, p){
  if(!m || !m.items || !p || !p.items) return;
  const d0 = p.d0 ? Date.parse(p.d0 + 'T00:00:00Z') / 864e5 : null, notes = p.notes || [], names = p.pn || [];
  for(const [k, x] of Object.entries(p.items)){
    const it = m.items[k];
    if(!it) continue;
    if(p.part === 'hist'){
      if(Array.isArray(x.h) && typeof x.h[0] === 'number' && d0 !== null){
        const g = x.hg || [], out = [];
        let day = d0 + x.h[0], gi = 0;
        for(let i = 1; i < x.h.length; i++){
          if(gi < g.length && g[gi][0] === i - 1) day += g[gi++][1];   // days nothing was checked, left out
          out.push([dayLabel(day++), x.h[i]]);
        }
        x.h = out;
      }
      delete x.hg;
      if(x.lh && typeof x.lh.note === 'number') x.lh.note = notes[x.lh.note];
      if(Array.isArray(x.pairs)) x.pairs = x.pairs.map(([n, ...r]) => [typeof n === 'number' ? names[n] : n, ...r]);
    }
    Object.assign(it, x);
  }
}

function prep(it, k, IMGS, lxk){   // once per card: its kind, full image link, mechanics links and search words
  if(it._nl !== undefined) return it;
  it.k = k;
  if(it.id === undefined) it.id = it.n;   // the parts leave the id out where it is the name
  if(it.img){ const i = it.img.indexOf(':'), pre = IMGS[it.img.slice(0, i)]; if(pre) it.img = pre + it.img.slice(i + 1); }   // "<server key>:<path>"
  // "lx" marks every phrase in a line that names another card (tools/nodelinks.py). The page draws the ones
  // that lead to a card we wrote ourselves (KINDS words.mark 'ours'); the game's own words are worked out as
  // the card is drawn, and the rest of a line stays plain text.
  if(it.lx && lxk){
    const hx = it.lx.map(r => (r || []).filter(x => ours(lxk[x[2]])).map(x => [x[0], x[1], lxk[x[2]]]));
    if(hx.some(r => r.length)) it.hx = hx;
    // every card its lines name, once each: the related lists follow these both ways (assets/edges.js)
    const rx = new Set();
    for(const r of it.lx) for(const x of r || []) if(lxk[x[2]]) rx.add(lxk[x[2]]);
    if(rx.size) it.rx = [...rx];
  }
  it._nl = it.n.toLowerCase();
  /* Everything on the card a player can read, so a search reaches any line of any listing: the name and the
     sub line, what it does, its own lines and properties, its tags and options, the flavour line, a recipe's
     own rows, the other names the game knows a keyword by, and a source note. Never an internal id — the
     item class and the atlas place are slugs, and the card shows neither (docs, "No raw game code"). */
  it._hay = [it.n, it.s, it.t, it.q, it.asc, it.reg, it.qt, it.src, (it.ls || []).join(' '),
    (it.pr || []).join(' '), (it.tags || []).join(' '), (it.o || []).join(' '), (it.rec || []).join(' '),
    (it.f || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
  // the fields a kind works out from the entry itself: a base item is its own base and every line of it is an
  // implicit, a currency is not in the catalogue until the market says so. The kind declares them (KINDS make)
  const make = (KIND[k] || {}).make;
  if(make) for(const [at, how] of Object.entries(make)){
    const f = MAKE[how];
    const v = f ? f(it) : undefined;
    if(v !== undefined) it[at] = v;
  }
  if(TR) TR.mark(it);   // its name and sub line in the player's language, for a search on this page
  return it;
}
/* Every orb on an upgrade ladder, pointing at the ladder it is on (the meta's "up", tools/carddata.py).
   Built once, from the table, so no orb name is written down here. */
let RUNG = null;
function rungs(up){
  RUNG = new Map();
  for(const lad of up || []){
    RUNG.set(lad[0], lad);
    for(const [n] of lad.slice(1)) RUNG.set(n, lad);
  }
}
const rungOf = name => (RUNG && RUNG.get(name)) || null;

const MC = new Map();   // the market's own currency cards, made once
const MB = new Map();   // the boss cards, made once
const CN = new Map();   // today's currency rows by name, for an index card the market lists under its name
/* The cards the page makes itself, off today's prices and the bosses' own file: the market's currency and the
   bosses. They join the search as their own kinds, after every card of the index. A kind whose prices are listed
   under another kind says so once (KINDS px): an index card the market also lists by name (the meta's "named",
   tools/shards.py) is the card, and its price row joins it as it is read (joinMarket); a lineage support gem
   the market lists keeps the market's card for the Currency tab, lends it the gem card's words ("lt"), and the
   search shows the gem card. */
function runtime(){
  const out = [], meta = D.meta || {};
  const named = D.named || new Set(), lineage = D.lineage || new Set();
  const market = D.market;
  if(market && market.items){
    for(const [key, m] of Object.entries(market.items)){
      if(!key.startsWith('c:')) continue;
      CN.set(m.n, m);
      if(named.has('c:' + m.n)) continue;   // the index has its card, with the market's price
      let it = MC.get(key);
      if(!it){
        // the game writes some of these lines as a table rather than a sentence; the card carries one or
        // the other, never both, so the two fields that draw them never draw the same words twice
        const ps = slotList(m.u);
        it = {k:'c', id:key.slice(2), n:m.n, s:m.cat || 'Currency', t:ps ? '' : (m.u || ''),
              img:m.ic, dl:m.dl, did:m.did};
        if(ps){ it.ps = ps.at; it.pv = ps.is; }
        const lad = rungOf(m.n);
        if(lad) it.up = lad;   // the upgrade ladder this orb stands on, drawn by the ladder field
        const job = jobOf(m.u);
        if(job) it.job = job;  // what it does, where several things do the same thing (assets/kinds.js JOBS)
        if(lineage.has(m.n)) it.dup = true;   // kept for the Currency tab; the search shows the gem card
        it._nl = it.n.toLowerCase(); it._hay = (it.n + ' ' + it.s + ' ' + (m.u || '')).toLowerCase();
        MC.set(key, it);
      }
      // A priced card must still say what the thing does. The market file says so for most of them; for the
      // rest the official text is in the index — a lineage support gem's own card, or "ix" for a name no card
      // covers at all (tools/carddata.py), both in the meta.
      if(!it.t && !it.pv){
        it.t = (meta.lt || {})[m.n] || (meta.ix || {})[m.n] || '';
        if(it.t) it._hay += ' ' + it.t.toLowerCase();
      }
      out.push(it);
    }
  }
  // the bosses live in their own file; they join the search as their own kind, and the Bosses tab draws their card
  for(const b of (D.bosses && D.bosses.bosses) || []){
    let it = MB.get(b.name);
    if(!it){
      const where = (b.areas || []).map(a => a.name).join(' · ');
      it = {k: 'x', id: b.name, n: b.name, s: where};
      it._nl = it.n.toLowerCase();
      it._hay = (it.n + ' ' + where + ' boss' + (b.pinnacle ? ' pinnacle' : '')).toLowerCase();
      MB.set(b.name, it);
    }
    out.push(it);
  }
  D.rt = out;
  for(const it of out){
    const key = it.k + ':' + it.id;
    if(!D.byKey.has(key)){ D.byKey.set(key, it); D.index.items.push(it); }
  }
}
// what the worker is told of a card the page made: what it searches and groups by
const rtRow = it => ({k: it.k, id: it.id, n: it.n, s: it.s, job: it.job, dup: it.dup, _nl: it._nl, _hay: it._hay});
/* An index card the market lists under its name: the card is its own, with the market's price and picture. */
function joinMarket(it){
  const px = (KIND[it.k] || {}).px;
  if(!px || px.at !== undefined || !D.named || !D.named.has(px.as + ':' + it.n)) return;
  const m = CN.get(it.n);
  if(!m) return;
  it.nx = false;
  if(!it.img) it.img = m.ic;
}
/* A head (assets/cut.js HEAD) into the page: drawn as its name, sub line, art and price until its card is in. */
function hold(h){
  const key = h.k + ':' + (h.id !== undefined ? h.id : h.n);
  let it = D.byKey.get(key);
  if(it) return it;
  it = h;
  it._head = true;
  prep(it, h.k, D.index.imgs, (D.meta || {}).lxk);
  joinMarket(it);
  D.byKey.set(key, it);
  D.index.items.push(it);
  return it;
}
/* A whole card into the page. Its head, where the page holds one, becomes the card: the same object, so a
   list, a trail or a grid holding it holds the card. */
function settle(raw){
  const key = raw.k + ':' + (raw.id !== undefined ? raw.id : raw.n);
  let it = D.byKey.get(key);
  if(it && !it._head) return it;
  if(it){ for(const f of Object.keys(it)) delete it[f]; Object.assign(it, raw); }
  else { it = raw; D.byKey.set(key, it); D.index.items.push(it); }
  prep(it, raw.k, D.index.imgs, (D.meta || {}).lxk);
  joinMarket(it);
  return it;
}

/* ---------- the search worker ----------
   One question at a time is a message; each answer comes back under its own number. Where a browser will not
   start a module worker, the same code runs on the page (assets/searchworker.js handle), and answers the same. */
let WK = null, WN = 0;
const WAITS = new Map();
function worker(){
  if(WK) return WK;
  try {
    const w = new Worker(new URL('../searchworker.js', import.meta.url), {type: 'module'});
    w.onmessage = e => { const m = e.data, x = WAITS.get(m.id); if(!x) return; WAITS.delete(m.id); m.error ? x.bad(m.error) : x.ok(m); };
    w.onerror = () => { for(const x of WAITS.values()) x.bad('the search did not start'); WAITS.clear(); };
    WK = {ask: m => new Promise((ok, bad) => { const id = ++WN; WAITS.set(id, {ok, bad}); w.postMessage({...m, id}); })};
  } catch {
    const mod = lazy('./searchworker.js', 'The search');
    WK = {ask: m => mod.then(x => x.handle(m)).catch(err => { throw err && err.gone ? 'gone' : err; })};
  }
  return WK;
}
function ask(op, m = {}){
  return worker().ask({op, ...m}).catch(err => { if(err === 'gone') moved(); throw new Error(String(err)); });
}
/* A file of the cut that is not there any more: the site has moved to a newer index under this page, and its
   files are new names. The page is a deploy behind, opened from the service worker's copy of that deploy while
   the new one downloads (sw.js). The deploy keeps the files the one before it named (tools/build.mjs, "the
   previous generation"), so this is a page two or more data deploys behind.
   The manifest is asked for past the copy and past the browser's own cache (a query and no-store): the copy
   holds this page's own manifest, and asked through it the site never looks moved (the fault of 28 Sep: the
   stuck line, no reload). Before the reload the copies of older deploys drop their pages (fresh), or the
   reload is the same page from the same copy.
   One reload per newer index: wi.moved holds the index ids this tab has reloaded into, so a reload that lands
   on the same index again stops there, and a later deploy in the same session still gets its own. */
const MOVED_KEY = 'wi.moved';
let MOVED = false;
function moved(){
  if(MOVED) return;
  MOVED = true;
  Promise.all([MAN.catch(() => null), fetch('data/manifest.json?at=' + Date.now(), {cache: 'no-store'}).then(r => r.ok ? r.json() : null)])
    .then(async ([mine, now]) => {
      if(!now || !now.id || !mine || now.id === mine.id || !reloadInto(now.id)) return stuck('The index');
      await fresh();
      location.reload();
    }).catch(() => stuck('The index'));
}
// take the reload into this index, if this tab has not already taken it (a browser that will not keep it says no)
function reloadInto(id){
  try {
    const done = JSON.parse(sessionStorage.getItem(MOVED_KEY) || '[]');
    if(!Array.isArray(done) || done.includes(id) || done.length >= 4) return false;
    sessionStorage.setItem(MOVED_KEY, JSON.stringify([...done, id]));
    return true;
  } catch { return false; }
}
/* The pages out of every older deploy's copy (sw.js keeps each deploy's copy under wi-v-<stamp>, with that
   deploy's sw-files.json): a copy whose sw-files.json is not the site's own now is an older deploy. Without the
   site's list, every copy drops its pages; the worker then opens them from the network until its next deploy. */
async function fresh(){
  try {
    if(!self.caches) return;
    const now = await fetch('sw-files.json?at=' + Date.now(), {cache: 'no-store'}).then(r => r.ok ? r.text() : '', () => '');
    for(const k of await caches.keys()){
      if(!k.startsWith('wi-v-')) continue;
      const c = await caches.open(k), list = await c.match('sw-files.json');
      if(now && list && await list.text() === now) continue;
      await Promise.all(['./', 'explore', 'privacy'].map(u => c.delete(new URL(u, document.baseURI).href)));
    }
  } catch {}
}

export const first = (async () => {
  const [man, meta] = await Promise.all([MAN, META, NOW, FACTS, LANGUP]);
  D.man = man; D.meta = meta;
  rungs(meta.up);   // the orb ladders, before any currency card is made
  D.named = new Set(meta.named || []);
  D.lineage = new Set(meta.li || []);   // lineage support gems: the market lists them too (the gem card shows that price)
  D.index = {v: man.v, gen: man.gen, sprites: meta.sprites, imgs: meta.imgs || {}, up: meta.up || [], kwx: meta.kwx || {},
    ws: meta.ws || '', items: []};
  runtime();
  return D;
})();
/* The search: the worker has every kind's rows, the bosses have joined, and the cards whose words mark other
   cards' lines are held (keywords, mechanics, interactions, and the keystones a keyword stands for). */
// the search rows start downloading in the worker the moment the manifest is in, not after the prices and the meta
SEEK.then(() => MAN).then(man => ask(OP.fetch, {man, base: new URL('.', document.baseURI).href})).catch(() => {});
export const searching = SEEK.then(() => first).then(async () => {
  await ask(OP.init, {man: D.man, base: new URL('.', document.baseURI).href, lang: TR ? TR.names : '',
    market: Object.keys((D.market && D.market.items) || {}), runtime: D.rt.map(rtRow), seen: seenKeys()});
  const w = await ask(OP.words, {names: Object.values(D.index.kwx || {})});
  for(const h of w.heads) hold(h);
  D.bosses = await BOSS;
  runtime();
  await ask(OP.runtime, {runtime: D.rt.map(rtRow)});
  D.index = {...D.index};   // a new index: what was worked out from the old one (the marks) is worked out again
  D.search = true;
  return D;
});
searching.catch(() => { D.failed = true; });
first.catch(err => { if(err && err.gone) moved(); });   // the card meta the manifest names is not there
/* The whole index, for a tab that works over all of it: every card file, read on the page, put in the index's
   own order, then the market's currency and the bosses. */
export const ready = ALL.then(() => first).then(async () => {
  const man = D.man, byKind = {};
  await Promise.all(Object.entries(man.kinds).map(async ([k, K]) => {
    const parts = await Promise.all(K.cards.map(c => getJSON(c.file).then(unpack)));
    byKind[k] = parts.flatMap(p => p.rows.map(r => { r.k = k; return r; }));
  }));
  D.bosses = await BOSS;
  runtime();
  await inLang(Object.keys(man.kinds));
  const items = inOrder(man.order, byKind).map(settle);
  for(const it of D.rt) items.push(it);
  D.index = {...D.index, items};
  D.full = true;
  return D;
});
ready.catch(err => { D.failed = true; if(err && err.gone) moved(); });
ready.then(() => PR.vocabLater(), () => {});   // the page's own search words, once the whole index is in

/* The heads of these keys, where there is a card for them: enough to draw a row, a pin or a result. */
export async function have(keys){
  const want = keys.filter(k => !D.byKey.has(k));
  if(want.length && !D.full){
    await wake();
    for(const h of (await ask(OP.heads, {keys: want})).heads) hold(h);
  }
  return keys.map(k => D.byKey.get(k)).filter(Boolean);
}
/* These cards whole, where there is a card for them: enough to draw it in the grid or open it. */
export async function whole(keys){
  const want = keys.filter(k => { const it = D.byKey.get(k); return !it || it._head; });
  if(want.length && !D.full){
    await wake();
    const got = (await ask(OP.bodies, {keys: want})).bodies;
    // in the player's language a card is whole only once its kind's lines are in too: a card the page holds whole
    // is drawn at once, by any path, so it must never be whole a moment before its words are
    await inLang(got.map(b => b.k));
    for(const b of got) settle(b);
  }
  const out = keys.map(k => D.byKey.get(k)).filter(it => it && !it._head);
  await inLang(out.map(it => it.k));
  return out;
}
/* Every card of one kind by one name, whole (the drill-down page's rows: the tree carries one name in several
   strengths). */
export async function named(k, n){
  if(D.full) return D.index.items.filter(it => it.k === k && it.n === n);
  await wake();
  return whole((await ask(OP.find, {k, n})).keys);
}

/* ---------- market lookups ---------- */
/* A card's own row first, then the row its kind says its price may be listed under (KINDS px: the Atlas's
   tablets and the lineage support gems are priced as currency). */
export function priceOf(it){
  const M = D.market && D.market.items;
  if(!M) return null;
  const px = (KIND[it.k] || {}).px;
  return M[it.k + ':' + it.id] || M[it.k + ':' + it.n] ||
    (px && holds(it, px) ? M[px.as + ':' + it.n] : null) || null;
}
export function usageOf(it){
  const U = D.usage && D.usage[NAMES[it.k]];
  return U ? (U[it.n] ?? null) : null;
}

/* ---------- search ----------
   What answers the words, best first: how many of each kind, the keys from..take of the kind asked for, and the
   first n of those held on the page as heads. The search worker answers while the page holds only what it shows,
   and it hands over only what the page draws; a page holding the whole index answers itself, by the same rules. */
export async function find(q, {kind = 'all', n = 0, take, from = 0, seen = seenKeys()} = {}){
  if(D.full){   // the page answers itself: the last answer kept, as the worker keeps it
    const trail = seen.join(' ');
    const list = !q.trim() && kind !== 'all' ? kind : '';   // no words, a kind picked: its own list (a list page)
    if(!LAST || LAST.q !== q || LAST.list !== list || LAST.seen !== trail || LAST.v !== D.index){
      const was = TRAIL_NOW;
      TRAIL_NOW = seen;
      const all = (list ? PR.list(list) : PR.search(q, 'all')).map(it => it.k + ':' + it.id), counts = {all: all.length};
      TRAIL_NOW = was;
      for(const key of all){ const k = key.slice(0, key.indexOf(':')); counts[k] = (counts[k] || 0) + 1; }
      LAST = {q, list, seen: trail, v: D.index, all, counts};
    }
    const keys = kind === 'all' ? LAST.all : LAST.all.filter(key => key.startsWith(kind + ':'));
    return {keys: keys.slice(from, take === undefined ? keys.length : take), total: keys.length, counts: LAST.counts};
  }
  await wake();
  const r = await ask(OP.search, {q, kind, seen, n, take, from});
  for(const h of r.heads) hold(h);
  return r;
}
let LAST = null, TRAIL_NOW = null;   // TRAIL_NOW: the trail a page-side search is asked against

export { getJSON, NOW, MAN, LANG_KEY, LANG, TR, LEAGUE_COLOUR, MON, ask, TRAIL_NOW };

/* The search's rules (assets/rank.js), over the cards the page holds. A page holding the whole index (a tab that
   works over all of it) answers its own searches with them, and the Currency tab's box and the map's find match
   their words against the cards. The worker holds the same rules over every kind's search rows. */
const PR = ranker({items: () => (D.index && D.index.items) || [], get: key => D.byKey.get(key), groupsOf: it => edges.groupsOf(it),
  priced: it => !!priceOf(it), usage: usageOf, seen: () => TRAIL_NOW || seenKeys(), version: () => D.index, idle: f => idle(f)});
export const words = qs => PR.words(qs);

/* A search in the address of the search page (#/?q=… or a kind's list, #/?k=…): the search starts the moment this file
   has run, before the rest of the shell, so the worker leaves as soon as the manifest is in. The router asks again
   when it draws the page; a second wake() changes nothing. */
{
  const h = location.hash, p = new URLSearchParams(h.includes('?') ? h.slice(h.indexOf('?') + 1) : '');
  if(IS_APP && !/^#\/\w/.test(h) && (p.get('q') || (p.get('k') || 'all') !== 'all')) wake();
}
