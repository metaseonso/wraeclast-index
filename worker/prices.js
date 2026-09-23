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
     base:<base item>           base items, white only: the same checks, on the best base of each shape a
                                player shops in (data/basequeries.json, tools/baseprices.py). A rare of that
                                name is another item at another price and is never counted in here.
     roll:<stat>@<value>        trade sliders: the 10 cheapest items with at least that roll
     farm:<key>                 rolled tablets and waystones for the Farms tab
     boss:<key>                 boss entry items the in-game Currency Exchange does not trade (data/bossqueries.json)
     cur:<have>|<want>          currency on the trade site's bulk exchange (the Currency Exchange feed replaced these)
   The job runs hourly and every kind gets a share of every run, but the trade site turns most of some runs
   away, so any one of these prices comes round about once a day, not once an hour (every: 'day' below). The
   Currency Exchange prices are hourly and are not in that budget. Every price carries its own age (at), so
   a price is never shown as newer than it is.
   A price is the middle of the 5 cheapest of those listings, in divines, worked out when it arrives (v), plus one
   price per day (h).
   Listings priced in any currency are turned into divines at the Currency Exchange's own rates.

   Past leagues (table price_leagues, worker/migrations/0008): trade_prices holds the live row only, 45 days,
   and a new league overwrites it, so every league's own line is also kept in a row of its own, keyed by the
   thing and the league. Written from the same day-by-day prices the live row carries, so a run that was missed
   is filled in the next time that thing is checked, and never past the end of the league it belongs to. The
   Currency Exchange's currencies are rolled in once a day from exchange.json (rollLeagues). Rows for leagues
   older than the last four are dropped. Nothing is averaged, filled in or carried from one league to the next:
   a league a thing had no listings in has no row, and so no line.

   /data/market.json   every item's price (the shape the pages read), only from these checks. Names, pictures
                       and descriptions come from the hourly catalogue (market.json); its prices are dropped.
                       updated is the real age of the data behind these prices, times says where that came from
                       and late is true once a job has missed a run (worker/health.js): the page stamps them.
                       ?part=now: the same without the day-by-day history (h) and the exchange pairs (half the size:
                       what the first cards need); ?part=past: only those and the past leagues' lines (lh), for
                       the charts (assets/app.js)
   /data/rollprices.json, /data/farmprices.json   the slider and farm prices
   /data/bossprices.json   what every item on the Bosses tab costs, from all three places at once */

import { published, publishedRow, fromServer } from './files.js';
import { lateAfter } from './health.js';

const ISSUER = 'https://token.actions.githubusercontent.com';
const REPO = 'metaseonso/wraeclast-index';
const WORKFLOW = /^metaseonso\/wraeclast-index\/\.github\/workflows\/prices\.yml@refs\/heads\/main$/;
const DAYS = 45;
const KEEP = 4;      // leagues kept in price_leagues: this one and the three before it
const BACK = 3;      // past leagues a card's chart carries
const SPAN = 400;    // days one league's line may run to: longer than any league has been, so a wrong clock cannot run away
const THIN = 7;      // a line shorter than this is called short on the card rather than drawn as a league

export const tally = (env, kind, n = 1) => env.DB.prepare(
  'INSERT INTO load (hour, kind, n) VALUES (?, ?, ?) ON CONFLICT(hour, kind) DO UPDATE SET n = n + excluded.n')
  .bind(new Date().toISOString().slice(0, 13), kind, n).run();
const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'}});
async function meta(env, k){ const r = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind(k).first(); return r && r.v; }
const setMeta = (env, k, v) => env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v)).run();
const median = a => { if(!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const round = v => v === null || !isFinite(v) ? null : +v.toPrecision(4);

/* ---------- days ---------- */
const dayNo = d => Math.floor(Date.parse(d + 'T00:00:00Z') / 864e5);   // a "2026-09-05" day as a whole number
const parse = s => { try { const x = JSON.parse(s || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
const points = s => (typeof s === 'string' ? parse(s) : Array.isArray(s) ? s : [])
  .filter(x => Array.isArray(x) && /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && x[1] !== null && isFinite(x[1]));

/* One league's line as price_leagues keeps it: [[day, price], ...] in day order, one price a day, days nothing
   was checked left out. Merging the live 45-day history in puts back any day a run missed and corrects a day
   that was checked again; a day that was never checked stays missing, and no day is worked out from its
   neighbours. Days more than SPAN apart are dropped: a league has never run that long, so that is a clock,
   not a price. Returns null when there is nothing to keep. */
function mergeDays(was, add){
  const by = new Map();
  for(const [d, v] of points(was)) by.set(d, v);
  for(const x of add) if(Array.isArray(x) && /^\d{4}-\d{2}-\d{2}$/.test(x[0]) && x[1] !== null && isFinite(x[1])) by.set(x[0], x[1]);
  const days = [...by.keys()].sort();
  if(!days.length) return null;
  const last = dayNo(days[days.length - 1]);
  return days.filter(d => last - dayNo(d) < SPAN).map(d => [d, by.get(d)]);
}

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
// uniq carries "<name> | <base>" where a unique comes on more than one; a base item is one name and no pipe
const KEY = /^(roll:[a-z]+\.[a-z0-9_]+@-?\d+(\.\d+)?|(farm|boss):[a-z0-9-]{1,80}|uniq:[^\n|][^\n]{0,119}|base:[^\n|]{1,120}|cur:[^\s|]{1,60}\|[^\n|]{1,80})$/;
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
  const old = {}, kept = {};
  if(rows.length){
    const marks = rows.map(() => '?').join(','), keys = rows.map(r => r.key);
    const got = await env.DB.prepare('SELECT key, league, h FROM trade_prices WHERE key IN (' + marks + ')').bind(...keys).all();
    for(const r of got.results || []) old[r.key] = r;
    const was = await env.DB.prepare('SELECT key, s FROM price_leagues WHERE league = ? AND key IN (' + marks + ')').bind(league, ...keys).all();
    for(const r of was.results || []) kept[r.key] = r.s;
  }
  const stmts = [];
  for(const r of rows){
    const v = valueOf(r);
    // a new league starts a new line: the last league's days are never carried into this one (its own row in
    // price_leagues already has them), so nothing on a card is ever drawn across a league boundary
    const prev = old[r.key];
    let h = prev && prev.league === league ? parse(prev.h) : [];
    h = h.filter(x => x[0] !== day);
    if(v !== null) h.push([day, v]);
    h = h.slice(-DAYS);
    stmts.push(env.DB.prepare(`INSERT INTO trade_prices (key, league, p, total, at, v, h) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET league = excluded.league, p = excluded.p, total = excluded.total, at = excluded.at, v = excluded.v, h = excluded.h`)
      .bind(r.key, league, JSON.stringify(r.p), r.total, now, v, JSON.stringify(h)));
    // this league's own line, kept whole so it is still here once the league is over
    const line = league ? mergeDays(kept[r.key], h) : null;
    if(line) stmts.push(env.DB.prepare(`INSERT INTO price_leagues (key, league, s, at) VALUES (?, ?, ?, ?)
      ON CONFLICT(key, league) DO UPDATE SET s = excluded.s, at = excluded.at`)
      .bind(r.key, league, JSON.stringify(line), now));
  }
  if(stmts.length) await env.DB.batch(stmts);
  for(const [k, n] of Object.entries(body.load || {}))
    if(/^trade_(search|fetch|exchange|limited|error)$/.test(k) && +n > 0) await tally(env, k, Math.min(1000, Math.floor(+n)));
  return json(200, {ok: true, saved: stmts.length});
}

/* ---------- keeping each league's line ---------- */
/* The leagues price_leagues holds, newest first, by when each one was last written to: a league that has
   finished stopped being written to, this one is being written to now. Our own rows say it, so a league is
   never ordered by a name or a date from anywhere else. */
async function leagueOrder(env){
  let rows = {results: []};
  try { rows = await env.DB.prepare('SELECT league, MAX(at) AS at FROM price_leagues GROUP BY league').all(); } catch {}   // no table yet
  return (rows.results || []).filter(r => r.league).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map(r => r.league);
}
/* Which day of its own league a day is, from the league start dates (data/leagues.json, tools/leagues.py), so
   the lines on a chart line up by day of league and not by date. A league that list does not name gets 0: its
   line starts at the left of its own league, which is what it is, rather than being shifted by a guess. */
async function leagueStarts(env, origin, ctx){
  const f = (await published(env, origin, 'leagues.json', ctx)) || (await asset(env, origin, 'leagues.json')) || {};
  const out = new Map();
  for(const l of f.leagues || []) if(l && l.name && /^\d{4}-\d{2}-\d{2}$/.test(l.start || '')) out.set(l.name, dayNo(l.start));
  return out;
}

/* Once a day: put the Currency Exchange's own day-by-day prices (exchange.json, tools/exchange.py) into this
   league's rows, and drop the leagues older than the last KEEP. The exchange file keeps 45 days and starts
   again each league, so this is the only place a currency's whole league is kept.
   Driven by the file's own time, not the clock: a copy that has not moved on is rolled again next hour rather
   than counting as today's. Called after the file comes in (worker/index.js). */
export async function rollLeagues(env, origin, ctx){
  const cx = await published(env, origin, 'exchange.json', ctx);
  if(!cx || !cx.league) return {ok: false, why: 'no currency file'};
  const mark = cx.league + ' ' + String(cx.updated || '').slice(0, 10);
  if((await meta(env, 'cxroll')) === mark) return {ok: true, rolled: 0};
  let was = {results: []};
  try { was = await env.DB.prepare('SELECT key, s FROM price_leagues WHERE league = ?').bind(cx.league).all(); } catch { return {ok: false, why: 'no table'}; }
  const kept = new Map((was.results || []).map(r => [r.key, r.s]));
  const now = new Date().toISOString(), stmts = [];
  for(const [name, x] of Object.entries(cx.items || {})){
    const line = mergeDays(kept.get('cx:' + name), Array.isArray(x && x.h) ? x.h : []);
    if(line) stmts.push(env.DB.prepare(`INSERT INTO price_leagues (key, league, s, at) VALUES (?, ?, ?, ?)
      ON CONFLICT(key, league) DO UPDATE SET s = excluded.s, at = excluded.at`)
      .bind('cx:' + name, cx.league, JSON.stringify(line), now));
  }
  for(let i = 0; i < stmts.length; i += 64) await env.DB.batch(stmts.slice(i, i + 64));
  await setMeta(env, 'cxroll', mark);
  // the leagues before the last KEEP: dropped, once this league is the one being written to (so a roll that
  // ran against a file from the wrong league can never throw a league away)
  const order = await leagueOrder(env);
  let dropped = 0;
  if(order[0] === cx.league && order.length > KEEP){
    const go = order.slice(KEEP);
    await env.DB.prepare('DELETE FROM price_leagues WHERE league IN (' + go.map(() => '?').join(',') + ')').bind(...go).run();
    dropped = go.length;
  }
  return {ok: true, rolled: stmts.length, dropped};
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

/* ---------- lh: the price line per league, the shape a card's chart reads (assets/app.js) ----------
   lh.d0     which day of this league h[0] is: 0 is the day the league started
   lh.g      where a day is missing from h: [[place in h, days missing before it], ...], left out when every
             day is there. h leaves a day nothing was checked out altogether, so without this the chart would
             sit this league's prices side by side however far apart their days are
   lh.past   the leagues before this one this thing really had prices in, newest first, at most BACK:
               n   the league's name, as the game calls it
               b   how many leagues back it is, 1 to BACK: how faded its line is on the card. It counts
                   leagues, not entries, so a thing that skipped a league is not drawn as if it had not
               d0  which day of that league its own first price is
               v   one price a day from there, null on a day nothing was checked
   lh.note   what to say where the data is thin: a line under a week old, and which of the last BACK leagues
             this thing has nothing from
   Every line is placed by which day of its own league it is, never by date, so a chart can lay them over each
   other. A day with no check is a null and breaks the line there. A league a thing had no prices in has no
   entry and so no line. Nothing is averaged, filled in, or joined from one league to the next. */

// one league's row -> its first day and one price a day from there. `start` is that league's own first day.
function dense(s, start){
  const pts = points(s);
  if(!pts.length) return null;
  const from = dayNo(pts[0][0]), v = [];
  for(const [d, x] of pts){
    const i = dayNo(d) - from;
    if(i < 0 || i >= SPAN) continue;
    while(v.length < i) v.push(null);
    v[i] = x;
  }
  return {d0: start === null ? 0 : Math.max(0, from - start), v};
}
// the days missing from a compacted line, as the chart needs them back (lh.g). Nothing is filled in: a missing
// day is a break in the line, not a price.
const gapsOf = pts => {
  const out = [];
  for(let i = 1; i < pts.length; i++){
    const n = dayNo(pts[i][0]) - dayNo(pts[i - 1][0]) - 1;
    if(n > 0 && n < SPAN) out.push([i, n]);
  }
  return out;
};
const orList = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' or ' + a[a.length - 1];
// said plainly on the card, so a short line is never read as a whole league's price action
function thinNote(days, mine, back){
  const bits = [];
  if(days > 0 && days < THIN) bits.push(days === 1 ? 'One day of prices this league so far.' : days + ' days of prices this league so far.');
  const gone = back.filter(n => !mine.some(m => m.n === n));
  if(gone.length) bits.push('Nothing from ' + orList(gone) + '.');
  return bits.join(' ');
}
/* Put lh on every item that has a league line. `own` says, for each item, which price_leagues key it is
   (k), which day this league's own line starts on (f), how many days it has (n) and which days it is missing
   (g). An item with no past league still gets lh when its own line has a day missing, so the chart breaks
   there rather than drawing straight over it. */
async function addLeagueLines(env, origin, ctx, league, items, own){
  const order = await leagueOrder(env);
  const back = order.filter(l => l && l !== league).slice(0, BACK);
  const starts = await leagueStarts(env, origin, ctx);
  const startOf = l => (starts.has(l) ? starts.get(l) : null);
  const here = startOf(league);
  const by = new Map();
  if(back.length){
    let rows = {results: []};
    try {
      rows = await env.DB.prepare('SELECT key, league, s FROM price_leagues WHERE league IN (' + back.map(() => '?').join(',') + ')')
        .bind(...back).all();
    } catch { return; }   // no table yet: cards carry this league only, as before
    for(const r of rows.results || []){
      const line = dense(r.s, startOf(r.league));
      if(!line) continue;
      const list = by.get(r.key) || [];
      list.push({n: r.league, b: back.indexOf(r.league) + 1, ...line});
      by.set(r.key, list);
    }
  }
  for(const [k, it] of Object.entries(items)){
    const mine = own.get(k);
    if(!mine) continue;
    const past = (by.get(mine.k) || []).sort((a, b) => a.b - b.b);   // newest league first
    const note = thinNote(mine.n, past, back);
    const gaps = mine.g || [];
    if(!past.length && !note && !gaps.length) continue;
    it.lh = {d0: mine.f && here !== null ? Math.max(0, dayNo(mine.f) - here) : 0};
    if(gaps.length) it.lh.g = gaps;
    if(past.length) it.lh.past = past;
    if(note) it.lh.note = note;
  }
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
const LATER = ['h', 'lh', 'pairs'];   // the fields ?part=past carries and ?part=now leaves out
export async function serveMarket(request, env, ctx){
  const url = new URL(request.url), part = ({now: 'now', past: 'past'})[url.searchParams.get('part')] || '';
  const ck = new Request(url.origin + '/data/market.json?from=trade' + (part ? '&part=' + part : ''));
  const hit = await caches.default.match(ck);
  if(hit) return hit;
  const catRow = await publishedRow(env, url.origin, 'market.json', ctx), cat = (catRow && catRow.data) || {items: {}};
  const cxRow = await publishedRow(env, url.origin, 'exchange.json', ctx), cx = (cxRow && cxRow.data) || {items: {}};
  const league = cat.league || '';
  const rows = await env.DB.prepare(
    "SELECT key, v, total, at, h FROM trade_prices WHERE league = ? AND (key LIKE 'uniq:%' OR key LIKE 'base:%')").bind(league).all();
  const rate = cx.league === league ? cx.rate : null;
  const items = {};
  for(const [k, it] of Object.entries(cat.items || {})){
    if(!k.startsWith('c:')) continue;   // uniques come only from our own checks
    const o = {};
    for(const [f, v] of Object.entries(it)) if(!DROP.includes(f)) o[f] = v;
    items[k] = o;
  }
  const currencyAt = cx.league === league ? older(cx.updated, came(cxRow)) : null;
  // each kind of trade check is aged on its own and the older of the two stands, so a kind that has stopped
  // cannot hide behind one that is still running. Both are late after the same six hours (worker/health.js).
  let uniqAt = null, baseAt = null;
  for(const r of rows.results || []){
    if(r.key.startsWith('base:')){ if(!baseAt || r.at > baseAt) baseAt = r.at; }
    else if(!uniqAt || r.at > uniqAt) uniqAt = r.at;
  }
  const tradeAt = older(uniqAt, baseAt);
  const updated = older(currencyAt, tradeAt);
  const late = stale(currencyAt, 'file', 'exchange.json') || (!!tradeAt && stale(tradeAt, 'price', 'uniq'));
  const own = new Map();   // which price_leagues row each item is, and where this league's own line starts
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
    const pts = points(x.h);
    own.set('c:' + name, {k: 'cx:' + name, f: pts.length ? pts[0][0] : null, n: pts.length, g: gapsOf(pts)});
  }
  /* uniques and base items: real listings on the trade site, under the key the card is looked up by. A base
     was asked for white, which is not the item its own name stands for everywhere else, so the row says so
     (as) and the card prints that word beside the price. Nothing is drawn where the last check found nobody
     selling: fields() leaves v out and the card has no price, rather than yesterday's. */
  for(const r of rows.results || []){
    const base = r.key.startsWith('base:'), k = (base ? 'b:' : 'u:') + r.key.slice(5);
    items[k] = {...fields(r), src: 'trade', ...(base ? {as: 'white'} : {})};
    const pts = points(r.h);
    own.set(k, {k: r.key, f: pts.length ? pts[0][0] : null, n: pts.length, g: gapsOf(pts)});
  }
  // the past leagues' lines. Left out of ?part=now, so the first cards never wait for them.
  if(part !== 'now') await addLeagueLines(env, url.origin, ctx, league, items, own);
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
  const out = {updated: null, league: cat.league || null, every: 'day'};   // one of these comes round in a day
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
   Every name in data/bosses.json (what a boss drops, what it costs to get in, and anything only the wiki's
   rate table names: the tab draws a price cell for all three) is looked up in:
     the uniques    our own unique checks (uniq:), which give the names a boss card shows a share of their
                    own so they are not queued behind the rest. A unique that comes on more than one base keeps
                    each base's own price: the cheapest one that is really listed is the one given, with
                    the base it is on, the way the site says "from" elsewhere.
     the rest       the in-game Currency Exchange (exchange.json), by name: the lineage gems, the
                    reliquary keys and most fragments and splinters trade there.
     what it misses the few entry items the Currency Exchange does not trade, checked on the trade site
                    (boss:, data/bossqueries.json).
   A name appears only once something real is known about it. v is a price in divines, or null when the last
   check found nobody selling: never a zero, never a number worked out here, so nothing can sort as free.
   Every row carries the day-by-day prices (h) and the 7-day line off them, the way /data/market.json does, so
   an item opened from a boss card is no poorer than the same item anywhere else on the site. This league only:
   the past leagues' lines (lh) are on /data/market.json, which is where a card gets its chart.
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
    "SELECT key, v, total, at, h FROM trade_prices WHERE league = ? AND (key LIKE 'uniq:%' OR key LIKE 'boss:%')").bind(league).all();
  const uniques = new Map(), entries = new Map();
  let tradeAt = null;
  for(const r of rows.results || []){
    if(!tradeAt || r.at > tradeAt) tradeAt = r.at;
    if(r.key.startsWith('boss:')){ entries.set(r.key.slice(5), r); continue; }
    const id = r.key.slice(5), bar = id.indexOf(' | ');   // "<name>" or "<name> | <base>"
    const name = (bar < 0 ? id : id.slice(0, bar)).toLowerCase();   // a wiki rate table carries the odd lower-case word
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
  const byCx = new Map(Object.keys(cx.items || {}).map(n => [n.toLowerCase(), n]));
  const items = {};
  const add = (name, kind) => {
    if(!name || items[name]) return;
    const low = name.toLowerCase();
    const list = (kind === 'unique' || !kind) && uniques.get(low);   // a rate table says what, not what kind
    if(list){
      const best = pick(list);
      items[name] = {v: null, ...fields(best), src: 'trade', ...(best.base ? {base: best.base} : {})};
      return;
    }
    const row = entries.get(byItem.get(name));
    if(row){ items[name] = {v: null, ...fields(row), src: 'trade'}; return; }
    const c = currencyAt ? (cx.items || {})[byCx.get(low)] : null;   // never another league's prices
    if(!c || !c.v) return;
    const o = {v: c.v, ...(c.vol ? {vol: c.vol} : {}), at: currencyAt, src: 'cx'};
    if(c.h && c.h.length >= 2){   // the same 7-day line the market file carries, so a card is no poorer here
      o.h = c.h.map(([d, v]) => [MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10), v]);
      o.sp = c.h.slice(-7).map(p => p[1]);
    }
    if(c.ch !== undefined) o.ch = c.ch;
    items[name] = o;
  };
  // the tab draws a price cell for every item it can name, and a rate table names items no drop pool covers
  for(const b of (bosses && bosses.bosses) || []){
    for(const name of b.access || []) add(name, 'entry');
    for(const d of b.drops || []) add(d.name, d.kind);
    for(const r of (b.rates && b.rates.rows) || []) add(r.item, null);
  }
  const out = {league, updated: older(currencyAt, tradeAt), every: 'day',
    late: stale(currencyAt, 'file', 'exchange.json') || (!!tradeAt && stale(tradeAt, 'price', 'uniq')),
    times: {currency: currencyAt, trade: tradeAt},
    primary: 'divine', source: 'Currency Exchange and trade site listings', items};
  const res = new Response(JSON.stringify(out), {headers: {'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'}});
  ctx.waitUntil(caches.default.put(ck, res.clone()));
  return res;
}
