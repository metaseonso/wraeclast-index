/* Pins: a personal watch list, any kind, kept for the tab. The way onto it is under the card itself — a
   Pin button, one act every pinnable kind names in its own declaration (ACTS.pin, assets/kinds.js) — and
   app.js answers that click and keeps the list (isPinned, togglePin, pinnedKeys, onPinChange), the same way
   it already answers Trade and Full stats. Nothing here touches sessionStorage: this file is only the other
   half, reading the list back — the top-bar button, and the box it opens. */
import { D, esc, hrefOf, openDetail, openBox, togglePin, pinnedKeys, onPinChange } from './app.js';
import { KIND } from './kinds.js';

const label = n => 'Pins' + (n ? ' <span class="ct">' + n + '</span>' : '');
let BTN = null, BOX = null;

// the pinned keys, turned back into cards; a key the index no longer carries drops out on its own
function items(){
  return pinnedKeys().map(k => D.byKey && D.byKey.get(k)).filter(Boolean);
}

function pinRow(it){
  const d = KIND[it.k] || {};
  return '<div class="pin-row" data-key="' + esc(it.k + ':' + it.id) + '">' +
    '<button type="button" class="star" aria-pressed="true" title="Unpin">★</button>' +
    '<button type="button" class="pin-go"><span class="pin-nm">' + esc(it.n) + '</span>' +
    '<span class="pin-kind">' + esc(d.one || '') + '</span></button></div>';
}

function paint(){
  const list = items();
  if(BTN) BTN.innerHTML = label(list.length);
  if(!BOX || !BOX.isConnected) return;
  BOX.querySelector('.pins-empty').hidden = !!list.length;
  BOX.querySelector('.pins-list').innerHTML = list.map(pinRow).join('');
}

function open(){
  BOX = document.createElement('section');
  BOX.className = 'pins panel';
  BOX.innerHTML = '<h3>Pins</h3><p class="note">Every card pinned, this tab.</p>' +
    '<p class="note pins-empty">Nothing pinned yet.</p><div class="pins-list"></div>';
  BOX.addEventListener('click', e => {
    const row = e.target.closest('.pin-row'); if(!row) return;
    const it = D.byKey.get(row.dataset.key); if(!it) return;
    if(e.target.closest('.star')){ togglePin(it); return; }
    if(e.target.closest('.pin-go')) openDetail(it, {}, hrefOf(it));
  });
  openBox(BOX, 'Pins');   // connects the box first: paint() only touches a box that is in the page
  paint();
}

export function mountPins(){
  let b = document.getElementById('pinsbtn');   // the pages write it in their top bar (no jump on first paint)
  if(b && b.dataset.on) return;
  if(!b){
    b = document.createElement('button');
    b.id = 'pinsbtn'; b.type = 'button'; b.className = 'pinsbtn'; b.title = 'Your pinned cards';
    const keys = document.getElementById('keysbtn');   // top bar, just left of the keybind button
    if(keys) keys.before(b); else document.body.appendChild(b);
  }
  BTN = b;
  b.dataset.on = '1';
  b.innerHTML = label(pinnedKeys().length);
  b.addEventListener('click', open);
  onPinChange(paint);   // the header count and an open box both follow a pin toggled from anywhere, including a card's own button
}
