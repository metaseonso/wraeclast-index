/* The owner's dashboard (admin.html): page views, clicks and click spots, counted per day.
   assets/track.js sends them in small batches. Nothing about the person is kept: no address, no cookie,
   no typed text. The country is Cloudflare's two letters.
     POST /api/t                     a batch from assets/track.js
     POST /api/admin/login           {password}: checked against the DASH_HASH secret; sets a 12-hour cookie
     POST /api/admin/logout
     GET  /api/admin/stats?days=1|7|30   (with the data jobs: fine, late or stopped, worker/health.js)
     GET  /api/admin/heat?route=&device=&days=
     GET  /api/admin/cloudflare?days=1|7|30   Cloudflare's own numbers (worker/cfstats.js)
     GET  /api/admin/suggestions?before=<id>  a hundred notes, newest first, and how many of each kind
     POST /api/admin/suggestion      {id, status: new|read|done}
   admin.html itself holds no data: everything comes from here, behind the cookie.
   DASH_HASH is "pbkdf2$<iterations>$<salt base64>$<hash base64>" (PBKDF2-SHA256 of the password). */
import { sameSite, allowed } from './community.js';
import { cloudflare } from './cfstats.js';
import { health } from './health.js';

export const ROUTES = ['home', 'build', 'currency', 'trade', 'farms', 'atlas', 'explore-gems', 'explore-uniques', 'explore-tree'];
const ROUTE = new Set(ROUTES), DEVICE = new Set(['phone', 'tablet', 'desktop']), STATUS = new Set(['new', 'read', 'done']);
export const MAX = {views: 50, clicks: 200, heat: 200};
const NOTES = 100;   // notes from players per page, here and in /api/admin/suggestions
const LOAD_KINDS = ['trade_search', 'trade_fetch', 'trade_limited', 'trade_error', 'site_view', 'site_batch', 'd1_writes'];
/* Cloudflare Workers Free plan, per day (storage in total) */
export const FREE = {requests: 100000, d1Reads: 5000000, d1Writes: 100000, d1StorageGB: 5};
const CF = 'https://dash.cloudflare.com/80fa25161d1d4403df3b849853368410';
const LINKS = {
  traffic: CF + '/wraeclastindex.fyi/analytics/traffic',
  workers: CF + '/workers-and-pages',
  d1: CF + '/workers/d1/databases/d1c4d101-dce9-4f19-9dc3-4525eca2f17e',
};

const enc = new TextEncoder();
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', ...extra}});
const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
const hourOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 13);
const hostOf = s => { try { return new URL(s).host; } catch { return ''; } };
const int = (v, lo, hi) => { const n = Math.floor(+v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null; };
const LOAD_SQL = 'INSERT INTO load (hour, kind, n) VALUES (?, ?, ?) ON CONFLICT(hour, kind) DO UPDATE SET n = n + excluded.n';

/* our own pages only: fetch sends X-WI; sendBeacon cannot, so a same-origin Origin (or Referer) will do */
function fromUs(request, url){
  try { if(sameSite(request, url)) return true; } catch {}
  const origin = request.headers.get('Origin');
  if(origin) return hostOf(origin) === url.host;
  return hostOf(request.headers.get('Referer')) === url.host;
}
const writeOK = (request, url) => { try { return sameSite(request, url); } catch { return false; } };

/* ---------- POST /api/t ---------- */
const label = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f<>"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim() : '';
const source = v => {
  const s = typeof v === 'string' ? v.toLowerCase().slice(0, 60) : '';
  return /^[a-z0-9][a-z0-9.:_-]*$/.test(s) ? s : 'other';
};
/* a batch, checked and trimmed; null when it is not one of ours */
export function cleanBatch(b){
  if(!b || typeof b !== 'object') return null;
  const v = b.v === undefined ? [] : b.v, c = b.c === undefined ? [] : b.c, h = b.h === undefined ? [] : b.h;
  if(!Array.isArray(v) || !Array.isArray(c) || !Array.isArray(h)) return null;
  if(v.length > MAX.views || c.length > MAX.clicks || h.length > MAX.heat) return null;
  const ok = x => Array.isArray(x) && ROUTE.has(x[0]);
  return {
    views: v.filter(x => ok(x) && DEVICE.has(x[2])).map(x => ({route: x[0], source: source(x[1]), device: x[2]})),
    clicks: c.filter(ok).map(x => ({route: x[0], label: label(x[1]), n: int(x[2] ?? 1, 1, 50) || 1})).filter(x => x.label),
    heat: h.filter(x => ok(x) && DEVICE.has(x[1]) && int(x[2], 0, 49) !== null && int(x[3], 0, 299) !== null)
      .map(x => ({route: x[0], device: x[1], xb: int(x[2], 0, 49), yb: int(x[3], 0, 299), n: int(x[4] ?? 1, 1, 50) || 1})),
  };
}
const group = (list, key) => {
  const m = new Map();
  for(const x of list){ const k = key(x), g = m.get(k); if(g) g.n += x.n ?? 1; else m.set(k, {...x, n: x.n ?? 1}); }
  return [...m.values()];
};

export async function track(request, env, url){
  if(request.method !== 'POST') return json(405, {error: 'POST only.'});
  if(!fromUs(request, url)) return json(403, {error: 'Not allowed.'});
  const raw = await request.text();
  if(raw.length > 40000) return json(413, {error: 'Too big.'});
  let body; try { body = JSON.parse(raw); } catch { return json(400, {error: 'Bad batch.'}); }
  const b = cleanBatch(body);
  if(!b) return json(400, {error: 'Bad batch.'});
  if(!b.views.length && !b.clicks.length && !b.heat.length) return json(200, {ok: true, saved: 0});
  if(!(await allowed(env, request, 'track', 120))) return json(429, {error: 'Slow down.'});
  const cc = request.cf && request.cf.country, country = /^[A-Z]{2}$/.test(cc || '') ? cc : 'XX';
  const day = dayOf(), hour = hourOf();
  const views = group(b.views, x => x.route + '|' + x.source + '|' + x.device);
  const clicks = group(b.clicks, x => x.route + '|' + x.label);
  const heat = group(b.heat, x => [x.route, x.device, x.xb, x.yb].join('|'));
  const stmts = [
    ...views.map(x => env.DB.prepare(`INSERT INTO views (day, route, source, device, country, n) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, route, source, device, country) DO UPDATE SET n = n + excluded.n`).bind(day, x.route, x.source, x.device, country, x.n)),
    ...clicks.map(x => env.DB.prepare(`INSERT INTO clicks (day, route, label, n) VALUES (?, ?, ?, ?)
      ON CONFLICT(day, route, label) DO UPDATE SET n = n + excluded.n`).bind(day, x.route, x.label, x.n)),
    ...heat.map(x => env.DB.prepare(`INSERT INTO heat (day, route, device, xb, yb, n) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(route, day, device, xb, yb) DO UPDATE SET n = n + excluded.n`).bind(day, x.route, x.device, x.xb, x.yb, x.n)),
  ];
  const load = [['site_batch', 1]];
  if(b.views.length) load.push(['site_view', b.views.length]);
  // rows this batch writes: one per count (WITHOUT ROWID tables), two per load row (row + key index),
  // two for the rate-limit row that allowed() just wrote
  const writes = stmts.length + (load.length + 1) * 2 + 2;
  load.push(['d1_writes', writes]);
  stmts.push(...load.map(([k, n]) => env.DB.prepare(LOAD_SQL).bind(hour, k, n)));
  await env.DB.batch(stmts);
  return json(200, {ok: true, saved: views.length + clicks.length + heat.length});
}

/* ---------- sign-in ---------- */
const COOKIE = 'wi_admin', LIFE = 12 * 3600;
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const b64url = buf => b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
export function parseHash(s){
  const m = typeof s === 'string' && s.trim().match(/^pbkdf2\$(\d{1,6})\$([A-Za-z0-9+/_-]+=*)\$([A-Za-z0-9+/_-]+=*)$/);
  if(!m) return null;
  const iterations = +m[1];
  if(iterations < 1 || iterations > 100000) return null;   // the Workers limit for PBKDF2
  try { return {iterations, salt: unb64(m[2].replace(/=+$/, '')), hash: unb64(m[3].replace(/=+$/, ''))}; } catch { return null; }
}
export function same(a, b){   // constant time
  let d = a.length ^ b.length;
  for(let i = 0; i < Math.max(a.length, b.length); i++) d |= (a[i] | 0) ^ (b[i] | 0);
  return d === 0;
}
export async function checkPassword(password, stored){
  const h = parseHash(stored);
  if(!h || h.hash.length < 16 || typeof password !== 'string' || !password || password.length > 200) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name: 'PBKDF2', hash: 'SHA-256', salt: h.salt, iterations: h.iterations}, key, h.hash.length * 8);
  return same(new Uint8Array(bits), h.hash);
}
/* the cookie's signing key comes from DASH_HASH: a new password signs everyone out */
async function cookieKey(env){
  const raw = await crypto.subtle.digest('SHA-256', enc.encode('wi-admin-cookie|' + env.DASH_HASH));
  return crypto.subtle.importKey('raw', raw, {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function makeCookie(env, now = Math.floor(Date.now() / 1000)){
  const exp = now + LIFE;
  const sig = await crypto.subtle.sign('HMAC', await cookieKey(env), enc.encode('admin|' + exp));
  return exp + '.' + b64url(sig);
}
export async function signedIn(request, env){
  const m = (request.headers.get('Cookie') || '').match(/(?:^|;\s*)wi_admin=(\d{10})\.([\w-]{43})(?:;|$)/);
  if(!m) return false;
  const exp = +m[1], now = Math.floor(Date.now() / 1000);
  if(exp <= now || exp > now + LIFE + 60) return false;
  try { return await crypto.subtle.verify('HMAC', await cookieKey(env), unb64(m[2]), enc.encode('admin|' + exp)); } catch { return false; }
}
const setCookie = (value, age) => COOKIE + '=' + value + '; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=' + age;

async function login(request, env, url){
  if(request.method !== 'POST' || !writeOK(request, url)) return json(403, {error: 'Not allowed.'});
  if(!parseHash(env.DASH_HASH)) return json(503, {error: 'Not set up.'});
  if(!(await allowed(env, request, 'login', 5))) return json(429, {error: 'Too many tries.'});
  let body = {};
  try { body = await request.json(); } catch {}
  if(!(await checkPassword(body && body.password, env.DASH_HASH))) return json(401, {error: 'Wrong password.'});
  return json(200, {ok: true}, {'Set-Cookie': setCookie(await makeCookie(env), LIFE)});
}

/* ---------- /api/admin/* ---------- */
export async function admin(request, env, url){
  const path = url.pathname.slice('/api/admin/'.length);
  if(path === 'login') return login(request, env, url);
  if(!parseHash(env.DASH_HASH)) return json(503, {error: 'Not set up.'});
  if(request.method === 'POST' && !writeOK(request, url)) return json(403, {error: 'Not allowed.'});
  if(!(await signedIn(request, env))) return json(401, {error: 'Sign in.'});
  if(path === 'logout' && request.method === 'POST') return json(200, {ok: true}, {'Set-Cookie': setCookie('', 0)});
  // each of these answers on its own: one that breaks says so, the dashboard keeps its other parts
  if(path === 'stats' && request.method === 'GET') return own(() => stats(env, url));
  if(path === 'heat' && request.method === 'GET') return heatmap(env, url);
  if(path === 'cloudflare' && request.method === 'GET') return own(() => cloudflare(env, url));
  if(path === 'suggestions' && request.method === 'GET') return own(() => olderSuggestions(env, url));
  if(path === 'suggestion' && request.method === 'POST') return setSuggestion(request, env);
  return json(404, {error: 'Not found.'});
}
/* one part of the dashboard: its answer, or why it could not be made (never an empty worker error page) */
async function own(make){
  try { return json(200, await make()); }
  catch(e){ return json(502, {error: String((e && e.message) || e).slice(0, 200)}); }
}
const rangeOf = url => { const d = +url.searchParams.get('days'); return [1, 7, 30].includes(d) ? d : 7; };
const sinceOf = days => dayOf(Date.parse(dayOf()) - (days - 1) * 86400e3);

/* how someone arrived, in plain groups */
const AI = /(^|\.)(chatgpt\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|you\.com|phind\.com|meta\.ai|grok\.com)$/;
const SEARCH = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|yahoo\.[a-z.]+|yandex\.[a-z.]+|baidu\.com|ecosia\.org|search\.brave\.com|qwant\.com|startpage\.com|naver\.com|seznam\.cz|kagi\.com)$/;
const SOCIAL = /(^|\.)(reddit\.com|redd\.it|youtube\.com|youtu\.be|twitch\.tv|discord\.com|discordapp\.com|discord\.gg|x\.com|twitter\.com|t\.co|facebook\.com|fb\.com|instagram\.com|tiktok\.com|bsky\.app|threads\.net|vk\.com|steamcommunity\.com|kick\.com)$/;
export function kindOf(src){
  if(src === 'direct' || src === 'site') return src;
  const s = src.startsWith('utm:') ? src.slice(4) : src;
  if(AI.test(s) || /^(chatgpt|openai|perplexity|claude|gemini|copilot|grok)\b/.test(s)) return 'ai';
  if(SEARCH.test(s) || /^(google|bing|duckduckgo|yahoo|yandex|ecosia|brave)$/.test(s)) return 'search';
  if(SOCIAL.test(s) || /^(reddit|youtube|twitch|discord|twitter|x|facebook|instagram|tiktok|bluesky|steam)$/.test(s)) return 'social';
  return 'other';
}
const add = (m, k, n) => m.set(k, (m.get(k) || 0) + n);
const top = (m, n, name) => [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]))).slice(0, n).map(([k, v]) => ({[name]: k, n: v}));

/* a trade search, in plain words (no ids): the unique or base name, else just "an item type", and how many mods */
function searchName(state){
  let s; try { s = JSON.parse(state); } catch { return {name: null, mods: 0}; }
  const it = s && s.item;
  const name = it && (it.k === 'unique' || it.k === 'base') && typeof it.v === 'string' ? it.v.slice(0, 60) : null;
  const mods = (Array.isArray(s && s.groups) ? s.groups : []).reduce((a, g) => a + (Array.isArray(g && g.mods) ? g.mods.length : 0), 0);
  return {name, mods};
}

export async function stats(env, url){
  const days = rangeOf(url), since = sinceOf(days), today = dayOf(), now = Date.now();
  const since48 = hourOf(now - 47 * 3600e3);
  const [v, c, sg, sgCount, ld, ts] = (await env.DB.batch([
    env.DB.prepare('SELECT day, route, source, device, country, n FROM views WHERE day >= ?').bind(since),
    env.DB.prepare('SELECT route, label, SUM(n) AS n FROM clicks WHERE day >= ? GROUP BY route, label').bind(since),
    env.DB.prepare('SELECT id, text, page, at, status FROM suggestions ORDER BY id DESC LIMIT ' + NOTES),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM suggestions GROUP BY status'),
    env.DB.prepare('SELECT hour, kind, n FROM load WHERE hour >= ?').bind(since48),
    env.DB.prepare('SELECT state, n, last FROM trade_searches WHERE last >= ? ORDER BY n DESC, last DESC LIMIT 10').bind(since),
  ])).map(r => (r && r.results) || []);

  // views: one pass over the range, every table from it
  const perDay = new Map(), routes = new Map(), sources = new Map(), kinds = new Map(), countries = new Map(), devices = new Map();
  let views = 0, arrivals = 0;
  for(const r of v){
    views += r.n; add(perDay, r.day, r.n); add(routes, r.route, r.n); add(countries, r.country, r.n); add(devices, r.device, r.n);
    if(r.source !== 'site'){ arrivals += r.n; add(sources, r.source, r.n); add(kinds, kindOf(r.source), r.n); }
  }
  const dayList = [];
  for(let t = Date.parse(since); t <= Date.parse(today); t += 86400e3) dayList.push(dayOf(t));

  // clicks: overall and per page
  const all = new Map(), byRoute = {};
  let clicks = 0;
  for(const r of c){
    clicks += r.n; add(all, r.label, r.n);
    add(byRoute[r.route] = byRoute[r.route] || new Map(), r.label, r.n);
  }

  // load: the last 48 hours, and today so far
  const hours = [];
  for(let i = 47; i >= 0; i--) hours.push(hourOf(now - i * 3600e3));
  const perHour = Object.fromEntries(LOAD_KINDS.map(k => [k, hours.map(() => 0)]));
  const todayLoad = Object.fromEntries(LOAD_KINDS.map(k => [k, 0]));
  for(const r of ld){
    if(!perHour[r.kind]) continue;
    const i = hours.indexOf(r.hour);
    if(i >= 0) perHour[r.kind][i] += r.n;
    if(r.hour.slice(0, 10) === today) todayLoad[r.kind] += r.n;
  }
  const status = Object.fromEntries(['new', 'read', 'done'].map(s => [s, 0]));
  for(const r of sgCount) if(r.status in status) status[r.status] = r.n;

  // the free plan: our own rough count for today (exact numbers are on Cloudflare's dashboard)
  const trackingWrites = todayLoad.d1_writes;
  const priceWrites = todayLoad.trade_search * 2;   // each trade search the price job runs saves about one price row (row + key index)
  const writes = trackingWrites + priceWrites;
  const requests = todayLoad.site_batch + todayLoad.site_view;   // tracking batches, plus about one worker call per page view
  const pct = Math.max(writes / FREE.d1Writes, requests / FREE.requests) * 100;

  return {
    days, since, today,
    totals: {views, arrivals, clicks, newNotes: status.new},
    perDay: dayList.map(d => ({day: d, n: perDay.get(d) || 0})),
    routes: top(routes, ROUTES.length + 5, 'route'),
    sources: top(sources, 20, 'source').map(x => ({...x, kind: kindOf(x.source)})),
    kinds: top(kinds, 10, 'kind'),
    countries: top(countries, 20, 'country'),
    devices: top(devices, 3, 'device'),
    clicks: {total: clicks, all: top(all, 50, 'label'),
      byRoute: Object.fromEntries(Object.entries(byRoute).map(([k, m]) => [k, top(m, 50, 'label')]))},
    suggestions: {count: status, list: sg.map(r => ({id: r.id, text: r.text, page: r.page || '', at: r.at, status: r.status}))},
    load: {hours, perHour, today: todayLoad, tradeLimitPerHour: 100},
    searches: ts.map(r => ({...searchName(r.state), n: r.n, last: r.last})),
    plan: {free: FREE, today: {views: todayLoad.site_view, batches: todayLoad.site_batch, requests, trackingWrites, priceWrites, writes},
      pct: Math.round(pct * 10) / 10, verdict: pct >= 80 ? 'upgrade' : pct >= 50 ? 'watch' : 'fine', links: LINKS},
    jobs: await health(env, url.origin),
  };
}

/* ---------- GET /api/admin/heat ---------- */
async function heatmap(env, url){
  const route = url.searchParams.get('route'), device = url.searchParams.get('device') || 'desktop';
  if(!ROUTE.has(route) || !DEVICE.has(device)) return json(400, {error: 'Pick a page and a device.'});
  const days = rangeOf(url);
  const rows = await env.DB.prepare('SELECT xb, yb, SUM(n) AS n FROM heat WHERE route = ? AND day >= ? AND device = ? GROUP BY xb, yb')
    .bind(route, sinceOf(days), device).all();
  const cells = (rows.results || []).map(r => [r.xb, r.yb, r.n]);
  return json(200, {route, device, days, cells, total: cells.reduce((a, x) => a + x[2], 0), max: cells.reduce((a, x) => Math.max(a, x[2]), 0)});
}

/* ---------- GET /api/admin/suggestions?before=<id> ---------- */
/* a hundred notes, newest first, with how many there are of each kind. The dashboard's notes tab loads
   from here on its own, so it never waits on the rest of the numbers. */
async function olderSuggestions(env, url){
  const before = int(url.searchParams.get('before'), 1, 2 ** 31) || 2 ** 31;
  const [sg, count] = (await env.DB.batch([
    env.DB.prepare('SELECT id, text, page, at, status FROM suggestions WHERE id < ? ORDER BY id DESC LIMIT ?').bind(before, NOTES + 1),
    env.DB.prepare('SELECT status, COUNT(*) AS n FROM suggestions GROUP BY status'),
  ])).map(r => (r && r.results) || []);
  const status = Object.fromEntries(['new', 'read', 'done'].map(s => [s, 0]));
  for(const r of count) if(r.status in status) status[r.status] = r.n;
  return {list: sg.slice(0, NOTES).map(x => ({id: x.id, text: x.text, page: x.page || '', at: x.at, status: x.status})),
    more: sg.length > NOTES, count: status};
}

/* ---------- POST /api/admin/suggestion ---------- */
async function setSuggestion(request, env){
  let body = {};
  try { body = await request.json(); } catch {}
  const id = int(body && body.id, 1, 2 ** 31);
  if(!id || !Number.isInteger(+body.id) || !STATUS.has(body.status)) return json(400, {error: 'Bad note.'});
  const r = await env.DB.prepare('UPDATE suggestions SET status = ? WHERE id = ?').bind(body.status, id).run();
  return json(200, {ok: true, changed: (r && r.meta && r.meta.changes) || 0});
}
