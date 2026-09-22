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

   The engine is assets/engine.js — the same file the bench in the browser imports, so this measures the
   rules a player gets and not a second copy of them. It reads the committed data (data/craft.json and
   data/craft/<class>.json, both built by tools/craft.py) and nothing else, and it writes nothing. The random
   numbers come from a seeded generator so two runs of the same seed print the same table.

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
   assets/engine.js holds it: the item, the pool a modifier is picked from, the draw, one function per
   currency, the omens as riders, and the eleven decisions. It is the only copy of the rules — the bench in
   the browser imports the same file — so what this check proves is what a player gets. Nothing about a rule
   lives in this file; what is below the engine is the measuring. */
import { useData, prepClass, rng, oneOf, newItem, clone, fam, side, famOf, tagsOf, groupsOf, lvlOf,
  countSide, capFor, heldTags, shareOf, candidates, draw, pickOne, RANGE, rollValues, modLines, addMod,
  STEP, OMEN, DECISION, NO_ROLL, LEGACY, DESECRATE_OMEN, omenOpts } from '../../assets/engine.js';

/* ---------- the data ---------- */
const readJSON = async p => JSON.parse(await readFile(join(ROOT, p), 'utf8'));
const CRAFT = await readJSON('data/craft.json');
const CLASSES = useData(CRAFT);
const FILES = {};
async function classData(id){
  if(!FILES[id]) FILES[id] = prepClass(await readJSON('data/craft/' + id + '.json'), id);
  return FILES[id];
}

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
