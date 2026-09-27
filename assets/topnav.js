/* The top bar, the same on every page: index.html, explore.html (tools/sync.py writes its header), privacy.html and
   the crawler pages (worker/seo.js). It reads the bar it is given and keeps no list of pages of its own.
   - a group of the index (Items, Endgame) opens under its name on a click, Enter or Space, and closes on a second
     click, Escape, a click anywhere else or focus leaving it; with one open, the pointer on another opens that one
   - ☰ opens the rest: Patch notes, Suggest, Runs, Pins and the keybindings; narrower than the row (cards.css,
     NARROW) the index too, as a sheet under the bar with every group open
   - a phone's search button opens the top search under the bar, or on the home page goes to its own search box
   - the group holding the page on show wears the tab's own "here" look: the app marks its links (app.js show()),
     the drill-down page its section buttons (#nav, kept out of sight), and this follows either */
const NARROW = matchMedia('(max-width:1279px)');   // the same width as the sheet in assets/cards.css

const bar = document.querySelector('header.top');
if(bar && !bar.dataset.nav){
  bar.dataset.nav = '1';
  const drops = [...bar.querySelectorAll('.navdrop')];
  const burger = document.getElementById('topburger');
  const find = document.getElementById('topfind');
  const btnOf = d => d.querySelector('.navdrop-b');

  function setDrop(d, on){
    d.classList.toggle('open', on);
    btnOf(d).setAttribute('aria-expanded', String(on));
  }
  const openDrop = () => drops.find(d => d.classList.contains('open'));
  function closeDrops(){ drops.forEach(d => setDrop(d, false)); }
  const menuOpen = () => bar.classList.contains('menu');
  function setMenu(on){
    bar.classList.toggle('menu', on);
    if(!burger) return;
    burger.setAttribute('aria-expanded', String(on));
    burger.setAttribute('aria-controls', NARROW.matches ? 'topmenu' : 'topmore');
    // in the sheet every group is open, so the whole index is there at once
    if(NARROW.matches) drops.forEach(d => setDrop(d, on));
  }
  function setFind(on){
    bar.classList.toggle('find', on);
    if(find) find.setAttribute('aria-expanded', String(on));
  }
  function closeAll(){ closeDrops(); if(menuOpen()) setMenu(false); setFind(false); }

  for(const d of drops){
    const b = btnOf(d);
    b.addEventListener('click', () => {
      const on = !d.classList.contains('open');
      if(!NARROW.matches) closeDrops();
      setDrop(d, on);
    });
    // a menu bar: with one group open, the pointer on another opens that one instead
    b.addEventListener('pointerenter', e => {
      if(e.pointerType !== 'mouse' || NARROW.matches) return;
      const o = openDrop();
      if(o && o !== d){ closeDrops(); setDrop(d, true); }
    });
    b.addEventListener('keydown', e => {
      if(e.key !== 'ArrowDown') return;
      e.preventDefault();
      setDrop(d, true);
      const a = d.querySelector('.navdrop-m a');
      if(a) a.focus();
    });
    d.addEventListener('focusout', e => {
      if(!NARROW.matches && !d.contains(e.relatedTarget)) setDrop(d, false);
    });
  }
  if(burger) burger.addEventListener('click', () => {
    const on = !menuOpen();
    closeDrops(); setFind(false);
    setMenu(on);
  });
  if(find) find.addEventListener('click', () => {
    // the home page has its own search box: the button goes there
    const q = document.getElementById('view-home') && document.body.dataset.route === 'home' && document.getElementById('q');
    if(menuOpen()) setMenu(false);
    if(q){
      q.scrollIntoView({block: 'center'});
      q.focus({preventScroll: true});
      return;
    }
    const input = bar.querySelector('.topsearch input');
    if(!input) return;   // a page without the top search: the button is a link to the home page's
    const on = !bar.classList.contains('find');
    setFind(on);
    if(on) input.focus();
  });

  // a click anywhere else closes what is open; a page picked from the index closes it too
  document.addEventListener('click', e => {
    const t = e.target;
    if(!(t instanceof Element)) return;
    if(t.closest('.topmenu a, .topmore button')){ closeDrops(); if(menuOpen()) setMenu(false); return; }
    if(!NARROW.matches && openDrop() && !t.closest('.navdrop')) closeDrops();
    if(menuOpen() && !t.closest('#topmenu, #topmore, #topburger')) setMenu(false);
    if(bar.classList.contains('find') && !t.closest('.topsearch, #topfind')) setFind(false);
  });
  document.addEventListener('keydown', e => {
    if(e.key !== 'Escape') return;
    const o = !NARROW.matches && openDrop();
    if(o){ e.preventDefault(); setDrop(o, false); btnOf(o).focus(); return; }
    if(menuOpen()){ e.preventDefault(); setMenu(false); if(burger) burger.focus(); return; }
    if(bar.classList.contains('find')){ setFind(false); if(find) find.focus(); }
  });
  // wider or narrower than the row: nothing stays open from the other shape
  NARROW.addEventListener('change', closeAll);

  /* ---------- the page on show ---------- */
  // only what changes is written: these run from observers of the same attribute
  function here(el, v){
    if(v){ if(el.getAttribute('aria-current') !== v) el.setAttribute('aria-current', v); }
    else if(el.hasAttribute('aria-current')) el.removeAttribute('aria-current');
  }
  function mark(){
    for(const d of drops) here(btnOf(d), d.querySelector('.navdrop-m a[aria-current="page"]') ? 'true' : '');
  }
  // the drill-down page: the section its own buttons have picked is the link to that section here
  const secs = document.getElementById('nav');
  function markSection(){
    const on = secs.querySelector('button[aria-pressed="true"]');
    const k = on ? on.dataset.k : '';
    for(const a of bar.querySelectorAll('.topnav a[href*="explore#"]')){
      here(a, k && a.getAttribute('href').endsWith('#' + k) ? 'page' : '');
    }
  }
  if(secs && bar.contains(secs)){
    markSection();
    new MutationObserver(markSection).observe(secs, {subtree: true, childList: true, attributes: true, attributeFilter: ['aria-pressed']});
  }
  const nav = bar.querySelector('.topnav');
  if(nav){
    mark();
    new MutationObserver(mark).observe(nav, {subtree: true, attributes: true, attributeFilter: ['aria-current']});
  }
}
