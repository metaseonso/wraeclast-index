/* Wraeclast Index on Cloudflare.
   Static files are served straight from the edge, the service worker (sw.js, stamped by tools/build.mjs) among
   them. This worker only answers:
     /data/market.json   every price, from real trade listings only (worker/prices.js serveMarket; ?part=now|past|live|hist|facts),
                         with the league dates (leagues.json, sent in by the data server) riding in now and live.
                         A build that throws serves the last good copy, marked late (worker/prices.js lastGood)
     /api/pob?url=...    the build code behind a pobb.in, poe.ninja, maxroll, mobalytics, poe2db or pastebin link
                         (browsers cannot fetch those sites themselves)
     /search?q=...       the app's search, as a redirect (worker/seo.js). The crawler pages themselves (/item/*,
                         the lists, the sitemaps, llms.txt, /md/*) are files, built by tools/build.mjs with worker/seo.js
     /data/rollprices.json, /data/farmprices.json
                         live trade prices (sent in through the hour: /api/prices/ingest): worker/prices.js
     /data/bossprices.json  what every item on the Bosses tab costs: worker/prices.js
     /api/data/put       the data server's hourly files (Currency Exchange, catalogue, league dates): worker/files.js.
                         The Currency Exchange file also rolls the day's prices into its league (worker/prices.js)
     /api/health         how old every data file and every kind of price is, and whether a job is late: worker/health.js
     /api/trade/searches popular Trade page searches (GET), and counting one (POST): worker/community.js
     /api/suggest        notes from the Suggest button, and what players report about an interaction the
                         game leaves open (GET: the lean and who weighed in): worker/community.js
     /api/t, /api/admin/* page views and clicks, and the owner's dashboard (admin.html): worker/dash.js */
import * as seo from './seo.js';
import { servePrices, ingest, state, serveMarket, serveBossPrices, rollLeagues, buildMarket } from './prices.js';
import { putFile } from './files.js';
import { tradeSearches, suggest } from './community.js';
import { track, admin } from './dash.js';
import { serveHealth } from './health.js';

const UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)';

export default {
  async fetch(request, env, ctx){
    const url = new URL(request.url);
    if(url.pathname === '/data/market.json') return serveMarket(request, env, ctx);
    if(url.pathname === '/api/pob') return pob(url);
    if(url.pathname === '/api/trade/searches') return tradeSearches(request, env, ctx, url);
    if(url.pathname === '/api/suggest') return suggest(request, env, url, ctx);
    if(url.pathname === '/api/health') return serveHealth(request, env, url, ctx);
    if(url.pathname === '/api/t') return track(request, env, url);
    if(url.pathname.startsWith('/api/admin/')) return admin(request, env, url);
    if(url.pathname === '/api/prices/ingest') return ingest(request, env, url, ctx);
    if(url.pathname === '/api/prices/state') return state(request, env, url);
    if(url.pathname === '/api/data/put') return dataPut(request, env, url, ctx);
    if(url.pathname === '/data/rollprices.json') return servePrices(request, env, ctx, 'roll');
    if(url.pathname === '/data/farmprices.json') return servePrices(request, env, ctx, 'farm');
    if(url.pathname === '/data/bossprices.json') return serveBossPrices(request, env, ctx);
    if(seo.handles(url.pathname)) return seo.respond(request);
    return env.ASSETS.fetch(request);
  },
};

/* An hourly data file coming in (worker/files.js). When it is the Currency Exchange prices, the day's prices
   are also put into the league they belong to, once a day, so a currency's line survives the league
   (worker/prices.js rollLeagues). A file the price file is made of builds it again (worker/prices.js
   buildMarket). Both run after the answer has gone back: the job never waits for them. */
const MARKET_INPUTS = new Set(['exchange.json', 'market.json', 'leagues.json']);
async function dataPut(request, env, url, ctx){
  const res = await putFile(request, env, url, ctx);
  const name = url.searchParams.get('name');
  if(res.status === 200 && MARKET_INPUTS.has(name))
    ctx.waitUntil((name === 'exchange.json' ? rollLeagues(env, url.origin, ctx).catch(() => null) : Promise.resolve())
      .then(() => buildMarket(env, url.origin, ctx)).catch(() => null));
  return res;
}

/* A build link -> the raw code, from the sites that host Path of Building codes. */
const HOSTS = [
  [/^(?:www\.)?pobb\.in$/, p => p.match(/^\/(?:pob\/)?([\w-]+)/), id => 'https://pobb.in/' + id + '/raw'],
  [/^(?:www\.)?poe\.ninja$/, p => p.match(/^\/poe2\/pob\/(?:raw\/)?([\w-]+)/), id => 'https://poe.ninja/poe2/pob/raw/' + id],
  [/^(?:www\.)?maxroll\.gg$/, p => p.match(/^\/poe2\/(?:api\/)?pob\/([\w-]+)/), id => 'https://maxroll.gg/poe2/api/pob/' + id],
  [/^(?:www\.)?poe2db\.tw$/, p => p.match(/^\/pob\/([\w-]+)/), id => 'https://poe2db.tw/pob/' + id + '/raw'],
  [/^(?:www\.)?pastebin\.com$/, p => p.match(/^\/(?:raw\/)?(\w+)/), id => 'https://pastebin.com/raw/' + id],
  // a Mobalytics build page: the code sits in the page's data, when the author added one
  [/^(?:www\.)?mobalytics\.gg$/, p => p.match(/^\/poe-2\/builds\/([\w-]+)/), id => 'https://mobalytics.gg/poe-2/builds/' + id,
    page => (page.match(/"pobCode":"([A-Za-z0-9+\/=_-]{40,})"/) || [])[1] || ''],
];
async function pob(url){
  const reply = (status, body) => new Response(body, {status, headers: {'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}});
  let link;
  try { link = new URL(url.searchParams.get('url') || ''); } catch { return reply(400, "That isn't a link."); }
  const host = HOSTS.find(h => h[0].test(link.hostname));
  const m = host && host[1](link.pathname);
  if(!m) return reply(400, 'Links from pobb.in, poe.ninja, maxroll, mobalytics, poe2db or pastebin only.');
  const r = await fetch(host[2](m[1]), {headers: {'User-Agent': UA}, cf: {cacheTtl: 600}});
  if(!r.ok) return reply(502, "Couldn't open that link.");
  const text = await r.text();
  const code = (host[3] ? host[3](text) : text).trim();
  if(host[3] && !code) return reply(404, "The author of this build did not add a Path of Building code, so it can't be read. Try another build or paste a code.");
  if(code.length > 400000 || !/^[A-Za-z0-9+/=_-]+$/.test(code)) return reply(502, "That link doesn't hold a build code.");
  return reply(200, code);
}
