/* Data files the hourly jobs send in: the Currency Exchange prices (exchange.json, tools/exchange.py), the
   currency catalogue (market.json, tools/market.py), the league dates (leagues.json, tools/leagues.py) and
   the list of sections serving an older copy (faults.json, tools/lastgood.py).
   The jobs run on GitHub Actions (.github/workflows/pages.yml) and send each file here when it is done. Kept
   in D1 (table files).
   The market files (MARKET: market/<name>.json, tools/market_send.py) come from one more job, the daily Market
   job in the private data repo (metaseonso/wraeclast-data, .github/workflows/market.yml), which holds the
   exchange archive they are built from. It signs with its own GitHub token too and may send only those
   names; the Publish site workflow may not send them. Served at /data/market/<name> (worker/index.js). Its
   faults go in as market/faults.json, beside the Publish site workflow's faults.json (worker/health.js reads both).
     POST /api/data/put?name=<file>        the file as the body, signed: GitHub's own short-lived token from
                                           the Publish site workflow (fromGitHub), from the data repo's
                                           Market job for a market file, or a key of its own for a run by
                                           hand somewhere else (fromServer)
     published(env, origin, name, ctx)     a file, parsed; each data centre keeps a copy for 5 minutes
     publishedRow(env, origin, name, ctx)  the same, with when it came in and which source answered
                                           ({data, at, from}), so what is built from it can say how old it is
     fileWhen(env, origin, name)           only how old it is, for the job watch (worker/health.js)
   There is one row per file: the newest copy that came in. It is served however old it is (the last good copy
   beats nothing), and its age travels with it, so a stale file can never pass for a fresh one.
   The key: "Authorization: Bearer <key>". Only its SHA-256 (hex) is stored, in the INGEST_HASH secret.
   No INGEST_HASH: no key works.
   A file that never came in this way is read from the old GitHub Pages copy instead. That copy comes with no
   arrival time ("from: backup"), so the time the file gives for itself stands in for it (ownTime): the hour
   the data was made, which is never newer than the moment the file arrived. The backup's answer is kept in the
   data centre for 5 minutes like any other copy: before 27 Sep it was not, so every page asking for the league
   dates and every price build was a request to GitHub (about 4,800 a month for exchange.json alone).
   The hourly jobs on GitHub Actions (.github/workflows/pages.yml) send their files in with GitHub's own
   short-lived token, the same way the price job does (worker/prices.js): until 27 Sep they sent nothing, which
   is why every file read "from: backup". */
import { same } from './dash.js';

const NAMES = new Set(['exchange.json', 'market.json', 'leagues.json', 'faults.json']);
// the market products (design/market-products.md), one file each, the currency cards' parts in up to 16 bundles, and
// the Market job's own fault record (tools/lastgood.py SENT): faults.json itself is the Publish site workflow's alone
export const MARKET = /^market\/(?:index|liquidity|playbook|inflation|shocks|sell|crafting|rising|gap|digest|faults|cards-(?:[1-9]|[12]\d|3[0-2]))\.json$/;
const MAX = 1.5e6;                // bytes
const TTL = 300;                  // seconds a data centre keeps its copy
const PAGES = 'https://metaseonso.github.io/wraeclast-index/data/';
const UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)';
const HOSTS = ['https://wraeclastindex.fyi', 'https://www.wraeclastindex.fyi'];
// what the worker builds from these files and keeps for a while: dropped when a new file comes in
const BUILT = ['/data/market.json?from=trade', '/data/market.json?from=trade&part=now', '/data/market.json?from=trade&part=past',
  '/data/market.json?from=trade&part=live', '/data/market.json?from=trade&part=hist', '/data/market.json?from=trade&part=facts',
  '/data/rollprices.json', '/data/farmprices.json', '/data/bossprices.json'];   // market.json and its parts (worker/prices.js serveMarket)

const ISSUER = 'https://token.actions.githubusercontent.com';
const REPO = 'metaseonso/wraeclast-index';
const DATA_JOBS = /^metaseonso\/wraeclast-index\/\.github\/workflows\/pages\.yml@refs\/heads\/main$/;   // the hourly files
const DATA_REPO = 'metaseonso/wraeclast-data';
const MARKET_JOBS = /^metaseonso\/wraeclast-data\/\.github\/workflows\/market\.yml@refs\/heads\/main$/;   // the market files
const enc = new TextEncoder();
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
const copyOf = (origin, name) => new Request(origin + '/data/' + name + '?from=d1');

/* the manual ingest key: a run by hand, not GitHub Actions (worker/prices.js fromGitHub is the other one) */
export async function fromServer(request, env){
  const want = String(env.INGEST_HASH || '').trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(want)) return false;
  const m = (request.headers.get('Authorization') || '').match(/^Bearer (\S{16,512})$/);
  if(!m) return false;
  const got = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(m[1])));
  return same(got, Uint8Array.from(want.match(/../g), h => parseInt(h, 16)));
}

/* GitHub's own signed token (OpenID Connect) from one workflow on main of one repo (this one unless said): the
   claims, or null. The price job signs in with it (worker/prices.js), and so do the hourly data files (DATA_JOBS)
   and the data repo's market files (MARKET_JOBS). */
const unb64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
export async function fromGitHub(request, url, workflow, repo = REPO){
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
  if(claims.repository !== repo || claims.ref !== 'refs/heads/main' || !workflow.test(claims.workflow_ref || '')) return null;
  return claims;
}

/* The time a file gives for itself, in unix seconds, or null when it gives none. Every job writes it at the
   top of the file it sends, in the "updated" field: in exchange.json the hour of the Currency Exchange feed
   behind it, in market.json and leagues.json the moment the file was built. Taken off the text, not the
   parsed file: it sits at the top of all of them, so a 340 kB price file is never parsed to ask its age. */
function ownTime(body){
  const m = String(body).match(/"updated"\s*:\s*"([^"]{10,40})"/);
  const t = m ? Date.parse(m[1]) : NaN;
  return t ? Math.floor(t / 1000) : null;
}

/* ---------- reading ---------- */
/* the newest copy there is: {body, at, from, own}. from "jobs": a job sent it in (at: unix seconds); from
   "backup": the old GitHub Pages copy, which carries no arrival time (at: null), with the time it gives for
   itself (own). null when nothing has it. Either kind is kept in this data centre for 5 minutes.
   fresh: the arrival time the database already holds for this file (worker/prices.js builds with it), so a
   copy this data centre kept from before that is passed over rather than built from. */
export async function fileRow(env, origin, name, ctx, fresh){
  const key = copyOf(origin, name);
  const hit = await caches.default.match(key);   // this data centre's copy, with the time it came in
  if(hit){
    const from = hit.headers.get('X-Data-From') === 'backup' ? 'backup' : 'jobs';
    const at = from === 'jobs' ? +hit.headers.get('X-Data-At') || null : null, own = +hit.headers.get('X-Data-Own') || null;
    if(!fresh || (at && at >= fresh)) return {body: await hit.text(), at, from, own};
  }
  const keep = (body, head) => {
    const put = caches.default.put(key, new Response(body, {headers: {
      'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + TTL, ...head}}));
    if(ctx && ctx.waitUntil) ctx.waitUntil(put); else return put;
  };
  let row = null;
  try { row = await env.DB.prepare('SELECT body, at FROM files WHERE name = ?').bind(name).first(); } catch {}   // no table yet
  if(!row && MARKET.test(name)) return null;   // a market file has no GitHub Pages copy: not in yet
  if(!row){   // never came in: the old GitHub Pages copy
    try {
      const r = await fetch(PAGES + name, {headers: {'User-Agent': UA}, cf: {cacheTtl: TTL, cacheEverything: true}});
      if(r.ok){
        const body = await r.text(), own = ownTime(body);
        await keep(body, {'X-Data-From': 'backup', ...(own ? {'X-Data-Own': String(own)} : {})});
        return {body, at: null, from: 'backup', own};
      }
    } catch {}
    return null;
  }
  await keep(row.body, {'X-Data-At': String(row.at)});
  return {body: row.body, at: row.at, from: 'jobs', own: null};
}
/* how old a file is and which source answered: {at, from} ("jobs", "backup" or "none"). A file a job sent in
   is timed by its arrival, and the file itself is never read. The backup site's copy has no arrival time, so
   the time it gives for itself is used instead (at: null when it gives none). */
export async function fileWhen(env, origin, name){
  const hit = await caches.default.match(copyOf(origin, name));
  if(hit && hit.headers.get('X-Data-From') === 'backup') return {at: +hit.headers.get('X-Data-Own') || null, from: 'backup'};
  const at = hit && +hit.headers.get('X-Data-At');
  if(at) return {at, from: 'jobs'};   // a copy from before this went live has no time: ask the table instead
  let row = null;
  try { row = await env.DB.prepare('SELECT at FROM files WHERE name = ?').bind(name).first(); } catch {}   // no table yet
  if(row) return {at: row.at, from: 'jobs'};
  const got = await fileRow(env, origin, name);   // the backup's copy, kept here for 5 minutes
  return got ? {at: got.own, from: 'backup'} : {at: null, from: 'none'};
}
export async function fileText(env, origin, name, ctx){
  const row = await fileRow(env, origin, name, ctx);
  return row ? row.body : null;
}
export async function publishedRow(env, origin, name, ctx, fresh){
  const row = await fileRow(env, origin, name, ctx, fresh);
  if(!row) return null;
  try { return {data: JSON.parse(row.body), at: row.at, from: row.from, own: row.own}; } catch { return null; }
}
export async function published(env, origin, name, ctx){
  const row = await publishedRow(env, origin, name, ctx);
  return row ? row.data : null;
}

/* ---------- POST /api/data/put?name=<file> ---------- */
export async function putFile(request, env, url, ctx){
  if(request.method !== 'POST') return json(405, {error: 'POST only.'});
  const name = url.searchParams.get('name') || '';
  const market = MARKET.test(name);   // a market file only from the data repo's Market job; the rest only from Publish site
  if(!(await fromServer(request, env)) && !(await (market ? fromGitHub(request, url, MARKET_JOBS, DATA_REPO) : fromGitHub(request, url, DATA_JOBS))))
    return json(401, {error: 'Wrong key.'});
  if(!NAMES.has(name) && !market) return json(400, {error: 'Unknown file.'});
  if(+request.headers.get('Content-Length') > MAX) return json(413, {error: 'Too big.'});
  const raw = await request.arrayBuffer();
  if(raw.byteLength > MAX) return json(413, {error: 'Too big.'});
  let body, data;
  try { body = new TextDecoder('utf-8', {fatal: true}).decode(raw); data = JSON.parse(body); } catch { return json(400, {error: 'Not JSON.'}); }
  if(!data || typeof data !== 'object' || Array.isArray(data)) return json(400, {error: 'Not a data file.'});
  const at = Math.floor(Date.now() / 1000);
  await env.DB.prepare('INSERT INTO files (name, body, at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET body = excluded.body, at = excluded.at')
    .bind(name, body, at).run();
  // drop this data centre's copies so the new file shows at once (other data centres: within 5 minutes)
  const drops = [];
  for(const origin of new Set([url.origin, ...HOSTS])){
    drops.push(caches.default.delete(copyOf(origin, name)));
    for(const path of BUILT) drops.push(caches.default.delete(new Request(origin + path)));
  }
  ctx.waitUntil(Promise.all(drops));
  return json(200, {ok: true, name, bytes: raw.byteLength, at});
}
