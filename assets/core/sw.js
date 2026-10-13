/* The service worker (sw.js): not on the backup site (GitHub Pages serves sw.js unstamped) or inside a frame. */
export function registerSW(){
  if(!('serviceWorker' in navigator) || /\.github\.io$/.test(location.hostname) || window.top !== window) return false;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  return true;
}
