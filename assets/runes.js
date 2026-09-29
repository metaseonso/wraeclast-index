/* The Rune recipes page (#/runes): every Runes of Aldur recipe, both ways out of one list (data/runes.json,
   tools/runes.py; design/runes.md). Pick runes and it lists what they make: the recipes that hold every rune
   picked. Name a thing and it lists the runes that make it. Each row: the runes in order, what it makes (its
   card, where it has one), how many, the gem level, the Tome tab, the game's words where a quest shuts it, and
   the highlight rows it is offered with, which carry "Subject to change": that a recipe is offered when one of
   them is highlighted is read off the files' column names. Under the list, per recipe length, the rune the
   game highlights in each slot and area-level band.

   The page is its own tab: nothing of it is fetched until it is opened. What it is showing lives in the
   address (#/runes?rune=Tempest Rune,Fire Rune&make=Orb&tab=Currency), so a rune card's gold button opens it
   on that rune, and Back brings the last picks back. */
import { D, $, esc, openDetail, hrefOf, params, onType } from './app.js';

const S = {runes: [], make: '', tab: 'all', len: 2};
const FLAG = 'Subject to change';
let EL = null, R = null, NAMES = null;

const getJSON = f => fetch(f).then(r => r.ok ? r.json() : null).catch(() => null);
const area = lv => 'area level ' + (lv[0] === lv[1] ? lv[0] : lv[1] >= 100 ? lv[0] + ' and up' : lv[0] + ' to ' + lv[1]);

/* a name to the card it answers to: the kinds a recipe can make, in the order a name is claimed (the same order
   tools/joincards.py keys "Makes" by). The index holds the market's currency cards too, so the Exchange's
   own items are found here. */
const RANK = {c: 0, g: 1, u: 2, b: 3, a: 4};
function cardOf(name){
  if(!NAMES){
    NAMES = new Map();
    for(const it of (D.index && D.index.items) || []){
      if(!(it.k in RANK)) continue;
      const cur = NAMES.get(it.n);
      if(!cur || RANK[it.k] < RANK[cur.k]) NAMES.set(it.n, it);
    }
  }
  return NAMES.get(name) || null;
}
const runeCard = name => D.byKey.get('o:' + name) || null;

function head(sub){
  return '<div class="pagehd"><h2>Rune recipes</h2><p>Runes of Aldur: what runes make, and the runes that make a thing.</p>' +
    (sub ? '<p class="dt-sub">' + sub + '</p>' : '') + '</div>';
}

export async function mount(el){
  EL = el;
  el.innerHTML = head() + '<p class="note">Loading…</p>';
  R = R || await getJSON('data/runes.json');
  if(EL !== el) return {};
  if(!R || !(R.recipes || []).length){
    el.innerHTML = head() + '<p class="note err">The recipes did not load.</p>';
    return {};
  }
  const c = R.counts || {};
  const tabs = Object.keys(c.tabs || {});
  const results = Object.keys(R.makes || {}).sort((a, b) => a.localeCompare(b));
  const lens = [...new Set((R.bands || []).map(b => b.runes))].sort((a, b) => a - b);
  S.len = lens.includes(S.len) ? S.len : lens[0];
  el.innerHTML = head((c.recipes || R.recipes.length).toLocaleString('en') + ' recipes · ' + (R.runes || []).length +
      ' runes · ' + results.length + ' results · ' + esc(R.source || '')) +
    '<div class="controls rn-ctl">' +
      '<p class="lbl">Runes</p>' +
      '<div class="rn-picks" id="rnpick" role="group" aria-label="Runes">' + (R.runes || []).map(r =>
        '<button type="button" class="chip" data-rune="' + esc(r.name) + '" aria-pressed="false">' + esc(r.name) +
        '<span class="ct">' + r.recipes + '</span></button>').join('') + '</div>' +
      '<div class="row"><input class="field rn-make" id="rnmake" type="search" list="rnmakes" autocomplete="off" ' +
        'spellcheck="false" placeholder="Makes…" aria-label="Makes">' +
        '<datalist id="rnmakes">' + results.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
        '<div class="seg" id="rntab" role="group" aria-label="Tome tab">' + [['all', 'All'], ...tabs.map(t => [t, t])].map(([k, l]) =>
          '<button type="button" data-v="' + esc(k) + '" aria-pressed="false">' + esc(l) + '</button>').join('') + '</div>' +
        '<button type="button" class="btn" id="rnclear">Clear</button></div>' +
      '<p class="note" id="rncount"></p>' +
    '</div>' +
    '<div class="rn-list" id="rnlist"></div>' +
    '<div class="sect"><h3>Highlighted runes</h3></div>' +
    '<p class="note">The rune the game highlights in each slot of a recipe, by recipe length and area level.</p>' +
    '<div class="row rn-lenrow"><span class="lbl">Runes in the recipe</span><div class="seg" id="rnlen" role="group" ' +
      'aria-label="Runes in the recipe">' + lens.map(n => '<button type="button" data-v="' + n + '" aria-pressed="' +
      (n === S.len) + '">' + n + '</button>').join('') + '</div></div>' +
    '<div class="dt-scroll"><table class="dt-jobs rn-bands" id="rnbands"></table></div>' +
    '<p class="card-src">Source: ' + esc(R.source || 'the game files') + '</p>';

  $('#rnpick', el).addEventListener('click', e => {
    const b = e.target.closest('[data-rune]'); if(!b) return;
    const n = b.dataset.rune;
    S.runes = S.runes.includes(n) ? S.runes.filter(x => x !== n) : [...S.runes, n];
    render(); sync();
  });
  const mk = $('#rnmake', el);
  onType(mk, () => { S.make = mk.value; render(); sync(); });
  mk.addEventListener('keydown', e => { if(e.key === 'Escape'){ mk.value = ''; S.make = ''; render(); sync(); } });
  $('#rntab', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S.tab = b.dataset.v; render(); sync();
  });
  $('#rnclear', el).addEventListener('click', () => {
    S.runes = []; S.make = ''; S.tab = 'all'; mk.value = ''; render(); sync();
  });
  $('#rnlen', el).addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    S.len = +b.dataset.v;
    for(const x of b.parentNode.children) x.setAttribute('aria-pressed', String(x === b));
    bands();
  });
  // a rune or a result with a card: its card, in the popup
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-card]'); if(!a) return;
    const [k, n] = [a.dataset.card[0], a.dataset.card.slice(2)];
    const it = k === 'o' ? runeCard(n) : cardOf(n);
    if(!it) return;
    e.preventDefault();
    openDetail(it, {}, hrefOf(it));
  });
  update();
  bands();
  return {update};
}
export function unmount(){ EL = null; }

/* the address says what is picked: a rune card's gold button, a link, Back */
function update(){
  if(!EL || !R) return;
  const p = params();
  const names = new Set((R.runes || []).map(r => r.name));
  S.runes = (p.get('rune') || '').split(',').map(s => s.trim()).filter(n => names.has(n));
  S.make = p.get('make') || '';
  S.tab = p.get('tab') || 'all';
  $('#rnmake', EL).value = S.make;
  render();
}
function sync(){
  const q = new URLSearchParams();
  if(S.runes.length) q.set('rune', S.runes.join(','));
  if(S.make.trim()) q.set('make', S.make.trim());
  if(S.tab !== 'all') q.set('tab', S.tab);
  const h = '#/runes' + (q.toString() ? '?' + q.toString().replace(/\+/g, '%20') : '');
  if(location.hash !== h) history.replaceState(history.state, '', h);
}

function matches(){
  let at = null;   // the recipes that hold every rune picked: byRune, intersected
  for(const n of S.runes){
    const mine = new Set((R.byRune || {})[n] || []);
    at = at ? at.filter(i => mine.has(i)) : [...mine];
  }
  const list = at ? at.sort((a, b) => a - b) : R.recipes.map((_, i) => i);
  const q = S.make.trim().toLowerCase();
  return list.filter(i => {
    const r = R.recipes[i];
    return r && (S.tab === 'all' || r.tab === S.tab) && (!q || r.makes.toLowerCase().includes(q));
  });
}
function render(){
  if(!EL) return;
  for(const b of EL.querySelectorAll('#rnpick [data-rune]')) b.setAttribute('aria-pressed', String(S.runes.includes(b.dataset.rune)));
  for(const b of EL.querySelectorAll('#rntab button')) b.setAttribute('aria-pressed', String(b.dataset.v === S.tab));
  const list = matches();
  $('#rncount', EL).innerHTML = '<b>' + list.length.toLocaleString('en') + '</b> ' + (list.length === 1 ? 'recipe' : 'recipes');
  $('#rnlist', EL).innerHTML = list.length ? list.map(i => row(R.recipes[i])).join('')
    : '<div class="empty"><h3>Nothing matches</h3></div>';
}
function row(r){
  const it = r.card ? cardOf(r.makes) : null;
  const out = (r.count > 1 ? r.count + ' × ' : '') + esc(r.makes);
  const offered = (r.offered || []).map(i => (R.bands || [])[i]).filter(Boolean);
  return '<div class="rn-row">' +
    '<div class="rn-in">' + r.runes.map(n => runeCard(n)
      ? '<a class="rn-rune" href="#" data-card="o:' + esc(n) + '">' + esc(n) + '</a>'
      : '<span class="rn-rune">' + esc(n) + '</span>').join('<span class="rn-plus">+</span>') + '</div>' +
    '<div class="rn-out"><span class="rn-arrow" aria-hidden="true">→</span>' +
      (it ? '<a href="#" data-card="' + esc(it.k) + ':' + esc(r.makes) + '">' + out + '</a>' : '<b>' + out + '</b>') +
      '<span class="rn-meta">' + esc([r.gemLevel ? 'Level ' + r.gemLevel : '', r.level ? area(r.level) : '', r.tab || '']
        .filter(Boolean).join(' · ')) + '</span></div>' +
    (r.blocked ? '<p class="note">' + esc(r.blocked) + '</p>' : '') +
    (offered.length ? '<details class="rn-off"><summary>Offered with ' + offered.length + ' highlight' +
      (offered.length === 1 ? '' : 's') + ' <span class="pill" title="' + esc(R.flags && R.flags[FLAG] || '') + '">' + FLAG +
      '</span></summary><ul>' + offered.map(b => '<li>' + esc(b.rune) + ' · ' + b.runes + ' runes, slot ' + b.slot + ' · ' +
      esc(area(b.level)) + '</li>').join('') + '</ul></details>' : '') +
    '</div>';
}
function bands(){
  if(!EL) return;
  const rows = (R.bands || []).filter(b => b.runes === S.len)
    .sort((a, b) => a.slot - b.slot || a.level[0] - b.level[0] || a.rune.localeCompare(b.rune));
  $('#rnbands', EL).innerHTML = '<thead><tr><th>Slot</th><th>Rune</th><th>Area level</th></tr></thead><tbody>' +
    rows.map(b => '<tr><td>' + b.slot + '</td><td>' + (runeCard(b.rune)
      ? '<a href="#" data-card="o:' + esc(b.rune) + '">' + esc(b.rune) + '</a>' : esc(b.rune)) + '</td><td>' +
      esc(area(b.level).replace('area level ', '')) + '</td></tr>').join('') + '</tbody>';
}
