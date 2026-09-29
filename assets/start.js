/* The Start here page (#/start, #120): the way in for a new player. Nothing on it is written twice: each word
   opens the game's own card for it, each line leads to the page that holds the answer, and the counts are the
   manifest's. The words picked (WORDS) are the keyword cards a new character meets first; the "How it works"
   cards are all of them. */
import { D, esc, openDetail, hrefOf, manifest } from './app.js';

const WORDS = ['Spirit', 'Energy Shield', 'Armour', 'Evasion', 'Resistances', 'Block', 'Stun', 'Heavy Stun',
  'Ailments', 'Weapon Sets', 'Charms', 'Flasks', 'Minions', 'Quality', 'Meta Gems', 'Accuracy'];
const WAYS = [
  ['#/campaign', 'Campaign', 'Act by act: the areas, the quests and every reward kept for good.'],
  ['explore#gems', 'Gems', 'Every skill, spirit and support gem, with its numbers at any level.'],
  ['explore#uniques', 'Uniques', 'Every unique, with its lines and its price.'],
  ['#/currency', 'Currency', 'What every orb trades for, hour by hour. Divine and Exalted Orbs set the prices.'],
  ['#/craft', 'Craft', 'The crafting bench, with the real weights.'],
  ['#/atlas', 'Atlas', 'The endgame: waystones, tablets and the Atlas tree.'],
  ['#/bosses', 'Bosses', 'Every endgame boss, what it drops and how hard it hits.'],
];
let EL = null;

export async function mount(el){
  EL = el;
  const man = await manifest().catch(() => null);
  if(EL !== el) return {};
  const K = (man && man.kinds) || {}, n = k => K[k] && +K[k].n ? ' <span class="dt-sub">' + (+K[k].n).toLocaleString('en') + '</span>' : '';
  const byName = new Map();
  for(const it of (D.index && D.index.items) || []) if((it.k === 'w' || it.k === 'h') && !byName.has(it.n)) byName.set(it.n, it);
  const chip = it => '<button type="button" class="chip" data-key="' + esc(it.k + ':' + it.id) + '">' + esc(it.n) + '</button>';
  const words = WORDS.map(w => byName.get(w)).filter(Boolean);
  const how = [...byName.values()].filter(it => it.k === 'h');
  el.innerHTML =
    '<div class="pagehd"><h2>Start here</h2><p>Path of Exile 2, from the first act. Every word opens the game’s own card.</p></div>' +
    '<section class="dt-block"><div class="sect"><h3>Search anything</h3></div><p class="dt-sub">A gem, a unique, a keyword, a boss, an area. ' +
      'Each result is a card with its price and what it connects to. <a href="#/">Search</a></p></section>' +
    (words.length ? '<section class="dt-block"><div class="sect"><h3>Words to know first</h3></div><div class="kinds st-words">' +
      words.map(chip).join('') + '</div><p class="dt-sub"><a href="#/?k=w">Every keyword</a>' + n('w') + '</p></section>' : '') +
    (how.length ? '<section class="dt-block"><div class="sect"><h3>How it works</h3></div><div class="kinds st-words">' +
      how.map(chip).join('') + '</div></section>' : '') +
    '<section class="dt-block"><div class="sect"><h3>Where to look</h3></div><ul class="cp-list">' + WAYS.map(([href, name, line]) =>
      '<li><span><a href="' + href + '"><b>' + esc(name) + '</b></a> <span class="dt-sub">' + esc(line) + '</span></span></li>').join('') +
    '</ul></section>';
  el.addEventListener('click', e => {
    const b = e.target.closest('[data-key]'), c = b && D.byKey.get(b.dataset.key);
    if(c) openDetail(c, {}, hrefOf(c));
  });
  return {};
}
export function unmount(){ EL = null; }
