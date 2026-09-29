/* The Campaign page (#/campaign, #118): act by act, the areas in level order, the quests, and every reward kept
   for good, with the choices beside them. Read off data/quests.json (tools/quests.py: the acts' totals, where each
   kept reward is, the choices) and data/areas.json (tools/areas.py), both from the game files. A name opens its
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
      'Ticks stay in this browser. Source: the game files.</p></div>' +
    '<div class="kinds cp-acts" role="group" aria-label="Act">' + acts.map(a => {
      const ids = a.from.map(k => 'k:' + k.id), n = ids.filter(id => DONE.has(id)).length;
      return '<button type="button" class="chip" data-act="' + esc(a.act) + '" aria-pressed="' + (a === act) + '">' + esc(a.act) +
        '<span class="ct">' + n + '/' + ids.length + '</span></button>';
    }).join('') + '</div>' +
    keptHTML(act, got) + pickHTML(act) + areasHTML(act) + questsHTML(act);
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
