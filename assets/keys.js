/* Wraeclast Index — keyboard shortcuts and the keybindings popup.
   One capture listener handles every shortcut on both pages (the app and the drill-down), so it runs
   before the drill-down page's own "/" shortcut. Bindings are saved in this browser (localStorage);
   the site works the same without storage, on the defaults.
   A binding is a key ("g", "/") or a Ctrl combo ("ctrl+/"; Cmd counts as Ctrl on a Mac). */

const ACTIONS = [
  {id: 'search',   name: 'Search everything',  key: '/'},
  {id: 'list',     name: 'Search this list',   key: 'ctrl+/'},
  {id: 'home',     name: 'Go to Search',       key: 'h', go: './#/'},
  {id: 'build',    name: 'Go to Build',        key: 'b', go: './#/build'},
  {id: 'currency', name: 'Go to Currency',     key: 'c', go: './#/currency'},
  {id: 'trade',    name: 'Go to Trade',        key: 't', go: './#/trade'},
  {id: 'gems',     name: 'Go to Gems',         key: 'g', go: 'explore#gems'},
  {id: 'uniques',  name: 'Go to Uniques',      key: 'u', go: 'explore#uniques'},
  {id: 'tree',     name: 'Go to Passive tree', key: 'p', go: 'explore#tree'},
  {id: 'keys',     name: 'Show keybindings',   key: '?'},
  // the open card's own keys: they run only while a card is up, and nothing else runs then
  {id: 'cardback', name: 'Card back',          key: 'ArrowLeft',  card: true},
  {id: 'cardfwd',  name: 'Card forward',       key: 'ArrowRight', card: true},
  {id: 'cardclose', name: 'Close card',        key: 'x',          card: true},
];
const STORE = 'wi.keys';
const MODS = new Set(['Shift', 'Control', 'Alt', 'AltGraph', 'Meta', 'OS', 'Super', 'Hyper', 'Fn', 'FnLock',
  'CapsLock', 'NumLock', 'ScrollLock', 'Symbol', 'SymbolLock', 'Dead', 'Process', 'Unidentified']);
const NOBIND = new Set(['Tab', 'Enter', ' ']);   // they move focus and press buttons
const CTRL_NOBIND = new Set([...'acvxyztwn']);    // copy, paste, undo…, and the browser's own tab keys
const NAMES = {' ': 'Space', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  PageUp: 'PgUp', PageDown: 'PgDn', Delete: 'Del', Insert: 'Ins'};
const norm = k => !k ? '' : k.length === 1 ? k.toLowerCase() : k;
const keyName = k => !k ? '' : k.startsWith('ctrl+') ? 'Ctrl + ' + keyName(k.slice(5)) : NAMES[k] || (k.length === 1 ? k.toUpperCase() : k);
const typing = el => el && (/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.isContentEditable);
// the binding a key press stands for: '' for a lone modifier, null for an Alt combo (those stay the browser's)
function comboOf(e){
  if(!e.key || MODS.has(e.key)) return '';
  const altgr = e.getModifierState && e.getModifierState('AltGraph');   // AltGr types a character: not a combo
  if(e.altKey && !altgr) return null;
  return (!altgr && (e.ctrlKey || e.metaKey) ? 'ctrl+' : '') + norm(e.key);
}

/* ---------- bindings ---------- */
let map = {};   // action id -> key ('' = unbound)
function load(){
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch {}
  map = {};
  for(const a of ACTIONS) map[a.id] = a.key;
  const mine = ACTIONS.filter(a => typeof saved[a.id] === 'string');
  for(const a of mine) map[a.id] = saved[a.id];
  for(const a of mine)   // a key the player chose wins over a default that has the same key
    if(map[a.id]) for(const b of ACTIONS) if(!mine.includes(b) && map[b.id] === map[a.id]) map[b.id] = '';
}
function save(){
  const out = {};
  for(const a of ACTIONS) if(map[a.id] !== a.key) out[a.id] = map[a.id];
  try { localStorage.setItem(STORE, JSON.stringify(out)); } catch {}
}
// bind a key; an action that had it loses it. Returns that action, if any.
function bind(id, k){
  let moved = null;
  if(k) for(const a of ACTIONS) if(a.id !== id && map[a.id] === k){ map[a.id] = ''; moved = a; }
  map[id] = k;
  save(); paint();
  return moved;
}

/* ---------- actions ---------- */
let focusTarget = () => null;
const shown = el => el.getClientRects().length > 0;
// "this list": the page's own search box (a drill-down list's filter, the currency search…), else the top search
function listTarget(){
  return [...document.querySelectorAll('input[type=search]')].find(el => shown(el) && !el.closest('.top, .mast, .ov')) || focusTarget();
}
let cardRun = null;   // what a card's own key does; assets/app.js says so, and answers false when it cannot
export function setCardKeys(f){ cardRun = f; }
function run(a){
  if(a.card) return cardRun && cardRun(a.id);
  if(a.id === 'keys') return open();
  if(a.id === 'search' || a.id === 'list'){
    const q = a.id === 'list' ? listTarget() : focusTarget();
    if(q){ q.focus(); if(q.select) q.select(); }
    return;
  }
  const url = new URL(a.go, location.href);
  const here = location.pathname.replace(/(index)?\.html$/, '');   // /explore.html is /explore
  if(url.pathname !== here) location.href = url.href;
  else if((location.hash.split(/[?=]/)[0] || '#/') !== url.hash) location.hash = url.hash;   // same page: switch the tab only
}

/* ---------- the popup ----------
   Same look and rules as the card popup: clicking off it, Esc or Back closes it. */
let OV = null, listen = null, back = null, noteT = 0;
function build(){
  OV = document.createElement('div');
  OV.className = 'ov keys-ov'; OV.hidden = true;
  OV.innerHTML = '<div class="ov-scrim" data-close></div>' +
    '<div class="ov-box keys-box" role="dialog" aria-modal="true" aria-labelledby="keys-h" tabindex="-1">' +
      '<div class="keys-card"><h2 id="keys-h">Keybindings</h2><ul class="keys-list">' +
      ACTIONS.map(a => '<li class="keys-row"><span class="keys-name">' + a.name + '</span>' +
        '<button type="button" class="keys-key" data-id="' + a.id + '"></button>' +
        '<button type="button" class="keys-reset" data-id="' + a.id + '" aria-label="Reset ' + a.name + '">Reset</button></li>').join('') +
      '</ul><p class="keys-note" role="status" aria-live="polite"></p></div>' +
      '<div class="keys-foot"><button type="button" class="keys-clear">Clear all keybinds</button></div>' +
    '</div>';
  document.body.appendChild(OV);
  OV.addEventListener('click', e => {
    if(e.target.closest('[data-close]')) return close();
    const k = e.target.closest('.keys-key'), r = e.target.closest('.keys-reset');
    if(k){ if(listen === k.dataset.id) stop(); else start(k.dataset.id); return; }
    if(r){
      stop();
      const a = ACTIONS.find(x => x.id === r.dataset.id);
      say(movedNote(bind(a.id, a.key), a.key));
      keyBtn(a.id).focus();   // the Reset button goes grey, so focus goes back to the key
      return;
    }
    if(e.target.closest('.keys-clear')){
      stop();
      for(const a of ACTIONS) map[a.id] = '';
      save(); paint(); say('All keybinds cleared.');
    }
  });
  addEventListener('popstate', () => { if(!OV.hidden) hide(); });
}
const keyBtn = id => OV.querySelector('.keys-key[data-id="' + id + '"]');
function paint(){
  paintHints();
  if(!OV) return;
  for(const a of ACTIONS){
    const b = keyBtn(a.id), k = map[a.id], on = listen === a.id;
    b.textContent = on ? 'Press a key…' : k ? keyName(k) : 'Unbound';
    b.classList.toggle('on', on);
    b.classList.toggle('none', !on && !k);
    b.setAttribute('aria-label', a.name + ': ' + (on ? 'press a key' : k ? keyName(k) : 'unbound'));
    OV.querySelector('.keys-reset[data-id="' + a.id + '"]').disabled = k === a.key;
  }
}
function say(t){
  const n = OV.querySelector('.keys-note');
  n.textContent = t || '';
  clearTimeout(noteT);
  if(t && !listen) noteT = setTimeout(() => { n.textContent = ''; }, 4000);
}
const movedNote = (a, k) => a ? keyName(k) + ' moved from ' + a.name + '.' : '';
function start(id){ listen = id; paint(); say('Esc to cancel.'); }
function stop(){ if(!listen) return; listen = null; paint(); say(''); }
function open(){
  if(!OV) build();
  if(!OV.hidden) return;
  paint(); say('');
  back = document.activeElement;
  OV.hidden = false;
  document.body.classList.add('ov-open');
  history.pushState({keys: 1}, '', location.href);   // Back closes it
  OV.querySelector('.ov-box').focus({preventScroll: true});
}
function hide(){
  if(!OV || OV.hidden) return;
  stop();
  OV.hidden = true;
  document.body.classList.remove('ov-open');
  if(back && back.focus) back.focus({preventScroll: true});
}
function close(){
  if(history.state && history.state.keys) history.back();   // popstate hides it
  else hide();
}

/* the "/" hints in the search boxes and the button's tooltip follow the bindings */
function paintHints(){
  const k = keyName(map.search);
  document.querySelectorAll('.searchbox-kbd, .tsearch kbd').forEach(el => { el.textContent = k; el.hidden = !k; });
  const b = document.getElementById('keysbtn');
  if(b) b.title = 'Keybindings' + (map.keys ? ' (' + keyName(map.keys) + ')' : '');
}

/* ---------- the one key handler ---------- */
function onKey(e){
  const k = comboOf(e);
  if(listen){   // the popup is waiting for a key: this key is the new binding
    e.preventDefault(); e.stopImmediatePropagation();
    if(e.key === 'Escape') return stop();
    if(k === '') return;
    if(k === null) return say('No Alt combos.');
    if(NOBIND.has(e.key) || (k.startsWith('ctrl+') && CTRL_NOBIND.has(k.slice(5)))) return say(keyName(k) + ' can’t be bound.');
    const id = listen;
    listen = null;
    say(movedNote(bind(id, k), k));
    return;
  }
  if(OV && !OV.hidden){
    e.stopImmediatePropagation();   // the page behind the popup hears nothing (Tab and Enter still work)
    if(e.key === 'Escape' || (k && k === map.keys && !e.repeat)){ e.preventDefault(); close(); }
    return;
  }
  if(e.key === '/') e.stopImmediatePropagation();   // the drill-down page's own "/" shortcut: this one replaces it
  if(!k || e.repeat || e.isComposing) return;
  if(!k.startsWith('ctrl+') && typing(document.activeElement)) return;   // a plain key while typing is just typing
  if(document.body.classList.contains('ov-open')){   // a card popup is open: only the card's own keys run
    const c = ACTIONS.find(x => x.card && map[x.id] === k);
    if(!c || !run(c)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    return;
  }
  const a = ACTIONS.find(x => map[x.id] === k && !x.card);
  if(!a) return;
  e.preventDefault(); e.stopImmediatePropagation();
  run(a);
}

/* focus: a function that returns the search box "Search everything" jumps into */
let started = false;
export function initKeys(focus){
  if(focus) focusTarget = focus;
  if(started) return;
  started = true;
  load();
  addEventListener('keydown', onKey, true);
  addEventListener('storage', e => { if(e.key === STORE || e.key === null){ load(); paint(); } });   // changed in another tab
  const b = document.getElementById('keysbtn');
  if(b) b.addEventListener('click', open);
  setTimeout(paintHints);   // after the top search is mounted
}
