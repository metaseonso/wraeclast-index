/* data/market/, checked two ways.

     node tools/dev/marketcheck.mjs            both parts
     node tools/dev/marketcheck.mjs --files    the files only (no archive needed)
   ...or as the guard's "market" check (tools/dev/guard.mjs).

   The files. Every file tools/market_history.py wrote carries its source, the Subject to change flag and the rule
   in words; its bytes are the ones index.json says; no string in it is an internal id (a Metadata/ path, #12);
   no private league ("(PLnnnnn)") is named anywhere.

   The sums, from the raw rows. For a sample of league days (one in the league still running, one in a past
   league) it reads that day's 24 raw hours exactly as GGG sent them (wraeclast-data/cx/raw, not the derived rows
   the tool reads), works out every hour's rates and each sample currency's price again here, in its own code,
   and compares with the card files' league-day curves and inflation.json's exalted per divine. The tool rounds to
   3 and 4 significant figures, so a gap over 0.6% is a fault. Without the archive (WI_CX, else wraeclast-data/cx
   beside the repo or any folder above it) this part is skipped and says so. About 3 seconds. Writes nothing. */
import { readFile, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const MARKET = join(ROOT, 'data', 'market');
const DIV = 'Metadata/Items/Currency/CurrencyModValues', EX = 'Metadata/Items/Currency/CurrencyAddModToRare',
      CHAOS = 'Metadata/Items/Currency/CurrencyRerollRare';
const SAMPLE = ['Orb of Annulment', 'Regal Orb', 'Chaos Orb', 'Omen of Light', 'Divine Orb'];
const TOL = 0.006;

async function walk(dir, out = []){
  for(const n of (await readdir(dir)).sort()){
    const p = join(dir, n);
    if((await stat(p)).isDirectory()) await walk(p, out); else if(n.endsWith('.json')) out.push(p);
  }
  return out;
}

function archive(){
  if(process.env.WI_CX) return process.env.WI_CX;
  let d = resolve(ROOT);
  for(;;){
    const up = dirname(d);
    if(existsSync(join(up, 'wraeclast-data', 'cx'))) return join(up, 'wraeclast-data', 'cx');
    if(up === d) return null;
    d = up;
  }
}

export async function checkFiles(){
  const bad = [];
  if(!existsSync(join(MARKET, 'index.json'))) return {bad: ['data/market/index.json is missing'], said: ''};
  const index = JSON.parse(await readFile(join(MARKET, 'index.json'), 'utf8'));
  const files = await walk(MARKET);
  let bytes = 0, cards = 0;
  for(const f of files){
    const rel = 'data/market/' + f.slice(MARKET.length + 1).replace(/\\/g, '/');
    const text = await readFile(f, 'utf8');
    bytes += Buffer.byteLength(text);
    const j = JSON.parse(text);
    if(!/^Source: /.test(j.source || '')) bad.push(rel + ': no "Source: ..."');
    if(!j.flags || j.flags['Subject to change'] !== 'Depends on GGG. May change without notice.') bad.push(rel + ': no Subject to change flag');
    if(!rel.includes('/card/') && rel !== 'data/market/index.json' && !j.rule) bad.push(rel + ': no rule');
    if(rel.includes('/card/')) cards++;
    else if(rel !== 'data/market/index.json' && index.files[rel] !== Buffer.byteLength(text)) bad.push(rel + ': bytes differ from index.json');
    if(/Metadata\//.test(text)) bad.push(rel + ': carries an internal id (Metadata/...)');
    if(/\(PL\d+\)/.test(text)) bad.push(rel + ': names a private league');
  }
  // the card files are never committed (.gitignore): only where the tool has just built them are they counted
  if(cards && index.cards && index.cards.files !== cards) bad.push('index.json counts ' + index.cards.files + ' card files, ' + cards + ' are here');
  return {bad, index, said: files.length + ' files, ' + (bytes / 1000).toFixed(0) + ' kB, ' +
    (cards ? cards + ' cards' : 'no cards here (built by the daily Market job, never committed)')};
}

/* one hour, valued: the rates, then each sample currency's exalted paid and amount bought */
function hour(markets, league, ids){
  const ms = markets.filter(m => m.league === league);
  const vol = (m, x) => (m.volume_traded || {})[x] || 0;
  const both = m => vol(m, m.market_pair[0]) > 0 && vol(m, m.market_pair[1]) > 0;
  let rate = null, cpd = null, chaos = null, div = null;
  for(const m of ms){
    if(!both(m)) continue;
    const p = new Set(m.market_pair);
    if(p.has(DIV) && p.has(EX)){ rate = vol(m, EX) / vol(m, DIV); div = [vol(m, EX), vol(m, DIV)]; }
    if(p.has(DIV) && p.has(CHAOS)){ cpd = vol(m, CHAOS) / vol(m, DIV); chaos = [vol(m, DIV), vol(m, CHAOS)]; }
  }
  if(rate === null) return null;
  if(cpd === null){
    for(const m of ms){
      const p = new Set(m.market_pair);
      if(both(m) && p.has(EX) && p.has(CHAOS)){ cpd = vol(m, CHAOS) / vol(m, EX) * rate; chaos = [vol(m, EX) / rate, vol(m, CHAOS)]; }
    }
  }
  const inEx = {[EX]: 1, [DIV]: rate};
  if(cpd) inEx[CHAOS] = rate / cpd;
  const got = {};
  for(const m of ms){
    if(!both(m)) continue;
    const [a, b] = m.market_pair;
    if(a in inEx && b in inEx) continue;
    for(const [x, o] of [[a, b], [b, a]]){
      if(!(o in inEx) || !ids.has(x)) continue;
      const t = got[x] || (got[x] = [0, 0]);
      t[0] += vol(m, o) * inEx[o];
      t[1] += vol(m, x);
    }
  }
  got[DIV] = div;
  if(chaos) got[CHAOS] = [chaos[0] * rate, chaos[1]];
  return got;
}

export async function checkSums(index){
  const cx = archive();
  if(!cx || !existsSync(join(cx, 'raw'))) return {bad: [], said: 'the sums skipped: no exchange archive here'};
  const game = process.env.WI_GAME_OUT || join(dirname(cx), 'game');
  const patch = existsSync(join(game, 'raw')) ? '' : (await readdir(game)).filter(n => /^\d/.test(n)).sort().pop();
  const base = JSON.parse(await readFile(join(game, patch, patch ? 'out' : '', 'raw', 'BaseItemTypes.json'), 'utf8'));
  const idOf = {};
  for(const b of base) if(SAMPLE.includes(b.Name)) idOf[b.Name] = b.Id;
  const ids = new Set(Object.values(idOf));
  // what there is to compare with: the cards' league-day curves (#100) and inflation.json's rates (#101)
  const infl = existsSync(join(MARKET, 'inflation.json')) ? JSON.parse(await readFile(join(MARKET, 'inflation.json'), 'utf8'))
    : null;
  const cardDir = join(MARKET, 'card');
  if(!infl && !existsSync(cardDir)) return {bad: [], said: 'no sums to check yet'};
  const lgs = index.leagues;
  const cur = lgs[lgs.length - 1], past = lgs[lgs.length - 2];
  const picks = [[cur, Math.max(2, cur.days - 12)], [past, Math.min(30, past.days - 1)]];
  const bad = [];
  let compared = 0, worst = 0;
  const names = {};
  for(const f of existsSync(cardDir) ? await readdir(cardDir) : []){
    const j = JSON.parse(await readFile(join(cardDir, f), 'utf8'));
    if(SAMPLE.includes(j.n)) names[j.n] = j;
  }
  for(const [lg, day] of picks){
    const archiveName = lg.v === '0.1' ? 'Standard' : lg.name;
    const first = Date.parse(lg.first) / 1000 + (day - 1) * 86400;
    const tot = {};
    for(let h = first; h < first + 86400; h += 3600){
      const t = new Date(h * 1000).toISOString();
      const p = join(cx, 'raw', t.slice(0, 7), t.slice(8, 10) + 'T' + t.slice(11, 13) + '-' + h + '.json.gz');
      if(!existsSync(p)) continue;
      const got = hour(JSON.parse(gunzipSync(await readFile(p))).markets || [], archiveName, ids);
      if(!got) continue;
      for(const [x, v] of Object.entries(got)){
        if(!v) continue;
        const s = tot[x] || (tot[x] = [0, 0]);
        s[0] += v[0]; s[1] += v[1];
      }
    }
    const rate = tot[DIV] ? tot[DIV][0] / tot[DIV][1] : null;
    const row = infl && (infl.leagues.find(x => x.league === lg.name) || {days: []}).days.find(r => r[0] === day);
    const cmp = (what, mine, theirs) => {
      if(mine == null || theirs == null){ bad.push(what + ': ' + mine + ' here, ' + theirs + ' in the file'); return; }
      const gap = Math.abs(mine / theirs - 1);
      worst = Math.max(worst, gap);
      compared++;
      if(gap > TOL) bad.push(what + ': ' + mine.toPrecision(4) + ' from the raw rows, ' + theirs + ' in the file');
    };
    if(infl) cmp(lg.name + ' day ' + day + ' exalted per divine', rate, row && row[2]);
    for(const n of SAMPLE){
      const c = names[n];
      if(!c || !c.days) continue;
      const curve = c && (c.days || []).find(x => x[0] === lg.name);
      const v = tot[idOf[n]];
      const mine = v && v[1] ? v[0] / v[1] / (n === 'Divine Orb' ? 1 : rate) : null;
      cmp(lg.name + ' day ' + day + ' ' + n, mine, curve ? curve[1][day - 1] : null);
    }
  }
  return {bad, said: compared + ' sums from the raw rows (' + picks.map(p => p[0].name + ' day ' + p[1]).join(', ') +
    '), worst gap ' + (worst * 100).toFixed(2) + '%'};
}

export async function checkMarket({files = false} = {}){
  const f = await checkFiles();
  if(f.bad.length || files) return {bad: f.bad, said: f.said};
  const s = await checkSums(f.index);
  return {bad: s.bad, said: f.said + ' · ' + s.said};
}

if(import.meta.url === 'file:///' + (process.argv[1] || '').replace(/\\/g, '/').replace(/^\//, '')){
  const r = await checkMarket({files: process.argv.includes('--files')});
  for(const b of r.bad) console.log('FAIL ' + b);
  console.log(r.bad.length ? r.bad.length + ' broken' : 'ok   market  ' + r.said);
  process.exit(r.bad.length ? 1 : 0);
}
