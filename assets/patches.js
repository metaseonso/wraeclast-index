/* The Patches page (#/patches): every patch, hotfix and restart in the patch registry (data/patches.json,
   tools/patches.py), newest first, with the hour its notes went up (UTC), its league, the thread on GGG's forum,
   and how many cards its notes name. The count is the same rule the cards use (FRAME.changed, namedIn in
   assets/kinds.js), read off data/patchnotes.json, so a patch that counts 12 cards here is on those 12 cards'
   "Changed in". The page is its own tab: nothing of it is fetched until somebody opens it. */
import { esc, patchName } from './app.js';
import { namedIn } from './kinds.js';

let EL = null;
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = n => String(n).padStart(2, '0');
// the registry's own time, in UTC: "17 Sep 2026, 22:30"; a day with no hour stays a day
function when(p){
  const iso = p.posted || p.live || '';
  const d = new Date(iso.length === 10 ? iso + 'T00:00:00Z' : iso);
  if(isNaN(d)) return '';
  const day = d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  return p.posted ? day + ', ' + pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) : day;
}
const getJSON = f => fetch(f).then(r => r.ok ? r.json() : null).catch(() => null);

export async function mount(el){
  EL = el;
  el.innerHTML = '<div class="pagehd"><h2>Patches</h2></div><p class="note">Loading…</p>';
  const [reg, notes] = await Promise.all([getJSON('data/patches.json'), getJSON('data/patchnotes.json')]);
  if(EL !== el) return;
  if(!reg || !(reg.patches || []).length){
    el.innerHTML = '<div class="pagehd"><h2>Patches</h2></div><p class="note err">The patch list did not load.</p>';
    return;
  }
  el.innerHTML = page(reg, notes && cardsPer(notes));
}
export function unmount(){ EL = null; }

/* patch id -> how many cards its notes name, by the cards' own rule */
function cardsPer(t){
  const per = (t.patches || []).map(() => new Set());
  for(const [key, list] of Object.entries(t.on || {})) for(const i of list){
    const l = t.lines[i];
    if(l && per[l[0]] && namedIn(key, l[2])) per[l[0]].add(key);
  }
  return new Map((t.patches || []).map((p, i) => [p.id, per[i].size]));
}

function page(reg, cards){
  const rows = [...reg.patches].sort((a, b) => (b.posted || b.live || '').localeCompare(a.posted || a.live || ''));
  const src = (reg.sources || {}).notes || {};
  const first = rows[rows.length - 1], last = rows[0];
  const body = rows.map(p => {
    const name = p.title ? patchName(p) : p.v;
    const flags = (p.flags || []).filter(f => !name.toLowerCase().includes(f));
    const n = cards && p.notes ? cards.get(p.id) : undefined;
    return '<tr class="pt-' + esc(p.kind) + '"><td>' + (p.notes ? '<a href="' + esc(p.notes) + '" target="_blank" rel="noopener"' +
      (p.title ? ' title="' + esc(p.title) + '"' : '') + '>' + esc(name) + '</a>' : esc(name)) +
      (flags.length ? ' <span class="pt-f">' + esc(flags.join(' · ')) + '</span>' : '') + '</td>' +
      // a phone has no room for the league's own column: it goes under the date there (assets/app.css)
      '<td class="pt-t">' + esc(when(p)) + '<span class="pt-lg">' + esc(p.league || '') + '</span></td><td class="pt-lc">' +
      esc(p.league || '') + '</td>' +
      '<td class="pt-n">' + (n === undefined ? '' : n.toLocaleString('en')) + '</td></tr>';
  }).join('');
  return '<div class="pagehd"><h2>Patches</h2><p>Every patch, hotfix and restart, newest first.</p>' +
    '<p class="dt-sub">' + rows.length.toLocaleString('en') + ' · ' + esc(first.v) + ' to ' + esc(patchName(last) || last.v) +
    ' · times in UTC</p></div>' +
    '<section class="dt-block"><div class="dt-scroll"><table class="dt-jobs pt-list"><thead><tr><th>Patch</th><th>Notes posted</th>' +
    '<th class="pt-lc">League</th><th class="pt-n" title="Cards its notes name">Cards</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
    '<p class="card-src">Source: ' + (src.url ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' + esc(src.n || '') + '</a>' :
      esc(src.n || '')) + '</p></section>';
}
