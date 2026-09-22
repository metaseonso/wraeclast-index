/* The doors inside a line, worked out as the card is drawn.

   Every line a player reads names things that have cards of their own: Energy Shield, Recouped, Elemental
   Resistances. Marking them where they are read is a lookup, not data — the browser already holds every
   keyword card, the other spellings the game shows each one as ("f"), and the mechanics cards' own words —
   so this finds the phrases while the card is drawn and the index ships nothing for them.

   The index's own build-time marks stay as they were (tools/nodelinks.py): they name other cards and the
   mechanics words in mod lines. A mark worked out here never lands on ground one of those already holds, so
   a word is marked once and by whichever of the two read it first.

   The rules, and no guessing:
     * whole words, the phrase's own letters and case, longest phrase first, never inside another mark
     * a keyword's own name is a door wherever it is read
     * its other spellings are doors only on a card whose own keyword list names it ("kw", the game's own
       markup, and the list the chips under the card are made from): "Life" opens Life Leech on a card that
       leeches and is left alone on one that only grants Life
     * a phrase two cards answer to is left plain, and nothing shorter is marked under it, unless one of them
       is actually called that and the other is only also known as it
     * a mechanics word (tools/mechanics.py) is a door only where its own card's rule says so ("fg" on the
       card, the same rule the index used): "pct" after a percentage ("40% less Attack Damage"), "start"
       opening the line with a number behind it ("Adds 8 to 18 Cold Damage"), "any" wherever it is read,
       which is for a phrase that only ever means the mechanic ("Damage taken", "Converted to"). So a word
       that is also a plain English word is never a door in prose ("no more than once", "Adds a Rune Socket")
     * never a door to the card you are already on

   One table is built per index, the first time a card asks for a mark, and assets/app.js keeps what each line
   drew, so a card opened again, stepped back to or filtered scans nothing. */

let X = null;   // what app.js lends us: the index and its own lookups
export function setup(ctx){ X = ctx; }

const WORD = /\w+/g;
const FIRST = /^\w+/;           // a phrase is looked up by its first word, and must start with one
const WORDY = /\w/;             // a phrase must end on a word boundary, as the build's matcher does
const PCT = /%\s*$/;            // "(30-40)% more Attack Damage": the line is doing maths here
const NUM = /^\s*\(?[-+]?\d/;   // "Adds 8 to 18 Cold Damage": the word opens the line and a number follows
const NONE = [];

/* When a mechanics card's word counts, by that card's own rule ("fg", tools/mechanics.py). An index written
   before the cards carried a rule keeps the old one: either of the first two. */
function mechOK(g, text, s, e){
  const pct = PCT.test(text.slice(0, s)), start = !s && NUM.test(text.slice(e));
  if(g === 'any') return true;
  if(g === 'pct') return pct;
  if(g === 'start') return start;
  return pct || start;
}

let VOC = null, SEEN = 0;
/* The phrases, by their first word, longest first. Each one is [phrase, key, other], where key is the card it
   opens (0: two cards answer to it, so it opens nothing and still holds its ground) and other says the phrase
   is one of the card's other spellings, which counts only where the card being drawn carries that keyword.
   `gates` holds each mechanics phrase's rule beside it. */
function vocab(){
  const D = X.D;
  if(VOC && VOC.ix === D.index) return VOC;
  const own = new Map(), other = new Map(), gates = new Map();
  const add = (map, p, key) => { if(p && p.length > 1) map.set(p, map.has(p) && map.get(p) !== key ? 0 : key); };
  for(const it of D.index.items){
    if(it.k === 'w'){
      add(own, it.n, 'w:' + it.id);
      for(const f of it.f || NONE) add(other, f, 'w:' + it.id);
    } else if(it.k === 'h'){
      for(const f of it.f || NONE){   // the words a mechanics card is reached by, and when each one counts
        add(own, f, 'h:' + it.id);
        gates.set(f, it.fg || '');
      }
    }
  }
  const first = new Map();
  const put = (p, key, alt) => {
    const w = FIRST.exec(p);
    if(!w) return;
    const list = first.get(w[0]);
    if(list) list.push([p, key, alt]); else first.set(w[0], [[p, key, alt]]);
  };
  for(const [p, key] of own) put(p, key, 0);
  for(const [p, key] of other) if(!own.has(p)) put(p, key, 1);
  for(const list of first.values()) list.sort((a, b) => b[0].length - a[0].length);
  VOC = {ix: D.index, first, gates, v: ++SEEN};
  return VOC;
}
/* which vocabulary a line was marked with: the index loads in two parts, so the first cards are drawn before
   the keyword cards are in and are marked again when they land (assets/app.js) */
export const version = () => vocab().v;

const held = (block, s, e) => {
  for(const x of block) if(s < x[0] + x[1] && e > x[0]) return true;   // [start, length, ...]
  return false;
};

/* The marks in one line of a card: [start, length, key], left to right and never overlapping. `block` is the
   ground the index's own marks already hold on this line ("lx"), or nothing. */
export function scan(it, text, block){
  const {first, gates} = vocab();
  const mine = it.k + ':' + it.id, kw = it.kw;
  const self = X.keywordIdOf(it);   // a keystone stands for its own keyword: not a door to itself either
  const out = [];
  WORD.lastIndex = 0;
  for(let m, at = 0; (m = WORD.exec(text)); ){
    if(m.index < at) continue;
    for(const [p, key, alt] of first.get(m[0]) || NONE){
      const s = m.index, e = s + p.length;
      if(!text.startsWith(p, s) || (e < text.length && WORDY.test(text[e]))) continue;
      if(key){
        if(alt && !(kw && kw.includes(key.slice(2)))) continue;   // the game does not mark this keyword here
        if(key[0] === 'h' && !mechOK(gates.get(p), text, s, e)) continue;
      }
      at = e;   // the phrase holds its ground whether or not it opens anything
      if(key && key !== mine && !(self && key === 'w:' + self) && !(block && held(block, s, e))) out.push([s, p.length, key]);
      break;
    }
  }
  return out;
}
