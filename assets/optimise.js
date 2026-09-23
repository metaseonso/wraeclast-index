/* The optimise button, and the live recommendations under the numbers: one machine, run two ways.

   It takes what the player has chosen and fills what is still open toward offence, defence or balanced. It
   never replaces a choice. A slot the player filled, a modifier they picked, a cluster they took: all fixed.
   That is what makes the change list mean anything — every row in it is a thing that was empty.

   docs/proposal-builder.md section 4 states the rules and the arithmetic. What is here:

     the search      greedy, a beam of four, then a pair pass over the top forty it rejected (4.2)
     the clock       a first answer at 250ms on a beam of one, the full pass capped at 3s (4.3)
     the answer      ties are shown and not taken; nothing improving is an answer; the budget running out
                     is an answer, with how far it got (4.4)

   Why not brute force: five supports out of a median 243 legal ones is 6,774,333,588 combinations before
   gear and before the tree. At the cost tools/dev/buildcheck.mjs measures that is half a day.

   Why not branch and bound: a bound worth having has to know the best a stat can still become, which means
   knowing how each candidate interacts with the rest — the thing v1.0 does not model. Without a tight bound
   it is this search with more bookkeeping.

   It imports the rules and nothing else. No DOM, no fetch, no prices: the caller works out what is open and
   hands the candidates over, and the caller draws the answer. assets/builder.js is that caller, for both the
   button and the live recommendations, so a recommendation the panel shows is one the button would take. */
import * as M from './maths.js';

/* What a player is optimising for. The label is the word on the chip. */
export const AIMS = [['off', 'Offence'], ['def', 'Defence'], ['both', 'Balanced']];
export const aimName = a => (AIMS.find(x => x[0] === a) || [, a])[1];

export const BEAM = 4;        // how many part-answers a step carries forward
export const STEPS = 20;      // and how many steps it takes before it has had its go
export const REJECTS = 40;    // the rejects the pair pass goes back over: 780 pairs
export const FIRST = 250;     // milliseconds to a first answer, on a beam of one
export const CAP = 3000;      // and what the whole pass never runs past
const TIE = 1e-9;             // two scores this close are the same score

/* ---------- the score ----------
   One number per aim, each a ratio against the build as it stands, so a change is worth what it moved and
   the three aims are on the same scale.

   Offence is damage per second. Defence is effective life over the five damage types — the biggest hit of
   each type the pools stand, at their geometric mean, so a change is worth most where the build is thinnest
   and no single hole swallows the number. Balanced is the two of them, evenly.

   Every score is taken at the floor: each thing the model cannot settle is read the way that does not
   flatter the build. A change that is only good under a generous reading of an unknown does not win here,
   and 4.4 says which unknown when that is what separated two answers. */
export function effectiveLife(c){
  let log = 0, n = 0;
  for(const t of M.TYPES){
    const v = c.hits[t];
    if(!(v > 0)) return 0;
    if(!isFinite(v)) return Infinity;      // a resistance at a hundred: nothing of that type lands at all
    log += Math.log(v); n++;
  }
  return n ? Math.exp(log / n) : 0;
}
export function scoreOf(c, dps, aim, was){
  const off = was.dps > 0 ? (dps && dps.dps > 0 ? dps.dps / was.dps : 0) : (dps && dps.dps > 0 ? 1 : 0);
  const def = was.life > 0 && c ? effectiveLife(c) / was.life : 0;
  if(aim === 'off') return was.dps > 0 ? off : def;   // no weapon to swing: offence has nothing to rank by
  if(aim === 'def') return def;
  return was.dps > 0 ? Math.sqrt(Math.max(0, off) * Math.max(0, def)) : def;
}

/* ---------- the stat table, one change at a time ----------
   Rebuilding the table costs a hundred and sixty times what working the character out does, so the search
   never rebuilds it. A candidate's own lines are pushed onto the table, the character is worked out, and the
   keys those lines touched are put back exactly as they were.

   And a wording is read once, not once per evaluation. Reading one is regular expressions over a table of
   shapes and it costs more than the whole character does; a candidate is looked at thousands of times in a
   pass, so its lines are turned into entries the first time it is seen and the pass after that is
   arithmetic. That is the difference between 134 microseconds an evaluation and 19. */
export function entriesOf(x){
  if(x.entries) return x.entries;
  const out = [];
  let unread = 0, named = 0;
  for(const ln of x.lines || []){
    const how = M.readLine(ln, (k, form, v) => out.push([k, form, v]));
    if(how === 'unread') unread++; else if(how === 'outside') named++;
  }
  x.entries = out; x.unread = unread; x.named = named;
  return out;
}
/* Adding a key to the table and taking it out again, thousands of times a second, is what costs: a Map that
   grows and shrinks is rehashed underneath, and the lookups the maths does through it go four times slower.
   So every key any candidate could touch is put in the table once, at nought, before the search starts — a
   key at nought reads exactly as a key that is not there — and from then on the search only ever changes
   numbers on objects that are already in it. Nothing is added and nothing is deleted. */
function seed(stats, open){
  for(const x of open) for(const [k] of entriesOf(x))
    if(!stats.has(k)) stats.set(k, {flat: 0, inc: 0, more: 1});
}
/* And an entry already in the table is never written over in place. A whole number in one of these becomes a
   fraction the moment a candidate touches it and becomes whole again when it is put back, and a field that
   keeps changing what kind of number it holds throws away the compiled maths that reads it — over and over,
   thousands of times a step. So a candidate puts a new entry in the table and the old one is put back after
   it: twelve times faster than editing the one that was there. */
function push(stats, x){
  const was = [];
  for(const [k, form, v] of entriesOf(x)){
    const at = stats.get(k);
    was.push(k, at);
    stats.set(k, form === 'more' ? {flat: at.flat, inc: at.inc, more: at.more * (1 + v / 100)}
      : form === 'inc' ? {flat: at.flat, inc: at.inc + v, more: at.more}
      : {flat: at.flat + v, inc: at.inc, more: at.more});
  }
  return was;
}
function pop(stats, was){
  for(let i = was.length - 2; i >= 0; i -= 2) stats.set(was[i], was[i + 1]);
}
const cloneStats = stats => { const out = new Map(); for(const [k, v] of stats) out.set(k, {...v}); return out; };

/* One character, out of a table and what the gear itself carries. The same call the Build tab makes.

   `wants` says which half the aim is going to read. Offence is worked out of the stat table and the weapon
   alone, and defence out of the pools alone, so a pass for one of them does not pay for the other: working
   a hit out costs twelve microseconds and the whole defensive character costs two. The full answer, and
   anything a player is shown, is always worked out both ways. */
function work(S, stats, gear, take, wants){
  const w = S.weapon;
  const off = !wants || wants.off, def = !wants || wants.def || !w;
  const c = def ? M.character({level: S.level, cls: S.cls, stats, gear, take: take || {}}) : null;
  const dps = off && w ? M.attack({stats, dmg: w.dmg, rate: w.rate, crit: w.crit, quality: w.quality}) : null;
  return {c, dps};
}
/* Which half an aim reads. */
const WANTS = {off: {off: 1, def: 0}, def: {off: 0, def: 1}, both: {off: 1, def: 1}};
const addGear = (a, b) => ({armour: a.armour + (b.armour || 0), evasion: a.evasion + (b.evasion || 0),
  es: a.es + (b.es || 0)});

/* ---------- what a part-answer is ----------
   A node is a list of changes taken, the table they came to, what the gear under them carries, and what is
   still open from there. Cloning the table per node costs about what four evaluations cost, and a node is
   made once a step. */
function node(S, taken, stats, gear, points, score){
  return {taken, stats, gear, points, score,
    shut: new Set(taken.map(t => t.fills)),
    sides: sidesOf(taken)};
}
function sidesOf(taken){
  const by = {};
  for(const t of taken) if(t.kind === 'mod'){
    const s = by[t.slot] || (by[t.slot] = {p: 0, s: 0});
    s[t.side]++;
  }
  return by;
}
/* Whether a node can still take this one: its opening is not already filled, the side it lands on has room,
   it does not need a change this node has not made, and there are points left for it. */
function allows(S, nd, x){
  if(nd.shut.has(x.fills)) return false;
  if(x.needs && !nd.taken.some(t => t.fills === x.needs)) return false;
  if(x.points && nd.points + x.points > S.points.cap) return false;
  if(x.kind === 'mod'){
    const s = nd.sides[x.slot];
    if(s && x.caps && s[x.side] >= x.caps[x.side]) return false;
  }
  return true;
}

/* ---------- the search ----------
   `start` hands back something the caller drives: tick it with a slice of milliseconds, it does as many
   candidates as fit and comes back. The page keeps answering between slices, and the answer improves while
   the button says how far it has got. */
export function start(S, aim, opt){
  const o = opt || {};
  const beam = o.beam || BEAM;
  const cap = o.cap == null ? CAP : o.cap;
  const steps = o.steps == null ? STEPS : o.steps;   // nought steps is a number, not a missing one
  seed(S.stats, S.open);
  const was = work(S, S.stats, S.gear, {});
  const base = {dps: was.dps ? was.dps.dps : 0, life: effectiveLife(was.c)};
  const rank = (c, dps) => scoreOf(c, dps, aim, base);
  const wants = WANTS[aim] || WANTS.both;

  const first = node(S, [], cloneStats(S.stats), {...S.gear}, S.points.spent, 1);
  let live = [first];
  let best = first;
  const state = {
    aim, base, was, tried: 0, steps: 0, ms: 0, done: false, stopped: '',
    ties: [], rejects: [], turned: null, pairs: 0,
  };

  /* One step over one node: every change it could still make, scored. */
  function over(nd){
    const out = [];
    for(const x of S.open){
      if(!allows(S, nd, x)) continue;
      const back = push(nd.stats, x);
      const gear = x.gear ? addGear(nd.gear, x.gear) : nd.gear;
      const {c, dps} = work(S, nd.stats, gear, {}, wants);
      pop(nd.stats, back);
      state.tried++;
      // the score and where it came from, and nothing else: holding a worked-out character per candidate is
      // five thousand of them a step, which costs more in rubbish than the maths costs in work
      out.push({x, score: rank(c, dps), at: nd});
    }
    return out;
  }

  function take(nd, hit){
    const stats = cloneStats(nd.stats);
    push(stats, hit.x);
    return node(S, [...nd.taken, hit.x], stats, addGear(nd.gear, hit.x.gear || {}),
      nd.points + (hit.x.points || 0), hit.score);
  }

  /* The pair pass: the repair for what a greedy search is bad at — two changes that are only good together.
     Over the top rejects, two at a time, and a pair is taken only where it beats the settled answer. */
  let pairAt = 0, pairList = null;
  function pairStep(deadline){
    if(!pairList){
      const seen = new Set(best.taken.map(t => t.fills));
      pairList = state.rejects.filter(x => !seen.has(x.fills)).slice(0, REJECTS);
      pairAt = 0;
    }
    const n = pairList.length;
    while(pairAt < n * n){
      if(performance.now() > deadline) return false;
      const i = Math.floor(pairAt / n), j = pairAt % n;
      pairAt++;
      if(j <= i) continue;
      const a = pairList[i], b = pairList[j];
      if(a.fills === b.fills) continue;
      if(!allows(S, best, a) || !allows(S, best, b)) continue;
      if((best.points + (a.points || 0) + (b.points || 0)) > S.points.cap) continue;
      const one = push(best.stats, a), two = push(best.stats, b);
      const gear = addGear(addGear(best.gear, a.gear || {}), b.gear || {});
      const {c, dps} = work(S, best.stats, gear, {}, wants);
      pop(best.stats, two); pop(best.stats, one);
      state.tried++; state.pairs++;
      const score = rank(c, dps);
      if(score > best.score * (1 + TIE)){
        const mid = take(best, {x: a, score});
        best = take(mid, {x: b, score});
      }
    }
    return true;
  }

  let phase = 'greedy';
  const began = performance.now();

  function tick(slice){
    if(state.done) return state;
    const deadline = Math.min(performance.now() + (slice || 16), began + cap);
    while(performance.now() < deadline){
      if(phase === 'greedy'){
        if(state.steps >= steps){ phase = 'pairs'; continue; }
        const all = [];
        for(const nd of live) all.push(...over(nd));
        if(!all.length){ phase = 'pairs'; state.stopped = state.stopped || 'nothing'; continue; }
        all.sort((a, z) => z.score - a.score);
        if(state.steps === 0) state.rejects = all.slice(1).map(h => h.x);
        const top = all[0];
        if(top.score <= best.score * (1 + TIE)){
          // nothing here improves it, so there is nothing for two answers to be tied about
          state.ties = [];
          phase = 'pairs';
          state.stopped = state.stopped || 'nothing';
          continue;
        }
        /* Two changes that score the same are a choice, and the player makes it. The search shows both and
           takes neither: it stops here, and the answer is what it had settled before the tie, with the tie
           beside it and what separates them named. Taking one because it came first in a list would be the
           machine making the choice quietly, which is the one thing it must not do. */
        const tied = tiesAt(all, top.score);
        if(tied.length > 1){
          state.ties = tied;
          state.stopped = state.stopped || 'tie';
          phase = 'pairs';
          continue;
        }
        state.ties = [];
        live = all.slice(0, beam).filter(h => h.score > h.at.score * (1 + TIE)).map(h => take(h.at, h));
        if(!live.length){ phase = 'pairs'; continue; }
        best = live.reduce((a, z) => z.score > a.score ? z : a, live[0]);
        state.steps++;
      } else if(phase === 'pairs'){
        if(o.pairs === false){ phase = 'done'; continue; }
        if(!pairStep(deadline)) break;      // the slice ran out mid-pass; it carries on where it stopped
        phase = 'done';
      } else break;
    }
    state.ms = performance.now() - began;
    if(phase === 'done') state.done = true;
    else if(state.ms >= cap){ state.done = true; state.stopped = 'clock'; }
    state.best = best;
    state.steps_of = steps;
    return state;
  }
  return {tick, state, steps, cap,
    get answer(){ return answerOf(S, state, best, aim); }};
}
/* Two changes that score the same are only a choice where they are after the same thing. Two helmets for one
   helmet slot is a choice; two prefixes on one item are a choice, because the item has room for so many.
   A support and a boot modifier that happen to be worth the same are not a choice at all — the search takes
   one now and the other next step, and nobody had to pick. */
const groupOf = x => x.kind === 'mod' ? 'mod:' + x.slot + '/' + x.side : x.fills;
function tiesAt(all, score){
  const out = [], seen = new Set();
  for(const h of all){
    if(h.score < score * (1 - TIE) || h.score > score * (1 + TIE)) continue;
    if(seen.has(h.x.fills)) continue;        // four beam nodes proposing one change is one change
    seen.add(h.x.fills);
    out.push(h);
    if(out.length >= 4) break;
  }
  if(out.length < 2) return [];
  // only the ones after the same thing, and only where there is more than one of them
  const by = new Map();
  for(const h of out){
    const g = groupOf(h.x);
    if(!by.has(g)) by.set(g, []);
    by.get(g).push(h);
  }
  for(const list of by.values()) if(list.length > 1) return list;
  return [];
}
export function separates(a, b){
  if(a.x.price != null && b.x.price != null && a.x.price !== b.x.price) return 'cheaper';
  if((a.x.points || 0) !== (b.x.points || 0)) return 'fewer points';
  if((a.x.unread || 0) !== (b.x.unread || 0)) return 'fewer unknowns';
  return '';
}

/* ---------- the answer ----------
   Every change, in the order it was made, with what it did to the numbers on its own — which is what the row
   puts back. And what it did not reach. */
function answerOf(S, state, best, aim){
  const rows = [];
  const stats = cloneStats(S.stats);
  seed(stats, best.taken);
  let gear = {...S.gear}, before = work(S, stats, gear, {});
  let score = scoreOf(before.c, before.dps, aim, state.base);
  for(const x of best.taken){
    push(stats, x);
    gear = addGear(gear, x.gear || {});
    const now = work(S, stats, gear, {});
    rows.push({x, moved: moved(before, now), score: scoreOf(now.c, now.dps, aim, state.base) - score,
      needs: x.needs || ''});
    before = now; score += rows[rows.length - 1].score;
  }
  return {
    aim, rows, tried: state.tried, steps: state.steps, of: state.steps_of, ms: state.ms,
    pairs: state.pairs, stopped: state.stopped, done: state.done,
    ties: state.ties.map((t, i) => ({x: t.x, by: i ? separates(state.ties[0], t) : ''})),
    was: state.was, now: before,
    score: scoreOf(before.c, before.dps, aim, state.base),
    points: best.points,
  };
}
/* What one change did, in the words the card prints beside it: the biggest of the numbers it moved. */
export function moved(a, z){
  const dps = (z.dps ? z.dps.dps : 0) - (a.dps ? a.dps.dps : 0);
  const life = effectiveLife(z.c) - effectiveLife(a.c);
  const pool = z.c.pool - a.c.pool;
  return {dps, life, pool,
    dpsPct: a.dps && a.dps.dps > 0 ? dps / a.dps.dps * 100 : 0,
    lifePct: effectiveLife(a.c) > 0 ? life / effectiveLife(a.c) * 100 : 0};
}

/* ---------- which unknown decided it ----------
   Where the best change is only best under one reading of an unsettled thing, the card says which one and
   shows the answer both ways. Cheap because it re-scores the two candidates that came top, and nothing
   else: the search itself never runs on the flattering reading. */
export function turnedBy(S, aim, a, b, ids){
  for(const id of ids || []){
    const take = {[id]: true};
    const one = scoreAt(S, aim, a, take), two = scoreAt(S, aim, b, take);
    const flat = scoreAt(S, aim, a, {}), flatTwo = scoreAt(S, aim, b, {});
    if((flat >= flatTwo) !== (one >= two)) return id;
  }
  return '';
}
function scoreAt(S, aim, x, take){
  const stats = cloneStats(S.stats);
  seed(stats, [x]);
  push(stats, x);
  const gear = addGear({...S.gear}, x.gear || {});
  const c = M.character({level: S.level, cls: S.cls, stats, gear, take});
  const w = S.weapon;
  const dps = w ? M.attack({stats, dmg: w.dmg, rate: w.rate, crit: w.crit, quality: w.quality}) : null;
  const was = work(S, S.stats, S.gear, take);
  return scoreOf(c, dps, aim, {dps: was.dps ? was.dps.dps : 0, life: effectiveLife(was.c)});
}

/* What a build is worth as it stands, in the two numbers the score is made of. Used where one build has to
   be set against another rather than ranked against itself — putting a change back, and seeing whether a
   later change was only worth anything because of it. */
export function numbers(S){
  const {c, dps} = work(S, S.stats, S.gear, {});
  return {dps: dps ? dps.dps : 0, life: effectiveLife(c)};
}

/* ---------- what would improve this ----------
   The live list under the numbers, while the player is choosing. One step of the same search, on the same
   candidates, scored the same way — so a change the panel names is one the button would take. There is no
   second engine and there never is one. */
export function wouldImprove(S, aim, n){
  const s = start(S, aim, {beam: 1, steps: 1, pairs: false, cap: 1e9});
  s.tick(1e9);
  const best = s.state.best && s.state.best.taken[0];
  const out = [];
  const seen = new Set();
  for(const x of [best, ...(s.state.rejects || [])]){
    if(!x || seen.has(x.fills)) continue;
    seen.add(x.fills);
    out.push(x);
    if(out.length >= (n || 3)) break;
  }
  return {list: out, tried: s.state.tried, ms: s.state.ms};
}

/* ---------- run it to the end, without a page ----------
   One call, for the live recommendations and for anything checking this file. The button does not use it:
   the button ticks, so the page never stops answering. */
export function run(S, aim, opt){
  const s = start(S, aim, opt);
  while(!s.state.done) s.tick(1e9);
  return s.answer;
}
