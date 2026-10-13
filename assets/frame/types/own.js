import { holds, FRAME, KIND } from '../../kinds.js';
import { D } from '../../core/data.js';
import { esc } from '../../core/html.js';
import { iconHTML, moneyHTML } from '../../core/format.js';
import { lazy } from '../../core/lazy.js';
import { late } from '../../frame/seam.js';
import { SWAPPED } from '../../frame/swap.js';

/* ---------- a switch on the card ----------
   Something outside the item changes what the item is while it is worn. The switch sits on the card the
   player is already reading, off until it is pressed, and what it does is the granting card's own lines —
   the declaration names that card and nothing of the game's wording is written down twice (assets/kinds.js,
   the "swaps" field). It is on for the visit, so it stays on as you walk from card to card. */
const swapsOf = (it, f) => (f.of || []).filter(s => holds(it, s.on) && D.byKey.get(s.card));
function swapHTML(it, f, full){
  if(!full) return '';
  const list = swapsOf(it, f);
  if(!list.length) return '';
  return '<div class="card-swaps">' + list.map(s => {
    const c = D.byKey.get(s.card), on = SWAPPED.has(s.label);
    return '<div class="card-swap' + (on ? ' on' : '') + '">' +
      '<button type="button" class="swap" data-swap="' + esc(s.label) + '" aria-pressed="' + on + '"><i aria-hidden="true"></i>' +
        esc(s.label) + '</button>' +
      (on ? '<ul class="card-ls swap-ls">' + (c.ls || []).map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' +
        '<button type="button" class="uses-row swap-src" data-key="' + esc(s.card) + '">' +
        '<span class="uses-ic">' + iconHTML(c) + '</span><span class="uses-t"><b>' + esc(c.n) + '</b>' +
        '<span>' + esc(c.s || '') + '</span></span></button>' : '') + '</div>';
  }).join('') + '</div>';
}

/* ---------- the bench's own fields ----------
   The item as it stands, and the currency picked for it. Both read the card's own state, which its module
   keeps and hands over whole; nothing about crafting is worked out here — docs/craft-sim.md holds the rules
   and assets/engine.js runs them. Every control says what it does in `data-do`, and the popup hands that
   word to the card's own module.
   A modifier's weight and its share of its own side are printed where the player is choosing, and only
   where the pool is measured: an even pool prints no share on any row and says so in a line of its own.
   No chance is ever reported per hit, anywhere. */
const RARITY = {normal: 'Normal', magic: 'Magic', rare: 'Rare'};
const modLi = m => '<li' + (m.frac ? ' class="frac"' : '') + '><span class="bn-ml">' +
  m.lines.map(esc).join('<br>') + '</span><span class="bn-mm">' +
  [m.tier, m.lvl ? 'level ' + m.lvl : '', m.src, m.frac ? 'fractured' : ''].filter(Boolean).map(esc).join(' · ') +
  '</span></li>';
function sideHTML(p, a, label){
  const rows = (p.mods || []).filter(m => m.side === a);
  return '<div class="bn-side"><p class="bn-h4">' + label + ' <span>' + p.held[a] + '/' + p.caps[a] + '</span></p>' +
    (rows.length ? '<ul class="bn-mods">' + rows.map(modLi).join('') + '</ul>' : '') + '</div>';
}
/* the pool as it stands: what one more roll can still land on. The first 40 of them, then the count of the
   rest — the Craft tab draws the whole table for a kind of item. (A base item's card has a pool block of its
   own, above: that one is what the base can ever have, this one is what this item can still take.) */
function benchPoolHTML(p){
  const pool = p.pool;
  if(!pool || !pool.rows.length) return '';
  const cap = 40, over = Math.max(0, pool.rows.length - cap);
  const row = r => '<li><span class="bn-ml">' + r.lines.map(esc).join('<br>') + '</span><span class="bn-mm">' +
    [r.side === 'p' ? 'Prefix' : 'Suffix', r.tier, 'level ' + r.lvl, r.w ? r.w.toLocaleString() : '']
      .filter(Boolean).map(esc).join(' · ') + '</span>' +
    (r.share ? '<span class="bn-sh">' + esc(r.share) + '</span>' : '') + '</li>';
  return '<details class="bn-pool"><summary>' + pool.rows.length.toLocaleString() +
    ' modifiers can still roll here</summary><ul class="bn-mods bn-poolls">' +
    pool.rows.slice(0, cap).map(row).join('') + '</ul>' +
    (over ? '<p class="note">' + esc(FRAME.more(over)) + '</p>' : '') +
    (pool.src ? '<p class="card-src">' + esc(pool.src) + '</p>' : '') + '</details>';
}
/* The item itself, on both cards: the bench draws the pickers over it, and on a run it is the thing you use
   a currency on, which is the order the game does it in. One renderer, and the card's own state says which
   of the two this is. */
function benchItemHTML(p){
  if(!p) return '';
  const opt = (v, n, on) => '<option value="' + esc(v) + '"' + (on ? ' selected' : '') + '>' + esc(n) + '</option>';
  const pick = !p.pickers ? '' : '<div class="bn-pickers">' +
    '<label class="bn-lab"><span class="lbl">Item class</span><select class="field" data-do="kind">' +
      p.kinds.map(k => opt(k.id, k.n, k.id === p.cls)).join('') + '</select></label>' +
    (p.bases.length ? '<label class="bn-lab"><span class="lbl">Base</span><select class="field" data-do="base">' +
      p.bases.map(b => opt(b.n, b.n + (b.dl > 1 ? ' · level ' + b.dl : ''), b.n === p.base)).join('') +
      '</select></label>' : '') +
    '<label class="bn-lab"><span class="lbl">Item level <b>' + p.ilvl + '</b></span>' +
      '<input class="bn-range" type="range" min="' + (p.ilvlMin || 1) + '" max="' + p.ilvlMax +
      '" value="' + p.ilvl + '" data-do="ilvl"></label>' +
    '</div>';
  if(!p.base) return pick;
  const socks = (p.sockets || []).filter(Boolean);
  const body =
    '<p class="bn-ih"><b>' + esc(p.base) + '</b><span>' + esc((p.corrupt ? 'Corrupted ' : '') +
      (RARITY[p.rarity] || '') + ' ' + p.kind + ' · item level ' + p.ilvl) + '</span></p>' +
    ((p.imp || []).length ? '<ul class="bn-imp">' + p.imp.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') +
    sideHTML(p, 'p', 'Prefixes') + sideHTML(p, 's', 'Suffixes') +
    (p.so ? '<div class="bn-side"><p class="bn-h4">Augment sockets <span>' + socks.length + '/' + p.so + '</span></p>' +
      (socks.length ? '<ul class="bn-mods">' + socks.map(r => '<li><span class="bn-ml">' + esc(r) +
        '</span></li>').join('') + '</ul>' : '') + '</div>' : '') +
    (p.quality ? '<p class="bn-qual">' + esc(p.quality) + '</p>' : '');
  // on a run the item is the thing you use the currency on, so the whole of it is the button
  const item = p.use
    ? '<button type="button" class="bn-item use r-' + p.rarity + '" data-do="use" aria-label="' +
      esc(p.use) + '">' + body + '<span class="bn-useon">' + esc(p.use) + '</span></button>'
    : '<div class="bn-item r-' + p.rarity + '">' + body + '</div>';
  return pick + item + benchPoolHTML(p);
}
/* what the bench is holding, in the order it was picked, each one removable */
function picksHTML(p){
  if(!p || !p.base) return '';
  const list = p.picks || [];
  if(!list.length) return '<p class="note bn-nopick">Nothing picked yet.</p>';
  return '<div class="bn-holding"><p class="bn-h4">Picked <span>' + list.length + '</span></p><ul class="bn-picks">' +
    list.map((x, i) => '<li class="bn-prow' + (x.omen ? ' omen' : '') + '">' +
      '<span class="bn-ic">' + (x.img ? '<img src="' + esc(x.img) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>' +
      '<span class="bn-pn"><b>' + esc(x.n) + '</b>' + (x.t ? '<span>' + esc(x.t) + '</span>' : '') + '</span>' +
      (x.v !== undefined && x.v !== null ? '<span class="bn-px">' + moneyHTML(x.v) + '</span>' : '') +
      '<button type="button" class="bn-x" data-do="drop:' + i + '" aria-label="Take ' + esc(x.n) +
      ' off the bench">Remove</button></li>').join('') + '</ul></div>';
}

/* ---------- an interaction nobody has settled ----------
   Two fields on an interaction card (assets/kinds.js, tools/interactions.py): what players report about
   this one, and how often each open interaction gets reported at all. Both are live, so each leaves a box
   and the module fills it when the answer lands — the same shape as a field whose table is a file of its
   own. In the popup only: the grid is for reading, and a card nobody opens asks for nothing. */
function clarifyFill(host, it, f, o){
  if(!host) return;
  lazy('./ui/clarify.js', 'What players report').then(m => { if(host.isConnected) m.fill(host, it, f, o); }, () => {});
}

/* ---------- player drop reports ----------
   "I got it from there", counted on both ends (assets/kinds.js gotfrom and gothere, worker/community.js). Live,
   so the box is left and assets/drops.js fills it when the answer lands. In the popup only. */
function reportsFill(host, it, f, o){
  if(!host) return;
  lazy('./ui/drops.js', 'Player reports').then(m => { if(host.isConnected) m.fill(host, it, f, o); }, () => {});
}

/* ---------- a field the kind's own module fills ----------
   A card that is an application rather than a row of the index leaves a box and its own module puts the
   application in it (KINDS own), the same shape as a field whose table is a file of its own. One renderer,
   no kind named: the module is the kind's own declaration, and the node it makes is its own to keep, so
   Back and Forward bring the card back with whatever state it held. */
const OWN = {};   // the modules a kind draws its card with, imported once each
function ownFill(host, it, f, o){
  const url = (KIND[it.k] || {}).own;
  if(!host || !url) return;
  const had = OWN[url];
  if(had) return void (had.fill && had.fill(host, it, f, o));
  lazy(url).then(m => { OWN[url] = m; if(host.isConnected && m.fill) m.fill(host, it, f, o); }, () => {});
}

/* ---------- the builder's own fields ----------
   Three fields that draw a build file's own state: the budgets, the gear preview and the tree preview. Each
   reads the state the card's module keeps and hands over whole (assets/builder.js), the way the bench's
   three do, and nothing about a build is worked out here.

   A budget row is the bench's item panel: a heading with a count beside it, a list under it, sides labelled
   and counted. A row a Rare is in opens on the modifiers its own pool can roll, each with the number box and
   the slider the Craft tab and the Trade panel already draw — the control comes ready-made off the card's
   own state, because the panel that builds it is the one that knows the tiers (assets/trade.js valHTML).

   No budget is ever counted in currency: the market prices no rare, so the counts are the budget and the
   price rides along where there is one. */
const sideCount = (b, a) => b.caps ? '<span class="bn-h5">' + (a === 'p' ? 'Prefixes' : 'Suffixes') + ' <b>' +
  b.held[a] + '/' + b.caps[a] + '</b></span>' : '';
function famRow(r){
  const said = r.lines.map(esc).join('<br>');
  const corner = r.of > 1 ? (r.live < r.of ? r.live + ' of ' + r.of : r.of) + ' tiers' : 'level ' + r.lvl;
  return '<div class="cr-fam' + (r.v === undefined ? '' : ' on') + '" data-f="' + esc(r.f) + '">' +
    '<div class="cr-fhd"><span class="cr-ft">' + said + '</span><span class="cr-tn">' + esc(corner) + '</span></div>' +
    '<div class="cr-fctl">' + (r.ctl || '') + '</div></div>';
}
function budgetRow(b){
  const head = '<p class="bn-h4"><button type="button" class="bd-open" data-do="row:' + esc(b.id) + '"' +
    ' aria-expanded="' + (b.open ? 'true' : 'false') + '">' + esc(b.n) + '</button><span>' + esc(b.count) + '</span></p>';
  const held = !b.it ? '' :
    '<ul class="bn-mods bd-held"><li><button type="button" class="bd-nm" data-do="see:' + esc(b.key) + '">' +
      esc(b.it.n) + '</button><span class="bn-mm">' + esc(b.it.s) + '</span>' +
      '<button type="button" class="bn-x" data-do="drop:' + esc(b.id) + '" aria-label="Out of the slot">Remove</button></li>' +
      b.lines.map(l => '<li><span class="bn-ml">' + esc(l) + '</span></li>').join('') + '</ul>';
  const counts = b.caps ? '<p class="bd-sides">' + sideCount(b, 'p') + sideCount(b, 's') +
    (b.sockets ? '<span class="bn-h5">Augment sockets <b>0/' + b.sockets + '</b></span>' : '') + '</p>' : '';
  const open = !b.open || !b.fams ? '' : '<div class="cr-fams bd-fams">' +
    '<label class="bn-lab"><span class="lbl">Item level <b>' + b.ilvl + '</b></span>' +
      '<input class="bn-range" type="range" min="' + b.ilvlMin + '" max="' + b.ilvlMax + '" value="' + b.ilvl +
      '" data-do="ilvl:' + esc(b.id) + '"></label>' +
    b.fams.map(famRow).join('') + '</div>';
  return '<div class="bn-side bd-brow' + (b.open ? ' open' : '') + '">' + head + held + counts + open + '</div>';
}
/* A cluster in the build: what it costs to reach, what is taken inside it, and one row per node — the
   bench's own sides, because a row here carries three things a chip cannot. A node in more than one cluster
   carries the word on every row it is on, so turning it on is never a surprise somewhere else. */
function clusterRow(s){
  const cost = (s.reach === null ? 'no way there yet' : s.reach + ' to reach') + ' · ' + s.took.length +
    ' inside · ' + s.points + (s.points === 1 ? ' point' : ' points');
  return '<div class="bn-side bd-clus"><p class="bn-h4">' + esc(s.n) +
    '<span>' + esc(s.took.length + '/' + s.all) + '</span></p>' +
    '<p class="bd-cost">' + esc(cost) + '</p><ul class="bn-mods bd-nodes">' + s.nodes.map(n =>
      '<li><button type="button" class="bd-node" data-do="node:' + esc(s.c + '/' + n.at) + '"' +
      ' aria-pressed="' + (n.on ? 'true' : 'false') + '"><span class="bn-ml">' + esc(n.n) + '</span><span class="bn-mm">' + esc(n.said) +
      (n.shared ? '</span><span class="bd-sh">shared' : '') + '</span></button></li>').join('') + '</ul>' +
    '<button type="button" class="bn-x" data-do="cluster:' + esc(s.c) + '" aria-label="Out of the build">Remove</button></div>';
}
function budgetHTML(b, full){
  if(!b) return '';
  const rows = [...b.rows.map(budgetRow),
    '<div class="bn-side bd-brow"><p class="bn-h4">Jewels<span>' + b.jewels.held + '/' + b.jewels.of + '</span></p>' +
      '<p class="note">The sockets the tree gives.</p>' + b.jewels.rows.map(jewelRow).join('') + '</div>',
    '<div class="bn-side bd-brow"><p class="bn-h4">Supports<span>' + b.supports + '</span></p>' +
      '<p class="note">The game decides how many fit.</p></div>',
    '<div class="bn-side bd-brow"><p class="bn-h4">Points<span>' + b.points.total + '</span></p>' +
      (b.points.path ? '<p class="bd-cost">' + b.points.path +
        (b.points.path === 1 ? ' point on the path' : ' points on the path') + '</p>' : '') +
      (b.points.steps.length ? b.points.steps.map(clusterRow).join('') : '<p class="note">No cluster taken.</p>') +
      '</div>'];
  const cap = full ? rows.length : FRAME.lines;
  const over = rows.length - cap > FRAME.slack ? rows.length - cap : 0;
  return '<div class="bd-budget"><p class="card-facts">Budgets</p>' +
    rows.slice(0, over ? cap : rows.length).join('') +
    (over ? '<p class="card-facts">' + esc(FRAME.more(over)) + '</p>' : '') +
    (b.big ? '<p class="card-src">' + b.big.toLocaleString() +
      ' bytes, over the 16,384 a file holds.</p>' : '') +
    '</div>';
}
/* A jewel in a socket, and the cluster it is socketed against. No file we read carries a jewel's radius in
   game units, so the player says which cluster the socket covers and the row says why it asks. */
function jewelRow(j){
  return '<div class="bd-jewel"><button type="button" class="bd-nm" data-do="see:' + esc(j.key) + '">' +
    esc(j.n) + '</button>' +
    (j.clusters.length
      ? '<label class="bn-lab"><span class="lbl">Socketed against</span>' +
        '<select class="field" data-do="socket:' + j.i + '"><option value="">No cluster</option>' +
        j.clusters.map(c => '<option value="' + esc(c.c) + '"' + (c.c === j.c ? ' selected' : '') + '>' +
          esc(c.n) + '</option>').join('') + '</select></label>'
      : '<p class="note">No cluster taken yet.</p>') +
    '<p class="card-src">The radius is not published, so this jewel covers the cluster it is socketed against.</p>' +
    '</div>';
}
/* The gear preview: one tile per slot, filled in the frame's fixed order, with an empty box where nothing is
   chosen. A pointer over a tile draws the card the site already draws, floated beside it; a finger taps and
   the card opens on the trail. The same card either way — nothing here is composed, and a slot holding a
   Rare shows the base and what that base can roll, which is the base card's own block. */
function gearHTML(b){
  if(!b) return '';
  const tile = t => {
    const it = t.it;
    const inner = it ? iconHTML(it) : '<span class="card-ic"></span>';
    const drop = t.jewel !== undefined ? 'dropjewel:' + t.jewel : 'drop:' + t.id;
    return '<span class="bd-tile' + (it ? ' on' : '') + '">' +
      '<button type="button" class="bd-slot" data-do="' + (it ? 'see:' + esc(it.k + ':' + it.id) : 'chip:' + esc(t.id)) +
      '" aria-label="' + esc(it ? it.n : t.n) + '">' + inner + '<span class="bd-sn">' + esc(t.n) + '</span></button>' +
      (it ? '<span class="bd-tip">' + late.card(it, {detail: true, href: null}).outerHTML +
        '</span><button type="button" class="bn-x" data-do="' + esc(drop) + '" aria-label="Out of the slot">Remove</button>' : '') +
      '</span>';
  };
  return '<div class="bd-gear"><p class="card-facts">Gear</p>' + b.gear.map(tile).join('') + '</div>';
}
/* The tree preview, beside the gear preview and filling the same way: the whole main tree behind, what is
   allocated over it and the path between. Drawn once per change, never per frame — 4,483 dots and 5,393
   lines is under a third of what the map draws in one picture. */
function treeHTML(b){
  if(!b || !b.tree) return '';
  const t = b.tree;
  const said = b.points.total + (b.points.total === 1 ? ' point' : ' points') +
    (b.points.path ? ' · ' + b.points.path + ' on the path' : '');
  return '<figure class="bd-tree"><figcaption>Passive tree</figcaption>' +
    '<svg viewBox="0 0 ' + t.w + ' ' + t.h + '" aria-hidden="true">' +
    '<path class="bd-back" d="' + t.back + '"/>' +
    (t.path ? '<path class="bd-road" d="' + t.path + '"/>' : '') +
    (t.on ? '<path class="bd-taken" d="' + t.on + '"/>' : '') +
    '<path class="bd-start" d="' + t.start + '"/></svg>' +
    '<p class="card-facts">' + esc(said) + '</p></figure>';
}

export { swapHTML, benchItemHTML, picksHTML, clarifyFill, reportsFill, OWN, ownFill, budgetHTML, gearHTML, treeHTML };
