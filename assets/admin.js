/* The owner's dashboard (admin.html). The page holds no data: everything comes from /api/admin/*,
   behind a 12-hour sign-in cookie (worker/dash.js). Charts are plain SVG, drawn to the box's own width.
   Tabs: Overview, Visitors, Traffic, Clicks, Speed, Notes, Data jobs, Plan. The last one stays in localStorage. */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const num = n => (+n || 0).toLocaleString('en');

const PAGES = {home: 'Search', build: 'Build', currency: 'Currency', trade: 'Trade', farms: 'Farms', atlas: 'Atlas',
  'explore-gems': 'Gems', 'explore-uniques': 'Uniques', 'explore-tree': 'Passive tree'};
const KINDS = {direct: 'Direct', search: 'Search engines', ai: 'AI search', social: 'Social', other: 'Other sites'};
const DEVICES = {phone: 'Phone', tablet: 'Tablet', desktop: 'Desktop'};
const WIDTH = {phone: 390, tablet: 820, desktop: 1366};   // the heatmap shows the page at this width
const EXPLORE = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? 'explore.html' : 'explore';
const pageURL = r => r.startsWith('explore-') ? EXPLORE + '#' + r.slice(8) : './#/' + (r === 'home' ? '' : r);
const TABS = ['overview', 'visitors', 'traffic', 'clicks', 'speed', 'notes', 'jobs', 'plan'];
const S = {days: 7, tab: 'overview', data: null, cf: null, clickRoute: 'all', heatRoute: 'home', heatDev: 'desktop', notes: 'new', more: false};

/* ---------- the API ---------- */
async function api(path, body){
  const opt = body ? {method: 'POST', headers: {'Content-Type': 'application/json', 'X-WI': '1'}, body: JSON.stringify(body)} : {};
  const r = await fetch('api/admin/' + path, {...opt, credentials: 'same-origin', cache: 'no-store'});
  let j = null;
  try { j = await r.json(); } catch {}
  return {status: r.status, ok: r.ok, j};
}

/* ---------- sign-in ---------- */
function showSignin(msg = ''){
  $('#dash').hidden = true; $('#range').hidden = true; $('#signout').hidden = true;
  $('#signin').hidden = false; $('#signmsg').textContent = msg;
  setTimeout(() => $('#pw').focus(), 30);
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
      await load();
    } else msg.textContent = {401: 'Wrong password.', 429: 'Too many tries. Try again in an hour.', 503: 'Not set up yet.'}[r.status] || 'Could not sign in.';
  } catch { msg.textContent = 'Could not reach the site.'; }
  btn.disabled = false;
});
$('#signout').addEventListener('click', async () => {
  try { await api('logout', {}); } catch {}
  S.data = null;
  showSignin();
});

/* ---------- load ---------- */
async function load(){
  let r;
  try { r = await api('stats?days=' + S.days); } catch { return showSignin('Could not reach the site.'); }
  if(r.status === 401) return showSignin();
  if(r.status === 503) return showSignin('Not set up yet.');
  if(!r.ok || !r.j) return showSignin('Could not load the numbers.');
  S.data = r.j;
  const c = r.j.suggestions.count;
  S.more = c.new + c.read + c.done > r.j.suggestions.list.length;
  $('#signin').hidden = true; $('#dash').hidden = false; $('#range').hidden = false; $('#signout').hidden = false;
  render();
  H.stale = true;
  showTab(S.tab);
  cloudflare();
}
$('#range').addEventListener('click', e => {
  const b = e.target.closest('button[data-days]');
  if(!b || +b.dataset.days === S.days) return;
  S.days = +b.dataset.days;
  for(const c of $('#range').children) c.setAttribute('aria-pressed', String(c === b));
  load();
});
try { $('#notrack').checked = localStorage.getItem('wi-notrack') === '1'; } catch {}
$('#notrack').addEventListener('change', e => { try { localStorage.setItem('wi-notrack', e.target.checked ? '1' : '0'); } catch {} });

/* ---------- tabs ---------- */
function showTab(t){
  if(!TABS.includes(t)) t = 'overview';
  S.tab = t;
  for(const b of $('#tabs').children) b.setAttribute('aria-pressed', String(b.dataset.t === t));
  for(const p of TABS) $('#t-' + p).hidden = p !== t;
  try { localStorage.setItem('wi-admin-tab', t); } catch {}
  if(t === 'clicks' && (H.stale || !H.frameKey)) heat();   // the page preview only loads when it is looked at
  redraw();
}
/* charts are drawn to the box's own width, so a tab draws its own when it opens */
function redraw(){
  if(!S.data || $('#dash').hidden) return;
  if(S.tab === 'overview'){ viewChart(); cfChart('#cfchart', 'requests'); cfChart('#cfrumchart', 'visits'); }
  if(S.tab === 'traffic') cfHourChart();
  if(S.tab === 'jobs') loadCharts();
  if(S.tab === 'plan') cfD1Chart();
  if(S.tab === 'clicks') fit();
}
$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('button[data-t]');
  if(b) showTab(b.dataset.t);
});
try { S.tab = localStorage.getItem('wi-admin-tab') || 'overview'; } catch {}

/* ---------- small pieces ---------- */
const day = d => new Date(d + 'T00:00:00Z').toLocaleDateString('en', {month: 'short', day: 'numeric', timeZone: 'UTC'});
const hourLabel = h => new Date(h + ':00:00Z').toLocaleTimeString('en', {hour: '2-digit', minute: '2-digit', hour12: false});
function ago(iso){
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if(!isFinite(m)) return '';
  if(m < 1) return 'just now';
  if(m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' days ago';
}
let REGION = null;
try { REGION = new Intl.DisplayNames(['en'], {type: 'region'}); } catch {}
const country = c => c === 'XX' ? 'Unknown' : (REGION && (() => { try { return REGION.of(c); } catch { return c; } })()) || c;
function source(s){
  if(s === 'direct') return 'Direct';
  return s.startsWith('utm:') ? s.slice(4) + ' (tagged link)' : s;
}
const PART = {tab: 'Tab', btn: 'Button', link: 'Link', chip: 'Chip', card: 'Card', out: 'Link out', section: 'Section',
  sort: 'Sort', open: 'Open', tick: 'Tick box', popup: 'Popup'};
function pretty(l){
  if(l === 'search:result') return 'Search result';
  if(l === 'farm:item') return 'Farm item';
  if(l === 'row') return 'Table row';
  if(l === 'keyword') return 'Keyword';
  const i = l.indexOf(':');
  if(i < 0) return PART[l] || l;
  const k = l.slice(0, i), rest = l.slice(i + 1);
  if(k === 'popup') return 'Popup · ' + (/^(card|search|farm|chip|out):|^(row|keyword)$/.test(rest) ? pretty(rest) : rest);
  return (PART[k] || k) + ' · ' + rest;
}
function pageName(p){
  const s = String(p || '');
  const e = s.match(/explore(?:\.html)?#(gems|uniques|tree)/);
  if(e) return PAGES['explore-' + e[1]];
  if(/explore/.test(s)) return 'Gems';
  const m = s.match(/#\/(\w+)/);
  return (m && PAGES[m[1]]) || 'Search';
}

/* a table with a share bar behind each number, how many rows it has, and the long tail folded away */
function table(list, head, max, show = 12){
  if(!list.length) return '<p class="note ad-none">Nothing yet.</p>';
  const top = max || Math.max(1, ...list.map(r => r.n));
  const body = list.map((r, i) => {
    const cls = [r.key ? 'ad-link' : '', i >= show ? 'ad-more' : ''].filter(Boolean).join(' ');
    return '<tr' + (cls ? ' class="' + cls + '"' : '') + (r.key ? ' data-key="' + esc(r.key) + '" tabindex="0"' : '') + '><td>' + r.html + '</td>' +
      '<td class="n"><span class="ad-share" style="width:' + (r.n / top * 100).toFixed(1) + '%"></span><b>' + num(r.n) + '</b></td></tr>';
  }).join('');
  const rows = num(list.length) + ' row' + (list.length === 1 ? '' : 's');
  return '<div class="ad-tbl"><div class="tablewrap ad-tw"><table class="ad-t"><thead><tr><th>' + esc(head) +
    '</th><th class="n">Count</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="ad-cap note"><span>' + rows + '</span>' +
    (list.length > show ? '<button type="button" class="linkbtn ad-all">Show all</button>' : '') + '</p></div>';
}
$('#dash').addEventListener('click', e => {
  const b = e.target.closest('.ad-all');
  if(!b) return;
  const box = b.closest('.ad-tbl');
  box.classList.toggle('open');
  b.textContent = box.classList.contains('open') ? 'Show less' : 'Show all';
});

/* bars, drawn at the box's own width so the text stays readable on a phone */
function bars(host, vals, labels, opt = {}){
  if(!host) return;
  const w = Math.max(260, Math.floor(host.clientWidth || 600)), h = opt.h || 170, L = 36, B = 22, T = 12;
  const peak = Math.max(1, ...vals, opt.line || 0);
  const step = 10 ** Math.floor(Math.log10(peak)), top = Math.ceil(peak / step) * step;
  const bw = (w - L) / Math.max(1, vals.length), gap = Math.min(4, bw * 0.25);
  const y = v => T + (h - B - T) * (1 - v / top);
  const every = Math.ceil(vals.length / Math.max(2, Math.floor((w - L) / 56)));
  let s = '';
  for(const g of [0, top / 2, top]) s += '<line x1="' + L + '" x2="' + w + '" y1="' + y(g) + '" y2="' + y(g) + '" class="ad-grid-l"/>' +
    '<text x="' + (L - 6) + '" y="' + (y(g) + 3.5) + '" text-anchor="end">' + num(Math.round(g)) + '</text>';
  vals.forEach((v, i) => {
    const x = L + i * bw + gap / 2, bh = Math.max(v ? 1.5 : 0, (h - B - T) * v / top);
    s += '<rect x="' + x.toFixed(1) + '" y="' + (h - B - bh).toFixed(1) + '" width="' + Math.max(1, bw - gap).toFixed(1) + '" height="' + bh.toFixed(1) + '"' +
      (opt.line && v > opt.line ? ' class="over"' : '') + '><title>' + esc(labels[i]) + ': ' + num(v) + (opt.tip ? opt.tip(i) : '') + '</title></rect>';
    if(i % every === 0) s += '<text x="' + (x + (bw - gap) / 2).toFixed(1) + '" y="' + (h - 6) + '" text-anchor="middle">' + esc(labels[i]) + '</text>';
  });
  if(opt.line) s += '<line x1="' + L + '" x2="' + w + '" y1="' + y(opt.line) + '" y2="' + y(opt.line) + '" class="ad-limit"/>' +
    '<text x="' + (w - 4) + '" y="' + (y(opt.line) - 5) + '" text-anchor="end" class="ad-limit-t">' + esc(opt.lineLabel || '') + '</text>';
  host.innerHTML = '<svg class="ad-bars" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="' +
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

/* ---------- our own numbers ---------- */
function render(){
  const d = S.data, t = d.totals;
  const range = {1: 'today', 7: 'last 7 days', 30: 'last 30 days'}[d.days];
  $('#tiles').innerHTML = [
    [t.views, 'Page views', range],
    [t.arrivals, 'Arrivals', 'from outside the site'],
    [t.clicks, 'Clicks', range],
    [t.newNotes, 'New notes', 'from players'],
  ].map(([n, l, sub]) => '<div class="panel ad-tile"><b>' + num(n) + '</b><span>' + l + '</span><small>' + sub + '</small></div>').join('');
  viewChart();
  loadPanel();

  $('#routes').innerHTML = table(d.routes.map(r => ({key: r.route, n: r.n, html: esc(PAGES[r.route] || r.route)})), 'Page');
  $('#kinds').innerHTML = table(d.kinds.map(k => ({n: k.n, html: esc(KINDS[k.kind] || k.kind)})), 'From');
  const sites = d.sources.filter(s => s.source !== 'direct');
  $('#sources').innerHTML = sites.length ? table(sites.map(s => ({n: s.n, html: esc(source(s.source)) +
    '<span class="ad-sub">' + esc(KINDS[s.kind] || '') + '</span>'})), 'Site') : '';
  $('#countries').innerHTML = table(d.countries.map(c => ({n: c.n, html: esc(country(c.country))})), 'Country');
  $('#devices').innerHTML = table(d.devices.map(x => ({n: x.n, html: esc(DEVICES[x.device] || x.device)})), 'Device', d.totals.views);

  const withClicks = Object.keys(d.clicks.byRoute);
  if(S.clickRoute !== 'all' && !withClicks.includes(S.clickRoute)) S.clickRoute = 'all';
  $('#clickpick').innerHTML = [['all', 'All pages'], ...Object.keys(PAGES).filter(r => withClicks.includes(r)).map(r => [r, PAGES[r]])]
    .map(([k, l]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.clickRoute) + '">' + esc(l) + '</button>').join('');
  clicks();

  $('#heatpage').innerHTML = Object.entries(PAGES).map(([k, l]) =>
    '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.heatRoute) + '">' + esc(l) + '</button>').join('');
  $('#heatdev').innerHTML = Object.entries(DEVICES).map(([k, l]) =>
    '<button type="button" data-k="' + k + '" aria-pressed="' + (k === S.heatDev) + '">' + l + '</button>').join('');

  notes();
  plan();
  jobs();
  const q = d.searches;
  $('#searches').innerHTML = table(q.map(s => ({n: s.n, html: esc(s.name || 'An item type') + (s.mods ? '<span class="ad-sub">' + s.mods +
    ' mod' + (s.mods === 1 ? '' : 's') + '</span>' : '') + '<span class="ad-sub">' + esc(ago(s.last)) + '</span>'})), 'Search');
}

function viewChart(){
  const d = S.data;
  if(d.days === 1){   // today: by the hour (the last 24)
    const hrs = d.load.hours.slice(-24);
    $('#charttl').textContent = 'Views per hour, last 24 hours';
    bars($('#chart'), d.load.perHour.site_view.slice(-24), hrs.map(hourLabel), {label: 'Views per hour'});
  } else {
    $('#charttl').textContent = 'Views per day';
    bars($('#chart'), d.perDay.map(x => x.n), d.perDay.map(x => day(x.day)), {label: 'Views per day'});
  }
}
function loadPanel(){
  const L = S.data.load, sum = k => L.perHour[k].reduce((a, b) => a + b, 0);
  $('#load').innerHTML = '<h4 class="ad-h4">Trade site searches per hour</h4><div id="ld-trade"></div>' +
    '<p class="note">' + num(sum('trade_search')) + ' searches, ' + num(sum('trade_fetch')) + ' fetches. Told to slow down ' +
      num(sum('trade_limited')) + ' times, ' + num(sum('trade_error')) + ' errors.</p>' +
    '<h4 class="ad-h4">Site views per hour</h4><div id="ld-site"></div>' +
    '<p class="note">' + num(sum('site_view')) + ' page views in ' + num(sum('site_batch')) + ' batches.</p>';
  loadCharts();
}
function loadCharts(){
  const L = S.data.load, hl = L.hours.map(hourLabel);
  bars($('#ld-trade'), L.perHour.trade_search, hl, {h: 150, line: L.tradeLimitPerHour, lineLabel: 'limit ~' + L.tradeLimitPerHour, label: 'Trade site searches per hour'});
  bars($('#ld-site'), L.perHour.site_view, hl, {h: 150, label: 'Site views per hour'});
}

function clicks(){
  const c = S.data.clicks, list = S.clickRoute === 'all' ? c.all : (c.byRoute[S.clickRoute] || []);
  $('#clicks').innerHTML = table(list.map(x => ({n: x.n, html: esc(pretty(x.label))})), 'What', 0, 20);
}
$('#clickpick').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if(!b) return;
  S.clickRoute = b.dataset.k;
  for(const c of $('#clickpick').children) c.setAttribute('aria-pressed', String(c === b));
  clicks();
});

/* a page's own clicks, in a popup */
function openRoute(r){
  const list = S.data.clicks.byRoute[r] || [];
  const box = document.createElement('section');
  box.className = 'panel ad-pop';
  box.innerHTML = '<h3>' + esc(PAGES[r] || r) + '</h3><p class="note">' + num((S.data.routes.find(x => x.route === r) || {}).n) + ' views · top clicks</p>' +
    table(list.slice(0, 20).map(x => ({n: x.n, html: esc(pretty(x.label))})), 'What', 0, 20) +
    '<div class="ov-go"><button type="button" class="btn gold">Heatmap</button></div>';
  const close = popup(box);
  box.querySelector('.btn.gold').addEventListener('click', () => {
    close();
    S.heatRoute = r;
    for(const c of $('#heatpage').children) c.setAttribute('aria-pressed', String(c.dataset.k === r));
    H.stale = true;
    showTab('clicks');
    $('#heatbox').closest('.panel').scrollIntoView({behavior: 'smooth', block: 'start'});
  });
}
$('#routes').addEventListener('click', e => { const tr = e.target.closest('tr[data-key]'); if(tr) openRoute(tr.dataset.key); });
$('#routes').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-key]'); if(tr && (e.key === 'Enter' || e.key === ' ')){ e.preventDefault(); openRoute(tr.dataset.key); } });

/* ---------- heatmap: the page itself in a frame, the clicks painted over it ---------- */
const H = {token: 0, cells: [], max: 0, W: 1366, h: 1200, frameKey: '', stale: true};
async function heat(){
  const box = $('#heatbox'), token = ++H.token, route = S.heatRoute, dev = S.heatDev;
  H.stale = false;
  $('#heatnote').textContent = 'Loading…';
  let r;
  try { r = await api('heat?route=' + route + '&device=' + dev + '&days=' + S.days); } catch { r = null; }
  if(token !== H.token) return;
  if(!r || !r.ok || !r.j){ $('#heatnote').textContent = r && r.status === 401 ? 'Signed out.' : 'Could not load the clicks.'; return; }
  H.cells = r.j.cells || []; H.max = r.j.max || 0; H.W = WIDTH[dev];
  $('#heatnote').textContent = num(r.j.total) + ' clicks on ' + (PAGES[route] || route) + ', ' + DEVICES[dev].toLowerCase() + ' size.';
  const key = route + '|' + dev;
  if(H.frameKey !== key || !box.querySelector('iframe')){
    H.frameKey = key;
    H.h = Math.min(6000, Math.max(900, ...H.cells.map(c => c[1] * 20 + 60)));
    box.innerHTML = '<div class="ad-heat-sz"><div class="ad-heat-in"><iframe tabindex="-1" aria-hidden="true" title="Page preview"></iframe>' +
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
}
function fit(){
  const box = $('#heatbox'), sz = box.querySelector('.ad-heat-sz'), inn = box.querySelector('.ad-heat-in');
  if(!sz) return;
  const s = Math.min(1, (box.clientWidth - 2) / H.W);
  sz.style.width = (H.W * s) + 'px'; sz.style.height = (H.h * s) + 'px';
  inn.style.width = H.W + 'px'; inn.style.height = H.h + 'px'; inn.style.transform = 'scale(' + s + ')';
  const f = inn.querySelector('iframe');
  f.style.width = H.W + 'px'; f.style.height = H.h + 'px';
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
  if(!cv) return;
  cv.width = H.W; cv.height = H.h;
  const g = cv.getContext('2d');
  g.fillStyle = 'rgba(0,0,0,.38)';
  g.fillRect(0, 0, H.W, H.h);
  if(!H.max) return;
  const cw = H.W * 0.02, r = Math.max(cw, 20) * 0.9;
  g.filter = 'blur(5px)';
  for(const [xb, yb, n] of [...H.cells].sort((a, b) => a[2] - b[2])){
    const t = Math.sqrt(n / H.max), [R, G, B] = ramp(t);
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

/* ---------- notes from players ---------- */
const NEXT = {new: [['read', 'Mark read'], ['done', 'Done']], read: [['done', 'Done'], ['new', 'Mark new']], done: [['new', 'Mark new']]};
const noteButtons = n => NEXT[n.status].map(([s, l]) => '<button type="button" class="btn" data-id="' + n.id + '" data-s="' + s + '">' + l + '</button>').join('');
function notes(){
  const sg = S.data.suggestions, c = sg.count, all = c.new + c.read + c.done;
  $('#notect').textContent = c.new ? num(c.new) : '';
  $('#notepick').innerHTML = [['new', 'New', c.new], ['read', 'Read', c.read], ['done', 'Done', c.done], ['all', 'All', all]]
    .map(([k, l, n]) => '<button type="button" class="chip" data-k="' + k + '" aria-pressed="' + (k === S.notes) + '">' + l +
      '<span class="ct">' + num(n) + '</span></button>').join('');
  const list = sg.list.filter(n => S.notes === 'all' || n.status === S.notes);
  $('#notes').innerHTML = list.length ? list.map(n => '<li class="ad-note s-' + esc(n.status) + '">' +
    '<p class="ad-note-t" data-open="' + n.id + '" tabindex="0">' + esc(n.text) + '</p>' +
    '<div class="ad-note-ft"><span class="note">' + esc(pageName(n.page)) + ' · ' + esc(ago(n.at)) + '</span><span class="grow"></span>' + noteButtons(n) + '</div></li>').join('')
    : '<li class="note ad-none">Nothing here.</li>';
  $('#notemore').innerHTML = S.more ? '<button type="button" class="btn" id="older">Load older</button>' +
    '<span class="note">' + num(sg.list.length) + ' of ' + num(all) + ' loaded</span>' : '';
}
async function mark(id, status){
  const r = await api('suggestion', {id, status}).catch(() => null);
  if(!r || !r.ok) return false;
  const n = S.data.suggestions.list.find(x => x.id === id), c = S.data.suggestions.count;
  if(n && n.status !== status){ c[n.status]--; c[status]++; n.status = status; }
  S.data.totals.newNotes = c.new;
  $('#tiles .ad-tile:nth-child(4) b').textContent = num(c.new);
  notes();
  return true;
}
function openNote(id){
  const n = S.data.suggestions.list.find(x => x.id === id);
  if(!n) return;
  const box = document.createElement('section');
  box.className = 'panel ad-pop';
  const paint = () => {
    box.innerHTML = '<h3>Note</h3><p class="note">' + esc(pageName(n.page)) + ' · ' + esc(ago(n.at)) + '</p>' +
      '<p class="ad-note-full">' + esc(n.text) + '</p><div class="ov-go">' + noteButtons(n) + '</div>';
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
  S.notes = b.dataset.k;
  notes();
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
  const list = S.data.suggestions.list, last = list.length ? list[list.length - 1].id : 0;
  const r = await api('suggestions?before=' + last).catch(() => null);
  if(!r || !r.ok || !r.j){ b.disabled = false; b.textContent = 'Load older'; return; }
  const have = new Set(list.map(x => x.id));
  for(const n of r.j.list) if(!have.has(n.id)) list.push(n);
  S.more = !!r.j.more;
  notes();
});

/* ---------- the free plan ---------- */
function meter(label, used, limit, sub){
  const p = limit ? used / limit * 100 : 0;
  return '<div class="ad-meter-row"><div class="ad-meter-hd"><span>' + label + '</span><b>' + num(used) + ' / ' + num(limit) +
    ' <small>' + (p < 1 && used ? '<1' : Math.round(p)) + '%</small></b></div>' +
    '<div class="ad-meter' + (p >= 80 ? ' bad' : p >= 50 ? ' warn' : '') + '"><i style="width:' + Math.min(100, p).toFixed(1) + '%"></i></div>' +
    (sub ? '<p class="note">' + sub + '</p>' : '') + '</div>';
}
function plan(){
  const p = S.data.plan, f = p.free, t = p.today;
  const verdict = {fine: 'Free plan is fine.', watch: 'Free plan is fine for now. Past half of the daily limit.',
    upgrade: 'Close to the free limit: upgrade to Workers Paid ($5/month).'}[p.verdict];
  $('#plan').innerHTML = '<p class="ad-verdict v-' + esc(p.verdict) + '">' + verdict + '</p>' +
    meter('Database writes today (about)', t.writes, f.d1Writes, 'Page tracking ' + num(t.trackingWrites) + ' · trade prices ' + num(t.priceWrites)) +
    meter('Worker requests today (about)', t.requests, f.requests, num(t.views) + ' page views, ' + num(t.batches) + ' tracking batches') +
    '<p class="note">Free plan, per day: ' + num(f.requests) + ' requests · ' + num(f.d1Reads / 1e6) + ' million database reads · ' +
      num(f.d1Writes) + ' database writes · ' + f.d1StorageGB + ' GB stored.</p>' +
    '<p class="note ad-links">Exact numbers on Cloudflare: <a href="' + esc(p.links.traffic) + '" target="_blank" rel="noopener">Traffic</a> · ' +
      '<a href="' + esc(p.links.workers) + '" target="_blank" rel="noopener">Workers &amp; Pages</a> · ' +
      '<a href="' + esc(p.links.d1) + '" target="_blank" rel="noopener">Database</a></p>';
}

/* ---------- data jobs: when each file and each kind of trade price last came in ---------- */
const JOBS = [   // [where, what, label, hours before it counts as late]
  ['files', 'exchange.json', 'Currency prices', 2], ['files', 'market.json', 'Currency list', 2], ['files', 'leagues.json', 'League dates', 7],
  ['prices', 'uniq', 'Unique prices', 2], ['prices', 'roll', 'Mod roll prices', 2], ['prices', 'farm', 'Farm prices', 2], ['prices', 'cur', 'Currency listings', 2],
];
function jobs(){
  const j = S.data.jobs || {};
  $('#jobs').innerHTML = '<div class="tablewrap ad-tw"><table class="ad-t"><thead><tr><th>What</th><th class="n">Last in</th></tr></thead><tbody>' +
    JOBS.map(([k, name, l, late]) => {
      const at = (j[k] || {})[name], h = at ? (Date.now() - Date.parse(at)) / 3600e3 : null;
      return '<tr><td>' + l + '</td><td class="n">' + (h === null ? '—' : '<span class="ad-g g-' + (h <= late ? 'good' : h <= late * 3 ? 'ok' : 'poor') +
        '" title="' + esc(new Date(at).toUTCString()) + '">' + esc(ago(at)) + '</span>') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
}

/* ---------- Cloudflare's own numbers (worker/cfstats.js) ---------- */
const COUNTRY = code => { try { return new Intl.DisplayNames(['en'], {type: 'region'}).of(code) || code; } catch { return code; } };
const bytes = b => b >= 1e9 ? (b / 1e9).toFixed(2) + ' GB' : b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.round(b / 1e3) + ' kB';
const PATH = x => x.k === '/' ? 'Home (/)' : x.k || '(none)';
const REF = x => !x.k ? 'Direct (typed or bookmarked)' : x.k === location.hostname ? 'Within the site' : x.k;
const VISITS = x => x.visits ? '<span class="ad-sub">' + num(x.visits) + ' visits</span>' : '';
const BYTES = x => x.bytes ? '<span class="ad-sub">' + bytes(x.bytes) + '</span>' : '';
const dig = (o, path) => path.split('.').reduce((v, k) => v && v[k], o);

/* every breakdown Cloudflare gives us, each in its own box: box, where the rows are, title, note, row name, row sub-line */
const BREAK = [
  // Visitors: real people (Web Analytics)
  {box: 'cfreal', k: 'rum.pages', t: 'Pages', p: 'Real visitors: browsers only, no cookies.', name: PATH, sub: VISITS, show: 15},
  {box: 'cfreal', k: 'rum.refs', t: 'Where they came from', name: REF, sub: VISITS, show: 15},
  {box: 'cfreal', k: 'rum.countries', t: 'Countries', name: x => COUNTRY(x.k), sub: VISITS, show: 15},
  {box: 'cfreal', k: 'rum.browsers', t: 'Browsers', sub: VISITS},
  {box: 'cfreal', k: 'rum.systems', t: 'Systems', sub: VISITS},
  {box: 'cfreal', k: 'rum.devices', t: 'Devices', sub: VISITS},
  {box: 'cfreal', k: 'rum.hosts', t: 'Hosts', p: 'Which name they came in on.', sub: VISITS},
  // Visitors: everyone Cloudflare saw, people and bots
  {box: 'cfwho', k: 'askers', t: 'Who is asking', p: 'People, search engines, AI crawlers and scripts.'},
  {box: 'cfwho', k: 'crawlers', t: 'Crawlers by name', name: x => x.k + ' · ' + x.kind, show: 15},
  {box: 'cfwho', k: 'countries', t: 'Countries', p: 'Every request, people and bots.', name: x => COUNTRY(x.k),
    sub: x => (x.threats ? '<span class="ad-sub">' + num(x.threats) + ' threats · ' + bytes(x.bytes || 0) + '</span>' : BYTES(x)), show: 15},
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
  {box: 'cftraffic', k: 'scheme', t: 'https or plain'},
  {box: 'cftraffic', k: 'accept', t: 'What they asked for', p: 'The kind of answer the request wanted.'},
  {box: 'cftraffic', k: 'status', t: 'Status codes', p: 'What we answered.', name: x => 'Status ' + x.k},
  {box: 'cftraffic', k: 'originStatus', t: 'Server status codes', p: 'What the worker answered before the cache.', name: x => 'Status ' + x.k},
  {box: 'cftraffic', k: 'cache', t: 'Cache', p: 'A hit never reached the worker.', sub: BYTES},
  {box: 'cftraffic', k: 'types', t: 'Content types'},
  {box: 'cftraffic', k: 'protocols', t: 'HTTP versions'},
  {box: 'cftraffic', k: 'tls', t: 'TLS versions'},
  {box: 'cftraffic', k: 'upperColo', t: 'Upper tier', p: 'The bigger data centre behind the one that answered.', show: 10},
  {box: 'cftraffic', k: 'rum.refs', t: 'Referring sites', p: 'Real visitors only: this plan gives us no referrer per request.', name: REF, show: 15},
  {box: 'cftraffic', k: 'threatKinds', t: 'Threats stopped', p: 'What Cloudflare blocked, and why.'},
];
const rowList = (list, b) => table((list || []).filter(x => x.n).map(x => ({n: x.n,
  html: esc(b.name ? b.name(x) : x.k || '(none)') + (b.sub ? b.sub(x) : '')})), '', 0, b.show || 12);

async function cloudflare(){
  let r;
  try { r = await api('cloudflare?days=' + S.days); } catch { r = null; }
  const c = r && r.ok ? r.j : null;
  if(!c || c.error){ $('#cfnotes').textContent = 'Cloudflare numbers are not available right now' + (c && c.error ? ': ' + c.error : '.'); return; }
  S.cf = c;
  const t = c.totals, range = {1: 'today', 7: 'last 7 days', 30: 'last 30 days'}[c.days];
  $('#cfnotes').innerHTML = esc(['Straight from Cloudflare, refreshed every 5 minutes.', ...(c.notes || [])].join(' ')) +
    (c.missing && c.missing.length ? ' <b>Not available:</b> ' + esc(c.missing.join(', ')) + '.' : '');
  $('#cftiles').innerHTML = [
    [num(t.visits ?? 0), 'Real visits', 'people in browsers, ' + range],
    [num(t.pageLoads ?? 0), 'Real page loads', range],
    [num(t.uniques), 'Unique visitors', 'per day, added up'],
    [num(t.pageViews), 'Page views', 'people and bots'],
    [num(t.requests), 'Requests', range],
    [bytes(t.bytes), 'Data served', Math.round(t.cachedBytes / Math.max(1, t.bytes) * 100) + '% from cache'],
    [Math.round(t.cachedRequests / Math.max(1, t.requests) * 100) + '%', 'Requests cached', num(t.cachedRequests) + ' never hit the worker'],
    [Math.round(t.encryptedRequests / Math.max(1, t.requests) * 100) + '%', 'Encrypted', num(t.requests - t.encryptedRequests) + ' plain'],
    [num(t.threats), 'Threats', 'stopped by Cloudflare'],
    [num(c.workers.errors), 'Server errors', num(c.workers.requests) + ' server requests'],
  ].map(([n, l, sub]) => '<div class="panel ad-tile"><b>' + n + '</b><span>' + l + '</span><small>' + sub + '</small></div>').join('');

  const box = {};
  for(const b of BREAK) (box[b.box] = box[b.box] || []).push(b);
  for(const id of Object.keys(box)) $('#' + id).innerHTML = box[id].map(b =>
    '<div class="panel ad-box"><div class="ad-hd"><h3>' + esc(b.t) + '</h3>' + (b.p ? '<p>' + esc(b.p) + '</p>' : '') + '</div>' +
    rowList(dig(c, b.k), b) + '</div>').join('');

  speed(c);
  const W = c.workers, lastD1 = (c.d1 || []).slice(-1)[0] || {rowsRead: 0, rowsWritten: 0}, days1 = Math.max(1, (c.daily || []).length);
  $('#cfserver').innerHTML =
    meter('Server requests, per day (average)', Math.round(W.requests / days1), c.free.requests, 'Errors: ' + num(W.errors) + ' · ' +
      W.byStatus.map(s => esc(s.k) + ' ' + num(s.n)).join(' · ') + ' · CPU per request: half under ' + W.cpu50 + ' ms, 99% under ' + W.cpu99 + ' ms') +
    meter('Database rows read today', lastD1.rowsRead, c.free.d1Reads) +
    meter('Database rows written today', lastD1.rowsWritten, c.free.d1Writes, num(lastD1.reads) + ' read queries, ' + num(lastD1.writes) + ' write queries today');
  redraw();
}

/* page speed: the good / needs work / poor split, then every page, then where the time goes */
const CWV = [['lcp', 'Main content shown'], ['inp', 'Reaction to a click'], ['cls', 'Things jumping around'],
  ['fcp', 'First paint'], ['ttfb', 'First byte from us']];
function speed(c){
  const R = c.rum || {}, sp = R.split || {};
  const have = CWV.filter(([k]) => sp[k]);
  $('#cfsplit').innerHTML = have.length ? '<div class="ad-cwv">' + have.map(([k, l]) => {
    const s = sp[k], all = Math.max(1, s.good + s.ok + s.poor), pc = n => (n / all * 100).toFixed(1) + '%';
    return '<div class="ad-cwv-row"><div class="ad-cwv-hd"><span>' + esc(l) + '</span><b>' + Math.round(s.good / all * 100) + '% good</b></div>' +
      '<div class="ad-cwv-bar"><i class="g" style="width:' + pc(s.good) + '" title="Good ' + num(s.good) + '"></i>' +
      '<i class="o" style="width:' + pc(s.ok) + '" title="Needs work ' + num(s.ok) + '"></i>' +
      '<i class="p" style="width:' + pc(s.poor) + '" title="Poor ' + num(s.poor) + '"></i></div>' +
      '<p class="note">' + num(s.good) + ' good · ' + num(s.ok) + ' needs work · ' + num(s.poor) + ' poor</p></div>';
  }).join('') + '</div>' : '<p class="note ad-none">Nothing yet.</p>';

  const grade = (v, good, poor) => v === null || v === undefined ? '' : v <= good ? 'good' : v <= poor ? 'ok' : 'poor';
  const cell = (v, unit, good, poor) => v === null || v === undefined ? '<td class="n">—</td>' :
    '<td class="n"><span class="ad-g g-' + grade(v, good, poor) + '">' + (unit === 's' ? (v / 1000).toFixed(2) + ' s' : unit === 'ms' ? num(v) + ' ms' : (+v).toFixed(2)) + '</span></td>';
  $('#cfspeed').innerHTML = R.vitals && R.vitals.length ? '<div class="tablewrap ad-tw"><table class="ad-t"><thead><tr><th>Page</th><th class="n">Loads</th>' +
    '<th class="n" title="Biggest thing on screen shown">Main content</th><th class="n" title="Reaction to a click or key">Reaction</th>' +
    '<th class="n" title="Things jumping around while loading">Jumpiness</th><th class="n" title="First thing on screen">First paint</th>' +
    '<th class="n" title="First byte back from us">First byte</th><th class="n">Full load (half / 90%)</th></tr></thead><tbody>' +
    R.vitals.map(v => '<tr><td>' + esc(v.path === '/' ? 'Home (/)' : v.path) + '</td><td class="n">' + num(v.n) + '</td>' +
      cell(v.lcp, 's', 2500, 4000) + cell(v.inp, 'ms', 200, 500) + cell(v.cls, '', 0.1, 0.25) + cell(v.fcp, 's', 1800, 3000) + cell(v.ttfb, 'ms', 800, 1800) +
      '<td class="n">' + (v.load50 !== null ? (v.load50 / 1000).toFixed(2) + ' s / ' + (v.load90 / 1000).toFixed(2) + ' s' : '—') + '</td></tr>').join('') +
    '</tbody></table></div><p class="note">Green is good, amber needs work, red is poor (Google’s own lines).</p>' : '<p class="note ad-none">Nothing yet.</p>';

  const p = R.parts, time = v => v === null || v === undefined ? '—' : v >= 1000 ? (v / 1000).toFixed(2) + ' s' : num(v) + ' ms';
  $('#cfparts').innerHTML = p && p.length ? '<div class="tablewrap ad-tw"><table class="ad-t"><thead><tr><th>Step</th>' +
    '<th class="n">Half of them</th><th class="n">75% of them</th></tr></thead><tbody>' +
    p.map(s => '<tr><td>' + esc(s.k) + '</td><td class="n"><b>' + time(s.p50) + '</b></td><td class="n"><b>' + time(s.p75) + '</b></td></tr>').join('') +
    '</tbody></table></div>' : '<p class="note ad-none">Nothing yet.</p>';

  // how fast we answered, before the browser did anything with it
  const SIDE = [['edge', 'Cloudflare’s first byte', 'From the data centre nearest the visitor.'],
    ['origin', 'The worker’s answer', 'Only the requests the cache did not cover.']];
  const got = SIDE.filter(([k]) => c[k]);
  $('#cfedge').innerHTML = got.length ? '<div class="tablewrap ad-tw"><table class="ad-t"><thead><tr><th>What</th>' +
    '<th class="n">Average</th><th class="n">Half of them</th><th class="n">90% of them</th></tr></thead><tbody>' +
    got.map(([k, l, note]) => { const s = c[k];
      return '<tr><td>' + l + '<span class="ad-sub">' + note + '</span></td><td class="n"><b>' + time(s.avg) + '</b></td>' +
        '<td class="n"><b>' + time(s.p50) + '</b></td><td class="n"><b>' + time(s.p90) + '</b></td></tr>'; }).join('') +
    '</tbody></table></div>' : '<p class="note ad-none">Nothing yet.</p>';
}

/* the charts on Cloudflare's numbers */
function cfChart(where, what){
  const c = S.cf;
  if(!c || !$(where)) return;
  const d = what === 'visits' ? ((c.rum && c.rum.byDay) || []) : (c.daily || []);
  const val = x => what === 'visits' ? x.visits : x.requests;
  if(d.length < 2){ $(where).innerHTML = '<p class="note">' + (d[0] ? day(d[0].date) + ': ' + num(val(d[0])) +
    '. The chart fills in day by day.' : 'Nothing yet.') + '</p>'; return; }
  bars($(where), d.map(val), d.map(x => day(x.date)), {label: what === 'visits' ? 'Real visits per day' : 'Requests per day'});
}
function cfHourChart(){
  const c = S.cf;
  if(!c || !$('#cfhour')) return;
  const h = c.hourly || [];
  $('#cfhourtl').textContent = 'Requests per hour' + (c.adaptiveHours ? ', last ' + (c.adaptiveHours / 24 >= 1 ? (c.adaptiveHours / 24) + ' days' : c.adaptiveHours + ' hours') : '');
  if(!h.length){ $('#cfhour').innerHTML = '<p class="note ad-none">Nothing yet.</p>'; return; }
  bars($('#cfhour'), h.map(x => x.n), h.map(x => hourLabel(x.hour)), {label: 'Requests per hour',
    tip: i => ' · ' + bytes(h[i].bytes || 0)});
}
function cfD1Chart(){
  const c = S.cf;
  if(!c || !$('#cfd1')) return;
  const d = c.d1 || [];
  if(!d.length){ $('#cfd1').innerHTML = '<p class="note ad-none">Nothing yet.</p>'; return; }
  $('#cfd1').innerHTML = '<h4 class="ad-h4">Rows written</h4><div id="d1-w"></div><h4 class="ad-h4">Rows read</h4><div id="d1-r"></div>';
  bars($('#d1-w'), d.map(x => x.rowsWritten), d.map(x => day(x.date)), {h: 150, label: 'Rows written per day'});
  bars($('#d1-r'), d.map(x => x.rowsRead), d.map(x => day(x.date)), {h: 150, label: 'Rows read per day'});
}

/* charts and the heatmap follow the window's width */
let rs = 0;
addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(redraw, 150); });

load();
