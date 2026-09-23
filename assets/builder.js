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
   to save and one read to open, against 120 writes for a 60-card pool the other way round. Twelve is the
   number an account keeps, and the two write guards that go with it — a save every ten seconds at most, and
   sixty saves a file a day — belong to the sign-in route, which does not exist yet: nothing here writes to
   the database, so none of that arithmetic is spent.

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
/* The rules, and the search that runs over them. Nothing on this card works a stat out for itself, and the
   button and the live list under the numbers are one machine (assets/optimise.js). */
import * as M from './maths.js';
import * as O from './optimise.js';

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
/* How many supports the link still has room for. The two numbers are the owner's own knowledge of the game
   and the export states neither, so M.SOURCE.sockets travels with every count this draws. */
const gemList = g => [...g.sk.map(k => ({k, support: false})), ...g.sup.map(k => ({k, support: true}))];
const roomFor = g => M.socketsLeft(gemList(g)).room;
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
const blank = n => ({v: 1, id: '', n, st: 0, cls: '', lv: 1, gear: {}, jewels: [], cl: [],
  gems: {sk: [], sup: []}, pool: [], at: Date.now()});
let B = null;                     // what the session holds
const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
const get = k => { try { const s = sessionStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };

function held(){
  if(B) return B;
  const was = get(KEY);
  B = was && was.v === 1 && Array.isArray(was.files) ? was : {v: 1, files: [], on: ''};
  B.files = B.files.filter(f => f && f.v === 1 && f.n).slice(0, OPEN);
  for(const f of B.files){
    f.jewels = (f.jewels || []).map(x => typeof x === 'string' ? {k: x, c: ''} : x || null);
    if(!f.gems || !Array.isArray(f.gems.sk)) f.gems = {sk: [], sup: []};
    if(typeof f.lv !== 'number') f.lv = 1;
    if(typeof f.cls !== 'string') f.cls = '';
  }
  return B;
}
/* A file over the cap is refused with its size on screen, never trimmed behind the player: the change is
   rolled back to what was stored and the card says how big the file came to. */
function save(){
  const b = held(), was = get(KEY), old = (was && was.files) || [];
  for(let i = 0; i < b.files.length; i++){
    const size = JSON.stringify(b.files[i]).length;
    if(size <= CAP){ b.files[i].big = 0; continue; }
    const kept = old.find(x => x && x.id === b.files[i].id);
    if(kept) b.files[i] = kept;
    b.files[i].big = size;
  }
  put(KEY, b);
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
    cls: f.cls || '', lv: f.lv || 1, classes: GAME ? (GAME.classes || []).map(c => c.n) : [],
    link: gemView(f), opt: f.opt || null, run: RUN && RUN.id === f.id ? runView() : null, show: SHOW,
    live: liveFor(f, (f.opt && f.opt.aim) || SHOW),
    said: f.optsaid || '',
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
  save();                          // ...which may hand the file back as it was, so the card is drawn from that
  const now = current();
  if(!now) return;
  openDetail(await entry(now), {drawn: true, price: null, builds: false, kind: 'Build', on: onBuild}, null);
}
/* a build card reached any other way — the trail's own Forward after a close */
export async function openCard(){
  return openBuild(held().on);
}
async function paint(){
  save();                          // the change first, because a file over the cap is handed back as it was
  const f = current();
  if(!f) return;
  await entry(f);
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
  if(verb === 'opt'){ press(f); return void paint(); }
  if(verb === 'show'){ SHOW = rest; return void paint(); }
  if(verb === 'takeaim'){ takeAnswer(f, rest); return; }
  if(verb === 'back'){ putBack(f, +rest); return; }
  if(verb === 'backall'){ putAllBack(f); return; }
  if(verb === 'dropgem'){
    f.gems.sk = f.gems.sk.filter(k => k !== rest);
    f.gems.sup = f.gems.sup.filter(k => k !== rest);
    return void paint();
  }
  if(verb === 'cls'){ f.cls = el.value; return void paint(); }
  if(verb === 'lv'){ f.lv = Math.max(1, Math.min(100, Number(el.value) || 1)); return void paint(); }
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
  /* A gem lands in the link. A skill goes in as a skill; a second one is the skill the first casts, and the
     game counts both towards the six. A support takes a socket while there is one (assets/maths.js
     SOCKETS, and SOURCE.sockets says where the two numbers come from). */
  if(it.k === 'g'){
    const key = it.k + ':' + it.id;
    const g = f.gems;
    if(g.sk.includes(key) || g.sup.includes(key)) return;
    if(!isSupport(it)){ if(g.sk.length < M.SOCKETS.chain - 1) g.sk.push(key); return; }
    if(g.sup.length < roomFor(g)) g.sup.push(key);
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
  if(host.dataset.fill === 'optimise'){
    const f = current();
    if(f) optBox(host, v, f);
    if(f && !RUN) liveWork(f, (f.opt && f.opt.aim) || SHOW);
    return;
  }
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
      (v.classes.length ? '<label class="bn-lab"><span class="lbl">Class</span>' +
        '<select class="field" data-do="cls"><option value="">None</option>' + v.classes.map(n =>
          '<option value="' + esc(n) + '"' + (n === v.cls ? ' selected' : '') + '>' + esc(n) + '</option>').join('') +
        '</select></label>' : '') +
      '<label class="bn-lab"><span class="lbl">Level</span>' +
        '<input class="field" type="number" min="1" max="100" data-do="lv" value="' + (v.lv || 1) + '"></label>' +
    '</div>' +
    '<p class="card-src">Which class starts where is not in the files we read, so the start is the tree’s own '
      + 'and the class is the game’s.</p>';
  host.replaceChildren(node);
}

/* ---------- the numbers, and what is still open ----------
   Everything below answers the optimise button and the live list under it. The rules are assets/maths.js and
   the search is assets/optimise.js; what is here is the part only this card knows — which of its own things
   are still open, what each one would put on the build, and what it costs.

   docs/proposal-builder.md section 4. Two data files come in for it: the game's own class and monster table,
   and the support lines tools/gemlines.py distils. Both are fetched the first time the button is pressed and
   never on a first paint. */
let GAME = null;                  // data/gamestats.json: what a class starts with, one monster per level
let GEM = null;                   // data/gemlines.json: a support's lines, with its frame off
async function optData(){
  if(GAME && GEM) return true;
  try {
    const [g, m] = await Promise.all([
      GAME || json('data/gamestats.json'), GEM || json('data/gemlines.json'),
    ]);
    GAME = GAME || g; GEM = GEM || m;
    return true;
  } catch { return false; }
}
const classRow = f => (GAME && (GAME.classes || []).find(c => c.n === f.cls)) || null;

/* What an item carries before a line on it is read: the game prints Armour, Evasion and Energy Shield on the
   item, and a line of its own that names one of them is already inside that number. A base prints one number
   and a unique prints a range — the range is read at its floor, which is the reading that does not flatter. */
const DEF = /^(Armour|Evasion Rating|Evasion|Energy Shield):\s*\(?(-?[\d.]+)/;
function defenceOf(it){
  const out = {armour: 0, evasion: 0, es: 0};
  for(const l of (it && it.pr) || []){
    const m = String(l).match(DEF);
    if(!m) continue;
    out[{Armour: 'armour', Evasion: 'evasion', 'Evasion Rating': 'evasion', 'Energy Shield': 'es'}[m[1]]] += Number(m[2]) || 0;
  }
  return out;
}
/* A rare's own lines, out of the families the player aimed at: the tier this item level reaches, read at the
   bottom of its range. What the player aims at is the top, and the row says both. */
function aimedLines(P, got, want){
  const out = [];
  if(!P) return out;
  for(const [f, v] of Object.entries(want || {})){
    const tier = tierFor(P, got, f, v);
    if(tier) out.push(...E.withValues(P.mods[tier.i][3], tier.lo));
  }
  return out;
}
function tierFor(P, got, f, v){
  const ilvl = got.ilvl || (X ? X.ilvl : 0);
  let best = null;
  for(let i = 0; i < P.mods.length; i++){
    const m = P.mods[i];
    if(String(m[1]) !== String(f) || m[2] > ilvl) continue;
    if(v !== 1 && m[5] !== null && m[6] !== null && !(v >= m[5] && v <= m[6])) { if(best) continue; }
    if(!best || m[2] > P.mods[best.i][2]) best = {i};
  }
  if(!best) return null;
  const m = P.mods[best.i];
  const n = (m[3] || []).join(' ').match(E.RANGE);
  return {i: best.i, lo: (n || []).map((_, k) => rangeEnd(m[3], k, 0)),
    hi: (n || []).map((_, k) => rangeEnd(m[3], k, 1))};
}
function rangeEnd(lines, k, end){
  const all = [];
  for(const ln of lines) for(const m of String(ln).matchAll(E.RANGE)) all.push([Number(m[1]), Number(m[2])]);
  const pair = all[k] || [0, 0];
  return end ? Math.max(pair[0], pair[1]) : Math.min(pair[0], pair[1]);
}

/* Every line the build already carries: the gear, the jewels, the clusters and the link. A cluster node with
   no card of its own carries no line here, the way the Build tab says a passive its data does not carry. */
function linesOfFile(f, d, p){
  const out = [];
  for(const [id] of SLOTS){
    const got = f.gear[id];
    const it = got && D.byKey.get(got.k);
    if(!it) continue;
    if(it.k === 'u') for(const l of it.ls || []) out.push(l);
    if(it.k === 'b') out.push(...aimedLines(d[id], got, got.want));
  }
  for(const got of f.jewels) {
    const it = got && D.byKey.get(got.k);
    if(it) for(const l of it.ls || []) out.push(l);
  }
  for(const s of p.steps) for(const at of s.took){
    const c = cardAt(at);
    if(c) for(const l of c.ls || []) out.push(l);
  }
  for(const l of supportLines(f.gems.sup)) out.push(l);
  return out;
}
/* A support's lines, off data/gemlines.json, which is keyed by the card's own id and never shows one. */
function supportLines(keys){
  const out = [];
  if(!GEM) return out;
  for(const k of keys || []) for(const i of GEM.g[String(k).slice(2)] || []) out.push(GEM.w[i]);
  return out;
}
const gearSum = f => {
  const out = {armour: 0, evasion: 0, es: 0};
  for(const [id] of SLOTS){
    const got = f.gear[id], it = got && D.byKey.get(got.k);
    if(!it) continue;
    const d = defenceOf(it);
    out.armour += d.armour; out.evasion += d.evasion; out.es += d.es;
  }
  return out;
};
/* The weapon it swings, out of the base's own card: what a base is worth is a card on this site already. */
function weaponOf(f){
  const got = f.gear.weapon, it = got && D.byKey.get(got.k);
  if(!it) return null;
  const pr = it.pr || [];
  const take = re => { for(const l of pr){ const m = String(l).match(re); if(m) return m; } return null; };
  const dmg = take(/^\w* ?Damage: \(?(-?[\d.]+)-\(?(-?[\d.]+)/);
  const rate = take(/^Attacks per Second: \(?([\d.]+)/);
  const crit = take(/^Critical Hit Chance: \(?([\d.]+)/);
  if(!dmg || !rate) return null;
  return {dmg: [Number(dmg[1]), Number(dmg[2])], rate: Number(rate[1]),
    crit: crit ? Number(crit[1]) : 0, quality: 0};
}

/* ---------- what is still open ----------
   Only what is open, and never a choice the player made. A slot they filled, a modifier they picked, a
   cluster they took: the search treats every one of them as fixed, which is what makes the change list
   mean anything (docs/proposal-builder.md 4.1). */
const priceOf = k => {
  const r = D.market && D.market.items && D.market.items[k];
  return r && r.v !== undefined ? r.v : null;
};
/* The fewest steps from what is allocated to every node at once: one pass, not one per cluster. Point cost
   is counted from what is allocated, so two clusters that share a road are each costed the whole road —
   over-stated and never under-stated, and the plan re-counts it for real once they are taken. */
function reachAll(alloc){
  const A = adj(), dist = new Int32Array(A.length).fill(-1), q = [];
  for(const h of alloc){ dist[h] = 0; q.push(h); }
  for(let i = 0; i < q.length; i++) for(const m of A[q[i]]) if(dist[m] < 0){ dist[m] = dist[q[i]] + 1; q.push(m); }
  return dist;
}
/* Which supports the skill's own type list admits: every tag the support carries other than Support has to
   be one the skill carries. 512 of the game's own 4,746 recommended entries fall outside this reading, so
   the card says the count is our reading of the list and not the game's own word. */
function admits(sup, skill){
  const have = new Set(skill.tags || []);
  return (sup.tags || []).every(t => /^support$/i.test(t) || have.has(t));
}
function openings(f, d, p){
  const out = [];
  const pool = f.pool.map(k => D.byKey.get(k)).filter(Boolean);
  // an empty gear slot, out of what was pooled for it
  for(const [id, label] of SLOTS){
    if(f.gear[id]) continue;
    for(const it of pool){
      if(!slotsFor(it).includes(id)) continue;
      out.push({kind: 'gear', fills: 'gear:' + id, slot: id, what: label, to: it.n, key: it.k + ':' + it.id,
        lines: it.k === 'u' ? (it.ls || []) : [], gear: defenceOf(it), points: 0,
        price: priceOf(it.k + ':' + it.id), put: {do: 'gear', slot: id, k: it.k + ':' + it.id}});
    }
  }
  // a rare already chosen, with a side still open: one family at a time, at the tier this level reaches
  for(const [id, label] of SLOTS){
    const got = f.gear[id];
    const it = got && D.byKey.get(got.k);
    if(!it || it.k !== 'b' || !d[id]) continue;
    const P = d[id], base = (P.bases || []).find(b => b.n === it.n);
    const cl = clsOf(classOf(it));
    if(!base || !cl) continue;
    const caps = E.capsOf(cl, base, 'rare');
    const held = Object.keys(got.want || {});
    const room = {p: caps[0] - held.filter(x => P.fam[x] && P.fam[x][0] === 'p').length,
                  s: caps[1] - held.filter(x => P.fam[x] && P.fam[x][0] === 's').length};
    for(const fam of families(P, base, got, id)){
      if(fam.v !== undefined) continue;                    // a modifier the player picked is fixed
      if(room[fam.side] <= 0) continue;
      const tier = tierFor(P, got, fam.f, 1);
      if(!tier) continue;
      out.push({kind: 'mod', fills: 'mod:' + id + '/' + fam.f, slot: id, side: fam.side,
        caps: {p: caps[0], s: caps[1]}, what: label, to: E.withValues(P.mods[tier.i][3], tier.hi).join(' / '),
        lines: E.withValues(P.mods[tier.i][3], tier.lo), gear: {}, points: 0, price: null,
        floor: E.withValues(P.mods[tier.i][3], tier.lo).join(' / '),
        put: {do: 'roll', slot: id, fam: fam.f, v: tier.hi[0] === undefined ? 1 : tier.hi[0]}});
    }
  }
  // an empty support socket, out of every support the skill's own type list admits
  const skill = f.gems.sk.length ? D.byKey.get(f.gems.sk[0]) : null;
  const room = roomFor(f.gems);
  if(skill && GEM) for(let n = f.gems.sup.length; n < room; n++){
    for(const it of D.index.items){
      if(it.k !== 'g' || !isSupport(it) || !admits(it, skill)) continue;
      const key = 'g:' + it.id;
      if(f.gems.sup.includes(key)) continue;
      const lines = supportLines([key]);
      if(!lines.length) continue;
      out.push({kind: 'support', fills: 'sup:' + n, what: 'Support ' + (n + 1), to: it.n, key,
        lines, gear: {}, points: 0, price: priceOf(key), put: {do: 'sup', k: key}});
    }
    break;                       // one socket's worth of candidates; the next step fills the next socket
  }
  // a cluster not taken, costed from what is allocated
  if(CLUST && SHAPE){
    const dist = reachAll(p.alloc);
    const took = new Set(f.cl.map(c => c.c));
    for(let j = 0; j < CLUST.id.length; j++){
      const id = CLUST.id[j];
      if(took.has(id)) continue;
      const card = D.byKey.get('t:' + id);
      if(!card || !(card.ls || []).length) continue;
      const at = CLUST.at[j];
      const reach = dist[at];
      if(reach < 0) continue;                              // nothing wanted is reachable from what is allocated
      out.push({kind: 'cluster', fills: 'cl:' + id, what: 'Cluster', to: card.n, key: 't:' + id,
        lines: card.ls || [], gear: {}, points: reach, price: null,
        put: {do: 'cluster', id, at}});
    }
  }
  // a jewel socket, out of what was pooled
  const sockets = SHAPE ? SHAPE.t.reduce((n, t) => n + (t === JEWEL ? 1 : 0), 0) : 0;
  for(let i = 0; i < sockets; i++){
    if(f.jewels[i]) continue;
    for(const it of pool){
      if(classOf(it) !== 'jewel') continue;
      out.push({kind: 'jewel', fills: 'jw:' + i, what: 'Jewel', to: it.n, key: it.k + ':' + it.id,
        lines: it.ls || [], gear: {}, points: 0, price: priceOf(it.k + ':' + it.id),
        put: {do: 'jewel', i, k: it.k + ':' + it.id}});
    }
    break;
  }
  return out;
}

/* ---------- the run ----------
   Three answers, one clock. A first answer on a beam of one, then the full pass on a beam of four with the
   pair pass behind it, all three sharing the 3 second cap the press is given. The work is done in slices
   between frames, so the page never stops answering and the button says how far it has got. */
const AIMS = O.AIMS;
let RUN = null;                   // the press in flight: the three searches, and what they have reached
let SHOW = 'both';                // which of the three answers the rows are drawn from

async function stateOf(f){
  const d = await classFiles(f);
  const p = SHAPE ? plan(f) : {alloc: new Set(), steps: [], path: [], total: 0};
  const lines = linesOfFile(f, d, p);
  const had = M.read(lines);
  return {S: {level: Math.max(1, f.lv || 1), cls: classRow(f), stats: had.stats, gear: gearSum(f),
    weapon: weaponOf(f), points: {spent: p.total, cap: Math.max(1, f.lv || 1)},
    open: openings(f, d, p)}, had, p, d};
}
/* One press. It never writes to the build: it works three answers out and the player takes one. */
async function press(f){
  if(!(await optData())) return void fault(f, 'The game’s own tables did not load.');
  const {S, had} = await stateOf(f);
  const t0 = performance.now();
  RUN = {id: f.id, at: t0, S, had, tried: 0, ms: 0, first: 0, done: false,
    answers: {}, runs: {}, phase: 'first'};
  for(const [a] of AIMS) RUN.runs[a] = O.start(S, a, {beam: 1, pairs: false, cap: O.FIRST});
  slice();
}
function fault(f, why){
  f.optsaid = why;
  paint();
}
/* One slice of work, then back to the page. */
function slice(){
  const run = RUN;
  if(!run || run.done) return;
  const left = O.CAP - (performance.now() - run.at);
  if(left <= 0) return void finish('clock');
  let all = true;
  for(const [a] of AIMS){
    const s = run.runs[a];
    if(s.state.done) continue;
    s.tick(Math.min(8, Math.max(1, left)));
    if(!s.state.done) all = false;
  }
  for(const [a] of AIMS) run.answers[a] = run.runs[a].answer;
  run.tried = AIMS.reduce((n, [a]) => n + run.runs[a].state.tried, 0);
  run.ms = performance.now() - run.at;
  if(all && run.phase === 'first'){
    run.first = run.ms;
    run.phase = 'full';
    for(const [a] of AIMS) run.runs[a] = O.start(run.S, a, {cap: O.CAP - run.ms});
    paint();
    return void requestAnimationFrame(slice);
  }
  if(all) return void finish('');
  paint();
  requestAnimationFrame(slice);
}
function finish(why){
  if(!RUN) return;
  RUN.done = true;
  RUN.ms = performance.now() - RUN.at;
  RUN.stopped = why;
  for(const [a] of AIMS) RUN.answers[a] = RUN.runs[a].answer;
  RUN.tried = AIMS.reduce((n, [a]) => n + RUN.runs[a].state.tried, 0);
  paint();
}

/* ---------- taking an answer, and putting it back ----------
   Every change is a row with its own put-back, and Put all back returns the build to exactly what it was
   before the button, out of the state written before the search started (4.5). */
const snapOf = f => JSON.stringify({gear: f.gear, jewels: f.jewels, cl: f.cl, gems: f.gems});
function applyOne(f, put){
  if(put.do === 'gear') f.gear[put.slot] = {k: put.k, want: {}, ilvl: X.ilvl, open: false};
  else if(put.do === 'roll'){ const got = f.gear[put.slot]; if(got) got.want[put.fam] = put.v; }
  else if(put.do === 'sup'){ if(!f.gems.sup.includes(put.k)) f.gems.sup.push(put.k); }
  else if(put.do === 'cluster'){ if(!f.cl.some(c => c.c === put.id)) f.cl.push({c: put.id, take: [put.at]}); }
  else if(put.do === 'jewel') f.jewels[put.i] = {k: put.k, c: ''};
}
function undoOne(f, put){
  if(put.do === 'gear') delete f.gear[put.slot];
  else if(put.do === 'roll'){ const got = f.gear[put.slot]; if(got) delete got.want[put.fam]; }
  else if(put.do === 'sup') f.gems.sup = f.gems.sup.filter(k => k !== put.k);
  else if(put.do === 'cluster') f.cl = f.cl.filter(c => c.c !== put.id);
  else if(put.do === 'jewel') f.jewels[put.i] = null;
}
/* Taking an answer writes the rows onto the build, in the order they were made, and keeps what it was. */
function takeAnswer(f, aim){
  const A = RUN && RUN.answers[aim];
  if(!A || !A.rows.length) return;
  const was = snapOf(f);
  const rows = A.rows.map(r => ({what: r.x.what, to: r.x.to, kind: r.x.kind, key: r.x.key || '',
    put: r.x.put, price: r.x.price, points: r.x.points || 0, moved: r.moved, back: false,
    floor: r.x.floor || ''}));
  for(const r of rows) applyOne(f, r.put);
  f.opt = {aim, rows, was, tried: RUN.tried, ms: Math.round(RUN.ms), left: A.left || null,
    stopped: A.stopped || RUN.stopped || '', steps: A.steps, of: A.of};
  RUN = null;
  paint();
}
/* One row back. The numbers are re-run, because a later change may have depended on it: a row whose own
   gain has gone says so and offers to go back too, and nothing is unwound behind the player. */
async function putBack(f, i){
  const o = f.opt;
  if(!o || !o.rows[i] || o.rows[i].back) return;
  undoOne(f, o.rows[i].put);
  o.rows[i].back = true;
  await restate(f);
  paint();
}
function putAllBack(f){
  const o = f.opt;
  if(!o) return;
  const was = JSON.parse(o.was);
  f.gear = was.gear; f.jewels = was.jewels; f.cl = was.cl; f.gems = was.gems;
  f.opt = null;
  paint();
}
/* After a put-back, every row still on the build is re-costed against the build as it now stands. A row
   worth nothing any more is the one that depended on the row that went back. */
async function restate(f){
  const o = f.opt;
  if(!o || !(await optData())) return;
  const gone = o.rows.some(z => z.back);
  const {S} = await stateOf(f);
  const now = O.numbers(S);
  for(const r of o.rows){
    if(r.back){ r.depends = false; continue; }
    undoOne(f, r.put);
    const {S: less} = await stateOf(f);
    applyOne(f, r.put);
    const off = O.numbers(less);
    // it is on the build and the build is no better for it: what made it worth taking has gone back
    r.depends = gone && now.dps <= off.dps * (1 + 1e-9) && now.life <= off.life * (1 + 1e-9);
  }
}

/* The live list: the best few changes the same search would make, worked out on the card as it stands and
   redone when it changes. One step of the same machine over the same candidates, so nothing here is a second
   opinion. Kept against what the file looked like when it was worked out, because a paint is not a change. */
let LIVE = null;
function liveFor(f, aim){
  const sig = f.id + '|' + aim + '|' + f.lv + '|' + f.cls + '|' + snapOf(f) + '|' + f.pool.join(',');
  if(LIVE && LIVE.sig === sig) return LIVE.out;
  return null;
}
async function liveWork(f, aim){
  if(!(await optData())) return;
  const sig = f.id + '|' + aim + '|' + f.lv + '|' + f.cls + '|' + snapOf(f) + '|' + f.pool.join(',');
  if(LIVE && LIVE.sig === sig) return;
  const {S} = await stateOf(f);
  const r = O.wouldImprove(S, aim, 3);
  LIVE = {sig, out: {ms: Math.round(r.ms), tried: r.tried, open: S.open.length,
    list: r.list.map(x => ({what: x.what, to: x.to, key: x.key || '', points: x.points || 0,
      price: x.price, moved: movedFor(S, x)}))}};
  paint();
}
/* What one change on its own would do to the build as it stands: the same search, given that one change and
   one step to make it. */
function movedFor(S, x){
  const z = O.run({...S, open: [x]}, 'both', {steps: 1, pairs: false});
  return z.rows.length ? z.rows[0].moved : null;
}

/* ---------- what the optimise field is holding ----------
   The link, the three answers, the rows the button wrote and what it left. Nothing is worked out here that
   is not worked out above: this is the shape the card reads. */
function gemView(f){
  const list = gemList(f.gems);
  const left = M.socketsLeft(list);
  const card = k => { const it = D.byKey.get(k); return it ? {k, n: it.n, img: it.img} : null; };
  return {sk: f.gems.sk.map(card).filter(Boolean), sup: f.gems.sup.map(card).filter(Boolean),
    room: left.room, held: left.held, over: left.over, skills: left.skills, why: M.SOURCE.sockets};
}
function runView(){
  const out = {phase: RUN.phase, done: RUN.done, ms: Math.round(RUN.ms), first: Math.round(RUN.first),
    tried: RUN.tried, stopped: RUN.stopped || '', answers: []};
  for(const [a, label] of AIMS){
    const A = RUN.answers[a];
    if(!A) continue;
    out.answers.push({a, label, rows: A.rows.length, steps: A.steps, of: A.of, ms: Math.round(A.ms),
      tried: A.tried, pairs: A.pairs, stopped: A.stopped,
      moved: A.rows.length ? O.moved(A.was, A.now) : null,
      ties: (A.ties || []).map(t => ({n: t.x.to, what: t.x.what, by: ''})),
      points: A.points});
  }
  return out;
}
const num = v => !isFinite(v) ? '—' : Math.abs(v) >= 1e6 ? (v / 1e6).toFixed(1) + 'M'
  : Math.abs(v) >= 1e4 ? Math.round(v / 1e3) + 'k' : String(Math.round(v));
const pct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
/* What one change did, in a word and a number: whichever of the two it moved most. */
function movedSaid(m){
  if(!m) return '';
  const out = [];
  if(Math.abs(m.dpsPct) >= 0.05) out.push(pct(m.dpsPct) + ' damage');
  if(Math.abs(m.lifePct) >= 0.05) out.push(pct(m.lifePct) + ' effective life');
  return out.join(' · ') || 'nothing it counts';
}

/* ---------- what it left on the table ----------
   Counted, never rounded up: the budgets still open, the pool it did not use with the reason in a word, the
   points not spent, and what it cost where there is a real price. A rare is not a listed thing, so the picks
   with no price are counted beside the total and never folded into it. */
function leftOf(f, v){
  const rows = (f.opt && f.opt.rows.filter(r => !r.back)) || [];
  const used = new Set(rows.map(r => r.key).filter(Boolean));
  const slots = SLOTS.filter(([id]) => !f.gear[id]).map(([, n]) => n);
  const jewels = v.jewels.of - v.jewels.held;
  const why = it => {
    const k = it.k + ':' + it.id;
    if(used.has(k)) return '';
    if(it.k === 't') return f.cl.some(c => c.c === it.id) ? 'taken' : 'worse';
    if(classOf(it) === 'jewel') return jewels > 0 ? 'worse' : 'no socket open';
    if(it.k === 'g') return isSupport(it) ? (v.link.room > v.link.held ? 'worse' : 'no socket open') : 'in the link';
    const s = slotsFor(it);
    if(!s.length) return 'nothing it fits';
    return s.some(x => !f.gear[x]) ? 'worse' : 'no slot open';
  };
  const spare = f.pool.map(k => D.byKey.get(k)).filter(Boolean)
    .map(it => ({n: it.n, why: why(it)})).filter(x => x.why);
  let paid = 0, priced = 0, free = 0;
  for(const r of rows){
    if(r.price != null){ paid += r.price; priced++; } else free++;
  }
  return {slots, jewels, spare, points: Math.max(0, (f.lv || 1) - v.points.total),
    supports: Math.max(0, v.link.room - v.link.held), paid, priced, free};
}

/* ---------- the optimise field ---------- */
function optBox(host, v, f){
  const node = document.createElement('div');
  node.className = 'bd-opt';
  const run = v.run, opt = v.opt;
  const left = leftOf(f, v);
  const aim = (opt && opt.aim) || v.show;
  const chips = AIMS.map(([a, label]) =>
    '<button type="button" class="chip" data-do="show:' + a + '" aria-pressed="' + (aim === a) + '">' +
    esc(label) + '</button>').join('');
  node.innerHTML =
    '<p class="bn-h4">Optimise <span>' + v.link.held + ' of ' + v.link.room + ' supports</span></p>' +
    linkHTML(v) +
    '<div class="bd-chips">' + chips + '</div>' +
    '<div class="bn-ctl">' +
      '<button type="button" class="btn gold" data-do="opt"' + (run && !run.done ? ' disabled' : '') + '>' +
        (run && !run.done ? 'Working' : 'Optimise') + '</button>' +
      (opt ? '<button type="button" class="btn" data-do="backall">Put all back</button>' : '') +
    '</div>' +
    (v.said ? '<p class="note">' + esc(v.said) + '</p>' : '') +
    (run ? runHTML(run, aim) : '') +
    (!run && !opt ? liveHTML(v.live) : '') +
    (opt ? rowsHTML(opt) : '') +
    leftHTML(left, v) +
    '<p class="note">This is not the best build. It is the best of what it tried, out of what you pooled.</p>' +
    '<p class="card-src">' + esc(M.SOURCE.sockets) + '</p>' +
    '<p class="card-src">' + esc(M.SOURCE.order) + ' ' + esc(M.BASE_SOURCE) + '</p>';
  host.replaceChildren(node);
}

/* The live list, before the button is pressed: the best few the same search would take. */
function liveHTML(live){
  if(!live) return '<p class="note">Working out what is open.</p>';
  if(!live.list.length) return '<p class="bn-h4">What would improve this</p>' +
    '<p class="note">Nothing in the pool improves this. ' + live.tried.toLocaleString() + ' changes tried.</p>';
  return '<p class="bn-h4">What would improve this <span>' + live.open.toLocaleString() + ' open</span></p>' +
    '<ul class="bd-spare bd-live">' + live.list.map(x =>
      '<li><b>' + esc(x.what + ' · ' + x.to) + '</b><span>' + esc(movedSaid(x.moved)) + '</span></li>').join('') +
    '</ul>';
}
/* The link: the skill, the skill it casts where there is one, and the supports in it. */
function linkHTML(v){
  const g = v.link;
  const tile = (c, w) => '<li><button type="button" class="bn-gt" data-do="see:' + esc(c.k) + '">' +
    '<span>' + esc(c.n) + '</span><i>' + esc(w) + '</i></button>' +
    '<button type="button" class="bn-x" data-do="dropgem:' + esc(c.k) + '" aria-label="Out of the link">Remove</button></li>';
  const list = [...g.sk.map((c, i) => tile(c, i ? 'Casts' : 'Skill')), ...g.sup.map(c => tile(c, 'Support'))];
  return '<ul class="bd-link">' + (list.length ? list.join('')
    : '<li class="bd-none"><p class="note">Nothing in the link.</p></li>') + '</ul>' +
    (g.over ? '<p class="note">' + g.over + ' more than the link holds.</p>' : '');
}

/* What the press has reached: three answers, side by side, each with what it moved and what it cost. */
function runHTML(run, aim){
  const said = run.done
    ? (run.stopped === 'clock' ? 'Stopped at 3 seconds. ' + run.tried.toLocaleString() + ' changes tried.'
       : run.tried.toLocaleString() + ' changes tried in ' + run.ms + 'ms.')
    : (run.phase === 'first' ? 'First answer' : run.ms + 'ms · ' + run.tried.toLocaleString() + ' tried');
  const cell = a => {
    const on = a.a === aim;
    return '<li' + (on ? ' class="on"' : '') + '><p class="bd-al">' + esc(a.label) + '</p>' +
      '<p class="bd-am">' + esc(a.rows ? movedSaid(a.moved) : 'Nothing improves it') + '</p>' +
      '<p class="note">' + a.rows + (a.rows === 1 ? ' change' : ' changes') +
        (a.points ? ' · ' + a.points + ' points' : '') + ' · ' + a.steps + ' of ' + a.of + ' steps</p>' +
      (a.stopped === 'clock' ? '<p class="note">Stopped at the cap.</p>' : '') +
      (a.rows ? '<button type="button" class="btn" data-do="takeaim:' + a.a + '">Take</button>' : '') +
      (a.ties.length ? '<p class="note">' + a.ties.length + ' the same: ' +
        esc(a.ties.map(t => t.n).join(', ')) + '</p>' : '') +
      '</li>';
  };
  return '<p class="bn-h4">Answers <span>' + esc(said) + '</span></p>' +
    '<ul class="bd-ans">' + run.answers.map(cell).join('') + '</ul>' +
    (run.first ? '<p class="note">First answer at ' + run.first + 'ms.</p>' : '');
}

/* Every change is a row with its own put-back. A row a later one leaned on says so rather than going back
   behind the player. */
function rowsHTML(o){
  const live = o.rows.filter(r => !r.back).length;
  return '<p class="bn-h4">It filled ' + live + (live === 1 ? ' thing' : ' things') + ' <span>' +
      esc(O.aimName(o.aim)) + '</span></p>' +
    '<ul class="bn-log bd-rows">' + o.rows.map((r, i) =>
      '<li class="' + (r.back ? 'no' : 'on') + '">' +
        '<span class="bn-sn">' + esc(r.what) + (r.points ? ' <i>' + r.points + ' points</i>' : '') + '</span>' +
        '<span class="bn-sw">' + esc(movedSaid(r.moved)) + '</span>' +
        '<span class="bn-sl">' + esc(r.back ? 'Put back' : r.to) + '</span>' +
        (r.floor && !r.back ? '<span class="bn-snote">Counted at ' + esc(r.floor) + '</span>' : '') +
        (r.depends && !r.back ? '<span class="bn-snote">Depends on the one you put back.</span>' : '') +
        (r.back ? '' : '<button type="button" class="bn-x" data-do="back:' + i + '">Put back</button>') +
      '</li>').join('') + '</ul>' +
    (o.stopped === 'clock' ? '<p class="note">Stopped at 3 seconds, ' + o.steps + ' of ' + o.of + ' steps.</p>' : '');
}

function leftHTML(left, v){
  const bits = [];
  if(left.slots.length) bits.push(left.slots.length + ' gear ' + (left.slots.length === 1 ? 'slot' : 'slots'));
  if(left.jewels > 0) bits.push(left.jewels + ' jewel ' + (left.jewels === 1 ? 'socket' : 'sockets'));
  if(left.supports > 0) bits.push(left.supports + ' support ' + (left.supports === 1 ? 'socket' : 'sockets'));
  if(left.points > 0) bits.push(left.points + ' points');
  return '<p class="bn-h4">Left on the table <span>' + bits.length + '</span></p>' +
    '<p class="note">' + (bits.length ? esc(bits.join(' · ')) + ' still open.' : 'Nothing still open.') + '</p>' +
    (left.spare.length ? '<ul class="bd-spare">' + left.spare.slice(0, 8).map(x =>
      '<li><b>' + esc(x.n) + '</b><span>' + esc(x.why) + '</span></li>').join('') + '</ul>' +
      (left.spare.length > 8 ? '<p class="note">' + (left.spare.length - 8) + ' more in the pool unused.</p>' : '')
      : '') +
    (left.priced ? '<p class="note">What it used, at live prices: ' + num(left.paid) + ' Exalted Orbs over ' +
      left.priced + (left.priced === 1 ? ' pick' : ' picks') +
      (left.free ? ' · ' + left.free + ' with no price' : '') + '.</p>'
      : (left.free ? '<p class="note">' + left.free + (left.free === 1 ? ' pick has' : ' picks have') +
        ' no price. A rare is not a listed thing.</p>' : '')) +
    '<p class="note">Points counted off the level. What a quest grants is in nothing we read.</p>';
}
