/* Trade page: the official trade site's full search, in plain words.
   Pick the item, add groups of mods ("must have", "at least N of these", "add these up", "must not have"),
   set details and price, then open the search. The whole search lives in the address, so it can be shared. */
import { D, $, esc } from './app.js';
import { tradeData, searchURL, valueFor, valHTML, syncVal, stepOf, heatNote, rollFor, key, range } from './trade.js';
import * as bp from './basepool.js';

const GROUPS = {
  and:    {label: 'Must have', hint: 'Every mod here must be on the item.'},
  or:     {label: 'Any of these', hint: 'At least one of these must be on the item.'},
  count:  {label: 'At least some of these', hint: 'The item needs this many of the mods below.'},
  weight: {label: 'Add these up', hint: 'Each mod adds to a score (a mod set to 2 counts double). Ask for a total.'},
  not:    {label: 'Must not have', hint: 'Skip items with any of these.'},
};
const OPS = [['min', 'At least'], ['max', 'At most'], ['eq', 'Exactly']];
const STATES = ['corrupted', 'twice_corrupted', 'mutated', 'sanctified', 'desecrated', 'fractured_item', 'mirrored'];
const KIND = {explicit: 'Mod', implicit: 'Implicit', rune: 'Augment', desecrated: 'Desecrated', fractured: 'Fractured',
  enchant: 'Enchant', crafted: 'Crafted', pseudo: 'Total'};
const EXAMPLES = [
  ['Ring with life and resistances', {item: {k: 'category', v: 'accessory.ring', n: 'Ring'}, rarity: 'rare',
    groups: [{t: 'and', mods: [{id: 'pseudo.pseudo_total_life', op: 'min', v: 60}]},
             {t: 'weight', min: 80, mods: [{id: 'pseudo.pseudo_total_fire_resistance', w: 1}, {id: 'pseudo.pseudo_total_cold_resistance', w: 1}, {id: 'pseudo.pseudo_total_lightning_resistance', w: 1}]}]}],
  ['Fast boots', {item: {k: 'category', v: 'armour.boots', n: 'Boots'}, rarity: 'rare',
    groups: [{t: 'and', mods: [{id: 'explicit.stat_2250533757', op: 'min', v: 25}]}]}],
  ['Cheapest Headhunter, not corrupted', {item: {k: 'unique', v: 'Headhunter', n: 'Headhunter'}, states: {corrupted: 'no'}}],
];
const blank = () => ({item: null, rarity: '', types: [], groups: [], ilvl: '', quality: '', lvl: '', sockets: '', states: {},
  price: '', cur: 'divine', indexed: '', online: false, narrow: true});

let T, EL, S = blank(), MOD = new Map(), POP = [];

/* ---------- state in the address ---------- */
function load(){
  const m = location.hash.match(/[?&]s=([^&]+)/);
  if(m){ try { return {...blank(), ...JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))))}; } catch {} }
  try { const x = localStorage.getItem('wi.trade'); if(x) return {...blank(), ...JSON.parse(x)}; } catch {}
  return blank();
}
function save(){
  const packed = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(S)))));
  history.replaceState(null, '', '#/trade?s=' + packed);
  try { localStorage.setItem('wi.trade', JSON.stringify(S)); } catch {}
}

/* ---------- what the chosen base narrows the search to ----------
   A base item can only ever have what its own item class's table says it can: the modifiers its pool rolls,
   the ones a desecration or a corruption adds, the augments its sockets take and its own implicit
   (data/craft/<class>.json, tools/craft.py — assets/basepool.js reads its shape). Joined to the trade
   site's own list by the wording of the line, that gives the mods this base can be searched for, the
   defence mixes it comes in, and the ends and the tiers of each slider.
   It narrows nothing until that table is in, and nothing ever disappears without the page saying so: the
   Mods list and the Type row both carry the note, and one tap on it puts everything back. */
const CSRC = {m: ['explicit'], d: ['desecrated', 'explicit'], c: ['enchant', 'implicit']};
// the trade site lists "reduced" and "less" as "increased" and "more" with a negative number (assets/craft.js)
const flip = line => /\b(reduced|less)\b/.test(line) ? line.replace(/\breduced\b/, 'increased').replace(/\bless\b/, 'more') : null;
let NAR = null, NARFOR = null;   // what the item narrows to, and the item it was worked out for
const narrowing = () => (S.narrow === false ? null : NAR);
function statOf(line, which, cl){
  const tail = cl.g === 'Flasks' ? (cl.id === 'charm' ? ' (charm)' : ' (flask)') : '';   // "... (Charm)" on the trade site
  const find = k => {
    for(const kind of CSRC[which] || []){
      if(cl.loc && T.local[kind] && T.local[kind][k]) return T.local[kind][k];
      if(T.by[kind] && T.by[kind][k]) return T.by[kind][k];
    }
    return null;
  };
  const one = l => (tail && find(key(l) + tail)) || find(key(l));
  return one(line) || (flip(line) && one(flip(line))) || null;
}
/* {n, cat, ids, ranges, types}: what this base is called, its trade category, the mods it can have, the ends
   and tiers of each of those, and the defence mixes it comes in. */
function narrowOf(P, base, cl){
  const ids = new Set(), ranges = new Map();
  // the ends and the tiers of a slider are what the base rolls; two mods that read as one line on the trade
  // site keep the ends and lose the tiers, rather than drawing one mod's tiers over another's
  for(const f of bp.famsOf(P, base, 'm')) for(const t of f.tiers) for(const line of t.lines){
    const id = statOf(line, 'm', cl), r = id && range(line);
    if(!id) continue;
    ids.add(id);
    if(!r) continue;
    const got = ranges.get(id);
    if(!got){ ranges.set(id, {f: f.f, lo: r.lo, hi: r.hi, tiers: [[r.lo, r.hi, t.lvl]]}); continue; }
    got.lo = Math.min(got.lo, r.lo); got.hi = Math.max(got.hi, r.hi);
    if(got.f === f.f && got.tiers) got.tiers.push([r.lo, r.hi, t.lvl]);
    else got.tiers = null;
  }
  // a desecration, a corruption, a rune in a socket and the base's own implicit: things it can have, with
  // no rolling tiers of their own here
  for(const which of ['d', 'c']) for(const f of bp.famsOf(P, base, which))
    for(const t of f.tiers) for(const line of t.lines) ids.add(statOf(line, which, cl));
  if(cl.so) for(const a of P.aug || []) for(const line of [...(a[3] || []), ...(a[4] || [])])
    ids.add(statOf(line, 'm', cl));
  for(const b of base ? [base] : P.bases) for(const line of b.im || []) ids.add(statOf(line, 'c', cl));
  ids.delete(null);
  for(const r of ranges.values()){
    if(r.tiers) r.tiers.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if(r.tiers && r.tiers.length < 2) r.tiers = null;
  }
  return {n: base ? base.n : cl.n, cat: cl.cat, ids, ranges, types: bp.typingsOf(P, base)};
}
async function loadNarrow(){
  const sig = S.item ? S.item.k + '|' + S.item.v : '';
  if(sig === NARFOR) return;
  NARFOR = sig;
  NAR = null;
  if(!S.item || (S.item.k !== 'base' && S.item.k !== 'category')) return;
  const cl = await bp.classFor(S.item);
  const P = cl && await bp.table('data/craft/' + cl.id + '.json');
  if(NARFOR !== sig) return;   // the item was changed while its table was coming
  if(P) NAR = narrowOf(P, bp.baseOf(P, S.item.k === 'base' ? S.item.v : ''), cl);
  if(NAR) repaint();
}
/* the note, wherever something is being narrowed: what it is narrowed to, and the way out beside it */
function narrowNote(){
  const n = narrowing();
  if(n) return '<p class="cr-fnote tp-fnote"><span class="cr-flab">Narrowed to</span>' +
    '<button type="button" class="cr-foff" data-act="wide">what ' + esc(n.n) + ' can have<i aria-hidden="true">✕</i></button></p>';
  return NAR ? '<p class="note tp-fnote"><button type="button" class="linkbtn" data-act="narrow">Narrow to what ' +
    esc(NAR.n) + ' can have</button></p>' : '';
}

/* ---------- defence types (gear kinds only) ----------
   Each ticked type is a mix like "Evasion + Energy Shield". A defence every ticked type has must be there,
   one that none of them has must be missing, the rest are free. */
const DEF = {ar: 'Armour', ev: 'Evasion', es: 'Energy Shield'};
const typeName = t => t.split('+').map(d => DEF[d]).join(' + ');
const sortMix = v => v.split('+').sort().join('+');
/* Every defence mix this kind of item is listed under, or — where a base narrows it — only the mixes that
   base really comes in. A mix already ticked stays on the list whatever happens, so a tick never vanishes. */
function typesFor(){
  const cat = S.item && (S.item.k === 'category' ? S.item.v : NAR && S.item.k === 'base' ? NAR.cat : '');
  const all = (cat && T.typings && T.typings[cat]) || null;
  const n = narrowing();
  if(!all || !n) return all;
  const mine = new Set(n.types.map(sortMix)), ticked = new Set(S.types || []);
  const keep = all.filter(t => mine.has(sortMix(t.join('+'))) || ticked.has(t.join('+')));
  return keep.length ? keep : all;
}
function defenceFilters(){
  const all = typesFor(); if(!all || !S.types || !S.types.length) return {};
  const picked = S.types.map(t => t.split('+')), out = {};
  for(const d of Object.keys(DEF)){
    if(picked.every(p => p.includes(d))) out[d] = {min: 1};
    else if(!picked.some(p => p.includes(d))) out[d] = {max: 0};
  }
  return out;
}

/* ---------- the query the trade site reads ---------- */
function query(){
  const q = {status: {option: S.online ? 'online' : 'any'}};
  if(S.item && S.item.k === 'unique'){ q.name = S.item.v; if(S.item.base) q.type = S.item.base; }
  if(S.item && S.item.k === 'base') q.type = S.item.v;
  const stats = S.groups.filter(g => g.mods.length).map(g => {
    const type = g.t === 'or' ? 'count' : g.t;   // "any of these" is a count of at least 1 on the trade site
    const filters = g.mods.map(m => {
      if(g.t === 'weight') return {id: m.id, value: {weight: +m.w || 1}};
      if(g.t === 'not') return {id: m.id};
      return m.v === '' || m.v === undefined ? {id: m.id} : {id: m.id, value: valueFor(m.op || 'min', +m.v)};
    });
    const out = {type, filters};
    if(g.t === 'count') out.value = {min: +g.n || 1};
    if(g.t === 'or') out.value = {min: 1};
    if(g.t === 'weight' && g.min !== '' && g.min !== undefined) out.value = {min: +g.min};
    return out;
  });
  if(stats.length) q.stats = stats;
  const f = {}, put = (grp, k, v) => { (f[grp] = f[grp] || {filters: {}}).filters[k] = v; };
  if(S.item && S.item.k === 'category') put('type_filters', 'category', {option: S.item.v});
  if(S.rarity) put('type_filters', 'rarity', {option: S.rarity});
  if(S.ilvl !== '') put('type_filters', 'ilvl', {min: +S.ilvl});
  if(S.quality !== '') put('type_filters', 'quality', {min: +S.quality});
  if(S.lvl !== '') put('req_filters', 'lvl', {max: +S.lvl});
  if(S.sockets !== '') put('equipment_filters', 'rune_sockets', {min: +S.sockets});
  for(const [d, v] of Object.entries(defenceFilters())) put('equipment_filters', d, v);
  for(const [k, v] of Object.entries(S.states)) if(v === 'yes' || v === 'no') put('misc_filters', k, {option: v === 'yes' ? 'true' : 'false'});
  if(S.price !== '') put('trade_filters', 'price', {max: +S.price, option: S.cur});
  if(S.indexed) put('trade_filters', 'indexed', {option: S.indexed});
  if(Object.keys(f).length) q.filters = f;
  return {query: q, sort: {price: 'asc'}};
}

/* ---------- the search in one plain sentence ---------- */
const modText = id => (MOD.get(id) || {t: id}).t;
function summary(){
  const bits = [];
  const rar = S.rarity ? (T.options.rarity.find(o => o[0] === S.rarity) || [, ''])[1] : '';
  bits.push((rar ? rar + ' ' : '') + (S.item ? S.item.n : 'item'));
  if(typesFor() && S.types && S.types.length) bits.push(S.types.map(typeName).join(' or '));
  for(const g of S.groups.filter(g => g.mods.length)){
    const names = g.mods.map(m => {
      const t = modText(m.id).replace(/#/g, '#');
      if(g.t === 'weight') return t + (+m.w > 1 ? ' ×' + m.w : '');
      if(g.t === 'not' || m.v === '' || m.v === undefined) return t;
      return t + ' ' + ({min: '≥', max: '≤', eq: '='}[m.op || 'min']) + ' ' + m.v;
    });
    if(g.t === 'and') bits.push('with ' + names.join(', '));
    if(g.t === 'count') bits.push('with at least ' + (g.n || 1) + ' of: ' + names.join(', '));
    if(g.t === 'or') bits.push('with ' + names.join(' or '));
    if(g.t === 'weight') bits.push('score of ' + names.join(' + ') + (g.min !== '' && g.min !== undefined ? ' ≥ ' + g.min : ''));
    if(g.t === 'not') bits.push('without ' + names.join(', '));
  }
  const extra = [];
  if(S.ilvl !== '') extra.push('item level ' + S.ilvl + '+');
  if(S.quality !== '') extra.push('quality ' + S.quality + '%+');
  if(S.lvl !== '') extra.push('wearable at level ' + S.lvl);
  if(S.sockets !== '') extra.push(S.sockets + '+ augment sockets');
  for(const [k, v] of Object.entries(S.states)) if(v === 'yes' || v === 'no')
    extra.push((v === 'no' ? 'not ' : '') + ((T.states.find(s => s[0] === k) || [, k])[1]).toLowerCase());
  if(S.price !== '') extra.push('up to ' + S.price + ' ' + (T.options.price.find(o => o[0] === S.cur) || [, S.cur])[1]);
  if(S.indexed) extra.push('listed ' + (T.options.indexed.find(o => o[0] === S.indexed) || [, ''])[1].toLowerCase());
  extra.push(S.online ? 'online sellers' : 'any seller');
  return bits.join(', ') + '. ' + extra.join(', ') + '.';
}

/* ---------- popular searches (everyone's, from the site's database) ----------
   Only names that exist in the game data are shown, so nothing typed by a person can appear here. */
function itemName(it){
  if(!it) return '';
  if(it.k === 'category'){ const c = T.options.category.find(o => o[0] === it.v); return c ? c[1] : ''; }
  if(it.k === 'unique') return T.uniques[it.v] ? it.v : '';
  if(it.k === 'base') return Object.values(T.bases).some(list => list.includes(it.v)) ? it.v : '';
  return '';
}
function modLabel(m){
  const info = MOD.get(m.id);
  if(!info) return '';
  const t = m.v !== '' && m.v !== undefined && isFinite(+m.v) ? info.t.replace('#', +m.v) : info.t;
  return t.replace(/#/g, 'X');
}
function popLabel(s){
  if(s.item && !itemName(s.item)) return '';
  const mods = (s.groups || []).flatMap(g => g.mods || []);
  if(mods.some(m => !MOD.has(m.id))) return '';
  const bits = [itemName(s.item), ...mods.slice(0, 2).map(modLabel)].filter(Boolean);
  return bits.length ? bits.join(' · ') + (mods.length > 2 ? ' · +' + (mods.length - 2) + ' more' : '') : '';
}
function popHTML(){
  const rows = POP.map((p, i) => ({i, label: popLabel(p.s), n: p.n})).filter(r => r.label).slice(0, 8);
  return rows.length ? '<span class="lbl">Popular now</span>' + rows.map(r => '<button type="button" class="chip" data-pop="' + r.i +
    '" title="' + esc(r.label) + ' · searched ' + r.n + (r.n === 1 ? ' time' : ' times') + ' this week">' + esc(r.label) + '</button>').join('') : '';
}
async function loadPop(){
  try {
    const r = await fetch('api/trade/searches');
    POP = r.ok ? ((await r.json()).popular || []) : [];
  } catch { POP = []; }
  const host = EL && EL.querySelector('.tp-pop');
  if(host) host.innerHTML = popHTML();
}
/* count this search as used (when it is opened or copied) */
function record(){
  if(!S.item && !S.groups.some(g => g.mods.length)) return;
  try {
    fetch('api/trade/searches', {method: 'POST', keepalive: true, body: JSON.stringify(S),
      headers: {'Content-Type': 'application/json', 'X-WI': '1'}}).catch(() => {});
  } catch {}
}

/* ---------- pickers ---------- */
function itemMatches(q){
  q = q.trim().toLowerCase();
  if(!q) return [];
  const out = [];
  for(const [id, text] of T.options.category) if(text.toLowerCase().includes(q)) out.push({k: 'category', v: id, n: text, s: 'Any of this kind'});
  for(const [name, bases] of Object.entries(T.uniques)) if(name.toLowerCase().includes(q))
    for(const b of bases) out.push({k: 'unique', v: name, base: b, n: name, s: 'Unique · ' + b});
  for(const [grp, types] of Object.entries(T.bases)) for(const t of types) if(t.toLowerCase().includes(q)) out.push({k: 'base', v: t, n: t, s: 'Base type · ' + grp});
  const score = x => (x.n.toLowerCase().startsWith(q) ? 0 : 1) + (x.k === 'category' ? 0 : x.k === 'unique' ? 0.2 : 0.4);
  return out.sort((a, b) => score(a) - score(b)).slice(0, 12);
}
function modMatches(q){
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if(!words.length) return [];
  const n = narrowing(), out = [];
  // a total is worked out from whatever is on the item, so it is not one of the base's own mods
  const here = id => !n || id.startsWith('pseudo.') || n.ids.has(id);
  for(const [id, m] of MOD) if(here(id) && words.every(w => m.l.includes(w))) out.push({id, ...m});
  const rank = m => (m.k === 'pseudo' ? 0 : m.k === 'explicit' ? 1 : m.k === 'implicit' ? 2 : 3) + m.t.length / 1000;
  return out.sort((a, b) => rank(a) - rank(b)).slice(0, 14);
}
function picker(host, placeholder, find, pick){
  host.innerHTML = '<input class="field tp-find" type="search" placeholder="' + esc(placeholder) + '" autocomplete="off"><div class="tsearch-drop" hidden></div>';
  const inp = host.querySelector('input'), drop = host.querySelector('.tsearch-drop');
  let rows = [], sel = 0;
  const paint = () => {
    drop.innerHTML = rows.length ? rows.map((r, i) => '<button type="button" class="tsearch-row" data-i="' + i + '" aria-selected="' + (i === sel) + '">' +
      '<span class="t"><b>' + esc(r.n || r.t) + '</b><span>' + esc(r.s || KIND[r.k] || '') + '</span></span></button>').join('')
      : '<div class="tsearch-none">Nothing matches.</div>';
    drop.hidden = false;
  };
  inp.addEventListener('input', () => { rows = find(inp.value); sel = 0; if(inp.value.trim()) paint(); else drop.hidden = true; });
  inp.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown' && rows.length){ e.preventDefault(); sel = (sel + 1) % rows.length; paint(); }
    else if(e.key === 'ArrowUp' && rows.length){ e.preventDefault(); sel = (sel - 1 + rows.length) % rows.length; paint(); }
    else if(e.key === 'Enter' && rows[sel]){ e.preventDefault(); pick(rows[sel]); }
    else if(e.key === 'Escape'){ drop.hidden = true; }
  });
  drop.addEventListener('mousedown', e => e.preventDefault());
  drop.addEventListener('click', e => { const b = e.target.closest('.tsearch-row'); if(b) pick(rows[+b.dataset.i]); });
  inp.addEventListener('blur', () => setTimeout(() => drop.hidden = true, 120));
}

/* ---------- page ---------- */
export async function mount(el){
  EL = el;
  el.innerHTML = '<div class="pagehd"><h2>Trade</h2><p>Build any trade search in plain words, then open it on the official site.</p></div><p class="note">Loading…</p>';
  T = await tradeData();
  for(const [id, t, lo, hi, tk] of T.mods){   // lo/hi: the slider's ends; tk: its tiers
    const k = id.split('.')[0];
    MOD.set(id, {t: t.replace(/\s*\n\s*/g, ' / '), k, l: t.toLowerCase(),
      r: lo === undefined ? null : [lo, hi], tiers: tk ? T.tiers[tk] : null});
  }
  S = load();
  draw();
  loadPop();
  return {update};
}
function update(){ const s = load(); if(JSON.stringify(s) !== JSON.stringify(S)){ S = s; draw(); } }

function sel(name, opts, val, first){
  return '<select class="field" data-k="' + name + '">' + (first ? '<option value="">' + first + '</option>' : '') +
    opts.map(([id, t]) => '<option value="' + esc(id) + '"' + (id === val ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>';
}
function num(name, val, ph){ return '<input class="field tp-num" type="number" data-k="' + name + '" value="' + esc(val) + '" placeholder="' + esc(ph || '') + '">'; }
/* a number box, with a slider beside it when the range is known (o: slider ends, step, tiers) */
function vnum(name, val, ph, o){ return o ? valHTML({...o, k: name, v: val}, num(name, val, ph)) : num(name, val, ph); }
/* the ends of a slider: what this mod rolls anywhere, or — where a base narrows it — what it rolls on that
   base, with that base's own tiers on the track */
function modSlide(id, info){
  const n = narrowing(), own = n && n.ranges.get(id);
  const r = own ? [own.lo, own.hi] : info.r, tiers = own ? own.tiers : info.tiers;
  return r ? {lo: r[0], hi: r[1], step: stepOf(r[0], r[1], tiers), tiers, prices: rollFor(id)} : null;
}
function totalSlide(g){   // the most the mods in an 'add these up' group can reach
  if(!g.mods.length || !g.mods.every(m => (MOD.get(m.id) || {}).r)) return null;
  const hi = g.mods.reduce((a, m) => a + (+m.w || 1) * MOD.get(m.id).r[1], 0);
  return hi > 0 ? {lo: 0, hi: Math.ceil(hi), step: 1} : null;
}

function groupHTML(g, gi){
  const G = GROUPS[g.t];
  return '<section class="tp-group" data-g="' + gi + '"><div class="tp-ghd"><h4>' + G.label + '</h4><span class="note">' + G.hint + '</span>' +
    '<button type="button" class="btn tp-del" data-act="delgroup" title="Remove this group">Remove</button></div>' +
    (g.t === 'count' ? '<div class="trow"><span>How many</span>' + vnum('n', g.n ?? 1, '', g.mods.length > 1 ? {lo: 1, hi: g.mods.length, step: 1, heat: false} : null) + '</div>' : '') +
    g.mods.map((m, mi) => {
      const info = MOD.get(m.id) || {t: m.id, k: ''};
      const n = narrowing();
      // a mod that was already here when the base was picked stays, and says where it stands
      const off = n && !m.id.startsWith('pseudo.') && !n.ids.has(m.id)
        ? '<span class="tp-off">' + esc(n.n) + ' cannot roll it</span>' : '';
      return '<div class="tp-mod" data-m="' + mi + '"><span class="tp-mtext">' + esc(info.t) + ' <span class="pill">' + (KIND[info.k] || '') + '</span>' + off + '</span>' +
        (g.t === 'and' || g.t === 'count' || g.t === 'or' ? '<div class="seg" data-k="op">' + OPS.map(([o, l]) =>
          '<button type="button" data-v="' + o + '" aria-pressed="' + ((m.op || 'min') === o) + '">' + l + '</button>').join('') + '</div>' + vnum('v', m.v ?? '', 'any', modSlide(m.id, info)) : '') +
        (g.t === 'weight' ? '<span class="note">counts ×</span>' + vnum('w', m.w ?? 1, '', {lo: 1, hi: 10, step: 1, heat: false}) : '') +
        '<button type="button" class="btn tp-x" data-act="delmod" title="Remove">Remove</button></div>';
    }).join('') +
    (g.t === 'weight' ? '<div class="trow"><span>Total at least</span>' + vnum('min', g.min ?? '', 'any', totalSlide(g)) + '</div>' : '') +
    '<div class="tp-add" data-picker="mod"></div></section>';
}

function draw(){
  const url = searchURL(D.market ? D.market.league : 'Standard', query());
  EL.innerHTML =
    '<div class="pagehd"><h2>Trade</h2><p>Build any trade search in plain words, then open it on the official site.</p></div>' +
    '<div class="tp-pop">' + popHTML() + '</div>' +
    '<div class="tp-ex">' + EXAMPLES.map(([l], i) => '<button type="button" class="chip" data-ex="' + i + '">' + esc(l) + '</button>').join('') +
      '<button type="button" class="linkbtn" data-act="reset">Start over</button></div>' +
    '<div class="panel tp">' +
      '<h3 class="tp-h">What are you looking for?</h3>' +
      '<div class="row">' + (S.item ? '<span class="tp-item"><b>' + esc(S.item.n) + '</b> <span class="note">' +
          esc(S.item.k === 'unique' ? 'Unique' + (S.item.base ? ' · ' + S.item.base : '') : S.item.k === 'base' ? 'Base type' : 'Any of this kind') +
          '</span> <button type="button" class="btn" data-act="clearitem">Change</button></span>'
        : '<div class="tp-pick" data-picker="item"></div>') +
        '<label class="lbl">Rarity</label>' + sel('rarity', T.options.rarity, S.rarity, 'Any') + '</div>' +
      (typesFor() ? '<div class="tp-types"><span class="lbl">Type</span>' + typesFor().map(t => { const v = t.join('+');
        return '<label class="tp-type"><input type="checkbox" data-type="' + v + '"' + ((S.types || []).includes(v) ? ' checked' : '') + '> ' + esc(typeName(v)) + '</label>'; }).join('') + '</div>' + narrowNote() : '') +
      '<h3 class="tp-h">Mods</h3>' + narrowNote() +
      (S.groups.some(g => g.mods.length) ? heatNote(S.groups.some(g => g.t !== 'weight' && g.t !== 'not' && g.mods.some(m => rollFor(m.id)))) : '') +
      (S.groups.length ? S.groups.map(groupHTML).join('') : '<p class="note">No mods yet. Add a group below.</p>') +
      '<div class="row tp-addg">' + Object.entries(GROUPS).map(([t, g]) => '<button type="button" class="btn" data-addg="' + t + '">+ ' + g.label + '</button>').join('') + '</div>' +
      '<h3 class="tp-h">Item details</h3>' +
      '<div class="tp-grid">' +
        '<label>Item level at least' + vnum('ilvl', S.ilvl, 'any', {lo: 1, hi: T.limits.ilvl, step: 1}) + '</label>' +
        '<label>Quality at least' + vnum('quality', S.quality, 'any', {lo: 0, hi: T.limits.quality, step: 1}) + '</label>' +
        '<label>I can use it at level' + vnum('lvl', S.lvl, 'any', {lo: 1, hi: T.limits.level, step: 1, heat: false}) + '</label>' +
        '<label>Augment sockets at least' + num('sockets', S.sockets, 'any') + '</label>' +
      '</div>' +
      '<div class="tstates">' + STATES.map(k => { const name = (T.states.find(s => s[0] === k) || [, k])[1]; const v = S.states[k] || 'any';
        return '<div class="trow"><span>' + esc(name) + '</span><div class="seg" data-state="' + k + '">' +
          ['any', 'yes', 'no'].map(o => '<button type="button" data-v="' + o + '" aria-pressed="' + (v === o) + '">' + o[0].toUpperCase() + o.slice(1) + '</button>').join('') + '</div></div>'; }).join('') + '</div>' +
      '<h3 class="tp-h">Price and sellers</h3>' +
      '<div class="row"><label class="lbl">Up to</label>' + num('price', S.price, 'any') + sel('cur', T.options.price, S.cur) +
        '<label class="lbl">Listed</label>' + sel('indexed', T.options.indexed, S.indexed, 'Any time') +
        '<label class="note tonline"><input type="checkbox" data-k="online"' + (S.online ? ' checked' : '') + '> Online sellers only</label></div>' +
    '</div>' +
    '<div class="panel tp-out"><p class="tp-sum">' + esc(summary()) + '</p>' +
      '<div class="tgo"><button type="button" class="btn tcopy">Copy link</button><a class="btn gold" target="_blank" rel="noopener" href="' + esc(url) + '">Open on trade ↗</a></div></div>';

  // the chosen base's own table, the first time it is asked for: it narrows once it is in, and a table that
  // does not come leaves the whole list where it was rather than half of it
  loadNarrow().catch(() => {});
  const ip = EL.querySelector('[data-picker="item"]');
  if(ip) picker(ip, 'An item, a unique or a kind (e.g. ring, Headhunter, boots)', itemMatches, it => { S.item = it; S.types = []; S.narrow = true; commit(); });
  EL.querySelectorAll('[data-picker="mod"]').forEach(h => {
    const gi = +h.closest('.tp-group').dataset.g;
    picker(h, 'Add a mod: type any words (e.g. life, fire res, total)', modMatches, m => {
      const g = S.groups[gi];
      g.mods.push(g.t === 'weight' ? {id: m.id, w: 1} : g.t === 'not' ? {id: m.id} : {id: m.id, op: 'min', v: ''});
      commit(true);
    });
  });
  wire();
}
function commit(focusLast){ save(); const y = scrollY; draw(); scrollTo(0, y);
  if(focusLast){ const f = [...EL.querySelectorAll('.tp-add input')].pop(); if(f) f.focus({preventScroll: true}); } }
function repaint(){ const y = scrollY; draw(); scrollTo(0, y); }   // the page again, nothing about the search changed
function refresh(){   // values changed: keep the inputs, redo the summary and the link
  save();
  EL.querySelector('.tp-sum').textContent = summary();
  EL.querySelector('.tp-out .gold').href = searchURL(D.market ? D.market.league : 'Standard', query());
}

let wired = false;
function wire(){
  if(wired) return; wired = true;
  EL.addEventListener('input', e => {
    const t = e.target, k = t.dataset.k; if(!k || t.type === 'checkbox' || t.tagName === 'SELECT') return;
    const g = t.closest('.tp-group'), m = t.closest('.tp-mod');
    if(m) S.groups[+g.dataset.g].mods[+m.dataset.m][k] = t.value;
    else if(g) S.groups[+g.dataset.g][k] = t.value;
    else S[k] = t.value;
    syncVal(t);
    refresh();
  });
  EL.addEventListener('change', e => {
    const t = e.target, k = t.dataset.k;
    if(t.dataset.type){ const v = t.dataset.type; S.types = (S.types || []).filter(x => x !== v).concat(t.checked ? [v] : []); return refresh(); }
    if(!k) return;
    if(t.type === 'checkbox'){ S[k] = t.checked; refresh(); }
    else if(t.tagName === 'SELECT'){ S[k] = t.value; refresh(); }
  });
  EL.addEventListener('click', e => {
    if(e.target.closest('.tp-out a.gold')) return record();
    const b = e.target.closest('button'); if(!b) return;
    if(b.dataset.pop !== undefined){
      const p = POP[+b.dataset.pop]; if(!p) return;
      const s = JSON.parse(JSON.stringify(p.s));
      if(s.item) s.item.n = itemName(s.item);
      S = {...blank(), ...s}; return commit();
    }
    const g = b.closest('.tp-group'), m = b.closest('.tp-mod'), seg = b.closest('.seg');
    if(b.dataset.ex !== undefined){ S = {...blank(), ...JSON.parse(JSON.stringify(EXAMPLES[+b.dataset.ex][1]))}; return commit(); }
    if(b.dataset.addg){ S.groups.push(b.dataset.addg === 'count' ? {t: 'count', n: 1, mods: []} : {t: b.dataset.addg, mods: []}); return commit(); }
    if(b.dataset.act === 'reset'){ S = blank(); return commit(); }
    if(b.dataset.act === 'clearitem'){ S.item = null; S.types = []; S.narrow = true; return commit(); }
    if(b.dataset.act === 'wide'){ S.narrow = false; return commit(); }
    if(b.dataset.act === 'narrow'){ S.narrow = true; return commit(); }
    if(b.dataset.act === 'delgroup'){ S.groups.splice(+g.dataset.g, 1); return commit(); }
    if(b.dataset.act === 'delmod'){ S.groups[+g.dataset.g].mods.splice(+m.dataset.m, 1); return commit(); }
    if(seg && seg.dataset.k === 'op'){ S.groups[+g.dataset.g].mods[+m.dataset.m].op = b.dataset.v; return commit(); }
    if(seg && seg.dataset.state){ S.states[seg.dataset.state] = b.dataset.v; return commit(); }
    if(b.classList.contains('tcopy')){
      record();
      const url = searchURL(D.market ? D.market.league : 'Standard', query());
      navigator.clipboard && navigator.clipboard.writeText(url).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy link', 1400); });
    }
  });
}
