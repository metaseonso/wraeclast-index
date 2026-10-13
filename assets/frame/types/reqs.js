import { esc } from '../../core/html.js';
import * as marks from '../../marks.js';
import { D, TR, whole } from '../../core/data.js';
import { keywordIdOf, keywordCard } from '../../frame/keywords.js';
import { KIND, KW, markOf, ours, FIELDS, FRAME } from '../../kinds.js';
import { openDetail } from '../../frame/seam.js';
import { hrefOf } from '../../frame/href.js';

/* ---------- requirements ----------
   Gem level -> character level, and the attribute formula, from the official game data.
   Checked against poe2db on 48 random skill and spirit gems: every value matched.
   Support gems have no requirements. */
export const GEM_LEVELS = [0,3,6,10,14,18,22,26,31,36,41,46,52,58,64,66,72,78,84,90];
export function gemReq(w, gemLevel = 20){
  const lv = GEM_LEVELS[Math.min(gemLevel, 20) - 1];
  const attr = x => x ? Math.floor((5 + (lv - 3) * 1.7) * Math.pow(x / 100, 0.9) + 0.5) + 4 : 0;
  return [lv, attr(w[0]), attr(w[1]), attr(w[2])];
}
const ATTR = [['Str','r'], ['Dex','g'], ['Int','b']];
// `note`: the words on hover, where the pill needs a reason beside it (FIELDS note: "Subject to change")
const pill = (text, tone, note) => '<span class="pill' + (tone ? ' ' + tone : '') + '"' +
  (note ? ' title="' + esc(note) + '"' : '') + '>' + esc(text) + '</span>';
function reqPills(rq, note){
  if(!rq) return '';
  const out = [];
  if(rq[0] > 1) out.push(pill('Lv ' + rq[0]));
  ATTR.forEach(([a, c], i) => { if(rq[i + 1]) out.push(pill(rq[i + 1] + ' ' + a, 'a-' + c)); });
  if(!out.length) out.push(pill('No requirements'));
  return out.join('') + (note ? '<span class="pill-note">' + note + '</span>' : '');
}
marks.setup({D, keywordIdOf, kindOf: k => KIND[k], kwKey: id => KW.own + ':' + id});   // the keyword cards are its vocabulary: assets/marks.js
/* One line as the card shows it, with its doors marked. Two kinds of mark, and they never overlap: the words
   marked when the data was built (tools/nodelinks.py — it.hx from prep above, or a table file's own spans) and
   the keywords worked out as the card is drawn (assets/marks.js), which never land on ground the build already
   took. A mechanics card is ours, not the game's, so its mark is the word with a footnote; a keyword is the
   game's own word, so its mark is the word underlined. Neither is a keyword chip: the chips under the card are
   the summary, these are the detail. See .hlink and .kwmark in assets/css/components/. */
/* the two shapes a mark takes, by whose words they are (KINDS words.mark): one entry each, so a third kind
   of card whose words are doors is a declaration and not a branch */
const MARK = {
  ours: {cls: 'hlink',  data: 'h',  title: 'How it works — a Wraeclast Index note, not the game’s', id: key => key},
  game: {cls: 'kwmark', data: 'kw', title: 'Keyword — the game’s own words', id: key => key.slice(2)},
  open: {cls: 'hlink qlink', data: 'h', title: 'Not settled — what the game states, and what players report',
         id: key => key},
};
/* A mark is a button, and a button is drawn as a box of its own: the line could break between it and the
   comma after it, or the bracket before it. So the mark and whatever touches it with no space between ("(such
   as Shock)", "over time,") are held together, and the spaces either side stay plain text in the line. */
function spansHTML(text, spans){
  if(!spans || !spans.length) return esc(text);
  let out = '', at = 0;
  const list = spans.filter(x => MARK[markOf(x[2])]);
  list.forEach(([s, n, key], i) => {
    if(s < at) return;
    const m = MARK[markOf(key)];
    const pre = text.slice(at, s), lead = /\S*$/.exec(pre)[0];
    const stop = i + 1 < list.length ? Math.max(s + n, list[i + 1][0]) : text.length;
    const tail = /^\S*/.exec(text.slice(s + n, stop))[0];
    out += esc(pre.slice(0, pre.length - lead.length)) + '<span class="mk-w">' + esc(lead) +
      '<button type="button" class="' + m.cls + '" title="' + m.title + '" data-' + m.data + '="' + esc(m.id(key)) + '">' +
      esc(text.slice(s, s + n)) + '</button>' + esc(tail) + '</span>';
    at = s + n + tail.length;
  });
  return out + esc(text.slice(at));
}
/* One line, with the marks the build gave it and the keywords worked out here. `fixed` is what the build
   marked and this draws; `block` is all the ground the build's marks hold, whether or not they are drawn, so
   a keyword is never marked inside a name the build already read. */
function drawLine(it, text, fixed, block){
  const found = marks.scan(it, text, block, it._mkSeen);
  return spansHTML(text, fixed && fixed.length ? [...fixed, ...found].sort((a, b) => a[0] - b[0]) : found);
}
/* A line marked in a file of its own, the way the index marks its own cards' lines (tools/nodelinks.py): the
   phrases that lead to a card we wrote, off that file's key table. */
const mechSpans = (spans, lxk) => (spans || [])
  .filter(x => ours(lxk[x[2]])).map(x => [x[0], x[1], lxk[x[2]]]);
/* A card is drawn again every time it is opened, stepped back to, filtered or scrolled past, and its lines do
   not change between draws: each line keeps the form it was marked into, until the index itself moves on. */
/* Only so many cards keep their lines, though: a long visit draws thousands of cards, and each would carry its
   lines for good. The oldest to be drawn lets go first, and draws them fresh if it is ever drawn again. */
const MK_KEPT = 600;
const MK = new Set();   // the cards holding their lines, oldest first
/* the fields whose lines carry no marks (FIELDS plain): partly our own words */
const PLAIN = new Set(Object.values(FIELDS).filter(f => f.plain && f.at).map(f => f.at));
function lineHTML(it, at, i, text, marked){
  if(PLAIN.has(at)) return esc(text);
  // in the player's language: the game's own line, whole. Its keywords stay under the card as chips
  const said = TR && TR.line(text);
  if(said) return esc(said);
  const v = marks.version();
  if(it._mkv !== v){
    it._mkv = v; it._mk = {}; it._mkSeen = new Set();   // the keywords this card has marked so far, in line order
    MK.delete(it); MK.add(it);
    if(MK.size > MK_KEPT){ const old = MK.values().next().value; MK.delete(old); old._mk = null; old._mkSeen = null; old._mkv = undefined; }
  }
  const key = at + i;
  let html = it._mk[key];
  if(html === undefined) it._mk[key] = html =
    drawLine(it, text, marked && it.hx && it.hx[i], marked && it.lx && it.lx[i]);
  return html;
}
/* The card behind a marked word: a keyword's, or a mechanics card's. The page holds their heads; a card a line
   names that the page does not hold yet is fetched first. */
function openMark(el, opts){
  const id = el.dataset.kw;
  if(id !== undefined){ const c = keywordCard(id); if(c) openDetail(c, opts, hrefOf(c)); return; }
  openMech(el.dataset.h, opts);
}
function openMech(key, opts){
  const c = D.byKey.get(key);
  if(c) return void openDetail(c, opts, null);
  whole([key]).then(([x]) => { if(x) openDetail(x, opts, null); }, () => {});
}
/* A field of lines — one string, or a list of them — with the marked words in whichever of them the index
   marked (the kind's own "mark", assets/kinds.js). A list longer than max says how many are left.
   Every drawn line says which field and which line it is ("data-mk"). */
function richHTML(it, at, max){
  const v = it[at];
  if(v === undefined || v === null || v === '') return '';
  const marked = (KIND[it.k] || {}).mark === at;
  if(!Array.isArray(v)) return '<p class="card-tx" data-mk="' + at + ':0">' + lineHTML(it, at, 0, v, marked) + '</p>';
  if(!v.length) return '';
  /* the same line twice in a row is one line and how many times it is there: Mageblood's source writes its
     four random Mage's Legacy modifiers as one placeholder line each, and four of them read as a fault */
  const runs = [];
  v.forEach((x, i) => { const r = runs[runs.length - 1]; if(r && r[0] === x) r[2]++; else runs.push([x, i, 1]); });
  const li = ([x, i, n]) => '<li data-mk="' + at + ':' + i + '">' + lineHTML(it, at, i, x, marked) +
    (n > 1 ? ' <span class="ln-x">×' + n + '</span>' : '') + '</li>';
  const more = runs.length - max;
  const cut = more > FRAME.slack;   // the same slack a slot keeps: one line left over is drawn, not counted
  return '<ul class="card-ls">' + runs.slice(0, cut ? max : runs.length).map(li).join('') +
    (cut ? '<li class="more-n">' + esc(FRAME.more(more)) + '</li>' : '') + '</ul>';
}

export { ATTR, pill, reqPills, drawLine, mechSpans, lineHTML, openMark, openMech, richHTML };
