/* Where the data comes from: Wraeclast Index's own public files, over HTTPS, and nothing else.

   What it may read (ALLOWED): the manifest and the index files it names, the price file's live part, the daily
   market files, the patch registry, GGG's patch-note lines as the site keeps them, and the site's own patch notes.
   Every other path is refused before a request is made.

   How long a copy is kept (ttlOf), in memory and on disk in the OS cache folder:
     files named by their content (data/seo/x.<hash>.json)   until the manifest no longer names them (prune)
     data/market.json?part=live                              5 minutes, as the site's own cache
     the manifest                                            10 minutes
     data/market/*, the patch files, the site's notes        1 hour
   A copy past its time is still used when the site does not answer: every price in it carries its own age.

   How often it asks: one request at a time, never two within a second (GAP), and never more than PER_MINUTE in
   any 60 seconds, under the site's cap of 120 a minute per address. Every request says who it is (USER_AGENT). */
import { mkdir, readFile, writeFile, rename, readdir, rm } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const VERSION = JSON.parse(readFileSync(join(HERE, '..', 'package.json'), 'utf8')).version;
export const SITE = 'https://wraeclastindex.fyi';
export const USER_AGENT = 'wraeclast-index-mcp/' + VERSION + ' (+https://wraeclastindex.fyi/#/data)';
export const GAP = 1000;          // ms between two requests, at least
export const PER_MINUTE = 60;     // requests in any 60 s, at most (the site's cap: 120)

const MIN = 60e3, HOUR = 3600e3;
export const LIVE = 'data/market.json?part=live';
const NAMED = /^data\/(?:cards|search|seo)\/[A-Za-z0-9_/-]+\.[0-9a-f]{10}\.(?:json|txt)$/;   // named by content
const ALLOWED = [
  /^data\/manifest\.json$/,
  NAMED,
  /^data\/market\.json\?part=live$/,
  /^data\/market\/[a-z0-9][a-z0-9.-]*\.json$/,
  /^data\/(?:changelog|patches|patchnotes)\.json$/,
];
export const allowed = path => ALLOWED.some(re => re.test(path));
export function ttlOf(path){
  if(NAMED.test(path)) return Infinity;
  if(path === LIVE) return 5 * MIN;
  if(path === 'data/manifest.json') return 10 * MIN;
  return HOUR;
}

/* The OS cache folder: %LOCALAPPDATA% on Windows, ~/Library/Caches on macOS, $XDG_CACHE_HOME or ~/.cache elsewhere.
   WI_MCP_CACHE names another; WI_MCP_CACHE=off keeps copies in memory only. */
export function cacheDir(env = process.env, platform = process.platform){
  if(env.WI_MCP_CACHE) return env.WI_MCP_CACHE === 'off' ? null : env.WI_MCP_CACHE;
  const home = homedir();
  const root = platform === 'win32' ? env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    : platform === 'darwin' ? join(home, 'Library', 'Caches')
    : env.XDG_CACHE_HOME || join(home, '.cache');
  return join(root, 'wraeclast-index-mcp');
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const diskName = path => path.replace(/\?/g, '_').replace(/[^A-Za-z0-9_./=-]/g, '-');

export class Source {
  constructor({base = SITE, fetch = globalThis.fetch, dir = cacheDir(), gap = GAP, perMinute = PER_MINUTE,
    now = () => Date.now(), sleep = wait} = {}){
    this.base = base.replace(/\/+$/, '');
    this.fetch = fetch;
    this.dir = dir;
    this.gap = gap;
    this.perMinute = perMinute;
    this.now = now;
    this.sleep = sleep;
    this.mem = new Map();        // path -> {at, text}
    this.flying = new Map();     // path -> promise of the text
    this.queue = Promise.resolve();
    this.stamps = [];            // when each request of the last minute went out
    this.last = -Infinity;
    this.requests = 0;
  }

  async json(path){ return JSON.parse(await this.text(path)); }

  async text(path){
    if(!allowed(path)) throw new Error('Not a Wraeclast Index public file: ' + path);
    const ttl = ttlOf(path), now = this.now();
    let copy = this.mem.get(path) || await this.fromDisk(path);
    if(copy && now - copy.at < ttl) return copy.text;
    if(this.flying.has(path)) return this.flying.get(path);
    const p = this.fetchText(path).then(text => {
      copy = {at: this.now(), text};
      this.mem.set(path, copy);
      this.toDisk(path, copy);
      return text;
    }, err => {
      if(copy) return copy.text;   // the last good copy: its prices carry their own age
      throw err;
    }).finally(() => this.flying.delete(path));
    this.flying.set(path, p);
    return p;
  }

  /* one request, when the limits allow it */
  async fetchText(path){
    await this.slot();
    this.requests++;
    let res;
    try {
      res = await this.fetch(this.base + '/' + path, {headers: {'User-Agent': USER_AGENT, 'Accept': 'application/json, text/plain'}});
    } catch(e){
      throw new Error('Wraeclast Index did not answer: ' + (e && e.message || e));
    }
    if(res.status === 429){
      const after = +(res.headers && res.headers.get && res.headers.get('Retry-After')) || 60;
      this.last = this.now() + after * 1000;   // nothing more goes out until then
      throw new Error('Wraeclast Index is busy (429). Next request in ' + after + ' s.');
    }
    if(!res.ok) throw new Error('Wraeclast Index answered ' + res.status + ' for /' + path);
    return res.text();
  }

  /* waits its turn: GAP after the last request, and room under PER_MINUTE in the last 60 s */
  slot(){
    const turn = this.queue.then(async () => {
      for(;;){
        const now = this.now();
        this.stamps = this.stamps.filter(t => now - t < MIN);
        let until = this.last + this.gap;
        if(this.stamps.length >= this.perMinute) until = Math.max(until, this.stamps[0] + MIN);
        if(until <= now) break;
        await this.sleep(until - now);
      }
      this.last = this.now();
      this.stamps.push(this.last);
    });
    this.queue = turn.catch(() => {});
    return turn;
  }

  async fromDisk(path){
    if(!this.dir) return null;
    try {
      const raw = await readFile(join(this.dir, diskName(path)), 'utf8');
      const nl = raw.indexOf('\n'), at = +raw.slice(0, nl);
      if(nl < 0 || !isFinite(at)) return null;
      const copy = {at, text: raw.slice(nl + 1)};
      this.mem.set(path, copy);
      return copy;
    } catch { return null; }
  }

  async toDisk(path, copy){
    if(!this.dir) return;
    const file = join(this.dir, diskName(path)), tmp = file + '.' + process.pid + '.tmp';
    try {
      await mkdir(dirname(file), {recursive: true});
      await writeFile(tmp, copy.at + '\n' + copy.text, 'utf8');
      await rename(tmp, file);
    } catch { await rm(tmp, {force: true}).catch(() => {}); }
  }

  /* drop every content-named copy the manifest no longer names */
  async prune(named){
    const keep = new Set([...named].map(diskName));
    for(const [path] of this.mem) if(NAMED.test(path) && !named.has(path)) this.mem.delete(path);
    if(!this.dir) return 0;
    let n = 0;
    const walk = async rel => {
      let list = [];
      try { list = await readdir(join(this.dir, rel), {withFileTypes: true}); } catch { return; }
      for(const d of list){
        const p = rel + '/' + d.name;
        if(d.isDirectory()) await walk(p);
        else if(NAMED.test(p) && !keep.has(p)){ await rm(join(this.dir, p), {force: true}).catch(() => {}); n++; }
      }
    };
    for(const top of ['data/cards', 'data/search', 'data/seo']) await walk(top);
    return n;
  }
}
