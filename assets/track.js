/* Page views and clicks for the owner's dashboard (worker/dash.js, admin.html).
   Counted on our own database only: no cookies, no address, nothing anyone types.
   What is sent: the page, how the visit arrived (the other site's name, or "direct"), phone/tablet/desktop,
   what was clicked (a tab, a button's words, "card:gem", the host of a link out) and where on the page.
   Nothing is sent when the browser asks not to be tracked (Do Not Track or Global Privacy Control). */
import {ROUTES, SECTIONS, KIND} from './kinds.js';   // the pages and the kinds, from the one table the site reads
const URL_T = 'api/t';
const CAP = {v: 50, c: 200, h: 200};
const SEP = '\u0001';

function off(){
  const n = navigator;
  if(n.doNotTrack === '1' || window.doNotTrack === '1' || n.msDoNotTrack === '1' || n.globalPrivacyControl === true) return true;
  if(n.webdriver) return true;                                   // robots and test browsers
  if(/(^|\.)github\.io$/.test(location.hostname)) return true;   // the backup copy has no worker
  try { if(window.top !== window.self) return true; } catch { return true; }   // inside a frame (the dashboard's heatmap)
  try { if(localStorage.getItem('wi-notrack') === '1') return true; } catch {}   // the owner's own browser
  return false;
}

export function routeOf(loc = location){
  if(/\/explore(\.html)?$/.test(loc.pathname)){
    const sec = (loc.hash.match(/^#(\w+)/) || [])[1];
    return 'explore-' + (SECTIONS[sec] ? sec : Object.keys(SECTIONS)[0]);
  }
  const m = loc.hash.match(/^#\/(\w+)/);
  return m && ROUTES[m[1]] ? m[1] : 'home';
}
const device = () => innerWidth < 640 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop';

/* how this page load arrived: a tagged link, another site, or straight in */
function arrival(){
  const utm = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  if(utm) return 'utm:' + utm;
  let host = '';
  try { host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
  if(!host) return 'direct';
  return host === location.hostname.replace(/^www\./, '') ? 'site' : host.slice(0, 60);
}

/* ---------- what was clicked: a fixed label, never typed text ---------- */
const clip = s => String(s || '').replace(/[\u2190-\u21ff\u2600-\u27bf\u00d7]/g, '').replace(/\s+/g, ' ').trim().slice(0, 30).trim();
function words(el){   // the element's own words, without counts, icons or key hints
  const c = el.cloneNode(true);
  c.querySelectorAll('.ct, svg, kbd, img, small, .card-ic').forEach(x => x.remove());
  let w = clip(c.textContent);
  if(!/[a-z0-9]/i.test(w)) w = clip(el.getAttribute('aria-label') || el.getAttribute('title') || '');
  return w;
}
const typedText = () => [...document.querySelectorAll('input:not([type]), input[type=text], input[type=search], textarea')]
  .map(i => (i.value || '').trim().toLowerCase()).filter(v => v.length >= 4);
export function labelOf(t){
  if(t.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return null;
  const own = t.closest('[data-track]');
  if(own) return clip(own.dataset.track);
  const pop = t.closest('.ov-box') ? 'popup:' : '';
  const a = t.closest('a[href]');
  if(a){
    let u = null; try { u = new URL(a.href, location.href); } catch {}
    if(u && /^https?:$/.test(u.protocol) && u.host !== location.host) return 'out:' + u.hostname.replace(/^www\./, '');
  }
  const tab = t.closest('.tabs a');
  if(tab) return 'tab:' + words(tab);
  const sec = t.closest('#nav button');
  if(sec) return 'section:' + words(sec);
  if(t.closest('.tsearch-row')) return pop + 'search:result';
  if(t.closest('[data-pop]')) return 'chip:popular search';
  if(t.closest('.fm-row')) return pop + 'farm:item';
  if(t.closest('.kw')) return pop + 'keyword';
  const th = t.closest('thead th');
  if(th) return 'sort:' + words(th);
  const card = t.closest('.card:not(.detail)');
  const ctl = t.closest('button, a[href], [role="button"], summary, label, .chip');
  if(card && (!ctl || !card.contains(ctl) || ctl.matches('.card-link'))) return pop + 'card:' + (card.classList.contains('fm') ? 'farm' :
    ((KIND[(card.className.match(/\bk-(\w)\b/) || [])[1]] || {}).one || 'other').toLowerCase());
  if(ctl){
    const w = words(ctl);
    if(!w) return null;
    if(pop) return 'popup:' + w;
    return (ctl.matches('.chip') ? 'chip:' : ctl.matches('a') ? 'link:' : ctl.matches('summary') ? 'open:' : ctl.matches('label') ? 'tick:' : 'btn:') + w;
  }
  if(t.closest('tbody tr')) return pop + 'row';
  return null;
}

/* ---------- the batch ---------- */
const Q = {v: [], c: new Map(), h: new Map()};
const pending = () => Q.v.length || Q.c.size || Q.h.size;
function send(){
  if(!pending()) return;
  const body = JSON.stringify({v: Q.v, c: [...Q.c].map(([k, n]) => [...k.split(SEP), n]),
    h: [...Q.h].map(([k, n]) => { const p = k.split(SEP); return [p[0], p[1], +p[2], +p[3], n]; })});
  Q.v = []; Q.c.clear(); Q.h.clear();
  let sent = false;
  try { sent = !!navigator.sendBeacon && navigator.sendBeacon(URL_T, new Blob([body], {type: 'text/plain'})); } catch {}
  if(!sent) fetch(URL_T, {method: 'POST', body, keepalive: true, headers: {'Content-Type': 'text/plain', 'X-WI': '1'}}).catch(() => {});
}
const full = () => Q.v.length >= CAP.v || Q.c.size >= CAP.c || Q.h.size >= CAP.h;
function bump(map, key){
  map.set(key, (map.get(key) || 0) + 1);
  if(map.get(key) >= 50 || full()) send();
}

let last = null;
function view(src){
  const r = routeOf();
  if(r === last) return;
  last = r;
  Q.v.push([r, src, device()]);
  if(full()) send();
}

function click(e){
  if(!e.isTrusted || !(e.target instanceof Element)) return;
  const t = e.target, r = routeOf();
  let l = labelOf(t);
  if(l){
    const low = l.toLowerCase();   // a button's words never echo what someone typed
    if(/^(btn|link|chip|popup|open|tick):/.test(l) && typedText().some(v => low.includes(v))) l = l.split(':')[0];
    bump(Q.c, r + SEP + l);
  }
  // where on the page: across as 2% steps of the width, down in 20 px steps of the page (first 6000 px).
  // Popups float over the page, and keyboard presses have no spot.
  if((e.clientX || e.clientY) && !t.closest('.ov, [role="dialog"], [aria-modal="true"], aside.panel')){
    const y = t.closest('header.top, .mast') ? e.clientY : e.clientY + scrollY;   // the top bar stays put while the page scrolls
    if(y >= 0 && y < 6000) bump(Q.h, [r, device(), Math.min(49, Math.max(0, Math.floor(e.clientX / innerWidth * 50))), Math.floor(y / 20)].join(SEP));
  }
  setTimeout(() => view('site'), 60);   // the drill-down's section buttons change the address without a hashchange
}

export function mountTrack(){
  if(window.__wiTrack || off()) return;
  window.__wiTrack = true;
  view(arrival());
  addEventListener('hashchange', () => view('site'));
  addEventListener('popstate', () => setTimeout(() => view('site'), 0));
  document.addEventListener('click', click, true);   // before the page acts on it: the page and layout as they were clicked
  addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') send(); });
  addEventListener('pagehide', send);
  setInterval(() => { if(pending()) send(); }, 30000);
}
