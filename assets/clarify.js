/* What players report about an interaction the game leaves open.

   An interaction card holds a question open instead of answering one (tools/interactions.py). This draws
   the two live fields on it (assets/kinds.js, the `players` and `heat` fields):

     players   which way the community leans, who weighed in, and the way to weigh in yourself. Never one
               answer standing in for the rest: the lean is a tally with every side on it, each name is
               beside what that player said and where it came from, and a row we have checked ourselves is
               marked as ours. What a player wrote is drawn as theirs and never as the game's own word.
     heat      how often each open interaction gets answered at all, every one of them at once, the busiest
               first. Each cell is the card it counts, so the ones players keep answering rise to the top
               and are one press away.

   Where it goes and comes from: the Suggest button's own path (worker/community.js, migration 0010). An
   answer is the same note, with the card it is about, which way it works, the name the player gave and
   where it comes from. The note's own words stay the owner's; the lean, the name and the source are what
   the card shows.

   What the builder and the bench read from here:
     open()             every open interaction, as the index holds them
     openIn(text)       the open ones a piece of the game's own wording names, so a range that depends on
                        one is widened and the interaction is named rather than a number being invented
     assume(key, how)   carry on as if it works ('works') or as if it does not ('no'), for the visit
     assumption(key)    what this card is being carried on as, '' where the player has said nothing
     assumptions()      all of them at once, for a set of numbers to be worked out against
     reported(key)      what players have said about one, asked for once a visit */
import { D, esc, openDetail, hrefOf, ago, openBox } from './app.js';
import * as marks from './marks.js';

const KIND = 'q';                    // an interaction card (assets/kinds.js, tools/interactions.py)
const API = 'api/suggest';           // the Suggest button's own path: one way in, one table behind it
const WORD = {works: 'It works', no: 'It does not', unclear: 'Still unclear'};
const SIDES = ['works', 'no', 'unclear'];
const PROBE = {k: '', id: '', kw: []};   // a card of no kind: what a line names, whatever card it sits on

/* ---------- what players have said ---------- */
const HAD = new Map();               // card key -> the last answer the site gave for it
const ASKED = new Map();             // ...and the call that is fetching it, so one visit asks once
const BOXES = new Set();             // the boxes on show, so a fresh answer redraws them where they stand
const OPENED = new Set();            // the cards whose form is open, for as long as the card is
const AS = new Map();                // card key -> how the player is carrying on: 'works' or 'no'

export const reported = key => HAD.get(key) || null;

function ask(key){
  if(ASKED.has(key)) return ASKED.get(key);
  const p = fetch(API + '?card=' + encodeURIComponent(key))
    .then(r => r.ok ? r.json() : null)
    .then(j => { if(j && j.lean) HAD.set(key, j); return j; })
    .catch(() => null);
  ASKED.set(key, p);
  return p;
}

/* ---------- the builder's and the bench's own hooks ---------- */
export const open = () => ((D.index && D.index.items) || []).filter(it => it.k === KIND)
  .map(it => ({key: it.k + ':' + it.id, name: it.n, family: it.s || ''}));

export function openIn(text){
  const out = [];
  for(const [, , key] of marks.scan(PROBE, String(text || ''), null))
    if(key[0] === KIND && !out.includes(key)) out.push(key);
  return out;
}

export const assumption = key => AS.get(key) || '';
export const assumptions = () => Object.fromEntries(AS);
export function assume(key, how){
  if(how === 'works' || how === 'no') AS.set(key, how); else AS.delete(key);
  for(const box of [...BOXES]) draw(box);
  return assumption(key);
}

/* ---------- the two fields ---------- */
export function fill(host, it, f, o){
  if(!host) return;
  const box = {host, it, f, key: it.k + ':' + it.id};
  BOXES.add(box);
  host.addEventListener('click', e => click(e, box));
  host.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.matches('input.field')) send(box); });
  draw(box);
  ask(box.key).then(() => draw(box), () => {});
}

function draw(box){
  if(!box.host.isConnected){ BOXES.delete(box); return; }
  const r = HAD.get(box.key);
  box.host.innerHTML = box.f.type === 'heat' ? heatHTML(box.key, r) : playersHTML(box.key, r);
}

/* ---------- which way it leans, and who weighed in ---------- */
function bars(lean, n){
  return '<ul class="clar-lean">' + SIDES.map(s => {
    const v = lean[s] || 0;
    return '<li class="cl-' + s + '"><span class="clar-bar" style="--w:' + (n ? Math.round(v / n * 100) : 0) +
      '%"></span><span class="clar-w">' + esc(WORD[s]) + '</span><b>' + v + '</b></li>';
  }).join('') + '</ul>';
}

function whoRow(w){
  const said = [w.src ? w.src : '', w.at ? ago(w.at) : ''].filter(Boolean).join(' · ');
  return '<li><b>' + esc(w.who || 'No name') + '</b><span class="clar-said">' + esc(WORD[w.lean] || '') +
    (said ? ' · ' + esc(said) : '') + '</span>' +
    (w.ours ? '<span class="clar-ours">Checked by us</span>' : '') + '</li>';
}

function playersHTML(key, r){
  const lean = (r && r.lean) || {}, n = (r && r.n) || 0, who = (r && r.who) || [];
  return '<p class="card-facts">What players report</p>' +
    (n ? bars(lean, n) : '<p class="clar-none">No answers yet.</p>') +
    (who.length ? '<ul class="clar-who">' + who.map(whoRow).join('') + '</ul>' +
      '<p class="clar-mine">Players’ own words, not the game’s.</p>' : '') +
    (OPENED.has(key) ? formHTML() : '<div class="clar-go"><button type="button" class="btn clar-say">' +
      'Weigh in</button></div>') +
    asIfHTML(key);
}

function asIfHTML(key){
  const at = AS.get(key) || '';
  return '<p class="clar-as">Carry on as if' + ['works', 'no'].map(s =>
    '<button type="button" class="chip clar-asb" data-as="' + s + '" aria-pressed="' + (at === s) + '">' +
    esc(WORD[s]) + '</button>').join('') + '</p>';
}

function formHTML(){
  return '<div class="clar-form">' +
    '<p class="clar-q">Which way does it work?</p>' +
    '<div class="clar-pick">' + SIDES.map(s =>
      '<button type="button" class="chip clar-side" data-side="' + s + '" aria-pressed="false">' +
      esc(WORD[s]) + '</button>').join('') + '</div>' +
    '<input class="field clar-src" maxlength="80" aria-label="Where it comes from" ' +
      'placeholder="Where it comes from — your own testing, or a source you name">' +
    '<input class="field clar-who" maxlength="24" aria-label="Your name" placeholder="A name to put on it">' +
    '<textarea class="field clar-note" maxlength="500" rows="3" aria-label="What you found" ' +
      'placeholder="What you found. The owner reads this one."></textarea>' +
    '<div class="clar-go"><button type="button" class="btn gold clar-send">Send</button>' +
    '<span class="clar-msg" aria-live="polite"></span></div></div>';
}

/* ---------- how often each one gets answered ---------- */
function heatHTML(key, r){
  const cards = ((D.index && D.index.items) || []).filter(it => it.k === KIND);
  if(!cards.length) return '';
  const count = new Map((r && r.heat) || []);
  const rows = cards.map(it => ({it, key: it.k + ':' + it.id, n: count.get(it.k + ':' + it.id) || 0}))
    .sort((a, b) => b.n - a.n || a.it.n.localeCompare(b.it.n));
  const top = Math.max(1, ...rows.map(x => x.n)), all = rows.reduce((a, x) => a + x.n, 0);
  return '<p class="card-facts">How often each one is answered</p>' +
    '<ul class="clar-heat">' + rows.map(x =>
      '<li><button type="button" class="clar-cell' + (x.key === key ? ' here' : '') + '" data-open="' +
      esc(x.key) + '" style="--lit:' + (x.n / top).toFixed(3) + '"><span>' + esc(x.it.n) + '</span>' +
      '<b>' + x.n + '</b></button></li>').join('') + '</ul>' +
    '<p class="clar-mine">' + all + (all === 1 ? ' answer' : ' answers') + ' over ' + rows.length +
    ' open interactions.</p>';
}

/* ---------- the controls ---------- */
function click(e, box){
  const t = e.target;
  const cell = t.closest('.clar-cell');
  if(cell){
    const c = D.byKey.get(cell.dataset.open);
    if(c) openDetail(c, {nested: true}, hrefOf(c));
    return;
  }
  const as = t.closest('.clar-asb');
  if(as){ assume(box.key, AS.get(box.key) === as.dataset.as ? '' : as.dataset.as); return; }
  if(t.closest('.clar-say')){ OPENED.add(box.key); draw(box); focusIn(box); return; }
  const side = t.closest('.clar-side');
  if(side){
    for(const b of box.host.querySelectorAll('.clar-side')) b.setAttribute('aria-pressed', String(b === side));
    return;
  }
  if(t.closest('.clar-send')) send(box);
}

function focusIn(box){
  const f = box.host.querySelector('.clar-side');
  if(f) setTimeout(() => f.focus(), 30);
}

const val = (box, sel) => (box.host.querySelector(sel) || {}).value || '';

async function send(box){
  const msg = box.host.querySelector('.clar-msg'), go = box.host.querySelector('.clar-send');
  const picked = box.host.querySelector('.clar-side[aria-pressed="true"]');
  if(!msg || !go) return;
  if(!picked){ msg.textContent = 'No side picked.'; return; }
  go.disabled = true;
  msg.textContent = 'Sending…';
  let r = null;
  try {
    r = await fetch(API, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-WI': '1'},
      body: JSON.stringify({card: box.key, lean: picked.dataset.side, src: val(box, '.clar-src').trim(),
        who: val(box, '.clar-who').trim(), text: val(box, '.clar-note').trim(),
        page: location.pathname + location.hash.split('?')[0]})});
  } catch { r = null; }
  if(r && r.ok){
    const j = await r.json().catch(() => null);
    if(j && j.lean) HAD.set(box.key, j);
    OPENED.delete(box.key);
    for(const b of [...BOXES]) draw(b);
    return;
  }
  go.disabled = false;
  msg.textContent = r && r.status === 429 ? 'That is a lot of answers. Try again later.' : 'Could not send. Try again later.';
}

/* The same two fields on their own, for a page that is not a card: the open interactions and what players
   report about one, in a box. Nothing on the site opens this yet; the builder's own panel is where it goes. */
export function openReport(key){
  const it = D.byKey.get(key);
  if(!it) return;
  const box = document.createElement('section');
  box.className = 'panel';
  box.innerHTML = '<h3>' + esc(it.n) + '</h3>';
  const host = document.createElement('div');
  box.appendChild(host);
  openBox(box, it.n);
  fill(host, it, {type: 'players'}, {full: true});
}
