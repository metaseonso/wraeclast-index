/* The game's own tables, read straight out of the game files: the ones RePoE's export does not carry (#83).

     node tools/datpull.mjs                  find today's patch, pull, write data/game/
     node tools/datpull.mjs --patch 4.5.5.3  that CDN folder, no probing
     node tools/datpull.mjs --out <dir>      write somewhere else (tools/datpull.py writes to a scratch folder)
     node tools/datpull.mjs --only strongboxes,ritual_rites   those files only
     node tools/datpull.mjs --all            the files marked later too
     node tools/datpull.mjs --list           the declared files and the tables behind each, nothing fetched

   Run it through `python tools/datpull.py`, which is this plus the last-good rule (tools/lastgood.py): a pull
   that fails or comes back thin never overwrites the copy in data/game/. Run on its own it writes straight in.

   How, step by step (proved on all 1,023 tables of 0.5.5 in #83):
   1. The patch folder. GGG's patch server speaks raw TCP on 13060 and says nothing through a proxy, so start from
      the version RePoE's PoE2 export names (4.5.5.2) and ask GGG's CDN for patch-poe2.poecdn.com/<v>/Bundles2/
      _.index.bin with HEAD, a few hotfix numbers either side. The highest that answers is live; old ones are gone.
   2. The schema. poe-tool-dev/dat-schema's own release file, schema.min.json (version 7), the PoE2 half of it
      (validFor & 2). Which commit it was built from is asked of git, and both land in data/game/_meta.json.
   3. The bundles. The index (about 115 MB) and then only the bundles the declared tables sit in, each kept in
      tools/cache/datpull/<patch>/ so a second run downloads nothing.
   4. The tables. Decoded with pathofexile-dat 15.2.0 (package.json, optional like esbuild: the site never needs
      it). Three things that cost a morning each: paths inside the bundles are lower case
      (data/balance/<table>.datc64); dist/dat/dat-file.js and dist/dat/reader.js are imported by file, because
      the package's dat.js fetches a wasm file the moment it is imported; and Node's fetch ignores HTTPS_PROXY
      unless NODE_USE_ENV_PROXY=1, so this sets it and starts itself again when it is missing.
   5. The words. Every foreign key goes through one resolver, name(), and comes out as the name a player reads.
      A modifier or a stat is worded the way the game words it: RePoE's mod text where it has one, otherwise the
      game's own stat descriptions (RePoE's export of them). A stat the game never shows a player has no words;
      it is kept by its id under `hidden` and never in a field a page draws.

   Every file is { source, table, note, ids, rows }. `ids` names the fields that may hold an internal id (a join
   key, a hidden stat): tools/dev/ids.mjs fails a build where any other field does. Nothing else is written
   anywhere but the cache. */
import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };

// Node's fetch reads HTTPS_PROXY only when told to at start-up: start again, told
if((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY){
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)],
    {stdio: 'inherit', env: {...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1'}});
  process.exit(r.status == null ? 1 : r.status);
}

const OUT = resolve(opt('--out') || join(ROOT, 'data', 'game'));
const CACHE = resolve(opt('--cache') || join(ROOT, 'tools', 'cache', 'datpull'));
const OFFICIAL = join(ROOT, 'tools', 'cache', 'official');     // tools/gamepull.py's copies of the export, shared
const REPOE = 'https://repoe-fork.github.io/poe2/';
const CDN = 'https://patch-poe2.poecdn.com/';
const SCHEMA_URL = 'https://github.com/poe-tool-dev/dat-schema/releases/download/latest/schema.min.json';
const SCHEMA_GIT = 'https://github.com/poe-tool-dev/dat-schema';
const DAT_VERSION = '15.2.0';
const UA = 'wraeclast-index/1.0 (contact: https://wraeclastindex.fyi/)';
const say = m => process.stderr.write(m + '\n');
// a pull that stops says why in one line and exits 1; tools/datpull.py turns that into the last-good fault
const stop = e => { say('datpull stopped: ' + (e && e.message || e)); process.exit(1); };
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);

/* ---------- the network: a few tries, then a plain error ---------- */
async function get(url, how = {}){
  let last;
  for(let t = 0; t < 4; t++){
    try {
      const r = await fetch(url, {headers: {'User-Agent': UA}, ...how});
      if(r.ok || how.method === 'HEAD') return r;
      last = new Error(url + ' answered ' + r.status);
      if(r.status < 500 && r.status !== 429) break;
    } catch(e){ last = new Error(url + ': ' + (e.cause && e.cause.code || e.message)); }
    await new Promise(ok => setTimeout(ok, 2000 * (t + 1)));
  }
  throw last;
}
async function cached(file, url){
  if(existsSync(file)) return readFile(file);
  const body = Buffer.from(await (await get(url)).arrayBuffer());
  await mkdir(dirname(file), {recursive: true});
  await writeFile(file + '.tmp', body);
  await rename(file + '.tmp', file);
  return body;
}

/* ---------- 1. which patch folder is live ---------- */
async function findPatch(){
  const home = await (await get(REPOE)).text();
  const m = home.match(/version (4\.\d+\.\d+)\.(\d+)/);
  if(!m) throw new Error('RePoE’s page no longer names a game version');
  let found = null;
  for(let k = Math.max(0, +m[2] - 2); k <= +m[2] + 8; k++){
    const v = m[1] + '.' + k;
    const r = await get(CDN + v + '/Bundles2/_.index.bin', {method: 'HEAD'}).catch(() => null);
    if(r && r.ok) found = v;            // the highest that answers
  }
  if(!found) throw new Error('no patch folder answers near ' + m[1] + '.' + m[2]);
  return found;
}
// 4.5.5.3 on the CDN is patch 0.5.5 in the game's own numbering
const gamePatch = cdn => cdn.replace(/^4\.(\d+)\.(\d+).*$/, '0.$1.$2');

/* ---------- 2. the schema, and the commit it came from ---------- */
async function loadSchema(){
  const file = opt('--schema') || join(CACHE, 'schema.min.json');
  if(!opt('--schema') && existsSync(file) && Date.now() - (await stat(file)).mtimeMs > 864e5)
    await rename(file, file + '.old');   // a day old: dat-schema moves with the patches, ask again
  let schema;
  try { schema = JSON.parse(await cached(file, SCHEMA_URL)); }
  catch(e){
    if(!existsSync(file + '.old')) throw e;
    say('  dat-schema did not answer (' + e.message + '); using the copy from the last run');
    schema = JSON.parse(await readFile(file + '.old'));
  }
  let commit = null;
  try {
    const out = execFileSync('git', ['ls-remote', SCHEMA_GIT, 'refs/tags/latest^{}', 'refs/tags/latest'],
      {encoding: 'utf8', timeout: 30000});
    const peeled = out.split('\n').find(l => l.endsWith('^{}')) || out.split('\n')[0];
    commit = (peeled || '').split(/\s/)[0] || null;
  } catch(e){ say('  could not ask git which dat-schema commit this is: ' + e.message.split('\n')[0]); }
  return {schema, commit};
}

/* ---------- 3 and 4. the bundles, and a table as plain rows ---------- */
async function openGame(patch, schema){
  const nm = join(ROOT, 'node_modules', 'pathofexile-dat', 'dist');
  if(!existsSync(nm)) throw new Error('pathofexile-dat is not installed: npm install (it is an optional dependency)');
  const B = await import(pathToFileURL(join(nm, 'bundles.js')));
  const {readDatFile} = await import(pathToFileURL(join(nm, 'dat', 'dat-file.js')));
  const {getFieldReader} = await import(pathToFileURL(join(nm, 'dat', 'reader.js')));
  const dir = join(CACHE, patch);
  let fetched = 0;
  const bundle = async name => {
    const f = join(dir, name.replace(/\//g, '@'));
    if(!existsSync(f)) fetched++;
    return new Uint8Array(await cached(f, B.toCdnUrl(patch, name)));
  };
  const indexBin = await bundle('_.index.bin');
  const raw = new Uint8Array(B.decompressedBundleSize(indexBin));
  B.decompressSliceInBundle(indexBin, 0, raw);
  const idx = B.readIndexBundle(raw);
  const files = new B.FileLoader({fetchFile: bundle}, {bundlesInfo: idx.bundlesInfo, filesInfo: idx.filesInfo});
  const enums = Object.fromEntries(schema.enumerations.map(e => [e.name, e]));
  const tables = new Map();

  function columns(sch, dat){
    const S = dat.fieldSize;
    const size = c => c.array ? S.ARRAY : c.type === 'string' ? S.STRING : c.type === 'foreignrow' ? S.KEY_FOREIGN
      : c.type === 'row' ? S.KEY : ({bool: 1, u16: 2, i16: 2, u32: 4, i32: 4, enumrow: 4, f32: 4}[c.type] || 0) * (c.interval ? 2 : 1);
    const type = c => ({array: c.array, interval: c.interval,
      integer: {u16: {unsigned: true, size: 2}, u32: {unsigned: true, size: 4}, i16: {unsigned: false, size: 2},
        i32: {unsigned: false, size: 4}, enumrow: {unsigned: false, size: 4}}[c.type],
      decimal: c.type === 'f32' ? {size: 4} : undefined, string: c.type === 'string' ? {} : undefined,
      boolean: c.type === 'bool' ? {} : undefined,
      key: c.type === 'row' || c.type === 'foreignrow' ? {foreign: c.type === 'foreignrow'} : undefined});
    const out = [];
    let at = 0;
    for(const [i, c] of sch.columns.entries()){
      const n = c.type === 'array' ? S.ARRAY : size(c);
      if(!n || at + n > dat.rowLength) break;               // the schema runs past the row: read what fits
      if(c.type !== 'array'){                               // an array of unknown things: skipped, not guessed
        const en = c.type === 'enumrow' && c.references && enums[c.references.table];
        const read = getFieldReader({name: c.name, offset: at, type: type(c)}, dat);
        const one = v => en ? (en.enumerators[v - en.indexing] ?? v) : v;
        out.push([c.name || 'Unknown' + i, en ? r => { const v = read(r); return Array.isArray(v) ? v.map(one) : one(v); } : read]);
      }
      at += n;
    }
    return out;
  }
  /* one table, every row an object keyed by the schema's column names; read once a run */
  async function table(name){
    if(tables.has(name)) return tables.get(name);
    const cands = schema.tables.filter(s => s.name.toLowerCase() === name.toLowerCase());
    const sch = cands.find(s => s.validFor & 2) || cands[0];
    if(!sch) throw new Error('dat-schema has no table ' + name);
    const dat = readDatFile('.datc64', await files.getFileContents('data/balance/' + name.toLowerCase() + '.datc64'));
    const cols = columns(sch, dat), rows = [];
    for(let i = 0; i < dat.rowCount; i++){
      const o = {};
      for(const [k, read] of cols){ try { o[k] = read(i); } catch { o[k] = null; } }
      rows.push(o);
    }
    const t = {rows, sch, exact: cols.length === sch.columns.filter(c => c.type !== 'array').length};
    tables.set(name, t);
    return t;
  }
  return {table, fetched: () => fetched};
}

/* ---------- 5. the words ---------- */
async function official(name){
  const f = join(OFFICIAL, name.replace(/\//g, '__'));
  return JSON.parse(await cached(f, REPOE + name));
}
const clean = s => typeof s === 'string'
  ? s.replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1').replace(/\r/g, '').trim() : s;
// a name a player can meet: words, not a placeholder ("[DNT] ...", "ANY MONSTER", "NULL")
const real = s => typeof s === 'string' && /[A-Za-z]{2}/.test(s) && !/\[DNT|\(DNT|^\s*(?:Invisible|NULL|DNT)\b/i.test(s) && s !== s.toUpperCase();
// the order the stat description files are asked in: the map's own wording before the general one
const WORDINGS = ['endgame_map_', 'map_', 'atlas_', 'chest_', 'monster_', ''].map(n => 'stat_translations/' + n + 'stat_descriptions.min.json');
const HANDLE = {negate: v => -v, divide_by_one_hundred: v => v / 100, per_minute_to_per_second: v => v / 60,
  milliseconds_to_seconds: v => v / 1000, deciseconds_to_seconds: v => v / 10, divide_by_ten_0dp: v => v / 10,
  divide_by_two_0dp: v => v / 2, times_twenty: v => v * 20, double: v => v * 2, divide_by_five: v => v / 5,
  divide_by_three: v => v / 3, divide_by_four: v => v / 4, divide_by_fifty: v => v / 50, subtract_one: v => v - 1,
  add_one: v => v + 1, multiply_by_ten: v => v * 10, negate_and_double: v => -v * 2,
  divide_by_one_hundred_2dp: v => v / 100, divide_by_one_hundred_2dp_if_required: v => v / 100,
  milliseconds_to_seconds_2dp: v => v / 1000, milliseconds_to_seconds_2dp_if_required: v => v / 1000,
  milliseconds_to_seconds_0dp: v => v / 1000, per_minute_to_per_second_0dp: v => v / 60,
  per_minute_to_per_second_2dp: v => v / 60, per_minute_to_per_second_2dp_if_required: v => v / 60,
  divide_by_ten_1dp: v => v / 10, divide_by_ten_1dp_if_required: v => v / 10};
const num = v => Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(2).replace(/\.?0+$/, '');

async function wording(){
  const mods = await official('mods.min.json');
  const byStat = new Map();
  for(const f of WORDINGS){
    let list = [];
    try { list = await official(f); } catch(e){ say('  no ' + f + ': ' + e.message); }
    for(const e of list) for(const id of e.ids) if(!byStat.has(id)) byStat.set(id, e);
  }
  const fits = (c, v) => !(('min' in c && v < c.min) || ('max' in c && v > c.max)) !== !!c.negated;
  /* stats: [[id, min, max]] -> {text: [lines as the game prints them], hidden: {id: value} for the rest} */
  function words(stats){
    // a stat at 0 does nothing and the game prints nothing for it ("+0 to Monster Level of Area")
    stats = stats.filter(([id, a, b]) => id && (a || b));
    const vals = new Map(stats.map(([id, a, b]) => [id, [a, b ?? a]]));
    const done = new Set(), text = [], hidden = {};
    for(const [id] of stats){
      if(done.has(id)) continue;
      const e = byStat.get(id);
      if(!e || id.startsWith('dummy_stat_display_nothing')){
        const [a, b] = vals.get(id);
        if(!id.startsWith('dummy_stat')) hidden[id] = a === b ? a : [a, b];
        done.add(id);
        continue;
      }
      e.ids.forEach(x => done.add(x));
      const rng = e.ids.map(x => vals.get(x) || [0, 0]);
      const pick = e.English.find(l => l.condition.every((c, i) => fits(c, rng[i][0]) && fits(c, rng[i][1])))
        || e.English.find(l => l.condition.every((c, i) => fits(c, rng[i][1])));
      if(!pick){ e.ids.filter(x => vals.has(x)).forEach(x => { hidden[x] = vals.get(x)[0]; }); continue; }
      let s = pick.string;
      pick.format.forEach((fm, i) => {
        if(fm === 'ignore') return;
        const hs = pick.index_handlers[i] || [];
        const h = v => hs.reduce((x, k) => (HANDLE[k] || (y => y))(x), v);
        const [a, b] = [h(rng[i][0]), h(rng[i][1])].sort((x, y) => x - y);
        let t = a === b ? num(a) : a < 0 && b < 0 ? '-(' + num(-b) + '-' + num(-a) + ')' : '(' + num(a) + '-' + num(b) + ')';
        if(fm === '+#' && a >= 0) t = '+' + t;
        s = s.replace('{' + i + '}', t);
      });
      for(const line of clean(s.replace(/\{\d*\}/g, '')).split('\n').map(x => x.trim()).filter(Boolean))
        if(/^[a-z]/.test(line) && text.length) text[text.length - 1] += ' ' + line; else text.push(line);
    }
    return {text, hidden};
  }
  return {mods, words};
}

/* ---------- the one resolver ---------- */
function resolver(T, W){
  const statId = i => i == null ? null : (T.Stats.rows[i] || {}).Id || null;
  /* a modifier as the game words it: RePoE's text where it has it, else its stats through the descriptions */
  function mod(i){
    const m = i == null ? null : T.Mods.rows[i];
    if(!m) return {text: [], hidden: {}};
    const stats = [];
    for(let k = 1; k <= 8; k++) if(m['Stat' + k] != null){
      const v = m['Stat' + k + 'Value'] || [0, 0];
      stats.push([statId(m['Stat' + k]), v[0], v[1]]);
    }
    const w = W.words(stats), r = W.mods[m.Id];
    return r && real(r.text) ? {text: clean(r.text).split('\n').filter(Boolean), hidden: w.hidden} : w;
  }
  /* A row of another table, named the way a player knows it, or null when it has no such name. */
  const RULE = {
    ClientStrings: r => r.Text, Words: r => r.Text,
    SkillGems: r => name('BaseItemTypes', r.BaseItemType),
    Rarity: r => r.Id,                                      // Normal, Magic, Rare, Unique: the word is the name
    MonsterResistances: r => r.Id === 'None' ? null : r.Id.replace(/([a-z])([A-Z])/g, '$1 $2'),
    SanctumPersistentEffectCategories: r => r.Name,
  };
  function name(table, i){
    if(i == null) return null;
    if(table === 'Mods') return mod(i).text.join('\n') || null;
    const t = T[table];
    if(!t) throw new Error('name(' + table + ') asked for a table that was not read: declare it in NEEDS');
    const r = t.rows[i];
    if(!r) return null;
    const v = clean(RULE[table] ? RULE[table](r) : r.Name);
    return real(v) ? v : null;
  }
  /* stat keys and their values side by side, as the game words them */
  const statsOf = (keys, values) => W.words((keys || []).map((k, j) => [statId(k), (values || [])[j] ?? 0]));
  return {name, mod, statId, statsOf};
}

/* ---------- what is written: one declaration per file ----------
   tables: what it reads (every table named in a row function must be here, or name() says so).
   ids:    the fields that may hold an internal id. rows: the rows, every key already a name.
   later:  declared and proved, but not written until a card asks for it (--all, or --only by name): data/ carries
           only what a ticket needs now. */
const drop = o => Object.fromEntries(Object.entries(o).filter(([, v]) =>
  !(v == null || v === '' || v === false || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length))));
const joinHidden = (...hs) => Object.assign({}, ...hs);
// the game's own text with its {0}, {1} filled from the row's values in order; null when one is left unfilled
const fill = (s, values) => { const out = String(s || '').replace(/\{(\d+)\}/g, (m, i) => (values || [])[i] ?? m);
  return out && !/\{\d*\}/.test(out) ? out : null; };
const FILES = [
  {file: 'monsters', tables: ['MonsterVarieties', 'MonsterTypes', 'MonsterResistances'], ids: ['ids'],
   note: 'Every named monster, one row per set of numbers: varieties that share a name and every number are one row, ' +
     'their ids listed. life and damage are the monster\u2019s own multipliers on its level\u2019s base (100 = base); ' +
     'attackTime in ms; crit in %; armour, evasion and esFromLife in % from its type; resist names the resistance sets, which have a file of their own.',
   rows: ({T, R}) => {
     const by = new Map();
     for(const m of T.MonsterVarieties.rows.filter(m => real(m.Name))){
       const t = T.MonsterTypes.rows[m.MonsterType] || {};
       const row = drop({name: clean(m.Name), life: m.LifeMultiplier, damage: m.DamageMultiplier,
         attackTime: m.AttackSpeed, xp: m.ExperienceMultiplier, crit: m.AttackCrit ? +(m.AttackCrit * 100).toFixed(2) : null,
         armour: t.Armour, evasion: t.Evasion, esFromLife: t.EnergyShieldFromLife, spread: t.DamageSpread,
         resist: (t.MonsterResistances || []).map(i => R.name('MonsterResistances', i)).filter(Boolean),
         boss: m.BossHealthBar || false});
       const key = JSON.stringify(row);
       if(!by.has(key)) by.set(key, {...row, ids: []});
       by.get(key).ids.push(m.Id);
     }
     return [...by.values()];
   }},
  {file: 'monster_resistances', tables: ['MonsterResistances'], ids: ['id'],
   note: 'Resistance sets a monster type carries. Meaning of the columns not verified: tiers looks like the value at ' +
     'three difficulty steps (Major = 75/60/50); scale and from look like values and the area levels they start at.',
   rows: ({T, R}) => T.MonsterResistances.rows.map((r, i) => ({name: R.name('MonsterResistances', i), id: r.Id, ...Object.fromEntries(
     ['Fire', 'Cold', 'Lightning', 'Chaos'].filter(e => [1, 2, 3, 4].some(k => (r[e + k] || []).some(Boolean)))
       .map(e => [e.toLowerCase(), drop({tiers: [r[e + '1'], r[e + '2'], r[e + '3']].map(x => (x || [0])[0]),
         scale: r[e + '4'], from: (r[e + '5'] || []).some(Boolean) ? r[e + '5'] : null})]))})).filter(r => r.name)},
  {file: 'quest_rewards', tables: ['QuestRewards', 'QuestRewardOffers', 'Quest', 'BaseItemTypes', 'Rarity'], ids: ['id'],
   note: 'Campaign reward windows: per quest, the items offered (take one) with item level and rarity. Which class sees ' +
     'which choice sits in columns dat-schema does not name yet, so every choice of a window is listed.',
   rows: ({T, R}) => {
     const by = new Map();
     for(const q of T.QuestRewards.rows){
       const o = T.QuestRewardOffers.rows[q.RewardOffer] || {};
       if(!by.has(q.RewardOffer)) by.set(q.RewardOffer, {quest: R.name('Quest', o.QuestKey), act: (T.Quest.rows[o.QuestKey] || {}).Act,
         id: o.Id, choices: []});
       const item = R.name('BaseItemTypes', q.Reward);
       if(item) by.get(q.RewardOffer).choices.push(drop({item, level: q.RewardLevel, rarity: R.name('Rarity', q.RewardRarity),
         stack: q.RewardStack > 1 ? q.RewardStack : null}));
     }
     return [...by.values()].filter(x => x.quest && x.choices.length);
   }},
  {file: 'gold', tables: ['GoldRespecPrices', 'SkillGemGoldPricePerLevel', 'SkillGemGoldPricePerQuality', 'UniqueGoldPrices',
     'GoldInherentSkillPricesPerLevel', 'SkillGems', 'BaseItemTypes', 'Words'], ids: [],
   note: 'Gold: a passive refund by character level, a gem by level and by quality, a unique’s gold value, and an ' +
     'inherent skill by level. kind says which. What gold a modifier adds is declared too, and written once a card needs it.',
   rows: ({T, R}) => [
     ...T.GoldRespecPrices.rows.map(g => ({kind: 'Passive refund', level: g.Level, gold: g.Cost})),
     ...T.SkillGemGoldPricePerLevel.rows.map(g => ({kind: 'Gem level', level: g.Level, gold: g.Price})),
     ...T.SkillGemGoldPricePerQuality.rows.map(g => ({kind: 'Gem quality', quality: g.Quality, gold: g.Price})),
     ...T.UniqueGoldPrices.rows.map(g => ({kind: 'Unique', item: R.name('Words', g.Name), gold: g.Price})).filter(g => g.item),
     ...T.GoldInherentSkillPricesPerLevel.rows.map(g => ({kind: 'Inherent skill', item: R.name('SkillGems', g.Skill), level: g.Level, gold: g.Price})).filter(g => g.item),
   ]},
  {file: 'gold_mods', later: true, tables: ['GoldModPrices', 'Mods', 'Stats'], ids: ['hidden'],
   note: 'What gold each modifier adds to an item’s value. basePercent is read from its column name; not verified.',
   rows: ({T, R}) => T.GoldModPrices.rows.map(g => { const m = R.mod(g.Mod);
     return m.text.length ? drop({text: m.text, gold: g.Value, basePercent: g.BasePricePercent}) : null; }).filter(Boolean)},
  {file: 'ultimatum_modifiers', tables: ['UltimatumModifiers', 'Mods', 'Stats'], ids: ['id', 'hidden'],
   note: 'Trial of Chaos modifiers: tier, the game’s text, and the reward bonus each one adds (reward, worded by the game ' +
     'where it words it, else under hidden).',
   rows: ({T, R}) => T.UltimatumModifiers.rows.map((u, i) => { const s = R.statsOf(u.MapStats, u.MapStatValues);
     const mods = [...(u.MapMods || []), ...(u.ExtraMods || [])].map(R.mod);
     return real(u.Name) ? drop({name: clean(u.Name), id: u.Id, tier: u.Tier, text: clean(u.Description),
       reward: s.text, mods: mods.flatMap(m => m.text), next: R.name('UltimatumModifiers', u.NextTier),
       hidden: joinHidden(s.hidden, ...mods.map(m => m.hidden))}) : null; }).filter(Boolean)},
  {file: 'sanctum', tables: ['SanctumFloors', 'SanctumRooms', 'SanctumPersistentEffects', 'SanctumPersistentEffectCategories',
     'SanctumRewardObjects', 'ClientStrings', 'WorldAreas', 'BaseItemTypes', 'Stats'], ids: ['id', 'hidden'],
   note: 'Trial of the Sekhemas: floors (area, boss, the key it takes, rooms), boons and afflictions, and the fountains. ' +
     'kind says which. Each fountain also restores Honour; how much is not read yet.',
   rows: ({T, R}) => [
     ...T.SanctumFloors.rows.map((f, i) => drop({kind: 'Floor', name: R.name('ClientStrings', f.Title), id: f.Id,
       area: R.name('WorldAreas', f.Area), text: clean(f.Description), key: R.name('BaseItemTypes', f.Itemised), level: f.MinLevel,
       rooms: T.SanctumRooms.rows.filter(r => r.Floor === i).length})),
     ...T.SanctumPersistentEffects.rows.map(s => { const st = R.statsOf(s.Stats, s.StatValues);
       return real(s.Name) ? drop({kind: R.name('SanctumPersistentEffectCategories', s.EffectCategory) || 'Effect',
         name: clean(s.Name), id: s.Id, text: fill(clean(s.BoonDesc || s.CurseDesc), s.StatValues) || st.text.join('\n'),
         hidden: st.hidden}) : null; }).filter(Boolean),
     // a fountain's first line is "Restore {0} of your Honour", and which column holds that number is not known:
     // the line is left out rather than guessed
     ...T.SanctumRewardObjects.rows.map(o => drop({kind: 'Fountain', id: o.Id,
       text: (R.name('ClientStrings', o.Description) || '').split('\n').filter(l => l && !/\{\d*\}/.test(l))})).filter(o => o.text),
   ]},
  {file: 'strongboxes', tables: ['Strongboxes', 'Chests', 'Mods', 'Stats'], ids: ['id', 'hidden', 'stats'],
   note: 'Every strongbox: its spawn weight among strongboxes (weight; weightHard is the same in the hard-mode column), the ' +
     'level it starts at and the modifiers it always carries. stats names the stats that switch it on or off.',
   rows: ({T, R}) => T.Strongboxes.rows.map(s => { const c = T.Chests.rows[s.ChestsKey] || {}; const mods = (c.ModsKeys || []).map(R.mod);
     return real(c.Name) ? drop({name: clean(c.Name), id: c.Id, weight: s.SpawnWeight, weightHard: s.SpawnWeightHardmode,
       level: c.MinLevel, text: mods.flatMap(m => m.text), hidden: joinHidden(...mods.map(m => m.hidden)),
       stats: drop({weight: R.statId(s.SpawnWeightIncrease), chance: R.statId(s.BasicSpawnChanceStat),
         needs: (s.RequiredSpawnStat || []).map(R.statId), blockedBy: (s.BlockingSpawnStat || []).map(R.statId)})}) : null; }).filter(Boolean)},
  {file: 'ritual_rites', tables: ['RitualAtlasLineMods', 'Mods', 'Stats'], ids: ['hidden', 'stats'],
   note: 'Forbidden Rites: every rite the atlas can roll with its weight. text is the rite as the game words it; local is ' +
     'what it does in the map it sits on. stats.condition names the stat a rite needs before it can roll.',
   rows: ({T, R}) => T.RitualAtlasLineMods.rows.map(r => { const a = R.mod(r.Mod), b = R.mod(r.Mod2);
     return drop({text: a.text, local: b.text, weight: r.Weighting, hidden: joinHidden(a.hidden, b.hidden),
       stats: drop({condition: R.statId(r.ConditionStat)})}); }).filter(r => r.text || r.hidden)},
  {file: 'ritual_altars', tables: ['RitualRuneTypes'], ids: ['id'],
   note: 'Ritual altar types with their spawn weight and the area levels they roll in.',
   rows: ({T}) => T.RitualRuneTypes.rows.map(r => drop({name: clean(r.Type), id: r.Id, text: clean(r.Description),
     weight: r.SpawnWeight, level: [r.LevelMin, r.LevelMax]})).filter(r => real(r.name))},
  {file: 'atlas_corruption', tables: ['EndgameCorruptionMods', 'EndgameCleansedMods', 'Mods', 'Stats'], ids: ['hidden'],
   note: 'What a corrupted and a cleansed atlas node can roll, with their weights. kind says which pool. The cleansed ' +
     'weight is read from a column dat-schema does not name yet; not verified.',
   rows: ({T, R}) => [
     ...T.EndgameCorruptionMods.rows.map(c => { const m = R.mod(c.CorruptionMod);
       return drop({kind: 'Corrupted', text: m.text, weight: (c.SpawnWeight || [])[0], hidden: m.hidden}); }),
     ...T.EndgameCleansedMods.rows.map(c => { const m = R.mod(c.Mod);
       return drop({kind: 'Cleansed', text: m.text, weight: (c.Unknown1 || [])[0], hidden: m.hidden}); }),
   ]},
  {file: 'map_content', tables: ['EndgameMapContent', 'EndgameMapContentWeightings', 'EndgameMapBiomes', 'Stats'], ids: ['id', 'hidden'],
   note: 'Everything a map can hold, with its weight (1000 is the standard, 0 is off). A weight row that names biomes ' +
     'holds in those biomes only. set is a column dat-schema does not name: rows in different sets may be different pools; not verified.',
   rows: ({T, R}) => T.EndgameMapContent.rows.map((c, i) => { const s = R.statsOf(c.Stats, c.StatValues);
     const w = T.EndgameMapContentWeightings.rows.filter(x => x.MapContent === i).map(x => drop({set: x.Unknown1,
       biomes: (x.MapBiome || []).map(b => R.name('EndgameMapBiomes', b)), weight: x.Weighting.length > 1 && new Set(x.Weighting).size === 1 ? x.Weighting[0] : x.Weighting}));
     return real(c.Name) ? drop({name: clean(c.Name), id: c.Id, text: clean(c.Description), weights: w.map(x => ({set: 0, ...x})), hidden: s.hidden}) : null; }).filter(Boolean)},
  {file: 'azmeri_spirits', tables: ['TormentSpirits', 'MonsterVarieties', 'Mods', 'Stats'], ids: ['hidden'],
   note: 'Azmeri spirits: the weight each spawns with, the area levels it spawns in, and what it grants a monster it ' +
     'touches or possesses.',
   rows: ({T, R}) => T.TormentSpirits.rows.map(t => { const tm = (t.Touched_ModsKeys || []).map(R.mod), pm = (t.Possessed_ModsKeys || []).map(R.mod);
     return drop({name: R.name('MonsterVarieties', t.MonsterVarietiesKey), weight: t.SpawnWeight, level: [t.MinZoneLevel, t.MaxZoneLevel],
       touched: tm.flatMap(m => m.text), possessed: pm.flatMap(m => m.text), hidden: joinHidden(...tm.map(m => m.hidden), ...pm.map(m => m.hidden))}); })
     .filter(t => t.name)},
  {file: 'game_constants', tables: ['GameConstants'], ids: ['id'],
   note: 'The engine’s own constants. The game gives them no names, so the id is all there is; value / divisor is the number.',
   rows: ({T}) => T.GameConstants.rows.map(g => drop({id: g.Id, value: g.Value, divisor: g.Divisor !== 1 ? g.Divisor : null}))},
  {file: 'resistance_penalty', tables: ['ResistancePenaltyPerAreaLevel'], ids: [],
   note: 'The elemental resistance penalty a character takes, by area level.',
   rows: ({T}) => T.ResistancePenaltyPerAreaLevel.rows.map(r => ({level: r.AreaLevel, penalty: r.Penalty}))},
  {file: 'monster_modifiers', tables: ['ArchnemesisMods', 'Mods', 'Stats'], ids: ['hidden'],
   note: 'The modifiers a rare or magic monster rolls (the game files call them Archnemesis): the name a player sees ' +
     'over the monster and what it does.',
   rows: ({T, R}) => T.ArchnemesisMods.rows.map(a => { const m = R.mod(a.Mod);
     return real(clean(a.Name)) ? drop({name: clean(a.Name), text: m.text, hidden: m.hidden}) : null; }).filter(Boolean)},
];

/* ---------- run ---------- */
if(args.includes('--list')){
  for(const f of FILES) console.log(f.file.padEnd(22) + f.tables.join(', ') + (f.later ? '  (later)' : ''));
  process.exit(0);
}
const only = (opt('--only') || '').split(',').filter(Boolean);
const want = FILES.filter(f => only.length ? only.includes(f.file) : !f.later || args.includes('--all'));
if(!want.length) throw new Error('no declared file is called ' + only.join(', '));

const patch = opt('--patch') || await findPatch();
say('datpull · CDN folder ' + patch + ' (patch ' + gamePatch(patch) + ')');
const {schema, commit} = await loadSchema();
say('  dat-schema v' + schema.version + ', built ' + new Date(schema.createdAt * 1000).toISOString().slice(0, 10) +
  (commit ? ', commit ' + commit.slice(0, 12) : ''));
const game = await openGame(patch, schema);
const T = {};
for(const name of new Set(want.flatMap(f => f.tables).concat('Stats'))) T[name] = await game.table(name);
const W = await wording();
const R = resolver(T, W);
const source = 'game files, patch ' + gamePatch(patch);
const meta = {ids: ['files', 'schema'], source, patch: gamePatch(patch), cdn: patch, reader: 'pathofexile-dat ' + DAT_VERSION,
  schema: {commit, version: schema.version, built: new Date(schema.createdAt * 1000).toISOString().slice(0, 10), url: SCHEMA_GIT},
  files: {}};
await mkdir(OUT, {recursive: true});
for(const f of want){
  const rows = f.rows({T, R});
  const loose = f.tables.filter(t => !T[t].exact);
  const body = JSON.stringify({source, table: f.tables.join(', '), note: f.note, ids: f.ids, rows});
  await writeFile(join(OUT, f.file + '.json'), body + '\n');
  meta.files[f.file] = {patch: gamePatch(patch), tables: f.tables, rows: rows.length, bytes: body.length + 1};
  say('  ' + f.file.padEnd(22) + String(rows.length).padStart(5) + ' rows ' + String(body.length + 1).padStart(8) + ' bytes' +
    (loose.length ? '  (schema shorter than the row in ' + loose.join(', ') + ': read what fits)' : ''));
}
// a run over some of the files keeps what _meta.json says about the rest
let had = {};
try { had = JSON.parse(await readFile(join(OUT, '_meta.json'), 'utf8')).files || {}; } catch {}
meta.files = {...(only.length ? had : {}), ...meta.files};
meta.files = Object.fromEntries(Object.entries(meta.files).sort());
await writeFile(join(OUT, '_meta.json'), JSON.stringify(meta, null, 1) + '\n');
say('  ' + game.fetched() + ' bundle' + (game.fetched() === 1 ? '' : 's') + ' downloaded this run; written to ' + OUT);
