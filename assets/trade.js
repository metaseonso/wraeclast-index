/* Trade: turn any item into a search on the official PoE2 trade site.
   The Trade button in a card's popup opens this panel. Each mod gets "at least / at most / exactly"
   and a slider; item states (corrupted, cultivated Vaal, sanctified, ...) are yes / no / any.
   Data: data/trade.json, the trade site's own lists (tools/tradedata.py). */
import { D, esc } from './app.js';

const SITE = 'https://www.pathofexile.com/trade2';
let T = null;
export async function tradeData(){
  if(T) return T;
  const raw = await (await fetch('data/trade.json', {cache: 'no-cache'})).json();
  // index every mod by its wording with the numbers taken out, per kind; "(Local)" versions kept apart
  const by = {}, local = {};
  for(const [id, text] of raw.mods){
    const kind = id.split('.')[0];
    const loc = /\(Local\)\s*$/.test(text);
    const k = key(text.replace(/\s*\(Local\)\s*$/, ''));
    const into = loc ? local : by;
    (into[kind] = into[kind] || {});
    if(!(k in into[kind])) into[kind][k] = id;
  }
  T = {...raw, by, local};
  return T;
}

const NUM = /[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?/g;
export function key(t){
  return t.replace(NUM, '#').replace(/\+#/g, '#').replace(/-#/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}
/* the numbers on a line as one searchable range: "Adds (4-6) to (7-10)" searches the average, like the site */
function range(line){
  const toks = line.match(NUM) || [];
  if(!toks.length) return null;
  const parts = toks.map(tok => {
    const neg = /^-/.test(tok) && /\(/.test(tok);
    // "(30-60)": the dash between two numbers is "to", not a minus sign
    const s = tok.replace(/^\+/, '').replace(/[()]/g, ''), m = s.match(/^([+-]?\d+(?:\.\d+)?)(?:-([+-]?\d+(?:\.\d+)?))?$/);
    const n = (m ? [m[1], m[2]].filter(x => x !== undefined) : s.match(/-?\d+(?:\.\d+)?/g)).map(Number);
    let lo = n[0], hi = n.length > 1 ? n[1] : n[0];
    if(neg){ lo = -Math.abs(lo); hi = -Math.abs(hi); }
    return [Math.min(lo, hi), Math.max(lo, hi)];
  });
  const avg = i => parts.reduce((a, p) => a + p[i], 0) / parts.length;
  return toks.length > 1 && /to/.test(line) ? {lo: avg(0), hi: avg(1), avg: true} : {lo: parts[0][0], hi: parts[0][1]};
}
const ITEM_KINDS = /Weapon|Armour|Shield|Buckler|Focus|Quiver|Sword|Axe|Mace|Bow|Crossbow|Spear|Staff|Wand|Sceptre|Dagger|Claw|Flail|Talisman|Helmet|Gloves|Boots|Body/;
function statId(line, implicit, onGear){
  const k = key(line);
  const order = implicit ? ['implicit', 'explicit', 'enchant'] : ['explicit', 'rune', 'desecrated', 'fractured', 'enchant', 'crafted', 'implicit'];
  for(const kind of order){
    if(onGear && T.local[kind] && T.local[kind][k]) return T.local[kind][k];
    if(T.by[kind] && T.by[kind][k]) return T.by[kind][k];
  }
  return null;
}

/* ---------- links ---------- */
export function searchURL(league, query){
  return SITE + '/search/poe2/' + encodeURIComponent(league) + '?q=' + encodeURIComponent(JSON.stringify(query));
}
export function exchangeURL(league, have, want){
  return SITE + '/exchange/poe2/' + encodeURIComponent(league) + '?q=' +
    encodeURIComponent(JSON.stringify({exchange: {status: {option: 'online'}, have: [have], want: [want]}}));
}
export function valueFor(op, v){
  return op === 'max' ? {max: v} : op === 'eq' ? {min: v, max: v} : {min: v};
}

/* ---------- the panel ---------- */
const OPS = [['min', 'At least'], ['max', 'At most'], ['eq', 'Exactly']];
const STATES = ['corrupted', 'twice_corrupted', 'mutated', 'sanctified', 'desecrated', 'fractured_item', 'mirrored'];
const PAYS = [['divine', 'Divine'], ['exalted', 'Exalted'], ['chaos', 'Chaos']];
const step = r => (Number.isInteger(r.lo) && Number.isInteger(r.hi) && !r.avg) ? 1 : 0.1;
function fmt(v){ return Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v * 10) / 10) : String(Math.round(v * 100) / 100); }

export async function tradePanel(it){
  await tradeData();
  const league = (D.market && D.market.league) || 'Standard';
  const box = document.createElement('section');
  box.className = 'trade';

  if(it.k === 'c'){   // currency: the bulk exchange
    const want = T.exchange[it.n];
    if(!want){ box.innerHTML = '<p class="note">Not on the currency exchange.</p>'; return box; }
    let have = want === 'divine' ? 'exalted' : 'divine';
    const paint = () => {
      box.innerHTML = '<h4>Buy on the exchange</h4><div class="trow"><span>Pay with</span><div class="seg tpay">' +
        PAYS.filter(p => p[0] !== want).map(([id, l]) => '<button type="button" data-v="' + id + '" aria-pressed="' + (id === have) + '">' + l + '</button>').join('') +
        '</div></div><div class="tgo"><a class="btn gold" target="_blank" rel="noopener" href="' + esc(exchangeURL(league, have, want)) + '">Open exchange ↗</a></div>';
    };
    paint();
    box.addEventListener('click', e => { const b = e.target.closest('.tpay button'); if(b){ have = b.dataset.v; paint(); } });
    return box;
  }

  const onGear = ITEM_KINDS.test(it.s || '');
  const rows = [];
  if(it.k === 'g'){
    rows.push({label: 'Gem level', misc: 'gem_level', r: {lo: 1, hi: 21}, v: 20, op: 'min', on: true});
    rows.push({label: 'Quality', misc: 'quality', type: 'type_filters', r: {lo: 0, hi: 23}, v: 20, op: 'min', on: false});
  } else {
    (it.ls || []).forEach((line, i) => {
      const r = range(line);
      rows.push({label: line, id: statId(line, i < (it.ni || 0), onGear), r, v: r ? r.lo : null, op: 'min', on: false});
    });
  }
  const states = Object.fromEntries(STATES.map(s => [s, 'any']));
  const stateName = Object.fromEntries(T.states);
  let online = true;

  const base = it.base || (it.s || '').split(' · ')[0];   // it.base: a card whose sub line is not its base type
  const build = () => {
    const stats = rows.filter(r => r.on && r.id).map(r => ({id: r.id, value: r.v === null ? {} : valueFor(r.op, r.v), disabled: false}));
    const misc = {};
    for(const [s, v] of Object.entries(states)) if(v !== 'any') misc[s] = {option: v === 'yes' ? 'true' : 'false'};
    const filters = {};
    for(const r of rows.filter(r => r.on && r.misc)){
      const grp = r.type || 'misc_filters';
      (filters[grp] = filters[grp] || {filters: {}}).filters[r.misc] = valueFor(r.op, r.v);
    }
    if(Object.keys(misc).length) (filters.misc_filters = filters.misc_filters || {filters: {}}).filters = {...filters.misc_filters.filters, ...misc};
    const q = {status: {option: online ? 'online' : 'any'}};
    if(it.k === 'u'){ q.name = it.n; if(base) q.type = base; }
    else if(it.k === 'g') q.type = it.n;
    else if(base){ q.type = base; (filters.type_filters = {filters: {rarity: {option: 'nonunique'}}}); }
    if(stats.length) q.stats = [{type: 'and', filters: stats}];
    if(Object.keys(filters).length) q.filters = filters;
    return {query: q, sort: {price: 'asc'}};
  };

  const rowHTML = (r, i) => {
    if(!r.misc && !r.id) return '<div class="tmod off" title="The trade site cannot search this line">' + esc(r.label) + '</div>';
    const slider = r.r && r.r.lo !== r.r.hi;
    return '<div class="tmod' + (r.on ? ' on' : '') + '" data-i="' + i + '">' +
      '<label class="tcheck"><input type="checkbox" data-k="on"' + (r.on ? ' checked' : '') + '><span>' + esc(r.label) + '</span></label>' +
      (r.on && r.v !== null ? '<div class="tctl"><div class="seg" data-k="op">' + OPS.map(([o, l]) =>
          '<button type="button" data-v="' + o + '" aria-pressed="' + (o === r.op) + '">' + l + '</button>').join('') + '</div>' +
        (slider ? '<input type="range" data-k="v" min="' + r.r.lo + '" max="' + r.r.hi + '" step="' + step(r.r) + '" value="' + r.v + '">' : '') +
        '<input class="field tnum" type="number" data-k="v" step="' + step(r.r || {lo: 0, hi: 0}) + '" value="' + fmt(r.v) + '">' +
        (r.r && r.r.avg ? '<span class="note">average</span>' : '') + '</div>' : '') + '</div>';
  };
  const paint = () => {
    const url = searchURL(league, build());
    box.innerHTML = '<h4>Find it on trade <span class="note">' + esc(league) + '</span></h4>' +
      (rows.length ? '<p class="note">Tick the mods you care about.</p><div class="tmods">' + rows.map(rowHTML).join('') + '</div>' : '') +
      '<div class="tstates">' + STATES.filter(s => stateName[s]).map(s =>
        '<div class="trow"><span>' + esc(stateName[s]) + '</span><div class="seg" data-state="' + s + '">' +
        ['any', 'yes', 'no'].map(v => '<button type="button" data-v="' + v + '" aria-pressed="' + (states[s] === v) + '">' + v[0].toUpperCase() + v.slice(1) + '</button>').join('') +
        '</div></div>').join('') + '</div>' +
      '<label class="note tonline"><input type="checkbox" data-k="online"' + (online ? ' checked' : '') + '> Online sellers only</label>' +
      '<div class="tgo"><button type="button" class="btn tcopy">Copy link</button>' +
      '<a class="btn gold" target="_blank" rel="noopener" href="' + esc(url) + '">Open on trade ↗</a></div>';
  };
  paint();
  // keep the link current as values move, without redrawing under the pointer
  const relink = () => { const a = box.querySelector('.tgo .gold'); if(a) a.href = searchURL(league, build()); };
  box.addEventListener('input', e => {
    const t = e.target, row = t.closest('.tmod');
    if(t.dataset.k === 'v' && row){
      const r = rows[+row.dataset.i], v = parseFloat(t.value);
      if(!isNaN(v)){ r.v = v; row.querySelectorAll('[data-k="v"]').forEach(x => { if(x !== t) x.value = t.type === 'range' ? fmt(v) : v; }); }
      relink();
    }
  });
  box.addEventListener('change', e => {
    const t = e.target, row = t.closest('.tmod');
    if(t.dataset.k === 'on' && row){ rows[+row.dataset.i].on = t.checked; paint(); }
    if(t.dataset.k === 'online'){ online = t.checked; relink(); }
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    const seg = b.closest('.seg');
    if(seg && seg.dataset.k === 'op'){ rows[+b.closest('.tmod').dataset.i].op = b.dataset.v; paint(); }
    else if(seg && seg.dataset.state){ states[seg.dataset.state] = b.dataset.v; paint(); }
    else if(b.classList.contains('tcopy')){
      const url = searchURL(league, build());
      navigator.clipboard && navigator.clipboard.writeText(url).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy link', 1400); });
    }
  });
  return box;
}
