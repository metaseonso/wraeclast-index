/* No internal ids where a player reads (#12), for the data the game files fill.

   tools/datpull.mjs writes data/game/ and tools/odds.py writes data/odds.json. Both carry internal ids on
   purpose: a join key, a stat the game never shows anyone. Each file names the fields that may hold one in its own
   `ids` list, and this fails a build where any other field does. So an id is always a thing a file says it holds,
   never a thing that slipped through into a name or a line of text.

   An id looks like one of these:
     * a file path in the game          Metadata/Monsters/..., Art/2DArt/...
     * a thing players never see        [DNT], DNT-...
     * a stat id                         map_item_drop_rarity_+%, chest_hidden_item_quantity_+%
     * an area id                        G2_4_1, C1_2
     * the game's markup, unfilled       [Tag|Word], {0}

   Only these files. The rest of data/ is held to the same rule by the guard's rawcode check, which knows the
   older files' leftovers by name (tools/dev/guard-baseline.json); these files have none, and start clean.

   Run on its own:  node tools/dev/ids.mjs        ...or as the guard's "ids" check. */
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

export const SHAPES = [
  ['game path', /\b(?:Metadata|Art)\/[A-Za-z0-9_]/],
  ['DNT marker', /\[DNT|\bDNT\b/],
  ['stat id', /(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])/],
  ['area id', /\b[A-Z]\d+(?:_\d+)+[a-z]?\b/],
  ['[a|b] markup', /\[[^\]|]{1,60}\|[^\]]{1,60}\](?!\()/],
  ['{0} placeholder', /\{\d*\}/],
];
const shape = s => { for(const [n, re] of SHAPES) if(re.test(s)) return n; return null; };

/* the files held to it: every file in data/game/, and data/odds.json */
export async function files(){
  let game = [];
  try { game = (await readdir(join(ROOT, 'data', 'game'))).filter(n => n.endsWith('.json')).sort().map(n => 'data/game/' + n); }
  catch {}
  const out = [...game];
  try { await readFile(join(ROOT, 'data', 'odds.json')); out.push('data/odds.json'); } catch {}
  return out;
}

/* every string (and every key) outside the fields the file allows, with where it sits */
function walk(v, path, allow, out){
  if(typeof v === 'string'){ const m = shape(v); if(m) out.push([path, m, v]); return; }
  if(Array.isArray(v)){ v.forEach((x, i) => walk(x, path + '[' + i + ']', allow, out)); return; }
  if(!v || typeof v !== 'object') return;
  for(const [k, x] of Object.entries(v)){
    if(allow.has(k)) continue;
    const m = shape(k);
    if(m) out.push([path + '.{key}', m, k]);
    walk(x, path + '.' + k, allow, out);
  }
}

export async function checkIds(){
  const bad = [], list = await files();
  let strings = 0;
  for(const f of list){
    let j;
    try { j = JSON.parse(await readFile(join(ROOT, f), 'utf8')); }
    catch(e){ bad.push(f + ' does not read: ' + e.message); continue; }
    const allow = new Set(Array.isArray(j.ids) ? j.ids : []);
    allow.add('ids');                       // the list itself names fields, and field names are not ids
    const found = [];
    walk(j, '', allow, found);
    strings += JSON.stringify(j).length;
    for(const [path, m, eg] of found.slice(0, 3))
      bad.push(f + ' ' + path.replace(/^\./, '') + ' holds a ' + m + ': ' + JSON.stringify(eg.length > 60 ? eg.slice(0, 59) + '…' : eg) +
        (found.length > 3 && path === found[2][0] ? ' (+' + (found.length - 3) + ' more)' : ''));
  }
  return {bad, said: list.length ? list.length + ' files of game data, ' + Math.round(strings / 1024).toLocaleString('en-US') +
    ' kB, ids only where a file says so' : 'no game data files yet'};
}

if(import.meta.url === 'file:///' + (process.argv[1] || '').replace(/\\/g, '/').replace(/^\//, '')){
  const r = await checkIds();
  for(const b of r.bad) console.log('FAIL ' + b);
  console.log(r.bad.length ? r.bad.length + ' broken' : 'ok   ids     ' + r.said);
  process.exit(r.bad.length ? 1 : 0);
}
