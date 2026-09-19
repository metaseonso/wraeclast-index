/* Wraeclast Index: pages for search engines and AI search.
   Plain, fast HTML built from the site's own data files, so crawlers that do not run scripts
   still find every gem, unique, passive, base item, atlas thing, currency and keyword.
     /item/<slug>        one thing: requirements, official lines, price, a gold link into the app
     /gems /uniques /passives /bases /atlas /currency /keywords      the lists
     /sitemap.xml  /llms.txt  /llms-full.txt
     /search?q=...       the app's search (the SearchAction target in the home page's JSON-LD)
   Data: data/index.json (the game files, via tools/sync.py) and the live price file (/data/market.json: the in-game
   Currency Exchange for currency, live trade site listings for everything else).
   Slugs: the name in lowercase with hyphens. Unique variants add the base ("name-base"; the bare name
   redirects to the plain base). A name used by two kinds goes to the first of unique, gem, passive,
   keyword, currency, base, atlas; the others add their kind ("fulmination-passive"). Same name, same kind: "-2". */

const SITE = 'https://wraeclastindex.fyi';
const AGE = 3600;                 // pages and files: an hour (prices refresh hourly)
const MARKET_TTL = 300e3;         // the market copy in memory: 5 minutes, like /data/market.json

/* ---------- kinds ---------- */
const KIND = {
  u: {one: 'Unique', word: 'unique', list: 'uniques', rank: 0},
  g: {one: 'Gem', word: 'gem', list: 'gems', rank: 1},
  p: {one: 'Passive', word: 'passive', list: 'passives', rank: 2},
  w: {one: 'Keyword', word: 'keyword', list: 'keywords', rank: 3},
  c: {one: 'Currency', word: 'currency', list: 'currency', rank: 4},   // the market's own come last: it changes
  b: {one: 'Base', word: 'base', list: 'bases', rank: 5},
  a: {one: 'Atlas', word: 'atlas', list: 'atlas', rank: 6},
};
const LISTS = {
  gems: {k: 'g', h1: 'Gems', title: 'PoE2 Gems: every skill, spirit and support gem', app: '/explore#gems'},
  uniques: {k: 'u', h1: 'Uniques', title: 'PoE2 Uniques: mod lines, requirements and prices', app: '/explore#uniques'},
  passives: {k: 'p', h1: 'Passives', title: 'PoE2 Passives: keystones, notables and ascendancies', app: '/explore#tree'},
  bases: {k: 'b', h1: 'Bases', title: 'PoE2 Base Items: every weapon, armour, jewellery, jewel and flask base', app: '/#/craft'},
  atlas: {k: 'a', h1: 'Atlas', title: 'PoE2 Atlas: atlas passives, waystones, tablets and keys', app: '/#/atlas'},
  currency: {k: 'c', h1: 'Currency', title: 'PoE2 Currency Prices', app: '/#/currency'},
  keywords: {k: 'w', h1: 'Keywords', title: 'PoE2 Keywords', app: '/#/'},
};
const ORDER = ['gems', 'uniques', 'passives', 'bases', 'atlas', 'currency', 'keywords'];

export function handles(path){
  return path.startsWith('/item/') || path === '/sitemap.xml' || path === '/llms.txt' || path === '/llms-full.txt' ||
    path === '/search' || Object.hasOwn(LISTS, path.slice(1));
}

export async function respond(request, env, ctx, loadMarket){
  if(request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
  const url = new URL(request.url);
  if(url.pathname === '/search'){   // the app searches in the address after #, which servers never see
    const q = (url.searchParams.get('q') || '').trim();
    return new Response(null, {status: 302, headers: {Location: url.origin + (q ? '/#/?q=' + encodeURIComponent(q) : '/'), 'Cache-Control': 'no-store'}});
  }
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const key = new Request(url.origin + url.pathname);
  let res = cache && await cache.match(key);
  if(!res){
    res = await render(url, await model(env, url.origin, loadMarket));
    if(cache && res.status === 200){
      const put = cache.put(key, res.clone());
      if(ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
    }
  }
  return request.method === 'HEAD' ? new Response(null, res) : res;
}

function render(url, m){
  const path = url.pathname;
  if(path === '/sitemap.xml') return text(sitemap(m), 'application/xml');
  if(path === '/llms.txt') return text(llms(m), 'text/plain');
  if(path === '/llms-full.txt') return text(llmsFull(m), 'text/plain');
  if(LISTS[path.slice(1)]) return html(listPage(m, path.slice(1)));
  const seg = path.slice('/item/'.length);
  let want = seg;
  try { want = decodeURIComponent(seg); } catch {}
  let e = m.bySlug.get(want) || m.bySlug.get(slugify(want));
  if(e && e.alias) e = m.bySlug.get(e.alias);
  if(!e) return html(notFound(m), 404, 300);
  if(e.slug !== seg) return new Response(null, {status: 301, headers: {Location: url.origin + '/item/' + e.slug, 'Cache-Control': 'public, max-age=' + AGE}});
  return html(itemPage(m, e));
}

/* ---------- data ---------- */
let BASE = null;                          // data/index.json and its slugs: fixed for the life of a deploy
let MARKET = null, MARKET_AT = 0;         // the market file, refreshed every 5 minutes
let MODEL = null;

async function model(env, origin, loadMarket){
  if(!BASE) BASE = assetJSON(env, origin, '/data/index.json').then(indexModel).catch(err => { BASE = null; throw err; });
  const base = await BASE;
  if(!MARKET || Date.now() - MARKET_AT > MARKET_TTL){
    MARKET_AT = Date.now();
    MARKET = marketJSON(env, origin, loadMarket);
  }
  const market = await MARKET;
  if(!MODEL || MODEL.base !== base || MODEL.market !== market) MODEL = withMarket(base, market);
  return MODEL;
}
async function assetJSON(env, origin, path){
  const r = await env.ASSETS.fetch(new Request(origin + path));
  if(!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}
async function marketJSON(env, origin, loadMarket){
  try {
    if(loadMarket){ const r = await loadMarket(); if(r.ok) return await r.json(); }
  } catch {}
  try { return await assetJSON(env, origin, '/data/market.json'); } catch { return null; }
}

export function slugify(s){
  s = String(s);
  if(/[^ -~]/.test(s)) s = s.normalize('NFKD');
  return s.replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/['\u2019]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const byName = (a, b) => a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0;

function claim(bySlug, slug, kind){   // the slug a name gets, given what is taken
  const base = slug || KIND[kind].word;
  const other = bySlug.get(base);
  if(!other) return base;
  const stem = other.k === kind ? base : base + '-' + KIND[kind].word;
  if(!bySlug.has(stem)) return stem;
  let n = 2;
  while(bySlug.has(stem + '-' + n)) n++;
  return stem + '-' + n;
}

function indexModel(index){
  const entries = [], variants = new Map(), named = new Map(), IMGS = index.imgs || {};
  for(const it of index.items){
    if(!KIND[it.k] || /^\[DNT/.test(it.n)) continue;
    if(it.img && !/^https?:/.test(it.img)){ const i = it.img.indexOf(':'), pre = IMGS[it.img.slice(0, i)]; if(pre) it.img = pre + it.img.slice(i + 1); }
    if(it.k === 'c' || it.k === 'a') named.set(it.n, it);   // the market must not repeat these
    const e = {it, k: it.k, sort: slugify(it.n)};
    if(it.k === 'u' && it.id.includes(' | ')){
      e.base = it.id.split(' | ')[1];
      if(!variants.has(it.n)) variants.set(it.n, []);
      variants.get(it.n).push(e);
    }
    entries.push(e);
  }
  const bySlug = new Map();
  for(const list of variants.values()){   // variants first: "name-base" is always theirs
    for(const e of list){
      e.slug = claim(bySlug, slugify(e.it.n + ' ' + e.base), 'u');
      e.group = list;
      bySlug.set(e.slug, e);
    }
  }
  // then every bare name, the higher kind first; the shortest id wins among equals (the plain version of a skill)
  const claims = entries.filter(e => !e.slug).map(e => ({k: e.k, id: e.it.id, s: e.sort, e}));
  for(const [n, list] of variants) claims.push({k: 'u', id: n, s: list[0].sort, list});
  claims.sort((a, b) => KIND[a.k].rank - KIND[b.k].rank || a.id.length - b.id.length);
  for(const c of claims){
    const s = claim(bySlug, c.s, c.k);
    if(c.e){ c.e.slug = s; bySlug.set(s, c.e); }
    else {
      const main = c.list.find(e => !/^(Runeforged|Runemastered) /.test(e.base)) || c.list[0];
      if(s === c.s) bySlug.set(s, {alias: main.slug, k: 'u'});
    }
  }
  const gemsByName = new Map();
  for(const e of entries) if(e.k === 'g' && !gemsByName.has(e.sort)) gemsByName.set(e.sort, e);
  return {v: index.v, gen: index.gen, sprites: index.sprites, entries, bySlug, gemsByName, named};
}

function withMarket(base, market){
  const M = (market && market.items) || null;
  const m = {base, market, M, rate: market && market.rates && market.rates.exalted,
    league: market && market.league, updated: market && market.updated,
    v: base.v, gen: base.gen, sprites: base.sprites, lineage: new Map(), currency: [], currencyByName: new Map()};
  m.bySlug = new Map(base.bySlug);
  if(M){
    for(const [key, x] of Object.entries(M)){
      if(!key.startsWith('c:') || !x.n) continue;
      const sort = slugify(x.n), gem = x.cat === 'Lineage Supports' && base.gemsByName.get(sort);
      if(gem){ m.lineage.set(gem, key); continue; }   // one page per thing: the gem page carries the price
      if(base.named.has(x.n)) continue;               // the index has its card (a bulk item or an atlas thing)
      const it = {k: 'c', id: key.slice(2), n: x.n, s: x.cat || 'Currency', t: x.u || '', img: x.ic, dl: x.dl};
      const e = {it, k: 'c', sort};
      e.slug = claim(m.bySlug, e.sort, 'c');
      m.bySlug.set(e.slug, e);
      m.currency.push(e);
      m.currencyByName.set(x.n, e);
    }
  }
  m.entries = base.entries.concat(m.currency);
  m.kinds = {};
  for(const k of Object.keys(KIND)) m.kinds[k] = m.entries.filter(e => e.k === k).sort(byName);
  m.patch = (m.v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');
  m.day = (m.updated || '').slice(0, 10) || m.gen;
  return m;
}

function priceOf(m, e){
  if(!m.M) return null;
  if(e.k === 'g'){ const key = m.lineage.get(e); return key ? m.M[key] : null; }
  if(e.k === 'a') return m.M['c:' + e.it.n] || null;
  if(e.k !== 'u' && e.k !== 'c') return null;
  return m.M[e.k + ':' + e.it.id] || m.M[e.k + ':' + e.it.n] || null;
}

/* ---------- words ---------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const fmt = v => { const [i, f] = String(v).split('.'); return i.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (f ? '.' + f : ''); };
function money(m, div){   // stored in divine; below one divine it reads better in exalted
  if(div === null || div === undefined || !isFinite(div)) return null;
  if(div >= 1 || !m.rate) return {v: div >= 100 ? fmt(Math.round(div)) : String(+div.toFixed(div >= 10 ? 1 : 2)), u: 'div'};
  const e = div * m.rate;
  return {v: e >= 100 ? fmt(Math.round(e)) : String(+e.toFixed(e >= 10 ? 0 : 1)), u: 'ex'};
}
const moneyText = (m, div) => { const x = money(m, div); return x ? x.v + ' ' + x.u : ''; };
const moneyHTML = (m, div) => { const x = money(m, div); return x ? x.v + '<small>' + x.u + '</small>' : ''; };
function changeText(ch){
  if(ch === null || ch === undefined || !isFinite(ch)) return '';
  const r = Math.round(ch);
  return r > 0 ? 'up ' + r + '% in 7 days' : r < 0 ? 'down ' + -r + '% in 7 days' : 'flat over 7 days';
}
function changeHTML(ch){
  if(ch === null || ch === undefined || !isFinite(ch)) return '';
  const r = Math.round(ch);
  const cls = r > 0 ? 'up' : r < 0 ? 'down' : 'flat';
  return '<span class="chg ' + cls + '" title="Change over the last 7 days">' + (r > 0 ? '▲' : r < 0 ? '▼' : '•') + ' ' + Math.abs(r) + '%</span>';
}
function clip(s, n = 158){
  s = s.replace(/\s+/g, ' ').trim();
  if(s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  return cut.slice(0, cut.lastIndexOf(' ') > n * .6 ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,.;:]+$/, '') + '…';
}
const sentence = s => s ? s.replace(/\s*[.!?]?\s*$/, m => m.trim() || '.') : '';
const singular = s => s === 'Currency' ? 'Currency' : s.replace(/ies$/, 'y').replace(/(?<!s)s$/, '');
const when = iso => iso ? iso.slice(0, 16).replace('T', ' ') + ' UTC' : '';

/* The same rules as the app (assets/app.js). */
const SECTION = {g: 'gems', u: 'uniques', p: 'tree'};
function appHref(m, it){
  if(SECTION[it.k]) return '/explore#' + SECTION[it.k] + '=' + encodeURIComponent(it.n);
  if(it.k === 'c' && m.M && m.M['c:' + it.id]) return '/#/currency?c=' + encodeURIComponent(it.id);   // the tab lists the catalogue
  if(it.k === 'b' && it.cr) return '/#/craft?s=' + encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify({c: it.cr, b: it.n, l: 0, m: []})))));
  if(it.k === 'a' && it.at) return '/#/atlas?s=' + it.at + '&q=' + encodeURIComponent(it.n);
  return '/#/?q=' + encodeURIComponent(it.n);   // keywords and the rest: the search, with the thing's own card on top
}
function buildsHref(m, it){
  const lg = m.market && m.market.builds;
  if(!lg) return null;
  let key = null;
  if(it.k === 'g') key = it.w ? 'skills' : 'allskills';
  else if(it.k === 'u') key = 'items';
  else if(it.k === 'p') key = /^Keystone/.test(it.s) || it.asc ? 'keypassives' : (it.rec ? 'anointed' : null);
  return key ? 'https://poe.ninja/poe2/builds/' + lg + '?' + key + '=' + encodeURIComponent(it.n).replaceAll('%20', '+') : null;
}
const GEM_LEVELS = [0, 3, 6, 10, 14, 18, 22, 26, 31, 36, 41, 46, 52, 58, 64, 66, 72, 78, 84, 90];
function gemReq(w, gemLevel){
  const lv = GEM_LEVELS[Math.min(gemLevel, 20) - 1];
  const attr = x => x ? Math.floor((5 + (lv - 3) * 1.7) * Math.pow(x / 100, 0.9) + 0.5) + 4 : 0;
  return [lv, attr(w[0]), attr(w[1]), attr(w[2])];
}
const ATTR = [['Str', 'r'], ['Dex', 'g'], ['Int', 'b']];
function reqPills(rq, note){
  const out = [];
  if(rq[0] > 1) out.push('<span class="pill">Lv ' + rq[0] + '</span>');
  ATTR.forEach(([a, c], i) => { if(rq[i + 1]) out.push('<span class="pill a-' + c + '">' + rq[i + 1] + ' ' + a + '</span>'); });
  if(!out.length) out.push('<span class="pill">No requirements</span>');
  return out.join('') + (note ? '<span class="pill-note">' + note + '</span>' : '');
}
function reqText(rq){
  const out = [];
  if(rq[0] > 1) out.push('level ' + rq[0]);
  ATTR.forEach(([a], i) => { if(rq[i + 1]) out.push(rq[i + 1] + ' ' + a); });
  return out.length ? out.join(', ') : 'none';
}
function costText([v, res]){   // "ManaPerMinute" and the like, in words
  const pct = /Percent/.test(res);
  const words = res.replace('Percent', '').replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
  return v + (pct ? '%' : '') + ' ' + words.map((w, i) => i ? w.toLowerCase() : w).join(' ') + ' at gem level 20';
}
function factsOf(it){
  const f = [];
  if(it.k === 'g'){
    if(it.ct) f.push(+(it.ct / 1000).toFixed(2) + ' s use time');
    if(it.cost) f.push(costText(it.cost));
    if(it.sp !== undefined) f.push(it.sp + ' Spirit');
  }
  if((it.k === 'u' || it.k === 'b') && it.pr) f.push(...it.pr);
  if(it.k === 'w' && it.use){
    const parts = [];
    for(const [k, one, many] of [['gems', 'gem', 'gems'], ['uniques', 'unique', 'uniques'], ['passives', 'passive', 'passives']])
      if(it.use[k]) parts.push(it.use[k] + ' ' + (it.use[k] === 1 ? one : many));
    if(parts.length) f.push('Used by ' + parts.join(', '));
  }
  return f;
}

/* The list a thing belongs to, and its group in that list. */
function groupOf(e){
  const it = e.it, parts = (it.s || '').split(' · ');
  if(e.k === 'g') return parts[0] + 's';
  if(e.k === 'u') return parts.length > 1 ? parts[parts.length - 1] : 'Other';
  if(e.k === 'p') return it.asc ? it.asc + ' ascendancy' : parts[0] + 's' + (it.reg && parts[0] === 'Notable' ? ' · ' + it.reg + ' region' : '');
  if(e.k === 'c') return it.s || 'Currency';
  if(e.k === 'b') return parts[0];
  if(e.k === 'a') return it.at === 'tree' ? 'Atlas passives' + (parts[1] ? ' · ' + parts[1] : '') : parts[0];
  const c = e.sort.charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
function groupRank(e, g){
  if(e.k === 'p') return (e.it.asc ? 3 : /^Keystone/.test(g) ? 0 : /^Notable/.test(g) ? 1 : 2) + ' ' + g;
  if(e.k === 'c') return (g === 'Currency' ? '0 ' : '1 ') + g;
  return g;
}
function groups(list){
  const out = new Map();
  for(const e of list){
    const g = groupOf(e);
    if(!out.has(g)) out.set(g, []);
    out.get(g).push(e);
  }
  return [...out].sort((a, b) => { const x = groupRank(a[1][0], a[0]), y = groupRank(b[1][0], b[0]); return x < y ? -1 : x > y ? 1 : 0; });
}
function otherTitle(e, g){
  if(e.k === 'g') return 'Other ' + g.toLowerCase();
  if(e.k === 'u') return 'Other ' + g + ' uniques';
  if(e.k === 'p') return e.it.asc ? 'Other ' + e.it.asc + ' passives' : 'Other ' + g.replace(' · ', ', ').replace(/^\w/, c => c.toLowerCase());
  if(e.k === 'c') return g === 'Currency' ? 'More currency' : 'Other ' + g.toLowerCase();
  if(e.k === 'b') return 'Other ' + g.toLowerCase() + ' bases';
  if(e.k === 'a') return 'More from the Atlas';
  return 'Other keywords';
}

/* ---------- item pages ---------- */
function icon(m, it){
  if(it.img) return '<img src="' + esc(it.img) + '" alt="" width="34" height="34" decoding="async">';
  const S = m.sprites;
  const sp = it.ic && S && (it.k === 'u' ? S.uniques : S.gems);
  if(sp){
    const sc = Math.min(46 / sp.cw, 50 / sp.ch), w = sp.cw * sc, h = sp.ch * sc;
    return '<span class="ic" style="width:' + w + 'px;height:' + h + 'px;background-image:url(/sprites/' + sp.file +
      ');background-size:' + (sp.w * sc) + 'px ' + (sp.h * sc) + 'px;background-position:' + (-it.ic[0] * w) + 'px ' + (-it.ic[1] * h) + 'px"></span>';
  }
  return '<span class="glyph">' + esc((it.n || '?').replace(/^[^A-Za-z]+/, '').charAt(0)) + '</span>';
}
function spark(pts, ch){
  const p = (pts || []).filter(x => x !== null && isFinite(x));
  if(p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1, w = 84, h = 22;
  const d = p.map((v, i) => (i ? 'L' : 'M') + ((i / (p.length - 1)) * (w - 2) + 1).toFixed(1) + ' ' + (h - 2 - ((v - lo) / span) * (h - 4)).toFixed(1)).join('');
  const col = ch > 0.5 ? 'var(--pos)' : ch < -0.5 ? 'var(--neg)' : 'var(--faint)';
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true"><path d="' + d +
    '" fill="none" stroke="' + col + '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function chart(vals, label){
  const p = vals.filter(v => v !== null && isFinite(v));
  if(p.length < 2) return '';
  const lo = Math.min(...p), hi = Math.max(...p), span = hi - lo || 1, w = 300, h = 64;
  const d = p.map((v, i) => (i ? 'L' : 'M') + ((i / (p.length - 1)) * (w - 4) + 2).toFixed(1) + ' ' + (h - 4 - ((v - lo) / span) * (h - 8)).toFixed(1)).join('');
  return '<figure class="chart"><figcaption>' + esc(label) + '</figcaption><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" aria-hidden="true">' +
    '<path d="' + d + '" fill="none" stroke="' + (p[p.length - 1] >= p[0] ? 'var(--pos)' : 'var(--neg)') + '" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/></svg></figure>';
}
const link = e => '<a href="/item/' + e.slug + '">' + esc(e.it.n) + '</a>';

function anoint(m, it){
  if(!it.rec || !it.rec.length) return null;
  const parts = it.rec.map(n => ({n, e: m.currencyByName.get(n), x: m.M && m.M['c:' + n]}));
  let div = parts.every(p => p.x && p.x.v !== undefined) ? parts.reduce((a, p) => a + p.x.v, 0) : null;
  if(div === null && it.ac) div = it.ac;
  return {parts, div};
}

function lead(m, e){
  const it = e.it, parts = (it.s || '').split(' · ');
  if(e.k === 'g') return it.n + ': ' + (parts[1] ? parts[1] + ' ' : '') + parts[0].toLowerCase() + ' in Path of Exile 2.';
  if(e.k === 'u') return it.n + ': unique ' + parts[0] + ' in Path of Exile 2.';
  if(e.k === 'p') return it.n + ': ' + (it.asc ? it.asc + ' ' : '') + parts[0].toLowerCase() + ' passive in Path of Exile 2.';
  if(e.k === 'c') return it.n + ': ' + singular(it.s).toLowerCase() + ' in Path of Exile 2.';
  if(e.k === 'b') return it.n + ': ' + parts[0].toLowerCase() + ' base in Path of Exile 2.';
  if(e.k === 'a') return it.n + ': ' + parts[0].toLowerCase() + ' in Path of Exile 2.';
  return it.n + ': Path of Exile 2 keyword.';
}
function titleOf(e, px){
  const it = e.it, parts = (it.s || '').split(' · ');
  if(e.k === 'g') return it.n + ' – PoE2 ' + (parts[1] ? parts[1] + ' ' : '') + parts[0].replace(/\b\w/g, c => c.toUpperCase());   // "Lineage Support Gem"
  if(e.k === 'u') return it.n + ' – PoE2 Unique ' + parts[0];
  if(e.k === 'p') return it.n + ' – PoE2 ' + (it.asc ? it.asc + ' ' : '') + parts[0];
  if(e.k === 'c') return it.n + ' – PoE2 ' + singular(it.s) + (px && px.v !== undefined ? ' Price' : '');
  if(e.k === 'b') return it.n + ' – PoE2 ' + parts[0] + ' Base';
  if(e.k === 'a') return it.n + ' – PoE2 ' + parts[0].replace(/\b\w/g, c => c.toUpperCase());
  return it.n + ' – PoE2 Keyword';
}

function itemPage(m, e){
  const it = e.it, K = KIND[e.k], px = priceOf(m, e), path = '/item/' + e.slug, g = groupOf(e);
  const lines = it.ls || [], ni = it.ni || 0;
  const an = e.k === 'p' ? anoint(m, it) : null;
  const priceLine = px && px.v !== undefined ? 'Price ' + moneyText(m, px.v) + (changeText(px.ch) ? ', ' + changeText(px.ch) : '') + '.' : '';
  const desc = clip([lead(m, e), priceLine, lines.length ? lines.slice(0, 3).map(sentence).join(' ') : sentence(it.t)].filter(Boolean).join(' '));
  const title = titleOf(e, px) + ' | Wraeclast Index';

  // the card, in the app's own markup
  let req = '';
  if(e.k === 'g'){
    if(!it.w) req = '<span class="pill">No requirements</span>';
    else req = reqPills(gemReq(it.w, 20), 'at gem level 20') + '</div><div class="card-req">' + reqPills(gemReq(it.w, 1), 'at gem level 1');
  } else if(e.k === 'u'){
    if(it.rq) req = reqPills(it.rq);
    if(it.cor) req += '<span class="pill warn">Corrupted</span>';
  } else if(e.k === 'p'){
    if(it.asc) req = '<span class="pill">' + esc(it.asc) + ' ascendancy</span>';
    else if(it.reg) req = '<span class="pill">' + esc(it.reg) + ' region</span>';
  } else if(e.k === 'c' && it.dl) req = '<span class="pill">Drops from area level ' + it.dl + '</span>';
  else if(e.k === 'b' && it.rq) req = reqPills(it.rq);
  else if(e.k === 'a'){
    if(it.ty) req = '<span class="pill">' + ({c: 'Choice', n: 'Notable', s: 'Small'}[it.ty] || '') + '</span>';
    if(it.x > 1) req += '<span class="pill">' + it.x + ' on the tree</span>';
    if(it.nt) req += '<span class="pill warn">' + esc(it.nt) + '</span>';
  }
  const facts = factsOf(it);
  let body = '';
  if(lines.length){
    if(ni) body += '<ul class="card-ls imp">' + lines.slice(0, ni).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
    if(lines.length > ni) body += '<ul class="card-ls">' + lines.slice(ni).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  } else if(it.t) body = '<p class="card-tx">' + esc(it.t) + '</p>';
  if(it.o && it.o.length) body += '<p class="card-facts">Choose one:</p><ul class="card-ls">' + it.o.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  let price = '';
  if(px){
    if(px.h && px.h.length > 3){
      const vals = px.h.map(x => x[1]);
      price += chart(vals, 'Since ' + px.h[0][0] + ' · low ' + moneyText(m, Math.min(...vals)) + ', high ' + moneyText(m, Math.max(...vals)));
    } else if(px.sp) price += chart(px.sp, 'Last 7 days');
    const pf = [];
    if(px.src === 'cx'){
      if(px.vol) pf.push(fmt(Math.round(px.vol)) + ' div traded in 24 h');
      pf.push((m.league ? m.league + ': ' : '') + 'what it traded for on the in-game Currency Exchange, ' + when(px.at || m.updated));
    } else {
      if(px.ls !== undefined) pf.push(fmt(px.ls) + ' listed');
      pf.push((m.league ? m.league + ': ' : '') + 'live trade site listings, checked ' + when(px.at || m.updated));
    }
    price += '<p class="card-facts">' + pf.map(esc).join(' · ') + '</p>';
  }
  const bh = buildsHref(m, it);
  const card =
    '<article class="card k-' + e.k + ' detail">' +
      '<div class="card-hd"><span class="card-ic">' + icon(m, it) + '</span>' +
        '<div class="card-id"><h1>' + esc(it.n) + '</h1><p class="card-sub">' + esc(it.s || '') + '</p></div>' +
        (px && px.v !== undefined ? '<div class="card-px"><b>' + moneyHTML(m, px.v) + '</b>' + changeHTML(px.ch) + '</div>' : '') +
      '</div>' +
      (req ? '<div class="card-req">' + req + '</div>' : '') +
      (facts.length ? '<p class="card-facts">' + facts.map(esc).join(' · ') + '</p>' : '') +
      body +
      (it.tags ? '<p class="card-tags">' + it.tags.map(esc).join(' · ') + '</p>' : '') +
      (an ? '<div class="card-inv"><span>Anoint with ' + an.parts.map(p => p.e ? link(p.e) : esc(p.n)).join(' + ') + '</span><b>' +
        (an.div !== null ? moneyHTML(m, an.div) : '') + '</b></div>' : '') +
      price +
      '<div class="card-ft">' + (px ? spark(px.sp, px.ch) : '') +
        (px && px.ls !== undefined && px.ls < 3 ? '<span class="use">few listed</span>' : '') +
        (bh ? '<a class="card-ext" href="' + esc(bh) + '" rel="noopener" title="Characters' + (m.league ? ' in ' + esc(m.league) : '') + ' that use this, on poe.ninja">Builds ↗</a>' : '') +
        '<span class="kind">' + K.one + '</span></div>' +
    '</article>' +
    '<div class="seo-go"><a class="btn gold" href="' + esc(appHref(m, it)) + '">Open in Wraeclast Index →</a></div>';

  // related: other versions, what mentions a keyword, the neighbours in its list
  let more = '';
  if(e.group && e.group.length > 1)
    more += section('Other versions', e.group.filter(x => x !== e), m);
  if(e.k === 'w'){
    const re = new RegExp('(^|[^a-z])' + it.n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
    const hits = [];
    for(const k of ['g', 'u', 'p']) for(const x of m.kinds[k]){
      if(hits.length >= 30) break;
      if(x.hay === undefined) x.hay = ((x.it.ls || []).join(' ') + ' ' + (x.it.t || '')).toLowerCase();
      if(re.test(x.hay)) hits.push(x);
    }
    if(hits.length) more += section('Mentioned in', hits, m, true);
  }
  const seen = new Set([it.n]);   // one link per name: same-name versions are listed above or on the list page
  const peers = m.kinds[e.k].filter(x => groupOf(x) === g && !seen.has(x.it.n) && seen.add(x.it.n));
  if(peers.length){
    const i = peers.findIndex(x => x.sort > e.sort), start = i < 0 ? 0 : i;
    const ring = [];
    for(let j = 0; j < Math.min(12, peers.length); j++) ring.push(peers[(start + j) % peers.length]);
    more += section(otherTitle(e, g), ring.sort(byName), m);
  }

  const crumbs = [['Wraeclast Index', '/'], [LISTS[K.list].h1, '/' + K.list], [it.n, path]];
  const thing = {'@type': e.k === 'w' ? 'DefinedTerm' : 'Thing', name: it.n, description: clip((lines.length ? lines.map(sentence).join(' ') : sentence(it.t)) || lead(m, e), 500), url: SITE + path};
  if(e.k === 'w') thing.inDefinedTermSet = SITE + '/keywords';
  if(it.img) thing.image = it.img;
  return page(m, {
    title, desc, path, list: K.list,
    ld: ld(m, path, title, desc, crumbs, thing, px ? m.day : m.gen),
    body: crumbsHTML(crumbs) + card + more + browse(),
  });
}

function entryHTML(m, x, withKind){
  const px = priceOf(m, x), it = x.it, parts = (it.s || '').split(' · ');
  const sub = withKind ? KIND[x.k].one : x.k === 'g' ? parts[1] : x.k === 'u' ? parts[0] : x.k === 'b' ? parts[1] : '';
  return '<li class="k-' + x.k + '">' + link(x) + (sub ? '<span class="sub">' + esc(sub) + '</span>' : '') +
    (px && px.v !== undefined ? '<b class="px">' + moneyHTML(m, px.v) + '</b>' : '') + '</li>';
}
function section(title, list, m, withKind){
  return '<section><h2>' + esc(title) + '</h2><ul class="ilist">' + list.map(x => entryHTML(m, x, withKind)).join('') + '</ul></section>';
}
function crumbsHTML(crumbs){
  return '<nav class="crumbs" aria-label="Breadcrumb">' + crumbs.map((c, i) => i < crumbs.length - 1 ?
    '<a href="' + c[1] + '">' + esc(c[0]) + '</a>' : '<span aria-current="page">' + esc(c[0]) + '</span>').join(' <span aria-hidden="true">›</span> ') + '</nav>';
}
function browse(){
  return '<nav class="browse" aria-label="Lists">Browse: ' + ORDER.map(l => '<a class="chip" href="/' + l + '">' + LISTS[l].h1 + '</a>').join('') + '</nav>';
}

/* ---------- list pages ---------- */
function intro(m, name){
  const patch = m.patch ? ', patch ' + m.patch : '';
  const n = fmt(m.kinds[LISTS[name].k].length);
  return {
    gems: 'All ' + n + ' skill, spirit and support gems in Path of Exile 2' + patch + '. Requirements, use times, costs and tags from the game files.',
    uniques: 'All ' + n + ' uniques in Path of Exile 2' + patch + '. Official mod lines, requirements' + (m.league ? ' and ' + m.league + ' prices' : '') + '.',
    passives: 'All ' + n + ' keystones, notables and ascendancy passives in Path of Exile 2' + patch + ', with what they do.',
    bases: 'All ' + n + ' base items in Path of Exile 2' + patch + ': weapons, armour, jewellery, jewels, flasks and charms, with requirements, properties and implicits from the game files.',
    atlas: 'The Atlas in Path of Exile 2' + patch + ': ' + n + ' atlas passives, waystone tiers, tablets, keys and atlas items, from the game files.',
    currency: n + ' currency items in Path of Exile 2' + (m.league ? ' with ' + m.league + ' prices from the in-game Currency Exchange' : '') + '. Updated every hour.',
    keywords: 'All ' + n + ' Path of Exile 2 keywords, in the game\'s own words.',
  }[name];
}
function listPage(m, name){
  const L = LISTS[name], all = m.kinds[L.k], path = '/' + name;
  const gs = groups(all);
  const desc = clip(intro(m, name));
  const title = L.title + ' | Wraeclast Index';
  const crumbs = [['Wraeclast Index', '/'], [L.h1, path]];
  const body = crumbsHTML(crumbs) +
    '<div class="pagehd"><h1>' + L.h1 + '</h1><p>' + esc(intro(m, name)) + '</p></div>' +
    '<div class="seo-go"><a class="btn gold" href="' + L.app + '">Open in Wraeclast Index →</a></div>' +
    (gs.length > 1 ? '<nav class="jump" aria-label="Groups">' + gs.map(([g, l]) => '<a class="chip" href="#' + slugify(g) + '">' + esc(g) +
      '<span class="ct">' + l.length + '</span></a>').join('') + '</nav>' : '') +
    gs.map(([g, l]) => '<section id="' + slugify(g) + '"><h2>' + esc(g) + '<small>' + l.length + '</small></h2><ul class="ilist">' +
      l.map(x => entryHTML(m, x)).join('') + '</ul></section>').join('') + browse();
  return page(m, {title, desc, path, list: name, body,
    ld: ld(m, path, title, desc, crumbs, null, L.k === 'c' || L.k === 'u' ? m.day : m.gen)});
}

function notFound(m){
  return page(m, {title: 'Not found | Wraeclast Index', desc: 'Nothing here.', path: '/404', noindex: true, body:
    '<div class="pagehd"><h1>Not found</h1><p>Nothing here. Try the <a href="/">search</a> or a list.</p></div>' + browse()});
}

/* ---------- the page shell ---------- */
const CSS = `.seo{max-width:960px; width:100%; margin:0 auto; padding:10px 16px 40px}
.crumbs{font-size:12px; color:var(--faint); margin:8px 0 14px}
.crumbs a{color:var(--muted); text-decoration:none}
.crumbs a:hover, .card-inv a:hover{color:var(--accent)}
.seo .card{cursor:default}
.seo .card:hover{translate:none; box-shadow:var(--shadow); border-color:var(--line)}
.card-id h1{margin:0; font:700 22px/1.25 var(--disp); letter-spacing:.03em; overflow-wrap:anywhere}
.card.k-u h1{color:var(--c-unique)} .card.k-g h1{color:var(--c-gem)} .card.k-c h1{color:var(--c-currency)} .card.k-p h1{color:var(--c-keystone)}
.card-ls.imp{padding-bottom:8px; border-bottom:1px dashed var(--line)}
.card-inv a{color:var(--text)}
.pagehd h1{margin:0; font:600 28px var(--disp); letter-spacing:.03em}
.pagehd a{color:var(--accent)}
.seo h2{margin:28px 0 10px; font:600 17px var(--disp); letter-spacing:.03em}
.seo h2 small{margin-left:8px; font:500 11px var(--mono); color:var(--faint); letter-spacing:0}
.seo-go{display:flex; justify-content:flex-end; gap:8px; flex-wrap:wrap; margin-top:12px}
.seo-go .btn.gold{border-width:2px}
.jump{display:flex; flex-wrap:wrap; gap:6px; margin-top:14px}
.jump .chip, .browse .chip{text-decoration:none}
.ilist{list-style:none; margin:0; padding:0; columns:3 250px; column-gap:28px}
.ilist li{break-inside:avoid; display:flex; gap:8px; align-items:baseline; padding:4px 0; border-bottom:1px solid var(--line-soft); font-size:13px}
.ilist a{color:var(--text); text-decoration:none; font-weight:500; overflow-wrap:anywhere}
.ilist li.k-u a{color:var(--c-unique)} .ilist li.k-g a{color:var(--c-gem)} .ilist li.k-c a{color:var(--c-currency)} .ilist li.k-p a{color:var(--c-keystone)}
.ilist a:hover{color:var(--accent)}
.ilist .sub{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11.5px; color:var(--faint)}
.ilist .px{margin-left:auto; white-space:nowrap; font:600 12px var(--mono)}
.ilist .px small{margin-left:2px; font-size:10.5px; font-weight:500; color:var(--faint)}
.browse{display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:30px; font-size:12.5px; color:var(--faint)}`;

function page(m, {title, desc, path, list, body, ld: data, noindex}){
  const url = SITE + path;
  const tabs = '<a href="/">Search</a>' + ORDER.map(l => '<a href="/' + l + '"' + (l === list ? ' aria-current="page"' : '') + '>' + LISTS[l].h1 + '</a>').join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
<meta name="theme-color" content="#070807">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wraeclast Index">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${SITE}/assets/brand/social.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Wraeclast Index: Path of Exile 2, made easier for every kind of player.">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/assets/app.css">
<link rel="stylesheet" href="/assets/cards.css">
<link rel="stylesheet" href="/assets/theme.css">
<link rel="icon" type="image/png" sizes="64x64" href="/assets/brand/favicon-64.png">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32.png">
<style>${CSS}</style>
${data ? '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>' : ''}
</head>
<body>
<header class="top">
  <div class="top-in">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"><img class="mark-wisp" src="/assets/brand/wisp-b.webp" alt="" decoding="async" fetchpriority="low"><img class="mark-logo" src="/assets/brand/logo-64.webp" alt="" width="51" height="64"></span>Wraeclast <em>Index</em></a>
    <nav class="tabs" aria-label="Sections">${tabs}</nav>
  </div>
</header>
<main class="seo">
${body}
</main>
<footer class="foot">
  <p>Game data: patch <b>${esc(m.patch || '')}</b>. Prices: the in-game Currency Exchange (currency) and live trade site listings (everything else), every hour.
  This product isn't affiliated with or endorsed by Grinding Gear Games in any way. <a href="/privacy">Privacy</a></p>
</footer>
</body>
</html>
`;
}

function ld(m, path, title, desc, crumbs, thing, day){
  const url = SITE + path;
  const graph = [
    {'@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'Wraeclast Index'},
    {'@type': 'VideoGame', '@id': SITE + '/#game', name: 'Path of Exile 2'},
    {'@type': thing ? 'WebPage' : 'CollectionPage', '@id': url, url, name: title, description: desc, inLanguage: 'en',
      isPartOf: {'@id': SITE + '/#website'}, breadcrumb: {'@id': url + '#breadcrumb'},
      about: thing ? [{'@id': url + '#item'}, {'@id': SITE + '/#game'}] : {'@id': SITE + '/#game'}, dateModified: day || undefined},
    {'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: crumbs.map((c, i) => ({'@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1]}))},
  ];
  if(thing) graph.push({'@id': url + '#item', ...thing});
  return {'@context': 'https://schema.org', '@graph': graph};
}

function html(body, status = 200, age = AGE){
  return new Response(body, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=' + age, 'X-Content-Type-Options': 'nosniff'}});
}
function text(body, type){
  return new Response(body, {headers: {'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'public, max-age=' + AGE, 'X-Content-Type-Options': 'nosniff'}});
}

/* ---------- sitemap and llms.txt ---------- */
function sitemap(m){
  const urls = [['/', m.day], ['/explore', m.gen]];
  for(const l of ORDER) urls.push(['/' + l, l === 'currency' || l === 'uniques' ? m.day : m.gen]);
  for(const k of ['u', 'g', 'p', 'b', 'a', 'c', 'w']) for(const e of m.kinds[k]) urls.push(['/item/' + e.slug, priceOf(m, e) ? m.day : m.gen]);
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map(([p, d]) => '<url><loc>' + SITE + p + '</loc>' + (d ? '<lastmod>' + d + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
}

function llms(m){
  const n = k => fmt(m.kinds[k].length);
  return `# Wraeclast Index

> Path of Exile 2, made easier for every kind of player. Live prices, build checks, trade search in plain words, and every gem, unique, passive, currency and keyword. Game data from the official game files; prices from the in-game Currency Exchange and live trade site listings.

Game data: patch ${m.patch} (${m.gen}). Prices: ${m.league || 'current'} league, the in-game Currency Exchange (currency) and live trade site listings (everything else), every hour (last ${when(m.updated)}). Prices are in divine orbs (div), or exalted orbs (ex) below one divine. This product isn\'t affiliated with or endorsed by Grinding Gear Games in any way.

Every item has its own plain page at ${SITE}/item/<name>, for example ${SITE}/item/divine-orb: requirements, the official mod lines, price and 7-day change, and a link into the app.

## Lists

- [Gems](${SITE}/gems): ${n('g')} skill, spirit and support gems, with requirements, use times and tags
- [Uniques](${SITE}/uniques): ${n('u')} uniques, with official mod lines, requirements and prices
- [Passives](${SITE}/passives): ${n('p')} keystones, notables and ascendancy passives, with anoint recipes and costs
- [Bases](${SITE}/bases): ${n('b')} base items (weapons, armour, jewellery, jewels, flasks), with requirements, properties and implicits
- [Atlas](${SITE}/atlas): ${n('a')} atlas passives, waystone tiers, tablets, keys and atlas items
- [Currency](${SITE}/currency): ${n('c')} currency items, essences, runes, omens and more, with prices
- [Keywords](${SITE}/keywords): ${n('w')} game keywords, in the game's own words

## App

- [Search](${SITE}/): search everything at once; each result is a live card with price and trend
- [Build](${SITE}/#/build): paste a Path of Building code; see what to fix first and what to buy next, at today's prices
- [Currency](${SITE}/#/currency): every currency price, trend, and flips between divine, exalted and chaos
- [Trade](${SITE}/#/trade): build any trade search in plain words, then open it on the official trade site
- [Gems, uniques and passive tree](${SITE}/explore): the full tables and the passive tree

## Data

- [Item index](${SITE}/data/index.json): every gem, unique, passive, base item, atlas thing and keyword, as JSON
- [Prices](${SITE}/data/market.json): real prices (Currency Exchange and live trade listings) and trends, as JSON, every hour
- [Sitemap](${SITE}/sitemap.xml): every page

## Optional

- [Everything in plain text](${SITE}/llms-full.txt): every item page in one text file
`;
}

function itemText(m, e){
  const it = e.it, px = priceOf(m, e), out = ['### ' + it.n, (it.s || KIND[e.k].one) + ' · ' + SITE + '/item/' + e.slug];
  if(e.k === 'g') out.push(it.w ? 'Requires at gem level 20: ' + reqText(gemReq(it.w, 20)) : 'No requirements');
  if(e.k === 'u' && it.rq) out.push('Requires: ' + reqText(it.rq) + (it.cor ? ' · Corrupted' : ''));
  if(e.k === 'p' && it.asc) out.push(it.asc + ' ascendancy');
  else if(e.k === 'p' && it.reg) out.push(it.reg + ' region');
  if(e.k === 'c' && it.dl) out.push('Drops from area level ' + it.dl);
  if(e.k === 'b' && it.rq) out.push('Requires: ' + reqText(it.rq));
  const f = factsOf(it);
  if(f.length) out.push(f.join(' · '));
  if(it.ls) out.push(...it.ls);
  else if(it.t) out.push(it.t);
  if(it.o) out.push('Choose one: ' + it.o.join(' / '));
  if(it.tags) out.push('Tags: ' + it.tags.join(', '));
  const an = e.k === 'p' ? anoint(m, it) : null;
  if(an) out.push('Anoint with ' + an.parts.map(p => p.n).join(' + ') + (an.div !== null ? ': ' + moneyText(m, an.div) : ''));
  if(px && px.v !== undefined) out.push('Price: ' + moneyText(m, px.v) + (changeText(px.ch) ? ', ' + changeText(px.ch) : ''));
  return out.join('\n');
}
function llmsFull(m){
  let out = `# Wraeclast Index: everything in plain text

> Every Path of Exile 2 gem, unique, passive, currency and keyword, from the game files (patch ${m.patch}). Prices: ${m.league || 'current'} league, the Currency Exchange and live trade listings, ${when(m.updated)}. Prices are in divine orbs (div), or exalted orbs (ex) below one divine.
`;
  for(const l of ORDER){
    const k = LISTS[l].k;
    out += '\n## ' + LISTS[l].h1 + '\n\n' + m.kinds[k].map(e => itemText(m, e)).join('\n\n') + '\n';
  }
  return out;
}
