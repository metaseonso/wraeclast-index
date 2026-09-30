/* An item copied in game and pasted into a search box: its card opens.
   assets/app.js hands over a paste that is the game's item text; assets/itemtext.js reads it. A unique opens by
   its name, a currency or anything that stacks by its name, a gem by its name, and anything else by its base
   type. A rare or a magic item opens its base's card with its own modifiers under it, as the game wrote them,
   and a link to the official trade site searching for that base with those modifiers. The link only opens the
   trade site in the browser: nothing here asks the trade site anything.
   Prices stay the card's own: a unique or a currency keeps its price and its age, and a rare, a magic item or an
   unidentified unique shows none, because the price on its base's card is for another item. */
import { D, esc, named, openDetail, hrefOf } from './app.js';
import { KIND, holds } from './kinds.js';
import { parse, resolve, shown, ownPrice } from './itemtext.js';

/* the card of this kind and name, where the index has one: a unique on the pasted base first, and never an
   entry its kind says is not an item (an Atlas passive shares its kind with the waystones) */
async function pick(it, k, n){
  let list;
  try { list = await named(k, n); } catch { return null; }
  const d = KIND[k] || {};
  list = list.filter(c => !(d.notitem && holds(c, d.notitem)));
  if(!list.length) return null;
  return (it.base && list.find(c => c.id === c.n + ' | ' + it.base)) || list[0];
}

/* ---------- the trade link ----------
   The same search the Trade panel builds (assets/trade.js): the base, any rarity but unique, and each line
   the trade site can search, at least as high as this item rolled it. */
const GEAR = /Weapon|Armour|Shield|Buckler|Focus|Quiver|Sword|Axe|Mace|Bow|Crossbow|Spear|Staff|Wand|Sceptre|Dagger|Claw|Flail|Talisman|Helmet|Gloves|Boots|Body/;
const ORDER = {
  implicit: ['implicit', 'explicit', 'enchant'],
  enchant: ['enchant', 'explicit', 'implicit'],
  rune: ['rune', 'explicit', 'enchant'],
  corruption: ['enchant', 'implicit', 'explicit'],
  fractured: ['fractured', 'explicit'],
  desecrated: ['desecrated', 'explicit'],
  crafted: ['crafted', 'explicit'],
};
const FROM = ['explicit', 'fractured', 'desecrated', 'crafted', 'implicit', 'rune', 'enchant'];
// the trade site lists "reduced" and "less" as "increased" and "more" with a negative number (assets/tradepage.js)
const flip = line => /\b(reduced|less)\b/.test(line) ? line.replace(/\breduced\b/, 'increased').replace(/\bless\b/, 'more') : null;
async function tradeLink(it){
  const tr = await import('./trade.js');
  const T = await tr.tradeData();
  const gear = GEAR.test(it.cls || '');
  const find = (line, kind) => {
    const k = tr.key(line);
    for(const src of ORDER[kind] || FROM){
      if(gear && T.local[src] && T.local[src][k]) return T.local[src][k];
      if(T.by[src] && T.by[src][k]) return T.by[src][k];
    }
    return null;
  };
  const stats = [];
  let left = 0;
  for(const m of it.mods){
    let id = find(m.text, m.kind), neg = false;
    if(!id && flip(m.text)){ id = find(flip(m.text), m.kind); neg = !!id; }
    if(!id || stats.some(s => s.id === id)){ left++; continue; }
    const r = tr.range(m.text);
    const value = !r ? {} : neg ? {max: -r.lo} : {min: Math.round(r.lo * 100) / 100};
    stats.push({id, value, disabled: false});
  }
  const q = {status: {option: 'any'}, type: it.base,
    filters: {type_filters: {filters: {rarity: {option: 'nonunique'}}}}};
  if(stats.length) q.stats = [{type: 'and', filters: stats}];
  const league = (D.market && D.market.league) || 'Standard';
  return {url: tr.searchURL(league, {query: q, sort: {price: 'asc'}}), n: stats.length, of: stats.length + left};
}

/* ---------- what goes under the card ---------- */
const FLAGS = [['twice', 'Twice Corrupted'], ['corrupted', 'Corrupted'], ['mirrored', 'Mirrored'], ['sanctified', 'Sanctified'],
  ['unidentified', 'Unidentified'], ['fractured', 'Fractured Item'], ['unmodifiable', 'Unmodifiable']];
function factsOf(it, own){
  const out = [];
  if(!own && it.name) out.push('<b>' + esc(it.name) + '</b>');
  if(!own && it.rarity) out.push(esc(it.rarity));
  if(it.stack) out.push('Stack Size: ' + esc(it.stack.n.toLocaleString('en') + '/' + it.stack.max.toLocaleString('en')));
  if(it.level && it.rarity === 'Gem') out.push('Level: ' + it.level);
  if(it.quality) out.push('Quality: +' + it.quality + '%');
  if(it.ilvl && !own) out.push('Item Level: ' + it.ilvl);
  if(it.sockets && it.sockets.length && !own) out.push('Sockets: ' + esc(it.sockets.join(' ')));
  for(const [f, w] of FLAGS) if(it[f] && !(f === 'corrupted' && it.twice)) out.push(w);
  return out;
}
async function extraHTML(it, own){
  const facts = factsOf(it, own);
  if(own) return facts.length ? '<p class="card-facts">' + facts.join(' · ') + '</p>' : '';
  const lines = it.mods.length ? '<ul class="card-ls">' + it.mods.map(m => '<li>' + esc(shown(m)) + '</li>').join('') + '</ul>' : '';
  let go = '';
  if(it.base){
    try {
      const t = await tradeLink(it);
      go = (t.n < t.of ? '<p class="card-facts">On trade: ' + t.n + ' of ' + t.of + ' lines</p>' : '') +
        '<div class="tgo"><a class="btn gold" target="_blank" rel="noopener" href="' + esc(t.url) + '">Open on trade ↗</a></div>';
    } catch {}
  }
  return '<div class="card-blk">' + (facts.length ? '<p class="card-facts">' + facts.join(' · ') + '</p>' : '') + lines + go + '</div>';
}

/* A paste that is the game's item text: its card, opened as any card is. An item the index has no card for
   is searched for by its name, as if it had been typed. */
let ASKED = 0;
export async function pasted(text, box){
  const it = parse(text);
  if(!it) return;
  const mine = ++ASKED;
  const c = await resolve(it, (k, n) => pick(it, k, n));
  if(mine !== ASKED) return;   // pasted again since: that one opens
  if(!c){
    const words = it.name || it.base || '';
    if(box && words){ box.value = words; box.dispatchEvent(new Event('input', {bubbles: true})); }
    return;
  }
  // the card is the item itself (a unique, a currency, a gem, a white base) or its base type
  const own = ownPrice(it) && (c.k !== 'b' || it.rarity === 'Normal');
  const opts = {extra: await extraHTML(it, own)};
  if(!own) opts.price = null;
  if(mine !== ASKED) return;
  openDetail(c, opts, hrefOf(c));
}
