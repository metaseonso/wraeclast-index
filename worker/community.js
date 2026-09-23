/* What players do together: popular trade searches (and later, suggestions).
   Only the search itself is stored. Rate limits use a hash of the address with a random salt that changes
   every day, so nothing can be traced back to a person. */

const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {status,
  headers: {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra}});

/* same-site writes only: our pages send X-WI, and a browser on another site cannot */
export function sameSite(request, url){
  const origin = request.headers.get('Origin');
  return request.headers.get('X-WI') === '1' && (!origin || new URL(origin).host === url.host);
}

/* at most `max` of `action` per address per hour */
export async function allowed(env, request, action, max){
  const day = new Date().toISOString().slice(0, 10);
  let salt = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('salt:' + day).first();
  if(!salt){
    const fresh = hex(crypto.getRandomValues(new Uint8Array(16)));
    await env.DB.prepare('INSERT OR IGNORE INTO meta (k, v) VALUES (?, ?)').bind('salt:' + day, fresh).run();
    salt = await env.DB.prepare('SELECT v FROM meta WHERE k = ?').bind('salt:' + day).first();
    await env.DB.prepare("DELETE FROM meta WHERE k LIKE 'salt:%' AND k < ?").bind('salt:' + day).run();
    await env.DB.prepare('DELETE FROM hits WHERE until < ?').bind(Math.floor(Date.now() / 1000)).run();
  }
  const key = await sha(salt.v + '|' + (request.headers.get('CF-Connecting-IP') || '') + '|' + action);
  const now = Math.floor(Date.now() / 1000);
  const row = await env.DB.prepare('SELECT n, until FROM hits WHERE key = ?').bind(key).first();
  if(row && row.until > now && row.n >= max) return false;
  await env.DB.prepare(`INSERT INTO hits (key, n, until) VALUES (?1, 1, ?2)
    ON CONFLICT(key) DO UPDATE SET n = CASE WHEN until > ?3 THEN n + 1 ELSE 1 END, until = CASE WHEN until > ?3 THEN until ELSE ?2 END`)
    .bind(key, now + 3600, now).run();
  return true;
}

/* ---------- the Suggest button: short notes from players ----------
   A note keeps where it came from and nothing else: the page, and the key of the card it was sent from
   where the mark in a card's corner sent it (assets/suggest.js). Never a word typed elsewhere on the page,
   never anything about the person.

   An interaction card holds a question open rather than answering one (tools/interactions.py), so the same
   note carries an answer where it was sent from one: which way the player says it works, the name they gave
   themselves and where it comes from — their own testing, or a source they name (migration 0010). One path,
   one table, one rate limit. What is public is the lean, the name and the source, which is what the card
   shows: the note's own words stay the owner's, as they always have. Nothing a player wrote is ever drawn as
   the game's own word (assets/clarify.js). */
const KEY = /^[a-z]{1,2}:[^\u0000-\u001f]{1,78}$/;   // a card's own key, "<kind>:<id>"
const LEAN = new Set(['works', 'no', 'unclear']);    // which way it works, in the three words the card offers
const NAME = /^[\w '.-]{1,24}$/;                     // a name a player gave themselves, and nothing else
const said = (v, n) => text(v, n).replace(/[\u0000-\u001f<>]/g, '').trim();

export async function suggest(request, env, url, ctx){
  if(request.method === 'GET') return reported(env, ctx, url);
  if(request.method !== 'POST' || !sameSite(request, url)) return json(403, {error: 'Not allowed.'});
  let body = {};
  try { body = await request.json(); } catch {}
  const note = (typeof body.text === 'string' ? body.text : '').trim().slice(0, 500);
  const lean = LEAN.has(body.lean) ? body.lean : '';
  if(!lean && note.length < 3) return json(400, {error: 'Write a little more.'});
  if(!(await allowed(env, request, 'suggest', 5))) return json(429, {error: 'Too many notes for now.'});
  const card = text(body.card, 80), key = KEY.test(card) ? card : '';
  if(lean && !key) return json(400, {error: 'Nothing to answer.'});
  const who = said(body.who, 24), src = said(body.src, 80);
  await env.DB.prepare('INSERT INTO suggestions (text, page, card, at, lean, who, src) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(note, text(body.page, 120), key, new Date().toISOString(), lean, NAME.test(who) ? who : '', src).run();
  // an answer gets the card's own tally straight back, so the card is right the moment it is sent: the read
  // below is cached at the edge for a minute and would still be showing the answer before this one
  return json(200, lean ? {ok: true, ...(await reportOn(env, key))} : {ok: true});
}

/* What players have said about one interaction, and how often each open interaction gets an answer at all.
   The lean is a tally and counts the moment it is sent: a count carries nobody's words, so nothing anyone
   types can ride in on it. A name and a source are words someone typed, and they go on the page only once
   the owner has looked at that row (shown 1) — a page nobody moderates is a page anyone can write on. A row
   taken down (-1) is in none of it. */
async function reportOn(env, card){
  const [tally, rows, heat] = (await env.DB.batch([
    env.DB.prepare("SELECT lean, COUNT(*) AS n FROM suggestions WHERE card = ? AND lean != '' AND shown >= 0 GROUP BY lean").bind(card),
    env.DB.prepare("SELECT who, lean, src, at, shown FROM suggestions WHERE card = ? AND lean != '' AND shown = 1 ORDER BY id DESC LIMIT 20").bind(card),
    env.DB.prepare("SELECT card, COUNT(*) AS n FROM suggestions WHERE lean != '' AND shown >= 0 AND card != '' GROUP BY card ORDER BY n DESC LIMIT 60"),
  ])).map(r => (r && r.results) || []);
  const lean = {works: 0, no: 0, unclear: 0};
  for(const r of tally) if(lean[r.lean] !== undefined) lean[r.lean] = r.n;
  return {card, lean, n: lean.works + lean.no + lean.unclear,
    who: rows.map(r => ({who: r.who || '', lean: r.lean, src: r.src || '', at: r.at, ours: r.shown === 1 ? 1 : 0})),
    heat: heat.map(r => [r.card, r.n])};
}

async function reported(env, ctx, url){
  const card = text(url.searchParams.get('card'), 80);
  if(card && !KEY.test(card)) return json(400, {error: 'No such card.'});
  const key = new Request(url.origin + '/api/suggest?card=' + encodeURIComponent(card));
  const hit = await caches.default.match(key);
  if(hit) return hit;
  const res = json(200, await reportOn(env, card), {'Cache-Control': 'public, max-age=60'});
  if(ctx) ctx.waitUntil(caches.default.put(key, res.clone()));
  return res;
}

/* ---------- popular trade searches ---------- */
const ID = /^[a-z]+\.[a-z0-9_]+$/;
const num = v => v === '' || v === undefined || v === null ? '' : (isFinite(+v) ? +v : '');
const text = (v, n) => typeof v === 'string' ? v.slice(0, n) : '';
/* keep only what a search is, in a fixed order, so the same search always hashes the same */
function clean(s){
  if(!s || typeof s !== 'object') return null;
  const item = s.item && ['category', 'unique', 'base'].includes(s.item.k) && typeof s.item.v === 'string'
    ? {k: s.item.k, v: text(s.item.v, 80), ...(s.item.base ? {base: text(s.item.base, 80)} : {})} : null;
  const groups = (Array.isArray(s.groups) ? s.groups : []).slice(0, 6).map(g => ({
    t: ['and', 'or', 'count', 'weight', 'not'].includes(g && g.t) ? g.t : 'and',
    ...(g && g.t === 'count' ? {n: num(g.n)} : {}), ...(g && g.t === 'weight' ? {min: num(g.min)} : {}),
    mods: (Array.isArray(g && g.mods) ? g.mods : []).slice(0, 12).filter(m => m && ID.test(m.id || '')).map(m => ({
      id: m.id, ...(m.op ? {op: ['min', 'max', 'eq'].includes(m.op) ? m.op : 'min'} : {}),
      ...(m.v !== undefined ? {v: num(m.v)} : {}), ...(m.w !== undefined ? {w: num(m.w)} : {})})),
  })).filter(g => g.mods.length);
  if(!item && !groups.length) return null;
  const states = {};
  for(const [k, v] of Object.entries(s.states || {})) if(/^[a-z_]{3,30}$/.test(k) && (v === 'yes' || v === 'no')) states[k] = v;
  return {item, rarity: text(s.rarity, 20), types: (Array.isArray(s.types) ? s.types : []).filter(t => /^(ar|ev|es)(\+(ar|ev|es)){0,2}$/.test(t)).slice(0, 7),
    groups, ilvl: num(s.ilvl), quality: num(s.quality), lvl: num(s.lvl), sockets: num(s.sockets), states,
    price: num(s.price), cur: text(s.cur, 20), indexed: text(s.indexed, 20), online: s.online === true};
}

export async function tradeSearches(request, env, ctx, url){
  if(request.method === 'GET'){
    const key = new Request(url.origin + '/api/trade/searches');
    const hit = await caches.default.match(key);
    if(hit) return hit;
    const since = new Date(Date.now() - 7 * 86400e3).toISOString();
    const rows = await env.DB.prepare('SELECT state, n, last FROM trade_searches WHERE last > ? ORDER BY n DESC, last DESC LIMIT 10').bind(since).all();
    const res = json(200, {popular: (rows.results || []).map(r => ({s: JSON.parse(r.state), n: r.n, last: r.last}))},
      {'Cache-Control': 'public, max-age=120'});
    ctx.waitUntil(caches.default.put(key, res.clone()));
    return res;
  }
  if(request.method !== 'POST' || !sameSite(request, url)) return json(403, {error: 'Not allowed.'});
  const raw = await request.text();
  if(raw.length > 6000) return json(413, {error: 'Too big.'});
  let s; try { s = clean(JSON.parse(raw)); } catch { s = null; }
  if(!s) return json(400, {error: 'Nothing to save.'});
  if(!(await allowed(env, request, 'search', 30))) return json(429, {error: 'Slow down.'});
  const state = JSON.stringify(s), id = await sha(state), now = new Date().toISOString();
  if(!(await allowed(env, request, 'search:' + id, 1))) return json(200, {ok: true});   // one count per address per search per hour
  await env.DB.prepare(`INSERT INTO trade_searches (id, state, n, first, last) VALUES (?, ?, 1, ?, ?)
    ON CONFLICT(id) DO UPDATE SET n = n + 1, last = excluded.last`).bind(id, state, now, now).run();
  return json(200, {ok: true});
}
