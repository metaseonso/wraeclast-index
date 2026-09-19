/* Wraeclast Index on Cloudflare.
   Static files are served straight from the edge. This worker only answers:
     /data/market.json   live prices: the hourly GitHub job publishes them; cached here for 5 minutes
     /api/pob?url=...    the build code behind a pobb.in, poe.ninja, maxroll, poe2db or pastebin link
                         (browsers cannot fetch those sites themselves) */

const MARKET_SOURCE = 'https://metaseonso.github.io/wraeclast-index/data/market.json';
const UA = 'wraeclast-index/1.0 (+https://wraeclastindex.fyi)';

export default {
  async fetch(request, env){
    const url = new URL(request.url);
    if(url.pathname === '/data/market.json') return market(request, env);
    if(url.pathname === '/api/pob') return pob(url);
    return env.ASSETS.fetch(request);
  },
};

async function market(request, env){
  try {
    const r = await fetch(MARKET_SOURCE, {headers: {'User-Agent': UA}, cf: {cacheTtl: 300, cacheEverything: true}});
    if(r.ok) return new Response(r.body, {headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    }});
  } catch {}
  return env.ASSETS.fetch(request);   // the copy that shipped with the site
}

/* A build link -> the raw code, from the sites that host Path of Building codes. */
const HOSTS = [
  [/^(?:www\.)?pobb\.in$/, p => p.match(/^\/(?:pob\/)?([\w-]+)/), id => 'https://pobb.in/' + id + '/raw'],
  [/^(?:www\.)?poe\.ninja$/, p => p.match(/^\/poe2\/pob\/(?:raw\/)?([\w-]+)/), id => 'https://poe.ninja/poe2/pob/raw/' + id],
  [/^(?:www\.)?maxroll\.gg$/, p => p.match(/^\/poe2\/(?:api\/)?pob\/([\w-]+)/), id => 'https://maxroll.gg/poe2/api/pob/' + id],
  [/^(?:www\.)?poe2db\.tw$/, p => p.match(/^\/pob\/([\w-]+)/), id => 'https://poe2db.tw/pob/' + id + '/raw'],
  [/^(?:www\.)?pastebin\.com$/, p => p.match(/^\/(?:raw\/)?(\w+)/), id => 'https://pastebin.com/raw/' + id],
];
async function pob(url){
  const reply = (status, body) => new Response(body, {status, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});
  let link;
  try { link = new URL(url.searchParams.get('url') || ''); } catch { return reply(400, "That isn't a link."); }
  const host = HOSTS.find(h => h[0].test(link.hostname));
  const m = host && host[1](link.pathname);
  if(!m) return reply(400, 'Links from pobb.in, poe.ninja, maxroll, poe2db or pastebin only.');
  const r = await fetch(host[2](m[1]), {headers: {'User-Agent': UA}, cf: {cacheTtl: 600}});
  if(!r.ok) return reply(502, "Couldn't open that link.");
  const code = (await r.text()).trim();
  if(code.length > 400000 || !/^[A-Za-z0-9+/=_-]+$/.test(code)) return reply(502, "That link doesn't hold a build code.");
  return reply(200, code);
}
