/* The dump report: what a data rebuild changed, before anyone reads the diff.

     node tools/dev/dumpreport.mjs                   origin/main against this working tree
     node tools/dev/dumpreport.mjs <ref>             any commit, branch or tag against this working tree
     node tools/dev/dumpreport.mjs <a>..<b>          two commits (HEAD~20..HEAD)
     --json <file>   where the whole report goes as JSON (default tmp/dumpreport.json)
     --strict        exit 2 when anything is flagged

   Markdown to stdout, short enough to paste on a pull request (the Checks workflow posts it on every pull request
   that touches data/). Per file under data/: the bytes before and after. Per kind in data/index.json: how many
   cards before and after, which were added, removed or changed (the first few names of each), and per field how
   many cards changed it, emptied it or filled it. data/index-core.json and index-rest.json list by list, words
   unpacked (the way assets/app.js reads them), so a reshuffled word table is not a change. Every other JSON file:
   how many rows each part holds.

   Flagged, by the last-good rule (a source that collapses is a fault, not news, tools/lastgood.py):
     - a kind, or a list in index-core/rest, that lost more than 10% of its rows
     - a field that went empty on many cards of one kind (20 cards, and a tenth of those that had it)
     - a data file that went away, or lost more than half its bytes
     - a part of another data file that lost more than 10% of its rows
   Reads git and data/, writes the one JSON file, no network. */
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAMES } from '../../assets/kinds.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DROP = 0.10;              // a kind or a list may lose this share of its rows before it is flagged
const EMPTY_N = 20, EMPTY_SHARE = 0.10;   // a field emptied on at least this many cards, and this share of those that had it
const SHRINK = 0.5;             // a file that loses this share of its bytes
// name.<hash>.json: the drill-down page's data and the index's cut (tools/shards.py, its words files .txt), named by content
const HASHED = /\.[0-9a-f]{8,}\.(?:json|txt)$/;
const FIRST = 5;                // names shown per list
const MAX_MD = 60000;           // a GitHub comment holds 65,536 characters

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const opt = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const strict = argv.includes('--strict');
const jsonOut = opt('--json') || join(ROOT, 'tmp', 'dumpreport.json');
const pos = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json');
let [base, head] = (pos[0] || 'origin/main').split('..');
if(head === '') head = 'HEAD';

/* ---------- git and the working tree ---------- */
function git(args, buf = false){
  const r = spawnSync('git', args, {cwd: ROOT, encoding: buf ? 'buffer' : 'utf8', maxBuffer: 1 << 30});
  if(r.status !== 0) throw new Error('git ' + args.join(' ') + ': ' + String(r.stderr).trim());
  return r.stdout;
}
function resolveRef(ref){
  try { return git(['rev-parse', '--verify', '--quiet', ref + '^{commit}']).trim(); }
  catch { if(ref === 'origin/main') return resolveRef('main'); throw new Error('no such commit: ' + ref); }
}
async function walk(dir, out = []){
  for(const d of await readdir(join(ROOT, dir), {withFileTypes: true}).catch(() => [])){
    const p = dir + '/' + d.name;
    if(d.isDirectory()) await walk(p, out); else if(d.isFile()) out.push(p);
  }
  return out;
}
// one side: {list: [paths], size(path), text(path)}
function side(ref){
  if(!ref){
    return {
      label: 'working tree',
      list: async () => (await walk('data')).sort(),
      bytes: async p => { try { return await readFile(join(ROOT, p)); } catch { return null; } },
    };
  }
  const sha = resolveRef(ref);
  let tree = null;
  return {
    label: ref + ' (' + sha.slice(0, 7) + ')',
    list: async () => {
      tree = tree || git(['ls-tree', '-r', '--name-only', sha, '--', 'data']).split('\n').filter(Boolean);
      return tree.sort();
    },
    bytes: async p => { try { return git(['show', sha + ':' + p], true); } catch { return null; } },
  };
}

/* ---------- reading the index ---------- */
const empty = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) ||
  (typeof v === 'object' && !Array.isArray(v) && v !== null && !Object.keys(v).length);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keyOf = it => it && typeof it === 'object' && !Array.isArray(it) ? (it.id ?? it.n ?? JSON.stringify(it)) : JSON.stringify(it);
const nameOf = it => it && typeof it === 'object' && !Array.isArray(it) ? String(it.n ?? it.id ?? '?') : (typeof it === 'string' ? it : JSON.stringify(it).slice(0, 40));
// assets/app.js unpack(): numbers into the words they stand for
function unpack(part){
  const W = part && part.dict;
  if(!W) return part;
  const word = (f, v) => typeof v === 'number' ? W[f][v] : Array.isArray(v) ? v.map(i => W[f][i]) : v;
  for(const list of Object.values(part)) if(Array.isArray(list)) for(const it of list)
    if(it && typeof it === 'object' && !Array.isArray(it)) for(const f in W) if(it[f] !== undefined) it[f] = word(f, it[f]);
  if(part.ckw && W.kw) for(const key in part.ckw) part.ckw[key] = word('kw', part.ckw[key]);
  delete part.dict;
  return part;
}
const parse = buf => { try { return buf ? JSON.parse(buf.toString('utf8')) : null; } catch { return null; } };

// two lists of rows: counts, and which rows came, went or changed; fields per row when rows are objects
function compare(a, b){
  const A = new Map(), B = new Map();
  for(const it of a || []) A.set(keyOf(it), it);
  for(const it of b || []) B.set(keyOf(it), it);
  const added = [], removed = [], changed = [], fields = {};
  for(const [k, it] of B) if(!A.has(k)) added.push(nameOf(it));
  for(const [k, it] of A){
    if(!B.has(k)){ removed.push(nameOf(it)); continue; }
    const now = B.get(k);
    if(same(it, now)) continue;
    changed.push(nameOf(now));
    if(it && typeof it === 'object' && !Array.isArray(it))
      for(const f of new Set([...Object.keys(it), ...Object.keys(now)])){
        if(same(it[f], now[f])) continue;
        const x = fields[f] || (fields[f] = {changed: 0, emptied: 0, filled: 0, had: 0});
        x.changed++;
        if(!empty(it[f]) && empty(now[f])) x.emptied++;
        if(empty(it[f]) && !empty(now[f])) x.filled++;
      }
  }
  // how many cards carried each field before: the share an emptying is measured against
  for(const [f, x] of Object.entries(fields)) for(const it of A.values()) if(it && typeof it === 'object' && !empty(it[f])) x.had++;
  return {before: A.size, after: B.size, added, removed, changed, fields};
}
// the rows each part of a JSON file holds: its top-level lists and maps, by length
function rows(j){
  if(Array.isArray(j)) return {'': j.length};
  const out = {};
  if(j && typeof j === 'object') for(const [k, v] of Object.entries(j)){
    if(Array.isArray(v)) out[k] = v.length;
    else if(v && typeof v === 'object') out[k] = Object.keys(v).length;
  }
  return out;
}

/* ---------- the report ---------- */
async function report(){
  const A = side(base), B = side(head || null);
  const after = await B.list();
  const paths = [...new Set([...await A.list(), ...after])].sort();
  const out = {base: A.label, head: B.label, made: new Date().toISOString(), files: [], kinds: {}, fields: {}, lists: {}, rows: [], flags: []};
  const flag = (what, why) => out.flags.push({what, why});
  const emptied = (where, c) => { for(const [f, x] of Object.entries(c.fields)) if(x.emptied >= EMPTY_N && x.emptied >= EMPTY_SHARE * x.had)
    flag(where + ' · ' + f, 'went empty on ' + x.emptied + ' of the ' + x.had + ' rows that had it'); };
  const got = {};
  for(const p of paths){
    const [a, b] = await Promise.all([A.bytes(p), B.bytes(p)]);
    const f = {file: p, before: a ? a.length : null, after: b ? b.length : null};
    f.state = !a ? 'added' : !b ? 'removed' : a.equals(b) ? 'same' : 'changed';
    // a file named by its content (tools/sync.py) is replaced, not lost, when its block comes back under a new hash
    const block = f.state === 'removed' && HASHED.test(p) ? p.replace(HASHED, '.') : null;
    const heir = block && after.find(q => q !== p && q.replace(HASHED, '.') === block);
    if(heir){ f.state = 'replaced'; f.by = heir; }
    out.files.push(f);
    if(f.state === 'removed') flag(p, 'the file went away');
    else if(f.state === 'changed' && f.before >= 10240 && f.after < f.before * (1 - SHRINK))
      flag(p, 'lost ' + Math.round(100 * (1 - f.after / f.before)) + '% of its bytes');
    if(p.endsWith('.json') && f.state === 'changed') got[p] = [parse(a), parse(b)];
  }

  // data/index.json, kind by kind
  const ix = got['data/index.json'];
  if(ix){
    const byKind = j => { const m = {}; for(const it of (j && j.items) || []) (m[it.k] = m[it.k] || []).push(it); return m; };
    const [a, b] = ix.map(byKind);
    for(const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()){
      const c = compare(a[k], b[k]);
      c.name = NAMES[k] || k;
      out.kinds[k] = c;
      if(c.before && (c.before - c.after) / c.before > DROP) flag('index.json ' + c.name, c.before + ' cards to ' + c.after);
      for(const [f, x] of Object.entries(c.fields)){
        const t = out.fields[f] || (out.fields[f] = {changed: 0, emptied: 0, filled: 0});
        t.changed += x.changed; t.emptied += x.emptied; t.filled += x.filled;
      }
      emptied('index.json ' + c.name, c);
    }
  }
  // index-core and index-rest, list by list
  for(const p of ['data/index-core.json', 'data/index-rest.json']){
    if(!got[p]) continue;
    const [a, b] = got[p].map(j => j ? unpack(j) : {});
    for(const k of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()){
      if(!Array.isArray(a[k]) && !Array.isArray(b[k])) continue;
      const c = compare(a[k], b[k]);
      if(!c.added.length && !c.removed.length && !c.changed.length) continue;
      c.name = NAMES[k] || k;
      out.lists[p.slice(5) + ' ' + k] = c;
      if(c.before >= 20 && (c.before - c.after) / c.before > DROP) flag(p.slice(5) + ' ' + c.name, c.before + ' rows to ' + c.after);
      emptied(p.slice(5) + ' ' + c.name, c);
    }
  }
  // every other JSON file: rows per part
  for(const [p, [a, b]] of Object.entries(got)){
    if(/^data\/index(-core|-rest)?\.json$/.test(p)) continue;
    const ra = rows(a), rb = rows(b);
    for(const k of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()){
      const x = ra[k] ?? 0, y = rb[k] ?? 0;
      if(x === y) continue;
      out.rows.push({file: p, part: k, before: x, after: y});
      if(x >= 20 && (x - y) / x > DROP) flag(p + (k ? ' ' + k : ''), x + ' rows to ' + y);
    }
  }
  return out;
}

/* ---------- Markdown ---------- */
const fmt = n => n == null ? '-' : n.toLocaleString('en-US');
const kb = n => n == null ? '-' : n >= 1048576 ? (n / 1048576).toFixed(2) + ' MiB' : (n / 1024).toFixed(1) + ' KiB';
const delta = (a, b) => a == null || b == null ? '' : (b >= a ? '+' : '') + (b - a).toLocaleString('en-US');
const cell = s => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const some = list => list.length ? list.slice(0, FIRST).map(cell).join(', ') + (list.length > FIRST ? ' (+' + (list.length - FIRST) + ' more)' : '') : '';
function markdown(r){
  const md = ['<!-- wi-dump -->', '## Data dump: ' + r.base + ' → ' + r.head, ''];
  md.push(r.flags.length ? '**' + r.flags.length + ' flagged** (a collapse is a fault, not news):' : 'Nothing flagged.');
  for(const f of r.flags) md.push('- `' + cell(f.what) + '` ' + f.why);
  md.push('');

  const moved = r.files.filter(f => f.state !== 'same');
  const tb = r.files.reduce((a, f) => a + (f.before || 0), 0), ta = r.files.reduce((a, f) => a + (f.after || 0), 0);
  md.push('### Files', '', moved.length + ' of ' + r.files.length + ' files under data/ changed; ' + kb(tb) + ' → ' + kb(ta) + '.', '');
  if(moved.length){
    md.push('| file | before | after | bytes |', '|---|--:|--:|--:|');
    for(const f of moved) md.push('| ' + cell(f.file.slice(5)) + (f.state === 'changed' ? '' : ' (' + f.state + (f.by ? ' by ' + cell(f.by.slice(f.by.lastIndexOf('/') + 1)) : '') + ')') + ' | ' + kb(f.before) + ' | ' + kb(f.after) + ' | ' + delta(f.before, f.after) + ' |');
    md.push('');
  }

  const kinds = Object.entries(r.kinds);
  if(kinds.length){
    md.push('### Cards by kind (index.json)', '', '| kind | before | after | added | removed | changed |', '|---|--:|--:|--:|--:|--:|');
    for(const [, c] of kinds) md.push('| ' + c.name + ' | ' + fmt(c.before) + ' | ' + fmt(c.after) + ' | ' + c.added.length + ' | ' + c.removed.length + ' | ' + c.changed.length + ' |');
    md.push('');
    for(const [, c] of kinds){
      const bits = [['added', c.added], ['removed', c.removed], ['changed', c.changed]].filter(([, l]) => l.length).map(([w, l]) => w + ': ' + some(l));
      if(bits.length) md.push('- **' + c.name + '** ' + bits.join(' · '));
    }
    md.push('');
    const fl = Object.entries(r.fields).sort((a, b) => b[1].changed - a[1].changed);
    if(fl.length){
      md.push('### Fields (index.json)', '', 'Cards whose field changed; of those, how many it went empty on and how many it filled.', '',
        '| field | changed | emptied | filled |', '|---|--:|--:|--:|');
      for(const [f, x] of fl) md.push('| `' + f + '` | ' + fmt(x.changed) + ' | ' + fmt(x.emptied) + ' | ' + fmt(x.filled) + ' |');
      md.push('');
    }
  }
  const lists = Object.entries(r.lists);
  if(lists.length){
    md.push('### index-core and index-rest', '', 'Words unpacked, so a reshuffled word table is not a change. Fields: changed (emptied/filled).', '',
      '| list | before | after | added | removed | changed | fields |', '|---|--:|--:|--:|--:|--:|---|');
    const top = fs => Object.entries(fs).sort((a, b) => b[1].changed - a[1].changed).slice(0, 4)
      .map(([f, x]) => '`' + f + '` ' + x.changed + (x.emptied || x.filled ? ' (' + x.emptied + '/' + x.filled + ')' : '')).join(', ');
    for(const [k, c] of lists) md.push('| ' + cell(k) + (c.name !== k.split(' ')[1] ? ' (' + c.name + ')' : '') + ' | ' + fmt(c.before) + ' | ' + fmt(c.after) + ' | ' + c.added.length + ' | ' + c.removed.length + ' | ' + c.changed.length + ' | ' + top(c.fields) + ' |');
    md.push('');
  }
  if(r.rows.length){
    md.push('### Rows in the other files', '', '| file | part | before | after |', '|---|---|--:|--:|');
    for(const x of r.rows.slice(0, 60)) md.push('| ' + cell(x.file.slice(5)) + ' | ' + cell(x.part || '(the list)') + ' | ' + fmt(x.before) + ' | ' + fmt(x.after) + ' |');
    if(r.rows.length > 60) md.push('', (r.rows.length - 60) + ' more in the JSON.');
    md.push('');
  }
  md.push('<sub>tools/dev/dumpreport.mjs · the whole report is its JSON</sub>');
  let text = md.join('\n');
  if(text.length > MAX_MD) text = text.slice(0, MAX_MD - 80).replace(/\n[^\n]*$/, '') + '\n\n(cut here: the rest is in the JSON)';
  return text;
}

/* ---------- run ---------- */
const r = await report();
await mkdir(dirname(jsonOut), {recursive: true});
await writeFile(jsonOut, JSON.stringify(r, null, 1) + '\n');
console.log(markdown(r));
process.exit(strict && r.flags.length ? 2 : 0);
