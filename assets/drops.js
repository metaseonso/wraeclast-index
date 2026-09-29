/* Player drop reports (#125): "I got <item> from <boss or area>", with the area level and the day.

   Drop pools are held on GGG's servers, so no file says what drops where. Players can, and this draws what they
   report on both ends of it (assets/kinds.js, the `gotfrom` and `gothere` fields): on a unique, where it was
   reported from; on a boss or an area, what was reported from there. Counts only, never a rate and never a
   guess, and only once 3 reports agree (worker/community.js drops). A report whose area level is under the
   item's drop level is held and counted nowhere on a card.

   The field says everything that differs between the two ends: which end the card is (`side`), the cards the
   other end may be and the file each is already drawn from (`ends`), and the label. Nothing here names a kind.
   The card asks once a visit, when it is opened; the lists behind the form are read when the form is opened. */
import { D, esc, openDetail, hrefOf, table, named } from './app.js';

const HAD = new Map();      // card key -> the last answer the site gave for it
const ASKED = new Map();    // ...and the call that is fetching it, so one visit asks once
const BOXES = new Set();    // the boxes on show, so a fresh answer redraws them where they stand
const OPENED = new Set();   // the cards whose form is open
const SAID = new Map();     // card key -> what the last send said, until the card is drawn anew
const NAMES = new Map();    // field -> [{name, key, one}] of the other end, once its files land

const keyOf = it => it.k + ':' + it.n;   // by name, never by id: the worker keeps names only

function ask(f, key){
  if(ASKED.has(key)) return ASKED.get(key);
  const p = fetch(f.api + '?card=' + encodeURIComponent(key))
    .then(r => r.ok ? r.json() : null)
    .then(j => { if(j && j.rows) HAD.set(key, j); return j; })
    .catch(() => null);
  ASKED.set(key, p);
  return p;
}

/* the other end's names, off the files the site already draws those cards from */
function names(f){
  if(NAMES.has(f)) return Promise.resolve(NAMES.get(f));
  return Promise.all((f.ends || []).map(e => table(e.file).then(t => {
    const v = t && t[e.list];
    const list = Array.isArray(v) ? v.map(x => x && x[e.name]) : Object.keys(v || {});
    return list.filter(n => typeof n === 'string' && n).map(n => ({name: n, key: e.k + ':' + n, one: e.one || ''}));
  }))).then(parts => {
    const seen = new Set(), out = [];
    for(const x of parts.flat()) if(!seen.has(x.name)){ seen.add(x.name); out.push(x); }
    out.sort((a, b) => a.name.localeCompare(b.name));
    NAMES.set(f, out);
    return out;
  }, () => []);
}

export function fill(host, it, f){
  if(!host || !it || !it.n) return;
  const box = {host, it, f, key: keyOf(it)};
  BOXES.add(box);
  SAID.delete(box.key);
  host.addEventListener('click', e => click(e, box));
  host.addEventListener('keydown', e => { if(e.key === 'Enter' && e.target.matches('input.field')){ e.preventDefault(); send(box); } });
  draw(box);
  ask(f, box.key).then(() => draw(box), () => {});
}

function draw(box){
  if(!box.host.isConnected){ BOXES.delete(box); return; }
  const r = HAD.get(box.key), open = OPENED.has(box.key);
  // an open form keeps what the player typed: only the counts above it are drawn again
  const form = open && box.host.querySelector('.got-form');
  if(form){
    const rows = box.host.querySelector('.got-counts');
    if(rows) rows.innerHTML = rowsHTML(box, r);
    return;
  }
  box.host.innerHTML = '<div class="got-counts">' + rowsHTML(box, r) + '</div>' +
    (open ? formHTML(box) : '<div class="clar-go"><button type="button" class="btn got-say">Report a drop</button>' +
      (SAID.has(box.key) ? '<span class="clar-msg">' + esc(SAID.get(box.key)) + '</span>' : '') + '</div>');
}

/* ---------- the counts ---------- */
function rowsHTML(box, r){
  const rows = (r && r.rows) || [];
  if(!rows.length) return '';
  return '<ul class="got-rows">' + rows.map(([k, n]) => {
    const name = String(k).slice(2);
    const to = '<button type="button" class="got-open" data-open="' + esc(k) + '">' + esc(name) + '</button>';
    const times = '<b>' + (+n || 0).toLocaleString('en') + '</b> times';
    return '<li>' + (box.f.side === 'item' ? 'Reported ' + times + ' from ' + to
      : to + '<span class="got-n">reported ' + times + '</span>') + '</li>';
  }).join('') + '</ul><p class="card-src">' + esc(box.f.label || '') + '</p>';
}

/* ---------- the form ---------- */
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60e3).toISOString().slice(0, 10);

function formHTML(box){
  const f = box.f, list = 'got-dl-' + f.side, mine = '<b>' + esc(box.it.n) + '</b>';
  const other = '<input class="field got-other" list="' + list + '" maxlength="80" autocomplete="off" aria-label="' +
    (f.side === 'item' ? 'Boss or area' : 'Unique') + '" placeholder="' + (f.side === 'item' ? 'Boss or area' : 'Unique') + '">';
  const opts = NAMES.get(f) || [];
  return '<div class="got-form">' +
    '<p class="got-line"><span>I got</span>' + (f.side === 'item' ? mine : other) + '</p>' +
    '<p class="got-line"><span>from</span>' + (f.side === 'item' ? other : mine) + '</p>' +
    '<datalist id="' + list + '">' + opts.map(x => '<option value="' + esc(x.name) + '">' + esc(x.one) + '</option>').join('') + '</datalist>' +
    '<div class="got-two">' +
      '<label><span>Area level</span><input class="field got-lvl" type="number" min="1" max="100" step="1" inputmode="numeric"></label>' +
      '<label><span>Date</span><input class="field got-day" type="date" min="2024-12-06" max="' + today() + '" value="' + today() + '"></label>' +
    '</div>' +
    '<p class="clar-mine">PC only for now. Shown once 3 reports agree.</p>' +
    '<div class="clar-go"><button type="button" class="btn gold got-send">Send</button>' +
      '<button type="button" class="btn got-x">Cancel</button>' +
      '<span class="clar-msg" aria-live="polite"></span></div></div>';
}

function click(e, box){
  const t = e.target;
  const to = t.closest('.got-open');
  if(to){ openKey(to.dataset.open); return; }
  if(t.closest('.got-say')){
    OPENED.add(box.key);
    SAID.delete(box.key);
    draw(box);
    const input = box.host.querySelector('.got-other');
    if(input) setTimeout(() => input.focus(), 30);
    names(box.f).then(list => {   // the lists land after the form: put them in without touching what is typed
      const dl = box.host.querySelector('datalist');
      if(dl && !dl.options.length)
        dl.innerHTML = list.map(x => '<option value="' + esc(x.name) + '">' + esc(x.one) + '</option>').join('');
    });
    return;
  }
  if(t.closest('.got-x')){ OPENED.delete(box.key); draw(box); return; }
  if(t.closest('.got-send')) send(box);
}

async function openKey(key){
  const k = key.slice(0, 1), n = key.slice(2);
  let c = D.byKey.get(key);
  if(!c) try { c = (await named(k, n))[0]; } catch { c = null; }
  if(c) openDetail(c, {nested: true}, hrefOf(c));
}

const val = (box, sel) => ((box.host.querySelector(sel) || {}).value || '').trim();

async function send(box){
  const msg = box.host.querySelector('.clar-msg'), go = box.host.querySelector('.got-send');
  if(!msg || !go || go.disabled) return;
  const typed = val(box, '.got-other'), lvl = +val(box, '.got-lvl'), day = val(box, '.got-day');
  const list = await names(box.f);
  const low = typed.toLowerCase();
  const end = list.find(x => x.name === typed) || list.find(x => x.name.toLowerCase() === low);
  if(!end){ msg.textContent = box.f.side === 'item' ? 'No such boss or area.' : 'No such unique.'; return; }
  if(!Number.isInteger(lvl) || lvl < 1 || lvl > 100){ msg.textContent = 'Area level is 1 to 100.'; return; }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)){ msg.textContent = 'No date.'; return; }
  const [item, from] = box.f.side === 'item' ? [box.key, end.key] : [end.key, box.key];
  go.disabled = true;
  msg.textContent = 'Sending…';
  let r = null, j = null;
  try {
    r = await fetch(box.f.api, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-WI': '1'},
      body: JSON.stringify({item, from, lvl, day, card: box.key})});
    j = await r.json().catch(() => null);
  } catch { r = null; }
  if(r && r.ok && j){
    if(j.rows) HAD.set(box.key, j);
    const shown = (j.rows || []).some(([k]) => k === (box.f.side === 'item' ? from : item));
    SAID.set(box.key, j.held ? 'Held back: area level ' + lvl + ' is under its drop level, ' + j.floor + '.'
      : shown ? 'Sent.' : 'Sent. Shown once ' + (j.agree || 3) + ' reports agree.');
    OPENED.delete(box.key);
    for(const b of [...BOXES]) if(b.key === box.key) draw(b);
    return;
  }
  go.disabled = false;
  msg.textContent = (j && j.error) || 'It did not send.';
}
