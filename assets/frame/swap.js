/* ---------- the switches a card carries, on or off ----------
   On for the visit, so a switch stays on as you walk from card to card: the card flips it (frame/card.js) and its
   field type draws it (frame/types/own.js swapHTML). */
export const SWAPPED = new Set();
export const flipSwap = name => { SWAPPED.has(name) ? SWAPPED.delete(name) : SWAPPED.add(name); };
