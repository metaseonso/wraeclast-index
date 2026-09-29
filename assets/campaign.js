/* The Campaign page (#/campaign, #118, #184): act by act, the areas in level order, the quests, every reward kept
   for good with the choices beside them, and the base types that start dropping in the act. Read off
   data/quests.json (tools/quests.py: the acts' totals, where each kept reward is, the choices), data/areas.json
   (tools/areas.py) and the base cards' own drop levels, all from the game files. A name opens its
   card. The ticks are kept in this browser only (wi-campaign), one set for every act. */
import { D, esc, openDetail, hrefOf } from './app.js';

const KEEP = 'wi-campaign';
const S = {act: 'Act 1'};
let EL = null, Q = null, A = null, DONE = new Set();

function load(){ try { DONE = new Set(JSON.parse(localStorage.getItem(KEEP) || '[]')); } catch { DONE = new Set(); } }
function save(){ try { localStorage.setItem(KEEP, JSON.stringify([...DONE])); } catch {} }
const getJSON = f => fetch(f).then(r => r.ok ? r.json() : null).catch(() => null);
const tick = (id, label) => '<input type="checkbox" class="cp-tick" data-tick="' + esc(id) + '"' + (DONE.has(id) ? ' checked' : '') +
  ' aria-label="' + esc(label) + '">';
const open = (key, name) => D.byKey && D.byKey.has(key)
  ? '<button type="button" class="cp-open" data-key="' + esc(key) + '">' + esc(name) + '</button>' : esc(name);
const reward = r => esc(r.n) + (r.lv ? ' · item level ' + r.lv : '') + (r.tier ? ' · level ' + r.tier : '');

export async function mount(el){
  EL = el;
  load();
  if(!Q){
    el.innerHTML = '<div class="pagehd"><h2>Campaign</h2></div><p class="note">Loading…</p>';
    [Q, A] = await Promise.all([getJSON('data/quests.json'), getJSON('data/areas.json')]);
    if(EL !== el) return {};
    if(!Q || !Q.acts){ el.innerHTML = '<div class="pagehd"><h2>Campaign</h2></div><p class="note err">The campaign did not load.</p>'; return {}; }
  }
  draw();
  el.addEventListener('click', e => {
    const a = e.target.closest('[data-act]');
    if(a){ S.act = a.dataset.act; draw(); return; }
    const o = e.target.closest('[data-key]'), c = o && D.byKey.get(o.dataset.key);
    if(c) openDetail(c, {}, hrefOf(c));
  });
  el.addEventListener('change', e => {
    const t = e.target.closest('[data-tick]');
    if(!t) return;
    if(t.checked) DONE.add(t.dataset.tick); else DONE.delete(t.dataset.tick);
    save(); draw();
  });
  return {};
}
export function unmount(){ EL = null; }

function draw(){
  const acts = Q.acts, act = acts.find(a => a.act === S.act) || acts[0];
  const kept = act.from.map(k => 'k:' + k.id), got = kept.filter(id => DONE.has(id)).length;
  EL.innerHTML =
    '<div class="pagehd"><h2>Campaign</h2><p>Act by act: the areas, the quests, and every reward kept for good. ' +
      'Source: the game files.</p></div>' +
    '<div class="kinds cp-acts" role="group" aria-label="Act">' + acts.map(a => {
      const ids = a.from.map(k => 'k:' + k.id), n = ids.filter(id => DONE.has(id)).length;
      return '<button type="button" class="chip" data-act="' + esc(a.act) + '" aria-pressed="' + (a === act) + '">' + esc(a.act) +
        '<span class="ct">' + n + '/' + ids.length + '</span></button>';
    }).join('') + '</div>' +
    keptHTML(act, got) + pickHTML(act) + areasHTML(act) + questsHTML(act) + basesHTML(act);
}

/* An act's area levels: from the level after the last act's town to its own town's (Act 1: 1 to 15). An area off
   that run (a temple, a hub) is left out of the range. */
function span(act){
  if(!A) return null;
  let lo = 1;
  for(const a of Q.acts){
    const town = A.areas.find(x => x.act === a.act && x.id.some(i => /town/i.test(i)));
    if(!town) return null;
    if(a.act === act.act) return [lo, town.lv];
    lo = town.lv + 1;
  }
  return null;
}
/* The base types that start dropping inside the act's levels (each base card's own drop level), by item class,
   each class folded. */
function basesHTML(act){
  const r = act.act === 'Endgame' ? null : span(act);
  if(!r || !D.index) return '';
  const by = new Map();
  for(const it of D.index.items){
    if(it.k !== 'b') continue;
    const m = /drops from level (\d+)/.exec(it.s || '');
    if(!m || +m[1] < r[0] || +m[1] > r[1]) continue;
    const cls = String(it.s).split(' · ')[0];
    if(!by.has(cls)) by.set(cls, []);
    by.get(cls).push([+m[1], it]);
  }
  if(!by.size) return '';
  const n = [...by.values()].reduce((a, x) => a + x.length, 0);
  return '<section class="dt-block"><div class="sect"><h3>New bases</h3><p>' + n + ' start dropping at area level ' + r[0] + ' to ' + r[1] +
    '</p></div>' + [...by].sort((a, b) => b[1].length - a[1].length).map(([cls, xs]) =>
      '<details class="cp-bases"><summary>' + esc(cls) + ' <span class="dt-sub">' + xs.length + '</span></summary><ul class="cp-areas">' +
      xs.sort((a, b) => a[0] - b[0] || a[1].n.localeCompare(b[1].n)).map(([lv, it]) =>
        '<li><span class="cp-lv">' + lv + '</span>' + open('b:' + it.id, it.n) + '</li>').join('') + '</ul></details>').join('') +
    '</section>';
}

function keptHTML(act, got){
  return '<section class="dt-block"><div class="sect"><h3>Kept for good</h3><p>' + got + ' of ' + act.from.length + ' · ' +
    esc(act.sum.join(' · ')) + '</p></div><ul class="cp-list">' + act.from.map(k =>
      '<li>' + tick('k:' + k.id, k.n) + '<span><b>' + esc(k.n) + '</b> ' + esc(k.ls.join(' · ')) +
      '<small class="dt-sub">' + [k.where, k.by, k.quest && 'quest: ' + k.quest].filter(Boolean).map(esc).join(' · ') + '</small></span></li>').join('') +
    '</ul></section>';
}
function pickHTML(act){
  if(!act.pick.length) return '';
  return '<section class="dt-block"><div class="sect"><h3>Pick one</h3></div><ul class="cp-list">' + act.pick.map(p =>
    '<li><span>' + p.of.map(o => '<b>' + esc(o.n) + '</b> ' + esc(o.ls.join(' · '))).join('<br>') +
    '<small class="dt-sub">' + [p.where, p.quest && 'quest: ' + p.quest].filter(Boolean).map(esc).join(' · ') +
    (p.undo ? ' <span class="pill">' + esc(p.undo) + '</span>' : '') + '</small></span></li>').join('') + '</ul></section>';
}
function areasHTML(act){
  if(!A || act.act === 'Endgame') return '';
  const rows = A.areas.filter(a => a.act === act.act).map((a, i) => ({a, i}))
    .sort((x, y) => (x.a.lv - y.a.lv) || (x.i - y.i)).map(x => x.a);
  if(!rows.length) return '';
  return '<section class="dt-block"><div class="sect"><h3>Areas</h3><p>By area level</p></div><ol class="cp-areas">' + rows.map(a =>
    '<li><span class="cp-lv">' + a.lv + '</span>' + open('r:' + a.id[0], a.n) +
    ((a.boss || []).length ? '<small class="dt-sub">' + a.boss.map(b => esc(b.n)).join(', ') + '</small>' : '') + '</li>').join('') +
    '</ol></section>';
}
function questsHTML(act){
  const rows = Q.quests.filter(q => q.act === act.act);
  if(!rows.length) return '';
  const done = rows.filter(q => DONE.has('j:' + q.id[0])).length;
  return '<section class="dt-block"><div class="sect"><h3>Quests</h3><p>' + done + ' of ' + rows.length + '</p></div><ul class="cp-list">' +
    rows.map(q => '<li>' + tick('j:' + q.id[0], q.n) + '<span>' + open('j:' + q.id[0], q.n) +
      (q.kind !== 'Main' ? ' <span class="pill">' + esc(q.kind) + '</span>' : '') +
      ((q.keep || []).length ? ' <span class="pill gold">Kept for good</span>' : '') +
      ((q.take || []).length ? '<small class="dt-sub">' + q.take.map(w => w.map(reward).join(' or ')).join(' · ') + '</small>' : '') +
      '</span></li>').join('') + '</ul></section>';
}
