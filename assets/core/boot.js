import { SHUT, FRAME } from '../kinds.js';
import { MON, NOW, wake, MAN, LANG, LANG_KEY, searching } from '../core/data.js';
import { esc, $ } from '../core/html.js';
import { ago } from '../core/format.js';
import { MODE, PLAY, MODE_KEY } from '../core/store.js';
import { homeInit } from '../pages/home.js';
import { mountTopSearch, fillCounts } from '../ui/topsearch.js';
import { show } from '../core/router.js';
import { lazy } from '../core/lazy.js';

/* ---------- boot ----------
   The drill-down page imports this module for the top search and the popup only. */
/* A tab the table has shut is not offered anywhere it is linked from — the app's nav and the drill-down
   page's own links alike. Both are written out already without it, so this is the belt on the braces: the
   day a page is shut, no stale copy of a nav can offer it. */
for(const r in SHUT) document.querySelectorAll('nav a[href$="#/' + r + '"]').forEach(a => a.remove());

const IS_APP = !!document.getElementById('view-home');
/* the price stamp in the top bar, on the app and the drill-down page alike: the real age of the data behind the
   prices (worker/prices.js), and a word when a job has missed a run. The last good copy (NOW) says the day and
   hour it is from, and that live prices are paused. */
const STAMP = document.getElementById('stamp');
const stampTime = iso => { const d = new Date(iso); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' +
  String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC'; };
if(STAMP) NOW.then(M => {
  STAMP.classList.remove('wait');
  if(M && M.updated && M.paused){
    STAMP.title = 'Prices: ' + M.league + ' · from ' + stampTime(M.updated) + ' · live prices paused';
    STAMP.innerHTML = 'Prices from ' + esc(stampTime(M.updated)) + ' · <span class="err">live prices paused</span>';
    return;
  }
  // the league and its dot are the part a tight row drops (assets/cards.css .stamp-lg); the mode's switch in front
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
  // under ☰ where the bar has no room for it: the stamp is gone (under 900px), or the index's whole row has just come
  // into the bar and the stamp is already down to nothing (1280 to 1379px, assets/cards.css)
  const tight = matchMedia('(max-width:899px), (min-width:1280px) and (max-width:1379px)');
  const place = () => {
    const more = document.getElementById('topmore');
    if(tight.matches && more) more.appendChild(sw); else STAMP.before(sw);
  };
  place();
  tight.addEventListener('change', place);
}
if(IS_APP){
homeInit();
mountTopSearch(document.getElementById('topsearch'));
addEventListener('hashchange', show);
show();
const failed = err => { $('#status').innerHTML = '<span class="err">Could not load the index: ' + esc(err.message) + '</span>'; };
NOW.then(M => {
  lazy('./league.js').then(m => m.mountLeague($('#leagueclock'))).catch(() => {});   // the league clock
  later();   // the crest's fog, once the stamp is in
  // a player who has not reached for search yet: the search comes in while the page sits idle
  setTimeout(() => idle(wake), 3000);
});
MAN.then(man => {
  // the client build (4.5.5.2) as players know it: patch 0.5.5
  fillCounts(man);
  $('#gamever').textContent = (man.v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');
  // the languages the manifest names, into the footer's switch; a pick is kept in this browser and the page opens again in it
  const pick = $('#langpick');
  if(pick && man.lang){
    for(const [code, e] of Object.entries(man.lang)) if(e && e.name) pick.add(new Option(e.name, code));
    if(LANG && man.lang[LANG]) pick.value = LANG;
    pick.addEventListener('change', () => {
      try { if(pick.value) localStorage.setItem(LANG_KEY, pick.value); else localStorage.removeItem(LANG_KEY); } catch {}
      location.reload();
    });
  }
}).catch(failed);
searching.then(() => {
  // once this page is idle: the service worker (repeat visits paint from this browser's copy, and it keeps a copy of
  // the drill-down page, so Gems / Uniques / Passive tree open fast); without one, fetch the drill-down page ahead
  idle(() => {
    if(registerSW()) return;
    const l = document.createElement('link'); l.rel = 'prefetch'; l.href = 'explore'; document.head.appendChild(l);
  });
}).catch(failed);
}

/* ---------- after the first paint ----------
   Decoration that must never hold up the page: the fog and wisps (index.html and explore.html give them data-src,
   the fog a data-srcset too).
   Each fog layer fades in once its images are in, so the drifting starts smooth; a wisp starts its loop when loaded.
   A weak machine (html.lite, set in the page's <head>) draws no fog, so its images are never fetched. The fog holds
   still once the crest is scrolled off (.hero.away, theme.css). */
function idle(f){ (window.requestIdleCallback || (g => setTimeout(g, 1200)))(f, {timeout: 4000}); }
export function later(){
  const lite = document.documentElement.classList.contains('lite');
  // a first visit to a search: the answer before the fog (the search rows share the line on a phone, #117)
  const wait = document.getElementById('view-home') && /^#\/\?(.*&)?q=[^&]/.test(location.hash)
    ? Promise.race([searching, new Promise(r => setTimeout(r, 8000))]).catch(() => {}) : Promise.resolve();
  wait.then(() => requestAnimationFrame(() => setTimeout(() => {
    for(const img of document.querySelectorAll('img[data-src]')){
      const box = img.closest('.fog') || img;
      if(lite && box !== img) continue;
      img.addEventListener('load', () => {
        img.classList.add('on');
        if(box !== img && [...box.querySelectorAll('img')].every(x => x.classList.contains('on'))) box.classList.add('on');
      }, {once: true});
      if(img.dataset.srcset){ img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
      img.src = img.dataset.src; img.removeAttribute('data-src');
    }
    const hero = document.getElementById('hero'), crest = hero && hero.querySelector('.emblem');
    if(crest && !lite) new IntersectionObserver(es => hero.classList.toggle('away', !es[es.length - 1].isIntersecting)).observe(crest);
  }, 0)));
}
/* The service worker (sw.js): not on the backup site (GitHub Pages serves sw.js unstamped) or inside a frame. */
export function registerSW(){
  if(!('serviceWorker' in navigator) || /\.github\.io$/.test(location.hostname) || window.top !== window) return false;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  return true;
}

export { IS_APP, idle };
