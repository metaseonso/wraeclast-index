/* The Patches page (#/patches): every patch, hotfix and restart in the patch registry (data/patches.json,
   tools/patches.py), newest first, with the hour its notes went up (UTC), its league, the thread on GGG's forum,
   and how many cards its notes name. The count is the same rule the cards use (FRAME.changed, namedIn in
   assets/kinds.js), read off data/patchnotes.json, so a patch that counts 12 cards here is on those 12 cards'
   "Changed in". The page is its own tab: nothing of it is fetched until somebody opens it.

   Above the list, what the game data changed from one patch to the next (tools/patchdiff.py, data/patchdiff/):
   one step at a time, every change grouped by kind, a chip per kind and one for what the patch notes never
   name. A step's file is fetched when it is picked. The rows and the words are the card's own (FIELDS.patchdiff,
   diffRowsHTML), so a change reads the same here as on the card it is on. */
import { esc, patchName, params, named, openDetail, hrefOf, diffRowsHTML, diffLinesHTML } from './app.js';
import { namedIn, FIELDS } from './kinds.js';

let EL = null, OFF = null;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
// the registry's own time, in UTC: "17 Sep 2026, 22:30"; a day with no hour stays a day
function when(p){
  const iso = p.posted || p.live || '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if(isNaN(d)) return '';
  const day = d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  return p.posted ? day + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : day;
}
const getJSON = f => fetch(f).then(r => r.ok ? r.json() : null).catch(() => null);

export async function mount(el){
  EL = el;
  el.innerHTML = '<div class="pagehd"><h2>Patches</h2></div><p class="note">Loading…</p>';
  const [reg, notes, diff] = await Promise.all([getJSON('data/patches.json'), getJSON('data/patchnotes.json'),
    getJSON('data/patchdiff/index.json')]);
  if(EL !== el) return;
  if(!reg || !(reg.patches || []).length){
    el.innerHTML = '<div class="pagehd"><h2>Patches</h2></div><p class="note err">The patch list did not load.</p>';
    return;
  }
  el.innerHTML = page(reg, notes && cardsPer(notes), diff);
  if(diff && (diff.steps || []).length) data(el, diff);
}
export function unmount(){ EL = null; if(OFF) OFF(); OFF = null; }

/* patch id -> how many cards its notes name, by the cards' own rule */
function cardsPer(t){
  const per = (t.patches || []).map(() => new Set());
  for(const [key, list] of Object.entries(t.on || {})) for(const i of list){
    const l = t.lines[i];
    if(l && per[l[0]] && namedIn(key, l[2])) per[l[0]].add(key);
  }
  return new Map((t.patches || []).map((p, i) => [p.id, per[i].size]));
}

function page(reg, cards, diff){
  const rows = [...reg.patches].sort((a, b) => (b.posted || b.live || '').localeCompare(a.posted || a.live || ''));
  const src = (reg.sources || {}).notes || {};
  const first = rows[rows.length - 1], last = rows[0];
  const body = rows.map(p => {
    const name = p.title ? patchName(p) : p.v;
    const flags = (p.flags || []).filter(f => !name.toLowerCase().includes(f));
    const n = cards && p.notes ? cards.get(p.id) : undefined;
    return '<tr class="pt-' + esc(p.kind) + '"><td>' + (p.notes ? '<a href="' + esc(p.notes) + '" target="_blank" rel="noopener"' +
      (p.title ? ' title="' + esc(p.title) + '"' : '') + '>' + esc(name) + '</a>' : esc(name)) +
      (flags.length ? ' <span class="pt-f">' + esc(flags.join(' · ')) + '</span>' : '') + '</td>' +
      // a phone has no room for the league's own column: it goes under the date there (assets/app.css)
      '<td class="pt-t">' + esc(when(p)) + '<span class="pt-lg">' + esc(p.league || '') + '</span></td><td class="pt-lc">' +
      esc(p.league || '') + '</td>' +
      '<td class="pt-n">' + (n === undefined ? '' : n.toLocaleString('en')) + '</td></tr>';
  }).join('');
  return '<div class="pagehd"><h2>Patches</h2><p>Every patch, hotfix and restart, newest first.</p>' +
    '<p class="dt-sub">' + rows.length.toLocaleString('en') + ' · ' + esc(first.v) + ' to ' + esc(patchName(last) || last.v) +
    ' · times in UTC</p></div>' +
    (diff && (diff.steps || []).length ? '<section class="dt-block pd" aria-labelledby="pd-h"><h3 id="pd-h">Data changes</h3>' +
      '<div class="kinds pd-steps" role="group" aria-label="Patch"></div><p class="dt-sub pd-sub"></p>' +
      '<div class="kinds pd-kinds" role="group" aria-label="Kind"></div><div class="pd-list"></div></section>' : '') +
    '<section class="dt-block"><div class="dt-scroll"><table class="dt-jobs pt-list"><thead><tr><th>Patch</th><th>Notes posted</th>' +
    '<th class="pt-lc">League</th><th class="pt-n" title="Cards its notes name">Cards</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="card-src">Source: ' + (src.url ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.n || '') + '</a>' :
      esc(src.n || '')) + '</p></section>';
}

/* ---------- the data changes ---------- */
const QUIET = 'quiet';
function data(el, ix){
  const say = FIELDS.patchdiff.say, names = ix.names || {};
  const steps = ix.steps, want = params().get('d');
  const st = {step: steps.find(s => s.to === want) || steps[0], kind: 'all', body: null};
  const $ = s => el.querySelector(s);
  const chip = (v, label, n, on) => '<button type="button" class="chip" data-v="' + esc(v) + '" aria-pressed="' + on + '">' +
    esc(label) + (n === undefined ? '' : '<span class="ct">' + n.toLocaleString('en') + '</span>') + '</button>';
  const total = s => Object.values(s.n || {}).reduce((a, b) => a + b, 0);

  function paintSteps(){
    $('.pd-steps').innerHTML = steps.map(s => chip(s.to, s.to, total(s), s === st.step)).join('');
    const s = st.step;
    $('.pd-sub').textContent = s.from + ' → ' + s.to + ' · ' + s.has.map(p => names[p] || p).join(', ') +
      (s.src ? ' · Source: ' + s.src : '');
  }
  function paintList(){
    const s = st.step, parts = (st.body && st.body.parts) || {};
    const counts = Object.entries(s.n || {});
    $('.pd-kinds').innerHTML = chip('all', 'All', total(s), st.kind === 'all') +
      counts.map(([p, n]) => chip(p, names[p] || p, n, st.kind === p)).join('') +
      (s.q ? chip(QUIET, say.quiet, s.q, st.kind === QUIET) : '');
    if(!st.body){ $('.pd-list').innerHTML = '<p class="note">Loading…</p>'; return; }
    const html = Object.keys(parts).filter(p => st.kind === 'all' || st.kind === QUIET || st.kind === p).map(p => {
      const list = parts[p].filter(e => st.kind !== QUIET || e.q);
      if(!list.length) return '';
      return '<div class="pd-g"><h4>' + esc(names[p] || p) + ' <span class="ct">' + list.length.toLocaleString('en') + '</span></h4>' +
        list.map(e => entry(e, say)).join('') + '</div>';
    }).join('');
    $('.pd-list').innerHTML = html || '<p class="note">Nothing changed.</p>';
  }
  async function load(){
    st.body = null;
    paintSteps();
    paintList();
    const s = st.step, body = await getJSON(s.file);
    if(EL !== el || st.step !== s) return;
    st.body = body || {parts: {}};
    paintList();
  }
  const pick = (v, write) => {
    const s = steps.find(x => x.to === v);
    if(!s || s === st.step) return;
    st.step = s;
    st.kind = 'all';
    if(write) history.replaceState(history.state, '', '#/patches?d=' + encodeURIComponent(s.to));
    load();
  };
  // a card's "Changed in" opens this page on its patch: the same page, another patch, when it is already open
  const heard = () => { if(EL === el && location.hash.startsWith('#/patches')) pick(params().get('d') || steps[0].to, false); };
  window.addEventListener('hashchange', heard);
  OFF = () => window.removeEventListener('hashchange', heard);
  el.querySelector('.pd').addEventListener('click', async e => {
    const b = e.target.closest('button');
    if(!b) return;
    if(b.closest('.pd-steps')) pick(b.dataset.v, true);
    else if(b.closest('.pd-kinds')){
      st.kind = b.dataset.v;
      paintList();
    } else if(b.dataset.key){
      const at = b.dataset.key.indexOf(':');
      const [it] = await named(b.dataset.key.slice(0, at), b.dataset.key.slice(at + 1));
      if(it) openDetail(it, {}, hrefOf(it));
    }
  });
  load();
}

/* one thing that changed: its name (a door to its card, where it has one), what it is, and its changes */
function entry(e, say){
  const keys = e.c || [];
  const go = (key, label) => '<button type="button" class="pd-go" data-key="' + esc(key) + '">' + esc(label) + '</button>';
  const name = !e.on && keys.length ? go(keys[0], e.n) : '<span class="pd-nm">' + esc(e.n) + '</span>';
  const on = e.on ? '<span class="pd-on">' + e.on.map((c, i) => keys.includes('i:' + c) ? go('i:' + c, c) : esc(c))
    .join(', ') + '</span>' : '';
  return '<div class="pd-e"><p class="pd-n">' + name +
    (e.s ? '<span class="pd-s">' + esc(e.s) + '</span>' : '') +
    (e.m > 1 ? '<span class="pd-s">×' + e.m + '</span>' : '') +
    (e.st ? '<span class="pill">' + esc(say.tag[e.st]) + '</span>' : '') +
    (e.q ? '<span class="pill warn dif-q">' + esc(say.quiet) + '</span>' : '') + on + '</p>' +
    (e.st ? diffLinesHTML(e.ls) : diffRowsHTML(e.r, say)) + '</div>';
}
