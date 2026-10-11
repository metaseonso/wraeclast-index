/* The search protocol, held: the page and the worker agree with assets/search/protocol.js.

     node tools/dev/protocol.mjs            say what each side does, exit non-zero where they disagree
     node tools/dev/protocol.mjs --check    the same, one line

   Read out of the code, never run:
     the page      every ask('<op>', {...}) in assets/app.js: the op must be in the table, and every field in the
                   object it sends must be one the op asks for. Where the answer is read on the spot,
                   (await ask('<op>', ...)).<field>, the field must be one the op answers
     the worker    every op in the table has a handler in assets/searchworker.js OPS, keyed by OP.<op>, the worker
                   handles no op the table does not have, and never tests m.op against a string of its own
   A field read off an answer held in a variable (const r = await ask(...); r.keys) is not followed: the table
   says what an answer carries, and the worker's own return lines are the other half. */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CHECK = process.argv.includes('--check');

// the fields of an object literal, split at the commas that are its own (not one inside a call or a nested object)
function fields(body){
  const out = [];
  let d = 0, cur = '';
  for(const c of body){
    if('([{'.includes(c)) d++;
    else if(')]}'.includes(c)) d--;
    if(c === ',' && d === 0){ out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map(f => f.trim()).filter(Boolean).map(f => f.includes(':') ? f.slice(0, f.indexOf(':')).trim() : f);
}

export async function checkProtocol(){
  const { PROTOCOL } = await import(pathToFileURL(join(ROOT, 'assets', 'search', 'protocol.js')).href);
  const page = await readFile(join(ROOT, 'assets', 'app.js'), 'utf8');
  const worker = await readFile(join(ROOT, 'assets', 'searchworker.js'), 'utf8');
  const bad = [], sent = {};
  // the page: ask('<op>', {k: v, ...}) and ask('<op>'), the object literal read to its own closing brace
  for(const m of page.matchAll(/(?<![.\w])ask\(\s*'(\w+)'/g)){
    const op = m[1], spec = PROTOCOL[op];
    sent[op] = (sent[op] || 0) + 1;
    if(!spec){ bad.push('the page asks "' + op + '", which the table does not have'); continue; }
    let i = m.index + m[0].length, body = '';
    const rest = page.slice(i);
    const obj = rest.match(/^\s*,\s*\{/);
    if(obj){
      let d = 0, j = obj[0].length - 1;
      for(; j < rest.length; j++){ if(rest[j] === '{') d++; else if(rest[j] === '}' && --d === 0) break; }
      body = rest.slice(obj[0].length, j);
      i += j + 1;
    }
    for(const name of fields(body)){
      if(/^\.\.\./.test(name)) continue;   // a spread: not followed
      if(!spec.ask.includes(name)) bad.push('the page sends "' + name + '" with ' + op + ', which the table does not ask for');
    }
    // the answer read on the spot: (await ask(...)).field
    const after = page.slice(i).match(/^\s*\)\s*\)\.(\w+)/);
    if(after && page.slice(m.index - 7, m.index) === '(await ' && !spec.answer.includes(after[1]))
      bad.push('the page reads "' + after[1] + '" off the answer to ' + op + ', which the table does not answer with');
  }
  // an ask whose op is not a name from the table (the helper's own definition aside)
  for(const m of page.matchAll(/(?<![.\w])ask\(\s*([^'\s)][^,)]*)/g))
    if(!/function ask\($/.test(page.slice(Math.max(0, m.index - 9), m.index + 4)))
      bad.push('the page asks with something that is not a name from the table: ask(' + m[1].trim() + ')');
  // the worker: const OPS = { [OP.x]: ..., } and nothing keyed by a bare word
  const block = worker.match(/const OPS = \{([\s\S]*?)\n\};/);
  const handled = new Set();
  if(!block) bad.push('the worker has no OPS table');
  else {
    for(const m of block[1].matchAll(/^  \[OP\.(\w+)\]/gm)) handled.add(m[1]);
    for(const m of block[1].matchAll(/^  (?:async\s+)?(\w+)\s*(?:\(|:)/gm)) bad.push('the worker answers "' + m[1] + '" by a bare name, not OP.' + m[1]);
    for(const op of handled) if(!PROTOCOL[op]) bad.push('the worker answers "' + op + '", which the table does not have');
    for(const op of Object.keys(PROTOCOL)) if(!handled.has(op)) bad.push('the worker does not answer "' + op + '"');
  }
  for(const m of worker.matchAll(/m\.op\s*[!=]==?\s*'(\w+)'/g)) bad.push('the worker tests m.op against the string "' + m[1] + '", not OP.' + m[1]);
  const said = Object.keys(PROTOCOL).length + ' ops in the table, ' + Object.keys(sent).length + ' asked by the page, ' + handled.size + ' answered by the worker';
  return {bad, said};
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const r = await checkProtocol();
  if(CHECK) console.log((r.bad.length ? 'FAIL protocol ' : 'ok   protocol ') + (r.bad.length ? r.bad.join(' | ') : r.said));
  else { console.log(r.said); for(const b of r.bad) console.log('  ' + b); }
  process.exit(r.bad.length ? 1 : 0);
}
