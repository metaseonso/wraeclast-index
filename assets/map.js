/* The map of the index (#/map): every card a dot, every connection a line, in one picture.

   The picture is made with the data, not here: tools/map.py lays out all 6,609 dots once at build time and
   writes data/map.png plus data/map.json — the key, the busiest card of each kind, a few edges for the
   lights, what the picture leaves out, and which data it was built from. This view fetches those two, puts
   the site's own words around them, and lights them. It is its own tab, so none of it is fetched until
   somebody opens it, and it reads nothing of the index: the picture is already finished.

   What moves, and what it costs:
     the picture     never moves against itself, so the shape never smears. Its drift and the haze over it
                     are a transform and an opacity in app.css, which the compositor carries on its own
                     layer: no repaint, no layout, and not one frame of script.
     the lights      a canvas over the picture, at most twice the size it is shown at. One frame is a clear,
                     one soft glow per kind's busiest card, and one line and one head per travelling light —
                     a few dozen draws, no allocation, nothing measured.
   It stops dead when the tab is hidden and when the picture is scrolled off, and the drift and haze stop with
   it. Ask for less motion and none of it runs: app.css turns every animation off, and the loop is never
   started. A weak machine (html.lite, set in index.html's <head>) gets the lights at half the frames and one
   canvas pixel per pixel on screen. */
import { $, esc, first, D, words, hits, openDetail, hrefOf } from './app.js';
import { KIND } from './kinds.js';
import { onType } from './app.js';   // the search box waits out a burst of keys, like every box on the site

const TRIP = 11;         // seconds for a light to travel the length of its edge
const BEAT = 8.5;        // seconds for a hub to breathe in and out
const GOLD = 0.6180339887;
const num = n => (+n || 0).toLocaleString('en');
const still = matchMedia('(prefers-reduced-motion: reduce)');
const LITE = document.documentElement.classList.contains('lite');
// canvas pixels per pixel on screen: the screen's own, never more than two, and one on a weak machine
const ratio = () => LITE ? 1 : Math.min(devicePixelRatio || 1, 2);

let M = null, CV = null, CX = null, HALO = null, HEAD = null;
let raf = 0, clock = 0, last = 0, onScreen = true;
/* Every card's seat on the picture (data/map-nodes.json, tools/map.py). The picture is drawn once at build
   time and these are where it put each dot, so a dot can be pointed at, opened, and found by name without
   the picture being redrawn or the index being read for anything but the card behind a seat.
   Fetched only once somebody opens this tab, and only after the picture itself is up. */
let SX = null, SY = null, SR = null, SKEY = null, GRID = null, GW = 0, GH = 0;
const CELL = 14;          // map units to a bucket: about 5,000 buckets for 7,707 seats
let OVER = -1;            // the seat the pointer is on, or -1
let FOUND = null;         // the seats a search matched, or null for no search

export async function mount(el){
  el.innerHTML = head() + '<p class="note">Loading the map…</p>';
  try {
    const r = await fetch('data/map.json');
    if(!r.ok) throw new Error('data/map.json ' + r.status);
    M = await r.json();
  } catch {
    el.innerHTML = head() + '<p class="err">The map did not load.</p>';
    return;
  }
  el.innerHTML = head() + figure() + legend() + foot();
  CV = $('.mp-live', el);
  CX = CV.getContext('2d');
  HALO = sprite(64, '140,203,63');
  HEAD = sprite(64, '223,240,194');
  size();
  new ResizeObserver(size).observe($('.mp-fig', el));
  new IntersectionObserver(es => { onScreen = es.some(e => e.isIntersecting); tick(); }).observe($('.mp-fig', el));
  document.addEventListener('visibilitychange', tick);
  still.addEventListener('change', tick);
  tick();
  // the picture was made from one build of the index; if the site has moved on since, say so rather than
  // letting its counts read as today's
  seats(el);   // the seats behind the dots, once the picture is on screen
  first.then(() => age(el), () => {});
  return {update: tick};   // the router calls this every time the tab is opened again
}

/* How this picture stands against the site as it is now: drawn from one build of the index, and the site
   carries more cards than that by the time it runs. Both halves are a number, never an "etc". Called twice,
   because the index and the seats arrive separately and either one can be the last to land. */
function age(el){
  const box = $('.mp-age', el);
  if(!box || !M) return;
  const now = D.index && D.index.v;
  let says = now && M.index && now !== M.index ? ' <b>Drawn before the last index rebuild.</b>' : '';
  if(SKEY && D.index && D.index.items){
    const seated = new Set(SKEY);
    const n = D.index.items.filter(it => !seated.has(it.k + ':' + it.id)).length;
    if(n) says += ' <b>' + num(n) + '</b> cards have no dot: currency beyond the catalogue, and bosses.';
  }
  box.innerHTML = says;
}

/* ---------- the seats ----------
   The seats arrive as one file per build, laid out by kind. They are flattened into plain arrays and dropped
   into a grid of buckets, so pointing at the picture is a look in one bucket and its neighbours rather than a
   walk over 7,707 dots on every mouse move. */
async function seats(el){
  let d;
  try { d = await (await fetch('data/map-nodes.json')).json(); } catch { return; }
  if(!d || !d.nodes || d.index !== M.index) return;   // seats from another build would sit in the wrong places
  const all = [];
  for(const [k, list] of Object.entries(d.nodes)) for(const n of list) all.push([k + ':' + n[0], n[1], n[2], n[3]]);
  const n = all.length;
  SX = new Float32Array(n); SY = new Float32Array(n); SR = new Float32Array(n); SKEY = new Array(n);
  for(let i = 0; i < n; i++){ SKEY[i] = all[i][0]; SX[i] = all[i][1]; SY[i] = all[i][2]; SR[i] = all[i][3]; }
  GW = Math.ceil((M.w || 1600) / CELL); GH = Math.ceil((M.h || 800) / CELL);
  GRID = Array.from({length: GW * GH}, () => null);
  for(let i = 0; i < n; i++){
    const b = (Math.min(GH - 1, Math.max(0, Math.floor(SY[i] / CELL)))) * GW +
              (Math.min(GW - 1, Math.max(0, Math.floor(SX[i] / CELL))));
    (GRID[b] || (GRID[b] = [])).push(i);
  }
  const fig = $('.mp-fig', el);
  fig.classList.add('mp-on');
  fig.addEventListener('pointermove', e => over(e, el));
  fig.addEventListener('pointerleave', () => { if(OVER !== -1){ OVER = -1; say(el); paint(); } });
  fig.addEventListener('click', () => { const it = cardAt(OVER); if(it) openDetail(it, {}, hrefOf(it)); });
  age(el);   // the seats are in: what the picture does not hold can be counted now
  const box = $('.mp-find', el);
  box.hidden = false;
  const mq = $('input', box);
  onType(mq, () => find(mq.value, el));
  $('input', box).addEventListener('keydown', e => {
    if(e.key !== 'Enter' || !FOUND || !FOUND.length) return;
    const it = cardAt(FOUND[0]);
    if(it) openDetail(it, {}, hrefOf(it));
  });
}
const cardAt = i => i >= 0 && SKEY && D.byKey ? D.byKey.get(SKEY[i]) || null : null;

/* The seat under the pointer: the picture's own pixels, worked back through the box it is really drawn in,
   so the slow drift over it costs nothing to follow. */
function over(e, el){
  const img = $('.mp-still', el), r = img.getBoundingClientRect();
  if(!r.width) return;
  const x = (e.clientX - r.left) / r.width * (M.w || 1600);
  const y = (e.clientY - r.top) / r.height * (M.h || 800);
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  let best = -1, bd = 64;                       // 8 map units, squared
  for(let gy = cy - 1; gy <= cy + 1; gy++){
    if(gy < 0 || gy >= GH) continue;
    for(let gx = cx - 1; gx <= cx + 1; gx++){
      if(gx < 0 || gx >= GW) continue;
      const cell = GRID[gy * GW + gx];
      if(!cell) continue;
      for(const i of cell){
        const dx = SX[i] - x, dy = SY[i] - y, d = dx * dx + dy * dy;
        if(d < bd){ bd = d; best = i; }
      }
    }
  }
  if(best === OVER) return;
  OVER = best;
  say(el);
  paint();
}
/* What is under the pointer, in the card's own words and never its id. */
function say(el){
  const lab = $('.mp-say', el);
  const it = cardAt(OVER);
  if(!it){ lab.hidden = true; return; }
  lab.innerHTML = '<b>' + esc(it.n) + '</b><span>' + esc((KIND[it.k] || {}).one || '') + '</span>';
  lab.hidden = false;
}

/* A name typed, and every seat it lands on. The same words the search itself uses, so a slip finds the dot
   the way it finds the card. */
function find(q, el){
  const out = $('.mp-found', el);
  if(!SKEY || !D.byKey){ return; }
  const t = String(q || '').trim();
  if(!t){ FOUND = null; out.textContent = ''; paint(); return; }
  const ws = words(t.toLowerCase());
  const hit = [];
  for(let i = 0; i < SKEY.length; i++){
    const it = D.byKey.get(SKEY[i]);
    if(it && hits(it, ws) !== null) hit.push(i);
  }
  FOUND = hit;
  /* A card can answer the words and still have no dot: the picture is drawn from the index at build time and
     the site carries more than that by the time it runs — the currency the market prices beyond the
     catalogue, and the bosses out of their own file. Saying "none" for a card that plainly exists is the
     wrong answer, so where the words land on cards that have no seat, that is what it says. */
  if(hit.length) out.textContent = hit.length.toLocaleString() + ' on the map';
  else {
    let any = 0;
    for(const it of (D.index && D.index.items) || []) if(hits(it, ws) !== null) any++;
    out.textContent = any ? any.toLocaleString() + (any === 1 ? ' card, none on this picture' : ' cards, none on this picture')
      : 'Nothing by that name';
  }
  paint();
}

/* ---------- the words ---------- */
function head(){
  return '<div class="pagehd"><h2>The index as a map</h2>' +
    '<p>Every card is a dot, coloured by its kind. Every connection between two cards is a line. ' +
    'A dot opens its card.</p></div>';
}

function figure(){
  return '<figure class="mp-fig"><div class="mp-drift">' +
    '<img class="mp-still" src="' + esc(M.png || 'data/map.png') + '" width="' + (+M.w || 1600) + '" height="' + (+M.h || 800) + '" ' +
    'decoding="async" alt="The index drawn as a net: ' + num(M.cards) + ' dots, one per card, coloured by kind, ' +
    'with ' + num(M.edges) + ' lines between them. A bright crowded middle where the keywords sit, arms of gems, ' +
    'uniques, bases and Atlas cards around it, and a ring of dots nothing connects to.">' +
    '<canvas class="mp-live" aria-hidden="true"></canvas></div>' +
    '<p class="mp-say" hidden></p></figure>' +
    '<div class="row mp-find" hidden><input class="field" type="search" placeholder="Find a card on the map…" ' +
      'autocomplete="off" spellcheck="false" aria-label="Find a card on the map">' +
      '<span class="note mp-found"></span></div>';
}

function legend(){
  const hex = c => /^#[0-9A-Fa-f]{6}$/.test(c || '') ? c : '#DCE3D2';
  return '<ul class="mp-key">' + (M.kinds || []).map(k =>
    '<li><i style="color:' + hex(k.c) + '"></i><b>' + esc(k.many) + '</b><span class="ct">' + num(k.n) + '</span></li>').join('') +
    '</ul>';
}

function foot(){
  const out = M.out || {};
  const big = (M.hubs || [])[0];
  const groups = out.by ? Object.entries(out.by).sort((a, b) => b[1] - a[1])
    .map(([name, n]) => num(n) + ' ' + name).join(', ') : '';
  const DOT = ' · ';
  return '<p class="note mp-foot">' + num(M.cards) + ' cards' + DOT + num((M.kinds || []).length) + ' kinds' +
      DOT + num(M.edges) + ' connections. A bigger dot carries more' +
      (big ? '; the heaviest is <b>' + esc(big.n) + '</b>, on ' + num(big.deg) : '') + '. ' +
      'P' + esc(patch(M.index)).slice(1) + (M.gen ? ', drawn ' + esc(M.gen) : '') +
      '.<span class="mp-age"></span></p>' +
    '<p class="note">Not drawn: ' +
      [out.groups ? num(out.groups) + ' group pairs' + (groups ? ' (' + esc(groups) + ')' : '') : '',
       out.rows ? num(out.rows) + ' keyword rows with no card of their own' : '',
       (out.kinds || []).length ? esc(out.kinds.join(', ')) : ''].filter(Boolean).join(DOT) + '.</p>';
}

// the client build (4.5.5.2) as players know it: patch 0.5.5, the same reading index.html gives the footer
const patch = v => 'patch ' + String(v || '').replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');

/* ---------- the lights ---------- */
/* One soft dot, drawn once and stamped wherever a light or a hub needs one: a gradient per frame would
   allocate, and this is the whole reason a frame costs nothing. */
function sprite(size, rgb){
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(' + rgb + ',1)');
  g.addColorStop(0.3, 'rgba(' + rgb + ',.42)');
  g.addColorStop(1, 'rgba(' + rgb + ',0)');
  x.fillStyle = g;
  x.fillRect(0, 0, size, size);
  return c;
}

// the canvas backing the picture, at the size it is really shown at, never more than twice over
function size(){
  if(!CV) return;
  const box = CV.getBoundingClientRect();
  const dpr = ratio();
  const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
  if(CV.width !== w || CV.height !== h){ CV.width = w; CV.height = h; }
}

function tick(){
  const go = onScreen && !document.hidden && !still.matches && M;
  if(CV) CV.closest('.mp-fig').classList.toggle('mp-rest', !go);   // the drift and haze in app.css hold still with the lights
  if(go && !raf){ last = 0; raf = requestAnimationFrame(frame); }
  else if(!go && raf){
    cancelAnimationFrame(raf);
    raf = 0;
    paint();
  }
}
/* What a pointer and a search put on the canvas. The lights clear it every frame and draw these last, so
   there is one of them; with the lights off — a hidden tab, or less motion asked for — this is the draw. */
function paint(){
  if(!CX || raf) return;
  CX.clearRect(0, 0, CV.width, CV.height);
  marks();
}
function marks(){
  if(!M || !CV.width) return;
  const s = CV.width / (M.w || 1600), on = ratio();
  if(FOUND && FOUND.length){
    CX.strokeStyle = 'rgba(226,248,196,.92)';
    CX.lineWidth = 1.5 * on;
    for(const i of FOUND){
      CX.beginPath();
      CX.arc(SX[i] * s, SY[i] * s, Math.max(3.2 * on, SR[i] * s + 2.4 * on), 0, 6.283);
      CX.stroke();
    }
  }
  if(OVER >= 0){
    CX.strokeStyle = 'rgba(140,203,63,1)';
    CX.lineWidth = 2 * on;
    CX.beginPath();
    CX.arc(SX[OVER] * s, SY[OVER] * s, Math.max(5 * on, SR[OVER] * s + 4 * on), 0, 6.283);
    CX.stroke();
  }
}

function frame(now){
  raf = requestAnimationFrame(frame);
  if(LITE && last && now - last < 30) return;   // a weak machine: every other frame at 60 Hz, about 30 a second anywhere
  clock += last ? Math.min(0.05, (now - last) / 1000) : 0;   // a long gap is one step, never a jump
  last = now;
  const w = CV.width, h = CV.height;
  const s = w / (M.w || 1600);                     // picture pixels to canvas pixels
  const on = ratio();                              // canvas pixels per pixel on screen
  CX.clearRect(0, 0, w, h);
  CX.globalCompositeOperation = 'lighter';

  // the busiest card of each kind, breathing where that kind's weight sits
  const hubs = M.hubs || [];
  for(let i = 0; i < hubs.length; i++){
    const b = hubs[i];
    const beat = 0.5 + 0.5 * Math.sin(clock * (2 * Math.PI / BEAT) + i * 2.2);
    const r = (b.r * 2.6 * s + 11 * on) * (1 + 0.3 * beat);
    CX.globalAlpha = 0.07 + 0.16 * beat;
    CX.drawImage(HALO, b.x * s - r, b.y * s - r, r * 2, r * 2);
  }

  // one light along each of the edges the build picked out, fading in at one end and out at the other
  const lights = M.sparks || [];
  CX.strokeStyle = 'rgba(140,203,63,1)';
  CX.lineCap = 'round';
  CX.lineWidth = 1.4 * on;
  for(let i = 0; i < lights.length; i++){
    const e = lights[i];
    const at = (clock / TRIP + i * GOLD) % 1;
    const fade = Math.min(1, Math.min(at, 1 - at) * 5);
    if(fade <= 0) continue;
    const back = at > 0.11 ? at - 0.11 : 0;
    const hx = (e[0] + (e[2] - e[0]) * at) * s, hy = (e[1] + (e[3] - e[1]) * at) * s;
    CX.globalAlpha = 0.22 * fade;
    CX.beginPath();
    CX.moveTo((e[0] + (e[2] - e[0]) * back) * s, (e[1] + (e[3] - e[1]) * back) * s);
    CX.lineTo(hx, hy);
    CX.stroke();
    const r = 4.6 * on;
    CX.globalAlpha = 0.8 * fade;
    CX.drawImage(HEAD, hx - r, hy - r, r * 2, r * 2);
  }
  CX.globalAlpha = 1;
  CX.globalCompositeOperation = 'source-over';
  marks();
}
