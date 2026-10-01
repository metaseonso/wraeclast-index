/* Another language on the page (#121). Fetched only when a player has picked one: an English visit never asks for
   this file or anything it reads.

   What it reads (data/manifest.json names every file, tools/lang.mjs writes them):
     data/lang/<code>/files.<h>.json   the files below, named by the manifest
     assets/words/<code>.json          our own words: labels, buttons, page names, keyed by the English. Most are
                                       the game's own word for the same thing; the few marked "ours" are not
     data/lang/<code>/names.<h>.json   every card's name and sub line, in GGG's own translation
     data/lang/<code>/<k>.<h>.json     one kind's lines, text, tags and flavour, fetched the first time a card of
                                       that kind is drawn whole
   Every string is keyed by the English it stands for. A string with no translation stays English, unmarked.

   How it reaches the page: the card's own lines are looked up as they are drawn (assets/app.js lineHTML), and
   everything else is its own run of text on the page, so one watch over the page puts any run of text the tables
   hold into the language as it lands: a card's name and sub line, a tag, a chip, a label, a button. Nothing is
   laid out again; the page keeps every layout it has. */
const S = {code: '', words: new Map(), shapes: [], names: new Map(), kinds: new Map(), want: new Map(), entry: null};
const SEP = ' · ';   // the middot between the parts of a sub line or a row of tags
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'OPTION', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'aria-label', 'title'];
const INLINE = new Set(['BUTTON', 'A', 'B', 'EM', 'I', 'STRONG', 'SPAN', 'MARK']);

async function json(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(url + ' ' + r.status);
  return r.json();
}

/* One run of text: the whole of it where a table has it, else part by part where it is parts, else as it is. */
export function tr(s){
  if(!s) return null;
  const k = s.trim();
  if(!k || !/\p{L}/u.test(k)) return null;
  const got = S.words.get(k) || S.names.get(k) || line(k) || shaped(k);
  if(got) return got;
  if(k.includes(SEP)){
    let any = false;
    const parts = k.split(SEP).map(p => { const x = S.words.get(p) || S.names.get(p) || line(p); if(x) any = true; return x || p; });
    return any ? parts.join(SEP) : null;
  }
  return null;
}
/* Our own words with a {0} in them ("{0} region"): the {0} is a number, kept, or words a table translates. */
function shaped(s){
  for(const w of S.shapes){
    const m = s.match(w.re);
    if(!m) continue;
    const got = m.slice(1).map(v => /\p{L}/u.test(v) ? (S.words.get(v) || S.names.get(v) || null) : v);
    if(got.every(Boolean)) return w.t.replace(/\{(\d)\}/g, (x, i) => got[+i] ?? x);
  }
  return null;
}
/* A card's line, from the kind tables in: the card is only drawn once its kind's table is (need). */
export function line(s){
  for(const t of S.kinds.values()){ const x = t.get(s); if(x) return x; }
  return null;
}
/* What a card's search reaches in the language too: its name and sub line (assets/app.js prep, and the worker). */
export function mark(it){
  const n = S.names.get(it.n);
  if(n){ it._nl2 = n.toLowerCase(); it._tw = (n + ' ' + (S.names.get(it.s) || '')).toLowerCase(); }
  return it;
}

/* The kinds whose lines a card about to be drawn needs. Each table is fetched once. */
export function need(kinds){
  const list = [];
  for(const k of new Set(kinds)){
    if(S.kinds.has(k)) continue;
    const f = S.entry && S.entry.kinds && S.entry.kinds[k];
    if(!f) continue;
    if(!S.want.has(k)) S.want.set(k, json(f.file).then(o => { S.kinds.set(k, new Map(Object.entries(o.t || {}))); },
      () => { S.want.delete(k); }));
    list.push(S.want.get(k));
  }
  return list.length ? Promise.all(list).then(() => rewalk()) : Promise.resolve();
}

/* ---------- the page ---------- */
const swap = node => {
  const v = node.nodeValue, up = node.parentNode;
  if(!v || !up || !/\p{L}/u.test(v) || SKIP.has(up.nodeName)) return;
  // a card's own line is put into the language whole as it is drawn, or left whole in English: never a word of it
  if(up.closest && up.closest('[data-mk]')) return;
  // nor a word marked inside a sentence of GGG's that stays English (a patch note): a word in a line is not a label
  // (a run of text with words or marked words beside it in the same line, or a mark with plain words beside it;
  // a row of buttons or links, each its own label, is not a sentence)
  const beside = (one, box, marks) => [...(box ? box.childNodes : [])].some(c => c !== one &&
    (c.nodeType === 3 || (marks && INLINE.has(c.nodeName))) && /\p{L}/u.test(c.textContent));
  if(beside(node, up, true)) return;
  for(let el = up; el && INLINE.has(el.nodeName); el = el.parentNode) if(beside(el, el.parentNode, false)) return;
  const x = tr(v);
  if(x && x !== v.trim()) node.nodeValue = v.replace(v.trim(), x);
};
/* A card's line drawn in English because its kind's table came in after it (assets/app.js lineHTML draws it whole
   in the language once the table is in): the same line, whole, as lineHTML would have drawn it. */
function lines(root){
  const els = root.matches && root.matches('[data-mk]') ? [root] : root.querySelectorAll ? root.querySelectorAll('[data-mk]') : [];
  for(const el of els){
    const x = line(el.textContent.trim());
    if(x) el.textContent = x;
  }
}
function walk(root){
  if(root.nodeType === 3) return swap(root);
  if(root.nodeType !== 1 || SKIP.has(root.nodeName)) return;
  lines(root);
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for(let n = tw.nextNode(); n; n = tw.nextNode()) swap(n);
  const els = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')] : [];
  for(const el of els) for(const a of ATTRS){
    const v = el.getAttribute && el.getAttribute(a);
    const x = v && tr(v);
    if(x && x !== v) el.setAttribute(a, x);
  }
}
let queued = 0;
function rewalk(){   // a table just came in: whatever is on the page already takes it
  if(queued) return;
  queued = requestAnimationFrame(() => { queued = 0; walk(document.body); });
}

/* Start the language: its words and every card's name first, then the page from then on. */
export async function start(code, man){
  S.code = code;
  document.documentElement.lang = man.html || code;
  const entry = S.entry = await json(man.file);
  const [words, names] = await Promise.all([json(entry.words), json(entry.names.file)]);
  for(const [e, v] of Object.entries(words)){
    const t = typeof v === 'string' ? v : v && v.t;
    if(e === '_' || !t) continue;
    if(!/\{\d\}/.test(e)){ S.words.set(e, t); continue; }
    // the {0} in order, each standing for one run of anything
    S.shapes.push({re: new RegExp('^' + e.split(/\{\d\}/).map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('(.+?)') + '$'), t});
  }
  S.names = new Map(Object.entries(names.t || {}));
  walk(document.body);
  new MutationObserver(list => {
    for(const m of list){
      if(m.type === 'attributes'){ const v = m.target.getAttribute(m.attributeName), x = v && tr(v); if(x && x !== v) m.target.setAttribute(m.attributeName, x); continue; }
      for(const n of m.addedNodes) walk(n);
    }
  }).observe(document.body, {childList: true, subtree: true, attributes: true, attributeFilter: ATTRS});
  return {tr, line, mark, need, code, names: entry.names.file};
}
