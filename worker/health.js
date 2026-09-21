/* Is the data still coming in?
   A price that froze but still looks live is the worst thing this site can show, so every data file
   (worker/files.js) and every kind of trade price (worker/prices.js) is watched against its own schedule:
     fine      it came in on time
     late      it has missed a run
     stopped   it has missed several, or nothing has ever come in
     unknown   the file came from the backup site, which does not tell us when it was made
   Used by the owner's dashboard (worker/dash.js, one line at the top) and by:
     GET /api/health   the same as JSON, no sign-in: times only, nothing about anyone. Kept for a minute.
   Until the data jobs move off GitHub, the hourly files still come from the backup site: there is no arrival
   time for those, so they read "unknown" rather than pretending to be fresh. The prices on the pages are
   stamped with the file's own time instead (worker/prices.js), so a stale feed still shows its real age there. */
import { fileWhen } from './files.js';

const CACHE = 60;   // seconds a data centre keeps its answer

/* [where, the file or kind of price, plain name, every (hours), late after (hours), stopped after (hours)]
   The trade price jobs spread their checks over the hour and give up for the hour when the trade site says so,
   so a kind of price is given longer than a file before it counts as late.
   Currency listings (cur) are not watched: the Currency Exchange feed replaced those checks (tools/pricepull.py). */
export const JOBS = [
  ['file', 'exchange.json', 'Currency prices', 1, 2, 6],
  ['file', 'market.json', 'Currency list', 1, 2, 6],
  ['file', 'leagues.json', 'League dates', 6, 13, 26],
  ['price', 'uniq', 'Unique prices', 1, 3, 8],
  ['price', 'roll', 'Mod roll prices', 1, 3, 8],
  ['price', 'farm', 'Farm prices', 1, 3, 8],
];
const KIND = {uniq: 'uniques', roll: 'rolls', farm: 'farms'};   // what each kind of price is called in /api/health
const RANK = {ok: 0, unknown: 1, late: 2, stopped: 3};
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {status, headers: {
  'Content-Type': 'application/json; charset=utf-8', 'X-Robots-Tag': 'noindex', ...extra}});

/* how old data of one kind may be before it counts as late, in hours (worker/prices.js stamps prices with it) */
export function lateAfter(where, name){
  const job = JOBS.find(j => j[0] === where && j[1] === name);
  return job ? job[4] : 0;
}

/* plain English for an age in minutes */
function since(m){
  if(m < 2) return 'just now';
  if(m < 60) return m + ' minutes ago';
  const h = Math.round(m / 60);
  if(h < 48) return h + (h === 1 ? ' hour ago' : ' hours ago');
  return Math.round(h / 24) + ' days ago';
}

/* every job's state, and one line for the worst of them */
export async function health(env, origin){
  const now = Date.now(), at = {file: {}, price: {}};
  await Promise.all(JOBS.filter(j => j[0] === 'file').map(async ([, name]) => {
    at.file[name] = await fileWhen(env, origin, name);   // when it came in, and which source answered
  }));
  try {
    const r = await env.DB.prepare("SELECT substr(key, 1, instr(key, ':') - 1) AS kind, MAX(at) AS at FROM trade_prices GROUP BY kind").all();
    for(const x of r.results || []) at.price[x.kind] = {at: Date.parse(x.at) / 1000, from: 'jobs'};
  } catch {}   // no table yet
  const jobs = JOBS.map(([where, name, what, every, late, stopped]) => {
    const got = at[where][name] || {at: null, from: 'none'};
    const t = got.at ? got.at * 1000 : null;
    const minutes = t ? Math.max(0, Math.round((now - t) / 60000)) : null;
    const state = minutes !== null ? (minutes >= stopped * 60 ? 'stopped' : minutes >= late * 60 ? 'late' : 'ok')
      : got.from === 'backup' ? 'unknown' : 'stopped';
    return {where, name, what, every, state, from: got.from, at: t ? new Date(t).toISOString() : null, minutes};
  });
  const age = j => j.minutes === null ? Infinity : j.minutes;   // nothing at all is the oldest there is
  const worst = jobs.reduce((a, b) => RANK[b.state] > RANK[a.state] ||
    (RANK[b.state] === RANK[a.state] && age(b) > age(a)) ? b : a);
  const line = worst.state === 'ok' ? 'Every data job is on time.'
    : worst.state === 'unknown' ? worst.what + ': from the backup site, age not known here.'
    : worst.minutes === null ? worst.what + ': nothing has come in yet.'
    : worst.what + ' last came in ' + since(worst.minutes) + '.';
  return {state: worst.state, ok: worst.state === 'ok', at: new Date(now).toISOString(), line, jobs};
}

/* ---------- GET /api/health ---------- */
export async function serveHealth(request, env, url, ctx){
  if(request.method !== 'GET') return json(405, {error: 'GET only.'}, {'Cache-Control': 'no-store'});
  const key = new Request(url.origin + '/api/health');
  const hit = await caches.default.match(key);
  if(hit) return hit;
  const h = await health(env, url.origin);
  const one = j => ({what: j.what, at: j.at, minutes: j.minutes, everyHours: j.every, from: j.from, state: j.state});
  const pick = (where, name) => Object.fromEntries(h.jobs.filter(j => j.where === where).map(j => [name(j), one(j)]));
  const res = json(200, {
    state: h.state, ok: h.ok, checked: h.at, note: h.line,
    data: pick('file', j => j.name),
    prices: pick('price', j => KIND[j.name] || j.name),
  }, {'Cache-Control': 'public, max-age=' + CACHE, 'Access-Control-Allow-Origin': '*'});
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}
