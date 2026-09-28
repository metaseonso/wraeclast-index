/* One view from a crawler page (/item/<name>, the lists: worker/seo.js, built as files), so an arrival from an
   AI answer or a search result is counted with the rest (worker/dash.js). The same batch assets/track.js sends
   to the same place, with one view in it: [page, how the visit arrived, phone/tablet/desktop]. Sent once, when
   the page is hidden or left. Nothing about the person, and nothing when the browser asks not to be tracked. */
(() => {
  const n = navigator;
  if(n.doNotTrack === '1' || window.doNotTrack === '1' || n.globalPrivacyControl === true || n.webdriver) return;
  try { if(window.top !== window.self || localStorage.getItem('wi-notrack') === '1') return; } catch { return; }
  const route = location.pathname.startsWith('/item/') ? 'item' : 'list';
  const utm = (new URLSearchParams(location.search).get('utm_source') || '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40);
  let host = '';
  try { host = new URL(document.referrer).hostname.toLowerCase().replace(/^www\./, ''); } catch {}
  const src = utm ? 'utm:' + utm : !host ? 'direct' : host === location.hostname.replace(/^www\./, '') ? 'site' : host.slice(0, 60);
  const device = innerWidth < 640 ? 'phone' : innerWidth < 1024 ? 'tablet' : 'desktop';
  let sent = false;
  const send = () => {
    if(sent) return;
    sent = true;
    const body = JSON.stringify({v: [[route, src, device]], c: [], h: []});
    try { if(n.sendBeacon && n.sendBeacon('/api/t', new Blob([body], {type: 'text/plain'}))) return; } catch {}
    fetch('/api/t', {method: 'POST', body, keepalive: true, headers: {'Content-Type': 'text/plain', 'X-WI': '1'}}).catch(() => {});
  };
  addEventListener('visibilitychange', () => { if(document.visibilityState === 'hidden') send(); });
  addEventListener('pagehide', send);
})();
