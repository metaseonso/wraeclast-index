/* Suggest: a small button on every page. Players send a short note, no sign-in.
   Notes go to the site's database (worker/community.js) and show on the owner's dashboard only. */
import { openBox } from './app.js';

export function mountSuggest(){
  let b = document.getElementById('suggestbtn');   // the pages write it in their top bar (no jump on first paint)
  if(b && b.dataset.on) return;
  if(!b){
    b = document.createElement('button');
    b.id = 'suggestbtn'; b.type = 'button'; b.className = 'suggestbtn';
    b.textContent = 'Suggest'; b.title = 'Send an idea or report a problem';
    const keys = document.getElementById('keysbtn');   // top bar, just left of the keybind button
    if(keys) keys.before(b); else document.body.appendChild(b);
  }
  b.dataset.on = '1';
  b.addEventListener('click', open);
}

function open(){
  const box = document.createElement('section');
  box.className = 'suggest panel';
  box.innerHTML = '<h3>Got an idea or found a problem?</h3>' +
    '<p class="note">Keep it short. No sign-in, no name needed.</p>' +
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
        body: JSON.stringify({text, page: location.pathname + location.hash.split('?')[0]})});
      if(r.ok){ box.innerHTML = '<h3>Thanks!</h3><p class="note">Got it. We read every note.</p>'; return; }
      msg.textContent = r.status === 429 ? 'That is a lot of notes. Try again later.' : 'Could not send. Try again later.';
    } catch { msg.textContent = 'Could not send. Try again later.'; }
    send.disabled = false;
  });
  import('./support.js').then(async s => { if(await s.support()) box.insertAdjacentHTML('beforeend', '<p class="note">' + s.supportLink() + '</p>'); }).catch(() => {});
  openBox(box, 'Suggest');
  setTimeout(() => ta.focus(), 50);
}
