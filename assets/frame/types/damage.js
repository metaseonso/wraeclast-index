import { esc } from '../../core/html.js';
import { drawLine } from '../../frame/types/reqs.js';
import { D } from '../../core/data.js';
import { moneyHTML } from '../../core/format.js';
import { KIND, holds } from '../../kinds.js';

/* ---------- the damage card ----------
   The flowchart a mechanics card can carry ("fl", tools/mechanics.py). A group is either a run of steps
   ("st"): one box each, an arrow drawn in the gap between them; or a pair of columns ("cols"): conversion
   against extra damage, side by side where there is room and stacked on a phone.
   Plain markup, no library: the boxes wrap, so a long step still reads at 375px, and every colour is a theme
   token, so it draws in either theme. The index holds the chart as text and this draws it, which keeps the
   markup out of the data.
   Only in the popup: it is taller than a card in the grid, and every card opens its popup first. */
function flowHTML(it, full){
  if(!it.fl || !it.fl.length || !full) return '';
  // the chart's own labels stay plain; what a step says is a line like any other, and carries its marks
  const run = st => '<ol class="flow-run">' + st.map(([n, note, mk]) =>
    '<li class="flow-st"><b>' + (MARKS[mk] ? markHTML(mk) : '') + esc(n) + '</b>' +
    (note ? '<span>' + drawLine(it, note) + '</span>' : '') + '</li>'
  ).join('') + '</ol>';
  const cols = cs => '<div class="flow-cols">' + cs.map(c =>
    '<div class="flow-col"><b>' + esc(c.h) + '</b><ul>' + (c.ls || []).map(x => '<li>' + drawLine(it, x) + '</li>').join('') +
    '</ul></div>').join('') + '</div>';
  return '<div class="flow">' + it.fl.map(g => '<p class="flow-hd">' + esc(g.h) + '</p>' +
    (g.st ? run(g.st) : '') + (g.cols ? cols(g.cols) : '')).join('') + '</div>';
}
/* The mechanics cards a card can be offered: which card, when it is offered and what the button says are all
   in the field's own declaration (FIELDS.offer). Read off the card's own search text, so nothing has to be
   marked per card, and never on a card of a kind one of them leads to — a mechanics card already says it.
   A card about two of them is offered both, in the order they are declared. A third is a third line in that
   declaration and no code. */
/* Every mark the site wears, drawn once here and nowhere else: a sword for what a hit does, a shield for
   what a hit runs into, a bubble for a note about this card, a question mark for "what is this". A new mark
   is one line in this table, and whatever carries it draws it at the one size (.mk, assets/cards.css) in
   its own colour. */
export const MARKS = {
  sword:  '<path d="M10 2.2l1.5 2.4v7.2h-3V4.6zM6.6 11.8h6.8M10 11.8v3.5M8.5 17.3h3"/>',
  shield: '<path d="M10 2.8l5.6 1.9v4.6c0 3-2.2 5.3-5.6 6.6-3.4-1.3-5.6-3.6-5.6-6.6V4.7L10 2.8z"/>',
  say:    '<path d="M4.6 3.5h9.8c1.5 0 2.7 1.2 2.7 2.7v4.2c0 1.5-1.2 2.7-2.7 2.7H9.9l-3.6 3v-3H4.6' +
          'c-1.5 0-2.7-1.2-2.7-2.7V6.2c0-1.5 1.2-2.7 2.7-2.7z"/>',
  ask:    '<circle cx="10" cy="10" r="7.6"/><path d="M7.7 8a2.3 2.3 0 1 1 2.8 2.2v1.5"/><path d="M10.5 14h.01"/>',
  /* the steps a flowchart runs through (tools/mechanics.py names the one each step wears). A step with no
     mark draws none, so a new step is a line in that tool and nothing here until it wants a shape. */
  base:   '<path d="M15.8 4.2l-7 7M13 3.4h3.6V7M8.8 11.2l-1.6 1.6M5.4 10.6L3.6 12.4l4 4 1.8-1.8"/>',
  add:    '<circle cx="10" cy="10" r="7"/><path d="M10 6.4v7.2M6.4 10h7.2"/>',
  turn:   '<path d="M4 8h9l-2.6-2.6M16 12H7l2.6 2.6"/>',
  copy:   '<rect x="3.4" y="3.4" width="8.6" height="8.6" rx="1.6"/><path d="M8 16.6h6.6a2 2 0 0 0 2-2V8"/>',
  pct:    '<path d="M5.6 14.4L14.4 5.6"/><circle cx="7.2" cy="7.2" r="1.9"/><circle cx="12.8" cy="12.8" r="1.9"/>',
  times:  '<path d="M5.4 5.4l9.2 9.2M14.6 5.4l-9.2 9.2"/>',
  crit:   '<path d="M10 2.6v3.2M10 14.2v3.2M2.6 10h3.2M14.2 10h3.2M4.8 4.8l2.3 2.3M12.9 12.9l2.3 2.3' +
          'M15.2 4.8l-2.3 2.3M7.1 12.9l-2.3 2.3"/>',
  dodge:  '<path d="M3.2 15.4C6 8.6 10.6 5.4 16.4 4.2M12.6 3.4l3.8.8-.8 3.8"/>',
  plate:  '<rect x="3.6" y="6" width="12.8" height="8.6" rx="1.4"/><path d="M3.6 10.3h12.8M10 6v8.6"/>',
  res:    '<path d="M10 2.8l6.2 3.6v7.2L10 17.2 3.8 13.6V6.4L10 2.8z"/>',
  esh:    '<path d="M10 2.8l5.6 1.9v4.6c0 3-2.2 5.3-5.6 6.6-3.4-1.3-5.6-3.6-5.6-6.6V4.7L10 2.8z"/>' +
          '<path d="M10.7 6.6L8.4 10.2h3.2l-2.3 3.4"/>',
  drop:   '<path d="M10 3.2c3 3.1 4.6 5.2 4.6 7.2a4.6 4.6 0 0 1-9.2 0c0-2 1.6-4.1 4.6-7.2z"/>',
  life:   '<path d="M10 15.8S4.2 12.3 4.2 8.4A3.3 3.3 0 0 1 10 6.2a3.3 3.3 0 0 1 5.8 2.2c0 3.9-5.8 7.4-5.8 7.4z"/>',
};
export const markHTML = m => '<svg class="mk" viewBox="0 0 20 20" aria-hidden="true">' + (MARKS[m] || '') + '</svg>';
function offerHTML(it, f, full){
  if(!full || !it._hay) return '';
  const list = f.cards || [];
  // never on a card of a kind one of them leads to: a mechanics card already says it
  if(list.some(o => it.k === o.card.slice(0, o.card.indexOf(':')))) return '';
  const marks = list.filter(o => o.when.test(it._hay) && MARKS[o.mark]).map(o =>
    '<button type="button" class="card-offer" data-h="' + esc(o.card) + '" data-tip="' + esc(o.is) +
    '" aria-label="' + esc(o.is) + '">' + markHTML(o.mark) + '</button>').join('');
  // both of them move together, so a narrow card never leaves one mark behind on its own line
  return marks ? '<span class="card-marks">' + marks + '</span>' : '';
}
/* The way to say something about this card, from this card: the same mark, the same size, alone in the
   card's own corner. Only where the card is drawn in full — a grid is for reading, and the top bar's own
   button is there for a note about the page. And only where the index really holds that key, so it means
   the same thing tomorrow as it does today: a card a tab made up for itself and a card that is an
   application draw no mark, because what goes with a note is the page and this card's key and nothing
   else, and a key nobody can look up again says no more than the page already did (assets/suggest.js). */
function askHTML(it, full){
  if(!full || !D.byKey.has(it.k + ':' + it.id)) return '';
  const say = 'Suggest something about ' + it.n;
  return '<button type="button" class="card-ask" data-ask="' + esc(it.k + ':' + it.id) + '" title="' + esc(say) +
    '" aria-label="' + esc(say) + '">' + markHTML('say') + '</button>';
}
function anointHTML(it){
  if(!it.rec || !it.rec.length) return '';
  let div = null;
  const M = D.market && D.market.items;
  if(M){   // live: the three Distilled emotions at today's price
    const vals = it.rec.map(n => (M['c:' + n] || M['c:' + n.toLowerCase().replace(/[^a-z]+/g, '-')] || {}).v);
    if(vals.every(v => v !== undefined)) div = vals.reduce((a, b) => a + b, 0);
  }
  // no live price for all three: no sum. The artifact's saved cost (ac) was a price with no source or age, and is gone
  return '<div class="card-inv"><span title="' + esc(it.rec.join(' + ')) + '">Anoint with 3 emotions</span><b>' +
    (div !== null ? moneyHTML(div) : '') + '</b></div>';
}
/* poe.ninja's builds page, filtered to characters that use this thing (its own link format). Which of their
   lists a kind is in is the kind's own "builds": the first test an entry answers wins, and an entry that
   answers none of them is in no list and gets no link. */
export function buildsHref(it){
  const lg = D.market && D.market.builds;
  if(!lg) return null;
  const q = v => encodeURIComponent(v).replaceAll('%20', '+');
  let key = null;
  for(const t of (KIND[it.k] || {}).builds || []) if(holds(it, t)){ key = t.key; break; }
  return key ? 'https://poe.ninja/poe2/builds/' + lg + '?' + key + '=' + q(it.n) : null;
}

export { flowHTML, offerHTML, askHTML, anointHTML };
