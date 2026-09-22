/* Is the data still coming in?
   A price that froze but still looks live is the worst thing this site can show, so every data file
   (worker/files.js) and every kind of trade price (worker/prices.js) is watched against its own schedule:
     fine      it came in on time
     late      it has missed a run
     stopped   it has missed several, or nothing has ever come in
     unknown   nothing says how old it is: no file has come in and the backup's copy gives no time either
   Used by the owner's dashboard (worker/dash.js, one line at the top) and by:
     GET /api/health   the same as JSON, no sign-in: times only, nothing about anyone. Kept for a minute.
   Until the data jobs move off GitHub, the hourly files still come from the backup site, which does not say
   when its copy arrived. The age then comes from the file itself: every job writes the hour of its data at
   the top of what it sends (worker/files.js ownTime), and that hour is never newer than the moment the file
   arrived, so a feed that froze goes late and then stopped like any other job. Which time is used: the arrival
   time whenever a job has sent the file in, the file's own hour only while the backup is the one answering.
   Once the move is done the arrival time is always there and the fallback never runs. The prices on the
   pages are stamped the same way (worker/prices.js), so a stale feed shows its real age there too.
   Watched the same way: a section still showing an older copy because its source failed (data/faults.json,
   written by tools/lastgood.py). The job came in; what it brought did not, so it reads late on the first day
   and stopped after that, with the reason in the owner's own words. */
import { fileWhen, published } from './files.js';

const CACHE = 60;   // seconds a data centre keeps its answer

/* [where, the file or kind of price, plain name, every (hours), late after (hours), stopped after (hours)]
   A file comes in on the hour. A kind of trade price comes round on a day, not an hour: the job runs hourly
   and gives every kind a share of every run, but the trade site turns away most of some runs, so one price
   of a kind is seen about once a day (tools/pricepull.py). What is watched here is whether that share is
   still landing, which is why the price kinds read 24 hours: late once several runs in a row have brought
   nothing of a kind, stopped once a whole day has gone by with nothing, because by then the oldest price of
   that kind is older than the day it promises. Every price also carries its own age on the page, so a slow
   cycle shows itself there whatever this says.
   Currency listings (cur) are not watched: the Currency Exchange feed replaced those checks (tools/pricepull.py). */
export const JOBS = [
  ['file', 'exchange.json', 'Currency prices', 1, 2, 6],
  ['file', 'market.json', 'Currency list', 1, 2, 6],
  ['file', 'leagues.json', 'League dates', 6, 13, 26],
  ['price', 'uniq', 'Unique prices', 24, 6, 26],
  ['price', 'roll', 'Mod roll prices', 24, 6, 26],
  ['price', 'farm', 'Farm prices', 24, 6, 26],
  ['price', 'boss', 'Boss entry prices', 24, 6, 26],
];
const KIND = {uniq: 'uniques', roll: 'rolls', farm: 'farms', boss: 'bosses'};   // what each kind of price is called in /api/health
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

/* Sections still showing an older copy, from data/faults.json. A builder that could not trust what its source
   gave it kept the last good file and wrote the reason there, in plain words; this puts those words in the
   same list as the jobs. Late on the first day, stopped after that: a source that has been dead a day is dead. */
async function stale(env, origin, now){
  let record = null;
  try { record = await published(env, origin, 'faults.json'); } catch {}
  const list = Array.isArray(record && record.faults) ? record.faults : [];
  return list.filter(f => f && f.section).map(f => {
    const t = Date.parse(f.since || f.at || '') || null;
    const minutes = t ? Math.max(0, Math.round((now - t) / 60000)) : null;
    return {where: 'data', name: f.section, what: f.section, every: 0,
      state: minutes !== null && minutes < 24 * 60 ? 'late' : 'stopped', from: 'stale',
      at: t ? new Date(t).toISOString() : null, minutes,
      note: typeof f.line === 'string' && f.line ? f.line
        : f.section + ': still showing the copy from ' + (f.good || 'before') + ', ' + (f.why || 'the source failed') + '.'};
  });
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
  jobs.push(...await stale(env, origin, now));
  const age = j => j.minutes === null ? Infinity : j.minutes;   // nothing at all is the oldest there is
  const worst = jobs.reduce((a, b) => RANK[b.state] > RANK[a.state] ||
    (RANK[b.state] === RANK[a.state] && age(b) > age(a)) ? b : a);
  const line = worst.note ? worst.note                          // a stale section says it in its own words
    : worst.state === 'ok' ? 'Every data job is on time.'
    : worst.state === 'unknown' ? worst.what + ': the file does not say when it was made.'
    : worst.minutes === null ? worst.what + ': nothing has come in yet.'
    : worst.from === 'backup' ? worst.what + ': from ' + since(worst.minutes) + '.'   // the file's own hour, not an arrival
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
    // sections serving an older copy because their source failed; {} when nothing is stale
    stale: Object.fromEntries(h.jobs.filter(j => j.where === 'data').map(j => [j.name, {...one(j), since: j.at, note: j.note}])),
  }, {'Cache-Control': 'public, max-age=' + CACHE, 'Access-Control-Allow-Origin': '*'});
  ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}
