/* Build tab: paste a Path of Building code, get offense-or-defense priority and a ranked list of
   investments priced with live poe.ninja data. Runs in the browser.
   PoB is used only to READ the code. Item data and prices come from the game files and poe.ninja. */
import { D, $, esc, card, flow, ago, moneyHTML, priceOf, hrefOf, openDetail, detailExtras } from './app.js';
import { classFor } from './basepool.js';
/* The rules: assets/maths.js, the one file tools/dev/buildcheck.mjs holds against Path of Building's own
   numbers. Nothing on this page works a stat out for itself. */
import * as M from './maths.js';

/* ---------- 1. code -> XML ----------
   PoB: base64url( zlib( xml ) ). DecompressionStream('deflate') reads zlib. */
async function decode(code){
  let s = code.trim();
  if(/^https?:\/\//i.test(s)){   // a build link: the site's worker fetches the code behind it
    let r = null;
    try { r = await fetch('api/pob?url=' + encodeURIComponent(s)); } catch {}
    if(!r || !r.ok || !/text\/plain/.test(r.headers.get('content-type') || '')){
      const msg = r && r.ok === false && /text\/plain/.test(r.headers.get('content-type') || '') ? await r.text() : '';
      throw new Error(msg || "Couldn't open that link. Open it and copy the build code instead.");
    }
    s = (await r.text()).trim();
  }
  s = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/[^A-Za-z0-9+/=]/g, '').replace(/=+$/, '');
  if(s.length < 100) throw new Error("That doesn't look like a build code.");
  s += '='.repeat((4 - s.length % 4) % 4);
  let bytes;
  try { const bin = atob(s); bytes = Uint8Array.from(bin, c => c.charCodeAt(0)); }
  catch { throw new Error("That doesn't look like a build code."); }
  const fmt = bytes[0] === 0x1f && bytes[1] === 0x8b ? 'gzip' : 'deflate';
  let xml;
  try { xml = await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream(fmt))).text(); }
  catch { throw new Error("Couldn't read that code. Copy it again from Path of Building."); }
  if(xml.length > 5e6) throw new Error('That build is too big to read.');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if(doc.querySelector('parsererror') || !doc.querySelector('Build')) throw new Error("That code isn't a Path of Building build.");
  if(doc.documentElement.nodeName !== 'PathOfBuilding2') throw new Error("That's a Path of Exile 1 build. This page is for Path of Exile 2.");
  return doc;
}

/* ---------- 2. XML -> build ---------- */
const num = v => {
  if(v == null || v === 'nil' || v === '') return null;
  if(v === 'inf') return Infinity;
  if(v === '-inf') return -Infinity;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};
const HEADER = /^(Rarity|Unique ID|Item Level|LevelReq|Quality|Sockets|Implicits|League|Variant|Selected Variant|Has Alt Variant|Crafted|Prefix|Suffix|Radius|Limited to|Requires|Armour|Evasion|Energy Shield|Runic Ward|Ward|Spirit|Charm Slots|Catalyst|CatalystQuality|Talisman Tier|Item Class|Corrupted|Twice Corrupted|Mirrored|Sanctified|Unmodifiable|Split|Foil|BasePercentile|ArmourBasePercentile|EvasionBasePercentile|EnergyShieldBasePercentile)\b/;
function parseItem(text){
  const lines = text.split('\n').map(x => x.trim()).filter(Boolean);
  // armour, evasion and es are what the game prints on the item: its own lines are already inside them
  const it = {rarity: '', name: '', base: '', mods: [], runes: [], flags: [], lv: 0, sockets: 0,
    armour: 0, evasion: 0, es: 0, hit: null, rate: 0, crit: 0, quality: 0};
  let i = 0, implicits = 0;
  const r = lines[i] && lines[i].match(/^Rarity: (\w+)/);
  if(r){ it.rarity = r[1]; i++; }
  if(/RARE|UNIQUE|RELIC/.test(it.rarity)){ it.name = lines[i++] || ''; it.base = lines[i++] || ''; }
  else { it.name = lines[i++] || ''; it.base = it.name; }
  for(; i < lines.length; i++){
    const l = lines[i].replace(/\{[^}]*\}/g, '').trim();
    let m;
    if((m = l.match(/^(Armour|Evasion|Energy Shield): ([\d.]+)/))){
      it[{Armour: 'armour', Evasion: 'evasion', 'Energy Shield': 'es'}[m[1]]] = Number(m[2]); continue; }
    if((m = l.match(/^\w* ?Damage: ([\d.]+)-([\d.]+)/))) { it.hit = [Number(m[1]), Number(m[2])]; continue; }
    if((m = l.match(/^Attacks per Second: ([\d.]+)/))){ it.rate = Number(m[1]); continue; }
    if((m = l.match(/^Critical Hit Chance: ([\d.]+)/))){ it.crit = Number(m[1]); continue; }
    if((m = l.match(/^Quality: \+?(\d+)/))){ it.quality = Number(m[1]); continue; }
    // the sockets the item itself says it has, and one line per socket that is filled. An item carrying
    // its own lines twice over lists them twice over too, so the sockets are the count that holds.
    if((m = l.match(/^Sockets: (\S.*)$/))){ if(!it.sockets) it.sockets = m[1].trim().split(/\s+/).length; continue; }
    if((m = l.match(/^Rune: (.+)/))){ it.runes.push(m[1]); continue; }
    if((m = l.match(/^LevelReq: (\d+)/))){ it.lv = +m[1]; continue; }
    if((m = l.match(/^Implicits: (\d+)/))){ implicits = +m[1]; continue; }
    if(/^(Corrupted|Twice Corrupted|Mirrored|Sanctified)$/.test(l)){ it.flags.push(l); continue; }
    if((HEADER.test(l) && /^[A-Za-z ]+:/.test(l)) || /^Bonded:/.test(l) || /^Requires /.test(l)) continue;
    if(l) it.mods.push(l);
  }
  it.implicits = implicits;
  if(it.sockets && it.runes.length > it.sockets) it.runes.length = it.sockets;
  return it;
}
function read(doc){
  const B = doc.querySelector('Build');
  const b = {level: num(B.getAttribute('level')) || 1, cls: B.getAttribute('className') || '',
    asc: B.getAttribute('ascendClassName'), player: {}, minion: {}};
  if(!b.asc || b.asc === 'None' || b.asc === 'nil') b.asc = '';
  for(const e of B.querySelectorAll(':scope > PlayerStat')) b.player[e.getAttribute('stat')] = num(e.getAttribute('value'));
  for(const e of B.querySelectorAll(':scope > MinionStat')) b.minion[e.getAttribute('stat')] = num(e.getAttribute('value'));

  // skills: the active set, the main group, the main gem in it
  const S = doc.querySelector('Skills');
  let groups = [];
  if(S){
    const set = S.querySelector(':scope > SkillSet[id="' + S.getAttribute('activeSkillSet') + '"]') || S.querySelector(':scope > SkillSet');
    groups = [...(set || S).querySelectorAll(':scope > Skill')].filter(g => g.getAttribute('removed') !== 'true');
  }
  const main = groups[(num(B.getAttribute('mainSocketGroup')) || 1) - 1] || groups[0];
  b.gems = [];
  if(main){
    const gems = [...main.querySelectorAll(':scope > Gem')].map(g => ({
      name: g.getAttribute('nameSpec') || '', level: num(g.getAttribute('level')) || 1, quality: num(g.getAttribute('quality')) || 0,
      enabled: g.getAttribute('enabled') !== 'false',
      support: /^Support/.test(g.getAttribute('skillId') || '') || /SupportGem/.test(g.getAttribute('gemId') || ''),
    })).filter(g => g.name && g.enabled);
    const actives = gems.filter(g => !g.support);
    const pick = actives[(num(main.getAttribute('mainActiveSkill')) || 1) - 1] || actives[0];
    b.gems = pick ? [pick, ...gems.filter(g => g !== pick)] : gems;
  }

  // gear: the active item set; weapon swap decides which weapon pair is live
  const I = doc.querySelector('Items');
  const byId = {};
  if(I) for(const e of I.querySelectorAll(':scope > Item')) byId[e.getAttribute('id')] = e.textContent;
  const set = I && (I.querySelector(':scope > ItemSet[id="' + I.getAttribute('activeItemSet') + '"]') || I.querySelector(':scope > ItemSet'));
  const swap = I && I.getAttribute('useSecondWeaponSet') === 'true';
  b.items = [];
  const filled = new Set();
  if(set) for(const s of set.querySelectorAll(':scope > Slot')){
    const name = s.getAttribute('name') || '', id = s.getAttribute('itemId');
    if(!id || id === '0' || !byId[id]) continue;
    filled.add(name);
    if(/^Weapon \d$/.test(name) && swap) continue;
    if(/^Weapon \d Swap$/.test(name) && !swap) continue;
    if(/^(Flask|Charm) \d/.test(name) && s.getAttribute('active') === 'false') continue;
    b.items.push({slot: name.replace(/ Swap$/, ''), ...parseItem(byId[id])});
  }
  // the jewels sit on the tree rather than in a slot
  for(const s of doc.querySelectorAll('Spec > Sockets > Socket')){
    const id = s.getAttribute('itemId');
    if(id && id !== '0' && byId[id]) b.items.push({slot: 'Jewel', ...parseItem(byId[id])});
  }
  // the order a character is worn in, so the gear and the bill read top to bottom rather than in whatever
  // order the slots were last touched in
  b.items.sort((x, y) => (SLOTS.indexOf(x.slot) + 1 || 99) - (SLOTS.indexOf(y.slot) + 1 || 99));
  // the slots the code itself lists empty, out of the ones a character has one of whatever the build: a
  // second weapon is a question about the first one's grip, and a third ring is not a slot the game gives
  b.empty = set ? GEAR.filter(n => !filled.has(n)) : [];
  const T = doc.querySelector('Tree');
  const specs = [...(T ? T.querySelectorAll(':scope > Spec') : [])];
  const spec = specs[(num(T && T.getAttribute('activeSpec')) || 1) - 1] || specs[0];
  b.nodes = ((spec && spec.getAttribute('nodes')) || '').split(',').filter(Boolean).map(Number);
  return b;
}
const SLOTS = ['Weapon 1', 'Weapon 2', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet',
  'Ring 1', 'Ring 2', 'Ring 3', 'Belt', 'Flask 1', 'Flask 2', 'Charm 1', 'Charm 2', 'Charm 3', 'Jewel'];
const GEAR = ['Weapon 1', 'Helmet', 'Body Armour', 'Gloves', 'Boots', 'Amulet', 'Ring 1', 'Ring 2', 'Belt', 'Flask 1', 'Flask 2'];

/* ---------- 3. what the numbers say ----------
   Rules of thumb for Path of Exile 2 endgame, scaled by character level. They are guides, not law. */
function dpsOf(b){
  const p = b.player;
  const own = Math.max(p.FullDPS || 0, p.CombinedDPS || 0, p.TotalDPS || 0,
    (p.CombinedAvg && p.Speed) ? p.CombinedAvg * p.Speed : 0, (p.AverageHit && p.Speed) ? p.AverageHit * p.Speed : 0);
  const min = (b.minion.CombinedDPS || b.minion.TotalDPS || 0) * (p.ActiveMinionLimit || 1);
  return {dps: Math.max(own, min), minion: min > own};
}
function target(level){
  // damage per second and the smallest hit worth surviving, by character level
  const rows = [[90, 1e6, 8000], [80, 5e5, 6000], [70, 2e5, 4000], [60, 8e4, 2500], [0, 3e4, 1500]];
  const r = rows.find(x => level >= x[0]);
  return {dps: r[1], hit: r[2], pool: Math.max(1000, level * 45)};
}
const ELEM = [['FireResist', 'Fire'], ['ColdResist', 'Cold'], ['LightningResist', 'Lightning']];
function assess(b){
  const p = b.player, t = target(b.level), out = {issues: [], t};
  const has = Object.keys(p).length > 0;
  out.noStats = !has;
  for(const [k, name] of ELEM){
    const v = p[k];
    if(v !== null && v !== undefined && v < 75) out.issues.push({side: 'def', kind: 'res', el: name, gap: 75 - v, sev: 100 + (75 - v),
      text: name + ' resistance is ' + v + '%. Cap is 75%'});
  }
  if(p.ChaosResist !== null && p.ChaosResist !== undefined && p.ChaosResist < (b.level >= 80 ? 20 : 0)){
    const goal = b.level >= 80 ? 20 : 0;
    out.issues.push({side: 'def', kind: 'res', el: 'Chaos', gap: goal - p.ChaosResist, sev: 70 + (goal - p.ChaosResist) / 2,
      text: 'Chaos resistance is ' + p.ChaosResist + '%' + (goal ? '. Aim for ' + goal + '%+' : '')});
  }
  for(const [a, r, name] of [['Str', 'ReqStr', 'Strength'], ['Dex', 'ReqDex', 'Dexterity'], ['Int', 'ReqInt', 'Intelligence']]){
    if(p[a] !== undefined && p[r] !== undefined && p[a] !== null && p[r] !== null && p[a] < p[r])
      out.issues.push({side: 'def', kind: 'attr', sev: 96, text: 'You need ' + (p[r] - p[a]) + ' more ' + name + ' for your gear and gems'});
  }
  const hits = ['Physical', 'Fire', 'Cold', 'Lightning'].map(e => [e, p[e + 'MaximumHitTaken']]).filter(x => x[1] !== null && x[1] !== undefined && isFinite(x[1]));
  if(hits.length){
    const [el, hit] = hits.reduce((a, x) => x[1] < a[1] ? x : a);
    out.hit = {el, v: hit};
    out.defRatio = hit / t.hit;
    if(out.defRatio < 1) out.issues.push({side: 'def', kind: 'hit', el, sev: 40 + 70 * (1 - out.defRatio),
      text: 'Biggest ' + el.toLowerCase() + ' hit you can take: ' + Math.round(hit).toLocaleString() + '. Aim for ' + t.hit.toLocaleString() + '+'});
  }
  const pool = (p.Life || 0) + (p.EnergyShield || 0);
  out.pool = pool;
  out.es = (p.EnergyShield || 0) > (p.Life || 0);
  if(!hits.length && pool){
    out.defRatio = pool / t.pool;
    if(out.defRatio < 1) out.issues.push({side: 'def', kind: 'hit', el: 'Physical', sev: 40 + 70 * (1 - out.defRatio),
      text: 'Life plus Energy Shield: ' + pool.toLocaleString() + '. Aim for ' + t.pool.toLocaleString() + '+'});
  }
  const d = dpsOf(b);
  out.dps = d.dps; out.minionDps = d.minion;
  if(d.dps > 0){
    out.offRatio = d.dps / t.dps;
    if(out.offRatio < 1) out.issues.push({side: 'off', kind: 'dps', sev: 40 + 70 * (1 - out.offRatio),
      text: 'Damage: ' + short(d.dps) + ' per second. Aim for ' + short(t.dps) + '+'});
  }
  const resGap = out.issues.some(x => x.kind === 'res' && x.el !== 'Chaos');
  const dr = out.defRatio ?? 1, or = out.offRatio ?? 1;
  out.priority = resGap || out.issues.some(x => x.kind === 'attr') ? 'def' : (dr < or ? 'def' : 'off');
  out.onTrack = !out.issues.length;
  return out;
}
function short(n){ return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n)); }

/* ---------- 3b. worked out here ----------
   The same rules the check runs: assets/maths.js reads the build's lines into one stat table, the maths
   runs over the table, and the answer comes back as a floor and a ceiling with the reason beside it.

   Two files come down the first time a build is read and stay for the session: what every passive on the
   tree says (data/treelines.json, tools/treelines.py) and what a class starts with and what one monster of
   each level is worth (data/gamestats.json, the game's own export). */
let TREE = null, GAME = null;
async function mathsData(){
  if(TREE && GAME) return true;
  try {
    const [t, g] = await Promise.all([
      TREE || fetch('data/treelines.json').then(r => r.json()),
      GAME || fetch('data/gamestats.json').then(r => r.json()),
    ]);
    TREE = TREE || t; GAME = GAME || g;
    return true;
  } catch { return false; }
}
/* Which of an item's lines are its own. A line naming a defence the item carries is already inside the
   number the game prints on the item, so it is read and dropped rather than counted twice. */
const OWN = /^(#% (increased|reduced) (armour|evasion rating|maximum energy shield|energy shield|armour and evasion rating|armour and evasion|armour and energy shield|evasion and energy shield|evasion rating and energy shield|armour, evasion and energy shield|armour, evasion rating and energy shield)|# to (armour|evasion rating|maximum energy shield|energy shield))$/;
function linesOf(b){
  const out = [];
  for(const it of b.items){
    for(const text of it.mods){
      const k = M.key(M.plain(text));
      const names = [['armour', /armour/], ['evasion', /evasion/], ['es', /energy shield/]]
        .filter(([, re]) => re.test(k)).map(([w]) => w);
      out.push({text, local: OWN.test(k) && names.length > 0 && names.every(w => it[w] > 0)});
    }
    for(const r of it.runes) out.push({text: r, local: false});
  }
  for(const h of b.nodes || []){
    const got = TREE && TREE.n[String(h)];
    if(!got){ out.push({text: 'a passive this data does not carry', local: false}); continue; }
    for(const i of got) out.push({text: TREE.w[i], local: false});
  }
  return out;
}
/* One answer. `take` settles an unknown: true takes it the way that helps, false the way that does not,
   and anything else leaves it open, which is what widens the range. */
function once(b, take, had){
  const cls = (GAME.classes || []).find(c => c.n === b.cls);
  const {stats, unread, named} = had;
  const at = k => stats.get(k) || {flat: 0, inc: 0, more: 1};
  const total = (k, base) => (base + at(k).flat) * (1 + at(k).inc / 100) * at(k).more;
  const free = take.anyattribute ? at('anyattribute').flat : 0;
  let armour = 0, evasion = 0, es = 0;
  for(const it of b.items){ armour += it.armour; evasion += it.evasion; es += it.es; }
  const str = Math.round(total('str', (cls ? cls.str : 0) + free));
  const halved = !!at('halflifefromstrength').flat;
  const life = Math.round(M.baseLife(b.level, str, halved) * (1 + (M.BASE.lifeInc + at('life').inc) / 100)
    * at('life').more + at('life').flat * (1 + (M.BASE.lifeInc + at('life').inc) / 100));
  const res = {}, resmax = {};
  for(const e of ['fire', 'cold', 'lightning', 'chaos']){
    resmax[e] = Math.min(M.RES_CEILING, M.RES_DEFAULT + at('resmax.' + e).flat);
    res[e] = Math.min(Math.round(total('res.' + e, 0)), resmax[e]);
  }
  const d = {
    armour: Math.round(total('armour', armour)), evasion: Math.round(total('evasion', evasion + M.BASE.evasion)),
    es: Math.round(total('es', es)), life,
    mana: Math.round(total('mana', cls ? M.baseMana(cls, b.level) : 0)),
    mom: take.mindovermatter ? Math.round(total('mana', cls ? M.baseMana(cls, b.level) : 0)) : 0,
    res, resmax, pen: {},
  };
  const hits = {};
  for(const t of M.TYPES) hits[t] = Math.round(M.maxHit(t, d));
  return {stats, unread, named, cls, str, life, d, hits,
    pool: d.es + (d.mom ? Math.min(d.mana, d.mom) : 0) + d.life,
    dex: Math.round(total('dex', (cls ? cls.dex : 0) + free)),
    int: Math.round(total('int', (cls ? cls.int : 0) + free)),
    dps: damage(b, stats)};
}
/* The damage side, out of the weapon the build carries. A skill gem's own base damage is not in the data
   this page holds, so a build whose damage comes off the skill and not the weapon says so instead. */
function damage(b, stats){
  const w = b.items.find(it => /^Weapon 1$/.test(it.slot));
  if(!w) return null;
  // a rare weapon's code carries only its base, and what a base is worth is a card on this site already.
  // Found once and kept on the item: the card list is every card on the site and walking it is not free.
  if(w.card === undefined) w.card = w.hit && w.rate ? null
    : (D.index && D.index.items.find(x => x.k === 'b' && (x.n || '').toLowerCase() === (w.base || '').toLowerCase())) || null;
  const pr = w.card ? (w.card.pr || []) : [];
  const take = re => { for(const l of pr){ const m = l.match(re); if(m) return m; } return null; };
  const dmg = w.hit ? w.hit : (x => x ? [Number(x[1]), Number(x[2])] : null)(take(/^\w* ?Damage: ([\d.]+)-([\d.]+)/));
  const rate = w.rate || Number((take(/^Attacks per Second: ([\d.]+)/) || [])[1] || 0);
  const crit = w.crit || Number((take(/^Critical Hit Chance: ([\d.]+)/) || [])[1] || 0);
  if(!dmg || !rate) return null;
  const at = k => stats.get(k) || {flat: 0, inc: 0, more: 1};
  // quality is the weapon's own, and the game applies it to the weapon's Physical Damage before anything else
  const base = {physical: (dmg[0] + dmg[1]) / 2 * (1 + (w.quality || 0) / 100)};
  const h = M.hit({stats, base, crit, kind: 'attack'});
  const swings = rate * (1 + at('attackspeed').inc / 100) * at('attackspeed').more;
  return {perHit: h.average, rate: swings, dps: h.average * swings, weapon: w.name || w.base, crit: h.crit};
}
/* What the answer is worked against, out of the game's own table of one monster per level. */
function monster(level){
  const cols = Object.fromEntries(GAME.monsters.cols.map((c, i) => [c, i]));
  const rows = GAME.monsters.rows;
  const r = rows.find(x => x[cols.level] === Math.max(1, Math.min(rows.length, level)));
  return r ? {level: r[cols.level], life: r[cols.life], damage: r[cols.damage],
    accuracy: r[cols.accuracy], armour: r[cols.armour], evasion: r[cols.evasion]} : null;
}
/* The whole answer: every unknown the build meets, taken both ways unless the player has set it. */
function answer(b, set){
  // the stat table is built once per build, not once per corner: nothing a switch does changes what the
  // lines say, only what is done with them afterwards
  const had = b.read || (b.read = M.read(linesOf(b)));
  const open = [];
  const probe = once(b, {}, had);
  if((probe.stats.get('anyattribute') || {flat: 0}).flat) open.push('anyattribute');
  if([...probe.unread, ...probe.named].some(x => /mind over matter/.test(x))) open.push('mindovermatter');
  const loose = open.filter(id => set[id] === undefined);
  const corners = [];
  for(let i = 0; i < (1 << loose.length); i++){
    const take = {...set};
    loose.forEach((id, k) => { take[id] = !!(i & (1 << k)); });
    corners.push(once(b, take, had));
  }
  const span = pick => {
    const v = corners.map(pick);
    return {lo: Math.min(...v), hi: Math.max(...v)};
  };
  return {
    open, loose, one: corners[0],
    life: span(c => c.life), es: span(c => c.d.es), armour: span(c => c.d.armour),
    evasion: span(c => c.d.evasion), str: span(c => c.str), dex: span(c => c.dex), int: span(c => c.int),
    hits: Object.fromEntries(M.TYPES.map(t => [t, span(c => c.hits[t])])),
    corners,
    dps: corners[0].dps ? span(c => c.dps.dps) : null,
    unread: corners[0].unread.length, named: corners[0].named.length,
  };
}

/* ---------- what it draws ---------- */
const fmt = v => v >= 1e6 ? (v / 1e6).toFixed(1) + 'M' : v >= 1e4 ? Math.round(v / 1e3) + 'k'
  : Math.round(v).toLocaleString();
const spanText = s => s.lo === s.hi ? fmt(s.lo) : fmt(s.lo) + '–' + fmt(s.hi);
/* Two rows that move with the monster level, because a number worked against nothing means nothing: how
   many of its own hits the pools stand, and what a second of your damage does once its armour has had its
   share. Both run the same steps as everything else — STEPS.cuts, then STEPS.pools. */
function stands(A, m){
  const v = A.corners.map(c => {
    const each = M.taken(m.damage, 'physical', c.d);
    return each > 0 ? Math.floor(c.pool / each) : 0;
  });
  return {lo: Math.min(...v), hi: Math.max(...v)};
}
function intoIt(A, m){
  const v = A.corners.map(c => {
    if(!c.dps) return 0;
    const cut = m ? M.armourCut(m.armour, c.dps.perHit) : 0;
    return c.dps.dps * (1 - cut);
  });
  return {lo: Math.min(...v), hi: Math.max(...v)};
}
function mathsHTML(b, A, level){
  const m = monster(level);
  const row = (name, s, note) => '<div><dt>' + esc(name) + '</dt><dd>' + esc(spanText(s)) +
    (note ? ' <small>' + esc(note) + '</small>' : '') + '</dd></div>';
  const widened = A.loose.map(id => (M.unknown(id) || {n: id}).n);
  const switches = A.open.map(id => {
    const u = M.unknown(id) || {id, n: id, on: 'As if it works', off: 'As if it does not'};
    return '<div class="mx-un"><p class="mx-unname">' + esc(u.n) + '</p><p class="note">' + esc(u.why) + '</p>' +
      '<div class="row"><button type="button" class="btn sm" data-un="' + esc(id) + '" data-take="1">' + esc(u.on) + '</button>' +
      '<button type="button" class="btn sm" data-un="' + esc(id) + '" data-take="0">' + esc(u.off) + '</button>' +
      '<button type="button" class="btn sm" data-un="' + esc(id) + '" data-take="">Both ways</button></div></div>';
  }).join('');
  return '<div class="panel buildsum mx">' +
    '<div class="bs-hd"><h3>Worked out here</h3><span class="card-sub">' +
      esc(b.asc || b.cls) + ' · level ' + b.level + (m ? ' · against a level ' + m.level + ' monster' : '') +
    '</span></div>' +
    '<div class="row mx-lvl"><label class="lbl" for="mxlvl">Monster level</label>' +
      '<input class="field sm" id="mxlvl" type="number" min="1" max="' + GAME.monsters.rows.length + '" value="' + level + '">' +
      (m ? '<span class="note">' + fmt(m.life) + ' life · ' + fmt(m.armour) + ' armour · ' + fmt(m.evasion) + ' evasion · hits for ' + fmt(m.damage) + '</span>' : '') +
    '</div>' +
    '<dl class="bs-grid">' +
      row('Life', A.life) + row('Energy Shield', A.es) + row('Armour', A.armour) + row('Evasion', A.evasion) +
      row('Strength', A.str) + row('Dexterity', A.dex) + row('Intelligence', A.int) +
      M.TYPES.map(t => row('Biggest ' + t + ' hit', A.hits[t])).join('') +
      (m ? row('Hits from it you stand', stands(A, m)) : '') +
      (A.dps ? row('Damage a second into it', intoIt(A, m), 'with ' + (A.one.dps.weapon || 'the weapon')) : '') +
    '</dl>' +
    (A.dps ? '' : '<p class="note">The damage comes off the skill gem, and a gem’s own base damage is not in this page’s data. The defences above are.</p>') +
    (widened.length ? '<p class="mx-wide">Widened by: ' + esc(widened.join('; ')) + '</p>' : '') +
    (switches ? '<div class="mx-uns">' + switches + '</div>' : '') +
    '<p class="note">' + A.unread + ' lines are not in these numbers. ' + A.named +
      ' more name a mechanic this version does not count: damage over time, ailments, minions, totems, ' +
      'triggers, leech, recoup, regeneration, stun, duration and area.</p>' +
    '<p class="note">' + esc(M.SOURCE.order) + ' ' + esc(M.SOURCE.monster) + ' ' + esc(M.BASE_SOURCE) + '</p>' +
  '</div>';
}
/* The controls. Every one of them redraws the numbers off the same engine, so nothing on screen is a second
   copy of a rule. */
function wireMaths(host, b){
  const set = {};
  let level = b.level;
  const draw = () => {
    const t0 = performance.now();
    const A = answer(b, set);
    const worked = performance.now() - t0;
    host.innerHTML = mathsHTML(b, A, level);
    const took = performance.now() - t0;
    // what one evaluation costs on the machine it is running on, measured rather than assumed
    host.dataset.answer = (worked / Math.max(1, A.corners.length)).toFixed(3);
    host.dataset.corners = String(A.corners.length);
    const box = $('#mxlvl', host);
    if(box){
      box.addEventListener('input', () => { level = Math.max(1, Math.min(GAME.monsters.rows.length, Number(box.value) || 1)); draw(); });
      box.focus({preventScroll: true});
    }
    for(const btn of host.querySelectorAll('[data-un]')) btn.addEventListener('click', () => {
      const id = btn.dataset.un;
      if(btn.dataset.take === '') delete set[id]; else set[id] = btn.dataset.take === '1';
      draw();
    });
    host.dataset.took = took.toFixed(3);
  };
  draw();
}

/* ---------- 3c. what is still open ----------
   What the build has not spent, and every number in it the game's own. An item class holds so many
   prefixes and so many suffixes and takes so many augment sockets (data/craft.json, tools/craft.py, read
   through assets/basepool.js the way the Trade page and the bench read it); a base's own implicit moves a
   cap and says so on the item, so that line is read off the item rather than assumed.

   The supports a skill still has room for are assets/maths.js's `socketsLeft`, and the two numbers behind
   it are named where they are shown (M.SOURCE.sockets) because the export states neither.

   Passive points unspent is a floor, not a figure: levelling gives one point per level and quest points
   come on top of that, so it is only ever said where the tree holds fewer passives than levelling alone
   has already given. */
const ALLOW = /^([+-]\d+) (Prefix|Suffix) Modifier allowed$/;
const SEALED = f => /Corrupt|Mirrored/.test(f);
function affixRoom(x, cl){
  if(!/^(RARE|MAGIC)$/.test(x.rarity) || x.flags.some(SEALED)) return 0;
  const mx = cl && cl.mx ? cl.mx : [3, 3];
  const room = x.rarity === 'MAGIC' ? [1, 1] : [mx[0], mx[1]];
  for(const l of x.mods){
    const m = l.match(ALLOW);
    if(m) room[m[2] === 'Prefix' ? 0 : 1] += +m[1];
  }
  const cap = Math.max(0, room[0]) + Math.max(0, room[1]);
  return Math.max(0, cap - Math.max(0, x.mods.length - x.implicits));
}
async function stillOpen(b){
  const rows = [], list = [];
  for(const x of b.items) list.push([x, await classFor({k: 'base', v: x.base}).catch(() => null)]);
  for(const n of b.empty) rows.push([n, 'empty']);
  for(const [x, cl] of list){
    const bits = [], a = affixRoom(x, cl);
    // the sockets the item itself declares where it declares any — a unique carries its own number — and
    // otherwise what its item class comes with
    const all = x.sockets || (cl && cl.so) || 0;
    const sock = Math.max(0, all - x.runes.length);
    if(a) bits.push(a + (a === 1 ? ' affix' : ' affixes'));
    if(sock) bits.push(sock + (sock === 1 ? ' socket' : ' sockets'));
    if(bits.length) rows.push([x.slot + (x.name && x.name !== x.base ? ' · ' + x.name : ''), bits.join(' · ')]);
  }
  const free = Math.max(0, (b.level - 1) - b.nodes.length);
  if(free) rows.push(['Passives', free + ' unspent']);
  if(!b.asc) rows.push(['Ascendancy', 'none taken']);
  if(b.gems.length){
    const s = M.socketsLeft(b.gems);
    rows.push(['Supports', s.over ? s.held + ', ' + s.over + ' over' : s.held + ' of ' + s.room]);
  }
  return rows;
}
function openHTML(rows){
  if(!rows.length) return '<div class="panel"><p class="note">Nothing open. Every slot is filled and every affix is chosen.</p></div>';
  return '<div class="panel"><dl class="bs-grid">' +
    rows.map(([k, v]) => '<div><dt>' + esc(k) + '</dt><dd>' + esc(v) + '</dd></div>').join('') +
    '</dl><p class="note" style="margin-top:10px">Affix caps and augment sockets come from the item class. ' +
    'Levelling gives one passive point, and quest points come on top. ' + esc(M.SOURCE.sockets) + '</p></div>';
}

/* ---------- 4. what to buy, priced live ---------- */
const ARMOUR_SLOTS = /^(Armour|Body Armour|Helmet|Gloves|Boots|Shield|Buckler|Shield or Buckler|All)$/;
const ATTACK_SLOTS = /^(Martial Weapon|Martial Or Caster Weapon|Martial Weapon Wand or Staff|All)$/;
const SPELL_SLOTS = /^(Wand or Staff|Caster Weapon|Martial Or Caster Weapon|Martial Weapon Wand or Staff|Wand|Staff|All)$/;
let AUG = null;
function augments(){   // every priced rune and soul core, with its effect per kind of item
  if(AUG) return AUG;
  AUG = [];
  for(const it of D.index.items){
    if(it.k !== 'c') continue;
    const m = D.market.items['c:' + it.id];
    if(!m || !/Runes|Soul Cores|Idols/.test(m.cat) || !it.t) continue;
    const slots = it.t.split(' — ').map(seg => {
      const i = seg.indexOf(': ');
      return i < 0 ? null : {slot: seg.slice(0, i), lines: seg.slice(i + 2).split(' · ')};
    }).filter(Boolean);
    AUG.push({it, m, slots});
  }
  return AUG;
}
/* best rune for a stat: most of the stat per divine among runes that actually trade */
function bestRune(slotRe, lineRe, want = 1){
  let best = null;
  for(const a of augments()){
    if((a.m.vol ?? 0) < 0.5 || !a.m.v) continue;
    for(const s of a.slots){
      if(!slotRe.test(s.slot)) continue;
      for(const l of s.lines){
        const m = l.match(lineRe);
        if(!m) continue;
        const val = +m[1];
        const n = Math.max(1, Math.ceil(want / val));
        const cost = n * a.m.v;
        if(!best || cost < best.cost || (cost === best.cost && val > best.val)) best = {a, line: l, slot: s.slot, val, n, cost};
      }
    }
  }
  return best;
}
function c(name){ const it = D.byKey.get('c:' + name), m = D.market.items['c:' + name]; return it && m ? {it, m} : null; }

function recommend(b, A){
  const recs = [];
  const bonus = side => side === A.priority ? 30 : 0;
  for(const x of A.issues){
    if(x.kind === 'res'){
      const all = x.el !== 'Chaos' ? bestRune(ARMOUR_SLOTS, /\+(\d+)% to all Elemental Resistances/, x.gap) : null;
      const one = bestRune(ARMOUR_SLOTS, new RegExp('\\+(\\d+)% to ' + x.el + ' Resistance'), x.gap);
      const r = [one, all].filter(Boolean).sort((p, q) => p.cost - q.cost)[0];
      if(r) recs.push({sev: x.sev + bonus('def'), it: r.a.it, why: x.text + '. Each ' + slotWord(r.slot) + ' socket with this adds ' + r.line + '.',
        invest: {label: r.n > 1 ? 'Cost for ' + r.n : 'Cost', div: r.cost}});
    }
    if(x.kind === 'attr') recs.push({sev: x.sev + bonus('def'), info: x.text});
    if(x.kind === 'hit'){
      const r = A.es ? bestRune(ARMOUR_SLOTS, /(\d+)% increased maximum Energy Shield/, 1) || bestRune(ARMOUR_SLOTS, /\+(\d+) to maximum Energy Shield/, 1)
                     : bestRune(ARMOUR_SLOTS, /\+(\d+) to maximum Life/, 1);
      if(r) recs.push({sev: x.sev + bonus('def'), it: r.a.it, why: x.text + '. More ' + (A.es ? 'Energy Shield' : 'Life') + ' helps. Each ' + slotWord(r.slot) + ' socket with this adds ' + r.line + '.', invest: {label: 'Cost each', div: r.a.m.v}});
    }
    if(x.kind === 'dps'){
      const tags = (gemEntry(b.gems[0]) || {}).tags || [];
      const el = ['Fire', 'Cold', 'Lightning', 'Chaos', 'Physical'].find(e => tags.includes(e));
      let r = null;
      if(tags.includes('Minion')) r = bestRune(/./, /^Minions deal (\d+)% increased Damage$/, 1)
        || bestRune(/./, /^Minions gain (\d+)% of their Physical Damage as Extra \w+ Damage$/, 1)
        || bestRune(/./, /^Minions have (\d+)% increased Attack and Cast Speed$/, 1);
      else if(tags.includes('Spell')) r = (el && bestRune(SPELL_SLOTS, new RegExp('Gain (\\d+)% of Damage as Extra ' + el + ' Damage'), 1)) || bestRune(SPELL_SLOTS, /(\d+)% increased Spell Damage/, 1);
      else r = (el && el !== 'Physical' && bestRune(ATTACK_SLOTS, new RegExp('Adds (\\d+) to \\d+ ' + el + ' Damage'), 1)) || bestRune(ATTACK_SLOTS, /(\d+)% increased Physical Damage/, 1);
      if(r) recs.push({sev: x.sev + bonus('off'), it: r.a.it, why: x.text + '. Each ' + slotWord(r.slot) + ' socket with this adds ' + r.line + '.',
        invest: {label: 'Cost each', div: r.a.m.v}});
    }
  }
  // the main skill: a higher gem level is often the cheapest damage there is
  const g = b.gems[0];
  if(g && !(gemEntry(g) || {}).sup && g.level < 20){
    const ug = c(/Spirit/.test(((gemEntry(g) || {}).s) || '') ? 'Uncut Spirit Gem (Level 20)' : 'Uncut Skill Gem (Level 20)');
    if(ug) recs.push({sev: 55 + (20 - g.level) * 2 + bonus('off'), it: ug.it,
      why: g.name + ' is level ' + g.level + '. Level 20 hits harder.', invest: {label: 'Cost', div: ug.m.v}});
  }
  if(g && g.quality < 20){
    const pr = c("Gemcutter's Prism");
    if(pr) recs.push({sev: 25 + bonus('off'), it: pr.it, why: g.name + ' has ' + g.quality + '% quality. Quality makes it stronger.',
      invest: {label: 'Cost each', div: pr.m.v}});
  }
  // timing: the crafting orbs that moved most this week
  const CRAFT = ['Exalted Orb', 'Greater Exalted Orb', 'Perfect Exalted Orb', 'Chaos Orb', 'Greater Chaos Orb', 'Orb of Annulment', 'Vaal Orb', 'Divine Orb'];
  const moves = CRAFT.map(c).filter(x => x && (x.m.vol ?? 0) >= 50 && Math.abs(x.m.ch ?? 0) >= 10)
    .sort((p, q) => Math.abs(q.m.ch) - Math.abs(p.m.ch)).slice(0, 2);
  for(const x of moves) recs.push({sev: 15, it: x.it, timing: true,
    why: x.m.ch < 0 ? 'Down ' + Math.round(-x.m.ch) + '% this week. Good time to stock up for crafting.'
                    : 'Up ' + Math.round(x.m.ch) + '% this week. Buy soon, or sell spares.',
    invest: {label: 'Price now', div: x.m.v}});
  recs.sort((p, q) => q.sev - p.sev);
  return recs;
}
function slotWord(s){ return s === 'All' ? 'item' : s === 'Armour' ? 'armour' : s.toLowerCase(); }
function gemEntry(g){
  if(!g) return null;
  const n = g.name.toLowerCase();
  return D.index.items.find(it => it.k === 'g' && it._nl === n) || null;
}

/* ---------- 4b. Build it ----------
   Every piece of the build, what the market asks for it today, and the total of the ones it prices.

   A price is the in-game Currency Exchange or a live trade listing and nothing else (worker/prices.js), so
   a piece the market does not price today carries no number at all — and a rare carries none ever, because
   a rare is not a listed item. The total is the sum of what is priced and says so beside itself, rather
   than a figure that quietly leaves the rest out (docs/proposal-builder.md, "Why the budget is not money").

   Nothing here is new furniture. A piece is a card, its price line is the card's own, its price action is
   the chart every card draws (app.js detailExtras), Trade is the trade panel the popup already opens on an
   item's own lines (assets/trade.js), and Bench is the crafting bench opened on the base
   (assets/craftsim.js). */
let BILL = new Map();
function pieces(b){
  const out = [];
  for(const x of b.items){
    const uq = /^(UNIQUE|RELIC)$/.test(x.rarity) ? uniqueEntry(x) : null;
    if(uq) out.push({key: 'p:' + x.slot + ':' + uq.id, it: uq, px: priceOf(uq), slot: x.slot, href: hrefOf(uq)});
    else out.push({key: 'p:' + x.slot + ':' + out.length, it: gearItem(x), px: null, slot: x.slot, base: x.base, own: true});
    x.runes.forEach((r, i) => {
      const c = D.byKey.get('c:' + r);
      if(c) out.push({key: 'p:' + x.slot + ':' + i + ':' + r, it: c, px: priceOf(c), slot: x.slot + ' socket', href: hrefFor(c)});
    });
  }
  for(const g of b.gems){
    const c = D.byKey.get('c:' + g.name);
    if(c) out.push({key: 'p:gem:' + g.name, it: c, px: priceOf(c), slot: g.support ? 'Support' : 'Main skill', href: hrefFor(c)});
  }
  for(const p of out) p.bench = !!(p.own && p.base && D.byKey.get('b:' + p.base));
  return out;
}
const paid = px => px && px.v !== null && px.v !== undefined && isFinite(px.v);
function billHTML(list){
  const has = list.filter(p => paid(p.px)), total = has.reduce((n, p) => n + p.px.v, 0);
  const own = list.filter(p => p.own).length, blank = list.length - has.length - own;
  const K = D.market || {};
  const said = ['Prices are the Currency Exchange and live trade listings.',
    own ? own + (own === 1 ? ' piece is one of yours: ' : ' pieces are your own: ') +
      'the market lists no rare and no magic item, so they carry no price.' : '',
    blank ? blank + (blank === 1 ? ' piece has no listing today.' : ' pieces have no listing today.') : ''].filter(Boolean).join(' ');
  return '<div class="panel buildsum">' +
    '<div class="bs-hd"><h3>Build it</h3><span class="card-sub">' + esc(K.league || 'Standard') +
      (K.updated ? ' · ' + esc(ago(K.updated)) : '') + '</span></div>' +
    '<dl class="bs-grid">' +
      '<div><dt>Total</dt><dd>' + (has.length ? moneyHTML(total) : '—') + '</dd></div>' +
      '<div><dt>Priced</dt><dd>' + has.length + ' of ' + list.length + '</dd></div>' +
      '<div><dt>Pieces</dt><dd>' + list.length + '</dd></div>' +
    '</dl><p class="note">' + esc(said) + '</p></div>' +
    '<div class="cards" id="bill"></div>';
}
function billCard(p){
  const go = '<div class="row" style="margin-top:9px">' +
    '<button type="button" class="btn" data-bill="trade">Trade</button>' +
    (p.bench ? '<button type="button" class="btn" data-bill="bench">Crafting bench</button>' : '') + '</div>';
  return card(p.it, {price: p.px || null, kind: p.slot, href: p.href || null, builds: false,
    invest: paid(p.px) ? {label: 'Price now', div: p.px.v}
      : {label: 'Price now', note: p.own ? 'not a listed item' : 'no price today'},
    extra: go + detailExtras(p.it, p.px)});
}
/* The piece's own card, with the trade panel already open on it: the panel turns the item's own lines into
   the search the trade site reads, so the link a player follows is built from the item and from nothing
   written here. */
function openTrade(p){
  openDetail(p.it, {price: p.px || null, kind: p.slot, builds: false}, p.href || null);
  const tb = document.querySelector('.ov-go .ttoggle');
  if(tb && tb.getAttribute('aria-expanded') !== 'true') tb.click();
}
async function openCraft(p){
  const base = D.byKey.get('b:' + p.base);
  if(!base) return;
  const m = await import('./craftsim.js').catch(() => null);
  if(m) m.openBench(base);
}
function buildIt(b, host){
  const list = pieces(b);
  BILL = new Map(list.map(p => [p.key, p]));
  if(!list.length){
    host.innerHTML = '<div class="panel" style="margin-top:14px"><p class="note">No gear in this build. There is nothing to price.</p></div>';
    return;
  }
  host.innerHTML = billHTML(list);
  const grid = $('#bill', host);
  flow(grid, list, billCard);
  grid.addEventListener('click', e => {
    const btn = e.target.closest('[data-bill]');
    if(!btn) return;
    const p = BILL.get((btn.closest('[data-key]') || {dataset: {}}).dataset.key);
    if(!p) return;
    if(btn.dataset.bill === 'trade') openTrade(p); else openCraft(p);
  });
}

/* ---------- 5. a guide somebody else wrote ----------
   Linked where it helps a player, named where it is shown, never ours. The list is data/guides.json
   (tools/guides.py), which reads every address on every publish, so a link that rots is a fault with its own
   name in data/faults.json and never a dead link sitting here quietly. Another guide is one entry in that
   tool and no code here. */
async function guides(el){
  let list = [];
  try { list = ((await (await fetch('data/guides.json')).json()) || {}).guides || []; } catch {}
  const box = $('#pobguide', el);
  if(!box || !list.length) return;
  box.innerHTML = list.map(g => '<p class="note guide">Still levelling? <a href="' + esc(g.url) +
    '" target="_blank" rel="noopener">' + esc(g.what) + ' ↗</a> — ' + esc(g.name) + ', by ' + esc(g.by) + '.</p>').join('');
}

/* ---------- 6. the page ---------- */
let EL, LAST = null;
export function mount(el){
  EL = el;
  el.innerHTML =
    '<div class="pagehd"><h2>Build</h2><p>Paste your Path of Building code. See what to fix first and what to buy next, at today\'s prices.</p></div>' +
    '<div class="panel"><label class="lbl" for="pob">Path of Building code</label>' +
      '<textarea class="field" id="pob" spellcheck="false" placeholder="Paste a Path of Building code or a build link"></textarea>' +
      '<div class="row" style="margin-top:10px"><button type="button" class="btn primary" id="pobgo">Read build</button>' +
      '<span class="note" id="pobmsg">A code, or a pobb.in / poe.ninja / maxroll / mobalytics link.</span></div></div>' +
    '<div id="pobguide"></div>' +
    '<div id="pobout"></div>';
  guides(el);                                  // one line under the box, for a character that is not there yet
  const go = () => run($('#pob', el).value);
  $('#pobgo', el).addEventListener('click', go);
  $('#pob', el).addEventListener('paste', () => setTimeout(go, 0));
  try { const last = sessionStorage.getItem('wi.pob'); if(last){ $('#pob', el).value = last; go(); } } catch {}
  return {};
}

async function run(code){
  const out = $('#pobout', EL), msg = $('#pobmsg', EL);
  if(!code.trim()) return;
  msg.textContent = 'Reading…'; msg.className = 'note';
  let b;
  try { b = read(await decode(code)); }
  catch(e){ msg.textContent = e.message; msg.className = 'err'; out.innerHTML = ''; return; }
  try { sessionStorage.setItem('wi.pob', code.trim()); } catch {}
  msg.textContent = ''; msg.className = 'note';
  const A = assess(b);
  const recs = D.market ? recommend(b, A) : [];
  out.innerHTML = summaryHTML(b, A) +
    '<div id="mxout"></div>' +
    '<div class="sect"><h3>Still open</h3><p>What this build has not spent yet.</p></div>' +
    '<div id="popen"></div><div id="pobopt"></div>' +
    '<div class="row" style="margin:14px 0 0"><button type="button" class="btn primary" id="pobbuild">Build it</button>' +
      '<span class="note">Every piece priced, and where to get it.</span></div>' +
    '<div id="pobbill"></div>' +
    '<div class="sect"><h3>Buy next</h3><p>Best first. Prices are live.</p></div>' +
    '<div class="cards" id="recs"></div>' +
    '<div class="sect"><h3>Your gear</h3><p>What it\'s worth today.</p></div><div class="cards" id="gear"></div>' +
    '<div class="sect"><h3>Main skill</h3><p>And its supports.</p></div><div class="cards" id="gems"></div>' +
    '<p class="note" style="margin-top:18px">Stats come from Path of Building. Goals at level ' + b.level + ': ' + short(A.t.dps) +
    ' damage per second, and surviving a ' + A.t.hit.toLocaleString() + ' hit.</p>';

  // our own numbers, off assets/maths.js. The two files it needs come down once and stay for the session,
  // and the panel draws only once they are in, so the first paint above never waits on them.
  mathsData().then(ok => { const host = $('#mxout', out); if(ok && host) wireMaths(host, b); });

  const recCards = recs.filter(r => r.it).map((r, i) => ({key: 'rec:' + i + ':' + r.it.id, r}));
  const info = recs.filter(r => r.info);
  const rg = $('#recs', out);
  flow(rg, recCards, x => card(x.r.it, {rank: recCards.indexOf(x) + 1, why: x.r.why, invest: x.r.invest, href: hrefFor(x.r.it), builds: false}));
  info.forEach(r => rg.insertAdjacentHTML('afterbegin', '<article class="card k-b"><span class="card-rank">!</span><p class="card-why">' + esc(r.info) +
    '</p><p class="note">Fix it with passives or gear.</p></article>'));
  if(!recs.length) rg.innerHTML = '<p class="note">Nothing stands out. This build meets every target for its level.</p>';

  flow($('#gear', out), b.items.map((x, i) => ({key: 'gear:' + i, x})), g => gearCard(g.x));
  flow($('#gems', out), b.gems.map((g, i) => ({key: 'gem:' + i, g, main: i === 0})), x => gemCard(x.g, x.main));

  const bill = $('#pobbill', out);
  $('#pobbuild', out).addEventListener('click', () => buildIt(b, bill));
  // what is still open needs the item classes' own file, so it lands a moment later. A second code read
  // while it is in the air wins: only the build on screen writes into the box.
  const mine = LAST = {};
  stillOpen(b).then(rows => {
    if(LAST !== mine) return;
    const box = $('#popen', out);
    if(box) box.innerHTML = openHTML(rows);
    optimise(b, A, rows);
  }, () => {});
}
/* The pass that aims a build at offence, defence or neutral is its own module. Where it ships it is handed
   the build, what the numbers said about it and what is still open, and it draws its own control in the
   box left for it; where it does not, the page stands without one and nothing here knows how it works. */
let OPT;
async function optimise(b, A, open){
  const host = $('#pobopt', EL);
  if(!host) return;
  if(OPT === undefined) OPT = import('./optimise.js').catch(() => null);
  const m = await OPT;
  if(m && m.mount) try { m.mount(host, {build: b, assess: A, open}); } catch {}
}
function hrefFor(it){ return it.k === 'c' ? '#/currency?c=' + encodeURIComponent(it.id) : undefined; }

function summaryHTML(b, A){
  const p = b.player, fmt = v => v === null || v === undefined ? '—' : Math.round(v).toLocaleString();
  const res = ELEM.map(([k, n]) => [n, p[k]]).concat([['Chaos', p.ChaosResist]]);
  const verdict = A.noStats ? 'No stats in this code. Open it in Path of Building, then export it again.'
    : A.onTrack ? 'Looking good for level ' + b.level + '. Spend on damage next.'
    : (A.priority === 'def' ? 'Defense first.' : 'Offense first.') + ' ' + A.issues.filter(x => x.side === A.priority).slice(0, 2).map(x => x.text).join('. ') + '.';
  return '<div class="panel buildsum">' +
    '<div class="bs-hd"><h3>' + esc(b.asc || b.cls || 'Build') + '</h3><span class="card-sub">' + esc(b.cls) + ' · level ' + b.level +
      (b.gems[0] ? ' · ' + esc(b.gems[0].name) : '') + '</span></div>' +
    '<p class="verdict ' + (A.onTrack ? 'ok' : A.priority) + '">' + esc(verdict) + '</p>' +
    '<dl class="bs-grid">' +
      '<div><dt>Damage per second' + (A.minionDps ? ' (minions)' : '') + '</dt><dd>' + (A.dps ? short(A.dps) : '—') + '</dd></div>' +
      '<div><dt>Life</dt><dd>' + fmt(p.Life) + '</dd></div><div><dt>Energy Shield</dt><dd>' + fmt(p.EnergyShield) + '</dd></div>' +
      '<div><dt>Biggest hit you can take</dt><dd>' + (A.hit ? fmt(A.hit.v) + ' <small>' + A.hit.el.toLowerCase() + '</small>' : '—') + '</dd></div>' +
      res.map(([n, v]) => '<div><dt>' + n + ' res</dt><dd class="' + (v !== undefined && v !== null && v < (n === 'Chaos' ? 0 : 75) ? 'down' : '') + '">' +
        (v === undefined || v === null ? '—' : v + '%') + '</dd></div>').join('') +
      (p.SpiritUnreserved !== undefined && p.SpiritUnreserved !== null && p.SpiritUnreserved < 0
        ? '<div><dt>Spirit</dt><dd class="down">' + p.SpiritUnreserved + ' over</dd></div>' : '') +
    '</dl></div>';
}

/* A piece of gear the index has no card for — a rare, a magic item — as a card of its own: its base, its
   slot, the lines it carries and how many of them are implicits, which is what tells the trade panel an
   implicit from a modifier when it turns those lines into a search. */
function gearItem(x){
  return {k: 'b', id: x.slot, n: x.name || x.base, s: (x.base !== x.name ? x.base + ' · ' : '') + x.slot,
    ls: x.mods, ...(x.implicits ? {ni: x.implicits} : {}), ...(x.base !== x.name ? {base: x.base} : {}),
    rq: x.lv ? [x.lv, 0, 0, 0] : undefined, cor: x.flags.some(f => /Corrupt/.test(f)) ? 1 : 0};
}
function uniqueEntry(x){
  const n = x.name.toLowerCase();
  const cands = D.index.items.filter(it => it.k === 'u' && it._nl === n);
  return cands.find(it => (it.s || '').startsWith(x.base)) || cands[0] || null;
}
function gearCard(x){
  if(x.rarity === 'UNIQUE' || x.rarity === 'RELIC'){
    const it = uniqueEntry(x);
    if(it){
      const px = D.market && (D.market.items['u:' + it.id] || D.market.items['u:' + x.name + ' | ' + x.base] || D.market.items['u:' + it.n]);
      const why = !px ? 'No price right now.' : (px.ch ?? 0) <= -15 ? 'Down ' + Math.round(-px.ch) + '% this week. Sell soon if you\'re swapping it.'
        : (px.ch ?? 0) >= 15 ? 'Up ' + Math.round(px.ch) + '% this week.' : 'Steady this week.';
      return card(it, {price: px || null, why, kind: x.slot, invest: px ? {label: 'Worth now', div: px.v} : undefined});
    }
  }
  const it = gearItem(x);
  const runes = x.runes.length ? '<p class="card-facts">Sockets: ' + esc(x.runes.join(', ')) + '</p>' : '';
  return card(it, {href: null, builds: false, kind: x.slot, extra: runes,
    invest: {label: 'Market price', note: x.rarity === 'RARE' ? 'check trade' : x.rarity.toLowerCase()}});
}
function gemCard(g, main){
  const it = gemEntry(g);
  const px = D.market && D.market.items['c:' + g.name];   // lineage supports trade like currency
  const note = g.level + (g.quality ? ' · ' + g.quality + '% quality' : '');
  if(it) return card(it, {price: px || undefined, kind: main ? 'Main skill' : 'Support',
    invest: {label: it.w ? 'Gem level' : 'Level', note}});
  return card({k: 'g', id: g.name, n: g.name, s: g.support ? 'Support gem' : 'Skill gem'}, {href: null, builds: false, invest: {label: 'Gem level', note}});
}
