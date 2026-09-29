/* Wraeclast Index: pages for search engines and AI search.
   Plain, fast HTML built from the site's own data files, so crawlers that do not run scripts
   still find every gem, unique, passive, base item, atlas thing, currency and keyword.
     /item/<slug>        one thing: requirements, official lines, price, a gold link into the app
     /md/item/<slug>.md  the same thing in Markdown, for a model to read (noindex: _headers)
     /gems /uniques /passives /bases /atlas /currency /keywords      the lists
     /sitemap.xml        the sitemap index; /sitemap-pages.xml and /sitemap-<list>.xml under it
     /llms.txt  /llms-full.txt (the index of /llms/<list>.txt, each under 256 KB)
     /404                the not-found page every unknown path gets (wrangler.jsonc not_found_handling)
     /search?q=...       the app's search (the SearchAction target in the home page's JSON-LD)
   All but /search are files: tools/build.mjs runs crawl() below at every deploy and writes them into dist/, with the
   prices of that moment (each with the time it was checked), so a crawler's visit costs no worker request. A
   scheduled rebuild keeps those prices within 6 hours (.github/workflows/rebuild.yml). Old addresses (a unique's bare
   name) go out as dist/_redirects. The worker answers /search only (respond below).
   Data: the index (the game files, via tools/sync.py) cut into small files by tools/shards.py, with cut() below,
   and named in data/manifest.json; and the live price file (/data/market.json: the in-game Currency Exchange for
   currency, live trade site listings for everything else). A page reads the few small files it needs and never
   data/index.json whole: the free plan gives a request 10 ms of CPU, and parsing the whole index took 17.
   Slugs: the name in lowercase with hyphens. Unique variants add the base ("name-base"; the bare name
   redirects to the plain base). A name used by two kinds goes to the first of unique, gem, passive,
   keyword, currency, base, atlas; the others add their kind ("fulmination-passive"). Same name, same kind: "-2". */

import { KINDS, navHTML, INDEX, SHUT, pageName, pageHref } from '../assets/kinds.js';

const SITE = 'https://wraeclastindex.fyi';
const AGE = 3600;                 // pages and files: an hour (currency refreshes hourly, listings daily)
const MARKET_TTL = 300e3;         // the market copy in memory: 5 minutes, like /data/market.json
const LLMS_PART = 250 * 1024;     // one /llms/<list>.txt file at most (bytes): a model's fetch reads it whole
export const REBUILD_HOURS = 6;   // how often the files are built again (.github/workflows/rebuild.yml)

/* ---------- the terms ----------
   The licence, owner's decision of 28 Sep 2026: the index's own compilation and its prices are CC BY 4.0; the
   game's own text and art stay Grinding Gear Games'. Five lines, the same wherever a machine looks: robots.txt
   carries them word for word, llms.txt and every /llms/ file say them, and every page says them again in its
   own data (license, creditText, copyrightNotice, usageInfo pointing at llms.txt). A change to one is a change
   to all of them. Nobody is blocked and nothing is held back: bots and people get the same pages. */
export const LICENCE = 'https://creativecommons.org/licenses/by/4.0/';
const CONTACT = 'https://github.com/metaseonso/wraeclast-index/issues';
const GGG = {'@type': 'Organization', '@id': SITE + '/#ggg', name: 'Grinding Gear Games', url: 'https://www.grindinggear.com/'};
export const TERMS = [
  'Free to read, free to quote, free to build on.',
  'Licence: CC BY 4.0 (' + LICENCE + '), for the index\'s own compilation and its prices.',
  'Credit: name Wraeclast Index and link the page the data came from.',
  'Game text and item art: © Grinding Gear Games.',
  'One page per thing, one canonical URL per page: ' + SITE + '/item/<name>.',
].join('\n');

/* ---------- kinds ----------
   What one of a kind is called, the word for it, the list it sits in, the order it claims a name in, and what
   it is in schema.org's words — `is` the type a search engine reads the thing as, and `unless` the one test a
   kind needs where its rows are not all the same thing. A kind that can be held, dropped and traded is a
   Thing, the game's own item (the game names it as its gameItem); a kind that is a name with a meaning behind it
   is a DefinedTerm, and its list is the set it belongs to. The Atlas is both: a waystone is an item, a node on
   the atlas tree is not. Never a Product: a Product wants an Offer, an Offer wants a real-world currency, and
   nothing here is sold for one.
   Declared once, in assets/kinds.js (`crawl` on each kind the crawler publishes): this reads that table and
   keeps no list of its own, so a kind the site cards and the crawler's pages never disagree. */
const KIND = Object.fromEntries(KINDS.filter(d => d.crawl && typeof d.crawl === 'object')
  .map(d => [d.k, {one: d.one, ...d.crawl}]));
// what one entry is, off the table: its kind's type, or the other one where the kind's own test answers
const typeOf = e => { const u = KIND[e.k].unless; return u && e.it[u.at] === u.is ? u.then : KIND[e.k].is; };
// a kind whose rows can be terms: its list page stands for the set they are in
const isSet = k => KIND[k].is === 'DefinedTerm' || !!KIND[k].unless;
const LISTS = {
  gems: {k: 'g', h1: 'Gems', title: 'PoE2 Gems: every skill, spirit and support gem', app: '/explore#gems'},
  uniques: {k: 'u', h1: 'Uniques', title: 'PoE2 Uniques: mod lines, requirements and prices', app: '/explore#uniques'},
  passives: {k: 'p', h1: 'Passives', title: 'PoE2 Passives: keystones, notables and ascendancies', app: '/explore#tree'},
  bases: {k: 'b', h1: 'Bases', title: 'PoE2 Base Items: every weapon, armour, jewellery, jewel and flask base', app: '/#/craft'},
  atlas: {k: 'a', h1: 'Atlas', title: 'PoE2 Atlas: atlas passives, waystones, tablets and keys', app: '/#/atlas'},
  currency: {k: 'c', h1: 'Currency', title: 'PoE2 Currency Prices', app: '/#/currency'},
  keywords: {k: 'w', h1: 'Keywords', title: 'PoE2 Keywords', app: '/#/'},
  areas: {k: 'r', h1: 'Areas', title: 'PoE2 Areas: every campaign and Atlas area', app: '/#/?k=r'},
  quests: {k: 'j', h1: 'Quests', title: 'PoE2 Quests: rewards and permanent bonuses', app: '/#/?k=j'},
  runes: {k: 'o', h1: 'Runes', title: 'PoE2 Runes of Aldur: every rune and what its recipes make', app: '/#/runes'},
  achievements: {k: 'z', h1: 'Achievements', title: 'PoE2 Achievements: every achievement and league challenge', app: '/#/?k=z'},
  trials: {k: 'l', h1: 'Trial modifiers', title: 'PoE2 Trial Modifiers: Trial of Chaos and Trial of the Sekhemas', app: '/#/?k=l'},
  monsters: {k: 'm', h1: 'Rare monster modifiers', title: 'PoE2 Rare Monster Modifiers', app: '/#/?k=m'},
};
const ORDER = ['gems', 'uniques', 'passives', 'bases', 'atlas', 'currency', 'keywords', 'areas', 'quests', 'runes', 'achievements', 'trials',
  'monsters'];

/* What the worker still answers here: /search, a redirect it cannot know before the request. Everything else is a
   file (crawl() below, through tools/build.mjs). */
export function handles(path){
  return path === '/search';
}

export async function respond(request){
  if(request.method !== 'GET' && request.method !== 'HEAD')
    return new Response('Method not allowed', {status: 405, headers: {Allow: 'GET, HEAD'}});
  const url = new URL(request.url);
  // the app searches in the address after #, which servers never see
  const q = (url.searchParams.get('q') || '').trim();
  return new Response(null, {status: 302, headers: {Location: url.origin + (q ? '/#/?q=' + encodeURIComponent(q) : '/'), 'Cache-Control': 'no-store'}});
}

/* ---------- the files (tools/build.mjs) ----------
   Every crawler file, one at a time: {path, body} for a file (path as the site serves it: '/item/divine-orb',
   '/gems', '/sitemap.xml', '/md/item/divine-orb.md'), {from, to} for an old address. env.ASSETS reads the
   deploy's own files (dist/ at build time); loadMarket gives the price file of the moment. Each page is made by
   render(), the same dispatcher for every path, so there is one template per page and it lives here. */
export async function* crawl(env, origin, loadMarket){
  const m = await model(env, origin, loadMarket), S = src(env, origin);
  const one = async path => {
    const r = await render(new URL(origin + path), m, S);
    if(r.status !== 200 && !(path === '/404' && r.status === 404)) throw new Error(path + ': ' + r.status);
    return {path, body: await r.text()};
  };
  for(const l of ORDER) yield one('/' + l);
  const kinds = await everyList(m, S), listed = new Set();
  for(const k of Object.keys(kinds)) for(const e of kinds[k]){
    listed.add(e.slug);
    yield one('/item/' + e.slug);
    yield one('/md/item/' + e.slug + '.md');
  }
  // a slug the index holds that no list shows is an old bare name: it points at the thing's own page
  for(const s of m.base.taken.keys()){
    if(listed.has(s)) continue;
    const e = await entryAt(m, S, s);
    if(e && e.alias){
      yield {from: '/item/' + s, to: '/item/' + e.alias};
      yield {from: '/md/item/' + s + '.md', to: '/md/item/' + e.alias + '.md'};   // its Markdown copy goes the same way
    }
  }
  yield one('/404');
  yield one('/sitemap.xml');
  for(const name of ['pages', ...ORDER]) yield one('/sitemap-' + name + '.xml');
  yield one('/llms.txt');
  yield one('/llms-full.txt');
  for(const l of ORDER) for(const p of await llmsParts(m, S, l)) yield {path: p.path, body: p.body};
}
// the market the files were made with: when it was read and where from (tools/build.mjs prints it)
export const marketOf = () => MODEL && {updated: MODEL.updated, league: MODEL.league, items: MODEL.M ? Object.keys(MODEL.M).length : 0};

async function render(url, m, S){
  const path = url.pathname;
  if(path === '/sitemap.xml') return text(sitemapIndex(m, await everyList(m, S)), 'application/xml');
  const sm = path.match(/^\/sitemap-([a-z]+)\.xml$/);
  if(sm && (sm[1] === 'pages' || LISTS[sm[1]])) return text(sitemap(m, await everyList(m, S), sm[1]), 'application/xml');
  if(path === '/llms.txt') return text(llms(m, await allParts(m, S)), 'text/plain');
  if(path === '/llms-full.txt') return text(await llmsFull(m, S), 'text/plain');
  if(path.startsWith('/llms/')){
    for(const l of ORDER) for(const p of await llmsParts(m, S, l)) if(p.path === path) return text(p.body, 'text/plain');
    return text('', 'text/plain', 404);
  }
  if(path === '/404') return html(notFound(m), 404, 300);
  if(LISTS[path.slice(1)]) return html(listPage(m, path.slice(1), await listOf(m, S, LISTS[path.slice(1)].k)));
  const md = path.match(/^\/md\/item\/([^/]+)\.md$/);
  if(md){
    const e = await entryAt(m, S, md[1]);
    if(!e) return text('', 'text/markdown', 404);
    if(e.alias) return new Response(null, {status: 301, headers: {Location: url.origin + '/md/item/' + e.alias + '.md', 'Cache-Control': 'public, max-age=' + AGE}});
    return text(itemMarkdown(m, e), 'text/markdown');
  }
  const seg = path.slice('/item/'.length);
  let want = seg;
  try { want = decodeURIComponent(seg); } catch {}
  let e = await entryAt(m, S, want) || await entryAt(m, S, slugify(want));
  if(e && e.alias) e = await entryAt(m, S, e.alias);
  if(!e) return html(notFound(m), 404, 300);
  if(e.slug !== seg) return new Response(null, {status: 301, headers: {Location: url.origin + '/item/' + e.slug, 'Cache-Control': 'public, max-age=' + AGE}});
  e.ring = ring(e, await listOf(m, S, e.k));   // its neighbours on its own list (a currency's take in the market's)
  return html(itemPage(m, e));
}

/* ---------- data ----------
   tools/shards.py cuts the index with cut() below, so the slugs are decided here and nowhere else, and names the
   files in data/manifest.json ("seo"):
     base    every slug the index holds, by the kind holding it, the names the market must not repeat, the first
             gem of each name (the one a lineage gem's price lands on) and how many of each kind
     lists   per kind, one short row per entry, in list order: a list page, the sitemap and a neighbour link
     items   every entry whole, in buckets by its slug (bucketOf), with its other versions and the cards that
             mention it already worked out; an old bare name as a pointer
     words   per kind, llms-full.txt's words, with a mark where today's price goes, in files of about 256 KB
   Each file is fetched and read once per isolate, and only when a page asks for it. They are named by their
   content, so a file read once is right for the life of the deploy. The market is read again every 5 minutes,
   and the currency it prices claims its slugs then, against the index's own. */
let MAN = null, BASE = null;              // the manifest and the base: fixed for the life of a deploy
let MARKET = null, MARKET_AT = 0;         // the market file, refreshed every 5 minutes
let MODEL = null;
const FILES = new Map();                  // path -> a promise of the file, read

async function model(env, origin, loadMarket){
  const S = src(env, origin);
  if(!BASE) BASE = S.man().then(man => S.json(man.seo.base.file)).then(baseModel).catch(err => { BASE = null; throw err; });
  const base = await BASE;
  if(!MARKET || Date.now() - MARKET_AT > MARKET_TTL){
    MARKET_AT = Date.now();
    MARKET = marketJSON(env, origin, loadMarket);
  }
  const market = await MARKET;
  if(!MODEL || MODEL.base !== base || MODEL.market !== market) MODEL = withMarket(base, market);
  return MODEL;
}
// where the files come from: the deploy's own assets, each read once
function src(env, origin){
  const get = (path, as) => {
    if(!FILES.has(path)) FILES.set(path, assetGet(env, origin, '/' + path, as).catch(err => { FILES.delete(path); throw err; }));
    return FILES.get(path);
  };
  return {
    man: () => MAN || (MAN = assetGet(env, origin, '/data/manifest.json').catch(err => { MAN = null; throw err; })),
    json: path => get(path, 'json'),
    text: path => get(path, 'text'),
  };
}
async function assetGet(env, origin, path, as = 'json'){
  const r = await env.ASSETS.fetch(new Request(origin + path));
  if(!r.ok) throw new Error(path + ' ' + r.status);
  return as === 'text' ? r.text() : r.json();
}
async function marketJSON(env, origin, loadMarket){
  try {
    if(loadMarket){ const r = await loadMarket(); if(r.ok) return await r.json(); }
  } catch {}
  try { return await assetGet(env, origin, '/data/market.json'); } catch { return null; }
}

export function slugify(s){
  s = String(s);
  if(/[^ -~]/.test(s)) s = s.normalize('NFKD');
  return s.replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const byName = (a, b) => a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0;

/* The slug a name gets, given what is taken: kindAt(slug) is the kind holding a slug, or nothing. */
function claim(kindAt, slug, kind){
  const base = slug || KIND[kind].word;
  const other = kindAt(base);
  if(!other) return base;
  const stem = other === kind ? base : base + '-' + KIND[kind].word;
  if(!kindAt(stem)) return stem;
  let n = 2;
  while(kindAt(stem + '-' + n)) n++;
  return stem + '-' + n;
}

/* ---------- the cut (tools/shards.py, through tools/seoshards.mjs) ----------
   The whole index, once, at build time: every slug claimed, every entry's lists worked out. */
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
  const bySlug = new Map(), kindAt = s => (bySlug.get(s) || {}).k;
  // a unique the game names once with no base (Ab Aeterno) and again with a Runemastered or Runeforged base: the
  // plain one is a version too, so each lists the other under "Other versions", and the bare name is its own page
  const plain = new Map();
  for(const e of entries) if(e.k === 'u' && !e.base && variants.has(e.it.n) && !plain.has(e.it.n)) plain.set(e.it.n, e);
  for(const [n, list] of variants){   // variants first: "name-base" is always theirs
    const group = plain.has(n) ? [plain.get(n), ...list] : list;
    for(const e of list){
      e.slug = claim(kindAt, slugify(e.it.n + ' ' + e.base), 'u');
      e.group = group;
      bySlug.set(e.slug, e);
    }
    if(plain.has(n)) plain.get(n).group = group;
  }
  // then every bare name, the higher kind first; the shortest id wins among equals (the plain version of a skill)
  const claims = entries.filter(e => !e.slug).map(e => ({k: e.k, id: e.it.id, s: e.sort, e}));
  for(const [n, list] of variants) if(!plain.has(n)) claims.push({k: 'u', id: n, s: list[0].sort, list});
  claims.sort((a, b) => KIND[a.k].rank - KIND[b.k].rank || a.id.length - b.id.length);
  for(const c of claims){
    const s = claim(kindAt, c.s, c.k);
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
// what an entry's page never reads: the search words, the line marks and the like stay in the index. "ac", a
// kept anoint cost, is a price with no source and no age: it never leaves the index
const UNREAD = ['lx', 'q', 'kw', 'f', 'fg', 'fl', 'qt', 'lo', 'ac'];
// a list row: [slug, sort, name, sub line, id where it is not the name, what its group is worked out from]
function rowOf(e){
  const it = e.it, more = {};
  for(const f of ['asc', 'reg', 'at']) if(it[f] !== undefined && it[f] !== null && it[f] !== '') more[f] = it[f];
  return [e.slug, e.sort, it.n, it.s || '', it.id !== it.n ? it.id : 0, Object.keys(more).length ? more : 0];
}
// a card that mentions a keyword: its kind is its sub line there, so only what links it and prices it
const hitRow = e => [e.k, e.slug, e.sort, e.it.n, e.it.id !== e.it.n ? e.it.id : 0];
// which bucket an entry's page is in: FNV-1a over its slug
export function bucketOf(slug, n){
  let h = 0x811c9dc5;
  for(let i = 0; i < slug.length; i++){ h ^= slug.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % n;
}
export function cut(index, buckets){
  const base = indexModel(index);
  const kinds = {};
  for(const k of Object.keys(KIND)) kinds[k] = base.entries.filter(e => e.k === k).sort(byName);
  // every slug taken, one string per kind: a string is read far faster than 7,000 keys
  const taken = {};
  for(const [s, e] of base.bySlug) (taken[e.k] || (taken[e.k] = [])).push(s);
  for(const k of Object.keys(taken)) taken[k] = taken[k].join('\n');
  const items = Array.from({length: buckets}, () => ({}));
  for(const [s, e] of base.bySlug){
    const box = items[bucketOf(s, buckets)];
    if(e.alias){ box[s] = {alias: e.alias, k: 'u'}; continue; }
    const it = {};
    for(const [f, v] of Object.entries(e.it)) if(!UNREAD.includes(f)) it[f] = v;
    const rec = {k: e.k, slug: e.slug, sort: e.sort, it};
    if(e.base) rec.base = e.base;
    if(e.group && e.group.length > 1) rec.group = e.group.filter(x => x !== e).map(rowOf);
    if(e.k === 'w') rec.hits = mentions(kinds, e).map(hitRow);
    box[s] = rec;
  }
  const lists = {}, words = {};
  for(const k of Object.keys(KIND)){
    lists[k] = kinds[k].map(rowOf);
    words[k] = cutWords(kinds[k]);
  }
  return {
    base: {v: base.v, gen: base.gen, sprites: base.sprites, taken, named: [...base.named.keys()],
      gems: [...base.gemsByName].map(([s, e]) => s === e.slug ? s : s + ' ' + e.slug).join('\n'),
      counts: Object.fromEntries(Object.entries(kinds).map(([k, l]) => [k, l.length]))},
    lists, items, words,
  };
}
/* The cards whose own words name a keyword: the first 30 gems, uniques and passives, in list order. */
function mentions(kinds, e){
  const re = new RegExp('(^|[^a-z])' + e.it.n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)');
  const hits = [];
  for(const k of ['g', 'u', 'p']) for(const x of kinds[k]){
    if(hits.length >= 30) break;
    if(x.hay === undefined) x.hay = ((x.it.ls || []).join(' ') + ' ' + (x.it.t || '')).toLowerCase();
    if(re.test(x.hay)) hits.push(x);
  }
  return hits;
}
/* An entry's neighbours on its list: up to 12 of its own group, one per name, from its own place on. */
function ring(e, list){
  const g = groupOf(e), seen = new Set([e.it.n]);   // one link per name: same-name versions are listed above or on the list page
  const peers = list.filter(x => groupOf(x) === g && !seen.has(x.it.n) && seen.add(x.it.n));
  const out = [];
  if(peers.length){
    const i = peers.findIndex(x => x.sort > e.sort), start = i < 0 ? 0 : i;
    for(let j = 0; j < Math.min(12, peers.length); j++) out.push(peers[(start + j) % peers.length]);
  }
  return out.sort(byName);
}

/* ---------- the cut, read back ---------- */
function baseModel(b){
  const taken = new Map(), gems = new Map();
  for(const [k, list] of Object.entries(b.taken)) for(const s of list.split('\n')) taken.set(s, k);
  for(const line of b.gems ? b.gems.split('\n') : []){ const [s, slug] = line.split(' '); gems.set(s, slug || s); }
  return {v: b.v, gen: b.gen, sprites: b.sprites, taken, named: new Set(b.named), gems, counts: b.counts};
}
// a list row back into an entry
function entryOf(k, [slug, sort, n, s, id, more]){
  const it = {k, n, s, id: id === 0 ? n : id};
  if(more) Object.assign(it, more);
  return {k, slug, sort, it};
}
// one kind's entries, in list order: the index's, and for the currency the market's among them
async function listOf(m, S, k){
  if(!m.lists[k]) m.lists[k] = (async () => {
    const man = await S.man();
    const rows = man.seo.lists[k] ? await S.json(man.seo.lists[k].file) : [];
    const list = rows.map(r => entryOf(k, r));
    return k === 'c' ? list.concat(m.currency).sort(byName) : list;
  })().catch(err => { delete m.lists[k]; throw err; });
  return m.lists[k];
}
async function everyList(m, S){
  const out = {};
  for(const k of Object.keys(KIND)) out[k] = await listOf(m, S, k);
  return out;
}
// the entry a slug names: the market's currency (claimed on the day), else the index's own
async function entryAt(m, S, slug){
  if(!slug) return null;
  const c = m.currencyBySlug.get(slug);
  if(c) return c;
  if(!m.base.taken.has(slug)) return null;
  const files = (await S.man()).seo.items.files;
  const rec = (await S.json(files[bucketOf(slug, files.length)].file))[slug];
  if(!rec) return null;
  if(rec.alias) return rec;
  const e = {k: rec.k, slug: rec.slug, sort: rec.sort, it: rec.it};
  if(rec.base) e.base = rec.base;
  if(rec.group) e.group = [e, ...rec.group.map(r => entryOf(rec.k, r))];
  if(rec.hits) e.hits = rec.hits.map(([k, slug, sort, n, id]) => entryOf(k, [slug, sort, n, '', id, 0]));
  return e;
}

function withMarket(base, market){
  const M = (market && market.items) || null;
  const m = {base, market, M, rate: market && market.rates && market.rates.exalted,
    league: market && market.league, updated: market && market.updated,
    v: base.v, gen: base.gen, sprites: base.sprites, lineage: new Map(), currency: [], currencyByName: new Map(),
    currencyBySlug: new Map(), lists: {}};
  const kindAt = s => base.taken.get(s) || (m.currencyBySlug.has(s) ? 'c' : undefined);
  if(M){
    for(const [key, x] of Object.entries(M)){
      if(!key.startsWith('c:') || !x.n) continue;
      const sort = slugify(x.n);
      if(x.cat === 'Lineage Supports' && base.gems.has(sort)){ m.lineage.set(sort, key); continue; }   // one page per thing: the gem page carries the price
      if(base.named.has(x.n)) continue;               // the index has its card (a bulk item or an atlas thing)
      const it = {k: 'c', id: key.slice(2), n: x.n, s: x.cat || 'Currency', t: x.u || '', img: x.ic, dl: x.dl};
      const e = {it, k: 'c', sort};
      e.slug = claim(kindAt, e.sort, 'c');
      m.currencyBySlug.set(e.slug, e);
      m.currency.push(e);
      m.currencyByName.set(x.n, e);
    }
  }
  m.count = k => (base.counts[k] || 0) + (k === 'c' ? m.currency.length : 0);
  m.patch = (m.v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');
  m.day = (m.updated || '').slice(0, 10) || m.gen;
  m.now = Date.now();   // the moment the files are built: every age on a page is counted to it
  return m;
}

function priceOf(m, e){
  if(!m.M) return null;
  if(e.k === 'g'){ const key = m.base.gems.get(e.sort) === e.slug && m.lineage.get(e.sort); return key ? m.M[key] : null; }
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
/* A price's age on a page: "10 h ago", counted to the moment the files were built (m.now). The pages are built
   again every REBUILD_HOURS, so the age is at most that much short; the exact time stays in the <time> element. */
function ago(m, iso){
  const t = Date.parse(iso || '');
  if(!isFinite(t)) return '';
  const s = Math.max(0, (m.now - t) / 1000);
  if(s < 90) return 'just now';
  if(s < 3600) return Math.round(s / 60) + ' min ago';
  if(s < 48 * 3600) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
// the age as HTML: the words a player reads, the exact time in datetime and on hover. `bare` drops the " ago"
function ageHTML(m, iso, bare){
  const t = isoTime(iso || '');
  const words = ago(m, t);
  if(!words) return '';
  return '<time datetime="' + esc(t) + '" title="' + esc(when(t)) + '">' + esc(bare ? words.replace(/ ago$/, '') : words) + '</time>';
}

/* The same rules as the app (assets/app.js). */
const SECTION = {g: 'gems', u: 'uniques', p: 'tree'};
function appHref(m, it){
  if(SECTION[it.k]) return '/explore#' + SECTION[it.k] + '=' + encodeURIComponent(it.n);
  if(it.k === 'c' && m.M && m.M['c:' + it.id]) return '/#/currency?c=' + encodeURIComponent(it.id);   // the tab lists the catalogue
  if(it.k === 'b' && it.cr) return '/#/craft?base=' + encodeURIComponent(it.n).replace(/%20/g, '+');   // the plan in words (assets/craft.js)
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
function costWords([v, res]){   // "ManaPerMinute" and the like, in words
  const pct = /Percent/.test(res);
  const words = res.replace('Percent', '').replace(/([a-z])([A-Z])/g, '$1 $2').split(' ');
  return v + (pct ? '%' : '') + ' ' + words.map((w, i) => i ? w.toLowerCase() : w).join(' ');
}
const costText = c => costWords(c) + ' at gem level 20';
/* The lists a card draws under a label of its own, the way the card draws them (assets/kinds.js FIELDS): what
   a quest gives for good, an achievement's steps and the one line on how, the bands a rune is highlighted in,
   and what the Verisium Anvil makes of a base. */
const BLOCKS = [['kp', 'Permanent'], ['gl', 'Steps'], ['hw', ''], ['hb', 'Highlighted'], ['av', 'Verisium Anvil']];
function factsOf(it){
  const f = [];
  if(it.k === 'g'){
    if(it.ct) f.push(+(it.ct / 1000).toFixed(2) + ' s use time');
    if(it.cost) f.push(costText(it.cost));
    if(it.sp !== undefined) f.push(it.sp + ' Spirit');
  }
  if((it.k === 'u' || it.k === 'b') && it.pr) f.push(...it.pr);
  if(it.k === 'r'){
    if(it.wp) f.push('Waypoint');
    if(it.town) f.push('Town');
    if(it.rs) f.push(it.rs + '% to all Elemental Resistances');
    f.push(...(it.bio || []), ...(it.mc || []));
  }
  if(it.k === 'j'){
    if(it.gb) f.push('Given by ' + it.gb);
    if(it.rf) f.push('Reward from ' + it.rf);
  }
  if(it.k === 'o' && it.nr) f.push('In ' + it.nr + (it.nr === 1 ? ' recipe' : ' recipes'));
  if(it.k === 'z'){
    if(it.ho) f.push(it.ho);
    if(it.an) f.push(it.an);
    if(it.cn > 1) f.push(fmt(it.cn) + ' needed');
  }
  if(it.k === 'l' || it.k === 'm'){
    if(it.mark === 'danger') f.push('Dangerous for most builds');
    if(it.mark === 'safe') f.push('Safe to take');
    if(it.on) f.push(it.on);
    if(it.steps > 1) f.push(it.steps + ' steps');
    if(it.level > 1) f.push('From level ' + it.level);
    if(it.gen) f.push(it.gen);
    if(it.un) f.push('Subject to change');
  }
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
  if(e.k === 'r' || e.k === 'j') return parts[0];   // the act
  if(e.k === 'l') return it.s;                        // Minor affliction, Relic modifier...
  const c = e.sort.charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
function groupRank(e, g){
  if(e.k === 'p') return (e.it.asc ? 3 : /^Keystone/.test(g) ? 0 : /^Notable/.test(g) ? 1 : 2) + ' ' + g;
  if(e.k === 'c') return (g === 'Currency' ? '0 ' : '1 ') + g;
  if(e.k === 'r' || e.k === 'j') return (g === 'Interlude' ? '5 ' : g === 'Endgame' ? '9 ' : '0 ') + g;   // the game's order
  return g;
}
// a group's own place on its list page: the section's id, the jump chip and the breadcrumb all read this one
const anchor = g => slugify(g) || 'other';
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
  if(e.k === 'r') return 'Other areas in ' + g;
  if(e.k === 'j') return 'Other quests in ' + g;
  return 'Other ' + LISTS[KIND[e.k].list].h1.toLowerCase();   // keywords, runes, achievements
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
  if(e.k === 'r') return it.n + ': ' + parts[0] + ' area in Path of Exile 2' + (parts[1] ? ', ' + parts[1].toLowerCase() : '') + '.';
  if(e.k === 'j') return it.n + ': ' + parts[0] + (parts[1] ? ' ' + parts[1].toLowerCase() : '') + ' quest in Path of Exile 2.';
  if(e.k === 'l') return it.n + ': ' + parts[0] + ' in Path of Exile 2.';
  if(e.k === 'm') return it.n + ': rare monster modifier in Path of Exile 2.';
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
  if(e.k === 'r') return it.n + ' – PoE2 ' + parts[0] + ' Area';
  if(e.k === 'j') return it.n + ' – PoE2 ' + parts[0] + ' Quest';
  if(e.k === 'l') return it.n + ' – PoE2 ' + parts[0].replace(/\b\w/g, c => c.toUpperCase());
  return it.n + ' – PoE2 ' + KIND[e.k].one;   // Keyword, Rune, Achievement
}

/* ---------- the thing itself, as a search engine reads it ----------
   The same four answers the card gives a player, in the words a crawler understands: what it is (the kind's
   own type), what it looks like (the card's art, where the art is a picture of its own and not a cell of a
   sprite sheet), what it does (its own lines, and its facts one by one) and what it costs today (the live
   price row, in the game's own money). Nothing is worked out here that the card does not already show. */
const artOf = it => it.img && /^https?:/.test(it.img) ? it.img : null;

/* The price, off the same row the card draws, as two properties of its own: what it costs, and when that was
   checked. Not an Offer: nobody sells anything here, and an Offer's priceCurrency takes an ISO 4217 code, which
   a divine orb does not have. The money is the game's own and it is named in full (unitText). A price and a
   fact never share a property. */
const priceSource = (m, px) => px.src === 'cx'
  ? (m.league ? m.league + ': ' : '') + 'the in-game Currency Exchange'
  : (m.league ? m.league + ': ' : '') + 'live trade site listings' + (px.ls !== undefined ? ', ' + fmt(px.ls) + ' listed' : '');
const checkedAt = (m, px) => px.at || m.updated || '';
function pricePropsOf(m, px){
  if(!px || !(px.v > 0)) return [];
  const x = money(m, px.v);
  if(!x) return [];
  const at = checkedAt(m, px);
  const out = [{'@type': 'PropertyValue', name: 'Price', value: +x.v.replace(/,/g, ''), unitText: x.u === 'div' ? 'Divine Orb' : 'Exalted Orb',
    measurementTechnique: priceSource(m, px), description: 'Checked ' + when(at)}];
  if(at) out.push({'@type': 'PropertyValue', name: 'Price checked', value: isoTime(at)});
  return out;
}
// "2026-09-28T01:00+00:00", "2026-09-27T17:34:59.376Z" -> "2026-09-28T01:00:00Z"
const isoTime = s => { const t = Date.parse(s); return isFinite(t) ? new Date(t).toISOString().replace(/\.\d+Z$/, 'Z') : s; };
/* What the page is made from: the game files of its patch, and where its price came from. */
function basedOn(m, px){
  const out = [{'@type': 'CreativeWork', name: 'Path of Exile 2 game files' + (m.patch ? ', patch ' + m.patch : ''), author: {'@id': GGG['@id']}}];
  if(px && px.src === 'cx') out.push({'@type': 'CreativeWork', name: 'Path of Exile 2 in-game Currency Exchange', author: {'@id': GGG['@id']}});
  else if(px) out.push({'@type': 'WebSite', name: 'Path of Exile 2 trade site', url: 'https://www.pathofexile.com/trade2', publisher: {'@id': GGG['@id']}});
  return out;
}

/* The card's facts, one name and one value at a time, so an answer can quote a number without reading prose.
   A line the game already writes as "Name: value" splits where the game split it; everything else is named
   here the way the card labels it. */
function propsOf(e){
  const it = e.it, out = [];
  const add = (name, value) => { if(value !== undefined && value !== null && value !== '') out.push({'@type': 'PropertyValue', name, value: String(value)}); };
  if(e.k === 'g'){
    if(it.w) add('Requires at gem level 20', reqText(gemReq(it.w, 20)));
    if(it.ct) add('Use time', +(it.ct / 1000).toFixed(2) + ' s');
    if(it.cost) add('Cost at gem level 20', costWords(it.cost));
    if(it.sp !== undefined) add('Spirit', it.sp);
  }
  if((e.k === 'u' || e.k === 'b') && it.rq) add('Requires', reqText(it.rq));
  if(e.k === 'u' && it.cor) add('Corrupted', 'Yes');
  if(e.k === 'c' && it.dl) add('Drops from area level', it.dl);
  if(e.k === 'a' && it.x > 1) add('On the atlas tree', it.x);
  for(const line of ((e.k === 'u' || e.k === 'b') && it.pr) || []){
    const i = line.indexOf(': ');
    if(i > 0) add(line.slice(0, i), line.slice(i + 2));
  }
  return out.slice(0, 12);
}

function thingOf(m, e, px){
  const it = e.it, K = KIND[e.k], type = typeOf(e), url = SITE + '/item/' + e.slug;
  const words = (it.ls || []).length ? it.ls.map(sentence).join(' ') : sentence(it.t);
  const t = {'@type': type, name: it.n, url, description: clip(words || lead(m, e), 500)};
  const art = artOf(it);
  if(art) t.image = art;
  if(type === 'Thing'){
    if(it.s) t.disambiguatingDescription = it.s;
    const props = [...propsOf(e), ...pricePropsOf(m, px)];
    if(props.length) t.additionalProperty = props;
  } else t.inDefinedTermSet = {'@type': 'DefinedTermSet', '@id': SITE + '/' + K.list + '#terms',
    name: LISTS[K.list].h1, url: SITE + '/' + K.list};
  return t;
}

/* A trial or rare monster modifier's blocks as the card draws them (assets/kinds.js): the help text beside its
   lines, what it costs and pays, its tiers, its other steps, and what it does to you. */
function modBlocks(it){
  if(it.k !== 'l' && it.k !== 'm') return [];
  const est = new Set(it.est || []), out = [];
  if(it.t && it.ls && it.ls.length) out.push(['What it does', [it.t]]);
  if(it.risk) out.push(['Risk', [it.risk]]);
  if(it.reward) out.push(['Reward', [it.reward]]);
  if(it.tiers && it.tiers.length) out.push(['Tiers', it.tiers.map(t => [t.step || t.n, (t.ls || []).join(' / '),
    typeof t.rarity === 'number' ? t.rarity + '% more Rarity' : t.level ? 'Item level ' + t.level : ''].filter(Boolean).join(' · '))]);
  if(it.alt && it.alt.length) out.push(['Other steps', it.alt]);
  if(it.why) out.push(['Why', [it.why]]);
  if(it.dg && it.dg.length) out.push(['What it does to you', [it.dg.map(g => g + (est.has(g) ? ' (Estimate)' : '')).join(' · ')]]);
  return out;
}
function itemPage(m, e){
  const it = e.it, K = KIND[e.k], px = priceOf(m, e), path = '/item/' + e.slug, g = groupOf(e);
  const lines = it.ls || [], ni = it.ni || 0;
  const an = e.k === 'p' ? anoint(m, it) : null;
  // what the page carries, never the price itself: a search result keeps its snippet for weeks with no age on it,
  // so the number stays on the page, beside the time it was checked
  const week = px && ((px.sp || []).filter(v => v !== null && isFinite(v)).length > 1);
  const priceLine = px && px.v !== undefined ? 'Today\'s price' + (week ? ' and a 7-day chart' : '') + '.'
    : an && an.div !== null ? 'Anoint with ' + an.parts.map(p => p.n).join(' + ') + ', at today\'s prices.' : '';
  const said = lines.length ? lines.slice(0, 3).map(sentence).join(' ') : sentence(it.t);
  const desc = clip([lead(m, e), priceLine, said].filter(Boolean).join(' '));
  // a shared link (Discord, Reddit, X) is read when it is posted, so its preview carries the price, with the
  // time it was checked in the same breath
  let cost = px && px.v > 0 && moneyText(m, px.v);
  if(cost === '1 div') cost = m.rate ? fmt(Math.round(m.rate)) + ' ex' : '';   // the Divine Orb, in exalted
  if(cost === '1 ex') cost = '';                                                // the Exalted Orb is the unit
  const share = cost ? clip([it.n + ': ' + cost + '.', 'Checked ' + when(checkedAt(m, px)) + '.', lead(m, e), said].filter(Boolean).join(' ')) : '';
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
  for(const [f, label] of BLOCKS) if(it[f] && it[f].length)
    body += (label ? '<p class="card-facts">' + label + '</p>' : '') + '<ul class="card-ls">' + it[f].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  for(const [label, rows] of modBlocks(it))
    body += '<p class="card-facts">' + esc(label) + '</p><ul class="card-ls">' + rows.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  let price = '';
  if(px){
    if(px.h && px.h.length > 3){
      const vals = px.h.map(x => x[1]);
      price += chart(vals, 'Since ' + px.h[0][0] + ' · low ' + moneyText(m, Math.min(...vals)) + ', high ' + moneyText(m, Math.max(...vals)));
    } else if(px.sp) price += chart(px.sp, 'Last 7 days');
    const pf = [], lg = m.league ? m.league + ': ' : '';
    if(px.src === 'cx'){
      if(px.vol) pf.push(esc(fmt(Math.round(px.vol)) + ' div traded in 24 h'));
      pf.push(esc(lg + 'what it traded for on the in-game Currency Exchange, ') + ageHTML(m, checkedAt(m, px)));
    } else {
      if(px.ls !== undefined) pf.push(esc(fmt(px.ls) + ' listed'));
      pf.push(esc(lg + 'live trade site listings, checked ') + ageHTML(m, checkedAt(m, px)));
    }
    price += '<p class="card-facts">' + pf.join(' · ') + '</p>';
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
        (an.div !== null ? moneyHTML(m, an.div) : '') + '</b></div>' +
        (an.div !== null ? '<p class="card-facts">' + esc(anointFrom(m)) + ageHTML(m, anointAt(m, an)) + '</p>' : '') : '') +
      price +
      '<div class="card-ft">' + (px ? spark(px.sp, px.ch) : '') +
        (px && px.ls !== undefined && px.ls < 3 ? '<span class="use">few listed</span>' : '') +
        (bh ? '<a class="card-ext" href="' + esc(bh) + '" rel="noopener" title="Characters' + (m.league ? ' in ' + esc(m.league) : '') + ' that use this, on poe.ninja">Builds ↗</a>' : '') +
        '<span class="kind">' + K.one + '</span></div>' +
    '</article>' +
    '<div class="seo-go"><a class="btn gold" href="' + esc(appHref(m, it)) + '">Open in Wraeclast Index →</a></div>';

  // related: other versions, what mentions a keyword, the neighbours in its list (worked out by cut() and ring())
  let more = '';
  if(e.group && e.group.length > 1)
    more += section('Other versions', e.group.filter(x => x !== e), m);
  if(e.hits && e.hits.length) more += section('Mentioned in', e.hits, m, true);
  if(e.ring && e.ring.length) more += section(otherTitle(e, g), e.ring, m);
  if(more) more += agesHTML(m, [...(e.group || []).filter(x => x !== e), ...(e.hits || []), ...(e.ring || [])]);

  // where the thing sits: the site, its list, its own group on that list, and the thing. A group that goes
  // by the list's own name is the list, and a trail never says the same word twice.
  const crumbs = [['Wraeclast Index', '/'], [LISTS[K.list].h1, '/' + K.list]];
  if(g !== LISTS[K.list].h1) crumbs.push([g, '/' + K.list + '#' + anchor(g)]);
  crumbs.push([it.n, path]);
  return page(m, {
    title, desc, share, path, list: K.list, art: artOf(it), alt: it.n, md: '/md/item/' + e.slug + '.md',
    ld: ld(m, {path, title, desc, crumbs, thing: thingOf(m, e, px), day: px ? m.day : m.gen, art: artOf(it), px}),
    body: crumbsHTML(crumbs) + card + more + browse(),
  });
}

/* ---------- the age of every price ----------
   A price is never shown without the time it was checked. The card says its own; a list of neighbours, or a
   whole list page, says the span its prices were checked in, once under them. */
const anointFrom = m => (m.league ? m.league + ': ' : '') + 'oils on the in-game Currency Exchange, ';
const anointAt = (m, an) => isoTime(an.parts.map(p => p.x && p.x.at).filter(Boolean).map(isoTime).sort().pop() || m.updated || '');
const anointAge = (m, an) => anointFrom(m) + when(anointAt(m, an));
function agesHTML(m, list){
  let cx = '', lo = '', hi = '';
  for(const x of list){
    const px = priceOf(m, x);
    if(!px || px.v === undefined) continue;
    const t = isoTime(checkedAt(m, px));
    if(px.src === 'cx'){ if(t > cx) cx = t; continue; }
    if(!lo || t < lo) lo = t;
    if(!hi || t > hi) hi = t;
  }
  const out = [];
  if(cx) out.push('Currency Exchange prices: ' + ageHTML(m, cx));
  // the newest to the oldest: "checked 2 h to 20 h ago"
  if(lo) out.push((cx ? 'trade' : 'Trade') + ' site listings checked ' + (ago(m, lo) === ago(m, hi) ? ageHTML(m, lo) : ageHTML(m, hi, true) + ' to ' + ageHTML(m, lo)));
  if(!out.length) return '';
  return '<p class="card-facts ages">' + out.join(' · ') + '</p>';
}

function entryHTML(m, x, withKind){
  const px = priceOf(m, x), it = x.it, parts = (it.s || '').split(' · ');
  const sub = withKind ? KIND[x.k].one : x.k === 'g' ? parts[1] : x.k === 'u' ? parts[0] : x.k === 'b' || x.k === 'r' || x.k === 'j' ? parts[1] : '';
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
  const n = fmt(m.count(LISTS[name].k));
  return {
    gems: 'All ' + n + ' skill, spirit and support gems in Path of Exile 2' + patch + '. Requirements, use times, costs and tags from the game files.',
    uniques: 'All ' + n + ' uniques in Path of Exile 2' + patch + '. Official mod lines, requirements' + (m.league ? ' and ' + m.league + ' prices' : '') + '.',
    passives: 'All ' + n + ' keystones, notables and ascendancy passives in Path of Exile 2' + patch + ', with what they do.',
    bases: 'All ' + n + ' base items in Path of Exile 2' + patch + ': weapons, armour, jewellery, jewels, flasks and charms, with requirements, properties and implicits from the game files.',
    atlas: 'The Atlas in Path of Exile 2' + patch + ': ' + n + ' atlas passives, waystone tiers, tablets, keys and atlas items, from the game files.',
    currency: n + ' currency items in Path of Exile 2' + (m.league ? ' with ' + m.league + ' prices from the in-game Currency Exchange' : '') + '. Updated every hour.',
    keywords: 'All ' + n + ' Path of Exile 2 keywords, in the game\'s own words.',
    areas: 'All ' + n + ' areas in Path of Exile 2' + patch + ', the campaign and the Atlas: area levels, waypoints and what each area always carries, from the game files.',
    quests: 'All ' + n + ' quests in Path of Exile 2' + patch + ': where each one goes, what it gives, and what it gives for good, from the game files.',
    trials: 'All ' + n + ' Trial of Chaos and Trial of the Sekhemas modifiers in Path of Exile 2' + patch + ': what each does to you and what it pays, from the game files.',
    monsters: 'All ' + n + ' rare monster modifiers in Path of Exile 2' + patch + ': what each does, in the game\'s own words, and what it does to you.',
    runes: 'All ' + n + ' Runes of Aldur runes in Path of Exile 2' + patch + ': what their recipes make, and the area levels each one is highlighted at, from the game files.',
    achievements: 'All ' + n + ' achievements and league challenges in Path of Exile 2' + patch + ': their steps, and where each one is, from the game files.',
  }[name];
}
function listPage(m, name, all){
  const L = LISTS[name], path = '/' + name;
  const gs = groups(all);
  const desc = clip(intro(m, name));
  const title = L.title + ' | Wraeclast Index';
  const crumbs = [['Wraeclast Index', '/'], [L.h1, path]];
  const body = crumbsHTML(crumbs) +
    '<div class="pagehd"><h1>' + L.h1 + '</h1><p>' + esc(intro(m, name)) + '</p>' + agesHTML(m, all) + '</div>' +
    '<div class="seo-go"><a class="btn gold" href="' + L.app + '">Open in Wraeclast Index →</a></div>' +
    (gs.length > 1 ? '<nav class="jump" aria-label="Groups">' + gs.map(([g, l]) => '<a class="chip" href="#' + anchor(g) + '">' + esc(g) +
      '<span class="ct">' + l.length + '</span></a>').join('') + '</nav>' : '') +
    gs.map(([g, l]) => '<section id="' + anchor(g) + '"><h2>' + esc(g) + '<small>' + l.length + '</small></h2><ul class="ilist">' +
      l.map(x => entryHTML(m, x)).join('') + '</ul></section>').join('') + browse();
  /* the groups, in the order the page draws them: what a thing's breadcrumb points at, said once more where
     the list itself is the page. A list of terms is also the set its own rows say they belong to. */
  const list = {'@type': 'ItemList', '@id': SITE + path + '#groups', name: L.h1, numberOfItems: all.length,
    itemListElement: gs.map(([g, l], i) => ({'@type': 'ListItem', position: i + 1, name: g,
      item: SITE + path + '#' + anchor(g)}))};
  const more = [list];
  if(isSet(L.k)) more.push({'@type': 'DefinedTermSet', '@id': SITE + path + '#terms', name: L.h1, url: SITE + path, description: desc});
  const priced = all.map(x => priceOf(m, x)).filter(px => px && px.v !== undefined);
  return page(m, {title, desc, path, list: name, body,
    ld: ld(m, {path, title, desc, crumbs, day: L.k === 'c' || L.k === 'u' ? m.day : m.gen, nodes: more,
      sources: [...basedOn(m, null), ...['cx', 'trade'].filter(s => priced.some(px => (px.src === 'cx') === (s === 'cx')))
        .map(s => basedOn(m, {src: s})[1])]})});
}

function notFound(m){
  return page(m, {title: 'Not found | Wraeclast Index', desc: 'Nothing here.', path: '/404', noindex: true, body:
    '<div class="pagehd"><h1>Not found</h1><p>Nothing here. <a href="/">Wraeclast Index</a>, or a list below.</p></div>' + browse()});
}

/* ---------- the page shell ---------- */
const CSS = `.seo{max-width:960px; width:100%; margin:0 auto; padding:10px 16px 40px}
.crumbs{font-size:12px; color:var(--faint); margin:8px 0 14px}
.crumbs a{color:var(--muted); text-decoration:none}
.crumbs a:hover, .card-inv a:hover{color:var(--accent)}
.seo .card{cursor:default}
.seo .card:hover{translate:none; box-shadow:var(--shadow); border-color:var(--line)}
.card-id h1{margin:0; font:700 22px/1.25 var(--disp); letter-spacing:.03em; overflow-wrap:break-word}
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
.ilist a{color:var(--text); text-decoration:none; font-weight:500; overflow-wrap:break-word}
.ilist li.k-u a{color:var(--c-unique)} .ilist li.k-g a{color:var(--c-gem)} .ilist li.k-c a{color:var(--c-currency)} .ilist li.k-p a{color:var(--c-keystone)}
.ilist a:hover{color:var(--accent)}
.ilist .sub{min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:11.5px; color:var(--faint)}
.ilist .px{margin-left:auto; white-space:nowrap; font:600 12px var(--mono)}
.ilist .px small{margin-left:2px; font-size:10.5px; font-weight:500; color:var(--faint)}
.browse{display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-top:30px; font-size:12.5px; color:var(--faint)}`;

/* The site's top bar (index.html), without the app: the index in its groups, run by assets/topnav.js; the search
   button goes to the home page's search, and the menu button holds the index on a narrow screen. The lists
   themselves are linked from every page's foot (browse). */
const TOPBAR = `<header class="top">
  <div class="top-in">
    <a class="brand" href="/"><span class="mark" aria-hidden="true"><img class="mark-wisp on" src="/assets/brand/wisp-b.webp" alt="" decoding="async" fetchpriority="low"><img class="mark-logo" src="/assets/brand/logo-64.webp" alt="" width="51" height="64"></span>Wraeclast <em>Index</em></a>
    <div class="topmenu" id="topmenu">
${navHTML('/').split('\n').map(l => '      ' + l).join('\n')}
    </div>
    <span class="grow"></span>
    <a class="topbtn topfind" id="topfind" href="/#/" aria-label="Search the index"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M13 13l4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg></a>
    <button class="topbtn narrow" id="topburger" type="button" aria-label="Menu" aria-expanded="false" aria-controls="topmenu"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
  </div>
</header>
<script src="/assets/topnav.js" type="module"></script>`;

/* `art` is the card's own picture, where the thing has one of its own. A page that has one says so instead of
   the brand card: a share of one unique shows that unique, and a crawler is handed the same picture the
   structured data points at. A page with none keeps the wide brand card. */
function page(m, {title, desc, share, path, body, ld: data, noindex, art, alt, md}){
  const url = SITE + path;
  const img = art || SITE + '/assets/brand/social.png';
  const imgAlt = art ? alt || title : 'Wraeclast Index: Path of Exile 2, made easier for every kind of player.';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
${noindex ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`}
${md ? `<link rel="alternate" type="text/markdown" href="${md}">\n` : ''}<link rel="license" href="${LICENCE}">
<meta name="theme-color" content="#070807">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Wraeclast Index">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(share || desc)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(img)}">
${art ? '' : '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'}<meta property="og:image:alt" content="${esc(imgAlt)}">
<meta name="twitter:card" content="${art ? 'summary' : 'summary_large_image'}">
<link rel="preload" href="/assets/fonts/ibmplexsans-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/assets/fonts/cinzel-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css">
<link rel="stylesheet" href="/assets/cards.css">
<link rel="stylesheet" href="/assets/theme.css">
<link rel="icon" type="image/png" sizes="64x64" href="/assets/brand/favicon-64.png">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32.png">
<style>${CSS}</style>
${data ? '<script type="application/ld+json">' + JSON.stringify(data).replace(/</g, '\\u003c') + '</script>' : ''}
</head>
<body>
${TOPBAR}
<main class="seo">
${body}
</main>
<footer class="foot">
  <p>Game data: patch <b>${esc(m.patch || '')}</b>. Prices: the in-game Currency Exchange (currency) and live trade site listings (everything else, checked over the day).
  This product isn't affiliated with or endorsed by Grinding Gear Games in any way. <a href="/privacy">Privacy</a></p>
  <p>Compilation and prices: <a href="${LICENCE}" rel="license">CC BY 4.0</a>, credit Wraeclast Index. Game text and item art © Grinding Gear Games.</p>
</footer>
${noindex ? '' : '<script src="/assets/landing.js" defer></script>\n'}</body>
</html>
`;
}

/* Everything a crawler is told about a page, in one graph: the site and who publishes it, the game it is
   about, the page itself, the trail of crumbs down to it, the thing it is about, and whatever else the page
   itself declares. `creditText` and `usageInfo` are the terms said once more, per page, in the place a
   machine looks for them, and the credit names this page's own canonical URL so there is one thing to link. */
const NOTICE = 'Compilation and prices: Wraeclast Index, CC BY 4.0. Game text and item art © Grinding Gear Games.';
function ld(m, {path, title, desc, crumbs, thing, day, art, nodes = [], px, sources}){
  const url = SITE + path;
  const main = thing ? url + '#item' : nodes.length ? nodes[0]['@id'] : null;
  const self = {'@type': thing ? 'WebPage' : 'CollectionPage', '@id': url, url, name: title, description: desc,
    inLanguage: 'en', isPartOf: {'@id': SITE + '/#website'}, publisher: {'@id': SITE + '/#org'},
    breadcrumb: {'@id': url + '#breadcrumb'},
    about: thing ? [{'@id': url + '#item'}, {'@id': SITE + '/#game'}] : {'@id': SITE + '/#game'},
    mainEntity: main ? {'@id': main} : undefined,
    primaryImageOfPage: art ? {'@type': 'ImageObject', '@id': url + '#art', url: art, contentUrl: art} : undefined,
    dateModified: day || undefined,
    isBasedOn: sources || basedOn(m, px),
    isAccessibleForFree: true, license: LICENCE, creditText: 'Wraeclast Index, ' + url, copyrightNotice: NOTICE,
    usageInfo: SITE + '/llms.txt'};
  const graph = [
    {'@type': 'WebSite', '@id': SITE + '/#website', url: SITE + '/', name: 'Wraeclast Index',
      publisher: {'@id': SITE + '/#org'}, license: LICENCE, potentialAction: {'@type': 'SearchAction',
        target: {'@type': 'EntryPoint', urlTemplate: SITE + '/search?q={search_term_string}'},
        'query-input': 'required name=search_term_string'}},
    {'@type': 'Organization', '@id': SITE + '/#org', name: 'Wraeclast Index', url: SITE + '/',
      logo: {'@type': 'ImageObject', url: SITE + '/assets/brand/logo-320.webp', width: 253, height: 320}},
    GGG,
    {'@type': 'VideoGame', '@id': SITE + '/#game', name: 'Path of Exile 2', url: 'https://pathofexile2.com/',
      sameAs: ['https://pathofexile2.com/', 'https://en.wikipedia.org/wiki/Path_of_Exile_2'], publisher: {'@id': GGG['@id']},
      gameItem: thing && thing['@type'] === 'Thing' ? {'@id': url + '#item'} : undefined},   // an item of the game: this page's thing
    self,
    {'@type': 'BreadcrumbList', '@id': url + '#breadcrumb', itemListElement: crumbs.map((c, i) => ({'@type': 'ListItem', position: i + 1, name: c[0], item: SITE + c[1]}))},
  ];
  if(thing) graph.push({'@id': url + '#item', ...thing});
  return {'@context': 'https://schema.org', '@graph': [...graph, ...nodes]};
}

function html(body, status = 200, age = AGE){
  return new Response(body, {status, headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=' + age, 'X-Content-Type-Options': 'nosniff'}});
}
function text(body, type, status = 200){
  return new Response(body, {status, headers: {'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'public, max-age=' + AGE, 'X-Content-Type-Options': 'nosniff'}});
}

/* ---------- sitemaps ----------
   /sitemap.xml is the index; under it one file for the site's own pages and lists, and one per list. A page's
   lastmod is the day its own price was checked, or the index's day where it has none. */
const SITEMAPS = ['pages', ...ORDER];
const dayOf = s => { const t = isoTime(s || ''); return /^\d{4}-\d\d-\d\d/.test(t) ? t.slice(0, 10) : ''; };
function urlsOf(m, kinds, name){
  if(name === 'pages'){
    const urls = [['/', m.day], ['/explore', m.gen]];
    for(const l of ORDER) urls.push(['/' + l, l === 'currency' || l === 'uniques' ? m.day : m.gen]);
    return urls;
  }
  return kinds[LISTS[name].k].map(e => {
    const px = priceOf(m, e);
    return ['/item/' + e.slug, px && px.v !== undefined ? dayOf(checkedAt(m, px)) || m.day : m.gen];
  });
}
const newest = urls => urls.reduce((a, [, d]) => d && d > a ? d : a, '');
function sitemapIndex(m, kinds){
  return '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    SITEMAPS.map(n => { const d = newest(urlsOf(m, kinds, n));
      return '<sitemap><loc>' + SITE + '/sitemap-' + n + '.xml</loc>' + (d ? '<lastmod>' + d + '</lastmod>' : '') + '</sitemap>'; }).join('\n') +
    '\n</sitemapindex>\n';
}
function sitemap(m, kinds, name){
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urlsOf(m, kinds, name).map(([p, d]) => '<url><loc>' + SITE + p + '</loc>' + (d ? '<lastmod>' + d + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
}

/* ---------- llms.txt and the plain-text files ---------- */
const MONEY = 'Prices are in divine orbs (div), or exalted orbs (ex) below one divine.';
function llms(m, parts){
  const n = k => fmt(m.count(k));
  const files = ORDER.flatMap(l => parts[l].map(p => '- [' + p.name + '](' + SITE + p.path + '): ' + fmt(p.count) + ' entries, ' +
    (p.bytes / 1024).toFixed(0) + ' KB'));
  return `# Wraeclast Index

> Path of Exile 2, indexed: every gem, unique, passive, base item, atlas thing, currency and keyword from the official game files, with real prices from the in-game Currency Exchange and live trade site listings. Free to read, quote and build on.

Game data: patch ${m.patch} (${m.gen}). Prices: ${m.league || 'current'} league, price file of ${when(isoTime(m.updated || ''))}. ${MONEY} This product isn't affiliated with or endorsed by Grinding Gear Games in any way.

## Terms

${TERMS}

## Pages

- ${SITE}/item/<name>, for example ${SITE}/item/divine-orb: one thing per page. What it is, its requirements, the official lines, its price with the time it was checked and a 7-day chart, its neighbours on its list, and a link into the app. The same answers as structured data (schema.org JSON-LD) in the page.
- ${SITE}/md/item/<name>.md: the same thing in Markdown, with its sources and checked times. Each page links its copy (rel="alternate", type="text/markdown").
- The lists below: every thing of a kind on one page, in groups, with prices.
- ${SITE}/search?q=<words>: the app's search, opened on those words.

## How fresh

- Game data: once per game patch, from the game files.
- Currency prices: every hour, from the in-game Currency Exchange.
- Trade prices (uniques, base items and the like): live trade site listings, every priced thing checked at least once a day.
- These pages and files: built again every ${REBUILD_HOURS} hours with the prices of that moment. Every price carries the time it was checked. /data/market.json is live.

## Lists

- [Gems](${SITE}/gems): ${n('g')} skill, spirit and support gems, with requirements, use times and tags
- [Uniques](${SITE}/uniques): ${n('u')} uniques, with official mod lines, requirements and prices
- [Passives](${SITE}/passives): ${n('p')} keystones, notables and ascendancy passives, with anoint recipes and costs
- [Bases](${SITE}/bases): ${n('b')} base items (weapons, armour, jewellery, jewels, flasks), with requirements, properties and implicits
- [Atlas](${SITE}/atlas): ${n('a')} atlas passives, waystone tiers, tablets, keys and atlas items
- [Currency](${SITE}/currency): ${n('c')} currency items, essences, runes, omens and more, with prices
- [Keywords](${SITE}/keywords): ${n('w')} game keywords, in the game's own words

## Plain text

- [Everything in plain text](${SITE}/llms-full.txt): the index of the files below
${files.join('\n')}

## Data

- [Item index](${SITE}/data/index.json): every gem, unique, passive, base item, atlas thing and keyword, as JSON. Changes with the game patch.
- [Manifest](${SITE}/data/manifest.json): the index cut into small files, every file named with its size
- [Prices now](${SITE}/data/market.json?part=now): every price, its 7-day line and when it was checked, as JSON. Live.
- [Price history](${SITE}/data/market.json?part=past): the day-by-day history of this league and the past leagues' lines. Live.
- [Prices, whole](${SITE}/data/market.json): both of the above in one file
- [Sitemap](${SITE}/sitemap.xml): every page, with the day it last changed

## App

${INDEX.flatMap(s => s.pages.filter(p => !(p.route in SHUT)).map(p => '- [' + (s.name && s.pages.length > 1 ? s.name + ': ' : '') +
  pageName(p) + '](' + SITE + pageHref(p, '/').replace(/^\/(?=#)/, '/') + '): ' + p.about)).join('\n')}

## Contact

- The Suggest button, on every page of the app
- GitHub issues: ${CONTACT}
`;
}

/* An entry in plain text: the words that are fixed for the patch (cut() writes these into the "words" files),
   then today's anoint cost and price, each on its own line with where and when it was checked. */
function itemWords(e){
  const it = e.it, out = ['### ' + it.n, (it.s || KIND[e.k].one) + ' · ' + SITE + '/item/' + e.slug];
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
  for(const [f, label] of BLOCKS) if(it[f] && it[f].length) out.push((label ? label + ': ' : '') + it[f].join(' / '));
  for(const [label, rows] of modBlocks(it)) out.push(label + ': ' + rows.join(' / '));
  if(it.tags) out.push('Tags: ' + it.tags.join(', '));
  return out.join('\n');
}
function itemToday(m, e){
  const it = e.it, px = priceOf(m, e), out = [];
  const an = e.k === 'p' ? anoint(m, it) : null;
  if(an) out.push('Anoint with ' + an.parts.map(p => p.n).join(' + ') + (an.div !== null ? ': ' + moneyText(m, an.div) + ' (' + anointAge(m, an) + ')' : ''));
  if(px && px.v !== undefined) out.push('Price: ' + moneyText(m, px.v) + (changeText(px.ch) ? ', ' + changeText(px.ch) : '') +
    ' (' + priceSource(m, px) + ', checked ' + when(isoTime(checkedAt(m, px))) + ')');
  return out.length ? '\n' + out.join('\n') : '';
}
/* An entry in Markdown (/md/item/<slug>.md): the page's own facts, then its price and where and when it was
   checked, then its sources and the licence. The neighbours stay on the page. */
function itemMarkdown(m, e){
  const it = e.it, px = priceOf(m, e), url = SITE + '/item/' + e.slug;
  const words = itemWords(e).split('\n');
  const out = ['# ' + it.n, '', (it.s || KIND[e.k].one) + ' · Path of Exile 2', '', 'Page: ' + url, '', '## The card', ''];
  for(const line of words.slice(2)) out.push('- ' + line);
  const an = e.k === 'p' ? anoint(m, it) : null;
  if(an){
    out.push('', '## Anoint', '', '- ' + an.parts.map(p => p.n).join(' + ') + (an.div !== null ? ': ' + moneyText(m, an.div) : ''));
    if(an.div !== null) out.push('- ' + anointAge(m, an));
  }
  if(px && px.v !== undefined){
    out.push('', '## Price', '', '- ' + moneyText(m, px.v) + (changeText(px.ch) ? ', ' + changeText(px.ch) : ''),
      '- ' + priceSource(m, px), '- Checked ' + when(isoTime(checkedAt(m, px))));
  }
  out.push('', '## Sources', '', '- Game data: the Path of Exile 2 game files' + (m.patch ? ', patch ' + m.patch : ''));
  if(px && px.v !== undefined) out.push('- Price: ' + (px.src === 'cx' ? 'the in-game Currency Exchange' : 'the Path of Exile 2 trade site, https://www.pathofexile.com/trade2'));
  if(an && an.div !== null) out.push('- Anoint cost: the in-game Currency Exchange');
  out.push('- Licence: CC BY 4.0, ' + LICENCE + '. Credit Wraeclast Index and link ' + url + '. Game text and item art © Grinding Gear Games.', '');
  return out.join('\n');
}
/* The words files: one kind's entries in list order, each its fixed words, then (after \u0002) what today's lines
   are worked out from: slug, sort, id, name and the anoint's oils (\u0003 between them, \u0004 between the
   oils); \u0001 between entries. Split, never parsed as JSON: llms-full.txt is every entry at once. */
const CUT = ['\u0001', '\u0002', '\u0003', '\u0004'];
function cutWords(list){
  return list.map(e => {
    const it = e.it, words = itemWords(e);
    for(const x of [words, e.slug, it.id, it.n, ...(it.rec || [])])
      if(CUT.some(c => String(x).includes(c))) throw new Error(e.slug + ': a control character in its words');
    const spec = [e.slug, e.sort, it.id !== it.n ? it.id : '', it.n, (it.rec || []).join('\u0004')];
    return words + '\u0002' + spec.join('\u0003');
  }).join('\u0001');
}
function readWords(k, text){
  if(!text) return [];
  return text.split('\u0001').map(b => {
    const [words, spec] = b.split('\u0002');
    const [slug, sort, id, n, rec] = spec.split('\u0003');
    const it = {k, n, id: id || n};
    if(rec) it.rec = rec.split('\u0004');
    return {k, slug, sort, it, words};
  });
}
/* One list in plain text, in files under LLMS_PART bytes each: /llms/<list>.txt, or /llms/<list>-1.txt, -2, ... when
   it takes more than one. Worked out once per model. */
const BYTES = s => new TextEncoder().encode(s).length;
async function llmsParts(m, S, l){
  if(!m.parts) m.parts = {};
  if(m.parts[l]) return m.parts[l];
  const k = LISTS[l].k, man = await S.man();
  let list = [];
  for(const f of man.seo.words[k] || []) list = list.concat(readWords(k, await S.text(f.file)));
  if(k === 'c') list = list.concat(m.currency.map(e => ({...e, words: itemWords(e)}))).sort(byName);
  const head = (i, n) => '# Wraeclast Index: ' + LISTS[l].h1 + (n > 1 ? ' (' + i + ' of ' + n + ')' : '') + '\n\n' +
    '> Path of Exile 2 ' + LISTS[l].h1.toLowerCase() + ' from the game files (patch ' + m.patch + '). The second line of every entry is its canonical URL. ' +
    'Every price line carries where and when it was checked. ' + MONEY + '\n\n## Terms\n\n' + TERMS + '\n\n## ' + LISTS[l].h1 + '\n\n';
  const room = LLMS_PART - BYTES(head(99, 99)) - 16;
  const groups = [[]];
  let size = 0;
  for(const e of list){
    const t = e.words + itemToday(m, e), b = BYTES(t) + 2;
    if(size + b > room && groups[groups.length - 1].length){ groups.push([]); size = 0; }
    groups[groups.length - 1].push(t);
    size += b;
  }
  const n = groups.length;
  m.parts[l] = groups.map((g, i) => {
    const body = head(i + 1, n) + g.join('\n\n') + '\n';
    return {path: '/llms/' + l + (n > 1 ? '-' + (i + 1) : '') + '.txt', name: LISTS[l].h1 + (n > 1 ? ', ' + (i + 1) + ' of ' + n : ''),
      count: g.length, bytes: BYTES(body), body};
  });
  return m.parts[l];
}
async function allParts(m, S){
  const out = {};
  for(const l of ORDER) out[l] = await llmsParts(m, S, l);
  return out;
}
async function llmsFull(m, S){
  const parts = await allParts(m, S);
  return `# Wraeclast Index: everything in plain text

> Every Path of Exile 2 gem, unique, passive, base item, atlas thing, currency and keyword, from the game files (patch ${m.patch}), in one file per list, each under ${Math.round(LLMS_PART / 1024)} KB. Prices: ${m.league || 'current'} league, the in-game Currency Exchange and live trade site listings; every price line carries where and when it was checked. ${MONEY}

## Terms

${TERMS}

## Files

${ORDER.flatMap(l => parts[l].map(p => '- [' + p.name + '](' + SITE + p.path + '): ' + fmt(p.count) + ' entries')).join('\n')}
`;
}
