/* Trade: turn any item into a search on the official PoE2 trade site.
   The Trade button in a card's popup opens this panel. Each mod gets "at least / at most / exactly"
   and a slider; item states (corrupted, cultivated Vaal, sanctified, ...) are yes / no / any.
   Data: data/trade.json, the trade site's own lists (tools/tradedata.py). */
import { D, esc, money, ago } from './app.js';

const SITE = 'https://www.pathofexile.com/trade2';
let T = null;
export async function tradeData(){
  if(T) return T;
  const [raw, roll] = await Promise.all([
    fetch('data/trade.json').then(r => r.json()),
    // live roll prices: the worker checks the trade site through the hour (worker/prices.js)
    fetch('data/rollprices.json').then(r => r.ok ? r.json() : null).catch(() => null)]);
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
  T = {...raw, by, local, roll: roll && roll.mods && Object.keys(roll.mods).length ? roll : null};
  return T;
}

const NUM = /[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?/g;
export function key(t){
  return t.replace(NUM, '#').replace(/\+#/g, '#').replace(/-#/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}
/* the numbers on a line as one searchable range: "Adds (4-6) to (7-10)" searches the average, like the site.
   Same rules as line_range() in tools/tradedata.py. */
const PAIR = /^([+-]?\d+(?:\.\d+)?)(?:-([+-]?\d+(?:\.\d+)?))?$/;
function span(tok){
  const paren = tok.includes('(');
  const neg = tok[0] === '-' && paren;
  const body = (paren && tok[0] !== '(' ? tok.replace(/^[+-]+/, '') : tok.replace(/^\+/, '')).replace(/[()]/g, '');
  const m = body.match(PAIR);
  if(!m) return null;
  let a = +m[1], b = m[2] !== undefined ? +m[2] : a;
  if(neg){ a = -a; b = -b; }
  return [Math.min(a, b), Math.max(a, b)];
}
function range(line){
  const parts = (line.match(NUM) || []).map(span).filter(Boolean);
  if(!parts.length) return null;
  const avg = i => parts.reduce((a, p) => a + p[i], 0) / parts.length;
  return parts.length > 1 && /\badds\b.*\bto\b/i.test(line) ? {lo: avg(0), hi: avg(1), avg: true} : {lo: parts[0][0], hi: parts[0][1]};
}

/* ---------- sliders ----------
   Every number box can have a slider beside it. A mod with tiers shows them as bands on the track
   (T1 is the best roll) with a divider between each, shaded from cool to hot by tier (not live prices yet). */
const HEAT = [[28, 38, 26], [74, 72, 34], [168, 132, 74], [179, 38, 30]];
function heat(t){
  t = Math.pow(Math.max(0, Math.min(1, t)), 1.4);
  const x = t * (HEAT.length - 1), i = Math.min(HEAT.length - 2, Math.floor(x)), f = x - i;
  return 'rgb(' + HEAT[i].map((a, j) => Math.round(a + (HEAT[i + 1][j] - a) * f)).join(',') + ')';
}
export function tierOf(v, tiers){
  if(!tiers || v === '' || v === null || v === undefined || isNaN(+v)) return null;
  let i = -1;
  tiers.forEach((t, j) => { if(+v >= t[0]) i = j; });
  return i < 0 ? null : {n: tiers.length - i, lo: tiers[i][0], hi: tiers[i][1], lvl: tiers[i][2]};
}
export function tierText(v, tiers){
  const t = tierOf(v, tiers);
  return t ? 'T' + t.n + ' · ' + t.lo + (t.hi !== t.lo ? '–' + t.hi : '') + (t.lvl > 1 ? ' · item level ' + t.lvl + '+' : '') : '';
}
export function rollFor(stat){
  const m = T && T.roll && T.roll.mods[stat];
  const pts = m ? m.pts.filter(p => p[1] > 0) : [];
  return pts.length >= 2 ? pts : null;
}
function priceAt(v, pts){   // the cheapest items with at least this roll: the nearest checked value at or below it
  let best = null;
  if(pts && v !== '' && v !== null && v !== undefined && !isNaN(+v)) for(const p of pts) if(+v >= p[0]) best = p;
  return best;
}
export function readout(v, tiers, pts){
  const bits = [tierText(v, tiers)].filter(Boolean), p = priceAt(v, pts), m = p && money(p[1]);
  if(m) bits.push('from ~' + m.v + ' ' + m.u);
  return bits.join(' · ');
}
export const stepOf = (lo, hi, tiers) => [lo, hi, ...(tiers || []).flat()].every(Number.isInteger) ? 1 : 0.1;
/* o: {k, lo, hi, step, v, tiers, prices, heat:false for plain counts} */
export function slideHTML(o){
  const lo = +o.lo, hi = +o.hi, w = hi - lo, step = o.step || 1;
  if(!(w > 0)) return '';
  const at = x => ((x - lo) / w * 100).toFixed(2) + '%';
  let bg, marks = '';
  if(o.tiers && o.tiers.length > 1){
    const t = o.tiers, n = t.length, edges = [lo];
    for(let i = 1; i < n; i++) edges.push(Math.min(hi, Math.max(lo, (t[i - 1][1] + t[i][0]) / 2)));
    edges.push(hi);
    const stops = [];
    for(let i = 0; i < n; i++){
      const c = heat(i / (n - 1));
      stops.push(c + ' ' + at(edges[i]), c + ' ' + at(edges[i + 1]));
      if(i) marks += '<i class="tdiv" style="left:' + at(edges[i]) + '"></i>';
      if((edges[i + 1] - edges[i]) / w >= 0.075) marks += '<b class="ttag" style="left:' + at((edges[i] + edges[i + 1]) / 2) + '">T' + (n - i) + '</b>';
    }
    bg = 'linear-gradient(90deg,' + stops.join(',') + ')';
  } else {
    bg = o.heat === false ? 'var(--raised)' : 'linear-gradient(90deg,' + [0, .4, .7, .88, 1].map(x => heat(x) + ' ' + x * 100 + '%').join(',') + ')';
    if(Number.isInteger(step) && w / step <= 12) for(let x = lo + step; x < hi; x += step) marks += '<i class="tdiv" style="left:' + at(x) + '"></i>';
  }
  if(o.prices && o.prices.length >= 2){
    const L = o.prices.map(p => Math.log(p[1])), a = Math.min(...L), b = Math.max(...L);
    bg = 'linear-gradient(90deg,' + o.prices.map((p, i) => heat(b > a ? (L[i] - a) / (b - a) : 0) + ' ' + at(Math.max(lo, Math.min(hi, p[0])))).join(',') + ')';
  }
  const unset = o.v === '' || o.v === null || o.v === undefined;
  return '<span class="tslide' + (unset ? ' unset' : '') + '"><span class="ttrack" style="background:' + bg + '">' + marks + '</span>' +
    '<input type="range" data-k="' + o.k + '" min="' + lo + '" max="' + hi + '" step="' + step + '" value="' + (unset ? lo : o.v) + '"></span>';
}
/* a number box with its slider (and the tier it lands in); keep them in step with syncVal() */
export function valHTML(o, box){
  const info = o.tiers || o.prices;
  return '<span class="tval"' + (o.tiers ? ' data-tiers="' + esc(JSON.stringify(o.tiers)) + '"' : '') +
    (o.prices ? ' data-prices="' + esc(JSON.stringify(o.prices)) + '"' : '') + '>' + slideHTML(o) + box +
    (info ? '<span class="ttier">' + esc(readout(o.v, o.tiers, o.prices)) + '</span>' : '') + '</span>';
}
export function syncVal(src){
  const box = src.closest('.tval'); if(!box) return;
  const num = box.querySelector('input[type=number]'), rng = box.querySelector('input[type=range]'), sl = box.querySelector('.tslide');
  if(src === rng && num) num.value = fmt(+rng.value);
  if(src === num && rng && num.value !== '' && !isNaN(+num.value)) rng.value = num.value;
  const v = num ? num.value : rng.value;
  if(sl) sl.classList.toggle('unset', v === '');
  const tt = box.querySelector('.ttier');
  if(tt) tt.textContent = readout(v, JSON.parse(box.dataset.tiers || 'null'), JSON.parse(box.dataset.prices || 'null'));
}
/* the line above the sliders: live prices (and when they were checked), or what the colours mean without them */
export function heatNote(priced, tiered = true){
  const when = T && T.roll && T.roll.updated ? ' Last check ' + ago(T.roll.updated) + '.' : '';
  return '<p class="note theat"><span class="theat-bar"></span> ' + (priced
    ? 'Colour and price: the cheapest items with at least that roll, from the trade site. Checked over the day.' + when
    : tiered ? 'T1 is the best roll. Redder is a higher tier.' : 'Redder is a better roll.') + '</p>';
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
// mark the chosen button in a row of buttons
const press = (seg, v) => seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));

export async function tradePanel(it){
  await tradeData();
  const league = (D.market && D.market.league) || 'Standard';
  const box = document.createElement('section');
  box.className = 'trade';

  const want = (/^[ca]$/.test(it.k) || it.li) && T.exchange[it.n];   // it.li: a lineage gem trades there too
  if(want){   // currency and exchange items (waystones, fragments): the bulk exchange
    let have = want === 'divine' ? 'exalted' : 'divine';
    box.innerHTML = '<h4>Buy on the exchange</h4><div class="trow"><span>Pay with</span><div class="seg tpay">' +
      PAYS.filter(p => p[0] !== want).map(([id, l]) => '<button type="button" data-v="' + id + '" aria-pressed="' + (id === have) + '">' + l + '</button>').join('') +
      '</div></div><div class="tgo"><a class="btn gold" target="_blank" rel="noopener" href="' + esc(exchangeURL(league, have, want)) + '">Open exchange ↗</a></div>';
    // another coin to pay with: move the mark and the link, leave the panel alone
    box.addEventListener('click', e => {
      const b = e.target.closest('.tpay button'); if(!b) return;
      have = b.dataset.v;
      press(b.closest('.seg'), have);
      const a = box.querySelector('.tgo .gold');
      if(a) a.href = exchangeURL(league, have, want);
    });
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
      rows.push({label: line, id: statId(line.replace(/^or /, ''), i < (it.ni || 0), onGear), r, v: r ? r.lo : null, op: 'min', on: false});
    });
  }
  const searchable = () => rows.filter(r => r.misc || r.id);
  const states = Object.fromEntries(STATES.map(s => [s, 'any']));
  const stateName = Object.fromEntries(T.states);
  let online = false;   // any seller by default; tick for online only

  // a card of the thing itself (an index base, atlas item or bulk item): its own type, any rarity
  const own = it.k === 'a' || it.k === 'c' || (it.k === 'b' && D.byKey.get('b:' + it.id) === it);
  const base = it.base || (own ? it.n : (it.s || '').split(' · ')[0]);   // it.base: a card whose sub line is not its base type
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
    if(it.k === 'u' || (it.k === 'a' && it.base)){ q.name = it.n; if(base) q.type = base; }   // a unique (tablet)
    else if(it.k === 'g') q.type = it.n;
    else if(base){ q.type = base; if(!own) filters.type_filters = {filters: {rarity: {option: 'nonunique'}}}; }
    if(stats.length) q.stats = [{type: 'and', filters: stats}];
    if(Object.keys(filters).length) q.filters = filters;
    return {query: q, sort: {price: 'asc'}};
  };

  // the number box, the at least / at most / exactly buttons and the slider of one ticked mod
  const ctlHTML = r => {
    if(!r.on || r.v === null) return '';
    const slider = r.r && r.r.lo !== r.r.hi;
    return '<div class="tctl"><div class="seg" data-k="op">' + OPS.map(([o, l]) =>
        '<button type="button" data-v="' + o + '" aria-pressed="' + (o === r.op) + '">' + l + '</button>').join('') + '</div>' +
      valHTML(slider ? {k: 'v', lo: r.r.lo, hi: r.r.hi, step: step(r.r), v: r.v} : {k: 'v', lo: 0, hi: 0, v: r.v},
        '<input class="field tnum" type="number" data-k="v" step="' + step(r.r || {lo: 0, hi: 0}) + '" value="' + fmt(r.v) + '">') +
      (r.r && r.r.avg ? '<span class="note">average</span>' : '') + '</div>';
  };
  const rowHTML = (r, i) => {
    if(!r.misc && !r.id) return '<div class="tmod off" title="The trade site cannot search this line">' + esc(r.label) + '</div>';
    return '<div class="tmod' + (r.on ? ' on' : '') + '" data-i="' + i + '">' +
      '<label class="tcheck"><input type="checkbox" data-k="on"' + (r.on ? ' checked' : '') + '><span>' + esc(r.label) + '</span></label>' +
      ctlHTML(r) + '</div>';
  };
  const draw = () => {
    const url = searchURL(league, build());
    box.innerHTML = '<h4>Find it on trade <span class="note">' + esc(league) + '</span></h4>' +
      (rows.length ? '<p class="note">Tick the mods you care about.</p>' + heatNote(false, false) +
        (searchable().length > 1 ? '<label class="tcheck tall"><input type="checkbox" data-k="all"' + (searchable().every(r => r.on) ? ' checked' : '') + '><span>Tick all</span></label>' : '') +
        '<div class="tmods">' + rows.map(rowHTML).join('') + '</div>' : '') +
      '<div class="tstates">' + STATES.filter(s => stateName[s]).map(s =>
        '<div class="trow"><span>' + esc(stateName[s]) + '</span><div class="seg" data-state="' + s + '">' +
        ['any', 'yes', 'no'].map(v => '<button type="button" data-v="' + v + '" aria-pressed="' + (states[s] === v) + '">' + v[0].toUpperCase() + v.slice(1) + '</button>').join('') +
        '</div></div>').join('') + '</div>' +
      '<label class="note tonline"><input type="checkbox" data-k="online"' + (online ? ' checked' : '') + '> Online sellers only</label>' +
      '<div class="tgo"><button type="button" class="btn tcopy">Copy link</button>' +
      '<a class="btn gold" target="_blank" rel="noopener" href="' + esc(url) + '">Open on trade ↗</a></div>';
  };
  draw();
  /* From here the panel is only patched, never redrawn: a box you are typing in keeps its focus,
     its value and its caret while mods are ticked, buttons pressed and sliders moved. */
  // keep the link current as values move, without redrawing under the pointer
  const relink = () => { const a = box.querySelector('.tgo .gold'); if(a) a.href = searchURL(league, build()); };
  // one mod ticked or unticked: its own controls come and go, the rest of the panel stays as it is
  const paintRow = (el, r) => {
    el.classList.toggle('on', !!r.on);
    const old = el.querySelector('.tctl');
    if(old) old.remove();
    el.insertAdjacentHTML('beforeend', ctlHTML(r));
  };
  const syncAll = () => { const a = box.querySelector('input[data-k=all]'); if(a) a.checked = searchable().every(r => r.on); };
  box.addEventListener('input', e => {
    const t = e.target, row = t.closest('.tmod');
    if(t.dataset.k === 'v' && row){
      const r = rows[+row.dataset.i], v = parseFloat(t.value);
      if(!isNaN(v)){ r.v = v; syncVal(t); }
      relink();
    }
  });
  box.addEventListener('change', e => {
    const t = e.target, row = t.closest('.tmod');
    if(t.dataset.k === 'on' && row){ rows[+row.dataset.i].on = t.checked; paintRow(row, rows[+row.dataset.i]); syncAll(); relink(); }
    if(t.dataset.k === 'all'){   // only the rows that move are touched: a row already ticked keeps its box
      box.querySelectorAll('.tmod[data-i]').forEach(el => {
        const r = rows[+el.dataset.i];
        if(r.on === t.checked) return;
        r.on = t.checked;
        const c = el.querySelector('input[data-k=on]');
        if(c) c.checked = r.on;
        paintRow(el, r);
      });
      relink();
    }
    if(t.dataset.k === 'online'){ online = t.checked; relink(); }
  });
  box.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    const seg = b.closest('.seg');
    if(seg && seg.dataset.k === 'op'){ rows[+b.closest('.tmod').dataset.i].op = b.dataset.v; press(seg, b.dataset.v); relink(); }
    else if(seg && seg.dataset.state){ states[seg.dataset.state] = b.dataset.v; press(seg, b.dataset.v); relink(); }
    else if(b.classList.contains('tcopy')){
      const url = searchURL(league, build());
      navigator.clipboard && navigator.clipboard.writeText(url).then(() => { b.textContent = 'Copied'; setTimeout(() => b.textContent = 'Copy link', 1400); });
    }
  });
  return box;
}
