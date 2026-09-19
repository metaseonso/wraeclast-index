/* Cloudflare's own numbers for the owner's dashboard: GET /api/admin/cloudflare?days=1|7|30 (signed-in only).
   Read from Cloudflare's GraphQL analytics with a read-only stats key (Worker secret CF_ANALYTICS_TOKEN:
   Account Analytics read + Zone Analytics read). Cached here for 5 minutes.
   What Cloudflare records, as far as the free plan shows it:
     traffic per day (requests, page views, unique visitors, bandwidth, cached share, threats), countries,
     browsers, status codes, content types; per request (adaptive): top paths, devices and systems, who is asking
     (browsers vs named crawlers); real visitors (Web Analytics, no cookies): visits, pages, where they came from,
     countries, devices, browsers, systems, page speed (Core Web Vitals, load time); the worker (requests, errors,
     CPU time) and the database (rows read and written). */
const ZONE = '65a507d6b6a2ff8cc71260aba0872799', ACC = '80fa25161d1d4403df3b849853368410';

async function gql(env, query, variables){
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {method: 'POST',
    headers: {'Authorization': 'Bearer ' + env.CF_ANALYTICS_TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables})});
  const j = await r.json().catch(() => ({}));
  if(j.errors && j.errors.length) throw new Error(j.errors[0].message);
  return j.data;
}
const sinceTime = h => new Date(Date.now() - h * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
const sinceDate = d => new Date(Date.now() - (d - 1) * 86400e3).toISOString().slice(0, 10);
const sumBy = (rows, key, val) => {
  const m = new Map();
  for(const r of rows) m.set(key(r), (m.get(key(r)) || 0) + val(r));
  return [...m].map(([k, n]) => ({k, n})).sort((a, b) => b.n - a.n);
};

/* who is asking: named crawlers from the user agent, else people's browsers */
const CRAWLERS = [
  ['ClaudeBot', 'AI crawler', /ClaudeBot|Claude-User|Claude-SearchBot|anthropic-ai/i], ['GPTBot', 'AI crawler', /GPTBot/i],
  ['ChatGPT (search and links)', 'AI search', /ChatGPT-User|OAI-SearchBot/i], ['PerplexityBot', 'AI search', /Perplexity/i],
  ['Googlebot', 'Search engine', /Googlebot|Google-InspectionTool|GoogleOther|Google-Extended|APIs-Google/i],
  ['Bingbot', 'Search engine', /bingbot|BingPreview|msnbot/i], ['Applebot', 'Search engine', /Applebot/i],
  ['DuckDuckBot', 'Search engine', /DuckDuck/i], ['YandexBot', 'Search engine', /Yandex/i], ['Baidu', 'Search engine', /Baiduspider/i],
  ['Amazonbot', 'AI crawler', /Amazonbot/i], ['Bytespider (ByteDance)', 'AI crawler', /Bytespider/i],
  ['Meta', 'AI crawler', /meta-externalagent|meta-externalfetcher|facebookexternalhit|FacebookBot/i], ['Common Crawl', 'AI crawler', /CCBot/i],
  ['Ahrefs', 'SEO tool', /AhrefsBot/i], ['Semrush', 'SEO tool', /SemrushBot/i], ['Majestic', 'SEO tool', /MJ12bot/i],
  ['Discord previews', 'Link preview', /Discordbot/i], ['X / Twitter previews', 'Link preview', /Twitterbot/i],
  ['Slack previews', 'Link preview', /Slackbot/i], ['Telegram previews', 'Link preview', /TelegramBot/i], ['Reddit previews', 'Link preview', /redditbot/i],
  ['Our own jobs and scripts', 'Scripts', /wraeclast-index|python-urllib|python-requests|curl\/|Wget|node-fetch|undici|Go-http-client|axios|okhttp/i],
  ['Other bots', 'Other bot', /bot\b|crawler|spider|scrap|fetch|preview|monitor|uptime/i],
];
function who(ua){
  if(!ua) return ['No browser name', 'Unknown'];
  for(const [name, kind, re] of CRAWLERS) if(re.test(ua)) return [name, kind];
  return /Mozilla|Opera/.test(ua) ? ['People (browsers)', 'People'] : ['Other programs', 'Other bot'];
}

export async function cloudflare(env, url){
  if(!env.CF_ANALYTICS_TOKEN) return {error: 'No stats key yet.'};
  const days = [1, 7, 30].includes(+url.searchParams.get('days')) ? +url.searchParams.get('days') : 7;
  const ck = new Request('https://cache.local/cf-stats/' + days);
  const hit = await caches.default.match(ck);
  if(hit) return hit.json();
  const d = sinceDate(days), notes = [];

  // ---- per day: traffic, countries, browsers, status codes, content types ----
  const daily = (await gql(env, `query($z:String!,$d:Date!){viewer{zones(filter:{zoneTag:$z}){
    httpRequests1dGroups(limit:31, filter:{date_geq:$d}, orderBy:[date_ASC]){ dimensions{date}
      sum{requests pageViews bytes cachedBytes cachedRequests threats
        countryMap{clientCountryName requests threats} browserMap{uaBrowserFamily pageViews}
        responseStatusMap{edgeResponseStatus requests} contentTypeMap{edgeResponseContentTypeName requests}}
      uniq{uniques}}}}}`, {z: ZONE, d})).viewer.zones[0].httpRequests1dGroups;

  // ---- per request (adaptive): paths, devices, who is asking. The free plan may keep fewer days of these. ----
  const adaptiveQ = `query($z:String!,$t:Time!){viewer{zones(filter:{zoneTag:$z}){
    paths: httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientRequestPath}}
    devices: httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientDeviceType userAgentOS}}
    agents: httpRequestsAdaptiveGroups(limit:100, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{userAgent}}
    status: httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{edgeResponseStatus}}}}}`;
  let ad = null, adHours = days * 24;
  for(const h of [...new Set([days * 24, 7 * 24, 24])].filter(h => h <= days * 24)){
    try { ad = (await gql(env, adaptiveQ, {z: ZONE, t: sinceTime(h)})).viewer.zones[0]; adHours = h; break; } catch { /* try a shorter window */ }
  }
  if(adHours < days * 24) notes.push('Paths, devices and crawlers: the free plan shows the last ' + (adHours === 24 ? '24 hours' : '7 days') + '.');

  // ---- real visitors (Web Analytics): pages, where from, countries, devices, browsers, systems, speed ----
  const rumQ = `query($a:String!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){
    total: rumPageloadEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count sum{visits}}
    byDay: rumPageloadEventsAdaptiveGroups(limit:40, filter:{datetime_geq:$t}, orderBy:[date_ASC]){count sum{visits} dimensions{date}}
    pages: rumPageloadEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{requestPath}}
    refs: rumPageloadEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{refererHost}}
    countries: rumPageloadEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{countryName}}
    devices: rumPageloadEventsAdaptiveGroups(limit:10, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{deviceType}}
    browsers: rumPageloadEventsAdaptiveGroups(limit:15, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{userAgentBrowser}}
    systems: rumPageloadEventsAdaptiveGroups(limit:15, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{userAgentOS}}
    vitals: rumWebVitalsEventsAdaptiveGroups(limit:15, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count
      quantiles{largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 firstContentfulPaintP75} dimensions{requestPath}}
    speed: rumPerformanceEventsAdaptiveGroups(limit:15, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count
      quantiles{pageLoadTimeP50 pageLoadTimeP90} dimensions{requestPath}}}}}`;
  let rum = null;
  try { rum = (await gql(env, rumQ, {a: ACC, t: sinceTime(days * 24)})).viewer.accounts[0]; }
  catch(e){ notes.push('Real-visitor numbers: ' + String(e.message).slice(0, 120)); }

  // ---- the worker and the database ----
  let wk = null, db = null;
  try {
    const a = (await gql(env, `query($a:String!,$t:Time!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){
      workers: workersInvocationsAdaptive(limit:20, filter:{datetime_geq:$t}){sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99} dimensions{scriptName status}}
      d1: d1AnalyticsAdaptiveGroups(limit:40, filter:{date_geq:$d}, orderBy:[date_ASC]){sum{readQueries writeQueries rowsRead rowsWritten} dimensions{date}}}}}`,
      {a: ACC, t: sinceTime(days * 24), d})).viewer.accounts[0];
    wk = a.workers; db = a.d1;
  } catch(e){ notes.push('Worker and database numbers: ' + String(e.message).slice(0, 120)); }

  // ---- shape it ----
  const tot = {requests: 0, pageViews: 0, uniques: 0, bytes: 0, cachedBytes: 0, cachedRequests: 0, threats: 0};
  const countries = new Map(), browsers = new Map(), status = new Map(), types = new Map();
  const add = (m, k, n) => m.set(k, (m.get(k) || 0) + (n || 0));
  for(const g of daily){
    for(const k of ['requests', 'pageViews', 'bytes', 'cachedBytes', 'cachedRequests', 'threats']) tot[k] += g.sum[k] || 0;
    tot.uniques += g.uniq.uniques || 0;   // unique visitors per day, added up
    for(const c of g.sum.countryMap || []) add(countries, c.clientCountryName, c.requests);
    for(const b of g.sum.browserMap || []) add(browsers, b.uaBrowserFamily, b.pageViews);
    for(const s of g.sum.responseStatusMap || []) add(status, s.edgeResponseStatus, s.requests);
    for(const t of g.sum.contentTypeMap || []) add(types, t.edgeResponseContentTypeName, t.requests);
  }
  const list = (m, n) => [...m].map(([k, v]) => ({k, n: v})).sort((a, b) => b.n - a.n).slice(0, n);
  const crawl = new Map(), kinds = new Map();
  for(const r of (ad && ad.agents) || []){
    const [name, kind] = who(r.dimensions.userAgent);
    add(crawl, name + '' + kind, r.count);
    add(kinds, kind, r.count);
  }
  const rumList = (rows, f) => (rows || []).map(r => ({k: r.dimensions[f] || '', n: r.count, visits: r.sum ? r.sum.visits : 0}));
  const ms = v => v === null || v === undefined ? null : Math.round(v / 1000);   // Cloudflare gives microseconds
  const speed = new Map(((rum && rum.speed) || []).map(r => [r.dimensions.requestPath, r]));
  const workers = {requests: 0, errors: 0, subrequests: 0, cpu50: 0, cpu99: 0, byStatus: []};
  for(const w of wk || []){
    if(w.dimensions.scriptName !== 'wraeclast-index') continue;
    workers.requests += w.sum.requests; workers.errors += w.sum.errors; workers.subrequests += w.sum.subrequests;
    workers.byStatus.push({k: w.dimensions.status, n: w.sum.requests});
    if(w.dimensions.status === 'success'){ workers.cpu50 = ms(w.quantiles.cpuTimeP50); workers.cpu99 = ms(w.quantiles.cpuTimeP99); }
  }
  workers.byStatus.sort((a, b) => b.n - a.n);
  const out = {
    days, notes, updated: new Date().toISOString(), adaptiveHours: adHours,
    totals: {...tot, visits: rum && rum.total[0] ? rum.total[0].sum.visits : null, pageLoads: rum && rum.total[0] ? rum.total[0].count : null},
    daily: daily.map(g => ({date: g.dimensions.date, requests: g.sum.requests, pageViews: g.sum.pageViews, uniques: g.uniq.uniques,
      bytes: g.sum.bytes, cachedBytes: g.sum.cachedBytes, threats: g.sum.threats})),
    countries: list(countries, 25), browsers: list(browsers, 15), status: list(status, 15), types: list(types, 12),
    paths: ((ad && ad.paths) || []).map(r => ({k: r.dimensions.clientRequestPath, n: r.count})),
    devices: ((ad && ad.devices) || []).map(r => ({k: r.dimensions.clientDeviceType + ' · ' + r.dimensions.userAgentOS, n: r.count})),
    crawlers: [...crawl].map(([k, n]) => { const [name, kind] = k.split(''); return {k: name, kind, n}; }).sort((a, b) => b.n - a.n),
    askers: list(kinds, 10),
    rum: rum ? {
      byDay: (rum.byDay || []).map(r => ({date: r.dimensions.date, loads: r.count, visits: r.sum.visits})),
      pages: rumList(rum.pages, 'requestPath'), refs: rumList(rum.refs, 'refererHost'), countries: rumList(rum.countries, 'countryName'),
      devices: rumList(rum.devices, 'deviceType'), browsers: rumList(rum.browsers, 'userAgentBrowser'), systems: rumList(rum.systems, 'userAgentOS'),
      vitals: (rum.vitals || []).map(r => { const s = speed.get(r.dimensions.requestPath); return {path: r.dimensions.requestPath, n: r.count,
        lcp: ms(r.quantiles.largestContentfulPaintP75), inp: ms(r.quantiles.interactionToNextPaintP75), cls: r.quantiles.cumulativeLayoutShiftP75,
        fcp: ms(r.quantiles.firstContentfulPaintP75), load50: s ? ms(s.quantiles.pageLoadTimeP50) : null, load90: s ? ms(s.quantiles.pageLoadTimeP90) : null}; }),
    } : null,
    workers,
    d1: (db || []).map(r => ({date: r.dimensions.date, rowsRead: r.sum.rowsRead, rowsWritten: r.sum.rowsWritten, reads: r.sum.readQueries, writes: r.sum.writeQueries})),
    free: {requests: 100000, d1Reads: 5000000, d1Writes: 100000},
  };
  await caches.default.put(ck, new Response(JSON.stringify(out), {headers: {'Cache-Control': 'max-age=300'}}));
  return out;
}
