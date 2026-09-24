/* Suggest: a small button on every page, and the same mark in the corner of every card (askHTML in
   assets/app.js). Players send a short note, no sign-in. A note carries where it came from — the page, and
   the card it was sent from where it was sent from one — so the owner's dashboard shows it against the
   thing it is about. Nothing else goes with it: no words typed elsewhere on the page, nothing about the
   person. Notes go to the site's database (worker/community.js) and show on the owner's dashboard only. */
import { openBox, esc, markHTML, D } from './app.js';

export function mountSuggest(){
  let b = document.getElementById('suggestbtn');   // the pages write it in their top bar (no jump on first paint)
  if(b && b.dataset.on) return;
  if(!b){
    b = document.createElement('button');
    b.id = 'suggestbtn'; b.type = 'button'; b.className = 'suggestbtn';
    b.innerHTML = '<i class="mk"></i>Suggest'; b.title = 'Send an idea or report a problem';
    const keys = document.getElementById('keysbtn');   // top bar, just left of the keybind button
    if(keys) keys.before(b); else document.body.appendChild(b);
  }
  // the words stay: this is where a player meets the mark first, and the words are what explain it
  const box = b.querySelector('.mk');
  if(box) box.outerHTML = markHTML('say');
  b.dataset.on = '1';
  b.addEventListener('click', () => open(''));
}

/* the mark in a card's corner: the same box, about that card */
export function openSuggest(card){ open(card || ''); }

/* ---------- the owner's own flag ----------
   Typed, not clicked, and nowhere on the page: the owner reads a card, sees the site talking like an
   assistant instead of like the game, and types the sequence. It sends the page and the card it was sent
   from down the same path a note takes, with CDA as its text, so it lands in the notes with everything else
   and whoever reads them can find every one at once.
   The sequence resets on any other key and after a pause, and never fires while a box is being typed in, so
   it cannot go off inside a search. The only thing it shows is a small word for a moment: enough to know it
   landed, not enough to be a feature. */
// the key and the key's own place on the board, because a number row and a number pad are the same key to
// whoever typed it, and some keyboards hand over a name where others hand over the character
const SEQS = [
  {keys: [['-', 'Minus', 'NumpadSubtract'], ['0', 'Digit0', 'Numpad0'],
          ['9', 'Digit9', 'Numpad9'], ['8', 'Digit8', 'Numpad8']], go: flagged},
  {keys: [['`', 'Backquote'], ['\\', 'Backslash'], [']', 'BracketRight']], go: cheat},
];
const hit = (q, e, i) => q[i] && q[i].some(k => k === e.key || k === e.code);
const PAUSE = 2000;   // a sequence typed slower than this is not a sequence
let last = 0;
function typing(el){
  if(!el || typeof el.closest !== 'function') return false;   // the key was not aimed at anything on the page
  return !!(el.closest('input, textarea, select') || el.closest('[contenteditable]:not([contenteditable="false"])'));
}
function flagged(){
  const card = (document.querySelector('.ov-box .card-ask') || {}).dataset;
  fetch('api/suggest', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-WI': '1'},
    body: JSON.stringify({text: 'CDA', page: location.pathname + location.hash.split('?')[0],
      card: (card && card.ask) || ''})}).catch(() => {});
  let note = document.querySelector('.cda-said');
  if(!note){
    note = document.createElement('p');
    note.className = 'cda-said';
    note.setAttribute('role', 'status');
    document.body.appendChild(note);
  }
  note.textContent = 'Flagged.';
  clearTimeout(note._go);
  note._go = setTimeout(() => note.remove(), 1400);
}
export function mountFlag(){
  if(window.__wiFlag) return;
  window.__wiFlag = true;
  for(const q of SEQS) q.at = 0;
  addEventListener('keydown', e => {
    if(e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    const now = Date.now();
    for(const q of SEQS){
      if(now - last > PAUSE) q.at = 0;
      q.at = hit(q.keys, e, q.at) ? q.at + 1 : (hit(q.keys, e, 0) ? 1 : 0);
      if(q.at === q.keys.length){ q.at = 0; q.go(); }
    }
    last = now;
  });
}

/* ---------- the cheat code ----------
   The words, and war drums a long way off. The words are the crest's own hand, forged the same way and made
   the same way (tools/art.py): dark metal, bone bevels, green stone lit from inside it. A typeface would
   have been the site's headings, not its badge.

   The drums are not a file and not a sample of anybody's recording. A hit is a low tone that drops as it
   sounds, put through a filter that takes the top off and a delay that answers it, which is what distance
   does to a drum; between the hits is a short dry rattle high above them. So there is nothing to fetch,
   nothing to licence, and the pattern is two lines below rather than a waveform nobody can change. It only
   ever plays off the keys that were just typed, so the browser has its gesture, and it is stopped the moment
   the words go.
   The sound goes first: the drums have LEAD seconds on their own before the words come up, so it is heard
   coming before it is read (the badge's own delay, assets/app.css .cheat-said).

   Where the reader has asked for less motion, the words come up without their entrance. */
const BEATS = [0, .52, 1.16, 1.68, 2.32, 2.84];   // two, rest, two, rest, two: a march, not a roll
const SHAKE = [.26, .78, .9, 1.42, 1.94, 2.06, 2.58];   // the small dry sound between them
const FAR = 190;        // hertz the air leaves of a drum this far off
const LOUD = .17;       // as loud as it ever gets
const LEAD = .75;       // seconds the drums have on their own before the words arrive

function drums(){
  const AC = window.AudioContext || window.webkitAudioContext;
  if(!AC) return () => {};
  let ac;
  try { ac = new AC(); } catch { return () => {}; }
  const out = ac.createGain();
  out.gain.value = LOUD;
  const air = ac.createBiquadFilter();   // distance takes the top off
  air.type = 'lowpass';
  air.frequency.value = FAR;
  const echo = ac.createDelay(1);        // ...and gives it back a moment later, quieter
  echo.delayTime.value = .31;
  const back = ac.createGain();
  back.gain.value = .32;
  air.connect(out);
  air.connect(echo);
  echo.connect(back);
  back.connect(echo);
  back.connect(out);
  out.connect(ac.destination);
  // the small dry sound between the drums: noise, brief, and much further up than the skins
  const dust = ac.createBuffer(1, ac.sampleRate * .3, ac.sampleRate);
  const d = dust.getChannelData(0);
  for(let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const now = ac.currentTime + .04;
  for(let i = 0; i < BEATS.length; i++){
    const t = now + BEATS[i], loud = .5 + i / BEATS.length * .5;   // it comes closer as it goes
    const skin = ac.createOscillator(), g = ac.createGain();
    skin.type = 'sine';
    skin.frequency.setValueAtTime(78, t);
    skin.frequency.exponentialRampToValueAtTime(41, t + .24);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(loud, t + .008);
    g.gain.exponentialRampToValueAtTime(.001, t + .55);
    skin.connect(g);
    g.connect(air);
    skin.start(t);
    skin.stop(t + .6);
  }
  for(const at of SHAKE){
    const t = now + at, src = ac.createBufferSource(), g = ac.createGain(), top = ac.createBiquadFilter();
    src.buffer = dust;
    top.type = 'bandpass';
    top.frequency.value = 2600;
    top.Q.value = .8;
    g.gain.setValueAtTime(.06, t);
    g.gain.exponentialRampToValueAtTime(.001, t + .16);
    src.connect(top);
    top.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + .2);
  }
  out.gain.setValueAtTime(LOUD, now + BEATS[BEATS.length - 1]);
  out.gain.linearRampToValueAtTime(0, now + BEATS[BEATS.length - 1] + .9);
  return () => { try { ac.close(); } catch {} };
}

function cheat(){
  if(document.querySelector('.cheat')) return;
  const box = document.createElement('div');
  box.className = 'cheat';
  box.setAttribute('role', 'status');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  box.innerHTML = '<img class="cheat-said" src="assets/brand/cheat-words.webp" alt="Cheat Code Activated" decoding="async">';
  document.body.appendChild(box);
  const quiet = drums();
  setTimeout(() => { box.remove(); quiet(); }, still ? 2800 : 4200);
}

function open(card){
  const it = card ? D.byKey.get(card) : null;
  const box = document.createElement('section');
  box.className = 'suggest panel';
  box.innerHTML = '<h3>Got an idea or found a problem?</h3>' +
    '<p class="note">' + (it ? 'About <b>' + esc(it.n) + '</b>. ' : '') + 'Keep it short. No sign-in, no name needed.</p>' +
    '<textarea class="field" maxlength="500" rows="5" placeholder="What should we add or fix?" aria-label="Your note"></textarea>' +
    '<div class="sug-row"><span class="note sug-count">0 / 500</span><button type="button" class="btn gold sug-send">Send</button></div>' +
    '<p class="note sug-msg" aria-live="polite"></p>';
  const ta = box.querySelector('textarea'), send = box.querySelector('.sug-send'), msg = box.querySelector('.sug-msg');
  ta.addEventListener('input', () => { box.querySelector('.sug-count').textContent = ta.value.length + ' / 500'; });
  send.addEventListener('click', async () => {
    const text = ta.value.trim();
    if(text.length < 3){ msg.textContent = 'Write a little more.'; return; }
    send.disabled = true; msg.textContent = 'Sending…';
    try {
      const r = await fetch('api/suggest', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-WI': '1'},
        body: JSON.stringify({text, page: location.pathname + location.hash.split('?')[0], card})});
      if(r.ok){ box.innerHTML = '<h3>Thanks!</h3><p class="note">Got it. We read every note.</p>'; return; }
      msg.textContent = r.status === 429 ? 'That is a lot of notes.' : 'It did not send.';
    } catch { msg.textContent = 'It did not send.'; }
    send.disabled = false;
  });
  import('./support.js').then(async s => { if(await s.support()) box.insertAdjacentHTML('beforeend', '<p class="note">' + s.supportLink() + '</p>'); }).catch(() => {});
  openBox(box, 'Suggest');
  setTimeout(() => ta.focus(), 50);
}
