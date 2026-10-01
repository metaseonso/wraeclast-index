/* The search, off the page's thread. A module worker (assets/app.js starts it the first time a player reaches
   for search), or, where a browser will not start one, the same code on the page (app.js imports handle()).

   It holds every kind's search rows (data/search/<k>.<hash>.json, tools/shards.py): each card's name, sub line,
   art, the fields the ranking reads, and every other word the card carries. The page holds only the cards it
   shows. What it answers, each a message {id, op, ...} and a reply {id, ...}:
     fetch    the manifest and where the site is: every kind's search rows asked for at once, for init to take
     init     the manifest, where the site is, today's priced keys, the cards the page makes itself (the market's
              currency, the bosses), the trail and the player's language where one is on; replies once every kind's
              rows are in, and the names in that language (m.lang: data/lang/<code>/names.<h>.json)
     runtime  the cards the page makes itself, again (the bosses land after the market)
     market   today's priced keys, again
     search   {q, kind, seen, n, from, take}: the matches, best first, by the rules in assets/rank.js: how many
              of each kind, and of the kind asked for (every kind: 'all') the keys from..take and the first n of
              them as heads (assets/cut.js HEAD). The answer to the last words is kept, so a kind chip or the
              next page of the list is a slice of it and never a second search
     heads    {keys}: the head of each key there is a card for
     bodies   {keys}: each card whole, read out of its card file (data/cards/<k>/<nn>.<hash>.json), a few files
              kept at a time
     rel      {key}: the lists a card's groups give it (assets/graph.js), as keys
     find     {k, n}: the keys of every card of one kind by one name
     words    {names}: the heads of every card whose words mark other cards' lines (KINDS words), and of the
              cards the named keywords stand for (KW.named)
   A card file that is not there any more (the site moved to a newer index under this page) answers
   {error: 'gone'}, and the page says so. */
import {KIND, MAKE, MAPS, KW, holds} from './kinds.js';
import {ranker} from './rank.js';
import * as graph from './graph.js';
import {unpack, inOrder, HEAD} from './cut.js';

const S = {man: null, base: '', index: [], runtime: [], items: [], byKey: new Map(), market: new Set(), seen: [], v: 0, ready: null};
const has = key => S.byKey.has(key);
let IX = null, IXV = -1;
const ix = () => (IXV === S.v ? IX : (IXV = S.v, IX = graph.turn(S.items, has)));
function groupsOf(it){
  if(it._gxv === S.v) return it._gx;
  it._gxv = S.v;
  return it._gx = graph.groupsOf(ix(), it, has);
}
/* the same test the page's priceOf makes, on the keys today's prices hold: the card's own row, then the row its
   kind says its price may be listed under (KINDS px) */
function priced(it){
  const M = S.market, px = (KIND[it.k] || {}).px;
  return M.has(it.k + ':' + it.id) || M.has(it.k + ':' + it.n) || !!(px && holds(it, px) && M.has(px.as + ':' + it.n));
}
const R = ranker({items: () => S.items, get: key => S.byKey.get(key), groupsOf, priced, usage: () => null,
  seen: () => S.seen, version: () => S.v, idle: f => setTimeout(f, 0)});

// the fields a group is keyed by that a kind works out from its own row (KINDS make, assets/kinds.js)
const MAPPED = new Set(Object.values(MAPS).map(g => g.at));
function take(k, row){
  row.k = k;
  if(row.id === undefined) row.id = row.n;
  row._nl = row.n.toLowerCase();
  // every word on the card: its name and sub line, then the rest of its words, each once (tools/shards.py)
  row._hay = (row.n + ' ' + (row.s || '') + ' ' + (row.h || '')).toLowerCase();
  const make = (KIND[k] || {}).make;
  if(make) for(const [at, how] of Object.entries(make)){
    if(!MAPPED.has(at) || !MAKE[how]) continue;
    const v = MAKE[how](row);
    if(v !== undefined) row[at] = v;
  }
  return row;
}
const url = f => new URL(f, S.base).href;
async function getJSON(f){
  const r = await fetch(url(f));
  // not there any more (the not-found page, with its 404, or any page where the file was asked for): 'gone'
  if(r.status === 404 || r.status === 410 || /text\/html/i.test(r.headers.get('Content-Type') || ''))
    throw Object.assign(new Error(f + ' ' + r.status), {gone: true});
  if(!r.ok) throw new Error(f + ' ' + r.status);
  return r.json();
}
function rebuild(){
  S.items = S.index.concat(S.runtime);
  S.byKey = new Map();
  for(const it of S.items) S.byKey.set(it.k + ':' + it.id, it);
  S.v++;
  R.vocabLater();
}
/* The search rows asked for as soon as the manifest is in (fetch), while the page still waits for its prices and
   the card meta; init takes them from here. A file that failed is asked for again by init. */
const EARLY = new Map();
function fetchRows(m){
  if(!S.base) S.base = m.base;
  for(const K of Object.values(m.man.kinds)){
    const f = K.search.file;
    if(!EARLY.has(f)) EARLY.set(f, getJSON(f).catch(() => { EARLY.delete(f); return null; }));
  }
  return {};
}
const rowsOf = async f => (EARLY.has(f) && await EARLY.get(f)) || getJSON(f);
async function init(m){
  S.man = m.man; S.base = m.base; S.market = new Set(m.market || []); S.seen = m.seen || [];
  S.runtime = m.runtime || [];
  const byKind = {};
  await Promise.all(Object.entries(S.man.kinds).map(async ([k, K]) => {
    const part = unpack(await rowsOf(K.search.file));
    const rows = part.rows.map(r => take(k, r));
    // where each card's whole card is: its file, and its place in that file
    let c = 0, left = K.cards.length ? K.cards[0].n : 0, i = 0;
    for(const r of rows){
      while(left === 0 && c < K.cards.length - 1){ c++; left = K.cards[c].n; i = 0; }
      r._c = c; r._i = i++; left--;
    }
    byKind[k] = rows;
  }));
  S.index = inOrder(S.man.order, byKind);
  // the player's language (#121): every card's name and sub line in it, so a search in it and a search in English
  // both find the card. Asked for only when a language is on (the manifest names its file)
  if(m.lang){
    const t = (await getJSON(m.lang).catch(() => ({}))).t || {};
    for(const r of S.index){
      const n = t[r.n];
      if(n){ r._nl2 = n.toLowerCase(); r._tw = (n + ' ' + (t[r.s] || '')).toLowerCase(); }
    }
  }
  rebuild();
  return {n: S.items.length};
}
const headOf = it => { const h = {k: it.k}; for(const f of HEAD) if(it[f] !== undefined) h[f] = it[f]; return h; };
const heads = keys => keys.map(k => S.byKey.get(k)).filter(it => it && it._c !== undefined).map(headOf);

/* the card files, a few kept at a time: a search draws cards from all over the index, and each file is a read of
   a couple of hundred KB */
const KEEP = 12;
const FILES = new Map();
function cardFile(f){
  let p = FILES.get(f);
  if(p){ FILES.delete(f); FILES.set(f, p); return p; }
  p = getJSON(f).then(unpack);
  p.catch(() => FILES.delete(f));
  FILES.set(f, p);
  while(FILES.size > KEEP) FILES.delete(FILES.keys().next().value);
  return p;
}
async function bodies(keys){
  const want = new Map();   // file -> [places]
  for(const key of keys){
    const it = S.byKey.get(key);
    if(!it || it._c === undefined) continue;
    const f = S.man.kinds[it.k].cards[it._c].file;
    if(!want.has(f)) want.set(f, []);
    want.get(f).push(it);
  }
  const out = [];
  await Promise.all([...want].map(async ([f, list]) => {
    const part = await cardFile(f);
    for(const it of list){
      const row = part.rows[it._i];
      if(row) out.push({...row, k: it.k});
    }
  }));
  return out;
}

/* An answer as the page takes it: the page never holds a list of every match, only the part it draws. */
function answer(m, S){
  const list = !m.q.trim() && m.kind && m.kind !== 'all' ? m.kind : '';   // no words, a kind picked: its own list
  const sig = m.q + '\u0001' + list + '\u0001' + S.seen.join(' ') + '\u0001' + S.v;
  if(!S.last || S.last.sig !== sig){
    const all = (list ? R.list(list) : R.search(m.q, 'all')).map(it => it.k + ':' + it.id), counts = {all: all.length};
    for(const key of all){ const k = key.slice(0, key.indexOf(':')); counts[k] = (counts[k] || 0) + 1; }
    S.last = {sig, all, counts, by: {}};
  }
  const L = S.last, kind = m.kind || 'all';
  const keys = kind === 'all' ? L.all : L.by[kind] || (L.by[kind] = L.all.filter(key => key.startsWith(kind + ':')));
  const from = m.from || 0, take = m.take === undefined ? keys.length : m.take;
  return {keys: keys.slice(from, take), total: keys.length, counts: L.counts, heads: heads(keys.slice(0, m.n || 0))};
}
const OPS = {
  init,
  fetch: fetchRows,
  async runtime(m){ S.runtime = m.runtime || []; rebuild(); return {}; },
  async market(m){ S.market = new Set(m.market || []); S.v++; return {}; },
  async search(m){
    if(m.seen) S.seen = m.seen;
    return answer(m, S);
  },
  async heads(m){ return {heads: heads(m.keys || [])}; },
  async bodies(m){ return {bodies: await bodies(m.keys || [])}; },
  async rel(m){
    const it = S.byKey.get(m.key);
    return {lists: it ? graph.lists(ix(), it, has) : null};
  },
  async find(m){ return {keys: S.items.filter(it => it.k === m.k && it.n === m.n).map(it => it.k + ':' + it.id)}; },
  async words(m){
    const names = new Set(m.names || []);
    const list = S.index.filter(it => (KIND[it.k] || {}).words || (KW.named.includes(it.k) && names.has(it.n)));
    return {heads: list.map(headOf)};
  },
};
export async function handle(m){
  if(m.op === 'fetch') return OPS.fetch(m);
  if(m.op !== 'init' && m.op !== 'runtime' && m.op !== 'market') await S.ready;
  if(m.op === 'init') return S.ready = OPS.init(m);
  if(m.op === 'runtime' || m.op === 'market') await S.ready;
  const f = OPS[m.op];
  if(!f) throw new Error('no such question: ' + m.op);
  return f(m);
}

// as a worker: every message answered with its own id, a fault as {error}
if(typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope){
  self.onmessage = e => {
    const m = e.data;
    handle(m).then(r => self.postMessage({id: m.id, ...r}),
      err => self.postMessage({id: m.id, error: err && err.gone ? 'gone' : String(err && err.message || err)}));
  };
}
