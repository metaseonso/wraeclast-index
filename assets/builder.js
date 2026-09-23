/* The character builder: the option pool, the build files, the budgets and the tree.

   One card (assets/kinds.js, kind 'f') and one act. The card layer draws the budgets, the gear preview and
   the tree preview out of the state this file keeps and hands over whole; this file keeps the files, answers
   the card's own controls and works the pathing out. docs/proposal-builder.md holds the rules and the
   arithmetic behind every number in it.

   A card reaches a build through ACTS.pool, drawn beside Trade and the bench: it opens a row inside the
   popup with one checkbox per open file. Ticking writes to the pool, not to the build — nothing is chosen by
   ticking, it is only made available.

   Three files open at once, and a guest keeps what is open: sessionStorage, one key, the same store and the
   same try/catch the bench uses. A file is one row stored as a blob, not a row per pooled card — one write
   to save and one read to open, against 120 writes for a 60-card pool the other way round.

   Data: data/craft.json and data/craft/<kind>.json for the slots, the affix caps and the modifiers a base
   can roll (tools/craft.py, from the game files); data/tree-shape.json and data/clusters.json for the tree
   and the clusters cut out of it (tools/clusters.py, from the game's own tree). Prices come off
   data/market.json the way every card's do.

   No budget here is ever counted in currency: the market prices no rare, so a total would be right for part
   of a build and wrong for the rest. The counts are the budget, and the price rides along where there is
   one. */
import { D, esc, moneyHTML, openDetail, hrefOf, repaint, actPanel } from './app.js';
import { valHTML, syncVal } from './trade.js';
import * as E from './engine.js';

const KEY = 'wi.build';
const OPEN = 3;         // files open at once: three names and three boxes fit one row on a 375-pixel phone
const CAP = 16384;      // a file over this says its size on the card; nothing is trimmed behind the player
const JEWEL = 3;        // what a jewel socket is marked with in data/tree-shape.json (tools/clusters.py)

/* ---------- the data ---------- */
let X = null;                     // data/craft.json
let SHAPE = null;                 // data/tree-shape.json: where every node is and what it touches
let CLUST = null;                 // data/clusters.json: the tree cut by notable
const CLASSES = new Map();        // kind of item -> a promise of its own file
let CSS = null;

async function json(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(r.status);
  return r.json();
}
async function craftData(){
  if(!X){
    X = await json('data/craft.json');
    E.useData(X);
  }
  return X;
}
async function treeData(){
  if(!SHAPE) [SHAPE, CLUST] = await Promise.all([json('data/tree-shape.json'), json('data/clusters.json')]);
  return SHAPE;
}
function classData(id){
  if(!CLASSES.has(id)) CLASSES.set(id, json('data/craft/' + id + '.json').then(d => E.prepClass(d, id)));
  return CLASSES.get(id);
}
/* the bench's own styles and this card's, fetched the first time a build card or a pool row opens and never
   before: none of it is in the first paint, and the service worker keeps it with the rest of a deploy */
function styles(){
  return CSS || (CSS = Promise.all(['assets/bench.css', 'assets/builder.css'].map(href => new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.addEventListener('load', ok, {once: true});
    l.addEventListener('error', ok, {once: true});
    document.head.appendChild(l);
  }))));
}

/* ---------- the slots a build has ----------
   The frame's own order: armour, then jewellery, then the weapon set, then the jewels the tree gives, then
   flasks and charms. Each slot says which kinds of item the game lets it hold, and nothing else — how many
   modifiers a Rare may carry there, how many augment sockets it has and what its own pool can roll are the
   game's own numbers, read where the slot is drawn. */
const OFFHAND = ['shield', 'buckler', 'focus', 'quiver'];
const SLOTS = [
  ['body', 'Body armour', ['body-armour']],
  ['helmet', 'Helmet', ['helmet']],
  ['gloves', 'Gloves', ['gloves']],
  ['boots', 'Boots', ['boots']],
  ['amulet', 'Amulet', ['amulet']],
  ['ring1', 'Ring', ['ring']],
  ['ring2', 'Ring', ['ring']],
  ['belt', 'Belt', ['belt']],
  ['weapon', 'Weapon', null],           // null: whatever the game calls a weapon, off data/craft.json
  ['offhand', 'Offhand', null],
  ['lifeflask', 'Life flask', ['life-flask']],
  ['manaflask', 'Mana flask', ['mana-flask']],
  ['charm', 'Charm', ['charm']],
];
const weapons = () => X.classes.filter(c => c.g === 'Weapons').map(c => c.id);
function takes(id){                     // the kinds of item one slot holds
  const row = SLOTS.find(s => s[0] === id);
  if(!row) return [];
  if(row[2]) return row[2];
  return id === 'offhand' ? [...weapons(), ...OFFHAND] : weapons();
}
const labelOf = id => (SLOTS.find(s => s[0] === id) || [, ''])[1];
const clsOf = id => X.classes.find(c => c.id === id) || null;
const classOf = it => it ? (it.cr || (it.k === 'i' ? it.id : '')) : '';
/* which slots one card could fill: a slot that takes its item class, or the tree's own sockets for a jewel */
function slotsFor(it){
  const cr = classOf(it);
  if(!cr) return [];
  if(cr === 'jewel') return ['jewel'];
  return SLOTS.filter(s => takes(s[0]).includes(cr)).map(s => s[0]);
}
// a support is a gem the game's own tags call one, which is where the word comes from and not a list here
const isSupport = it => (it.tags || []).some(t => /^support$/i.test(t));
const poolable = it => ['g', 'u', 'b', 'p', 't', 'c'].includes(it.k);
/* what a pooled card would fill, in a word: what the checkbox row says beside the file's name */
function fillsWhat(it){
  if(it.k === 't') return 'Cluster';
  if(it.k === 'p') return 'Passive';
  if(it.k === 'g') return isSupport(it) ? 'Support slot' : 'Skill';
  if(classOf(it) === 'jewel') return 'Jewel';
  const s = slotsFor(it);
  if(s.length) return labelOf(s[0]);
  return it.k === 'c' ? 'Gem' : 'Item';
}

/* ---------- the files ---------- */
const blank = n => ({v: 1, id: '', n, st: 0, gear: {}, jewels: [], cl: [], pool: [], at: Date.now()});
let B = null;                     // what the session holds
const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
const get = k => { try { const s = sessionStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };

function held(){
  if(B) return B;
  const was = get(KEY);
  B = was && was.v === 1 && Array.isArray(was.files) ? was : {v: 1, files: [], on: ''};
  B.files = B.files.filter(f => f && f.v === 1 && f.n).slice(0, OPEN);
  for(const f of B.files) f.jewels = (f.jewels || []).map(x => typeof x === 'string' ? {k: x, c: ''} : x || null);
  return B;
}
function save(){
  for(const f of held().files){
    const size = JSON.stringify(f).length;
    f.big = size > CAP ? size : 0;    // over the cap: the card says how big it is and the file stands as it is
  }
  put(KEY, B);
}
function newFile(){
  const b = held();
  if(b.files.length >= OPEN) return null;
  let n = 1;
  while(b.files.some(f => f.n === 'Build ' + n)) n++;
  const f = blank('Build ' + n);
  f.id = 'b' + b.files.length + Date.now().toString(36);
  b.files.push(f);
  b.on = f.id;
  save();
  return f;
}
const fileOf = id => held().files.find(f => f.id === id) || null;
const current = () => fileOf(held().on) || held().files[0] || null;

/* ---------- the pool row under a card ----------
   One row per open file, in the popup, under the card: the file's name, a checkbox, and what the card would
   fill, so ticking is never a guess about where the thing lands. A card can be in more than one file. */
export async function openPool(it){
  if(!poolable(it)) return;
  await craftData();
  await styles();
  const node = document.createElement('section');
  node.className = 'bd-row';
  const key = it.k + ':' + it.id;
  const draw = () => {
    const b = held(), what = fillsWhat(it);
    node.innerHTML =
      '<p class="bn-h4">In the pool for <span>' + b.files.length + '/' + OPEN + '</span></p>' +
      (b.files.length ? '<ul class="bd-files">' + b.files.map(f =>
        '<li><label class="bd-file"><input type="checkbox" data-in="' + esc(f.id) + '"' +
          (f.pool.includes(key) ? ' checked' : '') + '><b>' + esc(f.n) + '</b>' +
          '<span>' + esc(what) + '</span></label>' +
          '<button type="button" class="btn" data-open="' + esc(f.id) + '">Open</button></li>').join('') + '</ul>'
        : '<p class="note">No build file yet.</p>') +
      '<p class="note">Choosing happens in the builder.</p>' +
      (b.files.length < OPEN ? '<button type="button" class="btn" data-new="1">New build</button>'
        : '<p class="note">A guest keeps three files, in this session.</p>');
  };
  draw();
  node.addEventListener('click', e => {
    const open = e.target.closest('[data-open]');
    if(open) return void openBuild(open.dataset.open);
    if(e.target.closest('[data-new]')){ newFile(); draw(); }
  });
  node.addEventListener('change', e => {
    const box = e.target.closest('[data-in]');
    const f = box && fileOf(box.dataset.in);
    if(!f) return;
    const at = f.pool.indexOf(key);
    if(box.checked && at < 0) f.pool.push(key);
    if(!box.checked && at >= 0) f.pool.splice(at, 1);
    save();
  });
  actPanel(node, 'pool');
}

/* ---------- the tree ----------
   One breadth-first pass over the whole main tree, re-run on every change: 4,483 nodes and 5,393 edges is
   about a millisecond, so nothing here is clever about it (docs/proposal-builder.md 2.5). */
let ADJ = null;
function adj(){
  if(ADJ) return ADJ;
  ADJ = Array.from({length: SHAPE.x.length}, () => []);
  for(let i = 0; i < SHAPE.e.length; i += 2){
    ADJ[SHAPE.e[i]].push(SHAPE.e[i + 1]);
    ADJ[SHAPE.e[i + 1]].push(SHAPE.e[i]);
  }
  return ADJ;
}
/* the fewest steps from anything allocated to anything wanted, and the nodes walked through to get there */
function walk(from, want){
  for(const h of from) if(want.has(h)) return [];
  const back = new Map(), q = [...from], A = adj();
  for(const h of from) back.set(h, -1);
  for(let i = 0; i < q.length; i++){
    for(const m of A[q[i]]){
      if(back.has(m)) continue;
      back.set(m, q[i]);
      if(want.has(m)){
        const road = [];
        for(let x = m; x >= 0 && !from.has(x); x = back.get(x)) road.push(x);
        return road.reverse();
      }
      q.push(m);
    }
  }
  return null;                    // nothing wanted is reachable from what is allocated
}
const clusterAt = id => (CLUST._at || (CLUST._at = new Map(CLUST.id.map((x, j) => [x, j])))).get(id);
const nodesOf = j => [CLUST.at[j], ...CLUST.in[j]];
const isShared = at => (CLUST._sh || (CLUST._sh = new Set(CLUST.sh))).has(at);
const cardAt = at => (CLUST.node[at] >= 0 ? D.byKey.get('p:' + CLUST.cards[CLUST.node[at]]) : null);
const startOf = f => SHAPE.st[f.st] || SHAPE.st[0];
/* Every cluster in the file, costed in the order it was taken, because the first may have paved half the
   road to the second. Nodes on the path that no cluster took are counted and named as path. */
function plan(f){
  const alloc = new Set([startOf(f)]);
  const steps = [], path = [];
  for(const c of f.cl){
    const j = clusterAt(c.c);
    if(j === undefined) continue;
    const mine = nodesOf(j);
    const took = mine.filter(at => (c.take || []).includes(at));
    const road = walk(alloc, new Set(mine));
    const walked = [];
    if(road) for(const at of road){
      alloc.add(at);
      if(!took.includes(at)) walked.push(at);   // a node walked through is a point, and never a second time
    }
    path.push(...walked);
    for(const at of took) alloc.add(at);
    const reach = road === null ? null : walked.length;
    steps.push({c: c.c, n: nameOf(c.c), reach, took, all: mine.length,
      points: (reach || 0) + took.length,
      nodes: mine.map(at => {
        const p = cardAt(at);
        return {at, n: p ? p.n : 'Passive', said: p ? (p.ls || [])[0] || '' : '',
          on: took.includes(at), shared: isShared(at), notable: at === CLUST.at[j]};
      })});
  }
  return {alloc, steps, path, total: alloc.size - 1};
}
const nameOf = id => { const c = D.byKey.get('t:' + id); return c ? c.n : id; };

/* ---------- what the card is holding ----------
   The shape the card's own fields read. Nothing about the frame is worked out here, and nothing about a
   build is worked out there. */
function budgetRows(f, d){
  return SLOTS.map(([id, label]) => {
    const got = f.gear[id];
    const it = got ? D.byKey.get(got.k) : null;
    const cl = it ? clsOf(classOf(it)) : null;
    const P = it && d[id];
    const base = P && it.k === 'b' ? (P.bases || []).find(b => b.n === it.n) : null;
    const caps = cl && base ? E.capsOf(cl, base, 'rare') : null;
    const want = (got && got.want) || {};
    const on = Object.keys(want);
    return {id, n: label, key: got ? got.k : '', open: !!(got && got.open),
      it: it ? {n: it.n, img: it.img, s: it.s || '', k: it.k} : null,
      lines: it && it.k === 'u' ? (it.ls || []) : [],
      count: it ? '1/1' : '0/1',
      sockets: cl ? cl.so || 0 : 0,
      caps: caps ? {p: caps[0], s: caps[1]} : null,
      held: caps ? {p: on.filter(x => P.fam[x] && P.fam[x][0] === 'p').length,
                    s: on.filter(x => P.fam[x] && P.fam[x][0] === 's').length} : null,
      ilvl: (got && got.ilvl) || 0, ilvlMin: base ? base.dl || 1 : 1, ilvlMax: X.ilvl,
      fams: got && got.open && base ? families(P, base, got, id) : null};
  });
}
/* The modifier families a base's own pool can roll, each with its tiers: the Craft tab's family row, and the
   same number box, the same slider and the same bands (assets/trade.js valHTML, assets/craft.js famHTML).
   What this item level cannot reach is greyed, not hidden, because a player choosing a base needs to see
   what raising it would buy. */
function families(P, base, got, slot){
  const pool = P.pools[base.p];
  if(!pool) return [];
  const by = new Map();
  for(const i of pool.m){
    const m = P.mods[i];
    let fm = by.get(m[1]);
    if(!fm) by.set(m[1], fm = {f: m[1], fam: P.fam[m[1]], tiers: []});
    fm.tiers.push(i);
  }
  const ilvl = got.ilvl || X.ilvl;
  const out = [...by.values()].map(fm => {
    const t = fm.tiers.map(i => P.mods[i]);
    const v = got.want[fm.f];
    const slider = t.length > 1 && t.every(m => m[5] !== null) && t[t.length - 1][6] > t[0][5];
    const row = {f: String(fm.f), side: fm.fam[0], lines: fm.fam[1], v,
      live: t.filter(m => m[2] <= ilvl).length, of: t.length, lvl: t[0][2], ctl: ''};
    const does = 'roll:' + slot + '/' + fm.f;
    if(slider){
      const lo = t[0][5], hi = Math.max(...t.map(m => m[6]));
      const tiers = t.map(m => [m[5], m[6], m[2]]);
      const step = [lo, hi, ...t.flatMap(m => [m[5], m[6]])].every(Number.isInteger) ? 1 : 0.01;
      row.ctl = valHTML({k: 'tv', do: does, lo, hi, step, v: v === undefined ? '' : v, tiers},
        '<input class="field tnum" type="number" data-do="' + does + '" step="' + step +
        '" value="' + (v === undefined ? '' : v) + '" aria-label="Roll">')
        .replace('</span><input type="range"', locked(t, ilvl, lo, hi) + '</span><input type="range"');
    } else {
      row.ctl = '<span class="ttier">' + esc(t.length > 1 ? t.length + ' tiers' : 'level ' + t[0][2]) + '</span>' +
        '<button type="button" class="btn bd-pick" data-do="' + does + '" aria-pressed="' + (v !== undefined) +
        '">' + (v === undefined ? 'Aim at it' : 'Aimed at') + '</button>';
    }
    return row;
  });
  out.sort((a, z) => (a.side === z.side ? 0 : a.side === 'p' ? -1 : 1) ||
    (z.v !== undefined) - (a.v !== undefined) || a.lines[0].localeCompare(z.lines[0]));
  return out;
}
/* grey over the tiers this item level cannot reach — not hidden, because a player choosing a base needs to
   see what raising it would buy (the Craft tab draws the same band, assets/craft.js lockHTML) */
function locked(t, ilvl, lo, hi){
  const n = t.length, w = hi - lo;
  if(n < 2 || !(w > 0)) return '';
  const at = x => ((x - lo) / w * 100).toFixed(2) + '%';
  const edges = [lo];
  for(let k = 1; k < n; k++) edges.push(Math.min(hi, Math.max(lo, (t[k - 1][6] + t[k][5]) / 2)));
  edges.push(hi);
  const ok = t.map(m => m[2] <= ilvl);
  const last = ok.lastIndexOf(true);
  if(last < 0) return '<i class="cr-lock" style="left:0;right:0"></i>';
  return last < n - 1 ? '<i class="cr-lock" style="left:' + at(edges[last + 1]) + ';right:0"></i>' : '';
}
/* the gear preview: one tile per slot, in the frame's fixed order, with an empty box where nothing is
   chosen — the same way a card's head keeps its art box whether or not there is art */
function gearTiles(f, sockets){
  const out = SLOTS.map(([id, label]) => {
    const got = f.gear[id];
    return {id, n: label, it: got ? D.byKey.get(got.k) || null : null};
  });
  for(let i = 0; i < sockets; i++){
    const got = f.jewels[i];
    out.push({id: 'jewel' + i, n: 'Jewel', jewel: i, it: got ? D.byKey.get(got.k) || null : null});
  }
  return out;
}
/* A jewel is socketed against a cluster the player names. The radius in game units is in nothing we read —
   not the tree, not the jewel pools, not the export's file list — so the builder asks which cluster the
   socket covers rather than working a distance out of a number nobody has published. */
function jewelRows(f, p){
  const taken = p.steps.map(s => ({c: s.c, n: s.n}));
  return f.jewels.map((got, i) => got ? {
    i, n: (D.byKey.get(got.k) || {}).n || got.k, key: got.k, c: got.c || '',
    clusters: taken,
  } : null).filter(Boolean);
}
/* The tree preview: the whole main tree behind, what is allocated over it, and the path between. The
   backdrop is worked out once a visit and the picture drawn once per change, not per frame. */
let BACK = null;
const W = 320, H = 320;
function place(){
  if(BACK) return BACK;
  const xs = SHAPE.x, ys = SHAPE.y;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for(let i = 0; i < xs.length; i++){
    if(xs[i] < x0) x0 = xs[i];
    if(xs[i] > x1) x1 = xs[i];
    if(ys[i] < y0) y0 = ys[i];
    if(ys[i] > y1) y1 = ys[i];
  }
  const k = Math.min((W - 8) / (x1 - x0), (H - 8) / (y1 - y0));
  const px = i => Math.round((xs[i] - x0) * k + (W - (x1 - x0) * k) / 2);
  const py = i => Math.round((ys[i] - y0) * k + (H - (y1 - y0) * k) / 2);
  const d = [];
  for(let i = 0; i < SHAPE.e.length; i += 2)
    d.push('M' + px(SHAPE.e[i]) + ' ' + py(SHAPE.e[i]) + 'L' + px(SHAPE.e[i + 1]) + ' ' + py(SHAPE.e[i + 1]));
  BACK = {d: d.join(''), px, py};
  return BACK;
}
function treeView(f, p){
  const g = place();
  const dots = list => list.map(i => 'M' + g.px(i) + ' ' + g.py(i) + 'h.01').join('');
  const inside = [];
  for(const s of p.steps) for(const at of s.took) inside.push(at);
  return {w: W, h: H, back: g.d, path: dots(p.path), on: dots(inside), start: dots([startOf(f)])};
}
function view(f, d){
  const sockets = SHAPE ? SHAPE.t.reduce((n, t) => n + (t === JEWEL ? 1 : 0), 0) : 0;
  const p = SHAPE ? plan(f) : {alloc: new Set(), steps: [], path: [], total: 0};
  const px = k => D.market && D.market.items && D.market.items[k];
  return {
    id: f.id, n: f.n, st: f.st, starts: SHAPE ? SHAPE.sn : [],
    files: held().files.map(x => ({id: x.id, n: x.n, on: x.id === f.id})), open: OPEN,
    rows: budgetRows(f, d),
    supports: f.pool.filter(k => { const c = D.byKey.get(k); return c && c.k === 'g' && isSupport(c); }).length,
    jewels: {held: f.jewels.filter(Boolean).length, of: sockets, rows: jewelRows(f, p)},
    points: {steps: p.steps, path: p.path.length, total: p.total},
    gear: gearTiles(f, sockets),
    tree: SHAPE ? treeView(f, p) : null,
    pool: f.pool.map(k => D.byKey.get(k)).filter(Boolean),
    chip: CHIP,
    priced: f.pool.filter(k => { const r = px(k); return r && r.v !== undefined; }).length + ' of ' + f.pool.length,
    big: f.big || 0,
  };
}

/* ---------- the card ---------- */
let IT = null;                    // the entry the trail holds. One of it, so Back onto a build finds it
let CHIP = 'all';                 // which budget the pool is narrowed to
async function classFiles(f){
  const out = {};
  await Promise.all(SLOTS.map(async ([id]) => {
    const got = f.gear[id];
    const it = got ? D.byKey.get(got.k) : null;
    const cr = classOf(it);
    if(cr) out[id] = await classData(cr).catch(() => null);
  }));
  return out;
}
async function entry(f){
  const v = view(f, await classFiles(f));
  if(!IT) IT = {k: 'f', id: 'build', n: '', s: ''};
  IT.n = f.n;
  IT.s = (v.starts[f.st] || v.starts[0] || 'Passive tree') + ' start · ' +
    v.points.total + (v.points.total === 1 ? ' point' : ' points') + ' · ' + f.pool.length + ' in the pool';
  IT.build = v;
  return IT;
}
export async function openBuild(id){
  await craftData();
  await styles();
  await treeData().catch(() => {});
  const f = fileOf(id) || current() || newFile();
  if(!f) return;
  held().on = f.id;
  save();
  openDetail(await entry(f), {drawn: true, price: null, builds: false, kind: 'Build', on: onBuild}, null);
}
/* a build card reached any other way — the trail's own Forward after a close */
export async function openCard(){
  return openBuild(held().on);
}
async function paint(){
  const f = current();
  if(!f) return;
  await entry(f);
  save();
  repaint();
}

/* every control on the build card says what it does, and this is what it does. Nothing else answers them. */
const split = s => { const i = String(s).indexOf(':'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
function onBuild(what, el, e){
  const f = current();
  if(!f) return;
  const [verb, rest] = split(what);
  const live = e && e.type === 'input';
  if(verb === 'roll'){                       // the number box and its slider, kept in step (assets/trade.js)
    const [slot, fam] = rest.split('/');
    const got = f.gear[slot];
    if(!got) return;
    if(el.tagName === 'BUTTON'){             // a family with one tier: it is aimed at or it is not
      if(fam in got.want) delete got.want[fam]; else got.want[fam] = 1;
      return void paint();
    }
    syncVal(el);
    if(live) return;
    if(el.value === '') delete got.want[fam];
    else got.want[fam] = +el.value;
    return void paint();
  }
  if(verb === 'ilvl'){
    const lab = el.closest('.bn-lab');
    if(lab && lab.querySelector('b')) lab.querySelector('b').textContent = el.value;
    if(live) return;
    if(f.gear[rest]) f.gear[rest].ilvl = +el.value;
    return void paint();
  }
  if(live) return;
  if(verb === 'name'){ f.n = el.value.trim().slice(0, 40) || f.n; return void paint(); }
  if(verb === 'start'){ f.st = +el.value; return void paint(); }
  if(verb === 'row'){ const got = f.gear[rest]; if(got) got.open = !got.open; return void paint(); }
  if(verb === 'take'){ const it = D.byKey.get(rest); if(it) choose(f, it); return void paint(); }
  if(verb === 'drop'){ delete f.gear[rest]; return void paint(); }
  if(verb === 'dropjewel'){ f.jewels[+rest] = null; return void paint(); }
  if(verb === 'socket'){                     // which cluster this jewel covers, since no radius is published
    const got = f.jewels[+rest];
    if(got) got.c = el.value;
    return void paint();
  }
  if(verb === 'out'){
    const at = f.pool.indexOf(rest);
    if(at >= 0) f.pool.splice(at, 1);
    return void paint();
  }
  if(verb === 'node'){                       // one node of a cluster, taken or not
    const [id, at] = rest.split('/');
    const c = f.cl.find(x => x.c === id);
    if(!c) return;
    const k = c.take.indexOf(+at);
    if(k >= 0) c.take.splice(k, 1); else c.take.push(+at);
    return void paint();
  }
  if(verb === 'cluster'){                    // a cluster out of the build
    const at = f.cl.findIndex(x => x.c === rest);
    if(at >= 0) f.cl.splice(at, 1);
    return void paint();
  }
  if(verb === 'see'){                        // a tile or a row: the card it holds, on the trail
    const it = D.byKey.get(rest);
    if(it) openDetail(it, {nested: true}, hrefOf(it));
    return;
  }
  if(verb === 'chip'){ CHIP = rest; return void paint(); }
  if(verb === 'file'){ held().on = rest; save(); return void paint(); }
  if(verb === 'new'){ newFile(); return void paint(); }
}
/* what a pooled card fills: the first slot of its kind that is still empty, and the cluster's own notable
   where it is a cluster */
function choose(f, it){
  if(it.k === 't'){
    const j = CLUST ? clusterAt(it.id) : undefined;
    if(j === undefined || f.cl.some(c => c.c === it.id)) return;
    f.cl.push({c: it.id, take: [CLUST.at[j]]});
    return;
  }
  if(classOf(it) === 'jewel'){
    const at = f.jewels.findIndex(x => !x);
    f.jewels[at < 0 ? f.jewels.length : at] = {k: it.k + ':' + it.id, c: ''};
    return;
  }
  const slots = slotsFor(it);
  const free = slots.find(s => !f.gear[s]) || slots[0];
  if(free) f.gear[free] = {k: it.k + ':' + it.id, want: {}, ilvl: X.ilvl, open: false};
}

/* ---------- the box the card leaves this file: the chips and the pool ----------
   The chips are a view of the budget rows, never a number of their own: a chip says how much room is left,
   and the rows say what is in it. */
export function fill(host, it){
  const v = it && it.build;
  if(!host || !v) return;
  if(host.dataset.fill === 'buildfiles') return void files(host, v);
  const node = document.createElement('div');
  node.className = 'bd-box';
  const chips = [['all', 'All', v.pool.length, 0]]
    .concat(v.rows.map(r => [r.id, r.n, r.it ? 1 : 0, 1]))
    .concat([['jewel', 'Jewels', v.jewels.held, v.jewels.of],
             ['support', 'Supports', v.supports, 0],
             ['cluster', 'Clusters', v.points.steps.length, 0]]);
  const fits = c => {
    if(CHIP === 'all') return true;
    if(CHIP === 'cluster') return c.k === 't';
    if(CHIP === 'support') return c.k === 'g' && isSupport(c);
    if(CHIP === 'jewel') return classOf(c) === 'jewel';
    return slotsFor(c).includes(CHIP);
  };
  const list = v.pool.filter(fits);
  const row = c => {
    const px = D.market && D.market.items && D.market.items[c.k + ':' + c.id];
    const can = c.k === 't' || classOf(c) === 'jewel' || slotsFor(c).length;
    const key = esc(c.k + ':' + c.id);
    return '<li class="bd-prow">' +
      '<button type="button" class="bn-ic" data-do="see:' + key + '" aria-label="' + esc(c.n) + '">' +
        (c.img ? '<img src="' + esc(c.img) + '" alt="" loading="lazy" decoding="async">' : '') + '</button>' +
      '<span class="bn-pn"><b>' + esc(c.n) + '</b><span>' + esc(c.s || '') + '</span></span>' +
      (px && px.v !== undefined ? '<span class="bn-px">' + moneyHTML(px.v) + '</span>' : '') +
      (can ? '<button type="button" class="btn" data-do="take:' + key + '">Take</button>' : '') +
      '<button type="button" class="bn-x" data-do="out:' + key + '" aria-label="Out of the pool">Remove</button></li>';
  };
  node.innerHTML =
    '<p class="bn-h4">Pool <span>' + v.pool.length + '</span></p>' +
    '<div class="bd-chips">' + chips.map(([id, n, has, of]) =>
      '<button type="button" class="chip" data-do="chip:' + esc(id) + '" aria-pressed="' + (CHIP === id) + '">' +
      esc(n) + '<span class="ct">' + has + (of ? '/' + of : '') + '</span></button>').join('') + '</div>' +
    (list.length ? '<ul class="bd-pool">' + list.map(row).join('') + '</ul>'
      : '<p class="note">' + (v.pool.length ? 'Nothing in the pool fits this.' : 'Nothing in the pool.') + '</p>') +
    '<p class="card-src">Priced: ' + esc(v.priced) + ' picks. A rare is not a listed thing, so no rare has a price.</p>';
  host.replaceChildren(node);
}

/* The files a session holds, the name of the one on show and where on the tree it starts. Three open at
   once; a guest has no account to be kept in, so a guest keeps what is open and the row says so at three.
   Which class starts where is not in the files we read, so the start is the tree's own word for it. */
function files(host, v){
  const node = document.createElement('div');
  node.className = 'bd-top';
  node.innerHTML =
    '<div class="bd-tabs">' + v.files.map(f =>
      '<button type="button" class="chip" data-do="file:' + esc(f.id) + '" aria-pressed="' + f.on + '">' +
      esc(f.n) + '</button>').join('') +
      (v.files.length < v.open ? '<button type="button" class="btn" data-do="new">New build</button>' : '') +
    '</div>' +
    (v.files.length >= v.open ? '<p class="note">' + v.open + ' of ' + v.open +
      '. A guest keeps three files, in this session.</p>' : '') +
    '<div class="bd-set">' +
      '<label class="bn-lab"><span class="lbl">Name</span>' +
        '<input class="field" type="text" maxlength="40" data-do="name" value="' + esc(v.n) + '"></label>' +
      (v.starts.length ? '<label class="bn-lab"><span class="lbl">Start</span>' +
        '<select class="field" data-do="start">' + v.starts.map((n, i) =>
          '<option value="' + i + '"' + (i === v.st ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
        '</select></label>' : '') +
    '</div>' +
    '<p class="card-src">Which class starts where is not in the files we read, so the start is the tree’s own.</p>';
  host.replaceChildren(node);
}
