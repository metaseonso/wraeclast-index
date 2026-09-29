/* The index as the site's own crawler pages read it (worker/seo.js), from the files data/manifest.json names:
     seo.base    every slug the index holds, by kind; the names the market must not repeat; the first gem of a name
     seo.lists   per kind, one short row per card: [slug, sort, name, sub line, id, more]
     seo.items   every card whole, in buckets by its slug (bucketOf)
     seo.words   per kind, every card's fixed words, the same text as /llms/<list>.txt
   and the live price part (data/market.json?part=live), whose currencies the index does not card get a slug of
   their own the way the site gives them one. The slug rules are worker/seo.js's (slugify, claim, bucketOf); the
   package's tests hold them to that file. */

/* The kinds with a page at /item/<slug>, in the order a name is claimed (worker/seo.js, assets/kinds.js crawl). */
export const KINDS = {
  u: {one: 'Unique', word: 'unique', rank: 0},
  g: {one: 'Gem', word: 'gem', rank: 1},
  p: {one: 'Passive', word: 'passive', rank: 2},
  w: {one: 'Keyword', word: 'keyword', rank: 3},
  c: {one: 'Currency', word: 'currency', rank: 4},
  b: {one: 'Base', word: 'base', rank: 5},
  a: {one: 'Atlas', word: 'atlas', rank: 6},
  r: {one: 'Area', word: 'area', rank: 7},
  j: {one: 'Quest', word: 'quest', rank: 8},
};
export const ORDER = Object.keys(KINDS).sort((a, b) => KINDS[a].rank - KINDS[b].rank);
const BY_WORD = new Map(Object.entries(KINDS).flatMap(([k, d]) => [[d.word, k], [d.word + 's', k], [d.one.toLowerCase(), k]]));
BY_WORD.set('currencies', 'c');
/* "unique", "Uniques", "u" -> "u"; undefined when none is given; an Error for a word that is no kind */
export function kindOf(word){
  if(word === undefined || word === null || word === '') return undefined;
  const w = String(word).trim().toLowerCase();
  if(KINDS[w]) return w;
  if(BY_WORD.has(w)) return BY_WORD.get(w);
  throw new Error('No kind "' + word + '". Kinds: ' + ORDER.map(k => KINDS[k].word).join(', ') + '.');
}

export function slugify(s){
  s = String(s);
  if(/[^ -~]/.test(s)) s = s.normalize('NFKD');
  return s.replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function bucketOf(slug, n){
  let h = 0x811c9dc5;
  for(let i = 0; i < slug.length; i++){ h ^= slug.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h % n;
}
function claim(kindAt, slug, kind){
  const base = slug || KINDS[kind].word;
  const other = kindAt(base);
  if(!other) return base;
  const stem = other === kind ? base : base + '-' + KINDS[kind].word;
  if(!kindAt(stem)) return stem;
  let n = 2;
  while(kindAt(stem + '-' + n)) n++;
  return stem + '-' + n;
}
// a list row back into an entry
function entryOf(k, [slug, sort, n, s, id, more]){
  const it = {k, n, s, id: id === 0 ? n : id};
  if(more) Object.assign(it, more);
  return {k, slug, sort, it};
}
// the market files' own name for a currency (tools/marketlib.py did)
export const didOf = name => String(name).toLowerCase().replace(/'/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export class Index {
  constructor(source){
    this.src = source;
    this.man = null;
    this.manId = null;
    this.cache = new Map();   // built models, per manifest id and price file
  }

  async manifest(){
    const man = await this.src.json('data/manifest.json');
    if(man.id !== this.manId){
      if(this.manId !== null) this.cache.clear();
      this.manId = man.id;
      this.src.prune(namedIn(man)).catch(() => {});
    }
    this.man = man;
    return man;
  }
  // one built thing per manifest: made once, dropped when the manifest changes
  async once(key, make){
    const man = await this.manifest(), k = man.id + ':' + key;
    if(!this.cache.has(k)) this.cache.set(k, make(man).catch(err => { this.cache.delete(k); throw err; }));
    return this.cache.get(k);
  }

  base(){
    return this.once('base', async man => {
      const b = await this.src.json(man.seo.base.file);
      const taken = new Map(), gems = new Map();
      for(const [k, list] of Object.entries(b.taken)) for(const s of list.split('\n')) if(s) taken.set(s, k);
      for(const line of b.gems ? b.gems.split('\n') : []){ const [s, slug] = line.split(' '); gems.set(s, slug || s); }
      return {v: b.v, gen: b.gen, patch: man.patch || String(b.v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2'),
        taken, named: new Set(b.named), gems, counts: b.counts || {}};
    });
  }

  /* The prices of the moment, with the currencies the index does not card: the site's withMarket. */
  async market(){
    const [base, text] = await Promise.all([this.base(), this.src.text('data/market.json?part=live')]);
    if(this.mk && this.mk.text === text && this.mk.base === base) return this.mk.m;
    const raw = JSON.parse(text), M = {};
    const t0 = Date.parse(raw.t0 || ''), cxAt = raw.times && raw.times.currency;
    for(const [key, x] of Object.entries(raw.items || {})){
      const o = {...x};
      if(o.a === 0){ o.at = cxAt; o.src = 'cx'; }
      else if(o.a > 0 && isFinite(t0)){ o.at = new Date(t0 + o.a * 1000).toISOString(); o.src = 'trade'; }
      delete o.a;
      if(!o.src) o.src = key.startsWith('c:') ? 'cx' : 'trade';
      M[key] = o;
    }
    const m = {M, league: raw.league || null, updated: raw.updated || null, late: !!raw.late,
      rate: raw.rates && raw.rates.exalted || null, leagues: (raw.leagues && raw.leagues.leagues) || [],
      lineage: new Map(), currency: [], currencyBySlug: new Map(), currencyByName: new Map()};
    const kindAt = s => base.taken.get(s) || (m.currencyBySlug.has(s) ? 'c' : undefined);
    for(const key of Object.keys(M)){
      if(!key.startsWith('c:')) continue;
      const n = M[key].n || key.slice(2), sort = slugify(n);
      if(base.gems.has(sort)){ m.lineage.set(sort, key); continue; }   // a lineage support: the gem's page carries it
      if(base.named.has(n)) continue;                                  // the index has its card
      const e = {k: 'c', sort, it: {k: 'c', id: key.slice(2), n, s: 'Currency'}, market: true};
      e.slug = claim(kindAt, sort, 'c');
      m.currencyBySlug.set(e.slug, e);
      m.currency.push(e);
      m.currencyByName.set(n, e);
    }
    this.mk = {text, base, m};
    return m;
  }

  /* one kind's cards in list order, the market's currencies among the currency */
  async list(k){
    const rows = await this.once('list:' + k, async man => {
      const f = man.seo.lists && man.seo.lists[k];
      return f ? (await this.src.json(f.file)).map(r => entryOf(k, r)) : [];
    });
    if(k !== 'c') return rows;
    const m = await this.market().catch(() => null);
    return m ? rows.concat(m.currency) : rows;
  }

  /* the card a slug names, with its other versions: null when there is none */
  async entry(slug, hops = 0){
    if(!slug) return null;
    const m = await this.market().catch(() => null);
    if(m && m.currencyBySlug.has(slug)) return m.currencyBySlug.get(slug);
    const base = await this.base();
    if(!base.taken.has(slug)) return null;
    const files = this.man.seo.items.files;
    const rec = (await this.src.json(files[bucketOf(slug, files.length)].file))[slug];
    if(!rec) return null;
    if(rec.alias) return hops ? null : this.entry(rec.alias, 1);
    const e = {k: rec.k, slug: rec.slug, sort: rec.sort, it: rec.it};
    if(rec.base) e.base = rec.base;
    if(rec.group) e.group = rec.group.map(r => entryOf(rec.k, r));
    return e;
  }

  /* one kind's words files: every card's fixed text, for a search through the lines */
  words(k){
    return this.once('words:' + k, async man => {
      const out = [];
      for(const f of (man.seo.words && man.seo.words[k]) || []){
        const text = await this.src.text(f.file);
        if(!text) continue;
        for(const b of text.split('\u0001')){
          const [words, spec = ''] = b.split('\u0002');
          const [slug, sort, id, n] = spec.split('\u0003');
          out.push({k, slug, sort, it: {k, n, id: id || n}, words});
        }
      }
      return out;
    });
  }

  /* the price row a card is looked up by (assets/app.js priceOf, with the kinds' px: a lineage gem and an atlas
     thing are priced as currency) */
  async priceOf(e){
    const m = await this.market();
    const it = e.it, M = m.M;
    let px = M[e.k + ':' + it.id] || M[e.k + ':' + it.n] || null;
    if(!px && (e.k === 'a' || (e.k === 'g' && it.li))) px = M['c:' + it.n] || null;
    return px ? {m, px} : {m, px: null};
  }

  patchnotes(){ return this.src.json('data/patchnotes.json'); }
  patches(){ return this.src.json('data/patches.json'); }
  changelog(){ return this.src.json('data/changelog.json'); }
  marketIndex(){ return this.src.json('data/market/index.json'); }
  marketFile(name){ return this.src.json('data/market/' + name); }
}

// every file the manifest names
export function namedIn(man){
  const out = new Set();
  (function walk(v){
    if(!v || typeof v !== 'object') return;
    if(typeof v.file === 'string') out.add(v.file);
    for(const x of Object.values(v)) walk(x);
  })(man);
  return out;
}
