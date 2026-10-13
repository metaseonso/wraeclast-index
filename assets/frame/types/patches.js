import { MON } from '../../core/data.js';
import { namedIn, FRAME } from '../../kinds.js';
import { esc } from '../../core/html.js';
import { tableOf } from '../../frame/types/item.js';

/* ---------- GGG's patch notes, on the cards they name ----------
   data/patchnotes.json (tools/patchnotes.py): every patch-note line that names a card, and per card ("g:Frostbolt",
   the kind and the name the card already carries) the lines that name it. The lines that count are the frame's
   rule (FRAME.changed, namedIn), so a keyword card and a gem card are drawn by the same code. Newest patch first:
   its name as GGG titled the thread and as the link to it, the day and hour it went up in the reader's own time,
   then GGG's section and GGG's lines, each marked like any line on the site. FRAME.changed.cap patches, then a
   "See all N" that opens the rest in place. */
const HOUR = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + MON[d.getMonth()] + ' ' +
  d.getFullYear() + ', ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
/* a patch as GGG title its thread, without the words every title carries: "0.5.5c Patch Notes" is 0.5.5c,
   "Content Update 0.5.0 — Path of Exile 2: Return of the Ancients" is 0.5.0, "0.5.5 Hotfix 10" stays itself */
export const patchName = p => {
  const t = String(p.title || '');
  const cu = /^Content Update (\S+)/.exec(t);
  return cu ? cu[1] : t.replace(/\s+Patch ?notes\b.*$/i, '') || t;
};
/* the lines that count for one card: [patch, [[section, line], ...]], newest patch first */
export function patchesOf(t, key){
  const by = new Map();
  for(const i of (t && t.on && t.on[key]) || []){
    const l = t.lines[i];
    if(!l || !namedIn(key, l[2])) continue;
    if(!by.has(l[0])) by.set(l[0], []);
    by.get(l[0]).push([t.heads[l[1]] || '', l[2]]);
  }
  return [...by.entries()].sort((a, b) => b[0] - a[0]);
}
/* A fold: a long block of the popup behind one full-width summary row — its label, its count, a short line of
   what is inside, and a chevron that turns as it opens. Native <details>, so it opens by key and by finger with
   nothing of ours in between. `c` is the group a door on the card can open (data-c). */
const CHEV = '<svg class="fold-ch" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>';
export function foldHTML({cls = '', c = '', label, count, note = '', said = '', open = false}, inner){
  return '<details class="fold' + (cls ? ' ' + cls : '') + '"' + (c ? ' data-c="' + esc(c) + '"' : '') + (open ? ' open' : '') + '>' +
    '<summary class="uses-hd fold-hd"><b>' + esc(label) + '</b>' +
    (count !== undefined && count !== '' ? '<span class="ct"' + (note ? ' title="' + esc(note) + '"' : '') + '>' +
      esc(String(count)) + '</span>' : '') +
    (said ? '<span class="fold-said">' + esc(said) + '</span>' : '') + CHEV + '</summary>' +
    '<div class="fold-in">' + inner + '</div></details>';
}
const DAY = iso => { const d = new Date(iso); return isNaN(d) ? '' : d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
function changedHTML(it, t, f){
  const key = it.k + ':' + it[f.at], list = patchesOf(t, key);
  if(!list.length) return '';
  const group = ([pi, rows]) => {
    const p = t.patches[pi] || {}, name = patchName(p), v = name.split(' ')[0];
    let out = '<div class="chg-p"><p class="chg-hd">' + (p.notes ? '<a href="' + esc(p.notes) + '" target="_blank" rel="noopener" title="' +
      esc(p.title || '') + '">' + esc(name) + '</a>' : esc(name)) + '<span>' + esc(HOUR(p.posted)) + '</span></p>', sec = null;
    for(const [head, line] of rows){
      // GGG's section, where it says more than the patch's own name does
      if(head !== sec){ sec = head; if(head && !head.startsWith(v)) out += '<p class="chg-sec">' + esc(head) + '</p>'; }
      // GGG's words as GGG wrote them: the marks are for the card's own game text, not for the notes about it
      out += '<p class="chg-l">' + esc(line) + '</p>';
    }
    return out + '</div>';
  };
  const cap = FRAME.changed.cap, over = list.length - cap > FRAME.slack;
  const src = t.source || {}, last = t.patches[list[0][0]] || {};
  return foldHTML({label: f.label || '', count: list.length,
    said: ['latest ' + patchName(last), DAY(last.posted)].filter(Boolean).join(', ')},
    list.slice(0, over ? cap : list.length).map(group).join('') +
    (over ? '<details class="chg-more"><summary>See all ' + list.length.toLocaleString() + '</summary>' +
      list.slice(cap).map(group).join('') + '</details>' : '') +
    '<p class="card-src">Source: ' + (src.url ? '<a href="' + esc(src.url) + '" target="_blank" rel="noopener">' +
      esc(f.src || '') + '</a>' : esc(f.src || '')) + '</p>');
}
function changedFill(host, it, f){
  if(!host) return;
  tableOf(f.file).then(t => {
    const html = t && changedHTML(it, t, f);
    if(!html || !host.isConnected) return;
    host.innerHTML = html;
    host.hidden = false;
  });
}

/* ---------- what the data changed, patch to patch ----------
   data/patchdiff/ (tools/patchdiff.py): per step between two patches, every thing whose numbers or lines moved,
   each change [label, old, new] in the game's own words. The index says which cards a step touched, so a card
   fetches only the steps it is on. Newest patch first, FRAME.changed.cap of them, then "See all N". The words
   are the field's own (`say`), and the Patches page draws its rows with the same two functions. */
export function diffRowsHTML(rows, say){
  return '<ul class="dif">' + (rows || []).map(([label, o, n]) => '<li>' +
    (label ? '<span class="dif-l">' + esc(label) + '</span>' : '') +
    (o !== null && n !== null ? '<span class="dif-o">' + esc(o) + '</span><span class="dif-a" aria-label="to">→</span><span class="dif-n">' + esc(n) + '</span>'
      : o === null ? '<span class="dif-n">' + esc(say.add + n) + '</span>' : '<span class="dif-o">' + esc(say.cut + o) + '</span>') +
    '</li>').join('') + '</ul>';
}
export const diffLinesHTML = ls => '<ul class="dif">' + (ls || []).map(x => '<li><span class="dif-n">' + esc(x) + '</span></li>').join('') + '</ul>';
function diffHTML(it, groups, f){
  const say = f.say;
  const quiet = '<span class="pill warn dif-q">' + esc(say.quiet) + '</span>';
  const group = ([s, list]) => {
    const all = list.every(e => e.q), word = list.length === 1 && list[0].st ? say[list[0].st] : say.changed;
    return '<div class="chg-p"><p class="chg-hd"><a href="./#/patches?d=' + encodeURIComponent(s.key || s.to) + '">' + esc(word + s.to) +
      '</a>' + (all ? quiet : '') + '</p>' + list.map(e =>
        (list.length > 1 || e.n !== it.n ? '<p class="chg-sec">' + esc(e.n) + (e.q && !all ? ' ' + quiet : '') + '</p>' : '') +
        (e.st ? diffLinesHTML(e.ls) : diffRowsHTML(e.r, say))).join('') + '</div>';
  };
  const cap = FRAME.changed.cap, over = groups.length - cap > FRAME.slack;
  const src = [...new Set(groups.map(([s]) => s.src).filter(Boolean))];
  return groups.slice(0, over ? cap : groups.length).map(group).join('') +
    (over ? '<details class="chg-more"><summary>See all ' + groups.length.toLocaleString() + '</summary>' +
      groups.slice(cap).map(group).join('') + '</details>' : '') +
    (src.length ? '<p class="card-src">Source: ' + esc(src.join(', ')) + '</p>' : '');
}
function diffFill(host, it, f){
  if(!host) return;
  const key = it.k + ':' + it[f.at];
  tableOf(f.file).then(ix => {
    const steps = ((ix && ix.steps) || []).filter(s => (s.cards || []).includes(key));
    return Promise.all(steps.map(s => tableOf(s.file))).then(bodies => steps.map((s, i) =>
      [s, Object.values((bodies[i] && bodies[i].parts) || {}).flat().filter(e => (e.c || []).includes(key))]));
  }).then(groups => {
    groups = (groups || []).filter(g => g[1].length);
    if(!groups.length || !host.isConnected) return;
    host.innerHTML = diffHTML(it, groups, f);
    host.hidden = false;
  }).catch(() => {});
}

export { changedFill, diffFill };
