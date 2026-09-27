/* What changed between two patches, proved on changes we made ourselves (tools/snapshot.py, tools/diff.py).

   Two parts.

   the rule   every data/changes/<patch>.json keeps to W1 (#96): every change names a card the index has, or
              one a patch marks removed; every card a patch added is one of those too; nothing a player reads
              in it is raw game code (a stat id, [Word|Word] markup, a {0} placeholder, a DNT marker); a
              removed card says "Removed in <that patch>". No Python, no network: the guard runs this part.

   the diff   the newest snapshot, copied twice into a temporary folder. One copy is left as it is (the new
              patch); the other is made into an older patch by hand: a gem's damage at level 20 moved, a line
              that does not scale with level moved, a gem taken out, a gem that is not in the game put in, a
              notable's number moved, a notable taken out, a base item's requirement moved, a modifier's level
              moved, an Atlas passive reworded, a unique's roll range moved. tools/diff.py is run on the two,
              and it must find exactly those changes: each one, on the card it belongs to, in the game's words,
              and not one thing more.

     node tools/dev/changes.mjs           both parts, about a second
     node tools/dev/changes.mjs --keep    leave the temporary folder behind to look at

   Writes only inside the temporary folder. */
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm, cp } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const HISTORY = join(ROOT, 'data', 'history');
const CHANGES = join(ROOT, 'data', 'changes');

// what counts as raw game code: the guard's own marks (tools/dev/guard.mjs MARKS)
const MARKS = [
  ['stat id', /(?:^|[^A-Za-z0-9_])[a-z][a-z0-9]*(?:_[a-z0-9+%]+)+(?![A-Za-z0-9_])/],
  ['[a|b] markup', /\[[^\]|]{1,60}\|[^\]]{1,60}\](?!\()/],
  ['[Tag] markup', /\[[A-Z][A-Za-z]{2,}\](?!\()/],
  ['{0} placeholder', /\{\d*(?::[^}]{0,12})?\}/],
  ['DNT marker', /\bDNT[-\w]*/],
];
const raw = s => typeof s === 'string' && MARKS.find(([, re]) => re.test(s));
const byPatch = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number);
  for(let i = 0; i < 3; i++) if(x[i] !== y[i]) return x[i] - y[i]; return 0; };
const clip = (s, n) => (s = String(s)).length > n ? s.slice(0, n - 1) + '…' : s;

async function readJSON(f){ return JSON.parse(await readFile(f, 'utf8')); }
async function patches(dir){
  try { return (await readdir(dir)).filter(n => /^0\.\d+\.\d+(\.json)?$/.test(n)).map(n => n.replace(/\.json$/, '')).sort(byPatch); }
  catch { return []; }
}
function cardKeys(index){ return new Set(index.items.map(it => it.k + ':' + it.id)); }

/* ---------- the rule ---------- */
export async function checkChanges(index){
  const have = cardKeys(index), bad = [], files = await patches(CHANGES);
  if(!files.length) return {bad, said: 'no data/changes yet'};
  const all = {}, gone = new Map();
  for(const p of files){
    all[p] = await readJSON(join(CHANGES, p + '.json'));
    for(const [k, v] of Object.entries(all[p].gone || {})) gone.set(k, p);
  }
  let rows = 0, cards = 0;
  for(const p of files){
    const c = all[p], where = 'data/changes/' + p + '.json';
    if(c.v !== p) bad.push(where + ' says it is ' + c.v);
    for(const [k, v] of Object.entries(c.gone || {})){
      if(!Array.isArray(v) || v[1] !== 'Removed in ' + p) bad.push(where + ' ' + k + ' is not marked "Removed in ' + p + '"');
      for(const x of [v[0], ...(v[2] || [])]) if(raw(x)) bad.push(where + ' ' + k + ', removed, shows raw game code: ' + clip(x, 50));
      if(have.has(k)) bad.push(where + ' marks ' + k + ' removed, and the index still has it');
    }
    for(const k of [...Object.keys(c.cards || {}), ...(c.new || [])])
      if(!have.has(k) && !gone.has(k)) bad.push(where + ' names ' + k + ', which is neither a card nor marked removed');
    for(const [k, rs] of Object.entries(c.cards || {})){
      cards++;
      for(const r of rs){
        rows++;
        const hit = r.map(raw).find(Boolean);
        if(hit) bad.push(where + ' ' + k + ' shows ' + hit[0] + ': ' + clip(r.find(raw), 60));
        if(r[1] === null && r[2] === null) bad.push(where + ' ' + k + ' has a change with nothing on either side');
      }
    }
  }
  return {bad, said: files.length + ' patches, ' + cards.toLocaleString('en') + ' cards, ' + rows.toLocaleString('en') +
    ' changes, ' + gone.size + ' removed, every one a card'};
}

/* ---------- the diff, against changes we made ---------- */
const fill = (w, v) => { const it = (Array.isArray(v) ? v : [v])[Symbol.iterator](); return w.replace(/#/g, () => String(it.next().value)); };
const whole = line => /(?<![\w.])-?\d+(?![\d.])/.test(line) && !/^Cost/.test(line);
const bump = line => line.replace(/(?<![\w.])(-?\d+)(?![\d.])/, (m, n) => String(Number(n) + 1));   // the first whole number, one up
const requires = rq => { const [l, s, d, i] = rq;
  return [l ? 'Level ' + l : '', s ? s + ' Str' : '', d ? d + ' Dex' : '', i ? i + ' Int' : ''].filter(Boolean).join(', ') || null; };
const AFFIX = {p: 'Prefix', s: 'Suffix', c: 'Corrupted'};
const tier = m => 'Modifier level ' + m.lv + ': ' + m.ls.join(' / ');

function python(args){
  const tries = process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
  return new Promise((ok, no) => {
    const go = i => execFile(tries[i], args, {cwd: ROOT, timeout: 60000}, (e, out, err) => {
      if(e && e.code === 'ENOENT' && i + 1 < tries.length) return go(i + 1);
      if(e && e.code === 'ENOENT') return no(Object.assign(new Error('no Python found'), {none: true}));
      if(e) return no(new Error(clip((err || e.message).trim().split('\n').pop(), 160)));
      ok(out);
    });
    go(0);
  });
}

export async function checkDiff(index, {keep = false} = {}){
  const bad = [], snaps = await patches(HISTORY);
  if(!snaps.length) return {bad: ['no snapshot in data/history: run python tools/snapshot.py'], said: ''};
  const latest = snaps[snaps.length - 1];
  const dir = await mkdtemp(join(tmpdir(), 'wi-changes-'));
  try {
    const NEW = join(dir, latest), OLD = join(dir, 'older');
    await cp(join(HISTORY, latest), NEW, {recursive: true});
    const snap = {};
    for(const f of await readdir(NEW)) snap[f.replace(/\.json$/, '')] = await readJSON(join(NEW, f));
    const old = JSON.parse(JSON.stringify(snap));
    const have = cardKeys(index);
    const want = {cards: {}, new: [], gone: {}, tree: {new: [], gone: []}};
    const row = (card, r) => (want.cards[card] = want.cards[card] || []).push(r);
    const sorted = o => Object.keys(o).sort();

    // gems: a level line at level 20 only, a line the same at every level, one taken out, one never in the game
    const G = snap.gems, g = old.gems;
    const lvGem = sorted(G).find(k => have.has('g:' + k) && G[k].ml >= 20 && Object.values(G[k].lv || {}).some(v => Array.isArray(v[19])));
    const w = Object.keys(G[lvGem].lv).find(x => Array.isArray(G[lvGem].lv[x][19]));
    const was = G[lvGem].lv[w][19].map(n => typeof n === 'number' ? n + 1 : n);
    g[lvGem].lv[w][19] = was;
    const at20 = G[lvGem].lv[w].filter(v => JSON.stringify(v) === JSON.stringify(G[lvGem].lv[w][19])).length;
    row('g:' + lvGem, ['Level 20', fill(w, was), fill(w, G[lvGem].lv[w][19]), '20']);
    if(at20 !== 1) bad.push('fixture: ' + lvGem + ' repeats its level 20 numbers');   // then "20" is not the whole story
    const stGem = sorted(G).find(k => k !== lvGem && have.has('g:' + k) && G[k].ml === 1 && (G[k].st || []).some(whole));
    const i = G[stGem].st.findIndex(whole);
    g[stGem].st[i] = bump(G[stGem].st[i]);
    row('g:' + stGem, ['', g[stGem].st[i], G[stGem].st[i]]);
    const newGem = sorted(G).find(k => ![lvGem, stGem].includes(k) && have.has('g:' + k));
    delete g[newGem];
    want.new.push('g:' + newGem);
    g.RetiredTestGem = {n: 'Retired Test Gem', t: 'active', ml: 1, st: ['Deals 1 to 2 Fire Damage']};
    want.gone['g:RetiredTestGem'] = ['Retired Test Gem', 'Removed in ' + latest, ['Deals 1 to 2 Fire Damage']];

    // passives: a notable's number moved, a notable taken out (a new card, and a new node on the tree)
    const P = snap.passives, pp = old.passives;
    const name1 = n => index.items.filter(it => it.k === 'p' && it.n === n).length === 1;
    const notables = sorted(P).filter(h => have.has('p:' + P[h].id) && name1(P[h].n) && P[h].ls.length === 1 && /\d/.test(P[h].ls[0]));
    const [pa, pb] = notables;
    pp[pa].ls = [bump(P[pa].ls[0])];
    row('p:' + P[pa].id, ['', pp[pa].ls[0], P[pa].ls[0]]);
    delete pp[pb];
    want.new.push('p:' + P[pb].id);
    want.tree.new.push(Number(pb));

    // a base item's requirement, a modifier's level, an Atlas passive reworded, a unique's roll range
    const B = snap.bases, bb = old.bases;
    const base = sorted(B).find(k => have.has('b:' + k) && B[k].rq && B[k].rq[1] > 1);
    bb[base].rq = [B[base].rq[0], B[base].rq[1] - 1, ...B[base].rq.slice(2)];
    row('b:' + base, ['Requires', requires(bb[base].rq), requires(B[base].rq)]);
    const M = snap.mods, mm = old.mods;
    const mod = sorted(M).find(k => M[k].on.length > 1 && M[k].on.every(c => have.has('i:' + c)) && !M[k].d && M[k].lv > 1);
    mm[mod].lv = M[mod].lv - 1;
    for(const c of M[mod].on) row('i:' + c, [AFFIX[M[mod].a], tier(mm[mod]), tier(M[mod])]);
    const A = snap.atlas, aa = old.atlas;
    const node = sorted(A).find(h => have.has('a:' + A[h].n) && index.items.filter(it => it.k === 'a' && it.n === A[h].n).length === 1
      && Object.values(A).filter(x => x.n === A[h].n).length === 1 && A[h].ls.length === 1);
    aa[node].ls = ['An older wording of this passive'];
    row('a:' + A[node].n, ['', 'An older wording of this passive', A[node].ls[0]]);
    if(snap.uniques){
      const U = snap.uniques, uu = old.uniques;
      const uq = sorted(U).find(k => have.has('u:' + k.split(' | ')[0]) && (U[k].ls || []).some(x => /\(\d+-\d+\)/.test(x)));
      const j = U[uq].ls.findIndex(x => /\(\d+-\d+\)/.test(x));
      uu[uq].ls[j] = U[uq].ls[j].replace(/\((\d+)-/, (m, n) => '(' + (Number(n) + 1) + '-');
      row('u:' + uq.split(' | ')[0], ['', uu[uq].ls[j], U[uq].ls[j]]);
    }

    await mkdir(OLD, {recursive: true});
    for(const [k, v] of Object.entries(old)) await writeFile(join(OLD, k + '.json'), JSON.stringify(v));
    const OUT = join(dir, 'out.json');
    await python([join('tools', 'diff.py'), '--old', OLD, '--new', NEW, '--out', OUT]);
    const got = await readJSON(OUT);

    // exactly these, and nothing more
    const cmp = (what, a, b) => { if(JSON.stringify(a) !== JSON.stringify(b)) bad.push(what + ': found ' + clip(JSON.stringify(a), 120) + ', made ' + clip(JSON.stringify(b), 120)); };
    const norm = o => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v.map(r => JSON.stringify(r)).sort()]).sort());
    const extra = Object.keys(got.cards).filter(k => !want.cards[k]), lost = Object.keys(want.cards).filter(k => !got.cards[k]);
    if(extra.length) bad.push('changes nobody made, on ' + extra.length + ' cards: ' + clip(extra.slice(0, 3).join(', ') + ' ' + JSON.stringify(got.cards[extra[0]]), 160));
    if(lost.length) bad.push('changes it missed, on ' + clip(lost.join(', '), 120));
    for(const k of Object.keys(want.cards)) if(got.cards[k]) cmp(k, norm({[k]: got.cards[k]}), norm({[k]: want.cards[k]}));
    cmp('new cards', [...got.new].sort(), [...want.new].sort());
    cmp('removed cards', got.gone, want.gone);
    cmp('tree nodes', got.tree, want.tree);
    const made = Object.values(want.cards).reduce((n, rs) => n + rs.length, 0);
    return {bad, said: made + ' changes made by hand on ' + Object.keys(want.cards).length + ' cards, ' + want.new.length +
      ' cards taken out, 1 put in: all found, on the right cards, nothing more'};
  } catch(e){
    if(e.none) return {bad, said: 'skipped: no Python found (python or python3)'};
    bad.push('the diff did not run: ' + clip(e.message, 160));
    return {bad, said: ''};
  } finally {
    if(keep) console.log('left in ' + dir); else await rm(dir, {recursive: true, force: true});
  }
}

if(process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]){
  const index = await readJSON(join(ROOT, 'data', 'index.json'));
  let failed = 0;
  for(const [name, run] of [['rule', () => checkChanges(index)], ['diff', () => checkDiff(index, {keep: process.argv.includes('--keep')})]]){
    const r = await run();
    if(r.bad.length) failed++;
    console.log((r.bad.length ? 'FAIL ' : 'ok   ') + (name + '      ').slice(0, 6) + (r.bad.length ? r.bad.length + ' broken: ' + r.bad.slice(0, 4).join(' | ') : r.said));
  }
  process.exit(failed ? 1 : 0);
}
