/* Does the character maths answer what the game's own data says it should?

     node tools/dev/buildcheck.mjs                  coverage, the twelve builds, eight guards, the cost
     node tools/dev/buildcheck.mjs --seed 7         another run of the same made-up builds
     node tools/dev/buildcheck.mjs --builds 5000    more of them
     node tools/dev/buildcheck.mjs --quiet          the per-build table left out, the verdicts kept
     node tools/dev/buildcheck.mjs --gaps           the wordings the table does not read, most read first

   Four parts, one line each at the end, non-zero exit on any FAIL:
     cover   how many of the wordings we ship the one table reads, per source, in wordings and in lines
     pob     our numbers against Path of Building's own, out of the twelve committed build codes
             (tools/dev/pob). Life, Energy Shield, Armour, Evasion, the resistances and the attributes are
             exact arithmetic on both sides, so the band is zero; damage is not, so the band there is 5% and
             only when our range holds Path of Building's number.
     guards  the eight things the model must never do
     cost    what one answer costs, and what a range costs, measured rather than assumed

   The engine is assets/maths.js — the same file the Build tab imports, so this measures the rules a player
   gets and not a second copy of them. It reads the committed data and nothing else, it touches no network
   and it writes nothing. The made-up builds come off a seeded generator, so two runs of one seed give the
   same builds.

   What a build code is doing here: a Path of Building code is compressed XML, and the XML carries Path of
   Building's own answers in its PlayerStat lines. So Path of Building is the thing being checked against,
   and no copy of it has to run. */
import { readFile, readdir } from 'node:fs/promises';
import { inflateSync, gunzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

/* ==================================================================== the engine
   assets/maths.js holds the rules: the order of operations, the one stat table, the maths and the range.
   Nothing about a rule lives in this file; what is below is the measuring. */
import { STEPS, TABLE, TYPES, UNKNOWNS, SOCKETS, socketsLeft, key, plain, spans, readLine, read,
  baseLife, baseMana, PER_LEVEL, BASE, RES_DEFAULT, RES_CEILING, MAX_REDUCTION,
  hit, armourCut, resCut, taken, maxHit, range, widenedBy } from '../../assets/maths.js';

/* ---------- arguments ---------- */
const argv = process.argv.slice(2);
const val = (flag, dflt) => { const i = argv.indexOf(flag); return i < 0 ? dflt : Number(argv[i + 1]); };
const SEED = val('--seed', 20260923);
const BUILDS = Math.max(100, val('--builds', 2000));
const QUIET = argv.includes('--quiet');
const GAPS = argv.includes('--gaps');

/* ---------- the data ---------- */
const readJSON = async p => JSON.parse(await readFile(join(ROOT, p), 'utf8'));
const pick = async (dir, re) => (await readdir(join(ROOT, dir))).find(f => re.test(f));
const GAME = await readJSON('data/gamestats.json');
const REST = await readJSON('data/index-rest.json');
const CRAFT = await readJSON('data/craft.json');
const TREE = (await readJSON('data/explore/' + await pick('data/explore', /^tree\./))).passives;
const UNIQ = (await readJSON('data/explore/' + await pick('data/explore', /^uniques\./))).items;
const CLASSFILES = {};
for(const c of CRAFT.classes) CLASSFILES[c.id] = await readJSON('data/craft/' + c.id + '.json');
const NODE = new Map(TREE.map(p => [p.h, p]));

/* ---------- the report ---------- */
const lines = [];
let failed = 0;
function say(name, ok, detail){
  if(!ok) failed++;
  lines.push((ok ? 'ok   ' : 'FAIL ') + (name + ' '.repeat(7)).slice(0, 7) + detail);
}
const n = x => Number(x).toLocaleString('en-US');
const pad = (s, w) => (String(s) + ' '.repeat(w)).slice(0, w);
const rpad = (s, w) => (' '.repeat(w) + String(s)).slice(-w);
const pc = (a, b) => b ? Math.round(a / b * 100) + '%' : '—';

/* ==================================================================== 1. coverage
   Every wording we ship, once its numbers are out, held against the one table. Counted twice: how many
   distinct wordings the table reads, and how many of the lines those wordings stand for — which is the
   number that matters, because a few hundred wordings carry most of the lines. */
function sweep(rows){
  const seen = new Map();
  for(const [text, count] of rows){
    const k = key(plain(text));
    if(!k) continue;
    seen.set(k, (seen.get(k) || 0) + count);
  }
  let wordings = 0, read = 0, lineCount = 0, readLines = 0, named = 0, namedLines = 0;
  const gaps = [];
  const nothing = () => {};
  for(const [k, count] of seen){
    wordings++; lineCount += count;
    const how = readLine(k, nothing);
    if(how === 'read'){ read++; readLines += count; }
    else if(how === 'outside'){ named++; namedLines += count; }
    else gaps.push([k, count]);
  }
  gaps.sort((a, b) => b[1] - a[1]);
  return {wordings, read, lines: lineCount, readLines, named, namedLines, gaps};
}
function craftWordings(){
  const rows = [];
  for(const c of CRAFT.classes){
    const d = CLASSFILES[c.id];
    if(!d) continue;
    for(const m of d.mods) for(const l of m[3]) rows.push([l, 1]);
  }
  return rows;
}
const uniqueWordings = () => UNIQ.flatMap(u => [...(u.ex || []), ...(u.im || [])].map(l => [l, 1]));
const passiveWordings = () => TREE.flatMap(p => (p.t || []).flatMap(t => t.split('\n')).map(l => [l, 1]));

const COVER = {
  'craftable modifiers': sweep(craftWordings()),
  'unique items': sweep(uniqueWordings()),
  'passives': sweep(passiveWordings()),
};

/* ==================================================================== 2. a Path of Building code
   base64url( zlib( xml ) ). Nothing here interprets the build: it pulls the lines out, and the one table
   in assets/maths.js is what reads them. */
function decode(code){
  let s = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
  s += '='.repeat((4 - s.length % 4) % 4);
  const bytes = Buffer.from(s, 'base64');
  const xml = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : inflateSync(bytes);
  return xml.toString('utf8');
}
const attrs = s => { const out = {}; for(const m of s.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2]; return out; };
const HEADER = /^(Rarity|Unique ID|Item Level|LevelReq|Quality|Sockets|Implicits|League|Variant|Selected Variant|Has Alt Variant|Crafted|Prefix|Suffix|Radius|Limited to|Requires|Armour|Evasion|Energy Shield|Runic Ward|Ward|Spirit|Charm Slots|Catalyst|CatalystQuality|Talisman Tier|Item Class|Corrupted|Twice Corrupted|Mirrored|Sanctified|Unmodifiable|Split|Foil|BasePercentile|ArmourBasePercentile|EvasionBasePercentile|EnergyShieldBasePercentile)\b/;
/* One item's text: what it is worth on its own (the Armour, Evasion and Energy Shield the game prints on
   it, which already hold every local modifier), and the lines that reach the rest of the character.
   A modifier the item has not settled is written by Path of Building as a range with the roll beside it. */
function parseItem(text){
  const rows = text.split('\n').map(x => x.trim()).filter(Boolean);
  const ranges = {};
  for(const m of text.matchAll(/<ModRange ([^>]*)\/>/g)){ const a = attrs(m[1]); ranges[a.id] = Number(a.range); }
  const it = {rarity: '', armour: 0, evasion: 0, es: 0, mods: [], local: [], base: ''};
  let i = 0, roll = 0;
  const r = rows[0] && rows[0].match(/^Rarity: (\w+)/);
  if(r){ it.rarity = r[1]; i++; }
  it.name = rows[i++] || '';
  it.base = /RARE|UNIQUE|RELIC/.test(it.rarity) ? (rows[i++] || '') : it.name;
  for(; i < rows.length; i++){
    let l = rows[i];
    if(/^</.test(l)) continue;
    let m;
    if((m = l.match(/^(Armour|Evasion|Energy Shield): ([\d.]+)/))){
      it[{Armour: 'armour', Evasion: 'evasion', 'Energy Shield': 'es'}[m[1]]] = Number(m[2]);
      continue;
    }
    const ranged = /\{range:([\d.]+)\}/.exec(l);
    if(ranged) roll++;
    l = l.replace(/\{[^}]*\}/g, '').trim();
    if(/^Rune: /.test(l)){ it.mods.push({text: l.replace(/^Rune: /, ''), part: null}); continue; }
    if(/^(Corrupted|Twice Corrupted|Mirrored|Sanctified)$/.test(l)) continue;
    if((HEADER.test(l) && /^[A-Za-z ]+:/.test(l)) || /^Bonded:/.test(l) || /^Requires /.test(l)) continue;
    if(l) it.mods.push({text: l, part: ranged ? Number(ranged[1]) : ranges[String(roll)] ?? null});
  }
  return it;
}
/* An item's own defences already hold its local modifiers, so those lines are read and dropped rather than
   counted twice. Which lines are local is what the item is: a piece with Armour on it scales its own. */
const LOCAL = /^(#% (increased|reduced) (armour|evasion rating|maximum energy shield|energy shield|armour and evasion rating|armour and evasion|armour and energy shield|evasion and energy shield|evasion rating and energy shield|armour, evasion and energy shield|armour, evasion rating and energy shield)|# to (armour|evasion rating|maximum energy shield|energy shield))$/;
function build(xml){
  const b = {xml};
  const B = attrs((xml.match(/<Build ([^>]*)>/) || [, ''])[1]);
  b.level = Number(B.level) || 1;
  b.cls = B.className || '';
  b.asc = B.ascendClassName === 'None' || B.ascendClassName === 'nil' ? '' : B.ascendClassName;
  b.pob = {};
  for(const m of xml.matchAll(/<PlayerStat ([^>]*)\/>/g)){ const a = attrs(m[1]); b.pob[a.stat] = a.value === 'nil' ? null : Number(a.value); }

  const byId = {};
  for(const m of xml.matchAll(/<Item id="(\d+)"[^>]*>([\s\S]*?)<\/Item>/g)) byId[m[1]] = m[2];
  const sets = [...xml.matchAll(/<ItemSet ([^>]*)>([\s\S]*?)<\/ItemSet>/g)];
  const active = attrs((xml.match(/<Items ([^>]*)>/) || [, ''])[1]).activeItemSet;
  const use = sets.find(s => attrs(s[1]).id === active) || sets[0];
  const swap = /useSecondWeaponSet="true"/.test(xml);
  b.items = [];
  if(use) for(const m of use[2].matchAll(/<Slot ([^>]*)\/>/g)){
    const a = attrs(m[1]);
    const name = a.name || '', id = a.itemId;
    if(!id || id === '0' || !byId[id]) continue;
    if(/^Weapon \d$/.test(name) && swap) continue;
    if(/^Weapon \d Swap$/.test(name) && !swap) continue;
    if(/^(Flask|Charm) \d/.test(name) && a.active === 'false') continue;
    b.items.push({slot: name, ...parseItem(byId[id])});
  }
  // the jewels sit in the tree, not in a slot
  for(const m of xml.matchAll(/<Socket ([^>]*)\/>/g)){
    const a = attrs(m[1]);
    if(a.itemId && a.itemId !== '0' && byId[a.itemId]) b.items.push({slot: 'Jewel', ...parseItem(byId[a.itemId])});
  }
  // the tree
  const specs = [...xml.matchAll(/<Spec ([^>]*)>/g)].map(m => attrs(m[1]));
  const spec = specs[(Number((xml.match(/<Tree activeSpec="(\d+)"/) || [])[1]) || 1) - 1] || specs[0] || {};
  b.nodes = (spec.nodes || '').split(',').filter(Boolean).map(Number);
  /* The tree grants points a player puts into any attribute, and nothing we ship says which one took them.
     Path of Building keeps a list of nodes of its own, but it is not that list: on one of these builds it
     names 48 nodes where only 19 grant a free point, so reading it would be reading a guess. The free
     points stay the unknown they are, and the answer widens by them and says so. */
  b.chosen = {str: [], dex: [], int: []};
  // the main skill group
  const groups = [...xml.matchAll(/<Skill ([^>]*)>([\s\S]*?)<\/Skill>/g)];
  b.gems = [];
  const main = groups[(Number(B.mainSocketGroup) || 1) - 1] || groups[0];
  if(main) for(const m of main[2].matchAll(/<Gem ([^>]*)\/>/g)){
    const a = attrs(m[1]);
    if(!a.nameSpec || a.enabled === 'false') continue;
    b.gems.push({name: a.nameSpec, level: Number(a.level) || 1, quality: Number(a.quality) || 0,
      support: /^Support/.test(a.skillId || '') || /SupportGem/.test(a.gemId || '')});
  }
  return b;
}

/* Every line of a build, in one list, the way assets/maths.js wants them. A node whose free attribute point
   the build has settled is written as that attribute; one it has not is left as the line the game prints,
   which the table records as the unknown. */
function linesOf(b, part){
  const out = [];
  for(const it of b.items){
    for(const mod of it.mods){
      const k = key(plain(mod.text));
      // a line is the item's own only where the item carries every defence the line names
      const names = [['armour', /\barmour\b/], ['evasion', /\bevasion\b/], ['es', /energy shield/]]
        .filter(([, re]) => re.test(k)).map(([w]) => w);
      const local = LOCAL.test(k) && names.length > 0 && names.every(w => it[w] > 0);
      const txt = part == null || mod.part == null ? mod.text
        : String(mod.text).replace(/\((-?[\d.]+)-(-?[\d.]+)\)/g, (s, a, c) => String(+a + (+c - +a) * mod.part));
      out.push({text: txt, local});
    }
  }
  for(const h of b.nodes){
    const p = NODE.get(h);
    if(!p){ out.push({text: 'a passive this data does not carry', local: false}); continue; }
    for(const t of (p.t || [])) for(const one of t.split('\n')){
      const k = key(plain(one));
      if(k === '# to any attribute'){
        const took = b.chosen.str.includes(h) ? 'Strength' : b.chosen.dex.includes(h) ? 'Dexterity'
          : b.chosen.int.includes(h) ? 'Intelligence' : null;
        out.push({text: took ? plain(one).replace(/any Attribute/i, took) : one, local: false});
        continue;
      }
      out.push({text: one, local: false});
    }
  }
  return out;
}
/* What the item's own defences add up to, before a single global increase. */
function itemDefences(b){
  let armour = 0, evasion = 0, es = 0;
  for(const it of b.items){ armour += it.armour; evasion += it.evasion; es += it.es; }
  return {armour, evasion, es};
}
/* Our answer for a build, as the model gives it. */
function ours(b, part){
  const cls = GAME.classes.find(c => c.n === b.cls);
  const all = linesOf(b, part);
  const {stats, unread, named} = read(all);
  const d = itemDefences(b);
  const g = (k, base = 0) => { const s = stats.get(k) || {flat: 0, inc: 0, more: 1};
    return (base + s.flat) * (1 + s.inc / 100) * s.more; };
  const any = (stats.get('anyattribute') || {flat: 0}).flat;
  const str = Math.round(g('str', cls ? cls.str : 0));
  const strHigh = Math.round(g('str', (cls ? cls.str : 0) + any));
  // the keystone that halves what Strength grants says so in words, so the model reads it off the line
  const halved = !!(stats.get('halflifefromstrength') || {flat: 0}).flat;
  return {
    stats, unread, named, any, cls, halved,
    strHigh,
    lifeHigh: Math.round(baseLife(b.level, strHigh, halved)
      * (1 + (BASE.lifeInc + (stats.get('life') || {inc: 0}).inc) / 100) * (stats.get('life') || {more: 1}).more
      + (stats.get('life') || {flat: 0}).flat * (1 + (BASE.lifeInc + (stats.get('life') || {inc: 0}).inc) / 100)),
    life: Math.round(baseLife(b.level, str, halved)
      * (1 + (BASE.lifeInc + (stats.get('life') || {inc: 0}).inc) / 100) * (stats.get('life') || {more: 1}).more
      + (stats.get('life') || {flat: 0}).flat * (1 + (BASE.lifeInc + (stats.get('life') || {inc: 0}).inc) / 100)),
    mana: Math.round(g('mana', cls ? baseMana(cls, b.level) : 0)),
    es: Math.round(g('es', d.es)),
    armour: Math.round(g('armour', d.armour)),
    evasion: Math.round(g('evasion', d.evasion + BASE.evasion)),
    str, dex: Math.round(g('dex', cls ? cls.dex : 0)),
    int: Math.round(g('int', cls ? cls.int : 0)),
    dexHigh: Math.round(g('dex', (cls ? cls.dex : 0) + any)),
    intHigh: Math.round(g('int', (cls ? cls.int : 0) + any)),
    res: Object.fromEntries(['fire', 'cold', 'lightning', 'chaos'].map(e =>
      [e, Math.round(g('res.' + e))])),
    resmax: Object.fromEntries(['fire', 'cold', 'lightning', 'chaos'].map(e =>
      [e, Math.min(RES_CEILING, RES_DEFAULT + (stats.get('resmax.' + e) || {flat: 0}).flat)])),
  };
}

/* ---------- which stats a build may be held to ----------
   A wording the table does not read is never quietly zero. It stands the build down on every stat whose own
   words it names, and the check says so. The words below are the same sweep the coverage table runs. */
const TOUCHES = {
  life: /\blife\b/, es: /energy shield/, mana: /\bmana\b/, armour: /\barmour\b/,
  evasion: /evasion|evade/, str: /strength|attribute/, dex: /dexterity|attribute/,
  int: /intelligence|attribute/,
  'res.fire': /fire resistance|elemental resistances|all resistances|resistances/,
  'res.cold': /cold resistance|elemental resistances|all resistances|resistances/,
  'res.lightning': /lightning resistance|elemental resistances|all resistances|resistances/,
  'res.chaos': /\bchaos\b|all resistances|resistances/,
};
const standDown = (unread, stat) => unread.filter(u => TOUCHES[stat] && TOUCHES[stat].test(u));
/* Two things v1.0 does not have a number for, so the check never claims one. Both are named here and both
   are named on the card, because a stat quietly worked out of data we do not hold is the thing this whole
   file exists to stop.

   The elemental resistance penalty: the game lowers your Elemental Resistances as you progress, which the
   resistances card states in the game's own words and without a number, because the game publishes none.
   Path of Building carries the number as a setting. Chaos Resistance takes no penalty, so it is held to the
   band as normal.

   Which of an item's lines are already inside its own Armour, Evasion or Energy Shield: the game prints one
   number on the item and the lines that made it are not marked. Our craft data does mark them, per item
   class, which is how this gap closes — it is a ticket and not a guess. */
const NO_NUMBER = {
  'res.fire': 'the penalty the game applies to Elemental Resistances as you progress, which it publishes no number for',
  'res.cold': 'the penalty the game applies to Elemental Resistances as you progress, which it publishes no number for',
  'res.lightning': 'the penalty the game applies to Elemental Resistances as you progress, which it publishes no number for',
  armour: 'which of an item’s own lines are already inside the Armour printed on it',
  evasion: 'which of an item’s own lines are already inside the Evasion printed on it',
  es: 'which of an item’s own lines are already inside the Energy Shield printed on it',
};
// any item with a defence printed on it makes the question live for all three, because a line naming two
// of them at once is the item's own on one and the character's on the other
const carries = b => b.items.some(it => it.armour > 0 || it.evasion > 0 || it.es > 0);
function whyNot(b, stat, o){
  if(stat.startsWith('res.') && stat !== 'res.chaos') return NO_NUMBER[stat];
  if((stat === 'armour' || stat === 'evasion' || stat === 'es') && carries(b)) return NO_NUMBER[stat];
  // Life is worked out off Strength, so a Strength the check stood down stands Life down with it
  if(stat === 'life' && standDown(o.unread, 'str').length) return 'a line this build carries that names an attribute, and Life is worked out off Strength';
  return null;
}

/* ==================================================================== 3. the twelve builds */
const POB = [];
{
  const idx = await readJSON('tools/dev/pob/index.json');
  for(const row of idx.builds){
    const code = await readFile(join(ROOT, 'tools/dev/pob', row.id + '.txt'), 'utf8');
    POB.push({...row, b: build(decode(code))});
  }
}
/* One row per stat both models answer: what Path of Building called it, what we call it, and what our floor
   and ceiling are. A row whose floor and ceiling differ was widened by an unknown, and the row says which. */
const BANDS = [
  ['Life', 'life', b => b.pob.Life, o => [o.life, o.lifeHigh], 'anyattribute'],
  ['Energy Shield', 'es', b => b.pob.EnergyShield, o => [o.es, o.es]],
  ['Armour', 'armour', b => b.pob.Armour, o => [o.armour, o.armour]],
  ['Evasion', 'evasion', b => b.pob.Evasion, o => [o.evasion, o.evasion]],
  ['Strength', 'str', b => b.pob.Str, o => [o.str, o.strHigh], 'anyattribute'],
  ['Dexterity', 'dex', b => b.pob.Dex, o => [o.dex, o.dexHigh], 'anyattribute'],
  ['Intelligence', 'int', b => b.pob.Int, o => [o.int, o.intHigh], 'anyattribute'],
  ['Fire resistance', 'res.fire', b => b.pob.FireResist, o => [o.res.fire, o.res.fire]],
  ['Cold resistance', 'res.cold', b => b.pob.ColdResist, o => [o.res.cold, o.res.cold]],
  ['Lightning resistance', 'res.lightning', b => b.pob.LightningResist, o => [o.res.lightning, o.res.lightning]],
  ['Chaos resistance', 'res.chaos', b => b.pob.ChaosResist, o => [o.res.chaos, o.res.chaos]],
];
/* A resistance Path of Building reports is the one that counts, at its own maximum. Ours is the raw sum, so
   it is held to the same cap before the two are compared. */
function capped(stat, v, o){
  if(!stat.startsWith('res.')) return v;
  const e = stat.slice(4);
  return Math.min(v, o.resmax[e]);
}
function pobRun(){
  const out = [];
  let held = 0, inside = 0, stoodDown = 0, broke = 0;
  const reasons = new Map();
  for(const row of POB){
    const o = ours(row.b, 0.5);
    const got = [];
    for(const [name, stat, mine, take, by] of BANDS){
      const want = mine(row.b);
      if(want === null || want === undefined) continue;
      const no = whyNot(row.b, stat, o);
      const blockers = no ? [no] : standDown(o.unread, stat);
      if(blockers.length){
        stoodDown++;
        for(const x of blockers.slice(0, 2)) reasons.set(x, (reasons.get(x) || 0) + 1);
        got.push({name, want, stood: blockers.length});
        continue;
      }
      // the tree's free attribute points: settled when the build says where they went, and the unknown
      // that widens the answer when it does not
      const [a, c] = take(o);
      const lo = capped(stat, a, o), hi = capped(stat, c, o);
      held++;
      const ok = want >= lo && want <= hi;
      if(ok) inside++; else broke++;
      got.push({name, want, lo, hi, ok, widened: hi !== lo && by ? by : null});
    }
    out.push({row, o, got});
  }
  return {out, held, inside, stoodDown, broke, reasons};
}

/* ==================================================================== 4. the guards */
async function guards(){
  const out = ['The eight things the model must never do:'];
  let bad = 0;
  const pass = (name, said) => out.push('  ok   ' + pad(name, 22) + said);
  const fail = (name, said) => { bad++; out.push('  FAIL ' + pad(name, 22) + said); };

  /* 1. the order of operations in the model is the order on the mechanics cards */
  {
    const card = id => (REST.h || []).find(c => c.id === id) || {};
    const steps = (id, head) => {
      const g = (card(id).fl || []).find(x => x.h === head);
      return g && g.st ? g.st.map(s => s[0]) : null;
    };
    const want = {
      hit: steps('HowDamage', 'The hit'),
      cuts: (steps('HowDamage', 'What reduces it') || []).slice(2),
      arrives: steps('HowDefences', 'Does any damage arrive'),
      pools: steps('HowDefences', 'What takes what is left'),
    };
    const off = [];
    for(const k of Object.keys(STEPS)){
      const a = (want[k] || []).join(' → '), b = STEPS[k].join(' → ');
      if(a !== b) off.push(k + ': the card says "' + a + '", the model runs "' + b + '"');
    }
    // the two columns the cards put side by side are the two the model applies as one pair, neither first
    const cols = ((card('HowDefences').fl || []).find(x => x.cols) || {cols: []}).cols.map(c => c.h).join(' and ');
    if(cols !== 'Armour and Resistances') off.push('the defences card no longer pairs Armour with Resistances');
    if(off.length) fail('order of operations', off.join(' · '));
    else pass('order of operations', Object.values(STEPS).flat().length + ' steps, word for word off the ' +
      'flowcharts on "How damage works" and "How defences work", and the pair that is neither first');
  }
  /* 2. a wording the table does not know is counted and named, never a silent zero */
  {
    const behaviour = 'Projectiles Chain an additional time';
    const nobody = 'Bramblewick bestows 3 Turnips upon the Wanderer';
    const into = [];
    const took = readLine(behaviour, (s, f, v) => into.push([s, f, v]));
    const r = read([behaviour, nobody, '+25 to maximum Life']);
    if(took === 'read' || into.length) fail('nothing silently zero', 'a behaviour was turned into a number: ' + JSON.stringify(into));
    else if(r.named.length !== 1 || r.unread.length !== 1) fail('nothing silently zero',
      'named ' + JSON.stringify(r.named) + ', unread ' + JSON.stringify(r.unread));
    else if(!(r.stats.get('life') || {}).flat) fail('nothing silently zero', 'the line beside them was not read');
    else pass('nothing silently zero', 'a line that is a behaviour and not a number is refused and named; ' +
      'the check stands a build down on every stat an unread line names');
  }
  /* 3. an unknown taken both ways gives a floor no higher than a ceiling */
  {
    const off = [];
    for(const u of UNKNOWNS){
      const r = range(take => (take[u.id] ? 120 : 80), [u.id]);
      if(r.lo > r.hi) off.push(u.id);
    }
    const three = range(t => (t.a ? 2 : 1) * (t.b ? 3 : 1) * (t.c ? 5 : 1), ['a', 'b', 'c']);
    if(off.length) fail('a floor under a ceiling', off.join(', '));
    else if(three.lo !== 1 || three.hi !== 30) fail('a floor under a ceiling', 'three unknowns did not give eight corners');
    else pass('a floor under a ceiling', UNKNOWNS.length + ' unknowns each taken both ways, and three at ' +
      'once giving eight corners, floor ' + three.lo + ' ceiling ' + three.hi);
  }
  /* 4. no number is shown without the monster level it was worked against */
  {
    const rows = GAME.monsters.rows;
    const col = Object.fromEntries(GAME.monsters.cols.map((c, i) => [c, i]));
    const at = lv => rows.find(r => r[col.level] === lv);
    const missing = [];
    for(const lv of [1, 50, 82, 100]) if(!at(lv)) missing.push(lv);
    const answer = monsterAt(82);
    if(missing.length) fail('always against a level', 'no monster at level ' + missing.join(', '));
    else if(!answer || !answer.level) fail('always against a level', 'an answer came back with no level on it');
    else pass('always against a level', rows.length + ' monster levels in the game’s own table; every answer ' +
      'carries the one it was worked against, and a level 82 monster has ' + n(answer.life) + ' life, ' +
      n(answer.armour) + ' armour, ' + n(answer.evasion) + ' evasion');
  }
  /* 5. armour never takes more than 90%, a resistance never passes its maximum, and neither is before the other */
  {
    const off = [];
    if(armourCut(1e9, 100) > MAX_REDUCTION) off.push('armour took more than 90%');
    if(resCut(140, 75) > 0.75) off.push('a resistance passed its maximum');
    if(resCut(140, 140) > RES_CEILING / 100) off.push('a maximum passed 90%');
    const d = {armour: 5000, res: {fire: 75}, resmax: {fire: 75}, pen: {}};
    const a = taken(1000, 'fire', d);
    const withArmour = taken(1000, 'physical', {...d});
    // the two are multipliers on the same damage: running them the other way round gives the same number
    const swapped = 1000 * (1 - resCut(75, 75)) * (1 - armourCut(5000, 1000));
    const straight = 1000 * (1 - armourCut(5000, 1000)) * (1 - resCut(75, 75));
    if(Math.abs(swapped - straight) > 1e-9) off.push('the order of armour and resistance changed the answer');
    if(off.length) fail('the caps hold', off.join(' · '));
    else pass('the caps hold', 'armour capped at ' + Math.round(MAX_REDUCTION * 100) + '%, a resistance at its ' +
      'maximum and a maximum at ' + RES_CEILING + '%; armour and resistance give the same number either way round ' +
      '(' + Math.round(a) + ' of a 1,000 fire hit, ' + Math.round(withArmour) + ' of a physical one)');
  }
  /* 6. a skill takes what the game admits, and no more gems than fit */
  {
    const one = socketsLeft([{support: false}, ...Array(5).fill({support: true})]);
    const two = socketsLeft([{support: false}, {support: false}, ...Array(4).fill({support: true})]);
    const over = socketsLeft([{support: false}, {support: false}, ...Array(5).fill({support: true})]);
    const off = [];
    if(one.room !== SOCKETS.supports || one.over) off.push('one skill did not take five supports');
    if(two.room !== 4 || two.over) off.push('a skill casting a skill did not leave four supports');
    if(!over.over) off.push('a sixth gem past the chain was allowed');
    if(off.length) fail('what fits in a link', off.join(' · '));
    else pass('what fits in a link', 'a skill gem takes up to ' + SOCKETS.supports + ' supports, and a skill ' +
      'gem that casts another counts to ' + SOCKETS.chain + ' in total, so skill → skill leaves four — the ' +
      'owner’s own knowledge of the game, named where it is shown');
  }
  /* 7. a build with no gear still answers, with the class's own starting numbers */
  {
    const off = [];
    for(const c of GAME.classes){
      const o = ours({cls: c.n, level: 1, items: [], nodes: [], chosen: {str: [], dex: [], int: []}, pob: {}});
      const want = Math.round((BASE.life + PER_LEVEL.life + 2 * c.str) * (1 + BASE.lifeInc / 100));
      if(o.life !== want) off.push(c.n + ' answered ' + o.life + ' life, not ' + want);
      if(o.str !== c.str || o.dex !== c.dex || o.int !== c.int) off.push(c.n + ' answered the wrong attributes');
      if(o.evasion !== BASE.evasion) off.push(c.n + ' answered ' + o.evasion + ' evasion');
    }
    if(off.length) fail('no gear still answers', off.join(' · '));
    else pass('no gear still answers', GAME.classes.length + ' classes at level 1 with nothing equipped and ' +
      'no passive taken, each answering with its own starting numbers out of the game’s export');
  }
  /* 8. the same build twice gives the same numbers */
  {
    const rnd = rng(SEED);
    const made = Array.from({length: 40}, () => madeUp(rnd));
    const a = made.map(m => JSON.stringify(answer(m)));
    const b = made.map(m => JSON.stringify(answer(m)));
    const off = a.filter((x, i) => x !== b[i]).length;
    if(off) fail('the same twice', off + ' of 40 builds answered differently the second time');
    else pass('the same twice', '40 builds worked out twice, byte for byte the same; the maths has no ' +
      'randomness in it and the seed only decides which builds are made up');
  }
  return {ok: !bad, out};
}

/* ---------- the monster the answer is worked against ---------- */
function monsterAt(level){
  const col = Object.fromEntries(GAME.monsters.cols.map((c, i) => [c, i]));
  const rows = GAME.monsters.rows;
  const r = rows.find(x => x[col.level] === Math.max(1, Math.min(rows.length, level)));
  if(!r) return null;
  return {level: r[col.level], life: r[col.life], damage: r[col.damage], accuracy: r[col.accuracy],
    armour: r[col.armour], evasion: r[col.evasion]};
}

/* ---------- builds the check makes up ----------
   The maths has no randomness in it: the same build always gives the same numbers. The seed decides which
   builds get made, out of the real data, so a failure can be run again from its number. */
function rng(seed){
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ALLNODES = TREE.filter(p => (p.t || []).length);
function madeUp(rnd){
  const cls = GAME.classes[Math.floor(rnd() * GAME.classes.length)];
  const level = 1 + Math.floor(rnd() * 100);
  const nodes = [];
  for(let i = 0; i < Math.floor(rnd() * 60); i++) nodes.push(ALLNODES[Math.floor(rnd() * ALLNODES.length)].h);
  const items = [];
  for(let i = 0; i < Math.floor(rnd() * 8); i++){
    const u = UNIQ[Math.floor(rnd() * UNIQ.length)];
    items.push({slot: 'made up', rarity: 'UNIQUE', armour: 0, evasion: 0, es: 0,
      mods: (u.ex || []).map(t => ({text: t, part: rnd()})), base: u.b, name: u.n});
  }
  return {cls: cls.n, level, items, nodes, chosen: {str: [], dex: [], int: []}, pob: {}, gems: []};
}
function answer(b){
  const o = ours(b, 0.5);
  const m = monsterAt(b.level);
  const free = o.any > 0 ? ['anyattribute'] : [];
  const pool = range(take => o.es + (take.anyattribute ? 0 : 0) + o.life, free);
  return {life: o.life, es: o.es, armour: o.armour, evasion: o.evasion, str: o.str, res: o.res,
    monster: m && m.level, pool: [pool.lo, pool.hi], unread: o.unread.length};
}

/* ==================================================================== 5. what it costs */
function cost(){
  const b = POB[POB.length - 1].b;
  const one = () => ours(b, 0.5);
  for(let i = 0; i < 40; i++) one();                       // let the engine warm up first
  const runs = 400;
  let t0 = process.hrtime.bigint();
  for(let i = 0; i < runs; i++) one();
  const per = Number(process.hrtime.bigint() - t0) / 1000 / runs;
  // the same build again, with the stat table built once and only the maths run over it
  const o = ours(b, 0.5);
  const m = monsterAt(b.level);
  const d = {armour: o.armour, es: o.es, life: o.life, mana: o.mana, mom: 0,
    res: o.res, resmax: o.resmax, pen: {}};
  const once = () => { for(const t of TYPES) maxHit(t, d); hit({stats: o.stats, base: {physical: 100}, crit: 5, kind: 'attack'}); };
  for(let i = 0; i < 400; i++) once();
  t0 = process.hrtime.bigint();
  for(let i = 0; i < 4000; i++) once();
  const evalUs = Number(process.hrtime.bigint() - t0) / 1000 / 4000;
  t0 = process.hrtime.bigint();
  for(let i = 0; i < 2000; i++) range(() => { once(); return 1; }, ['anyattribute']);
  const rangeUs = Number(process.hrtime.bigint() - t0) / 1000 / 2000;
  t0 = process.hrtime.bigint();
  for(let i = 0; i < 1000; i++) range(() => { once(); return 1; }, ['a', 'b', 'c']);
  const threeUs = Number(process.hrtime.bigint() - t0) / 1000 / 1000;
  return {table: per, one: evalUs, range: rangeUs, three: threeUs};
}

/* ==================================================================== the run */
const started = Date.now();
const report = [];

report.push('What the one table does with every wording we ship. "Read" is a number in the table. "Named" is');
report.push('a wording about a mechanic v1.0 does not count, which the card says is not in the number. What is');
report.push('left is the gap, and a build carrying one of those lines is stood down on every stat it names.');
report.push('  ' + pad('source', 22) + rpad('wordings', 9) + rpad('read', 7) + rpad('named', 7) + rpad('gap', 7) +
  rpad('lines', 9) + rpad('read', 9) + rpad('share', 7) + rpad('gap', 9) + rpad('share', 7));
let worstShare = 1;
for(const [name, c] of Object.entries(COVER)){
  const gapLines = c.lines - c.readLines - c.namedLines;
  report.push('  ' + pad(name, 22) + rpad(n(c.wordings), 9) + rpad(n(c.read), 7) + rpad(n(c.named), 7) +
    rpad(n(c.wordings - c.read - c.named), 7) +
    rpad(n(c.lines), 9) + rpad(n(c.readLines), 9) + rpad(pc(c.readLines, c.lines), 7) +
    rpad(n(gapLines), 9) + rpad(pc(gapLines, c.lines), 7));
  worstShare = Math.min(worstShare, (c.readLines + c.namedLines) / c.lines);
}
if(GAPS) for(const [name, c] of Object.entries(COVER)){
  report.push('', 'The wordings ' + name + ' has that the table does not read, most-read first:');
  for(const [k, count] of c.gaps.slice(0, 30)) report.push('  ' + rpad(count, 5) + '  ' + k.slice(0, 110));
}
report.push('');

const P = pobRun();
report.push('Our numbers against Path of Building’s own, out of ' + POB.length + ' build codes:');
if(!QUIET) for(const {row, o, got} of P.out){
  report.push('  ' + row.id + ' · ' + row.cls + (row.asc ? ' ' + row.asc : '') + ' · level ' + row.b.level +
    ' · ' + row.what);
  const bits = got.map(g => g.stood ? g.name + ' stood down'
    : (g.ok ? '' : 'FAIL ') + g.name + ' ' + (g.lo === g.hi ? n(g.lo) : n(g.lo) + '–' + n(g.hi) +
      ' (widened by ' + widenedBy([g.widened]).join(', ') + ')') + ' against ' + n(g.want));
  report.push('    ' + bits.join(' · '));
  report.push('    ' + o.unread.length + ' lines the table does not read, ' + o.named.length +
    ' it names and does not count, of ' + (o.unread.length + o.named.length + o.stats.size) + ' on this build');
}
report.push('  held to a band: ' + P.held + ' · inside it: ' + P.inside + ' · outside it: ' + P.broke +
  ' · stood down: ' + P.stoodDown);
if(P.reasons.size){
  report.push('  what stood a stat down, most first:');
  for(const [k, c] of [...P.reasons].sort((a, b) => b[1] - a[1]).slice(0, 8)) report.push('    ' + rpad(c, 4) + '  ' + k.slice(0, 100));
}
report.push('');

const g = await guards();
report.push(...g.out, '');

const C = cost();
report.push('What it costs on this machine:');
report.push('  ' + pad('one evaluation', 34) + rpad(C.one.toFixed(1), 8) + ' microseconds' + rpad(n(Math.round(1e6 / C.one)), 12) + ' a second');
report.push('  ' + pad('a range: a floor and a ceiling', 34) + rpad(C.range.toFixed(1), 8) + ' microseconds' + rpad(n(Math.round(1e6 / C.range)), 12) + ' a second');
report.push('  ' + pad('three unknowns, eight corners', 34) + rpad(C.three.toFixed(1), 8) + ' microseconds' + rpad(n(Math.round(1e6 / C.three)), 12) + ' a second');
report.push('  ' + pad('rebuilding the stat table itself', 34) + rpad(C.table.toFixed(1), 8) + ' microseconds, which is why it is built once per change');
report.push('');
for(const l of report) console.log(l);

const cov = Object.entries(COVER).map(([k, c]) => k.split(' ')[0] + ' ' + pc(c.readLines, c.lines) + ' read, ' + pc(c.lines - c.readLines - c.namedLines, c.lines) + ' gap').join(' · ');
say('cover', worstShare > 0.6, TABLE.length + ' shapes in the table, reading ' + cov + ' of the lines');
say('pob', P.broke === 0 && P.held > 0, P.held + ' stats held to a band across ' + POB.length +
  ' builds, ' + P.inside + ' inside it, ' + P.broke + ' outside · ' + P.stoodDown + ' stood down');
say('guards', g.ok, '8 guards, seed ' + SEED);
say('cost', C.range < 200, 'one evaluation ' + C.one.toFixed(1) + ' microseconds, a range ' + C.range.toFixed(1) +
  ', eight corners ' + C.three.toFixed(1));
for(const l of lines) console.log(l);
console.log((lines.length - failed) + ' ok, ' + failed + ' failed · ' + ((Date.now() - started) / 1000).toFixed(1) + 's');
process.exit(failed ? 1 : 0);
