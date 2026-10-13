import { SEEN_MAX, ranker } from '../rank.js';
import { D, priceOf, usageOf, TRAIL_NOW } from '../core/data.js';
import * as edges from '../edges.js';
import { idle } from '../core/boot.js';

/* ---------- where you have been ----------
   The cards opened in this tab, newest first, so the search can put what sits nearest them first. A card is
   near one of yours when the index already joins the two: the same base item, item class, Atlas section or
   sub line - the maps Connections is drawn from (assets/edges.js) - a keyword they share, or a card yours
   names outright. Every card further back counts for less, so the last few decide it.
   A group of three says a great deal and a group of nine hundred says next to nothing, so each one is worth
   less the more cards are in it, and a keyword the same by its own tally. The sum is capped: the words still
   say what the search is about, and closeness only orders what they matched.
   This tab's own list, and it goes when the tab does. Card keys in sessionStorage: no address, no cookie,
   nothing anyone typed, and none of it leaves the browser - the line worker/dash.js already holds.
   Signed in (#7): an account's history is the same list in the same shape, the cards it opened newest first,
   weighted to recent leagues instead of to this tab's last few. It plugs in at BEEN.account - a function
   answering that list of keys - and nothing else here changes. Accounts are not built, so the slot stays
   empty, the way D.usage does. */
export const BEEN = {account: null};
const SEEN = 'wi.seen';        // the trail, in this tab's own storage (SEEN_MAX cards, assets/rank.js)

// the tab's storage is read once and kept here after: a keystroke must not go looking for it
let SEEN_LIST = null;
function tabSeen(){
  if(!SEEN_LIST){ try { SEEN_LIST = JSON.parse(sessionStorage.getItem(SEEN)) || []; } catch { SEEN_LIST = []; } }
  return SEEN_LIST;
}
// the account's own history where there is one, this tab's trail where there is not
const seenKeys = () => (BEEN.account && BEEN.account()) || tabSeen();
function sawCard(it){
  const key = it.k + ':' + it.id;
  SEEN_LIST = [key, ...tabSeen().filter(k => k !== key)].slice(0, SEEN_MAX);   // opened again, it goes to the front
  try { sessionStorage.setItem(SEEN, JSON.stringify(SEEN_LIST)); } catch {}   // a browser that will not keep it searches as a guest
}
/* The search's rules (assets/rank.js), over the cards the page holds. A page holding the whole index (a tab that
   works over all of it) answers its own searches with them, and the Currency tab's box and the map's find match
   their words against the cards. The worker holds the same rules over every kind's search rows. */
const PR = ranker({items: () => (D.index && D.index.items) || [], get: key => D.byKey.get(key), groupsOf: it => edges.groupsOf(it),
  priced: it => !!priceOf(it), usage: usageOf, seen: () => TRAIL_NOW || seenKeys(), version: () => D.index, idle: f => idle(f)});
export const words = qs => PR.words(qs);
// the vocabulary is worked out once the whole index is in: assets/core/data.js hooks it on `ready`, since this module
// is evaluated before that promise exists (data.js imports this one)

export { seenKeys, sawCard, PR };
