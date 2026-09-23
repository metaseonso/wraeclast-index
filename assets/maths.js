/* The character maths: effective HP and damage, worked out as a range, and nothing that draws or fetches.

   docs/build-maths.md states every rule below. This file is the only copy of them. Two things read it:

     assets/build.js         the Build tab, in a browser
     tools/dev/buildcheck.mjs  the check: coverage over every wording we ship, eight guards, and our
                             numbers against Path of Building's own, out of twelve committed build codes

   so what the check proves is what a player gets. It imports nothing, touches no network and draws
   nothing: the data is handed to it (useData) and every answer comes back as plain objects.

   Four rules run through all of it.

   One table, not a rule per wording. Every line off every source — an item, a passive, a gem — is turned
   into entries in one table: which stat, whether it is flat, increased or more, and the number. The maths
   then runs over the table and knows nothing about where a line came from. A line that is a behaviour
   rather than a number ("Projectiles Chain an additional time") has no place in the table, so it is refused
   and counted, never approximated.

   The order of operations is the one the mechanics cards print. STEPS below is that order, and
   tools/dev/buildcheck.mjs holds it against the cards themselves, so the two cannot drift.

   Official game data first. The order, the armour curve and the caps are on the mechanics cards with Path
   of Building named where a formula is theirs; SOURCE below carries the same naming to the screen.

   Every answer is two numbers and a reason. Where something is not settled the floor assumes it goes
   against you and the ceiling assumes it goes for you, and the answer names what widened it. A wording the
   table does not read never widens the range: it is left out of the count and named instead, because a
   range with a silent hole in it is worse than a stated hole. */

/* ---------- the order of operations ----------
   The same steps, in the same words, as the flowcharts on "How damage works" and "How defences work".
   tools/dev/buildcheck.mjs reads both out of the shipped cards and fails if either list moves. */
export const STEPS = {
  hit: ['Base damage', 'Added damage', 'Damage Conversion', 'Gained as extra damage',
        'Increased and reduced', 'More and less', 'Critical Hits'],
  arrives: ['Evasion', 'Block'],
  cuts: ['Armour', 'Resistances'],
  pools: ['Energy Shield', 'Mind Over Matter', 'Life'],
};

/* Where the numbers that are not a line on an item come from. Shown under the answer, word for word. */
export const SOURCE = {
  order: 'The order, the armour curve and the caps: the mechanics cards, which credit Path of Building for '
       + 'what the game leaves out.',
  monster: 'One monster of the level set here, out of the game’s own table.',
  sockets: 'A skill gem takes up to 5 supports, and a skill gem that casts another skill gem counts to 6 in '
         + 'total: the owner’s own knowledge of the game. The export states neither.',
};

/* How many gems go in a link.
   Neither number is in the game’s files; both are the owner’s own knowledge of the game, 23 September 2026,
   and SOURCE.sockets says so wherever a count is shown. */
export const SOCKETS = {supports: 5, chain: 6};
/* A group of gems, in the order the player put them: is it legal, and what is left?
   `gems` is [{name, support}]. A group with one skill in it may hold five supports. A group where one skill
   gem casts another counts both skills towards the six, so two skills leave four supports. */
export function socketsLeft(gems){
  const skills = gems.filter(g => !g.support).length || 1;
  const held = gems.filter(g => g.support).length;
  const room = Math.min(SOCKETS.supports, SOCKETS.chain - skills);
  return {room, held, over: Math.max(0, held - room), skills};
}

/* ---------- the damage types, and the pools ---------- */
export const TYPES = ['physical', 'fire', 'cold', 'lightning', 'chaos'];
const ELEMENTS = ['fire', 'cold', 'lightning'];
export const MAX_REDUCTION = 0.90;       // armour never takes more than this off a hit — the defences card
export const RES_DEFAULT = 75;           // the default maximum resistance — the resistances card
export const RES_CEILING = 90;           // and what a maximum can never pass

/* ---------- reading a line ----------
   The wording with its numbers taken out is the key, the way the Trade panel already matches a line to a
   trade modifier (`key()` in assets/trade.js). The same normalising, so a line that matches there matches
   here. */
const NUM = /[+-]?\(?[+-]?\d+(?:\.\d+)?(?:-[+-]?\d+(?:\.\d+)?)?\)?/g;
export function key(t){
  return t.replace(NUM, '#').replace(/\+#/g, '#').replace(/-#/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
}
/* The game writes a keyword inside its own brackets. A player never sees them and neither does the table. */
export const plain = t => String(t).replace(/\[([^\]|]+)\|([^\]]+)\]/g, '$2').replace(/\[([^\]]+)\]/g, '$1')
  .replace(/\{[^}]*\}/g, '').trim();
/* Every number on a line, as a floor and a ceiling. "Adds (4-6) to (7-10)" is two of them; a line the game
   prints as one number has a floor equal to its ceiling. `part` settles a roll the build already made. */
export function spans(t, part){
  return (String(t).match(NUM) || []).map(x => {
    const body = x.replace(/[()+]/g, '');
    const m = body.match(/^(-?\d+(?:\.\d+)?)-(-?\d+(?:\.\d+)?)$/);
    if(!m) return {lo: +body, hi: +body};
    const lo = +m[1], hi = +m[2];
    return part == null ? {lo, hi} : {lo: lo + (hi - lo) * part, hi: lo + (hi - lo) * part};
  });
}

/* ---------- the stat table ----------
   A few hundred wordings, written as the shapes the game writes them in rather than one row per wording:
   the noun is looked up, the shape says whether the number is flat, increased or more. Everything that is
   not one of these shapes is refused, counted and named.

   A line that only holds under a condition — "while you have Arcane Surge", "if you've been Hit recently" —
   is a behaviour and not a number, so it is refused with the rest. */
const NOUN = {
  'maximum life': 'life',
  'maximum energy shield': 'es', 'energy shield': 'es',
  'maximum mana': 'mana',
  'armour': 'armour', 'evasion rating': 'evasion',
  'strength': 'str', 'dexterity': 'dex', 'intelligence': 'int',
  'spirit': 'spirit', 'accuracy rating': 'accuracy', 'accuracy': 'accuracy',
  'attack speed': 'attackspeed', 'cast speed': 'castspeed',
  'critical hit chance': 'crit', 'critical hit chance for attacks': 'crit',
  'critical hit chance for spells': 'crit',
  'critical damage bonus': 'critdmg', 'critical spell damage bonus': 'critdmg',
  'block chance': 'block', 'chance to block': 'block',
};
/* The nouns that name a pair or a trio at once: one line, two or three stats. */
const PAIRS = {
  'armour and evasion rating': ['armour', 'evasion'],
  'armour and evasion': ['armour', 'evasion'],
  'armour and energy shield': ['armour', 'es'],
  'evasion and energy shield': ['evasion', 'es'],
  'evasion rating and energy shield': ['evasion', 'es'],
  'armour, evasion and energy shield': ['armour', 'evasion', 'es'],
  'armour, evasion rating and energy shield': ['armour', 'evasion', 'es'],
  'maximum life and maximum mana': ['life', 'mana'],
  'maximum life and mana': ['life', 'mana'],
  'attack and cast speed': ['attackspeed', 'castspeed'],
  'skill speed': ['attackspeed', 'castspeed'],
};
const ATTR = {strength: 'str', dexterity: 'dex', intelligence: 'int'};
/* Which damage a line names. "Damage" on its own is every type. */
const DAMAGE = {
  'damage': 'all', 'physical damage': 'physical', 'fire damage': 'fire', 'cold damage': 'cold',
  'lightning damage': 'lightning', 'chaos damage': 'chaos', 'elemental damage': 'elemental',
  'elemental damage with attacks': 'elemental', 'attack damage': 'attack', 'spell damage': 'spell',
  'melee damage': 'melee', 'projectile damage': 'projectile', 'area damage': 'area',
  'attack area damage': 'area', 'spell area damage': 'area',
};
/* What v1.0 names and does not count. Every one of these is a real wording about a real mechanic that is
   not in this version's list — damage over time, ailments, minions, totems, triggers, leech, recoup,
   regeneration, stun, movement, cost, rarity, duration, area, and what an item asks of you to equip it.
   A line that matches here is not a silent zero and it is not a gap in the table: it is named, and the card
   says which part of the build is not in the count. */
const OUTSIDE = [
  /minions?\b/, /\btotems?\b/, /\btraps?\b/, /\bmines\b/, /companions?\b/, /\ballies\b/,
  /over time|damage over time|degeneration/, /\bignite|\bburning\b|\bbleed|\bpoison|\bshock\b|\bfreeze|\bchill|\bailment/,
  /\bleech|recoup|regenerat|recovery|recharge|\brefill/, /\bstun\b|stun buildup|stun threshold|\bdaze/,
  /movement speed|light radius|rarity of items|quantity of items|\bgold\b/,
  /\bcost\b|cost efficiency|\breservation\b|\bspirit\b.*reserv/,
  /\bduration\b|cooldown|\bcharges? (gained|duration)/, /area of effect|presence area/,
  /attribute requirements|requirements? of/, /\bthorns?\b/, /deflection/, /\bcurse|\bmark\b|\bhex\b/,
  /\bflask|\bcharm/, /\bpierce|\bchain|\bfork|\bprojectiles? (chain|fork|pierce|split)/,
  /\bwarcry|\brage\b|\bfrenzy charge|\bpower charge|\bendurance charge/,
  /\bblock (recovery|chance is)|\bparry\b|\braise shield/, /\bknockback|\btaunt|\bmaim|\bhinder/,
  /\bmeta skills?\b|\btrigger|\binvocat/, /\bdodge\b|\bevade\b(?!.*rating)/,
  /\bbuff\b|\baura\b|\bpresence\b/, /\bexperience\b|\bcorrupt|\bsocket|\brune\b/,
];
/* A line that overrides a stat, removes one, or forbids something is not a modifier at all, so it can never
   be counted as a mechanic this version merely leaves out: it changes a number we do work out. Refused
   loudly, ahead of everything, and named. "Maximum Life is 1" and "Immune to Chaos Damage" are the two that
   a build meets most. */
const ABSOLUTE = /\bimmune to\b|^maximum [a-z ]+ is #|\bcannot\b|\bno longer\b|\bnever\b|\bis instead\b|\binstead of\b/;
export const outside = k => !ABSOLUTE.test(k) && OUTSIDE.some(re => re.test(k));

/* The table itself: one row per shape. Each row is a name, what the wording looks like once its numbers are
   out, and what to do with the numbers. `into` takes (stat, form, value) where form is 'flat', 'inc' or
   'more'. The count of rows is printed by the check on every run. */
export const TABLE = [
  ['flat to a stat', /^# to (.+)$/, (m, v, into) => {
    const s = NOUN[m[1]]; if(!s) return false; into(s, 'flat', v[0]); return true; }],
  ['flat to a pair', /^# to (.+)$/, (m, v, into) => {
    const p = PAIRS[m[1]]; if(!p) return false; for(const s of p) into(s, 'flat', v[0]); return true; }],
  ['increased or reduced a stat', /^#% (increased|reduced) (.+)$/, (m, v, into) => {
    const s = NOUN[m[2]]; if(!s) return false; into(s, 'inc', m[1] === 'reduced' ? -v[0] : v[0]); return true; }],
  ['increased or reduced a pair', /^#% (increased|reduced) (.+)$/, (m, v, into) => {
    const p = PAIRS[m[2]]; if(!p) return false;
    for(const s of p) into(s, 'inc', m[1] === 'reduced' ? -v[0] : v[0]); return true; }],
  ['more or less a stat', /^#% (more|less) (.+)$/, (m, v, into) => {
    const s = NOUN[m[2]]; if(!s) return false; into(s, 'more', m[1] === 'less' ? -v[0] : v[0]); return true; }],
  ['flat to an attribute', /^# to (strength|dexterity|intelligence)$/, (m, v, into) => {
    into(ATTR[m[1]], 'flat', v[0]); return true; }],
  ['flat to every attribute', /^# to all attributes$/, (m, v, into) => {
    for(const s of ['str', 'dex', 'int']) into(s, 'flat', v[0]); return true; }],
  /* The tree grants points a player puts where they like. Which attribute took them is not on the line, so
     it is the unknown named on the card and the thing that widens the range. */
  ['flat to an attribute not yet chosen', /^# to (any attribute|strength, dexterity or intelligence)$/, (m, v, into) => {
    into('anyattribute', 'flat', v[0]); return true; }],
  ['flat to two named attributes', /^# to (strength|dexterity|intelligence) and (strength|dexterity|intelligence)$/,
    (m, v, into) => { into(ATTR[m[1]], 'flat', v[0]); into(ATTR[m[2]], 'flat', v[0]); return true; }],
  ['a stat the game writes with a per cent sign', /^#% to (.+)$/, (m, v, into) => {
    const s = NOUN[m[1]]; if(!s) return false; into(s, 'flat', v[0]); return true; }],
  ['increased every attribute', /^#% (increased|reduced) attributes$/, (m, v, into) => {
    for(const s of ['str', 'dex', 'int']) into(s, 'inc', m[1] === 'reduced' ? -v[0] : v[0]); return true; }],
  ['flat to a resistance', /^#% to (fire|cold|lightning|chaos) resistance$/, (m, v, into) => {
    into('res.' + m[1], 'flat', v[0]); return true; }],
  ['flat to every elemental resistance', /^#% to all elemental resistances$/, (m, v, into) => {
    for(const e of ELEMENTS) into('res.' + e, 'flat', v[0]); return true; }],
  ['flat to two resistances at once', /^#% to (fire|cold|lightning|chaos) and (fire|cold|lightning|chaos) resistances$/,
    (m, v, into) => { into('res.' + m[1], 'flat', v[0]); into('res.' + m[2], 'flat', v[0]); return true; }],
  ['flat to a maximum resistance', /^#% to maximum (fire|cold|lightning|chaos) resistance$/, (m, v, into) => {
    into('resmax.' + m[1], 'flat', v[0]); return true; }],
  ['flat to every maximum resistance', /^#% to (all )?maximum (elemental )?resistances$/, (m, v, into) => {
    for(const e of [...ELEMENTS, 'chaos']) into('resmax.' + e, 'flat', v[0]); return true; }],
  ['added damage', /^adds # to # (physical|fire|cold|lightning|chaos) damage(?: to (?:attacks|spells))?$/,
    (m, v, into) => { into('add.' + m[1], 'flat', (v[0] + v[1]) / 2); return true; }],
  ['increased or reduced damage', /^#% (increased|reduced) (.+)$/, (m, v, into) => {
    const d = DAMAGE[m[2]]; if(!d) return false;
    into('dmg.' + d, 'inc', m[1] === 'reduced' ? -v[0] : v[0]); return true; }],
  ['more or less damage', /^#% (more|less) (.+)$/, (m, v, into) => {
    const d = DAMAGE[m[2]]; if(!d) return false;
    into('dmg.' + d, 'more', m[1] === 'less' ? -v[0] : v[0]); return true; }],
  ['conversion', /^#% of (physical|fire|cold|lightning) damage converted to (fire|cold|lightning|chaos) damage$/,
    (m, v, into) => { into('conv.' + m[1] + '.' + m[2], 'flat', v[0]); return true; }],
  ['gained as extra damage', /^gains? #% of (?:your )?(physical|fire|cold|lightning|) ?damage as extra (fire|cold|lightning|chaos) damage$/,
    (m, v, into) => { into('gain.' + (m[1] || 'all') + '.' + m[2], 'flat', v[0]); return true; }],
  ['penetration', /^damage penetrates #% (?:of enemy )?(fire|cold|lightning|chaos|elemental) resistances?$/, (m, v, into) => {
    for(const e of m[1] === 'elemental' ? ELEMENTS : [m[1]]) into('pen.' + e, 'flat', v[0]); return true; }],
  ['a level of skills', /^# to level of all (.+) skills$/, (m, v, into) => {
    into('level.' + m[1].replace(/\s+/g, ''), 'flat', v[0]); return true; }],
  ['a maximum charge', /^# to maximum (power|frenzy|endurance) charges$/, (m, v, into) => {
    into('charge.' + m[1], 'flat', v[0]); return true; }],
  ['block', /^#% (?:chance to )?block$/, (m, v, into) => { into('block', 'flat', v[0]); return true; }],
  ['a maximum block chance', /^# to maximum block chance$/, (m, v, into) => {
    into('blockmax', 'flat', v[0]); return true; }],
  /* A keystone that changes what an attribute is worth. It is a line with no number on it, which is why it
     is a row of its own rather than one of the shapes above. */
  ['strength grants half the life', /^inherent life granted by strength is halved$/, (m, v, into) => {
    into('halflifefromstrength', 'flat', 1); return true; }],
];

/* One line in, entries out. Returns true when the table read it, false when it did not — and a false is
   counted and named by whoever called, never quietly dropped. */
export function readLine(line, into){
  const t = plain(line);
  const k = key(t);
  if(!k) return 'read';
  const v = spans(t).map(s => (s.lo + s.hi) / 2);
  for(const [, re, run] of TABLE){
    const m = k.match(re);
    if(m && run(m, v, into)) return 'read';
  }
  return outside(k) ? 'outside' : 'unread';
}
/* Every line of a build at once. `lines` is [{text, local}] — a line marked local belongs to the item it is
   on and is already inside that item's own Armour, Evasion or Energy Shield, so it is read and dropped.

   Three ways out, never two. `read` is a number in the table. `outside` is a wording about a mechanic this
   version does not count — named on the card, and it cannot stand a stat down, because what it changes is
   not a stat we work out. `unread` is a wording nothing here knows, which stands down every stat its own
   words name, because the alternative is a silent zero. */
export function read(lines){
  const stats = new Map();
  const unread = [], named = [];
  const into = (stat, form, value) => {
    const at = stats.get(stat) || {flat: 0, inc: 0, more: 1};
    if(form === 'more') at.more *= 1 + value / 100; else at[form] += value;
    stats.set(stat, at);
  };
  const nothing = () => {};
  let n = 0;
  for(const l of lines){
    const text = typeof l === 'string' ? l : l.text;
    for(const one of String(text).split('\n')){
      if(!one.trim()) continue;
      n++;
      const skip = typeof l === 'object' && l.local;
      const how = readLine(one, skip ? nothing : into);
      if(how === 'unread') unread.push(key(plain(one)));
      else if(how === 'outside') named.push(key(plain(one)));
    }
  }
  return {stats, unread, named, lines: n};
}
const at = (stats, k) => stats.get(k) || {flat: 0, inc: 0, more: 1};
const total = (stats, k, base = 0) => (base + at(stats, k).flat) * (1 + at(stats, k).inc / 100) * at(stats, k).more;

/* ---------- what is not settled ----------
   One row per thing the model meets and cannot settle. Each one says how it widens the answer and what the
   card prints beside it. The interaction map (#58) is not built; until it is, this short list is written
   here, in one place and not two. */
export const UNKNOWNS = [
  {id: 'anyattribute', n: 'which attribute the tree’s free points went to',
   why: 'The tree grants points a player puts into any attribute. The build does not say which.'},
  {id: 'mindovermatter', n: 'how much Mana stands in front of Life when the hit lands',
   why: 'Mind Over Matter takes damage from Mana before Life. What Mana is left at that moment is not a '
      + 'number a build carries.'},
  {id: 'unrolled', n: 'a modifier that has not been rolled yet',
   why: 'The floor takes the bottom of the range the game prints, the ceiling the top.'},
];
export const unknown = id => UNKNOWNS.find(u => u.id === id);

/* ---------- the maths ----------
   Each function below is one step of STEPS, in that order, and nothing else. They take plain numbers so the
   check can hold any one of them on its own. */

/* What a character is worth before a single line is read.

   The game's export gives a class its starting attributes and its unarmed hit (data/gamestats.json). What a
   level adds, and what Strength adds to Life, are not in anything the game publishes. Path of Building has
   both, and tools/dev/buildcheck.mjs holds the three numbers below against Path of Building's own answers
   on every committed build that carries no gear at all — where the only thing in the number is this. */
export const PER_LEVEL = {life: 12, mana: 4, accuracy: 6};
/* `lifeInc` is the one that needs saying out loud: every character carries 5% increased Life before a
   single passive is allocated. It sits on the node a class starts from, and our tree data carries that node
   with no lines on it, so the model holds the number here instead of reading it. */
export const BASE = {life: 36, lifeInc: 5, evasion: 7, critBonus: 100};
export const LIFE_PER_STRENGTH = 2;    // halved where a keystone says so, and the keystone says so in words
export const BASE_SOURCE = 'What a level adds to Life, what Strength adds to Life, and the Evasion and '
  + 'Critical Damage Bonus a character starts with: according to Path of Building’s own character maths. '
  + 'The game’s export states what a class starts with and not the step.';
export function baseLife(level, str, halved){
  return BASE.life + PER_LEVEL.life * level + (halved ? 1 : LIFE_PER_STRENGTH) * str;
}
export function baseMana(cls, level){ return cls.mana + PER_LEVEL.mana * level; }

// a hit you deal, the seven steps of STEPS.hit in that order
export function hit(m){
  const base = {};                                                    // 1. base damage
  for(const t of TYPES) base[t] = (m.base && m.base[t]) || 0;
  for(const t of TYPES) base[t] += at(m.stats, 'add.' + t).flat;      // 2. added damage
  const conv = {};                                                    // 3. conversion, capped out of a type
  for(const from of TYPES){
    let out = 0;
    for(const to of TYPES) out += at(m.stats, 'conv.' + from + '.' + to).flat;
    const scale = out > 100 ? 100 / out : 1;
    for(const to of TYPES){
      const part = at(m.stats, 'conv.' + from + '.' + to).flat * scale / 100;
      if(!part) continue;
      conv[to] = (conv[to] || 0) + base[from] * part;
      conv[from] = (conv[from] || 0) - base[from] * part;
    }
  }
  const after = {};
  for(const t of TYPES) after[t] = base[t] + (conv[t] || 0);
  const gained = {};                                                  // 4. gained as extra, never capped
  for(const from of TYPES) for(const to of TYPES){
    const part = at(m.stats, 'gain.' + from + '.' + to).flat;
    if(part) gained[to] = (gained[to] || 0) + after[from] * part / 100;
  }
  const out = {};
  let sum = 0;
  for(const t of TYPES){
    const raw = after[t] + (gained[t] || 0);
    if(!raw){ out[t] = 0; continue; }
    const inc = at(m.stats, 'dmg.all').inc + at(m.stats, 'dmg.' + t).inc
      + (ELEMENTS.includes(t) ? at(m.stats, 'dmg.elemental').inc : 0)
      + at(m.stats, 'dmg.' + (m.kind || 'attack')).inc;                // 5. one sum, applied once
    const more = at(m.stats, 'dmg.all').more * at(m.stats, 'dmg.' + t).more
      * (ELEMENTS.includes(t) ? at(m.stats, 'dmg.elemental').more : 1)
      * at(m.stats, 'dmg.' + (m.kind || 'attack')).more;              // 6. each more its own multiplier
    out[t] = raw * (1 + inc / 100) * more;
    sum += out[t];
  }
  const chance = Math.min(100, (m.crit || 0) * (1 + at(m.stats, 'crit').inc / 100)) / 100;
  const bonus = 1 + (m.critBonus == null ? 1 : m.critBonus) + at(m.stats, 'critdmg').inc / 100;
  const average = sum * (1 - chance) + sum * bonus * chance;          // 7. critical hits
  return {byType: out, sum, crit: chance, average};
}

// a hit you take: STEPS.arrives, then STEPS.cuts, then STEPS.pools
export function evadeChance(evasion, accuracy){
  if(!accuracy) return 0;
  const land = Math.max(0.05, accuracy / (accuracy + Math.pow(evasion / 4, 0.8)));
  return 1 - Math.min(1, land);
}
// the armour curve, word for word off the defences card: armour over armour plus ten times the hit
export function armourCut(armour, raw){
  if(raw <= 0) return 0;
  return Math.min(MAX_REDUCTION, armour / (armour + 10 * raw));
}
export function resCut(res, max){ return Math.min(res, Math.min(max, RES_CEILING)) / 100; }
/* What one hit of `raw` of type `t` takes off the pools. Armour and resistance are two multipliers on the
   same damage, so neither is before the other — the defences card, from Path of Building's own code. */
export function taken(raw, t, d){
  const cut = t === 'physical' ? armourCut(d.armour, raw) : 0;
  const res = t === 'physical' ? 0 : resCut((d.res[t] || 0) - (d.pen && d.pen[t] || 0), d.resmax[t] || RES_DEFAULT);
  return raw * (1 - cut) * (1 - res);
}
/* The biggest hit of a type the pools can still stand. Energy Shield first, then Mana under Mind Over
   Matter, then Life — STEPS.pools. Chaos removes twice the Energy Shield. */
export function maxHit(t, d){
  const pool = (t === 'chaos' ? d.es / 2 : d.es) + (d.mom ? Math.min(d.mana, d.mom) : 0) + d.life;
  if(pool <= 0) return 0;
  if(t !== 'physical'){
    const res = resCut((d.res[t] || 0), d.resmax[t] || RES_DEFAULT);
    return res >= 1 ? Infinity : pool / (1 - res);
  }
  /* Armour cuts less the bigger the hit, so the hit the pools just survive is where the two meet. With the
     curve off the defences card — armour over armour plus ten times the hit — that is one quadratic:
     10·raw² − 10·pool·raw − pool·armour = 0. Past the 90% cap the cut stops moving and it is a straight
     line again. */
  const a = d.armour || 0;
  const raw = (10 * pool + Math.sqrt(100 * pool * pool + 40 * pool * a)) / 20;
  const capped = pool / (1 - MAX_REDUCTION);
  return Math.min(raw, capped) === capped && armourCut(a, capped) >= MAX_REDUCTION ? capped : raw;
}

/* ---------- the answer ----------
   Two numbers and a reason. `corners` takes every unknown both ways: the floor is the corner where each one
   goes against you, the ceiling the corner where each goes for you. Three unknowns is eight corners. */
export function range(run, unknowns){
  const list = unknowns.filter(Boolean);
  if(!list.length){ const v = run({}); return {lo: v, hi: v, widened: []}; }
  let lo = Infinity, hi = -Infinity;
  for(let i = 0; i < (1 << list.length); i++){
    const take = {};
    list.forEach((u, k) => { take[u] = !!(i & (1 << k)); });
    const v = run(take);
    if(v < lo) lo = v;
    if(v > hi) hi = v;
  }
  return {lo, hi, widened: list};
}
/* What the card prints under a range. A range with no name beside it is a range from modifiers not rolled
   yet and nothing else. */
export function widenedBy(list){
  return list.map(id => (unknown(id) || {n: id}).n);
}
