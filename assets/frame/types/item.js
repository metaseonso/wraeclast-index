import { getJSON } from '../../core/data.js';
import { drawLine, mechSpans } from '../../frame/types/reqs.js';
import { craftHref } from '../../frame/types/index.js';
import { esc } from '../../core/html.js';
import { lazy } from '../../core/lazy.js';

/* ---------- what a thing adds to an item, per kind of item ----------
   The game's own line on an essence says a guaranteed modifier and stops there, while the modifier itself is a
   different one on a bow than on a body armour. The table is a file of its own (the field's "file",
   assets/kinds.js), 24 kB, fetched the first time a card asks for it and kept for the rest of the visit — the
   full mod tables behind it are 1.6 MB and stay on the Craft tab, a class at a time.
   It is keyed by whatever the field reads (FIELDS.adds.at: an essence is keyed by its name), so anything else
   that adds a known modifier joins the same table without a line of code here.
   One row per modifier: every kind of item that gets that same one, the game's own wording for it, and which
   side it lands on. A kind of item opens the Craft tab on it, where the whole table for that kind is. */
const TABLES = {};   // file -> a promise of it, asked for once
const tableOf = file => TABLES[file] || (TABLES[file] = getJSON(file, {priority: 'low'}).catch(() => null));
/* a field's table, with @field filled in from the entry the way a gold button's link is, so one field can
   read a table per item class. An entry with nothing for one of them has no table at all. */
function fileOf(f, it){
  if(!f.file) return null;
  let have = true;
  const url = f.file.replace(/@(\w+)/g, (_, k) => {
    if(it[k] === undefined || it[k] === null || it[k] === '') have = false;
    return encodeURIComponent(it[k]);
  });
  return have ? url : null;
}
const SIDE = {p: 'Prefix', s: 'Suffix'};
function addsHTML(it, t, rows){
  const cl = t.cl || {}, lxk = t.lxk || [];
  // game wording like any other line: the file's own marks are drawn, and its keywords are worked out here
  const line = (x, spans) => drawLine(it, x, mechSpans(spans, lxk), spans);
  return '<ul class="card-adds">' + rows.map(([side, lv, kinds, lines, lx]) =>
    '<li><span class="adds-on">' + kinds.map(c => '<a class="uses-go" href="' + craftHref(c, '', cl[c]) + '">' +
        esc(cl[c] || c) + '</a>').join(', ') + '</span>' +
      '<span class="adds-ml">' + lines.map((x, i) => line(x, (lx || [])[i])).join('<br>') + '</span>' +
      '<span class="adds-rs">' + (SIDE[side] || '') + (lv ? ' · level ' + lv : '') + '</span></li>').join('') + '</ul>';
}
/* the card is drawn before the table is in, so the field leaves a box and fills it once the file lands. A name
   the table says nothing about leaves the box empty, and an empty box draws nothing. */
function addsFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const rows = t && t.e && t.e[it[f.at]];
    if(!rows || !rows.length || !host.isConnected) return;
    host.innerHTML = (f.label ? '<p class="card-facts">' + esc(f.label) + '</p>' : '') + addsHTML(it, t, rows);
    host.hidden = false;
  });
}

/* ---------- where a unique drops ----------
   One line and its labels, out of data/dropsfrom.json (tools/bosses.py), filled in once the table lands. The
   file names the tooltip a label carries ("Subject to change"), so no label's words are written down here.
   A name the table does not hold draws nothing. */
function dropFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const e = t && t.uniques && t.uniques[it[f.at]];
    if(!e || !e.line || !host.isConnected) return;
    const tips = t.labels || {};
    // the labels are pills in a row of their own, each as wide as its word
    host.innerHTML = '<p class="card-src">' + esc(e.line) + '</p>' + ((e.labels || []).length ? '<p class="card-flags">' +
      e.labels.map(l => '<span class="pill"' + (tips[l] ? ' title="' + esc(tips[l]) + '"' : '') + '>' + esc(l) + '</span>').join('') + '</p>' : '');
    host.hidden = false;
  });
}

/* ---------- what a base item can already have ----------
   Its own item class's table says which modifiers its pool rolls and which ones a corruption adds instead
   (data/craft/<class>.json, tools/craft.py — the same table the Craft tab works from, and assets/basepool.js
   is the one place that reads its shape). The field's "file" carries the class the entry names, so one
   declaration reaches every base of every class and no class is written down here.
   It is drawn on an opened card only: the grid keeps its shape, nothing of it is in first paint, and the
   table is asked for the first time a card is opened on it. One row per modifier, in the order the game data
   ships them, with how many tiers it has here and the item level the first of them needs. */
function poolHTML(rows, f){
  const tiers = rows.reduce((t, r) => t + (r.tiers.length || 1), 0);
  return '<p class="card-facts">' + esc(f.label || '') + ' · ' + rows.length + (tiers > rows.length ? ', ' + tiers + ' tiers in all' : '') + '</p>' +
    '<ul class="card-pool">' + rows.map(r => {
      const meta = [SIDE[r.side] || '', r.tiers.length > 1 ? r.tiers.length + ' tiers' : '',
        r.lvl > 1 ? 'item level ' + r.lvl + '+' : ''].filter(Boolean).join(' · ');
      return '<li><span class="pool-ml">' + r.lines.map(esc).join('<br>') + '</span>' +
        (meta ? '<span class="pool-rs">' + esc(meta) + '</span>' : '') + '</li>';
    }).join('') + '</ul>';
}
/* the reader of that table comes with the table, not with the page: neither is in first paint, and a card
   that is never opened on a base item asks for neither */
function poolFill(host, it, f){
  const url = host && fileOf(f, it);
  if(!url) return;
  Promise.all([lazy('./basepool.js'), tableOf(url)]).then(([bp, P]) => {
    const rows = bp.famsOf(P, bp.baseOf(P, it[f.at]), f.of);
    if(!rows.length || !host.isConnected) return;
    host.innerHTML = poolHTML(rows, f);
    host.hidden = false;
  }).catch(() => {});
}

/* ---------- what it does to you ----------
   A table of rows, each a name and the tags for what it does to you (data/monstermods.json; the map modifiers
   use the same words). The row is found by the card's own name, the lookup made once per table. A tag in the
   row's `est` was read off the name alone and says Estimate beside it; a tag in its `why` shows the game's own
   line on hover. The row's own source closes the block. */
const BYNAME = new WeakMap();
function rowByName(t, n){
  if(!BYNAME.has(t)) BYNAME.set(t, new Map((t.rows || []).map(r => [r.n, r])));
  return BYNAME.get(t).get(n);
}
// beside a tag read off a name alone, because the game gives the thing no words
const ESTIMATE = ' <span class="pill" title="Read off its name: the game gives it no words">Estimate</span>';
function dangerHTML(it, t, f){
  const r = rowByName(t, it[f.at]);
  if(!r || !(r.tags || []).length) return '';
  const est = new Set(r.est || []), why = r.why || {};
  return '<p class="card-facts">' + esc(f.label || '') + '</p><p class="card-tags">' + r.tags.map(g =>
    '<span' + (why[g] ? ' title="' + esc(why[g]) + '"' : '') + '>' + esc(g) + '</span>' + (est.has(g) ? ESTIMATE : ''))
    .join(' · ') + '</p>' + (r.src ? '<p class="card-src">' + esc(r.src) + '</p>' : '');
}
function dangerFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const html = t && dangerHTML(it, t, f);
    if(!html || !host.isConnected) return;
    host.innerHTML = html;
    host.hidden = false;
  });
}

export { tableOf, fileOf, addsFill, dropFill, poolFill, ESTIMATE, dangerFill };
