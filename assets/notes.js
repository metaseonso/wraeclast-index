/* Patch notes: one button in the top bar of every page, one list (data/changelog.json: newest first),
   plus a link to the official game patch notes. The drill-down page's own button opens the same list. */
import { openBox, esc } from './app.js';

const GAME = 'https://www.pathofexile.com/forum/view-forum/2212';
let LOG = null;
async function load(){
  if(!LOG){
    try { LOG = await (await fetch('data/changelog.json')).json(); } catch { LOG = []; }
  }
  return LOG;
}
const label = log => 'Patch notes' + (log[0] ? ' <span class="ct">v' + esc(log[0].v) + '</span>' : '');

export async function mountNotes(){
  const log = await load();
  let b = document.getElementById('clbtn');   // the drill-down page's button: same list
  if(b){
    b.innerHTML = label(log);
    b.addEventListener('click', e => { e.stopImmediatePropagation(); e.preventDefault(); open(); }, true);
    return;
  }
  if(document.getElementById('notesbtn')) return;
  b = document.createElement('button');
  b.id = 'notesbtn'; b.type = 'button'; b.className = 'notesbtn';
  b.innerHTML = label(log);
  b.addEventListener('click', open);
  const next = document.getElementById('suggestbtn') || document.getElementById('keysbtn');
  if(next) next.before(b);
}

async function open(){
  const log = await load();
  const box = document.createElement('section');
  box.className = 'notes panel';
  box.innerHTML = '<h3>Patch notes</h3>' +
    '<p class="note">What changed on Wraeclast Index. <a href="' + GAME + '" target="_blank" rel="noopener">Game patch notes ↗</a></p>' +
    log.map(e => '<article class="notes-v"><h4><span class="notes-ver">v' + esc(e.v) + '</span> ' + esc(e.title) +
      ' <span class="note">' + esc(e.date) + '</span></h4><ul>' + (e.items || []).map(i => '<li>' + i + '</li>').join('') + '</ul></article>').join('');
  try { const s = await import('./support.js'); if(await s.support()) box.insertAdjacentHTML('beforeend', '<p class="notes-sup">' + s.supportLink() + '</p>'); } catch {}
  openBox(box, 'Patch notes');
}
