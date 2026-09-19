/* Data files the hourly jobs send in: the Currency Exchange prices (exchange.json, tools/exchange.py), the
   currency catalogue (market.json, tools/market.py) and the league dates (leagues.json, tools/leagues.py).
   The jobs run on the data server (tools/vm/) and send each file here when it is done. Kept in D1 (table files).
     POST /api/data/put?name=<file>        the file as the body, signed with the data server's key
     published(env, origin, name, ctx)     a file, parsed; each data centre keeps a copy for 5 minutes
   The key: "Authorization: Bearer <key>". Only its SHA-256 (hex) is stored, in the INGEST_HASH secret.
   No INGEST_HASH: no key works.
   Until the move to the data server is done, a file that never came in is read from the old GitHub Pages copy. */
import { same } from './dash.js';

const NAMES = new Set(['exchange.json', 'market.json', 'leagues.json']);
const MAX = 1.5e6;                // bytes
const TTL = 300;                  // seconds a data centre keeps its copy
const PAGES = 'https://metaseonso.github.io/wraeclast-index/data/';
const UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)';
const HOSTS = ['https://wraeclastindex.fyi', 'https://www.wraeclastindex.fyi'];
// what the worker builds from these files and keeps for a while: dropped when a new file comes in
const BUILT = ['/data/market.json?from=trade', '/data/market.json?from=trade&part=now', '/data/market.json?from=trade&part=past',
  '/data/rollprices.json', '/data/farmprices.json'];   // market.json and its two parts (worker/prices.js serveMarket)

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
export async function fileText(env, origin, name, ctx){
  const key = copyOf(origin, name);
  const hit = await caches.default.match(key);   // this data centre's copy
  if(hit) return hit.text();
  let row = null;
  try { row = await env.DB.prepare('SELECT body FROM files WHERE name = ?').bind(name).first(); } catch {}   // no table yet
  if(!row){   // never came in: the old GitHub Pages copy (the edge keeps it for 5 minutes)
    try {
      const r = await fetch(PAGES + name, {headers: {'User-Agent': UA}, cf: {cacheTtl: TTL, cacheEverything: true}});
      if(r.ok) return await r.text();
    } catch {}
    return null;
  }
  const put = caches.default.put(key, new Response(row.body, {headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + TTL}}));
  if(ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  return row.body;
}
export async function published(env, origin, name, ctx){
  const text = await fileText(env, origin, name, ctx);
  if(text === null) return null;
  try { return JSON.parse(text); } catch { return null; }
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
