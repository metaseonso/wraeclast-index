import { FRAME } from '../kinds.js';

/* ---------- the play mode ----------
   Trade, SSF, Hardcore or HC SSF (FRAME.modes), picked in the top bar and kept in this browser. A mode with no
   prices marks <body> `nopx`: index.html does it before the first paint, and this does it on a page that has no
   such line (the drill-down page). What a mode changes on a card is the frame's (slotHTML, card); what it changes
   off a card is assets/cards.css `body.nopx`. A new pick redraws the page: every card is drawn again under it. */
const MODE_KEY = 'wi.mode';
export const MODE = (() => { let m = ''; try { m = localStorage.getItem(MODE_KEY) || ''; } catch {} return m in FRAME.modes ? m : 'trade'; })();
const PLAY = FRAME.modes[MODE];
document.body.classList.toggle('nopx', !PLAY.px);
/* What the mode leads with, first in a list: each group the mode names, in its order, then the rest, every group in
   the order it came in. `of` says which group a piece is in. The slot rule uses it on a card's fields, and a module
   that draws a card of its own (assets/bosses.js) on its blocks, so both put the same things first. */
export function leadFirst(list, of){
  const lead = PLAY.first;
  if(!lead.length) return list;
  const rank = x => { const i = lead.indexOf(of(x)); return i < 0 ? lead.length : i; };
  return list.map((x, i) => [rank(x), i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(r => r[2]);
}
export const noPrice = () => !PLAY.px;

export { MODE_KEY, PLAY };
