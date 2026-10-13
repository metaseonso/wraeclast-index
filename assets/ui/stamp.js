import { FRAME } from '../kinds.js';
import { MON, NOW } from '../core/data.js';
import { esc } from '../core/html.js';
import { ago } from '../core/format.js';
import { MODE, PLAY, MODE_KEY } from '../core/store.js';
import { narrow } from '../core/screen.js';

/* ---------- the stamp and the play mode in the top bar ----------
   Mounted once by assets/app.js on every page with the bar: the app and the drill-down page. */
export function mountStamp(){
const STAMP = document.getElementById('stamp');
/* the price stamp in the top bar, on the app and the drill-down page alike: the real age of the data behind the
   prices (worker/prices.js), and a word when a job has missed a run. The last good copy (NOW) says the day and
   hour it is from, and that live prices are paused. */
const stampTime = iso => { const d = new Date(iso); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' +
  String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC'; };
if(STAMP) NOW.then(M => {
  STAMP.classList.remove('wait');
  if(M && M.updated && M.paused){
    STAMP.title = 'Prices: ' + M.league + ' · from ' + stampTime(M.updated) + ' · live prices paused';
    STAMP.innerHTML = 'Prices from ' + esc(stampTime(M.updated)) + ' · <span class="err">live prices paused</span>';
    return;
  }
  // the league and its dot are the part a tight row drops (assets/css/components/ .stamp-lg); the mode's switch in front
  // of it is the stamp's word for what the prices are (below)
  if(M && M.updated) STAMP.title = 'Prices: ' + M.league + ' · ' + ago(M.updated);
  if(M && M.updated) STAMP.innerHTML = '<b class="stamp-lg">' + esc(M.league) + '</b><span class="stamp-lg"> · </span>' + ago(M.updated) +
    (M.late ? ' · <span class="err">waiting for new prices</span>' : '');
  else STAMP.textContent = 'Prices not loaded yet';
});
/* The play mode's switch (FRAME.modes): the stamp's first word, so the bar gives it little more room than the
   stamp had, and under ☰ where the bar has no room left. A mode with no prices has no stamp, only the switch. A pick
   is kept in this browser and the page is drawn again under it. */
/* each mode's mark, drawn in the bar's own 16px stroke: the exchange's two arrows, a lone shield, a cracked heart,
   and the shield cracked */
const MODE_MARK = {
  trade: '<path d="M3 5.5h9.5L10 3M13 10.5H3.5L6 13"/>',
  ssf:   '<path d="M8 1.8 13 3.6v4c0 3-2.2 5.2-5 6.6-2.8-1.4-5-3.6-5-6.6v-4z"/>',
  hc:    '<path d="M8 13.6S2.4 10 2.4 6.1A2.8 2.8 0 0 1 8 4.5a2.8 2.8 0 0 1 5.6 1.6C13.6 10 8 13.6 8 13.6z"/><path d="M8.4 4.6 7.2 7.6l2 1-1.1 3"/>',
  hcssf: '<path d="M8 1.8 13 3.6v4c0 3-2.2 5.2-5 6.6-2.8-1.4-5-3.6-5-6.6v-4z"/><path d="M8.4 3.4 7.2 6.8l2 1-1.1 3.6"/>',
};
if(STAMP){
  // a plate in the chips' own rim with the mode's mark and word; the browser's own list opens from the select
  // laid over it, so a phone gets its native picker and a keyboard its arrows
  const sw = document.createElement('label');
  sw.className = 'modesw';
  sw.dataset.mode = MODE;
  sw.innerHTML = '<svg class="modesw-ic" viewBox="0 0 16 16" aria-hidden="true">' + (MODE_MARK[MODE] || '') + '</svg>' +
    '<span class="modesw-is">' + esc(PLAY.is) + '</span>' +
    '<svg class="modesw-c" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5"/></svg>' +
    '<select aria-label="Play mode">' + Object.entries(FRAME.modes).map(([k, m]) =>
      '<option value="' + k + '"' + (k === MODE ? ' selected' : '') + '>' + esc(m.is) + '</option>').join('') + '</select>';
  const pick = sw.querySelector('select');
  pick.addEventListener('change', () => {
    try { localStorage.setItem(MODE_KEY, pick.value); } catch {}
    location.reload();
  });
  // under ☰ where the bar has no room for it, read off the bar's own width as the stamp's own rule is (the container
  // "bar", css/components/topbar.css): the stamp is gone (under 860px of bar), or the index's whole row has just come
  // into the bar and the stamp is already down to nothing (under 1340px of bar, when the row is not folded)
  const bar = STAMP.closest('.top-in'), folded = narrow();
  const place = () => {
    const more = document.getElementById('topmore');
    const cs = bar && getComputedStyle(bar), w = bar ? bar.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) : innerWidth;
    const tight = w < 860 || (!folded.matches && w < 1340);
    if(tight && more){ if(sw.parentNode !== more) more.appendChild(sw); }
    else if(sw.nextSibling !== STAMP) STAMP.before(sw);
  };
  place();
  if(bar && window.ResizeObserver) new ResizeObserver(place).observe(bar); else addEventListener('resize', place);
  folded.addEventListener('change', place);
}
}
