/* What else belongs with this card, worked out from the index itself.

   Every list here is an edge the data already holds, followed both ways: a unique names its base and a base
   names its uniques; a base grants a skill and that skill's gem names the items that grant it; a line that
   names another card gives "Named on this card" one way and "Named by" the other. A keyword's own nine lists
   come from data/kwuse.json (tools/kwuse.py), loaded the first time one is needed.

   Three of them read a file of their own, fetched only when a card asks for one: data/kwuse.json for a
   keyword's nine lists, data/grants.json for which item grants which skill, both ways round, and
   data/clusters.json for the tree cut into clusters (tools/kwuse.py, tools/grants.py, tools/clusters.py).
   `categories` says which of those it still needs.

   Which lists a kind shows is declared in assets/kinds.js (REL), not here. This file only answers, per list:
   how many there are altogether, and the first n of them — so a card with 1,448 of something draws eight rows
   and says so, and only loads the rest if the player asks (assets/app.js paints them).

   A row is a seed, not markup: {key} for anything with a card of its own, or {n, sub, ...} for a row there is
   no card for (a small passive, a crafting mod). app.js draws both. */
import {REL, MAPS} from './kinds.js';

let X = null;   // what app.js lends us: the index and its own lookups
export function setup(ctx){ X = ctx; }

const DOT = ' · ';
/* The index turned round, once per load: one pass over every card, building the maps MAPS declares and no
   others. A card goes into a group when it carries the field that group is keyed by; a group named after a
   kind is only a group where a card of that kind answers to the name (a unique whose base item the files do
   not name carries its item class there instead, and an item class is not a base item); and a card is never
   put into its own group, because nothing on the site is its own connection. */
let IX = null;
function turn(){
  const D = X.D;
  if(IX && IX.v === D.index && IX.full === D.full) return IX;
  const maps = {};
  for(const m of Object.keys(MAPS)) maps[m] = new Map();
  const namedby = new Map();
  for(const it of D.index.items){
    if(it.dup) continue;
    const key = it.k + ':' + it.id;
    for(const [m, g] of Object.entries(MAPS)){
      const v = it[g.at];
      if(v === undefined || v === null || v === '') continue;
      if(g.of){
        const target = g.of + ':' + v;
        if(target === key || !D.byKey.get(target)) continue;
      }
      push(maps[m], g.per === 'kind' ? it.k + '/' + v : v, key);
    }
    for(const target of it.rx || []) push(namedby, target, key);   // a line of this card names that one
  }
  IX = {v: D.index, full: D.full, ...maps, namedby};
  return IX;
}
function push(map, k, v){ const a = map.get(k); if(a) a.push(v); else map.set(k, [v]); }
const others = (list, key) => (list || []).filter(x => x !== key);
/* the one card this card's own field names, as that field's map declares it: the field it reads ("at") and the
   kind that answers to the name ("of"). A card is never a row of its own, and a name no card answers to is no
   row at all, so one line covers a unique's base item and a base item's class alike. */
const to = (it, m) => {
  const g = MAPS[m], v = it[g.at], t = v ? g.of + ':' + v : '';
  return t && t !== it.k + ':' + it.id && X.D.byKey.get(t) ? [{key: t}] : [];
};
/* a key with no card behind it draws nothing, so it is never a row (the tree carries small passives the
   index has no card for, and kwuse names them by id) */
const cardRows = keys => keys.filter(key => X.D.byKey.get(key)).map(key => ({key}));

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

/* ---------- where a card sits, for the search to weigh ----------
   The same maps the lists above are drawn from, asked a shorter question: which groups is this card in, and
   how many cards are in each. The search reads it at both ends - the cards you opened, to see what they have
   in common, and every card the words matched, to see whether it shares any of it (assets/app.js).
   Both ends, so both ways round: a card is never put inside its own group, so a base item has to be asked
   for the group that carries its name, or the unique that sits on it would answer to nothing. Ask every card
   the same question and the two meet in the same group.
   A group holding only this card joins it to nothing, so it is left out. The answer is kept on the card, the
   way its search words are: a list of matches is walked on every keystroke, and this must be a lookup. */
const MAPLIST = Object.entries(MAPS);
export function groupsOf(it){
  if(it._gx && it._gxv === X.D.index) return it._gx;
  const IX = turn(), key = it.k + ':' + it.id, out = [];
  for(const [m, g] of MAPLIST){
    const v = it[g.at];
    if(v === undefined || v === null || v === '') continue;
    if(g.of){                                           // the same two tests turn() puts a card through
      const target = g.of + ':' + v;
      if(target === key || !X.D.byKey.get(target)) continue;
    }
    const gk = g.per === 'kind' ? it.k + '/' + v : v;
    const list = IX[m].get(gk);
    // a group named after a card holds that card as well, though the map never puts it in there: one unique
    // on a base item is still two cards that belong together
    const n = list ? list.length + (g.of ? 1 : 0) : 0;
    if(n > 1) out.push([m + ':' + gk, n]);
  }
  // the group named after this card: the uniques that sit on this base item, the items of this item class
  for(const [m, g] of MAPLIST){
    if(g.of !== it.k) continue;
    const list = IX[m].get(it.id);
    if(list && list.length) out.push([m + ':' + it.id, list.length + 1]);
  }
  it._gxv = X.D.index; it._gx = out;
  return out;
}

/* ---------- one edge each ---------- */
const EDGE = {
  base(it){ return to(it, 'base'); },
  variants(it){ return cardRows(others(turn().base.get(it.base), it.k + ':' + it.id)); },
  uniques(it){ return cardRows(turn().base.get(it.base) || []); },
  klass(it){ return cardRows(others(turn().klass.get(it.cr), it.k + ':' + it.id)); },
  klassof(it){ return to(it, 'klass'); },
  // an item class is its own class (KINDS make), so the whole class reads the same map from the other end
  inclass(it){ return cardRows(turn().klass.get(it.cr) || []); },
  section(it){ return cardRows(others(turn().place.get(it.at), it.k + ':' + it.id)); },
  cat(it){ return cardRows(others(turn().cat.get(it.k + '/' + it.s), it.k + ':' + it.id)); },
  /* Things whose own line says they do the same job, cheapest first — which is the whole question a player
     choosing between them is asking. One the market has no price for today sorts last, never as free. */
  job(it){
    const rows = others(turn().job.get(it.k + '/' + it.job), it.k + ':' + it.id);
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
    return j === undefined ? [] : clusters(C).rows[j].filter(r => X.D.byKey.get(r.key));
  },
  clusterof(it, F){
    const C = F.clusters;
    if(!C) return [];
    return cardRows((clusters(C).of.get(it.k + ':' + it.id) || []).map(j => 't:' + C.id[j]));
  },
  named(it){ return cardRows((it.rx || []).filter(key => X.D.byKey.get(key))); },
  namedby(it){ return cardRows(others(turn().namedby.get(it.k + ':' + it.id), it.k + ':' + it.id)); },
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
      return X.D.byKey.get('p:' + id) ? {key: 'p:' + id, x: n} : null;
    }
    const [n, t, k, where] = U.sp[x] || [];
    return n ? {n, sub: t + (where ? DOT + where : ''), x: k, ic: true, hay: 'small passive'} : null;
  }).filter(Boolean); },
  e(U, list){ return list.map(i => {
    const [n, line, kinds] = (U.es || [])[i] || [];
    if(!n) return null;
    const names = (kinds || []).map(k => U.ck[k] || k);
    return X.D.byKey.get('c:' + n) ? {key: 'c:' + n, sub: line, kinds: names}
      : {n, sub: line, kinds: names, ic: true};
  }).filter(Boolean); },
  a(U, list){ return list.map(([i, line]) => {
    const [s, n, what, key] = (U.at || [])[i] || [];
    if(!n) return null;
    if(key && X.D.byKey.get(key)) return {key, sub: what + DOT + line};
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
    return X.D.byKey.get('c:' + n) ? {key: 'c:' + n, sub} : {n, sub, ic: true};
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
