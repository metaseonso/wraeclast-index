/* Read the owner's dashboard data with the owner's key, so its shape can be looked at without signing in.

     PowerShell:  $env:WI_OWNER_KEY = '<owner key>'; node tools/dev/dash.mjs
     bash:        WI_OWNER_KEY=... node tools/dev/dash.mjs
     node tools/dev/dash.mjs http://127.0.0.1:8787      another address (default https://wraeclastindex.fyi)
     node tools/dev/dash.mjs --raw stats                dump that one answer as JSON
     node tools/dev/dash.mjs --cda                     only the pages and cards flagged as CDA

   One block per endpoint: the status, the bytes back, the top-level keys and a line of shape
   (how long each list is, what came back null or missing). The key only reads; it cannot write
   anything and it cannot sign in. The key itself is never printed. */

const KEY = process.env.WI_OWNER_KEY;
if(!KEY){
  console.error('Set WI_OWNER_KEY first: the owner key (only its SHA-256 is in the OWNER_HASH secret).');
  process.exit(1);
}
const args = process.argv.slice(2);
const cda = args.includes('--cda');   // the owner's own flag: the sequence typed on a page that talks like an assistant
const rawAt = args.indexOf('--raw');
const only = rawAt >= 0 ? args[rawAt + 1] : null;
const base = (args.find(a => /^https?:\/\//.test(a)) || 'https://wraeclastindex.fyi').replace(/\/+$/, '');

/* every read the dashboard makes, in the order its tabs ask for them */
const CALLS = [
  {name: 'stats', path: '/api/admin/stats?days=7'},
  {name: 'cloudflare', path: '/api/admin/cloudflare?days=7'},
  {name: 'suggestions', path: '/api/admin/suggestions'},
  {name: 'heat', path: '/api/admin/heat?route=home&device=desktop&days=7'},
];

async function ask(c){
  let r, text;
  try {
    r = await fetch(base + c.path, {headers: {Authorization: 'Bearer ' + KEY}});
    text = await r.text();
  } catch(e){ return {bad: 'could not reach ' + base + ': ' + (e.message || e)}; }
  let body;
  try { body = JSON.parse(text); } catch { return {status: r.status, bytes: text.length, bad: 'not JSON: ' + trim(text, 120)}; }
  return {status: r.status, bytes: text.length, body};
}

const trim = (s, n) => String(s).replace(/\s+/g, ' ').slice(0, n);
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);

/* what one value is, in a few words */
function shape(v){
  if(v === null) return 'null';
  if(v === undefined) return 'missing';
  if(Array.isArray(v)) return v.length + (v.length === 1 ? ' item' : ' items');
  if(typeof v === 'object'){
    const k = Object.keys(v);
    return '{' + k.length + (k.length ? ': ' + trim(k.slice(0, 6).join(', '), 60) + (k.length > 6 ? ', …' : '') : '') + '}';
  }
  if(typeof v === 'string') return v.length > 30 ? 'text ' + v.length : '"' + v + '"';
  return String(v);
}
/* the empty and the missing: what the dashboard would find nothing to draw from */
function thin(body, prefix = '', out = [], depth = 0){
  for(const [k, v] of Object.entries(body)){
    const at = prefix + k;
    if(v === null || v === undefined) out.push(at + ' ' + shape(v));
    else if(Array.isArray(v)){ if(!v.length) out.push(at + ' empty'); }
    else if(typeof v === 'object'){
      if(!Object.keys(v).length) out.push(at + ' empty');
      else if(depth < 1) thin(v, at + '.', out, depth + 1);
    }
  }
  return out;
}

const list = only ? CALLS.filter(c => c.name === only) : CALLS;
if(!list.length){
  console.error('No such endpoint: ' + only + ' (have: ' + CALLS.map(c => c.name).join(', ') + ')');
  process.exit(1);
}
/* The flags, and nothing else: every note whose text is the sequence's own word, newest first, with the page
   and the card it was sent from. One line each, because the job is to go and read that card. */
if(cda){
  const r = await ask({name: 'suggestions', path: '/api/admin/suggestions'});
  if(r.bad || r.status !== 200){
    console.log('FAIL ' + (r.bad || ('HTTP ' + r.status)));
    process.exit(1);
  }
  const rows = ((r.body || {}).notes || []).filter(n => (n.text || '').trim().toUpperCase() === 'CDA');
  for(const n of rows) console.log(pad(n.at || '', 22) + pad(n.page || '(no page)', 26) + (n.card || '(no card)'));
  console.log(rows.length ? rows.length + ' flagged' : 'nothing flagged');
  process.exit(0);
}
if(!only) console.log('dash · ' + base + ' · ' + list.length + ' reads');

let failed = 0;
for(const c of list){
  const r = await ask(c);
  if(r.bad){
    failed++;
    console.log('FAIL ' + pad(c.name, 12) + (r.status ? 'HTTP ' + r.status + ' ' : '') + trim(r.bad, 150));
    continue;
  }
  if(only){ console.log(JSON.stringify(r.body, null, 2)); continue; }
  if(r.status !== 200){
    failed++;
    console.log('FAIL ' + pad(c.name, 12) + 'HTTP ' + r.status + ' ' + trim(JSON.stringify(r.body), 150));
    continue;
  }
  const keys = Object.keys(r.body);
  console.log('ok   ' + pad(c.name, 12) + pad('HTTP 200', 10) + pad(r.bytes + ' bytes', 12) + keys.length + ' keys: ' + trim(keys.join(', '), 110));
  for(const k of keys) console.log('     ' + pad('', 12) + pad(k, 16) + shape(r.body[k]));
  const empty = thin(r.body);
  if(empty.length) console.log('     ' + pad('', 12) + 'nothing in: ' + trim(empty.join(', '), 160));
}
if(!only) console.log((list.length - failed) + ' ok, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
