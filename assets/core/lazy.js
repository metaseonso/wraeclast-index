import { $ } from '../core/html.js';

/* ---------- a module fetched when it is needed ----------
   Every lazy import on this page goes through here, because they all share one fault. A tab left open across a
   deploy is still running that deploy's app.js, and the server keeps one version of each path — the new one. So a
   module the newer deploy added arrives new, asks the old app.js for an export it does not have, and the browser
   refuses to link the two. The page is simply a deploy behind: reload it once and the feature opens. A reload
   costs nothing, because what a card is holding is already written down (the bench keeps its craft in
   sessionStorage, assets/craftsim.js).
   Only on a refusal to link, or on a file the server no longer has (a newer deploy moved it), never on a file that
   could not be fetched. The browser throws a SyntaxError when the file
   came and its imports and exports do not line up, and a TypeError ("Failed to fetch dynamically imported
   module") when it could not be fetched at all: offline, blocked, or a path that is not there. Someone on a train
   must never be reloaded in circles.
   One reload a session: STALE holds the module that caused it until that same module loads. So a module that is
   broken for a real reason fails once and says so instead of reloading forever, and a later deploy in the same
   session still gets its one reload.
   `what` is the feature in the player's own words, and is said only where a reload is not the answer. */
const STALE = 'wi.stale';
// take this session's one reload, if it is still there. A browser that will not keep it says no, so it is
// never taken twice, and never taken at all where it could not be remembered
export function spend(url){
  try {
    if(sessionStorage.getItem(STALE)) return false;
    sessionStorage.setItem(STALE, url);
    return true;
  } catch { return false; }
}
function lazy(url, what){
  return import(new URL(url, new URL('../', import.meta.url)).href).then(m => {   // every path is from assets/, wherever the caller sits
    try { if(sessionStorage.getItem(STALE) === url) sessionStorage.removeItem(STALE); } catch {}   // it worked: armed again
    return m;
  }, err => {
    if(err && err.name === 'SyntaxError' && spend(url)){
      location.reload();
      return new Promise(() => {});   // the page is on its way out: nothing waiting on this should run
    }
    // it did not arrive: online, ask the server whether the path is still there. Gone means a deploy moved it
    return (navigator.onLine ? gone(url) : Promise.resolve(false)).then(moved => {
      if(moved && spend(url)){ location.reload(); return new Promise(() => {}); }
      if(what) stuck(what);
      throw err;
    });
  });
}
// the module's path answers 404 past every cache: the server has a newer deploy than this page
function gone(url){
  return fetch(new URL(url, new URL('../', import.meta.url)).href, {method: 'HEAD', cache: 'no-store'})
    .then(r => r.status === 404, () => false);
}
/* One line when something would not open: bottom of the screen, gone in a moment. It is only ever drawn after a
   reload has already failed to fix things, or with no network at all, so in practice it is never seen. */
function stuck(what){
  let box = $('.stuck');
  if(!box){
    box = document.createElement('p');
    box.className = 'stuck';
    box.setAttribute('role', 'status');
    document.body.appendChild(box);
  }
  box.textContent = what + ' did not open.';
  clearTimeout(box._go);
  box._go = setTimeout(() => box.remove(), 6000);
}

export { lazy, stuck };
