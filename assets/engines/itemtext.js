/* Item text: what the game puts on the clipboard when a player copies an item (Ctrl+C, or Ctrl+Alt+C for the
   advanced text that names each modifier and its tier), read into plain facts. English client text.

   Pure functions, no DOM, nothing fetched: the search boxes read a paste with it (assets/paste.js) and
   tools/dev/itemtext.test.mjs reads its fixtures with it, the same way.

   The text is blocks split by a line of eight dashes. The first block is the header: "Item Class:", "Rarity:",
   then the name and the base type (a rare or a unique), or one line (a magic item's whole name, an
   unidentified item's base, a currency, a gem). What comes after is read block by block, by what its lines
   say, never by where the block sits, except for one rule: an item's modifiers come after its item level. */

const SEP = /^-{8,}\s*$/;
/* the game's own copy, and nothing else: a first line naming the class or the rarity, a rarity line and a
   separator. A search typed by hand never has all three. */
export function isItemText(t){
  if(typeof t !== 'string') return false;
  const s = t.replace(/^﻿/, '').trimStart();
  return /^(?:Item Class|Rarity): \S/.test(s) && /^Rarity: \S/m.test(s) && /^-{8,}\s*$/m.test(s);
}

/* ---------- lines ---------- */
// "30(26-30)%" in the advanced text is "30%" in the plain one: the roll, without the range it rolled in
const ROLL = /([+-]?\d+(?:\.\d+)?)\([+-]?\d+(?:\.\d+)?-[+-]?\d+(?:\.\d+)?\)/g;
// the tag the plain text puts after a line that is not an ordinary modifier
const TAG = /\s+\((implicit|enchant|rune|crafted|fractured|desecrated|augmented|unmet)\)\s*$/;
export function plainLine(s){
  return String(s).replace(ROLL, '$1').replace(/\s+—\s+Unscalable Value\s*$/, '').replace(/\s+/g, ' ').trim();
}
const num = s => { const n = parseFloat(String(s).replace(/,/g, '')); return isFinite(n) ? n : null; };

/* The line above a modifier in the advanced text: { Prefix Modifier "Painful" (Tier: 1) — Damage }.
   What kind of modifier it is, its side, its name and its tier; the tags after the dash are left off. */
const HEAD = /^\{\s*(.+?)\s*\}$/;
function header(s){
  const m = s.match(HEAD);
  if(!m) return null;
  const body = m[1].split(/\s+—\s+/)[0];
  const h = {kind: 'explicit', side: null, affix: null, tier: null};
  const name = body.match(/"([^"]+)"/);
  if(name) h.affix = name[1];
  const tier = body.match(/\((?:Tier|Rank): (\d+)\)/);
  if(tier) h.tier = +tier[1];
  if(/\bPrefix\b/.test(body)) h.side = 'prefix';
  else if(/\bSuffix\b/.test(body)) h.side = 'suffix';
  if(/^Fractured\b/.test(body)) h.kind = 'fractured';
  else if(/^Desecrated\b/.test(body)) h.kind = 'desecrated';
  else if(/^Crafted\b/.test(body)) h.kind = 'crafted';
  else if(/^Implicit\b/.test(body)) h.kind = 'implicit';
  else if(/^Unique\b/.test(body)) h.kind = 'unique';
  else if(/^Enchant/.test(body)) h.kind = 'enchant';
  else if(/^Rune\b|^Augment/.test(body)) h.kind = 'rune';
  else if(/^Corrupt/.test(body)) h.kind = 'corruption';
  return h;
}

/* A block of the game's own words about using the item, not a modifier on it: the last block of a jewel, a
   waystone, a tablet, a relic, a flask, a charm, a currency or a gem. */
const USE = /^(?:Place (?:into|this item|one or more)|Can be used|Right [Cc]lick|Used automatically|Skills can be managed|Shift click|Travel to|Combine|Can only be|This item can be|Use this item|Take this item|Adds? this|Socket this|Give this)/;
const FLAGS = [
  [/^Corrupted$/, it => { it.corrupted = true; }],
  [/^Twice Corrupted$/, it => { it.corrupted = true; it.twice = true; }],
  [/^Mirrored$/, it => { it.mirrored = true; }],
  [/^Unidentified(?: \(Tier (\d+)\))?$/, (it, m) => { it.unidentified = true; if(m[1]) it.unidTier = +m[1]; }],
  [/^Sanctified$/, it => { it.sanctified = true; }],
  [/^Unmodifiable$/, it => { it.unmodifiable = true; }],
  [/^Fractured Item$/, it => { it.fractured = true; }],
  [/^Split$/, it => { it.split = true; }],
];
const flagOf = line => { for(const [re, f] of FLAGS){ const m = line.match(re); if(m) return [m, f]; } return null; };

/* ---------- the reader ---------- */
export function parse(text){
  if(!isItemText(text)) return null;
  const lines = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/\s+$/, ''));
  const blocks = [];
  let cur = [];
  for(const l of lines){
    if(SEP.test(l)){ if(cur.length) blocks.push(cur); cur = []; }
    else if(l.trim()) cur.push(l.trim());
  }
  if(cur.length) blocks.push(cur);

  const it = {cls: null, rarity: null, name: null, base: null, names: [],
    ilvl: null, quality: null, level: null, tier: null, areaLevel: null, stack: null,
    sockets: null, req: null, props: [], grants: [], mods: [], runes: [], text: [],
    corrupted: false, twice: false, mirrored: false, unidentified: false, unidTier: null,
    sanctified: false, unmodifiable: false, fractured: false, split: false, note: null};

  // the header
  const head = blocks.shift() || [];
  for(const l of head){
    let m;
    if((m = l.match(/^Item Class: (.+)$/))) it.cls = m[1];
    else if((m = l.match(/^Rarity: (.+)$/))) it.rarity = m[1];
    else it.names.push(l);
  }
  const two = it.names.length >= 2;
  if(two){ it.name = it.names[0]; it.base = it.names[it.names.length - 1]; }
  else if(it.names.length){
    const one = it.names[0];
    // one line: a magic item's whole name (its base is in it somewhere), or the base of an item that is not
    // identified yet, or the name of a currency or a gem. A rare or a unique is only one line unidentified.
    if(it.rarity === 'Rare' || it.rarity === 'Unique') it.base = one;
    else if(it.rarity === 'Magic') it.name = one;
    else if(it.rarity === 'Normal'){ it.name = one; it.base = one.replace(/^Superior /, ''); }
    else it.name = one;
  }
  const gem = it.rarity === 'Gem';
  const unique = it.rarity === 'Unique';
  let afterIlvl = false, modsDone = false;
  // gear has an item level, and what comes before it is the item's own numbers (a flask's charges, a charm's
  // duration); a currency has none, and its lines are the game's words on what it does
  const hasIlvl = blocks.some(b => b.some(l => /^Item Level: \d/.test(l)));

  for(const b of blocks){
    // flags: a block of nothing but Corrupted, Mirrored, Unidentified and the like
    if(b.every(l => flagOf(l))){ for(const l of b){ const [m, f] = flagOf(l); f(it, m); } continue; }
    if(/^Note: /.test(b[0])){ it.note = b.join('\n').replace(/^Note: /, ''); continue; }
    if(b[0] === 'Requirements:'){
      it.req = it.req || {};
      for(const l of b.slice(1)){
        const m = l.match(/^(Level|Str|Dex|Int|Strength|Dexterity|Intelligence): (\d+)/);
        if(m) it.req[{Strength: 'Str', Dexterity: 'Dex', Intelligence: 'Int'}[m[1]] || m[1]] = +m[2];
      }
      continue;
    }
    // advanced text: a header line over each modifier says what it is
    if(b.some(l => HEAD.test(l))){
      let h = null;
      for(const l of b){
        const hh = header(l);
        if(hh){ h = hh; continue; }
        addMod(it, l, h ? h.kind : (unique ? 'unique' : 'explicit'), h);
      }
      if(h && h.kind !== 'implicit' && h.kind !== 'enchant' && h.kind !== 'rune' && h.kind !== 'corruption') modsDone = true;
      continue;
    }
    // plain text: a block whose every line carries a tag is implicits, enchants or runes
    const tags = b.map(l => (l.match(TAG) || [])[1]);
    if(afterIlvl && tags.every(t => t && t !== 'augmented' && t !== 'unmet')){
      for(let i = 0; i < b.length; i++) addMod(it, b[i].replace(TAG, ''), tags[i], null);
      continue;
    }
    let used = false, rest = [];
    for(const l of b){
      let m;
      if((m = l.match(/^Item Level: (\d+)/))){ it.ilvl = +m[1]; afterIlvl = true; used = true; }
      else if((m = l.match(/^Stack Size: ([\d,]+)\s*\/\s*([\d,]+)/))){ it.stack = {n: num(m[1]), max: num(m[2])}; used = true; }
      else if((m = l.match(/^Quality(?: \(([^)]+)\))?: \+?(-?\d+(?:\.\d+)?)%/))){ it.quality = num(m[2]); used = true; }
      else if((m = l.match(/^Waystone Tier: (\d+)/))){ it.tier = +m[1]; used = true; }
      else if((m = l.match(/^Area Level: (\d+)/))){ it.areaLevel = +m[1]; used = true; }
      else if((m = l.match(/^Level: (\d+)/)) && (gem || !afterIlvl)){ it.level = +m[1]; used = true; }
      else if((m = l.match(/^Requires: (.+)$/))){ it.req = {...(it.req || {}), ...reqOf(m[1])}; used = true; }
      else if((m = l.match(/^Sockets: (.+)$/))){ it.sockets = m[1].trim().split(/\s+/).filter(Boolean); used = true; }
      else if((m = l.match(/^Grants Skill: (.+)$/))){ it.grants.push(m[1]); used = true; }
      else rest.push(l);
    }
    if(!rest.length) continue;
    if(used || !afterIlvl || gem || USE.test(rest[0])){
      // the item's own numbers (damage, defences, a flask's charges), or the game's words on using it
      if(!afterIlvl && !gem && (hasIlvl || rest.every(l => /^[^:]{1,40}: \S/.test(l)))) for(const l of rest) it.props.push(plainLine(l.replace(TAG, '')));
      else it.text.push(...rest);
      continue;
    }
    // after the item level, the first block of untagged lines is the modifiers. An unidentified item has
    // none to show, and a unique's next block is its flavour text.
    if(modsDone || it.unidentified){ it.text.push(...rest); continue; }
    for(const l of rest){
      const t = (l.match(TAG) || [])[1];
      addMod(it, l.replace(TAG, ''), t && t !== 'augmented' && t !== 'unmet' ? t : (unique ? 'unique' : 'explicit'), null);
    }
    modsDone = true;
  }
  if(it.tier === null && it.base){ const m = it.base.match(/\(Tier (\d+)\)/); if(m) it.tier = +m[1]; }
  it.runes = it.mods.filter(m => m.kind === 'rune').map(m => m.text);
  return it;
}
function addMod(it, line, kind, h){
  const text = plainLine(line.replace(TAG, ''));
  if(!text) return;
  it.mods.push({text, kind: kind || 'explicit', side: h ? h.side : null, affix: h ? h.affix : null, tier: h ? h.tier : null});
}
function reqOf(s){
  const out = {};
  for(const part of s.split(/,\s*/)){
    let m;
    if((m = part.match(/^Level (\d+)/))) out.Level = +m[1];
    else if((m = part.match(/^(\d+)(?: \((?:augmented|unmet)\))? (Str|Dex|Int|Strength|Dexterity|Intelligence)\b/)))
      out[{Strength: 'Str', Dexterity: 'Dex', Intelligence: 'Int'}[m[2]] || m[2]] = +m[1];
  }
  return out;
}

/* ---------- which card ----------
   The line a modifier would show as a player reads it in the plain text: the game's tag after an implicit,
   an enchant, a rune and the rest, nothing after an ordinary one. */
const SHOWN = new Set(['implicit', 'enchant', 'rune', 'crafted', 'fractured', 'desecrated']);
export const shown = m => m.text + (SHOWN.has(m.kind) ? ' (' + m.kind + ')' : '');

/* Every run of whole words in a magic item's name, longest first: "Crackling Temple Maul of the Brute" holds
   its base, "Temple Maul", somewhere, and the longest run that is a base is the base. */
export function runs(name){
  const w = String(name || '').split(/\s+/).filter(Boolean), out = [];
  for(let len = w.length; len >= 1; len--) for(let i = 0; i + len <= w.length; i++){
    const part = w.slice(i, i + len);
    if(/^(of|the)$/i.test(part[0]) || /^(of|the)$/i.test(part[part.length - 1])) continue;
    out.push(part.join(' '));
  }
  return out;
}
/* The names its base type may go by, in the order to try them */
export function bases(it){
  const out = [];
  const add = n => { if(n && !out.includes(n)) out.push(n); };
  if(it.base){ add(it.base); add(it.base.replace(/^Superior /, '')); }
  if(!it.base && it.name && it.rarity === 'Magic') for(const r of runs(it.name.replace(/^Superior /, ''))) add(r);
  return out;
}
/* Where to look, in order: [kind letter, name] (assets/kinds.js). A unique by its name; a currency or anything
   else that stacks by its name; a gem by its name; everything else by its base type. */
export function plan(it){
  const out = [], seen = new Set();
  const add = (k, n) => { const key = k + ':' + n; if(n && !seen.has(key)){ seen.add(key); out.push([k, n]); } };
  if(!it) return out;
  if(it.rarity === 'Unique' && it.name && !it.unidentified){ add('u', it.name); add('a', it.name); }
  if(it.rarity === 'Gem'){ add('g', it.name); add('c', it.name); }
  const stacks = it.rarity === 'Currency' || it.stack || /Currency|Omen|Socketable|Essence|Fragment|Uncut|Soul Core|Rune/i.test(it.cls || '');
  if(stacks && it.name){
    const names = [it.name];
    if(it.level && !/\(Level \d+\)$/.test(it.name)) names.push(it.name + ' (Level ' + it.level + ')');
    for(const n of names){ add('c', n); add('a', n); add('g', n); add('b', n); }
  }
  for(const b of bases(it)){ add('b', b); add('a', b); add('c', b); }
  return out;
}
/* The first place in the plan that has a card. `pick(k, n)` answers with the card or nothing, at once or as a
   promise: the page asks its search, the tests a table. */
export async function resolve(it, pick){
  for(const [k, n] of plan(it)){
    const c = await pick(k, n);
    if(c) return c;
  }
  return null;
}
/* Priced as itself or not: a rare, a magic item or an unidentified unique is one item of its own, and the
   price on its base's card is for another. */
export const ownPrice = it => !!it && !it.unidentified && it.rarity !== 'Rare' && it.rarity !== 'Magic';
