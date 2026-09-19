/* Trade page: the official trade site's full search, in plain words.
   Pick the item, add groups of mods ("must have", "at least N of these", "add these up", "must not have"),
   set details and price, then open the search. The whole search lives in the address, so it can be shared. */
import { D, $, esc } from './app.js';
import { tradeData, searchURL, valueFor, valHTML, syncVal, stepOf, heatNote, rollFor } from './trade.js';

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
  price: '', cur: 'divine', indexed: '', online: true});

let T, EL, S = blank(), MOD = new Map();

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

/* ---------- defence types (gear kinds only) ----------
   Each ticked type is a mix like "Evasion + Energy Shield". A defence every ticked type has must be there,
   one that none of them has must be missing, the rest are free. */
const DEF = {ar: 'Armour', ev: 'Evasion', es: 'Energy Shield'};
const typeName = t => t.split('+').map(d => DEF[d]).join(' + ');
const typesFor = () => (S.item && S.item.k === 'category' && T.typings && T.typings[S.item.v]) || null;
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
  const out = [];
  for(const [id, m] of MOD) if(words.every(w => m.l.includes(w))) out.push({id, ...m});
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
function modSlide(id, info){ return info.r ? {lo: info.r[0], hi: info.r[1], step: stepOf(info.r[0], info.r[1], info.tiers), tiers: info.tiers, prices: rollFor(id)} : null; }
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
      return '<div class="tp-mod" data-m="' + mi + '"><span class="tp-mtext">' + esc(info.t) + ' <span class="pill">' + (KIND[info.k] || '') + '</span></span>' +
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
        return '<label class="tp-type"><input type="checkbox" data-type="' + v + '"' + ((S.types || []).includes(v) ? ' checked' : '') + '> ' + esc(typeName(v)) + '</label>'; }).join('') + '</div>' : '') +
      '<h3 class="tp-h">Mods</h3>' + (S.groups.some(g => g.mods.length) ? heatNote(S.groups.some(g => g.t !== 'weight' && g.t !== 'not' && g.mods.some(m => rollFor(m.id)))) : '') +
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

  const ip = EL.querySelector('[data-picker="item"]');
  if(ip) picker(ip, 'An item, a unique or a kind (e.g. ring, Headhunter, boots)', itemMatches, it => { S.item = it; S.types = []; commit(); });
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
    const b = e.target.closest('button'); if(!b) return;
    const g = b.closest('.tp-group'), m = b.closest('.tp-mod'), seg = b.closest('.seg');
    if(b.dataset.ex !== undefined){ S = {...blank(), ...JSON.parse(JSON.stringify(EXAMPLES[+b.dataset.ex][1]))}; return commit(); }
    if(b.dataset.addg){ S.groups.push(b.dataset.addg === 'count' ? {t: 'count', n: 1, mods: []} : {t: b.dataset.addg, mods: []}); return commit(); }
    if(b.dataset.act === 'reset'){ S = blank(); return commit(); }
    if(b.dataset.act === 'clearitem'){ S.item = null; S.types = []; return commit(); }
    if(b.dataset.act === 'delgroup'){ S.groups.splice(+g.dataset.g, 1); return commit(); }
    if(b.dataset.act === 'delmod'){ S.groups[+g.dataset.g].mods.splice(+m.dataset.m, 1); return commit(); }
    if(seg && seg.dataset.k === 'op'){ S.groups[+g.dataset.g].mods[+m.dataset.m].op = b.dataset.v; return commit(); }
    if(seg && seg.dataset.state){ S.states[seg.dataset.state] = b.dataset.v; return commit(); }
    if(b.classList.contains('tcopy')){
      const url = searchURL(D.market ? D.market.league : 'Standard', query());
      navigator.clipboard && navigator.clipboard.writeText(url).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy link', 1400); });
    }
  });
}
