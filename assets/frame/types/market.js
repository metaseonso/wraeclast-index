import { tableOf } from '../../frame/types/item.js';
import { MON, leagues, LEAGUE_COLOUR } from '../../core/data.js';
import { esc } from '../../core/html.js';
import { ago, isUnit } from '../../core/format.js';

/* ---------- the Currency Exchange, measured ----------
   The daily market files (design/market-products.md), on an opened currency card: how easy it is to trade and
   how much is in stock, its price by league day beside the leagues before it, the other leagues' price for it,
   and the hours of the week it trades most. Every one is a sum or a ratio of what really traded on GGG's feed,
   hour by hour; nothing is modelled. Each file is fetched the first time a card asks for it, once, and the
   Market tab (assets/market.js) reads the same copies.
   A price is shown with the hour it is from, in its own league's orbs: an exalted is not worth the same in two
   leagues, so no price here is turned into exalted at today's rate. */
export const table = tableOf;
const MKROWS = new WeakMap();
// a product file's row for a name: the list's rows by their first cell, the lookup made once per list
export function mkRow(list, n){
  if(!Array.isArray(list)) return null;
  if(!MKROWS.has(list)) MKROWS.set(list, new Map(list.map(r => [r[0], r])));
  return MKROWS.get(list).get(n) || null;
}
// a card's own part, out of its bundle: the key file names the bundle, and the bundle holds the card
function mkPart(f, it){
  const id = it[f.at];
  return tableOf(f.key).then(k => {
    const n = k && k.site && k.site.cards && k.site.cards[id];
    return n ? tableOf(f.file.replace('#', n)).then(b => (b && b.cards && b.cards[id]) || null) : null;
  });
}
// an amount in divines as the files give it (three figures), or in exalted where the thing is the Divine Orb
export function divText(v, unit = 'div'){
  if(v === null || v === undefined || !isFinite(v)) return '';
  return (Math.abs(v) >= 100 ? Math.round(v).toLocaleString('en') : String(+(+v).toPrecision(3))) + ' ' + unit;
}
export const pct = (v, dp = 0) => v === null || v === undefined || !isFinite(v) ? '' :
  (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en', {maximumFractionDigits: dp}) + '%';
export const utcHour = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' +
  String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0') + ' UTC'; };
// the rule a file was built by and the note on its numbers, as the file words them: a source line's tooltip
export const mkTip = t => [t.rule, t.thresholds && t.thresholds.note].filter(Boolean).join(' ');
/* Where a market file's numbers come from and how old they are: the file's own source line, the last hour of
   the feed it read, and its flags. A file more than two days behind says so in red. */
export function mkSource(t, also, short){
  if(!t) return '';
  const old = t.updated && Date.now() - Date.parse(t.updated) > 2 * 864e5;
  return '<p class="card-src" title="' + esc(mkTip(t)) + '">' + esc(short || !t.source ? 'Source: Currency Exchange' : t.source) +
    (also ? ' · ' + esc(also) : '') +
    (t.updated ? ' · <span' + (old ? ' class="err"' : '') + '>last hour read ' + esc(utcHour(t.updated)) + ', ' + esc(ago(t.updated)) + '</span>' : '') +
    Object.entries(t.flags || {}).map(([k, v]) => ' <span class="pill" title="' + esc(v) + '">' + esc(k) + '</span>').join('') + '</p>';
}
/* Each league's colour, as the price chart draws it (data/leagues.json): the one copy of the league dates */
export function leagueColours(){
  return leagues().then(f => { for(const l of (f && f.leagues) || []) if(l.colour) LEAGUE_COLOUR.set(l.name, l.colour); return LEAGUE_COLOUR; });
}
/* Lines by league day, one per league, each in its league's colour and the newest solid: a price chart or the
   price index. On a log scale where `log` says so (a price that grew tenfold in one league and not in another
   still reads). `days` is [[league, [day 1, day 2, ...]], ...], oldest first; null where nothing traded. */
export function dayLines(days, {upto, log, unit = '', h = 90} = {}){
  const series = (days || []).filter(([, v]) => (v || []).some(x => x !== null && x > 0));
  if(!series.length) return '';
  const most = Math.max(...series.map(([, v]) => v.length));
  const W = Math.min(most, upto || most), w = 300;
  const vals = [];
  for(const [, v] of series) for(const x of v.slice(0, W)) if(x !== null && x > 0) vals.push(x);
  if(vals.length < 2) return '';
  const f = log ? Math.log : x => x;
  const lo = f(Math.min(...vals)), hi = f(Math.max(...vals)), span = hi - lo || 1;
  const newest = series.length - 1;
  const col = i => i === newest ? 'var(--text)' : LEAGUE_COLOUR.get(series[i][0]) || 'var(--faint)';
  const paths = series.map(([, v], i) => {
    let d = '', on = false;
    for(let j = 0; j < Math.min(v.length, W); j++){
      const y = v[j];
      if(y === null || !(y > 0)){ on = false; continue; }
      d += (on ? 'L' : 'M') + ((W > 1 ? j / (W - 1) : 0) * (w - 4) + 2).toFixed(1) + ' ' + (h - 4 - ((f(y) - lo) / span) * (h - 8)).toFixed(1);
      on = true;
    }
    return d ? '<path d="' + d + '" fill="none" stroke="' + col(i) + '"' + (i === newest ? '' : ' stroke-dasharray="5 3"') +
      ' stroke-width="' + (i === newest ? 2 : 1.4) + '" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>' : '';
  }).join('');
  const key = series.map(([n], i) => '<li><i style="border-color:' + col(i) + (i === newest ? '' : ';border-top-style:dashed') + '"></i>' +
    esc(n) + '</li>').reverse().join('');
  const num = x => unit ? divText(x, unit) : Math.round(x).toLocaleString('en');
  return '<figure class="chart mk-chart"><svg viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" style="height:' + h + 'px" aria-hidden="true">' +
    paths + '</svg><ul class="chart-key">' + key + '</ul><figcaption class="chart-said">League days 1–' + W + ' · ' +
    esc(num(Math.min(...vals))) + ' to ' + esc(num(Math.max(...vals))) + (log ? ', log scale' : '') + '</figcaption></figure>';
}
const LIQUID = {Easy: 'Easy to trade', Slow: 'Slow to trade', Thin: 'Thin to trade'};
const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const unitOf = it => isUnit(it) ? 'ex' : 'div';
/* one drawing per part a field can ask for (FIELDS `of`): {html, tip}, or nothing where the file has no row */
const MKT = {
  pill: (it, t, f) => {
    const r = mkRow(t.items, it[f.at]), say = r && LIQUID[r[1]];
    return say ? {html: esc(say), tip: mkTip(t) + Object.entries(t.flags || {}).map(([k, v]) => ' ' + k + ': ' + v).join('')} : null;
  },
  stock: (it, t, f) => {
    const r = mkRow(t.items, it[f.at]), n = r && r[5];
    return n > 0 ? {html: 'Up to ' + n.toLocaleString('en') + ' in stock · ' + esc(ago(t.updated)),
      tip: 'The most on offer on its Divine, Exalted and Chaos Orb markets in the hour of ' + utcHour(t.updated) + '. ' +
        (t.source || '')} : null;
  },
  days: (it, p, f) => {
    if(!p.days) return null;
    const unit = unitOf(it), chart = dayLines(p.days, {upto: Math.max(56, ((p.days[p.days.length - 1] || [])[1] || []).length + 7), log: true, unit});
    const s = p.sameDay, past = s && (s.past || []).filter(x => x[1] !== null).slice().reverse();
    const same = s && s.now !== null && s.now !== undefined ? '<p class="card-facts">Day ' + s.day + ': ' + esc(divText(s.now, unit)) +
      (past.length ? ' · past leagues on day ' + s.day + ': ' + past.map(([n, v]) => esc(n) + ' ' + esc(divText(v, unit))).join(', ') : '') + '</p>' : '';
    if(!chart && !same) return null;
    return {html: '<p class="card-facts">' + esc(f.label || '') + '</p>' + chart + same + mkSource(p, 'each league in its own orbs', 1)};
  },
  gap: (it, t, f) => {
    // [name, league, hours, Hardcore, hours, %, past league, hours, %] (the file's own "all")
    const r = mkRow(t.every, it[f.at]), unit = unitOf(it);
    if(!r) return null;
    const rows = [[t.hardcore, r[3], r[4], r[5]], [t.past, r[6], r[7], r[8]]].filter(x => x[0] && x[1] !== null && x[2] > 0);
    if(!rows.length || r[1] === null) return null;
    const li = (n, v, hrs, gap) => '<li><span class="pool-ml">' + esc(n) + ': ' + esc(divText(v, unit)) + '</span><span class="pool-rs">' +
      (gap !== null ? esc(pct(gap)) + ' on ' + esc(t.league) + ' · ' : '') + 'traded in ' + hrs + ' of 24 hours</span></li>';
    return {html: '<p class="card-facts">' + esc(f.label || '') + '</p><ul class="card-pool">' + li(t.league, r[1], r[2], null) +
      rows.map(x => li(...x)).join('') + '</ul>' + mkSource(t, 'each league in its own orbs', 1)};
  },
  sell: (it, p, f) => {
    const s = p.sell;
    if(!s || !Array.isArray(s.vol) || s.vol.length !== 168) return null;
    const top = Math.max(...s.vol) || 1;
    const cells = WEEK.map((d, i) => '<b>' + d + '</b>' + s.vol.slice(i * 24, i * 24 + 24).map((v, hr) =>
      '<i style="opacity:' + Math.max(0.08, v / top).toFixed(2) + '" title="' + d + ' ' + String(hr).padStart(2, '0') + ':00 UTC · ' +
      (v / 100).toFixed(2) + 'x the day’s average"></i>').join('')).join('');
    const axis = '<b></b>' + Array.from({length: 24}, (_, hr) => '<span>' + (hr % 6 ? '' : hr) + '</span>').join('');
    return {html: '<p class="card-facts">' + esc(f.label || '') + ', UTC</p><div class="mk-heat" role="img" aria-label="' +
      esc(s.most || '') + '">' + cells + axis + '</div>' +
      [s.most, s.high].filter(Boolean).map(l => '<p class="card-facts">' + esc(l) + '</p>').join('') + mkSource(p, '', 1)};
  },
};
function mkFill(host, it, f){
  const draw = host && MKT[f.of];
  if(!draw) return;
  Promise.all([f.key ? mkPart(f, it) : tableOf(f.file), leagueColours()]).then(([t]) => {
    const out = t && draw(it, t, f);
    if(!out || !host.isConnected) return;
    host.innerHTML = out.html;
    if(out.tip) host.title = out.tip;
    host.hidden = false;
  }).catch(() => {});
}

export { mkFill };
