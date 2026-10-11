/* A screenshot of a page, for a preview PR's design/previews/<branch>/ (docs/migration.md, "preview").

     node tools/dev/shot.mjs <url> <out.png>                 1440x900
     node tools/dev/shot.mjs <url> <out.png> --phone         375x812, touch, a phone's user agent
     node tools/dev/shot.mjs <url> <out.png> --width 700     any width (height 900)
     node tools/dev/shot.mjs <url> <out.png> --wait 4000     ms after load before the shot (default 3000)
     node tools/dev/shot.mjs <url> <out.png> --full          the whole page, not the first screen

   Headless Chrome, a fresh profile, no service worker, no cache: what a first visit paints. Needs Chrome
   (CHROME=<path> if it is somewhere odd). Writes the one file it is asked for. */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

const args = process.argv.slice(2);
const url = args.find(a => /^https?:/.test(a)), out = args.find(a => /\.png$/i.test(a));
if(!url || !out){ console.error('shot.mjs <url> <out.png> [--phone | --width N] [--wait ms] [--full]'); process.exit(2); }
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? +args[i + 1] : dflt; };
const PHONE = args.includes('--phone'), FULL = args.includes('--full');
const W = PHONE ? 375 : arg('--width', 1440), H = PHONE ? 812 : 900, WAIT = arg('--wait', 3000);
const UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 6a) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

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

const chrome = await findChrome();
if(!chrome){ console.error('no Chrome found; set CHROME=<full path to chrome.exe>'); process.exit(2); }
const dir = await mkdtemp(join(tmpdir(), 'wi-shot-'));
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
  await page.send('Page.enable');
  await page.send('Emulation.setDeviceMetricsOverride', {width: W, height: H, deviceScaleFactor: PHONE ? 2 : 1, mobile: PHONE});
  if(PHONE){
    await page.send('Emulation.setUserAgentOverride', {userAgent: UA});
    await page.send('Emulation.setTouchEmulationEnabled', {enabled: true, maxTouchPoints: 5});
  }
  const loaded = new Promise(ok => page.on('Page.loadEventFired', ok));
  await page.send('Page.navigate', {url});
  await Promise.race([loaded, wait(30000)]);
  await wait(WAIT);
  const shot = await page.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: FULL, ...(FULL ? {clip: undefined} : {})});
  await mkdir(dirname(out), {recursive: true});
  await writeFile(out, Buffer.from(shot.data, 'base64'));
  console.log(out + '  ' + W + 'x' + H + (FULL ? ' (whole page)' : '') + '  ' + url);
  page.close(); browser.close();
} finally {
  proc.kill();
  await wait(300);
  await rm(dir, {recursive: true, force: true}).catch(() => {});
}
