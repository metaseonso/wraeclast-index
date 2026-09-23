/* Craft tab: two questions about one item.
   "What can this base roll" — pick a base, see every mod it can roll at its item level and how often each one
   rolls, add mods by hand or by mechanic (essences, runes and soul cores, desecration, corruption), then find
   the item on trade. "How do I get this mod" — the same thing asked the other way round: name the modifier and
   the page answers which kinds of item carry it, what guarantees it, what can add one and what each costs today.
   Either way the bench is one button away with the item already in hand (assets/craftsim.js: it is a card, so
   it opens on the trail and Back is this page with the plan where it was).
   Game data: data/craft.json and data/craft/<kind>.json (tools/craft.py: the game files via RePoE; essence tables
   and orb levels checked on poe2db), and data/craftmods.json for the second question (tools/craftmods.py, turned
   out of those same files). Prices and icons: data/market.json (Currency Exchange hourly, trade listings over the day).
   The weights are the one thing here the game does not publish: they come from Craft of Exile (tools/craftweights.py)
   and the page names them wherever one is shown. One mod's share of its own pool only — never the odds of a whole item.
   The plan (base, item level, mods) and the question live in the address, in the page's own words, so it can be shared.
   Every name on this tab — orbs, essences, bones, catalysts, omens, runes, soul cores — opens the card the
   site already has for it (assets/kinds.js says what a card carries; nothing here draws one). */
import { D, $, esc, card, moneyHTML, params, openDetail, hrefOf } from './app.js';
import { tradeData, key, searchURL, valHTML, syncVal } from './trade.js';
import { table } from './basepool.js';

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
let ASK = 'base';   // which of the two questions is being asked: 'base' or 'mod'
const FILES = new Map();
const UI = {q: '', tag: '', mech: '', f: null, rq: '', rt: ''};   // page filters (not in the address)
const V = {};   // slider values per family, while picking a tier

/* ---------- state in the address ----------
   The plan is in the address in the words the page itself uses, so a link reads as the item it makes:
     #/craft?base=Vaal+Cuirass&ilvl=80&mods=t2-life-regeneration-per-second,essence-of-the-body,iron-rune
   A mod is its tier and its own line. Where it does not come from a roll the word for where it does comes
   first (desecrated, corrupted), and where two mods read alike the side tells them apart (prefix, suffix).
   An essence or a rune is its own name. A base belongs to one kind, so the kind is only in a link that has
   no base yet. The second question carries the same words, plus which question is being asked:
     #/craft?ask=mod&find=fire+res&mod=fire-resistance&base=Gold+Ring&ilvl=80
   Links made before this shape carry the plan packed into "s=" and still open (packed). */
const enc = s => encodeURIComponent(s).replace(/%20/g, '+');
const slug = s => String(s).toLowerCase().replace(/[#%+]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').replace(/^to-/, '');
const SRCW = {d: 'desecrated', c: 'corrupted'};   // where a mod comes from, where that is not a roll
const SIDEW = {p: 'prefix', s: 'suffix'};
const poolList = kind => { const p = P.pools[B.p]; return kind === 'd' ? p.d : kind === 'c' ? p.c : p.m; };
const famSlug = f => slug(P.fam[f][1].join(' '));
function modToken(src, i){
  const m = P.mods[i], mine = famSlug(m[1]);
  const twin = poolList(src).some(j => P.mods[j][1] !== m[1] && famSlug(P.mods[j][1]) === mine);
  return [SRCW[src], twin ? SIDEW[P.fam[m[1]][0]] : '', tierOfMod(i).toLowerCase(), mine].filter(Boolean).join('-');
}
function tokenOf(e){
  if(e[0] === 'r') return slug(e[1]);
  if(e[0] === 'e') return slug(e[2] || '');
  const i = P.at.get(e[1]);
  return i === undefined ? '' : modToken(e[0], i);
}
/* and back: the same words read as the mod they name. Nothing here carries it: the mod is left out. */
function entryOf(tok){
  let s = tok, src = '';
  for(const k in SRCW) if(s.startsWith(SRCW[k] + '-')){ src = k; s = s.slice(SRCW[k].length + 1); }
  if(!src){
    const es = P.ess.find(([n]) => slug(n) === s);
    if(es) return ['e', P.mods[es[2]][0], es[0]];
    const au = P.aug.find(a => slug(a[0]) === s);
    if(au) return ['r', au[0]];
    src = 'p';
  }
  let side = '';
  for(const k in SIDEW) if(s.startsWith(SIDEW[k] + '-')){ side = k; s = s.slice(SIDEW[k].length + 1); }
  const t = s.match(/^t(\d+)-/);
  const tier = t ? 'T' + t[1] : '';
  if(t) s = s.slice(t[0].length);
  for(const i of poolList(src)){
    const m = P.mods[i];
    if(famSlug(m[1]) === s && (!side || P.fam[m[1]][0] === side) && tierOfMod(i) === tier) return [src, m[0]];
  }
  return null;
}
/* the plan a link names: the kind it is on, and the mods as words, read once the base's own file is in */
function linked(){
  const q = params(), base = q.get('base'), kind = (q.get('kind') || '').toLowerCase();
  if(!base && !kind) return null;
  const cl = base ? X.classes.find(c => c.b.some(b => b[0] === base))
    : X.classes.find(c => c.n.toLowerCase() === kind || c.id === kind);
  if(!cl) return null;
  return {c: cl.id, b: base || '', l: Math.max(0, Math.min(X.ilvl, Math.round(+q.get('ilvl')) || 0)), m: [],
    t: (q.get('mods') || '').split(',').filter(Boolean)};
}
function packed(){   // a link made before the plan was in words
  const m = location.hash.match(/[?&]s=([^&]+)/);
  if(!m) return null;
  try { return {...blank(), ...JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))))}; } catch { return null; }
}
function stored(){
  try { const x = localStorage.getItem('wi.craft'); if(x) return {...blank(), ...JSON.parse(x)}; } catch {}
  return null;
}
function load(){
  const q = params();
  ASK = q.get('ask') === 'mod' || q.get('mod') ? 'mod' : 'base';
  if(ASK === 'mod'){ MOD.q = q.get('find') || ''; MOD.key = q.get('mod') || ''; MOD.open = false; }
  return linked() || packed() || stored() || blank();
}
let HREF = '';   // the address this page last wrote, so a link from anywhere else is told apart from our own
function save(){
  const q = [];
  if(ASK === 'mod'){
    q.push('ask=mod');
    if(MOD.q.trim()) q.push('find=' + enc(MOD.q.trim()));
    if(MOD.key) q.push('mod=' + MOD.key);
  }
  if(S.b) q.push('base=' + enc(S.b));
  q.push('ilvl=' + S.l);
  const mods = S.m.map(tokenOf).filter(Boolean);
  if(mods.length) q.push('mods=' + mods.join(','));
  HREF = '#/craft?' + q.join('&');
  history.replaceState(history.state, '', HREF);
  try { localStorage.setItem('wi.craft', JSON.stringify({c: S.c, b: S.b, l: S.l, m: S.m})); } catch {}
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
/* ---------- the card behind a name ----------
   Nothing on this tab is a dead end: every orb, essence, bone, catalyst, omen, rune and soul core opens the
   card the rest of the site opens for it, drawn by the card layer from the index's own row. A name the index
   does not carry stays plain text. */
let NAMED = null;
function cardOf(n){
  if(!NAMED){
    NAMED = new Map();
    const rank = {c: 0, u: 1, g: 2, a: 3};   // all of these are things you use on an item: the currency card wins
    for(const it of (D.index && D.index.items) || []){
      const had = NAMED.get(it.n);
      if(!had || (rank[it.k] ?? 9) < (rank[had.k] ?? 9)) NAMED.set(it.n, it);
    }
  }
  return (n && NAMED.get(n)) || null;
}
function openCard(n){
  const it = cardOf(n);
  if(it) openDetail(it, {}, hrefOf(it));
}
/* a row: the icon and the words, then whatever button the row carries, then why that button is off. The
   words open the card; the reason is its own line on the row, outside the words, so it is read, not tapped. */
function rowHTML(n, body, act = '', why = ''){
  const inner = icon(n) + '<span class="cr-rt">' + body + '</span>';
  return '<div class="cr-row">' + (cardOf(n)
    ? '<button type="button" class="cr-open" data-card="' + esc(n) + '">' + inner + '</button>' : inner) +
    act + (why ? whyHTML(why) : '') + '</div>';
}
/* a chip that names something else: the chip keeps its own job, and the card is one tap beside it */
function chipPair(chip, n){
  return cardOf(n) ? '<span class="cr-pair">' + chip + '<button type="button" class="cr-card" data-card="' + esc(n) +
    '" aria-label="' + esc(n) + ' card">Card</button></span>' : chip;
}
/* why something cannot go on: what is blocking it, then what would take the block away. Short, and both. */
const needLvl = lv => 'Needs item level ' + lv + ' · raise the item level';
const orbLow = () => 'This orb only adds mods from level ' + (UI.f ? UI.f.ml : 0) + ' · clear the orb';
const whyHTML = w => '<span class="cr-why">' + esc(w || '') + '</span>';
const defName = d => d ? d.split('+').map(x => DEF[x]).join(' + ') : '';
const words = q => q.trim().toLowerCase().split(/\s+/).filter(Boolean);

/* families of the current base: kind '' rolls, 'd' desecrated, 'c' corruption. Tiers low to high (T1 is the last). */
function families(kind){
  const list = poolList(kind), by = new Map();
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
  const why = !rolls ? 'This base cannot roll it' : src !== 'e' && m[2] > S.l ? needLvl(m[2]) : '';
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
    return c.r < CL.so ? {ok: true}
      : {ok: false, why: CL.so ? 'Sockets full · remove a rune to add this' : 'No sockets on this item'};
  }
  const m = P.mods[i], f = P.fam[m[1]];
  if(src === 'c'){
    const at = S.m.findIndex(e => e[0] === 'c');
    return {ok: true, replace: at >= 0 ? at : undefined};
  }
  let c = counts();
  const same = c.fam.get(m[1]);
  if(same !== undefined) c = counts(same);
  if(src !== 'e' && m[2] > S.l) return {ok: false, why: needLvl(m[2])};
  if(f[3].some(g => c.g.has(g))) return {ok: false, why: 'A mod of this group is on the item · remove it to add this'};
  const max = CL.mx[f[0] === 'p' ? 0 : 1];
  if(c[f[0]] >= max) return {ok: false, why: (f[0] === 'p' ? 'Prefixes' : 'Suffixes') + ' full · remove one to add this'};
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
  const why = !lvlOk ? (P.mods[f.tiers[k]][2] > S.l ? needLvl(P.mods[f.tiers[k]][2]) : orbLow()) : r.why;
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
      '<button type="button" class="btn cr-add" data-add="' + (kind || 'p') + '"' + (lvlOk && r.ok ? '' : ' disabled') + '>' +
      (onItem !== undefined ? 'Change' : 'Add') + '</button>' + whyHTML(lvlOk && r.ok ? '' : why) + '</div></div>';
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
  return rowHTML(o.n, '<b>' + esc(o.n) + '</b>' + px(o.n) + '<span class="cr-rs">' + esc(o.t) + '</span>',
    filter && o.only ? '<button type="button" class="btn cr-use" data-only="' + o.only + '" data-orb="' + esc(o.orb) + '" aria-pressed="' +
      !!(UI.f && UI.f.orb === o.orb && UI.f.only === o.only) + '">' + (o.only === 'p' ? 'Prefixes only' : 'Suffixes only') + '</button>' : '');
}
function orbsHTML(){
  return X.orbs.filter(o => o.n !== "Artificer's Orb" || CL.so).map(o => {
    const adds = ADDS.includes(o.n);
    const vers = adds ? [[o.n, 0], ...(o.up || [])] : [];
    const on = n => UI.f && UI.f.n === n;
    return '<div class="cr-orb">' +
      rowHTML(o.n, '<b>' + esc(o.n) + '</b>' + px(o.n) + '<span class="cr-rs">' + esc(o.t) +
        (o.n === "Artificer's Orb" ? ' · up to ' + CL.so + ' on this item' : '') + '</span>') +
      (vers.length ? '<div class="cr-vers">' + vers.map(([n, ml]) => {
        const chip = '<button type="button" class="chip" data-orb="' + esc(o.n) + '" data-v="' + esc(n) + '" data-ml="' + ml + '" aria-pressed="' + on(n) + '">' +
          esc(n === o.n ? n : n.split(' ')[0] + ' · level ' + ml + '+') + (n !== o.n ? px(n) : '') + '</button>';
        return n === o.n ? chip : chipPair(chip, n);   // the orb's own chip: its card is on the row above
      }).join('') +
        omensFor(o.n).filter(x => x.only).sort((a, b) => a.only > b.only ? 1 : -1).map(x => chipPair('<button type="button" class="chip" data-only="' + x.only + '" data-orb="' + esc(o.n) +
          '" aria-pressed="' + !!(UI.f && UI.f.orb === o.n && UI.f.only === x.only) + '" title="' + esc(x.n) + '">' +
          (x.only === 'p' ? 'Prefixes only' : 'Suffixes only') + px(x.n) + '</button>', x.n)).join('') + '</div>' : '') + '</div>';
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
      return rowHTML(r.n, '<b>' + esc(r.n) + '</b>' + px(r.n) +
        '<span class="cr-ml">' + r.m[3].map(esc).join('<br>') + '</span>' +
        '<span class="cr-rs">' + (f[0] === 'p' ? 'Prefix' : 'Suffix') + (tier ? ' · ' + tier : '') + (r.lvl ? ' · level ' + r.lvl : '') + '</span>',
        '<button type="button" class="btn cr-add" data-add="e" data-i="' + r.i + '" data-from="' + esc(r.n) + '"' +
        (c.ok ? '' : ' disabled') + '>' + (c.replace !== undefined ? 'Change' : 'Add') + '</button>', c.ok ? '' : c.why);
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
    '<div class="cr-list">' + list.map(({a, i}) => rowHTML(a[0], '<b>' + esc(a[0]) + '</b>' + px(a[0]) +
      '<span class="cr-ml">' + a[3].map(esc).join('<br>') + '</span>' +
      (a[4].length ? '<span class="cr-rs">Bonded: ' + a[4].map(esc).join(' · ') + '</span>' : '') +
      '<span class="cr-rs">' + esc(a[1]) + (a[2] ? ' · level ' + a[2] : '') + (a[5] ? ' · limited to ' + esc(a[5]) : '') + '</span>',
      '<button type="button" class="btn cr-add" data-add="r" data-i="' + i + '"' + (c.ok ? '' : ' disabled') + '>Add</button>',
      c.ok ? '' : c.why)).join('') +
    (list.length ? '' : '<p class="note">Nothing matches.</p>') + '</div>';
}
function desHTML(){
  const bones = X.bones.filter(b => b.on.includes(CL.id));
  const fams = families('d');
  return '<div class="cr-list">' + bones.map(b => rowHTML(b.n, '<b>' + esc(b.n) + '</b>' + px(b.n) +
      '<span class="cr-rs">' + esc(b.t) + (b.mi ? ' · item level ' + b.mi + ' or less' : '') + (b.ml ? ' · mods level ' + b.ml + '+' : '') + '</span>')).join('') +
    omensFor('Desecrate').map(o => omenRow(o)).join('') + '</div>' +
    (X.wsrc ? '<p class="note">No weights here: what is measured is the pool an orb rolls from, not what a bone adds.</p>' : '') +
    ['p', 's'].map(a => {
      const list = fams.filter(f => f.fam[0] === a);
      return list.length ? '<h4 class="cr-h4">' + (a === 'p' ? 'Prefixes' : 'Suffixes') + '</h4><div class="cr-fams">' + list.map(f => famHTML(f, 'd')).join('') + '</div>' : '';
    }).join('');
}
function corHTML(){
  return '<div class="cr-list">' + ['Vaal Orb'].map(n => { const o = X.orbs.find(x => x.n === n) || {n, t: ''};
      return rowHTML(n, '<b>' + esc(n) + '</b>' + px(n) + '<span class="cr-rs">' + esc(o.t) + '</span>'); }).join('') +
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
    return rowHTML(c.n, '<b>' + esc(c.n) + '</b>' + px(c.n) + '<span class="cr-rs">' + esc(c.t) + ' · ' + n + ' here</span>',
      n ? '<button type="button" class="btn cr-use" data-tag="' + esc(c.tag) + '" aria-pressed="' + (UI.tag === c.tag) + '">Show</button>' : '');
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
/* "Weights: Craft of Exile", where they come from and when they were pulled. Name the source, nothing more. */
function wsrcHTML(){
  const s = X.wsrc;
  if(!s) return '';
  return 'Weights: <a href="' + esc(s.u) + '" target="_blank" rel="noopener">' + esc(s.n) + '</a> — ' + esc(s.how) +
    '. Pulled ' + esc(nice(s.d)) + (s.p ? ' for their patch ' + esc(s.p) : '') + '.';
}
/* What is narrowing the pool right now, at the head of the table and pinned there while the table scrolls:
   the orb's level, the side it holds to, the filter box, the tag. Each one comes off with a tap. An orb that
   adds from level 1 and holds to neither side takes nothing out of the pool, so it is not listed here. */
function narrowHTML(){
  const bits = [];
  if(UI.f && UI.f.ml) bits.push(['orb', UI.f.n + ' · mods level ' + UI.f.ml + '+']);
  if(UI.f && UI.f.only) bits.push(['only', UI.f.only === 'p' ? 'Prefixes only' : 'Suffixes only']);
  if(UI.q.trim()) bits.push(['q', 'Filter: ' + UI.q.trim()]);
  if(UI.tag) bits.push(['tag', (TAGS.find(t => t[0] === UI.tag) || [0, UI.tag])[1]]);
  if(!bits.length) return '';
  return '<p class="cr-fnote"><span class="cr-flab">Narrowed by</span>' + bits.map(([k, l]) =>
    '<button type="button" class="cr-foff" data-off="' + k + '" aria-label="Clear ' + esc(l) + '">' + esc(l) +
    '<i aria-hidden="true">✕</i></button>').join('') + '</p>';
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
    '<div class="cr-bar"><input class="field" type="search" data-k="q" placeholder="Filter mods (e.g. life, fire res)" value="' + esc(UI.q) + '" autocomplete="off">' +
    '<div class="kinds cr-chips" role="group" aria-label="Tags">' + [['', 'All'], ...tags].map(([t, l]) =>
      '<button type="button" class="chip" data-tag="' + t + '" aria-pressed="' + (UI.tag === t) + '">' + l + '</button>').join('') + '</div></div>' +
    '<p class="note">T1 is the best roll. Drag to pick a tier, then Add. Grey tiers need a higher item level.</p>' +
    (TOT ? '<p class="note">Likeliest first. Shares are out of what this item level can roll on that side — prefixes against prefixes, ' +
      'suffixes against suffixes. One mod at a time, not the odds for a whole item. ' +
      (someUnweighted() ? 'Mods they have no number for sit at the bottom, outside the shares. ' : '') + wsrcHTML() + '</p>'
      : '<p class="note">No roll chances for this kind: the game files say which mods a base can roll at an item level, not how often each ' +
      'one comes up, and ' + (X.wsrc ? esc(X.wsrc.n) + ' has no measured weights for it either.' : 'nothing measured is published for it.') + '</p>') +
    '<div class="cr-tbl">' + narrowHTML() +
    '<div class="cr-cols">' + (only !== 's' ? col('p') : '') + (only !== 'p' ? col('s') : '') + '</div></div>';
}

/* ---------- the second question: how do I get this mod ----------
   The pool above is asked with the base in hand. This one is asked the other way round — the modifier is
   known and the item is not — so it reads the one table that holds every modifier in the game and the kinds
   of item it lands on: data/craftmods.json (tools/craftmods.py, turned out of the same item class files this
   page already reads). It is fetched the first time the question is asked and never in first paint.
   Picking a kind of item here picks the page's own item, so the two questions are two questions about one
   item: what is found here is already on the other screen, in the plan, and on the way to the bench. */
let MX = null;      // data/craftmods.json, once
let ENG = null;     // the bench's own rules, for the one fact needed here: which omens the game has taken out
const MOD = {q: '', tag: '', key: '', open: false};
const HITS = 40;    // rows drawn before the rest is a count
const SIDE = {p: 'Prefix', s: 'Suffix', '': 'Implicit'};
const KINDW = {d: 'A desecration adds it', c: 'A corruption adds it'};

async function modData(){
  if(MX) return MX;
  const d = await table('data/craftmods.json');
  if(!d || !d.m) return null;
  const rows = d.m.map(([side, lines, tags, kind, cls]) => ({side, lines, tags, kind, cls,
    words: (lines.join(' ') + ' ' + tags.join(' ')).toLowerCase(), s: slug(lines.join(' '))}));
  // two modifiers that read alike are told apart in the address the way a mod in the plan already is: where
  // it comes from first, then the side
  for(const r of rows){
    const twin = rows.some(o => o !== r && o.s === r.s && o.kind === r.kind);
    r.id = [SRCW[r.kind], twin ? SIDEW[r.side] : '', r.s].filter(Boolean).join('-');
  }
  MX = {cl: d.cl, rows};
  try { ENG = await import('./engine.js'); } catch { ENG = null; }
  return MX;
}
const modOf = id => (MX && MX.rows.find(r => r.id === id)) || null;
const sameFam = (fam, r) => !!fam && fam[0] === r.side && fam[1].join('\n') === r.lines.join('\n');
const famHere = r => P && B ? families(r.kind).find(f => sameFam(f.fam, r)) || null : null;
const essFor = f => (P.ess || []).map(([n, k, i, lvl]) => ({n, k, i, lvl})).filter(e => P.mods[e.i][1] === f.f);

/* The hits: every modifier whose own words or tags carry what was typed, in the thinnest row the page has —
   the line, which side it is and what can carry it, and the modifier itself one tap away.
   Order: the line that reads the way it was typed first, then the ones that roll before the ones only a
   desecration or a corruption adds, then the ones the most kinds of item carry. Nothing is ordered by how
   good a modifier is — that is the player's call, not ours. */
const hitRank = (r, lead) => (r.kind ? 2 : 0) + (lead && r.words.includes(lead) ? 0 : 1);
function modHits(){
  const q = words(MOD.q), lead = q.join(' ');
  return MX.rows.filter(r => (!MOD.tag || r.tags.includes(MOD.tag)) && q.every(w => r.words.includes(w)))
    .sort((a, z) => hitRank(a, lead) - hitRank(z, lead) || z.cls.length - a.cls.length ||
      (a.lines[0] > z.lines[0] ? 1 : a.lines[0] < z.lines[0] ? -1 : 0));
}
function findBarHTML(){
  const tags = TAGS.filter(([t]) => MX.rows.some(r => r.tags.includes(t)));
  return '<div class="cr-bar"><input class="field" type="search" data-k="find" value="' + esc(MOD.q) +
    '" placeholder="Fire res, attack speed, minion damage…" autocomplete="off" aria-label="Find a modifier">' +
    '<div class="kinds cr-chips" role="group" aria-label="Tags">' + [['', 'All'], ...tags].map(([t, l]) =>
      '<button type="button" class="chip" data-mtag="' + t + '" aria-pressed="' + (MOD.tag === t) + '">' + l + '</button>').join('') +
    '</div></div>';
}
function hitHTML(r){
  const n = r.cls.length;
  const bits = [SIDE[r.side], KINDW[r.kind] || '', n + (n === 1 ? ' kind of item' : ' kinds of item'),
    r.cls.some(c => c[2]) ? 'an essence guarantees it' : ''].filter(Boolean);
  return '<button type="button" class="cr-tr" data-mod="' + esc(r.id) + '" aria-pressed="' + (MOD.key === r.id) + '">' +
    '<span class="cr-tl">' + r.lines.map(esc).join('<br>') + '</span>' +
    '<span class="cr-tm">' + esc(bits.join(' · ')) + '</span></button>';
}
function hitsHTML(){
  const list = modHits(), narrowed = !!(MOD.q.trim() || MOD.tag);
  const shown = MOD.open ? list : list.slice(0, HITS);
  return '<h3 class="cr-h">Modifiers <span class="note">' + list.length + (narrowed ? ' match' : ' in the game') + '</span></h3>' +
    (list.length ? '<div class="cr-thin">' + shown.map(hitHTML).join('') + '</div>' +
      (shown.length < list.length ? '<button type="button" class="linkbtn cr-more" data-more="hits">+' +
        (list.length - shown.length) + ' more</button>' : '')
      : '<p class="note">Nothing matches. Try one word off the line itself — life, fire, attack speed.</p>');
}

/* the answer: which kinds of item can carry it, then the modifier on the one you are on — its tiers, its
   weight and its share of that side at this item level, drawn by the same row the pool draws */
function answerHTML(){
  const r = modOf(MOD.key);
  if(!r) return '<p class="note">No modifier selected.</p>';
  const on = r.cls.map(([i, lvl]) => ({cl: X.classes.find(c => c.id === MX.cl[i]), lvl})).filter(x => x.cl);
  const here = CL && B && on.some(x => x.cl.id === CL.id);
  return '<div class="cr-ahd"><h3 class="cr-h">' + r.lines.map(esc).join('<br>') + '</h3>' +
    '<p class="note">' + esc([SIDE[r.side], KINDW[r.kind] || ''].filter(Boolean).join(' · ')) + '</p>' +
    '<button type="button" class="linkbtn cr-back" data-mod="">Every modifier</button></div>' +
    '<h4 class="cr-h4">What can carry it <span>' + on.length + '</span></h4>' +
    '<div class="kinds cr-chips" role="group" aria-label="Kinds of item">' + on.map(x =>
      '<button type="button" class="chip" data-class="' + x.cl.id + '" aria-pressed="' + (CL && x.cl.id === CL.id) + '">' +
      esc(x.cl.n + (x.lvl > 1 ? ' · level ' + x.lvl + '+' : '')) + '</button>').join('') + '</div>' +
    (here ? onItemHTML(r) : '<p class="note">Select a kind of item. Tiers and weights are the item’s own.</p>');
}
/* A kind of item with 294 bases has a handful of pools, and the pool is what decides whether the modifier is
   in it at all — so the bases are offered as their pools, by the defences they come in, and picking one picks
   a base of it. A kind with one pool has nothing to pick. */
function poolsWith(r){
  const out = [];
  P.pools.forEach((pool, i) => {
    const list = r.kind === 'd' ? pool.d : r.kind === 'c' ? pool.c : pool.m;
    if(!(list || []).some(j => sameFam(P.fam[P.mods[j][1]], r))) return;
    const bases = P.bases.filter(b => b.p === i);
    if(bases.length) out.push({i, bases, n: defName(bases[0].d) || 'No defences'});
  });
  return out;
}
/* picking a kind of item on this screen lands on a base that can actually roll the modifier: a kind with
   several pools has bases that can and bases that cannot, and one that cannot is no answer. Picking a base
   by hand is left alone — that one is the player's. */
function fitBase(){
  const r = modOf(MOD.key);
  if(!r || !P || !B || famHere(r)) return;
  const pools = poolsWith(r);
  const nb = pools.length && pools[0].bases[pools[0].bases.length - 1];
  if(nb){ B = nb; S.b = nb.n; }
}
function poolChipsHTML(pools){
  const all = pools.reduce((a, p) => a + p.bases.length, 0);
  return '<h4 class="cr-h4">Bases that roll it <span>' + all + '</span></h4>' +
    '<div class="kinds cr-chips" role="group" aria-label="Bases that roll it">' + pools.map(p =>
      '<button type="button" class="chip" data-pool="' + p.i + '" aria-pressed="' + (B.p === p.i) + '">' +
      esc(p.n + ' · ' + p.bases.length) + '</button>').join('') + '</div>';
}
function onItemHTML(r){
  TOT = totals();
  const pools = poolsWith(r), f = famHere(r);
  return '<div class="cr-bctl cr-onitem"><label class="cr-lab"><span class="lbl">Base</span>' + baseSelect() + '</label>' +
    '<label class="cr-lab"><span class="lbl">Item level</span>' + ilvlHTML() + '</label></div>' +
    (pools.length && (pools.length > 1 || !f) ? poolChipsHTML(pools) : '') +
    (f ? '<h4 class="cr-h4">On this base</h4><div class="cr-fams">' + famHTML(f, r.kind) + '</div>' + shareNote(r)
      : '<p class="note">' + (pools.length ? 'This base does not roll it. Pick one of the bases above.'
        : 'No base of this kind rolls it.') + '</p>');
}
/* what the share on the row is a share of, and who measured it — the same words the pool uses, because it is
   the same number: one mod's share of its own side at this item level, never the odds for a whole item */
function shareNote(r){
  if(r.kind) return '<p class="note">No share here: what is measured is the pool an orb rolls from, not what a ' +
    (r.kind === 'd' ? 'bone adds' : 'Vaal Orb adds') + '.</p>';
  if(!TOT) return '<p class="note">No roll chances for this kind: the game files say which mods a base can roll at an ' +
    'item level, not how often each one comes up, and ' +
    (X.wsrc ? esc(X.wsrc.n) + ' has no measured weights for it either.' : 'nothing measured is published for it.') + '</p>';
  return '<p class="note">Its share is out of what this item level can roll on that side — ' +
    (r.side === 'p' ? 'prefixes against prefixes' : 'suffixes against suffixes') +
    ', one mod at a time, never the odds for a whole item. ' + wsrcHTML() + '</p>';
}

/* ---------- the right rail: how to get it ----------
   What guarantees the modifier, what holds a roll to its side, and what can add one at all — each with what it
   costs right now, from the in-game Currency Exchange and live trade listings (data/market.json). A currency
   the market does not price today carries no price rather than a made-up one, and nothing here is a cost to hit. */
function railHead(on, with_){
  return '<h3 class="cr-h">How to get it' + (on ? ' <span class="note">' + esc(B.n) + ' · item level ' + S.l + '</span>' : '') + '</h3>' +
    (on ? '<div class="tgo cr-go"><button type="button" class="btn gold" data-act="bench"' +
      (with_.length ? ' data-with="' + esc(with_.join('|')) + '"' : '') + '>Practise at the bench →</button></div>' : '');
}
/* What the Practise button hands the bench: everything this rail has just named and nothing else. The orbs
   go too, because an essence works on a Magic item and a bone on a Rare one — getting the item there is the
   orbs' job, and the game's own lines say so. Each pick comes off the bench in one tap. */
function railWith(r, ess){
  const orbs = addOrbs().map(o => o.n);
  if(r.kind === 'd') return [...X.bones.filter(b => b.on.includes(CL.id)).map(b => b.n), ...orbs];
  if(r.kind === 'c') return ['Vaal Orb', ...orbs];
  return [...ess.map(e => e.n), ...orbs];
}
/* adding a mod from this screen is not a silent act: what the plan holds now, and the way to the other question */
function planNote(){
  const c = counts();
  if(!S.m.length) return '';
  return '<p class="note">On the item: ' + c.p + ' of ' + CL.mx[0] + ' prefixes, ' + c.s + ' of ' + CL.mx[1] +
    ' suffixes · <button type="button" class="linkbtn" data-ask="base">what this base can roll</button></p>';
}
function guaranteeHTML(ess){
  if(!ess.length) return '<h4 class="cr-h4">What guarantees it</h4><p class="note">Nothing guarantees it on a ' +
    esc(CL.n.toLowerCase()) + ': it has to be rolled.</p>';
  return '<h4 class="cr-h4">What guarantees it <span>' + ess.length + '</span></h4><div class="cr-list">' +
    ess.map(e => rowHTML(e.n, '<b>' + esc(e.n) + '</b>' + px(e.n) + '<span class="cr-rs">' +
      (e.k === 'm' ? 'On a magic item: makes it rare and puts this on' : 'On a rare item: replaces a random mod with this') +
      (e.lvl ? ' · level ' + e.lvl : '') + '</span>',
      '<button type="button" class="btn" data-act="bench" data-with="' + esc(e.n) + '">Practise</button>')).join('') + '</div>';
}
/* An omen rides on the next use of one currency and holds that use to one side. Only the ones the game still
   has: which of them it has taken out is the bench's own table (assets/engine.js) and is never copied here. */
function omenSideHTML(r){
  if(!r.side) return '';
  const on = r.kind === 'd' ? ['Desecrate'] : ADDS;
  const list = X.omens.filter(o => o.only === r.side && on.includes(o.orb) && !(ENG && ENG.LEGACY[o.n]));
  if(!list.length) return '';
  return '<h4 class="cr-h4">Holds it to ' + (r.side === 'p' ? 'prefixes' : 'suffixes') + ' <span>' + list.length +
    '</span></h4><div class="cr-list">' + list.map(o => rowHTML(o.n, '<b>' + esc(o.n) + '</b>' + px(o.n) +
      '<span class="cr-rs">' + esc(o.t) + ' · rides on ' + esc(o.orb) + '</span>')).join('') + '</div>';
}
// an item that cannot be Rare never takes the orbs whose own line says "Rare item", so they are not offered
const addOrbs = () => X.orbs.filter(o => ADDS.includes(o.n) && (CL.rare || !/\bRare item\b/.test(o.t)));
/* what can add one at all: the orbs that add a modifier, and the Greater and Perfect ones that will not go
   below a modifier level — drawn where a tier of this modifier is inside their reach at this item level */
function addsHTML(r, f){
  if(r.kind === 'd') return boneHTML();
  if(r.kind === 'c') return vaalHTML();
  const list = addOrbs();
  return '<h4 class="cr-h4">What can add one <span>' + list.length + '</span></h4><div class="cr-list">' +
    list.map(o => {
      const up = (o.up || []).filter(([, ml]) => f && f.tiers.some(i => P.mods[i][2] >= ml && eligible(i, '')));
      return '<div class="cr-orb">' + rowHTML(o.n, '<b>' + esc(o.n) + '</b>' + px(o.n) +
        '<span class="cr-rs">' + esc(o.t) + '</span>') +
        (up.length ? '<div class="cr-vers">' + up.map(([n, ml]) => chipPair('<button type="button" class="chip" data-card="' +
          esc(n) + '">' + esc(n.split(' ')[0] + ' · nothing below level ' + ml) + px(n) + '</button>', n)).join('') + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
}
function boneHTML(){
  const bones = X.bones.filter(b => b.on.includes(CL.id));
  return '<h4 class="cr-h4">What can add one <span>' + bones.length + '</span></h4><div class="cr-list">' +
    bones.map(b => rowHTML(b.n, '<b>' + esc(b.n) + '</b>' + px(b.n) + '<span class="cr-rs">' + esc(b.t) +
      (b.mi ? ' · an item of level ' + b.mi + ' or less' : '') + (b.ml ? ' · mods level ' + b.ml + '+' : '') +
      '</span>')).join('') + '</div><p class="note">A desecration offers a few modifiers and you take one of them.</p>';
}
function vaalHTML(){
  const o = X.orbs.find(x => x.n === 'Vaal Orb') || {n: 'Vaal Orb', t: ''};
  return '<h4 class="cr-h4">What can add one <span>1</span></h4><div class="cr-list">' +
    rowHTML(o.n, '<b>' + esc(o.n) + '</b>' + px(o.n) + '<span class="cr-rs">' + esc(o.t) + '</span>') +
    '</div><p class="note">A corruption is one use and cannot be undone.</p>';
}
function railHTML(){
  const r = modOf(MOD.key);
  if(!r) return railHead(false, []) + '<p class="note">No modifier selected.</p>';
  // the ways to a modifier are the item's, so there is nothing to say until the item can carry it
  if(!B || !r.cls.some(([i]) => MX.cl[i] === CL.id))
    return railHead(false, []) + '<p class="note">Select a kind of item that carries it.</p>';
  const f = famHere(r), ess = f ? essFor(f) : [];
  return railHead(true, railWith(r, ess)) + planNote() + guaranteeHTML(ess) + omenSideHTML(r) + addsHTML(r, f);
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
  // the essence or the rune a mod came from is a name like any other here: it opens its own card
  const tagHTML = cardOf(tag) ? '<button type="button" class="cr-tag" data-card="' + esc(tag) + '">' + esc(tag) + '</button>' : esc(tag);
  return '<li class="cr-il' + (x.ok ? '' : ' bad') + '">' +
    '<span class="cr-lines">' + x.lines.map(l => '<span' + (T && statFor(l, e[0]) === null ? ' class="nt" title="Not on the trade site"' : '') + '>' + esc(l) + '</span>').join('') + '</span>' +
    '<span class="cr-lmeta">' + (x.tier ? '<b>' + x.tier + '</b>' : '') + tagHTML + (x.ok ? '' : ' · ' + esc(x.why)) + '</span>' +
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
      // the bench, with this item already in hand: the base, its item level and any essence the plan names
      '<button type="button" class="btn" data-act="bench">Practise at the bench</button>' +
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
  // cr is the item class: the card's own fields read this base's table off it — what a corruption can add,
  // and the switches this kind of item carries (assets/kinds.js). The mods it rolls are the table below,
  // so the card leaves that field off rather than drawing the same list twice.
  const it = {k: 'b', id: B.n, n: B.n, base: B.n, cr: CL.id, s: CL.n + (B.d ? ' · ' + defName(B.d) : ''),
    img: B.ic ? X.img + B.ic + '.webp' : '', ls: [...(B.pr || []), ...(B.im || [])]};
  if(!it.ls.length) delete it.ls;
  return card(it, {href: null, builds: false, price: null, kind: 'Base', full: true, without: ['canroll'],
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
  topOffset();
  addEventListener('resize', topOffset);
  wire();
  S = load();
  await draw();
  return {update};
}
function head(){
  return '<div class="pagehd"><h2>Craft</h2><p>Every modifier a base can roll at its item level, ' +
    'and where each one comes from.</p></div>';
}
/* Two questions, one item. The switch is the site's own segmented control, and which question is being asked
   is in the address, so a link opens on the question it was sent about. */
const ASKS = [['base', 'What can this base roll'], ['mod', 'How do I get this mod']];
function askHTML(){
  return '<div class="seg cr-ask" role="group" aria-label="What you are asking">' + ASKS.map(([k, l]) =>
    '<button type="button" data-ask="' + k + '" aria-pressed="' + (ASK === k) + '">' + l + '</button>').join('') + '</div>';
}
const ilvlHTML = () => valHTML({k: 'ilvl', lo: 1, hi: X.ilvl, step: 1, v: S.l, heat: false},
  '<input class="field tnum" type="number" data-k="ilvl" min="1" max="' + X.ilvl + '" value="' + S.l + '" aria-label="Item level">');
/* the mod screen: the search, the hits, the answer and the rail. On a phone they are one job at a time — the
   hits until a modifier is picked, then the modifier and how to get it (.cr-mods[data-picked], app.css). */
function modHTML(){
  if(!MX) return '<p class="err">Could not load the modifier list. Try again in a minute.</p>';
  return '<div class="panel cr-top">' + findBarHTML() + '</div>' +
    '<div class="cr-main cr-mods" data-picked="' + (MOD.key ? 1 : 0) + '">' +
    '<section class="panel cr-hits" data-part="hits"></section>' +
    '<section class="panel cr-ans" data-part="answer"></section>' +
    '<aside class="panel cr-rail" data-part="rail"></aside></div>';
}
/* The bench, with this item in hand: the base, its item level, and whatever the player was reading about — an
   essence off the rail, or the essences the plan already names. It is a card (assets/craftsim.js), so it opens
   on the trail and Back is this page with the plan where it was. */
async function bench(withName){
  if(!B) return;
  const also = withName ? withName.split('|') : [...new Set(S.m.filter(e => e[0] === 'e').map(e => e[2]).filter(Boolean))];
  try {
    const m = await import('./craftsim.js');
    await m.openBench({k: 'b', cr: CL.id, n: B.n, ilvl: S.l}, also);
  } catch {}
}
/* the top bar is sticky and wraps on a phone: the head of the table has to know how tall it is to sit under it */
function topOffset(){
  const t = document.querySelector('.top');
  EL.style.setProperty('--crtop', Math.round(t ? t.getBoundingClientRect().height : 0) + 'px');
}
async function update(){
  if(location.hash === HREF) return;   // the address we wrote ourselves
  if(/[?&](base|kind|ilvl|mods|s|ask|mod|find)=/.test(location.hash)){ S = load(); await draw(); }
  else if(B) save();   // the Craft tab link: keep the plan in the address
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
      if(S.t){ S.m = S.t.map(entryOf).filter(Boolean); delete S.t; }   // the mods a link names, now the base's file is in
    }
  }
  if(!B){ S = {...blank(), l: S.l}; CL = null; }
  if(!S.l) S.l = X.ilvl;
  if(ASK === 'mod'){
    UI.f = null;             // the orb picked on the other screen narrows that screen's pool, not this question
    await modData();
    fitBase();
  }
  save();
  EL.innerHTML = head() + askHTML() + (ASK === 'mod' ? modHTML() :
    '<div class="panel cr-top">' + pickerHTML() + (B ? '' : kindsHTML()) + '<div class="cr-base" data-part="base"></div></div>' +
    (B ? '<div class="cr-main"><aside class="cr-prev" data-part="item"></aside>' +
      '<section class="panel cr-mech" data-part="mech"></section><section class="panel cr-pool" data-part="pool"></section></div>' : ''));
  if(ASK === 'mod') paintMod();
  else {
    wirePicker();
    if(B){ paint('base'); paint('item'); paint('mech'); paint('pool'); }
  }
}
function paint(part){
  const host = EL.querySelector('[data-part="' + part + '"]');
  if(!host || !B) return;
  if(part === 'base'){
    host.replaceChildren(baseCard());
    const ctl = document.createElement('div');
    ctl.className = 'cr-bctl';
    ctl.innerHTML = '<label class="cr-lab"><span class="lbl">Base</span>' + baseSelect() + '</label>' +
      '<label class="cr-lab"><span class="lbl">Item level</span>' + ilvlHTML() + '</label>' +
      '<div class="row"><button type="button" class="btn" data-act="kind">Other kind</button>' +
      '<button type="button" class="btn" data-act="bench">Practise at the bench</button></div>';
    host.appendChild(ctl);
  }
  if(part === 'item') host.innerHTML = previewHTML();
  if(part === 'mech') host.innerHTML = mechHTML();
  if(part === 'pool') host.innerHTML = poolHTML();
}
/* the mod screen's three parts: the hits, the modifier itself and how to get it. All of them, or the one that
   moved. */
function paintMod(only){
  const main = EL.querySelector('.cr-mods');
  if(!main) return;
  main.dataset.picked = MOD.key ? 1 : 0;
  for(const p of only ? [only] : ['hits', 'answer', 'rail']){
    const host = EL.querySelector('[data-part="' + p + '"]');
    if(host) host.innerHTML = p === 'hits' ? hitsHTML() : p === 'answer' ? answerHTML() : railHTML();
  }
}
/* the item level moved: the modifier's own row and what its share is out of, and nothing else — the slider
   under the finger is left where it is */
function refreshMod(){
  const r = modOf(MOD.key), host = EL.querySelector('[data-part="answer"] .cr-fams');
  if(!r) return;
  if(!host) return void paintMod('answer');
  TOT = totals();
  const f = famHere(r);
  host.innerHTML = f ? famHTML(f, r.kind) : '';
  const note = host.nextElementSibling;
  if(note && note.classList.contains('note')) note.outerHTML = shareNote(r);
}
function commit(){ save(); if(ASK === 'mod') paintMod(); else { paint('item'); paint('mech'); paint('pool'); } }

function wirePicker(){
  const host = EL.querySelector('.cr-pick');
  if(!host) return;
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
    if(!k) return;
    if(k === 'find'){   // the modifier search: it is asked without an item, so it runs with no base picked
      MOD.q = t.value;
      MOD.open = false;
      const pos = t.selectionStart;
      save();
      paintMod();
      const again = EL.querySelector('[data-k="find"]');
      if(again){ again.focus(); try { again.setSelectionRange(pos, pos); } catch {} }
      return;
    }
    if(!B) return;
    if(k === 'ilvl'){
      const v = Math.max(1, Math.min(X.ilvl, Math.round(+t.value) || 1));
      syncVal(t);
      if(v === S.l) return;
      S.l = v; save();
      clearTimeout(raf);
      // redraw once the slider rests a moment
      raf = setTimeout(() => { if(ASK === 'mod') refreshMod(); else { paint('item'); paint('mech'); paint('pool'); } }, 60);
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
    if(t.dataset.k === 'base' && P){ S.b = t.value; B = P.bases.find(b => b.n === t.value) || B; save(); if(ASK === 'mod') paintMod(); else { paint('base'); commit(); } }
    if(t.dataset.k === 'ilvl' && ASK === 'mod') paintMod('rail');   // the rail's head and the orbs it lists read the item level
  });
  EL.addEventListener('click', e => {
    const b = e.target.closest('button, a.btn.gold');
    if(!b || !EL.contains(b)) return;
    if(b.matches('a.btn.gold')) return;
    if(b.dataset.card){ openCard(b.dataset.card); return; }
    /* the two questions: the switch itself, and the modifier the second one is about. Neither needs a base,
       so they answer before the rest. */
    if(b.dataset.ask){ if(ASK !== b.dataset.ask){ ASK = b.dataset.ask; save(); draw(); } return; }
    if(b.dataset.mod !== undefined){
      MOD.key = b.dataset.mod === MOD.key ? '' : b.dataset.mod;
      fitBase();                       // a base of this kind that can actually roll it
      save(); paintMod(); jumpMod();
      return;
    }
    if(b.dataset.mtag !== undefined){ MOD.tag = MOD.tag === b.dataset.mtag ? '' : b.dataset.mtag; MOD.open = false; paintMod('hits'); return; }
    if(b.dataset.more === 'hits'){ MOD.open = true; paintMod('hits'); return; }
    if(b.dataset.class){ S = {...blank(), c: b.dataset.class, l: S.l || 0}; save(); draw(); return; }
    if(!B) return;
    if(b.dataset.act === 'bench'){ bench(b.dataset.with || ''); return; }
    if(b.dataset.pool !== undefined){   // a pool of bases, not 294 names: the last base of it is the item
      const list = P.bases.filter(x => x.p === +b.dataset.pool), nb = list[list.length - 1];
      if(nb){ S.b = nb.n; B = nb; save(); paintMod(); }
      return;
    }
    if(b.dataset.act === 'kind'){ S = {...blank(), l: S.l}; save(); draw(); EL.querySelector('.cr-pick input').focus(); return; }
    if(b.dataset.act === 'clear'){ S.m = []; commit(); return; }
    if(b.dataset.off){   // one filter off, from the head of the table
      const k = b.dataset.off;
      if(k === 'orb') UI.f = null;
      else if(k === 'only') UI.f = {...UI.f, only: ''};
      else if(k === 'q') UI.q = '';
      else if(k === 'tag') UI.tag = '';
      paint('mech'); paint('pool');
      return;
    }
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
/* a phone shows one job at a time, so the modifier just picked is what is on the screen */
function jumpMod(){
  const main = EL.querySelector('.cr-mods');
  if(main && innerWidth <= 760) main.scrollIntoView({behavior: 'smooth', block: 'start'});
}
/* a tier moved: only the Add button's state and the tier's weight change */
function refreshRow(row){
  const kind = row.dataset.kind, fam = families(kind).find(f => f.f === +row.dataset.f);
  if(!fam) return;
  const k = pick(fam, V[kind + fam.f]);
  const i = fam.tiers[k], ok = eligible(i, kind), r = check(kind || 'p', i);
  const btn = row.querySelector('.cr-add');
  btn.disabled = !(ok && r.ok);
  const why = row.querySelector('.cr-why');
  if(why) why.textContent = btn.disabled ? (ok ? r.why || '' : P.mods[i][2] > S.l ? needLvl(P.mods[i][2]) : orbLow()) : '';
  const w = row.querySelector('.cr-fw');
  if(w && kind === '') w.outerHTML = tierWeightHTML(fam, k, ok);
}
