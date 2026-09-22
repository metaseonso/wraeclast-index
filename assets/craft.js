/* Craft tab: pick a base, see every mod it can roll at its item level and how often each one rolls, add mods by
   hand or by mechanic (essences, runes and soul cores, desecration, corruption), then find the item on trade.
   Game data: data/craft.json and data/craft/<kind>.json (tools/craft.py: the game files via RePoE; essence tables
   and orb levels checked on poe2db). Prices and icons: data/market.json (poe.ninja, hourly).
   The weights are the one thing here the game does not publish: they come from Craft of Exile (tools/craftweights.py)
   and the pool names them. One mod's share of its own pool only — never the odds of a whole item.
   The plan (base, item level, mods) lives in the address (#/craft?s=...), so it can be shared. */
import { D, $, esc, card, moneyHTML } from './app.js';
import { tradeData, key, searchURL, valHTML, syncVal } from './trade.js';

const TAGS = [['life', 'Life'], ['mana', 'Mana'], ['defences', 'Defence'], ['resistance', 'Resistance'], ['attribute', 'Attribute'],
  ['attack', 'Attack'], ['caster', 'Caster'], ['minion', 'Minion'], ['damage', 'Damage'], ['physical', 'Physical'],
  ['elemental', 'Elemental'], ['fire', 'Fire'], ['cold', 'Cold'], ['lightning', 'Lightning'], ['chaos', 'Chaos'],
  ['critical', 'Critical'], ['speed', 'Speed'], ['ailment', 'Ailment'], ['gem', 'Skill levels'], ['aura', 'Aura'],
  ['curse', 'Curse'], ['flask', 'Flask'], ['charm', 'Charm']];
const GROUPS = ['Armour', 'Jewellery', 'Weapons', 'Jewels', 'Flasks'];
const DEF = {ar: 'Armour', ev: 'Evasion', es: 'Energy Shield'};
const ADDS = ['Orb of Transmutation', 'Orb of Augmentation', 'Regal Orb', 'Orb of Alchemy', 'Exalted Orb', 'Chaos Orb'];
const SRC = {p: 'Mod', e: 'Essence', d: 'Desecrated', c: 'Corrupted', r: 'Augment'};
const blank = () => ({c: '', b: '', l: 0, m: []});

let EL, X = null, P = null, CL = null, B = null, T = null;
let S = blank();
const FILES = new Map();
const UI = {q: '', tag: '', mech: '', f: null, rq: '', rt: ''};   // page filters (not in the address)
const V = {};   // slider values per family, while picking a tier

/* ---------- state in the address ---------- */
function load(){
  const m = location.hash.match(/[?&]s=([^&]+)/);
  if(m){ try { return {...blank(), ...JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))))}; } catch {} }
  try { const x = localStorage.getItem('wi.craft'); if(x) return {...blank(), ...JSON.parse(x)}; } catch {}
  return blank();
}
function save(){
  const packed = encodeURIComponent(btoa(unescape(encodeURIComponent(JSON.stringify(S)))));
  history.replaceState(history.state, '', '#/craft?s=' + packed);
  try { localStorage.setItem('wi.craft', JSON.stringify(S)); } catch {}
}

/* ---------- data ---------- */
async function classData(id){
  if(!FILES.has(id)) FILES.set(id, fetch('data/craft/' + id + '.json').then(r => {
    if(!r.ok) throw new Error(r.status);
    return r.json();
  }).then(d => {
    d.at = new Map(d.mods.map((m, i) => [m[0], i]));
    d.augAt = new Map(d.aug.map((a, i) => [a[0], i]));
    d.pools.forEach(p => { if(p.w) p.wat = new Map(p.m.map((i, k) => [i, p.w[k]])); });   // mod -> its weight here
    return d;
  }));
  return FILES.get(id);
}
const priceOf = n => { const M = D.market && D.market.items; return M ? M['c:' + n] || null : null; };
const px = n => { const p = priceOf(n); return p && p.v !== undefined ? '<span class="cr-px">' + moneyHTML(p.v) + '</span>' : ''; };
const icon = n => { const p = priceOf(n); return '<span class="cr-ic">' + (p && p.ic ? '<img src="' + esc(p.ic) + '" alt="" loading="lazy" decoding="async">' : '') + '</span>'; };
const defName = d => d ? d.split('+').map(x => DEF[x]).join(' + ') : '';
const words = q => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

/* families of the current base: kind '' rolls, 'd' desecrated, 'c' corruption. Tiers low to high (T1 is the last). */
function families(kind){
  const pool = P.pools[B.p], list = kind === 'd' ? pool.d : kind === 'c' ? pool.c : pool.m, by = new Map();
  for(const i of list){
    const m = P.mods[i];
    let f = by.get(m[1]);
    if(!f) by.set(m[1], f = {f: m[1], fam: P.fam[m[1]], tiers: []});
    f.tiers.push(i);
  }
  return [...by.values()];
}
function tierOfMod(i){   // 'T3' within the current base's family, or '' if it is not a rolling tier here
  const m = P.mods[i], pool = P.pools[B.p];
  const tiers = [...pool.m, ...pool.d, ...pool.c].filter(j => P.mods[j][1] === m[1]);
  const at = tiers.indexOf(i);
  return at < 0 || tiers.length < 2 ? '' : 'T' + (tiers.length - at);
}

/* what is on the item */
function info(e){
  const [src, id, from] = e;
  if(src === 'r'){
    const a = P.aug[P.augAt.get(id)];
    return a ? {src, n: a[0], lines: a[3], a: 'r', ok: true} : null;
  }
  const i = P.at.get(id);
  if(i === undefined) return null;
  const m = P.mods[i], f = P.fam[m[1]];
  const pool = P.pools[B.p];
  const rolls = src === 'p' ? pool.m.includes(i) : src === 'd' ? pool.d.includes(i) : src === 'c' ? pool.c.includes(i) : true;
  const why = !rolls ? 'This base cannot roll it' : src !== 'e' && m[2] > S.l ? 'Needs item level ' + m[2] : '';
  return {src, i, m, f, a: src === 'c' ? 'c' : f[0], lines: m[3], tier: tierOfMod(i), from, groups: f[3], ok: !why, why};
}
function counts(except){
  const c = {p: 0, s: 0, r: 0, c: 0, g: new Set(), fam: new Map()};
  S.m.forEach((e, k) => {
    if(k === except) return;
    const x = info(e); if(!x) return;
    if(x.a === 'p' || x.a === 's'){ c[x.a]++; x.groups.forEach(g => c.g.add(g)); c.fam.set(x.m[1], k); }
    else c[x.a]++;
  });
  return c;
}
/* can this be added? {ok, why, replace: index of the mod it would replace} */
function check(src, i){
  if(src === 'r'){
    const c = counts();
    return c.r < CL.so ? {ok: true} : {ok: false, why: CL.so ? 'Sockets full' : 'No sockets on this item'};
  }
  const m = P.mods[i], f = P.fam[m[1]];
  if(src === 'c'){
    const at = S.m.findIndex(e => e[0] === 'c');
    return {ok: true, replace: at >= 0 ? at : undefined};
  }
  let c = counts();
  const same = c.fam.get(m[1]);
  if(same !== undefined) c = counts(same);
  if(src !== 'e' && m[2] > S.l) return {ok: false, why: 'Needs item level ' + m[2]};
  if(f[3].some(g => c.g.has(g))) return {ok: false, why: 'A mod of this group is on the item'};
  const max = CL.mx[f[0] === 'p' ? 0 : 1];
  if(c[f[0]] >= max) return {ok: false, why: (f[0] === 'p' ? 'Prefixes' : 'Suffixes') + ' full'};
  return {ok: true, replace: same};
}
function add(src, i, from){
  const r = check(src, i);
  if(!r.ok) return;
  const e = src === 'r' ? ['r', P.aug[i][0]] : src === 'e' ? ['e', P.mods[i][0], from] : [src, P.mods[i][0]];
  if(r.replace !== undefined) S.m[r.replace] = e; else S.m.push(e);
  commit();
}

/* ---------- how often a mod rolls ---------- */
/* Weights come from Craft of Exile, not the game files (see the top of this file). 0 means they have no number
   for that mod. A share is of the weight one side of the pool adds up to right now — at this item level, and
   with the orb picked, if any. Prefixes against prefixes, suffixes against suffixes, one mod at a time. */
let TOT = null;   // {p, s} the weight each side can roll now · null: no weights for this base
const wOf = i => { const p = P.pools[B.p]; return p.wat ? p.wat.get(i) || 0 : 0; };
const famWeight = f => f.tiers.reduce((a, i) => a + (eligible(i, '') ? wOf(i) : 0), 0);
function totals(){
  const pool = P.pools[B.p];
  if(!pool.wat) return null;
  const t = {p: 0, s: 0};
  pool.m.forEach((i, k) => { const a = P.fam[P.mods[i][1]][0]; if(pool.w[k] && t[a] !== undefined && eligible(i, '')) t[a] += pool.w[k]; });
  return t;
}
/* a pool with weights can still hold mods they have no number for (a new base they have not measured) */
function someUnweighted(){
  const pool = P.pools[B.p];
  return !!pool.w && pool.w.some((x, k) => !x && eligible(pool.m[k], ''));
}
function share(w, side){
  if(!TOT || !w || !TOT[side]) return '';
  const v = w / TOT[side] * 100;
  return v >= 10 ? Math.round(v) + '%' : v >= 1 ? v.toFixed(1) + '%' : v < 0.01 ? '<0.01%' : v.toFixed(2) + '%';
}
const nice = d => { const t = Date.parse(d + 'T00:00:00Z');   // the day of the pull, written as assets/league.js writes a date
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC'}) : String(d || ''); };

/* ---------- mod rows ---------- */
function orbMin(){ return UI.f ? UI.f.ml || 0 : 0; }
function eligible(i, kind){
  const lvl = P.mods[i][2];
  return lvl <= S.l && (kind !== '' || lvl >= orbMin());
}
function lockHTML(f, ok, lo, hi){   // grey over the tiers this item cannot get
  const t = f.tiers.map(i => P.mods[i]), n = t.length, w = hi - lo;
  if(n < 2 || !(w > 0)) return '';
  const at = x => ((x - lo) / w * 100).toFixed(2) + '%';
  const edges = [lo];
  for(let k = 1; k < n; k++) edges.push(Math.min(hi, Math.max(lo, (t[k - 1][6] + t[k][5]) / 2)));
  edges.push(hi);
  const first = ok.indexOf(true), last = ok.lastIndexOf(true);
  let out = '';
  if(first < 0) return '<i class="cr-lock" style="left:0;right:0"></i>';
  if(first > 0) out += '<i class="cr-lock" style="left:0;width:' + at(edges[first]) + '"></i>';
  if(last < n - 1) out += '<i class="cr-lock" style="left:' + at(edges[last + 1]) + ';right:0"></i>';
  return out;
}
/* the corner of a family row: how many of its tiers this item level can get, and how much of its side of the
   pool the whole mod is worth (all the tiers it can still roll together). */
function tierCount(t, live){
  if(t.length < 2) return 'level ' + t[0][2];
  return (live < t.length ? live + ' of ' + t.length : t.length) + ' tiers';
}
function pick(f, v){   // the tier a value lands in (index into f.tiers)
  let k = 0;
  f.tiers.forEach((i, j) => { if(P.mods[i][5] !== null && +v >= P.mods[i][5]) k = j; });
  return k;
}
function famHTML(f, kind){
  const t = f.tiers.map(i => P.mods[i]), fam = f.fam;
  const ok = f.tiers.map(i => eligible(i, kind));
  const best = ok.lastIndexOf(true);
  const onItem = counts().fam.get(f.f);
  const slider = t.length > 1 && t.every(m => m[5] !== null) && t[t.length - 1][6] > t[0][5];
  let v = V[kind + f.f];
  if(v === undefined || !slider) v = slider ? t[Math.max(0, best)][5] : null;
  const k = slider ? pick(f, v) : Math.max(0, best);
  const r = check(kind === '' ? 'p' : kind, f.tiers[k]);
  const lvlOk = ok[k];
  const why = !lvlOk ? (P.mods[f.tiers[k]][2] > S.l ? 'Needs item level ' + P.mods[f.tiers[k]][2] : 'Below this orb’s level') : r.why;
  const tiers = slider ? t.map(m => [m[5], m[6], m[2]]) : null;
  let ctl = '';
  if(slider){
    const lo = t[0][5], hi = Math.max(...t.map(m => m[6])), step = [lo, hi, ...t.flatMap(m => [m[5], m[6]])].every(Number.isInteger) ? 1 : 0.01;
    ctl = valHTML({k: 'tv', lo, hi, step, v, tiers},
      '<input class="field tnum" type="number" data-k="tv" step="' + step + '" value="' + v + '" aria-label="Roll">')
      .replace('</span><input type="range"', lockHTML(f, ok, lo, hi) + '</span><input type="range"');
  } else {
    ctl = '<span class="ttier">' + (t.length > 1 ? t.length + ' tiers · ' : '') + esc(tierLine(t[k], t.length - k, t.length < 2)) + '</span>';
  }
  const lord = fam[5] ? '<span class="pill">' + esc(fam[5]) + '</span>' : '';
  const fs = kind === '' ? share(famWeight(f), fam[0]) : '';
  return '<div class="cr-fam' + (best < 0 ? ' off' : '') + (onItem !== undefined ? ' on' : '') + '" data-f="' + f.f + '" data-kind="' + kind + '">' +
    '<div class="cr-fhd"><span class="cr-ft">' + fam[1].map(esc).join('<br>') + '</span>' + lord +
      '<span class="cr-tn">' + tierCount(t, ok.filter(Boolean).length) +
      (fs ? ' · <b>' + fs + '</b> of ' + (fam[0] === 'p' ? 'prefixes' : 'suffixes') : '') + '</span></div>' +
    '<div class="cr-fctl">' + ctl + (kind === '' ? tierWeightHTML(f, k, lvlOk) : '') +
      '<button type="button" class="btn cr-add" data-add="' + (kind || 'p') + '"' + (lvlOk && r.ok ? '' : ' disabled title="' + esc(why) + '"') + '>' +
      (onItem !== undefined ? 'Change' : 'Add') + '</button></div></div>';
}
/* the tier the slider is on: its weight, and what that is of its side of the pool right now */
function tierWeightHTML(f, k, lvlOk){
  if(!TOT) return '';
  const w = wOf(f.tiers[k]), s = w && lvlOk ? share(w, f.fam[0]) : '';
  return '<span class="cr-fw">' + (w ? 'Weight ' + w.toLocaleString() + (s ? ' · ' + s : '') : 'No weight') + '</span>';
}
function tierLine(m, n, one){ return (one ? '' : 'T' + n + ' · ') + m[3].join(' / ') + (m[2] > 1 ? ' · item level ' + m[2] + '+' : ''); }

/* ---------- mechanics ---------- */
function mechList(){
  const pool = P.pools[B.p], out = [['orbs', 'Orbs']];
  if(P.ess.length) out.push(['ess', 'Essences']);
  if(CL.so && P.aug.length) out.push(['aug', 'Runes & cores']);
  if(pool.d.length) out.push(['des', 'Desecrate']);
  if(pool.c.length) out.push(['cor', 'Corrupt']);
  out.push(['omen', 'Omens']);
  if(B.ca) out.push(['cat', 'Catalysts']);
  return out;
}
function omensFor(orb){ return X.omens.filter(o => o.orb === orb); }
function omenRow(o, filter){
  return '<div class="cr-row">' + icon(o.n) + '<div class="cr-rt"><b>' + esc(o.n) + '</b>' + px(o.n) +
    '<span class="cr-rs">' + esc(o.t) + '</span></div>' +
    (filter && o.only ? '<button type="button" class="btn cr-use" data-only="' + o.only + '" data-orb="' + esc(o.orb) + '" aria-pressed="' +
      !!(UI.f && UI.f.orb === o.orb && UI.f.only === o.only) + '">' + (o.only === 'p' ? 'Prefixes only' : 'Suffixes only') + '</button>' : '') + '</div>';
}
function orbsHTML(){
  return X.orbs.filter(o => o.n !== "Artificer's Orb" || CL.so).map(o => {
    const adds = ADDS.includes(o.n);
    const vers = adds ? [[o.n, 0], ...(o.up || [])] : [];
    const on = n => UI.f && UI.f.n === n;
    return '<div class="cr-orb">' + '<div class="cr-row">' + icon(o.n) + '<div class="cr-rt"><b>' + esc(o.n) + '</b>' + px(o.n) +
      '<span class="cr-rs">' + esc(o.t) + (o.n === "Artificer's Orb" ? ' · up to ' + CL.so + ' on this item' : '') + '</span></div></div>' +
      (vers.length ? '<div class="cr-vers">' + vers.map(([n, ml]) =>
        '<button type="button" class="chip" data-orb="' + esc(o.n) + '" data-v="' + esc(n) + '" data-ml="' + ml + '" aria-pressed="' + on(n) + '">' +
        esc(n === o.n ? n : n.split(' ')[0] + ' · level ' + ml + '+') + (n !== o.n ? px(n) : '') + '</button>').join('') +
        omensFor(o.n).filter(x => x.only).sort((a, b) => a.only > b.only ? 1 : -1).map(x => '<button type="button" class="chip" data-only="' + x.only + '" data-orb="' + esc(o.n) +
          '" aria-pressed="' + !!(UI.f && UI.f.orb === o.n && UI.f.only === x.only) + '" title="' + esc(x.n) + '">' +
          (x.only === 'p' ? 'Prefixes only' : 'Suffixes only') + px(x.n) + '</button>').join('') + '</div>' : '') + '</div>';
  }).join('') + '<p class="note">Pick an orb to see what it can add.</p>';
}
function essHTML(){
  const rows = P.ess.map(([n, k, i, lvl]) => ({n, k, i, lvl, m: P.mods[i]}))
    .sort((a, b) => (a.k > b.k) - (a.k < b.k) || a.m[1] - b.m[1] || a.lvl - b.lvl);
  const part = (k, title) => {
    const list = rows.filter(r => r.k === k);
    if(!list.length) return '';
    return '<h4 class="cr-h4">' + title + '</h4>' + list.map(r => {
      const f = P.fam[r.m[1]], c = check('e', r.i), tier = tierOfMod(r.i);
      return '<div class="cr-row">' + icon(r.n) + '<div class="cr-rt"><b>' + esc(r.n) + '</b>' + px(r.n) +
        '<span class="cr-ml">' + r.m[3].map(esc).join('<br>') + '</span>' +
        '<span class="cr-rs">' + (f[0] === 'p' ? 'Prefix' : 'Suffix') + (tier ? ' · ' + tier : '') + (r.lvl ? ' · level ' + r.lvl : '') + '</span></div>' +
        '<button type="button" class="btn cr-add" data-add="e" data-i="' + r.i + '" data-from="' + esc(r.n) + '"' +
        (c.ok ? '' : ' disabled title="' + esc(c.why) + '"') + '>' + (c.replace !== undefined ? 'Change' : 'Add') + '</button></div>';
    }).join('');
  };
  return part('m', 'Magic to rare') + part('r', 'On a rare: replaces a random mod');
}
function augHTML(){
  const types = [...new Set(P.aug.map(a => a[1]))];
  const q = words(UI.rq);
  const list = P.aug.map((a, i) => ({a, i})).filter(({a}) => (!UI.rt || a[1] === UI.rt) &&
    q.every(w => (a[0] + ' ' + a[3].join(' ') + ' ' + a[4].join(' ')).toLowerCase().includes(w)));
  const c = check('r');
  return '<div class="cr-bar"><input class="field" type="search" data-k="rq" placeholder="Search runes and cores" value="' + esc(UI.rq) + '" autocomplete="off">' +
    '<div class="kinds cr-chips">' + ['', ...types].map(t => '<button type="button" class="chip" data-rt="' + esc(t) + '" aria-pressed="' + (UI.rt === t) + '">' +
      esc(t || 'All') + '</button>').join('') + '</div></div>' +
    '<p class="note">Sockets: ' + counts().r + ' of ' + CL.so + ' used.</p>' +
    '<div class="cr-list">' + list.map(({a, i}) => '<div class="cr-row">' + icon(a[0]) + '<div class="cr-rt"><b>' + esc(a[0]) + '</b>' + px(a[0]) +
      '<span class="cr-ml">' + a[3].map(esc).join('<br>') + '</span>' +
      (a[4].length ? '<span class="cr-rs">Bonded: ' + a[4].map(esc).join(' · ') + '</span>' : '') +
      '<span class="cr-rs">' + esc(a[1]) + (a[2] ? ' · level ' + a[2] : '') + (a[5] ? ' · limited to ' + esc(a[5]) : '') + '</span></div>' +
      '<button type="button" class="btn cr-add" data-add="r" data-i="' + i + '"' + (c.ok ? '' : ' disabled title="' + esc(c.why) + '"') + '>Add</button></div>').join('') +
    (list.length ? '' : '<p class="note">Nothing matches.</p>') + '</div>';
}
function desHTML(){
  const bones = X.bones.filter(b => b.on.includes(CL.id));
  const fams = families('d');
  return '<div class="cr-list">' + bones.map(b => '<div class="cr-row">' + icon(b.n) + '<div class="cr-rt"><b>' + esc(b.n) + '</b>' + px(b.n) +
      '<span class="cr-rs">' + esc(b.t) + (b.mi ? ' · item level ' + b.mi + ' or less' : '') + (b.ml ? ' · mods level ' + b.ml + '+' : '') + '</span></div></div>').join('') +
    omensFor('Desecrate').map(o => omenRow(o)).join('') + '</div>' +
    (X.wsrc ? '<p class="note">No weights here: what is measured is the pool an orb rolls from, not what a bone adds.</p>' : '') +
    ['p', 's'].map(a => {
      const list = fams.filter(f => f.fam[0] === a);
      return list.length ? '<h4 class="cr-h4">' + (a === 'p' ? 'Prefixes' : 'Suffixes') + '</h4><div class="cr-fams">' + list.map(f => famHTML(f, 'd')).join('') + '</div>' : '';
    }).join('');
}
function corHTML(){
  return '<div class="cr-list">' + ['Vaal Orb'].map(n => { const o = X.orbs.find(x => x.n === n) || {n, t: ''};
      return '<div class="cr-row">' + icon(n) + '<div class="cr-rt"><b>' + esc(n) + '</b>' + px(n) + '<span class="cr-rs">' + esc(o.t) + '</span></div></div>'; }).join('') +
    omensFor('Vaal Orb').map(o => omenRow(o)).join('') + '</div>' +
    '<h4 class="cr-h4">Can add one of these</h4>' +
    (X.wsrc ? '<p class="note">No weights here: what is measured is the pool an orb rolls from, not what a Vaal Orb adds.</p>' : '') +
    '<div class="cr-fams">' + families('c').map(f => famHTML(f, 'c')).join('') + '</div>';
}
function omenHTML(){
  const by = new Map();
  for(const o of X.omens) (by.get(o.orb) || by.set(o.orb, []).get(o.orb)).push(o);
  return [...by].map(([orb, list]) => '<h4 class="cr-h4">' + esc(orb === 'Desecrate' ? 'Desecration' : orb) + '</h4><div class="cr-list">' +
    list.map(o => omenRow(o, true)).join('') + '</div>').join('');
}
function catHTML(){
  const on = CL.id === 'jewel' ? 'jewel' : 'jewellery';
  const fams = families('');
  return '<div class="cr-list">' + X.cats.filter(c => c.on === on).map(c => {
    const n = fams.filter(f => f.fam[2].includes(c.tag)).length;
    return '<div class="cr-row">' + icon(c.n) + '<div class="cr-rt"><b>' + esc(c.n) + '</b>' + px(c.n) +
      '<span class="cr-rs">' + esc(c.t) + ' · ' + n + ' here</span></div>' +
      (n ? '<button type="button" class="btn cr-use" data-tag="' + esc(c.tag) + '" aria-pressed="' + (UI.tag === c.tag) + '">Show</button>' : '') + '</div>';
  }).join('') + '</div>';
}
function mechHTML(){
  const list = mechList();
  if(!list.some(m => m[0] === UI.mech)) UI.mech = '';
  const body = {orbs: orbsHTML, ess: essHTML, aug: augHTML, des: desHTML, cor: corHTML, omen: omenHTML, cat: catHTML}[UI.mech];
  return '<h3 class="cr-h">Add by mechanic</h3><div class="kinds cr-chips" role="group" aria-label="Mechanic">' + list.map(([k, l]) =>
    '<button type="button" class="chip" data-mech="' + k + '" aria-pressed="' + (UI.mech === k) + '">' + l + '</button>').join('') + '</div>' +
    (body ? '<div class="cr-mbody">' + body() + '</div>' : '');
}

/* ---------- the mod pool ---------- */
/* "Weights: Craft of Exile", where they come from and when they were pulled: the game does not publish them,
   so the pool says who does. */
function wsrcHTML(){
  const s = X.wsrc;
  if(!s) return '';
  return 'Weights: <a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.n) + '</a> — ' + esc(s.how) +
    ', not in the game files. Pulled ' + esc(nice(s.d)) + (s.p ? ' for their patch ' + esc(s.p) : '') + '.';
}
function poolHTML(){
  const fams = families('');
  TOT = totals();
  const tags = TAGS.filter(([t]) => fams.some(f => f.fam[2].includes(t)));
  if(UI.tag && !tags.some(t => t[0] === UI.tag)) UI.tag = '';
  const q = words(UI.q);
  const only = UI.f && UI.f.only;
  const shown = fams.filter(f => (!UI.tag || f.fam[2].includes(UI.tag)) && (!only || f.fam[0] === only) &&
    q.every(w => (f.fam[1].join(' ') + ' ' + f.tiers.map(i => P.mods[i][4]).join(' ')).toLowerCase().includes(w)));
  const col = a => {
    const list = shown.filter(f => f.fam[0] === a);
    if(TOT) list.sort((x, y) => famWeight(y) - famWeight(x) || x.f - y.f);   // likeliest roll on top, at this item level
    const live = list.filter(f => f.tiers.some(i => eligible(i, '')));
    return '<section class="cr-col"><h4 class="cr-h4">' + (a === 'p' ? 'Prefixes' : 'Suffixes') + ' <span>' + live.length +
      (live.length !== list.length ? ' of ' + list.length : '') + '</span></h4>' +
      (list.length ? '<div class="cr-fams">' + list.map(f => famHTML(f, '')).join('') + '</div>' : '<p class="note">None.</p>') + '</section>';
  };
  return '<h3 class="cr-h">Every mod it can roll <span class="note">item level ' + S.l + '</span></h3>' +
    (UI.f ? '<p class="cr-fnote"><span>' + esc(UI.f.n) + (UI.f.ml ? ' · mods level ' + UI.f.ml + '+' : '') +
      (UI.f.only ? ' · ' + (UI.f.only === 'p' ? 'prefixes' : 'suffixes') + ' only' : '') + '</span>' +
      '<button type="button" class="linkbtn" data-act="nofilter">Show all</button></p>' : '') +
    '<div class="cr-bar"><input class="field" type="search" data-k="q" placeholder="Filter mods (e.g. life, fire res)" value="' + esc(UI.q) + '" autocomplete="off">' +
    '<div class="kinds cr-chips" role="group" aria-label="Tags">' + [['', 'All'], ...tags].map(([t, l]) =>
      '<button type="button" class="chip" data-tag="' + t + '" aria-pressed="' + (UI.tag === t) + '">' + l + '</button>').join('') + '</div></div>' +
    '<p class="note">T1 is the best roll. Drag to pick a tier, then Add. Grey tiers need a higher item level.</p>' +
    (TOT ? '<p class="note">Likeliest first. Shares are out of what this item level can roll on that side — prefixes against prefixes, ' +
      'suffixes against suffixes. One mod at a time, not the odds for a whole item. ' +
      (someUnweighted() ? 'Mods they have no number for sit at the bottom, outside the shares. ' : '') + wsrcHTML() + '</p>'
      : '<p class="note">No roll chances for this kind: the game files say which mods a base can roll at an item level, not how often each ' +
      'one comes up, and ' + (X.wsrc ? esc(X.wsrc.n) + ' has no measured weights for it either.' : 'nothing measured is published for it.') + '</p>') +
    '<div class="cr-cols">' + (only !== 's' ? col('p') : '') + (only !== 'p' ? col('s') : '') + '</div>';
}

/* ---------- the item ---------- */
const NUM = /[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?/g;
const PAIR = /^([+-]?\d+(?:\.\d+)?)(?:-([+-]?\d+(?:\.\d+)?))?$/;
function span(tok){   // same rules as assets/trade.js
  const paren = tok.includes('('), neg = tok[0] === '-' && paren;
  const body = (paren && tok[0] !== '(' ? tok.replace(/^[+-]+/, '') : tok.replace(/^\+/, '')).replace(/[()]/g, '');
  const m = body.match(PAIR);
  if(!m) return null;
  let a = +m[1], b = m[2] !== undefined ? +m[2] : a;
  if(neg){ a = -a; b = -b; }
  return [Math.min(a, b), Math.max(a, b)];
}
function rangeOf(line){   // "Adds (4-6) to (7-10)" searches the average, like the trade site
  const parts = (line.match(NUM) || []).map(span).filter(Boolean);
  if(!parts.length) return null;
  const avg = i => parts.reduce((a, p) => a + p[i], 0) / parts.length;
  return parts.length > 1 && /\badds\b.*\bto\b/i.test(line) ? {lo: avg(0), hi: avg(1)} : {lo: parts[0][0], hi: parts[0][1]};
}
const KINDS = {p: ['explicit'], e: ['explicit'], d: ['desecrated', 'explicit'], c: ['enchant', 'implicit'], r: ['rune']};
/* the trade site's stat for a line: {id, neg}. It lists "reduced" and "less" as "increased" and "more" with a negative number. */
const flip = line => /\b(reduced|less)\b/.test(line) ? line.replace(/\breduced\b/, 'increased').replace(/\bless\b/, 'more') : null;
function stat(line, src){
  if(!T) return undefined;
  const find = k => {
    for(const kind of KINDS[src]){
      if(CL.loc && T.local[kind] && T.local[kind][k]) return T.local[kind][k];
      if(T.by[kind] && T.by[kind][k]) return T.by[kind][k];
    }
    return null;
  };
  const tail = CL.g === 'Flasks' ? (CL.id === 'charm' ? ' (charm)' : ' (flask)') : '';   // "... (Charm)" on the trade site
  const id = (tail && find(key(line) + tail)) || find(key(line));
  if(id) return {id, neg: false};
  const alt = flip(line) && ((tail && find(key(flip(line)) + tail)) || find(key(flip(line))));
  return alt ? {id: alt, neg: true} : null;
}
const statFor = (line, src) => { const s = stat(line, src); return s && s.id; };
function rarity(){
  const c = counts();
  if(!CL.rare) return c.p + c.s ? 'Magic' : 'Normal';
  if(!c.p && !c.s) return 'Normal';
  return c.p <= 1 && c.s <= 1 && !S.m.some(e => e[0] === 'e' || e[0] === 'd') ? 'Magic' : 'Rare';
}
function tradeURL(){
  const stats = new Map();
  S.m.forEach(e => {
    const x = info(e); if(!x) return;
    for(const line of x.lines){
      const s = stat(line, e[0]);
      if(!s) continue;
      const r = rangeOf(line), min = r ? Math.round(r.lo * 100) / 100 * (s.neg ? -1 : 1) : null;
      const had = stats.get(s.id);
      if(had) had.min = had.min !== null && min !== null ? had.min + min : had.min ?? min;   // two runes with one stat add up
      else stats.set(s.id, {min, neg: s.neg});
    }
  });
  const q = {status: {option: 'online'}, type: B.n,
    filters: {type_filters: {filters: {rarity: {option: CL.rare ? 'rare' : 'nonunique'}}}}};
  if(stats.size) q.stats = [{type: 'and', filters: [...stats].map(([id, s]) => ({id, value: s.min === null ? {} : s.neg ? {max: s.min} : {min: s.min}, disabled: false}))}];
  if(S.m.some(e => e[0] === 'c')) q.filters.misc_filters = {filters: {corrupted: {option: 'true'}}};
  return searchURL((D.market && D.market.league) || 'Standard', {query: q, sort: {price: 'asc'}});
}
function itemLine(e, k){
  const x = info(e);
  if(!x) return '';
  const tag = e[0] === 'r' ? x.n : e[0] === 'e' ? x.from : e[0] === 'p' ? x.m[4] || SRC.p : SRC[e[0]];
  return '<li class="cr-il' + (x.ok ? '' : ' bad') + '"' + (x.ok ? '' : ' title="' + esc(x.why) + '"') + '>' +
    '<span class="cr-lines">' + x.lines.map(l => '<span' + (T && statFor(l, e[0]) === null ? ' class="nt" title="Not on the trade site"' : '') + '>' + esc(l) + '</span>').join('') + '</span>' +
    '<span class="cr-lmeta">' + (x.tier ? '<b>' + x.tier + '</b>' : '') + esc(tag) + (x.ok ? '' : ' · ' + esc(x.why)) + '</span>' +
    '<button type="button" class="linkbtn cr-rm" data-rm="' + k + '">Remove</button></li>';
}
function previewHTML(){
  const c = counts(), rar = rarity();
  const part = (title, pick) => {
    const rows = S.m.map((e, k) => [e, k]).filter(([e]) => { const x = info(e); return x && pick(x); });
    return rows.length ? '<h4 class="cr-h4">' + title + '</h4><ul class="cr-ls">' + rows.map(([e, k]) => itemLine(e, k)).join('') + '</ul>' : '';
  };
  const img = B.ic ? '<img src="' + esc(X.img + B.ic + '.webp') + '" alt="" loading="lazy" decoding="async">' : '';
  return '<article class="card detail cr-item r-' + rar.toLowerCase() + '">' +
    '<div class="card-hd"><span class="card-ic">' + img + '</span><div class="card-id"><h3>' + esc(B.n) + '</h3>' +
      '<p class="card-sub">' + rar + ' ' + esc(CL.n) + ' · item level ' + S.l + '</p></div></div>' +
    ((B.pr || []).length || (B.im || []).length ? '<ul class="card-ls cr-base-ls">' + [...(B.pr || []), ...(B.im || [])].map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' : '') +
    part('Corrupted', x => x.a === 'c') + part('Prefixes', x => x.a === 'p') + part('Suffixes', x => x.a === 's') + part('Sockets', x => x.a === 'r') +
    (S.m.length ? '' : '<p class="note">No mods yet. Add some from the list or by mechanic.</p>') +
    '<p class="cr-counts"><span>Prefixes <b>' + c.p + '/' + CL.mx[0] + '</b></span><span>Suffixes <b>' + c.s + '/' + CL.mx[1] + '</b></span>' +
      (CL.so ? '<span>Sockets <b>' + c.r + '/' + CL.so + '</b></span>' : '') + '</p>' +
    '<div class="tgo cr-go">' + (S.m.length ? '<button type="button" class="linkbtn" data-act="clear">Clear mods</button>' : '') +
      '<button type="button" class="btn" data-act="share">Copy link</button>' +
      '<a class="btn gold" target="_blank" rel="noopener" href="' + esc(tradeURL()) + '">Find on trade ↗</a></div>' +
    (T && S.m.some(e => { const x = info(e); return x && x.lines.some(l => statFor(l, e[0]) === null); }) ?
      '<p class="note">Grey lines are not on the trade site; the search skips them.</p>' : '') +
    '</article>';
}

/* ---------- base picker ---------- */
function matches(q){
  const ws = words(q);
  if(!ws.length) return [];
  const hit = s => ws.every(w => s.toLowerCase().includes(w));
  const out = [];
  for(const c of X.classes){
    if(hit(c.n + ' ' + c.g)) out.push({c: c.id, n: c.n, s: 'Any ' + c.n.toLowerCase() + ' · ' + c.b.length + ' bases', k: 0});
    for(const [n, dl] of c.b) if(hit(n + ' ' + c.n)) out.push({c: c.id, b: n, n, s: c.n + (dl > 1 ? ' · drops from level ' + dl : ''), k: 1});
  }
  const lead = ws.join(' ');
  return out.sort((a, b) => a.k - b.k || (b.n.toLowerCase().startsWith(lead) - a.n.toLowerCase().startsWith(lead))).slice(0, 12);
}
function pickerHTML(){
  return '<div class="cr-pick"><input class="field" type="search" data-k="find" placeholder="A kind or a base (e.g. boots, ring)" autocomplete="off" spellcheck="false" aria-label="Find a base">' +
    '<div class="tsearch-drop" role="listbox" hidden></div></div>';
}
function kindsHTML(){
  return GROUPS.map(g => {
    const list = X.classes.filter(c => c.g === g);
    return list.length ? '<div class="cr-kinds"><span class="lbl">' + g + '</span><div class="kinds cr-chips">' +
      list.map(c => '<button type="button" class="chip" data-class="' + c.id + '" aria-pressed="' + (S.c === c.id) + '">' + esc(c.n) + '</button>').join('') + '</div></div>' : '';
  }).join('');
}
function baseSelect(){
  const by = new Map();
  for(const b of P.bases){ const d = defName(b.d) || 'Bases'; (by.get(d) || by.set(d, []).get(d)).push(b); }
  const opt = b => '<option value="' + esc(b.n) + '"' + (b.n === B.n ? ' selected' : '') + '>' + esc(b.n) + (b.dl > 1 ? ' · level ' + b.dl : '') + '</option>';
  return '<select class="field" data-k="base" aria-label="Base">' + (by.size > 1 ? [...by].map(([d, list]) =>
    '<optgroup label="' + esc(d) + '">' + list.map(opt).join('') + '</optgroup>').join('') : P.bases.map(opt).join('')) + '</select>';
}
function baseCard(){
  const pills = [];
  if(B.rq){
    if(B.rq[0] > 1) pills.push('<span class="pill">Lv ' + B.rq[0] + '</span>');
    [['Str', 'r'], ['Dex', 'g'], ['Int', 'b']].forEach(([a, c], i) => { if(B.rq[i + 1]) pills.push('<span class="pill a-' + c + '">' + B.rq[i + 1] + ' ' + a + '</span>'); });
  }
  if(B.dl > 1) pills.push('<span class="pill">Drops from level ' + B.dl + '</span>');
  const it = {k: 'b', id: B.n, n: B.n, base: B.n, s: CL.n + (B.d ? ' · ' + defName(B.d) : ''),
    img: B.ic ? X.img + B.ic + '.webp' : '', ls: [...(B.pr || []), ...(B.im || [])]};
  if(!it.ls.length) delete it.ls;
  return card(it, {href: null, builds: false, price: null, kind: 'Base', full: true,
    extra: pills.length ? '<div class="card-req">' + pills.join('') + '</div>' : ''});
}

/* ---------- page ---------- */
export async function mount(el){
  EL = el;
  el.innerHTML = head() + '<p class="note">Loading…</p>';
  try {
    const r = await fetch('data/craft.json');
    if(!r.ok) throw new Error(r.status);
    X = await r.json();
  } catch(e){
    el.innerHTML = head() + '<p class="err">Could not load the crafting data. Try again in a minute.</p>';
    return {};
  }
  tradeData().then(t => { T = t; if(B) paint('item'); }).catch(() => {});
  wire();
  S = load();
  await draw();
  return {update};
}
function head(){
  return '<div class="pagehd"><h2>Craft</h2><p>Every mod a base can roll at its item level. Plan the item, then find it on trade.</p></div>';
}
async function update(){
  const s = load();
  if(JSON.stringify(s) !== JSON.stringify(S)){ S = s; await draw(); }
  else if(B && !/[?&]s=/.test(location.hash)) save();   // the Craft tab link: keep the plan in the address
}
async function draw(){
  CL = X.classes.find(c => c.id === S.c) || null;
  P = null; B = null;
  if(CL){
    try { P = await classData(CL.id); } catch { P = null; }
    if(P){
      B = P.bases.find(b => b.n === S.b) || P.bases[P.bases.length - 1];
      S.b = B.n;
      if(!S.l) S.l = X.ilvl;
    }
  }
  if(!B){ S = {...blank(), l: S.l}; CL = null; }
  else save();
  EL.innerHTML = head() +
    '<div class="panel cr-top">' + pickerHTML() + (B ? '' : kindsHTML()) + '<div class="cr-base" data-part="base"></div></div>' +
    (B ? '<div class="cr-main"><aside class="cr-prev" data-part="item"></aside>' +
      '<section class="panel cr-mech" data-part="mech"></section><section class="panel cr-pool" data-part="pool"></section></div>' : '');
  wirePicker();
  if(B){ paint('base'); paint('item'); paint('mech'); paint('pool'); }
}
function paint(part){
  const host = EL.querySelector('[data-part="' + part + '"]');
  if(!host || !B) return;
  if(part === 'base'){
    host.replaceChildren(baseCard());
    const ctl = document.createElement('div');
    ctl.className = 'cr-bctl';
    ctl.innerHTML = '<label class="cr-lab"><span class="lbl">Base</span>' + baseSelect() + '</label>' +
      '<label class="cr-lab"><span class="lbl">Item level</span>' + valHTML({k: 'ilvl', lo: 1, hi: X.ilvl, step: 1, v: S.l, heat: false},
        '<input class="field tnum" type="number" data-k="ilvl" min="1" max="' + X.ilvl + '" value="' + S.l + '" aria-label="Item level">') + '</label>' +
      '<div class="row"><button type="button" class="btn" data-act="kind">Other kind</button></div>';
    host.appendChild(ctl);
  }
  if(part === 'item') host.innerHTML = previewHTML();
  if(part === 'mech') host.innerHTML = mechHTML();
  if(part === 'pool') host.innerHTML = poolHTML();
}
function commit(){ save(); paint('item'); paint('mech'); paint('pool'); }

function wirePicker(){
  const host = EL.querySelector('.cr-pick');
  const inp = host.querySelector('input'), drop = host.querySelector('.tsearch-drop');
  let rows = [], sel = 0;
  const show = () => {
    drop.innerHTML = rows.length ? rows.map((r, i) => '<button type="button" class="tsearch-row" data-i="' + i + '" aria-selected="' + (i === sel) + '">' +
      '<span class="t"><b>' + esc(r.n) + '</b><span>' + esc(r.s) + '</span></span></button>').join('') : '<div class="tsearch-none">Nothing matches.</div>';
    drop.hidden = false;
  };
  const choose = r => { if(!r) return; drop.hidden = true; inp.value = ''; S = {...blank(), c: r.c, b: r.b || '', l: S.l || 0}; save(); draw(); };
  inp.addEventListener('input', () => { rows = matches(inp.value); sel = 0; if(inp.value.trim()) show(); else drop.hidden = true; });
  inp.addEventListener('keydown', e => {
    if(e.key === 'ArrowDown' && rows.length){ e.preventDefault(); sel = (sel + 1) % rows.length; show(); }
    else if(e.key === 'ArrowUp' && rows.length){ e.preventDefault(); sel = (sel - 1 + rows.length) % rows.length; show(); }
    else if(e.key === 'Enter'){ e.preventDefault(); choose(rows[sel]); }
    else if(e.key === 'Escape') drop.hidden = true;
  });
  drop.addEventListener('mousedown', e => e.preventDefault());
  drop.addEventListener('click', e => { const b = e.target.closest('.tsearch-row'); if(b) choose(rows[+b.dataset.i]); });
  inp.addEventListener('blur', () => setTimeout(() => drop.hidden = true, 120));
}

let raf = 0;
function wire(){
  EL.addEventListener('input', e => {
    const t = e.target, k = t.dataset.k;
    if(!k || !B) return;
    if(k === 'ilvl'){
      const v = Math.max(1, Math.min(X.ilvl, Math.round(+t.value) || 1));
      syncVal(t);
      if(v === S.l) return;
      S.l = v; save();
      clearTimeout(raf);
      raf = setTimeout(() => { paint('item'); paint('mech'); paint('pool'); }, 60);   // redraw once the slider rests a moment
    }
    if(k === 'tv'){
      const row = t.closest('.cr-fam'); if(!row) return;
      const v = parseFloat(t.value); if(isNaN(v)) return;
      V[row.dataset.kind + row.dataset.f] = v;
      syncVal(t);
      refreshRow(row);
    }
    if(k === 'q' || k === 'rq'){
      UI[k] = t.value;
      const pos = t.selectionStart;
      paint(k === 'q' ? 'pool' : 'mech');
      const again = EL.querySelector('[data-k="' + k + '"]');
      if(again){ again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
    }
  });
  EL.addEventListener('change', e => {
    const t = e.target;
    if(t.dataset.k === 'base' && P){ S.b = t.value; B = P.bases.find(b => b.n === t.value) || B; save(); paint('base'); commit(); }
  });
  EL.addEventListener('click', e => {
    const b = e.target.closest('button, a.btn.gold');
    if(!b || !EL.contains(b)) return;
    if(b.matches('a.btn.gold')) return;
    if(b.dataset.class){ S = {...blank(), c: b.dataset.class, l: S.l || 0}; save(); draw(); return; }
    if(!B) return;
    if(b.dataset.act === 'kind'){ S = {...blank(), l: S.l}; save(); draw(); EL.querySelector('.cr-pick input').focus(); return; }
    if(b.dataset.act === 'clear'){ S.m = []; commit(); return; }
    if(b.dataset.act === 'nofilter'){ UI.f = null; paint('mech'); paint('pool'); return; }
    if(b.dataset.act === 'share'){
      save();
      navigator.clipboard && navigator.clipboard.writeText(location.href).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy link', 1400); });
      return;
    }
    if(b.dataset.rm !== undefined){ S.m.splice(+b.dataset.rm, 1); commit(); return; }
    if(b.dataset.mech){ UI.mech = UI.mech === b.dataset.mech ? '' : b.dataset.mech; paint('mech'); return; }
    if(b.dataset.tag !== undefined){
      UI.tag = UI.tag === b.dataset.tag && b.closest('.cr-mech') ? '' : b.dataset.tag;
      paint('pool'); if(b.closest('.cr-mech')){ paint('mech'); jump(); }
      return;
    }
    if(b.dataset.rt !== undefined){ UI.rt = b.dataset.rt; paint('mech'); return; }
    if(b.dataset.orb){
      const orb = b.dataset.orb;
      if(b.dataset.only){
        const same = UI.f && UI.f.orb === orb && UI.f.only === b.dataset.only;
        UI.f = {...(UI.f && UI.f.orb === orb ? UI.f : {orb, n: orb, ml: 0}), only: same ? '' : b.dataset.only};
      } else {
        const same = UI.f && UI.f.n === b.dataset.v;
        UI.f = same ? null : {orb, n: b.dataset.v, ml: +b.dataset.ml || 0, only: UI.f && UI.f.orb === orb ? UI.f.only : ''};
      }
      paint('mech'); paint('pool'); if(UI.f) jump();
      return;
    }
    if(b.dataset.add){
      const src = b.dataset.add;
      if(src === 'r' || src === 'e'){ add(src, +b.dataset.i, b.dataset.from); return; }
      const row = b.closest('.cr-fam'); if(!row) return;
      const kind = row.dataset.kind, fam = families(kind).find(f => f.f === +row.dataset.f); if(!fam) return;
      const v = V[kind + fam.f];
      const best = fam.tiers.map(i => eligible(i, kind)).lastIndexOf(true);
      const k = v === undefined || fam.tiers.length < 2 ? Math.max(0, best) : pick(fam, v);
      add(src, fam.tiers[k]);
    }
  });
}
function jump(){
  const pool = EL.querySelector('.cr-pool');
  if(pool && pool.getBoundingClientRect().top > innerHeight * 0.6) pool.scrollIntoView({behavior: 'smooth', block: 'start'});
}
/* a tier moved: only the Add button's state and the tier's weight change */
function refreshRow(row){
  const kind = row.dataset.kind, fam = families(kind).find(f => f.f === +row.dataset.f);
  if(!fam) return;
  const k = pick(fam, V[kind + fam.f]);
  const i = fam.tiers[k], ok = eligible(i, kind), r = check(kind || 'p', i);
  const btn = row.querySelector('.cr-add');
  btn.disabled = !(ok && r.ok);
  btn.title = ok ? (r.why || '') : P.mods[i][2] > S.l ? 'Needs item level ' + P.mods[i][2] : 'Below this orb’s level';
  const w = row.querySelector('.cr-fw');
  if(w && kind === '') w.outerHTML = tierWeightHTML(fam, k, ok);
}
