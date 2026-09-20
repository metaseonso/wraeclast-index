/* Check every Cloudflare query the owner's dashboard uses, against the real API, one block at a time.
   The blocks come from worker/cfstats.js itself, so this checks what the dashboard really asks for.

     PowerShell:  $env:CF_ANALYTICS_TOKEN = '<read-only stats key>'; node tools/dev/cfcheck.mjs 7
     bash:        CF_ANALYTICS_TOKEN=... node tools/dev/cfcheck.mjs 7

   One line per block: rows back and the fields they carry, or Cloudflare's own error.
   Nothing is written and no key is kept here. */
import { checks } from '../../worker/cfstats.js';

const TOKEN = process.env.CF_ANALYTICS_TOKEN;
if(!TOKEN){
  console.error('Set CF_ANALYTICS_TOKEN first: the read-only stats key (Account Analytics read + Zone Analytics read).');
  process.exit(1);
}
const days = [1, 7, 30].includes(+process.argv[2]) ? +process.argv[2] : 7;
const AT_ONCE = 4;

async function ask(c){
  let r, j;
  try {
    r = await fetch('https://api.cloudflare.com/client/v4/graphql', {method: 'POST',
      headers: {Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json'},
      body: JSON.stringify({query: c.query, variables: c.variables})});
    j = await r.json();
  } catch(e){ return {bad: 'could not reach Cloudflare: ' + (e.message || e)}; }
  if(j.errors && j.errors.length) return {bad: j.errors.map(e => e.message).join(' | ')};
  const box = ((j.data && j.data.viewer && j.data.viewer[c.root]) || [])[0];
  if(!box) return {bad: 'HTTP ' + r.status + ': no ' + c.root + ' came back (is the key allowed to read them?)'};
  return Array.isArray(box[c.name]) ? {rows: box[c.name]} : {bad: 'nothing under ' + c.name};
}
/* the field names one of these rows carries */
function fields(rows){
  const keys = new Set();
  for(const row of rows.slice(0, 5)){
    for(const part of ['dimensions', 'sum', 'uniq', 'quantiles', 'avg'])
      for(const k of Object.keys(row[part] || {})) keys.add(k);
  }
  return [...keys];
}
const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
const trim = (s, n) => String(s).replace(/\s+/g, ' ').slice(0, n);

const list = checks(days);
console.log('cfcheck · ' + days + ' day' + (days === 1 ? '' : 's') + ' · ' + list.length + ' blocks');
const missing = [], empty = [];
for(let i = 0; i < list.length; i += AT_ONCE){
  const some = list.slice(i, i + AT_ONCE);
  const out = await Promise.all(some.map(ask));
  some.forEach((c, k) => {
    const r = out[k];
    if(r.bad){
      missing.push(c.name);
      console.log('FAIL ' + pad(c.name, 14) + ' ' + trim(r.bad, 150));
      return;
    }
    if(!r.rows.length) empty.push(c.name);
    console.log('ok   ' + pad(c.name, 14) + pad(r.rows.length + ' rows', 10) + trim(fields(r.rows).join(', '), 110));
  });
}
console.log((list.length - missing.length) + ' ok, ' + missing.length + ' failed' + (missing.length ? ': ' + missing.join(', ') : '') +
  (empty.length ? ' · no rows yet: ' + empty.join(', ') : ''));
