/* Wraeclast Index on Cloudflare.
   Static files are served straight from the edge. This worker only answers:
     /data/market.json   live prices: the hourly GitHub job publishes them; cached here for 5 minutes
     /api/pob?url=...    the build code behind a pobb.in, poe.ninja, maxroll, poe2db or pastebin link
                         (browsers cannot fetch those sites themselves)
     /item/*, /gems, /uniques, /passives, /currency, /keywords, /sitemap.xml, /llms.txt, /search
                         plain pages for search engines and AI search: worker/seo.js
     /data/rollprices.json, /data/farmprices.json
                         live trade prices, pulled a little every minute by the scheduled job: worker/prices.js
     /api/trade/searches popular Trade page searches (GET), and counting one (POST): worker/community.js */
import * as seo from './seo.js';
import { runPrices, servePrices } from './prices.js';
import { tradeSearches } from './community.js';

const MARKET_SOURCE = 'https://metaseonso.github.io/wraeclast-index/data/market.json';
const UA = 'wraeclast-index/1.0 (+https://wraeclastindex.fyi)';

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if(url.pathname === '/data/market.json') return market(request, env);
    if(url.pathname === '/api/pob') return pob(url);
    if(url.pathname === '/api/trade/searches') return tradeSearches(request, env, ctx, url);
    if(url.pathname === '/data/rollprices.json') return servePrices(request, env, ctx, 'roll');
    if(url.pathname === '/data/farmprices.json') return servePrices(request, env, ctx, 'farm');
    if(seo.handles(url.pathname)) return seo.respond(request, env, ctx, () => market(new Request(url.origin + '/data/market.json'), env));
    return env.ASSETS.fetch(request);
  },
  // every minute (wrangler.jsonc "triggers"): a few trade searches for the live roll and farm prices
  async scheduled(event, env, ctx){
    ctx.waitUntil(runPrices(env, new Date(event.scheduledTime)));
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
