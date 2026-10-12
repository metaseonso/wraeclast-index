/* The site from this worktree, in a browser, for looking at a change before it is pushed.

     node tools/dev/serve.mjs                 http://127.0.0.1:8788
     node tools/dev/serve.mjs --port 8000     another port
     node tools/dev/serve.mjs --live <origin> where the worker's paths are answered from (default https://wraeclastindex.fyi)
     node tools/dev/serve.mjs --no-live       the worker's paths answer 404: the page falls back to its last good prices

   The same files tools/dev/guard.mjs serves its checks from: the repo's own files, then dist/ (the crawler's pages,
   when built), "/" is index.html and "/explore" is explore.html. The paths only the Cloudflare worker answers
   (/data/market.json, /data/market/*, the price files, /api/*) are fetched from the live site and passed through, so a
   card here has today's prices and the top bar's stamp reads as it does live. sw.js is served as it is in the repo,
   unstamped, so it switches itself off and the page is always this worktree's files. Nothing is written anywhere.

   tools/dev/speed.mjs takes this address (node tools/dev/speed.mjs http://127.0.0.1:8788). */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const DIST = join(ROOT, 'dist');
const args = process.argv.slice(2);
const arg = (name, dflt) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; };
const PORT = +arg('--port', 8788);
const LIVE = args.includes('--no-live') ? '' : arg('--live', 'https://wraeclastindex.fyi').replace(/\/$/, '');
// the worker's own paths (wrangler.jsonc run_worker_first), less /search, which worker/seo.js answers by redirecting into the app
const WORKER = /^\/(data\/market\.json|data\/market\/|data\/(rollprices|farmprices|bossprices)\.json|api\/)/;
const TYPES = {html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8',
  xml: 'application/xml', svg: 'image/svg+xml', png: 'image/png', webp: 'image/webp', woff2: 'font/woff2',
  ico: 'image/x-icon', jpg: 'image/jpeg', avif: 'image/avif', md: 'text/markdown; charset=utf-8'};

async function file(path){
  if(path.includes('..')) return {status: 400, body: 'no', type: TYPES.txt};
  const tries = path === '/' ? ['/index.html'] : [path, path + '.html', path + '/index.html'];
  for(const dir of [ROOT, DIST]) for(const t of tries){
    let body;
    try { body = await readFile(join(dir, t)); } catch { continue; }
    const ext = (t.match(/\.(\w+)$/) || [])[1] || '';
    return {status: 200, body, type: TYPES[ext] || 'application/octet-stream'};
  }
  try { return {status: 404, body: await readFile(join(DIST, '404.html')), type: TYPES.html}; } catch {}
  return {status: 404, body: 'Not found', type: TYPES.txt};
}
/* A good answer is kept 5 minutes, as the worker's own data centres keep it: a check that opens forty pages asks the live
   worker once per path, not forty times, and never runs it into its cap per address (120 a minute, docs/budget.md). */
const KEPT = new Map(), KEEP = 300000;
async function live(url, req){
  if(!LIVE) return {status: 404, body: '{"error":"no worker here (serve.mjs --no-live)"}', type: TYPES.json};
  const key = req.method + ' ' + url.pathname + url.search, had = KEPT.get(key);
  if(had && Date.now() - had.at < KEEP) return had.r;
  try {
    const r = await fetch(LIVE + url.pathname + url.search, {method: req.method, headers: {'User-Agent': 'wraeclast-index serve.mjs'}});
    const headers = {};
    for(const h of ['content-type', 'cache-control', 'x-wi-last']) if(r.headers.get(h)) headers[h] = r.headers.get(h);
    const out = {status: r.status, body: Buffer.from(await r.arrayBuffer()), headers};
    if(req.method === 'GET' && r.status === 200) KEPT.set(key, {at: Date.now(), r: out});
    return out;
  } catch(e){ return {status: 502, body: 'live site: ' + (e && e.message), type: TYPES.txt}; }
}
const srv = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const path = decodeURIComponent(url.pathname);
  let r;
  try { r = WORKER.test(path) ? await live(url, req) : await file(path); }
  catch(e){ r = {status: 500, body: 'serve: ' + (e && e.message), type: TYPES.txt}; }
  res.writeHead(r.status, r.headers || {'Content-Type': r.type, 'Cache-Control': 'no-store'});
  res.end(r.body);
});
srv.listen(PORT, '127.0.0.1', () => console.log('http://127.0.0.1:' + PORT + (LIVE ? '  (prices and /api from ' + LIVE + ')' : '  (no worker paths)')));
