import { searching } from '../core/data.js';

/* ---------- after the first paint ----------
   Decoration that must never hold up the page: the fog and wisps (index.html and explore.html give them data-src,
   the fog a data-srcset too).
   Each fog layer fades in once its images are in, so the drifting starts smooth; a wisp starts its loop when loaded.
   A weak machine (html.lite, set in the page's <head>) draws no fog, so its images are never fetched. The fog holds
   still once the crest is scrolled off (.hero.away, theme.css). */
export function later(){
  const lite = document.documentElement.classList.contains('lite');
  // a first visit to a search: the answer before the fog (the search rows share the line on a phone, #117)
  const wait = document.getElementById('view-home') && /^#\/\?(.*&)?q=[^&]/.test(location.hash)
    ? Promise.race([searching, new Promise(r => setTimeout(r, 8000))]).catch(() => {}) : Promise.resolve();
  wait.then(() => requestAnimationFrame(() => setTimeout(() => {
    for(const img of document.querySelectorAll('img[data-src]')){
      const box = img.closest('.fog') || img;
      if(lite && box !== img) continue;
      img.addEventListener('load', () => {
        img.classList.add('on');
        if(box !== img && [...box.querySelectorAll('img')].every(x => x.classList.contains('on'))) box.classList.add('on');
      }, {once: true});
      if(img.dataset.srcset){ img.srcset = img.dataset.srcset; img.removeAttribute('data-srcset'); }
      img.src = img.dataset.src; img.removeAttribute('data-src');
    }
    const hero = document.getElementById('hero'), crest = hero && hero.querySelector('.emblem');
    if(crest && !lite) new IntersectionObserver(es => hero.classList.toggle('away', !es[es.length - 1].isIntersecting)).observe(crest);
  }, 0)));
}
