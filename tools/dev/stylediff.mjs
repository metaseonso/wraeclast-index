/* Does a stylesheet change draw the same page? Two sites, the same pages, every element's computed style compared.

     node tools/dev/stylediff.mjs <before origin> <after origin>              the pages below, at 1440 and 375
     node tools/dev/stylediff.mjs <before> <after> --pages /,/#/craft          only these
     node tools/dev/stylediff.mjs <before> <after> --width 1440               one width
     node tools/dev/stylediff.mjs <before> <after> --json out.json            every difference, as JSON
     node tools/dev/stylediff.mjs <before> <after> --card                     open the first card on each page too

   What it reads: for every element on the page (by its place in the tree: tag, class and index under its parent),
   the properties that paint it and lay it out, below (PROPS). Not its size: a price one character longer moves
   nothing a sheet decides. An element mid-animation is read without what is moving, and a URL in a value is
   read without its origin, so the two sites compare as sheets, not as moments. Both sites should serve the sheets
   the same way (both from tools/dev/serve.mjs, say: a minified sheet serialises a gradient differently from its
   source, and that reads as a difference that is not one). A page is a page on both sites with the same data, so the trees match; an element on one
   side only is said once and skipped.
   What it says: per page and width, how many elements were compared and how many differ, then every difference as
   selector · property · before → after, the most repeated first. Exit 1 on any difference, so a CSS stage that
   means to change nothing a player sees is held to it; a stage that means to change something names what the tool
   lists. Headless Chrome, a fresh profile per side, CPU not slowed. Writes nothing but --json. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const [A, B] = args.filter(a => /^https?:/.test(a)).map(a => a.replace(/\/$/, ''));
if(!A || !B){ console.error('stylediff.mjs <before origin> <after origin> [--pages a,b] [--width N] [--card] [--json file]'); process.exit(2); }
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const PAGES = arg('--pages', '/,/#/?q=fire,/#/?k=c,/#/currency,/#/craft?base=Stellar+Amulet,/#/atlas,/#/bosses,/#/patches,/#/runes,/#/market,/#/start,/#/campaign,/#/trade,/#/map,/#/data,/explore#gems,/explore#tree,/privacy').split(',');
const WIDTHS = arg('--width', '') ? [+arg('--width')] : [1440, 375];
const CARD = args.includes('--card'), JSON_OUT = arg('--json', '');
const WAIT = +arg('--wait', 3000);
const PROPS = ['color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  'border-top-width', 'border-bottom-width', 'border-left-width', 'border-right-width', 'border-top-style', 'border-image-source', 'border-radius',
  'box-shadow', 'text-shadow', 'outline-color', 'outline-width', 'opacity', 'filter', 'backdrop-filter', 'mix-blend-mode',
  'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height', 'text-transform', 'text-decoration-line',
  'display', 'position', 'visibility', 'overflow-x', 'overflow-y', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'margin-top', 'margin-bottom', 'gap',   // not the side margins: an auto margin resolves to the pixels of the moment 'flex-direction', 'flex-wrap', 'align-items', 'justify-content',
  'grid-template-columns', 'transition-property', 'transition-duration', 'transition-timing-function', 'animation-name', 'animation-duration',
  'transform', 'translate', 'rotate', 'scale', 'cursor', 'content'];

const wait = ms => new Promise(r => setTimeout(r, ms));
function chromePaths(){
  const env = [process.env.CHROME, process.env.CHROME_PATH].filter(Boolean);
  if(process.platform === 'win32') return [...env, 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe', (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'];
  if(process.platform === 'darwin') return [...env, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'];
  return [...env, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
}
async function findChrome(){
  const { access } = await import('node:fs/promises');
  for(const p of chromePaths()){ if(!p) continue; try { await access(p); return p; } catch {} }
  return null;
}
function cdp(ws){
  let n = 0;
  const waits = new Map(), on = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if(m.id && waits.has(m.id)){ const w = waits.get(m.id); waits.delete(m.id); m.error ? w.bad(new Error(m.error.message)) : w.ok(m.result); }
    else if(m.method) for(const f of on.get(m.method) || []) f(m.params);
  });
  return {
    send: (method, params = {}) => new Promise((ok, bad) => { const id = ++n; waits.set(id, {ok, bad}); ws.send(JSON.stringify({id, method, params})); }),
    on: (method, f) => { if(!on.has(method)) on.set(method, []); on.get(method).push(f); },
    close: () => ws.close(),
  };
}
async function open(u){
  const ws = new WebSocket(u);
  await new Promise((ok, bad) => { ws.addEventListener('open', ok, {once: true}); ws.addEventListener('error', bad, {once: true}); });
  return cdp(ws);
}
async function withChrome(fn){
  const chrome = await findChrome();
  if(!chrome) throw new Error('no Chrome found; set CHROME=<full path to chrome.exe>');
  const dir = await mkdtemp(join(tmpdir(), 'wi-stylediff-'));
  const proc = spawn(chrome, ['--headless=new', '--remote-debugging-port=0', '--user-data-dir=' + dir, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--hide-scrollbars', 'about:blank'], {stdio: ['ignore', 'ignore', 'pipe']});
  try {
    const port = await new Promise((ok, no) => {
      let buf = '';
      const t = setTimeout(() => no(new Error('Chrome did not open a debugging port in 20s')), 20000);
      proc.stderr.on('data', d => { buf += d; const m = buf.match(/ws:\/\/127\.0\.0\.1:(\d+)\//); if(m){ clearTimeout(t); ok(+m[1]); } });
      proc.on('exit', c => { clearTimeout(t); no(new Error('Chrome closed (' + c + ')')); });
    });
    const ver = await (await fetch('http://127.0.0.1:' + port + '/json/version')).json();
    const browser = await open(ver.webSocketDebuggerUrl);
    const {targetId} = await browser.send('Target.createTarget', {url: 'about:blank'});
    const page = await open('ws://127.0.0.1:' + port + '/devtools/page/' + targetId);
    await page.send('Page.enable'); await page.send('Runtime.enable');
    const out = await fn(page);
    page.close(); browser.close();
    return out;
  } finally {
    proc.kill();
    await wait(300);
    await rm(dir, {recursive: true, force: true}).catch(() => {});
  }
}
async function evalJS(page, expression){
  const r = await page.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
// every element's place and the properties that paint it, read on the page
const READ = `(() => {
  const UNSEEN = /^(STYLE|SCRIPT|LINK|META|TEMPLATE|NOSCRIPT)$/;
  const PROPS = ${JSON.stringify(PROPS)}, MOVING = ['opacity', 'transform', 'translate', 'rotate', 'scale', 'filter'];
  const out = {};
  const path = el => {
    const parts = [];
    for(let e = el; e && e.nodeType === 1 && e !== document.documentElement; e = e.parentElement){
      let i = 0; for(let s = e.previousElementSibling; s; s = s.previousElementSibling) if(!UNSEEN.test(s.tagName)) i++;   // a style or script moved is no change to what is drawn
      parts.unshift(e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\\s+/).slice(0, 3).join('.') : '') + '[' + i + ']');
    }
    return parts.join('>');
  };
  const all = document.querySelectorAll('body *');
  let n = 0;
  for(const el of all){
    if(UNSEEN.test(el.tagName)) continue;
    if(n++ > 6000) break;
    const cs = getComputedStyle(el), o = {};
    // an element mid-animation (the fog, the wisp, a glide) is read without the properties that are moving
    const moving = el.getAnimations({subtree: true}).some(a => a.effect && a.effect.target === el);   // its own, or its ::before/::after
    for(const p of PROPS){ if(moving && MOVING.includes(p)) continue; o[p] = cs.getPropertyValue(p).replace(/https?:[/][/][^"')/]+/g, ''); }
    const b = getComputedStyle(el, '::before'), a = getComputedStyle(el, '::after');
    if(b.content && b.content !== 'none') for(const p of ['background-image', 'box-shadow', 'border-top-color', 'opacity', 'background-color']) if(!(moving && MOVING.includes(p))) o['::before ' + p] = b.getPropertyValue(p).replace(/https?:[/][/][^"')/]+/g, '');
    if(a.content && a.content !== 'none') for(const p of ['background-image', 'box-shadow', 'border-top-color', 'opacity', 'background-color']) if(!(moving && MOVING.includes(p))) o['::after ' + p] = a.getPropertyValue(p).replace(/https?:[/][/][^"')/]+/g, '');
    out[path(el)] = o;
  }
  return out;
})()`;
async function snapshot(origin, pageUrl, width){
  return withChrome(async page => {
    await page.send('Emulation.setDeviceMetricsOverride', {width, height: width < 700 ? 812 : 900, deviceScaleFactor: 1, mobile: width < 700});
    const loaded = new Promise(ok => page.on('Page.loadEventFired', ok));
    await page.send('Page.navigate', {url: origin + pageUrl});
    await Promise.race([loaded, wait(30000)]);
    // the page is read once it has stopped growing: the same count of elements for 1.5 s (a search's cards, a tab's
    // rows), and never before WAIT ms, never after 20 s
    await wait(WAIT);
    let last = -1, same = 0;
    for(const end = Date.now() + 20000; Date.now() < end && same < 3; ){
      const n = await evalJS(page, 'document.getElementsByTagName("*").length');
      same = n === last ? same + 1 : 0; last = n;
      await wait(500);
    }
    if(CARD){ await evalJS(page, `(() => { const c = document.querySelector('.cards .card, .bo-row, .cx-row'); if(c) c.click(); return !!c; })()`); await wait(2500); }
    return evalJS(page, READ);
  });
}
const report = {before: A, after: B, pages: []};
let total = 0, differing = 0;
const byRule = new Map();
for(const pageUrl of PAGES) for(const width of WIDTHS){
  const [a, b] = await Promise.all([snapshot(A, pageUrl, width), snapshot(B, pageUrl, width)]);
  let compared = 0, diff = 0, only = 0;
  const diffs = [];
  for(const [k, va] of Object.entries(a)){
    const vb = b[k];
    if(!vb){ only++; continue; }
    compared++;
    let bad = false;
    for(const p of Object.keys(va)) if(va[p] !== (vb[p] ?? '')){
      bad = true;
      const sel = k.split('>').pop().replace(/\[\d+\]$/, '');
      const key = sel + ' · ' + p + ' · ' + va[p] + ' → ' + vb[p];
      byRule.set(key, (byRule.get(key) || 0) + 1);
      diffs.push({at: k, prop: p, before: va[p], after: vb[p]});
    }
    if(bad) diff++;
  }
  total += compared; differing += diff;
  report.pages.push({page: pageUrl, width, compared, differing: diff, onlyBefore: only, onlyAfter: Object.keys(b).length - compared, diffs});
  console.log((pageUrl + ' @' + width).padEnd(40) + compared + ' elements compared, ' + diff + ' differ' + (only ? ', ' + only + ' only before' : ''));
}
const rules = [...byRule.entries()].sort((x, y) => y[1] - x[1]);
console.log('\n' + total + ' elements compared over ' + report.pages.length + ' pages, ' + differing + ' differ, ' + rules.length + ' distinct differences');
for(const [k, n] of rules.slice(0, 60)) console.log('  ' + String(n).padStart(4) + '  ' + k.slice(0, 220));
if(rules.length > 60) console.log('  ... and ' + (rules.length - 60) + ' more (--json for all)');
if(JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(report, null, 1));
process.exit(differing ? 1 : 0);
