/* Bridge between the home page and the drill-down page (explore.html).
   - adds Search / Build / Currency links to the drill-down's top bar
   - opens a deep link: explore.html#gems=Untether, #uniques=Headhunter, #tree=Zealot's Oath   */
(function(){
  'use strict';
  const SECTIONS = {gems:'Gems', uniques:'Uniques', tree:'Passive tree'};
  const INPUT = {gems:'#q', uniques:'#uq', tree:'#tq'};
  const BODY = {gems:'#tbody', uniques:'#utbody', tree:'#ttbody'};

  // top bar: the brand goes home, and the app's own routes sit before the section tabs
  const mast = document.querySelector('.mast-in');
  const nav = document.getElementById('nav');
  if(mast && nav){
    const brand = mast.querySelector('.brand');
    if(brand && !brand.closest('a')){
      const a = document.createElement('a'); a.href = './'; a.className = 'brand-link';
      brand.replaceWith(a); a.appendChild(brand);
    }
    if(!brand.querySelector('.mark')) brand.insertAdjacentHTML('afterbegin', '<span class="mark" aria-hidden="true"><img class="mark-cloud" src="assets/brand/cloud.webp" alt="" decoding="async" fetchpriority="low"><img class="mark-logo" src="assets/brand/logo-64.webp" alt="" width="51" height="64"></span>');
    if(!document.querySelector('link[rel=icon]')) document.head.insertAdjacentHTML('beforeend',
      '<link rel="icon" type="image/png" sizes="64x64" href="assets/brand/favicon-64.png">');
    const links = document.createElement('nav');
    links.className = 'applinks'; links.setAttribute('aria-label', 'App');
    // app routes that are live; a route joins this list when it ships
    links.innerHTML = [['./#/', 'Search'], ['./#/build', 'Build'], ['./#/currency', 'Currency']].map(([h, l]) => '<a href="' + h + '">' + l + '</a>').join('');
    nav.before(links);
    // keep the address bar in step with the section tab, so links and reloads land in the same place
    nav.addEventListener('click', e => {
      const b = e.target.closest('button'); if(!b) return;
      const key = Object.keys(SECTIONS).find(k => SECTIONS[k] === b.textContent.trim().replace(/\d+$/, '').trim());
      if(key) history.replaceState(null, '', '#' + key);
    });
  }

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
  // the same top search as the app, with the same popups
  if(mast){
    const host = document.createElement('div');
    host.className = 'topsearch';
    const cl = document.getElementById('clbtn');
    cl ? cl.before(host) : mast.appendChild(host);
    import('./app.js').then(m => m.mountTopSearch(host)).catch(() => host.remove());
  }
  addEventListener('hashchange', open);
  if(document.readyState === 'complete') open(); else addEventListener('load', open);
})();
