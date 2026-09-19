/* Live trade prices, pulled slowly.
   Every minute (the Cron Trigger in wrangler.jsonc) the worker runs one or two official trade searches and
   keeps the 10 cheapest listings in D1. It works through every job once an hour, spread evenly over the hour:
   the mod tiers in data/pricejobs.json (tools/rollprices.py) and the farm inputs in data/farmqueries.json.
   Pages read the results at /data/rollprices.json and /data/farmprices.json, priced in divines with
   data/worth.json (published hourly by tools/market.py).
   The trade site allows about 100 searches an hour from one address. This stays under 90, and pauses when
   the site's X-Rate-Limit headers say it is close to a limit. */

const API = 'https://www.pathofexile.com/api/trade2/';
const PAGES = 'https://metaseonso.github.io/wraeclast-index/data/';
const UA = 'wraeclast-index/1.0 (+https://wraeclastindex.fyi)';
const MAX_HOUR = 90;      // searches an hour, at most
const GAP_MS = 11000;     // between two searches in the same minute

const sleep = ms => new Promise(r => setTimeout(r, ms));
class Limited extends Error { constructor(wait){ super('trade site limit'); this.wait = wait; } }

async function asset(env, path){   // a file shipped with the site
  const r = await env.ASSETS.fetch(new Request('https://assets.local/' + path));
  return r.ok ? r.json() : null;
}
async function published(name){   // a file the hourly GitHub job publishes
  const r = await fetch(PAGES + name, {headers: {'User-Agent': UA}, cf: {cacheTtl: 300, cacheEverything: true}});
  return r.ok ? r.json() : null;
}
async function meta(env, k){ const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first(); return r && r.v; }
const setMeta = (env, k, v) => env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, v).run();
export const tally = (env, kind, n = 1) => env.DB.prepare(
  'INSERT INTO load (hour, kind, n) VALUES (?, ?, ?) ON CONFLICT(hour, kind) DO UPDATE SET n = n + excluded.n')
  .bind(new Date().toISOString().slice(0, 13), kind, n).run();

async function jobs(env){
  const out = [];
  const roll = await asset(env, 'data/pricejobs.json');
  for(const [stat, values] of (roll && roll.roll) || []) for(const v of values)
    out.push({key: 'roll:' + stat + '@' + v, body: {query: {status: {option: 'online'},
      stats: [{type: 'and', filters: [{id: stat, value: {min: v}}]}],
      filters: {type_filters: {filters: {rarity: {option: 'nonunique'}}}}}, sort: {price: 'asc'}}});
  const farm = await asset(env, 'data/farmqueries.json');
  for(const f of (Array.isArray(farm) ? farm : (farm && farm.items)) || []){
    if(!f || !f.key || !f.query) continue;
    const body = f.query.query ? {...f.query} : {query: f.query};
    body.query = {...body.query, status: {option: 'online'}};
    body.sort = {price: 'asc'};
    out.push({key: 'farm:' + f.key, body});
  }
  return out;
}

/* one trade call; returns [data, seconds to pause (0 = fine)] */
async function call(path, body){
  const r = await fetch(API + path, {method: body ? 'POST' : 'GET', body: body ? JSON.stringify(body) : undefined,
    headers: {'User-Agent': UA, 'Content-Type': 'application/json'}});
  if(r.status === 429) throw new Limited(+(r.headers.get('Retry-After') || 600));
  if(!r.ok) throw new Error('trade ' + r.status);
  let wait = 0;
  const rules = r.headers.get('X-Rate-Limit-Ip'), state = r.headers.get('X-Rate-Limit-Ip-State');
  if(rules && state){
    const st = state.split(',');
    rules.split(',').forEach((rule, i) => {
      const [max, per] = rule.split(':').map(Number), [hits, , locked] = (st[i] || '0:0:0').split(':').map(Number);
      if(locked) wait = Math.max(wait, locked);
      else if(hits >= max - 1) wait = Math.max(wait, per);   // sit out the rest of that window
    });
  }
  return [await r.json(), wait];
}

async function priceJob(env, job, league){
  const [found, w1] = await call('search/poe2/' + encodeURIComponent(league), job.body);
  await tally(env, 'trade_search');
  const ids = (found.result || []).slice(0, 10);
  let p = [], w2 = 0;
  if(ids.length && !w1){
    const [got, w] = await call('fetch/' + ids.join(',') + '?query=' + found.id + '&realm=poe2');
    await tally(env, 'trade_fetch');
    w2 = w;
    p = (got.result || []).map(x => x && x.listing && x.listing.price).filter(x => x && x.amount).map(x => [x.amount, x.currency]);
  }
  if(ids.length && !p.length) return Math.max(w1, w2);   // could not read prices this time: keep the last ones
  await env.DB.prepare(`INSERT INTO trade_prices (key, league, p, total, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET league = excluded.league, p = excluded.p, total = excluded.total, at = excluded.at`)
    .bind(job.key, league, JSON.stringify(p), found.total || 0, new Date().toISOString()).run();
  return Math.max(w1, w2);
}

/* the once-a-minute job: this minute's share of the list */
export async function runPrices(env, when){
  const pause = await meta(env, 'trade_pause_until');
  if(pause && Date.parse(pause) > when.getTime()) return;
  const all = await jobs(env);
  const worth = await published('worth.json');
  if(!all.length || !worth || !worth.league) return;
  const cycles = Math.ceil(all.length / MAX_HOUR), slots = cycles * 60;   // more jobs than an hour allows: spread over more hours
  const slot = (when.getUTCHours() % cycles) * 60 + when.getUTCMinutes();
  const mine = all.slice(Math.floor(slot * all.length / slots), Math.floor((slot + 1) * all.length / slots));
  for(let i = 0; i < mine.length; i++){
    if(i) await sleep(GAP_MS);
    let wait = 0;
    try { wait = await priceJob(env, mine[i], worth.league); }
    catch(e){
      if(e instanceof Limited){ wait = e.wait; await tally(env, 'trade_limited'); }
      else { await tally(env, 'trade_error'); continue; }
    }
    if(wait){ await setMeta(env, 'trade_pause_until', new Date(Date.now() + wait * 1000).toISOString()); return; }
  }
}

/* /data/rollprices.json and /data/farmprices.json */
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
