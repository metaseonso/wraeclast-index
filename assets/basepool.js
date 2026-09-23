/* What one base item can already have.
   A base's own table is its item class's file (data/craft/<class>.json, tools/craft.py): the modifiers its
   pool rolls, the ones a desecration or a corruption adds, and the defence mix each base comes in. Nothing
   here draws anything and nothing here knows a kind — the card's own fields read it (assets/kinds.js, the
   fields whose type is "pool") and so does the Trade page, so one base narrows a card and a search alike.
   A file is fetched the first time something asks for it and kept for the visit: none of it is in the index
   and none of it is in first paint. */

const FILES = {};   // url -> a promise of it, asked for once
export const table = url => FILES[url] ||
  (FILES[url] = fetch(url, {priority: 'low'}).then(r => r.ok ? r.json() : null).catch(() => null));

/* the table over all of them: the item classes, the orbs, the omens (data/craft.json). The Craft tab's rules
   are handed this whole file, so the Trade page reads it from here rather than fetching it twice. */
export const craft = () => table('data/craft.json');
/* the item classes, and which trade category each one is (data/craft.json) */
export const classes = () => craft().then(x => (x && x.classes) || []);
/* the class a search is on: a base type belongs to one, a whole kind is one. Anything else — a unique, a
   currency — is on no class of its own and narrows nothing. */
export async function classFor(item){
  if(!item) return null;
  const list = await classes();
  if(item.k === 'category') return list.find(c => c.cat === item.v) || null;
  if(item.k === 'base') return list.find(c => c.b.some(b => b[0] === item.v)) || null;
  return null;
}
/* one base of a class, by name. No name means the whole class: every base of it, taken together. */
export const baseOf = (P, name) => (P && name && P.bases.find(b => b.n === name)) || null;
const poolsOf = (P, base) => [...new Set((base ? [base] : P.bases).map(b => b.p))].map(i => P.pools[i]).filter(Boolean);

/* Every modifier family the base can have of one sort — 'm' what it rolls, 'd' what a desecration adds,
   'c' what a corruption adds — in the order the game data ships them. One row per family, with the tiers it
   has here, lowest roll first (so the best tier is the last, the way the Craft tab reads them). A tier
   carries `i`, its modifier's own place in this file: that is what the rules in assets/engine.js are asked
   about, so a caller can go from a line on a card to the modifier the engine knows. */
export function famsOf(P, base, which = 'm'){
  if(!P) return [];
  const by = new Map(), had = new Set();
  for(const pool of poolsOf(P, base)) for(const i of pool[which] || []){
    if(had.has(i)) continue;
    had.add(i);
    const m = P.mods[i], fam = P.fam[m[1]];
    if(!fam) continue;
    let f = by.get(m[1]);
    if(!f) by.set(m[1], f = {f: m[1], side: fam[0], lines: fam[1], tags: fam[2], tiers: []});
    f.tiers.push({i, lo: m[5], hi: m[6], lvl: m[2], lines: m[3]});
  }
  const out = [...by.values()];
  for(const f of out){
    f.tiers.sort((a, b) => a.lvl - b.lvl);
    f.lvl = f.tiers.length ? f.tiers[0].lvl : 0;
  }
  return out.sort((a, b) => a.f - b.f);
}
/* the defence mixes the base comes in ("ar+es"), or every mix its whole class comes in */
export const typingsOf = (P, base) =>
  [...new Set((P ? (base ? [base] : P.bases) : []).map(b => b.d).filter(Boolean))];
