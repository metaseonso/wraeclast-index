/* Wraeclast Index service worker: repeat visits paint straight from this browser's own copy of the site.

   worker/index.js writes the deploy's version id into BUILD when it serves this file, so every deploy is a new
   service worker with its own copy, and a page holds to the files of the deploy it was loaded with:
   - The pages (/, /explore, /privacy) and the site's files (assets/, data/, sprites/) come from the copy of the deploy
     the page was loaded with. A page from an older deploy, or from before this worker, gets the network, exactly as
     if there were no service worker.
   - The one thing it cannot hold to is a file that deploy never had. The older copy is deleted on activate and the
     server keeps one version of each path, so a module a newer deploy added reaches an older page new, and will not
     link against the app.js that page is already running. assets/app.js fetches every module it needs later through
     one helper, which knows that refusal from a file that never arrived and reloads the page once ("a module fetched
     when it is needed").
   - After a deploy, the next page load still opens instantly from the copy it has while the new deploy downloads in
     the background; the load after that is the new deploy.
   - Never from the copy: /api/*, the owner's dashboard, the crawler pages, and the live files the worker answers
     (market.json, leagues.json, rollprices.json, farmprices.json, bossprices.json): those follow their own cache rules
     (a few minutes).
   What a deploy downloads (sw-files.json, written by tools/build.mjs: every path the deploy serves with a hash of its
   bytes, and the home page's first-paint files):
   - On install: every file in the last copy whose bytes still hash to this deploy's entry is taken over from it, so
     an unchanged file is never downloaded twice. Then the pages and the home page's first-paint files (its CSS, the
     modules index.html preloads and what they import, the two fonts, the brand pictures) are downloaded if they were
     not taken over.
   - Everything else (the other tabs' modules, data, the drill-down page's data, sprites) is kept the first time a page
     of this deploy asks for it, and only when its bytes match this deploy's entry: a file the server already has from
     a newer deploy is used once and never kept, so the copy only ever holds this deploy's files.
   - No sw-files.json (it did not build, an older deploy): the old way, the whole list below fetched on install.
   Not stamped (the GitHub Pages backup, a local preview): it does nothing and removes itself.
   To switch it off everywhere: deploy a sw.js that only calls self.registration.unregister(). */
const BUILD = '__WI_BUILD__';
const OFF = BUILD.startsWith('__');
const COPY = 'wi-' + BUILD;
const META = 'wi-meta';   // which deploy each open page was loaded with
const LIST_FILE = 'sw-files.json';
const PAGES = {'/': './', '/index.html': './', '/explore': 'explore', '/privacy': 'privacy'};
const PAGE_KEYS = ['./', 'explore', 'privacy'];
// without sw-files.json: what a visit needs, fetched when a deploy's worker installs, and the drill-down page's data
// files read from that page (tools/sync.py names them)
const SHELL = ['./', 'explore', 'privacy',
  'assets/app.css', 'assets/cards.css', 'assets/theme.css', 'assets/look.css', 'assets/bridge.css',
  'assets/app.js', 'assets/kinds.js', 'assets/edges.js', 'assets/marks.js', 'assets/keys.js', 'assets/suggest.js', 'assets/notes.js',
  'assets/pins.js', 'assets/runs.js', 'assets/support.js', 'assets/track.js',
  'assets/league.js', 'assets/bridge.js', 'assets/build.js', 'assets/currency.js', 'assets/trade.js', 'assets/tradepage.js',
  'assets/basepool.js',
  'assets/farms.js', 'assets/atlas.js', 'assets/bosses.js', 'assets/craft.js', 'assets/map.js',
  'assets/engine.js', 'assets/craftsim.js', 'assets/bench.css',
  'assets/builder.js', 'assets/builder.css',
  'assets/fonts/cinzel-latin.woff2', 'assets/fonts/ibmplexsans-latin.woff2', 'assets/fonts/ibmplexmono-400-latin.woff2',
  'assets/fonts/ibmplexmono-500-latin.woff2', 'assets/fonts/ibmplexmono-600-latin.woff2',
  'assets/brand/logo-64.webp', 'assets/brand/logo-320.webp', 'assets/brand/wisp-b.webp', 'assets/brand/fog-bank.webp',
  'assets/brand/haze.webp', 'assets/brand/favicon-64.png', 'assets/brand/favicon-32.png', 'assets/brand/ninja.png',
  'data/index-core.json', 'data/index-rest.json', 'data/bosses.json', 'data/changelog.json', 'data/support.json'];
const OWN = /^\/(assets|data|sprites)\//;
const PASS = /^\/(api\/|admin|assets\/admin\.js|sw\.js|data\/(market|leagues|rollprices|farmprices|bossprices)\.json)/;
const NAMED = /^\/(data\/explore|assets\/fonts)\//;   // named by their content, or never changed: the browser's copy is fine
const pathOf = u => new URL(u, location).pathname;

self.addEventListener('install', e => {
  if(OFF) return self.skipWaiting();
  e.waitUntil((async () => {
    const kept = await copy();
    const man = await fetchList();
    if(man){
      try { await takeOver(kept, man.files); } catch {}
      await Promise.all([...PAGE_KEYS, ...man.shell].map(async u => { if(!(await kept.match(u))) await keep(kept, u, man.files); }));
      await kept.put(LIST_FILE, man.res);
      LIST = Promise.resolve(man.files);
    } else {
      await Promise.all(SHELL.map(u => keep(kept, u, null)));
      const page = await kept.match('explore');
      if(page){
        const files = new Set((await page.text()).match(/data\/explore\/[\w.-]+\.json/g) || []);
        await Promise.all([...files].map(u => keep(kept, u, null)));
      }
    }
    await self.skipWaiting();
  })());
});
// this deploy's sw-files.json, or null
async function fetchList(){
  try {
    const res = await fetch(new Request(LIST_FILE, {cache: 'no-cache'}));
    if(!res.ok || res.status !== 200) return null;
    const j = await res.clone().json();
    if(!j || j.v !== 1 || !j.files || typeof j.files !== 'object' || !Array.isArray(j.shell)) return null;
    return {files: j.files, shell: j.shell, res};
  } catch { return null; }
}
// the short hash tools/build.mjs writes: the first 8 bytes of the SHA-256, in hex
async function hashOf(res){
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await res.clone().arrayBuffer()));
  let s = '';
  for(let i = 0; i < 8; i++) s += d[i].toString(16).padStart(2, '0');
  return s;
}
// what this deploy's copy may keep at a path: null keeps anything (no list), otherwise the bytes must hash to its entry
// ('' for a path this deploy does not have: never kept)
const wanted = (files, path) => files ? files[path] || '' : null;
async function keepIf(kept, key, res, want){
  if(want !== null && await hashOf(res) !== want) return;
  await kept.put(key, res);
}
// every file of the older copies whose bytes are unchanged in this deploy, into this deploy's copy, six at a time
async function takeOver(kept, files){
  const jobs = [];
  for(const name of await caches.keys()){
    if(!name.startsWith('wi-') || name === COPY || name === META) continue;
    const old = await caches.open(name);
    for(const req of await old.keys()){
      const u = new URL(req.url);
      if(u.origin === location.origin && !u.search && files[u.pathname]) jobs.push([old, req, files[u.pathname]]);
    }
  }
  const run = async () => {
    for(let j; (j = jobs.shift()); ){
      const [old, req, want] = j;
      try {
        if(await kept.match(req)) continue;
        const res = await old.match(req);
        if(res && res.status === 200) await keepIf(kept, req, res, want);
      } catch {}
    }
  };
  await Promise.all([run(), run(), run(), run(), run(), run()]);
}
// one file into this deploy's copy, fresh from the site; one that fails is left for later. The pages are kept as
// they come: they are what the copy is for (and the edge may add to a page's bytes)
async function keep(kept, url, files){
  try {
    const path = pathOf(url);
    const res = await fetch(new Request(url, {cache: NAMED.test(path) ? 'default' : 'no-cache'}));
    if(res.ok && res.status === 200 && !res.redirected) await keepIf(kept, url, res, PAGES[path] ? null : wanted(files, path));
  } catch {}
}

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for(const k of await caches.keys()) if(k.startsWith('wi-') && (OFF || (k !== COPY && k !== META))) await caches.delete(k);
    if(OFF) return self.registration.unregister();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  if(OFF) return;
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== location.origin || PASS.test(url.pathname)) return;
  if(req.mode === 'navigate'){
    const key = PAGES[url.pathname];
    if(key) e.respondWith(page(e, key));
    return;
  }
  if(OWN.test(url.pathname)) e.respondWith(file(e, url.pathname));
});

let OPEN = null;
const copy = () => OPEN || (OPEN = caches.open(COPY));   // this deploy's copy, opened once per worker start
// the copy's sw-files.json entries (null: no list, keep as it comes), read once per worker start
let LIST = null;
function files(){
  return LIST || (LIST = (async () => {
    try { const r = await (await copy()).match(LIST_FILE); if(r) return (await r.json()).files || null; } catch {}
    return null;
  })());
}
async function page(e, key){
  const hit = await (await copy()).match(key);
  if(!hit) return fetch(e.request);   // not in the copy (yet): the network, and so are the page's files
  await remember(e.resultingClientId);
  e.waitUntil(save());
  return hit;
}
async function file(e, path){
  if(!(await ours(e.clientId))) return fetch(e.request);   // a page from another deploy: as if there were no worker
  const kept = await copy();
  const hit = await kept.match(e.request, {ignoreVary: true});
  if(hit) return hit;
  const res = await fetch(e.request);
  if(res.ok && res.status === 200 && res.type === 'basic'){
    const mine = res.clone();
    e.waitUntil(files().then(f => keepIf(kept, e.request, mine, wanted(f, path))).catch(() => {}));
  }
  return res;
}

/* the pages this deploy opened: {client id: [deploy, time]}, kept in META so a restarted worker still knows them */
let PAGELIST = null;
function list(){
  if(!PAGELIST) PAGELIST = (async () => {
    try { const r = await (await caches.open(META)).match('pages'); if(r) return new Map(Object.entries(await r.json())); } catch {}
    return new Map();
  })();
  return PAGELIST;
}
async function remember(id){ if(id) (await list()).set(id, [BUILD, Date.now()]); }
async function ours(id){ const p = id && (await list()).get(id); return !!p && p[0] === BUILD; }
let saving = null;
function save(){
  return saving || (saving = new Promise(r => setTimeout(r, 2000)).then(async () => {
    saving = null;
    const m = await list(), open = new Set((await self.clients.matchAll({includeUncontrolled: true})).map(c => c.id));
    for(const [id, [, t]] of m) if(!open.has(id) && Date.now() - t > 60000) m.delete(id);   // closed pages
    await (await caches.open(META)).put('pages', new Response(JSON.stringify(Object.fromEntries(m)), {headers: {'Content-Type': 'application/json'}}));
  }).catch(() => { saving = null; }));
}
