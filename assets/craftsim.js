/* The crafting bench, and the run it launches. Two cards (assets/kinds.js, kinds 'n' and 'r'); the card
   layer draws the item, the picks and the button, and this file draws the currency tab, the simulator, and
   nothing else.

   The rules are not here. Every roll, every refusal and every one of the eleven decisions is in
   assets/engine.js, which tools/dev/simcheck.mjs measures over 250,000 rolls a class — so what the check
   proves is what a player gets. This file picks the item, keeps the plan, hands the engine a step and shows
   what came back.

   Data: data/craft.json and data/craft/<kind>.json (tools/craft.py, from the game files; essence tables and
   orb floors checked on poe2db). Art and prices: the pictures the site already ships and data/market.json,
   which is the in-game Currency Exchange and live trade listings and never an estimate — a currency the
   market does not price today is left out of the spend and counted beside it.

   Nothing here prints a chance per hit, a "1 in N" or a cost to hit, in any form. A pool nobody has measured
   rolls evenly, says so in one line, and prints no share on any row. */
import { D, esc, moneyHTML, openDetail, hrefOf, repaint, markHTML } from './app.js';
import * as E from './engine.js';

const HOURS = 12;                 // a craft older than this is dropped on read, tab or no tab
const LOG = 200, UNDO = 20;       // the steps kept, and the item states you can step back through
const KEY = 'wi.sim';

/* ---------- the data ---------- */
let X = null;                     // data/craft.json
const FILES = new Map();          // kind of item -> a promise of its own file
const SHELVES = new Map();        // kind of item + base -> what the bench crafts with there
let CSS = null, LOOKED = false;

async function craftData(){
  if(!X){
    const r = await fetch('data/craft.json');
    if(!r.ok) throw new Error(r.status);
    X = await r.json();
    E.useData(X);
  }
  return X;
}
function classData(id){
  if(!FILES.has(id)) FILES.set(id, fetch('data/craft/' + id + '.json').then(r => {
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(d => E.prepClass(d, id)));
  return FILES.get(id);
}
/* the bench's own styles, fetched the first time a bench card opens and never before: none of this is in
   the first paint, and the service worker keeps it with the rest of a deploy */
function styles(){
  return CSS || (CSS = new Promise(ok => {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = 'assets/bench.css';
    l.addEventListener('load', ok, {once: true});
    l.addEventListener('error', ok, {once: true});
    document.head.appendChild(l);
  }));
}

/* ---------- art, prices and the card behind a name ----------
   Every picture is one the site already ships: the index's own for a card it holds, the market's icon for a
   currency it prices, the game's own art for a base item. A name with neither draws its first letter, the
   way the card frame does. */
const marketRow = n => (D.market && D.market.items && D.market.items['c:' + n]) || null;
const indexCard = n => (D.byKey && D.byKey.get('c:' + n)) || null;
function artOf(n){
  const c = indexCard(n);
  if(c && c.img) return c.img;
  const m = marketRow(n);
  return (m && m.ic) || '';
}
function baseArt(b){
  const c = b && D.byKey && D.byKey.get('b:' + b.n);
  if(c && c.img) return c.img;
  return b && b.ic && X ? X.img + b.ic + '.webp' : '';
}
const priceOf = n => { const m = marketRow(n); return m && m.v !== undefined ? m.v : null; };
const glyph = n => esc(String(n || '?').replace(/^[^A-Za-z]+/, '').charAt(0));
const icHTML = n => { const u = artOf(n); return '<span class="bn-ic">' +
  (u ? '<img src="' + esc(u) + '" alt="" loading="lazy" decoding="async">' : '<i>' + glyph(n) + '</i>') + '</span>'; };
const cls = id => X.classes.find(c => c.id === id) || null;
const baseOf = (d, n) => (d.bases || []).find(b => b.n === n) || null;
const split = s => { const i = String(s).indexOf(':'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
const pickKey = x => x.g + ':' + x.n;

/* ---------- what the bench crafts with ----------
   The groups the game sorts currency into, in the order the tab shows them. Each entry carries the name, the
   game's own line and which step the engine runs for it: nothing about what a step does is worked out here. */
const GROUPS = [
  {g: 'orb', n: 'Orbs', mid: 1},
  {g: 'essence', n: 'Essences'},
  {g: 'omen', n: 'Omens'},
  {g: 'rune', n: 'Runes & soul cores'},
  {g: 'bone', n: 'Desecration'},
  {g: 'cat', n: 'Catalysts'},
];
function shelf(d, cl, base){
  const key = d.id + '|' + ((base && base.n) || '');
  if(SHELVES.has(key)) return SHELVES.get(key);
  const out = {orb: [], essence: [], omen: [], rune: [], bone: [], cat: []};
  for(const o of X.orbs){
    const step = E.ORB[o.n];
    if(!step) continue;
    out.orb.push({n: o.n, t: o.t, g: 'orb', step});
    for(const [n, min] of o.up || [])
      out.orb.push({n, t: o.t, g: 'orb', step, min, sub: 'nothing below modifier level ' + min});
  }
  for(const e of d.ess || []) out.essence.push({n: e[0], g: 'essence', step: 'essence', name: e[0],
    t: e[1] === 'm' ? 'Upgrades a Magic item to a Rare item, adding a guaranteed modifier'
      : 'Removes a random modifier and augments a Rare item with a new guaranteed modifier',
    sub: (E.side(d, e[2]) === 'p' ? 'Prefix' : 'Suffix') + ' · ' + d.fam[d.mods[e[2]][1]][1].join(' / ')});
  for(const o of X.omens) out.omen.push({n: o.n, t: o.t, g: 'omen', omen: true, on: o.orb,
    sub: o.t.replace(/^While this item is active in your inventory y/, 'Y')});
  for(const a of d.aug || []) out.rune.push({n: a[0], g: 'rune', step: 'rune', name: a[0],
    t: (a[3] || []).join(' · '),
    sub: (a[3] || []).join(' · ') + ((a[4] || []).length ? ' · bonded: ' + a[4].join(' · ') : '')});
  for(const b of X.bones) if((b.on || []).includes(d.id))
    out.bone.push({n: b.n, t: b.t, g: 'bone', bone: b,
      sub: b.t + (b.mi ? ' · an item of level ' + b.mi + ' or less' : '')});
  const on = d.id === 'jewel' ? 'jewel' : 'jewellery';
  if(base && base.ca) for(const c of X.cats) if(c.on === on)
    out.cat.push({n: c.n, t: c.t, g: 'cat', step: 'catalyst', name: c.n, tag: c.tag, sub: c.t});
  SHELVES.set(key, out);
  return out;
}
const allOf = all => [].concat(...GROUPS.map(g => all[g.g]));
/* Whether this kind of item can be offered the entry at all — a fact about the kind, settled before anything
   runs. What the item's own state refuses is the engine's to say, on the run, in the game's own words. */
function fits(x, cl){
  if(x.g === 'omen' && (E.LEGACY[x.n] || E.NO_ROLL[x.n])) return E.omenOpts([x.n]).why;
  if(x.g === 'rune' && !cl.so) return 'A ' + cl.n + ' has no augment socket to put one in';
  if(x.g === 'orb' && x.step === 'socket' && !cl.so) return 'A ' + cl.n + ' takes no augment socket';
  if(x.g === 'orb' && !cl.rare && ['regal', 'alchemy', 'exalt', 'chaos', 'fracture'].includes(x.step))
    return 'A ' + cl.n + ' cannot be Rare';
  return '';
}
/* An omen rides on the next use of one currency, which the omen's own line names (data/craft.json `orb`). A
   Greater or a Perfect orb is the same orb with a floor, so an omen for the plain one rides on it too. */
function omenRides(n, x){
  const on = (X.omens.find(y => y.n === n) || {}).orb;
  if(!on) return false;
  if(on === 'Essence') return x.g === 'essence';
  if(on === 'Desecrate') return x.g === 'bone';
  if(x.g !== 'orb') return false;
  const orb = X.orbs.find(y => y.n === on);
  return !!orb && (orb.n === x.n || (orb.up || []).some(([u]) => u === x.n));
}
const LORD = {'Omen of the Blackblooded': 'Kurgal', 'Omen of the Liege': 'Amanamu', 'Omen of the Sovereign': 'Ulaman'};

/* ==================================================================== the bench card */
let BENCH = null;   // the plan: the kind of item, the base, the item level and what is picked for it
let BIT = null;     // the bench card's own entry, kept, so going back to the bench finds the one you left
let SEQ = 0;

const blank = () => ({cls: '', base: '', ilvl: 0, picks: []});

/* the plan made whole: a kind that exists, a base of it, an item level inside the game's own range, and no
   pick the shelf no longer holds */
async function ready(plan){
  if(!plan.cls || !cls(plan.cls)) plan.cls = 'ring';
  const d = await classData(plan.cls);
  if(!baseOf(d, plan.base)) plan.base = (d.bases[0] || {}).n || '';
  const b = baseOf(d, plan.base);
  if(!plan.ilvl) plan.ilvl = X.ilvl;
  plan.ilvl = Math.max((b && b.dl) || 1, Math.min(X.ilvl, Math.round(plan.ilvl) || X.ilvl));
  const have = new Set(allOf(shelf(d, cls(plan.cls), b)).map(pickKey));
  plan.picks = plan.picks.filter(k => have.has(k));
  return b;
}
/* the card you came from, in hand: a base lands as the item, an item class picks that kind with no base
   yet, a currency lands picked, and an essence or a rune this kind of item takes nothing from opens the
   bench on a kind that does take it. A base handed over with an item level on it — the Craft tab's own
   item, which is a base at a level the player set — keeps that level instead of the class's top. */
async function handed(plan, from){
  if(!from) return '';
  if(from.k === 'b' && from.cr && cls(from.cr)){
    plan.cls = from.cr;
    plan.base = from.n;
    plan.ilvl = from.ilvl || X.ilvl;
    return '';
  }
  // an item class is its own class (KINDS make), so its card names the kind and nothing else
  if(from.k === 'i' && cls(from.cr || from.id)){
    plan.cls = from.cr || from.id;
    plan.base = '';
    plan.ilvl = X.ilvl;
    return '';
  }
  if(from.k !== 'c') return '';
  const bone = X.bones.find(b => b.n === from.n);
  const cat = X.cats.find(c => c.n === from.n);
  if(bone && !(bone.on || []).includes(plan.cls)){ plan.cls = bone.on[0]; plan.base = ''; }
  if(cat && !(cat.on === 'jewel' ? plan.cls === 'jewel' : ['ring', 'amulet'].includes(plan.cls))){
    plan.cls = cat.on === 'jewel' ? 'jewel' : 'ring';
    plan.base = '';
  }
  let b = await ready(plan);
  let d = await classData(plan.cls);
  let x = allOf(shelf(d, cls(plan.cls), b)).find(y => y.n === from.n);
  if(!x){
    // an essence, a rune or a soul core: the kinds of item it works on are offered first
    for(const c of X.classes){
      const f = await classData(c.id);
      if(!(f.ess || []).some(e => e[0] === from.n) && !(f.aug || []).some(a => a[0] === from.n)) continue;
      plan.cls = c.id;
      plan.base = '';
      b = await ready(plan);
      d = f;
      x = allOf(shelf(f, cls(c.id), b)).find(y => y.n === from.n);
      break;
    }
  }
  if(!x) return 'The bench does not craft with ' + from.n + '.';
  const why = fits(x, cls(plan.cls));
  if(why) return why;
  if(!plan.picks.includes(pickKey(x))) plan.picks.push(pickKey(x));
  return '';
}

/* what the bench is holding, in the shape the card's own fields read */
/* One wording for a craft you can go back to: the bench draws it, the run keeps it current, and
   neither counts the steps its own way. */
const stepsSaid = n => n + ' step' + (n === 1 ? '' : 's');
const againLabel = run => run
  ? 'Carry on the craft you left · ' + stepsSaid(run.log.filter(l => l.ok).length) : '';
async function benchView(plan){
  const d = await classData(plan.cls), cl = cls(plan.cls), b = baseOf(d, plan.base);
  const by = new Map(allOf(shelf(d, cl, b)).map(x => [pickKey(x), x]));
  // the pool as a Rare, which is the whole of what the base can ever roll
  const it = b ? E.newItem(d, b.n, plan.ilvl, cl.rare ? 'rare' : 'magic') : null;
  const cand = it ? E.candidates(it) : null;
  const rows = cand ? cand.list.slice().sort((a, z) => z.w - a.w || a.i - z.i).map(e => ({
    lines: d.mods[e.i][3], side: E.side(d, e.i), lvl: E.lvlOf(d, e.i), tier: tierOf(d, it.pool, e.i),
    w: cand.kind === 'measured' ? e.w : 0, share: E.shareOf(cand, e.i),
  })) : [];
  const picks = plan.picks.map(k => by.get(k)).filter(Boolean).map(x => ({
    n: x.n, t: x.sub || x.t, img: artOf(x.n), v: priceOf(x.n), omen: !!x.omen}));
  const again = RUNS.get(FRONT);
  return {
    pickers: 1, cls: plan.cls, kind: cl.n, base: plan.base, ilvl: plan.ilvl,
    ilvlMin: (b && b.dl) || 1, ilvlMax: X.ilvl,
    rarity: 'normal', corrupt: false, imp: (b && b.im) || [], mods: [],
    caps: {p: cl.mx[0], s: cl.mx[1]}, held: {p: 0, s: 0}, so: cl.so || 0, sockets: [], quality: '',
    kinds: X.classes.map(c => ({id: c.id, n: c.n + ' · ' + c.g})),
    bases: (d.bases || []).map(x => ({n: x.n, dl: x.dl})),
    pool: rows.length ? {rows, src: cand.kind === 'measured' ? weightSrc() : ''} : null,
    picks,
    again: againLabel(again),
    ready: !!(b && picks.length),
    why: !b ? 'No base picked.' : !picks.length ? 'Nothing picked to craft with.' : '',
    note: cand ? cand.note : '',
  };
}
function tierOf(d, pool, i){
  const tiers = pool.m.filter(j => d.mods[j][1] === d.mods[i][1]);
  return tiers.length < 2 ? '' : 'T' + (tiers.length - tiers.indexOf(i));
}
const weightSrc = () => X.wsrc ? 'How often each one rolls: ' + X.wsrc.n + ', ' + X.wsrc.how + '.' : '';

/* the entry the trail holds. One of it, so Back onto the bench finds the bench you left. */
async function benchIt(v, run){
  if(!BIT) BIT = {k: 'n', id: 'bench', n: '', s: ''};
  const d = await classData(v.cls);
  BIT.n = v.base || 'Crafting bench';
  BIT.s = v.base ? v.kind + ' · item level ' + v.ilvl +
    (run ? ' · ' + v.steps + ' step' + (v.steps === 1 ? '' : 's') : '')
    : 'No base chosen yet.';
  BIT.img = run ? baseArt(run.it.base) : baseArt(baseOf(d, v.base));
  BIT.plan = v;
  BIT.note = v.note;
  return BIT;
}

/* Currency handed over with the item rather than instead of it: the Craft tab opens the bench on the item it
   is on and on what the player was reading about it, so an essence that guarantees the modifier is already
   picked. Nothing here changes the item — the item came with the plan — and a currency this kind of item does
   not take is named, not swapped for something else. */
async function alsoPicked(plan, names){
  const d = await classData(plan.cls), cl = cls(plan.cls), b = baseOf(d, plan.base);
  const all = allOf(shelf(d, cl, b)), out = [];
  for(const n of names){
    const x = all.find(y => y.n === n);
    if(!x || fits(x, cl)){ out.push(n); continue; }
    if(!plan.picks.includes(pickKey(x))) plan.picks.push(pickKey(x));
  }
  return out.length ? 'A ' + cl.n + ' does not craft with ' + out.join(', ') + '.' : '';
}

export async function openBench(from, also){
  try { await craftData(); } catch { return; }
  await styles();
  if(!LOOKED){ LOOKED = true; await restore(); }
  const plan = BENCH || (BENCH = blank());
  let say = '';
  try { say = await handed(plan, from); } catch {}
  await ready(plan);
  if(also && also.length){
    let more = '';
    try { more = await alsoPicked(plan, also); } catch {}
    if(more) say = say ? say + ' · ' + more : more;
  }
  // the same choice paint makes: a craft already rolling on this item is what the card shows
  const run = live();
  const v = run ? runView(run) : await benchView(plan);
  await benchIt(v, run);
  if(say) BIT.s += ' · ' + say;
  saveBench();
  openDetail(BIT, {drawn: true, price: null, builds: false, kind: 'Bench', on: onBench}, null);
}
/* a card of either kind reached any other way — a link, the trail's own Forward after a close */
export async function openCard(it){
  if(it.k !== 'r') return openBench(null);
  try { await craftData(); } catch { return; }
  await styles();
  if(!LOOKED){ LOOKED = true; await restore(); }
  const run = RUNS.get(it.id);
  if(!run) return openBench(null);
  // a craft is not a card of its own any more: the bench is set back to it and opened on it
  BENCH = {...run.plan, picks: [...run.plan.picks]};
  FRONT = run.id;
  return openBench(null);
}

/* redraw the card the bench is on, from the plan as it now stands */
async function paint(){
  await ready(BENCH);
  const run = live();
  const v = run ? runView(run) : await benchView(BENCH);
  await benchIt(v, run);
  saveBench();
  repaint();
}
/* What a running craft answers for itself. Everything else on the card is the bench's, so one screen has one
   handler and no control is answered twice. */
const RUN_DOES = new Set(['sel', 'arm', 'use', 'take', 'undo', 'over', 'shut']);
/* every control on the bench card says what it does, and this is what it does. Nothing else answers them. */
function onBench(what, el, e){
  const [verb, rest] = split(what);
  const run = live();
  // the craft answers its own controls; the drawer, the search and the shelf stay the bench's
  if(run && RUN_DOES.has(split(what)[0])) return void onRun(run, what, el, e);
  const typing = e && e.type === 'input';
  if(verb === 'ilvl'){
    const lab = el.closest('.bn-lab');
    if(lab && lab.querySelector('b')) lab.querySelector('b').textContent = el.value;
    if(typing) return;
    BENCH.ilvl = +el.value;
    return void paint();
  }
  /* the bench's own search: it answers on every keystroke, only the tab is drawn again, and the box the
     redraw threw away is put back under the cursor where it was. */
  if(verb === 'find'){
    if(!live && e && e.type === 'change') return;   // one answer per keystroke, not two
    TAB.q = el.value;
    const at = el.selectionStart;
    tab().then(() => {
      const box = TAB.node && TAB.node.querySelector('.bn-q');
      if(!box || box === document.activeElement) return;
      box.focus();
      try { box.setSelectionRange(at, at); } catch {}
    });
    return;
  }
  if(typing) return;                              // a list answers on change, not on every keystroke in it
  if(verb === 'kind'){ BENCH.cls = el.value; BENCH.base = ''; return void paint(); }
  if(verb === 'base'){ BENCH.base = el.value; return void paint(); }
  if(verb === 'drop'){ BENCH.picks.splice(+rest, 1); return void paint(); }
  if(verb === 'group'){ TAB.open = rest; TAB.up = true; return void tab(); }
  if(verb === 'grip'){ TAB.up = !TAB.up; return void tab(); }
  if(verb === 'pick'){
    const at = BENCH.picks.indexOf(rest);
    if(at >= 0) BENCH.picks.splice(at, 1); else BENCH.picks.push(rest);
    // a craft already rolling takes it in hand there and then: that is what the drawer is for
    if(run){
      const was = run.plan.picks.indexOf(rest);
      if(was >= 0){ run.plan.picks.splice(was, 1); run.armed.delete(rest); if(run.sel === rest) run.sel = ''; }
      else run.plan.picks.push(rest);
      saveRun(run);
    }
    return void paint();
  }
  if(verb === 'card'){ const c = indexCard(rest); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
  if(verb === 'again'){
    const was = RUNS.get(FRONT);
    if(was){ BENCH.cls = was.plan.cls; BENCH.base = was.plan.base; BENCH.ilvl = was.plan.ilvl;
             BENCH.picks = [...was.plan.picks]; paint(); }
    return;
  }
  if(verb === 'roll') return void launch();
}

/* ---------- the currency tab ----------
   The game's own tab, expanded: the orbs in the middle, the mechanic currency along the sides, and each side
   opening into its full list in the middle. On a phone the whole of it is a sheet at the bottom of the
   screen — the groups along the top of it, one list at a time, and the handle pulls the full tab up. */
const TAB = {open: 'orb', up: false, node: null, under: null, q: ''};

export function fill(host, it){
  if(!TAB.node){
    TAB.node = document.createElement('div');
    TAB.node.className = 'bn-sheet';
  }
  if(!TAB.under){
    TAB.under = document.createElement('div');
    TAB.under.className = 'bn-under';
  }
  host.classList.add('bn-stick');   // on a phone the box the field left is what the sheet sticks to
  host.replaceChildren(TAB.node, TAB.under);
  overNav(host);
  tab();
  benchUnder();
}
/* under the drawer: nothing at all before a craft is rolling, and the craft's own controls and log once one
   is. A choice the craft is waiting on takes the whole of it, because there is one thing to answer. */
function benchUnder(){
  const run = live();
  if(!TAB.under) return;
  TAB.under.innerHTML = !run ? ''
    : run.offer ? offerHTML(run) + ctlHTML(run) + logHTML(run, E.poolNote(run.it.pool))
    : ctlHTML(run) + logHTML(run, E.poolNote(run.it.pool));
}
// the bar at the foot of an open card on a phone: the sheet sits above it rather than under it
function overNav(node){
  const nav = node.closest('.ov-box') && node.closest('.ov-box').querySelector('.ov-nav');
  const h = nav && !nav.hidden ? Math.round(nav.getBoundingClientRect().height) : 0;
  node.style.setProperty('--bn-nav', h + 'px');
}
async function tab(){
  const node = TAB.node;
  if(!node || !BENCH || !BENCH.cls) return;
  const d = await classData(BENCH.cls), cl = cls(BENCH.cls), b = baseOf(d, BENCH.base);
  const all = shelf(d, cl, b);
  if(!all[TAB.open] || !all[TAB.open].length) TAB.open = 'orb';
  const held = new Set(BENCH.picks);
  const mid = GROUPS.find(g => g.g === TAB.open) || GROUPS[0];
  const was = node.querySelector('.bn-cells');
  const top = was ? was.scrollTop : 0;
  node.dataset.open = TAB.open;
  node.classList.toggle('up', TAB.up);
  /* What the middle of the tab shows: the group you are in, or — the moment anything is typed — whatever
     answers to it across every group, because a player looking for the Chaos Orb should not have to know
     which shelf the game keeps it on. Each found row still says the group it came from. */
  const q = TAB.q.trim().toLowerCase();
  // every word, anywhere on the row: its name, the group it is in, and what it says it does
  const qw = q ? q.split(/\s+/).filter(Boolean) : [];
  const says = x => (x.n + ' ' + (x.sub || '') + ' ' + (x.t || '')).toLowerCase();
  const found = q ? GROUPS.flatMap(g => (all[g.g] || [])
    .filter(x => { const h = says(x) + ' ' + g.n.toLowerCase(); return qw.every(w => h.includes(w)); })
    .map(x => ({x, g: g.n}))) : null;
  /* While a craft is running the drawer holds both halves: what is in hand to use on the item now, and the
     whole shelf to bring more in without leaving the craft. Before one, only the shelf. */
  const run = live();
  const by = run ? new Map(allOf(all).map(x => [pickKey(x), x])) : null;
  const picks = run ? run.plan.picks.map(k => ({k, x: by.get(k)})).filter(p => p.x) : [];
  const inHand = picks.filter(p => !p.x.omen), omens = picks.filter(p => p.x.omen);
  const sel = run ? pickOf(run, run.sel) : null;
  node.innerHTML =
    '<button type="button" class="bn-grip" data-do="grip" aria-label="' +
      (TAB.up ? 'Close the currency tab' : 'Open the full currency tab') + '"><span></span></button>' +
    '<div class="bn-sides">' + GROUPS.filter(g => g.mid || all[g.g].length).map(g =>
      '<button type="button" class="bn-gt" data-do="group:' + g.g + '" aria-pressed="' + (!q && TAB.open === g.g) +
      '">' + icHTML(((all[g.g] || []).find(x => artOf(x.n)) || all[g.g][0] || {}).n || '') + '<span>' + esc(g.n) + '<i>' + all[g.g].length +
      '</i></span></button>').join('') + '</div>' +
    '<div class="bn-mid">' +
      (run ? '<p class="bn-now">' + (sel ? icHTML(sel.n) + '<b>' + esc(sel.n) + '</b>' : '<b>Pick a currency</b>') + '</p>' +
        '<p class="bn-h4">In hand <span>' + inHand.length + '</span></p>' +
        '<div class="bn-cells bn-hand">' + inHand.map(({k, x}) => runCell(run, k, x)).join('') + '</div>' +
        (omens.length ? '<p class="bn-h4">Omens <span>' + [...run.armed].length + ' armed</span></p>' +
          '<div class="bn-omens">' + omens.map(({k, x}) => '<button type="button" class="bn-omen" data-do="arm:' +
            esc(k) + '" aria-pressed="' + run.armed.has(k) + '" title="' + esc(x.t) + '">' + icHTML(x.n) +
            '<span>' + esc(x.n.replace(/^Omen of /, '')) + '</span></button>').join('') + '</div>' +
          '<p class="note">' + esc(E.DECISION[11].says) + '</p>' : '') +
        '<p class="bn-h4 bn-more">Bring more in</p>' : '') +
      '<div class="bn-find"><input class="bn-q" type="search" data-find data-do="find" ' +
        'placeholder="Search every currency…" autocomplete="off" spellcheck="false" ' +
        'aria-label="Search every currency on the bench" value="' + esc(TAB.q) + '"></div>' +
      '<p class="bn-h4">' + (found ? 'Found' : esc(mid.n)) + ' <span>' +
        (found ? found.length : all[TAB.open].length) + '</span></p>' +
      '<div class="bn-cells">' + (found
        ? (found.length ? found.map(({x, g}) => cellHTML(x, cl, held.has(pickKey(x)), g)).join('')
           : '<p class="note">Nothing by that name.</p>')
        : all[TAB.open].map(x => cellHTML(x, cl, held.has(pickKey(x)))).join('')) +
    '</div></div>';
  const now = node.querySelector('.bn-cells');
  if(now) now.scrollTop = top;
}
/* the way to that currency's own card, on every row: the mark for "what is this" and no word, so the row
   keeps its width and the name reads as the name. The name is in the hover text and for a screen reader,
   so nothing is lost to anyone who cannot see the mark. The shape is declared with the rest of them
   (MARKS in assets/app.js). */
const cardMark = n => '<button type="button" class="bn-card" data-do="card:' + esc(n) + '" title="' +
  esc(n) + ' card" aria-label="' + esc(n) + ' card">' + markHTML('ask') + '</button>';
// `from` is the group a found row came from, said on the row, because a search crosses every shelf
function cellHTML(x, cl, on, from){
  const why = fits(x, cl), v = priceOf(x.n);
  return '<div class="bn-cellw' + (why ? ' off' : '') + '">' +
    '<button type="button" class="bn-cell" data-do="pick:' + esc(pickKey(x)) + '" aria-pressed="' + on + '"' +
      (why ? ' disabled' : '') + '>' + icHTML(x.n) +
      '<span class="bn-cn"><b>' + esc(x.n) + '</b>' +
      (from ? '<span class="bn-from">' + esc(from) + '</span>' : '') +
      (x.sub || x.t ? '<span>' + esc(x.sub || x.t) + '</span>' : '') + '</span>' +
      (v !== null ? '<span class="bn-px">' + moneyHTML(v) + '</span>' : '') + '</button>' +
    (indexCard(x.n) ? cardMark(x.n) : '') +
    (why ? '<span class="bn-why">' + esc(why) + '</span>' : '') + '</div>';
}

/* ==================================================================== the running card */
const RUNS = new Map();
let FRONT = '';   // the run the bench last launched or restored, so the bench can offer it back

function newRun(plan, it){
  return {id: 'run-' + Date.now().toString(36) + '-' + (++SEQ), plan: {...plan, picks: [...plan.picks]},
    it, log: [], undo: [], used: {}, seed: (Math.random() * 0xFFFFFFFF) >>> 0, at: 0,
    sel: '', armed: new Set(plan.picks.filter(k => k.startsWith('omen:'))), say: ''};
}
/* the stream, wound to where the run stands. A reload carries on the same one rather than starting a fresh
   one, and one step back winds it to where that step began. */
function stream(run){
  const base = E.rng(run.seed);
  for(let i = 0; i < run.at; i++) base();
  run.rnd = () => { run.at++; return base(); };
}
/* Rolling does not leave the card. The bench and the craft are one screen: the item you set up is the item
   that rolls, the drawer that held the materials keeps holding them, and what the roll did is written under
   both. Nothing to go Back to, because nothing was left. */
async function launch(){
  if(!BENCH || !BENCH.base || !BENCH.picks.length) return;
  const d = await classData(BENCH.cls);
  const run = newRun(BENCH, E.newItem(d, BENCH.base, BENCH.ilvl, 'normal'));
  stream(run);
  RUNS.set(run.id, run);
  FRONT = run.id;
  TAB.up = true;              // the drawer opens on the first roll, so what you are holding is in hand
  saveRun(run);
  saveBench();
  await paint();
}
/* the craft this bench is running, if it is running one on the item the bench is set to */
function live(){
  const run = RUNS.get(FRONT);
  if(!run || !BENCH) return null;
  return run.plan.cls === BENCH.cls && run.plan.base === BENCH.base && run.plan.ilvl === BENCH.ilvl ? run : null;
}
const pickOf = (run, key) => key
  ? allOf(shelf(run.it.d, run.it.cl, run.it.base)).find(x => pickKey(x) === key) || null : null;

/* The item as the craft has left it, in the same shape benchView gives, so one card draws either. No
   pickers: the class, the base and the item level are what this craft is, and changing one is a new craft. */
function runView(run){
  const it = run.it, d = it.d, sel = pickOf(run, run.sel);
  return {
    pickers: 0, cls: d.id, kind: it.cl.n, base: it.base.n, ilvl: it.ilvl, rarity: it.rarity,
    corrupt: it.corrupt, imp: it.imp, so: it.cl.so || 0, sockets: it.sockets,
    caps: {p: E.capFor(it, 'p'), s: E.capFor(it, 's')},
    held: {p: E.countSide(it, 'p'), s: E.countSide(it, 's')},
    quality: it.quality ? 'Quality enhances ' + it.quality.tag + ' modifiers (' + it.quality.n + ')' : '',
    mods: it.mods.map(m => ({side: E.side(d, m.i) || 'p', lines: m.lines, frac: m.frac,
      lvl: E.lvlOf(d, m.i), tier: tierOf(d, it.pool, m.i), src: SRC[m.src] || ''})),
    pool: null,   // no share on any row here: a chance beside a modifier that has landed is a chance per hit
    use: sel ? 'Use ' + sel.n + ' on it' : 'Pick a currency, then use it on the item',
    kinds: [], bases: [], picks: [], again: '', ready: false, why: '', note: '',
    running: true,   // the roll button is not drawn over a craft that is already rolling
    steps: run.log.filter(l => l.ok).length,
  };
}
const SRC = {p: '', e: 'Essence', d: 'Desecrated', c: 'Corrupted'};

function onRun(run, what, _el, e){
  if(e && e.type === 'input') return;
  const [verb, rest] = split(what);
  // picking a currency does not unpick it: in the game you take one and keep clicking the item with it
  if(verb === 'sel'){ run.sel = rest; return void runPaint(run); }
  if(verb === 'arm'){ run.armed.has(rest) ? run.armed.delete(rest) : run.armed.add(rest); return void runPaint(run); }
  if(verb === 'use') return void use(run);
  if(verb === 'take') return void take(run, rest === '' ? null : +rest);
  if(verb === 'undo') return void undoStep(run);
  if(verb === 'over') return void restart(run);
  if(verb === 'shut'){ run.offer = null; return void runPaint(run); }
  if(verb === 'card'){ const c = indexCard(rest); if(c) openDetail(c, {nested: true}, hrefOf(c)); return; }
}
/* one use of the currency that is picked, with whatever omens are armed for it riding on it */
function use(run){
  const x = pickOf(run, run.sel);
  if(!x) return;
  const on = [...run.armed].map(k => k.slice(5)).filter(n => omenRides(n, x));
  // a desecration omen narrows a choice the player makes, not a draw the bench makes, so it sets no option
  const rider = on.filter(n => !E.DESECRATE_OMEN.has(n));
  const o = E.omenOpts(rider);
  if(!o.ok) return void note(run, {n: x.n, om: on, ok: false, why: o.why});
  const opt = {...o.opt};
  if(x.min) opt.min = x.min;
  if(x.name) opt.name = x.name;
  if(x.tag) opt.tag = x.tag;
  if(x.step === 'vaal' || x.g === 'bone') return void offerChoice(run, x, on, opt);
  const step = E.STEP[x.step];
  if(!step) return void note(run, {n: x.n, om: on, ok: false, why: 'The bench does not craft with ' + x.n});
  mark(run);
  land(run, x, on, step(run.it, run.rnd, opt));
}
/* The two steps that will not roll. Neither the Vaal Orb's outcomes nor the reveal's are published as odds,
   so the bench lists what the item can take and the player takes one to practise. */
function offerChoice(run, x, on, opt){
  const can = x.g === 'bone' ? E.canBone(run.it, x.bone) : E.canVaal(run.it);
  if(!can.ok) return void note(run, {n: x.n, om: on, ok: false, why: can.why});
  const d = run.it.d;
  let only = opt.only, lord = '';
  for(const n of on.filter(y => E.DESECRATE_OMEN.has(y))){
    const o = X.omens.find(y => y.n === n) || {};
    if(o.only) only = o.only;
    if(LORD[n]) lord = LORD[n];
  }
  const list = x.g === 'bone'
    ? E.boneChoices(run.it, {only, min: x.bone.ml, lord})
    : E.vaalChoices(run.it);
  run.offer = {n: x.n, om: on, why: can.why, src: x.g === 'bone' ? 'd' : 'c',
    more: on.includes('Omen of Abyssal Echoes')
      ? 'The bench already shows every modifier the item can take, so there is nothing left for a second reveal to change.' : '',
    list: list.map(i => ({i, lines: d.mods[i][3], side: E.side(d, i), lvl: E.lvlOf(d, i),
      lord: d.fam[d.mods[i][1]][5] || ''}))};
  TAB.up = false;            // the choice comes first: the drawer is out of the way until it is answered
  runPaint();
  const el = TAB.under && TAB.under.querySelector('.bn-offer');
  if(el) el.scrollIntoView({block: 'nearest'});
}
function take(run, i){
  const off = run.offer;
  if(!off) return;
  mark(run);
  const r = E.STEP.take(run.it, run.rnd, {i, src: off.src});
  run.offer = null;
  land(run, {n: off.n}, off.om, r, off.why);
}
// where the item and the stream stood before this step, so one step back is exact
function mark(run){
  run.undo.push({it: E.clone(run.it), at: run.at, log: run.log.length,
    used: {...run.used}, armed: [...run.armed]});   // stepping back gives the currency and the omen back
  if(run.undo.length > UNDO) run.undo.shift();
}
function land(run, x, on, r, why){
  if(!r.ok){
    run.undo.pop();                             // nothing happened, so there is nothing to step back through
    return void note(run, {n: x.n, om: on, ok: false, why: r.why});
  }
  for(const n of on) run.armed.delete('omen:' + n);   // an omen that triggered is used up (decision 11)
  run.used[x.n] = (run.used[x.n] || 0) + 1;
  for(const n of on) run.used[n] = (run.used[n] || 0) + 1;
  note(run, {n: x.n, om: on, ok: true, what: r.what, note: r.note || why || '',
    // a modifier that landed is written the way the game writes it, sign and all: a "+" in front of
    // "+49 to Accuracy Rating" is the same plus twice. Only what was taken off needs a mark of its own.
    lines: [...(r.added || []).map(m => m.lines.join(' / ')),
            ...(r.removed || []).map(m => '− ' + m.lines.join(' / '))]});
}
function note(run, line){
  run.log.unshift(line);
  if(run.log.length > LOG) run.log.length = LOG;
  saveRun(run);
  runPaint(run);
}
function undoStep(run){
  const back = run.undo.pop();
  if(!back) return;
  run.it = back.it;
  run.at = back.at;
  stream(run);
  run.log = run.log.slice(run.log.length - back.log);
  if(back.used) run.used = back.used;              // what it cost is what you have really used
  if(back.armed) run.armed = new Set(back.armed);  // and an omen the step ate is armed again
  run.offer = null;
  saveRun(run);
  runPaint(run);
}
function restart(run){
  run.it = E.newItem(run.it.d, run.it.base.n, run.plan.ilvl, 'normal');
  run.log = []; run.undo = []; run.used = {}; run.offer = null; run.at = 0;
  run.armed = new Set(run.plan.picks.filter(k => k.startsWith('omen:')));
  stream(run);
  saveRun(run);
  runPaint(run);
}
/* One card, so one way to draw it: the bench's own paint, which draws the item the craft has left and the
   drawer and the log under it. */
const runPaint = () => paint();
const ctlHTML = run => '<div class="bn-ctl"><button type="button" class="btn" data-do="undo"' +
  (run.undo.length ? '' : ' disabled') + '>Undo</button><button type="button" class="btn" data-do="over"' +
  (run.log.length ? '' : ' disabled') + '>Start over</button>' + spendHTML(run) + '</div>';
const logHTML = (run, even) => (even ? '<p class="card-src bn-note">' + esc(even) + '</p>' : '') +
  '<p class="bn-h4">What it did <span>' + run.log.length + '</span></p>' +
  (run.log.length ? '<ul class="bn-log">' + run.log.map(stepHTML).join('') + '</ul>'
    : '<p class="note">Nothing yet.</p>') +
  (run.say ? '<p class="card-src">' + esc(run.say) + '</p>' : '');
const runCell = (run, k, x) => '<div class="bn-cellw"><button type="button" class="bn-cell" data-do="sel:' +
  esc(k) + '" aria-pressed="' + (run.sel === k) + '">' + icHTML(x.n) + '<span class="bn-cn"><b>' + esc(x.n) +
  '</b>' + (run.used[x.n] ? '<span>used ' + run.used[x.n] + '</span>' : '') + '</span></button>' +
  (indexCard(x.n) ? cardMark(x.n) : '') + '</div>';
const stepHTML = l => '<li class="' + (l.ok ? 'on' : 'no') + '"><span class="bn-sn">' + esc(l.n) +
  ((l.om || []).length ? ' <i>' + l.om.map(n => esc(n.replace(/^Omen of /, ''))).join(', ') + '</i>' : '') +
  '</span><span class="bn-sw">' + esc(l.ok ? l.what : l.why) + '</span>' +
  ((l.lines || []).length ? '<span class="bn-sl">' + l.lines.map(esc).join('<br>') + '</span>' : '') +
  (l.note ? '<span class="bn-snote">' + esc(l.note) + '</span>' : '') + '</li>';
function offerHTML(run){
  const o = run.offer;
  if(!o) return '';
  return '<div class="bn-offer"><p class="bn-h4">' + esc(o.n) + ' <span>' + o.list.length +
    ' it can take</span></p><p class="note">' + esc(o.why) + '</p>' +
    (o.more ? '<p class="note">' + esc(o.more) + '</p>' : '') +
    (o.list.length ? '<ul class="bn-mods bn-choose">' + o.list.map(c =>
      '<li><button type="button" data-do="take:' + c.i + '"><span class="bn-ml">' + c.lines.map(esc).join('<br>') +
      '</span><span class="bn-mm">' + esc([c.side === 'p' ? 'Prefix' : c.side === 's' ? 'Suffix' : 'Implicit',
        'level ' + c.lvl, c.lord].filter(Boolean).join(' · ')) + '</span></button></li>').join('') + '</ul>'
      : '<p class="note">Nothing on this item can take one.</p>') +
    '<div class="bn-ctl"><button type="button" class="btn" data-do="take:">Corrupt it and add nothing</button>' +
    '<button type="button" class="btn" data-do="shut">Leave it</button></div></div>';
}
/* What it cost, at today's real prices and at no other kind of price: the in-game Currency Exchange and live
   trade listings (data/market.json). A currency the market does not price today is left out of the total and
   counted beside it, because a price we do not have is not a price. No cost per attempt, and no cost to hit. */
function spendHTML(run){
  let div = 0, priced = 0, uses = 0, unpriced = 0;
  for(const [n, k] of Object.entries(run.used)){
    uses += k;
    const v = priceOf(n);
    if(v === null){ unpriced += k; continue; }
    div += v * k;
    priced += k;
  }
  if(!uses) return '';
  const said = uses + ' use' + (uses === 1 ? '' : 's');
  if(!priced) return '<span class="bn-spend"><b>No price</b><i>' + said +
    ', and the market prices none of them today</i></span>';
  return '<span class="bn-spend">Spent <b>' + moneyHTML(div) + '</b><i>' + said +
    (unpriced ? ' · ' + unpriced + ' of them the market does not price today' : '') + '</i></span>';
}

/* ==================================================================== the state that survives a refresh
   sessionStorage, because the session is what the owner asked for: it lives as long as the tab, dies with
   it, and is never shared between tabs. Every read and write is in a try, so a browser with storage denied
   works the same. Nothing impossible ever comes back: an item is rebuilt from the data as it stands today,
   or it is not restored at all. The keys a modifier is saved by are the game's own and never reach a screen,
   the same way assets/craft.js already keeps a plan. */
const put = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} };
const get = k => { try { const s = sessionStorage.getItem(k); return s ? JSON.parse(s) : null; } catch { return null; } };
const stamp = () => ({v: 1, p: X.patch, w: (X.wsrc || {}).d, t: Date.now()});
const fresh = r => !!r && r.v === 1 && !!r.t && Date.now() - r.t < HOURS * 3600e3;

function saveBench(){
  if(!BENCH) return;
  put(KEY, {...stamp(), cls: BENCH.cls, base: BENCH.base, ilvl: BENCH.ilvl, picks: BENCH.picks, front: FRONT});
}
const itemRec = it => ({
  base: it.base.n, ilvl: it.ilvl, rarity: it.rarity, corrupt: it.corrupt, quality: it.quality,
  imp: it.imp, sockets: it.sockets,
  mods: it.mods.map(m => [it.d.mods[m.i][0], m.vals, m.src, m.frac ? 1 : 0]),
});
function saveRun(run){
  put(KEY + '.' + run.id, {...stamp(), cls: run.it.d.id, ...itemRec(run.it), plan: run.plan, used: run.used,
    armed: [...run.armed], sel: run.sel, seed: run.seed, at: run.at, log: run.log.slice(0, LOG),
    undo: run.undo.map(u => ({it: itemRec(u.it), at: u.at, log: u.log, used: u.used, armed: u.armed}))});
}
/* An item off a record, rebuilt from the data as it is today. A modifier whose key the data no longer holds,
   or that this base cannot roll, goes and is counted; an item that would break its caps, its groups or its
   item level does not come back at all. An essence puts its modifier on whatever the item level (decision 3),
   so that one is the exception to the level check. */
function rebuild(d, rec){
  const it = E.newItem(d, rec.base, rec.ilvl, rec.rarity);
  const pool = it.pool;
  let gone = 0;
  for(const [key, vals, src, frac] of rec.mods || []){
    const i = d.at.get(key);
    const inPool = i !== undefined &&
      (pool.m.includes(i) || (pool.d || []).includes(i) || (pool.c || []).includes(i));
    if(!inPool){ gone++; continue; }
    const a = E.side(d, i);
    if(src !== 'e' && E.lvlOf(d, i) > it.ilvl) return null;
    if(E.heldFams(it).has(d.mods[i][1])) return null;
    if(E.groupsOf(d, i).some(g => E.heldGroups(it).has(g))) return null;
    if(a && E.countSide(it, a) >= E.capFor(it, a)) return null;
    it.mods.push({i, src, vals: (vals || []).slice(), lines: E.modLines(d, i, vals || []), frac: !!frac});
  }
  it.corrupt = !!rec.corrupt;
  it.quality = rec.quality || null;
  it.imp = (rec.imp || []).slice();
  it.sockets = (rec.sockets || []).slice();
  return {it, gone};
}
/* What a reload finds: the bench where it was, and the craft that was in front of it — or, where the data has
   moved on under it, the plan on its own and one line saying so. */
async function restore(){
  const b = get(KEY);
  if(!fresh(b)) return;
  BENCH = {cls: b.cls || '', base: b.p === X.patch ? (b.base || '') : '', ilvl: b.ilvl || 0, picks: b.picks || []};
  await ready(BENCH);
  const r = b.front ? get(KEY + '.' + b.front) : null;
  if(!fresh(r) || !cls(r.cls)) return;
  let d;
  try { d = await classData(r.cls); } catch { return; }
  if(!baseOf(d, r.base)) return;
  let made = null;
  if(r.p === X.patch){ try { made = rebuild(d, r); } catch { made = null; } }
  if(!made){
    BENCH.say = r.p === X.patch
      ? 'The craft you left could not be rebuilt from the data as it stands, so the bench kept the plan.'
      : 'The game is on patch ' + X.patch + ' now — the bench kept the plan and dropped the item.';
    return;
  }
  const run = newRun(r.plan || BENCH, made.it);
  run.id = b.front;
  run.seed = r.seed >>> 0;
  run.at = r.at || 0;
  run.used = r.used || {};
  run.sel = r.sel || '';
  run.armed = new Set(r.armed || []);
  run.log = r.log || [];
  run.undo = [];
  for(const u of r.undo || []){
    let back = null;
    try { back = rebuild(d, u.it); } catch { back = null; }
    if(back) run.undo.push({it: back.it, at: u.at, log: u.log, used: u.used, armed: u.armed});
  }
  run.say = made.gone ? made.gone + ' modifier' + (made.gone === 1 ? '' : 's') +
    ' the data no longer holds went; the rest came back.' : '';
  stream(run);
  RUNS.set(run.id, run);
  FRONT = run.id;
}
