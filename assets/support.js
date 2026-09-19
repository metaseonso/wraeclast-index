/* Support: a small "Support the site" link (footer, Patch notes and Suggest popups) that opens a popup with
   the Ko-fi page and crypto addresses from data/support.json. Nothing shows until that file has something. */
import { openBox, esc } from './app.js';

let CFG;
export async function support(){
  if(CFG === undefined){
    try { CFG = await (await fetch('data/support.json')).json(); } catch { CFG = null; }
    if(CFG && !CFG.kofi && !(CFG.crypto || []).length) CFG = null;
  }
  return CFG;
}
export const supportLink = () => '<button type="button" class="linkbtn support-open">Support the site ♥</button>';

export async function mountSupport(){
  if(!(await support())) return;
  const foot = document.getElementById('foot');
  if(foot && !foot.querySelector('.support-open')) foot.insertAdjacentHTML('beforeend', ' ' + supportLink());
  document.addEventListener('click', e => { if(e.target.closest('.support-open')) openSupport(); });
}

export async function openSupport(){
  const c = await support();
  if(!c) return;
  const box = document.createElement('section');
  box.className = 'supportbox panel';
  box.innerHTML = '<h3>Support Wraeclast Index</h3>' +
    '<p class="note">Free for everyone. Tips keep it running.</p>' +
    (c.kofi ? '<p><a class="btn gold" href="' + esc(c.kofi) + '" target="_blank" rel="noopener">Tip on Ko-fi ↗</a></p>' : '') +
    ((c.crypto || []).length ? '<h4>Crypto</h4><div class="sup-coins">' + c.crypto.map(x =>
      '<div class="sup-coin"><b>' + esc(x.coin) + '</b><code>' + esc(x.address) + '</code>' +
      '<button type="button" class="btn sup-copy" data-a="' + esc(x.address) + '">Copy</button></div>').join('') + '</div>' +
      '<p class="note">Check the address after you paste it.</p>' : '');
  box.addEventListener('click', e => {
    const b = e.target.closest('.sup-copy'); if(!b) return;
    navigator.clipboard && navigator.clipboard.writeText(b.dataset.a).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy', 1400); });
  });
  openBox(box, 'Support');
}
