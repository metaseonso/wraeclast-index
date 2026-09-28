/* What else belongs with this card, worked out from the index itself.

   Every list here is an edge the data already holds, followed both ways: a unique names its base and a base
   names its uniques; a base grants a skill and that skill's gem names the items that grant it; a line that
   names another card gives "Named on this card" one way and "Named by" the other. A keyword's own nine lists
   come from data/kwuse.json (tools/kwuse.py), loaded the first time one is needed.

   Four of them read a file of their own, fetched only when a card asks for one: data/kwuse.json for a
   keyword's nine lists, data/grants.json for which item grants which skill, both ways round,
   data/clusters.json for the tree cut into clusters, and data/dropsfrom.json for where a unique drops, both
   ways round (tools/kwuse.py, tools/grants.py, tools/clusters.py, tools/bosses.py).
   `categories` says which of those it still needs.

   Which lists a kind shows is declared in assets/kinds.js (REL), not here. This file only answers, per list:
   how many there are altogether, and the first n of them — so a card with 1,448 of something draws eight rows
   and says so, and only loads the rest if the player asks (assets/app.js paints them).

   A row is a seed, not markup: {key} for anything with a card of its own, or {n, sub, ...} for a row there is
   no card for (a small passive, a crafting mod). app.js draws both. */
import {REL} from './kinds.js';
import * as graph from './graph.js';

let X = null;   // what app.js lends us: the index, its own lookups, and has(key): whether a card of that key exists
export function setup(ctx){ X = ctx; }
const has = key => X.has(key);

const DOT = ' · ';
/* The lists a card's groups give it (assets/graph.js). A page that holds only the cards it shows is handed them
   by the search worker, which holds every card's search row ("_g" on the card, app.js); a page holding the whole
   index works them out itself, once per load, over every card. */
let IX = null;
function local(){
  const D = X.D;
  if(IX && IX.v === D.index && IX.full === D.full) return IX;
  IX = {v: D.index, full: D.full, ix: graph.turn(D.index.items, has)};
  return IX;
}
let collecting = false;   // keysOf below: every key is taken as there, so nothing worked out now may be kept
const NONE = {base: [], variants: [], uniques: [], klass: [], klassof: [], inclass: [], section: [], cat: [], job: [], named: [], namedby: []};
const lists = it => it._g || (collecting ? NONE : it._gl && it._glv === X.D.index ? it._gl
  : (it._glv = X.D.index, it._gl = graph.lists(local().ix, it, has)));
/* Which groups a card sits in, and how many cards each holds: what the search weighs the cards you opened by
   (assets/rank.js). Kept on the card: a list of matches is walked on every keystroke, and this must be a lookup. */
export function groupsOf(it){
  if(it._gx && it._gxv === X.D.index) return it._gx;
  it._gxv = X.D.index;
  return it._gx = graph.groupsOf(local().ix, it, has);
}
/* a key with no card behind it draws nothing, so it is never a row (the tree carries small passives the
   index has no card for, and kwuse names them by id) */
const cardRows = keys => keys.filter(has).map(key => ({key}));

/* ---------- the clusters (data/clusters.json) ----------
   One file, read both ways: the nodes a cluster holds, and the clusters a node sits in. The file is places,
   not names — `at` the notable's place on the tree, `in` the rest of the cluster's, `node` the passive card
   each place has and `sh` every place that is in more than one cluster (tools/clusters.py). This turns it
   round once, the first time a card asks, so a cluster with 23 nodes is a lookup and never a search. */
let CL = null;
function clusters(C){
  if(CL && CL.v === C) return CL;
  const of = new Map();                  // a passive card -> the clusters it sits in
  const rows = C.id.map((id, j) => {
    const seen = new Map();              // one row per card, however many of the cluster's nodes it is
    for(const at of [C.at[j], ...C.in[j]]){
      const card = C.node[at] >= 0 ? 'p:' + C.cards[C.node[at]] : '';
      if(!card) continue;                // a plate or a jewel socket: a point inside, never a row
      const had = seen.get(card);
      if(had) had.x++;
      else seen.set(card, {key: card, x: 1});
      const mine = of.get(card);
      if(mine){ if(mine[mine.length - 1] !== j) mine.push(j); } else of.set(card, [j]);
    }
    return [...seen.values()].map(r => r.x > 1 ? r : {key: r.key});
  });
  CL = {v: C, rows, of};
  return CL;
}
const clusterAt = C => (C._at || (C._at = new Map(C.id.map((id, j) => [id, j]))));

/* ---------- one edge each ---------- */
const EDGE = {
  base(it){ return cardRows(lists(it).base); },
  variants(it){ return cardRows(lists(it).variants); },
  uniques(it){ return cardRows(lists(it).uniques); },
  klass(it){ return cardRows(lists(it).klass); },
  klassof(it){ return cardRows(lists(it).klassof); },
  // an item class is its own class (KINDS make), so the whole class reads the same map from the other end
  inclass(it){ return cardRows(lists(it).inclass); },
  section(it){ return cardRows(lists(it).section); },
  cat(it){ return cardRows(lists(it).cat); },
  /* Things whose own line says they do the same job, cheapest first — which is the whole question a player
     choosing between them is asking. One the market has no price for today sorts last, never as free. */
  job(it){
    const rows = lists(it).job;
    const M = (X.D.market && X.D.market.items) || {};
    const px = key => { const r = M[key]; return r && r.v !== undefined && r.v !== null ? r.v : Infinity; };
    return cardRows(rows.slice().sort((a, b) => px(a) - px(b)));
  },
  // which item grants which skill, both ways round, as tools/grants.py worked it out
  grants(it, F){ return cardRows((((F.grants || {}).by || {})[it.k + ':' + it.id] || []).map(x => x[0])); },
  granted(it, F){ return cardRows((((F.grants || {}).of || {})[it.k + ':' + it.id] || []).map(x => x[0])); },
  // the nodes a cluster holds, its own notable first, and the clusters one node sits in
  incluster(it, F){
    const C = F.clusters, j = C ? clusterAt(C).get(it.id) : undefined;
    return j === undefined ? [] : clusters(C).rows[j].filter(r => has(r.key));
  },
  clusterof(it, F){
    const C = F.clusters;
    if(!C) return [];
    return cardRows((clusters(C).of.get(it.k + ':' + it.id) || []).map(j => 't:' + C.id[j]));
  },
  /* where a unique drops, and what a boss drops (data/dropsfrom.json, tools/bosses.py): each row says which
     sources named it, so two sources that disagree show it on the row itself */
  dropsfrom(it, F){
    const e = ((F.dropsfrom || {}).uniques || {})[it.n];
    return ((e && e.from) || []).map(f => has('x:' + f.n)
      ? {key: 'x:' + f.n, sub: f.src.join(', ')} : {n: f.n, sub: f.src.join(', ')});
  },
  /* a unique on several bases is a card per base; a drop names the unique, so its row opens the card the
     table names for it (`card`, the first of them in the index's order) */
  drops(it, F){
    const U = (F.dropsfrom || {}).uniques || {}, out = [];
    for(const e of Object.values(U)){
      const f = (e.from || []).find(x => x.n === it.n);
      if(f && e.card && has(e.card)) out.push({key: e.card, sub: f.src.join(', ')});
    }
    return out;
  },
  named(it){ return cardRows(lists(it).named); },
  namedby(it){ return cardRows(lists(it).namedby); },
};

/* ---------- a keyword's own nine lists (data/kwuse.json) ----------
   Each one is the same shape as any other edge: card rows where there is a card, plain rows where there is
   not. `x` is how many of it are on the passive tree; `kinds` the item kinds a mod or essence applies to.

   A group whose rows are plain card ids of one kind says so in REL (`rows: 'cards'`) and needs nothing here.
   The rest read a shape of their own out of data/kwuse.json (tools/kwuse.py), one entry each, keyed by the
   group. Nothing below is a kind's rule: it is that file's own shape. */
const KWROWS = {
  w(U, list){ return list.map(k => {
    const c = X.keywordCard(k);
    return c ? {key: c.k + ':' + c.id} : (U.kn && U.kn[k] ? {n: U.kn[k], sub: 'Keyword'} : null);
  }).filter(Boolean); },
  p(U, list){ return list.map(x => {
    if(typeof x !== 'number'){
      const [id, n] = Array.isArray(x) ? x : [x, 1];
      return has('p:' + id) ? {key: 'p:' + id, x: n} : null;
    }
    const [n, t, k, where] = U.sp[x] || [];
    return n ? {n, sub: t + (where ? DOT + where : ''), x: k, ic: true, hay: 'small passive'} : null;
  }).filter(Boolean); },
  e(U, list){ return list.map(i => {
    const [n, line, kinds] = (U.es || [])[i] || [];
    if(!n) return null;
    const names = (kinds || []).map(k => U.ck[k] || k);
    return has('c:' + n) ? {key: 'c:' + n, sub: line, kinds: names}
      : {n, sub: line, kinds: names, ic: true};
  }).filter(Boolean); },
  a(U, list){ return list.map(([i, line]) => {
    const [s, n, what, key] = (U.at || [])[i] || [];
    if(!n) return null;
    if(key && has(key)) return {key, sub: what + DOT + line};
    return {n, sub: what + DOT + line, go: './#/atlas?s=' + s + '&q=' + encodeURIComponent(n)};
  }).filter(Boolean); },
  m(U, list){ return list.map(i => {
    const [line, what, kinds] = (U.cr || [])[i] || [];
    if(!line) return null;
    return {n: line, sub: what, kinds: (kinds || []).map(c => U.ck[c] || c), craft: kinds || []};
  }).filter(Boolean); },
  c(U, list){ return list.map(i => {
    const [n, cat, t] = (U.cu || [])[i] || [];
    if(!n) return null;
    const sub = cat + DOT + t;
    return has('c:' + n) ? {key: 'c:' + n, sub} : {n, sub, ic: true};
  }).filter(Boolean); },
};
function kwRows(U, e, r){
  const list = e[r.g] || [];
  if(r.rows === 'cards') return cardRows(list.map(id => r.of + ':' + id));
  return (KWROWS[r.g] || (() => []))(U, list);
}

/* ---------- the categories of one card ----------
   Each: {id, label, total, rows, filter, note}. `rows` is every row of that category, built once and sliced
   by the card; a category with nothing in it is left out, so a card shows only what it really has. */
export function categories(it, F = {}){
  const d = X.kindOf(it.k);
  if(!d || !d.rel) return {list: [], need: []};
  const kwId = X.keywordIdOf(it);
  const list = [], need = new Set();
  for(const id of d.rel){
    const r = REL[id];
    if(!r) continue;
    let rows;
    if(r.edge === 'kwuse'){
      if(!kwId) continue;                          // not a keyword: it has no list of its own
      if(!F.kwuse){ need.add('kwuse'); continue; }
      rows = kwRows(F.kwuse, F.kwuse.k[kwId] || {}, r);
    } else {
      if(r.needs && !F[r.needs]){ need.add(r.needs); continue; }
      rows = (EDGE[r.edge] || (() => []))(it, F);
    }
    if(!rows.length) continue;
    const onTree = rows.reduce((a, x) => a + (x.x || 1), 0);
    list.push({id, label: r.label, of: r.of, filter: r.filter, rows, total: rows.length,
      note: onTree !== rows.length ? onTree.toLocaleString() + ' on the tree, ' + rows.length + ' different' : ''});
  }
  return {list, need: [...need]};
}

/* Every key a card's lists would name, whether or not a card answers to it: what a page that holds only the
   cards it shows asks the search worker about before it draws the lists (app.js relSection). */
export function keysOf(it, F = {}){
  const seen = new Set(), was = X.has;
  X.has = key => { seen.add(key); return true; };
  collecting = true;
  try { categories(it, F); } finally { X.has = was; collecting = false; }
  return [...seen];
}
