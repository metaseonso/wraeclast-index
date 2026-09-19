/* Live trade prices.
   The searches run on GitHub, not here: the trade site blocks Cloudflare's shared addresses. Once an hour
   .github/workflows/prices.yml runs tools/pricepull.py, which spreads its searches over the hour and sends the
   10 cheapest listings of each to POST /api/prices/ingest. It signs in with GitHub's own short-lived token
   (OpenID Connect): this checks GitHub's signature and that the token is for this repo's prices workflow on main.
   No password or key is stored anywhere.
   Pages read /data/rollprices.json and /data/farmprices.json, priced in divines with data/worth.json
   (published hourly by tools/market.py). */

const PAGES = 'https://metaseonso.github.io/wraeclast-index/data/';
const UA = 'wraeclast-index/1.0 (+https://wraeclastindex.fyi)';
const ISSUER = 'https://token.actions.githubusercontent.com';
const REPO = 'metaseonso/wraeclast-index';
const WORKFLOW = /^metaseonso\/wraeclast-index\/\.github\/workflows\/prices\.yml@refs\/heads\/main$/;

async function published(name){   // a file the hourly GitHub job publishes
  const r = await fetch(PAGES + name, {headers: {'User-Agent': UA}, cf: {cacheTtl: 300, cacheEverything: true}});
  return r.ok ? r.json() : null;
}
export const tally = (env, kind, n = 1) => env.DB.prepare(
  'INSERT INTO load (hour, kind, n) VALUES (?, ?, ?) ON CONFLICT(hour, kind) DO UPDATE SET n = n + excluded.n')
  .bind(new Date().toISOString().slice(0, 13), kind, n).run();
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});

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

/* ---------- POST /api/prices/ingest ---------- */
const KEY = /^(roll:[a-z]+\.[a-z0-9_]+@-?\d+(\.\d+)?|farm:[a-z0-9-]{1,80})$/;
export async function ingest(request, env, url){
  if(request.method !== 'POST') return json(405, {error: 'POST only.'});
  if(!(await fromGitHub(request, url))) return json(401, {error: 'Not signed by the prices workflow.'});
  let body;
  try { body = await request.json(); } catch { return json(400, {error: 'Bad body.'}); }
  const league = typeof body.league === 'string' ? body.league.slice(0, 60) : '';
  const rows = (Array.isArray(body.rows) ? body.rows : []).slice(0, 50).filter(r => r && KEY.test(r.key || '') && Array.isArray(r.p));
  const now = new Date().toISOString();
  const stmts = rows.map(r => env.DB.prepare(`INSERT INTO trade_prices (key, league, p, total, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET league = excluded.league, p = excluded.p, total = excluded.total, at = excluded.at`)
    .bind(r.key, league, JSON.stringify(r.p.slice(0, 10).filter(x => Array.isArray(x) && isFinite(+x[0]) && typeof x[1] === 'string')
      .map(x => [+x[0], x[1].slice(0, 30)])), Math.max(0, Math.floor(+r.total || 0)), now));
  if(stmts.length) await env.DB.batch(stmts);
  for(const [k, n] of Object.entries(body.load || {}))
    if(/^trade_(search|fetch|limited|error)$/.test(k) && +n > 0) await tally(env, k, Math.min(1000, Math.floor(+n)));
  return json(200, {ok: true, saved: stmts.length});
}

/* ---------- /data/rollprices.json and /data/farmprices.json ---------- */
export async function servePrices(request, env, ctx, kind){
  const url = new URL(request.url), key = new Request(url.origin + url.pathname);
  const hit = await caches.default.match(key);
  if(hit) return hit;
  const w = (await published('worth.json')) || {}, worth = w.worth || {};
  const rows = await env.DB.prepare('SELECT key, p, total, at FROM trade_prices WHERE key LIKE ? AND league = ?')
    .bind(kind + ':%', w.league || '').all();
  const median = p => {   // the middle of the 10 cheapest, in divines
    const v = p.map(([a, c]) => worth[c] ? a * worth[c] : null).filter(x => x !== null).sort((a, b) => a - b);
    if(!v.length) return null;
    const m = v.length >> 1;
    return +(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2).toPrecision(4);
  };
  const out = {updated: null, league: w.league || null, every: 'hour'};
  if(kind === 'roll') out.mods = {}; else out.items = {};
  for(const r of rows.results || []){
    const name = r.key.slice(kind.length + 1), price = median(JSON.parse(r.p));
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
