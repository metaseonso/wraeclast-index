/* Real prices. Currency: the in-game Currency Exchange, from GGG's public hourly feed (tools/exchange.py ->
   exchange.json, sent in by the data server: worker/files.js). Everything else: real listings on the official
   trade site, checked as below.
   The checks run on GitHub Actions (.github/workflows/prices.yml), not here (the trade site blocks
   Cloudflare's shared addresses): once an hour tools/pricepull.py asks GET /api/prices/state what is oldest,
   spreads its checks over the hour, and sends the results to POST /api/prices/ingest. It signs in with
   GitHub's own short-lived token (OpenID Connect) from that workflow on main: this checks GitHub's signature
   and that the token is for that workflow. A key of its own (worker/files.js fromServer) still works too, for
   a run by hand somewhere else.

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
                       leagues is data/leagues.json as the jobs last sent it in (the league clock and the charts'
                       colours), so no page asks the worker for the league dates on their own.
                       ?part=now: the same without the day-by-day history (h) and the exchange pairs (half the size:
                       what the first cards need); ?part=past: only those and the past leagues' lines (lh), for
                       the charts (assets/app.js); ?part=live, ?part=hist: the same two written shorter, and
                       ?part=facts: the catalogue's own words, kept a year by name (the compact parts, below)
   /data/rollprices.json, /data/farmprices.json   the slider and farm prices
   /data/bossprices.json   what every item on the Bosses tab costs, from all three places at once */

import { published, publishedRow, fromServer, fromGitHub, fileWhen } from './files.js';
import { lateAfter } from './health.js';

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

/* ---------- GitHub's signed token (worker/files.js fromGitHub), from the price workflow only ---------- */
const signed = async (request, env, url) => (await fromServer(request, env)) || !!(await fromGitHub(request, url, WORKFLOW));

/* ---------- one kind's rows ---------- */
/* The rows of some kinds of price in one league. Asked by key range ("uniq:" up to "uniq;") rather than LIKE,
   so the database walks the key's own index (or the league one, migration 0011) and reads that kind's rows
   only: with LIKE it read the whole table on every build (worker/migrations/0011). */
async function kindRows(env, cols, league, kinds){
  const res = await env.DB.batch(kinds.map(k => env.DB.prepare(
    'SELECT ' + cols + ' FROM trade_prices WHERE league = ? AND key >= ? AND key < ?').bind(league, k + ':', k + ';')));
  return res.flatMap(r => (r && r.results) || []);
}

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
/* What the price job says about its own run (tools/pricepull.py), so a check that fails is never silent: how
   many it tried, how many came back, how many failed and why, per kind of key. Sent with every batch, counted
   from the start of the run, and kept as the latest run (meta pull:run) for the job watch (worker/health.js).
   failedKeys: the keys that failed since the last batch. Each one's run of failed runs is kept (meta
   pull:streak) and sent back, so the job can say when the same thing has failed 3 runs running. */
const WHY = /^[\w .:'-]{1,40}$/;
const count = v => Math.max(0, Math.min(1e5, Math.floor(+v || 0)));
function runOf(x){
  if(!x || typeof x !== 'object' || Array.isArray(x)) return null;
  const why = {}, kinds = {};
  for(const [k, v] of Object.entries(x.why || {}).slice(0, 12)) if(WHY.test(k)) why[k] = count(v);
  for(const [k, v] of Object.entries(x.kinds || {}).slice(0, 12))
    if(/^[a-z]{2,10}$/.test(k) && v && typeof v === 'object')
      kinds[k] = {tried: count(v.tried), ok: count(v.ok), failed: count(v.failed), empty: count(v.empty)};
  return {id: String(x.id || '').slice(0, 40), at: new Date().toISOString(), final: x.final === true,
    tried: count(x.tried), ok: count(x.ok), failed: count(x.failed), empty: count(x.empty),
    limited: count(x.limited), skipped: count(x.skipped), why, kinds};
}
const STREAKS = 300;   // failed keys remembered at most: the longest runs of failures are the ones kept
async function streaks(env, run, failed, fine){
  let was = {};
  try { was = JSON.parse((await meta(env, 'pull:streak')) || '{}') || {}; } catch {}
  const out = {};
  for(const k of fine) delete was[k];   // came back this run: its count starts again
  for(const k of failed){
    const r = Array.isArray(was[k]) ? was[k] : [0, ''];
    was[k] = r[1] === run ? r : [r[0] + 1, run];   // once per run, however many batches name it
    out[k] = was[k][0];
  }
  const keep = Object.entries(was).sort((a, b) => b[1][0] - a[1][0]).slice(0, STREAKS);
  return {out, stmt: env.DB.prepare('INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v')
    .bind('pull:streak', JSON.stringify(Object.fromEntries(keep)))};
}

const META_SQL = 'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v';
// the newest check of each kind (meta at:<kind>), so the job watch reads a few rows instead of the whole table
const NEWEST_SQL = 'INSERT INTO meta (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = CASE WHEN excluded.v > v THEN excluded.v ELSE v END';
export async function ingest(request, env, url, ctx){
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
  const worth = await exchangeWorth(env, url.origin, ctx);
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
  const saved = stmts.length;
  if(saved){
    // the built market file is out of date from here (meta mkt), and so is each kind's newest check
    stmts.push(env.DB.prepare(META_SQL).bind('mkt', String(Date.now())));
    for(const kind of new Set(rows.map(r => r.key.slice(0, r.key.indexOf(':')))))
      stmts.push(env.DB.prepare(NEWEST_SQL).bind('at:' + kind, now));
  }
  // the run's own account of itself, and which keys keep failing
  const run = runOf(body.run);
  let streak = {};
  if(run){
    const failed = (Array.isArray(body.failedKeys) ? body.failedKeys : []).slice(0, 100)
      .map(x => Array.isArray(x) ? x[0] : x).filter(k => typeof k === 'string' && KEY.test(k));
    const s = await streaks(env, run.id, failed, rows.map(r => r.key));
    streak = s.out;
    stmts.push(env.DB.prepare(META_SQL).bind('pull:run', JSON.stringify(run)), s.stmt);
  }
  if(stmts.length) await env.DB.batch(stmts);
  for(const [k, n] of Object.entries(body.load || {}))
    if(/^trade_(search|fetch|exchange|limited|error)$/.test(k) && +n > 0) await tally(env, k, Math.min(1000, Math.floor(+n)));
  if(saved && league && ctx){
    // a price for a league that is not the newest one kept: the order of the leagues has moved on
    ctx.waitUntil((async () => {
      if((await leagueOrder(env)).order[0] !== league) await leagueOrder(env, true);
      await buildMarket(env, url.origin, ctx);
    })().catch(() => null));
  }
  return json(200, {ok: true, saved, streak});
}

/* ---------- keeping each league's line ---------- */
/* The leagues price_leagues holds, newest first, by when each one was last written to: a league that has
   finished stopped being written to, this one is being written to now. Our own rows say it, so a league is
   never ordered by a name or a date from anywhere else.
   Working it out reads every row of the table, so the answer is kept (meta lorder, with when it was worked
   out) and read from there: the day's roll works it out again, and so does a price for any league that is not
   the newest (ingest). fresh: work it out now. Returns {order, at}. */
async function leagueOrder(env, fresh){
  if(!fresh){
    try {
      const kept = JSON.parse((await meta(env, 'lorder')) || 'null');
      if(kept && Array.isArray(kept.order)) return kept;
    } catch {}
  }
  let rows = {results: []};
  try { rows = await env.DB.prepare('SELECT league, MAX(at) AS at FROM price_leagues GROUP BY league').all(); } catch {}   // no table yet
  const out = {order: (rows.results || []).filter(r => r.league).sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map(r => r.league),
    at: new Date().toISOString()};
  try { await setMeta(env, 'lorder', JSON.stringify(out)); } catch {}
  return out;
}
/* Which day of its own league a day is, from the league start dates (data/leagues.json, tools/leagues.py), so
   the lines on a chart line up by day of league and not by date. A league that list does not name gets 0: its
   line starts at the left of its own league, which is what it is, rather than being shifted by a guess. */
/* Also gives the time of the copy it read (its arrival, or the backup's own hour), which a build keeps, and the
   file itself, which rides in today's prices (the league clock and the charts' colours read it from there). */
async function leagueStarts(env, origin, ctx, fresh){
  const row = await publishedRow(env, origin, 'leagues.json', ctx, fresh);
  const f = (row && row.data) || (await asset(env, origin, 'leagues.json')) || {};
  const out = new Map();
  for(const l of f.leagues || []) if(l && l.name && /^\d{4}-\d{2}-\d{2}$/.test(l.start || '')) out.set(l.name, dayNo(l.start));
  return [out, (row && (row.at || row.own)) || 0, f];
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
  const {order} = await leagueOrder(env, true);
  let dropped = 0;
  if(order[0] === cx.league && order.length > KEEP){
    const go = order.slice(KEEP);
    await env.DB.prepare('DELETE FROM price_leagues WHERE league IN (' + go.map(() => '?').join(',') + ')').bind(...go).run();
    dropped = go.length;
    await leagueOrder(env, true);
  }
  await setMeta(env, 'mkt', Date.now());   // the built market file is out of date from here
  return {ok: true, rolled: stmts.length, dropped};
}

async function exchangeWorth(env, origin, ctx){
  const x = (await published(env, origin, 'exchange.json', ctx)) || {};
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
/* The leagues before our own store began, read once from poe.ninja and committed (tools/ninjapast.py). One
   real number a currency: what it finished that league at. It is only ever put where we have nothing of our
   own, it is marked as theirs so the card can say so, and it goes the moment our own line for that league
   exists. */
async function ninjaPast(env, origin, ctx){
  // it ships with the site and no job sends it in, so the site's own copy is read, not the backup site's
  const f = (await asset(env, origin, 'pastprices.json')) || (await published(env, origin, 'pastprices.json', ctx));
  const out = new Map();
  for(const l of (f && f.leagues) || []){
    if(!l || !l.name) continue;
    for(const [name, row] of Object.entries(l.items || {})){
      if(!row || !(row.v > 0)) continue;
      const list = out.get('c:' + name) || [];
      list.push({n: l.name, v: row.v});
      out.set('c:' + name, list);
    }
  }
  return out;
}
/* The past leagues' own rows, [[key, league, s], ...]. Reading them is most of a build's database reads
   once there are past leagues, and they only change when the day's roll runs or the leagues move on, so they
   are kept as a built row of their own (built:<deploy>:lines), named by which leagues they are and when the
   league order was last worked out (worker/prices.js leagueOrder). Throws with no table. */
async function pastRows(env, leagues, lo){
  if(!leagues.length) return [];
  const base = builtName(env, 'lines'), stamp = JSON.stringify([leagues, lo.at]);
  try {
    const got = unpack((await readBuilt(env, base).all()).results || [], base);
    if(got && got.head.key === stamp) return JSON.parse(got.body);
  } catch {}
  const rows = await env.DB.prepare('SELECT key, league, s FROM price_leagues WHERE league IN (' + leagues.map(() => '?').join(',') + ')')
    .bind(...leagues).all();
  const list = (rows.results || []).map(r => [r.key, r.league, r.s]);
  try { await env.DB.batch(keepBuilt(env, base, {v: BUILT_V, key: stamp}, JSON.stringify(list))); } catch {}
  return list;
}
async function addLeagueLines(env, origin, ctx, league, items, own, starts){
  const lo = await leagueOrder(env), order = lo.order;
  // the leagues to draw behind this one: ours first, then the ones only poe.ninja has, newest start first
  const ninja = await ninjaPast(env, origin, ctx);
  const seen = new Set([league, ...order]);
  const theirs = [...new Set([...ninja.values()].flat().map(x => x.n))].filter(n => !seen.has(n));
  const back = [...order.filter(l => l && l !== league), ...theirs]
    .sort((a, b) => (starts.get(b) || 0) - (starts.get(a) || 0)).slice(0, BACK);
  const startOf = l => (starts.has(l) ? starts.get(l) : null);
  const here = startOf(league);
  const by = new Map();
  if(back.length){
    let rows = [];
    try { rows = await pastRows(env, back.filter(l => order.includes(l)), lo); }
    catch { return; }   // no table yet: cards carry this league only, as before
    for(const [key, lg, s] of rows){
      const r = {key, league: lg, s};
      const line = dense(r.s, startOf(r.league));
      if(!line) continue;
      const list = by.get(r.key) || [];
      list.push({n: r.league, b: back.indexOf(r.league) + 1, ...line});
      by.set(r.key, list);
    }
  }
  /* A league we have nothing of our own in: their one number stands in its place, on the last day of that
     league, marked as theirs. Their rows are keyed by the card, not by the row in our own table, so they are
     put in here beside whatever of ours is already there. */
  const ninjaFor = k => (ninja.get(k) || []).map(row => {
    const b = back.indexOf(row.n) + 1;
    if(!b) return null;
    const s = starts.get(row.n);
    const after = b > 1 ? starts.get(back[b - 2]) : starts.get(league);
    return {n: row.n, b, d0: s !== undefined && after !== undefined ? Math.max(0, after - s - 1) : 0,
      v: [row.v], src: 'ninja'};
  }).filter(Boolean);
  for(const [k, it] of Object.entries(items)){
    const mine = own.get(k);
    const ours = mine ? (by.get(mine.k) || []) : [];
    const past = [...ours, ...ninjaFor(k).filter(x => !ours.some(o => o.n === x.n))].sort((a, b) => a.b - b.b);
    if(!mine){   // nothing of our own at all: their leagues are the whole of the chart's past
      if(past.length) it.lh = {d0: 0, past};
      continue;
    }
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
/* The parts, and which of them are made together. A part is cached with the others of its group, so a page on
   this deploy and one still on the last (which asks for now and past) cost the database one build between them.
     now, past   today's prices and the history, in the shape the pages have always read. Pages from an older
                 deploy and the drill-down page's own tables still ask for these, so they never change shape.
     live        now, without what the catalogue says (?part=facts), and with its times written shorter
     hist        past, with its days written shorter and each note said once
     facts       what the catalogue says about each currency, named by its content (v): a page asks for the
                 one live names, and that one never changes, so the browser keeps it for a year
   The three short ones are below (the compact parts). */
const GROUP = {now: ['now', 'live'], live: ['now', 'live'], past: ['past', 'hist'], hist: ['past', 'hist']};
const PARTS = {now: 1, past: 1, live: 1, hist: 1, facts: 1};
const marketKey = (origin, part) => new Request(origin + '/data/market.json?from=trade' + (part ? '&part=' + part : ''));
// every price file the worker answers is open data like the rest of /data/* (_headers): any site may read it
const JSON_TYPE = {'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*'};
const SHORT = 'public, max-age=300, stale-while-revalidate=600';
export async function serveMarket(request, env, ctx){
  const url = new URL(request.url), asked = url.searchParams.get('part'), part = PARTS[asked] ? asked : '';
  if(part === 'facts') return serveFacts(url, env, ctx);
  const hit = await caches.default.match(marketKey(url.origin, part));
  if(hit) return hit;
  const group = groupOf(part);
  let bodies;
  try {
    let got = null;
    try { got = await builtPart(env, url.origin, part, group); } catch {}   // no table, or a row that does not read: built below
    bodies = got && got.body !== null ? {[part]: got.body} : await buildGroup(env, url.origin, ctx, group, got && got.now);
  } catch(e){   // the database is failing (or out of its day's reads), or the build broke: the last good copy
    return lastGood(ctx, 'market:' + (part || 'full'), marketKey(url.origin, part), e);
  }
  let res = null;
  for(const [p, body] of Object.entries(bodies)){   // each part cached on its own, for 5 minutes in this data centre
    const r = new Response(body, {headers: {...JSON_TYPE, 'Cache-Control': SHORT}});
    if(p === part) res = r.clone();
    ctx.waitUntil(caches.default.put(marketKey(url.origin, p), r));
    ctx.waitUntil(keepLast('market:' + (p || 'full'), body));
  }
  return res;
}

/* ---------- the last good copy ----------
   Every price file this worker builds is also kept for 24 hours in the data centre (keepLast). When a build throws
   (the database failing, or past its free day's reads or writes, after which every query fails until midnight UTC)
   the last copy is served instead of an error: the same prices with the same times, so each one still says how old
   it is, "late" set on the file's top line where it has one, and X-WI-Last naming when the copy was kept. The page
   reads that header and says live prices are paused (assets/app.js). The answer is kept for a minute, so a failing
   database is asked once a minute per data centre, not once a page. Nothing kept (a data centre that never built
   it, or a day gone by): 503, and the page falls back to the copy the deploy shipped (data/market-last.json,
   tools/build.mjs). The failure itself is logged loudly every time (Workers observability). */
const LAST_AGE = 86400;
const lastKey = name => new Request('https://last.local/prices/' + encodeURIComponent(name));
function keepLast(name, body){
  return caches.default.put(lastKey(name), new Response(body, {headers: {...JSON_TYPE,
    'Cache-Control': 'public, max-age=' + LAST_AGE, 'X-Kept': new Date().toISOString()}})).catch(() => {});
}
async function lastGood(ctx, name, key, err){
  console.error('prices: ' + name + ' could not be built, serving the last good copy: ' + ((err && err.stack) || err));
  const kept = await caches.default.match(lastKey(name)).catch(() => null);
  if(!kept) return new Response(JSON.stringify({error: 'Prices are paused.'}), {status: 503,
    headers: {...JSON_TYPE, 'Cache-Control': 'no-store', 'Retry-After': '60'}});
  let body = await kept.text();
  const at = body.indexOf('"late":false');   // the file's own flag sits in its first few fields, never in an item
  if(at >= 0 && at < 4000) body = body.slice(0, at) + '"late":true' + body.slice(at + 12);
  const res = new Response(body, {headers: {...JSON_TYPE, 'Cache-Control': 'public, max-age=60',
    'X-WI-Last': kept.headers.get('X-Kept') || 'yes', 'Access-Control-Expose-Headers': 'X-WI-Last'}});
  ctx.waitUntil(caches.default.put(key, res.clone()).catch(() => {}));
  return res;
}

/* ---------- built once, when what it is made of changes ----------
   A build reads every unique and base price of the league (about 800 rows) and the past leagues' lines. It
   used to run on every data centre's cache miss, every 5 minutes, and with the whole trade_prices and
   price_leagues tables read each time (about 3,600 rows a miss) that took the database past the free plan's
   5 million reads on 25 Sep. Now each group of parts is built when something it is made of changes (a price
   run sends prices in, a data file arrives, the day's Currency Exchange roll: buildMarket) and kept in the
   files table under names of its own (built:<deploy>:market:<part>), so a miss reads about five rows: when
   each input last changed, and the part itself.
   A built part's first line says what it was built from: the time of each file it read, the time the trade
   prices last changed (meta mkt) and when its "late" flag turns true (lateAt). It is served only while
   nothing it was built from has moved on since and never past lateAt, so a stale price is never passed off as
   a new one and a late file still says so. Anything else (no built row, a newer input, another deploy, no
   table) builds it the way it always was, and keeps it. A part over 1.2 MB goes in numbered rows (#2, #3, ...),
   each well under D1's 2 MB a row. */
const BUILT_V = 3;          // the shape of a built row: a new number reads every older row as missing (2: league dates in now, 3: only the fields the page reads)
const CHUNK = 1.2e6;        // bytes in one built row at most
// the files each group is made from: a built group is out of date once one of these has moved on
const INPUTS = {full: ['market.json', 'exchange.json', 'leagues.json'], now: ['market.json', 'exchange.json', 'leagues.json'],
  past: ['market.json', 'exchange.json', 'leagues.json']};
const groupOf = part => !part ? 'full' : GROUP[part][0] === 'now' ? 'now' : 'past';
const deployOf = env => String((env.CF_VERSION_METADATA && env.CF_VERSION_METADATA.id) || 'local').slice(0, 8);
const builtName = (env, what) => 'built:' + deployOf(env) + ':' + what;   // never a name /api/data/put takes
const partName = (env, part) => builtName(env, 'market:' + (part || 'full'));
const readBuilt = (env, base) => env.DB.prepare('SELECT name, body FROM files WHERE name >= ? AND name < ?').bind(base, base + '$');
const INPUT_SQL = "SELECT name, at FROM files WHERE name IN ('market.json', 'exchange.json', 'leagues.json')";
const MKT_SQL = "SELECT v FROM meta WHERE k = 'mkt'";
const FILE_SQL = 'INSERT INTO files (name, body, at) VALUES (?, ?, ?) ON CONFLICT(name) DO UPDATE SET body = excluded.body, at = excluded.at';
const enc = new TextEncoder(), dec = new TextDecoder();

/* When each thing a build is made from last changed: {f: {file: unix seconds}, d: {file: true when the
   database has it}, t: meta mkt}. A file no job has sent in is timed by the backup's own hour (worker/files.js
   fileWhen). res: the answers to INPUT_SQL and MKT_SQL, when they were asked in a batch already. */
async function inputsOf(env, origin, res, names){
  if(!res) res = await env.DB.batch([env.DB.prepare(INPUT_SQL), env.DB.prepare(MKT_SQL)]);
  const f = {}, d = {};
  for(const r of res[0].results || []){ f[r.name] = r.at; d[r.name] = true; }
  await Promise.all(names.filter(n => !d[n]).map(async n => { f[n] = (await fileWhen(env, origin, n)).at || 0; }));
  const m = (res[1].results || [])[0];
  return {f, d, t: m ? +m.v || 0 : 0};
}
/* a built thing's rows back into {head, body}; null when it is not all there */
function unpack(rows, base){
  const first = rows.find(r => r.name === base);
  const cut = first && typeof first.body === 'string' ? first.body.indexOf('\n') : -1;
  if(cut < 0) return null;
  let head = null;
  try { head = JSON.parse(first.body.slice(0, cut)); } catch { return null; }
  const rest = rows.filter(r => r !== first).map(r => [+r.name.slice(base.length + 1), r.body]).sort((a, b) => a[0] - b[0]);
  if(!head || rest.length !== (head.n || 1) - 1 || rest.some((x, i) => x[0] !== i + 2 || typeof x[1] !== 'string')) return null;
  return {head, body: first.body.slice(cut + 1) + rest.map(x => x[1]).join('')};
}
/* the statements that keep one built thing: its head (one line of JSON) on the first row, the text cut on a
   character boundary into rows of at most CHUNK bytes, and any numbered rows the last one had dropped */
function keepBuilt(env, base, head, text){
  const parts = [];
  if(text.length * 3 <= CHUNK) parts.push(text);   // under the limit however it is written
  else {
    const bytes = enc.encode(text);
    let i = 0;
    do {
      let j = Math.min(bytes.length, i + CHUNK);
      while(j < bytes.length && (bytes[j] & 0xC0) === 0x80) j--;   // never cut a character in two
      parts.push(dec.decode(bytes.subarray(i, j)));
      i = j;
    } while(i < bytes.length);
  }
  const at = Math.floor(Date.now() / 1000);
  return [
    env.DB.prepare('DELETE FROM files WHERE name > ? AND name < ?').bind(base, base + '$'),
    env.DB.prepare(FILE_SQL).bind(base, JSON.stringify({...head, n: parts.length}) + '\n' + parts[0], at),
    ...parts.slice(1).map((p, k) => env.DB.prepare(FILE_SQL).bind(base + '#' + (k + 2), p, at)),
  ];
}
/* a built part still stands: nothing it was made from has moved on, and its "late" has not come due */
function fits(head, now, group){
  if(!head || head.v !== BUILT_V || !head.f || (head.lateAt && Date.now() >= head.lateAt)) return false;
  if((head.t || 0) < now.t) return false;
  return INPUTS[group].every(n => (head.f[n] || 0) >= (now.f[n] || 0));
}
/* the built part and what it has to be newer than, in one batch: {now, body}, body null when it does not stand */
async function builtPart(env, origin, part, group){
  const base = partName(env, part);
  const res = await env.DB.batch([env.DB.prepare(INPUT_SQL), env.DB.prepare(MKT_SQL), readBuilt(env, base)]);
  const now = await inputsOf(env, origin, res, INPUTS[group]);
  const got = unpack(res[2].results || [], base);
  return {now, body: got && fits(got.head, now, group) ? got.body : null};
}
/* Build one group the way it always was, keep it, and give back its parts: {part: text}. now: its inputs,
   read before anything else, so a price that lands while this runs leaves the build older than it and the
   next miss builds again. Rows another deploy built are dropped here: their shape may not be this one's. */
async function buildGroup(env, origin, ctx, group, now, memo){
  now = now || await inputsOf(env, origin, null, INPUTS[group]);
  const made = await makeMarket(env, origin, ctx, group, now, memo);
  const mine = builtName(env, '');
  const stmts = [env.DB.prepare("DELETE FROM files WHERE name >= 'built:' AND name < 'built;' AND NOT (name >= ? AND name < ?)")
    .bind(mine, mine.slice(0, -1) + ';')];
  for(const [p, text] of Object.entries(made.bodies)) stmts.push(...keepBuilt(env, partName(env, p), made.head, text));
  const keep = env.DB.batch(stmts).catch(() => null);   // not kept: served all the same, and built again on the next miss
  if(ctx && ctx.waitUntil) ctx.waitUntil(keep); else await keep;
  return made.bodies;
}
/* After prices or a data file come in (ingest; worker/index.js dataPut): the two groups every page asks for,
   built now so no page waits on a build. The whole file in one (crawler pages, and pages from before the parts
   were split) is built on its first miss. */
export async function buildMarket(env, origin, ctx){
  const now = await inputsOf(env, origin, null, INPUTS.full), memo = {};   // the trade rows read once for both
  for(const group of ['now', 'past']) await buildGroup(env, origin, ctx, group, now, memo);
}

/* One group's parts, built from the files, the trade rows and the past leagues: {bodies: {part: text}, head}.
   memo: an object shared by the builds of one change, so the trade rows are read once for all of them. */
async function makeMarket(env, origin, ctx, group, inputs, memo){
  const fresh = name => (inputs.d[name] ? inputs.f[name] : undefined);   // never built from a copy older than the database's
  const catRow = await publishedRow(env, origin, 'market.json', ctx, fresh('market.json')), cat = (catRow && catRow.data) || {items: {}};
  const cxRow = await publishedRow(env, origin, 'exchange.json', ctx, fresh('exchange.json')), cx = (cxRow && cxRow.data) || {items: {}};
  const stamp = row => (row && (row.at || row.own)) || 0;
  const head = {v: BUILT_V, t: inputs.t, f: {'market.json': stamp(catRow), 'exchange.json': stamp(cxRow)}, lateAt: null, at: Date.now()};
  // the league dates (tools/leagues.py): the past leagues' lines line up by them, and today's prices carry the file
  // itself, so a page never calls the worker for it on its own
  const [starts, leaguesAt, leagueFile] = await leagueStarts(env, origin, ctx, fresh('leagues.json'));
  head.f['leagues.json'] = leaguesAt;
  const league = cat.league || '';
  const rows = memo && memo.league === league ? memo.rows : await kindRows(env, 'key, v, total, at, h', league, ['uniq', 'base']);
  if(memo){ memo.league = league; memo.rows = rows; }
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
  for(const r of rows){
    if(r.key.startsWith('base:')){ if(!baseAt || r.at > baseAt) baseAt = r.at; }
    else if(!uniqAt || r.at > uniqAt) uniqAt = r.at;
  }
  const tradeAt = older(uniqAt, baseAt);
  const updated = older(currencyAt, tradeAt);
  const late = stale(currencyAt, 'file', 'exchange.json') || (!!tradeAt && stale(tradeAt, 'price', 'uniq'));
  // the moment "late" turns true on its own, with nothing new coming in: a built part is not served past it
  if(!late && group !== 'past'){
    const due = [Date.parse(currencyAt) + lateAfter('file', 'exchange.json') * 3600e3,
      tradeAt ? Date.parse(tradeAt) + lateAfter('price', 'uniq') * 3600e3 : Infinity].filter(x => isFinite(x));
    head.lateAt = due.length ? Math.min(...due) : null;
  }
  const own = new Map();   // which price_leagues row each item is, and where this league's own line starts
  const days = new Map();  // each item's own days as they came ("2026-09-05"): hist writes h from these
  // currency: what it traded for on the Currency Exchange over the last 24 hours
  if(cx.league === league) for(const [name, x] of Object.entries(cx.items || {})){
    const o = {v: x.v, vol: x.vol, at: currencyAt, src: 'cx'};
    if(x.v1h) o.v1h = x.v1h;
    if(x.pairs) o.pairs = x.pairs;
    if(x.h && x.h.length >= 2){
      o.h = x.h.map(([d, v]) => [MON[+d.slice(5, 7) - 1] + ' ' + +d.slice(8, 10), v]);
      o.sp = x.h.slice(-7).map(p => p[1]);
      days.set('c:' + name, x.h);
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
  for(const r of rows){
    const base = r.key.startsWith('base:'), k = (base ? 'b:' : 'u:') + r.key.slice(5);
    items[k] = {...fields(r), src: 'trade', ...(base ? {as: 'white'} : {})};
    if(items[k].h) days.set(k, parse(r.h));
    const pts = points(r.h);
    own.set(k, {k: r.key, f: pts.length ? pts[0][0] : null, n: pts.length, g: gapsOf(pts)});
  }
  // the past leagues' lines. Left out of now and live, so the first cards never wait for them.
  if(group !== 'now') await addLeagueLines(env, origin, ctx, league, items, own, starts);
  const top = {league, updated, late, times: {currency: currencyAt, trade: tradeAt, catalogue: came(catRow)},
    primary: 'divine', rates: rate ? {exalted: rate} : {},
    source: 'Currency Exchange and trade site listings', builds: cat.builds,
    markets: cx.league === league ? (cx.markets || []).slice(0, 40) : [],
    // only what the league clock and the charts' colours read: the name, the version, the first day and the colour
    leagues: {updated: leagueFile.updated || null, leagues: (Array.isArray(leagueFile.leagues) ? leagueFile.leagues : [])
      .filter(l => l && l.name).map(l => ({name: l.name, v: l.v, start: l.start, ...(l.colour ? {colour: l.colour} : {})}))}};
  const bodies = {};
  if(group === 'full') bodies[''] = {...top, items};
  else {
    const now = {}, past = {};
    for(const [k, it] of Object.entries(items)){
      const a = {}, b = {};
      for(const [f, v] of Object.entries(it)) (LATER.includes(f) ? b : a)[f] = v;
      now[k] = a;
      if(Object.keys(b).length) past[k] = b;
    }
    if(group === 'now'){
      const facts = await factsOf(cat);
      if(ctx && ctx.waitUntil) ctx.waitUntil(keepFacts(origin, facts));
      bodies.now = {...top, part: 'now', items: now};
      bodies.live = {...top, part: 'live', facts: facts.v, ...liveItems(now, cat, currencyAt)};
    } else {
      bodies.past = {league, updated, part: 'past', items: past};
      bodies.hist = {league, updated, part: 'hist', ...histItems(past, days)};
    }
  }
  for(const p of Object.keys(bodies)) bodies[p] = JSON.stringify(bodies[p]);
  return {bodies, head};
}

/* ---------- the compact parts: live, hist and facts ----------
   assets/app.js turns these back into the now and past shapes in one place, so nothing else on the page sees
   the difference. Every value is the one the old parts carry; only how it is written down changes.
   live   an item leaves out what the catalogue says (it is in facts), and its age is one number, a:
            a: 0    a Currency Exchange price: at is times.currency, src is "cx"
            a: n    a trade listing: at is t0 plus n seconds, src is "trade". Rounded down to the second, so
                    a price is never made to look newer than it is
          an item whose age is anything else keeps its own at and src, as now writes them. facts: the v of
          the facts file that goes with it.
   hist   h is [first day, price, price, ...]: the first day counted from d0, one price a day after it, and hg
          ([[place in the prices, days missing before it], ...]) where a day nothing was checked is left out. An
          item whose days do not run in order keeps its h as past writes it. lh.note is a place in notes, and
          the currency a pair trades against a place in pn: the same few words stand for a thousand items.
   facts  the catalogue's own fields for each currency (names, pictures, what it does, drop level). n is left
          out where it is the name in the key, and a picture on GGG's image server leaves off the start of its
          address (icp). v names the content: the first 12 hex of its SHA-256. */
const ICP = 'https://web.poecdn.com/gen/image/';
async function factsOf(cat){
  const items = {};
  for(const [k, it] of Object.entries(cat.items || {})){
    if(!k.startsWith('c:')) continue;
    const o = {};
    for(const [f, v] of Object.entries(it)) if(!DROP.includes(f)) o[f] = v;
    if(o.n === k.slice(2)) delete o.n;
    if(typeof o.ic === 'string' && o.ic.startsWith(ICP)) o.ic = o.ic.slice(ICP.length);
    items[k] = o;
  }
  const text = JSON.stringify({icp: ICP, items});
  const sum = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const v = [...sum.slice(0, 6)].map(b => b.toString(16).padStart(2, '0')).join('');
  return {v, body: '{"part":"facts","v":"' + v + '",' + text.slice(1)};
}
const keepFacts = (origin, facts) => caches.default.put(marketKey(origin, 'facts'),
  new Response(facts.body, {headers: {...JSON_TYPE, 'Cache-Control': SHORT, 'X-Facts': facts.v}}));
async function serveFacts(url, env, ctx){
  let facts = null;
  const hit = await caches.default.match(marketKey(url.origin, 'facts'));
  if(hit && hit.headers.get('X-Facts')) facts = {v: hit.headers.get('X-Facts'), body: await hit.text()};
  else {
    facts = await factsOf((await published(env, url.origin, 'market.json', ctx)) || {items: {}});
    ctx.waitUntil(keepFacts(url.origin, facts));
  }
  // the one the page asked for by name is kept a year; any other answer (a newer catalogue came in between)
  // only as long as the prices are
  const named = url.searchParams.get('v') === facts.v;
  return new Response(facts.body, {headers: {...JSON_TYPE, 'Cache-Control': named ? 'public, max-age=31536000, immutable' : SHORT}});
}
function liveItems(now, cat, currencyAt){
  let t0 = null;
  for(const it of Object.values(now)) if(it.src === 'trade'){
    const t = Date.parse(it.at);
    if(t && (t0 === null || t < t0)) t0 = t;
  }
  if(t0 !== null) t0 = Math.floor(t0 / 1000) * 1000 - 1000;   // a second before the oldest: every n is at least 1
  const items = {};
  for(const [k, it] of Object.entries(now)){
    const said = (k.startsWith('c:') && (cat.items || {})[k]) || {}, o = {};
    for(const [f, v] of Object.entries(it)){
      if(f === 'n' && k.startsWith('c:') && v === k.slice(2)) continue;
      if(f !== 'at' && f !== 'src' && f in said && !DROP.includes(f)) continue;   // in facts
      o[f] = v;
    }
    const t = Date.parse(it.at);
    if(it.src === 'cx' && it.at === currencyAt){ delete o.at; delete o.src; o.a = 0; }
    else if(it.src === 'trade' && t && t0 !== null){ delete o.at; delete o.src; o.a = Math.floor((t - t0) / 1000); }
    items[k] = o;
  }
  return {t0: t0 === null ? null : new Date(t0).toISOString(), items};
}
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const once = (list, at, s) => { if(!at.has(s)){ at.set(s, list.length); list.push(s); } return at.get(s); };   // its place in list
function histItems(past, days){
  let d0 = null;
  for(const k of Object.keys(past)){
    const pts = days.get(k) || [];
    if(pts.length && DAY.test(pts[0][0])){ const n = dayNo(pts[0][0]); if(d0 === null || n < d0) d0 = n; }
  }
  const notes = [], noteAt = new Map(), names = [], nameAt = new Map(), items = {};
  for(const [k, it] of Object.entries(past)){
    const o = {...it}, pts = days.get(k);
    if(it.h && pts && pts.length === it.h.length && d0 !== null){
      const n = pts.map(p => DAY.test(p[0]) ? dayNo(p[0]) : NaN);
      if(n.every((x, i) => isFinite(x) && (!i || x > n[i - 1]))){
        o.h = [n[0] - d0, ...it.h.map(p => p[1])];
        const g = [];
        for(let i = 1; i < n.length; i++) if(n[i] - n[i - 1] > 1) g.push([i, n[i] - n[i - 1] - 1]);
        if(g.length) o.hg = g;
      }
    }
    if(it.lh && typeof it.lh.note === 'string') o.lh = {...it.lh, note: once(notes, noteAt, it.lh.note)};
    if(Array.isArray(it.pairs) && it.pairs.every(x => Array.isArray(x) && typeof x[0] === 'string'))
      o.pairs = it.pairs.map(([n, ...x]) => [once(names, nameAt, n), ...x]);
    items[k] = o;
  }
  return {d0: d0 === null ? null : new Date(d0 * 864e5).toISOString().slice(0, 10), notes, pn: names, items};
}

/* ---------- /data/rollprices.json and /data/farmprices.json ---------- */
export async function servePrices(request, env, ctx, kind){
  const url = new URL(request.url), key = new Request(url.origin + url.pathname);
  const hit = await caches.default.match(key);
  if(hit) return hit;
  try { return await makePrices(url, key, env, ctx, kind); }
  catch(e){ return lastGood(ctx, kind, key, e); }
}
async function makePrices(url, key, env, ctx, kind){
  const cat = (await published(env, url.origin, 'market.json', ctx)) || {};
  const rows = await kindRows(env, 'key, v, total, at', cat.league || '', [kind]);
  const out = {updated: null, league: cat.league || null, every: 'day'};   // one of these comes round in a day
  if(kind === 'roll') out.mods = {}; else out.items = {};
  for(const r of rows){
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
  const body = JSON.stringify(out);
  const res = new Response(body, {headers: {...JSON_TYPE, 'Cache-Control': 'public, max-age=60'}});
  ctx.waitUntil(caches.default.put(key, res.clone()));
  ctx.waitUntil(keepLast(kind, body));
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
  try { return await makeBossPrices(url, ck, env, ctx); }
  catch(e){ return lastGood(ctx, 'boss', ck, e); }
}
async function makeBossPrices(url, ck, env, ctx){
  const [bosses, queries] = await Promise.all([asset(env, url.origin, 'bosses.json'), asset(env, url.origin, 'bossqueries.json')]);
  const catRow = await publishedRow(env, url.origin, 'market.json', ctx), cat = (catRow && catRow.data) || {};
  const cxRow = await publishedRow(env, url.origin, 'exchange.json', ctx), cx = (cxRow && cxRow.data) || {};
  const league = cat.league || '';
  const rows = await kindRows(env, 'key, v, total, at, h', league, ['uniq', 'boss']);
  const uniques = new Map(), entries = new Map();
  let tradeAt = null;
  for(const r of rows){
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
  const body = JSON.stringify(out);
  const res = new Response(body, {headers: {...JSON_TYPE,
    'Cache-Control': 'public, max-age=300, stale-while-revalidate=600'}});
  ctx.waitUntil(caches.default.put(ck, res.clone()));
  ctx.waitUntil(keepLast('boss', body));
  return res;
}
