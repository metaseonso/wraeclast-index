/* Cloudflare's own numbers for the owner's dashboard: GET /api/admin/cloudflare?days=1|7|30 (signed-in only).
   Read from Cloudflare's GraphQL analytics with a read-only stats key (Worker secret CF_ANALYTICS_TOKEN:
   Account Analytics read + Zone Analytics read). Cached here for 5 minutes.
   Every breakdown is one block in BLOCKS. Blocks go out a few per request; when a request fails, its blocks
   are asked for one at a time, and a block the free plan will not answer is dropped, remembered while this
   worker is warm, and named in the dashboard instead of breaking the page.
   tools/dev/cfcheck.mjs runs the same blocks against the real API, one at a time. */
const ZONE = '65a507d6b6a2ff8cc71260aba0872799', ACC = '80fa25161d1d4403df3b849853368410';
const CHUNK = 5;          // blocks per request
const MISS = new Set();   // blocks the free plan did not answer

/* [scope, GraphQL]. Scopes: zt zone by time, zd zone by date, at account by time, ad account by date.
   zt and at read single events: the free plan only keeps those for a few days (reach() finds how far back). */
const BLOCKS = {
  // ---- per day: the dataset the free plan keeps longest (about a month back) ----
  daily: ['zd', `httpRequests1dGroups(limit:31, filter:{date_geq:$d}, orderBy:[date_ASC]){dimensions{date}
    sum{requests pageViews bytes cachedBytes cachedRequests encryptedRequests encryptedBytes threats} uniq{uniques}}`],
  dailyMaps: ['zd', `httpRequests1dGroups(limit:31, filter:{date_geq:$d}){sum{
    countryMap{clientCountryName requests threats bytes} browserMap{uaBrowserFamily pageViews}
    responseStatusMap{edgeResponseStatus requests} contentTypeMap{edgeResponseContentTypeName requests bytes}}}`],
  dailyKinds: ['zd', `httpRequests1dGroups(limit:31, filter:{date_geq:$d}){sum{
    threatPathingMap{threatPathingName requests} ipClassMap{ipType requests}}}`],

  // ---- per request: what was asked for, and how we answered ----
  hourly: ['zt', `httpRequestsAdaptiveGroups(limit:400, filter:{datetime_geq:$t}, orderBy:[datetimeHour_ASC]){count sum{edgeResponseBytes} dimensions{datetimeHour}}`],
  paths: ['zt', `httpRequestsAdaptiveGroups(limit:60, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{edgeResponseBytes} dimensions{clientRequestPath}}`],
  hosts: ['zt', `httpRequestsAdaptiveGroups(limit:15, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientRequestHTTPHost}}`],
  methods: ['zt', `httpRequestsAdaptiveGroups(limit:12, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientRequestHTTPMethodName}}`],
  scheme: ['zt', `httpRequestsAdaptiveGroups(limit:6, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientRequestScheme}}`],
  accept: ['zt', `httpRequestsAdaptiveGroups(limit:15, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientRequestAcceptContentTypeCategory}}`],
  cache: ['zt', `httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{edgeResponseBytes} dimensions{cacheStatus}}`],
  adTypes: ['zt', `httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{edgeResponseContentTypeName}}`],
  protocols: ['zt', `httpRequestsAdaptiveGroups(limit:12, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientRequestHTTPProtocol}}`],
  tls: ['zt', `httpRequestsAdaptiveGroups(limit:12, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientSSLProtocol}}`],
  originStatus: ['zt', `httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{originResponseStatus}}`],

  // ---- per request: how fast the edge and the worker answered (avg and quantiles apart, in case of the names) ----
  edgeSpeed: ['zt', `httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count avg{edgeTimeToFirstByteMs}}`],
  edgeSpeedQ: ['zt', `httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){quantiles{edgeTimeToFirstByteMsP50 edgeTimeToFirstByteMsP90}}`],
  originSpeed: ['zt', `httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count avg{originResponseDurationMs}}`],
  originSpeedQ: ['zt', `httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){quantiles{originResponseDurationMsP50 originResponseDurationMsP90}}`],

  // ---- per request: where it came from ----
  colo: ['zt', `httpRequestsAdaptiveGroups(limit:40, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{coloCode}}`],
  upperColo: ['zt', `httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{upperTierColoName}}`],
  devices: ['zt', `httpRequestsAdaptiveGroups(limit:12, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{clientDeviceType}}`],
  systems: ['zt', `httpRequestsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{userAgentOS}}`],
  verifiedBots: ['zt', `httpRequestsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{verifiedBotCategory}}`],
  agents: ['zt', `httpRequestsAdaptiveGroups(limit:120, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count dimensions{userAgent}}`],

  // ---- real visitors (Web Analytics, no cookies) ----
  rumTotal: ['at', `rumPageloadEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count sum{visits}}`],
  rumDay: ['at', `rumPageloadEventsAdaptiveGroups(limit:40, filter:{datetime_geq:$t}, orderBy:[date_ASC]){count sum{visits} dimensions{date}}`],
  rumHour: ['at', `rumPageloadEventsAdaptiveGroups(limit:400, filter:{datetime_geq:$t}, orderBy:[datetimeHour_ASC]){count sum{visits} dimensions{datetimeHour}}`],
  rumPages: ['at', `rumPageloadEventsAdaptiveGroups(limit:40, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{requestPath}}`],
  rumHosts: ['at', `rumPageloadEventsAdaptiveGroups(limit:10, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{requestHost}}`],
  rumRefs: ['at', `rumPageloadEventsAdaptiveGroups(limit:30, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{refererHost}}`],
  rumCountries: ['at', `rumPageloadEventsAdaptiveGroups(limit:40, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{countryName}}`],
  rumDevices: ['at', `rumPageloadEventsAdaptiveGroups(limit:10, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{deviceType}}`],
  rumBrowsers: ['at', `rumPageloadEventsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{userAgentBrowser}}`],
  rumSystems: ['at', `rumPageloadEventsAdaptiveGroups(limit:20, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count sum{visits} dimensions{userAgentOS}}`],

  // ---- page speed: what real visitors felt ----
  vitals: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count
    quantiles{largestContentfulPaintP75 interactionToNextPaintP75 cumulativeLayoutShiftP75 firstContentfulPaintP75} dimensions{requestPath}}`],
  speed: ['at', `rumPerformanceEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count
    quantiles{pageLoadTimeP50 pageLoadTimeP90} dimensions{requestPath}}`],
  parts: ['at', `rumPerformanceEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count quantiles{
    dnsTimeP50 dnsTimeP75 connectionTimeP50 connectionTimeP75 tlsTimeP50 tlsTimeP75 requestTimeP50 requestTimeP75
    responseTimeP50 responseTimeP75 pageRenderTimeP50 pageRenderTimeP75 loadEventTimeP50 loadEventTimeP75
    pageLoadTimeP50 pageLoadTimeP75}}`],
  ttfb: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:25, filter:{datetime_geq:$t}, orderBy:[count_DESC]){count quantiles{timeToFirstByteP75} dimensions{requestPath}}`],
  // good / needs work / poor, each metric on its own so one missing name does not cost the rest
  splitLcp: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){sum{lcpGood lcpNeedsImprovement lcpPoor lcpTotal}}`],
  splitInp: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){sum{inpGood inpNeedsImprovement inpPoor inpTotal}}`],
  splitCls: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){sum{clsGood clsNeedsImprovement clsPoor clsTotal}}`],
  splitFcp: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){sum{fcpGood fcpNeedsImprovement fcpPoor fcpTotal}}`],
  splitTtfb: ['at', `rumWebVitalsEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){sum{ttfbGood ttfbNeedsImprovement ttfbPoor ttfbTotal}}`],

  // ---- the worker and the database ----
  workers: ['at', `workersInvocationsAdaptive(limit:20, filter:{datetime_geq:$t}){sum{requests errors subrequests}
    quantiles{cpuTimeP50 cpuTimeP99} dimensions{scriptName status}}`],
  d1: ['ad', `d1AnalyticsAdaptiveGroups(limit:40, filter:{date_geq:$d}, orderBy:[date_ASC]){sum{readQueries writeQueries rowsRead rowsWritten} dimensions{date}}`],
};
/* what to say when a block is missing */
const LABEL = {
  daily: 'per-day traffic', dailyMaps: 'countries, browsers, status codes and content types', dailyKinds: 'threat kinds and visitor kinds',
  hourly: 'requests per hour', paths: 'paths', hosts: 'hosts', methods: 'request methods', scheme: 'https or plain',
  accept: 'what they asked for', cache: 'cache hits', adTypes: 'content types per request',
  protocols: 'HTTP versions', tls: 'TLS versions', originStatus: 'server status codes',
  edgeSpeed: 'how fast Cloudflare answered', edgeSpeedQ: 'how fast Cloudflare answered (half and 90%)',
  originSpeed: 'how fast the worker answered', originSpeedQ: 'how fast the worker answered (half and 90%)',
  colo: 'data centres', upperColo: 'upper-tier data centres', devices: 'device kinds', systems: 'operating systems',
  verifiedBots: 'named bots', agents: 'crawlers and browsers',
  rumTotal: 'real visits', rumDay: 'real visits per day', rumHour: 'real visits per hour', rumPages: 'real visitor pages',
  rumHosts: 'real visitor hosts', rumRefs: 'where real visitors came from', rumCountries: 'real visitor countries',
  rumDevices: 'real visitor devices', rumBrowsers: 'real visitor browsers', rumSystems: 'real visitor systems',
  vitals: 'page speed per page', speed: 'load time per page', parts: 'load time, step by step', ttfb: 'time to first byte',
  splitLcp: 'main content: good / poor split', splitInp: 'reaction: good / poor split', splitCls: 'jumpiness: good / poor split',
  splitFcp: 'first paint: good / poor split', splitTtfb: 'first byte: good / poor split',
  workers: 'server numbers', d1: 'database numbers',
};
/* asked for once, refused by this plan (tools/dev/cfcheck.mjs): said out loud on the dashboard, not asked for again.
   Referring hosts, query strings and networks are in the schema but our zone may not read them; the rest is not there at all. */
const NEVER = ['query strings', 'referring hosts per request', 'networks (ASN)', 'visitor kinds per request',
  'regions', 'cities', 'security events (firewall)'];
const HEAD = {
  zt: ['query($z:String!,$t:Time!){viewer{zones(filter:{zoneTag:$z}){', '}}}'],
  zd: ['query($z:String!,$d:Date!){viewer{zones(filter:{zoneTag:$z}){', '}}}'],
  at: ['query($a:String!,$t:Time!){viewer{accounts(filter:{accountTag:$a}){', '}}}'],
  ad: ['query($a:String!,$d:Date!){viewer{accounts(filter:{accountTag:$a}){', '}}}'],
};
/* the smallest question each event dataset takes: how far back the free plan still answers */
const PROBE = {zt: 'httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count}',
  at: 'rumPageloadEventsAdaptiveGroups(limit:1, filter:{datetime_geq:$t}){count}'};

async function gql(env, query, variables){
  const r = await fetch('https://api.cloudflare.com/client/v4/graphql', {method: 'POST',
    headers: {'Authorization': 'Bearer ' + env.CF_ANALYTICS_TOKEN, 'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables})});
  const j = await r.json().catch(() => ({}));
  if(j.errors && j.errors.length) throw new Error(j.errors.map(e => e.message).join('; '));
  if(!j.data) throw new Error('HTTP ' + r.status);
  return j.data;
}
const sinceTime = h => new Date(Date.now() - h * 3600e3).toISOString().replace(/\.\d+Z$/, 'Z');
const sinceDate = d => new Date(Date.now() - (d - 1) * 86400e3).toISOString().slice(0, 10);
/* a field the free plan does not have, rather than a bad moment: worth remembering */
const forGood = m => /cannot query|unknown (field|argument|type)|did you mean|not exist|denied|unauthor|forbidden|no access|not allowed/i.test(m);
export const query = (scope, names) => HEAD[scope][0] + names.map(n => n + ': ' + BLOCKS[n][1]).join('\n') + HEAD[scope][1];

/* ask for some blocks of one scope in one request */
async function ask(env, scope, names, vars){
  const d = await gql(env, query(scope, names), vars);
  const box = (d.viewer.zones || d.viewer.accounts || [])[0];
  return box || {};
}
/* every block we still believe in, a few per request; a failed request is retried block by block.
   The retries have a budget, so one bad afternoon cannot spend the worker's whole subrequest limit. */
async function collect(env, want, vars){
  const got = {}, gone = [], jobs = [];
  let budget = 25;
  for(const scope of Object.keys(HEAD)){
    const names = want.filter(n => BLOCKS[n][0] === scope && !MISS.has(n));
    for(let i = 0; i < names.length; i += CHUNK) jobs.push([scope, names.slice(i, i + CHUNK)]);
  }
  await Promise.all(jobs.map(async ([scope, names]) => {
    try { Object.assign(got, await ask(env, scope, names, vars[scope])); return; } catch {}
    await Promise.all(names.map(async n => {
      if(budget-- <= 0){ gone.push(n); return; }   // next time, then
      try { Object.assign(got, await ask(env, scope, [n], vars[scope])); }
      catch(e){ gone.push(n); if(forGood(String(e.message || e))) MISS.add(n); }
    }));
  }));
  for(const n of want) if(MISS.has(n) && !gone.includes(n)) gone.push(n);
  return {got, gone};
}
/* the longest window the free plan still answers for single events, in hours */
async function reach(env, scope, hours){
  for(const h of hours){
    try { await gql(env, HEAD[scope][0] + 'probe: ' + PROBE[scope] + HEAD[scope][1],
      scope === 'zt' ? {z: ZONE, t: sinceTime(h)} : {a: ACC, t: sinceTime(h)}); return h; } catch { /* try a shorter one */ }
  }
  return 0;
}

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

/* ---- rows into plain lists ---- */
const add = (m, k, n) => m.set(k, (m.get(k) || 0) + (n || 0));
const listOf = (m, n) => [...m].map(([k, v]) => ({k, n: v})).sort((a, b) => b.n - a.n).slice(0, n || 500);
const pick = (rows, dim) => (rows || []).map(r => {
  const o = {k: r.dimensions[dim] === null || r.dimensions[dim] === undefined ? '' : String(r.dimensions[dim]), n: r.count};
  if(r.sum && r.sum.edgeResponseBytes !== undefined) o.bytes = r.sum.edgeResponseBytes;
  if(r.sum && r.sum.visits !== undefined) o.visits = r.sum.visits;
  return o;
}).filter(r => r.n);
const ms = v => v === null || v === undefined ? null : Math.round(v / 1000);   // Cloudflare gives microseconds
/* a page load, step by step: our name and Cloudflare's, in the order a browser does them */
const STEPS = [['Finding the address', 'dnsTime'], ['Connecting', 'connectionTime'], ['Securing the line', 'tlsTime'],
  ['Asking us', 'requestTime'], ['Our answer', 'responseTime'], ['Page drawn', 'pageRenderTime'],
  ['Everything loaded', 'loadEventTime'], ['Full load', 'pageLoadTime']];
/* how long one step took, in milliseconds already: the average block and the quantile block, either may be missing */
const howFast = (avgRows, qRows, field) => {
  const a = avgRows && avgRows[0] && avgRows[0].avg, q = qRows && qRows[0] && qRows[0].quantiles;
  if(!a && !q) return null;
  const r = {avg: a ? Math.round(a[field]) : null, p50: q ? q[field + 'P50'] : null, p90: q ? q[field + 'P90'] : null,
    n: avgRows && avgRows[0] ? avgRows[0].count : null};
  return r.avg === null && r.p50 === null ? null : r;
};
/* good / needs work / poor for one metric */
const split = (row, key) => {
  const s = row && row[0] && row[0].sum;
  if(!s) return null;
  const good = s[key + 'Good'] || 0, ok = s[key + 'NeedsImprovement'] || 0, poor = s[key + 'Poor'] || 0;
  return good + ok + poor ? {good, ok, poor} : null;
};

export async function cloudflare(env, url){
  if(!env.CF_ANALYTICS_TOKEN) return {error: 'No stats key yet.'};
  const days = [1, 7, 30].includes(+url.searchParams.get('days')) ? +url.searchParams.get('days') : 7;
  const ck = new Request('https://cache.local/cf-stats/' + days);
  const hit = await caches.default.match(ck);
  if(hit) return hit.json();
  const d = sinceDate(days), notes = [], want = Object.keys(BLOCKS);

  // how far back single events go on this plan (the per-day dataset goes back further)
  const win = [...new Set([days * 24, 7 * 24, 3 * 24, 24])].filter(h => h <= days * 24);
  const [adHours, rumHours] = await Promise.all([reach(env, 'zt', win), reach(env, 'at', win)]);
  if(!adHours) notes.push('Cloudflare would not answer for single requests.');
  else if(adHours < days * 24) notes.push('Paths, crawlers and the rest per request: the last ' + (adHours / 24) + ' days.');
  if(!rumHours) notes.push('Real-visitor numbers (Web Analytics) did not answer.');
  else if(rumHours < days * 24) notes.push('Real visitors: the last ' + (rumHours / 24) + ' days.');

  const vars = {zt: {z: ZONE, t: sinceTime(adHours || 24)}, zd: {z: ZONE, d},
    at: {a: ACC, t: sinceTime(rumHours || 24)}, ad: {a: ACC, d}};
  const skip = want.filter(n => (!adHours && BLOCKS[n][0] === 'zt') || (!rumHours && BLOCKS[n][0] === 'at'));
  const {got, gone} = await collect(env, want.filter(n => !skip.includes(n)), vars);
  const missing = [...new Set([...[...gone, ...skip].map(n => LABEL[n] || n), ...NEVER])].sort();

  // ---- per day: traffic, and the maps inside it ----
  const daily = got.daily || [];
  const tot = {requests: 0, pageViews: 0, uniques: 0, bytes: 0, cachedBytes: 0, cachedRequests: 0,
    encryptedRequests: 0, encryptedBytes: 0, threats: 0};
  for(const g of daily){
    for(const k of Object.keys(tot)) if(k !== 'uniques') tot[k] += g.sum[k] || 0;
    tot.uniques += g.uniq.uniques || 0;   // unique visitors per day, added up
  }
  const countries = new Map(), cThreats = new Map(), cBytes = new Map(), browsers = new Map(), status = new Map(), types = new Map();
  for(const g of got.dailyMaps || []){
    for(const c of g.sum.countryMap || []){ add(countries, c.clientCountryName, c.requests); add(cThreats, c.clientCountryName, c.threats); add(cBytes, c.clientCountryName, c.bytes); }
    for(const b of g.sum.browserMap || []) add(browsers, b.uaBrowserFamily, b.pageViews);
    for(const s of g.sum.responseStatusMap || []) add(status, s.edgeResponseStatus, s.requests);
    for(const t of g.sum.contentTypeMap || []) add(types, t.edgeResponseContentTypeName, t.requests);
  }
  const threatKinds = new Map(), ipKinds = new Map();
  for(const g of got.dailyKinds || []){
    for(const t of g.sum.threatPathingMap || []) add(threatKinds, t.threatPathingName, t.requests);
    for(const i of g.sum.ipClassMap || []) add(ipKinds, i.ipType, i.requests);
  }

  // ---- who is asking: named crawlers, else browsers ----
  const crawl = new Map(), kinds = new Map();
  for(const r of got.agents || []){
    const [name, kind] = who(r.dimensions.userAgent);
    add(crawl, name + '' + kind, r.count);
    add(kinds, kind, r.count);
  }

  // ---- real visitors and page speed ----
  const rumOn = got.rumTotal || got.rumPages || got.rumDay;
  const load = new Map((got.speed || []).map(r => [r.dimensions.requestPath, r]));
  const byte = new Map((got.ttfb || []).map(r => [r.dimensions.requestPath, r]));
  const rum = rumOn ? {
    byDay: (got.rumDay || []).map(r => ({date: r.dimensions.date, loads: r.count, visits: r.sum.visits})),
    byHour: (got.rumHour || []).map(r => ({hour: String(r.dimensions.datetimeHour).slice(0, 13), loads: r.count, visits: r.sum.visits})),
    pages: pick(got.rumPages, 'requestPath'), hosts: pick(got.rumHosts, 'requestHost'), refs: pick(got.rumRefs, 'refererHost'),
    countries: pick(got.rumCountries, 'countryName'), devices: pick(got.rumDevices, 'deviceType'),
    browsers: pick(got.rumBrowsers, 'userAgentBrowser'), systems: pick(got.rumSystems, 'userAgentOS'),
    vitals: (got.vitals || []).map(r => {
      const s = load.get(r.dimensions.requestPath), b = byte.get(r.dimensions.requestPath);
      return {path: r.dimensions.requestPath, n: r.count,
        lcp: ms(r.quantiles.largestContentfulPaintP75), inp: ms(r.quantiles.interactionToNextPaintP75),
        cls: r.quantiles.cumulativeLayoutShiftP75, fcp: ms(r.quantiles.firstContentfulPaintP75),
        ttfb: b ? ms(b.quantiles.timeToFirstByteP75) : null,
        load50: s ? ms(s.quantiles.pageLoadTimeP50) : null, load90: s ? ms(s.quantiles.pageLoadTimeP90) : null};
    }),
    split: {lcp: split(got.splitLcp, 'lcp'), inp: split(got.splitInp, 'inp'), cls: split(got.splitCls, 'cls'),
      fcp: split(got.splitFcp, 'fcp'), ttfb: split(got.splitTtfb, 'ttfb')},
    parts: got.parts && got.parts[0] ? (q => STEPS.map(([k, f]) => ({k, p50: ms(q[f + 'P50']), p75: ms(q[f + 'P75'])}))
      .filter(s => s.p50 !== null || s.p75 !== null))(got.parts[0].quantiles) : null,
  } : null;

  // ---- the worker ----
  const workers = {requests: 0, errors: 0, subrequests: 0, cpu50: 0, cpu99: 0, byStatus: []};
  for(const w of got.workers || []){
    if(w.dimensions.scriptName !== 'wraeclast-index') continue;
    workers.requests += w.sum.requests; workers.errors += w.sum.errors; workers.subrequests += w.sum.subrequests;
    workers.byStatus.push({k: w.dimensions.status, n: w.sum.requests});
    if(w.dimensions.status === 'success'){ workers.cpu50 = ms(w.quantiles.cpuTimeP50); workers.cpu99 = ms(w.quantiles.cpuTimeP99); }
  }
  workers.byStatus.sort((a, b) => b.n - a.n);

  const out = {
    days, notes, missing, updated: new Date().toISOString(), adaptiveHours: adHours, rumHours,
    totals: {...tot, visits: rumOn && got.rumTotal && got.rumTotal[0] ? got.rumTotal[0].sum.visits : null,
      pageLoads: rumOn && got.rumTotal && got.rumTotal[0] ? got.rumTotal[0].count : null},
    daily: daily.map(g => ({date: g.dimensions.date, requests: g.sum.requests, pageViews: g.sum.pageViews, uniques: g.uniq.uniques,
      bytes: g.sum.bytes, cachedBytes: g.sum.cachedBytes, cachedRequests: g.sum.cachedRequests, threats: g.sum.threats})),
    hourly: (got.hourly || []).map(r => ({hour: String(r.dimensions.datetimeHour).slice(0, 13), n: r.count,
      bytes: r.sum ? r.sum.edgeResponseBytes : 0})),
    countries: listOf(countries, 60).map(c => ({...c, threats: cThreats.get(c.k) || 0, bytes: cBytes.get(c.k) || 0})),
    browsers: listOf(browsers, 20), status: listOf(status, 20),
    types: types.size ? listOf(types, 20) : pick(got.adTypes, 'edgeResponseContentTypeName'),   // per day if we have it, else per request
    threatKinds: listOf(threatKinds, 15), ipKinds: listOf(ipKinds, 15),
    paths: pick(got.paths, 'clientRequestPath'),
    hosts: pick(got.hosts, 'clientRequestHTTPHost'), methods: pick(got.methods, 'clientRequestHTTPMethodName'),
    scheme: pick(got.scheme, 'clientRequestScheme'), accept: pick(got.accept, 'clientRequestAcceptContentTypeCategory'),
    cache: pick(got.cache, 'cacheStatus'), protocols: pick(got.protocols, 'clientRequestHTTPProtocol'), tls: pick(got.tls, 'clientSSLProtocol'),
    originStatus: pick(got.originStatus, 'originResponseStatus'),
    colo: pick(got.colo, 'coloCode'), upperColo: pick(got.upperColo, 'upperTierColoName'),
    devices: pick(got.devices, 'clientDeviceType'), systems: pick(got.systems, 'userAgentOS'),
    verifiedBots: pick(got.verifiedBots, 'verifiedBotCategory'),
    edge: howFast(got.edgeSpeed, got.edgeSpeedQ, 'edgeTimeToFirstByteMs'),
    origin: howFast(got.originSpeed, got.originSpeedQ, 'originResponseDurationMs'),
    crawlers: [...crawl].map(([k, n]) => { const [name, kind] = k.split(''); return {k: name, kind, n}; }).sort((a, b) => b.n - a.n),
    askers: listOf(kinds, 12),
    rum,
    workers,
    d1: (got.d1 || []).map(r => ({date: r.dimensions.date, rowsRead: r.sum.rowsRead, rowsWritten: r.sum.rowsWritten,
      reads: r.sum.readQueries, writes: r.sum.writeQueries})),
    free: {requests: 100000, d1Reads: 5000000, d1Writes: 100000, d1StorageGB: 5},
  };
  await caches.default.put(ck, new Response(JSON.stringify(out), {headers: {'Cache-Control': 'max-age=300'}}));
  return out;
}

/* for tools/dev/cfcheck.mjs: every block on its own, so a run says which ones the free plan answers */
export function checks(days = 7){
  const t = sinceTime(Math.min(days, 7) * 24), d = sinceDate(days);
  const vars = {zt: {z: ZONE, t}, zd: {z: ZONE, d}, at: {a: ACC, t}, ad: {a: ACC, d}};
  return Object.keys(BLOCKS).map(name => {
    const scope = BLOCKS[name][0];
    return {name, scope, label: LABEL[name] || name, query: query(scope, [name]), variables: vars[scope],
      root: scope[0] === 'z' ? 'zones' : 'accounts'};
  });
}
