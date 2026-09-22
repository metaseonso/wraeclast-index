/* Data files the hourly jobs send in: the Currency Exchange prices (exchange.json, tools/exchange.py), the
   currency catalogue (market.json, tools/market.py), the league dates (leagues.json, tools/leagues.py) and
   the list of sections serving an older copy (faults.json, tools/lastgood.py).
   The jobs run on the data server (tools/vm/) and send each file here when it is done. Kept in D1 (table files).
     POST /api/data/put?name=<file>        the file as the body, signed with the data server's key
     published(env, origin, name, ctx)     a file, parsed; each data centre keeps a copy for 5 minutes
     publishedRow(env, origin, name, ctx)  the same, with when it came in and which source answered
                                           ({data, at, from}), so what is built from it can say how old it is
     fileWhen(env, origin, name)           only that, without reading the file (worker/health.js)
   There is one row per file: the newest copy that came in. It is served however old it is (the last good copy
   beats nothing), and its age travels with it, so a stale file can never pass for a fresh one.
   The key: "Authorization: Bearer <key>". Only its SHA-256 (hex) is stored, in the INGEST_HASH secret.
   No INGEST_HASH: no key works.
   Until the move to the data server is done, a file that never came in is read from the old GitHub Pages copy.
   That copy comes with no arrival time: its age is not known here ("from: backup"). */
import { same } from './dash.js';

const NAMES = new Set(['exchange.json', 'market.json', 'leagues.json', 'faults.json']);
const MAX = 1.5e6;                // bytes
const TTL = 300;                  // seconds a data centre keeps its copy
const PAGES = 'https://metaseonso.github.io/wraeclast-index/data/';
const UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)';
const HOSTS = ['https://wraeclastindex.fyi', 'https://www.wraeclastindex.fyi'];
// what the worker builds from these files and keeps for a while: dropped when a new file comes in
const BUILT = ['/data/market.json?from=trade', '/data/market.json?from=trade&part=now', '/data/market.json?from=trade&part=past',
  '/data/rollprices.json', '/data/farmprices.json', '/data/bossprices.json'];   // market.json and its two parts (worker/prices.js serveMarket)

const enc = new TextEncoder();
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
const copyOf = (origin, name) => new Request(origin + '/data/' + name + '?from=d1');

/* the data server's key */
export async function fromServer(request, env){
  const want = String(env.INGEST_HASH || '').trim().toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(want)) return false;
  const m = (request.headers.get('Authorization') || '').match(/^Bearer (\S{16,512})$/);
  if(!m) return false;
  const got = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(m[1])));
  return same(got, Uint8Array.from(want.match(/../g), h => parseInt(h, 16)));
}

/* ---------- reading ---------- */
/* the newest copy there is: {body, at, from}. from "jobs": a job sent it in (at: unix seconds); from "backup":
   the old GitHub Pages copy, which carries no arrival time (at: null). null when nothing has it. */
export async function fileRow(env, origin, name, ctx){
  const key = copyOf(origin, name);
  const hit = await caches.default.match(key);   // this data centre's copy, with the time it came in
  if(hit) return {body: await hit.text(), at: +hit.headers.get('X-Data-At') || null, from: 'jobs'};
  let row = null;
  try { row = await env.DB.prepare('SELECT body, at FROM files WHERE name = ?').bind(name).first(); } catch {}   // no table yet
  if(!row){   // never came in: the old GitHub Pages copy (the edge keeps it for 5 minutes)
    try {
      const r = await fetch(PAGES + name, {headers: {'User-Agent': UA}, cf: {cacheTtl: TTL, cacheEverything: true}});
      if(r.ok) return {body: await r.text(), at: null, from: 'backup'};
    } catch {}
    return null;
  }
  const put = caches.default.put(key, new Response(row.body, {headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + TTL, 'X-Data-At': String(row.at)}}));
  if(ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  return {body: row.body, at: row.at, from: 'jobs'};
}
/* when a file came in and which source answered, without reading the file: {at, from} ("jobs", "backup" or
   "none"). The backup site is asked with a HEAD: enough to know it still answers. */
export async function fileWhen(env, origin, name){
  const hit = await caches.default.match(copyOf(origin, name));
  const at = hit && +hit.headers.get('X-Data-At');
  if(at) return {at, from: 'jobs'};   // a copy from before this went live has no time: ask the table instead
  let row = null;
  try { row = await env.DB.prepare('SELECT at FROM files WHERE name = ?').bind(name).first(); } catch {}   // no table yet
  if(row) return {at: row.at, from: 'jobs'};
  try {
    const r = await fetch(PAGES + name, {method: 'HEAD', headers: {'User-Agent': UA}, cf: {cacheTtl: TTL, cacheEverything: true}});
    if(r.ok) return {at: null, from: 'backup'};
  } catch {}
  return {at: null, from: 'none'};
}
export async function fileText(env, origin, name, ctx){
  const row = await fileRow(env, origin, name, ctx);
  return row ? row.body : null;
}
export async function publishedRow(env, origin, name, ctx){
  const row = await fileRow(env, origin, name, ctx);
  if(!row) return null;
  try { return {data: JSON.parse(row.body), at: row.at, from: row.from}; } catch { return null; }
}
export async function published(env, origin, name, ctx){
  const row = await publishedRow(env, origin, name, ctx);
  return row ? row.data : null;
}

/* ---------- POST /api/data/put?name=<file> ---------- */
export async function putFile(request, env, url, ctx){
  if(request.method !== 'POST') return json(405, {error: 'POST only.'});
  if(!(await fromServer(request, env))) return json(401, {error: 'Wrong key.'});
  const name = url.searchParams.get('name') || '';
  if(!NAMES.has(name)) return json(400, {error: 'Unknown file.'});
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
