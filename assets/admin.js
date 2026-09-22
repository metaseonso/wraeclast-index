/* The owner's dashboard (admin.html). The page holds no data: everything comes from /api/admin/*,
   behind a 12-hour sign-in cookie (worker/dash.js). Charts are plain SVG, drawn to the box's own width.
   Sign in, a loading screen fills while the three parts (our own count, Cloudflare, notes) come in at
   once, then the panel opens with every tab ready. Nothing waits on anything else: a part that fails or
   takes too long only puts "failed" and a Retry in its own blocks, every block draws inside its own
   try/catch, and whatever breaks also goes in one line at the top of the page. A tab draws its blocks
   again when it opens - a pane is first filled while it is still hidden - and anything still empty says
   "No data.", so no tab can come up blank. */
import { PAGES, SECTIONS } from './kinds.js';   // what each page is called, from the one table the site reads

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => (+n || 0).toLocaleString('en');
/* nothing below may throw on a missing field, a null or a shape we did not expect */
const arr = x => Array.isArray(x) ? x : [];
const obj = x => x && typeof x === 'object' ? x : {};
const fin = v => Number.isFinite(+v) ? +v : 0;
const share = (a, b) => fin(b) > 0 ? Math.round(fin(a) / fin(b) * 100) : 0;
const NONE = '<p class="note dv-none">No data.</p>';
const WAIT = '<p class="note dv-wait">Loading…</p>';

const SEC = Object.keys(SECTIONS);
const KINDS = {direct: 'Direct', search: 'Search engines', ai: 'AI search', social: 'Social', other: 'Other sites'};
const DEVICES = {phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop'};
const WIDTH = {phone: 390, tablet: 820, desktop: 1366};   // the heatmap shows the page at this width
const EXPLORE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'explore.html' : 'explore';
const pageURL = r => r.startsWith('explore-') ? EXPLORE + '#' + r.slice(8) : './#/' + (r === 'home' ? '' : r);
const TABS = ['overview', 'visitors', 'traffic', 'clicks', 'speed', 'notes', 'jobs', 'plan'];
const S = {days: 7, tab: 'overview', data: null, cf: null, sg: null,
  clickRoute: 'all', heatRoute: 'home', heatDev: 'desktop', filter: 'new'};
try { S.tab = localStorage.getItem('wi-admin-tab') || 'overview'; } catch {}

/* ---------- the API ---------- */
async function api(path, body){
  const opt = body ? {method: 'POST', headers: {'Content-Type': 'application/json', 'X-WI': '1'}, body: JSON.stringify(body)} : {};
  const r = await fetch('api/admin/' + path, {...opt, credentials: 'same-origin', cache: 'no-store'});
  let j = null;
  try { j = await r.json(); } catch {}
  return {status: r.status, ok: r.ok, j};
}
/* a call that cannot hang: after this long it counts as failed */
function race(p, ms, why){
  return Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error(why)), ms))]);
}

/* ---------- one line at the top for anything that breaks ---------- */
function shout(msg){
  const el = $('#err');
  if(!el) return;
  el.hidden = false;
  el.innerHTML = '<b>Something broke:</b> ' + esc(String(msg == null ? 'unknown' : msg).slice(0, 300)) +
    ' <button type="button" class="linkbtn" id="errhide">Hide</button>';
}
addEventListener('error', e => { console.error(e.error || e.message); shout(e.message); });
addEventListener('unhandledrejection', e => { console.error(e.reason); shout((e.reason && e.reason.message) || e.reason); });
document.addEventListener('click', e => { if(e.target && e.target.id === 'errhide') $('#err').hidden = true; });

/* draw one block on its own: it can say nothing, and it can fail, without touching the rest of the page */
function safe(id, fn){
  const el = $(id);
  if(!el) return;
  try {
    const out = fn(el);
    if(typeof out === 'string') el.innerHTML = out || NONE;
  } catch(e){
    console.error('block ' + id, e);
    el.innerHTML = '<p class="note dv-bad">This block failed: ' + esc(String((e && e.message) || e).slice(0, 160)) + '</p>';
    shout(id + ': ' + ((e && e.message) || e));
  }
}
/* a <ul> needs its lines in <li> */
const fill = (id, html) => {
  const el = $(id);
  if(el) el.innerHTML = el.tagName === 'UL' ? '<li class="note dv-none">' + html.replace(/<\/?p[^>]*>/g, '') + '</li>' : html;
};

/* ---------- sign-in ---------- */
function showSignin(msg = ''){
  $('#dash').hidden = true; $('#boot').hidden = true; $('#range').hidden = true; $('#signout').hidden = true;
  $('#signin').hidden = false; $('#signmsg').textContent = msg;
  setTimeout(() => { const pw = $('#pw'); if(pw) pw.focus(); }, 30);
}
$('#signform').addEventListener('submit', async e => {
  e.preventDefault();
  const pw = $('#pw'), btn = $('#signform button'), msg = $('#signmsg');
  btn.disabled = true; msg.textContent = 'Checking…';
  try {
    const r = await api('login', {password: pw.value});
    if(r.ok){
      pw.value = ''; msg.textContent = '';
      try { if(localStorage.getItem('wi-notrack') === null) localStorage.setItem('wi-notrack', '1'); } catch {}
      start();
    } else msg.textContent = {401: 'Wrong password.', 429: 'Too many tries. Try again in an hour.', 503: 'Not set up yet.'}[r.status] || 'Could not sign in.';
  } catch { msg.textContent = 'Could not reach the site.'; }
  btn.disabled = false;
});
$('#signout').addEventListener('click', async () => {
  try { await api('logout', {}); } catch {}
  S.data = S.cf = S.sg = null;
  for(const k of Object.keys(ST)) ST[k] = 'idle';
  showSignin();
});
try { $('#notrack').checked = localStorage.getItem('wi-notrack') === '1'; } catch {}
$('#notrack').addEventListener('change', e => { try { localStorage.setItem('wi-notrack', e.target.checked ? '1' : '0'); } catch {} });

/* ---------- the three parts of the page, each on its own ---------- */
const PART = {
  stats: {say: 'Counting page views', wait: 'Our own count took too long.', path: () => 'stats?days=' + S.days,
    take: j => { S.data = j; }, draw: () => drawStats(),
    boxes: ['#tiles', '#chart', '#routes', '#kinds', '#sources', '#countries', '#devices', '#clicks', '#load', '#jobs', '#plan', '#searches']},
  cf: {say: 'Reading Cloudflare', wait: 'Cloudflare is slow.', path: () => 'cloudflare?days=' + S.days,
    take: j => { S.cf = j; }, draw: () => drawCloud(),
    boxes: ['#cfnotes', '#cftiles', '#cfchart', '#cfrumchart', '#cfhour', '#cfreal', '#cfwho', '#cftraffic',
      '#cfsplit', '#cfspeed', '#cfparts', '#cfserver', '#cfd1']},
  notes: {say: 'Counting notes', wait: 'The notes took too long.', path: () => 'suggestions',
    take: j => { S.sg = j; }, draw: () => drawNotes(), boxes: ['#notes']},
};
const ST = {stats: 'idle', cf: 'idle', notes: 'idle'};
let RUN = 0;   // bumped when the range changes: answers from before are dropped

const failLine = (name, msg) => '<p class="note dv-bad">' + esc(String(msg).slice(0, 140)) +
  ' <button type="button" class="btn" data-retry="' + name + '">Retry</button></p>';

async function need(name, again){
  const P = PART[name];
  if(!P) return;
  if(!again && (ST[name] === 'loading' || ST[name] === 'ok')) return;
  const run = RUN;
  ST[name] = 'loading';
  for(const id of P.boxes) fill(id, WAIT);
  step();
  let r = null, why = '';
  try { r = await race(api(P.path()), 20000, P.wait); }
  catch(e){ why = String((e && e.message) || e); }
  if(run !== RUN) return;
  if(r && (r.status === 401 || r.status === 503)) return showSignin(r.status === 503 ? 'Not set up yet.' : '');
  const bad = why || (r && r.j && r.j.error) || (!r || !r.ok || !r.j ? 'Could not load (' + ((r && r.status) || 'no answer') + ').' : '');
  if(bad){
    ST[name] = 'fail';
    for(const id of P.boxes) fill(id, failLine(name, bad));
    shout(name + ': ' + bad);
    step();
    return;
  }
  try { P.take(r.j); ST[name] = 'ok'; P.draw(); }
  catch(e){
    ST[name] = 'fail';
    console.error(name, e);
    for(const id of P.boxes) fill(id, failLine(name, (e && e.message) || 'Could not draw.'));
    shout(name + ': ' + ((e && e.message) || e));
  }
  step();
}
document.addEventListener('click', e => {
  const b = e.target && e.target.closest && e.target.closest('button[data-retry]');
  if(b) need(b.dataset.retry, true);
});

/* ---------- the loading screen: the cloud fills as the parts land ---------- */
function step(){
  const names = Object.keys(PART), done = names.filter(n => ST[n] === 'ok' || ST[n] === 'fail').length;
  const bar = $('#bootfill'), say = $('#bootsay');
  if(bar) bar.style.width = Math.round(done / names.length * 100) + '%';
  const box = $('#bootbar');
  if(box) box.setAttribute('aria-valuenow', String(Math.round(done / names.length * 100)));
  const busy = names.find(n => ST[n] === 'loading');
  if(say) say.textContent = busy ? PART[busy].say + '…' : 'Opening…';
}
let OPEN = false;
function openDash(){
  if(OPEN || !$('#signin').hidden) return;   // a part that came back "sign in" wins: no empty panel over the form
  OPEN = true;
  $('#boot').hidden = true; $('#signin').hidden = true;
  $('#dash').hidden = false; $('#range').hidden = false; $('#signout').hidden = false;
  showTab(S.tab);
}
/* sign-in done: show the cloud, ask for everything at once, open when it is in (or after 15 seconds) */
function start(){
  OPEN = false;
  $('#signin').hidden = true; $('#dash').hidden = true; $('#range').hidden = true; $('#signout').hidden = true;
  $('#boot').hidden = false;
  const bar = $('#bootfill');
  if(bar) bar.style.width = '6%';
  shell();
  RUN++;
  for(const k of Object.keys(ST)) ST[k] = 'idle';
  const all = Object.keys(PART).map(n => need(n));
  const cap = setTimeout(openDash, 15000);   // never hang: the panel opens anyway
  Promise.all(all).then(() => { clearTimeout(cap); openDash(); }, () => { clearTimeout(cap); openDash(); });
}
/* the range buttons: ask again in place, the panel stays where it is */
$('#range').addEventListener('click', e => {
  const b = e.target.closest('button[data-days]');
  if(!b || +b.dataset.days === S.days) return;
  S.days = +b.dataset.days;
  for(const c of $('#range').children) c.setAttribute('aria-pressed', String(c === b));
  RUN++;
  for(const k of Object.keys(ST)) ST[k] = 'idle';
  H.stale = true;
  for(const n of Object.keys(PART)) need(n);
  if(S.tab === 'clicks') heat();
});

/* ---------- tabs: buttons first, data later. They never wait for anything. ---------- */
/* every block a tab holds, and which part brings it in. A pane is filled once, while it is still hidden;
   opening it draws its blocks again from what is already in hand, so nothing can stay empty because of
   one write that did not land, and whatever is still empty says so. */
const TAB_BOX = {
  overview: ['#tiles', '#chart', '#routes', '#kinds', '#sources', '#cfnotes', '#cftiles', '#cfchart', '#cfrumchart'],
  visitors: ['#cfreal', '#cfwho', '#countries', '#devices'],
  traffic: ['#cfhour', '#cftraffic'],
  clicks: ['#clickpick', '#clicks', '#heatpage', '#heatdev', '#heatbox', '#searches'],
  speed: ['#cfsplit', '#cfspeed', '#cfparts'],
  notes: ['#notepick', '#notes'],
  jobs: ['#jobs', '#load'],
  plan: ['#plan', '#cfserver', '#cfd1'],
};
const TAB_PART = {overview: ['stats', 'cf'], visitors: ['stats', 'cf'], traffic: ['cf'], clicks: ['stats'],
  speed: ['cf'], notes: ['notes'], jobs: ['stats'], plan: ['stats', 'cf']};
const BOX_PART = {};   // which part each block waits on
for(const n of Object.keys(PART)) for(const id of PART[n].boxes) BOX_PART[id] = n;

function showTab(t){
  if(!TABS.includes(t)) t = 'overview';
  S.tab = t;
  const tabs = $('#tabs');
  if(tabs) for(const b of tabs.children) b.setAttribute('aria-pressed', String(b.dataset.t === t));
  for(const p of TABS){ const el = $('#t-' + p); if(el) el.hidden = p !== t; }
  try { localStorage.setItem('wi-admin-tab', t); } catch {}
  try {
    if(t === 'clicks' && (H.stale || !H.frameKey)) heat();   // the page preview only loads when it is looked at
    paint();
  } catch(e){ console.error(e); shout((e && e.message) || e); }
}
/* the tab that is open, drawn again from the answers already in hand */
function paint(){
  if($('#dash').hidden) return;
  for(const n of TAB_PART[S.tab] || []){
    if(ST[n] !== 'ok') continue;
    try { PART[n].draw(); }
    catch(e){ console.error(n, e); shout(n + ': ' + ((e && e.message) || e)); }
  }
  redraw();
}
/* charts are drawn to the box's own width, so a tab draws its own when it opens */
function redraw(){
  if($('#dash').hidden) return;
  if(S.tab === 'overview' && ST.stats === 'ok') safe('#chart', () => { viewChart(); });
  if(S.tab === 'overview' && ST.cf === 'ok'){ safe('#cfchart', () => cfChart('#cfchart', 'requests')); safe('#cfrumchart', () => cfChart('#cfrumchart', 'visits')); }
  if(S.tab === 'traffic' && ST.cf === 'ok') safe('#cfhour', () => cfHourChart());
  if(S.tab === 'jobs' && ST.stats === 'ok') safe('#load', () => loadCharts());
  if(S.tab === 'plan' && ST.cf === 'ok') safe('#cfd1', () => cfD1Chart());
  if(S.tab === 'clicks') safe('#heatbox', () => fit());
  blanks();
}
/* the last word on every drawing: a block says why it is empty, and never waits on an answer that is in */
function blanks(){
  for(const id of TAB_BOX[S.tab] || []){
    const el = $(id);
    if(!el) continue;
    const n = BOX_PART[id];
    const missed = ST[n] === 'ok' && el.querySelector('.dv-wait');   // the drawing went past this one
    if(el.innerHTML.trim() && !missed) continue;
    fill(id, ST[n] === 'loading' ? WAIT : ST[n] === 'fail' ? failLine(n, 'Could not load.') : NONE);
  }
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-t]');
  if(b) showTab(b.dataset.t);
});

/* ---------- small pieces ---------- */
const day = d => { const t = Date.parse(String(d) + 'T00:00:00Z');
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en', {month: 'short', day: 'numeric', timeZone: 'UTC'}) : String(d ?? ''); };
const hourLabel = h => { const t = Date.parse(String(h) + ':00:00Z');
  return Number.isFinite(t) ? new Date(t).toLocaleTimeString('en', {hour: '2-digit', minute: '2-digit', hour12: false}) : String(h ?? ''); };
function ago(iso){
  const t = Date.parse(iso);
  if(!Number.isFinite(t)) return '';
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if(m < 1) return 'just now';
  if(m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}
let REGION = null;
try { REGION = new Intl.DisplayNames(['en'], {type: 'region'}); } catch {}
const country = c => { const s = String(c ?? '');
  if(!s || s === 'XX') return 'Unknown';
  try { return (REGION && REGION.of(s)) || s; } catch { return s; }
};
const source = s => { const v = String(s ?? '');
  return v === 'direct' ? 'Direct' : v.startsWith('utm:') ? v.slice(4) + ' (tagged link)' : v; };
const PART_NAME = {tab: 'Tab', btn: 'Button', link: 'Link', chip: 'Chip', card: 'Card', out: 'Link out', section: 'Section',
  sort: 'Sort', open: 'Open', tick: 'Tick box', popup: 'Popup'};
function pretty(label){
  const l = String(label ?? '');
  if(l === 'search:result') return 'Search result';
  if(l === 'farm:item') return 'Farm item';
  if(l === 'row') return 'Table row';
  if(l === 'keyword') return 'Keyword';
  const i = l.indexOf(':');
  if(i < 0) return PART_NAME[l] || l || '(none)';
  const k = l.slice(0, i), rest = l.slice(i + 1);
  if(k === 'popup') return 'Popup · ' + (/^(card|search|farm|chip|out):|^(row|keyword)$/.test(rest) ? pretty(rest) : rest);
  return (PART_NAME[k] || k) + ' · ' + rest;
}
function pageName(p){
  const s = String(p ?? '');
  const e = s.match(new RegExp('explore(?:\.html)?#(' + SEC.join('|') + ')'));
  if(e) return PAGES['explore-' + e[1]];
  if(/explore/.test(s)) return PAGES['explore-' + SEC[0]];
  const m = s.match(/#\/(\w+)/);
  return (m && PAGES[m[1]]) || 'Search';
}

/* a table with a share bar behind each number, how many rows it has, and the long tail folded away */
function table(list, head, max, show = 12){
  const rows = arr(list);
  if(!rows.length) return NONE;
  const top = fin(max) || Math.max(1, ...rows.map(r => fin(r && r.n)));
  const body = rows.map((r, i) => {
    const row = obj(r), cls = [row.key ? 'dv-link' : '', i >= show ? 'dv-more' : ''].filter(Boolean).join(' ');
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + (row.key ? ' data-key="' + esc(row.key) + '" tabindex="0"' : '') +
      '><td>' + (row.html || '') + '</td><td class="n"><span class="dv-share" style="width:' +
      (fin(row.n) / (top || 1) * 100).toFixed(1) + '%"></span><b>' + num(row.n) + '</b></td></tr>';
  }).join('');
  return '<div class="dv-tbl"><div class="tablewrap dv-tw"><table class="dv-t"><thead><tr><th>' + esc(head) +
    '</th><th class="n">Count</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="dv-cap note"><span>' + num(rows.length) + ' row' + (rows.length === 1 ? '' : 's') + '</span>' +
    (rows.length > show ? '<button type="button" class="linkbtn dv-all">Show all</button>' : '') + '</p></div>';
}
document.addEventListener('click', e => {
  const b = e.target && e.target.closest && e.target.closest('.dv-all');
  if(!b) return;
  const box = b.closest('.dv-tbl');
  if(!box) return;
  box.classList.toggle('open');
  b.textContent = box.classList.contains('open') ? 'Show less' : 'Show all';
});

/* bars, drawn at the box's own width so the text stays readable on a phone */
function bars(host, values, labels, opt = {}){
  if(!host) return;
  const vals = arr(values).map(fin), lab = arr(labels);
  if(!vals.length){ host.innerHTML = NONE; return; }
  const w = Math.max(260, Math.floor(host.clientWidth || 600)), h = opt.h || 170, L = 36, B = 22, T = 12;
  const peak = Math.max(1, ...vals, fin(opt.line));
  const stepUp = 10 ** Math.floor(Math.log10(peak)), top = Math.max(1, Math.ceil(peak / stepUp) * stepUp);
  const bw = (w - L) / Math.max(1, vals.length), gap = Math.min(4, bw * 0.25);
  const y = v => T + (h - B - T) * (1 - v / top);
  const every = Math.max(1, Math.ceil(vals.length / Math.max(2, Math.floor((w - L) / 56))));
  let s = '';
  for(const g of [0, top / 2, top]) s += '<line x1="' + L + '" x2="' + w + '" y1="' + y(g) + '" y2="' + y(g) + '" class="dv-grid-l"/>' +
    '<text x="' + (L - 6) + '" y="' + (y(g) + 3.5) + '" text-anchor="end">' + num(Math.round(g)) + '</text>';
  vals.forEach((v, i) => {
    const x = L + i * bw + gap / 2, bh = Math.max(v ? 1.5 : 0, (h - B - T) * v / top);
    s += '<rect x="' + x.toFixed(1) + '" y="' + (h - B - bh).toFixed(1) + '" width="' + Math.max(1, bw - gap).toFixed(1) + '" height="' + bh.toFixed(1) + '"' +
      (opt.line && v > opt.line ? ' class="over"' : '') + '><title>' + esc(lab[i]) + ': ' + num(v) + (opt.tip ? esc(opt.tip(i)) : '') + '</title></rect>';
    if(i % every === 0) s += '<text x="' + (x + (bw - gap) / 2).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(lab[i]) + '</text>';
  });
  if(opt.line) s += '<line x1="' + L + '" x2="' + w + '" y1="' + y(opt.line) + '" y2="' + y(opt.line) + '" class="dv-limit"/>' +
    '<text x="' + (w - 4) + '" y="' + (y(opt.line) - 5) + '" text-anchor="end" class="dv-limit-t">' + esc(opt.lineLabel || '') + '</text>';
  host.innerHTML = '<svg class="dv-bars" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' +
    esc(opt.label || '') + '">' + s + '</svg>';
}

/* ---------- popups: click off or Esc closes them ---------- */
function popup(node){
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = '<div class="ov-scrim"></div><div class="ov-box" role="dialog" aria-modal="true" tabindex="-1"></div>';
  ov.querySelector('.ov-box').append(node);
  const close = () => { ov.remove(); document.body.classList.remove('ov-open'); removeEventListener('keydown', key); };
  const key = e => { if(e.key === 'Escape') close(); };
  ov.querySelector('.ov-scrim').addEventListener('click', close);
  addEventListener('keydown', key);
  document.body.append(ov);
  document.body.classList.add('ov-open');
  ov.querySelector('.ov-box').focus({preventScroll: true});
  return close;
}

/* ---------- the chips and buttons that need no data at all ---------- */
function shell(){
  safe('#heatpage', () => Object.entries(PAGES).map(([k, l]) =>
    '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.heatRoute) + '">' + esc(l) + '</button>').join(''));
  safe('#heatdev', () => Object.entries(DEVICES).map(([k, l]) =>
    '<button type="button" data-k="' + k + '" aria-pressed="' + (k === S.heatDev) + '">' + esc(l) + '</button>').join(''));
  safe('#clickpick', () => '<button type="button" class="chip" data-k="all" aria-pressed="true">All pages</button>');
  safe('#notepick', () => ['new', 'read', 'done', 'all'].map(k =>
    '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.filter) + '">' +
    k[0].toUpperCase() + k.slice(1) + '</button>').join(''));
  for(const n of Object.keys(PART)) for(const id of PART[n].boxes) fill(id, WAIT);
  safe('#cfnotes', () => 'Reading Cloudflare…');
}

/* ---------- our own count ---------- */
function drawStats(){
  const d = obj(S.data), t = obj(d.totals);
  const range = {1: 'today', 7: 'last 7 days', 30: 'last 30 days'}[d.days] || '';
  safe('#tiles', () => [
    [t.views, 'Page views', range],
    [t.arrivals, 'Arrivals', 'from outside the site'],
    [t.clicks, 'Clicks', range],
    [t.newNotes, 'New notes', 'from players'],
  ].map(([n, l, sub]) => '<div class="panel dv-tile"><b>' + num(n) + '</b><span>' + esc(l) + '</span><small>' + esc(sub) + '</small></div>').join(''));
  safe('#chart', () => { viewChart(); });
  safe('#load', () => { loadPanel(); });
  safe('#routes', () => table(arr(d.routes).map(r => ({key: obj(r).route, n: obj(r).n, html: esc(PAGES[obj(r).route] || obj(r).route)})), 'Page'));
  safe('#kinds', () => table(arr(d.kinds).map(k => ({n: obj(k).n, html: esc(KINDS[obj(k).kind] || obj(k).kind)})), 'From'));
  safe('#sources', () => {
    const sites = arr(d.sources).map(obj).filter(s => s.source !== 'direct');
    return sites.length ? table(sites.map(s => ({n: s.n, html: esc(source(s.source)) +
      '<span class="dv-sub">' + esc(KINDS[s.kind] || '') + '</span>'})), 'Site') : NONE;
  });
  safe('#countries', () => table(arr(d.countries).map(c => ({n: obj(c).n, html: esc(country(obj(c).country))})), 'Country'));
  safe('#devices', () => table(arr(d.devices).map(x => ({n: obj(x).n, html: esc(DEVICES[obj(x).device] || obj(x).device)})), 'Device', t.views));
  safe('#clickpick', () => {
    const withClicks = Object.keys(obj(obj(d.clicks).byRoute));
    if(S.clickRoute !== 'all' && !withClicks.includes(S.clickRoute)) S.clickRoute = 'all';
    return [['all', 'All pages'], ...Object.keys(PAGES).filter(r => withClicks.includes(r)).map(r => [r, PAGES[r]])]
      .map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.clickRoute) + '">' + esc(l) + '</button>').join('');
  });
  safe('#clicks', () => clicksTable());
  safe('#plan', () => planBox());
  safe('#jobs', () => jobsBox());
  safe('#datastate', el => { dataLine(el); });
  safe('#searches', () => table(arr(d.searches).map(obj).map(s => ({n: s.n, html: esc(s.name || 'An item type') +
    (s.mods ? '<span class="dv-sub">' + fin(s.mods) + ' mod' + (fin(s.mods) === 1 ? '' : 's') + '</span>' : '') +
    '<span class="dv-sub">' + esc(ago(s.last)) + '</span>'})), 'Search'));
  if(!S.sg) safe('#notes', () => notesList(obj(d.suggestions)));   // until the notes' own call lands
  count(fin(t.newNotes));
  redraw();
}
function count(n){
  const el = $('#notect');
  if(el) el.textContent = n ? num(n) : '';
}
function viewChart(){
  const d = obj(S.data), L = obj(d.load), per = obj(L.perHour);
  const title = $('#charttl');
  if(d.days === 1){   // today: by the hour (the last 24)
    if(title) title.textContent = 'Views per hour, last 24 hours';
    bars($('#chart'), arr(per.site_view).slice(-24), arr(L.hours).slice(-24).map(hourLabel), {label: 'Views per hour'});
  } else {
    if(title) title.textContent = 'Views per day';
    bars($('#chart'), arr(d.perDay).map(x => obj(x).n), arr(d.perDay).map(x => day(obj(x).day)), {label: 'Views per day'});
  }
}
function loadPanel(){
  const L = obj(obj(S.data).load), per = obj(L.perHour);
  const sum = k => arr(per[k]).reduce((a, b) => a + fin(b), 0);
  $('#load').innerHTML = '<h4 class="dv-h4">Trade site searches per hour</h4><div id="ld-trade"></div>' +
    '<p class="note">' + num(sum('trade_search')) + ' searches, ' + num(sum('trade_fetch')) + ' fetches. Told to slow down ' +
      num(sum('trade_limited')) + ' times, ' + num(sum('trade_error')) + ' errors.</p>' +
    '<h4 class="dv-h4">Site views per hour</h4><div id="ld-site"></div>' +
    '<p class="note">' + num(sum('site_view')) + ' page views in ' + num(sum('site_batch')) + ' batches.</p>';
  loadCharts();
}
function loadCharts(){
  const L = obj(obj(S.data).load), per = obj(L.perHour), hl = arr(L.hours).map(hourLabel);
  const limit = fin(L.tradeLimitPerHour);
  bars($('#ld-trade'), per.trade_search, hl, {h: 150, line: limit, lineLabel: 'limit ~' + limit, label: 'Trade site searches per hour'});
  bars($('#ld-site'), per.site_view, hl, {h: 150, label: 'Site views per hour'});
}
function clicksTable(){
  const c = obj(obj(S.data).clicks);
  const list = S.clickRoute === 'all' ? arr(c.all) : arr(obj(c.byRoute)[S.clickRoute]);
  return table(list.map(obj).map(x => ({n: x.n, html: esc(pretty(x.label))})), 'What', 0, 20);
}
$('#clickpick').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if(!b) return;
  S.clickRoute = b.dataset.k;
  for(const c of $('#clickpick').children) c.setAttribute('aria-pressed', String(c === b));
  safe('#clicks', () => clicksTable());
});

/* a page's own clicks, in a popup */
function openRoute(r){
  const list = arr(obj(obj(obj(S.data).clicks).byRoute)[r]);
  const box = document.createElement('section');
  box.className = 'panel dv-pop';
  box.innerHTML = '<h3>' + esc(PAGES[r] || r) + '</h3><p class="note">' +
    num(obj(arr(obj(S.data).routes).find(x => obj(x).route === r)).n) + ' views · top clicks</p>' +
    table(list.map(obj).slice(0, 20).map(x => ({n: x.n, html: esc(pretty(x.label))})), 'What', 0, 20) +
    '<div class="ov-go"><button type="button" class="btn gold">Heatmap</button></div>';
  const close = popup(box);
  box.querySelector('.btn.gold').addEventListener('click', () => {
    close();
    S.heatRoute = r;
    for(const c of $('#heatpage').children) c.setAttribute('aria-pressed', String(c.dataset.k === r));
    H.stale = true;
    showTab('clicks');
    const panel = $('#heatbox') && $('#heatbox').closest('.panel');
    if(panel) panel.scrollIntoView({behavior: 'smooth', block: 'start'});
  });
}
$('#routes').addEventListener('click', e => { const tr = e.target.closest('tr[data-key]'); if(tr) openRoute(tr.dataset.key); });
$('#routes').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-key]'); if(tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openRoute(tr.dataset.key); } });

/* ---------- heatmap: the page itself in a frame, the clicks painted over it ---------- */
const H = {token: 0, cells: [], max: 0, W: 1366, h: 1200, frameKey: '', stale: true};
async function heat(){
  const box = $('#heatbox'), note = $('#heatnote'), token = ++H.token, route = S.heatRoute, dev = S.heatDev;
  if(!box) return;
  H.stale = false;
  if(note) note.textContent = 'Loading…';
  if(!box.querySelector('iframe')) fill('#heatbox', WAIT);   // an empty box would look like nothing is coming
  let r = null;
  try { r = await race(api('heat?route=' + route + '&device=' + dev + '&days=' + S.days), 20000, 'Took too long.'); } catch { r = null; }
  if(token !== H.token) return;
  if(!r || !r.ok || !r.j){
    if(note) note.textContent = r && r.status === 401 ? 'Signed out.' : 'Could not load the clicks.';
    box.innerHTML = failLine('stats', 'The heatmap did not load.').replace('data-retry="stats"', 'data-heat="1"');
    return;
  }
  try {
    H.cells = arr(r.j.cells); H.max = fin(r.j.max); H.W = WIDTH[dev] || 1366;
    if(note) note.textContent = num(r.j.total) + ' clicks on ' + (PAGES[route] || route) + ', ' + (DEVICES[dev] || dev).toLowerCase() + ' size.';
    const key = route + '|' + dev;
    if(H.frameKey !== key || !box.querySelector('iframe')){
      H.frameKey = key;
      H.h = Math.min(6000, Math.max(900, ...H.cells.map(c => fin(arr(c)[1]) * 20 + 60)));
      box.innerHTML = '<div class="dv-heat-sz"><div class="dv-heat-in"><iframe tabindex="-1" aria-hidden="true" title="Page preview"></iframe>' +
        '<canvas></canvas></div></div>';
      const f = box.querySelector('iframe');
      f.addEventListener('load', () => {
        const grow = () => {   // as tall as the page, up to the first 6000 px
          if(H.frameKey !== key) return;
          let full = 0;
          try { full = f.contentDocument.documentElement.scrollHeight; } catch {}
          const want = Math.min(6000, Math.max(H.h, full));
          if(want !== H.h){ H.h = want; fit(); draw(); }
        };
        setTimeout(grow, 900); setTimeout(grow, 2600);
      });
      f.src = pageURL(route);
    }
    fit(); draw();
  } catch(e){
    console.error('heatmap', e);
    if(note) note.textContent = 'The heatmap could not be drawn.';
    shout('heatmap: ' + ((e && e.message) || e));
  }
}
document.addEventListener('click', e => { if(e.target && e.target.closest && e.target.closest('[data-heat]')){ H.stale = true; heat(); } });
function fit(){
  const box = $('#heatbox');
  if(!box) return;
  const sz = box.querySelector('.dv-heat-sz'), inn = box.querySelector('.dv-heat-in');
  if(!sz || !inn) return;
  const s = Math.min(1, (box.clientWidth - 2) / H.W);
  sz.style.width = (H.W * s) + 'px'; sz.style.height = (H.h * s) + 'px';
  inn.style.width = H.W + 'px'; inn.style.height = H.h + 'px'; inn.style.transform = 'scale(' + s + ')';
  const f = inn.querySelector('iframe');
  if(f){ f.style.width = H.W + 'px'; f.style.height = H.h + 'px'; }
}
const RAMP = [[0, [40, 90, 255]], [0.35, [0, 200, 220]], [0.6, [140, 203, 63]], [0.8, [245, 207, 102]], [1, [234, 57, 67]]];
function ramp(t){   // cool to hot
  for(let i = 1; i < RAMP.length; i++){
    const [b, cb] = RAMP[i], [a, ca] = RAMP[i - 1];
    if(t <= b){ const k = (t - a) / (b - a || 1); return ca.map((v, j) => Math.round(v + (cb[j] - v) * k)); }
  }
  return RAMP[RAMP.length - 1][1];
}
function draw(){
  const cv = $('#heatbox canvas');
  if(!cv || !cv.getContext) return;
  cv.width = H.W; cv.height = H.h;
  const g = cv.getContext('2d');
  if(!g) return;
  g.fillStyle = 'rgba(0,0,0,.38)';
  g.fillRect(0, 0, H.W, H.h);
  if(!H.max) return;
  const cw = H.W * 0.02, r = Math.max(cw, 20) * 0.9;
  g.filter = 'blur(5px)';
  for(const cell of [...H.cells].sort((a, b) => fin(arr(a)[2]) - fin(arr(b)[2]))){
    const [xb, yb, n] = arr(cell).map(fin);
    const t = Math.sqrt(n / (H.max || 1)), [R, G, B] = ramp(t);
    g.fillStyle = 'rgba(' + R + ',' + G + ',' + B + ',' + (0.35 + 0.55 * t).toFixed(2) + ')';
    g.beginPath();
    g.ellipse((xb + 0.5) * cw, yb * 20 + 10, r, r * 0.8, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.filter = 'none';
}
$('#heatpage').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if(!b || b.dataset.k === S.heatRoute) return;
  S.heatRoute = b.dataset.k;
  for(const c of $('#heatpage').children) c.setAttribute('aria-pressed', String(c === b));
  heat();
});
$('#heatdev').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if(!b || b.dataset.k === S.heatDev) return;
  S.heatDev = b.dataset.k;
  for(const c of $('#heatdev').children) c.setAttribute('aria-pressed', String(c === b));
  heat();
});

/* ---------- notes from players (their own call: /api/admin/suggestions) ---------- */
const NEXT = {new: [['read', 'Mark read'], ['done', 'Done']], read: [['done', 'Done'], ['new', 'Mark new']], done: [['new', 'Mark new']]};
const noteButtons = n => (NEXT[n.status] || NEXT.done).map(([s, l]) =>
  '<button type="button" class="btn" data-id="' + esc(n.id) + '" data-s="' + s + '">' + l + '</button>').join('');
const noteBox = () => obj(S.sg || obj(obj(S.data).suggestions));
function notesList(sg){
  const list = arr(obj(sg).list).map(obj).filter(n => S.filter === 'all' || n.status === S.filter);
  return list.length ? list.map(n => '<li class="dv-note s-' + esc(n.status) + '">' +
    '<p class="dv-note-t" data-open="' + esc(n.id) + '" tabindex="0">' + esc(n.text) + '</p>' +
    '<div class="dv-note-ft"><span class="note">' + esc(pageName(n.page)) + ' · ' + esc(ago(n.at)) + '</span>' +
    '<span class="grow"></span>' + noteButtons(n) + '</div></li>').join('')
    : '<li class="note dv-none">Nothing here.</li>';
}
function drawNotes(){
  const sg = noteBox(), c = obj(sg.count), all = fin(c.new) + fin(c.read) + fin(c.done);
  safe('#notepick', () => [['new', 'New', c.new], ['read', 'Read', c.read], ['done', 'Done', c.done], ['all', 'All', all]]
    .map(([k, l, n]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.filter) + '">' + l +
      '<span class="ct">' + num(n) + '</span></button>').join(''));
  safe('#notes', () => notesList(sg));
  // the row under the list, empty when there is nothing older to ask for
  const have = arr(sg.list).length;
  fill('#notemore', sg.more || all > have ? '<button type="button" class="btn" id="older">Load older</button>' +
    '<span class="note">' + num(have) + ' of ' + num(all) + ' loaded</span>' : '');
  count(fin(c.new));
}
async function mark(id, status){
  let r = null;
  try { r = await api('suggestion', {id, status}); } catch {}
  if(!r || !r.ok) return false;
  const sg = noteBox(), n = arr(sg.list).find(x => obj(x).id === id), c = obj(sg.count);
  if(n && n.status !== status){ c[n.status] = fin(c[n.status]) - 1; c[status] = fin(c[status]) + 1; n.status = status; }
  if(S.data && S.data.totals) S.data.totals.newNotes = fin(c.new);
  const tile = $('#tiles .dv-tile:nth-child(4) b');
  if(tile) tile.textContent = num(c.new);
  drawNotes();
  return true;
}
function openNote(id){
  const n = arr(noteBox().list).map(obj).find(x => x.id === id);
  if(!n) return;
  const box = document.createElement('section');
  box.className = 'panel dv-pop';
  const paint = () => {
    box.innerHTML = '<h3>Note</h3><p class="note">' + esc(pageName(n.page)) + ' · ' + esc(ago(n.at)) + '</p>' +
      '<p class="dv-note-full">' + esc(n.text) + '</p><div class="ov-go">' + noteButtons(n) + '</div>';
  };
  paint();
  box.addEventListener('click', async e => {
    const b = e.target.closest('button[data-s]');
    if(!b) return;
    b.disabled = true;
    if(await mark(n.id, b.dataset.s)) paint(); else b.disabled = false;
  });
  popup(box);
}
$('#notepick').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if(!b) return;
  S.filter = b.dataset.k;
  for(const c of $('#notepick').children) c.setAttribute('aria-pressed', String(c === b));
  safe('#notes', () => notesList(noteBox()));
});
$('#notes').addEventListener('click', async e => {
  const b = e.target.closest('button[data-s]');
  if(b){ b.disabled = true; if(!(await mark(+b.dataset.id, b.dataset.s))) b.disabled = false; return; }
  const t = e.target.closest('[data-open]');
  if(t) openNote(+t.dataset.open);
});
$('#notes').addEventListener('keydown', e => {
  const t = e.target.closest('[data-open]');
  if(t && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openNote(+t.dataset.open); }
});
/* the next hundred, oldest end first */
$('#notemore').addEventListener('click', async e => {
  const b = e.target.closest('#older');
  if(!b) return;
  b.disabled = true; b.textContent = 'Loading…';
  const sg = noteBox(), list = arr(sg.list), last = list.length ? fin(obj(list[list.length - 1]).id) : 0;
  let r = null;
  try { r = await race(api('suggestions?before=' + last), 20000, 'Took too long.'); } catch {}
  if(!r || !r.ok || !r.j){ b.disabled = false; b.textContent = 'Load older'; return; }
  const have = new Set(list.map(x => obj(x).id));
  for(const n of arr(r.j.list)) if(!have.has(obj(n).id)) list.push(n);
  sg.list = list; sg.more = !!r.j.more;
  S.sg = sg;
  drawNotes();
});

/* ---------- the free plan and the data jobs ---------- */
function meter(label, used, limit, sub){
  const u = fin(used), l = fin(limit), p = l > 0 ? u / l * 100 : 0;
  return '<div class="dv-meter-row"><div class="dv-meter-hd"><span>' + esc(label) + '</span><b>' + num(u) + ' / ' + num(l) +
    ' <small>' + (p < 1 && u ? '<1' : Math.round(p)) + '%</small></b></div>' +
    '<div class="dv-meter' + (p >= 80 ? ' bad' : p >= 50 ? ' warn' : '') + '"><i style="width:' + Math.min(100, p).toFixed(1) + '%"></i></div>' +
    (sub ? '<p class="note">' + sub + '</p>' : '') + '</div>';
}
function planBox(){
  const p = obj(obj(S.data).plan), f = obj(p.free), t = obj(p.today), links = obj(p.links);
  const verdict = {fine: 'Free plan is fine.', watch: 'Free plan is fine for now. Past half of the daily limit.',
    upgrade: 'Close to the free limit: upgrade to Workers Paid ($5/month).'}[p.verdict] || 'Free plan.';
  const link = (href, text) => href ? '<a href="' + esc(href) + '" target="_blank" rel="noopener">' + text + '</a>' : text;
  return '<p class="dv-verdict v-' + esc(p.verdict || 'fine') + '">' + verdict + '</p>' +
    meter('Database writes today (about)', t.writes, f.d1Writes, 'Page tracking ' + num(t.trackingWrites) + ' · trade prices ' + num(t.priceWrites)) +
    meter('Worker requests today (about)', t.requests, f.requests, num(t.views) + ' page views, ' + num(t.batches) + ' tracking batches') +
    '<p class="note">Free plan, per day: ' + num(f.requests) + ' requests · ' + num(fin(f.d1Reads) / 1e6) + ' million database reads · ' +
      num(f.d1Writes) + ' database writes · ' + fin(f.d1StorageGB) + ' GB stored.</p>' +
    '<p class="note dv-links">Exact numbers on Cloudflare: ' + link(links.traffic, 'Traffic') + ' · ' +
      link(links.workers, 'Workers &amp; Pages') + ' · ' + link(links.d1, 'Database') + '</p>';
}
/* the data jobs: fine, late or stopped, worked out by the site (worker/health.js). A row with a note is a
   section still showing an older copy because its source failed: the note says which copy and why, in the
   words the builder wrote when it kept it (data/faults.json, tools/lastgood.py). */
const STATE = {ok: ['fine', 'good'], unknown: ['unknown', 'ok'], late: ['late', 'ok'], stopped: ['stopped', 'poor']};
const FROM = {backup: 'backup site', none: '—', stale: 'stale since'};   // where a file came from, when it has no time of its own
const TOP = {late: ' v-late', stopped: ' v-stopped'};   // how the line at the top of the page reads
function jobsBox(){
  const list = arr(obj(obj(S.data).jobs).jobs).map(obj);
  if(!list.length) return NONE;
  return '<div class="tablewrap dv-tw"><table class="dv-t"><thead><tr><th>What</th><th class="n">State</th><th class="n">Last in</th></tr></thead><tbody>' +
    list.map(x => {
      const [word, tone] = STATE[x.state] || STATE.stopped;
      // the note reads on its own in /api/health ("Currency prices: still showing ..."); here the name is
      // already in the row above it, so it comes off
      const full = typeof x.note === 'string' ? x.note : '';
      const said = full.startsWith(x.what + ': ') ? full.slice(String(x.what).length + 2) : full;
      const note = said ? '<span class="dv-sub">' + esc(said) + '</span>' : '';
      return '<tr><td>' + esc(x.what) + note + '</td><td class="n"><span class="dv-g g-' + tone + '">' + word + '</span></td>' +
        '<td class="n">' + (x.at ? esc(ago(x.at)) : esc(FROM[x.from] || '—')) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}
/* the worst of them, in one line at the top of every tab */
function dataLine(el){
  const j = obj(obj(S.data).jobs), line = typeof j.line === 'string' ? j.line : '';
  el.textContent = line;
  el.className = 'dv-verdict' + (TOP[j.state] || '');
  el.hidden = !line;
}

/* ---------- Cloudflare's own numbers (worker/cfstats.js) ---------- */
const bytes = b => { const v = fin(b);
  return v >= 1e9 ? (v / 1e9).toFixed(2) + ' GB' : v >= 1e6 ? (v / 1e6).toFixed(1) + ' MB' : Math.round(v / 1e3) + ' kB'; };
const PATH = x => x.k === '/' ? 'Home (/)' : x.k || '(none)';
const REF = x => !x.k ? 'Direct (typed or bookmarked)' : x.k === location.hostname ? 'Within the site' : x.k;
const VISITS = x => x.visits ? '<span class="dv-sub">' + num(x.visits) + ' visits</span>' : '';
const BYTES = x => x.bytes ? '<span class="dv-sub">' + bytes(x.bytes) + '</span>' : '';
const dig = (o, path) => String(path).split('.').reduce((v, k) => (v == null ? v : v[k]), o);

/* every breakdown Cloudflare gives us, each in its own box: box, where the rows are, title, note, row name, row sub-line */
const BREAK = [
  // Visitors: real people (Web Analytics)
  {box: 'cfreal', k: 'rum.pages', t: 'Pages', p: 'Real visitors: browsers only, no cookies.', name: PATH, sub: VISITS, show: 15},
  {box: 'cfreal', k: 'rum.refs', t: 'Where they came from', name: REF, sub: VISITS, show: 15},
  {box: 'cfreal', k: 'rum.countries', t: 'Countries', name: x => country(x.k), sub: VISITS, show: 15},
  {box: 'cfreal', k: 'rum.browsers', t: 'Browsers', sub: VISITS},
  {box: 'cfreal', k: 'rum.systems', t: 'Systems', sub: VISITS},
  {box: 'cfreal', k: 'rum.devices', t: 'Devices', sub: VISITS},
  {box: 'cfreal', k: 'rum.hosts', t: 'Hosts', p: 'Which name they came in on.', sub: VISITS},
  // Visitors: everyone Cloudflare saw, people and bots
  {box: 'cfwho', k: 'askers', t: 'Who is asking', p: 'People, search engines, AI crawlers and scripts.'},
  {box: 'cfwho', k: 'crawlers', t: 'Crawlers by name', name: x => x.k + ' · ' + (x.kind || ''), show: 15},
  {box: 'cfwho', k: 'countries', t: 'Countries', p: 'Every request, people and bots.', name: x => country(x.k),
    sub: x => (x.threats ? '<span class="dv-sub">' + num(x.threats) + ' threats · ' + bytes(x.bytes) + '</span>' : BYTES(x)), show: 15},
  {box: 'cfwho', k: 'verifiedBots', t: 'Named bots', p: 'Cloudflare’s own list of bots it recognises.', show: 15},
  {box: 'cfwho', k: 'colo', t: 'Cloudflare data centres', p: 'Which city answered, nearest to the visitor.', show: 15},
  {box: 'cfwho', k: 'devices', t: 'Device kinds'},
  {box: 'cfwho', k: 'systems', t: 'Operating systems'},
  {box: 'cfwho', k: 'browsers', t: 'Browsers', p: 'Page views, Cloudflare’s own count.'},
  {box: 'cfwho', k: 'ipKinds', t: 'Visitor kinds', p: 'Cloudflare’s label for the address: clean, search engine, scanner.'},
  // Traffic: what was asked for and how we answered
  {box: 'cftraffic', k: 'paths', t: 'Most asked for', p: 'Paths, people and bots.', name: PATH, sub: BYTES, show: 20},
  {box: 'cftraffic', k: 'hosts', t: 'Hosts'},
  {box: 'cftraffic', k: 'methods', t: 'Methods'},
  {box: 'cftraffic', k: 'status', t: 'Status codes', p: 'What we answered.', name: x => 'Status ' + x.k},
  {box: 'cftraffic', k: 'originStatus', t: 'Server status codes', p: 'What the worker answered before the cache.', name: x => 'Status ' + x.k},
  {box: 'cftraffic', k: 'cache', t: 'Cache', p: 'A hit never reached the worker.', sub: BYTES},
  {box: 'cftraffic', k: 'types', t: 'Content types'},
  {box: 'cftraffic', k: 'protocols', t: 'HTTP versions'},
  {box: 'cftraffic', k: 'tls', t: 'TLS versions'},
  {box: 'cftraffic', k: 'rum.refs', t: 'Referring sites', p: 'Real visitors only: this plan gives us no referrer per request.', name: REF, show: 15},
  {box: 'cftraffic', k: 'threatKinds', t: 'Threats stopped', p: 'What Cloudflare blocked, and why.'},
];
const rowList = (list, b) => table(arr(list).map(obj).filter(x => fin(x.n)).map(x => ({n: x.n,
  html: esc(b.name ? b.name(x) : x.k || '(none)') + (b.sub ? b.sub(x) : '')})), '', 0, b.show || 12);

function drawCloud(){
  const c = obj(S.cf);
  if(c.error){
    for(const id of PART.cf.boxes) fill(id, failLine('cf', c.error));
    safe('#cfnotes', () => 'Cloudflare numbers are not available right now: ' + esc(c.error));
    return;
  }
  const t = obj(c.totals), range = {1: 'today', 7: 'last 7 days', 30: 'last 30 days'}[c.days] || '';
  safe('#cfnotes', () => esc(['Straight from Cloudflare, refreshed every 5 minutes.', ...arr(c.notes)].join(' ')) +
    (arr(c.missing).length ? ' <b>Not available:</b> ' + esc(arr(c.missing).join(', ')) + '.' : ''));
  safe('#cftiles', () => [
    [num(t.visits), 'Real visits', 'people in browsers, ' + range],
    [num(t.pageLoads), 'Real page loads', range],
    [num(t.uniques), 'Unique visitors', 'per day, added up'],
    [num(t.pageViews), 'Page views', 'people and bots'],
    [num(t.requests), 'Requests', range],
    [bytes(t.bytes), 'Data served', share(t.cachedBytes, t.bytes) + '% from cache'],
    [share(t.cachedRequests, t.requests) + '%', 'Requests cached', num(t.cachedRequests) + ' never hit the worker'],
    [share(t.encryptedRequests, t.requests) + '%', 'Encrypted', num(fin(t.requests) - fin(t.encryptedRequests)) + ' plain'],
    [num(t.threats), 'Threats', 'stopped by Cloudflare'],
    [num(obj(c.workers).errors), 'Server errors', num(obj(c.workers).requests) + ' server requests'],
  ].map(([n, l, sub]) => '<div class="panel dv-tile"><b>' + esc(n) + '</b><span>' + esc(l) + '</span><small>' + esc(sub) + '</small></div>').join(''));

  // each breakdown builds on its own: one bad row cannot empty the box around it
  const box = {};
  for(const b of BREAK) (box[b.box] = box[b.box] || []).push(b);
  for(const id of Object.keys(box)) safe('#' + id, () => box[id].map(b => {
    const head = '<div class="dv-hd"><h3>' + esc(b.t) + '</h3>' + (b.p ? '<p>' + esc(b.p) + '</p>' : '') + '</div>';
    let body;
    try { body = rowList(dig(c, b.k), b); }
    catch(e){ console.error(b.k, e); body = '<p class="note dv-bad">This block failed: ' + esc((e && e.message) || e) + '</p>'; }
    return '<div class="panel dv-box">' + head + body + '</div>';
  }).join(''));

  safe('#cfchart', () => cfChart('#cfchart', 'requests'));
  safe('#cfrumchart', () => cfChart('#cfrumchart', 'visits'));
  safe('#cfhour', () => cfHourChart());
  safe('#cfd1', () => cfD1Chart());
  drawSpeed(c);
  safe('#cfserver', () => {
    const W = obj(c.workers), free = obj(c.free), last = obj(arr(c.d1).slice(-1)[0]), days1 = Math.max(1, arr(c.daily).length);
    return meter('Server requests, per day (average)', Math.round(fin(W.requests) / days1), free.requests,
        'Errors: ' + num(W.errors) + ' · ' + arr(W.byStatus).map(s => esc(obj(s).k) + ' ' + num(obj(s).n)).join(' · ') +
        ' · CPU per request: half under ' + fin(W.cpu50) + ' ms, 99% under ' + fin(W.cpu99) + ' ms') +
      meter('Database rows read today', last.rowsRead, free.d1Reads) +
      meter('Database rows written today', last.rowsWritten, free.d1Writes,
        num(last.reads) + ' read queries, ' + num(last.writes) + ' write queries today');
  });
  redraw();
}

/* page speed: the good / needs work / poor split, then every page, then where the time goes */
const CWV = [['lcp', 'Main content shown'], ['inp', 'Reaction to a click'], ['cls', 'Things jumping around'],
  ['fcp', 'First paint'], ['ttfb', 'First byte from us']];
function drawSpeed(c){
  const R = obj(obj(c).rum), sp = obj(R.split);
  safe('#cfsplit', () => {
    const have = CWV.filter(([k]) => sp[k]);
    if(!have.length) return NONE;
    return '<div class="dv-cwv">' + have.map(([k, l]) => {
      const s = obj(sp[k]), all = Math.max(1, fin(s.good) + fin(s.ok) + fin(s.poor)), pc = n => (fin(n) / all * 100).toFixed(1) + '%';
      return '<div class="dv-cwv-row"><div class="dv-cwv-hd"><span>' + esc(l) + '</span><b>' + share(s.good, all) + '% good</b></div>' +
        '<div class="dv-cwv-bar"><i class="g" style="width:' + pc(s.good) + '" title="Good ' + num(s.good) + '"></i>' +
        '<i class="o" style="width:' + pc(s.ok) + '" title="Needs work ' + num(s.ok) + '"></i>' +
        '<i class="p" style="width:' + pc(s.poor) + '" title="Poor ' + num(s.poor) + '"></i></div>' +
        '<p class="note">' + num(s.good) + ' good · ' + num(s.ok) + ' needs work · ' + num(s.poor) + ' poor</p></div>';
    }).join('') + '</div>';
  });
  const grade = (v, good, poor) => v <= good ? 'good' : v <= poor ? 'ok' : 'poor';
  const cell = (v, unit, good, poor) => v === null || v === undefined || !Number.isFinite(+v) ? '<td class="n">—</td>' :
    '<td class="n"><span class="dv-g g-' + grade(+v, good, poor) + '">' +
    (unit === 's' ? (+v / 1000).toFixed(2) + ' s' : unit === 'ms' ? num(v) + ' ms' : (+v).toFixed(2)) + '</span></td>';
  safe('#cfspeed', () => {
    const rows = arr(R.vitals).map(obj);
    if(!rows.length) return NONE;
    return '<div class="tablewrap dv-tw"><table class="dv-t"><thead><tr><th>Page</th><th class="n">Loads</th>' +
      '<th class="n" title="Biggest thing on screen shown">Main content</th><th class="n" title="Reaction to a click or key">Reaction</th>' +
      '<th class="n" title="Things jumping around while loading">Jumpiness</th><th class="n" title="First thing on screen">First paint</th>' +
      '<th class="n" title="First byte back from us">First byte</th><th class="n">Full load (half / 90%)</th></tr></thead><tbody>' +
      rows.map(v => '<tr><td>' + esc(v.path === '/' ? 'Home (/)' : v.path) + '</td><td class="n">' + num(v.n) + '</td>' +
        cell(v.lcp, 's', 2500, 4000) + cell(v.inp, 'ms', 200, 500) + cell(v.cls, '', 0.1, 0.25) + cell(v.fcp, 's', 1800, 3000) +
        cell(v.ttfb, 'ms', 800, 1800) + '<td class="n">' +
        (Number.isFinite(+v.load50) ? (fin(v.load50) / 1000).toFixed(2) + ' s / ' + (fin(v.load90) / 1000).toFixed(2) + ' s' : '—') +
        '</td></tr>').join('') +
      '</tbody></table></div><p class="note">Green is good, amber needs work, red is poor (Google’s own lines).</p>';
  });
  // a step can really be 0 ms (too fast to measure, or nothing to do), so only a missing number is a dash
  safe('#cfparts', () => {
    const p = arr(R.parts).map(obj), time = v => !Number.isFinite(+v) ? '—' : +v >= 1000 ? (+v / 1000).toFixed(2) + ' s' : num(v) + ' ms';
    if(!p.length) return NONE;
    return '<div class="tablewrap dv-tw"><table class="dv-t"><thead><tr><th>Step</th>' +
      '<th class="n">Half of them</th><th class="n">75% of them</th></tr></thead><tbody>' +
      p.map(s => '<tr><td>' + esc(s.k) + '</td><td class="n"><b>' + time(s.p50) + '</b></td><td class="n"><b>' + time(s.p75) + '</b></td></tr>').join('') +
      '</tbody></table></div>';
  });
}

/* the charts on Cloudflare's numbers */
function cfChart(where, what){
  const c = obj(S.cf);
  if(!$(where)) return;
  const d = arr(what === 'visits' ? obj(c.rum).byDay : c.daily).map(obj);
  const val = x => fin(what === 'visits' ? x.visits : x.requests);
  if(d.length < 2){ $(where).innerHTML = d.length ? '<p class="note">' + esc(day(d[0].date)) + ': ' + num(val(d[0])) +
    '. The chart fills in day by day.</p>' : NONE; return; }
  bars($(where), d.map(val), d.map(x => day(x.date)), {label: what === 'visits' ? 'Real visits per day' : 'Requests per day'});
}
function cfHourChart(){
  const c = obj(S.cf), h = arr(c.hourly).map(obj), title = $('#cfhourtl');
  if(!$('#cfhour')) return;
  const hours = fin(c.adaptiveHours);
  if(title) title.textContent = 'Requests per hour' + (hours ? ', last ' + (hours >= 24 ? (hours / 24) + ' days' : hours + ' hours') : '');
  if(!h.length){ $('#cfhour').innerHTML = NONE; return; }
  bars($('#cfhour'), h.map(x => x.n), h.map(x => hourLabel(x.hour)), {label: 'Requests per hour', tip: i => ' · ' + bytes(obj(h[i]).bytes)});
}
function cfD1Chart(){
  const d = arr(obj(S.cf).d1).map(obj);
  if(!$('#cfd1')) return;
  if(!d.length){ $('#cfd1').innerHTML = NONE; return; }
  $('#cfd1').innerHTML = '<h4 class="dv-h4">Rows written</h4><div id="d1-w"></div><h4 class="dv-h4">Rows read</h4><div id="d1-r"></div>';
  bars($('#d1-w'), d.map(x => x.rowsWritten), d.map(x => day(x.date)), {h: 150, label: 'Rows written per day'});
  bars($('#d1-r'), d.map(x => x.rowsRead), d.map(x => day(x.date)), {h: 150, label: 'Rows read per day'});
}

/* charts and the heatmap follow the window's width */
let rs = 0;
addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(() => { try { redraw(); } catch(e){ console.error(e); } }, 150); });

start();
