/* One declaration per kind, held to the data.

   assets/kinds.js says what every kind is and which fields its cards draw. This turns that table into
   data/schema.json — every field an index row may carry, its shape, which kinds carry it and which must — and
   holds the shipped data to it. The builders read the same file (tools/lastgood.py, tools/pipeline.py), so a
   patch that changes the shape of a field is caught where it is built, not on a card.

     node tools/dev/schema.mjs                 check data/ against the declarations
     node tools/dev/schema.mjs --data DIR      check another data folder (the pipeline's staging copy: the cut
                                               below is left to the pipeline's last stage and its --check)
     node tools/dev/schema.mjs --write         write data/schema.json again out of assets/kinds.js

   What it checks, per kind, printing the first few problems of each:
     * data/schema.json is what assets/kinds.js says today (a stale copy fails: run --write)
     * data/index.json: a row of a kind nothing declares; a row missing a field every row carries; a field of
       the wrong shape; a field no declaration of its kind names
     * data/index-core.json and data/index-rest.json: both parts are of this index, and put back together they
       hold the same rows, of the same shapes
     * data/manifest.json (tools/shards.py): of this index, every kind's rows all there, every file it names there
     * data/bosses.json: every boss row has the fields the Bosses tab reads
   tools/dev/guard.mjs runs it inside the frame check; run on its own it needs nothing but the files. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, FIELDS, ROW, MAPS } from '../../assets/kinds.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const OUT = 'schema.json';
const SHOW = 3;            // problems printed per kind

/* The shape of the value each renderer reads (TYPE in assets/app.js). One line per renderer, none per kind:
   a renderer draws one shape wherever it is used. `rich` reads the lines as a list and the text as one
   string, so it takes either. A renderer that reads no field of the row is not here. */
const TYPE_JSON = {
  text: ['string'], enum: ['string'], quote: ['string'], source: ['string'], note: ['string'],
  adds: ['string'], pool: ['string'], danger: ['string'], odds: ['string'], drop: ['string'],
  number: ['number'], duration: ['number'],
  flag: ['number', 'boolean', 'string'],
  rich: ['array', 'string'],
  gemreq: ['array'], reqs: ['array'], cost: ['array'], lines: ['array'], weights: ['array'], perslot: ['array'],
  ladder: ['array'], options: ['array'], flow: ['array'], tags: ['array'], anoint: ['array'], chips: ['array'],
  uses: ['object'],
  item: ['object'], picks: ['object'], launch: ['object'], budget: ['object'], gear: ['object'], tree: ['object'],
};
/* The renderers that read a field of the row without an `at`: the name box reads the name, which a player
   reads as words; the art box the picture's address or the sprite cell, and an anointment its price, which
   nobody reads as words. */
const TYPE_READS = {name: {at: ['n'], words: 1}, art: {at: ['img', 'ic']}, anoint: {at: ['ac']}};

/* Rows that are not in the index: a kind whose own module draws its card from a file of its own. The shape
   is that module's (assets/bosses.js reads these), declared here once so the file is held to it. */
const OWN_ROWS = {
  x: {file: 'bosses.json', at: 'bosses', row: {
    name: {json: ['string'], need: 1}, areas: {json: ['array'], need: 1}, pinnacle: {json: ['boolean'], need: 1},
    drops: {json: ['array']}, access: {json: ['array']}, rates: {json: ['object']},
    checked: {json: ['array']}, nodrops: {json: ['object']},
  }},
};

/* The patterns of a raw game id: what must never reach a field a player reads (issue #12). The guard's
   rawcode check reads the rendered pages with its own list; this one is what a builder holds its fields to. */
const RAW = [
  ['a game file path', 'Metadata/'],
  ['a stat id', '(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])'],
  ['a DNT marker', '\\[DNT'],
];

const jsonOf = v => v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v;
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ||
  (typeof v === 'object' && v && !Array.isArray(v) && !Object.keys(v).length);

/* ---------- the schema, out of the table ---------- */
export function makeSchema(){
  const kinds = {}, fields = {};
  const note = (f, k, json, how) => {
    const x = fields[f] ||= {json: [], kinds: [], need: [], drawn: [], by: []};
    for(const j of json) if(!x.json.includes(j)) x.json.push(j);
    if(!x.kinds.includes(k)) x.kinds.push(k);
    if(how.need && !x.need.includes(k)) x.need.push(k);
    if(how.drawn && !x.drawn.includes(k)) x.drawn.push(k);
    if(how.by && !x.by.includes(how.by)) x.by.push(how.by);
  };
  // fields read by a declaration rather than drawn: a map groups by them, a link or a file fills one in
  const declared = d => {
    const out = new Set();
    for(const g of Object.values(MAPS)) out.add(g.at);
    for(const t of [d.gone, d.notitem, d.px && d.px.at && {at: d.px.at}, ...(d.builds || [])]) if(t && t.at) out.add(t.at);
    for(const m of String(d.link || '').matchAll(/@(\w+)/g)) out.add(m[1]);
    for(const f of d.fields || []) for(const m of String((FIELDS[f] || {}).file || '').matchAll(/@(\w+)/g)) out.add(m[1]);
    if(d.mark) out.add(d.mark);
    for(const m of Object.keys(d.make || {})) out.add(m);
    return out;
  };
  for(const d of KINDS){
    const own = OWN_ROWS[d.k];
    if(!d.index && !own) continue;
    const kind = kinds[d.k] = {one: d.one, many: d.many, rows: d.index ? 'index.json' : own.file, fields: {}};
    const put = (f, json, how) => {
      const x = kind.fields[f] ||= {json: [], by: []};
      for(const j of json) if(!x.json.includes(j)) x.json.push(j);
      if(how.need) x.need = 1;
      if(how.drawn) x.drawn = 1;
      if(how.ids) x.ids = 1;
      if(how.by && !x.by.includes(how.by)) x.by.push(how.by);
      note(f, d.k, json, how);
    };
    if(own){
      for(const [f, r] of Object.entries(own.row)) put(f, r.json, {need: r.need, drawn: 1, by: 'row'});
      continue;
    }
    for(const [f, r] of Object.entries(ROW)) put(f, [r.json], {need: r.need, by: 'row'});
    for(const name of d.fields || []){
      const F = FIELDS[name];
      if(!F || F.row === 'price') continue;
      const json = TYPE_JSON[F.type];
      const reads = TYPE_READS[F.type] || {at: []};
      for(const at of reads.at) put(at, kind.fields[at] ? kind.fields[at].json : ['string'], {drawn: reads.words, by: name});
      if(!F.at || !json) continue;
      put(F.at, json, {drawn: 1, ids: F.ids, by: name});
      if(F.beside) put(F.beside, ['array'], {drawn: 1, by: name});
    }
    for(const at of declared(d)) if(!kind.fields[at]) put(at, ['string', 'number', 'boolean', 'array', 'object'], {by: 'declaration'});
    // a drawn field that also carries ids (a keyword chip) is never held to the raw-id rule
    for(const x of Object.values(kind.fields)) if(x.ids) delete x.drawn;
  }
  for(const x of Object.values(fields)) for(const k of ['kinds', 'need', 'drawn', 'by']) x[k].sort();
  return {
    note: 'Generated by tools/dev/schema.mjs --write from assets/kinds.js (KINDS, FIELDS, ROW). Do not edit: change ' +
      'the declarations and write it again. Per kind, every field a row may carry: its JSON shape, `need` where every ' +
      'row carries it, `drawn` where a card draws it as words (such a field never holds a raw game id), and `by` the ' +
      'declaration that names it. tools/lastgood.py and tools/pipeline.py hold a fresh build to it.',
    rows: {'index.json': {at: 'items', by: 'k'}, ...Object.fromEntries(Object.entries(OWN_ROWS).map(([k, o]) => [o.file, {at: o.at, kind: k}]))},
    parts: ['index-core.json', 'index-rest.json'],
    raw: RAW.map(([is, re]) => ({is, re})),
    kinds,
    fields: Object.fromEntries(Object.entries(fields).sort(([a], [b]) => a < b ? -1 : 1)),
  };
}
export const schemaText = () => JSON.stringify(makeSchema(), null, 1) + '\n';

/* ---------- the data, against it ---------- */
const RAW_RE = RAW.map(([is, re]) => [is, new RegExp(re)]);
function rawIn(v){
  if(typeof v === 'string'){ for(const [is, re] of RAW_RE) if(re.test(v)) return is; return null; }
  if(Array.isArray(v)){ for(const x of v){ const r = rawIn(x); if(r) return r; } return null; }
  if(v && typeof v === 'object'){ for(const x of Object.values(v)){ const r = rawIn(x); if(r) return r; } }
  return null;
}
const clip = (s, n = 60) => String(s).replace(/\s+/g, ' ').slice(0, n);

/* one row against its kind's declaration; problems go into bad[k] */
function checkRow(schema, it, k, bad, where){
  const kind = schema.kinds[k];
  const say = s => (bad[k] ||= []).push(s);
  if(!kind){ say(where + ': kind "' + k + '" is not declared'); return; }
  const name = it.n || it.name || it.id || '?';
  for(const [f, x] of Object.entries(kind.fields)) if(x.need && empty(it[f]))
    say(clip(name) + ' has no "' + f + '", which every ' + kind.one.toLowerCase() + ' carries');
  for(const [f, v] of Object.entries(it)){
    const x = kind.fields[f];
    if(!x){ say(clip(name) + ' carries "' + f + '", which no declaration of ' + kind.many.toLowerCase() + ' names'); continue; }
    if(v === null || v === undefined) continue;
    const j = jsonOf(v);
    if(!x.json.includes(j)) say(clip(name) + ': "' + f + '" is ' + j + ', declared ' + x.json.join(' or '));
    if(x.drawn){ const r = rawIn(v); if(r) say(clip(name) + ': "' + f + '" holds ' + r + ' where a player reads it: ' + JSON.stringify(clip(JSON.stringify(v), 50))); }
  }
}

/* the two parts put back into rows, the way assets/app.js does before anything reads a card */
function unpackPart(part){
  const W = part.dict || {}, out = [];
  const word = (f, v) => W[f] ? (Array.isArray(v) ? v.map(i => W[f][i]) : typeof v === 'number' ? W[f][v] : v) : v;
  for(const [k, list] of Object.entries(part)){
    if(!/^[a-z]$/.test(k) || !Array.isArray(list)) continue;
    for(const o of list){
      const it = {k};
      for(const [f, v] of Object.entries(o)) it[f] = f === 'lx' ? v : word(f, v);
      if(it.id === undefined) it.id = it.n;
      out.push(it);
    }
  }
  return out;
}

export async function checkSchema({data = join(ROOT, 'data'), cut = true} = {}){
  const bad = {}, top = [];
  const read = async f => JSON.parse(await readFile(join(data, f), 'utf8'));
  const want = schemaText();
  const have = await readFile(join(data, OUT), 'utf8').catch(() => null);
  if(have === null) top.push('data/' + OUT + ' is missing: run node tools/dev/schema.mjs --write');
  else if(have.replace(/\r\n/g, '\n') !== want) top.push('data/' + OUT + ' is behind assets/kinds.js: run node tools/dev/schema.mjs --write');
  const schema = JSON.parse(want);

  let rows = 0, parts = 'no parts';
  const counts = {};
  let raw = null, index = null;
  try { raw = await readFile(join(data, 'index.json')); index = JSON.parse(raw); }
  catch(e){ top.push('data/index.json does not read: ' + clip(e.message)); }
  if(index){
    for(const f of ['v', 'gen', 'items']) if(empty(index[f])) top.push('data/index.json has no "' + f + '"');
    for(const it of index.items || []){
      rows++;
      counts[it.k] = (counts[it.k] || 0) + 1;
      checkRow(schema, it, it.k, bad, 'data/index.json');
    }
    // the two parts the home page loads: of this index, and the same rows put back together
    try {
      const [core, rest] = await Promise.all(schema.parts.map(read));
      const id = createHash('sha1').update(raw).digest('hex').slice(0, 12);
      if(core.id !== rest.id) top.push('the two index parts are of different builds (' + core.id + ', ' + rest.id + ')');
      else if(core.id !== id) top.push('the index parts are of another index.json (' + core.id + ', not ' + id + '): run python tools/appdata.py');
      const back = [...unpackPart(core), ...unpackPart(rest)];
      const got = {};
      for(const it of back) got[it.k] = (got[it.k] || 0) + 1;
      for(const k of new Set([...Object.keys(counts), ...Object.keys(got)]))
        if((got[k] || 0) !== (counts[k] || 0)) top.push('the parts hold ' + (got[k] || 0) + ' ' + k + ' rows, the index ' + (counts[k] || 0));
      const partBad = {};
      for(const it of back) checkRow(schema, it, it.k, partBad, 'the index parts');
      for(const [k, list] of Object.entries(partBad)) for(const s of list) (bad[k] ||= []).push('in the parts: ' + s);
      parts = 'both parts match it';
    } catch(e){ top.push('the index parts do not read: ' + clip(e.message)); }
    // the cut the site reads a piece at a time (tools/shards.py): of this index, every kind whole, every file there
    if(cut) try {
      const man = await read('manifest.json');
      const id = createHash('sha1').update(raw).digest('hex').slice(0, 12);
      if(man.id !== id) top.push('data/manifest.json is of another index.json (' + man.id + ', not ' + id + '): run python tools/shards.py');
      for(const k of new Set([...Object.keys(counts), ...Object.keys(man.kinds || {})])){
        const K = (man.kinds || {})[k], cut = K ? K.cards.reduce((a, c) => a + c.n, 0) : 0;
        if(!K || K.n !== (counts[k] || 0) || cut !== K.n) top.push('data/manifest.json holds ' + (K ? K.n + ' ' + k + ' rows in ' + cut + ' cut' : 'no ' + k + ' rows') + ', the index ' + (counts[k] || 0));
      }
      const named = [];
      (function walk(v){ if(v && typeof v === 'object'){ if(typeof v.file === 'string') named.push(v.file); for(const x of Object.values(v)) walk(x); } })(man);
      const gone = [];
      for(const f of named) await readFile(join(data, '..', f)).catch(() => gone.push(f));
      if(gone.length) top.push(gone.length + ' files data/manifest.json names are not there (' + gone[0] + '): run python tools/shards.py');
      parts += ', and so does the cut';
    } catch(e){ top.push('data/manifest.json does not read: ' + clip(e.message) + ': run python tools/shards.py'); }
  }
  // rows a kind's own module reads from a file of its own
  let own = 0;
  for(const [file, r] of Object.entries(schema.rows)){
    if(file === 'index.json') continue;
    let j;
    try { j = await read(file); } catch(e){ top.push('data/' + file + ' does not read: ' + clip(e.message)); continue; }
    const list = j[r.at];
    if(!Array.isArray(list) || !list.length){ top.push('data/' + file + ' has no "' + r.at + '"'); continue; }
    for(const it of list){ own++; checkRow(schema, it, r.kind, bad, 'data/' + file); }
  }

  const lines = [...top];
  for(const [k, list] of Object.entries(bad)){
    const K = schema.kinds[k];
    lines.push((K ? K.many : 'kind ' + k) + ': ' + list.length + ' problem' + (list.length === 1 ? '' : 's') +
      ' — ' + list.slice(0, SHOW).join(' | '));
  }
  const nk = Object.keys(schema.kinds).length, nf = Object.keys(schema.fields).length;
  return {bad: lines, said: 'schema: ' + nk + ' kinds, ' + nf + ' fields, ' + (rows + own).toLocaleString('en-US') +
    ' rows hold to it, ' + parts};
}

/* on its own */
if(import.meta.url === 'file:///' + (process.argv[1] || '').replace(/\\/g, '/').replace(/^\//, '')){
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--data');
  const data = at >= 0 ? resolve(argv[at + 1]) : join(ROOT, 'data');
  if(argv.includes('--write')){
    await writeFile(join(data, OUT), schemaText());
    const s = makeSchema();
    console.log('wrote ' + join(data, OUT) + ': ' + Object.keys(s.kinds).length + ' kinds, ' + Object.keys(s.fields).length + ' fields');
  }
  const r = await checkSchema({data, cut: at < 0});
  for(const b of r.bad) console.log('FAIL ' + b);
  console.log(r.bad.length ? r.bad.length + ' broken' : 'ok   ' + r.said);
  process.exit(r.bad.length ? 1 : 0);
}
