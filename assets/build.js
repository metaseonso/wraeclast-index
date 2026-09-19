/* Build tab: paste a Path of Building code, get offense-or-defense priority and a ranked list of
   investments priced with live poe.ninja data. Runs in the browser.
   PoB is used only to READ the code. Item data and prices come from the game files and poe.ninja. */
import { D, $, esc, card, flow } from './app.js';

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
  const it = {rarity: '', name: '', base: '', mods: [], runes: [], flags: [], lv: 0};
  let i = 0, implicits = 0;
  const r = lines[i] && lines[i].match(/^Rarity: (\w+)/);
  if(r){ it.rarity = r[1]; i++; }
  if(/RARE|UNIQUE|RELIC/.test(it.rarity)){ it.name = lines[i++] || ''; it.base = lines[i++] || ''; }
  else { it.name = lines[i++] || ''; it.base = it.name; }
  for(; i < lines.length; i++){
    const l = lines[i].replace(/\{[^}]*\}/g, '').trim();
    let m;
    if((m = l.match(/^Rune: (.+)/))){ it.runes.push(m[1]); continue; }
    if((m = l.match(/^LevelReq: (\d+)/))){ it.lv = +m[1]; continue; }
    if((m = l.match(/^Implicits: (\d+)/))){ implicits = +m[1]; continue; }
    if(/^(Corrupted|Twice Corrupted|Mirrored|Sanctified)$/.test(l)){ it.flags.push(l); continue; }
    if((HEADER.test(l) && /^[A-Za-z ]+:/.test(l)) || /^Bonded:/.test(l) || /^Requires /.test(l)) continue;
    if(l) it.mods.push(l);
  }
  it.implicits = implicits;
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
  if(set) for(const s of set.querySelectorAll(':scope > Slot')){
    const name = s.getAttribute('name') || '', id = s.getAttribute('itemId');
    if(!id || id === '0' || !byId[id]) continue;
    if(/^Weapon \d$/.test(name) && swap) continue;
    if(/^Weapon \d Swap$/.test(name) && !swap) continue;
    if(/^(Flask|Charm) \d/.test(name) && s.getAttribute('active') === 'false') continue;
    b.items.push({slot: name.replace(/ Swap$/, ''), ...parseItem(byId[id])});
  }
  return b;
}

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
function c(name){ const it = D.byKey.get('c:' + name); return it ? {it, m: D.market.items['c:' + name]} : null; }

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

/* ---------- 5. the page ---------- */
let EL;
export function mount(el){
  EL = el;
  el.innerHTML =
    '<div class="pagehd"><h2>Build</h2><p>Paste your Path of Building code. See what to fix first and what to buy next, at today\'s prices.</p></div>' +
    '<div class="panel"><label class="lbl" for="pob">Path of Building code</label>' +
      '<textarea class="field" id="pob" spellcheck="false" placeholder="Paste a Path of Building code or a build link"></textarea>' +
      '<div class="row" style="margin-top:10px"><button type="button" class="btn primary" id="pobgo">Read build</button>' +
      '<span class="note" id="pobmsg">A code, or a pobb.in / poe.ninja / maxroll link.</span></div></div>' +
    '<div id="pobout"></div>';
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
    '<div class="sect"><h3>Buy next</h3><p>Best first. Prices are live.</p></div>' +
    '<div class="cards" id="recs"></div>' +
    '<div class="sect"><h3>Your gear</h3><p>What it\'s worth today.</p></div><div class="cards" id="gear"></div>' +
    '<div class="sect"><h3>Main skill</h3><p>And its supports.</p></div><div class="cards" id="gems"></div>' +
    '<p class="note" style="margin-top:18px">Stats come from Path of Building. Goals at level ' + b.level + ': ' + short(A.t.dps) +
    ' damage per second, and surviving a ' + A.t.hit.toLocaleString() + ' hit.</p>';

  const recCards = recs.filter(r => r.it).map((r, i) => ({key: 'rec:' + i + ':' + r.it.id, r}));
  const info = recs.filter(r => r.info);
  const rg = $('#recs', out);
  flow(rg, recCards, x => card(x.r.it, {rank: recCards.indexOf(x) + 1, why: x.r.why, invest: x.r.invest, href: hrefFor(x.r.it), builds: false}));
  info.forEach(r => rg.insertAdjacentHTML('afterbegin', '<article class="card k-b"><span class="card-rank">!</span><p class="card-why">' + esc(r.info) +
    '</p><p class="note">Fix it with passives or gear.</p></article>'));
  if(!recs.length) rg.innerHTML = '<p class="note">Nothing stands out. This build meets every target for its level.</p>';

  flow($('#gear', out), b.items.map((x, i) => ({key: 'gear:' + i, x})), g => gearCard(g.x));
  flow($('#gems', out), b.gems.map((g, i) => ({key: 'gem:' + i, g, main: i === 0})), x => gemCard(x.g, x.main));
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
  const it = {k: 'b', id: x.slot, n: x.name || x.base, s: (x.base !== x.name ? x.base + ' · ' : '') + x.slot,
    ls: x.mods, rq: x.lv ? [x.lv, 0, 0, 0] : undefined, cor: x.flags.some(f => /Corrupt/.test(f)) ? 1 : 0};
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
