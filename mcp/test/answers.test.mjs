/* The six answers on the fixture: what they say, and the rules every answer keeps. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixtureAnswers } from './helpers.mjs';
import { NotFound } from '../src/answers.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const VOICE = join(REPO, 'tools', 'dev', 'voice.mjs');
const PAGE = /https:\/\/wraeclastindex\.fyi\/item\/[a-z0-9-]+/;

/* every answer the tests draw, for the rules below */
const ASKED = [
  ['search', {words: 'death'}], ['search', {words: 'freeze'}], ['search', {words: 'rare monster'}],
  ['search', {words: 'harp', kind: 'unique'}], ['search', {words: 'nothing like this'}],
  ['card', {name: "Death's Harp"}], ['card', {name: 'Divine Orb'}], ['card', {name: 'Abasement'}],
  ['card', {name: 'Freeze', kind: 'keyword'}], ['card', {name: 'fireball'}], ['card', {name: 'Clearfell Encampment'}],
  ['card', {name: 'Waystone (Tier 15)'}], ['card', {name: 'The Lost Lute'}], ['card', {name: 'Albino Rhoa Feather'}],
  ['price', {name: 'Headhunter'}], ['price', {name: 'Chaos Orb', unit: 'exalted'}], ['price', {name: "Ahn's Citadel"}],
  ['price', {name: 'Adherent Cuffs'}], ['price', {name: 'Fireball'}],
  ['history', {name: 'Divine Orb'}], ['history', {name: 'Chaos Orb'}], ['history', {name: 'Headhunter'}], ['history', {name: 'Exalted Orb'}],
  ['changes', {card: 'Fireball'}], ['changes', {card: 'Freeze', kind: 'keyword'}], ['changes', {patch: '0.5.2'}],
  ['changes', {}], ['changes', {patch: '0.45'}], ['changes', {patch: '9.9.9'}],
  ['compare', {names: ['Headhunter', "Death's Harp"]}], ['compare', {names: ['Fireball', 'Freeze', 'Divine Orb']}],
];
let ANSWERS = null;
async function all(){
  if(ANSWERS) return ANSWERS;
  const a = fixtureAnswers();
  ANSWERS = [];
  for(const [tool, args] of ASKED) ANSWERS.push({tool, args, text: await a[tool](args)});
  return ANSWERS;
}

test('search: names first, then the cards\' own lines, each with its page', async () => {
  const a = fixtureAnswers();
  const t = await a.search({words: 'freeze'});
  assert.match(t, /^Search "freeze": 2 cards\./);
  assert.match(t, /- Freeze · Support gem · Intelligence · https:\/\/wraeclastindex\.fyi\/item\/freeze\n/);
  assert.match(t, /- Freeze · Keyword · https:\/\/wraeclastindex\.fyi\/item\/freeze-keyword\n/);
  const lines = await a.search({words: 'rare monster'});
  assert.match(lines, /Headhunter · Unique · Heavy Belt · Belt · https:\/\/wraeclastindex\.fyi\/item\/headhunter\n  When you kill a Rare monster/);
  assert.match(await a.search({words: 'freeze', kind: 'keyword'}), /1 card\.\n- Freeze · Keyword/);
  assert.match(await a.search({words: 'orb', kind: 'currency'}), /Divine Orb · Currency · https:\/\/wraeclastindex\.fyi\/item\/divine-orb/);
  await assert.rejects(a.search({words: 'x', kind: 'boss'}), /No kind "boss"/);
});

test('card: the site\'s own words, the price on lines of its own, the page', async () => {
  const a = fixtureAnswers();
  const t = await a.card({name: "Death's Harp"});
  assert.equal(t.split('\n')[0], "Death's Harp");
  assert.match(t, /\nUnique · Dualstring Bow · Bow · Path of Exile 2\nRequires: level 28, 52 Dex\n/);
  assert.match(t, /\nOther version: Death's Harp, Runeforged Dualstring Bow · Bow · https:\/\/wraeclastindex\.fyi\/item\/deaths-harp-runeforged-dualstring-bow\n/);
  assert.match(t, /\n\nPrice: 5 ex, up 54% in 7 days\.\nChecked: 2026-09-29 01:37 UTC, 6 h ago\.\nPrice source: Forbidden Rites league, live trade site listings, 29 listed\.\n/);
  assert.match(t, /\nSource: Wraeclast Index, https:\/\/wraeclastindex\.fyi\/item\/deaths-harp-dualstring-bow\n/);
  // the bare name of a unique with versions is its plain version; the market's own currency has a page of its own
  assert.match(await a.card({name: 'Death\'s Harp Runeforged Dualstring Bow'}), /Price: 5 div/);
  assert.match(await a.card({name: 'divine orb'}), /Source: Wraeclast Index, https:\/\/wraeclastindex\.fyi\/item\/divine-orb/);
  // two kinds, one name: the kind decides, and the gem holds the bare slug
  assert.match(await a.card({name: 'Freeze'}), /^Freeze\nSupport gem/);
  assert.match(await a.card({name: 'Freeze', kind: 'keyword'}), /^Freeze\nKeyword · Path of Exile 2\nUsed by/);
  await assert.rejects(a.card({name: 'Mirror of Nothing'}), NotFound);
});

test('card: a passive\'s anoint, its cost with its age', async () => {
  const t = await fixtureAnswers().card({name: 'Abasement'});
  assert.match(t, /\nAnoint: Liquid Paranoia \+ Liquid Despair \+ Concentrated Liquid Fear\nAnoint cost: 36 ex\.\nChecked: 2026-09-29 07:00 UTC, 38 min ago\.\nPrice source: Forbidden Rites league, oils on the in-game Currency Exchange\.\n/);
});

test('price: divine from 1 divine up, exalted below, or as asked', async () => {
  const a = fixtureAnswers();
  assert.match(await a.price({name: 'Headhunter'}), /^Headhunter · Unique · Heavy Belt · Belt\nPrice: 250 div, up 14% in 7 days\.\nChecked: 2026-09-28 16:52 UTC, 15 h ago\.\nPrice source: Forbidden Rites league, live trade site listings, 4 listed\.\n/);
  assert.match(await a.price({name: 'Headhunter', unit: 'exalted'}), /Price: 130,400 ex/);
  assert.match(await a.price({name: 'Chaos Orb'}), /Price: 65 ex, flat over 7 days\.\nChecked: 2026-09-29 07:00 UTC, 38 min ago\.\nPrice source: Forbidden Rites league, the in-game Currency Exchange\./);
  assert.match(await a.price({name: 'Chaos Orb', unit: 'divine'}), /Price: 0\.124 div/);
  assert.match(await a.price({name: "Ahn's Citadel"}), /Price: 105 ex/);   // a lineage gem, priced as currency
  assert.match(await a.price({name: 'Adherent Cuffs'}), /24 white listed/);
  assert.match(await a.price({name: 'Fireball'}), /\nWraeclast Index has no price for it\.\n/);
});

test('history: a currency by league day, a traded item over its last days', async () => {
  const a = fixtureAnswers();
  const div = await a.history({name: 'Divine Orb'});
  assert.match(div, /Price by league day, Forbidden Rites \(day 1: 2026-09-05\)\. Prices in exalted orbs\.\n/);
  assert.match(div, /\nDay 25: 512 ex\n/);
  assert.equal((div.match(/^Day \d+:/gm) || []).length, 14);
  assert.match(div, /\nLine updated: 2026-09-29 04:00 UTC, 4 h ago\.\n/);
  const chaos = await a.history({name: 'Chaos Orb'});
  assert.match(chaos, /Prices in divine orbs\.\n/);
  assert.match(chaos, /\nDay \d+: 0\.1\d+ div\n/);
  const hh = await a.history({name: 'Headhunter'});
  assert.match(hh, /Last 7 days, one price a day, oldest first\. Prices in divine orbs\.\n220 div · 200 div · 40 div · 2,279 div · 101 div · 53\.9 div · 250 div\nLast point checked: 2026-09-28 16:52 UTC, 15 h ago\./);
  // no market file for it: the last 7 days of the price file
  assert.match(await a.history({name: 'Exalted Orb'}), /Last 7 days/);
  assert.match(await a.history({name: 'Fireball'}), /no price line/);
});

test('changes: a card\'s patch lines, a patch\'s cards, the site\'s own notes', async () => {
  const a = fixtureAnswers();
  const fb = await a.changes({card: 'Fireball'});
  assert.match(fb, /^Fireball · Skill gem · Intelligence\nNamed in 3 patches, newest first\.\n\n0\.5\.2, 2026-06-11 22:28 UTC: https:\/\/www\.pathofexile\.com\/forum\/view-thread\/3960375\n- Reduced the damage of the Fireball skill/);
  assert.match(fb, /\nSource: Wraeclast Index, https:\/\/wraeclastindex\.fyi\/item\/fireball\n/);
  // a keyword counts only where GGG's line uses it as the word
  const fr = await a.changes({card: 'Freeze', kind: 'keyword'});
  assert.match(fr, /^Freeze · Keyword\nNamed in \d+ patches/);
  const p = await a.changes({patch: '0.5.2'});
  assert.match(p, /^0\.5\.2 Patch Notes\nPosted: 2026-06-11 22:28 UTC\. League: Runes of Aldur\.\nNotes: https:\/\/www\.pathofexile\.com\/forum\/view-thread\/3960375\nCards its notes name: \d+\./);
  assert.match(p, /\n- Fireball · Gem · https:\/\/wraeclastindex\.fyi\/item\/fireball\n/);
  assert.match(await a.changes({patch: '0.5.2 patch notes'}), /^0\.5\.2 Patch Notes/);
  assert.match(await a.changes({}), /^Latest game patches:\n- 0\.5\.5c, 2026-09-17 22:30 UTC, Forbidden Rites: https:/);
  assert.match(await a.changes({patch: '0.45'}), /^Wraeclast Index 0\.45, 29 Sep 2026: /);
  assert.match(await a.changes({patch: '9.9.9'}), /^No patch "9\.9\.9"\. Latest: 0\.5\.5c,/);
});

test('compare: side by side, each price with its age', async () => {
  const a = fixtureAnswers();
  const t = await a.compare({names: ['Headhunter', "Death's Harp"]});
  assert.match(t, /^Compare: Headhunter \| Death's Harp\nKind: Unique · Heavy Belt · Belt \| Unique · Dualstring Bow · Bow\nRequires: level 50 \| level 28, 52 Dex\nPrice: 250 div \| 5 ex\nChecked: 2026-09-28 16:52 UTC, 15 h ago \| 2026-09-29 01:37 UTC, 6 h ago\n/);
  assert.match(t, /\nSource: Wraeclast Index, https:\/\/wraeclastindex\.fyi\/item\/headhunter, https:\/\/wraeclastindex\.fyi\/item\/deaths-harp-dualstring-bow\n/);
  await assert.rejects(a.compare({names: ['Headhunter']}), NotFound);
});

test('every answer names Wraeclast Index and a page', async () => {
  for(const {tool, args, text} of await all()){
    assert.match(text, /Source: Wraeclast Index, https:\/\/wraeclastindex\.fyi/, tool + ' ' + JSON.stringify(args));
    if(['card', 'price', 'history', 'compare'].includes(tool) || (tool === 'changes' && args.card))
      assert.match(text, PAGE, tool + ' ' + JSON.stringify(args));
  }
});

test('every answer is small plain text', async () => {
  for(const {tool, args, text} of await all()){
    assert.ok(text.length < 4000, tool + ' ' + JSON.stringify(args) + ': ' + text.length + ' chars');
    assert.doesNotMatch(text, /<[a-z][^>]*>|\*\*|^#/m, tool);
  }
});

test('no game ids and no stat ids in any answer', async () => {
  // the fixture's own ids, and the guard's shapes of raw game code (tools/dev/guard.mjs MARKS)
  const IDS = ['SkillGemFireball', 'SupportGemGlaciation', 'SupportGemAhnsCitadel', 'stun_threshold_from_energy_shield19_', 'G1_town', 'r:G1'];
  const MARKS = [/(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])/, /\[[^\]|]{1,60}\|[^\]]{1,60}\](?!\()/,
    /\{\d*(?::[^}]{0,12})?\}/, /%\d+\$[sd]/, /\bDNT[-\w]*/, /[^\s@"]@[+-]?\d+(?:\.\d+)?%/];
  for(const {tool, args, text} of await all()){
    const words = text.replace(/https?:\/\/\S+/g, '');
    for(const id of IDS) assert.ok(!words.includes(id), tool + ' ' + JSON.stringify(args) + ' shows ' + id);
    for(const re of MARKS) assert.doesNotMatch(words, re, tool + ' ' + JSON.stringify(args));
  }
});

test('a price and a fact never share a sentence, and every price carries its age', async () => {
  const PRICE = /\b\d[\d,.]* (?:div|ex)\b/;
  const LEAD = /^(?:Price: |Anoint cost: |Day \d+: |League (?:low|high): |Compare: |Checked: )/;
  const LINE = /^(?:(?:[\d,.]+ (?:div|ex)|no price)(?: · |$))+$/;
  for(const {tool, args, text} of await all()){
    const lines = text.split('\n');
    lines.forEach((l, i) => {
      if(!PRICE.test(l) || /^- /.test(l)) return;   // "- ..." is the game's own line or GGG's
      assert.ok(LEAD.test(l) || LINE.test(l), tool + ' ' + JSON.stringify(args) + ': "' + l + '"');
      if(/^(?:Price|Anoint cost): /.test(l)) assert.match(lines[i + 1] || '', /^Checked: .+ UTC, .+ ago|^Checked: /, tool + ': a price with no age');
      if(tool === 'compare' && /^Price: /.test(l)) assert.match(lines[i + 1], /^Checked: /);
    });
    // a day-by-day line says when it was last read
    if(/^Day \d+: /m.test(text)) assert.match(text, /\nLine updated: .+ UTC, .+ ago\./);
  }
});

test('the voice: no assistant shapes in any answer', {skip: !existsSync(VOICE) && 'tools/dev/voice.mjs is not here'}, async () => {
  const { SHAPES } = await import(pathToFileURL(VOICE).href);
  const plain = [/\bwe\b/i, /\bthis shows\b/i];
  for(const {tool, args, text} of await all()){
    const own = text.split('\n').filter(l => !/^- /.test(l)).join('\n');   // GGG's lines are GGG's
    for(const [re, why] of SHAPES) assert.doesNotMatch(own, re, tool + ' ' + JSON.stringify(args) + ': ' + why);
    for(const re of plain) assert.doesNotMatch(own, re, tool + ' ' + JSON.stringify(args));
  }
});

test('fewer requests the second time: the copies are kept', async () => {
  const a = fixtureAnswers();
  await a.card({name: 'Headhunter'});
  const first = a.src.requests;
  await a.card({name: 'Headhunter'});
  await a.price({name: 'Headhunter'});
  assert.equal(a.src.requests, first);
});
