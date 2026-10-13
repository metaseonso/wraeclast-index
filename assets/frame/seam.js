import { lazy } from '../core/lazy.js';

/* ---------- the frame's late-bound names ----------
   What a file low in the frame calls without importing the file that defines it, so no two files import each other:
   the popup's overlay (set by frame/popup.js once it is made), the owner's counter (assets/ui/track.js, set by the top
   search), and the card renderer (set by frame/card.js), which a field type draws a card inside a card with.
   The popup is not part of the first paint: a card opened before it has arrived fetches it then. The app asks for it
   once the first answer is drawn (assets/app.js), so in practice it is already here. */
export let OV = null;
export function setOV(el){ OV = el; }
export let TRACKER = null;
export function setTracker(m){ TRACKER = m; }
export const late = {card: null};
let POP = null, MOD = null;
export function popup(){
  return POP || (POP = lazy('./frame/popup.js', 'This card').then(m => (MOD = m), err => { POP = null; throw err; }));
}
export function openDetail(it, opts, href){
  if(MOD) return MOD.openDetail(it, opts, href);
  popup().then(m => m.openDetail(it, opts, href), () => {});
}
