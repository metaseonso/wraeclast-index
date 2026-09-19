/* Bridge between the home page and the drill-down page (explore.html).
   - mounts the top search (the header itself is written into the page by tools/sync.py)
   - opens a deep link: explore.html#gems=Untether, #uniques=Headhunter, #tree=Zealot's Oath   */
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
  if(host) import('./app.js').then(m => m.mountTopSearch(host)).catch(() => host.remove());

  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function navTo(label){
    const b = [...document.querySelectorAll('#nav button')].find(x => x.textContent.trim().startsWith(label));
    if(b && b.getAttribute('aria-pressed') !== 'true') b.click();
  }
  function rowName(tr){
    const n = tr.querySelector('.nmtxt');
    return (n ? n.textContent : (tr.cells[0] ? tr.cells[0].innerText.split('\n')[0] : '')).trim();
  }
  async function open(){
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
    if(hit){ hit.scrollIntoView({block:'center'}); hit.click(); }
  }
  addEventListener('hashchange', open);
  if(document.readyState === 'complete') open(); else addEventListener('load', open);
})();
