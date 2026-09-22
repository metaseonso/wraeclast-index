/* The frame, enforced.

   docs/frame.md states the frame: the slots a card has, how many pieces each draws, what a slot says about
   what it did not draw, and the rules that hold for every kind alike. This file fails a build that breaks it.
   tools/dev/guard.mjs runs it as the "frame" check; run on its own it does the parts that need no browser:

     node tools/dev/frame.mjs                  the table and the map, against this worktree's own files

   Three parts.

   The table, straight out of assets/kinds.js (never read back out of the drawing code):
     * a kind the index carries with no declaration
     * a declaration on a kind that the frame does not know — a rule that would reach one kind
     * a field whose slot, box or type the frame does not have; a field type with no renderer, and a renderer
       no field asks for
     * a rule applied to some kinds and not others: a field marked `every` that a kind drops
     * a slot with no cap, a box no field fills, an edge whose map or list is not declared

   The map, against the declarations it was drawn from (tools/map.py names no kind of its own):
     * a kind drawn in a palette token assets/theme.css does not have
     * a kind that is in neither the map's key nor what the picture says it left out

   The cards, drawn in a real browser over the whole index:
     * a slot that drew more pieces than its cap
     * a slot that cut something and did not say how many, or said the wrong number
     * a card that is its own connection, or carries a mark that opens the card you are already on
   It also reports the widest card per slot, which is what the caps are set against. */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KINDS, KIND, DEFAULT, FIELDS, FRAME, SLOTS, BOXES, DECL, REL, MAPS } from '../../assets/kinds.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/* ---------- the map ----------
   The map is one picture of the whole index, laid out at build time (tools/map.py) and framed by
   assets/map.js. Nothing about a kind is written into either: the tool reads `many`, `tone` and `mark` off
   the same table the cards live by. So the frame holds the picture to two rules — a kind's colour is a token
   the theme really has, and every kind is in the map's key or named among what the picture left out. A kind
   that is in neither has fallen out of the map with nobody noticing. */
export function checkMap(theme, map){
  const bad = [];
  if(theme){
    const tokens = new Set([...theme.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
    for(const d of KINDS) if(d.tone && !tokens.has(d.tone))
      bad.push(d.many + ' is drawn in "' + d.tone + '", which is no token in assets/theme.css');
  }
  if(!map) return {bad, said: 'the table only: no picture to hold it to'};
  const drawn = new Set((map.kinds || []).map(k => k.k));
  const left = new Set(((map.out || {}).kinds || []).map(n => String(n).toLowerCase()));
  const lost = KINDS.filter(d => !drawn.has(d.k) && !left.has(d.many.toLowerCase()));
  for(const d of lost) bad.push(d.many + ' is in neither the map’s key nor what it says it left out');
  return {bad, said: 'the map: ' + drawn.size + ' kinds drawn, ' + left.size + ' named as left out, ' +
    (map.cards || 0).toLocaleString() + ' dots, ' + (map.edges || 0).toLocaleString() + ' lines'};
}

/* ---------- the table ----------
   `seen` is every kind letter the shipped data really carries; `types` the renderers assets/app.js has, when
   a browser was there to ask (the card half passes them in). */
export function checkTable(seen = [], types = null){
  const bad = [];
  const said = [];

  // a kind the index carries with no declaration of its own
  for(const k of seen) if(!KIND[k]) bad.push('the index carries kind "' + k + '" and no kind declares it');
  for(const d of KINDS) if(d.index && !seen.includes(d.k)) bad.push(d.many + ' is declared and the index carries none');

  // a declaration the frame does not know: a rule that would reach one kind
  const decl = new Set(DECL);
  for(const d of KINDS) for(const key of Object.keys(d))
    if(!decl.has(key)) bad.push(d.many + ' carries "' + key + '", which is no declaration the frame has (DECL)');

  // fields: a slot, a box or a type the frame does not have
  const slots = new Set(SLOTS), boxes = new Set(BOXES);
  const usedTypes = new Set(), filled = new Set();
  for(const [name, f] of Object.entries(FIELDS)){
    if(!slots.has(f.slot)) bad.push('field "' + name + '" lands in slot "' + f.slot + '", which is no slot');
    usedTypes.add(f.type);
    if(f.slot === 'head'){
      if(!boxes.has(f.box)) bad.push('head field "' + name + '" fills box "' + f.box + '", which is no box');
      else filled.add(f.box);
    } else if(f.box) bad.push('field "' + name + '" is not in the head and names a box');
  }
  for(const b of BOXES) if(!filled.has(b)) bad.push('the head has a box "' + b + '" and no field fills it');
  // a field that leads to cards of our own says which, and each of them is a kind the table has
  for(const [name, f] of Object.entries(FIELDS)) for(const o of f.cards || []){
    if(!o.card || !o.when) bad.push('field "' + name + '" offers a card with no key or no rule for when');
    else if(!KIND[o.card.slice(0, o.card.indexOf(':'))])
      bad.push('field "' + name + '" offers "' + o.card + '", whose kind is no kind');
  }
  for(const s of SLOTS) if(s !== 'head' && !(s in FRAME.cap)) bad.push('slot "' + s + '" has no cap in FRAME.cap');
  for(const s of Object.keys(FRAME.cap)) if(!slots.has(s)) bad.push('FRAME.cap caps "' + s + '", which is no slot');
  if(!(FRAME.slack >= 0)) bad.push('FRAME.slack is not a number');
  if(!(FRAME.lines > 0)) bad.push('FRAME.lines is not a number');
  for(const n of ['cap', 'slack', 'filter']) if(!(FRAME.rel[n] >= 0)) bad.push('Connections has no ' + n);

  // a field type with no renderer, and a renderer no field asks for
  if(types){
    for(const t of usedTypes) if(!types.includes(t)) bad.push('field type "' + t + '" has no renderer in assets/app.js');
    for(const t of types) if(!usedTypes.has(t)) bad.push('assets/app.js draws type "' + t + '" and no field is of it');
  }

  /* one rule, every kind: a field the frame marks `every` is on every card, and the kinds that keep their
     own fields keep them in the frame's slot order */
  const every = Object.entries(FIELDS).filter(([, f]) => f.every).map(([n]) => n);
  for(const d of [...KINDS, DEFAULT]){
    const has = new Set(d.fields || []);
    const name = d.many || 'a card with no kind';
    for(const f of every) if(!has.has(f))
      bad.push(name + ' drops "' + f + '", which every card carries: a rule cannot reach some kinds and not others');
    const order = (d.fields || []).map(f => SLOTS.indexOf((FIELDS[f] || {}).slot)).filter(i => i >= 0);
    for(let i = 1; i < order.length; i++) if(order[i] < order[i - 1]){
      bad.push(name + ' draws its slots out of the frame’s order');
      break;
    }
    for(const f of d.fields || []) if(!FIELDS[f]) bad.push(name + ' draws "' + f + '", which is no field');
    for(const r of d.rel || []) if(!REL[r]) bad.push(name + ' builds "' + r + '", which is no group under Connections');
    for(const t of d.builds || []) if(!t.key) bad.push(name + ' has a builds test with no list to link to');
    if(d.px && !d.px.as) bad.push(name + ' says its price is listed elsewhere and not under which kind');
    if(d.words && !d.words.mark) bad.push(name + ' puts its words in other cards’ lines and does not say whose words they are');
  }
  for(const [id, r] of Object.entries(REL)){
    if(r.map && !MAPS[r.map]) bad.push('Connections group "' + id + '" reads map "' + r.map + '", which is not declared');
    if(r.of && !KIND[r.of]) bad.push('Connections group "' + id + '" is of kind "' + r.of + '", which is no kind');
  }
  for(const [m, g] of Object.entries(MAPS)){
    if(!g.at) bad.push('map "' + m + '" groups by nothing');
    if(g.of && !KIND[g.of]) bad.push('map "' + m + '" is named after kind "' + g.of + '", which is no kind');
  }

  said.push(KINDS.length + ' kinds, ' + Object.keys(FIELDS).length + ' fields, ' + every.length + ' on every card' +
    ', ' + SLOTS.length + ' slots capped ' + SLOTS.filter(s => s !== 'head').map(s => s + ' ' + FRAME.cap[s]).join('/'));
  return {bad, said: said.join(' · ')};
}

/* ---------- the cards ----------
   What runs in the page: every card in the index, drawn in the grid, against the frame's own accounting of
   what its slots came to (assets/app.js slotsOf). */
export const CARD_PROBE = `(async () => {
  const m = await import('/assets/app.js');
  const k = await import('/assets/kinds.js');
  await m.ready;
  const bad = [], fill = {}, widest = {};
  let cut = 0, cards = 0, lines = 0, marks = 0;
  const seen = new Set();
  const note = s => { if(bad.length < 20) bad.push(s); };
  for(const it of m.D.index.items){
    seen.add(it.k);
    cards++;
    const key = it.k + ':' + it.id;
    const grid = m.card(it, {detail: true}).innerHTML;
    for(const [slot, s] of Object.entries(m.slotsOf(it, {}))){
      if(s.drew > (fill[slot] || 0)){ fill[slot] = s.drew; widest[slot] = it.n; }
      if(s.cap && s.drew > s.cap) note(key + ': the ' + slot + ' slot drew ' + s.drew + ' of a cap of ' + s.cap);
      if(s.over){
        cut++;
        if(!grid.includes(k.FRAME.more(s.over)))
          note(key + ': the ' + slot + ' slot cut ' + s.over + ' and the card does not say so');
      }
    }
    // a field that is itself a list is cut to the frame's height, and says how many are left
    for(const name of k.fieldsOf(it.k, 'body')){
      const f = k.FIELDS[name];
      if(!f.at || k.FIELDS[name].type !== 'rich' || !Array.isArray(it[f.at])) continue;
      const over = it[f.at].length - (f.lines || k.FRAME.lines);
      if(over <= k.FRAME.slack) continue;
      lines++;
      if(!grid.includes(k.FRAME.more(over)))
        note(key + ': ' + it[f.at].length + ' lines cut to ' + (f.lines || k.FRAME.lines) + ' and the card does not say so');
    }
    // a card is never its own door
    const full = m.card(it, {href: null, full: true, detail: true});
    for(const b of full.querySelectorAll('.hlink, .kwmark')){
      marks++;
      const to = b.dataset.h || (b.dataset.kw !== undefined ? 'w:' + b.dataset.kw : '');
      if(to === key) note(key + ': a mark on it opens the card you are already on');
    }
  }
  return {bad, fill, widest, cut, cards, lines, marks, kinds: [...seen], types: Object.keys(m.TYPE)};
})()`;

/* the Connections half: every card's own lists, with both of the files they can read */
export const REL_PROBE = `(async () => {
  const m = await import('/assets/app.js');
  const e = await import('/assets/edges.js');
  await m.ready;
  const F = {};
  for(const [n, u] of [['kwuse', 'data/kwuse.json'], ['grants', 'data/grants.json']])
    F[n] = await fetch(u).then(r => r.json()).catch(() => null);
  const bad = [];
  let rows = 0, lists = 0, self = 0;
  for(const it of m.D.index.items){
    const key = it.k + ':' + it.id;
    for(const c of e.categories(it, F).list){
      lists++; rows += c.total;
      for(const r of c.rows) if(r.key === key){
        self++;
        if(bad.length < 20) bad.push(key + ': it is its own "' + c.label + '"');
      }
    }
  }
  return {bad, rows, lists, self};
})()`;

/* What the two probes answer, read as a verdict. `evalJS` is whatever can run an expression in a page. */
export async function checkCards(evalJS){
  const got = await evalJS(CARD_PROBE);
  const rel = await evalJS(REL_PROBE);
  const bad = [...got.bad, ...rel.bad];
  const fill = Object.entries(got.fill).filter(([s]) => s !== 'head')
    .map(([s, n]) => s + ' ' + n + '/' + (FRAME.cap[s] || 0)).join(', ');
  return {bad, types: got.types, kinds: got.kinds,
    said: got.cards.toLocaleString() + ' cards drawn, widest ' + fill + ' · ' +
      (got.cut ? got.cut + ' slots' : 'no slot') + ' and ' + (got.lines ? got.lines + ' lists' : 'no list') +
      ' cut, every one counted · ' + got.marks.toLocaleString() + ' marks and ' +
      rel.rows.toLocaleString() + ' rows over ' + rel.lists.toLocaleString() + ' connection lists, none of them itself'};
}

/* on its own: the table half, against this worktree's shipped index */
if(import.meta.url === 'file:///' + process.argv[1].replace(/\\/g, '/').replace(/^\//, '')){
  const index = JSON.parse(await readFile(join(ROOT, 'data', 'index.json'), 'utf8'));
  const seen = [...new Set(index.items.map(it => it.k))];
  const boss = await readFile(join(ROOT, 'data', 'bosses.json'), 'utf8').then(s => JSON.parse(s)).catch(() => null);
  if(boss && (boss.bosses || []).length) for(const d of KINDS) if(d.own && !seen.includes(d.k)) seen.push(d.k);
  const r = checkTable(seen, null);
  const m = checkMap(await readFile(join(ROOT, 'assets', 'theme.css'), 'utf8').catch(() => null),
    await readFile(join(ROOT, FRAME.map.key), 'utf8').then(JSON.parse).catch(() => null));
  const bad = [...r.bad, ...m.bad];
  for(const b of bad) console.log('FAIL ' + b);
  console.log(bad.length ? bad.length + ' broken' : 'ok   frame   ' + r.said + ' · ' + m.said + ' · the table holds');
  process.exit(bad.length ? 1 : 0);
}
