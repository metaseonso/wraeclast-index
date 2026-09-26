/* The league clock in the top bar of the home page: the current league and how long it has run, and a live
   countdown to the next one (data/leagues.json, from poe2db's league list, refreshed hourly by
   tools/leagues.py). poe2db gives dates only, so both clocks count from the start of that day (UTC). */
import { D, esc, leagues } from './app.js';

const when = iso => Date.parse(iso + 'T00:00:00Z');
const nice = iso => new Date(when(iso)).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});
const two = n => String(n).padStart(2, '0');
function span(ms){
  const s = Math.max(0, Math.floor(ms / 1000));
  return Math.floor(s / 86400) + 'd ' + two(Math.floor(s / 3600) % 24) + 'h ' + two(Math.floor(s / 60) % 60) + 'm ' + two(s % 60) + 's';
}

export async function mountLeague(el){
  const data = await leagues();   // the one copy the page reads (assets/app.js)
  if(!data) return;
  const list = (data && data.leagues) || [];
  const now = Date.now();
  const started = list.filter(l => when(l.start) <= now).sort((a, b) => b.start.localeCompare(a.start));
  const cur = (D.market && started.find(l => l.name === D.market.league)) || started[0];
  const next = list.filter(l => when(l.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  if(!cur) return;
  const nextName = next ? (next.name === 'Release' ? 'PoE 2 ' + next.v : next.name) : '';
  el.innerHTML = '<b>' + esc(cur.name) + '</b> ' + esc(cur.v) + ' · running <span class="lc-up"></span>' +
    (next ? '<span class="lc-sep">|</span><b>' + esc(nextName) + '</b> in <span class="lc-down"></span>' : '<span class="lc-sep">|</span>next league not announced');
  el.title = 'Started ' + nice(cur.start) + (next ? '. ' + nextName + ' on ' + nice(next.start) : '') +
    '. Dates from poe2db; clocks count from the start of the day (UTC).';
  const up = el.querySelector('.lc-up'), down = el.querySelector('.lc-down');
  const tick = () => {
    const t = Date.now();
    up.textContent = span(t - when(cur.start));
    if(down) down.textContent = span(when(next.start) - t);
  };
  /* The clocks sit on the home page, so they tick only while it is the page on screen: a hidden browser tab or
     any other page of the site stops them, and they catch up to the second the moment they are seen again. */
  let timer = 0;
  const run = () => {
    const on = !document.hidden && (document.body.dataset.route || 'home') === 'home';
    if(on && !timer){ tick(); timer = setInterval(tick, 1000); }
    else if(!on && timer){ clearInterval(timer); timer = 0; }
  };
  document.addEventListener('visibilitychange', run);
  addEventListener('hashchange', run);   // the router has already marked the new page by now (assets/app.js show)
  run();
  el.hidden = false;
}
