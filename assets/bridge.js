/* Bridge between the home page and the drill-down page (explore.html).
   - mounts the top search (the header itself is written into the page by tools/sync.py)
   - opens a deep link: explore#gems=Untether, #uniques=Headhunter, #tree=Zealot's Oath (the row is shown and marked),
     and the filtered forms a card's "see all" sends: explore#gems?kw=Ignite (the list filtered by that keyword,
     every gem type in it) and explore#uniques?base=Stellar Amulet (the list filtered to one base item).
     A filter the page itself owns is handed to the page (PoE.deep)
   - rows and keywords open the same card popup as the rest of the site (price, trade, builds, what uses a keyword);
     the page's own panel stays one click away ("Full stats")
   - loads the app (assets/app.js) when it is first needed, or once the page is idle after its table
   - makes the list rows fly into place when a chip, a tab of a list or a column head filters or sorts it   */
import {SECTIONS} from './kinds.js';   // what each section is called: the one table the site reads
(function(){
  'use strict';
  /* the three sections of this page: the box that filters the list, the rows themselves, and the keyword picker */
  const SEC = {
    gems:    {input: '#q',  body: '#tbody',  kw: '#gkw'},
    uniques: {input: '#uq', body: '#utbody', kw: '#ukw'},
    tree:    {input: '#tq', body: '#ttbody', kw: '#tkw'},
  };
  const BODY = Object.fromEntries(Object.entries(SEC).map(([k, v]) => [k, v.body]));   // the rows, by section

  // the header (crest, app tabs, search box) is written into the page by tools/sync.py,
  // so nothing here changes how the page first looks
  const nav = document.getElementById('nav');
  if(nav){   // keep the address bar in step with the section tab, so links and reloads land in the same place
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      const key = Object.keys(SECTIONS).find(k => SECTIONS[k] === b.textContent.trim().replace(/\d+$/, '').trim());
      if(key && !location.hash.startsWith('#' + key)) history.replaceState(null, '', '#' + key);   // keep #uniques=Name
    });
  }
  const host = document.getElementById('topsearch');   // the same top search as the app, with the same popups
  let M = null;   // the app module, once loaded: its cards and popup
  const idle = f => (window.requestIdleCallback || (g => setTimeout(g, 1200)))(f, {timeout: 4000});
  // the page's data comes in files (tools/sync.py DATA_JS); WI_DATA.q is done when its scripts have drawn the tab in the address
  const drawn = window.WI_DATA && WI_DATA.q ? WI_DATA.q : null;
  const reveal = () => { if(window.WI_DATA && WI_DATA.show) WI_DATA.show(); };
  // a plain tab shows as soon as its table is drawn; a link to a row or a filtered list waits until it is there (open)
  if(drawn && !/[=?]/.test(location.hash)) drawn.then(reveal);
  /* The app (top search, card popups, the header's buttons) is not part of the page's first paint. It is asked for
     when first needed (the top search, a key, a pointer over the header or a table, a row or keyword that opens a
     card) or once the page is idle after its table, whichever comes first. It takes the page's own price file
     (window.WI_MARKET, tools/sync.py LIVE), so that file comes down once. The index behind the cards is its own
     step (need() in app.js): a pointer over a list's rows asks for it, and so does a click that opens a card. */
  let app = null;
  function loadApp(){
    if(app) return app;
    app = import('./app.js').then(m => {
      M = m;
      if(host){
        m.mountTopSearch(host);
        const q = host.querySelector('input');   // typed while the app was on its way
        if(q && q.value.trim() && document.activeElement === q) q.dispatchEvent(new Event('input', {bubbles: true}));
      }
      m.later();                   // the wisp over the crest
      idle(() => m.registerSW());  // then the service worker
      return m;
    });
    app.catch(() => host && host.remove());
    return app;
  }
  // everything a card needs (the whole index): asked for once, then the app's own promise
  const whole = m => Promise.resolve(m.need ? m.need() : m.ready);
  const soon = () => { loadApp().catch(() => {}); };
  const cards = () => { loadApp().then(whole).catch(() => {}); };
  Promise.resolve(drawn).then(() => idle(loadApp));
  const mast = document.querySelector('.mast');
  if(mast) for(const t of ['pointerover', 'focusin', 'touchstart']) mast.addEventListener(t, soon, {once: true, passive: true});
  addEventListener('keydown', soon, {once: true});   // the keybindings, the run counter, "/" into the top search
  for(const t of ['pointerover', 'touchstart']) for(const b of Object.values(SEC)){   // a pointer over rows: their cards
    const tb = document.querySelector(b.body);
    if(tb) tb.addEventListener(t, cards, {once: true, passive: true});
  }

  // GGG's own wording for fan sites, and the privacy page, at the foot of the drill-down too
  if(!document.querySelector('.ggg-note')) document.body.insertAdjacentHTML('beforeend',
    '<p class="ggg-note">This product isn’t affiliated with or endorsed by Grinding Gear Games in any way. <a href="privacy">Privacy</a></p>');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // the page builds the tab in the address once its files are in (tools/sync.py): wait for that
  async function navReady(){
    if(drawn) return drawn;
    for(let i = 0; i < 100 && !document.querySelector('#nav button'); i++) await sleep(50);
  }
  // another tab: its files and table the first time it opens, so this waits for them (PoE.go)
  function navTo(sec){
    const b = document.querySelector('#nav button[data-k="' + sec + '"]') ||
      [...document.querySelectorAll('#nav button')].find(x => x.textContent.trim().startsWith(SECTIONS[sec]));
    if(!b || b.getAttribute('aria-pressed') === 'true') return null;
    if(window.PoE && PoE.go) return PoE.go(sec);
    b.click();
    return null;
  }
  function rowName(tr){
    const n = tr.querySelector('.nmtxt');
    return (n ? n.textContent : (tr.cells[0] ? tr.cells[0].innerText.split('\n')[0] : '')).trim();
  }
  const flat = s => (s || '').replace(/\s+/g, ' ').trim();   // one line of text, whatever it was wrapped as
  async function open(){
    await navReady();
    try { await openHash(); } finally { reveal(); }   // the page shows once it is on the right section and row
  }
  async function openHash(){
    const f = location.hash.match(/^#(gems|uniques|tree)\?(.+)$/);
    if(f) return filterBy(f[1], new URLSearchParams(f[2]));
    const m = location.hash.match(/^#(gems|uniques|tree)(?:=(.*))?$/);
    if(!m) return;
    const sec = m[1], name = m[2] ? decodeURIComponent(m[2]) : '';
    await navTo(sec);
    if(!name) return;
    if(sec === 'gems') everyGem();
    const input = document.querySelector(SEC[sec].input);
    if(input){ input.value = name; input.dispatchEvent(new Event('input', {bubbles:true})); }
    await sleep(60);
    const rows = [...document.querySelectorAll(BODY[sec] + ' tr')];
    const hit = rows.find(r => rowName(r) === name) || rows.find(r => rowName(r).startsWith(name)) || rows[0];
    if(hit){   // show it and mark it; its card popup is one click away
      hit.scrollIntoView({block:'center'});
      document.querySelectorAll('tbody tr[aria-selected]').forEach(r => r.removeAttribute('aria-selected'));
      hit.setAttribute('aria-selected', 'true');
      hit.animate && hit.animate([{background: 'rgba(140,203,63,.18)'}, {background: 'transparent'}], {duration: 1600, easing: 'ease-out'});
    }
  }
  // a keyword names gems of every type, so the list has to hold every type before it is filtered
  function everyGem(){
    const every = [...document.querySelectorAll('#modeseg button')].find(b => /Everything/.test(b.textContent));
    if(every && every.getAttribute('aria-pressed') !== 'true') every.click();
  }
  /* The list, filtered the way the card that sent us here had it. A keyword goes through the page's own
     keyword picker; anything else is the page's to apply (PoE.deep), so this file never knows what a base
     item is. */
  async function filterBy(sec, p){
    await navTo(sec);
    await sleep(60);
    if(sec === 'gems') everyGem();
    const k = p.get('kw');
    if(k){
      const wrap = document.querySelector(SEC[sec].kw);
      let chip = wrap && wrap.querySelector('.kwchip[data-k="' + CSS.escape(k) + '"]');
      if(wrap && !chip){ const more = wrap.querySelector('.kwmore'); if(more){ more.click(); await sleep(30); chip = wrap.querySelector('.kwchip[data-k="' + CSS.escape(k) + '"]'); } }
      if(chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
    }
    if(window.PoE && PoE.deep && PoE.deep[sec]) PoE.deep[sec](p);
    history.replaceState(null, '', '#' + sec);
    const list = document.querySelector(SEC[sec].body);
    if(list) list.closest('table').scrollIntoView({block: 'start'});
  }

  /* ---------- rows and keywords open the site's card popup ----------
     Caught on the way down (window, capture) so the page's own row and keyword handlers don't also run.
     Anything the app has no card for still opens the page's own panel. A click that comes before the app and its
     index are in waits for them, the way a card opened anywhere else on the site waits (openDetail in app.js). */
  const ROWS = Object.values(BODY).map(b => b + ' tr').join(', ');
  let byName = null;
  function itemFor(tr){
    const D = M.D;
    if(tr.dataset.id && D.byKey.get('g:' + tr.dataset.id)) return D.byKey.get('g:' + tr.dataset.id);
    const name = rowName(tr);
    if(tr.closest(BODY.uniques)){
      const base = ((tr.querySelector('.sublbl') || {}).textContent || '').split(' \u00b7 ')[0].trim();
      return D.byKey.get('u:' + name + ' | ' + base) || D.byKey.get('u:' + name) || null;
    }
    if(tr.closest(BODY.tree)){
      if(!byName){
        byName = new Map();   // a name can stand for several cards: the tree carries "Armour" in eight strengths
        for(const it of D.index.items) if(it.k === 'p'){
          if(!byName.has(it.n)) byName.set(it.n, []);
          byName.get(it.n).push(it);
        }
      }
      const list = byName.get(name) || [];
      if(list.length < 2) return list[0] || null;
      // same name, different numbers: the row's own effect lines say which of them this row is
      const said = flat((tr.querySelector('.blurb') || {}).innerText);
      return list.find(it => flat((it.ls || []).join(' ')) === said) || list[0];
    }
    return null;
  }
  const ready = () => M && M.D.full;
  // the card for a keyword or a row, opened; false when the app has none (the page's own panel then)
  function cardFor(kw, tr){
    if(kw){
      const c = M.keywordCard(kw.dataset.k);
      if(c) M.openDetail(c, {}, null);
      return !!c;
    }
    const it = itemFor(tr);
    if(!it) return false;
    document.querySelectorAll('tbody tr[aria-selected]').forEach(r => r.removeAttribute('aria-selected'));
    tr.setAttribute('aria-selected', 'true');
    const full = tr.onclick;
    M.openDetail(it, {onFull: () => full.call(tr)}, null);   // no "Open in" link: this is the drill-down
    return true;
  }
  const ownPanel = (kw, tr) => kw ? window.PoE && PoE.openKeyword(kw.dataset.k) : tr.onclick.call(tr);
  function take(e, kw, tr){
    if(ready()){
      if(cardFor(kw, tr)){ e.stopImmediatePropagation(); e.preventDefault(); }
      return;
    }
    if(M && M.D.failed) return;   // no index to be had: the page's own panel
    e.stopImmediatePropagation(); e.preventDefault();
    if(tr) tr.setAttribute('aria-selected', 'true');
    loadApp().then(whole).then(() => { if(!ready() || !cardFor(kw, tr)) ownPanel(kw, tr); }, () => ownPanel(kw, tr));
  }
  addEventListener('click', e => {
    if(e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if(e.target.closest('.ov')) return;   // inside the popup itself
    const kw = e.target.closest('.kw[data-k]');
    const tr = kw ? null : e.target.closest(ROWS);
    if(!kw && (!tr || e.target.closest('a, button, input, select, label, summary') || typeof tr.onclick !== 'function')) return;
    take(e, kw, tr);
  }, true);
  addEventListener('keydown', e => {   // Enter on a keyword does the same as a click
    if(e.key !== 'Enter') return;
    const kw = e.target.closest && e.target.closest('.kw[data-k]');
    if(kw) take(e, kw, null);
  }, true);
  addEventListener('hashchange', open);
  if(document.readyState === 'complete') open(); else addEventListener('load', open);

  /* ---------- flying rows ----------
     When a chip, a tab of a list or a column head filters or sorts a list, its rows glide into place like the home
     page cards (flow() in app.js): rows that stay slide to their new spot, new rows fly in, rows that leave fade where
     they stood. Typing, a slider and "Show more" draw without it, and so does a list longer than LOTS rows or a page
     in its light mode (the "lite" class). The page's own script rebuilds the rows; this only watches them and
     animates (FLIP, Web Animations API). The places it flies from are the ones it took after the last change, when
     the page was idle, so nothing is measured while a player types or clicks. */
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(.2,.8,.2,1)', LOTS = 150;
  const lite = () => document.documentElement.classList.contains('lite');
  const bodies = Object.values(BODY).map(s => document.querySelector(s)).filter(Boolean);
  const snap = new Map();   // tbody -> Map(row key -> {top, tr}), top within the tbody
  const seen = el => el.getClientRects().length > 0;
  function measure(tb){
    if(!seen(tb) || tb.rows.length > LOTS){ snap.delete(tb); return; }   // hidden, or too long to fly: nothing to glide from
    const m = new Map(), count = new Map(), base = tb.offsetTop;
    for(const tr of tb.rows){   // key: the gem id, else the name; rows that share a name are told apart by order
      const n = tr.dataset.id || (tr.querySelector('.nmtxt') || tr.cells[0] || tr).textContent.trim();
      const c = (count.get(n) || 0) + 1;
      count.set(n, c);
      m.set(n + ' #' + c, {top: tr.offsetTop - base, tr});
    }
    snap.set(tb, m);
  }
  // a gone row fades where it stood: a one-row copy of the table, laid over the list
  function ghost(tb, o){
    const table = tb.closest('table');
    if(!table || o.tr.isConnected) return;
    const g = document.createElement('table');
    g.className = 'flyghost'; g.setAttribute('aria-hidden', 'true');
    const cols = table.tHead && table.tHead.rows[0] ? [...table.tHead.rows[0].cells].map(c => c.offsetWidth) : [];
    g.innerHTML = '<colgroup>' + cols.map(w => '<col style="width:' + w + 'px">').join('') + '</colgroup><tbody></tbody>';
    g.tBodies[0].appendChild(o.tr);
    Object.assign(g.style, {left: table.offsetLeft + 'px', top: (table.offsetTop + tb.offsetTop + o.top) + 'px', width: table.offsetWidth + 'px'});
    table.parentElement.appendChild(g);
    g.animate([{opacity: 1}, {opacity: 0}], {duration: 180, easing: 'ease-in'}).onfinish = () => g.remove();
  }
  let armed = 0;   // when a chip, a list's tab or a column head was last clicked: only those make rows fly
  const ARM = '.chip, .seg button, thead th';
  const waiting = new Set();
  let idleSet = false;
  // a list that changed without flying takes its new places once the page is idle, for the next click to fly from
  function settle(tb){
    snap.delete(tb);
    if(lite() || still.matches) return;
    waiting.add(tb);
    if(idleSet) return;
    idleSet = true;
    idle(() => { idleSet = false; waiting.forEach(measure); waiting.clear(); });
  }
  function fly(tb){
    const old = snap.get(tb);
    const asked = armed && performance.now() - armed < 1000;
    if(!asked || !old || still.matches || lite() || tb.rows.length > LOTS){ settle(tb); return; }
    armed = 0;
    measure(tb);
    const now = snap.get(tb);
    if(!now) return;
    let changed = 0;
    for(const [k, v] of now){ const o = old.get(k); if(!o || o.top !== v.top) changed++; }
    if(!changed || changed > LOTS) return;
    const top = tb.getBoundingClientRect().top, near = y => y > -120 && y < innerHeight + 120;
    let k = 0, gone = 0;
    for(const [key, v] of now){
      const o = old.get(key);
      if(!o){
        if(near(top + v.top)) v.tr.animate([{opacity: 0, transform: 'translateY(14px)'}, {opacity: 1, transform: 'none'}],
          {duration: 420, delay: Math.min(k++, 16) * 24, easing: EASE, fill: 'backwards'});
      } else if(o.top !== v.top && (near(top + v.top) || near(top + o.top))){
        const dy = Math.max(-innerHeight, Math.min(innerHeight, o.top - v.top));   // a row from far away comes in from the screen edge
        v.tr.animate([{transform: 'translateY(' + dy + 'px)'}, {transform: 'none'}], {duration: 420, easing: EASE});
      }
    }
    for(const [key, o] of old) if(!now.has(key) && gone < 12 && near(top + o.top)){ gone++; ghost(tb, o); }
  }
  if(bodies.length && 'animate' in Element.prototype){
    const mo = new MutationObserver(recs => new Set(recs.map(r => r.target)).forEach(fly));
    bodies.forEach(tb => mo.observe(tb, {childList: true}));
    document.addEventListener('click', e => { if(e.target.closest && e.target.closest(ARM)) armed = performance.now(); }, true);
    addEventListener('resize', () => bodies.forEach(settle), {passive: true});   // new places for a new width
  }
})();
