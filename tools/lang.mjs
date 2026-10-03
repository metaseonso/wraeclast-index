/* The index in other languages, in GGG's own words only (#121).

     python tools/pipeline.py --only lang    the way to run it: a patch stage, after the index is final
     node tools/lang.mjs                     every language assets/words/ holds a table for
     node tools/lang.mjs --only ru           that language only
     node tools/lang.mjs --words ru          fill the game's own words into assets/words/ru.json, nothing else
     node tools/lang.mjs --patch 4.5.5.4     that CDN folder, no probing

   A language is on the site when assets/words/<code>.json exists: the site's own words for it (labels, buttons,
   page names), keyed by the English, and under "_" what the game calls the language (its folder in the bundles and
   its name in the stat descriptions). Adding the next language is that one file; this tool writes its data.

   Where the words come from, all of it read by tools/datpull.mjs's reader straight out of the game's bundles:
   - the game's tables in their translated copies, data/balance/<language>/<table>.datc64, row for row with the
     English ones (TABLES below: names, sub lines, gem and keyword text, flavour);
   - the stat descriptions, data/statdescriptions/**.csd, which carry every language's wording of every modifier
     and gem line beside the English. A card's line is matched against the English wording, numbers and all, and
     the same wording in the other language is filled with the same numbers.
   Nothing is translated by us here. A string the game has no translation for is left out, and the site shows the
   English for it.

   Writes, per language:
     data/lang/<code>/<k>.<hash>.json   one file per card kind: {k, lang, t: {English: translation}}, every string
                                        the kind's cards draw that the game translates, but the name and sub line. Named by content, so a
                                        browser keeps it a year. The site fetches one only when that language is on
     data/lang/<code>/names.<hash>.json every card's name and sub line, of every kind: the search reads it whole
     data/lang/<code>/files.<hash>.json the language's files: the two above and our own words
     data/lang/langs.json               the languages, their files, and how much of each kind is translated;
                                        tools/shards.py puts each language's name and its files.<hash>.json into
                                        data/manifest.json, which the page reads already: an English visit fetches
                                        nothing new */
import { readFile, writeFile, mkdir, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = f => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null; };
const say = m => process.stderr.write(m + '\n');
// Node's fetch reads HTTPS_PROXY only when told to at start-up: start again, told (as tools/datpull.mjs does)
if((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY){
  const {spawnSync} = await import('node:child_process');
  const r = spawnSync(process.execPath, [...process.execArgv, ...process.argv.slice(1)],
    {stdio: 'inherit', env: {...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1'}});
  process.exit(r.status == null ? 1 : r.status);
}
const stop = e => { say('lang stopped: ' + (e && e.message || e)); process.exit(1); };
process.on('uncaughtException', stop);
process.on('unhandledRejection', stop);

const {findPatch, gamePatch, loadSchema, openGame} = await import(pathToFileURL(join(ROOT, 'tools', 'datpull.mjs')));
const {KIND, FIELDS, fieldsOf} = await import(pathToFileURL(join(ROOT, 'assets', 'kinds.js')));

/* The tables whose strings are paired, English to translation, row by row and column by column: every string
   column dat-schema names. Order decides where one English string has two translations: the first table wins. */
const TABLES = ['KeywordPopups', 'BaseItemTypes', 'Words', 'PassiveSkills', 'ActiveSkills', 'ItemClasses',
  'ItemClassCategories', 'GemTags', 'Ascendancy', 'Characters', 'ClientStrings', 'ClientStrings2', 'WorldAreas',
  'Quest', 'Acts', 'Achievements', 'AchievementItems', 'AchievementSetsDisplay', 'ArchnemesisMods',
  'BuffDefinitions', 'UltimatumModifiers', 'UltimatumEncounterTypes', 'SanctumPersistentEffects',
  'SanctumPersistentEffectCategories', 'SanctumRoomTypes', 'SanctumFloors', 'EndgameMapContent', 'EndgameMapBiomes',
  'EndgameMaps', 'EndgameMapObjectives', 'FlavourText', 'GemEffects', 'SkillGemInfo', 'SupportGemFamily',
  'CurrencyExchangeCategories', 'AtlasPassiveSkillSubTrees', 'AlternatePassiveSkills', 'PassiveSkillStatCategories',
  'SoulCoreStatCategories', 'RitualRuneTypes', 'ExpeditionCategory', 'Shrines', 'Chests', 'MonsterVarieties',
  'NPCs', 'LeagueNames', 'ReminderText', 'GrantedEffectLabels', 'ShapeShiftForms', 'CharacterPanelStats',
  'EssenceMods', 'QuestStates', 'Mods', 'Tags'];
// the field types whose words a card draws from its own entry, and where in the entry they are
const DRAWN = {
  name: f => ['n'], text: f => [f.at], rich: f => f.plain ? [] : [f.at], lines: f => [f.at], tags: f => [f.at],
  quote: f => [f.at], options: f => [f.at], perslot: f => [f.at, f.beside],
};
const SEP = ' · ';   // the game's own middot, between the parts of a sub line or a row of tags

/* ---------- the words, made comparable ---------- */
// the game's markup read as the words it shows ([Key|shown] and [Key]), and all white space one space
const words = s => typeof s !== 'string' ? '' : unstyle(s).replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')
  .replace(/\\n|\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
// a style tag round some words (<italic>{words}) is the words; a string that picks its words by grammar
// (<if:MS>{...}<elif:FS>{...}) or names a value the game fills in (<<name>>, {0}) is not one string and is left out
const unstyle = s => s.replace(/<<[a-z_]+>>\s*/g, '').replace(/<(?!if:|elif:|else)[a-z]+(?:\([^)]*\))?>\{([^{}]*)\}/gi, '$1');
const useful = s => s && /\p{L}/u.test(s) && !/^(?:Metadata|Art)\//.test(s) && !/\{\d*[:}]/.test(s) && !/<|>/.test(s);

/* ---------- 1. the tables, paired ---------- */
async function pairs(game, schema, folder){
  const out = new Map();   // English -> Map(translation -> times)
  const tmpl = new Map();   // English with {0} in it -> the same in translation: worded like a stat line
  const add = (e, x) => {
    e = words(e); x = words(x);
    if(/\{\d+\}/.test(e) && /\{\d+\}/.test(x) && !/[<>]/.test(e + x) && x !== e){ if(!tmpl.has(e)) tmpl.set(e, x); return; }
    // a row the translated copy still holds in English is a string the game has not translated: no pair
    if(!useful(e) || !x || !useful(x) || x === e) return;
    if(!out.has(e)) out.set(e, new Map());
    const m = out.get(e);
    m.set(x, (m.get(x) || 0) + 1);
  };
  let read = 0;
  const order = new Map();   // English -> the first table that had it
  for(const name of TABLES){
    let en, xx;
    try { en = await game.table(name); xx = await game.table(name, folder); }
    catch(e){ say('  ' + name + ': not read (' + e.message.split('\n')[0] + ')'); continue; }
    const cols = en.sch.columns.filter(c => c.type === 'string').map(c => c.name).filter(Boolean);
    let rows = en.rows.map((r, i) => [r, xx.rows[i]]);
    if(en.rows.length !== xx.rows.length){
      if(!cols.includes('Id')){ say('  ' + name + ': the two copies do not line up, left out'); continue; }
      const by = new Map(xx.rows.map(r => [r.Id, r]));
      rows = en.rows.map(r => [r, by.get(r.Id)]);
    }
    const before = new Set(out.keys());
    for(const [a, b] of rows){
      if(!b) continue;
      for(const c of cols){
        const va = a[c], vb = b[c];
        if(Array.isArray(va) && Array.isArray(vb) && va.length === vb.length) va.forEach((v, i) => add(v, vb[i]));
        else add(va, vb);
      }
    }
    for(const k of out.keys()) if(!before.has(k)) order.set(k, TABLES.indexOf(name));
    read++;
  }
  // one translation per English string: the one it has most often in the first table that has it
  const dict = new Map(), lower = new Map();
  for(const [e, m] of out){
    const best = [...m].sort((a, b) => b[1] - a[1])[0][0];
    dict.set(e, best);
    const l = e.toLowerCase();
    lower.set(l, lower.has(l) && lower.get(l) !== best ? null : best);   // null: two answers, so no answer
  }
  say('  ' + read + ' of ' + TABLES.length + ' tables paired, ' + dict.size.toLocaleString('en') + ' strings');
  return {dict, lower, tmpl};
}

/* ---------- 2. the stat descriptions ----------
   description
   	2 stat_a stat_b          how many stats, and which
   	2                        how many wordings, then one a line: a condition per stat, the words, what they do
   		1|# # "{0}% increased ..." ...
   	lang "Russian"
   	2
   		...                    the same wordings in that language, in the same order */
async function statFiles(game){
  const out = [];
  const walk = async path => {
    const d = game.folder(path);
    for(const f of d.files) if(f.endsWith('.csd')) out.push(f);
    for(const s of d.dirs) await walk(s);
  };
  await walk('data/statdescriptions');
  return out;
}
function parseCsd(text, want){
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  const blocks = [];
  let i = 0;
  const variants = () => {
    const n = parseInt((lines[i++] || '').trim(), 10);
    const out = [];
    for(let k = 0; k < n && i < lines.length; k++){
      const l = lines[i++].trim();
      const a = l.indexOf('"'), b = l.lastIndexOf('"');
      if(a < 0 || b <= a) continue;
      out.push({cond: l.slice(0, a).trim(), text: l.slice(a + 1, b)});
    }
    return out;
  };
  while(i < lines.length){
    const l = lines[i].trim();
    if(l === 'description' || l.startsWith('description ')){
      i++;
      const head = (lines[i++] || '').trim().split(/\s+/);
      const block = {ids: head.slice(1), en: variants(), xx: null};
      while(i < lines.length){
        const m = lines[i].trim().match(/^lang "([^"]+)"$/);
        if(!m) break;
        i++;
        const v = variants();
        if(m[1] === want) block.xx = v;
      }
      if(block.xx) blocks.push(block);
      continue;
    }
    i++;
  }
  return blocks;
}
// a number as a card writes it: 5, -5, +5, 1.5, (20-25), +(20-25), -(10-5)
const NUM = '[+-]?(?:\\([+-]?\\d+(?:\\.\\d+)?-\\d+(?:\\.\\d+)?\\)|\\d+(?:\\.\\d+)?)';
const HOLE = /\{(\d*)(?::([^}]*))?\}/g;
// the shape of a line with every number taken out: a line and a wording that can match share it
const shape = s => s.replace(HOLE, '#').replace(new RegExp(NUM, 'g'), '#').replace(/[+-]#/g, '#');
function templates(blocks, more){
  const by = new Map();   // shape -> [{re, holes, to}]
  let n = 0;
  // the tables' own worded lines ("Recovers {0} Life over {1} Seconds") join the stat descriptions as one wording each
  const all = blocks.concat([...(more || [])].map(([e, x]) => ({en: [{cond: '', text: e}], xx: [{cond: '', text: x}]})));
  for(const b of all){
    const pick = (v, j) => b.en.length === b.xx.length ? b.xx[j] : b.xx.find(x => x.cond === v.cond);
    b.en.forEach((v, j) => {
      const x = pick(v, j);
      if(!x) return;
      const es = v.text.split('\\n'), xs = x.text.split('\\n');
      if(es.length !== xs.length) return;
      es.forEach((e, k) => {
        e = words(e);
        const to = words(xs[k]);
        if(!e || !to || to === e || !/\p{L}/u.test(e)) return;   // a wording still in English is not a translation
        let seq = 0, holes = [];
        const re = '^' + e.split(HOLE).map((part, p) => {
          // String.split with a capturing pattern: [text, index, format, text, index, format, ...]
          const r = p % 3;
          if(r === 0) return part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          if(r === 1){ holes.push(part === '' ? seq++ : +part); return '(' + NUM + ')'; }
          return '';
        }).join('') + '$';
        const key = shape(e);
        if(!by.has(key)) by.set(key, []);
        by.get(key).push({re: new RegExp(re), holes, to});
        n++;
      });
    });
  }
  return {by, n};
}
function fillIn(t, got){
  let seq = 0, ok = true;
  const out = t.to.replace(HOLE, (m, i, fmt) => {
    const at = i === '' ? seq++ : +i;
    const k = t.holes.indexOf(at);
    if(k < 0){ ok = false; return m; }
    let v = got[k];
    if(fmt && fmt.includes('+') && !/^[+-]/.test(v)) v = '+' + v;
    return v;
  });
  return ok ? out : null;
}

/* ---------- 3. one string, translated ---------- */
/* W: our own words (assets/words/<code>.json), for the parts of a sub line the game has no word for ("drops from
   level 70"). Tried last, after every word of the game's. A {0} in an entry stands for a number, kept as it is, or
   for words the game translates. */
function ownWords(table){
  const exact = new Map(), shapes = [];
  for(const [e, v] of Object.entries(table)){
    const t = typeof v === 'string' ? v : v && v.t;
    if(e === '_' || !t) continue;
    if(!/\{\d\}/.test(e)){ exact.set(e, t); continue; }
    const holes = [];
    const re = '^' + e.split(/\{(\d)\}/).map((part, i) => i % 2 ? (holes.push(+part), '(.+?)') : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('') + '$';
    shapes.push({re: new RegExp(re), holes, t});
  }
  return {exact, shapes};
}
function translator(D, T, W){
  // the same words; else in other capitals; else with a hyphen between two words as a space, the way the game
  // writes "Two Handed Mace" where the trade site writes "Two-Handed Mace"
  const whole = s => D.dict.get(s) || D.lower.get(s.toLowerCase()) ||
    D.lower.get(s.toLowerCase().replace(/(\p{L})-(\p{L})/gu, '$1 $2')) || null;
  const own = (s, tr) => {
    if(W.exact.has(s)) return W.exact.get(s);
    for(const w of W.shapes){
      const m = s.match(w.re);
      if(!m) continue;
      const got = m.slice(1).map(v => /\p{L}/u.test(v) ? tr(v) : v);
      if(got.every(Boolean)) return w.t.replace(/\{(\d)\}/g, (x, i) => got[w.holes.indexOf(+i)] ?? x);
    }
    return null;
  };
  const stat = s => {
    for(const t of T.by.get(shape(s)) || []){
      const m = s.match(t.re);
      if(m){ const out = fillIn(t, m.slice(1)); if(out) return out; }
    }
    return null;
  };
  return function tr(s){
    s = typeof s === 'string' ? s.trim() : '';
    if(!s || !/\p{L}/u.test(s)) return null;
    const w = words(s);
    const got = whole(w) || stat(w);
    if(got) return got;
    // a line of parts ("Dualstring Bow · Bow"): each part on its own, and the whole only where every part is
    if(w.includes(SEP)){
      const parts = w.split(SEP).map(p => tr(p) || (/\p{L}/u.test(p) ? null : p));
      return parts.every(Boolean) ? parts.join(SEP) : null;
    }
    const ours = own(w, tr);   // our own words last, one part at a time
    if(ours) return ours;
    // a property ("Physical Damage: 19-35"): the game's own label, the value as it is
    const m = w.match(/^([^:]{2,40}): (.+)$/);
    if(m){
      const label = whole(m[1]);
      const rest = /\p{L}/u.test(m[2]) ? tr(m[2]) : m[2];
      if(label && rest) return label + ': ' + rest;
    }
    return null;
  };
}

/* ---------- 4. the cards ---------- */
function drawnStrings(it){
  const out = [];   // [[field kind, string]]
  const seen = new Set();
  for(const slot of ['head', 'pill', 'fact', 'body', 'foot']){
    for(const name of fieldsOf(it.k, slot)){
      const f = FIELDS[name];
      const at = f && DRAWN[f.type] ? DRAWN[f.type](f) : [];
      for(const a of at){
        if(seen.has(a)) continue;
        seen.add(a);
        const v = it[a];
        const role = a === 'n' ? 'names' : a === 's' ? 'subs' : 'lines';
        // a text field draws its words between its own `pre` and `post` ("Ranger" + " region"): that whole is the
        // run of text on the page
        const wrap = s => f.type === 'text' && a !== 's' ? (f.pre || '') + s + (f.post || '') : s;
        for(const s of Array.isArray(v) ? v : [v]) if(typeof s === 'string' && s.trim()) out.push([role, wrap(s)]);
      }
    }
  }
  return out;
}
const sha = b => createHash('sha1').update(b).digest('hex');

async function build(code, meta, D, T, table){
  const tr = translator(D, T, ownWords(table));
  const index = JSON.parse(await readFile(join(ROOT, 'data', 'index.json'), 'utf8'));
  const byKind = new Map();
  for(const it of index.items){
    if(!byKind.has(it.k)) byKind.set(it.k, []);
    byKind.get(it.k).push(it);
  }
  const dir = join(ROOT, 'data', 'lang', code);
  await mkdir(dir, {recursive: true});
  const keep = new Set();
  const put = async (stem, o) => {
    const body = JSON.stringify(o);
    const name = stem + '.' + sha(body).slice(0, 10) + '.json';
    await writeFile(join(dir, name), body);
    keep.add(name);
    return {file: 'data/lang/' + code + '/' + name, bytes: Buffer.byteLength(body)};
  };
  const kinds = {}, names = {}, cover = {}, total = {names: [0, 0], subs: [0, 0], lines: [0, 0]}, left = new Map();
  const pc = c => c[1] ? Math.round(100 * c[0] / c[1]) + '%' : '-';
  for(const [k, items] of byKind){
    if(!KIND[k]) continue;
    const t = {}, count = {names: [0, 0], subs: [0, 0], lines: [0, 0]}, done = new Map();
    for(const it of items){
      for(const [role, s] of drawnStrings(it)){
        if(!done.has(s)) done.set(s, tr(s));
        const x = done.get(s);
        count[role][1]++;
        if(x && x !== s){ count[role][0]++; (role === 'lines' ? t : names)[s] = x; }
        else if(args.includes('--missing')){ const key = k + ' ' + role; if(!left.has(key)) left.set(key, new Set()); left.get(key).add(s); }
      }
    }
    if(Object.keys(t).length) kinds[k] = await put(k, {k, lang: code, t});   // a kind with nothing translated has no file
    cover[k] = count;
    for(const r of Object.keys(total)){ total[r][0] += count[r][0]; total[r][1] += count[r][1]; }
    say('  ' + code + ' ' + k + '  names ' + pc(count.names).padStart(4) + ' of ' + String(count.names[1]).padStart(5) +
      '   subs ' + pc(count.subs).padStart(4) + ' of ' + String(count.subs[1]).padStart(5) +
      '   lines ' + pc(count.lines).padStart(4) + ' of ' + String(count.lines[1]).padStart(6) + '   ' + (kinds[k] ? kinds[k].bytes + ' bytes' : 'no file'));
  }
  const nf = await put('names', {lang: code, t: names});
  say('  ' + code + ' names and sub lines of every kind: ' + nf.bytes + ' bytes');
  for(const [key, set] of left) say('  left in English, ' + key + ' (' + set.size + '): ' + [...set].slice(0, 12).join(' | '));
  // the language's own list of its files, which the manifest names: the manifest itself, read on every visit,
  // grows by one line a language and no more
  const words = 'assets/words/' + code + '.json';
  const list = await put('files', {lang: code, words, names: nf, kinds});
  // a file an older run named goes: nothing names it now
  for(const f of await readdir(dir)) if(!keep.has(f)) await unlink(join(dir, f));
  return {name: meta.name, html: meta.html || code, ...list, words, names: nf, kinds, cover, total};
}

/* ---------- 5. our own words: the game's word wherever the game has one ---------- */
/* An entry is the game's word for it (a string), the game's word for another English string that says the same
   thing ({as: "Passive Skill Tree", t}: the game's own name for what we call the passive tree), or ours
   ({t, ours: true}), only where the game has no word at all. Every pair the game has is left in
   tools/cache/lang-<code>.json, to look the game's word up in when writing the table. */
async function siteWords(code, file, D){
  const table = JSON.parse(await readFile(file, 'utf8'));
  await mkdir(join(ROOT, 'tools', 'cache'), {recursive: true});
  await writeFile(join(ROOT, 'tools', 'cache', 'lang-' + code + '.json'), JSON.stringify(Object.fromEntries(D.dict), null, 0));
  let game = 0, ours = 0, none = [];
  for(const [e, v] of Object.entries(table)){
    if(e === '_') continue;
    if(v && typeof v === 'object' && v.ours){ ours++; continue; }
    if(v && typeof v === 'object' && v.as){
      const g = D.dict.get(v.as);
      if(g){ v.t = g; game++; } else { delete v.t; none.push(e + ' (as ' + v.as + ')'); }
      continue;
    }
    // the same words, capitals and all: a label is not a word out of a sentence. A label starts with a capital
    // where the game's word, written for the middle of a line, does not
    const g = D.dict.get(e);
    if(g){ table[e] = /^\p{Lu}/u.test(e) ? g.charAt(0).toUpperCase() + g.slice(1) : g; game++; }
    else { table[e] = null; none.push(e); }
  }
  // one entry a line, so a change to the table reads as the lines it changed
  await writeFile(file, '{\n' + Object.entries(table).map(([e, v]) => ' ' + JSON.stringify(e) + ': ' + JSON.stringify(v)).join(',\n') + '\n}\n');
  say('  assets/words/' + code + '.json: ' + game + ' from the game, ' + ours + ' ours' +
    (none.length ? ', ' + none.length + ' the game has no word for (write them, marked ours): ' + none.join(', ') : ''));
}

/* ---------- run ---------- */
const WORDS = join(ROOT, 'assets', 'words');
const codes = (existsSync(WORDS) ? await readdir(WORDS) : []).filter(f => /^[a-z]{2}(?:-[a-z]{2})?\.json$/.test(f)).map(f => f.slice(0, -5));
const only = opt('--words') || opt('--only');
const todo = codes.filter(c => !only || c === only);
if(!todo.length) throw new Error('no table in assets/words/ for ' + (only || 'any language'));
const patch = opt('--patch') || await findPatch();
say('lang · CDN folder ' + patch + ' (patch ' + gamePatch(patch) + ')');
const {schema} = await loadSchema(false);
const game = await openGame(patch, schema);
const langs = {};
const was = existsSync(join(ROOT, 'data', 'lang', 'langs.json'))
  ? JSON.parse(await readFile(join(ROOT, 'data', 'lang', 'langs.json'), 'utf8')) : {};
for(const code of todo){
  const file = join(WORDS, code + '.json');
  const table = JSON.parse(await readFile(file, 'utf8')), meta = table._ || {};
  if(!meta.game || !meta.csd) throw new Error('assets/words/' + code + '.json says under "_" neither its game folder nor its stat description name');
  say(code + ' · ' + meta.name + ' (data/balance/' + meta.game + ', lang "' + meta.csd + '")');
  const D = await pairs(game, schema, meta.game);
  if(opt('--words')){ await siteWords(code, file, D); continue; }
  const blocks = [];
  for(const f of await statFiles(game)){
    const bytes = await game.file(f);
    blocks.push(...parseCsd(new TextDecoder('utf-16le').decode(bytes), meta.csd));
  }
  const T = templates(blocks, D.tmpl);
  say('  ' + blocks.length.toLocaleString('en') + ' stat descriptions, ' + T.n.toLocaleString('en') + ' wordings');
  langs[code] = {...await build(code, meta, D, T, table), patch: gamePatch(patch)};
}
if(!opt('--words')){
  const out = {source: 'the game files, patch ' + gamePatch(patch) + ': GGG’s own translations (tools/lang.mjs)',
    langs: {...(only ? was.langs || {} : {}), ...langs}};
  await writeFile(join(ROOT, 'data', 'lang', 'langs.json'), JSON.stringify(out, null, 1) + '\n');
  say('  ' + game.fetched() + ' bundle' + (game.fetched() === 1 ? '' : 's') + ' downloaded this run; data/lang/langs.json written');
}
