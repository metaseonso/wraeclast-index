/* The search's own rules: which cards answer the words typed, and in what order. Moved here from assets/app.js
   unchanged, so the search worker (assets/searchworker.js) and the page (the Currency tab's box, the map's
   find, which match words against the cards the page holds) read one copy of them.

   ranker(X) answers over whatever X lends it:
     X.items()       every card it searches, in the index's order
     X.get(key)      one card by key
     X.groupsOf(it)  the groups a card sits in, with how many cards each holds (assets/graph.js)
     X.priced(it)    whether today's prices list it (assets/app.js priceOf)
     X.usage(it)     how many builds use it (empty until poe.ninja opens its builds to other sites)
     X.seen()        the keys of the cards opened, newest first
     X.version()     anything that changes when the cards do
     X.idle(f)       run f when the thread has nothing else to do
   A card here carries what assets/app.js prep gives it: _nl (its name, lower case) and _hay (every word on it,
   lower case). */
import {KIND, KW} from './kinds.js';

/* ---------- where you have been ----------
   A card is near one of yours when the index already joins the two: the same base item, item class, Atlas
   section or sub line - the maps Connections is drawn from - a keyword they share, or a card yours names
   outright. Every card further back counts for less, so the last few decide it.
   A group of three says a great deal and a group of nine hundred says next to nothing, so each one is worth
   less the more cards are in it, and a keyword the same by its own tally. The sum is capped: the words still
   say what the search is about, and closeness only orders what they matched. */
export const SEEN_MAX = 12;           // cards kept; the oldest drops off
const SEEN_FADE = 0.7;         // what each card further back is worth against the one in front of it
const SEEN_NAMED = 0.6;        // a card one of yours names, against one you opened yourself
const NEAR_CAP = 150, NEAR_STEP = 60;   // the most closeness can add, and what one full share of it is worth
const NEAR_LETTERS = 6;   // from here up a word is allowed two slips; under it, one

export function ranker(X){
  // how many cards carry a keyword, off the keyword card's own tally: one on a thousand cards says much less
  // about where you have been than one on five
  function kwSpread(id){
    const c = X.get(KW.own + ':' + id);
    if(c && c.us !== undefined) return c.us;   // the search row carries the tally already summed (tools/shards.py)
    return c && c.use ? Object.values(c.use).reduce((a, b) => a + b, 0) : 1;
  }
  const weigh = (map, k, w) => map.set(k, (map.get(k) || 0) + w);
  /* What the trail has in common, worked out again whenever it moves. Nothing here runs until a card has been
     opened, and nothing at all before something is typed. */
  let NEAR = null, NEARN = 0;   // NEARN counts the times it has been worked out, and stamps what the cards keep
  function nearness(){
    const keys = X.seen().slice(0, SEEN_MAX);
    if(!keys.length) return null;              // nothing opened yet: there is no trail to be near, and no cost
    const sig = keys.join(' ');
    if(NEAR && NEAR.sig === sig && NEAR.v === X.version()) return NEAR;
    const group = new Map(), card = new Map(), kw = new Map();
    let w = 1;
    for(const key of keys){
      const it = X.get(key);   // a card a newer index no longer carries is simply not there
      if(it){
        weigh(card, key, w);
        for(const [g, n] of X.groupsOf(it)) weigh(group, g, w / Math.log2(2 + n));
        for(const id of it.kw || []) weigh(kw, id, w / Math.log2(2 + kwSpread(id)));
        for(const t of it.rx || []) weigh(card, t, w * SEEN_NAMED);
      }
      w *= SEEN_FADE;
    }
    NEAR = {sig, v: X.version(), n: ++NEARN, group, card, kw};
    return NEAR;
  }
  /* One card against the trail: every share of it counted, then capped. Worked out once per card and kept on
     the card until the trail moves, because a search is a whole list of matches scored again on every
     keystroke, and between two keystrokes none of this has changed. */
  function nearScore(it, N){
    if(it._ncs === N.n) return it._ncv;
    let c = N.card.get(it.k + ':' + it.id) || 0;
    for(const g of X.groupsOf(it)) c += N.group.get(g[0]) || 0;
    for(const id of it.kw || []) c += N.kw.get(id) || 0;
    it._ncs = N.n;
    return it._ncv = c && Math.min(NEAR_CAP, c * NEAR_STEP);
  }

  /* ---------- a word that was nearly typed ----------
     A search where every letter has to be right is a search that answers nothing the moment a finger slips,
     and the names here are not ones anybody spells from memory: Uul-Netol, Quarterstaff, Simulacrum.

     So a word the index has never seen is looked up in the index's own vocabulary — every word on every card —
     and whatever was nearly typed stands in for it. The distance is Damerau's, which counts two letters swapped
     as one slip rather than two, because that is the most common slip there is: "divien" is one away from
     "divine" and would be two away under plain Levenshtein.

     It runs only where a word matched nothing at all. Typing "divin" matches, so nothing here happens on the
     way to "divine"; it is the finished word that misses, and then it costs one pass over a list of short
     words, once, on that keystroke. */
  let VOCAB = null, VOCAB_AT = -1;
  const wordsOf = (set, it) => { for(const w of (it._hay || '').match(/[a-z0-9]+/g) || []) if(w.length > 2) set.add(w); };
  function vocab(){
    const items = X.items(), n = items.length;
    if(VOCAB && VOCAB_AT === n) return VOCAB;
    const set = new Set();
    for(const it of items) wordsOf(set, it);
    VOCAB_AT = n;
    return VOCAB = [...set];
  }
  /* The list is worked out while the thread has nothing else to do, a few milliseconds at a time, once the
     cards are in, so the first key typed never pays for it. A key that comes before it is finished builds the
     list whole, there and then, and this stops. */
  function vocabLater(){
    const items = X.items(), n = items.length, set = new Set();
    let i = 0;
    const slice = () => {
      if(VOCAB_AT === n || X.items() !== items) return;
      const stop = performance.now() + 6;
      while(i < n){
        wordsOf(set, items[i++]);
        if(!(i & 127) && performance.now() > stop) return void X.idle(slice);
      }
      VOCAB_AT = n;
      VOCAB = [...set];
    };
    X.idle(slice);
  }
  /* What was nearly typed, nearest first, at most a handful. */
  function nearWords(t){
    const max = t.length >= NEAR_LETTERS ? 2 : 1;
    const hit = [];
    for(const w of vocab()){
      if(Math.abs(w.length - t.length) > max) continue;
      const d = apart(t, w, max);
      if(d <= max) hit.push([d, w]);
    }
    hit.sort((a, b) => a[0] - b[0] || a[1].length - b[1].length);
    return hit.slice(0, 6).map(x => x[1]);
  }
  /* One typed word, turned into what a card is allowed to match it with. `near` says the word was not the one
     typed, so a card that matched it scores under one that matched the letters as they were given. */
  function words(qs){
    const out = [];
    for(const t of qs.trim().toLowerCase().split(/\s+/).filter(Boolean)){
      if(t.length < 3){ out.push({alts: [t], near: false}); continue; }
      if(vocab().some(w => w.includes(t))){ out.push({alts: [t], near: false}); continue; }
      const alts = nearWords(t);
      out.push({alts: alts.length ? alts : [t], near: !!alts.length});
    }
    return out;
  }

  /* ---------- search ---------- */
  function search(q, kind = 'all'){
    const qs = q.trim().toLowerCase();
    const ws = words(qs);          // each typed word, and whatever was nearly typed where it answered nothing
    const out = [];
    if(!ws.length) return out;
    const slipped = ws.some(w => w.near);
    /* Where a word slipped, the whole-name bonuses are worked against the words the index really has rather
       than the letters given, at half weight: somebody who typed "quaterstaff" wants the Quarterstaff above
       the Aegis Quarterstaff, and the only thing that says so is the name matching the word they meant. */
    const fixed = slipped ? ws.map(w => w.alts[0]).join(' ') : qs;
    const fw = slipped ? 0.5 : 1;
    const wordStart = new RegExp('(^|[^a-z0-9])' + qs.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const near = nearness();   // no trail, and the score below is the one it always was
    for(const it of X.items()){
      if((kind !== 'all' && it.k !== kind) || it.dup) continue;
      let s = hits(it, ws);
      if(s === null) continue;
      if(it._nl === fixed) s += 1000 * fw;
      else if(it._nl.startsWith(fixed)) s += 600 * fw;
      else if(!slipped && wordStart.test(it._nl)) s += 380;
      else if(it._nl.includes(fixed)) s += 220 * fw;
      s += (KIND[it.k] || {}).rank || 0;              // a kind that should not rank beside the rest says so once
      if(X.priced(it)) s += 12;
      const u = X.usage(it); if(u) s += Math.min(40, u * 2);
      if(near) s += nearScore(it, near);              // how close it sits to the cards already opened
      out.push({it, s: s - it.n.length * 0.2});
    }
    /* Two bands, and the low one is always second: a card marked "lo" is the tree's own wording for a stat
       ("Attack Speed", "Armour" — the 893 small passives tools/treecards.py cards), so the words match it every
       time and it would crowd out what the words actually name. Nothing low ever sits above something else the
       same words matched: typing "life" still puts the notable and the unique first. Inside the low band they
       sort by the same score as everything else, so the one the words really name leads it. */
    out.sort((a, b) => (a.it.lo ? 1 : 0) - (b.it.lo ? 1 : 0) || b.s - a.s);
    return out.map(x => x.it);
  }
  return {words, hits, search, vocab, vocabLater};
}

/* Damerau–Levenshtein, given up on as soon as the whole row is already further than max. */
function apart(a, b, max){
  const al = a.length, bl = b.length;
  if(Math.abs(al - bl) > max) return max + 1;
  let two = null;                        // the row two back, which a swap is measured against
  let one = new Array(bl + 1);           // ...and the row before this one
  for(let j = 0; j <= bl; j++) one[j] = j;
  for(let i = 1; i <= al; i++){
    const row = new Array(bl + 1);
    row[0] = i;
    let best = i;
    for(let j = 1; j <= bl; j++){
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(one[j] + 1, row[j - 1] + 1, one[j - 1] + cost);
      if(two && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, two[j - 2] + 1);
      row[j] = v;
      if(v < best) best = v;
    }
    if(best > max) return max + 1;       // the whole row is already too far: nothing below it can come back
    two = one; one = row;
  }
  return one[bl];
}
/* Does this card answer to every word typed, and how well. Null where one word has no answer on it at all —
   every word has to land somewhere, which is what keeps a two-word search from widening. */
export function hits(it, ws){
  let s = 0;
  for(const w of ws){
    let best = 0;
    for(const a of w.alts){
      if(it._nl.includes(a)){ best = w.near ? 30 : 40; break; }
      if(it._hay.includes(a)) best = Math.max(best, w.near ? 5 : 8);
    }
    if(!best) return null;
    s += best;
  }
  return s;
}
