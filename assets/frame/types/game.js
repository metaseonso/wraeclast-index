import { esc } from '../../core/html.js';
import { holds, FRAME } from '../../kinds.js';
import { foldHTML } from '../../frame/types/patches.js';
import { tableOf } from '../../frame/types/item.js';
import { spark } from '../../core/format.js';

/* ---------- the game's own rules, and gold ----------
   data/rules.json (tools/rules.py): the game's constants a player meets, each worded, on the card it lands on by
   name. data/gold.json (tools/gold.py): a thing's gold number, by name, off one of the file's tables (f.of: the
   Currency Exchange's fee, a unique's gold value). Each with the table it was read from. */
function rulesHTML(it, t, f){
  const rows = (t.rows || []).filter(r => r.card === it[f.at] && r.text);
  if(!rows.length) return '';
  return '<p class="card-facts">' + esc(f.label || '') + '</p><ul class="card-rules">' +
    rows.map(r => '<li>' + esc(r.text) + (r.src ? '<span class="card-src">' + esc(r.src) + '</span>' : '') + '</li>').join('') + '</ul>';
}
function goldHTML(it, t, f){
  const tab = t[f.of] || {}, v = tab[it[f.at]], n = v && typeof v === 'object' ? v.fee : v;
  if(!(n > 0)) return '';
  return '<p class="card-facts">' + esc(f.label || '') + ' · <b>' + (+n).toLocaleString('en') + '</b> gold</p>' +
    (t[f.of + 'Src'] ? '<p class="card-src">' + esc(t[f.of + 'Src']) + '</p>' : '');
}
/* A gold price off a table of the file (f.of) that is not keyed by name: one flat price where the first of the
   declaration's tests holds (`flat`, each naming its key), else a list per key the declaration words (`say`),
   each the table's own numbers in its own order. The file's own Subject to change, with the declaration's why,
   and the file's source close it. */
function gemGoldHTML(it, t, f){
  const g = t[f.of];
  if(!g) return '';
  const ch = t.change || {}, n = x => (+x).toLocaleString('en');
  const flag = ch.label ? ' <span class="pill" title="' + esc([ch.tip, f.why].filter(Boolean).join(' ')) + '">' +
    esc(ch.label) + '</span>' : '';
  const src = g.src ? '<p class="card-src">' + esc(g.src) + '</p>' : '';
  const flat = (f.flat || []).find(c => holds(it, c));
  if(flat) return g[flat.then] > 0 ? '<p class="card-facts">' + esc(f.label || '') + ' · <b>' + n(g[flat.then]) +
    '</b> gold' + flag + '</p>' + src : '';
  let out = '', said = '';
  for(const l of f.lists || []){
    // `from`: what the list's first place stands for (gem level 1, 0% quality), `pre` and `post` the words around it
    const list = (g[l.at] || []).map((v, i) => [i + (l.from || 0), v]).filter(([, v]) => v > 0);
    if(!list.length) continue;
    // the fold's summary: the first list, first place to last, in the table's own numbers
    const at = x => n(x[1]) + ' at ' + (l.pre || '') + x[0] + (l.post || '');
    if(!said) said = list.length > 1 ? at(list[0]) + ' → ' + at(list[list.length - 1]) : at(list[0]);
    out += '<p class="card-facts">' + esc(l.is) + '</p><ul class="card-gold">' + list.map(([at, v]) =>
      '<li><span>' + esc(at + (l.post || '')) + '</span><b>' + n(v) + '</b></li>').join('') + '</ul>';
  }
  return out && foldHTML({label: f.label || '', said},
    (flag ? '<p class="card-facts">' + flag.trim() + '</p>' : '') + out + src);
}
/* One word off a table of its own, found by the card's kind and the field's `at` ("c:Divine Orb" in its `of`
   part), as a pill that links to where the table is from: the file names its source (`src`) and its address
   (`url`), so a word that is not the game's says whose it is. A name the table does not hold draws nothing. */
function keyedFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const v = t && (t[f.of] || {})[it.k + ':' + it[f.at]];
    if(!v || !host.isConnected) return;
    host.textContent = (f.pre || '') + v + (t.url ? ' ↗' : '');
    if(t.url) host.href = t.url;
    if(t.src) host.title = t.src;
    host.hidden = false;
  });
}
const tableFill = draw => (host, it, f) => {
  if(!host) return;
  tableOf(f.file).then(t => {
    const html = t && draw(it, t, f);
    if(!html || !host.isConnected) return;
    host.innerHTML = html;
    host.hidden = false;
  });
};

/* ---------- how often it rolls, where the game rolls unseen ----------
   data/odds.json (tools/odds.py): one pool per weight table in the game's own files, each outcome with its weight
   and 1 in how many. The card's name is matched to an outcome's name exactly. One line per pool it is in, a
   weight of 0 drawing nothing; a pool whose shape is our reading of the table carries the file's own flag, its
   tooltip and the reason. The source closes the block. No price is multiplied into it, ever. */
function oddsHTML(it, t, f){
  const rows = [];
  for(const p of t.pools || []) for(const o of p.outcomes || [])
    if(o.name === it[f.at] && o.weight > 0) rows.push([p, o]);
  if(!rows.length) return '';
  const flags = t.flags || {};
  return '<p class="card-facts">' + esc(f.label || '') + '</p><ul class="card-pool">' + rows.map(([p, o]) =>
    '<li><span class="pool-ml">' + esc(p.pool) + ': 1 in ' + esc(o.oneIn.toLocaleString()) + '</span>' +
    '<span class="pool-rs">' + esc(p.of) + (p.sure ? '' : ' · <span title="' + esc((flags[p.flag] || '') +
      (p.why ? ' ' + p.why : '')) + '">' + esc(p.flag) + '</span>') + '</span></li>').join('') + '</ul>' +
    (t.source ? '<p class="card-src">Source: ' + esc(t.source) + '</p>' : '');
}
function oddsFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const html = t && oddsHTML(it, t, f);
    if(!html || !host.isConnected) return;
    host.innerHTML = html;
    host.hidden = false;
  });
}

/* ---------- a league mechanic, on its own keyword card ----------
   data/leaguemech.json (tools/mechanics_league.py): the entry whose `card` is this card's own key. The share is
   the mechanic's own currency over everything the Currency Exchange traded in the newest league the file reads,
   in basis points; the move is the last 7 league days against the 7 before them, each day weighed by what was
   traded that day, so a quiet day moves it less than a busy one. Measured, never modelled: no Estimate. */
const mechOf = (t, it) => t && (t.mechanics || []).find(e => e.card === it.k + ':' + it.id);
function shareHTML(it, t, f){
  const e = mechOf(t, it), p = t && t.popularity, lg = p && (p.leagues || [])[0];
  const row = e && p ? (p.rows || []).indexOf(e.key) : -1;
  if(row < 0 || !lg || !lg.total[row]) return '';
  const bp = lg.total[row] / 100, days = lg.days || [];
  const of = (a, b) => {   // the share over league days a..b, each day by what it traded
    let v = 0, w = 0;
    for(const d of days.slice(a, b)){ v += d[1] * d[2 + row]; w += d[1]; }
    return w ? v / w / 100 : null;
  };
  const n = days.length, now = n >= 14 ? of(n - 7, n) : null, was = now !== null ? of(n - 14, n - 7) : null;
  const move = now !== null && was !== null ? now - was : null;
  const pct = x => x < 0.1 ? 'under 0.1%' : x.toFixed(1) + '%';
  const r = move !== null ? Math.round(move * 10) / 10 : null;
  return '<p class="card-facts">' + esc(f.label || '') + ', ' + esc(lg.league) + ': <b>' + pct(bp) + '</b>' +
    (r !== null ? ' <span class="chg ' + (r > 0 ? 'up' : r < 0 ? 'down' : 'flat') +
      '" title="The last 7 league days against the 7 before">' + (r > 0 ? '▲' : r < 0 ? '▼' : '•') + ' ' +
      Math.abs(r).toFixed(1) + ' points</span>' : '') +
    spark(days.map(d => d[2 + row] / 100), r || 0) + '</p>' +
    '<p class="card-src" title="' + esc(p.method || '') + '">Source: ' + esc(p.source || '') + '</p>';
}
function mechlinesHTML(it, t, f){
  const e = mechOf(t, it);
  if(!e) return '';
  let out = '';
  for(const k of f.of || []){
    const rows = (e[k] || []).map(x => x.area ? esc(x.area) + ': ' + esc(x.boss) : esc(x.n) + ': ' + esc([].concat(x.ls || []).join(' · ')));
    if(rows.length) out += '<p class="card-facts">' + esc((f.say || {})[k] || '') + ' · ' + rows.length + '</p>' +
      '<ul class="card-ls">' + rows.map(x => '<li>' + x + '</li>').join('') + '</ul>';
  }
  return out;
}
/* A weighted pool out of a table of its own (FIELDS `from` and `of`): per pool its lines, each with its share
   of the pool, a line of weight 0 left out because it never rolls. A line that adds nothing says so in the
   declaration's own words (`none`); a line the file could not word is counted, never guessed. A pool the file
   flags carries the flag and its reason on hover (the file's own `flags`). The file's source closes it. */
function weightedHTML(it, t, f){
  const root = f.from ? t[f.from] : t, tips = t.flags || {};
  const pct = x => { const p = x * 100; return (p >= 10 ? Math.round(p) : +p.toFixed(1)) + '%'; };
  let out = '';
  for(const k of f.of || []){
    const p = root && root[k];
    const all = ((p && p.lines) || []).filter(x => x.weight > 0);
    const rows = all.filter(x => (x.text || []).length || (x.nothing && f.none));
    if(!rows.length) continue;
    const flag = p.flag ? ' <span class="pill" title="' + esc((tips[p.flag] || '') + (p.why ? ' ' + p.why : '')) + '">' +
      esc(p.flag) + '</span>' : '';
    out += '<p class="card-facts">' + esc((f.say || {})[k] || '') + flag + '</p><ul class="card-pool">' + rows.map(x =>
      '<li><span class="pool-ml">' + ((x.text || []).length ? x.text.map(esc).join('<br>') : esc(f.none)) + '</span>' +
      '<span class="pool-rs">' + (x.share ? pct(x.share) : '') + '</span></li>').join('') +
      (all.length > rows.length ? '<li class="more-n">' + esc(FRAME.more(all.length - rows.length)) + '</li>' : '') + '</ul>';
  }
  return out && out + (t.source ? '<p class="card-src">Source: ' + esc(t.source) + '</p>' : '');
}
const mechFill = draw => (host, it, f) => {
  if(!host) return;
  tableOf(f.file).then(t => {
    const html = t && draw(it, t, f);
    if(!html || !host.isConnected) return;
    host.innerHTML = html;
    host.hidden = false;
  });
};

export { rulesHTML, goldHTML, gemGoldHTML, keyedFill, tableFill, oddsFill, shareHTML, mechlinesHTML, weightedHTML, mechFill };
