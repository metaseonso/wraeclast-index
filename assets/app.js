/* Wraeclast Index: the boot. The shell is assets/core/ (the store, the data, the router), the card is assets/frame/,
   the bar's pieces are assets/ui/ and every tab is a page in assets/pages/ (docs/framework.md). This file only starts
   them: the bar's stamp, then on the app the search page, the top search and the router. Every module imports what
   it uses from where it lives; nothing goes through here. */
import { SHUT } from './kinds.js';
import { NOW, wake, MAN, LANG, LANG_KEY, searching } from './core/data.js';
import { $, esc, idle, IS_APP } from './core/html.js';
import { lazy } from './core/lazy.js';
import { start } from './core/router.js';
import { registerSW } from './core/sw.js';
import { popup } from './frame/seam.js';
import * as home from './pages/home.js';
import { mountTopSearch, fillCounts } from './ui/topsearch.js';
import { mountStamp } from './ui/stamp.js';
import { later } from './ui/crest.js';

/* A tab the table has shut is not offered anywhere it is linked from — the app's nav and the drill-down
   page's own links alike. Both are written out already without it, so this is the belt on the braces: the
   day a page is shut, no stale copy of a nav can offer it. */
for(const r in SHUT) document.querySelectorAll('nav a[href$="#/' + r + '"]').forEach(a => a.remove());
mountStamp();

if(IS_APP){
  home.homeInit();
  mountTopSearch(document.getElementById('topsearch'));
  start(home);
  const failed = err => { $('#status').innerHTML = '<span class="err">Could not load the index: ' + esc(err.message) + '</span>'; };
  NOW.then(() => {
    lazy('./ui/league.js').then(m => m.mountLeague($('#leagueclock'))).catch(() => {});   // the league clock
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
    // once this page is idle: the popup, so the first card opens without a wait; then the service worker (repeat
    // visits paint from this browser's copy, and it keeps a copy of the drill-down page, so Gems / Uniques / Passive
    // tree open fast); without one, fetch the drill-down page ahead
    idle(() => {
      popup().catch(() => {});
      if(registerSW()) return;
      const l = document.createElement('link'); l.rel = 'prefetch'; l.href = 'explore'; document.head.appendChild(l);
    });
  }).catch(failed);
}
