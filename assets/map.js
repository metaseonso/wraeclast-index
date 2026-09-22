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
   It stops dead when the tab is hidden and when the picture is scrolled off. Ask for less motion and none of
   it runs: app.css turns every animation off, and the loop is never started. */
import { $, esc, first, D } from './app.js';

const TRIP = 11;         // seconds for a light to travel the length of its edge
const BEAT = 8.5;        // seconds for a hub to breathe in and out
const GOLD = 0.6180339887;
const num = n => (+n || 0).toLocaleString('en');
const still = matchMedia('(prefers-reduced-motion: reduce)');

let M = null, CV = null, CX = null, HALO = null, HEAD = null;
let raf = 0, clock = 0, last = 0, onScreen = true;

export async function mount(el){
  el.innerHTML = head() + '<p class="note">Loading the map…</p>';
  try {
    const r = await fetch('data/map.json');
    if(!r.ok) throw new Error('data/map.json ' + r.status);
    M = await r.json();
  } catch {
    el.innerHTML = head() + '<p class="err">Could not load the map. Try again in a minute.</p>';
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
  first.then(() => {
    const now = D.index && D.index.v;
    if(now && M.index && now !== M.index) $('.mp-age', el).innerHTML =
      ' <b>The index has been rebuilt since this picture was drawn</b>, so its counts are the ones it was drawn from.';
  }, () => {});
  return {update: tick};   // the router calls this every time the tab is opened again
}

/* ---------- the words ---------- */
function head(){
  return '<div class="pagehd"><h2>The index as a map</h2>' +
    '<p>Every card in the index is a dot, coloured by what kind of thing it is, and every connection the ' +
    'site can follow between two cards is a line. Nothing to click: this is the shape of the whole thing.</p></div>';
}

function figure(){
  return '<figure class="mp-fig"><div class="mp-drift">' +
    '<img class="mp-still" src="' + esc(M.png || 'data/map.png') + '" width="' + (+M.w || 1600) + '" height="' + (+M.h || 800) + '" ' +
    'decoding="async" alt="The index drawn as a net: ' + num(M.cards) + ' dots, one per card, coloured by kind, ' +
    'with ' + num(M.edges) + ' lines between them. A bright crowded middle where the keywords sit, arms of gems, ' +
    'uniques, bases and Atlas cards around it, and a ring of dots nothing connects to.">' +
    '<canvas class="mp-live" aria-hidden="true"></canvas></div></figure>';
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
  return '<p class="note mp-foot">' + num(M.cards) + ' cards over ' + num((M.kinds || []).length) + ' kinds, ' +
      num(M.edges) + ' connections. A dot grows with the number it carries' +
      (big ? '; the busiest is <b>' + esc(big.n) + '</b>, on ' + num(big.deg) : '') + '. ' +
      'Drawn from the index of ' + esc(patch(M.index)) + (M.gen ? ', built ' + esc(M.gen) : '') +
      '.<span class="mp-age"></span></p>' +
    '<p class="note">Left out: ' +
      (out.groups ? 'the big groups a card sits in, which are not links between two things — ' +
        num(out.groups) + ' pairs' + (groups ? ' (' + esc(groups) + ')' : '') + '. ' : '') +
      (out.rows ? num(out.rows) + ' rows in the keyword lists no card of its own answers to. ' : '') +
      ((out.kinds || []).length ? esc(out.kinds.join(', ')) + ': built while the site runs, out of their own ' +
        'file, with nothing joining them to the index. ' : '') +
      'Everything else the site holds is drawn: none sampled, none thinned.</p>';
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
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(box.width * dpr)), h = Math.max(1, Math.round(box.height * dpr));
  if(CV.width !== w || CV.height !== h){ CV.width = w; CV.height = h; }
}

function tick(){
  const go = onScreen && !document.hidden && !still.matches && M;
  if(go && !raf){ last = 0; raf = requestAnimationFrame(frame); }
  else if(!go && raf){
    cancelAnimationFrame(raf);
    raf = 0;
    CX.clearRect(0, 0, CV.width, CV.height);
  }
}

function frame(now){
  raf = requestAnimationFrame(frame);
  clock += last ? Math.min(0.05, (now - last) / 1000) : 0;   // a long gap is one step, never a jump
  last = now;
  const w = CV.width, h = CV.height;
  const s = w / (M.w || 1600);                     // picture pixels to canvas pixels
  const on = Math.min(devicePixelRatio || 1, 2);   // canvas pixels per pixel on screen
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
}
