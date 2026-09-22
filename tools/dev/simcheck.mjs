/* Does the crafting bench roll what the data says it should?

     node tools/dev/simcheck.mjs                  the three item classes below, 250,000 rolls each
     node tools/dev/simcheck.mjs --rolls 100000   fewer rolls
     node tools/dev/simcheck.mjs --seed 7         another run of the same numbers
     node tools/dev/simcheck.mjs --quiet          the per-modifier tables left out, the verdicts kept
     node tools/dev/simcheck.mjs --craft          one craft printed as well, step by step

   Two parts, one line each at the end, non-zero exit on any FAIL:
     shares  one table per class: what share of rolls each modifier should take, what share it took, and how
             far off that is. Measured classes roll on the weights; a class nobody has measured rolls evenly
             and says so on the card (docs/craft-sim.md, "Weights we do not have").
     guards  the things a roll must never do: fill a side past its cap, reach a modifier above the item level,
             put the same modifier on twice, make up a number where we have none, or let an omen the game has
             taken out of circulation still craft.

   The engine below is the reference the shipped one is ported from: same rules, same order, no DOM and no
   fetch. It reads the committed data (data/craft.json and data/craft/<class>.json, both built by
   tools/craft.py) and nothing else, and it writes nothing. The random numbers come from a seeded generator so
   two runs of the same seed print the same table.

   The expected shares in the table below belong to this check and to nothing else. The bench prints a
   modifier's weight and its share of its own side on the bench card, the way the Craft tab already does, and
   no share at all for an even pool or on the running card. It never prints a chance per hit, a "1 in N" or a
   cost — docs/craft-sim.md says so at the top and this file does not change that. */
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const val = (flag, dflt) => { const i = argv.indexOf(flag); return i < 0 ? dflt : Number(argv[i + 1]); };
const ROLLS = Math.max(1000, val('--rolls', 250000));
const SEED = val('--seed', 20260922);
const QUIET = argv.includes('--quiet');

/* the three the shares table is printed for: two classes with measured weights, one without */
const CASES = [
  {cls: 'quiver', base: 'Primed Quiver', ilvl: 81},
  {cls: 'belt', base: 'Rawhide Belt', ilvl: 81},
  {cls: 'jewel', base: 'Ruby', ilvl: 81},
];

/* ==================================================================== the engine
   Everything from here to "the checks" is the model: the item, the pool it can still roll from, the pick, and
   one function per currency. Nothing in it prints. */

/* ---------- random ---------- */
// mulberry32: small, seeded, and the same everywhere. The shipped bench seeds it from the run id.
function rng(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const oneOf = (list, rnd) => list[Math.floor(rnd() * list.length)];

/* ---------- the data ---------- */
const readJSON = async p => JSON.parse(await readFile(join(ROOT, p), 'utf8'));
const CRAFT = await readJSON('data/craft.json');
const CLASSES = Object.fromEntries(CRAFT.classes.map(c => [c.id, c]));
const FILES = {};
async function classData(id){
  if(!FILES[id]){
    const d = await readJSON('data/craft/' + id + '.json');
    d.id = id;
    for(const p of d.pools) p.wat = p.w ? new Map(p.m.map((i, k) => [i, p.w[k]])) : null;
    FILES[id] = d;
  }
  return FILES[id];
}

/* ---------- the item ---------- */
// "+1 Prefix Modifier allowed" on a base moves its cap. The game writes it on the item; we read it there.
const CAP_LINE = /^([+-]\d+) (Prefix|Suffix) Modifiers? allowed$/;
function capsOf(cl, base, rarity){
  const one = rarity === 'magic' ? 1 : rarity === 'rare' ? cl.mx[0] : 0;
  const caps = [one, rarity === 'magic' ? 1 : rarity === 'rare' ? cl.mx[1] : 0];
  for(const ln of base.im || []){
    const m = CAP_LINE.exec(ln);
    if(m) caps[m[2] === 'Prefix' ? 0 : 1] = Math.max(0, caps[m[2] === 'Prefix' ? 0 : 1] + Number(m[1]));
  }
  return caps;
}

function newItem(d, baseName, ilvl, rarity = 'normal'){
  const cl = CLASSES[d.id], base = d.bases.find(b => b.n === baseName);
  if(!cl) throw new Error('no such kind of item: ' + d.id);
  if(!base) throw new Error('no such base: ' + baseName + ' (' + d.id + ')');
  return {d, cl, base, pool: d.pools[base.p], ilvl, rarity, corrupt: false,
    mods: [], imp: (base.im || []).slice(), sockets: [], caps: {}};
}
// a copy deep enough that a step on it cannot reach back into the original
const clone = it => ({...it, mods: it.mods.map(m => ({...m, vals: m.vals.slice()})), imp: it.imp.slice(),
  sockets: it.sockets.slice(), caps: {}});

const fam = (d, i) => d.fam[d.mods[i][1]];
const side = (d, i) => fam(d, i)[0];                                  // 'p' or 's'
const famOf = (d, i) => d.mods[i][1];
const tagsOf = (d, i) => fam(d, i)[2];
const groupsOf = (d, i) => fam(d, i)[3];
const lvlOf = (d, i) => d.mods[i][2];
const countSide = (it, a) => it.mods.filter(m => side(it.d, m.i) === a).length;
// the caps of this base at this rarity, worked out once: the implicit that moves them cannot change
const capFor = (it, a) => (it.caps[it.rarity] || (it.caps[it.rarity] = capsOf(it.cl, it.base, it.rarity)))[a === 'p' ? 0 : 1];
const heldGroups = it => new Set(it.mods.flatMap(m => groupsOf(it.d, m.i)));
const heldFams = it => new Set(it.mods.map(m => famOf(it.d, m.i)));
const heldTags = it => new Set(it.mods.flatMap(m => tagsOf(it.d, m.i)));
const sideWord = a => a === 'p' ? 'Prefixes' : 'Suffixes';

/* ---------- what the pool can be rolled with ----------
   'measured': every modifier this base can roll has a number from the weights source, so the pick runs on
   them. 'even': it does not, so every modifier is as likely as every other and the card says so. A pool part
   measured is still 'even': mixing a measured weight with a made-up one for the rest would be a number we do
   not have. docs/craft-sim.md, "Measured, or even". */
const EVEN_NOTE = 'No measured weights for this kind of item — every modifier rolls evenly here, so it will not match the game exactly.';
function poolKind(pool){
  if(!pool.w) return 'even';
  return pool.m.some((i, k) => !pool.w[k]) ? 'even' : 'measured';
}
function poolNote(pool){
  if(poolKind(pool) === 'measured') return '';
  if(!pool.w) return EVEN_NOTE;
  const n = pool.m.filter((i, k) => !pool.w[k]).length;
  return n + ' of this base’s ' + pool.m.length + ' modifiers have no measured weight — it rolls them all evenly, so it will not match the game exactly.';
}
/* What the bench is allowed to print beside a modifier row. An even pool prints nothing on any row, measured
   or not: a share taken from the weights would not be this bench's own odds. The running card passes
   `running` and gets nothing either way — no chance is ever reported per hit. */
function shareOf(cand, i, running){
  if(running || cand.kind !== 'measured') return '';
  const e = cand.list.find(x => x.i === i);
  if(!e || !cand.total) return '';
  const v = e.w / cand.total * 100;
  return v >= 10 ? Math.round(v) + '%' : v >= 1 ? v.toFixed(1) + '%' : v < 0.01 ? '<0.01%' : v.toFixed(2) + '%';
}

/* ---------- the pick ----------
   opt.only   'p' or 's': an omen that steers the side
   opt.min    the lowest modifier level the orb will take (a Greater or Perfect orb)
   opt.fam    only these families (an essence)
   opt.tag    only modifiers carrying this tag (a Homogenising omen, decision 5)
   The pool is both sides at once unless something steers it: the side a roll lands on is the side of the
   modifier that came up, not a coin toss before it. */
function candidates(it, opt = {}){
  const d = it.d, gs = heldGroups(it), fs = heldFams(it), out = [];
  const kind = poolKind(it.pool);
  // worked out once, not once per candidate: whether each side has room left
  const room = {p: countSide(it, 'p') < capFor(it, 'p'), s: countSide(it, 's') < capFor(it, 's')};
  let total = 0;
  for(const i of it.pool.m){
    const f = d.fam[d.mods[i][1]], a = f[0];
    if(opt.only && a !== opt.only) continue;
    if(!room[a]) continue;
    const lv = d.mods[i][2];
    if(lv > it.ilvl) continue;
    if(opt.min && lv < opt.min) continue;
    if(opt.fam && !opt.fam.has(d.mods[i][1])) continue;
    if(opt.tag && !f[2].includes(opt.tag)) continue;
    if(fs.has(d.mods[i][1])) continue;
    if(f[3].some(g => gs.has(g))) continue;
    const w = kind === 'measured' ? it.pool.wat.get(i) : 1;
    if(!w) continue;
    out.push({i, w});
    total += w;
  }
  return {list: out, total, kind, note: poolNote(it.pool)};
}

/* One draw from a candidate set: a float in [0, total), then walk. The float matters — an integer draw in
   1..total-1 can never reach the last weight point of the pool, so a last entry of weight 1 would be
   unreachable. docs/craft-sim.md, "Not taken". */
function draw(cand, rnd){
  if(!cand.list.length) return null;
  let x = rnd() * cand.total;
  for(const e of cand.list){ x -= e.w; if(x < 0) return e.i; }
  return cand.list[cand.list.length - 1].i;      // the last sliver of floating point
}
function pickOne(it, opt, rnd){
  const c = candidates(it, opt);
  const i = draw(c, rnd);
  if(i === null) return {ok: false, why: whyEmpty(it, opt)};
  return {ok: true, i, kind: c.kind};
}
/* A refusal has to say which wall it hit, because "nothing left" reads the same for a full item and for an
   orb whose floor is above anything the item level can reach. */
function whyEmpty(it, opt = {}){
  const a = opt.only;
  if(a && countSide(it, a) >= capFor(it, a)) return sideWord(a) + ' are full';
  if(!a && countSide(it, 'p') >= capFor(it, 'p') && countSide(it, 's') >= capFor(it, 's'))
    return 'It is full — ' + countSide(it, 'p') + ' prefixes and ' + countSide(it, 's') + ' suffixes';
  if(opt.min && opt.min > it.ilvl) return 'This orb only adds modifiers of level ' + opt.min + ' and up, and item level ' + it.ilvl + ' cannot reach them';
  if(opt.min) return 'Nothing of level ' + opt.min + ' or higher is left for it to add';
  if(opt.tag) return 'Nothing of that type is left for it to add';
  return 'Nothing left it can roll here';
}

/* ---------- the numbers on a modifier ----------
   The game writes the range into the line: "+(5-8) to Strength". Every number in the line rolls on its own,
   evenly, in the steps the range is written in (tenths where the range is written in tenths). "Reduced"
   modifiers are written best first ("(15-10)% reduced"), so the ends are sorted before rolling. */
const RANGE = /\((-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)\)/g;
function rollRanges(lines, rnd){
  const out = [];
  for(const ln of lines){
    for(const m of ln.matchAll(RANGE)){
      const a = Number(m[1]), b = Number(m[2]), lo = Math.min(a, b), hi = Math.max(a, b);
      const dec = Math.max((m[1].split('.')[1] || '').length, (m[2].split('.')[1] || '').length);
      const step = Math.pow(10, -dec), steps = Math.round((hi - lo) / step);
      out.push(Number((lo + Math.floor(rnd() * (steps + 1)) * step).toFixed(dec)));
    }
  }
  return out;
}
const rollValues = (d, i, rnd) => rollRanges(d.mods[i][3], rnd);
// the line as the item shows it, with the rolled numbers in place of the range
function withValues(lines, vals){
  let k = 0;
  return lines.map(ln => ln.replace(RANGE, () => String(vals[k++])));
}
const modLines = (d, i, vals) => withValues(d.mods[i][3], vals);

/* ---------- one step ----------
   Every currency answers the same shape: {ok, what, added, removed, note} or {ok: false, why}. The bench shows
   `what` as the line in the step history, and `why` where a step will not run. A step never half-runs. */
function accepts(it, want, name){
  if(it.corrupt) return 'A corrupted item cannot be changed';
  if(want.includes(it.rarity)) return '';
  if(want.includes('rare') && !it.cl.rare) return 'A ' + it.cl.n + ' cannot be Rare';
  return name + ' needs ' + want.map(r => r[0].toUpperCase() + r.slice(1)).join(' or ') + ', this is ' + it.rarity;
}
function addMod(it, i, rnd, src = 'p'){
  const vals = rollValues(it.d, i, rnd);
  const e = {i, src, vals, lines: modLines(it.d, i, vals), frac: false};
  it.mods.push(e);
  return e;
}
function addRandom(it, rnd, opt = {}){
  const o = {...opt};
  if(o.homog){                                    // decision 5: one tag off the item, evenly, then roll inside it
    const tags = [...heldTags(it)];
    if(!tags.length) return {ok: false, why: 'Nothing on it yet to match the type of'};
    o.tag = oneOf(tags, rnd);
  }
  const p = pickOne(it, o, rnd);
  if(!p.ok) return p;
  return {ok: true, mod: addMod(it, p.i, rnd), kind: p.kind, tag: o.tag};
}

/* Decision 1: a removal is an even draw among the item's explicit modifiers that are not fractured and are on
   the side an omen allows. Implicits are never eligible, by any currency. */
function removable(it, opt = {}){
  return it.mods.filter(m => !m.frac &&
    (!opt.removeOnly || side(it.d, m.i) === opt.removeOnly) &&
    (!opt.desecrated || m.src === 'd'));
}
function removeRandom(it, rnd, opt = {}){
  const live = removable(it, opt);
  if(!live.length) return {ok: false, why: opt.desecrated ? 'It has no Desecrated modifier to remove'
    : opt.removeOnly ? 'It has no ' + (opt.removeOnly === 'p' ? 'prefix' : 'suffix') + ' that can be removed'
    : 'Nothing on it can be removed'};
  let gone, note = '';
  if(opt.whittle){                                // decision 7: the modifier's own level, ties drawn evenly
    const low = Math.min(...live.map(m => lvlOf(it.d, m.i)));
    const tied = live.filter(m => lvlOf(it.d, m.i) === low);
    gone = oneOf(tied, rnd);
    note = tied.length > 1
      ? tied.length + ' modifiers tied at level ' + low + '. The game does not say which of a tie goes, so the bench took one evenly.'
      : 'the lowest on it, level ' + low;
  } else gone = oneOf(live, rnd);
  it.mods.splice(it.mods.indexOf(gone), 1);
  return {ok: true, mod: gone, note};
}

const STEP = {
  transmute(it, rnd, o = {}){
    const no = accepts(it, ['normal'], 'An Orb of Transmutation');
    if(no) return {ok: false, why: no};
    it.rarity = 'magic';
    const r = addRandom(it, rnd, o);
    if(!r.ok){ it.rarity = 'normal'; return r; }
    return {ok: true, what: 'Magic, 1 modifier', added: [r.mod], removed: []};
  },
  augment(it, rnd, o = {}){
    const no = accepts(it, ['magic'], 'An Orb of Augmentation');
    if(no) return {ok: false, why: no};
    const r = addRandom(it, rnd, o);
    return r.ok ? {ok: true, what: 'A second modifier', added: [r.mod], removed: []} : r;
  },
  regal(it, rnd, o = {}){
    const no = accepts(it, ['magic'], 'A Regal Orb');
    if(no) return {ok: false, why: no};
    it.rarity = 'rare';
    const r = addRandom(it, rnd, o);
    if(!r.ok){ it.rarity = 'magic'; return r; }
    return {ok: true, what: 'Rare, 1 modifier added', added: [r.mod], removed: []};
  },
  // "Upgrades a Normal or Magic item to a Rare item with 4 random modifiers": it ends holding four.
  alchemy(it, rnd, o = {}){
    const no = accepts(it, ['normal', 'magic'], 'An Orb of Alchemy');
    if(no) return {ok: false, why: no};
    const was = it.rarity;
    it.rarity = 'rare';
    const added = [];
    while(it.mods.length < 4){
      const r = addRandom(it, rnd, o);
      if(!r.ok) break;
      added.push(r.mod);
    }
    if(!added.length){ it.rarity = was; return {ok: false, why: whyEmpty(it, o)}; }
    return {ok: true, what: 'Rare, ' + it.mods.length + ' modifiers', added, removed: []};
  },
  // decision 8: Greater Exaltation is two ordinary picks, the list rebuilt between them, no side reserved
  exalt(it, rnd, o = {}){
    const no = accepts(it, ['rare'], 'An Exalted Orb');
    if(no) return {ok: false, why: no};
    const added = [];
    for(let n = 0; n < (o.twice ? 2 : 1); n++){
      const r = addRandom(it, rnd, o);
      if(!r.ok) return added.length
        ? {ok: true, what: '1 modifier added — only one could go on', added, removed: []}
        : r;
      added.push(r.mod);
    }
    return {ok: true, what: added.length + ' modifier' + (added.length > 1 ? 's' : '') + ' added', added, removed: []};
  },
  chaos(it, rnd, o = {}){
    const no = accepts(it, ['rare'], 'A Chaos Orb');
    if(no) return {ok: false, why: no};
    const gone = removeRandom(it, rnd, o);
    if(!gone.ok) return gone;
    const r = addRandom(it, rnd, {min: o.min});
    if(!r.ok){ it.mods.push(gone.mod); return r; }     // it could not finish, so it did not start
    return {ok: true, what: '1 swapped', removed: [gone.mod], added: [r.mod], note: gone.note};
  },
  annul(it, rnd, o = {}){
    const no = accepts(it, ['magic', 'rare'], 'An Orb of Annulment');
    if(no) return {ok: false, why: no};
    const gone = removeRandom(it, rnd, o);
    return gone.ok ? {ok: true, what: '1 removed', removed: [gone.mod], added: [], note: gone.note} : gone;
  },
  fracture(it, rnd, o = {}){
    const no = accepts(it, ['rare'], 'A Fracturing Orb');
    if(no) return {ok: false, why: no};
    if(it.mods.length < 4) return {ok: false, why: 'A Fracturing Orb needs a Rare item with at least 4 modifiers, this has ' + it.mods.length};
    const live = removable(it, o);
    if(!live.length) return {ok: false, why: 'Nothing on it left to fracture'};
    const m = oneOf(live, rnd);
    m.frac = true;
    return {ok: true, what: 'fractured', added: [], removed: [], note: m.lines.join(' / ')};
  },
  // Omen of the Blessed narrows this to the implicits; a plain Divine Orb reaches every number on the item
  divine(it, rnd, o = {}){
    if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
    const impRanges = it.base.im ? rollRanges(it.base.im, () => 0).length : 0;
    if(o.implicitsOnly){
      if(!impRanges) return {ok: false, why: 'This base has no implicit number to reroll'};
      it.imp = withValues(it.base.im, rollRanges(it.base.im, rnd));
      return {ok: true, what: 'implicits rerolled', added: [], removed: []};
    }
    if(!it.mods.length && !impRanges) return {ok: false, why: 'Nothing on it to reroll'};
    if(impRanges) it.imp = withValues(it.base.im, rollRanges(it.base.im, rnd));
    for(const m of it.mods){
      m.vals = rollValues(it.d, m.i, rnd);
      m.lines = modLines(it.d, m.i, m.vals);
    }
    return {ok: true, what: it.mods.length + ' rerolled', added: [], removed: []};
  },
  socket(it){
    if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
    if(!it.cl.so) return {ok: false, why: "An Artificer's Orb does nothing to a " + it.cl.n};
    if(it.sockets.length >= it.cl.so) return {ok: false, why: 'It already has every socket it can take'};
    it.sockets.push(null);
    return {ok: true, what: 'a socket added', added: [], removed: []};
  },
  /* Two shapes, both the game's own (0.3.0). Lesser, Normal and Greater essences upgrade a Magic item to Rare
     with a guaranteed modifier; Perfect and Corrupted essences remove a random modifier and add a guaranteed
     one to a Rare. Decision 2: all three ways it can fail are worked out before the item is touched. */
  essence(it, rnd, o = {}){
    const e = it.d.ess.find(x => x[0] === o.name);
    if(!e) return {ok: false, why: 'That essence does nothing to this kind of item'};
    const no = accepts(it, e[1] === 'm' ? ['magic'] : ['rare'], 'That essence');
    if(no) return {ok: false, why: no};
    const i = e[2], a = side(it.d, i);
    if(heldFams(it).has(famOf(it.d, i)) || groupsOf(it.d, i).some(g => heldGroups(it).has(g)))
      return {ok: false, why: 'It already has the modifier this essence adds'};
    if(e[1] === 'm'){
      const was = it.rarity;
      it.rarity = 'rare';                                    // the caps move with the rarity
      if(countSide(it, a) >= capFor(it, a)){ it.rarity = was; return {ok: false, why: sideWord(a) + ' are full'}; }
      return {ok: true, what: 'Rare, ' + e[0], added: [addMod(it, i, rnd, 'e')], removed: []};
    }
    const live = removable(it, o);
    if(!live.length) return {ok: false, why: o.removeOnly
      ? 'It has no ' + (o.removeOnly === 'p' ? 'prefix' : 'suffix') + ' for the essence to remove'
      : 'Nothing on it can be removed'};
    const gone = oneOf(live, rnd);
    // decision 2: if the essence's side would still be full after that removal, refuse and change nothing
    if(countSide(it, a) - (side(it.d, gone.i) === a ? 1 : 0) >= capFor(it, a))
      return {ok: false, why: sideWord(a) + ' are full — the essence has nowhere to put its modifier'};
    it.mods.splice(it.mods.indexOf(gone), 1);
    return {ok: true, what: e[0], added: [addMod(it, i, rnd, 'e')], removed: [gone]};
  },
};

/* ---------- the omens ----------
   An omen is not a step: it is a rider on the next use of one currency, so all it does is set options on that
   currency's step. docs/craft-sim.md, "The omens". Every omen in data/craft.json must be in exactly one of the
   four groups below — a guard checks that, so an omen the game adds cannot be quietly ignored. */
const OMEN = {
  'Omen of Sinistral Exaltation':      {orb: 'Exalted Orb', opt: {only: 'p'}},
  'Omen of Dextral Exaltation':        {orb: 'Exalted Orb', opt: {only: 's'}},
  'Omen of Greater Exaltation':        {orb: 'Exalted Orb', opt: {twice: true}},
  'Omen of Homogenising Exaltation':   {orb: 'Exalted Orb', opt: {homog: true}},
  'Omen of Homogenising Coronation':   {orb: 'Regal Orb', opt: {homog: true}},
  'Omen of Sinistral Erasure':         {orb: 'Chaos Orb', opt: {removeOnly: 'p'}},
  'Omen of Dextral Erasure':           {orb: 'Chaos Orb', opt: {removeOnly: 's'}},
  'Omen of Whittling':                 {orb: 'Chaos Orb', opt: {whittle: true}},
  'Omen of Sinistral Annulment':       {orb: 'Orb of Annulment', opt: {removeOnly: 'p'}},
  'Omen of Dextral Annulment':         {orb: 'Orb of Annulment', opt: {removeOnly: 's'}},
  'Omen of Light':                     {orb: 'Orb of Annulment', opt: {desecrated: true}},
  'Omen of the Blessed':               {orb: 'Divine Orb', opt: {implicitsOnly: true}},
  'Omen of Sinistral Crystallisation': {orb: 'Essence', opt: {removeOnly: 'p'}},
  'Omen of Dextral Crystallisation':   {orb: 'Essence', opt: {removeOnly: 's'}},
};
/* ---------- the eleven decisions ----------
   Eleven things the bench has to do that no source we trust states. Each is a decision, not a fact: `what` the
   bench does, `why`, and `says` — the words the player sees, which are the only place a decision is allowed to
   live on screen. docs/craft-sim.md, "The eleven decisions", has the long form of each. Keeping them in one
   table means none can be changed by accident and a guard can check they are all still here. */
const DECISION = {
  1: {what: 'A removal is an even draw among the explicit modifiers that can go; implicits are never eligible',
      why: 'Even is the only draw that adds no number, and implicits are not affixes — the caps do not count them and no currency names them',
      says: 'Which modifier a removal takes is not published. The bench draws evenly from the ones it could take. Implicits are never touched.'},
  2: {what: 'An essence refuses rather than half-run: on a duplicate modifier, or when the side it needs is full after the removal',
      why: 'An essence names one modifier and has no second choice; any fallback would be a different game',
      says: 'An essence adds one exact modifier. If the item already has it, or the side it needs is full, the bench stops rather than guess — the game has not said what it does instead.'},
  3: {what: 'Item level does not gate an essence tier',
      why: 'Nothing official ties a tier to an item level, and an essence names one modifier, so there is no pool to narrow',
      says: 'Whether the game needs a minimum item level for this essence tier is not published. The bench lets it run at any item level. This is the one place it may be more generous than the game.'},
  4: {what: 'The bench does not simulate corrupting an essence; corrupted essences are offered as inputs',
      why: 'Both halves of it are unpublished numbers — which tier goes in, and with what odds',
      says: 'How a corrupted essence is made, and how often, is not published. Pick one here and the bench will run its craft; it does not roll the corruption that makes one.'},
  5: {what: '"Same type" is the modifier’s tag; one tag is taken evenly from the item, then the draw runs inside it',
      why: 'The tag set is the only "type" a modifier and an existing modifier can share that the game files carry, and the catalysts use the same word for the same field',
      says: '"Same type" is not defined in the game’s words. The bench reads it as the modifier’s tag — the same tags the catalysts name — takes one evenly from the tags already on the item, then rolls inside it. If the game instead favours a tag the item has more of, this will not match.'},
  6: {what: 'Omen of Catalysing Exaltation refuses',
      why: 'The omen is entirely a multiplier, and PoE2 has never published one — the only figures are from PoE1',
      says: 'How much catalyst quality moves the odds is not published for PoE2 — the only figures are from PoE1, so the bench will not use it'},
  7: {what: 'Whittling compares the modifier’s own level, and draws evenly among a tie',
      why: 'Modifier level is the only per-modifier level the data has and the one the orb floors count in; a fixed tie-break would be a claim about the game',
      says: 'The game says "the lowest level modifier" and does not say what happens when two are equally low. The bench takes one of the tied evenly, and the step line says how many tied.'},
  8: {what: 'Greater Exaltation is two ordinary picks, no side reserved; one goes on if only one can',
      why: '"Two random modifiers" is two of what a plain Exalted Orb does — reserving a side would be a rule the game did not write',
      says: 'The game does not say whether the two land on any particular side. The bench draws twice by the same rule as one Exalted Orb. Where only one can go on, it adds one and says so.'},
  9: {what: 'Omen of Sanctification refuses',
      why: '0.5.0 replaced randomised values with a multiplier and did not publish it; the figure still in circulation describes the behaviour it replaced',
      says: 'Patch 0.5.0 changed Sanctify to multiply each value by its current value and did not publish the multiplier; the 78–122% still printed elsewhere is the behaviour it replaced'},
  10: {what: 'Omen of Putrefaction refuses, and the card shows both lines',
       why: 'The omen’s own line and the 0.5.0 Desecrated cap are both current and cannot both be right as written',
       says: 'The omen says "up to 6 Unrevealed modifiers" and patch 0.5.0 says an item is limited to 1 Desecrated modifier — both are current and they disagree'},
  11: {what: 'An omen is legal exactly where its currency is, and is not consumed when it does not trigger',
       why: 'Every omen is written as a rider on one currency, so its legality is that currency’s — one rule instead of twenty-nine, and no omen can unlock a corrupted item',
       says: 'An omen only changes the next use of its own currency. Where that currency will not run — a corrupted item, the wrong rarity — the omen does not trigger and is not used up.'},
};

/* The three whose whole effect is a number nobody has published. Decisions 6, 9 and 10. */
const NO_ROLL = {
  'Omen of Catalysing Exaltation': DECISION[6].says,
  'Omen of Sanctification': DECISION[9].says,
  'Omen of Putrefaction': DECISION[10].says,
};
/* Taken out of the game, in the patch that took them. Still in the game data, so still on the site's cards. */
const LEGACY = {
  'Omen of Greater Annulment': '0.3.0', 'Omen of Dextral Alchemy': '0.3.0', 'Omen of Sinistral Alchemy': '0.3.0',
  'Omen of Dextral Coronation': '0.3.0', 'Omen of Sinistral Coronation': '0.3.0', 'Omen of Corruption': '0.5.0',
};
/* These narrow a choice the player makes at the reveal, not a draw the bench makes, so they set no option. */
const DESECRATE_OMEN = new Set(['Omen of Abyssal Echoes', 'Omen of Dextral Necromancy', 'Omen of Sinistral Necromancy',
  'Omen of the Blackblooded', 'Omen of the Liege', 'Omen of the Sovereign']);

/* Decision 11: an omen is legal exactly where its currency is, and nowhere else. It never grants a permission.
   Returns the options to hand the step, or the refusal that stops it before the currency is even tried. */
function omenOpts(names){
  const opt = {};
  for(const n of names){
    if(LEGACY[n]) return {ok: false, why: n + ' was removed in ' + LEGACY[n] + ' — it can no longer be obtained, so the bench does not craft with it'};
    if(NO_ROLL[n]) return {ok: false, why: NO_ROLL[n]};
    if(DESECRATE_OMEN.has(n)) return {ok: false, why: n + ' changes what a desecration offers, and the reveal is a choice, not a roll'};
    if(!OMEN[n]) return {ok: false, why: 'No such omen: ' + n};
    Object.assign(opt, OMEN[n].opt);
  }
  return {ok: true, opt};
}

/* ---------- the steps that will not roll ----------
   The game gives no list of what a Vaal Orb can do with what chance, and no source measures how often each
   Desecrated modifier is offered, so neither is rolled: the bench shows the choice and the player takes one.
   docs/craft-sim.md, "Steps that will not roll". */
const WONT_ROLL = {
  vaal: 'What a Vaal Orb does is not a number anyone publishes — pick the outcome to practise',
  desecrate: 'How often each Desecrated modifier is offered is not measured — pick from the ones the bench reveals',
};
STEP.vaal = () => ({ok: false, why: WONT_ROLL.vaal});
STEP.desecrate = () => ({ok: false, why: WONT_ROLL.desecrate});

/* ==================================================================== the checks */
const lines = [];
let failed = 0;
function say(name, ok, detail){
  if(!ok) failed++;
  lines.push((ok ? 'ok   ' : 'FAIL ') + (name + ' '.repeat(7)).slice(0, 7) + detail);
}
const pc = (x, n = 4) => (x * 100).toFixed(n) + '%';
const pad = (s, n) => (String(s) + ' '.repeat(n)).slice(0, n);
const rpad = (s, n) => (' '.repeat(n) + String(s)).slice(-n);

/* ---------- shares: does each modifier come up as often as its weight says ----------
   The item does not change between draws here, so the candidate list is built once and drawn from ROLLS
   times. That is the same draw() the bench runs; what candidates() leaves out is what the guards below prove. */
function tierLabel(d, pool, i){
  const tiers = pool.m.filter(j => d.mods[j][1] === d.mods[i][1]);
  return tiers.length < 2 ? '  ' : 'T' + (tiers.length - tiers.indexOf(i));
}
async function shares(c){
  const d = await classData(c.cls);
  const it = newItem(d, c.base, c.ilvl, 'rare');
  const cand = candidates(it);
  const rnd = rng(SEED + c.cls.length);
  const hits = new Map(cand.list.map(e => [e.i, 0]));
  for(let n = 0; n < ROLLS; n++){
    const i = draw(cand, rnd);
    hits.set(i, hits.get(i) + 1);
  }
  const rows = cand.list.map(e => {
    const exp = e.w / cand.total, got = hits.get(e.i) / ROLLS;
    const sd = Math.sqrt(exp * (1 - exp) / ROLLS);
    return {i: e.i, w: e.w, exp, got, z: sd ? (got - exp) / sd : 0};
  });
  const chi = rows.reduce((a, r) => a + Math.pow(r.got - r.exp, 2) / r.exp, 0) * ROLLS;
  const worst = rows.reduce((a, r) => Math.abs(r.z) > Math.abs(a.z) ? r : a, rows[0]);
  const cl = CLASSES[c.cls];
  const out = [cl.n + ' · ' + c.base + ' · item level ' + c.ilvl + ' · ' + cand.list.length + ' modifiers · ' +
    ROLLS.toLocaleString('en-US') + ' rolls · ' + (cand.kind === 'measured' ? 'on measured weights' : 'rolled evenly')];
  if(cand.note) out.push('  ' + cand.note);
  if(!QUIET){
    out.push('  ' + pad('modifier', 44) + ' tier  lvl ' + rpad('weight', 7) + rpad('share', 8) +
      rpad('expected', 10) + rpad('rolled', 10) + rpad('off by', 10) + rpad('z', 7));
    for(const r of rows.slice().sort((a, b) => b.exp - a.exp || a.i - b.i)){
      const f = fam(d, r.i);
      out.push('  ' + (f[0] === 'p' ? 'P ' : 'S ') + pad(f[1].join(' / '), 42) + ' ' + tierLabel(d, it.pool, r.i) +
        rpad(lvlOf(d, r.i), 6) + rpad(cand.kind === 'measured' ? r.w : 'even', 7) +
        rpad(shareOf(cand, r.i) || '—', 8) +
        rpad(pc(r.exp), 10) + rpad(pc(r.got), 10) + rpad(((r.got - r.exp) * 100).toFixed(4) + 'pp', 10) + rpad(r.z.toFixed(2), 7));
    }
  }
  // five standard deviations on any one modifier, and the same on the pool as a whole (chi-square over its
  // degrees of freedom sits at 1 when the rolls match the weights, and strays by root two over the degrees)
  const df = rows.length - 1;
  const ok = Math.abs(worst.z) < 5 && chi / df < 1 + 5 * Math.sqrt(2 / df);
  out.push('  worst ' + fam(d, worst.i)[1].join(' / ').slice(0, 40) + ': expected ' + pc(worst.exp) +
    ', rolled ' + pc(worst.got) + ', z ' + worst.z.toFixed(2) + ' · chi-square / degrees of freedom ' + (chi / df).toFixed(3) +
    ' · share column: ' + (cand.kind === 'measured' ? 'printed' : 'empty on every row, this pool is even'));
  return {ok, out, kind: cand.kind, worst: Math.abs(worst.z)};
}

/* ---------- guards: the things a roll must never do ---------- */
async function guards(){
  const out = [];
  let bad = 0;
  const fail = (what, why) => { bad++; out.push('  FAIL ' + pad(what, 14) + ' ' + why); };
  const pass = (what, detail) => out.push('  ok   ' + pad(what, 14) + ' ' + detail);
  const n = x => x.toLocaleString('en-US');

  /* 1. a full side never gains another modifier, and a full item refuses instead of doing nothing quietly */
  {
    const d = await classData('ring'), rnd = rng(SEED + 1);
    const base = newItem(d, 'Sapphire Ring', 81, 'rare');
    while(countSide(base, 'p') < capFor(base, 'p')) if(!STEP.exalt(base, rnd, {only: 'p'}).ok) break;
    const prefixes = countSide(base, 'p');
    let wrong = 0, refused = 0;
    for(let k = 0; k < 20000; k++){
      const t = clone(base);
      const r = STEP.exalt(t, rnd);
      if(!r.ok){ refused++; continue; }
      if(r.added.some(m => side(d, m.i) === 'p')) wrong++;
    }
    if(wrong) fail('full side', wrong + ' of 20,000 Exalted Orbs added a prefix to a full prefix side');
    else if(refused) fail('full side', refused + ' of 20,000 refused although a suffix was free');
    else pass('full side', prefixes + ' prefixes held, 20,000 Exalted Orbs, every one landed on a suffix');

    const full = clone(base), rnd2 = rng(SEED + 2);
    while(countSide(full, 's') < capFor(full, 's')) if(!STEP.exalt(full, rnd2, {only: 's'}).ok) break;
    const r = STEP.exalt(full, rnd2), one = STEP.exalt(full, rnd2, {only: 'p'});
    if(r.ok || one.ok) fail('full item', 'an Exalted Orb still added a modifier to a full item');
    else pass('full item', countSide(full, 'p') + ' prefixes, ' + countSide(full, 's') + ' suffixes · "' + r.why + '" · "' + one.why + '"');
  }

  /* 2. nothing above the item level is ever reached, and an orb whose floor is out of reach refuses */
  {
    const d = await classData('gloves'), rnd = rng(SEED + 3);
    const ilvl = 30, it = newItem(d, 'Bolstered Mitts', ilvl, 'rare');
    const over = it.pool.m.filter(i => lvlOf(d, i) > ilvl).length;
    let worst = 0;
    for(let k = 0; k < 100000; k++){
      const p = pickOne(it, {}, rnd);
      worst = Math.max(worst, lvlOf(d, p.i));
    }
    if(worst > ilvl) fail('item level', 'a modifier of level ' + worst + ' came up at item level ' + ilvl);
    else pass('item level', over + ' of ' + it.pool.m.length + ' modifiers sit above item level ' + ilvl +
      ', 100,000 rolls, the highest that came up was level ' + worst);
    const r = STEP.exalt(newItem(d, 'Bolstered Mitts', 30, 'rare'), rnd, {min: 50});
    if(r.ok) fail('orb floor', 'a Perfect Exalted Orb rolled a modifier the item level cannot hold');
    else pass('orb floor', 'Perfect Exalted Orb on an item level 30 base: "' + r.why + '"');
  }

  /* 3. no modifier twice, and nothing of a group already on the item */
  {
    const d = await classData('body-armour'), rnd = rng(SEED + 4);
    let twice = 0, clash = 0, made = 0;
    for(let k = 0; k < 10000; k++){
      const it = newItem(d, 'Steel Plate', 81, 'normal');
      if(!STEP.alchemy(it, rnd).ok) continue;
      STEP.exalt(it, rnd); STEP.exalt(it, rnd);
      made++;
      const fams = it.mods.map(m => famOf(d, m.i)), gs = [];
      if(new Set(fams).size !== fams.length) twice++;
      for(const m of it.mods) for(const g of groupsOf(d, m.i)){ if(gs.includes(g)) clash++; gs.push(g); }
    }
    if(twice) fail('no repeats', twice + ' items came out with the same modifier twice');
    else if(clash) fail('no repeats', clash + ' items came out with two modifiers of one group');
    else pass('no repeats', n(made) + ' items rolled to 6 modifiers, none repeated a modifier or a group');
  }

  /* 4. a class with no weights takes the even path, is marked as such, and shows no share anywhere */
  {
    const ring = await classData('ring'), jewel = await classData('jewel'), armour = await classData('body-armour');
    const a = candidates(newItem(ring, 'Sapphire Ring', 81, 'rare'));
    const b = candidates(newItem(jewel, 'Ruby', 81, 'rare'));
    const c = candidates(newItem(armour, 'Grasping Mail', 81, 'rare'));
    const evenFlat = b.list.every(e => e.w === b.list[0].w);
    const noShare = [b, c].every(x => x.list.every(e => !shareOf(x, e.i)));
    const hasShare = a.list.every(e => !!shareOf(a, e.i));
    const runningQuiet = a.list.every(e => !shareOf(a, e.i, true));
    if(a.kind !== 'measured' || a.note) fail('even path', 'a measured class did not read as measured');
    else if(b.kind !== 'even' || !b.note || !evenFlat) fail('even path', 'a class with no weights did not roll evenly or did not say so');
    else if(c.kind !== 'even' || !c.note) fail('even path', 'a part-measured base did not read as even');
    else if(!noShare) fail('even path', 'an even pool printed a share');
    else if(!hasShare) fail('even path', 'a measured pool printed no share');
    else if(!runningQuiet) fail('even path', 'the running card printed a share');
    else {
      pass('even path', 'Ring: measured, shares printed, no line. Jewel: even, ' + b.list.length +
        ' modifiers all at weight 1, no share on any row.');
      out.push('                 Jewel says: "' + b.note + '"');
      out.push('                 Grasping Mail says: "' + c.note + '"');
      out.push('                 The running card prints no share in either case.');
    }
  }

  /* 5. where nobody has the odds, the step refuses instead of inventing them */
  {
    const d = await classData('ring'), rnd = rng(SEED + 5);
    const it = newItem(d, 'Sapphire Ring', 81, 'rare');
    const tried = [['Vaal Orb', STEP.vaal(it, rnd)], ['desecration', STEP.desecrate(it, rnd)],
      ...Object.keys(NO_ROLL).map(k => [k, omenOpts([k])])];
    const ran = tried.filter(([, r]) => r.ok);
    // and the eleven are all still here, each with what it does, why, and the words the player sees
    const want = Array.from({length: 11}, (_, k) => k + 1);
    const thin = want.filter(k => !DECISION[k] || !DECISION[k].what || !DECISION[k].why || !DECISION[k].says);
    const extra = Object.keys(DECISION).map(Number).filter(k => !want.includes(k));
    if(ran.length) fail('no guessing', ran.map(([k]) => k).join(', ') + ' rolled although no source has the number');
    else if(thin.length) fail('no guessing', 'decision ' + thin.join(', ') + ' is missing what/why/says');
    else if(extra.length) fail('no guessing', 'there are meant to be eleven decisions, found also: ' + extra.join(', '));
    else {
      pass('no guessing', tried.length + ' steps whose whole effect is an unpublished number, every one refused · ' +
        want.length + ' decisions, each with what it does, why, and the words the player sees');
      for(const [k, r] of tried) out.push('                 ' + pad(k, 31) + ' ' + r.why);
    }
  }

  /* 6. every omen in the game data is accounted for, and the ones the game removed cannot craft */
  {
    const all = CRAFT.omens.map(o => o.n);
    const loose = all.filter(x => !OMEN[x] && !NO_ROLL[x] && !LEGACY[x] && !DESECRATE_OMEN.has(x));
    const twice = all.filter(x => [OMEN[x], NO_ROLL[x], LEGACY[x], DESECRATE_OMEN.has(x) || undefined].filter(Boolean).length > 1);
    const stray = [...Object.keys(OMEN), ...Object.keys(NO_ROLL), ...Object.keys(LEGACY), ...DESECRATE_OMEN]
      .filter(x => !all.includes(x));
    const legacyRan = Object.keys(LEGACY).filter(k => omenOpts([k]).ok);
    if(loose.length) fail('every omen', loose.length + ' omens in the data are in no group: ' + loose.join(', '));
    else if(twice.length) fail('every omen', 'in two groups at once: ' + twice.join(', '));
    else if(stray.length) fail('every omen', 'named here but not in the game data: ' + stray.join(', '));
    else if(legacyRan.length) fail('every omen', 'a removed omen still crafts: ' + legacyRan.join(', '));
    else pass('every omen', all.length + ' omens in the data: ' + Object.keys(OMEN).length + ' run, ' +
      Object.keys(NO_ROLL).length + ' refuse for want of a number, ' + Object.keys(LEGACY).length +
      ' removed by the game, ' + DESECRATE_OMEN.size + ' narrow a choice · e.g. ' + omenOpts(['Omen of Corruption']).why);
  }

  /* 7. a currency the item state does not take is refused, in the game's own terms */
  {
    const ring = await classData('ring'), flask = await classData('life-flask'), rnd = rng(SEED + 6);
    const normal = newItem(ring, 'Sapphire Ring', 81, 'normal');
    const tried = [['Exalted Orb on a Normal item', STEP.exalt(normal, rnd)],
      ['Regal Orb on a Normal item', STEP.regal(normal, rnd)],
      ['Exalted Orb on a Life Flask', STEP.exalt(newItem(flask, 'Ultimate Life Flask', 81, 'magic'), rnd)],
      ['Fracturing Orb on a 0-modifier Rare', STEP.fracture(newItem(ring, 'Sapphire Ring', 81, 'rare'), rnd)]];
    const corrupted = newItem(ring, 'Sapphire Ring', 81, 'rare');
    corrupted.corrupt = true;
    tried.push(['Divine Orb on a corrupted item', STEP.divine(corrupted, rnd)]);
    const ran = tried.filter(([, r]) => r.ok);
    if(ran.length) fail('wrong state', ran.map(([k]) => k).join(', ') + ' ran on an item that cannot take it');
    else {
      pass('wrong state', tried.length + ' currencies on items that cannot take them, every one refused');
      for(const [k, r] of tried) out.push('                 ' + pad(k, 37) + ' ' + r.why);
    }
  }

  /* 8. every number lands inside the range the game prints for it, both ends included */
  {
    const d = await classData('boots'), rnd = rng(SEED + 7);
    const it = newItem(d, 'Sleek Boots', 81, 'rare');
    let outside = 0, checked = 0, low = 0, high = 0, sample = '';
    for(let k = 0; k < 50000; k++){
      const i = oneOf(it.pool.m, rnd);
      const vals = rollValues(d, i, rnd);
      let j = 0;
      for(const ln of d.mods[i][3]) for(const m of ln.matchAll(RANGE)){
        const lo = Math.min(Number(m[1]), Number(m[2])), hi = Math.max(Number(m[1]), Number(m[2])), v = vals[j++];
        checked++;
        if(v < lo || v > hi) outside++;
        if(v === lo) low++;
        if(v === hi) high++;
      }
      if(!sample && vals.length) sample = modLines(d, i, vals).join(' / ');
    }
    if(outside) fail('values', outside + ' of ' + checked + ' rolled numbers fell outside the printed range');
    else if(!low || !high) fail('values', 'the ends of the range never came up');
    else pass('values', n(checked) + ' numbers rolled, all inside their printed range, both ends reached · e.g. ' + sample);
  }

  /* 9. decision 2: the three ways an essence refuses, and the one way it runs on a part-filled Rare */
  {
    const d = await classData('ring'), rnd = rng(SEED + 9);
    const name = d.ess.find(e => e[1] === 'r')[0], e = d.ess.find(x => x[0] === name);
    const a = side(d, e[2]);
    // it runs on a Rare that is nowhere near full
    const thin = newItem(d, 'Sapphire Ring', 81, 'rare');
    STEP.exalt(thin, rnd); STEP.exalt(thin, rnd);
    const before = thin.mods.length;
    const ran = STEP.essence(thin, rnd, {name});
    // its own modifier already on the item
    const dupe = newItem(d, 'Sapphire Ring', 81, 'rare');
    addMod(dupe, e[2], rnd, 'p');
    STEP.exalt(dupe, rnd);
    const dup = STEP.essence(dupe, rnd, {name});
    // the side it needs is full and the omen sends the removal to the other side
    const wall = newItem(d, 'Sapphire Ring', 81, 'rare');
    const other = a === 'p' ? 's' : 'p';
    while(countSide(wall, a) < capFor(wall, a)) if(!STEP.exalt(wall, rnd, {only: a}).ok) break;
    while(countSide(wall, other) < capFor(wall, other)) if(!STEP.exalt(wall, rnd, {only: other}).ok) break;
    const held = wall.mods.length;
    const blocked = STEP.essence(wall, rnd, {name, removeOnly: other});
    if(!ran.ok) fail('essences', 'an essence refused a Rare with ' + before + ' modifiers: ' + ran.why);
    else if(ran.removed.length !== 1 || ran.added.length !== 1) fail('essences', 'the essence did not swap exactly one for one');
    else if(dup.ok) fail('essences', 'an essence ran although its own modifier was already on the item');
    else if(blocked.ok) fail('essences', 'an essence ran into a full side');
    else if(wall.mods.length !== held) fail('essences', 'a refused essence still changed the item');
    else pass('essences', 'on a Rare holding ' + before + ' modifiers: one out, the guaranteed one in · already there: "' + dup.why +
      '" · full side: "' + blocked.why + '", item untouched at ' + held + ' modifiers');
  }

  /* 10. decision 7: Whittling always takes a modifier at the lowest level on the item */
  {
    const d = await classData('ring'), rnd = rng(SEED + 10);
    let wrong = 0, ties = 0, runs = 0;
    for(let k = 0; k < 5000; k++){
      const it = newItem(d, 'Sapphire Ring', 81, 'normal');
      if(!STEP.alchemy(it, rnd).ok) continue;
      const low = Math.min(...it.mods.map(m => lvlOf(d, m.i)));
      const tied = it.mods.filter(m => lvlOf(d, m.i) === low).length;
      const r = STEP.chaos(it, rnd, {whittle: true});
      if(!r.ok) continue;
      runs++;
      if(tied > 1) ties++;
      if(lvlOf(d, r.removed[0].i) !== low) wrong++;
    }
    if(wrong) fail('whittling', wrong + ' of ' + runs + ' took a modifier that was not the lowest level on the item');
    else pass('whittling', n(runs) + ' Chaos Orbs under Omen of Whittling, every one took a lowest-level modifier · ' +
      ties + ' of them had a tie, drawn evenly and said so on the step line');
  }

  /* 11. decision 5: Homogenising only ever adds a modifier sharing a tag with one already on the item */
  {
    const d = await classData('ring'), rnd = rng(SEED + 11);
    let wrong = 0, runs = 0, empty = 0;
    for(let k = 0; k < 20000; k++){
      const it = newItem(d, 'Sapphire Ring', 81, 'normal');
      if(!STEP.alchemy(it, rnd).ok) continue;
      const had = heldTags(it);
      const r = STEP.exalt(it, rnd, {homog: true});
      if(!r.ok){ empty++; continue; }
      runs++;
      if(!tagsOf(d, r.added[0].i).some(t => had.has(t))) wrong++;
    }
    const bare = newItem(d, 'Sapphire Ring', 81, 'rare');
    const none = STEP.exalt(bare, rnd, {homog: true});
    if(wrong) fail('same type', wrong + ' of ' + runs + ' added a modifier sharing no tag with the item');
    else if(none.ok) fail('same type', 'it matched a type on an item that has no modifier yet');
    else pass('same type', n(runs) + ' Exalted Orbs under Omen of Homogenising Exaltation, every added modifier shared a tag · ' +
      empty + ' found no modifier of the tag drawn and refused · on an empty item: "' + none.why + '"');
  }

  /* 12. decision 11: an omen never grants a permission its currency does not have */
  {
    const d = await classData('ring'), rnd = rng(SEED + 12);
    const it = newItem(d, 'Sapphire Ring', 81, 'normal');
    STEP.alchemy(it, rnd);                       // a Rare with four modifiers on it, then corrupted
    it.corrupt = true;
    const held = it.mods.length;
    const ran = [];
    for(const name of Object.keys(OMEN)){
      const o = omenOpts([name]);
      if(!o.ok) continue;
      const step = {'Exalted Orb': STEP.exalt, 'Regal Orb': STEP.regal, 'Chaos Orb': STEP.chaos,
        'Orb of Annulment': STEP.annul, 'Divine Orb': STEP.divine,
        'Essence': (x, r, p) => STEP.essence(x, r, {...p, name: d.ess[0][0]})}[OMEN[name].orb];
      if(step(it, rnd, o.opt).ok) ran.push(name);
    }
    if(ran.length) fail('corrupted', ran.length + ' omens still crafted on a corrupted item: ' + ran.join(', '));
    else if(it.mods.length !== held) fail('corrupted', 'a refused omen still changed the corrupted item');
    else pass('corrupted', Object.keys(OMEN).length + ' omens tried on a corrupted Rare, every one refused with its currency, item untouched at ' + held + ' modifiers');
  }
  return {ok: !bad, out};
}

/* ---------- one craft, start to finish ----------
   Not a check: what a run looks like from the outside, so the line each step reports can be read. */
async function oneCraft(){
  const d = await classData('ring'), rnd = rng(SEED + 8);
  const it = newItem(d, 'Sapphire Ring', 81, 'normal');
  const plan = [
    ['Orb of Transmutation', {}, STEP.transmute], ['Orb of Augmentation', {}, STEP.augment],
    ['Regal Orb', {}, STEP.regal], ['Exalted Orb', {}, STEP.exalt],
    ['Perfect Exalted Orb', {min: 50}, STEP.exalt],
    ['Exalted Orb + Omen of Sinistral Exaltation', omenOpts(['Omen of Sinistral Exaltation']).opt, STEP.exalt],
    ['Chaos Orb + Omen of Whittling', omenOpts(['Omen of Whittling']).opt, STEP.chaos],
    ['Exalted Orb + Omen of Sanctification', null, STEP.exalt],
    ['Divine Orb', {}, STEP.divine], ['Vaal Orb', {}, STEP.vaal]];
  const out = ['One craft on a Sapphire Ring, item level 81:'];
  for(const [name, opt, run] of plan){
    const r = opt === null ? omenOpts(['Omen of Sanctification']) : run(it, rnd, opt);
    out.push('  ' + pad(name, 44) + (r.ok ? pad(r.what, 26) + [...(r.added || []), ...(r.removed || [])]
      .map(m => m.lines.join(' / ')).join(' · ') + (r.note ? '  [' + r.note + ']' : '')
      : 'not used · ' + r.why));
  }
  out.push('  ' + it.rarity + ', ' + countSide(it, 'p') + ' prefixes, ' + countSide(it, 's') + ' suffixes');
  for(const m of it.mods) out.push('    ' + (side(d, m.i) === 'p' ? 'P ' : 'S ') + m.lines.join(' / '));
  return out;
}

/* ---------- the run ---------- */
const started = Date.now();
const report = [];
let worstZ = 0;
const kinds = [];
for(const c of CASES){
  const r = await shares(c);
  report.push(...r.out, '');
  worstZ = Math.max(worstZ, r.worst);
  kinds.push(r.kind);
  if(!r.ok) failed++;
}
const g = await guards();
report.push(...g.out, '');
if(argv.includes('--craft')) report.push(...await oneCraft(), '');
for(const l of report) console.log(l);

say('shares', worstZ < 5, CASES.length + ' classes (' + kinds.join(', ') + '), ' + ROLLS.toLocaleString('en-US') +
  ' rolls each, worst modifier off by ' + worstZ.toFixed(2) + ' standard deviations');
say('guards', g.ok, '12 guards, seed ' + SEED);
for(const l of lines) console.log(l);
console.log((lines.length - failed) + ' ok, ' + failed + ' failed · ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
process.exit(failed ? 1 : 0);
