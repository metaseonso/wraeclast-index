/* The crafting engine: the rules, and nothing that draws or fetches.

   docs/craft-sim.md states every rule below — the item, the pool a modifier is picked from, the draw, one
   function per currency, the omens as riders on a currency, and the eleven decisions where no source we
   trust states a rule. This file is the only copy of them. Two things read it:

     assets/craftsim.js    the bench card and the running card, in a browser
     tools/dev/simcheck.mjs  the check: 250,000 rolls per class against the committed data, and 12 guards

   so what the check proves is what the bench runs. It imports nothing, touches no network and draws
   nothing: the data is handed to it (useData, prepClass) and every answer comes back as plain objects.

   Three rules run through all of it. Official game data first. No invented numbers — where a chance is not
   published the step refuses or asks the player, and never fills the hole. No expected value: no "1 in N",
   no average cost, no cost to hit, in any form. */

/* The kinds of item, from data/craft.json. Handed in rather than read, because the browser and the check
   get the same file by different roads. */
let CLASSES = {};
export function useData(craft){
  CLASSES = Object.fromEntries((craft.classes || []).map(c => [c.id, c]));
  return CLASSES;
}
/* One kind of item's file (data/craft/<class>.json), made ready to roll from: the weight of each entry of a
   pool by the modifier it belongs to. Done once per file, on the file itself. */
export function prepClass(d, id){
  d.id = id;
  for(const p of d.pools) if(!p.wat) p.wat = p.w ? new Map(p.m.map((i, k) => [i, p.w[k]])) : null;
  // the game's own key for a modifier back to its place in this file: a saved craft is kept by the key,
  // because the place moves every time the data is rebuilt
  if(!d.at) d.at = new Map(d.mods.map((m, i) => [m[0], i]));
  return d;
}

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
    mods: [], imp: (base.im || []).slice(), sockets: [], quality: null, caps: {}};
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
  /* A rune or a soul core goes into an empty augment socket and gives the lines `aug[]` carries for this
     kind of item, exactly as the game writes them. Nothing about it is rolled. */
  rune(it, rnd, o = {}){
    if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
    const a = (it.d.aug || []).find(x => x[0] === o.name);
    if(!a) return {ok: false, why: 'A ' + it.cl.n + ' takes nothing from that'};
    const k = it.sockets.indexOf(null);
    if(k < 0) return {ok: false, why: it.sockets.length ? 'Every socket on it is filled already'
      : "It has no augment socket \u2014 an Artificer's Orb adds one"};
    it.sockets[k] = o.name;
    return {ok: true, what: 'in socket ' + (k + 1), added: [], removed: [], note: (a[3] || []).join(' / ')};
  },
  /* A catalyst sets what the item's quality enhances. How much quality one use adds is not in the game files
     the bench reads, so it takes the type and no number \u2014 and nothing on this bench rolls on catalyst
     quality, because the one omen that would is not run (decision 6). */
  catalyst(it, rnd, o = {}){
    if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
    if(!it.base.ca) return {ok: false, why: 'A ' + it.base.n + ' takes no catalyst quality'};
    if(it.quality && it.quality.n === o.name) return {ok: false, why: 'Its quality already enhances those modifiers'};
    it.quality = {n: o.name, tag: o.tag};
    return {ok: true, what: 'quality enhances ' + o.tag + ' modifiers', added: [], removed: []};
  },
  /* The outcome the player took at a step that will not roll (a Vaal Orb, a desecration). The modifier goes
     on whole and its numbers roll the way every other modifier's do; the step that offered it corrupts the
     item, so nothing follows it. */
  take(it, rnd, o = {}){
    if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
    if(o.i === undefined || o.i === null){
      it.corrupt = true;
      return {ok: true, what: 'corrupted, nothing added', added: [], removed: []};
    }
    const e = addMod(it, o.i, rnd, o.src || 'c');
    it.corrupt = true;
    return {ok: true, what: o.src === 'd' ? 'desecrated' : 'corrupted', added: [e], removed: []};
  },
};

/* Which step each of the game's own orbs runs, by the name on the orb (data/craft.json `orbs`). A Greater or
   a Perfect orb is not a step of its own: it runs its plain orb's step with that orb's own floor on the
   modifier it adds (`orbs[].up`). */
const ORB = {
  'Orb of Transmutation': 'transmute',
  'Orb of Augmentation': 'augment',
  'Regal Orb': 'regal',
  'Orb of Alchemy': 'alchemy',
  'Exalted Orb': 'exalt',
  'Chaos Orb': 'chaos',
  'Orb of Annulment': 'annul',
  'Divine Orb': 'divine',
  'Vaal Orb': 'vaal',
  'Fracturing Orb': 'fracture',
  "Artificer's Orb": 'socket',
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

/* Neither will draw, so the bench lists what the item can take and the player takes one. The list is the
   game's own pool \u2014 `pools[].c` for corruption, `pools[].d` for desecration \u2014 narrowed by every rule a roll
   would obey: the item level, the caps, the groups, and whatever an omen says. A corruption modifier has no
   side of its own (it is an implicit), so the caps have nothing to say about it. */
function choices(it, list, opt = {}){
  const d = it.d, gs = heldGroups(it), fs = heldFams(it), out = [];
  const room = {p: countSide(it, 'p') < capFor(it, 'p'), s: countSide(it, 's') < capFor(it, 's')};
  for(const i of list || []){
    const f = d.fam[d.mods[i][1]], a = f[0];
    if(a && opt.only && a !== opt.only) continue;
    if(a && !room[a]) continue;
    if(d.mods[i][2] > it.ilvl) continue;
    if(opt.min && d.mods[i][2] < opt.min) continue;
    if(opt.lord && f[5] !== opt.lord) continue;
    if(fs.has(d.mods[i][1])) continue;
    if(f[3].some(g => gs.has(g))) continue;
    out.push(i);
  }
  return out;
}
const vaalChoices = it => choices(it, it.pool.c);
const boneChoices = (it, opt) => choices(it, it.pool.d, opt);
/* Whether the step can be offered at all. The refusal is the currency's own, in the game's terms; where it
   can run, `why` is the line saying why nothing here is rolled. */
function canVaal(it){
  if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
  return {ok: true, why: WONT_ROLL.vaal};
}
function canBone(it, bone){
  if(it.corrupt) return {ok: false, why: 'A corrupted item cannot be changed'};
  if(!(bone.on || []).includes(it.d.id)) return {ok: false, why: 'A ' + bone.n + ' does nothing to a ' + it.cl.n};
  if(it.rarity !== 'rare') return {ok: false, why: 'Desecration needs a Rare item, this is ' + it.rarity};
  if(bone.mi && it.ilvl > bone.mi)
    return {ok: false, why: 'A ' + bone.n + ' works on an item of level ' + bone.mi + ' or less, and this is ' + it.ilvl};
  return {ok: true, why: WONT_ROLL.desecrate};
}

/* What the two readers take. Nothing here is a rule of its own: the rules are above, and this is the list
   of them the bench and the check both work from. */
export {
  rng, oneOf,
  capsOf, newItem, clone,
  fam, side, famOf, tagsOf, groupsOf, lvlOf, countSide, capFor, heldGroups, heldFams, heldTags, sideWord,
  EVEN_NOTE, poolKind, poolNote, shareOf,
  candidates, draw, pickOne, whyEmpty,
  RANGE, rollRanges, rollValues, withValues, modLines,
  accepts, addMod, addRandom, removable, removeRandom,
  STEP, ORB, OMEN, DECISION, NO_ROLL, LEGACY, DESECRATE_OMEN, omenOpts, WONT_ROLL,
  vaalChoices, boneChoices, canVaal, canBone,
};
