/* Bridge between the home page and the drill-down page (explore.html).
   - mounts the top search (the header itself is written into the page by tools/sync.py)
   - opens a deep link: explore#gems=Untether, #uniques=Headhunter, #tree=Zealot's Oath (the row is shown and marked),
     and explore#uniques?kw=Ignite (the list filtered by that keyword)
   - rows and keywords open the same card popup as the rest of the site (price, trade, builds, what uses a keyword);
     the page's own panel stays one click away ("Full stats")
   - makes the list rows fly into place when a list filters or sorts   */
(function(){
  'use strict';
  const SECTIONS = {gems:'Gems', uniques:'Uniques', tree:'Passive tree'};
  const INPUT = {gems:'#q', uniques:'#uq', tree:'#tq'};
  const BODY = {gems:'#tbody', uniques:'#utbody', tree:'#ttbody'};

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
  // the page's data comes in files (tools/sync.py DATA_JS); WI_DATA.q is done when its scripts have drawn the page
  const drawn = window.WI_DATA && WI_DATA.q ? WI_DATA.q : null;
  const reveal = () => { if(window.WI_DATA && WI_DATA.show) WI_DATA.show(); };
  // the plain Gems view shows as soon as its table is drawn; a link to a row, a keyword or another section waits for the whole page
  if(drawn && WI_DATA.gems && /^(#gems)?$/.test(location.hash)) WI_DATA.gems.then(reveal);
  // the app (top search, card popups) loads after the page's own data, so it never slows the tables down
  const app = Promise.resolve(drawn).then(() => import('./app.js')).then(m => { M = m; if(host) m.mountTopSearch(host); return m; });
  app.catch(() => host && host.remove());
  // after the page: the wisp over the crest, then (once idle) the service worker (assets/app.js)
  Promise.all([app, drawn]).then(([m]) => {
    m.later();
    (window.requestIdleCallback || (f => setTimeout(f, 1200)))(() => m.registerSW(), {timeout: 4000});
  }).catch(() => {});

  // GGG's own wording for fan sites, and the privacy page, at the foot of the drill-down too
  if(!document.querySelector('.ggg-note')) document.body.insertAdjacentHTML('beforeend',
    '<p class="ggg-note">This product isn’t affiliated with or endorsed by Grinding Gear Games in any way. <a href="privacy">Privacy</a></p>');

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // the page builds its sections once its data and live prices are in (tools/sync.py): wait for that
  async function navReady(){
    if(drawn) return drawn;
    for(let i = 0; i < 100 && !document.querySelector('#nav button'); i++) await sleep(50);
  }
  function navTo(label){
    const b = [...document.querySelectorAll('#nav button')].find(x => x.textContent.trim().startsWith(label));
    if(b && b.getAttribute('aria-pressed') !== 'true') b.click();
  }
  function rowName(tr){
    const n = tr.querySelector('.nmtxt');
    return (n ? n.textContent : (tr.cells[0] ? tr.cells[0].innerText.split('\n')[0] : '')).trim();
  }
  async function open(){
    await navReady();
    try { await openHash(); } finally { reveal(); }   // the page shows once it is on the right section and row
  }
  async function openHash(){
    const f = location.hash.match(/^#(gems|uniques|tree)\?kw=(.+)$/);
    if(f) return filterBy(f[1], decodeURIComponent(f[2]));
    const m = location.hash.match(/^#(gems|uniques|tree)(?:=(.*))?$/);
    if(!m) return;
    const sec = m[1], name = m[2] ? decodeURIComponent(m[2]) : '';
    navTo(SECTIONS[sec]);
    if(!name) return;
    if(sec === 'gems'){   // a deep link may name a support or spirit gem, so search across every gem type
      const every = [...document.querySelectorAll('#modeseg button')].find(b => /Everything/.test(b.textContent));
      if(every && every.getAttribute('aria-pressed') !== 'true') every.click();
    }
    const input = document.querySelector(INPUT[sec]);
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
  // the list, filtered by one keyword: the page's own keyword picker does the filtering
  async function filterBy(sec, k){
    navTo(SECTIONS[sec]);
    await sleep(60);
    const wrap = document.querySelector({gems: '#gkw', uniques: '#ukw', tree: '#tkw'}[sec]);
    if(!wrap) return;
    let chip = wrap.querySelector('.kwchip[data-k="' + CSS.escape(k) + '"]');
    if(!chip){ const more = wrap.querySelector('.kwmore'); if(more){ more.click(); await sleep(30); chip = wrap.querySelector('.kwchip[data-k="' + CSS.escape(k) + '"]'); } }
    if(chip && chip.getAttribute('aria-pressed') !== 'true') chip.click();
    history.replaceState(null, '', '#' + sec);
    const list = document.querySelector(BODY[sec]);
    if(list) list.closest('table').scrollIntoView({block: 'start'});
  }

  /* ---------- rows and keywords open the site's card popup ----------
     Caught on the way down (window, capture) so the page's own row and keyword handlers don't also run.
     Anything the app has no card for (a small passive) still opens the page's own panel. */
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
      if(!byName){ byName = new Map(); for(const it of D.index.items) if(it.k === 'p' && !byName.has(it.n)) byName.set(it.n, it); }
      return byName.get(name) || null;
    }
    return null;
  }
  addEventListener('click', e => {
    if(!M || !M.D.full || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    if(e.target.closest('.ov')) return;   // inside the popup itself
    const kw = e.target.closest('.kw[data-k]');
    if(kw){
      const c = M.keywordCard(kw.dataset.k);
      if(!c) return;   // no card: the page's own keyword panel
      e.stopImmediatePropagation(); e.preventDefault();
      M.openDetail(c, {}, null);
      return;
    }
    const tr = e.target.closest(ROWS);
    if(!tr || e.target.closest('a, button, input, select, label, summary')) return;
    const it = itemFor(tr);
    if(!it || typeof tr.onclick !== 'function') return;
    e.stopImmediatePropagation(); e.preventDefault();
    document.querySelectorAll('tbody tr[aria-selected]').forEach(r => r.removeAttribute('aria-selected'));
    tr.setAttribute('aria-selected', 'true');
    const full = tr.onclick;
    M.openDetail(it, {onFull: () => full.call(tr)}, null);   // no "Open in" link: this is the drill-down
  }, true);
  addEventListener('keydown', e => {   // Enter on a keyword does the same as a click
    if(e.key !== 'Enter' || !M || !M.D.full) return;
    const kw = e.target.closest && e.target.closest('.kw[data-k]');
    const c = kw && M.keywordCard(kw.dataset.k);
    if(!c) return;
    e.stopImmediatePropagation(); e.preventDefault();
    M.openDetail(c, {}, null);
  }, true);
  addEventListener('hashchange', open);
  if(document.readyState === 'complete') open(); else addEventListener('load', open);

  /* ---------- flying rows ----------
     When a list filters or sorts, its rows glide into place like the home page cards (flow() in app.js):
     rows that stay slide to their new spot, new rows fly in, rows that leave fade where they stood.
     The page's own script rebuilds the rows; this only watches them and animates (FLIP, Web Animations API). */
  const still = matchMedia('(prefers-reduced-motion: reduce)');
  const EASE = 'cubic-bezier(.2,.8,.2,1)', LOTS = 150;   // more rows than LOTS changing at once: no animation
  const bodies = Object.values(BODY).map(s => document.querySelector(s)).filter(Boolean);
  const snap = new Map();   // tbody -> Map(row key -> {top, tr}), top within the tbody
  const seen = el => el.getClientRects().length > 0;
  function measure(tb){
    if(!seen(tb)){ snap.delete(tb); return; }   // a hidden list has no positions to glide from
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
  function fly(tb){
    const old = snap.get(tb);
    measure(tb);
    const now = snap.get(tb);
    if(!old || !now || still.matches) return;
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
    bodies.forEach(measure);
    const mo = new MutationObserver(recs => new Set(recs.map(r => r.target)).forEach(fly));
    bodies.forEach(tb => mo.observe(tb, {childList: true}));
    // measure again just before anything the player does, so a resize or a font load never leaves stale positions
    for(const t of ['input', 'change', 'click']) document.addEventListener(t, () => bodies.forEach(measure), true);
  }
})();
