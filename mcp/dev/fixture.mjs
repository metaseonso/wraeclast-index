/* Builds mcp/test/fixture/: a small copy of the site's files, cut from the repo's own data/ and one snapshot of the
   live price file and market files, so the tests never ask the live site.

     node mcp/dev/fixture.mjs <snapshot dir>

   The snapshot dir holds live.json (data/market.json?part=live), mindex.json (data/market/index.json) and the
   cards-N.json bundles the chosen currencies are in. The cut keeps the site's own shapes: a manifest naming files by
   their content, the seo base, lists, item buckets (bucketOf over 2 buckets) and words files. */
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bucketOf } from '../src/wi.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT = join(HERE, '..', 'test', 'fixture');
const SNAP = process.argv[2];
if(!SNAP) throw new Error('usage: node mcp/dev/fixture.mjs <snapshot dir>');

const SLUGS = ['deaths-harp-dualstring-bow', 'deaths-harp-runeforged-dualstring-bow', 'deaths-harp', 'headhunter',
  'fireball', 'ahns-citadel', 'freeze', 'freeze-keyword', 'abasement', 'adherent-cuffs', 'waystone-tier-15',
  'albino-rhoa-feather', 'clearfell-encampment', 'the-lost-lute'];
const PRICES = ['c:Divine Orb', 'c:Exalted Orb', 'c:Chaos Orb', 'c:Liquid Paranoia', 'c:Liquid Despair',
  'c:Concentrated Liquid Fear', "c:Ahn's Citadel", 'u:Headhunter', "u:Death's Harp | Dualstring Bow",
  "u:Death's Harp | Runeforged Dualstring Bow", 'b:Adherent Cuffs'];
const DIDS = ['divine-orb', 'chaos-orb', 'ahns-citadel', 'liquid-paranoia'];
const KEYS = ['g:Fireball', 'u:Headhunter', 'w:Freeze', 'g:Freeze', "u:Death's Harp"];

const read = p => JSON.parse(readFileSync(p, 'utf8'));
const man = read(join(REPO, 'data', 'manifest.json'));
const repo = f => read(join(REPO, f));
if(existsSync(OUT)) rmSync(OUT, {recursive: true});
const files = {};
function put(dir, name, ext, body){
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  const hash = createHash('sha256').update(text).digest('hex').slice(0, 10);
  const file = 'data/' + dir + '/' + name + '.' + hash + '.' + ext;
  write(file, text);
  return {file, bytes: Buffer.byteLength(text)};
}
function write(file, body){
  const p = join(OUT, file);
  mkdirSync(dirname(p), {recursive: true});
  writeFileSync(p, typeof body === 'string' ? body : JSON.stringify(body));
}

// every chosen card's record, its kind, and its alias
const recs = {};
for(const f of man.seo.items.files){
  const b = repo(f.file);
  for(const s of SLUGS) if(b[s]) recs[s] = b[s];
}
for(const s of SLUGS) if(!recs[s]) throw new Error('not in the index: ' + s);
const kindOf = s => recs[s].k;

const base = repo(man.seo.base.file);
const taken = {};
for(const s of SLUGS) (taken[kindOf(s)] ||= []).push(s);
const gems = base.gems.split('\n').filter(l => SLUGS.includes(l.split(' ')[0]));
const fbase = {v: base.v, gen: base.gen, sprites: base.sprites, taken: Object.fromEntries(Object.entries(taken).map(([k, l]) => [k, l.join('\n')])),
  named: base.named, gems: gems.join('\n'), counts: Object.fromEntries(Object.entries(taken).map(([k, l]) => [k, l.filter(s => !recs[s].alias).length]))};

const kinds = Object.keys(man.seo.lists);
const lists = {}, words = {};
for(const k of kinds){
  const rows = repo(man.seo.lists[k].file).filter(r => SLUGS.includes(r[0]));
  if(rows.length) lists[k] = put('seo/list', k, 'json', rows);
  const parts = [];
  for(const f of man.seo.words[k] || []){
    const text = readFileSync(join(REPO, f.file), 'utf8');
    for(const b of text.split('\u0001')) if(SLUGS.includes(b.split('\u0002')[1].split('\u0003')[0])) parts.push(b);
  }
  if(parts.length) words[k] = [put('seo/words', k + '00', 'txt', parts.join('\u0001'))];
}
const buckets = [{}, {}];
for(const s of SLUGS) buckets[bucketOf(s, 2)][s] = recs[s];
const items = {files: buckets.map((b, i) => put('seo/item', String(i).padStart(2, '0'), 'json', b))};
const fman = {id: man.id, v: man.v, gen: man.gen, patch: man.patch, source: 'mcp/dev/fixture.mjs: a cut of ' + man.source,
  seo: {base: put('seo', 'base', 'json', fbase), lists, words, items}};
write('data/manifest.json', fman);

// prices: the live part, the chosen rows
const live = read(join(SNAP, 'live.json'));
const litems = {};
for(const k of PRICES) if(live.items[k]) litems[k] = live.items[k];
write('data/market.json_part=live', {...live, markets: live.markets.slice(0, 3), items: litems});

// the market files: the index's bundle map for the chosen currencies, and one bundle holding them
const mindex = read(join(SNAP, 'mindex.json'));
const bundle = {cards: {}};
for(const d of DIDS){
  const n = mindex.site.cards[d], b = read(join(SNAP, 'cards' + n + '.json'));
  Object.assign(bundle, {source: b.source, flags: b.flags, updated: b.updated, rule: b.rule});
  const c = b.cards[d];
  bundle.cards[d] = {n: c.n, updated: c.updated, days: c.days.slice(-2)};
}
write('data/market/index.json', {source: mindex.source, updated: mindex.updated, leagues: mindex.leagues,
  site: {bundles: 1, cards: Object.fromEntries(DIDS.map(d => [d, 1]))}});
write('data/market/cards-1.json', bundle);

// GGG's patch notes: every line naming a chosen card, and the whole of the newest patch that names Fireball
const pn = repo('data/patchnotes.json');
const keep = new Set();
for(const k of KEYS) for(const i of pn.on[k] || []) keep.add(i);
const fireball = Math.max(...(pn.on['g:Fireball'] || []).map(i => pn.lines[i][0]));
pn.lines.forEach((l, i) => { if(l[0] === fireball) keep.add(i); });
const order = [...keep].sort((a, b) => a - b), at = new Map(order.map((i, j) => [i, j]));
const on = {};
for(const [k, list] of Object.entries(pn.on)){
  const kept = list.filter(i => at.has(i)).map(i => at.get(i));
  if(kept.length) on[k] = kept;
}
write('data/patchnotes.json', {v: pn.v, updated: pn.updated, source: pn.source, note: pn.note, patches: pn.patches,
  heads: pn.heads, lines: order.map(i => pn.lines[i]), on});
write('data/patches.json', repo('data/patches.json'));
write('data/changelog.json', repo('data/changelog.json').slice(0, 3));
console.log('fixture: ' + SLUGS.length + ' cards, ' + Object.keys(litems).length + ' prices, ' + order.length + ' patch-note lines, newest Fireball patch #' + fireball);
