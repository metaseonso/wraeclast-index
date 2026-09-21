/* Real prices. Currency: the in-game Currency Exchange, from GGG's public hourly feed (tools/exchange.py ->
   exchange.json, sent in by the data server: worker/files.js). Everything else: real listings on the official
   trade site, checked as below.
   The checks run on the data server (tools/vm/), not here (the trade site blocks Cloudflare's shared addresses):
   once an hour tools/pricepull.py asks GET /api/prices/state what is oldest, spreads its checks over the hour,
   and sends the results to POST /api/prices/ingest. It signs in with the data server's key (worker/files.js
   fromServer). Until the move is done, GitHub's own short-lived token (OpenID Connect) from this repo's prices
   workflow on main works too: this checks GitHub's signature and that the token is for that workflow.

   What is checked (the key in the trade_prices table):
     uniq:<index id>            uniques: the 10 cheapest listings (online sellers)
     roll:<stat>@<value>        trade sliders: the 10 cheapest items with at least that roll
     farm:<key>                 rolled tablets and waystones for the Farms tab
     boss:<key>                 boss entry items the in-game Currency Exchange does not trade (data/bossqueries.json)
   A price is the middle of the 5 cheapest of those listings, in divines, worked out when it arrives (v), plus one
   price per day (h).
   Listings priced in any currency are turned into divines at the Currency Exchange's own rates.

   /data/market.json   every item's price (the shape the pages read), only from these checks. Names, pictures
                       and descriptions come from the hourly catalogue (market.json); its prices are dropped.
                       updated is the real age of the data behind these prices, times says where that came from
                       and late is true once a job has missed a run (worker/health.js): the page stamps them.
                       ?part=now: the same without the day-by-day history (h) and the exchange pairs (half the size:
                       what the first cards need); ?part=past: only those, for the charts (assets/app.js)
   /data/rollprices.json, /data/farmprices.json   the slider and farm prices
   /data/bossprices.json   what every item on the Bosses tab costs, from all three places at once */

import { published, publishedRow, fromServer } from './files.js';
import { lateAfter } from './health.js';

const ISSUER = 'https://token.actions.githubusercontent.com';
const REPO = 'metaseonso/wraeclast-index';
const WORKFLOW = /^metaseonso\/wraeclast-index\/\.github\/workflows\/prices\.yml@refs\/heads\/main$/;
const DAYS = 45;

export const tally = (env, kind, n = 1) => env.DB.prepare(
  'INSERT INTO load (hour, kind, n) VALUES (?, ?, ?) ON CONFLICT(hour, kind) DO UPDATE SET n = n + excluded.n')
  .bind(new Date().toISOString().slice(0, 13), kind, n).run();
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
async function meta(env, k){ const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first(); return r && r.v; }
const setMeta = (env, k, v) => env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
const median = a => { if(!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = v => v === null || !isFinite(v) ? null : +v.toPrecision(4);

/* ---------- GitHub's signed token ---------- */
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function fromGitHub(request, url){
  const m = (request.headers.get('Authorization') || '').match(/^Bearer ([\w-]+)\.([\w-]+)\.([\w-]+)$/);
  if(!m) return null;
  let head, claims;
  try { head = JSON.parse(new TextDecoder().decode(unb64(m[1]))); claims = JSON.parse(new TextDecoder().decode(unb64(m[2]))); } catch { return null; }
  if(head.alg !== 'RS256') return null;
  const keys = await (await fetch(ISSUER + '/.well-known/jwks', {cf: {cacheTtl: 3600, cacheEverything: true}})).json();
  const jwk = (keys.keys || []).find(k => k.kid === head.kid);
  if(!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', {kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true},
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64(m[3]), new TextEncoder().encode(m[1] + '.' + m[2]));
  const now = Date.now() / 1000;
  if(!ok || claims.iss !== ISSUER || claims.aud !== url.origin || !(claims.exp > now) || (claims.nbf && claims.nbf > now + 60)) return null;
  if(claims.repository !== REPO || claims.ref !== 'refs/heads/main' || !WORKFLOW.test(claims.workflow_ref || '')) return null;
  return claims;
}
const signed = async (request, env, url) => (await fromServer(request, env)) || !!(await fromGitHub(request, url));

/* ---------- GET /api/prices/state: when each price was last checked, so the job does the oldest first ---------- */
export async function state(request, env, url){
  if(!(await signed(request, env, url))) return json(401, {error: 'Not signed in.'});
  const league = url.searchParams.get('league') || '';
  const rows = await env.DB.prepare('SELECT key, at FROM trade_prices WHERE league = ?').bind(league).all();
  return json(200, {at: Object.fromEntries((rows.results || []).map(r => [r.key, r.at]))});
}

/* ---------- POST /api/prices/ingest ---------- */
const KEY = /^(roll:[a-z]+\.[a-z0-9_]+@-?\d+(\.\d+)?|(farm|boss):[a-z0-9-]{1,80}|uniq:[^\n|][^\n]{0,119}|cur:[^\s|]{1,60}\|[^\n|]{1,80})$/;
export async function ingest(request, env, url){
  if(request.method !== 'POST') return json(405, {error: 'POST only.'});
  if(!(await signed(request, env, url))) return json(401, {error: 'Not signed in.'});
  let body;
  try { body = await request.json(); } catch { return json(400, {error: 'Bad body.'}); }
  const league = typeof body.league === 'string' ? body.league.slice(0, 60) : '';
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 60).filter(r => r && KEY.test(r.key || '') && Array.isArray(r.p))
    .map(r => ({key: r.key, total: Math.max(0, Math.floor(+r.total || 0)),
      p: r.p.slice(0, 10).filter(x => Array.isArray(x) && isFinite(+x[0]) && +x[0] > 0 && typeof x[1] === 'string').map(x => [+x[0], x[1].slice(0, 30)])}));
  const now = new Date().toISOString(), day = now.slice(0, 10);
  // what each currency is worth in divines (the Currency Exchange), for listings priced in any of them
  const worth = await exchangeWorth(env, url.origin);
  const valueOf = r => {
    // the middle of the 5 cheapest: what you actually pay, without one bait listing or a few silly asks deciding it
    return round(median(r.p.map(([a, c]) => worth[c] ? a * worth[c] : null).filter(x => x !== null).sort((x, y) => x - y).slice(0, 5)));
  };
  const old = {};
  if(rows.length){
    const got = await env.DB.prepare('SELECT key, h FROM trade_prices WHERE key IN (' + rows.map(() => '?').join(',') + ')').bind(...rows.map(r => r.key)).all();
    for(const r of got.results || []) old[r.key] = r.h;
  }
  const stmts = rows.map(r => {
    const v = valueOf(r);
    let h = [];
    try { h = JSON.parse(old[r.key] || '[]'); } catch {}
    h = h.filter(x => x[0] !== day);
    if(v !== null) h.push([day, v]);
    h = h.slice(-DAYS);
    return env.DB.prepare(`INSERT INTO trade_prices (key, league, p, total, at, v, h) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET league = excluded.league, p = excluded.p, total = excluded.total, at = excluded.at, v = excluded.v, h = excluded.h`)
      .bind(r.key, league, JSON.stringify(r.p), r.total, now, v, JSON.stringify(h));
  });
  if(stmts.length) await env.DB.batch(stmts);
  for(const [k, n] of Object.entries(body.load || {}))
    if(/^trade_(search|fetch|exchange|limited|error)$/.test(k) && +n > 0) await tally(env, k, Math.min(1000, Math.floor(+n)));
  return json(200, {ok: true, saved: stmts.length});
}

async function exchangeWorth(env, origin){
  const x = (await published(env, origin, 'exchange.json')) || {};
  const worth = {divine: 1};
  for(const it of Object.values(x.items || {})) if(it.tid && it.v) worth[it.tid] = it.v;
  worth.divine = 1;
  return worth;
}

/* one price's fields as the pages read them: v, ls (listings), at, and from our own daily prices:
   h (every day), sp (the last 7 days) and ch (the % move over 7 days, only once there are 7 days) */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fields(r){
  const out = {ls: r.total, at: r.at};
  if(r.v !== null && r.v !== undefined) out.v = r.v;
  let h = [];
  try { h = JSON.parse(r.h || '[]'); } catch {}
  if(h.length >= 2){
    out.h = h.map(([d, v]) => [MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10), v]);
    out.sp = h.slice(-7).map(x => x[1]);
    const today = Date.parse(h[h.length - 1][0]), weekAgo = h.find(x => today - Date.parse(x[0]) <= 7 * 864e5);
    if(weekAgo && today - Date.parse(weekAgo[0]) >= 6 * 864e5 && weekAgo[1] > 0)
      out.ch = +(((h[h.length - 1][1] / weekAgo[1]) - 1) * 100).toFixed(1);
  }
  return out;
}

/* How old prices really are. The Currency Exchange feed's own time, but never newer than the moment its file
   came in (the backup site's copy does not say when it came in, so the feed's own time stands); and the newest
   trade check. A page stamps the older of the two, so a job that has stopped cannot hide behind one that is
   still running. */
const came = row => row && row.at ? new Date(row.at * 1000).toISOString() : null;
const older = (a, b) => a && b ? (Date.parse(a) <= Date.parse(b) ? a : b) : (a || b || null);
const stale = (t, where, name) => !t || Date.now() - Date.parse(t) >= lateAfter(where, name) * 3600e3;

/* ---------- /data/market.json ---------- */
const DROP = ['v', 'ch', 'sp', 'vol', 'pair', 'gap', 'routes', 'arb', 'h', 'ls'];   // the catalogue's own prices: never shown
const LATER = ['h', 'pairs'];   // the fields ?part=past carries and ?part=now leaves out
export async function serveMarket(request, env, ctx){
  const url = new URL(request.url), part = ({now: 'now', past: 'past'})[url.searchParams.get('part')] || '';
  const ck = new Request(url.origin + '/data/market.json?from=trade' + (part ? '&part=' + part : ''));
  const hit = await caches.default.match(ck);
  if(hit) return hit;
  const catRow = await publishedRow(env, url.origin, 'market.json', ctx), cat = (catRow && catRow.data) || {items: {}};
  const cxRow = await publishedRow(env, url.origin, 'exchange.json', ctx), cx = (cxRow && cxRow.data) || {items: {}};
  const league = cat.league || '';
  const rows = await env.DB.prepare("SELECT key, v, total, at, h FROM trade_prices WHERE league = ? AND key LIKE 'uniq:%'").bind(league).all();
  const rate = cx.league === league ? cx.rate : null;
  const items = {};
  for(const [k, it] of Object.entries(cat.items || {})){
    if(!k.startsWith('c:')) continue;   // uniques come only from our own checks
    const o = {};
    for(const [f, v] of Object.entries(it)) if(!DROP.includes(f)) o[f] = v;
    items[k] = o;
  }
  const currencyAt = cx.league === league ? older(cx.updated, came(cxRow)) : null;
  let tradeAt = null;
  for(const r of rows.results || []) if(!tradeAt || r.at > tradeAt) tradeAt = r.at;
  const updated = older(currencyAt, tradeAt);
  const late = stale(currencyAt, 'file', 'exchange.json') || (!!tradeAt && stale(tradeAt, 'price', 'uniq'));
  // currency: what it traded for on the Currency Exchange over the last 24 hours
  if(cx.league === league) for(const [name, x] of Object.entries(cx.items || {})){
    const o = {v: x.v, vol: x.vol, at: currencyAt, src: 'cx'};
    if(x.v1h) o.v1h = x.v1h;
    if(x.pairs) o.pairs = x.pairs;
    if(x.h && x.h.length >= 2){
      o.h = x.h.map(([d, v]) => [MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10), v]);
      o.sp = x.h.slice(-7).map(p => p[1]);
    }
    if(x.ch !== undefined) o.ch = x.ch;
    items['c:' + name] = {...(items['c:' + name] || {n: name}), ...o};
  }
  // uniques: real listings on the trade site
  for(const r of rows.results || []) items['u:' + r.key.slice(5)] = {...fields(r), src: 'trade'};
  let out = {league, updated, late, times: {currency: currencyAt, trade: tradeAt, catalogue: came(catRow)},
    primary: 'divine', rates: rate ? {exalted: rate} : {},
    source: 'Currency Exchange and trade site listings', builds: cat.builds,
    markets: cx.league === league ? (cx.markets || []).slice(0, 40) : [], items};
  if(part){   // each part cached on its own (a few minutes apart at most: the history moves once a day)
    const now = {}, past = {};
    for(const [k, it] of Object.entries(items)){
      const a = {}, b = {};
      for(const [f, v] of Object.entries(it)) (LATER.includes(f) ? b : a)[f] = v;
      now[k] = a;
      if(Object.keys(b).length) past[k] = b;
    }
    out = part === 'now' ? {...out, part, items: now} : {league, updated, part, items: past};
  }
  const res = new Response(JSON.stringify(out), {headers: {'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'}});
  ctx.waitUntil(caches.default.put(ck, res.clone()));
  return res;
}

/* ---------- /data/rollprices.json and /data/farmprices.json ---------- */
export async function servePrices(request, env, ctx, kind){
  const url = new URL(request.url), key = new Request(url.origin + url.pathname);
  const hit = await caches.default.match(key);
  if(hit) return hit;
  const cat = (await published(env, url.origin, 'market.json', ctx)) || {};
  const rows = await env.DB.prepare('SELECT key, v, total, at FROM trade_prices WHERE key LIKE ? AND league = ?')
    .bind(kind + ':%', cat.league || '').all();
  const out = {updated: null, league: cat.league || null, every: 'hour'};
  if(kind === 'roll') out.mods = {}; else out.items = {};
  for(const r of rows.results || []){
    const name = r.key.slice(kind.length + 1), price = r.v === undefined ? null : r.v;
    if(!out.updated || r.at > out.updated) out.updated = r.at;
    if(kind === 'roll'){
      const at = name.lastIndexOf('@'), stat = name.slice(0, at);
      const m = out.mods[stat] = out.mods[stat] || {at: r.at, pts: []};
      if(r.at < m.at) m.at = r.at;
      m.pts.push([+name.slice(at + 1), price, r.total]);
    } else out.items[name] = {at: r.at, price, total: r.total};
  }
  if(out.mods) for(const m of Object.values(out.mods)) m.pts.sort((a, b) => a[0] - b[0]);
  const res = new Response(JSON.stringify(out), {headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=60'}});
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

/* ---------- /data/bossprices.json ---------- */
/* What the things on the Bosses tab cost, in one file, so a page never has to work it out from three.
   Every name in data/bosses.json (what a boss drops, and what it costs to get in) is looked up in:
     the uniques    our own hourly unique checks (uniq:). A unique that comes on more than one base keeps
                    each base's own price: the cheapest one that is really listed is the one given, with
                    the base it is on, the way the site says "from" elsewhere.
     the rest       the in-game Currency Exchange (exchange.json), by name: the lineage gems, the
                    reliquary keys and most fragments and splinters trade there.
     what it misses the few entry items the Currency Exchange does not trade, checked on the trade site
                    (boss:, data/bossqueries.json).
   A name appears only once something real is known about it. v is a price in divines, or null when the last
   check found nobody selling: never a zero, never a number worked out here, so nothing can sort as free.
   The drop rates in data/bosses.json never meet these prices: no value per kill, here or anywhere. */
async function asset(env, origin, name){   // a data file that ships with the site, parsed
  try {
    const r = await env.ASSETS.fetch(new Request(origin + '/data/' + name));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
export async function serveBossPrices(request, env, ctx){
  const url = new URL(request.url), ck = new Request(url.origin + '/data/bossprices.json');
  const hit = await caches.default.match(ck);
  if(hit) return hit;
  const [bosses, queries] = await Promise.all([asset(env, url.origin, 'bosses.json'), asset(env, url.origin, 'bossqueries.json')]);
  const catRow = await publishedRow(env, url.origin, 'market.json', ctx), cat = (catRow && catRow.data) || {};
  const cxRow = await publishedRow(env, url.origin, 'exchange.json', ctx), cx = (cxRow && cxRow.data) || {};
  const league = cat.league || '';
  const rows = await env.DB.prepare(
    "SELECT key, v, total, at FROM trade_prices WHERE league = ? AND (key LIKE 'uniq:%' OR key LIKE 'boss:%')").bind(league).all();
  const uniques = new Map(), entries = new Map();
  let tradeAt = null;
  for(const r of rows.results || []){
    if(!tradeAt || r.at > tradeAt) tradeAt = r.at;
    if(r.key.startsWith('boss:')){ entries.set(r.key.slice(5), r); continue; }
    const id = r.key.slice(5), bar = id.indexOf(' | ');   // "<name>" or "<name> | <base>"
    const name = bar < 0 ? id : id.slice(0, bar);
    const list = uniques.get(name) || [];
    list.push({...r, base: bar < 0 ? null : id.slice(bar + 3)});
    uniques.set(name, list);
  }
  // the cheapest base really listed; with nothing listed anywhere, the check that ran last
  const pick = list => {
    const real = list.filter(x => x.v !== null && x.v !== undefined);
    return real.length ? real.reduce((a, b) => b.v < a.v ? b : a) : list.reduce((a, b) => b.at > a.at ? b : a);
  };
  const currencyAt = cx.league === league ? older(cx.updated, came(cxRow)) : null;
  const byItem = new Map(((queries && queries.queries) || []).filter(q => q.item && q.key).map(q => [q.item, q.key]));
  const items = {};
  const add = (name, kind) => {
    if(!name || items[name]) return;
    const list = kind === 'unique' && uniques.get(name);
    if(list){
      const best = pick(list);
      items[name] = {v: null, ...fields(best), src: 'trade', ...(best.base ? {base: best.base} : {})};
      return;
    }
    const row = entries.get(byItem.get(name));
    if(row){ items[name] = {v: null, ...fields(row), src: 'trade'}; return; }
    const c = currencyAt ? (cx.items || {})[name] : null;   // never another league's prices
    if(c && c.v) items[name] = {v: c.v, ...(c.vol ? {vol: c.vol} : {}), at: currencyAt, src: 'cx'};
  };
  for(const b of (bosses && bosses.bosses) || []){
    for(const name of b.access || []) add(name, 'entry');
    for(const d of b.drops || []) add(d.name, d.kind);
  }
  const out = {league, updated: older(currencyAt, tradeAt), every: 'hour',
    late: stale(currencyAt, 'file', 'exchange.json') || (!!tradeAt && stale(tradeAt, 'price', 'uniq')),
    times: {currency: currencyAt, trade: tradeAt},
    primary: 'divine', source: 'Currency Exchange and trade site listings', items};
  const res = new Response(JSON.stringify(out), {headers: {'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'}});
  ctx.waitUntil(caches.default.put(ck, res.clone()));
  return res;
}
