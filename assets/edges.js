/* What else belongs with this card, worked out from the index itself.

   Every list here is an edge the data already holds, followed both ways: a unique names its base and a base
   names its uniques; a base grants a skill and that skill's gem names the items that grant it; a line that
   names another card gives "Named on this card" one way and "Named by" the other. A keyword's own nine lists
   come from data/kwuse.json (tools/kwuse.py), loaded the first time one is needed.

   Two of them read a file of their own, fetched only when a card asks for one: data/kwuse.json for a
   keyword's nine lists, and data/grants.json for which item grants which skill, both ways round
   (tools/kwuse.py, tools/grants.py). `categories` says which of those it still needs.

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
/* a key with no card behind it draws nothing, so it is never a row (the tree carries small passives the
   index has no card for, and kwuse names them by id) */
const cardRows = keys => keys.filter(key => X.D.byKey.get(key)).map(key => ({key}));

/* ---------- one edge each ---------- */
const EDGE = {
  base(it){
    const t = 'b:' + it.base;
    return it.base && t !== it.k + ':' + it.id && X.D.byKey.get(t) ? [{key: t}] : [];
  },
  variants(it){ return cardRows(others(turn().base.get(it.base), it.k + ':' + it.id)); },
  uniques(it){ return cardRows(turn().base.get(it.base) || []); },
  klass(it){ return cardRows(others(turn().klass.get(it.cr), it.k + ':' + it.id)); },
  section(it){ return cardRows(others(turn().place.get(it.at), it.k + ':' + it.id)); },
  cat(it){ return cardRows(others(turn().cat.get(it.k + '/' + it.s), it.k + ':' + it.id)); },
  // which item grants which skill, both ways round, as tools/grants.py worked it out
  grants(it, F){ return cardRows((((F.grants || {}).by || {})[it.k + ':' + it.id] || []).map(x => x[0])); },
  granted(it, F){ return cardRows((((F.grants || {}).of || {})[it.k + ':' + it.id] || []).map(x => x[0])); },
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
