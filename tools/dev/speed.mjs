/* How the site runs on a slow machine: headless Chrome with the CPU slowed 4x, and the numbers a weak laptop feels.

     node tools/dev/speed.mjs                 against https://wraeclastindex.fyi
     node tools/dev/speed.mjs http://host     against any other address (a local guard or wrangler dev server)
     node tools/dev/speed.mjs --json          the numbers as JSON, for keeping a before and an after
     node tools/dev/speed.mjs --budget        exit non-zero when a number is over its budget (BUDGET below)

   What it reads, one fresh browser profile per page so no service worker or cache helps:
     home    JSON the page parsed before anyone types, page elements, JS heap, and 5 idle seconds:
             main-thread busy time, style recalcs and layouts (a page at rest should do almost nothing)
     typing  "fireball" typed a key every 60 ms: main-thread busy time while typing, the longest frame,
             then the animations still running once the search has docked the hero (should be none)
     tabs    every tab visited once, then home again: page elements and JS heap left behind
     explore /explore#tree: JSON parsed before the first row, time to the first row, elements, heap

   Nothing is written anywhere; it only reads the site. Needs Chrome (CHROME=<path> if it is somewhere odd). */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const SITE = (args.find(a => /^https?:/.test(a)) || 'https://wraeclastindex.fyi').replace(/\/$/, '');
const AS_JSON = args.includes('--json'), BUDGETED = args.includes('--budget');
const SLOW = 4;   // CPU slowdown: a fast desktop at 4x is roughly a cheap laptop
const TABS = ['currency', 'trade', 'craft', 'atlas', 'bosses', 'map'];
// the numbers a change must not push past (4x slower CPU, 1280x800, fresh profile)
const BUDGET = {
  'home.jsonKB': 700,          // before anyone types: prices and the page, not the index
  'home.idleBusyMs': 400,      // 5 seconds doing nothing
  'typing.busyMs': 1500,       // eight keys
  'typing.running': 0,         // animations left running once the hero has docked
  'tabs.elements': 3000,       // after every tab and back home
  'explore.jsonKB': 3000,      // before the tree's first row
};

const wait = ms => new Promise(r => setTimeout(r, ms));
function chromePaths(){
  const env = [process.env.CHROME, process.env.CHROME_PATH].filter(Boolean);
  if(process.platform === 'win32') return [...env,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe'];
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
async function open(url){
  const ws = new WebSocket(url);
  await new Promise((ok, bad) => { ws.addEventListener('open', ok, {once: true}); ws.addEventListener('error', bad, {once: true}); });
  return cdp(ws);
}
async function evalJS(page, expression){
  const r = await page.send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if(r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}
async function until(page, expression, ms = 30000){
  for(const end = Date.now() + ms; Date.now() < end; ){
    if(await evalJS(page, '(() => { try { return !!(' + expression + '); } catch(e){ return false; } })()')) return true;
    await wait(100);
  }
  return false;
}
async function metrics(page){
  const {metrics} = await page.send('Performance.getMetrics');
  return Object.fromEntries(metrics.map(m => [m.name, m.value]));
}
// one fresh Chrome per page: nothing cached, no service worker from an earlier page
async function withChrome(fn){
  const chrome = await findChrome();
  if(!chrome) throw new Error('no Chrome found; set CHROME=<full path to chrome.exe>');
  const dir = await mkdtemp(join(tmpdir(), 'wi-speed-'));
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
    await page.send('Page.enable'); await page.send('Runtime.enable'); await page.send('Performance.enable');
    await page.send('Emulation.setDeviceMetricsOverride', {width: 1280, height: 800, deviceScaleFactor: 1, mobile: false});
    await page.send('Emulation.setCPUThrottlingRate', {rate: SLOW});
    const out = await fn(page);
    page.close(); browser.close();
    return out;
  } finally {
    proc.kill();
    await wait(300);
    await rm(dir, {recursive: true, force: true}).catch(() => {});
  }
}
async function go(page, url){
  const loaded = new Promise(ok => page.on('Page.loadEventFired', ok));
  await page.send('Page.navigate', {url});
  await Promise.race([loaded, wait(30000)]);
}
// what the page has parsed as JSON so far, and what it holds
const JSONKB = `Math.round(performance.getEntriesByType('resource').filter(e => /\\.json/.test(e.name)).reduce((a, e) => a + e.decodedBodySize, 0) / 1024)`;
const ELEMENTS = `document.getElementsByTagName('*').length`;
async function heapMB(page){
  await page.send('HeapProfiler.collectGarbage').catch(() => {});
  const {usedSize} = await page.send('Runtime.getHeapUsage');
  return Math.round(usedSize / 1048576);
}
const RUNNING = `document.getAnimations().filter(a => a.playState === 'running' && a.effect && a.effect.getTiming().iterations === Infinity).length`;

async function home(){
  return withChrome(async page => {
    await go(page, SITE + '/');
    await until(page, `document.getElementById('q')`);
    await wait(3000);
    const before = await metrics(page);
    await wait(5000);
    const after = await metrics(page);
    return {
      jsonKB: await evalJS(page, JSONKB),
      elements: await evalJS(page, ELEMENTS),
      heapMB: await heapMB(page),
      running: await evalJS(page, RUNNING),
      idleBusyMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000),
      idleLayouts: after.LayoutCount - before.LayoutCount,
      idleStyles: after.RecalcStyleCount - before.RecalcStyleCount,
    };
  });
}
async function typing(){
  return withChrome(async page => {
    await go(page, SITE + '/');
    await until(page, `document.getElementById('q')`);
    await wait(3000);
    await evalJS(page, `document.getElementById('q').focus()`);
    // the index loads when the box is used: give it the time a player takes to start typing
    await wait(2500);
    await evalJS(page, `window.__lf = []; new PerformanceObserver(l => l.getEntries().forEach(e => __lf.push(e.duration))).observe({type: 'long-animation-frame'})`);
    const before = await metrics(page);
    for(const ch of 'fireball'){
      await page.send('Input.dispatchKeyEvent', {type: 'keyDown', text: ch, key: ch});
      await page.send('Input.dispatchKeyEvent', {type: 'keyUp', key: ch});
      await wait(60);
    }
    await until(page, `document.querySelectorAll('#cards .card').length`, 15000);
    await wait(1500);
    const after = await metrics(page);
    return {
      busyMs: Math.round((after.TaskDuration - before.TaskDuration) * 1000),
      longestFrameMs: Math.round(await evalJS(page, `Math.max(0, ...__lf)`)),
      cards: await evalJS(page, `document.querySelectorAll('#cards .card').length`),
      running: await evalJS(page, RUNNING),
    };
  });
}
async function tabs(){
  return withChrome(async page => {
    await go(page, SITE + '/');
    await until(page, `document.getElementById('q')`);
    for(const t of TABS){
      await evalJS(page, `location.hash = '#/${t}'`);
      await wait(4000);
    }
    await evalJS(page, `location.hash = '#/'`);
    await wait(2000);
    return {elements: await evalJS(page, ELEMENTS), heapMB: await heapMB(page)};
  });
}
async function explore(){
  return withChrome(async page => {
    const t0 = Date.now();
    await go(page, SITE + '/explore#tree');
    const ok = await until(page, `document.querySelector('#ttbody tr')`, 60000);
    const firstRowMs = ok ? Date.now() - t0 : null;
    const jsonKB = await evalJS(page, JSONKB);
    await wait(4000);
    return {firstRowMs, jsonKB, jsonKBafter4s: await evalJS(page, JSONKB), elements: await evalJS(page, ELEMENTS), heapMB: await heapMB(page)};
  });
}

const out = {site: SITE, cpu: SLOW + 'x slower', at: new Date().toISOString()};
for(const [name, fn] of [['home', home], ['typing', typing], ['tabs', tabs], ['explore', explore]]){
  try { out[name] = await fn(); } catch(e){ out[name] = {error: e.message}; }
}
const over = [];
for(const [key, cap] of Object.entries(BUDGET)){
  const [a, b] = key.split('.');
  const v = out[a] && out[a][b];
  if(typeof v === 'number' && v > cap) over.push(key + ' ' + v + ' > ' + cap);
}
if(AS_JSON) console.log(JSON.stringify(out, null, 1));
else {
  console.log(out.site + ' · CPU ' + out.cpu);
  for(const k of ['home', 'typing', 'tabs', 'explore'])
    console.log(k.padEnd(8) + Object.entries(out[k]).map(([a, b]) => a + ' ' + b).join(' · '));
  console.log(over.length ? 'over budget: ' + over.join('; ') : 'within budget');
}
if(BUDGETED && over.length) process.exit(1);
