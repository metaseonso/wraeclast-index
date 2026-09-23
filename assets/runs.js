/* The run counter: one press a run, from anywhere, while the game has the screen.

   The first piece of the farm tracker (issue #56), and deliberately only that piece. It counts runs and says
   how fast they are going. It holds no loot, prices nothing and knows no farm, because none of that is needed
   to make a count worth having — and a count is the spine everything else bolts onto: spend per run, return
   per run, and how many runs before an average means anything all divide by this number.

   Every press keeps its own time, so the rate is measured rather than guessed and one press taken off is the
   real last one. The times are what the rest of the tracker will read when it is built.

   Kept for the tab (sessionStorage), the way pins are, with the same seam for an account later (#7): load and
   save are the two functions below and nothing else touches the store. */
import { esc, openBox } from './app.js';
import { setKey, keyLabel } from './keys.js';

const STORE = 'wi.runs';
let AT = [];              // when each run was counted, oldest first
let BTN = null, BOX = null, TICK = 0;

function load(){ try { AT = JSON.parse(sessionStorage.getItem(STORE) || '[]'); } catch { AT = []; }
                 if(!Array.isArray(AT)) AT = []; }
function save(){ try { sessionStorage.setItem(STORE, JSON.stringify(AT)); } catch {} }

const label = n => 'Runs' + (n ? ' <span class="ct">' + n + '</span>' : '');

/* How long ago, in the words the site already uses for a price's age. Under a minute is "just now": a run
   counted seconds ago has no age worth a number. */
function since(ms){
  const s = Math.round(ms / 1000);
  if(s < 60) return 'just now';
  const m = Math.round(s / 60);
  if(m < 60) return m + ' min ago';
  const h = Math.floor(m / 60);
  return h + ' h ' + (m - h * 60) + ' min ago';
}

/* The rate, and only where there is one to have. One run is not a rate — it is a run — and two runs a second
   apart are not an hour's worth either, so the span is said beside the number and never hidden behind it. */
function rateHTML(){
  if(AT.length < 2) return '';
  const span = AT[AT.length - 1] - AT[0];
  if(span < 60000) return '';
  const mins = span / 60000, per = (AT.length - 1) / (span / 3600000);
  const took = mins < 60 ? Math.round(mins) + ' min'
    : Math.floor(mins / 60) + ' h ' + Math.round(mins % 60) + ' min';
  return '<p class="run-rate"><b>' + (per >= 10 ? Math.round(per) : +per.toPrecision(2)) +
    '</b> an hour<span>' + AT.length + ' over ' + took + '</span></p>';
}

function paint(){
  if(BTN) BTN.innerHTML = label(AT.length);
  if(!BOX || !BOX.isConnected) return;
  BOX.querySelector('.run-n').textContent = AT.length.toLocaleString();
  BOX.querySelector('.run-rate-box').innerHTML = rateHTML();
  BOX.querySelector('.run-last').textContent = AT.length ? 'Last ' + since(Date.now() - AT[AT.length - 1]) : '';
  BOX.querySelector('[data-do="undo"]').disabled = !AT.length;
  BOX.querySelector('[data-do="over"]').disabled = !AT.length;
}

export function count(){
  AT.push(Date.now());
  save();
  paint();
  if(BTN){ BTN.classList.remove('hit'); void BTN.offsetWidth; BTN.classList.add('hit'); }
}

function open(){
  BOX = document.createElement('section');
  BOX.className = 'runs panel';
  BOX.innerHTML = '<h3>Runs</h3>' +
    '<p class="run-n"></p><div class="run-rate-box"></div><p class="note run-last"></p>' +
    '<div class="row run-ctl"><button type="button" class="btn gold" data-do="add">+1 run</button>' +
      '<button type="button" class="btn" data-do="undo">Take one off</button>' +
      '<button type="button" class="btn" data-do="over">Start over</button></div>' +
    '<p class="note">' + esc(keyLabel('run') || 'R') + ' counts a run from anywhere, card open or not. ' +
      'Kept for this tab.</p>';
  BOX.addEventListener('click', e => {
    const b = e.target.closest('[data-do]'); if(!b) return;
    if(b.dataset.do === 'add') return void count();
    if(b.dataset.do === 'undo'){ AT.pop(); save(); return void paint(); }
    if(b.dataset.do === 'over'){ AT = []; save(); return void paint(); }
  });
  openBox(BOX, 'Runs');
  paint();
  clearInterval(TICK);   // "Last ... ago" while the box is up, and no timer at all once it is not
  TICK = setInterval(() => { if(BOX && BOX.isConnected) paint(); else clearInterval(TICK); }, 20000);
}

export function mountRuns(){
  let b = document.getElementById('runsbtn');
  if(b && b.dataset.on) return;
  if(!b){
    b = document.createElement('button');
    b.id = 'runsbtn'; b.type = 'button'; b.className = 'runsbtn'; b.title = 'Count your runs';
    const pins = document.getElementById('pinsbtn') || document.getElementById('keysbtn');
    if(pins) pins.before(b); else document.body.appendChild(b);
  }
  BTN = b;
  b.dataset.on = '1';
  load();
  b.innerHTML = label(AT.length);
  b.addEventListener('click', open);
  setKey('run', count);   // the key is bindable like every other; this is what it does
}
