/* The index turned round: the groups MAPS declares, and every list Connections draws from them.
   One copy of the rules, read at both ends: the search worker holds every card's search row and works these out
   for the page (assets/searchworker.js), and a page that holds the whole index (a tab that needs it) works them
   out itself (assets/edges.js). Moved here from assets/edges.js, rules unchanged.

   `items` is every card, `has(key)` whether a card of that key exists. A card goes into a group when it
   carries the field that group is keyed by; a group named after a kind is only a group where a card of that
   kind answers to the name (a unique whose base item the files do not name carries its item class there
   instead, and an item class is not a base item); and a card is never put into its own group, because nothing
   on the site is its own connection. */
import {MAPS} from './kinds.js';

const MAPLIST = Object.entries(MAPS).filter(([, g]) => !g.keys && !g.each);
// the maps whose field is a list of card keys: each is turned round, so a card finds every card that names it
const KEYLIST = Object.entries(MAPS).filter(([, g]) => g.keys);
// the maps whose field is a list of words: a card sits in the group of each of its words
const EACHLIST = Object.entries(MAPS).filter(([, g]) => g.each);
export function turn(items, has){
  const maps = {};
  for(const m of Object.keys(MAPS)) maps[m] = new Map();
  const namedby = new Map();
  for(const it of items){
    if(it.dup) continue;
    const key = it.k + ':' + it.id;
    for(const [m, g] of MAPLIST){
      const v = it[g.at];
      if(v === undefined || v === null || v === '') continue;
      if(g.of){
        const target = g.of + ':' + v;
        if(target === key || !has(target)) continue;
      }
      push(maps[m], g.per === 'kind' ? it.k + '/' + v : v, key);
    }
    for(const target of it.rx || []) push(namedby, target, key);   // a line of this card names that one
    for(const [m, g] of KEYLIST) for(const target of it[g.at] || []) if(target !== key) push(maps[m], target, key);
    for(const [m, g] of EACHLIST) for(const w of it[g.at] || []) push(maps[m], w, key);
  }
  return {...maps, namedby};
}
function push(map, k, v){ const a = map.get(k); if(a) a.push(v); else map.set(k, [v]); }
const others = (list, key) => (list || []).filter(x => x !== key);

/* ---------- where a card sits, for the search to weigh ----------
   The same maps, asked a shorter question: which groups is this card in, and how many cards are in each.
   Both ways round: a card is never put inside its own group, so a base item has to be asked for the group that
   carries its name, or the unique that sits on it would answer to nothing. A group holding only this card
   joins it to nothing, so it is left out. */
export function groupsOf(IX, it, has){
  const key = it.k + ':' + it.id, out = [];
  for(const [m, g] of MAPLIST){
    const v = it[g.at];
    if(v === undefined || v === null || v === '') continue;
    if(g.of){                                           // the same two tests turn() puts a card through
      const target = g.of + ':' + v;
      if(target === key || !has(target)) continue;
    }
    const gk = g.per === 'kind' ? it.k + '/' + v : v;
    const list = IX[m].get(gk);
    // a group named after a card holds that card as well, though the map never puts it in there: one unique
    // on a base item is still two cards that belong together
    const n = list ? list.length + (g.of ? 1 : 0) : 0;
    if(n > 1) out.push([m + ':' + gk, n]);
  }
  for(const [m, g] of EACHLIST) for(const w of it[g.at] || []){
    const list = IX[m].get(w);
    if(list && list.length > 1) out.push([m + ':' + w, list.length]);
  }
  // the group named after this card: the uniques that sit on this base item, the items of this item class
  for(const [m, g] of MAPLIST){
    if(g.of !== it.k) continue;
    const list = IX[m].get(it.id);
    if(list && list.length) out.push([m + ':' + it.id, list.length + 1]);
  }
  return out;
}

/* ---------- the lists, one card at a time ----------
   Every list assets/edges.js draws from a group, as card keys, each list exactly as its edge reads it. "job" is
   left in the group's order: the page sorts it by today's price. */
export function lists(IX, it, has){
  const key = it.k + ':' + it.id;
  // the one card this card's own field names, as that field's map declares it
  const to = m => { const g = MAPS[m], v = it[g.at], t = v ? g.of + ':' + v : ''; return t && t !== key && has(t) ? [t] : []; };
  return {
    base: to('base'),
    variants: others(IX.base.get(it.base), key),
    uniques: IX.base.get(it.base) || [],
    klass: others(IX.klass.get(it.cr), key),
    klassof: to('klass'),
    inclass: IX.klass.get(it.cr) || [],
    section: others(IX.place.get(it.at), key),
    cat: others(IX.cat.get(it.k + '/' + it.s), key),
    job: others(IX.job.get(it.k + '/' + it.job), key),
    named: (it.rx || []).filter(has),
    namedby: others(IX.namedby.get(key), key),
    act: others(IX.act.get(it.act), key),
    actof: to('act'),
    // every card whose own list of keys names this one, per map
    back: Object.fromEntries(KEYLIST.map(([m]) => [m, others(IX[m].get(key), key)])),
    // every card that shares one of this card's words, per map, in the order of its own words
    each: Object.fromEntries(EACHLIST.map(([m, g]) =>
      [m, [...new Set((it[g.at] || []).flatMap(w => others(IX[m].get(w), key)))]])),
  };
}
