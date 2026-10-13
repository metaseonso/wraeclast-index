import { D } from '../core/data.js';
import { KIND, holds } from '../kinds.js';

/* ---------- where a card goes ----------
   The gold button's address, the Craft tab's, and whether a card is a tradeable item: read by the card, its
   field types, the popup and the top search alike, so it sits below all of them. */
/* the Craft tab, opened on this base — or, with no base, on this kind of item. The plan lives in the address
   in words (assets/craft.js): a base belongs to one kind, so a base link needs nothing else. */
const crEnc = s => encodeURIComponent(s).replace(/%20/g, '+');
export const craftHref = (c, b = '', kind = '') => './#/craft?' + (b ? 'base=' + crEnc(b) : 'kind=' + crEnc(kind || c));
/* The forms a gold button can take that a template cannot write: one entry each, named by a kind's "link".
   A whole craft plan is one of them, so a second thing that carries a plan is a second entry and no code. */
const LINKS = {
  /* A card that names an item class: the class itself opens the Craft tab on the whole class, a base item on
     that base. An item class is its own class (KINDS make), which is what tells the two apart. */
  craft: it => !it.cr ? null : it.cr === it.id ? craftHref(it.cr, '', it.n)
    : D.byKey.get('b:' + it.id) === it ? craftHref(it.cr, it.n) : null,
};
/* Where a card's gold button goes: the kind's own "link", with @field filled in from the entry, or one of the
   forms above. A field the entry has nothing for means no link at all, and so does an entry its kind calls
   gone — one with nowhere to go yet (KINDS gone: a currency the catalogue does not list). */
export function hrefOf(it){
  const d = KIND[it.k];
  if(!d || !d.link) return null;
  if(d.gone && holds(it, d.gone)) return null;
  if(LINKS[d.link]) return LINKS[d.link](it);
  let have = true;
  const href = d.link.replace(/@(\w+)/g, (_, f) => {
    if(it[f] === undefined || it[f] === '') have = false;
    return encodeURIComponent(it[f]);
  });
  return have ? href : null;
}
/* an item is something that can be traded, unless its kind says this entry is not one (KINDS notitem: an
   Atlas passive is on the Atlas but is not an item) */
export const isItem = it => { const d = KIND[it.k]; return !!(d && d.item) && !(d.notitem && holds(it, d.notitem)); };
