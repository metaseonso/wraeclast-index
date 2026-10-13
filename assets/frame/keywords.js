import { D } from '../core/data.js';
import { KW, KIND } from '../kinds.js';

/* ---------- the keyword a card is, and the card a keyword is ----------
   Read by the line marks (frame/types/reqs.js, assets/marks.js), the chips and Connections (frame/related.js) and
   the popup. */
export function keywordCard(id){
  const name = D.index.kwx && D.index.kwx[id];   // a keystone stands for its own keyword (KINDS kw)
  return D.byKey.get(KW.own + ':' + id) ||
    (name && D.index.items.find(x => KW.named.includes(x.k) && x.n === name)) || null;
}
/* Kept on the card: every line of it asks, and the answer is a walk over the keystones (assets/marks.js).
   Where a kind's keyword id is, is the kind's own "kw": its own id, or the keyword that goes by its name. */
const KWID = {
  id:   it => it.id,
  name: it => { for(const [k, n] of Object.entries(D.index.kwx || {})) if(n === it.n) return k; return null; },
};
export function keywordIdOf(it){
  if(it._kwid !== undefined) return it._kwid;
  const how = KWID[(KIND[it.k] || {}).kw];
  return it._kwid = (how ? how(it) : null) || null;
}
