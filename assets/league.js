/* The league clock at the top of the home page: the current league, how long it has run, and when the next
   one starts (data/leagues.json, from poe2db's league list, refreshed hourly by tools/leagues.py). */
import { D, esc } from './app.js';

const DAY = 86400e3;
const when = iso => new Date(iso + 'T00:00:00Z');
const nice = iso => when(iso).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'});

export async function mountLeague(el){
  let data;
  try { data = await (await fetch('data/leagues.json', {cache: 'no-cache'})).json(); } catch { return; }
  const list = (data && data.leagues) || [];
  const now = Date.now();
  const started = list.filter(l => when(l.start) <= now).sort((a, b) => b.start.localeCompare(a.start));
  const cur = (D.market && started.find(l => l.name === D.market.league)) || started[0];
  const next = list.filter(l => when(l.start) > now).sort((a, b) => a.start.localeCompare(b.start))[0];
  if(!cur) return;
  const day = Math.floor((now - when(cur.start)) / DAY) + 1;
  const left = next ? Math.ceil((when(next.start) - now) / DAY) : 0;
  const nextName = next ? (next.name === 'Release' ? 'Path of Exile 2 ' + next.v : next.name + ' (' + next.v + ')') : '';
  el.innerHTML = '<b>' + esc(cur.name) + '</b> · patch ' + esc(cur.v) + ' · day ' + day +
    (next ? ' <span class="lb-sep">|</span> Next: <b>' + esc(nextName) + '</b> on ' + nice(next.start) +
      ' · <b class="lb-left">' + left + (left === 1 ? ' day' : ' days') + '</b> to go'
      : ' <span class="lb-sep">|</span> Next league: not announced yet') +
    ' <a class="lb-src" href="' + esc(data.url || 'https://poe2db.tw/us/League') + '" target="_blank" rel="noopener" title="League dates from poe2db">dates: poe2db</a>';
  el.hidden = false;
}
